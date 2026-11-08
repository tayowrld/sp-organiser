import Link from 'next/link'

export default function HelpPage() {
  return <div className='section-page section-page-narrow'><h1>Помощь</h1><div className='flex flex-col gap-5 rounded-2xl border border-border bg-card p-8'><h2 className='text-lg font-semibold'>Как пользоваться организатором</h2><p className='text-sm leading-relaxed text-muted-foreground'>В разделе «Мои задачи» указаны задания, сроки и приоритеты. В разделе «Персонал» можно посмотреть задачи своих сотрудников и назначить новые. Администраторы создают пользователей в разделе «Администрирование». Главный администратор управляет всеми пользователями и назначает администраторов.</p><p className='text-sm leading-relaxed text-muted-foreground'>Общие сообщения и инструкции находятся в разделе «Важное». Данные вашего аккаунта доступны в профиле.</p><Link href='/' className='primary-action'>На главную</Link></div></div>
}
