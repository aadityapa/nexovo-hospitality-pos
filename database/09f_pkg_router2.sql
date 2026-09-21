-- =====================================================================
-- PHASE 2 — API_ROUTER2_PKG body: routes for every Phase 2 module.
-- Called by API_ROUTER_PKG.dispatch for any key it does not know (after authentication + branch context).
-- Spec is declared in 06_ords_modules.sql.
-- =====================================================================
CREATE OR REPLACE PACKAGE BODY api_router2_pkg AS

  FUNCTION q(p VARCHAR2) RETURN VARCHAR2 IS BEGIN RETURN api_router_pkg.q(p); END;
  FUNCTION qn(p VARCHAR2) RETURN NUMBER IS BEGIN RETURN api_router_pkg.qn(p); END;
  FUNCTION qb(p VARCHAR2) RETURN BOOLEAN IS BEGIN RETURN api_router_pkg.qb(p); END;
  FUNCTION qts(p VARCHAR2) RETURN TIMESTAMP IS BEGIN RETURN api_router_pkg.qts(p); END;
  FUNCTION qd(p VARCHAR2) RETURN DATE IS BEGIN RETURN TO_DATE(SUBSTR(api_router_pkg.q(p), 1, 10), 'YYYY-MM-DD'); EXCEPTION WHEN OTHERS THEN RETURN NULL; END;

  PROCEDURE dispatch(p_key VARCHAR2, p_path VARCHAR2, b IN OUT NOCOPY JSON_OBJECT_T, p_id NUMBER, p_id2 NUMBER, p_from TIMESTAMP, p_to TIMESTAMP,
                     d IN OUT NOCOPY JSON_ELEMENT_T, l_msg IN OUT NOCOPY VARCHAR2, o_status IN OUT NOCOPY PLS_INTEGER) IS
    l_n NUMBER; l_from TIMESTAMP := p_from; l_to TIMESTAMP := p_to;
  BEGIN
    CASE p_key
      -- ---------------- multi-branch ----------------
      -- any authenticated user: returns only the branches they may work in (header switcher)
      WHEN 'GET /branches' THEN d := branch_pkg.list_branches_json;
      WHEN 'POST /branches' THEN l_n := branch_pkg.save_branch(NULL, b); d := branch_pkg.list_branches_json; o_status := 201; l_msg := 'Branch created';
      WHEN 'PUT /branches/{id}' THEN l_n := branch_pkg.save_branch(p_id, b); d := branch_pkg.list_branches_json; l_msg := 'Branch updated';
      WHEN 'GET /outlets' THEN sec_pkg.assert_permission('branches:view'); d := branch_pkg.list_outlets_json;
      WHEN 'POST /outlets' THEN l_n := branch_pkg.save_outlet(NULL, b); d := branch_pkg.list_outlets_json; o_status := 201; l_msg := 'Outlet created';
      WHEN 'PUT /outlets/{id}' THEN l_n := branch_pkg.save_outlet(p_id, b); d := branch_pkg.list_outlets_json; l_msg := 'Outlet updated';
      WHEN 'PUT /users/{id}/branches' THEN branch_pkg.set_user_branches(p_id, b.get_array('branchIds')); d := sec_pkg.user_json(p_id); l_msg := 'Branch access updated';

      -- ---------------- inventory ----------------
      WHEN 'GET /inventory/units' THEN sec_pkg.assert_permission('inventory:view'); d := inventory_pkg.units_json;
      WHEN 'GET /inventory/categories' THEN sec_pkg.assert_permission('inventory:view'); d := inventory_pkg.list_categories_json;
      WHEN 'POST /inventory/categories' THEN l_n := inventory_pkg.save_category(NULL, b); d := inventory_pkg.list_categories_json; o_status := 201; l_msg := 'Category created';
      WHEN 'PUT /inventory/categories/{id}' THEN l_n := inventory_pkg.save_category(p_id, b); d := inventory_pkg.list_categories_json; l_msg := 'Category updated';
      WHEN 'GET /inventory/items' THEN d := inventory_pkg.list_items_json(q('search'), qn('categoryId'), q('status'));
      WHEN 'GET /inventory/items/{id}' THEN sec_pkg.assert_permission('inventory:view'); d := inventory_pkg.item_json(p_id);
      WHEN 'POST /inventory/items' THEN d := inventory_pkg.item_json(inventory_pkg.save_item(NULL, b)); o_status := 201; l_msg := 'Inventory item created';
      WHEN 'PUT /inventory/items/{id}' THEN d := inventory_pkg.item_json(inventory_pkg.save_item(p_id, b)); l_msg := 'Inventory item updated';
      WHEN 'DELETE /inventory/items/{id}' THEN inventory_pkg.delete_item(p_id); l_msg := 'Inventory item deleted';
      WHEN 'GET /inventory/items/{id}/movements' THEN d := inventory_pkg.movements_json(p_id, q('type'), qts('from'), qts('to'), NVL(qn('limit'), 200));
      WHEN 'GET /inventory/movements' THEN d := inventory_pkg.movements_json(qn('invItemId'), q('type'), qts('from'), qts('to'), NVL(qn('limit'), 200));
      WHEN 'POST /inventory/movements' THEN l_n := inventory_pkg.manual_movement(b); d := inventory_pkg.item_json(b.get_number('invItemId')); o_status := 201; l_msg := 'Stock movement recorded';
      WHEN 'GET /inventory/dashboard' THEN d := inventory_pkg.dashboard_json;
      WHEN 'GET /inventory/low-stock' THEN d := inventory_pkg.low_stock_json;
      WHEN 'POST /orders/{id}/deduct-stock' THEN inventory_pkg.deduct_manual(p_id); d := order_pkg.order_json(p_id); l_msg := 'Stock deducted';

      -- ---------------- recipes ----------------
      WHEN 'GET /recipes' THEN d := recipe_pkg.costing_list_json;
      WHEN 'GET /recipes/{id}' THEN d := recipe_pkg.recipe_json(p_id);
      WHEN 'PUT /recipes/{id}' THEN l_n := recipe_pkg.save_recipe(p_id, b); d := recipe_pkg.recipe_json(p_id); l_msg := 'Recipe saved';
      WHEN 'DELETE /recipes/{id}' THEN recipe_pkg.delete_recipe(p_id); l_msg := 'Recipe deactivated';

      -- ---------------- suppliers & purchasing ----------------
      WHEN 'GET /suppliers' THEN d := supplier_pkg.list_json(q('search'), q('status'));
      WHEN 'GET /suppliers/{id}' THEN d := supplier_pkg.history_json(p_id);
      WHEN 'POST /suppliers' THEN d := supplier_pkg.supplier_json(supplier_pkg.save_supplier(NULL, b)); o_status := 201; l_msg := 'Supplier created';
      WHEN 'PUT /suppliers/{id}' THEN d := supplier_pkg.supplier_json(supplier_pkg.save_supplier(p_id, b)); l_msg := 'Supplier updated';
      WHEN 'DELETE /suppliers/{id}' THEN supplier_pkg.delete_supplier(p_id); l_msg := 'Supplier deleted';
      WHEN 'POST /suppliers/{id}/payments' THEN l_n := supplier_pkg.add_payment(p_id, b); d := supplier_pkg.history_json(p_id); o_status := 201; l_msg := 'Supplier payment recorded';
      WHEN 'GET /purchases' THEN d := purchase_pkg.list_json(q('status'), qn('supplierId'), q('search'));
      WHEN 'GET /purchases/{id}' THEN sec_pkg.assert_permission('purchases:view'); d := purchase_pkg.po_json(p_id);
      WHEN 'POST /purchases' THEN d := purchase_pkg.po_json(purchase_pkg.save_po(NULL, b)); o_status := 201; l_msg := 'Purchase order created';
      WHEN 'PUT /purchases/{id}' THEN d := purchase_pkg.po_json(purchase_pkg.save_po(p_id, b)); l_msg := 'Purchase order updated';
      WHEN 'POST /purchases/{id}/transition' THEN purchase_pkg.transition(p_id, b.get_string('action'), b.get_string('reason')); d := purchase_pkg.po_json(p_id); l_msg := 'Purchase order ' || LOWER(b.get_string('action')) || 'ed';
      WHEN 'POST /purchases/{id}/receive' THEN l_n := purchase_pkg.receive_goods(p_id, b); d := purchase_pkg.po_json(p_id); o_status := 201; l_msg := 'Goods received into stock';

      -- ---------------- CRM & loyalty ----------------
      WHEN 'GET /customers' THEN d := customer_pkg.list_json(q('search'), NVL(qn('limit'), 100));
      WHEN 'GET /customers/{id}' THEN sec_pkg.assert_permission('customers:view'); d := customer_pkg.customer_json(p_id);
      WHEN 'GET /customers/{id}/history' THEN d := customer_pkg.history_json(p_id);
      WHEN 'POST /customers' THEN d := customer_pkg.customer_json(customer_pkg.save_customer(NULL, b)); o_status := 201; l_msg := 'Customer created';
      WHEN 'PUT /customers/{id}' THEN d := customer_pkg.customer_json(customer_pkg.save_customer(p_id, b)); l_msg := 'Customer updated';
      WHEN 'DELETE /customers/{id}' THEN customer_pkg.delete_customer(p_id); l_msg := 'Customer deleted';
      WHEN 'PUT /orders/{id}/customer' THEN customer_pkg.attach_to_order(p_id, b.get_number('customerId')); d := order_pkg.order_json(p_id); l_msg := 'Customer linked to order';
      WHEN 'GET /loyalty/program' THEN sec_pkg.assert_permission('loyalty:view'); d := loyalty_pkg.program_json;
      -- Asserted here AND inside save_program. The package assertion is the one that matters (it
      -- guards the procedure however it is reached, including from another package); this one
      -- keeps the route table readable as a permission map.
      WHEN 'PUT /loyalty/program' THEN sec_pkg.assert_permission('loyalty:configure'); loyalty_pkg.save_program(b); d := loyalty_pkg.program_json; l_msg := 'Loyalty program updated';
      WHEN 'GET /loyalty/accounts/{id}' THEN sec_pkg.assert_permission('loyalty:view'); d := loyalty_pkg.account_json(p_id);
      -- Member operation: stays on 'loyalty:manage', which the manager keeps.
      WHEN 'POST /loyalty/accounts/{id}/adjust' THEN sec_pkg.assert_permission('loyalty:manage'); loyalty_pkg.adjust(p_id, b.get_number('points'), b.get_string('notes')); d := loyalty_pkg.account_json(p_id); l_msg := 'Points adjusted';
      WHEN 'POST /bills/{id}/redeem-points' THEN loyalty_pkg.redeem_on_bill(p_id, b.get_number('points')); d := billing_pkg.bill_json(p_id); l_msg := 'Points redeemed';

      -- ---------------- reservations ----------------
      WHEN 'GET /reservations' THEN d := reservation_pkg.list_json(qd('from'), qd('to'), q('status'), q('search'));
      WHEN 'GET /reservations/availability' THEN d := reservation_pkg.availability_json(NVL(qd('date'), TRUNC(SYSDATE)));
      WHEN 'GET /reservations/{id}' THEN sec_pkg.assert_permission('reservations:view'); d := reservation_pkg.res_json(p_id);
      WHEN 'POST /reservations' THEN d := reservation_pkg.res_json(reservation_pkg.save_res(NULL, b)); o_status := 201; l_msg := 'Reservation created';
      WHEN 'PUT /reservations/{id}' THEN d := reservation_pkg.res_json(reservation_pkg.save_res(p_id, b)); l_msg := 'Reservation updated';
      WHEN 'POST /reservations/{id}/transition' THEN reservation_pkg.transition(p_id, b.get_string('action'), b.get_number('tableId'), b.get_string('reason')); d := reservation_pkg.res_json(p_id); l_msg := 'Reservation updated';

      -- ---------------- club ----------------
      WHEN 'GET /club/cover-types' THEN sec_pkg.assert_permission('club:view'); d := club_pkg.cover_types_json;
      WHEN 'POST /club/cover-types' THEN l_n := club_pkg.save_cover_type(NULL, b); d := club_pkg.cover_types_json; o_status := 201; l_msg := 'Cover charge created';
      WHEN 'PUT /club/cover-types/{id}' THEN l_n := club_pkg.save_cover_type(p_id, b); d := club_pkg.cover_types_json; l_msg := 'Cover charge updated';
      WHEN 'GET /club/entries' THEN d := club_pkg.list_entries_json(qd('date'), q('status'));
      WHEN 'POST /club/entries' THEN d := club_pkg.entry_json(club_pkg.check_in(b)); o_status := 201; l_msg := 'Guest checked in';
      WHEN 'POST /club/entries/{id}/checkout' THEN club_pkg.check_out(p_id); d := club_pkg.entry_json(p_id); l_msg := 'Guest checked out';
      WHEN 'POST /club/entries/{id}/cancel' THEN club_pkg.cancel_entry(p_id, b.get_string('reason')); d := club_pkg.entry_json(p_id); l_msg := 'Entry cancelled';
      WHEN 'GET /club/dashboard' THEN d := club_pkg.dashboard_json;
      WHEN 'POST /bills/{id}/redeem-cover' THEN club_pkg.redeem_cover(p_id, b.get_number('entryId'), b.get_number('amount')); d := billing_pkg.bill_json(p_id); l_msg := 'Cover credit applied';

      -- ---------------- VIP tables & bottle service ----------------
      WHEN 'GET /vip/tables' THEN d := vip_pkg.vip_tables_json;
      WHEN 'GET /vip/reservations' THEN d := vip_pkg.list_json(qd('date'), q('status'));
      WHEN 'GET /vip/reservations/{id}' THEN sec_pkg.assert_permission('vip:view'); d := vip_pkg.vip_json(p_id);
      WHEN 'GET /vip/reservations/{id}/spend' THEN d := vip_pkg.spend_json(p_id);
      WHEN 'POST /vip/reservations' THEN d := vip_pkg.vip_json(vip_pkg.save_vip(NULL, b)); o_status := 201; l_msg := 'VIP table booked';
      WHEN 'PUT /vip/reservations/{id}' THEN d := vip_pkg.vip_json(vip_pkg.save_vip(p_id, b)); l_msg := 'VIP booking updated';
      WHEN 'POST /vip/reservations/{id}/transition' THEN vip_pkg.transition(p_id, b.get_string('action'), b.get_string('reason')); d := vip_pkg.vip_json(p_id); l_msg := 'VIP booking updated';
      WHEN 'GET /bottle-service' THEN d := bottle_pkg.list_json;
      WHEN 'PUT /bottle-service/{id}' THEN l_n := bottle_pkg.save(p_id, b); d := bottle_pkg.list_json; l_msg := 'Bottle service saved';
      WHEN 'DELETE /bottle-service/{id}' THEN bottle_pkg.remove(p_id); d := bottle_pkg.list_json; l_msg := 'Bottle service removed';

      -- ---------------- hotel room charges ----------------
      WHEN 'POST /room-charges/verify' THEN d := room_charge_pkg.verify_room(b.get_string('roomNo'));
      WHEN 'POST /bills/{id}/room-charge' THEN room_charge_pkg.post_to_room(p_id, b.get_string('roomNo'), b.get_string('guestName'), b.get_number('amount')); d := billing_pkg.bill_json(p_id); l_msg := 'Charged to room';
      WHEN 'GET /room-charges' THEN d := room_charge_pkg.list_json(qts('from'), qts('to'));

      -- ---------------- notifications ----------------
      WHEN 'GET /notifications' THEN d := notify_pkg.list_json(qb('unread'), NVL(qn('limit'), 50));
      WHEN 'PUT /notifications/read-all' THEN notify_pkg.mark_all_read; d := notify_pkg.list_json(FALSE, 50); l_msg := 'All notifications marked read';
      WHEN 'PUT /notifications/{id}/read' THEN notify_pkg.mark_read(p_id); d := notify_pkg.list_json(FALSE, 50);
      WHEN 'GET /notifications/thresholds' THEN d := notify_pkg.thresholds_json;
      WHEN 'PUT /notifications/thresholds' THEN notify_pkg.save_thresholds(b.get_array('thresholds')); d := notify_pkg.thresholds_json; l_msg := 'Thresholds saved';

      -- ---------------- advanced reports ----------------
      WHEN 'GET /reports/v2/sales' THEN d := report2_pkg.sales_period(l_from, l_to, NVL(q('groupBy'), 'DAY'));
      WHEN 'GET /reports/v2/branches' THEN d := report2_pkg.branch_comparison(l_from, l_to);
      WHEN 'GET /reports/v2/categories' THEN d := report2_pkg.category_performance(l_from, l_to);
      WHEN 'GET /reports/v2/inventory/valuation' THEN d := report2_pkg.inventory_valuation;
      WHEN 'GET /reports/v2/inventory/low-stock' THEN d := inventory_pkg.low_stock_json;
      WHEN 'GET /reports/v2/inventory/wastage' THEN d := report2_pkg.wastage(l_from, l_to);
      WHEN 'GET /reports/v2/inventory/consumption' THEN d := report2_pkg.consumption(l_from, l_to);
      WHEN 'GET /reports/v2/inventory/movements' THEN d := inventory_pkg.movements_json(NULL, q('type'), l_from, l_to, NVL(qn('limit'), 500));
      WHEN 'GET /reports/v2/profitability' THEN d := report2_pkg.profitability(l_from, l_to);
      WHEN 'GET /reports/v2/staff' THEN d := report2_pkg.staff_performance(l_from, l_to);

      ELSE api_pkg.raise_not_found('Endpoint not found: ' || p_key);
    END CASE;
  END;
END api_router2_pkg;
/
