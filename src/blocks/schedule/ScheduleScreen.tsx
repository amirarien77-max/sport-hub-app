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
import { canClaimCarpool, canSubmitRsvp, isAttendanceCoach } from '@/lib/roles';
import { useSession } from '@/session/SessionContext';
import { layout, rtlLayout, rtlText, useTheme } from '@/theme/ThemeContext';

export function ScheduleScreen() {
  const { colors } = useTheme();
  const { events, acks, setRsvp, absenceReasons, user, carpools, claimCarpoolSeat, banner, acknowledgeBanner } =
    useSession();
  const [sheetEventId, setSheetEventId] = useState<string | null>(null);
  const [claimingOfferId, setClaimingOfferId] = useState<string | null>(null);

  const coachView = isAttendanceCoach(user?.role);
  const showRsvp = canSubmitRsvp(user?.role);
  const showClaim = canClaimCarpool(user?.role);

  const subtitle = coachView
    ? t('schedule.subtitleCoach')
    : user?.role === 'parent'
      ? t('schedule.subtitleParent')
      : t('schedule.subtitle');

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
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={layout.scrollContent}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      {pendingBanner ? (
        <View style={[styles.banner, { backgroundColor: colors.accent }]}>
          <Text style={styles.bannerTitle}>{t('schedule.urgent')}</Text>
          <Text style={styles.bannerBody}>{banner.message}</Text>
          <Pressable
            onPress={() => void acknowledgeBanner()}
            style={[layout.button, { backgroundColor: '#fff', marginTop: 10 }]}
          >
            <Text style={[layout.buttonText, { color: colors.accent }]}>
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
          <View key={event.id} style={[styles.card, { borderColor: colors.primary }]}>
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
          <View key={offer.id} style={[styles.card, { borderColor: colors.secondary }]}>
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
  banner: { borderRadius: 14, padding: 14, marginBottom: 16 },
  bannerTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    textTransform: 'uppercase',
    ...rtlText,
  },
  bannerBody: {
    color: '#fff',
    marginTop: 6,
    fontSize: 16,
    lineHeight: 22,
    ...rtlText,
  },
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    ...rtlText,
  },
  ackRow: { marginTop: 10, padding: 10, borderRadius: 10 },
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
