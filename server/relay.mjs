import { WebSocketServer } from 'ws';

/**
 * Dumb message relay for Shared Lists.
 *
 * This is NOT a database: nothing is ever written to disk, every message is
 * forwarded to the other sockets in the room and immediately forgotten.
 * When the process exits, all state is gone — all real data lives in each
 * phone's local SQLite database. If no peer is online, ops simply stay in
 * the sender's local op log until someone is reachable again.
 *
 * Rooms are keyed by share code (the list id). Anyone with the code can join;
 * treat that code as the list's invite secret.
 *
 * Usage:  node server/relay.mjs        (PORT env overrides 8787)
 */

// `Number(...) || 8787` also copes with PORT being set-but-empty or 0.
const port = Number(process.env.PORT) || 8787;
const wss = new WebSocketServer({ port, maxPayload: 1024 * 1024 });

/** listId -> Set<socket>. Lives purely in process memory. */
const rooms = new Map();

function setRooms(ws, listIds) {
  // Leave old rooms.
  for (const id of ws.rooms) {
    const members = rooms.get(id);
    if (members) {
      members.delete(ws);
      if (members.size === 0) rooms.delete(id);
    }
  }
  ws.rooms = new Set();
  // Join new rooms.
  for (const raw of listIds) {
    if (typeof raw !== 'string') continue;
    const id = raw.slice(0, 64);
    if (!id) continue;
    ws.rooms.add(id);
    let members = rooms.get(id);
    if (!members) {
      members = new Set();
      rooms.set(id, members);
    }
    members.add(ws);
  }
}

function broadcast(ws, listId, data) {
  const members = rooms.get(listId);
  if (!members) return;
  for (const peer of members) {
    if (peer !== ws && peer.readyState === 1) peer.send(data);
  }
}

wss.on('connection', (ws) => {
  ws.rooms = new Set();
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    const text = raw.toString();
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'join') {
      setRooms(ws, Array.isArray(msg.rooms) ? msg.rooms : []);
      ws.send(JSON.stringify({ t: 'joined', rooms: [...ws.rooms] }));
      return;
    }
    if (
      (msg.t === 'op' || msg.t === 'want' || msg.t === 'ops') &&
      typeof msg.listId === 'string'
    ) {
      broadcast(ws, msg.listId, text);
    }
  });

  ws.on('close', () => setRooms(ws, []));
});

// Reap dead connections.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);
wss.on('close', () => clearInterval(heartbeat));

console.log(`[relay] listening on ws://0.0.0.0:${port} — pure message pipe, no storage`);
