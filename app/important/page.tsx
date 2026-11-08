import { redirect } from 'next/navigation'

export default function ImportantPage() {
  redirect('/work?tab=announcements')
}
