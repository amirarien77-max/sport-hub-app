-- =============================================================================
-- 020_role_profile_fixes: role-specific product fixes
-- - player_meetings.media_url (video on שיחות שמורות)
-- - parent SELECT on readiness/pain for linked children only
-- - equipment_manager SELECT on team_players (club-wide sizes rollup)
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =============================================================================

-- ── 1. Meeting media (coach video attach on תיק אישי / שיחות שמורות) ─────────
ALTER TABLE player_meetings
  ADD COLUMN IF NOT EXISTS media_url TEXT;

-- ── 2. Parent read-only health for linked child(ren) only ────────────────────
-- Checkpoint 3: never expose other players' medical data to a parent.
-- Replaces the prior "no parent policies" stance with linked-child SELECT.
DROP POLICY IF EXISTS readiness_parent_linked_read ON readiness_reports;
CREATE POLICY readiness_parent_linked_read ON readiness_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_player_links l
      WHERE l.parent_id = public.current_app_user_id()
        AND l.player_id = readiness_reports.player_id
    )
  );

DROP POLICY IF EXISTS pain_parent_linked_read ON pain_reports;
CREATE POLICY pain_parent_linked_read ON pain_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_player_links l
      WHERE l.parent_id = public.current_app_user_id()
        AND l.player_id = pain_reports.player_id
    )
  );

-- ── 3. Equipment manager: club-wide roster sizes (team_players) ───────────────
DROP POLICY IF EXISTS team_players_select_equipment_manager ON team_players;
CREATE POLICY team_players_select_equipment_manager ON team_players FOR SELECT
  USING (
    public.is_equipment_manager()
    AND EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_players.team_id
        AND t.club_id = public.current_app_club_id()
    )
  );
