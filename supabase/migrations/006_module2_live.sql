-- Module 2 live: RLS writes for Dual-Ack / attendance / carpool / urgent banner
-- + seed schedule rows for MAC-U16 team. Safe to re-run (IF NOT EXISTS / ON CONFLICT).

-- ── Helpers (SECURITY DEFINER avoids recursive RLS on users) ─────────────────
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_team_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_team_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
      AND role IN ('admin', 'head_coach', 'assistant_coach')
  );
$$;

-- ── Events: team read (already) + staff insert for future coach UI ───────────
DROP POLICY IF EXISTS events_insert_staff ON events;
CREATE POLICY events_insert_staff ON events FOR INSERT
  WITH CHECK (
    team_id = public.current_app_team_id()
    AND public.is_team_staff()
  );

-- ── Dual-Ack RSVPs ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rsvps_insert_self_or_parent ON event_rsvps;
CREATE POLICY rsvps_insert_self_or_parent ON event_rsvps FOR INSERT
  WITH CHECK (
    event_id IN (SELECT id FROM events WHERE team_id = public.current_app_team_id())
    AND (
      player_id = public.current_app_user_id()
      OR EXISTS (
        SELECT 1 FROM parent_player_links l
        WHERE l.parent_id = public.current_app_user_id()
          AND l.player_id = event_rsvps.player_id
      )
      OR public.is_team_staff()
    )
  );

DROP POLICY IF EXISTS rsvps_update_self_or_parent ON event_rsvps;
CREATE POLICY rsvps_update_self_or_parent ON event_rsvps FOR UPDATE
  USING (
    event_id IN (SELECT id FROM events WHERE team_id = public.current_app_team_id())
    AND (
      player_id = public.current_app_user_id()
      OR EXISTS (
        SELECT 1 FROM parent_player_links l
        WHERE l.parent_id = public.current_app_user_id()
          AND l.player_id = event_rsvps.player_id
      )
      OR public.is_team_staff()
    )
  )
  WITH CHECK (
    event_id IN (SELECT id FROM events WHERE team_id = public.current_app_team_id())
  );

-- ── Court attendance (staff write; staff select already exists) ──────────────
DROP POLICY IF EXISTS attendance_upsert_staff ON attendance_records;
CREATE POLICY attendance_upsert_staff ON attendance_records FOR INSERT
  WITH CHECK (
    public.is_team_staff()
    AND event_id IN (SELECT id FROM events WHERE team_id = public.current_app_team_id())
  );

DROP POLICY IF EXISTS attendance_update_staff ON attendance_records;
CREATE POLICY attendance_update_staff ON attendance_records FOR UPDATE
  USING (
    public.is_team_staff()
    AND event_id IN (SELECT id FROM events WHERE team_id = public.current_app_team_id())
  )
  WITH CHECK (
    public.is_team_staff()
    AND event_id IN (SELECT id FROM events WHERE team_id = public.current_app_team_id())
  );

-- ── Carpool ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS carpool_select_team ON carpool_offers;
CREATE POLICY carpool_select_team ON carpool_offers FOR SELECT
  USING (
    event_id IN (SELECT id FROM events WHERE team_id = public.current_app_team_id())
  );

DROP POLICY IF EXISTS carpool_insert_parent ON carpool_offers;
CREATE POLICY carpool_insert_parent ON carpool_offers FOR INSERT
  WITH CHECK (
    parent_id = public.current_app_user_id()
    AND public.current_app_role() = 'parent'
    AND event_id IN (SELECT id FROM events WHERE team_id = public.current_app_team_id())
  );

DROP POLICY IF EXISTS carpool_update_team ON carpool_offers;
CREATE POLICY carpool_update_team ON carpool_offers FOR UPDATE
  USING (
    event_id IN (SELECT id FROM events WHERE team_id = public.current_app_team_id())
  )
  WITH CHECK (
    event_id IN (SELECT id FROM events WHERE team_id = public.current_app_team_id())
    AND seats_taken <= seats_available
  );

-- ── Parent ↔ player links ────────────────────────────────────────────────────
DROP POLICY IF EXISTS links_select_own_team ON parent_player_links;
CREATE POLICY links_select_own_team ON parent_player_links FOR SELECT
  USING (
    parent_id IN (SELECT id FROM users WHERE team_id = public.current_app_team_id())
    OR player_id IN (SELECT id FROM users WHERE team_id = public.current_app_team_id())
  );

DROP POLICY IF EXISTS links_insert_parent ON parent_player_links;
CREATE POLICY links_insert_parent ON parent_player_links FOR INSERT
  WITH CHECK (
    parent_id = public.current_app_user_id()
    AND public.current_app_role() = 'parent'
    AND player_id IN (
      SELECT id FROM users
      WHERE team_id = public.current_app_team_id()
        AND role = 'player'
    )
  );

-- ── Urgent banner (team_feed_posts.is_urgent) + acks ─────────────────────────
DROP POLICY IF EXISTS feed_select_team ON team_feed_posts;
CREATE POLICY feed_select_team ON team_feed_posts FOR SELECT
  USING (team_id = public.current_app_team_id());

DROP POLICY IF EXISTS feed_insert_staff ON team_feed_posts;
CREATE POLICY feed_insert_staff ON team_feed_posts FOR INSERT
  WITH CHECK (
    team_id = public.current_app_team_id()
    AND author_id = public.current_app_user_id()
    AND public.is_team_staff()
  );

DROP POLICY IF EXISTS urgent_acks_select_team ON urgent_acks;
CREATE POLICY urgent_acks_select_team ON urgent_acks FOR SELECT
  USING (
    post_id IN (
      SELECT id FROM team_feed_posts WHERE team_id = public.current_app_team_id()
    )
  );

DROP POLICY IF EXISTS urgent_acks_insert_self ON urgent_acks;
CREATE POLICY urgent_acks_insert_self ON urgent_acks FOR INSERT
  WITH CHECK (
    user_id = public.current_app_user_id()
    AND post_id IN (
      SELECT id FROM team_feed_posts WHERE team_id = public.current_app_team_id()
    )
  );

-- ── Seed schedule content for MAC-U16 (club/team from seed.sql) ──────────────
INSERT INTO users (id, club_id, team_id, full_name, role, consent_status)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'מאמן מערכת',
  'head_coach',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, club_id, team_id, full_name, role, consent_status)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'הורה מערכת',
  'parent',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (id, team_id, title, starts_at, location, type)
VALUES (
  '55555555-5555-5555-5555-555555555551',
  '22222222-2222-2222-2222-222222222222',
  'אימון — פיק אנד רול',
  NOW() + INTERVAL '26 hours',
  'אולם א׳',
  'practice'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (id, team_id, title, starts_at, location, type)
VALUES (
  '55555555-5555-5555-5555-555555555552',
  '22222222-2222-2222-2222-222222222222',
  'משחק מול הרצליה',
  NOW() + INTERVAL '72 hours',
  'אולם חוץ',
  'game'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO carpool_offers (id, event_id, parent_id, seats_available, seats_taken)
VALUES (
  '66666666-6666-6666-6666-666666666661',
  '55555555-5555-5555-5555-555555555552',
  '44444444-4444-4444-4444-444444444444',
  3,
  1
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO team_feed_posts (id, team_id, author_id, body, is_urgent, emoji_only)
VALUES (
  '77777777-7777-7777-7777-777777777771',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  'האימון הועבר לאולם ב׳ מחר — להגיע 15 דקות מוקדם.',
  TRUE,
  FALSE
)
ON CONFLICT (id) DO NOTHING;
