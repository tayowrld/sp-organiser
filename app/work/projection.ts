import type { Task } from '../operations'
import type { Pending } from './storage'

export function projectTasks(tasks: Task[], pending: Pending[], userId: number) {
  const projected = tasks.map(task => ({ ...task }))
  for (const operation of pending.filter(item => item.userId === userId)) {
    if (operation.kind === 'initiative' || operation.kind === 'create') {
      if (projected.some(task => task.client_id === operation.id)) continue
      projected.unshift({
        id: -Number.parseInt(operation.id.replace(/-/g, '').slice(0, 12), 16),
        client_id: operation.id, initiative: Number(operation.kind === 'initiative'), deleted: 0, deletion_requested: 0,
        title: String(operation.title), description: String(operation.description),
        deadline: Date.parse(`${operation.deadline}:00+03:00`), priority: String(operation.priority || 'средний'),
        assigned_to: operation.kind === 'initiative' ? userId : Number(operation.employee), created_by: userId,
        department_id: Number(operation.department) || null, claimed: operation.department ? 0 : 1,
        version: 0, status: 'новая', workflow: 'новая', shift_id: Number(operation.shift) || null,
        require_comment: Number(Boolean(operation.require_comment)), require_photo: Number(Boolean(operation.require_photo)),
        require_review: operation.kind === 'initiative' ? 0 : Number(Boolean(operation.require_review)),
      })
      continue
    }
    const task = projected.find(task => operation.taskOperation ? task.client_id === operation.taskOperation : task.id === operation.task)
    if (!task || task.version !== Number(operation.version)) continue
    if (operation.kind === 'accept') { task.workflow = 'в работе'; task.claimed = 1; task.assigned_to = userId }
    if (operation.kind === 'complete') task.workflow = task.require_review ? 'на проверке' : 'выполнена'
    if (operation.kind === 'problem') task.workflow = 'проблема'
    if (operation.kind === 'approve') task.workflow = 'выполнена'
    if (operation.kind === 'reject') task.workflow = 'в работе'
    if (operation.kind === 'edit') { task.title = String(operation.title); task.description = String(operation.description); task.priority = String(operation.priority) }
    if (operation.kind === 'edit' || operation.kind === 'reschedule') task.deadline = Date.parse(`${operation.deadline}:00+03:00`)
    if (operation.kind === 'delete') task.deleted = 1
    if (operation.kind === 'requestDelete') task.deletion_requested = 1
    if (operation.kind === 'denyDelete') task.deletion_requested = 0
    task.version++
  }
  return projected.filter(task => !task.deleted)
}
