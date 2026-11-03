# Supabase setup (live mode)

Wire the Expo app to your Supabase project with env vars and SQL migrations. Do **not** put real keys in git.

## 1. Local env

```bash
cp .env.example .env
```

Edit `.env`:

- `EXPO_PUBLIC_SUPABASE_URL` — Project URL from Supabase → Settings → API  
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — the **anon** `public` key (never the `service_role`)  
- `EXPO_PUBLIC_DEMO_MODE=false`

`.env` is gitignored. Keep `.env.example` as placeholders only.

## 2. Apply SQL in the Supabase SQL Editor

Open **SQL Editor** in the Supabase dashboard and run these files **in order** (paste each file’s contents and run):

1. `supabase/migrations/001_core.sql`
2. `supabase/migrations/002_schedule.sql`
3. `supabase/migrations/003_health.sql`
4. `supabase/migrations/004_tactical.sql`
5. `supabase/migrations/005_live_auth.sql` (invite lookup + self profile insert policies)
6. `supabase/seed.sql` (demo club **הפועל ירושלים**, invite `HAP-U16-2026`)
7. `supabase/migrations/006_module2_live.sql` (Dual-Ack / attendance / carpool / urgent banner RLS + seed events)
8. `supabase/migrations/007_claim_carpool_seat.sql` (atomic RPC for carpool seat claim)
9. `supabase/migrations/008_fix_rls_recursion.sql` (SECURITY DEFINER helpers; health staff read)
10. `supabase/migrations/009_module3_health_live.sql` (water 0–24, fitness/physio flag sync, health RLS)
11. `supabase/migrations/010_module4_tactical_live.sql` (tactical RLS writes, board_json, seed Horns play)
12. `supabase/migrations/011_module4_board_touch_notes.sql` (re-assert coach INSERT/UPDATE policies + grants)
13. `supabase/migrations/012_game_iq.sql` (`game_iq_json` cache column on `tactical_plays`)
14. `supabase/migrations/013_hapoel_brand_and_sms_consent.sql` (Hapoel brand + parental SMS consent table/RPC)
15. `supabase/migrations/014_tactical_media_storage.sql` (Storage bucket `tactical-media` + RLS)
16. `supabase/migrations/015_profile_meetings_equipment.sql` (profile sizes, meetings, equipment + Swish)
17. `supabase/migrations/016_events_update_staff.sql` (events UPDATE for staff + Swish RPC harden)
18. `supabase/migrations/017_weekly_schedule.sql` (recurring weekly schedule slots + coach RLS)
19. `supabase/migrations/018_game_venue_contact.sql` (hall_address + contact_phone on events)
20. `supabase/migrations/019_drill_overlay.sql` (`drill_overlay_json` cache column on `tactical_plays`)

Skip any file you have already applied.

### Demo invite codes

| Code | Role |
|------|------|
| `HAP-U16-2026` | Canonical (הפועל ירושלים) |
| `MAC-U16-2026` | Legacy alias — app maps it to `HAP-U16-2026` |

### Game IQ Edge Function (optional OpenAI)

Deploy `supabase/functions/game-iq` and set secret `OPENAI_API_KEY` in the Supabase dashboard. Without the function or key, the app uses a clear Hebrew **offline stub** (same structured coach/player bullets). Never put OpenAI keys in `EXPO_PUBLIC_*`.

### Drill Overlay Edge Function (optional OpenAI)

Deploy `supabase/functions/drill-overlay` (same `OPENAI_API_KEY` secret). Apply migration `019_drill_overlay.sql` for the `drill_overlay_json` cache column. Without the function or key, the plays screen shows a Hebrew **demo overlay** timed across the full clip (paths/arrows on the in-app player). See `docs/ai-drill-video-overlay.md` in the project store / repo docs.

### Parental consent SMS (optional Twilio)

Deploy `supabase/functions/parental-consent-sms` and set Edge secrets:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

Without Twilio, the app **simulates** send (logs Hebrew payload) and coaches can **סמן כמאושר על ידי הורה** on the profile screen.

Enable **Email** auth under Authentication → Providers if it is not already on.

## 2b. Authentication → URL Configuration (required for email confirm)

If Site URL / Redirect URLs are wrong, the confirmation email opens **localhost** or Chrome shows **«לא ניתן לגשת ל-null»**.

In the Supabase dashboard go to **Authentication → URL Configuration** and set:

| Field | Recommended value |
|-------|-------------------|
| **Site URL** | Dev: `http://localhost:8081` (Expo web). Prod: your real HTTPS origin. |
| **Redirect URLs** | Allow-list every URL the app may pass as `emailRedirectTo` (see below). |

Add **all** of these Redirect URLs that you use (wildcards allowed per Supabase docs):

```
http://localhost:8081
http://localhost:8081/**
http://127.0.0.1:8081
http://127.0.0.1:8081/**
basketballhub://
basketballhub://*
exp://**
```

Plus your production web origin when you have one, e.g. `https://your-app.example.com/**`.

The app sets `emailRedirectTo` via `getAuthEmailRedirectTo()` (`src/lib/auth-redirect.ts`):

1. `EXPO_PUBLIC_AUTH_REDIRECT_URL` if set (use this for production)
2. Else `Linking.createURL('/')` with scheme `basketballhub` (web → current origin; Expo Go → `exp://…`; native → `basketballhub://`)
3. Else web `window.location.origin` / fallback `basketballhub://`

Never leave Site URL empty. Never rely on an undefined redirect — that produced the null / localhost failures.

**Confirm email toggle:** Authentication → Providers → Email → **Confirm email**. While ON, `signUp` returns no session until the user clicks the mail link (or an admin sets `email_confirmed_at`). For local-only testing you can turn Confirm email OFF.

## 3. Restart Expo

Env vars are read at bundler start:

```bash
npm install
npx expo start
```

## 4. First live login

The in-app UI is Hebrew (RTL). Button labels below match the Hebrew screens:

1. On **התחברות**, choose **יצירת חשבון** (or **התחברות**) with email + password.  
2. Redeem invite code `HAP-U16-2026` (after seed; `MAC-U16-2026` still works as alias) — codes stay Latin.  
3. Complete your profile (**כניסה למרכז**) — the app links `auth.users` to `public.users` via `auth_id`.

With `EXPO_PUBLIC_DEMO_MODE=true` (or missing URL/key), the app stays in in-memory demo mode and does not call Supabase.
