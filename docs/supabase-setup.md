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
6. `supabase/seed.sql` (demo club/team with invite `MAC-U16-2026`)

Skip any file you have already applied. This agent cannot apply SQL to your cloud DB without the database password or service role.

Enable **Email** auth under Authentication → Providers if it is not already on.

## 3. Restart Expo

Env vars are read at bundler start:

```bash
npm install
npx expo start
```

## 4. First live login

The in-app UI is Hebrew (RTL). Button labels below match the Hebrew screens:

1. On **התחברות**, choose **יצירת חשבון** (or **התחברות**) with email + password.  
2. Redeem invite code `MAC-U16-2026` (after seed) — the code itself stays Latin.  
3. Complete your profile (**כניסה למרכז**) — the app links `auth.users` to `public.users` via `auth_id`.

With `EXPO_PUBLIC_DEMO_MODE=true` (or missing URL/key), the app stays in in-memory demo mode and does not call Supabase.
