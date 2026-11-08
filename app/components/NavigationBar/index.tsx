'use client'

import { useRouter, useSelectedLayoutSegment } from 'next/navigation'
import Link from 'next/link'
import { clearLocal, readLocal, type Pending } from '../../work/storage'
import { LayoutDashboard, CalendarDays, Users, Radio, UserRound, LogOut, ArrowUpRight, ShieldCheck } from 'lucide-react'

type User = { id: number; name: string; email: string; is_admin: number; is_superadmin: number }

export default function NavigationBar({ user, onLogout }: { user: User | null; onLogout: () => Promise<void> }) {
  const segment = useSelectedLayoutSegment()
  const router = useRouter()
  const items = [
    { label: 'Обзор', href: '/', icon: LayoutDashboard },
    { label: 'Работа', href: '/work', icon: CalendarDays },
    { label: 'Персонал', href: '/management', icon: Users },
    { label: 'Важное', href: '/important', icon: Radio },
    ...(user?.is_admin || user?.is_superadmin ? [{ label: 'Управление', href: '/admin', icon: ShieldCheck }] : [{ label: 'Профиль', href: '/profile', icon: UserRound }]),
  ]

  async function handleLogout() {
    const queue = await readLocal<Pending[]>('queue') || []
    if (queue.length && !window.confirm(`На устройстве ${queue.length} несохранённых действий. Выйти и удалить их?`)) return
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      await subscription?.unsubscribe()
    }
    await clearLocal()
    if ('caches' in window) await Promise.all((await caches.keys()).map(key => caches.delete(key)))
    await onLogout()
    router.push('/login')
    router.refresh()
  }

  return <>
    <header className='app-header'>
      <Link href='/' className='brand' aria-label='СП Организатор — главная'><span className='brand-symbol'>сп<span /></span><span>организатор</span></Link>
      <nav className='desktop-nav' aria-label='Основная навигация'>{items.map(({ icon: Icon, ...item }) => {
        const active = segment === (item.href === '/' ? null : item.href.slice(1))
        return <a key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={active ? 'nav-link active' : 'nav-link'}><Icon size={17} />{item.label}</a>
      })}</nav>
      <div className='header-account'>{user ? <><Link href='/profile' className='account-link'><span className='account-avatar'>{user.name.charAt(0)}</span><span>{user.name.split(' ')[0]}<small>{user.is_superadmin ? 'Главный администратор' : user.is_admin ? 'Администратор' : 'Пользователь'}</small></span></Link><button onClick={handleLogout} aria-label='Выйти из аккаунта' className='logout-button'><LogOut size={18} /></button></> : <Link href='/login' className='login-link'>Войти <ArrowUpRight size={17} /></Link>}</div>
    </header>
    <nav className='mobile-nav' aria-label='Мобильная навигация'>{items.map(({ icon: Icon, ...item }) => {
      const active = segment === (item.href === '/' ? null : item.href.slice(1))
      return <a key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''}><Icon size={21} /><span>{item.label}</span></a>
    })}</nav>
  </>
}
