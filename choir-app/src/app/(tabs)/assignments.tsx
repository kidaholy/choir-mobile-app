import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Modal } from 'react-native';
import { useAuth } from '@/contexts/auth';
import { collection, getDocs, query, orderBy, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ProgramAssignment, Program, Member, AssignmentRole } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from 'react-native';

export default function AssignmentsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { isProgramCoordinator, isChoirAdmin, isSuperAdmin } = useAuth();
  const [assignments, setAssignments] = useState<ProgramAssignment[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<AssignmentRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState<ProgramAssignment | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState('');

  const canManage = isProgramCoordinator || isChoirAdmin || isSuperAdmin;

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
  const getProgram = (id: string) => programs.find(p => p.id === id);

  const updateAssignmentStatus = async (assignment: ProgramAssignment, status: string) => {
    try {
      await updateDoc(doc(db, 'programAssignments', assignment.id), {
        status,
        updated_at: serverTimestamp(),
        ...(status === 'completed' ? { completed_on: new Date().toISOString() } : {}),
      });
      fetchData();
      Alert.alert('Success', 'Assignment updated');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to update assignment');
    }
  };

  const openEditModal = (assignment: ProgramAssignment) => {
    setSelectedAssignment(assignment);
    setSelectedMember(assignment.member_id);
    setEditModalVisible(true);
  };

  const saveManualEdit = async () => {
    if (!selectedAssignment || !selectedMember) return;
    try {
      await updateDoc(doc(db, 'programAssignments', selectedAssignment.id), {
        member_id: selectedMember,
        previous_member_id: selectedAssignment.member_id,
        changed_at: serverTimestamp(),
        status: selectedAssignment.status === 'completed' ? 'reassigned' : selectedAssignment.status,
        updated_at: serverTimestamp(),
      });
      setEditModalVisible(false);
      fetchData();
      Alert.alert('Success', 'Assignment updated');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to update assignment');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return colors.success;
      case 'reassigned': return colors.info;
      case 'cancelled': return colors.danger;
      case 'absent': return colors.warning;
      case 'draft': return colors.textSecondary;
      default: return colors.primary;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Assignments</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Manage member duties and statuses</Text>
      </View>

      <FlatList
        data={assignments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const program = getProgram(item.program_id);
          return (
            <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{getProgramTitle(item.program_id)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                  <Text style={styles.statusText}>{item.status}</Text>
                </View>
              </View>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                {program?.scheduled_for} {program?.time && `• ${program.time}`}
              </Text>
              <View style={styles.assignmentRow}>
                <Ionicons name="person-outline" size={18} color={colors.primary} />
                <Text style={[styles.cardDetail, { color: colors.text }]}>{getMemberName(item.member_id)}</Text>
              </View>
              <View style={styles.assignmentRow}>
                <Ionicons name="briefcase-outline" size={18} color={colors.warning} />
                <Text style={[styles.cardDetail, { color: colors.textSecondary }]}>{getRoleName(item.role_id)}</Text>
              </View>
              {canManage && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.primary }]}
                    onPress={() => openEditModal(item)}
                  >
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </TouchableOpacity>
                  {item.status === 'assigned' && (
                    <>
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: colors.success }]}
                        onPress={() => updateAssignmentStatus(item, 'completed')}
                      >
                        <Text style={styles.actionButtonText}>Complete</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: colors.danger }]}
                        onPress={() => updateAssignmentStatus(item, 'absent')}
                      >
                        <Text style={styles.actionButtonText}>Absent</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {item.status === 'completed' && (
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: colors.info }]}
                      onPress={() => updateAssignmentStatus(item, 'reassigned')}
                    >
                      <Text style={styles.actionButtonText}>Reopen</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.textSecondary }]}
                    onPress={() => updateAssignmentStatus(item, 'cancelled')}
                  >
                    <Text style={styles.actionButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textSecondary }]}>No assignments yet</Text>}
      />

      <Modal visible={editModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Assignment</Text>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <Ionicons name="close" size={28} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalContent}>
            <Text style={[styles.label, { color: colors.text }]}>Assign Member</Text>
            <View style={[styles.memberList, { backgroundColor: colors.cardBackground }]}>
              {members.filter(m => m.status === 'active' || m.is_active).map(member => (
                <TouchableOpacity
                  key={member.id}
                  style={[
                    styles.memberItem,
                    { borderColor: colors.border },
                    selectedMember === member.id && { backgroundColor: colors.primaryLight }
                  ]}
                  onPress={() => setSelectedMember(member.id)}
                >
                  <Text style={[styles.memberName, { color: selectedMember === member.id ? colors.primary : colors.text }]}>
                    {member.full_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={saveManualEdit}>
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, paddingTop: 60 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  headerSubtitle: { fontSize: 16 },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  card: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  cardSubtitle: { fontSize: 13, marginBottom: 12 },
  assignmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardDetail: { fontSize: 14, fontWeight: '500' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 16 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 1 },
  modalTitle: { fontSize: 24, fontWeight: 'bold' },
  modalContent: { padding: 20 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  memberList: { borderRadius: 12, maxHeight: 400 },
  memberItem: { padding: 16, borderBottomWidth: 1 },
  memberName: { fontSize: 16 },
  saveButton: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
