-- =============================================================================
-- 012_game_iq: עמודת game_iq_json על tactical_plays (cache ל־OpenAI / stub).
-- Safe to re-run.
-- =============================================================================

ALTER TABLE tactical_plays
  ADD COLUMN IF NOT EXISTS game_iq_json TEXT;

COMMENT ON COLUMN tactical_plays.game_iq_json IS
  'Last Game IQ insight JSON {mode,summary,coachBullets,playerBullets,generatedAt}';

-- Staff may update game_iq_json via existing plays_update_staff policy.
-- Players already SELECT team plays; cached insight is non-sensitive coaching copy.
