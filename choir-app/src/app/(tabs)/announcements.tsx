import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { useAuth } from '@/contexts/auth';
import { collection, getDocs, addDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Announcement } from '@/lib/types';

export default function AnnouncementsScreen() {
  const { isChoirAdmin, isSuperAdmin, isProgramCoordinator, member } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({ title: '', message: '' });
  
  const canPost = isChoirAdmin || isSuperAdmin || isProgramCoordinator;

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const q = query(collection(db, 'announcements'), orderBy('created_at', 'desc'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
      setAnnouncements(data);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    if (!formData.title || !formData.message) {
      Alert.alert('Error', 'Title and message required');
      return;
    }
    try {
      await addDoc(collection(db, 'announcements'), {
        ...formData,
        is_published: true,
        created_by: member?.id,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      Alert.alert('Success', 'Announcement posted');
      setModalVisible(false);
      setFormData({ title: '', message: '' });
      fetchAnnouncements();
    } catch (error) {
      Alert.alert('Error', 'Failed to post');
    }
  };

  return (
    <View style={styles.container}>
      {canPost && (
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Post Announcement</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={announcements}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.announcementCard}>
            <Text style={styles.announcementTitle}>{item.title}</Text>
            <Text style={styles.announcementMessage}>{item.message}</Text>
            <Text style={styles.announcementDate}>
              {item.created_at?.toDate?.()?.toLocaleDateString() || ''}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No announcements</Text>}
      />

      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>New Announcement</Text>
          <TextInput
            style={styles.input}
            placeholder="Title"
            value={formData.title}
            onChangeText={(t) => setFormData({...formData, title: t})}
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Message"
            value={formData.message}
            onChangeText={(t) => setFormData({...formData, message: t})}
            multiline
            numberOfLines={6}
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setModalVisible(false)}>
              <Text>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.postButton]} onPress={handlePost}>
              <Text style={{ color: '#fff' }}>Post</Text>
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
  announcementCard: { backgroundColor: '#f9f9f9', padding: 14, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  announcementTitle: { fontSize: 16, fontWeight: '600' },
  announcementMessage: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  announcementDate: { fontSize: 12, color: '#666', marginTop: 8 },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 40 },
  modalContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, marginBottom: 12 },
  textArea: { height: 120, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalButton: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: '#f0f0f0' },
  postButton: { backgroundColor: '#007AFF' },
});
