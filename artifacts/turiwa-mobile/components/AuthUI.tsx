import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';

export function TuriwaMark({ size = 72 }: { size?: number }) {
  const colors = useColors();
  const leaf = size * 0.25;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.markRing, { width: size * 0.78, height: size * 0.78, borderColor: colors.primary }]} />
      <View style={[styles.leaf, styles.leafLeft, { width: leaf, height: leaf * 1.5, backgroundColor: colors.primary }]} />
      <View style={[styles.leaf, styles.leafRight, { width: leaf, height: leaf * 1.5, backgroundColor: colors.tint }]} />
      <View style={[styles.leaf, styles.leafTop, { width: leaf * 0.82, height: leaf * 1.25, backgroundColor: colors.primary }]} />
      <View style={[styles.markDot, { width: size * 0.12, height: size * 0.12, borderRadius: size * 0.06, backgroundColor: colors.accent }]} />
    </View>
  );
}

export function AuthShell({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.shell, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + 18,
        paddingBottom: insets.bottom + 28,
        paddingHorizontal: 20,
        flexGrow: 1,
      }}
      bottomOffset={28}
      scrollEnabled={scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </KeyboardAwareScrollViewCompat>
  );
}

export function AuthHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.authHeader}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
      ) : null}
      <TuriwaMark size={44} />
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
          { backgroundColor: colors.muted, borderColor: error ? colors.destructive : colors.border, color: colors.foreground },
          props.style,
        ]}
      />
      {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

export function AuthButton({ label, onPress, outline = false, disabled = false, icon }: { label: string; onPress: () => void; outline?: boolean; disabled?: boolean; icon?: keyof typeof Feather.glyphMap }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.authButton,
        { backgroundColor: outline ? colors.card : colors.primary, borderColor: outline ? colors.tint : colors.primary, opacity: disabled ? 0.45 : pressed ? 0.86 : 1 },
      ]}
    >
      {icon ? <Feather name={icon} size={17} color={outline ? colors.primary : colors.primaryForeground} /> : null}
      <Text style={[styles.authButtonText, { color: outline ? colors.primary : colors.primaryForeground }]}>{label}</Text>
    </Pressable>
  );
}

export function ProgressSegments({ active }: { active: number }) {
  const colors = useColors();
  return (
    <View style={styles.progressSegments}>
      {[1, 2, 3].map((item) => (
        <View key={item} style={[styles.progressSegment, { backgroundColor: item <= active ? colors.primary : colors.muted }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  markRing: { position: 'absolute', borderWidth: 2, borderRadius: 999 },
  leaf: { position: 'absolute', borderRadius: 999, transform: [{ rotate: '45deg' }] },
  leafLeft: { left: '20%', top: '38%', transform: [{ rotate: '-48deg' }] },
  leafRight: { right: '20%', top: '38%', transform: [{ rotate: '48deg' }] },
  leafTop: { top: '15%', transform: [{ rotate: '0deg' }] },
  markDot: { position: 'absolute', top: '50%' },
  authHeader: { alignItems: 'center', marginBottom: 28 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 8, marginBottom: 4 },
  authTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.7, marginTop: 12, textAlign: 'center' },
  authSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 7, maxWidth: 320 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 7 },
  field: { minHeight: 54, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 15 },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 6 },
  authButton: { minHeight: 54, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  authButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  progressSegments: { flexDirection: 'row', gap: 6, marginBottom: 22 },
  progressSegment: { flex: 1, height: 4, borderRadius: 4 },
});

export const authStyles = styles;