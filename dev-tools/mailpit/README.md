# Mailpit — тестовый почтовый ящик для разработки

Mailpit перехватывает письма CRM на компьютере разработчика: коды входа, коды подтверждения, уведомления. Письма никуда не уходят и открываются в браузере: http://127.0.0.1:8025

Он нужен только **для разработки и тестов** (`npm run test:e2e:real-db`, локальный `npm run start:dev`). На рабочем сервере письма отправляет Brevo (`docs/DEPLOY.md`).

Эти скрипты запускают Mailpit как фоновую службу, доступную **только с этого компьютера** (`127.0.0.1`). Из сети подключиться к нему нельзя, а в ящике лежат коды входа.

## macOS

```bash
brew install mailpit
```

```bash
bash dev-tools/mailpit/macos/install.sh
```

Скрипт останавливает службу `brew services`, которая открывает Mailpit для всей сети, и ставит свою. Служба запускается при входе в систему и перезапускается при сбое. Удаление: `bash dev-tools/mailpit/macos/uninstall.sh`.

## Windows

Правой кнопкой на `dev-tools\mailpit\windows\install.ps1` → «Выполнить с помощью PowerShell». Или в терминале:

```bash
powershell -ExecutionPolicy Bypass -File dev-tools\mailpit\windows\install.ps1
```

Скрипт скачивает официальный Mailpit v1.31.1 с GitHub и проверяет контрольную сумму: подменённый файл не установится. Затем создаёт задачу, которая запускает Mailpit при входе в Windows. Права администратора не нужны. Удаление: `uninstall.ps1`.

## Настройки CRM (`.env`)

```
EMAIL_TRANSPORT=smtp
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
```

Хранятся последние 500 писем, не старше 7 дней.
