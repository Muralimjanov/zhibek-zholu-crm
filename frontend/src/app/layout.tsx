import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import QueryProvider from '@/components/providers/QueryProvider'
import ThemeProvider from '@/components/theme/ThemeProvider'
import ToastProvider from '@/components/ui/ToastProvider'
import AuthProvider from '@/features/auth/AuthProvider'
import { APP_NAME } from '@/lib/constants'
import { THEME_STORAGE_KEY } from '@/lib/theme'

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'CRM система',
}

/**
 * Ставит `data-theme` до первой отрисовки — без этого страница на секунду
 * показала бы не ту тему (light по умолчанию, затем скачок в dark). Логика
 * зеркалит `parseThemePreference`/`resolveTheme` из `src/lib/theme.ts`, но
 * не может импортировать их — это отдельный inline-скрипт, а не модуль.
 * Читает только `${THEME_STORAGE_KEY}", никаких токенов/кодов рядом.
 */
const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var raw=localStorage.getItem(k);var pref=(raw==='light'||raw==='dark'||raw==='system')?raw:'system';var dark=pref==='dark'||(pref==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){}})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        {/* `beforeInteractive` попадает в `<head>` независимо от места в
            дереве (см. next/script docs) — читает тему до первого paint. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <ToastProvider>{children}</ToastProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
