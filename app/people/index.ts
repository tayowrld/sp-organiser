import db from '../db'

export type Person = {
  id: number
  name: string
  email: string
  manager_id: number | null
  is_admin: number
  is_superadmin: number
  is_active: number
  department_id: number | null
}

export function getPerson(id: number) {
  return db.prepare('SELECT id, name, email, manager_id, is_admin, is_superadmin, is_active, department_id FROM users WHERE id = ?').get(id) as Person | undefined
}

export function canManagePerson(actor: Person, target: Person) {
  return Boolean(actor.is_active && target.id !== actor.id && !target.is_superadmin && (actor.is_superadmin || actor.is_admin && target.manager_id === actor.id && !target.is_admin))
}

export function canAssignTask(actor: Person, targetId: number) {
  const target = getPerson(targetId)
  return Boolean(actor.is_active && target?.is_active && (actor.is_superadmin || target.manager_id === actor.id))
}

export function validManager(personId: number, managerId: number | null) {
  const seen = new Set([personId])
  while (managerId !== null) {
    if (seen.has(managerId)) return false
    seen.add(managerId)
    const manager = getPerson(managerId)
    if (!manager?.is_active) return false
    managerId = manager.manager_id
  }
  return true
}

export type Department = { id: number; name: string }

export function getDepartment(person: Person): Department | null {
  const seen = new Set<number>()
  let current: Person | undefined = person
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    if (current.is_admin && current.department_id !== null) {
      return db.prepare('SELECT id, name FROM departments WHERE id = ?').get(current.department_id) as Department | undefined ?? null
    }
    current = current.manager_id === null ? undefined : getPerson(current.manager_id)
  }
  return null
}
