# Сервер на Render (бесплатный тариф) с реальными пользователями

Решение владельца (2026-09-18): пока бесплатный Render, реальные пользователи, демо-данных нет.

## ⚠️ Ограничения бесплатного тарифа

Проверьте актуальные условия на render.com/pricing.

| Ограничение | Чем опасно | Что сделано |
|---|---|---|
| Бесплатная PostgreSQL **удаляется** примерно через 30 дней, резервных копий нет | Потеря всех данных | Агент на компьютере Директора скачивает зашифрованную копию дважды в день, восстановление описано в `docs/BACKUPS.md`. **Перед истечением срока** перенесите данные в новую базу |
| Диск временный: файлы **пропадают** при перезапуске или деплое | Пропадают договоры, чеки и аватары | Файлы есть в последней копии. Для постоянного хранения нужен платный диск или облачное хранилище |
| SMTP-порты 25/465/587 закрыты ([Render changelog](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)) | Не уходят коды, никто не может войти | Письма отправляются через HTTPS API Brevo (`EMAIL_TRANSPORT=brevo`) |
| Сервис «засыпает» без запросов | Первый запрос после сна идёт до ~1 минуты | Агент резервного копирования ждёт и повторяет попытки |

Для постоянной работы рекомендуется платный тариф Render (или VPS) с постоянной базой и диском.

## 1. Почта (Brevo) — без неё никто не войдёт

1. Зарегистрируйтесь на brevo.com (бесплатно, до 300 писем в день).
2. **Senders, Domains & Dedicated IPs → Senders**: добавьте адрес отправителя и подтвердите его по ссылке из письма. Лучше адрес на домене компании. С gmail-адреса письма чаще попадают в спам.
3. **SMTP & API → API Keys → Generate a new API key**. Скопируйте ключ; его нельзя пересылать в мессенджере.

## 2. Ключи резервных копий

Выполните шаги 1–2 из `docs/BACKUPS.md`: получите значения `BACKUP_PUBLIC_KEY` и `BACKUP_AGENT_TOKEN_SHA256`, закрытый ключ передайте Директору.

## 3. Код в GitHub

Репозиторий должен быть **приватным**. Перед каждым `git push` проверьте `git status`: в репозиторий не должны попасть `.env`, `backup-keys/`, `*.pem`, `*.uzzbak` (они перечислены в `.gitignore`).

## 4. Render → New → Blueprint

Выберите репозиторий. Render прочитает `render.yaml` и создаст сервис `uzz-crm-api` и базу `uzz-crm-db`. Ключи `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY_V1` и `BLIND_INDEX_KEY_V1` Render сгенерирует сам.

Если раньше создавался демо-сервер `uzz-crm-api-staging` с базой `uzz-crm-db-staging`, удалите оба в Render (Settings → Delete). В них только демо-данные.

Заполните поля:

| Поле | Значение |
|---|---|
| Blueprint Name | `uzz-crm` |
| `CORS_ALLOWED_ORIGINS` | адреса фронтенда через запятую, без `/` в конце: `http://localhost:5173` |
| `SEED_DIRECTOR_USERNAME` | логин Директора, например `director` |
| `SEED_DIRECTOR_FULL_NAME` | ФИО Директора |
| `SEED_DIRECTOR_EMAIL` | **настоящая** почта Директора, туда приходят коды входа |
| `SEED_DIRECTOR_PASSWORD` | не короче 12 символов (можно сгенерировать командой ниже) |
| `BREVO_API_KEY` | ключ из шага 1 |
| `SMTP_FROM` | `CRM Улуу Жибек Жолу <подтверждённый-адрес@...>` |
| `BACKUP_PUBLIC_KEY` | из шага 2 |
| `BACKUP_AGENT_TOKEN_SHA256` | из шага 2 |

```bash
openssl rand -base64 18
```

Нажмите **Deploy Blueprint**. Первая сборка занимает 5–10 минут.

## 5. Первый вход

1. `https://<сервис>.onrender.com/api/v1/health` → `{"status":"ok"}`.
2. Swagger: `https://<сервис>.onrender.com/api/v1/docs`.
3. `POST /auth/login` с логином и паролем Директора → на почту приходит код → `POST /auth/login/verify`.
4. Примите юридические документы (`GET /consents/status`, `POST /consents`).
5. **Сразу после первого входа:**
   - смените пароль (`POST /users/me/password` с кодом `user.password.change`);
   - в Render удалите переменную `SEED_DIRECTOR_PASSWORD`.
6. Создайте аккаунты сотрудников (`POST /confirmations/users`, email обязателен).
7. Установите агент резервного копирования на компьютер Директора (`docs/BACKUPS.md`, шаг 4) и через 5 минут проверьте `GET /backups/status` → `lastExportAt`.

Если письмо с кодом не пришло:
- проверьте спам;
- в Render → Logs найдите `Email code ... not delivered`;
- проверьте `BREVO_API_KEY` и что адрес в `SMTP_FROM` подтверждён в Brevo.

## 6. Фронтенд (сайт CRM)

Код лежит в `frontend/`, на Render это статический сайт `uzz-crm-web` из того же `render.yaml`. После Blueprint → Sync задайте `VITE_API_URL=https://<адрес uzz-crm-api>/api/v1` в `uzz-crm-web` и добавьте адрес сайта в `CORS_ALLOWED_ORIGINS` сервиса `uzz-crm-api`. Подробности — в `frontend/README.md`.

### Правила подключения

- Базовый URL: `https://<сервис>.onrender.com/api/v1`; сценарии и коды ошибок описаны в `docs/API_TESTING.md`.
- Вход в два шага: `login` → экран ввода кода → `login/verify`.
- Важные действия: `POST /email-codes` → окно ввода кода → повтор запроса с заголовками `x-confirmation-id` и `x-confirmation-code`.
- Все запросы отправляйте с `credentials: 'include'`. Access token храните в памяти, заголовок `Authorization: Bearer ...`.
- `csrfToken` из ответа `login/verify` и `refresh` храните в памяти и отправляйте в `x-csrf-token` на `/auth/refresh` и `/auth/logout`.
- Safari блокирует сторонние cookie: с `localhost` refresh может не работать, тогда нужен повторный вход. В production фронт и API должны быть на одном сайте.

## Перенос на новую базу (истёк срок бесплатной базы)

1. Убедитесь, что есть свежая копия: `GET /backups/status` и папка `UZZ-CRM-Backups`.
2. Создайте новую базу (Render или Neon).
3. Восстановите в неё данные по `docs/BACKUPS.md`, раздел «Восстановление».
4. В Render укажите новый `DATABASE_URL`, а ключи шифрования должны совпадать с ключами из копии.
5. **Никогда** не указывайте адрес рабочей базы в тестовых окружениях.
