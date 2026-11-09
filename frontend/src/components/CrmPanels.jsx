import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, GitMerge, Phone, WalletCards } from 'lucide-react'
import { api } from '../lib/api'
import { useFetch } from '../lib/hooks'
import { useAuth } from '../context/auth'
import { fmtDateTime, inr, sourceLabel, statusLabel } from '../lib/format'
import { useToast } from './Toast'
import { Badge, Btn, Card, ErrorState, Field, Input, Select } from './ui'

function useAct(onDone) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const act = async (fn) => { setBusy(true); setErr(null); try { await fn(); await onDone() } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  return { busy, err, act }
}

const LANG = { en: 'English', hi: 'Hindi', gu: 'Gujarati' }

export function MergeBanner({ lead, onDone }) {
  const { busy, err, act } = useAct(onDone)
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const d = lead.duplicate
  if (!d) return null
  const rows = [
    ['Name', lead.name, d.name], ['Source', sourceLabel(lead.source), sourceLabel(d.source)], ['Stage', statusLabel(lead.status), statusLabel(d.status)],
    ['BHK', lead.bhk || '—', d.bhk || '—'], ['Budget', lead.budget_lakh ? `₹${lead.budget_lakh} lakh` : '—', d.budget_lakh ? `₹${d.budget_lakh} lakh` : '—'],
    ['Language', LANG[lead.language], LANG[d.language]], ['Visits', lead.bookings.length, d.bookings], ['Assigned to', lead.assigned_to?.name || 'Nobody', d.assigned_to || 'Nobody'],
    ['Created', fmtDateTime(lead.created_at), fmtDateTime(d.created_at)],
  ]
  return (
    <div className="bg-marigold-soft rounded-lg p-3 text-sm flex flex-col gap-3">
      <p className="flex items-start gap-2"><GitMerge className="size-4 mt-0.5 shrink-0" aria-hidden />
        <span>Same phone number as <Link to={`/app/leads/${d.id}`} className="font-semibold underline">{d.name}</Link>. Compare them, then merge to keep one record, or leave both if they are different people. Nothing is merged automatically.</span></p>
      {!open ? <Btn variant="ghost" className="self-start bg-paper" onClick={() => setOpen(true)}>Compare and merge</Btn> : (
        <>
          <div className="overflow-x-auto rounded-lg bg-paper"><table className="w-full text-sm min-w-[420px]">
            <thead><tr className="text-left text-moss border-b border-line"><th className="font-medium px-3 py-2"><span className="sr-only">Field</span></th><th className="font-medium px-3 py-2">This lead (will be merged away)</th><th className="font-medium px-3 py-2">{d.name} (kept)</th></tr></thead>
            <tbody>{rows.map(([k, a, b]) => <tr key={k} className="border-b border-line/60 last:border-0"><th scope="row" className="text-left font-medium text-moss px-3 py-2">{k}</th><td className="px-3 py-2">{a}</td><td className="px-3 py-2">{b}</td></tr>)}</tbody>
          </table></div>
          <p>Chats, visits, notes and payments from this lead move to <strong>{d.name}</strong>. Empty fields on {d.name} are filled from this lead. This can’t be undone.</p>
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" loading={busy} onClick={() => act(async () => { const r = await api(`/api/leads/${lead.id}/merge`, { method: 'POST', body: { into_id: d.id } }); toast(`Merged into ${d.name}`); window.location.assign(`/app/leads/${r.id}`) })}>Merge into {d.name}</Btn>
            <Btn variant="ghost" className="bg-paper" onClick={() => setOpen(false)}>Keep both</Btn>
          </div>
        </>)}
      {err && <p role="alert" className="text-brick">{err}</p>}
    </div>
  )
}

export function TasksCard({ lead, onDone }) {
  const { busy, err, act } = useAct(onDone)
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold mb-3">Follow-ups</h2>
      <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto] mb-3" onSubmit={(e) => { e.preventDefault(); act(async () => { await api(`/api/leads/${lead.id}/tasks`, { method: 'POST', body: { title, due_at: new Date(due).toISOString() } }); setTitle(''); setDue(''); toast('Follow-up added') }) }}>
        <Input aria-label="Follow-up task" placeholder="e.g. Send brochure" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        <Input aria-label="Due date and time" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        <Btn type="submit" loading={busy} disabled={!title.trim() || !due}>Add</Btn>
      </form>
      {err && <p role="alert" className="text-sm text-brick mb-2">{err}</p>}
      {lead.tasks.length === 0 ? <p className="text-sm text-moss">No follow-ups yet. Add one so this lead doesn’t go quiet.</p> : (
        <ul className="flex flex-col gap-1">{lead.tasks.map((t) => (
          <li key={t.id}><button disabled={t.done || busy} onClick={() => act(() => api(`/api/tasks/${t.id}/done`, { method: 'PATCH' }))} className="w-full flex items-center gap-2 text-left text-sm min-h-10 cursor-pointer disabled:cursor-default" aria-label={t.done ? `${t.title}, done` : `Mark ${t.title} done`}>
            {t.done ? <CheckCircle2 className="size-5 text-ok shrink-0" /> : <Circle className="size-5 text-moss shrink-0" />}
            <span className={t.done ? 'line-through text-moss' : ''}>{t.title}</span><span className="ml-auto text-xs text-moss shrink-0">{fmtDateTime(t.due_at)}</span></button></li>))}</ul>)}
    </Card>
  )
}

const OUTCOMES = [['connected', 'Connected'], ['no_answer', 'No answer'], ['busy', 'Busy'], ['wrong_number', 'Wrong number'], ['callback_requested', 'Callback requested']]
export function CallsCard({ lead, onDone }) {
  const { busy, err, act } = useAct(onDone)
  const { toast } = useToast()
  const [outcome, setOutcome] = useState('connected')
  const [secs, setSecs] = useState(60)
  const [notes, setNotes] = useState('')
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1"><h2 className="text-lg font-bold flex items-center gap-2"><Phone className="size-5" aria-hidden />Calls</h2><Badge tone="ink">Simulated</Badge></div>
      <p className="text-xs text-moss mb-3">No real call is placed. Log what happened so the timeline stays complete.</p>
      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); act(async () => { await api(`/api/leads/${lead.id}/calls`, { method: 'POST', body: { outcome, duration_sec: outcome === 'connected' ? +secs : 0, notes: notes || null } }); setNotes(''); toast('Call logged (simulated)') }) }}>
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Call outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Input aria-label="Call length in seconds" type="number" min={0} max={7200} disabled={outcome !== 'connected'} value={outcome === 'connected' ? secs : 0} onChange={(e) => setSecs(e.target.value)} />
        </div>
        <Input aria-label="Call notes" placeholder="Notes (optional)" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        <Btn type="submit" variant="ghost" loading={busy}>Log call</Btn>
      </form>
      {err && <p role="alert" className="text-sm text-brick mt-2">{err}</p>}
      {lead.calls.length > 0 && <ul className="mt-3 flex flex-col gap-1.5 text-sm">{lead.calls.slice(0, 4).map((c) => <li key={c.id} className="flex justify-between gap-2"><span>{c.outcome.replace('_', ' ')}{c.duration_sec ? `, ${c.duration_sec}s` : ''}{c.notes ? ` · ${c.notes}` : ''}</span><span className="text-xs text-moss shrink-0">{fmtDateTime(c.created_at)}</span></li>)}</ul>}
    </Card>
  )
}

const UTONE = { available: 'ok', held: 'warn', allotted: 'ink' }
export function UnitsCard({ lead, onDone }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const pid = lead.project_id
  const units = useFetch(() => (pid ? api(`/api/projects/${pid}/units`) : Promise.resolve([])), [pid])
  const { busy, err, act } = useAct(async () => { await units.reload(); await onDone() })
  const [unit, setUnit] = useState('')
  const [outcome, setOutcome] = useState('success')
  const [amount, setAmount] = useState(50000)
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1"><h2 className="text-lg font-bold flex items-center gap-2"><WalletCards className="size-5" aria-hidden />Token payment and unit</h2><Badge tone="ink">Simulated</Badge></div>
      <p className="text-xs text-moss mb-3">Pick an outcome to see how a paid token holds a unit. No card or bank details are collected or sent anywhere.</p>
      {!pid ? <p className="text-sm text-moss">This lead hasn’t chosen a project yet, so there are no units to hold.</p> : units.error ? <ErrorState compact error={units.error} onRetry={units.reload} /> : (
        <>
          <ul className="grid grid-cols-2 gap-2 mb-3">{(units.data || []).map((u) => (
            <li key={u.id} className="rounded-lg border border-line p-2.5 text-sm"><div className="flex justify-between"><strong>{u.label}</strong><Badge tone={UTONE[u.status]}>{u.status}</Badge></div><p className="text-xs text-moss">{u.bhk} BHK{u.held_by ? ` · ${u.held_by.id === lead.id ? 'this lead' : u.held_by.name}` : ''}</p>
              {user.role === 'admin' && u.status === 'held' && <div className="flex gap-1.5 mt-2"><Btn variant="accent" className="!min-h-9 !px-2.5 text-xs" disabled={busy} onClick={() => act(() => api(`/api/units/${u.id}/allot`, { method: 'POST' }))}>Allot</Btn><Btn variant="ghost" className="!min-h-9 !px-2.5 text-xs" disabled={busy} onClick={() => act(() => api(`/api/units/${u.id}/release`, { method: 'POST' }))}>Release</Btn></div>}</li>))}</ul>
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); act(async () => { await api(`/api/leads/${lead.id}/payments`, { method: 'POST', body: { unit_id: +unit, outcome, amount_inr: +amount } }); toast(outcome === 'success' ? 'Payment recorded (simulated). Unit held.' : `Payment ${outcome} (simulated)`) }) }}>
            <Field label="Unit" htmlFor="unit"><Select id="unit" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">Choose a unit</option>{(units.data || []).filter((u) => u.status === 'available' || (u.status === 'held' && u.held_by?.id === lead.id)).map((u) => <option key={u.id} value={u.id}>{u.label} ({u.bhk} BHK)</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Token amount (₹)" htmlFor="amt"><Input id="amt" type="number" min={1000} max={500000} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="Simulated result" htmlFor="oc"><Select id="oc" value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="success">Success</option><option value="failed">Failed</option><option value="pending">Pending</option></Select></Field>
            </div>
            <Btn type="submit" variant="ghost" loading={busy} disabled={!unit}>Record payment</Btn>
          </form>
        </>)}
      {err && <p role="alert" className="text-sm text-brick mt-2">{err}</p>}
      {lead.payments.length > 0 && <ul className="mt-3 flex flex-col gap-1.5 text-sm">{lead.payments.slice(0, 4).map((p) => <li key={p.id} className="flex justify-between gap-2"><span>{inr(p.amount_inr)} for {p.unit}</span><Badge tone={p.status === 'success' ? 'ok' : p.status === 'failed' ? 'bad' : 'warn'}>{p.status}</Badge></li>)}</ul>}
    </Card>
  )
}
