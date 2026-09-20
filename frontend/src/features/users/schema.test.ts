import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createUserSchema } from './schema.ts'

// Запуск: npm test (Node 22 исполняет TypeScript напрямую, зависимостей нет).

const VALID: Record<string, unknown> = {
  username: 'new_manager',
  password: 'a-strong-password-123',
  fullName: 'Новый Менеджер',
  phone: '',
  email: 'new.manager@example.test',
  role: 'sales_manager',
}

test('CreateUserDto (API 0.2.0): email обязателен — на него приходит код входа', () => {
  const withoutEmail = { ...VALID, email: '' }

  assert.equal(createUserSchema.safeParse(withoutEmail).success, false)
})

test('CreateUserDto: невалидный email отклоняется, валидный проходит', () => {
  assert.equal(
    createUserSchema.safeParse({ ...VALID, email: 'не-похоже-на-почту' })
      .success,
    false,
  )
  assert.equal(createUserSchema.safeParse(VALID).success, true)
})
