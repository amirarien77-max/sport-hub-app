import { useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { t } from '@/i18n';
import type { BoardArrow, BoardMarker } from '@/lib/tactical-live';
import { rtlRowDirection, rtlText, useTheme } from '@/theme/ThemeContext';

/**
 * Fullscreen editor chrome (tools / save / clear / back) uses RN Pressable.
 * RNGH Pressable often does not receive taps inside React Native Modal.
 */
const ModalPressable = RNPressable;

export type CourtTool = 'marker' | 'arrow';

type CourtBoardProps = {
  markers: BoardMarker[];
  arrows: BoardArrow[];
  editable: boolean;
  /** Compact inline preview height; ignored when variant is fullscreen. */
  height?: number;
  tool?: CourtTool;
  onToolChange?: (tool: CourtTool) => void;
  onAddMarker?: (x: number, y: number) => void;
  onRemoveMarker?: (index: number) => void;
  onAddArrow?: (arrow: BoardArrow) => void;
  onRemoveArrow?: (id: string) => void;
  onClear?: () => void;
  onSave?: () => void;
  /** Opens fullscreen editor when the compact court is tapped (coach). */
  onOpenFullscreen?: () => void;
  variant?: 'inline' | 'fullscreen';
};

/**
 * Court sketch uses a forced LTR coordinate space.
 * App UI stays Hebrew RTL for labels/chrome, but absolute marker/arrow
 * positions must not be mirrored by I18nManager / layout direction.
 */
function pctToPx(pct: number, size: number) {
  return (pct / 100) * size;
}

function makeArrowId() {
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clampPct(n: number) {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Map a touch to court % coords inside the forced-LTR court.
 * Web: page − sync getBoundingClientRect origin (locationX can skew under html dir=rtl).
 * Native: locationX/Y on the LTR court responder, else page − origin.
 */
function touchToPct(
  ne: {
    locationX?: number;
    locationY?: number;
    pageX?: number;
    pageY?: number;
  },
  origin: { x: number; y: number },
  size: { w: number; h: number },
) {
  const hasPage =
    typeof ne.pageX === 'number' &&
    Number.isFinite(ne.pageX) &&
    typeof ne.pageY === 'number' &&
    Number.isFinite(ne.pageY);
  const hasLoc =
    typeof ne.locationX === 'number' &&
    Number.isFinite(ne.locationX) &&
    typeof ne.locationY === 'number' &&
    Number.isFinite(ne.locationY);

  let localX: number;
  let localY: number;
  if (Platform.OS === 'web' && hasPage) {
    localX = (ne.pageX as number) - origin.x;
    localY = (ne.pageY as number) - origin.y;
  } else if (hasLoc) {
    localX = ne.locationX as number;
    localY = ne.locationY as number;
  } else if (hasPage) {
    localX = (ne.pageX as number) - origin.x;
    localY = (ne.pageY as number) - origin.y;
  } else {
    localX = 0;
    localY = 0;
  }
  return {
    x: clampPct((localX / size.w) * 100),
    y: clampPct((localY / size.h) * 100),
    localX,
    localY,
  };
}

/** Sync window origin — web getBoundingClientRect; else last measureInWindow. */
function readOriginSync(
  node: { measureInWindow?: (cb: (x: number, y: number) => void) => void } | null,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  if (Platform.OS === 'web' && node && typeof (node as HTMLElement).getBoundingClientRect === 'function') {
    const r = (node as HTMLElement).getBoundingClientRect();
    return { x: r.left, y: r.top };
  }
  return { ...fallback };
}

/** Half-court line art — baseline at bottom, midcourt at top (matches reference template). */
function HalfCourtDiagram({ line }: { line: string }) {
  // viewBox 0..100 — y grows downward; baseline y=100, half-court y=0.
  const keyL = 32;
  const keyR = 68;
  const keyTop = 55; // free-throw line
  const basketY = 94;
  const backboardY = 96.5;
  const ftCx = 50;
  const ftCy = keyTop;
  const ftR = 12;
  const threeR = 42;
  const threeStraightX = 14;
  // Arc centered near basket: peak at basketY - threeR
  const threePeakY = basketY - threeR;
  const centerR = 12;

  // Free-throw circle: solid outside key (above FT line), dashed inside key.
  const ftSolid = `M ${ftCx - ftR} ${ftCy} A ${ftR} ${ftR} 0 0 1 ${ftCx + ftR} ${ftCy}`;
  const ftDash = `M ${ftCx - ftR} ${ftCy} A ${ftR} ${ftR} 0 0 0 ${ftCx + ftR} ${ftCy}`;

  // Three-point: verticals from baseline, then arc toward midcourt.
  const threePath = [
    `M ${threeStraightX} 100`,
    `L ${threeStraightX} ${threePeakY + 8}`,
    `A ${threeR} ${threeR} 0 0 1 ${100 - threeStraightX} ${threePeakY + 8}`,
    `L ${100 - threeStraightX} 100`,
  ].join(' ');

  // Restricted-area arc under the rim (inside the key).
  const raR = 6;
  const raPath = `M ${50 - raR} ${basketY} A ${raR} ${raR} 0 0 1 ${50 + raR} ${basketY}`;

  // Center / half-court semi-circle hanging into the half from the top line.
  const centerPath = `M ${50 - centerR} 0 A ${centerR} ${centerR} 0 0 0 ${50 + centerR} 0`;

  const tickYs = [88, 80, 72, 64];

  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
    >
      {/* Outer boundary */}
      <Rect x={1.5} y={1.5} width={97} height={97} fill="none" stroke={line} strokeWidth={1.6} />
      {/* Half-court line (top) */}
      <Line x1={1.5} y1={1.5} x2={98.5} y2={1.5} stroke={line} strokeWidth={2} />
      {/* Center semi-circle */}
      <Path d={centerPath} fill="none" stroke={line} strokeWidth={1.4} />
      {/* Key / paint */}
      <Rect
        x={keyL}
        y={keyTop}
        width={keyR - keyL}
        height={100 - keyTop}
        fill="none"
        stroke={line}
        strokeWidth={1.5}
      />
      {/* Free-throw line */}
      <Line x1={keyL} y1={keyTop} x2={keyR} y2={keyTop} stroke={line} strokeWidth={1.6} />
      {/* Lane ticks (blocks) — thicker nearest baseline */}
      {tickYs.map((y, i) => (
        <Line
          key={`tick-l-${y}`}
          x1={keyL - (i === 0 ? 4 : 2.5)}
          y1={y}
          x2={keyL}
          y2={y}
          stroke={line}
          strokeWidth={i === 0 ? 2.2 : 1.3}
        />
      ))}
      {tickYs.map((y, i) => (
        <Line
          key={`tick-r-${y}`}
          x1={keyR}
          y1={y}
          x2={keyR + (i === 0 ? 4 : 2.5)}
          y2={y}
          stroke={line}
          strokeWidth={i === 0 ? 2.2 : 1.3}
        />
      ))}
      {/* FT circle: dashed inside key, solid outside */}
      <Path
        d={ftDash}
        fill="none"
        stroke={line}
        strokeWidth={1.3}
        strokeDasharray="2.5 2"
      />
      <Path d={ftSolid} fill="none" stroke={line} strokeWidth={1.4} />
      {/* Three-point arc */}
      <Path d={threePath} fill="none" stroke={line} strokeWidth={1.5} />
      {/* Restricted arc */}
      <Path d={raPath} fill="none" stroke={line} strokeWidth={1.2} />
      {/* Backboard */}
      <Line
        x1={44}
        y1={backboardY}
        x2={56}
        y2={backboardY}
        stroke={line}
        strokeWidth={2.4}
      />
      {/* Rim */}
      <Circle cx={50} cy={basketY} r={2.4} fill="none" stroke={line} strokeWidth={1.5} />
      {/* Net stub toward midcourt */}
      <Line x1={50} y1={backboardY} x2={50} y2={basketY + 2.4} stroke={line} strokeWidth={1.2} />
    </Svg>
  );
}

function BoardArrowView({
  arrow,
  width,
  height,
  color,
  onPress,
  disabled,
}: {
  arrow: BoardArrow;
  width: number;
  height: number;
  color: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const x1 = pctToPx(arrow.x1, width);
  const y1 = pctToPx(arrow.y1, height);
  const x2 = pctToPx(arrow.x2, width);
  const y2 = pctToPx(arrow.y2, height);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(8, Math.sqrt(dx * dx + dy * dy));
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const hitH = 28;

  return (
    <RNPressable
      disabled={disabled}
      pointerEvents={disabled ? 'none' : 'auto'}
      onPress={onPress}
      style={[
        styles.arrowHit,
        {
          left: midX - length / 2,
          top: midY - hitH / 2,
          width: length,
          height: hitH,
          transform: [{ rotate: `${angle}deg` }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={t('plays.arrowRemove')}
    >
      <View style={[styles.arrowShaft, { backgroundColor: color, width: Math.max(4, length - 12) }]} />
      <View style={[styles.arrowHead, { borderLeftColor: color }]} />
    </RNPressable>
  );
}

type DragDraft = { x1: number; y1: number; x2: number; y2: number };

function CourtSurface({
  markers,
  arrows,
  editable,
  height,
  tool,
  onAddMarker,
  onRemoveMarker,
  onAddArrow,
  onRemoveArrow,
  onOpenFullscreen,
  fill,
}: {
  markers: BoardMarker[];
  arrows: BoardArrow[];
  editable: boolean;
  height: number | undefined;
  tool: CourtTool;
  onAddMarker?: (x: number, y: number) => void;
  onRemoveMarker?: (index: number) => void;
  onAddArrow?: (arrow: BoardArrow) => void;
  onRemoveArrow?: (id: string) => void;
  onOpenFullscreen?: () => void;
  fill?: boolean;
}) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ w: 1, h: 1 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courtRef = useRef<any>(null);
  const originRef = useRef({ x: 0, y: 0 });
  /** Origin snapshot for the active gesture — must stay fixed for start/move/release. */
  const gestureOriginRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number; localX: number; localY: number } | null>(
    null,
  );
  const [dragDraft, setDragDraft] = useState<DragDraft | null>(null);
  const line = 'rgba(232,245,233,0.88)';

  const refreshOrigin = () => {
    const node = courtRef.current as {
      measureInWindow?: (cb: (x: number, y: number) => void) => void;
    } | null;
    node?.measureInWindow?.((x, y) => {
      originRef.current = { x, y };
    });
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setSize({ w: Math.max(1, width), h: Math.max(1, h) });
    refreshOrigin();
  };

  const finishArrow = (draft: DragDraft) => {
    const dx = draft.x2 - draft.x1;
    const dy = draft.y2 - draft.y1;
    const distPct = Math.sqrt(dx * dx + dy * dy);
    // Ignore tiny drags (accidental taps in arrow mode).
    if (distPct < 4) {
      setDragDraft(null);
      return;
    }
    onAddArrow?.({
      id: makeArrowId(),
      x1: draft.x1,
      y1: draft.y1,
      x2: draft.x2,
      y2: draft.y2,
    });
    setDragDraft(null);
  };

  const captureArrowMoves = editable && tool === 'arrow';

  return (
    <View
      ref={courtRef}
      collapsable={false}
      {...(Platform.OS === 'web' ? { dir: 'ltr' as const } : null)}
      style={[
        styles.court,
        fill ? styles.courtFill : { height: height ?? 220 },
        Platform.OS !== 'web' ? ({ direction: 'ltr' } as const) : null,
      ]}
      onLayout={onLayout}
      // Capture before children / parent ScrollView so press→drag→release works.
      onStartShouldSetResponder={() => true}
      onStartShouldSetResponderCapture={() => captureArrowMoves}
      onMoveShouldSetResponder={() => captureArrowMoves}
      onMoveShouldSetResponderCapture={() => captureArrowMoves}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(evt) => {
        const ne = evt.nativeEvent;
        if (!editable) {
          onOpenFullscreen?.();
          return;
        }
        // Sync lock origin for this gesture (never async-refresh mid-drag).
        const origin = readOriginSync(courtRef.current, originRef.current);
        originRef.current = origin;
        gestureOriginRef.current = origin;
        const p = touchToPct(ne, gestureOriginRef.current, size);
        dragStartRef.current = {
          x: p.x,
          y: p.y,
          localX: p.localX,
          localY: p.localY,
        };
        if (tool === 'arrow') {
          setDragDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
        }
      }}
      onResponderMove={(evt) => {
        if (!editable || tool !== 'arrow' || !dragStartRef.current) return;
        const p = touchToPct(evt.nativeEvent, gestureOriginRef.current, size);
        setDragDraft({
          x1: dragStartRef.current.x,
          y1: dragStartRef.current.y,
          x2: p.x,
          y2: p.y,
        });
      }}
      onResponderRelease={(evt) => {
        const start = dragStartRef.current;
        dragStartRef.current = null;
        if (!editable) return;

        if (tool === 'arrow') {
          const p = touchToPct(evt.nativeEvent, gestureOriginRef.current, size);
          const draft: DragDraft = start
            ? { x1: start.x, y1: start.y, x2: p.x, y2: p.y }
            : dragDraft ?? { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
          finishArrow(draft);
          return;
        }

        // Marker: treat as tap if finger barely moved.
        if (!start) return;
        const p = touchToPct(evt.nativeEvent, gestureOriginRef.current, size);
        const moved =
          Math.abs(p.localX - start.localX) + Math.abs(p.localY - start.localY);
        if (moved < 14) {
          onAddMarker?.(start.x, start.y);
        }
      }}
      onResponderTerminate={() => {
        dragStartRef.current = null;
        setDragDraft(null);
      }}
    >
      <HalfCourtDiagram line={line} />
      <View pointerEvents="none" style={styles.courtLabelWrap}>
        <Text style={[styles.courtLabel, rtlText]}>
          {editable
            ? tool === 'arrow'
              ? dragDraft
                ? t('plays.arrowDragRelease')
                : t('plays.arrowDragStart')
              : t('plays.courtSketch')
            : t('plays.courtHintPlayer')}
        </Text>
      </View>
      {arrows.map((a) => (
        <BoardArrowView
          key={a.id}
          arrow={a}
          width={size.w}
          height={size.h}
          color="#F4D35E"
          disabled={!editable || tool === 'arrow'}
          onPress={() => onRemoveArrow?.(a.id)}
        />
      ))}
      {dragDraft ? (
        <BoardArrowView
          arrow={{
            id: 'draft',
            x1: dragDraft.x1,
            y1: dragDraft.y1,
            x2: dragDraft.x2,
            y2: dragDraft.y2,
          }}
          width={size.w}
          height={size.h}
          color="rgba(244,211,94,0.85)"
          disabled
        />
      ) : null}
      {markers.map((m, idx) => (
        <RNPressable
          key={`${m.label}-${idx}-${m.x}-${m.y}`}
          disabled={!editable || tool === 'arrow'}
          pointerEvents={!editable || tool === 'arrow' ? 'none' : 'auto'}
          onPress={() => onRemoveMarker?.(idx)}
          style={[
            styles.marker,
            {
              left: pctToPx(m.x, size.w) - 18,
              top: pctToPx(m.y, size.h) - 18,
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
  );
}

export function CourtBoard(props: CourtBoardProps) {
  const { colors } = useTheme();
  const {
    markers,
    arrows,
    editable,
    height = 240,
    tool = 'marker',
    onToolChange,
    onAddMarker,
    onRemoveMarker,
    onAddArrow,
    onRemoveArrow,
    onClear,
    onSave,
    onOpenFullscreen,
    variant = 'inline',
  } = props;

  const toolbar = editable && variant === 'fullscreen' ? (
    <View style={styles.toolbar}>
      <View style={[styles.toolRow, { flexDirection: rtlRowDirection }]}>
        <ModalPressable
          onPress={() => onToolChange?.('marker')}
          style={[
            styles.toolChip,
            { backgroundColor: tool === 'marker' ? colors.primary : '#E2E8F0' },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('plays.toolMarker')}
        >
          <Text
            style={[
              { fontWeight: '700', color: tool === 'marker' ? '#fff' : colors.primary },
              rtlText,
            ]}
          >
            {t('plays.toolMarker')}
          </Text>
        </ModalPressable>
        <ModalPressable
          onPress={() => onToolChange?.('arrow')}
          style={[
            styles.toolChip,
            { backgroundColor: tool === 'arrow' ? colors.primary : '#E2E8F0' },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('plays.toolArrow')}
        >
          <Text
            style={[
              { fontWeight: '700', color: tool === 'arrow' ? '#fff' : colors.primary },
              rtlText,
            ]}
          >
            {t('plays.toolArrow')}
          </Text>
        </ModalPressable>
      </View>
      <Text style={[styles.toolHint, rtlText, { color: colors.muted }]}>
        {tool === 'arrow' ? t('plays.arrowHint') : t('plays.courtHintCoach')}
      </Text>
    </View>
  ) : null;

  const actions =
    editable && variant === 'fullscreen' ? (
      /**
       * Under app RTL (`dir=rtl` + plain `row`), the first child packs to the
       * physical right. Put Save first so primary CTA stays right; Clear left.
       * (PR #20 removed web `row-reverse` double-flip that previously masked DOM order.)
       */
      <View style={[styles.actionRow, { flexDirection: rtlRowDirection }]}>
        <ModalPressable
          onPress={onSave}
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={t('plays.saveBoard')}
        >
          <Text style={styles.actionBtnText}>{t('plays.saveBoard')}</Text>
        </ModalPressable>
        <ModalPressable
          onPress={onClear}
          style={[styles.actionBtn, { backgroundColor: colors.muted }]}
          accessibilityRole="button"
          accessibilityLabel={t('plays.clearBoard')}
        >
          <Text style={styles.actionBtnText}>{t('plays.clearBoard')}</Text>
        </ModalPressable>
      </View>
    ) : null;

  return (
    <View style={variant === 'fullscreen' ? styles.fullscreenBody : undefined}>
      {toolbar}
      <CourtSurface
        markers={markers}
        arrows={arrows}
        editable={editable}
        height={height}
        tool={tool}
        onAddMarker={onAddMarker}
        onRemoveMarker={onRemoveMarker}
        onAddArrow={onAddArrow}
        onRemoveArrow={onRemoveArrow}
        onOpenFullscreen={onOpenFullscreen}
        fill={variant === 'fullscreen'}
      />
      {actions}
    </View>
  );
}

type CourtEditorModalProps = {
  visible: boolean;
  markers: BoardMarker[];
  arrows: BoardArrow[];
  editable: boolean;
  onClose: () => void;
  onChangeMarkers: (markers: BoardMarker[]) => void;
  onChangeArrows: (arrows: BoardArrow[]) => void;
  onSave: () => void;
  nextLabel: number;
  onNextLabel: (n: number) => void;
};

function nextMarkerLabel(markers: BoardMarker[]): number {
  const used = markers
    .map((m) => Number.parseInt(m.label, 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  for (let n = 1; n <= 5; n += 1) {
    if (!used.includes(n)) return n;
  }
  return (used[used.length - 1] % 5) + 1;
}

export function CourtEditorModal({
  visible,
  markers,
  arrows,
  editable,
  onClose,
  onChangeMarkers,
  onChangeArrows,
  onSave,
  nextLabel,
  onNextLabel,
}: CourtEditorModalProps) {
  const { colors } = useTheme();
  const { height: winH } = useWindowDimensions();
  const [tool, setTool] = useState<CourtTool>('marker');

  const courtHeight = useMemo(() => Math.max(320, Math.round(winH * 0.72)), [winH]);

  const addMarker = (x: number, y: number) => {
    const label = String(nextLabel);
    const next = [...markers, { x, y, label }].slice(-12);
    onChangeMarkers(next);
    onNextLabel(nextMarkerLabel(next));
  };

  const removeMarker = (idx: number) => {
    const next = markers.filter((_, i) => i !== idx);
    onChangeMarkers(next);
    onNextLabel(nextMarkerLabel(next));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {/* Modal mounts outside root GH tree — re-wrap so touches work on native. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <ModalPressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('plays.courtEditorBack')}
              hitSlop={12}
              style={styles.headerBtn}
            >
              <Text style={[{ color: colors.primary, fontWeight: '700' }, rtlText]}>
                ← {t('plays.courtEditorBack')}
              </Text>
            </ModalPressable>
            <Text style={[styles.modalTitle, rtlText, { color: colors.primary }]}>
              {t('plays.courtEditorTitle')}
            </Text>
          </View>
          <CourtBoard
            variant="fullscreen"
            height={courtHeight}
            markers={markers}
            arrows={arrows}
            editable={editable}
            tool={tool}
            onToolChange={setTool}
            onAddMarker={addMarker}
            onRemoveMarker={removeMarker}
            onAddArrow={(a) => onChangeArrows([...arrows, a].slice(-20))}
            onRemoveArrow={(id) => onChangeArrows(arrows.filter((x) => x.id !== id))}
            onClear={() => {
              onChangeMarkers([]);
              onChangeArrows([]);
              onNextLabel(1);
            }}
            onSave={() => {
              onSave();
              onClose();
            }}
          />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  court: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#1B4332',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  courtFill: {
    flex: 1,
    flexShrink: 1,
    marginTop: 8,
    minHeight: 200,
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
  arrowHit: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'flex-start',
    zIndex: 2,
  },
  arrowShaft: {
    height: 5,
    borderRadius: 2,
  },
  arrowHead: {
    position: 'absolute',
    right: 0,
    top: 7,
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 14,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  toolbar: {
    marginTop: 4,
    gap: 8,
    flexShrink: 0,
  },
  toolRow: {
    flexWrap: 'wrap',
    gap: 8,
  },
  toolChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  toolHint: {
    fontSize: 13,
  },
  actionRow: {
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
    flexShrink: 0,
    zIndex: 5,
  },
  actionBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  fullscreenBody: {
    flex: 1,
    paddingHorizontal: 12,
    minHeight: 0,
  },
  modalRoot: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 52 : 24,
    paddingBottom: 16,
    minHeight: 0,
  },
  modalHeader: {
    paddingHorizontal: 16,
    gap: 6,
    flexShrink: 0,
  },
  headerBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
});
