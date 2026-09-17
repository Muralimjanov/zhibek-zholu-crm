# OPEN_QUESTIONS — Addendum from Auth Foundation implementation

`/mnt/project/OPEN_QUESTIONS.md` is a read-only project file and was not
modified. This addendum records exactly which reversible technical
defaults the code uses for currently-open items, so nothing is silently
decided. None of these are claimed as final business/legal answers.

| # | Question | Default used in code | Where |
|---|---|---|---|
| 1 | Login identifier | `username` (string, 3–64 chars, `[a-zA-Z0-9._-]`) | `CreateUserDto`, `LoginDto` |
| 2 | Public self-registration forbidden? | Yes — no `POST /auth/register` exists; account creation only via `POST /confirmations/users` behind auth+RBAC+Director approval | `AuthModule` has no such route |
| 3 | First Director account creation | Dev/ops bootstrap only: `prisma/seed.ts` (acts only on an empty `User` table). No HTTP bootstrap endpoint. The permanent production process is still open. | `prisma/seed.ts` |
| 4 | Creator issues temporary password? | Yes, creator supplies `password` in `CreateUserDto` | `POST /confirmations/users` |
| 5 | Forced password change on first login? | **Not implemented.** No `mustChangePassword` flag exists yet. | — |
| 6 | Password recovery method | **Not implemented.** No reset endpoints exist (`AUTH_SPEC.md §12` `PasswordResetService` abstraction not built either — flagging as still open, not even the abstraction). | — |
| 7–9 | Email/phone verification, MFA | **Not implemented.** | — |
| 10 | Access token TTL | 900s (15 min) default, `JWT_ACCESS_TTL_SECONDS` | `.env.example`, `AppConfigService` |
| 11 | Refresh token TTL | 2,592,000s (30 days) default, `REFRESH_TOKEN_TTL_SECONDS` | `.env.example`, `AppConfigService` |
| 12 | View/revoke active sessions? | **Not implemented** (only implicit revoke-all on disable/logout exists). | — |
| 13 | Password change revokes all sessions? | N/A — password change flow itself is not implemented yet | — |
| 27 | Which fields need application-level encryption | **None yet.** `EncryptionService` (AES-256-GCM, versioned) exists and is tested but is not applied to any `User` field. Reserved for future Booking/Contract PII. | `src/crypto/encryption.service.ts` |
| 28 | Is phone/email encrypted PII? | Currently stored in plaintext columns. Not decided. | `prisma/schema.prisma` `User` model |
| 36 | `deposit_paid + contract_file → signed`? | N/A — Contract module not implemented in this stage | — |
| 37 | Exactly-two-investor limit enforced? | **Not enforced** in code. `ROLE_CREATION_MATRIX` allows `director` to create unlimited `investor` accounts; a count-based limit was deliberately not added per `AUTH_SPEC.md §9` instruction not to encode this without confirmation it's a permanent rule. | `src/common/constants/role-hierarchy.ts` |
| 38 | Employee email/phone mandatory? | Optional (`phone`/`email` nullable) | `prisma/schema.prisma`, `CreateUserDto` |

## New technical decisions not previously listed (flagging for confirmation)

- **Maker-checker confirmation codes (2026-09-16, explicit product request)**:
  account creation and disabling now require a Director to approve a
  one-time email code before the action takes effect — regardless of who
  initiates it, including a Director acting on themselves. This was an
  explicit, direct instruction, confirmed through three clarifying
  questions:
  1. Role-creation hierarchy unchanged (director→head_of_sales/accountant/
     investor, head_of_sales→sales_manager) — confirmation codes sit on
     top of the existing RBAC, they don't replace it.
  2. Scope: create + disable now; the architecture (`PendingAction` model,
     prepare/execute split in `UsersService`) is intentionally reusable
     for future delete/modify operations on Booking/Contract/etc., but
     those are NOT implemented yet (those modules don't exist).
  3. Recipient: **always** every active Director's email, never the
     initiator's own email — this is an approval/maker-checker workflow,
     not self-service step-up 2FA.
  - **Still open**: SMTP provider choice itself (host/credentials) - the
    code only picks a provider-agnostic delivery mechanism (generic SMTP
    via `nodemailer`), not which provider to actually use. This maps onto
    the existing OPEN_QUESTIONS.md #23 ("email/SMS providers").
  - **Still open**: what happens when there are multiple Director
    accounts - current behavior broadcasts the code to all of them and
    any one of them can confirm. Not derived from the TЗ (which doesn't
    specify a Director count), flagging for confirmation this is the
    intended multi-Director behavior.
- **CSRF strategy**: double-submit cookie (`uzz_csrf`, non-HttpOnly) required
  as an `x-csrf-token` header on `/auth/refresh` and `/auth/logout`, since
  those are the only state-changing endpoints reachable via a plain
  cookie-authenticated browser request. `/auth/login` does not require it
  (no prior session to forge). This is a technical security addition, not
  a business requirement — confirm it fits the intended frontend.
- **`PATCH /users/me` vs `PATCH /users/:id`**: implemented self-update at
  `/users/me` rather than `/users/:id` (which `API_SPEC.md` proposed) to
  make "you can only edit yourself" structurally obvious at the routing
  level rather than only inside a permission check. `API_SPEC.md` itself
  allows endpoint names to be adjusted for consistency as long as business
  rules are preserved (`CLAUDE_INSTRUCTIONS.md` §"Predlagaemye endpoints").
- **`POST /users` moved to `POST /confirmations/users`** (and disable to
  `POST /confirmations/users/:id/disable`): once creation/disable stopped
  being a single-step operation (see maker-checker above), keeping them
  under `/users` would have been misleading - a `POST /users` that
  returns "pending, not yet created" doesn't match normal REST
  expectations for that verb+path. Same endpoint-naming latitude as
  above applies.
- **`GET /users/:id` visibility**: implemented as owner OR account-creator
  OR director may view. This is a minimal placeholder to avoid a wide-open
  IDOR on day one; the real "team visibility" rule (head_of_sales sees
  their whole team, not just users they personally created) belongs to
  later CRM modules per the CRUD tables in `TZ_CRM_DEV_v2`, and should be
  revisited once Booking/Contract "team" scope is implemented.

## Update 2026-09-16 — real-DB verification and fixes

Found by `test/real-db.e2e-spec.ts` (real PostgreSQL + Mailpit) and fixed.
These are technical corrections, not business decisions:

- **Login/refresh rate limiting was not applied** although required by
  AUTH_SPEC.md §15 and already configurable (`AUTH_THROTTLE_*` was read but
  unused). Now enforced via `@AuthThrottle()` on `/auth/login` and
  `/auth/refresh`, per client IP.
- **Refresh rotation race**: concurrent requests with one refresh token could
  all succeed, leaving several live tokens in a family. Now only one request
  can revoke the old token; the rest are treated as reuse (family revoked).
- **Confirm race**: two Directors confirming the same code at once produced
  `201` + `500` and could leave the action marked `failed` although the user
  was created. Now claim-then-execute; the loser gets `409`.
- **Wrong-code counter** was read-modify-write; now compare-and-swap.
- **Prisma unique violation** (`P2002`) on user creation surfaced as `500`;
  now `409 USERNAME_TAKEN`.
- **Logout audit** had no actor; now the refresh-session owner.
- **Cookie handling**: refresh-cookie path ignored `API_PREFIX`; logout
  cleared cookies without `domain`, so with `REFRESH_COOKIE_DOMAIN` set they
  were not actually removed.
- **Schema**: `PendingAction.rejectedByUserId` had no foreign key (unlike
  `confirmedByUserId`); added. Added `AuditEvent(entityType, entityId)` index
  for incident scoping (SECURITY_SPEC.md). Migration
  `20260916143229_add_rejected_by_fk_and_audit_entity_index` (additive only).
- **SMTP without auth** is accepted only when `NODE_ENV != production`
  (local Mailpit); production still requires `SMTP_USER` + `SMTP_PASS`.

## New open questions (not decided in code — please confirm)

| # | Question | Current behaviour (unchanged) |
|---|---|---|
| A1 | May a Director disable **their own** account, or the **last active Director**? The latter would leave nobody able to confirm anything. | Allowed; no guard. |
| A2 | Should create/disable confirmation re-check that the **initiator is still active** at confirmation time? | Create re-checks the initiator's role only; disable re-checks nothing. |
| A3 | Should several simultaneous pending actions be allowed for the **same target username / same user to disable**? | Allowed; first confirmed wins, later ones fail/no-op. |
| A4 | API_SPEC.md lists `AUTH_REFRESH_REUSED`, but reuse returns `AUTH_REFRESH_INVALID` on purpose (no signal to the caller; reuse is visible in audit). Keep or expose the distinct code? | `AUTH_REFRESH_INVALID`. |
| A5 | Concurrent refresh from several browser tabs is now treated as reuse and logs the user out. Is a short grace window acceptable (weaker theft detection) or should the frontend serialise refreshes? | No grace window. |
| A6 | `GET /users/:id` returns `404` for unknown ids but `403` for existing ones the caller may not see - an existence oracle (low risk with UUIDs). Return `404` for both? | 404 vs 403. |
| A7 | Login throttling is per IP only. Is per-username throttling / temporary lockout required against distributed credential stuffing (it also enables lockout-DoS of a known username)? | Per IP only. |
| A8 | Final value of `AUTH_THROTTLE_LIMIT`/`AUTH_THROTTLE_TTL_SECONDS` for production. | 5 per 60 s (technical default). |

## Update 2026-09-17 — CRM MVP (TZ_CRM_DEV_v2 modules)

Explicit decisions by the project owner (2026-09-17): backend first (frontend
is the next stage); encrypt all buyer and employee PII with blind-index search;
local encrypted file storage behind an abstraction; legal texts as drafts with
placeholders; Swagger enabled outside production only.

### Contradictions / gaps in the TZ — reversible defaults used, please confirm

| # | Question | Default in code | Where |
|---|---|---|---|
| B1 | Closed accounting period: text says edits are blocked "кроме Директора", CRUD table gives the director no Update. | Table followed: director may **delete** but not edit; accountant edits own records in open periods only. | `AccountingService` |
| B2 | Contract statuses: `deposit_paid` without a file vs `signed`. (#36) | `draft` → `deposit_paid` (deposit marked) → `signed` (deposit + file). Removing the deposit mark reverts the status. | `deriveContractStatus` |
| B3 | Working days and holidays for the missed-shift job. | `WORKING_WEEKDAYS=1..5` (Mon–Fri), `Asia/Bishkek`, no holiday calendar. | `BusinessCalendar` |
| B4 | Where does `base_salary` come from? No salary field in the TZ. | Carried over from the employee's last confirmed entry, otherwise 0 for the accountant to fill in. | `PayrollService.generate` |
| B5 | "Сумма расхождений округляется до сома". | Half-up rounding to the **tyiyn**; no rounding to whole som. | `src/common/money.ts` |
| B6 | May `final_amount` be negative when fines + tax exceed the salary? | Not clamped. | `computePayroll` |
| B7 | Who approves a day off for the head of sales or the accountant? TZ CRUD: only the director. | Director only for them; head of sales for own team. Day offs only for today/future and never over an existing shift record. Deleting/moving past day offs is refused for everyone. | `DayOffsService` |
| B8 | Head of sales payroll: CRUD gives head of sales no payroll read, i.e. they cannot see their own salary. | Implemented literally (403). | `PayrollService.scope` |
| B9 | Accountant needs contracts to link payments, but CRUD says "Отчёты". | Finance-only contract view (amounts/status, no buyer PII) + deposit mark. | `ContractsService.toFinanceView` |
| B10 | Should marking a deposit paid or confirming payroll auto-create a Transaction (`sale_deposit`, `payroll`)? | No automatic transactions; the accountant records them. | — |
| B11 | Team membership: TZ says the head of sales manages "their" managers. | `User.teamLeadId` = the head of sales who created the manager. No UI/API to move a manager between teams yet. | `UsersService.executeCreateUser` |
| B12 | Buyer consent: buyers are not system users. | Manager confirms a signed consent form (`buyer_personal_data_consent`, exact version) on every booking/contract; the paper form itself is not stored. Should a scan be attached? | `buyer-pii.ts` |
| B13 | Consent withdrawal by an employee and the right to erasure for buyers. | Not implemented; deletion of bookings/contracts is available to director/head of sales. | — |
| B14 | Which consents are legally mandatory (#26). | `privacy_policy`, `terms_of_use`, `personal_data_processing` required to use the API; cookie policy informational (strictly necessary cookies only). | `LEGAL_REQUIRED_CONSENTS` |
| B15 | Upload types and size (#31–33). | PDF/JPEG/PNG for documents and receipts, JPEG/PNG/WebP avatars, 10 MB, no malware scanning. | `src/files/file-type.ts` |
| B16 | Daily sales report "посещаемость команды": whose team? | The team of the head of sales who closed the shift; director regeneration uses all managers. | `ReportsService.salesContent` |
| B17 | Excel export scope. | Transactions + per-category summary for a range of up to 366 days. Payroll export not included. | `AccountingService.exportXlsx` |

### Technical decisions (security)

- Encrypted with AES-256-GCM (AAD = column context): buyer name/passport/address/phone/email, employee name/phone/email, day-off reasons, transaction comments, uploaded file names, daily report bodies, uploaded files. Financial amounts are **not** field-encrypted (aggregation in SQL); see `docs/THREAT_MODEL.md`.
- Blind indexes (HMAC-SHA256, separate key) for exact passport/phone search.
- Detail views, PII searches and file downloads are audited (`PII_ACCESSED`, `FILE_DOWNLOADED`).
- Dependency hygiene: `package.json` `overrides` pin patched `multer`, `body-parser`, `lodash`, `qs`, `file-type`, `uuid`, `js-yaml`. A moderate `@nestjs/core` advisory needs Nest 11+ (separate upgrade task).

## Answers from the project owner (2026-09-17)

| # | Answer | Effect in code |
|---|---|---|
| B1 | "Как написано в ТЗ, так и будет." | **Still needs one clarification:** the TZ itself says two different things — text: closed period locked "кроме Директора"; CRUD table: Director Update = "—", Delete = "Всё". Current behaviour follows the CRUD table (director deletes, does not edit). Switching to the text version is a one-line change in `AccountingService.update`. |
| B3 | Working days Mon–Fri. | **Confirmed.** `WORKING_WEEKDAYS=1,2,3,4,5`, `Asia/Bishkek`. Public holidays: still open. |
| B4 | Source of `base_salary`: unknown yet. | **Open.** Temporary behaviour kept: carried over from the last confirmed entry, otherwise 0 and entered by the accountant. |
| B8 | Head of sales does not see payroll (TZ CRUD table). | **Confirmed**, including their own salary. |
| Residual risks | Nest 11 upgrade, HTTPS, DB TLS, encrypted backups — see `docs/THREAT_MODEL.md`. | Acknowledged; infrastructure tasks before production. |

B2, B5–B7, B9–B17: no answer yet — defaults above remain in force.

## Update 2026-09-18 — emailed codes, backups, no demo data

Owner decisions (2026-09-18):

| Topic | Decision | Implementation |
|---|---|---|
| Login | Code by email on **every** login, all roles | `POST /auth/login` → `POST /auth/login/verify`; `User.emailVerifiedAt` set by the first received code |
| Important actions | Code to the acting user's own email | `@RequireEmailCode` + `EmailCodeInterceptor`; list in `src/email-codes/email-code-actions.ts`. Account create/disable keep the Director approval |
| Email | Required, real and unique for every account | `CreateUserDto.email` required; `EMAIL_TAKEN`; change only via codes to the old and the new address |
| Demo data | Removed | `prisma/seed-demo.ts` deleted; first Director from `SEED_DIRECTOR_*` on an empty DB |
| Backups | Automatic agent on the Director's computer **and** manual download | `docs/BACKUPS.md`, `backup-agent/` (macOS + Windows) |
| Hosting | Free Render for now | `render.yaml`; email via Brevo HTTPS API (Render free blocks SMTP ports) |

### Risks accepted with "free Render for now" — please re-confirm before storing important data

- R1. The free PostgreSQL expires (about 30 days): the data survives only through the backups on the Director's computer and a manual restore.
- R2. Uploaded files vanish on every restart/deploy; only the last backup has them.
- R3. No database backups on the provider side; data written after the last agent download (13:00 / 19:00) is lost on failure.

### New open questions

| # | Question |
|---|---|
| C0 | Which operating system is on the Director's computer (macOS or Windows)? Both agents are ready; installation instructions differ. |
| C1 | Should the Director be able to change the email of another employee (e.g. a manager lost access to their mailbox)? Today only the user themself can, and a user without mailbox access cannot sign in. |
| C2 | Forgotten password: who resets it (Director via approval code?) — no reset flow exists yet. |
| C3 | Should any step-up code be bound to the exact request data (amount etc.), not only to the record? |

### Requested modules outside TZ v2 — specification needed before implementation

TZ v2 lists these as "вне рамок этой версии". The owner asked for them (2026-09-18); nothing is implemented until the business rules below are answered — guessing would put real money and tenants' personal data at risk.

**Аренда (арендаторы и договоры аренды)**

| # | Question |
|---|---|
| D1 | What is rented: premises in the same complex? Is there a list of objects/floors/premises (number, area, purpose)? Should sales (Booking/Contract) also be tied to specific premises? |
| D2 | Tenant: individual and/or company? Required fields (ФИО / название, ИНН, паспорт, телефон, email, банковские реквизиты)? |
| D3 | Lease contract: rate per m² or fixed, currency, term, security deposit, payment day and frequency, indexation, late fee, early termination. |
| D4 | Who creates and manages leases (existing role or a new "rental manager")? What do director, accountant and investors see (CRUD table like TZ v2)? |
| D5 | Rent payments: generated monthly invoices? Link to accounting (new income category `rent`?), debt/overdue report, reminders to tenants? |

**Заявки на обслуживание**

| # | Question |
|---|---|
| E1 | Who creates a request: employees only, or tenants themselves (then tenants need accounts/portal)? |
| E2 | Fields and categories (сантехника, электрика, уборка…), priority, photos. |
| E3 | Statuses and who executes (new role "technician"/contractor?), deadlines (SLA), cost of work → expense transaction? |

**Кассы и эквайринг**

| # | Question |
|---|---|
| F1 | Which cash registers (ККМ/ЭККМ, provider and model) and which acquiring bank? Do they provide an API, and do you have documentation/test access? |
| F2 | What should happen: payments from the register/bank automatically create income transactions? Fiscal receipts issued from the CRM? |

**1С**

| # | Question |
|---|---|
| G1 | Which 1С configuration and version (e.g. «Бухгалтерия для Кыргызстана»), hosted where? |
| G2 | Direction and data: CRM → 1С (transactions, contracts, payroll) and/or 1С → CRM? How often, and which system is the source of truth? |
| G3 | Exchange method available on the 1С side: file upload (XML/Excel), HTTP service, or OData? Who on the 1С side can configure it? |

**Push-уведомления в мессенджеры**

| # | Question |
|---|---|
| H1 | Which messenger: Telegram (free bot) or WhatsApp (paid Business API via Meta, needs a verified business)? |
| H2 | Which events and to whom (daily reports to Director/investors, missed shifts, large transactions, failed backups…)? Note: messages leave the CRM — personal data should not be included. |
