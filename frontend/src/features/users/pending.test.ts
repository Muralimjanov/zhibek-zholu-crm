import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeEmailDelivery, readPendingActions } from './pending.ts'

// Запуск: npm test (Node 22 исполняет TypeScript напрямую, зависимостей нет).

test('отрицательный статус доставки никогда не считается доставкой', () => {
  const negative = [
    'not_sent',
    'unsent',
    'NOT_SENT',
    'not delivered',
    'never_sent',
    'failed',
    'not_configured',
  ]

  for (const value of negative) {
    assert.equal(describeEmailDelivery(value).tone, 'warn', value)
  }
})

test('доставкой считаются только известные положительные статусы', () => {
  for (const value of ['sent', 'delivered', 'queued', 'SENT']) {
    assert.equal(describeEmailDelivery(value).tone, 'ok', value)
  }

  assert.equal(describeEmailDelivery(true).tone, 'ok')
  assert.equal(describeEmailDelivery({ sent: true }).tone, 'ok')
})

test('неизвестное значение показывается нейтрально, а не как успех', () => {
  for (const value of ['email_sent_maybe', 'whatever', undefined, { a: 1 }]) {
    assert.equal(describeEmailDelivery(value).tone, 'unknown', String(value))
  }
})

test('явный отказ — предупреждение', () => {
  assert.equal(describeEmailDelivery(false).tone, 'warn')
  assert.equal(describeEmailDelivery({ sent: false }).tone, 'warn')
})

test('pending разбирается по фактическому ответу staging', () => {
  const [action] = readPendingActions([
    {
      id: 'action-1',
      type: 'create_user',
      status: 'pending',
      expiresAt: '2026-09-17T06:47:55.551Z',
      createdAt: '2026-09-17T06:37:55.552Z',
      initiatorUserId: 'user-1',
      summary: 'Создание аккаунта "test" (роль: sales_manager)',
    },
  ])

  assert.equal(action.id, 'action-1')
  assert.equal(action.type, 'create_user')
  assert.equal(action.status, 'pending')
  assert.equal(action.summary, 'Создание аккаунта "test" (роль: sales_manager)')
  assert.equal(action.expiresAt, '2026-09-17T06:47:55.551Z')
})

test('код и пароль не попадают в разбор, даже если сервер их пришлёт', () => {
  const [action] = readPendingActions([
    { id: 'action-2', type: 'create_user', code: 'ABCD2345', password: 'x' },
  ])

  assert.deepEqual(Object.keys(action).sort(), [
    'createdAt',
    'expiresAt',
    'id',
    'initiatorUserId',
    'status',
    'summary',
    'type',
  ])
  assert.equal(JSON.stringify(action).includes('ABCD2345'), false)
})
