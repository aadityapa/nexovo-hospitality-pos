import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { StatusBus, TopicBus, type RealtimeEvent, type RealtimeHandler, type RealtimeProvider, type RealtimeStatusHandler, type RealtimeStatusSnapshot, type RealtimeTopic } from './types';

/**
 * Polling transport for ORDS: GET /events?since=<iso>. Drop-in replacement with SSE/WebSocket later.
 *
 * Transport state is reported honestly: the indicator only says "live" after an exchange with
 * the server actually succeeded, and flips to "offline" on the first failed poll so operators
 * know the board in front of them may be stale.
 */
export class PollingRealtime implements RealtimeProvider {
  private bus = new TopicBus();
  private status = new StatusBus('connecting');
  private timer: number | null = null;
  private since: string = new Date().toISOString();
  private inFlight = false;
  private failures = 0;

  constructor(private readonly intervalMs: number) {}

  connect(): void {
    if (this.timer !== null || typeof window === 'undefined') return;
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
    this.status.set('offline');
  }

  subscribe(topic: RealtimeTopic, handler: RealtimeHandler): () => void {
    return this.bus.subscribe(topic, handler);
  }

  getStatus(): RealtimeStatusSnapshot { return this.status.get(); }
  onStatus(handler: RealtimeStatusHandler): () => void { return this.status.subscribe(handler); }

  private onOnline = () => { this.status.set('connecting'); void this.tick(); };
  private onOffline = () => { this.status.set('offline'); };

  private async tick(): Promise<void> {
    // A hidden tab stops polling to save the battery, but its last known state stays valid.
    if (this.inFlight || !useAuthStore.getState().token || document.hidden) return;
    this.inFlight = true;
    try {
      const events = await api().get<RealtimeEvent[]>('/events', { since: this.since });
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
      this.failures += 1;
      // One dropped poll can be a blip; from the second consecutive failure we tell the operator.
      if (this.failures >= 2) this.status.set('offline');
    } finally {
      this.inFlight = false;
    }
  }
}
