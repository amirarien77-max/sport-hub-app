-- =============================================================================
-- 010_module4_tactical_live: RLS כתיבה ללוח טקטי, עמודת board_json,
-- constraint לסטטוס הצעות, seed תרגיל. Safe to re-run.
-- =============================================================================

-- ── Optional sketch / stroke payload (JSON text; no storage bucket yet) ──────
ALTER TABLE tactical_plays
  ADD COLUMN IF NOT EXISTS board_json TEXT;

ALTER TABLE play_suggestions
  DROP CONSTRAINT IF EXISTS play_suggestions_status_check;

ALTER TABLE play_suggestions
  ADD CONSTRAINT play_suggestions_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- ── tactical_plays ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS plays_select_team ON tactical_plays;
CREATE POLICY plays_select_team ON tactical_plays FOR SELECT
  USING (team_id = public.current_app_team_id());

DROP POLICY IF EXISTS plays_insert_staff ON tactical_plays;
CREATE POLICY plays_insert_staff ON tactical_plays FOR INSERT
  WITH CHECK (
    team_id = public.current_app_team_id()
    AND public.is_team_staff()
  );

DROP POLICY IF EXISTS plays_update_staff ON tactical_plays;
CREATE POLICY plays_update_staff ON tactical_plays FOR UPDATE
  USING (
    team_id = public.current_app_team_id()
    AND public.is_team_staff()
  )
  WITH CHECK (
    team_id = public.current_app_team_id()
    AND public.is_team_staff()
  );

-- ── play_assignments ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS assignments_select_team ON play_assignments;
CREATE POLICY assignments_select_team ON play_assignments FOR SELECT
  USING (
    play_id IN (
      SELECT id FROM tactical_plays WHERE team_id = public.current_app_team_id()
    )
  );

DROP POLICY IF EXISTS assignments_insert_staff ON play_assignments;
CREATE POLICY assignments_insert_staff ON play_assignments FOR INSERT
  WITH CHECK (
    public.is_team_staff()
    AND play_id IN (
      SELECT id FROM tactical_plays WHERE team_id = public.current_app_team_id()
    )
    AND player_id IN (
      SELECT id FROM users WHERE team_id = public.current_app_team_id() AND role = 'player'
    )
  );

DROP POLICY IF EXISTS assignments_update_staff_or_self ON play_assignments;
CREATE POLICY assignments_update_staff_or_self ON play_assignments FOR UPDATE
  USING (
    play_id IN (
      SELECT id FROM tactical_plays WHERE team_id = public.current_app_team_id()
    )
    AND (
      public.is_team_staff()
      OR player_id = public.current_app_user_id()
    )
  )
  WITH CHECK (
    play_id IN (
      SELECT id FROM tactical_plays WHERE team_id = public.current_app_team_id()
    )
    AND (
      public.is_team_staff()
      OR player_id = public.current_app_user_id()
    )
  );

-- ── play_suggestions ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS suggestions_select_team ON play_suggestions;
CREATE POLICY suggestions_select_team ON play_suggestions FOR SELECT
  USING (
    play_id IN (
      SELECT id FROM tactical_plays WHERE team_id = public.current_app_team_id()
    )
    AND (
      public.is_team_staff()
      OR player_id = public.current_app_user_id()
    )
  );

DROP POLICY IF EXISTS suggestions_insert_when_allowed ON play_suggestions;
CREATE POLICY suggestions_insert_when_allowed ON play_suggestions FOR INSERT
  WITH CHECK (
    player_id = public.current_app_user_id()
    AND public.current_app_role() = 'player'
    AND EXISTS (
      SELECT 1
      FROM tactical_plays p
      JOIN users u ON u.id = public.current_app_user_id()
      WHERE p.id = play_suggestions.play_id
        AND p.team_id = public.current_app_team_id()
        AND p.allow_suggestions = TRUE
        AND u.consent_status = 'active'
    )
  );

DROP POLICY IF EXISTS suggestions_update_staff ON play_suggestions;
CREATE POLICY suggestions_update_staff ON play_suggestions FOR UPDATE
  USING (
    public.is_team_staff()
    AND play_id IN (
      SELECT id FROM tactical_plays WHERE team_id = public.current_app_team_id()
    )
  )
  WITH CHECK (
    public.is_team_staff()
    AND play_id IN (
      SELECT id FROM tactical_plays WHERE team_id = public.current_app_team_id()
    )
  );

-- ── Seed sample Horns set for MAC-U16 (reuse system coach id from 006) ───────
INSERT INTO tactical_plays (
  id,
  team_id,
  title,
  media_url,
  allow_suggestions,
  board_json
)
VALUES (
  '88888888-8888-8888-8888-888888888881',
  '22222222-2222-2222-2222-222222222222',
  'סט הורן — חיתוך מצד חלש',
  NULL,
  TRUE,
  '{"markers":[{"x":22,"y":70,"label":"1"},{"x":50,"y":55,"label":"4"},{"x":78,"y":70,"label":"2"},{"x":35,"y":35,"label":"5"},{"x":65,"y":35,"label":"3"}]}'
)
ON CONFLICT (id) DO NOTHING;
