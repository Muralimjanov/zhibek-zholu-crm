import {
  BarChart3,
  BookMarked,
  CalendarClock,
  CalendarOff,
  DatabaseBackup,
  FileSignature,
  LayoutDashboard,
  Newspaper,
  Receipt,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/api/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  group: 'main' | 'sales' | 'staff' | 'finance' | 'admin';
}

/** Screens per role follow TZ v2 "Обновлённые экраны по ролям" and the CRUD matrix. */
export const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Сводка', icon: LayoutDashboard, roles: ['director', 'investor'], group: 'main' },
  { to: '/reports', label: 'Ежедневные отчёты', icon: Newspaper, roles: ['director', 'investor', 'head_of_sales', 'accountant'], group: 'main' },
  { to: '/bookings', label: 'Бронирования', icon: BookMarked, roles: ['director', 'head_of_sales', 'sales_manager'], group: 'sales' },
  { to: '/contracts', label: 'Договоры', icon: FileSignature, roles: ['director', 'head_of_sales', 'sales_manager', 'accountant'], group: 'sales' },
  { to: '/analytics', label: 'Аналитика продаж', icon: BarChart3, roles: ['director', 'head_of_sales'], group: 'sales' },
  { to: '/shifts', label: 'Смены', icon: CalendarClock, roles: ['director', 'head_of_sales', 'sales_manager', 'accountant'], group: 'staff' },
  { to: '/day-offs', label: 'Выходные', icon: CalendarOff, roles: ['director', 'head_of_sales', 'sales_manager', 'accountant'], group: 'staff' },
  { to: '/team', label: 'Сотрудники', icon: Users, roles: ['director', 'head_of_sales'], group: 'staff' },
  { to: '/payroll', label: 'Зарплата', icon: Wallet, roles: ['director', 'accountant', 'sales_manager'], group: 'finance' },
  { to: '/accounting', label: 'Бухгалтерия', icon: Receipt, roles: ['director', 'accountant'], group: 'finance' },
  { to: '/approvals', label: 'Подтверждения', icon: ShieldCheck, roles: ['director'], group: 'admin' },
  { to: '/backups', label: 'Резервные копии', icon: DatabaseBackup, roles: ['director'], group: 'admin' },
];

export const GROUP_LABELS: Record<NavItem['group'], string> = {
  main: 'Обзор',
  sales: 'Продажи',
  staff: 'Персонал',
  finance: 'Финансы',
  admin: 'Администрирование',
};

export function navFor(role: UserRole): NavItem[] {
  return NAV.filter((i) => i.roles.includes(role));
}

export function homeFor(role: UserRole): string {
  return navFor(role)[0]?.to ?? '/profile';
}

export const SHIFT_ROLES: UserRole[] = ['head_of_sales', 'sales_manager', 'accountant'];
