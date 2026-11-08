<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# This project rules.

## Code style

- Typescript strict mode

- Be as minimal as you can

- Single quotes, no semicolons

- Do not put comments directly in the code, every logical abstraction should have a readme

- Interface should be strictly in Russian, there is no any translation planned

## Product

- The final product should be easy to deploy on our server using nginx

- Port is 6553

- PM2 configuration should be ready to use

- Product should be implemented as a PWA-first solution, which would be mostly used on mobile phones. Desktop version is also important, so keep it simple.

## Database

- SQLite database

- Data should be stored in /data/

- Integrate with next-js

## Documentation style

- Readme in every abstraction, like /components/readme.md or /utils/readme.md

## Readme example:

```md
Переиспользуемый компонент `KanbanCard`:
Входные параметры: 
- `title` - заголовок карточки
- `image` - иконка или прикрепленное изображение
...
Выходные параметры:
- готовый к отображению react-компонент карточки
Сценарии использования:
`
<KanbanCard title="Do it!"/>
<KanbanCard title="What is it?!" image="/uploads/unexpected.jpg"/>
`
```
