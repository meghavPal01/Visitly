import { useEffect, useState } from 'react'
import { Ban, CalendarClock, Plus, Undo2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { useAuth } from '../../context/auth'
import { fmtDate, fmtTime, ymd } from '../../lib/format'
import { Badge, Btn, Card, EmptyState, ErrorState, Field, Input, Select, Skeleton } from '../../components/ui'

export default function Slots() {
  const { user } = useAuth()
  const admin = user.role === 'admin'
  const projects = useFetch(() => api('/api/projects'), [])
  const [pid, setPid] = useState(null)
  useEffect(() => { if (projects.data?.length && !pid) setPid(projects.data[0].id) }, [projects.data, pid])
  const slots = useFetch(() => (pid ? api(`/api/slots?project_id=${pid}`) : Promise.resolve([])), [pid])
  const [date, setDate] = useState(ymd(new Date(Date.now() + 864e5)))
  const [time, setTime] = useState('10:00')
  const [dur, setDur] = useState(60)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); await slots.reload() } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  const add = (e) => { e.preventDefault(); run(() => api('/api/slots', { method: 'POST', body: { project_id: pid, start_time: `${date}T${time}:00+05:30`, duration_minutes: +dur } })) }
  const toggle = (s) => run(() => api(`/api/slots/${s.id}`, { method: 'PATCH', body: { status: s.status === 'open' ? 'blocked' : 'open' } }))

  const groups = (slots.data || []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time)).reduce((m, s) => { const k = fmtDate(s.start_time); (m[k] ||= []).push(s); return m }, {})
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold">Visit slots</h1><p className="text-moss text-sm">Times buyers can book. A slot holds one visit; a booked slot can’t be blocked.</p></div>
        {projects.data && <Select aria-label="Project" value={pid || ''} onChange={(e) => setPid(+e.target.value)} className="!w-auto">{projects.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
      </div>
      {admin && (
        <Card className="p-4"><form onSubmit={add} className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          <Field label="Date" htmlFor="d"><Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Start time (IST)" htmlFor="t"><Input id="t" type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
          <Field label="Length" htmlFor="l"><Select id="l" value={dur} onChange={(e) => setDur(e.target.value)}>{[30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}</Select></Field>
          <Btn type="submit" variant="accent" loading={busy}><Plus className="size-4" />Add slot</Btn></form></Card>
      )}
      {err && <ErrorState compact error={{ message: err }} />}
      {(projects.error || slots.error) && <ErrorState error={projects.error || slots.error} onRetry={() => { projects.reload(); slots.reload() }} />}
      {slots.loading && !slots.data && <Skeleton className="h-48" />}
      {slots.data?.length === 0 && <Card><EmptyState icon={CalendarClock} title="No slots yet" body={admin ? 'Add a date and time above. Buyers see it as soon as it’s saved.' : 'Ask the sales head to add visit times.'} /></Card>}
      {Object.entries(groups).map(([day, list]) => (
        <Card key={day} className="p-4"><h2 className="font-bold mb-3">{day}</h2>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{list.map((s) => (
            <li key={s.id} className="rounded-lg border border-line p-3 flex items-center justify-between gap-2">
              <div><p className="font-display font-bold text-lg">{fmtTime(s.start_time)}</p>
                {s.booking ? <p className="text-sm">Booked by <strong>{s.booking.lead_name}</strong></p> : <Badge tone={s.status === 'open' ? 'ok' : 'bad'}>{s.status === 'open' ? 'Free' : 'Blocked'}</Badge>}</div>
              {admin && !s.booking && <Btn variant="ghost" disabled={busy} onClick={() => toggle(s)} aria-label={`${s.status === 'open' ? 'Block' : 'Reopen'} ${fmtTime(s.start_time)}`}>{s.status === 'open' ? <><Ban className="size-4" />Block</> : <><Undo2 className="size-4" />Reopen</>}</Btn>}
            </li>))}</ul></Card>
      ))}
    </div>
  )
}
