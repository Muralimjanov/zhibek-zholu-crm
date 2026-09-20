import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_VISIBLE_TOASTS, pushToast, removeToast } from './toast-queue.ts'

// Запуск: npm test (Node 22 исполняет TypeScript напрямую, зависимостей нет).

test('pushToast: добавляет сообщение в конец очереди', () => {
  const toasts = pushToast([], { id: 1, message: 'Первое' })

  assert.deepEqual(toasts, [{ id: 1, message: 'Первое' }])

  const withSecond = pushToast(toasts, { id: 2, message: 'Второе' })

  assert.deepEqual(withSecond, [
    { id: 1, message: 'Первое' },
    { id: 2, message: 'Второе' },
  ])
})

test('pushToast: при переполнении убирает самое старое сообщение, не сбрасывая остальные', () => {
  assert.equal(MAX_VISIBLE_TOASTS, 3)

  let toasts = pushToast([], { id: 1, message: 'A' })
  toasts = pushToast(toasts, { id: 2, message: 'B' })
  toasts = pushToast(toasts, { id: 3, message: 'C' })

  assert.equal(toasts.length, MAX_VISIBLE_TOASTS)

  // Четвёртое быстрое действие не должно просто накапливаться бесконечно —
  // самое старое (id: 1) должно уступить место, а не перекрыться с новыми.
  toasts = pushToast(toasts, { id: 4, message: 'D' })

  assert.deepEqual(toasts, [
    { id: 2, message: 'B' },
    { id: 3, message: 'C' },
    { id: 4, message: 'D' },
  ])
})

test('removeToast: убирает сообщение по id, не трогая остальные и их порядок', () => {
  const toasts = [
    { id: 1, message: 'A' },
    { id: 2, message: 'B' },
    { id: 3, message: 'C' },
  ]

  assert.deepEqual(removeToast(toasts, 2), [
    { id: 1, message: 'A' },
    { id: 3, message: 'C' },
  ])
})

test('removeToast: несуществующий id — очередь не меняется по составу', () => {
  const toasts = [{ id: 1, message: 'A' }]

  assert.deepEqual(removeToast(toasts, 999), toasts)
})
