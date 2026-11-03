/**
 * לו״ז שבועי קבוע: טבלה יום / שעות / מיקום.
 * מאמן (ראשי/עוזר/מנהל) CRUD; שחקן והורה — קריאה בלבד.
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { t, translateWeekDay } from '@/i18n';
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
import type { WeekDayIndex, WeeklyScheduleSlot } from '@/types';

const DAY_ORDER: WeekDayIndex[] = [0, 1, 2, 3, 4, 5, 6];

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function normalizeTime(raw: string): string | null {
  const trimmed = raw.trim();
  const m = TIME_RE.exec(trimmed);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function timeToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

type EditorState = {
  slotId: string | null;
  dayOfWeek: WeekDayIndex;
  startTime: string;
  endTime: string;
  location: string;
};

const emptyEditor = (): EditorState => ({
  slotId: null,
  dayOfWeek: 0,
  startTime: '17:00',
  endTime: '18:30',
  location: '',
});

export function WeeklyScheduleScreen() {
  const { colors } = useTheme();
  const {
    user,
    weeklySlots,
    upsertWeeklySlot,
    deleteWeeklySlot,
  } = useSession();
  const canEdit = isAttendanceCoach(user?.role);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () =>
      [...weeklySlots].sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return a.startTime.localeCompare(b.startTime);
      }),
    [weeklySlots],
  );

  const openCreate = () => setEditor(emptyEditor());
  const openEdit = (slot: WeeklyScheduleSlot) =>
    setEditor({
      slotId: slot.id,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      location: slot.location,
    });

  const onSave = async () => {
    if (!editor || busy) return;
    const start = normalizeTime(editor.startTime);
    const end = normalizeTime(editor.endTime);
    if (!start || !end) {
      Alert.alert(t('weeklySchedule.saveError'), t('weeklySchedule.invalidTime'));
      return;
    }
    if (timeToMinutes(end) <= timeToMinutes(start)) {
      Alert.alert(t('weeklySchedule.saveError'), t('weeklySchedule.invalidRange'));
      return;
    }
    if (!editor.location.trim()) {
      Alert.alert(t('weeklySchedule.saveError'), t('weeklySchedule.locationRequired'));
      return;
    }

    setBusy(true);
    try {
      const result = await Promise.resolve(
        upsertWeeklySlot({
          id: editor.slotId ?? undefined,
          dayOfWeek: editor.dayOfWeek,
          startTime: start,
          endTime: end,
          location: editor.location.trim(),
        }),
      );
      if (!result.ok) {
        Alert.alert(t('weeklySchedule.saveError'), result.error ?? t('weeklySchedule.saveError'));
        return;
      }
      setEditor(null);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (slot: WeeklyScheduleSlot) => {
    Alert.alert(t('weeklySchedule.deleteConfirmTitle'), t('weeklySchedule.deleteConfirmBody'), [
      { text: t('weeklySchedule.cancel'), style: 'cancel' },
      {
        text: t('weeklySchedule.deleteRow'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const result = await Promise.resolve(deleteWeeklySlot(slot.id));
            if (!result.ok) {
              Alert.alert(t('weeklySchedule.deleteError'), result.error ?? t('weeklySchedule.deleteError'));
            }
          })();
        },
      },
    ]);
  };

  const subtitle = canEdit
    ? t('weeklySchedule.subtitleCoach')
    : t('weeklySchedule.subtitleReadOnly');

  return (
    <ScrollView
      {...rtlContainerProps}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={layout.scrollContent}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      <Pressable
        onPress={() => router.back()}
        style={[styles.backBtn, rtlLayout.box]}
        accessibilityRole="button"
      >
        <Text style={[{ color: colors.primary, fontWeight: '700' }, rtlText]}>
          ← {t('weeklySchedule.back')}
        </Text>
      </Pressable>

      <Text style={[layout.title, { color: colors.primary }]}>{t('weeklySchedule.title')}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{t('weeklySchedule.subtitle')}</Text>
      <Text style={[{ color: colors.muted, marginTop: 6 }, rtlText]}>{subtitle}</Text>

      <View
        {...rtlContainerProps}
        style={[
          styles.table,
          rtlLayout.table,
          { borderColor: colors.primary + '33', backgroundColor: colors.surface },
        ]}
      >
        <View
          style={[
            styles.headerRow,
            rtlLayout.tableRow,
            { borderBottomColor: colors.primary + '22', alignItems: 'center' },
          ]}
        >
          <Text style={[rtlLayout.th, styles.colDay, { color: colors.secondary, fontSize: 13 }]}>
            {t('weeklySchedule.day')}
          </Text>
          <Text style={[rtlLayout.th, styles.colHours, { color: colors.secondary, fontSize: 13 }]}>
            {t('weeklySchedule.hours')}
          </Text>
          <Text style={[rtlLayout.th, styles.colLoc, { color: colors.secondary, fontSize: 13 }]}>
            {t('weeklySchedule.location')}
          </Text>
          {canEdit ? <Text style={[rtlLayout.th, styles.colActions]} /> : null}
        </View>

        {sorted.length === 0 ? (
          <Text style={[{ color: colors.muted, padding: 14 }, rtlText]}>{t('weeklySchedule.empty')}</Text>
        ) : (
          sorted.map((slot) => (
            <View
              key={slot.id}
              style={[styles.dataRow, rtlLayout.tableRow, { borderBottomColor: colors.primary + '14' }]}
            >
              <Text style={[rtlLayout.td, styles.colDay, { color: colors.text, fontSize: 14, lineHeight: 20 }]}>
                {translateWeekDay(slot.dayOfWeek)}
              </Text>
              <Text style={[rtlLayout.td, styles.colHours, { color: colors.text, fontSize: 14, lineHeight: 20 }]}>
                {slot.startTime}–{slot.endTime}
              </Text>
              <Text
                style={[rtlLayout.td, styles.colLoc, { color: colors.text, fontSize: 14, lineHeight: 20 }]}
                numberOfLines={2}
              >
                {slot.location}
              </Text>
              {canEdit ? (
                <View style={[styles.colActions, rtlLayout.row]}>
                  <Pressable onPress={() => openEdit(slot)} accessibilityRole="button">
                    <Text style={[{ color: colors.primary, fontWeight: '700', fontSize: 13 }, rtlText]}>
                      {t('weeklySchedule.editRow')}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => onDelete(slot)} accessibilityRole="button">
                    <Text style={[{ color: colors.danger, fontWeight: '700', fontSize: 13 }, rtlText]}>
                      {t('weeklySchedule.deleteRow')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        )}
      </View>

      {canEdit ? (
        <Pressable
          onPress={openCreate}
          style={[layout.button, { backgroundColor: colors.secondary, marginTop: 16 }]}
        >
          <Text style={[layout.buttonText, { color: colors.primary }]}>{t('weeklySchedule.addRow')}</Text>
        </Pressable>
      ) : null}

      <Modal
        visible={editor != null}
        animationType="slide"
        transparent
        onRequestClose={() => (busy ? undefined : setEditor(null))}
      >
        <View style={styles.modalBackdrop}>
          <View
            {...rtlContainerProps}
            style={[styles.modalCard, rtlLayout.box, { backgroundColor: colors.surface }]}
          >
            <Text style={[layout.title, { fontSize: 22, color: colors.primary }]}>
              {editor?.slotId ? t('weeklySchedule.editRow') : t('weeklySchedule.addRow')}
            </Text>

            <Text style={layout.label}>{t('weeklySchedule.pickDay')}</Text>
            <View style={[rtlLayout.row, { gap: 6 }]}>
              {DAY_ORDER.map((d) => {
                const selected = editor?.dayOfWeek === d;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setEditor((e) => (e ? { ...e, dayOfWeek: d } : e))}
                    style={[
                      styles.dayChip,
                      rtlLayout.chip,
                      {
                        backgroundColor: selected ? colors.primary : colors.accent,
                        borderColor: colors.secondary,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selected ? '#fff' : colors.secondary,
                        fontWeight: '700',
                        fontSize: 13,
                      }}
                    >
                      {translateWeekDay(d)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={layout.label}>{t('weeklySchedule.startTime')}</Text>
            <TextInput
              value={editor?.startTime ?? ''}
              onChangeText={(v) => setEditor((e) => (e ? { ...e, startTime: v } : e))}
              placeholder={t('weeklySchedule.timePlaceholder')}
              placeholderTextColor={colors.muted}
              textAlign={rtlTextAlign}
              autoCapitalize="none"
              style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
            />

            <Text style={layout.label}>{t('weeklySchedule.endTime')}</Text>
            <TextInput
              value={editor?.endTime ?? ''}
              onChangeText={(v) => setEditor((e) => (e ? { ...e, endTime: v } : e))}
              placeholder={t('weeklySchedule.timePlaceholder')}
              placeholderTextColor={colors.muted}
              textAlign={rtlTextAlign}
              autoCapitalize="none"
              style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
            />

            <Text style={layout.label}>{t('weeklySchedule.location')}</Text>
            <TextInput
              value={editor?.location ?? ''}
              onChangeText={(v) => setEditor((e) => (e ? { ...e, location: v } : e))}
              placeholder={t('weeklySchedule.locationPlaceholder')}
              placeholderTextColor={colors.muted}
              textAlign={rtlTextAlign}
              style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
            />

            {busy ? (
              <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
            ) : (
              <View style={[rtlLayout.splitRow, { marginTop: 20 }]}>
                <Pressable
                  onPress={() => setEditor(null)}
                  style={[layout.button, rtlLayout.half, { backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.secondary }]}
                >
                  <Text style={[layout.buttonText, { color: colors.secondary }]}>
                    {t('weeklySchedule.cancel')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void onSave()}
                  style={[layout.button, rtlLayout.half, { backgroundColor: colors.secondary }]}
                >
                  <Text style={[layout.buttonText, { color: colors.primary }]}>
                    {t('weeklySchedule.save')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    marginBottom: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  table: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 12,
  },
  headerRow: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dataRow: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  colDay: { width: '22%' },
  colHours: { width: '28%' },
  colLoc: { flex: 1, minWidth: '28%' },
  /** Actions sit on the far-left column in RTL; pack chips from the reading start. */
  colActions: { width: '22%', gap: 6, justifyContent: 'flex-start' },
  dayChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    maxHeight: '92%',
  },
});
