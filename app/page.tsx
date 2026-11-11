import { formatDeadline } from './dates'
import Link from 'next/link'
import { ArrowUpRight, ArrowRight, Plus, Check, ClipboardList, Radio } from 'lucide-react'
import { getUser } from './auth/actions'
import db from './db'
import { displayStatus } from './operations'

export const dynamic = 'force-dynamic'

type Task = { id: number; title: string; deadline: number | string; status: string; priority: string; assigned_to: number; name: string }
type Notice = { id: number; title: string; category: string }

export default async function HomePage() {
  const user = await getUser()
  const manager = Boolean(user && (user.is_superadmin || db.prepare('SELECT id FROM users WHERE manager_id = ? AND is_active = 1 LIMIT 1').get(user.id)))
  const tasks = user ? db.prepare(`SELECT t.*, u.name FROM tasks t JOIN users u ON u.id = t.assigned_to WHERE t.deleted = 0 AND (t.initiative = 0 OR t.created_by = ${user.id}) AND ${user?.is_superadmin ? 't.assigned_to != ?' : manager ? '(u.manager_id = ? OR t.assigned_to = ?)' : 't.assigned_to = ?'} ORDER BY CASE t.status WHEN 'просрочена' THEN 0 WHEN 'в работе' THEN 1 WHEN 'новая' THEN 2 ELSE 3 END, t.id DESC`).all(...(manager && !user.is_superadmin ? [user.id, user.id] : [user.id])) as Task[] : []
  tasks.forEach((task, index) => { tasks[index] = displayStatus(task) })
  const notices = user ? db.prepare('SELECT id, title, category FROM updates ORDER BY id DESC LIMIT 3').all() as Notice[] : []
  const done = tasks.filter(task => task.status === 'выполнена').length
  const overdue = tasks.filter(task => task.status === 'просрочена').length
  const active = tasks.filter(task => task.status !== 'выполнена')
  const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0
  const destination = '/work'
  const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Moscow' }).format(new Date())

  return (
    <div className='dashboard'>
      <div className='page-eyebrow'><span><i /> СП ОРГАНИЗАТОР</span><span>{date}</span></div>
      <section className='overview-heading'>
        <div><p className='greeting'>{user ? `Здравствуйте, ${user.name.split(' ')[0]}` : 'Добро пожаловать'}</p><h1>Обзор <span>задач</span></h1></div>
        <Link href={user ? manager ? '/management/new' : '/calendar' : '/login'} className='primary-action'>{manager ? <Plus size={18} /> : <ArrowRight size={18} />}{user ? manager ? 'Назначить задачу' : 'К моим задачам' : 'Войти в команду'}</Link>
      </section>
      <section className='overview-grid' aria-label='Сводка задач'>
        <Link href={destination} className='metric-card'><div className='card-kicker'>В РАБОТЕ<ClipboardList size={18} /></div><strong>{String(active.length).padStart(2, '0')}<span>задач</span></strong><p>Открыть список задач <ArrowUpRight size={17} /></p></Link>
        <Link href={destination} className='metric-card attention'><div className='card-kicker'>ТРЕБУЮТ ВНИМАНИЯ<Radio size={18} /></div><strong>{String(overdue).padStart(2, '0')}<span>просрочено</span></strong><p>{overdue ? 'Проверьте сроки выполнения' : 'Просроченных задач нет'}<ArrowUpRight size={17} /></p></Link>
      </section>
      <div className='work-grid'>
        <section className='task-panel'>
          <div className='section-heading'><h2>Текущие задачи <span>{active.length}</span></h2><Link href={destination}>Все задачи <ArrowRight size={16} /></Link></div>
          <div className='task-list'>
            {active.slice(0, 4).map((task, index) => <Link className='focus-task' key={task.id} href='/work'><span className='task-index'>{String(index + 1).padStart(2, '0')}</span><div className='task-content'><div className='task-meta'><span className={task.status === 'просрочена' ? 'status-dot urgent' : 'status-dot'}>{task.status}</span><span>{formatDeadline(task.deadline)}</span></div><h3>{task.title}</h3><p><span className='mini-avatar'>{task.name.charAt(0)}</span>{task.name}{task.priority === 'высокий' && <span className='priority-label'>Высокий приоритет</span>}</p></div><ArrowUpRight className='task-arrow' size={20} /></Link>)}
            {active.length === 0 && <div className='empty-focus'><Check size={32} /><h3>{user ? 'Открытых задач нет' : 'Добро пожаловать в организатор'}</h3><p>{user ? 'Все назначенные задачи выполнены.' : 'Войдите, чтобы увидеть задачи, сроки и важные сообщения команды.'}</p><Link href={user ? destination : '/login'}>{user ? 'Открыть задачи' : 'Войти в организатор'} <ArrowRight size={16} /></Link></div>}
          </div>
          <div className='completion'><span><Check size={16} /> Выполнено {done} из {tasks.length}</span><div role='progressbar' aria-label='Выполненные задачи' aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div><b>{progress}%</b></div>
        </section>
        <aside className='notice-panel'><div className='section-heading'><h2>Объявления</h2><Radio size={19} /></div><p className='panel-description'>Важное для всей команды</p>{notices.map(notice => <Link className='notice-item' key={notice.id} href='/important'><span className={notice.category === 'срочное' ? 'notice-category urgent' : 'notice-category'}>{notice.category}</span><h3>{notice.title}</h3><ArrowUpRight size={17} /></Link>)}{notices.length === 0 && <p className='notice-empty'>{user ? 'Новых сообщений пока нет.' : 'Объявления и инструкции будут здесь после входа.'}</p>}<Link className='notice-link' href='/important'>Все объявления <ArrowRight size={17} /></Link></aside>
      </div>
      <footer className='dashboard-footer'><span>СП / ОРГАНИЗАТОР</span><span>Планирование работы ресторана</span></footer>
    </div>
  )
}
