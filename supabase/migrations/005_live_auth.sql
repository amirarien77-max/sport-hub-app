-- Live onboarding: invite lookup + self-service profile insert
-- Run after 001–004 (and ideally after seed.sql so MAC-U16-2026 exists).

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
