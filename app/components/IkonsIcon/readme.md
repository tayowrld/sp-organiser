[Главная документация](../../../README.md) · [Родительский раздел](../readme.md)

Компонент `IkonsIcon`:
Входные параметры:
- `data` — объект иконки из `@ikions/icons/nodes/*`
- `variant` — `'outline'` или `'filled'`
- `size` — размер в px
- `className` — Tailwind-классы

Выходные параметры:
- SVG-иконка отрендеренная через dangerouslySetInnerHTML

Сценарии использования:
```tsx
<IkonsIcon data={home} variant='outline' size={20} />
<IkonsIcon data={zap} variant='filled' size={24} className='text-accent' />
```
