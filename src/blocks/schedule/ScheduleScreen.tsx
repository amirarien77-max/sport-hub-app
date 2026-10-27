/**
 * מסך לו״ז (מודול 2): אירועים, Dual-Ack (שחקן/הורה), carpool, באנר דחוף.
 * PRD v1.1: תצוגת חודש + רשימה; כתובת אולם + טלפון למשחקים. מאמן עורך; שחקן/הורה קריאה.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MonthCalendar, canEditCalendar } from '@/blocks/schedule/MonthCalendar';
import { router } from 'expo-router';
import { t, translateAbsenceReason, translateRsvp } from '@/i18n';
import { dualAckConflict } from '@/lib/demo-data';
import { canClaimCarpool, canOfferCarpool, canSubmitRsvp, isAttendanceCoach } from '@/lib/roles';
import { ensureParentPlayerLink } from '@/lib/schedule-live';
import { isDemoMode, supabase } from '@/lib/supabase';
import { useSession } from '@/session/SessionContext';
import type { SessionEvent } from '@/types';
import {
  layout,
  rtlContainerProps,
  rtlInput,
  rtlLayout,
  rtlText,
  rtlTextAlign,
  useTheme,
} from '@/theme/ThemeContext';

type EditorState = {
  mode: 'create' | 'edit';
  eventId?: string;
  title: string;
  location: string;
  hallAddress: string;
  contactPhone: string;
  type: 'practice' | 'game';
  date: string;
  time: string;
};

function toEditorState(event?: SessionEvent): EditorState {
  if (!event) {
    const now = new Date();
    now.setHours(now.getHours() + 24);
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return {
      mode: 'create',
      title: '',
      location: '',
      hallAddress: '',
      contactPhone: '',
      type: 'game',
      date: `${y}-${m}-${d}`,
      time: '18:00',
    };
  }
  const dt = new Date(event.startsAt);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return {
    mode: 'edit',
    eventId: event.id,
    title: event.title,
    location: event.location,
    hallAddress: event.hallAddress ?? '',
    contactPhone: event.contactPhone ?? '',
    type: event.type,
    date: `${y}-${m}-${d}`,
    time: `${hh}:${mm}`,
  };
}

export function ScheduleScreen() {
  const { colors } = useTheme();
  const {
    events,
    acks,
    setRsvp,
    absenceReasons,
    user,
    carpools,
    claimCarpoolSeat,
    createCarpoolOffer,
    banner,
    acknowledgeBanner,
    createSessionEvent,
    updateSessionEvent,
  } = useSession();
  const [sheetEventId, setSheetEventId] = useState<string | null>(null);
  const [claimingOfferId, setClaimingOfferId] = useState<string | null>(null);
  const [offerSeats, setOfferSeats] = useState(3);
  const [offerEventId, setOfferEventId] = useState<string | null>(null);
  const [offering, setOffering] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorNote, setEditorNote] = useState<string | null>(null);
  const [hintPlayerId, setHintPlayerId] = useState<string | undefined>();

  const coachView = isAttendanceCoach(user?.role);
  const calendarEdit = canEditCalendar(user?.role);
  const showRsvp = canSubmitRsvp(user?.role);
  const showClaim = canClaimCarpool(user?.role);
  const showOffer = canOfferCarpool(user?.role);

  // Keep selected offer event in sync with the schedule list (hint: «בחרו אירוע»).
  useEffect(() => {
    if (!events.length) {
      setOfferEventId(null);
      return;
    }
    setOfferEventId((prev) =>
      prev && events.some((e) => e.id === prev) ? prev : events[0].id,
    );
  }, [events]);

  // Parent calendar Dual-Ack dots: resolve linked child when possible.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || user.role !== 'parent') {
        if (!cancelled) setHintPlayerId(undefined);
        return;
      }
      if (isDemoMode || !supabase) {
        // Demo seed: Parent Cohen ↔ Roi
        if (!cancelled) setHintPlayerId('user-player-roi');
        return;
      }
      const linked = await ensureParentPlayerLink(supabase, user.id, user.teamId);
      if (!cancelled) setHintPlayerId(linked ?? undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const subtitle = coachView
    ? t('schedule.subtitleCoach')
    : user?.role === 'parent'
      ? t('schedule.subtitleParent')
      : t('schedule.subtitle');

  const onCreateOffer = async () => {
    if (!offerEventId || offering) return;
    setOffering(true);
    try {
      const result = await Promise.resolve(createCarpoolOffer(offerEventId, offerSeats));
      if (result.ok) {
        Alert.alert(
          t('schedule.offerSuccessTitle'),
          t('schedule.offerSuccessBody', { available: result.offer.seatsAvailable }),
        );
      } else {
        Alert.alert(t('schedule.offerErrorTitle'), t('schedule.offerErrorBody'));
      }
    } finally {
      setOffering(false);
    }
  };

  /** תפיסת מושב — RPC אטומי ב־live; מונע לחיצה כפולה עם claimingOfferId. */
  const onClaimSeat = async (offerId: string, isFull: boolean) => {
    if (isFull || claimingOfferId) return;
    setClaimingOfferId(offerId);
    try {
      const result = await Promise.resolve(claimCarpoolSeat(offerId));
      if (result.ok) {
        Alert.alert(
          t('schedule.claimSuccessTitle'),
          t('schedule.claimSuccessBody', {
            taken: result.seatsTaken,
            available: result.seatsAvailable,
          }),
        );
        return;
      }
      if (result.reason === 'full') {
        Alert.alert(t('schedule.claimFullTitle'), t('schedule.claimFullBody'));
        return;
      }
      Alert.alert(t('schedule.claimErrorTitle'), t('schedule.claimErrorBody'));
    } finally {
      setClaimingOfferId(null);
    }
  };

  const saveEditor = async () => {
    if (!editor) return;
    const title = editor.title.trim();
    if (!title) {
      setEditorNote(t('schedule.titleRequired'));
      return;
    }
    const startsAt = new Date(`${editor.date}T${editor.time}:00`).toISOString();
    if (Number.isNaN(Date.parse(startsAt))) {
      setEditorNote(t('schedule.saveError'));
      return;
    }
    setEditorBusy(true);
    setEditorNote(null);
    try {
      const payload = {
        title,
        startsAt,
        location: editor.location.trim(),
        type: editor.type,
        hallAddress: editor.type === 'game' ? editor.hallAddress.trim() : '',
        contactPhone: editor.type === 'game' ? editor.contactPhone.trim() : '',
      };
      const result =
        editor.mode === 'create'
          ? await createSessionEvent(payload)
          : await updateSessionEvent({ id: editor.eventId!, ...payload });
      if (!result.ok) {
        setEditorNote(result.error || t('schedule.saveError'));
        return;
      }
      setEditor(null);
      Alert.alert(t('schedule.saveSuccess'));
    } finally {
      setEditorBusy(false);
    }
  };

  const pendingBanner =
    banner.requiresAck && user && !banner.acknowledgedBy.includes(user.id);

  return (
    <ScrollView
      {...rtlContainerProps}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={layout.scrollContent}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      {pendingBanner ? (
        <View
          {...rtlContainerProps}
          style={[
            styles.banner,
            rtlLayout.box,
            {
              // Solid Hapoel primary (not accent #F5F5F5) — accent washed out on light bg.
              backgroundColor: colors.primary,
              borderColor: colors.secondary,
            },
          ]}
        >
          <Text style={styles.bannerTitle}>{t('schedule.urgent')}</Text>
          <Text style={styles.bannerBody}>{banner.message}</Text>
          <Pressable
            onPress={() => void acknowledgeBanner()}
            style={[
              layout.button,
              styles.bannerAckBtn,
              { backgroundColor: '#FFFFFF', borderColor: colors.secondary },
            ]}
          >
            <Text style={[layout.buttonText, { color: colors.secondary }]}>
              {t('schedule.acknowledge')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={[layout.title, { color: colors.primary }]}>{t('schedule.title')}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      {coachView ? (
        <Text style={[{ color: colors.muted, marginTop: 8 }, rtlText]}>
          {t('schedule.coachReadOnlyHint')}
        </Text>
      ) : null}

      <Pressable
        onPress={() => router.push('/weekly-schedule')}
        style={[
          styles.weeklyEntry,
          rtlLayout.box,
          { backgroundColor: colors.surface, borderColor: colors.primary },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('schedule.weeklyEntry')}
      >
        <Text style={[{ color: colors.primary, fontWeight: '800', fontSize: 17 }, rtlText]}>
          {t('schedule.weeklyEntry')}
        </Text>
        <Text style={[{ color: colors.muted, marginTop: 4, fontSize: 13 }, rtlText]}>
          {t('schedule.weeklyEntryHint')}
        </Text>
      </Pressable>

      <View style={[rtlLayout.row, { marginTop: 12 }]}>
        <Pressable
          onPress={() => setViewMode('calendar')}
          style={[
            styles.viewChip,
            {
              borderColor: colors.primary,
              backgroundColor: viewMode === 'calendar' ? colors.secondary : '#fff',
            },
          ]}
        >
          <Text
            style={[
              {
                color: viewMode === 'calendar' ? '#fff' : colors.primary,
                fontWeight: '700',
              },
              rtlText,
            ]}
          >
            {t('schedule.viewCalendar')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setViewMode('list')}
          style={[
            styles.viewChip,
            {
              borderColor: colors.primary,
              backgroundColor: viewMode === 'list' ? colors.secondary : '#fff',
            },
          ]}
        >
          <Text
            style={[
              {
                color: viewMode === 'list' ? '#fff' : colors.primary,
                fontWeight: '700',
              },
              rtlText,
            ]}
          >
            {t('schedule.viewList')}
          </Text>
        </Pressable>
      </View>

      {viewMode === 'calendar' ? (
        <MonthCalendar
          events={events}
          acks={acks}
          userId={user?.id}
          role={user?.role}
          hintPlayerId={hintPlayerId}
          canEdit={calendarEdit}
          onCreateEvent={createSessionEvent}
          onUpdateEvent={updateSessionEvent}
        />
      ) : null}

      {viewMode === 'list' && coachView ? (
        <Pressable
          onPress={() => {
            setEditor(toEditorState());
            setEditorNote(null);
          }}
          style={[layout.button, { backgroundColor: colors.primary, marginTop: 12 }]}
        >
          <Text style={[layout.buttonText, { color: '#fff' }]}>{t('schedule.addGame')}</Text>
        </Pressable>
      ) : null}

      {viewMode === 'list' ? (
        <Text style={[layout.title, { color: colors.primary, fontSize: 20, marginTop: 16 }]}>
          {t('schedule.listTitle')}
        </Text>
      ) : null}

      {viewMode === 'list' && events.length === 0 ? (
        <Text style={[{ color: colors.muted, marginTop: 12 }, rtlText]}>
          {t('schedule.emptyEvents')}
        </Text>
      ) : null}

      {viewMode === 'list'
        ? events.map((event) => {
        const related = acks.filter((a) => a.eventId === event.id);
        const isGame = event.type === 'game';
        return (
          <View
            key={event.id}
            {...rtlContainerProps}
            style={[styles.card, rtlLayout.box, { borderColor: colors.primary }]}
          >
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={[{ color: colors.muted }, rtlText]}>
              {new Date(event.startsAt).toLocaleString('he-IL')} · {event.location}
              {isGame ? ` · ${t('schedule.typeGame')}` : ` · ${t('schedule.typePractice')}`}
            </Text>

            {isGame && (event.hallAddress || event.contactPhone) ? (
              <View
                {...rtlContainerProps}
                style={[styles.venueBox, rtlLayout.box, { borderColor: colors.secondary }]}
              >
                {event.hallAddress ? (
                  <Text style={[{ color: colors.text }, rtlText]}>
                    {t('schedule.hallAddress')}: {event.hallAddress}
                  </Text>
                ) : null}
                {event.contactPhone ? (
                  <Text style={[{ color: colors.text, marginTop: event.hallAddress ? 4 : 0 }, rtlText]}>
                    {t('schedule.contactPhone')}: {event.contactPhone}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {coachView ? (
              <Pressable
                onPress={() => {
                  setEditor(toEditorState(event));
                  setEditorNote(null);
                }}
                style={[
                  layout.button,
                  {
                    backgroundColor: colors.secondary,
                    marginTop: 10,
                  },
                ]}
              >
                <Text style={[layout.buttonText, { color: '#fff' }]}>
                  {isGame ? t('schedule.editGame') : t('schedule.editEvent')}
                </Text>
              </Pressable>
            ) : null}

            {showRsvp ? (
              <View style={[rtlLayout.splitRow, { marginTop: 12 }]}>
                <Pressable
                  onPress={() =>
                    void setRsvp(event.id, 'attending', undefined, user?.role === 'parent')
                  }
                  style={[layout.button, rtlLayout.half, { backgroundColor: colors.success }]}
                >
                  <Text style={[layout.buttonText, { color: '#fff' }]}>
                    {t('schedule.attending')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSheetEventId(event.id)}
                  style={[layout.button, rtlLayout.half, { backgroundColor: colors.danger }]}
                >
                  <Text style={[layout.buttonText, { color: '#fff' }]}>
                    {t('schedule.notAttending')}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {related.map((ack) => {
              const conflict = dualAckConflict(ack);
              return (
                <View
                  key={`${ack.playerId}`}
                  style={[
                    styles.ackRow,
                    { backgroundColor: conflict ? '#FEF3C7' : '#F8FAFC' },
                  ]}
                >
                  <Text style={[{ fontWeight: '700' }, rtlText]}>
                    {ack.playerName ??
                      (ack.playerId === 'user-player-roi'
                        ? 'Roi'
                        : ack.playerId === 'user-player-dan'
                          ? 'Dan'
                          : ack.playerId.slice(0, 8))}
                    {conflict ? ` · ${t('schedule.conflict')}` : ''}
                  </Text>
                  <Text style={[{ color: colors.muted }, rtlText]}>
                    {t('schedule.player')}: {translateRsvp(ack.playerChoice)}
                    {ack.playerReason ? ` (${translateAbsenceReason(ack.playerReason)})` : ''}
                  </Text>
                  <Text style={[{ color: colors.muted }, rtlText]}>
                    {t('schedule.parent')}: {translateRsvp(ack.parentChoice)}
                    {ack.parentReason ? ` (${translateAbsenceReason(ack.parentReason)})` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })
        : null}

      <Text style={[layout.title, { color: colors.primary, fontSize: 22, marginTop: 12 }]}>
        {t('schedule.carpool')}
      </Text>
      {coachView ? (
        <Text style={[{ color: colors.muted, marginTop: 4 }, rtlText]}>
          {t('schedule.carpoolCoachHint')}
        </Text>
      ) : null}
      {showOffer ? (
        <View
          {...rtlContainerProps}
          style={[styles.card, rtlLayout.box, { borderColor: colors.primary, marginTop: 8 }]}
        >
          <Text style={[{ fontWeight: '800', color: colors.primary }, rtlText]}>
            {t('schedule.offerCarpool')}
          </Text>
          <Text style={[{ color: colors.muted, marginTop: 4 }, rtlText]}>
            {t('schedule.offerCarpoolHint')}
          </Text>
          {!offerEventId ? (
            <Text style={[{ color: colors.muted, marginTop: 8 }, rtlText]}>
              {t('schedule.offerNoEvent')}
            </Text>
          ) : (
            <>
              <Text style={[{ color: colors.muted, marginTop: 10, fontWeight: '700' }, rtlText]}>
                {t('schedule.offerPickEvent')}
              </Text>
              <View style={[rtlLayout.row, { marginTop: 8 }]}>
                {events.map((event) => {
                  const selected = event.id === offerEventId;
                  return (
                    <Pressable
                      key={event.id}
                      onPress={() => setOfferEventId(event.id)}
                      style={[
                        styles.seatChip,
                        rtlLayout.chip,
                        {
                          borderColor: selected ? colors.secondary : colors.primary,
                          backgroundColor: selected ? colors.secondary : '#fff',
                          maxWidth: '100%',
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          {
                            fontWeight: '700',
                            fontSize: 13,
                            color: selected ? '#fff' : colors.primary,
                          },
                          rtlText,
                        ]}
                        numberOfLines={2}
                      >
                        {event.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={[rtlLayout.row, { marginTop: 12, alignItems: 'center' }]}>
                <Pressable
                  onPress={() => setOfferSeats((n) => Math.max(1, n - 1))}
                  style={[styles.seatChip, { borderColor: colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('schedule.offerSeatsMinus')}
                >
                  <Text style={[{ fontWeight: '800', color: colors.primary }, rtlText]}>−</Text>
                </Pressable>
                <Text style={[{ fontWeight: '700', flex: 1 }, rtlText]}>
                  {t('schedule.offerSeats', { n: offerSeats })}
                </Text>
                <Pressable
                  onPress={() => setOfferSeats((n) => Math.min(8, n + 1))}
                  style={[styles.seatChip, { borderColor: colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('schedule.offerSeatsPlus')}
                >
                  <Text style={[{ fontWeight: '800', color: colors.primary }, rtlText]}>+</Text>
                </Pressable>
              </View>
              <Pressable
                disabled={offering}
                onPress={() => void onCreateOffer()}
                style={[
                  layout.button,
                  {
                    backgroundColor: colors.primary,
                    marginTop: 12,
                    opacity: offering ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[layout.buttonText, { color: '#fff' }]}>
                  {offering ? t('schedule.offerCreating') : t('schedule.offerCreate')}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
      {carpools.length === 0 ? (
        <Text style={[{ color: colors.muted, marginTop: 8 }, rtlText]}>
          {t('schedule.emptyCarpool')}
        </Text>
      ) : null}
      {carpools.map((offer) => {
        const isFull = offer.seatsTaken >= offer.seatsAvailable;
        const claiming = claimingOfferId === offer.id;
        const disabled = isFull || claiming || claimingOfferId != null;
        return (
          <View
            key={offer.id}
            {...rtlContainerProps}
            style={[styles.card, rtlLayout.box, { borderColor: colors.secondary }]}
          >
            <Text style={[{ fontWeight: '700' }, rtlText]}>{offer.parentName}</Text>
            <Text style={[{ color: colors.muted }, rtlText]}>
              {t('schedule.seatsTaken', {
                taken: offer.seatsTaken,
                available: offer.seatsAvailable,
              })}
            </Text>
            {showClaim ? (
              <Pressable
                disabled={disabled}
                onPress={() => void onClaimSeat(offer.id, isFull)}
                style={[
                  layout.button,
                  {
                    backgroundColor: isFull ? colors.muted : colors.primary,
                    marginTop: 10,
                    opacity: disabled && !isFull ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[layout.buttonText, { color: '#fff' }]}>
                  {isFull
                    ? t('schedule.claimSeatFull')
                    : claiming
                      ? t('schedule.claimSeatClaiming')
                      : t('schedule.claimSeat')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      <ReasonSheet
        visible={Boolean(sheetEventId)}
        reasons={absenceReasons}
        onClose={() => setSheetEventId(null)}
        onPick={(reason) => {
          if (sheetEventId) {
            void setRsvp(sheetEventId, 'not_attending', reason, user?.role === 'parent');
          }
          setSheetEventId(null);
        }}
      />

      <Modal
        visible={Boolean(editor)}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!editorBusy) setEditor(null);
        }}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => !editorBusy && setEditor(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.sheet, rtlLayout.box, { backgroundColor: colors.surface }]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              {...rtlContainerProps}
            >
              <Text style={[layout.title, { fontSize: 20, color: colors.primary }]}>
                {editor?.mode === 'edit'
                  ? editor.type === 'game'
                    ? t('schedule.editGame')
                    : t('schedule.editEvent')
                  : t('schedule.addGame')}
              </Text>

              <Text style={layout.label}>{t('schedule.eventTitle')}</Text>
              <TextInput
                textAlign={rtlTextAlign}
                value={editor?.title ?? ''}
                onChangeText={(title) => setEditor((e) => (e ? { ...e, title } : e))}
                style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
              />

              <Text style={layout.label}>{t('schedule.eventLocation')}</Text>
              <TextInput
                textAlign={rtlTextAlign}
                value={editor?.location ?? ''}
                onChangeText={(location) => setEditor((e) => (e ? { ...e, location } : e))}
                style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
              />

              <Text style={layout.label}>{t('schedule.eventDate')}</Text>
              <TextInput
                textAlign={rtlTextAlign}
                value={editor?.date ?? ''}
                onChangeText={(date) => setEditor((e) => (e ? { ...e, date } : e))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
              />

              <Text style={layout.label}>{t('schedule.eventTime')}</Text>
              <TextInput
                textAlign={rtlTextAlign}
                value={editor?.time ?? ''}
                onChangeText={(time) => setEditor((e) => (e ? { ...e, time } : e))}
                placeholder="HH:MM"
                placeholderTextColor={colors.muted}
                style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
              />

              <View style={[rtlLayout.row, { marginTop: 12 }]}>
                {(['game', 'practice'] as const).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setEditor((e) => (e ? { ...e, type } : e))}
                    style={[
                      styles.chip,
                      {
                        borderColor: colors.primary,
                        backgroundColor: editor?.type === type ? colors.primary : '#fff',
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
                      {type === 'game' ? t('schedule.typeGame') : t('schedule.typePractice')}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {editor?.type === 'game' ? (
                <>
                  <Text style={layout.label}>{t('schedule.hallAddress')}</Text>
                  <TextInput
                    textAlign={rtlTextAlign}
                    value={editor.hallAddress}
                    onChangeText={(hallAddress) =>
                      setEditor((e) => (e ? { ...e, hallAddress } : e))
                    }
                    placeholder={t('schedule.hallAddressPlaceholder')}
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      rtlInput,
                      { borderColor: colors.primary, color: colors.text },
                    ]}
                  />
                  <Text style={layout.label}>{t('schedule.contactPhone')}</Text>
                  <TextInput
                    keyboardType="phone-pad"
                    textAlign={rtlTextAlign}
                    value={editor.contactPhone}
                    onChangeText={(contactPhone) =>
                      setEditor((e) => (e ? { ...e, contactPhone } : e))
                    }
                    placeholder={t('schedule.contactPhonePlaceholder')}
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      rtlInput,
                      { borderColor: colors.primary, color: colors.text },
                    ]}
                  />
                </>
              ) : null}

              {editorNote ? (
                <Text style={[{ color: colors.danger, marginTop: 8 }, rtlText]}>{editorNote}</Text>
              ) : null}

              <Pressable
                disabled={editorBusy}
                onPress={() => void saveEditor()}
                style={[
                  layout.button,
                  {
                    backgroundColor: colors.primary,
                    marginTop: 16,
                    opacity: editorBusy ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[layout.buttonText, { color: '#fff' }]}>
                  {editorBusy ? t('schedule.savingEvent') : t('schedule.saveEvent')}
                </Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function ReasonSheet({
  visible,
  reasons,
  onClose,
  onPick,
}: {
  visible: boolean;
  reasons: readonly string[];
  onClose: () => void;
  onPick: (reason: string) => void;
}) {
  const { colors } = useTheme();
  const items = useMemo(() => reasons, [reasons]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[layout.title, { fontSize: 20, color: colors.primary }]}>
            {t('schedule.whyAbsent')}
          </Text>
          {items.map((reason) => (
            <Pressable
              key={reason}
              onPress={() => onPick(reason)}
              style={[layout.button, { backgroundColor: colors.background, marginTop: 10 }]}
            >
              <Text style={[layout.buttonText, { color: colors.text }]}>
                {translateAbsenceReason(reason)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.3,
    ...rtlText,
  },
  bannerBody: {
    color: '#FFFFFF',
    marginTop: 8,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    ...rtlText,
  },
  bannerAckBtn: {
    marginTop: 14,
    borderWidth: 2,
    minHeight: 48,
  },
  viewChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyEntry: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: '#fff',
    writingDirection: 'rtl',
  },
  venueBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#F8FAFC',
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    ...rtlText,
  },
  ackRow: { marginTop: 10, padding: 10, borderRadius: 10 },
  seatChip: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
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
    maxHeight: '88%',
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
});
