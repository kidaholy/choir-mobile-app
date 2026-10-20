import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { useAuth } from '@/contexts/auth';
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateAssignments } from '@/lib/assignment';
import { logAudit } from '@/lib/audit';
import type { Program, ProgramType, ProgramStatus, Member, AssignmentRole, ProgramAssignment } from '@/lib/types';

export default function ProgramsScreen() {
  const { isProgramCoordinator, isChoirAdmin, isSuperAdmin, member } = useAuth();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<AssignmentRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ProgramType | 'all'>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    program_type: 'weekly' as ProgramType,
    scheduled_for: '',
    time: '',
    location: '',
    description: '',
    status: 'planned' as ProgramStatus,
    responsible_person: '',
    notes: '',
  });

  const canManage = isProgramCoordinator || isChoirAdmin || isSuperAdmin;

  useEffect(() => {
    fetchPrograms();
    fetchMembersAndRoles();
  }, []);

  const fetchPrograms = async () => {
    try {
      const q = query(collection(db, 'programs'), orderBy('scheduled_for', 'desc'));
      const querySnapshot = await getDocs(q);
      const programsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Program[];
      setPrograms(programsData);
    } catch (error) {
      console.error('Error fetching programs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembersAndRoles = async () => {
    try {
      const [memSnap, roleSnap] = await Promise.all([
        getDocs(collection(db, 'members')),
        getDocs(query(collection(db, 'dutyCategories'), orderBy('sort_order'))),
      ]);
      setMembers(memSnap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
      setRoles(roleSnap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentRole)));
    } catch (error) {
      console.error(error);
    }
  };

  const generateAssignmentsForProgram = async (programId: string) => {
    if (!canManage) return;
    try {
      const activeMembers = members.filter(m => m.status === 'active' || m.is_active);
      if (activeMembers.length === 0) {
        Alert.alert('Error', 'No active members');
        return;
      }
      if (roles.length === 0) {
        Alert.alert('Error', 'No duty categories defined');
        return;
      }

      const result = generateAssignments({
        roles: roles.map(r => ({ id: r.id, name: r.name, sort_order: r.sort_order })),
        members: activeMembers.map(m => ({ id: m.id, full_name: m.full_name, is_active: true })),
        history: [],
      });

      for (const assignment of result.assignments) {
        await addDoc(collection(db, 'programAssignments'), {
          program_id: programId,
          member_id: assignment.member_id,
          role_id: assignment.role_id,
          status: 'assigned',
          assigned_on: new Date().toISOString(),
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      }

      await logAudit(
        member?.id || '',
        member?.full_name || 'Unknown',
        'assignment_created',
        'program',
        programId,
        { count: result.assignments.length }
      );

      Alert.alert('Success', `Generated ${result.assignments.length} assignments`);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to generate assignments');
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.scheduled_for) {
      Alert.alert('Error', 'Title and date are required');
      return;
    }

    try {
      await addDoc(collection(db, 'programs'), {
        ...formData,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      Alert.alert('Success', 'Program created successfully');
      setModalVisible(false);
      fetchPrograms();
    } catch (error) {
      console.error('Error saving program:', error);
      Alert.alert('Error', 'Failed to save program');
    }
  };

  const getStatusColor = (status: ProgramStatus) => {
    switch (status) {
      case 'completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      case 'postponed': return '#FF9500';
      case 'upcoming': return '#007AFF';
      default: return '#8E8E93';
    }
  };

  const getTypeLabel = (type: ProgramType) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const filteredPrograms = filter === 'all' 
    ? programs 
    : programs.filter(p => p.program_type === filter);

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
        <TouchableOpacity style={[styles.filterTab, filter === 'all' && styles.activeFilter]} onPress={() => setFilter('all')}>
          <Text style={[styles.filterText, filter === 'all' && styles.activeFilterText]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterTab, filter === 'annual' && styles.activeFilter]} onPress={() => setFilter('annual')}>
          <Text style={[styles.filterText, filter === 'annual' && styles.activeFilterText]}>Annual</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterTab, filter === 'monthly' && styles.activeFilter]} onPress={() => setFilter('monthly')}>
          <Text style={[styles.filterText, filter === 'monthly' && styles.activeFilterText]}>Monthly</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterTab, filter === 'weekly' && styles.activeFilter]} onPress={() => setFilter('weekly')}>
          <Text style={[styles.filterText, filter === 'weekly' && styles.activeFilterText]}>Weekly</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterTab, filter === 'occasional' && styles.activeFilter]} onPress={() => setFilter('occasional')}>
          <Text style={[styles.filterText, filter === 'occasional' && styles.activeFilterText]}>Occasional</Text>
        </TouchableOpacity>
      </ScrollView>

      {canManage && (
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Create Program</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={filteredPrograms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.programCard}>
            <View style={styles.programHeader}>
              <Text style={styles.programTitle}>{item.title}</Text>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            </View>
            <Text style={styles.programType}>{getTypeLabel(item.program_type)}</Text>
            <Text style={styles.programDate}>📅 {item.scheduled_for} {item.time && `at ${item.time}`}</Text>
            {item.location && <Text style={styles.programLocation}>📍 {item.location}</Text>}
            {item.description && <Text style={styles.programDesc} numberOfLines={2}>{item.description}</Text>}
            <View style={styles.programFooter}>
              <Text style={styles.programStatus}>{item.status}</Text>
              {canManage && (
                <TouchableOpacity onPress={() => {
                  Alert.alert('Generate Assignments', 'Generate random assignments for this program?', [
                    { text: 'Cancel' },
                    { text: 'Generate', onPress: () => generateAssignmentsForProgram(item.id) }
                  ]);
                }}>
                  <Text style={styles.assignButton}>Generate Assignments</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No programs found</Text>}
      />

      <Modal visible={modalVisible} animationType="slide">
        <ScrollView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Program</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Title *</Text>
            <TextInput style={styles.input} value={formData.title} onChangeText={(t) => setFormData({...formData, title: t})} />

            <Text style={styles.label}>Program Type *</Text>
            <View style={styles.typeRow}>
              {(['annual', 'monthly', 'weekly', 'occasional'] as ProgramType[]).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeButton, formData.program_type === type && styles.typeButtonActive]}
                  onPress={() => setFormData({...formData, program_type: type})}
                >
                  <Text style={[styles.typeButtonText, formData.program_type === type && styles.typeButtonTextActive]}>
                    {getTypeLabel(type)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Date *</Text>
            <TextInput style={styles.input} value={formData.scheduled_for} onChangeText={(t) => setFormData({...formData, scheduled_for: t})} placeholder="YYYY-MM-DD" />

            <Text style={styles.label}>Time</Text>
            <TextInput style={styles.input} value={formData.time} onChangeText={(t) => setFormData({...formData, time: t})} placeholder="HH:MM" />

            <Text style={styles.label}>Location</Text>
            <TextInput style={styles.input} value={formData.location} onChangeText={(t) => setFormData({...formData, location: t})} />

            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, styles.textArea]} value={formData.description} onChangeText={(t) => setFormData({...formData, description: t})} multiline numberOfLines={4} />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Create Program</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  filterBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#eee' },
  filterTab: { paddingHorizontal: 16, paddingVertical: 10 },
  activeFilter: { borderBottomWidth: 2, borderBottomColor: '#007AFF' },
  filterText: { color: '#666' },
  activeFilterText: { color: '#007AFF', fontWeight: '600' },
  addButton: { backgroundColor: '#007AFF', margin: 12, padding: 12, borderRadius: 8, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '600' },
  list: { padding: 12 },
  programCard: { backgroundColor: '#f9f9f9', padding: 14, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  programHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  programTitle: { fontSize: 18, fontWeight: '600', flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  programType: { color: '#007AFF', fontSize: 12, marginTop: 2 },
  programDate: { fontSize: 13, color: '#333', marginTop: 6 },
  programLocation: { fontSize: 13, color: '#333', marginTop: 4 },
  programDesc: { fontSize: 13, color: '#666', marginTop: 6 },
  programFooter: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  programStatus: { fontSize: 11, color: '#666', textTransform: 'capitalize' },
  assignButton: { color: '#007AFF', fontSize: 12, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 40 },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 20, fontWeight: '600' },
  closeButton: { fontSize: 24, color: '#666' },
  form: { padding: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, fontSize: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#f0f0f0' },
  typeButtonActive: { backgroundColor: '#007AFF' },
  typeButtonText: { color: '#333', fontSize: 13 },
  typeButtonTextActive: { color: '#fff' },
  saveButton: { backgroundColor: '#007AFF', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
