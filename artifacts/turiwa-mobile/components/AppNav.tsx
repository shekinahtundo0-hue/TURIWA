import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { RAIL_WIDTH_COMPACT, RAIL_WIDTH_LABELLED, useResponsive } from '@/hooks/useResponsive';
import { TuriwaLogo } from '@/components/TuriwaLogo';

/**
 * Back for the screens that sit outside the tab group. They have no bottom bar and
 * no header of their own, so without this a member who lands on one is stuck there.
 * A shared link or a browser reload opens them with no history to step back through,
 * so the way out is Home rather than no way out at all.
 */
export function useSubScreenBack() {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/' as Href));
}

// The rail mirrors the bottom bar's five destinations, in the same order the
// native tabs use, so the two navigations never disagree about what exists.
const railItems: { name: string; label: string; icon: keyof typeof Feather.glyphMap; href: Href }[] = [
  { name: 'index', label: 'Home', icon: 'home', href: '/' },
  { name: 'circles', label: 'Circles', icon: 'users', href: '/circles' },
  { name: 'loans', label: 'Loans', icon: 'credit-card', href: '/loans' },
  { name: 'activity', label: 'Activity', icon: 'bar-chart-2', href: '/activity' },
  { name: 'profile', label: 'Profile', icon: 'user', href: '/profile' },
];

/**
 * The left navigation. A tablet always shows icons only because its width is
 * needed by the ledger; a desktop starts labelled and can be collapsed to the
 * same narrow rail.
 */
export function AppRail() {
  const colors = useColors();
  const layout = useResponsive();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [collapsed, setCollapsed] = useState(false);
  const compact = layout.isTablet || collapsed;
  const width = compact ? RAIL_WIDTH_COMPACT : RAIL_WIDTH_LABELLED;

  return (
    <View
      style={[
        styles.rail,
        { width, backgroundColor: colors.card, borderRightColor: colors.border, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel="Main sections"
    >
      <View style={[styles.railMark, { backgroundColor: colors.successSoft }]}>
        <TuriwaLogo size={24} />
      </View>
      {railItems.map((item) => {
        const active = item.name === 'index' ? pathname === '/' : pathname.startsWith(`/${item.name}`);
        return (
          <Pressable
            key={item.name}
            testID={`rail-${item.name}`}
            onPress={() => router.push(item.href)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            hitSlop={4}
            style={({ pressed }) => [styles.railItem, { opacity: pressed ? 0.65 : 1 }]}
          >
            {active ? <View style={[styles.railIndicator, { backgroundColor: colors.primary }]} /> : null}
            <Feather name={item.icon} size={19} color={active ? colors.primary : colors.mutedForeground} />
            {compact ? null : (
              <Text style={[styles.railLabel, { color: active ? colors.primary : colors.mutedForeground }]}>{item.label}</Text>
            )}
          </Pressable>
        );
      })}
      {layout.isDesktop ? (
        <Pressable
          testID="rail-toggle"
          onPress={() => setCollapsed((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          hitSlop={6}
          style={({ pressed }) => [styles.railItem, { opacity: pressed ? 0.65 : 1, marginTop: 'auto' }]}
        >
          <Feather name={collapsed ? 'chevrons-right' : 'chevrons-left'} size={19} color={colors.mutedForeground} />
          {collapsed ? null : <Text style={[styles.railLabel, { color: colors.mutedForeground }]}>Collapse</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Wraps a screen that lives outside the tab group so a wide window keeps its
 * navigation instead of dropping to a bare column.
 */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const { useSidebar } = useResponsive();
  if (!useSidebar) return <>{children}</>;
  return (
    <View style={[styles.row, { backgroundColor: colors.background }]}>
      <AppRail />
      <View style={styles.scene}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  scene: { flex: 1 },
  rail: { borderRightWidth: 1, alignItems: 'center', gap: 6 },
  railMark: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  railItem: { width: 60, minHeight: 60, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 4, position: 'relative' },
  railIndicator: { position: 'absolute', left: 0, top: 16, bottom: 16, width: 3, borderRadius: 2 },
  railLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
});
