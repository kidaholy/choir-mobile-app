import type { Op } from './types';
import type { Transport, TransportArgs, TransportStatus } from './transport';

const RECONNECT_MAX_MS = 15_000;

type RelayMsg =
  | { t: 'join'; rooms: string[] }
  | { t: 'joined'; rooms: string[] }
  | { t: 'op'; listId: string; op: Op }
  | { t: 'want'; listId: string }
  | { t: 'ops'; listId: string; ops: Op[] };

/**
 * Talks to server/relay.mjs — a pure message pipe with no storage.
 * Reconnects forever with exponential backoff; on every (re)connect it
 * re-joins its rooms, and the engine re-pushes its backlog because the
 * relay will not hand anything back.
 */
export class RelayTransport implements Transport {
  readonly name = 'relay' as const;
  readonly needsFullBacklog = true;

  private url: string;
  private ws: WebSocket | null = null;
  private args: TransportArgs | null = null;
  private rooms: string[] = [];
  private epoch = 0;
  private stopped = true;
  private backoffMs = 500;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string) {
    this.url = url;
  }

  /** Point at a different relay without rebuilding the transport. */
  setUrl(url: string): void {
    this.url = url;
  }

  getUrl(): string {
    return this.url;
  }

  start(args: TransportArgs): void {
    this.stop();
    this.args = args;
    this.rooms = args.rooms;
    this.stopped = false;
    this.backoffMs = 500;
    this.connect(++this.epoch);
  }

  stop(): void {
    this.stopped = true;
    this.epoch++;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      // already closed
    }
    this.setStatus('offline');
  }

  setRooms(rooms: string[]): void {
    this.rooms = rooms;
    this.send({ t: 'join', rooms });
  }

  publish(op: Op): boolean {
    return this.send({ t: 'op', listId: op.listId, op });
  }

  requestOps(listId: string): void {
    this.send({ t: 'want', listId });
  }

  sendOps(listId: string, ops: Op[]): boolean {
    return this.send({ t: 'ops', listId, ops });
  }

  // ---- internals ----------------------------------------------------------

  private connect(epoch: number): void {
    if (this.stopped || epoch !== this.epoch) return;
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect(epoch);
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (epoch !== this.epoch) {
        try {
          ws.close();
        } catch {
          // stale socket
        }
        return;
      }
      this.backoffMs = 500;
      // The relay has no memory: re-announce membership on every connect.
      if (this.send({ t: 'join', rooms: this.rooms })) this.setStatus('online');
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (epoch !== this.epoch) return;
      this.handle(typeof ev.data === 'string' ? ev.data : null);
    };
    ws.onerror = () => {
      // onclose always follows; reconnect is handled there.
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped || epoch !== this.epoch) return;
      this.setStatus('offline');
      this.scheduleReconnect(epoch);
    };
  }

  private scheduleReconnect(epoch: number): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(epoch);
    }, delay);
  }

  private handle(data: string | null): void {
    if (!data || !this.args) return;
    let msg: RelayMsg;
    try {
      msg = JSON.parse(data) as RelayMsg;
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'op') {
      this.args.onMessage({ t: 'op', op: msg.op });
    } else if (msg.t === 'ops' && Array.isArray(msg.ops)) {
      this.args.onMessage({ t: 'ops', listId: msg.listId, ops: msg.ops });
    } else if (msg.t === 'want' && typeof msg.listId === 'string') {
      // A peer is behind: surface the request so the engine can answer
      // from its own op log.
      this.args.onMessage({ t: 'want', listId: msg.listId });
    } else if (msg.t === 'joined') {
      this.setStatus('online');
    }
  }

  private send(msg: RelayMsg): boolean {
    try {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  private setStatus(next: TransportStatus): void {
    this.args?.onStatus(next);
  }
}
