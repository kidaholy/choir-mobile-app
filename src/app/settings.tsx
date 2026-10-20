import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SyncStatus } from '@/components/sync-status';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSyncCtx } from '@/sync/context';

type ModePref = 'auto' | 'supabase' | 'relay';

const MODES: { key: ModePref; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'supabase', label: 'Internet' },
  { key: 'relay', label: 'Same Wi-Fi' },
];

export default function SettingsScreen() {
  const ctx = useSyncCtx();
  const [modePref, setModePref] = useState<ModePref>('auto');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [relayUrl, setRelayUrl] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!ctx) return;
    let alive = true;
    void (async () => {
      const [mode, url, key, relay] = await Promise.all([
        ctx.storage.getMeta('syncMode'),
        ctx.storage.getMeta('supabaseUrl'),
        ctx.storage.getMeta('supabaseAnonKey'),
        ctx.storage.getMeta('relayUrl'),
      ]);
      if (!alive) return;
      setModePref(mode === 'supabase' || mode === 'relay' ? mode : 'auto');
      setSupabaseUrl(url ?? '');
      setSupabaseKey(key ?? '');
      setRelayUrl(relay ?? '');
    })();
    return () => {
      alive = false;
    };
  }, [ctx]);

  const save = async () => {
    if (!ctx) return;
    await Promise.all([
      ctx.storage.setMeta('syncMode', modePref === 'auto' ? '' : modePref),
      ctx.storage.setMeta('supabaseUrl', supabaseUrl.trim()),
      ctx.storage.setMeta('supabaseAnonKey', supabaseKey.trim()),
      ctx.storage.setMeta('relayUrl', relayUrl.trim()),
    ]);
    await ctx.reconnect();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const config = ctx?.config;
  const active = config?.mode ?? 'relay';

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.statusCard}>
            <SyncStatus />
            {config ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.para}>
                Currently syncing via{' '}
                {active === 'supabase' ? 'Supabase (internet)' : 'the local relay'}.
              </ThemedText>
            ) : null}
          </View>

          <ThemedText type="smallBold">How sync works</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.para}>
            Every phone keeps its own database — your lists live on your device
            first, and the app works with no signal at all. Phones only trade
            small patches to stay in step, and edits merge automatically so
            nobody overwrites anybody. Treat a list’s code like an invite: it
            is what lets a phone join, so share it only with people you want
            in the list.
          </ThemedText>

          <ThemedText type="smallBold" style={styles.section}>
            Sync through
          </ThemedText>
          <View style={styles.segment}>
            {MODES.map((m) => {
              const selected = modePref === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setModePref(m.key)}
                  style={[styles.segmentItem, selected && styles.segmentItemActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}>
                  <ThemedText
                    type="smallBold"
                    style={selected ? styles.segmentTextActive : undefined}>
                    {m.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.para}>
            {modePref === 'auto'
              ? 'Recommended. Uses Supabase when it is configured, otherwise the local relay.'
              : modePref === 'supabase'
                ? 'Updates reach every shared phone even when the others are offline right now.'
                : 'No online service at all. Phones only sync while both are connected to the same relay at the same time.'}
          </ThemedText>

          {modePref !== 'relay' ? (
            <>
              <ThemedText type="smallBold" style={styles.section}>
                Supabase project
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.para}>
                Project URL and anon key from{' '}
                <ThemedText type="code">Dashboard → Settings → API</ThemedText>. These
                are public by design and safe to ship in the app. Also run{' '}
                <ThemedText type="code">supabase/migration.sql</ThemedText> once in
                the SQL editor.
              </ThemedText>
              <TextInput
                value={supabaseUrl}
                onChangeText={setSupabaseUrl}
                placeholder="https://your-project.supabase.co"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <TextInput
                value={supabaseKey}
                onChangeText={setSupabaseKey}
                placeholder="anon key"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.input}
              />
              {modePref === 'supabase' && config && !config.supabaseReady ? (
                <ThemedText type="small" style={styles.warn}>
                  Supabase is not configured yet — fill in the URL and anon key,
                  or the app will stay offline.
                </ThemedText>
              ) : null}
            </>
          ) : null}

          {modePref !== 'supabase' ? (
            <>
              <ThemedText type="smallBold" style={styles.section}>
                Relay address
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.para}>
                Run <ThemedText type="code">node server/relay.mjs</ThemedText> on a
                computer everyone can reach. For phones on the same Wi-Fi, use that
                computer’s LAN IP, e.g.{' '}
                <ThemedText type="code">ws://192.168.1.20:8787</ThemedText>.
              </ThemedText>
              <TextInput
                value={relayUrl}
                onChangeText={setRelayUrl}
                placeholder="ws://localhost:8787"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </>
          ) : null}

          <Pressable
            style={[styles.button, styles.buttonPrimary, !ctx && styles.disabled]}
            onPress={() => void save()}
            disabled={!ctx}
            accessibilityRole="button"
            accessibilityLabel="Save and reconnect">
            <ThemedText type="smallBold" style={styles.buttonPrimaryText}>
              {saved ? 'Saved ✓' : 'Save & reconnect'}
            </ThemedText>
          </Pressable>

          <ThemedText type="smallBold" style={styles.section}>
            This device
          </ThemedText>
          <ThemedText type="code" themeColor="textSecondary" selectable>
            {ctx?.deviceId ?? '…'}
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing.three },
  content: { gap: Spacing.two, paddingVertical: Spacing.three, paddingBottom: Spacing.six },
  statusCard: { paddingVertical: Spacing.two },
  section: { paddingTop: Spacing.four },
  para: { lineHeight: 20 },
  warn: { color: '#B45309', lineHeight: 20 },
  segment: {
    flexDirection: 'row',
    gap: Spacing.one,
    backgroundColor: '#F0F0F3',
    borderRadius: 10,
    padding: Spacing.half,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  segmentItemActive: { backgroundColor: '#FFFFFF' },
  segmentTextActive: { color: '#208AEF' },
  input: {
    backgroundColor: '#F0F0F3',
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
    color: '#000000',
    fontFamily: 'monospace',
  },
  button: {
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: Spacing.four,
  },
  buttonPrimary: { backgroundColor: '#208AEF' },
  buttonPrimaryText: { color: '#FFFFFF' },
  disabled: { opacity: 0.5 },
});
