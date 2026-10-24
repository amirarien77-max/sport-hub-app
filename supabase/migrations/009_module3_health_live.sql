-- =============================================================================
-- 009_module3_health_live: תקרת water 0–24, סנכרון flags כושר/פיזיו,
-- RLS בריאות (הורים ללא SELECT רפואי). תואם coachHealthAccess באפליקציה.
-- =============================================================================

-- ── Water liters upper bound (match app 0–24) ────────────────────────────────
ALTER TABLE readiness_reports
  DROP CONSTRAINT IF EXISTS readiness_reports_water_liters_check;

ALTER TABLE readiness_reports
  ADD CONSTRAINT readiness_reports_water_liters_check
  CHECK (water_liters >= 0 AND water_liters <= 24);

-- ── Sync teams.has_fitness_staff / has_physio_staff from roster roles ────────
CREATE OR REPLACE FUNCTION public.sync_team_medical_staff_flags(p_team_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_team_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE teams
  SET
    has_fitness_staff = EXISTS (
      SELECT 1 FROM users u
      WHERE u.team_id = p_team_id AND u.role = 'fitness_coach'
    ),
    has_physio_staff = EXISTS (
      SELECT 1 FROM users u
      WHERE u.team_id = p_team_id AND u.role = 'physio'
    )
  WHERE id = p_team_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_team_medical_staff_flags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_team_medical_staff_flags(OLD.team_id);
    RETURN OLD;
  END IF;

  PERFORM public.sync_team_medical_staff_flags(NEW.team_id);
  IF TG_OP = 'UPDATE' AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    PERFORM public.sync_team_medical_staff_flags(OLD.team_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_sync_medical_staff_flags ON users;
CREATE TRIGGER users_sync_medical_staff_flags
  AFTER INSERT OR UPDATE OF role, team_id OR DELETE ON users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_team_medical_staff_flags();

-- Backfill flags for existing teams
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM teams LOOP
    PERFORM public.sync_team_medical_staff_flags(r.id);
  END LOOP;
END;
$$;

-- ── Who may read team medical data (not parents / players of others) ─────────
CREATE OR REPLACE FUNCTION public.is_health_staff_reader()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_app_role() IN (
    'admin',
    'head_coach',
    'assistant_coach',
    'fitness_coach',
    'physio'
  );
$$;

-- Head coach inherits write when no fitness/physio on team (app + future notes).
CREATE OR REPLACE FUNCTION public.has_health_write_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.current_app_role()
    WHEN 'fitness_coach' THEN true
    WHEN 'physio' THEN true
    WHEN 'admin' THEN true
    WHEN 'head_coach' THEN EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = public.current_app_team_id()
        AND COALESCE(t.has_fitness_staff, false) = false
        AND COALESCE(t.has_physio_staff, false) = false
    )
    ELSE false
  END;
$$;

-- ── RLS: keep own-row write; staff read includes assistant_coach ──────────────
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
    public.is_health_staff_reader()
    AND player_id IN (
      SELECT id FROM users WHERE team_id = public.current_app_team_id() AND role = 'player'
    )
  );

DROP POLICY IF EXISTS pain_staff_read ON pain_reports;
CREATE POLICY pain_staff_read ON pain_reports FOR SELECT
  USING (
    public.is_health_staff_reader()
    AND player_id IN (
      SELECT id FROM users WHERE team_id = public.current_app_team_id() AND role = 'player'
    )
  );

-- Explicit: no parent policies on readiness_reports / pain_reports.
