'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '../auth/actions'
import { hashPassword } from '../auth/lib'
import db from '../db'
import { notify } from '../operations'
import { canManagePerson, getPerson, validManager } from '../people'

export async function savePerson(_state: { error: string; success: string }, data: FormData) {
  const actor = await getUser()
  const fail = (error: string) => ({ error, success: '' })
  if (!actor || !(actor.is_admin || actor.is_superadmin)) return fail('Недостаточно прав для управления пользователями.')
  const id = Number(data.get('id'))
  const target = id ? getPerson(id) : undefined
  if (id && (!target || !canManagePerson(actor, target))) return fail('Этот аккаунт недоступен для редактирования.')
  const name = String(data.get('name') || '').trim()
  const email = String(data.get('email') || '').trim().toLowerCase()
  const password = String(data.get('password') || '')
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail('Укажите имя и корректную электронную почту.')
  if ((!id || password) && password.length < 12) return fail('Пароль должен содержать не менее 12 символов.')
  const managerValue = String(data.get('manager_id') || '')
  const managerId = actor.is_superadmin ? managerValue ? Number(managerValue) : null : actor.id
  const isAdmin = actor.is_superadmin ? Number(data.get('is_admin') === 'on') : 0
  const departmentValue = String(data.get('department_id') || '')
  const departmentId = actor.is_superadmin && isAdmin && departmentValue ? Number(departmentValue) : null
  if (departmentId !== null && (!Number.isInteger(departmentId) || !db.prepare('SELECT id FROM departments WHERE id = ?').get(departmentId))) return fail('Выберите существующий отдел.')
  const isActive = Number(data.get('is_active') === 'on')
  if (!validManager(id || -1, managerId)) return fail('Выберите действующего руководителя. Подчинение по кругу недопустимо.')
  if (!isActive && id && db.prepare('SELECT id FROM users WHERE manager_id = ? AND is_active = 1 LIMIT 1').get(id)) return fail('Сначала переназначьте действующих сотрудников этого пользователя.')
  const duplicate = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ?').get(email, id)
  if (duplicate) return fail('Пользователь с такой почтой уже существует.')
  const hash = password ? await hashPassword(password) : null
  try {
    db.transaction(() => {
      const currentActor = getPerson(actor.id)
      const currentTarget = id ? getPerson(id) : undefined
      if (!currentActor?.is_active || currentActor.is_admin !== actor.is_admin || currentActor.is_superadmin !== actor.is_superadmin) throw new Error('Доступ изменён')
      if (id && (!currentTarget || !canManagePerson(currentActor, currentTarget))) throw new Error('Доступ изменён')
      if (!validManager(id || -1, managerId)) throw new Error('Руководитель изменён')
      let savedId = id
      if (id) {
        db.prepare('UPDATE users SET name = ?, email = ?, manager_id = ?, is_admin = ?, is_active = ?, department_id = ?, password_hash = COALESCE(?, password_hash) WHERE id = ?').run(name, email, managerId, isAdmin, isActive, departmentId, hash, id)
      } else {
        savedId = Number(db.prepare("INSERT INTO users (name, email, password_hash, role, manager_id, is_admin, is_active, department_id) VALUES (?, ?, ?, 'employee', ?, ?, ?, ?)").run(name, email, hash, managerId, isAdmin, isActive, departmentId).lastInsertRowid)
      }
      for (const recipient of new Set([actor.id, savedId, managerId, target?.manager_id].filter((value): value is number => typeof value === 'number'))) notify(recipient, `${actor.name}: ${id ? 'изменён' : 'создан'} пользователь ${name}`)
    })()
  } catch {
    return fail('Не удалось сохранить пользователя. Проверьте данные и повторите попытку.')
  }
  revalidatePath('/', 'layout')
  return { error: '', success: id ? 'Изменения сохранены.' : 'Пользователь создан.' }
}

export async function createDepartment(_state: { error: string; success: string }, data: FormData) {
  const actor = await getUser()
  if (!actor?.is_superadmin) return { error: 'Создавать отделы может только главный администратор.', success: '' }
  const name = String(data.get('name') || '').trim().replace(/\s+/g, ' ')
  if (!name || name.length > 100) return { error: 'Укажите название отдела длиной до 100 символов.', success: '' }
  const departments = db.prepare('SELECT name FROM departments').all() as { name: string }[]
  if (departments.some(department => department.name.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) return { error: 'Такой отдел уже существует.', success: '' }
  try {
    db.transaction(() => {
      db.prepare('INSERT INTO departments (name) VALUES (?)').run(name)
      for (const person of db.prepare('SELECT id FROM users WHERE is_superadmin = 1 AND is_active = 1').all() as { id: number }[]) notify(person.id, `${actor.name}: создан отдел ${name}`)
    })()
  } catch {
    return { error: 'Не удалось создать отдел. Проверьте название.', success: '' }
  }
  revalidatePath('/', 'layout')
  return { error: '', success: 'Отдел создан. Его можно назначить администратору.' }
}
