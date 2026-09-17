/**
 * Swagger text for `managerId` on bookings and contracts - one rule for both,
 * implemented in SalesAccessService.resolveManagerId.
 */
export const MANAGER_ID_CREATE_DESCRIPTION = [
  'Ответственный менеджер (UUID). Правило одинаково для броней и договоров:',
  '- director: ОБЯЗАТЕЛЕН; любой активный sales_manager или head_of_sales. Нет поля -> 400 MANAGER_ID_REQUIRED; не активный продавец -> 400 MANAGER_INVALID.',
  '- head_of_sales: необязателен, по умолчанию он сам; можно себя или менеджера своей команды. Чужой/неизвестный id -> 403 AUTH_FORBIDDEN; отключённый член команды -> 400 MANAGER_INVALID.',
  '- sales_manager: не передавать (всегда он сам). Свой id допустим; любой другой -> 403 AUTH_FORBIDDEN.',
].join('\n');

export const MANAGER_ID_UPDATE_DESCRIPTION = [
  'Передача записи другому менеджеру (UUID). Не передавайте, если менять не нужно.',
  '- director: любой активный sales_manager или head_of_sales, иначе 400 MANAGER_INVALID.',
  '- head_of_sales: себя или менеджера своей команды, иначе 403 AUTH_FORBIDDEN.',
  '- sales_manager: переназначать нельзя -> 403 AUTH_FORBIDDEN (тот же текущий id допустим).',
].join('\n');

export const MANAGER_ID_CONVERT_NOTE = 'Договор наследует managerId брони; в теле запроса managerId не принимается (400).';
