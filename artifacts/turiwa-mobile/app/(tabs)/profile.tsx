import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { BrandHeader, EmptyState, PrimaryButton, Screen, ScreenSkeleton, SectionHeading, SkeletonRows, useSheet, styles as uiStyles } from '@/components/TuriwaUI';
import { roleLabel } from '@/components/CircleSwitcher';
import { circleAccess, useTuriwa } from '@/context/TuriwaContext';
import { useTheme, type ThemePreference } from '@/context/ThemeContext';
import * as api from '@/lib/api';
import type { Circle } from '@/lib/api';

type Sheet = 'details' | 'security' | 'twofa' | 'help' | 'delete' | 'notifications' | null;

const themeChoices: { value: ThemePreference; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { value: 'system', label: 'System', icon: 'smartphone' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

/** A circle's own colour token, mapped to the palette it is drawn with. */
function markTone(color: Circle['color'], palette: ReturnType<typeof useColors>) {
  if (color === 'gold') return { background: palette.goldSoft, foreground: palette.accent, border: palette.goldBorder };
  if (color === 'blue') return { background: palette.balanceSoft, foreground: palette.tint, border: palette.border };
  return { background: palette.successSoft, foreground: palette.primary, border: palette.border };
}

function CircleMark({ circle, size = 40 }: { circle: Circle; size?: number }) {
  const colors = useColors();
  const tone = markTone(circle.color, colors);
  const words = circle.name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? words[1][0] : first.length > 1 ? circle.name.trim()[1] : '';
  const mark = `${first}${second}`.toUpperCase() || 'T';
  return (
    <View
      style={[
        styles.circleMark,
        { width: size, height: size, borderRadius: size * 0.42, backgroundColor: tone.background, borderColor: tone.border },
      ]}
    >
      <Text style={[styles.circleMarkText, { color: tone.foreground, fontSize: size * 0.34 }]}>{mark}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const layout = useResponsive();
  const {
    profileName,
    user,
    signOut,
    circles,
    activeCircleId,
    setActiveCircle,
    authHydrated,
    hydrated,
    live,
    liveError,
    unreadCount,
    notificationPreferences,
    refresh,
    refreshing,
  } = useTuriwa();
  const { preference, isDark, setPreference } = useTheme();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [switching, setSwitching] = useState('');
  const [switchNote, setSwitchNote] = useState('');
  const initials = profileName.trim().slice(0, 1).toUpperCase() || 'T';
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : null;

  if (!authHydrated) {
    return (
      <Screen>
        <ScreenSkeleton rows={4} />
      </Screen>
    );
  }

  const openCircle = async (circle: Circle) => {
    if (circle.id === activeCircleId) {
      router.push('/circles');
      return;
    }
    setSwitching(circle.id);
    setSwitchNote('');
    const switched = await setActiveCircle(circle.id);
    setSwitching('');
    // A roster can change between the list drawing and the tap landing, and the context
    // refuses to work inside a circle this account has left. Say which happened.
    setSwitchNote(switched
      ? `${circle.name} is now the circle your screens work in.`
      : 'That circle is no longer open to this account. Refresh to see where you still stand.');
  };

  // The account's own security facts, read from what the server returned rather than
  // from anything the screen assumes about how someone signed in.
  const securityItems: { key: Exclude<Sheet, null>; icon: keyof typeof Feather.glyphMap; label: string; detail: string; status: string; safe: boolean }[] = [
    {
      key: 'security',
      icon: 'lock',
      label: user?.hasPassword ? 'Change password' : 'Set a password',
      detail: user?.hasPassword ? 'Signs out your other devices' : 'Add a password alongside your Google sign-in',
      status: user?.hasPassword ? 'Password set' : 'No password',
      safe: Boolean(user?.hasPassword),
    },
    {
      key: 'twofa',
      icon: 'smartphone',
      label: 'Two-factor authentication',
      detail: user?.twoFactorEnabled
        ? `${user.backupCodesLeft} ${user.backupCodesLeft === 1 ? 'backup code' : 'backup codes'} ready`
        : 'A 6-digit code from an authenticator app',
      status: user?.twoFactorEnabled ? 'On' : 'Off',
      safe: Boolean(user?.twoFactorEnabled),
    },
  ];

  const accountGroup = (
    <>
      <SectionHeading title="Account" />
      <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <MenuRow
          testID="menu-details"
          icon="user"
          label="Personal details"
          detail={profileName}
          status={user?.phone ?? user?.email ?? undefined}
          onPress={() => setSheet('details')}
          last
        />
      </View>
    </>
  );

  const circlesGroup = (
    <>
      <SectionHeading
        title="My circles"
        action={circles.length > 1 ? 'New circle' : undefined}
        onAction={() => router.push('/(onboarding)/create-group')}
      />
      {!hydrated ? (
        <SkeletonRows rows={2} />
      ) : !live ? (
        <StateNote
          tone="error"
          title="Your circles could not be read"
          body={liveError || 'The connection to Turiwa failed. Nothing on this list is out of date — it simply has not arrived.'}
          actionLabel="Try again"
          onAction={() => void refresh()}
        />
      ) : circles.length === 0 ? (
        <EmptyState
          icon="users"
          title="No circles yet"
          body="A circle is your savings group on Turiwa. Create one, or join a group somebody has already started."
          actionLabel="Create a circle"
          onAction={() => router.push('/(onboarding)/create-group')}
        />
      ) : (
        <>
          <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {circles.map((circle, index) => {
              const access = circleAccess(circle, user?.id ?? '');
              const isActive = circle.id === activeCircleId;
              const pending = access ? access.status !== 'active' : true;
              return (
                <View
                  key={circle.id}
                  testID={`circle-row-${circle.id}`}
                  style={[styles.circleRow, index < circles.length - 1 && { borderBottomColor: colors.border }]}
                >
                  <CircleMark circle={circle} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuLabel, { color: colors.foreground }]} numberOfLines={1}>{circle.name}</Text>
                    <Text style={[styles.menuDetail, { color: colors.mutedForeground }]}>
                      {pending
                        ? 'Invitation pending — no role until you join'
                        : `${roleLabel(access?.role ?? null)} · ${circle.members} ${circle.members === 1 ? 'member' : 'members'}`}
                    </Text>
                  </View>
                  {isActive ? (
                    <View style={[styles.activeChip, { backgroundColor: colors.successSoft, borderColor: colors.border }]}>
                      <Feather name="check" size={12} color={colors.success} />
                      <Text style={[styles.activeChipText, { color: colors.success }]}>Active</Text>
                    </View>
                  ) : null}
                  {pending ? (
                    <Pressable
                      testID={`circle-open-${circle.id}`}
                      accessibilityRole="button"
                      onPress={() => router.push('/circles')}
                      style={({ pressed }) => [styles.circleAction, { borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
                    >
                      <Text style={[styles.circleActionText, { color: colors.inkSoft }]}>Review</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      testID={`circle-open-${circle.id}`}
                      accessibilityRole="button"
                      disabled={switching === circle.id}
                      onPress={() => void openCircle(circle)}
                      style={({ pressed }) => [
                        styles.circleAction,
                        isActive
                          ? { borderColor: colors.border, opacity: pressed ? 0.75 : 1 }
                          : { backgroundColor: colors.successSoft, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
                      ]}
                    >
                      {switching === circle.id
                        ? <ActivityIndicator color={colors.primary} />
                        : <Text style={[styles.circleActionText, { color: isActive ? colors.inkSoft : colors.primary }]}>{isActive ? 'Open' : 'Switch'}</Text>}
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
          {switchNote ? (
            <Text testID="circle-switch-note" style={[styles.switchNote, { color: colors.mutedForeground }]} accessibilityLiveRegion="polite">{switchNote}</Text>
          ) : null}
          <Pressable
            testID="profile-join-circle"
            accessibilityRole="button"
            onPress={() => router.push('/(onboarding)/join-circle' as Href)}
            style={({ pressed }) => [styles.outlineAction, { borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
          >
            <Feather name="link" size={15} color={colors.primary} />
            <Text style={[styles.outlineActionText, { color: colors.primary }]}>Join with a circle code</Text>
          </Pressable>
        </>
      )}
    </>
  );

  const securityGroup = (
    <>
      <SectionHeading title="Security" />
      <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {securityItems.map((item) => (
          <MenuRow
            key={item.key}
            testID={`menu-${item.key}`}
            icon={item.icon}
            label={item.label}
            detail={item.detail}
            status={item.status}
            statusTone={item.safe ? 'success' : 'warning'}
            onPress={() => setSheet(item.key)}
          />
        ))}
        <MenuRow
          testID="menu-notifications"
          icon="bell"
          label="Notification settings"
          detail="Contribution, loan, meeting and vote reminders"
          status={unreadCount > 0 ? `${unreadCount} unread` : `${notificationPreferences.length ? 'Saved' : 'Defaults'}`}
          statusTone={unreadCount > 0 ? 'success' : 'neutral'}
          onPress={() => setSheet('notifications')}
          last
        />
      </View>
      <Text style={[styles.fieldFootnote, { color: colors.mutedForeground }]}>
        These are the messages Turiwa shows you inside the app. It has no email or text message sender, so nothing is delivered outside it.
      </Text>
    </>
  );

  const appearanceGroup = (
    <>
      <SectionHeading title="Appearance" />
      <View style={[styles.themeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.themeCardHead}>
          <Text style={[styles.menuLabel, { color: colors.foreground }]}>Theme</Text>
          <Text style={[styles.menuDetail, { color: colors.mutedForeground }]}>
            {preference === 'system'
              ? `Following your device, which is in ${isDark ? 'dark' : 'light'} mode right now.`
              : 'Chosen here, and used until you change it.'}
          </Text>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={styles.themeRow}>
          {themeChoices.map((choice) => {
            const active = preference === choice.value;
            return (
              <Pressable
                key={choice.value}
                testID={`theme-${choice.value}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => void setPreference(choice.value)}
                style={({ pressed }) => [
                  styles.themeChip,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.successSoft : colors.input,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Feather name={choice.icon} size={15} color={active ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.themeChipText, { color: active ? colors.primary : colors.mutedForeground }]}>{choice.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={[styles.fieldFootnote, { color: colors.mutedForeground }]}>
        Saved on this device, and restored the next time you open Turiwa.
      </Text>
    </>
  );

  const supportGroup = (
    <>
      <SectionHeading title="Help" />
      <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <MenuRow
          testID="menu-help"
          icon="help-circle"
          label="Help centre"
          detail="How circles, contributions and credit work"
          onPress={() => setSheet('help')}
          last
        />
      </View>
      <View style={[styles.aboutCard, { backgroundColor: colors.warmSurface, borderColor: colors.goldBorder }]}>
        <View style={styles.aboutHead}>
          <Text style={[styles.aboutTitle, { color: colors.foreground }]}>Trust, transparently.</Text>
          <Text style={[styles.version, { color: colors.mutedForeground }]}>v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
        </View>
        <Text style={[styles.aboutCopy, { color: colors.inkSoft }]}>
          Turiwa helps communities save together with clarity, accountability, and a shared sense of progress.
        </Text>
        <Text style={[styles.aboutCopy, { color: colors.inkSoft }]}>
          This build is running in {layout.mode === 'phone' ? 'a phone layout' : layout.mode === 'tablet' ? 'a tablet layout' : 'a desktop layout'} at {Math.round(layout.width)}px wide.
        </Text>
      </View>
      <Text style={[styles.fieldFootnote, { color: colors.mutedForeground }]}>
        Turiwa has no support inbox, chat or phone line to offer you yet, so nothing here pretends to reach one.
      </Text>
    </>
  );

  const leftColumn = layout.mode === 'desktop'
    ? [accountGroup, circlesGroup, securityGroup]
    : [accountGroup, circlesGroup, securityGroup, appearanceGroup, supportGroup];
  const rightColumn = layout.mode === 'desktop' ? [appearanceGroup, supportGroup] : [];

  return (
    <>
      <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
        <BrandHeader title="Your profile" subtitle="Your Turiwa account, your way." />
        <LinearGradient
          colors={isDark ? ['#051811', '#0B2D21'] : ['#022E20', '#04432F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.profileCard, { boxShadow: colors.shadowHero }]}
        >
          <View style={styles.profileHead}>
            <View style={[styles.avatar, { backgroundColor: colors.heroChip, borderColor: colors.heroBorder }]}>
              <Text style={[styles.avatarText, { color: colors.heroForeground }]}>{initials}</Text>
            </View>
            <View style={styles.profileCopy}>
              <Text style={[styles.profileName, { color: colors.heroForeground }]}>{profileName}</Text>
              {user?.phone || user?.email ? (
                <View style={styles.profileContact}>
                  <Feather name={user.phone ? 'phone' : 'mail'} size={12} color={colors.heroMuted} />
                  <Text style={[styles.profileMeta, { color: colors.heroMuted }]} numberOfLines={1}>
                    {user.phone ?? user.email}
                  </Text>
                </View>
              ) : null}
              {user?.email && user.phone ? (
                <View style={styles.profileContact}>
                  <Feather name="mail" size={12} color={colors.heroMuted} />
                  <Text style={[styles.profileMeta, { color: colors.heroMuted }]} numberOfLines={1}>{user.email}</Text>
                </View>
              ) : null}
              {memberSince ? (
                <Text style={[styles.profileMeta, { color: colors.heroMuted, marginTop: 2 }]}>Member since {memberSince}</Text>
              ) : null}
            </View>
            <Pressable
              testID="edit-profile"
              accessibilityRole="button"
              onPress={() => setSheet('details')}
              style={({ pressed }) => [styles.editAction, { backgroundColor: colors.heroChip, borderColor: colors.heroBorder, opacity: pressed ? 0.8 : 1 }]}
            >
              <Feather name="edit-2" size={14} color={colors.heroForeground} />
              <Text style={[styles.editActionText, { color: colors.heroForeground }]}>Edit profile</Text>
            </Pressable>
          </View>
          {/* Only states the account itself carries. A person with no password has no
              password, and saying so is more useful than a badge that is always true. */}
          <View style={styles.heroStatusRow}>
            <HeroStatus icon="lock" label={user?.hasPassword ? 'Password set' : 'No password yet'} on={Boolean(user?.hasPassword)} />
            <HeroStatus icon="shield" label={user?.twoFactorEnabled ? 'Two-factor on' : 'Two-factor off'} on={Boolean(user?.twoFactorEnabled)} />
            <HeroStatus icon="users" label={`${circles.length} ${circles.length === 1 ? 'circle' : 'circles'}`} on={circles.length > 0} />
          </View>
        </LinearGradient>

        <View style={layout.mode === 'desktop' ? styles.columns : styles.singleColumn}>
          <View style={styles.column}>{leftColumn}</View>
          {layout.mode === 'desktop' ? <View style={styles.column}>{rightColumn}</View> : null}
        </View>

        <Pressable
          testID="delete-account-row"
          accessibilityRole="button"
          accessibilityLabel="Delete account permanently"
          onPress={() => setSheet('delete')}
          style={({ pressed }) => [styles.dangerCard, { borderColor: colors.destructiveBorder, opacity: pressed ? 0.8 : 1 }]}
        >
          <View style={[styles.dangerIcon, { backgroundColor: colors.destructiveSoft }]}><Feather name="trash-2" size={17} color={colors.destructive} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dangerLabel, { color: colors.destructive }]}>Delete account</Text>
            <Text style={[styles.dangerDetail, { color: colors.mutedForeground }]}>Delete your sign-in. Circle ownership must be transferred first; financial history is retained.</Text>
          </View>
          <Feather name="chevron-right" size={17} color={colors.destructive} />
        </Pressable>
        <Pressable onPress={() => setSigningOut(true)} testID="sign-out" accessibilityRole="button" accessibilityLabel="Sign out of Turiwa" style={styles.signOut}>
          <Feather name="log-out" size={16} color={colors.destructive} />
          <Text style={[styles.signOutText, { color: colors.destructive }]}>Sign out</Text>
        </Pressable>
      </Screen>
      <EditDetailsSheet visible={sheet === 'details'} onClose={() => setSheet(null)} />
      <SecuritySheet visible={sheet === 'security'} onClose={() => setSheet(null)} />
      <TwoFactorSheet visible={sheet === 'twofa'} onClose={() => setSheet(null)} />
      <NotificationPreferencesSheet visible={sheet === 'notifications'} onClose={() => setSheet(null)} />
      <HelpSheet visible={sheet === 'help'} onClose={() => setSheet(null)} />
      <DeleteAccountSheet
        visible={sheet === 'delete'}
        onClose={() => setSheet(null)}
        onSetUpTwoFactor={() => setSheet('twofa')}
      />
      <SignOutDialog
        visible={signingOut}
        onCancel={() => setSigningOut(false)}
        onConfirm={async () => {
          setSigningOut(false);
          await signOut();
          router.replace('/(auth)/welcome');
        }}
      />
    </>
  );
}

/** One settings row, with the status the server actually reports on its right. */
function MenuRow({
  testID,
  icon,
  label,
  detail,
  status,
  statusTone = 'neutral',
  onPress,
  last,
}: {
  testID: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  detail?: string;
  status?: string;
  statusTone?: 'neutral' | 'success' | 'warning';
  onPress: () => void;
  last?: boolean;
}) {
  const colors = useColors();
  const toneColor = statusTone === 'success' ? colors.success : statusTone === 'warning' ? colors.destructive : colors.mutedForeground;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        { borderBottomColor: colors.border, opacity: pressed ? 0.65 : 1 },
        last && { borderBottomWidth: 0 },
      ]}
    >
      <View style={[styles.menuIcon, { backgroundColor: colors.successSoft }]}><Feather name={icon} size={17} color={colors.primary} /></View>
      <View style={styles.menuCopy}>
        <Text style={[styles.menuLabel, { color: colors.foreground }]}>{label}</Text>
        {detail ? <Text style={[styles.menuDetail, { color: colors.mutedForeground }]} numberOfLines={2}>{detail}</Text> : null}
      </View>
      {status ? (
        <View style={styles.menuStatusWrap}>
          <Text style={[styles.menuStatus, { color: toneColor }]} numberOfLines={1}>{status}</Text>
          <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
        </View>
      ) : (
        <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

function HeroStatus({ icon, label, on }: { icon: keyof typeof Feather.glyphMap; label: string; on: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.heroStatus, { backgroundColor: colors.heroChip, borderColor: colors.heroBorder }]}>
      <Feather name={on ? icon : 'alert-circle'} size={12} color={on ? colors.heroForeground : colors.heroMuted} />
      <Text style={[styles.heroStatusText, { color: on ? colors.heroForeground : colors.heroMuted }]}>{label}</Text>
    </View>
  );
}

/** A message that replaces a list it could not fill: what failed, and how to try again. */
function StateNote({
  tone,
  title,
  body,
  actionLabel,
  onAction,
}: {
  tone: 'error' | 'info';
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  const accent = tone === 'error' ? colors.destructive : colors.primary;
  return (
    <View style={[styles.stateNote, { backgroundColor: tone === 'error' ? colors.destructiveSoft : colors.card, borderColor: tone === 'error' ? colors.destructiveBorder : colors.border }]}>
      <View style={[styles.stateIcon, { backgroundColor: tone === 'error' ? colors.destructiveSoft : colors.successSoft }]}>
        <Feather name={tone === 'error' ? 'alert-triangle' : 'info'} size={16} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.stateTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>{body}</Text>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            style={({ pressed }) => [styles.stateAction, { borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
          >
            <Text style={[styles.stateActionText, { color: accent }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function SignOutDialog({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  const colors = useColors();
  const { user } = useTuriwa();
  const backInWith = user?.email && !user.phone ? 'your Google account' : user?.email ? 'your phone number, password, or Google' : 'your phone number and password';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogShade}>
        <View style={[styles.dialogCard, { backgroundColor: colors.card }]}>
          <View style={[styles.dialogIcon, { backgroundColor: colors.destructiveSoft }]}><Feather name="log-out" size={19} color={colors.destructive} /></View>
          <Text style={[styles.dialogTitle, { color: colors.foreground }]}>Sign out of Turiwa?</Text>
          <Text style={[styles.dialogCopy, { color: colors.mutedForeground }]}>You can sign back in any time with {backInWith}.</Text>
          <View style={styles.dialogActions}>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.dialogCancelButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={[styles.dialogCancelText, { color: colors.inkSoft }]}>Cancel</Text></Pressable>
            <Pressable onPress={onConfirm} testID="confirm-sign-out" accessibilityRole="button" style={({ pressed }) => [styles.dialogConfirmButton, { backgroundColor: colors.destructive, opacity: pressed ? 0.85 : 1 }]}><Text style={[styles.dialogConfirmText, { color: colors.destructiveForeground }]}>Sign out</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function EditDetailsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const sheet = useSheet();
  const { profileName, updateProfileName, user } = useTuriwa();
  const [name, setName] = useState(profileName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = name !== profileName;
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  React.useEffect(() => {
    if (visible) {
      setName(profileName);
      setError('');
      setSaved(false);
      setConfirmingDiscard(false);
    }
  }, [visible, profileName]);
  // Nothing on this screen can save a half-typed name, and closing the sheet must not
  // quietly throw one away that was already typed.
  const attemptClose = () => {
    if (dirty && !saved && !busy) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  };
  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a name for your profile.');
      return;
    }
    if (trimmed === profileName) {
      onClose();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateProfileName(trimmed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={attemptClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={[sheet.handle, { marginBottom: 18 }]} />
            <Text style={[uiStyles.modalEyebrow, { color: colors.primary }]}>PERSONAL DETAILS</Text>
            <Text style={[uiStyles.modalTitle, { color: colors.foreground }]}>Your details</Text>
            <Text style={[uiStyles.modalHint, { color: colors.mutedForeground }]}>Update the name your circles see. Your contact details identify your account.</Text>
            {saved ? (
              <View style={styles.savedPanel}>
                <View style={[styles.savedIcon, { backgroundColor: colors.successSoft }]}><Feather name="check-circle" size={26} color={colors.success} /></View>
                <Text style={[styles.savedTitle, { color: colors.foreground }]}>Name saved</Text>
                <Text style={[styles.savedCopy, { color: colors.mutedForeground }]}>
                  Turiwa has confirmed it, and your circles now see “{profileName}”.
                </Text>
                <PrimaryButton label="Done" icon="check" onPress={onClose} />
              </View>
            ) : (
              <>
                <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>Full name</Text>
                <TextInput
                  testID="profile-name-input"
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    setConfirmingDiscard(false);
                    if (error) setError('');
                  }}
                  placeholder="e.g. Sheila Wanjiru"
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel="Full name"
                  style={[uiStyles.textInput, { backgroundColor: colors.background, borderColor: error ? colors.destructive : colors.border, color: colors.foreground }]}
                />
                {error ? <Text testID="profile-details-error" style={[styles.sheetError, { color: colors.destructive }]} accessibilityLiveRegion="polite">{error}</Text> : null}
                {dirty && !error ? (
                  <Text style={[styles.fieldFootnote, { color: colors.mutedForeground }]}>Not saved yet.</Text>
                ) : null}
                {confirmingDiscard ? (
                  <View style={[styles.discardCard, { backgroundColor: colors.destructiveSoft, borderColor: colors.destructiveBorder }]}>
                    <Text style={[styles.discardTitle, { color: colors.foreground }]}>Discard what you typed?</Text>
                    <Text style={[styles.discardBody, { color: colors.mutedForeground }]}>“{name.trim() || 'Blank'}” has not been saved to your account.</Text>
                    <View style={styles.discardActions}>
                      <Pressable onPress={() => setConfirmingDiscard(false)} style={({ pressed }) => [styles.discardButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                        <Text style={[styles.discardButtonText, { color: colors.inkSoft }]}>Keep editing</Text>
                      </Pressable>
                      <Pressable testID="profile-discard" accessibilityRole="button" onPress={() => { setName(profileName); setConfirmingDiscard(false); onClose(); }} style={({ pressed }) => [styles.discardButton, { backgroundColor: colors.destructive, borderColor: colors.destructive, opacity: pressed ? 0.85 : 1 }]}>
                        <Text style={[styles.discardConfirmText, { color: colors.destructiveForeground }]}>Discard</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                {/* Phone and email are how the account is identified, not fields this screen
                    can rewrite — the API has no endpoint that changes them. */}
                {user?.phone ? (
                  <>
                    <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>Phone number</Text>
                    <View style={[styles.phoneRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Feather name="phone" size={15} color={colors.primary} />
                      <Text style={[styles.phoneText, { color: colors.foreground }]}>{user.phone}</Text>
                      <View style={[styles.phoneBadge, { backgroundColor: colors.successSoft }]}><Text style={[styles.phoneBadgeText, { color: colors.primary }]}>Sign-in</Text></View>
                    </View>
                  </>
                ) : null}
                {user?.email ? (
                  <>
                    <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>Email</Text>
                    <View style={[styles.phoneRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Feather name="mail" size={15} color="#4285F4" />
                      <Text style={[styles.phoneText, { color: colors.foreground }]}>{user.email}</Text>
                      <View style={[styles.phoneBadge, { backgroundColor: colors.successSoft }]}><Text style={[styles.phoneBadgeText, { color: colors.primary }]}>Google</Text></View>
                    </View>
                  </>
                ) : null}
                <View style={[styles.privacyNote, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Feather name="lock" size={14} color={colors.primary} />
                  <Text style={[styles.privacyNoteText, { color: colors.mutedForeground }]}>
                    Your name is the only detail changed here. Your sign-in phone number and email are managed by the account itself, so Turiwa does not let a settings screen rewrite them.
                  </Text>
                </View>
                <View style={uiStyles.modalActions}>
                  <Pressable onPress={attemptClose} style={({ pressed }) => [uiStyles.cancelButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={[uiStyles.cancelText, { color: colors.inkSoft }]}>Cancel</Text></Pressable>
                  <View style={uiStyles.saveButton}>{busy ? <ActivityIndicator color={colors.primary} /> : <PrimaryButton label="Save changes" icon="check" onPress={save} />}</View>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SecuritySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const sheet = useSheet();
  const { user } = useTuriwa();
  const needsPassword = user ? !user.hasPassword : false;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  React.useEffect(() => {
    if (visible) {
      setCurrentPassword('');
      setNewPassword('');
      setShowPasswords(false);
      setError('');
      setSaved(false);
    }
  }, [visible]);
  const submit = async () => {
    if (newPassword.length < 8) {
      setError('Choose a new password with at least 8 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.changePassword(currentPassword, newPassword);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={[sheet.handle, { marginBottom: 18 }]} />
            <Text style={[uiStyles.modalEyebrow, { color: colors.primary }]}>SECURITY & PRIVACY</Text>
            <Text style={[uiStyles.modalTitle, { color: colors.foreground }]}>{needsPassword ? 'Set a password' : 'Change password'}</Text>
            <Text style={[uiStyles.modalHint, { color: colors.mutedForeground }]}>{needsPassword ? 'Add a password so you can also sign in with your email and a password, without Google. Changing it signs out your other devices.' : 'Pick something only you know. Changing it signs out your other devices.'}</Text>
            {saved ? (
              <View style={styles.savedPanel}>
                <View style={[styles.savedIcon, { backgroundColor: colors.successSoft }]}><Feather name="check-circle" size={26} color={colors.success} /></View>
                <Text style={[styles.savedTitle, { color: colors.foreground }]}>{needsPassword ? 'Password set' : 'Password updated'}</Text>
                <Text style={[styles.savedCopy, { color: colors.mutedForeground }]}>Your password has been changed. Other devices stay signed out until they sign in again.</Text>
                <PrimaryButton label="Done" icon="check" onPress={onClose} />
              </View>
            ) : (
            <>
            {!needsPassword && (
              <>
            <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>Current password</Text>
            <TextInput
              testID="current-password-input"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showPasswords}
              autoCapitalize="none"
              placeholder="Your current password"
              placeholderTextColor={colors.mutedForeground}
              style={[uiStyles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            />
              </>
            )}
            <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>{needsPassword ? 'Choose a password' : 'New password'}</Text>
            <TextInput
              testID="new-password-input"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showPasswords}
              autoCapitalize="none"
              placeholder="At least 8 characters"
              placeholderTextColor={colors.mutedForeground}
              style={[uiStyles.textInput, { backgroundColor: colors.background, borderColor: error ? colors.destructive : colors.border, color: colors.foreground }]}
            />
            <Pressable onPress={() => setShowPasswords((value) => !value)} style={styles.revealToggle}>
              <Feather name={showPasswords ? 'eye-off' : 'eye'} size={14} color={colors.primary} />
              <Text style={[styles.revealText, { color: colors.primary }]}>{showPasswords ? 'Hide passwords' : 'Show passwords'}</Text>
            </Pressable>
            {error ? <Text style={[styles.sheetError, { color: colors.destructive }]}>{error}</Text> : null}
            <View style={[styles.privacyNote, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Feather name="lock" size={14} color={colors.primary} />
              <Text style={[styles.privacyNoteText, { color: colors.mutedForeground }]}>Your password is hashed before it is stored — Turiwa never sees or shares it.</Text>
            </View>
            <View style={uiStyles.modalActions}>
              <Pressable onPress={onClose} style={({ pressed }) => [uiStyles.cancelButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={[uiStyles.cancelText, { color: colors.inkSoft }]}>Cancel</Text></Pressable>
              <View style={uiStyles.saveButton}>{busy ? <ActivityIndicator color={colors.primary} /> : <PrimaryButton label={needsPassword ? 'Set password' : 'Update password'} icon="shield" onPress={submit} />}</View>
            </View>
            </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const failureMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong. Try again in a moment.';

// Authenticator apps read base32 in short groups, so the key is presented the way
// it has to be typed.
const groupKey = (secret: string) => (secret.match(/.{1,4}/g) ?? [secret]).join(' ');

function TwoFactorSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const sheet = useSheet();
  const { user, activateTwoFactor, disableTwoFactor } = useTuriwa();
  const [enrollment, setEnrollment] = useState<api.TwoFactorEnrollment | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [offCode, setOffCode] = useState('');
  const [offPassword, setOffPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  React.useEffect(() => {
    if (visible) {
      setEnrollment(null);
      setBackupCodes(null);
      setCode('');
      setOffCode('');
      setOffPassword('');
      setError('');
    }
  }, [visible]);

  const requestKey = async () => {
    setBusy(true);
    setError('');
    try {
      setEnrollment(await api.enrollTwoFactor());
    } catch (err) {
      setError(failureMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    setBusy(true);
    setError('');
    try {
      const codes = await activateTwoFactor(code.trim());
      setEnrollment(null);
      setCode('');
      setBackupCodes(codes);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(failureMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError('');
    try {
      await disableTwoFactor(offCode.trim(), offPassword || undefined);
      setOffCode('');
      setOffPassword('');
      setError('');
    } catch (err) {
      setError(failureMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const enabled = Boolean(user?.twoFactorEnabled);
  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={[sheet.handle, { marginBottom: 18 }]} />
            <Text style={[uiStyles.modalEyebrow, { color: colors.primary }]}>TWO-FACTOR AUTHENTICATION</Text>
            <Text style={[uiStyles.modalTitle, { color: colors.foreground }]}>
              {enabled ? 'Authenticator is on' : enrollment ? 'Add the key to your app' : 'Protect your account'}
            </Text>
            <Text style={[uiStyles.modalHint, { color: colors.mutedForeground }]}>
              {enabled
                ? 'Your authenticator app or a backup code is required to switch this off or delete your account.'
                : 'Turiwa asks for a 6-digit code from an authenticator app before it will delete anything.'}
            </Text>

            {backupCodes ? (
              <View style={[styles.codePanel, { borderColor: colors.goldBorder, backgroundColor: colors.warmSurface }]}>
                <Text style={[styles.codePanelTitle, { color: colors.foreground }]}>Your backup codes</Text>
                <Text style={[styles.codePanelHint, { color: colors.mutedForeground }]}>
                  Each one works once if you lose your phone. Save them somewhere safe — they are shown only now.
                </Text>
                <View style={styles.codeGrid}>
                  {backupCodes.map((value) => (
                    <Text key={value} testID="twofa-backup-code" selectable style={[styles.codeChip, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}>{value}</Text>
                  ))}
                </View>
                <PrimaryButton label="I have saved them" icon="check" onPress={() => setBackupCodes(null)} />
              </View>
            ) : enabled ? (
              <>
              <View style={[styles.statusCard, { borderColor: colors.border }]}>
                <View style={[styles.statusIcon, { backgroundColor: colors.successSoft }]}><Feather name="shield" size={17} color={colors.success} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuLabel, { color: colors.foreground }]}>Codes required for deletion</Text>
                  <Text style={[styles.menuDetail, { color: colors.mutedForeground }]}>
                    {user && user.backupCodesLeft > 0
                      ? `${user.backupCodesLeft} backup code${user.backupCodesLeft === 1 ? '' : 's'} left`
                      : 'No backup codes left — turn two-factor off and on again for a new set'}
                  </Text>
                </View>
              </View>
              <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>Turn it off</Text>
              {user?.hasPassword ? (
                <>
                  <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>Your password, and a code from the app or a backup code.</Text>
                  <TextInput
                    testID="twofa-off-password-input"
                    value={offPassword}
                    onChangeText={setOffPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    placeholder="Your password"
                    placeholderTextColor={colors.mutedForeground}
                    style={[uiStyles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  />
                </>
              ) : null}
              <TextInput
                testID="twofa-off-code-input"
                value={offCode}
                onChangeText={setOffCode}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="123456 or ABCD-1234"
                placeholderTextColor={colors.mutedForeground}
                style={[uiStyles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              />
              {error ? <Text style={[styles.sheetError, { color: colors.destructive }]}>{error}</Text> : null}
              <View style={uiStyles.modalActions}>
                <Pressable onPress={onClose} style={({ pressed }) => [uiStyles.cancelButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={[uiStyles.cancelText, { color: colors.inkSoft }]}>Close</Text></Pressable>
                <View style={uiStyles.saveButton}>
                  {busy
                    ? <ActivityIndicator color={colors.primary} />
                    : <Pressable testID="twofa-disable-button" accessibilityRole="button" disabled={offCode.trim().length < 4} onPress={turnOff} style={({ pressed }) => [styles.outlineDangerButton, { borderColor: colors.destructiveBorder, opacity: offCode.trim().length < 4 ? 0.45 : pressed ? 0.85 : 1 }]}><Text style={[styles.outlineDangerText, { color: colors.destructive }]}>Turn off</Text></Pressable>}
                </View>
              </View>
              </>
            ) : enrollment ? (
              <View>
                <View style={[styles.keyCard, { backgroundColor: colors.warmSurface, borderColor: colors.goldBorder }]}>
                  <Text style={[styles.keyEyebrow, { color: colors.mutedForeground }]}>SETUP KEY</Text>
                  <Text testID="twofa-setup-key" selectable style={[styles.keyValue, { color: colors.foreground }]}>{groupKey(enrollment.secret)}</Text>
                </View>
                <View style={styles.stepList}>
                  <Step n={1} text="Open Google Authenticator or Microsoft Authenticator." />
                  <Step n={2} text="Choose Add account, then Enter a setup key." />
                  <Step n={3} text="Type the key above exactly as shown and save." />
                  <Step n={4} text="Enter the 6-digit code it shows to finish switching on." />
                </View>
                <Text style={[styles.otpauth, { color: colors.mutedForeground }]} numberOfLines={2}>{enrollment.otpauthUri}</Text>
                <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>Code from your app</Text>
                <TextInput
                  testID="twofa-code-input"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="123456"
                  placeholderTextColor={colors.mutedForeground}
                  style={[uiStyles.textInput, { backgroundColor: colors.background, borderColor: error ? colors.destructive : colors.border, color: colors.foreground }]}
                />
                {error ? <Text style={[styles.sheetError, { color: colors.destructive }]}>{error}</Text> : null}
                <View style={uiStyles.modalActions}>
                  <Pressable onPress={onClose} style={({ pressed }) => [uiStyles.cancelButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={[uiStyles.cancelText, { color: colors.inkSoft }]}>Cancel</Text></Pressable>
                  <View style={uiStyles.saveButton}>{busy ? <ActivityIndicator color={colors.primary} /> : <PrimaryButton label="Verify and switch on" icon="shield" onPress={activate} />}</View>
                </View>
              </View>
            ) : (
              <View>
                <View style={[styles.privacyNote, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Feather name="lock" size={14} color={colors.primary} />
                  <Text style={[styles.privacyNoteText, { color: colors.mutedForeground }]}>Turiwa keeps your circles, contributions and credit under your sign-in. Turning this on means only you can delete them.</Text>
                </View>
                {error ? <Text style={[styles.sheetError, { color: colors.destructive }]}>{error}</Text> : null}
                <View style={uiStyles.modalActions}>
                  <Pressable onPress={onClose} style={({ pressed }) => [uiStyles.cancelButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={[uiStyles.cancelText, { color: colors.inkSoft }]}>Close</Text></Pressable>
                  <View style={uiStyles.saveButton}>{busy ? <ActivityIndicator color={colors.primary} /> : <PrimaryButton label="Get setup key" icon="smartphone" onPress={requestKey} />}</View>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepDot, { backgroundColor: colors.successSoft }]}><Text style={[styles.stepNumber, { color: colors.primary }]}>{n}</Text></View>
      <Text style={[styles.stepText, { color: colors.inkSoft }]}>{text}</Text>
    </View>
  );
}

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;

function DeleteAccountSheet({
  visible,
  onClose,
  onSetUpTwoFactor,
}: {
  visible: boolean;
  onClose: () => void;
  onSetUpTwoFactor: () => void;
}) {
  const colors = useColors();
  const sheet = useSheet();
  const { user, circles, contributions, loans, deleteAccount } = useTuriwa();
  const [stage, setStage] = useState<'summary' | 'verify'>('summary');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  React.useEffect(() => {
    if (visible) {
      setStage('summary');
      setPassword('');
      setCode('');
      setPhrase('');
      setError('');
    }
  }, [visible]);

  const twoFactorOn = Boolean(user?.twoFactorEnabled);
  const needsPassword = Boolean(user?.hasPassword);
  const trimmedCode = code.trim();
  const ready =
    twoFactorOn &&
    trimmedCode.length >= 6 &&
    phrase.trim().toUpperCase() === 'DELETE' &&
    (!needsPassword || password.length > 0);

  const erase = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteAccount(password, trimmedCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onClose();
      router.replace('/(auth)/welcome');
    } catch (err) {
      setError(failureMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={[sheet.handle, { marginBottom: 18 }]} />
            <Text style={[uiStyles.modalEyebrow, { color: colors.destructive }]}>DELETE ACCOUNT</Text>
            <Text style={[uiStyles.modalTitle, { color: colors.foreground }]}>
              {stage === 'summary' ? 'This erases everything' : 'Confirm with your code'}
            </Text>
            <Text style={[uiStyles.modalHint, { color: colors.mutedForeground }]}>
              {stage === 'summary'
                ? 'Deleting your Turiwa account is permanent. There is no restore, and no copy we can send you afterwards.'
                : 'Only your authenticator app or an unused backup code can authorise this.'}
            </Text>

            {stage === 'summary' ? (
              <View>
                <View style={[styles.dataCard, { borderColor: colors.border }]}>
                  <DeletionRow icon="users" label={plural(circles.length, 'circle')} detail="Groups you created, with their targets and rates" color={colors} />
                  <DeletionRow icon="trending-up" label={contributions.length === 1 ? '1 ledger entry' : `${contributions.length} ledger entries`} detail="Every contribution, expense, repayment and welfare record with its memo" color={colors} />
                  <DeletionRow icon="credit-card" label={plural(loans.length, 'loan')} detail="Outstanding balances and repayment history" color={colors} />
                  <DeletionRow icon="log-out" label="Your sign-in" detail="Name, contact details, password and every active device" color={colors} last />
                </View>
                {!twoFactorOn ? (
                  <View style={[styles.noticeCard, { backgroundColor: colors.destructiveSoft, borderColor: colors.destructiveBorder }]}>
                    <Feather name="alert-triangle" size={16} color={colors.destructive} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.noticeTitle, { color: colors.foreground }]}>Turn on two-factor authentication first</Text>
                      <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>Deletion is protected by a code from your authenticator app.</Text>
                      <Pressable testID="delete-open-twofa" accessibilityRole="button" onPress={onSetUpTwoFactor} style={({ pressed }) => [styles.noticeAction, { borderColor: colors.destructiveBorder, opacity: pressed ? 0.85 : 1 }]}>
                        <Text style={[styles.noticeActionText, { color: colors.destructive }]}>Set up two-factor authentication</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                <View style={uiStyles.modalActions}>
                  <Pressable onPress={onClose} style={({ pressed }) => [uiStyles.cancelButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={[uiStyles.cancelText, { color: colors.inkSoft }]}>Keep my account</Text></Pressable>
                  <View style={uiStyles.saveButton}>
                    <Pressable
                      testID="delete-continue-button"
                      accessibilityRole="button"
                      disabled={!twoFactorOn}
                      onPress={() => setStage('verify')}
                      style={({ pressed }) => [styles.dangerButton, { backgroundColor: colors.destructive, opacity: twoFactorOn ? (pressed ? 0.85 : 1) : 0.4 }]}
                    >
                      <Text style={[styles.dangerButtonText, { color: colors.destructiveForeground }]}>Continue</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <View>
                {needsPassword ? (
                  <>
                    <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>Your password</Text>
                    <TextInput
                      testID="delete-password-input"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      placeholder="Your current password"
                      placeholderTextColor={colors.mutedForeground}
                      style={[uiStyles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    />
                  </>
                ) : null}
                <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>Authenticator or backup code</Text>
                <TextInput
                  testID="delete-code-input"
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="123456 or ABCD-1234"
                  placeholderTextColor={colors.mutedForeground}
                  style={[uiStyles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                />
                <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>Type DELETE to confirm</Text>
                <TextInput
                  testID="delete-phrase-input"
                  value={phrase}
                  onChangeText={setPhrase}
                  autoCapitalize="characters"
                  placeholder="DELETE"
                  placeholderTextColor={colors.mutedForeground}
                  style={[uiStyles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                />
                {error ? <Text style={[styles.sheetError, { color: colors.destructive }]}>{error}</Text> : null}
                <View style={[styles.privacyNote, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Feather name="alert-circle" size={14} color={colors.destructive} />
                  <Text style={[styles.privacyNoteText, { color: colors.mutedForeground }]}>Your circles stay open for other members. Deleting your account removes your own records and signs you out everywhere.</Text>
                </View>
                <View style={uiStyles.modalActions}>
                  <Pressable onPress={onClose} style={({ pressed }) => [uiStyles.cancelButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={[uiStyles.cancelText, { color: colors.inkSoft }]}>Cancel</Text></Pressable>
                  <View style={uiStyles.saveButton}>
                    {busy ? (
                      <ActivityIndicator color={colors.destructive} />
                    ) : (
                      <Pressable
                        testID="confirm-delete-account"
                        accessibilityRole="button"
                        disabled={!ready}
                        onPress={erase}
                        style={({ pressed }) => [styles.dangerButton, { backgroundColor: colors.destructive, opacity: ready ? (pressed ? 0.85 : 1) : 0.4 }]}
                      >
                        <Text style={[styles.dangerButtonText, { color: colors.destructiveForeground }]}>Delete permanently</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DeletionRow({
  icon,
  label,
  detail,
  last,
  color,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  detail: string;
  last?: boolean;
  color: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.dataRow, !last && { borderBottomColor: color.border }]}>
      <View style={[styles.menuIcon, { backgroundColor: color.destructiveSoft }]}><Feather name={icon} size={16} color={color.destructive} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuLabel, { color: color.foreground }]}>{label}</Text>
        <Text style={[styles.menuDetail, { color: color.mutedForeground }]}>{detail}</Text>
      </View>
    </View>
  );
}

const faqs = [
  { icon: 'users' as const, question: 'What is a Turiwa circle?', answer: 'A circle is your chama or savings group on Turiwa. You set what members give and how often, and every member can see the progress together.' },
  { icon: 'plus-circle' as const, question: 'How do contributions work?', answer: 'Open a circle and tap Contribute, or use the Contribute tile on Home. Contributions are recorded instantly with a note, and appear in your Activity tab.' },
  { icon: 'credit-card' as const, question: 'How much can I borrow?', answer: 'Credit starts at KES 1,000 and is capped by what your circle has saved and what you still owe. Your group’s interest rate and total repayment are shown before you apply.' },
  { icon: 'smartphone' as const, question: 'Why do I enter a code at sign-up?', answer: 'The 6-digit code proves the phone number is yours before an account opens, and it expires after 10 minutes. Nobody can create a Turiwa on your number without reading it.' },
  { icon: 'lock' as const, question: 'Is my data safe?', answer: 'Your password is hashed, your session expires after 30 days, and every action is tied to your signed-in account.' },
];

function NotificationPreferencesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const sheet = useSheet();
  const { circles, notificationPreferences, saveNotificationPreferences } = useTuriwa();
  const [scope, setScope] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  React.useEffect(() => {
    if (visible) {
      setScope('');
      setBusy(null);
      setError('');
    }
  }, [visible]);
  const row = notificationPreferences.find((item) => item.circleId === scope);
  const values = {
    contributionReminders: row?.contributionReminders ?? true,
    loanReminders: row?.loanReminders ?? true,
    meetingReminders: row?.meetingReminders ?? true,
    savingsUpdates: row?.savingsUpdates ?? true,
    voteReminders: row?.voteReminders ?? true,
  };
  const options: { key: keyof typeof values; label: string; detail: string }[] = [
    { key: 'contributionReminders', label: 'Contributions', detail: 'Reminders before a cycle is due, and missed-contribution notices' },
    { key: 'loanReminders', label: 'Loans', detail: 'Applications, decisions, repayments and overdue loans' },
    { key: 'meetingReminders', label: 'Meetings', detail: 'New meetings, reschedules and cancellations' },
    { key: 'savingsUpdates', label: 'Savings goals', detail: 'New goals and progress on the ones you are part of' },
    { key: 'voteReminders', label: 'Proposals and votes', detail: 'New proposals, deadlines and published results' },
  ];
  const toggle = async (key: keyof typeof values, value: boolean) => {
    setBusy(key);
    setError('');
    try {
      await saveNotificationPreferences({ circleId: scope || undefined, [key]: value });
      Haptics.selectionAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that setting.');
    } finally {
      setBusy(null);
    }
  };
  const scopeName = scope ? circles.find((circle) => circle.id === scope)?.name ?? 'this circle' : 'All circles';
  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={[sheet.handle, { marginBottom: 18 }]} />
            <Text style={[uiStyles.modalEyebrow, { color: colors.primary }]}>NOTIFICATIONS</Text>
            <Text style={[uiStyles.modalTitle, { color: colors.foreground }]}>What reaches you</Text>
            <Text style={[uiStyles.modalHint, { color: colors.mutedForeground }]}>
              Choose the messages you want. A circle can have its own answer, and the account-wide choice applies to every circle without one.
              Messages about your own standing — a removal, a role change, a fine — always arrive.
            </Text>
            <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>APPLIES TO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8, paddingBottom: 4 }}>
              {[{ id: '', name: 'All circles' }, ...circles.map((circle) => ({ id: circle.id, name: circle.name }))].map((item) => {
                const active = item.id === scope;
                return (
                  <Pressable
                    key={item.id || 'all'}
                    testID={`notify-scope-${item.id || 'all'}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setScope(item.id)}
                    style={({ pressed }) => [styles.notifyChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.successSoft : colors.background, opacity: pressed ? 0.75 : 1 }]}
                  >
                    <Text style={[styles.notifyChipText, { color: active ? colors.primary : colors.mutedForeground }]}>{item.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={{ marginTop: 12 }}>
              {options.map((option) => (
                <View key={option.key} style={[styles.notifyRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuLabel, { color: colors.foreground }]}>{option.label}</Text>
                    <Text style={[styles.menuDetail, { color: colors.mutedForeground }]}>{option.detail}</Text>
                  </View>
                  <Switch
                    testID={`notify-toggle-${option.key}`}
                    accessibilityLabel={`${option.label} notifications for ${scopeName}`}
                    value={values[option.key]}
                    disabled={busy === option.key}
                    onValueChange={(value) => void toggle(option.key, value)}
                    trackColor={{ false: colors.border, true: colors.success }}
                    thumbColor={colors.card}
                    ios_backgroundColor={colors.border}
                  />
                </View>
              ))}
            </View>
            {error ? <Text style={[uiStyles.saveError, { color: colors.destructive }]} accessibilityLiveRegion="polite">{error}</Text> : null}
            <Text style={[uiStyles.modalHint, { color: colors.mutedForeground, marginTop: 12 }]}>
              These settings are saved to your account, so they follow you to any device.
            </Text>
            <View style={uiStyles.modalActions}>
              <View style={{ flex: 1 }}><PrimaryButton label="Done" icon="check" onPress={onClose} /></View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function HelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const sheet = useSheet();
  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={[sheet.handle, { marginBottom: 18 }]} />
            <Text style={[uiStyles.modalEyebrow, { color: colors.primary }]}>HELP CENTRE</Text>
            <Text style={[uiStyles.modalTitle, { color: colors.foreground }]}>How can we help?</Text>
            <Text style={[uiStyles.modalHint, { color: colors.mutedForeground }]}>Straight answers about circles, contributions, and credit.</Text>
            {faqs.map((faq) => (
              <View key={faq.question} style={[styles.faqRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.faqIcon, { backgroundColor: colors.successSoft }]}><Feather name={faq.icon} size={15} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.faqQuestion, { color: colors.foreground }]}>{faq.question}</Text>
                  <Text style={[styles.faqAnswer, { color: colors.mutedForeground }]}>{faq.answer}</Text>
                </View>
              </View>
            ))}
            <View style={uiStyles.modalActions}>
              <View style={{ flex: 1 }}><PrimaryButton label="Done" icon="check" onPress={onClose} /></View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  profileCard: { borderRadius: 22, padding: 20, gap: 16, marginTop: 4 },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileCopy: { flex: 1, gap: 2 },
  profileContact: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  avatar: { width: 56, height: 56, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 23 },
  profileName: { fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: -0.25 },
  profileMeta: { fontFamily: 'Inter_400Regular', fontSize: 11.5, marginTop: 2 },
  editAction: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'center', paddingHorizontal: 13, minHeight: 44, borderRadius: 13, borderWidth: 1 },
  editActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
  heroStatusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heroStatus: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  heroStatusText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.1 },
  singleColumn: { gap: 0 },
  columns: { flexDirection: 'row', gap: 22, alignItems: 'flex-start' },
  column: { flex: 1 },
  menu: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  menuItem: { minHeight: 70, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  menuIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuCopy: { flex: 1, gap: 2 },
  menuStatusWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '44%' },
  menuStatus: { fontFamily: 'Inter_600SemiBold', fontSize: 11, textAlign: 'right' },
  menuLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  menuDetail: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15 },
  circleRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingHorizontal: 14, gap: 12 },
  circleMark: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  circleMarkText: { fontFamily: 'Inter_700Bold', letterSpacing: 0.2 },
  activeChip: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  activeChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 10.5 },
  circleAction: { minWidth: 68, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  circleActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  switchNote: { fontFamily: 'Inter_400Regular', fontSize: 11.5, lineHeight: 16, marginTop: 10 },
  outlineAction: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', minHeight: 46, borderRadius: 14, borderWidth: 1, marginTop: 12 },
  outlineActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
  themeCard: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 13 },
  themeCardHead: { gap: 3 },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeChip: { flex: 1, minHeight: 46, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1 },
  themeChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
  notifyChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  notifyChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, paddingVertical: 14 },
  fieldFootnote: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 9 },
  stateNote: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 11 },
  stateIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  stateBody: { fontFamily: 'Inter_400Regular', fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  stateAction: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, marginTop: 11, minHeight: 40 },
  stateActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  aboutCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 14 },
  aboutHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  aboutTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, flex: 1 },
  aboutCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6 },
  version: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  signOut: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 24, padding: 12, minHeight: 44 },
  signOutText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  sheetError: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 8 },
  phoneRow: { borderWidth: 1, borderRadius: 14, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  phoneText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  phoneBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  phoneBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  discardCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 14 },
  discardTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  discardBody: { fontFamily: 'Inter_400Regular', fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  discardActions: { flexDirection: 'row', gap: 9, marginTop: 13 },
  discardButton: { flex: 1, minHeight: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  discardButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
  discardConfirmText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
  revealToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 10 },
  revealText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  privacyNote: { flexDirection: 'row', gap: 9, alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 16 },
  privacyNoteText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  faqRow: { flexDirection: 'row', gap: 11, paddingVertical: 14, borderBottomWidth: 1 },
  faqIcon: { width: 33, height: 33, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  faqQuestion: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  faqAnswer: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, marginTop: 5 },
  dialogShade: { flex: 1, backgroundColor: 'rgba(16,35,27,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  dialogCard: { borderRadius: 22, padding: 22, width: '100%', maxWidth: 340 },
  dialogIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  dialogTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: -0.3 },
  dialogCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 7 },
  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 21 },
  dialogCancelButton: { flex: 1, height: 49, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dialogCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  dialogConfirmButton: { flex: 1, height: 49, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dialogConfirmText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  savedPanel: { alignItems: 'center', paddingVertical: 18 },
  savedIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  savedTitle: { fontFamily: 'Inter_700Bold', fontSize: 19, letterSpacing: -0.3 },
  savedCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8, marginBottom: 21 },
  dangerCard: { borderWidth: 1, borderRadius: 18, minHeight: 70, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12, marginTop: 18 },
  dangerIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dangerLabel: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  dangerDetail: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4, lineHeight: 15 },
  statusCard: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: 'transparent' },
  statusIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  codePanel: { borderWidth: 1, borderRadius: 18, padding: 16 },
  codePanelTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  codePanelHint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 14 },
  codeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  codeChip: { width: '47%', borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 10, fontFamily: 'Inter_600SemiBold', fontSize: 13, letterSpacing: 1.4, textAlign: 'center' },
  fieldHint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 8 },
  outlineDangerButton: { height: 49, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  outlineDangerText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  keyCard: { borderWidth: 1, borderRadius: 16, padding: 15, alignItems: 'center' },
  keyEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.5 },
  keyValue: { fontFamily: 'Inter_600SemiBold', fontSize: 15, letterSpacing: 1.6, marginTop: 9, textAlign: 'center', lineHeight: 22 },
  stepList: { marginTop: 16 },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
  stepDot: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  stepText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  otpauth: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15, marginTop: 14 },
  dataCard: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  dataRow: { minHeight: 62, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  noticeCard: { borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', gap: 11, marginTop: 16 },
  noticeTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  noticeText: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 },
  noticeAction: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, marginTop: 11 },
  noticeActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  dangerButton: { height: 49, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dangerButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
