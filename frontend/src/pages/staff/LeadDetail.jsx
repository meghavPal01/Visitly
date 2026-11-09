import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Bot, Phone, SendHorizontal, ShieldCheck, ShieldOff, UserRound } from 'lucide-react'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { useAuth } from '../../context/auth'
import { fmtDateTime, sourceLabel, statusLabel } from '../../lib/format'
import { Badge, Btn, Card, EmptyState, ErrorState, Select, Skeleton } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { StatusBadge } from './Leads'
import { CallsCard, MergeBanner, TasksCard, UnitsCard } from '../../components/CrmPanels'

export default function LeadDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data: l, loading, error, reload } = useFetch(() => api(`/api/leads/${id}`), [id])
  const execs = useFetch(() => (user.role === 'admin' ? api('/api/leads/meta/executives') : Promise.resolve([])), [user.role])
  const { toast } = useToast()
  const [note, setNote] = useState('')
  const [reply, setReply] = useState('')
  // pick up new buyer messages while this page is open (silent refresh; pauses when the tab is hidden)
  useEffect(() => { const t = setInterval(() => !document.hidden && reload(), 8000); return () => clearInterval(t) }, [reload])
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
          <Select disabled={busy} value={l.status} onChange={(e) => { const prev = l.status, next = e.target.value; act(async () => { await api(`/api/leads/${id}/status`, { method: 'PATCH', body: { status: next } }); toast(`Status changed to ${statusLabel(next)}`, { action: { label: 'Undo', run: () => act(() => api(`/api/leads/${id}/status`, { method: 'PATCH', body: { status: prev } })) } }) }) }} className="!w-auto">
            {['new', 'contacted', 'visit_booked', 'visited', 'negotiation', 'won', 'lost'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
        </label>
      </div>
      {actErr && <ErrorState compact error={{ message: actErr }} />}

      <MergeBanner lead={l} onDone={reload} />

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5 items-start">
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="text-lg font-bold flex items-center gap-2"><UserRound className="size-5" aria-hidden />Handoff</h2>
            <p className="text-sm mt-1">Assigned to <strong>{l.assigned_to?.name || 'nobody yet'}</strong>{l.handoff && <> · reason: {l.handoff.reason.replace('_', ' ')}</>}</p>
            {l.handoff ? <pre className="mt-3 whitespace-pre-wrap font-sans text-sm bg-plaster rounded-lg p-3">{l.handoff.summary}</pre> : <p className="text-sm text-moss mt-2">No handoff yet. The assistant is handling this buyer.</p>}
            {user.role === 'admin' && execs.data?.length > 0 && (
              <label className="text-sm flex items-center gap-2 mt-4">Reassign to
                <Select disabled={busy} value={l.assigned_to?.id || ''} onChange={(e) => act(async () => { await api(`/api/leads/${id}/assign`, { method: 'PATCH', body: { executive_id: +e.target.value } }); toast('Lead reassigned') })} className="!w-auto">
                  <option value="" disabled>Choose executive</option>{execs.data.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </label>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-bold">Conversation</h2>
              {l.conversation_status === 'human_active'
                ? <span className="flex items-center gap-2 text-sm"><Badge tone="warn"><UserRound className="size-3" aria-hidden />You’re chatting live. The assistant is paused.</Badge><Btn variant="ghost" className="!min-h-9" disabled={busy} onClick={() => act(async () => { await api(`/api/leads/${id}/resume-assistant`, { method: 'POST' }); toast('The assistant will answer the buyer again') })}><Bot className="size-4" aria-hidden />Hand back to assistant</Btn></span>
                : l.conversation_status ? <Badge tone="ok"><Bot className="size-3" aria-hidden />Assistant is answering</Badge> : null}
            </div>
            {l.messages.length === 0 ? <EmptyState title="No chat yet" body="This lead hasn’t opened the chat. The conversation will appear here." /> : (
              <ol className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1" aria-label="Chat messages">
                {l.messages.map((m) => (
                  <li key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.sender === 'buyer' ? 'self-start bg-plaster' : m.sender === 'executive' ? 'self-end bg-marigold text-ink' : 'self-end bg-pine text-paper'}`}>
                    <p className="whitespace-pre-wrap">{m.content}</p><p className={`text-[11px] mt-1 ${m.sender === 'buyer' ? 'text-moss' : m.sender === 'executive' ? 'text-ink/70' : 'text-paper/70'}`}>{m.sender === 'buyer' ? l.name : m.sender === 'executive' ? 'Sales team' : 'Visitly assistant'} · {fmtDateTime(m.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
            {l.messages.length > 0 && (
              <form className="flex gap-2 mt-4" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) act(async () => { await api(`/api/leads/${id}/reply`, { method: 'POST', body: { text: reply } }); setReply(''); toast('Reply sent to the buyer’s chat') }) }}>
                <textarea aria-label="Reply to the buyer" rows={2} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Reply to ${l.name.split(' ')[0]} in the chat. The assistant pauses while you’re live.`}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form.requestSubmit() }}
                  className="flex-1 resize-none rounded-lg border border-line bg-paper px-3 py-2 text-base focus:border-pine min-w-0" />
                <Btn type="submit" variant="accent" loading={busy} disabled={!reply.trim()} aria-label="Send reply" className="self-end"><SendHorizontal className="size-5" aria-hidden /></Btn>
              </form>
            )}
          </Card>
          <TasksCard lead={l} onDone={reload} />
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
          <CallsCard lead={l} onDone={reload} />
          <UnitsCard lead={l} onDone={reload} />
          <Card className="p-5">
            <h2 className="text-lg font-bold mb-2">Activity</h2>
            <form className="flex gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); if (note.trim()) act(async () => { await api(`/api/leads/${id}/notes`, { method: 'POST', body: { text: note } }); setNote(''); toast('Note added') }) }}>
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
