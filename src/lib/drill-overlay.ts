/**
 * AI Drill Overlay — שרטוט מסלולים/חצים על וידאו תרגיל לאורך כל הקליפ.
 *
 * זרימה: Edge Function `drill-overlay` (OPENAI_API_KEY בשרת) → אם חסר מפתח /
 * פונקציה / רשת → `buildOfflineDrillOverlay` בעברית (אותו shape). לא חוסמים
 * את מסך התרגילים בגלל AI; דמו תמיד זמין.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TacticalPlay } from '@/types';

export type DrillOverlayMode = 'openai' | 'offline_stub';

export type OverlayPoint = { x: number; y: number };

export type OverlayPath = {
  id: string;
  points: OverlayPoint[];
  color?: string;
  label?: string;
};

export type OverlayArrow = {
  id: string;
  from: OverlayPoint;
  to: OverlayPoint;
  color?: string;
  label?: string;
};

export type OverlayMarker = {
  id: string;
  at: OverlayPoint;
  label: string;
  color?: string;
};

export type OverlayKeyframe = {
  t: number;
  paths?: OverlayPath[];
  arrows?: OverlayArrow[];
  markers?: OverlayMarker[];
  courtGuide?: boolean;
};

export type DrillOverlayInsight = {
  mode: DrillOverlayMode;
  playTitle: string;
  summary: string;
  durationSec: number;
  keyframes: OverlayKeyframe[];
  generatedAt: string;
};

export type DrillOverlayRequest = {
  play: Pick<TacticalPlay, 'id' | 'title' | 'boardJson' | 'mediaUrl'>;
  durationSec?: number;
};

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

function clampDuration(n: number): number {
  return Math.min(120, Math.max(4, Math.round(n)));
}

function parseBoard(boardJson?: string) {
  if (!boardJson?.trim()) return { markers: [] as { x: number; y: number; label: string }[], arrows: [] as { x1: number; y1: number; x2: number; y2: number }[] };
  try {
    const o = JSON.parse(boardJson) as {
      markers?: { x: number; y: number; label: string }[];
      arrows?: { x1: number; y1: number; x2: number; y2: number }[];
    };
    return {
      markers: Array.isArray(o.markers) ? o.markers.slice(0, 5) : [],
      arrows: Array.isArray(o.arrows) ? o.arrows.slice(0, 5) : [],
    };
  } catch {
    return { markers: [], arrows: [] };
  }
}

/** Deterministic Hebrew offline / demo overlay across the full drill duration. */
export function buildOfflineDrillOverlay(input: DrillOverlayRequest): DrillOverlayInsight {
  const d = clampDuration(input.durationSec ?? 12);
  const board = parseBoard(input.play.boardJson);
  const m0 = board.markers[0] ?? { x: 28, y: 72, label: '1' };
  const m1 = board.markers[1] ?? { x: 50, y: 55, label: '2' };
  const m2 = board.markers[2] ?? { x: 72, y: 72, label: '3' };
  const t1 = Math.round(d * 0.25 * 10) / 10;
  const t2 = Math.round(d * 0.55 * 10) / 10;
  const t3 = Math.round(d * 0.85 * 10) / 10;

  const pathA: OverlayPoint[] = [
    { x: m0.x, y: m0.y },
    { x: clampPct(m0.x + 8), y: clampPct(m0.y - 18) },
    { x: clampPct(m1.x - 6), y: clampPct(m1.y + 4) },
    { x: m1.x, y: m1.y },
  ];
  const pathB: OverlayPoint[] = [
    { x: m2.x, y: m2.y },
    { x: clampPct(m2.x - 10), y: clampPct(m2.y - 12) },
    { x: 58, y: 42 },
    { x: 50, y: 28 },
  ];

  const boardArrow = board.arrows[0];

  const keyframes: OverlayKeyframe[] = [
    {
      t: 0,
      courtGuide: true,
      markers: [
        { id: 'm1', at: { x: m0.x, y: m0.y }, label: m0.label || '1', color: '#C8102E' },
        { id: 'm2', at: { x: m1.x, y: m1.y }, label: m1.label || '2', color: '#C8102E' },
        { id: 'm3', at: { x: m2.x, y: m2.y }, label: m2.label || '3', color: '#C8102E' },
      ],
      paths: [{ id: 'cut1', points: pathA.slice(0, 2), color: '#F59E0B', label: 'חיתוך' }],
      arrows: boardArrow
        ? [
            {
              id: 'board-a0',
              from: { x: boardArrow.x1, y: boardArrow.y1 },
              to: { x: boardArrow.x2, y: boardArrow.y2 },
              color: '#38BDF8',
              label: 'מסירה',
            },
          ]
        : [
            {
              id: 'pass1',
              from: { x: m0.x, y: m0.y },
              to: { x: m1.x, y: m1.y },
              color: '#38BDF8',
              label: 'מסירה',
            },
          ],
    },
    {
      t: t1,
      courtGuide: true,
      markers: [
        {
          id: 'm1',
          at: { x: clampPct(m0.x + 6), y: clampPct(m0.y - 14) },
          label: m0.label || '1',
          color: '#C8102E',
        },
        { id: 'm2', at: { x: m1.x, y: m1.y }, label: m1.label || '2', color: '#C8102E' },
        {
          id: 'm3',
          at: { x: clampPct(m2.x - 6), y: clampPct(m2.y - 8) },
          label: m2.label || '3',
          color: '#C8102E',
        },
      ],
      paths: [
        { id: 'cut1', points: pathA.slice(0, 3), color: '#F59E0B', label: 'חיתוך' },
        { id: 'cut2', points: pathB.slice(0, 2), color: '#22C55E', label: 'חלש' },
      ],
      arrows: [
        {
          id: 'pass1',
          from: { x: clampPct(m0.x + 6), y: clampPct(m0.y - 14) },
          to: { x: clampPct(m1.x - 4), y: clampPct(m1.y + 2) },
          color: '#38BDF8',
          label: 'מסירה',
        },
      ],
    },
    {
      t: t2,
      courtGuide: true,
      markers: [
        {
          id: 'm1',
          at: { x: clampPct(m1.x - 4), y: clampPct(m1.y + 2) },
          label: m0.label || '1',
          color: '#C8102E',
        },
        { id: 'm2', at: { x: 54, y: 40 }, label: m1.label || '2', color: '#C8102E' },
        { id: 'm3', at: { x: 58, y: 42 }, label: m2.label || '3', color: '#C8102E' },
      ],
      paths: [
        { id: 'cut1', points: pathA, color: '#F59E0B', label: 'חיתוך' },
        { id: 'cut2', points: pathB.slice(0, 3), color: '#22C55E', label: 'חלש' },
      ],
      arrows: [
        { id: 'screen', from: { x: 54, y: 40 }, to: { x: 48, y: 30 }, color: '#A855F7', label: 'מסך' },
      ],
    },
    {
      t: t3,
      courtGuide: true,
      markers: [
        { id: 'm1', at: { x: m1.x, y: m1.y }, label: m0.label || '1', color: '#C8102E' },
        { id: 'm2', at: { x: 50, y: 28 }, label: m1.label || '2', color: '#C8102E' },
        { id: 'm3', at: { x: 50, y: 28 }, label: m2.label || '3', color: '#C8102E' },
      ],
      paths: [
        { id: 'cut1', points: pathA, color: '#F59E0B', label: 'חיתוך' },
        { id: 'cut2', points: pathB, color: '#22C55E', label: 'חלש → סל' },
      ],
      arrows: [
        { id: 'finish', from: { x: 50, y: 36 }, to: { x: 50, y: 92 }, color: '#F59E0B', label: 'סיום' },
      ],
    },
    {
      t: d,
      courtGuide: true,
      markers: [
        { id: 'm1', at: { x: m1.x, y: m1.y }, label: m0.label || '1', color: '#C8102E' },
        { id: 'm2', at: { x: 50, y: 22 }, label: m1.label || '2', color: '#C8102E' },
        { id: 'm3', at: { x: 50, y: 90 }, label: 'סל', color: '#22C55E' },
      ],
      paths: [
        { id: 'cut1', points: pathA, color: '#F59E0B', label: 'חיתוך' },
        { id: 'cut2', points: pathB, color: '#22C55E', label: 'חלש → סל' },
      ],
      arrows: [
        { id: 'finish', from: { x: 50, y: 28 }, to: { x: 50, y: 92 }, color: '#F59E0B', label: 'סיום' },
      ],
    },
  ];

  return {
    mode: 'offline_stub',
    playTitle: input.play.title,
    summary: `מצב אופליין (ללא מפתח OpenAI / ללא Edge Function): שרטוט דמו ל«${input.play.title}» לאורך כל ${d} השניות — מסלולים וחצים מסונכרנים לנגן.`,
    durationSec: d,
    keyframes,
    generatedAt: new Date().toISOString(),
  };
}

function asPoint(raw: unknown): OverlayPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.x !== 'number' || typeof o.y !== 'number') return null;
  return { x: clampPct(o.x), y: clampPct(o.y) };
}

export function parseDrillOverlayPayload(
  raw: unknown,
  fallbackTitle: string,
  mode: DrillOverlayMode,
): DrillOverlayInsight | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
  const durationSec =
    typeof o.durationSec === 'number' && Number.isFinite(o.durationSec)
      ? clampDuration(o.durationSec)
      : 12;
  const framesRaw = Array.isArray(o.keyframes) ? o.keyframes : [];
  const keyframes: OverlayKeyframe[] = [];

  for (const fr of framesRaw.slice(0, 40)) {
    if (!fr || typeof fr !== 'object') continue;
    const f = fr as Record<string, unknown>;
    const t = typeof f.t === 'number' && Number.isFinite(f.t) ? Math.max(0, f.t) : 0;
    const paths: OverlayPath[] = [];
    for (const [i, p] of (Array.isArray(f.paths) ? f.paths : []).entries()) {
      if (!p || typeof p !== 'object') continue;
      const row = p as Record<string, unknown>;
      const points = (Array.isArray(row.points) ? row.points : [])
        .map(asPoint)
        .filter((x): x is OverlayPoint => Boolean(x))
        .slice(0, 24);
      if (points.length < 2) continue;
      paths.push({
        id: typeof row.id === 'string' ? row.id : `p${i}`,
        points,
        color: typeof row.color === 'string' ? row.color : '#F59E0B',
        label: typeof row.label === 'string' ? row.label : undefined,
      });
      if (paths.length >= 8) break;
    }

    const arrows: OverlayArrow[] = [];
    for (const [i, a] of (Array.isArray(f.arrows) ? f.arrows : []).entries()) {
      if (!a || typeof a !== 'object') continue;
      const row = a as Record<string, unknown>;
      const from = asPoint(row.from);
      const to = asPoint(row.to);
      if (!from || !to) continue;
      arrows.push({
        id: typeof row.id === 'string' ? row.id : `a${i}`,
        from,
        to,
        color: typeof row.color === 'string' ? row.color : '#38BDF8',
        label: typeof row.label === 'string' ? row.label : undefined,
      });
      if (arrows.length >= 12) break;
    }

    const markers: OverlayMarker[] = [];
    for (const [i, m] of (Array.isArray(f.markers) ? f.markers : []).entries()) {
      if (!m || typeof m !== 'object') continue;
      const row = m as Record<string, unknown>;
      const at = asPoint(row.at);
      if (!at || typeof row.label !== 'string') continue;
      markers.push({
        id: typeof row.id === 'string' ? row.id : `m${i}`,
        at,
        label: row.label.slice(0, 4),
        color: typeof row.color === 'string' ? row.color : '#C8102E',
      });
      if (markers.length >= 10) break;
    }

    keyframes.push({
      t: Math.min(durationSec, t),
      courtGuide: f.courtGuide !== false,
      paths,
      arrows,
      markers,
    });
  }

  keyframes.sort((a, b) => a.t - b.t);
  if (!summary || keyframes.length < 2) return null;

  return {
    mode,
    playTitle: typeof o.playTitle === 'string' ? o.playTitle : fallbackTitle,
    summary,
    durationSec,
    keyframes,
    generatedAt:
      typeof o.generatedAt === 'string' ? o.generatedAt : new Date().toISOString(),
  };
}

/**
 * Prefer Supabase Edge Function `drill-overlay` (server-side OPENAI_API_KEY).
 * On missing function / missing key / network error → Hebrew offline stub.
 */
export async function generateDrillOverlay(
  client: SupabaseClient | null,
  input: DrillOverlayRequest,
): Promise<DrillOverlayInsight> {
  if (!client) {
    return buildOfflineDrillOverlay(input);
  }

  try {
    const { data, error } = await client.functions.invoke('drill-overlay', {
      body: {
        playId: input.play.id,
        playTitle: input.play.title,
        boardJson: input.play.boardJson ?? null,
        mediaUrl: input.play.mediaUrl ?? null,
        durationSec: input.durationSec ?? 12,
      },
    });

    if (error) {
      console.warn('drill-overlay invoke error', error.message);
      return buildOfflineDrillOverlay(input);
    }

    const payload = (data as { overlay?: unknown; mode?: string } | null) ?? null;
    if (payload?.mode === 'offline_stub' || payload?.mode === 'openai') {
      const parsed = parseDrillOverlayPayload(
        payload.overlay ?? payload,
        input.play.title,
        payload.mode,
      );
      if (parsed) return parsed;
    }

    const direct = parseDrillOverlayPayload(data, input.play.title, 'openai');
    if (direct) return direct;

    return buildOfflineDrillOverlay(input);
  } catch (err) {
    console.warn('drill-overlay failed', err instanceof Error ? err.message : err);
    return buildOfflineDrillOverlay(input);
  }
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpPoint(a: OverlayPoint, b: OverlayPoint, u: number): OverlayPoint {
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) };
}

/** Interpolate overlay geometry between surrounding keyframes for smooth playback. */
export function sampleOverlayAt(
  insight: DrillOverlayInsight,
  timeSec: number,
): OverlayKeyframe {
  const frames = insight.keyframes;
  if (frames.length === 0) {
    return { t: timeSec, courtGuide: true, paths: [], arrows: [], markers: [] };
  }
  if (timeSec <= frames[0].t) return frames[0];
  const last = frames[frames.length - 1];
  if (timeSec >= last.t) return last;

  let i = 0;
  while (i < frames.length - 1 && frames[i + 1].t < timeSec) i += 1;
  const a = frames[i];
  const b = frames[i + 1];
  const span = Math.max(0.001, b.t - a.t);
  const u = Math.min(1, Math.max(0, (timeSec - a.t) / span));

  const pathIds = new Set([
    ...(a.paths ?? []).map((p) => p.id),
    ...(b.paths ?? []).map((p) => p.id),
  ]);
  const paths: OverlayPath[] = [];
  for (const id of pathIds) {
    const pa = (a.paths ?? []).find((p) => p.id === id);
    const pb = (b.paths ?? []).find((p) => p.id === id) ?? pa;
    if (!pa && !pb) continue;
    const src = pb ?? pa!;
    const ptsA = pa?.points ?? src.points;
    const ptsB = pb?.points ?? src.points;
    const len = Math.max(ptsA.length, ptsB.length);
    const points: OverlayPoint[] = [];
    for (let k = 0; k < len; k += 1) {
      const p0 = ptsA[Math.min(k, ptsA.length - 1)];
      const p1 = ptsB[Math.min(k, ptsB.length - 1)];
      points.push(lerpPoint(p0, p1, u));
    }
    paths.push({
      id,
      points,
      color: pb?.color ?? pa?.color,
      label: pb?.label ?? pa?.label,
    });
  }

  const arrowIds = new Set([
    ...(a.arrows ?? []).map((ar) => ar.id),
    ...(b.arrows ?? []).map((ar) => ar.id),
  ]);
  const arrows: OverlayArrow[] = [];
  for (const id of arrowIds) {
    const aa = (a.arrows ?? []).find((ar) => ar.id === id);
    const bb = (b.arrows ?? []).find((ar) => ar.id === id) ?? aa;
    if (!aa && !bb) continue;
    const from = lerpPoint(aa?.from ?? bb!.from, bb?.from ?? aa!.from, u);
    const to = lerpPoint(aa?.to ?? bb!.to, bb?.to ?? aa!.to, u);
    arrows.push({
      id,
      from,
      to,
      color: bb?.color ?? aa?.color,
      label: bb?.label ?? aa?.label,
    });
  }

  const markerIds = new Set([
    ...(a.markers ?? []).map((m) => m.id),
    ...(b.markers ?? []).map((m) => m.id),
  ]);
  const markers: OverlayMarker[] = [];
  for (const id of markerIds) {
    const ma = (a.markers ?? []).find((m) => m.id === id);
    const mb = (b.markers ?? []).find((m) => m.id === id) ?? ma;
    if (!ma && !mb) continue;
    markers.push({
      id,
      at: lerpPoint(ma?.at ?? mb!.at, mb?.at ?? ma!.at, u),
      label: mb?.label ?? ma!.label,
      color: mb?.color ?? ma?.color,
    });
  }

  return {
    t: timeSec,
    courtGuide: b.courtGuide !== false && a.courtGuide !== false,
    paths,
    arrows,
    markers,
  };
}
