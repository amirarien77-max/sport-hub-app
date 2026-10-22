import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSession } from '@/session/SessionContext';
import { layout, useTheme } from '@/theme/ThemeContext';

export function PlaysScreen() {
  const { colors } = useTheme();
  const {
    plays,
    assignments,
    suggestions,
    togglePlaySuggestions,
    answerAssignment,
    submitSuggestion,
    reviewSuggestion,
    user,
    banner,
  } = useSession();
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [suggestionDraft, setSuggestionDraft] = useState('');

  const isCoach =
    user?.role === 'head_coach' ||
    user?.role === 'assistant_coach' ||
    user?.role === 'admin';
  const feedBlocked = user?.consentStatus === 'pending_parental_consent';

  return (
    <ScrollView contentContainerStyle={[layout.screen, { backgroundColor: colors.background }]}>
      <Text style={[layout.title, { color: colors.primary }]}>Tactical board</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>
        Position assignments, action prompts, and per-play suggestion toggle.
      </Text>

      {feedBlocked ? (
        <View style={[styles.notice, { backgroundColor: '#FEE2E2' }]}>
          <Text style={{ color: colors.danger, fontWeight: '700' }}>
            Team feed locked until parental SMS consent is approved.
          </Text>
        </View>
      ) : (
        <View style={[styles.notice, { backgroundColor: '#ECFDF5' }]}>
          <Text style={{ color: colors.success, fontWeight: '700' }}>
            Feed open · minors may only react with emoji (enforced in feed block).
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>Pinned: {banner.message}</Text>
        </View>
      )}

      {plays.map((play) => {
        const playAssignments = assignments.filter((a) => a.playId === play.id);
        const playSuggestions = suggestions.filter((s) => s.playId === play.id);
        return (
          <View key={play.id} style={[styles.card, { borderColor: colors.primary }]}>
            <Text style={styles.playTitle}>{play.title}</Text>
            <View style={styles.court}>
              <Text style={styles.courtLabel}>Court sketch placeholder</Text>
              <View style={styles.positions}>
                {['1', '2', '3', '4', '5'].map((pos) => (
                  <View key={pos} style={[styles.dot, { backgroundColor: colors.secondary }]}>
                    <Text style={{ fontWeight: '800', color: colors.primary }}>{pos}</Text>
                  </View>
                ))}
              </View>
            </View>

            {isCoach ? (
              <Pressable
                onPress={() => togglePlaySuggestions(play.id)}
                style={[
                  layout.button,
                  {
                    backgroundColor: play.allowSuggestions ? colors.success : colors.muted,
                    marginTop: 10,
                  },
                ]}
              >
                <Text style={[layout.buttonText, { color: '#fff' }]}>
                  Suggestions {play.allowSuggestions ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            ) : null}

            <Text style={styles.section}>Assignments</Text>
            {playAssignments.map((a) => (
              <View key={a.id} style={styles.assign}>
                <Text style={{ fontWeight: '800' }}>
                  Pos {a.positionName} · {a.playerName}
                </Text>
                <Text style={{ color: colors.muted, marginTop: 4 }}>{a.actionPromptQuestion}</Text>
                {user?.role === 'player' ? (
                  <>
                    <TextInput
                      value={answerDrafts[a.id] ?? a.playerAnswer ?? ''}
                      onChangeText={(t) => setAnswerDrafts((d) => ({ ...d, [a.id]: t }))}
                      placeholder="Explain your action..."
                      placeholderTextColor={colors.muted}
                      style={[styles.input, { borderColor: colors.primary }]}
                    />
                    <Pressable
                      onPress={() => answerAssignment(a.id, answerDrafts[a.id] ?? '')}
                      style={[layout.button, { backgroundColor: colors.secondary, marginTop: 8 }]}
                    >
                      <Text style={[layout.buttonText, { color: colors.primary }]}>Save answer</Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={{ marginTop: 6 }}>
                    Answer: {a.playerAnswer ?? '— waiting —'}
                  </Text>
                )}
              </View>
            ))}

            {user?.role === 'player' && play.allowSuggestions ? (
              <>
                <Text style={styles.section}>Suggest a change</Text>
                <TextInput
                  value={suggestionDraft}
                  onChangeText={setSuggestionDraft}
                  placeholder="Alternative cut / spacing idea"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { borderColor: colors.primary }]}
                />
                <Pressable
                  onPress={() => {
                    submitSuggestion(play.id, suggestionDraft);
                    setSuggestionDraft('');
                  }}
                  style={[layout.button, { backgroundColor: colors.primary, marginTop: 8 }]}
                >
                  <Text style={[layout.buttonText, { color: '#fff' }]}>Send suggestion</Text>
                </Pressable>
              </>
            ) : null}

            {user?.role === 'player' && !play.allowSuggestions ? (
              <Text style={{ marginTop: 10, color: colors.muted }}>
                Coach disabled suggestions for this play.
              </Text>
            ) : null}

            {isCoach && playSuggestions.length > 0 ? (
              <>
                <Text style={styles.section}>Suggestion inbox</Text>
                {playSuggestions.map((s) => (
                  <View key={s.id} style={styles.assign}>
                    <Text style={{ fontWeight: '700' }}>
                      {s.playerName} · {s.status}
                    </Text>
                    <Text style={{ marginTop: 4 }}>{s.suggestionText}</Text>
                    {s.status === 'pending' ? (
                      <View style={styles.row}>
                        <Pressable
                          onPress={() => reviewSuggestion(s.id, 'approved')}
                          style={[layout.button, styles.half, { backgroundColor: colors.success }]}
                        >
                          <Text style={[layout.buttonText, { color: '#fff' }]}>Approve</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => reviewSuggestion(s.id, 'rejected')}
                          style={[layout.button, styles.half, { backgroundColor: colors.danger }]}
                        >
                          <Text style={[layout.buttonText, { color: '#fff' }]}>Reject</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  notice: { padding: 12, borderRadius: 12, marginTop: 12 },
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  playTitle: { fontSize: 18, fontWeight: '800' },
  court: {
    marginTop: 12,
    height: 160,
    borderRadius: 12,
    backgroundColor: '#1B4332',
    alignItems: 'center',
    justifyContent: 'center',
  },
  courtLabel: { color: '#D8F3DC', marginBottom: 12, fontWeight: '600' },
  positions: { flexDirection: 'row', gap: 10 },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginTop: 16, marginBottom: 8, fontWeight: '800', color: '#334155' },
  assign: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
  },
  input: {
    marginTop: 8,
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  half: { flex: 1 },
});
