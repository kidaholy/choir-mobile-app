import {
  ref,
  push,
  onChildAdded,
  off,
  query,
  orderByKey,
} from 'firebase/database';
import { rtdb } from './firebase-config';
import type { Op } from './types';
import type { Transport, TransportArgs, TransportStatus } from './transport';

export class FirebaseTransport implements Transport {
  readonly name = 'supabase' as const; // Reuse existing config mode names for compatibility
  readonly needsFullBacklog = false;

  private args: TransportArgs | null = null;
  private rooms: string[] = [];
  private listeners = new Map<string, () => void>();

  start(args: TransportArgs): void {
    this.args = args;
    this.rooms = args.rooms;
    this.setStatus('connecting');
    for (const listId of this.rooms) {
      this.joinRoom(listId);
    }
    this.updateStatus();
  }

  stop(): void {
    for (const [_listId, unsubscribe] of this.listeners) {
      unsubscribe();
    }
    this.listeners.clear();
    this.setStatus('offline');
  }

  setRooms(rooms: string[]): void {
    this.rooms = rooms;
    const currentRooms = new Set(this.listeners.keys());

    // Join new rooms
    for (const listId of rooms) {
      if (!currentRooms.has(listId)) {
        this.joinRoom(listId);
      }
    }

    // Leave rooms no longer subscribed to
    for (const listId of currentRooms) {
      if (!rooms.includes(listId)) {
        const unsubscribe = this.listeners.get(listId);
        if (unsubscribe) {
          unsubscribe();
          this.listeners.delete(listId);
        }
      }
    }
    this.updateStatus();
  }

  publish(op: Op): boolean {
    try {
      const opsRef = ref(rtdb, `lists/${op.listId}/ops`);
      void push(opsRef, op);
      return true;
    } catch (err) {
      console.warn('[firebase] publish failed', err);
      return false;
    }
  }

  requestOps(_listId: string): void {
    // Firebase RTDB delivers historical data via onChildAdded on initial subscription
  }

  sendOps(_listId: string, _ops: Op[]): boolean {
    // Not needed - RTDB is the shared store
    return false;
  }

  private joinRoom(listId: string): void {
    if (this.listeners.has(listId)) return;

    const opsRef = ref(rtdb, `lists/${listId}/ops`);
    const opsQuery = query(opsRef, orderByKey());

    const listener = onChildAdded(opsQuery, (snapshot) => {
      const op = snapshot.val();
      if (op && typeof op.id === 'string' && typeof op.listId === 'string') {
        this.args?.onMessage({ t: 'op', op });
      }
    });

    this.listeners.set(listId, () => off(opsRef, 'child_added', listener));
    this.updateStatus();
  }

  private setStatus(next: TransportStatus): void {
    this.args?.onStatus(next);
  }

  private updateStatus(): void {
    if (this.listeners.size > 0) {
      this.setStatus('online');
    } else if (this.args) {
      this.setStatus('connecting');
    } else {
      this.setStatus('offline');
    }
  }
}

export const createFirebaseTransport = (shareCode: string): Transport => {
  const transport = new FirebaseTransport();
  return transport;
};
