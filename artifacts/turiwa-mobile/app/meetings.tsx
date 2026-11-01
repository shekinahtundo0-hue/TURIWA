import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTuriwa } from '@/context/TuriwaContext';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import * as api from '@/lib/api';
import { BrandHeader, EmptyState, PrimaryButton, Screen, SectionHeading, SkeletonRows } from '@/components/TuriwaUI';
import { AppChrome, useSubScreenBack } from '@/components/AppNav';

export default function MeetingsScreen() {
  const { circles } = useTuriwa();
  const colors = useColors();
  const layout = useResponsive();
  const router = useRouter();
  const onBack = useSubScreenBack();
  const [rows, setRows] = useState<api.MeetingRecord[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRows((await Promise.all(circles.map((circle) => api.getMeetings(circle.id)))).flat());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load meetings.');
      setRows([]);
    }
  }, [circles]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmAttendance = async (meeting: api.MeetingRecord) => {
    try {
      await api.setMeetingAttendance(meeting.id, 'attending');
      Alert.alert('Attendance saved', 'You are marked as attending.');
    } catch (err) {
      Alert.alert('Could not save attendance', err instanceof Error ? err.message : 'Try again.');
    }
  };

  return (
    <AppChrome>
      <Screen>
        <BrandHeader onBack={onBack} title="Circle meetings" subtitle="Agendas, schedule and attendance." />
        {rows === null ? (
          <SkeletonRows rows={3} />
        ) : circles.length === 0 ? (
          <EmptyState
            icon="users"
            title="No circles yet"
            body="Meetings belong to a circle. Create one and its schedule appears here."
            actionLabel="Create a group"
            onAction={() => router.push('/(onboarding)/create-group')}
          />
        ) : error ? (
          <EmptyState icon="alert-triangle" title="Meetings could not be loaded" body={`${error} Pull down on this screen to try again.`} />
        ) : rows.length === 0 ? (
          <EmptyState icon="calendar" title="No meetings scheduled" body="When a treasurer schedules a meeting it appears here with its agenda." />
        ) : (
          circles.map((circle) => {
            const upcoming = rows.filter((meeting) => meeting.circleId === circle.id);
            if (upcoming.length === 0) return null;
            return (
              <View key={circle.id} style={styles.section}>
                <SectionHeading title={circle.name} />
                <View style={styles.grid}>
                  {upcoming.map((meeting) => (
                    <View key={meeting.id} style={{ width: layout.cardWidth }}>
                      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[styles.title, { color: colors.foreground }]}>{meeting.title}</Text>
                        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                          {new Date(meeting.startsAt).toLocaleString()} · {meeting.location || 'Location to be shared'}
                        </Text>
                        {meeting.description ? (
                          <Text style={[styles.body, { color: colors.mutedForeground }]}>{meeting.description}</Text>
                        ) : null}
                        {meeting.minutes ? (
                          <Text style={[styles.minutes, { color: colors.foreground }]}>Minutes: {meeting.minutes}</Text>
                        ) : null}
                        <View style={styles.attend}>
                          <PrimaryButton label="Confirm attendance" compact onPress={() => void confirmAttendance(meeting)} />
                        </View>
                      </View>
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

const styles = StyleSheet.create({
  section: { marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 10 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16, letterSpacing: -0.3 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 4 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 10 },
  minutes: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, marginTop: 10 },
  attend: { marginTop: 14 },
});
