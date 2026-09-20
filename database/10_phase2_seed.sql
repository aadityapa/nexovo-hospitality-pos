-- =====================================================================
-- PHASE 2 SEED — permissions, HOST role, units, inventory, suppliers, recipes,
-- purchase order, customers, loyalty, reservations, club, VIP, outlets, thresholds.
-- Runs after 07_seed.sql. Demo data only.
-- =====================================================================
SET DEFINE OFF;

-- Permissions ------------------------------------------------------------
DECLARE
  PROCEDURE p(p_code VARCHAR2, p_module VARCHAR2, p_desc VARCHAR2) IS
  BEGIN INSERT INTO permissions (permission_code, module_name, description) VALUES (p_code, p_module, p_desc); END;
BEGIN
  p('inventory:view','inventory','View stock');                p('inventory:manage','inventory','Manage inventory items');   p('inventory:adjust','inventory','Record wastage / adjustments');
  p('recipes:view','recipes','View recipes & costing');       p('recipes:manage','recipes','Edit recipes');
  p('suppliers:view','suppliers','View suppliers');           p('suppliers:manage','suppliers','Manage suppliers');
  p('purchases:view','purchases','View purchase orders');     p('purchases:manage','purchases','Create/edit purchase orders'); p('purchases:approve','purchases','Approve purchase orders'); p('purchases:receive','purchases','Receive goods');
  p('customers:view','customers','View customers');           p('customers:manage','customers','Manage customers');
  p('loyalty:view','loyalty','View loyalty');                 p('loyalty:manage','loyalty','Manage loyalty program');         p('loyalty:redeem','loyalty','Redeem points on bills');
  p('reservations:view','reservations','View reservations'); p('reservations:manage','reservations','Manage reservations');
  p('club:view','club','View club entries');                  p('club:manage','club','Check-in / cover charges');
  p('vip:view','vip','View VIP tables');                      p('vip:manage','vip','Manage VIP bookings');
  p('room-charge:post','billing','Charge bills to hotel rooms');
  p('branches:view','branches','View branches / outlets');    p('branches:manage','branches','Manage branches / outlets');
  p('notifications:view','notifications','View notifications'); p('notifications:manage','notifications','Configure alert thresholds');
  p('reports:advanced','reports','Advanced reports');
END;
/

INSERT INTO roles (role_id, role_code, role_name, description, max_discount_pct, is_system) VALUES (8, 'HOST', 'Host / Door', 'Reservations, guest list, club entry, VIP tables', 0, 'Y');

-- every existing user gets access to their home branch
INSERT INTO user_branches (user_id, branch_id, is_default)
SELECT u.user_id, u.branch_id, 'Y' FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.user_id AND ub.branch_id = u.branch_id);

DECLARE
  PROCEDURE grant_perms(p_role VARCHAR2, p_codes VARCHAR2) IS
  BEGIN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.role_id, p.permission_id FROM roles r, permissions p
     WHERE r.role_code = p_role AND INSTR(',' || p_codes || ',', ',' || p.permission_code || ',') > 0
       AND NOT EXISTS (SELECT 1 FROM role_permissions x WHERE x.role_id = r.role_id AND x.permission_id = p.permission_id);
  END;
BEGIN
  -- admins get everything new
  INSERT INTO role_permissions (role_id, permission_id) SELECT r.role_id, p.permission_id FROM roles r, permissions p WHERE r.role_code IN ('SUPER_ADMIN','ADMIN')
    AND NOT EXISTS (SELECT 1 FROM role_permissions x WHERE x.role_id = r.role_id AND x.permission_id = p.permission_id);
  grant_perms('MANAGER', 'inventory:view,inventory:adjust,inventory:manage,recipes:view,recipes:manage,suppliers:view,purchases:view,purchases:manage,purchases:approve,purchases:receive,customers:view,customers:manage,loyalty:view,loyalty:manage,loyalty:redeem,reservations:view,reservations:manage,club:view,club:manage,vip:view,vip:manage,room-charge:post,branches:view,notifications:view,notifications:manage,reports:advanced');
  grant_perms('CASHIER', 'customers:view,customers:manage,loyalty:view,loyalty:redeem,room-charge:post,notifications:view,club:view');
  grant_perms('WAITER', 'customers:view,customers:manage,reservations:view,notifications:view,vip:view');
  grant_perms('KITCHEN', 'inventory:view,inventory:adjust,notifications:view');
  grant_perms('BAR', 'inventory:view,inventory:adjust,notifications:view');
  grant_perms('HOST', 'tables:view,menu:view,orders:view,orders:view:all,orders:create,orders:confirm,customers:view,customers:manage,reservations:view,reservations:manage,club:view,club:manage,vip:view,vip:manage,notifications:view');
END;
/

-- Host user ------------------------------------------------------------------
DECLARE l_salt RAW(32) := sec_pkg.new_salt;
BEGIN
  INSERT INTO users (user_id, branch_id, username, email, full_name, phone, password_hash, password_salt)
  VALUES (9, 1, 'host', 'host@saffronlounge.in', 'Ishaan Malhotra', '+91 9811111199', sec_pkg.hash_password('Host@123', l_salt), l_salt);
  INSERT INTO user_roles (user_id, role_id) VALUES (9, 8);
  INSERT INTO user_branches (user_id, branch_id, is_default) VALUES (9, 1, 'Y');
END;
/

-- Outlets & VIP tables --------------------------------------------------------
INSERT INTO outlets (outlet_id, branch_id, outlet_code, outlet_name, outlet_type) VALUES (1, 1, 'REST', 'Restaurant', 'RESTAURANT');
INSERT INTO outlets (outlet_id, branch_id, outlet_code, outlet_name, outlet_type) VALUES (2, 1, 'CLUB', 'Club & Lounge', 'CLUB');
UPDATE floors SET outlet_id = 1 WHERE floor_code IN ('MAIN');
UPDATE floors SET outlet_id = 2 WHERE floor_code IN ('BAR','VIP');
UPDATE dining_tables SET is_vip = 'Y', min_spend_default = 25000, deposit_default = 5000 WHERE table_number LIKE 'VIP%';

-- Units ------------------------------------------------------------------------
INSERT INTO inventory_units (unit_id, unit_code, unit_name, base_unit_code, factor_to_base) VALUES (1, 'G', 'Gram', 'G', 1);
INSERT INTO inventory_units (unit_id, unit_code, unit_name, base_unit_code, factor_to_base) VALUES (2, 'KG', 'Kilogram', 'G', 1000);
INSERT INTO inventory_units (unit_id, unit_code, unit_name, base_unit_code, factor_to_base) VALUES (3, 'ML', 'Millilitre', 'ML', 1);
INSERT INTO inventory_units (unit_id, unit_code, unit_name, base_unit_code, factor_to_base) VALUES (4, 'L', 'Litre', 'ML', 1000);
INSERT INTO inventory_units (unit_id, unit_code, unit_name, base_unit_code, factor_to_base) VALUES (5, 'PIECE', 'Piece', 'PIECE', 1);
INSERT INTO inventory_units (unit_id, unit_code, unit_name, base_unit_code, factor_to_base) VALUES (6, 'BOTTLE', 'Bottle', 'PIECE', 1);
INSERT INTO inventory_units (unit_id, unit_code, unit_name, base_unit_code, factor_to_base) VALUES (7, 'BOX', 'Box', 'PIECE', 1);
INSERT INTO inventory_units (unit_id, unit_code, unit_name, base_unit_code, factor_to_base) VALUES (8, 'PACK', 'Pack', 'PIECE', 1);
INSERT INTO inventory_units (unit_id, unit_code, unit_name, base_unit_code, factor_to_base) VALUES (9, 'CASE', 'Case', 'PIECE', 1);
-- a case of 24 bottles; a box of 10 packs
INSERT INTO unit_conversions (from_unit_id, to_unit_id, factor) VALUES (9, 6, 24);
INSERT INTO unit_conversions (from_unit_id, to_unit_id, factor) VALUES (7, 8, 10);

-- Inventory categories & suppliers -------------------------------------------------
INSERT INTO inventory_categories (inv_cat_id, branch_id, cat_name, cat_kind) VALUES (1, 1, 'Meat & Poultry', 'INGREDIENT');
INSERT INTO inventory_categories (inv_cat_id, branch_id, cat_name, cat_kind) VALUES (2, 1, 'Dairy & Bakery', 'INGREDIENT');
INSERT INTO inventory_categories (inv_cat_id, branch_id, cat_name, cat_kind) VALUES (3, 1, 'Produce', 'RAW_MATERIAL');
INSERT INTO inventory_categories (inv_cat_id, branch_id, cat_name, cat_kind) VALUES (4, 1, 'Spirits', 'BOTTLE');
INSERT INTO inventory_categories (inv_cat_id, branch_id, cat_name, cat_kind) VALUES (5, 1, 'Beer & Mixers', 'BEVERAGE');
INSERT INTO inventory_categories (inv_cat_id, branch_id, cat_name, cat_kind) VALUES (6, 1, 'Packaging', 'PACKAGING');

INSERT INTO suppliers (supplier_id, branch_id, supplier_code, supplier_name, contact_person, phone, email, gst_number, payment_terms_days)
VALUES (1, 1, 'SUP-FRESH', 'FreshFarm Foods', 'Manoj Kumar', '+91 98100 22334', 'orders@freshfarm.in', '29AAACF1234A1Z1', 15);
INSERT INTO suppliers (supplier_id, branch_id, supplier_code, supplier_name, contact_person, phone, email, gst_number, payment_terms_days)
VALUES (2, 1, 'SUP-BEV', 'Metro Beverages', 'Sunita Reddy', '+91 98220 55667', 'sales@metrobev.in', '29AAACM5678B1Z2', 30);

-- Inventory items (opening stock via movements so history is complete) ----------------
DECLARE
  l_ctx NUMBER;
  PROCEDURE it(p_id NUMBER, p_cat NUMBER, p_code VARCHAR2, p_name VARCHAR2, p_unit NUMBER, p_pack NUMBER, p_min NUMBER, p_reorder NUMBER, p_cost NUMBER, p_supplier NUMBER, p_opening NUMBER) IS
    l_mvt NUMBER;
  BEGIN
    INSERT INTO inventory_items (inv_item_id, branch_id, inv_cat_id, item_code, item_name, unit_id, pack_size, min_qty, reorder_level, cost_price, avg_cost, supplier_id)
    VALUES (p_id, 1, p_cat, p_code, p_name, p_unit, p_pack, p_min, p_reorder, p_cost, p_cost, p_supplier);
    l_mvt := inventory_pkg.apply_movement(p_id, 'OPENING_STOCK', p_opening, p_cost, 'ITEM', p_id, 'OPENING:' || p_id, 'Opening stock');
  END;
BEGIN
  api_pkg.set_context(2, 1);
  --  id cat code        name                      unit pack  min reorder cost supplier opening
  it(1, 1, 'CHK-BRST', 'Chicken breast',           2, NULL,  10,  15,   320,  1,  25);      -- KG
  it(2, 2, 'BUN-BRIO', 'Brioche bun',              5, NULL,  40,  60,   12,   1,  120);     -- PIECE
  it(3, 2, 'CHS-SLC',  'Cheddar slice',            5, NULL,  50,  80,   8,    1,  200);
  it(4, 3, 'ONION',    'Onion',                    2, NULL,  5,   8,    35,   1,  18);
  it(5, 3, 'LETTUCE',  'Iceberg lettuce',          2, NULL,  2,   4,    90,   1,  6);
  it(6, 2, 'MAYO',     'Mayonnaise',               4, NULL,  2,   3,    260,  1,  5);       -- L
  it(7, 3, 'POTATO',   'Potato (fries grade)',     2, NULL,  10,  20,   28,   1,  40);
  it(8, 3, 'MINT',     'Fresh mint',               1, NULL,  200, 400,  0.4,  1,  900);     -- G
  it(9, 3, 'LIME',     'Lime',                     5, NULL,  30,  50,   4,    1,  120);
  it(10, 5, 'SODA',    'Soda water 750ml',         6, 750,   24,  36,   30,   2,  60);      -- BOTTLE
  it(11, 4, 'RUM-WHT', 'White rum 750ml',          6, 750,   4,   6,    1400, 2,  12);
  it(12, 4, 'JD-750',  'Jack Daniel''s 750ml',     6, 750,   3,   6,    3200, 2,  8);
  it(13, 4, 'VODKA-GG','Grey Goose 750ml',         6, 750,   2,   4,    4200, 2,  5);
  it(14, 5, 'KF-650',  'Kingfisher Premium 650ml', 6, 650,   48,  72,   140,  2,  96);
  it(15, 5, 'IPA-330', 'Craft IPA 330ml',          6, 330,   24,  48,   150,  2,  40);
  it(16, 2, 'BUTTER',  'Butter',                   2, NULL,  3,   5,    480,  1,  8);
  it(17, 1, 'CHK-CURRY','Chicken curry cut',       2, NULL,  8,   12,   260,  1,  6);       -- deliberately below minimum → LOW_STOCK alert
  it(18, 6, 'BOX-TKA', 'Takeaway box',             8, 50,    5,   10,   180,  2,  12);      -- PACK of 50
  api_pkg.set_context(NULL, NULL);
END;
/

-- Recipes ---------------------------------------------------------------------------
DECLARE
  l_rid NUMBER; body JSON_OBJECT_T; lines JSON_ARRAY_T;
  FUNCTION ln(p_inv NUMBER, p_qty NUMBER, p_unit NUMBER, p_w NUMBER DEFAULT 0) RETURN JSON_OBJECT_T IS o JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN o.put('invItemId', p_inv); o.put('qty', p_qty); o.put('unitId', p_unit); o.put('wastagePct', p_w); RETURN o; END;
  FUNCTION item(p_code VARCHAR2) RETURN NUMBER IS l NUMBER; BEGIN SELECT item_id INTO l FROM menu_items WHERE item_code = p_code; RETURN l; END;
BEGIN
  api_pkg.set_context(2, 1);
  -- Chicken Burger: 150 g chicken, 1 bun, 1 cheese, 20 g onion, 15 g lettuce, 20 ml mayo
  lines := JSON_ARRAY_T(); lines.append(ln(1, 150, 1, 5)); lines.append(ln(2, 1, 5)); lines.append(ln(3, 1, 5)); lines.append(ln(4, 20, 1, 10)); lines.append(ln(5, 15, 1, 10)); lines.append(ln(6, 20, 3));
  body := JSON_OBJECT_T(); body.put('ingredients', lines); body.put('yieldQty', 1); l_rid := recipe_pkg.save_recipe(item('BG01'), body);
  -- French Fries: 200 g potato
  lines := JSON_ARRAY_T(); lines.append(ln(7, 200, 1, 15));
  body := JSON_OBJECT_T(); body.put('ingredients', lines); l_rid := recipe_pkg.save_recipe(item('ST03'), body);
  -- Mojito: 60 ml rum, 10 g mint, 1 lime, 120 ml soda
  lines := JSON_ARRAY_T(); lines.append(ln(11, 60, 3)); lines.append(ln(8, 10, 1)); lines.append(ln(9, 1, 5)); lines.append(ln(10, 120, 3));
  body := JSON_OBJECT_T(); body.put('ingredients', lines); l_rid := recipe_pkg.save_recipe(item('CK01'), body);
  -- Kingfisher / IPA: one bottle each
  lines := JSON_ARRAY_T(); lines.append(ln(14, 1, 6)); body := JSON_OBJECT_T(); body.put('ingredients', lines); l_rid := recipe_pkg.save_recipe(item('BR01'), body);
  lines := JSON_ARRAY_T(); lines.append(ln(15, 1, 6)); body := JSON_OBJECT_T(); body.put('ingredients', lines); l_rid := recipe_pkg.save_recipe(item('BR02'), body);
  -- Butter Chicken: 250 g curry cut, 30 g butter
  lines := JSON_ARRAY_T(); lines.append(ln(17, 250, 1, 5)); lines.append(ln(16, 30, 1));
  body := JSON_OBJECT_T(); body.put('ingredients', lines); l_rid := recipe_pkg.save_recipe(item('IN01'), body);
  -- Premium Vodka 30ml / Single Malt 30ml pours
  lines := JSON_ARRAY_T(); lines.append(ln(13, 30, 3)); body := JSON_OBJECT_T(); body.put('ingredients', lines); l_rid := recipe_pkg.save_recipe(item('SP02'), body);
  api_pkg.set_context(NULL, NULL);
END;
/

-- Bottle service menu items --------------------------------------------------------
DECLARE
  l_item NUMBER; l_bs NUMBER; body JSON_OBJECT_T;
BEGIN
  api_pkg.set_context(2, 1);
  INSERT INTO menu_items (branch_id, category_id, item_code, item_name, description, current_price, prep_location, tax_group_id, is_veg, is_popular)
  VALUES (1, 13, 'BS-JD', 'Jack Daniel''s 750ml — Bottle Service', 'Full bottle with ice, 4 mixers, glasses and a dedicated waiter', 8000, 'BAR', 3, 'Y', 'N') RETURNING item_id INTO l_item;
  INSERT INTO menu_item_prices (item_id, price) VALUES (l_item, 8000);
  body := JSON_OBJECT_T(); body.put('bottleSizeMl', 750); body.put('invItemId', 12); body.put('includes', 'Ice, 4 mixers, glasses, dedicated waiter');
  l_bs := bottle_pkg.save(l_item, body);
  INSERT INTO menu_items (branch_id, category_id, item_code, item_name, description, current_price, prep_location, tax_group_id, is_veg, is_popular)
  VALUES (1, 13, 'BS-GG', 'Grey Goose 750ml — Bottle Service', 'Full bottle with ice, mixers and glasses', 11000, 'BAR', 3, 'Y', 'N') RETURNING item_id INTO l_item;
  INSERT INTO menu_item_prices (item_id, price) VALUES (l_item, 11000);
  body := JSON_OBJECT_T(); body.put('bottleSizeMl', 750); body.put('invItemId', 13); body.put('includes', 'Ice, 4 mixers, glasses');
  l_bs := bottle_pkg.save(l_item, body);
  api_pkg.set_context(NULL, NULL);
END;
/

-- Purchase order (sent, awaiting approval) --------------------------------------------
DECLARE
  l_po NUMBER; body JSON_OBJECT_T; items JSON_ARRAY_T;
  FUNCTION ln(p_inv NUMBER, p_qty NUMBER, p_unit NUMBER, p_price NUMBER, p_tax NUMBER) RETURN JSON_OBJECT_T IS o JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN o.put('invItemId', p_inv); o.put('qty', p_qty); o.put('unitId', p_unit); o.put('unitPrice', p_price); o.put('taxPercent', p_tax); RETURN o; END;
BEGIN
  api_pkg.set_context(3, 1);
  items := JSON_ARRAY_T(); items.append(ln(1, 20, 2, 315, 0)); items.append(ln(17, 15, 2, 255, 0)); items.append(ln(7, 30, 2, 27, 0));
  body := JSON_OBJECT_T(); body.put('supplierId', 1); body.put('expectedDate', TO_CHAR(SYSDATE + 2, 'YYYY-MM-DD')); body.put('notes', 'Weekend restock'); body.put('items', items);
  l_po := purchase_pkg.save_po(NULL, body);
  purchase_pkg.transition(l_po, 'SEND', NULL);
  api_pkg.set_context(NULL, NULL);
END;
/

-- Customers & loyalty --------------------------------------------------------------------
INSERT INTO loyalty_programs (program_id, org_id, program_name, points_per_100, point_value, min_redeem_points, max_redeem_pct, expiry_days) VALUES (1, 1, 'Saffron Rewards', 10, 1, 100, 50, 365);
DECLARE
  l_id NUMBER; body JSON_OBJECT_T;
BEGIN
  api_pkg.set_context(3, 1);
  body := JSON_OBJECT_T(); body.put('fullName', 'Ananya Desai'); body.put('phone', '+919876543210'); body.put('email', 'ananya@example.com'); body.put('birthday', '1990-05-14'); body.put('tags', 'regular,wine'); body.put('consentMarketing', TRUE);
  l_id := customer_pkg.save_customer(NULL, body); loyalty_pkg.adjust(l_id, 450, 'Welcome bonus (migrated)');
  body := JSON_OBJECT_T(); body.put('fullName', 'Rohan Bhatia'); body.put('phone', '+919812345678'); body.put('anniversary', '2015-11-20'); body.put('tags', 'corporate'); body.put('consentMarketing', FALSE);
  l_id := customer_pkg.save_customer(NULL, body);
  body := JSON_OBJECT_T(); body.put('fullName', 'Meera Joshi'); body.put('phone', '+919900011122'); body.put('email', 'meera.j@example.com'); body.put('tags', 'vip,club'); body.put('consentMarketing', TRUE);
  l_id := customer_pkg.save_customer(NULL, body); loyalty_pkg.adjust(l_id, 1200, 'Migrated balance');
  api_pkg.set_context(NULL, NULL);
END;
/

-- Reservations, cover charges, club entries, VIP booking ------------------------------------
INSERT INTO cover_charge_types (cover_type_id, branch_id, cover_code, cover_name, amount, redeemable_amount, guests_included) VALUES (1, 1, 'STAG', 'Stag entry', 2000, 1500, 1);
INSERT INTO cover_charge_types (cover_type_id, branch_id, cover_code, cover_name, amount, redeemable_amount, guests_included) VALUES (2, 1, 'SOLO', 'Solo entry', 1000, 1000, 1);
INSERT INTO cover_charge_types (cover_type_id, branch_id, cover_code, cover_name, amount, redeemable_amount, guests_included) VALUES (3, 1, 'COUPLE', 'Couple entry', 3000, 2000, 2);
INSERT INTO cover_charge_types (cover_type_id, branch_id, cover_code, cover_name, amount, redeemable_amount, guests_included) VALUES (4, 1, 'GUESTLIST', 'Guest list (free)', 0, 0, 1);

DECLARE
  l_id NUMBER; body JSON_OBJECT_T; l_cust NUMBER; l_table NUMBER;
BEGIN
  api_pkg.set_context(9, 1);
  SELECT customer_id INTO l_cust FROM customers WHERE phone = '+919876543210';
  SELECT table_id INTO l_table FROM dining_tables WHERE table_number = '8';
  body := JSON_OBJECT_T(); body.put('customerId', l_cust); body.put('guestName', 'Ananya Desai'); body.put('phone', '+919876543210'); body.put('date', TO_CHAR(SYSDATE, 'YYYY-MM-DD')); body.put('time', '20:00'); body.put('guests', 4); body.put('tableId', l_table); body.put('occasion', 'Birthday'); body.put('notes', 'Window table if possible');
  l_id := reservation_pkg.save_res(NULL, body); reservation_pkg.transition(l_id, 'CONFIRM', NULL, NULL);
  body := JSON_OBJECT_T(); body.put('guestName', 'Karthik Menon'); body.put('phone', '+919845012345'); body.put('date', TO_CHAR(SYSDATE + 1, 'YYYY-MM-DD')); body.put('time', '19:30'); body.put('guests', 2); body.put('tablePref', 'Quiet corner');
  l_id := reservation_pkg.save_res(NULL, body);
  -- club check-ins
  body := JSON_OBJECT_T(); body.put('guestName', 'Aditya Rao'); body.put('phone', '+919900000001'); body.put('guests', 2); body.put('entryType', 'WALK_IN'); body.put('coverTypeId', 3); body.put('paymentMethod', 'CARD');
  l_id := club_pkg.check_in(body);
  body := JSON_OBJECT_T(); body.put('guestName', 'Priyanka Sen'); body.put('guests', 1); body.put('entryType', 'GUEST_LIST'); body.put('coverTypeId', 4);
  l_id := club_pkg.check_in(body);
  -- VIP booking tonight
  SELECT customer_id INTO l_cust FROM customers WHERE phone = '+919900011122';
  SELECT table_id INTO l_table FROM dining_tables WHERE table_number = 'VIP2';
  body := JSON_OBJECT_T(); body.put('tableId', l_table); body.put('customerId', l_cust); body.put('guestName', 'Meera Joshi'); body.put('phone', '+919900011122');
  body.put('date', TO_CHAR(SYSDATE, 'YYYY-MM-DD')); body.put('guests', 6); body.put('minSpend', 25000); body.put('depositAmount', 5000); body.put('depositPaid', TRUE); body.put('hostUserId', 9); body.put('notes', 'Birthday — bottle service expected');
  l_id := vip_pkg.save_vip(NULL, body);
  api_pkg.set_context(NULL, NULL);
END;
/

-- Alert thresholds ------------------------------------------------------------------------
INSERT INTO alert_thresholds (branch_id, threshold_key, threshold_value) VALUES (1, 'ORDER_DELAY_MIN', 20);
INSERT INTO alert_thresholds (branch_id, threshold_key, threshold_value) VALUES (1, 'KITCHEN_BACKLOG', 8);
INSERT INTO alert_thresholds (branch_id, threshold_key, threshold_value) VALUES (1, 'BAR_BACKLOG', 8);
INSERT INTO alert_thresholds (branch_id, threshold_key, threshold_value) VALUES (1, 'BILL_PENDING_MIN', 10);
INSERT INTO alert_thresholds (branch_id, threshold_key, threshold_value) VALUES (1, 'LARGE_BILL_AMOUNT', 10000);

-- Second branch (multi-branch demo) ---------------------------------------------------------
DECLARE l_id NUMBER; body JSON_OBJECT_T;
BEGIN
  api_pkg.set_context(1, 1);
  body := JSON_OBJECT_T(); body.put('code', 'HYD'); body.put('businessName', 'The Saffron Lounge'); body.put('name', 'Hyderabad'); body.put('city', 'Hyderabad 500034'); body.put('address', 'Road No. 12, Banjara Hills'); body.put('phone', '+91 40 4000 1234');
  l_id := branch_pkg.save_branch(NULL, body);
  INSERT INTO user_branches (user_id, branch_id) VALUES (2, l_id);   -- admin can switch
  INSERT INTO user_branches (user_id, branch_id) VALUES (3, l_id);   -- manager can switch
  api_pkg.set_context(NULL, NULL);
END;
/
COMMIT;
