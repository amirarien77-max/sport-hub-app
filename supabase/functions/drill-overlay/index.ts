/**
 * Drill Overlay Edge Function — מסלולי שחקנים / חצים מתוזמנים על וידאו תרגיל.
 * Secret: OPENAI_API_KEY (Dashboard → Edge Functions → Secrets).
 * בלי מפתח / שגיאת OpenAI / JSON פגום → offline_stub בעברית (אותו shape כמו בקליינט).
 * לא מקודדים מחדש וידאו בשרת — מחזירים keyframes מנורמלים (0–100) לציור בנגן.
 * אחרי הצלחה: best-effort update ל־tactical_plays.drill_overlay_json.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = {
  playId?: string;
  playTitle?: string;
  boardJson?: string | null;
  mediaUrl?: string | null;
  durationSec?: number;
};

type Point = { x: number; y: number };

type OverlayKeyframe = {
  t: number;
  paths?: { id: string; points: Point[]; color?: string; label?: string }[];
  arrows?: { id: string; from: Point; to: Point; color?: string; label?: string }[];
  markers?: { id: string; at: Point; label: string; color?: string }[];
  courtGuide?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'missing_auth' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: 'unauthorized' }, 401);
    }

    const body = (await req.json()) as Body;
    const playTitle = (body.playTitle ?? 'תרגיל').trim() || 'תרגיל';
    const durationSec = clampDuration(body.durationSec);
    const openaiKey = Deno.env.get('OPENAI_API_KEY')?.trim();

    if (!openaiKey) {
      const overlay = offlineOverlay(playTitle, durationSec, body.boardJson);
      return json({ mode: 'offline_stub', overlay });
    }

    const system = `אתה עוזר טקטי לכדורסל נוער. קיבלת תיאור תרגיל (כותרת + לוח סימונים).
החזר JSON בלבד בעברית במבנה:
{"summary":"string","durationSec":number,"keyframes":[{"t":number,"courtGuide":true,"paths":[{"id":"p1","points":[{"x":0-100,"y":0-100}],"label":"string","color":"#hex"}],"arrows":[{"id":"a1","from":{"x":n,"y":n},"to":{"x":n,"y":n},"label":"string","color":"#hex"}],"markers":[{"id":"m1","at":{"x":n,"y":n},"label":"1","color":"#hex"}]}]}
כללים:
- t בשניות מ־0 עד durationSec (לפחות 4 keyframes לאורך כל התרגיל).
- קואורדינטות באחוזים 0–100 (מגרש חצי: baseline למטה y≈95, midcourt y≈5).
- צייר מסלולי תנועה (paths) וחצים (arrows) שמתפתחים לאורך הזמן — לא פריים בודד.
- בלי markdown. קצר ומעשי לאימון.`;

    const userPrompt = JSON.stringify({
      playTitle,
      durationSec,
      boardJson: body.boardJson ?? null,
      mediaUrl: body.mediaUrl ?? null,
      note: 'אין גישה לפריימים גולמיים כאן — בנה overlay סביר לפי כותרת ולוח לאורך כל משך הווידאו.',
    });

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('openai error', aiRes.status, errText.slice(0, 400));
      const overlay = offlineOverlay(playTitle, durationSec, body.boardJson);
      return json({ mode: 'offline_stub', overlay, openaiError: true });
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      const overlay = offlineOverlay(playTitle, durationSec, body.boardJson);
      return json({ mode: 'offline_stub', overlay, parseError: true });
    }

    const overlay = normalizeOverlay(parsed, playTitle, durationSec, 'openai');
    if (!overlay || overlay.keyframes.length < 2) {
      return json({
        mode: 'offline_stub',
        overlay: offlineOverlay(playTitle, durationSec, body.boardJson),
      });
    }

    if (body.playId) {
      await userClient
        .from('tactical_plays')
        .update({ drill_overlay_json: JSON.stringify(overlay) })
        .eq('id', body.playId);
    }

    return json({ mode: 'openai', overlay });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

function clampDuration(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 12;
  return Math.min(120, Math.max(4, Math.round(v)));
}

function clampPct(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 50;
  return Math.min(100, Math.max(0, Math.round(v * 10) / 10));
}

function asPoint(raw: unknown): Point | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.x !== 'number' || typeof o.y !== 'number') return null;
  return { x: clampPct(o.x), y: clampPct(o.y) };
}

function normalizeOverlay(
  raw: Record<string, unknown>,
  playTitle: string,
  durationSec: number,
  mode: 'openai' | 'offline_stub',
): {
  mode: 'openai' | 'offline_stub';
  playTitle: string;
  summary: string;
  durationSec: number;
  keyframes: OverlayKeyframe[];
  generatedAt: string;
} | null {
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  const dur =
    typeof raw.durationSec === 'number' && Number.isFinite(raw.durationSec)
      ? clampDuration(raw.durationSec)
      : durationSec;
  const framesRaw = Array.isArray(raw.keyframes) ? raw.keyframes : [];
  const keyframes: OverlayKeyframe[] = [];

  for (const fr of framesRaw.slice(0, 40)) {
    if (!fr || typeof fr !== 'object') continue;
    const f = fr as Record<string, unknown>;
    const t = typeof f.t === 'number' && Number.isFinite(f.t) ? Math.max(0, f.t) : 0;
    const paths = Array.isArray(f.paths)
      ? f.paths
          .map((p, i) => {
            if (!p || typeof p !== 'object') return null;
            const row = p as Record<string, unknown>;
            const points = Array.isArray(row.points)
              ? row.points.map(asPoint).filter((x): x is Point => Boolean(x)).slice(0, 24)
              : [];
            if (points.length < 2) return null;
            return {
              id: typeof row.id === 'string' ? row.id : `p${i}`,
              points,
              color: typeof row.color === 'string' ? row.color : '#F59E0B',
              label: typeof row.label === 'string' ? row.label : undefined,
            };
          })
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const arrows = Array.isArray(f.arrows)
      ? f.arrows
          .map((a, i) => {
            if (!a || typeof a !== 'object') return null;
            const row = a as Record<string, unknown>;
            const from = asPoint(row.from);
            const to = asPoint(row.to);
            if (!from || !to) return null;
            return {
              id: typeof row.id === 'string' ? row.id : `a${i}`,
              from,
              to,
              color: typeof row.color === 'string' ? row.color : '#38BDF8',
              label: typeof row.label === 'string' ? row.label : undefined,
            };
          })
          .filter(Boolean)
          .slice(0, 12)
      : [];
    const markers = Array.isArray(f.markers)
      ? f.markers
          .map((m, i) => {
            if (!m || typeof m !== 'object') return null;
            const row = m as Record<string, unknown>;
            const at = asPoint(row.at);
            if (!at || typeof row.label !== 'string') return null;
            return {
              id: typeof row.id === 'string' ? row.id : `m${i}`,
              at,
              label: row.label.slice(0, 4),
              color: typeof row.color === 'string' ? row.color : '#C8102E',
            };
          })
          .filter(Boolean)
          .slice(0, 10)
      : [];

    keyframes.push({
      t: Math.min(dur, t),
      courtGuide: f.courtGuide !== false,
      paths: paths as OverlayKeyframe['paths'],
      arrows: arrows as OverlayKeyframe['arrows'],
      markers: markers as OverlayKeyframe['markers'],
    });
  }

  keyframes.sort((a, b) => a.t - b.t);
  if (!summary || keyframes.length < 2) return null;

  return {
    mode,
    playTitle,
    summary,
    durationSec: dur,
    keyframes,
    generatedAt: new Date().toISOString(),
  };
}

function offlineOverlay(playTitle: string, durationSec: number, boardJson?: string | null) {
  const board = parseBoard(boardJson);
  const d = durationSec;
  const t1 = Math.round(d * 0.25 * 10) / 10;
  const t2 = Math.round(d * 0.55 * 10) / 10;
  const t3 = Math.round(d * 0.85 * 10) / 10;

  const m0 = board.markers[0] ?? { x: 28, y: 72, label: '1' };
  const m1 = board.markers[1] ?? { x: 50, y: 55, label: '2' };
  const m2 = board.markers[2] ?? { x: 72, y: 72, label: '3' };

  const pathA = [
    { x: m0.x, y: m0.y },
    { x: m0.x + 8, y: m0.y - 18 },
    { x: m1.x - 6, y: m1.y + 4 },
    { x: m1.x, y: m1.y },
  ];
  const pathB = [
    { x: m2.x, y: m2.y },
    { x: m2.x - 10, y: m2.y - 12 },
    { x: 58, y: 42 },
    { x: 50, y: 28 },
  ];

  const arrowFromBoard = board.arrows[0];

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
      arrows: arrowFromBoard
        ? [
            {
              id: 'board-a0',
              from: { x: arrowFromBoard.x1, y: arrowFromBoard.y1 },
              to: { x: arrowFromBoard.x2, y: arrowFromBoard.y2 },
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
        { id: 'm1', at: { x: m0.x + 6, y: m0.y - 14 }, label: m0.label || '1', color: '#C8102E' },
        { id: 'm2', at: { x: m1.x, y: m1.y }, label: m1.label || '2', color: '#C8102E' },
        { id: 'm3', at: { x: m2.x - 6, y: m2.y - 8 }, label: m2.label || '3', color: '#C8102E' },
      ],
      paths: [
        { id: 'cut1', points: pathA.slice(0, 3), color: '#F59E0B', label: 'חיתוך' },
        { id: 'cut2', points: pathB.slice(0, 2), color: '#22C55E', label: 'חלש' },
      ],
      arrows: [
        {
          id: 'pass1',
          from: { x: m0.x + 6, y: m0.y - 14 },
          to: { x: m1.x - 4, y: m1.y + 2 },
          color: '#38BDF8',
          label: 'מסירה',
        },
      ],
    },
    {
      t: t2,
      courtGuide: true,
      markers: [
        { id: 'm1', at: { x: m1.x - 4, y: m1.y + 2 }, label: m0.label || '1', color: '#C8102E' },
        { id: 'm2', at: { x: 54, y: 40 }, label: m1.label || '2', color: '#C8102E' },
        { id: 'm3', at: { x: 58, y: 42 }, label: m2.label || '3', color: '#C8102E' },
      ],
      paths: [
        { id: 'cut1', points: pathA, color: '#F59E0B', label: 'חיתוך' },
        { id: 'cut2', points: pathB.slice(0, 3), color: '#22C55E', label: 'חלש' },
      ],
      arrows: [
        {
          id: 'screen',
          from: { x: 54, y: 40 },
          to: { x: 48, y: 30 },
          color: '#A855F7',
          label: 'מסך',
        },
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
        {
          id: 'finish',
          from: { x: 50, y: 36 },
          to: { x: 50, y: 92 },
          color: '#F59E0B',
          label: 'סיום',
        },
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
        {
          id: 'finish',
          from: { x: 50, y: 28 },
          to: { x: 50, y: 92 },
          color: '#F59E0B',
          label: 'סיום',
        },
      ],
    },
  ];

  return {
    mode: 'offline_stub' as const,
    playTitle,
    summary: `מצב אופליין (אין OPENAI_API_KEY או קריאת OpenAI נכשלה): שרטוט דמו ל«${playTitle}» לאורך כל ${d} השניות — מסלולי חיתוך, מסירה וסיום.`,
    durationSec: d,
    keyframes,
    generatedAt: new Date().toISOString(),
  };
}

function parseBoard(boardJson?: string | null): {
  markers: { x: number; y: number; label: string }[];
  arrows: { x1: number; y1: number; x2: number; y2: number }[];
} {
  if (!boardJson?.trim()) return { markers: [], arrows: [] };
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
