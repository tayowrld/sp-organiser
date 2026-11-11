import db from '../db'
import { canAssignTask, getDepartment, getPerson, type Person } from '../people'
import { parseDeadline } from '../dates'

export type Task = {
  reminder_hours: number | null
  client_id: string | null
  initiative: number
  deleted: number
  deletion_requested: number
  id: number
  title: string
  description: string
  deadline: number | string
  status: string
  workflow: string
  priority: string
  assigned_to: number
  created_by: number
  department_id: number | null
  claimed: number
  version: number
  require_comment: number
  require_photo: number
  require_review: number
  shift_id: number | null
}
export type Operation = { id: string; kind: string; [key: string]: unknown }
export class WorkError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
function fail(message: string, status = 400): never { throw new WorkError(message, status) }
const text = (value: unknown, max = 4000) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const number = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0
export const isManager = (user: Person) => Boolean(user.is_superadmin || db.prepare('SELECT id FROM users WHERE manager_id = ? AND is_active = 1').get(user.id))
export const departmentMembers = (id: number) => (db.prepare('SELECT id FROM users WHERE is_active = 1').all() as { id: number }[]).map(row => getPerson(row.id)!).filter(person => getDepartment(person)?.id === id)
export const managesDepartment = (user: Person, id: number) => Boolean(db.prepare('SELECT id FROM departments WHERE id = ?').get(id) && (user.is_superadmin || user.is_admin && getDepartment(user)?.id === id))
export function canSeeTask(user: Person, task: Task) {
  if (task.deleted) return false
  if (task.initiative) return task.created_by === user.id
  return Boolean(user.is_superadmin || task.assigned_to === user.id || task.created_by === user.id || canAssignTask(user, task.assigned_to) || task.department_id && getDepartment(user)?.id === task.department_id)
}
export function isOverdue(task: { deadline: number | string; status: string }, now = Date.now()) {
  return task.status !== 'выполнена' && typeof task.deadline === 'number' && task.deadline < now
}
export function displayStatus<T extends { deadline: number | string; status: string }>(task: T): T {
  return { ...task, status: isOverdue(task) ? 'просрочена' : task.status === 'просрочена' ? 'новая' : task.status }
}
export function notify(userId: number, message: string, dedupe: string | null = null) {
  db.prepare('INSERT OR IGNORE INTO notifications (user_id, message, created_at, dedupe) VALUES (?, ?, ?, ?)').run(userId, message, Date.now(), dedupe)
}
function audit(taskId: number, actorId: number, action: string, comment = '', photo: Buffer | null = null, mime: string | null = null) {
  db.prepare('INSERT INTO task_events (task_id, actor_id, action, comment, photo, mime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(taskId, actorId, action, comment, photo, mime, Date.now())
}
function recipient(user: Person, input: Operation) {
  const department = number(input.department)
  const employee = number(input.employee)
  if (department) {
    if (!managesDepartment(user, department)) fail('Нет права назначать задачи этому отделу', 403)
    const members = departmentMembers(department)
    if (!members.length) fail('В отделе нет активных сотрудников')
    return { employee: members[0].id, department, claimed: 0 }
  }
  if (!canAssignTask(user, employee)) fail('Нет права назначать задачи этому сотруднику', 403)
  return { employee, department: null, claimed: 1 }
}
function reminderHours(value: unknown) {
  if (value === undefined || value === 'previous-day' || value === null) return null
  const hours = Number(value)
  if (!Number.isInteger(hours) || hours < 0 || hours > 8760) fail('Укажите время подготовки от 0 до 8760 часов')
  return hours
}

function addTask(user: Person, input: Operation) {
  const initiative = input.kind === 'initiative'
  const target = initiative ? { employee: user.id, department: null, claimed: 1 } : recipient(user, input)
  const title = text(input.title, 200)
  const description = text(input.description)
  const deadline = parseDeadline(text(input.deadline))
  if (!title || !description || deadline === null) fail('Заполните название, описание и корректный срок')
  const shiftId = number(input.shift) || null
  if (shiftId && !db.prepare('SELECT id FROM shifts WHERE id = ? AND closed_at IS NULL AND (created_by = ? OR owner_id = ? OR ? = 1)').get(shiftId, user.id, user.id, user.is_superadmin)) fail('Смена недоступна')
  const priority = ['низкий', 'средний', 'высокий'].includes(String(input.priority)) ? String(input.priority) : 'средний'
  const result = db.prepare(`INSERT INTO tasks (title, description, deadline, status, priority, assigned_to, created_by, department_id, claimed, require_comment, require_photo, require_review, shift_id) VALUES (?, ?, ?, 'новая', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(title, description, deadline, priority, target.employee, user.id, target.department, target.claimed, input.require_comment ? 1 : 0, input.require_photo ? 1 : 0, initiative ? 0 : input.require_review ? 1 : 0, initiative ? null : shiftId)
  db.prepare('UPDATE tasks SET reminder_hours = ? WHERE id = ?').run(reminderHours(input.reminder_hours), result.lastInsertRowid)
  if (initiative) db.prepare('UPDATE tasks SET initiative = 1 WHERE id = ?').run(result.lastInsertRowid)
  db.prepare('UPDATE tasks SET client_id = ? WHERE id = ?').run(input.id, result.lastInsertRowid)
  audit(Number(result.lastInsertRowid), user.id, 'Задача создана')
  for (const id of new Set([user.id, ...(target.department ? departmentMembers(target.department).map(person => person.id) : [target.employee])])) notify(id, `Новая задача: ${title}`)
}
function attachment(value: unknown) {
  if (!value) return { photo: null, mime: null }
  const match = typeof value === 'string' && value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return fail('Допустимы фотографии JPEG, PNG или WebP')
  const photo = Buffer.from(match[2], 'base64')
  if (photo.length > 4 * 1024 * 1024) fail('Фотография должна быть меньше 4 МБ')
  const valid = match[1] === 'image/jpeg' ? photo.subarray(0, 3).equals(Buffer.from([255, 216, 255])) : match[1] === 'image/png' ? photo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : photo.toString('ascii', 0, 4) === 'RIFF' && photo.toString('ascii', 8, 12) === 'WEBP'
  if (!valid) fail('Файл не является фотографией указанного формата')
  return { photo, mime: match[1] }
}
export function applyOperation(user: Person, input: Operation) {
  if (!user.is_active) fail('Пользователь отключён', 403)
  if (!/^[\w-]{16,80}$/.test(input.id)) fail('Некорректный идентификатор операции')
  return db.transaction(() => {
    if (db.prepare('SELECT id FROM operations WHERE id = ? AND user_id = ?').get(input.id, user.id)) return
    user = getPerson(user.id)!
    if (!user?.is_active) fail('Доступ изменён', 403)
    let privateAction = input.kind === 'initiative'
    if (input.kind === 'create' || input.kind === 'initiative') addTask(user, input)
    else if (input.kind === 'superadmin') {
      if (!user.is_superadmin) fail('Назначать главных администраторов может только главный администратор', 403)
      const target = getPerson(number(input.person))
      if (!target?.is_active) fail('Пользователь недоступен')
      if (target.is_superadmin !== Number(input.previous)) fail('Права уже изменены. Обновите данные.', 409)
      const enabled = input.enabled === true
      if (!enabled && target.is_superadmin && (db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_superadmin = 1 AND is_active = 1').get() as { n: number }).n <= 1) fail('Нельзя снять права последнего главного администратора')
      db.prepare('UPDATE users SET is_superadmin = ? WHERE id = ?').run(Number(enabled), target.id)
      for (const id of new Set([target.id, user.id, ...(db.prepare('SELECT id FROM users WHERE is_superadmin = 1 AND is_active = 1').all() as { id: number }[]).map(person => person.id)])) notify(id, `${user.name}: ${enabled ? 'назначен главным администратором' : 'сняты права главного администратора'} — ${target.name}`)
    } else if (input.kind === 'publish') {
      if (!isManager(user)) fail('Публиковать может руководитель', 403)
      const title = text(input.title, 200), content = text(input.content)
      const category = text(input.category)
      if (!title || !content || !['объявление', 'срочное', 'инструкция'].includes(category)) fail('Заполните объявление')
      db.prepare('INSERT INTO updates (title, content, category, created_by) VALUES (?, ?, ?, ?)').run(title, content, category, user.id)
      for (const person of db.prepare('SELECT id FROM users WHERE is_active = 1').all() as { id: number }[]) notify(person.id, `Объявление: ${title}`)
    } else if (input.kind === 'ack') {
      if (!db.prepare('SELECT id FROM updates WHERE id = ?').get(number(input.notice))) fail('Объявление не найдено', 404)
      const changed = db.prepare('INSERT OR IGNORE INTO acknowledgements VALUES (?, ?, ?)').run(number(input.notice), user.id, Date.now())
      const notice = db.prepare('SELECT title, created_by FROM updates WHERE id = ?').get(number(input.notice)) as { title: string; created_by: number | null }
      if (changed.changes && notice.created_by) notify(notice.created_by, `${user.name} ознакомился: ${notice.title}`)
    } else if (input.kind === 'read') {
      db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND id <= ?').run(Date.now(), user.id, number(input.notification))
    } else if (input.kind === 'shift') {
      const owner = number(input.employee)
      const start = parseDeadline(text(input.start)), end = parseDeadline(text(input.end))
      if (!canAssignTask(user, owner) || !text(input.title) || start === null || end === null || end <= start) fail('Проверьте ответственного и время смены')
      for (const id of new Set([user.id, owner])) notify(id, `Запланирована смена: ${text(input.title, 200)}`)
      db.prepare('INSERT INTO shifts (title, starts_at, ends_at, owner_id, department_id, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(text(input.title, 200), start, end, owner, getDepartment(getPerson(owner)!)?.id ?? null, user.id)
    } else if (input.kind === 'closeShift') {
      const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(number(input.shift)) as { id: number; owner_id: number; created_by: number } | undefined
      if (!shift || !(user.is_superadmin || shift.owner_id === user.id || shift.created_by === user.id)) fail('Смена недоступна', 403)
      if (db.prepare("SELECT id FROM tasks WHERE deleted = 0 AND shift_id = ? AND status != 'выполнена' AND NOT EXISTS (SELECT 1 FROM handovers h WHERE h.task_id = tasks.id AND h.accepted_at IS NOT NULL AND h.to_id = tasks.assigned_to)").get(shift.id)) fail('Сначала завершите задачи или дождитесь принятия передачи')
      for (const id of new Set([shift.owner_id, shift.created_by])) notify(id, `${user.name}: смена №${shift.id} закрыта`)
      db.prepare('UPDATE shifts SET closed_at = ? WHERE id = ? AND closed_at IS NULL').run(Date.now(), shift.id)
    } else if (input.kind === 'template') {
      const target = recipient(user, input)
      const title = text(input.title, 200), items = text(input.items), time = text(input.time)
      if (!title || !items || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('Укажите название, пункты чек-листа и время')
      if (items.split('\n').filter(Boolean).length > 30) fail('Максимум 30 пунктов')
      for (const id of new Set([user.id, ...(target.department ? departmentMembers(target.department).map(person => person.id) : [target.employee])])) notify(id, `Настроен ежедневный чек-лист: ${title}`)
      db.prepare('INSERT INTO templates (title, items, department_id, assigned_to, created_by, time, require_review) VALUES (?, ?, ?, ?, ?, ?, ?)').run(title, items, target.department, target.employee, user.id, time, input.require_review ? 1 : 0)
    } else if (input.kind === 'toggleTemplate') {
      const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(number(input.template)) as { created_by: number; id: number; assigned_to: number; department_id: number | null; title: string } | undefined
      if (!template || !(user.is_superadmin || template.created_by === user.id)) fail('Шаблон недоступен', 403)
      for (const id of new Set([template.created_by, ...(template.department_id ? departmentMembers(template.department_id).map(person => person.id) : [template.assigned_to])])) notify(id, `Изменено расписание чек-листа: ${template.title}`)
      db.prepare('UPDATE templates SET active = 1 - active WHERE id = ?').run(template.id)
    } else {
      const task = (input.taskOperation ? db.prepare('SELECT * FROM tasks WHERE deleted = 0 AND client_id = ? AND created_by = ?').get(text(input.taskOperation, 80), user.id) : db.prepare('SELECT * FROM tasks WHERE deleted = 0 AND id = ?').get(number(input.task))) as Task | undefined
      if (!task || !canSeeTask(user, task) && !(input.kind === 'takeover' && db.prepare('SELECT id FROM handovers WHERE task_id = ? AND to_id = ? AND accepted_at IS NULL').get(task.id, user.id))) fail('Задача недоступна', 403)
      if (task.version !== Number(input.version)) fail('Задача уже изменена. Обновите данные и повторите действие.', 409)
      privateAction = Boolean(task.initiative)
      const owner = task.claimed && task.assigned_to === user.id
      const reviewer = user.id !== task.assigned_to && (user.is_superadmin || canAssignTask(user, task.assigned_to) || task.created_by === user.id)
      const comment = text(input.comment)
      const { photo, mime } = attachment(input.photo)
      let state = task.workflow
      const editable = task.created_by === user.id
      if (input.kind === 'edit' || input.kind === 'delete') {
        if (!editable) fail('Изменить или удалить задачу может только её автор', 403)
        if (input.kind === 'delete') {
          const pending = db.prepare('SELECT to_id FROM handovers WHERE task_id = ? AND accepted_at IS NULL').get(task.id) as { to_id: number } | undefined
          if (pending) notify(pending.to_id, `Задача удалена, передача отменена: ${task.title}`)
          db.prepare('UPDATE tasks SET deleted = 1, deletion_requested = 0 WHERE id = ?').run(task.id)
          db.prepare('DELETE FROM handovers WHERE task_id = ? AND accepted_at IS NULL').run(task.id)
        } else {
          const deadline = parseDeadline(text(input.deadline))
          const title = text(input.title, 200), description = text(input.description), priority = text(input.priority)
          if (!title || !description || deadline === null || !['низкий', 'средний', 'высокий'].includes(priority)) fail('Проверьте название, описание, срок и приоритет')
          if (input.reminder_hours !== undefined) db.prepare('UPDATE tasks SET reminder_hours = ? WHERE id = ?').run(reminderHours(input.reminder_hours), task.id)
          db.prepare('UPDATE tasks SET title = ?, description = ?, deadline = ?, priority = ? WHERE id = ?').run(title, description, deadline, priority, task.id)
        }
      } else if (input.kind === 'requestDelete') {
        if (!owner || task.initiative || editable || task.deletion_requested || !comment) fail('Укажите причину запроса на удаление своей задачи')
        db.prepare('UPDATE tasks SET deletion_requested = 1 WHERE id = ?').run(task.id)
      } else if (input.kind === 'denyDelete') {
        if (!editable || !task.deletion_requested || !comment) fail('Автор должен указать причину отказа', 403)
        db.prepare('UPDATE tasks SET deletion_requested = 0 WHERE id = ?').run(task.id)
      } else if (input.kind === 'accept') {
        if (task.workflow !== 'новая' || !(owner || !task.claimed && task.department_id && getDepartment(user)?.id === task.department_id)) fail('Задачу нельзя принять', 403)
        db.prepare('UPDATE tasks SET assigned_to = ?, claimed = 1 WHERE id = ?').run(user.id, task.id)
        state = 'в работе'
      } else if (input.kind === 'reschedule') {
        if (!editable) fail('Нет права менять срок', 403)
        const deadline = parseDeadline(text(input.deadline))
        if (deadline === null || !comment) fail('Укажите новый срок и причину изменения')
        db.prepare('UPDATE tasks SET deadline = ? WHERE id = ?').run(deadline, task.id)
      } else if (input.kind === 'complete') {
        if (!owner || !['в работе', 'проблема'].includes(state)) fail('Сначала примите задачу в работу')
        if (task.require_comment && !comment) fail('Для завершения нужен комментарий')
        if (task.require_photo && !photo) fail('Для завершения нужна фотография')
        state = task.require_review ? 'на проверке' : 'выполнена'
      } else if (input.kind === 'problem') {
        if (!owner || !['новая', 'в работе', 'проблема'].includes(state) || !comment) fail('Опишите проблему по своей незавершённой задаче')
        state = 'проблема'
      } else if (input.kind === 'approve' || input.kind === 'reject') {
        if (!reviewer || state !== 'на проверке') fail('Нет права проверять этот результат', 403)
        if (input.kind === 'reject' && !comment) fail('Укажите, что нужно исправить')
        state = input.kind === 'approve' ? 'выполнена' : 'в работе'
      } else if (input.kind === 'handover') {
        if (task.initiative) fail('Инициатива остаётся личной задачей')
        const to = getPerson(number(input.employee))
        if (!owner || state === 'выполнена' || !to?.is_active || to.id === user.id || !comment) fail('Выберите принимающего сотрудника и опишите остаток работы')
        if (!(to.manager_id === user.manager_id && user.manager_id !== null || getDepartment(user)?.id && getDepartment(user)?.id === getDepartment(to)?.id || canAssignTask(user, to.id))) fail('Передача доступна только внутри команды', 403)
        if (db.prepare('SELECT id FROM handovers WHERE task_id = ? AND accepted_at IS NULL').get(task.id)) fail('Передача уже ожидает принятия')
        db.prepare('INSERT INTO handovers (task_id, from_id, to_id, note, created_at) VALUES (?, ?, ?, ?, ?)').run(task.id, user.id, to.id, comment, Date.now())
        notify(to.id, `Примите передачу: ${task.title}`)
      } else if (input.kind === 'takeover') {
        const handover = db.prepare('SELECT * FROM handovers WHERE task_id = ? AND to_id = ? AND accepted_at IS NULL').get(task.id, user.id) as { id: number; from_id: number } | undefined
        if (!handover || task.assigned_to !== handover.from_id || state === 'выполнена') fail('Передача уже недоступна')
        db.prepare('UPDATE handovers SET accepted_at = ? WHERE id = ?').run(Date.now(), handover.id)
        db.prepare('UPDATE tasks SET assigned_to = ?, claimed = 1 WHERE id = ?').run(user.id, task.id)
      } else if (input.kind === 'cancelHandover') {
        if (!owner) fail('Только ответственный может отменить передачу', 403)
        const pending = db.prepare('SELECT to_id FROM handovers WHERE task_id = ? AND accepted_at IS NULL').get(task.id) as { to_id: number } | undefined
        if (pending) notify(pending.to_id, `Передача отменена: ${task.title}`)
        db.prepare('DELETE FROM handovers WHERE task_id = ? AND accepted_at IS NULL').run(task.id)
      } else fail('Неизвестное действие')
      db.prepare('UPDATE tasks SET workflow = ?, status = ?, version = version + 1 WHERE id = ?').run(state, state === 'выполнена' ? state : state === 'новая' ? state : 'в работе', task.id)
      const labels: Record<string, string> = { edit: 'Задача изменена', delete: 'Задача удалена', requestDelete: 'Запрошено удаление', denyDelete: 'В удалении отказано', reschedule: 'Срок изменён', accept: 'Принята в работу', complete: 'Результат отправлен', problem: 'Сообщение о проблеме', approve: 'Результат подтверждён', reject: 'Возвращена на доработку', handover: 'Передача предложена', takeover: 'Ответственность принята', cancelHandover: 'Передача отменена' }
      audit(task.id, user.id, labels[input.kind], comment, photo, mime)
      const interested = task.initiative ? [user.id] : [user.id, task.created_by, task.assigned_to, ...(task.department_id && !task.claimed ? departmentMembers(task.department_id).map(person => person.id) : [])]
      for (const id of new Set(interested)) notify(id, `${user.name}: ${labels[input.kind]} — ${task.title}${comment ? ` · ${comment}` : ''}`)
    }
    const details: Operation = { ...input, private: privateAction }
    delete details.photo
    db.prepare('INSERT INTO audit_log (user_id, kind, details, created_at) VALUES (?, ?, ?, ?)').run(user.id, input.kind, JSON.stringify(details), Date.now())
    db.prepare('INSERT INTO operations VALUES (?, ?)').run(input.id, user.id)
  })()
}

export function runRecurring(now = Date.now()) {
  const date = new Date(now + 3 * 3600000).toISOString().slice(0, 10)
  db.transaction(() => {
    const templates = db.prepare('SELECT * FROM templates WHERE active = 1').all() as { id: number; title: string; items: string; time: string; department_id: number | null; assigned_to: number; created_by: number; require_review: number }[]
    for (const template of templates) {
      const actor = getPerson(template.created_by)
      if (!actor?.is_active || !(template.department_id ? managesDepartment(actor, template.department_id) : canAssignTask(actor, template.assigned_to))) continue
      const members = template.department_id ? departmentMembers(template.department_id) : [getPerson(template.assigned_to)!]
      if (!members.length) continue
      const items = template.items.split('\n').map(item => item.trim()).filter(Boolean)
      items.forEach((item, index) => {
        const occurrence = `${date}:${index}`
        const result = db.prepare(`INSERT OR IGNORE INTO tasks (title, description, deadline, status, priority, assigned_to, created_by, department_id, claimed, template_id, occurrence, require_review) VALUES (?, ?, ?, 'новая', 'средний', ?, ?, ?, ?, ?, ?, ?)`).run(item, template.title, parseDeadline(`${date}T${template.time}`), members[0].id, actor.id, template.department_id, template.department_id ? 0 : 1, template.id, occurrence, template.require_review)
        if (result.changes) {
          audit(Number(result.lastInsertRowid), actor.id, 'Создана по ежедневному чек-листу', template.title)
          members.forEach(person => notify(person.id, `Чек-лист «${template.title}»: ${item}`))
        }
      })
    }
    const active = db.prepare("SELECT * FROM tasks WHERE deleted = 0 AND status != 'выполнена' AND typeof(deadline) = 'integer'").all() as Task[]
    for (const task of active) {
      const recipients = task.initiative ? [task.created_by] : [task.created_by, ...(task.department_id && !task.claimed ? departmentMembers(task.department_id).map(person => person.id) : [task.assigned_to])]
      for (const id of new Set(recipients)) {
        if (!getPerson(id)?.is_active) continue
        const deadline = Number(task.deadline)
        const start = task.reminder_hours === null ? Math.floor((deadline + 10800000) / 86400000) * 86400000 - 86400000 + 9 * 3600000 : deadline - task.reminder_hours * 3600000
        if (now < start) continue
        const slot = Math.floor((now - start) / (4 * 3600000))
        notify(id, `${deadline < now ? 'Просрочена задача' : 'Напоминание о сроке'}: ${task.title}`, `reminder:${task.id}:${deadline}:${id}:${task.reminder_hours ?? 'previous-day'}:${slot}`)
      }
    }
  })()
}

export function snapshot(user: Person) {
  const incoming = db.prepare('SELECT task_id FROM handovers WHERE to_id = ? AND accepted_at IS NULL').all(user.id) as { task_id: number }[]
  const tasks = (db.prepare('SELECT * FROM tasks ORDER BY id DESC').all() as Task[]).filter(task => canSeeTask(user, task) || incoming.some(row => row.task_id === task.id))
  const ids = new Set(tasks.map(task => task.id))
  const people = (db.prepare('SELECT id FROM users WHERE is_active = 1').all() as { id: number }[]).map(row => getPerson(row.id)!).filter(person => user.is_superadmin || person.id === user.id || tasks.some(task => task.created_by === person.id) || canAssignTask(user, person.id) || person.manager_id === user.manager_id && user.manager_id !== null || getDepartment(user)?.id && getDepartment(user)?.id === getDepartment(person)?.id)
  return {
    user: { ...user, manager: isManager(user) },
    tasks,
    people: people.map(person => ({ id: person.id, name: person.name, is_superadmin: person.is_superadmin, assignable: canAssignTask(user, person.id), department: getDepartment(person)?.id ?? null })),
    departments: (db.prepare('SELECT * FROM departments').all() as { id: number; name: string }[]).filter(department => user.is_superadmin || getDepartment(user)?.id === department.id).map(department => ({ ...department, assignable: managesDepartment(user, department.id) })),
    events: (db.prepare('SELECT e.id, e.task_id, e.actor_id, u.name, e.action, e.comment, e.photo IS NOT NULL AS has_photo, e.created_at FROM task_events e JOIN users u ON e.actor_id = u.id ORDER BY e.id DESC').all() as { task_id: number }[]).filter(event => ids.has(event.task_id)),
    notices: db.prepare('SELECT u.*, EXISTS(SELECT 1 FROM acknowledgements a WHERE a.update_id = u.id AND a.user_id = ?) AS acknowledged, (SELECT COUNT(*) FROM acknowledgements a WHERE a.update_id = u.id) AS read_count FROM updates u ORDER BY id DESC').all(user.id),
    acknowledgements: isManager(user) ? db.prepare('SELECT a.*, u.name FROM acknowledgements a JOIN users u ON u.id = a.user_id').all() : [],
    shifts: (db.prepare('SELECT * FROM shifts ORDER BY starts_at DESC').all() as { owner_id: number; created_by: number; department_id: number | null }[]).filter(shift => user.is_superadmin || shift.owner_id === user.id || shift.created_by === user.id || shift.department_id && shift.department_id === getDepartment(user)?.id),
    templates: (db.prepare('SELECT * FROM templates').all() as { created_by: number }[]).filter(template => user.is_superadmin || template.created_by === user.id),
    handovers: (db.prepare('SELECT h.*, f.name AS from_name, t.name AS to_name FROM handovers h JOIN users f ON f.id = h.from_id JOIN users t ON t.id = h.to_id ORDER BY h.id DESC').all() as { task_id: number }[]).filter(row => ids.has(row.task_id)),
    notifications: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(user.id),
    activity: (db.prepare('SELECT a.id, a.user_id, a.kind, a.created_at, a.details, u.name FROM audit_log a JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 500').all() as { id: number; user_id: number; kind: string; created_at: number; name: string; details: string }[]).filter(event => event.user_id === user.id || !JSON.parse(event.details).private && (user.is_superadmin || canAssignTask(user, event.user_id))).map(event => ({ id: event.id, user_id: event.user_id, kind: event.kind, created_at: event.created_at, name: event.name })),
    pushKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
    generatedAt: Date.now(),
  }
}
