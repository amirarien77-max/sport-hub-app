/**
 * תפריט נוכחות אצל המאמן — רישום/אישור סטטוס לשחקן באימון + ייצוא PDF.
 * סטטוסים: הגיע (ירוק) / לא הגיע מוצדק (צהוב) / לא הגיע לא מוצדק (אדום).
 * נעילה שומרת ומשגרת דיווח להורים על no_show.
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RtlSelect } from '@/blocks/ui/RtlSelect';
import { t, translateAttendanceMark } from '@/i18n';
import {
  exportAttendancePdfForRange,
  exportAttendancePdfForSession,
} from '@/lib/attendance-pdf';
import { isAttendanceCoach } from '@/lib/roles';
import { useSession } from '@/session/SessionContext';
import {
  layout,
  rtlContainerProps,
  rtlInput,
  rtlLayout,
  rtlText,
  rtlTextAlign,
  useTheme,
} from '@/theme/ThemeContext';
import type { AttendanceMark } from '@/types';

/** Exact product colors for attendance visuals. */
const MARK_COLORS: Record<Exclude<AttendanceMark, null>, string> = {
  present: '#22c55e',
  excused: '#eab308',
  no_show: '#ef4444',
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function AttendanceScreen() {
  const { colors } = useTheme();
  const { attendance, events, cycleAttendance, lockAttendance, user } = useSession();
  const practiceEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
      ),
    [events],
  );
  const defaultEventId = practiceEvents[0]?.id ?? null;
  const [eventId, setEventId] = useState<string | null>(defaultEventId);
  const selectedEventId = eventId && practiceEvents.some((e) => e.id === eventId)
    ? eventId
    : defaultEventId;

  const rows = attendance.filter((r) => r.eventId === selectedEventId);
  const [lockedNote, setLockedNote] = useState<string | null>(null);
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return toYmd(d);
  });
  const [rangeTo, setRangeTo] = useState(() => toYmd(new Date()));

  const isCoach = isAttendanceCoach(user?.role);

  const eventOptions = practiceEvents.map((e) => ({
    value: e.id,
    label: `${e.title} · ${new Date(e.startsAt).toLocaleDateString('he-IL')}`,
  }));

  const handlePdfSession = () => {
    if (!selectedEventId) return;
    const result = exportAttendancePdfForSession(attendance, events, selectedEventId);
    if (!result.ok) {
      Alert.alert(t('attendance.pdfDoneTitle'), t('attendance.pdfEmpty'));
      return;
    }
    if (!result.printed && Platform.OS !== 'web') {
      Alert.alert(
        t('attendance.pdfDoneTitle'),
        `${t('attendance.pdfDoneBody')}\n(${result.rowCount} שורות)`,
      );
      return;
    }
    Alert.alert(t('attendance.pdfDoneTitle'), t('attendance.pdfDoneBody'));
  };

  const handlePdfRange = () => {
    const result = exportAttendancePdfForRange(attendance, events, rangeFrom, rangeTo);
    if (!result.ok) {
      Alert.alert(
        t('attendance.pdfDoneTitle'),
        result.error === 'invalid_range'
          ? t('attendance.pdfInvalidRange')
          : t('attendance.pdfEmpty'),
      );
      return;
    }
    if (!result.printed && Platform.OS !== 'web') {
      Alert.alert(
        t('attendance.pdfDoneTitle'),
        `${t('attendance.pdfDoneBody')}\n(${result.rowCount} שורות)`,
      );
      return;
    }
    Alert.alert(t('attendance.pdfDoneTitle'), t('attendance.pdfDoneBody'));
  };

  if (!isCoach) {
    return (
      <View
        {...rtlContainerProps}
        style={[layout.screen, { backgroundColor: colors.background }]}
      >
        <Text style={[layout.title, { color: colors.primary }]}>{t('attendance.title')}</Text>
        <Text style={[layout.subtitle, { color: colors.muted }]}>{t('attendance.playersOnly')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      {...rtlContainerProps}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={layout.scrollContent}
    >
      <Text style={[layout.title, { color: colors.primary }]}>{t('attendance.menuTitle')}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{t('attendance.subtitle')}</Text>

      <View
        {...rtlContainerProps}
        style={[styles.section, rtlLayout.box, { borderColor: colors.primary }]}
      >
        <Text style={[styles.sectionTitle, { color: colors.primary }, rtlText]}>
          {t('attendance.sectionRegister')}
        </Text>
        <Text style={[layout.label, { color: colors.text }]}>{t('attendance.pickEvent')}</Text>
        {eventOptions.length > 0 ? (
          <RtlSelect
            options={eventOptions}
            value={selectedEventId}
            onChange={setEventId}
            menuTitle={t('attendance.pickEvent')}
            testID="attendance-event-select"
            style={{ marginTop: 8 }}
          />
        ) : (
          <Text style={[{ marginTop: 8, color: colors.muted }, rtlText]}>
            {t('attendance.noEvent')}
          </Text>
        )}

        <View style={[rtlLayout.row, styles.legend]}>
          {(
            [
              ['present', MARK_COLORS.present, t('attendance.legendPresent')],
              ['excused', MARK_COLORS.excused, t('attendance.legendExcused')],
              ['no_show', MARK_COLORS.no_show, t('attendance.legendNoShow')],
            ] as const
          ).map(([key, color, label]) => (
            <View key={key} style={[styles.legendItem, rtlLayout.chip]}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={[{ fontSize: 12, fontWeight: '700', color: colors.text }, rtlText]}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[layout.title, { color: colors.primary, fontSize: 20, marginTop: 12 }]}>
          {t('attendance.courtGrid')}
        </Text>

        {selectedEventId && rows.length === 0 ? (
          <Text style={[{ marginTop: 12, color: colors.muted }, rtlText]}>
            {t('attendance.emptyPlayers')}
          </Text>
        ) : null}

        <View style={[rtlLayout.wrapRow, styles.grid]}>
          {rows.map((row) => {
            const bg = row.mark ? MARK_COLORS[row.mark] : '#E2E8F0';
            const fg = row.mark ? '#fff' : colors.text;
            return (
              <Pressable
                key={row.playerId}
                accessibilityRole="button"
                accessibilityLabel={`${row.playerName}: ${translateAttendanceMark(row.mark)}`}
                onPress={() => selectedEventId && void cycleAttendance(row.playerId, selectedEventId)}
                style={[styles.cell, rtlLayout.box, { backgroundColor: bg }]}
              >
                <Text style={[styles.cellName, { color: fg }]}>{row.playerName}</Text>
                <Text style={[styles.cellMark, { color: fg }]}>
                  {translateAttendanceMark(row.mark)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => {
            if (!selectedEventId) return;
            void (async () => {
              const noShows = await Promise.resolve(lockAttendance(selectedEventId));
              const message =
                noShows.length === 0
                  ? t('attendance.lockedNoShows')
                  : t('attendance.lockedWithNames', { names: noShows.join(', ') });
              setLockedNote(message);
              Alert.alert(t('attendance.lockedTitle'), message);
            })();
          }}
          style={[layout.button, { backgroundColor: colors.primary, marginTop: 16 }]}
        >
          <Text style={[layout.buttonText, { color: '#fff' }]}>{t('attendance.lockNotify')}</Text>
        </Pressable>

        {lockedNote ? (
          <Text style={[{ marginTop: 12, color: colors.muted }, rtlText]}>{lockedNote}</Text>
        ) : null}
      </View>

      <View
        {...rtlContainerProps}
        style={[styles.section, rtlLayout.box, { borderColor: colors.secondary, marginTop: 16 }]}
      >
        <Text style={[styles.sectionTitle, { color: colors.primary }, rtlText]}>
          {t('attendance.sectionExport')}
        </Text>

        <Pressable
          disabled={!selectedEventId}
          onPress={handlePdfSession}
          style={[
            layout.button,
            {
              backgroundColor: selectedEventId ? colors.secondary : colors.muted,
              marginTop: 10,
            },
          ]}
        >
          <Text style={[layout.buttonText, { color: '#fff' }]}>{t('attendance.pdfSession')}</Text>
        </Pressable>

        <Text style={[layout.label, { color: colors.text }]}>{t('attendance.pdfRangeFrom')}</Text>
        <TextInput
          value={rangeFrom}
          onChangeText={setRangeFrom}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          textAlign={rtlTextAlign}
          style={[
            styles.input,
            rtlInput,
            { borderColor: colors.primary, color: colors.text },
          ]}
        />
        <Text style={[layout.label, { color: colors.text }]}>{t('attendance.pdfRangeTo')}</Text>
        <TextInput
          value={rangeTo}
          onChangeText={setRangeTo}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          textAlign={rtlTextAlign}
          style={[
            styles.input,
            rtlInput,
            { borderColor: colors.primary, color: colors.text },
          ]}
        />
        <Pressable
          onPress={handlePdfRange}
          style={[layout.button, { backgroundColor: colors.primary, marginTop: 12 }]}
        >
          <Text style={[layout.buttonText, { color: '#fff' }]}>{t('attendance.pdfExport')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 16,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  legend: {
    marginTop: 12,
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  grid: {
    marginTop: 12,
    gap: 12,
  },
  cell: {
    width: '47%',
    minHeight: 96,
    borderRadius: 14,
    padding: 12,
    justifyContent: 'space-between',
  },
  cellName: { fontWeight: '800', fontSize: 16, ...rtlText },
  cellMark: {
    fontSize: 12,
    fontWeight: '700',
    ...rtlText,
  },
  input: {
    marginTop: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    fontSize: 16,
    backgroundColor: '#fff',
  },
});
