# Uluu Zhibek Zholu CRM — MVP backend

Backend CRM MVP для ОсОО «Ош Жибек Жолу» по `TZ_CRM_DEV_v2` / `TZ_CRM_Simple_v2`:
авторизация и RBAC, бронирования и договоры, смены и выходные с
автоматической фиксацией прогулов, зарплата (налог, штрафы), бухгалтерия с
закрытием периодов и экспортом в Excel, ежедневные отчёты для директора и
инвесторов, dashboard/аналитика, юридические документы и согласия.
Вход: пароль + код на почту; важные действия подтверждаются кодом из письма;
зашифрованные резервные копии базы скачиваются на компьютер Директора.
Фронтенд (React) — в папке `frontend/`, см. `frontend/README.md`.

Безопасность: `docs/THREAT_MODEL.md`. Ручное тестирование через Swagger:
`docs/API_TESTING.md`. Сервер (Render + Docker): `docs/DEPLOY.md`.
Резервные копии и восстановление: `docs/BACKUPS.md`. Открытые вопросы и принятые
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
bash dev-tools/mailpit/macos/install.sh   # or Windows install.ps1 / docker compose; see dev-tools/mailpit/README.md
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

### Email — required

Every login sends a code by email, so a deployed server (`NODE_ENV` other
than development/test) **refuses to start** without email delivery:

- `EMAIL_TRANSPORT=smtp` (default): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASS`, `SMTP_FROM`. Locally, credentials may be empty for Mailpit
  (`docker-compose.dev.yml`, UI http://localhost:8025).
- `EMAIL_TRANSPORT=brevo`: `BREVO_API_KEY` + `SMTP_FROM` (a sender verified
  in Brevo). HTTPS only - use it where outbound SMTP ports are blocked
  (Render free tier).

Every account needs a real, unique email (`EMAIL_TAKEN` otherwise). For an
existing Director without one use the guarded ops script:

```bash
npx ts-node prisma/set-director-email.ts --username director1 --email you@example.com [--overwrite]
```

## First Director account (bootstrap)

There is no public registration endpoint by design. The very first
`director` is created by `prisma/seed.ts` - run automatically at container
start and by `npm run seed:director` locally - **only** when the `User` table
is completely empty and all of `SEED_DIRECTOR_USERNAME`,
`SEED_DIRECTOR_PASSWORD` (≥ 12), `SEED_DIRECTOR_FULL_NAME` and
`SEED_DIRECTOR_EMAIL` are set. Without the variables it does nothing. Remove
`SEED_DIRECTOR_PASSWORD` from the server after the first login.

There are no demo accounts or demo data.

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
| Email codes | `POST /email-codes` | any user, for themself |
| Account security | `POST /users/me/email`, `POST /users/me/email/confirm`, `POST /users/me/password` | self |
| Backups | `GET /backups/status`, `GET /backups/export` (director) · `GET /backups/agent/export` (agent token) | director · backup agent |

**Emailed codes.** Login is two steps: `POST /auth/login` (password) →
`POST /auth/login/verify` (code from the email). Important actions need a code
sent to the acting user: request it with `POST /email-codes { action,
resourceId }`, then repeat the request with `x-confirmation-id` and
`x-confirmation-code`. The list of actions is `src/email-codes/email-code-actions.ts`
(deletes, contract deposit/file, shift correction, payroll settings/confirm,
transactions, period close, email/password change, backup download).

Closing the accountant's shift generates the day's financial report; closing
the head of sales' shift generates the sales report. A daily job (00:05
`BUSINESS_TIMEZONE`, plus catch-up on start) records `missed` shifts.

## Auth foundation details

- `POST /api/v1/auth/login` — username+password → `{ mfaRequired, challengeId,
  expiresAt, emailHint }`; a one-time code is emailed. No tokens yet.
- `POST /api/v1/auth/login/verify` — `{ challengeId, code }` → access token
  (body) + refresh token (HttpOnly cookie) + CSRF token (body + readable cookie).
- `POST /api/v1/auth/refresh` — rotates the refresh token (old token dies
  immediately); requires the CSRF header to match the CSRF cookie.
- `POST /api/v1/auth/logout` — revokes the current refresh session family,
  clears cookies.
- `GET /api/v1/auth/me` — current authenticated user's safe profile.
- `PATCH /api/v1/users/me` — name/phone only; no `role`, no `email`
  (`forbidNonWhitelisted` rejects them).
- `GET /api/v1/users/:id` — minimal IDOR guard: visible to the record
  owner, the account's creator, or a director.
- `POST /api/v1/consents`, `GET /api/v1/consents/me` — versioned consent
  records.
Every route requires authentication by default (global `JwtAuthGuard`);
`@Public()` is the explicit, visible opt-out used only on
`/auth/login`, `/auth/login/verify`, `/auth/refresh`, `/auth/logout`,
`/legal/documents`, `/health` and `/backups/agent/export` (own token).

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
- **Encryption**: buyer/employee PII, file names, report bodies and files are
  AES-256-GCM encrypted (`FieldCipher`, `FileStorageService`), see
  `docs/THREAT_MODEL.md`.
- **Emailed codes** (`EmailCodesService`): SHA-256(id:code) only, bound to
  user + purpose + action + route resource, single use (atomic claim), 5
  attempts, 10 min TTL, newer code supersedes older, 5 codes per 15 min per
  user. Checked by a global interceptor after all guards; a 4xx rejection of
  the protected request releases the code, a 5xx keeps it consumed.
- **Backups** (`src/backups`): consistent REPEATABLE READ logical snapshot +
  file blobs + app keys, gzip, AES-256-GCM with the key wrapped by the
  Director's RSA-4096 public key; the server never holds the private key.
- **Maker-checker confirmation codes**: `ConfirmationsService` generates
  an 8-character human-typeable code (excludes visually ambiguous
  characters), stores only its SHA-256 hash, enforces a short TTL
  (`CONFIRMATION_CODE_TTL_SECONDS`, default 10 min) and a max-attempts
  lock (`CONFIRMATION_CODE_MAX_ATTEMPTS`, default 5), compares codes with
  `crypto.timingSafeEqual`, and never logs the raw code (see
  `redactMetadata`'s forbidden-keys list). Email delivery is best-effort:
  a Director can still act via `GET /confirmations/pending` if SMTP is
  down. **Concurrency**: a correct code first atomically
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
  The mock suite skips emailed codes via `TEST_BYPASS_*` switches that are
  honoured only when `NODE_ENV=test`; the real flows are covered by
  `test/real-db/email-codes.e2e-spec.ts`.
- Rate-limit counters are in-memory per process; behind a reverse proxy
  `req.ip` is the proxy's address until `trust proxy` is configured for
  the real topology (`OPEN_QUESTIONS.md` #39/#41).
- `npm run lint` runs `eslint --fix` and rewrites files; use
  `npx eslint "src/**/*.ts"` for a read-only check.
- No CI pipeline configured (infrastructure choice — `OPEN_QUESTIONS.md`
  #42).
