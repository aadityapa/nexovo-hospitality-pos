import { StatusBus, TopicBus, type RealtimeEvent, type RealtimeHandler, type RealtimeProvider, type RealtimeStatusHandler, type RealtimeStatusSnapshot, type RealtimeTopic } from './types';

const CHANNEL = 'nexovo.realtime';

/**
 * Same-browser transport: BroadcastChannel (all tabs) with a `storage`-event fallback.
 * Used by the mock backend; also dispatches locally so the publishing tab updates too.
 */
export class BroadcastRealtime implements RealtimeProvider {
  private bus = new TopicBus();
  private status = new StatusBus('connecting');
  private channel: BroadcastChannel | null = null;
  private storageListener = (e: StorageEvent) => {
    if (e.key === CHANNEL && e.newValue) {
      try {
        const evt = JSON.parse(e.newValue) as RealtimeEvent;
        this.status.markEvent(evt.at);
        this.bus.dispatch(evt);
      } catch { /* ignore */ }
    }
  };

  connect(): void {
    if (typeof window === 'undefined') return;
    // `'BroadcastChannel' in window` would narrow window to never in the else branch
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (m: MessageEvent<RealtimeEvent>) => { this.status.markEvent(m.data.at); this.bus.dispatch(m.data); };
    } else {
      window.addEventListener('storage', this.storageListener);
    }
    // The mock backend runs inside this browser, so once the channel is open the
    // transport genuinely is live — there is no server that could drop.
    this.status.set('connected', true);
  }

  disconnect(): void {
    this.channel?.close();
    this.channel = null;
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.storageListener);
    this.status.set('offline');
  }

  subscribe(topic: RealtimeTopic, handler: RealtimeHandler): () => void {
    return this.bus.subscribe(topic, handler);
  }

  getStatus(): RealtimeStatusSnapshot { return this.status.get(); }
  onStatus(handler: RealtimeStatusHandler): () => void { return this.status.subscribe(handler); }

  publish(evt: RealtimeEvent): void {
    this.bus.dispatch(evt);
    // A locally published change is still a business event for this tab's board.
    this.status.markEvent(evt.at);
    if (this.channel) this.channel.postMessage(evt);
    else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CHANNEL, JSON.stringify({ ...evt, nonce: Math.random() }));
    }
  }
}
