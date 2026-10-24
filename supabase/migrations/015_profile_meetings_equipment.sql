-- =============================================================================
-- 015_profile_meetings_equipment: PRD Update v1.1 Step 1
-- - role equipment_manager על user_role (אין coach_staff_role_enum בקודבייס)
-- - team_players (חדש — לא היה; פרופיל מידות/גובה לשחקן)
-- - equipment_reports + player_meetings + player_external_auth
-- - RLS לפי §4; הצפנת Swish ב־pgcrypto דרך RPC (לא plaintext ללקוח)
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =============================================================================

-- ── 1. Role: equipment_manager ───────────────────────────────────────────────
-- (PRD pasted coach_staff_role_enum — here roles live on user_role.)
-- Must be top-level (not inside DO/plpgsql).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'equipment_manager';

-- ── 2. Club helper (equipment_manager sees club-wide reports) ────────────────
CREATE OR REPLACE FUNCTION public.current_app_club_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club_id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_equipment_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
      AND role = 'equipment_manager'
  );
$$;

-- ── 3. team_players (roster profile extension; sizes + height) ───────────────
CREATE TABLE IF NOT EXISTS team_players (
  player_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  height_cm INTEGER CHECK (height_cm IS NULL OR height_cm BETWEEN 100 AND 250),
  shirt_size VARCHAR(10),
  shorts_size VARCHAR(10),
  shoe_size NUMERIC(3, 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_players_team_idx ON team_players (team_id);

ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_players_select_team ON team_players;
CREATE POLICY team_players_select_team ON team_players FOR SELECT
  USING (
    team_id = public.current_app_team_id()
    OR player_id = public.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM parent_player_links l
      WHERE l.parent_id = public.current_app_user_id()
        AND l.player_id = team_players.player_id
    )
  );

-- Player (or linked parent) may upsert sizes for that player on their team.
DROP POLICY IF EXISTS team_players_insert_self_or_parent ON team_players;
CREATE POLICY team_players_insert_self_or_parent ON team_players FOR INSERT
  WITH CHECK (
    team_id = public.current_app_team_id()
    AND (
      player_id = public.current_app_user_id()
      OR EXISTS (
        SELECT 1 FROM parent_player_links l
        WHERE l.parent_id = public.current_app_user_id()
          AND l.player_id = team_players.player_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = team_players.player_id
        AND u.team_id = team_players.team_id
        AND u.role = 'player'
    )
  );

DROP POLICY IF EXISTS team_players_update_self_or_parent ON team_players;
CREATE POLICY team_players_update_self_or_parent ON team_players FOR UPDATE
  USING (
    player_id = public.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM parent_player_links l
      WHERE l.parent_id = public.current_app_user_id()
        AND l.player_id = team_players.player_id
    )
  )
  WITH CHECK (
    team_id = public.current_app_team_id()
    AND (
      player_id = public.current_app_user_id()
      OR EXISTS (
        SELECT 1 FROM parent_player_links l
        WHERE l.parent_id = public.current_app_user_id()
          AND l.player_id = team_players.player_id
      )
    )
  );

-- ── 4. Equipment reports ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'equipment_status_enum') THEN
    CREATE TYPE equipment_status_enum AS ENUM (
      'reported',
      'in_progress',
      'ordered',
      'resolved'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS equipment_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status equipment_status_enum NOT NULL DEFAULT 'reported',
  handled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS equipment_reports_team_idx ON equipment_reports (team_id);
CREATE INDEX IF NOT EXISTS equipment_reports_status_idx ON equipment_reports (status);

ALTER TABLE equipment_reports ENABLE ROW LEVEL SECURITY;

-- Coaches: own team. Equipment manager: all teams in same club.
DROP POLICY IF EXISTS equipment_reports_select_coach_or_em ON equipment_reports;
CREATE POLICY equipment_reports_select_coach_or_em ON equipment_reports FOR SELECT
  USING (
    (
      public.is_team_staff()
      AND team_id = public.current_app_team_id()
    )
    OR (
      public.is_equipment_manager()
      AND team_id IN (
        SELECT t.id FROM teams t
        WHERE t.club_id = public.current_app_club_id()
      )
    )
  );

-- Coaches (team staff) file reports for their team.
DROP POLICY IF EXISTS equipment_reports_insert_staff ON equipment_reports;
CREATE POLICY equipment_reports_insert_staff ON equipment_reports FOR INSERT
  WITH CHECK (
    public.is_team_staff()
    AND team_id = public.current_app_team_id()
    AND reported_by = public.current_app_user_id()
  );

-- Equipment manager updates status/notes for club reports; staff may soft-edit own team notes.
DROP POLICY IF EXISTS equipment_reports_update_em_or_staff ON equipment_reports;
CREATE POLICY equipment_reports_update_em_or_staff ON equipment_reports FOR UPDATE
  USING (
    (
      public.is_equipment_manager()
      AND team_id IN (
        SELECT t.id FROM teams t
        WHERE t.club_id = public.current_app_club_id()
      )
    )
    OR (
      public.is_team_staff()
      AND team_id = public.current_app_team_id()
    )
  )
  WITH CHECK (
    (
      public.is_equipment_manager()
      AND team_id IN (
        SELECT t.id FROM teams t
        WHERE t.club_id = public.current_app_club_id()
      )
    )
    OR (
      public.is_team_staff()
      AND team_id = public.current_app_team_id()
    )
  );

-- ── 5. Player meetings (development notes + goals) ───────────────────────────
CREATE TABLE IF NOT EXISTS player_meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL,
  summary TEXT NOT NULL,
  goals TEXT[] NOT NULL
    CONSTRAINT player_meetings_goals_len CHECK (
      cardinality(goals) BETWEEN 1 AND 3
    ),
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_meetings_team_idx ON player_meetings (team_id);
CREATE INDEX IF NOT EXISTS player_meetings_player_idx ON player_meetings (player_id);

ALTER TABLE player_meetings ENABLE ROW LEVEL SECURITY;

-- Coach/admin: full read on team meetings. Player/parent: published only.
DROP POLICY IF EXISTS player_meetings_select_coach_or_published ON player_meetings;
CREATE POLICY player_meetings_select_coach_or_published ON player_meetings FOR SELECT
  USING (
    (
      public.is_team_staff()
      AND team_id = public.current_app_team_id()
    )
    OR (
      is_published = TRUE
      AND player_id = public.current_app_user_id()
    )
    OR (
      is_published = TRUE
      AND EXISTS (
        SELECT 1 FROM parent_player_links l
        WHERE l.parent_id = public.current_app_user_id()
          AND l.player_id = player_meetings.player_id
      )
    )
  );

DROP POLICY IF EXISTS player_meetings_insert_staff ON player_meetings;
CREATE POLICY player_meetings_insert_staff ON player_meetings FOR INSERT
  WITH CHECK (
    public.is_team_staff()
    AND team_id = public.current_app_team_id()
    AND coach_id = public.current_app_user_id()
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = player_meetings.player_id
        AND u.team_id = player_meetings.team_id
        AND u.role = 'player'
    )
  );

DROP POLICY IF EXISTS player_meetings_update_staff ON player_meetings;
CREATE POLICY player_meetings_update_staff ON player_meetings FOR UPDATE
  USING (
    public.is_team_staff()
    AND team_id = public.current_app_team_id()
  )
  WITH CHECK (
    public.is_team_staff()
    AND team_id = public.current_app_team_id()
  );

-- Explicit: equipment_manager has no policy on player_meetings → no access.

-- ── 6. Swish external auth (encrypted at rest via RPC) ───────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- App-managed secret store (not exposed to PostgREST clients).
CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon → deny all via RLS.
REVOKE ALL ON TABLE app_secrets FROM PUBLIC, anon, authenticated;
-- service_role bypasses RLS; SECURITY DEFINER RPCs read the key.

-- Bootstrap a random key if missing (rotate via Dashboard SQL — see internal doc).
INSERT INTO app_secrets (key, value)
VALUES ('swish_encryption_key', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS player_external_auth (
  player_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  swish_username VARCHAR(100),
  swish_password_encrypted TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE player_external_auth ENABLE ROW LEVEL SECURITY;

-- Column privileges: never grant the ciphertext column to client roles.
REVOKE ALL ON TABLE player_external_auth FROM PUBLIC, anon, authenticated;
GRANT SELECT (player_id, swish_username, last_synced_at, created_at)
  ON player_external_auth TO authenticated;
-- Writes only through SECURITY DEFINER RPCs below (no INSERT/UPDATE for authenticated).

DROP POLICY IF EXISTS player_external_auth_select_own ON player_external_auth;
CREATE POLICY player_external_auth_select_own ON player_external_auth FOR SELECT
  USING (player_id = public.current_app_user_id());

CREATE OR REPLACE FUNCTION public._swish_encryption_key()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k TEXT;
BEGIN
  SELECT value INTO k FROM app_secrets WHERE key = 'swish_encryption_key';
  IF k IS NULL OR length(k) < 16 THEN
    RAISE EXCEPTION 'swish_encryption_key is not configured';
  END IF;
  RETURN k;
END;
$$;

REVOKE ALL ON FUNCTION public._swish_encryption_key() FROM PUBLIC, anon, authenticated;

-- Player saves Swish credentials: plaintext accepted only as RPC arg, encrypted before write.
CREATE OR REPLACE FUNCTION public.save_swish_credentials(
  p_username TEXT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := public.current_app_user_id();
  enc TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated as app user';
  END IF;
  IF public.current_app_role() IS DISTINCT FROM 'player'::user_role THEN
    RAISE EXCEPTION 'only players may link Swish';
  END IF;
  IF p_username IS NULL OR length(trim(p_username)) = 0 THEN
    RAISE EXCEPTION 'username required';
  END IF;
  IF p_password IS NULL OR length(p_password) = 0 THEN
    RAISE EXCEPTION 'password required';
  END IF;

  enc := encode(
    pgp_sym_encrypt(p_password, public._swish_encryption_key()),
    'base64'
  );

  INSERT INTO player_external_auth AS pea (
    player_id,
    swish_username,
    swish_password_encrypted,
    created_at
  )
  VALUES (uid, trim(p_username), enc, NOW())
  ON CONFLICT (player_id) DO UPDATE
  SET
    swish_username = EXCLUDED.swish_username,
    swish_password_encrypted = EXCLUDED.swish_password_encrypted;

  -- Never return ciphertext or plaintext password.
  RETURN jsonb_build_object(
    'ok', true,
    'player_id', uid,
    'swish_username', trim(p_username),
    'linked', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_swish_credentials(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_swish_credentials(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_swish_credentials()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := public.current_app_user_id();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated as app user';
  END IF;
  DELETE FROM player_external_auth WHERE player_id = uid;
  RETURN jsonb_build_object('ok', true, 'linked', false);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_swish_credentials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_swish_credentials() TO authenticated;

-- Server-only decrypt for future Edge sync jobs (service_role). Not for clients.
CREATE OR REPLACE FUNCTION public.decrypt_swish_password(p_player_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enc TEXT;
BEGIN
  SELECT swish_password_encrypted INTO enc
  FROM player_external_auth
  WHERE player_id = p_player_id;

  IF enc IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN pgp_sym_decrypt(
    decode(enc, 'base64'),
    public._swish_encryption_key()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decrypt_swish_password(UUID) FROM PUBLIC, anon, authenticated;
-- service_role bypasses REVOKE in practice via Supabase; keep explicit grant:
GRANT EXECUTE ON FUNCTION public.decrypt_swish_password(UUID) TO service_role;
