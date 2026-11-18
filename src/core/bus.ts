/**
 * One typed event bus for the whole simulation.
 *
 * ADR-0004 requires every director decision to be traceable; the Record
 * requires an append-only history; the debug overlay requires a live tail.
 * All three are the same object, which is why there is exactly one.
 */

export type Handler<T> = (payload: T, meta: EventMeta) => void;

export interface EventMeta {
  /** monotonic sequence number, unique within a session */
  seq: number;
  /** sim tick when the event was published */
  tick: number;
  type: string;
}

interface Subscription {
  type: string;
  handler: Handler<unknown>;
  once: boolean;
}

export interface LoggedEvent {
  meta: EventMeta;
  payload: unknown;
}

export class EventBus {
  private subs: Subscription[] = [];
  private seq = 0;
  private ring: LoggedEvent[] = [];
  private readonly capacity: number;
  /** when true, payloads are kept in the ring (dev builds only) */
  private recording: boolean;

  constructor(opts: { capacity?: number; recording?: boolean } = {}) {
    this.capacity = opts.capacity ?? 2000;
    this.recording = opts.recording ?? true;
  }

  /** Subscribe to a type ('*' for everything). Returns an unsubscribe fn. */
  on<T>(type: string, handler: Handler<T>): () => void {
    const sub: Subscription = { type, handler: handler as Handler<unknown>, once: false };
    this.subs.push(sub);
    return () => {
      this.subs = this.subs.filter((s) => s !== sub);
    };
  }

  once<T>(type: string, handler: Handler<T>): () => void {
    const sub: Subscription = { type, handler: handler as Handler<unknown>, once: true };
    this.subs.push(sub);
    return () => {
      this.subs = this.subs.filter((s) => s !== sub);
    };
  }

  emit<T>(type: string, payload: T, tick = 0): EventMeta {
    const meta: EventMeta = { seq: this.seq++, tick, type };
    if (this.recording) {
      this.ring.push({ meta, payload });
      if (this.ring.length > this.capacity) this.ring.shift();
    }
    // copy the subscriber list so handlers can unsubscribe during dispatch
    for (const sub of this.subs.slice()) {
      if (sub.type !== type && sub.type !== '*') continue;
      sub.handler(payload, meta);
      if (sub.once) this.subs = this.subs.filter((s) => s !== sub);
    }
    return meta;
  }

  /** Recent events, newest last. */
  tail(n = 50, type?: string): LoggedEvent[] {
    const filtered = type ? this.ring.filter((e) => e.meta.type === type) : this.ring;
    return filtered.slice(-n);
  }

  clear(): void {
    this.ring = [];
  }

  setRecording(on: boolean): void {
    this.recording = on;
  }
}
