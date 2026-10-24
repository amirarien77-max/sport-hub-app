/**
 * Parental consent SMS — Twilio when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER
 * are set; otherwise returns simulated mode with the Hebrew payload for client logging.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = {
  to?: string;
  playerName?: string;
  clubName?: string;
  token?: string;
  bodyHe?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing_auth' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);

    const body = (await req.json()) as Body;
    const to = (body.to ?? '').trim();
    const playerName = (body.playerName ?? 'שחקן').trim();
    const clubName = (body.clubName ?? 'הפועל ירושלים').trim();
    const token = (body.token ?? '').trim();
    if (!to || !token) return json({ error: 'missing_fields' }, 400);

    const bodyHe =
      body.bodyHe?.trim() ||
      `הפועל ירושלים / ${clubName}: נדרש אישור הורה לשחקן/ית ${playerName}. קוד אישור: ${token}.`;

    const sid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
    const tokenTwilio = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
    const from = Deno.env.get('TWILIO_FROM_NUMBER')?.trim();

    if (!sid || !tokenTwilio || !from) {
      return json({
        mode: 'simulated',
        loggedPayload: { to, playerName, clubName, token, bodyHe },
      });
    }

    const auth = btoa(`${sid}:${tokenTwilio}`);
    const form = new URLSearchParams({ To: to, From: from, Body: bodyHe });
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      },
    );

    if (!twilioRes.ok) {
      const errText = await twilioRes.text();
      console.error('twilio error', twilioRes.status, errText.slice(0, 400));
      return json({
        mode: 'simulated',
        twilioError: true,
        loggedPayload: { to, playerName, clubName, token, bodyHe },
      });
    }

    const twilioJson = await twilioRes.json();
    return json({
      mode: 'twilio',
      sid: twilioJson.sid ?? null,
      loggedPayload: { to, playerName, clubName, token, bodyHe },
    });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
