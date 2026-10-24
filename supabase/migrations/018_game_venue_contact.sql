-- =============================================================================
-- 018_game_venue_contact: כתובת אולם + טלפון ליצירת קשר על אירועי משחק.
-- עמודות nullable על events (מוצגות ב־UI למשחקים).
-- events_update_staff already applied in 016_events_update_staff — not recreated here.
-- Safe to re-run (IF NOT EXISTS).
-- =============================================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS hall_address VARCHAR(240),
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(32);

COMMENT ON COLUMN events.hall_address IS
  'כתובת אולם / venue address — primarily for games; optional for practices.';
COMMENT ON COLUMN events.contact_phone IS
  'מספר טלפון ליצירת קשר for the venue / game day contact.';
