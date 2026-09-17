export enum AuditAction {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  REFRESH_SUCCESS = 'REFRESH_SUCCESS',
  REFRESH_FAILURE = 'REFRESH_FAILURE',
  REFRESH_REUSE_DETECTED = 'REFRESH_REUSE_DETECTED',
  USER_CREATED = 'USER_CREATED',
  USER_CREATION_FORBIDDEN = 'USER_CREATION_FORBIDDEN',
  USER_DISABLED = 'USER_DISABLED',
  USER_PROFILE_UPDATED = 'USER_PROFILE_UPDATED',
  ROLE_ESCALATION_ATTEMPT = 'ROLE_ESCALATION_ATTEMPT',
  CONSENT_RECORDED = 'CONSENT_RECORDED',
  PENDING_ACTION_CREATED = 'PENDING_ACTION_CREATED',
  PENDING_ACTION_EMAIL_FAILED = 'PENDING_ACTION_EMAIL_FAILED',
  PENDING_ACTION_CONFIRMED = 'PENDING_ACTION_CONFIRMED',
  PENDING_ACTION_CONFIRM_FAILED = 'PENDING_ACTION_CONFIRM_FAILED',
  PENDING_ACTION_LOCKED = 'PENDING_ACTION_LOCKED',
  PENDING_ACTION_EXPIRED = 'PENDING_ACTION_EXPIRED',
  PENDING_ACTION_REJECTED = 'PENDING_ACTION_REJECTED',
  USER_AVATAR_UPDATED = 'USER_AVATAR_UPDATED',
  // Sales
  BOOKING_CREATED = 'BOOKING_CREATED',
  BOOKING_UPDATED = 'BOOKING_UPDATED',
  BOOKING_DELETED = 'BOOKING_DELETED',
  BOOKING_CONVERTED = 'BOOKING_CONVERTED',
  CONTRACT_CREATED = 'CONTRACT_CREATED',
  CONTRACT_UPDATED = 'CONTRACT_UPDATED',
  CONTRACT_DELETED = 'CONTRACT_DELETED',
  CONTRACT_DEPOSIT_MARKED = 'CONTRACT_DEPOSIT_MARKED',
  CONTRACT_FILE_UPLOADED = 'CONTRACT_FILE_UPLOADED',
  /** Accountability for access to decrypted buyer PII (detail view, exact search, file download). */
  PII_ACCESSED = 'PII_ACCESSED',
  FILE_DOWNLOADED = 'FILE_DOWNLOADED',
  // Attendance
  SHIFT_OPENED = 'SHIFT_OPENED',
  SHIFT_CLOSED = 'SHIFT_CLOSED',
  SHIFT_MISSED_RECORDED = 'SHIFT_MISSED_RECORDED',
  SHIFT_CORRECTED = 'SHIFT_CORRECTED',
  SHIFT_DELETED = 'SHIFT_DELETED',
  DAY_OFF_CREATED = 'DAY_OFF_CREATED',
  DAY_OFF_UPDATED = 'DAY_OFF_UPDATED',
  DAY_OFF_DELETED = 'DAY_OFF_DELETED',
  // Payroll
  PAYROLL_SETTINGS_UPDATED = 'PAYROLL_SETTINGS_UPDATED',
  PAYROLL_GENERATED = 'PAYROLL_GENERATED',
  PAYROLL_ENTRY_UPDATED = 'PAYROLL_ENTRY_UPDATED',
  PAYROLL_ENTRY_CONFIRMED = 'PAYROLL_ENTRY_CONFIRMED',
  PAYROLL_ENTRY_DELETED = 'PAYROLL_ENTRY_DELETED',
  // Accounting
  TRANSACTION_CREATED = 'TRANSACTION_CREATED',
  TRANSACTION_UPDATED = 'TRANSACTION_UPDATED',
  TRANSACTION_DELETED = 'TRANSACTION_DELETED',
  TRANSACTION_ATTACHMENT_UPLOADED = 'TRANSACTION_ATTACHMENT_UPLOADED',
  ACCOUNTING_PERIOD_CLOSED = 'ACCOUNTING_PERIOD_CLOSED',
  ACCOUNTING_EXPORTED = 'ACCOUNTING_EXPORTED',
  // Reports
  DAILY_REPORT_GENERATED = 'DAILY_REPORT_GENERATED',
}

/**
 * Keys that are explicitly permitted in AuditEvent.metadata. Anything else
 * is stripped, and known-sensitive keys are always rejected even if present
 * (defense in depth - see AUDIT/SECURITY_SPEC.md).
 */
const METADATA_ALLOWLIST = new Set([
  'username',
  'targetUserId',
  'targetRole',
  'requestedRole',
  'reason',
  'policyType',
  'policyVersion',
  'familyId',
  'pendingActionId',
  'pendingActionType',
  'attempts',
  'maxAttempts',
  'recipientCount',
  'fields',
  'status',
  'bookingId',
  'contractId',
  'fileId',
  'purpose',
  'paid',
  'date',
  'period',
  'reportType',
  'transactionType',
  'category',
  'count',
  'view',
  'searchBy',
]);

const FORBIDDEN_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'accessToken',
  'refreshToken',
  'refresh_token',
  'encryptionKey',
  'passportNumber',
  'passport_number',
  'documentContent',
  'code',
  'confirmationCode',
  'otp',
  'codeHash',
]);

export function redactMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (!METADATA_ALLOWLIST.has(key)) continue;
    safe[key] = value;
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}
