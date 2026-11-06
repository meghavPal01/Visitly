import { useState } from 'react'
import { MessageSquareText, Play } from 'lucide-react'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { useAuth } from '../../context/auth'
import { fmtDateTime } from '../../lib/format'
import { Badge, Btn, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui'

const TONE = { simulated_sent: 'ok', blocked_opt_out: 'bad', blocked_no_consent: 'warn' }
const LABEL = { simulated_sent: 'Sent (simulated)', blocked_opt_out: 'Blocked: opted out', blocked_no_consent: 'Blocked: no consent' }
const RTONE = { pending: 'warn', sent: 'ok', skipped: 'neutral', failed: 'bad' }

export default function Comms() {
  const { user } = useAuth()
  const logs = useFetch(() => api('/api/comms/logs'), [])
  const rem = useFetch(() => api('/api/comms/reminders'), [])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const runNow = async () => {
    setBusy(true); setNote(null)
    try { const r = await api('/api/comms/run-reminders', { method: 'POST', body: { simulate_now: new Date(Date.now() + 25 * 3600e3).toISOString() } }); setNote(`Fast-forwarded 25 hours: ${r.sent} sent, ${r.skipped} skipped.`); logs.reload(); rem.reload() }
    catch (e) { setNote(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-5">
      <div><h1 className="text-3xl font-bold">Messages</h1>
        <p className="text-moss text-sm max-w-2xl">Reminders go out 24 hours and 2 hours before each visit. In this demo nothing is actually sent to WhatsApp or SMS; every message is recorded here as simulated. Buyers who opt out are never messaged.</p></div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3"><h2 className="text-lg font-bold">Upcoming reminders</h2>
          {user.role === 'admin' && <Btn variant="ghost" loading={busy} onClick={runNow}><Play className="size-4" />Fast-forward 25 hours</Btn>}</div>
        {note && <p role="status" className="text-sm bg-marigold-soft rounded-lg p-2.5 mb-3">{note}</p>}
        {rem.error ? <ErrorState compact error={rem.error} onRetry={rem.reload} /> : rem.loading && !rem.data ? <Skeleton className="h-24" />
          : rem.data.length === 0 ? <EmptyState title="No reminders scheduled" body="Reminders appear here as soon as a buyer books a visit." />
          : <ul className="divide-y divide-line/70">{rem.data.map((r) => (
            <li key={r.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm"><span><strong>{r.lead_name}</strong> · visit {fmtDateTime(r.visit_at)}</span>
              <span className="flex items-center gap-2 text-moss">{r.type === 't_minus_24h' ? '24 hours before' : '2 hours before'}, {fmtDateTime(r.scheduled_at)} <Badge tone={RTONE[r.status]}>{r.status}</Badge></span></li>))}</ul>}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-bold mb-3">Message log</h2>
        {logs.error ? <ErrorState compact error={logs.error} onRetry={logs.reload} /> : logs.loading && !logs.data ? <Skeleton className="h-32" />
          : logs.data.length === 0 ? <EmptyState icon={MessageSquareText} title="No messages yet" body="Messages appear here when a reminder is due. Admins can fast-forward time above to see one." />
          : <ul className="flex flex-col gap-3">{logs.data.map((n) => (
            <li key={n.id} className="rounded-lg bg-plaster p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-semibold">{n.lead_name} · {n.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</span><span className="flex items-center gap-2"><Badge tone={TONE[n.status]}>{LABEL[n.status]}</Badge><Badge tone="ink">Simulated</Badge></span></div>
              <p className="text-sm mt-1.5 whitespace-pre-wrap">{n.body}</p><p className="text-xs text-moss mt-1">{n.kind === 'promotional' ? 'Promotional' : 'Transactional'} · {fmtDateTime(n.created_at)}</p></li>))}</ul>}
      </Card>
    </div>
  )
}
