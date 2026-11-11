import { displayStatus } from '../../operations'
import { formatDeadline } from '../../dates'
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '../../auth/actions'
import db from '../../db'
import { getPerson, getDepartment } from '../../people'
import { IkonsIcon } from '../../components/IkonsIcon'
import check from '@ikions/icons/nodes/check'
import warning from '@ikions/icons/nodes/warning'
import clock from '@ikions/icons/nodes/clock'
import arrowLeft from '@ikions/icons/nodes/arrow-left'
import { createTaskForEmployee } from './actions'

type Task = {
  id: number
  title: string
  description: string
  deadline: number | string
  status: 'новая' | 'в работе' | 'выполнена' | 'просрочена'
  priority: 'высокий' | 'средний' | 'низкий'
}

type Employee = {
  id: number
  name: string
  role: string
}

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const employeeId = Number(id)

  const employee = db.prepare(`SELECT id, name, role FROM users WHERE id = ? AND ${user.is_superadmin ? '1 = 1' : 'manager_id = ?'}`).get(...(user.is_superadmin ? [employeeId] : [employeeId, user.id])) as Employee | undefined
  if (!employee) redirect('/management')

  const tasks = db.prepare('SELECT id, title, description, deadline, status, priority FROM tasks WHERE deleted = 0 AND initiative = 0 AND assigned_to = ? ORDER BY id DESC').all(employeeId) as Task[]
  tasks.forEach((task, index) => { tasks[index] = displayStatus(task) })

  function StatusBadge({ status }: { status: Task['status'] }) {
    const classes: Record<Task['status'], string> = {
      'новая': 'border border-border text-muted-foreground',
      'в работе': 'border border-accent/30 text-accent',
      'выполнена': 'bg-[#e9dcd6] text-[#5b4032]',
      'просрочена': 'bg-muted text-accent border border-accent/20',
    }
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${classes[status]}`}>
        {status === 'выполнена' && <IkonsIcon data={check} variant='filled' size={12} />}
        {status === 'просрочена' && <IkonsIcon data={warning} variant='filled' size={12} />}
        {status}
      </span>
    )
  }

  return (
    <div className='section-page'>
      <Link href='/management' className='flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit'>
        <IkonsIcon data={arrowLeft} variant='outline' size={16} />
        Назад
      </Link>

      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-3xl font-extrabold tracking-tight'>{employee.name}</h1>
          <p className='text-sm text-muted-foreground mt-1'>{getDepartment(getPerson(employeeId)!)?.name || 'Отдел не назначен'}</p>
        </div>
        <div className='flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground'>
          <IkonsIcon data={clock} variant='outline' size={16} />
          <span>{tasks.length} задач</span>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-2'>
        <div className='flex flex-col gap-3'>
          <h2 className='text-lg font-semibold'>Задачи</h2>
          {tasks.map((task) => (
            <div
              key={task.id}
              className='content-card task-card'
            data-state={task.status}
            >
              <div className='flex items-start justify-between gap-4'>
                <h3 className='text-base font-semibold tracking-tight transition-colors group-hover:text-accent'>
                  <Link href='/work'>{task.title}</Link>
                </h3>
                <StatusBadge status={task.status} />
              </div>
              <p className='text-sm text-muted-foreground leading-relaxed'>{task.description}</p>
              <div className='flex items-center gap-4 text-xs text-muted-foreground'>
                <span>{formatDeadline(task.deadline)}</span>
                <span className='text-border'>|</span>
                <span className={task.priority === 'высокий' ? 'text-accent font-medium' : task.priority === 'средний' ? 'text-muted-foreground' : 'text-muted-foreground/60'}>
                  {task.priority}
                </span>
              </div>
            </div>
          ))}
          {tasks.length === 0 && (
            <div className='rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground'>
              У сотрудника пока нет задач
            </div>
          )}
        </div>

        <div className='flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm h-fit'>
          <h2 className='text-lg font-semibold'>Новая задача</h2>
          <form action={createTaskForEmployee} className='flex flex-col gap-4'>
            <input type='hidden' name='employee' value={employeeId} />
            <div className='flex flex-col gap-1.5'>
              <label htmlFor='title' className='text-sm font-medium text-muted-foreground'>Название</label>
              <input
                id='title' name='title' type='text' required
                className='rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-muted-foreground/30 focus:ring-1 focus:ring-ring'
              />
            </div>
            <div className='flex flex-col gap-1.5'>
              <label htmlFor='description' className='text-sm font-medium text-muted-foreground'>Описание</label>
              <textarea
                id='description' name='description' required rows={3}
                className='rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-muted-foreground/30 focus:ring-1 focus:ring-ring'
              />
            </div>
            <div className='flex flex-col gap-1.5'>
              <label htmlFor='deadline' className='text-sm font-medium text-muted-foreground'>Дата и время (Москва)</label>
              <input
                id='deadline' name='deadline' type='datetime-local' required
                className='rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-muted-foreground/30 focus:ring-1 focus:ring-ring'
              />
            </div>
            <div className='flex flex-col gap-1.5'>
              <label htmlFor='priority' className='text-sm font-medium text-muted-foreground'>Приоритет</label>
              <select
                id='priority' name='priority' required
                className='rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-muted-foreground/30 focus:ring-1 focus:ring-ring'
              >
                <option value='низкий'>Низкий</option>
                <option value='средний'>Средний</option>
                <option value='высокий'>Высокий</option>
              </select>
            </div>
            <button
              type='submit'
              className='mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:opacity-90'
            >
              Назначить
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
