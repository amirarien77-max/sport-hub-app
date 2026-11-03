/**
 * נגן וידאו תרגיל עם שכבת SVG מסונכרנת + שמע/קריינות אופציונלית.
 * קואורדינטות 0–100 (LTR) כמו CourtBoard — בלי שיקוף RTL על המסלולים.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Circle, Defs, Line, Marker, Path, Polygon, Text as SvgText } from 'react-native-svg';
import {
  sampleOverlayAt,
  type DrillOverlayInsight,
  type OverlayKeyframe,
} from '@/lib/drill-overlay';
import { t } from '@/i18n';
import { rtlContainerProps, rtlLayout, rtlRowDirection, rtlText, useTheme } from '@/theme/ThemeContext';

type Props = {
  mediaUrl?: string;
  overlay: DrillOverlayInsight;
  /** Optional voiceover / narration synced to playback clock. */
  voiceoverUrl?: string;
  /** When true, show court guide even without video (demo / image-only). */
  allowPlaceholder?: boolean;
};

/** Demo voiceover: short silent WAV data-URI so web Audio can attach & seek. */
const DEMO_VOICEOVER_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function pct(n: number, size: number) {
  return (n / 100) * size;
}

function pointsToPath(points: { x: number; y: number }[], w: number, h: number): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${pct(p.x, w)} ${pct(p.y, h)}`)
    .join(' ');
}

function HalfCourtGuide({ w, h, stroke }: { w: number; h: number; stroke: string }) {
  const keyL = pct(32, w);
  const keyR = pct(68, w);
  const keyTop = pct(55, h);
  const basketY = pct(94, h);
  const ftCx = pct(50, w);
  const ftR = pct(12, w);
  return (
    <>
      <Line x1={0} y1={0} x2={w} y2={0} stroke={stroke} strokeWidth={1.5} opacity={0.55} />
      <Line x1={0} y1={0} x2={0} y2={h} stroke={stroke} strokeWidth={1.5} opacity={0.55} />
      <Line x1={w} y1={0} x2={w} y2={h} stroke={stroke} strokeWidth={1.5} opacity={0.55} />
      <Line x1={0} y1={h} x2={w} y2={h} stroke={stroke} strokeWidth={1.5} opacity={0.55} />
      <Line x1={keyL} y1={h} x2={keyL} y2={keyTop} stroke={stroke} strokeWidth={1.2} opacity={0.45} />
      <Line x1={keyR} y1={h} x2={keyR} y2={keyTop} stroke={stroke} strokeWidth={1.2} opacity={0.45} />
      <Line x1={keyL} y1={keyTop} x2={keyR} y2={keyTop} stroke={stroke} strokeWidth={1.2} opacity={0.45} />
      <Circle
        cx={ftCx}
        cy={keyTop}
        r={ftR}
        stroke={stroke}
        strokeWidth={1}
        fill="none"
        opacity={0.35}
      />
      <Circle cx={ftCx} cy={basketY} r={pct(2.2, w)} fill={stroke} opacity={0.5} />
    </>
  );
}

function OverlayLayer({
  frame,
  w,
  h,
  guideStroke,
}: {
  frame: OverlayKeyframe;
  w: number;
  h: number;
  guideStroke: string;
}) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Marker
          id="arrowHead"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <Polygon points="0,0 6,3 0,6" fill="#38BDF8" />
        </Marker>
      </Defs>
      {frame.courtGuide !== false ? <HalfCourtGuide w={w} h={h} stroke={guideStroke} /> : null}
      {(frame.paths ?? []).map((p) => (
        <Path
          key={p.id}
          d={pointsToPath(p.points, w, h)}
          stroke={p.color ?? '#F59E0B'}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.92}
        />
      ))}
      {(frame.arrows ?? []).map((a) => (
        <Line
          key={a.id}
          x1={pct(a.from.x, w)}
          y1={pct(a.from.y, h)}
          x2={pct(a.to.x, w)}
          y2={pct(a.to.y, h)}
          stroke={a.color ?? '#38BDF8'}
          strokeWidth={2.5}
          markerEnd="url(#arrowHead)"
          opacity={0.95}
        />
      ))}
      {(frame.markers ?? []).map((m) => (
        <Circle
          key={m.id}
          cx={pct(m.at.x, w)}
          cy={pct(m.at.y, h)}
          r={11}
          fill={m.color ?? '#C8102E'}
          opacity={0.92}
        />
      ))}
      {(frame.markers ?? []).map((m) => (
        <SvgText
          key={`${m.id}-label`}
          x={pct(m.at.x, w)}
          y={pct(m.at.y, h) + 4}
          fill="#fff"
          fontSize={11}
          fontWeight="700"
          textAnchor="middle"
        >
          {m.label}
        </SvgText>
      ))}
      {(frame.paths ?? [])
        .filter((p) => p.label && p.points.length > 0)
        .map((p) => {
          const mid = p.points[Math.floor(p.points.length / 2)];
          return (
            <SvgText
              key={`${p.id}-lbl`}
              x={pct(mid.x, w)}
              y={pct(mid.y, h) - 8}
              fill={p.color ?? '#F59E0B'}
              fontSize={10}
              fontWeight="700"
              textAnchor="middle"
            >
              {p.label}
            </SvgText>
          );
        })}
    </Svg>
  );
}

/** Keep HTMLAudioElement currentTime roughly aligned with overlay clock (web). */
function useSyncedWebAudio(src: string | undefined, clock: number, playing: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof Audio === 'undefined') return;
    if (!src) {
      audioRef.current?.pause();
      audioRef.current = null;
      return;
    }
    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = 'auto';
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (Math.abs(audio.currentTime - clock) > 0.35) {
        audio.currentTime = Math.max(0, clock);
      }
      if (playing) {
        void audio.play().catch(() => undefined);
      } else {
        audio.pause();
      }
    } catch {
      /* ignore seek/play failures in stub */
    }
  }, [clock, playing, src]);
}

function PlaybackContainer({
  children,
  size,
  borderColor,
  onLayout,
  clock,
  durationSec,
  trailing,
  voiceoverActive,
  stepLabel,
}: {
  children: ReactNode;
  size: { w: number; h: number };
  borderColor: string;
  onLayout: (e: LayoutChangeEvent) => void;
  clock: number;
  durationSec: number;
  trailing?: ReactNode;
  voiceoverActive: boolean;
  stepLabel: string;
}) {
  const { colors } = useTheme();
  const progress = Math.min(1, durationSec > 0 ? clock / durationSec : 0);

  return (
    <View
      {...rtlContainerProps}
      onLayout={onLayout}
      style={[styles.playerShell, rtlLayout.box, { borderColor }]}
    >
      <Text style={[styles.playerTitle, { color: colors.primary }, rtlText]}>
        {t('plays.drillOverlayPlayerTitle')}
      </Text>
      <Text style={[{ color: colors.muted, marginBottom: 8 }, rtlText]}>
        {t('plays.drillOverlayPlayerHint')}
      </Text>

      <View
        style={[
          styles.stage,
          {
            width: size.w,
            height: size.h,
            backgroundColor: '#0B1220',
            borderColor,
          },
        ]}
      >
        {children}
        <View style={styles.stageBadge}>
          <Text style={styles.stageBadgeText}>{stepLabel}</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.primary },
          ]}
        />
      </View>

      <View style={styles.controls}>
        {trailing ?? (
          <Text style={[rtlText, { color: colors.muted, flex: 1 }]}>
            {t('plays.drillOverlayDemoClock')}
          </Text>
        )}
        <Text style={[rtlText, { color: colors.muted, fontVariant: ['tabular-nums'] }]}>
          {clock.toFixed(1)}s / {durationSec}s
        </Text>
      </View>

      <Text
        style={[
          rtlText,
          {
            marginTop: 6,
            color: voiceoverActive ? colors.success : colors.muted,
            fontWeight: '700',
          },
        ]}
      >
        {voiceoverActive ? t('plays.voiceoverPlaying') : t('plays.voiceoverMuted')}
      </Text>
    </View>
  );
}

function VideoOverlayStage({
  mediaUrl,
  overlay,
  voiceoverUrl,
  size,
  onLayout,
  borderColor,
}: {
  mediaUrl: string;
  overlay: DrillOverlayInsight;
  voiceoverUrl?: string;
  size: { w: number; h: number };
  onLayout: (e: LayoutChangeEvent) => void;
  borderColor: string;
}) {
  const { colors } = useTheme();
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(true);
  const player = useVideoPlayer(mediaUrl, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.05;
    // Keep video audio; voiceover overlays separately when present.
    p.muted = Boolean(voiceoverUrl);
  });

  const timeUpdate = useEvent(player, 'timeUpdate');
  useEffect(() => {
    if (timeUpdate && typeof timeUpdate.currentTime === 'number') {
      setClock(timeUpdate.currentTime);
    }
  }, [timeUpdate]);

  useEffect(() => {
    setPlaying(player.playing);
  }, [player.playing]);

  useSyncedWebAudio(voiceoverUrl, clock, playing);

  const frame = useMemo(() => sampleOverlayAt(overlay, clock), [overlay, clock]);
  const stepIdx = Math.max(
    0,
    overlay.keyframes.findIndex((k, i, arr) => {
      const next = arr[i + 1];
      return clock >= k.t && (!next || clock < next.t);
    }),
  );

  return (
    <PlaybackContainer
      size={size}
      borderColor={borderColor}
      onLayout={onLayout}
      clock={clock}
      durationSec={overlay.durationSec}
      voiceoverActive={Boolean(voiceoverUrl)}
      stepLabel={`שלב ${stepIdx + 1}/${overlay.keyframes.length}`}
      trailing={
        <Pressable
          accessibilityLabel={t('plays.drillOverlayPlayPause')}
          onPress={() => {
            if (player.playing) {
              player.pause();
              setPlaying(false);
            } else {
              player.play();
              setPlaying(true);
            }
          }}
          style={[styles.ctrlBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.ctrlText}>{t('plays.drillOverlayPlayPause')}</Text>
        </Pressable>
      }
    >
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
      />
      <OverlayLayer frame={frame} w={size.w} h={size.h} guideStroke="#E2E8F0" />
    </PlaybackContainer>
  );
}

function PlaceholderOverlayStage({
  overlay,
  voiceoverUrl,
  size,
  onLayout,
  borderColor,
}: {
  overlay: DrillOverlayInsight;
  voiceoverUrl?: string;
  size: { w: number; h: number };
  onLayout: (e: LayoutChangeEvent) => void;
  borderColor: string;
}) {
  const { colors } = useTheme();
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(true);
  const startRef = useRef(Date.now());
  const pausedAtRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    startRef.current = Date.now() - pausedAtRef.current * 1000;
    const id = setInterval(() => {
      const elapsed =
        ((Date.now() - startRef.current) / 1000) % Math.max(1, overlay.durationSec);
      setClock(elapsed);
    }, 50);
    return () => clearInterval(id);
  }, [overlay.durationSec, playing]);

  const effectiveVoice = voiceoverUrl || DEMO_VOICEOVER_DATA_URI;
  useSyncedWebAudio(effectiveVoice, clock, playing);

  const frame = useMemo(() => sampleOverlayAt(overlay, clock), [overlay, clock]);
  const stepIdx = Math.max(
    0,
    overlay.keyframes.findIndex((k, i, arr) => {
      const next = arr[i + 1];
      return clock >= k.t && (!next || clock < next.t);
    }),
  );

  return (
    <PlaybackContainer
      size={size}
      borderColor={borderColor}
      onLayout={onLayout}
      clock={clock}
      durationSec={overlay.durationSec}
      voiceoverActive
      stepLabel={`שלב ${stepIdx + 1}/${overlay.keyframes.length}`}
      trailing={
        <Pressable
          accessibilityLabel={t('plays.drillOverlayPlayPause')}
          onPress={() => {
            if (playing) {
              pausedAtRef.current = clock;
              setPlaying(false);
            } else {
              setPlaying(true);
            }
          }}
          style={[styles.ctrlBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.ctrlText}>{t('plays.drillOverlayPlayPause')}</Text>
        </Pressable>
      }
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#14532D' }]} />
      <OverlayLayer frame={frame} w={size.w} h={size.h} guideStroke="#E2E8F0" />
    </PlaybackContainer>
  );
}

export function DrillOverlayPlayer({
  mediaUrl,
  overlay,
  voiceoverUrl,
  allowPlaceholder = true,
}: Props) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ w: 320, h: 200 });
  const hasVideo = Boolean(mediaUrl?.trim());

  const onLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 40) {
      // Account for player shell horizontal padding (12*2).
      const stageW = Math.max(200, width - 24);
      setSize({ w: stageW, h: Math.round(stageW * 0.62) });
    }
  };

  if (!hasVideo && !allowPlaceholder) {
    return (
      <Text style={[rtlText, { color: colors.muted, marginTop: 8 }]}>
        {t('plays.drillOverlayNeedMedia')}
      </Text>
    );
  }

  if (hasVideo) {
    return (
      <VideoOverlayStage
        mediaUrl={mediaUrl!.trim()}
        overlay={overlay}
        voiceoverUrl={voiceoverUrl}
        size={size}
        onLayout={onLayout}
        borderColor={colors.primary}
      />
    );
  }

  return (
    <PlaceholderOverlayStage
      overlay={overlay}
      voiceoverUrl={voiceoverUrl}
      size={size}
      onLayout={onLayout}
      borderColor={colors.primary}
    />
  );
}

const styles = StyleSheet.create({
  playerShell: {
    marginTop: 12,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#fff',
    alignSelf: 'stretch',
  },
  playerTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 2,
  },
  stage: {
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  stageBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stageBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  progressTrack: {
    marginTop: 10,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  controls: {
    flexDirection: rtlRowDirection,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
    writingDirection: 'rtl',
  },
  ctrlBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  ctrlText: {
    color: '#fff',
    fontWeight: '700',
    ...rtlText,
  },
});
