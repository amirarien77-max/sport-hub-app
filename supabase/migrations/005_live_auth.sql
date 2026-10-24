-- =============================================================================
-- 005_live_auth: lookup הזמנה לפני חברות + insert פרופיל עצמי (auth_id = auth.uid()).
-- להריץ אחרי 001–004 (ורצוי אחרי seed עם קוד הזמנה).
-- =============================================================================

-- Shared invite codes are meant to be looked up before membership exists.
CREATE POLICY teams_select_invite ON teams FOR SELECT
  USING (true);

CREATE POLICY clubs_select_invite ON clubs FOR SELECT
  USING (true);

-- Authenticated users may create / update their own profile row.
CREATE POLICY users_insert_self ON users FOR INSERT
  WITH CHECK (auth_id = auth.uid());

CREATE POLICY users_update_self ON users FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- Own row readable even before teammate membership resolves (bootstrap).
CREATE POLICY users_select_self ON users FOR SELECT
  USING (auth_id = auth.uid());
