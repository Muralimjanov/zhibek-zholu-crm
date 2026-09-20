# Улуу Жибек Жолу CRM

Frontend CRM на Next.js (App Router), TypeScript и Tailwind CSS.

## Требования

- Node.js 20.9 или новее для запуска приложения; для `npm test` нужен
  Node.js 22.6 или новее (`--experimental-strip-types`)
- npm (lockfile проекта рассчитан на npm)

## Запуск

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Откройте `http://localhost:3000`.

`NEXT_PUBLIC_API_URL` — публичный адрес API. Значения с префиксом
`NEXT_PUBLIC_` попадают в браузер, поэтому не добавляйте в них пароли,
токены, cookie или bootstrap-секреты.

## Проверки

```powershell
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
```

Автоматически привести код к стилю можно командой `npm run format`.

## Структура

```text
src/
├── app/          # маршруты и layout'ы Next.js
├── components/   # переиспользуемые UI- и layout-компоненты
├── features/     # модули предметной области
├── hooks/        # переиспользуемые React hooks
├── lib/          # утилиты, константы и инфраструктура
└── types/        # общие TypeScript-типы
```

Клиентские провайдеры находятся в `src/components/providers`. Используйте
alias `@/` для импортов из `src`, например
`import { APP_NAME } from '@/lib/constants'`.

## Авторизация

Реализованы вход, восстановление сессии, выход, текущий
пользователь, защита внутренних страниц и обязательные согласия.

- Маршруты входа и согласий: `/login`, `/consents`.
- Access token живёт только в памяти. В `sessionStorage` сохраняется
  единственное значение — `csrfToken` (ключ `uzz-crm.csrf-token`), чтобы
  восстановить сессию после обновления вкладки.
- При загрузке приложения: если csrf-токен есть, выполняется один
  `POST /auth/refresh`, затем `GET /auth/me` и `GET /consents/status`.
  Новая вкладка без csrf-токена требует повторного входа.
- Все параллельные 401 разделяют один `POST /auth/refresh`; после него запрос
  повторяется ровно один раз.
- До окончания проверки сессии защищённые страницы показывают нейтральный
  экран загрузки. Источник истины по правам остаётся на backend.
- Код сессии: `src/features/auth`, документы и согласия:
  `src/features/legal`, общий транспорт: `src/lib/api/client.ts`.

## Пользователи и создание аккаунтов

Раздел `/users`: список сотрудников, запрос на создание аккаунта и
подтверждение запроса директором.

- В меню он показан директору как «Пользователи», начальнику продаж как
  «Команда»; остальным ролям пункт не виден, а прямой переход показывает
  «Нет доступа». Права всё равно проверяет backend.
- `POST /confirmations/users` возвращает 202 — это **только запрос**.
  Аккаунт появляется после `POST /confirmations/{id}/confirm`, который
  отвечает 201 с созданным пользователем.
- На `/confirmations/{id}/confirm` код 401 означает **неверный код**, а не
  истёкшую сессию, поэтому этот запрос не проходит через общий разбор 401 в
  `authorizedRequest`.
- Поля элемента `GET /confirmations/pending` в OpenAPI не описаны; типы в
  `src/types/users.ts` взяты из фактического ответа staging: `id`, `type`,
  `status`, `summary`, `createdAt`, `expiresAt`, `initiatorUserId`.
- Статус доставки письма читается только по известным признакам ответа;
  неизвестное значение не показывается как успешная доставка.

## Рабочие разделы

- `/dashboard` — сводка компании для директора и инвестора; для остальных
  ролей — ссылки на доступные разделы.
- `/bookings` и `/contracts` — продажи, карточки и действия согласно роли.
- `/shifts` — смены и выходные.
- `/payroll` — начисления и настройки зарплаты.
- `/finance` — операции, сводка и вложения бухгалтерии.
- `/reports` — архив ежедневных отчётов и аналитика продаж для доступных ролей.

Форма ответов и проверенные роли зафиксированы в `*_API_EXAMPLES.md`,
`REPORTS_API_RESEARCH.md` и `E2E_ACCEPTANCE_REVIEW.md`. Для отчётов архив с
несколькими страницами (больше одного `limit`) пока не встречался живьём —
пагинация проверена только по логике кода и одностраничным ответам.

## Правила проекта

- По умолчанию компоненты App Router остаются серверными. Добавляйте
  `'use client'` только когда нужны состояние, эффекты или browser API.
- Общий UI размещайте в `components/ui`, а код конкретного домена — в его
  папке внутри `features`.
- Авторизацию подключайте к API по контракту из
  `FRONTEND_ARCHITECTURE.md`. Проверено 17.09.2026: неверный вход
  возвращает 401 `AUTH_INVALID_CREDENTIALS`, успешный вход под демо-аккаунтом
  отдаёт профиль, обновление вкладки восстанавливает сессию одним
  `refresh` → `me` → `consents/status`, выход очищает состояние.
- Не коммитьте `.env.local`: шаблон переменных лежит в `.env.example`.

## Деплой (Render)

Сервис `uzz-crm-web` описан в `render.yaml` в корне репозитория: Node-сервис,
`rootDir: frontend`, сборка `npm ci && npm run build`, запуск `npm run start`.
Статикой приложение отдать нельзя — страницы `/bookings/[id]`,
`/contracts/[id]` и `/reports/[id]` рендерятся по запросу.

1. Render → Blueprints → **Sync**.
2. `uzz-crm-web` → Environment: `NEXT_PUBLIC_API_URL=https://<адрес API>/api/v1`.
3. `uzz-crm-api` → Environment: адрес сайта в `CORS_ALLOWED_ORIGINS`.

## Заголовки безопасности

`next.config.ts` ставит `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy` и `Strict-Transport-Security` и
убирает `X-Powered-By`. `src/middleware.ts` добавляет Content-Security-Policy:
чужие скрипты не загружаются, а `connect-src` разрешает запросы только к
своему источнику и к адресу из `NEXT_PUBLIC_API_URL`, поэтому увести данные
на посторонний домен нельзя. `'unsafe-inline'` для скриптов оставлен
вынужденно: Next встраивает свои inline-скрипты в статически отрендеренные
страницы, а одноразовый nonce для них недоступен (проверено вживую —
с nonce блокируются все чанки и приложение не запускается).
