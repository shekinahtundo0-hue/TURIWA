import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useResponsive } from '@/hooks/useResponsive';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs, usePathname, useRouter, type Href } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TuriwaLogo } from '@/components/TuriwaLogo';

// IMPORTANT: iOS 26 uses NativeTabs for native tabs with liquid glass support.
// NativeTabs intentionally does NOT use custom design tokens — liquid glass
// is a system-level appearance provided by iOS and cannot be overridden.
// Custom brand colors are applied only on the ClassicTabLayout path (older iOS / Android / web).
function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
        />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="circles">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} />
        <NativeTabs.Trigger.Label>Circles</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="loans">
        <NativeTabs.Trigger.Icon sf={{ default: 'banknote', selected: 'banknote.fill' }} />
        <NativeTabs.Trigger.Label>Loans</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const { isDark } = useTheme();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="circles"
        options={{
          title: 'Circles',
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="person.3" tintColor={color} size={24} /> : <Feather name="users" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="loans"
        options={{
          title: 'Loans',
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="banknote" tintColor={color} size={24} /> : <Feather name="credit-card" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="chart.bar" tintColor={color} size={24} /> : <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="person.crop.circle" tintColor={color} size={24} /> : <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

// The rail mirrors the bottom bar's five destinations, in the same order the
// native tabs use.
const railItems: { name: string; label: string; icon: keyof typeof Feather.glyphMap; href: Href }[] = [
  { name: 'index', label: 'Home', icon: 'home', href: '/' },
  { name: 'circles', label: 'Circles', icon: 'users', href: '/circles' },
  { name: 'loans', label: 'Loans', icon: 'credit-card', href: '/loans' },
  { name: 'activity', label: 'Activity', icon: 'bar-chart-2', href: '/activity' },
  { name: 'profile', label: 'Profile', icon: 'user', href: '/profile' },
];

function SideRail() {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.rail, { backgroundColor: colors.card, borderRightColor: colors.border, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]}>
      <View style={[styles.railMark, { backgroundColor: colors.successSoft }]}>
        <TuriwaLogo size={24} />
      </View>
      {railItems.map((item) => {
        const active = item.name === 'index' ? pathname === '/' : pathname.startsWith(`/${item.name}`);
        return (
          <Pressable
            key={item.name}
            onPress={() => router.push(item.href)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            style={({ pressed }) => [styles.railItem, { opacity: pressed ? 0.65 : 1 }]}
          >
            {active ? <View style={[styles.railIndicator, { backgroundColor: colors.primary }]} /> : null}
            <Feather name={item.icon} size={19} color={active ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.railLabel, { color: active ? colors.primary : colors.mutedForeground }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Desktop and wide Android/web windows trade the bottom bar for a left rail, so
// the tabs stop competing with the content for the width of the screen.
function DesktopTabLayout() {
  const colors = useColors();
  return (
    <View style={[styles.desktop, { backgroundColor: colors.background }]}>
      <SideRail />
      <View style={styles.desktopScene}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: { display: 'none' },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Home' }} />
          <Tabs.Screen name="circles" options={{ title: 'Circles' }} />
          <Tabs.Screen name="loans" options={{ title: 'Loans' }} />
          <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        </Tabs>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { useSidebar } = useResponsive();
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  if (useSidebar) {
    return <DesktopTabLayout />;
  }
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  desktop: { flex: 1, flexDirection: 'row' },
  desktopScene: { flex: 1 },
  rail: { width: 92, borderRightWidth: 1, alignItems: 'center', gap: 6 },
  railMark: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  railItem: { width: 76, height: 60, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 4, position: 'relative' },
  railIndicator: { position: 'absolute', left: 0, top: 16, bottom: 16, width: 3, borderRadius: 2 },
  railLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10.5 },
});
