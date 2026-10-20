import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { after, test } from 'node:test';
import net from 'node:net';
import path from 'node:path';

import type { Storage } from '../src/storage/types';
import { MemoryStorage } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { RelayTransport } from '../src/sync/relay-transport';

/**
 * End-to-end proof of the sync model: two independent "phones" (separate
 * storages, separate device ids) talking to the REAL relay process from
 * server/relay.mjs — just like two physical phones would.
 */

const PORT = 8799;
const RELAY_URL = `ws://127.0.0.1:${PORT}`;

let relay: ChildProcess | null = null;
let relayStderr = '';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until<T>(
  probe: () => Promise<T | null | undefined | false>,
  label: string,
  timeoutMs = 6000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for: ${label}\nrelay stderr: ${relayStderr}`);
    }
    await sleep(25);
  }
}

async function waitForPort(port: number): Promise<void> {
  await until(
    () =>
      new Promise<boolean>((resolve) => {
        const sock = net.connect(port, '127.0.0.1');
        sock.once('connect', () => {
          sock.end();
          resolve(true);
        });
        sock.once('error', () => resolve(false));
      }),
    `relay to listen on :${port}`,
  );
}

function startRelay(): ChildProcess {
  const child = spawn(process.execPath, [path.resolve(process.cwd(), 'server', 'relay.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr?.on('data', (d: Buffer) => {
    relayStderr += d.toString();
  });
  child.stdout?.resume();
  return child;
}

type Phone = { engine: SyncEngine; storage: Storage };

async function makePhone(deviceId: string): Promise<Phone> {
  const storage = new MemoryStorage();
  const engine = new SyncEngine(storage, deviceId, new RelayTransport(RELAY_URL));
  engine.start();
  return { engine, storage };
}

async function onlinePair(): Promise<{ a: Phone; b: Phone }> {
  const a = await makePhone('dev-A');
  const b = await makePhone('dev-B');
  await until(
    async () => a.engine.getStatus() === 'online' && b.engine.getStatus() === 'online',
    'both phones online',
  );
  return { a, b };
}

after(() => {
  relay?.kill();
});

test('phone B joins by code and receives list + items from phone A', async () => {
  relay = startRelay();
  await waitForPort(PORT);
  const { a, b } = await onlinePair();
  try {
    const listId = await a.engine.createList('Groceries');
    await a.engine.addItem(listId, 'Milk');
    await a.engine.addItem(listId, 'Eggs');

    const joined = await b.engine.joinList(listId);
    assert.equal(joined, listId);

    await until(async () => (await b.storage.getLists()).length === 1, 'B sees the list');
    await until(async () => (await b.storage.getItems(listId)).length === 2, 'B sees both items');

    const lists = await b.storage.getLists();
    assert.equal(lists[0].name, 'Groceries');
    const texts = new Set((await b.storage.getItems(listId)).map((i) => i.text));
    assert.deepEqual(texts, new Set(['Milk', 'Eggs']));
  } finally {
    a.engine.stop();
    b.engine.stop();
  }
});

test('updates on phone B appear on phone A, and vice versa', async () => {
  const { a, b } = await onlinePair();
  try {
    const listId = await a.engine.createList('Trip');
    const itemId = await a.engine.addItem(listId, 'Tickets');
    const joined = await b.engine.joinList(listId);
    assert.equal(joined, listId);
    await until(async () => (await b.storage.getItems(listId)).length === 1, 'B sees item');

    // B checks the box → A sees it
    await b.engine.setItemDone(listId, itemId, true);
    await until(
      async () => (await a.storage.getItemRow(listId, itemId))?.done === true,
      'A sees the checkbox from B',
    );

    // A renames it → B sees it (without clobbering B's checkbox)
    await a.engine.setItemText(listId, itemId, 'Tickets booked');
    await until(
      async () => (await b.storage.getItemRow(listId, itemId))?.text === 'Tickets booked',
      'B sees the rename from A',
    );
    assert.equal((await b.storage.getItemRow(listId, itemId))?.done, true);
  } finally {
    a.engine.stop();
    b.engine.stop();
  }
});

test('edits made while a phone is offline sync when it reconnects', async () => {
  const { a, b } = await onlinePair();
  try {
    const listId = await a.engine.createList('Offline test');
    await a.engine.addItem(listId, 'first');
    await b.engine.joinList(listId);
    await until(async () => (await b.storage.getItems(listId)).length === 1, 'B sees first item');

    // B goes offline; A keeps editing — the local write still succeeds instantly.
    b.engine.stop();
    await a.engine.addItem(listId, 'second');
    await sleep(300);
    assert.equal((await b.storage.getItems(listId)).length, 1, 'B must not see it while offline');

    // B reconnects → pulls everything it missed.
    b.engine.start();
    await until(async () => (await b.storage.getItems(listId)).length === 2, 'B catches up');
  } finally {
    a.engine.stop();
    b.engine.stop();
  }
});

test('ops queued locally while offline are pushed when the phone reconnects', async () => {
  const { a, b } = await onlinePair();
  try {
    const listId = await a.engine.createList('Queue test');
    await a.engine.addItem(listId, 'seed');
    await b.engine.joinList(listId);
    await until(async () => (await b.storage.getItems(listId)).length === 1, 'B sees seed');

    // A goes offline and keeps working — nothing is lost, nothing is online.
    a.engine.stop();
    await a.engine.addItem(listId, 'queued while offline');
    assert.equal((await a.storage.getItems(listId)).length, 2, 'local write works offline');
    assert.equal((await b.storage.getItems(listId)).length, 1);

    a.engine.start();
    await until(
      async () => (await b.storage.getItems(listId)).length === 2,
      'queued op reaches B after reconnect',
      10000,
    );
  } finally {
    a.engine.stop();
    b.engine.stop();
  }
});

test('the relay stores nothing: restarting it loses no data', async () => {
  const { a, b } = await onlinePair();
  try {
    const listId = await a.engine.createList('Relay restart');
    await a.engine.addItem(listId, 'survives');
    await b.engine.joinList(listId);
    await until(async () => (await b.storage.getItems(listId)).length === 1, 'B sees item');

    // Kill the relay (a real "no online database" restart — nothing to restore).
    relay?.kill();
    await until(async () => a.engine.getStatus() !== 'online', 'A notices the relay is gone');

    // Both phones keep accepting local edits while the relay is down.
    await a.engine.addItem(listId, 'made during outage');

    // Bring a fresh relay back — both reconnect and converge on their own.
    relay = startRelay();
    await waitForPort(PORT);
    await until(async () => (await b.storage.getItems(listId)).length === 2, 'B converges', 20000);
    await until(async () => (await a.storage.getItems(listId)).length === 2, 'A keeps its edit', 20000);
  } finally {
    a.engine.stop();
    b.engine.stop();
    relay?.kill();
    relay = null;
  }
});
