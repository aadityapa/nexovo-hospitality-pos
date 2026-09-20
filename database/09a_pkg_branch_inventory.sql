-- =====================================================================
-- PHASE 2 — BRANCH_PKG (org / outlets / multi-branch access), INVENTORY_PKG, RECIPE_PKG
-- Conventions: no BOOLEAN inside SQL, JSON getters hoisted into locals before DML,
--              document numbers generated outside INSERT … VALUES.
-- =====================================================================

-- ---------------------------------------------------------------------
-- NOTIFY_PKG spec first (inventory raises low-stock alerts); body lives in 09e
-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE notify_pkg AS
  PROCEDURE create_notification(p_type VARCHAR2, p_severity VARCHAR2, p_title VARCHAR2, p_body VARCHAR2,
                                p_entity VARCHAR2 DEFAULT NULL, p_entity_id NUMBER DEFAULT NULL,
                                p_target_role VARCHAR2 DEFAULT NULL, p_target_user NUMBER DEFAULT NULL,
                                p_dedupe_key VARCHAR2 DEFAULT NULL);
  PROCEDURE resolve_dedupe(p_dedupe_key VARCHAR2);
  FUNCTION list_json(p_unread_only BOOLEAN, p_limit NUMBER DEFAULT 50) RETURN JSON_OBJECT_T;
  PROCEDURE mark_read(p_id NUMBER);
  PROCEDURE mark_all_read;
  FUNCTION thresholds_json RETURN JSON_ARRAY_T;
  PROCEDURE save_thresholds(p_body JSON_ARRAY_T);
  FUNCTION threshold(p_key VARCHAR2, p_default NUMBER) RETURN NUMBER;
  PROCEDURE run_checks;
END notify_pkg;
/

-- ---------------------------------------------------------------------
-- BRANCH_PKG
-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE branch_pkg AS
  FUNCTION user_can_access(p_user_id NUMBER, p_branch_id NUMBER) RETURN BOOLEAN;
  PROCEDURE assert_branch_access(p_branch_id NUMBER);
  FUNCTION list_branches_json RETURN JSON_ARRAY_T;         -- branches the current user may switch to
  FUNCTION save_branch(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  FUNCTION list_outlets_json RETURN JSON_ARRAY_T;
  FUNCTION save_outlet(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE set_user_branches(p_user_id NUMBER, p_branch_ids JSON_ARRAY_T);
  FUNCTION user_branch_ids(p_user_id NUMBER) RETURN JSON_ARRAY_T;
END branch_pkg;
/
CREATE OR REPLACE PACKAGE BODY branch_pkg AS
  FUNCTION user_can_access(p_user_id NUMBER, p_branch_id NUMBER) RETURN BOOLEAN IS
    l_cnt NUMBER;
  BEGIN
    IF sec_pkg.user_has_role(p_user_id, 'SUPER_ADMIN') THEN RETURN TRUE; END IF;
    SELECT COUNT(*) INTO l_cnt FROM user_branches WHERE user_id = p_user_id AND branch_id = p_branch_id;
    RETURN l_cnt > 0;
  END;

  PROCEDURE assert_branch_access(p_branch_id NUMBER) IS
  BEGIN
    IF api_pkg.current_user_id IS NULL THEN api_pkg.raise_unauth; END IF;
    IF NOT user_can_access(api_pkg.current_user_id, p_branch_id) THEN
      api_pkg.raise_forbidden('You do not have access to this branch');
    END IF;
  END;

  -- Any authenticated user: only the branches they may work in are returned (header switcher)
  FUNCTION list_branches_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T(); l_super CHAR(1);
  BEGIN
    IF api_pkg.current_user_id IS NULL THEN api_pkg.raise_unauth; END IF;
    l_super := api_pkg.yn(sec_pkg.user_has_role(api_pkg.current_user_id, 'SUPER_ADMIN'));
    FOR r IN (SELECT b.branch_id, b.branch_code, b.business_name, b.branch_name, b.city, b.is_active, o.org_name,
                     (SELECT COUNT(*) FROM outlets x WHERE x.branch_id = b.branch_id) outlet_cnt,
                     (SELECT COUNT(*) FROM dining_tables t WHERE t.branch_id = b.branch_id AND t.is_deleted = 'N') table_cnt
                FROM branches b JOIN organizations o ON o.org_id = b.org_id
               WHERE l_super = 'Y' OR EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = api_pkg.current_user_id AND ub.branch_id = b.branch_id)
               ORDER BY b.branch_id) LOOP
      DECLARE j JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN
        j.put('id', r.branch_id); j.put('code', r.branch_code); j.put('businessName', r.business_name); j.put('name', r.branch_name);
        j.put('city', r.city); j.put('orgName', r.org_name); j.put('isActive', r.is_active = 'Y'); j.put('outletCount', r.outlet_cnt); j.put('tableCount', r.table_cnt);
        j.put('isCurrent', r.branch_id = api_pkg.current_branch_id);
        a.append(j);
      END;
    END LOOP;
    RETURN a;
  END;

  FUNCTION save_branch(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_code VARCHAR2(20) := UPPER(TRIM(p_body.get_string('code')));
    l_biz VARCHAR2(150) := TRIM(p_body.get_string('businessName')); l_name VARCHAR2(150) := TRIM(p_body.get_string('name'));
    l_city VARCHAR2(100) := p_body.get_string('city'); l_addr VARCHAR2(400) := p_body.get_string('address');
    l_phone VARCHAR2(30) := p_body.get_string('phone'); l_gst VARCHAR2(30) := p_body.get_string('gstNumber');
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE));
  BEGIN
    sec_pkg.assert_permission('branches:manage');
    IF l_code IS NULL OR l_biz IS NULL OR l_name IS NULL THEN api_pkg.raise_validation('Code, business name and branch name are required', 'code'); END IF;
    IF l_id IS NULL THEN
      INSERT INTO branches (org_id, branch_code, business_name, branch_name, address_line, city, phone, gst_number, is_active, created_by)
      VALUES (1, l_code, l_biz, l_name, l_addr, l_city, l_phone, l_gst, l_active, api_pkg.current_user_id) RETURNING branch_id INTO l_id;
      -- every new branch gets a default floor + tax groups copied from branch 1 so it is immediately usable
      INSERT INTO floors (branch_id, floor_code, floor_name, display_order) VALUES (l_id, 'MAIN', 'Main Dining', 1);
      FOR t IN (SELECT * FROM tax_configurations WHERE branch_id = 1) LOOP
        DECLARE l_tg NUMBER;
        BEGIN
          INSERT INTO tax_configurations (branch_id, tax_code, tax_name, is_active) VALUES (l_id, t.tax_code, t.tax_name, t.is_active) RETURNING tax_group_id INTO l_tg;
          INSERT INTO tax_components (tax_group_id, component_code, component_name, rate_pct)
          SELECT l_tg, component_code, component_name, rate_pct FROM tax_components WHERE tax_group_id = t.tax_group_id;
        END;
      END LOOP;
      INSERT INTO user_branches (user_id, branch_id) SELECT api_pkg.current_user_id, l_id FROM dual
       WHERE NOT EXISTS (SELECT 1 FROM user_branches WHERE user_id = api_pkg.current_user_id AND branch_id = l_id);
    ELSE
      UPDATE branches SET branch_code = l_code, business_name = l_biz, branch_name = l_name, address_line = l_addr, city = l_city,
             phone = l_phone, gst_number = l_gst, is_active = l_active, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
       WHERE branch_id = l_id;
      IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Branch not found'); END IF;
    END IF;
    audit_pkg.log(CASE WHEN p_id IS NULL THEN 'BRANCH_CREATED' ELSE 'BRANCH_UPDATED' END, 'BRANCHES', l_id, NULL, p_body.to_clob);
    RETURN l_id;
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN api_pkg.raise_conflict('Branch code already exists'); RETURN NULL;
  END;

  FUNCTION list_outlets_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    FOR r IN (SELECT o.*, (SELECT COUNT(*) FROM floors f WHERE f.outlet_id = o.outlet_id AND f.is_deleted = 'N') floor_cnt
                FROM outlets o WHERE o.branch_id = api_pkg.current_branch_id ORDER BY o.outlet_id) LOOP
      DECLARE j JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN
        j.put('id', r.outlet_id); j.put('branchId', r.branch_id); j.put('code', r.outlet_code); j.put('name', r.outlet_name);
        j.put('outletType', r.outlet_type); j.put('isActive', r.is_active = 'Y'); j.put('floorCount', r.floor_cnt);
        a.append(j);
      END;
    END LOOP;
    RETURN a;
  END;

  FUNCTION save_outlet(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_code VARCHAR2(20) := UPPER(TRIM(p_body.get_string('code'))); l_name VARCHAR2(100) := TRIM(p_body.get_string('name'));
    l_type VARCHAR2(20) := NVL(p_body.get_string('outletType'), 'RESTAURANT'); l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE));
  BEGIN
    sec_pkg.assert_permission('branches:manage');
    IF l_code IS NULL OR l_name IS NULL THEN api_pkg.raise_validation('Outlet code and name are required', 'name'); END IF;
    IF l_type NOT IN ('RESTAURANT','BAR','CLUB','CAFE','LOUNGE','ROOM_SERVICE','BANQUET') THEN api_pkg.raise_validation('Invalid outlet type', 'outletType'); END IF;
    IF l_id IS NULL THEN
      INSERT INTO outlets (branch_id, outlet_code, outlet_name, outlet_type, is_active) VALUES (api_pkg.current_branch_id, l_code, l_name, l_type, l_active) RETURNING outlet_id INTO l_id;
    ELSE
      UPDATE outlets SET outlet_code = l_code, outlet_name = l_name, outlet_type = l_type, is_active = l_active WHERE outlet_id = l_id AND branch_id = api_pkg.current_branch_id;
      IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Outlet not found'); END IF;
    END IF;
    audit_pkg.log('OUTLET_SAVED', 'OUTLETS', l_id, NULL, p_body.to_clob);
    RETURN l_id;
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN api_pkg.raise_conflict('Outlet code already exists'); RETURN NULL;
  END;

  PROCEDURE set_user_branches(p_user_id NUMBER, p_branch_ids JSON_ARRAY_T) IS
  BEGIN
    sec_pkg.assert_permission('users:manage');
    DELETE FROM user_branches WHERE user_id = p_user_id;
    IF p_branch_ids IS NOT NULL THEN
      FOR i IN 0 .. p_branch_ids.get_size - 1 LOOP
        DECLARE l_bid NUMBER := p_branch_ids.get_number(i);
        BEGIN INSERT INTO user_branches (user_id, branch_id, is_default) VALUES (p_user_id, l_bid, CASE WHEN i = 0 THEN 'Y' ELSE 'N' END); END;
      END LOOP;
    END IF;
    audit_pkg.log('USER_BRANCHES_SET', 'USERS', p_user_id, NULL, p_branch_ids.to_clob);
  END;

  FUNCTION user_branch_ids(p_user_id NUMBER) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    FOR r IN (SELECT branch_id FROM user_branches WHERE user_id = p_user_id ORDER BY is_default DESC, branch_id) LOOP a.append(r.branch_id); END LOOP;
    RETURN a;
  END;
END branch_pkg;
/

-- ---------------------------------------------------------------------
-- INVENTORY_PKG
-- ---------------------------------------------------------------------
-- recipe quantity including wastage allowance (standalone so both INVENTORY_PKG and RECIPE_PKG can use it)
CREATE OR REPLACE FUNCTION ri_qty_with_wastage(p_qty NUMBER, p_wastage_pct NUMBER) RETURN NUMBER IS
BEGIN
  RETURN p_qty * (1 + NVL(p_wastage_pct, 0) / 100);
END;
/

CREATE OR REPLACE PACKAGE inventory_pkg AS
  FUNCTION units_json RETURN JSON_ARRAY_T;
  FUNCTION convert_qty(p_qty NUMBER, p_from_unit NUMBER, p_to_unit NUMBER, p_pack_size NUMBER DEFAULT NULL) RETURN NUMBER;
  FUNCTION list_categories_json RETURN JSON_ARRAY_T;
  FUNCTION save_category(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  FUNCTION item_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION list_items_json(p_search VARCHAR2, p_cat_id NUMBER, p_status VARCHAR2) RETURN JSON_ARRAY_T;
  FUNCTION save_item(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE delete_item(p_id NUMBER);
  -- the ONLY way stock changes: signed qty in the item's stock unit
  FUNCTION apply_movement(p_inv_item_id NUMBER, p_type VARCHAR2, p_qty NUMBER, p_unit_cost NUMBER,
                          p_ref_type VARCHAR2, p_ref_id NUMBER, p_idem_key VARCHAR2, p_reason VARCHAR2) RETURN NUMBER;
  FUNCTION manual_movement(p_body JSON_OBJECT_T) RETURN NUMBER;       -- ADJUSTMENT / WASTAGE / DAMAGE / OPENING_STOCK / RETURN / TRANSFER
  FUNCTION movements_json(p_inv_item_id NUMBER, p_type VARCHAR2, p_from TIMESTAMP, p_to TIMESTAMP, p_limit NUMBER DEFAULT 200) RETURN JSON_ARRAY_T;
  FUNCTION low_stock_json RETURN JSON_ARRAY_T;
  FUNCTION dashboard_json RETURN JSON_OBJECT_T;
  -- hooks from ORDER_PKG / BILLING_PKG (idempotent)
  PROCEDURE deduct_for_order_item(p_order_item_id NUMBER);
  PROCEDURE reverse_for_order_item(p_order_item_id NUMBER);
  PROCEDURE on_order_confirmed(p_order_id NUMBER);
  PROCEDURE on_bill_closed(p_order_id NUMBER);
  PROCEDURE deduct_manual(p_order_id NUMBER);
END inventory_pkg;
/
CREATE OR REPLACE PACKAGE BODY inventory_pkg AS

  FUNCTION units_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    FOR r IN (SELECT * FROM inventory_units ORDER BY base_unit_code, factor_to_base) LOOP
      DECLARE j JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN j.put('id', r.unit_id); j.put('code', r.unit_code); j.put('name', r.unit_name); j.put('baseUnit', r.base_unit_code); j.put('factorToBase', r.factor_to_base); a.append(j); END;
    END LOOP;
    RETURN a;
  END;

  -- Same family (KG↔G, L↔ML) via base factors; cross-family via UNIT_CONVERSIONS or the item's pack_size (PIECE/BOTTLE → base ml/g)
  FUNCTION convert_qty(p_qty NUMBER, p_from_unit NUMBER, p_to_unit NUMBER, p_pack_size NUMBER) RETURN NUMBER IS
    f inventory_units%ROWTYPE; t inventory_units%ROWTYPE; l_factor NUMBER;
  BEGIN
    IF p_from_unit = p_to_unit THEN RETURN p_qty; END IF;
    SELECT * INTO f FROM inventory_units WHERE unit_id = p_from_unit;
    SELECT * INTO t FROM inventory_units WHERE unit_id = p_to_unit;
    IF f.base_unit_code = t.base_unit_code THEN RETURN p_qty * f.factor_to_base / t.factor_to_base; END IF;
    BEGIN
      SELECT factor INTO l_factor FROM unit_conversions WHERE from_unit_id = p_from_unit AND to_unit_id = p_to_unit;
      RETURN p_qty * l_factor;
    EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
    BEGIN
      SELECT factor INTO l_factor FROM unit_conversions WHERE from_unit_id = p_to_unit AND to_unit_id = p_from_unit;
      RETURN p_qty / l_factor;
    EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
    -- pack size: stock unit is a count (PIECE/BOTTLE), recipe uses a measure (ML/G)
    IF p_pack_size IS NOT NULL AND p_pack_size > 0 THEN
      IF t.base_unit_code = 'PIECE' THEN RETURN (p_qty * f.factor_to_base) / p_pack_size / t.factor_to_base; END IF;   -- measure → count
      IF f.base_unit_code = 'PIECE' THEN RETURN (p_qty * f.factor_to_base * p_pack_size) / t.factor_to_base; END IF;   -- count → measure
    END IF;
    api_pkg.raise_business('No conversion from ' || f.unit_code || ' to ' || t.unit_code || ' (set a pack size or a unit conversion)');
    RETURN NULL;
  END;

  FUNCTION list_categories_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    FOR r IN (SELECT c.*, (SELECT COUNT(*) FROM inventory_items i WHERE i.inv_cat_id = c.inv_cat_id AND i.is_deleted = 'N') item_cnt
                FROM inventory_categories c WHERE c.branch_id = api_pkg.current_branch_id ORDER BY c.cat_name) LOOP
      DECLARE j JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN j.put('id', r.inv_cat_id); j.put('name', r.cat_name); j.put('kind', r.cat_kind); j.put('isActive', r.is_active = 'Y'); j.put('itemCount', r.item_cnt); a.append(j); END;
    END LOOP;
    RETURN a;
  END;

  FUNCTION save_category(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_name VARCHAR2(80) := TRIM(p_body.get_string('name')); l_kind VARCHAR2(20) := NVL(p_body.get_string('kind'), 'INGREDIENT');
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE));
  BEGIN
    sec_pkg.assert_permission('inventory:manage');
    IF l_name IS NULL THEN api_pkg.raise_validation('Category name is required', 'name'); END IF;
    IF l_kind NOT IN ('INGREDIENT','RAW_MATERIAL','BEVERAGE','BOTTLE','PACKAGING','CONSUMABLE') THEN api_pkg.raise_validation('Invalid kind', 'kind'); END IF;
    IF l_id IS NULL THEN
      INSERT INTO inventory_categories (branch_id, cat_name, cat_kind, is_active) VALUES (api_pkg.current_branch_id, l_name, l_kind, l_active) RETURNING inv_cat_id INTO l_id;
    ELSE
      UPDATE inventory_categories SET cat_name = l_name, cat_kind = l_kind, is_active = l_active WHERE inv_cat_id = l_id AND branch_id = api_pkg.current_branch_id;
      IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Category not found'); END IF;
    END IF;
    audit_pkg.log('INV_CATEGORY_SAVED', 'INVENTORY_CATEGORIES', l_id, NULL, p_body.to_clob);
    RETURN l_id;
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN api_pkg.raise_conflict('Category already exists'); RETURN NULL;
  END;

  FUNCTION item_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    FOR r IN (SELECT i.*, c.cat_name, c.cat_kind, u.unit_code, u.unit_name, s.supplier_name,
                     CASE WHEN i.current_qty <= 0 THEN 'OUT' WHEN i.current_qty <= i.min_qty THEN 'LOW' WHEN i.current_qty <= i.reorder_level THEN 'REORDER' ELSE 'OK' END stock_status,
                     (SELECT MAX(m.created_at) FROM stock_movements m WHERE m.inv_item_id = i.inv_item_id) last_mvt
                FROM inventory_items i JOIN inventory_categories c ON c.inv_cat_id = i.inv_cat_id JOIN inventory_units u ON u.unit_id = i.unit_id
                LEFT JOIN suppliers s ON s.supplier_id = i.supplier_id
               WHERE i.inv_item_id = p_id) LOOP
      j.put('id', r.inv_item_id); j.put('branchId', r.branch_id); j.put('categoryId', r.inv_cat_id); j.put('categoryName', r.cat_name); j.put('categoryKind', r.cat_kind);
      j.put('code', r.item_code); j.put('name', r.item_name); j.put('unitId', r.unit_id); j.put('unitCode', r.unit_code); j.put('packSize', r.pack_size);
      j.put('currentQty', r.current_qty); j.put('minQty', r.min_qty); j.put('maxQty', r.max_qty); j.put('reorderLevel', r.reorder_level);
      j.put('costPrice', r.cost_price); j.put('avgCost', r.avg_cost); j.put('stockValue', ROUND(r.current_qty * r.avg_cost, 2));
      j.put('supplierId', r.supplier_id); j.put('supplierName', r.supplier_name); j.put('allowNegative', r.allow_negative = 'Y');
      j.put('isActive', r.is_active = 'Y'); j.put('stockStatus', r.stock_status); j.put('lastMovementAt', api_pkg.ts_iso(r.last_mvt));
      j.put('createdAt', api_pkg.ts_iso(r.created_at)); j.put('updatedAt', api_pkg.ts_iso(r.updated_at));
      RETURN j;
    END LOOP;
    api_pkg.raise_not_found('Inventory item not found');
    RETURN NULL;
  END;

  FUNCTION list_items_json(p_search VARCHAR2, p_cat_id NUMBER, p_status VARCHAR2) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('inventory:view');
    FOR r IN (SELECT inv_item_id FROM v_inventory_status v
               WHERE v.branch_id = api_pkg.current_branch_id
                 AND (p_cat_id IS NULL OR EXISTS (SELECT 1 FROM inventory_items i WHERE i.inv_item_id = v.inv_item_id AND i.inv_cat_id = p_cat_id))
                 AND (p_status IS NULL OR v.stock_status = p_status)
                 AND (p_search IS NULL OR LOWER(v.item_name) LIKE '%'||LOWER(p_search)||'%' OR LOWER(v.item_code) LIKE '%'||LOWER(p_search)||'%')
               ORDER BY v.item_name) LOOP
      a.append(item_json(r.inv_item_id));
    END LOOP;
    RETURN a;
  END;

  FUNCTION save_item(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_name VARCHAR2(150) := TRIM(p_body.get_string('name'));
    l_code VARCHAR2(30) := NVL(TRIM(p_body.get_string('code')), 'INV-' || TO_CHAR(SYSTIMESTAMP, 'YYMMDDHH24MISS'));
    l_cat NUMBER := p_body.get_number('categoryId'); l_unit NUMBER := p_body.get_number('unitId'); l_pack NUMBER := p_body.get_number('packSize');
    l_min NUMBER := NVL(p_body.get_number('minQty'), 0); l_max NUMBER := p_body.get_number('maxQty'); l_reorder NUMBER := NVL(p_body.get_number('reorderLevel'), 0);
    l_cost NUMBER := NVL(p_body.get_number('costPrice'), 0); l_supplier NUMBER := p_body.get_number('supplierId');
    l_neg CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('allowNegative'), FALSE)); l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE));
    l_opening NUMBER := p_body.get_number('openingQty'); l_cnt NUMBER; l_mvt NUMBER;
  BEGIN
    sec_pkg.assert_permission('inventory:manage');
    IF l_name IS NULL THEN api_pkg.raise_validation('Item name is required', 'name'); END IF;
    SELECT COUNT(*) INTO l_cnt FROM inventory_categories WHERE inv_cat_id = l_cat AND branch_id = api_pkg.current_branch_id;
    IF l_cnt = 0 THEN api_pkg.raise_validation('Inventory category is invalid', 'categoryId'); END IF;
    SELECT COUNT(*) INTO l_cnt FROM inventory_units WHERE unit_id = l_unit;
    IF l_cnt = 0 THEN api_pkg.raise_validation('Unit is invalid', 'unitId'); END IF;
    IF l_min < 0 OR l_reorder < 0 OR l_cost < 0 THEN api_pkg.raise_validation('Quantities and cost cannot be negative', 'minQty'); END IF;
    IF l_id IS NULL THEN
      INSERT INTO inventory_items (branch_id, inv_cat_id, item_code, item_name, unit_id, pack_size, min_qty, max_qty, reorder_level, cost_price, avg_cost, supplier_id, allow_negative, is_active, created_by)
      VALUES (api_pkg.current_branch_id, l_cat, l_code, l_name, l_unit, l_pack, l_min, l_max, l_reorder, l_cost, l_cost, l_supplier, l_neg, l_active, api_pkg.current_user_id)
      RETURNING inv_item_id INTO l_id;
      IF NVL(l_opening, 0) > 0 THEN l_mvt := apply_movement(l_id, 'OPENING_STOCK', l_opening, l_cost, 'ITEM', l_id, 'OPENING:' || l_id, 'Opening stock'); END IF;
    ELSE
      UPDATE inventory_items SET inv_cat_id = l_cat, item_code = l_code, item_name = l_name, unit_id = l_unit, pack_size = l_pack, min_qty = l_min, max_qty = l_max,
             reorder_level = l_reorder, cost_price = l_cost, supplier_id = l_supplier, allow_negative = l_neg, is_active = l_active,
             updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
       WHERE inv_item_id = l_id AND is_deleted = 'N' AND branch_id = api_pkg.current_branch_id;
      IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Inventory item not found'); END IF;
    END IF;
    audit_pkg.log(CASE WHEN p_id IS NULL THEN 'INV_ITEM_CREATED' ELSE 'INV_ITEM_UPDATED' END, 'INVENTORY_ITEMS', l_id, NULL, p_body.to_clob);
    audit_pkg.emit_event('inventory', 'item.saved', l_id);
    RETURN l_id;
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN api_pkg.raise_conflict('Item code already exists'); RETURN NULL;
  END;

  PROCEDURE delete_item(p_id NUMBER) IS
    l_cnt NUMBER;
  BEGIN
    sec_pkg.assert_permission('inventory:manage');
    SELECT COUNT(*) INTO l_cnt FROM recipe_items ri JOIN recipes r ON r.recipe_id = ri.recipe_id WHERE ri.inv_item_id = p_id AND r.is_active = 'Y';
    IF l_cnt > 0 THEN api_pkg.raise_business('Item is used in ' || l_cnt || ' recipe line(s). Remove it from recipes first.'); END IF;
    UPDATE inventory_items SET is_deleted = 'Y', is_active = 'N', updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE inv_item_id = p_id AND is_deleted = 'N';
    IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Inventory item not found'); END IF;
    audit_pkg.log('INV_ITEM_DELETED', 'INVENTORY_ITEMS', p_id);
  END;

  -- Core stock transaction: locks the item row, validates negative stock, keeps moving-average cost, writes the movement.
  FUNCTION apply_movement(p_inv_item_id NUMBER, p_type VARCHAR2, p_qty NUMBER, p_unit_cost NUMBER,
                          p_ref_type VARCHAR2, p_ref_id NUMBER, p_idem_key VARCHAR2, p_reason VARCHAR2) RETURN NUMBER IS
    i inventory_items%ROWTYPE; l_after NUMBER; l_id NUMBER; l_cost NUMBER; l_new_avg NUMBER; l_cnt NUMBER;
  BEGIN
    IF p_qty IS NULL OR p_qty = 0 THEN api_pkg.raise_validation('Quantity must be non-zero', 'qty'); END IF;
    IF p_idem_key IS NOT NULL THEN
      SELECT COUNT(*) INTO l_cnt FROM stock_movements WHERE idempotency_key = p_idem_key;
      IF l_cnt > 0 THEN RETURN NULL; END IF;   -- already applied — never twice
    END IF;
    SELECT * INTO i FROM inventory_items WHERE inv_item_id = p_inv_item_id FOR UPDATE;
    l_after := i.current_qty + p_qty;
    IF l_after < 0 AND i.allow_negative = 'N' THEN
      api_pkg.raise_business('Insufficient stock for ' || i.item_name || ': available ' || i.current_qty || ', required ' || ABS(p_qty));
    END IF;
    l_cost := NVL(p_unit_cost, i.avg_cost);
    -- moving average on inbound stock
    IF p_qty > 0 AND p_type IN ('PURCHASE','OPENING_STOCK','RETURN','ADJUSTMENT','TRANSFER') AND p_unit_cost IS NOT NULL THEN
      l_new_avg := CASE WHEN GREATEST(i.current_qty, 0) + p_qty > 0
                        THEN (GREATEST(i.current_qty, 0) * i.avg_cost + p_qty * p_unit_cost) / (GREATEST(i.current_qty, 0) + p_qty) ELSE p_unit_cost END;
    ELSE
      l_new_avg := i.avg_cost;
    END IF;
    INSERT INTO stock_movements (branch_id, inv_item_id, mvt_type, qty, qty_before, qty_after, unit_cost, total_cost, ref_type, ref_id, idempotency_key, reason, created_by)
    VALUES (i.branch_id, p_inv_item_id, p_type, p_qty, i.current_qty, l_after, l_cost, ROUND(ABS(p_qty) * l_cost, 2), p_ref_type, p_ref_id, p_idem_key, SUBSTR(p_reason, 1, 300), api_pkg.current_user_id)
    RETURNING mvt_id INTO l_id;
    UPDATE inventory_items SET current_qty = l_after, avg_cost = ROUND(l_new_avg, 4),
           cost_price = CASE WHEN p_type = 'PURCHASE' AND p_unit_cost IS NOT NULL THEN p_unit_cost ELSE cost_price END,
           updated_at = SYSTIMESTAMP WHERE inv_item_id = p_inv_item_id;
    -- low stock alert (deduped while unresolved)
    IF l_after <= i.min_qty AND i.min_qty > 0 THEN
      notify_pkg.create_notification('LOW_STOCK', CASE WHEN l_after <= 0 THEN 'CRITICAL' ELSE 'WARNING' END, 'Low stock: ' || i.item_name,
        'Remaining ' || l_after || ' (minimum ' || i.min_qty || ')', 'INVENTORY_ITEMS', p_inv_item_id, 'MANAGER', NULL, 'LOW_STOCK:' || p_inv_item_id);
    ELSIF l_after > i.min_qty THEN
      notify_pkg.resolve_dedupe('LOW_STOCK:' || p_inv_item_id);
    END IF;
    audit_pkg.emit_event('inventory', 'stock.moved', p_inv_item_id);
    RETURN l_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Inventory item not found'); RETURN NULL;
  END;

  FUNCTION manual_movement(p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_item NUMBER := p_body.get_number('invItemId'); l_type VARCHAR2(20) := p_body.get_string('type'); l_qty NUMBER := p_body.get_number('qty');
    l_cost NUMBER := p_body.get_number('unitCost'); l_reason VARCHAR2(300) := p_body.get_string('reason'); l_signed NUMBER;
  BEGIN
    sec_pkg.assert_permission('inventory:adjust');
    IF l_type NOT IN ('ADJUSTMENT','WASTAGE','DAMAGE','OPENING_STOCK','RETURN','TRANSFER') THEN api_pkg.raise_validation('Invalid movement type', 'type'); END IF;
    IF l_qty IS NULL OR l_qty = 0 THEN api_pkg.raise_validation('Quantity is required', 'qty'); END IF;
    IF TRIM(l_reason) IS NULL THEN api_pkg.raise_validation('Reason is required', 'reason'); END IF;
    -- WASTAGE / DAMAGE always reduce; ADJUSTMENT / TRANSFER keep the sign given; OPENING / RETURN add
    l_signed := CASE l_type WHEN 'WASTAGE' THEN -ABS(l_qty) WHEN 'DAMAGE' THEN -ABS(l_qty) WHEN 'OPENING_STOCK' THEN ABS(l_qty) WHEN 'RETURN' THEN ABS(l_qty) ELSE l_qty END;
    audit_pkg.log('STOCK_' || l_type, 'INVENTORY_ITEMS', l_item, NULL, l_signed || ' — ' || l_reason);
    RETURN apply_movement(l_item, l_type, l_signed, l_cost, 'MANUAL', NULL, NULL, l_reason);
  END;

  FUNCTION mvt_json(p_mvt_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    FOR r IN (SELECT m.*, i.item_name, i.item_code, u.unit_code, us.full_name FROM stock_movements m JOIN inventory_items i ON i.inv_item_id = m.inv_item_id
                JOIN inventory_units u ON u.unit_id = i.unit_id LEFT JOIN users us ON us.user_id = m.created_by WHERE m.mvt_id = p_mvt_id) LOOP
      j.put('id', r.mvt_id); j.put('invItemId', r.inv_item_id); j.put('itemName', r.item_name); j.put('itemCode', r.item_code); j.put('unitCode', r.unit_code);
      j.put('type', r.mvt_type); j.put('qty', r.qty); j.put('qtyBefore', r.qty_before); j.put('qtyAfter', r.qty_after); j.put('unitCost', r.unit_cost); j.put('totalCost', r.total_cost);
      j.put('refType', r.ref_type); j.put('refId', r.ref_id); j.put('reason', r.reason); j.put('createdBy', r.created_by); j.put('createdByName', r.full_name); j.put('createdAt', api_pkg.ts_iso(r.created_at));
    END LOOP;
    RETURN j;
  END;

  FUNCTION movements_json(p_inv_item_id NUMBER, p_type VARCHAR2, p_from TIMESTAMP, p_to TIMESTAMP, p_limit NUMBER) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('inventory:view');
    FOR r IN (SELECT mvt_id FROM (SELECT mvt_id FROM stock_movements m WHERE m.branch_id = api_pkg.current_branch_id
                 AND (p_inv_item_id IS NULL OR m.inv_item_id = p_inv_item_id) AND (p_type IS NULL OR m.mvt_type = p_type)
                 AND (p_from IS NULL OR m.created_at >= p_from) AND (p_to IS NULL OR m.created_at <= p_to) ORDER BY m.created_at DESC) WHERE ROWNUM <= NVL(p_limit, 200)) LOOP
      a.append(mvt_json(r.mvt_id));
    END LOOP;
    RETURN a;
  END;

  FUNCTION low_stock_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('inventory:view');
    FOR r IN (SELECT inv_item_id FROM v_inventory_status WHERE branch_id = api_pkg.current_branch_id AND stock_status IN ('OUT','LOW','REORDER') ORDER BY current_qty / NULLIF(min_qty, 0) NULLS FIRST, item_name) LOOP
      a.append(item_json(r.inv_item_id));
    END LOOP;
    RETURN a;
  END;

  FUNCTION dashboard_json RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); l_value NUMBER; l_items NUMBER; l_low NUMBER; l_out NUMBER; l_waste NUMBER; l_consumed NUMBER; l_purchased NUMBER;
    recent JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('inventory:view');
    SELECT NVL(SUM(stock_value),0), COUNT(*), SUM(CASE WHEN stock_status IN ('LOW','REORDER') THEN 1 ELSE 0 END), SUM(CASE WHEN stock_status = 'OUT' THEN 1 ELSE 0 END)
      INTO l_value, l_items, l_low, l_out FROM v_inventory_status WHERE branch_id = api_pkg.current_branch_id;
    SELECT NVL(SUM(CASE WHEN mvt_type IN ('WASTAGE','DAMAGE') THEN total_cost END),0), NVL(SUM(CASE WHEN mvt_type = 'SALE_CONSUMPTION' THEN total_cost END),0), NVL(SUM(CASE WHEN mvt_type = 'PURCHASE' THEN total_cost END),0)
      INTO l_waste, l_consumed, l_purchased FROM stock_movements WHERE branch_id = api_pkg.current_branch_id AND created_at >= TRUNC(SYSDATE) - 30;
    FOR r IN (SELECT mvt_id FROM (SELECT mvt_id FROM stock_movements WHERE branch_id = api_pkg.current_branch_id ORDER BY created_at DESC) WHERE ROWNUM <= 10) LOOP recent.append(mvt_json(r.mvt_id)); END LOOP;
    j.put('stockValue', ROUND(l_value, 2)); j.put('itemCount', l_items); j.put('lowStockCount', l_low); j.put('outOfStockCount', l_out);
    j.put('wastage30d', l_waste); j.put('consumption30d', l_consumed); j.put('purchases30d', l_purchased);
    j.put('lowStock', low_stock_json); j.put('recentMovements', recent);
    RETURN j;
  END;

  -- ---- order hooks ----------------------------------------------------
  PROCEDURE deduct_for_order_item(p_order_item_id NUMBER) IS
    oi order_items%ROWTYPE; l_mvt NUMBER; l_bottle NUMBER; l_qty NUMBER;
  BEGIN
    SELECT * INTO oi FROM order_items WHERE order_item_id = p_order_item_id FOR UPDATE;
    IF oi.stock_deducted = 'Y' OR oi.status = 'CANCELLED' THEN RETURN; END IF;
    -- bottle service: deduct whole bottles
    BEGIN
      SELECT inv_item_id INTO l_bottle FROM bottle_service_items WHERE item_id = oi.item_id AND is_active = 'Y' AND inv_item_id IS NOT NULL;
      l_mvt := apply_movement(l_bottle, 'SALE_CONSUMPTION', -oi.quantity, NULL, 'ORDER_ITEM', oi.order_item_id, 'ORDER_ITEM:' || oi.order_item_id || ':BOTTLE', 'Bottle service ' || oi.item_name);
    EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
    -- recipe ingredients
    FOR r IN (SELECT ri.*, i.unit_id AS stock_unit, i.pack_size, rc.yield_qty
                FROM recipes rc JOIN recipe_items ri ON ri.recipe_id = rc.recipe_id JOIN inventory_items i ON i.inv_item_id = ri.inv_item_id
               WHERE rc.item_id = oi.item_id AND rc.variant_code = 'STD' AND rc.is_active = 'Y') LOOP
      l_qty := convert_qty(ri_qty_with_wastage(r.qty, r.wastage_pct) * oi.quantity / NVL(r.yield_qty, 1), r.unit_id, r.stock_unit, r.pack_size);
      l_mvt := apply_movement(r.inv_item_id, 'SALE_CONSUMPTION', -l_qty, NULL, 'ORDER_ITEM', oi.order_item_id, 'ORDER_ITEM:' || oi.order_item_id || ':' || r.recipe_item_id, oi.item_name || ' x' || oi.quantity);
    END LOOP;
    UPDATE order_items SET stock_deducted = 'Y' WHERE order_item_id = p_order_item_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
  END;

  PROCEDURE reverse_for_order_item(p_order_item_id NUMBER) IS
    oi order_items%ROWTYPE; l_mvt NUMBER;
  BEGIN
    SELECT * INTO oi FROM order_items WHERE order_item_id = p_order_item_id;
    IF oi.stock_deducted = 'N' THEN RETURN; END IF;
    FOR m IN (SELECT * FROM stock_movements WHERE ref_type = 'ORDER_ITEM' AND ref_id = p_order_item_id AND mvt_type = 'SALE_CONSUMPTION') LOOP
      l_mvt := apply_movement(m.inv_item_id, 'CONSUMPTION_REVERSAL', -m.qty, m.unit_cost, 'ORDER_ITEM', p_order_item_id, 'REVERSE:' || m.mvt_id, 'Cancelled ' || oi.item_name);
    END LOOP;
    UPDATE order_items SET stock_deducted = 'N' WHERE order_item_id = p_order_item_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
  END;

  PROCEDURE deduct_order(p_order_id NUMBER) IS
  BEGIN
    FOR r IN (SELECT order_item_id FROM order_items WHERE order_id = p_order_id AND status <> 'CANCELLED' AND stock_deducted = 'N') LOOP
      deduct_for_order_item(r.order_item_id);
    END LOOP;
  END;

  PROCEDURE on_order_confirmed(p_order_id NUMBER) IS
    l_mode VARCHAR2(20);
  BEGIN
    SELECT b.stock_deduction_mode INTO l_mode FROM orders o JOIN branches b ON b.branch_id = o.branch_id WHERE o.order_id = p_order_id;
    IF l_mode = 'ON_CONFIRM' THEN deduct_order(p_order_id); END IF;
  END;

  PROCEDURE on_bill_closed(p_order_id NUMBER) IS
    l_mode VARCHAR2(20);
  BEGIN
    SELECT b.stock_deduction_mode INTO l_mode FROM orders o JOIN branches b ON b.branch_id = o.branch_id WHERE o.order_id = p_order_id;
    IF l_mode = 'ON_BILL_CLOSE' THEN deduct_order(p_order_id); END IF;
  END;

  PROCEDURE deduct_manual(p_order_id NUMBER) IS
  BEGIN
    sec_pkg.assert_permission('inventory:adjust');
    deduct_order(p_order_id);
    audit_pkg.log('STOCK_DEDUCTED_MANUAL', 'ORDERS', p_order_id);
  END;
END inventory_pkg;
/

-- ---------------------------------------------------------------------
-- RECIPE_PKG
-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE recipe_pkg AS
  FUNCTION recipe_json(p_item_id NUMBER) RETURN JSON_OBJECT_T;   -- null-safe: returns an empty recipe shell
  FUNCTION save_recipe(p_item_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE delete_recipe(p_item_id NUMBER);
  FUNCTION recipe_cost(p_item_id NUMBER) RETURN NUMBER;          -- cost per portion in ₹
  FUNCTION costing_list_json RETURN JSON_ARRAY_T;                -- every menu item with cost / price / food-cost %
END recipe_pkg;
/
CREATE OR REPLACE PACKAGE BODY recipe_pkg AS
  FUNCTION line_cost(p_inv_item_id NUMBER, p_qty NUMBER, p_unit_id NUMBER, p_wastage NUMBER) RETURN NUMBER IS
    i inventory_items%ROWTYPE; l_stock_qty NUMBER;
  BEGIN
    SELECT * INTO i FROM inventory_items WHERE inv_item_id = p_inv_item_id;
    l_stock_qty := inventory_pkg.convert_qty(ri_qty_with_wastage(p_qty, p_wastage), p_unit_id, i.unit_id, i.pack_size);
    RETURN ROUND(l_stock_qty * i.avg_cost, 4);
  END;

  FUNCTION recipe_cost(p_item_id NUMBER) RETURN NUMBER IS
    l_total NUMBER := 0; l_yield NUMBER := 1;
  BEGIN
    FOR r IN (SELECT ri.*, rc.yield_qty FROM recipes rc JOIN recipe_items ri ON ri.recipe_id = rc.recipe_id WHERE rc.item_id = p_item_id AND rc.variant_code = 'STD' AND rc.is_active = 'Y') LOOP
      l_total := l_total + line_cost(r.inv_item_id, r.qty, r.unit_id, r.wastage_pct); l_yield := NVL(r.yield_qty, 1);
    END LOOP;
    RETURN ROUND(l_total / l_yield, 2);
  END;

  FUNCTION recipe_json(p_item_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); lines JSON_ARRAY_T := JSON_ARRAY_T(); mi menu_items%ROWTYPE; l_cost NUMBER := 0; l_found CHAR(1) := 'N';
  BEGIN
    sec_pkg.assert_permission('recipes:view');
    SELECT * INTO mi FROM menu_items WHERE item_id = p_item_id;
    j.put('menuItemId', mi.item_id); j.put('menuItemName', mi.item_name); j.put('sellingPrice', mi.current_price); j.put('prepLocation', mi.prep_location);
    FOR rc IN (SELECT * FROM recipes WHERE item_id = p_item_id AND variant_code = 'STD') LOOP
      l_found := 'Y';
      j.put('recipeId', rc.recipe_id); j.put('variantCode', rc.variant_code); j.put('portionLabel', rc.portion_label); j.put('yieldQty', rc.yield_qty); j.put('isActive', rc.is_active = 'Y');
      FOR r IN (SELECT ri.*, i.item_name, i.item_code, u.unit_code, i.unit_id stock_unit_id, su.unit_code stock_unit_code, i.avg_cost
                  FROM recipe_items ri JOIN inventory_items i ON i.inv_item_id = ri.inv_item_id JOIN inventory_units u ON u.unit_id = ri.unit_id JOIN inventory_units su ON su.unit_id = i.unit_id
                 WHERE ri.recipe_id = rc.recipe_id ORDER BY ri.recipe_item_id) LOOP
        DECLARE l JSON_OBJECT_T := JSON_OBJECT_T(); lc NUMBER := line_cost(r.inv_item_id, r.qty, r.unit_id, r.wastage_pct);
        BEGIN
          l.put('id', r.recipe_item_id); l.put('invItemId', r.inv_item_id); l.put('itemName', r.item_name); l.put('itemCode', r.item_code);
          l.put('qty', r.qty); l.put('unitId', r.unit_id); l.put('unitCode', r.unit_code); l.put('wastagePct', r.wastage_pct);
          l.put('stockUnitCode', r.stock_unit_code); l.put('avgCost', r.avg_cost); l.put('lineCost', lc);
          lines.append(l); l_cost := l_cost + lc;
        END;
      END LOOP;
      l_cost := ROUND(l_cost / NVL(rc.yield_qty, 1), 2);
    END LOOP;
    IF l_found = 'N' THEN j.put('recipeId', NULL); j.put('variantCode', 'STD'); j.put('portionLabel', 'Standard'); j.put('yieldQty', 1); j.put('isActive', TRUE); END IF;
    j.put('ingredients', lines); j.put('recipeCost', l_cost);
    j.put('foodCostPercent', CASE WHEN mi.current_price > 0 THEN ROUND(l_cost * 100 / mi.current_price, 1) ELSE 0 END);
    j.put('grossMargin', ROUND(mi.current_price - l_cost, 2));
    j.put('suggestedPrice', CASE WHEN l_cost > 0 THEN ROUND(l_cost / 0.30, 0) ELSE NULL END);   -- 30 % target food cost (configurable later)
    RETURN j;
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Menu item not found'); RETURN NULL;
  END;

  FUNCTION save_recipe(p_item_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_rid NUMBER; l_yield NUMBER := NVL(p_body.get_number('yieldQty'), 1); l_label VARCHAR2(40) := NVL(p_body.get_string('portionLabel'), 'Standard');
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE)); lines JSON_ARRAY_T := p_body.get_array('ingredients'); ln JSON_OBJECT_T; l_cnt NUMBER;
  BEGIN
    sec_pkg.assert_permission('recipes:manage');
    SELECT COUNT(*) INTO l_cnt FROM menu_items WHERE item_id = p_item_id AND is_deleted = 'N';
    IF l_cnt = 0 THEN api_pkg.raise_not_found('Menu item not found'); END IF;
    IF l_yield <= 0 THEN api_pkg.raise_validation('Yield must be positive', 'yieldQty'); END IF;
    BEGIN
      SELECT recipe_id INTO l_rid FROM recipes WHERE item_id = p_item_id AND variant_code = 'STD';
      UPDATE recipes SET yield_qty = l_yield, portion_label = l_label, is_active = l_active, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE recipe_id = l_rid;
      DELETE FROM recipe_items WHERE recipe_id = l_rid;   -- recipe lines are configuration (movements keep history)
    EXCEPTION WHEN NO_DATA_FOUND THEN
      INSERT INTO recipes (item_id, variant_code, portion_label, yield_qty, is_active, updated_by) VALUES (p_item_id, 'STD', l_label, l_yield, l_active, api_pkg.current_user_id) RETURNING recipe_id INTO l_rid;
    END;
    IF lines IS NOT NULL THEN
      FOR i IN 0 .. lines.get_size - 1 LOOP
        ln := TREAT(lines.get(i) AS JSON_OBJECT_T);
        DECLARE l_inv NUMBER := ln.get_number('invItemId'); l_qty NUMBER := ln.get_number('qty'); l_unit NUMBER := ln.get_number('unitId'); l_w NUMBER := NVL(ln.get_number('wastagePct'), 0);
        BEGIN
          IF l_qty IS NULL OR l_qty <= 0 THEN api_pkg.raise_validation('Ingredient quantity must be positive', 'ingredients'); END IF;
          IF l_w < 0 OR l_w > 100 THEN api_pkg.raise_validation('Wastage must be 0–100 %', 'ingredients'); END IF;
          SELECT COUNT(*) INTO l_cnt FROM inventory_items WHERE inv_item_id = l_inv AND is_deleted = 'N';
          IF l_cnt = 0 THEN api_pkg.raise_validation('Ingredient ' || l_inv || ' not found', 'ingredients'); END IF;
          INSERT INTO recipe_items (recipe_id, inv_item_id, qty, unit_id, wastage_pct) VALUES (l_rid, l_inv, l_qty, l_unit, l_w);
        END;
      END LOOP;
    END IF;
    audit_pkg.log('RECIPE_SAVED', 'RECIPES', l_rid, NULL, p_body.to_clob);
    RETURN l_rid;
  END;

  PROCEDURE delete_recipe(p_item_id NUMBER) IS
  BEGIN
    sec_pkg.assert_permission('recipes:manage');
    UPDATE recipes SET is_active = 'N', updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE item_id = p_item_id;
    audit_pkg.log('RECIPE_DEACTIVATED', 'RECIPES', p_item_id);
  END;

  FUNCTION costing_list_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('recipes:view');
    FOR r IN (SELECT mi.item_id, mi.item_name, mi.current_price, mi.prep_location, mc.category_name,
                     (SELECT COUNT(*) FROM recipes rc JOIN recipe_items ri ON ri.recipe_id = rc.recipe_id WHERE rc.item_id = mi.item_id AND rc.is_active = 'Y') line_cnt
                FROM menu_items mi JOIN menu_categories mc ON mc.category_id = mi.category_id
               WHERE mi.branch_id = api_pkg.current_branch_id AND mi.is_deleted = 'N' ORDER BY mc.display_order, mi.item_name) LOOP
      DECLARE j JSON_OBJECT_T := JSON_OBJECT_T(); c NUMBER := recipe_cost(r.item_id);
      BEGIN
        j.put('menuItemId', r.item_id); j.put('menuItemName', r.item_name); j.put('categoryName', r.category_name); j.put('prepLocation', r.prep_location);
        j.put('sellingPrice', r.current_price); j.put('recipeCost', c); j.put('ingredientCount', r.line_cnt);
        j.put('foodCostPercent', CASE WHEN r.current_price > 0 THEN ROUND(c * 100 / r.current_price, 1) ELSE 0 END); j.put('grossMargin', ROUND(r.current_price - c, 2));
        a.append(j);
      END;
    END LOOP;
    RETURN a;
  END;
END recipe_pkg;
/
