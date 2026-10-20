import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { useAuth } from '@/contexts/auth';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ContributionCategory, Contribution, Payment, Expense, Member } from '@/lib/types';

export default function ContributionsScreen() {
  const { isTreasurer, isSuperAdmin, member } = useAuth();
  const [activeTab, setActiveTab] = useState<'categories' | 'contributions' | 'payments' | 'expenses'>('categories');
  const [categories, setCategories] = useState<ContributionCategory[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'category' | 'contribution' | 'payment' | 'expense'>('category');
  
  const canManage = isTreasurer || isSuperAdmin;

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [catSnap, contribSnap, paySnap, expSnap, memSnap] = await Promise.all([
        getDocs(query(collection(db, 'contributionCategories'), orderBy('name'))),
        getDocs(query(collection(db, 'contributions'), orderBy('created_at', 'desc'))),
        getDocs(query(collection(db, 'payments'), orderBy('payment_date', 'desc'))),
        getDocs(query(collection(db, 'expenses'), orderBy('expense_date', 'desc'))),
        getDocs(query(collection(db, 'members'))),
      ]);

      setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() } as ContributionCategory)));
      setContributions(contribSnap.docs.map(d => ({ id: d.id, ...d.data() } as Contribution)));
      setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
      setExpenses(expSnap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
      setMembers(memSnap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMemberName = (memberId: string) => {
    const m = members.find(mem => mem.id === memberId);
    return m?.full_name || 'Unknown';
  };

  const getCategoryName = (categoryId: string) => {
    const c = categories.find(cat => cat.id === categoryId);
    return c?.name || 'Unknown';
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalCollected = contributions.reduce((sum, c) => sum + c.total_paid, 0);
  const totalExpected = contributions.reduce((sum, c) => sum + c.expected_amount, 0);
  const totalOutstanding = totalExpected - totalCollected;

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'categories' && styles.activeTab]}
          onPress={() => setActiveTab('categories')}
        >
          <Text style={[styles.tabText, activeTab === 'categories' && styles.activeTabText]}>Categories</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'contributions' && styles.activeTab]}
          onPress={() => setActiveTab('contributions')}
        >
          <Text style={[styles.tabText, activeTab === 'contributions' && styles.activeTabText]}>Contributions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'payments' && styles.activeTab]}
          onPress={() => setActiveTab('payments')}
        >
          <Text style={[styles.tabText, activeTab === 'payments' && styles.activeTabText]}>Payments</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'expenses' && styles.activeTab]}
          onPress={() => setActiveTab('expenses')}
        >
          <Text style={[styles.tabText, activeTab === 'expenses' && styles.activeTabText]}>Expenses</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView style={styles.summaryBar}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Expected</Text>
            <Text style={styles.summaryAmount}>₵{totalExpected.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Collected</Text>
            <Text style={[styles.summaryAmount, { color: '#34C759' }]}>₵{totalCollected.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Outstanding</Text>
            <Text style={[styles.summaryAmount, { color: '#FF3B30' }]}>₵{totalOutstanding.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Expenses</Text>
            <Text style={styles.summaryAmount}>₵{totalExpenses.toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>

      {canManage && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setModalType(activeTab === 'categories' ? 'category' : activeTab === 'contributions' ? 'contribution' : activeTab === 'payments' ? 'payment' : 'expense');
            setModalVisible(true);
          }}
        >
          <Text style={styles.addButtonText}>
            + Add {activeTab === 'categories' ? 'Category' : activeTab === 'contributions' ? 'Contribution' : activeTab === 'payments' ? 'Payment' : 'Expense'}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.content}>
        {activeTab === 'categories' && (
          <FlatList
            data={categories}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardSubtitle}>{item.purpose}</Text>
                {item.expected_amount && <Text style={styles.cardDetail}>Expected: ₵{item.expected_amount}</Text>}
                <Text style={styles.statusBadge}>{item.is_active ? 'Active' : 'Inactive'}</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No categories yet</Text>}
          />
        )}

        {activeTab === 'contributions' && (
          <FlatList
            data={contributions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{getMemberName(item.member_id)}</Text>
                <Text style={styles.cardSubtitle}>{getCategoryName(item.category_id)}</Text>
                <Text style={styles.cardDetail}>Expected: ₵{item.expected_amount} | Paid: ₵{item.total_paid}</Text>
                <Text style={styles.cardDetail}>Balance: ₵{item.balance}</Text>
                <Text style={[styles.statusBadge, 
                  item.status === 'fully_paid' && styles.statusPaid,
                  item.status === 'overdue' && styles.statusOverdue
                ]}>{item.status.replace('_', ' ')}</Text>
                {item.is_historical && <Text style={styles.historicalBadge}>Historical</Text>}
              </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No contributions yet</Text>}
          />
        )}

        {activeTab === 'payments' && (
          <FlatList
            data={payments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>₵{item.amount.toFixed(2)}</Text>
                <Text style={styles.cardSubtitle}>{item.payment_date} - {item.payment_method}</Text>
                {item.notes && <Text style={styles.cardDetail}>{item.notes}</Text>}
                {item.is_historical && <Text style={styles.historicalBadge}>Historical</Text>}
              </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No payments yet</Text>}
          />
        )}

        {activeTab === 'expenses' && (
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.description}</Text>
                <Text style={[styles.cardSubtitle, { color: '#FF3B30' }]}>₵{item.amount.toFixed(2)}</Text>
                <Text style={styles.cardDetail}>{item.expense_date}</Text>
                {item.notes && <Text style={styles.cardDetail}>{item.notes}</Text>}
              </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No expenses yet</Text>}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  tabBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { paddingHorizontal: 20, paddingVertical: 12 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#007AFF' },
  tabText: { color: '#666', fontWeight: '500' },
  activeTabText: { color: '#007AFF', fontWeight: '600' },
  summaryBar: { flexGrow: 0, maxHeight: 80 },
  summaryRow: { flexDirection: 'row', padding: 8 },
  summaryCard: { flex: 1, backgroundColor: '#f9f9f9', padding: 8, margin: 4, borderRadius: 8, alignItems: 'center' },
  summaryLabel: { fontSize: 10, color: '#666' },
  summaryAmount: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  addButton: { backgroundColor: '#007AFF', margin: 12, padding: 12, borderRadius: 8, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '600' },
  content: { flex: 1, padding: 12 },
  card: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSubtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  cardDetail: { fontSize: 12, color: '#333', marginTop: 4 },
  statusBadge: { alignSelf: 'flex-start', backgroundColor: '#ddd', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginTop: 6, fontSize: 11, textTransform: 'capitalize' },
  statusPaid: { backgroundColor: '#D1FAE5', color: '#065F46' },
  statusOverdue: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  historicalBadge: { alignSelf: 'flex-start', backgroundColor: '#FEF3C7', color: '#92400E', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginTop: 6, fontSize: 11 },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 40 },
});
