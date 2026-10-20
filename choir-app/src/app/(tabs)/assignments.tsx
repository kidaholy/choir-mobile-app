import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '@/contexts/auth';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ProgramAssignment, Program, Member, AssignmentRole } from '@/lib/types';

export default function AssignmentsScreen() {
  const { isProgramCoordinator, isChoirAdmin, isSuperAdmin } = useAuth();
  const [assignments, setAssignments] = useState<ProgramAssignment[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<AssignmentRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [assignSnap, progSnap, memSnap, roleSnap] = await Promise.all([
        getDocs(query(collection(db, 'programAssignments'), orderBy('assigned_on', 'desc'))),
        getDocs(query(collection(db, 'programs'), orderBy('scheduled_for', 'desc'))),
        getDocs(query(collection(db, 'members'))),
        getDocs(query(collection(db, 'dutyCategories'), orderBy('sort_order'))),
      ]);
      
      setAssignments(assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProgramAssignment)));
      setPrograms(progSnap.docs.map(d => ({ id: d.id, ...d.data() } as Program)));
      setMembers(memSnap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
      setRoles(roleSnap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentRole)));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getMemberName = (id: string) => members.find(m => m.id === id)?.full_name || 'Unknown';
  const getProgramTitle = (id: string) => programs.find(p => p.id === id)?.title || 'Unknown';
  const getRoleName = (id: string) => roles.find(r => r.id === id)?.name || 'Unknown';

  return (
    <View style={styles.container}>
      <FlatList
        data={assignments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{getProgramTitle(item.program_id)}</Text>
            <Text style={styles.cardSubtitle}>{item.assigned_on}</Text>
            <Text style={styles.cardDetail}>{getMemberName(item.member_id)} - {getRoleName(item.role_id)}</Text>
            <Text style={styles.status}>{item.status}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No assignments yet</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  list: { padding: 12 },
  card: { backgroundColor: '#f9f9f9', padding: 14, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSubtitle: { fontSize: 12, color: '#666' },
  cardDetail: { fontSize: 14, marginTop: 4 },
  status: { fontSize: 11, color: '#666', textTransform: 'capitalize', marginTop: 4 },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 40 },
});
