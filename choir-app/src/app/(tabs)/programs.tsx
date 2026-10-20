import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { useAuth } from '@/contexts/auth';
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp, updateDoc, doc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateAssignments } from '@/lib/assignment';
import { logAudit } from '@/lib/audit';
import type { Program, ProgramType, ProgramStatus, Member, AssignmentRole, ProgramAssignment } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from 'react-native';

export default function ProgramsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { isProgramCoordinator, isChoirAdmin, isSuperAdmin, member } = useAuth();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<AssignmentRole[]>([]);
  const [assignments, setAssignments] = useState<ProgramAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ProgramType | 'all'>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [selectedResponsibilities, setSelectedResponsibilities] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    program_type: 'weekly' as ProgramType,
    scheduled_for: '',
    time: '',
    end_time: '',
    location: '',
    description: '',
    status: 'planned' as ProgramStatus,
    responsible_person: '',
    notes: '',
    recurrence_rule: '',
  });

  const canManage = isProgramCoordinator || isChoirAdmin || isSuperAdmin;

  useEffect(() => {
    fetchPrograms();
    fetchMembersAndRoles();
    fetchAssignments();
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

  const fetchAssignments = async () => {
    try {
      const snap = await getDocs(collection(db, 'programAssignments'));
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProgramAssignment)));
    } catch (error) {
      console.error(error);
    }
  };

  const generateAssignmentsForProgram = async (program: Program) => {
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

      // Get existing assignments for this program
      const existingAssignments = assignments
        .filter(a => a.program_id === program.id)
        .map(a => ({ role_id: a.role_id, member_id: a.member_id }));

      // Get history
      const history = assignments
        .filter(a => a.status === 'completed')
        .map(a => ({ member_id: a.member_id, assigned_on: a.assigned_on }));

      const result = generateAssignments({
        roles: roles.filter(r => r.is_active).map(r => ({ id: r.id, name: r.name, sort_order: r.sort_order })),
        members: activeMembers.map(m => ({ id: m.id, full_name: m.full_name, is_active: true })),
        history,
        existing: existingAssignments,
      });

      if (result.unassigned_role_ids.length > 0) {
        Alert.alert(
          'Warning',
          `Not enough eligible members to fill ${result.unassigned_role_ids.length} role(s). Some responsibilities will be unfilled.`
        );
      }

      // Remove old assignments if regenerating
      if (existingAssignments.length > 0) {
        Alert.alert(
          'Regenerate Assignments',
          'This will replace existing assignments. Continue?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Regenerate',
              onPress: async () => {
                // Delete existing
                for (const existing of existingAssignments) {
                  const toDelete = assignments.find(a => a.program_id === program.id && a.role_id === existing.role_id);
                  if (toDelete) {
                    // Mark as cancelled instead of deleting to preserve history
                    await updateDoc(doc(db, 'programAssignments', toDelete.id), {
                      status: 'cancelled',
                      updated_at: serverTimestamp(),
                    });
                  }
                }
                // Create new assignments
                for (const assignment of result.assignments) {
                  await addDoc(collection(db, 'programAssignments'), {
                    program_id: program.id,
                    member_id: assignment.member_id,
                    role_id: assignment.role_id,
                    status: 'draft',
                    assigned_on: program.scheduled_for,
                    is_draft: true,
                    created_at: serverTimestamp(),
                    updated_at: serverTimestamp(),
                  });
                }
                await logAudit(
                  member?.id || '',
                  member?.full_name || 'Unknown',
                  'assignment_created',
                  'program',
                  program.id,
                  { count: result.assignments.length, regenerated: true }
                );
                Alert.alert('Success', `Generated ${result.assignments.length} assignments`);
                fetchAssignments();
              }
            }
          ]
        );
        return;
      }

      for (const assignment of result.assignments) {
        await addDoc(collection(db, 'programAssignments'), {
          program_id: program.id,
          member_id: assignment.member_id,
          role_id: assignment.role_id,
          status: 'draft',
          assigned_on: program.scheduled_for,
          is_draft: true,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      }

      await logAudit(
        member?.id || '',
        member?.full_name || 'Unknown',
        'assignment_created',
        'program',
        program.id,
        { count: result.assignments.length }
      );

      Alert.alert('Success', `Generated ${result.assignments.length} assignments`);
      fetchAssignments();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to generate assignments');
    }
  };

  const publishAssignments = async (programId: string) => {
    try {
      const programAssignments = assignments.filter(a => a.program_id === programId && a.status === 'draft');
      for (const assignment of programAssignments) {
        await updateDoc(doc(db, 'programAssignments', assignment.id), {
          status: 'assigned',
          is_draft: false,
          published: true,
          updated_at: serverTimestamp(),
        });
      }
      await logAudit(
        member?.id || '',
        member?.full_name || 'Unknown',
        'assignment_published',
        'program',
        programId,
        { count: programAssignments.length }
      );
      Alert.alert('Success', 'Assignments published');
      fetchAssignments();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to publish assignments');
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
        recurrence_id: formData.program_type === 'weekly' || formData.program_type === 'monthly' ? `${Date.now()}` : null,
        created_by: member?.id,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      Alert.alert('Success', 'Program created successfully');
      setModalVisible(false);
      setFormData({
        title: '',
        program_type: 'weekly',
        scheduled_for: '',
        time: '',
        end_time: '',
        location: '',
        description: '',
        status: 'planned',
        responsible_person: '',
        notes: '',
        recurrence_rule: '',
      });
      fetchPrograms();
    } catch (error) {
      console.error('Error saving program:', error);
      Alert.alert('Error', 'Failed to save program');
    }
  };

  const getStatusColor = (status: ProgramStatus) => {
    switch (status) {
      case 'completed': return colors.success;
      case 'cancelled': return colors.danger;
      case 'postponed': return colors.warning;
      case 'upcoming': return colors.info;
      default: return colors.textSecondary;
    }
  };

  const getTypeLabel = (type: ProgramType) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const filteredPrograms = filter === 'all' 
    ? programs 
    : programs.filter(p => p.program_type === filter);

  const getProgramAssignments = (programId: string) => {
    return assignments.filter(a => a.program_id === programId);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Programs & Assignments</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Manage choir schedules and duties</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
        {(['all', 'annual', 'monthly', 'weekly', 'occasional'] as const).map(type => (
          <TouchableOpacity 
            key={type}
            style={[styles.filterTab, filter === type && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]} 
            onPress={() => setFilter(type)}
          >
            <Text style={[styles.filterText, { color: filter === type ? colors.primary : colors.textSecondary }, filter === type && styles.activeFilterText]}>
              {type === 'all' ? 'All' : getTypeLabel(type)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {canManage && (
        <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addButtonText}>Create Program</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={filteredPrograms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const programAssignments = getProgramAssignments(item.id);
          const draftCount = programAssignments.filter(a => a.status === 'draft').length;
          const assignedCount = programAssignments.filter(a => a.status === 'assigned').length;
          
          return (
            <View style={[styles.programCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <View style={styles.programHeader}>
                <View style={styles.programTitleRow}>
                  <Text style={[styles.programTitle, { color: colors.text }]}>{item.title}</Text>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
                </View>
                <View style={[styles.typeBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.typeBadgeText, { color: colors.primary }]}>{getTypeLabel(item.program_type)}</Text>
                </View>
              </View>
              
              <View style={styles.programDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.detailText, { color: colors.textSecondary }]}>{item.scheduled_for} {item.time && `• ${item.time}`}</Text>
                </View>
                {item.location && (
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                    <Text style={[styles.detailText, { color: colors.textSecondary }]}>{item.location}</Text>
                  </View>
                )}
                {item.description && (
                  <Text style={[styles.programDesc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
                )}
              </View>

              <View style={styles.assignmentInfo}>
                <Text style={[styles.assignmentInfoText, { color: colors.textSecondary }]}>
                  Assignments: {assignedCount} assigned • {draftCount} draft
                </Text>
              </View>

              <View style={styles.programFooter}>
                <Text style={[styles.programStatus, { color: colors.textSecondary }]}>{item.status.toUpperCase()}</Text>
                {canManage && (
                  <View style={styles.actionButtons}>
                    {draftCount > 0 && (
                      <TouchableOpacity 
                        style={[styles.smallButton, { backgroundColor: colors.success }]}
                        onPress={() => publishAssignments(item.id)}
                      >
                        <Text style={styles.smallButtonText}>Publish</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity 
                      style={[styles.smallButton, { backgroundColor: colors.primary }]}
                      onPress={() => generateAssignmentsForProgram(item)}
                    >
                      <Text style={styles.smallButtonText}>
                        {programAssignments.length > 0 ? 'Regenerate' : 'Generate'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textSecondary }]}>No programs found</Text>}
      />

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Create Program</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={28} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
            <Text style={[styles.label, { color: colors.text }]}>Program Title *</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.text }]} 
              value={formData.title} 
              onChangeText={(t) => setFormData({...formData, title: t})}
              placeholder="e.g., Sunday Worship Service"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.label, { color: colors.text }]}>Program Type *</Text>
            <View style={styles.typeRow}>
              {(['annual', 'monthly', 'weekly', 'occasional'] as ProgramType[]).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeButton, { backgroundColor: colors.backgroundSelected, borderColor: colors.border }, formData.program_type === type && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setFormData({...formData, program_type: type})}
                >
                  <Text style={[styles.typeButtonText, { color: colors.textSecondary }, formData.program_type === type && { color: '#fff' }]}>
                    {getTypeLabel(type)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Date *</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.text }]} 
              value={formData.scheduled_for} 
              onChangeText={(t) => setFormData({...formData, scheduled_for: t})} 
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.label, { color: colors.text }]}>Time</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.text }]} 
              value={formData.time} 
              onChangeText={(t) => setFormData({...formData, time: t})} 
              placeholder="HH:MM"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.label, { color: colors.text }]}>Location</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.text }]} 
              value={formData.location} 
              onChangeText={(t) => setFormData({...formData, location: t})}
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.label, { color: colors.text }]}>Description</Text>
            <TextInput 
              style={[styles.input, styles.textArea, { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.text }]} 
              value={formData.description} 
              onChangeText={(t) => setFormData({...formData, description: t})} 
              multiline 
              numberOfLines={4}
              placeholderTextColor={colors.textSecondary}
            />

            <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Create Program</Text>
            </TouchableOpacity>
          </ScrollView>
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
  filterBar: { flexGrow: 0, paddingHorizontal: 20, marginBottom: 16 },
  filterTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, borderWidth: 1 },
  filterText: { fontSize: 14, fontWeight: '600' },
  activeFilterText: { fontWeight: '700' },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, padding: 14, borderRadius: 12, gap: 8, marginBottom: 16 },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  programCard: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  programHeader: { marginBottom: 12 },
  programTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  programTitle: { fontSize: 18, fontWeight: 'bold', flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText: { fontSize: 12, fontWeight: '600' },
  programDetails: { gap: 6, marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 13 },
  programDesc: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  assignmentInfo: { marginBottom: 12 },
  assignmentInfoText: { fontSize: 12 },
  programFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  programStatus: { fontSize: 11, fontWeight: '600' },
  actionButtons: { flexDirection: 'row', gap: 8 },
  smallButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  smallButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 16 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 1 },
  modalTitle: { fontSize: 24, fontWeight: 'bold' },
  form: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: { borderWidth: 1, padding: 12, borderRadius: 12, fontSize: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  typeButtonText: { fontSize: 13, fontWeight: '600' },
  saveButton: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32, marginBottom: 40 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
