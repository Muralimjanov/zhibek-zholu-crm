import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runConfirmedRequest } from './confirmedRequestCore.ts'

// Запуск: npm test (Node 22 исполняет TypeScript напрямую, зависимостей нет).
//
// Проверяет наблюдаемое поведение реального `runConfirmedRequest`, а не
// повторяет его реализацию: `refresh`/`send` — простые счётчики, а не моки
// со встроенной логикой. `authorizedRequest` (обычный защищённый GET с
// повтором на 401) здесь не тестируется — код не менялся, и это его
// собственная, отдельно от `confirmedRequest` живущая логика.

test('ровно один send: ошибка подтверждающего запроса не вызывает повтор', async () => {
  let refreshCalls = 0
  let sendCalls = 0

  await assert.rejects(
    () =>
      runConfirmedRequest({
        refresh: async () => {
          refreshCalls += 1
        },
        send: async () => {
          sendCalls += 1
          throw new Error('401: неверный или устаревший код')
        },
      }),
    /неверный или устаревший код/,
  )

  assert.equal(refreshCalls, 1, 'refresh вызван ровно один раз')
  assert.equal(
    sendCalls,
    1,
    'send вызван ровно один раз — без автоматического повтора на 401',
  )
})

test('успешный send: результат возвращается без лишних вызовов', async () => {
  let refreshCalls = 0
  let sendCalls = 0

  const result = await runConfirmedRequest({
    refresh: async () => {
      refreshCalls += 1
    },
    send: async () => {
      sendCalls += 1

      return 'ok'
    },
  })

  assert.equal(result, 'ok')
  assert.equal(refreshCalls, 1)
  assert.equal(sendCalls, 1)
})

test('send не вызывается, если предварительное чтение (refresh) само упало', async () => {
  let sendCalls = 0

  await assert.rejects(
    () =>
      runConfirmedRequest({
        refresh: async () => {
          throw new Error('refresh failed')
        },
        send: async () => {
          sendCalls += 1

          return 'unreachable'
        },
      }),
    /refresh failed/,
  )

  assert.equal(sendCalls, 0)
})
