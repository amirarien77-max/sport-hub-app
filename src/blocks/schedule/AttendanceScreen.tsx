import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '@/session/SessionContext';
import { layout, useTheme } from '@/theme/ThemeContext';
import type { AttendanceMark } from '@/types';

const MARK_COLORS: Record<Exclude<AttendanceMark, null>, string> = {
  present: '#16A34A',
  excused: '#F59E0B',
  no_show: '#DC2626',
};

export function AttendanceScreen() {
  const { colors } = useTheme();
  const { attendance, events, cycleAttendance, lockAttendance, user } = useSession();
  const eventId = events[0]?.id;
  const rows = attendance.filter((r) => r.eventId === eventId);
  const [lockedNote, setLockedNote] = useState<string | null>(null);

  const isCoach =
    user?.role === 'head_coach' ||
    user?.role === 'assistant_coach' ||
    user?.role === 'admin';

  if (!isCoach) {
    return (
      <View style={[layout.screen, { backgroundColor: colors.background }]}>
        <Text style={[layout.title, { color: colors.primary }]}>Attendance</Text>
        <Text style={[layout.subtitle, { color: colors.muted }]}>
          Only coaches mark court attendance. Switch to a coach persona from Profile.
        </Text>
      </View>
    );
  }

  return (
    <View style={[layout.screen, { backgroundColor: colors.background }]}>
      <Text style={[layout.title, { color: colors.primary }]}>Court grid</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>
        Tap cycles Present → Excused → No-show. Lock notifies parents of no-shows.
      </Text>

      <View style={styles.grid}>
        {rows.map((row) => {
          const bg = row.mark ? MARK_COLORS[row.mark] : '#E2E8F0';
          return (
            <Pressable
              key={row.playerId}
              onPress={() => eventId && cycleAttendance(row.playerId, eventId)}
              style={[styles.cell, { backgroundColor: bg }]}
            >
              <Text style={styles.cellName}>{row.playerName}</Text>
              <Text style={styles.cellMark}>{row.mark ?? 'unmarked'}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => {
          if (!eventId) return;
          const noShows = lockAttendance(eventId);
          const message =
            noShows.length === 0
              ? 'Attendance locked. No no-shows.'
              : `Locked. Notified parents of: ${noShows.join(', ')}`;
          setLockedNote(message);
          Alert.alert('Attendance locked', message);
        }}
        style={[layout.button, { backgroundColor: colors.primary, marginTop: 20 }]}
      >
        <Text style={[layout.buttonText, { color: '#fff' }]}>Lock & notify</Text>
      </Pressable>

      {lockedNote ? (
        <Text style={{ marginTop: 12, color: colors.muted }}>{lockedNote}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cell: {
    width: '47%',
    minHeight: 96,
    borderRadius: 14,
    padding: 12,
    justifyContent: 'space-between',
  },
  cellName: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cellMark: { color: '#fff', textTransform: 'uppercase', fontSize: 12, fontWeight: '700' },
});
