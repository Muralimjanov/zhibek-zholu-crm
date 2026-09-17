# Временный тестовый сервер (staging) для фронтенда — Render, бесплатно

Цель: публичный HTTPS-адрес со Swagger и демо-аккаунтами, чтобы фронтенд
подключался к API. **Только вымышленные данные.** Это не production:
production настраивается отдельно (HTTPS-домен, KMS, резервные копии —
`docs/THREAT_MODEL.md`).

Проверено локально: Docker-образ в режиме `NODE_ENV=staging` применяет
миграции, создаёт демо-аккаунты, отдаёт Swagger и выставляет cookie
`Secure; SameSite=None` для фронтенда на другом домене. При
`NODE_ENV=production` Swagger и демо-данные отключены.

## Ограничения бесплатного тарифа (проверьте актуальные условия на render.com/pricing)

- Сервис «засыпает» без запросов; первый запрос после сна — до ~1 минуты.
- Бесплатная PostgreSQL на Render ограничена по сроку — при истечении создайте новую или используйте Neon (см. ниже).
- Диск временный: **загруженные файлы (договоры, чеки, аватары) пропадают при перезапуске/деплое**. Для тестов фронта этого достаточно.

## 1. Код в приватный репозиторий GitHub

Проект сейчас не в git. В папке проекта:

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "CRM MVP backend"
```

Создайте на github.com **приватный** репозиторий и выполните команды, которые GitHub покажет (`git remote add origin ...`, `git push -u origin main`).
`.env`, `storage/`, `node_modules/` в репозиторий не попадают (`.gitignore`) — проверьте `git status` перед первым коммитом.

## 2. Развернуть на Render

1. Зарегистрируйтесь на render.com и подключите GitHub.
2. **New → Blueprint** → выберите репозиторий. Render прочитает `render.yaml` и создаст:
   - веб-сервис `uzz-crm-api-staging` (Docker, free);
   - базу `uzz-crm-db-staging` (PostgreSQL, free).
   Ключи `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY_V1`, `BLIND_INDEX_KEY_V1` Render сгенерирует сам.
3. Render попросит значения переменных с `sync: false`:
   - `CORS_ALLOWED_ORIGINS` — адреса фронтенда через запятую, например `http://localhost:5173`
   - `DEMO_SEED_PASSWORD` — пароль демо-аккаунтов, **не короче 12 символов**; сгенерировать:
     ```bash
     openssl rand -base64 18
     ```
   - `SMTP_*` — можно оставить пустыми (см. п. 4).
4. **Apply**. Первая сборка занимает 5–10 минут.

## 3. Проверить

- `https://<сервис>.onrender.com/api/v1/health` → `{"status":"ok"}`
- `https://<сервис>.onrender.com/api/v1/docs` → Swagger
- Вход: `demo_director` / пароль из `DEMO_SEED_PASSWORD`
- Сценарий проверок: `docs/API_TESTING.md`

Передайте фронтенду: URL Swagger, схему `.../api/v1/docs-json` и пароль демо-аккаунтов (по защищённому каналу, не в общий чат).

## 4. Коды подтверждения (создание/отключение аккаунтов)

Коды приходят только по email. Без SMTP этот сценарий на staging не проходит, всё остальное работает.
Чтобы читать коды — заведите бесплатный тестовый ящик-песочницу (например, Mailtrap Email Testing) и укажите его SMTP в `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
У демо-директора email не задан; задайте адрес ящика через `PATCH /users/me` под `demo_director`.

## 5. Фронтенд

- Базовый URL: `https://<сервис>.onrender.com/api/v1`
- Все запросы: `credentials: 'include'`.
- Access token — в памяти, заголовок `Authorization: Bearer ...`.
- `csrfToken` из ответа `login`/`refresh` — в памяти; отправлять в `x-csrf-token` на `/auth/refresh` и `/auth/logout`.
- Safari блокирует сторонние cookie: на staging refresh с `localhost` в Safari может не работать — тогда повторный вход. В production фронт и API должны быть на одном сайте.

## Альтернатива: база Neon вместо Render PostgreSQL

Если бесплатная база Render истекла: создайте проект на neon.tech, скопируйте connection string (`...?sslmode=require`) и в Render удалите привязку `DATABASE_URL` к базе, задав её вручную. Миграции применятся при следующем запуске.

## Сброс тестовых данных

Удалите и заново создайте staging-базу; при старте сервиса миграции и демо-аккаунты создадутся заново. **Никогда** не указывайте в staging `DATABASE_URL` рабочей базы.
