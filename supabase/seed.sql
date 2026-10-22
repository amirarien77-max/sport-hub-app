-- Demo seed aligned with MAC-U16-2026
INSERT INTO clubs (id, name, primary_color, secondary_color, accent_color)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Maccabi Youth',
  '#0B1F3A',
  '#F5B700',
  '#E63946'
);

INSERT INTO teams (id, club_id, name, invite_code, has_fitness_staff, has_physio_staff)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'U16 Boys',
  'MAC-U16-2026',
  FALSE,
  FALSE
);
