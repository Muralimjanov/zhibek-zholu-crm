'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * Singleton-хранилище (тот же паттерн `useSyncExternalStore`, что и
 * `session-store`/`toast-store`) — detail-страница сообщает читаемый
 * последний элемент хлебной крошки, а `AppShell` его показывает вместо
 * общего названия раздела. Без этого topbar показал бы либо голый UUID
 * (`data.id`), либо ничего.
 */
export interface PageBreadcrumb {
  sectionLabel: string
  sectionHref: string
  itemLabel: string
}

let current: PageBreadcrumb | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): PageBreadcrumb | null {
  return current
}

function getServerSnapshot(): PageBreadcrumb | null {
  return null
}

export function useBreadcrumb(): PageBreadcrumb | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * `itemLabel` должен быть текстом, понятным пользователю (имя покупателя,
 * тип и дата отчёта) — не `id`/UUID сущности. `null`/`undefined`, пока
 * данные не загружены, снимает крошку, и topbar показывает обычное
 * название раздела.
 */
export function usePageBreadcrumb(
  sectionLabel: string,
  sectionHref: string,
  itemLabel: string | null | undefined,
) {
  useEffect(() => {
    current = itemLabel ? { sectionLabel, sectionHref, itemLabel } : null
    emit()

    return () => {
      current = null
      emit()
    }
  }, [sectionLabel, sectionHref, itemLabel])
}
