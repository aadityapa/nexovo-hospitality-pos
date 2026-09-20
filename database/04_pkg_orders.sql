-- =====================================================================
-- ORDER_PKG (lifecycle, routing, cancellation) & TICKET_PKG (kitchen / bar)
-- NOTE: TICKET_PKG's spec is declared first because ORDER_PKG's body calls
--       TICKET_PKG.ROUTE_BATCH / SYNC_TICKET_STATUS (body follows below).
-- =====================================================================

CREATE OR REPLACE PACKAGE ticket_pkg AS
  PROCEDURE route_batch(p_order_id NUMBER, p_batch NUMBER);
  PROCEDURE sync_ticket_status(p_order_id NUMBER);
  FUNCTION list_tickets(p_location VARCHAR2, p_status VARCHAR2) RETURN JSON_ARRAY_T;
  FUNCTION ticket_json_for_item(p_item_id NUMBER) RETURN JSON_OBJECT_T;
END ticket_pkg;
/

CREATE OR REPLACE PACKAGE order_pkg AS
  FUNCTION order_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION list_orders(p_statuses VARCHAR2, p_table_id NUMBER, p_waiter_id NUMBER, p_location VARCHAR2,
                       p_active BOOLEAN, p_from TIMESTAMP, p_to TIMESTAMP, p_search VARCHAR2) RETURN JSON_ARRAY_T;
  FUNCTION create_order(p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE update_order(p_id NUMBER, p_body JSON_OBJECT_T);
  PROCEDURE add_items(p_id NUMBER, p_items JSON_ARRAY_T);
  PROCEDURE update_item(p_id NUMBER, p_item_id NUMBER, p_body JSON_OBJECT_T);
  PROCEDURE cancel_item(p_id NUMBER, p_item_id NUMBER, p_reason VARCHAR2, p_approver_id NUMBER, p_pin VARCHAR2);
  PROCEDURE confirm_order(p_id NUMBER);
  PROCEDURE cancel_order(p_id NUMBER, p_reason VARCHAR2);
  PROCEDURE request_bill(p_id NUMBER);
  PROCEDURE set_item_status(p_item_id NUMBER, p_status VARCHAR2, p_location VARCHAR2 DEFAULT NULL);
  PROCEDURE set_order_status(p_id NUMBER, p_status VARCHAR2, p_note VARCHAR2 DEFAULT NULL);
  PROCEDURE recalculate(p_id NUMBER);
  FUNCTION derive_status(p_id NUMBER) RETURN VARCHAR2;
  FUNCTION history_json(p_id NUMBER) RETURN JSON_ARRAY_T;
END order_pkg;
/
CREATE OR REPLACE PACKAGE BODY order_pkg AS

  FUNCTION status_rank(p VARCHAR2) RETURN PLS_INTEGER IS
  BEGIN
    RETURN CASE p WHEN 'DRAFT' THEN 0 WHEN 'CONFIRMED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'PARTIALLY_READY' THEN 3
                  WHEN 'READY' THEN 4 WHEN 'SERVED' THEN 5 WHEN 'BILL_REQUESTED' THEN 6 WHEN 'BILLED' THEN 7
                  WHEN 'PAID' THEN 8 WHEN 'COMPLETED' THEN 9 WHEN 'CANCELLED' THEN 10 END;
  END;

  -- takes the item id (re-selects) so callers may pass ids from any cursor without record-type coupling
  FUNCTION item_json(p_item_id NUMBER) RETURN JSON_OBJECT_T IS
    r order_items%ROWTYPE; o JSON_OBJECT_T := JSON_OBJECT_T(); l_tax NUMBER;
  BEGIN
    SELECT * INTO r FROM order_items WHERE order_item_id = p_item_id;
    SELECT NVL(SUM(rate_pct),0) INTO l_tax FROM tax_components WHERE tax_group_id = r.tax_group_id;
    o.put('id', r.order_item_id); o.put('orderId', r.order_id); o.put('menuItemId', r.item_id); o.put('batchNo', r.batch_no);
    o.put('itemName', r.item_name); o.put('unitPrice', r.unit_price); o.put('quantity', r.quantity); o.put('lineTotal', r.line_total);
    o.put('prepLocation', r.prep_location); o.put('taxGroupId', r.tax_group_id); o.put('taxPercent', l_tax); o.put('status', r.status);
    o.put('notes', r.notes); o.put('addedAt', api_pkg.ts_iso(r.added_at)); o.put('startedAt', api_pkg.ts_iso(r.started_at));
    o.put('readyAt', api_pkg.ts_iso(r.ready_at)); o.put('servedAt', api_pkg.ts_iso(r.served_at)); o.put('cancelledAt', api_pkg.ts_iso(r.cancelled_at));
    o.put('cancelledBy', r.cancelled_by); o.put('approvedBy', r.approved_by); o.put('cancelReason', r.cancel_reason);
    RETURN o;
  END;

  FUNCTION order_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    o orders%ROWTYPE; j JSON_OBJECT_T := JSON_OBJECT_T(); items JSON_ARRAY_T := JSON_ARRAY_T();
    l_table VARCHAR2(60); l_tnum VARCHAR2(20); l_floor VARCHAR2(100); l_waiter VARCHAR2(150); l_cnt NUMBER := 0; l_bill NUMBER;
  BEGIN
    SELECT * INTO o FROM orders WHERE order_id = p_id;
    SELECT t.table_name, t.table_number, f.floor_name INTO l_table, l_tnum, l_floor FROM dining_tables t JOIN floors f ON f.floor_id = t.floor_id WHERE t.table_id = o.table_id;
    SELECT full_name INTO l_waiter FROM users WHERE user_id = o.waiter_id;
    BEGIN SELECT bill_id INTO l_bill FROM bills WHERE order_id = p_id AND status <> 'VOID'; EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
    FOR r IN (SELECT order_item_id, status, quantity FROM order_items WHERE order_id = p_id ORDER BY batch_no, order_item_id) LOOP
      items.append(item_json(r.order_item_id));
      IF r.status <> 'CANCELLED' THEN l_cnt := l_cnt + r.quantity; END IF;
    END LOOP;
    j.put('id', o.order_id); j.put('orderNumber', o.order_number); j.put('branchId', o.branch_id); j.put('tableId', o.table_id);
    j.put('tableName', l_table); j.put('tableNumber', l_tnum); j.put('floorName', l_floor); j.put('waiterId', o.waiter_id); j.put('waiterName', l_waiter);
    j.put('orderType', o.order_type); j.put('status', o.status); j.put('guestCount', o.guest_count); j.put('notes', o.notes);
    j.put('subtotal', o.subtotal); j.put('itemCount', l_cnt); j.put('items', items); j.put('billId', l_bill);
    j.put('createdAt', api_pkg.ts_iso(o.created_at)); j.put('confirmedAt', api_pkg.ts_iso(o.confirmed_at));
    j.put('billRequestedAt', api_pkg.ts_iso(o.bill_requested_at)); j.put('completedAt', api_pkg.ts_iso(o.completed_at));
    j.put('cancelledAt', api_pkg.ts_iso(o.cancelled_at)); j.put('cancelReason', o.cancel_reason); j.put('updatedAt', api_pkg.ts_iso(NVL(o.updated_at, o.created_at)));
    RETURN j;
  END;

  FUNCTION list_orders(p_statuses VARCHAR2, p_table_id NUMBER, p_waiter_id NUMBER, p_location VARCHAR2,
                       p_active BOOLEAN, p_from TIMESTAMP, p_to TIMESTAMP, p_search VARCHAR2) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T(); l_uid NUMBER := api_pkg.current_user_id;
    -- BOOLEAN is not a SQL type: keep the flags as CHAR for use inside the cursor
    l_all CHAR(1); l_act CHAR(1) := api_pkg.yn(p_active);
  BEGIN
    sec_pkg.assert_permission('orders:view');
    l_all := api_pkg.yn(sec_pkg.has_permission(l_uid, 'orders:view:all'));
    FOR r IN (SELECT o.order_id FROM orders o
               WHERE o.branch_id = api_pkg.current_branch_id
                 AND (p_statuses IS NULL OR INSTR(','||p_statuses||',', ','||o.status||',') > 0)
                 AND (l_act = 'N' OR o.status NOT IN ('COMPLETED','CANCELLED'))
                 AND (p_table_id IS NULL OR o.table_id = p_table_id)
                 AND (p_waiter_id IS NULL OR o.waiter_id = p_waiter_id)
                 AND (p_from IS NULL OR o.created_at >= p_from) AND (p_to IS NULL OR o.created_at <= p_to)
                 AND (p_location IS NULL OR EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.order_id AND i.prep_location = p_location))
                 AND (p_search IS NULL OR LOWER(o.order_number) LIKE '%'||LOWER(p_search)||'%')
                 AND (l_all = 'Y' OR o.waiter_id = l_uid OR EXISTS (SELECT 1 FROM dining_tables t WHERE t.table_id = o.table_id AND t.assigned_waiter_id = l_uid))
               ORDER BY o.created_at DESC) LOOP
      a.append(order_json(r.order_id));
    END LOOP;
    RETURN a;
  END;

  PROCEDURE add_history(p_id NUMBER, p_from VARCHAR2, p_to VARCHAR2, p_note VARCHAR2) IS
  BEGIN
    INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note) VALUES (p_id, p_from, p_to, api_pkg.current_user_id, p_note);
  END;

  PROCEDURE add_item_history(p_item_id NUMBER, p_from VARCHAR2, p_to VARCHAR2) IS
  BEGIN
    INSERT INTO order_item_status_history (order_item_id, from_status, to_status, changed_by) VALUES (p_item_id, p_from, p_to, api_pkg.current_user_id);
  END;

  FUNCTION derive_status(p_id NUMBER) RETURN VARCHAR2 IS
    l_total NUMBER; l_new NUMBER; l_prep NUMBER; l_ready NUMBER; l_served NUMBER; l_cur VARCHAR2(20); l_all NUMBER;
  BEGIN
    SELECT status INTO l_cur FROM orders WHERE order_id = p_id;
    IF status_rank(l_cur) >= status_rank('BILL_REQUESTED') OR l_cur = 'DRAFT' THEN RETURN l_cur; END IF;
    SELECT COUNT(*), SUM(CASE WHEN status='NEW' THEN 1 ELSE 0 END), SUM(CASE WHEN status='PREPARING' THEN 1 ELSE 0 END),
           SUM(CASE WHEN status='READY' THEN 1 ELSE 0 END), SUM(CASE WHEN status='SERVED' THEN 1 ELSE 0 END)
      INTO l_total, l_new, l_prep, l_ready, l_served FROM order_items WHERE order_id = p_id AND status <> 'CANCELLED';
    SELECT COUNT(*) INTO l_all FROM order_items WHERE order_id = p_id;
    IF l_total = 0 THEN RETURN CASE WHEN l_all > 0 THEN 'CANCELLED' ELSE l_cur END; END IF;
    IF l_served = l_total THEN RETURN 'SERVED'; END IF;
    IF l_ready + l_served = l_total THEN RETURN 'READY'; END IF;
    IF l_ready + l_served > 0 THEN RETURN 'PARTIALLY_READY'; END IF;
    IF l_prep > 0 THEN RETURN 'IN_PROGRESS'; END IF;
    RETURN 'CONFIRMED';
  END;

  PROCEDURE recalculate(p_id NUMBER) IS
    l_sub NUMBER; l_old VARCHAR2(20); l_new VARCHAR2(20); l_table NUMBER;
  BEGIN
    SELECT NVL(SUM(line_total),0) INTO l_sub FROM order_items WHERE order_id = p_id AND status <> 'CANCELLED';
    SELECT status, table_id INTO l_old, l_table FROM orders WHERE order_id = p_id FOR UPDATE;
    l_new := derive_status(p_id);
    UPDATE orders SET subtotal = l_sub, status = l_new, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id,
           cancelled_at = CASE WHEN l_new = 'CANCELLED' AND cancelled_at IS NULL THEN SYSTIMESTAMP ELSE cancelled_at END
     WHERE order_id = p_id;
    IF l_old <> l_new THEN add_history(p_id, l_old, l_new, 'derived from items'); END IF;
    ticket_pkg.sync_ticket_status(p_id);
    table_pkg.sync_status_from_order(l_table);
    audit_pkg.emit_event('orders', 'order.updated', p_id);
  END;

  PROCEDURE set_order_status(p_id NUMBER, p_status VARCHAR2, p_note VARCHAR2) IS
    l_old VARCHAR2(20); l_table NUMBER;
  BEGIN
    SELECT status, table_id INTO l_old, l_table FROM orders WHERE order_id = p_id FOR UPDATE;
    IF l_old = p_status THEN RETURN; END IF;
    UPDATE orders SET status = p_status, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id,
           completed_at = CASE WHEN p_status = 'COMPLETED' THEN SYSTIMESTAMP ELSE completed_at END
     WHERE order_id = p_id;
    add_history(p_id, l_old, p_status, p_note);
    table_pkg.sync_status_from_order(l_table);
    audit_pkg.emit_event('orders', 'order.status', p_id);
  END;

  PROCEDURE insert_items(p_id NUMBER, p_items JSON_ARRAY_T, p_batch NUMBER) IS
    it JSON_OBJECT_T; mi menu_items%ROWTYPE; l_qty NUMBER; l_mid NUMBER;
  BEGIN
    IF p_items IS NULL OR p_items.get_size = 0 THEN api_pkg.raise_validation('At least one item is required', 'items'); END IF;
    FOR i IN 0 .. p_items.get_size - 1 LOOP
      it := TREAT(p_items.get(i) AS JSON_OBJECT_T);
      l_mid := it.get_number('menuItemId'); l_qty := it.get_number('quantity');
      IF l_qty IS NULL OR l_qty <= 0 OR l_qty > 999 THEN api_pkg.raise_validation('Quantity must be between 1 and 999', 'quantity'); END IF;
      BEGIN
        SELECT * INTO mi FROM menu_items WHERE item_id = l_mid AND is_deleted = 'N' AND is_active = 'Y';
      EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_validation('Menu item ' || l_mid || ' is not available', 'menuItemId'); END;
      IF mi.is_available = 'N' THEN api_pkg.raise_business(mi.item_name || ' is currently unavailable'); END IF;
      -- Rule 4: snapshot name & price
      INSERT INTO order_items (order_id, item_id, batch_no, item_name, unit_price, quantity, line_total, prep_location, tax_group_id, notes, created_by)
      VALUES (p_id, mi.item_id, p_batch, mi.item_name, mi.current_price, l_qty, ROUND(mi.current_price * l_qty, 2), mi.prep_location, mi.tax_group_id,
              SUBSTR(it.get_string('notes'), 1, 300), api_pkg.current_user_id);
    END LOOP;
  END;

  FUNCTION create_order(p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER; l_table NUMBER := p_body.get_number('tableId'); l_cnt NUMBER; l_multi CHAR(1);
    l_items JSON_ARRAY_T := p_body.get_array('items'); l_no VARCHAR2(30);
  BEGIN
    sec_pkg.assert_permission('orders:create');
    SELECT COUNT(*) INTO l_cnt FROM dining_tables WHERE table_id = l_table AND branch_id = api_pkg.current_branch_id AND is_deleted = 'N' AND is_active = 'Y';
    IF l_cnt = 0 THEN api_pkg.raise_validation('Table is invalid', 'tableId'); END IF;
    SELECT allow_multi_orders INTO l_multi FROM branches WHERE branch_id = api_pkg.current_branch_id;
    SELECT COUNT(*) INTO l_cnt FROM orders WHERE table_id = l_table AND status NOT IN ('COMPLETED','CANCELLED');
    IF l_cnt > 0 AND l_multi = 'N' THEN api_pkg.raise_conflict('This table already has an active order. Add items to it instead.'); END IF;

    l_no := numbering_pkg.next_order_number;   -- does DML: resolve outside the INSERT
    INSERT INTO orders (order_number, branch_id, table_id, waiter_id, status, guest_count, notes, created_by)
    VALUES (l_no, api_pkg.current_branch_id, l_table, api_pkg.current_user_id, 'DRAFT',
            NVL(p_body.get_number('guestCount'), 1), p_body.get_string('notes'), api_pkg.current_user_id)
    RETURNING order_id INTO l_id;
    add_history(l_id, NULL, 'DRAFT', 'order created');
    IF l_items IS NOT NULL AND l_items.get_size > 0 THEN insert_items(l_id, l_items, 1); END IF;
    recalculate(l_id);
    audit_pkg.log('ORDER_CREATED', 'ORDERS', l_id, NULL, p_body.to_clob);
    audit_pkg.emit_event('orders', 'order.created', l_id);
    RETURN l_id;
  END;

  PROCEDURE update_order(p_id NUMBER, p_body JSON_OBJECT_T) IS
  BEGIN
    sec_pkg.assert_permission('orders:create');
    UPDATE orders SET guest_count = NVL(p_body.get_number('guestCount'), guest_count), notes = NVL(p_body.get_string('notes'), notes),
           updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
     WHERE order_id = p_id AND status NOT IN ('COMPLETED','CANCELLED');
    IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Order not found or closed'); END IF;
    audit_pkg.emit_event('orders', 'order.updated', p_id);
  END;

  PROCEDURE add_items(p_id NUMBER, p_items JSON_ARRAY_T) IS
    l_status VARCHAR2(20); l_batch NUMBER;
  BEGIN
    sec_pkg.assert_permission('orders:create');
    SELECT status INTO l_status FROM orders WHERE order_id = p_id FOR UPDATE;
    IF status_rank(l_status) >= status_rank('BILL_REQUESTED') THEN
      api_pkg.raise_business('Cannot add items after the bill has been requested');
    END IF;
    SELECT NVL(MAX(batch_no),0) + CASE WHEN l_status = 'DRAFT' THEN 0 ELSE 1 END INTO l_batch FROM order_items WHERE order_id = p_id;
    l_batch := GREATEST(l_batch, 1);
    insert_items(p_id, p_items, l_batch);
    IF l_status <> 'DRAFT' THEN
      ticket_pkg.route_batch(p_id, l_batch);   -- Section 22: new items routed immediately
      inventory_pkg.on_order_confirmed(p_id);  -- Phase 2: stock deduction (mode ON_CONFIRM, idempotent per item)
    END IF;
    recalculate(p_id);
    audit_pkg.log('ORDER_ITEMS_ADDED', 'ORDERS', p_id, NULL, p_items.to_clob);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Order not found');
  END;

  PROCEDURE update_item(p_id NUMBER, p_item_id NUMBER, p_body JSON_OBJECT_T) IS
    r order_items%ROWTYPE; l_ostatus VARCHAR2(20); l_qty NUMBER;
  BEGIN
    sec_pkg.assert_permission('orders:create');
    SELECT * INTO r FROM order_items WHERE order_item_id = p_item_id AND order_id = p_id FOR UPDATE;
    SELECT status INTO l_ostatus FROM orders WHERE order_id = p_id;
    IF l_ostatus <> 'DRAFT' OR r.status <> 'NEW' THEN api_pkg.raise_business('Only draft items can be edited. Use cancellation instead.'); END IF;
    l_qty := NVL(p_body.get_number('quantity'), r.quantity);
    IF l_qty <= 0 THEN api_pkg.raise_validation('Quantity must be positive', 'quantity'); END IF;
    UPDATE order_items SET quantity = l_qty, line_total = ROUND(unit_price * l_qty, 2),
           notes = CASE WHEN p_body.has('notes') THEN SUBSTR(p_body.get_string('notes'),1,300) ELSE notes END,
           updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
     WHERE order_item_id = p_item_id;
    recalculate(p_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Order item not found');
  END;

  PROCEDURE cancel_item(p_id NUMBER, p_item_id NUMBER, p_reason VARCHAR2, p_approver_id NUMBER, p_pin VARCHAR2) IS
    r order_items%ROWTYPE; l_ostatus VARCHAR2(20); l_needs_approval BOOLEAN; l_approver NUMBER;
  BEGIN
    sec_pkg.assert_permission('orders:cancel:item');
    IF TRIM(p_reason) IS NULL THEN api_pkg.raise_validation('Cancellation reason is required', 'reason'); END IF;
    SELECT * INTO r FROM order_items WHERE order_item_id = p_item_id AND order_id = p_id FOR UPDATE;
    SELECT status INTO l_ostatus FROM orders WHERE order_id = p_id;
    IF r.status IN ('CANCELLED','SERVED') THEN api_pkg.raise_business('Item is already ' || LOWER(r.status)); END IF;
    IF status_rank(l_ostatus) >= status_rank('BILLED') THEN api_pkg.raise_business('Cannot cancel items on a billed order'); END IF;

    l_needs_approval := NOT (l_ostatus = 'DRAFT' AND r.status = 'NEW');
    IF l_needs_approval THEN
      IF sec_pkg.has_permission(api_pkg.current_user_id, 'orders:cancel') THEN
        l_approver := api_pkg.current_user_id;     -- manager/admin self-approves
      ELSE
        IF p_approver_id IS NULL OR NOT sec_pkg.has_permission(p_approver_id, 'orders:cancel') OR NOT sec_pkg.verify_pin(p_approver_id, p_pin) THEN
          api_pkg.raise_forbidden('Manager approval (valid PIN) is required to cancel a confirmed item');
        END IF;
        l_approver := p_approver_id;
      END IF;
    END IF;
    UPDATE order_items SET status = 'CANCELLED', cancelled_at = SYSTIMESTAMP, cancelled_by = api_pkg.current_user_id,
           approved_by = l_approver, cancel_reason = SUBSTR(p_reason,1,300), updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
     WHERE order_item_id = p_item_id;
    add_item_history(p_item_id, r.status, 'CANCELLED');
    inventory_pkg.reverse_for_order_item(p_item_id);   -- Phase 2: stock reversal (idempotent)
    audit_pkg.log('ORDER_ITEM_CANCELLED', 'ORDER_ITEMS', p_item_id, r.status, 'CANCELLED: ' || p_reason);
    recalculate(p_id);
    audit_pkg.emit_event(CASE WHEN r.prep_location = 'BAR' THEN 'bar' ELSE 'kitchen' END, 'item.cancelled', p_item_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Order item not found');
  END;

  PROCEDURE confirm_order(p_id NUMBER) IS
    l_status VARCHAR2(20); l_cnt NUMBER;
  BEGIN
    sec_pkg.assert_permission('orders:confirm');
    SELECT status INTO l_status FROM orders WHERE order_id = p_id FOR UPDATE;
    IF l_status <> 'DRAFT' THEN api_pkg.raise_conflict('Only draft orders can be confirmed (current: ' || l_status || ')'); END IF;
    SELECT COUNT(*) INTO l_cnt FROM order_items WHERE order_id = p_id AND status = 'NEW';
    IF l_cnt = 0 THEN api_pkg.raise_validation('Add at least one item before confirming'); END IF;
    UPDATE orders SET status = 'CONFIRMED', confirmed_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE order_id = p_id;
    add_history(p_id, 'DRAFT', 'CONFIRMED', 'confirmed by waiter');
    ticket_pkg.route_batch(p_id, 1);   -- Section 17: split by prep location, one master order
    inventory_pkg.on_order_confirmed(p_id);   -- Phase 2: recipe/bottle stock deduction when mode = ON_CONFIRM
    recalculate(p_id);
    audit_pkg.log('ORDER_CONFIRMED', 'ORDERS', p_id);
    audit_pkg.emit_event('orders', 'order.confirmed', p_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Order not found');
  END;

  PROCEDURE cancel_order(p_id NUMBER, p_reason VARCHAR2) IS
    l_status VARCHAR2(20); l_table NUMBER;
  BEGIN
    SELECT status, table_id INTO l_status, l_table FROM orders WHERE order_id = p_id FOR UPDATE;
    IF l_status = 'DRAFT' THEN sec_pkg.assert_permission('orders:create'); ELSE sec_pkg.assert_permission('orders:cancel'); END IF;
    IF TRIM(p_reason) IS NULL THEN api_pkg.raise_validation('Cancellation reason is required', 'reason'); END IF;
    IF status_rank(l_status) >= status_rank('PAID') THEN api_pkg.raise_business('Paid orders cannot be cancelled. Use refund.'); END IF;
    FOR r IN (SELECT order_item_id, status FROM order_items WHERE order_id = p_id AND status <> 'CANCELLED') LOOP
      UPDATE order_items SET status = 'CANCELLED', cancelled_at = SYSTIMESTAMP, cancelled_by = api_pkg.current_user_id,
             approved_by = api_pkg.current_user_id, cancel_reason = 'Order cancelled: ' || SUBSTR(p_reason,1,250) WHERE order_item_id = r.order_item_id;
      add_item_history(r.order_item_id, r.status, 'CANCELLED');
      inventory_pkg.reverse_for_order_item(r.order_item_id);   -- Phase 2
    END LOOP;
    UPDATE bills SET status = 'VOID', voided_at = SYSTIMESTAMP, void_reason = p_reason WHERE order_id = p_id AND status IN ('OPEN','FINALIZED') AND paid_amount = 0;
    UPDATE orders SET status = 'CANCELLED', cancelled_at = SYSTIMESTAMP, cancelled_by = api_pkg.current_user_id, cancel_reason = SUBSTR(p_reason,1,300),
           updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE order_id = p_id;
    add_history(p_id, l_status, 'CANCELLED', p_reason);
    ticket_pkg.sync_ticket_status(p_id);
    table_pkg.sync_status_from_order(l_table);
    audit_pkg.log('ORDER_CANCELLED', 'ORDERS', p_id, l_status, 'CANCELLED: ' || p_reason);
    audit_pkg.emit_event('orders', 'order.cancelled', p_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Order not found');
  END;

  PROCEDURE request_bill(p_id NUMBER) IS
    l_status VARCHAR2(20); l_table NUMBER;
  BEGIN
    sec_pkg.assert_permission('orders:request-bill');
    SELECT status, table_id INTO l_status, l_table FROM orders WHERE order_id = p_id FOR UPDATE;
    IF l_status = 'DRAFT' THEN api_pkg.raise_business('Confirm the order before requesting the bill'); END IF;
    IF status_rank(l_status) >= status_rank('BILL_REQUESTED') THEN api_pkg.raise_conflict('Bill already requested'); END IF;
    UPDATE orders SET status = 'BILL_REQUESTED', bill_requested_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE order_id = p_id;
    add_history(p_id, l_status, 'BILL_REQUESTED', 'bill requested');
    table_pkg.sync_status_from_order(l_table);
    audit_pkg.log('BILL_REQUESTED', 'ORDERS', p_id);
    audit_pkg.emit_event('orders', 'order.bill_requested', p_id);
    audit_pkg.emit_event('bills', 'order.bill_requested', p_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Order not found');
  END;

  PROCEDURE set_item_status(p_item_id NUMBER, p_status VARCHAR2, p_location VARCHAR2) IS
    r order_items%ROWTYPE; l_ok BOOLEAN;
  BEGIN
    SELECT * INTO r FROM order_items WHERE order_item_id = p_item_id FOR UPDATE;
    IF p_location IS NOT NULL AND r.prep_location <> p_location THEN api_pkg.raise_forbidden('Item does not belong to ' || p_location); END IF;
    IF p_location IS NULL THEN
      -- waiter path: only SERVED allowed
      sec_pkg.assert_permission('orders:item:status');
      IF p_status <> 'SERVED' AND NOT sec_pkg.has_permission(api_pkg.current_user_id, 'kitchen:update') AND NOT sec_pkg.has_permission(api_pkg.current_user_id, 'bar:update') THEN
        api_pkg.raise_forbidden('Waiters can only mark items as served');
      END IF;
    END IF;
    l_ok := (r.status = 'NEW' AND p_status = 'PREPARING') OR (r.status = 'PREPARING' AND p_status = 'READY')
         OR (r.status = 'READY' AND p_status = 'SERVED') OR (r.status = 'NEW' AND p_status = 'READY');
    IF NOT l_ok THEN api_pkg.raise_conflict('Invalid item transition ' || r.status || ' -> ' || p_status); END IF;
    UPDATE order_items SET status = p_status,
           started_at = CASE WHEN p_status = 'PREPARING' THEN SYSTIMESTAMP ELSE started_at END,
           ready_at   = CASE WHEN p_status = 'READY' THEN SYSTIMESTAMP ELSE ready_at END,
           served_at  = CASE WHEN p_status = 'SERVED' THEN SYSTIMESTAMP ELSE served_at END,
           updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
     WHERE order_item_id = p_item_id;
    add_item_history(p_item_id, r.status, p_status);
    recalculate(r.order_id);
    audit_pkg.emit_event(CASE WHEN r.prep_location = 'BAR' THEN 'bar' ELSE 'kitchen' END, 'item.status', p_item_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Order item not found');
  END;

  FUNCTION history_json(p_id NUMBER) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    FOR r IN (SELECT h.*, u.full_name FROM order_status_history h LEFT JOIN users u ON u.user_id = h.changed_by WHERE h.order_id = p_id ORDER BY h.changed_at) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN
        o.put('id', r.history_id); o.put('orderId', r.order_id); o.put('fromStatus', r.from_status); o.put('toStatus', r.to_status);
        o.put('changedBy', r.changed_by); o.put('changedByName', r.full_name); o.put('changedAt', api_pkg.ts_iso(r.changed_at)); o.put('note', r.note);
        a.append(o);
      END;
    END LOOP; RETURN a;
  END;
END order_pkg;
/

-- ---------------------------------------------------------------------
-- (TICKET_PKG spec is declared at the top of this file — body only here.)
CREATE OR REPLACE PACKAGE BODY ticket_pkg AS

  PROCEDURE route_batch(p_order_id NUMBER, p_batch NUMBER) IS
    l_k NUMBER; l_b NUMBER; l_no VARCHAR2(30);
  BEGIN
    SELECT SUM(CASE WHEN prep_location = 'KITCHEN' THEN 1 ELSE 0 END), SUM(CASE WHEN prep_location = 'BAR' THEN 1 ELSE 0 END)
      INTO l_k, l_b FROM order_items WHERE order_id = p_order_id AND batch_no = p_batch AND status <> 'CANCELLED';
    IF NVL(l_k,0) > 0 THEN
      l_no := numbering_pkg.next_ticket_number('KITCHEN');   -- does DML: resolve outside the INSERT
      INSERT INTO kitchen_tickets (ticket_number, order_id, batch_no) VALUES (l_no, p_order_id, p_batch);
      audit_pkg.emit_event('kitchen', 'ticket.created', p_order_id);
    END IF;
    IF NVL(l_b,0) > 0 THEN
      l_no := numbering_pkg.next_ticket_number('BAR');
      INSERT INTO bar_tickets (ticket_number, order_id, batch_no) VALUES (l_no, p_order_id, p_batch);
      audit_pkg.emit_event('bar', 'ticket.created', p_order_id);
    END IF;
  END;

  FUNCTION derive(p_order_id NUMBER, p_batch NUMBER, p_loc VARCHAR2) RETURN VARCHAR2 IS
    l_tot NUMBER; l_prep NUMBER; l_ready NUMBER; l_served NUMBER;
  BEGIN
    SELECT COUNT(*), SUM(CASE WHEN status='PREPARING' THEN 1 ELSE 0 END), SUM(CASE WHEN status='READY' THEN 1 ELSE 0 END), SUM(CASE WHEN status='SERVED' THEN 1 ELSE 0 END)
      INTO l_tot, l_prep, l_ready, l_served FROM order_items WHERE order_id = p_order_id AND batch_no = p_batch AND prep_location = p_loc AND status <> 'CANCELLED';
    IF l_tot = 0 THEN RETURN 'CANCELLED'; END IF;
    IF l_served = l_tot THEN RETURN 'SERVED'; END IF;
    IF l_ready + l_served = l_tot THEN RETURN 'READY'; END IF;
    IF l_prep + l_ready + l_served > 0 THEN RETURN 'PREPARING'; END IF;
    RETURN 'NEW';
  END;

  PROCEDURE sync_ticket_status(p_order_id NUMBER) IS
  BEGIN
    FOR t IN (SELECT ticket_id, batch_no FROM kitchen_tickets WHERE order_id = p_order_id) LOOP
      UPDATE kitchen_tickets SET status = derive(p_order_id, t.batch_no, 'KITCHEN'), updated_at = SYSTIMESTAMP WHERE ticket_id = t.ticket_id;
    END LOOP;
    FOR t IN (SELECT ticket_id, batch_no FROM bar_tickets WHERE order_id = p_order_id) LOOP
      UPDATE bar_tickets SET status = derive(p_order_id, t.batch_no, 'BAR'), updated_at = SYSTIMESTAMP WHERE ticket_id = t.ticket_id;
    END LOOP;
  END;

  -- Section 4: kitchen/bar payloads exclude prices and financial data
  FUNCTION build(p_ticket_id NUMBER, p_order_id NUMBER, p_batch NUMBER, p_no VARCHAR2, p_status VARCHAR2, p_created TIMESTAMP, p_loc VARCHAR2) RETURN JSON_OBJECT_T IS
    o JSON_OBJECT_T := JSON_OBJECT_T(); items JSON_ARRAY_T := JSON_ARRAY_T();
    l_order_no VARCHAR2(30); l_table VARCHAR2(60); l_tnum VARCHAR2(20); l_waiter VARCHAR2(150); l_notes VARCHAR2(500);
  BEGIN
    SELECT o.order_number, t.table_name, t.table_number, u.full_name, o.notes INTO l_order_no, l_table, l_tnum, l_waiter, l_notes
      FROM orders o JOIN dining_tables t ON t.table_id = o.table_id JOIN users u ON u.user_id = o.waiter_id WHERE o.order_id = p_order_id;
    FOR i IN (SELECT * FROM order_items WHERE order_id = p_order_id AND batch_no = p_batch AND prep_location = p_loc ORDER BY order_item_id) LOOP
      DECLARE io JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN
        io.put('id', i.order_item_id); io.put('orderId', i.order_id); io.put('itemName', i.item_name); io.put('quantity', i.quantity);
        io.put('notes', i.notes); io.put('status', i.status); io.put('prepLocation', i.prep_location);
        io.put('addedAt', api_pkg.ts_iso(i.added_at)); io.put('startedAt', api_pkg.ts_iso(i.started_at)); io.put('readyAt', api_pkg.ts_iso(i.ready_at));
        io.put('servedAt', api_pkg.ts_iso(i.served_at)); io.put('cancelReason', i.cancel_reason);
        items.append(io);
      END;
    END LOOP;
    o.put('id', p_ticket_id); o.put('ticketNumber', p_no); o.put('orderId', p_order_id); o.put('orderNumber', l_order_no); o.put('batchNo', p_batch);
    o.put('tableName', l_table); o.put('tableNumber', l_tnum); o.put('waiterName', l_waiter); o.put('location', p_loc); o.put('status', p_status);
    o.put('orderNotes', l_notes); o.put('createdAt', api_pkg.ts_iso(p_created)); o.put('items', items);
    RETURN o;
  END;

  FUNCTION list_tickets(p_location VARCHAR2, p_status VARCHAR2) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    IF p_location = 'BAR' THEN
      sec_pkg.assert_permission('bar:view');
      FOR t IN (SELECT t.* FROM bar_tickets t JOIN orders o ON o.order_id = t.order_id
                 WHERE o.branch_id = api_pkg.current_branch_id AND (p_status IS NULL OR t.status = p_status)
                   AND (p_status IS NOT NULL OR t.status IN ('NEW','PREPARING','READY')) ORDER BY t.created_at) LOOP
        a.append(build(t.ticket_id, t.order_id, t.batch_no, t.ticket_number, t.status, t.created_at, 'BAR'));
      END LOOP;
    ELSE
      sec_pkg.assert_permission('kitchen:view');
      FOR t IN (SELECT t.* FROM kitchen_tickets t JOIN orders o ON o.order_id = t.order_id
                 WHERE o.branch_id = api_pkg.current_branch_id AND (p_status IS NULL OR t.status = p_status)
                   AND (p_status IS NOT NULL OR t.status IN ('NEW','PREPARING','READY')) ORDER BY t.created_at) LOOP
        a.append(build(t.ticket_id, t.order_id, t.batch_no, t.ticket_number, t.status, t.created_at, 'KITCHEN'));
      END LOOP;
    END IF;
    RETURN a;
  END;

  FUNCTION ticket_json_for_item(p_item_id NUMBER) RETURN JSON_OBJECT_T IS
    r order_items%ROWTYPE;
  BEGIN
    SELECT * INTO r FROM order_items WHERE order_item_id = p_item_id;
    IF r.prep_location = 'BAR' THEN
      FOR t IN (SELECT * FROM bar_tickets WHERE order_id = r.order_id AND batch_no = r.batch_no) LOOP
        RETURN build(t.ticket_id, t.order_id, t.batch_no, t.ticket_number, t.status, t.created_at, 'BAR'); END LOOP;
    ELSE
      FOR t IN (SELECT * FROM kitchen_tickets WHERE order_id = r.order_id AND batch_no = r.batch_no) LOOP
        RETURN build(t.ticket_id, t.order_id, t.batch_no, t.ticket_number, t.status, t.created_at, 'KITCHEN'); END LOOP;
    END IF;
    RETURN NULL;
  END;
END ticket_pkg;
/
