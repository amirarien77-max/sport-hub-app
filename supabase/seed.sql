-- Demo seed: הפועל ירושלים (Hapoel Jerusalem) — canonical invite HAP-U16-2026
-- Legacy alias MAC-U16-2026 is accepted in the app client (maps to HAP).
INSERT INTO clubs (id, name, primary_color, secondary_color, accent_color)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'הפועל ירושלים',
  '#C8102E',
  '#1A1A1A',
  '#F5F5F5'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  primary_color = EXCLUDED.primary_color,
  secondary_color = EXCLUDED.secondary_color,
  accent_color = EXCLUDED.accent_color;

INSERT INTO teams (id, club_id, name, invite_code, has_fitness_staff, has_physio_staff)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'נערים U16',
  'HAP-U16-2026',
  FALSE,
  FALSE
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  invite_code = EXCLUDED.invite_code,
  club_id = EXCLUDED.club_id;
