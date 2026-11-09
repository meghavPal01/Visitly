import { ScrollText } from 'lucide-react'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { fmtDateTime } from '../../lib/format'
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui'

const LABEL = { 'factsheet.update': 'Fact sheet edited', 'slot.create': 'Slot added', 'slot.bulk': 'Slots generated', 'slot.blocked': 'Slot blocked', 'slot.open': 'Slot reopened',
  'lead.assign': 'Lead reassigned', 'lead.merge': 'Leads merged', 'unit.allot': 'Unit allotted', 'unit.release': 'Hold released' }

export default function Audit() {
  const { data, loading, error, reload } = useFetch(() => api('/api/audit?limit=150'), [])
  return (
    <div className="flex flex-col gap-5">
      <div><h1 className="text-3xl font-bold">Activity log</h1><p className="text-moss text-sm max-w-2xl">Who changed project facts, slots, assignments, merges and unit allotments. Entries can’t be edited or deleted.</p></div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-64" />}
      {data?.length === 0 && <Card><EmptyState icon={ScrollText} title="Nothing logged yet" body="Changes made by admins appear here as they happen." /></Card>}
      {data?.length > 0 && (
        <Card className="overflow-x-auto"><table className="w-full text-sm min-w-[560px]">
          <thead><tr className="text-left text-moss border-b border-line bg-plaster/50"><th className="font-medium px-4 py-3">When</th><th className="font-medium px-4 py-3">Who</th><th className="font-medium px-4 py-3">What</th><th className="font-medium px-4 py-3">Detail</th></tr></thead>
          <tbody>{data.map((a) => (
            <tr key={a.id} className="border-b border-line/60 last:border-0"><td className="px-4 py-3 text-moss whitespace-nowrap">{fmtDateTime(a.created_at)}</td><td className="px-4 py-3">{a.actor}</td>
              <td className="px-4 py-3"><Badge>{LABEL[a.action] || a.action}</Badge></td><td className="px-4 py-3">{a.detail}</td></tr>))}</tbody>
        </table></Card>
      )}
    </div>
  )
}
