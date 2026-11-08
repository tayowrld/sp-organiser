import { getUser } from '../../../auth/actions'
import db from '../../../db'
import { canSeeTask, type Task } from '../../../operations'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return new Response(null, { status: 401 })
  const { id } = await params
  const event = db.prepare('SELECT task_id, photo, mime FROM task_events WHERE id = ?').get(Number(id)) as { task_id: number; photo: Buffer | null; mime: string } | undefined
  const task = event && db.prepare('SELECT * FROM tasks WHERE id = ?').get(event.task_id) as Task | undefined
  const incoming = task && db.prepare('SELECT id FROM handovers WHERE task_id = ? AND to_id = ? AND accepted_at IS NULL').get(task.id, user.id)
  if (!task || !event?.photo || !canSeeTask(user, task) && !incoming) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(event.photo), { headers: { 'Content-Type': event.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
