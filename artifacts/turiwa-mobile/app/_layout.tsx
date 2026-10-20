import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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

export default function RootLayout() {
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
