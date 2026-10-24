-- =============================================================================
-- 013_hapoel_brand_and_sms_consent: מיתוג הפועל ירושלים + טבלת SMS אישור הורי
-- + RPC mark_parental_consent. קוד הזמנה → HAP-U16-2026. Safe to re-run.
-- =============================================================================

-- ── Demo club → הפועל ירושלים (red / black / white) ──────────────────────────
UPDATE clubs
SET
  name = 'הפועל ירושלים',
  primary_color = '#C8102E',
  secondary_color = '#1A1A1A',
  accent_color = '#F5F5F5'
WHERE id = '11111111-1111-1111-1111-111111111111';

UPDATE teams
SET
  name = 'נערים U16',
  invite_code = 'HAP-U16-2026'
WHERE id = '22222222-2222-2222-2222-222222222222';

-- ── Parental consent SMS requests ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parental_consent_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  parent_phone VARCHAR(32) NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'simulated', 'consented', 'failed')),
  provider VARCHAR(32) NOT NULL DEFAULT 'stub',
  sms_payload_log TEXT,
  sent_at TIMESTAMPTZ,
  consented_at TIMESTAMPTZ,
  consented_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parental_consent_requests_player_idx
  ON parental_consent_requests (player_id);
CREATE INDEX IF NOT EXISTS parental_consent_requests_team_status_idx
  ON parental_consent_requests (team_id, status);

ALTER TABLE parental_consent_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parental_consent_select_self_or_staff ON parental_consent_requests;
CREATE POLICY parental_consent_select_self_or_staff ON parental_consent_requests
  FOR SELECT
  USING (
    player_id = public.current_app_user_id()
    OR (
      public.is_team_staff()
      AND team_id = public.current_app_team_id()
    )
  );

DROP POLICY IF EXISTS parental_consent_insert_self ON parental_consent_requests;
CREATE POLICY parental_consent_insert_self ON parental_consent_requests
  FOR INSERT
  WITH CHECK (player_id = public.current_app_user_id());

DROP POLICY IF EXISTS parental_consent_update_self_or_staff ON parental_consent_requests;
CREATE POLICY parental_consent_update_self_or_staff ON parental_consent_requests
  FOR UPDATE
  USING (
    player_id = public.current_app_user_id()
    OR (
      public.is_team_staff()
      AND team_id = public.current_app_team_id()
    )
  )
  WITH CHECK (
    player_id = public.current_app_user_id()
    OR (
      public.is_team_staff()
      AND team_id = public.current_app_team_id()
    )
  );

-- Coach/admin may mark a teammate under-13 player as parent-consented.
CREATE OR REPLACE FUNCTION public.mark_parental_consent(p_player_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team UUID;
  v_status consent_status;
BEGIN
  IF NOT public.is_team_staff() THEN
    RAISE EXCEPTION 'not_staff';
  END IF;

  SELECT team_id, consent_status INTO v_team, v_status
  FROM users
  WHERE id = p_player_id;

  IF v_team IS NULL OR v_team <> public.current_app_team_id() THEN
    RAISE EXCEPTION 'not_teammate';
  END IF;

  UPDATE users
  SET consent_status = 'active'
  WHERE id = p_player_id;

  UPDATE parental_consent_requests
  SET
    status = 'consented',
    consented_at = NOW(),
    consented_by = public.current_app_user_id()
  WHERE player_id = p_player_id
    AND status IN ('pending', 'sent', 'simulated', 'failed');

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_parental_consent(UUID) TO authenticated;

COMMENT ON TABLE parental_consent_requests IS
  'Under-13 parental SMS consent attempts; Twilio when secrets set, else simulated log.';
