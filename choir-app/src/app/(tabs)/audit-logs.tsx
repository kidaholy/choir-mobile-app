import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useAuth } from '@/contexts/auth';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AuditLog } from '@/lib/types';

export default function AuditLogsScreen() {
  const { isSuperAdmin } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchLogs();
    }
  }, [isSuperAdmin]);

  const fetchLogs = async () => {
    try {
      const q = query(collection(db, 'auditLogs'), orderBy('created_at', 'desc'), limit(100));
      const snap = await getDocs(q);
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog)));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <View style={styles.container}>
        <Text style={styles.accessDenied}>Access Denied - Super Admin Only</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.logCard}>
            <View style={styles.logHeader}>
              <Text style={styles.logAction}>{item.action.replace(/_/g, ' ').toUpperCase()}</Text>
              <Text style={styles.logDate}>
                {item.created_at?.toDate?.()?.toLocaleString() || ''}
              </Text>
            </View>
            <Text style={styles.logUser}>👤 {item.user_name}</Text>
            <Text style={styles.logDetails}>Resource: {item.resource_type} {item.resource_id ? `(${item.resource_id.slice(0, 8)})` : ''}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No audit logs</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  list: { padding: 12 },
  logCard: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  logAction: { fontSize: 12, fontWeight: '600', color: '#007AFF' },
  logDate: { fontSize: 10, color: '#666' },
  logUser: { fontSize: 13, marginTop: 4 },
  logDetails: { fontSize: 12, color: '#666', marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 40 },
  accessDenied: { textAlign: 'center', color: '#FF3B30', marginTop: 40, fontSize: 16 },
});
