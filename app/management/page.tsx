export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '../auth/actions'
import db from '../db'
import { getPerson, getDepartment } from '../people'
import { IkonsIcon } from '../components/IkonsIcon'
import users from '@ikions/icons/nodes/users'
import check from '@ikions/icons/nodes/check'
import clock from '@ikions/icons/nodes/clock'
import warning from '@ikions/icons/nodes/warning'
import plus from '@ikions/icons/nodes/plus'

type Employee = {
  id: number
  name: string
  role: string
}

export default async function ManagementPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const employees = db.prepare(`SELECT id, name, role FROM users WHERE is_active = 1 AND ${user.is_superadmin ? 'id != ?' : 'manager_id = ?'}`).all(user.id) as Employee[]

  const stats = employees.map((emp) => {
    const totalRow = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ?').get(emp.id) as { c: number } | undefined
    const doneRow = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? AND status = 'выполнена'").get(emp.id) as { c: number } | undefined
    const overdueRow = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? AND status != 'выполнена' AND typeof(deadline) = 'integer' AND deadline < unixepoch('subsec') * 1000").get(emp.id) as { c: number } | undefined
    return { ...emp, department: getDepartment(getPerson(emp.id)!)?.name, total: Number(totalRow?.c ?? 0), done: Number(doneRow?.c ?? 0), overdue: Number(overdueRow?.c ?? 0) }
  })

  return (
    <div className='section-page'>
      <div className='flex items-center justify-between'>
        <h1 className='text-3xl font-extrabold tracking-tight'>Команда</h1>
        <div className='flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground'>
          <IkonsIcon data={users} variant='outline' size={16} />
          <span>{employees.length} сотрудников</span>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        {stats.map((emp) => (
          <Link
            key={emp.id}
            href={`/management/${emp.id}`}
            className='employee-card'
          >
            <div className='employee-heading'>
              <span className='employee-avatar' aria-hidden='true'>{emp.name.split(' ').map(part => part.charAt(0)).slice(0, 2).join('')}</span>
              <div>
                <h2 className='text-base font-semibold tracking-tight transition-colors group-hover:text-accent'>
                  {emp.name}
                </h2>
                <p className='text-xs text-muted-foreground mt-0.5'>{emp.department || 'Отдел не назначен'}</p>
              </div>
            </div>

            <div className='grid grid-cols-3 gap-2 text-center'>
              <div className='flex flex-col items-center gap-1 rounded-lg border border-border/50 bg-background p-3'>
                <IkonsIcon data={clock} variant='outline' size={16} />
                <span className='text-lg font-bold'>{emp.total}</span>
                <span className='text-[10px] uppercase tracking-wider text-muted-foreground'>Всего</span>
              </div>
              <div className='flex flex-col items-center gap-1 rounded-lg border border-border/50 bg-background p-3'>
                <IkonsIcon data={check} variant='filled' size={16} />
                <span className='text-lg font-bold'>{emp.done}</span>
                <span className='text-[10px] uppercase tracking-wider text-muted-foreground'>Готово</span>
              </div>
              <div className='flex flex-col items-center gap-1 rounded-lg border border-border/50 bg-background p-3'>
                <IkonsIcon data={warning} variant='filled' size={16} />
                <span className='text-lg font-bold'>{emp.overdue}</span>
                <span className='text-[10px] uppercase tracking-wider text-muted-foreground'>Просрочено</span>
              </div>
            </div>

            <div className='h-2 w-full rounded-full bg-background overflow-hidden border border-border/30'>
              <div
                className='h-full bg-foreground transition-all duration-700'
                style={{ width: `${emp.total > 0 ? (emp.done / emp.total) * 100 : 0}%` }}
              />
            </div>
          </Link>
        ))}
        <Link
          href='/management/new'
          className='employee-card employee-card-add'
        >
          <IkonsIcon data={plus} variant='outline' size={24} />
          <span className='text-sm font-medium'>Назначить задачу</span>
        </Link>
      </div>
    </div>
  )
}
