import { getUser } from '../../auth/actions'
import db from '../../db'
import { applyOperation, runRecurring, snapshot, WorkError, type Operation } from '../../operations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getUser()
  if (!user) return Response.json({ error: 'Войдите в аккаунт' }, { status: 401 })
  runRecurring()
  return Response.json(snapshot(user), { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  if (!request.headers.get('origin') || request.headers.get('origin') !== new URL(request.url).origin && request.headers.get('origin') !== process.env.APP_ORIGIN) return Response.json({ error: 'Недопустимый источник запроса' }, { status: 403 })
  const user = await getUser()
  if (!user) return Response.json({ error: 'Войдите в аккаунт' }, { status: 401 })
  if (Number(request.headers.get('content-length')) > 6000000) return Response.json({ error: 'Слишком большой запрос' }, { status: 413 })
  try {
    const raw = await request.text()
    if (raw.length > 6000000) throw new WorkError('Слишком большой запрос', 413)
    const input = JSON.parse(raw) as Operation
    if (!input || typeof input !== 'object') throw new WorkError('Некорректный запрос')
    if (Number(input.userId) !== user.id) throw new WorkError('Очередь принадлежит другому аккаунту', 403)
    if (input.kind === 'subscribe') {
      const subscription = input.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const endpoint = new URL(subscription?.endpoint || '')
      if (endpoint.protocol !== 'https:' || !/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(endpoint.hostname) || !subscription.keys?.p256dh || !subscription.keys.auth) throw new WorkError('Недопустимая подписка')
      db.prepare('INSERT INTO subscriptions VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, subscription = excluded.subscription').run(endpoint.href, user.id, JSON.stringify(subscription))
    } else applyOperation(user, input)
    runRecurring()
    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof WorkError) return Response.json({ error: error.message }, { status: error.status })
    if (error instanceof SyntaxError || error instanceof TypeError) return Response.json({ error: 'Некорректный запрос' }, { status: 400 })
    console.error('Ошибка обработки операции', error)
    return Response.json({ error: 'Не удалось сохранить действие' }, { status: 500 })
  }
}
