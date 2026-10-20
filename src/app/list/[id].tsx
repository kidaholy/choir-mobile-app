import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SyncStatus } from '@/components/sync-status';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useItems, useList, useSyncCtx } from '@/sync/context';
import type { ItemInfo } from '@/sync/types';

function ItemRow({
  item,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ItemInfo;
  onToggle: () => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== item.text) {
      onEdit(next);
    } else {
      setDraft(item.text);
    }
  };

  return (
    <View style={styles.itemRow}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={[styles.checkbox, item.done && styles.checkboxDone]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done }}>
        {item.done ? <ThemedText style={styles.check}>✓</ThemedText> : null}
      </Pressable>

      {editing ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          autoFocus
          returnKeyType="done"
          style={styles.itemInput}
        />
      ) : (
        <Pressable style={styles.itemTextWrap} onPress={() => setEditing(true)}>
          <ThemedText style={[styles.itemText, item.done && styles.itemTextDone]}>
            {item.text}
          </ThemedText>
        </Pressable>
      )}

      <Pressable onPress={onDelete} hitSlop={10} accessibilityLabel="Delete item">
        <ThemedText themeColor="textSecondary" style={styles.deleteX}>
          ✕
        </ThemedText>
      </Pressable>
    </View>
  );
}

export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = Array.isArray(id) ? id[0] : (id ?? '');
  const ctx = useSyncCtx();
  const navigation = useNavigation();
  const list = useList(listId);
  const items = useItems(listId);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  // Adopt the list when this screen mounts: covers deep links, reloads and
  // joins-by-URL — creates the local row (placeholder until peers send the
  // real name), joins the relay room, and pulls anything already shared.
  useEffect(() => {
    if (!ctx || !listId) return;
    void ctx.engine.joinList(listId);
  }, [ctx, listId]);

  const shareList = useCallback(async () => {
    const message = `Join my shared list "${
      list?.name ?? 'Shared list'
    }" in Shared Lists — code: ${listId}`;
    try {
      if (Platform.OS === 'web') {
        const g = globalThis as unknown as {
          navigator?: { clipboard?: { writeText(t: string): Promise<void> } };
        };
        await g.navigator?.clipboard?.writeText(listId);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } else {
        await Share.share({ message });
      }
    } catch {
      // user dismissed the share sheet
    }
  }, [list?.name, listId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: list?.name ?? 'Shared list',
      headerRight: () => (
        <Pressable onPress={() => void shareList()} hitSlop={8}>
          <ThemedText type="smallBold" style={styles.shareBtn}>
            {copied ? 'Copied!' : 'Share'}
          </ThemedText>
        </Pressable>
      ),
    });
  }, [navigation, list?.name, listId, copied, shareList]);

  const addItem = async () => {
    if (!ctx) return;
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await ctx.engine.addItem(listId, text);
  };

  const deleteList = async () => {
    if (!ctx) return;
    await ctx.engine.deleteList(listId);
    router.back();
  };

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{}} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
          <View style={styles.codeBar}>
            <SyncStatus />
            <ThemedText type="code" themeColor="textSecondary">
              code {listId}
            </ThemedText>
          </View>

          <View style={styles.addRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add an item…"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={() => void addItem()}
              editable={ctx != null}
            />
            <Pressable
              style={[styles.button, styles.buttonPrimary]}
              onPress={() => void addItem()}
              disabled={!ctx}>
              <ThemedText type="smallBold" style={styles.buttonPrimaryText}>
                Add
              </ThemedText>
            </Pressable>
          </View>

          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                No items yet — add the first one above. Everyone sharing this list
                sees new items immediately.
              </ThemedText>
            }
            renderItem={({ item }) => (
              <ItemRow
                item={item}
                onToggle={() => void ctx?.engine.setItemDone(listId, item.id, !item.done)}
                onEdit={(text) => void ctx?.engine.setItemText(listId, item.id, text)}
                onDelete={() => void ctx?.engine.deleteItem(listId, item.id)}
              />
            )}
          />

          <View style={styles.footer}>
            <Pressable onPress={() => void shareList()} hitSlop={8}>
              <ThemedText type="small" style={styles.link}>
                {copied ? 'Code copied!' : 'Share this list’s code'}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => void deleteList()} hitSlop={8}>
              <ThemedText type="small" style={styles.danger}>
                Delete list
              </ThemedText>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing.three },
  codeBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    flexWrap: 'wrap',
  },
  addRow: { flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.two },
  input: {
    flex: 1,
    backgroundColor: '#F0F0F3',
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    color: '#000000',
  },
  button: {
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  buttonPrimary: { backgroundColor: '#208AEF' },
  buttonPrimaryText: { color: '#FFFFFF' },
  listContent: { gap: Spacing.one, paddingBottom: Spacing.three, flexGrow: 1 },
  empty: { paddingTop: Spacing.four, lineHeight: 22 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: '#F0F0F3',
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.one,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  check: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  itemTextWrap: { flex: 1, paddingVertical: 4 },
  itemText: { fontSize: 16, lineHeight: 22 },
  itemTextDone: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  itemInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
    color: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#208AEF',
  },
  deleteX: { fontSize: 14 },
  shareBtn: { color: '#3c87f7' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  link: { color: '#3c87f7' },
  danger: { color: '#DC2626' },
});
