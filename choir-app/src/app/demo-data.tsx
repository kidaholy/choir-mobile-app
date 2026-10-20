import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from 'react-native';
import { seedDemoData, clearDemoData } from '@/lib/demo-data';
import { useAuth } from '@/contexts/auth';

export default function DemoDataScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSeedData = async () => {
    Alert.alert(
      'Load Demo Data',
      'This will create demo records in the database. Do not run on production data with real records - demo records are marked separately. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load Demo Data',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await seedDemoData();
              Alert.alert('Success', result.message);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to seed demo data');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleClearData = async () => {
    Alert.alert(
      'Clear Demo Data',
      'This will remove ALL records marked as demo data only. Real choir records will NOT be affected. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Demo Data',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await clearDemoData();
              Alert.alert('Success', result.message);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to clear demo data');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  if (!isSuperAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Demo Data</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.content}>
          <Text style={[styles.message, { color: colors.textSecondary }]}>Only Super Admins can manage demo data.</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Demo Data Management</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="flask" size={24} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Demo Data</Text>
          </View>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Load realistic demo data to test all features including programs, assignments, members, songs, and financial records.
            Demo records are clearly marked and can be safely removed without affecting real data.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
          onPress={handleSeedData}
          disabled={loading}
        >
          <Ionicons name="download-outline" size={20} color="#fff" />
          <Text style={styles.buttonText}>Load Demo Data</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.dangerButton, loading && styles.buttonDisabled]}
          onPress={handleClearData}
          disabled={loading}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.buttonText}>Clear Demo Data</Text>
        </TouchableOpacity>

        <View style={[styles.infoCard, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="information-circle" size={20} color={colors.primary} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, { color: colors.primary }]}>Demo Accounts</Text>
            <Text style={[styles.infoText, { color: colors.text }]}>
              After loading, you can test with demo accounts for each role (Super Admin, Choir Admin, Treasurer, Program Coordinator, Member).
              All demo data is marked with isDemo flag for safe cleanup.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  title: { fontSize: 20, fontWeight: 'bold' },
  content: { padding: 20, gap: 20 },
  card: { borderRadius: 16, padding: 20, borderWidth: 1, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: 'bold' },
  cardDescription: { fontSize: 14, lineHeight: 20 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, gap: 8 },
  dangerButton: { backgroundColor: '#EF4444' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  message: { textAlign: 'center', fontSize: 16, marginTop: 40 },
  infoCard: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 12 },
  infoContent: { flex: 1, gap: 4 },
  infoTitle: { fontSize: 14, fontWeight: 'bold' },
  infoText: { fontSize: 13, lineHeight: 18 },
});
