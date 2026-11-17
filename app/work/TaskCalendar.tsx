'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { Task } from '../operations'

const dayKey = (value: number) => new Date(value + 10800000).toISOString().slice(0, 10)

export default function TaskCalendar({ tasks, today, onSelect }: { tasks: Task[]; today: number; onSelect: (id: number) => void }) {
  const [offset, setOffset] = useState(0)
  const current = new Date(today + 10800000)
  const first = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1))
  const start = first.getTime() - ((first.getUTCDay() + 6) % 7) * 86400000
  return <section className='task-calendar' aria-label='Календарь задач'>
    <header><div><p>Сроки задач</p><h2>{first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2></div><div className='work-actions'><button className='secondary icon-button' onClick={() => setOffset(offset - 1)} aria-label='Предыдущий месяц'><ChevronLeft size={18} /></button><button className='secondary' onClick={() => setOffset(0)}>Сегодня</button><button className='secondary icon-button' onClick={() => setOffset(offset + 1)} aria-label='Следующий месяц'><ChevronRight size={18} /></button></div></header>
    <div className='calendar-grid'>
      {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => <div className='calendar-weekday' key={day}>{day}</div>)}
      {Array.from({ length: 42 }, (_, index) => {
        const day = new Date(start + index * 86400000)
        const key = day.toISOString().slice(0, 10)
        const items = tasks.filter(task => typeof task.deadline === 'number' && Number.isFinite(task.deadline) && dayKey(task.deadline) === key)
        return <div key={key} className={`calendar-day ${day.getUTCMonth() !== first.getUTCMonth() ? 'outside' : ''} ${items.length ? 'has-tasks' : ''}`}><time dateTime={key} aria-current={key === dayKey(today) ? 'date' : undefined}>{day.getUTCDate()}</time><div className='calendar-day-tasks'>{items.map(task => <button key={task.id} title={`${task.title}, ${new Date(Number(task.deadline)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}`} className={`calendar-task ${task.workflow === 'выполнена' ? 'done' : ''}`} onClick={() => onSelect(task.id)}><span>{task.title}</span><small>{new Date(Number(task.deadline)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}</small></button>)}</div></div>
      })}
    </div>
    <p className='calendar-hint'>Нажмите на задачу, чтобы открыть подробности и историю.</p>
    {tasks.some(task => typeof task.deadline !== 'number') && <p>Задачи с текстовым сроком доступны в списке.</p>}
  </section>
}
