import * as webpush from 'web-push'
import db from '../db'

export async function deliverNotifications() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return { configured: false, delivered: 0 }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  const users = db.prepare('SELECT DISTINCT user_id FROM notifications WHERE pushed_at IS NULL AND read_at IS NULL').all() as { user_id: number }[]
  let delivered = 0
  for (const { user_id } of users) {
    const last = db.prepare('SELECT id, message FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user_id) as { id: number; message: string }
    const subscriptions = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').all(user_id) as { endpoint: string; subscription: string }[]
    let success = subscriptions.length > 0
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(JSON.parse(subscription.subscription), JSON.stringify({ title: 'СП Организатор', body: last.message, url: '/work?tab=notifications', tag: `sp-notification-${last.id}` }), { TTL: 3600, timeout: 10000 })
        delivered++
      } catch (error) {
        const code = (error as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) db.prepare('DELETE FROM subscriptions WHERE endpoint = ?').run(subscription.endpoint)
        else success = false
      }
    }
    if (success) db.prepare('UPDATE notifications SET pushed_at = ? WHERE user_id = ? AND id <= ?').run(Date.now(), user_id, last.id)
  }
  return { configured: true, delivered }
}
