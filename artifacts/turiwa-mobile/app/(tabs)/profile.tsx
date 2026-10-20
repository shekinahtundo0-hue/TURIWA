import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { BrandHeader, PrimaryButton, Screen, useSheet, styles as uiStyles } from '@/components/TuriwaUI';
import { useTuriwa } from '@/context/TuriwaContext';
import { useTheme } from '@/context/ThemeContext';
import * as api from '@/lib/api';

type Sheet = 'details' | 'security' | 'twofa' | 'help' | 'delete' | null;

const items: { key: Exclude<Sheet, null>; icon: keyof typeof Feather.glyphMap; label: string; detail: string }[] = [
  { key: 'details', icon: 'user', label: 'Personal details', detail: 'Your name and contact information' },
  { key: 'security', icon: 'shield', label: 'Security & privacy', detail: 'Keep your account protected' },
  { key: 'twofa', icon: 'smartphone', label: 'Two-factor authentication', detail: 'Authenticator codes and backup codes' },
  { key: 'help', icon: 'help-circle', label: 'Help centre', detail: 'Answers and support from Turiwa' },
];

export default function ProfileScreen() {
  const colors = useColors();
  const { profileName, user, signOut } = useTuriwa();
  const { isDark, setPreference } = useTheme();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [signingOut, setSigningOut] = useState(false);
  const initials = profileName.trim().slice(0, 1).toUpperCase() || 'S';
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : null;
  return (
    <>
      <Screen>
        <BrandHeader title="Your profile" subtitle="Your Turiwa account, your way." />
        <LinearGradient
          colors={isDark ? ['#051811', '#0B2D21'] : ['#022E20', '#04432F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.profileCard, { boxShadow: colors.shadowHero }]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.heroChip, borderColor: colors.heroBorder }]}>
            <Text style={[styles.avatarText, { color: colors.heroForeground }]}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: colors.heroForeground }]}>{profileName}</Text>
            <Text style={[styles.profileMeta, { color: colors.heroMuted }]}>
              {memberSince ? `Member since ${memberSince}` : 'Turiwa member'}
            </Text>
          </View>
          <View style={[styles.verified, { backgroundColor: colors.heroChip, borderColor: colors.heroBorder }]}>
            <Feather name="check" size={13} color={colors.heroForeground} />
            <Text style={[styles.verifiedText, { color: colors.heroForeground }]}>Verified</Text>
          </View>
        </LinearGradient>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ACCOUNT</Text>
        <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {items.map((item) => <Pressable key={item.label} testID={`menu-${item.key}`} onPress={() => setSheet(item.key)} accessibilityRole="button" style={({ pressed }) => [styles.menuItem, { borderBottomColor: colors.border, opacity: pressed ? 0.65 : 1 }]}><View style={[styles.menuIcon, { backgroundColor: colors.successSoft }]}><Feather name={item.icon} size={17} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text><Text style={[styles.menuDetail, { color: colors.mutedForeground }]}>{item.detail}</Text></View><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable>)}
        </View>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PREFERENCES</Text>
        <View style={[styles.appearanceRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.menuIcon, { backgroundColor: colors.successSoft }]}><Feather name={isDark ? 'moon' : 'sun'} size={17} color={colors.primary} /></View>
          <View style={{ flex: 1 }}><Text style={[styles.menuLabel, { color: colors.foreground }]}>{isDark ? 'Dark mode' : 'Light mode'}</Text><Text style={[styles.menuDetail, { color: colors.mutedForeground }]}>Use the theme that feels right for you</Text></View>
          <Switch
            accessibilityLabel="Toggle dark mode"
            value={isDark}
            onValueChange={(value) => setPreference(value ? 'dark' : 'light')}
            trackColor={{ false: colors.border, true: colors.success }}
            thumbColor={colors.card}
            ios_backgroundColor={colors.border}
          />
        </View>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ABOUT TURIWA</Text>
        <View style={[styles.aboutCard, { backgroundColor: colors.warmSurface, borderColor: colors.goldBorder }]}><Text style={[styles.aboutTitle, { color: colors.foreground }]}>Trust, transparently.</Text><Text style={[styles.aboutCopy, { color: colors.inkSoft }]}>Turiwa helps communities save together with clarity, accountability, and a shared sense of progress.</Text><Text style={[styles.version, { color: colors.mutedForeground }]}>Version 1.0.0</Text></View>
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
            <Text style={[styles.dangerDetail, { color: colors.mutedForeground }]}>Permanently erase your circles, contributions, loans and sign-in</Text>
          </View>
          <Feather name="chevron-right" size={17} color={colors.destructive} />
        </Pressable>
        <Pressable onPress={() => setSigningOut(true)} testID="sign-out" accessibilityRole="button" accessibilityLabel="Sign out of Turiwa" style={styles.signOut}><Feather name="log-out" size={16} color={colors.destructive} /><Text style={[styles.signOutText, { color: colors.destructive }]}>Sign out</Text></Pressable>
      </Screen>
      <EditDetailsSheet visible={sheet === 'details'} onClose={() => setSheet(null)} />
      <SecuritySheet visible={sheet === 'security'} onClose={() => setSheet(null)} />
      <TwoFactorSheet visible={sheet === 'twofa'} onClose={() => setSheet(null)} />
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
  React.useEffect(() => {
    if (visible) {
      setName(profileName);
      setError('');
    }
  }, [visible, profileName]);
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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={[sheet.handle, { marginBottom: 18 }]} />
            <Text style={[uiStyles.modalEyebrow, { color: colors.primary }]}>PERSONAL DETAILS</Text>
            <Text style={[uiStyles.modalTitle, { color: colors.foreground }]}>Your details</Text>
            <Text style={[uiStyles.modalHint, { color: colors.mutedForeground }]}>Update the name your circles see. Your contact details identify your account.</Text>
            <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>Full name</Text>
            <TextInput
              testID="profile-name-input"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Sheila Wanjiru"
              placeholderTextColor={colors.mutedForeground}
              style={[uiStyles.textInput, { backgroundColor: colors.background, borderColor: error ? colors.destructive : colors.border, color: colors.foreground }]}
            />
            {error ? <Text style={[styles.sheetError, { color: colors.destructive }]}>{error}</Text> : null}
            {user?.phone ? (
              <>
                <Text style={[uiStyles.inputLabel, { color: colors.inkSoft }]}>Phone number</Text>
                <View style={[styles.phoneRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Feather name="phone" size={15} color={colors.primary} />
                  <Text style={[styles.phoneText, { color: colors.foreground }]}>{user.phone}</Text>
                  <View style={[styles.phoneBadge, { backgroundColor: colors.successSoft }]}><Text style={[styles.phoneBadgeText, { color: colors.primary }]}>Verified</Text></View>
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
            <View style={uiStyles.modalActions}>
              <Pressable onPress={onClose} style={({ pressed }) => [uiStyles.cancelButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={[uiStyles.cancelText, { color: colors.inkSoft }]}>Cancel</Text></Pressable>
              <View style={uiStyles.saveButton}>{busy ? <ActivityIndicator color={colors.primary} /> : <PrimaryButton label="Save changes" icon="check" onPress={save} />}</View>
            </View>
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
          <ScrollView style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
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
          <ScrollView style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
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
          <ScrollView style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
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

function HelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const sheet = useSheet();
  return (
    <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={onClose}>
      <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
        <View style={[sheet.card, { backgroundColor: colors.card }]}>
          <ScrollView style={uiStyles.sheetScroll} showsVerticalScrollIndicator={false}>
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
  profileCard: { borderRadius: 22, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  profileName: { fontFamily: 'Inter_700Bold', fontSize: 16.5, letterSpacing: -0.2 },
  profileMeta: { fontFamily: 'Inter_400Regular', fontSize: 11.5, marginTop: 4 },
  verified: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  verifiedText: { fontFamily: 'Inter_600SemiBold', fontSize: 10.5, letterSpacing: 0.2 },
  sectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.6, marginTop: 29, marginBottom: 9 },
  menu: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  menuItem: { minHeight: 70, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  menuIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  appearanceRow: { borderWidth: 1, borderRadius: 18, minHeight: 70, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  menuLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  menuDetail: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  aboutCard: { borderWidth: 1, borderRadius: 18, padding: 16 },
  aboutTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  aboutCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6 },
  version: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 14 },
  signOut: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 24, padding: 12 },
  signOutText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  sheetError: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 8 },
  phoneRow: { borderWidth: 1, borderRadius: 14, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  phoneText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  phoneBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  phoneBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
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
  keyEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5 },
  keyValue: { fontFamily: 'Inter_600SemiBold', fontSize: 15, letterSpacing: 1.6, marginTop: 9, textAlign: 'center', lineHeight: 22 },
  stepList: { marginTop: 16 },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
  stepDot: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  stepText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  otpauth: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 14 },
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
