/**
 * Transport lifecycle tests for the realtime providers.
 *
 * Named `.test.tsx` so it picks up the happy-dom environment (see `environmentMatchGlobs` in
 * vite.config.ts) — these need `window`, `document.hidden`, timers and `BroadcastChannel`.
 *
 * The defect under test: an in-flight poll could resolve AFTER `disconnect()`, dispatch its
 * events and mark the provider `connected` again — a disconnected board would quietly claim to
 * be live. The fix is a generation counter bumped on every connect and disconnect; a response
 * whose generation no longer matches is dropped whole.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PollingRealtime } from './pollingRealtime';
import { BroadcastRealtime } from './broadcastRealtime';
import { StatusBus } from './types';
import type { RealtimeEvent } from './types';

// --- test doubles -----------------------------------------------------------
// `api()` and the auth store are the provider's only outside dependencies.
let pending: { resolve: (v: RealtimeEvent[]) => void; reject: (e: unknown) => void }[] = [];
let getCalls = 0;

vi.mock('@/services/api', () => ({
  api: () => ({
    get: () => {
      getCalls += 1;
      return new Promise<RealtimeEvent[]>((resolve, reject) => { pending.push({ resolve, reject }); });
    },
  }),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: { getState: () => ({ token: 'test-token' }) },
}));

const evt = (at: string): RealtimeEvent => ({ topic: 'orders', type: 'order.updated', at });
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { pending = []; getCalls = 0; });
afterEach(() => { vi.useRealTimers(); });

// ---------------------------------------------------------------------------
describe('PollingRealtime lifecycle', () => {
  it('disconnect during a pending request: the late response is ignored entirely', async () => {
    const p = new PollingRealtime(5_000);
    const seen: RealtimeEvent[] = [];
    p.subscribe('orders', (e) => seen.push(e));

    p.connect();
    expect(getCalls, 'connect polls immediately').toBe(1);
    expect(p.getStatus().status).toBe('connecting');

    // Operator navigates away / the component unmounts while the poll is still open.
    p.disconnect();
    expect(p.getStatus().status).toBe('offline');

    // The request now resolves with real events.
    pending[0].resolve([evt('2026-01-01T10:00:00.000Z')]);
    await settle();

    expect(seen, 'no events may be dispatched after disconnect').toHaveLength(0);
    expect(p.getStatus().status, 'a late response must not resurrect the connection').toBe('offline');
    expect(p.getStatus().lastSyncAt, 'and must not claim a successful sync').toBeNull();
    expect(p.getStatus().lastEventAt).toBeNull();
  });

  it('disconnect during a pending request: a late FAILURE is ignored too', async () => {
    const p = new PollingRealtime(5_000);
    p.connect();
    p.disconnect();
    pending[0].reject(new Error('network'));
    await settle();
    // Still offline — but for the right reason, and the failure counter of a dead run
    // must not leak into the next connect().
    expect(p.getStatus().status).toBe('offline');
  });

  it('reconnect after a disconnect works, and the stale run cannot interfere', async () => {
    const p = new PollingRealtime(5_000);
    const seen: RealtimeEvent[] = [];
    p.subscribe('orders', (e) => seen.push(e));

    p.connect();
    const stale = pending[0];
    p.disconnect();

    p.connect();                                   // new run
    expect(getCalls).toBe(2);
    const fresh = pending[1];

    // The obsolete request answers first…
    stale.resolve([evt('2026-01-01T09:00:00.000Z')]);
    await settle();
    expect(seen, 'stale run must stay silent').toHaveLength(0);
    expect(p.getStatus().status).toBe('connecting');

    // …then the current one answers and is honoured.
    fresh.resolve([evt('2026-01-01T11:00:00.000Z')]);
    await settle();
    expect(seen.map((e) => e.at)).toEqual(['2026-01-01T11:00:00.000Z']);
    expect(p.getStatus().status).toBe('connected');
    expect(p.getStatus().lastEventAt).toBe('2026-01-01T11:00:00.000Z');

    p.disconnect();
  });

  it('a stale in-flight request does not block the new run from polling', async () => {
    const p = new PollingRealtime(5_000);
    p.connect();
    p.disconnect();          // request 1 still open
    p.connect();             // must issue request 2 rather than see inFlight === true
    expect(getCalls).toBe(2);
    p.disconnect();
  });

  it('an empty 200 marks a sync but leaves lastEventAt alone (idle ≠ stale)', async () => {
    const p = new PollingRealtime(5_000);
    p.connect();
    pending[0].resolve([evt('2026-01-01T10:00:00.000Z')]);
    await settle();
    const afterEvent = p.getStatus();
    expect(afterEvent.status).toBe('connected');
    expect(afterEvent.lastEventAt).toBe('2026-01-01T10:00:00.000Z');

    // A quiet interval: the server answers 200 with nothing to report.
    (p as unknown as { tick: () => Promise<void> }).tick();
    await settle();
    pending[1].resolve([]);
    await settle();

    const idle = p.getStatus();
    expect(idle.status, 'still connected — an empty poll proves the link').toBe('connected');
    expect(idle.lastEventAt, 'business-event clock must not move').toBe(afterEvent.lastEventAt);
    expect(idle.lastSyncAt, 'sync clock must move').not.toBe(afterEvent.lastSyncAt);
    p.disconnect();
  });

  it('goes offline only on the SECOND consecutive failure', async () => {
    const p = new PollingRealtime(5_000);
    p.connect();
    pending[0].reject(new Error('blip'));
    await settle();
    expect(p.getStatus().status, 'one dropped poll is a blip').toBe('connecting');

    (p as unknown as { tick: () => Promise<void> }).tick();
    await settle();
    pending[1].reject(new Error('still down'));
    await settle();
    expect(p.getStatus().status).toBe('offline');
    p.disconnect();
  });

  it('a successful poll clears the failure count', async () => {
    const p = new PollingRealtime(5_000);
    p.connect();
    pending[0].reject(new Error('blip'));
    await settle();

    (p as unknown as { tick: () => Promise<void> }).tick();
    await settle();
    pending[1].resolve([]);
    await settle();
    expect(p.getStatus().status).toBe('connected');

    // A single later failure must not immediately read as offline.
    (p as unknown as { tick: () => Promise<void> }).tick();
    await settle();
    pending[2].reject(new Error('blip'));
    await settle();
    expect(p.getStatus().status).toBe('connected');
    p.disconnect();
  });

  it('browser offline/online events are ignored while disconnected', async () => {
    const p = new PollingRealtime(5_000);
    p.connect();
    pending[0].resolve([]);
    await settle();
    expect(p.getStatus().status).toBe('connected');

    p.disconnect();
    const callsAtDisconnect = getCalls;
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(p.getStatus().status, 'a disconnected provider stays offline').toBe('offline');
    expect(getCalls, 'and issues no requests').toBe(callsAtDisconnect);
  });
});

// ---------------------------------------------------------------------------
describe('BroadcastRealtime lifecycle', () => {
  it('reports connected on connect and offline on disconnect', () => {
    const b = new BroadcastRealtime();
    expect(b.getStatus().status).toBe('connecting');
    b.connect();
    expect(b.getStatus().status).toBe('connected');
    expect(b.getStatus().lastSyncAt, 'opening the channel is a successful sync').not.toBeNull();
    expect(b.getStatus().lastEventAt, 'but not a business event').toBeNull();
    b.disconnect();
    expect(b.getStatus().status).toBe('offline');
  });

  it('publish after disconnect neither dispatches nor reconnects', () => {
    const b = new BroadcastRealtime();
    const seen: RealtimeEvent[] = [];
    b.subscribe('orders', (e) => seen.push(e));
    b.connect();
    b.disconnect();

    b.publish!(evt('2026-01-01T12:00:00.000Z'));

    expect(seen).toHaveLength(0);
    expect(b.getStatus().status).toBe('offline');
    expect(b.getStatus().lastEventAt).toBeNull();
  });

  it('publish while connected dispatches and records a business event', () => {
    const b = new BroadcastRealtime();
    const seen: RealtimeEvent[] = [];
    b.subscribe('orders', (e) => seen.push(e));
    b.connect();
    b.publish!(evt('2026-01-01T12:00:00.000Z'));
    expect(seen).toHaveLength(1);
    expect(b.getStatus().lastEventAt).toBe('2026-01-01T12:00:00.000Z');
    b.disconnect();
  });

  it('reconnecting restores the connected state', () => {
    const b = new BroadcastRealtime();
    b.connect();
    b.disconnect();
    b.connect();
    expect(b.getStatus().status).toBe('connected');
    b.disconnect();
  });
});

// ---------------------------------------------------------------------------
describe('StatusBus keeps the two clocks independent', () => {
  it('markSync moves only lastSyncAt; markEvent moves both', async () => {
    const bus = new StatusBus('connecting');
    bus.markSync();
    const a = bus.get();
    expect(a.status).toBe('connected');
    expect(a.lastSyncAt).not.toBeNull();
    expect(a.lastEventAt).toBeNull();

    await new Promise((r) => setTimeout(r, 2));
    bus.markEvent('2026-01-01T08:00:00.000Z');
    const b = bus.get();
    expect(b.lastEventAt).toBe('2026-01-01T08:00:00.000Z');
    expect(b.lastSyncAt).not.toBe(a.lastSyncAt);
  });

  it('a status change preserves both clocks', () => {
    const bus = new StatusBus('connecting');
    bus.markEvent('2026-01-01T08:00:00.000Z');
    const before = bus.get();
    bus.set('offline');
    const after = bus.get();
    expect(after.status).toBe('offline');
    expect(after.lastSyncAt).toBe(before.lastSyncAt);
    expect(after.lastEventAt).toBe(before.lastEventAt);
  });
});
