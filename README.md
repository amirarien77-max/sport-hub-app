# Basketball Player & Coach Hub

Expo Router (TypeScript) + Supabase app for youth basketball clubs — white-label onboarding, Dual-Ack schedule, court attendance, readiness/pain, and tactical plays.

**UI language:** Hebrew (RTL). Strings live in `src/i18n/`.

**Demo club:** הפועל ירושלים (red `#C8102E` / black `#1A1A1A`). Canonical invite **`HAP-U16-2026`** (legacy alias **`MAC-U16-2026`** still works).

Built against the project PRD (`docs/basketball-hub-prd.md` in the agent store).

## Stack

- **Client:** Expo SDK 58, Expo Router, TypeScript
- **Backend:** Supabase (PostgreSQL + RLS) — SQL in `supabase/migrations/`
- **Demo mode:** runs without Supabase credentials using in-memory mock data
- **i18n / RTL:** `src/i18n/` + `expo-localization` (`forcesRTL`)

## Quick start

```bash
cd sport-hub-app
cp .env.example .env   # leave demo mode on
npm install
npx expo start
```

Demo invite code: **`HAP-U16-2026`** (or `MAC-U16-2026`)

Or use **פרופיל → החלפת תפקיד דמו** after onboarding for player / parent / head coach personas.

> After the first load with RTL forced, Expo Go may ask you to reload once so layout flips correctly.

## Architecture (blocks)

| Block | Path | PRD module |
| --- | --- | --- |
| Onboarding | `src/blocks/onboarding/` | Invite codes, white-label, under-13 consent |
| Schedule | `src/blocks/schedule/` | Dual-Ack, attendance grid, carpool |
| Health | `src/blocks/health/` | RPE buttons, smart-zoom pain map, coach risk |
| Tactical | `src/blocks/tactical/` | Plays, assignments, suggestion toggle, Game IQ, media |
| Theme | `src/theme/` | Club brand injection |
| Session | `src/session/` | Demo state / Supabase wiring |
| i18n | `src/i18n/` | Hebrew copy + RTL helpers |

Routes live in `src/app/` (Expo Router).

## Supabase

See **[docs/supabase-setup.md](docs/supabase-setup.md)** for live wiring:

1. Copy `.env.example` → `.env` and set URL, anon key, `EXPO_PUBLIC_DEMO_MODE=false`.
2. In the Supabase SQL Editor, run migrations then `seed.sql` (in order).
3. Restart Expo (`npx expo start`).

Never commit `.env` or service-role keys. Twilio / OpenAI secrets belong in Edge Function secrets, not `EXPO_PUBLIC_*`.

## Scripts

- `npm start` / `npx expo start`
- `npm run typecheck`
