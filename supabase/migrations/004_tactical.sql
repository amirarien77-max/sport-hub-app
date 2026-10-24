-- =============================================================================
-- 004_tactical: תרגילים, שיבוצים, הצעות (מודול 4). board_json / game_iq ב־010–012.
-- =============================================================================

CREATE TABLE tactical_plays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  media_url TEXT,
  allow_suggestions BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE play_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  play_id UUID REFERENCES tactical_plays(id) ON DELETE CASCADE,
  player_id UUID REFERENCES users(id) ON DELETE CASCADE,
  position_name VARCHAR(50),
  action_prompt_question TEXT,
  player_answer TEXT
);

CREATE TABLE play_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  play_id UUID REFERENCES tactical_plays(id) ON DELETE CASCADE,
  player_id UUID REFERENCES users(id) ON DELETE CASCADE,
  suggestion_text TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE team_feed_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT,
  is_urgent BOOLEAN DEFAULT FALSE,
  emoji_only BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE urgent_acks (
  post_id UUID REFERENCES team_feed_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE tactical_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE urgent_acks ENABLE ROW LEVEL SECURITY;

CREATE POLICY plays_select_team ON tactical_plays FOR SELECT
  USING (team_id IN (SELECT team_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY suggestions_insert_when_allowed ON play_suggestions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tactical_plays p
      JOIN users u ON u.team_id = p.team_id
      WHERE p.id = play_id
        AND p.allow_suggestions = TRUE
        AND u.auth_id = auth.uid()
        AND u.role = 'player'
        AND u.consent_status = 'active'
    )
  );
