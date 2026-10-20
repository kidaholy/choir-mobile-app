import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '@/contexts/auth';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from 'react-native';

export default function HomeScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { member, isAdmin, isSuperAdmin, isTreasurer, isProgramCoordinator, isChoirAdmin, role, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/auth');
  };

  const getRoleDisplay = () => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'choir_admin': return 'Choir Admin';
      case 'treasurer': return 'Treasurer';
      case 'program_coordinator': return 'Program Coordinator';
      default: return 'Choir Member';
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>{getGreeting()},</Text>
          <Text style={[styles.name, { color: colors.text }]}>{member?.full_name?.split(' ')[0] || 'Member'} 👋</Text>
          <Text style={[styles.roleText, { color: colors.primary }]}>{getRoleDisplay()}</Text>
        </View>
        <TouchableOpacity style={[styles.avatar, { backgroundColor: colors.primaryLight }]}
          onPress={() => router.push('/(tabs)/members')}>
          <Ionicons name="person" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.progressCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressTitle, { color: colors.text }]}>Daily Progress</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </View>
        <View style={styles.progressContent}>
          <View style={[styles.progressCircle, { borderColor: colors.primaryLight }]}>
            <Text style={[styles.progressPercent, { color: colors.primary }]}>72%</Text>
          </View>
          <View style={styles.progressStats}>
            <Text style={[styles.progressMainText, { color: colors.text }]}>4 of 6 tasks done</Text>
            <Text style={[styles.progressSubText, { color: colors.success }]}>Keep going! You're doing great!</Text>
          </View>
        </View>
        <View style={styles.statsGrid}>
          <View style={[styles.statBox, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <Text style={[styles.statNumber, { color: colors.text }]}>12</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Tasks</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="time" size={20} color={colors.warning} />
            <Text style={[styles.statNumber, { color: colors.text }]}>4</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>In Progress</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#D1FAE5' }]}>
            <Ionicons name="checkmark-done" size={20} color={colors.success} />
            <Text style={[styles.statNumber, { color: colors.text }]}>8</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Completed</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <Text style={[styles.statNumber, { color: colors.text }]}>0</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Overdue</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
      <View style={styles.quickActionsGrid}>
        <TouchableOpacity style={[styles.actionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} onPress={() => router.push('/(tabs)/programs')}>
          <View style={[styles.actionIcon, { backgroundColor: '#DBEAFE' }]}>
            <Ionicons name="calendar" size={24} color={colors.info} />
          </View>
          <Text style={[styles.actionText, { color: colors.text }]}>Programs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} onPress={() => router.push('/(tabs)/songs')}>
          <View style={[styles.actionIcon, { backgroundColor: '#FCE7F3' }]}>
            <Ionicons name="musical-notes" size={24} color="#EC4899" />
          </View>
          <Text style={[styles.actionText, { color: colors.text }]}>Songs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} onPress={() => router.push('/(tabs)/members')}>
          <View style={[styles.actionIcon, { backgroundColor: '#EDE9FE' }]}>
            <Ionicons name="people" size={24} color={colors.primary} />
          </View>
          <Text style={[styles.actionText, { color: colors.text }]}>Members</Text>
        </TouchableOpacity>
        {(isTreasurer || isSuperAdmin) && (
          <TouchableOpacity style={[styles.actionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} onPress={() => router.push('/(tabs)/contributions')}>
            <View style={[styles.actionIcon, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="cash" size={24} color={colors.success} />
            </View>
            <Text style={[styles.actionText, { color: colors.text }]}>Finance</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tasksHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Today's Activities</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/programs')}>
          <Text style={[styles.seeAll, { color: colors.primary }]}>See All</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.taskCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.taskItem}>
          <Ionicons name="checkmark-circle-outline" size={24} color={colors.textSecondary} />
          <View style={styles.taskInfo}>
            <Text style={[styles.taskTitle, { color: colors.text }]}>Choir Practice</Text>
            <Text style={[styles.taskTime, { color: colors.textSecondary }]}>09:00 AM</Text>
          </View>
        </View>
        <View style={styles.taskDivider} />
        <View style={styles.taskItem}>
          <Ionicons name="ellipse-outline" size={24} color={colors.textSecondary} />
          <View style={styles.taskInfo}>
            <Text style={[styles.taskTitle, { color: colors.text }]}>Sunday Service Prep</Text>
            <Text style={[styles.taskTime, { color: colors.textSecondary }]}>11:00 AM</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 14,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 2,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  progressCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPercent: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressStats: {
    flex: 1,
  },
  progressMainText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  progressSubText: {
    fontSize: 13,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    gap: 4,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 11,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    width: '47%',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    gap: 10,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tasksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '600',
  },
  taskCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  taskDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  taskTime: {
    fontSize: 13,
    marginTop: 2,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    marginTop: 8,
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
});
