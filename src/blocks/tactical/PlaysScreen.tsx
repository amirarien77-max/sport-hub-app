/**
 * מסך תרגילים טקטיים (מודול 4 + Game IQ).
 *
 * מאמן: יצירת תרגיל, לחיצות על הלוח (סימוני 1–5), שיבוץ פעולה, מדיה, ביקורת הצעות.
 * שחקן: משימות פעולה + תשובות + הצעות (אם allowSuggestions).
 * Game IQ: כפתור מפעיל Edge/OpenAI או stub עברי; התוצאה נשמרת ב־game_iq_json.
 *
 * לוח: RN Pressable + responder על ה־View כדי שלחיצות לא ייבלעו ב־ScrollView.
 * כפתור יצירה: gesture-handler ב־native, RN Pressable ב־web (מונע quirks של GH).
 * Alert.alert הוא no-op ב־web → משוב inline (createError / assignFeedback).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  LayoutChangeEvent,
  Platform,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { t, translateSuggestionStatus } from '@/i18n';
import {
  buildOfflineGameIq,
  generateGameIq,
  type GameIqInsight,
} from '@/lib/game-iq';
import { pickTacticalMedia, uploadTacticalMedia } from '@/lib/media-upload';
import { isTacticalCoach } from '@/lib/roles';
import { isDemoMode, supabase } from '@/lib/supabase';
import {
  parseBoardJson,
  serializeBoardJson,
  type BoardMarker,
} from '@/lib/tactical-live';
import { useSession } from '@/session/SessionContext';
import { layout, rtlInput, rtlLayout, rtlText, rtlTextAlign, useTheme } from '@/theme/ThemeContext';
import type { PlayAssignment, TacticalPlay } from '@/types';

function parseCachedInsight(raw?: string): GameIqInsight | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as GameIqInsight;
    if (!o?.summary || !Array.isArray(o.coachBullets) || !Array.isArray(o.playerBullets)) {
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

/** Prefer inline UI feedback — Alert.alert is a no-op on react-native-web. */
function showResult(
  result: { ok: true; playId?: string } | { ok: false; error: string } | void,
) {
  if (!result || result.ok) return;
  const msg = t('plays.saveFailed', { error: result.error });
  console.warn(msg);
  if (Platform.OS !== 'web') Alert.alert(t('plays.title'), msg);
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
    cachePlayGameIq,
    createAssignment,
    user,
    team,
    banner,
  } = useSession();

  const [selectedPlayId, setSelectedPlayId] = useState<string | null>(null);
  const [gameIq, setGameIq] = useState<GameIqInsight | null>(null);
  const [gameIqLoading, setGameIqLoading] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [answerStatus, setAnswerStatus] = useState<Record<string, string>>({});
  const [suggestionDraft, setSuggestionDraft] = useState('');
  const [newPlayTitle, setNewPlayTitle] = useState('');
  const [mediaDraft, setMediaDraft] = useState('');
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaNote, setMediaNote] = useState<string | null>(null);
  const [positionDraft, setPositionDraft] = useState('1');
  const [promptDraft, setPromptDraft] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [localMarkers, setLocalMarkers] = useState<BoardMarker[]>([]);
  const [courtSize, setCourtSize] = useState({ w: 1, h: 1 });
  const [nextLabel, setNextLabel] = useState(1);
  const [creatingPlay, setCreatingPlay] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState<string | null>(null);
  const [assignFeedback, setAssignFeedback] = useState<string | null>(null);

  const isCoach = isTacticalCoach(user?.role);
  const isPlayer = user?.role === 'player';
  const feedBlocked = user?.consentStatus === 'pending_parental_consent';
  const selectedPlay = plays.find((p) => p.id === selectedPlayId) ?? null;

  const myAssignments = useMemo(() => {
    if (!isPlayer || !user) return [] as (PlayAssignment & { playTitle: string })[];
    const titleById = Object.fromEntries(plays.map((p) => [p.id, p.title]));
    return assignments
      .filter((a) => a.playerId === user.id)
      .map((a) => ({ ...a, playTitle: titleById[a.playId] ?? t('plays.title') }))
      .sort((a, b) => {
        const aDone = Boolean(a.playerAnswer?.trim());
        const bDone = Boolean(b.playerAnswer?.trim());
        if (aDone === bDone) return 0;
        return aDone ? 1 : -1;
      });
  }, [assignments, isPlayer, plays, user]);

  useEffect(() => {
    if (!selectedPlay) {
      setLocalMarkers([]);
      setMediaDraft('');
      setNextLabel(1);
      setGameIq(null);
      return;
    }
    const markers = parseBoardJson(selectedPlay.boardJson).markers;
    setLocalMarkers(markers);
    setNextLabel(nextMarkerLabel(markers));
    setMediaDraft(selectedPlay.mediaUrl ?? '');
    setSuggestionDraft('');
    setAssignFeedback(null);
    setGameIq(parseCachedInsight(selectedPlay.gameIqJson));
  }, [selectedPlay?.id, selectedPlay?.boardJson, selectedPlay?.mediaUrl, selectedPlay?.gameIqJson]);

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
      selectedPlay && isPlayer && user
        ? playSuggestions.filter((s) => s.playerId === user.id)
        : [],
    [isPlayer, playSuggestions, selectedPlay, user],
  );

  // ── לוח טקטי: מיפוי לחיצה לפיקסלים → אחוזי מגרש (0–100), תוויות 1–5 ──
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
    if (result.ok) {
      setAssignFeedback(t('plays.savedOk'));
      if (Platform.OS !== 'web') Alert.alert(t('plays.savedOk'));
    } else showResult(result);
  };

  const savePlayerAnswer = async (assignmentId: string) => {
    setAnswerStatus((s) => ({ ...s, [assignmentId]: '' }));
    const draft = answerDrafts[assignmentId] ?? '';
    const result = await answerAssignment(assignmentId, draft);
    if (!result || result.ok) {
      setAnswerStatus((s) => ({ ...s, [assignmentId]: t('plays.answerSaved') }));
      if (Platform.OS !== 'web') Alert.alert(t('plays.title'), t('plays.answerSaved'));
    } else {
      setAnswerStatus((s) => ({
        ...s,
        [assignmentId]: t('plays.saveFailed', { error: result.error }),
      }));
      showResult(result);
    }
  };

  const handleCreatePlay = async () => {
    Keyboard.dismiss();
    setCreateError(null);
    setCreateOk(null);
    setCreatingPlay(true);
    try {
      const result = await createPlay(newPlayTitle);
      if (result.ok) {
        setNewPlayTitle('');
        setCreateOk(t('plays.createPlaySuccess'));
        setSelectedPlayId(result.playId);
        if (Platform.OS !== 'web') Alert.alert(t('plays.title'), t('plays.createPlaySuccess'));
      } else {
        setCreateError(result.error);
        showResult(result);
      }
    } finally {
      setCreatingPlay(false);
    }
  };

  // ── Game IQ: live Edge/OpenAI או stub; תמיד מציגים insight + cache מקומי/DB ──
  const runGameIq = async (play: TacticalPlay) => {
    setGameIqLoading(true);
    setCreateError(null);
    try {
      const viewerRole = isCoach ? 'coach' : isPlayer ? 'player' : 'other';
      const playAssigns = assignments.filter((a) => a.playId === play.id);
      const insight =
        isDemoMode || !supabase
          ? buildOfflineGameIq({
              play,
              assignments: playAssigns,
              viewerRole,
            })
          : await generateGameIq(supabase, {
              play,
              assignments: playAssigns,
              viewerRole,
            });
      setGameIq(insight);
      await cachePlayGameIq(play.id, JSON.stringify(insight));
    } catch (err) {
      // generateGameIq already falls back offline; this is a last-resort safety net.
      const fallback = buildOfflineGameIq({
        play,
        assignments: assignments.filter((a) => a.playId === play.id),
        viewerRole: isCoach ? 'coach' : isPlayer ? 'player' : 'other',
      });
      setGameIq(fallback);
      console.warn('runGameIq', err instanceof Error ? err.message : err);
    } finally {
      setGameIqLoading(false);
    }
  };

  const renderAnswerEditor = (a: PlayAssignment, showPlayTitle?: string) => (
    <View key={a.id} style={styles.assign}>
      {showPlayTitle ? (
        <Text style={{ fontWeight: '700', color: colors.primary, textAlign: 'right' }}>
          {showPlayTitle}
        </Text>
      ) : null}
      <Text style={{ fontWeight: '800', textAlign: 'right', marginTop: showPlayTitle ? 4 : 0 }}>
        {t('plays.pos', { pos: a.positionName, name: a.playerName })}
      </Text>
      <Text style={{ color: colors.muted, marginTop: 4, textAlign: 'right' }}>
        {a.actionPromptQuestion}
      </Text>
      <TextInput
        textAlign={rtlTextAlign}
        value={answerDrafts[a.id] ?? a.playerAnswer ?? ''}
        onChangeText={(txt) => {
          setAnswerDrafts((d) => ({ ...d, [a.id]: txt }));
          if (answerStatus[a.id]) setAnswerStatus((s) => ({ ...s, [a.id]: '' }));
        }}
        placeholder={t('plays.answerPlaceholder')}
        placeholderTextColor={colors.muted}
        multiline
        style={[styles.input, styles.answerInput, { borderColor: colors.primary }]}
        accessibilityLabel={t('plays.answerPlaceholder')}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('plays.saveAnswer')}
        onPress={() => void savePlayerAnswer(a.id)}
        style={[layout.button, { backgroundColor: colors.secondary, marginTop: 8 }]}
      >
        <Text style={[layout.buttonText, { color: colors.primary }]}>{t('plays.saveAnswer')}</Text>
      </Pressable>
      {answerStatus[a.id] ? (
        <Text
          style={{
            marginTop: 6,
            textAlign: 'right',
            fontWeight: '600',
            color: answerStatus[a.id] === t('plays.answerSaved') ? colors.success : colors.danger,
          }}
        >
          {answerStatus[a.id]}
        </Text>
      ) : null}
    </View>
  );

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

      {isPlayer ? (
        <View style={[styles.card, { borderColor: colors.secondary }]}>
          <Text style={styles.playTitle}>{t('plays.myActionTasks')}</Text>
          <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 4 }}>
            {t('plays.myActionTasksHint')}
          </Text>
          {myAssignments.length === 0 ? (
            <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 10 }}>
              {t('plays.noMyAssignments')}
            </Text>
          ) : (
            myAssignments.map((a) => renderAnswerEditor(a, a.playTitle))
          )}
        </View>
      ) : null}

      <Text style={[styles.section, { color: colors.primary }]}>{t('plays.listTitle')}</Text>

      {isCoach ? (
        <View style={[styles.card, { borderColor: colors.primary }]}>
          <Text style={styles.playTitle}>{t('plays.createPlay')}</Text>
          <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 4 }}>
            {t('plays.createPlayHint')}
          </Text>
          <TextInput
            textAlign={rtlTextAlign}
            value={newPlayTitle}
            onChangeText={(txt) => {
              setNewPlayTitle(txt);
              if (createError) setCreateError(null);
              if (createOk) setCreateOk(null);
            }}
            placeholder={t('plays.createPlayPlaceholder')}
            placeholderTextColor={colors.muted}
            editable={!creatingPlay}
            returnKeyType="done"
            onSubmitEditing={() => void handleCreatePlay()}
            style={[styles.input, { borderColor: colors.primary }]}
          />
          {createError ? (
            <Text style={{ color: colors.danger, marginTop: 8, textAlign: 'right', fontWeight: '600' }}>
              {createError}
            </Text>
          ) : null}
          {createOk ? (
            <Text style={{ color: colors.success, marginTop: 8, textAlign: 'right', fontWeight: '600' }}>
              {createOk}
            </Text>
          ) : null}
          {/*
            Gesture-handler Pressable is reliable inside ScrollView on native/Expo Go.
            On web, RN Pressable avoids GH pointer quirks.
          */}
          {Platform.OS === 'web' ? (
            <RNPressable
              accessibilityRole="button"
              accessibilityLabel={t('plays.createPlaySubmit')}
              disabled={creatingPlay}
              hitSlop={12}
              onPress={() => void handleCreatePlay()}
              style={[
                layout.button,
                {
                  backgroundColor: creatingPlay ? colors.muted : colors.primary,
                  marginTop: 8,
                  opacity: creatingPlay ? 0.85 : 1,
                  minHeight: 52,
                },
              ]}
            >
              <Text style={[layout.buttonText, { color: '#fff' }]}>
                {creatingPlay ? t('plays.creatingPlay') : t('plays.createPlaySubmit')}
              </Text>
            </RNPressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('plays.createPlaySubmit')}
              disabled={creatingPlay}
              hitSlop={12}
              onPress={() => void handleCreatePlay()}
              style={[
                layout.button,
                {
                  backgroundColor: creatingPlay ? colors.muted : colors.primary,
                  marginTop: 8,
                  opacity: creatingPlay ? 0.85 : 1,
                  minHeight: 52,
                },
              ]}
            >
              <Text style={[layout.buttonText, { color: '#fff' }]}>
                {creatingPlay ? t('plays.creatingPlay') : t('plays.createPlaySubmit')}
              </Text>
            </Pressable>
          )}
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
          assignmentHint={
            isPlayer && user
              ? assignments.filter((a) => a.playId === play.id && a.playerId === user.id).length
              : isCoach
                ? assignments.filter((a) => a.playId === play.id).length
                : 0
          }
          onOpen={() => setSelectedPlayId(play.id)}
        />
      ))}
    </>
  );

  const renderDetail = (play: TacticalPlay) => (
    <>
      <Pressable onPress={() => setSelectedPlayId(null)} style={{ marginBottom: 8 }}>
        <Text style={{ color: colors.primary, fontWeight: '700', textAlign: 'right' }}>
          → {t('plays.backToList')}
        </Text>
      </Pressable>

      <Text style={[layout.title, { color: colors.primary }]}>{play.title}</Text>
      {createOk && selectedPlayId === play.id ? (
        <Text style={{ color: colors.success, fontWeight: '700', textAlign: 'right', marginBottom: 8 }}>
          {createOk}
        </Text>
      ) : null}

      <View style={[styles.card, { borderColor: colors.secondary }]}>
        <Text style={styles.playTitle}>{t('plays.gameIqTitle')}</Text>
        <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 4 }}>
          {t('plays.gameIqStub')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('plays.gameIqRun')}
          disabled={gameIqLoading}
          onPress={() => void runGameIq(play)}
          style={[
            layout.button,
            {
              backgroundColor: gameIqLoading ? colors.muted : colors.primary,
              marginTop: 10,
              minHeight: 48,
            },
          ]}
        >
          <Text style={[layout.buttonText, { color: '#fff' }]}>
            {gameIqLoading ? t('plays.gameIqRunning') : t('plays.gameIqRun')}
          </Text>
        </Pressable>
        {gameIq ? (
          <View style={{ marginTop: 12 }}>
            <Text
              style={{
                textAlign: 'right',
                fontWeight: '700',
                color: gameIq.mode === 'openai' ? colors.success : colors.muted,
              }}
            >
              {gameIq.mode === 'openai' ? t('plays.gameIqModeOpenAI') : t('plays.gameIqModeOffline')}
              {play.gameIqJson ? ` · ${t('plays.gameIqCached')}` : ''}
            </Text>
            <Text style={{ textAlign: 'right', marginTop: 8, fontWeight: '600' }}>{gameIq.summary}</Text>
            {(isCoach || !isPlayer) && (
              <>
                <Text style={[styles.section, { marginTop: 12 }]}>{t('plays.gameIqCoach')}</Text>
                {gameIq.coachBullets.map((b, i) => (
                  <Text key={`c-${i}`} style={{ textAlign: 'right', marginBottom: 4 }}>
                    • {b}
                  </Text>
                ))}
              </>
            )}
            <Text style={[styles.section, { marginTop: 12 }]}>{t('plays.gameIqPlayer')}</Text>
            {gameIq.playerBullets.map((b, i) => (
              <Text key={`p-${i}`} style={{ textAlign: 'right', marginBottom: 4 }}>
                • {b}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 10 }}>
            {t('plays.gameIqEmpty')}
          </Text>
        )}
      </View>

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
        <RNPressable
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
          <RNPressable
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
          </RNPressable>
        ))}
      </View>
      {isCoach ? (
        <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 6 }}>
          {t('plays.courtHintCoach')}
        </Text>
      ) : null}

      {isCoach ? (
        <View style={[rtlLayout.splitRow, { marginTop: 10, gap: 8 }]}>
          <Pressable
            onPress={() => setLocalMarkers([])}
            style={[layout.button, rtlLayout.half, { backgroundColor: colors.muted }]}
          >
            <Text style={[layout.buttonText, { color: '#fff' }]}>{t('plays.clearBoard')}</Text>
          </Pressable>
          <Pressable
            onPress={() => void saveBoard()}
            style={[layout.button, rtlLayout.half, { backgroundColor: colors.primary }]}
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
        {mediaNote ? (
          <Text style={{ color: colors.success, textAlign: 'right', marginTop: 6 }}>{mediaNote}</Text>
        ) : null}
        {isCoach ? (
          <>
            <Pressable
              disabled={mediaUploading || isDemoMode || !supabase || !team}
              onPress={async () => {
                if (!supabase || !team) return;
                setMediaUploading(true);
                setMediaNote(null);
                setCreateError(null);
                try {
                  const picked = await pickTacticalMedia();
                  if (!picked.ok) {
                    if (!picked.cancelled) {
                      setCreateError(
                        picked.error === 'permission_denied'
                          ? t('plays.mediaPermissionDenied')
                          : t('plays.mediaUploadFailed', { error: picked.error ?? 'pick' }),
                      );
                    }
                    return;
                  }
                  const uploaded = await uploadTacticalMedia({
                    client: supabase,
                    teamId: team.id,
                    playId: play.id,
                    uri: picked.uri,
                    mimeType: picked.mimeType,
                    fileName: picked.fileName,
                  });
                  if (!uploaded.ok) {
                    setCreateError(t('plays.mediaUploadFailed', { error: uploaded.error }));
                    return;
                  }
                  setMediaDraft(uploaded.publicUrl);
                  const saved = await updatePlayMedia(play.id, uploaded.publicUrl);
                  if (saved.ok) {
                    setMediaNote(t('plays.mediaUploadOk'));
                  } else {
                    showResult(saved);
                  }
                } finally {
                  setMediaUploading(false);
                }
              }}
              style={[
                layout.button,
                {
                  backgroundColor: mediaUploading ? colors.muted : colors.primary,
                  marginTop: 10,
                },
              ]}
            >
              <Text style={[layout.buttonText, { color: '#fff' }]}>
                {mediaUploading
                  ? t('plays.mediaUploading')
                  : isDemoMode
                    ? t('plays.mediaUploadDemoOnly')
                    : t('plays.mediaUpload')}
              </Text>
            </Pressable>
            <TextInput
              textAlign={rtlTextAlign}
              autoCapitalize="none"
              value={mediaDraft}
              onChangeText={setMediaDraft}
              placeholder={t('plays.mediaUrlPlaceholder')}
              placeholderTextColor={colors.muted}
              style={[styles.input, { borderColor: colors.primary, marginTop: 10 }]}
            />
            <Pressable
              onPress={async () => showResult(await updatePlayMedia(play.id, mediaDraft))}
              style={[layout.button, { backgroundColor: colors.secondary, marginTop: 8 }]}
            >
              <Text style={[layout.buttonText, { color: '#fff' }]}>
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
      {playAssignments.length === 0 ? (
        <Text style={{ color: colors.muted, textAlign: 'right' }}>{t('plays.emptyAssignments')}</Text>
      ) : null}
      {playAssignments.map((a) =>
        isPlayer && user && a.playerId === user.id ? (
          renderAnswerEditor(a)
        ) : (
          <View key={a.id} style={styles.assign}>
            <Text style={{ fontWeight: '800', textAlign: 'right' }}>
              {t('plays.pos', { pos: a.positionName, name: a.playerName })}
            </Text>
            <Text style={{ color: colors.muted, marginTop: 4, textAlign: 'right' }}>
              {a.actionPromptQuestion}
            </Text>
            <Text
              style={{
                marginTop: 6,
                textAlign: 'right',
                fontWeight: '700',
                color: a.playerAnswer?.trim() ? colors.success : colors.muted,
              }}
            >
              {t('plays.answer', {
                answer: a.playerAnswer?.trim() ? a.playerAnswer : t('plays.waiting'),
              })}
            </Text>
          </View>
        ),
      )}

      {isCoach ? (
        <View style={[styles.card, { borderColor: colors.primary }]}>
          <Text style={styles.playTitle}>{t('plays.addAssignment')}</Text>
          <Text style={{ color: colors.muted, textAlign: 'right', marginBottom: 6 }}>
            {t('plays.pickPlayer')}
          </Text>
          {tacticalPlayers.length === 0 ? (
            <Text style={{ color: colors.danger, textAlign: 'right', marginBottom: 8 }}>
              {t('plays.noPlayersForAssign')}
            </Text>
          ) : null}
          <View style={[rtlLayout.row, { marginBottom: 4 }]}>
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
            textAlign={rtlTextAlign}
            value={positionDraft}
            onChangeText={setPositionDraft}
            placeholder={t('plays.positionPlaceholder')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.primary }]}
          />
          <TextInput
            textAlign={rtlTextAlign}
            value={promptDraft}
            onChangeText={setPromptDraft}
            placeholder={t('plays.promptPlaceholder')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.primary }]}
          />
          {assignFeedback ? (
            <Text style={{ color: colors.success, marginTop: 8, textAlign: 'right', fontWeight: '600' }}>
              {assignFeedback}
            </Text>
          ) : null}
          <Pressable
            onPress={async () => {
              setAssignFeedback(null);
              const result = await createAssignment({
                playId: play.id,
                playerId: selectedPlayerId,
                positionName: positionDraft,
                actionPromptQuestion: promptDraft,
              });
              showResult(result);
              if (result.ok) {
                setPromptDraft('');
                setAssignFeedback(t('plays.assignmentSaved'));
                if (Platform.OS !== 'web') Alert.alert(t('plays.savedOk'));
              }
            }}
            style={[layout.button, { backgroundColor: colors.primary, marginTop: 8 }]}
          >
            <Text style={[layout.buttonText, { color: '#fff' }]}>{t('plays.saveAssignment')}</Text>
          </Pressable>
        </View>
      ) : null}

      {isPlayer && play.allowSuggestions && !feedBlocked ? (
        <>
          <Text style={styles.section}>{t('plays.suggestChange')}</Text>
          <TextInput
            textAlign={rtlTextAlign}
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

      {isPlayer && !play.allowSuggestions ? (
        <Text style={{ marginTop: 10, color: colors.muted, textAlign: 'right' }}>
          {t('plays.suggestionsDisabled')}
        </Text>
      ) : null}

      {isPlayer && mySuggestions.length > 0 ? (
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
                <View style={[rtlLayout.splitRow, { marginTop: 10, gap: 8 }]}>
                  <Pressable
                    onPress={async () => showResult(await reviewSuggestion(s.id, 'approved'))}
                    style={[layout.button, rtlLayout.half, { backgroundColor: colors.success }]}
                  >
                    <Text style={[layout.buttonText, { color: '#fff' }]}>{t('plays.approve')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => showResult(await reviewSuggestion(s.id, 'rejected'))}
                    style={[layout.button, rtlLayout.half, { backgroundColor: colors.danger }]}
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
      keyboardDismissMode="on-drag"
    >
      {selectedPlay ? renderDetail(selectedPlay) : renderList()}
    </ScrollView>
  );
}

function PlayListRow({
  play,
  colors,
  assignmentHint,
  onOpen,
}: {
  play: TacticalPlay;
  colors: { primary: string; muted: string; success: string };
  assignmentHint: number;
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
        {assignmentHint > 0 ? ` · ${t('plays.assignmentCount', { count: assignmentHint })}` : ''}
        {play.mediaUrl ? ` · ${t('plays.mediaLinked')}` : ''}
      </Text>
      <Text style={{ color: colors.primary, fontWeight: '700', textAlign: 'right', marginTop: 8 }}>
        {t('plays.openPlay')} ←
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
  playTitle: { fontSize: 18, fontWeight: '800', ...rtlText },
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
    ...rtlText,
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
    ...rtlText,
  },
  assign: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    marginTop: 8,
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    ...rtlInput,
  },
  answerInput: {
    minHeight: 72,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
});
