# Тестирование API через Swagger — пошаговый сценарий

Для ручной проверки и для фронтенда. Все запросы выполняются в Swagger UI:

- локально: `http://localhost:3000/api/v1/docs`
- сервер: `https://<имя-сервиса>.onrender.com/api/v1/docs` (см. `docs/DEPLOY.md`)
- схема OpenAPI для генерации клиента: `.../api/v1/docs-json`

## 0. Как пользоваться Swagger

1. `POST /auth/login` с логином и паролем → в ответе `challengeId`, на почту пользователя приходит **код входа**.
2. `POST /auth/login/verify` `{ "challengeId": "...", "code": "<код из письма>" }` → скопируйте `accessToken`.
3. Нажмите **Authorize** (замок вверху) → вставьте токен **без** слова `Bearer` → **Authorize**.
4. Токен живёт 15 минут. После истечения — снова вход (или `POST /auth/refresh`, см. п. 1.3).
5. Чтобы сменить роль — **Authorize → Logout**, вход под другим пользователем, снова **Authorize**.

### Аккаунты

Демо-аккаунтов нет — только реальные пользователи с **настоящей рабочей почтой** (без неё войти нельзя).

- Первый Директор создаётся при первом запуске сервера из переменных `SEED_DIRECTOR_*` (см. `docs/DEPLOY.md`).
- Остальные аккаунты создаются через п. 4 (подтверждение кодом Директора), `email` обязателен.
- Для проверки прав нужны пользователи всех ролей: Директор создаёт нач. продаж, бухгалтера, инвесторов; нач. продаж — менеджеров.

### Коды подтверждения важных действий

Важные действия выполняются в два шага:

1. `POST /email-codes` `{ "action": "<действие>", "resourceId": "<id записи>" }` → **201** `{ challengeId, expiresAt, emailHint }`, код приходит **на почту того, кто выполняет действие**.
2. Сам запрос — с заголовками `x-confirmation-id: <challengeId>` и `x-confirmation-code: <код>`.

В Swagger эти заголовки показаны как поля у каждого защищённого запроса.

| action | Запрос | resourceId |
|---|---|---|
| `booking.delete` | `DELETE /bookings/{id}` | id брони |
| `contract.delete` | `DELETE /contracts/{id}` | id договора |
| `contract.deposit` | `POST /contracts/{id}/deposit` | id договора |
| `contract.file` | `PUT /contracts/{id}/file` | id договора |
| `shift.update` / `shift.delete` | `PATCH` / `DELETE /shifts/{id}` | id смены |
| `day_off.delete` | `DELETE /day-offs/{id}` | id выходного |
| `payroll.settings.update` | `PUT /payroll/settings` | — |
| `payroll.confirm` | `POST /payroll/entries/{id}/confirm` | id начисления |
| `payroll.delete` | `DELETE /payroll/entries/{id}` | id начисления |
| `transaction.create` | `POST /transactions` | — |
| `transaction.update` / `transaction.delete` | `PATCH` / `DELETE /transactions/{id}` | id транзакции |
| `transaction.attachment` | `PUT /transactions/{id}/attachment` | id транзакции |
| `accounting.period.close` | `POST /accounting/periods/{period}/close` | `YYYY-MM` |
| `user.email.change` | `POST /users/me/email` | — |
| `user.password.change` | `POST /users/me/password` | — |
| `backup.export` | `GET /backups/export` | — |

Правила кода: 8 символов, действует 10 минут, один раз, только для своего пользователя, действия и записи; 5 неверных вводов блокируют код; новый код того же действия отменяет прежний; не больше 5 кодов одного вида за 15 минут (иначе **429** `EMAIL_CODE_RATE_LIMITED`). Если запрос отклонён проверкой данных (400/404/409), код **не сгорает** — исправьте данные и повторите с тем же кодом.

| Ответ | Значение |
|---|---|
| 403 `EMAIL_CODE_REQUIRED` | нет заголовков с кодом |
| 401 `EMAIL_CODE_INVALID` | неверный код, или код от другой записи/действия/пользователя |
| 401 `EMAIL_CODE_USED` / `EMAIL_CODE_EXPIRED` / `EMAIL_CODE_LOCKED` | код использован / истёк / заблокирован — запросите новый |
| 503 `EMAIL_DELIVERY_FAILED` | письмо не отправилось |

### Соглашения для фронтенда

- **Деньги** — строки в **тыйынах** (1 сом = 100 тыйын): `"5000000"` = 50 000 сом. Не используйте float.
- **Площадь и проценты** — строки с до 2 знаков: `"45.5"`, `"30"`.
- **Даты** — `YYYY-MM-DD` по времени Бишкека; метки времени — ISO 8601.
- **Списки** — `{ items, total, limit, offset }`; `limit` ≤ 100.
- **Ошибки** — `{ statusCode, message }`, где `message` — стабильный код (`AUTH_FORBIDDEN`, `CONSENT_REQUIRED`, …) или массив сообщений валидации (400).
- **Коды:** 400 валидация · 401 нет/просрочен токен · 403 нет прав или нет согласий · 404 не найдено **или не ваше** · 409 конфликт состояния · 413 слишком большой запрос/файл · 429 слишком много запросов.
- **Лишние поля** в теле запроса → 400. Отправляйте только поля из схемы.
- Запросы из браузера: `fetch(url, { credentials: 'include' })` — нужно для refresh-cookie.

---

## 1. Авторизация

### 1.1 Вход (пароль + код из письма)
`POST /auth/login`
```json
{ "username": "<логин>", "password": "<пароль>" }
```
Ожидается **201** `{ "mfaRequired": true, "challengeId": "...", "expiresAt": "...", "emailHint": "di***@gmail.com" }`. Токенов и cookie **нет**, на почту пришёл код.

`POST /auth/login/verify`
```json
{ "challengeId": "<из ответа>", "code": "<код из письма>" }
```
Ожидается **201**: `accessToken`, `expiresIn: 900`, `csrfToken`, `user` (без `passwordHash`, `emailVerified: true`).

Негативные проверки:
- неверный пароль → **401** `AUTH_INVALID_CREDENTIALS`, письмо **не** отправляется
- несуществующий логин → **401**, тело **идентично** предыдущему
- неверный код → **401** `EMAIL_CODE_INVALID`; после 5 неверных → `EMAIL_CODE_LOCKED`
- тот же код второй раз → **401** `EMAIL_CODE_USED`
- через 10 минут → **401** `EMAIL_CODE_EXPIRED`
- у аккаунта нет email → **403** `AUTH_EMAIL_NOT_CONFIGURED`
- 6 запросов входа за минуту → **429**

### 1.2 Текущий пользователь
`GET /auth/me` → **200** профиль. Без Authorize → **401**.

### 1.3 Обновление токена (из браузера, не из Swagger)
`POST /auth/refresh` с `credentials: 'include'` и заголовком `x-csrf-token: <csrfToken из ответа login>`.
→ **201** новый `accessToken` и новый `csrfToken` (сохраняйте последний).
Повторное использование старого refresh-токена завершает все сессии этой цепочки → **401**.

### 1.4 Выход
`POST /auth/logout` с тем же заголовком `x-csrf-token` → **201** `{ "success": true }`.

## 2. Юридические документы и согласия

| Шаг | Запрос | Ожидается |
|---|---|---|
| 2.1 | `GET /legal/documents` (без токена) | 200, 5 документов с `version` |
| 2.2 | `GET /legal/documents/privacy_policy` | 200, `content` (Markdown), `draft: true` |
| 2.3 | `GET /consents/status` | 200, `allRequiredAccepted` и список обязательных документов |
| 2.4 | `POST /consents` `{ "policyType": "privacy_policy", "policyVersion": "<version из 2.1>" }` | 201 |
| 2.5 | То же с `"policyVersion": "1.0"` | 409 `CONSENT_VERSION_NOT_CURRENT` |

**Фронтенд:** после login вызвать `GET /consents/status`; если `allRequiredAccepted: false` — показать документы с чекбоксами и отправить `POST /consents` для каждого. До этого бизнес-разделы отвечают **403 `CONSENT_REQUIRED`**.

## 3. Профиль

| Запрос | Тело | Ожидается |
|---|---|---|
| `PATCH /users/me` | `{ "fullName": "Новое Имя", "phone": "+996555123456" }` | 200 |
| `PATCH /users/me` | `{ "email": "x@example.com" }` | 400 (email меняется только через 3.1) |
| `PATCH /users/me` | `{ "role": "director" }` | 400 (роль менять нельзя) |
| `PUT /users/me/avatar` | multipart, поле `file`, JPEG/PNG/WebP ≤ 10 МБ | 200, `avatarUrl: "users/<id>/avatar"` |
| `PUT /users/me/avatar` | файл `.png`, внутри текст/SVG | 400 `FILE_TYPE_NOT_ALLOWED` |
| `GET /users/{id}/avatar` | — | 200 изображение |
| `GET /users` | (под нач. продаж) | 200, только команда |
| `GET /users` | (под менеджером) | 403 |

### 3.1 Смена email (два кода)
1. `POST /email-codes` `{ "action": "user.email.change" }` → код на **текущий** email.
2. `POST /users/me/email` `{ "email": "new@example.com" }` + заголовки кода → **201** `challengeId`, код приходит на **новый** email. Адрес занят другим аккаунтом → **409** `EMAIL_TAKEN`.
3. `POST /users/me/email/confirm` `{ "challengeId": "...", "code": "<код с нового адреса>" }` → **200**, `email` обновлён; на старый адрес приходит уведомление.

### 3.2 Смена пароля
1. `POST /email-codes` `{ "action": "user.password.change" }`.
2. `POST /users/me/password` `{ "currentPassword": "...", "newPassword": "не короче 12 символов" }` + заголовки кода → **204**. Все сессии завершаются — войти заново.

## 4. Создание аккаунта (подтверждение кодом директора)

1. Под нач. продаж: `POST /confirmations/users`
   ```json
   { "username": "new_manager", "password": "Strong-Password-123", "fullName": "Новый Менеджер", "email": "manager@example.com", "role": "sales_manager" }
   ```
   → **202** `pendingActionId`, `emailDelivery`. Аккаунт ещё **не создан**. Без `email` → **400**; email уже у другого аккаунта → **409** `EMAIL_TAKEN`.
2. Под нач. продаж с `"role": "director"` → **403** `USER_ROLE_CREATION_FORBIDDEN`.
3. Под Директором: `GET /confirmations/pending` → запрос виден, **кода в ответе нет**.
4. Код приходит на email всех Директоров.
   `POST /confirmations/{id}/confirm` `{ "code": "ABCD2345" }` → **201** созданный пользователь (`emailVerified: false`).
   Неверный код → **401**; 5 неверных → действие `failed`.
5. Новый сотрудник входит (п. 1.1) — код приходит на указанный email; после входа `emailVerified: true`. Если письмо не пришло — email указан неверно.
6. Отклонить: `POST /confirmations/{id}/reject` → **201**.

## 5. Бронирования (роль: менеджер / нач. продаж / директор)

Текущую версию формы согласия покупателя возьмите из `GET /legal/documents` (`buyer_personal_data_consent`).

### 5.1 Создать
`POST /bookings` (под менеджером 1)
```json
{
  "fullName": "Асанов Бакыт",
  "passportNumber": "AN1234567",
  "phone": "+996 555 12-34-56",
  "email": "buyer@example.com",
  "desiredAreaSqm": "60",
  "buyerConsentConfirmed": true,
  "buyerConsentVersion": "<version>"
}
```
→ **201**. Без `buyerConsentConfirmed: true` → **400**.

### 5.2 Список, поиск, карточка
- `GET /bookings` → в списке паспорт замаскирован (`*****4567`).
- `GET /bookings?passportNumber=an 1234567` → точный поиск (регистр и пробелы не важны).
- `GET /bookings?phone=0555123456` → находит `+996 555 12-34-56`.
- `GET /bookings/{id}` → полный паспорт (просмотр пишется в журнал).

### 5.3 Проверки доступа
| Кто | Действие | Ожидается |
|---|---|---|
| менеджер 2 | `GET /bookings/{id менеджера 1}` | 404 |
| нач. продаж | `GET /bookings` | брони своей команды |
| бухгалтер, инвестор | `GET /bookings` | 403 |
| менеджер | `DELETE /bookings/{id}` | 403 |
| нач. продаж | `DELETE /bookings/{id}` + код `booking.delete` | 204 |
| любой | `GET /bookings/abc` | 400 (не UUID) |

### 5.4 Изменить
`PATCH /bookings/{id}` `{ "desiredAreaSqm": "65", "status": "cancelled" }` → 200.
`"status": "converted"` → 400 (только через конвертацию).

## 6. Договоры

### 6.1 Бронь → договор
`POST /bookings/{id}/convert`
```json
{ "address": "г. Ош, ул. Ленина 1", "pricePerSqmTyiyn": "5000000", "buyerConsentConfirmed": true, "buyerConsentVersion": "<version>" }
```
→ **201**: `totalAmountTyiyn: "300000000"` (3 000 000 сом), `depositAmountTyiyn: "90000000"` (900 000 сом), `status: "draft"`. Повторно → **409**.

### 6.2 Договор напрямую
`POST /contracts` — поля как у брони + `address`, `areaSqm`, `pricePerSqmTyiyn`, необязательно `depositPercent` (по умолчанию 30).
Попытка передать `totalAmountTyiyn` → **400** (суммы считает только сервер).

### 6.3 Взнос и подписание
1. `POST /contracts/{id}/deposit` `{ "paid": true }` + код `contract.deposit` → `status: "deposit_paid"`.
2. `PUT /contracts/{id}/file` (multipart `file`, PDF/JPEG/PNG) + код `contract.file` → `status: "signed"`, `hasFile: true`.
3. Под менеджером после `signed`: `PATCH /contracts/{id}` → **403** `CONTRACT_SIGNED_READ_ONLY`.
4. `GET /contracts/{id}/file` → скачивание (`attachment`).

### 6.4 Бухгалтер и инвестор
- бухгалтер: `GET /contracts` → только суммы/статусы, **без ФИО/паспорта/адреса**; `POST /contracts/{id}/deposit` (с кодом) разрешён.
- бухгалтер: `GET /contracts?passportNumber=...` → 403.
- инвестор: `GET /contracts` → 403 (только dashboard).

## 7. Смены и выходные

| Кто | Запрос | Ожидается |
|---|---|---|
| менеджер | `POST /shifts/open` | 201 `status: open` |
| менеджер | `POST /shifts/open` ещё раз | 409 |
| менеджер | `GET /shifts/current` | текущая смена |
| менеджер | `POST /shifts/close` | 200 `status: closed` |
| директор / инвестор | `POST /shifts/open` | 403 |
| нач. продаж | `POST /shifts/open`, затем `POST /shifts/close` | 200, `reportGenerated: "sales"` |
| бухгалтер | открыть и закрыть смену | 200, `reportGenerated: "financial"` |
| нач. продаж | `GET /shifts?from=2026-09-01&to=2026-09-30` | смены команды и свои |
| нач. продаж | `PATCH /shifts/{id}` | 403 (коррекция — только директор, с кодом `shift.update`) |

Выходные:
- нач. продаж: `POST /day-offs` `{ "userId": "<id manager1>", "date": "<завтра>", "reason": "по договорённости" }` → 201.
- Та же дата ещё раз → 409; дата в прошлом → 400 `DAY_OFF_DATE_IN_PAST`.
- менеджер: `POST /day-offs` → 403; `GET /day-offs` → только свои.

Прогулы проставляются автоматически в 00:05 по Бишкеку за прошедший рабочий день (Пн–Пт).

## 8. Ежедневные отчёты

| Кто | `GET /daily-reports` |
|---|---|
| директор, инвесторы | 200, оба типа |
| нач. продаж | только `?type=sales` (financial → 403) |
| бухгалтер | только `?type=financial` |
| менеджер | 403 |

Ответ: `summary` — готовый текст на русском; `data` — числа для графиков.
Директор: `POST /daily-reports/regenerate` `{ "type": "sales", "date": "2026-09-17" }` → пересоздать отчёт.

## 9. Зарплата (бухгалтер)

1. `GET /payroll/settings` → штраф и налог.
2. `PUT /payroll/settings` `{ "finePerMissedShiftTyiyn": "100000", "taxRatePercent": "10" }` + код `payroll.settings.update` → 200.
3. `POST /payroll/entries/generate` `{ "period": "2026-09" }` → 200, записи по нач. продаж, менеджерам, бухгалтеру.
4. `PATCH /payroll/entries/{id}` `{ "baseSalaryTyiyn": "3000000" }` → при 2 прогулах: налог `300000`, штраф `200000`, итог `2500000` (25 000 сом).
5. Ручная правка штрафа: `{ "fineAmountTyiyn": "50000" }`.
6. `POST /payroll/entries/{id}/confirm` + код `payroll.confirm` → `confirmed`; дальнейший PATCH → 409.

Доступ: менеджер видит только свои записи (`GET /payroll/entries`); нач. продаж и инвестор → 403; удаление — только директор (код `payroll.delete`).

## 10. Бухгалтерия

| Шаг | Запрос | Ожидается |
|---|---|---|
| 10.1 | + код `transaction.create`: `POST /transactions` `{ "type": "income", "category": "sale_deposit", "amountTyiyn": "90000000", "date": "2026-09-17", "relatedContractId": "<id>", "comment": "Взнос 30%" }` | 201 |
| 10.2 | `{ "type": "income", "category": "marketing", ... }` | 400 `CATEGORY_DOES_NOT_MATCH_TYPE` |
| 10.3 | дата в будущем | 400 |
| 10.4 | `PUT /transactions/{id}/attachment` (PDF/JPEG/PNG) + код `transaction.attachment` | 200, `hasAttachment: true` |
| 10.5 | `GET /accounting/summary?from=2026-09-01&to=2026-09-30` | суммы по всем 14 категориям |
| 10.6 | `GET /accounting/export.xlsx?from=2026-09-01&to=2026-09-30` | файл Excel (кнопка **Download file**) |
| 10.7 | `POST /accounting/periods/2026-08/close` + код `accounting.period.close` (resourceId `2026-08`) | 201; правка/удаление августа бухгалтером → 409 |
| 10.8 | `POST /accounting/periods/<текущий месяц>/close` | 400 (месяц не завершён) |
| 10.9 | директор: `POST /transactions` | 403; `DELETE /transactions/{id}` + код `transaction.delete` → 204 |

Категории приходов: `sale_deposit`, `sale_full_payment`, `sale_installment`, `other_income`.
Категории расходов: `construction_materials`, `contractor_payment`, `payroll`, `equipment_rent`, `utilities`, `marketing`, `legal_notary`, `taxes_corporate`, `admin_office`, `other_expense`.

## 11. Dashboard и аналитика

- `GET /dashboard?from=2026-09-01&to=2026-09-30` (директор, инвесторы) → брони/договоры по статусам, взносы, итоги бухгалтерии, зарплата, число прогулов. **Персональных данных нет.**
- `GET /analytics/sales` (директор — все, нач. продаж — команда) → по каждому менеджеру: брони и м², подписанные договоры, посещаемость.
- Менеджер / бухгалтер → 403.

## 12. Резервные копии (Директор)

| Запрос | Ожидается |
|---|---|
| `GET /backups/status` | `configured`, `agentConfigured`, `lastExportAt`, `lastExportChannel` |
| `GET /backups/export` + код `backup.export` | файл `uzz-crm-backup-....uzzbak` (кнопка **Download file**), зашифрован ключом Директора |
| то же под другой ролью | 403 |
| сервер без `BACKUP_PUBLIC_KEY` | 503 `BACKUP_NOT_CONFIGURED` |

Проверить файл: `npm run backup:inspect` (см. `docs/BACKUPS.md`).

## 13. Проверки безопасности (быстрый чек-лист)

- [ ] Любой бизнес-запрос без Authorize → 401.
- [ ] Только пароль (без кода из письма) не даёт токена.
- [ ] Удаление/взнос/транзакция без кода → 403 `EMAIL_CODE_REQUIRED`; код от другой записи → 401.
- [ ] Менеджер не видит чужие брони/договоры (404), нач. продаж — чужую команду.
- [ ] Инвестор не получает ФИО/паспорта нигде.
- [ ] Лишнее поле в теле (`role`, `email` в `PATCH /users/me`, `totalAmountTyiyn`, `status: converted`) → 400.
- [ ] Файл `.pdf` с HTML внутри → 400; файл > 10 МБ → 413.
- [ ] 6 неверных логинов за минуту → 429.
- [ ] Ответы об ошибках не содержат stack trace, SQL, названий таблиц.
- [ ] `GET /health` → `{ "status": "ok" }`.
