# СП Организатор

Планирование работы ресторана: Next.js, TypeScript, SQLite и мобильный PWA-интерфейс на русском языке.

## Локальный запуск

```bash
npm ci
npm run admin:create
npm run dev
```

Откройте [localhost:6553](http://localhost:6553). Команда создания администратора выводит данные первого входа; `ADMIN_EMAIL` и `ADMIN_PASSWORD` можно задать в окружении. Локальная база располагается в [`data/app.sqlite`](data/app.sqlite), каталог можно изменить через `DATA_DIR`.

## Рабочие сценарии

Раздел «Работа» (`/work`) позволяет принять задачу, завершить её с комментарием или фотографией, сообщить о проблеме, проверить результат и передать ответственность следующему сотруднику. Руководитель назначает задачи сотрудникам и отделам, планирует смены, включает ежедневные чек-листы и публикует объявления. Сотрудники подтверждают ознакомление. Просрочка вычисляется по сроку, действия записываются в историю.

После первого онлайн-открытия рабочий экран доступен без сети. Действия и новые фотографии сохраняются на устройстве до синхронизации; конфликты не перезаписывают чужие изменения. Вход, новые данные и просмотр ранее загруженных на сервер фотографий требуют сети. Отправка очереди возобновляется при открытом приложении. Подробности: [рабочий экран](app/work/readme.md), [серверная логика](app/operations/readme.md).

## Проверки

```bash
npm run lint
npm test
npm run build
```

Интеграционные тесты используют отдельную временную базу и проверяют права, подтверждения, конфликты, передачи, повторения и резервное копирование.

## Сервер

Основной вариант запуска — Docker Compose: `docker compose build`, `docker compose up -d --wait`. Затем создайте администратора: `docker compose exec -e ADMIN_EMAIL=you@company.ru app node scripts/create-admin.mjs`. До запуска настройте `.env`, домен и HTTPS по [инструкции развёртывания](deploy/readme.md). Демонстрационные данные не создаются; SQLite хранится в постоянном томе `/data`, секреты в образ не включаются.

Готовы конфигурации PM2 и nginx для порта 6553. Рабочие данные хранятся в `/data`. Фоновый процесс создаёт ежедневные задачи, определяет просрочки, доставляет push и делает резервные копии. Требуются HTTPS, секреты сессии и обслуживания, VAPID-ключи.

Порядок установки, настройки уведомлений и восстановления описан в [инструкции развёртывания](deploy/readme.md). Пример окружения: [`.env.example`](.env.example).

## Документация

- [app/admin](app/admin/readme.md)
- [app/api/health](app/api/health/readme.md)
- [app/api/maintenance](app/api/maintenance/readme.md)
- [app/api/photos/[id]](app/api/photos/%5Bid%5D/readme.md)
- [app/api/photos](app/api/photos/readme.md)
- [app/api](app/api/readme.md)
- [app/api/work](app/api/work/readme.md)
- [app/auth](app/auth/readme.md)
- [app/components/IkonsIcon](app/components/IkonsIcon/readme.md)
- [app/components/NavigationBar](app/components/NavigationBar/readme.md)
- [app/components](app/components/readme.md)
- [app/dates](app/dates/readme.md)
- [app/db](app/db/readme.md)
- [app/operations](app/operations/readme.md)
- [app/people](app/people/readme.md)
- [app](app/readme.md)
- [app/work](app/work/readme.md)
- [deploy](deploy/readme.md)
- [public](public/readme.md)
- [scripts](scripts/readme.md)
- [tests](tests/readme.md)
