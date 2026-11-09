import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Download, Search, Users } from 'lucide-react'
import { api, session } from '../../lib/api'
import { useToast } from '../../components/Toast'
import { useDebounced, useFetch } from '../../lib/hooks'
import { fmtDateTime, sourceLabel, statusLabel } from '../../lib/format'
import { Badge, Btn, Card, EmptyState, ErrorState, Input, Select, Skeleton } from '../../components/ui'

const STATUS_TONE = { new: 'warn', contacted: 'neutral', visit_booked: 'ok', visited: 'ok', negotiation: 'warn', won: 'ink', lost: 'bad' }
export const StatusBadge = ({ s }) => <Badge tone={STATUS_TONE[s] || 'neutral'}>{statusLabel(s)}</Badge>

export default function Leads() {
  const [sp] = useSearchParams()
  const { toast } = useToast()
  const searchRef = useRef(null)
  const [q, setQ] = useState('')
  const [source, setSource] = useState(sp.get('source') || '')  // e.g. arriving from a dashboard row
  const [status, setStatus] = useState(sp.get('status') || '')
  const [dups, setDups] = useState(false)
  const [exporting, setExporting] = useState(false)
  useEffect(() => { if (sp.get('focus') === 'search') searchRef.current?.focus() }, [sp])
  const [page, setPage] = useState(1)
  const dq = useDebounced(q)
  const qs = new URLSearchParams({ page, ...(dq && { search: dq }), ...(source && { source }), ...(status && { status }), ...(dups && { duplicates_only: true }) })
  const { data, loading, error, reload } = useFetch(() => api(`/api/leads?${qs}`), [qs.toString()])
  const reset = (fn) => (e) => { fn(e.target.type === 'checkbox' ? e.target.checked : e.target.value); setPage(1) }
  const exportCsv = async () => {
    setExporting(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/leads/export.csv?${new URLSearchParams({ ...(dq && { search: dq }), ...(source && { source }), ...(status && { status }), ...(dups && { duplicates_only: true }) })}`,
        { headers: { Authorization: `Bearer ${session.get('staff')?.token}` } })
      if (!res.ok) throw new Error('The export failed. Try again.')
      const url = URL.createObjectURL(await res.blob())
      const a = Object.assign(document.createElement('a'), { href: url, download: `visitly-leads-${new Date().toISOString().slice(0, 10)}.csv` })
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      toast('Leads exported. Phone numbers are masked unless you are an admin.')
    } catch (e) { toast(e.message || 'The export failed. Try again.', { tone: 'error' }) } finally { setExporting(false) }
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-bold">Leads</h1><p className="text-moss text-sm">Every enquiry from every source in one list. Phone numbers are masked here and shown on the lead page.</p></div>
        <Btn variant="ghost" loading={exporting} onClick={exportCsv}><Download className="size-4" aria-hidden />Export CSV</Btn></div>
      <Card className="p-3 grid gap-3 md:grid-cols-[1fr_auto_auto_auto] items-center">
        <div className="relative"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-moss" aria-hidden /><Input ref={searchRef} id="lead-search" aria-label="Search by name or phone" placeholder="Search name or phone (press /)" value={q} onChange={reset(setQ)} className="!pl-9" /></div>
        <Select aria-label="Source" value={source} onChange={reset(setSource)}><option value="">All sources</option>{['portal', 'social', 'website', 'hoarding'].map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}</Select>
        <Select aria-label="Status" value={status} onChange={reset(setStatus)}><option value="">All statuses</option>{['new', 'contacted', 'visit_booked', 'visited', 'negotiation', 'won', 'lost'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</Select>
        <label className="flex items-center gap-2 text-sm min-h-11 px-2 cursor-pointer"><input type="checkbox" checked={dups} onChange={reset(setDups)} className="size-4 accent-pine" />Possible duplicates only</label>
      </Card>

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <div className="flex flex-col gap-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>}
      {data && data.items.length === 0 && <Card><EmptyState icon={Users} title="No leads match" body="Clear a filter or search for a different name or number." action={<Btn variant="ghost" onClick={() => { setQ(''); setSource(''); setStatus(''); setDups(false) }}>Clear filters</Btn>} /></Card>}

      {data && data.items.length > 0 && (
        <>
          <Card className="hidden md:block overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-moss border-b border-line bg-plaster/50">{['Name', 'Phone', 'Source', 'Status', 'Assigned to', 'Created'].map((h) => <th key={h} className="font-medium px-4 py-3">{h}</th>)}</tr></thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id} className="border-b border-line/60 last:border-0 hover:bg-plaster/40">
                    <td className="px-4 py-3"><Link to={`/app/leads/${l.id}`} className="font-semibold underline-offset-4 hover:underline">{l.name}</Link> {l.duplicate_of && <Badge tone="warn" title={`Same phone as lead #${l.duplicate_of}`}><Copy className="size-3" aria-hidden />Possible duplicate</Badge>} {l.is_synthetic && <span className="text-xs text-moss">sample</span>}</td>
                    <td className="px-4 py-3 tabular-nums">{l.phone}</td><td className="px-4 py-3">{sourceLabel(l.source)}</td>
                    <td className="px-4 py-3"><StatusBadge s={l.status} /></td>
                    <td className="px-4 py-3">{l.assigned_to?.name || <span className="text-moss">Unassigned</span>}</td>
                    <td className="px-4 py-3 text-moss">{fmtDateTime(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <ul className="md:hidden flex flex-col gap-2">
            {data.items.map((l) => (
              <li key={l.id}><Link to={`/app/leads/${l.id}`} className="block rounded-xl border border-line bg-paper p-4 active:bg-plaster">
                <div className="flex justify-between gap-2"><span className="font-semibold">{l.name}</span><StatusBadge s={l.status} /></div>
                <p className="text-sm text-moss mt-1">{l.phone} · {sourceLabel(l.source)}</p>
                <p className="text-xs text-moss mt-1">{l.assigned_to?.name || 'Unassigned'} · {fmtDateTime(l.created_at)}</p>
                {l.duplicate_of && <div className="mt-2"><Badge tone="warn"><Copy className="size-3" aria-hidden />Possible duplicate</Badge></div>}
              </Link></li>
            ))}
          </ul>
          <div className="flex items-center justify-between text-sm">
            <span className="text-moss">{data.total} leads · page {page} of {pages}</span>
            <div className="flex gap-2">
              <Btn variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Btn>
              <Btn variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Btn>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
