export default function Logo({ className = '', light }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-bold text-xl ${light ? 'text-paper' : 'text-pine'} ${className}`}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden><rect width="32" height="32" rx="8" fill={light ? '#F4B400' : '#0E2F2B'} /><path d="M8 15l8-6 8 6v9H8z" fill={light ? '#0E2F2B' : '#F4B400'} /></svg>
      Visitly
    </span>
  )
}
