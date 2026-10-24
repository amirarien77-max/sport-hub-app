import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlayAssignment, TacticalPlay } from '@/types';

export type GameIqMode = 'openai' | 'offline_stub';

export type GameIqInsight = {
  mode: GameIqMode;
  playTitle: string;
  summary: string;
  coachBullets: string[];
  playerBullets: string[];
  generatedAt: string;
};

export type GameIqRequest = {
  play: Pick<TacticalPlay, 'id' | 'title' | 'boardJson' | 'allowSuggestions'>;
  assignments: Pick<
    PlayAssignment,
    'positionName' | 'playerName' | 'actionPromptQuestion' | 'playerAnswer'
  >[];
  viewerRole: 'coach' | 'player' | 'other';
};

const INSIGHT_SCHEMA_HINT = `{
  "summary": "string Hebrew",
  "coachBullets": ["string", "string", "string"],
  "playerBullets": ["string", "string", "string"]
}`;

/** Deterministic Hebrew offline insights — always available without OpenAI. */
export function buildOfflineGameIq(input: GameIqRequest): GameIqInsight {
  const answered = input.assignments.filter((a) => Boolean(a.playerAnswer?.trim()));
  const pending = input.assignments.filter((a) => !a.playerAnswer?.trim());
  const markers = (() => {
    try {
      const raw = input.play.boardJson ? JSON.parse(input.play.boardJson) : null;
      return Array.isArray(raw?.markers) ? raw.markers.length : 0;
    } catch {
      return 0;
    }
  })();

  const coachBullets = [
    pending.length > 0
      ? `עדיין ממתינים לתשובות מ־${pending.length} שיבוצים — בדקו משימות פעולה לפני האימון.`
      : answered.length > 0
        ? `כל השיבוצים נענו (${answered.length}) — סקרו תשובות לפני פירוק לתרגול.`
        : 'אין שיבוצי פעולה עדיין — שבצו עמדה + שאלת פעולה לכל שחקן מפתח.',
    markers > 0
      ? `על הלוח ${markers} סימוני עמדה — ודאו שכל שחקן מזהה את המספר שלו.`
      : 'הלוח ריק מסימונים — סמנו לפחות את עמדות 1–5 לפני ההפצה.',
    input.play.allowSuggestions
      ? 'הצעות שחקנים פעילות — אספו רעיונות אחרי הצפייה הראשונה.'
      : 'הצעות כבויות לתרגיל זה — הדליקו אם רוצים משוב מהקבוצה.',
  ];

  const playerBullets =
    input.assignments.length === 0
      ? [
          'המאמן עדיין לא שיבץ אתכם — עקבו אחרי «משימות הפעולה שלי».',
          `תרגיל «${input.play.title}»: למדו את המבנה הכללי על הלוח.`,
          'שאלו את המאמן אם לא ברור תפקידכם בחיתוך / מסך.',
        ]
      : input.assignments.slice(0, 3).map((a) => {
          const ans = a.playerAnswer?.trim();
          return ans
            ? `עמדה ${a.positionName}: שמרתם «${ans.slice(0, 60)}» — חזרו על זה במגרש.`
            : `עמדה ${a.positionName}: ענו על «${a.actionPromptQuestion.slice(0, 50)}» לפני האימון.`;
        });

  while (playerBullets.length < 3) {
    playerBullets.push('שמרו על רווח וקצב — אל תמהרו את המסירה הראשונה.');
  }

  const summary =
    input.viewerRole === 'player'
      ? `מצב אופליין (ללא OpenAI): סיכום קצר ל«${input.play.title}» לפי השיבוצים שלכם.`
      : `מצב אופליין (ללא OpenAI): תובנות מאמן ל«${input.play.title}» לפי לוח ושיבוצים.`;

  return {
    mode: 'offline_stub',
    playTitle: input.play.title,
    summary,
    coachBullets,
    playerBullets,
    generatedAt: new Date().toISOString(),
  };
}

function parseInsightPayload(
  raw: unknown,
  fallbackTitle: string,
  mode: GameIqMode,
): GameIqInsight | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const coachBullets = Array.isArray(o.coachBullets)
    ? o.coachBullets.filter((x): x is string => typeof x === 'string').slice(0, 5)
    : [];
  const playerBullets = Array.isArray(o.playerBullets)
    ? o.playerBullets.filter((x): x is string => typeof x === 'string').slice(0, 5)
    : [];
  const summary = typeof o.summary === 'string' ? o.summary : '';
  if (!summary || coachBullets.length === 0 || playerBullets.length === 0) return null;
  return {
    mode,
    playTitle: typeof o.playTitle === 'string' ? o.playTitle : fallbackTitle,
    summary,
    coachBullets,
    playerBullets,
    generatedAt:
      typeof o.generatedAt === 'string' ? o.generatedAt : new Date().toISOString(),
  };
}

/**
 * Prefer Supabase Edge Function `game-iq` (server-side OPENAI_API_KEY).
 * On missing function / missing key / network error → Hebrew offline stub.
 */
export async function generateGameIq(
  client: SupabaseClient | null,
  input: GameIqRequest,
): Promise<GameIqInsight> {
  if (!client) {
    return buildOfflineGameIq(input);
  }

  try {
    const { data, error } = await client.functions.invoke('game-iq', {
      body: {
        playId: input.play.id,
        playTitle: input.play.title,
        boardJson: input.play.boardJson ?? null,
        allowSuggestions: input.play.allowSuggestions,
        viewerRole: input.viewerRole,
        assignments: input.assignments.map((a) => ({
          positionName: a.positionName,
          playerName: a.playerName,
          actionPromptQuestion: a.actionPromptQuestion,
          playerAnswer: a.playerAnswer ?? null,
        })),
        schemaHint: INSIGHT_SCHEMA_HINT,
      },
    });

    if (error) {
      console.warn('game-iq invoke error', error.message);
      return buildOfflineGameIq(input);
    }

    const payload = (data as { insight?: unknown; mode?: string } | null) ?? null;
    if (payload?.mode === 'offline_stub' || payload?.mode === 'openai') {
      const parsed = parseInsightPayload(payload.insight ?? payload, input.play.title, payload.mode);
      if (parsed) return parsed;
    }

    const direct = parseInsightPayload(data, input.play.title, 'openai');
    if (direct) return direct;

    return buildOfflineGameIq(input);
  } catch (err) {
    console.warn('game-iq failed', err instanceof Error ? err.message : err);
    return buildOfflineGameIq(input);
  }
}
