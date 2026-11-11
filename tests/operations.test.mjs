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
  const program = ts.createProgram(['app/operations/index.ts', 'app/work/projection.ts'], { outDir: join(directory, 'compiled'), module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, skipLibCheck: true, strict: true })
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

test('инициативы личные, редактируются и удаляются автором без уведомления руководителя', () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?').get(manager.id).n
  op(employee, 'initiative', { title: 'Моя идея', description: 'Личный план', deadline: '2026-12-01T12:00', require_review: true })
  const item = db.prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT 1').get()
  assert.ok(!snapshot(manager).activity.some(event => event.user_id === employee.id && event.kind === 'initiative'))
  assert.equal(item.initiative, 1)
  assert.equal(item.require_review, 0)
  assert.ok(snapshot(employee).tasks.some(row => row.id === item.id))
  assert.ok(!snapshot(manager).tasks.some(row => row.id === item.id))
  assert.throws(() => change(manager, 'delete', item.id), /недоступна/)
  change(employee, 'edit', item.id, { title: 'Новая идея', description: 'План', deadline: '2026-12-02T12:00', priority: 'низкий' })
  assert.equal(task(item.id).title, 'Новая идея')
  change(employee, 'delete', item.id)
  assert.ok(!snapshot(employee).tasks.some(row => row.id === item.id))
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?').get(manager.id).n, before)
})

test('поручение защищено от изменения исполнителем, запрос удаления получает автор', () => {
  const item = create()
  for (const kind of ['edit', 'delete', 'reschedule']) assert.throws(() => change(employee, kind, item.id), error => error.status === 403)
  change(employee, 'requestDelete', item.id, { comment: 'Больше не актуально' })
  assert.equal(task(item.id).deletion_requested, 1)
  assert.ok(db.prepare("SELECT id FROM notifications WHERE user_id = ? AND message LIKE '%Запрошено удаление%Больше не актуально%'").get(manager.id))
  change(manager, 'denyDelete', item.id, { comment: 'Нужно закончить' })
  assert.equal(task(item.id).deletion_requested, 0)
  change(employee, 'requestDelete', item.id, { comment: 'Повторный запрос' })
  change(manager, 'delete', item.id)
  assert.equal(task(item.id).deleted, 1)
  assert.ok(!snapshot(employee).tasks.some(row => row.id === item.id))
  assert.ok(db.prepare("SELECT id FROM notifications WHERE user_id = ? AND message LIKE '%Задача удалена%'").get(employee.id))
})

test('напоминание по умолчанию накануне в полдень, повтор каждые четыре часа и индивидуальная подготовка', () => {
  const item = create({ deadline: '2027-01-04T23:00' })
  const count = id => db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND dedupe LIKE ?').get(employee.id, `reminder:${id}:%`).n
  const start = Date.parse('2027-01-03T09:00:00Z')
  runRecurring(start - 1)
  assert.equal(count(item.id), 0)
  runRecurring(start)
  runRecurring(start + 1)
  assert.equal(count(item.id), 1)
  runRecurring(start + 4 * 3600000 - 1)
  assert.equal(count(item.id), 1)
  runRecurring(start + 4 * 3600000)
  assert.equal(count(item.id), 2)
  const custom = create({ deadline: '2027-01-10T18:00', reminder_hours: '72' })
  const customStart = Date.parse('2027-01-07T15:00:00Z')
  runRecurring(customStart - 1)
  assert.equal(count(custom.id), 0)
  runRecurring(customStart)
  assert.equal(count(custom.id), 1)
  change(employee, 'accept', custom.id)
  change(employee, 'complete', custom.id)
  runRecurring(customStart + 4 * 3600000)
  assert.equal(count(custom.id), 1)
  assert.throws(() => create({ reminder_hours: -1 }), /время подготовки/)
  change(manager, 'edit', item.id, { title: item.title, description: item.description, deadline: '2027-01-04T23:00', priority: 'высокий', reminder_hours: '12' })
  assert.equal(task(item.id).reminder_hours, 12)
})

test('любой главный администратор назначает других, последний защищён, устаревшие права не принимаются', () => {
  db.prepare('UPDATE users SET is_superadmin = 1 WHERE id = ?').run(stranger.id)
  const root = getPerson(stranger.id)
  assert.throws(() => op(employee, 'superadmin', { person: colleague.id, enabled: true, previous: 0 }), error => error.status === 403)
  op(root, 'superadmin', { person: colleague.id, enabled: true, previous: 0 })
  const second = getPerson(colleague.id)
  op(second, 'superadmin', { person: employee.id, enabled: true, previous: 0 })
  assert.equal(getPerson(employee.id).is_superadmin, 1)
  op(root, 'superadmin', { person: colleague.id, enabled: false, previous: 1 })
  assert.throws(() => op(second, 'superadmin', { person: manager.id, enabled: true, previous: 0 }), error => error.status === 403)
  op(root, 'superadmin', { person: employee.id, enabled: false, previous: 1 })
  assert.throws(() => op(root, 'superadmin', { person: root.id, enabled: false, previous: 1 }), /последнего/)
  db.prepare('UPDATE users SET is_superadmin = 0 WHERE id = ?').run(root.id)
})

test('цепочка создания, изменения и удаления без сети синхронизируется по UUID один раз', () => {
  const creation = { id: randomUUID(), kind: 'initiative', userId: employee.id, title: 'Офлайн', description: 'План', deadline: '2027-01-01T12:00', priority: 'средний' }
  const projectTasks = require(join(directory, 'compiled/work/projection.js')).projectTasks
  const local = projectTasks([], [creation], employee.id)[0]
  assert.ok(local.id < 0)
  const edit = { id: randomUUID(), kind: 'edit', userId: employee.id, taskOperation: creation.id, version: 0, title: 'Изменено без сети', description: 'План 2', deadline: '2027-01-02T12:00', priority: 'высокий' }
  const remove = { id: randomUUID(), kind: 'delete', userId: employee.id, taskOperation: creation.id, version: 1 }
  assert.equal(projectTasks([], [creation, edit], employee.id)[0].title, edit.title)
  assert.equal(projectTasks([], [creation, edit], employee.id)[0].version, 1)
  assert.equal(projectTasks([], [creation, edit, remove], employee.id).length, 0)
  for (const operation of [creation, edit, remove]) { applyOperation(employee, operation); applyOperation(employee, operation) }
  const saved = db.prepare('SELECT * FROM tasks WHERE client_id = ?').get(creation.id)
  assert.equal(saved.title, edit.title)
  assert.equal(saved.deleted, 1)
  assert.equal(saved.version, 2)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_events WHERE task_id = ?').get(saved.id).n, 3)
})

test('изменения задачи уведомляют автора и исполнителя, повторы и отказы не создают событий', () => {
  const item = create()
  const counts = id => db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?').get(id).n
  for (const [actor, kind, fields] of [[employee, 'accept', {}], [employee, 'problem', { comment: 'Нужно оборудование' }], [manager, 'reschedule', { deadline: '2027-01-10T12:00', comment: 'Ожидаем поставку' }], [employee, 'complete', { comment: 'Готово' }]]) {
    const before = [counts(manager.id), counts(employee.id), counts(stranger.id)]
    const operation = { id: randomUUID(), kind, task: item.id, version: task(item.id).version, ...fields }
    applyOperation(actor, operation)
    applyOperation(actor, operation)
    assert.equal(counts(manager.id), before[0] + 1)
    assert.equal(counts(employee.id), before[1] + 1)
    assert.equal(counts(stranger.id), before[2])
  }
  const before = counts(employee.id)
  assert.throws(() => change(employee, 'delete', item.id))
  assert.equal(counts(employee.id), before)
})
