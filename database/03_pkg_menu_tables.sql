-- =====================================================================
-- MENU_PKG, OFFER_PKG, TABLE_PKG
-- NOTE: OFFER_PKG's spec is declared first because MENU_PKG's body calls
--       OFFER_PKG.LIST_OFFERS (the OFFER_PKG body follows further below).
-- =====================================================================

CREATE OR REPLACE PACKAGE offer_pkg AS
  FUNCTION offer_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION list_offers(p_include_inactive BOOLEAN, p_only_current BOOLEAN DEFAULT FALSE) RETURN JSON_ARRAY_T;
  FUNCTION save_offer(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE delete_offer(p_id NUMBER);
  FUNCTION is_currently_active(p_id NUMBER) RETURN BOOLEAN;
  -- best offer discount for a line (used by BILLING_PKG)
  PROCEDURE best_item_discount(p_item_id NUMBER, p_category_id NUMBER, p_unit_price NUMBER, p_qty NUMBER,
                               o_amount OUT NUMBER, o_offer_id OUT NUMBER);
END offer_pkg;
/

CREATE OR REPLACE PACKAGE menu_pkg AS
  FUNCTION category_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION list_categories(p_include_inactive BOOLEAN DEFAULT FALSE) RETURN JSON_ARRAY_T;
  FUNCTION save_category(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE delete_category(p_id NUMBER);
  PROCEDURE reorder_categories(p_ids JSON_ARRAY_T);

  FUNCTION item_json(p_id NUMBER, p_with_price BOOLEAN DEFAULT TRUE) RETURN JSON_OBJECT_T;
  FUNCTION list_items(p_category_id NUMBER, p_search VARCHAR2, p_prep VARCHAR2, p_include_inactive BOOLEAN) RETURN JSON_ARRAY_T;
  FUNCTION save_item(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE delete_item(p_id NUMBER);
  PROCEDURE set_availability(p_id NUMBER, p_available BOOLEAN);

  FUNCTION tax_groups_json RETURN JSON_ARRAY_T;
  FUNCTION public_menu(p_branch_code VARCHAR2, p_table_code VARCHAR2) RETURN JSON_OBJECT_T;
END menu_pkg;
/
CREATE OR REPLACE PACKAGE BODY menu_pkg AS

  FUNCTION category_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    c menu_categories%ROWTYPE; o JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    SELECT * INTO c FROM menu_categories WHERE category_id = p_id;
    o.put('id', c.category_id); o.put('branchId', c.branch_id); o.put('name', c.category_name);
    o.put('slug', c.slug); o.put('description', c.description); o.put('imageUrl', c.image_url);
    o.put('prepLocation', c.default_prep_loc); o.put('displayOrder', c.display_order);
    o.put('isActive', c.is_active = 'Y'); o.put('isDeleted', c.is_deleted = 'Y');
    o.put('createdAt', api_pkg.ts_iso(c.created_at));
    RETURN o;
  END;

  FUNCTION list_categories(p_include_inactive BOOLEAN) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
    l_inc CHAR(1) := api_pkg.yn(p_include_inactive);   -- BOOLEAN is not a SQL type
  BEGIN
    FOR r IN (SELECT category_id FROM menu_categories
               WHERE branch_id = api_pkg.current_branch_id AND is_deleted = 'N'
                 AND (l_inc = 'Y' OR is_active = 'Y')
               ORDER BY display_order, category_name) LOOP
      a.append(category_json(r.category_id));
    END LOOP;
    RETURN a;
  END;

  FUNCTION slugify(p VARCHAR2) RETURN VARCHAR2 IS
  BEGIN RETURN REGEXP_REPLACE(LOWER(TRIM(p)), '[^a-z0-9]+', '-'); END;

  FUNCTION save_category(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_name VARCHAR2(100) := TRIM(p_body.get_string('name'));
    l_prep VARCHAR2(10) := NVL(p_body.get_string('prepLocation'), 'KITCHEN');
    l_slug VARCHAR2(100);
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE));  -- BOOLEAN is not a SQL type
  BEGIN
    sec_pkg.assert_permission('menu:manage');
    IF l_name IS NULL THEN api_pkg.raise_validation('Category name is required', 'name'); END IF;
    IF l_prep NOT IN ('KITCHEN','BAR') THEN api_pkg.raise_validation('Invalid preparation location', 'prepLocation'); END IF;
    l_slug := slugify(l_name);
    IF l_id IS NULL THEN
      INSERT INTO menu_categories (branch_id, category_name, slug, description, image_url, default_prep_loc, display_order, is_active, created_by)
      VALUES (api_pkg.current_branch_id, l_name, l_slug, p_body.get_string('description'), p_body.get_string('imageUrl'), l_prep,
              NVL(p_body.get_number('displayOrder'), (SELECT NVL(MAX(display_order),0)+1 FROM menu_categories WHERE branch_id = api_pkg.current_branch_id)),
              l_active, api_pkg.current_user_id)
      RETURNING category_id INTO l_id;
      audit_pkg.log('CATEGORY_CREATED', 'MENU_CATEGORIES', l_id, NULL, p_body.to_clob);
    ELSE
      UPDATE menu_categories SET category_name = l_name, slug = l_slug, description = p_body.get_string('description'),
             image_url = p_body.get_string('imageUrl'), default_prep_loc = l_prep,
             display_order = NVL(p_body.get_number('displayOrder'), display_order),
             is_active = l_active,
             updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
       WHERE category_id = l_id AND is_deleted = 'N';
      IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Category not found'); END IF;
      audit_pkg.log('CATEGORY_UPDATED', 'MENU_CATEGORIES', l_id, NULL, p_body.to_clob);
    END IF;
    audit_pkg.emit_event('menu', 'category.saved', l_id);
    RETURN l_id;
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN api_pkg.raise_conflict('A category with this name already exists'); RETURN NULL;
  END;

  PROCEDURE delete_category(p_id NUMBER) IS
    l_cnt NUMBER;
  BEGIN
    sec_pkg.assert_permission('menu:manage');
    SELECT COUNT(*) INTO l_cnt FROM menu_items WHERE category_id = p_id AND is_deleted = 'N';
    IF l_cnt > 0 THEN api_pkg.raise_business('Category has ' || l_cnt || ' active items. Move or delete them first.'); END IF;
    UPDATE menu_categories SET is_deleted = 'Y', is_active = 'N', updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE category_id = p_id;
    IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Category not found'); END IF;
    audit_pkg.log('CATEGORY_DELETED', 'MENU_CATEGORIES', p_id);
    audit_pkg.emit_event('menu', 'category.deleted', p_id);
  END;

  PROCEDURE reorder_categories(p_ids JSON_ARRAY_T) IS
  BEGIN
    sec_pkg.assert_permission('menu:manage');
    IF p_ids IS NULL OR p_ids.get_size = 0 THEN api_pkg.raise_validation('orderedIds is required', 'orderedIds'); END IF;
    FOR i IN 0 .. p_ids.get_size - 1 LOOP
      DECLARE l_cid NUMBER := p_ids.get_number(i);
      BEGIN
        UPDATE menu_categories SET display_order = i + 1, updated_at = SYSTIMESTAMP WHERE category_id = l_cid;
      END;
    END LOOP;
    audit_pkg.emit_event('menu', 'category.reordered', NULL);
  END;

  FUNCTION item_json(p_id NUMBER, p_with_price BOOLEAN) RETURN JSON_OBJECT_T IS
    i menu_items%ROWTYPE; o JSON_OBJECT_T := JSON_OBJECT_T(); l_cat VARCHAR2(100); l_bottle_ml NUMBER;
  BEGIN
    SELECT * INTO i FROM menu_items WHERE item_id = p_id;
    SELECT category_name INTO l_cat FROM menu_categories WHERE category_id = i.category_id;
    -- Phase 2: whole-bottle (bottle service) marker for the waiter/POS UI
    BEGIN SELECT bottle_size_ml INTO l_bottle_ml FROM bottle_service_items WHERE item_id = p_id AND is_active = 'Y';
    EXCEPTION WHEN NO_DATA_FOUND THEN l_bottle_ml := NULL; END;
    o.put('id', i.item_id); o.put('branchId', i.branch_id); o.put('categoryId', i.category_id); o.put('categoryName', l_cat);
    o.put('code', i.item_code); o.put('name', i.item_name); o.put('description', i.description); o.put('imageUrl', i.image_url);
    IF p_with_price THEN o.put('price', i.current_price); END IF;
    o.put('prepLocation', i.prep_location); o.put('taxGroupId', i.tax_group_id);
    o.put('isVeg', i.is_veg = 'Y'); o.put('isPopular', i.is_popular = 'Y'); o.put('isAvailable', i.is_available = 'Y');
    o.put('isActive', i.is_active = 'Y'); o.put('isDeleted', i.is_deleted = 'Y'); o.put('displayOrder', i.display_order);
    o.put('tags', i.tags); o.put('isBottleService', l_bottle_ml IS NOT NULL); o.put('bottleSizeMl', l_bottle_ml);
    o.put('createdAt', api_pkg.ts_iso(i.created_at)); o.put('updatedAt', api_pkg.ts_iso(i.updated_at));
    RETURN o;
  END;

  FUNCTION list_items(p_category_id NUMBER, p_search VARCHAR2, p_prep VARCHAR2, p_include_inactive BOOLEAN) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
    l_inc CHAR(1) := api_pkg.yn(p_include_inactive);   -- BOOLEAN is not a SQL type
  BEGIN
    FOR r IN (SELECT item_id FROM menu_items
               WHERE branch_id = api_pkg.current_branch_id AND is_deleted = 'N'
                 AND (p_category_id IS NULL OR category_id = p_category_id)
                 AND (p_prep IS NULL OR prep_location = p_prep)
                 AND (l_inc = 'Y' OR is_active = 'Y')
                 AND (p_search IS NULL OR LOWER(item_name) LIKE '%'||LOWER(p_search)||'%' OR LOWER(item_code) LIKE '%'||LOWER(p_search)||'%')
               ORDER BY display_order, item_name) LOOP
      a.append(item_json(r.item_id));
    END LOOP;
    RETURN a;
  END;

  FUNCTION save_item(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_price NUMBER := p_body.get_number('price'); l_old_price NUMBER;
    l_name VARCHAR2(150) := TRIM(p_body.get_string('name'));
    l_prep VARCHAR2(10) := p_body.get_string('prepLocation');
    l_cat NUMBER := p_body.get_number('categoryId'); l_tax NUMBER := p_body.get_number('taxGroupId');
    l_code VARCHAR2(30) := NVL(p_body.get_string('code'), 'ITM-' || TO_CHAR(SYSTIMESTAMP, 'YYMMDDHH24MISSFF3'));
    l_cnt NUMBER;
    -- BOOLEAN is not a SQL type: resolve the flags in PL/SQL before the DML
    l_veg    CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isVeg'), FALSE));
    l_pop    CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isPopular'), FALSE));
    l_avail  CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isAvailable'), TRUE));
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE));
  BEGIN
    sec_pkg.assert_permission('menu:manage');
    IF l_name IS NULL THEN api_pkg.raise_validation('Item name is required', 'name'); END IF;
    IF l_price IS NULL OR l_price < 0 THEN api_pkg.raise_validation('Price must be zero or positive', 'price'); END IF;
    IF l_prep NOT IN ('KITCHEN','BAR') THEN api_pkg.raise_validation('Preparation location must be KITCHEN or BAR', 'prepLocation'); END IF;
    SELECT COUNT(*) INTO l_cnt FROM menu_categories WHERE category_id = l_cat AND is_deleted = 'N';
    IF l_cnt = 0 THEN api_pkg.raise_validation('Category is invalid', 'categoryId'); END IF;
    SELECT COUNT(*) INTO l_cnt FROM tax_configurations WHERE tax_group_id = l_tax AND is_active = 'Y';
    IF l_cnt = 0 THEN api_pkg.raise_validation('Tax group is invalid', 'taxGroupId'); END IF;

    IF l_id IS NULL THEN
      INSERT INTO menu_items (branch_id, category_id, item_code, item_name, description, image_url, current_price, prep_location, tax_group_id,
                              is_veg, is_popular, is_available, is_active, display_order, tags, created_by)
      VALUES (api_pkg.current_branch_id, l_cat, l_code, l_name, p_body.get_string('description'), p_body.get_string('imageUrl'), l_price, l_prep, l_tax,
              l_veg, l_pop, l_avail, l_active,
              NVL(p_body.get_number('displayOrder'), 0), p_body.get_string('tags'), api_pkg.current_user_id)
      RETURNING item_id INTO l_id;
      INSERT INTO menu_item_prices (item_id, price, created_by) VALUES (l_id, l_price, api_pkg.current_user_id);
      audit_pkg.log('ITEM_CREATED', 'MENU_ITEMS', l_id, NULL, p_body.to_clob);
    ELSE
      SELECT current_price INTO l_old_price FROM menu_items WHERE item_id = l_id AND is_deleted = 'N';
      UPDATE menu_items SET category_id = l_cat, item_name = l_name, description = p_body.get_string('description'),
             image_url = p_body.get_string('imageUrl'), current_price = l_price, prep_location = l_prep, tax_group_id = l_tax,
             is_veg = l_veg, is_popular = l_pop,
             is_available = l_avail, is_active = l_active,
             display_order = NVL(p_body.get_number('displayOrder'), display_order), tags = p_body.get_string('tags'),
             updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
       WHERE item_id = l_id;
      IF l_old_price <> l_price THEN
        UPDATE menu_item_prices SET effective_to = SYSTIMESTAMP WHERE item_id = l_id AND effective_to IS NULL;
        INSERT INTO menu_item_prices (item_id, price, created_by) VALUES (l_id, l_price, api_pkg.current_user_id);
        audit_pkg.log('MENU_PRICE_CHANGED', 'MENU_ITEMS', l_id, TO_CHAR(l_old_price), TO_CHAR(l_price));
      END IF;
      audit_pkg.log('ITEM_UPDATED', 'MENU_ITEMS', l_id, NULL, p_body.to_clob);
    END IF;
    audit_pkg.emit_event('menu', 'item.saved', l_id);
    RETURN l_id;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Menu item not found'); RETURN NULL;
    WHEN DUP_VAL_ON_INDEX THEN api_pkg.raise_conflict('Item code already exists'); RETURN NULL;
  END;

  PROCEDURE delete_item(p_id NUMBER) IS
  BEGIN
    sec_pkg.assert_permission('menu:manage');
    -- soft delete only: historical ORDER_ITEMS keep their snapshot and FK
    UPDATE menu_items SET is_deleted = 'Y', is_active = 'N', is_available = 'N', updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
     WHERE item_id = p_id AND is_deleted = 'N';
    IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Menu item not found'); END IF;
    audit_pkg.log('ITEM_DELETED', 'MENU_ITEMS', p_id);
    audit_pkg.emit_event('menu', 'item.deleted', p_id);
  END;

  PROCEDURE set_availability(p_id NUMBER, p_available BOOLEAN) IS
    l_avail CHAR(1) := api_pkg.yn(p_available);   -- BOOLEAN is not a SQL type
  BEGIN
    sec_pkg.assert_permission('menu:availability');
    UPDATE menu_items SET is_available = l_avail, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
     WHERE item_id = p_id AND is_deleted = 'N';
    IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Menu item not found'); END IF;
    audit_pkg.log('ITEM_AVAILABILITY', 'MENU_ITEMS', p_id, NULL, l_avail);
    audit_pkg.emit_event('menu', 'item.availability', p_id);
  END;

  FUNCTION tax_groups_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    FOR g IN (SELECT * FROM tax_configurations WHERE branch_id = api_pkg.current_branch_id ORDER BY tax_code) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); comps JSON_ARRAY_T := JSON_ARRAY_T(); l_total NUMBER := 0;
      BEGIN
        FOR c IN (SELECT * FROM tax_components WHERE tax_group_id = g.tax_group_id ORDER BY component_code) LOOP
          DECLARE co JSON_OBJECT_T := JSON_OBJECT_T();
          BEGIN co.put('code', c.component_code); co.put('name', c.component_name); co.put('percent', c.rate_pct); comps.append(co); END;
          l_total := l_total + c.rate_pct;
        END LOOP;
        o.put('id', g.tax_group_id); o.put('code', g.tax_code); o.put('name', g.tax_name); o.put('isActive', g.is_active = 'Y');
        o.put('totalPercent', l_total); o.put('rates', comps);
        a.append(o);
      END;
    END LOOP;
    RETURN a;
  END;

  FUNCTION public_menu(p_branch_code VARCHAR2, p_table_code VARCHAR2) RETURN JSON_OBJECT_T IS
    b branches%ROWTYPE; t dining_tables%ROWTYPE; l_floor VARCHAR2(100);
    o JSON_OBJECT_T := JSON_OBJECT_T(); biz JSON_OBJECT_T := JSON_OBJECT_T(); tbl JSON_OBJECT_T := JSON_OBJECT_T();
    items JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    BEGIN
      SELECT * INTO b FROM branches WHERE branch_code = p_branch_code AND is_active = 'Y';
      SELECT * INTO t FROM dining_tables WHERE public_code = p_table_code AND branch_id = b.branch_id AND is_deleted = 'N' AND is_active = 'Y';
    EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('This QR code is not valid. Please ask our staff for help.');
    END;
    SELECT floor_name INTO l_floor FROM floors WHERE floor_id = t.floor_id;
    api_pkg.set_context(NULL, b.branch_id);
    biz.put('name', b.business_name); biz.put('branchName', b.branch_name); biz.put('logoUrl', b.logo_url);
    biz.put('address', b.address_line || CASE WHEN b.city IS NOT NULL THEN ', ' || b.city END); biz.put('phone', b.phone);
    biz.put('welcomeMessage', b.welcome_message); biz.put('currency', b.currency_code); biz.put('serviceChargePercent', b.service_charge_pct);
    tbl.put('publicCode', t.public_code); tbl.put('number', t.table_number); tbl.put('name', t.table_name); tbl.put('floorName', l_floor);
    o.put('business', biz); o.put('branchCode', b.branch_code); o.put('table', tbl);
    o.put('categories', list_categories(FALSE));
    FOR r IN (SELECT i.item_id FROM menu_items i JOIN menu_categories c ON c.category_id = i.category_id
               WHERE i.branch_id = b.branch_id AND i.is_deleted = 'N' AND i.is_active = 'Y' AND c.is_active = 'Y' AND c.is_deleted = 'N'
               ORDER BY c.display_order, i.display_order, i.item_name) LOOP
      items.append(item_json(r.item_id));
    END LOOP;
    o.put('items', items);
    o.put('offers', offer_pkg.list_offers(FALSE, TRUE));
    RETURN o;
  END;
END menu_pkg;
/

-- ---------------------------------------------------------------------
-- (OFFER_PKG spec is declared at the top of this file — body only here.)
CREATE OR REPLACE PACKAGE BODY offer_pkg AS
  FUNCTION is_currently_active(p_id NUMBER) RETURN BOOLEAN IS
    l CHAR(1);
  BEGIN
    SELECT is_currently_active INTO l FROM v_offer_active WHERE offer_id = p_id;
    RETURN l = 'Y';
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN FALSE;
  END;

  FUNCTION offer_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    r v_offer_active%ROWTYPE; o JSON_OBJECT_T := JSON_OBJECT_T();
    cats JSON_ARRAY_T := JSON_ARRAY_T(); items JSON_ARRAY_T := JSON_ARRAY_T(); days JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    SELECT * INTO r FROM v_offer_active WHERE offer_id = p_id;
    FOR x IN (SELECT * FROM offer_rules WHERE offer_id = p_id) LOOP
      IF x.rule_type = 'CATEGORY' THEN cats.append(x.category_id); ELSE items.append(x.item_id); END IF;
    END LOOP;
    IF r.days_of_week IS NOT NULL THEN
      FOR d IN (SELECT TO_NUMBER(REGEXP_SUBSTR(r.days_of_week, '[^,]+', 1, LEVEL)) dow FROM dual
                CONNECT BY REGEXP_SUBSTR(r.days_of_week, '[^,]+', 1, LEVEL) IS NOT NULL) LOOP days.append(d.dow); END LOOP;
    END IF;
    o.put('id', r.offer_id); o.put('branchId', r.branch_id); o.put('name', r.offer_name); o.put('description', r.description);
    o.put('offerType', r.offer_type); o.put('discountValue', r.discount_value); o.put('maxDiscountAmount', r.max_discount_amt);
    o.put('appliesTo', r.applies_to); o.put('categoryIds', cats); o.put('itemIds', items);
    o.put('startDate', TO_CHAR(r.start_date, 'YYYY-MM-DD')); o.put('endDate', TO_CHAR(r.end_date, 'YYYY-MM-DD'));
    o.put('startTime', r.start_time); o.put('endTime', r.end_time); o.put('daysOfWeek', days);
    o.put('isActive', r.is_active = 'Y'); o.put('isCurrentlyActive', r.is_currently_active = 'Y');
    o.put('createdAt', api_pkg.ts_iso(r.created_at));
    RETURN o;
  END;

  FUNCTION list_offers(p_include_inactive BOOLEAN, p_only_current BOOLEAN) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
    l_inc CHAR(1) := api_pkg.yn(p_include_inactive);   -- BOOLEAN is not a SQL type
    l_cur CHAR(1) := api_pkg.yn(p_only_current);
  BEGIN
    FOR r IN (SELECT offer_id FROM v_offer_active WHERE branch_id = api_pkg.current_branch_id AND is_deleted = 'N'
               AND (l_inc = 'Y' OR is_active = 'Y') AND (l_cur = 'N' OR is_currently_active = 'Y')
               ORDER BY start_date DESC, offer_name) LOOP
      a.append(offer_json(r.offer_id));
    END LOOP;
    RETURN a;
  END;

  FUNCTION save_offer(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_type VARCHAR2(20) := p_body.get_string('offerType');
    l_val NUMBER := NVL(p_body.get_number('discountValue'), 0);
    l_sd DATE := TO_DATE(p_body.get_string('startDate'), 'YYYY-MM-DD'); l_ed DATE := TO_DATE(p_body.get_string('endDate'), 'YYYY-MM-DD');
    l_applies VARCHAR2(12) := NVL(p_body.get_string('appliesTo'), 'ALL'); l_days VARCHAR2(20);
    arr JSON_ARRAY_T;
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE));  -- BOOLEAN is not a SQL type
  BEGIN
    sec_pkg.assert_permission('offers:manage');
    IF TRIM(p_body.get_string('name')) IS NULL THEN api_pkg.raise_validation('Offer name is required', 'name'); END IF;
    IF l_type NOT IN ('PERCENTAGE','FLAT','BOGO','COMBO','HAPPY_HOUR') THEN api_pkg.raise_validation('Invalid offer type', 'offerType'); END IF;
    IF l_type IN ('PERCENTAGE','HAPPY_HOUR') AND (l_val <= 0 OR l_val > 100) THEN api_pkg.raise_validation('Percentage must be between 1 and 100', 'discountValue'); END IF;
    IF l_type IN ('FLAT','COMBO') AND l_val <= 0 THEN api_pkg.raise_validation('Discount value must be positive', 'discountValue'); END IF;
    IF l_sd IS NULL OR l_ed IS NULL OR l_ed < l_sd THEN api_pkg.raise_validation('End date must be on or after start date', 'endDate'); END IF;
    arr := p_body.get_array('daysOfWeek');
    IF arr IS NOT NULL AND arr.get_size > 0 THEN
      FOR i IN 0 .. arr.get_size - 1 LOOP l_days := l_days || CASE WHEN i > 0 THEN ',' END || arr.get_number(i); END LOOP;
    END IF;

    IF l_id IS NULL THEN
      INSERT INTO offers (branch_id, offer_name, description, offer_type, discount_value, max_discount_amt, applies_to, start_date, end_date,
                          start_time, end_time, days_of_week, is_active, created_by)
      VALUES (api_pkg.current_branch_id, TRIM(p_body.get_string('name')), p_body.get_string('description'), l_type, l_val, p_body.get_number('maxDiscountAmount'),
              l_applies, l_sd, l_ed, p_body.get_string('startTime'), p_body.get_string('endTime'), l_days,
              l_active, api_pkg.current_user_id)
      RETURNING offer_id INTO l_id;
    ELSE
      UPDATE offers SET offer_name = TRIM(p_body.get_string('name')), description = p_body.get_string('description'), offer_type = l_type,
             discount_value = l_val, max_discount_amt = p_body.get_number('maxDiscountAmount'), applies_to = l_applies, start_date = l_sd, end_date = l_ed,
             start_time = p_body.get_string('startTime'), end_time = p_body.get_string('endTime'), days_of_week = l_days,
             is_active = l_active, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
       WHERE offer_id = l_id AND is_deleted = 'N';
      IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Offer not found'); END IF;
      DELETE FROM offer_rules WHERE offer_id = l_id;   -- rules are configuration, not transactions
    END IF;
    arr := p_body.get_array('categoryIds');
    IF arr IS NOT NULL THEN FOR i IN 0 .. arr.get_size - 1 LOOP
      INSERT INTO offer_rules (offer_id, rule_type, category_id) VALUES (l_id, 'CATEGORY', arr.get_number(i)); END LOOP; END IF;
    arr := p_body.get_array('itemIds');
    IF arr IS NOT NULL THEN FOR i IN 0 .. arr.get_size - 1 LOOP
      INSERT INTO offer_rules (offer_id, rule_type, item_id) VALUES (l_id, 'ITEM', arr.get_number(i)); END LOOP; END IF;
    audit_pkg.log(CASE WHEN p_id IS NULL THEN 'OFFER_CREATED' ELSE 'OFFER_UPDATED' END, 'OFFERS', l_id, NULL, p_body.to_clob);
    audit_pkg.emit_event('menu', 'offer.saved', l_id);
    RETURN l_id;
  END;

  PROCEDURE delete_offer(p_id NUMBER) IS
  BEGIN
    sec_pkg.assert_permission('offers:manage');
    UPDATE offers SET is_deleted = 'Y', is_active = 'N', updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE offer_id = p_id;
    IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Offer not found'); END IF;
    audit_pkg.log('OFFER_DELETED', 'OFFERS', p_id);
    audit_pkg.emit_event('menu', 'offer.deleted', p_id);
  END;

  PROCEDURE best_item_discount(p_item_id NUMBER, p_category_id NUMBER, p_unit_price NUMBER, p_qty NUMBER,
                               o_amount OUT NUMBER, o_offer_id OUT NUMBER) IS
    l_line NUMBER := p_unit_price * p_qty; l_amt NUMBER;
  BEGIN
    o_amount := 0; o_offer_id := NULL;
    FOR r IN (SELECT o.* FROM v_offer_active o
               WHERE o.is_currently_active = 'Y' AND o.branch_id = api_pkg.current_branch_id
                 AND (o.applies_to = 'ALL'
                      OR EXISTS (SELECT 1 FROM offer_rules x WHERE x.offer_id = o.offer_id AND x.rule_type = 'ITEM' AND x.item_id = p_item_id)
                      OR EXISTS (SELECT 1 FROM offer_rules x WHERE x.offer_id = o.offer_id AND x.rule_type = 'CATEGORY' AND x.category_id = p_category_id))) LOOP
      l_amt := CASE r.offer_type
                 WHEN 'PERCENTAGE' THEN l_line * r.discount_value / 100
                 WHEN 'HAPPY_HOUR' THEN l_line * r.discount_value / 100
                 WHEN 'FLAT'       THEN LEAST(r.discount_value * p_qty, l_line)
                 WHEN 'COMBO'      THEN LEAST(r.discount_value, l_line)
                 WHEN 'BOGO'       THEN FLOOR(p_qty / 2) * p_unit_price
                 ELSE 0 END;
      IF r.max_discount_amt IS NOT NULL THEN l_amt := LEAST(l_amt, r.max_discount_amt); END IF;
      l_amt := ROUND(l_amt, 2);
      IF l_amt > o_amount THEN o_amount := l_amt; o_offer_id := r.offer_id; END IF;
    END LOOP;
  END;
END offer_pkg;
/

-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE table_pkg AS
  FUNCTION floor_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION list_floors RETURN JSON_ARRAY_T;
  FUNCTION save_floor(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE delete_floor(p_id NUMBER);

  FUNCTION table_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION list_tables(p_floor_id NUMBER, p_status VARCHAR2, p_search VARCHAR2, p_waiter_id NUMBER) RETURN JSON_ARRAY_T;
  FUNCTION save_table(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE delete_table(p_id NUMBER);
  PROCEDURE override_status(p_id NUMBER, p_status VARCHAR2, p_reason VARCHAR2);
  PROCEDURE assign_waiter(p_id NUMBER, p_waiter_id NUMBER);
  PROCEDURE regenerate_qr(p_id NUMBER);
  -- called by ORDER_PKG whenever an order changes
  PROCEDURE sync_status_from_order(p_table_id NUMBER);
  FUNCTION new_public_code RETURN VARCHAR2;
END table_pkg;
/
CREATE OR REPLACE PACKAGE BODY table_pkg AS
  FUNCTION new_public_code RETURN VARCHAR2 IS
  BEGIN RETURN LOWER(SUBSTR(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(8)), 1, 12)); END;

  FUNCTION floor_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    f floors%ROWTYPE; o JSON_OBJECT_T := JSON_OBJECT_T(); l_cnt NUMBER;
  BEGIN
    SELECT * INTO f FROM floors WHERE floor_id = p_id;
    SELECT COUNT(*) INTO l_cnt FROM dining_tables WHERE floor_id = p_id AND is_deleted = 'N';
    o.put('id', f.floor_id); o.put('branchId', f.branch_id); o.put('code', f.floor_code); o.put('name', f.floor_name);
    o.put('displayOrder', f.display_order); o.put('isActive', f.is_active = 'Y'); o.put('tableCount', l_cnt);
    RETURN o;
  END;

  FUNCTION list_floors RETURN JSON_ARRAY_T IS a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    FOR r IN (SELECT floor_id FROM floors WHERE branch_id = api_pkg.current_branch_id AND is_deleted = 'N' ORDER BY display_order, floor_name) LOOP
      a.append(floor_json(r.floor_id));
    END LOOP; RETURN a;
  END;

  FUNCTION save_floor(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_name VARCHAR2(100) := TRIM(p_body.get_string('name'));
    l_code VARCHAR2(20) := NVL(TRIM(p_body.get_string('code')), UPPER(REGEXP_REPLACE(l_name, '[^A-Za-z0-9]', '')));
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE));  -- BOOLEAN is not a SQL type
  BEGIN
    sec_pkg.assert_permission('tables:manage');
    IF l_name IS NULL THEN api_pkg.raise_validation('Floor name is required', 'name'); END IF;
    IF l_id IS NULL THEN
      INSERT INTO floors (branch_id, floor_code, floor_name, display_order, is_active, created_by)
      VALUES (api_pkg.current_branch_id, l_code, l_name, NVL(p_body.get_number('displayOrder'), 0), l_active, api_pkg.current_user_id)
      RETURNING floor_id INTO l_id;
    ELSE
      UPDATE floors SET floor_name = l_name, floor_code = l_code, display_order = NVL(p_body.get_number('displayOrder'), display_order),
             is_active = l_active, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
       WHERE floor_id = l_id AND is_deleted = 'N';
      IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Floor not found'); END IF;
    END IF;
    audit_pkg.log(CASE WHEN p_id IS NULL THEN 'FLOOR_CREATED' ELSE 'FLOOR_UPDATED' END, 'FLOORS', l_id, NULL, p_body.to_clob);
    audit_pkg.emit_event('tables', 'floor.saved', l_id);
    RETURN l_id;
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN api_pkg.raise_conflict('Floor code already exists'); RETURN NULL;
  END;

  PROCEDURE delete_floor(p_id NUMBER) IS l_cnt NUMBER;
  BEGIN
    sec_pkg.assert_permission('tables:manage');
    SELECT COUNT(*) INTO l_cnt FROM dining_tables WHERE floor_id = p_id AND is_deleted = 'N';
    IF l_cnt > 0 THEN api_pkg.raise_business('Floor still has ' || l_cnt || ' tables'); END IF;
    UPDATE floors SET is_deleted = 'Y', is_active = 'N', updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE floor_id = p_id;
    audit_pkg.log('FLOOR_DELETED', 'FLOORS', p_id);
    audit_pkg.emit_event('tables', 'floor.deleted', p_id);
  END;

  FUNCTION table_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    t dining_tables%ROWTYPE; o JSON_OBJECT_T := JSON_OBJECT_T(); l_floor VARCHAR2(100);
    l_order_id NUMBER; l_order_no VARCHAR2(30); l_order_status VARCHAR2(20); l_since TIMESTAMP; l_waiter VARCHAR2(150); l_total NUMBER;
  BEGIN
    SELECT * INTO t FROM dining_tables WHERE table_id = p_id;
    SELECT floor_name INTO l_floor FROM floors WHERE floor_id = t.floor_id;
    BEGIN
      SELECT order_id, order_number, status, created_at, subtotal INTO l_order_id, l_order_no, l_order_status, l_since, l_total
        FROM orders WHERE table_id = p_id AND status NOT IN ('COMPLETED','CANCELLED') AND ROWNUM = 1;
    EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
    IF t.assigned_waiter_id IS NOT NULL THEN SELECT full_name INTO l_waiter FROM users WHERE user_id = t.assigned_waiter_id; END IF;
    o.put('id', t.table_id); o.put('branchId', t.branch_id); o.put('floorId', t.floor_id); o.put('floorName', l_floor);
    o.put('number', t.table_number); o.put('name', t.table_name); o.put('capacity', t.seating_capacity);
    o.put('publicCode', t.public_code); o.put('qrVersion', t.qr_version); o.put('status', t.status); o.put('statusOverride', t.status_override = 'Y');
    o.put('assignedWaiterId', t.assigned_waiter_id); o.put('assignedWaiterName', l_waiter);
    o.put('activeOrderId', l_order_id); o.put('activeOrderNumber', l_order_no); o.put('activeOrderStatus', l_order_status);
    o.put('activeOrderTotal', l_total); o.put('occupiedSince', api_pkg.ts_iso(l_since));
    o.put('isActive', t.is_active = 'Y'); o.put('createdAt', api_pkg.ts_iso(t.created_at));
    RETURN o;
  END;

  FUNCTION list_tables(p_floor_id NUMBER, p_status VARCHAR2, p_search VARCHAR2, p_waiter_id NUMBER) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    FOR r IN (SELECT t.table_id FROM dining_tables t JOIN floors f ON f.floor_id = t.floor_id
               WHERE t.branch_id = api_pkg.current_branch_id AND t.is_deleted = 'N'
                 AND (p_floor_id IS NULL OR t.floor_id = p_floor_id)
                 AND (p_status IS NULL OR t.status = p_status)
                 AND (p_waiter_id IS NULL OR t.assigned_waiter_id = p_waiter_id)
                 AND (p_search IS NULL OR LOWER(t.table_name) LIKE '%'||LOWER(p_search)||'%' OR LOWER(t.table_number) LIKE '%'||LOWER(p_search)||'%')
               ORDER BY f.display_order, LPAD(t.table_number, 10)) LOOP
      a.append(table_json(r.table_id));
    END LOOP; RETURN a;
  END;

  FUNCTION save_table(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_num VARCHAR2(20) := TRIM(p_body.get_string('number'));
    l_name VARCHAR2(60) := NVL(TRIM(p_body.get_string('name')), 'Table ' || l_num);
    l_cap NUMBER := NVL(p_body.get_number('capacity'), 4); l_floor NUMBER := p_body.get_number('floorId'); l_cnt NUMBER;
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE));  -- BOOLEAN is not a SQL type
  BEGIN
    sec_pkg.assert_permission('tables:manage');
    IF l_num IS NULL THEN api_pkg.raise_validation('Table number is required', 'number'); END IF;
    IF l_cap <= 0 THEN api_pkg.raise_validation('Capacity must be positive', 'capacity'); END IF;
    SELECT COUNT(*) INTO l_cnt FROM floors WHERE floor_id = l_floor AND is_deleted = 'N';
    IF l_cnt = 0 THEN api_pkg.raise_validation('Floor is invalid', 'floorId'); END IF;
    IF l_id IS NULL THEN
      INSERT INTO dining_tables (branch_id, floor_id, table_number, table_name, seating_capacity, public_code, is_active, created_by)
      VALUES (api_pkg.current_branch_id, l_floor, l_num, l_name, l_cap, new_public_code, l_active, api_pkg.current_user_id)
      RETURNING table_id INTO l_id;
    ELSE
      UPDATE dining_tables SET floor_id = l_floor, table_number = l_num, table_name = l_name, seating_capacity = l_cap,
             is_active = l_active, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id
       WHERE table_id = l_id AND is_deleted = 'N';
      IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Table not found'); END IF;
    END IF;
    audit_pkg.log(CASE WHEN p_id IS NULL THEN 'TABLE_CREATED' ELSE 'TABLE_UPDATED' END, 'DINING_TABLES', l_id, NULL, p_body.to_clob);
    audit_pkg.emit_event('tables', 'table.saved', l_id);
    RETURN l_id;
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN api_pkg.raise_conflict('Table number "' || l_num || '" already exists'); RETURN NULL;
  END;

  PROCEDURE delete_table(p_id NUMBER) IS l_cnt NUMBER;
  BEGIN
    sec_pkg.assert_permission('tables:manage');
    SELECT COUNT(*) INTO l_cnt FROM orders WHERE table_id = p_id AND status NOT IN ('COMPLETED','CANCELLED');
    IF l_cnt > 0 THEN api_pkg.raise_business('Table has an active order and cannot be deleted'); END IF;
    UPDATE dining_tables SET is_deleted = 'Y', is_active = 'N', updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE table_id = p_id;
    audit_pkg.log('TABLE_DELETED', 'DINING_TABLES', p_id);
    audit_pkg.emit_event('tables', 'table.deleted', p_id);
  END;

  PROCEDURE override_status(p_id NUMBER, p_status VARCHAR2, p_reason VARCHAR2) IS
    l_old VARCHAR2(20);
  BEGIN
    sec_pkg.assert_permission('tables:status:override');
    SELECT status INTO l_old FROM dining_tables WHERE table_id = p_id;
    UPDATE dining_tables SET status = p_status, status_override = CASE WHEN p_status = 'AVAILABLE' THEN 'N' ELSE 'Y' END,
           updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE table_id = p_id;
    audit_pkg.log('TABLE_STATUS_OVERRIDE', 'DINING_TABLES', p_id, l_old, p_status || ' (' || p_reason || ')');
    audit_pkg.emit_event('tables', 'table.status', p_id);
  END;

  PROCEDURE assign_waiter(p_id NUMBER, p_waiter_id NUMBER) IS
  BEGIN
    sec_pkg.assert_permission('tables:manage');
    UPDATE dining_tables SET assigned_waiter_id = p_waiter_id, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE table_id = p_id;
    audit_pkg.log('TABLE_ASSIGNED', 'DINING_TABLES', p_id, NULL, TO_CHAR(p_waiter_id));
    audit_pkg.emit_event('tables', 'table.assigned', p_id);
  END;

  PROCEDURE regenerate_qr(p_id NUMBER) IS
  BEGIN
    sec_pkg.assert_permission('qr:manage');
    UPDATE dining_tables SET public_code = new_public_code, qr_version = qr_version + 1, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE table_id = p_id;
    audit_pkg.log('TABLE_QR_REGENERATED', 'DINING_TABLES', p_id);
  END;

  PROCEDURE sync_status_from_order(p_table_id NUMBER) IS
    l_status VARCHAR2(20) := 'AVAILABLE'; l_ostatus VARCHAR2(20); l_balance NUMBER := 0; l_override CHAR(1);
  BEGIN
    SELECT status_override INTO l_override FROM dining_tables WHERE table_id = p_table_id;
    IF l_override = 'Y' THEN RETURN; END IF;
    BEGIN
      SELECT o.status, NVL((SELECT b.grand_total - b.paid_amount FROM bills b WHERE b.order_id = o.order_id AND b.status <> 'VOID'), 0)
        INTO l_ostatus, l_balance FROM orders o WHERE o.table_id = p_table_id AND o.status NOT IN ('COMPLETED','CANCELLED') AND ROWNUM = 1;
      l_status := CASE l_ostatus
        WHEN 'DRAFT' THEN 'ORDERING' WHEN 'CONFIRMED' THEN 'ORDERING'
        WHEN 'IN_PROGRESS' THEN 'PREPARING' WHEN 'PARTIALLY_READY' THEN 'PREPARING'
        WHEN 'READY' THEN 'READY' WHEN 'SERVED' THEN 'OCCUPIED'
        WHEN 'BILL_REQUESTED' THEN 'BILLING' WHEN 'BILLED' THEN CASE WHEN l_balance > 0 THEN 'PAYMENT_PENDING' ELSE 'BILLING' END
        WHEN 'PAID' THEN 'BILLING' ELSE 'OCCUPIED' END;
    EXCEPTION WHEN NO_DATA_FOUND THEN l_status := 'AVAILABLE';
    END;
    UPDATE dining_tables SET status = l_status, updated_at = SYSTIMESTAMP WHERE table_id = p_table_id AND status <> l_status;
    IF SQL%ROWCOUNT > 0 THEN audit_pkg.emit_event('tables', 'table.status', p_table_id); END IF;
  END;
END table_pkg;
/
