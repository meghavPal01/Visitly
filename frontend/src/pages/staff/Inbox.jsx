import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { CheckCheck, Clock } from 'lucide-react'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { sourceLabel } from '../../lib/format'
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui'

const REASON = { buyer_request: 'Asked for a person', missing_fact: 'Question the assistant couldn’t answer', unsure: 'Assistant unsure', ai_error: 'Assistant error', booking: 'Booked a visit' }
const wait = (m) => (m < 1 ? 'just now' : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${Math.floor(m / 1440)} days`)
const tone = (m) => (m >= 60 ? 'bad' : m >= 15 ? 'warn' : 'neutral')

export default function InboxPage() {
  const { data, loading, error, reload } = useFetch(() => api('/api/inbox'), [])
  useEffect(() => { const t = setInterval(() => !document.hidden && reload(), 20000); return () => clearInterval(t) }, [reload])
  return (
    <div className="flex flex-col gap-5">
      <div><h1 className="text-3xl font-bold">Inbox</h1><p className="text-moss text-sm max-w-2xl">Buyers waiting for a person, longest wait first. A lead leaves this list when you reply in its chat, and returns if the buyer writes again.</p></div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <div className="flex flex-col gap-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>}
      {data?.count === 0 && <Card><EmptyState icon={CheckCheck} title="You’re all caught up" body="Nobody is waiting for a reply. New handoffs from the assistant appear here." /></Card>}
      <ul className="flex flex-col gap-3">
        {data?.items.map((i) => (
          <li key={i.lead_id}>
            <Link to={`/app/leads/${i.lead_id}`} className="block rounded-xl border border-line bg-paper p-4 hover:border-pine transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-lg">{i.name}</p>
                <Badge tone={tone(i.waiting_minutes)}><Clock className="size-3" aria-hidden />Waiting {wait(i.waiting_minutes)}</Badge>
              </div>
              <p className="text-sm text-moss mt-0.5">{sourceLabel(i.source)} · {REASON[i.reason] || i.reason} · {i.assigned_to ? `Assigned to ${i.assigned_to}` : 'Unassigned'}</p>
              {i.last_buyer_message && <p className="text-sm mt-2 bg-plaster rounded-lg px-3 py-2 line-clamp-2">“{i.last_buyer_message}”</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
