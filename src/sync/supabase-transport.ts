import './url-polyfill';

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

import type { Op } from './types';
import type { Transport, TransportArgs, TransportStatus } from './transport';

/** How often to re-pull each list as a safety net (idempotent, cheap). */
const CATCHUP_POLL_MS = 45_000;
/** Max rows per catch-up pull; the next poll pages forward from the cursor. */
const PULL_LIMIT = 500;

type OpRow = {
  op_id: string;
  list_id: string;
  created_at: string;
  payload: unknown;
};

/**
 * Syncs through Supabase: an append-only op log in Postgres plus Realtime
 * broadcast for instant delivery.
 *
 *  - publish() inserts the op row (durable) and fires a broadcast (fast path).
 *    Phones that are online right now get the broadcast; everyone else picks
 *    the row up on their next pull.
 *  - requestOps() pulls rows newer than a per-list cursor. Overlapping the
 *    cursor by re-fetching the boundary row is safe because the engine
 *    dedupes by op id.
 *
 * The phone's own SQLite stays the source of truth for rendering; this table
 * is only the buffer that makes "one update reaches every phone" true even
 * when the phones are not online at the same moment.
 */
export class SupabaseTransport implements Transport {
  readonly name = 'supabase' as const;
  readonly needsFullBacklog = false;

  private url = '';
  private anonKey = '';

  private client: SupabaseClient | null = null;
  private channels = new Map<string, RealtimeChannel>();
  private subscribed = new Set<string>();

  private args: TransportArgs | null = null;
  private rooms: string[] = [];
  private cursors = new Map<string, string>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  configure(url: string, anonKey: string): void {
    this.url = url;
    this.anonKey = anonKey;
  }

  isConfigured(): boolean {
    return Boolean(this.url && this.anonKey);
  }

  start(args: TransportArgs): void {
    void this.stopAsync();
    this.args = args;
    this.rooms = args.rooms;
    this.cursors.clear();

    if (!this.isConfigured()) {
      this.setStatus('offline');
      return;
    }

    this.client = createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });

    this.setStatus('connecting');
    for (const listId of this.rooms) void this.joinRoom(listId);

    // Safety net: a broadcast can be missed (tab backgrounded, brief network
    // blip), so re-pull periodically. Pulling is idempotent — the engine
    // dedupes by op id — so this is always safe to run.
    this.pollTimer = setInterval(() => {
      for (const listId of this.rooms) this.requestOps(listId);
    }, CATCHUP_POLL_MS);
  }

  stop(): void {
    void this.stopAsync();
  }

  private async stopAsync(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    const channels = [...this.channels.values()];
    this.channels.clear();
    this.subscribed.clear();
    for (const channel of channels) {
      try {
        await this.client?.removeChannel(channel);
      } catch {
        // channel already gone
      }
    }
    this.client = null;
    this.setStatus('offline');
  }

  setRooms(rooms: string[]): void {
    this.rooms = rooms;
    if (!this.client) return;
    for (const listId of rooms) {
      if (!this.channels.has(listId)) void this.joinRoom(listId);
    }
    for (const [listId, channel] of [...this.channels]) {
      if (rooms.includes(listId)) continue;
      this.channels.delete(listId);
      this.subscribed.delete(listId);
      void this.client.removeChannel(channel).catch(() => {});
    }
    this.updateStatus();
  }

  publish(op: Op): boolean {
    if (!this.client) return false;
    const listId = op.listId;
    // Durable write first — this is what a late phone will read.
    void this.client
      .from('ops')
      .upsert(
        {
          op_id: op.id,
          list_id: op.listId,
          origin: op.origin,
          kind: op.kind,
          ts: op.ts,
          payload: op,
        },
        { onConflict: 'op_id', ignoreDuplicates: true },
      )
      .then(({ error }) => {
        if (error) console.warn('[supabase] publish failed', error.message);
      });
    // Then the fast path. `self: false` so we don't get our own op echoed —
    // we already applied it locally.
    const channel = this.channels.get(listId);
    if (channel) {
      void channel
        .send({ type: 'broadcast', event: 'op', payload: { op } })
        .catch(() => {
          // Broadcast is best-effort; the row is already durable, and the
          // receiving phone's periodic pull will cover it.
        });
    }
    return true;
  }

  requestOps(listId: string): void {
    if (!this.client) return;
    const cursor = this.cursors.get(listId);
    let query = this.client
      .from('ops')
      .select('op_id, list_id, created_at, payload')
      .eq('list_id', listId)
      .order('created_at', { ascending: true })
      .limit(PULL_LIMIT);
    // Re-fetch the boundary row (gte, not gt) so a server/client clock gap
    // can never drop an op; duplicates are removed by the engine's dedupe.
    if (cursor) query = query.gte('created_at', cursor);

    void query.then(({ data, error }) => {
      if (error || !data || !this.args) return;
      const rows = data as OpRow[];
      const ops: Op[] = [];
      for (const row of rows) {
        const op = row.payload as Op | null;
        if (op && typeof op.id === 'string' && typeof op.listId === 'string') ops.push(op);
      }
      const last = rows[rows.length - 1];
      if (last) this.cursors.set(listId, last.created_at);
      if (ops.length) this.args.onMessage({ t: 'ops', listId, ops });
    });
  }

  sendOps(_listId: string, _ops: Op[]): boolean {
    // Nobody asks us: with Supabase the table *is* the backlog.
    return false;
  }

  // ---- internals ----------------------------------------------------------

  private async joinRoom(listId: string): Promise<void> {
    if (!this.client || this.channels.has(listId)) return;
    const channel = this.client.channel(`list:${listId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on('broadcast', { event: 'op' }, ({ payload }) => {
      const op = payload?.op as Op | undefined;
      if (op && typeof op.id === 'string' && typeof op.listId === 'string') {
        this.args?.onMessage({ t: 'op', op });
      }
    });
    this.channels.set(listId, channel);

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this.subscribed.add(listId);
        this.updateStatus();
        // Just joined (or rejoined after a drop) — catch up on anything
        // that happened while we were away.
        this.requestOps(listId);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.subscribed.delete(listId);
        this.updateStatus();
      } else if (status === 'CLOSED') {
        this.subscribed.delete(listId);
        this.channels.delete(listId);
        this.updateStatus();
      }
    });
  }

  private setStatus(next: TransportStatus): void {
    this.args?.onStatus(next);
  }

  /** Online once at least one room is live; offline when none are. */
  private updateStatus(): void {
    if (this.subscribed.size > 0) this.setStatus('online');
    else if (this.client) this.setStatus('connecting');
    else this.setStatus('offline');
  }
}
