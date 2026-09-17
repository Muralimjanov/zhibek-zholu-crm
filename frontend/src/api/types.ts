/** Response and request shapes of the CRM API (backend: src/<module>/<module>.service.ts). */
export type UserRole = 'director' | 'head_of_sales' | 'sales_manager' | 'accountant' | 'investor';
export type UserStatus = 'active' | 'disabled';
export type BookingStatus = 'active' | 'converted' | 'cancelled';
export type ContractStatus = 'draft' | 'deposit_paid' | 'signed';
export type ShiftStatus = 'open' | 'closed' | 'missed';
export type PayrollEntryStatus = 'draft' | 'confirmed';
export type TransactionType = 'income' | 'expense';
export type DailyReportType = 'financial' | 'sales';
export type TransactionCategory =
  | 'sale_deposit'
  | 'sale_full_payment'
  | 'sale_installment'
  | 'other_income'
  | 'construction_materials'
  | 'contractor_payment'
  | 'payroll'
  | 'equipment_rent'
  | 'utilities'
  | 'marketing'
  | 'legal_notary'
  | 'taxes_corporate'
  | 'admin_office'
  | 'other_expense';

export type EmailCodeAction =
  | 'booking.delete'
  | 'contract.delete'
  | 'contract.deposit'
  | 'contract.file'
  | 'shift.update'
  | 'shift.delete'
  | 'day_off.delete'
  | 'payroll.settings.update'
  | 'payroll.confirm'
  | 'payroll.delete'
  | 'transaction.create'
  | 'transaction.update'
  | 'transaction.delete'
  | 'transaction.attachment'
  | 'accounting.period.close'
  | 'user.email.change'
  | 'user.password.change'
  | 'backup.export';

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  teamLeadId: string | null;
  createdAt: string;
}

export interface EmailChallenge {
  challengeId: string;
  expiresAt: string;
  emailHint: string;
}

export interface LoginChallenge extends EmailChallenge {
  mfaRequired: true;
}

export interface Session {
  accessToken: string;
  expiresIn: number;
  csrfToken: string;
  user: User;
}

export interface ConsentStatus {
  allRequiredAccepted: boolean;
  required: Array<{ policyType: string; currentVersion: string; accepted: boolean; acceptedAt: string | null }>;
}

export interface LegalDocumentMeta {
  type: string;
  version: string;
  title: string;
  audience: 'user' | 'buyer' | 'informational';
  draft: boolean;
}

export interface LegalDocument extends LegalDocumentMeta {
  content: string;
}

export interface PendingAction {
  id: string;
  type: 'create_user' | 'disable_user';
  status: string;
  expiresAt: string;
  createdAt: string;
  initiatorUserId: string;
  summary: string;
}

export interface InitiateResult {
  pendingActionId: string;
  type: string;
  status: string;
  expiresAt: string;
  emailDelivery: 'sent' | 'failed' | 'no_recipients';
}

export interface Booking {
  id: string;
  fullName: string;
  passportNumber: string;
  phone: string;
  email: string | null;
  desiredAreaSqm: string;
  status: BookingStatus;
  managerId: string;
  contractId: string | null;
  buyerConsentVersion: string;
  buyerConsentConfirmedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractFinance {
  id: string;
  status: ContractStatus;
  areaSqm: string;
  pricePerSqmTyiyn: string;
  totalAmountTyiyn: string;
  depositPercent: string;
  depositAmountTyiyn: string;
  depositPaid: boolean;
  depositPaidAt: string | null;
  hasFile: boolean;
  managerId: string;
  bookingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contract extends ContractFinance {
  fullName: string;
  passportNumber: string;
  address: string;
  phone: string;
  email: string | null;
  buyerConsentVersion: string;
  buyerConsentConfirmedAt: string;
}

export type ContractRow = Contract | ContractFinance;

export function hasBuyer(c: ContractRow): c is Contract {
  return 'fullName' in c;
}

export interface Shift {
  id: string;
  userId: string;
  date: string;
  openedAt: string | null;
  closedAt: string | null;
  status: ShiftStatus;
  createdAt: string;
}

export interface DayOff {
  id: string;
  userId: string;
  date: string;
  approvedById: string;
  reason: string | null;
  createdAt: string;
}

export interface PayrollSettings {
  finePerMissedShiftTyiyn: string;
  taxRatePercent: string;
  updatedAt: string;
}

export interface PayrollEntry {
  id: string;
  userId: string;
  employeeFullName: string;
  employeeRole: UserRole;
  period: string;
  baseSalaryTyiyn: string;
  missedShiftsCount: number;
  finePerMissedShiftTyiyn: string;
  fineAmountTyiyn: string;
  fineManuallyAdjusted: boolean;
  taxRatePercent: string;
  taxAmountTyiyn: string;
  finalAmountTyiyn: string;
  status: PayrollEntryStatus;
  confirmedById: string | null;
  confirmedAt: string | null;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  category: TransactionCategory;
  subcategory: string | null;
  amountTyiyn: string;
  currency: string;
  date: string;
  comment: string | null;
  hasAttachment: boolean;
  relatedContractId: string | null;
  createdById: string;
  periodClosed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingSummary {
  from: string;
  to: string;
  incomeTyiyn: string;
  expenseTyiyn: string;
  netTyiyn: string;
  byCategory: Array<{ category: TransactionCategory; label: string; type: TransactionType; count: number; amountTyiyn: string }>;
}

export interface AccountingPeriod {
  period: string;
  closedAt: string;
  closedById: string;
}

export interface DailyReport {
  id: string;
  type: DailyReportType;
  date: string;
  generatedAt: string;
  summary: string;
  data: unknown;
}

export interface DashboardSummary {
  from: string;
  to: string;
  bookings: Array<{ status: BookingStatus; count: number; areaSqm: string }>;
  contracts: Array<{ status: ContractStatus; count: number; areaSqm: string; totalAmountTyiyn: string }>;
  depositsPaid: { count: number; amountTyiyn: string };
  payrollConfirmed: { entries: number; finalAmountTyiyn: string; taxAmountTyiyn: string; fineAmountTyiyn: string };
  attendance: { missedShifts: number };
  accounting: Pick<AccountingSummary, 'incomeTyiyn' | 'expenseTyiyn' | 'netTyiyn' | 'byCategory'>;
}

export interface SalesAnalytics {
  from: string;
  to: string;
  totals: { bookedAreaSqm: string; soldAreaSqm: string; soldAmountTyiyn: string };
  perManager: Array<{
    userId: string;
    fullName: string;
    role: UserRole;
    bookings: { count: number; areaSqm: string };
    signedContracts: { count: number; areaSqm: string; totalAmountTyiyn: string };
    attendance: { workedShifts: number; missedShifts: number; dayOffs: number };
  }>;
}

export interface BackupStatus {
  configured: boolean;
  agentConfigured: boolean;
  publicKeySha256: string | null;
  lastExportAt: string | null;
  lastExportChannel: string | null;
  reminderAfterHours: number;
}
