-- =====================================================================
-- PHASE 2 — CUSTOMER_PKG (CRM, consent-aware) & LOYALTY_PKG (points ledger)
-- =====================================================================

CREATE OR REPLACE PACKAGE loyalty_pkg AS
  FUNCTION program_json RETURN JSON_OBJECT_T;
  PROCEDURE save_program(p_body JSON_OBJECT_T);
  FUNCTION account_json(p_customer_id NUMBER) RETURN JSON_OBJECT_T;   -- creates the account lazily
  FUNCTION ensure_account(p_customer_id NUMBER) RETURN NUMBER;
  PROCEDURE earn_for_bill(p_bill_id NUMBER);                          -- hook: bill closed
  PROCEDURE redeem_on_bill(p_bill_id NUMBER, p_points NUMBER);        -- creates a LOYALTY payment
  PROCEDURE reverse_redemption(p_payment_id NUMBER);                  -- hook: payment reversed
  PROCEDURE adjust(p_customer_id NUMBER, p_points NUMBER, p_notes VARCHAR2);   -- PROMO / correction
  PROCEDURE expire_points;                                            -- batch job
END loyalty_pkg;
/

CREATE OR REPLACE PACKAGE customer_pkg AS
  FUNCTION customer_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION list_json(p_search VARCHAR2, p_limit NUMBER DEFAULT 100) RETURN JSON_ARRAY_T;
  FUNCTION save_customer(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE delete_customer(p_id NUMBER);
  FUNCTION history_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  PROCEDURE attach_to_order(p_order_id NUMBER, p_customer_id NUMBER);
  PROCEDURE record_visit(p_bill_id NUMBER);                            -- hook: bill closed
END customer_pkg;
/

CREATE OR REPLACE PACKAGE BODY customer_pkg AS
  FUNCTION customer_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    FOR r IN (SELECT c.*, la.points_balance, la.tier FROM customers c LEFT JOIN loyalty_accounts la ON la.customer_id = c.customer_id WHERE c.customer_id = p_id AND c.is_deleted = 'N') LOOP
      j.put('id', r.customer_id); j.put('fullName', r.full_name); j.put('phone', r.phone); j.put('email', r.email);
      j.put('birthday', TO_CHAR(r.birthday, 'YYYY-MM-DD')); j.put('anniversary', TO_CHAR(r.anniversary, 'YYYY-MM-DD')); j.put('tags', r.tags); j.put('notes', r.notes);
      j.put('consentMarketing', r.consent_marketing = 'Y'); j.put('consentAt', api_pkg.ts_iso(r.consent_at));
      j.put('totalVisits', r.total_visits); j.put('totalSpend', r.total_spend); j.put('averageSpend', CASE WHEN r.total_visits > 0 THEN ROUND(r.total_spend / r.total_visits, 2) ELSE 0 END);
      j.put('lastVisitAt', api_pkg.ts_iso(r.last_visit_at)); j.put('loyaltyPoints', NVL(r.points_balance, 0)); j.put('loyaltyTier', r.tier); j.put('createdAt', api_pkg.ts_iso(r.created_at));
      RETURN j;
    END LOOP;
    api_pkg.raise_not_found('Customer not found');
    RETURN NULL;
  END;

  FUNCTION list_json(p_search VARCHAR2, p_limit NUMBER) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('customers:view');
    FOR r IN (SELECT customer_id FROM (SELECT customer_id FROM customers WHERE is_deleted = 'N'
                 AND (p_search IS NULL OR LOWER(full_name) LIKE '%'||LOWER(p_search)||'%' OR phone LIKE '%'||p_search||'%' OR LOWER(email) LIKE '%'||LOWER(p_search)||'%')
                 ORDER BY last_visit_at DESC NULLS LAST, full_name) WHERE ROWNUM <= NVL(p_limit, 100)) LOOP
      a.append(customer_json(r.customer_id));
    END LOOP;
    RETURN a;
  END;

  FUNCTION save_customer(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_name VARCHAR2(150) := TRIM(p_body.get_string('fullName')); l_phone VARCHAR2(30) := REGEXP_REPLACE(p_body.get_string('phone'), '[^0-9+]', '');
    l_email VARCHAR2(150) := p_body.get_string('email'); l_tags VARCHAR2(300) := p_body.get_string('tags'); l_notes VARCHAR2(500) := p_body.get_string('notes');
    l_bday DATE; l_anniv DATE; l_consent CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('consentMarketing'), FALSE)); l_old_consent CHAR(1);
  BEGIN
    sec_pkg.assert_permission('customers:manage');
    IF l_name IS NULL THEN api_pkg.raise_validation('Name is required', 'fullName'); END IF;
    IF l_phone IS NULL OR LENGTH(l_phone) < 8 THEN api_pkg.raise_validation('A valid phone number is required', 'phone'); END IF;
    IF p_body.get_string('birthday') IS NOT NULL THEN l_bday := TO_DATE(p_body.get_string('birthday'), 'YYYY-MM-DD'); END IF;
    IF p_body.get_string('anniversary') IS NOT NULL THEN l_anniv := TO_DATE(p_body.get_string('anniversary'), 'YYYY-MM-DD'); END IF;
    IF l_id IS NULL THEN
      INSERT INTO customers (org_id, full_name, phone, email, birthday, anniversary, tags, notes, consent_marketing, consent_at, created_by)
      VALUES (1, l_name, l_phone, l_email, l_bday, l_anniv, l_tags, l_notes, l_consent, CASE WHEN l_consent = 'Y' THEN SYSTIMESTAMP END, api_pkg.current_user_id) RETURNING customer_id INTO l_id;
    ELSE
      SELECT consent_marketing INTO l_old_consent FROM customers WHERE customer_id = l_id AND is_deleted = 'N';
      UPDATE customers SET full_name = l_name, phone = l_phone, email = l_email, birthday = l_bday, anniversary = l_anniv, tags = l_tags, notes = l_notes,
             consent_marketing = l_consent, consent_at = CASE WHEN l_consent = 'Y' AND l_old_consent = 'N' THEN SYSTIMESTAMP WHEN l_consent = 'N' THEN NULL ELSE consent_at END,
             updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE customer_id = l_id;
    END IF;
    audit_pkg.log(CASE WHEN p_id IS NULL THEN 'CUSTOMER_CREATED' ELSE 'CUSTOMER_UPDATED' END, 'CUSTOMERS', l_id);   -- PII is not copied into the audit log
    RETURN l_id;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN api_pkg.raise_conflict('A customer with this phone number already exists'); RETURN NULL;
    WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Customer not found'); RETURN NULL;
  END;

  PROCEDURE delete_customer(p_id NUMBER) IS
  BEGIN
    sec_pkg.assert_permission('customers:manage');
    -- soft delete + anonymise (privacy): history rows keep the id, personal data is removed
    UPDATE customers SET is_deleted = 'Y', full_name = 'Deleted customer', phone = 'DEL-' || customer_id, email = NULL, birthday = NULL, anniversary = NULL, notes = NULL, tags = NULL,
           consent_marketing = 'N', updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE customer_id = p_id AND is_deleted = 'N';
    IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Customer not found'); END IF;
    audit_pkg.log('CUSTOMER_DELETED', 'CUSTOMERS', p_id);
  END;

  FUNCTION history_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); visits JSON_ARRAY_T := JSON_ARRAY_T(); favs JSON_ARRAY_T := JSON_ARRAY_T(); ltx JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('customers:view');
    j.put('customer', customer_json(p_id));
    FOR r IN (SELECT v.*, o.order_number, b.bill_number, b.grand_total FROM customer_visits v LEFT JOIN orders o ON o.order_id = v.order_id LEFT JOIN bills b ON b.bill_id = v.bill_id WHERE v.customer_id = p_id ORDER BY v.visited_at DESC) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('id', r.visit_id); o.put('orderId', r.order_id); o.put('orderNumber', r.order_number); o.put('billId', r.bill_id); o.put('billNumber', r.bill_number); o.put('amount', r.amount); o.put('visitedAt', api_pkg.ts_iso(r.visited_at)); visits.append(o); END;
    END LOOP;
    FOR r IN (SELECT * FROM (SELECT oi.item_name, SUM(oi.quantity) qty FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.customer_id = p_id AND oi.status <> 'CANCELLED' GROUP BY oi.item_name ORDER BY qty DESC) WHERE ROWNUM <= 5) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('itemName', r.item_name); o.put('quantity', r.qty); favs.append(o); END;
    END LOOP;
    FOR r IN (SELECT t.* FROM loyalty_transactions t JOIN loyalty_accounts a ON a.account_id = t.account_id WHERE a.customer_id = p_id ORDER BY t.created_at DESC) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('id', r.ltx_id); o.put('type', r.txn_type); o.put('points', r.points); o.put('amountRef', r.amount_ref); o.put('billId', r.bill_id); o.put('notes', r.notes); o.put('expiresAt', api_pkg.ts_iso(r.expires_at)); o.put('createdAt', api_pkg.ts_iso(r.created_at)); ltx.append(o); END;
    END LOOP;
    j.put('visits', visits); j.put('favouriteItems', favs); j.put('loyalty', loyalty_pkg.account_json(p_id)); j.put('loyaltyTransactions', ltx);
    RETURN j;
  END;

  PROCEDURE attach_to_order(p_order_id NUMBER, p_customer_id NUMBER) IS
    l_cnt NUMBER;
  BEGIN
    sec_pkg.assert_permission('customers:view');
    IF p_customer_id IS NOT NULL THEN
      SELECT COUNT(*) INTO l_cnt FROM customers WHERE customer_id = p_customer_id AND is_deleted = 'N';
      IF l_cnt = 0 THEN api_pkg.raise_not_found('Customer not found'); END IF;
    END IF;
    UPDATE orders SET customer_id = p_customer_id, updated_at = SYSTIMESTAMP WHERE order_id = p_order_id AND status NOT IN ('COMPLETED','CANCELLED');
    IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Active order not found'); END IF;
    UPDATE bills SET customer_id = p_customer_id WHERE order_id = p_order_id AND status <> 'VOID';
    audit_pkg.log('ORDER_CUSTOMER_SET', 'ORDERS', p_order_id, NULL, TO_CHAR(p_customer_id));
    audit_pkg.emit_event('orders', 'order.updated', p_order_id);
  END;

  PROCEDURE record_visit(p_bill_id NUMBER) IS
    b bills%ROWTYPE; l_cust NUMBER; l_cnt NUMBER;
  BEGIN
    SELECT * INTO b FROM bills WHERE bill_id = p_bill_id;
    SELECT NVL(b.customer_id, o.customer_id) INTO l_cust FROM orders o WHERE o.order_id = b.order_id;
    IF l_cust IS NULL THEN RETURN; END IF;
    SELECT COUNT(*) INTO l_cnt FROM customer_visits WHERE bill_id = p_bill_id;
    IF l_cnt > 0 THEN RETURN; END IF;   -- idempotent
    INSERT INTO customer_visits (customer_id, branch_id, order_id, bill_id, amount) VALUES (l_cust, b.branch_id, b.order_id, p_bill_id, b.grand_total);
    UPDATE customers SET total_visits = total_visits + 1, total_spend = total_spend + b.grand_total, last_visit_at = SYSTIMESTAMP WHERE customer_id = l_cust;
    IF b.customer_id IS NULL THEN UPDATE bills SET customer_id = l_cust WHERE bill_id = p_bill_id; END IF;
  EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
  END;
END customer_pkg;
/

CREATE OR REPLACE PACKAGE BODY loyalty_pkg AS
  FUNCTION program_row RETURN loyalty_programs%ROWTYPE IS
    p loyalty_programs%ROWTYPE;
  BEGIN
    SELECT * INTO p FROM loyalty_programs WHERE org_id = 1 AND ROWNUM = 1;
    RETURN p;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    INSERT INTO loyalty_programs (org_id, program_name) VALUES (1, 'Saffron Rewards');
    SELECT * INTO p FROM loyalty_programs WHERE org_id = 1 AND ROWNUM = 1;
    RETURN p;
  END;

  FUNCTION program_json RETURN JSON_OBJECT_T IS
    p loyalty_programs%ROWTYPE := program_row; j JSON_OBJECT_T := JSON_OBJECT_T(); l_members NUMBER; l_out NUMBER;
  BEGIN
    SELECT COUNT(*), NVL(SUM(points_balance), 0) INTO l_members, l_out FROM loyalty_accounts;
    j.put('id', p.program_id); j.put('name', p.program_name); j.put('pointsPer100', p.points_per_100); j.put('pointValue', p.point_value); j.put('minRedeemPoints', p.min_redeem_points);
    j.put('maxRedeemPercent', p.max_redeem_pct); j.put('expiryDays', p.expiry_days); j.put('isActive', p.is_active = 'Y'); j.put('memberCount', l_members); j.put('outstandingPoints', l_out); j.put('outstandingValue', ROUND(l_out * p.point_value, 2));
    RETURN j;
  END;

  PROCEDURE save_program(p_body JSON_OBJECT_T) IS
    p loyalty_programs%ROWTYPE := program_row;
    l_name VARCHAR2(100) := NVL(p_body.get_string('name'), p.program_name); l_ppc NUMBER := NVL(p_body.get_number('pointsPer100'), p.points_per_100); l_pv NUMBER := NVL(p_body.get_number('pointValue'), p.point_value);
    l_min NUMBER := NVL(p_body.get_number('minRedeemPoints'), p.min_redeem_points); l_max NUMBER := NVL(p_body.get_number('maxRedeemPercent'), p.max_redeem_pct); l_exp NUMBER := NVL(p_body.get_number('expiryDays'), p.expiry_days);
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), p.is_active = 'Y'));
  BEGIN
    -- Programme CONFIGURATION, not member management: rewriting the earn rate or the point value
    -- re-prices every point every member holds. Split from 'loyalty:manage' — see
    -- 11_migration_loyalty_configure.sql and docs/RBAC.md.
    sec_pkg.assert_permission('loyalty:configure');
    IF l_ppc < 0 OR l_pv < 0 OR l_min < 0 OR l_max < 0 OR l_max > 100 OR l_exp < 0 THEN api_pkg.raise_validation('Program values must be non-negative (max redeem ≤ 100 %)'); END IF;
    UPDATE loyalty_programs SET program_name = l_name, points_per_100 = l_ppc, point_value = l_pv, min_redeem_points = l_min, max_redeem_pct = l_max, expiry_days = l_exp, is_active = l_active WHERE program_id = p.program_id;
    audit_pkg.log('LOYALTY_PROGRAM_UPDATED', 'LOYALTY_PROGRAMS', p.program_id, NULL, p_body.to_clob);
  END;

  FUNCTION ensure_account(p_customer_id NUMBER) RETURN NUMBER IS
    l_id NUMBER; p loyalty_programs%ROWTYPE := program_row;
  BEGIN
    SELECT account_id INTO l_id FROM loyalty_accounts WHERE customer_id = p_customer_id;
    RETURN l_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    INSERT INTO loyalty_accounts (customer_id, program_id) VALUES (p_customer_id, p.program_id) RETURNING account_id INTO l_id;
    RETURN l_id;
  END;

  FUNCTION account_json(p_customer_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); l_acc NUMBER := ensure_account(p_customer_id); p loyalty_programs%ROWTYPE := program_row;
  BEGIN
    FOR r IN (SELECT * FROM loyalty_accounts WHERE account_id = l_acc) LOOP
      j.put('accountId', r.account_id); j.put('customerId', r.customer_id); j.put('pointsBalance', r.points_balance); j.put('lifetimePoints', r.lifetime_points); j.put('tier', r.tier);
      j.put('pointValue', p.point_value); j.put('balanceValue', ROUND(r.points_balance * p.point_value, 2)); j.put('minRedeemPoints', p.min_redeem_points); j.put('maxRedeemPercent', p.max_redeem_pct);
    END LOOP;
    RETURN j;
  END;

  PROCEDURE post_txn(p_acc NUMBER, p_type VARCHAR2, p_points NUMBER, p_amount NUMBER, p_bill NUMBER, p_payment NUMBER, p_ref NUMBER, p_notes VARCHAR2, p_expires TIMESTAMP) IS
  BEGIN
    INSERT INTO loyalty_transactions (account_id, txn_type, points, amount_ref, bill_id, payment_id, ref_ltx_id, notes, expires_at, created_by)
    VALUES (p_acc, p_type, p_points, p_amount, p_bill, p_payment, p_ref, p_notes, p_expires, api_pkg.current_user_id);
    UPDATE loyalty_accounts SET points_balance = points_balance + p_points, lifetime_points = lifetime_points + GREATEST(p_points, 0),
           tier = CASE WHEN lifetime_points + GREATEST(p_points, 0) >= 5000 THEN 'PLATINUM' WHEN lifetime_points + GREATEST(p_points, 0) >= 2000 THEN 'GOLD' ELSE 'SILVER' END
     WHERE account_id = p_acc;
  END;

  PROCEDURE earn_for_bill(p_bill_id NUMBER) IS
    b bills%ROWTYPE; p loyalty_programs%ROWTYPE := program_row; l_cust NUMBER; l_points NUMBER; l_acc NUMBER; l_cnt NUMBER; l_base NUMBER;
  BEGIN
    IF p.is_active = 'N' THEN RETURN; END IF;
    SELECT * INTO b FROM bills WHERE bill_id = p_bill_id;
    SELECT NVL(b.customer_id, o.customer_id) INTO l_cust FROM orders o WHERE o.order_id = b.order_id;
    IF l_cust IS NULL THEN RETURN; END IF;
    SELECT COUNT(*) INTO l_cnt FROM loyalty_transactions t JOIN loyalty_accounts a ON a.account_id = t.account_id WHERE t.bill_id = p_bill_id AND t.txn_type = 'EARN';
    IF l_cnt > 0 THEN RETURN; END IF;   -- idempotent
    -- points earned on amount actually paid by money (not on points redeemed)
    SELECT NVL(SUM(amount), 0) INTO l_base FROM payments WHERE bill_id = p_bill_id AND status = 'SUCCESS' AND payment_method NOT IN ('LOYALTY','COMPLIMENTARY');
    l_points := FLOOR(l_base / 100 * p.points_per_100);
    IF l_points <= 0 THEN RETURN; END IF;
    l_acc := ensure_account(l_cust);
    post_txn(l_acc, 'EARN', l_points, l_base, p_bill_id, NULL, NULL, 'Earned on ' || b.bill_number, SYSTIMESTAMP + NUMTODSINTERVAL(p.expiry_days, 'DAY'));
    UPDATE bills SET loyalty_points_earned = l_points WHERE bill_id = p_bill_id;
    audit_pkg.log('LOYALTY_EARN', 'BILLS', p_bill_id, NULL, l_points || ' points');
  EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
  END;

  PROCEDURE redeem_on_bill(p_bill_id NUMBER, p_points NUMBER) IS
    b bills%ROWTYPE; p loyalty_programs%ROWTYPE := program_row; l_cust NUMBER; l_acc NUMBER; l_bal NUMBER; l_value NUMBER; l_balance_due NUMBER; l_max_value NUMBER; l_pay NUMBER; l_no VARCHAR2(30);
  BEGIN
    sec_pkg.assert_permission('loyalty:redeem');
    IF p.is_active = 'N' THEN api_pkg.raise_business('Loyalty program is inactive'); END IF;
    SELECT * INTO b FROM bills WHERE bill_id = p_bill_id FOR UPDATE;
    IF b.status NOT IN ('FINALIZED') THEN api_pkg.raise_business('Finalize the bill before redeeming points'); END IF;
    SELECT NVL(b.customer_id, o.customer_id) INTO l_cust FROM orders o WHERE o.order_id = b.order_id;
    IF l_cust IS NULL THEN api_pkg.raise_business('Attach a customer to the order to redeem points'); END IF;
    IF p_points IS NULL OR p_points <= 0 THEN api_pkg.raise_validation('Points must be positive', 'points'); END IF;
    IF p_points < p.min_redeem_points THEN api_pkg.raise_validation('Minimum redemption is ' || p.min_redeem_points || ' points', 'points'); END IF;
    l_acc := ensure_account(l_cust);
    SELECT points_balance INTO l_bal FROM loyalty_accounts WHERE account_id = l_acc FOR UPDATE;
    IF p_points > l_bal THEN api_pkg.raise_validation('Customer has only ' || l_bal || ' points', 'points'); END IF;
    l_value := ROUND(p_points * p.point_value, 2);
    l_balance_due := b.grand_total - b.paid_amount;
    l_max_value := ROUND(b.grand_total * p.max_redeem_pct / 100, 2);
    IF l_value > l_max_value THEN api_pkg.raise_validation('Points can cover at most ' || p.max_redeem_pct || '% of the bill (' || l_max_value || ')', 'points'); END IF;
    IF l_value > l_balance_due THEN api_pkg.raise_validation('Redemption value ' || l_value || ' exceeds balance due ' || l_balance_due, 'points'); END IF;
    l_no := numbering_pkg.next_payment_number;
    INSERT INTO payments (payment_number, bill_id, payment_method, amount, reference_no, received_by) VALUES (l_no, p_bill_id, 'LOYALTY', l_value, p_points || ' pts', api_pkg.current_user_id) RETURNING payment_id INTO l_pay;
    post_txn(l_acc, 'REDEEM', -p_points, l_value, p_bill_id, l_pay, NULL, 'Redeemed on ' || b.bill_number, NULL);
    billing_pkg.refresh_payment_status(p_bill_id);
    audit_pkg.log('LOYALTY_REDEEM', 'BILLS', p_bill_id, NULL, p_points || ' points = ' || l_value);
    audit_pkg.emit_event('bills', 'payment.received', p_bill_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Bill not found');
  END;

  PROCEDURE reverse_redemption(p_payment_id NUMBER) IS
  BEGIN
    FOR t IN (SELECT * FROM loyalty_transactions WHERE payment_id = p_payment_id AND txn_type = 'REDEEM') LOOP
      post_txn(t.account_id, 'REVERSAL', -t.points, t.amount_ref, t.bill_id, p_payment_id, t.ltx_id, 'Payment reversed', NULL);
    END LOOP;
  END;

  PROCEDURE adjust(p_customer_id NUMBER, p_points NUMBER, p_notes VARCHAR2) IS
    l_acc NUMBER; l_bal NUMBER;
  BEGIN
    sec_pkg.assert_permission('loyalty:manage');
    IF p_points IS NULL OR p_points = 0 THEN api_pkg.raise_validation('Points must be non-zero', 'points'); END IF;
    IF TRIM(p_notes) IS NULL THEN api_pkg.raise_validation('A note is required', 'notes'); END IF;
    l_acc := ensure_account(p_customer_id);
    SELECT points_balance INTO l_bal FROM loyalty_accounts WHERE account_id = l_acc;
    IF l_bal + p_points < 0 THEN api_pkg.raise_validation('Balance cannot go negative', 'points'); END IF;
    post_txn(l_acc, 'PROMO', p_points, NULL, NULL, NULL, NULL, p_notes, NULL);
    audit_pkg.log('LOYALTY_ADJUST', 'CUSTOMERS', p_customer_id, NULL, p_points || ' — ' || p_notes);
  END;

  PROCEDURE expire_points IS
  BEGIN
    FOR t IN (SELECT t.account_id, SUM(t.points) pts FROM loyalty_transactions t WHERE t.txn_type = 'EARN' AND t.expires_at < SYSTIMESTAMP
               AND NOT EXISTS (SELECT 1 FROM loyalty_transactions x WHERE x.ref_ltx_id = t.ltx_id AND x.txn_type = 'EXPIRE') GROUP BY t.account_id) LOOP
      DECLARE l_bal NUMBER; l_exp NUMBER;
      BEGIN
        SELECT points_balance INTO l_bal FROM loyalty_accounts WHERE account_id = t.account_id;
        l_exp := LEAST(l_bal, t.pts);
        IF l_exp > 0 THEN post_txn(t.account_id, 'EXPIRE', -l_exp, NULL, NULL, NULL, NULL, 'Points expired', NULL); END IF;
        UPDATE loyalty_transactions SET expires_at = NULL WHERE account_id = t.account_id AND txn_type = 'EARN' AND expires_at < SYSTIMESTAMP;
      END;
    END LOOP;
  END;
END loyalty_pkg;
/
