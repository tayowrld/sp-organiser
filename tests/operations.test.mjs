import { test, before, after } from 'node:test'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, symlinkSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'

const directory = mkdtempSync(join(tmpdir(), 'sp-planner-test-'))
process.env.DATA_DIR = join(directory, 'data')
let db, applyOperation, snapshot, runRecurring, isOverdue, getPerson
let manager, employee, colleague, stranger, department
const op = (actor, kind, input = {}) => applyOperation(actor, { id: randomUUID(), kind, ...input })
const task = id => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
function create(extra = {}) {
  op(manager, 'create', { title: 'Проверка', description: 'Проверить результат', deadline: '2026-11-08T12:00', employee: employee.id, ...extra })
  return db.prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT 1').get()
}
function change(actor, kind, id, extra = {}) { op(actor, kind, { task: id, version: task(id).version, ...extra }) }
before(() => {
  const program = ts.createProgram(['app/operations/index.ts'], { outDir: join(directory, 'compiled'), module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, skipLibCheck: true, strict: true })
  assert.equal(ts.getPreEmitDiagnostics(program).length, 0)
  program.emit()
  symlinkSync(resolve('node_modules'), join(directory, 'node_modules'))
  db = require(join(directory, 'compiled/db/index.js')).default
  const operations = require(join(directory, 'compiled/operations/index.js'))
  applyOperation = operations.applyOperation
  snapshot = operations.snapshot
  runRecurring = operations.runRecurring
  isOverdue = operations.isOverdue
  getPerson = require(join(directory, 'compiled/people/index.js')).getPerson
  department = Number(db.prepare("INSERT INTO departments (name) VALUES ('Зал')").run().lastInsertRowid)
  function person(name, parent, admin = 0, dept = null) {
    const result = db.prepare("INSERT INTO users (name, email, password_hash, role, manager_id, is_admin, department_id) VALUES (?, ?, 'hash', 'employee', ?, ?, ?)").run(name, `${name}@test.local`, parent, admin, dept)
    return getPerson(Number(result.lastInsertRowid))
  }
  manager = person('Руководитель', null, 1, department)
  employee = person('Анна', manager.id)
  colleague = person('Борис', manager.id)
  stranger = person('Чужой', null)
})
after(() => { db?.close(); rmSync(directory, { recursive: true, force: true }) })

test('жизненный цикл требует подтверждений и отдельного проверяющего', () => {
  const item = create({ require_comment: true, require_photo: true, require_review: true })
  assert.throws(() => change(stranger, 'accept', item.id), /недоступна/)
  assert.throws(() => change(employee, 'complete', item.id), /Сначала/)
  change(employee, 'accept', item.id)
  assert.throws(() => change(employee, 'complete', item.id), /комментарий/)
  assert.throws(() => change(employee, 'complete', item.id, { comment: 'Готово' }), /фотография/)
  change(employee, 'problem', item.id, { comment: 'Нужна помощь' })
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII='
  change(employee, 'complete', item.id, { comment: 'Готово', photo })
  assert.equal(task(item.id).workflow, 'на проверке')
  assert.throws(() => change(employee, 'approve', item.id), /Нет права/)
  assert.throws(() => change(manager, 'reject', item.id), /Укажите/)
  change(manager, 'reject', item.id, { comment: 'Переделать' })
  change(employee, 'complete', item.id, { comment: 'Исправлено', photo })
  change(manager, 'approve', item.id)
  assert.equal(task(item.id).status, 'выполнена')
  assert.equal(isOverdue(task(item.id), Date.now()), false)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_events WHERE task_id = ? AND photo IS NOT NULL').get(item.id).n, 2)
})

test('повтор отправки не дублирует событие, устаревшая версия не затирает изменения', () => {
  const item = create()
  const operation = { id: randomUUID(), kind: 'accept', task: item.id, version: 0 }
  applyOperation(employee, operation)
  applyOperation(employee, operation)
  assert.equal(task(item.id).version, 1)
  assert.throws(() => op(employee, 'problem', { task: item.id, version: 0, comment: 'Ошибка' }), error => error.status === 409)
})

test('задачу отдела может занять только один сотрудник своего отдела', () => {
  const item = create({ department })
  assert.equal(item.claimed, 0)
  assert.throws(() => change(stranger, 'accept', item.id), /недоступна/)
  change(colleague, 'accept', item.id)
  assert.equal(task(item.id).assigned_to, colleague.id)
  assert.throws(() => change(employee, 'accept', item.id), /нельзя принять/)
})

test('смена не закрывается до принятия незавершённой задачи', () => {
  op(manager, 'shift', { title: 'Утренняя', employee: employee.id, start: '2026-11-08T08:00', end: '2026-11-08T16:00' })
  const shift = db.prepare('SELECT id FROM shifts ORDER BY id DESC LIMIT 1').get().id
  const item = create({ shift })
  change(employee, 'accept', item.id)
  assert.throws(() => op(employee, 'closeShift', { shift }), /Сначала завершите/)
  change(employee, 'handover', item.id, { employee: colleague.id, comment: 'Не хватило времени. Осталось проверить зал.' })
  assert.equal(task(item.id).assigned_to, employee.id)
  assert.throws(() => op(employee, 'closeShift', { shift }), /Сначала завершите/)
  change(colleague, 'takeover', item.id)
  assert.equal(task(item.id).assigned_to, colleague.id)
  op(employee, 'closeShift', { shift })
  assert.ok(db.prepare('SELECT closed_at FROM shifts WHERE id = ?').get(shift).closed_at)
})

test('повторяющийся чек-лист создаётся один раз на московский день и приостанавливается', () => {
  op(manager, 'template', { title: 'Открытие', items: 'Убрать зал\nПроверить кухню', time: '10:00', employee: employee.id })
  const id = db.prepare('SELECT id FROM templates ORDER BY id DESC LIMIT 1').get().id
  const count = () => db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE template_id = ?').get(id).n
  runRecurring(Date.parse('2026-11-08T20:59:00Z'))
  runRecurring(Date.parse('2026-11-08T20:59:00Z'))
  assert.equal(count(), 2)
  runRecurring(Date.parse('2026-11-08T21:01:00Z'))
  assert.equal(count(), 4)
  op(manager, 'toggleTemplate', { template: id })
  runRecurring(Date.parse('2026-11-10T00:00:00Z'))
  assert.equal(count(), 4)
})

test('объявления публикует руководитель, ознакомление не дублируется', () => {
  assert.throws(() => op(employee, 'publish', { title: 'Тест', content: 'Текст', category: 'объявление' }), /руководитель/)
  op(manager, 'publish', { title: 'Тест', content: 'Текст', category: 'объявление' })
  const notice = db.prepare('SELECT MAX(id) AS id FROM updates').get().id
  op(employee, 'ack', { notice })
  op(employee, 'ack', { notice })
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM acknowledgements WHERE update_id = ?').get(notice).n, 1)
  assert.equal(snapshot(stranger).tasks.length, 0)
})

test('просрочка вычисляется по сроку, изменение срока снимает её', () => {
  const item = create()
  assert.equal(isOverdue(item, Date.parse('2026-11-09')), true)
  change(manager, 'reschedule', item.id, { deadline: '2026-11-10T12:00', comment: 'Перенос согласован' })
  assert.equal(isOverdue(task(item.id), Date.parse('2026-11-09')), false)
})

test('резервная копия содержит фотографии и проходит проверку SQLite', async () => {
  const { backup } = await import('../scripts/backup.mjs')
  await backup()
  const file = readdirSync(join(process.env.DATA_DIR, 'backups')).find(name => name.endsWith('.sqlite'))
  const copy = new Database(join(process.env.DATA_DIR, 'backups', file), { readonly: true })
  assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok')
  assert.ok(copy.prepare('SELECT COUNT(*) AS n FROM task_events WHERE photo IS NOT NULL').get().n > 0)
  copy.close()
})
