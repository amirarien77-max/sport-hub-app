-- =============================================================================
-- 011_module4_board_touch_notes: אין שינוי סכמה ללחיצות לוח (תיקון קליינט).
-- מאשר מחדש מדיניות כתיבה + grants אחרי 010. Safe to re-run.
-- =============================================================================

-- Ensure board_json exists (idempotent).
ALTER TABLE tactical_plays
  ADD COLUMN IF NOT EXISTS board_json TEXT;

-- Re-apply staff write policies (same as 010) in case an older env missed them.
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

GRANT SELECT, INSERT, UPDATE ON tactical_plays TO authenticated;
GRANT SELECT, INSERT, UPDATE ON play_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON play_suggestions TO authenticated;
