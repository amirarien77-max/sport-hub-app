/**
 * מסך לו״ז (מודול 2): אירועים, Dual-Ack (שחקן/הורה), carpool, באנר דחוף.
 * מאמן רואה סיכום RSVP בלבד (ללא כפתורי בחירה). קונפליקט Dual-Ack מודגש ב־UI.
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t, translateAbsenceReason, translateRsvp } from '@/i18n';
import { dualAckConflict } from '@/lib/demo-data';
import { canClaimCarpool, canOfferCarpool, canSubmitRsvp, isAttendanceCoach } from '@/lib/roles';
import { useSession } from '@/session/SessionContext';
import { layout, rtlContainerProps, rtlLayout, rtlText, useTheme } from '@/theme/ThemeContext';

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
  } = useSession();
  const [sheetEventId, setSheetEventId] = useState<string | null>(null);
  const [claimingOfferId, setClaimingOfferId] = useState<string | null>(null);
  const [offerSeats, setOfferSeats] = useState(3);
  const [offering, setOffering] = useState(false);

  const coachView = isAttendanceCoach(user?.role);
  const showRsvp = canSubmitRsvp(user?.role);
  const showClaim = canClaimCarpool(user?.role);
  const showOffer = canOfferCarpool(user?.role);
  const offerEventId = events[0]?.id ?? null;

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

      {events.length === 0 ? (
        <Text style={[{ color: colors.muted, marginTop: 12 }, rtlText]}>
          {t('schedule.emptyEvents')}
        </Text>
      ) : null}

      {events.map((event) => {
        const related = acks.filter((a) => a.eventId === event.id);
        return (
          <View
            key={event.id}
            {...rtlContainerProps}
            style={[styles.card, rtlLayout.box, { borderColor: colors.primary }]}
          >
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={[{ color: colors.muted }, rtlText]}>
              {new Date(event.startsAt).toLocaleString('he-IL')} · {event.location}
            </Text>

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
      })}

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
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: '#fff',
    writingDirection: 'rtl',
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
  },
});
