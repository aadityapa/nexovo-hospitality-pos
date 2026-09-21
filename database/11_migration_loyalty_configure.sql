-- =====================================================================
-- MIGRATION — split `loyalty:manage` into member operations and program
--             configuration.
--
-- Applies to EXISTING installations. A fresh install gets the same end state
-- from 10_phase2_seed.sql and must NOT run this file (running it anyway is
-- harmless — every statement below is idempotent — but it is not part of
-- run_all.sql, because a migration that silently joins a fresh install is a
-- migration nobody can reason about later).
--
-- WHY
-- ---
-- `loyalty:manage` meant two things at once:
--
--   * adjust a member's points — a daily, audited, reversible service gesture
--     that a floor manager has to be able to make at the table; and
--   * rewrite the program's rules — earn rate, point value, redemption limits,
--     tiers, expiry — which retrospectively re-prices every point every member
--     is holding.
--
-- After this migration:
--
--   loyalty:view       see the program and permitted member information
--   loyalty:manage     member operations, including point adjustments
--   loyalty:configure  edit program rules, earning, redemption, tiers, expiry, limits
--   loyalty:redeem     redeem points against a bill
--
-- WHAT HAPPENS TO WHOM
-- --------------------
--   SUPER_ADMIN, ADMIN   gain `loyalty:configure`. No change in capability.
--   MANAGER              keeps view + manage + redeem. Does NOT gain
--                        `loyalty:configure`. This is a deliberate, authorised
--                        REDUCTION: a manager can no longer rewrite program
--                        rules. It is the only capability any built-in role
--                        loses, and it is the point of the migration.
--   CASHIER / WAITER /   never held `loyalty:manage`. Untouched.
--   KITCHEN / BAR / HOST
--   CUSTOM ROLES         any non-system role that currently holds
--                        `loyalty:manage` GAINS `loyalty:configure`, because
--                        that is what it could already do. Splitting a
--                        permission must not quietly take capability away from
--                        a role somebody configured deliberately; if an
--                        operator wants a custom role restricted the way
--                        MANAGER now is, they revoke `loyalty:configure` from
--                        it in Roles & permissions, and section 5 below prints
--                        exactly which roles to look at.
--
-- REVERSIBILITY
-- -------------
-- Section 6 contains the rollback. It restores the pre-migration behaviour by
-- granting `loyalty:configure` to every holder of `loyalty:manage` (including
-- MANAGER), which is what `loyalty:manage` used to imply.
--
-- Run as the application schema owner. Safe to re-run.
-- =====================================================================
SET DEFINE OFF;
SET SERVEROUTPUT ON SIZE UNLIMITED;

-- 1. The new permission ------------------------------------------------------
DECLARE
  l_cnt NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_cnt FROM permissions WHERE permission_code = 'loyalty:configure';
  IF l_cnt = 0 THEN
    INSERT INTO permissions (permission_code, module_name, description)
    VALUES ('loyalty:configure', 'loyalty', 'Edit program rules, earning, redemption, tiers, expiry, limits');
    DBMS_OUTPUT.PUT_LINE('added permission loyalty:configure');
  ELSE
    DBMS_OUTPUT.PUT_LINE('permission loyalty:configure already present');
  END IF;
END;
/

-- 2. Re-word `loyalty:manage` so the two are distinguishable in the role editor
UPDATE permissions
   SET description = 'Member operations, incl. point adjustments'
 WHERE permission_code = 'loyalty:manage'
   AND description <> 'Member operations, incl. point adjustments';

-- 3. Administrators keep full capability ------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r, permissions p
 WHERE r.role_code IN ('SUPER_ADMIN', 'ADMIN')
   AND p.permission_code = 'loyalty:configure'
   AND NOT EXISTS (SELECT 1 FROM role_permissions x
                    WHERE x.role_id = r.role_id AND x.permission_id = p.permission_id);

-- 4. Custom roles keep what they already had ---------------------------------
--    Any NON-SYSTEM role holding `loyalty:manage` could configure the program
--    before this migration, so it is granted `loyalty:configure` to preserve
--    that. System roles are excluded: their grants are decided above and in
--    10_phase2_seed.sql, and MANAGER's exclusion is the whole point.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, cfg.permission_id
  FROM roles r
  JOIN role_permissions rp ON rp.role_id = r.role_id
  JOIN permissions mng     ON mng.permission_id = rp.permission_id AND mng.permission_code = 'loyalty:manage'
 CROSS JOIN (SELECT permission_id FROM permissions WHERE permission_code = 'loyalty:configure') cfg
 WHERE NVL(r.is_system, 'N') <> 'Y'
   AND NOT EXISTS (SELECT 1 FROM role_permissions x
                    WHERE x.role_id = r.role_id AND x.permission_id = cfg.permission_id);

-- 5. Report — what changed, and what an operator should review ---------------
DECLARE
  l_any BOOLEAN := FALSE;
BEGIN
  DBMS_OUTPUT.PUT_LINE('--- loyalty:configure holders after migration ---');
  FOR r IN (SELECT ro.role_code, ro.role_name, NVL(ro.is_system, 'N') sys
              FROM roles ro
              JOIN role_permissions rp ON rp.role_id = ro.role_id
              JOIN permissions p       ON p.permission_id = rp.permission_id
             WHERE p.permission_code = 'loyalty:configure'
             ORDER BY ro.role_code) LOOP
    DBMS_OUTPUT.PUT_LINE('  ' || RPAD(r.role_code, 18) || CASE WHEN r.sys = 'Y' THEN 'system' ELSE 'CUSTOM — review' END);
    IF r.sys <> 'Y' THEN l_any := TRUE; END IF;
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('--- roles that manage members but cannot configure ---');
  FOR r IN (SELECT ro.role_code
              FROM roles ro
              JOIN role_permissions rp ON rp.role_id = ro.role_id
              JOIN permissions p       ON p.permission_id = rp.permission_id AND p.permission_code = 'loyalty:manage'
             WHERE NOT EXISTS (SELECT 1 FROM role_permissions x
                                 JOIN permissions c ON c.permission_id = x.permission_id
                                WHERE x.role_id = ro.role_id AND c.permission_code = 'loyalty:configure')
             ORDER BY ro.role_code) LOOP
    DBMS_OUTPUT.PUT_LINE('  ' || r.role_code);
  END LOOP;

  IF l_any THEN
    DBMS_OUTPUT.PUT_LINE('NOTE: the custom roles above kept the configuration capability they already had.');
    DBMS_OUTPUT.PUT_LINE('      Revoke loyalty:configure from them in Roles & permissions if that is not intended.');
  END IF;
END;
/

COMMIT;

-- 6. ROLLBACK (not executed — uncomment deliberately) -------------------------
--    Restores pre-migration behaviour: everyone who can manage members can
--    configure the program again, which is what `loyalty:manage` used to mean.
--
-- INSERT INTO role_permissions (role_id, permission_id)
-- SELECT r.role_id, cfg.permission_id
--   FROM roles r
--   JOIN role_permissions rp ON rp.role_id = r.role_id
--   JOIN permissions mng     ON mng.permission_id = rp.permission_id AND mng.permission_code = 'loyalty:manage'
--  CROSS JOIN (SELECT permission_id FROM permissions WHERE permission_code = 'loyalty:configure') cfg
--  WHERE NOT EXISTS (SELECT 1 FROM role_permissions x
--                     WHERE x.role_id = r.role_id AND x.permission_id = cfg.permission_id);
-- COMMIT;
--
--    To remove the permission entirely, also revert `loyalty_pkg.save_program`
--    and `router2_pkg` to assert 'loyalty:manage', then:
-- DELETE FROM role_permissions WHERE permission_id = (SELECT permission_id FROM permissions WHERE permission_code = 'loyalty:configure');
-- DELETE FROM permissions WHERE permission_code = 'loyalty:configure';
-- COMMIT;
