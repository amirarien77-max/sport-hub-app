/**
 * מאמן ראשי: חיבור הודעות דחופות + סטטוס אישור (Dual-Ack style).
 * לא באנר על לו״ז של המאמן — פרופיל / תקשורת צוות.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t, translateRole } from '@/i18n';
import { demoUsers } from '@/lib/demo-data';
import { isHeadCoach } from '@/lib/roles';
import { fetchUrgentAckRoster, type UrgentAckRosterRow } from '@/lib/schedule-live';
import { isDemoMode, supabase } from '@/lib/supabase';
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

export function UrgentMessagesSection() {
  const { colors } = useTheme();
  const { user, team, banner, composeUrgentBanner } = useSession();
  const head = isHeadCoach(user?.role);

  const [message, setMessage] = useState('');
  const [roster, setRoster] = useState<UrgentAckRosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const loadRoster = useCallback(async () => {
    if (!head || !user || !team || !banner.id) {
      setRoster([]);
      return;
    }
    setLoading(true);
    try {
      if (isDemoMode || !supabase) {
        const acked = new Set(banner.acknowledgedBy);
        setRoster(
          demoUsers
            .filter((u) => u.role === 'player' || u.role === 'parent')
            .map((u) => ({
              userId: u.id,
              fullName: u.fullName,
              role: u.role,
              acknowledged: acked.has(u.id),
            })),
        );
        return;
      }
      const rows = await fetchUrgentAckRoster(supabase, {
        teamId: team.id,
        postId: banner.id,
      });
      setRoster(rows);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [banner.acknowledgedBy, banner.id, head, team, user]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  if (!user || !team || !head) return null;

  const onCompose = async () => {
    const body = message.trim();
    if (!body) {
      setNote(t('urgent.messageRequired'));
      return;
    }
    setSaving(true);
    setNote(null);
    try {
      const result = await composeUrgentBanner(body);
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      setMessage('');
      setNote(t('urgent.sentOk'));
      await loadRoster();
    } finally {
      setSaving(false);
    }
  };

  const confirmed = roster.filter((r) => r.acknowledged);
  const pending = roster.filter((r) => !r.acknowledged);

  return (
    <View
      {...rtlContainerProps}
      style={[styles.card, rtlLayout.box, { borderColor: colors.secondary }]}
    >
      <Text style={[styles.heading, { color: colors.primary }]}>{t('urgent.title')}</Text>
      <Text style={[{ color: colors.muted, marginBottom: 8 }, rtlText]}>
        {t('urgent.subtitle')}
      </Text>

      <Text style={layout.label}>{t('urgent.message')}</Text>
      <TextInput
        textAlign={rtlTextAlign}
        multiline
        value={message}
        onChangeText={setMessage}
        placeholder={t('urgent.messagePlaceholder')}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          styles.multiline,
          rtlInput,
          { borderColor: colors.primary, color: colors.text },
        ]}
      />
      <Pressable
        disabled={saving}
        onPress={() => void onCompose()}
        style={[
          layout.button,
          {
            backgroundColor: saving ? colors.muted : colors.primary,
            marginTop: 10,
            opacity: saving ? 0.7 : 1,
          },
        ]}
      >
        <Text style={[layout.buttonText, { color: '#fff' }]}>
          {saving ? t('urgent.sending') : t('urgent.send')}
        </Text>
      </Pressable>

      {note ? (
        <Text
          style={[
            {
              marginTop: 10,
              color: note === t('urgent.sentOk') ? colors.success : colors.danger,
            },
            rtlText,
          ]}
        >
          {note}
        </Text>
      ) : null}

      <Text style={[styles.listTitle, { color: colors.primary }]}>{t('urgent.ackStatus')}</Text>
      {!banner.id ? (
        <Text style={[{ color: colors.muted }, rtlText]}>{t('urgent.noActive')}</Text>
      ) : (
        <>
          <Text style={[{ color: colors.muted, marginBottom: 6 }, rtlText]}>
            {t('urgent.activeMessage', { message: banner.message })}
          </Text>
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
          <Text style={[styles.groupLabel, { color: colors.success }]}>
            {t('urgent.confirmed', { count: confirmed.length })}
          </Text>
          {confirmed.length === 0 ? (
            <Text style={[{ color: colors.muted, fontSize: 13 }, rtlText]}>
              {t('urgent.noneYet')}
            </Text>
          ) : (
            confirmed.map((row) => (
              <View
                key={row.userId}
                style={[styles.ackRow, rtlLayout.box, { backgroundColor: '#ECFDF5' }]}
              >
                <Text style={[{ fontWeight: '700' }, rtlText]}>{row.fullName}</Text>
                <Text style={[{ color: colors.muted, fontSize: 12 }, rtlText]}>
                  {translateRole(row.role)} · {t('urgent.ackYes')}
                </Text>
              </View>
            ))
          )}
          <Text style={[styles.groupLabel, { color: colors.warning }]}>
            {t('urgent.notConfirmed', { count: pending.length })}
          </Text>
          {pending.length === 0 ? (
            <Text style={[{ color: colors.muted, fontSize: 13 }, rtlText]}>
              {t('urgent.allConfirmed')}
            </Text>
          ) : (
            pending.map((row) => (
              <View
                key={row.userId}
                style={[styles.ackRow, rtlLayout.box, { backgroundColor: '#FFFBEB' }]}
              >
                <Text style={[{ fontWeight: '700' }, rtlText]}>{row.fullName}</Text>
                <Text style={[{ color: colors.muted, fontSize: 12 }, rtlText]}>
                  {translateRole(row.role)} · {t('urgent.ackNo')}
                </Text>
              </View>
            ))
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  heading: {
    fontSize: 18,
    fontWeight: '800',
    ...rtlText,
  },
  listTitle: {
    marginTop: 18,
    marginBottom: 8,
    fontWeight: '800',
    fontSize: 16,
    ...rtlText,
  },
  groupLabel: {
    marginTop: 10,
    marginBottom: 4,
    fontWeight: '800',
    ...rtlText,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  ackRow: {
    marginTop: 6,
    padding: 10,
    borderRadius: 10,
  },
});
