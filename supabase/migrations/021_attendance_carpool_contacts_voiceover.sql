-- =============================================================================
-- 021_attendance_carpool_contacts_voiceover
-- - Carpool: departure location + pickup waypoints
-- - Team contact directory (דף קשר)
-- - Optional voiceover URL on tactical plays (synced with drill overlay)
-- Attendance marks already: present | excused | no_show (002) — no enum change.
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =============================================================================

-- ── 1. Carpool offer logistics fields ────────────────────────────────────────
ALTER TABLE carpool_offers
  ADD COLUMN IF NOT EXISTS departure_location TEXT;

ALTER TABLE carpool_offers
  ADD COLUMN IF NOT EXISTS pickup_points TEXT;

-- ── 2. Contact directory ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role_label VARCHAR(80) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(40),
  is_head_coach BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_contacts_team_idx ON team_contacts (team_id);

ALTER TABLE team_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_contacts_select_team ON team_contacts;
CREATE POLICY team_contacts_select_team ON team_contacts FOR SELECT
  USING (
    team_id IN (
      SELECT u.team_id FROM users u WHERE u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS team_contacts_insert_staff ON team_contacts;
CREATE POLICY team_contacts_insert_staff ON team_contacts FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT u.team_id FROM users u
      WHERE u.auth_id = auth.uid()
        AND u.role IN ('admin', 'head_coach', 'assistant_coach')
    )
  );

DROP POLICY IF EXISTS team_contacts_update_staff ON team_contacts;
CREATE POLICY team_contacts_update_staff ON team_contacts FOR UPDATE
  USING (
    team_id IN (
      SELECT u.team_id FROM users u
      WHERE u.auth_id = auth.uid()
        AND u.role IN ('admin', 'head_coach', 'assistant_coach')
    )
  );

DROP POLICY IF EXISTS team_contacts_delete_staff ON team_contacts;
CREATE POLICY team_contacts_delete_staff ON team_contacts FOR DELETE
  USING (
    team_id IN (
      SELECT u.team_id FROM users u
      WHERE u.auth_id = auth.uid()
        AND u.role IN ('admin', 'head_coach', 'assistant_coach')
    )
  );

-- ── 3. Voiceover per exercise (optional audio synced to drill playback) ──────
ALTER TABLE tactical_plays
  ADD COLUMN IF NOT EXISTS voiceover_url TEXT;
