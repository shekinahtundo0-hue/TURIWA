import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TuriwaLogo } from '@/components/TuriwaLogo';
import { useColors } from '@/hooks/useColors';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { TuriwaProvider } from '@/context/TuriwaContext';
import { ThemeProvider } from '@/context/ThemeContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back', headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  );
}

// react-native-web cannot express these through style props, so they go in the document.
// CanvasText and Canvas are system colours, which is what keeps a single ring legible in
// both themes instead of a hardcoded green that vanishes on one of them.
const WEB_GLOBAL_CSS = `
:where(a, button, input, textarea, select, [tabindex], [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"]):focus-visible {
  outline: 2px solid CanvasText !important;
  outline-offset: 2px !important;
}
[role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], button {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
html { -webkit-text-size-adjust: 100%; }
`;

function useWebGlobalStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('turiwa-global')) return;
    const tag = document.createElement('style');
    tag.id = 'turiwa-global';
    tag.textContent = WEB_GLOBAL_CSS;
    document.head.appendChild(tag);
  }, []);
}

export default function RootLayout() {
  useWebGlobalStyles();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular: PlusJakartaSans_400Regular,
    Inter_500Medium: PlusJakartaSans_500Medium,
    Inter_600SemiBold: PlusJakartaSans_600SemiBold,
    Inter_700Bold: PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  const fontsReady = fontsLoaded || Boolean(fontError);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <ThemeProvider>
                {fontsReady ? (
                  <TuriwaProvider>
                    <RootLayoutNav />
                  </TuriwaProvider>
                ) : (
                  <BootPlaceholder />
                )}
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

// Font loading can take the better part of a minute in a Metro dev bundle, and an empty
// window reads as a broken app rather than a slow one, so the mark and a spinner stand in.
function BootPlaceholder() {
  const colors = useColors();
  return (
    <View style={[styles.boot, { backgroundColor: colors.background }]}>
      <TuriwaLogo size={76} />
      <ActivityIndicator style={styles.bootSpinner} color={colors.primary} />
      <Text style={[styles.bootText, { color: colors.mutedForeground }]}>Loading Turiwa…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bootSpinner: { marginTop: 18 },
  bootText: { marginTop: 10, fontSize: 14 },
});
