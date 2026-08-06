# Check-in Backend

Hono Node.js backend for the check-in app.

## Architecture

Routes are separated by consumer:

- `GET /health` service health check
- `/api/auth/*` shared auth routes for frontend and backoffice
- `/api/frontend/*` frontend API routes
- `/api/mobile/*` mobile capability routes
- `/api/backoffice/*` backoffice API routes
- `/docs` Swagger UI
- `/openapi.json` OpenAPI document

Supabase is used for database and email/password auth. To disable email verification, turn off email confirmation in Supabase Dashboard under Authentication settings.

## Supabase Migrations

Phase 1-3 schema is in `supabase/migrations/202606050001_phase_1_3_foundation.sql`.

It creates:

- roles, permissions, role permissions, and user permission overrides
- profiles linked to `auth.users`
- device bindings
- work locations and employee 4-node work areas
- audit and event logs

Phase 4-6 schema is in `supabase/migrations/202606050002_phase_4_6_attendance_emergency.sql`.

It creates:

- private Supabase Storage bucket `attendance-photos`
- attendance signed upload tracking, attendance days, and attendance events
- emergency logs

Phase 7-8 schema is in `supabase/migrations/202606050003_phase_7_8_salary_retention.sql`.

It creates:

- private Supabase Storage bucket `salary-uploads`
- salary upload batches and salary records

Phase 9-10 hardening schema is in `supabase/migrations/202606050004_phase_9_10_hardening.sql`.

It adds `attendance_photo_uploads.upload_expires_at`, so signed upload usage is limited separately from the 90-day retention date.

Default seeded roles:

- `ADMIN`: all seeded permissions
- `USER`: `mobile:attendance`, `mobile:emergency`

Authorization is permission-based. Roles are only default permission bundles.

## Database Bootstrap

The database setup has two separate parts:

- Migrations create tables, indexes, policies, buckets, default roles, and default permissions.
- `supabase/seed.sql` promotes one existing Supabase Auth user to the first `ADMIN` profile.

The seed does not create a Supabase Auth user or password. Create the login user through Supabase Auth first, then run the seed to attach that Auth user to the backoffice profile and `ADMIN` role.

### 1. Configure Supabase Auth

In Supabase Dashboard:

1. Open `Authentication` > `Providers` > `Email`.
2. Enable email/password sign-in.
3. Turn off email confirmation if this environment should not require email verification.

### 2. Create the First Auth User

In Supabase Dashboard:

1. Open `Authentication` > `Users`.
2. Click `Add user`.
3. Enter the first admin email and password.
4. Make sure the user appears in the Auth users table.

Example first admin email:

```text
admin@your-company.com
```

### 3. Update `seed.sql`

Edit `supabase/seed.sql` and replace:

```sql
'admin@example.com'::text as admin_email,
```

with the exact email from Supabase Auth:

```sql
'admin@your-company.com'::text as admin_email,
```

The email must already exist in `auth.users`. If it does not match, the seed will finish with:

```text
No matching auth user found. Create the user in Supabase Auth or update admin_email in seed.sql.
```

### 4. Link the Supabase Project Once

Linking is only for Supabase CLI migration/seed commands. It is not the same thing as backend runtime env vars.

```sh
pnpm db:link
```

When prompted, select the Supabase project that should receive the migrations and seed.

### 5. Run Migrations

Run migrations to create schema, storage buckets, roles, and permissions:

```sh
pnpm db:push
```

This applies files from `supabase/migrations`.

### 6. Run Seed

Run the admin seed:

```sh
pnpm db:seed
```

Expected success output:

```text
Admin profile bootstrapped and active
missing_admin_permissions: []
```

After this, the Auth user should have a row in `public.profiles` with the `ADMIN` role.

### 7. One Command Option

After `seed.sql` has the correct admin email and the project is linked, you can run migration and seed together:

```sh
pnpm db:push:seed
```

This runs `pnpm db:push` first, then `pnpm db:seed`.

### Useful Database Scripts

```sh
pnpm db:link       # link check-in-backend/supabase to a remote Supabase project
pnpm db:push       # apply migrations only to the linked remote project
pnpm db:seed       # run supabase/seed.sql on the linked remote project
pnpm db:push:seed  # apply migrations, then run supabase/seed.sql
pnpm db:reset      # local only: reset local DB, apply migrations, run seed
```

### Runtime Env Vars vs CLI Link

The backend runtime uses these env vars when the API is running:

```sh
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Supabase CLI commands such as `pnpm db:push` and `pnpm db:seed` use `pnpm db:link` to know which Supabase project to update. These are different concerns.

## Phase 1-3 APIs

Shared auth:

- `POST /api/auth/sign-in`
- `POST /api/auth/refresh`
- `POST /api/auth/sign-out`
- `GET /api/auth/me`

Backoffice:

- `GET /api/backoffice/users`
- `POST /api/backoffice/users`
- `PATCH /api/backoffice/users/:userId`
- `GET /api/backoffice/roles`
- `GET /api/backoffice/permissions`
- `GET /api/backoffice/users/:userId/permissions`
- `PUT /api/backoffice/users/:userId/permissions`
- `GET /api/backoffice/users/:userId/device`
- `POST /api/backoffice/users/:userId/device/reset`
- `GET /api/backoffice/work-locations`
- `POST /api/backoffice/work-locations`
- `PATCH /api/backoffice/work-locations/:workLocationId`
- `GET /api/backoffice/users/:userId/work-area`
- `PUT /api/backoffice/users/:userId/work-area`

Mobile attendance and emergency:

- `POST /api/mobile/attendance/upload-url`
- `POST /api/mobile/attendance/check-in`
- `POST /api/mobile/attendance/check-out`
- `POST /api/mobile/emergency`

Backoffice attendance and emergency:

- `GET /api/backoffice/attendance`
- `GET /api/backoffice/attendance/:attendanceDayId`
- `PATCH /api/backoffice/attendance/:attendanceDayId/review`
- `GET /api/backoffice/emergency-logs`
- `GET /api/backoffice/emergency-logs/:emergencyLogId`
- `PATCH /api/backoffice/emergency-logs/:emergencyLogId`

Backoffice salary:

- `POST /api/backoffice/salary/upload-url`
- `POST /api/backoffice/salary/import`
- `GET /api/backoffice/salary/uploads`
- `GET /api/backoffice/salary/records`

Backoffice logs:

- `GET /api/backoffice/audit-logs`
- `GET /api/backoffice/event-logs`

Internal maintenance:

- `POST /api/internal/retention/cleanup`
- `GET /api/internal/retention/cleanup` for Vercel Cron

## Local Development

```sh
corepack enable
pnpm install
cp check-in-backend/.env.example check-in-backend/.env
pnpm dev
```

## Vercel

Deploy this app as a separate Vercel project with Root Directory set to `check-in-backend`.

In a monorepo deployment, this backend should be one Vercel project and `check-in-backoffice` should be another Vercel project from the same GitHub repository. Do not deploy the repository root as a third project.

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `CORS_ORIGINS`
- `LOG_LEVEL`
- `RATE_LIMIT_POINTS`
- `RATE_LIMIT_DURATION_SECONDS`
- `ATTENDANCE_PHOTO_BUCKET`
- `SALARY_UPLOAD_BUCKET`
- `INTERNAL_API_SECRET`
- `CRON_SECRET`

Set `CORS_ORIGINS` to include the production backoffice URL, for example `https://check-in-backoffice.vercel.app`.

Vercel detects the Hono app from `src/index.ts`, which exports the default Hono app.

`check-in-backend/vercel.json` registers a daily retention cleanup cron:

```json
{
  "path": "/api/internal/retention/cleanup",
  "schedule": "0 20 * * *"
}
```

Vercel invokes cron jobs with `GET` and sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is configured.

The cleanup removes expired attendance and area-inspection rows, their upload records, and the associated private Supabase Storage photos. Both retention windows are 90 days from creation.

## Docker

Build from the repository root:

```sh
docker build -f check-in-backend/Dockerfile -t check-in-backend .
docker run --env-file check-in-backend/.env -p 3000:3000 check-in-backend
```
