import { NextResponse } from 'next/server'

/**
 * Content-Security-Policy для всех страниц CRM.
 *
 * CRM показывает персональные данные покупателей и сотрудников, поэтому
 * странице запрещено загружать чужие скрипты и отправлять данные куда-либо,
 * кроме собственного API: даже при внедрённом скрипте увести данные на
 * чужой домен не выйдет.
 *
 * `'unsafe-inline'` для скриптов — вынужденно: Next.js встраивает в разметку
 * собственные inline-скрипты (гидратация App Router и скрипт темы), а
 * страницы отдаются статически, поэтому подставить им одноразовый nonce
 * нельзя — он существует только при рендере на каждый запрос. Проверено
 * вживую: с nonce приложение не запускается, все чанки блокируются. Запрет
 * на *чужие* скрипты и на отправку данных наружу при этом сохраняется.
 */
function apiOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? '').origin
  } catch {
    return ''
  }
}

function contentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV !== 'production'
  // В режиме разработки Next обновляет страницу через eval и websocket.
  const script = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'"
  const connect = ["'self'", apiOrigin(), isDev ? 'ws:' : ''].filter(Boolean).join(' ')

  return [
    "default-src 'self'",
    `script-src ${script}`,
    // Tailwind и Next вставляют критические стили в разметку.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

export function middleware(): NextResponse {
  const response = NextResponse.next()

  response.headers.set('content-security-policy', contentSecurityPolicy())

  return response
}

export const config = {
  // Политика нужна документам; статика и картинки отдаются без неё.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
