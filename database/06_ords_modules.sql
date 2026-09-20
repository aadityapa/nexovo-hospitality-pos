-- =====================================================================
-- API_ROUTER_PKG: single dispatcher that maps (method, path) → package calls
-- + ORDS module definition (all templates call the dispatcher).
-- Path style inside the router: '/orders/{id}/items' with numeric segments extracted.
-- NOTE: SETTINGS_PKG's spec is declared first because API_ROUTER_PKG's body calls
--       it (the SETTINGS_PKG body follows further below).
-- =====================================================================

CREATE OR REPLACE PACKAGE settings_pkg AS
  FUNCTION branch_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  PROCEDURE update_branch(p_body JSON_OBJECT_T);
  PROCEDURE save_tax_group(p_id NUMBER, p_body JSON_OBJECT_T);
  FUNCTION audit_logs(p_entity VARCHAR2, p_from TIMESTAMP, p_to TIMESTAMP, p_page NUMBER, p_size NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION events_since(p_since TIMESTAMP) RETURN JSON_ARRAY_T;
END settings_pkg;
/

CREATE OR REPLACE PACKAGE api_router_pkg AS
  PROCEDURE dispatch(p_method VARCHAR2, p_path VARCHAR2, p_query VARCHAR2, p_body CLOB, p_auth VARCHAR2,
                     o_status OUT PLS_INTEGER, o_body OUT CLOB, p_branch VARCHAR2 DEFAULT NULL);
  -- query-string accessors for the current request (shared with API_ROUTER2_PKG)
  FUNCTION q(p VARCHAR2) RETURN VARCHAR2;
  FUNCTION qn(p VARCHAR2) RETURN NUMBER;
  FUNCTION qb(p VARCHAR2) RETURN BOOLEAN;
  FUNCTION qts(p VARCHAR2) RETURN TIMESTAMP;
  FUNCTION seg(p_path VARCHAR2, p_n PLS_INTEGER) RETURN VARCHAR2;
END api_router_pkg;
/

-- API_ROUTER2_PKG spec (Phase 2 routes) — body in 09f
CREATE OR REPLACE PACKAGE api_router2_pkg AS
  PROCEDURE dispatch(p_key VARCHAR2, p_path VARCHAR2, b IN OUT NOCOPY JSON_OBJECT_T, p_id NUMBER, p_id2 NUMBER, p_from TIMESTAMP, p_to TIMESTAMP,
                     d IN OUT NOCOPY JSON_ELEMENT_T, l_msg IN OUT NOCOPY VARCHAR2, o_status IN OUT NOCOPY PLS_INTEGER);
END api_router2_pkg;
/
CREATE OR REPLACE PACKAGE BODY api_router_pkg AS

  TYPE t_params IS TABLE OF VARCHAR2(4000) INDEX BY VARCHAR2(60);
  g_q t_params;

  PROCEDURE parse_query(p_query VARCHAR2) IS
    l_pair VARCHAR2(4000); l_key VARCHAR2(60); l_val VARCHAR2(4000);
  BEGIN
    g_q.DELETE;
    IF p_query IS NULL THEN RETURN; END IF;
    FOR i IN 1 .. REGEXP_COUNT(p_query, '[^&]+') LOOP
      l_pair := REGEXP_SUBSTR(p_query, '[^&]+', 1, i);
      l_key := SUBSTR(l_pair, 1, INSTR(l_pair, '=') - 1);
      l_val := UTL_URL.UNESCAPE(REPLACE(SUBSTR(l_pair, INSTR(l_pair, '=') + 1), '+', ' '));
      IF l_key IS NOT NULL THEN
        IF g_q.EXISTS(l_key) THEN g_q(l_key) := g_q(l_key) || ',' || l_val; ELSE g_q(l_key) := l_val; END IF;
      END IF;
    END LOOP;
  END;

  FUNCTION q(p VARCHAR2) RETURN VARCHAR2 IS BEGIN RETURN CASE WHEN g_q.EXISTS(p) THEN g_q(p) END; END;
  FUNCTION qn(p VARCHAR2) RETURN NUMBER IS BEGIN RETURN TO_NUMBER(q(p)); EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
  -- NVL first so an absent parameter yields FALSE (not a NULL BOOLEAN)
  FUNCTION qb(p VARCHAR2) RETURN BOOLEAN IS BEGIN RETURN NVL(LOWER(q(p)), 'n') IN ('true','1','y'); END;
  FUNCTION qts(p VARCHAR2) RETURN TIMESTAMP IS
    l_v VARCHAR2(200) := REGEXP_REPLACE(q(p), 'Z$', '+00:00');   -- ISO 8601 'Z' -> explicit UTC offset
  BEGIN
    IF l_v IS NULL THEN RETURN NULL; END IF;
    RETURN CAST(TO_TIMESTAMP_TZ(l_v, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZR') AT TIME ZONE SESSIONTIMEZONE AS TIMESTAMP);
  EXCEPTION WHEN OTHERS THEN
    BEGIN RETURN TO_TIMESTAMP(l_v, 'YYYY-MM-DD'); EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
  END;

  FUNCTION seg(p_path VARCHAR2, p_n PLS_INTEGER) RETURN VARCHAR2 IS BEGIN RETURN REGEXP_SUBSTR(p_path, '[^/]+', 1, p_n); END;
  FUNCTION segn(p_path VARCHAR2, p_n PLS_INTEGER) RETURN NUMBER IS BEGIN RETURN TO_NUMBER(seg(p_path, p_n)); EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
  -- normalise: replace numeric segments by {id}
  FUNCTION pattern(p_path VARCHAR2) RETURN VARCHAR2 IS BEGIN RETURN REGEXP_REPLACE('/' || TRIM(BOTH '/' FROM p_path), '/\d+', '/{id}'); END;

  PROCEDURE dispatch(p_method VARCHAR2, p_path VARCHAR2, p_query VARCHAR2, p_body CLOB, p_auth VARCHAR2,
                     o_status OUT PLS_INTEGER, o_body OUT CLOB, p_branch VARCHAR2 DEFAULT NULL) IS
    l_pat  VARCHAR2(400) := pattern(p_path);
    l_key  VARCHAR2(500) := UPPER(p_method) || ' ' || l_pat;
    l_path VARCHAR2(400) := '/' || TRIM(BOTH '/' FROM p_path);
    b JSON_OBJECT_T; l_id NUMBER; l_id2 NUMBER; d JSON_ELEMENT_T; l_msg VARCHAR2(200) := 'OK'; l_from TIMESTAMP; l_to TIMESTAMP;
  BEGIN
    parse_query(p_query);
    IF p_body IS NOT NULL AND DBMS_LOB.GETLENGTH(p_body) > 0 THEN
      b := JSON_OBJECT_T.parse(p_body);
    ELSE
      b := JSON_OBJECT_T();
    END IF;
    o_status := 200;
    l_id := segn(l_path, 2); IF l_id IS NULL THEN l_id := segn(l_path, 3); END IF;
    l_id2 := segn(l_path, 4); IF l_id2 IS NULL THEN l_id2 := segn(l_path, 5); END IF;
    l_from := NVL(qts('from'), TRUNC(SYSDATE)); l_to := NVL(qts('to'), TRUNC(SYSDATE) + 1 - INTERVAL '1' SECOND);

    -- public & auth (no token)
    IF l_key = 'POST /auth/login' THEN
      d := sec_pkg.login(b.get_string('username'), b.get_string('password'), NVL(b.get_boolean('rememberMe'), FALSE),
                         OWA_UTIL.GET_CGI_ENV('REMOTE_ADDR'), OWA_UTIL.GET_CGI_ENV('HTTP_USER_AGENT'));
      l_msg := 'Login successful';
    ELSIF l_key = 'POST /auth/forgot-password' THEN
      audit_pkg.log('PASSWORD_RESET_REQUESTED', 'USERS', NULL, NULL, b.get_string('email'));
      l_msg := 'If the account exists, reset instructions have been sent';
    ELSIF l_key LIKE 'GET /public/menu/%' THEN
      d := menu_pkg.public_menu(seg(l_path, 3), seg(l_path, 4));
    ELSE
      -- everything else requires a valid session
      l_id := sec_pkg.authenticate(p_auth); l_id := segn(l_path, 2); IF l_id IS NULL THEN l_id := segn(l_path, 3); END IF;
      -- Phase 2: branch context switch via X-Branch-Id (enforced server-side, never trusted from the UI alone)
      IF p_branch IS NOT NULL AND REGEXP_LIKE(p_branch, '^\d+$') THEN
        branch_pkg.assert_branch_access(TO_NUMBER(p_branch));
        api_pkg.set_context(api_pkg.current_user_id, TO_NUMBER(p_branch));
      END IF;

      CASE l_key
        WHEN 'POST /auth/logout' THEN sec_pkg.logout(REGEXP_REPLACE(p_auth, '^Bearer\s+', '', 1, 1, 'i')); l_msg := 'Logged out';
        WHEN 'GET /auth/me' THEN d := sec_pkg.user_json(api_pkg.current_user_id);

        WHEN 'GET /users/approvers' THEN d := user_pkg.approvers_json;
        WHEN 'GET /users/staff' THEN d := user_pkg.staff_json(q('role'));
        WHEN 'GET /users' THEN d := user_pkg.list_users(q('search'), q('role'), q('status'));
        WHEN 'POST /users' THEN d := sec_pkg.user_json(user_pkg.save_user(NULL, b)); o_status := 201; l_msg := 'User created';
        WHEN 'PUT /users/{id}' THEN d := sec_pkg.user_json(user_pkg.save_user(l_id, b)); l_msg := 'User updated';
        WHEN 'PUT /users/{id}/status' THEN user_pkg.set_status(l_id, b.get_boolean('isActive')); d := sec_pkg.user_json(l_id);
        WHEN 'PUT /users/{id}/password' THEN sec_pkg.assert_permission('users:manage'); sec_pkg.set_password(l_id, b.get_string('password')); l_msg := 'Password updated';
        WHEN 'GET /roles' THEN d := user_pkg.roles_json;
        WHEN 'GET /permissions' THEN sec_pkg.assert_permission('roles:view'); d := user_pkg.permissions_json;
        WHEN 'PUT /roles/{id}' THEN user_pkg.update_role(l_id, b); d := user_pkg.roles_json; l_msg := 'Role updated';

        WHEN 'GET /branches/current' THEN d := settings_pkg.branch_json(api_pkg.current_branch_id);
        WHEN 'PUT /branches/current' THEN settings_pkg.update_branch(b); d := settings_pkg.branch_json(api_pkg.current_branch_id); l_msg := 'Settings saved';
        WHEN 'GET /settings/taxes' THEN sec_pkg.assert_permission('settings:view'); d := menu_pkg.tax_groups_json;
        WHEN 'POST /settings/taxes' THEN settings_pkg.save_tax_group(NULL, b); d := menu_pkg.tax_groups_json; o_status := 201;
        WHEN 'PUT /settings/taxes/{id}' THEN settings_pkg.save_tax_group(l_id, b); d := menu_pkg.tax_groups_json;

        WHEN 'GET /floors' THEN sec_pkg.assert_permission('tables:view'); d := table_pkg.list_floors;
        WHEN 'POST /floors' THEN d := table_pkg.floor_json(table_pkg.save_floor(NULL, b)); o_status := 201; l_msg := 'Floor created';
        WHEN 'PUT /floors/{id}' THEN d := table_pkg.floor_json(table_pkg.save_floor(l_id, b)); l_msg := 'Floor updated';
        WHEN 'DELETE /floors/{id}' THEN table_pkg.delete_floor(l_id); l_msg := 'Floor deleted';
        WHEN 'GET /tables' THEN sec_pkg.assert_permission('tables:view'); d := table_pkg.list_tables(qn('floorId'), q('status'), q('search'), qn('waiterId'));
        WHEN 'GET /tables/{id}' THEN sec_pkg.assert_permission('tables:view'); d := table_pkg.table_json(l_id);
        WHEN 'POST /tables' THEN d := table_pkg.table_json(table_pkg.save_table(NULL, b)); o_status := 201; l_msg := 'Table created';
        WHEN 'PUT /tables/{id}' THEN d := table_pkg.table_json(table_pkg.save_table(l_id, b)); l_msg := 'Table updated';
        WHEN 'DELETE /tables/{id}' THEN table_pkg.delete_table(l_id); l_msg := 'Table deleted';
        WHEN 'PUT /tables/{id}/status' THEN table_pkg.override_status(l_id, b.get_string('status'), b.get_string('reason')); d := table_pkg.table_json(l_id); l_msg := 'Table status updated';
        WHEN 'PUT /tables/{id}/assign' THEN table_pkg.assign_waiter(l_id, b.get_number('waiterId')); d := table_pkg.table_json(l_id);
        WHEN 'POST /tables/{id}/regenerate-qr' THEN table_pkg.regenerate_qr(l_id); d := table_pkg.table_json(l_id); l_msg := 'QR code regenerated';

        WHEN 'GET /menu/categories' THEN sec_pkg.assert_permission('menu:view'); d := menu_pkg.list_categories(qb('includeInactive'));
        WHEN 'POST /menu/categories' THEN d := menu_pkg.category_json(menu_pkg.save_category(NULL, b)); o_status := 201; l_msg := 'Category created';
        WHEN 'PUT /menu/categories/reorder' THEN menu_pkg.reorder_categories(b.get_array('orderedIds')); d := menu_pkg.list_categories(TRUE);
        WHEN 'PUT /menu/categories/{id}' THEN d := menu_pkg.category_json(menu_pkg.save_category(l_id, b)); l_msg := 'Category updated';
        WHEN 'DELETE /menu/categories/{id}' THEN menu_pkg.delete_category(l_id); l_msg := 'Category deleted';
        WHEN 'GET /menu/items' THEN sec_pkg.assert_permission('menu:view'); d := menu_pkg.list_items(qn('categoryId'), q('search'), q('prepLocation'), qb('includeInactive'));
        WHEN 'POST /menu/items' THEN d := menu_pkg.item_json(menu_pkg.save_item(NULL, b)); o_status := 201; l_msg := 'Item created';
        WHEN 'PUT /menu/items/{id}' THEN d := menu_pkg.item_json(menu_pkg.save_item(l_id, b)); l_msg := 'Item updated';
        WHEN 'DELETE /menu/items/{id}' THEN menu_pkg.delete_item(l_id); l_msg := 'Item deleted';
        WHEN 'PUT /menu/items/{id}/availability' THEN menu_pkg.set_availability(l_id, b.get_boolean('isAvailable')); d := menu_pkg.item_json(l_id);

        WHEN 'GET /offers' THEN sec_pkg.assert_permission('offers:view'); d := offer_pkg.list_offers(qb('includeInactive'));
        WHEN 'POST /offers' THEN d := offer_pkg.offer_json(offer_pkg.save_offer(NULL, b)); o_status := 201; l_msg := 'Offer created';
        WHEN 'PUT /offers/{id}' THEN d := offer_pkg.offer_json(offer_pkg.save_offer(l_id, b)); l_msg := 'Offer updated';
        WHEN 'DELETE /offers/{id}' THEN offer_pkg.delete_offer(l_id); l_msg := 'Offer deleted';

        WHEN 'GET /orders' THEN d := order_pkg.list_orders(q('status'), qn('tableId'), qn('waiterId'), q('location'), qb('active'), qts('from'), qts('to'), q('search'));
        WHEN 'POST /orders' THEN d := order_pkg.order_json(order_pkg.create_order(b)); o_status := 201; l_msg := 'Order created successfully';
        WHEN 'GET /orders/{id}' THEN sec_pkg.assert_permission('orders:view'); d := order_pkg.order_json(l_id);
        WHEN 'PUT /orders/{id}' THEN order_pkg.update_order(l_id, b); d := order_pkg.order_json(l_id);
        WHEN 'POST /orders/{id}/items' THEN order_pkg.add_items(l_id, b.get_array('items')); d := order_pkg.order_json(l_id); l_msg := 'Items added';
        WHEN 'PUT /orders/{id}/items/{id}' THEN order_pkg.update_item(l_id, l_id2, b); d := order_pkg.order_json(l_id);
        WHEN 'POST /orders/{id}/items/{id}/cancel' THEN order_pkg.cancel_item(l_id, l_id2, b.get_string('reason'), b.get_number('approvedByUserId'), b.get_string('approvalPin')); d := order_pkg.order_json(l_id); l_msg := 'Item cancelled';
        WHEN 'PUT /orders/{id}/items/{id}/status' THEN order_pkg.set_item_status(l_id2, b.get_string('status')); d := order_pkg.order_json(l_id);
        WHEN 'POST /orders/{id}/confirm' THEN order_pkg.confirm_order(l_id); d := order_pkg.order_json(l_id); l_msg := 'Order sent to kitchen/bar';
        WHEN 'POST /orders/{id}/cancel' THEN order_pkg.cancel_order(l_id, b.get_string('reason')); d := order_pkg.order_json(l_id); l_msg := 'Order cancelled';
        WHEN 'POST /orders/{id}/request-bill' THEN order_pkg.request_bill(l_id); d := order_pkg.order_json(l_id); l_msg := 'Bill requested';
        WHEN 'GET /orders/{id}/history' THEN sec_pkg.assert_permission('orders:view'); d := order_pkg.history_json(l_id);

        WHEN 'GET /kitchen/orders' THEN d := ticket_pkg.list_tickets('KITCHEN', q('status'));
        WHEN 'PUT /kitchen/order-items/{id}/status' THEN sec_pkg.assert_permission('kitchen:update'); order_pkg.set_item_status(l_id, b.get_string('status'), 'KITCHEN'); d := ticket_pkg.ticket_json_for_item(l_id);
        WHEN 'GET /bar/orders' THEN d := ticket_pkg.list_tickets('BAR', q('status'));
        WHEN 'PUT /bar/order-items/{id}/status' THEN sec_pkg.assert_permission('bar:update'); order_pkg.set_item_status(l_id, b.get_string('status'), 'BAR'); d := ticket_pkg.ticket_json_for_item(l_id);

        WHEN 'GET /bills' THEN d := billing_pkg.list_bills(q('status'), q('paymentStatus'), q('search'), qts('from'), qts('to'));
        WHEN 'POST /bills' THEN d := billing_pkg.bill_json(billing_pkg.create_bill(b.get_number('orderId'))); o_status := 201; l_msg := 'Bill generated';
        WHEN 'GET /bills/{id}' THEN sec_pkg.assert_permission('billing:view'); d := billing_pkg.bill_json(l_id);
        WHEN 'POST /bills/{id}/discount' THEN billing_pkg.add_discount(l_id, b.get_string('discountType'), b.get_number('value'), b.get_string('reason'), b.get_number('approvedByUserId'), b.get_string('approvalPin')); d := billing_pkg.bill_json(l_id); l_msg := 'Discount applied';
        WHEN 'DELETE /bills/{id}/discount/{id}' THEN billing_pkg.void_discount(l_id, l_id2); d := billing_pkg.bill_json(l_id); l_msg := 'Discount removed';
        WHEN 'POST /bills/{id}/finalize' THEN billing_pkg.finalize_bill(l_id); d := billing_pkg.bill_json(l_id); l_msg := 'Bill finalized';
        WHEN 'POST /bills/{id}/payments' THEN payment_pkg.add_payment(l_id, b.get_string('method'), b.get_number('amount'), b.get_string('reference')); d := billing_pkg.bill_json(l_id); l_msg := 'Payment recorded';
        WHEN 'POST /bills/{id}/payments/{id}/reverse' THEN payment_pkg.reverse_payment(l_id, l_id2, b.get_string('reason')); d := billing_pkg.bill_json(l_id); l_msg := 'Payment reversed';
        WHEN 'POST /bills/{id}/close' THEN billing_pkg.close_bill(l_id); d := billing_pkg.bill_json(l_id); l_msg := 'Order closed';
        WHEN 'GET /bills/{id}/receipt' THEN d := billing_pkg.receipt_json(l_id);

        WHEN 'GET /dashboard/summary' THEN d := report_pkg.dashboard_summary(l_from, l_to);
        WHEN 'GET /reports/sales' THEN d := report_pkg.sales_report(l_from, l_to);
        WHEN 'GET /reports/payments' THEN d := report_pkg.payment_report(l_from, l_to);
        WHEN 'GET /reports/orders' THEN d := report_pkg.order_report(l_from, l_to);
        WHEN 'GET /reports/items' THEN d := report_pkg.item_report(l_from, l_to, qn('limit'));
        WHEN 'GET /audit-logs' THEN sec_pkg.assert_permission('audit:view'); d := settings_pkg.audit_logs(q('entity'), qts('from'), qts('to'), NVL(qn('page'),1), NVL(qn('pageSize'),50));
        WHEN 'GET /events' THEN d := settings_pkg.events_since(qts('since'));
        ELSE
          -- Phase 2 modules live in API_ROUTER2_PKG (09f); it raises 404 for unknown routes
          api_router2_pkg.dispatch(l_key, l_path, b, l_id, l_id2, l_from, l_to, d, l_msg, o_status);
      END CASE;
    END IF;
    o_body := api_pkg.success(l_msg, d);
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      o_status := api_pkg.http_status_for(SQLCODE);
      DECLARE errs JSON_ARRAY_T := JSON_ARRAY_T(); e JSON_OBJECT_T := JSON_OBJECT_T(); l_raw VARCHAR2(4000) := REGEXP_REPLACE(SQLERRM, '^ORA-\d+: ', '');
      BEGIN
        IF SQLCODE = api_pkg.c_err_validation AND INSTR(l_raw, '|') > 0 THEN e.put('field', SUBSTR(l_raw, 1, INSTR(l_raw,'|')-1)); END IF;
        e.put('message', api_pkg.clean_error_message(SQLERRM)); e.put('code', TO_CHAR(SQLCODE)); errs.append(e);
        o_body := api_pkg.failure(CASE WHEN o_status = 500 THEN 'Internal server error' ELSE api_pkg.clean_error_message(SQLERRM) END, errs);
        IF o_status = 500 THEN audit_pkg.log('SERVER_ERROR', 'API', NULL, l_key, SUBSTR(SQLERRM || CHR(10) || DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 4000)); END IF;
      END;
  END;
END api_router_pkg;
/

-- ---------------------------------------------------------------------
-- SETTINGS_PKG (branch, tax groups, audit log & event feed)
-- (spec is declared at the top of this file — body only here.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE BODY settings_pkg AS
  FUNCTION branch_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    b branches%ROWTYPE; o JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    SELECT * INTO b FROM branches WHERE branch_id = p_id;
    o.put('id', b.branch_id); o.put('code', b.branch_code); o.put('businessName', b.business_name); o.put('name', b.branch_name);
    o.put('address', b.address_line); o.put('city', b.city); o.put('phone', b.phone); o.put('email', b.email); o.put('gstNumber', b.gst_number);
    o.put('logoUrl', b.logo_url); o.put('welcomeMessage', b.welcome_message); o.put('currency', b.currency_code); o.put('timezone', b.timezone);
    o.put('serviceChargePercent', b.service_charge_pct); o.put('taxOnServiceCharge', b.tax_on_service_chg = 'Y'); o.put('roundingMode', b.rounding_mode);
    o.put('allowMultipleOrdersPerTable', b.allow_multi_orders = 'Y'); o.put('receiptFooter', b.receipt_footer);
    -- Phase 2 operational rules
    o.put('orgId', b.org_id); o.put('stockDeductionMode', b.stock_deduction_mode); o.put('minSpendShortfallMode', b.min_spend_shortfall_mode);
    o.put('minSpendFlatFee', b.min_spend_flat_fee); o.put('pmsProvider', b.pms_provider);
    RETURN o;
  END;

  PROCEDURE update_branch(p_body JSON_OBJECT_T) IS
    l_sc NUMBER := p_body.get_number('serviceChargePercent');
    -- BOOLEAN is not a SQL type; NULL here means "leave the stored value unchanged"
    l_tax_on_sc CHAR(1); l_multi CHAR(1);
    -- Phase 2 operational rules (hoisted out of the DML)
    l_stock_mode  VARCHAR2(20) := p_body.get_string('stockDeductionMode');
    l_short_mode  VARCHAR2(20) := p_body.get_string('minSpendShortfallMode');
    l_flat_fee    NUMBER       := p_body.get_number('minSpendFlatFee');
    l_pms         VARCHAR2(30) := p_body.get_string('pmsProvider');
    -- optional text fields: an absent key must leave the stored value alone (an empty string clears it)
    l_biz    VARCHAR2(150) := p_body.get_string('businessName');
    l_name   VARCHAR2(150) := p_body.get_string('name');
    l_addr   VARCHAR2(400) := p_body.get_string('address');
    l_city   VARCHAR2(100) := p_body.get_string('city');
    l_phone  VARCHAR2(30)  := p_body.get_string('phone');
    l_email  VARCHAR2(150) := p_body.get_string('email');
    l_gst    VARCHAR2(30)  := p_body.get_string('gstNumber');
    l_logo   VARCHAR2(400) := p_body.get_string('logoUrl');
    l_msg    VARCHAR2(300) := p_body.get_string('welcomeMessage');
    l_footer VARCHAR2(300) := p_body.get_string('receiptFooter');
    l_round  VARCHAR2(10)  := p_body.get_string('roundingMode');
    l_has_addr  CHAR(1) := CASE WHEN p_body.has('address')        THEN 'Y' ELSE 'N' END;
    l_has_city  CHAR(1) := CASE WHEN p_body.has('city')           THEN 'Y' ELSE 'N' END;
    l_has_phone CHAR(1) := CASE WHEN p_body.has('phone')          THEN 'Y' ELSE 'N' END;
    l_has_email CHAR(1) := CASE WHEN p_body.has('email')          THEN 'Y' ELSE 'N' END;
    l_has_gst   CHAR(1) := CASE WHEN p_body.has('gstNumber')      THEN 'Y' ELSE 'N' END;
    l_has_logo  CHAR(1) := CASE WHEN p_body.has('logoUrl')        THEN 'Y' ELSE 'N' END;
    l_has_msg   CHAR(1) := CASE WHEN p_body.has('welcomeMessage') THEN 'Y' ELSE 'N' END;
  BEGIN
    sec_pkg.assert_permission('settings:manage');
    IF l_sc IS NOT NULL AND (l_sc < 0 OR l_sc > 100) THEN api_pkg.raise_validation('Service charge must be 0-100', 'serviceChargePercent'); END IF;
    IF l_stock_mode IS NOT NULL AND l_stock_mode NOT IN ('ON_CONFIRM', 'ON_BILL_CLOSE', 'MANUAL') THEN api_pkg.raise_validation('Invalid stock deduction mode', 'stockDeductionMode'); END IF;
    IF l_short_mode IS NOT NULL AND l_short_mode NOT IN ('CHARGE_DIFFERENCE', 'WAIVE', 'FLAT_FEE') THEN api_pkg.raise_validation('Invalid minimum-spend rule', 'minSpendShortfallMode'); END IF;
    IF l_flat_fee IS NOT NULL AND l_flat_fee < 0 THEN api_pkg.raise_validation('Flat fee cannot be negative', 'minSpendFlatFee'); END IF;
    IF p_body.has('taxOnServiceCharge') THEN l_tax_on_sc := api_pkg.yn(p_body.get_boolean('taxOnServiceCharge')); END IF;
    IF p_body.has('allowMultipleOrdersPerTable') THEN l_multi := api_pkg.yn(p_body.get_boolean('allowMultipleOrdersPerTable')); END IF;
    UPDATE branches SET business_name = NVL(l_biz, business_name), branch_name = NVL(l_name, branch_name),
           address_line     = CASE WHEN l_has_addr  = 'Y' THEN l_addr  ELSE address_line     END,
           city             = CASE WHEN l_has_city  = 'Y' THEN l_city  ELSE city             END,
           phone            = CASE WHEN l_has_phone = 'Y' THEN l_phone ELSE phone            END,
           email            = CASE WHEN l_has_email = 'Y' THEN l_email ELSE email            END,
           gst_number       = CASE WHEN l_has_gst   = 'Y' THEN l_gst   ELSE gst_number       END,
           logo_url         = CASE WHEN l_has_logo  = 'Y' THEN l_logo  ELSE logo_url         END,
           welcome_message  = CASE WHEN l_has_msg   = 'Y' THEN l_msg   ELSE welcome_message  END,
           service_charge_pct = NVL(l_sc, service_charge_pct), tax_on_service_chg = NVL(l_tax_on_sc, tax_on_service_chg),
           rounding_mode = NVL(l_round, rounding_mode), allow_multi_orders = NVL(l_multi, allow_multi_orders),
           stock_deduction_mode = NVL(l_stock_mode, stock_deduction_mode), min_spend_shortfall_mode = NVL(l_short_mode, min_spend_shortfall_mode),
           min_spend_flat_fee = NVL(l_flat_fee, min_spend_flat_fee), pms_provider = NVL(l_pms, pms_provider),
           receipt_footer = NVL(l_footer, receipt_footer), updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
     WHERE branch_id = api_pkg.current_branch_id;
    audit_pkg.log('SETTINGS_UPDATED', 'BRANCHES', api_pkg.current_branch_id, NULL, p_body.to_clob);
  END;

  PROCEDURE save_tax_group(p_id NUMBER, p_body JSON_OBJECT_T) IS
    l_id NUMBER := p_id; rates JSON_ARRAY_T := p_body.get_array('rates'); r JSON_OBJECT_T;
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE));  -- BOOLEAN is not a SQL type
  BEGIN
    sec_pkg.assert_permission('settings:manage');
    IF TRIM(p_body.get_string('code')) IS NULL THEN api_pkg.raise_validation('Tax code is required', 'code'); END IF;
    IF l_id IS NULL THEN
      INSERT INTO tax_configurations (branch_id, tax_code, tax_name, is_active) VALUES (api_pkg.current_branch_id, UPPER(TRIM(p_body.get_string('code'))), p_body.get_string('name'), l_active)
      RETURNING tax_group_id INTO l_id;
    ELSE
      UPDATE tax_configurations SET tax_code = UPPER(TRIM(p_body.get_string('code'))), tax_name = p_body.get_string('name'), is_active = l_active,
             updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE tax_group_id = l_id;
      DELETE FROM tax_components WHERE tax_group_id = l_id;
    END IF;
    IF rates IS NOT NULL THEN
      FOR i IN 0 .. rates.get_size - 1 LOOP
        r := TREAT(rates.get(i) AS JSON_OBJECT_T);
        IF r.get_number('percent') < 0 THEN api_pkg.raise_validation('Tax rate cannot be negative', 'rates'); END IF;
        INSERT INTO tax_components (tax_group_id, component_code, component_name, rate_pct) VALUES (l_id, UPPER(r.get_string('code')), r.get_string('name'), r.get_number('percent'));
      END LOOP;
    END IF;
    audit_pkg.log('TAX_CONFIG_SAVED', 'TAX_CONFIGURATIONS', l_id, NULL, p_body.to_clob);
  END;

  FUNCTION audit_logs(p_entity VARCHAR2, p_from TIMESTAMP, p_to TIMESTAMP, p_page NUMBER, p_size NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); a JSON_ARRAY_T := JSON_ARRAY_T(); l_total NUMBER;
  BEGIN
    SELECT COUNT(*) INTO l_total FROM audit_logs WHERE (p_entity IS NULL OR entity_name = p_entity) AND (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at <= p_to);
    FOR r IN (SELECT * FROM (SELECT l.*, u.full_name, ROW_NUMBER() OVER (ORDER BY l.created_at DESC) rn FROM audit_logs l LEFT JOIN users u ON u.user_id = l.user_id
                WHERE (p_entity IS NULL OR l.entity_name = p_entity) AND (p_from IS NULL OR l.created_at >= p_from) AND (p_to IS NULL OR l.created_at <= p_to))
              WHERE rn > (p_page - 1) * p_size AND rn <= p_page * p_size) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN
        o.put('id', r.audit_id); o.put('userId', r.user_id); o.put('userName', r.full_name); o.put('action', r.action_code); o.put('entity', r.entity_name);
        o.put('entityId', r.entity_id);
        o.put('oldValue', CASE WHEN r.old_value IS NULL THEN NULL ELSE DBMS_LOB.SUBSTR(r.old_value, 4000, 1) END);
        o.put('newValue', CASE WHEN r.new_value IS NULL THEN NULL ELSE DBMS_LOB.SUBSTR(r.new_value, 4000, 1) END);
        o.put('createdAt', api_pkg.ts_iso(r.created_at));
        a.append(o);
      END;
    END LOOP;
    j.put('items', a); j.put('total', l_total); j.put('page', p_page); j.put('pageSize', p_size);
    RETURN j;
  END;

  FUNCTION events_since(p_since TIMESTAMP) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    FOR r IN (SELECT * FROM (SELECT * FROM realtime_events WHERE branch_id = api_pkg.current_branch_id AND created_at > NVL(p_since, SYSTIMESTAMP - INTERVAL '1' MINUTE) ORDER BY created_at) WHERE ROWNUM <= 500) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('id', r.event_id); o.put('topic', r.topic); o.put('type', r.event_type); o.put('entityId', r.entity_id); o.put('at', api_pkg.ts_iso(r.created_at)); a.append(o); END;
    END LOOP;
    RETURN a;
  END;
END settings_pkg;
/

-- ---------------------------------------------------------------------
-- ORDS module: one catch-all template per HTTP method delegating to the router.
-- Requires: ORDS enabled schema (ORDS.ENABLE_SCHEMA) with URL mapping pattern 'pos'.
-- ---------------------------------------------------------------------
BEGIN
  ORDS.ENABLE_SCHEMA(p_enabled => TRUE, p_schema => USER, p_url_mapping_type => 'BASE_PATH', p_url_mapping_pattern => 'pos', p_auto_rest_auth => FALSE);

  ORDS.DEFINE_MODULE(p_module_name => 'pos.v1', p_base_path => '/v1/', p_items_per_page => 0, p_status => 'PUBLISHED', p_comments => 'Nexovo POS API v1');

  -- catch-all: :path captures the remainder (e.g. orders/12/confirm)
  ORDS.DEFINE_TEMPLATE(p_module_name => 'pos.v1', p_pattern => ':path*');

  FOR m IN (SELECT column_value AS method FROM TABLE(sys.odcivarchar2list('GET','POST','PUT','DELETE'))) LOOP
    ORDS.DEFINE_HANDLER(
      p_module_name => 'pos.v1', p_pattern => ':path*', p_method => m.method,
      p_source_type => ORDS.SOURCE_TYPE_PLSQL, p_mimes_allowed => CASE WHEN m.method IN ('POST','PUT') THEN 'application/json' END,
      p_source => 'DECLARE l_status PLS_INTEGER; l_out CLOB; l_body CLOB; BEGIN ' ||
                  CASE WHEN m.method IN ('POST','PUT') THEN 'l_body := :body_text; ' ELSE 'l_body := NULL; ' END ||
                  'api_router_pkg.dispatch(''' || m.method || ''', :path, OWA_UTIL.GET_CGI_ENV(''QUERY_STRING''), l_body, :auth, l_status, l_out, :branch_hdr); ' ||
                  ':status_code := l_status; OWA_UTIL.MIME_HEADER(''application/json'', FALSE); OWA_UTIL.HTTP_HEADER_CLOSE; HTP.PRN(l_out); END;');
    ORDS.DEFINE_PARAMETER(p_module_name => 'pos.v1', p_pattern => ':path*', p_method => m.method, p_name => 'Authorization',
                          p_bind_variable_name => 'auth', p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');
    -- Phase 2: optional branch context switch (validated against USER_BRANCHES)
    ORDS.DEFINE_PARAMETER(p_module_name => 'pos.v1', p_pattern => ':path*', p_method => m.method, p_name => 'X-Branch-Id',
                          p_bind_variable_name => 'branch_hdr', p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');
    ORDS.DEFINE_PARAMETER(p_module_name => 'pos.v1', p_pattern => ':path*', p_method => m.method, p_name => 'X-ORDS-STATUS-CODE',
                          p_bind_variable_name => 'status_code', p_source_type => 'HEADER', p_param_type => 'INT', p_access_method => 'OUT');
  END LOOP;
  COMMIT;
END;
/
-- CORS: allow the Vite dev origin (adjust for production). Configure in ORDS pool config:
--   security.externalSessionTrustedOrigins / or set on module: ORDS.SET_MODULE_ORIGINS_ALLOWED('pos.v1','http://localhost:5173');
BEGIN
  ORDS.SET_MODULE_ORIGINS_ALLOWED(p_module_name => 'pos.v1', p_origins_allowed => 'http://localhost:5173,http://localhost:4173');
  COMMIT;
END;
/
