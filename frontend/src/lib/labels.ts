import type {
  BookingStatus,
  ContractStatus,
  DailyReportType,
  PayrollEntryStatus,
  ShiftStatus,
  TransactionCategory,
  TransactionType,
  UserRole,
} from '@/api/types';

export const ROLE_LABELS: Record<UserRole, string> = {
  director: 'Директор',
  head_of_sales: 'Начальник отдела продаж',
  sales_manager: 'Менеджер отдела продаж',
  accountant: 'Бухгалтер',
  investor: 'Инвестор',
};

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: Tone }> = {
  active: { label: 'Активна', tone: 'primary' },
  converted: { label: 'Оформлен договор', tone: 'success' },
  cancelled: { label: 'Отменена', tone: 'neutral' },
};

export const CONTRACT_STATUS: Record<ContractStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Черновик', tone: 'neutral' },
  deposit_paid: { label: 'Взнос внесён', tone: 'warning' },
  signed: { label: 'Подписан', tone: 'success' },
};

export const SHIFT_STATUS: Record<ShiftStatus, { label: string; tone: Tone }> = {
  open: { label: 'Открыта', tone: 'primary' },
  closed: { label: 'Закрыта', tone: 'success' },
  missed: { label: 'Прогул', tone: 'danger' },
};

export const PAYROLL_STATUS: Record<PayrollEntryStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Черновик', tone: 'warning' },
  confirmed: { label: 'Подтверждено', tone: 'success' },
};

export const REPORT_TYPE: Record<DailyReportType, string> = {
  financial: 'Финансовый',
  sales: 'Продажи',
};

export const TRANSACTION_TYPE: Record<TransactionType, string> = {
  income: 'Приход',
  expense: 'Расход',
};

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  sale_deposit: 'Взнос по договору',
  sale_full_payment: 'Полная оплата по договору',
  sale_installment: 'Платёж по рассрочке',
  other_income: 'Прочие поступления',
  construction_materials: 'Строительные материалы',
  contractor_payment: 'Оплата подрядчикам',
  payroll: 'Зарплата и налоги',
  equipment_rent: 'Аренда техники',
  utilities: 'Коммунальные расходы',
  marketing: 'Маркетинг и реклама',
  legal_notary: 'Юридические и нотариальные',
  taxes_corporate: 'Корпоративные налоги',
  admin_office: 'Административные расходы',
  other_expense: 'Непредвиденные расходы',
};

export const INCOME_CATEGORIES: TransactionCategory[] = ['sale_deposit', 'sale_full_payment', 'sale_installment', 'other_income'];
export const EXPENSE_CATEGORIES: TransactionCategory[] = [
  'construction_materials',
  'contractor_payment',
  'payroll',
  'equipment_rent',
  'utilities',
  'marketing',
  'legal_notary',
  'taxes_corporate',
  'admin_office',
  'other_expense',
];

export const LEGAL_TITLES: Record<string, string> = {
  privacy_policy: 'Политика конфиденциальности',
  terms_of_use: 'Условия использования',
  cookie_policy: 'Политика cookie',
  personal_data_processing: 'Согласие на обработку персональных данных',
  buyer_personal_data_consent: 'Согласие покупателя на обработку данных',
};

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
