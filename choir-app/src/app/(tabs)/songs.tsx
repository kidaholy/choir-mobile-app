import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { useAuth } from '@/contexts/auth';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Song } from '@/lib/types';

export default function SongsScreen() {
  const { isChoirAdmin, isSuperAdmin, member } = useAuth();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    lyrics: '',
    language: '',
    category: '',
    author: '',
    source: '',
    notes: '',
  });

  const canEdit = isChoirAdmin || isSuperAdmin;

  useEffect(() => {
    fetchSongs();
  }, []);

  const fetchSongs = async () => {
    try {
      const q = query(collection(db, 'songs'), orderBy('title'));
      const querySnapshot = await getDocs(q);
      const songsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Song[];
      setSongs(songsData);
    } catch (error) {
      console.error('Error fetching songs:', error);
      Alert.alert('Error', 'Failed to load songs');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.lyrics) {
      Alert.alert('Error', 'Title and lyrics are required');
      return;
    }

    try {
      if (editingSong) {
        await updateDoc(doc(db, 'songs', editingSong.id), {
          ...formData,
          updated_at: serverTimestamp(),
        });
        Alert.alert('Success', 'Song updated successfully');
      } else {
        await addDoc(collection(db, 'songs'), {
          ...formData,
          is_public: true,
          created_by: member?.id,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
        Alert.alert('Success', 'Song added successfully');
      }
      setModalVisible(false);
      setEditingSong(null);
      resetForm();
      fetchSongs();
    } catch (error) {
      console.error('Error saving song:', error);
      Alert.alert('Error', 'Failed to save song');
    }
  };

  const handleDelete = async (songId: string) => {
    Alert.alert('Confirm Delete', 'Are you sure you want to delete this song?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'songs', songId));
            fetchSongs();
            Alert.alert('Success', 'Song deleted');
          } catch (error) {
            console.error('Error deleting song:', error);
            Alert.alert('Error', 'Failed to delete song');
          }
        },
      },
    ]);
  };

  const openEdit = (song: Song) => {
    setEditingSong(song);
    setFormData({
      title: song.title,
      lyrics: song.lyrics,
      language: song.language || '',
      category: song.category || '',
      author: song.author || '',
      source: song.source || '',
      notes: song.notes || '',
    });
    setModalVisible(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      lyrics: '',
      language: '',
      category: '',
      author: '',
      source: '',
      notes: '',
    });
  };

  const filteredSongs = songs.filter(song =>
    song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    song.lyrics.toLowerCase().includes(searchQuery.toLowerCase()) ||
    song.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderSong = ({ item }: { item: Song }) => (
    <TouchableOpacity style={styles.songCard} onPress={() => openEdit(item)}>
      <Text style={styles.songTitle}>{item.title}</Text>
      {item.category && <Text style={styles.songCategory}>{item.category}</Text>}
      {item.author && <Text style={styles.songAuthor}>by {item.author}</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search songs..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {canEdit && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setEditingSong(null);
              resetForm();
              setModalVisible(true);
            }}
          >
            <Text style={styles.addButtonText}>+ Add Song</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredSongs}
        renderItem={renderSong}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {loading ? 'Loading...' : 'No songs found'}
          </Text>
        }
      />

      <Modal visible={modalVisible} animationType="slide">
        <ScrollView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingSong ? 'Edit Song' : 'Add New Song'}
            </Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              value={formData.title}
              onChangeText={(text) => setFormData({ ...formData, title: text })}
            />

            <Text style={styles.label}>Lyrics *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.lyrics}
              onChangeText={(text) => setFormData({ ...formData, lyrics: text })}
              multiline
              numberOfLines={10}
            />

            <Text style={styles.label}>Category</Text>
            <TextInput
              style={styles.input}
              value={formData.category}
              onChangeText={(text) => setFormData({ ...formData, category: text })}
              placeholder="e.g., Worship, Praise, Thanksgiving"
            />

            <Text style={styles.label}>Language</Text>
            <TextInput
              style={styles.input}
              value={formData.language}
              onChangeText={(text) => setFormData({ ...formData, language: text })}
            />

            <Text style={styles.label}>Author</Text>
            <TextInput
              style={styles.input}
              value={formData.author}
              onChangeText={(text) => setFormData({ ...formData, author: text })}
            />

            <Text style={styles.label}>Source</Text>
            <TextInput
              style={styles.input}
              value={formData.source}
              onChangeText={(text) => setFormData({ ...formData, source: text })}
            />

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.notes}
              onChangeText={(text) => setFormData({ ...formData, notes: text })}
              multiline
              numberOfLines={4}
            />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>

            {editingSong && canEdit && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => {
                  setModalVisible(false);
                  handleDelete(editingSong.id);
                }}
              >
                <Text style={styles.deleteButtonText}>Delete Song</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  songCard: {
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  songTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  songCategory: {
    fontSize: 14,
    color: '#007AFF',
    marginBottom: 2,
  },
  songAuthor: {
    fontSize: 12,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 40,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
  },
  form: {
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 8,
    fontSize: 16,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
