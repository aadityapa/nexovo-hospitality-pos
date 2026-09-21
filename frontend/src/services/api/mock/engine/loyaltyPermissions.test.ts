/**
 * LOYALTY PERMISSION BOUNDARIES
 *
 * `loyalty:manage` used to mean both "adjust this member's points" and "rewrite the program's
 * rules". They are now separate grants, and a manager holds only the first.
 *
 * These tests exercise the ENGINE, not the screen. That is the point: the question worth
 * answering is not whether the button is hidden — it is whether a manager who sends the request
 * anyway is refused. Every case below calls the engine function the API dispatches to, with a
 * context carrying a real seeded user, exactly as a direct HTTP request would arrive.
 *
 * The Oracle package asserts the same permissions in `loyalty_pkg.save_program` (configure) and
 * `loyalty_pkg.adjust` (manage), and `router2_pkg` repeats them on the routes — so this file and
 * `database/09c_pkg_crm_loyalty.sql` have to be changed together or the two backends disagree.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSeedDb, type MockDb } from '../db';
import type { Ctx } from './context';
import * as crm from './p2/crm';
import { ROLE_PERMISSIONS } from '@/config/permissions';
import { ApiError } from '../../client';

let db: MockDb;
const ctx = (username: string | null, branchId = 1): Ctx => ({
  db,
  user: username ? db.users.find((u) => u.username === username)! : null,
  branchId,
  emit: () => {},
});

/*
 * This engine's error contract (see `errors` in ./context.ts):
 *   400 field validation   401 unauthenticated   403 forbidden   404 not found
 *   409 conflict           422 business rule
 * A rejected FIELD is 400; a rejected OPERATION is 422. The cases below were first written
 * expecting 422 for validation, which was wrong about the contract rather than about the code.
 */
const expectStatus = (fn: () => unknown, status: number) => {
  let err: unknown = null;
  try { fn(); } catch (e) { err = e; }
  expect(err, `expected ApiError ${status}, got ${String(err)}`).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(status);
};

/**
 * A guest to work with.
 *
 * The seed ships NO customers — the CRM starts empty, which is correct for a fresh install and
 * which is why this cannot just read `customers[0]`. So each test creates its own through the
 * real engine function, with the real `customers:manage` permission the manager holds. That also
 * means these tests never depend on demo data staying the same shape.
 */
let guestSeq = 0;
const newCustomer = (as = 'manager') => {
  guestSeq += 1;
  // Unique phone per guest: the CRM rejects a duplicate, and two guests in one test is normal.
  return crm.saveCustomer(ctx(as), null, {
    fullName: `Test Guest ${guestSeq}`,
    phone: `+91 90000 ${String(10000 + guestSeq).slice(-5)}`,
    consentMarketing: false,
  }).id;
};

beforeEach(() => { db = createSeedDb(); guestSeq = 0; });

// ---------------------------------------------------------------------------
// The grants themselves
// ---------------------------------------------------------------------------
describe('the seeded grants', () => {
  it('gives the manager member operations but not program configuration', () => {
    const m = ROLE_PERMISSIONS.MANAGER;
    expect(m).toContain('loyalty:view');
    expect(m).toContain('loyalty:manage');
    expect(m).toContain('loyalty:redeem');
    expect(m).not.toContain('loyalty:configure');
  });

  it('keeps program configuration with the administrators', () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain('loyalty:configure');
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain('loyalty:configure');
  });

  /* The cashier redeems points at the till; they never managed members and must not start now. */
  it('leaves the cashier with view and redeem only', () => {
    const c = ROLE_PERMISSIONS.CASHIER;
    expect(c).toContain('loyalty:view');
    expect(c).toContain('loyalty:redeem');
    expect(c).not.toContain('loyalty:manage');
    expect(c).not.toContain('loyalty:configure');
  });
});

// ---------------------------------------------------------------------------
// A manager CAN read the rules
// ---------------------------------------------------------------------------
describe('a manager can view the program', () => {
  it('returns the program to a manager', () => {
    const p = crm.program(ctx('manager'));
    expect(p.pointsPer100).toBeGreaterThanOrEqual(0);
    expect(p.memberCount).toBe(db.p2.loyaltyAccounts.length);
  });
});

// ---------------------------------------------------------------------------
// A manager CANNOT change the configuration — including by calling the API directly
// ---------------------------------------------------------------------------
describe('a manager cannot configure the program', () => {
  it('refuses a direct saveProgram call with 403', () => {
    expectStatus(() => crm.saveProgram(ctx('manager'), { pointsPer100: 999 }), 403);
  });

  it('leaves every program value untouched after the refusal', () => {
    const before = { ...db.p2.loyaltyProgram };
    expectStatus(() => crm.saveProgram(ctx('manager'), {
      name: 'Rewritten', pointsPer100: 999, pointValue: 99, minRedeemPoints: 0, maxRedeemPercent: 100, expiryDays: 0, isActive: false,
    }), 403);
    expect(db.p2.loyaltyProgram).toEqual(before);
  });

  /* The refusal must happen BEFORE validation, or an attacker learns which values are accepted
     by reading which error comes back. A rejected caller gets 403 for valid and invalid bodies
     alike. */
  it('refuses before validating the body, so the error does not leak the rules', () => {
    expectStatus(() => crm.saveProgram(ctx('manager'), { maxRedeemPercent: 500 }), 403);
  });

  it('refuses a cashier and an unauthenticated caller too', () => {
    expectStatus(() => crm.saveProgram(ctx('cashier'), { pointsPer100: 5 }), 403);
    expectStatus(() => crm.saveProgram(ctx(null), { pointsPer100: 5 }), 401);
  });
});

// ---------------------------------------------------------------------------
// An administrator CAN
// ---------------------------------------------------------------------------
describe('an administrator can configure the program', () => {
  it('saves and returns the new rules', () => {
    const out = crm.saveProgram(ctx('admin'), { pointsPer100: 7, pointValue: 0.5 });
    expect(out.pointsPer100).toBe(7);
    expect(out.pointValue).toBe(0.5);
    expect(db.p2.loyaltyProgram.pointsPer100).toBe(7);
  });

  it('still validates the body for someone who is allowed', () => {
    expectStatus(() => crm.saveProgram(ctx('admin'), { maxRedeemPercent: 500 }), 400);
  });
});

// ---------------------------------------------------------------------------
// Member operations stay with the manager
// ---------------------------------------------------------------------------
describe('a manager can still adjust a member', () => {
  it('posts a positive adjustment and moves the balance', () => {
    const id = newCustomer();
    const before = crm.accountJson(ctx('manager'), id).pointsBalance;
    crm.adjust(ctx('manager'), id, 250, 'Service recovery — spilled wine');
    expect(crm.accountJson(ctx('manager'), id).pointsBalance).toBe(before + 250);
  });

  /* An adjustment is a financial act. The reason is what makes it auditable, so it is required
     and enforced by the engine, not by the form. */
  it('requires a reason', () => {
    expectStatus(() => crm.adjust(ctx('manager'), newCustomer(), 100, '   '), 400);
  });

  it('rejects a zero adjustment', () => {
    expectStatus(() => crm.adjust(ctx('manager'), newCustomer(), 0, 'Nothing'), 400);
  });

  it('will not drive a balance negative', () => {
    const id = newCustomer();
    const bal = crm.accountJson(ctx('manager'), id).pointsBalance;
    expectStatus(() => crm.adjust(ctx('manager'), id, -(bal + 1), 'Too much'), 400);
    expect(crm.accountJson(ctx('manager'), id).pointsBalance).toBe(bal);
  });

  /* `audit()` unshifts, so the newest entry is index 0 — asserting the tail would silently
     test the oldest record in the seed and pass for the wrong reason. */
  it('writes an audit record naming the actor', () => {
    const id = newCustomer();
    const before = db.audit.length;
    crm.adjust(ctx('manager'), id, 50, 'Goodwill');
    expect(db.audit.length).toBe(before + 1);
    const entry = db.audit[0];
    expect(entry.action).toBe('LOYALTY_ADJUST');
    expect(entry.userId).toBe(db.users.find((u) => u.username === 'manager')!.id);
    expect(entry.newValue).toContain('Goodwill');
  });

  it('refuses an adjustment from a role without loyalty:manage', () => {
    expectStatus(() => crm.adjust(ctx('cashier'), newCustomer(), 100, 'Nope'), 403);
    expectStatus(() => crm.adjust(ctx('waiter1'), newCustomer(), 100, 'Nope'), 403);
  });
});

// ---------------------------------------------------------------------------
// The split did not weaken anything else
// ---------------------------------------------------------------------------
describe('the actor is resolved per request, not assumed', () => {
  /*
   * Customers and their loyalty accounts are ORGANISATION-wide by design — a guest is the same
   * guest at every outlet — so there is no branch filter to assert here, and pretending otherwise
   * would be a test that passes by describing the wrong system. What must hold is that the audit
   * trail names whoever actually made each adjustment, including when the same customer is
   * touched from two branches in turn.
   */
  it('names a different actor for each adjustment', () => {
    const id = newCustomer();
    crm.adjust(ctx('manager', 1), id, 10, 'From the main branch');
    const first = db.audit[0];
    crm.adjust(ctx('admin', 2), id, 10, 'From the second branch');
    const second = db.audit[0];

    expect(first.userId).toBe(db.users.find((u) => u.username === 'manager')!.id);
    expect(second.userId).toBe(db.users.find((u) => u.username === 'admin')!.id);
    expect(second.userId).not.toBe(first.userId);
  });
});
