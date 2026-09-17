# CRM «Улуу Жибек Жолу» — фронтенд

React 18 + Vite + TypeScript, Tailwind CSS 4, Radix UI, TanStack Query, React Hook Form + Zod, Recharts. Интерфейс на русском, светлая и тёмная темы, адаптив от 375 px.

Дизайн-система (ui-ux-pro-max): плотный дашборд, бирюзовый основной цвет (доверие), синий акцент, семантические цвета статусов с текстом (не только цвет), шрифты Fira Sans / Fira Code (кириллица, свои файлы — без внешних запросов), иконки Lucide, контраст текста ≥ 4.5:1, `prefers-reduced-motion`, фокус с клавиатуры, ссылка «К содержимому».

## Запуск

```bash
cd frontend
npm install
cp .env.example .env.local   # VITE_API_URL=http://localhost:3000/api/v1
npm run dev                  # http://localhost:5173
```

Бэкенду нужен `CORS_ALLOWED_ORIGINS=http://localhost:5173`, а для кодов из писем — Mailpit (`dev-tools/mailpit/README.md`).

```bash
npm test          # unit-тесты (деньги, ошибки, обновление сессии)
npm run build     # проверка типов + сборка в dist/
npm run preview   # сборка с теми же заголовками безопасности, что на Render
```

## Как устроено

| Что | Где |
|---|---|
| API-клиент: токен в памяти, обновление сессии, CSRF, ошибки | `src/api/client.ts` |
| Все эндпоинты и типы ответов | `src/api/endpoints.ts`, `src/api/types.ts` |
| Сессия, согласия, выход во всех вкладках | `src/auth/AuthProvider.tsx` |
| Коды подтверждения важных действий | `src/auth/StepUpProvider.tsx` → `useStepUp()` |
| Меню по ролям (ТЗ «Экраны по ролям») | `src/layout/nav.ts` |
| Страницы | `src/pages/**` |

**Безопасность**
- Access token только в памяти вкладки. Refresh token — HttpOnly-cookie бэкенда.
- CSRF-токен хранится в `localStorage`: без HttpOnly refresh-cookie он бесполезен, а нужен, чтобы пережить перезагрузку при API на другом домене.
- Refresh-токены одноразовые, повторное использование завершает сессию. Поэтому обновление сериализуется между вкладками через Web Locks.
- Никакого `dangerouslySetInnerHTML`. Юридические документы рендерятся как текст.
- Файлы (договоры, чеки, аватары) скачиваются с заголовком `Authorization` в blob и не попадают в URL.
- Строгий CSP без внешних доменов (`render.yaml`). Если меняется встроенный скрипт темы в `index.html`, нужно обновить его sha256 в `render.yaml` и `vite.config.ts`.
- Права проверяет сервер. Фронт только скрывает недоступное.

**Деньги.** Суммы приходят строками в тыйынах и считаются через `BigInt` (`src/lib/money.ts`), без float. Пользователь вводит сомы, например `15 000,50`.

**Коды подтверждения.**

```ts
const stepUp = useStepUp();
await stepUp({ action: 'booking.delete', resourceId: id, title: 'Удаление брони', run: (headers) => bookingsApi.remove(id, headers) })
  .then(() => toast.success('Удалено'))
  .catch(() => undefined); // отмену, неверный код и ошибки уже показал диалог
```

## Деплой (Render, бесплатно)

Сервис `uzz-crm-web` в `render.yaml`: статический сайт, корень `frontend`.
1. В Render → `uzz-crm-web` → Environment: `VITE_API_URL=https://<адрес uzz-crm-api>/api/v1` → Save (сайт пересоберётся).
2. В `uzz-crm-api` → Environment: добавьте адрес сайта в `CORS_ALLOWED_ORIGINS` (через запятую, без `/` в конце).

**Ограничение.** Сайт и API на разных доменах `*.onrender.com`. Safari (и все браузеры на iPhone) блокирует такие cookie, поэтому там после 15 минут бездействия нужно входить заново. Решение для постоянной работы — свой домен: `crm.компания.kg` для сайта и `api.компания.kg` для API.
