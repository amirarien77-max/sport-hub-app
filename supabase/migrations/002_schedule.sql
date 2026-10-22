-- Schedule, Dual-Ack, attendance, carpool (PRD Module 2)

CREATE TYPE event_type AS ENUM ('practice', 'game');
CREATE TYPE rsvp_choice AS ENUM ('attending', 'not_attending');
CREATE TYPE attendance_mark AS ENUM ('present', 'excused', 'no_show');

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  location VARCHAR(160),
  type event_type NOT NULL DEFAULT 'practice',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_rsvps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_choice rsvp_choice,
  player_reason VARCHAR(80),
  parent_choice rsvp_choice,
  parent_reason VARCHAR(80),
  UNIQUE (event_id, player_id)
);

CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mark attendance_mark,
  locked_at TIMESTAMPTZ,
  UNIQUE (event_id, player_id)
);

CREATE TABLE carpool_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seats_available INT NOT NULL CHECK (seats_available > 0),
  seats_taken INT NOT NULL DEFAULT 0 CHECK (seats_taken >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE carpool_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_select_team ON events FOR SELECT
  USING (team_id IN (SELECT team_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY rsvps_select_team ON event_rsvps FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM events e
      JOIN users u ON u.team_id = e.team_id
      WHERE u.auth_id = auth.uid()
    )
  );

CREATE POLICY attendance_select_staff ON attendance_records FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM events e
      JOIN users u ON u.team_id = e.team_id
      WHERE u.auth_id = auth.uid()
        AND u.role IN ('admin','head_coach','assistant_coach')
    )
  );
