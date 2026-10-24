-- =============================================================================
-- 001_core: היררכיה Club > Team > Users + תפקידים + RLS בסיסי (PRD §3).
-- בסיס לכל המודולים; אל תשנו enums בלי migration המשך.
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL,
  primary_color VARCHAR(7) NOT NULL DEFAULT '#C8102E',
  secondary_color VARCHAR(7) NOT NULL DEFAULT '#1A1A1A',
  accent_color VARCHAR(7) NOT NULL DEFAULT '#F5F5F5',
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  invite_code VARCHAR(32) NOT NULL UNIQUE,
  has_fitness_staff BOOLEAN DEFAULT FALSE,
  has_physio_staff BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE user_role AS ENUM (
  'admin',
  'head_coach',
  'assistant_coach',
  'fitness_coach',
  'physio',
  'player',
  'parent'
);

CREATE TYPE consent_status AS ENUM ('active', 'pending_parental_consent');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL,
  role user_role NOT NULL,
  date_of_birth DATE,
  parent_phone VARCHAR(32),
  consent_status consent_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE parent_player_links (
  parent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  player_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, player_id)
);

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_player_links ENABLE ROW LEVEL SECURITY;

-- Members can read their club/team; writes via service role / admin policies later.
CREATE POLICY clubs_select_member ON clubs FOR SELECT
  USING (id IN (SELECT club_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY teams_select_member ON teams FOR SELECT
  USING (id IN (SELECT team_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY users_select_teammates ON users FOR SELECT
  USING (team_id IN (SELECT team_id FROM users WHERE auth_id = auth.uid()));
