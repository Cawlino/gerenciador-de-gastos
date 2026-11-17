import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { appQueryClient } from '../src/hooks';
import { PrivacyDemoProvider } from '../src/context/PrivacyDemoContext';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const AppDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000',
    card: '#07132B',
    text: '#E6EDF7',
    primary: '#38BDF8',
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
      <QueryClientProvider client={appQueryClient}>
        <PrivacyDemoProvider>
          <ThemeProvider value={AppDarkTheme}>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="analytics" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
              <Stack.Screen name="playground" options={{ headerShown: false }} />
              <Stack.Screen name="connect" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="transaction/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="rules" options={{ headerShown: false, presentation: 'modal' }} />
            </Stack>
          </ThemeProvider>
        </PrivacyDemoProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
