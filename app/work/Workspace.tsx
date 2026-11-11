'use client'

import { ArrowRight, CheckCircle2, Clock3, CloudOff, RefreshCw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { clearLocal, readLocal, writeLocal, changeQueue, type Pending } from './storage'
import TaskCalendar from './TaskCalendar'
import { projectTasks } from './projection'
import type { snapshot, Task } from '../operations'

type Data = Omit<ReturnType<typeof snapshot>, 'events' | 'notices' | 'acknowledgements' | 'shifts' | 'templates' | 'handovers' | 'notifications'> & {
  events: { id: number; task_id: number; name: string; action: string; comment: string; has_photo: number; created_at: number }[]
  notices: { id: number; title: string; content: string; category: string; acknowledged: number; read_count: number }[]
  acknowledgements: { update_id: number; name: string }[]
  shifts: { id: number; title: string; starts_at: number; ends_at: number; owner_id: number; created_by: number; closed_at: number | null }[]
  templates: { id: number; title: string; items: string; time: string; active: number }[]
  handovers: { id: number; task_id: number; from_id: number; to_id: number; from_name: string; to_name: string; note: string; accepted_at: number | null }[]
  notifications: { id: number; message: string; read_at: number | null }[]
}
const date = (value: number | string) => typeof value === 'number' ? new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }) : value
const tabs = ['Задачи', 'Смены', 'Передача', 'Объявления', 'Отделы', 'Уведомления', 'История']

export default function Workspace() {
  const [serverData, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState('Задачи')
  const [view, setView] = useState('Список')
  const [selectedTask, setSelectedTask] = useState<number | null>(null)
  const [grouped, setGrouped] = useState(true)
  const [message, setMessage] = useState('Загрузка…')
  const [pending, setPending] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
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

  const sync = useCallback(async () => {
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
          const result = await response.json()
          throw new Error(`${result.error} Действие сохранено в очереди. После проверки данных удалите конфликтующее действие и повторите его.`)
        }
        queue.shift()
        setPending(await changeQueue(items => items.filter(item => item.id !== operation.id)))
      }
      await refresh()
      setMessage('Все изменения сохранены')
    } catch (error) {
      setOffline(!navigator.onLine)
      setMessage(error instanceof TypeError ? 'Нет соединения с сервером. Изменения остаются на устройстве.' : error instanceof Error ? error.message : 'Не удалось выполнить синхронизацию.')
      if (!navigator.onLine) setMessage('Нет сети. Данные доступны с последней синхронизации, действия сохраняются на устройстве.')
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
        if (new URLSearchParams(window.location.search).get('tab') === 'announcements') setTab('Объявления')
        if (new URLSearchParams(window.location.search).get('tab') === 'departments') setTab('Отделы')
        if (new URLSearchParams(window.location.search).get('view') === 'calendar') setView('Календарь')
        if (new URLSearchParams(window.location.search).has('create')) setCreateOpen(true)
        if (!mounted) return
        if (cached) { state.current = cached; setData(cached) }
        setPending(await readLocal<Pending[]>('queue') || [])
        await sync()
      } catch { setMessage('Хранилище устройства недоступно. Разрешите сохранение данных в браузере.') }
    }
    void start()
    const timer = setInterval(() => { setNow(Date.now()); void sync() }, 60000)
    window.addEventListener('online', sync)
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('online', sync) }
  }, [sync])

  async function submit(kind: string, form: FormData, extra: Record<string, unknown> = {}) {
    if (!state.current || lock.current) return
    lock.current = true
    setBusy(true)
    try {
      const fields: Record<string, unknown> = Object.fromEntries(form.entries())
      const file = form.get('photo')
      delete fields.photo
      if (file instanceof File && file.size) {
        if (file.size > 4 * 1024 * 1024) throw new Error('Фотография должна быть меньше 4 МБ')
        fields.photo = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('Не удалось прочитать фотографию'))
          reader.readAsDataURL(file)
        })
      }
      const localTask = data?.tasks.find(task => task.id === extra.task && task.id < 0)
      const operation = { ...fields, ...extra, ...(localTask ? { taskOperation: localTask.client_id } : {}), id: crypto.randomUUID(), kind, userId: state.current.user.id } as Pending
      setPending(await changeQueue(queue => [...queue, operation]))
      setMessage('Действие сохранено на устройстве и ожидает отправки')
    } catch (error) {
      setMessage(error instanceof DOMException ? 'Не удалось сохранить действие. Проверьте доступное место и разрешения браузера.' : error instanceof Error ? error.message : 'Не удалось сохранить действие на устройстве')
    } finally { lock.current = false; setBusy(false) }
    if (navigator.onLine) await sync()
  }

  async function removePending(id: string) {
    if (lock.current) return
    setPending(await changeQueue(queue => queue.filter(item => item.id !== id)))
    setMessage('Действие удалено из очереди. Можно повторить его с актуальными данными.')
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
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось включить уведомления') }
  }

  const send = (kind: string, extra: Record<string, unknown>) => void submit(kind, new FormData(), extra)
  if (!data) return <div className='section-page'><h1>Рабочая смена</h1><p role='status'>{message}</p><a href='/login'>Войти в аккаунт</a><button onClick={() => void sync()}>Повторить загрузку</button></div>
  const manager = data.user.manager
  const names = (id: number) => data.people.find(person => person.id === id)?.name || `Сотрудник №${id}`
  const overdue = (task: Task) => task.workflow !== 'выполнена' && typeof task.deadline === 'number' && task.deadline < (now || data.generatedAt)
  const actionLabels: Record<string, string> = { superadmin: 'Изменить права главного администратора', initiative: 'Создать инициативу', edit: 'Изменить задачу', delete: 'Удалить задачу', requestDelete: 'Попросить удалить', denyDelete: 'Отклонить удаление', reschedule: 'Изменить срок', accept: 'Принять', complete: 'Завершить', problem: 'Проблема', approve: 'Подтвердить', reject: 'Вернуть', takeover: 'Принять передачу', handover: 'Передать', create: 'Создать задачу', ack: 'Ознакомлен', publish: 'Опубликовать', template: 'Создать чек-лист', shift: 'Создать смену', closeShift: 'Закрыть смену', cancelHandover: 'Отменить передачу', toggleTemplate: 'Изменить расписание', read: 'Прочитать' }
  const recipients = <><label>Сотрудник<select name='employee' defaultValue=''><option value=''>Выберите сотрудника</option>{data.people.filter(person => person.assignable).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Или весь отдел<select name='department' defaultValue=''><option value=''>Личная задача</option>{data.departments.filter(item => item.assignable).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>
  const requirements = <div className='work-checks'><label><input type='checkbox' name='require_comment' /> Нужен комментарий</label><label><input type='checkbox' name='require_photo' /> Нужна фотография</label><label><input type='checkbox' name='require_review' /> Проверка руководителем</label></div>
  const shownTasks = data.tasks.filter(task => (!department || task.department_id === Number(department) || data.people.find(person => person.id === task.assigned_to)?.department === Number(department)) && (filter === 'all' || filter === 'mine' && task.claimed && task.assigned_to === data.user.id || filter === 'overdue' && overdue(task) || filter === 'review' && task.workflow === 'на проверке' || filter === 'active' && (task.workflow !== 'выполнена' || pending.some(item => item.task === task.id))))

  function reminderField(value: number | null = null) {
    return <label>Уведомить заранее<select name='reminder_hours' defaultValue={value ?? 'previous-day'}><option value='previous-day'>Накануне в 12:00 (Москва)</option>{[0, 1, 4, 12, 24, 48, 72, 168, ...(value !== null ? [value] : [])].filter((hours, index, all) => all.indexOf(hours) === index).sort((a, b) => a - b).map(hours => <option key={hours} value={hours}>{hours === 0 ? 'В момент срока' : `За ${hours} ч`}</option>)}</select><small>Повторять каждые 4 часа до завершения задачи.</small></label>
  }

  function taskCard(task: Task) {
    const owner = task.claimed && task.assigned_to === data!.user.id
    const reviewer = task.assigned_to !== data!.user.id && (data!.user.is_superadmin || task.created_by === data!.user.id || data!.people.find(person => person.id === task.assigned_to)?.assignable)
    const waiting = data!.handovers.find(item => item.task_id === task.id && !item.accepted_at)
    const queued = task.id < 0 || pending.some(item => item.task === task.id || item.taskOperation && item.taskOperation === task.client_id)
    const editable = task.created_by === data!.user.id
    return <article className='content-card work-task' id={`task-${task.id}`} key={task.id}>
      <div className='work-heading'><div className='work-task-title'><span className='work-task-mark'><CheckCircle2 size={19} /></span><h2>{task.title}</h2></div><span className={overdue(task) ? 'work-status urgent' : 'work-status'}>{task.workflow}{overdue(task) ? ' · Просрочена' : ''}</span></div>
      <p className='work-meta'>{task.initiative ? 'Личная инициатива' : `Поручение · ${names(task.created_by)}`}</p>
      <p className='work-description'>{task.description}</p><p className='work-meta'>Срок: {date(task.deadline)} · {task.priority} приоритет</p><p className='work-meta'>Напоминание: {task.reminder_hours === null ? 'накануне в 12:00 (Москва)' : `за ${task.reminder_hours} ч`} · каждые 4 часа</p>
      <p className='work-meta'>{task.department_id ? data!.departments.find(item => item.id === task.department_id)?.name + ' · ' : ''}{task.claimed ? names(task.assigned_to) : 'Ожидает ответственного из отдела'}</p>
      {task.require_comment || task.require_photo || task.require_review ? <p className='work-meta'>Подтверждение: {[task.require_comment && 'комментарий', task.require_photo && 'фото', task.require_review && 'проверка руководителем'].filter(Boolean).join(', ')}</p> : null}
      {queued && <p role='status'>Показан ожидаемый результат. Действия ещё не подтверждены сервером.</p>}
      {typeof task.deadline === 'string' && <p role='alert'>Срок задан текстом. Руководителю нужно указать точную дату для расчёта просрочки.</p>}
      <fieldset disabled={busy}>
        {editable && <details><summary>Изменить задачу</summary><form className='work-form' action={form => submit('edit', form, { task: task.id, version: task.version })}><label>Название<input name='title' required maxLength={200} defaultValue={task.title} /></label><label>Описание<textarea name='description' required maxLength={4000} defaultValue={task.description} /></label><label>Срок (Москва)<input type='datetime-local' name='deadline' required defaultValue={typeof task.deadline === 'number' ? new Date(task.deadline + 10800000).toISOString().slice(0, 16) : ''} /></label>{reminderField(task.reminder_hours)}<label>Приоритет<select name='priority' defaultValue={task.priority}><option>низкий</option><option>средний</option><option>высокий</option></select></label><button>Сохранить задачу</button></form></details>}
        {editable && <details><summary>Удалить задачу</summary><p>Задача исчезнет из рабочих списков.</p><button className='secondary' onClick={() => send('delete', { task: task.id, version: task.version })}>Подтвердить удаление</button></details>}
        {Boolean(task.deletion_requested) && <div className='work-handover'><p>Запрошено удаление. Причина указана в истории.</p>{editable && <form className='work-form' action={form => submit('denyDelete', form, { task: task.id, version: task.version })}><label>Причина отказа<textarea name='comment' required /></label><button>Отклонить запрос</button></form>}</div>}
        {owner && !editable && !task.deletion_requested && <details><summary>Попросить автора удалить</summary><form className='work-form' action={form => submit('requestDelete', form, { task: task.id, version: task.version })}><label>Причина<textarea name='comment' required maxLength={4000} /></label><button>Отправить запрос</button></form></details>}
        {editable && <details><summary>Изменить срок</summary><form className='work-form' action={form => submit('reschedule', form, { task: task.id, version: task.version })}><label>Новый срок (Москва)<input type='datetime-local' name='deadline' required /></label><label>Причина<textarea name='comment' required /></label><button>Сохранить срок</button></form></details>}
        {task.workflow === 'новая' && (owner || !task.claimed && data!.departments.some(item => item.id === task.department_id)) ? <button onClick={() => send('accept', { task: task.id, version: task.version })}>Принять в работу</button> : null}
        {(owner && task.workflow !== 'выполнена' || reviewer && task.workflow === 'на проверке') && <details className='work-result'><summary>Отметить результат или проблему</summary><form className='work-form' action={async form => {
          const kind = String(form.get('action'))
          await submit(kind, form, { task: task.id, version: task.version })
        }}><label>Комментарий<textarea name='comment' maxLength={4000} placeholder='Результат, проблема или необходимые исправления' /></label><label>Фотография (до 4 МБ)<input type='file' name='photo' accept='image/jpeg,image/png,image/webp' capture='environment' /></label><div className='work-actions'>
          {owner && ['в работе', 'проблема'].includes(task.workflow) ? <button name='action' value='complete'>Завершить</button> : null}
          {owner && ['новая', 'в работе', 'проблема'].includes(task.workflow) ? <button name='action' value='problem' className='secondary'>Сообщить о проблеме</button> : null}
          {reviewer && task.workflow === 'на проверке' ? <><button name='action' value='approve'>Подтвердить результат</button><button name='action' value='reject' className='secondary'>Вернуть на доработку</button></> : null}
        </div></form></details>}
        {owner && !task.initiative && task.workflow !== 'выполнена' && !waiting ? <details><summary>Передать ответственность</summary><form className='work-form' action={form => submit('handover', form, { task: task.id, version: task.version })}><label>Кто принимает<select name='employee' required defaultValue=''><option value=''>Выберите сотрудника</option>{data!.people.filter(person => person.id !== data!.user.id).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Что произошло и что осталось сделать<textarea name='comment' required maxLength={4000} /></label><button>Предложить передачу</button></form></details> : null}
        {waiting && <div className='work-handover'><p>{waiting.from_name} → {waiting.to_name}</p><p>{waiting.note}</p><p>Ответственность остаётся у передающего до принятия.</p>{waiting.to_id === data!.user.id && <button onClick={() => send('takeover', { task: task.id, version: task.version })}>Принимаю ответственность</button>}{owner ? <button className='secondary' onClick={() => send('cancelHandover', { task: task.id, version: task.version })}>Отменить передачу</button> : null}</div>}
      </fieldset>
      <details><summary>История изменений</summary>{data!.events.filter(event => event.task_id === task.id).map(event => <div className='work-event' key={event.id}><b>{event.action}</b><p>{event.name} · {date(event.created_at)}</p>{event.comment && <p>{event.comment}</p>}{event.has_photo ? <a href={`/api/photos/${event.id}`} target='_blank' rel='noreferrer'>Открыть фотографию</a> : null}</div>)}</details>
    </article>
  }

  return <div className='section-page work-page'>
    <header className='work-hero'><div><p className='work-kicker'><Sparkles size={14} /> ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</p><h1>Работа команды<span>.</span></h1><p>Всё, что нужно для спокойной и слаженной смены.</p></div><div className='work-hero-count'><span>ОТКРЫТЫХ ЗАДАЧ</span><strong>{String(data.tasks.filter(task => task.workflow !== 'выполнена').length).padStart(2, '0')}</strong><small>В текущей смене <ArrowRight size={15} /></small></div></header>
    <div className='work-sync' role='status'><span className='work-sync-icon'>{offline ? <CloudOff size={17} /> : <CheckCircle2 size={17} />}</span><div><span>{offline ? 'Без сети · ' : ''}{message}</span><small>Обновлено {date(data.generatedAt)}{pending.length > 0 ? ` · Ожидают отправки: ${pending.length}` : ''}</small></div><button className='work-refresh' disabled={busy} onClick={() => void sync()} aria-label='Синхронизировать'><RefreshCw size={17} /></button></div>
    {pending.length > 0 && <details className='content-card'><summary>Очередь действий ({pending.length})</summary>{pending.map(operation => <div key={operation.id} className='work-heading'><span>{actionLabels[operation.kind] || 'Действие'}{operation.task ? ` · задача №${operation.task}` : ''}</span><button disabled={busy} className='secondary' onClick={() => void removePending(operation.id)}>Удалить из очереди</button></div>)}</details>}
    <nav className='work-tabs' aria-label='Разделы работы'>{tabs.map(item => <button aria-pressed={tab === item} className={tab === item ? 'selected' : ''} key={item} onClick={() => setTab(item)}>{item}{item === 'Уведомления' && data.notifications.some(item => !item.read_at) ? ' •' : ''}</button>)}</nav>
    {tab === 'Задачи' && <>
      <div className='work-section-heading'><div><p>ВАШ ПЛАН НА СЕГОДНЯ</p><h2>Задачи <span>{shownTasks.length}</span></h2></div><Clock3 size={20} /></div>
      <div className='work-filters'><label>Показать<select value={filter} onChange={event => setFilter(event.target.value)}><option value='active'>Незавершённые</option><option value='mine'>Мои</option><option value='overdue'>Просроченные</option><option value='review'>На проверке</option><option value='all'>Все</option></select></label><label>Отдел<select value={department} onChange={event => setDepartment(event.target.value)}><option value=''>Все доступные</option>{data.departments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
      <div className='work-actions'>{['Список', 'Календарь'].map(item => <button className={view === item ? '' : 'secondary'} aria-pressed={view === item} key={item} onClick={() => { setView(item); setSelectedTask(null) }}>{item}</button>)}{Boolean(data.user.is_superadmin) && <label><input type='checkbox' checked={grouped} onChange={event => setGrouped(event.target.checked)} /> Группировать по отделам</label>}</div>
      <details className='content-card'><summary>Создать личную инициативу</summary><form className='work-form' action={form => submit('initiative', form)}><fieldset disabled={busy}><p>Видна только вам. Можно менять и удалять без согласования.</p><label>Название<input name='title' required maxLength={200} /></label><label>Описание<textarea name='description' required maxLength={4000} /></label><label>Срок (Москва)<input name='deadline' type='datetime-local' required /></label>{reminderField()}<label>Приоритет<select name='priority' defaultValue='средний'><option>низкий</option><option>средний</option><option>высокий</option></select></label><button>Создать инициативу</button></fieldset></form></details>
      {manager && <details className='content-card' open={createOpen} onToggle={event => setCreateOpen(event.currentTarget.open)}><summary>Назначить задачу</summary><form className='work-form' action={form => submit('create', form)}><fieldset disabled={busy}>{recipients}<label>Название<input name='title' required maxLength={200} /></label><label>Описание<textarea name='description' required maxLength={4000} /></label><label>Срок (Москва)<input name='deadline' type='datetime-local' required /></label>{reminderField()}<label>Приоритет<select name='priority' defaultValue='средний'><option>низкий</option><option>средний</option><option>высокий</option></select></label><label>Смена<select name='shift'><option value=''>Без смены</option>{data.shifts.filter(shift => !shift.closed_at && (data.user.is_superadmin || shift.created_by === data.user.id || shift.owner_id === data.user.id)).map(shift => <option key={shift.id} value={shift.id}>{shift.title} · {date(shift.starts_at)}</option>)}</select></label>{requirements}<button>Назначить</button></fieldset></form></details>}
      {view === 'Календарь' ? <><TaskCalendar tasks={shownTasks} today={now || data.generatedAt} onSelect={setSelectedTask} />{selectedTask !== null && shownTasks.filter(task => task.id === selectedTask).map(taskCard)}</> : data.user.is_superadmin && grouped ? [...data.departments, { id: 0, name: 'Без отдела / Личные инициативы', assignable: false }].map(group => {
        const tasks = shownTasks.filter(task => (task.initiative ? 0 : task.department_id || data.people.find(person => person.id === task.assigned_to)?.department || 0) === group.id)
        return tasks.length ? <section key={group.id}><h2>{group.name} · {tasks.length}</h2><div className='work-cards'>{tasks.map(taskCard)}</div></section> : null
      }) : <div className='work-cards'>{shownTasks.map(taskCard)}</div>}{!shownTasks.length && <div className='work-empty'><CheckCircle2 size={28} /><h3>Здесь пока спокойно</h3><p>Задач по выбранному фильтру нет.</p></div>}
    </>}
    {tab === 'Смены' && <>
      {manager && <details className='content-card'><summary>Запланировать смену</summary><form className='work-form' action={form => submit('shift', form)}><fieldset disabled={busy}><label>Название<input name='title' required maxLength={200} placeholder='Утренняя смена' /></label><label>Ответственный<select name='employee' required><option value=''>Выберите</option>{data.people.filter(person => person.assignable).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Начало (Москва)<input name='start' type='datetime-local' required /></label><label>Окончание (Москва)<input name='end' type='datetime-local' required /></label><button>Создать смену</button></fieldset></form></details>}
      {data.shifts.map(shift => <article key={shift.id} className='content-card'><h2>{shift.title} · {shift.closed_at ? 'Закрыта' : 'Открыта'}</h2><p>{date(shift.starts_at)} — {date(shift.ends_at)}</p><p>Ответственный: {names(shift.owner_id)}</p>{data.tasks.filter(task => task.shift_id === shift.id).map(task => <p key={task.id}>{task.title} · {task.workflow}{overdue(task) ? ' · Просрочена' : ''}</p>)}{!shift.closed_at && (data.user.is_superadmin || shift.owner_id === data.user.id || shift.created_by === data.user.id) && <button disabled={busy} onClick={() => send('closeShift', { shift: shift.id })}>Закрыть смену</button>}</article>)}
      {!data.shifts.length && <p>Смены ещё не запланированы.</p>}
      {manager && <details className='content-card'><summary>Ежедневный чек-лист</summary><form className='work-form' action={form => submit('template', form)}><fieldset disabled={busy}>{recipients}<label>Название процедуры<input name='title' required placeholder='Открытие зала / Подготовка кухни / Уборка / Закрытие' maxLength={200} /></label><label>Пункты, каждый с новой строки<textarea name='items' required rows={5} maxLength={4000} placeholder={'Проверить чистоту\nПодготовить рабочие места\nПроверить оборудование'} /></label><label>Ежедневный срок (Москва)<input name='time' type='time' required /></label><label><input type='checkbox' name='require_review' /> Проверка руководителем</label><button>Включить ежедневное повторение</button></fieldset></form></details>}
      {data.templates.map(template => <article className='content-card' key={template.id}><h2>{template.title}</h2><p>Каждый день до {template.time} (Москва) · {template.active ? 'Включён' : 'Приостановлен'}</p><p className='work-description'>{template.items}</p><button disabled={busy} className='secondary' onClick={() => send('toggleTemplate', { template: template.id })}>{template.active ? 'Приостановить' : 'Возобновить'}</button></article>)}
    </>}
    {tab === 'Передача' && <><h2>Незавершённое и передача ответственности</h2><p>Опишите ситуацию в карточке задачи и выберите принимающего. Передача требует его подтверждения.</p><div className='work-cards'>{data.tasks.filter(task => task.workflow !== 'выполнена').map(taskCard)}</div>{!data.tasks.some(task => task.workflow !== 'выполнена') && <p>Незавершённых задач нет.</p>}</>}
    {tab === 'Объявления' && <>
      {manager && <details className='content-card'><summary>Опубликовать объявление</summary><form className='work-form' action={form => submit('publish', form)}><fieldset disabled={busy}><label>Заголовок<input name='title' required maxLength={200} /></label><label>Сообщение<textarea name='content' required maxLength={4000} /></label><label>Категория<select name='category'><option>объявление</option><option>срочное</option><option>инструкция</option></select></label><button>Опубликовать</button></fieldset></form></details>}
      {data.notices.map(notice => <article key={notice.id} className='content-card'><span className='work-meta'>{notice.category}</span><h2>{notice.title}</h2><p className='work-description'>{notice.content}</p><button disabled={busy || Boolean(notice.acknowledged) || pending.some(item => item.notice === notice.id)} onClick={() => send('ack', { notice: notice.id })}>{notice.acknowledged ? 'Вы ознакомлены' : 'Ознакомлен'}</button>{manager && <details><summary>Ознакомились: {notice.read_count}</summary>{data.acknowledgements.filter(item => item.update_id === notice.id).map((item, index) => <p key={index}>{item.name}</p>)}</details>}</article>)}
    </>}
    {tab === 'Отделы' && <>{Boolean(data.user.is_superadmin) && <section className='content-card'><h2>Главные администраторы</h2><p>Любой главный администратор может назначить другого. Последнего снять нельзя.</p>{data.people.map(person => {
      const queued = pending.some(item => item.kind === 'superadmin' && item.person === person.id)
      return <div className='work-heading' key={person.id}><span>{person.name}{person.is_superadmin ? ' · Главный администратор' : ''}{queued ? ' · Ожидает синхронизации' : ''}</span><button className='secondary' disabled={busy || queued} onClick={() => send('superadmin', { person: person.id, enabled: !person.is_superadmin, previous: person.is_superadmin })}>{person.is_superadmin ? 'Снять права' : 'Назначить главным'}</button></div>
    })}</section>}{data.departments.map(item => {
      const tasks = data.tasks.filter(task => task.department_id === item.id || data.people.find(person => person.id === task.assigned_to)?.department === item.id)
      return <article key={item.id} className='content-card'><h2>{item.name}</h2><p>Открыто: {tasks.filter(task => task.workflow !== 'выполнена').length} · Просрочено: {tasks.filter(overdue).length} · На проверке: {tasks.filter(task => task.workflow === 'на проверке').length} · Выполнено: {tasks.filter(task => task.workflow === 'выполнена').length}</p><p>{data.people.filter(person => person.department === item.id).map(person => person.name).join(', ') || 'Сотрудники не назначены'}</p><button onClick={() => { setDepartment(String(item.id)); setFilter('all'); setTab('Задачи') }}>Открыть задачи отдела</button></article>
    })}{!data.departments.length && <p>Отдел не назначен. Обратитесь к администратору.</p>}</>}
    {tab === 'История' && <><h2>Журнал действий</h2>{data.activity.map(event => <article className='content-card' key={event.id}><p>{actionLabels[event.kind] || 'Изменение срока'} · {event.name}</p><small>{date(event.created_at)}</small></article>)}{!data.activity.length && <p>Изменений пока нет.</p>}</>}
    {tab === 'Уведомления' && <><button disabled={busy} onClick={() => void enablePush()}>Включить push-уведомления</button>{data.notifications.length > 0 && <button className='secondary' disabled={busy} onClick={() => send('read', { notification: data.notifications[0].id })}>Отметить все прочитанными</button>}{data.notifications.map(item => <article className='content-card' key={item.id}><p>{!item.read_at ? '● ' : ''}{item.message}</p></article>)}{!data.notifications.length && <p>Новых уведомлений нет.</p>}</>}
  </div>
}
