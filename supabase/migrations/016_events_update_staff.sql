-- =============================================================================
-- 016_events_update_staff: PRD v1.1 Step 3 QA fixes
-- 1) Live DB had events INSERT+SELECT only; coach calendar edit needs UPDATE.
-- 2) Harden Swish RPCs: revoke EXECUTE from anon/PUBLIC (authenticated only).
-- Safe to re-run (DROP POLICY IF EXISTS / REVOKE+GRANT).
-- =============================================================================

DROP POLICY IF EXISTS events_update_staff ON events;
CREATE POLICY events_update_staff ON events FOR UPDATE
  USING (
    team_id = public.current_app_team_id()
    AND public.is_team_staff()
  )
  WITH CHECK (
    team_id = public.current_app_team_id()
    AND public.is_team_staff()
  );

-- Swish credential RPCs must not be callable by anon (functions still require
-- current_app_user_id(); this closes the unused grant surface).
REVOKE ALL ON FUNCTION public.save_swish_credentials(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_swish_credentials(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.clear_swish_credentials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_swish_credentials() TO authenticated;
