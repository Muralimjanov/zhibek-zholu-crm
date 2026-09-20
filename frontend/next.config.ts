import type { NextConfig } from 'next'

/**
 * Заголовки безопасности для всех ответов. Content-Security-Policy здесь
 * нет намеренно: она собирается с одноразовым nonce в `src/middleware.ts`.
 */
const securityHeaders = [
  // CRM нельзя встроить в чужую страницу: иначе возможен кликджекинг.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Адрес страницы CRM не должен утекать на сторонние сайты.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
