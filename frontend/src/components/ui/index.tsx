import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, FlaskConical, Inbox, Loader2, RefreshCw, X } from 'lucide-react'
import clsx from 'clsx'
import { scoreTone, toneHex } from '../../utils/format'
import { useMeta } from '../../context/AppContext'

/* ---------- Buttons ---------- */
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  loading?: boolean
}
export function Button({ variant = 'primary', loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button className={clsx('btn', `btn-${variant}`, className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

/* ---------- Card ---------- */
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('glass p-5', className)} {...rest}>
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-white/60">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}

/* ---------- Form fields ---------- */
interface FieldProps {
  label: string
  error?: string | null
  hint?: string
  children: (id: string, invalid: boolean) => ReactNode
}
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId()
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children(id, !!error)}
      {hint && !error && <p className="mt-1 text-xs text-white/45">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
export function TextField({ label, error, hint, ...rest }: { label: string; error?: string | null; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <Field label={label} error={error} hint={hint}>{(id, invalid) => <input id={id} className="field" aria-invalid={invalid} {...rest} />}</Field>
}
export function SelectField({ label, error, children, ...rest }: { label: string; error?: string | null } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <Field label={label} error={error}>{(id, invalid) => <select id={id} className="field" aria-invalid={invalid} {...rest}>{children}</select>}</Field>
}
export function TextArea({ label, error, ...rest }: { label: string; error?: string | null } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Field label={label} error={error}>{(id, invalid) => <textarea id={id} className="field" aria-invalid={invalid} {...rest} />}</Field>
}

/* Segmented single-choice control */
export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            type="button"
            key={String(o.value)}
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={clsx(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition',
              o.value === value
                ? 'border-brand-400 bg-brand-500/25 text-white'
                : 'border-white/10 bg-white/5 text-white/65 hover:bg-white/10',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- Feedback / states ---------- */
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-white/60" role="status">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <AlertTriangle className="mx-auto size-8 text-bad" />
      <p className="mt-3 font-semibold">Something went wrong</p>
      <p className="mt-1 text-sm text-white/60">{message}</p>
      {onRetry && (
        <Button variant="ghost" className="mt-4" onClick={onRetry}>
          <RefreshCw className="size-4" /> Try again
        </Button>
      )}
    </Card>
  )
}
export function EmptyState({ title, text, action, icon }: { title: string; text: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-white/6 text-brand-300">{icon ?? <Inbox className="size-6" />}</div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-white/55">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function InlineError({ message, onRetry, retrying }: { message: string; onRetry?: () => void; retrying?: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-red-200" role="alert">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  )
}

/* Shown on every page that displays AI-produced content while the server runs without an LLM key */
export function DemoBanner({ always }: { always?: boolean }) {
  const { meta } = useMeta()
  if (!meta || (meta.ai_mode !== 'demo' && !always)) return null
  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-amber-100" role="note">
      <FlaskConical className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>Demo mode.</strong> No AI provider is configured on the server, so questions come from a small sample
        bank and answers get a rough heuristic score. This is <strong>not</strong> a real AI evaluation. Set{' '}
        <code className="rounded bg-black/30 px-1">LLM_API_KEY</code> in <code className="rounded bg-black/30 px-1">backend/.env</code> to enable it.
      </p>
    </div>
  )
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="glass relative w-full max-w-md p-6 outline-none"
            initial={{ scale: 0.95, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 12 }}
          >
            <button className="absolute right-3 top-3 rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </button>
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <div className="mt-2 text-sm text-white/70">{children}</div>
            {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- Data display ---------- */
export function Badge({ tone = 'none', children }: { tone?: 'good' | 'warn' | 'bad' | 'brand' | 'none'; children: ReactNode }) {
  const map = {
    good: 'border-good/30 bg-good/10 text-good',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    bad: 'border-bad/30 bg-bad/10 text-bad',
    brand: 'border-brand-400/30 bg-brand-500/15 text-brand-300',
    none: 'border-white/10 bg-white/5 text-white/70',
  }
  return <span className={clsx('chip', map[tone])}>{children}</span>
}

export function ScoreRing({ value, size = 96, label, stroke = 9 }: { value: number | null; size?: number; label?: string; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = value ?? 0
  const color = toneHex[scoreTone(value)]
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'Score'}: ${value ?? 'not available'}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(255 255 255 / 0.09)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * v) / 100 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <div className="font-display font-bold" style={{ fontSize: size * 0.27 }}>{value ?? '—'}</div>
        {label && <div className="mt-1 text-[0.65rem] uppercase tracking-wider text-white/45">{label}</div>}
      </div>
    </div>
  )
}

export function Bar({ value, label, right }: { value: number | null; label: string; right?: string }) {
  const tone = scoreTone(value)
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-white/70">{label}</span>
        <span className="font-semibold tabular-nums">{right ?? (value == null ? 'n/a' : `${value}/100`)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div className="h-full rounded-full" style={{ background: toneHex[tone] }} initial={{ width: 0 }} animate={{ width: `${value ?? 0}%` }} transition={{ duration: 0.7 }} />
      </div>
    </div>
  )
}

export function StatCard({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: ReactNode; sub?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-white/55">
        <span className={clsx('grid size-7 place-items-center rounded-lg bg-white/7', tone)}>{icon}</span>
        {label}
      </div>
      <div className="mt-2.5 font-display text-3xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-white/45">{sub}</div>}
    </Card>
  )
}

export const chartTooltipStyle = {
  contentStyle: { background: '#141417', border: '1px solid rgb(255 255 255 / 0.12)', borderRadius: 12, fontSize: 12, color: '#f2f2f5' },
  labelStyle: { color: '#5cc8ec' },
  itemStyle: { color: '#f2f2f5' },
}
