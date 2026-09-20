-- Run as the application schema owner (e.g. POS_APP) using SQL*Plus / SQLcl:
--   sql pos_app/<password>@//host:1521/service @run_all.sql
-- Prerequisites: GRANT EXECUTE ON DBMS_CRYPTO TO pos_app;  ORDS installed and schema REST-enabled.
--
-- Order matters: Phase 2 schema (08) runs right after the Phase 1 schema because the Phase 1
-- packages now reference Phase 2 columns/tables (min_spend_shortfall, user_branches …).
-- Package bodies reference each other across files, so the schema is recompiled once at the end.
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

PROMPT === 01 Phase 1 schema
@01_schema.sql
PROMPT === 08 Phase 2 schema (additive)
@08_phase2_schema.sql
PROMPT === 02 core packages
@02_pkg_core.sql
PROMPT === 03 menu / offers / tables
@03_pkg_menu_tables.sql
PROMPT === 04 orders / tickets
@04_pkg_orders.sql
PROMPT === 05 billing / payments / reports / users
@05_pkg_billing.sql
PROMPT === 09 Phase 2 packages
@09a_pkg_branch_inventory.sql
@09b_pkg_purchasing.sql
@09c_pkg_crm_loyalty.sql
@09d_pkg_reservations_club_vip.sql
@09e_pkg_notify_reports.sql
PROMPT === 06 router + ORDS module
@06_ords_modules.sql
PROMPT === 09f Phase 2 router
@09f_pkg_router2.sql

-- resolve cross-file references (order_pkg ↔ ticket_pkg, billing ↔ inventory/loyalty/vip, router ↔ router2 …)
BEGIN DBMS_UTILITY.COMPILE_SCHEMA(schema => USER, compile_all => FALSE); END;
/
BEGIN DBMS_UTILITY.COMPILE_SCHEMA(schema => USER, compile_all => FALSE); END;
/
PROMPT === invalid objects (must be empty)
SELECT object_name, object_type, status FROM user_objects WHERE status <> 'VALID';

PROMPT === 07 Phase 1 seed data
@07_seed.sql
PROMPT === 10 Phase 2 seed data
@10_phase2_seed.sql

SELECT 'orders: ' || COUNT(*) FROM orders;
SELECT 'bills: '  || COUNT(*) FROM bills;
SELECT 'inventory items: ' || COUNT(*) FROM inventory_items;
SELECT 'notifications: ' || COUNT(*) FROM notifications;
PROMPT Done.
