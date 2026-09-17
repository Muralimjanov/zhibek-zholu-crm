/**
 * Important actions that require a one-time code emailed to the acting user
 * (owner decision 2026-09-18: "важные действия — код себе на почту").
 *
 * `resourceParam` names the route parameter the code is bound to, so a code
 * issued for deleting booking A cannot be used to delete booking B.
 * Account creation/disabling keep their separate Director approval
 * (ConfirmationsService).
 */
export const EMAIL_CODE_ACTIONS = {
  'booking.delete': { label: 'Удаление бронирования', resourceParam: 'id' },
  'contract.delete': { label: 'Удаление договора', resourceParam: 'id' },
  'contract.deposit': { label: 'Отметка взноса по договору', resourceParam: 'id' },
  'contract.file': { label: 'Загрузка подписанного договора', resourceParam: 'id' },
  'shift.update': { label: 'Коррекция смены', resourceParam: 'id' },
  'shift.delete': { label: 'Удаление смены', resourceParam: 'id' },
  'day_off.delete': { label: 'Удаление выходного', resourceParam: 'id' },
  'payroll.settings.update': { label: 'Изменение настроек зарплаты', resourceParam: null },
  'payroll.confirm': { label: 'Подтверждение зарплаты', resourceParam: 'id' },
  'payroll.delete': { label: 'Удаление начисления зарплаты', resourceParam: 'id' },
  'transaction.create': { label: 'Создание транзакции', resourceParam: null },
  'transaction.update': { label: 'Изменение транзакции', resourceParam: 'id' },
  'transaction.delete': { label: 'Удаление транзакции', resourceParam: 'id' },
  'transaction.attachment': { label: 'Загрузка вложения к транзакции', resourceParam: 'id' },
  'accounting.period.close': { label: 'Закрытие месяца', resourceParam: 'period' },
  'user.email.change': { label: 'Смена email', resourceParam: null },
  'user.password.change': { label: 'Смена пароля', resourceParam: null },
  'backup.export': { label: 'Скачивание резервной копии базы', resourceParam: null },
} as const satisfies Record<string, { label: string; resourceParam: string | null }>;

export type EmailCodeAction = keyof typeof EMAIL_CODE_ACTIONS;

export const EMAIL_CODE_ACTION_KEYS = Object.keys(EMAIL_CODE_ACTIONS) as EmailCodeAction[];

export function isEmailCodeAction(value: string): value is EmailCodeAction {
  return Object.prototype.hasOwnProperty.call(EMAIL_CODE_ACTIONS, value);
}

/** Headers carrying the step-up code on the protected request. */
export const EMAIL_CODE_ID_HEADER = 'x-confirmation-id';
export const EMAIL_CODE_HEADER = 'x-confirmation-code';
