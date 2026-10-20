import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MemoryStorage } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import type { Transport, TransportArgs, TransportStatus } from '../src/sync/transport';
import type { Op } from '../src/sync/types';

/**
 * Transport-agnostic proof of the sync model.
 *
 * `FakeCloud` stands in for Supabase: an append-only log that never forgets,
 * plus best-effort broadcast to whoever happens to be connected. It mirrors
 * SupabaseTransport's contract exactly — `needsFullBacklog: false`, durable
 * catch-up pull on join, and broadcast as a fast path only — so these tests
 * cover the engine's behaviour on the Supabase path without a network.
 */

type Row = { seq: number; op: Op };

class FakeCloud {
  private rows: Row[] = [];
  private seq = 0;
  private readonly peers = new Set<FakePeerTransport>();

  /** Append-only: replaying the same op id is a no-op, like the PK. */
  append(op: Op): void {
    if (this.rows.some((r) => r.op.id === op.id)) return;
    this.rows.push({ seq: ++this.seq, op });
  }

  rowsFor(listId: string, afterSeq: number): Row[] {
    return this.rows.filter((r) => r.op.listId === listId && r.seq > afterSeq);
  }

  attach(peer: FakePeerTransport): void {
    this.peers.add(peer);
  }

  detach(peer: FakePeerTransport): void {
    this.peers.delete(peer);
  }

  broadcast(from: FakePeerTransport, op: Op): void {
    for (const peer of this.peers) {
      if (peer === from) continue; // Realtime self:false — no echo
      if (peer.inRoom(op.listId)) peer.deliver(op);
    }
  }
}

class FakePeerTransport implements Transport {
  readonly name = 'supabase' as const;
  readonly needsFullBacklog = false;

  private args: TransportArgs | null = null;
  private rooms: string[] = [];
  private cursors = new Map<string, number>();
  connected = false;

  constructor(private readonly cloud: FakeCloud) {}

  start(args: TransportArgs): void {
    this.args = args;
    this.rooms = args.rooms;
    this.connected = true;
    this.setStatus('online');
    // Mirrors the real transport's catch-up pull on SUBSCRIBED.
    for (const listId of this.rooms) this.requestOps(listId);
  }

  stop(): void {
    this.connected = false;
    this.cloud.detach(this);
    this.setStatus('offline');
  }

  setRooms(rooms: string[]): void {
    this.rooms = rooms;
    if (this.connected) {
      for (const listId of rooms) {
        if (!this.cursors.has(listId)) this.requestOps(listId);
      }
    }
    this.syncAttach();
  }

  publish(op: Op): boolean {
    if (!this.connected) return false;
    this.cloud.append(op);
    this.cloud.broadcast(this, op);
    return true;
  }

  requestOps(listId: string): void {
    if (!this.connected) return;
    const after = this.cursors.get(listId) ?? 0;
    const rows = this.cloud.rowsFor(listId, after);
    if (rows.length) this.cursors.set(listId, rows[rows.length - 1].seq);
    if (rows.length) this.args?.onMessage({ t: 'ops', listId, ops: rows.map((r) => r.op) });
  }

  sendOps(): boolean {
    return false;
  }

  inRoom(listId: string): boolean {
    return this.rooms.includes(listId);
  }

  deliver(op: Op): void {
    this.args?.onMessage({ t: 'op', op });
  }

  private syncAttach(): void {
    if (this.connected) this.cloud.attach(this);
    else this.cloud.detach(this);
  }

  private setStatus(next: TransportStatus): void {
    this.args?.onStatus(next);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until<T>(
  probe: () => Promise<T | null | undefined | false>,
  label: string,
  timeoutMs = 3000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${label}`);
    await sleep(15);
  }
}

function makePhone(cloud: FakeCloud, deviceId: string) {
  const storage = new MemoryStorage();
  const transport = new FakePeerTransport(cloud);
  const engine = new SyncEngine(storage, deviceId, transport);
  return { engine, storage, transport };
}

test('two phones on the same cloud converge through the broadcast fast path', async () => {
  const cloud = new FakeCloud();
  const a = makePhone(cloud, 'dev-A');
  const b = makePhone(cloud, 'dev-B');
  a.engine.start();
  b.engine.start();
  try {
    const listId = await a.engine.createList('Cloud list');
    await a.engine.addItem(listId, 'Milk');
    const joined = await b.engine.joinList(listId);
    assert.equal(joined, listId);

    await until(async () => (await b.storage.getItems(listId)).length === 1, 'B sees the item');

    // Both directions, and the two fields stay independent.
    const item = (await b.storage.getItems(listId))[0];
    await b.engine.setItemDone(listId, item.id, true);
    await until(async () => {
      const items = await a.storage.getItems(listId);
      return items.length === 1 && items[0].done === true;
    }, "A sees B's checkbox");
  } finally {
    a.engine.stop();
    b.engine.stop();
  }
});

test('a phone that was offline catches up from the durable log', async () => {
  const cloud = new FakeCloud();
  const a = makePhone(cloud, 'dev-A');
  const b = makePhone(cloud, 'dev-B');
  a.engine.start();
  b.engine.start();
  try {
    const listId = await a.engine.createList('Durable');
    const joined = await b.engine.joinList(listId);
    assert.equal(joined, listId);
    await until(async () => (await b.storage.getLists()).length === 1, 'B joined');

    // B goes away entirely. A keeps editing — with a relay these ops would
    // be broadcast into an empty room and lost until B reconnected *while A
    // was online*. The durable log means B gets them regardless.
    b.engine.stop();
    await a.engine.addItem(listId, 'one');
    await a.engine.addItem(listId, 'two');
    await a.engine.addItem(listId, 'three');
    await sleep(50);
    assert.equal((await b.storage.getItems(listId)).length, 0, 'B still offline');

    b.engine.start();
    await until(async () => (await b.storage.getItems(listId)).length === 3, 'B catches up');
    // Same-millisecond items tie-break on their random id, so assert as a
    // set — what matters is that every op arrived, not the order.
    const texts = new Set((await b.storage.getItems(listId)).map((i) => i.text));
    assert.deepEqual(texts, new Set(['one', 'two', 'three']));
  } finally {
    a.engine.stop();
    b.engine.stop();
  }
});

test('republishing the same op is idempotent (append-only log)', async () => {
  const cloud = new FakeCloud();
  const a = makePhone(cloud, 'dev-A');
  a.engine.start();
  try {
    const listId = await a.engine.createList('Idempotent');
    const itemId = await a.engine.addItem(listId, 'once');
    const before = cloud.rowsFor(listId, 0).length;

    // Replay every op we hold, exactly as a backlog re-push would.
    for (const op of await a.storage.getOps(listId)) cloud.append(op);
    for (const op of await a.storage.getOps(listId)) cloud.append(op);

    assert.equal(cloud.rowsFor(listId, 0).length, before, 'log did not grow');
    assert.equal((await a.storage.getItems(listId)).length, 1);
    assert.ok(itemId);
  } finally {
    a.engine.stop();
  }
});

test('swapping transports keeps local data and resumes syncing', async () => {
  const cloudA = new FakeCloud();
  const cloudB = new FakeCloud();
  const a = makePhone(cloudA, 'dev-A');
  const b = makePhone(cloudB, 'dev-B');
  a.engine.start();
  b.engine.start();
  try {
    const listId = await a.engine.createList('Swap');
    await a.engine.addItem(listId, 'before swap');

    // Move phone A to a different backend. Its local rows must survive.
    const swapped = makePhone(cloudA, 'dev-A-unused');
    a.engine.setTransport(swapped.transport);
    assert.equal((await a.storage.getItems(listId)).length, 1, 'local data survived the swap');

    // A publish on the new transport still reaches its new peers.
    await a.engine.addItem(listId, 'after swap');
    await until(async () => cloudA.rowsFor(listId, 0).length >= 3, 'new transport published');
  } finally {
    a.engine.stop();
    b.engine.stop();
  }
});

test('a phone answers a peer that asks for the backlog', async () => {
  const cloud = new FakeCloud();
  const storage = new MemoryStorage();

  /** A relay-style peer: asks for what we hold, records the reply. */
  class WantingPeer implements Transport {
    readonly name = 'relay' as const;
    readonly needsFullBacklog = true;
    answered: Op[] | null = null;
    private args: TransportArgs | null = null;
    private listId = '';

    arm(listId: string): void {
      this.listId = listId;
    }

    start(args: TransportArgs): void {
      this.args = args;
      args.onStatus('online');
      if (this.listId) args.onMessage({ t: 'want', listId: this.listId });
    }
    stop(): void {}
    setRooms(): void {}
    publish(): boolean {
      return true;
    }
    requestOps(): void {}
    sendOps(_listId: string, ops: Op[]): boolean {
      this.answered = ops;
      return true;
    }
  }

  const peer = new WantingPeer();
  const engine = new SyncEngine(storage, 'dev-A', peer);

  // Seed the op log directly so the phone has something to hand over.
  const seeded = makePhone(cloud, 'dev-A');
  const listId = await seeded.engine.createList('Backlog');
  await seeded.engine.addItem(listId, 'mine');
  const expected = await seeded.storage.getOps(listId);
  for (const op of expected) await storage.appendOp(op, true);
  seeded.engine.stop();

  peer.arm(listId);
  engine.start();
  try {
    await until(async () => peer.answered !== null, 'peer got a reply');
    assert.equal(peer.answered!.length, expected.length, 'handed over the whole log');
    assert.deepEqual(
      new Set(peer.answered!.map((o) => o.id)),
      new Set(expected.map((o) => o.id)),
    );
  } finally {
    engine.stop();
  }
});
