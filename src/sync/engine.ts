import type { Storage } from '../storage/types';
import { isValidShareCode, newShareCode, normalizeShareCode } from './code';
import { applyItemOp, applyListOp } from './merge';
import { itemSetOp, listSetOp, stamp } from './ops';
import type { Transport, TransportStatus } from './transport';
import type { ListRow, Op } from './types';

export type EngineStatus = TransportStatus;

type ChangeListener = () => void;

/**
 * SyncEngine — the whole local-first pipeline, with the network swapped out
 * behind a Transport:
 *
 *  1. Every user action becomes an Op (per-field LWW patch).
 *  2. Ops go to the local op log FIRST (local write is instant, offline-safe).
 *  3. The transport delivers ops to peers — a storage-free WebSocket relay,
 *     or Supabase's append-only op log + Realtime.
 *  4. Incoming ops are deduped by id, merged into materialized rows, persisted.
 *  5. On (re)connect the engine re-joins its rooms and pulls whatever it
 *     missed. Transports that forget (the relay) also get the full backlog
 *     re-pushed; durable transports do not need it.
 *
 * The merge is order-independent, so it does not matter whether an op arrives
 * live, from a backlog replay, or twice.
 */
export class SyncEngine {
  readonly deviceId: string;
  private readonly storage: Storage;
  private transport: Transport;

  private stopped = true;
  private status: EngineStatus = 'offline';
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<ChangeListener>();

  constructor(storage: Storage, deviceId: string, transport: Transport) {
    this.storage = storage;
    this.deviceId = deviceId;
    this.transport = transport;
  }

  /**
   * Swap the network backend (e.g. relay -> Supabase after settings change).
   * The local op log and materialized rows are untouched — only the pipe
   * changes, and whatever the new transport delivers is deduped on arrival.
   */
  setTransport(transport: Transport): void {
    const wasRunning = !this.stopped;
    try {
      this.transport.stop();
    } catch {
      // old transport already torn down
    }
    this.transport = transport;
    if (wasRunning) this.start();
  }

  getTransport(): Transport {
    return this.transport;
  }

  // ---- lifecycle ----------------------------------------------------------

  start(): void {
    this.stopped = false;
    this.transport.start({
      rooms: [],
      onStatus: (s) => this.handleStatus(s),
      onMessage: (m) => void this.handleMessage(m),
    });
    // Rooms are pushed once the current set is known (async).
    void this.refreshRooms();
  }

  stop(): void {
    this.stopped = true;
    this.transport.stop();
    this.setStatus('offline');
  }

  /** Stop, then start again — used after settings change the endpoint. */
  restart(): void {
    this.stop();
    this.start();
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  /** Subscribe to "local data changed" (local action or remote op). */
  onChange(cb: ChangeListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ---- transport wiring ---------------------------------------------------

  private handleStatus(next: TransportStatus): void {
    this.setStatus(next);
    if (next === 'online') void this.onOnline();
  }

  private async onOnline(): Promise<void> {
    if (this.stopped) return;
    const rooms = await this.storage.getListIds();
    this.transport.setRooms(rooms);
    // A transport that forgets needs our whole log re-sent; a durable one
    // (Supabase) already has it, so we only pull the delta.
    if (this.transport.needsFullBacklog) await this.pushBacklog();
    for (const listId of rooms) this.transport.requestOps(listId);
  }

  private async pushBacklog(): Promise<void> {
    const rooms = await this.storage.getListIds();
    const sentIds: string[] = [];
    for (const listId of rooms) {
      for (const op of await this.storage.getOps(listId)) {
        if (!this.transport.publish(op)) {
          await this.storage.markOpsPushed(sentIds);
          return;
        }
        sentIds.push(op.id);
      }
    }
    await this.storage.markOpsPushed(sentIds);
  }

  private async handleMessage(msg: {
    t: 'op' | 'ops' | 'want';
    op?: Op;
    listId?: string;
    ops?: Op[];
  }): Promise<void> {
    if (msg.t === 'op' && msg.op) {
      await this.receive(msg.op);
    } else if (msg.t === 'ops' && msg.ops) {
      for (const op of msg.ops) await this.receive(op);
    } else if (msg.t === 'want' && typeof msg.listId === 'string') {
      // A peer is behind — hand them our copy from the local op log.
      const ops = await this.storage.getOps(msg.listId);
      this.transport.sendOps(msg.listId, ops);
    }
  }

  // ---- applying ops -------------------------------------------------------

  /** Remote op: dedupe → append to log → merge → notify. */
  private async receive(raw: unknown): Promise<void> {
    const op = raw as Op | null;
    if (!op || typeof op.id !== 'string' || typeof op.listId !== 'string') return;
    if (op.kind !== 'list.set' && op.kind !== 'item.set') return;
    if (op.kind === 'item.set' && typeof op.itemId !== 'string') return;

    if (await this.storage.hasOp(op.id)) return;
    await this.storage.appendOp(op, true);
    await this.mergeIntoRows(op);
    this.scheduleNotify();
  }

  /** Local op: append (unpushed) → merge → notify → broadcast. */
  private async submit(op: Op): Promise<void> {
    await this.storage.appendOp(op, false);
    await this.mergeIntoRows(op);
    this.scheduleNotify();
    if (this.transport.publish(op)) await this.storage.markOpsPushed([op.id]);
  }

  private async mergeIntoRows(op: Op): Promise<void> {
    if (op.kind === 'list.set') {
      const row = await this.storage.getListRow(op.listId);
      const merged: ListRow = applyListOp(row, op);
      await this.storage.putListRow(merged);
    } else {
      const row = await this.storage.getItemRow(op.listId, op.itemId);
      await this.storage.putItemRow(applyItemOp(row, op));
    }
  }

  private scheduleNotify(): void {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      for (const cb of [...this.listeners]) cb();
    }, 0);
  }

  private setStatus(next: EngineStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.scheduleNotify();
  }

  // ---- rooms --------------------------------------------------------------

  /** Tell the transport which rooms this device belongs to. */
  async refreshRooms(): Promise<void> {
    if (this.stopped) return;
    const rooms = await this.storage.getListIds();
    this.transport.setRooms(rooms);
  }

  private pullRoom(listId: string): void {
    this.transport.requestOps(listId);
  }

  // ---- public actions (the UI-facing facade) -----------------------------

  async createList(name: string): Promise<string> {
    let id = newShareCode();
    for (let i = 0; i < 5 && (await this.storage.getListRow(id)); i++) id = newShareCode();
    await this.submit(
      listSetOp(id, this.deviceId, {
        name: { v: name, u: stamp(this.deviceId) },
        deleted: { v: false, u: stamp(this.deviceId) },
        createdAt: Date.now(),
      }),
    );
    await this.refreshRooms();
    return id;
  }

  /**
   * Join a list someone shared with you (the code IS the list id).
   * Returns the normalized list id, or null when the code is invalid.
   */
  async joinList(code: string): Promise<string | null> {
    if (!isValidShareCode(code)) return null;
    const id = normalizeShareCode(code);
    const existing = await this.storage.getListRow(id);
    if (!existing || existing.deleted) {
      const placeholder: ListRow = {
        id,
        name: existing?.name ?? 'Shared list',
        nameU: existing?.nameU ?? [0, ''],
        deleted: false,
        deletedU: [0, ''],
        createdAt: existing?.createdAt ?? Date.now(),
      };
      await this.storage.putListRow(placeholder);
      this.scheduleNotify();
    }
    await this.refreshRooms();
    this.pullRoom(id);
    return id;
  }

  async setListName(listId: string, name: string): Promise<void> {
    await this.submit(
      listSetOp(listId, this.deviceId, { name: { v: name, u: stamp(this.deviceId) } }),
    );
  }

  async deleteList(listId: string): Promise<void> {
    await this.submit(
      listSetOp(listId, this.deviceId, { deleted: { v: true, u: stamp(this.deviceId) } }),
    );
    await this.refreshRooms();
  }

  async addItem(listId: string, text: string): Promise<string> {
    const itemId = newShareCode() + newShareCode().slice(0, 4);
    await this.submit(
      itemSetOp(
        listId,
        this.deviceId,
        itemId,
        {
          text: { v: text, u: stamp(this.deviceId) },
          done: { v: false, u: stamp(this.deviceId) },
          deleted: { v: false, u: stamp(this.deviceId) },
          createdAt: Date.now(),
        },
      ),
    );
    return itemId;
  }

  async setItemText(listId: string, itemId: string, text: string): Promise<void> {
    await this.submit(
      itemSetOp(listId, this.deviceId, itemId, { text: { v: text, u: stamp(this.deviceId) } }),
    );
  }

  async setItemDone(listId: string, itemId: string, done: boolean): Promise<void> {
    await this.submit(
      itemSetOp(listId, this.deviceId, itemId, { done: { v: done, u: stamp(this.deviceId) } }),
    );
  }

  async deleteItem(listId: string, itemId: string): Promise<void> {
    await this.submit(
      itemSetOp(listId, this.deviceId, itemId, { deleted: { v: true, u: stamp(this.deviceId) } }),
    );
  }
}
