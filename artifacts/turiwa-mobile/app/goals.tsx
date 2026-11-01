import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTuriwa } from '@/context/TuriwaContext';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import * as api from '@/lib/api';
import { kesLabel } from '@/lib/api';
import { BrandHeader, EmptyState, Screen, SectionHeading, SkeletonRows } from '@/components/TuriwaUI';
import { AppChrome, useSubScreenBack } from '@/components/AppNav';

export default function GoalsScreen() {
  const { circles } = useTuriwa();
  const colors = useColors();
  const layout = useResponsive();
  const router = useRouter();
  const onBack = useSubScreenBack();
  const [goalRows, setGoalRows] = useState<api.SavingsGoalRecord[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const all = await Promise.all(circles.map((circle) => api.getGoals(circle.id)));
      setGoalRows(all.flat());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load savings goals.');
      setGoalRows([]);
    }
  }, [circles]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppChrome>
      <Screen>
        <BrandHeader onBack={onBack} title="Savings goals" subtitle="Progress comes from recorded contributions in the circle ledger." />
        {goalRows === null ? (
          <SkeletonRows rows={3} />
        ) : circles.length === 0 ? (
          <EmptyState
            icon="users"
            title="No circles yet"
            body="A savings goal belongs to a circle. Create one, and its targets appear here."
            actionLabel="Create a group"
            onAction={() => router.push('/(onboarding)/create-group')}
          />
        ) : error ? (
          <EmptyState icon="alert-triangle" title="Goals could not be loaded" body={`${error} Pull down on this screen to try again.`} />
        ) : goalRows.length === 0 ? (
          <EmptyState
            icon="target"
            title="No savings goals set"
            body="A goal gives the circle a target to save towards - a piece of equipment, school fees, a shared purchase."
          />
        ) : (
          circles.map((circle) => {
            const rows = goalRows.filter((goal) => goal.circleId === circle.id);
            if (rows.length === 0) return null;
            return (
              <View key={circle.id} style={styles.section}>
                <SectionHeading title={circle.name} />
                <View style={styles.grid}>
                  {rows.map((goal) => (
                    <View key={goal.id} style={{ width: layout.cardWidth }}>
                      <GoalCard goal={goal} />
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </Screen>
    </AppChrome>
  );
}

function GoalCard({ goal }: { goal: api.SavingsGoalRecord }) {
  const colors = useColors();
  const progress = goal.targetAmount > 0 ? Math.min(100, Math.round((100 * goal.amountSaved) / goal.targetAmount)) : 0;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>{goal.name}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
        {goal.description || goal.category} · target {goal.targetOn}
      </Text>
      <Text style={[styles.amount, { color: colors.foreground }]}>
        {kesLabel(goal.amountSaved)} <Text style={{ color: colors.mutedForeground }}>of {kesLabel(goal.targetAmount)}</Text>
      </Text>
      <View style={[styles.track, { backgroundColor: colors.muted }]}>
        <View style={[styles.fill, { width: `${progress}%`, backgroundColor: colors.primary }]} />
      </View>
      <Text style={[styles.percent, { color: colors.mutedForeground }]}>{progress}% saved</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 10 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16, letterSpacing: -0.3 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 4 },
  amount: { fontFamily: 'Inter_700Bold', fontSize: 15, letterSpacing: -0.3, marginTop: 12 },
  track: { height: 8, borderRadius: 8, overflow: 'hidden', marginTop: 10 },
  fill: { height: '100%', borderRadius: 8 },
  percent: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 7 },
});
