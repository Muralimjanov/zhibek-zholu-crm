# Threat model — CRM «Улуу Жибек Жолу» (MVP backend)

Scope: this repository (NestJS API + PostgreSQL + local encrypted file storage).
Goal (SECURITY_SPEC.md): reduce the probability of compromise and limit the
impact of a leak. No system is "unhackable"; each control below reduces a
specific risk and each residual risk is listed explicitly.

## Assets

| Asset | Classification | Where |
|---|---|---|
| Buyer passport number, address, full name, phone, email | Highly sensitive PII | `Booking`/`Contract` `*Enc` columns (AES-256-GCM) |
| Contract documents, receipts, avatars | Highly sensitive | `FILE_STORAGE_DIR`, encrypted per file |
| Employee full name, phone, email | PII | `User` (AES-256-GCM) |
| Payroll, transactions | Confidential financial | PostgreSQL (plain numbers, access-controlled) |
| Passwords, refresh tokens, confirmation codes | Authentication secrets | only hashes (Argon2id / SHA-256) |
| Encryption + blind-index keys | Secrets | environment / secret manager, never in DB or git |
| Audit log | Security evidence | `AuditEvent` (allowlisted metadata, no PII/secrets) |

## Threats and controls

| Threat (SECURITY_SPEC.md) | Controls in code | Verified by |
|---|---|---|
| Credential stuffing / brute force | Argon2id; identical 401 for unknown user / wrong password / disabled; per-IP login+refresh limit (`AUTH_THROTTLE_*`); confirm-code 5/min + max attempts | `real-db.e2e-spec.ts` rate-limit tests |
| Account enumeration | same error body and dummy hash on unknown user | real-db auth tests |
| Stolen refresh token | HttpOnly cookie, SHA-256 at rest, rotation, family revocation on reuse (incl. concurrent reuse) | real-db reuse/concurrency tests |
| CSRF on cookie auth | double-submit token on `/auth/refresh`, `/auth/logout`; SameSite | real-db CSRF test |
| Privilege escalation | global JWT guard, `@Roles`, role-creation matrix, DTO whitelist (`forbidNonWhitelisted`), no role in self-update, maker-checker with Director code for account create/disable | role matrix test (25 pairs) |
| IDOR/BOLA | every Booking/Contract/Shift/DayOff/Payroll query is built with the actor's scope (own / team / all); out-of-scope ids return 404 | `sales`, `attendance-payroll` specs |
| Leak of the database or a backup | buyer & employee PII, day-off reasons, transaction comments, daily report bodies, file names encrypted with AES-256-GCM, AAD binds ciphertext to its column; keys outside the DB; blind indexes for search instead of plaintext | "stored encrypted at rest" assertions |
| Excessive API data | explicit response mappers; passport masked in lists; accountant sees finance-only contract view; investors get aggregates only | investor/accountant PII-absence tests |
| Malicious file upload | magic-byte type detection (PDF/JPEG/PNG/WebP only), size limit enforced while streaming, random storage keys (no path traversal), encrypted at rest, SHA-256 integrity check on read | `sales` file tests incl. disguised HTML/SVG and on-disk tampering |
| Stored XSS / content sniffing | JSON API only; downloads with detected MIME, `nosniff`, `CSP: default-src 'none'; sandbox`, `attachment`; client-supplied avatar URLs removed | download header tests |
| SSRF | the server never fetches user-supplied URLs (avatarUrl field removed) | — |
| SQL injection | Prisma parameterised queries; strict input patterns; only `$executeRawUnsafe` is a constant TRUNCATE in tests | validation tests |
| Spreadsheet formula injection | cells starting with `= + - @ TAB CR` prefixed with `'` in Excel export | export test |
| Leaked secrets / logs | audit metadata allowlist + forbidden keys; codes/passwords/tokens never logged; errors mapped to stable codes, no stack traces | audit-redaction and stdout tests |
| Data integrity / fraud | money in BigInt tyiyn; totals computed server-side; DB CHECK constraints (signed ⇒ deposit+file, final = base − fine − tax, category ↔ type, currency KGS); atomic state transitions (booking conversion, confirm, deposit, payroll confirm); closed accounting periods; missed shifts cannot be erased by a head of sales | DB-constraint and concurrency tests |
| Compromised employee account | status re-checked on every request; disable revokes all sessions; PII views and downloads audited (`PII_ACCESSED`, `FILE_DOWNLOADED`) | disable-flow test |
| Reconnaissance | Swagger never mounted in production; `x-powered-by` disabled; Helmet headers | config unit test, headers test |
| DoS via large bodies | JSON body limit (`JSON_BODY_LIMIT`), multipart limits, bounded pagination and report ranges | 413 test |

## Residual risks / required outside this repo

1. **Key management**: keys are environment variables. Production needs a secret manager/KMS, restricted access and a rotation runbook (OPEN_QUESTIONS #40). Losing `ENCRYPTION_KEY_V1` makes encrypted data unrecoverable — back up the keys separately from the database.
2. **Financial amounts are not field-encrypted** (needed for SQL aggregation); protected by RBAC, DB access control and storage/backup encryption, which must be configured on the server.
3. **HTTPS, database TLS, private network, encrypted backups, restore tests** are infrastructure tasks (SECURITY_SPEC.md "Database").
4. **Blind indexes reveal equality** (two rows with the same passport) to someone with DB access; accepted trade-off for exact search.
5. **Malware scanning** of uploads is not implemented (OPEN_QUESTIONS #33); PDFs are served only as downloads.
6. **Rate limits are per process and per IP**; multiple instances or a reverse proxy need a shared store and `TRUST_PROXY` (#41).
7. **Framework advisories**: `npm audit` still reports a moderate `@nestjs/core` advisory (fixed only in Nest 11+) and a `js-yaml` issue reachable only when *parsing* untrusted YAML, which this app never does. Plan a Nest 11 upgrade.
8. **No MFA** (#9) and **no password reset / change flow** (#6, #13).
9. Legal texts are **drafts** with placeholders — they must be completed and approved by a lawyer before production.
