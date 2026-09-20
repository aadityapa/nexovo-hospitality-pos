-- =====================================================================
-- PHASE 2 — SUPPLIER_PKG, PURCHASE_PKG (PO workflow + goods receipt → stock)
-- =====================================================================

CREATE OR REPLACE PACKAGE supplier_pkg AS
  FUNCTION supplier_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION list_json(p_search VARCHAR2, p_status VARCHAR2) RETURN JSON_ARRAY_T;
  FUNCTION save_supplier(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE delete_supplier(p_id NUMBER);
  FUNCTION history_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION add_payment(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
END supplier_pkg;
/
CREATE OR REPLACE PACKAGE BODY supplier_pkg AS
  FUNCTION supplier_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    FOR r IN (SELECT s.*, NVL(vb.total_received_value, 0) received_value, NVL(vb.total_paid, 0) paid,
                     (SELECT COUNT(*) FROM purchase_orders p WHERE p.supplier_id = s.supplier_id AND p.status NOT IN ('CANCELLED')) po_cnt,
                     (SELECT COUNT(*) FROM purchase_orders p WHERE p.supplier_id = s.supplier_id AND p.status IN ('SENT','APPROVED','ORDERED','PARTIALLY_RECEIVED')) open_po_cnt,
                     (SELECT MAX(g.received_at) FROM goods_receipts g JOIN purchase_orders p ON p.po_id = g.po_id WHERE p.supplier_id = s.supplier_id) last_grn
                FROM suppliers s LEFT JOIN v_supplier_balance vb ON vb.supplier_id = s.supplier_id WHERE s.supplier_id = p_id AND s.is_deleted = 'N') LOOP
      j.put('id', r.supplier_id); j.put('branchId', r.branch_id); j.put('code', r.supplier_code); j.put('name', r.supplier_name); j.put('contactPerson', r.contact_person);
      j.put('phone', r.phone); j.put('email', r.email); j.put('address', r.address_line); j.put('gstNumber', r.gst_number); j.put('paymentTermsDays', r.payment_terms_days);
      j.put('status', r.status); j.put('totalPurchased', r.received_value); j.put('totalPaid', r.paid); j.put('outstanding', ROUND(r.received_value - r.paid, 2));
      j.put('poCount', r.po_cnt); j.put('openPoCount', r.open_po_cnt); j.put('lastReceiptAt', api_pkg.ts_iso(r.last_grn)); j.put('createdAt', api_pkg.ts_iso(r.created_at));
      RETURN j;
    END LOOP;
    api_pkg.raise_not_found('Supplier not found');
    RETURN NULL;
  END;

  FUNCTION list_json(p_search VARCHAR2, p_status VARCHAR2) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('suppliers:view');
    FOR r IN (SELECT supplier_id FROM suppliers WHERE branch_id = api_pkg.current_branch_id AND is_deleted = 'N'
               AND (p_status IS NULL OR status = p_status)
               AND (p_search IS NULL OR LOWER(supplier_name) LIKE '%'||LOWER(p_search)||'%' OR LOWER(supplier_code) LIKE '%'||LOWER(p_search)||'%' OR LOWER(contact_person) LIKE '%'||LOWER(p_search)||'%')
               ORDER BY supplier_name) LOOP
      a.append(supplier_json(r.supplier_id));
    END LOOP;
    RETURN a;
  END;

  FUNCTION save_supplier(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_name VARCHAR2(150) := TRIM(p_body.get_string('name'));
    l_code VARCHAR2(20) := NVL(TRIM(p_body.get_string('code')), 'SUP-' || TO_CHAR(SYSTIMESTAMP, 'YYMMDDHH24MISS'));
    l_contact VARCHAR2(100) := p_body.get_string('contactPerson'); l_phone VARCHAR2(30) := p_body.get_string('phone'); l_email VARCHAR2(150) := p_body.get_string('email');
    l_addr VARCHAR2(400) := p_body.get_string('address'); l_gst VARCHAR2(30) := p_body.get_string('gstNumber'); l_terms NUMBER := NVL(p_body.get_number('paymentTermsDays'), 30);
    l_status VARCHAR2(20) := NVL(p_body.get_string('status'), 'ACTIVE');
  BEGIN
    sec_pkg.assert_permission('suppliers:manage');
    IF l_name IS NULL THEN api_pkg.raise_validation('Supplier name is required', 'name'); END IF;
    IF l_status NOT IN ('ACTIVE','INACTIVE','BLOCKED') THEN api_pkg.raise_validation('Invalid status', 'status'); END IF;
    IF l_terms < 0 THEN api_pkg.raise_validation('Payment terms cannot be negative', 'paymentTermsDays'); END IF;
    IF l_id IS NULL THEN
      INSERT INTO suppliers (branch_id, supplier_code, supplier_name, contact_person, phone, email, address_line, gst_number, payment_terms_days, status, created_by)
      VALUES (api_pkg.current_branch_id, l_code, l_name, l_contact, l_phone, l_email, l_addr, l_gst, l_terms, l_status, api_pkg.current_user_id) RETURNING supplier_id INTO l_id;
    ELSE
      UPDATE suppliers SET supplier_code = l_code, supplier_name = l_name, contact_person = l_contact, phone = l_phone, email = l_email, address_line = l_addr, gst_number = l_gst,
             payment_terms_days = l_terms, status = l_status, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
       WHERE supplier_id = l_id AND branch_id = api_pkg.current_branch_id AND is_deleted = 'N';
      IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Supplier not found'); END IF;
    END IF;
    audit_pkg.log(CASE WHEN p_id IS NULL THEN 'SUPPLIER_CREATED' ELSE 'SUPPLIER_UPDATED' END, 'SUPPLIERS', l_id, NULL, p_body.to_clob);
    RETURN l_id;
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN api_pkg.raise_conflict('Supplier code already exists'); RETURN NULL;
  END;

  PROCEDURE delete_supplier(p_id NUMBER) IS
    l_cnt NUMBER;
  BEGIN
    sec_pkg.assert_permission('suppliers:manage');
    SELECT COUNT(*) INTO l_cnt FROM purchase_orders WHERE supplier_id = p_id AND status IN ('SENT','APPROVED','ORDERED','PARTIALLY_RECEIVED');
    IF l_cnt > 0 THEN api_pkg.raise_business('Supplier has ' || l_cnt || ' open purchase order(s)'); END IF;
    UPDATE suppliers SET is_deleted = 'Y', status = 'INACTIVE', updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE supplier_id = p_id AND is_deleted = 'N';
    IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Supplier not found'); END IF;
    audit_pkg.log('SUPPLIER_DELETED', 'SUPPLIERS', p_id);
  END;

  FUNCTION history_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); pos JSON_ARRAY_T := JSON_ARRAY_T(); pays JSON_ARRAY_T := JSON_ARRAY_T(); grns JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('suppliers:view');
    j.put('supplier', supplier_json(p_id));
    FOR r IN (SELECT po_id, po_number, status, grand_total, created_at, expected_date FROM purchase_orders WHERE supplier_id = p_id ORDER BY created_at DESC) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('id', r.po_id); o.put('poNumber', r.po_number); o.put('status', r.status); o.put('grandTotal', r.grand_total); o.put('createdAt', api_pkg.ts_iso(r.created_at)); o.put('expectedDate', TO_CHAR(r.expected_date, 'YYYY-MM-DD')); pos.append(o); END;
    END LOOP;
    FOR r IN (SELECT g.grn_id, g.grn_number, g.supplier_invoice_no, g.received_at, g.total_amount, p.po_number FROM goods_receipts g JOIN purchase_orders p ON p.po_id = g.po_id WHERE p.supplier_id = p_id ORDER BY g.received_at DESC) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('id', r.grn_id); o.put('grnNumber', r.grn_number); o.put('poNumber', r.po_number); o.put('invoiceNo', r.supplier_invoice_no); o.put('amount', r.total_amount); o.put('receivedAt', api_pkg.ts_iso(r.received_at)); grns.append(o); END;
    END LOOP;
    FOR r IN (SELECT sp.*, p.po_number FROM supplier_payments sp LEFT JOIN purchase_orders p ON p.po_id = sp.po_id WHERE sp.supplier_id = p_id ORDER BY sp.paid_at DESC) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN o.put('id', r.sp_id); o.put('amount', r.amount); o.put('method', r.method); o.put('reference', r.reference_no); o.put('poNumber', r.po_number); o.put('notes', r.notes); o.put('paidAt', api_pkg.ts_iso(r.paid_at)); pays.append(o); END;
    END LOOP;
    j.put('purchaseOrders', pos); j.put('receipts', grns); j.put('payments', pays);
    RETURN j;
  END;

  FUNCTION add_payment(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_amount NUMBER := p_body.get_number('amount'); l_method VARCHAR2(20) := NVL(p_body.get_string('method'), 'BANK'); l_ref VARCHAR2(100) := p_body.get_string('reference');
    l_po NUMBER := p_body.get_number('poId'); l_notes VARCHAR2(300) := p_body.get_string('notes'); l_id NUMBER; l_cnt NUMBER;
  BEGIN
    sec_pkg.assert_permission('purchases:manage');
    IF l_amount IS NULL OR l_amount <= 0 THEN api_pkg.raise_validation('Amount must be positive', 'amount'); END IF;
    SELECT COUNT(*) INTO l_cnt FROM suppliers WHERE supplier_id = p_id AND is_deleted = 'N';
    IF l_cnt = 0 THEN api_pkg.raise_not_found('Supplier not found'); END IF;
    INSERT INTO supplier_payments (supplier_id, po_id, amount, method, reference_no, notes, created_by) VALUES (p_id, l_po, l_amount, l_method, l_ref, l_notes, api_pkg.current_user_id) RETURNING sp_id INTO l_id;
    audit_pkg.log('SUPPLIER_PAYMENT', 'SUPPLIERS', p_id, NULL, l_method || ' ' || l_amount);
    RETURN l_id;
  END;
END supplier_pkg;
/

-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE purchase_pkg AS
  FUNCTION po_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION list_json(p_status VARCHAR2, p_supplier_id NUMBER, p_search VARCHAR2) RETURN JSON_ARRAY_T;
  FUNCTION save_po(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE transition(p_id NUMBER, p_action VARCHAR2, p_reason VARCHAR2);
  FUNCTION receive_goods(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;   -- returns GRN id
END purchase_pkg;
/
CREATE OR REPLACE PACKAGE BODY purchase_pkg AS

  FUNCTION po_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); items JSON_ARRAY_T := JSON_ARRAY_T(); grns JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    FOR r IN (SELECT p.*, s.supplier_name, s.supplier_code, u.full_name created_name, a.full_name approved_name
                FROM purchase_orders p JOIN suppliers s ON s.supplier_id = p.supplier_id LEFT JOIN users u ON u.user_id = p.created_by LEFT JOIN users a ON a.user_id = p.approved_by
               WHERE p.po_id = p_id) LOOP
      FOR i IN (SELECT pi.*, ii.item_name, ii.item_code, un.unit_code FROM purchase_order_items pi JOIN inventory_items ii ON ii.inv_item_id = pi.inv_item_id JOIN inventory_units un ON un.unit_id = pi.unit_id WHERE pi.po_id = p_id ORDER BY pi.po_item_id) LOOP
        DECLARE o JSON_OBJECT_T := JSON_OBJECT_T();
        BEGIN
          o.put('id', i.po_item_id); o.put('invItemId', i.inv_item_id); o.put('itemName', i.item_name); o.put('itemCode', i.item_code); o.put('qty', i.qty); o.put('unitId', i.unit_id); o.put('unitCode', i.unit_code);
          o.put('unitPrice', i.unit_price); o.put('taxPercent', i.tax_pct); o.put('lineTotal', i.line_total); o.put('receivedQty', i.received_qty); o.put('pendingQty', GREATEST(i.qty - i.received_qty, 0));
          items.append(o);
        END;
      END LOOP;
      FOR g IN (SELECT gr.*, us.full_name FROM goods_receipts gr LEFT JOIN users us ON us.user_id = gr.received_by WHERE gr.po_id = p_id ORDER BY gr.received_at) LOOP
        DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); gi JSON_ARRAY_T := JSON_ARRAY_T();
        BEGIN
          FOR x IN (SELECT gri.*, ii.item_name FROM goods_receipt_items gri JOIN inventory_items ii ON ii.inv_item_id = gri.inv_item_id WHERE gri.grn_id = g.grn_id) LOOP
            DECLARE y JSON_OBJECT_T := JSON_OBJECT_T();
            BEGIN y.put('poItemId', x.po_item_id); y.put('itemName', x.item_name); y.put('receivedQty', x.received_qty); y.put('damagedQty', x.damaged_qty); y.put('unitCost', x.unit_cost); gi.append(y); END;
          END LOOP;
          o.put('id', g.grn_id); o.put('grnNumber', g.grn_number); o.put('invoiceNo', g.supplier_invoice_no); o.put('receivedAt', api_pkg.ts_iso(g.received_at)); o.put('receivedByName', g.full_name); o.put('totalAmount', g.total_amount); o.put('notes', g.notes); o.put('items', gi);
          grns.append(o);
        END;
      END LOOP;
      j.put('id', r.po_id); j.put('poNumber', r.po_number); j.put('branchId', r.branch_id); j.put('supplierId', r.supplier_id); j.put('supplierName', r.supplier_name); j.put('supplierCode', r.supplier_code);
      j.put('status', r.status); j.put('expectedDate', TO_CHAR(r.expected_date, 'YYYY-MM-DD')); j.put('subtotal', r.subtotal); j.put('taxTotal', r.tax_total); j.put('grandTotal', r.grand_total); j.put('notes', r.notes);
      j.put('createdByName', r.created_name); j.put('approvedByName', r.approved_name); j.put('createdAt', api_pkg.ts_iso(r.created_at)); j.put('sentAt', api_pkg.ts_iso(r.sent_at)); j.put('approvedAt', api_pkg.ts_iso(r.approved_at));
      j.put('orderedAt', api_pkg.ts_iso(r.ordered_at)); j.put('receivedAt', api_pkg.ts_iso(r.received_at)); j.put('cancelledAt', api_pkg.ts_iso(r.cancelled_at)); j.put('cancelReason', r.cancel_reason);
      j.put('items', items); j.put('receipts', grns);
      RETURN j;
    END LOOP;
    api_pkg.raise_not_found('Purchase order not found');
    RETURN NULL;
  END;

  FUNCTION list_json(p_status VARCHAR2, p_supplier_id NUMBER, p_search VARCHAR2) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('purchases:view');
    FOR r IN (SELECT p.po_id FROM purchase_orders p JOIN suppliers s ON s.supplier_id = p.supplier_id
               WHERE p.branch_id = api_pkg.current_branch_id AND (p_status IS NULL OR p.status = p_status) AND (p_supplier_id IS NULL OR p.supplier_id = p_supplier_id)
                 AND (p_search IS NULL OR LOWER(p.po_number) LIKE '%'||LOWER(p_search)||'%' OR LOWER(s.supplier_name) LIKE '%'||LOWER(p_search)||'%')
               ORDER BY p.created_at DESC) LOOP
      a.append(po_json(r.po_id));
    END LOOP;
    RETURN a;
  END;

  PROCEDURE recalc(p_id NUMBER) IS
    l_sub NUMBER; l_tax NUMBER;
  BEGIN
    SELECT NVL(SUM(qty * unit_price), 0), NVL(SUM(qty * unit_price * tax_pct / 100), 0) INTO l_sub, l_tax FROM purchase_order_items WHERE po_id = p_id;
    UPDATE purchase_orders SET subtotal = ROUND(l_sub, 2), tax_total = ROUND(l_tax, 2), grand_total = ROUND(l_sub + l_tax, 2), updated_at = SYSTIMESTAMP WHERE po_id = p_id;
  END;

  FUNCTION save_po(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_supplier NUMBER := p_body.get_number('supplierId'); l_exp DATE; l_notes VARCHAR2(500) := p_body.get_string('notes');
    items JSON_ARRAY_T := p_body.get_array('items'); it JSON_OBJECT_T; l_status VARCHAR2(20); l_cnt NUMBER; l_no VARCHAR2(30);
  BEGIN
    sec_pkg.assert_permission('purchases:manage');
    IF p_body.get_string('expectedDate') IS NOT NULL THEN l_exp := TO_DATE(p_body.get_string('expectedDate'), 'YYYY-MM-DD'); END IF;
    SELECT COUNT(*) INTO l_cnt FROM suppliers WHERE supplier_id = l_supplier AND is_deleted = 'N' AND status = 'ACTIVE';
    IF l_cnt = 0 THEN api_pkg.raise_validation('Select an active supplier', 'supplierId'); END IF;
    IF items IS NULL OR items.get_size = 0 THEN api_pkg.raise_validation('Add at least one item', 'items'); END IF;
    IF l_id IS NULL THEN
      l_no := numbering_pkg.next_number('PO', 'PO');
      INSERT INTO purchase_orders (po_number, branch_id, supplier_id, expected_date, notes, created_by) VALUES (l_no, api_pkg.current_branch_id, l_supplier, l_exp, l_notes, api_pkg.current_user_id) RETURNING po_id INTO l_id;
    ELSE
      SELECT status INTO l_status FROM purchase_orders WHERE po_id = l_id AND branch_id = api_pkg.current_branch_id FOR UPDATE;
      IF l_status NOT IN ('DRAFT','SENT') THEN api_pkg.raise_business('Only draft or sent purchase orders can be edited'); END IF;
      UPDATE purchase_orders SET supplier_id = l_supplier, expected_date = l_exp, notes = l_notes, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE po_id = l_id;
      DELETE FROM purchase_order_items WHERE po_id = l_id;
    END IF;
    FOR i IN 0 .. items.get_size - 1 LOOP
      it := TREAT(items.get(i) AS JSON_OBJECT_T);
      DECLARE l_inv NUMBER := it.get_number('invItemId'); l_qty NUMBER := it.get_number('qty'); l_unit NUMBER := it.get_number('unitId'); l_price NUMBER := NVL(it.get_number('unitPrice'), 0); l_tax NUMBER := NVL(it.get_number('taxPercent'), 0);
      BEGIN
        IF l_qty IS NULL OR l_qty <= 0 THEN api_pkg.raise_validation('Quantity must be positive', 'items'); END IF;
        IF l_price < 0 THEN api_pkg.raise_validation('Price cannot be negative', 'items'); END IF;
        IF l_unit IS NULL THEN SELECT unit_id INTO l_unit FROM inventory_items WHERE inv_item_id = l_inv; END IF;
        INSERT INTO purchase_order_items (po_id, inv_item_id, qty, unit_id, unit_price, tax_pct, line_total) VALUES (l_id, l_inv, l_qty, l_unit, l_price, l_tax, ROUND(l_qty * l_price * (1 + l_tax / 100), 2));
      END;
    END LOOP;
    recalc(l_id);
    audit_pkg.log(CASE WHEN p_id IS NULL THEN 'PO_CREATED' ELSE 'PO_UPDATED' END, 'PURCHASE_ORDERS', l_id, NULL, p_body.to_clob);
    RETURN l_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Purchase order or inventory item not found'); RETURN NULL;
  END;

  -- DRAFT → SENT → APPROVED → ORDERED → PARTIALLY_RECEIVED → RECEIVED ; any (not RECEIVED) → CANCELLED
  PROCEDURE transition(p_id NUMBER, p_action VARCHAR2, p_reason VARCHAR2) IS
    l_status VARCHAR2(20); l_new VARCHAR2(20); l_total NUMBER;
  BEGIN
    SELECT status, grand_total INTO l_status, l_total FROM purchase_orders WHERE po_id = p_id AND branch_id = api_pkg.current_branch_id FOR UPDATE;
    CASE p_action
      WHEN 'SEND' THEN sec_pkg.assert_permission('purchases:manage'); IF l_status <> 'DRAFT' THEN api_pkg.raise_conflict('Only drafts can be sent'); END IF; l_new := 'SENT';
        UPDATE purchase_orders SET status = 'SENT', sent_at = SYSTIMESTAMP WHERE po_id = p_id;
        notify_pkg.create_notification('PO_APPROVAL', 'INFO', 'Purchase order awaiting approval', 'PO ' || p_id || ' for ' || l_total, 'PURCHASE_ORDERS', p_id, 'MANAGER', NULL, 'PO_APPROVAL:' || p_id);
      WHEN 'APPROVE' THEN sec_pkg.assert_permission('purchases:approve'); IF l_status NOT IN ('SENT','DRAFT') THEN api_pkg.raise_conflict('Only sent purchase orders can be approved'); END IF; l_new := 'APPROVED';
        UPDATE purchase_orders SET status = 'APPROVED', approved_by = api_pkg.current_user_id, approved_at = SYSTIMESTAMP WHERE po_id = p_id;
        notify_pkg.resolve_dedupe('PO_APPROVAL:' || p_id);
      WHEN 'ORDER' THEN sec_pkg.assert_permission('purchases:manage'); IF l_status <> 'APPROVED' THEN api_pkg.raise_conflict('Approve the purchase order first'); END IF; l_new := 'ORDERED';
        UPDATE purchase_orders SET status = 'ORDERED', ordered_at = SYSTIMESTAMP WHERE po_id = p_id;
      WHEN 'CANCEL' THEN sec_pkg.assert_permission('purchases:manage'); IF l_status IN ('RECEIVED','CANCELLED') THEN api_pkg.raise_conflict('Purchase order is already ' || LOWER(l_status)); END IF;
        IF TRIM(p_reason) IS NULL THEN api_pkg.raise_validation('Cancellation reason is required', 'reason'); END IF; l_new := 'CANCELLED';
        UPDATE purchase_orders SET status = 'CANCELLED', cancelled_at = SYSTIMESTAMP, cancel_reason = SUBSTR(p_reason, 1, 300) WHERE po_id = p_id;
        notify_pkg.resolve_dedupe('PO_APPROVAL:' || p_id);
      ELSE api_pkg.raise_validation('Unknown action ' || p_action, 'action');
    END CASE;
    audit_pkg.log('PO_' || p_action, 'PURCHASE_ORDERS', p_id, l_status, l_new);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Purchase order not found');
  END;

  FUNCTION receive_goods(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_status VARCHAR2(20); l_grn NUMBER; l_no VARCHAR2(30); items JSON_ARRAY_T := p_body.get_array('items'); it JSON_OBJECT_T; l_total NUMBER := 0;
    l_all_received CHAR(1) := 'Y'; l_any NUMBER := 0; l_mvt NUMBER;
  BEGIN
    sec_pkg.assert_permission('purchases:receive');
    SELECT status INTO l_status FROM purchase_orders WHERE po_id = p_id AND branch_id = api_pkg.current_branch_id FOR UPDATE;
    IF l_status NOT IN ('APPROVED','ORDERED','PARTIALLY_RECEIVED') THEN api_pkg.raise_business('Goods can be received only for approved/ordered purchase orders'); END IF;
    IF items IS NULL OR items.get_size = 0 THEN api_pkg.raise_validation('Nothing to receive', 'items'); END IF;
    l_no := numbering_pkg.next_number('GRN', 'GRN');
    INSERT INTO goods_receipts (grn_number, po_id, supplier_invoice_no, received_by, notes) VALUES (l_no, p_id, p_body.get_string('invoiceNo'), api_pkg.current_user_id, p_body.get_string('notes')) RETURNING grn_id INTO l_grn;
    FOR i IN 0 .. items.get_size - 1 LOOP
      it := TREAT(items.get(i) AS JSON_OBJECT_T);
      DECLARE l_poi NUMBER := it.get_number('poItemId'); l_recv NUMBER := NVL(it.get_number('receivedQty'), 0); l_dmg NUMBER := NVL(it.get_number('damagedQty'), 0); l_cost NUMBER := it.get_number('unitCost');
              poi purchase_order_items%ROWTYPE; l_good NUMBER; ii inventory_items%ROWTYPE; l_stock_qty NUMBER;
      BEGIN
        IF l_recv < 0 OR l_dmg < 0 OR l_dmg > l_recv THEN api_pkg.raise_validation('Received / damaged quantities are invalid', 'items'); END IF;
        IF l_recv = 0 THEN CONTINUE; END IF;
        SELECT * INTO poi FROM purchase_order_items WHERE po_item_id = l_poi AND po_id = p_id FOR UPDATE;
        SELECT * INTO ii FROM inventory_items WHERE inv_item_id = poi.inv_item_id;
        l_cost := NVL(l_cost, poi.unit_price);
        l_good := l_recv - l_dmg;
        INSERT INTO goods_receipt_items (grn_id, po_item_id, inv_item_id, received_qty, damaged_qty, unit_cost) VALUES (l_grn, l_poi, poi.inv_item_id, l_recv, l_dmg, l_cost);
        -- convert PO unit → stock unit, cost per stock unit
        l_stock_qty := inventory_pkg.convert_qty(l_good, poi.unit_id, ii.unit_id, ii.pack_size);
        IF l_stock_qty > 0 THEN
          l_mvt := inventory_pkg.apply_movement(poi.inv_item_id, 'PURCHASE', l_stock_qty, ROUND(l_cost * l_good / l_stock_qty, 4), 'GRN', l_grn, 'GRN:' || l_grn || ':' || l_poi, 'Goods receipt ' || l_no);
        END IF;
        IF l_dmg > 0 THEN
          -- damaged goods are recorded (for supplier claims) but never enter usable stock
          audit_pkg.log('GRN_DAMAGED', 'GOODS_RECEIPTS', l_grn, NULL, ii.item_name || ' damaged ' || l_dmg);
        END IF;
        UPDATE purchase_order_items SET received_qty = received_qty + l_recv WHERE po_item_id = l_poi;
        l_total := l_total + l_recv * l_cost;
      END;
    END LOOP;
    UPDATE goods_receipts SET total_amount = ROUND(l_total, 2) WHERE grn_id = l_grn;
    FOR r IN (SELECT qty, received_qty FROM purchase_order_items WHERE po_id = p_id) LOOP
      IF r.received_qty < r.qty THEN l_all_received := 'N'; END IF;
      IF r.received_qty > 0 THEN l_any := 1; END IF;
    END LOOP;
    UPDATE purchase_orders SET status = CASE WHEN l_all_received = 'Y' THEN 'RECEIVED' ELSE 'PARTIALLY_RECEIVED' END,
           received_at = CASE WHEN l_all_received = 'Y' THEN SYSTIMESTAMP ELSE received_at END, updated_at = SYSTIMESTAMP WHERE po_id = p_id;
    audit_pkg.log('PO_RECEIVED', 'PURCHASE_ORDERS', p_id, l_status, 'GRN ' || l_no || ' ' || ROUND(l_total, 2));
    audit_pkg.emit_event('inventory', 'grn.created', l_grn);
    RETURN l_grn;
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Purchase order or line not found'); RETURN NULL;
  END;
END purchase_pkg;
/
