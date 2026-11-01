import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useTuriwa } from '@/context/TuriwaContext';
import type { Circle } from '@/lib/api';
import { GroupForm } from '@/components/GroupForm';
import { BrandHeader, CircleCard, CircleDetailModal, PrimaryButton, RecordTransactionModal, Screen, SectionHeading, useSheet } from '@/components/TuriwaUI';

export default function CirclesScreen() {
  const colors = useColors();
  const layout = useResponsive();
  const {
    circles,
    contributions,
    loans,
    finance,
    user,
    createCircle,
    deleteCircle,
    setCircleFine,
    applyFine,
    addContribution,
    removeCircleMember,
    refresh,
    refreshing,
  } = useTuriwa();
  const [visible, setVisible] = useState(false);
  const [detailCircleId, setDetailCircleId] = useState<string | null>(null);
  const [contributeCircleId, setContributeCircleId] = useState<string | undefined>(undefined);
  const [contributeVisible, setContributeVisible] = useState(false);
  const sheet = useSheet();
  const isAdmin = (circle: Circle) => Boolean(user?.id) && (circle.createdBy === user?.id || circle.adminId === user?.id);
  const isCoAdmin = (circle: Circle) => {
    const id = user?.id;
    return id !== undefined && (circle.coAdminIds ?? []).includes(id);
  };
  const savedFor = finance.savedFor;
  const openContribute = (circleId: string) => {
    setDetailCircleId(null);
    setContributeCircleId(circleId);
    setContributeVisible(true);
  };
  const activeCircle = detailCircleId ? (circles.find((c) => c.id === detailCircleId) ?? null) : null;
  return (
    <>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <BrandHeader title="Your circles" subtitle={`${circles.length} ${circles.length === 1 ? 'group' : 'groups'} · everything in one place`} />
        <View style={[styles.summary, { backgroundColor: colors.warmSurface, borderColor: colors.goldBorder }]}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.accent }]}><MaterialCommunityIcons name="hand-heart-outline" size={21} color={colors.onAccent} /></View>
          <View style={{ flex: 1 }}><Text style={[styles.summaryTitle, { color: colors.foreground }]}>Together, you go further</Text><Text style={[styles.summaryCopy, { color: colors.inkSoft }]}>Every contribution builds trust and momentum.</Text></View>
        </View>
        <Pressable
          testID="join-circle"
          accessibilityRole="button"
          onPress={() => router.push('/join-circle' as Href)}
          style={({ pressed }) => [styles.joinAction, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.75 : 1 }]}
        >
          <Feather name="user-plus" size={16} color={colors.primary} />
          <Text style={[styles.joinActionText, { color: colors.primary }]}>Join an existing circle with an invite code</Text>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </Pressable>
        <SectionHeading title="Active circles" action="+ New circle" onAction={() => setVisible(true)} />
        {circles.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="hand-heart-outline" size={26} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No circles yet</Text>
            <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>Start a group and set how much members give, how often, and what it lends at.</Text>
            <View style={{ marginTop: 14 }}>
              <PrimaryButton label="Create your first group" icon="plus" onPress={() => setVisible(true)} />
            </View>
          </View>
        ) : null}
        <View style={styles.cardGrid}>
          {circles.map((circle) => (
            <View key={circle.id} style={{ width: layout.cardWidth }}>
              <CircleCard
                {...circle}
                tone={circle.color}
                isAdmin={isAdmin(circle)}
                isCoAdmin={isCoAdmin(circle)}
                current={savedFor(circle.id)}
                target={circle.target}
                onPress={() => setDetailCircleId(circle.id)}
              />
            </View>
          ))}
        </View>
        <View style={[styles.transparentNote, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name="eye" size={17} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.noteTitle, { color: colors.foreground }]}>Built on transparency</Text><Text style={[styles.noteCopy, { color: colors.mutedForeground }]}>Your circle history stays visible to every member.</Text></View></View>
      </Screen>
      <Modal visible={visible} transparent animationType={sheet.animationType} onRequestClose={() => setVisible(false)}>
        <View style={[sheet.shade, { backgroundColor: 'rgba(16,35,27,0.42)' }]}>
          <View style={[sheet.card, { backgroundColor: colors.card }]}>
            <Pressable onPress={() => setVisible(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={styles.closeHit}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Start a new circle</Text>
            <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>Create a space for a shared goal and invite your people.</Text>
            <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
              <GroupForm
                submitLabel="Create circle"
                onCreate={async (draft) => {
                  await createCircle(draft);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setVisible(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
      <CircleDetailModal
        visible={activeCircle !== null}
        circle={activeCircle ?? undefined}
        contributions={contributions}
        loans={loans}
        isAdmin={activeCircle ? isAdmin(activeCircle) : false}
        isCoAdmin={activeCircle ? isCoAdmin(activeCircle) : false}
        currentUserId={user?.id}
        onClose={() => setDetailCircleId(null)}
        onContribute={openContribute}
        onApplyLoan={(circleId) => {
          setDetailCircleId(null);
          router.push({ pathname: '/loans', params: { circleId } });
        }}
        onReviewLoans={() => {
          setDetailCircleId(null);
          router.push('/loans');
        }}
        onRemoveCircleMember={async (circleId, memberId) => {
          await removeCircleMember(circleId, memberId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        canDeleteCircle={circles.length > 1}
        onDeleteCircle={async (circleId) => {
          await deleteCircle(circleId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        onSetFine={async (circleId, amount) => {
          await setCircleFine(circleId, amount);
          Haptics.selectionAsync();
        }}
        onApplyFine={async (circleId, memberId) => {
          await applyFine(circleId, memberId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
      />
      <RecordTransactionModal
        visible={contributeVisible}
        circles={circles}
        initialCircleId={contributeCircleId}
        onClose={() => setContributeVisible(false)}
        onSave={addContribution}
      />
    </>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: 18, padding: 16, borderWidth: 1, flexDirection: 'row', gap: 12, alignItems: 'center' },
  summaryIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  summaryCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  joinAction: { minHeight: 48, borderWidth: 1, borderRadius: 14, marginTop: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  joinActionText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  emptyCard: { borderRadius: 18, borderWidth: 1, padding: 20, alignItems: 'center', marginBottom: 12 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 10 },
  emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  emptyAction: { borderRadius: 13, paddingHorizontal: 16, minHeight: 46, justifyContent: 'center', marginTop: 15 },
  emptyActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  transparentNote: { borderRadius: 17, borderWidth: 1, padding: 15, flexDirection: 'row', gap: 11, alignItems: 'center', marginTop: 18 },
  noteTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  noteCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  closeHit: { alignSelf: 'flex-end', padding: 4 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5, marginTop: -6 },
  modalHint: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 4 },
  formScroll: { flexGrow: 0, flexShrink: 1 },
});
