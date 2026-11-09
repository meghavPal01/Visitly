import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { useFetch } from '../lib/hooks'
import { fmtDate, fmtDateTime, fmtTime, ymd } from '../lib/format'
import { Btn, EmptyState, ErrorState, Select, Skeleton } from './ui'

export default function VisitPicker({ projectId, existing, onClose, onDone }) {
  const projects = useFetch(() => api('/api/public/projects', { kind: 'buyer' }), [])
  const [pid, setPid] = useState(projectId || '')
  const days = useMemo(() => [...Array(7)].map((_, i) => ymd(new Date(Date.now() + i * 864e5))), [])
  const [day, setDay] = useState(days[0])
  const [sel, setSel] = useState(null)
  const touched = useRef(false) // buyer picked a day themselves
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const slots = useFetch(() => (pid ? api(`/api/public/slots?project_id=${pid}&day=${day}`, { kind: 'buyer' }) : Promise.resolve([])), [pid, day])

  // Open on the first day that actually has free times (today is often already full or past).
  useEffect(() => {
    if (touched.current || slots.loading || slots.error || !slots.data || slots.data.length) return
    const i = days.indexOf(day)
    if (i >= 0 && i < days.length - 1) setDay(days[i + 1])
  }, [slots.data, slots.loading, slots.error, day, days])
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  useEffect(() => { if (!pid && projects.data?.length) setPid(projects.data[0].id) }, [projects.data, pid])

  const run = async (fn) => {
    setBusy(true); setErr(null)
    try { onDone(await fn()) } catch (e) {
      setErr(e.message)
      if (e.code === 'slot_unavailable') { setSel(null); slots.reload() }
    } finally { setBusy(false) }
  }
  const confirm = () => run(() => existing
    ? api(`/api/buyer/bookings/${existing.id}/reschedule`, { method: 'POST', kind: 'buyer', body: { new_slot_id: sel } })
    : api('/api/buyer/bookings', { method: 'POST', kind: 'buyer', body: { slot_id: sel } }))
  const cancel = () => run(() => api(`/api/buyer/bookings/${existing.id}/cancel`, { method: 'POST', kind: 'buyer' }))

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-pine/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={existing ? 'Change your visit' : 'Pick a visit time'} onClick={(e) => e.stopPropagation()}
        className="bg-paper w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92dvh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div><h2 className="text-xl font-bold">{existing ? 'Change your visit' : 'Pick a visit time'}</h2>{existing && <p className="text-sm text-moss">Currently {fmtDateTime(existing.slot.start_time)}</p>}</div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2 cursor-pointer"><X className="size-5" /></button>
        </div>
        {projects.data && projects.data.length > 1 && (
          <label className="block text-sm font-medium mb-3">Project
            <Select value={pid} onChange={(e) => { setPid(+e.target.value); setSel(null) }} className="mt-1.5"><option value="" disabled>Choose a project</option>{projects.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
        )}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" role="tablist" aria-label="Choose a day">
          {days.map((d) => { const iso = `${d}T12:00:00+05:30`; const on = d === day; const [wd, ...rest] = fmtDate(iso).split(',')
            return <button key={d} role="tab" aria-selected={on} onClick={() => { touched.current = true; setDay(d); setSel(null) }} className={`shrink-0 w-16 rounded-xl py-2 text-center border cursor-pointer ${on ? 'bg-pine text-paper border-pine' : 'border-line hover:border-pine'}`}>
              <span className="block text-xs">{wd}</span><span className="block font-display font-bold text-lg">{rest.join('').trim().split(' ')[0]}</span><span className="block text-xs">{rest.join('').trim().split(' ')[1]}</span></button> })}
        </div>
        <div className="mt-3 min-h-28" aria-live="polite">
          {!pid ? <p className="text-sm text-moss py-6 text-center">Choose a project to see free times.</p>
            : slots.loading ? <div className="grid grid-cols-3 gap-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
            : slots.error ? <ErrorState compact error={slots.error} onRetry={slots.reload} />
            : slots.data.length === 0 ? <EmptyState title="No free times this day" body="Pick another day. New times appear as the sales team opens them." />
            : <div className="grid grid-cols-3 gap-2">{slots.data.map((s) => <button key={s.id} aria-pressed={sel === s.id} onClick={() => setSel(s.id)} className={`min-h-11 rounded-lg border text-sm font-semibold cursor-pointer ${sel === s.id ? 'bg-marigold border-marigold text-ink' : 'border-line hover:border-pine'}`}>{fmtTime(s.start_time)}</button>)}</div>}
        </div>
        {err && <p role="alert" className="text-sm text-brick bg-brick-soft rounded-lg p-3 mt-3">{err}</p>}
        <div className="flex flex-col gap-2 mt-4">
          <Btn variant="primary" disabled={!sel} loading={busy} onClick={confirm}>{existing ? 'Move my visit here' : 'Confirm this time'}</Btn>
          {existing && <Btn variant="danger" disabled={busy} onClick={cancel}>Cancel my visit</Btn>}
        </div>
      </div>
    </div>
  )
}
