import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { t, translateAttendanceMark } from '@/i18n';
import { isAttendanceCoach } from '@/lib/roles';
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

  const isCoach = isAttendanceCoach(user?.role);

  if (!isCoach) {
    return (
      <View style={[layout.screen, { backgroundColor: colors.background }]}>
        <Text style={[layout.title, { color: colors.primary }]}>{t('attendance.title')}</Text>
        <Text style={[layout.subtitle, { color: colors.muted }]}>{t('attendance.playersOnly')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={layout.scrollContent}
    >
      <Text style={[layout.title, { color: colors.primary }]}>{t('attendance.courtGrid')}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{t('attendance.subtitle')}</Text>

      {!eventId ? (
        <Text style={{ marginTop: 16, color: colors.muted, textAlign: 'right' }}>
          {t('attendance.noEvent')}
        </Text>
      ) : null}

      {eventId && rows.length === 0 ? (
        <Text style={{ marginTop: 16, color: colors.muted, textAlign: 'right' }}>
          {t('attendance.emptyPlayers')}
        </Text>
      ) : null}

      <View style={styles.grid}>
        {rows.map((row) => {
          const bg = row.mark ? MARK_COLORS[row.mark] : '#E2E8F0';
          return (
            <Pressable
              key={row.playerId}
              onPress={() => eventId && void cycleAttendance(row.playerId, eventId)}
              style={[styles.cell, { backgroundColor: bg }]}
            >
              <Text style={styles.cellName}>{row.playerName}</Text>
              <Text style={styles.cellMark}>{translateAttendanceMark(row.mark)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => {
          if (!eventId) return;
          void (async () => {
            const noShows = await Promise.resolve(lockAttendance(eventId));
            const message =
              noShows.length === 0
                ? t('attendance.lockedNoShows')
                : t('attendance.lockedWithNames', { names: noShows.join(', ') });
            setLockedNote(message);
            Alert.alert(t('attendance.lockedTitle'), message);
          })();
        }}
        style={[layout.button, { backgroundColor: colors.primary, marginTop: 20 }]}
      >
        <Text style={[layout.buttonText, { color: '#fff' }]}>{t('attendance.lockNotify')}</Text>
      </Pressable>

      {lockedNote ? (
        <Text style={{ marginTop: 12, color: colors.muted, textAlign: 'right' }}>{lockedNote}</Text>
      ) : null}
    </ScrollView>
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
  cellName: { color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'right' },
  cellMark: {
    color: '#fff',
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
});
