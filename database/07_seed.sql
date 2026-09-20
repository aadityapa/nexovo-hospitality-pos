-- =====================================================================
-- SEED / DEMO DATA  (clearly marked — do not run in production)
-- Demo credentials (rotate before production):
--   superadmin / Super@123     admin / Admin@123       manager / Manager@123  (approval PIN 1234)
--   waiter1 / Waiter@123       waiter2 / Waiter@123    cashier / Cashier@123
--   kitchen / Kitchen@123      bar / Bar@123
-- =====================================================================
SET DEFINE OFF;

INSERT INTO branches (branch_id, branch_code, business_name, branch_name, address_line, city, phone, email, gst_number, logo_url, welcome_message, service_charge_pct, tax_on_service_chg, rounding_mode, receipt_footer)
VALUES (1, 'MAIN', 'The Saffron Lounge', 'Main Branch', '14 Residency Road', 'Bengaluru 560025', '+91 80 4123 4567', 'hello@saffronlounge.in', '29ABCDE1234F1Z5',
        'https://api.dickies.example/logo.png', 'Welcome! Scan, browse and let our staff take your order.', 5, 'N', 'NEAREST', 'Thank you for dining with us. Visit again!');
UPDATE branches SET logo_url = NULL WHERE branch_id = 1;

-- Roles -----------------------------------------------------------------
INSERT INTO roles (role_id, role_code, role_name, description, max_discount_pct, is_system) VALUES (1, 'SUPER_ADMIN', 'Super Admin', 'Platform owner, unrestricted', 100, 'Y');
INSERT INTO roles (role_id, role_code, role_name, description, max_discount_pct, is_system) VALUES (2, 'ADMIN', 'Admin', 'Full branch administration', 100, 'Y');
INSERT INTO roles (role_id, role_code, role_name, description, max_discount_pct, is_system) VALUES (3, 'MANAGER', 'Manager', 'Floor operations, approvals, reports', 30, 'Y');
INSERT INTO roles (role_id, role_code, role_name, description, max_discount_pct, is_system) VALUES (4, 'WAITER', 'Waiter', 'Takes and serves orders', 0, 'Y');
INSERT INTO roles (role_id, role_code, role_name, description, max_discount_pct, is_system) VALUES (5, 'CASHIER', 'Cashier', 'Billing and payments', 10, 'Y');
INSERT INTO roles (role_id, role_code, role_name, description, max_discount_pct, is_system) VALUES (6, 'KITCHEN', 'Kitchen Staff', 'Kitchen display', 0, 'Y');
INSERT INTO roles (role_id, role_code, role_name, description, max_discount_pct, is_system) VALUES (7, 'BAR', 'Bar Staff', 'Bar display', 0, 'Y');

-- Permissions (plain inserts: identity columns + multitable INSERT ALL is a grey area) --------
DECLARE
  PROCEDURE p(p_code VARCHAR2, p_module VARCHAR2, p_desc VARCHAR2) IS
  BEGIN INSERT INTO permissions (permission_code, module_name, description) VALUES (p_code, p_module, p_desc); END;
BEGIN
  p('dashboard:view','dashboard','View dashboard');            p('reports:view','reports','View reports');
  p('audit:view','audit','View audit log');
  p('users:view','users','View users');                        p('users:manage','users','Create/edit users');
  p('roles:view','roles','View roles');                        p('roles:manage','roles','Edit role permissions');
  p('settings:view','settings','View settings');               p('settings:manage','settings','Edit settings & taxes');
  p('menu:view','menu','View menu');                           p('menu:manage','menu','Manage menu & prices');
  p('menu:availability','menu','Toggle item availability');
  p('offers:view','offers','View offers');                     p('offers:manage','offers','Manage offers');
  p('tables:view','tables','View tables');                     p('tables:manage','tables','Manage floors & tables');
  p('tables:status:override','tables','Manually change table status');
  p('qr:view','qr','View QR codes');                           p('qr:manage','qr','Regenerate QR codes');
  p('orders:view','orders','View orders');                     p('orders:view:all','orders','View all orders (not only own tables)');
  p('orders:create','orders','Create orders / add items');     p('orders:confirm','orders','Send order to kitchen/bar');
  p('orders:cancel','orders','Cancel confirmed orders');       p('orders:cancel:item','orders','Cancel order items');
  p('orders:request-bill','orders','Request bill');            p('orders:item:status','orders','Mark items served');
  p('orders:approve-discount','orders','Approve discounts & cancellations');
  p('kitchen:view','kitchen','View kitchen display');          p('kitchen:update','kitchen','Update kitchen item status');
  p('bar:view','bar','View bar display');                      p('bar:update','bar','Update bar item status');
  p('billing:view','billing','View bills');                    p('billing:create','billing','Generate & finalize bills');
  p('billing:discount','billing','Apply discounts');           p('billing:pay','billing','Accept payments');
  p('billing:refund','billing','Reverse payments');            p('billing:close','billing','Close orders');
  p('billing:edit-paid','billing','Edit paid/closed bills');
END;
/

-- Role → permission matrix (see docs/RBAC.md)
DECLARE
  PROCEDURE grant_perms(p_role VARCHAR2, p_codes VARCHAR2) IS
  BEGIN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.role_id, p.permission_id FROM roles r, permissions p
     WHERE r.role_code = p_role AND INSTR(',' || p_codes || ',', ',' || p.permission_code || ',') > 0;
  END;
BEGIN
  INSERT INTO role_permissions (role_id, permission_id) SELECT 1, permission_id FROM permissions;      -- SUPER_ADMIN: all
  INSERT INTO role_permissions (role_id, permission_id) SELECT 2, permission_id FROM permissions;      -- ADMIN: all
  grant_perms('MANAGER', 'dashboard:view,reports:view,settings:view,menu:view,menu:availability,offers:view,offers:manage,tables:view,tables:manage,tables:status:override,orders:view,orders:view:all,orders:create,orders:confirm,orders:cancel,orders:cancel:item,orders:request-bill,orders:item:status,orders:approve-discount,kitchen:view,kitchen:update,bar:view,bar:update,billing:view,billing:create,billing:discount,billing:pay,billing:refund,billing:close');
  grant_perms('WAITER', 'menu:view,offers:view,tables:view,orders:view,orders:create,orders:confirm,orders:cancel:item,orders:request-bill,orders:item:status');
  grant_perms('CASHIER', 'menu:view,offers:view,tables:view,orders:view,orders:view:all,billing:view,billing:create,billing:discount,billing:pay,billing:close');
  grant_perms('KITCHEN', 'kitchen:view,kitchen:update');
  grant_perms('BAR', 'bar:view,bar:update');
END;
/

-- Users -------------------------------------------------------------------
DECLARE
  PROCEDURE mk(p_id NUMBER, p_user VARCHAR2, p_name VARCHAR2, p_email VARCHAR2, p_pwd VARCHAR2, p_role VARCHAR2, p_pin VARCHAR2 DEFAULT NULL) IS
    l_salt RAW(32) := sec_pkg.new_salt;
  BEGIN
    INSERT INTO users (user_id, branch_id, username, email, full_name, phone, password_hash, password_salt, approval_pin_hash)
    VALUES (p_id, 1, p_user, p_email, p_name, '+91 98' || LPAD(p_id * 1234567, 8, '0'), sec_pkg.hash_password(p_pwd, l_salt), l_salt,
            CASE WHEN p_pin IS NOT NULL THEN sec_pkg.hash_password(p_pin, l_salt) END);
    INSERT INTO user_roles (user_id, role_id) SELECT p_id, role_id FROM roles WHERE role_code = p_role;
  END;
BEGIN
  mk(1, 'superadmin', 'Karan Singh',   'karan.singh@nexovo.in',   'Super@123',   'SUPER_ADMIN', '1234');
  mk(2, 'admin',      'Aarav Mehta',   'admin@saffronlounge.in',  'Admin@123',   'ADMIN',       '1234');
  mk(3, 'manager',    'Priya Nair',    'priya@saffronlounge.in',  'Manager@123', 'MANAGER',     '1234');
  mk(4, 'waiter1',    'Rahul Verma',   'rahul@saffronlounge.in',  'Waiter@123',  'WAITER');
  mk(5, 'waiter2',    'Sneha Iyer',    'sneha@saffronlounge.in',  'Waiter@123',  'WAITER');
  mk(6, 'cashier',    'Vikram Rao',    'vikram@saffronlounge.in', 'Cashier@123', 'CASHIER');
  mk(7, 'kitchen',    'Chef Arjun',    'kitchen@saffronlounge.in','Kitchen@123', 'KITCHEN');
  mk(8, 'bar',        'Neha Kapoor',   'bar@saffronlounge.in',    'Bar@123',     'BAR');
END;
/

-- Tax configuration -------------------------------------------------------
INSERT INTO tax_configurations (tax_group_id, branch_id, tax_code, tax_name) VALUES (1, 1, 'GST5',  'GST 5% (Food)');
INSERT INTO tax_configurations (tax_group_id, branch_id, tax_code, tax_name) VALUES (2, 1, 'GST18', 'GST 18%');
INSERT INTO tax_configurations (tax_group_id, branch_id, tax_code, tax_name) VALUES (3, 1, 'VAT20', 'Liquor VAT 20%');
INSERT INTO tax_configurations (tax_group_id, branch_id, tax_code, tax_name) VALUES (4, 1, 'NOTAX', 'Tax exempt');
INSERT INTO tax_components (tax_group_id, component_code, component_name, rate_pct) VALUES (1, 'CGST', 'CGST', 2.5);
INSERT INTO tax_components (tax_group_id, component_code, component_name, rate_pct) VALUES (1, 'SGST', 'SGST', 2.5);
INSERT INTO tax_components (tax_group_id, component_code, component_name, rate_pct) VALUES (2, 'CGST', 'CGST', 9);
INSERT INTO tax_components (tax_group_id, component_code, component_name, rate_pct) VALUES (2, 'SGST', 'SGST', 9);
INSERT INTO tax_components (tax_group_id, component_code, component_name, rate_pct) VALUES (3, 'VAT',  'VAT',  20);

-- Floors & tables ---------------------------------------------------------
INSERT INTO floors (floor_id, branch_id, floor_code, floor_name, display_order) VALUES (1, 1, 'MAIN', 'Main Dining', 1);
INSERT INTO floors (floor_id, branch_id, floor_code, floor_name, display_order) VALUES (2, 1, 'BAR',  'Bar Area',    2);
INSERT INTO floors (floor_id, branch_id, floor_code, floor_name, display_order) VALUES (3, 1, 'VIP',  'VIP Lounge',  3);
BEGIN
  FOR i IN 1..12 LOOP
    INSERT INTO dining_tables (branch_id, floor_id, table_number, table_name, seating_capacity, public_code, assigned_waiter_id)
    VALUES (1, 1, TO_CHAR(i), 'Table ' || i, CASE WHEN MOD(i,3)=0 THEN 6 ELSE 4 END, table_pkg.new_public_code, CASE WHEN i <= 6 THEN 4 ELSE 5 END);
  END LOOP;
  FOR i IN 10..15 LOOP
    INSERT INTO dining_tables (branch_id, floor_id, table_number, table_name, seating_capacity, public_code, assigned_waiter_id)
    VALUES (1, 2, 'B' || i, 'Bar ' || i, 2, table_pkg.new_public_code, 5);
  END LOOP;
  FOR i IN 1..4 LOOP
    INSERT INTO dining_tables (branch_id, floor_id, table_number, table_name, seating_capacity, public_code, assigned_waiter_id)
    VALUES (1, 3, 'VIP' || i, 'VIP ' || i, 8, table_pkg.new_public_code, 4);
  END LOOP;
END;
/

-- Menu categories -----------------------------------------------------------
INSERT ALL
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (1, 1, 'Starters', 'starters', 'KITCHEN', 1)
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (2, 1, 'Main Course', 'main-course', 'KITCHEN', 2)
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (3, 1, 'Chinese', 'chinese', 'KITCHEN', 3)
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (4, 1, 'Indian', 'indian', 'KITCHEN', 4)
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (5, 1, 'Pizza', 'pizza', 'KITCHEN', 5)
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (6, 1, 'Burgers', 'burgers', 'KITCHEN', 6)
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (7, 1, 'Desserts', 'desserts', 'KITCHEN', 7)
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (8, 1, 'Beverages', 'beverages', 'BAR', 8)
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (9, 1, 'Mocktails', 'mocktails', 'BAR', 9)
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (10, 1, 'Cocktails', 'cocktails', 'BAR', 10)
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (11, 1, 'Beer', 'beer', 'BAR', 11)
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (12, 1, 'Wine', 'wine', 'BAR', 12)
  INTO menu_categories (category_id, branch_id, category_name, slug, default_prep_loc, display_order) VALUES (13, 1, 'Spirits', 'spirits', 'BAR', 13)
SELECT 1 FROM dual;

-- Menu items (35) -------------------------------------------------------------
DECLARE
  PROCEDURE it(p_code VARCHAR2, p_cat NUMBER, p_name VARCHAR2, p_desc VARCHAR2, p_price NUMBER, p_loc VARCHAR2, p_tax NUMBER, p_veg CHAR, p_pop CHAR, p_img VARCHAR2) IS
    l_id NUMBER;
  BEGIN
    INSERT INTO menu_items (branch_id, category_id, item_code, item_name, description, image_url, current_price, prep_location, tax_group_id, is_veg, is_popular)
    VALUES (1, p_cat, p_code, p_name, p_desc, p_img, p_price, p_loc, p_tax, p_veg, p_pop) RETURNING item_id INTO l_id;
    INSERT INTO menu_item_prices (item_id, price) VALUES (l_id, p_price);
  END;
BEGIN
  it('ST01', 1, 'Paneer Tikka', 'Char-grilled cottage cheese, mint chutney', 320, 'KITCHEN', 1, 'Y', 'Y', 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600');
  it('ST02', 1, 'Chicken Wings', 'Six pieces, peri-peri glaze', 380, 'KITCHEN', 1, 'N', 'Y', 'https://images.unsplash.com/photo-1608039755401-742074f0548d?w=600');
  it('ST03', 1, 'French Fries', 'Crispy, salted, served with ketchup', 250, 'KITCHEN', 1, 'Y', 'Y', 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600');
  it('ST04', 1, 'Nachos Grande', 'Cheese, salsa, jalapeños, sour cream', 340, 'KITCHEN', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=600');
  it('MC01', 2, 'Grilled Salmon', 'Lemon butter, sautéed greens', 890, 'KITCHEN', 1, 'N', 'N', 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600');
  it('MC02', 2, 'Pasta Alfredo', 'Creamy parmesan, penne', 460, 'KITCHEN', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600');
  it('MC03', 2, 'Mushroom Risotto', 'Arborio rice, wild mushrooms', 520, 'KITCHEN', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=600');
  it('CH01', 3, 'Hakka Noodles', 'Wok-tossed vegetables', 290, 'KITCHEN', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600');
  it('CH02', 3, 'Chilli Chicken', 'Indo-Chinese classic, dry', 380, 'KITCHEN', 1, 'N', 'Y', 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600');
  it('CH03', 3, 'Veg Manchurian', 'Vegetable dumplings, soy garlic sauce', 310, 'KITCHEN', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1626804475297-41608ea09aeb?w=600');
  it('IN01', 4, 'Butter Chicken', 'Tandoori chicken in tomato-butter gravy', 480, 'KITCHEN', 1, 'N', 'Y', 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600');
  it('IN02', 4, 'Dal Makhani', 'Slow-cooked black lentils', 340, 'KITCHEN', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600');
  it('IN03', 4, 'Garlic Naan', 'Tandoor baked, butter garlic', 90, 'KITCHEN', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600');
  it('IN04', 4, 'Chicken Biryani', 'Hyderabadi dum, raita', 420, 'KITCHEN', 1, 'N', 'Y', 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600');
  it('PZ01', 5, 'Margherita Pizza', 'San Marzano tomato, buffalo mozzarella', 450, 'KITCHEN', 1, 'Y', 'Y', 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600');
  it('PZ02', 5, 'Pepperoni Pizza', 'Pork pepperoni, mozzarella', 560, 'KITCHEN', 1, 'N', 'N', 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600');
  it('BG01', 6, 'Chicken Burger', 'Crispy fillet, slaw, brioche bun', 350, 'KITCHEN', 1, 'N', 'Y', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600');
  it('BG02', 6, 'Classic Beef Burger', 'Double patty, cheddar', 420, 'KITCHEN', 1, 'N', 'N', 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600');
  it('BG03', 6, 'Veggie Burger', 'Beetroot-quinoa patty', 320, 'KITCHEN', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1520072959219-c595dc870360?w=600');
  it('DS01', 7, 'Chocolate Brownie', 'Warm, with vanilla ice cream', 260, 'KITCHEN', 1, 'Y', 'Y', 'https://images.unsplash.com/photo-1607920591413-4ec007e70023?w=600');
  it('DS02', 7, 'Gulab Jamun', 'Two pieces, rose syrup', 180, 'KITCHEN', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1601303516534-bf0b1eb70c0d?w=600');
  it('DS03', 7, 'Tiramisu', 'Espresso soaked, mascarpone', 320, 'KITCHEN', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600');
  it('BV01', 8, 'Fresh Lime Soda', 'Sweet / salted', 120, 'BAR', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1523677011781-c91d1bbe2f9e?w=600');
  it('BV02', 8, 'Cold Coffee', 'Blended with ice cream', 220, 'BAR', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600');
  it('BV03', 8, 'Mineral Water 1L', 'Chilled', 60, 'BAR', 4, 'Y', 'N', NULL);
  it('MK01', 9, 'Virgin Mojito', 'Mint, lime, soda', 260, 'BAR', 1, 'Y', 'Y', 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600');
  it('MK02', 9, 'Blue Lagoon', 'Blue curaçao syrup, lemonade', 280, 'BAR', 1, 'Y', 'N', 'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600');
  it('CK01', 10, 'Mojito', 'White rum, mint, lime', 450, 'BAR', 3, 'Y', 'Y', 'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=600');
  it('CK02', 10, 'Long Island Iced Tea', 'Five spirits, cola', 620, 'BAR', 3, 'Y', 'N', 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600');
  it('CK03', 10, 'Whiskey Sour', 'Bourbon, lemon, egg white', 550, 'BAR', 3, 'N', 'N', 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600');
  it('BR01', 11, 'Kingfisher Premium 650ml', 'Lager', 400, 'BAR', 3, 'Y', 'Y', 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600');
  it('BR02', 11, 'Craft IPA 330ml', 'Local brewery', 380, 'BAR', 3, 'Y', 'N', 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600');
  it('WN01', 12, 'House Red (glass)', 'Cabernet Sauvignon', 520, 'BAR', 3, 'Y', 'N', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600');
  it('WN02', 12, 'House White (glass)', 'Sauvignon Blanc', 520, 'BAR', 3, 'Y', 'N', 'https://images.unsplash.com/photo-1566754436893-98224ee05be8?w=600');
  it('SP01', 13, 'Single Malt 30ml', 'Glenfiddich 12', 750, 'BAR', 3, 'Y', 'N', 'https://images.unsplash.com/photo-1527281400683-1aae777175f8?w=600');
  it('SP02', 13, 'Premium Vodka 30ml', 'Grey Goose', 550, 'BAR', 3, 'Y', 'N', NULL);
END;
/

-- Offers -----------------------------------------------------------------------
INSERT INTO offers (offer_id, branch_id, offer_name, description, offer_type, discount_value, applies_to, start_date, end_date, start_time, end_time)
VALUES (1, 1, 'Happy Hours — 20% off cocktails', 'Every day 4–7 PM on all cocktails', 'HAPPY_HOUR', 20, 'CATEGORIES', TRUNC(SYSDATE) - 30, TRUNC(SYSDATE) + 365, '16:00', '19:00');
INSERT INTO offer_rules (offer_id, rule_type, category_id) VALUES (1, 'CATEGORY', 10);
INSERT INTO offers (offer_id, branch_id, offer_name, description, offer_type, discount_value, applies_to, start_date, end_date)
VALUES (2, 1, 'Buy 1 Get 1 — Craft IPA', 'BOGO on Craft IPA all week', 'BOGO', 0, 'ITEMS', TRUNC(SYSDATE) - 7, TRUNC(SYSDATE) + 60);
INSERT INTO offer_rules (offer_id, rule_type, item_id) SELECT 2, 'ITEM', item_id FROM menu_items WHERE item_code = 'BR02';
INSERT INTO offers (offer_id, branch_id, offer_name, description, offer_type, discount_value, max_discount_amt, applies_to, start_date, end_date)
VALUES (3, 1, '10% off Pizzas', 'Weekday pizza treat', 'PERCENTAGE', 10, 100, 'CATEGORIES', TRUNC(SYSDATE) - 1, TRUNC(SYSDATE) + 30);
INSERT INTO offer_rules (offer_id, rule_type, category_id) VALUES (3, 'CATEGORY', 5);
INSERT INTO offers (offer_id, branch_id, offer_name, description, offer_type, discount_value, applies_to, start_date, end_date, is_active)
VALUES (4, 1, 'Flat ₹50 off desserts', 'Expired sample offer', 'FLAT', 50, 'CATEGORIES', TRUNC(SYSDATE) - 60, TRUNC(SYSDATE) - 30, 'N');
INSERT INTO offer_rules (offer_id, rule_type, category_id) VALUES (4, 'CATEGORY', 7);

COMMIT;

-- Sample transactions — generated through the packages so all rules/audit apply
DECLARE
  l_o1 NUMBER; l_o2 NUMBER; l_o3 NUMBER; l_b NUMBER; items JSON_ARRAY_T; body JSON_OBJECT_T;
  FUNCTION line(p_code VARCHAR2, p_qty NUMBER, p_notes VARCHAR2 DEFAULT NULL) RETURN JSON_OBJECT_T IS
    o JSON_OBJECT_T := JSON_OBJECT_T(); l_id NUMBER;
  BEGIN
    SELECT item_id INTO l_id FROM menu_items WHERE item_code = p_code;
    o.put('menuItemId', l_id); o.put('quantity', p_qty); IF p_notes IS NOT NULL THEN o.put('notes', p_notes); END IF; RETURN o;
  END;
  FUNCTION tbl(p_num VARCHAR2) RETURN NUMBER IS l NUMBER; BEGIN SELECT table_id INTO l FROM dining_tables WHERE table_number = p_num; RETURN l; END;
BEGIN
  -- 1) Completed order + paid bill (split payment) — waiter1 / cashier
  api_pkg.set_context(4, 1);
  items := JSON_ARRAY_T(); items.append(line('BG01', 2, 'No onion, extra cheese')); items.append(line('ST03', 1)); items.append(line('CK01', 1, 'Less ice')); items.append(line('BR01', 2));
  body := JSON_OBJECT_T(); body.put('tableId', tbl('3')); body.put('guestCount', 3); body.put('items', items);
  l_o1 := order_pkg.create_order(body);
  order_pkg.confirm_order(l_o1);
  api_pkg.set_context(7, 1);
  FOR r IN (SELECT order_item_id FROM order_items WHERE order_id = l_o1 AND prep_location = 'KITCHEN') LOOP
    order_pkg.set_item_status(r.order_item_id, 'PREPARING', 'KITCHEN'); order_pkg.set_item_status(r.order_item_id, 'READY', 'KITCHEN');
  END LOOP;
  api_pkg.set_context(8, 1);
  FOR r IN (SELECT order_item_id FROM order_items WHERE order_id = l_o1 AND prep_location = 'BAR') LOOP
    order_pkg.set_item_status(r.order_item_id, 'PREPARING', 'BAR'); order_pkg.set_item_status(r.order_item_id, 'READY', 'BAR');
  END LOOP;
  api_pkg.set_context(4, 1);
  FOR r IN (SELECT order_item_id FROM order_items WHERE order_id = l_o1) LOOP order_pkg.set_item_status(r.order_item_id, 'SERVED'); END LOOP;
  order_pkg.request_bill(l_o1);
  api_pkg.set_context(6, 1);
  l_b := billing_pkg.create_bill(l_o1);
  billing_pkg.add_discount(l_b, 'PERCENTAGE', 5, 'Regular guest', NULL, NULL);
  billing_pkg.finalize_bill(l_b);
  payment_pkg.add_payment(l_b, 'CASH', 1000, NULL);
  DECLARE l_bal NUMBER; BEGIN SELECT grand_total - paid_amount INTO l_bal FROM bills WHERE bill_id = l_b; payment_pkg.add_payment(l_b, 'UPI', l_bal, 'UPI-REF-77821'); END;
  billing_pkg.close_bill(l_b);

  -- 2) Active order in progress (kitchen preparing) — table 5
  api_pkg.set_context(4, 1);
  items := JSON_ARRAY_T(); items.append(line('IN01', 1)); items.append(line('IN03', 4, 'Extra butter')); items.append(line('MK01', 2));
  body := JSON_OBJECT_T(); body.put('tableId', tbl('5')); body.put('guestCount', 2); body.put('items', items);
  l_o2 := order_pkg.create_order(body);
  order_pkg.confirm_order(l_o2);
  api_pkg.set_context(7, 1);
  FOR r IN (SELECT order_item_id FROM order_items WHERE order_id = l_o2 AND prep_location = 'KITCHEN' AND ROWNUM = 1) LOOP order_pkg.set_item_status(r.order_item_id, 'PREPARING', 'KITCHEN'); END LOOP;

  -- 3) Bill requested, awaiting cashier — bar table B11
  api_pkg.set_context(5, 1);
  items := JSON_ARRAY_T(); items.append(line('BR02', 2)); items.append(line('ST02', 1)); items.append(line('CK02', 1));
  body := JSON_OBJECT_T(); body.put('tableId', tbl('B11')); body.put('guestCount', 2); body.put('items', items);
  l_o3 := order_pkg.create_order(body);
  order_pkg.confirm_order(l_o3);
  api_pkg.set_context(7, 1);
  FOR r IN (SELECT order_item_id FROM order_items WHERE order_id = l_o3 AND prep_location = 'KITCHEN') LOOP order_pkg.set_item_status(r.order_item_id, 'PREPARING', 'KITCHEN'); order_pkg.set_item_status(r.order_item_id, 'READY', 'KITCHEN'); END LOOP;
  api_pkg.set_context(8, 1);
  FOR r IN (SELECT order_item_id FROM order_items WHERE order_id = l_o3 AND prep_location = 'BAR') LOOP order_pkg.set_item_status(r.order_item_id, 'PREPARING', 'BAR'); order_pkg.set_item_status(r.order_item_id, 'READY', 'BAR'); END LOOP;
  api_pkg.set_context(5, 1);
  FOR r IN (SELECT order_item_id FROM order_items WHERE order_id = l_o3) LOOP order_pkg.set_item_status(r.order_item_id, 'SERVED'); END LOOP;
  order_pkg.request_bill(l_o3);

  -- 4) Draft order — VIP1
  api_pkg.set_context(4, 1);
  items := JSON_ARRAY_T(); items.append(line('MC01', 2)); items.append(line('WN01', 2));
  body := JSON_OBJECT_T(); body.put('tableId', tbl('VIP1')); body.put('guestCount', 4); body.put('items', items);
  l_o1 := order_pkg.create_order(body);
  COMMIT;
END;
/
