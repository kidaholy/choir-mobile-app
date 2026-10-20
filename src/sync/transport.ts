import type { Op } from './types';

export type TransportStatus = 'offline' | 'connecting' | 'online';

/** What a transport delivers to the engine. */
export type TransportMsg =
  | { t: 'op'; op: Op }
  | { t: 'ops'; listId: string; ops: Op[] }
  /** A peer wants everything we hold for this list (relay only). */
  | { t: 'want'; listId: string };

export interface TransportArgs {
  /** Rooms (list ids) this device belongs to at start time. */
  rooms: string[];
  onStatus(status: TransportStatus): void;
  onMessage(msg: TransportMsg): void;
}

/**
 * A Transport is just the pipe between this phone and its peers.
 *
 * The engine never knows what is on the other end. Two implementations ship:
 *
 *  - RelayTransport: a dumb WebSocket relay that stores nothing. Because it
 *    forgets everything the moment a socket drops, the engine must re-send
 *    its whole backlog on every reconnect (`needsFullBacklog`), and ops only
 *    reach peers who happen to be connected at the same time.
 *
 *  - SupabaseTransport: an append-only op log in Postgres plus Realtime
 *    fan-out. The table is durable, so nothing needs re-pushing
 *    (`needsFullBacklog` is false) and a phone that was offline catches up
 *    by pulling the rows it missed.
 */
export interface Transport {
  readonly name: 'relay' | 'supabase';
  readonly needsFullBacklog: boolean;

  start(args: TransportArgs): void;
  stop(): void;

  /** Replace the set of rooms (list ids) this device is subscribed to. */
  setRooms(rooms: string[]): void;

  /** Broadcast a locally-created op. False => not sent, keep it unpushed. */
  publish(op: Op): boolean;

  /** Ask for ops this device may be missing; reply arrives as `{t:'ops'}`. */
  requestOps(listId: string): void;

  /**
   * Answer a peer's `{t:'want'}` by handing them our ops for a list.
   * Only the relay has peers that ask; Supabase has no one to answer
   * (the table itself is the backlog) and returns false.
   */
  sendOps(listId: string, ops: Op[]): boolean;
}
