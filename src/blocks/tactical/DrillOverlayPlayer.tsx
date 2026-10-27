/**
 * נגן וידאו תרגיל עם שכבת SVG מסונכרנת לזמן הניגון.
 * קואורדינטות 0–100 (LTR) כמו CourtBoard — בלי שיקוף RTL על המסלולים.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Circle, Defs, Line, Marker, Path, Polygon, Text as SvgText } from 'react-native-svg';
import {
  sampleOverlayAt,
  type DrillOverlayInsight,
  type OverlayKeyframe,
} from '@/lib/drill-overlay';
import { t } from '@/i18n';
import { rtlRowDirection, rtlText, useTheme } from '@/theme/ThemeContext';

type Props = {
  mediaUrl?: string;
  overlay: DrillOverlayInsight;
  /** When true, show court guide even without video (demo / image-only). */
  allowPlaceholder?: boolean;
};

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

function StageShell({
  children,
  size,
  borderColor,
  onLayout,
  clock,
  durationSec,
  trailing,
}: {
  children: ReactNode;
  size: { w: number; h: number };
  borderColor: string;
  onLayout: (e: LayoutChangeEvent) => void;
  clock: number;
  durationSec: number;
  trailing?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View onLayout={onLayout} style={{ marginTop: 10 }}>
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
    </View>
  );
}

function VideoOverlayStage({
  mediaUrl,
  overlay,
  size,
  onLayout,
  borderColor,
}: {
  mediaUrl: string;
  overlay: DrillOverlayInsight;
  size: { w: number; h: number };
  onLayout: (e: LayoutChangeEvent) => void;
  borderColor: string;
}) {
  const { colors } = useTheme();
  const [clock, setClock] = useState(0);
  const player = useVideoPlayer(mediaUrl, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.05;
    p.muted = true;
  });

  const timeUpdate = useEvent(player, 'timeUpdate');
  useEffect(() => {
    if (timeUpdate && typeof timeUpdate.currentTime === 'number') {
      setClock(timeUpdate.currentTime);
    }
  }, [timeUpdate]);

  const frame = useMemo(() => sampleOverlayAt(overlay, clock), [overlay, clock]);

  return (
    <StageShell
      size={size}
      borderColor={borderColor}
      onLayout={onLayout}
      clock={clock}
      durationSec={overlay.durationSec}
      trailing={
        <Pressable
          accessibilityLabel={t('plays.drillOverlayPlayPause')}
          onPress={() => {
            if (player.playing) player.pause();
            else player.play();
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
    </StageShell>
  );
}

function PlaceholderOverlayStage({
  overlay,
  size,
  onLayout,
  borderColor,
}: {
  overlay: DrillOverlayInsight;
  size: { w: number; h: number };
  onLayout: (e: LayoutChangeEvent) => void;
  borderColor: string;
}) {
  const [clock, setClock] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = ((Date.now() - start) / 1000) % Math.max(1, overlay.durationSec);
      setClock(elapsed);
    }, 50);
    return () => clearInterval(id);
  }, [overlay.durationSec]);

  const frame = useMemo(() => sampleOverlayAt(overlay, clock), [overlay, clock]);

  return (
    <StageShell
      size={size}
      borderColor={borderColor}
      onLayout={onLayout}
      clock={clock}
      durationSec={overlay.durationSec}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#14532D' }]} />
      <OverlayLayer frame={frame} w={size.w} h={size.h} guideStroke="#E2E8F0" />
    </StageShell>
  );
}

export function DrillOverlayPlayer({ mediaUrl, overlay, allowPlaceholder = true }: Props) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ w: 320, h: 200 });
  const hasVideo = Boolean(mediaUrl?.trim());

  const onLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0) {
      setSize({ w: width, h: Math.round(width * 0.62) });
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
        size={size}
        onLayout={onLayout}
        borderColor={colors.primary}
      />
    );
  }

  return (
    <PlaceholderOverlayStage
      overlay={overlay}
      size={size}
      onLayout={onLayout}
      borderColor={colors.primary}
    />
  );
}

const styles = StyleSheet.create({
  stage: {
    borderWidth: 1.5,
    borderRadius: 10,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  controls: {
    flexDirection: rtlRowDirection,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
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
