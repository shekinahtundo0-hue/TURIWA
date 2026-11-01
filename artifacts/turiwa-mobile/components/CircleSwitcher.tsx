import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useSheet } from '@/components/TuriwaUI';
import { circleAccess, useTuriwa } from '@/context/TuriwaContext';
import type { Circle, CircleRole } from '@/lib/api';

/**
 * The role a person holds *in one circle*, spelled out. Whoever runs one group is still
 * an ordinary member in the next, so the label is read from that circle's own roster and
 * never from anything the account as a whole owns.
 */
export function roleLabel(role: CircleRole | null): string {
  if (role === 'admin') return 'Primary Admin';
  if (role === 'co-admin') return 'Co-Admin';
  if (role === 'member') return 'Member';
  return 'Not a member';
}

/** A two-letter mark for the circle, because a logo file for every group is not a thing we have. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? words[1][0] : first.length > 1 ? name.trim()[1] : '';
  return `${first}${second}`.toUpperCase() || 'T';
}

/** Past this many circles the list needs a search field rather than a scroll. */
const SEARCH_FROM = 5;

/**
 * One account, many circles, no sign-out. The header names the circle every figure on
 * screen belongs to and opens the other circles this account can act in; choosing one
 * replaces the working context in place, so nothing reloads and no screen is left showing
 * the previous circle's money.
 */
export function CircleSwitcher() {
  const colors = useColors();
  const router = useRouter();
  const { mode } = useResponsive();
  const sheet = useSheet();
  const { circles, activeCircle, user, setActiveCircle, unreadByCircle } = useTuriwa();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [refused, setRefused] = useState('');

  // Escape is the web's way out of anything that opened as a panel, and a search box that
  // remembers half-typed names between visits only ever confuses.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setRefused('');
      return;
    }
    if (Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? circles.filter((circle) => circle.name.toLowerCase().includes(needle)) : circles),
    [circles, needle],
  );

  const roleIn = (circle: Circle): CircleRole | null => circleAccess(circle, user?.id ?? '')?.role ?? null;
  const markColor = (color: Circle['color']) => (color === 'gold' ? colors.accent : color === 'blue' ? colors.tint : colors.primary);

  const pick = async (circleId: string) => {
    if (await setActiveCircle(circleId)) {
      Haptics.selectionAsync();
      setOpen(false);
      return;
    }
    // Membership ended between the list being drawn and the tap landing on it. Saying so
    // beats switching into a circle whose screens the server would refuse anyway.
    setRefused('That circle is no longer open to this account. The list has been refreshed.');
  };

  const body = (
    <>
      {circles.length > SEARCH_FROM ? (
        <TextInput
          testID="circle-switcher-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search circles"
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel="Search circles"
          style={[styles.search, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
        />
      ) : null}
      {shown.length === 0 ? (
        <Text style={[styles.noMatch, { color: colors.mutedForeground }]}>
          {circles.length === 0
            ? 'This account is not in any circle yet. Create one or join with a code below.'
            : 'No circle on this account matches that name.'}
        </Text>
      ) : (
        <View style={styles.list}>
          {shown.map((circle) => {
            const current = circle.id === activeCircle?.id;
            const unread = unreadByCircle[circle.id] ?? 0;
            const role = roleIn(circle);
            return (
              <Pressable
                key={circle.id}
                testID={`circle-switcher-${circle.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${circle.name}, ${roleLabel(role)}${unread > 0 ? `, ${unread} unread` : ''}`}
                accessibilityState={{ selected: current }}
                onPress={() => void pick(circle.id)}
                style={({ pressed }) => [
                  styles.item,
                  {
                    borderColor: current ? colors.primary : colors.border,
                    backgroundColor: current ? colors.successSoft : pressed ? colors.muted : colors.card,
                  },
                ]}
              >
                <View style={[styles.mark, { backgroundColor: markColor(circle.color) }]}>
                  <Text style={styles.markText}>{initials(circle.name)}</Text>
                </View>
                <View style={styles.itemCopy}>
                  <Text numberOfLines={1} style={[styles.itemName, { color: colors.foreground }]}>
                    {circle.name}
                  </Text>
                  <View style={styles.itemMeta}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.roleText,
                        { color: role === 'admin' ? colors.adminBadge : role === 'co-admin' ? colors.coAdminBadge : colors.mutedForeground },
                      ]}
                    >
                      {roleLabel(role)}
                    </Text>
                    <Text style={[styles.memberCount, { color: colors.mutedForeground }]}>
                      {circle.members} {circle.members === 1 ? 'member' : 'members'}
                    </Text>
                    {unread > 0 ? (
                      <View style={[styles.unread, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.unreadText, { color: colors.primaryForeground }]}>{unread > 9 ? '9+' : unread}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Feather name={current ? 'check' : 'chevron-right'} size={current ? 18 : 16} color={current ? colors.primary : colors.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
      )}
      {refused ? (
        <View
          testID="circle-switcher-refused"
          accessibilityRole="alert"
          style={[styles.refused, { backgroundColor: colors.destructiveSoft, borderColor: colors.destructiveBorder }]}
        >
          <Feather name="alert-circle" size={15} color={colors.destructive} />
          <Text style={[styles.refusedText, { color: colors.destructive }]}>{refused}</Text>
        </View>
      ) : null}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <FooterLink
          icon="plus"
          label="Create a circle"
          onPress={() => {
            setOpen(false);
            router.push('/(onboarding)/create-group' as Href);
          }}
        />
        <FooterLink
          icon="log-in"
          label="Join with a code"
          onPress={() => {
            setOpen(false);
            router.push('/(onboarding)/join-circle' as Href);
          }}
        />
      </View>
    </>
  );

  const head = <SheetTitle colors={colors} activeName={activeCircle?.name ?? null} onClose={() => setOpen(false)} dialog={mode !== 'phone'} />;

  return (
    <View style={[styles.triggerWrap, mode === 'phone' && styles.triggerWrapPhone]}>
      <Pressable
        testID="circle-switcher-trigger"
        accessibilityRole="button"
        accessibilityLabel={`Active circle: ${activeCircle?.name ?? 'none chosen'}${activeCircle ? `, ${roleLabel(roleIn(activeCircle))}` : ''}. Change circle`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.trigger, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={[styles.triggerMark, { backgroundColor: activeCircle ? markColor(activeCircle.color) : colors.muted }]}>
          <Feather
            name={activeCircle ? 'users' : 'circle'}
            size={13}
            color={activeCircle ? colors.primaryForeground : colors.mutedForeground}
          />
        </View>
        <View style={styles.triggerCopy}>
          <Text numberOfLines={1} style={[styles.triggerName, { color: colors.foreground }]}>
            {activeCircle?.name ?? 'Choose a circle'}
          </Text>
          {activeCircle ? (
            <Text numberOfLines={1} style={[styles.triggerRole, { color: colors.mutedForeground }]}>
              {roleLabel(roleIn(activeCircle))}
            </Text>
          ) : null}
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.mutedForeground} />
      </Pressable>

      {open ? (
        mode === 'phone' ? (
          <Modal visible transparent animationType={sheet.animationType} onRequestClose={() => setOpen(false)}>
            <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
              <Pressable
                testID="circle-switcher-shade"
                accessibilityRole="button"
                accessibilityLabel="Close the circle list"
                onPress={() => setOpen(false)}
                style={StyleSheet.absoluteFill}
              />
              <View style={[sheet.card, { backgroundColor: colors.card }]}>
                <View style={[sheet.handle, { marginBottom: 12 }]} />
                {head}
                <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {body}
                </ScrollView>
              </View>
            </View>
          </Modal>
        ) : (
          <View
            testID="circle-switcher-panel"
            style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border, boxShadow: colors.shadowHero }]}
          >
            {head}
            <ScrollView style={styles.panelScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {body}
            </ScrollView>
          </View>
        )
      ) : null}
    </View>
  );
}

function SheetTitle({
  colors,
  activeName,
  onClose,
  dialog,
}: {
  colors: ReturnType<typeof useColors>;
  activeName: string | null;
  onClose: () => void;
  dialog: boolean;
}) {
  return (
    <View style={styles.sheetHead}>
      <View style={styles.sheetHeadCopy}>
        <Text style={[styles.sheetEyebrow, { color: colors.primary }]}>YOUR CIRCLES</Text>
        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
          {activeName ? `Working in ${activeName}` : 'Choose a circle to work in'}
        </Text>
      </View>
      {dialog ? (
        <Pressable
          testID="circle-switcher-close"
          accessibilityRole="button"
          accessibilityLabel="Close the circle list"
          onPress={onClose}
          hitSlop={10}
          style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="x" size={18} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

function FooterLink({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      testID={`circle-switcher-${icon}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.footerLink, { opacity: pressed ? 0.65 : 1 }]}
    >
      <Feather name={icon} size={14} color={colors.primary} />
      <Text style={[styles.footerLinkText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  triggerWrap: { position: 'relative', maxWidth: 190, zIndex: 40 },
  // The header has a greeting and a bell beside it, so a phone gets a narrower pill and
  // lets the name truncate rather than pushing the bell off a 320px screen.
  triggerWrapPhone: { maxWidth: 132 },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1 },
  triggerMark: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  // minWidth 0 is what lets a long circle name truncate instead of widening the header past 320px.
  triggerCopy: { flex: 1, minWidth: 0 },
  triggerName: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
  triggerRole: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 1 },
  // Tabs paint their scroll content after the header, so the panel needs elevation as well
  // as zIndex to stay above it on native.
  panel: { position: 'absolute', top: 52, right: 0, width: 340, maxHeight: 460, zIndex: 60, elevation: 8, borderWidth: 1, borderRadius: 20, padding: 16 },
  panelScroll: { maxHeight: 360 },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  sheetHeadCopy: { flex: 1, minWidth: 0 },
  sheetEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10.5, letterSpacing: 1.6, marginBottom: 4 },
  sheetTitle: { fontFamily: 'Inter_700Bold', fontSize: 16.5, letterSpacing: -0.3 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 16, padding: 11, minHeight: 62 },
  mark: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#FFFFFF' },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  roleText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  memberCount: { fontFamily: 'Inter_400Regular', fontSize: 10.5 },
  unread: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  unreadText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontFamily: 'Inter_500Medium', fontSize: 13, marginBottom: 10 },
  noMatch: { fontFamily: 'Inter_500Medium', fontSize: 12.5, paddingVertical: 14, textAlign: 'center' },
  refused: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 10 },
  refusedText: { fontFamily: 'Inter_500Medium', fontSize: 11.5, lineHeight: 16, flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
  footerLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 6 },
  footerLinkText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
