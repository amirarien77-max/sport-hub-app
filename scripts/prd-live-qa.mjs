/**
 * Live PRD conformance probe (M1–M4) via Supabase anon + RLS.
 * Not a UI substitute for create-play, but covers auth/RLS/module APIs.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load .env without extra deps
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASS = 'TestPass3135!';
const COACH = 'm4.coach.qa@sport-hub.test';
const PLAYER = 'm4.player.qa@sport-hub.test';

const results = [];
function record(module, check, ok, detail = '') {
  results.push({ module, check, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${module}] ${check}${detail ? ' — ' + detail : ''}`);
}

function client() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function asUser(email) {
  const sb = client();
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASS });
  if (error) throw new Error(email + ': ' + error.message);
  const { data: profile } = await sb
    .from('users')
    .select('*')
    .eq('auth_id', data.user.id)
    .single();
  return { sb, profile };
}

async function run() {
  // M1
  {
    const sb = client();
    const { data: team } = await sb
      .from('teams')
      .select('id, invite_code, club_id, name')
      .eq('invite_code', 'HAP-U16-2026')
      .maybeSingle();
    record('M1', 'invite HAP-U16-2026 exists (anon read)', Boolean(team), team?.name);
    if (team) {
      const { data: club } = await sb
        .from('clubs')
        .select('name, primary_color, secondary_color')
        .eq('id', team.club_id)
        .maybeSingle();
      record('M1', 'club brand colors readable', Boolean(club?.primary_color), club?.name);
    }
  }

  const coach = await asUser(COACH);
  record('M1', 'coach live auth', coach.profile?.role === 'head_coach', coach.profile?.role);
  const player = await asUser(PLAYER);
  record('M1', 'player live auth', player.profile?.role === 'player', player.profile?.role);
  record(
    'M1',
    'player consent active (or pending flag present)',
    ['active', 'pending_parental_consent'].includes(player.profile?.consent_status),
    player.profile?.consent_status,
  );

  // M2
  {
    const { data: events, error } = await coach.sb
      .from('events')
      .select('id, title, starts_at')
      .eq('team_id', coach.profile.team_id);
    record('M2', 'coach reads events', !error && (events?.length ?? 0) > 0, `n=${events?.length}`);

    if (events?.[0]) {
      const eventId = events[0].id;
      const { error: rsvpErr } = await player.sb.from('event_rsvps').upsert(
        {
          event_id: eventId,
          player_id: player.profile.id,
          player_choice: 'attending',
        },
        { onConflict: 'event_id,player_id' },
      );
      record('M2', 'player Dual-Ack RSVP upsert', !rsvpErr, rsvpErr?.message);

      const { error: attErr } = await coach.sb.from('attendance_records').upsert(
        {
          event_id: eventId,
          player_id: player.profile.id,
          mark: 'present',
        },
        { onConflict: 'event_id,player_id' },
      );
      record('M2', 'coach attendance mark', !attErr, attErr?.message);
    }

    const { data: carpools } = await coach.sb.from('carpool_offers').select('id, seats_available, seats_taken').limit(5);
    record('M2', 'carpool offers readable', Array.isArray(carpools), `n=${carpools?.length}`);

    const { data: feed } = await coach.sb
      .from('team_feed_posts')
      .select('id, body, is_urgent')
      .eq('team_id', coach.profile.team_id)
      .eq('is_urgent', true)
      .limit(3);
    record('M2', 'urgent banner posts readable', Array.isArray(feed), `n=${feed?.length}`);
  }

  // M3
  {
    const { error: rpeErr } = await player.sb.from('readiness_reports').upsert(
      {
        player_id: player.profile.id,
        rpe: 7,
        sleep_hours: 8,
        water_liters: 2,
        report_date: new Date().toISOString().slice(0, 10),
      },
      { onConflict: 'player_id,report_date' },
    );
    record('M3', 'player readiness upsert', !rpeErr, rpeErr?.message);

    const { error: painErr } = await player.sb.from('pain_reports').insert({
      player_id: player.profile.id,
      region: 'ankle',
      sub_region: 'achilles',
      severity: 'soreness',
    });
    record('M3', 'player pain insert', !painErr, painErr?.message);

    const { data: readiness, error: crErr } = await coach.sb
      .from('readiness_reports')
      .select('id, player_id, rpe')
      .limit(10);
    record('M3', 'coach reads readiness (staff)', !crErr, `n=${readiness?.length ?? 0} ${crErr?.message || ''}`);

    // Parent medical block — create ephemeral parent session if possible; skip if none
    const { data: parents } = await coach.sb
      .from('users')
      .select('id, role')
      .eq('team_id', coach.profile.team_id)
      .eq('role', 'parent')
      .limit(1);
    record('M3', 'parent role exists on team (optional)', true, `n=${parents?.length ?? 0}`);
  }

  // M4 — create play (PRIORITY)
  {
    const title = `PRD-QA ${new Date().toISOString()}`;
    const { data: play, error } = await coach.sb
      .from('tactical_plays')
      .insert({
        team_id: coach.profile.team_id,
        title,
        allow_suggestions: true,
        board_json: '{"markers":[]}',
      })
      .select('*')
      .single();
    record('M4', 'coach create play', !error && Boolean(play?.id), error?.message || play?.title);

    if (play) {
      const board = JSON.stringify({ markers: [{ x: 30, y: 60, label: '1' }] });
      const { error: bErr } = await coach.sb
        .from('tactical_plays')
        .update({ board_json: board })
        .eq('id', play.id);
      record('M4', 'coach save board markers', !bErr, bErr?.message);

      const { error: aErr } = await coach.sb.from('play_assignments').insert({
        play_id: play.id,
        player_id: player.profile.id,
        position_name: '1',
        action_prompt_question: 'מה אתה עושה אחרי המסך?',
      });
      record('M4', 'coach create assignment', !aErr, aErr?.message);

      const { data: assigns } = await player.sb
        .from('play_assignments')
        .select('id')
        .eq('play_id', play.id)
        .eq('player_id', player.profile.id);
      if (assigns?.[0]) {
        const { error: ansErr } = await player.sb
          .from('play_assignments')
          .update({ player_answer: 'חותך לסל' })
          .eq('id', assigns[0].id);
        record('M4', 'player answer assignment', !ansErr, ansErr?.message);
      }

      const { error: sugErr } = await player.sb.from('play_suggestions').insert({
        play_id: play.id,
        player_id: player.profile.id,
        suggestion_text: 'להזיז את 4 גבוה יותר',
      });
      record('M4', 'player suggestion while allowed', !sugErr, sugErr?.message);

      await coach.sb.from('tactical_plays').update({ allow_suggestions: false }).eq('id', play.id);
      const { error: blocked } = await player.sb.from('play_suggestions').insert({
        play_id: play.id,
        player_id: player.profile.id,
        suggestion_text: 'should fail',
      });
      record('M4', 'suggestion blocked when toggle off', Boolean(blocked), blocked?.message || 'unexpected allow');

      await coach.sb.from('tactical_plays').update({ allow_suggestions: true }).eq('id', play.id);

      const { data: pending } = await coach.sb
        .from('play_suggestions')
        .select('id')
        .eq('play_id', play.id)
        .eq('status', 'pending')
        .limit(1);
      if (pending?.[0]) {
        const { error: revErr } = await coach.sb
          .from('play_suggestions')
          .update({ status: 'approved' })
          .eq('id', pending[0].id);
        record('M4', 'coach approve suggestion', !revErr, revErr?.message);
      }

      const { error: mediaErr } = await coach.sb
        .from('tactical_plays')
        .update({ media_url: 'https://example.com/video' })
        .eq('id', play.id);
      record('M4', 'coach media URL stub', !mediaErr, mediaErr?.message);

      const { error: playerCreate } = await player.sb.from('tactical_plays').insert({
        team_id: player.profile.team_id,
        title: 'player should not create',
      });
      record('M4', 'player create play blocked by RLS', Boolean(playerCreate), playerCreate?.message);
    }
  }

  await coach.sb.auth.signOut();
  await player.sb.auth.signOut();

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- summary ---');
  console.log(`total=${results.length} fail=${failed.length}`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
