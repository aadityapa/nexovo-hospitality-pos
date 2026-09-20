import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { StatusBus, TopicBus, type RealtimeEvent, type RealtimeHandler, type RealtimeProvider, type RealtimeStatusHandler, type RealtimeStatusSnapshot, type RealtimeTopic } from './types';

/**
 * Polling transport for ORDS: GET /events?since=<iso>. Drop-in replacement with SSE/WebSocket later.
 *
 * WHAT DRIVES THE STATUS
 * ----------------------
 * `status` is driven by transport outcomes only, never by a clock:
 *   • `connecting` — set by `connect()` and by the browser's `online` event, until a poll answers.
 *   • `connected`  — set the moment a poll resolves (`markSync`, or `markEvent` when the response
 *                    carried events). An empty 200 counts: it proves the link, so a quiet venue
 *                    never drifts out of `connected`.
 *   • `offline`    — set by `disconnect()`, by the browser's `offline` event, and after the SECOND
 *                    consecutive failed poll (one dropped poll is treated as a blip).
 * `lastSyncAt` and `lastEventAt` are *reported* timestamps. Nothing compares them against `now` to
 * decide the status, so an idle-but-healthy connection cannot age into looking stale or offline.
 *
 * LIFECYCLE GUARD
 * ---------------
 * A poll started before `disconnect()` can still resolve afterwards. `generation` is bumped on every
 * connect and disconnect; a response whose generation no longer matches is dropped entirely — it
 * dispatches no events, advances no cursor, and cannot flip the provider back to `connected`.
 */
export class PollingRealtime implements RealtimeProvider {
  private bus = new TopicBus();
  private status = new StatusBus('connecting');
  private timer: number | null = null;
  private since: string = new Date().toISOString();
  private inFlight = false;
  private failures = 0;
  /** Incremented by connect() and disconnect(); identifies the run a poll belongs to. */
  private generation = 0;

  constructor(private readonly intervalMs: number) {}

  connect(): void {
    if (this.timer !== null || typeof window === 'undefined') return;
    // New run: anything still in flight from a previous run is now obsolete.
    this.generation += 1;
    this.inFlight = false;
    this.failures = 0;
    this.status.set('connecting');
    this.timer = window.setInterval(() => void this.tick(), this.intervalMs);
    void this.tick();
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
  }

  disconnect(): void {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
    }
    // Invalidate any in-flight poll so a late response cannot resurrect the connection.
    this.generation += 1;
    this.inFlight = false;
    this.status.set('offline');
  }

  subscribe(topic: RealtimeTopic, handler: RealtimeHandler): () => void {
    return this.bus.subscribe(topic, handler);
  }

  getStatus(): RealtimeStatusSnapshot { return this.status.get(); }
  onStatus(handler: RealtimeStatusHandler): () => void { return this.status.subscribe(handler); }

  /** True while a poll run is current — i.e. connect() has run and disconnect() has not. */
  private isLive(generation: number): boolean {
    return this.timer !== null && generation === this.generation;
  }

  private onOnline = () => {
    if (this.timer === null) return;         // not connected: the browser coming back changes nothing
    this.status.set('connecting');
    void this.tick();
  };
  private onOffline = () => {
    if (this.timer === null) return;
    this.status.set('offline');
  };

  private async tick(): Promise<void> {
    // A hidden tab stops polling to save the battery, but its last known state stays valid.
    if (this.timer === null || this.inFlight || !useAuthStore.getState().token || document.hidden) return;
    const generation = this.generation;
    this.inFlight = true;
    try {
      const events = await api().get<RealtimeEvent[]>('/events', { since: this.since });
      // Disconnected (or reconnected) while this request was in flight → the result is obsolete.
      if (!this.isLive(generation)) return;
      let newest: string | null = null;
      for (const e of events) {
        this.bus.dispatch(e);
        if (e.at > this.since) this.since = e.at;
        if (!newest || e.at > newest) newest = e.at;
      }
      this.failures = 0;
      // A 200 with an empty list still proves the link is alive: mark the sync, but leave
      // `lastEventAt` alone so a quiet service is never mistaken for a stale connection.
      if (newest) this.status.markEvent(newest);
      else this.status.markSync();
    } catch {
      if (!this.isLive(generation)) return;  // a failure from an obsolete run tells us nothing
      this.failures += 1;
      // One dropped poll can be a blip; from the second consecutive failure we tell the operator.
      if (this.failures >= 2) this.status.set('offline');
    } finally {
      // Only the run that set the flag may clear it, or a late response would unblock a newer run.
      if (generation === this.generation) this.inFlight = false;
    }
  }
}
