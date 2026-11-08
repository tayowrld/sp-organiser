import { redirect } from 'next/navigation'

export default function NewTaskPage() {
  redirect('/work?create=task')
}
