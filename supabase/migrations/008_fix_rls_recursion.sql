-- Fix infinite RLS recursion on users (and policies that subquery users).
-- Root: users_select_teammates selected from users → re-entered the same policy.
-- Also rewrite member/select policies to use SECURITY DEFINER helpers from 006.

CREATE OR REPLACE FUNCTION public.current_app_club_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club_id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ── users ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS users_select_teammates ON users;
CREATE POLICY users_select_teammates ON users FOR SELECT
  USING (team_id = public.current_app_team_id());

-- ── teams / clubs (invite policies remain USING true) ────────────────────────
DROP POLICY IF EXISTS teams_select_member ON teams;
CREATE POLICY teams_select_member ON teams FOR SELECT
  USING (id = public.current_app_team_id());

DROP POLICY IF EXISTS clubs_select_member ON clubs;
CREATE POLICY clubs_select_member ON clubs FOR SELECT
  USING (id = public.current_app_club_id());

-- ── schedule ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS events_select_team ON events;
CREATE POLICY events_select_team ON events FOR SELECT
  USING (team_id = public.current_app_team_id());

DROP POLICY IF EXISTS rsvps_select_team ON event_rsvps;
CREATE POLICY rsvps_select_team ON event_rsvps FOR SELECT
  USING (
    event_id IN (
      SELECT id FROM events WHERE team_id = public.current_app_team_id()
    )
  );

DROP POLICY IF EXISTS attendance_select_staff ON attendance_records;
CREATE POLICY attendance_select_staff ON attendance_records FOR SELECT
  USING (
    public.is_team_staff()
    AND event_id IN (
      SELECT id FROM events WHERE team_id = public.current_app_team_id()
    )
  );

-- ── health ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS readiness_own ON readiness_reports;
CREATE POLICY readiness_own ON readiness_reports
  FOR ALL
  USING (player_id = public.current_app_user_id())
  WITH CHECK (player_id = public.current_app_user_id());

DROP POLICY IF EXISTS pain_own ON pain_reports;
CREATE POLICY pain_own ON pain_reports
  FOR ALL
  USING (player_id = public.current_app_user_id())
  WITH CHECK (player_id = public.current_app_user_id());

DROP POLICY IF EXISTS readiness_staff_read ON readiness_reports;
CREATE POLICY readiness_staff_read ON readiness_reports FOR SELECT
  USING (
    public.current_app_role() IN ('fitness_coach', 'physio', 'head_coach', 'admin')
    AND player_id IN (
      SELECT id FROM users WHERE team_id = public.current_app_team_id()
    )
  );

DROP POLICY IF EXISTS pain_staff_read ON pain_reports;
CREATE POLICY pain_staff_read ON pain_reports FOR SELECT
  USING (
    public.current_app_role() IN ('fitness_coach', 'physio', 'head_coach', 'admin')
    AND player_id IN (
      SELECT id FROM users WHERE team_id = public.current_app_team_id()
    )
  );

-- ── tactical ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS plays_select_team ON tactical_plays;
CREATE POLICY plays_select_team ON tactical_plays FOR SELECT
  USING (team_id = public.current_app_team_id());

DROP POLICY IF EXISTS suggestions_insert_when_allowed ON play_suggestions;
CREATE POLICY suggestions_insert_when_allowed ON play_suggestions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM tactical_plays p
      WHERE p.id = play_suggestions.play_id
        AND p.allow_suggestions = true
        AND p.team_id = public.current_app_team_id()
    )
    AND public.current_app_role() = 'player'
    AND player_id = public.current_app_user_id()
  );
