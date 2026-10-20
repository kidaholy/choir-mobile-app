import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useColorScheme } from 'react-native';

export default function MoreScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const menuItems = [
    { title: 'Contributions & Finance', icon: 'cash-outline', route: '/(tabs)/contributions', color: '#10B981' },
    { title: 'Assignments', icon: 'clipboard-outline', route: '/(tabs)/assignments', color: '#3B82F6' },
    { title: 'Duty Categories', icon: 'list-outline', route: '/(tabs)/duty-categories', color: '#F59E0B' },
    { title: 'Announcements', icon: 'megaphone-outline', route: '/(tabs)/announcements', color: '#EF4444' },
    { title: 'Reports & Analytics', icon: 'bar-chart-outline', route: '/(tabs)/reports', color: '#8B5CF6' },
    { title: 'Audit Logs', icon: 'document-text-outline', route: '/(tabs)/audit-logs', color: '#6B7280' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>More</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Manage all choir activities</Text>

      <View style={styles.menuContainer}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.menuItem, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: item.color + '15' }]}>
              <Ionicons name={item.icon as any} size={24} color={item.color} />
            </View>
            <Text style={[styles.menuItemText, { color: colors.text }]}>{item.title}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  menuContainer: {
    gap: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
}); 
