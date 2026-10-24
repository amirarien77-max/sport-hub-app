-- =============================================================================
-- 017_weekly_schedule: לו״ז שבועי קבוע (תבנית) — יום / שעות / מיקום.
-- (015 reserved for profile/meetings/equipment on parallel PRD branch.)
-- נפרד מ־events (אירועים חד-פעמיים). שבוע ישראלי: 0=ראשון … 6=שבת.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS).
-- =============================================================================

CREATE TABLE IF NOT EXISTS weekly_schedule_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- 0 = Sunday (יום ראשון), 6 = Saturday (שבת)
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location VARCHAR(160) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT weekly_schedule_slots_time_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS weekly_schedule_slots_team_day_idx
  ON weekly_schedule_slots (team_id, day_of_week, start_time);

ALTER TABLE weekly_schedule_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_schedule_select_team ON weekly_schedule_slots;
CREATE POLICY weekly_schedule_select_team ON weekly_schedule_slots
  FOR SELECT
  USING (team_id = public.current_app_team_id());

DROP POLICY IF EXISTS weekly_schedule_insert_staff ON weekly_schedule_slots;
CREATE POLICY weekly_schedule_insert_staff ON weekly_schedule_slots
  FOR INSERT
  WITH CHECK (
    team_id = public.current_app_team_id()
    AND public.is_team_staff()
  );

DROP POLICY IF EXISTS weekly_schedule_update_staff ON weekly_schedule_slots;
CREATE POLICY weekly_schedule_update_staff ON weekly_schedule_slots
  FOR UPDATE
  USING (
    team_id = public.current_app_team_id()
    AND public.is_team_staff()
  )
  WITH CHECK (
    team_id = public.current_app_team_id()
    AND public.is_team_staff()
  );

DROP POLICY IF EXISTS weekly_schedule_delete_staff ON weekly_schedule_slots;
CREATE POLICY weekly_schedule_delete_staff ON weekly_schedule_slots
  FOR DELETE
  USING (
    team_id = public.current_app_team_id()
    AND public.is_team_staff()
  );

-- Keep updated_at fresh on coach edits
CREATE OR REPLACE FUNCTION public.touch_weekly_schedule_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS weekly_schedule_slots_touch ON weekly_schedule_slots;
CREATE TRIGGER weekly_schedule_slots_touch
  BEFORE UPDATE ON weekly_schedule_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_weekly_schedule_updated_at();

-- ── Hapoel Jerusalem U16 demo seed (club/team from seed + 013) ───────────────
INSERT INTO weekly_schedule_slots (id, team_id, day_of_week, start_time, end_time, location, created_by)
VALUES
  (
    '88888888-8888-8888-8888-888888888881',
    '22222222-2222-2222-2222-222222222222',
    0, -- Sunday
    '17:00',
    '18:30',
    'אולם א׳ — מלחה',
    '33333333-3333-3333-3333-333333333333'
  ),
  (
    '88888888-8888-8888-8888-888888888882',
    '22222222-2222-2222-2222-222222222222',
    2, -- Tuesday
    '17:00',
    '18:30',
    'אולם א׳ — מלחה',
    '33333333-3333-3333-3333-333333333333'
  ),
  (
    '88888888-8888-8888-8888-888888888883',
    '22222222-2222-2222-2222-222222222222',
    4, -- Thursday
    '16:30',
    '18:00',
    'אולם ב׳ — גבעת רם',
    '33333333-3333-3333-3333-333333333333'
  ),
  (
    '88888888-8888-8888-8888-888888888884',
    '22222222-2222-2222-2222-222222222222',
    5, -- Friday
    '09:00',
    '10:30',
    'אולם א׳ — מלחה',
    '33333333-3333-3333-3333-333333333333'
  )
ON CONFLICT (id) DO NOTHING;
