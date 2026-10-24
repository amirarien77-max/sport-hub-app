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
import { Pressable } from 'react-native-gesture-handler';
import { t } from '@/i18n';
import type { BoardArrow, BoardMarker } from '@/lib/tactical-live';
import { rtlText, useTheme } from '@/theme/ThemeContext';

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
  /** Pending arrow start (percent) while placing second point. */
  arrowDraft?: { x: number; y: number } | null;
  onArrowDraftChange?: (draft: { x: number; y: number } | null) => void;
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
  // Position by midpoint so RN's center-origin rotate keeps endpoints correct.
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
  arrowDraft,
  onArrowDraftChange,
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
  arrowDraft: { x: number; y: number } | null;
  onArrowDraftChange?: (draft: { x: number; y: number } | null) => void;
  fill?: boolean;
}) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ w: 1, h: 1 });
  // Host element ref — measureInWindow exists at runtime (RN 0.88 typing is awkward).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courtRef = useRef<any>(null);
  /** Window origin of the court — prefer pageX/pageY over locationX under RTL/web. */
  const originRef = useRef({ x: 0, y: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setSize({ w: Math.max(1, width), h: Math.max(1, h) });
    const node = courtRef.current as {
      measureInWindow?: (cb: (x: number, y: number) => void) => void;
    } | null;
    node?.measureInWindow?.((x, y) => {
      originRef.current = { x, y };
    });
  };

  const handlePress = (localX: number, localY: number) => {
    if (!editable) {
      onOpenFullscreen?.();
      return;
    }
    // Physical coords inside LTR court — % maps 1:1 under the finger.
    const x = Math.min(100, Math.max(0, Math.round((localX / size.w) * 100)));
    const y = Math.min(100, Math.max(0, Math.round((localY / size.h) * 100)));

    if (tool === 'marker') {
      onAddMarker?.(x, y);
      return;
    }

    if (!arrowDraft) {
      onArrowDraftChange?.({ x, y });
      return;
    }
    onAddArrow?.({
      id: makeArrowId(),
      x1: arrowDraft.x,
      y1: arrowDraft.y,
      x2: x,
      y2: y,
    });
    onArrowDraftChange?.(null);
  };

  return (
    <View
      ref={courtRef}
      // Web rejects StyleSheet `direction`; use DOM `dir` (same pattern as root layout).
      // Native Yoga uses style.direction so absolute left stays physical under app RTL.
      {...(Platform.OS === 'web' ? { dir: 'ltr' as const } : null)}
      style={[
        styles.court,
        fill ? styles.courtFill : { height: height ?? 220 },
        Platform.OS !== 'web' ? styles.courtLtr : null,
      ]}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => false}
      onResponderTerminationRequest={() => false}
    >
      <RNPressable
        onPress={(evt) => {
          const ne = evt.nativeEvent;
          const apply = (ox: number, oy: number) => {
            // Prefer page − window origin (stable under RTL / web). Else locationX/Y.
            const localX =
              typeof ne.pageX === 'number' ? ne.pageX - ox : ne.locationX;
            const localY =
              typeof ne.pageY === 'number' ? ne.pageY - oy : ne.locationY;
            handlePress(localX, localY);
          };
          const node = courtRef.current as {
            measureInWindow?: (cb: (x: number, y: number) => void) => void;
          } | null;
          if (typeof ne.pageX === 'number' && node?.measureInWindow) {
            node.measureInWindow((x, y) => {
              originRef.current = { x, y };
              apply(x, y);
            });
          } else {
            apply(originRef.current.x, originRef.current.y);
          }
        }}
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={t('plays.courtSketch')}
      />
      <View pointerEvents="none" style={styles.courtLabelWrap}>
        <Text style={[styles.courtLabel, rtlText]}>
          {editable
            ? tool === 'arrow'
              ? arrowDraft
                ? t('plays.arrowPickEnd')
                : t('plays.arrowPickStart')
              : t('plays.courtSketch')
            : t('plays.courtHintPlayer')}
        </Text>
      </View>
      <View pointerEvents="none" style={styles.paint} />
      <View pointerEvents="none" style={styles.ftLine} />
      {arrows.map((a) => (
        <BoardArrowView
          key={a.id}
          arrow={a}
          width={size.w}
          height={size.h}
          color="#F4D35E"
          // While placing an arrow, let court taps pass through existing arrows.
          disabled={!editable || tool === 'arrow'}
          onPress={() => onRemoveArrow?.(a.id)}
        />
      ))}
      {arrowDraft ? (
        <View
          pointerEvents="none"
          style={[
            styles.draftDot,
            {
              left: pctToPx(arrowDraft.x, size.w) - 6,
              top: pctToPx(arrowDraft.y, size.h) - 6,
              borderColor: '#F4D35E',
            },
          ]}
        />
      ) : null}
      {markers.map((m, idx) => (
        <RNPressable
          key={`${m.label}-${idx}-${m.x}-${m.y}`}
          // Arrow placement must receive the second tap — markers would steal it.
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
    arrowDraft = null,
    onArrowDraftChange,
  } = props;

  const toolbar = editable && variant === 'fullscreen' ? (
    <View style={styles.toolbar}>
      <View style={styles.toolRow}>
        <Pressable
          onPress={() => {
            onToolChange?.('marker');
            onArrowDraftChange?.(null);
          }}
          style={[
            styles.toolChip,
            { backgroundColor: tool === 'marker' ? colors.primary : '#E2E8F0' },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('plays.toolMarker')}
        >
          <Text style={{ fontWeight: '700', color: tool === 'marker' ? '#fff' : colors.primary }}>
            {t('plays.toolMarker')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onToolChange?.('arrow')}
          style={[
            styles.toolChip,
            { backgroundColor: tool === 'arrow' ? colors.primary : '#E2E8F0' },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('plays.toolArrow')}
        >
          <Text style={{ fontWeight: '700', color: tool === 'arrow' ? '#fff' : colors.primary }}>
            {t('plays.toolArrow')}
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.toolHint, rtlText, { color: colors.muted }]}>
        {tool === 'arrow' ? t('plays.arrowHint') : t('plays.courtHintCoach')}
      </Text>
    </View>
  ) : null;

  const actions =
    editable && variant === 'fullscreen' ? (
      <View style={styles.actionRow}>
        <Pressable
          onPress={onClear}
          style={[styles.actionBtn, { backgroundColor: colors.muted }]}
          accessibilityRole="button"
          accessibilityLabel={t('plays.clearBoard')}
        >
          <Text style={styles.actionBtnText}>{t('plays.clearBoard')}</Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={t('plays.saveBoard')}
        >
          <Text style={styles.actionBtnText}>{t('plays.saveBoard')}</Text>
        </Pressable>
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
        arrowDraft={arrowDraft}
        onArrowDraftChange={onArrowDraftChange}
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
  const [arrowDraft, setArrowDraft] = useState<{ x: number; y: number } | null>(null);

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

  const Btn = Platform.OS === 'web' ? RNPressable : Pressable;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={styles.modalHeader}>
          <Btn
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('plays.courtEditorBack')}
            hitSlop={12}
            style={styles.headerBtn}
          >
            <Text style={{ color: colors.primary, fontWeight: '700', textAlign: 'right' }}>
              ← {t('plays.courtEditorBack')}
            </Text>
          </Btn>
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
          arrowDraft={arrowDraft}
          onArrowDraftChange={setArrowDraft}
          onAddMarker={addMarker}
          onRemoveMarker={removeMarker}
          onAddArrow={(a) => onChangeArrows([...arrows, a].slice(-20))}
          onRemoveArrow={(id) => onChangeArrows(arrows.filter((x) => x.id !== id))}
          onClear={() => {
            onChangeMarkers([]);
            onChangeArrows([]);
            setArrowDraft(null);
            onNextLabel(1);
          }}
          onSave={() => {
            onSave();
            onClose();
          }}
        />
      </View>
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
    marginTop: 8,
    minHeight: 280,
  },
  /** Physical coordinate space — markers/arrows must not flip under app RTL. */
  courtLtr: {
    direction: 'ltr',
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
  draftDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
    zIndex: 3,
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
  },
  toolRow: {
    flexDirection: 'row-reverse',
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
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
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
  },
  modalRoot: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 52 : 24,
    paddingBottom: 16,
  },
  modalHeader: {
    paddingHorizontal: 16,
    gap: 6,
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
