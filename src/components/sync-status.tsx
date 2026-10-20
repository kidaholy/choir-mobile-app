import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useEngineStatus } from '@/sync/context';
import type { EngineStatus } from '@/sync/engine';

const DOT_COLOR: Record<EngineStatus, string> = {
  online: '#16A34A',
  connecting: '#F59E0B',
  offline: '#9CA3AF',
};

const LABEL: Record<EngineStatus, string> = {
  online: 'synced — changes appear on all shared phones instantly',
  connecting: 'connecting to relay…',
  offline: 'offline — edits are saved here and sync when a peer is reachable',
};

/** Small connection indicator shown on every screen. */
export function SyncStatus() {
  const status = useEngineStatus();
  return (
    <View style={styles.row} accessibilityRole="text">
      <View style={[styles.dot, { backgroundColor: DOT_COLOR[status] }]} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {LABEL[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    flexShrink: 1,
  },
});
