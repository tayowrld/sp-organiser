[Главная документация](../../README.md) · [Родительский раздел](../readme.md)

HTTP-интерфейс рабочего экрана. Работает в Node.js, использует текущую cookie-сессию и SQLite. Изменяющие запросы `/api/work` проверяют Origin и совпадение пользователя очереди с сессией. Ответы с рабочими данными не кешируются HTTP-кешем.

`GET /api/health` — проверка готовности контейнера и доступности SQLite без пользовательских данных; подробности в [`health/readme.md`](health/readme.md).

## Подразделы

- [health](health/readme.md)
- [maintenance](maintenance/readme.md)
- [photos](photos/readme.md)
- [work](work/readme.md)
