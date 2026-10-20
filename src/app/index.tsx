import { router } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SyncStatus } from '@/components/sync-status';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useLists, useSyncCtx } from '@/sync/context';

type Mode = 'idle' | 'create' | 'join';

export default function ListsScreen() {
  const ctx = useSyncCtx();
  const lists = useLists();
  const [mode, setMode] = useState<Mode>('idle');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ready = ctx != null;

  const openList = (id: string) =>
    router.push({ pathname: '/list/[id]', params: { id } });

  const onCreate = async () => {
    if (!ctx) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setName('');
    setMode('idle');
    const id = await ctx.engine.createList(trimmed);
    openList(id);
  };

  const onJoin = async () => {
    if (!ctx) return;
    const id = await ctx.engine.joinList(code);
    if (!id) {
      setError('That code looks invalid — check it and try again.');
      return;
    }
    setError(null);
    setCode('');
    setMode('idle');
    openList(id);
  };

  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
          <View style={styles.statusWrap}>
            <SyncStatus />
          </View>

          <FlatList
            data={lists}
            keyExtractor={(l) => l.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {ready
                  ? 'No lists yet. Create one, or join a friend’s list with their shared code — edits then appear on every shared phone in real time.'
                  : 'Opening local database…'}
              </ThemedText>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => openList(item.id)}
                accessibilityRole="button">
                <View style={styles.flex}>
                  <ThemedText type="default">{item.name}</ThemedText>
                  <ThemedText type="code" themeColor="textSecondary">
                    code {item.id}
                  </ThemedText>
                </View>
                <ThemedText themeColor="textSecondary" style={styles.chevron}>
                  ›
                </ThemedText>
              </Pressable>
            )}
          />

          {error ? (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          ) : null}

          {mode === 'create' ? (
            <View style={styles.formRow}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="List name"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={onCreate}
              />
              <Pressable
                style={[styles.button, styles.buttonPrimary]}
                onPress={onCreate}
                disabled={!ready}>
                <ThemedText type="smallBold" style={styles.buttonPrimaryText}>
                  Create
                </ThemedText>
              </Pressable>
              <Pressable style={styles.button} onPress={() => setMode('idle')}>
                <ThemedText type="small">Cancel</ThemedText>
              </Pressable>
            </View>
          ) : mode === 'join' ? (
            <View style={styles.formRow}>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="Shared code"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.codeInput]}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={onJoin}
              />
              <Pressable
                style={[styles.button, styles.buttonPrimary]}
                onPress={onJoin}
                disabled={!ready}>
                <ThemedText type="smallBold" style={styles.buttonPrimaryText}>
                  Join
                </ThemedText>
              </Pressable>
              <Pressable style={styles.button} onPress={() => setMode('idle')}>
                <ThemedText type="small">Cancel</ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actionsRow}>
              <Pressable
                style={[styles.button, styles.buttonPrimary, !ready && styles.disabled]}
                onPress={() => setMode('create')}
                disabled={!ready}
                accessibilityRole="button">
                <ThemedText type="smallBold" style={styles.buttonPrimaryText}>
                  + New list
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, styles.buttonOutline, !ready && styles.disabled]}
                onPress={() => setMode('join')}
                disabled={!ready}
                accessibilityRole="button">
                <ThemedText type="smallBold">Join with code</ThemedText>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing.three },
  statusWrap: { paddingTop: Spacing.two, paddingBottom: Spacing.two },
  listContent: { gap: Spacing.two, paddingBottom: Spacing.three, flexGrow: 1 },
  empty: { paddingTop: Spacing.four, lineHeight: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: '#F0F0F3',
    borderRadius: 12,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  chevron: { fontSize: 20 },
  error: { color: '#DC2626', paddingBottom: Spacing.two },
  actionsRow: { flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.three },
  formRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#F0F0F3',
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    color: '#000000',
  },
  codeInput: { fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1 },
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
  buttonOutline: { borderWidth: 1, borderColor: '#208AEF' },
  disabled: { opacity: 0.5 },
});
