import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { useAuth } from '@/contexts/auth';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AssignmentRole } from '@/lib/types';

export default function DutyCategoriesScreen() {
  const { isProgramCoordinator, isChoirAdmin, isSuperAdmin } = useAuth();
  const [categories, setCategories] = useState<AssignmentRole[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<AssignmentRole | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', sort_order: '0' });
  
  const canManage = isProgramCoordinator || isChoirAdmin || isSuperAdmin;

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const q = query(collection(db, 'dutyCategories'), orderBy('sort_order'));
      const snap = await getDocs(q);
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentRole)));
    } catch (error) {
      console.error(error);
    }
  };

  const handleSave = async () => {
    if (!formData.name) {
      Alert.alert('Error', 'Name required');
      return;
    }
    try {
      if (editing) {
        await updateDoc(doc(db, 'dutyCategories', editing.id), {
          ...formData,
          sort_order: parseInt(formData.sort_order) || 0,
          updated_at: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'dutyCategories'), {
          ...formData,
          sort_order: parseInt(formData.sort_order) || 0,
          is_active: true,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      }
      Alert.alert('Success', 'Saved');
      setModalVisible(false);
      setEditing(null);
      setFormData({ name: '', description: '', sort_order: '0' });
      fetchCategories();
    } catch (error) {
      Alert.alert('Error', 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete', 'Are you sure?', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteDoc(doc(db, 'dutyCategories', id));
        fetchCategories();
      }}
    ]);
  };

  const openEdit = (cat: AssignmentRole) => {
    setEditing(cat);
    setFormData({ name: cat.name, description: cat.description || '', sort_order: String(cat.sort_order) });
    setModalVisible(true);
  };

  return (
    <View style={styles.container}>
      {canManage && (
        <TouchableOpacity style={styles.addButton} onPress={() => { setEditing(null); setFormData({ name: '', description: '', sort_order: '0' }); setModalVisible(true); }}>
          <Text style={styles.addButtonText}>+ Add Duty Category</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => canManage && openEdit(item)}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            {item.description && <Text style={styles.cardDesc}>{item.description}</Text>}
            <Text style={styles.cardOrder}>Order: {item.sort_order}</Text>
            {canManage && (
              <TouchableOpacity onPress={() => handleDelete(item.id)}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No categories</Text>}
      />

      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>{editing ? 'Edit' : 'Add'} Duty Category</Text>
          <TextInput style={styles.input} placeholder="Name *" value={formData.name} onChangeText={(t) => setFormData({...formData, name: t})} />
          <TextInput style={[styles.input, styles.textArea]} placeholder="Description" value={formData.description} onChangeText={(t) => setFormData({...formData, description: t})} multiline />
          <TextInput style={styles.input} placeholder="Sort Order" value={formData.sort_order} onChangeText={(t) => setFormData({...formData, sort_order: t})} keyboardType="numeric" />
          <View style={styles.modalButtons}>
            <TouchableOpacity style={[styles.modalButton, styles.cancel]} onPress={() => setModalVisible(false)}>
              <Text>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.save]} onPress={handleSave}>
              <Text style={{ color: '#fff' }}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  addButton: { backgroundColor: '#007AFF', margin: 12, padding: 12, borderRadius: 8, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '600' },
  list: { padding: 12 },
  card: { backgroundColor: '#f9f9f9', padding: 14, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardDesc: { fontSize: 13, color: '#666', marginTop: 4 },
  cardOrder: { fontSize: 12, color: '#999', marginTop: 4 },
  deleteText: { color: '#FF3B30', marginTop: 8, fontSize: 13 },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 40 },
  modalContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, marginBottom: 12 },
  textArea: { height: 80, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalButton: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center' },
  cancel: { backgroundColor: '#f0f0f0' },
  save: { backgroundColor: '#007AFF' },
});
