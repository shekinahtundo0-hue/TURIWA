import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useTuriwa } from '@/context/TuriwaContext';
import {
  ActivityRow,
  AddContributionModal,
  Amount,
  BrandHeader,
  CircleCard,
  PrimaryButton,
  Screen,
  SectionHeading,
  StatPill,
} from '@/components/TuriwaUI';

export default function HomeScreen() {
  const colors = useColors();
  const { circles, contributions, addContribution, hydrated } = useTuriwa();
  const [modalVisible, setModalVisible] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const totalSaved = contributions.reduce((sum, item) => sum + item.amount, 0);
  const upcoming = circles[0]?.monthly ?? 2000;

  if (!hydrated) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <MaterialCommunityIcons name="loading" size={32} color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Screen>
        <BrandHeader
          title="Good morning, Sheila"
          subtitle="Your circles are moving forward."
          onNotification={() =>
            Alert.alert('All caught up', 'You have no new Turiwa notifications.')
          }
        />
        <View style={styles.heroWrap}>
          <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
            <View style={styles.heroOrb} />
            <Text style={[styles.heroEyebrow, { color: colors.successSoft }]}>
              TOTAL CONTRIBUTIONS
            </Text>
            <Amount value={totalSaved} size={34} color={colors.primaryForeground} />
            <View style={styles.heroFooter}>
              <View>
                <Text style={[styles.heroMeta, { color: colors.successSoft }]}>
                  This month
                </Text>
                <Text style={[styles.heroMonth, { color: colors.primaryForeground }]}>
                  + KES {upcoming.toLocaleString()} scheduled
                </Text>
              </View>
              <View
                style={[
                  styles.trustBadge,
                  { backgroundColor: 'rgba(255,255,255,0.16)' },
                ]}
              >
                <Feather name="shield" size={14} color={colors.primaryForeground} />
                <Text style={[styles.trustText, { color: colors.primaryForeground }]}>
                  Trusted
                </Text>
              </View>
            </View>
          </View>
          <View style={[styles.heroShadow, { backgroundColor: colors.accent }]} />
        </View>
        <View style={styles.statsRow}>
          <StatPill
            icon="account-group-outline"
            label="Active circles"
            value={`${circles.length}`}
          />
          <View style={{ width: 10 }} />
          <StatPill icon="trending-up" label="On track" value="100%" tone="gold" />
        </View>
        <View style={styles.quickActionRow}>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label="Add contribution"
              icon="plus"
              onPress={() => {
                Haptics.selectionAsync();
                setModalVisible(true);
              }}
            />
          </View>
          <Pressable
            onPress={() =>
              Alert.alert(
                'Invite a member',
                'Share your circle invite link from the Circles tab.',
              )
            }
            style={({ pressed }) => [
              styles.inviteButton,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="user-plus" size={17} color={colors.primary} />
            <Text style={[styles.inviteText, { color: colors.primary }]}>Invite</Text>
          </Pressable>
        </View>
        <SectionHeading
          title="Your circles"
          action="See all"
          onAction={() => setShowAll(true)}
        />
        {(showAll ? circles : circles.slice(0, 2)).map((circle) => (
          <CircleCard
            key={circle.id}
            {...circle}
            tone={circle.color}
            current={
              circle.id === 'harambee' ? totalSaved : Math.round(totalSaved * 0.62)
            }
            onPress={() =>
              Alert.alert(
                circle.name,
                `${circle.members} members are contributing KES ${circle.monthly.toLocaleString()} monthly.`,
              )
            }
          />
        ))}
        <SectionHeading
          title="Recent activity"
          action="View all"
          onAction={() =>
            Alert.alert(
              'Activity',
              'Open the Activity tab to see your complete contribution history.',
            )
          }
        />
        {contributions.slice(0, 3).map((item) => (
          <ActivityPreview key={item.id} {...item} />
        ))}
      </Screen>
      <AddContributionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={addContribution}
      />
    </>
  );
}

function ActivityPreview({
  note,
  date,
  amount,
  status,
}: {
  note: string;
  date: string;
  amount: number;
  status: 'Complete' | 'Pending';
}) {
  const colors = useColors();
  return (
    <View style={[styles.previewRow, { borderBottomColor: colors.border }]}>
      <View
        style={[
          styles.previewDot,
          {
            backgroundColor:
              status === 'Complete' ? colors.successSoft : colors.warmSurface,
          },
        ]}
      >
        <Feather
          name={status === 'Complete' ? 'arrow-up-right' : 'clock'}
          size={15}
          color={status === 'Complete' ? colors.primary : colors.accentForeground}
        />
      </View>
      <View style={styles.previewCopy}>
        <Text style={[styles.previewNote, { color: colors.foreground }]}>{note}</Text>
        <Text style={[styles.previewDate, { color: colors.mutedForeground }]}>
          {date}
        </Text>
      </View>
      <Text style={[styles.previewAmount, { color: colors.foreground }]}>
        KES {amount.toLocaleString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroWrap: { position: 'relative', marginBottom: 17 },
  heroCard: { borderRadius: 24, padding: 21, minHeight: 177, overflow: 'hidden' },
  heroOrb: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    right: -57,
    top: -74,
  },
  heroEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.8,
    marginBottom: 11,
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 23,
  },
  heroMeta: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  heroMonth: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 4 },
  trustBadge: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
  trustText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  heroShadow: {
    position: 'absolute',
    width: '70%',
    height: 20,
    bottom: -7,
    left: '15%',
    borderRadius: 15,
    opacity: 0.22,
    zIndex: -1,
  },
  statsRow: { flexDirection: 'row' },
  quickActionRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  inviteButton: {
    flex: 0.42,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    gap: 10,
  },
  previewDot: {
    width: 35,
    height: 35,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCopy: { flex: 1 },
  previewNote: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  previewDate: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  previewAmount: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
