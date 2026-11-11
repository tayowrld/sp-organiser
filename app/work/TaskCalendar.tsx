'use client'

import { useState } from 'react'
import type { Task } from '../operations'

const dayKey = (value: number) => new Date(value + 10800000).toISOString().slice(0, 10)

export default function TaskCalendar({ tasks, today, onSelect }: { tasks: Task[]; today: number; onSelect: (id: number) => void }) {
  const [offset, setOffset] = useState(0)
  const current = new Date(today + 10800000)
  const first = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1))
  const start = first.getTime() - ((first.getUTCDay() + 6) % 7) * 86400000
  return <section className='task-calendar' aria-label='Календарь задач'>
    <header><h2>{first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><div className='work-actions'><button className='secondary' onClick={() => setOffset(offset - 1)} aria-label='Предыдущий месяц'>←</button><button className='secondary' onClick={() => setOffset(0)}>Сегодня</button><button className='secondary' onClick={() => setOffset(offset + 1)} aria-label='Следующий месяц'>→</button></div></header>
    <div className='calendar-scroll'><div className='calendar-grid'>
      {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => <div className='calendar-weekday' key={day}>{day}</div>)}
      {Array.from({ length: 42 }, (_, index) => {
        const day = new Date(start + index * 86400000)
        const key = day.toISOString().slice(0, 10)
        const items = tasks.filter(task => typeof task.deadline === 'number' && Number.isFinite(task.deadline) && dayKey(task.deadline) === key)
        return <div key={key} className={`calendar-day ${day.getUTCMonth() !== first.getUTCMonth() ? 'outside' : ''}`}><time dateTime={key} aria-current={key === dayKey(today) ? 'date' : undefined}>{day.getUTCDate()}</time>{items.map(task => <button key={task.id} className={`calendar-task ${task.workflow === 'выполнена' ? 'done' : ''}`} onClick={() => onSelect(task.id)}><span>{task.initiative ? '○' : '•'} {task.title}</span><small>{new Date(Number(task.deadline)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}</small></button>)}</div>
      })}
    </div></div>
    {tasks.some(task => typeof task.deadline !== 'number') && <p>Задачи с текстовым сроком доступны в списке.</p>}
  </section>
}
