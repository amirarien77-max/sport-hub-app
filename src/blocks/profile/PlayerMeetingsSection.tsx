/**
 * תיק אישי — meetings + 1–3 goals (PRD v1.1 §2.2).
 * Coach: create / publish. Player & parent: published read-only.
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
import { t } from '@/i18n';
import { demoUsers } from '@/lib/demo-data';
import {
  createPlayerMeeting,
  fetchPlayerMeetings,
  fetchTeamPlayersForMeetings,
  updatePlayerMeeting,
  type PlayerMeeting,
} from '@/lib/meetings-live';
import { isAttendanceCoach } from '@/lib/roles';
import { ensureParentPlayerLink } from '@/lib/schedule-live';
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

const DEMO_MEETINGS: PlayerMeeting[] = [
  {
    id: 'demo-meeting-1',
    teamId: 'team-u16',
    playerId: 'user-player-roi',
    playerName: 'Roi Cohen',
    coachId: 'user-coach',
    meetingDate: new Date().toISOString().slice(0, 10),
    summary: 'שיחת אמצע עונה — שיפור קליעה והובלה.',
    goals: ['שיפור קליעה מחוץ לקשת', 'מנהיגות על המגרש'],
    isPublished: true,
    createdAt: new Date().toISOString(),
  },
];

export function PlayerMeetingsSection() {
  const { colors } = useTheme();
  const { user, team } = useSession();
  const coach = isAttendanceCoach(user?.role);
  const reader = user?.role === 'player' || user?.role === 'parent';

  const [meetings, setMeetings] = useState<PlayerMeeting[]>([]);
  const [players, setPlayers] = useState<{ id: string; fullName: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [playerId, setPlayerId] = useState('');
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState('');
  const [goal1, setGoal1] = useState('');
  const [goal2, setGoal2] = useState('');
  const [goal3, setGoal3] = useState('');

  const load = useCallback(async () => {
    if (!user || !team || (!coach && !reader)) return;
    setLoading(true);
    setNote(null);
    try {
      if (isDemoMode || !supabase) {
        const list =
          coach
            ? DEMO_MEETINGS
            : DEMO_MEETINGS.filter((m) => m.isPublished && m.playerId === 'user-player-roi');
        setMeetings(list);
        setPlayers(
          demoUsers
            .filter((u) => u.role === 'player')
            .map((u) => ({ id: u.id, fullName: u.fullName })),
        );
        if (!playerId && demoUsers.some((u) => u.id === 'user-player-roi')) {
          setPlayerId('user-player-roi');
        }
        return;
      }

      if (coach) {
        const [rows, roster] = await Promise.all([
          fetchPlayerMeetings(supabase, { teamId: team.id }),
          fetchTeamPlayersForMeetings(supabase, team.id),
        ]);
        setMeetings(rows);
        setPlayers(roster);
        if (!playerId && roster[0]) setPlayerId(roster[0].id);
      } else {
        let filterPlayer: string | undefined = user.role === 'player' ? user.id : undefined;
        if (user.role === 'parent') {
          filterPlayer = (await ensureParentPlayerLink(supabase, user.id, team.id)) ?? undefined;
        }
        const rows = await fetchPlayerMeetings(supabase, {
          teamId: team.id,
          playerId: filterPlayer,
        });
        setMeetings(rows.filter((m) => m.isPublished));
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [coach, playerId, reader, team, user]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per role/team
  }, [user?.id, user?.role, team?.id, coach, reader]);

  if (!user || !team || (!coach && !reader)) return null;

  const publish = async (publishNow: boolean) => {
    if (!coach) return;
    const goals = [goal1, goal2, goal3].map((g) => g.trim()).filter(Boolean);
    if (!playerId) {
      setNote(t('meetings.pickPlayer'));
      return;
    }
    if (!summary.trim()) {
      setNote(t('meetings.summaryRequired'));
      return;
    }
    if (goals.length < 1 || goals.length > 3) {
      setNote(t('meetings.goalsRequired'));
      return;
    }
    setSaving(true);
    setNote(null);
    try {
      if (isDemoMode || !supabase) {
        const row: PlayerMeeting = {
          id: `demo-meeting-${Date.now()}`,
          teamId: team.id,
          playerId,
          playerName: players.find((p) => p.id === playerId)?.fullName,
          coachId: user.id,
          meetingDate,
          summary: summary.trim(),
          goals,
          isPublished: publishNow,
          createdAt: new Date().toISOString(),
        };
        setMeetings((prev) => [row, ...prev]);
        setSummary('');
        setGoal1('');
        setGoal2('');
        setGoal3('');
        setNote(publishNow ? t('meetings.published') : t('meetings.savedDraft'));
        return;
      }
      await createPlayerMeeting(supabase, {
        teamId: team.id,
        playerId,
        coachId: user.id,
        meetingDate,
        summary: summary.trim(),
        goals,
        isPublished: publishNow,
      });
      setSummary('');
      setGoal1('');
      setGoal2('');
      setGoal3('');
      setNote(publishNow ? t('meetings.published') : t('meetings.savedDraft'));
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setNote(msg === 'goals_count' ? t('meetings.goalsRequired') : msg);
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (meeting: PlayerMeeting) => {
    if (!coach) return;
    setSaving(true);
    try {
      if (isDemoMode || !supabase) {
        setMeetings((prev) =>
          prev.map((m) =>
            m.id === meeting.id ? { ...m, isPublished: !m.isPublished } : m,
          ),
        );
        return;
      }
      await updatePlayerMeeting(supabase, {
        id: meeting.id,
        isPublished: !meeting.isPublished,
      });
      await load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      {...rtlContainerProps}
      style={[styles.card, rtlLayout.box, { borderColor: colors.secondary }]}
    >
      <Text style={[styles.heading, { color: colors.primary }]}>{t('meetings.title')}</Text>
      <Text style={[{ color: colors.muted, marginBottom: 8 }, rtlText]}>
        {coach ? t('meetings.subtitleCoach') : t('meetings.subtitleReadOnly')}
      </Text>

      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      {coach ? (
        <View style={{ marginTop: 8 }}>
          <Text style={layout.label}>{t('meetings.player')}</Text>
          <View style={rtlLayout.row}>
            {players.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setPlayerId(p.id)}
                style={[
                  styles.chip,
                  {
                    borderColor: colors.primary,
                    backgroundColor: playerId === p.id ? colors.secondary : '#fff',
                  },
                ]}
              >
                <Text
                  style={[
                    {
                      color: playerId === p.id ? '#fff' : colors.primary,
                      fontWeight: '700',
                    },
                    rtlText,
                  ]}
                >
                  {p.fullName}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={layout.label}>{t('meetings.date')}</Text>
          <TextInput
            textAlign={rtlTextAlign}
            value={meetingDate}
            onChangeText={setMeetingDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
          />

          <Text style={layout.label}>{t('meetings.summary')}</Text>
          <TextInput
            textAlign={rtlTextAlign}
            multiline
            value={summary}
            onChangeText={setSummary}
            placeholder={t('meetings.summaryPlaceholder')}
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              styles.multiline,
              rtlInput,
              { borderColor: colors.primary, color: colors.text },
            ]}
          />

          <Text style={layout.label}>{t('meetings.goals')}</Text>
          {[goal1, goal2, goal3].map((g, i) => (
            <TextInput
              key={`goal-${i}`}
              textAlign={rtlTextAlign}
              value={g}
              onChangeText={(v) => {
                if (i === 0) setGoal1(v);
                else if (i === 1) setGoal2(v);
                else setGoal3(v);
              }}
              placeholder={t('meetings.goalPlaceholder', { n: i + 1 })}
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                rtlInput,
                { borderColor: colors.primary, color: colors.text, marginTop: i ? 8 : 0 },
              ]}
            />
          ))}

          <View style={[rtlLayout.splitRow, { marginTop: 12 }]}>
            <Pressable
              disabled={saving}
              onPress={() => void publish(false)}
              style={[layout.button, rtlLayout.half, { backgroundColor: colors.muted }]}
            >
              <Text style={[layout.buttonText, { color: '#fff' }]}>{t('meetings.saveDraft')}</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              onPress={() => void publish(true)}
              style={[layout.button, rtlLayout.half, { backgroundColor: colors.primary }]}
            >
              <Text style={[layout.buttonText, { color: '#fff' }]}>{t('meetings.publish')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {note ? (
        <Text
          style={[
            {
              marginTop: 10,
              color:
                note === t('meetings.published') || note === t('meetings.savedDraft')
                  ? colors.success
                  : colors.danger,
            },
            rtlText,
          ]}
        >
          {note}
        </Text>
      ) : null}

      <Text style={[styles.listTitle, { color: colors.primary }]}>{t('meetings.listTitle')}</Text>
      {meetings.length === 0 ? (
        <Text style={[{ color: colors.muted }, rtlText]}>{t('meetings.empty')}</Text>
      ) : (
        meetings.map((m) => (
          <View
            key={m.id}
            style={[styles.meetingRow, rtlLayout.box, { borderColor: colors.primary }]}
          >
            <Text style={[{ fontWeight: '800' }, rtlText]}>
              {m.playerName ?? m.playerId.slice(0, 8)} · {m.meetingDate}
            </Text>
            <Text style={[{ marginTop: 6, color: colors.text }, rtlText]}>{m.summary}</Text>
            {m.goals.map((g, idx) => (
              <Text key={`${m.id}-g-${idx}`} style={[{ marginTop: 4, color: colors.muted }, rtlText]}>
                {t('meetings.goalItem', { n: idx + 1, goal: g })}
              </Text>
            ))}
            <Text style={[{ marginTop: 6, color: colors.muted, fontSize: 12 }, rtlText]}>
              {m.isPublished ? t('meetings.statusPublished') : t('meetings.statusDraft')}
            </Text>
            {coach ? (
              <Pressable
                onPress={() => void togglePublish(m)}
                style={[
                  layout.button,
                  {
                    marginTop: 8,
                    backgroundColor: m.isPublished ? colors.muted : colors.success,
                    minHeight: 40,
                  },
                ]}
              >
                <Text style={[layout.buttonText, { color: '#fff' }]}>
                  {m.isPublished ? t('meetings.unpublish') : t('meetings.publish')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))
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
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
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
  meetingRow: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#F8FAFC',
  },
});
