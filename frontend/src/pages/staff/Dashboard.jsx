import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, BarChart3, Info, Minus } from 'lucide-react'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { delta, duration, inr, pct, sourceLabel } from '../../lib/format'
import { Card, EmptyState, ErrorState, Select, Skeleton } from '../../components/ui'

function Change({ d, big }) {
  if (!d) return null
  const Icon = d.dir === 'up' ? ArrowUpRight : d.dir === 'down' ? ArrowDownRight : Minus
  const color = d.good == null ? '' : d.good ? (big ? 'text-ok-inv' : 'text-ok') : (big ? 'text-brick-inv' : 'text-brick')
  return <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}><Icon className="size-3.5" aria-hidden />{d.label}<span className="sr-only"> {d.good == null ? '' : d.good ? 'better' : 'worse'} than the previous period</span></span>
}

function Tile({ label, value, note, big, change }) {
  return (
    <Card className={`p-5 ${big ? 'md:col-span-2 bg-pine text-paper border-pine' : ''}`}>
      <p className={`text-sm ${big ? 'text-paper/75' : 'text-moss'}`}>{label}</p>
      <p className={`font-display font-bold mt-1 flex items-baseline gap-2 flex-wrap ${big ? 'text-5xl' : 'text-3xl'}`}>{value}<Change d={change} big={big} /></p>
      {note && <p className={`text-sm mt-2 ${big ? 'text-note-inv' : 'text-moss'}`}>{note}</p>}
    </Card>
  )
}

export default function Dashboard() {
  const [days, setDays] = useState(60)
  const [compare, setCompare] = useState(true)
  const { data, loading, error, reload } = useFetch(() => api(`/api/analytics?days=${days}`), [days])
  const t = data?.totals
  const pv = compare ? data?.previous_totals : null
  const maxCpv = Math.max(1, ...(data?.by_source || []).map((s) => s.cost_per_visit || 0))
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Sales performance</h1>
          <p className="text-moss text-sm">How quickly enquiries are answered and how many turn into site visits.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="size-4 accent-pine" />Compare with previous period</label>
          <label className="text-sm flex items-center gap-2">Period
            <Select value={days} onChange={(e) => setDays(+e.target.value)} className="!w-auto">{[7, 14, 30, 60, 90, 180].map((d) => <option key={d} value={d}>Last {d} days</option>)}</Select>
          </label>
        </div>
      </div>

      {data?.is_synthetic_data && (
        <p className="flex items-start gap-2 text-sm bg-marigold-soft rounded-lg p-3"><Info className="size-4 mt-0.5 shrink-0" aria-hidden />These figures are calculated from sample leads, bookings and ad spend created for this demo. They are not client data.</p>
      )}
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <div className="grid md:grid-cols-5 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>}

      {t && t.leads === 0 && <Card><EmptyState icon={BarChart3} title="No leads in this period" body="Try a longer period, or start an enquiry from the buyer page to see numbers appear here." /></Card>}
      {t && t.leads > 0 && (
        <>
          <div className="grid md:grid-cols-5 gap-4">
            <Tile big label="Average first response" value={duration(t.avg_first_response_seconds)} change={pv && delta(t.avg_first_response_seconds, pv.avg_first_response_seconds, { lowerIsBetter: true })} note={`${pct(t.within_sla_pct)} of enquiries answered within ${data.sla_seconds / 60} minutes`} />
            <Tile label="Leads" value={t.leads.toLocaleString('en-IN')} change={pv && delta(t.leads, pv.leads)} note={`${pct(t.booking_rate)} booked a visit`} />
            <Tile label="Visits booked" value={t.visits_booked} change={pv && delta(t.visits_booked, pv.visits_booked)} note={`${t.completed} completed`} />
            <Tile label="Show-up rate" value={pct(t.show_up_rate)} change={pv && delta(t.show_up_rate, pv.show_up_rate, { kind: 'ratio' })} note={`Cost per visit ${inr(t.cost_per_visit)}`} />
          </div>

          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
            <Card className="p-5">
              <h2 className="text-lg font-bold mb-4">Leads per week</h2>
              <div className="h-64" role="img" aria-label="Bar chart of new leads per week">
                <ResponsiveContainer>
                  <BarChart data={data.leads_per_week.map((w) => ({ ...w, label: new Date(w.week).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }))}>
                    <CartesianGrid vertical={false} stroke="var(--color-line)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-moss)" />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} stroke="var(--color-moss)" />
                    <Tooltip cursor={{ fill: 'var(--color-plaster)' }} formatter={(v) => [v, 'Leads']} contentStyle={{ borderRadius: 8, border: '1px solid var(--color-line)', background: 'var(--color-paper)', color: 'var(--color-pine)' }} />
                    <Bar dataKey="leads" fill="var(--color-pine)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="text-lg font-bold mb-1">Cost per completed visit</h2>
              <p className="text-xs text-moss mb-4">Ad spend for the period divided by visits completed, by source. Select a source in the table to see its leads.</p>
              <ul className="flex flex-col gap-3">
                {data.by_source.map((s) => (
                  <li key={s.source}>
                    <div className="flex justify-between text-sm"><span>{sourceLabel(s.source)}</span><span className="font-semibold">{inr(s.cost_per_visit)}</span></div>
                    <div className="h-2 rounded-full bg-plaster mt-1"><div className="h-2 rounded-full bg-marigold" style={{ width: `${((s.cost_per_visit || 0) / maxCpv) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <caption className="text-left text-lg font-bold p-5 pb-3">Performance by source</caption>
              <thead><tr className="text-left text-moss border-b border-line">{['Source', 'Leads', 'Visits booked', 'Show-up', 'Ad spend', 'Cost per visit'].map((h, i) => <th key={h} className={`font-medium px-5 py-2 ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {data.by_source.map((s) => (
                  <tr key={s.source} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3 font-medium"><Link to={`/app/leads?source=${s.source}`} className="underline-offset-4 hover:underline" title="See these leads">{sourceLabel(s.source)}</Link></td>
                    <td className="px-5 py-3 text-right">{s.leads}</td><td className="px-5 py-3 text-right">{s.visits_booked}</td>
                    <td className="px-5 py-3 text-right">{pct(s.show_up_rate)}</td><td className="px-5 py-3 text-right">{inr(s.spend_inr)}</td>
                    <td className="px-5 py-3 text-right font-semibold">{inr(s.cost_per_visit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}
