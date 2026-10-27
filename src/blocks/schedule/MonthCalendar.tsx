/**
 * Interactive Hebrew RTL month grid for Schedule (PRD v1.1 §2.4).
 * Coaches can add/edit; players/parents get Dual-Ack color hints on days.
 */
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from '@/i18n';
import { dualAckConflict } from '@/lib/demo-data';
import { isAttendanceCoach } from '@/lib/roles';
import type { DualAck, SessionEvent } from '@/types';
import {
  layout,
  rtlContainerProps,
  rtlInput,
  rtlLayout,
  rtlText,
  rtlTextAlign,
  useTheme,
} from '@/theme/ThemeContext';

const WEEKDAYS_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Sunday-first index for Hebrew calendar headers. */
function sundayIndex(d: Date): number {
  return d.getDay();
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type RsvpDayHint = 'attending' | 'not_attending' | 'conflict' | 'none';

function hintForDay(
  day: Date,
  events: SessionEvent[],
  acks: DualAck[],
  userId: string | undefined,
  role: string | undefined,
): RsvpDayHint {
  const dayEvents = events.filter((e) => sameDay(new Date(e.startsAt), day));
  if (!dayEvents.length || !userId) return 'none';

  let attending = false;
  let notAttending = false;
  let conflict = false;

  for (const event of dayEvents) {
    const related = acks.filter((a) => a.eventId === event.id);
    for (const ack of related) {
      if (dualAckConflict(ack)) conflict = true;
      const mine =
        role === 'parent'
          ? ack
          : ack.playerId === userId
            ? ack
            : null;
      if (!mine) continue;
      const choice = role === 'parent' ? mine.parentChoice : mine.playerChoice;
      if (choice === 'attending') attending = true;
      if (choice === 'not_attending') notAttending = true;
    }
  }

  if (conflict) return 'conflict';
  if (attending && !notAttending) return 'attending';
  if (notAttending && !attending) return 'not_attending';
  return 'none';
}

type Props = {
  events: SessionEvent[];
  acks: DualAck[];
  userId?: string;
  role?: string;
  canEdit: boolean;
  onCreateEvent: (input: {
    title: string;
    startsAt: string;
    location: string;
    type: 'practice' | 'game';
    hallAddress?: string;
    contactPhone?: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  onUpdateEvent: (input: {
    id: string;
    title: string;
    startsAt: string;
    location: string;
    type: 'practice' | 'game';
    hallAddress?: string;
    contactPhone?: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  onSelectEvent?: (event: SessionEvent) => void;
};

export function MonthCalendar({
  events,
  acks,
  userId,
  role,
  canEdit,
  onCreateEvent,
  onUpdateEvent,
  onSelectEvent,
}: Props) {
  const { colors } = useTheme();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [editor, setEditor] = useState<null | {
    mode: 'create' | 'edit';
    eventId?: string;
    title: string;
    location: string;
    hallAddress: string;
    contactPhone: string;
    type: 'practice' | 'game';
    date: string;
    time: string;
  }>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const monthLabel = useMemo(
    () => cursor.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }),
    [cursor],
  );

  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const total = daysInMonth(cursor);
    const pad = sundayIndex(first);
    const out: (Date | null)[] = [];
    for (let i = 0; i < pad; i++) out.push(null);
    for (let d = 1; d <= total; d++) {
      out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const selectedEvents = useMemo(() => {
    if (!selectedDay) return [];
    return events
      .filter((e) => sameDay(new Date(e.startsAt), selectedDay))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [events, selectedDay]);

  const openCreate = (day: Date) => {
    if (!canEdit) return;
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const d = String(day.getDate()).padStart(2, '0');
    setEditor({
      mode: 'create',
      title: '',
      location: '',
      hallAddress: '',
      contactPhone: '',
      type: 'practice',
      date: `${y}-${m}-${d}`,
      time: '17:00',
    });
    setNote(null);
  };

  const openEdit = (event: SessionEvent) => {
    if (!canEdit) {
      onSelectEvent?.(event);
      return;
    }
    const dt = new Date(event.startsAt);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    setEditor({
      mode: 'edit',
      eventId: event.id,
      title: event.title,
      location: event.location,
      hallAddress: event.hallAddress ?? '',
      contactPhone: event.contactPhone ?? '',
      type: event.type,
      date: `${y}-${m}-${d}`,
      time: `${hh}:${mm}`,
    });
    setNote(null);
  };

  const saveEditor = async () => {
    if (!editor) return;
    const title = editor.title.trim();
    if (!title) {
      setNote(t('calendar.titleRequired'));
      return;
    }
    const startsAt = new Date(`${editor.date}T${editor.time}:00`).toISOString();
    const hallAddress = editor.type === 'game' ? editor.hallAddress.trim() : '';
    const contactPhone = editor.type === 'game' ? editor.contactPhone.trim() : '';
    setBusy(true);
    setNote(null);
    try {
      const result =
        editor.mode === 'create'
          ? await onCreateEvent({
              title,
              startsAt,
              location: editor.location.trim(),
              type: editor.type,
              hallAddress,
              contactPhone,
            })
          : await onUpdateEvent({
              id: editor.eventId!,
              title,
              startsAt,
              location: editor.location.trim(),
              type: editor.type,
              hallAddress,
              contactPhone,
            });
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      setEditor(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View {...rtlContainerProps} style={[styles.wrap, rtlLayout.box]}>
      <View style={[rtlLayout.splitRow, styles.nav]}>
        <Pressable
          onPress={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
          }
          style={[styles.navBtn, { borderColor: colors.primary }]}
        >
          <Text style={[{ color: colors.primary, fontWeight: '700' }, rtlText]}>
            {t('calendar.prevMonth')}
          </Text>
        </Pressable>
        <Text style={[styles.monthTitle, { color: colors.primary }]}>{monthLabel}</Text>
        <Pressable
          onPress={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
          }
          style={[styles.navBtn, { borderColor: colors.primary }]}
        >
          <Text style={[{ color: colors.primary, fontWeight: '700' }, rtlText]}>
            {t('calendar.nextMonth')}
          </Text>
        </Pressable>
      </View>

      <View style={[rtlLayout.wrapRow, styles.weekHeader]}>
        {WEEKDAYS_HE.map((label) => (
          <Text key={label} style={[styles.weekday, { color: colors.muted }]}>
            {label}
          </Text>
        ))}
      </View>

      <View style={rtlLayout.wrapRow}>
        {cells.map((day, idx) => {
          if (!day) {
            return <View key={`e-${idx}`} style={styles.cell} />;
          }
          const dayEvents = events.filter((e) => sameDay(new Date(e.startsAt), day));
          const hint = hintForDay(day, events, acks, userId, role);
          const selected = selectedDay ? sameDay(selectedDay, day) : false;
          const hintColor =
            hint === 'attending'
              ? colors.success
              : hint === 'not_attending'
                ? colors.danger
                : hint === 'conflict'
                  ? '#D97706'
                  : 'transparent';
          return (
            <Pressable
              key={dayKey(day)}
              onPress={() => setSelectedDay(day)}
              onLongPress={() => openCreate(day)}
              style={[
                styles.cell,
                rtlLayout.box,
                styles.dayCell,
                {
                  borderColor: selected ? colors.secondary : colors.primary,
                  backgroundColor: selected ? '#FFF5F5' : '#fff',
                },
              ]}
            >
              <Text style={[{ fontWeight: '700', color: colors.text }, rtlText]}>
                {day.getDate()}
              </Text>
              {dayEvents.length ? (
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: hintColor !== 'transparent' ? hintColor : colors.primary,
                    },
                  ]}
                />
              ) : null}
              {dayEvents.length > 1 ? (
                <Text style={[{ fontSize: 10, color: colors.muted }, rtlText]}>
                  {dayEvents.length}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={[{ marginTop: 10, color: colors.muted, fontSize: 12 }, rtlText]}>
        {canEdit ? t('calendar.coachHint') : t('calendar.readOnlyHint')}
      </Text>

      {selectedDay ? (
        <View
          {...rtlContainerProps}
          style={[styles.dayPanel, rtlLayout.box, { borderColor: colors.primary }]}
        >
          <Text style={[styles.dayPanelTitle, { color: colors.primary }]}>
            {selectedDay.toLocaleDateString('he-IL', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
          {selectedEvents.length === 0 ? (
            <Text style={[{ color: colors.muted }, rtlText]}>{t('calendar.noEventsDay')}</Text>
          ) : (
            selectedEvents.map((event) => (
              <Pressable
                key={event.id}
                onPress={() => openEdit(event)}
                style={[styles.eventRow, { borderColor: colors.secondary }]}
              >
                <Text style={[{ fontWeight: '800' }, rtlText]}>{event.title}</Text>
                <Text style={[{ color: colors.muted }, rtlText]}>
                  {new Date(event.startsAt).toLocaleTimeString('he-IL', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {event.location || '—'} ·{' '}
                  {event.type === 'game' ? t('calendar.typeGame') : t('calendar.typePractice')}
                </Text>
              </Pressable>
            ))
          )}
          {canEdit ? (
            <Pressable
              onPress={() => openCreate(selectedDay)}
              style={[layout.button, { backgroundColor: colors.primary, marginTop: 10 }]}
            >
              <Text style={[layout.buttonText, { color: '#fff' }]}>
                {t('calendar.addEvent')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Modal visible={Boolean(editor)} animationType="slide" transparent>
        <Pressable style={styles.sheetBackdrop} onPress={() => !busy && setEditor(null)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.sheet, rtlLayout.box, { backgroundColor: colors.surface }]}
          >
            <Text style={[layout.title, { fontSize: 20, color: colors.primary }]}>
              {editor?.mode === 'edit' ? t('calendar.editEvent') : t('calendar.addEvent')}
            </Text>
            <Text style={layout.label}>{t('calendar.eventTitle')}</Text>
            <TextInput
              textAlign={rtlTextAlign}
              value={editor?.title ?? ''}
              onChangeText={(title) => setEditor((e) => (e ? { ...e, title } : e))}
              style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
            />
            <Text style={layout.label}>{t('calendar.location')}</Text>
            <TextInput
              textAlign={rtlTextAlign}
              value={editor?.location ?? ''}
              onChangeText={(location) => setEditor((e) => (e ? { ...e, location } : e))}
              style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
            />
            <Text style={layout.label}>{t('calendar.date')}</Text>
            <TextInput
              textAlign={rtlTextAlign}
              value={editor?.date ?? ''}
              onChangeText={(date) => setEditor((e) => (e ? { ...e, date } : e))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.muted}
              style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
            />
            <Text style={layout.label}>{t('calendar.time')}</Text>
            <TextInput
              textAlign={rtlTextAlign}
              value={editor?.time ?? ''}
              onChangeText={(time) => setEditor((e) => (e ? { ...e, time } : e))}
              placeholder="HH:MM"
              placeholderTextColor={colors.muted}
              style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
            />
            <View style={[rtlLayout.row, { marginTop: 12 }]}>
              {(['practice', 'game'] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setEditor((e) => (e ? { ...e, type } : e))}
                  style={[
                    styles.chip,
                    {
                      borderColor: colors.primary,
                      backgroundColor: editor?.type === type ? colors.secondary : '#fff',
                    },
                  ]}
                >
                  <Text
                    style={[
                      {
                        color: editor?.type === type ? '#fff' : colors.primary,
                        fontWeight: '700',
                      },
                      rtlText,
                    ]}
                  >
                    {type === 'game' ? t('calendar.typeGame') : t('calendar.typePractice')}
                  </Text>
                </Pressable>
              ))}
            </View>
            {editor?.type === 'game' ? (
              <>
                <Text style={layout.label}>{t('calendar.hallAddress')}</Text>
                <TextInput
                  textAlign={rtlTextAlign}
                  value={editor.hallAddress}
                  onChangeText={(hallAddress) =>
                    setEditor((e) => (e ? { ...e, hallAddress } : e))
                  }
                  placeholder={t('calendar.hallAddressPlaceholder')}
                  placeholderTextColor={colors.muted}
                  style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
                />
                <Text style={layout.label}>{t('calendar.contactPhone')}</Text>
                <TextInput
                  textAlign={rtlTextAlign}
                  value={editor.contactPhone}
                  onChangeText={(contactPhone) =>
                    setEditor((e) => (e ? { ...e, contactPhone } : e))
                  }
                  placeholder={t('calendar.contactPhonePlaceholder')}
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
                />
              </>
            ) : null}
            {note ? (
              <Text style={[{ color: colors.danger, marginTop: 8 }, rtlText]}>{note}</Text>
            ) : null}
            <Pressable
              disabled={busy}
              onPress={() => void saveEditor()}
              style={[
                layout.button,
                { backgroundColor: colors.primary, marginTop: 16, opacity: busy ? 0.7 : 1 },
              ]}
            >
              <Text style={[layout.buttonText, { color: '#fff' }]}>
                {busy ? t('calendar.saving') : t('calendar.save')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Re-export helper for ScheduleScreen coach gate checks. */
export function canEditCalendar(role: Parameters<typeof isAttendanceCoach>[0]): boolean {
  return isAttendanceCoach(role);
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  nav: { alignItems: 'center', marginBottom: 8 },
  navBtn: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
  },
  monthTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 18,
    writingDirection: 'rtl',
  },
  weekHeader: { marginBottom: 4 },
  weekday: {
    width: `${100 / 7}%`,
    /** Calendar chrome: day letters stay centered by design. */
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  cell: {
    width: `${100 / 7}%`,
    minHeight: 52,
    padding: 2,
  },
  dayCell: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
    /** Content hugs the reading-start edge (right in RTL). */
    alignItems: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  dayPanel: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  dayPanelTitle: {
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 8,
    ...rtlText,
  },
  eventRow: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#F8FAFC',
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
