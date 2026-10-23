import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t, translateSuggestionStatus } from '@/i18n';
import { isTacticalCoach } from '@/lib/roles';
import {
  parseBoardJson,
  serializeBoardJson,
  type BoardMarker,
} from '@/lib/tactical-live';
import { useSession } from '@/session/SessionContext';
import { layout, useTheme } from '@/theme/ThemeContext';
import type { TacticalPlay } from '@/types';

function showResult(
  result: { ok: true; playId?: string } | { ok: false; error: string } | void,
) {
  if (!result || result.ok) return;
  Alert.alert(t('plays.saveFailed', { error: result.error }));
}

function nextMarkerLabel(markers: BoardMarker[]): number {
  const used = markers
    .map((m) => Number.parseInt(m.label, 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  for (let n = 1; n <= 5; n += 1) {
    if (!used.includes(n)) return n;
  }
  return (used[used.length - 1] % 5) + 1;
}

export function PlaysScreen() {
  const { colors } = useTheme();
  const {
    plays,
    assignments,
    suggestions,
    tacticalPlayers,
    togglePlaySuggestions,
    answerAssignment,
    submitSuggestion,
    reviewSuggestion,
    createPlay,
    updatePlayMedia,
    updatePlayBoard,
    createAssignment,
    user,
    banner,
  } = useSession();

  const [selectedPlayId, setSelectedPlayId] = useState<string | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [suggestionDraft, setSuggestionDraft] = useState('');
  const [newPlayTitle, setNewPlayTitle] = useState('');
  const [mediaDraft, setMediaDraft] = useState('');
  const [positionDraft, setPositionDraft] = useState('1');
  const [promptDraft, setPromptDraft] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [localMarkers, setLocalMarkers] = useState<BoardMarker[]>([]);
  const [courtSize, setCourtSize] = useState({ w: 1, h: 1 });
  const [nextLabel, setNextLabel] = useState(1);

  const isCoach = isTacticalCoach(user?.role);
  const feedBlocked = user?.consentStatus === 'pending_parental_consent';
  const selectedPlay = plays.find((p) => p.id === selectedPlayId) ?? null;

  useEffect(() => {
    if (!selectedPlay) {
      setLocalMarkers([]);
      setMediaDraft('');
      setNextLabel(1);
      return;
    }
    const markers = parseBoardJson(selectedPlay.boardJson).markers;
    setLocalMarkers(markers);
    setNextLabel(nextMarkerLabel(markers));
    setMediaDraft(selectedPlay.mediaUrl ?? '');
    setSuggestionDraft('');
  }, [selectedPlay?.id, selectedPlay?.boardJson, selectedPlay?.mediaUrl]);

  useEffect(() => {
    if (!selectedPlayerId && tacticalPlayers[0]) {
      setSelectedPlayerId(tacticalPlayers[0].id);
    }
  }, [selectedPlayerId, tacticalPlayers]);

  const playAssignments = useMemo(
    () => (selectedPlay ? assignments.filter((a) => a.playId === selectedPlay.id) : []),
    [assignments, selectedPlay],
  );
  const playSuggestions = useMemo(
    () => (selectedPlay ? suggestions.filter((s) => s.playId === selectedPlay.id) : []),
    [suggestions, selectedPlay],
  );
  const mySuggestions = useMemo(
    () =>
      selectedPlay && user?.role === 'player'
        ? playSuggestions.filter((s) => s.playerId === user.id)
        : [],
    [playSuggestions, selectedPlay, user],
  );

  const onCourtLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCourtSize({ w: Math.max(1, width), h: Math.max(1, height) });
  };

  const addMarkerAt = (locationX: number, locationY: number) => {
    if (!isCoach || !selectedPlay) return;
    const x = Math.min(100, Math.max(0, Math.round((locationX / courtSize.w) * 100)));
    const y = Math.min(100, Math.max(0, Math.round((locationY / courtSize.h) * 100)));
    const label = String(nextLabel);
    const next = [...localMarkers, { x, y, label }].slice(-12);
    setLocalMarkers(next);
    setNextLabel(nextMarkerLabel(next));
  };

  const removeMarker = (idx: number) => {
    if (!isCoach) return;
    const next = localMarkers.filter((_, i) => i !== idx);
    setLocalMarkers(next);
    setNextLabel(nextMarkerLabel(next));
  };

  const saveBoard = async () => {
    if (!selectedPlay) return;
    const result = await updatePlayBoard(
      selectedPlay.id,
      serializeBoardJson({ markers: localMarkers }),
    );
    if (result.ok) Alert.alert(t('plays.savedOk'));
    else showResult(result);
  };

  const renderList = () => (
    <>
      <Text style={[layout.title, { color: colors.primary }]}>{t('plays.title')}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{t('plays.subtitle')}</Text>

      {feedBlocked ? (
        <View style={[styles.notice, { backgroundColor: '#FEE2E2' }]}>
          <Text style={{ color: colors.danger, fontWeight: '700', textAlign: 'right' }}>
            {t('plays.feedLocked')}
          </Text>
        </View>
      ) : (
        <View style={[styles.notice, { backgroundColor: '#ECFDF5' }]}>
          <Text style={{ color: colors.success, fontWeight: '700', textAlign: 'right' }}>
            {t('plays.feedOpen')}
          </Text>
          {banner.message ? (
            <Text style={{ color: colors.muted, marginTop: 4, textAlign: 'right' }}>
              {t('plays.pinned', { message: banner.message })}
            </Text>
          ) : null}
        </View>
      )}

      <Text style={[styles.section, { color: colors.primary }]}>{t('plays.listTitle')}</Text>

      {isCoach ? (
        <View style={[styles.card, { borderColor: colors.primary }]}>
          <Text style={styles.playTitle}>{t('plays.createPlay')}</Text>
          <TextInput
            textAlign="right"
            value={newPlayTitle}
            onChangeText={setNewPlayTitle}
            placeholder={t('plays.createPlayPlaceholder')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.primary }]}
          />
          <Pressable
            onPress={async () => {
              const result = await createPlay(newPlayTitle);
              if (result.ok) {
                setNewPlayTitle('');
                setSelectedPlayId(result.playId);
                Alert.alert(t('plays.savedOk'));
              } else {
                showResult(result);
              }
            }}
            style={[layout.button, { backgroundColor: colors.primary, marginTop: 8 }]}
          >
            <Text style={[layout.buttonText, { color: '#fff' }]}>{t('plays.createPlaySubmit')}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 8 }}>
          {t('plays.coachOnlyCreate')}
        </Text>
      )}

      {plays.length === 0 ? (
        <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 12 }}>
          {t('plays.emptyPlays')}
        </Text>
      ) : null}

      {plays.map((play) => (
        <PlayListRow
          key={play.id}
          play={play}
          colors={colors}
          onOpen={() => setSelectedPlayId(play.id)}
        />
      ))}
    </>
  );

  const renderDetail = (play: TacticalPlay) => (
    <>
      <Pressable onPress={() => setSelectedPlayId(null)} style={{ marginBottom: 8 }}>
        <Text style={{ color: colors.primary, fontWeight: '700', textAlign: 'right' }}>
          ← {t('plays.backToList')}
        </Text>
      </Pressable>

      <Text style={[layout.title, { color: colors.primary }]}>{play.title}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{t('plays.gameIqStub')}</Text>

      {/*
        Court taps must beat the parent ScrollView. Use Pressable for hit-testing,
        keep decorations pointerEvents=none, and refuse responder termination so
        vertical scroll does not swallow the tap.
      */}
      <View
        style={styles.court}
        onLayout={onCourtLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => false}
        onResponderTerminationRequest={() => false}
      >
        <Pressable
          disabled={!isCoach}
          onPress={(evt) => {
            const { locationX, locationY } = evt.nativeEvent;
            addMarkerAt(locationX, locationY);
          }}
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={t('plays.courtSketch')}
        />
        <View pointerEvents="none" style={styles.courtLabelWrap}>
          <Text style={styles.courtLabel}>
            {isCoach ? t('plays.courtSketch') : t('plays.courtHintPlayer')}
          </Text>
        </View>
        <View pointerEvents="none" style={styles.paint} />
        <View pointerEvents="none" style={styles.ftLine} />
        {localMarkers.map((m, idx) => (
          <Pressable
            key={`${m.label}-${idx}-${m.x}-${m.y}`}
            disabled={!isCoach}
            onPress={() => removeMarker(idx)}
            style={[
              styles.marker,
              {
                left: (m.x / 100) * courtSize.w - 18,
                top: (m.y / 100) * courtSize.h - 18,
                backgroundColor: colors.secondary,
                borderColor: colors.primary,
                zIndex: 2,
              },
            ]}
          >
            <Text style={{ fontWeight: '800', color: colors.primary }}>{m.label}</Text>
          </Pressable>
        ))}
      </View>
      {isCoach ? (
        <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 6 }}>
          {t('plays.courtHintCoach')}
        </Text>
      ) : null}

      {isCoach ? (
        <View style={styles.row}>
          <Pressable
            onPress={() => setLocalMarkers([])}
            style={[layout.button, styles.half, { backgroundColor: colors.muted }]}
          >
            <Text style={[layout.buttonText, { color: '#fff' }]}>{t('plays.clearBoard')}</Text>
          </Pressable>
          <Pressable
            onPress={() => void saveBoard()}
            style={[layout.button, styles.half, { backgroundColor: colors.primary }]}
          >
            <Text style={[layout.buttonText, { color: '#fff' }]}>{t('plays.saveBoard')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.card, { borderColor: colors.primary, marginTop: 14 }]}>
        <Text style={styles.playTitle}>{t('plays.mediaStubTitle')}</Text>
        <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 4 }}>
          {t('plays.mediaStubHint')}
        </Text>
        {isCoach ? (
          <>
            <TextInput
              textAlign="right"
              autoCapitalize="none"
              value={mediaDraft}
              onChangeText={setMediaDraft}
              placeholder={t('plays.mediaUrlPlaceholder')}
              placeholderTextColor={colors.muted}
              style={[styles.input, { borderColor: colors.primary }]}
            />
            <Pressable
              onPress={async () => showResult(await updatePlayMedia(play.id, mediaDraft))}
              style={[layout.button, { backgroundColor: colors.secondary, marginTop: 8 }]}
            >
              <Text style={[layout.buttonText, { color: colors.primary }]}>
                {t('plays.saveMediaUrl')}
              </Text>
            </Pressable>
          </>
        ) : (
          <Text style={{ marginTop: 8, textAlign: 'right', fontWeight: '600' }}>
            {play.mediaUrl ? `${t('plays.mediaLinked')}: ${play.mediaUrl}` : t('plays.mediaMissing')}
          </Text>
        )}
      </View>

      {isCoach ? (
        <Pressable
          onPress={async () => showResult(await togglePlaySuggestions(play.id))}
          style={[
            layout.button,
            {
              backgroundColor: play.allowSuggestions ? colors.success : colors.muted,
              marginTop: 12,
            },
          ]}
        >
          <Text style={[layout.buttonText, { color: '#fff' }]}>
            {play.allowSuggestions ? t('plays.suggestionsOn') : t('plays.suggestionsOff')}
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.section}>{t('plays.assignments')}</Text>
      {playAssignments.map((a) => (
        <View key={a.id} style={styles.assign}>
          <Text style={{ fontWeight: '800', textAlign: 'right' }}>
            {t('plays.pos', { pos: a.positionName, name: a.playerName })}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4, textAlign: 'right' }}>
            {a.actionPromptQuestion}
          </Text>
          {user?.role === 'player' && a.playerId === user.id ? (
            <>
              <TextInput
                textAlign="right"
                value={answerDrafts[a.id] ?? a.playerAnswer ?? ''}
                onChangeText={(txt) => setAnswerDrafts((d) => ({ ...d, [a.id]: txt }))}
                placeholder={t('plays.answerPlaceholder')}
                placeholderTextColor={colors.muted}
                style={[styles.input, { borderColor: colors.primary }]}
              />
              <Pressable
                onPress={async () =>
                  showResult(await answerAssignment(a.id, answerDrafts[a.id] ?? ''))
                }
                style={[layout.button, { backgroundColor: colors.secondary, marginTop: 8 }]}
              >
                <Text style={[layout.buttonText, { color: colors.primary }]}>
                  {t('plays.saveAnswer')}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={{ marginTop: 6, textAlign: 'right' }}>
              {t('plays.answer', {
                answer: a.playerAnswer ?? t('plays.waiting'),
              })}
            </Text>
          )}
        </View>
      ))}

      {isCoach ? (
        <View style={[styles.card, { borderColor: colors.primary }]}>
          <Text style={styles.playTitle}>{t('plays.addAssignment')}</Text>
          <Text style={{ color: colors.muted, textAlign: 'right', marginBottom: 6 }}>
            {t('plays.pickPlayer')}
          </Text>
          <View style={styles.chipRow}>
            {tacticalPlayers.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setSelectedPlayerId(p.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      selectedPlayerId === p.id ? colors.primary : '#E2E8F0',
                  },
                ]}
              >
                <Text
                  style={{
                    color: selectedPlayerId === p.id ? '#fff' : colors.primary,
                    fontWeight: '700',
                  }}
                >
                  {p.fullName}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            textAlign="right"
            value={positionDraft}
            onChangeText={setPositionDraft}
            placeholder={t('plays.positionPlaceholder')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.primary }]}
          />
          <TextInput
            textAlign="right"
            value={promptDraft}
            onChangeText={setPromptDraft}
            placeholder={t('plays.promptPlaceholder')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.primary }]}
          />
          <Pressable
            onPress={async () => {
              const result = await createAssignment({
                playId: play.id,
                playerId: selectedPlayerId,
                positionName: positionDraft,
                actionPromptQuestion: promptDraft,
              });
              showResult(result);
              if (result.ok) {
                setPromptDraft('');
                Alert.alert(t('plays.savedOk'));
              }
            }}
            style={[layout.button, { backgroundColor: colors.primary, marginTop: 8 }]}
          >
            <Text style={[layout.buttonText, { color: '#fff' }]}>{t('plays.saveAssignment')}</Text>
          </Pressable>
        </View>
      ) : null}

      {user?.role === 'player' && play.allowSuggestions && !feedBlocked ? (
        <>
          <Text style={styles.section}>{t('plays.suggestChange')}</Text>
          <TextInput
            textAlign="right"
            value={suggestionDraft}
            onChangeText={setSuggestionDraft}
            placeholder={t('plays.suggestionPlaceholder')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.primary }]}
          />
          <Pressable
            onPress={async () => {
              const result = await submitSuggestion(play.id, suggestionDraft);
              showResult(result);
              if (result && result.ok) setSuggestionDraft('');
            }}
            style={[layout.button, { backgroundColor: colors.primary, marginTop: 8 }]}
          >
            <Text style={[layout.buttonText, { color: '#fff' }]}>{t('plays.sendSuggestion')}</Text>
          </Pressable>
        </>
      ) : null}

      {user?.role === 'player' && !play.allowSuggestions ? (
        <Text style={{ marginTop: 10, color: colors.muted, textAlign: 'right' }}>
          {t('plays.suggestionsDisabled')}
        </Text>
      ) : null}

      {user?.role === 'player' && mySuggestions.length > 0 ? (
        <>
          <Text style={styles.section}>{t('plays.mySuggestions')}</Text>
          {mySuggestions.map((s) => (
            <View key={s.id} style={styles.assign}>
              <Text style={{ fontWeight: '700', textAlign: 'right' }}>
                {translateSuggestionStatus(s.status)}
              </Text>
              <Text style={{ marginTop: 4, textAlign: 'right' }}>{s.suggestionText}</Text>
            </View>
          ))}
        </>
      ) : null}

      {isCoach && playSuggestions.length > 0 ? (
        <>
          <Text style={styles.section}>{t('plays.suggestionInbox')}</Text>
          {playSuggestions.map((s) => (
            <View key={s.id} style={styles.assign}>
              <Text style={{ fontWeight: '700', textAlign: 'right' }}>
                {s.playerName} · {translateSuggestionStatus(s.status)}
              </Text>
              <Text style={{ marginTop: 4, textAlign: 'right' }}>{s.suggestionText}</Text>
              {s.status === 'pending' ? (
                <View style={styles.row}>
                  <Pressable
                    onPress={async () => showResult(await reviewSuggestion(s.id, 'approved'))}
                    style={[layout.button, styles.half, { backgroundColor: colors.success }]}
                  >
                    <Text style={[layout.buttonText, { color: '#fff' }]}>{t('plays.approve')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => showResult(await reviewSuggestion(s.id, 'rejected'))}
                    style={[layout.button, styles.half, { backgroundColor: colors.danger }]}
                  >
                    <Text style={[layout.buttonText, { color: '#fff' }]}>{t('plays.reject')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </>
      ) : null}
    </>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={layout.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {selectedPlay ? renderDetail(selectedPlay) : renderList()}
    </ScrollView>
  );
}

function PlayListRow({
  play,
  colors,
  onOpen,
}: {
  play: TacticalPlay;
  colors: { primary: string; muted: string; success: string };
  onOpen: () => void;
}) {
  const markerCount = parseBoardJson(play.boardJson).markers.length;
  return (
    <Pressable
      onPress={onOpen}
      style={[styles.card, { borderColor: colors.primary }]}
    >
      <Text style={styles.playTitle}>{play.title}</Text>
      <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 4 }}>
        {play.allowSuggestions ? t('plays.suggestionsOn') : t('plays.suggestionsOff')}
        {markerCount > 0 ? ` · ${markerCount}` : ''}
        {play.mediaUrl ? ` · ${t('plays.mediaLinked')}` : ''}
      </Text>
      <Text style={{ color: colors.primary, fontWeight: '700', textAlign: 'right', marginTop: 8 }}>
        {t('plays.openPlay')} →
      </Text>
    </Pressable>
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
  playTitle: { fontSize: 18, fontWeight: '800', textAlign: 'right' },
  court: {
    marginTop: 12,
    height: 220,
    borderRadius: 12,
    backgroundColor: '#1B4332',
    overflow: 'hidden',
    position: 'relative',
  },
  courtLabelWrap: {
    position: 'absolute',
    top: 10,
    right: 12,
    left: 12,
    zIndex: 1,
  },
  courtLabel: {
    color: '#D8F3DC',
    fontWeight: '600',
    textAlign: 'right',
  },
  paint: {
    position: 'absolute',
    bottom: 0,
    left: '30%',
    width: '40%',
    height: '45%',
    borderWidth: 2,
    borderColor: 'rgba(216,243,220,0.45)',
    borderBottomWidth: 0,
  },
  ftLine: {
    position: 'absolute',
    bottom: '45%',
    left: '30%',
    width: '40%',
    height: 2,
    backgroundColor: 'rgba(216,243,220,0.45)',
  },
  marker: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
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
    writingDirection: 'rtl',
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  half: { flex: 1 },
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
});
