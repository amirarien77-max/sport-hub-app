-- =============================================================================
-- 019_drill_overlay: cache ל־AI overlay על וידאו תרגיל (מסלולים/חצים מתוזמנים).
-- Safe to re-run.
-- =============================================================================

ALTER TABLE public.tactical_plays
  ADD COLUMN IF NOT EXISTS drill_overlay_json TEXT;

COMMENT ON COLUMN public.tactical_plays.drill_overlay_json IS
  'Cached AI drill video overlay JSON {mode,summary,durationSec,keyframes,generatedAt}';

-- Staff may update via existing plays_update_staff policy.
