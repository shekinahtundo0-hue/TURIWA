import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useTuriwa } from '@/context/TuriwaContext';
import { ActivityRow, BrandHeader, Screen, SectionHeading } from '@/components/TuriwaUI';

export default function ActivityScreen() {
  const colors = useColors();
  const { contributions } = useTuriwa();
  const [filter, setFilter] = useState<'All' | 'Complete' | 'Pending'>('All');
  const filtered = useMemo(() => filter === 'All' ? contributions : contributions.filter((item) => item.status === filter), [contributions, filter]);
  const total = contributions.reduce((sum, item) => sum + item.amount, 0);
  return (
    <Screen>
      <BrandHeader title="Activity" subtitle="A clear record of every contribution." />
      <View style={[styles.totalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View><Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>TOTAL MOVEMENT</Text><Text style={[styles.totalValue, { color: colors.foreground }]}>KES {total.toLocaleString()}</Text></View>
        <View style={[styles.totalIcon, { backgroundColor: colors.successSoft }]}><Feather name="bar-chart-2" size={20} color={colors.primary} /></View>
      </View>
      <SectionHeading title="Contribution history" />
      <View style={[styles.filters, { backgroundColor: colors.muted }]}>
        {(['All', 'Complete', 'Pending'] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && { backgroundColor: colors.card }]}><Text style={[styles.filterText, { color: filter === item ? colors.foreground : colors.mutedForeground }]}>{item}</Text></Pressable>)}
      </View>
      <View style={styles.list}>{filtered.map((item) => <ActivityRow key={item.id} {...item} />)}</View>
      {filtered.length === 0 ? <View style={styles.empty}><Feather name="inbox" size={25} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing here yet</Text><Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>New contributions will appear in this view.</Text></View> : null}
      <View style={[styles.footnote, { backgroundColor: colors.successSoft }]}><Feather name="shield" size={16} color={colors.primary} /><Text style={[styles.footnoteText, { color: colors.primary }]}>Transparent by default. No hidden fees.</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  totalCard: { borderWidth: 1, borderRadius: 20, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.6 },
  totalValue: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.8, marginTop: 8 },
  totalIcon: { width: 47, height: 47, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  filters: { borderRadius: 13, padding: 4, flexDirection: 'row', marginBottom: 7 },
  filter: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  filterText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  list: { marginTop: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 44 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, marginTop: 10 },
  emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  footnote: { flexDirection: 'row', gap: 9, alignItems: 'center', padding: 13, borderRadius: 13, marginTop: 23 },
  footnoteText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});