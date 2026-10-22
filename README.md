# Basketball Player & Coach Hub

Expo Router (TypeScript) + Supabase app for youth basketball clubs — white-label onboarding, Dual-Ack schedule, court attendance, readiness/pain, and tactical plays.

Built against the project PRD (`docs/basketball-hub-prd.md` in the agent store).

## Stack

- **Client:** Expo SDK 58, Expo Router, TypeScript
- **Backend:** Supabase (PostgreSQL + RLS) — SQL in `supabase/migrations/`
- **Demo mode:** runs without Supabase credentials using in-memory mock data

## Quick start

```bash
cd basketball-data-hub
cp .env.example .env   # leave demo mode on
npm install
npx expo start
```

Demo invite code: **`MAC-U16-2026`**

Or use **Profile → Switch demo role** after onboarding for player / parent / head coach personas.

## Architecture (blocks)

| Block | Path | PRD module |
| --- | --- | --- |
| Onboarding | `src/blocks/onboarding/` | Invite codes, white-label, under-13 consent |
| Schedule | `src/blocks/schedule/` | Dual-Ack, attendance grid, carpool |
| Health | `src/blocks/health/` | RPE buttons, smart-zoom pain map, coach risk |
| Tactical | `src/blocks/tactical/` | Plays, assignments, suggestion toggle |
| Theme | `src/theme/` | Club brand injection |
| Session | `src/session/` | Demo state / future Supabase wiring |

Routes live in `src/app/` (Expo Router).

## Supabase

See **[docs/supabase-setup.md](docs/supabase-setup.md)** for live wiring:

1. Copy `.env.example` → `.env` and set URL, anon key, `EXPO_PUBLIC_DEMO_MODE=false`.
2. In the Supabase SQL Editor, run migrations `001`–`005` then `seed.sql` (in order).
3. Restart Expo (`npx expo start`).

Never commit `.env` or service-role keys.

## Scripts

- `npm start` / `npx expo start`
- `npm run typecheck`
