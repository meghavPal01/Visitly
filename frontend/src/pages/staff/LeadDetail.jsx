import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Phone, ShieldCheck, ShieldOff, UserRound } from 'lucide-react'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { useAuth } from '../../context/auth'
import { fmtDateTime, sourceLabel, statusLabel } from '../../lib/format'
import { Badge, Btn, Card, EmptyState, ErrorState, Select, Skeleton } from '../../components/ui'
import { StatusBadge } from './Leads'

export default function LeadDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data: l, loading, error, reload } = useFetch(() => api(`/api/leads/${id}`), [id])
  const execs = useFetch(() => (user.role === 'admin' ? api('/api/leads/meta/executives') : Promise.resolve([])), [user.role])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [actErr, setActErr] = useState(null)

  const act = async (fn) => { setBusy(true); setActErr(null); try { await fn(); await reload() } catch (e) { setActErr(e.message) } finally { setBusy(false) } }

  if (error) return <div className="flex flex-col gap-4"><Link to="/app/leads" className="text-sm flex items-center gap-1"><ArrowLeft className="size-4" />Leads</Link><ErrorState error={error} onRetry={reload} /></div>
  if (loading && !l) return <div className="flex flex-col gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40" /><Skeleton className="h-72" /></div>

  return (
    <div className="flex flex-col gap-5">
      <Link to="/app/leads" className="text-sm flex items-center gap-1 text-moss hover:text-pine w-fit"><ArrowLeft className="size-4" aria-hidden />All leads</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{l.name}</h1>
          <p className="text-moss flex flex-wrap items-center gap-x-3 gap-y-1 mt-1"><span className="flex items-center gap-1"><Phone className="size-4" aria-hidden />{l.phone}</span><span>{sourceLabel(l.source)}</span><span>Prefers {({ en: 'English', hi: 'Hindi', gu: 'Gujarati' })[l.language]}</span>
            {l.consent === 'granted' ? <Badge tone="ok"><ShieldCheck className="size-3" aria-hidden />Consent given</Badge> : l.consent === 'opted_out' ? <Badge tone="bad"><ShieldOff className="size-3" aria-hidden />Opted out</Badge> : <Badge>No marketing consent</Badge>}</p>
        </div>
        <label className="text-sm flex items-center gap-2">Status
          <Select disabled={busy} value={l.status} onChange={(e) => act(() => api(`/api/leads/${id}/status`, { method: 'PATCH', body: { status: e.target.value } }))} className="!w-auto">
            {['new', 'contacted', 'visit_booked', 'visited', 'negotiation', 'won', 'lost'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
        </label>
      </div>
      {actErr && <ErrorState compact error={{ message: actErr }} />}

      {l.duplicate && (
        <p className="flex items-start gap-2 text-sm bg-marigold-soft rounded-lg p-3"><Copy className="size-4 mt-0.5 shrink-0" aria-hidden />
          <span>This phone number matches an earlier lead: <Link to={`/app/leads/${l.duplicate.id}`} className="font-semibold underline">{l.duplicate.name}</Link> ({sourceLabel(l.duplicate.source)}). Check both before contacting so the buyer isn’t called twice. Leads are never merged automatically.</span></p>
      )}

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5 items-start">
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="text-lg font-bold flex items-center gap-2"><UserRound className="size-5" aria-hidden />Handoff</h2>
            <p className="text-sm mt-1">Assigned to <strong>{l.assigned_to?.name || 'nobody yet'}</strong>{l.handoff && <> · reason: {l.handoff.reason.replace('_', ' ')}</>}</p>
            {l.handoff ? <pre className="mt-3 whitespace-pre-wrap font-sans text-sm bg-plaster rounded-lg p-3">{l.handoff.summary}</pre> : <p className="text-sm text-moss mt-2">No handoff yet. The assistant is handling this buyer.</p>}
            {user.role === 'admin' && execs.data?.length > 0 && (
              <label className="text-sm flex items-center gap-2 mt-4">Reassign to
                <Select disabled={busy} value={l.assigned_to?.id || ''} onChange={(e) => act(() => api(`/api/leads/${id}/assign`, { method: 'PATCH', body: { executive_id: +e.target.value } }))} className="!w-auto">
                  <option value="" disabled>Choose executive</option>{execs.data.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </label>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-bold mb-3">Conversation</h2>
            {l.messages.length === 0 ? <EmptyState title="No chat yet" body="This lead hasn’t opened the chat. The conversation will appear here." /> : (
              <ol className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
                {l.messages.map((m) => (
                  <li key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.sender === 'buyer' ? 'self-start bg-plaster' : 'self-end bg-pine text-paper'}`}>
                    <p className="whitespace-pre-wrap">{m.content}</p><p className={`text-[11px] mt-1 ${m.sender === 'buyer' ? 'text-moss' : 'text-paper/60'}`}>{m.sender === 'buyer' ? l.name : 'Visitly assistant'} · {fmtDateTime(m.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="text-lg font-bold mb-2">Requirements</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm"><dt className="text-moss">BHK</dt><dd>{l.bhk || '—'}</dd><dt className="text-moss">Budget</dt><dd>{l.budget_lakh ? `₹${l.budget_lakh} lakh` : '—'}</dd><dt className="text-moss">Stage</dt><dd><StatusBadge s={l.status} /></dd></dl>
          </Card>
          <Card className="p-5">
            <h2 className="text-lg font-bold mb-2">Site visits</h2>
            {l.bookings.length === 0 ? <p className="text-sm text-moss">No visit booked yet.</p> : <ul className="flex flex-col gap-2">{l.bookings.map((b) => <li key={b.id} className="flex justify-between text-sm"><span>{fmtDateTime(b.start_time)}</span><Badge tone={b.status === 'confirmed' || b.status === 'completed' ? 'ok' : b.status === 'no_show' ? 'bad' : 'neutral'}>{b.status.replace('_', ' ')}</Badge></li>)}</ul>}
          </Card>
          <Card className="p-5">
            <h2 className="text-lg font-bold mb-2">Activity</h2>
            <form className="flex gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); if (note.trim()) act(async () => { await api(`/api/leads/${id}/notes`, { method: 'POST', body: { text: note } }); setNote('') }) }}>
              <input aria-label="Add a note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Add a note" className="flex-1 min-h-11 rounded-lg border border-line bg-paper px-3 min-w-0" />
              <Btn type="submit" loading={busy} disabled={!note.trim()}>Add</Btn>
            </form>
            <ol className="flex flex-col gap-3 border-l-2 border-line pl-4">
              {l.activities.map((a) => <li key={a.id} className="text-sm relative"><span className="absolute -left-[1.4rem] top-1.5 size-2 rounded-full bg-marigold" aria-hidden /><p>{a.detail}</p><p className="text-xs text-moss">{fmtDateTime(a.created_at)}</p></li>)}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}
