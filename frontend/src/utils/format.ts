import type { Category, Verdict } from '../types'

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

export const fmtShortDate = (iso: string) =>
  new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  if (m < 1) return `${seconds}s`
  return `${m} min${seconds % 60 >= 30 ? ' +' : ''}`
}

export function scoreTone(score: number | null | undefined): 'good' | 'warn' | 'bad' | 'none' {
  if (score == null) return 'none'
  return score >= 75 ? 'good' : score >= 50 ? 'warn' : 'bad'
}

export const toneText = { good: 'text-good', warn: 'text-warn', bad: 'text-bad', none: 'text-white/40' }
export const toneHex = { good: '#34d399', warn: '#fbbf24', bad: '#f87171', none: '#64648a' }

export const categoryLabel: Record<Category, string> = {
  technical: 'Technical',
  hr: 'HR',
  communication: 'Communication',
  mixed: 'Mixed',
}

export const verdictLabel: Record<Verdict, string> = {
  correct: 'Correct',
  partially_correct: 'Partially correct',
  incorrect: 'Incorrect',
  irrelevant: 'Irrelevant',
  unclear: 'Empty / unclear',
}
export const verdictTone: Record<Verdict, 'good' | 'warn' | 'bad'> = {
  correct: 'good',
  partially_correct: 'warn',
  incorrect: 'bad',
  irrelevant: 'bad',
  unclear: 'bad',
}

export const experienceLabel: Record<string, string> = {
  fresher: 'Fresher',
  '0-2': '0–2 years',
  '2-5': '2–5 years',
  experienced: 'Experienced',
}

export const speechLang: Record<string, string> = { English: 'en-IN', Hindi: 'hi-IN', Hinglish: 'en-IN' }
