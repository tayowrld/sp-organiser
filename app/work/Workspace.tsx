'use client'

import { ArrowRight, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, History, ImagePlus, List, Plus, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react'
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

function haptic() {
  if ('vibrate' in navigator) navigator.vibrate(12)
}

function SwipeTaskRow({ task, meta, overdue, onOpen, onComplete }: { task: Task; meta: string; overdue: boolean; onOpen: () => void; onComplete: () => void }) {
  const [offset, setOffset] = useState(0)
  const start = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)
  const suppressClick = useRef(false)

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    start.current = { x: event.clientX, y: event.clientY }
    dragging.current = false
    suppressClick.current = false
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const x = event.clientX - start.current.x
    const y = event.clientY - start.current.y
    if (!dragging.current) {
      if (Math.abs(x) < 8 || Math.abs(y) > Math.abs(x)) return
      dragging.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    setOffset(Math.max(-104, Math.min(128, x)))
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return
    const distance = event.clientX - start.current.x
    dragging.current = false
    suppressClick.current = true
    if (distance > 84) {
      haptic()
      setOffset(128)
      window.setTimeout(() => { onComplete(); setOffset(0) }, 180)
    } else if (distance < -64) setOffset(-96)
    else setOffset(0)
  }

  return <div className='work-task-swipe'>
    <div className='swipe-complete' aria-hidden='true'><Check size={20} />Готово</div>
    <div className='swipe-more'><button type='button' tabIndex={offset < 0 ? 0 : -1} onClick={() => { setOffset(0); onOpen() }}>Подробнее<ArrowRight size={16} /></button></div>
    <button className='work-task-summary' style={{ transform: `translate3d(${offset}px, 0, 0)` }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragging.current = false; setOffset(0) }} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return } if (offset) setOffset(0); else onOpen() }}>
      <span className={task.workflow === 'выполнена' ? 'task-check completed' : 'task-check'} aria-hidden='true'>{task.workflow === 'выполнена' && <Check size={14} />}</span>
      <span className='work-summary-content'><span className='work-summary-top'><strong>{task.title}</strong></span><span className='work-summary-meta'>{meta}</span><span className='work-summary-description'>{task.description}</span></span>
      <span className={overdue ? 'work-row-status urgent' : 'work-row-status'} title={task.workflow}><i /><span>{task.workflow}</span></span>
    </button>
  </div>
}

function SwipeNotification({ id, message, createdAt, read, onRead, onHide }: { id: number; message: string; createdAt: string; read: boolean; onRead: () => void; onHide: (id: number) => void }) {
  const [offset, setOffset] = useState(0)
  const start = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)
  const suppressClick = useRef(false)

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const x = event.clientX - start.current.x
    const y = event.clientY - start.current.y
    if (!dragging.current) {
      if (Math.abs(x) < 8 || Math.abs(y) > Math.abs(x)) return
      dragging.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    setOffset(Math.max(-120, Math.min(0, x)))
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return
    const distance = event.clientX - start.current.x
    dragging.current = false
    suppressClick.current = true
    if (distance < -68) {
      haptic()
      setOffset(-120)
      window.setTimeout(() => onHide(id), 180)
    } else setOffset(0)
  }

  return <div className={read ? 'notification-swipe read' : 'notification-swipe unread'}>
    <div className='notification-hide' aria-hidden='true'>Скрыть</div>
    <button className='notification-content' style={{ transform: `translate3d(${offset}px, 0, 0)` }} aria-label={read ? message : `${message}. Отметить прочитанным`} onPointerDown={event => { start.current = { x: event.clientX, y: event.clientY }; dragging.current = false; suppressClick.current = false }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragging.current = false; setOffset(0) }} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return } if (!read) { haptic(); onRead() } }}>
      <span className='notification-dot' aria-hidden='true' /><span className='notification-text'><span className='notification-message'>{message}</span><small>{createdAt}</small></span>
    </button>
  </div>
}

export default function Workspace() {
  const [serverData, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState('Задачи')
  const [view, setView] = useState('Список')
  const [selectedTask, setSelectedTask] = useState<number | null>(null)
  const [message, setMessage] = useState('Загрузка…')
  const [toastVisible, setToastVisible] = useState(false)
  const [pending, setPending] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createKind, setCreateKind] = useState<'create' | 'initiative'>('initiative')
  const [departmentMenu, setDepartmentMenu] = useState(false)
  const [hiddenNotifications, setHiddenNotifications] = useState<number[]>([])
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState('active')
  const [department, setDepartment] = useState('')
  const [now, setNow] = useState(0)
  const lock = useRef(false)
  const state = useRef<Data | null>(null)
  const pullStart = useRef<{ x: number; y: number } | null>(null)

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
        if (params.has('create')) { setCreateKind('create'); setCreateOpen(true) }
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
    if (selectedTask === null && !createOpen) return
    const overflow = document.body.style.overflow
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelectedTask(null); setCreateOpen(false) } }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', close)
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', close) }
  }, [createOpen, selectedTask])

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
  const activeCreateKind = manager ? createKind : 'initiative'
  const names = (id: number) => data.people.find(person => person.id === id)?.name || `Сотрудник №${id}`
  const overdue = (task: Task) => task.workflow !== 'выполнена' && typeof task.deadline === 'number' && task.deadline < (now || data.generatedAt)
  const shownTasks = data.tasks.filter(task => (!department || task.department_id === Number(department) || data.people.find(person => person.id === task.assigned_to)?.department === Number(department)) && (filter === 'all' || filter === 'mine' && task.claimed && task.assigned_to === data.user.id || filter === 'overdue' && overdue(task) || filter === 'review' && task.workflow === 'на проверке' || filter === 'active' && (task.workflow !== 'выполнена' || pending.some(item => item.task === task.id))))
  const unread = data.notifications.filter(item => !item.read_at).length
  const selected = selectedTask === null ? null : data.tasks.find(task => task.id === selectedTask)

  function reminderField(value: number | null = null) {
    return <label>Уведомить заранее<select name='reminder_hours' defaultValue={value ?? 'previous-day'}><option value='previous-day'>Накануне в 12:00 (Москва)</option>{[0, 1, 4, 12, 24, 48, 72, 168, ...(value !== null ? [value] : [])].filter((hours, index, all) => all.indexOf(hours) === index).sort((a, b) => a - b).map(hours => <option key={hours} value={hours}>{hours === 0 ? 'В момент срока' : `За ${hours} ч`}</option>)}</select><small>Повторять каждые 4 часа до завершения задачи.</small></label>
  }

  function openCreate() {
    setCreateKind(manager ? 'create' : 'initiative')
    setCreateOpen(true)
  }

  function completeFromSwipe(task: Task) {
    const canComplete = task.claimed && task.assigned_to === data!.user.id && ['в работе', 'проблема'].includes(task.workflow) && !task.require_comment && !task.require_photo
    if (canComplete) send('complete', { task: task.id, version: task.version, action: 'complete' })
    else setSelectedTask(task.id)
  }

  async function refreshByPull() {
    setRefreshing(true)
    haptic()
    try { await sync(true) }
    finally { setRefreshing(false); setPull(0) }
  }

  function onPullStart(event: ReactTouchEvent<HTMLDivElement>) {
    pullStart.current = window.scrollY <= 0 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null
  }

  function onPullMove(event: ReactTouchEvent<HTMLDivElement>) {
    if (pullStart.current === null || busy) return
    const x = event.touches[0].clientX - pullStart.current.x
    const y = event.touches[0].clientY - pullStart.current.y
    if (Math.abs(x) > Math.abs(y)) { pullStart.current = null; setPull(0); return }
    if (y > 0) setPull(Math.min(88, y * .45))
  }

  function onPullEnd() {
    if (pull > 52 && !busy) void refreshByPull()
    else setPull(0)
    pullStart.current = null
  }

  function taskSummary(task: Task) {
    const departmentName = task.department_id ? data!.departments.find(item => item.id === task.department_id)?.name : ''
    return <SwipeTaskRow key={task.id} task={task} overdue={overdue(task)} meta={`${date(task.deadline)} · ${task.claimed ? names(task.assigned_to) : departmentName || 'Без исполнителя'}`} onOpen={() => setSelectedTask(task.id)} onComplete={() => completeFromSwipe(task)} />
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

  return <div className='section-page work-page' onTouchStart={onPullStart} onTouchMove={onPullMove} onTouchEnd={onPullEnd} onTouchCancel={onPullEnd}>
    {(pull > 0 || refreshing) && <div className={refreshing ? 'work-pull refreshing' : 'work-pull'} role='status' style={{ opacity: refreshing ? 1 : Math.min(1, pull / 40), transform: `translateX(-50%) translateY(${refreshing ? 0 : Math.max(-20, pull - 48)}px)` }}><RefreshCw size={15} /><span>{refreshing ? 'Обновляем…' : pull > 52 ? 'Отпустите для обновления' : 'Потяните для обновления'}</span></div>}
    <header className='work-hero'><div><p className='work-kicker'>Ваше рабочее пространство</p><h1>Работа команды</h1><p>Задачи, ответственность и история — в одном месте.</p></div><div className='work-hero-count'><strong>{data.tasks.filter(task => task.workflow !== 'выполнена').length}</strong><span>открытых</span></div><div className='work-hero-actions'><button className={busy ? 'icon-button work-refresh refreshing' : 'icon-button work-refresh'} disabled={busy} onClick={() => void sync(true)} aria-label='Обновить данные'><RefreshCw size={18} /></button><button className='icon-button' aria-label={`Уведомления${unread ? `: ${unread} непрочитанных` : ''}`} onClick={() => setTab('Уведомления')}><Bell size={20} />{unread > 0 && <span>{unread}</span>}</button></div></header>
    <nav className='work-tabs' aria-label='Разделы работы'>{primaryTabs.map(item => <button aria-pressed={tab === item} className={tab === item ? 'selected' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}<select aria-label='Другие разделы' className={moreTabs.includes(tab) ? 'selected' : ''} value={moreTabs.includes(tab) ? tab : ''} onChange={event => { if (event.target.value) setTab(event.target.value) }}><option value=''>Ещё</option>{moreTabs.map(item => <option key={item}>{item}</option>)}</select></nav>
    {tab === 'Задачи' && <>
      <div className='work-section-heading'><div><h2>Задачи <span>{shownTasks.length}</span></h2></div><div className='view-switch' aria-label='Вид задач'><button className={view === 'Список' ? 'selected' : ''} aria-pressed={view === 'Список'} onClick={() => setView('Список')}><List size={17} /><span>Список</span></button><button className={view === 'Календарь' ? 'selected' : ''} aria-pressed={view === 'Календарь'} onClick={() => setView('Календарь')}><CalendarDays size={17} /><span>Календарь</span></button></div></div>
      <div className='work-filters'><div className='filter-chips' aria-label='Фильтр задач'>{[{ value: 'active', label: 'Незавершённые' }, { value: 'mine', label: 'Мои' }, { value: 'overdue', label: 'Просроченные' }, { value: 'review', label: 'На проверке' }, { value: 'all', label: 'Все' }].map(item => <button key={item.value} className={filter === item.value ? 'filter-chip selected' : 'filter-chip'} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div><div className='department-filter'><button className={department ? 'filter-chip selected' : 'filter-chip'} aria-expanded={departmentMenu} onClick={() => setDepartmentMenu(!departmentMenu)} onContextMenu={event => { event.preventDefault(); haptic(); setDepartmentMenu(true) }}>{department ? data.departments.find(item => item.id === Number(department))?.name : 'Все отделы'}<ChevronDown size={14} /></button>{departmentMenu && <><button className='menu-dismiss' aria-label='Закрыть выбор отдела' onClick={() => setDepartmentMenu(false)} /><div className='filter-menu'><button className={!department ? 'selected' : ''} onClick={() => { setDepartment(''); setDepartmentMenu(false) }}>Все отделы</button>{data.departments.map(item => <button className={department === String(item.id) ? 'selected' : ''} key={item.id} onClick={() => { setDepartment(String(item.id)); setDepartmentMenu(false) }}>{item.name}</button>)}</div></>}</div></div>
      {view === 'Календарь' ? <TaskCalendar tasks={shownTasks} today={now || data.generatedAt} onSelect={setSelectedTask} /> : data.user.is_superadmin ? [...data.departments, { id: 0, name: 'Без отдела / Личные инициативы', assignable: false }].map(group => {
        const tasks = shownTasks.filter(task => (task.initiative ? 0 : task.department_id || data.people.find(person => person.id === task.assigned_to)?.department || 0) === group.id)
        return tasks.length ? <section className='work-task-group' key={group.id}><h2>{group.name}<span>{tasks.length}</span></h2><div className='work-task-list'>{tasks.map(taskSummary)}</div></section> : null
      }) : <div className='work-task-list'>{shownTasks.map(taskSummary)}</div>}{!shownTasks.length && <div className='work-empty'><CheckCircle2 size={28} /><h3>Здесь пока спокойно</h3><p>Задач по выбранному фильтру нет.</p><button onClick={openCreate}><Plus size={17} />Создать задачу</button></div>}
    </>}
    {tab === 'Задачи' && shownTasks.length > 0 && <button className='work-fab' onClick={openCreate} aria-label='Создать задачу'><Plus size={23} /><span>Новая задача</span></button>}
    {tab === 'Смены' && <>
      {manager && <details className='content-card work-create'><summary><Plus size={17} />Запланировать смену</summary><form className='work-form' action={form => submit('shift', form)}><fieldset disabled={busy}><label>Название<input name='title' required maxLength={200} placeholder='Утренняя смена' /></label><label>Ответственный<select name='employee' required><option value=''>Выберите</option>{data.people.filter(person => person.assignable).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Начало (Москва)<input name='start' type='datetime-local' required /></label><label>Окончание (Москва)<input name='end' type='datetime-local' required /></label><button>Создать смену</button></fieldset></form></details>}
      <div className='work-card-grid'>{data.shifts.map(shift => <article key={shift.id} className='content-card'><h2>{shift.title}</h2><span className='work-status'>{shift.closed_at ? 'Закрыта' : 'Открыта'}</span><p>{date(shift.starts_at)} — {date(shift.ends_at)}</p><p>Ответственный: {names(shift.owner_id)}</p>{data.tasks.filter(task => task.shift_id === shift.id).map(task => <button className='secondary work-linked-task' key={task.id} onClick={() => setSelectedTask(task.id)}>{task.title}<ChevronRight size={15} /></button>)}{!shift.closed_at && (data.user.is_superadmin || shift.owner_id === data.user.id || shift.created_by === data.user.id) && <button disabled={busy} onClick={() => send('closeShift', { shift: shift.id })}>Закрыть смену</button>}</article>)}</div>
      {!data.shifts.length && <p>Смены ещё не запланированы.</p>}
      {manager && <details className='content-card work-create'><summary><Plus size={17} />Ежедневный чек-лист</summary><form className='work-form' action={form => submit('template', form)}><fieldset disabled={busy}><RecipientFields people={data.people} departments={data.departments} /><label>Название процедуры<input name='title' required placeholder='Открытие зала / Подготовка кухни / Уборка / Закрытие' maxLength={200} /></label><label>Пункты, каждый с новой строки<textarea name='items' required rows={5} maxLength={4000} placeholder={'Проверить чистоту\nПодготовить рабочие места\nПроверить оборудование'} /></label><label>Ежедневный срок (Москва)<input name='time' type='time' required /></label><label><input type='checkbox' name='require_review' /> Проверка руководителем</label><button>Включить ежедневное повторение</button></fieldset></form></details>}
      {data.templates.map(template => <article className='content-card' key={template.id}><h2>{template.title}</h2><p>Каждый день до {template.time} (Москва) · {template.active ? 'Включён' : 'Приостановлен'}</p><p className='work-description'>{template.items}</p><button disabled={busy} className='secondary' onClick={() => send('toggleTemplate', { template: template.id })}>{template.active ? 'Приостановить' : 'Возобновить'}</button></article>)}
    </>}
    {tab === 'Передача' && <><div className='work-section-heading'><div><h2>Передача задач</h2></div></div><p className='work-section-description'>Откройте задачу, опишите ситуацию и выберите принимающего. Передача вступит в силу после его подтверждения.</p><div className='work-task-list'>{data.tasks.filter(task => task.workflow !== 'выполнена').map(taskSummary)}</div>{!data.tasks.some(task => task.workflow !== 'выполнена') && <p>Незавершённых задач нет.</p>}</>}
    {tab === 'Объявления' && <>
      {manager && <details className='content-card work-create'><summary><Plus size={17} />Опубликовать объявление</summary><form className='work-form' action={form => submit('publish', form)}><fieldset disabled={busy}><label>Заголовок<input name='title' required maxLength={200} /></label><label>Сообщение<textarea name='content' required maxLength={4000} /></label><label>Категория<select name='category'><option>объявление</option><option>срочное</option><option>инструкция</option></select></label><button>Опубликовать</button></fieldset></form></details>}
      <div className='work-card-grid'>{data.notices.map(notice => <article key={notice.id} className='content-card'><span className='work-meta'>{notice.category}</span><h2>{notice.title}</h2><p className='work-description'>{notice.content}</p><button disabled={busy || Boolean(notice.acknowledged) || pending.some(item => item.notice === notice.id)} onClick={() => send('ack', { notice: notice.id })}>{notice.acknowledged ? 'Вы ознакомлены' : 'Ознакомлен'}</button>{manager && <details><summary>Ознакомились: {notice.read_count}</summary>{data.acknowledgements.filter(item => item.update_id === notice.id).map((item, index) => <p key={index}>{item.name}</p>)}</details>}</article>)}</div>
    </>}
    {tab === 'Отделы' && <><div className='work-section-heading'><div><h2>Отделы</h2></div></div><div className='work-card-grid'>{data.departments.map(item => {
      const tasks = data.tasks.filter(task => task.department_id === item.id || data.people.find(person => person.id === task.assigned_to)?.department === item.id)
      return <article key={item.id} className='content-card'><h2>{item.name}</h2><p>Открыто: {tasks.filter(task => task.workflow !== 'выполнена').length} · Просрочено: {tasks.filter(overdue).length} · На проверке: {tasks.filter(task => task.workflow === 'на проверке').length} · Выполнено: {tasks.filter(task => task.workflow === 'выполнена').length}</p><p>{data.people.filter(person => person.department === item.id).map(person => person.name).join(', ') || 'Сотрудники не назначены'}</p><button onClick={() => { setDepartment(String(item.id)); setFilter('all'); setTab('Задачи') }}>Открыть задачи отдела</button></article>
    })}</div>{!data.departments.length && <p>Отдел не назначен. Обратитесь к администратору.</p>}</>}
    {tab === 'История' && <><div className='work-section-heading'><div><h2>Журнал изменений</h2></div></div><div className='work-activity'>{data.activity.map(event => <article key={event.id}><span>{actionLabels[event.kind] || 'Изменение срока'}</span><p>{event.name}</p><small>{date(event.created_at)}</small></article>)}</div>{!data.activity.length && <p>Изменений пока нет.</p>}</>}
    {tab === 'Уведомления' && <><div className='work-section-heading'><div><h2>Уведомления</h2></div><button className='secondary' disabled={busy} onClick={() => void enablePush()}>Включить push</button></div><div className='notification-list'>{data.notifications.filter(item => !hiddenNotifications.includes(item.id)).map(item => <SwipeNotification key={item.id} id={item.id} message={item.message} createdAt={date(item.created_at)} read={Boolean(item.read_at)} onRead={() => send('read', { notification: item.id })} onHide={id => setHiddenNotifications(items => [...items, id])} />)}</div>{(!data.notifications.length || data.notifications.every(item => hiddenNotifications.includes(item.id))) && <div className='notification-empty'><Bell size={26} /><span>Здесь пока спокойно</span></div>}</>}
    {pending.length > 0 && <section className='work-bottom' aria-label='Очередь синхронизации'><details id='sync-queue' className='content-card work-queue'><summary>Очередь действий <span>{pending.length}</span></summary>{pending.map(operation => <div key={operation.id} className='work-heading'><span>{actionLabels[operation.kind] || 'Действие'}{operation.task ? ` · задача №${operation.task}` : ''}</span><button disabled={busy} className='secondary' onClick={() => void removePending(operation.id)}>Удалить</button></div>)}</details></section>}
    {createOpen && <div className='task-dialog-backdrop' onMouseDown={event => { if (event.target === event.currentTarget) setCreateOpen(false) }}>
      <section className='task-dialog create-dialog' role='dialog' aria-modal='true' aria-labelledby='create-dialog-title'>
        <span className='sheet-handle' aria-hidden='true' /><button className='task-dialog-close icon-button' aria-label='Закрыть создание задачи' onClick={() => setCreateOpen(false)}><X size={21} /></button>
        <div className='work-section-heading'><div><h2 id='create-dialog-title'>Новая задача</h2></div></div>
        <div className='segmented-control create-kind' aria-label='Тип задачи'><button type='button' className={activeCreateKind === 'initiative' ? 'selected' : ''} aria-pressed={activeCreateKind === 'initiative'} onClick={() => setCreateKind('initiative')}>Личная инициатива</button>{manager && <button type='button' className={activeCreateKind === 'create' ? 'selected' : ''} aria-pressed={activeCreateKind === 'create'} onClick={() => setCreateKind('create')}>Назначить команде</button>}</div>
        <p className='create-intro'>{activeCreateKind === 'initiative' ? 'Видна только вам. Можно менять и удалять без согласования.' : 'Выберите ответственного и добавьте детали.'}</p>
        <form key={activeCreateKind} className='work-form' action={form => submit(activeCreateKind, form)}><fieldset disabled={busy}>
          {activeCreateKind === 'create' && <RecipientFields people={data.people} departments={data.departments} />}
          <label className='create-full'>Название<input name='title' required maxLength={200} /></label>
          <label>Описание<textarea name='description' required maxLength={4000} /></label>
          <label>Срок (Москва)<input name='deadline' type='datetime-local' required /></label>
          {reminderField()}
          <label>Приоритет<select name='priority' defaultValue='средний'><option>низкий</option><option>средний</option><option>высокий</option></select></label>
          {activeCreateKind === 'create' && <label>Смена<select name='shift'><option value=''>Без смены</option>{data.shifts.filter(shift => !shift.closed_at && (data.user.is_superadmin || shift.created_by === data.user.id || shift.owner_id === data.user.id)).map(shift => <option key={shift.id} value={shift.id}>{shift.title} · {date(shift.starts_at)}</option>)}</select></label>}
          <PhotoField />{activeCreateKind === 'create' && requirements}<button type='submit'>{activeCreateKind === 'initiative' ? 'Создать инициативу' : 'Назначить задачу'}</button>
        </fieldset></form>
      </section>
    </div>}
    {selected && <div className='task-dialog-backdrop' onMouseDown={event => { if (event.target === event.currentTarget) setSelectedTask(null) }}><section className='task-dialog' role='dialog' aria-modal='true' aria-labelledby='task-dialog-title'><span className='sheet-handle' aria-hidden='true' /><button className='task-dialog-close icon-button' aria-label='Закрыть задачу' onClick={() => setSelectedTask(null)}><X size={21} /></button>{taskCard(selected)}</section></div>}
    {toastVisible && <div className='work-toast' role={offline || /не |ошиб|недоступ|укажите|заполните|нужн|сессия/i.test(message) ? 'alert' : 'status'}><span>{message}</span>{pending.length > 0 && <button className='secondary' onClick={() => { document.getElementById('sync-queue')?.scrollIntoView({ behavior: 'smooth' }); setToastVisible(false) }}>Очередь</button>}<button className='icon-button' aria-label='Закрыть сообщение' onClick={() => setToastVisible(false)}><X size={17} /></button></div>}
  </div>
}
