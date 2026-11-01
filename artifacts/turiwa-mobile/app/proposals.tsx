import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTuriwa } from '@/context/TuriwaContext';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import * as api from '@/lib/api';
import { BrandHeader, EmptyState, Screen, SectionHeading, SkeletonRows } from '@/components/TuriwaUI';
import { AppChrome, useSubScreenBack } from '@/components/AppNav';

export default function ProposalsScreen() {
  const { circles } = useTuriwa();
  const colors = useColors();
  const layout = useResponsive();
  const router = useRouter();
  const onBack = useSubScreenBack();
  const [rows, setRows] = useState<api.ProposalRecord[] | null>(null);
  const [error, setError] = useState('');
  const [voting, setVoting] = useState('');

  const load = useCallback(async () => {
    try {
      setRows((await Promise.all(circles.map((circle) => api.getProposals(circle.id)))).flat());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load proposals.');
      setRows([]);
    }
  }, [circles]);

  useEffect(() => {
    void load();
  }, [load]);

  const vote = async (proposal: api.ProposalRecord, optionId: string) => {
    setVoting(`${proposal.id}:${optionId}`);
    try {
      await api.castProposalVote(proposal.id, optionId);
      await load();
      Alert.alert('Vote recorded', 'Your vote was saved.');
    } catch (err) {
      Alert.alert('Vote not recorded', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setVoting('');
    }
  };

  return (
    <AppChrome>
      <Screen>
        <BrandHeader onBack={onBack} title="Proposals and votes" subtitle="Circle decisions, with eligibility and duplicate voting enforced by the API." />
        {rows === null ? (
          <SkeletonRows rows={3} />
        ) : circles.length === 0 ? (
          <EmptyState
            icon="users"
            title="No circles yet"
            body="Votes belong to a circle. Create one and its proposals appear here."
            actionLabel="Create a group"
            onAction={() => router.push('/(onboarding)/create-group')}
          />
        ) : error ? (
          <EmptyState icon="alert-triangle" title="Proposals could not be loaded" body={`${error} Pull down on this screen to try again.`} />
        ) : rows.length === 0 ? (
          <EmptyState icon="check-square" title="No proposals open" body="When the circle puts a decision to a vote it appears here with its options and deadline." />
        ) : (
          circles.map((circle) => {
            const open = rows.filter((proposal) => proposal.circleId === circle.id);
            if (open.length === 0) return null;
            return (
              <View key={circle.id} style={styles.section}>
                <SectionHeading title={circle.name} />
                <View style={styles.grid}>
                  {open.map((proposal) => {
                    const closed = new Date(proposal.deadline).getTime() < Date.now();
                    const tally = proposal.results ?? [];
                    const total = tally.reduce((sum, option) => sum + option.votes, 0);
                    return (
                      <View key={proposal.id} style={{ width: layout.cardWidth }}>
                        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <Text style={[styles.title, { color: colors.foreground }]}>{proposal.title}</Text>
                          {proposal.description ? (
                            <Text style={[styles.body, { color: colors.mutedForeground }]}>{proposal.description}</Text>
                          ) : null}
                          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                            Closes {new Date(proposal.deadline).toLocaleString()} · {proposal.status}
                          </Text>
                          {proposal.options.map((option) => {
                            const votes = tally.find((entry) => entry.optionId === option.id)?.votes ?? 0;
                            const share = total > 0 ? Math.round((100 * votes) / total) : 0;
                            const blocked = proposal.hasVoted || closed || voting !== '';
                            return (
                              <Pressable
                                key={option.id}
                                testID={`proposal-option-${proposal.id}-${option.id}`}
                                disabled={blocked}
                                onPress={() => void vote(proposal, option.id)}
                                accessibilityRole="button"
                                accessibilityLabel={`Vote ${option.label} on ${proposal.title}`}
                                accessibilityState={{ disabled: blocked }}
                                style={({ pressed }) => [
                                  styles.option,
                                  {
                                    borderColor: colors.border,
                                    backgroundColor: pressed ? colors.successSoft : colors.background,
                                    opacity: blocked ? 0.55 : 1,
                                  },
                                ]}
                              >
                                <Text style={[styles.optionLabel, { color: colors.foreground }]}>{option.label}</Text>
                                {proposal.results ? (
                                  <Text style={[styles.optionVotes, { color: colors.primary }]}>
                                    {votes} {votes === 1 ? 'vote' : 'votes'} · {share}%
                                  </Text>
                                ) : null}
                              </Pressable>
                            );
                          })}
                          <Text style={[styles.meta, { color: proposal.hasVoted ? colors.primary : colors.mutedForeground }]}>
                            {proposal.hasVoted ? 'Your vote is recorded.' : closed ? 'Voting has closed.' : 'Tap an option to record your vote.'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
      </Screen>
    </AppChrome>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 10 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16, letterSpacing: -0.3 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 6 },
  meta: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 },
  option: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5, flex: 1 },
  optionVotes: { fontFamily: 'Inter_700Bold', fontSize: 12.5 },
});
