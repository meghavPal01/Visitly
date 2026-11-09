import { CalendarDays, Clock, MapPin } from 'lucide-react'
import { fmtFullDate, fmtTime } from '../lib/format'

/** The confirmation moment: a pass the buyer can show at the site gate. */
export default function SitePass({ booking, children }) {
  const s = booking.slot
  const cancelled = booking.status !== 'confirmed'
  return (
    <article className={`pass pass-in w-full max-w-sm ${cancelled ? 'opacity-60' : ''}`} aria-label="Site visit pass">
      <div className="p-5 pb-6">
        <p className="text-sm text-moss">{cancelled ? 'Visit cancelled' : 'Your site visit is confirmed'}</p>
        <h3 className="text-2xl font-bold leading-tight mt-0.5">{booking.project_name}</h3>
        <div className="mt-4 flex flex-col gap-2 text-[15px]">
          <p className="flex items-center gap-2"><CalendarDays className="size-5 text-moss shrink-0" aria-hidden /><span className="font-semibold">{fmtFullDate(s.start_time)}</span></p>
          <p className="flex items-center gap-2"><Clock className="size-5 text-moss shrink-0" aria-hidden /><span className="font-display font-bold text-xl">{fmtTime(s.start_time)}</span><span className="text-moss">to {fmtTime(s.end_time)}</span></p>
          <p className="flex items-start gap-2"><MapPin className="size-5 text-moss shrink-0 mt-0.5" aria-hidden /><span>{s.location}{s.map_url && <> · <a href={s.map_url} target="_blank" rel="noreferrer" className="underline underline-offset-4 font-medium">Open map</a></>}</span></p>
        </div>
      </div>
      <div className="pass-stub bg-marigold rounded-b-[16px] px-5 py-4 text-ink">
        <div className="flex items-baseline justify-between gap-3"><span className="font-display font-bold text-lg">Pass #{booking.id}</span><span className="text-xs">RERA {booking.rera_number || 'to be confirmed'}</span></div>
        <p className="text-xs mt-1">Show this at the site gate. We’ll remind you 24 hours and 2 hours before (demo: reminders are simulated).</p>
        {children}
      </div>
    </article>
  )
}
