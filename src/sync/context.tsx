import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { newDeviceId } from '@/id';
import { getStorage, type Storage } from '@/storage';
import { DEFAULT_RELAY_URL, loadSyncConfig, type SyncConfig } from '@/sync/config';
import { SyncEngine, type EngineStatus } from '@/sync/engine';
import { RelayTransport } from '@/sync/relay-transport';
import { SupabaseTransport } from '@/sync/supabase-transport';
import { FirebaseTransport } from '@/sync/firebase-transport';
import type { ItemInfo, ListInfo } from '@/sync/types';

export { DEFAULT_RELAY_URL };

type SyncContextValue = {
  engine: SyncEngine;
  storage: Storage;
  deviceId: string;
  /** Resolved sync settings; refreshed after every `reconnect()`. */
  config: SyncConfig;
  /** Re-read settings and restart the network — used by the Settings screen. */
  reconnect: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<SyncContextValue | null>(null);

  useEffect(() => {
    let alive = true;
    let engine: SyncEngine | null = null;
    let storage: Storage | null = null;
    let relay: RelayTransport | null = null;
    let supabase: SupabaseTransport | null = null;
    let firebase: FirebaseTransport | null = null;

    const buildTransport = (cfg: SyncConfig): any => {
      relay!.setUrl(cfg.relayUrl);
      supabase!.configure(cfg.supabaseUrl, cfg.supabaseAnonKey);
      if (cfg.mode === 'firebase') return firebase!;
      if (cfg.mode === 'supabase') return supabase!;
      return relay!;
    };

    const reconnect = async () => {
      if (!alive || !engine || !storage) return;
      const cfg = await loadSyncConfig(storage);
      // Swapping transports keeps the local op log intact — the engine just
      // starts using a different pipe, and the new transport's catch-up pull
      // re-delivers anything missed.
      engine.setTransport(buildTransport(cfg));
      setValue({ engine, storage, deviceId: engine.deviceId, config: cfg, reconnect });
    };

    (async () => {
      try {
        storage = await getStorage();
        let deviceId = await storage.getMeta('deviceId');
        if (!deviceId) {
          deviceId = newDeviceId();
          await storage.setMeta('deviceId', deviceId);
        }

        relay = new RelayTransport(DEFAULT_RELAY_URL);
        supabase = new SupabaseTransport();
        firebase = new FirebaseTransport();

        const cfg = await loadSyncConfig(storage);
        engine = new SyncEngine(storage, deviceId, buildTransport(cfg));
        engine.start();

        if (!alive) {
          engine.stop();
          return;
        }
        setValue({ engine, storage, deviceId, config: cfg, reconnect });
      } catch (err) {
        console.error('Failed to initialise local storage', err);
      }
    })();

    return () => {
      alive = false;
      engine?.stop();
    };
  }, []);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/** Low-level access; null until local storage finished initialising. */
export function useSyncCtx(): SyncContextValue | null {
  return useContext(SyncContext);
}

export function useEngineStatus(): EngineStatus {
  const ctx = useContext(SyncContext);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!ctx) return () => {};
      return ctx.engine.onChange(onStoreChange);
    },
    [ctx],
  );
  const getSnapshot = useCallback(
    (): EngineStatus => (ctx ? ctx.engine.getStatus() : 'offline'),
    [ctx],
  );
  const getServerSnapshot = useCallback((): EngineStatus => 'offline', []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useLists(): ListInfo[] {
  const ctx = useContext(SyncContext);
  const [lists, setLists] = useState<ListInfo[]>([]);
  useEffect(() => {
    if (!ctx) return;
    let alive = true;
    const reload = () =>
      ctx.storage.getLists().then((l) => {
        if (alive) setLists(l);
      });
    void reload();
    const off = ctx.engine.onChange(() => reload());
    return () => {
      alive = false;
      off();
    };
  }, [ctx]);
  return lists;
}

export function useList(listId: string): ListInfo | undefined {
  const lists = useLists();
  return lists.find((l) => l.id === listId);
}

export function useItems(listId: string): ItemInfo[] {
  const ctx = useContext(SyncContext);
  const [items, setItems] = useState<ItemInfo[]>([]);
  useEffect(() => {
    if (!ctx) return;
    let alive = true;
    const reload = () =>
      ctx.storage.getItems(listId).then((i) => {
        if (alive) setItems(i);
      });
    void reload();
    const off = ctx.engine.onChange(() => reload());
    return () => {
      alive = false;
      off();
    };
  }, [ctx, listId]);
  return items;
}
