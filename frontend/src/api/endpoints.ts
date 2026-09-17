import { api, csrfHeader, downloadFile } from './client';
import type {
  AccountingPeriod,
  AccountingSummary,
  BackupStatus,
  Booking,
  BookingStatus,
  ConsentStatus,
  Contract,
  ContractRow,
  ContractStatus,
  DailyReport,
  DailyReportType,
  DashboardSummary,
  DayOff,
  EmailChallenge,
  EmailCodeAction,
  InitiateResult,
  LegalDocument,
  LegalDocumentMeta,
  LoginChallenge,
  Page,
  PayrollEntry,
  PayrollEntryStatus,
  PayrollSettings,
  PendingAction,
  SalesAnalytics,
  Session,
  Shift,
  ShiftStatus,
  Transaction,
  TransactionCategory,
  TransactionType,
  User,
  UserRole,
} from './types';

export type CodeHeaders = Record<string, string>;
const json = (body: unknown) => ({ body });

// --- Auth -------------------------------------------------------------------
export const authApi = {
  login: (username: string, password: string) =>
    api<LoginChallenge>('/auth/login', { method: 'POST', ...json({ username, password }), noRefresh: true }),
  verify: (challengeId: string, code: string) =>
    api<Session>('/auth/login/verify', { method: 'POST', ...json({ challengeId, code }), noRefresh: true }),
  logout: () => api<void>('/auth/logout', { method: 'POST', headers: csrfHeader(), noRefresh: true }),
  me: () => api<User>('/auth/me'),
};

export const emailCodesApi = {
  request: (action: EmailCodeAction, resourceId?: string) =>
    api<EmailChallenge>('/email-codes', { method: 'POST', ...json(resourceId ? { action, resourceId } : { action }) }),
};

// --- Legal & consent ----------------------------------------------------------
export const legalApi = {
  list: () => api<LegalDocumentMeta[]>('/legal/documents', { noRefresh: true }),
  get: (type: string) => api<LegalDocument>(`/legal/documents/${encodeURIComponent(type)}`, { noRefresh: true }),
  consentStatus: () => api<ConsentStatus>('/consents/status'),
  accept: (policyType: string, policyVersion: string) => api<unknown>('/consents', { method: 'POST', ...json({ policyType, policyVersion }) }),
};

// --- Users & confirmations --------------------------------------------------------
export interface CreateUserInput {
  username: string;
  password: string;
  fullName: string;
  email: string;
  phone?: string;
  role: UserRole;
}

export const usersApi = {
  list: () => api<User[]>('/users'),
  get: (id: string) => api<User>(`/users/${id}`),
  updateProfile: (body: { fullName?: string; phone?: string | null }) => api<User>('/users/me', { method: 'PATCH', body }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api<User>('/users/me/avatar', { method: 'PUT', body: form });
  },
  deleteAvatar: () => api<void>('/users/me/avatar', { method: 'DELETE' }),
  startEmailChange: (email: string, headers: CodeHeaders) =>
    api<EmailChallenge>('/users/me/email', { method: 'POST', body: { email }, headers }),
  confirmEmailChange: (challengeId: string, code: string) =>
    api<User>('/users/me/email/confirm', { method: 'POST', body: { challengeId, code } }),
  changePassword: (currentPassword: string, newPassword: string, headers: CodeHeaders) =>
    api<void>('/users/me/password', { method: 'POST', body: { currentPassword, newPassword }, headers }),
  initiateCreate: (body: CreateUserInput) => api<InitiateResult>('/confirmations/users', { method: 'POST', body }),
  initiateDisable: (id: string) => api<InitiateResult>(`/confirmations/users/${id}/disable`, { method: 'POST' }),
  pending: () => api<PendingAction[]>('/confirmations/pending'),
  confirm: (id: string, code: string) => api<User>(`/confirmations/${id}/confirm`, { method: 'POST', body: { code } }),
  reject: (id: string) => api<unknown>(`/confirmations/${id}/reject`, { method: 'POST' }),
};

// --- Sales -------------------------------------------------------------------
export interface BuyerInput {
  fullName: string;
  passportNumber: string;
  phone: string;
  email?: string;
}
export interface BuyerConsentInput {
  buyerConsentConfirmed: true;
  buyerConsentVersion: string;
}
export interface SalesListQuery {
  status?: string;
  managerId?: string;
  passportNumber?: string;
  phone?: string;
  limit?: number;
  offset?: number;
}

export const bookingsApi = {
  list: (q: SalesListQuery) => api<Page<Booking>>('/bookings', { query: { ...q } }),
  get: (id: string) => api<Booking>(`/bookings/${id}`),
  create: (body: BuyerInput & BuyerConsentInput & { desiredAreaSqm: string; managerId?: string }) =>
    api<Booking>('/bookings', { method: 'POST', body }),
  update: (id: string, body: Partial<BuyerInput> & { desiredAreaSqm?: string; status?: BookingStatus; managerId?: string }) =>
    api<Booking>(`/bookings/${id}`, { method: 'PATCH', body }),
  remove: (id: string, headers: CodeHeaders) => api<void>(`/bookings/${id}`, { method: 'DELETE', headers }),
  convert: (id: string, body: BuyerConsentInput & { address: string; areaSqm?: string; pricePerSqmTyiyn: string; depositPercent?: string }) =>
    api<Contract>(`/bookings/${id}/convert`, { method: 'POST', body }),
};

export interface ContractTermsInput {
  address: string;
  areaSqm: string;
  pricePerSqmTyiyn: string;
  depositPercent?: string;
}

export const contractsApi = {
  list: (q: SalesListQuery & { status?: ContractStatus }) => api<Page<ContractRow>>('/contracts', { query: { ...q } }),
  get: (id: string) => api<ContractRow>(`/contracts/${id}`),
  create: (body: BuyerInput & BuyerConsentInput & ContractTermsInput & { managerId?: string }) =>
    api<Contract>('/contracts', { method: 'POST', body }),
  update: (id: string, body: Partial<BuyerInput & ContractTermsInput> & { managerId?: string }) =>
    api<Contract>(`/contracts/${id}`, { method: 'PATCH', body }),
  remove: (id: string, headers: CodeHeaders) => api<void>(`/contracts/${id}`, { method: 'DELETE', headers }),
  markDeposit: (id: string, paid: boolean, headers: CodeHeaders) =>
    api<ContractRow>(`/contracts/${id}/deposit`, { method: 'POST', body: { paid }, headers }),
  uploadFile: (id: string, file: File, headers: CodeHeaders) => {
    const form = new FormData();
    form.append('file', file);
    return api<Contract>(`/contracts/${id}/file`, { method: 'PUT', body: form, headers });
  },
  downloadFile: (id: string) => downloadFile(`/contracts/${id}/file`, `contract-${id}`),
};

// --- Attendance ----------------------------------------------------------------
export const shiftsApi = {
  current: () => api<Shift | null>('/shifts/current'),
  open: () => api<Shift>('/shifts/open', { method: 'POST' }),
  close: () => api<Shift & { reportGenerated: DailyReportType | null }>('/shifts/close', { method: 'POST' }),
  list: (q: { status?: ShiftStatus; from?: string; to?: string; userId?: string; limit?: number; offset?: number }) =>
    api<Page<Shift>>('/shifts', { query: { ...q } }),
  correct: (id: string, body: { status: ShiftStatus; openedAt?: string; closedAt?: string }, headers: CodeHeaders) =>
    api<Shift>(`/shifts/${id}`, { method: 'PATCH', body, headers }),
  remove: (id: string, headers: CodeHeaders) => api<void>(`/shifts/${id}`, { method: 'DELETE', headers }),
};

export const dayOffsApi = {
  list: (q: { from?: string; to?: string; userId?: string; limit?: number; offset?: number }) =>
    api<Page<DayOff>>('/day-offs', { query: { ...q } }),
  create: (body: { userId: string; date: string; reason?: string }) => api<DayOff>('/day-offs', { method: 'POST', body }),
  update: (id: string, body: { date?: string; reason?: string }) => api<DayOff>(`/day-offs/${id}`, { method: 'PATCH', body }),
  remove: (id: string, headers: CodeHeaders) => api<void>(`/day-offs/${id}`, { method: 'DELETE', headers }),
};

// --- Payroll -------------------------------------------------------------------
export const payrollApi = {
  settings: () => api<PayrollSettings | null>('/payroll/settings'),
  putSettings: (body: { finePerMissedShiftTyiyn: string; taxRatePercent: string }, headers: CodeHeaders) =>
    api<PayrollSettings>('/payroll/settings', { method: 'PUT', body, headers }),
  generate: (period: string) => api<PayrollEntry[]>('/payroll/entries/generate', { method: 'POST', body: { period } }),
  list: (q: { period?: string; userId?: string; status?: PayrollEntryStatus }) => api<PayrollEntry[]>('/payroll/entries', { query: { ...q } }),
  update: (id: string, body: { baseSalaryTyiyn?: string; fineAmountTyiyn?: string }) =>
    api<PayrollEntry>(`/payroll/entries/${id}`, { method: 'PATCH', body }),
  confirm: (id: string, headers: CodeHeaders) => api<PayrollEntry>(`/payroll/entries/${id}/confirm`, { method: 'POST', headers }),
  remove: (id: string, headers: CodeHeaders) => api<void>(`/payroll/entries/${id}`, { method: 'DELETE', headers }),
};

// --- Accounting ------------------------------------------------------------------
export interface TransactionInput {
  type: TransactionType;
  category: TransactionCategory;
  subcategory?: string;
  amountTyiyn: string;
  date: string;
  comment?: string;
  relatedContractId?: string;
}

export const accountingApi = {
  list: (q: { from?: string; to?: string; type?: TransactionType; category?: TransactionCategory; limit?: number; offset?: number }) =>
    api<Page<Transaction>>('/transactions', { query: { ...q } }),
  create: (body: TransactionInput, headers: CodeHeaders) => api<Transaction>('/transactions', { method: 'POST', body, headers }),
  update: (id: string, body: Partial<TransactionInput>, headers: CodeHeaders) =>
    api<Transaction>(`/transactions/${id}`, { method: 'PATCH', body, headers }),
  remove: (id: string, headers: CodeHeaders) => api<void>(`/transactions/${id}`, { method: 'DELETE', headers }),
  uploadAttachment: (id: string, file: File, headers: CodeHeaders) => {
    const form = new FormData();
    form.append('file', file);
    return api<Transaction>(`/transactions/${id}/attachment`, { method: 'PUT', body: form, headers });
  },
  downloadAttachment: (id: string) => downloadFile(`/transactions/${id}/attachment`, `receipt-${id}`),
  periods: () => api<AccountingPeriod[]>('/accounting/periods'),
  closePeriod: (period: string, headers: CodeHeaders) => api<AccountingPeriod>(`/accounting/periods/${period}/close`, { method: 'POST', headers }),
  summary: (from: string, to: string) => api<AccountingSummary>('/accounting/summary', { query: { from, to } }),
  exportXlsx: (from: string, to: string) => downloadFile('/accounting/export.xlsx', `accounting-${from}_${to}.xlsx`, { from, to }),
};

// --- Reports, dashboard, backups ---------------------------------------------------
export const reportsApi = {
  list: (q: { type?: DailyReportType; from?: string; to?: string; limit?: number; offset?: number }) =>
    api<Page<DailyReport>>('/daily-reports', { query: { ...q } }),
  regenerate: (type: DailyReportType, date: string) => api<DailyReport>('/daily-reports/regenerate', { method: 'POST', body: { type, date } }),
};

export const dashboardApi = {
  summary: (from?: string, to?: string) => api<DashboardSummary>('/dashboard', { query: { from, to } }),
  sales: (from?: string, to?: string) => api<SalesAnalytics>('/analytics/sales', { query: { from, to } }),
};

export const backupsApi = {
  status: () => api<BackupStatus>('/backups/status'),
  download: (headers: CodeHeaders) => downloadFile('/backups/export', 'uzz-crm-backup.uzzbak', undefined, headers),
};
