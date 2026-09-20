import assert from 'node:assert/strict'
import { test } from 'node:test'
import { confirmationHeaders, readEmailCodeChallenge } from './emailCodes.ts'
import { readLoginChallenge, readLoginVerifyResponse } from './loginFlow.ts'

// Запуск: npm test (Node 22 исполняет TypeScript напрямую, зависимостей нет).
// Реальные коды/challenge в тестах не используются — только вымышленные строки.

test('шаг 1 входа: challenge разбирается по описанию операции OpenAPI', () => {
  const challenge = readLoginChallenge({
    mfaRequired: true,
    challengeId: 'c-1',
    expiresAt: '2026-09-17T00:10:00.000Z',
    emailHint: 'd***@example.test',
  })

  assert.equal(challenge?.challengeId, 'c-1')
  assert.equal(challenge?.mfaRequired, true)
  assert.equal(challenge?.emailHint, 'd***@example.test')
})

test('шаг 1 входа: без challengeId — это нарушение формата, не тихий проход', () => {
  assert.equal(readLoginChallenge({ mfaRequired: true }), null)
  assert.equal(readLoginChallenge(null), null)
  assert.equal(readLoginChallenge('строка'), null)
})

test('шаг 1 входа: необязательные поля переживают отсутствие', () => {
  const challenge = readLoginChallenge({ challengeId: 'c-2' })

  assert.equal(challenge?.challengeId, 'c-2')
  assert.equal(challenge?.expiresAt, null)
  assert.equal(challenge?.emailHint, null)
})

test('шаг 2 входа: токен и пользователь нужны оба — без пользователя это не успех', () => {
  assert.equal(
    readLoginVerifyResponse({ accessToken: 'a', csrfToken: 'c' }),
    null,
    'нет user',
  )
  assert.equal(
    readLoginVerifyResponse({ csrfToken: 'c', user: { id: 'u1' } }),
    null,
    'нет accessToken',
  )
})

test('шаг 2 входа: полный ответ разбирается', () => {
  const result = readLoginVerifyResponse({
    accessToken: 'a',
    csrfToken: 'c',
    expiresIn: 900,
    user: { id: 'u1', username: 'demo' },
  })

  assert.equal(result?.accessToken, 'a')
  assert.equal(result?.csrfToken, 'c')
  assert.equal(result?.expiresIn, 900)
})

test('POST /email-codes: challenge читается и по challengeId, и по id', () => {
  assert.equal(
    readEmailCodeChallenge({ challengeId: 'e-1' })?.challengeId,
    'e-1',
  )
  assert.equal(readEmailCodeChallenge({ id: 'e-2' })?.challengeId, 'e-2')
  assert.equal(readEmailCodeChallenge({}), null)
  assert.equal(readEmailCodeChallenge(null), null)
})

test('заголовки подтверждения: ровно два поля, ничего лишнего', () => {
  const headers = confirmationHeaders('challenge-1', 'CODE1')

  assert.deepEqual(headers, {
    'x-confirmation-id': 'challenge-1',
    'x-confirmation-code': 'CODE1',
  })
})
