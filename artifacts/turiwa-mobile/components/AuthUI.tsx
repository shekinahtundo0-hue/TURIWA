import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { TuriwaLogo } from '@/components/TuriwaLogo';

export function TuriwaMark({ size = 72 }: { size?: number }) {
  return <TuriwaLogo size={size} />;
}

export function AuthShell({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { gutter } = useResponsive();
  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.shell, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + 18,
        paddingBottom: insets.bottom + 28,
        paddingHorizontal: gutter,
        flexGrow: 1,
        alignItems: 'center',
      }}
      bottomOffset={28}
      scrollEnabled={scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.shellColumn}>{children}</View>
    </KeyboardAwareScrollViewCompat>
  );
}

export function AuthHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.authHeader}>
      {onBack ? (
        <Pressable onPress={onBack} testID="auth-back" accessibilityRole="button" accessibilityLabel="Go back" style={styles.backButton} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
      ) : null}
      <TuriwaMark size={48} />
      <Text style={[styles.authTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.authSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
    </View>
  );
}

export function AuthField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const colors = useColors();
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.field,
          { backgroundColor: colors.input, borderColor: error ? colors.destructive : colors.border, color: colors.foreground },
          props.style,
        ]}
      />
      {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

export function AuthButton({ label, onPress, outline = false, disabled = false, icon, testID }: { label: string; onPress: () => void; outline?: boolean; disabled?: boolean; icon?: keyof typeof Feather.glyphMap; testID?: string }) {
  const colors = useColors();
  if (outline) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.authButton,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            transform: [{ scale: pressed ? 0.985 : 1 }],
            opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          },
        ]}
      >
        {icon ? <Feather name={icon} size={17} color={colors.primary} /> : null}
        <Text style={[styles.authButtonText, { color: colors.primary }]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.authButtonOuter,
        {
          borderRadius: 14,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          opacity: disabled ? 0.45 : pressed ? 0.88 : 1,
        },
      ]}
    >
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.authButtonGrad}
      >
        {icon ? <Feather name={icon} size={17} color={colors.primaryForeground} /> : null}
        <Text style={[styles.authButtonText, { color: colors.primaryForeground }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function ProgressSegments({ active, total = 3 }: { active: number; total?: number }) {
  const colors = useColors();
  return (
    <View style={styles.progressSegments}>
      {Array.from({ length: total }, (_item, index) => index + 1).map((item) => (
        <View key={item} style={[styles.progressSegment, { backgroundColor: item <= active ? colors.primary : colors.muted }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  // Sign-in forms stay a readable column instead of stretching across a desktop window.
  shellColumn: { width: '100%', maxWidth: 460, flexGrow: 1 },
  markRing: { position: 'absolute', borderWidth: 2, borderRadius: 999 },
  leaf: { position: 'absolute', borderRadius: 999, transform: [{ rotate: '45deg' }] },
  leafLeft: { left: '20%', top: '38%', transform: [{ rotate: '-48deg' }] },
  leafRight: { right: '20%', top: '38%', transform: [{ rotate: '48deg' }] },
  leafTop: { top: '15%', transform: [{ rotate: '0deg' }] },
  markDot: { position: 'absolute', top: '50%' },
  authHeader: { alignItems: 'center', marginBottom: 28 },
  backButton: { alignSelf: 'flex-start', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginStart: -10, marginBottom: -4 },
  authTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.7, marginTop: 12, textAlign: 'center' },
  authSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 7, maxWidth: 320 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 7 },
  field: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, fontFamily: 'Inter_400Regular', fontSize: 15 },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 6 },
  authButtonOuter: { overflow: 'hidden' },
  authButtonGrad: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  authButton: { minHeight: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  authButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, letterSpacing: -0.1 },
  progressSegments: { flexDirection: 'row', gap: 6, marginBottom: 22 },
  progressSegment: { flex: 1, height: 5, borderRadius: 999 },
});

export const authStyles = styles;