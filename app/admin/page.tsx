import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '../auth/actions'
import db from '../db'
import { canManagePerson, getDepartment, type Department, type Person } from '../people'
import PersonForm from './PersonForm'
import DepartmentForm from './DepartmentForm'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await getUser()
  if (!user) redirect('/login')
  if (!(user.is_admin || user.is_superadmin)) redirect('/')
  const people = db.prepare(`SELECT id, name, email, manager_id, is_admin, is_superadmin, is_active, department_id FROM users ${user.is_superadmin ? '' : 'WHERE manager_id = ?'} ORDER BY is_active DESC, name`).all(...(user.is_superadmin ? [] : [user.id])) as Person[]
  const departments = db.prepare('SELECT id, name FROM departments ORDER BY name').all() as Department[]
  const managers = user.is_superadmin ? people.filter(person => person.is_active).map(({ id, name }) => ({ id, name })) : []
  const groups = user.is_superadmin ? [...departments.map(department => ({ name: department.name, people: people.filter(person => getDepartment(person)?.id === department.id) })), { name: 'Без отдела', people: people.filter(person => !getDepartment(person)) }] : [{ name: 'Моя команда', people }]
  return <div className='section-page'>
    <div className='admin-heading'><div><h1>Пользователи</h1><p>{user.is_superadmin ? 'Все пользователи, их персонал и права доступа.' : 'Создание и управление сотрудниками вашей команды.'}</p></div><a href='#new-person' className='primary-action'>Добавить пользователя</a></div>
    {Boolean(user.is_superadmin) && <Link href='/work?tab=departments'>Управление главными администраторами и отделами (доступно без сети) →</Link>}
    <div className='admin-layout'><section className='people-list' aria-label='Пользователи'>{groups.map(group => <section key={group.name}><h2>{group.name} · {group.people.length}</h2>{group.people.map(person => <details className='content-card person-card' key={person.id}><summary><span className='employee-avatar' aria-hidden='true'>{person.name.charAt(0)}</span><span><strong>{person.name}</strong><small>{person.email}</small></span><span className='person-access'>{!person.is_active ? 'Отключён' : person.is_superadmin ? 'Главный администратор' : person.is_admin ? 'Администратор' : 'Пользователь'}</span></summary><div className='person-details'><p>Руководитель: {people.find(manager => manager.id === person.manager_id)?.name || (person.manager_id === user.id ? user.name : 'Не назначен')}</p><p>Отдел: {getDepartment(person)?.name || 'Не назначен'}</p><p>Сотрудников: {people.filter(employee => employee.manager_id === person.id).length}</p><Link href={`/management/${person.id}`}>Посмотреть задачи →</Link></div>{canManagePerson(user, person) ? <PersonForm person={person} managers={managers} superadmin={Boolean(user.is_superadmin)} departments={departments} /> : <p className='person-details'>{person.id === user.id ? 'Ваш аккаунт.' : 'Изменение этого аккаунта недоступно.'}</p>}</details>)}</section>)}{people.length === 0 && <div className='content-card'>В вашей команде пока нет пользователей. Добавьте первого сотрудника.</div>}</section><aside id='new-person' className='content-card admin-create'><h2>Новый пользователь</h2><PersonForm managers={managers} superadmin={Boolean(user.is_superadmin)} departments={departments} />{Boolean(user.is_superadmin) && <section className='department-section'><h2>Отделы</h2>{departments.length > 0 && <ul className='department-list'>{departments.map(department => <li key={department.id}>{department.name}</li>)}</ul>}<DepartmentForm /></section>}</aside></div>
  </div>
}
