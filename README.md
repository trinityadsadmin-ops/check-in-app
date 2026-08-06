# Check-in App

Monorepo workspace for the check-in platform.

## Backend

The Hono backend lives in `check-in-backend`.

```sh
corepack enable
pnpm install
cp check-in-backend/.env.example check-in-backend/.env
pnpm dev
```

Deploy the backend as a separate Vercel project with Root Directory set to `check-in-backend`. Vercel detects the Hono app from `check-in-backend/src/index.ts`.

## Backoffice

The Next.js backoffice app lives in `check-in-backoffice`.

```sh
cp check-in-backoffice/.env.example check-in-backoffice/.env.local
pnpm dev:backoffice
```

Generate React Query hooks from the backend OpenAPI document:

```sh
pnpm codegen
```

Deploy the backoffice as a separate Vercel project with Root Directory set to `check-in-backoffice`.

Implemented backoffice modules:

- Users, role updates, permission overrides, and mobile device reset
- Work locations and employee four-node work area editor
- Attendance review with check-in/check-out photos
- Emergency logs and response status
- Salary Excel upload/import and salary record review
- Audit and event log review

The work area map uses Leaflet with OpenStreetMap tiles. No paid map API key is required.

## Vercel Projects

Use three Vercel projects from the same GitHub repository:

- Backend project: Root Directory is `check-in-backend`. It uses `check-in-backend/vercel.json`.
- Backoffice project: Root Directory is `check-in-backoffice`. It uses `check-in-backoffice/vercel.json`.
- Staff PWA project: Root Directory is `check-in-app`. It uses `check-in-app/vercel.json`.

Do not create a root Vercel project for the repository root. The repository root intentionally has no `vercel.json`; Vercel should have exactly three projects connected to this Git repository: one backend project, one backoffice project, and one staff PWA project.

When you push to GitHub, Vercel will create deployments for all connected projects. The backend project receives the API URL, and both frontend projects must point `NEXT_PUBLIC_API_BASE_URL` to that backend URL. Add both frontend production URLs to the backend `CORS_ORIGINS`.

The backend `check-in-backend/vercel.json` includes a daily retention cleanup cron at `0 20 * * *` UTC, which is 03:00 Asia/Bangkok. It removes expired attendance and area-inspection records together with their private Supabase Storage photos after 90 days.

Set `CRON_SECRET` in the backend Vercel project so Vercel can call `/api/internal/retention/cleanup` securely. Manual calls may also use `INTERNAL_API_SECRET`.

Apply all Supabase migrations before deploying, including the phase 9-10 hardening migration that adds a short attendance upload window separate from 90-day retention.

Backend Vercel env vars:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `CORS_ORIGINS`
- `LOG_LEVEL`
- `RATE_LIMIT_POINTS`
- `RATE_LIMIT_DURATION_SECONDS`
- `ATTENDANCE_PHOTO_BUCKET`
- `AREA_INSPECTION_PHOTO_BUCKET`
- `SALARY_UPLOAD_BUCKET`
- `INTERNAL_API_SECRET`
- `CRON_SECRET`

Backoffice Vercel env vars:

- `NEXT_PUBLIC_API_BASE_URL`

Staff PWA Vercel env vars:

- `NEXT_PUBLIC_API_BASE_URL`

## Scripts

```sh
pnpm dev
pnpm dev:backend
pnpm dev:backoffice
pnpm build
pnpm typecheck
pnpm test
```

## Supabase Setup

Database migrations and seed files live in `check-in-backend/supabase`.

Runtime env vars such as `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` are used by the backend API. Supabase CLI still needs the project to be linked once for migration and seed commands:

```sh
pnpm db:link
pnpm db:push
```

To create the first backoffice admin:

1. Create the user first in Supabase Dashboard under `Authentication` > `Users`.
2. Edit `check-in-backend/supabase/seed.sql` and replace `admin@example.com` with that exact Auth user email.
3. Run:

```sh
pnpm db:seed
```

Expected seed success output:

```text
Admin profile bootstrapped and active
missing_admin_permissions: []
```

For the full explanation, see `check-in-backend/README.md`.
