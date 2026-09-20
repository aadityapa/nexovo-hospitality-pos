-- =====================================================================
-- PHASE 2 — RESERVATION_PKG, CLUB_PKG (entries, cover charges, cover credit),
--           VIP_PKG (minimum spend), BOTTLE_PKG, PMS_ADAPTER_PKG + ROOM_CHARGE_PKG
-- =====================================================================

-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE reservation_pkg AS
  FUNCTION res_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION list_json(p_from DATE, p_to DATE, p_status VARCHAR2, p_search VARCHAR2) RETURN JSON_ARRAY_T;
  FUNCTION save_res(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE transition(p_id NUMBER, p_action VARCHAR2, p_table_id NUMBER, p_reason VARCHAR2);
  FUNCTION availability_json(p_date DATE) RETURN JSON_OBJECT_T;
  PROCEDURE send_reminders;   -- notifications for upcoming reservations (called from notify_pkg.run_checks)
END reservation_pkg;
/
CREATE OR REPLACE PACKAGE BODY reservation_pkg AS
  FUNCTION res_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    FOR r IN (SELECT r.*, t.table_name, t.table_number, o.order_number, u.full_name created_name FROM reservations r LEFT JOIN dining_tables t ON t.table_id = r.table_id
                LEFT JOIN orders o ON o.order_id = r.order_id LEFT JOIN users u ON u.user_id = r.created_by WHERE r.res_id = p_id) LOOP
      j.put('id', r.res_id); j.put('resNumber', r.res_number); j.put('branchId', r.branch_id); j.put('customerId', r.customer_id); j.put('guestName', r.guest_name); j.put('phone', r.phone);
      j.put('date', TO_CHAR(r.res_date, 'YYYY-MM-DD')); j.put('time', r.res_time); j.put('durationMin', r.duration_min); j.put('guests', r.guests); j.put('tablePref', r.table_pref);
      j.put('tableId', r.table_id); j.put('tableName', r.table_name); j.put('occasion', r.occasion); j.put('notes', r.notes); j.put('status', r.status); j.put('depositAmount', r.deposit_amount);
      j.put('seatedAt', api_pkg.ts_iso(r.seated_at)); j.put('orderId', r.order_id); j.put('orderNumber', r.order_number); j.put('createdByName', r.created_name); j.put('createdAt', api_pkg.ts_iso(r.created_at));
      RETURN j;
    END LOOP;
    api_pkg.raise_not_found('Reservation not found');
    RETURN NULL;
  END;

  FUNCTION list_json(p_from DATE, p_to DATE, p_status VARCHAR2, p_search VARCHAR2) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('reservations:view');
    FOR r IN (SELECT res_id FROM reservations WHERE branch_id = api_pkg.current_branch_id
               AND (p_from IS NULL OR res_date >= p_from) AND (p_to IS NULL OR res_date <= p_to) AND (p_status IS NULL OR status = p_status)
               AND (p_search IS NULL OR LOWER(guest_name) LIKE '%'||LOWER(p_search)||'%' OR phone LIKE '%'||p_search||'%' OR LOWER(res_number) LIKE '%'||LOWER(p_search)||'%')
               ORDER BY res_date, res_time) LOOP
      a.append(res_json(r.res_id));
    END LOOP;
    RETURN a;
  END;

  FUNCTION save_res(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_name VARCHAR2(150) := TRIM(p_body.get_string('guestName')); l_phone VARCHAR2(30) := p_body.get_string('phone');
    l_date DATE := TO_DATE(p_body.get_string('date'), 'YYYY-MM-DD'); l_time VARCHAR2(5) := p_body.get_string('time'); l_guests NUMBER := p_body.get_number('guests');
    l_dur NUMBER := NVL(p_body.get_number('durationMin'), 120); l_pref VARCHAR2(100) := p_body.get_string('tablePref'); l_table NUMBER := p_body.get_number('tableId');
    l_occ VARCHAR2(60) := p_body.get_string('occasion'); l_notes VARCHAR2(500) := p_body.get_string('notes'); l_cust NUMBER := p_body.get_number('customerId');
    l_dep NUMBER := NVL(p_body.get_number('depositAmount'), 0); l_status VARCHAR2(20); l_no VARCHAR2(30); l_cnt NUMBER;
  BEGIN
    sec_pkg.assert_permission('reservations:manage');
    IF l_name IS NULL OR l_phone IS NULL THEN api_pkg.raise_validation('Guest name and phone are required', 'guestName'); END IF;
    IF l_date IS NULL OR l_time IS NULL OR NOT REGEXP_LIKE(l_time, '^\d{2}:\d{2}$') THEN api_pkg.raise_validation('Date and time (HH:MM) are required', 'time'); END IF;
    IF l_guests IS NULL OR l_guests <= 0 THEN api_pkg.raise_validation('Number of guests must be positive', 'guests'); END IF;
    IF l_table IS NOT NULL THEN
      -- overlap check on the same table (± duration)
      SELECT COUNT(*) INTO l_cnt FROM reservations x WHERE x.table_id = l_table AND x.res_date = l_date AND x.status IN ('PENDING','CONFIRMED','SEATED') AND (p_id IS NULL OR x.res_id <> p_id)
        AND ABS((TO_DATE(x.res_time, 'HH24:MI') - TO_DATE(l_time, 'HH24:MI')) * 24 * 60) < GREATEST(x.duration_min, l_dur);
      IF l_cnt > 0 THEN api_pkg.raise_conflict('That table already has a reservation around this time'); END IF;
    END IF;
    IF l_id IS NULL THEN
      l_no := numbering_pkg.next_number('RES', 'RES');
      INSERT INTO reservations (res_number, branch_id, customer_id, guest_name, phone, res_date, res_time, duration_min, guests, table_pref, table_id, occasion, notes, status, deposit_amount, created_by)
      VALUES (l_no, api_pkg.current_branch_id, l_cust, l_name, l_phone, l_date, l_time, l_dur, l_guests, l_pref, l_table, l_occ, l_notes, 'PENDING', l_dep, api_pkg.current_user_id) RETURNING res_id INTO l_id;
    ELSE
      SELECT status INTO l_status FROM reservations WHERE res_id = l_id AND branch_id = api_pkg.current_branch_id FOR UPDATE;
      IF l_status IN ('COMPLETED','CANCELLED','NO_SHOW') THEN api_pkg.raise_business('Closed reservations cannot be edited'); END IF;
      UPDATE reservations SET customer_id = l_cust, guest_name = l_name, phone = l_phone, res_date = l_date, res_time = l_time, duration_min = l_dur, guests = l_guests, table_pref = l_pref,
             table_id = l_table, occasion = l_occ, notes = l_notes, deposit_amount = l_dep, updated_at = SYSTIMESTAMP, updated_by = api_pkg.current_user_id WHERE res_id = l_id;
    END IF;
    audit_pkg.log(CASE WHEN p_id IS NULL THEN 'RESERVATION_CREATED' ELSE 'RESERVATION_UPDATED' END, 'RESERVATIONS', l_id);
    audit_pkg.emit_event('reservations', 'reservation.saved', l_id);
    RETURN l_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Reservation not found'); RETURN NULL;
  END;

  -- CONFIRM | SEAT (table required → creates the order, links table) | COMPLETE | CANCEL | NO_SHOW
  PROCEDURE transition(p_id NUMBER, p_action VARCHAR2, p_table_id NUMBER, p_reason VARCHAR2) IS
    r reservations%ROWTYPE; l_new VARCHAR2(20); l_order NUMBER; body JSON_OBJECT_T;
  BEGIN
    sec_pkg.assert_permission('reservations:manage');
    SELECT * INTO r FROM reservations WHERE res_id = p_id AND branch_id = api_pkg.current_branch_id FOR UPDATE;
    CASE p_action
      WHEN 'CONFIRM' THEN IF r.status <> 'PENDING' THEN api_pkg.raise_conflict('Only pending reservations can be confirmed'); END IF; l_new := 'CONFIRMED';
        UPDATE reservations SET status = 'CONFIRMED', updated_at = SYSTIMESTAMP WHERE res_id = p_id;
      WHEN 'SEAT' THEN
        IF r.status NOT IN ('PENDING','CONFIRMED') THEN api_pkg.raise_conflict('Reservation is ' || LOWER(r.status)); END IF;
        IF NVL(p_table_id, r.table_id) IS NULL THEN api_pkg.raise_validation('Select a table to seat the guests', 'tableId'); END IF;
        body := JSON_OBJECT_T(); body.put('tableId', NVL(p_table_id, r.table_id)); body.put('guestCount', r.guests); body.put('notes', 'Reservation ' || r.res_number || CASE WHEN r.occasion IS NOT NULL THEN ' · ' || r.occasion END);
        l_order := order_pkg.create_order(body);
        UPDATE orders SET customer_id = r.customer_id, reservation_id = p_id WHERE order_id = l_order;
        UPDATE reservations SET status = 'SEATED', table_id = NVL(p_table_id, r.table_id), seated_at = SYSTIMESTAMP, order_id = l_order, updated_at = SYSTIMESTAMP WHERE res_id = p_id;
        l_new := 'SEATED';
      WHEN 'COMPLETE' THEN IF r.status <> 'SEATED' THEN api_pkg.raise_conflict('Only seated reservations can be completed'); END IF; l_new := 'COMPLETED';
        UPDATE reservations SET status = 'COMPLETED', updated_at = SYSTIMESTAMP WHERE res_id = p_id;
      WHEN 'CANCEL' THEN IF r.status IN ('COMPLETED','CANCELLED') THEN api_pkg.raise_conflict('Reservation already closed'); END IF; l_new := 'CANCELLED';
        UPDATE reservations SET status = 'CANCELLED', notes = SUBSTR(NVL(notes, '') || ' [cancelled: ' || NVL(p_reason, 'no reason') || ']', 1, 500), updated_at = SYSTIMESTAMP WHERE res_id = p_id;
      WHEN 'NO_SHOW' THEN IF r.status NOT IN ('PENDING','CONFIRMED') THEN api_pkg.raise_conflict('Only open reservations can be marked no-show'); END IF; l_new := 'NO_SHOW';
        UPDATE reservations SET status = 'NO_SHOW', updated_at = SYSTIMESTAMP WHERE res_id = p_id;
      ELSE api_pkg.raise_validation('Unknown action ' || p_action, 'action');
    END CASE;
    notify_pkg.resolve_dedupe('RES_REMINDER:' || p_id);
    audit_pkg.log('RESERVATION_' || p_action, 'RESERVATIONS', p_id, r.status, l_new);
    audit_pkg.emit_event('reservations', 'reservation.status', p_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Reservation not found');
  END;

  FUNCTION availability_json(p_date DATE) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); tables JSON_ARRAY_T := JSON_ARRAY_T(); l_total NUMBER := 0; l_booked NUMBER := 0;
  BEGIN
    sec_pkg.assert_permission('reservations:view');
    FOR t IN (SELECT t.table_id, t.table_name, t.seating_capacity, t.status, f.floor_name, t.is_vip FROM dining_tables t JOIN floors f ON f.floor_id = t.floor_id
               WHERE t.branch_id = api_pkg.current_branch_id AND t.is_deleted = 'N' AND t.is_active = 'Y' ORDER BY f.display_order, LPAD(t.table_number, 10)) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); slots JSON_ARRAY_T := JSON_ARRAY_T();
      BEGIN
        FOR r IN (SELECT res_id, res_number, guest_name, res_time, duration_min, guests, status FROM reservations WHERE table_id = t.table_id AND res_date = p_date AND status IN ('PENDING','CONFIRMED','SEATED') ORDER BY res_time) LOOP
          DECLARE s JSON_OBJECT_T := JSON_OBJECT_T();
          BEGIN s.put('resId', r.res_id); s.put('resNumber', r.res_number); s.put('guestName', r.guest_name); s.put('time', r.res_time); s.put('durationMin', r.duration_min); s.put('guests', r.guests); s.put('status', r.status); slots.append(s); l_booked := l_booked + 1; END;
        END LOOP;
        o.put('tableId', t.table_id); o.put('tableName', t.table_name); o.put('capacity', t.seating_capacity); o.put('floorName', t.floor_name); o.put('isVip', t.is_vip = 'Y'); o.put('currentStatus', t.status); o.put('reservations', slots);
        tables.append(o); l_total := l_total + 1;
      END;
    END LOOP;
    j.put('date', TO_CHAR(p_date, 'YYYY-MM-DD')); j.put('tables', tables); j.put('tableCount', l_total); j.put('bookedSlots', l_booked);
    RETURN j;
  END;

  PROCEDURE send_reminders IS
  BEGIN
    FOR r IN (SELECT res_id, res_number, guest_name, res_time, guests FROM reservations WHERE branch_id = api_pkg.current_branch_id AND res_date = TRUNC(SYSDATE) AND status IN ('PENDING','CONFIRMED')
               AND TO_DATE(TO_CHAR(SYSDATE, 'YYYY-MM-DD') || ' ' || res_time, 'YYYY-MM-DD HH24:MI') BETWEEN SYSDATE AND SYSDATE + 1/24) LOOP
      notify_pkg.create_notification('RESERVATION_REMINDER', 'INFO', 'Arriving soon: ' || r.guest_name || ' (' || r.guests || ')', r.res_number || ' at ' || r.res_time, 'RESERVATIONS', r.res_id, NULL, NULL, 'RES_REMINDER:' || r.res_id);
    END LOOP;
  END;
END reservation_pkg;
/

-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE vip_pkg AS
  FUNCTION vip_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION vip_tables_json RETURN JSON_ARRAY_T;                       -- VIP tables with tonight's booking + live spend
  FUNCTION list_json(p_date DATE, p_status VARCHAR2) RETURN JSON_ARRAY_T;
  FUNCTION save_vip(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE transition(p_id NUMBER, p_action VARCHAR2, p_reason VARCHAR2);
  FUNCTION spend_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION shortfall_for_order(p_order_id NUMBER, p_net_amount NUMBER) RETURN NUMBER;   -- hook: BILLING_PKG.calculate
  PROCEDURE on_bill_closed(p_order_id NUMBER);
END vip_pkg;
/

-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE club_pkg AS
  FUNCTION cover_types_json RETURN JSON_ARRAY_T;
  FUNCTION save_cover_type(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  FUNCTION entry_json(p_id NUMBER) RETURN JSON_OBJECT_T;
  FUNCTION list_entries_json(p_date DATE, p_status VARCHAR2) RETURN JSON_ARRAY_T;
  FUNCTION check_in(p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE check_out(p_id NUMBER);
  PROCEDURE cancel_entry(p_id NUMBER, p_reason VARCHAR2);
  FUNCTION dashboard_json RETURN JSON_OBJECT_T;
  PROCEDURE redeem_cover(p_bill_id NUMBER, p_entry_id NUMBER, p_amount NUMBER);   -- payment method COVER_CREDIT
  PROCEDURE reverse_redemption(p_payment_id NUMBER);
END club_pkg;
/
CREATE OR REPLACE PACKAGE BODY club_pkg AS
  FUNCTION cover_types_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    FOR r IN (SELECT * FROM cover_charge_types WHERE branch_id = api_pkg.current_branch_id ORDER BY cover_code) LOOP
      DECLARE j JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN j.put('id', r.cover_type_id); j.put('code', r.cover_code); j.put('name', r.cover_name); j.put('amount', r.amount); j.put('redeemableAmount', r.redeemable_amount); j.put('guestsIncluded', r.guests_included); j.put('isActive', r.is_active = 'Y'); a.append(j); END;
    END LOOP;
    RETURN a;
  END;

  FUNCTION save_cover_type(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_code VARCHAR2(20) := UPPER(TRIM(p_body.get_string('code'))); l_name VARCHAR2(80) := TRIM(p_body.get_string('name'));
    l_amt NUMBER := NVL(p_body.get_number('amount'), 0); l_red NUMBER := NVL(p_body.get_number('redeemableAmount'), 0); l_g NUMBER := NVL(p_body.get_number('guestsIncluded'), 1);
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE));
  BEGIN
    sec_pkg.assert_permission('club:manage');
    IF l_code IS NULL OR l_name IS NULL THEN api_pkg.raise_validation('Code and name are required', 'name'); END IF;
    IF l_amt < 0 OR l_red < 0 OR l_red > l_amt THEN api_pkg.raise_validation('Redeemable amount must be between 0 and the cover amount', 'redeemableAmount'); END IF;
    IF l_id IS NULL THEN
      INSERT INTO cover_charge_types (branch_id, cover_code, cover_name, amount, redeemable_amount, guests_included, is_active) VALUES (api_pkg.current_branch_id, l_code, l_name, l_amt, l_red, l_g, l_active) RETURNING cover_type_id INTO l_id;
    ELSE
      UPDATE cover_charge_types SET cover_code = l_code, cover_name = l_name, amount = l_amt, redeemable_amount = l_red, guests_included = l_g, is_active = l_active WHERE cover_type_id = l_id AND branch_id = api_pkg.current_branch_id;
      IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Cover charge type not found'); END IF;
    END IF;
    audit_pkg.log('COVER_TYPE_SAVED', 'COVER_CHARGE_TYPES', l_id, NULL, p_body.to_clob);
    RETURN l_id;
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN api_pkg.raise_conflict('Cover code already exists'); RETURN NULL;
  END;

  FUNCTION entry_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    FOR r IN (SELECT e.*, c.cover_name, u.full_name host_name, t.table_name FROM club_entries e LEFT JOIN cover_charge_types c ON c.cover_type_id = e.cover_type_id
                LEFT JOIN users u ON u.user_id = e.host_user_id LEFT JOIN dining_tables t ON t.table_id = e.table_id WHERE e.entry_id = p_id) LOOP
      j.put('id', r.entry_id); j.put('entryNumber', r.entry_number); j.put('branchId', r.branch_id); j.put('customerId', r.customer_id); j.put('guestName', r.guest_name); j.put('phone', r.phone);
      j.put('guests', r.guests); j.put('entryType', r.entry_type); j.put('coverTypeId', r.cover_type_id); j.put('coverName', r.cover_name); j.put('coverAmount', r.cover_amount);
      j.put('redeemableAmount', r.redeemable_amount); j.put('redeemedAmount', r.redeemed_amount); j.put('remainingCredit', ROUND(r.redeemable_amount - r.redeemed_amount, 2));
      j.put('paymentMethod', r.payment_method); j.put('hostUserId', r.host_user_id); j.put('hostName', r.host_name); j.put('tableId', r.table_id); j.put('tableName', r.table_name);
      j.put('status', r.status); j.put('enteredAt', api_pkg.ts_iso(r.entered_at)); j.put('exitedAt', api_pkg.ts_iso(r.exited_at)); j.put('notes', r.notes);
      RETURN j;
    END LOOP;
    api_pkg.raise_not_found('Entry not found');
    RETURN NULL;
  END;

  FUNCTION list_entries_json(p_date DATE, p_status VARCHAR2) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T(); l_day DATE := NVL(p_date, TRUNC(SYSDATE));
  BEGIN
    sec_pkg.assert_permission('club:view');
    -- "tonight" = business day starting 06:00 (club nights cross midnight)
    FOR r IN (SELECT entry_id FROM club_entries WHERE branch_id = api_pkg.current_branch_id AND entered_at >= l_day + 6/24 AND entered_at < l_day + 1 + 6/24
               AND (p_status IS NULL OR status = p_status) ORDER BY entered_at DESC) LOOP
      a.append(entry_json(r.entry_id));
    END LOOP;
    RETURN a;
  END;

  FUNCTION check_in(p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER; l_name VARCHAR2(150) := TRIM(p_body.get_string('guestName')); l_phone VARCHAR2(30) := p_body.get_string('phone'); l_guests NUMBER := NVL(p_body.get_number('guests'), 1);
    l_type VARCHAR2(20) := NVL(p_body.get_string('entryType'), 'WALK_IN'); l_cover NUMBER := p_body.get_number('coverTypeId'); l_units NUMBER := NVL(p_body.get_number('coverUnits'), 1);
    l_method VARCHAR2(20) := p_body.get_string('paymentMethod'); l_host NUMBER := NVL(p_body.get_number('hostUserId'), api_pkg.current_user_id); l_table NUMBER := p_body.get_number('tableId');
    l_cust NUMBER := p_body.get_number('customerId'); l_notes VARCHAR2(300) := p_body.get_string('notes'); ct cover_charge_types%ROWTYPE; l_amt NUMBER := 0; l_red NUMBER := 0; l_no VARCHAR2(30);
  BEGIN
    sec_pkg.assert_permission('club:manage');
    IF l_name IS NULL THEN api_pkg.raise_validation('Guest name is required', 'guestName'); END IF;
    IF l_guests <= 0 THEN api_pkg.raise_validation('Guests must be positive', 'guests'); END IF;
    IF l_type NOT IN ('WALK_IN','GUEST_LIST','PREBOOKED','VIP') THEN api_pkg.raise_validation('Invalid entry type', 'entryType'); END IF;
    IF l_cover IS NOT NULL THEN
      SELECT * INTO ct FROM cover_charge_types WHERE cover_type_id = l_cover AND is_active = 'Y';
      l_amt := ct.amount * l_units; l_red := ct.redeemable_amount * l_units;
      IF l_amt > 0 AND l_method NOT IN ('CASH','UPI','CARD','COMPLIMENTARY') THEN api_pkg.raise_validation('Payment method is required for the cover charge', 'paymentMethod'); END IF;
      IF l_method = 'COMPLIMENTARY' AND NOT sec_pkg.has_permission(api_pkg.current_user_id, 'orders:approve-discount') THEN api_pkg.raise_forbidden('Complimentary entry requires manager authorization'); END IF;
    END IF;
    l_no := numbering_pkg.next_number('ENT', 'ENT');
    INSERT INTO club_entries (entry_number, branch_id, customer_id, guest_name, phone, guests, entry_type, cover_type_id, cover_amount, redeemable_amount, payment_method, host_user_id, table_id, notes, created_by)
    VALUES (l_no, api_pkg.current_branch_id, l_cust, l_name, l_phone, l_guests, l_type, l_cover, l_amt, l_red, CASE WHEN l_amt > 0 THEN l_method END, l_host, l_table, l_notes, api_pkg.current_user_id) RETURNING entry_id INTO l_id;
    IF l_type = 'VIP' THEN
      notify_pkg.create_notification('VIP_ARRIVAL', 'INFO', 'VIP arrived: ' || l_name, l_guests || ' guest(s)' || CASE WHEN l_table IS NOT NULL THEN ' · table assigned' END, 'CLUB_ENTRIES', l_id, 'MANAGER', NULL, NULL);
    END IF;
    audit_pkg.log('CLUB_CHECK_IN', 'CLUB_ENTRIES', l_id, NULL, l_type || ' ' || l_guests || ' cover ' || l_amt || ' ' || l_method);
    audit_pkg.emit_event('club', 'entry.checked_in', l_id);
    RETURN l_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_validation('Cover charge type is invalid', 'coverTypeId'); RETURN NULL;
  END;

  PROCEDURE check_out(p_id NUMBER) IS
  BEGIN
    sec_pkg.assert_permission('club:manage');
    UPDATE club_entries SET status = 'CHECKED_OUT', exited_at = SYSTIMESTAMP WHERE entry_id = p_id AND status = 'CHECKED_IN' AND branch_id = api_pkg.current_branch_id;
    IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_conflict('Entry is not checked in'); END IF;
    audit_pkg.log('CLUB_CHECK_OUT', 'CLUB_ENTRIES', p_id);
    audit_pkg.emit_event('club', 'entry.checked_out', p_id);
  END;

  PROCEDURE cancel_entry(p_id NUMBER, p_reason VARCHAR2) IS
    l_red NUMBER;
  BEGIN
    sec_pkg.assert_permission('club:manage');
    SELECT redeemed_amount INTO l_red FROM club_entries WHERE entry_id = p_id AND branch_id = api_pkg.current_branch_id FOR UPDATE;
    IF l_red > 0 THEN api_pkg.raise_business('Cover credit has already been used on a bill; reverse that payment first'); END IF;
    UPDATE club_entries SET status = 'CANCELLED', exited_at = SYSTIMESTAMP, notes = SUBSTR(NVL(notes, '') || ' [cancelled: ' || NVL(p_reason, '-') || ']', 1, 300) WHERE entry_id = p_id;
    audit_pkg.log('CLUB_ENTRY_CANCELLED', 'CLUB_ENTRIES', p_id, NULL, p_reason);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Entry not found');
  END;

  FUNCTION dashboard_json RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); l_day DATE := TRUNC(SYSDATE - 6/24); l_from DATE := l_day + 6/24; l_to DATE := l_day + 1 + 6/24;
    l_entries NUMBER; l_guests NUMBER; l_inside NUMBER; l_cover NUMBER; l_credit_used NUMBER; l_credit_open NUMBER; l_vip NUMBER; l_fnb NUMBER; byType JSON_ARRAY_T := JSON_ARRAY_T(); vips JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('club:view');
    SELECT COUNT(*), NVL(SUM(guests), 0), NVL(SUM(CASE WHEN status = 'CHECKED_IN' THEN guests ELSE 0 END), 0), NVL(SUM(CASE WHEN status <> 'CANCELLED' THEN cover_amount ELSE 0 END), 0),
           NVL(SUM(redeemed_amount), 0), NVL(SUM(CASE WHEN status = 'CHECKED_IN' THEN redeemable_amount - redeemed_amount ELSE 0 END), 0), SUM(CASE WHEN entry_type = 'VIP' THEN 1 ELSE 0 END)
      INTO l_entries, l_guests, l_inside, l_cover, l_credit_used, l_credit_open, l_vip
      FROM club_entries WHERE branch_id = api_pkg.current_branch_id AND entered_at >= l_from AND entered_at < l_to;
    SELECT NVL(SUM(grand_total), 0) INTO l_fnb FROM bills WHERE branch_id = api_pkg.current_branch_id AND status IN ('PAID','CLOSED') AND paid_at >= l_from AND paid_at < l_to;
    FOR r IN (SELECT entry_type, COUNT(*) cnt, NVL(SUM(guests), 0) g, NVL(SUM(cover_amount), 0) amt FROM club_entries WHERE branch_id = api_pkg.current_branch_id AND entered_at >= l_from AND entered_at < l_to AND status <> 'CANCELLED' GROUP BY entry_type) LOOP
      DECLARE o JSON_OBJECT_T := JSON_OBJECT_T(); BEGIN o.put('entryType', r.entry_type); o.put('entries', r.cnt); o.put('guests', r.g); o.put('coverRevenue', r.amt); byType.append(o); END;
    END LOOP;
    FOR v IN (SELECT vip_res_id FROM vip_reservations WHERE branch_id = api_pkg.current_branch_id AND res_date = TRUNC(SYSDATE - 6/24) AND status IN ('BOOKED','SEATED') ORDER BY status DESC, guest_name) LOOP
      vips.append(vip_pkg.vip_json(v.vip_res_id));
    END LOOP;
    j.put('businessDate', TO_CHAR(l_day, 'YYYY-MM-DD')); j.put('entries', l_entries); j.put('guestsTotal', l_guests); j.put('guestsInside', l_inside); j.put('coverRevenue', l_cover);
    j.put('coverCreditUsed', l_credit_used); j.put('coverCreditOpen', l_credit_open); j.put('vipEntries', l_vip); j.put('fnbRevenue', l_fnb); j.put('byEntryType', byType); j.put('vipTables', vips);
    j.put('recentEntries', list_entries_json(l_day, NULL));
    RETURN j;
  END;

  PROCEDURE redeem_cover(p_bill_id NUMBER, p_entry_id NUMBER, p_amount NUMBER) IS
    b bills%ROWTYPE; e club_entries%ROWTYPE; l_avail NUMBER; l_pay NUMBER; l_no VARCHAR2(30); l_amt NUMBER;
  BEGIN
    sec_pkg.assert_permission('billing:pay');
    SELECT * INTO b FROM bills WHERE bill_id = p_bill_id FOR UPDATE;
    IF b.status <> 'FINALIZED' THEN api_pkg.raise_business('Finalize the bill before applying cover credit'); END IF;
    SELECT * INTO e FROM club_entries WHERE entry_id = p_entry_id AND branch_id = b.branch_id FOR UPDATE;
    IF e.status <> 'CHECKED_IN' THEN api_pkg.raise_business('Entry is not checked in'); END IF;
    l_avail := e.redeemable_amount - e.redeemed_amount;
    l_amt := LEAST(NVL(p_amount, l_avail), l_avail, b.grand_total - b.paid_amount);
    IF l_amt <= 0 THEN api_pkg.raise_validation('No cover credit available for this entry', 'amount'); END IF;
    l_no := numbering_pkg.next_payment_number;
    INSERT INTO payments (payment_number, bill_id, payment_method, amount, reference_no, received_by) VALUES (l_no, p_bill_id, 'COVER_CREDIT', l_amt, e.entry_number, api_pkg.current_user_id) RETURNING payment_id INTO l_pay;
    INSERT INTO club_entry_redemptions (entry_id, bill_id, payment_id, amount) VALUES (p_entry_id, p_bill_id, l_pay, l_amt);
    UPDATE club_entries SET redeemed_amount = redeemed_amount + l_amt WHERE entry_id = p_entry_id;
    billing_pkg.refresh_payment_status(p_bill_id);
    audit_pkg.log('COVER_CREDIT_REDEEMED', 'BILLS', p_bill_id, NULL, e.entry_number || ' ' || l_amt);
    audit_pkg.emit_event('bills', 'payment.received', p_bill_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Bill or entry not found');
  END;

  PROCEDURE reverse_redemption(p_payment_id NUMBER) IS
  BEGIN
    FOR r IN (SELECT * FROM club_entry_redemptions WHERE payment_id = p_payment_id) LOOP
      UPDATE club_entries SET redeemed_amount = GREATEST(redeemed_amount - r.amount, 0) WHERE entry_id = r.entry_id;
    END LOOP;
  END;
END club_pkg;
/

-- ---------------------------------------------------------------------
-- VIP_PKG body (spec declared above CLUB_PKG, which uses vip_json)
CREATE OR REPLACE PACKAGE BODY vip_pkg AS
  FUNCTION current_spend(p_order_id NUMBER) RETURN NUMBER IS
    l NUMBER;
  BEGIN
    IF p_order_id IS NULL THEN RETURN 0; END IF;
    SELECT NVL(SUM(line_total), 0) INTO l FROM order_items WHERE order_id = p_order_id AND status <> 'CANCELLED';
    RETURN l;
  END;

  FUNCTION vip_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    FOR r IN (SELECT v.*, t.table_name, t.table_number, u.full_name host_name, o.order_number, o.status order_status FROM vip_reservations v JOIN dining_tables t ON t.table_id = v.table_id
                LEFT JOIN users u ON u.user_id = v.host_user_id LEFT JOIN orders o ON o.order_id = v.order_id WHERE v.vip_res_id = p_id) LOOP
      DECLARE l_spend NUMBER := current_spend(r.order_id);
      BEGIN
        j.put('id', r.vip_res_id); j.put('vipNumber', r.vip_number); j.put('branchId', r.branch_id); j.put('tableId', r.table_id); j.put('tableName', r.table_name); j.put('customerId', r.customer_id);
        j.put('guestName', r.guest_name); j.put('phone', r.phone); j.put('date', TO_CHAR(r.res_date, 'YYYY-MM-DD')); j.put('guests', r.guests); j.put('minSpend', r.min_spend); j.put('depositAmount', r.deposit_amount);
        j.put('depositPaid', r.deposit_paid = 'Y'); j.put('hostUserId', r.host_user_id); j.put('hostName', r.host_name); j.put('status', r.status); j.put('orderId', r.order_id); j.put('orderNumber', r.order_number);
        j.put('orderStatus', r.order_status); j.put('currentSpend', l_spend); j.put('remainingSpend', GREATEST(r.min_spend - l_spend, 0)); j.put('shortfallAmount', r.shortfall_amount); j.put('notes', r.notes); j.put('createdAt', api_pkg.ts_iso(r.created_at));
      END;
      RETURN j;
    END LOOP;
    api_pkg.raise_not_found('VIP reservation not found');
    RETURN NULL;
  END;

  FUNCTION vip_tables_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T(); l_day DATE := TRUNC(SYSDATE - 6/24);
  BEGIN
    sec_pkg.assert_permission('vip:view');
    FOR t IN (SELECT t.*, f.floor_name FROM dining_tables t JOIN floors f ON f.floor_id = t.floor_id WHERE t.branch_id = api_pkg.current_branch_id AND t.is_vip = 'Y' AND t.is_deleted = 'N' ORDER BY f.display_order, t.table_number) LOOP
      DECLARE j JSON_OBJECT_T := JSON_OBJECT_T(); l_res NUMBER;
      BEGIN
        j.put('tableId', t.table_id); j.put('tableName', t.table_name); j.put('floorName', t.floor_name); j.put('capacity', t.seating_capacity); j.put('status', t.status);
        j.put('minSpendDefault', t.min_spend_default); j.put('depositDefault', t.deposit_default);
        BEGIN
          SELECT vip_res_id INTO l_res FROM (SELECT vip_res_id FROM vip_reservations WHERE table_id = t.table_id AND res_date = l_day AND status IN ('BOOKED','SEATED') ORDER BY status DESC) WHERE ROWNUM = 1;
          j.put('booking', vip_json(l_res));
        EXCEPTION WHEN NO_DATA_FOUND THEN j.put_null('booking'); END;
        a.append(j);
      END;
    END LOOP;
    RETURN a;
  END;

  FUNCTION list_json(p_date DATE, p_status VARCHAR2) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('vip:view');
    FOR r IN (SELECT vip_res_id FROM vip_reservations WHERE branch_id = api_pkg.current_branch_id AND (p_date IS NULL OR res_date = p_date) AND (p_status IS NULL OR status = p_status) ORDER BY res_date DESC, guest_name) LOOP
      a.append(vip_json(r.vip_res_id));
    END LOOP;
    RETURN a;
  END;

  FUNCTION save_vip(p_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER := p_id; l_table NUMBER := p_body.get_number('tableId'); l_name VARCHAR2(150) := TRIM(p_body.get_string('guestName')); l_phone VARCHAR2(30) := p_body.get_string('phone');
    l_date DATE := TO_DATE(p_body.get_string('date'), 'YYYY-MM-DD'); l_guests NUMBER := NVL(p_body.get_number('guests'), 1); l_min NUMBER := p_body.get_number('minSpend'); l_dep NUMBER := p_body.get_number('depositAmount');
    l_dep_paid CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('depositPaid'), FALSE)); l_host NUMBER := p_body.get_number('hostUserId'); l_cust NUMBER := p_body.get_number('customerId'); l_notes VARCHAR2(500) := p_body.get_string('notes');
    t dining_tables%ROWTYPE; l_cnt NUMBER; l_no VARCHAR2(30);
  BEGIN
    sec_pkg.assert_permission('vip:manage');
    IF l_name IS NULL OR l_date IS NULL THEN api_pkg.raise_validation('Guest name and date are required', 'guestName'); END IF;
    SELECT * INTO t FROM dining_tables WHERE table_id = l_table AND branch_id = api_pkg.current_branch_id AND is_deleted = 'N';
    IF t.is_vip = 'N' THEN api_pkg.raise_validation('Selected table is not a VIP table', 'tableId'); END IF;
    l_min := NVL(l_min, t.min_spend_default); l_dep := NVL(l_dep, t.deposit_default);
    IF l_min < 0 OR l_dep < 0 THEN api_pkg.raise_validation('Amounts cannot be negative', 'minSpend'); END IF;
    SELECT COUNT(*) INTO l_cnt FROM vip_reservations WHERE table_id = l_table AND res_date = l_date AND status IN ('BOOKED','SEATED') AND (p_id IS NULL OR vip_res_id <> p_id);
    IF l_cnt > 0 THEN api_pkg.raise_conflict('This VIP table is already booked for that date'); END IF;
    IF l_id IS NULL THEN
      l_no := numbering_pkg.next_number('VIP', 'VIP');
      INSERT INTO vip_reservations (vip_number, branch_id, table_id, customer_id, guest_name, phone, res_date, guests, min_spend, deposit_amount, deposit_paid, host_user_id, notes, created_by)
      VALUES (l_no, api_pkg.current_branch_id, l_table, l_cust, l_name, l_phone, l_date, l_guests, l_min, l_dep, l_dep_paid, l_host, l_notes, api_pkg.current_user_id) RETURNING vip_res_id INTO l_id;
    ELSE
      UPDATE vip_reservations SET table_id = l_table, customer_id = l_cust, guest_name = l_name, phone = l_phone, res_date = l_date, guests = l_guests, min_spend = l_min, deposit_amount = l_dep, deposit_paid = l_dep_paid,
             host_user_id = l_host, notes = l_notes, updated_at = SYSTIMESTAMP WHERE vip_res_id = l_id AND branch_id = api_pkg.current_branch_id AND status IN ('BOOKED','SEATED');
      IF SQL%ROWCOUNT = 0 THEN api_pkg.raise_not_found('Open VIP reservation not found'); END IF;
    END IF;
    audit_pkg.log(CASE WHEN p_id IS NULL THEN 'VIP_CREATED' ELSE 'VIP_UPDATED' END, 'VIP_RESERVATIONS', l_id, NULL, p_body.to_clob);
    audit_pkg.emit_event('club', 'vip.saved', l_id);
    RETURN l_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_validation('Table is invalid', 'tableId'); RETURN NULL;
  END;

  -- SEAT (creates the order on the VIP table) | COMPLETE | CANCEL | NO_SHOW
  PROCEDURE transition(p_id NUMBER, p_action VARCHAR2, p_reason VARCHAR2) IS
    v vip_reservations%ROWTYPE; l_order NUMBER; body JSON_OBJECT_T; l_new VARCHAR2(20);
  BEGIN
    sec_pkg.assert_permission('vip:manage');
    SELECT * INTO v FROM vip_reservations WHERE vip_res_id = p_id AND branch_id = api_pkg.current_branch_id FOR UPDATE;
    CASE p_action
      WHEN 'SEAT' THEN
        IF v.status <> 'BOOKED' THEN api_pkg.raise_conflict('Reservation is ' || LOWER(v.status)); END IF;
        body := JSON_OBJECT_T(); body.put('tableId', v.table_id); body.put('guestCount', v.guests); body.put('notes', 'VIP ' || v.vip_number || ' · min spend ' || v.min_spend);
        l_order := order_pkg.create_order(body);
        UPDATE orders SET customer_id = v.customer_id, vip_res_id = p_id WHERE order_id = l_order;
        UPDATE vip_reservations SET status = 'SEATED', order_id = l_order, updated_at = SYSTIMESTAMP WHERE vip_res_id = p_id; l_new := 'SEATED';
      WHEN 'COMPLETE' THEN IF v.status <> 'SEATED' THEN api_pkg.raise_conflict('Only seated reservations can be completed'); END IF;
        UPDATE vip_reservations SET status = 'COMPLETED', updated_at = SYSTIMESTAMP WHERE vip_res_id = p_id; l_new := 'COMPLETED';
      WHEN 'CANCEL' THEN IF v.status IN ('COMPLETED','CANCELLED') THEN api_pkg.raise_conflict('Reservation already closed'); END IF;
        UPDATE vip_reservations SET status = 'CANCELLED', notes = SUBSTR(NVL(notes, '') || ' [cancelled: ' || NVL(p_reason, '-') || ']', 1, 500), updated_at = SYSTIMESTAMP WHERE vip_res_id = p_id; l_new := 'CANCELLED';
      WHEN 'NO_SHOW' THEN IF v.status <> 'BOOKED' THEN api_pkg.raise_conflict('Only booked reservations can be marked no-show'); END IF;
        UPDATE vip_reservations SET status = 'NO_SHOW', updated_at = SYSTIMESTAMP WHERE vip_res_id = p_id; l_new := 'NO_SHOW';
      ELSE api_pkg.raise_validation('Unknown action ' || p_action, 'action');
    END CASE;
    audit_pkg.log('VIP_' || p_action, 'VIP_RESERVATIONS', p_id, v.status, l_new);
    audit_pkg.emit_event('club', 'vip.status', p_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('VIP reservation not found');
  END;

  FUNCTION spend_json(p_id NUMBER) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := vip_json(p_id); b branches%ROWTYPE; l_spend NUMBER := j.get_number('currentSpend'); l_min NUMBER := j.get_number('minSpend'); l_short NUMBER;
  BEGIN
    sec_pkg.assert_permission('vip:view');
    SELECT * INTO b FROM branches WHERE branch_id = api_pkg.current_branch_id;
    l_short := CASE WHEN l_spend >= l_min THEN 0 WHEN b.min_spend_shortfall_mode = 'CHARGE_DIFFERENCE' THEN l_min - l_spend WHEN b.min_spend_shortfall_mode = 'FLAT_FEE' THEN b.min_spend_flat_fee ELSE 0 END;
    j.put('shortfallMode', b.min_spend_shortfall_mode); j.put('projectedShortfall', ROUND(l_short, 2)); j.put('percentReached', CASE WHEN l_min > 0 THEN LEAST(ROUND(l_spend * 100 / l_min, 1), 100) ELSE 100 END);
    RETURN j;
  END;

  FUNCTION shortfall_for_order(p_order_id NUMBER, p_net_amount NUMBER) RETURN NUMBER IS
    v vip_reservations%ROWTYPE; b branches%ROWTYPE;
  BEGIN
    SELECT * INTO v FROM vip_reservations WHERE order_id = p_order_id AND status IN ('SEATED','COMPLETED');
    IF v.min_spend <= 0 OR p_net_amount >= v.min_spend THEN RETURN 0; END IF;
    SELECT * INTO b FROM branches WHERE branch_id = v.branch_id;
    RETURN CASE b.min_spend_shortfall_mode WHEN 'CHARGE_DIFFERENCE' THEN ROUND(v.min_spend - p_net_amount, 2) WHEN 'FLAT_FEE' THEN b.min_spend_flat_fee ELSE 0 END;
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN 0;
  END;

  PROCEDURE on_bill_closed(p_order_id NUMBER) IS
  BEGIN
    UPDATE vip_reservations SET status = 'COMPLETED', updated_at = SYSTIMESTAMP WHERE order_id = p_order_id AND status = 'SEATED';
  END;
END vip_pkg;
/

-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE bottle_pkg AS
  FUNCTION list_json RETURN JSON_ARRAY_T;
  FUNCTION save(p_item_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE remove(p_item_id NUMBER);
END bottle_pkg;
/
CREATE OR REPLACE PACKAGE BODY bottle_pkg AS
  FUNCTION list_json RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('menu:view');
    FOR r IN (SELECT b.*, mi.item_name, mi.current_price, mi.is_available, ii.item_name inv_name, ii.current_qty FROM bottle_service_items b JOIN menu_items mi ON mi.item_id = b.item_id LEFT JOIN inventory_items ii ON ii.inv_item_id = b.inv_item_id
               WHERE mi.branch_id = api_pkg.current_branch_id AND mi.is_deleted = 'N' ORDER BY mi.item_name) LOOP
      DECLARE j JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN
        j.put('id', r.bs_item_id); j.put('menuItemId', r.item_id); j.put('menuItemName', r.item_name); j.put('price', r.current_price); j.put('isAvailable', r.is_available = 'Y');
        j.put('bottleSizeMl', r.bottle_size_ml); j.put('invItemId', r.inv_item_id); j.put('invItemName', r.inv_name); j.put('bottlesInStock', r.current_qty); j.put('includes', r.includes); j.put('isActive', r.is_active = 'Y');
        a.append(j);
      END;
    END LOOP;
    RETURN a;
  END;

  FUNCTION save(p_item_id NUMBER, p_body JSON_OBJECT_T) RETURN NUMBER IS
    l_id NUMBER; l_size NUMBER := p_body.get_number('bottleSizeMl'); l_inv NUMBER := p_body.get_number('invItemId'); l_inc VARCHAR2(500) := p_body.get_string('includes');
    l_active CHAR(1) := api_pkg.yn(NVL(p_body.get_boolean('isActive'), TRUE)); l_cnt NUMBER;
  BEGIN
    sec_pkg.assert_permission('menu:manage');
    IF l_size IS NULL OR l_size <= 0 THEN api_pkg.raise_validation('Bottle size (ml) is required', 'bottleSizeMl'); END IF;
    SELECT COUNT(*) INTO l_cnt FROM menu_items WHERE item_id = p_item_id AND is_deleted = 'N';
    IF l_cnt = 0 THEN api_pkg.raise_not_found('Menu item not found'); END IF;
    BEGIN
      SELECT bs_item_id INTO l_id FROM bottle_service_items WHERE item_id = p_item_id;
      UPDATE bottle_service_items SET bottle_size_ml = l_size, inv_item_id = l_inv, includes = l_inc, is_active = l_active WHERE bs_item_id = l_id;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      INSERT INTO bottle_service_items (item_id, bottle_size_ml, inv_item_id, includes, is_active) VALUES (p_item_id, l_size, l_inv, l_inc, l_active) RETURNING bs_item_id INTO l_id;
    END;
    audit_pkg.log('BOTTLE_SERVICE_SAVED', 'BOTTLE_SERVICE_ITEMS', l_id, NULL, p_body.to_clob);
    RETURN l_id;
  END;

  PROCEDURE remove(p_item_id NUMBER) IS
  BEGIN
    sec_pkg.assert_permission('menu:manage');
    UPDATE bottle_service_items SET is_active = 'N' WHERE item_id = p_item_id;
    audit_pkg.log('BOTTLE_SERVICE_REMOVED', 'BOTTLE_SERVICE_ITEMS', p_item_id);
  END;
END bottle_pkg;
/

-- ---------------------------------------------------------------------
-- PMS adapter: single seam for hotel systems. SIMULATED provider ships with Phase 2;
-- add OPERA / custom providers by extending the CASE in verify_room / post_charge.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE pms_adapter_pkg AS
  FUNCTION verify_room(p_provider VARCHAR2, p_room_no VARCHAR2) RETURN JSON_OBJECT_T;   -- {found, roomNo, guestName, checkedIn}
  FUNCTION post_charge(p_provider VARCHAR2, p_room_no VARCHAR2, p_guest VARCHAR2, p_amount NUMBER, p_reference VARCHAR2) RETURN JSON_OBJECT_T;  -- {success, pmsReference, error}
  FUNCTION reverse_charge(p_provider VARCHAR2, p_pms_reference VARCHAR2) RETURN JSON_OBJECT_T;
END pms_adapter_pkg;
/
CREATE OR REPLACE PACKAGE BODY pms_adapter_pkg AS
  FUNCTION verify_room(p_provider VARCHAR2, p_room_no VARCHAR2) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); l_room VARCHAR2(20) := UPPER(TRIM(p_room_no));
  BEGIN
    CASE p_provider
      WHEN 'SIMULATED' THEN
        -- rooms 101-599 exist; rooms ending in 0 are vacant; guest name derived deterministically
        IF REGEXP_LIKE(l_room, '^[1-5][0-9]{2}$') THEN
          j.put('found', TRUE); j.put('roomNo', l_room); j.put('checkedIn', SUBSTR(l_room, -1) <> '0');
          j.put('guestName', CASE WHEN SUBSTR(l_room, -1) <> '0' THEN 'Guest ' || l_room || ' (' || CASE MOD(TO_NUMBER(l_room), 5) WHEN 0 THEN 'Sharma' WHEN 1 THEN 'Khan' WHEN 2 THEN 'Fernandes' WHEN 3 THEN 'Patel' ELSE 'Rao' END || ')' END);
        ELSE
          j.put('found', FALSE); j.put('roomNo', l_room); j.put('checkedIn', FALSE); j.put_null('guestName');
        END IF;
      ELSE
        j.put('found', FALSE); j.put('roomNo', l_room); j.put('checkedIn', FALSE); j.put('error', 'PMS provider ' || p_provider || ' is not configured');
    END CASE;
    RETURN j;
  END;

  FUNCTION post_charge(p_provider VARCHAR2, p_room_no VARCHAR2, p_guest VARCHAR2, p_amount NUMBER, p_reference VARCHAR2) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T(); v JSON_OBJECT_T;
  BEGIN
    CASE p_provider
      WHEN 'SIMULATED' THEN
        v := verify_room(p_provider, p_room_no);
        IF v.get_boolean('found') AND v.get_boolean('checkedIn') THEN
          j.put('success', TRUE); j.put('pmsReference', 'SIM-' || UPPER(TRIM(p_room_no)) || '-' || TO_CHAR(SYSTIMESTAMP, 'YYYYMMDDHH24MISS'));
        ELSE
          j.put('success', FALSE); j.put('error', 'Room ' || p_room_no || ' is not occupied');
        END IF;
      ELSE
        j.put('success', FALSE); j.put('error', 'PMS provider ' || p_provider || ' is not configured');
    END CASE;
    RETURN j;
  END;

  FUNCTION reverse_charge(p_provider VARCHAR2, p_pms_reference VARCHAR2) RETURN JSON_OBJECT_T IS
    j JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    j.put('success', p_provider = 'SIMULATED'); IF p_provider <> 'SIMULATED' THEN j.put('error', 'PMS provider not configured'); END IF;
    RETURN j;
  END;
END pms_adapter_pkg;
/

CREATE OR REPLACE PACKAGE room_charge_pkg AS
  FUNCTION verify_room(p_room_no VARCHAR2) RETURN JSON_OBJECT_T;
  PROCEDURE post_to_room(p_bill_id NUMBER, p_room_no VARCHAR2, p_guest_name VARCHAR2, p_amount NUMBER);
  PROCEDURE reverse(p_payment_id NUMBER);
  FUNCTION list_json(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_ARRAY_T;
END room_charge_pkg;
/
CREATE OR REPLACE PACKAGE BODY room_charge_pkg AS
  FUNCTION provider RETURN VARCHAR2 IS
    l VARCHAR2(30);
  BEGIN
    SELECT pms_provider INTO l FROM branches WHERE branch_id = api_pkg.current_branch_id;
    RETURN l;
  END;

  FUNCTION verify_room(p_room_no VARCHAR2) RETURN JSON_OBJECT_T IS
  BEGIN
    sec_pkg.assert_permission('room-charge:post');
    IF TRIM(p_room_no) IS NULL THEN api_pkg.raise_validation('Room number is required', 'roomNo'); END IF;
    RETURN pms_adapter_pkg.verify_room(provider, p_room_no);
  END;

  -- Order → Bill → CHARGE TO ROOM → verify → post (adapter) → payment ROOM_CHARGE + room_charges row
  PROCEDURE post_to_room(p_bill_id NUMBER, p_room_no VARCHAR2, p_guest_name VARCHAR2, p_amount NUMBER) IS
    b bills%ROWTYPE; l_amt NUMBER; res JSON_OBJECT_T; l_pay NUMBER; l_no VARCHAR2(30); l_rc NUMBER;
  BEGIN
    sec_pkg.assert_permission('room-charge:post');
    SELECT * INTO b FROM bills WHERE bill_id = p_bill_id FOR UPDATE;
    IF b.status <> 'FINALIZED' THEN api_pkg.raise_business('Finalize the bill before charging to a room'); END IF;
    IF TRIM(p_room_no) IS NULL OR TRIM(p_guest_name) IS NULL THEN api_pkg.raise_validation('Room number and guest name are required', 'roomNo'); END IF;
    l_amt := NVL(p_amount, b.grand_total - b.paid_amount);
    IF l_amt <= 0 OR l_amt > b.grand_total - b.paid_amount + 0.005 THEN api_pkg.raise_validation('Amount must be positive and within the balance due', 'amount'); END IF;
    INSERT INTO room_charges (bill_id, room_no, guest_name, pms_provider, amount, status, created_by) VALUES (p_bill_id, UPPER(TRIM(p_room_no)), TRIM(p_guest_name), provider, l_amt, 'PENDING', api_pkg.current_user_id) RETURNING room_charge_id INTO l_rc;
    res := pms_adapter_pkg.post_charge(provider, p_room_no, p_guest_name, l_amt, b.bill_number);
    IF NOT res.get_boolean('success') THEN
      UPDATE room_charges SET status = 'FAILED', failure_reason = res.get_string('error') WHERE room_charge_id = l_rc;
      audit_pkg.log('ROOM_CHARGE_FAILED', 'BILLS', p_bill_id, NULL, res.get_string('error'));
      api_pkg.raise_business('Room charge failed: ' || res.get_string('error'));
    END IF;
    l_no := numbering_pkg.next_payment_number;
    INSERT INTO payments (payment_number, bill_id, payment_method, amount, reference_no, received_by) VALUES (l_no, p_bill_id, 'ROOM_CHARGE', l_amt, 'Room ' || UPPER(TRIM(p_room_no)), api_pkg.current_user_id) RETURNING payment_id INTO l_pay;
    UPDATE room_charges SET status = 'POSTED', payment_id = l_pay, pms_reference = res.get_string('pmsReference'), posted_at = SYSTIMESTAMP WHERE room_charge_id = l_rc;
    billing_pkg.refresh_payment_status(p_bill_id);
    audit_pkg.log('ROOM_CHARGE_POSTED', 'BILLS', p_bill_id, NULL, 'Room ' || p_room_no || ' ' || l_amt || ' ref ' || res.get_string('pmsReference'));
    audit_pkg.emit_event('bills', 'payment.received', p_bill_id);
  EXCEPTION WHEN NO_DATA_FOUND THEN api_pkg.raise_not_found('Bill not found');
  END;

  PROCEDURE reverse(p_payment_id NUMBER) IS
    res JSON_OBJECT_T;
  BEGIN
    FOR r IN (SELECT * FROM room_charges WHERE payment_id = p_payment_id AND status = 'POSTED') LOOP
      res := pms_adapter_pkg.reverse_charge(r.pms_provider, r.pms_reference);
      UPDATE room_charges SET status = 'REVERSED', failure_reason = CASE WHEN res.get_boolean('success') THEN NULL ELSE res.get_string('error') END WHERE room_charge_id = r.room_charge_id;
    END LOOP;
  END;

  FUNCTION list_json(p_from TIMESTAMP, p_to TIMESTAMP) RETURN JSON_ARRAY_T IS
    a JSON_ARRAY_T := JSON_ARRAY_T();
  BEGIN
    sec_pkg.assert_permission('billing:view');
    FOR r IN (SELECT rc.*, b.bill_number FROM room_charges rc JOIN bills b ON b.bill_id = rc.bill_id WHERE b.branch_id = api_pkg.current_branch_id AND (p_from IS NULL OR rc.created_at >= p_from) AND (p_to IS NULL OR rc.created_at <= p_to) ORDER BY rc.created_at DESC) LOOP
      DECLARE j JSON_OBJECT_T := JSON_OBJECT_T();
      BEGIN j.put('id', r.room_charge_id); j.put('billId', r.bill_id); j.put('billNumber', r.bill_number); j.put('roomNo', r.room_no); j.put('guestName', r.guest_name); j.put('amount', r.amount); j.put('status', r.status); j.put('pmsProvider', r.pms_provider); j.put('pmsReference', r.pms_reference); j.put('postedAt', api_pkg.ts_iso(r.posted_at)); j.put('failureReason', r.failure_reason); a.append(j); END;
    END LOOP;
    RETURN a;
  END;
END room_charge_pkg;
/
