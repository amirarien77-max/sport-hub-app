/**
 * Game IQ — structured coach/player insights for a tactical play.
 * Secret: OPENAI_API_KEY (Dashboard → Edge Functions → Secrets).
 * Without the key, returns Hebrew offline_stub (same shape as client fallback).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AssignmentIn = {
  positionName?: string;
  playerName?: string;
  actionPromptQuestion?: string;
  playerAnswer?: string | null;
};

type Body = {
  playId?: string;
  playTitle?: string;
  boardJson?: string | null;
  allowSuggestions?: boolean;
  viewerRole?: string;
  assignments?: AssignmentIn[];
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
    const assignments = body.assignments ?? [];
    const openaiKey = Deno.env.get('OPENAI_API_KEY')?.trim();

    if (!openaiKey) {
      const insight = offlineInsight(playTitle, assignments, body);
      return json({ mode: 'offline_stub', insight });
    }

    const system = `אתה עוזר טקטי לכדורסל נוער. החזר JSON בלבד בעברית במבנה:
{"summary":"string","coachBullets":["..","..",".."],"playerBullets":["..","..",".."]}
בלי markdown. שלוש נקודות לכל מערך. קצר ומעשי לאימון.`;

    const userPrompt = JSON.stringify({
      playTitle,
      allowSuggestions: body.allowSuggestions ?? true,
      boardJson: body.boardJson ?? null,
      viewerRole: body.viewerRole ?? 'coach',
      assignments,
    });

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
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
      const insight = offlineInsight(playTitle, assignments, body);
      return json({ mode: 'offline_stub', insight, openaiError: true });
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      const insight = offlineInsight(playTitle, assignments, body);
      return json({ mode: 'offline_stub', insight, parseError: true });
    }

    const insight = {
      mode: 'openai' as const,
      playTitle,
      summary: String(parsed.summary ?? ''),
      coachBullets: asStringArray(parsed.coachBullets),
      playerBullets: asStringArray(parsed.playerBullets),
      generatedAt: new Date().toISOString(),
    };

    if (!insight.summary || insight.coachBullets.length === 0) {
      return json({ mode: 'offline_stub', insight: offlineInsight(playTitle, assignments, body) });
    }

    // Best-effort cache on play row (column may be missing until migration 012).
    if (body.playId) {
      await userClient
        .from('tactical_plays')
        .update({ game_iq_json: JSON.stringify(insight) })
        .eq('id', body.playId);
    }

    return json({ mode: 'openai', insight });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string').slice(0, 5);
}

function offlineInsight(playTitle: string, assignments: AssignmentIn[], body: Body) {
  const pending = assignments.filter((a) => !a.playerAnswer?.trim()).length;
  const answered = assignments.length - pending;
  return {
    mode: 'offline_stub' as const,
    playTitle,
    summary: `מצב אופליין (אין OPENAI_API_KEY או קריאת OpenAI נכשלה): סיכום ל«${playTitle}».`,
    coachBullets: [
      pending > 0
        ? `ממתינים ל־${pending} תשובות שחקנים.`
        : answered > 0
          ? `כל ${answered} השיבוצים נענו.`
          : 'שבצו שאלות פעולה לשחקנים.',
      body.allowSuggestions
        ? 'הצעות שחקנים פעילות — אספו רעיונות.'
        : 'הצעות כבויות לתרגיל זה.',
      'חזרו על החיתוך מצד חלש / מסך לפני מעבר לתרגול חי.',
    ],
    playerBullets: [
      'בדקו את «משימות הפעולה שלי» וענו לפני האימון.',
      `למדו את מבנה «${playTitle}» על הלוח.`,
      'שמרו רווח ואל תמהרו את המסירה הראשונה.',
    ],
    generatedAt: new Date().toISOString(),
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
