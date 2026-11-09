import { useEffect, useMemo, useState } from 'react'
import { Ban, CalendarClock, ChevronLeft, ChevronRight, LayoutGrid, List, Plus, Undo2, Wand2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { useAuth } from '../../context/auth'
import { useToast } from '../../components/Toast'
import { fmtDate, fmtTime, ymd } from '../../lib/format'
import { Badge, Btn, Card, EmptyState, ErrorState, Field, Input, Select, Skeleton } from '../../components/ui'

const PRESET_TIMES = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00']
const DAY = 864e5
const addDays = (isoDate, n) => ymd(new Date(new Date(`${isoDate}T12:00:00+05:30`).getTime() + n * DAY))
const mondayOf = (isoDate) => { const d = new Date(`${isoDate}T12:00:00+05:30`); const dow = (d.getUTCDay() + 6) % 7; return addDays(isoDate, -dow) }

function WeekView({ slots }) {
  const [monday, setMonday] = useState(() => mondayOf(ymd(new Date())))
  const days = useMemo(() => [...Array(7)].map((_, i) => addDays(monday, i)), [monday])
  const byDay = useMemo(() => slots.reduce((m, s) => { (m[ymd(new Date(s.start_time))] ||= []).push(s); return m }, {}), [slots])
  const label = (d) => fmtDate(`${d}T12:00:00+05:30`)
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">{label(days[0])} to {label(days[6])}</h2>
        <div className="flex gap-2">
          <Btn variant="ghost" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}><ChevronLeft className="size-4" /></Btn>
          <Btn variant="ghost" onClick={() => setMonday(mondayOf(ymd(new Date())))}>This week</Btn>
          <Btn variant="ghost" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}><ChevronRight className="size-4" /></Btn>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {days.map((d) => {
          const list = (byDay[d] || []).sort((a, b) => a.start_time.localeCompare(b.start_time))
          return (
            <section key={d} aria-label={label(d)} className={`rounded-lg border p-2 min-h-24 ${d === ymd(new Date()) ? 'border-pine' : 'border-line'}`}>
              <h3 className="text-xs font-semibold text-moss mb-1.5">{label(d)}</h3>
              {list.length === 0 ? <p className="text-xs text-moss">No slots</p> : (
                <ul className="flex flex-col gap-1">{list.map((s) => (
                  <li key={s.id} title={s.booking ? `Booked by ${s.booking.lead_name}` : s.status === 'open' ? 'Free' : 'Blocked'}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${s.booking ? 'bg-marigold text-ink' : s.status === 'open' ? 'bg-ok-soft text-ok' : 'bg-brick-soft text-brick line-through'}`}>
                    {fmtTime(s.start_time)}{s.booking && <span className="block font-normal truncate">{s.booking.lead_name}</span>}{!s.booking && s.status !== 'open' && <span className="sr-only"> blocked</span>}
                  </li>))}</ul>)}
            </section>
          )
        })}
      </div>
      <p className="text-xs text-moss mt-3 flex flex-wrap gap-x-4 gap-y-1"><span><span className="inline-block size-2.5 rounded-sm bg-ok-soft border border-ok/40 mr-1" />Free</span><span><span className="inline-block size-2.5 rounded-sm bg-marigold mr-1" />Booked</span><span><span className="inline-block size-2.5 rounded-sm bg-brick-soft border border-brick/40 mr-1" />Blocked</span></p>
    </Card>
  )
}

function Generator({ projectId, onDone }) {
  const { toast } = useToast()
  const [start, setStart] = useState(addDays(ymd(new Date()), 1))
  const [days, setDays] = useState(7)
  const [times, setTimes] = useState(['10:00', '11:00', '14:00', '16:00'])
  const [custom, setCustom] = useState('')
  const [dur, setDur] = useState(60)
  const [busy, setBusy] = useState(false)
  const toggle = (t) => setTimes((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t].sort()))
  const addCustom = () => { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(custom)) { setTimes((l) => [...new Set([...l, custom])].sort()); setCustom('') } }
  const run = async (e) => {
    e.preventDefault(); setBusy(true)
    try {
      const r = await api('/api/slots/bulk', { method: 'POST', body: { project_id: projectId, start_date: start, days: +days, times, duration_minutes: +dur } })
      toast(`Created ${r.created} slot${r.created === 1 ? '' : 's'}${r.skipped ? `, skipped ${r.skipped} (already exist, overlap or in the past)` : ''}`)
      onDone()
    } catch (x) { toast(x.message, { tone: 'error' }) } finally { setBusy(false) }
  }
  return (
    <Card className="p-4">
      <form onSubmit={run} className="flex flex-col gap-4">
        <div><h2 className="font-bold flex items-center gap-2"><Wand2 className="size-5" aria-hidden />Generate slots</h2><p className="text-sm text-moss">Add the same times on several days in one go. Times already taken are skipped.</p></div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="First day" htmlFor="gs"><Input id="gs" type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
          <Field label="Number of days" htmlFor="gd"><Input id="gd" type="number" min={1} max={30} value={days} onChange={(e) => setDays(e.target.value)} required /></Field>
          <Field label="Length" htmlFor="gl"><Select id="gl" value={dur} onChange={(e) => setDur(e.target.value)}>{[30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}</Select></Field>
        </div>
        <fieldset><legend className="text-sm font-medium mb-1.5">Start times (IST)</legend>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...PRESET_TIMES, ...times])].sort().map((t) => <button type="button" key={t} aria-pressed={times.includes(t)} onClick={() => toggle(t)} className={`min-h-10 rounded-lg border px-3 text-sm font-medium cursor-pointer ${times.includes(t) ? 'bg-pine text-paper border-pine' : 'border-line hover:border-pine'}`}>{t}</button>)}
            <span className="flex gap-1"><Input aria-label="Add another time" type="time" value={custom} onChange={(e) => setCustom(e.target.value)} className="!w-32" /><Btn type="button" variant="ghost" onClick={addCustom} disabled={!custom}><Plus className="size-4" />Add</Btn></span>
          </div>
        </fieldset>
        <Btn type="submit" variant="accent" loading={busy} disabled={!times.length} className="self-start">Generate {times.length * (+days || 0)} slots</Btn>
      </form>
    </Card>
  )
}

export default function Slots() {
  const { user } = useAuth()
  const { toast } = useToast()
  const admin = user.role === 'admin'
  const projects = useFetch(() => api('/api/projects'), [])
  const [pid, setPid] = useState(null)
  const [view, setView] = useState('week')
  useEffect(() => { if (projects.data?.length && !pid) setPid(projects.data[0].id) }, [projects.data, pid])
  const slots = useFetch(() => (pid ? api(`/api/slots?project_id=${pid}`) : Promise.resolve([])), [pid])
  const [date, setDate] = useState(ymd(new Date(Date.now() + DAY)))
  const [time, setTime] = useState('10:00')
  const [dur, setDur] = useState(60)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const run = async (fn, msg) => { setBusy(true); setErr(null); try { await fn(); await slots.reload(); if (msg) toast(msg) } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  const add = (e) => { e.preventDefault(); run(() => api('/api/slots', { method: 'POST', body: { project_id: pid, start_time: `${date}T${time}:00+05:30`, duration_minutes: +dur } }), 'Slot added') }
  const toggle = (s) => run(() => api(`/api/slots/${s.id}`, { method: 'PATCH', body: { status: s.status === 'open' ? 'blocked' : 'open' } }), s.status === 'open' ? 'Slot blocked. Buyers can no longer book it.' : 'Slot reopened')

  const groups = (slots.data || []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time)).reduce((m, s) => { const k = fmtDate(s.start_time); (m[k] ||= []).push(s); return m }, {})
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold">Visit slots</h1><p className="text-moss text-sm">Times buyers can book. A slot holds one visit; a booked slot can’t be blocked.</p></div>
        <div className="flex items-center gap-2">
          {projects.data && <Select aria-label="Project" value={pid || ''} onChange={(e) => setPid(+e.target.value)} className="!w-auto">{projects.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
          <div className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label="View">
            {[['week', LayoutGrid, 'Week'], ['list', List, 'List']].map(([v, I, l]) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`min-h-11 px-3 text-sm font-medium flex items-center gap-1.5 cursor-pointer ${view === v ? 'bg-pine text-paper' : 'hover:bg-plaster'}`}><I className="size-4" aria-hidden />{l}</button>)}
          </div>
        </div>
      </div>
      {admin && pid && <Generator projectId={pid} onDone={slots.reload} />}
      {admin && (
        <Card className="p-4"><form onSubmit={add} className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          <Field label="Add one slot: date" htmlFor="d"><Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Start time (IST)" htmlFor="t"><Input id="t" type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
          <Field label="Length" htmlFor="l"><Select id="l" value={dur} onChange={(e) => setDur(e.target.value)}>{[30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}</Select></Field>
          <Btn type="submit" variant="ghost" loading={busy}><Plus className="size-4" />Add slot</Btn></form></Card>
      )}
      {err && <ErrorState compact error={{ message: err }} />}
      {(projects.error || slots.error) && <ErrorState error={projects.error || slots.error} onRetry={() => { projects.reload(); slots.reload() }} />}
      {slots.loading && !slots.data && <Skeleton className="h-48" />}
      {slots.data?.length === 0 && <Card><EmptyState icon={CalendarClock} title="No slots yet" body={admin ? 'Generate a week of times above. Buyers see them as soon as they’re saved.' : 'Ask the sales head to add visit times.'} /></Card>}
      {slots.data?.length > 0 && view === 'week' && <WeekView slots={slots.data} />}
      {view === 'list' && Object.entries(groups).map(([day, list]) => (
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
