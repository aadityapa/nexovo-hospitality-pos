export type RealtimeTopic = 'orders' | 'tables' | 'kitchen' | 'bar' | 'bills' | 'menu' | 'inventory' | 'reservations' | 'club' | 'notifications' | 'all';

export interface RealtimeEvent {
  id?: number | string;
  topic: RealtimeTopic;
  type: string;
  entityId?: number | null;
  at: string;
}

export type RealtimeHandler = (evt: RealtimeEvent) => void;

/**
 * Real transport state, surfaced to operators in the header and on the kitchen/bar displays.
 * `disabled` means the app was configured without a realtime transport — the UI then says
 * "manual refresh" rather than implying live updates that will never arrive.
 */
export type RealtimeStatus = 'connected' | 'connecting' | 'offline' | 'disabled';

export interface RealtimeStatusSnapshot {
  status: RealtimeStatus;
  /**
   * ISO timestamp of the last successful exchange with the transport — a poll that returned
   * 200 (even with zero events), or the moment a channel was opened. This is what proves the
   * connection is alive, so it is the value the indicator must judge health by.
   */
  lastSyncAt: string | null;
  /**
   * ISO timestamp of the last *business* event actually received. A quiet service can leave
   * this hours behind while the connection is perfectly healthy, so it is shown as information
   * ("last update") and must never be used to decide whether the transport is stale or offline.
   */
  lastEventAt: string | null;
}

export type RealtimeStatusHandler = (s: RealtimeStatusSnapshot) => void;

/**
 * Transport abstraction. UI code only ever calls `subscribe`.
 * Implementations: BroadcastRealtime (mock / same-browser tabs), PollingRealtime (ORDS /events),
 * future SseRealtime / WebSocketRealtime.
 */
export interface RealtimeProvider {
  connect(): void;
  disconnect(): void;
  subscribe(topic: RealtimeTopic, handler: RealtimeHandler): () => void;
  /** Only meaningful for in-process transports (mock backend publishes here). */
  publish?(evt: RealtimeEvent): void;
  /** Current transport state — drives the connection indicator. */
  getStatus(): RealtimeStatusSnapshot;
  /** Subscribe to transport state changes. Returns an unsubscribe function. */
  onStatus(handler: RealtimeStatusHandler): () => void;
}

/**
 * Shared status broadcaster used by all providers.
 *
 * Deliberately keeps two independent clocks:
 *   `lastSyncAt`  — health of the connection (updated by every successful exchange)
 *   `lastEventAt` — freshness of the data (updated only when a real event arrives)
 * Conflating the two makes an idle-but-healthy connection look stale, which is the exact
 * failure mode this split exists to prevent.
 */
export class StatusBus {
  private handlers = new Set<RealtimeStatusHandler>();
  private snapshot: RealtimeStatusSnapshot;

  constructor(initial: RealtimeStatus) {
    this.snapshot = { status: initial, lastSyncAt: null, lastEventAt: null };
  }

  get(): RealtimeStatusSnapshot { return this.snapshot; }

  /** Transport state changed. Pass `synced` when this transition itself proves a live link. */
  set(status: RealtimeStatus, synced = false): void {
    const lastSyncAt = synced ? new Date().toISOString() : this.snapshot.lastSyncAt;
    if (this.snapshot.status === status && this.snapshot.lastSyncAt === lastSyncAt) return;
    this.snapshot = { ...this.snapshot, status, lastSyncAt };
    this.emit();
  }

  /** A successful exchange with the transport (a 200 poll, even with no events). */
  markSync(): void {
    this.snapshot = { ...this.snapshot, status: 'connected', lastSyncAt: new Date().toISOString() };
    this.emit();
  }

  /** A business event actually arrived. Implies the link is alive, so it also marks a sync. */
  markEvent(at?: string): void {
    const now = new Date().toISOString();
    this.snapshot = { status: 'connected', lastSyncAt: now, lastEventAt: at ?? now };
    this.emit();
  }

  private emit(): void {
    this.handlers.forEach((h) => h(this.snapshot));
  }

  subscribe(handler: RealtimeStatusHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }
}

/** Small shared dispatcher used by all providers. */
export class TopicBus {
  private handlers = new Map<RealtimeTopic, Set<RealtimeHandler>>();

  subscribe(topic: RealtimeTopic, handler: RealtimeHandler): () => void {
    if (!this.handlers.has(topic)) this.handlers.set(topic, new Set());
    this.handlers.get(topic)!.add(handler);
    return () => { this.handlers.get(topic)?.delete(handler); };
  }

  dispatch(evt: RealtimeEvent): void {
    this.handlers.get(evt.topic)?.forEach((h) => h(evt));
    this.handlers.get('all')?.forEach((h) => h(evt));
  }
}
