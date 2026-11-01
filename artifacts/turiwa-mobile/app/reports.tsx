import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTuriwa } from '@/context/TuriwaContext';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import * as api from '@/lib/api';
import { kesLabel } from '@/lib/api';
import { BrandHeader, EmptyState, Screen, SectionHeading, SkeletonRows } from '@/components/TuriwaUI';
import { AppChrome, useSubScreenBack } from '@/components/AppNav';

type Report = { circle: { id: string; name: string }; totals: Record<string, number> };

const LINES: [string, string][] = [
  ['Contributions', 'contributions'],
  ['Loans issued', 'loansIssued'],
  ['Outstanding loans', 'outstandingLoans'],
  ['Repayments', 'repayments'],
  ['Expenses', 'expenses'],
  ['Welfare set aside', 'welfare'],
  ['Recorded cash', 'cashRecorded'],
];

export default function ReportsScreen() {
  const { circles, user } = useTuriwa();
  const colors = useColors();
  const layout = useResponsive();
  const onBack = useSubScreenBack();
  const [data, setData] = useState<Report[] | null>(null);

  // The same rights the API enforces: only an admin or co-admin of a circle can
  // read its summary, so the list is filtered before the calls go out.
  const manageable = circles.filter(
    (circle) =>
      circle.createdBy === user?.id ||
      circle.membersList?.some((member) => member.id === user?.id && member.role === 'co-admin' && member.status === 'active'),
  );

  const load = useCallback(async () => {
    if (manageable.length === 0) {
      setData([]);
      return;
    }
    try {
      setData(await Promise.all(manageable.map((circle) => api.getFinancialReport(circle.id))));
    } catch {
      setData([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circles, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppChrome>
      <Screen>
        <BrandHeader onBack={onBack} title="Financial reports" subtitle="Recorded ledger activity by circle. Estimates are not included." />
        {data === null ? (
          <SkeletonRows rows={3} />
        ) : data.length === 0 ? (
          <EmptyState
            icon="pie-chart"
            title="No reports to show"
            body="Reports are open to a circle's admin and co-admin. If you hold neither role in any circle, this stays empty."
          />
        ) : (
          <View style={styles.grid}>
            {data.map((report) => (
              <View key={report.circle.id} style={{ width: layout.cardWidth }}>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <SectionHeading title={report.circle.name} />
                  {LINES.map(([label, key]) => (
                    <View key={key} style={[styles.row, { borderTopColor: colors.border }]}>                      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
                      <Text style={[styles.rowValue, { color: colors.foreground }]}>{kesLabel(report.totals[key] ?? 0)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </Screen>
    </AppChrome>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontFamily: 'Inter_400Regular', fontSize: 13, flex: 1 },
  // Tabular figures keep two circles' columns aligned when the amounts differ in length.
  rowValue: { fontFamily: 'Inter_700Bold', fontSize: 13.5, fontVariant: ['tabular-nums'] },
});
