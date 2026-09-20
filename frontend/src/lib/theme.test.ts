import assert from 'node:assert/strict'
import test from 'node:test'
import { parseThemePreference, resolveTheme } from './theme.ts'

test('parseThemePreference: известные значения проходят как есть', () => {
  assert.equal(parseThemePreference('system'), 'system')
  assert.equal(parseThemePreference('light'), 'light')
  assert.equal(parseThemePreference('dark'), 'dark')
})

test('parseThemePreference: повреждённое или неизвестное значение даёт system', () => {
  assert.equal(parseThemePreference('darkk'), 'system')
  assert.equal(parseThemePreference(''), 'system')
  assert.equal(parseThemePreference(null), 'system')
  assert.equal(parseThemePreference(undefined), 'system')
  assert.equal(parseThemePreference(42), 'system')
  assert.equal(parseThemePreference('{"broken":true}'), 'system')
})

test('resolveTheme: system резолвится по фактической настройке ОС', () => {
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
})

test('resolveTheme: сохранённые light/dark имеют приоритет над ОС в обе стороны', () => {
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
})
