import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Info } from 'lucide-react'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { duration, inr, pct, sourceLabel } from '../../lib/format'
import { Card, EmptyState, ErrorState, Select, Skeleton } from '../../components/ui'

function Tile({ label, value, note, big }) {
  return (
    <Card className={`p-5 ${big ? 'md:col-span-2 bg-pine text-paper border-pine' : ''}`}>
      <p className={`text-sm ${big ? 'text-paper/75' : 'text-moss'}`}>{label}</p>
      <p className={`font-display font-bold mt-1 ${big ? 'text-5xl' : 'text-3xl'}`}>{value}</p>
      {note && <p className={`text-sm mt-2 ${big ? 'text-marigold' : 'text-moss'}`}>{note}</p>}
    </Card>
  )
}

export default function Dashboard() {
  const [days, setDays] = useState(60)
  const { data, loading, error, reload } = useFetch(() => api(`/api/analytics?days=${days}`), [days])
  const t = data?.totals
  const maxCpv = Math.max(1, ...(data?.by_source || []).map((s) => s.cost_per_visit || 0))
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Sales performance</h1>
          <p className="text-moss text-sm">How quickly enquiries are answered and how many turn into site visits.</p>
        </div>
        <label className="text-sm flex items-center gap-2">Period
          <Select value={days} onChange={(e) => setDays(+e.target.value)} className="!w-auto"><option value={30}>Last 30 days</option><option value={60}>Last 60 days</option><option value={90}>Last 90 days</option></Select>
        </label>
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
            <Tile big label="Average first response" value={duration(t.avg_first_response_seconds)} note={`${pct(t.within_sla_pct)} of enquiries answered within ${data.sla_seconds / 60} minutes`} />
            <Tile label="Leads" value={t.leads.toLocaleString('en-IN')} note={`${pct(t.booking_rate)} booked a visit`} />
            <Tile label="Visits booked" value={t.visits_booked} note={`${t.completed} completed`} />
            <Tile label="Show-up rate" value={pct(t.show_up_rate)} note={`Cost per visit ${inr(t.cost_per_visit)}`} />
          </div>

          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
            <Card className="p-5">
              <h2 className="text-lg font-bold mb-4">Leads per week</h2>
              <div className="h-64" role="img" aria-label="Bar chart of new leads per week">
                <ResponsiveContainer>
                  <BarChart data={data.leads_per_week.map((w) => ({ ...w, label: new Date(w.week).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }))}>
                    <CartesianGrid vertical={false} stroke="#c9d3cf" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="#5b7770" />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} stroke="#5b7770" />
                    <Tooltip cursor={{ fill: '#eef1ef' }} formatter={(v) => [v, 'Leads']} contentStyle={{ borderRadius: 8, border: '1px solid #c9d3cf' }} />
                    <Bar dataKey="leads" fill="#0e2f2b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="text-lg font-bold mb-1">Cost per completed visit</h2>
              <p className="text-xs text-moss mb-4">Ad spend for the period divided by visits completed, by source.</p>
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
                    <td className="px-5 py-3 font-medium">{sourceLabel(s.source)}</td>
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
