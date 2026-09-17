import { ApiError, errorMessage, isCodeError } from '@/lib/errors';

describe('error messages', () => {
  it('maps stable API codes to Russian text', () => {
    expect(errorMessage(new ApiError(401, 'EMAIL_CODE_INVALID'))).toMatch(/Неверный код/);
    expect(errorMessage(new ApiError(400, 'MANAGER_ID_REQUIRED'))).toMatch(/менеджера/);
    expect(errorMessage(new ApiError(429, 'ThrottlerException: Too Many Requests'))).toMatch(/Слишком много/);
  });

  it('falls back safely and never shows raw server text', () => {
    expect(errorMessage(new ApiError(500, 'Prisma error at table User'))).toBe('Ошибка сервера. Попробуйте позже.');
    expect(errorMessage(new ApiError(404, 'SOMETHING_NEW'))).toMatch(/не найдена/);
    expect(errorMessage(new TypeError('Failed to fetch'))).toMatch(/Нет связи/);
  });

  it('recognises step-up code errors', () => {
    expect(isCodeError(new ApiError(401, 'EMAIL_CODE_USED'))).toBe(true);
    expect(isCodeError(new ApiError(403, 'AUTH_FORBIDDEN'))).toBe(false);
  });
});
