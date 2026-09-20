import { ApiError, NetworkError } from '@/lib/api/client'
import { LoginResponseFormatError } from './session'

const DEFAULT_MESSAGE = 'Не удалось выполнить запрос. Попробуйте ещё раз.'

/** Шаг 1: логин и пароль. */
export function describeLoginError(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.'
  }

  if (error instanceof LoginResponseFormatError) {
    return error.message
  }

  if (!(error instanceof ApiError)) {
    return DEFAULT_MESSAGE
  }

  if (error.status === 401) {
    return 'Неверный логин или пароль.'
  }

  if (error.status === 429) {
    return 'Слишком много попыток входа. Подождите минуту и попробуйте снова.'
  }

  if (error.status === 400 && error.validationMessages.length > 0) {
    return error.validationMessages.join('. ')
  }

  if (error.status >= 500) {
    return 'Сервер временно недоступен. Попробуйте ещё раз через минуту.'
  }

  return DEFAULT_MESSAGE
}

/**
 * Шаг 2: код из письма. Точные коды ошибок `POST /auth/login/verify` не
 * описаны в OpenAPI 0.2.0 (нет схемы responses кроме 201) — обработка ниже
 * покрывает общие HTTP-статусы, а не подтверждённые backend-коды.
 */
export function describeLoginVerifyError(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.'
  }

  if (error instanceof LoginResponseFormatError) {
    return error.message
  }

  if (!(error instanceof ApiError)) {
    return DEFAULT_MESSAGE
  }

  if (error.status === 401) {
    return 'Неверный код.'
  }

  if (error.status === 404 || error.status === 410) {
    return 'Код или попытка входа устарели. Начните вход заново.'
  }

  if (error.status === 429) {
    return 'Слишком много попыток. Подождите минуту и попробуйте снова.'
  }

  if (error.status === 400 && error.validationMessages.length > 0) {
    return error.validationMessages.join('. ')
  }

  if (error.status >= 500) {
    return 'Сервер временно недоступен. Попробуйте ещё раз через минуту.'
  }

  return DEFAULT_MESSAGE
}

/**
 * Ответ на запрос, защищённый одноразовым кодом (`confirmedRequest`):
 * `contract.deposit`, `contract.file`, смена почты/пароля. Точный код
 * ошибки backend для неверного/просроченного кода в OpenAPI 0.2.0 не
 * описан — 401 здесь **возможная**, не подтверждённая форма ответа, поэтому
 * сообщение нейтральное («код отклонён»), а не «сессия истекла»: сессия
 * этим запросом не проверяется и не сбрасывается.
 */
export function describeConfirmationError(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.'
  }

  if (!(error instanceof ApiError)) {
    return DEFAULT_MESSAGE
  }

  if (error.status === 401) {
    return 'Код отклонён: неверный или устаревший. Проверьте его или запросите новый.'
  }

  if (error.status === 400 && error.validationMessages.length > 0) {
    return error.validationMessages.join('. ')
  }

  if (error.status === 403) {
    return 'Недостаточно прав для этого действия.'
  }

  if (error.status === 404 || error.status === 410) {
    return 'Код устарел. Запросите новый.'
  }

  if (error.status === 409) {
    return 'Состояние изменилось на сервере. Обновите страницу и повторите.'
  }

  if (error.status === 413) {
    return 'Сервер отклонил запрос: файл слишком большой.'
  }

  if (error.status === 429) {
    return 'Слишком много попыток. Подождите минуту и повторите.'
  }

  if (error.status >= 500) {
    return 'Сервер временно недоступен. Попробуйте ещё раз через минуту.'
  }

  return DEFAULT_MESSAGE
}

export function describeApiError(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.'
  }

  if (!(error instanceof ApiError)) {
    return DEFAULT_MESSAGE
  }

  if (error.status === 401) {
    return 'Сессия истекла. Войдите заново.'
  }

  if (error.status === 403) {
    return 'Недостаточно прав для этого действия.'
  }

  if (error.status === 409) {
    return 'Данные изменились на сервере. Обновите страницу и повторите.'
  }

  if (error.status === 413) {
    return 'Сервер отклонил запрос: файл слишком большой.'
  }

  if (error.status === 429) {
    return 'Слишком много запросов. Подождите минуту и повторите.'
  }

  if (error.validationMessages.length > 0) {
    return error.validationMessages.join('. ')
  }

  if (error.status >= 500) {
    return 'Сервер временно недоступен. Попробуйте ещё раз через минуту.'
  }

  return DEFAULT_MESSAGE
}
