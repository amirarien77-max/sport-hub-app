-- Daily readiness + pain map (PRD Module 3)

CREATE TYPE pain_severity AS ENUM ('soreness', 'disabling');

CREATE TABLE readiness_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  rpe SMALLINT NOT NULL CHECK (rpe BETWEEN 1 AND 10),
  sleep_hours NUMERIC(3,1) NOT NULL CHECK (sleep_hours >= 0 AND sleep_hours <= 24),
  water_liters NUMERIC(3,1) NOT NULL CHECK (water_liters >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (player_id, report_date)
);

CREATE TABLE pain_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region VARCHAR(40) NOT NULL,
  sub_region VARCHAR(60) NOT NULL,
  severity pain_severity NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE readiness_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pain_reports ENABLE ROW LEVEL SECURITY;

-- Players manage own reports; medical staff / inheriting head coach read team.
CREATE POLICY readiness_own ON readiness_reports
  FOR ALL
  USING (player_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY pain_own ON pain_reports
  FOR ALL
  USING (player_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY readiness_staff_read ON readiness_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users me
      JOIN users player ON player.id = readiness_reports.player_id
      WHERE me.auth_id = auth.uid()
        AND me.team_id = player.team_id
        AND me.role IN ('fitness_coach','physio','head_coach','admin')
    )
  );

CREATE POLICY pain_staff_read ON pain_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users me
      JOIN users player ON player.id = pain_reports.player_id
      WHERE me.auth_id = auth.uid()
        AND me.team_id = player.team_id
        AND me.role IN ('fitness_coach','physio','head_coach','admin')
    )
  );

-- Parents must never see other players' medical data (enforced: no parent policy).
