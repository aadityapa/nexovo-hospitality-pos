-- =====================================================================
-- Core packages: API_PKG (envelope/errors), AUDIT_PKG, NUMBERING_PKG, SEC_PKG
-- =====================================================================

-- ---------------------------------------------------------------------
-- API_PKG: standard envelope, error raising, context (current user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE api_pkg AS
  -- application error numbers → HTTP codes (mapped in ORDS handlers)
  c_err_validation   CONSTANT PLS_INTEGER := -20400;
  c_err_unauth       CONSTANT PLS_INTEGER := -20401;
  c_err_forbidden    CONSTANT PLS_INTEGER := -20403;
  c_err_not_found    CONSTANT PLS_INTEGER := -20404;
  c_err_conflict     CONSTANT PLS_INTEGER := -20409;
  c_err_business     CONSTANT PLS_INTEGER := -20422;

  PROCEDURE raise_validation(p_msg VARCHAR2, p_field VARCHAR2 DEFAULT NULL);
  PROCEDURE raise_unauth(p_msg VARCHAR2 DEFAULT 'Authentication required');
  PROCEDURE raise_forbidden(p_msg VARCHAR2 DEFAULT 'You do not have permission to perform this action');
  PROCEDURE raise_not_found(p_msg VARCHAR2 DEFAULT 'Resource not found');
  PROCEDURE raise_conflict(p_msg VARCHAR2);
  PROCEDURE raise_business(p_msg VARCHAR2);

  FUNCTION http_status_for(p_sqlcode PLS_INTEGER) RETURN PLS_INTEGER;
  FUNCTION success(p_message VARCHAR2, p_data JSON_ELEMENT_T) RETURN CLOB;
  FUNCTION failure(p_message VARCHAR2, p_errors JSON_ARRAY_T DEFAULT NULL) RETURN CLOB;
  FUNCTION clean_error_message(p_sqlerrm VARCHAR2) RETURN VARCHAR2;

  -- request context (set by ORDS handler after SEC_PKG.authenticate)
  PROCEDURE set_context(p_user_id NUMBER, p_branch_id NUMBER);
  FUNCTION current_user_id RETURN NUMBER;
  FUNCTION current_branch_id RETURN NUMBER;
  FUNCTION ts_iso(p_ts TIMESTAMP) RETURN VARCHAR2;
  FUNCTION yn(p_bool BOOLEAN) RETURN CHAR;
  FUNCTION is_y(p_flag CHAR) RETURN BOOLEAN;
END api_pkg;
/

CREATE OR REPLACE PACKAGE BODY api_pkg AS
  g_user_id   NUMBER;
  g_branch_id NUMBER;

  PROCEDURE raise_validation(p_msg VARCHAR2, p_field VARCHAR2 DEFAULT NULL) IS
  BEGIN
    RAISE_APPLICATION_ERROR(c_err_validation, CASE WHEN p_field IS NOT NULL THEN p_field||'|' END || p_msg);
  END;
  PROCEDURE raise_unauth(p_msg VARCHAR2) IS BEGIN RAISE_APPLICATION_ERROR(c_err_unauth, p_msg); END;
  PROCEDURE raise_forbidden(p_msg VARCHAR2) IS BEGIN RAISE_APPLICATION_ERROR(c_err_forbidden, p_msg); END;
  PROCEDURE raise_not_found(p_msg VARCHAR2) IS BEGIN RAISE_APPLICATION_ERROR(c_err_not_found, p_msg); END;
  PROCEDURE raise_conflict(p_msg VARCHAR2) IS BEGIN RAISE_APPLICATION_ERROR(c_err_conflict, p_msg); END;
  PROCEDURE raise_business(p_msg VARCHAR2) IS BEGIN RAISE_APPLICATION_ERROR(c_err_business, p_msg); END;

  FUNCTION http_status_for(p_sqlcode PLS_INTEGER) RETURN PLS_INTEGER IS
  BEGIN
    RETURN CASE p_sqlcode
      WHEN c_err_validation THEN 400 WHEN c_err_unauth THEN 401 WHEN c_err_forbidden THEN 403
      WHEN c_err_not_found THEN 404 WHEN c_err_conflict THEN 409 WHEN c_err_business THEN 422
      ELSE 500 END;
  END;

  FUNCTION success(p_message VARCHAR2, p_data JSON_ELEMENT_T) RETURN CLOB IS
    l_obj JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    l_obj.put('success', TRUE);
    l_obj.put('message', p_message);
    IF p_data IS NULL THEN l_obj.put_null('data'); ELSE l_obj.put('data', p_data); END IF;
    RETURN l_obj.to_clob;
  END;

  FUNCTION failure(p_message VARCHAR2, p_errors JSON_ARRAY_T DEFAULT NULL) RETURN CLOB IS
    l_obj  JSON_OBJECT_T := JSON_OBJECT_T();
    l_errs JSON_ARRAY_T  := p_errors;
  BEGIN
    IF l_errs IS NULL THEN l_errs := JSON_ARRAY_T(); END IF;
    l_obj.put('success', FALSE);
    l_obj.put('message', p_message);
    l_obj.put('errors', l_errs);
    RETURN l_obj.to_clob;
  END;

  -- "ORA-20400: field|message" -> "message"
  FUNCTION clean_error_message(p_sqlerrm VARCHAR2) RETURN VARCHAR2 IS
    l_msg VARCHAR2(4000) := REGEXP_REPLACE(p_sqlerrm, '^ORA-\d+: ', '');
  BEGIN
    l_msg := REGEXP_REPLACE(l_msg, '\s*ORA-\d+.*$', '');
    IF INSTR(l_msg, '|') > 0 THEN l_msg := SUBSTR(l_msg, INSTR(l_msg, '|') + 1); END IF;
    RETURN l_msg;
  END;

  PROCEDURE set_context(p_user_id NUMBER, p_branch_id NUMBER) IS
  BEGIN g_user_id := p_user_id; g_branch_id := p_branch_id; END;
  FUNCTION current_user_id RETURN NUMBER IS BEGIN RETURN g_user_id; END;
  FUNCTION current_branch_id RETURN NUMBER IS BEGIN RETURN NVL(g_branch_id, 1); END;
  FUNCTION ts_iso(p_ts TIMESTAMP) RETURN VARCHAR2 IS
  BEGIN
    IF p_ts IS NULL THEN RETURN NULL; END IF;
    RETURN TO_CHAR(SYS_EXTRACT_UTC(FROM_TZ(p_ts, SESSIONTIMEZONE)), 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"');
  END;
  FUNCTION yn(p_bool BOOLEAN) RETURN CHAR IS BEGIN RETURN CASE WHEN p_bool THEN 'Y' ELSE 'N' END; END;
  FUNCTION is_y(p_flag CHAR) RETURN BOOLEAN IS BEGIN RETURN p_flag = 'Y'; END;
END api_pkg;
/

-- ---------------------------------------------------------------------
-- AUDIT_PKG
-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE audit_pkg AS
  PROCEDURE log(p_action VARCHAR2, p_entity VARCHAR2, p_entity_id NUMBER,
                p_old CLOB DEFAULT NULL, p_new CLOB DEFAULT NULL);
  PROCEDURE emit_event(p_topic VARCHAR2, p_event_type VARCHAR2, p_entity_id NUMBER, p_payload CLOB DEFAULT NULL);
END audit_pkg;
/
CREATE OR REPLACE PACKAGE BODY audit_pkg AS
  PROCEDURE log(p_action VARCHAR2, p_entity VARCHAR2, p_entity_id NUMBER, p_old CLOB, p_new CLOB) IS
    PRAGMA AUTONOMOUS_TRANSACTION;   -- audit survives even if caller rolls back a later step
  BEGIN
    INSERT INTO audit_logs (branch_id, user_id, action_code, entity_name, entity_id, old_value, new_value)
    VALUES (api_pkg.current_branch_id, api_pkg.current_user_id, p_action, p_entity, p_entity_id, p_old, p_new);
    COMMIT;
  END;

  PROCEDURE emit_event(p_topic VARCHAR2, p_event_type VARCHAR2, p_entity_id NUMBER, p_payload CLOB) IS
  BEGIN
    INSERT INTO realtime_events (branch_id, topic, event_type, entity_id, payload)
    VALUES (api_pkg.current_branch_id, p_topic, p_event_type, p_entity_id, p_payload);
  END;
END audit_pkg;
/

-- ---------------------------------------------------------------------
-- NUMBERING_PKG: ORD-YYYYMMDD-0001 etc. Safe under concurrency (row lock).
-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE numbering_pkg AS
  FUNCTION next_number(p_doc_type VARCHAR2, p_prefix VARCHAR2) RETURN VARCHAR2;
  FUNCTION next_order_number RETURN VARCHAR2;
  FUNCTION next_bill_number RETURN VARCHAR2;
  FUNCTION next_payment_number RETURN VARCHAR2;
  FUNCTION next_ticket_number(p_location VARCHAR2) RETURN VARCHAR2;
END numbering_pkg;
/
CREATE OR REPLACE PACKAGE BODY numbering_pkg AS
  FUNCTION next_number(p_doc_type VARCHAR2, p_prefix VARCHAR2) RETURN VARCHAR2 IS
    l_today DATE := TRUNC(SYSDATE);
    l_no    NUMBER;
  BEGIN
    -- ensure row exists (idempotent), then lock it
    BEGIN
      INSERT INTO doc_sequences (doc_type, seq_date, last_no) VALUES (p_doc_type, l_today, 0);
    EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL; END;

    SELECT last_no INTO l_no FROM doc_sequences
     WHERE doc_type = p_doc_type AND seq_date = l_today FOR UPDATE;
    l_no := l_no + 1;
    UPDATE doc_sequences SET last_no = l_no WHERE doc_type = p_doc_type AND seq_date = l_today;
    RETURN p_prefix || '-' || TO_CHAR(l_today, 'YYYYMMDD') || '-' || LPAD(l_no, 4, '0');
  END;
  FUNCTION next_order_number RETURN VARCHAR2 IS BEGIN RETURN next_number('ORD', 'ORD'); END;
  FUNCTION next_bill_number RETURN VARCHAR2 IS BEGIN RETURN next_number('BILL', 'BILL'); END;
  FUNCTION next_payment_number RETURN VARCHAR2 IS BEGIN RETURN next_number('PAY', 'PAY'); END;
  FUNCTION next_ticket_number(p_location VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN p_location = 'BAR' THEN next_number('BOT', 'BOT') ELSE next_number('KOT', 'KOT') END;
  END;
END numbering_pkg;
/

-- ---------------------------------------------------------------------
-- SEC_PKG: passwords, login/logout, sessions, permission checks
-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE sec_pkg AS
  c_iterations CONSTANT PLS_INTEGER := 10000;

  FUNCTION hash_password(p_password VARCHAR2, p_salt RAW) RETURN RAW;
  FUNCTION new_salt RETURN RAW;
  PROCEDURE set_password(p_user_id NUMBER, p_password VARCHAR2);
  PROCEDURE set_approval_pin(p_user_id NUMBER, p_pin VARCHAR2);
  FUNCTION verify_pin(p_user_id NUMBER, p_pin VARCHAR2) RETURN BOOLEAN;

  FUNCTION login(p_username VARCHAR2, p_password VARCHAR2, p_remember BOOLEAN,
                 p_ip VARCHAR2 DEFAULT NULL, p_agent VARCHAR2 DEFAULT NULL) RETURN JSON_OBJECT_T;
  PROCEDURE logout(p_token VARCHAR2);
  -- validates token, sets api_pkg context, returns user_id (raises 401)
  FUNCTION authenticate(p_bearer VARCHAR2) RETURN NUMBER;
  FUNCTION has_permission(p_user_id NUMBER, p_permission VARCHAR2) RETURN BOOLEAN;
  PROCEDURE assert_permission(p_permission VARCHAR2);
  FUNCTION user_json(p_user_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION user_max_discount(p_user_id NUMBER) RETURN NUMBER;
  FUNCTION user_has_role(p_user_id NUMBER, p_role_code VARCHAR2) RETURN BOOLEAN;
END sec_pkg;
/
CREATE OR REPLACE PACKAGE BODY sec_pkg AS

  FUNCTION hash_password(p_password VARCHAR2, p_salt RAW) RETURN RAW IS
    l_hash RAW(64) := UTL_RAW.CAST_TO_RAW(p_password);
  BEGIN
    FOR i IN 1..c_iterations LOOP
      l_hash := DBMS_CRYPTO.HASH(UTL_RAW.CONCAT(l_hash, p_salt), DBMS_CRYPTO.HASH_SH512);
    END LOOP;
    RETURN l_hash;
  END;

  FUNCTION new_salt RETURN RAW IS BEGIN RETURN DBMS_CRYPTO.RANDOMBYTES(32); END;

  PROCEDURE set_password(p_user_id NUMBER, p_password VARCHAR2) IS
    l_salt RAW(32) := new_salt;
  BEGIN
    IF p_password IS NULL OR LENGTH(p_password) < 6 THEN
      api_pkg.raise_validation('Password must be at least 6 characters', 'password');
    END IF;
    UPDATE users SET password_salt = l_salt, password_hash = hash_password(p_password, l_salt),
           updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
     WHERE user_id = p_user_id;
    audit_pkg.log('USER_PASSWORD_CHANGED', 'USERS', p_user_id);
  END;

  PROCEDURE set_approval_pin(p_user_id NUMBER, p_pin VARCHAR2) IS
    l_salt RAW(32);
  BEGIN
    SELECT password_salt INTO l_salt FROM users WHERE user_id = p_user_id;
    UPDATE users SET approval_pin_hash = hash_password(p_pin, l_salt) WHERE user_id = p_user_id;
  END;

  FUNCTION verify_pin(p_user_id NUMBER, p_pin VARCHAR2) RETURN BOOLEAN IS
    l_salt RAW(32); l_hash RAW(64);
  BEGIN
    SELECT password_salt, approval_pin_hash INTO l_salt, l_hash FROM users WHERE user_id = p_user_id;
    RETURN l_hash IS NOT NULL AND l_hash = hash_password(p_pin, l_salt);
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN FALSE;
  END;

  FUNCTION token_hash(p_token VARCHAR2) RETURN RAW IS
  BEGIN RETURN DBMS_CRYPTO.HASH(UTL_RAW.CAST_TO_RAW(p_token), DBMS_CRYPTO.HASH_SH256); END;

  FUNCTION user_json(p_user_id NUMBER) RETURN JSON_OBJECT_T IS
    l_u users%ROWTYPE;
    l_obj JSON_OBJECT_T := JSON_OBJECT_T();
    l_roles JSON_ARRAY_T := JSON_ARRAY_T();
    l_perms JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    SELECT * INTO l_u FROM users WHERE user_id = p_user_id;
    FOR r IN (SELECT r.role_code FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id WHERE ur.user_id = p_user_id ORDER BY r.role_id) LOOP
      l_roles.append(r.role_code);
    END LOOP;
    FOR p IN (SELECT permission_code FROM v_user_permissions WHERE user_id = p_user_id ORDER BY 1) LOOP
      l_perms.append(p.permission_code);
    END LOOP;
    l_obj.put('id', l_u.user_id);
    l_obj.put('username', l_u.username);
    l_obj.put('email', l_u.email);
    l_obj.put('fullName', l_u.full_name);
    l_obj.put('phone', l_u.phone);
    l_obj.put('branchId', l_u.branch_id);
    l_obj.put('roles', l_roles);
    l_obj.put('permissions', l_perms);
    l_obj.put('isActive', l_u.is_active = 'Y');
    l_obj.put('maxDiscountPercent', user_max_discount(p_user_id));
    l_obj.put('lastLoginAt', api_pkg.ts_iso(l_u.last_login_at));
    l_obj.put('createdAt', api_pkg.ts_iso(l_u.created_at));
    -- Phase 2: branches the user may switch to (SUPER_ADMIN → all); current context branch
    DECLARE l_branches JSON_ARRAY_T := JSON_ARRAY_T(); l_super NUMBER;
    BEGIN
      SELECT COUNT(*) INTO l_super FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id WHERE ur.user_id = p_user_id AND r.role_code = 'SUPER_ADMIN';
      IF l_super > 0 THEN
        FOR b IN (SELECT branch_id FROM branches WHERE is_active = 'Y' ORDER BY branch_id) LOOP l_branches.append(b.branch_id); END LOOP;
      ELSE
        FOR b IN (SELECT branch_id FROM user_branches WHERE user_id = p_user_id ORDER BY is_default DESC, branch_id) LOOP l_branches.append(b.branch_id); END LOOP;
      END IF;
      l_obj.put('branchIds', l_branches);
      l_obj.put('currentBranchId', NVL(api_pkg.current_branch_id, l_u.branch_id));
    END;
    RETURN l_obj;
  END;

  FUNCTION login(p_username VARCHAR2, p_password VARCHAR2, p_remember BOOLEAN,
                 p_ip VARCHAR2, p_agent VARCHAR2) RETURN JSON_OBJECT_T IS
    l_u      users%ROWTYPE;
    l_token  VARCHAR2(64);
    l_exp    TIMESTAMP;
    l_res    JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    IF p_username IS NULL OR p_password IS NULL THEN
      api_pkg.raise_validation('Username and password are required');
    END IF;
    BEGIN
      SELECT * INTO l_u FROM users
       WHERE (LOWER(username) = LOWER(p_username) OR LOWER(email) = LOWER(p_username))
         AND is_deleted = 'N';
    EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_unauth('Invalid username or password');
    END;
    IF l_u.is_active = 'N' THEN api_pkg.raise_unauth('Account is disabled'); END IF;
    IF l_u.locked_until IS NOT NULL AND l_u.locked_until > SYSTIMESTAMP THEN
      api_pkg.raise_unauth('Account temporarily locked. Try again later.');
    END IF;
    IF hash_password(p_password, l_u.password_salt) <> l_u.password_hash THEN
      UPDATE users SET failed_logins = failed_logins + 1,
             locked_until = CASE WHEN failed_logins + 1 >= 5 THEN SYSTIMESTAMP + INTERVAL '15' MINUTE END
       WHERE user_id = l_u.user_id;
      COMMIT;
      api_pkg.raise_unauth('Invalid username or password');
    END IF;

    l_token := LOWER(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(32)));
    l_exp   := SYSTIMESTAMP + CASE WHEN p_remember THEN INTERVAL '30' DAY ELSE INTERVAL '24' HOUR END;
    INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
    VALUES (l_u.user_id, token_hash(l_token), l_exp, p_ip, p_agent);
    UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = SYSTIMESTAMP WHERE user_id = l_u.user_id;

    api_pkg.set_context(l_u.user_id, l_u.branch_id);
    audit_pkg.log('LOGIN', 'USERS', l_u.user_id);

    l_res.put('token', l_token);
    l_res.put('expiresAt', api_pkg.ts_iso(l_exp));
    l_res.put('user', user_json(l_u.user_id));
    RETURN l_res;
  END;

  PROCEDURE logout(p_token VARCHAR2) IS
  BEGIN
    UPDATE user_sessions SET revoked_at = SYSTIMESTAMP WHERE token_hash = token_hash(p_token) AND revoked_at IS NULL;
    audit_pkg.log('LOGOUT', 'USERS', api_pkg.current_user_id);
  END;

  FUNCTION authenticate(p_bearer VARCHAR2) RETURN NUMBER IS
    l_token   VARCHAR2(200) := TRIM(REGEXP_REPLACE(p_bearer, '^Bearer\s+', '', 1, 1, 'i'));
    l_user_id NUMBER; l_branch NUMBER;
  BEGIN
    IF l_token IS NULL THEN api_pkg.raise_unauth; END IF;
    BEGIN
      SELECT s.user_id, u.branch_id INTO l_user_id, l_branch
        FROM user_sessions s JOIN users u ON u.user_id = s.user_id
       WHERE s.token_hash = token_hash(l_token) AND s.revoked_at IS NULL AND s.expires_at > SYSTIMESTAMP
         AND u.is_active = 'Y' AND u.is_deleted = 'N';
    EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_unauth('Session expired or invalid');
    END;
    api_pkg.set_context(l_user_id, l_branch);
    RETURN l_user_id;
  END;

  FUNCTION has_permission(p_user_id NUMBER, p_permission VARCHAR2) RETURN BOOLEAN IS
    l_cnt NUMBER;
  BEGIN
    SELECT COUNT(*) INTO l_cnt FROM v_user_permissions WHERE user_id = p_user_id AND permission_code = p_permission;
    RETURN l_cnt > 0;
  END;

  PROCEDURE assert_permission(p_permission VARCHAR2) IS
  BEGIN
    IF api_pkg.current_user_id IS NULL THEN api_pkg.raise_unauth; END IF;
    IF NOT has_permission(api_pkg.current_user_id, p_permission) THEN
      api_pkg.raise_forbidden('Missing permission: ' || p_permission);
    END IF;
  END;

  FUNCTION user_max_discount(p_user_id NUMBER) RETURN NUMBER IS
    l_max NUMBER;
  BEGIN
    SELECT NVL(MAX(r.max_discount_pct), 0) INTO l_max
      FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id WHERE ur.user_id = p_user_id;
    RETURN l_max;
  END;

  FUNCTION user_has_role(p_user_id NUMBER, p_role_code VARCHAR2) RETURN BOOLEAN IS
    l_cnt NUMBER;
  BEGIN
    SELECT COUNT(*) INTO l_cnt FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
     WHERE ur.user_id = p_user_id AND r.role_code = p_role_code;
    RETURN l_cnt > 0;
  END;
END sec_pkg;
/
