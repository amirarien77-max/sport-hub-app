/**
 * Live probe: coach login → create tactical play → update board → list.
 * Uses same table/API path as the app (anon key + RLS).
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const DB =
  process.env.DATABASE_URL ||
  'postgresql://postgres:sport-hub-app%403135@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const COACH = {
  email: 'm4.coach.qa@sport-hub.test',
  password: 'TestPass3135!',
};

async function dbInfo() {
  const pool = new pg.Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  try {
    const users = await pool.query(
      `SELECT u.id, u.full_name, u.role, u.team_id, u.auth_id, au.email
       FROM users u
       LEFT JOIN auth.users au ON au.id = u.auth_id
       WHERE au.email LIKE 'm4.%' OR u.full_name ILIKE '%qa%' OR u.role = 'head_coach'
       ORDER BY au.email NULLS LAST
       LIMIT 20`,
    );
    console.log('--- users ---');
    console.table(users.rows);

    const policies = await pool.query(
      `SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr,
              pg_get_expr(polwithcheck, polrelid) AS check_expr
       FROM pg_policy
       WHERE polrelid = 'public.tactical_plays'::regclass`,
    );
    console.log('--- tactical_plays policies ---');
    console.table(policies.rows);

    const staffFn = await pool.query(
      `SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'is_team_staff'`,
    );
    console.log('--- is_team_staff ---');
    console.log(staffFn.rows[0]?.def);
  } finally {
    await pool.end();
  }
}

async function coachCreate() {
  const sb = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authErr } = await sb.auth.signInWithPassword(COACH);
  if (authErr) throw new Error('signIn: ' + authErr.message);
  console.log('signed in', auth.user.id, auth.user.email);

  const { data: profile, error: pErr } = await sb
    .from('users')
    .select('id, full_name, role, team_id, auth_id')
    .eq('auth_id', auth.user.id)
    .maybeSingle();
  if (pErr) throw new Error('profile: ' + pErr.message);
  console.log('profile', profile);

  const { data: staff, error: sErr } = await sb.rpc('is_team_staff').maybeSingle?.() 
    ?? await sb.rpc('is_team_staff');
  console.log('is_team_staff rpc', { staff, sErr });

  // Try raw SQL via selecting helper if exposed — otherwise infer from insert.
  const title = `QA Probe ${new Date().toISOString()}`;
  const { data: play, error: cErr } = await sb
    .from('tactical_plays')
    .insert({
      team_id: profile.team_id,
      title,
      allow_suggestions: true,
      board_json: '{"markers":[]}',
    })
    .select('id, title, team_id, board_json')
    .single();

  if (cErr) {
    console.error('CREATE FAIL', cErr);
    return { ok: false, error: cErr.message, profile };
  }
  console.log('CREATE OK', play);

  const board = JSON.stringify({
    markers: [
      { x: 20, y: 70, label: '1' },
      { x: 50, y: 50, label: '4' },
    ],
  });
  const { error: uErr } = await sb
    .from('tactical_plays')
    .update({ board_json: board })
    .eq('id', play.id);
  if (uErr) console.error('BOARD UPDATE FAIL', uErr);
  else console.log('BOARD UPDATE OK');

  const { data: listed, error: lErr } = await sb
    .from('tactical_plays')
    .select('id, title')
    .eq('team_id', profile.team_id)
    .order('created_at', { ascending: false });
  if (lErr) console.error('LIST FAIL', lErr);
  else console.log('LIST count', listed?.length, 'includes new?', listed?.some((p) => p.id === play.id));

  await sb.auth.signOut();
  return { ok: true, playId: play.id, title };
}

const mode = process.argv[2] || 'all';
if (mode === 'db' || mode === 'all') await dbInfo();
if (mode === 'create' || mode === 'all') {
  const r = await coachCreate();
  console.log('RESULT', r);
  process.exit(r.ok ? 0 : 1);
}
