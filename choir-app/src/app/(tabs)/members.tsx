import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { useAuth } from '@/contexts/auth';
import { collection, getDocs, updateDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logAudit } from '@/lib/audit';
import type { Member, UserRole } from '@/lib/types';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'member', label: 'Choir Member' },
  { value: 'program_coordinator', label: 'Program Coordinator' },
  { value: 'treasurer', label: 'Treasurer' },
  { value: 'choir_admin', label: 'Choir Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];

export default function MembersScreen() {
  const { isSuperAdmin, isChoirAdmin, member: currentMember } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('member');
  const [voicePart, setVoicePart] = useState('');

  const canManage = isSuperAdmin || isChoirAdmin;

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const q = query(collection(db, 'members'), orderBy('full_name'));
      const querySnapshot = await getDocs(q);
      const membersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Member[];
      setMembers(membersData);
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateMember = async () => {
    if (!selectedMember) return;

    try {
      const updates: any = {
        updated_at: serverTimestamp(),
        voice_part: voicePart,
      };

      if (canManage && isSuperAdmin && newRole !== selectedMember.role) {
        updates.role = newRole;
        updates.is_admin = newRole === 'choir_admin' || newRole === 'super_admin';
        await logAudit(
          currentMember?.id || '',
          currentMember?.full_name || 'Unknown',
          'role_changed',
          'member',
          selectedMember.id,
          { oldRole: selectedMember.role, newRole }
        );
      }

      await updateDoc(doc(db, 'members', selectedMember.id), updates);
      await logAudit(
        currentMember?.id || '',
        currentMember?.full_name || 'Unknown',
        'member_updated',
        'member',
        selectedMember.id,
        { voice_part: voicePart }
      );
      Alert.alert('Success', 'Member updated successfully');
      setModalVisible(false);
      fetchMembers();
    } catch (error) {
      console.error('Error updating member:', error);
      Alert.alert('Error', 'Failed to update member');
    }
  };

  const toggleStatus = async (memberToUpdate: Member) => {
    if (!canManage) return;

    try {
      const newStatus = memberToUpdate.status === 'active' ? 'inactive' : 'active';
      const newIsActive = newStatus === 'active';
      
      await updateDoc(doc(db, 'members', memberToUpdate.id), {
        status: newStatus,
        is_active: newIsActive,
        updated_at: serverTimestamp(),
      });
      
      fetchMembers();
      Alert.alert('Success', `Member ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
    } catch (error) {
      console.error('Error toggling status:', error);
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const getRoleLabel = (role: UserRole) => {
    return ROLES.find(r => r.value === role)?.label || role;
  };

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case 'super_admin': return '#FF3B30';
      case 'choir_admin': return '#FF9500';
      case 'treasurer': return '#34C759';
      case 'program_coordinator': return '#007AFF';
      default: return '#8E8E93';
    }
  };

  const filteredMembers = members.filter(m =>
    m.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search members..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredMembers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.memberCard}
            onPress={() => {
              if (canManage) {
                setSelectedMember(item);
                setNewRole(item.role || 'member');
                setVoicePart(item.voice_part || '');
                setModalVisible(true);
              }
            }}
          >
            <View style={styles.memberHeader}>
              <Text style={styles.memberName}>{item.full_name}</Text>
              <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) }]}>
                <Text style={styles.roleBadgeText}>{getRoleLabel(item.role)}</Text>
              </View>
            </View>
            {item.email && <Text style={styles.memberDetail}>📧 {item.email}</Text>}
            {item.phone && <Text style={styles.memberDetail}>📞 {item.phone}</Text>}
            {item.voice_part && <Text style={styles.memberDetail}>🎤 {item.voice_part}</Text>}
            <View style={styles.memberFooter}>
              <Text style={[styles.statusText, item.status === 'active' ? styles.statusActive : styles.statusInactive]}>
                {item.status || (item.is_active ? 'active' : 'inactive')}
              </Text>
              {canManage && item.id !== currentMember?.id && (
                <TouchableOpacity onPress={() => toggleStatus(item)}>
                  <Text style={styles.toggleButton}>
                    {item.status === 'active' || item.is_active ? 'Deactivate' : 'Activate'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No members found</Text>}
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Member</Text>
            <Text style={styles.modalSubtitle}>{selectedMember?.full_name}</Text>

            {isSuperAdmin && (
              <>
                <Text style={styles.label}>Role</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleSelector}>
                  {ROLES.map(role => (
                    <TouchableOpacity
                      key={role.value}
                      style={[styles.roleOption, newRole === role.value && styles.roleOptionActive]}
                      onPress={() => setNewRole(role.value)}
                    >
                      <Text style={[styles.roleOptionText, newRole === role.value && styles.roleOptionTextActive]}>
                        {role.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={styles.label}>Voice Part</Text>
            <TextInput
              style={styles.input}
              value={voicePart}
              onChangeText={setVoicePart}
              placeholder="e.g., Soprano, Alto, Tenor, Bass"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={updateMember}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  searchInput: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8 },
  list: { padding: 12 },
  memberCard: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  memberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  memberName: { fontSize: 16, fontWeight: '600', flex: 1 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  roleBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  memberDetail: { fontSize: 13, color: '#333', marginTop: 2 },
  memberFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  statusText: { fontSize: 12, textTransform: 'capitalize' },
  statusActive: { color: '#34C759' },
  statusInactive: { color: '#FF3B30' },
  toggleButton: { color: '#007AFF', fontSize: 12, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  modalSubtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  roleSelector: { flexGrow: 0 },
  roleOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: '#f0f0f0', marginRight: 6 },
  roleOptionActive: { backgroundColor: '#007AFF' },
  roleOptionText: { fontSize: 12, color: '#333' },
  roleOptionTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, fontSize: 16 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 24 },
  modalButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: '#f0f0f0' },
  cancelButtonText: { color: '#333', fontWeight: '600' },
  saveButton: { backgroundColor: '#007AFF' },
  saveButtonText: { color: '#fff', fontWeight: '600' },
});
