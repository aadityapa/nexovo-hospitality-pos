-- =====================================================================
-- BILLING_PKG, PAYMENT_PKG, REPORT_PKG, USER_PKG
-- =====================================================================

CREATE OR REPLACE PACKAGE billing_pkg AS
  FUNCTION bill_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION list_bills(p_status VARCHAR2, p_pstatus VARCHAR2, p_search VARCHAR2, p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_ARRAY_T;
  FUNCTION create_bill(p_order_id NUMBER) RETURN NUMBER;
  PROCEDURE calculate(p_bill_id NUMBER);
  PROCEDURE add_discount(p_bill_id NUMBER, p_type VARCHAR2, p_value NUMBER, p_reason VARCHAR2, p_approver_id NUMBER, p_pin VARCHAR2);
  PROCEDURE void_discount(p_bill_id NUMBER, p_discount_id NUMBER);
  PROCEDURE finalize_bill(p_bill_id NUMBER);
  PROCEDURE close_bill(p_bill_id NUMBER);
  PROCEDURE refresh_payment_status(p_bill_id NUMBER);
  FUNCTION receipt_json(p_bill_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION round_amount(p_amount NUMBER, p_mode VARCHAR2) RETURN NUMBER;
END billing_pkg;
/
CREATE OR REPLACE PACKAGE BODY billing_pkg AS

  FUNCTION round_amount(p_amount NUMBER, p_mode VARCHAR2) RETURN NUMBER IS
  BEGIN
    RETURN CASE p_mode WHEN 'NEAREST' THEN ROUND(p_amount) WHEN 'UP' THEN CEIL(p_amount) WHEN 'DOWN' THEN FLOOR(p_amount) ELSE ROUND(p_amount, 2) END;
  END;

  FUNCTION bill_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    b bills%ROWTYPE; j JSON_OBJECT_T := JSON_OBJECT_T(); items JSON_ARRAY_T := JSON_ARRAY_T(); taxes JSON_ARRAY_T := JSON_ARRAY_T();
    discs JSON_ARRAY_T := JSON_ARRAY_T(); pays JSON_ARRAY_T := JSON_ARRAY_T();
    l_order_no VARCHAR2(30); l_table VARCHAR2(60); l_tnum VARCHAR2(20); l_cashier VARCHAR2(150); l_waiter VARCHAR2(150); l_table_id NUMBER;
    l_customer VARCHAR2(150);
  BEGIN
    SELECT * INTO b FROM bills WHERE bill_id = p_id;
    IF b.customer_id IS NOT NULL THEN
      BEGIN SELECT full_name INTO l_customer FROM customers WHERE customer_id = b.customer_id; EXCEPTION WHEN NO_DATA_FOUND THEN l_customer := NULL; END;
    END IF;
    SELECT o.order_number, t.table_name, t.table_number, t.table_id, u.full_name INTO l_order_no, l_table, l_tnum, l_table_id, l_waiter
      FROM orders o JOIN dining_tables t ON t.table_id = o.table_id JOIN users u ON u.user_id = o.waiter_id WHERE o.order_id = b.order_id;
    SELECT full_name INTO l_cashier FROM users WHERE user_id = b.cashier_id;
    FOR r IN (SELECT bi.*, oi.status AS oi_status, oi.notes, oi.prep_location FROM bill_items bi JOIN order_items oi ON oi.order_item_id = bi.order_item_id WHERE bi.bill_id = p_id ORDER BY bi.bill_item_id) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN
        o.put('id', r.bill_item_id); o.put('orderItemId', r.order_item_id); o.put('itemName', r.item_name); o.put('quantity', r.quantity);
        o.put('unitPrice', r.unit_price); o.put('lineTotal', r.line_total); o.put('discountAmount', r.discount_amount); o.put('taxableAmount', r.taxable_amount);
        o.put('taxGroupId', r.tax_group_id); o.put('taxPercent', r.tax_pct); o.put('taxAmount', r.tax_amount); o.put('offerId', r.offer_id);
        o.put('notes', r.notes); o.put('prepLocation', r.prep_location);
        items.append(o);
      END;
    END LOOP;
    FOR r IN (SELECT * FROM bill_taxes WHERE bill_id = p_id ORDER BY component_code) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('code', r.component_code); o.put('name', r.component_name); o.put('percent', r.rate_pct); o.put('taxableAmount', r.taxable_amount); o.put('amount', r.tax_amount); taxes.append(o); END;
    END LOOP;
    FOR r IN (SELECT d.*, a.full_name applied_name, ap.full_name approved_name FROM discounts d JOIN users a ON a.user_id = d.applied_by LEFT JOIN users ap ON ap.user_id = d.approved_by WHERE d.bill_id = p_id ORDER BY d.discount_id) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN
        o.put('id', r.discount_id); o.put('billId', r.bill_id); o.put('discountType', r.discount_type); o.put('value', r.discount_value); o.put('amount', r.discount_amount);
        o.put('reason', r.reason); o.put('offerId', r.offer_id); o.put('appliedBy', r.applied_by); o.put('appliedByName', r.applied_name);
        o.put('approvedBy', r.approved_by); o.put('approvedByName', r.approved_name); o.put('isVoided', r.is_voided = 'Y'); o.put('createdAt', api_pkg.ts_iso(r.created_at));
        discs.append(o);
      END;
    END LOOP;
    FOR r IN (SELECT p.*, u.full_name FROM payments p JOIN users u ON u.user_id = p.received_by WHERE p.bill_id = p_id ORDER BY p.payment_id) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN
        o.put('id', r.payment_id); o.put('paymentNumber', r.payment_number); o.put('billId', r.bill_id); o.put('method', r.payment_method); o.put('amount', r.amount);
        o.put('reference', r.reference_no); o.put('status', r.status); o.put('receivedBy', r.received_by); o.put('receivedByName', r.full_name);
        o.put('createdAt', api_pkg.ts_iso(r.received_at)); o.put('reversedAt', api_pkg.ts_iso(r.reversed_at)); o.put('reversalReason', r.reversal_reason);
        pays.append(o);
      END;
    END LOOP;
    j.put('id', b.bill_id); j.put('billNumber', b.bill_number); j.put('branchId', b.branch_id); j.put('orderId', b.order_id); j.put('orderNumber', l_order_no);
    j.put('tableId', l_table_id); j.put('tableName', l_table); j.put('tableNumber', l_tnum); j.put('waiterName', l_waiter);
    j.put('cashierId', b.cashier_id); j.put('cashierName', l_cashier); j.put('status', b.status); j.put('paymentStatus', b.payment_status);
    j.put('items', items); j.put('subtotal', b.subtotal); j.put('itemDiscountTotal', b.item_discount_total); j.put('orderDiscountTotal', b.order_discount_total);
    j.put('discountTotal', b.item_discount_total + b.order_discount_total); j.put('serviceChargePercent', b.service_charge_pct); j.put('serviceChargeAmount', b.service_charge_amt);
    j.put('taxLines', taxes); j.put('taxTotal', b.tax_total); j.put('minSpendShortfall', b.min_spend_shortfall); j.put('roundOff', b.round_off); j.put('grandTotal', b.grand_total);
    j.put('customerId', b.customer_id); j.put('customerName', l_customer); j.put('loyaltyPointsEarned', b.loyalty_points_earned);
    j.put('paidAmount', b.paid_amount); j.put('balanceDue', b.grand_total - b.paid_amount); j.put('discounts', discs); j.put('payments', pays);
    j.put('notes', b.notes); j.put('createdAt', api_pkg.ts_iso(b.created_at)); j.put('finalizedAt', api_pkg.ts_iso(b.finalized_at));
    j.put('paidAt', api_pkg.ts_iso(b.paid_at)); j.put('closedAt', api_pkg.ts_iso(b.closed_at));
    RETURN j;
  END;

  FUNCTION list_bills(p_status VARCHAR2, p_pstatus VARCHAR2, p_search VARCHAR2, p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('billing:view');
    FOR r IN (SELECT b.bill_id FROM bills b JOIN orders o ON o.order_id = b.order_id JOIN dining_tables t ON t.table_id = o.table_id
               WHERE b.branch_id = api_pkg.current_branch_id
                 AND (p_status IS NULL OR b.status = p_status) AND (p_pstatus IS NULL OR b.payment_status = p_pstatus)
                 AND (p_from IS NULL OR b.created_at >= p_from) AND (p_to IS NULL OR b.created_at <= p_to)
                 AND (p_search IS NULL OR LOWER(b.bill_number) LIKE '%'||LOWER(p_search)||'%' OR LOWER(o.order_number) LIKE '%'||LOWER(p_search)||'%' OR LOWER(t.table_name) LIKE '%'||LOWER(p_search)||'%')
               ORDER BY b.created_at DESC) LOOP
      a.append(bill_json(r.bill_id));
    END LOOP; RETURN a;
  END;

  FUNCTION create_bill(p_order_id NUMBER) RETURN NUMBER IS
    o orders%ROWTYPE; b branches%ROWTYPE; l_id NUMBER; l_disc NUMBER; l_offer NUMBER; l_cat NUMBER; l_no VARCHAR2(30);
  BEGIN
    sec_pkg.assert_permission('billing:create');
    SELECT * INTO o FROM orders WHERE order_id = p_order_id FOR UPDATE;
    BEGIN SELECT bill_id INTO l_id FROM bills WHERE order_id = p_order_id AND status <> 'VOID'; RETURN l_id; EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
    IF o.status IN ('DRAFT','CANCELLED','COMPLETED') THEN api_pkg.raise_business('Order in status ' || o.status || ' cannot be billed'); END IF;
    SELECT * INTO b FROM branches WHERE branch_id = o.branch_id;
    l_no := numbering_pkg.next_bill_number;   -- does DML: resolve outside the INSERT
    INSERT INTO bills (bill_number, branch_id, order_id, cashier_id, service_charge_pct, created_by)
    VALUES (l_no, o.branch_id, p_order_id, api_pkg.current_user_id, b.service_charge_pct, api_pkg.current_user_id)
    RETURNING bill_id INTO l_id;
    -- Rule 5: snapshot from ORDER_ITEMS (historical prices), non-cancelled only
    FOR i IN (SELECT oi.*, mi.category_id FROM order_items oi JOIN menu_items mi ON mi.item_id = oi.item_id WHERE oi.order_id = p_order_id AND oi.status <> 'CANCELLED' ORDER BY oi.order_item_id) LOOP
      offer_pkg.best_item_discount(i.item_id, i.category_id, i.unit_price, i.quantity, l_disc, l_offer);
      INSERT INTO bill_items (bill_id, order_item_id, item_name, quantity, unit_price, line_total, discount_amount, tax_group_id, offer_id)
      VALUES (l_id, i.order_item_id, i.item_name, i.quantity, i.unit_price, i.line_total, NVL(l_disc,0), i.tax_group_id, l_offer);
    END LOOP;
    calculate(l_id);
    audit_pkg.log('BILL_CREATED', 'BILLS', l_id, NULL, 'order ' || o.order_number);
    audit_pkg.emit_event('bills', 'bill.created', l_id);
    RETURN l_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Order not found'); RETURN NULL;
  END;

  -- Section 26: ITEM TOTAL → SUBTOTAL → ITEM DISCOUNTS → ORDER DISCOUNT → SERVICE CHARGE → TAX → ROUNDING → GRAND TOTAL
  PROCEDURE calculate(p_bill_id NUMBER) IS
    b bills%ROWTYPE; br branches%ROWTYPE;
    l_sub NUMBER := 0; l_item_disc NUMBER := 0; l_order_disc NUMBER := 0; l_net NUMBER; l_sc NUMBER; l_tax NUMBER := 0; l_raw NUMBER; l_grand NUMBER; l_short NUMBER := 0;
    l_after_item NUMBER; l_share NUMBER; l_taxable NUMBER; l_line_tax NUMBER; l_pct NUMBER;
    -- key = component_code(20) |component_name(80) |rate — must be wide enough for all three
    TYPE t_map IS TABLE OF NUMBER INDEX BY VARCHAR2(200);
    m_taxable t_map; m_tax t_map; k VARCHAR2(200);
  BEGIN
    SELECT * INTO b FROM bills WHERE bill_id = p_bill_id FOR UPDATE;
    SELECT * INTO br FROM branches WHERE branch_id = b.branch_id;
    SELECT NVL(SUM(line_total),0), NVL(SUM(discount_amount),0) INTO l_sub, l_item_disc FROM bill_items WHERE bill_id = p_bill_id;
    l_after_item := l_sub - l_item_disc;
    -- order-level discounts: percentage on post-item-discount amount, flat as-is; capped to remaining
    FOR d IN (SELECT * FROM discounts WHERE bill_id = p_bill_id AND is_voided = 'N' ORDER BY discount_id) LOOP
      DECLARE l_amt NUMBER;
      BEGIN
        l_amt := CASE d.discount_type WHEN 'PERCENTAGE' THEN ROUND(l_after_item * d.discount_value / 100, 2) ELSE d.discount_value END;
        l_amt := LEAST(l_amt, GREATEST(l_after_item - l_order_disc, 0));
        UPDATE discounts SET discount_amount = l_amt WHERE discount_id = d.discount_id;
        l_order_disc := l_order_disc + l_amt;
      END;
    END LOOP;
    l_net := l_after_item - l_order_disc;
    l_sc := ROUND(l_net * b.service_charge_pct / 100, 2);
    DELETE FROM bill_taxes WHERE bill_id = p_bill_id;
    FOR i IN (SELECT * FROM bill_items WHERE bill_id = p_bill_id) LOOP
      l_share := CASE WHEN l_after_item > 0 THEN ROUND(l_order_disc * (i.line_total - i.discount_amount) / l_after_item, 2) ELSE 0 END;
      l_taxable := i.line_total - i.discount_amount - l_share;
      IF br.tax_on_service_chg = 'Y' AND l_net > 0 THEN l_taxable := l_taxable + ROUND(l_sc * (i.line_total - i.discount_amount - l_share) / l_net, 2); END IF;
      l_line_tax := 0; l_pct := 0;
      FOR c IN (SELECT * FROM tax_components WHERE tax_group_id = i.tax_group_id) LOOP
        k := c.component_code || '|' || c.component_name || '|' || TO_CHAR(c.rate_pct);
        IF NOT m_taxable.EXISTS(k) THEN m_taxable(k) := 0; m_tax(k) := 0; END IF;
        m_taxable(k) := m_taxable(k) + l_taxable;
        m_tax(k) := m_tax(k) + ROUND(l_taxable * c.rate_pct / 100, 2);
        l_line_tax := l_line_tax + ROUND(l_taxable * c.rate_pct / 100, 2); l_pct := l_pct + c.rate_pct;
      END LOOP;
      UPDATE bill_items SET taxable_amount = l_taxable, tax_pct = l_pct, tax_amount = l_line_tax WHERE bill_item_id = i.bill_item_id;
      l_tax := l_tax + l_line_tax;
    END LOOP;
    k := m_taxable.FIRST;
    WHILE k IS NOT NULL LOOP
      INSERT INTO bill_taxes (bill_id, component_code, component_name, rate_pct, taxable_amount, tax_amount)
      VALUES (p_bill_id, SUBSTR(k, 1, INSTR(k,'|')-1), SUBSTR(k, INSTR(k,'|')+1, INSTR(k,'|',1,2)-INSTR(k,'|')-1), TO_NUMBER(SUBSTR(k, INSTR(k,'|',1,2)+1)), m_taxable(k), m_tax(k));
      k := m_taxable.NEXT(k);
    END LOOP;
    -- Phase 2: VIP minimum-spend shortfall (rule configured per branch; non-taxable line)
    l_short := vip_pkg.shortfall_for_order(b.order_id, l_net);
    l_raw := l_net + l_sc + l_tax + l_short;
    l_grand := round_amount(l_raw, br.rounding_mode);
    UPDATE bills SET subtotal = l_sub, item_discount_total = l_item_disc, order_discount_total = l_order_disc, service_charge_amt = l_sc,
           tax_total = l_tax, min_spend_shortfall = l_short, round_off = ROUND(l_grand - l_raw, 2), grand_total = l_grand, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
     WHERE bill_id = p_bill_id;
    refresh_payment_status(p_bill_id);
  END;

  PROCEDURE add_discount(p_bill_id NUMBER, p_type VARCHAR2, p_value NUMBER, p_reason VARCHAR2, p_approver_id NUMBER, p_pin VARCHAR2) IS
    b bills%ROWTYPE; l_pct NUMBER; l_cap NUMBER; l_approver NUMBER; l_base NUMBER;
  BEGIN
    sec_pkg.assert_permission('billing:discount');
    SELECT * INTO b FROM bills WHERE bill_id = p_bill_id FOR UPDATE;
    IF b.status <> 'OPEN' THEN api_pkg.raise_business('Discounts can only be applied to an open bill'); END IF;
    IF p_type NOT IN ('PERCENTAGE','FLAT') THEN api_pkg.raise_validation('Invalid discount type', 'discountType'); END IF;
    IF p_value IS NULL OR p_value <= 0 THEN api_pkg.raise_validation('Discount value must be positive', 'value'); END IF;
    IF TRIM(p_reason) IS NULL THEN api_pkg.raise_validation('Discount reason is required', 'reason'); END IF;
    l_base := b.subtotal - b.item_discount_total;
    IF p_type = 'PERCENTAGE' THEN
      IF p_value > 100 THEN api_pkg.raise_validation('Percentage cannot exceed 100', 'value'); END IF;
      l_pct := p_value;
    ELSE
      IF p_value > l_base THEN api_pkg.raise_validation('Discount cannot exceed bill amount', 'value'); END IF;
      l_pct := CASE WHEN l_base > 0 THEN p_value * 100 / l_base ELSE 0 END;
    END IF;
    -- Section 27: cap by role; approval by user with orders:approve-discount and sufficient cap
    l_cap := sec_pkg.user_max_discount(api_pkg.current_user_id);
    IF l_pct > l_cap THEN
      IF p_approver_id IS NULL OR NOT sec_pkg.has_permission(p_approver_id, 'orders:approve-discount')
         OR sec_pkg.user_max_discount(p_approver_id) < l_pct OR NOT sec_pkg.verify_pin(p_approver_id, p_pin) THEN
        api_pkg.raise_forbidden('Discount of ' || ROUND(l_pct,1) || '% exceeds your limit of ' || l_cap || '%. Manager approval required.');
      END IF;
      l_approver := p_approver_id;
    END IF;
    INSERT INTO discounts (bill_id, discount_type, discount_value, discount_amount, reason, applied_by, approved_by)
    VALUES (p_bill_id, p_type, p_value, 0, SUBSTR(p_reason,1,300), api_pkg.current_user_id, l_approver);
    calculate(p_bill_id);
    audit_pkg.log('DISCOUNT_APPLIED', 'BILLS', p_bill_id, NULL, p_type || ' ' || p_value || ' (' || p_reason || ')');
    audit_pkg.emit_event('bills', 'bill.updated', p_bill_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Bill not found');
  END;

  PROCEDURE void_discount(p_bill_id NUMBER, p_discount_id NUMBER) IS
    l_status VARCHAR2(20);
  BEGIN
    sec_pkg.assert_permission('billing:discount');
    SELECT status INTO l_status FROM bills WHERE bill_id = p_bill_id FOR UPDATE;
    IF l_status <> 'OPEN' THEN api_pkg.raise_business('Bill is no longer open'); END IF;
    UPDATE discounts SET is_voided = 'Y', voided_at = SYSTIMESTAMP, voided_by = api_pkg.current_user_id WHERE discount_id = p_discount_id AND bill_id = p_bill_id;
    calculate(p_bill_id);
    audit_pkg.log('DISCOUNT_VOIDED', 'DISCOUNTS', p_discount_id);
    audit_pkg.emit_event('bills', 'bill.updated', p_bill_id);
  END;

  PROCEDURE finalize_bill(p_bill_id NUMBER) IS
    b bills%ROWTYPE;
  BEGIN
    sec_pkg.assert_permission('billing:create');
    SELECT * INTO b FROM bills WHERE bill_id = p_bill_id FOR UPDATE;
    IF b.status <> 'OPEN' THEN api_pkg.raise_conflict('Bill is already ' || LOWER(b.status)); END IF;
    calculate(p_bill_id);
    UPDATE bills SET status = 'FINALIZED', finalized_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE bill_id = p_bill_id;
    order_pkg.set_order_status(b.order_id, 'BILLED', 'bill ' || b.bill_number || ' finalized');
    audit_pkg.log('BILL_FINALIZED', 'BILLS', p_bill_id);
    audit_pkg.emit_event('bills', 'bill.finalized', p_bill_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Bill not found');
  END;

  PROCEDURE refresh_payment_status(p_bill_id NUMBER) IS
    b bills%ROWTYPE; l_paid NUMBER; l_reversed NUMBER; l_ps VARCHAR2(20); l_status VARCHAR2(20);
  BEGIN
    SELECT * INTO b FROM bills WHERE bill_id = p_bill_id;
    SELECT NVL(SUM(CASE WHEN status='SUCCESS' THEN amount END),0), NVL(SUM(CASE WHEN status='REVERSED' THEN amount END),0) INTO l_paid, l_reversed FROM payments WHERE bill_id = p_bill_id;
    l_ps := CASE WHEN l_paid >= b.grand_total AND b.grand_total > 0 THEN 'PAID'
                 WHEN l_paid = 0 AND l_reversed > 0 THEN 'REFUNDED'
                 WHEN l_paid > 0 THEN 'PARTIALLY_PAID'
                 WHEN b.grand_total = 0 AND b.status IN ('FINALIZED','PAID','CLOSED') THEN 'PAID'
                 ELSE 'UNPAID' END;
    l_status := CASE WHEN b.status IN ('OPEN','VOID','CLOSED') THEN b.status WHEN l_ps = 'PAID' THEN 'PAID' ELSE 'FINALIZED' END;
    UPDATE bills SET paid_amount = l_paid, payment_status = l_ps, status = l_status,
           paid_at = CASE WHEN l_ps = 'PAID' AND paid_at IS NULL THEN SYSTIMESTAMP WHEN l_ps <> 'PAID' THEN NULL ELSE paid_at END
     WHERE bill_id = p_bill_id;
    IF b.status IN ('FINALIZED','PAID') THEN
      order_pkg.set_order_status(b.order_id, CASE WHEN l_ps = 'PAID' THEN 'PAID' ELSE 'BILLED' END, 'payment status ' || l_ps);
    END IF;
  END;

  PROCEDURE close_bill(p_bill_id NUMBER) IS
    b bills%ROWTYPE;
  BEGIN
    sec_pkg.assert_permission('billing:close');
    SELECT * INTO b FROM bills WHERE bill_id = p_bill_id FOR UPDATE;
    IF b.status = 'CLOSED' THEN RETURN; END IF;
    IF b.payment_status <> 'PAID' THEN api_pkg.raise_business('Bill must be fully paid before closing. Balance: ' || (b.grand_total - b.paid_amount)); END IF;
    UPDATE bills SET status = 'CLOSED', closed_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE bill_id = p_bill_id;
    order_pkg.set_order_status(b.order_id, 'COMPLETED', 'bill closed');
    -- Phase 2 hooks (all idempotent): stock (mode ON_BILL_CLOSE), CRM visit, loyalty points, VIP completion
    inventory_pkg.on_bill_closed(b.order_id);
    customer_pkg.record_visit(p_bill_id);
    loyalty_pkg.earn_for_bill(p_bill_id);
    vip_pkg.on_bill_closed(b.order_id);
    audit_pkg.log('BILL_CLOSED', 'BILLS', p_bill_id);
    audit_pkg.emit_event('bills', 'bill.closed', p_bill_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Bill not found');
  END;

  FUNCTION receipt_json(p_bill_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); biz JSON_OBJECT_T := JSON_OBJECT_T(); br branches%ROWTYPE; l_branch NUMBER;
  BEGIN
    sec_pkg.assert_permission('billing:view');
    SELECT branch_id INTO l_branch FROM bills WHERE bill_id = p_bill_id;
    SELECT * INTO br FROM branches WHERE branch_id = l_branch;
    biz.put('name', br.business_name); biz.put('branchName', br.branch_name); biz.put('address', br.address_line || CASE WHEN br.city IS NOT NULL THEN ', ' || br.city END);
    biz.put('phone', br.phone); biz.put('gstNumber', br.gst_number); biz.put('logoUrl', br.logo_url); biz.put('footer', br.receipt_footer); biz.put('currency', br.currency_code);
    j.put('business', biz); j.put('bill', bill_json(p_bill_id)); j.put('printedAt', api_pkg.ts_iso(SYSTIMESTAMP));
    RETURN j;
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Bill not found'); RETURN NULL;
  END;
END billing_pkg;
/

-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE payment_pkg AS
  PROCEDURE add_payment(p_bill_id NUMBER, p_method VARCHAR2, p_amount NUMBER, p_reference VARCHAR2);
  PROCEDURE reverse_payment(p_bill_id NUMBER, p_payment_id NUMBER, p_reason VARCHAR2);
END payment_pkg;
/
CREATE OR REPLACE PACKAGE BODY payment_pkg AS
  PROCEDURE add_payment(p_bill_id NUMBER, p_method VARCHAR2, p_amount NUMBER, p_reference VARCHAR2) IS
    b bills%ROWTYPE; l_balance NUMBER; l_id NUMBER; l_no VARCHAR2(30);
  BEGIN
    sec_pkg.assert_permission('billing:pay');
    SELECT * INTO b FROM bills WHERE bill_id = p_bill_id FOR UPDATE;
    IF b.status = 'OPEN' THEN api_pkg.raise_business('Finalize the bill before accepting payment'); END IF;
    IF b.status IN ('CLOSED','VOID') THEN api_pkg.raise_business('Bill is ' || LOWER(b.status)); END IF;
    IF p_method NOT IN ('CASH','UPI','CARD','COMPLIMENTARY') THEN api_pkg.raise_validation('Invalid payment method', 'method'); END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN api_pkg.raise_validation('Amount must be positive', 'amount'); END IF;
    l_balance := b.grand_total - b.paid_amount;
    IF p_amount > l_balance + 0.005 THEN api_pkg.raise_validation('Amount ' || p_amount || ' exceeds balance due ' || l_balance, 'amount'); END IF;
    IF p_method = 'COMPLIMENTARY' AND NOT sec_pkg.has_permission(api_pkg.current_user_id, 'orders:approve-discount') THEN
      api_pkg.raise_forbidden('Complimentary settlement requires manager authorization');
    END IF;
    l_no := numbering_pkg.next_payment_number;   -- does DML: resolve outside the INSERT
    INSERT INTO payments (payment_number, bill_id, payment_method, amount, reference_no, received_by)
    VALUES (l_no, p_bill_id, p_method, ROUND(p_amount,2), p_reference, api_pkg.current_user_id)
    RETURNING payment_id INTO l_id;
    INSERT INTO payment_transactions (payment_id, txn_type, gateway, amount, status, created_by)
    VALUES (l_id, 'CAPTURE', 'MANUAL', ROUND(p_amount,2), 'SUCCESS', api_pkg.current_user_id);
    billing_pkg.refresh_payment_status(p_bill_id);
    audit_pkg.log('PAYMENT_RECEIVED', 'PAYMENTS', l_id, NULL, p_method || ' ' || p_amount);
    audit_pkg.emit_event('bills', 'payment.received', p_bill_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Bill not found');
  END;

  -- Rule 7: never delete — reverse
  PROCEDURE reverse_payment(p_bill_id NUMBER, p_payment_id NUMBER, p_reason VARCHAR2) IS
    p payments%ROWTYPE; l_bstatus VARCHAR2(20);
  BEGIN
    sec_pkg.assert_permission('billing:refund');
    IF TRIM(p_reason) IS NULL THEN api_pkg.raise_validation('Reversal reason is required', 'reason'); END IF;
    SELECT * INTO p FROM payments WHERE payment_id = p_payment_id AND bill_id = p_bill_id FOR UPDATE;
    IF p.status = 'REVERSED' THEN api_pkg.raise_conflict('Payment already reversed'); END IF;
    SELECT status INTO l_bstatus FROM bills WHERE bill_id = p_bill_id;
    IF l_bstatus = 'CLOSED' AND NOT sec_pkg.has_permission(api_pkg.current_user_id, 'billing:edit-paid') THEN
      api_pkg.raise_forbidden('Reversing a payment on a closed bill requires admin authorization');
    END IF;
    UPDATE payments SET status = 'REVERSED', reversed_at = SYSTIMESTAMP, reversed_by = api_pkg.current_user_id, reversal_reason = SUBSTR(p_reason,1,300) WHERE payment_id = p_payment_id;
    INSERT INTO payment_transactions (payment_id, txn_type, gateway, amount, status, created_by)
    VALUES (p_payment_id, 'REVERSAL', 'MANUAL', p.amount, 'SUCCESS', api_pkg.current_user_id);
    IF l_bstatus = 'CLOSED' THEN UPDATE bills SET status = 'PAID', closed_at = NULL WHERE bill_id = p_bill_id; END IF;
    -- Phase 2: non-cash tenders are unwound in their own ledgers
    CASE p.payment_method
      WHEN 'LOYALTY'      THEN loyalty_pkg.reverse_redemption(p_payment_id);
      WHEN 'ROOM_CHARGE'  THEN room_charge_pkg.reverse(p_payment_id);
      WHEN 'COVER_CREDIT' THEN club_pkg.reverse_redemption(p_payment_id);
      ELSE NULL;
    END CASE;
    billing_pkg.refresh_payment_status(p_bill_id);
    audit_pkg.log('PAYMENT_REVERSED', 'PAYMENTS', p_payment_id, 'SUCCESS', 'REVERSED: ' || p_reason);
    audit_pkg.emit_event('bills', 'payment.reversed', p_bill_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Payment not found');
  END;
END payment_pkg;
/

-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE report_pkg AS
  FUNCTION dashboard_summary(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_OBJECT_T;
  FUNCTION sales_report(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_OBJECT_T;
  FUNCTION payment_report(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_OBJECT_T;
  FUNCTION order_report(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_OBJECT_T;
  FUNCTION item_report(p_from TIMESTAMP, p_to TIMESTAMP, p_limit NUMBER) RETURN JSON_OBJECT_T;
END report_pkg;
/
CREATE OR REPLACE PACKAGE BODY report_pkg AS
  FUNCTION sales_report(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); days JSON_ARRAY_T := JSON_ARRAY_T(); hours JSON_ARRAY_T := JSON_ARRAY_T();
    l_sales NUMBER; l_orders NUMBER; l_tax NUMBER; l_disc NUMBER; l_sc NUMBER;
  BEGIN
    sec_pkg.assert_permission('reports:view');
    SELECT NVL(SUM(grand_total),0), COUNT(*), NVL(SUM(tax_total),0), NVL(SUM(item_discount_total + order_discount_total),0), NVL(SUM(service_charge_amt),0)
      INTO l_sales, l_orders, l_tax, l_disc, l_sc FROM bills WHERE branch_id = api_pkg.current_branch_id AND status IN ('PAID','CLOSED') AND paid_at BETWEEN p_from AND p_to;
    FOR r IN (SELECT TRUNC(paid_at) d, SUM(grand_total) s, COUNT(*) c FROM bills WHERE branch_id = api_pkg.current_branch_id AND status IN ('PAID','CLOSED') AND paid_at BETWEEN p_from AND p_to GROUP BY TRUNC(paid_at) ORDER BY 1) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('date', TO_CHAR(r.d,'YYYY-MM-DD')); o.put('sales', r.s); o.put('orders', r.c); days.append(o); END;
    END LOOP;
    FOR r IN (SELECT TO_NUMBER(TO_CHAR(paid_at,'HH24')) h, SUM(grand_total) s, COUNT(*) c FROM bills WHERE branch_id = api_pkg.current_branch_id AND status IN ('PAID','CLOSED') AND paid_at BETWEEN p_from AND p_to GROUP BY TO_NUMBER(TO_CHAR(paid_at,'HH24')) ORDER BY 1) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('hour', r.h); o.put('sales', r.s); o.put('orders', r.c); hours.append(o); END;
    END LOOP;
    j.put('totalSales', l_sales); j.put('totalOrders', l_orders); j.put('averageOrderValue', CASE WHEN l_orders > 0 THEN ROUND(l_sales / l_orders, 2) ELSE 0 END);
    j.put('taxTotal', l_tax); j.put('discountTotal', l_disc); j.put('serviceChargeTotal', l_sc); j.put('byDay', days); j.put('byHour', hours);
    RETURN j;
  END;

  FUNCTION payment_report(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); a JSON_ARRAY_T := JSON_ARRAY_T(); l_total NUMBER := 0; l_refunded NUMBER := 0;
  BEGIN
    sec_pkg.assert_permission('reports:view');
    FOR r IN (SELECT p.payment_method m, SUM(CASE WHEN p.status='SUCCESS' THEN p.amount ELSE 0 END) amt, SUM(CASE WHEN p.status='SUCCESS' THEN 1 ELSE 0 END) cnt,
                     SUM(CASE WHEN p.status='REVERSED' THEN p.amount ELSE 0 END) rev
                FROM payments p JOIN bills b ON b.bill_id = p.bill_id WHERE b.branch_id = api_pkg.current_branch_id AND p.received_at BETWEEN p_from AND p_to
               GROUP BY p.payment_method ORDER BY 1) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('method', r.m); o.put('amount', r.amt); o.put('count', r.cnt); o.put('reversed', r.rev); a.append(o); END;
      l_total := l_total + r.amt; l_refunded := l_refunded + r.rev;
    END LOOP;
    j.put('byMethod', a); j.put('total', l_total); j.put('refunded', l_refunded);
    RETURN j;
  END;

  FUNCTION order_report(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); l_completed NUMBER; l_cancelled NUMBER; l_pending NUMBER; l_active NUMBER; l_total NUMBER; l_cancelled_items NUMBER;
  BEGIN
    sec_pkg.assert_permission('reports:view');
    SELECT COUNT(*), SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END), SUM(CASE WHEN status='CANCELLED' THEN 1 ELSE 0 END),
           SUM(CASE WHEN status IN ('BILL_REQUESTED','BILLED','PAID') THEN 1 ELSE 0 END), SUM(CASE WHEN status NOT IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END)
      INTO l_total, l_completed, l_cancelled, l_pending, l_active FROM orders WHERE branch_id = api_pkg.current_branch_id AND created_at BETWEEN p_from AND p_to;
    SELECT COUNT(*) INTO l_cancelled_items FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE o.branch_id = api_pkg.current_branch_id AND oi.cancelled_at BETWEEN p_from AND p_to;
    j.put('total', l_total); j.put('completed', l_completed); j.put('cancelled', l_cancelled); j.put('pending', l_pending); j.put('active', l_active); j.put('cancelledItems', l_cancelled_items);
    RETURN j;
  END;

  FUNCTION item_report(p_from TIMESTAMP, p_to TIMESTAMP, p_limit NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); a JSON_ARRAY_T := JSON_ARRAY_T(); cats JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('reports:view');
    FOR r IN (SELECT * FROM (SELECT oi.item_id, oi.item_name, mc.category_name, SUM(oi.quantity) qty, SUM(bi.line_total - bi.discount_amount) rev
                FROM bill_items bi JOIN bills b ON b.bill_id = bi.bill_id JOIN order_items oi ON oi.order_item_id = bi.order_item_id
                JOIN menu_items mi ON mi.item_id = oi.item_id JOIN menu_categories mc ON mc.category_id = mi.category_id
               WHERE b.branch_id = api_pkg.current_branch_id AND b.status IN ('PAID','CLOSED') AND b.paid_at BETWEEN p_from AND p_to
               GROUP BY oi.item_id, oi.item_name, mc.category_name ORDER BY qty DESC) WHERE ROWNUM <= NVL(p_limit, 20)) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('menuItemId', r.item_id); o.put('itemName', r.item_name); o.put('categoryName', r.category_name); o.put('quantity', r.qty); o.put('revenue', r.rev); a.append(o); END;
    END LOOP;
    FOR r IN (SELECT mc.category_name, SUM(oi.quantity) qty, SUM(bi.line_total - bi.discount_amount) rev
                FROM bill_items bi JOIN bills b ON b.bill_id = bi.bill_id JOIN order_items oi ON oi.order_item_id = bi.order_item_id
                JOIN menu_items mi ON mi.item_id = oi.item_id JOIN menu_categories mc ON mc.category_id = mi.category_id
               WHERE b.branch_id = api_pkg.current_branch_id AND b.status IN ('PAID','CLOSED') AND b.paid_at BETWEEN p_from AND p_to
               GROUP BY mc.category_name ORDER BY rev DESC) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('categoryName', r.category_name); o.put('quantity', r.qty); o.put('revenue', r.rev); cats.append(o); END;
    END LOOP;
    j.put('topItems', a); j.put('byCategory', cats);
    RETURN j;
  END;

  FUNCTION dashboard_summary(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); l_pending NUMBER; l_avail NUMBER; l_occ NUMBER; l_tot NUMBER;
    recent JSON_ARRAY_T := JSON_ARRAY_T(); pays JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('dashboard:view');
    j.put('sales', sales_report(p_from, p_to)); j.put('orders', order_report(p_from, p_to)); j.put('items', item_report(p_from, p_to, 5)); j.put('payments', payment_report(p_from, p_to));
    SELECT NVL(SUM(grand_total - paid_amount),0) INTO l_pending FROM bills WHERE branch_id = api_pkg.current_branch_id AND status IN ('FINALIZED') AND payment_status <> 'PAID';
    SELECT COUNT(*), SUM(CASE WHEN status='AVAILABLE' THEN 1 ELSE 0 END), SUM(CASE WHEN status<>'AVAILABLE' THEN 1 ELSE 0 END) INTO l_tot, l_avail, l_occ
      FROM dining_tables WHERE branch_id = api_pkg.current_branch_id AND is_deleted = 'N' AND is_active = 'Y';
    j.put('pendingPayments', l_pending); j.put('totalTables', l_tot); j.put('availableTables', l_avail); j.put('occupiedTables', l_occ);
    FOR r IN (SELECT order_id FROM (SELECT order_id FROM orders WHERE branch_id = api_pkg.current_branch_id ORDER BY created_at DESC) WHERE ROWNUM <= 8) LOOP recent.append(order_pkg.order_json(r.order_id)); END LOOP;
    FOR r IN (SELECT * FROM (SELECT p.payment_id, p.payment_number, p.payment_method, p.amount, p.received_at, b.bill_number FROM payments p JOIN bills b ON b.bill_id = p.bill_id WHERE b.branch_id = api_pkg.current_branch_id AND p.status='SUCCESS' ORDER BY p.received_at DESC) WHERE ROWNUM <= 8) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('id', r.payment_id); o.put('paymentNumber', r.payment_number); o.put('billNumber', r.bill_number); o.put('method', r.payment_method); o.put('amount', r.amount); o.put('createdAt', api_pkg.ts_iso(r.received_at)); pays.append(o); END;
    END LOOP;
    j.put('recentOrders', recent); j.put('recentPayments', pays);
    RETURN j;
  END;
END report_pkg;
/

-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE user_pkg AS
  FUNCTION list_users(p_search VARCHAR2, p_role VARCHAR2, p_status VARCHAR2) RETURN JSON_ARRAY_T;
  FUNCTION approvers_json RETURN JSON_ARRAY_T;
  FUNCTION staff_json(p_role VARCHAR2) RETURN JSON_ARRAY_T;
  FUNCTION save_user(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE set_status(p_id NUMBER, p_active BOOLEAN);
  FUNCTION roles_json RETURN JSON_ARRAY_T;
  FUNCTION permissions_json RETURN JSON_ARRAY_T;
  PROCEDURE update_role(p_id NUMBER, p_body JSON_OBJECT_T);
END user_pkg;
/
CREATE OR REPLACE PACKAGE BODY user_pkg AS
  -- Minimal directory of approvers (name/role only) — any authenticated staff may call this
  FUNCTION approvers_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    IF api_pkg.current_user_id IS NULL THEN api_pkg.raise_unauth; END IF;
    FOR r IN (SELECT u.user_id, u.full_name, LISTAGG(ro.role_name, ', ') WITHIN GROUP (ORDER BY ro.role_id) role_names
                FROM users u JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles ro ON ro.role_id = ur.role_id
               WHERE u.branch_id = api_pkg.current_branch_id AND u.is_active = 'Y' AND u.is_deleted = 'N' AND u.approval_pin_hash IS NOT NULL
                 AND EXISTS (SELECT 1 FROM v_user_permissions p WHERE p.user_id = u.user_id AND p.permission_code = 'orders:approve-discount')
               GROUP BY u.user_id, u.full_name ORDER BY u.full_name) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('id', r.user_id); o.put('fullName', r.full_name); o.put('role', r.role_names); o.put('maxDiscountPercent', sec_pkg.user_max_discount(r.user_id)); a.append(o); END;
    END LOOP;
    RETURN a;
  END;

  -- Lightweight staff directory (id/name/role only) for pickers such as host / promoter — any authenticated staff may call this
  FUNCTION staff_json(p_role VARCHAR2) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    IF api_pkg.current_user_id IS NULL THEN api_pkg.raise_unauth; END IF;
    FOR r IN (SELECT u.user_id, u.full_name, LISTAGG(ro.role_name, ', ') WITHIN GROUP (ORDER BY ro.role_id) role_names
                FROM users u JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles ro ON ro.role_id = ur.role_id
               WHERE u.branch_id = api_pkg.current_branch_id AND u.is_active = 'Y' AND u.is_deleted = 'N'
                 AND (p_role IS NULL OR EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles ro2 ON ro2.role_id = ur2.role_id
                                                 WHERE ur2.user_id = u.user_id AND ro2.role_code IN (p_role, 'MANAGER', 'ADMIN')))
               GROUP BY u.user_id, u.full_name ORDER BY u.full_name) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('id', r.user_id); o.put('fullName', r.full_name); o.put('role', r.role_names); a.append(o); END;
    END LOOP;
    RETURN a;
  END;

  FUNCTION list_users(p_search VARCHAR2, p_role VARCHAR2, p_status VARCHAR2) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('users:view');
    FOR r IN (SELECT u.user_id FROM users u WHERE u.branch_id = api_pkg.current_branch_id AND u.is_deleted = 'N'
               AND (p_search IS NULL OR LOWER(u.full_name) LIKE '%'||LOWER(p_search)||'%' OR LOWER(u.username) LIKE '%'||LOWER(p_search)||'%' OR LOWER(u.email) LIKE '%'||LOWER(p_search)||'%')
               AND (p_role IS NULL OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles ro ON ro.role_id = ur.role_id WHERE ur.user_id = u.user_id AND ro.role_code = p_role))
               AND (p_status IS NULL OR u.is_active = CASE WHEN p_status = 'ACTIVE' THEN 'Y' ELSE 'N' END)
               ORDER BY u.full_name) LOOP
      a.append(sec_pkg.user_json(r.user_id));
    END LOOP; RETURN a;
  END;

  FUNCTION save_user(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_roles JSON_ARRAY_T := p_body.get_array('roles'); l_salt RAW(32) := sec_pkg.new_salt; l_pwd VARCHAR2(200) := p_body.get_string('password');
    l_username VARCHAR2(60) := LOWER(TRIM(p_body.get_string('username'))); l_rid NUMBER;
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE));  -- BOOLEAN is not a SQL type
    l_rcode VARCHAR2(30);
  BEGIN
    sec_pkg.assert_permission('users:manage');
    IF l_username IS NULL THEN api_pkg.raise_validation('Username is required', 'username'); END IF;
    IF TRIM(p_body.get_string('fullName')) IS NULL THEN api_pkg.raise_validation('Full name is required', 'fullName'); END IF;
    IF l_roles IS NULL OR l_roles.get_size = 0 THEN api_pkg.raise_validation('At least one role is required', 'roles'); END IF;
    IF l_id IS NULL THEN
      IF l_pwd IS NULL OR LENGTH(l_pwd) < 6 THEN api_pkg.raise_validation('Password must be at least 6 characters', 'password'); END IF;
      INSERT INTO users (branch_id, username, email, full_name, phone, password_hash, password_salt, is_active, created_by)
      VALUES (api_pkg.current_branch_id, l_username, p_body.get_string('email'), TRIM(p_body.get_string('fullName')), p_body.get_string('phone'),
              sec_pkg.hash_password(l_pwd, l_salt), l_salt, l_active, api_pkg.current_user_id)
      RETURNING user_id INTO l_id;
    ELSE
      UPDATE users SET username = l_username, email = p_body.get_string('email'), full_name = TRIM(p_body.get_string('fullName')), phone = p_body.get_string('phone'),
             is_active = l_active, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
       WHERE user_id = l_id AND is_deleted = 'N';
      IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('User not found'); END IF;
      IF l_pwd IS NOT NULL THEN sec_pkg.set_password(l_id, l_pwd); END IF;
      DELETE FROM user_roles WHERE user_id = l_id;
    END IF;
    FOR i IN 0 .. l_roles.get_size - 1 LOOP
      l_rcode := l_roles.get_string(i);
      SELECT role_id INTO l_rid FROM roles WHERE role_code = l_rcode;
      INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (l_id, l_rid, api_pkg.current_user_id);
    END LOOP;
    IF p_body.get_string('approvalPin') IS NOT NULL THEN sec_pkg.set_approval_pin(l_id, p_body.get_string('approvalPin')); END IF;
    audit_pkg.log(CASE WHEN p_id IS NULL THEN 'USER_CREATED' ELSE 'USER_UPDATED' END, 'USERS', l_id);
    RETURN l_id;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN api_pkg.raise_conflict('Username or email already exists'); RETURN NULL;
    WHEN NO_DATA_FOUND THEN api_pkg.raise_validation('Invalid role', 'roles'); RETURN NULL;
  END;

  PROCEDURE set_status(p_id NUMBER, p_active BOOLEAN) IS
    l_active CHAR(1) := api_pkg.yn(p_active);   -- BOOLEAN is not a SQL type
  BEGIN
    sec_pkg.assert_permission('users:manage');
    IF p_id = api_pkg.current_user_id AND NOT p_active THEN api_pkg.raise_business('You cannot deactivate your own account'); END IF;
    UPDATE users SET is_active = l_active, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE user_id = p_id;
    IF NOT p_active THEN UPDATE user_sessions SET revoked_at = SYSTIMESTAMP WHERE user_id = p_id AND revoked_at IS NULL; END IF;
    audit_pkg.log('USER_STATUS', 'USERS', p_id, NULL, l_active);
  END;

  FUNCTION roles_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('roles:view');
    FOR r IN (SELECT * FROM roles ORDER BY role_id) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); perms JSON_ARRAY_T := JSON_ARRAY_T(); l_cnt NUMBER;
      BEGIN
        FOR p IN (SELECT p.permission_code FROM role_permissions rp JOIN permissions p ON p.permission_id = rp.permission_id WHERE rp.role_id = r.role_id ORDER BY 1) LOOP perms.append(p.permission_code); END LOOP;
        SELECT COUNT(*) INTO l_cnt FROM user_roles WHERE role_id = r.role_id;
        o.put('id', r.role_id); o.put('code', r.role_code); o.put('name', r.role_name); o.put('description', r.description);
        o.put('maxDiscountPercent', r.max_discount_pct); o.put('isSystem', r.is_system = 'Y'); o.put('permissions', perms); o.put('userCount', l_cnt);
        a.append(o);
      END;
    END LOOP; RETURN a;
  END;

  FUNCTION permissions_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    FOR r IN (SELECT * FROM permissions ORDER BY module_name, permission_code) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('code', r.permission_code); o.put('module', r.module_name); o.put('description', r.description); a.append(o); END;
    END LOOP; RETURN a;
  END;

  PROCEDURE update_role(p_id NUMBER, p_body JSON_OBJECT_T) IS
    perms JSON_ARRAY_T := p_body.get_array('permissions'); l_pid NUMBER; l_code VARCHAR2(30); l_pcode VARCHAR2(60);
  BEGIN
    sec_pkg.assert_permission('roles:manage');
    SELECT role_code INTO l_code FROM roles WHERE role_id = p_id;
    IF l_code = 'SUPER_ADMIN' THEN api_pkg.raise_business('Super Admin role cannot be modified'); END IF;
    UPDATE roles SET max_discount_pct = NVL(p_body.get_number('maxDiscountPercent'), max_discount_pct), updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE role_id = p_id;
    IF perms IS NOT NULL THEN
      DELETE FROM role_permissions WHERE role_id = p_id;
      FOR i IN 0 .. perms.get_size - 1 LOOP
        l_pcode := perms.get_string(i);
        SELECT permission_id INTO l_pid FROM permissions WHERE permission_code = l_pcode;
        INSERT INTO role_permissions (role_id, permission_id) VALUES (p_id, l_pid);
      END LOOP;
    END IF;
    audit_pkg.log('ROLE_UPDATED', 'ROLES', p_id, NULL, p_body.to_clob);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_validation('Invalid role or permission');
  END;
END user_pkg;
/
