-- =============================================================================
-- 007_claim_carpool_seat: RPC אטומי לתפיסת מושב (SECURITY DEFINER).
-- הלקוח מעדיף את זה; נסיגה ל־UPDATE מותנה אם הפונקציה חסרה.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_carpool_seat(p_offer_id uuid)
RETURNS TABLE (id uuid, seats_taken int, seats_available int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team uuid := public.current_app_team_id();
  v_taken int;
  v_available int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_team IS NULL THEN
    RAISE EXCEPTION 'not_a_team_member';
  END IF;

  SELECT c.seats_taken, c.seats_available
  INTO v_taken, v_available
  FROM carpool_offers c
  JOIN events e ON e.id = c.event_id
  WHERE c.id = p_offer_id
    AND e.team_id = v_team
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'offer_not_found';
  END IF;

  IF v_taken >= v_available THEN
    RAISE EXCEPTION 'offer_full';
  END IF;

  RETURN QUERY
  UPDATE carpool_offers c
  SET seats_taken = c.seats_taken + 1
  WHERE c.id = p_offer_id
  RETURNING c.id, c.seats_taken, c.seats_available;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_carpool_seat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_carpool_seat(uuid) TO anon;
