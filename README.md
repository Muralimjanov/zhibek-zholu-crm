# Uluu Zhibek Zholu CRM — MVP backend

Backend CRM MVP для ОсОО «Ош Жибек Жолу» по `TZ_CRM_DEV_v2` / `TZ_CRM_Simple_v2`:
авторизация и RBAC, бронирования и договоры, смены и выходные с
автоматической фиксацией прогулов, зарплата (налог, штрафы), бухгалтерия с
закрытием периодов и экспортом в Excel, ежедневные отчёты для директора и
инвесторов, dashboard/аналитика, юридические документы и согласия.
Учёт арендаторов, интеграции с кассами/1С и push-уведомления — вне этой
версии (ТЗ). Фронтенд — следующий этап.

Безопасность: `docs/THREAT_MODEL.md`. Ручное тестирование через Swagger:
`docs/API_TESTING.md`. Временный тестовый сервер (Render + Docker):
`docs/DEPLOY.md`. Открытые вопросы и принятые
технические допущения: `OPEN_QUESTIONS_ADDENDUM.md`.

## Stack

NestJS · TypeScript · PostgreSQL · Prisma · Argon2id · JWT (access) ·
rotating opaque refresh tokens (hashed) · Passport · class-validator ·
Helmet · `@nestjs/throttler`.

## Getting started (real environment with network + PostgreSQL)

```bash
cp .env.example .env      # fill in real secrets, DATABASE_URL, encryption keys
npm install
npx prisma migrate dev    # creates the schema in your PostgreSQL instance
npm run build
npm run test               # unit tests
npm run test:e2e           # e2e tests (Prisma + email mocked)
npm run start:dev          # Swagger UI: http://localhost:3000/api/v1/docs (never in production)
```

### Upgrading an existing database to the MVP schema

```bash
pg_dump ... > backup.sql                  # always back up first
npx prisma migrate deploy                 # additive; aborts if User.avatarUrl still holds data
npm run data:encrypt-pii                  # dry-run: lists rows with plaintext PII
npm run data:encrypt-pii -- --apply       # encrypts them in one transaction (idempotent)
```

New required secret: `BLIND_INDEX_KEY_V1` (32 random bytes, base64, different
from `ENCRYPTION_KEY_V1`). **Back up both keys separately from the database** —
without them encrypted data cannot be recovered.

### Integration tests against real PostgreSQL + real SMTP

`test/real-db.e2e-spec.ts` runs every endpoint against a real database and
reads confirmation codes from a real (local) mailbox:

```bash
docker compose -f docker-compose.dev.yml up -d mailpit   # SMTP :1025, UI http://localhost:8025
# .env: DATABASE_URL_TEST=postgresql://.../uzz_crm_test   (name MUST end with _test)
npm run test:e2e:real-db
```

The suite applies committed migrations (`prisma migrate deploy`) to
`DATABASE_URL_TEST` and **TRUNCATEs all tables there before each test**.
`test/real-db/guard.ts` refuses to run when `NODE_ENV=production`, when the
test database is named `uzz_crm`, when its name does not end in `_test`, or
when it resolves to the same host/port/database as `DATABASE_URL`.

`ENCRYPTION_KEY_V1` must be a base64-encoded 32-byte value, e.g.
`node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"`.

### If you're updating from a version without confirmation codes

The schema gained a `PendingAction` table. Re-run the migration:
```bash
npx prisma migrate dev --name add_confirmation_codes
```

### Email (SMTP) for confirmation codes

Confirmation-code emails require SMTP settings in `.env`
(`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). With
`NODE_ENV=production`, `SMTP_USER` and `SMTP_PASS` are both mandatory;
outside production they may be left empty for an auth-less local catcher
(Mailpit via `docker-compose.dev.yml`). Setting only one of the two is
always treated as "not configured". This is
intentionally generic — point it at whichever provider's SMTP relay you
use (Gmail, SES, Mailgun, your own mail server, etc.); no vendor is
hardcoded. **If SMTP isn't configured, the system still works**: pending
actions are still created and a Director can approve them via
`GET /api/v1/confirmations/pending` in-app — email is a convenience
channel, not a hard dependency.

At least one active Director account needs an `email` set for the code
to actually be delivered anywhere (`SEED_DIRECTOR_EMAIL` for a fresh
database). For an existing Director use the guarded ops script - it only
touches an active director, refuses to overwrite an existing email without
`--overwrite`, and writes an audit event:

```bash
npx ts-node prisma/set-director-email.ts --username director1 --email you@example.com [--overwrite]
```

## First Director account (bootstrap)

There is no public registration endpoint by design (see
`OPEN_QUESTIONS.md` #2/#3). To create the very first `director` account in
a fresh database, use the guarded seed script instead of an HTTP call:

```bash
# in .env: SEED_DIRECTOR_USERNAME / SEED_DIRECTOR_PASSWORD / SEED_DIRECTOR_FULL_NAME
npm run seed:director
# equivalently: npx prisma db seed
```

The script (`prisma/seed.ts`) only acts on a **completely empty** `User`
table - if any user already exists it logs that and exits without doing
anything, so it cannot accidentally create a second "first" director. This
is a dev/ops bootstrap tool, not a production registration mechanism; the
permanent process for provisioning the first production Director account
is still open (`OPEN_QUESTIONS.md` #3).

## API overview (`/api/v1`, full schema in Swagger)

Every route requires a Bearer access token unless marked public, and — except
auth/consents/legal/own profile — acceptance of the current required legal
documents (`403 CONSENT_REQUIRED` otherwise, see `GET /consents/status`).
Money: integer strings in **tyiyn** (1 KGS = 100). Areas/percents: decimal strings.

| Area | Endpoints | Access (TZ CRUD) |
|---|---|---|
| Legal (public) | `GET /legal/documents`, `GET /legal/documents/:type` | anyone |
| Consents | `POST /consents`, `GET /consents/me`, `GET /consents/status` | self |
| Users | `GET /users` (director: all, head of sales: team), `GET /users/:id`, `PATCH /users/me`, `PUT/DELETE /users/me/avatar`, `GET /users/:id/avatar` | per visibility rules |
| Bookings | `POST/GET /bookings`, `GET/PATCH/DELETE /bookings/:id`, `POST /bookings/:id/convert` | director all · head of sales team · manager own (no delete) |
| Contracts | `POST/GET /contracts`, `GET/PATCH/DELETE /contracts/:id`, `POST /contracts/:id/deposit`, `PUT/GET /contracts/:id/file` | as bookings; manager read-only once `signed`; accountant: finance view + deposit mark |
| Shifts | `POST /shifts/open`, `POST /shifts/close`, `GET /shifts/current`, `GET /shifts`, `PATCH/DELETE /shifts/:id` | button: head of sales, manager, accountant · correction: director |
| Day offs | `POST/GET /day-offs`, `PATCH/DELETE /day-offs/:id` | director, head of sales (team), today/future only |
| Payroll | `GET/PUT /payroll/settings`, `POST /payroll/entries/generate`, `GET /payroll/entries`, `GET/PATCH /payroll/entries/:id`, `POST .../confirm`, `DELETE` | accountant writes · director reads all · manager own |
| Accounting | `POST/GET /transactions`, `GET/PATCH/DELETE /transactions/:id`, `PUT/GET /transactions/:id/attachment`, `GET/POST /accounting/periods[/:period/close]`, `GET /accounting/summary`, `GET /accounting/export.xlsx` | accountant writes (own, open period) · director reads, deletes |
| Daily reports | `GET /daily-reports`, `GET /daily-reports/:id`, `POST /daily-reports/regenerate` | director & investors all · head of sales sales · accountant financial |
| Dashboard | `GET /dashboard`, `GET /analytics/sales` | director & investors (aggregates) · director & head of sales |

Closing the accountant's shift generates the day's financial report; closing
the head of sales' shift generates the sales report. A daily job (00:05
`BUSINESS_TIMEZONE`, plus catch-up on start) records `missed` shifts.

## Auth foundation details

- `POST /api/v1/auth/login` — username+password → access token (body) +
  refresh token (HttpOnly cookie) + CSRF token (readable cookie).
- `POST /api/v1/auth/refresh` — rotates the refresh token (old token dies
  immediately); requires the CSRF header to match the CSRF cookie.
- `POST /api/v1/auth/logout` — revokes the current refresh session family,
  clears cookies.
- `GET /api/v1/auth/me` — current authenticated user's safe profile.
- `PATCH /api/v1/users/me` — self profile update; the DTO structurally has
  no `role` field, so a role change is impossible through this endpoint,
  and the global `ValidationPipe` (`forbidNonWhitelisted`) rejects a
  request that tries to smuggle one in.
- `GET /api/v1/users/:id` — minimal IDOR guard: visible to the record
  owner, the account's creator, or a director.
- `POST /api/v1/consents`, `GET /api/v1/consents/me` — versioned consent
  records (see `OPEN_QUESTIONS.md` for what legal content is NOT decided
  here).

### Maker-checker: account creation and disabling require Director approval

This is an explicit product decision layered on top of the original RBAC
(not derived from the source TЗ) — **every** account creation or disable,
including a Director's own, only takes effect after a Director approves a
one-time code emailed to every active Director account:

- `POST /api/v1/confirmations/users` — initiate account creation. RBAC
  (`ROLE_CREATION_MATRIX`) is still checked immediately here — a forbidden
  attempt gets a 403 and never creates a `PendingAction` or sends an
  email. On success, returns `202 Accepted` with
  `{ pendingActionId, status: "pending", expiresAt, emailDelivery }`. The
  account does **not** exist yet.
- `POST /api/v1/confirmations/users/:id/disable` — same pattern for
  disabling an account.
- `POST /api/v1/confirmations/:id/confirm` — **Director-only**, strictly
  rate-limited (5/min on top of the global throttle). Body: `{ code }`.
  On the correct code, executes the underlying action and returns the
  resulting `UserResponseDto`. Wrong code → `401` (and counts toward
  `maxAttempts`, after which the action is permanently `failed` and must
  be re-initiated). Already-resolved or expired → `409`.
- `POST /api/v1/confirmations/:id/reject` — Director-only, cancels a
  pending action.
- `GET /api/v1/confirmations/pending` — Director-only. Fallback for when
  email delivery is unavailable/unconfigured: a Director can see and act
  on pending approvals from inside the app itself. Never returns the
  code, the code hash, or the password hash.

Every route requires authentication by default (global `JwtAuthGuard`);
`@Public()` is the explicit, visible opt-out used only on
`/auth/login`, `/auth/refresh`, `/auth/logout`.

## Security decisions worth knowing about

- **Refresh tokens**: opaque 48-byte random values; only their SHA-256
  hash is stored. Rotation is mandatory on every refresh; presenting an
  already-rotated (dead) token is treated as compromise and revokes the
  entire token family (`RefreshTokenService.rotate`).
- **Passwords**: Argon2id via `argon2`, never returned by any endpoint
  (`UserResponseDto` is an explicit allowlist, not a raw Prisma object).
- **Login error handling**: unknown username, wrong password, and
  disabled account all return the same `AUTH_INVALID_CREDENTIALS` — a
  dummy hash comparison runs on the "unknown username" path to reduce
  timing-based enumeration.
- **JWT claims**: `sub`, `role`, `username` only — no PII, no financial
  data. Account status is re-checked against the database on every
  request (`JwtStrategy.validate`), so a disabled account with a
  still-valid access token is rejected immediately.
- **CSRF**: double-submit cookie pattern on the two cookie-authenticated,
  state-changing endpoints (`/auth/refresh`, `/auth/logout`).
- **Audit log**: `AuditService` + `redactMetadata()` in
  `src/audit/audit.types.ts` — metadata is an allowlist, not a blocklist;
  unknown fields are dropped, and secrets/tokens/passport numbers are
  explicitly forbidden even if accidentally passed in.
- **Encryption foundation**: `EncryptionService` (AES-256-GCM, versioned
  keys) exists and is tested, but is **not yet applied to any field** —
  see `OPEN_QUESTIONS.md` #27/#28. It's ready for Booking/Contract
  `passport_number`/`address` once that decision is made.
- **Maker-checker confirmation codes**: `ConfirmationsService` generates
  an 8-character human-typeable code (excludes visually ambiguous
  characters), stores only its SHA-256 hash, enforces a short TTL
  (`CONFIRMATION_CODE_TTL_SECONDS`, default 10 min) and a max-attempts
  lock (`CONFIRMATION_CODE_MAX_ATTEMPTS`, default 5), compares codes with
  `crypto.timingSafeEqual`, and never logs the raw code (see
  `redactMetadata`'s forbidden-keys list). Email delivery is best-effort:
  a Director can still act via `GET /confirmations/pending` if SMTP is
  down or unconfigured. **Concurrency**: a correct code first atomically
  claims the action (`pending -> confirmed`, expiry re-checked in the same
  write) and only the winner executes it - concurrent confirmations get
  `409`. Wrong-code attempts are counted with compare-and-swap, so
  parallel guesses cannot undercount `maxAttempts`. A username that became
  taken in the meantime (including a DB unique-constraint race) is `409
  USERNAME_TAKEN`, never `500`.
- **Rate limiting**: global `THROTTLE_LIMIT`/`THROTTLE_TTL_SECONDS` on every
  route; additionally `AUTH_THROTTLE_LIMIT`/`AUTH_THROTTLE_TTL_SECONDS`
  (default 5/60s) on `/auth/login` and `/auth/refresh` (`@AuthThrottle()`,
  AUTH_SPEC.md §15); 5/min on `/confirmations/:id/confirm`. Buckets are
  per client IP, in-memory, per process (see OPEN_QUESTIONS #41).
- **Concurrent refresh**: if several requests present the same refresh
  token at once, only one can revoke it; the others are handled as reuse
  and revoke the whole family (the winner's new token included).

## Known limitations

- `npm run test:e2e` still uses an in-memory Prisma mock (wiring only);
  SQL behaviour, migrations, constraints and concurrency are covered by
  `npm run test:e2e:real-db`, which needs a local PostgreSQL and Mailpit.
- Rate-limit counters are in-memory per process; behind a reverse proxy
  `req.ip` is the proxy's address until `trust proxy` is configured for
  the real topology (`OPEN_QUESTIONS.md` #39/#41).
- `npm run lint` runs `eslint --fix` and rewrites files; use
  `npx eslint "src/**/*.ts"` for a read-only check.
- No CI pipeline configured (infrastructure choice — `OPEN_QUESTIONS.md`
  #42).
