import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { dualAckConflict } from '@/lib/demo-data';
import { useSession } from '@/session/SessionContext';
import { layout, useTheme } from '@/theme/ThemeContext';

export function ScheduleScreen() {
  const { colors } = useTheme();
  const { events, acks, setRsvp, absenceReasons, user, carpools, claimCarpoolSeat, banner, acknowledgeBanner } =
    useSession();
  const [sheetEventId, setSheetEventId] = useState<string | null>(null);

  const pendingBanner =
    banner.requiresAck && user && !banner.acknowledgedBy.includes(user.id);

  return (
    <ScrollView contentContainerStyle={[layout.screen, { backgroundColor: colors.background }]}>
      {pendingBanner ? (
        <View style={[styles.banner, { backgroundColor: colors.accent }]}>
          <Text style={styles.bannerTitle}>Urgent</Text>
          <Text style={styles.bannerBody}>{banner.message}</Text>
          <Pressable
            onPress={acknowledgeBanner}
            style={[layout.button, { backgroundColor: '#fff', marginTop: 10 }]}
          >
            <Text style={[layout.buttonText, { color: colors.accent }]}>I acknowledge</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={[layout.title, { color: colors.primary }]}>Schedule</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>
        Dual-Ack: player and parent RSVPs. Conflicts highlight yellow.
      </Text>

      {events.map((event) => {
        const related = acks.filter((a) => a.eventId === event.id);
        return (
          <View key={event.id} style={[styles.card, { borderColor: colors.primary }]}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={{ color: colors.muted }}>
              {new Date(event.startsAt).toLocaleString()} · {event.location}
            </Text>

            <View style={styles.row}>
              <Pressable
                onPress={() => setRsvp(event.id, 'attending', undefined, user?.role === 'parent')}
                style={[layout.button, styles.half, { backgroundColor: colors.success }]}
              >
                <Text style={[layout.buttonText, { color: '#fff' }]}>Attending</Text>
              </Pressable>
              <Pressable
                onPress={() => setSheetEventId(event.id)}
                style={[layout.button, styles.half, { backgroundColor: colors.danger }]}
              >
                <Text style={[layout.buttonText, { color: '#fff' }]}>Not attending</Text>
              </Pressable>
            </View>

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
                  <Text style={{ fontWeight: '700' }}>
                    {ack.playerId === 'user-player-roi' ? 'Roi' : 'Dan'}
                    {conflict ? ' · CONFLICT' : ''}
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    Player: {ack.playerChoice ?? '—'}
                    {ack.playerReason ? ` (${ack.playerReason})` : ''}
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    Parent: {ack.parentChoice ?? '—'}
                    {ack.parentReason ? ` (${ack.parentReason})` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}

      <Text style={[layout.title, { color: colors.primary, fontSize: 22, marginTop: 12 }]}>
        Carpool
      </Text>
      {carpools.map((offer) => (
        <View key={offer.id} style={[styles.card, { borderColor: colors.secondary }]}>
          <Text style={{ fontWeight: '700' }}>{offer.parentName}</Text>
          <Text style={{ color: colors.muted }}>
            {offer.seatsTaken}/{offer.seatsAvailable} seats taken
          </Text>
          <Pressable
            onPress={() => claimCarpoolSeat(offer.id)}
            style={[layout.button, { backgroundColor: colors.primary, marginTop: 10 }]}
          >
            <Text style={[layout.buttonText, { color: '#fff' }]}>Claim a seat</Text>
          </Pressable>
        </View>
      ))}

      <ReasonSheet
        visible={Boolean(sheetEventId)}
        reasons={absenceReasons}
        onClose={() => setSheetEventId(null)}
        onPick={(reason) => {
          if (sheetEventId) {
            setRsvp(sheetEventId, 'not_attending', reason, user?.role === 'parent');
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
            Why can&apos;t you make it?
          </Text>
          {items.map((reason) => (
            <Pressable
              key={reason}
              onPress={() => onPick(reason)}
              style={[layout.button, { backgroundColor: colors.background, marginTop: 10 }]}
            >
              <Text style={[layout.buttonText, { color: colors.text }]}>{reason}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 14, padding: 14, marginBottom: 16 },
  bannerTitle: { color: '#fff', fontWeight: '800', fontSize: 14, textTransform: 'uppercase' },
  bannerBody: { color: '#fff', marginTop: 6, fontSize: 16, lineHeight: 22 },
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  eventTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  half: { flex: 1 },
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
