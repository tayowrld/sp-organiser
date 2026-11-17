'use client'

import { ArrowRight, Bell, CalendarDays, CheckCircle2, ChevronRight, Clock3, CloudOff, History, ImagePlus, List, Plus, RefreshCw, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { clearLocal, readLocal, writeLocal, changeQueue, type Pending } from './storage'
import TaskCalendar from './TaskCalendar'
import { projectTasks } from './projection'
import { PhotoField, RecipientFields, ResultForm } from './Controls'
import { readPhoto } from './photo'
import type { snapshot, Task } from '../operations'

type Data = Omit<ReturnType<typeof snapshot>, 'events' | 'notices' | 'acknowledgements' | 'shifts' | 'templates' | 'handovers' | 'notifications'> & {
  events: { id: number; task_id: number; name: string; action: string; comment: string; has_photo: number; created_at: number }[]
  notices: { id: number; title: string; content: string; category: string; acknowledged: number; read_count: number }[]
  acknowledgements: { update_id: number; name: string }[]
  shifts: { id: number; title: string; starts_at: number; ends_at: number; owner_id: number; created_by: number; closed_at: number | null }[]
  templates: { id: number; title: string; items: string; time: string; active: number }[]
  handovers: { id: number; task_id: number; from_id: number; to_id: number; from_name: string; to_name: string; note: string; accepted_at: number | null }[]
  notifications: { id: number; message: string; created_at: number; read_at: number | null }[]
}
const date = (value: number | string) => typeof value === 'number' ? new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }) : value
const primaryTabs = ['Задачи', 'Смены', 'Объявления', 'Уведомления']
const moreTabs = ['Передача', 'Отделы', 'История']
const actionLabels: Record<string, string> = { superadmin: 'Изменить права главного администратора', initiative: 'Создать инициативу', edit: 'Изменить задачу', delete: 'Удалить задачу', requestDelete: 'Попросить удалить', denyDelete: 'Отклонить удаление', reschedule: 'Изменить срок', accept: 'Принять', complete: 'Завершить', problem: 'Проблема', approve: 'Подтвердить', reject: 'Вернуть', takeover: 'Принять передачу', handover: 'Передать', create: 'Создать задачу', ack: 'Ознакомлен', publish: 'Опубликовать', template: 'Создать чек-лист', shift: 'Создать смену', closeShift: 'Закрыть смену', cancelHandover: 'Отменить передачу', toggleTemplate: 'Изменить расписание', read: 'Прочитать' }

export default function Workspace() {
  const [serverData, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState('Задачи')
  const [view, setView] = useState('Список')
  const [selectedTask, setSelectedTask] = useState<number | null>(null)
  const [grouped, setGrouped] = useState(true)
  const [message, setMessage] = useState('Загрузка…')
  const [toastVisible, setToastVisible] = useState(false)
  const [pending, setPending] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [initiativeOpen, setInitiativeOpen] = useState(false)
  const [filter, setFilter] = useState('active')
  const [department, setDepartment] = useState('')
  const [now, setNow] = useState(0)
  const lock = useRef(false)
  const state = useRef<Data | null>(null)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/work', { cache: 'no-store' })
    if (response.status === 401) {
      state.current = null
      setData(null)
      throw new Error('Сессия закончилась. Войдите снова.')
    }
    if (!response.ok) throw new Error('Сервер временно недоступен')
    const next = await response.json() as Data
    const previous = await readLocal<Data>('snapshot')
    if (previous && previous.user.id !== next.user.id) await clearLocal()
    await writeLocal('snapshot', next)
    state.current = next
    setData(next)
    setOffline(false)
    setNow(Date.now())
    return next
  }, [])

  const sync = useCallback(async (showSuccess = false) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    try {
      const current = await refresh()
      const queue = await readLocal<Pending[]>('queue') || []
      while (queue.length) {
        const operation = queue[0]
        if (operation.userId !== current.user.id) throw new Error('Очередь другого аккаунта не отправлена')
        const response = await fetch('/api/work', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation) })
        if (!response.ok) {
          const result = await response.json().catch(() => ({ error: 'Сервер отклонил действие' })) as { error?: string }
          throw new Error(`${result.error || 'Сервер отклонил действие'} Действие сохранено в очереди. Проверьте данные и повторите его.`)
        }
        queue.shift()
        setPending(await changeQueue(items => items.filter(item => item.id !== operation.id)))
      }
      await refresh()
      setMessage('Все изменения сохранены')
      setToastVisible(showSuccess)
    } catch (error) {
      setOffline(!navigator.onLine)
      setMessage(error instanceof TypeError ? 'Нет соединения с сервером. Изменения остаются на устройстве.' : error instanceof Error ? error.message : 'Не удалось выполнить синхронизацию.')
      if (!navigator.onLine) setMessage('Нет сети. Данные доступны с последней синхронизации, действия сохраняются на устройстве.')
      setToastVisible(true)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }, [refresh])

  useEffect(() => {
    let mounted = true
    async function start() {
      try {
        const cached = await readLocal<Data>('snapshot')
        const params = new URLSearchParams(window.location.search)
        if (params.get('tab') === 'announcements') setTab('Объявления')
        if (params.get('tab') === 'departments') setTab('Отделы')
        if (params.get('tab') === 'notifications') setTab('Уведомления')
        if (params.get('view') === 'calendar') setView('Календарь')
        if (params.has('create')) setCreateOpen(true)
        if (params.has('task')) setSelectedTask(Number(params.get('task')))
        if (!mounted) return
        if (cached) { state.current = cached; setData(cached) }
        setPending(await readLocal<Pending[]>('queue') || [])
        await sync()
      } catch { setMessage('Хранилище устройства недоступно. Разрешите сохранение данных в браузере.'); setToastVisible(true) }
    }
    void start()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') { setNow(Date.now()); void sync() } }, 15000)
    const online = () => { void sync(true) }
    const focus = () => { if (document.visibilityState === 'visible') void sync() }
    const workerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'work-refresh') { setTab('Уведомления'); void sync(true) }
    }
    window.addEventListener('online', online)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    navigator.serviceWorker?.addEventListener('message', workerMessage)
    return () => {
      mounted = false
      clearInterval(timer)
      window.removeEventListener('online', online)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', focus)
      navigator.serviceWorker?.removeEventListener('message', workerMessage)
    }
  }, [sync])

  useEffect(() => {
    if (!toastVisible || pending.length || offline || /не |ошиб|недоступ|укажите|заполните|нужн|сессия/i.test(message)) return
    const timer = setTimeout(() => setToastVisible(false), 4500)
    return () => clearTimeout(timer)
  }, [message, offline, pending.length, toastVisible])

  useEffect(() => {
    if (selectedTask === null) return
    const overflow = document.body.style.overflow
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedTask(null) }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', close)
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', close) }
  }, [selectedTask])

  async function submit(kind: string, form: FormData, extra: Record<string, unknown> = {}) {
    if (!state.current || lock.current) return
    lock.current = true
    setBusy(true)
    try {
      const fields: Record<string, unknown> = Object.fromEntries(form.entries())
      const file = form.get('photo')
      delete fields.photo
      delete fields.action
      if (file instanceof File && file.size) fields.photo = await readPhoto(file)
      const localTask = serverData?.tasks.find(task => task.id === extra.task && task.id < 0)
      const operation = { ...fields, ...extra, ...(localTask ? { taskOperation: localTask.client_id } : {}), id: crypto.randomUUID(), kind, userId: state.current.user.id } as Pending
      setPending(await changeQueue(queue => [...queue, operation]))
      setMessage('Действие сохранено на устройстве и ожидает отправки')
      setToastVisible(true)
    } catch (error) {
      setMessage(error instanceof DOMException ? 'Не удалось сохранить действие. Проверьте доступное место и разрешения браузера.' : error instanceof Error ? error.message : 'Не удалось сохранить действие на устройстве')
      setToastVisible(true)
    } finally { lock.current = false; setBusy(false) }
    if (navigator.onLine) await sync(true)
  }

  async function removePending(id: string) {
    if (lock.current) return
    setPending(await changeQueue(queue => queue.filter(item => item.id !== id)))
    setMessage('Действие удалено из очереди. Можно повторить его с актуальными данными.')
    setToastVisible(true)
  }

  const data = serverData ? { ...serverData, tasks: projectTasks(serverData.tasks, pending, serverData.user.id) } : null

  async function enablePush() {
    try {
      if (!data?.pushKey) throw new Error('Уведомления ещё не настроены на сервере')
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Браузер не поддерживает push. На iPhone откройте установленное приложение с экрана «Домой».')
      if (await Notification.requestPermission() !== 'granted') throw new Error('Разрешите уведомления в настройках браузера')
      const registration = await navigator.serviceWorker.ready
      const key = Uint8Array.from(atob(data.pushKey.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      const response = await fetch('/api/work', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'subscribe', userId: data.user.id, subscription: subscription.toJSON() }) })
      if (!response.ok) throw new Error('Не удалось сохранить подписку')
      setMessage('Push-уведомления включены')
      setToastVisible(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось включить уведомления'); setToastVisible(true) }
  }

  const send = (kind: string, extra: Record<string, unknown>) => void submit(kind, new FormData(), extra)
  if (!data) return <div className='section-page'><h1>Рабочая смена</h1><p role='status'>{message}</p><a href='/login'>Войти в аккаунт</a><button onClick={() => void sync(true)}>Повторить загрузку</button></div>
  const manager = data.user.manager
  const names = (id: number) => data.people.find(person => person.id === id)?.name || `Сотрудник №${id}`
  const overdue = (task: Task) => task.workflow !== 'выполнена' && typeof task.deadline === 'number' && task.deadline < (now || data.generatedAt)
  const shownTasks = data.tasks.filter(task => (!department || task.department_id === Number(department) || data.people.find(person => person.id === task.assigned_to)?.department === Number(department)) && (filter === 'all' || filter === 'mine' && task.claimed && task.assigned_to === data.user.id || filter === 'overdue' && overdue(task) || filter === 'review' && task.workflow === 'на проверке' || filter === 'active' && (task.workflow !== 'выполнена' || pending.some(item => item.task === task.id))))
  const unread = data.notifications.filter(item => !item.read_at).length
  const selected = selectedTask === null ? null : data.tasks.find(task => task.id === selectedTask)

  function reminderField(value: number | null = null) {
    return <label>Уведомить заранее<select name='reminder_hours' defaultValue={value ?? 'previous-day'}><option value='previous-day'>Накануне в 12:00 (Москва)</option>{[0, 1, 4, 12, 24, 48, 72, 168, ...(value !== null ? [value] : [])].filter((hours, index, all) => all.indexOf(hours) === index).sort((a, b) => a - b).map(hours => <option key={hours} value={hours}>{hours === 0 ? 'В момент срока' : `За ${hours} ч`}</option>)}</select><small>Повторять каждые 4 часа до завершения задачи.</small></label>
  }

  function openCreate() {
    if (manager) setCreateOpen(true)
    else setInitiativeOpen(true)
    requestAnimationFrame(() => document.getElementById(manager ? 'create-task' : 'create-initiative')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function taskSummary(task: Task) {
    const departmentName = task.department_id ? data!.departments.find(item => item.id === task.department_id)?.name : ''
    return <button className='work-task-summary' key={task.id} onClick={() => setSelectedTask(task.id)}>
      <span className={`work-task-state ${overdue(task) ? 'urgent' : ''}`} aria-hidden='true' />
      <span className='work-summary-content'><span className='work-summary-top'><strong>{task.title}</strong><span className='work-status'>{task.workflow}</span></span><span className='work-summary-meta'>{date(task.deadline)} · {task.claimed ? names(task.assigned_to) : departmentName || 'Без исполнителя'}</span><span className='work-summary-description'>{task.description}</span></span>
      <ChevronRight size={19} aria-hidden='true' />
    </button>
  }

  function taskCard(task: Task) {
    const owner = task.claimed && task.assigned_to === data!.user.id
    const reviewer = task.assigned_to !== data!.user.id && (data!.user.is_superadmin || task.created_by === data!.user.id || data!.people.find(person => person.id === task.assigned_to)?.assignable)
    const waiting = data!.handovers.find(item => item.task_id === task.id && !item.accepted_at)
    const queued = task.id < 0 || pending.some(item => item.task === task.id || item.taskOperation && item.taskOperation === task.client_id)
    const editable = task.created_by === data!.user.id
    const events = data!.events.filter(event => event.task_id === task.id)
    const photos = events.filter(event => event.has_photo)
    return <article className='work-task-detail' key={task.id}>
      <div className='work-heading'><div className='work-task-title'><span className='work-task-mark'><CheckCircle2 size={19} /></span><h2 id='task-dialog-title'>{task.title}</h2></div><span className={overdue(task) ? 'work-status urgent' : 'work-status'}>{task.workflow}{overdue(task) ? ' · Просрочена' : ''}</span></div>
      <p className='work-meta'>{task.initiative ? 'Личная инициатива' : `Поручение · ${names(task.created_by)}`}</p>
      <p className='work-description'>{task.description}</p>
      <div className='work-facts'><span><Clock3 size={15} />{date(task.deadline)}</span><span>{task.priority} приоритет</span><span>{task.department_id ? data!.departments.find(item => item.id === task.department_id)?.name + ' · ' : ''}{task.claimed ? names(task.assigned_to) : 'Ожидает ответственного'}</span></div>
      {task.require_comment || task.require_photo || task.require_review ? <p className='work-requirements'>Для результата: {[task.require_comment && 'комментарий', task.require_photo && 'фотография', task.require_review && 'проверка руководителем'].filter(Boolean).join(', ')}</p> : null}
      {queued && <p className='work-queued' role='status'>Ожидаемый результат. Изменения ещё не подтверждены сервером.</p>}
      {typeof task.deadline === 'string' && <p role='alert'>Руководителю нужно указать точную дату для расчёта просрочки.</p>}
      {photos.length > 0 && <div className='work-attachments' aria-label='Фотографии задачи'>{photos.map(event => <a href={`/api/photos/${event.id}`} target='_blank' rel='noreferrer' key={event.id}><img src={`/api/photos/${event.id}`} alt={event.action} loading='lazy' /><span><ImagePlus size={14} />{event.action}</span></a>)}</div>}
      <div className='work-detail-columns'>
        <aside className='work-history'><h3><History size={17} />История <span>{events.length}</span></h3>{events.map(event => <div className='work-event' key={event.id}><b>{event.action}</b><p>{event.name} · {date(event.created_at)}</p>{event.comment && <p>{event.comment}</p>}{event.has_photo ? <a href={`/api/photos/${event.id}`} target='_blank' rel='noreferrer'>Открыть фотографию</a> : null}</div>)}{!events.length && <p>Записей пока нет.</p>}</aside>
        <div className='work-task-actions'><fieldset disabled={busy}>
          {task.workflow === 'новая' && (owner || !task.claimed && data!.departments.some(item => item.id === task.department_id)) ? <button className='work-main-action' onClick={() => send('accept', { task: task.id, version: task.version })}>Принять в работу<ArrowRight size={17} /></button> : null}
          {(owner && task.workflow !== 'выполнена' || reviewer && task.workflow === 'на проверке') ? <section className='work-result-panel'><h3>{reviewer && task.workflow === 'на проверке' ? 'Проверка результата' : 'Результат или проблема'}</h3><ResultForm task={task} owner={Boolean(owner)} reviewer={Boolean(reviewer)} busy={busy} onSubmit={submit} /></section> : null}
          {editable && <details><summary>Изменить задачу</summary><form className='work-form' action={form => submit('edit', form, { task: task.id, version: task.version })}><label>Название<input name='title' required maxLength={200} defaultValue={task.title} /></label><label>Описание<textarea name='description' required maxLength={4000} defaultValue={task.description} /></label><label>Срок (Москва)<input type='datetime-local' name='deadline' required defaultValue={typeof task.deadline === 'number' ? new Date(task.deadline + 10800000).toISOString().slice(0, 16) : ''} /></label>{reminderField(task.reminder_hours)}<label>Приоритет<select name='priority' defaultValue={task.priority}><option>низкий</option><option>средний</option><option>высокий</option></select></label><button>Сохранить задачу</button></form></details>}
          {editable && <details><summary>Перенести срок с пояснением</summary><form className='work-form' action={form => submit('reschedule', form, { task: task.id, version: task.version })}><label>Новый срок (Москва)<input type='datetime-local' name='deadline' required /></label><label>Причина<textarea name='comment' required /></label><button>Сохранить срок</button></form></details>}
          {Boolean(task.deletion_requested) && <div className='work-handover'><p>Запрошено удаление. Причина указана в истории.</p>{editable && <form className='work-form' action={form => submit('denyDelete', form, { task: task.id, version: task.version })}><label>Причина отказа<textarea name='comment' required /></label><button>Отклонить запрос</button></form>}</div>}
          {owner && !editable && !task.deletion_requested && <details><summary>Попросить автора удалить</summary><form className='work-form' action={form => submit('requestDelete', form, { task: task.id, version: task.version })}><label>Причина<textarea name='comment' required maxLength={4000} /></label><button>Отправить запрос</button></form></details>}
          {owner && !task.initiative && task.workflow !== 'выполнена' && !waiting ? <details><summary>Передать ответственность</summary><form className='work-form' action={form => submit('handover', form, { task: task.id, version: task.version })}><label>Кто принимает<select name='employee' required defaultValue=''><option value=''>Выберите сотрудника</option>{data!.people.filter(person => person.id !== data!.user.id).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Что произошло и что осталось сделать<textarea name='comment' required maxLength={4000} /></label><button>Предложить передачу</button></form></details> : null}
          {waiting && <div className='work-handover'><p>{waiting.from_name} → {waiting.to_name}</p><p>{waiting.note}</p><p>Ответственность остаётся у передающего до принятия.</p>{waiting.to_id === data!.user.id && <button onClick={() => send('takeover', { task: task.id, version: task.version })}>Принимаю ответственность</button>}{owner ? <button className='secondary' onClick={() => send('cancelHandover', { task: task.id, version: task.version })}>Отменить передачу</button> : null}</div>}
          {editable && <details className='work-danger'><summary>Удалить задачу</summary><p>Задача исчезнет из рабочих списков.</p><button className='secondary' onClick={() => { if (window.confirm('Удалить задачу?')) send('delete', { task: task.id, version: task.version }) }}>Подтвердить удаление</button></details>}
        </fieldset></div>
      </div>
    </article>
  }

  const requirements = <div className='work-checks'><label><input type='checkbox' name='require_comment' /> Нужен комментарий</label><label><input type='checkbox' name='require_photo' /> Нужна фотография</label><label><input type='checkbox' name='require_review' /> Проверка руководителем</label></div>

  return <div className='section-page work-page'>
    <header className='work-hero'><div><p className='work-kicker'><Sparkles size={14} /> ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</p><h1>Работа команды<span>.</span></h1><p>Задачи, ответственность и история — в одном месте.</p></div><div className='work-hero-count'><span>ОТКРЫТЫХ ЗАДАЧ</span><strong>{String(data.tasks.filter(task => task.workflow !== 'выполнена').length).padStart(2, '0')}</strong></div><div className='work-hero-actions'><button className='icon-button' aria-label={`Уведомления${unread ? `: ${unread} непрочитанных` : ''}`} onClick={() => setTab('Уведомления')}><Bell size={20} />{unread > 0 && <span>{unread}</span>}</button><button onClick={openCreate}><Plus size={18} />Новая задача</button></div></header>
    <nav className='work-tabs' aria-label='Разделы работы'>{primaryTabs.map(item => <button aria-pressed={tab === item} className={tab === item ? 'selected' : ''} key={item} onClick={() => setTab(item)}>{item}{item === 'Уведомления' && unread > 0 ? <span className='tab-badge'>{unread}</span> : null}</button>)}<select aria-label='Другие разделы' className={moreTabs.includes(tab) ? 'selected' : ''} value={moreTabs.includes(tab) ? tab : ''} onChange={event => { if (event.target.value) setTab(event.target.value) }}><option value=''>Ещё</option>{moreTabs.map(item => <option key={item}>{item}</option>)}</select></nav>
    {tab === 'Задачи' && <>
      <div className='work-section-heading'><div><p>ВАШ ПЛАН</p><h2>Задачи <span>{shownTasks.length}</span></h2></div><div className='view-switch' aria-label='Вид задач'><button className={view === 'Список' ? 'selected' : ''} aria-pressed={view === 'Список'} onClick={() => setView('Список')}><List size={17} />Список</button><button className={view === 'Календарь' ? 'selected' : ''} aria-pressed={view === 'Календарь'} onClick={() => setView('Календарь')}><CalendarDays size={17} />Календарь</button></div></div>
      <div className='work-filters'><label>Показать<select value={filter} onChange={event => setFilter(event.target.value)}><option value='active'>Незавершённые</option><option value='mine'>Мои</option><option value='overdue'>Просроченные</option><option value='review'>На проверке</option><option value='all'>Все</option></select></label><label>Отдел<select value={department} onChange={event => setDepartment(event.target.value)}><option value=''>Все доступные</option>{data.departments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{Boolean(data.user.is_superadmin) && <label className='work-grouped'><input type='checkbox' checked={grouped} onChange={event => setGrouped(event.target.checked)} />Группировать по отделам</label>}</div>
      <details id='create-initiative' className='content-card work-create' open={initiativeOpen} onToggle={event => setInitiativeOpen(event.currentTarget.open)}><summary><Plus size={17} />Создать личную инициативу</summary><form className='work-form' action={form => submit('initiative', form)}><fieldset disabled={busy}><p>Видна только вам. Можно менять и удалять без согласования.</p><label>Название<input name='title' required maxLength={200} /></label><label>Описание<textarea name='description' required maxLength={4000} /></label><label>Срок (Москва)<input name='deadline' type='datetime-local' required /></label>{reminderField()}<label>Приоритет<select name='priority' defaultValue='средний'><option>низкий</option><option>средний</option><option>высокий</option></select></label><PhotoField /><button>Создать инициативу</button></fieldset></form></details>
      {manager && <details id='create-task' className='content-card work-create' open={createOpen} onToggle={event => setCreateOpen(event.currentTarget.open)}><summary><Plus size={17} />Назначить задачу</summary><form className='work-form' action={form => submit('create', form)}><fieldset disabled={busy}><RecipientFields people={data.people} departments={data.departments} /><label>Название<input name='title' required maxLength={200} /></label><label>Описание<textarea name='description' required maxLength={4000} /></label><label>Срок (Москва)<input name='deadline' type='datetime-local' required /></label>{reminderField()}<label>Приоритет<select name='priority' defaultValue='средний'><option>низкий</option><option>средний</option><option>высокий</option></select></label><label>Смена<select name='shift'><option value=''>Без смены</option>{data.shifts.filter(shift => !shift.closed_at && (data.user.is_superadmin || shift.created_by === data.user.id || shift.owner_id === data.user.id)).map(shift => <option key={shift.id} value={shift.id}>{shift.title} · {date(shift.starts_at)}</option>)}</select></label><PhotoField />{requirements}<button>Назначить задачу</button></fieldset></form></details>}
      {view === 'Календарь' ? <TaskCalendar tasks={shownTasks} today={now || data.generatedAt} onSelect={setSelectedTask} /> : data.user.is_superadmin && grouped ? [...data.departments, { id: 0, name: 'Без отдела / Личные инициативы', assignable: false }].map(group => {
        const tasks = shownTasks.filter(task => (task.initiative ? 0 : task.department_id || data.people.find(person => person.id === task.assigned_to)?.department || 0) === group.id)
        return tasks.length ? <section className='work-task-group' key={group.id}><h2>{group.name}<span>{tasks.length}</span></h2><div className='work-task-list'>{tasks.map(taskSummary)}</div></section> : null
      }) : <div className='work-task-list'>{shownTasks.map(taskSummary)}</div>}{!shownTasks.length && <div className='work-empty'><CheckCircle2 size={28} /><h3>Здесь пока спокойно</h3><p>Задач по выбранному фильтру нет.</p></div>}
    </>}
    {tab === 'Смены' && <>
      {manager && <details className='content-card work-create'><summary><Plus size={17} />Запланировать смену</summary><form className='work-form' action={form => submit('shift', form)}><fieldset disabled={busy}><label>Название<input name='title' required maxLength={200} placeholder='Утренняя смена' /></label><label>Ответственный<select name='employee' required><option value=''>Выберите</option>{data.people.filter(person => person.assignable).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Начало (Москва)<input name='start' type='datetime-local' required /></label><label>Окончание (Москва)<input name='end' type='datetime-local' required /></label><button>Создать смену</button></fieldset></form></details>}
      <div className='work-card-grid'>{data.shifts.map(shift => <article key={shift.id} className='content-card'><h2>{shift.title}</h2><span className='work-status'>{shift.closed_at ? 'Закрыта' : 'Открыта'}</span><p>{date(shift.starts_at)} — {date(shift.ends_at)}</p><p>Ответственный: {names(shift.owner_id)}</p>{data.tasks.filter(task => task.shift_id === shift.id).map(task => <button className='secondary work-linked-task' key={task.id} onClick={() => setSelectedTask(task.id)}>{task.title}<ChevronRight size={15} /></button>)}{!shift.closed_at && (data.user.is_superadmin || shift.owner_id === data.user.id || shift.created_by === data.user.id) && <button disabled={busy} onClick={() => send('closeShift', { shift: shift.id })}>Закрыть смену</button>}</article>)}</div>
      {!data.shifts.length && <p>Смены ещё не запланированы.</p>}
      {manager && <details className='content-card work-create'><summary><Plus size={17} />Ежедневный чек-лист</summary><form className='work-form' action={form => submit('template', form)}><fieldset disabled={busy}><RecipientFields people={data.people} departments={data.departments} /><label>Название процедуры<input name='title' required placeholder='Открытие зала / Подготовка кухни / Уборка / Закрытие' maxLength={200} /></label><label>Пункты, каждый с новой строки<textarea name='items' required rows={5} maxLength={4000} placeholder={'Проверить чистоту\nПодготовить рабочие места\nПроверить оборудование'} /></label><label>Ежедневный срок (Москва)<input name='time' type='time' required /></label><label><input type='checkbox' name='require_review' /> Проверка руководителем</label><button>Включить ежедневное повторение</button></fieldset></form></details>}
      {data.templates.map(template => <article className='content-card' key={template.id}><h2>{template.title}</h2><p>Каждый день до {template.time} (Москва) · {template.active ? 'Включён' : 'Приостановлен'}</p><p className='work-description'>{template.items}</p><button disabled={busy} className='secondary' onClick={() => send('toggleTemplate', { template: template.id })}>{template.active ? 'Приостановить' : 'Возобновить'}</button></article>)}
    </>}
    {tab === 'Передача' && <><div className='work-section-heading'><div><p>ОТВЕТСТВЕННОСТЬ</p><h2>Передача задач</h2></div></div><p className='work-section-description'>Откройте задачу, опишите ситуацию и выберите принимающего. Передача вступит в силу после его подтверждения.</p><div className='work-task-list'>{data.tasks.filter(task => task.workflow !== 'выполнена').map(taskSummary)}</div>{!data.tasks.some(task => task.workflow !== 'выполнена') && <p>Незавершённых задач нет.</p>}</>}
    {tab === 'Объявления' && <>
      {manager && <details className='content-card work-create'><summary><Plus size={17} />Опубликовать объявление</summary><form className='work-form' action={form => submit('publish', form)}><fieldset disabled={busy}><label>Заголовок<input name='title' required maxLength={200} /></label><label>Сообщение<textarea name='content' required maxLength={4000} /></label><label>Категория<select name='category'><option>объявление</option><option>срочное</option><option>инструкция</option></select></label><button>Опубликовать</button></fieldset></form></details>}
      <div className='work-card-grid'>{data.notices.map(notice => <article key={notice.id} className='content-card'><span className='work-meta'>{notice.category}</span><h2>{notice.title}</h2><p className='work-description'>{notice.content}</p><button disabled={busy || Boolean(notice.acknowledged) || pending.some(item => item.notice === notice.id)} onClick={() => send('ack', { notice: notice.id })}>{notice.acknowledged ? 'Вы ознакомлены' : 'Ознакомлен'}</button>{manager && <details><summary>Ознакомились: {notice.read_count}</summary>{data.acknowledgements.filter(item => item.update_id === notice.id).map((item, index) => <p key={index}>{item.name}</p>)}</details>}</article>)}</div>
    </>}
    {tab === 'Отделы' && <><div className='work-section-heading'><div><p>СТРУКТУРА КОМАНДЫ</p><h2>Отделы</h2></div></div><div className='work-card-grid'>{data.departments.map(item => {
      const tasks = data.tasks.filter(task => task.department_id === item.id || data.people.find(person => person.id === task.assigned_to)?.department === item.id)
      return <article key={item.id} className='content-card'><h2>{item.name}</h2><p>Открыто: {tasks.filter(task => task.workflow !== 'выполнена').length} · Просрочено: {tasks.filter(overdue).length} · На проверке: {tasks.filter(task => task.workflow === 'на проверке').length} · Выполнено: {tasks.filter(task => task.workflow === 'выполнена').length}</p><p>{data.people.filter(person => person.department === item.id).map(person => person.name).join(', ') || 'Сотрудники не назначены'}</p><button onClick={() => { setDepartment(String(item.id)); setFilter('all'); setTab('Задачи') }}>Открыть задачи отдела</button></article>
    })}</div>{!data.departments.length && <p>Отдел не назначен. Обратитесь к администратору.</p>}</>}
    {tab === 'История' && <><div className='work-section-heading'><div><p>ДЕЙСТВИЯ КОМАНДЫ</p><h2>Журнал изменений</h2></div></div><div className='work-activity'>{data.activity.map(event => <article key={event.id}><span>{actionLabels[event.kind] || 'Изменение срока'}</span><p>{event.name}</p><small>{date(event.created_at)}</small></article>)}</div>{!data.activity.length && <p>Изменений пока нет.</p>}</>}
    {tab === 'Уведомления' && <><div className='work-section-heading'><div><p>ЧТО ИЗМЕНИЛОСЬ</p><h2>Уведомления {unread > 0 && <span>{unread}</span>}</h2></div><button className='secondary' disabled={busy} onClick={() => void enablePush()}>Включить push</button></div>{data.notifications.length > 0 && unread > 0 && <button className='secondary' disabled={busy} onClick={() => send('read', { notification: data.notifications[0].id })}>Отметить все прочитанными</button>}<div className='notification-list'>{data.notifications.map(item => <article className={item.read_at ? 'read' : 'unread'} key={item.id}><span className='notification-dot' aria-hidden='true' /><div><p>{item.message}</p><small>{date(item.created_at)}</small></div>{!item.read_at && <button className='secondary' disabled={busy} onClick={() => send('read', { notification: item.id })}>Прочитано</button>}</article>)}</div>{!data.notifications.length && <p>Уведомлений пока нет.</p>}</>}
    <section className='work-bottom' aria-label='Состояние синхронизации'>
      {pending.length > 0 && <details id='sync-queue' className='content-card work-queue'><summary>Очередь действий <span>{pending.length}</span></summary>{pending.map(operation => <div key={operation.id} className='work-heading'><span>{actionLabels[operation.kind] || 'Действие'}{operation.task ? ` · задача №${operation.task}` : ''}</span><button disabled={busy} className='secondary' onClick={() => void removePending(operation.id)}>Удалить</button></div>)}</details>}
      <div className='work-sync' role='status'><span className='work-sync-icon'>{offline ? <CloudOff size={17} /> : <CheckCircle2 size={17} />}</span><div><span>{offline ? 'Без сети' : busy ? 'Синхронизация…' : 'Данные синхронизируются автоматически'}</span><small>Обновлено {date(data.generatedAt)}{pending.length > 0 ? ` · Ожидают отправки: ${pending.length}` : ''}</small></div><button className='work-refresh' disabled={busy} onClick={() => void sync(true)} aria-label='Синхронизировать сейчас'><RefreshCw size={17} /></button></div>
    </section>
    {selected && <div className='task-dialog-backdrop' onMouseDown={event => { if (event.target === event.currentTarget) setSelectedTask(null) }}><section className='task-dialog' role='dialog' aria-modal='true' aria-labelledby='task-dialog-title'><button className='task-dialog-close icon-button' aria-label='Закрыть задачу' onClick={() => setSelectedTask(null)}><X size={21} /></button>{taskCard(selected)}</section></div>}
    {toastVisible && <div className='work-toast' role={offline || /не |ошиб|недоступ|укажите|заполните|нужн|сессия/i.test(message) ? 'alert' : 'status'}><span>{message}</span>{pending.length > 0 && <button className='secondary' onClick={() => { document.getElementById('sync-queue')?.scrollIntoView({ behavior: 'smooth' }); setToastVisible(false) }}>Очередь</button>}<button className='icon-button' aria-label='Закрыть сообщение' onClick={() => setToastVisible(false)}><X size={17} /></button></div>}
  </div>
}
