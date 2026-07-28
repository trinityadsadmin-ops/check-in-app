# Deployment

Production deployment reference for the check-in platform. Architecture: one
Supabase project (database + auth + storage) and **three** Vercel projects
(backend API, backoffice, staff PWA), all connected to this one GitHub repo.

> **Secrets policy:** This file intentionally contains **no secret values**
> (no `SUPABASE_SECRET_KEY`, no `INTERNAL_API_SECRET`, no `CRON_SECRET`, no
> passwords). Those live only in the Vercel project env vars / your password
> manager. Only non-secret identifiers (project ref, URL, publishable key,
> admin login email) are recorded here.

## Supabase

| Field            | Value                                            |
| ---------------- | ------------------------------------------------ |
| Project ref      | `khvwfdcxdojhryrsutcz`                            |
| Project URL      | `https://khvwfdcxdojhryrsutcz.supabase.co`        |
| Region           | Southeast Asia (Singapore)                        |
| Publishable key  | `sb_publishable_g-CQL_SbkL8kalqFIQ6vaA_ZbY7MGb1`  |
| Secret key       | Dashboard → Settings → API Keys → secret key (`sb_secret_…`) — **not stored here** |

### Schema

All 9 migrations from `check-in-backend/supabase/migrations/` are applied
(`pnpm db:push`). 18 tables, all with RLS enabled. Verify with `pnpm --filter
check-in-backend exec supabase migration list --linked`.

### Storage buckets (all private)

- `attendance-photos`
- `area-inspection-photos`
- `salary-uploads`

### Admin account

| Field         | Value                          |
| ------------- | ------------------------------ |
| Login email   | `admin@trinity-hr-app.com`     |
| Role          | ADMIN (all 20 permissions)     |
| Password      | Set in Supabase Auth — not stored here |

The Auth user is created in the dashboard (Authentication → Users → Add user).
The ADMIN role + permissions are then granted by `check-in-backend/supabase/seed.sql`
(looks the user up by email; does **not** create the auth user). Re-run any time
to repair default role permissions or the first admin:

```sh
# edit seed.sql admin_email to admin@trinity-hr-app.com, then:
pnpm db:seed
```

Expected output: `Admin profile bootstrapped and active`, `missing_admin_permissions: []`.

## Vercel — three projects (team `akiizu's projects`, `team_EULv5QCN7MaXey5pcK2whYNB`)

Deployed via **Vercel CLI, not GitHub integration**. Each project sets a distinct
**Root Directory** and is pinned to **Node 22.x** (the root `engines.node` is
`>=20.18.1 <23` and `.npmrc` has `engine-strict=true`, so Node 24 fails install).
The repo root has no `vercel.json` by design.

| Project              | Project ID                          | Root Directory        | Live URL                                  |
| -------------------- | ----------------------------------- | --------------------- | ----------------------------------------- |
| `check-in-backend`   | `prj_H7gRhwMNAXXcZAJFiGecnqsVNQoo`  | `check-in-backend`    | https://check-in-backend.vercel.app       |
| `check-in-backoffice`| `prj_Mpyw6kEcYn6HE55l4zWSANZKIIvo`  | `check-in-backoffice` | https://check-in-backoffice.vercel.app    |
| `check-in-app`       | `prj_FG5NtpdL6vAdKWO8jgdXzIClt9f7`  | `check-in-app`        | https://check-in-app-psi.vercel.app       |

### Deploying (CLI, no Git)

Because it's a pnpm workspace, deploys must run from the **repo root** (so
`pnpm-lock.yaml` is uploaded) with the per-project ID supplied via env vars —
the project's Root Directory tells Vercel which app to build:

```sh
# from repo root
export VERCEL_ORG_ID=team_EULv5QCN7MaXey5pcK2whYNB
export VERCEL_PROJECT_ID=prj_H7gRhwMNAXXcZAJFiGecnqsVNQoo   # backend (swap per app)
vercel deploy --prod --yes
```

Deploying from inside a package subdir fails: `pnpm install --frozen-lockfile`
needs the root lockfile (`ERROR Headless installation requires a pnpm-lock.yaml`).

### Notable fixes made during deploy

- **Hono entrypoint**: `src/index.ts` now has a value import of `hono` so
  Vercel's Hono preset can detect the entrypoint (was: "No entrypoint found
  which imports hono").
- **Node version**: all three projects pinned to 22.x (24.x breaks install under
  `engine-strict`).

### Backend env vars

```
SUPABASE_URL=https://khvwfdcxdojhryrsutcz.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_g-CQL_SbkL8kalqFIQ6vaA_ZbY7MGb1
SUPABASE_SECRET_KEY=<secret — from Supabase dashboard>
CORS_ORIGINS=<backoffice prod URL>,<PWA prod URL>
INTERNAL_API_SECRET=<secret>
CRON_SECRET=<secret>
ATTENDANCE_PHOTO_BUCKET=attendance-photos
AREA_INSPECTION_PHOTO_BUCKET=area-inspection-photos
SALARY_UPLOAD_BUCKET=salary-uploads
LOG_LEVEL=info
```

### Backoffice / PWA env vars

```
NEXT_PUBLIC_API_BASE_URL=<backend prod URL>
```

Both frontends rewrite `/api/*` to this URL (see each `next.config.ts`).

### Cron

`check-in-backend/vercel.json` schedules a daily retention cleanup at
`0 20 * * *` UTC (03:00 Asia/Bangkok) hitting
`/api/internal/retention/cleanup`. Requires `CRON_SECRET` set on the backend
project. Crons only run on production deployments. Manual calls may use
`INTERNAL_API_SECRET`.

## Deploy order checklist

1. Supabase: link, `pnpm db:push`, create 3 buckets, create admin Auth user, seed. ✅ done
2. Vercel backend project → env vars → deploy. ✅ done (`/health` 200, Supabase connected)
3. Backoffice + PWA projects → `NEXT_PUBLIC_API_BASE_URL` → deploy. ✅ done
4. Backend `CORS_ORIGINS` set to both frontend URLs. ✅ done (preflight verified)
5. Smoke test: log into the backoffice as `admin@trinity-hr-app.com`; confirm the PWA installs and reaches the API. ⬅ final manual step
