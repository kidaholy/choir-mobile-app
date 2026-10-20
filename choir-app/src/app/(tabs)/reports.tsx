import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '@/contexts/auth';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Member, Program, Contribution, Payment, Expense, ProgramAssignment } from '@/lib/types';

export default function ReportsScreen() {
  const { isSuperAdmin, isChoirAdmin, isTreasurer, isProgramCoordinator } = useAuth();
  const [stats, setStats] = useState({
    members: 0,
    activeMembers: 0,
    programs: 0,
    completedPrograms: 0,
    assignments: 0,
    completedAssignments: 0,
    totalExpected: 0,
    totalCollected: 0,
    totalExpenses: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [memSnap, progSnap, assignSnap, contribSnap, expSnap] = await Promise.all([
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'programs')),
        getDocs(collection(db, 'programAssignments')),
        getDocs(collection(db, 'contributions')),
        getDocs(collection(db, 'expenses')),
      ]);

      const members = memSnap.docs.map(d => d.data() as Member);
      const programs = progSnap.docs.map(d => d.data() as Program);
      const assignments = assignSnap.docs.map(d => d.data() as ProgramAssignment);
      const contributions = contribSnap.docs.map(d => d.data() as Contribution);
      const expenses = expSnap.docs.map(d => d.data() as Expense);

      setStats({
        members: members.length,
        activeMembers: members.filter(m => m.status === 'active' || m.is_active).length,
        programs: programs.length,
        completedPrograms: programs.filter(p => p.status === 'completed').length,
        assignments: assignments.length,
        completedAssignments: assignments.filter(a => a.status === 'completed').length,
        totalExpected: contributions.reduce((sum, c) => sum + (c.expected_amount || 0), 0),
        totalCollected: contributions.reduce((sum, c) => sum + (c.total_paid || 0), 0),
        totalExpenses: expenses.reduce((sum, e) => sum + (e.amount || 0), 0),
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Reports & Analytics</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Membership</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.members}</Text>
            <Text style={styles.statLabel}>Total Members</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#34C759' }]}>{stats.activeMembers}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Programs</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.programs}</Text>
            <Text style={styles.statLabel}>Total Programs</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#34C759' }]}>{stats.completedPrograms}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>
        <Text style={styles.completionRate}>
          Completion Rate: {stats.programs > 0 ? Math.round((stats.completedPrograms / stats.programs) * 100) : 0}%
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assignments</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.assignments}</Text>
            <Text style={styles.statLabel}>Total Assignments</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#34C759' }]}>{stats.completedAssignments}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>
      </View>

      {(isTreasurer || isSuperAdmin) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Finance</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>₵{stats.totalExpected.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Expected</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#34C759' }]}>₵{stats.totalCollected.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Collected</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#FF3B30' }]}>₵{stats.totalExpenses.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Expenses</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>₵{(stats.totalCollected - stats.totalExpenses).toFixed(0)}</Text>
              <Text style={styles.statLabel}>Net Balance</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
  statValue: { fontSize: 22, fontWeight: 'bold' },
  statLabel: { fontSize: 11, color: '#666', marginTop: 4 },
  completionRate: { textAlign: 'center', marginTop: 8, color: '#666', fontSize: 13 },
});
