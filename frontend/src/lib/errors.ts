/** Stable API error codes -> messages for people. Unknown codes fall back to a generic text. */
const MESSAGES: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: 'Неверный логин или пароль.',
  AUTH_EMAIL_NOT_CONFIGURED: 'У аккаунта не указан email — войти нельзя. Обратитесь к директору.',
  AUTH_FORBIDDEN: 'Недостаточно прав для этого действия.',
  AUTH_REQUIRED: 'Сессия истекла. Войдите снова.',
  AUTH_REFRESH_INVALID: 'Сессия истекла. Войдите снова.',
  AUTH_CSRF_INVALID: 'Сессия истекла. Войдите снова.',
  AUTH_ACCOUNT_DISABLED: 'Аккаунт отключён.',
  CONSENT_REQUIRED: 'Нужно принять юридические документы.',
  EMAIL_CODE_REQUIRED: 'Нужен код подтверждения из письма.',
  EMAIL_CODE_INVALID: 'Неверный код. Проверьте письмо и попробуйте ещё раз.',
  EMAIL_CODE_USED: 'Этот код уже использован или заменён новым. Запросите новый код.',
  EMAIL_CODE_EXPIRED: 'Срок действия кода истёк. Запросите новый код.',
  EMAIL_CODE_LOCKED: 'Слишком много неверных попыток. Запросите новый код.',
  EMAIL_CODE_RATE_LIMITED: 'Слишком много кодов за 15 минут. Подождите и попробуйте снова.',
  EMAIL_DELIVERY_FAILED: 'Не удалось отправить письмо. Попробуйте позже.',
  EMAIL_TAKEN: 'Этот email уже используется другим аккаунтом.',
  EMAIL_UNCHANGED: 'Это ваш текущий email.',
  USERNAME_TAKEN: 'Такой логин уже занят.',
  USER_ROLE_CREATION_FORBIDDEN: 'Вы не можете создавать пользователей с этой ролью.',
  CONFIRMATION_CODE_INVALID: 'Неверный код подтверждения.',
  CONFIRMATION_ALREADY_RESOLVED: 'Запрос уже обработан или истёк.',
  MANAGER_ID_REQUIRED: 'Выберите ответственного менеджера.',
  MANAGER_INVALID: 'Выбранный менеджер недоступен.',
  BUYER_CONSENT_VERSION_NOT_CURRENT: 'Форма согласия покупателя обновилась. Обновите страницу.',
  CONSENT_VERSION_NOT_CURRENT: 'Документ обновился. Обновите страницу и примите новую версию.',
  BOOKING_ALREADY_CONVERTED: 'По этой брони уже оформлен договор.',
  BOOKING_NOT_ACTIVE: 'Бронь не активна.',
  BOOKING_NOT_FOUND: 'Бронь не найдена.',
  CONTRACT_NOT_FOUND: 'Договор не найден.',
  CONTRACT_SIGNED_READ_ONLY: 'Подписанный договор нельзя изменить.',
  AREA_MUST_BE_POSITIVE: 'Площадь должна быть больше нуля.',
  DEPOSIT_PERCENT_OUT_OF_RANGE: 'Процент взноса должен быть от 0 до 100.',
  AMOUNT_OUT_OF_RANGE: 'Слишком большая сумма.',
  CATEGORY_DOES_NOT_MATCH_TYPE: 'Категория не соответствует типу операции.',
  ACCOUNTING_PERIOD_CLOSED: 'Месяц закрыт — изменения запрещены.',
  ACCOUNTING_PERIOD_ALREADY_CLOSED: 'Этот месяц уже закрыт.',
  PERIOD_NOT_FINISHED: 'Месяц ещё не закончился — закрыть нельзя.',
  PERIOD_INVALID: 'Неверный месяц.',
  TRANSACTION_DATE_IN_FUTURE: 'Дата операции не может быть в будущем.',
  TRANSACTION_NOT_FOUND: 'Операция не найдена.',
  TRANSACTION_NOT_OWNED: 'Можно изменять только свои операции.',
  RELATED_CONTRACT_NOT_FOUND: 'Связанный договор не найден.',
  DATE_RANGE_INVALID: 'Неверный период: дата начала позже даты окончания.',
  DATE_RANGE_TOO_LARGE: 'Период слишком большой (не более года).',
  DAY_OFF_DATE_IN_PAST: 'Нельзя назначить выходной на прошедшую дату.',
  DAY_OFF_ALREADY_EXISTS: 'На эту дату выходной уже есть.',
  DAY_OFF_EMPLOYEE_INVALID: 'Этому сотруднику нельзя назначить выходной.',
  DAY_OFF_NOT_FOUND: 'Выходной не найден.',
  SHIFT_ALREADY_EXISTS_FOR_TODAY: 'Смена на сегодня уже была.',
  SHIFT_ALREADY_RECORDED_FOR_DATE: 'На эту дату уже записан выходной или смена.',
  PREVIOUS_SHIFT_NOT_CLOSED: 'Сначала завершите предыдущую смену.',
  NO_OPEN_SHIFT: 'Нет открытой смены.',
  CLOSED_BEFORE_OPENED: 'Время закрытия раньше времени открытия.',
  SHIFT_NOT_APPLICABLE: 'Для вашей роли смены не ведутся.',
  SHIFT_NOT_FOUND: 'Смена не найдена.',
  PAYROLL_ENTRY_CONFIRMED: 'Начисление уже подтверждено.',
  PAYROLL_ENTRY_NOT_FOUND: 'Начисление не найдено.',
  PAYROLL_PERIOD_IN_FUTURE: 'Нельзя рассчитать зарплату за будущий месяц.',
  PAYROLL_SETTINGS_REQUIRED: 'Сначала задайте настройки зарплаты.',
  TAX_RATE_OUT_OF_RANGE: 'Ставка налога должна быть от 0 до 100%.',
  REPORT_DATE_IN_FUTURE: 'Дата отчёта не может быть в будущем.',
  REPORT_NOT_FOUND: 'Отчёт не найден.',
  USER_NOT_FOUND: 'Пользователь не найден.',
  PENDING_ACTION_NOT_FOUND: 'Запрос не найден.',
  FILE_REQUIRED: 'Выберите файл.',
  FILE_TOO_LARGE: 'Файл больше 10 МБ.',
  FILE_TYPE_NOT_ALLOWED: 'Недопустимый тип файла.',
  FILE_NOT_FOUND: 'Файл не найден.',
  PAYLOAD_TOO_LARGE: 'Слишком большой запрос или файл.',
  BACKUP_NOT_CONFIGURED: 'Резервное копирование не настроено на сервере.',
  BACKUP_EXPORT_FAILED: 'Не удалось создать резервную копию.',
  NOT_FOUND: 'Не найдено.',
  INTERNAL_ERROR: 'Ошибка сервера. Попробуйте позже.',
  ThrottlerException: 'Слишком много запросов. Подождите минуту.',
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return MESSAGES.ThrottlerException;
    if (MESSAGES[err.code]) return MESSAGES[err.code];
    if (err.status === 400 && err.details.length > 0) return 'Проверьте правильность заполнения полей.';
    if (err.status === 404) return 'Запись не найдена или недоступна.';
    if (err.status === 409) return 'Конфликт: данные изменились. Обновите страницу.';
    if (err.status >= 500) return MESSAGES.INTERNAL_ERROR;
    return 'Не удалось выполнить действие.';
  }
  if (err instanceof TypeError) return 'Нет связи с сервером. Проверьте интернет.';
  return 'Что-то пошло не так.';
}

export function isCodeError(err: unknown): boolean {
  return err instanceof ApiError && err.code.startsWith('EMAIL_CODE_');
}
