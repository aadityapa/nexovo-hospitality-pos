-- =====================================================================
-- PHASE 2 — NOTIFY_PKG body (spec in 09a) & REPORT2_PKG (advanced reports)
-- =====================================================================

CREATE OR REPLACE PACKAGE BODY notify_pkg AS

  -- Channel dispatch abstraction: IN_APP is delivered by storing the row; other channels are queued
  -- for a provider (WhatsApp / SMS / Email / Push) that a future integration package will drain.
  PROCEDURE dispatch(p_notif_id NUMBER, p_severity VARCHAR2) IS
  BEGIN
    INSERT INTO notification_logs (notif_id, channel, provider, status, response) VALUES (p_notif_id, 'IN_APP', 'DB', 'SENT', NULL);
    IF p_severity = 'CRITICAL' THEN
      INSERT INTO notification_logs (notif_id, channel, provider, status, response) VALUES (p_notif_id, 'WHATSAPP', 'NONE', 'QUEUED', 'no provider configured');
    END IF;
  END;

  PROCEDURE create_notification(p_type VARCHAR2, p_severity VARCHAR2, p_title VARCHAR2, p_body VARCHAR2,
                                p_entity VARCHAR2, p_entity_id NUMBER, p_target_role VARCHAR2, p_target_user NUMBER, p_dedupe_key VARCHAR2) IS
    l_cnt NUMBER := 0; l_id NUMBER;
  BEGIN
    IF p_dedupe_key IS NOT NULL THEN
      SELECT COUNT(*) INTO l_cnt FROM notifications WHERE dedupe_key = p_dedupe_key AND is_read = 'N';
      IF l_cnt > 0 THEN RETURN; END IF;
    END IF;
    INSERT INTO notifications (org_id, branch_id, notif_type, severity, title, body, entity_name, entity_id, target_role, target_user_id, dedupe_key)
    VALUES (1, api_pkg.current_branch_id, p_type, NVL(p_severity, 'INFO'), SUBSTR(p_title, 1, 150), SUBSTR(p_body, 1, 500), p_entity, p_entity_id, p_target_role, p_target_user, p_dedupe_key)
    RETURNING notif_id INTO l_id;
    dispatch(l_id, NVL(p_severity, 'INFO'));
    audit_pkg.emit_event('notifications', 'notification.created', l_id);
  END;

  PROCEDURE resolve_dedupe(p_dedupe_key VARCHAR2) IS
  BEGIN
    UPDATE notifications SET is_read = 'Y', read_at = SYSTIMESTAMP WHERE dedupe_key = p_dedupe_key AND is_read = 'N';
  END;

  FUNCTION visible_to_me(p_role VARCHAR2, p_user NUMBER) RETURN BOOLEAN IS
  BEGIN
    IF p_user IS NOT NULL THEN RETURN p_user = api_pkg.current_user_id; END IF;
    IF p_role IS NULL THEN RETURN TRUE; END IF;
    RETURN sec_pkg.user_has_role(api_pkg.current_user_id, p_role) OR sec_pkg.user_has_role(api_pkg.current_user_id, 'ADMIN') OR sec_pkg.user_has_role(api_pkg.current_user_id, 'SUPER_ADMIN');
  END;

  FUNCTION list_json(p_unread_only BOOLEAN, p_limit NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); a JSON_ARRAY_T := JSON_ARRAY_T(); l_unread NUMBER := 0; l_n NUMBER := 0; l_unread_flag CHAR(1) := api_pkg.yn(p_unread_only);
  BEGIN
    sec_pkg.assert_permission('notifications:view');
    run_checks;   -- opportunistic evaluation (cheap; a scheduler job can call it too)
    FOR r IN (SELECT * FROM notifications WHERE (branch_id = api_pkg.current_branch_id OR branch_id IS NULL) AND (l_unread_flag = 'N' OR is_read = 'N') ORDER BY created_at DESC) LOOP
      IF visible_to_me(r.target_role, r.target_user_id) THEN
        IF r.is_read = 'N' THEN l_unread := l_unread + 1; END IF;
        IF l_n < NVL(p_limit, 50) THEN
          DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
          BEGIN
            o.put('id', r.notif_id); o.put('type', r.notif_type); o.put('severity', r.severity); o.put('title', r.title); o.put('body', r.body); o.put('entity', r.entity_name); o.put('entityId', r.entity_id);
            o.put('isRead', r.is_read = 'Y'); o.put('createdAt', api_pkg.ts_iso(r.created_at)); a.append(o); l_n := l_n + 1;
          END;
        END IF;
      END IF;
    END LOOP;
    j.put('items', a); j.put('unreadCount', l_unread);
    RETURN j;
  END;

  PROCEDURE mark_read(p_id NUMBER) IS
  BEGIN
    sec_pkg.assert_permission('notifications:view');
    UPDATE notifications SET is_read = 'Y', read_at = SYSTIMESTAMP WHERE notif_id = p_id AND is_read = 'N';
  END;

  PROCEDURE mark_all_read IS
  BEGIN
    sec_pkg.assert_permission('notifications:view');
    FOR r IN (SELECT notif_id, target_role, target_user_id FROM notifications WHERE (branch_id = api_pkg.current_branch_id OR branch_id IS NULL) AND is_read = 'N') LOOP
      IF visible_to_me(r.target_role, r.target_user_id) THEN UPDATE notifications SET is_read = 'Y', read_at = SYSTIMESTAMP WHERE notif_id = r.notif_id; END IF;
    END LOOP;
  END;

  FUNCTION threshold(p_key VARCHAR2, p_default NUMBER) RETURN NUMBER IS
    l NUMBER;
  BEGIN
    SELECT threshold_value INTO l FROM alert_thresholds WHERE branch_id = api_pkg.current_branch_id AND threshold_key = p_key AND is_active = 'Y';
    RETURN l;
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN p_default;
  END;

  FUNCTION thresholds_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
    TYPE t_def IS RECORD (k VARCHAR2(40), v NUMBER, label VARCHAR2(80));
    TYPE t_defs IS TABLE OF t_def;
    defs t_defs := t_defs();
    PROCEDURE add(k VARCHAR2, v NUMBER, l VARCHAR2) IS BEGIN defs.EXTEND; defs(defs.LAST).k := k; defs(defs.LAST).v := v; defs(defs.LAST).label := l; END;
  BEGIN
    sec_pkg.assert_permission('notifications:view');
    add('ORDER_DELAY_MIN', 20, 'Order delayed after (minutes)'); add('KITCHEN_BACKLOG', 8, 'Kitchen backlog (pending items)'); add('BAR_BACKLOG', 8, 'Bar backlog (pending items)');
    add('BILL_PENDING_MIN', 10, 'Bill request unattended after (minutes)'); add('LARGE_BILL_AMOUNT', 10000, 'Large unpaid bill (₹)'); add('RESERVATION_REMINDER_MIN', 60, 'Reservation reminder before (minutes)');
    FOR i IN 1 .. defs.COUNT LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('key', defs(i).k); o.put('label', defs(i).label); o.put('defaultValue', defs(i).v); o.put('value', threshold(defs(i).k, defs(i).v)); a.append(o); END;
    END LOOP;
    RETURN a;
  END;

  PROCEDURE save_thresholds(p_body JSON_ARRAY_T) IS
    o JSON_OBJECT_T;
  BEGIN
    sec_pkg.assert_permission('notifications:manage');
    IF p_body IS NULL THEN RETURN; END IF;
    FOR i IN 0 .. p_body.get_size - 1 LOOP
      o := TREAT(p_body.get(i) AS JSON_OBJECT_T);
      DECLARE l_k VARCHAR2(40) := o.get_string('key'); l_v NUMBER := o.get_number('value');
      BEGIN
        IF l_v IS NULL OR l_v < 0 THEN api_pkg.raise_validation('Threshold values must be zero or positive', l_k); END IF;
        UPDATE alert_thresholds SET threshold_value = l_v, is_active = 'Y' WHERE branch_id = api_pkg.current_branch_id AND threshold_key = l_k;
        IF SQL%ROWCOUNT = 0 THEN INSERT INTO alert_thresholds (branch_id, threshold_key, threshold_value) VALUES (api_pkg.current_branch_id, l_k, l_v); END IF;
      END;
    END LOOP;
    audit_pkg.log('THRESHOLDS_UPDATED', 'ALERT_THRESHOLDS', NULL, NULL, p_body.to_clob);
  END;

  -- Evaluates operational rules and raises deduped notifications; resolves them when the condition clears.
  PROCEDURE run_checks IS
    l_delay NUMBER := threshold('ORDER_DELAY_MIN', 20); l_kb NUMBER := threshold('KITCHEN_BACKLOG', 8); l_bb NUMBER := threshold('BAR_BACKLOG', 8);
    l_bill NUMBER := threshold('BILL_PENDING_MIN', 10); l_large NUMBER := threshold('LARGE_BILL_AMOUNT', 10000); l_cnt NUMBER;
  BEGIN
    -- delayed orders
    FOR o IN (SELECT order_id, order_number, table_id, confirmed_at FROM orders WHERE branch_id = api_pkg.current_branch_id AND status IN ('CONFIRMED','IN_PROGRESS','PARTIALLY_READY')) LOOP
      IF (SYSDATE - CAST(o.confirmed_at AS DATE)) * 24 * 60 >= l_delay THEN
        create_notification('ORDER_DELAYED', 'WARNING', 'Order delayed: ' || o.order_number, 'Waiting more than ' || l_delay || ' minutes', 'ORDERS', o.order_id, 'MANAGER', NULL, 'ORDER_DELAYED:' || o.order_id);
      END IF;
    END LOOP;
    UPDATE notifications SET is_read = 'Y', read_at = SYSTIMESTAMP WHERE notif_type = 'ORDER_DELAYED' AND is_read = 'N'
       AND entity_id IN (SELECT order_id FROM orders WHERE status NOT IN ('CONFIRMED','IN_PROGRESS','PARTIALLY_READY'));
    -- station backlogs
    SELECT COUNT(*) INTO l_cnt FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE o.branch_id = api_pkg.current_branch_id AND oi.prep_location = 'KITCHEN' AND oi.status IN ('NEW','PREPARING') AND o.status NOT IN ('COMPLETED','CANCELLED');
    IF l_cnt >= l_kb THEN create_notification('KITCHEN_BACKLOG', 'WARNING', 'Kitchen backlog: ' || l_cnt || ' items', 'Threshold ' || l_kb, NULL, NULL, 'MANAGER', NULL, 'KITCHEN_BACKLOG'); ELSE resolve_dedupe('KITCHEN_BACKLOG'); END IF;
    SELECT COUNT(*) INTO l_cnt FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE o.branch_id = api_pkg.current_branch_id AND oi.prep_location = 'BAR' AND oi.status IN ('NEW','PREPARING') AND o.status NOT IN ('COMPLETED','CANCELLED');
    IF l_cnt >= l_bb THEN create_notification('BAR_BACKLOG', 'WARNING', 'Bar backlog: ' || l_cnt || ' items', 'Threshold ' || l_bb, NULL, NULL, 'MANAGER', NULL, 'BAR_BACKLOG'); ELSE resolve_dedupe('BAR_BACKLOG'); END IF;
    -- bill requests unattended
    FOR o IN (SELECT order_id, order_number, bill_requested_at FROM orders WHERE branch_id = api_pkg.current_branch_id AND status = 'BILL_REQUESTED') LOOP
      IF (SYSDATE - CAST(o.bill_requested_at AS DATE)) * 24 * 60 >= l_bill THEN
        create_notification('BILL_PENDING', 'WARNING', 'Bill request waiting: ' || o.order_number, 'Requested more than ' || l_bill || ' minutes ago', 'ORDERS', o.order_id, 'CASHIER', NULL, 'BILL_PENDING:' || o.order_id);
      END IF;
    END LOOP;
    UPDATE notifications SET is_read = 'Y', read_at = SYSTIMESTAMP WHERE notif_type = 'BILL_PENDING' AND is_read = 'N' AND entity_id IN (SELECT order_id FROM orders WHERE status <> 'BILL_REQUESTED');
    -- large unpaid bills
    FOR b IN (SELECT bill_id, bill_number, grand_total FROM bills WHERE branch_id = api_pkg.current_branch_id AND status = 'FINALIZED' AND payment_status <> 'PAID' AND grand_total >= l_large) LOOP
      create_notification('LARGE_BILL_PENDING', 'INFO', 'Large bill pending: ' || b.bill_number, 'Amount ' || b.grand_total, 'BILLS', b.bill_id, 'MANAGER', NULL, 'LARGE_BILL:' || b.bill_id);
    END LOOP;
    UPDATE notifications SET is_read = 'Y', read_at = SYSTIMESTAMP WHERE notif_type = 'LARGE_BILL_PENDING' AND is_read = 'N' AND entity_id IN (SELECT bill_id FROM bills WHERE payment_status = 'PAID');
    -- reservations arriving within the reminder window
    reservation_pkg.send_reminders;
  EXCEPTION WHEN OTHERS THEN NULL;   -- checks must never break the calling request
  END;
END notify_pkg;
/

-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE report2_pkg AS
  FUNCTION sales_period(p_from TIMESTAMP, p_to TIMESTAMP, p_group VARCHAR2) RETURN JSON_OBJECT_T;      -- DAY | WEEK | MONTH | YEAR
  FUNCTION branch_comparison(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_ARRAY_T;
  FUNCTION category_performance(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_ARRAY_T;
  FUNCTION inventory_valuation RETURN JSON_OBJECT_T;
  FUNCTION wastage(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_OBJECT_T;
  FUNCTION consumption(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_ARRAY_T;
  FUNCTION profitability(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_OBJECT_T;
  FUNCTION staff_performance(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_ARRAY_T;
END report2_pkg;
/
CREATE OR REPLACE PACKAGE BODY report2_pkg AS
  FUNCTION bucket_fmt(p_group VARCHAR2) RETURN VARCHAR2 IS
  BEGIN RETURN CASE UPPER(p_group) WHEN 'WEEK' THEN 'IYYY-"W"IW' WHEN 'MONTH' THEN 'YYYY-MM' WHEN 'YEAR' THEN 'YYYY' ELSE 'YYYY-MM-DD' END; END;

  FUNCTION sales_period(p_from TIMESTAMP, p_to TIMESTAMP, p_group VARCHAR2) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); a JSON_ARRAY_T := JSON_ARRAY_T(); l_fmt VARCHAR2(20) := bucket_fmt(p_group); l_total NUMBER := 0; l_bills NUMBER := 0;
  BEGIN
    sec_pkg.assert_permission('reports:advanced');
    FOR r IN (SELECT TO_CHAR(paid_at, l_fmt) bucket, COUNT(*) cnt, SUM(grand_total) sales, SUM(tax_total) tax, SUM(item_discount_total + order_discount_total) disc, SUM(service_charge_amt) sc, AVG(grand_total) avg_bill
                FROM bills WHERE branch_id = api_pkg.current_branch_id AND status IN ('PAID','CLOSED') AND paid_at BETWEEN p_from AND p_to GROUP BY TO_CHAR(paid_at, l_fmt) ORDER BY 1) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('bucket', r.bucket); o.put('bills', r.cnt); o.put('sales', ROUND(r.sales, 2)); o.put('tax', ROUND(r.tax, 2)); o.put('discounts', ROUND(r.disc, 2)); o.put('serviceCharge', ROUND(r.sc, 2)); o.put('averageBill', ROUND(r.avg_bill, 2)); a.append(o); END;
      l_total := l_total + r.sales; l_bills := l_bills + r.cnt;
    END LOOP;
    j.put('groupBy', UPPER(NVL(p_group, 'DAY'))); j.put('rows', a); j.put('totalSales', ROUND(l_total, 2)); j.put('totalBills', l_bills); j.put('averageBill', CASE WHEN l_bills > 0 THEN ROUND(l_total / l_bills, 2) ELSE 0 END);
    RETURN j;
  END;

  FUNCTION branch_comparison(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T(); l_super CHAR(1) := api_pkg.yn(sec_pkg.user_has_role(api_pkg.current_user_id, 'SUPER_ADMIN'));
  BEGIN
    sec_pkg.assert_permission('reports:advanced');
    FOR r IN (SELECT b.branch_id, b.branch_code, b.branch_name, b.city,
                     (SELECT COUNT(*) FROM bills x WHERE x.branch_id = b.branch_id AND x.status IN ('PAID','CLOSED') AND x.paid_at BETWEEN p_from AND p_to) bills,
                     (SELECT NVL(SUM(grand_total), 0) FROM bills x WHERE x.branch_id = b.branch_id AND x.status IN ('PAID','CLOSED') AND x.paid_at BETWEEN p_from AND p_to) sales,
                     (SELECT COUNT(*) FROM orders o WHERE o.branch_id = b.branch_id AND o.created_at BETWEEN p_from AND p_to AND o.status = 'CANCELLED') cancelled,
                     (SELECT NVL(SUM(total_cost), 0) FROM stock_movements m WHERE m.branch_id = b.branch_id AND m.mvt_type = 'SALE_CONSUMPTION' AND m.created_at BETWEEN p_from AND p_to) cogs
                FROM branches b WHERE l_super = 'Y' OR EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = api_pkg.current_user_id AND ub.branch_id = b.branch_id) ORDER BY sales DESC) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('branchId', r.branch_id); o.put('code', r.branch_code); o.put('name', r.branch_name); o.put('city', r.city); o.put('bills', r.bills); o.put('sales', ROUND(r.sales, 2)); o.put('averageBill', CASE WHEN r.bills > 0 THEN ROUND(r.sales / r.bills, 2) ELSE 0 END); o.put('cancelledOrders', r.cancelled); o.put('cogs', ROUND(r.cogs, 2)); o.put('grossProfit', ROUND(r.sales - r.cogs, 2)); a.append(o); END;
    END LOOP;
    RETURN a;
  END;

  FUNCTION category_performance(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T(); l_total NUMBER := 0;
  BEGIN
    sec_pkg.assert_permission('reports:advanced');
    SELECT NVL(SUM(bi.line_total - bi.discount_amount), 0) INTO l_total FROM bill_items bi JOIN bills b ON b.bill_id = bi.bill_id WHERE b.branch_id = api_pkg.current_branch_id AND b.status IN ('PAID','CLOSED') AND b.paid_at BETWEEN p_from AND p_to;
    FOR r IN (SELECT mc.category_name, mc.default_prep_loc, SUM(bi.quantity) qty, SUM(bi.line_total - bi.discount_amount) rev, COUNT(DISTINCT b.bill_id) bills
                FROM bill_items bi JOIN bills b ON b.bill_id = bi.bill_id JOIN order_items oi ON oi.order_item_id = bi.order_item_id JOIN menu_items mi ON mi.item_id = oi.item_id JOIN menu_categories mc ON mc.category_id = mi.category_id
               WHERE b.branch_id = api_pkg.current_branch_id AND b.status IN ('PAID','CLOSED') AND b.paid_at BETWEEN p_from AND p_to GROUP BY mc.category_name, mc.default_prep_loc ORDER BY rev DESC) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('categoryName', r.category_name); o.put('prepLocation', r.default_prep_loc); o.put('quantity', r.qty); o.put('revenue', ROUND(r.rev, 2)); o.put('bills', r.bills); o.put('sharePercent', CASE WHEN l_total > 0 THEN ROUND(r.rev * 100 / l_total, 1) ELSE 0 END); a.append(o); END;
    END LOOP;
    RETURN a;
  END;

  FUNCTION inventory_valuation RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); a JSON_ARRAY_T := JSON_ARRAY_T(); items JSON_ARRAY_T := JSON_ARRAY_T(); l_total NUMBER := 0;
  BEGIN
    sec_pkg.assert_permission('reports:advanced');
    FOR r IN (SELECT cat_name, cat_kind, COUNT(*) cnt, SUM(stock_value) val FROM v_inventory_status WHERE branch_id = api_pkg.current_branch_id GROUP BY cat_name, cat_kind ORDER BY val DESC) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('categoryName', r.cat_name); o.put('kind', r.cat_kind); o.put('items', r.cnt); o.put('value', ROUND(r.val, 2)); a.append(o); END;
      l_total := l_total + r.val;
    END LOOP;
    FOR r IN (SELECT * FROM (SELECT item_name, unit_code, current_qty, avg_cost, stock_value, stock_status FROM v_inventory_status WHERE branch_id = api_pkg.current_branch_id ORDER BY stock_value DESC) WHERE ROWNUM <= 25) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('itemName', r.item_name); o.put('unitCode', r.unit_code); o.put('qty', r.current_qty); o.put('avgCost', r.avg_cost); o.put('value', ROUND(r.stock_value, 2)); o.put('status', r.stock_status); items.append(o); END;
    END LOOP;
    j.put('totalValue', ROUND(l_total, 2)); j.put('byCategory', a); j.put('topItems', items);
    RETURN j;
  END;

  FUNCTION wastage(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); a JSON_ARRAY_T := JSON_ARRAY_T(); l_total NUMBER := 0;
  BEGIN
    sec_pkg.assert_permission('reports:advanced');
    FOR r IN (SELECT i.item_name, u.unit_code, m.mvt_type, SUM(ABS(m.qty)) qty, SUM(m.total_cost) cost, COUNT(*) cnt FROM stock_movements m JOIN inventory_items i ON i.inv_item_id = m.inv_item_id JOIN inventory_units u ON u.unit_id = i.unit_id
               WHERE m.branch_id = api_pkg.current_branch_id AND m.mvt_type IN ('WASTAGE','DAMAGE') AND m.created_at BETWEEN p_from AND p_to GROUP BY i.item_name, u.unit_code, m.mvt_type ORDER BY cost DESC) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('itemName', r.item_name); o.put('unitCode', r.unit_code); o.put('type', r.mvt_type); o.put('qty', r.qty); o.put('cost', ROUND(r.cost, 2)); o.put('entries', r.cnt); a.append(o); END;
      l_total := l_total + r.cost;
    END LOOP;
    j.put('totalCost', ROUND(l_total, 2)); j.put('rows', a);
    RETURN j;
  END;

  FUNCTION consumption(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('reports:advanced');
    FOR r IN (SELECT i.item_name, u.unit_code, c.cat_name, SUM(ABS(m.qty)) qty, SUM(m.total_cost) cost FROM stock_movements m JOIN inventory_items i ON i.inv_item_id = m.inv_item_id JOIN inventory_units u ON u.unit_id = i.unit_id JOIN inventory_categories c ON c.inv_cat_id = i.inv_cat_id
               WHERE m.branch_id = api_pkg.current_branch_id AND m.mvt_type = 'SALE_CONSUMPTION' AND m.created_at BETWEEN p_from AND p_to GROUP BY i.item_name, u.unit_code, c.cat_name ORDER BY cost DESC) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('itemName', r.item_name); o.put('unitCode', r.unit_code); o.put('categoryName', r.cat_name); o.put('qty', r.qty); o.put('cost', ROUND(r.cost, 2)); a.append(o); END;
    END LOOP;
    RETURN a;
  END;

  FUNCTION profitability(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); l_rev NUMBER; l_food_rev NUMBER; l_bev_rev NUMBER; l_cogs NUMBER; l_food_cogs NUMBER; l_bev_cogs NUMBER; l_waste NUMBER; l_disc NUMBER;
  BEGIN
    sec_pkg.assert_permission('reports:advanced');
    SELECT NVL(SUM(bi.line_total - bi.discount_amount), 0), NVL(SUM(CASE WHEN oi.prep_location = 'KITCHEN' THEN bi.line_total - bi.discount_amount END), 0), NVL(SUM(CASE WHEN oi.prep_location = 'BAR' THEN bi.line_total - bi.discount_amount END), 0)
      INTO l_rev, l_food_rev, l_bev_rev FROM bill_items bi JOIN bills b ON b.bill_id = bi.bill_id JOIN order_items oi ON oi.order_item_id = bi.order_item_id
     WHERE b.branch_id = api_pkg.current_branch_id AND b.status IN ('PAID','CLOSED') AND b.paid_at BETWEEN p_from AND p_to;
    SELECT NVL(SUM(m.total_cost), 0), NVL(SUM(CASE WHEN c.cat_kind IN ('BEVERAGE','BOTTLE') THEN 0 ELSE m.total_cost END), 0), NVL(SUM(CASE WHEN c.cat_kind IN ('BEVERAGE','BOTTLE') THEN m.total_cost ELSE 0 END), 0)
      INTO l_cogs, l_food_cogs, l_bev_cogs FROM stock_movements m JOIN inventory_items i ON i.inv_item_id = m.inv_item_id JOIN inventory_categories c ON c.inv_cat_id = i.inv_cat_id
     WHERE m.branch_id = api_pkg.current_branch_id AND m.mvt_type = 'SALE_CONSUMPTION' AND m.created_at BETWEEN p_from AND p_to;
    SELECT NVL(SUM(total_cost), 0) INTO l_waste FROM stock_movements WHERE branch_id = api_pkg.current_branch_id AND mvt_type IN ('WASTAGE','DAMAGE') AND created_at BETWEEN p_from AND p_to;
    SELECT NVL(SUM(order_discount_total), 0) INTO l_disc FROM bills WHERE branch_id = api_pkg.current_branch_id AND status IN ('PAID','CLOSED') AND paid_at BETWEEN p_from AND p_to;
    j.put('revenue', ROUND(l_rev, 2)); j.put('foodRevenue', ROUND(l_food_rev, 2)); j.put('beverageRevenue', ROUND(l_bev_rev, 2));
    j.put('cogs', ROUND(l_cogs, 2)); j.put('foodCogs', ROUND(l_food_cogs, 2)); j.put('beverageCogs', ROUND(l_bev_cogs, 2));
    j.put('grossProfit', ROUND(l_rev - l_cogs, 2)); j.put('grossMarginPercent', CASE WHEN l_rev > 0 THEN ROUND((l_rev - l_cogs) * 100 / l_rev, 1) ELSE 0 END);
    j.put('foodCostPercent', CASE WHEN l_food_rev > 0 THEN ROUND(l_food_cogs * 100 / l_food_rev, 1) ELSE 0 END); j.put('beverageCostPercent', CASE WHEN l_bev_rev > 0 THEN ROUND(l_bev_cogs * 100 / l_bev_rev, 1) ELSE 0 END);
    j.put('wastageCost', ROUND(l_waste, 2)); j.put('discountsGiven', ROUND(l_disc, 2));
    RETURN j;
  END;

  FUNCTION staff_performance(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('reports:advanced');
    FOR r IN (SELECT u.user_id, u.full_name, COUNT(DISTINCT o.order_id) orders_cnt, COUNT(DISTINCT o.table_id) tables_cnt,
                     NVL(SUM(CASE WHEN b.status IN ('PAID','CLOSED') THEN b.grand_total END), 0) sales, COUNT(DISTINCT CASE WHEN b.status IN ('PAID','CLOSED') THEN b.bill_id END) bills,
                     SUM(CASE WHEN o.status = 'CANCELLED' THEN 1 ELSE 0 END) cancelled, NVL(SUM(ci.c), 0) cancelled_items
                FROM users u JOIN orders o ON o.waiter_id = u.user_id LEFT JOIN bills b ON b.order_id = o.order_id AND b.status <> 'VOID'
                LEFT JOIN (SELECT order_id, COUNT(*) c FROM order_items WHERE status = 'CANCELLED' GROUP BY order_id) ci ON ci.order_id = o.order_id
               WHERE o.branch_id = api_pkg.current_branch_id AND o.created_at BETWEEN p_from AND p_to GROUP BY u.user_id, u.full_name ORDER BY sales DESC) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('userId', r.user_id); o.put('fullName', r.full_name); o.put('ordersHandled', r.orders_cnt); o.put('tablesServed', r.tables_cnt); o.put('sales', ROUND(r.sales, 2)); o.put('bills', r.bills); o.put('averageBill', CASE WHEN r.bills > 0 THEN ROUND(r.sales / r.bills, 2) ELSE 0 END); o.put('cancelledOrders', r.cancelled); o.put('cancelledItems', r.cancelled_items); a.append(o); END;
    END LOOP;
    RETURN a;
  END;
END report2_pkg;
/
