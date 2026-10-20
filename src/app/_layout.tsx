import { DarkTheme, DefaultTheme, Link, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { SyncProvider } from '@/sync/context';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <SyncProvider>
        <Stack>
          <Stack.Screen
            name="index"
            options={{
              title: 'Shared Lists',
              headerRight: () => (
                <Link href="/settings" style={styles.link}>
                  Settings
                </Link>
              ),
            }}
          />
          <Stack.Screen name="list/[id]" options={{ title: 'Shared list' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </SyncProvider>
    </ThemeProvider>
  );
}

const styles = {
  link: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#3c87f7',
    paddingVertical: 4,
  },
};
