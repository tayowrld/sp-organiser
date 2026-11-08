import { timingSafeEqual } from 'node:crypto'
import { runRecurring } from '../../operations'
import { deliverNotifications } from '../../operations/push'

export async function POST(request: Request) {
  const secret = process.env.MAINTENANCE_SECRET
  const actual = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new Response(null, { status: 401 })
  runRecurring()
  return Response.json(await deliverNotifications())
}
