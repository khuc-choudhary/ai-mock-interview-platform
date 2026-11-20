import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Download, FlaskConical, Lightbulb, RefreshCw, Sparkles, Target } from 'lucide-react'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import { useToast } from '../context/AppContext'
import { Bar, Badge, Button, Card, DemoBanner, ErrorState, ScoreRing, Skeleton } from '../components/ui'
import { categoryLabel, fmtDateTime, fmtDuration, scoreTone, toneText, verdictLabel, verdictTone } from '../utils/format'
import type { QuestionAnalysis, Report } from '../types'

const CRITERIA_LABEL: Record<string, string> = {
  technical_accuracy: 'Technical accuracy / content',
  relevance: 'Relevance',
  conceptual_understanding: 'Conceptual understanding',
  completeness: 'Completeness',
  communication_clarity: 'Communication clarity',
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  confidence_indicators: 'Confident phrasing (language only)',
  structure: 'Answer structure',
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="mb-3 font-display text-xl font-bold">{title}</h2>
      {children}
    </section>
  )
}

function QuestionCard({ q }: { q: QuestionAnalysis }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="p-0">
      <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl bg-white/6 font-display text-lg font-bold ${toneText[scoreTone(q.score)]}`}>{q.score}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/45">Q{q.order}{q.kind === 'followup' ? ' · follow-up' : ''}{q.topic ? ` · ${q.topic}` : ''}</p>
          <p className="font-medium leading-snug">{q.question}</p>
        </div>
        <Badge tone={verdictTone[q.verdict]}>{verdictLabel[q.verdict]}</Badge>
        <ChevronDown className={`size-4 shrink-0 text-white/50 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-4 border-t border-white/8 p-4 text-sm">
              <div>
                <p className="label">Your answer ({q.input_method === 'voice' ? 'spoken' : 'typed'})</p>
                <p className="rounded-xl bg-white/5 p-3 text-white/80">{q.answer}</p>
              </div>
              <div>
                <p className="label">AI evaluation</p>
                <p className="text-white/80">{q.feedback}</p>
              </div>
              <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {Object.entries(q.scores).map(([k, v]) => <Bar key={k} label={CRITERIA_LABEL[k] ?? k} value={v} />)}
                {q.fluency_score != null && <Bar label="Fluency (audio-measured)" value={q.fluency_score} />}
              </div>
              {(q.words_per_minute != null || q.filler_count > 0) && (
                <p className="text-xs text-white/50">
                  {q.words_per_minute != null && <>Pace: {Math.round(q.words_per_minute)} wpm · </>}Filler words: {q.filler_count}
                </p>
              )}
              {q.mistakes.length > 0 && <List title="Mistakes & gaps" items={q.mistakes} tone="text-bad" />}
              {q.improved_answer && (
                <div>
                  <p className="label">Improved answer</p>
                  <p className="rounded-xl border border-good/25 bg-good/8 p-3 text-white/85">{q.improved_answer}</p>
                </div>
              )}
              {q.model_answer && (
                <div>
                  <p className="label">Model answer</p>
                  <p className="text-white/75">{q.model_answer}</p>
                </div>
              )}
              {q.simple_explanation && (
                <div>
                  <p className="label">Simple explanation</p>
                  <p className="text-white/75">{q.simple_explanation}</p>
                </div>
              )}
              {q.suggestions.length > 0 && <List title="Suggestions" items={q.suggestions} tone="text-brand-300" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: string }) {
  return (
    <div>
      <p className="label">{title}</p>
      <ul className="space-y-1">
        {items.map((m, i) => (
          <li key={i} className="flex gap-2 text-white/80"><span className={tone}>•</span><span>{m}</span></li>
        ))}
      </ul>
    </div>
  )
}

export default function ReportPage() {
  const { id = '' } = useParams()
  const toast = useToast()
  const { data, error, loading, reload, setData } = useAsync<Report>(() => api.report(id), [id])
  const [downloading, setDownloading] = useState(false)
  const [regen, setRegen] = useState(false)

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>

  const { aggregates: a, plan, session: s } = data
  const comm = a.communication
  const vc = a.verdict_counts

  async function download() {
    setDownloading(true)
    try {
      await api.downloadReportPdf(id)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setDownloading(false)
    }
  }
  async function regenerate() {
    setRegen(true)
    try {
      setData(await api.regenerateReport(id))
      toast('success', 'Improvement plan regenerated')
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setRegen(false)
    }
  }

  return (
    <div>
      {data.demo_notice && <DemoBanner always />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/history" className="text-xs text-brand-300 hover:underline">← Interview history</Link>
          <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">Interview report</h1>
          <p className="mt-1 text-sm text-white/60">
            {s.job_role} · {categoryLabel[s.category]}{s.topic ? ` · ${s.topic}` : ''} · {s.difficulty} · {s.language}
          </p>
          <p className="text-xs text-white/40">{fmtDateTime(s.started_at)} · {fmtDuration(s.duration_seconds)}{s.ended_early ? ' · ended early' : ''}</p>
        </div>
        <Button onClick={download} loading={downloading}><Download className="size-4" /> Download PDF</Button>
      </div>

      {/* A. overall */}
      <Section id="overall" title="A. Overall performance">
        <Card className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex justify-center"><ScoreRing value={a.overall_score} size={140} label="overall" stroke={11} /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={scoreTone(a.overall_score) === 'good' ? 'good' : scoreTone(a.overall_score) === 'warn' ? 'warn' : 'bad'}>{a.status}</Badge>
              <span className="text-sm text-white/60">{a.answered} of {a.planned} planned questions answered</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/80">{plan.summary}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              {[
                ['Correct', vc.correct, 'text-good'],
                ['Partially correct', vc.partially_correct, 'text-warn'],
                ['Incorrect', vc.incorrect, 'text-bad'],
                ['Irrelevant / unclear', vc.irrelevant + vc.unclear, 'text-bad'],
              ].map(([l, v, c]) => (
                <div key={l as string} className="rounded-xl bg-white/5 p-3">
                  <div className={`font-display text-2xl font-bold ${c}`}>{v}</div>
                  <div className="text-[0.7rem] text-white/50">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </Section>

      {/* B. technical */}
      <Section id="tech" title="B. Technical performance">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="flex flex-col items-center justify-center text-center">
            <ScoreRing value={a.technical_score} size={110} label="technical" />
            <p className="mt-2 text-xs text-white/45">Accuracy + conceptual understanding</p>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-good">Strong topics</h3>
            {a.strong_topics.length ? a.strong_topics.map((t) => <Bar key={t.topic} label={t.topic} value={t.avg} />) : <p className="text-sm text-white/50">No topic scored 70+ in this interview.</p>}
            <h3 className="mb-2 mt-5 text-sm font-semibold text-bad">Weak topics</h3>
            {a.weak_topics.length ? <div className="space-y-2.5">{a.weak_topics.map((t) => <Bar key={t.topic} label={t.topic} value={t.avg} />)}</div> : <p className="text-sm text-white/50">No topic scored below 60.</p>}
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold">Concepts that need revision</h3>
            {a.concepts_to_revise.length ? (
              <div className="flex flex-wrap gap-2">{a.concepts_to_revise.map((c) => <Badge key={c.concept} tone="warn">{c.concept}{c.count > 1 ? ` ×${c.count}` : ''}</Badge>)}</div>
            ) : <p className="text-sm text-white/50">None flagged. Nice work.</p>}
          </Card>
        </div>
      </Section>

      {/* C. communication */}
      <Section id="comm" title="C. Communication performance">
        <Card>
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Bar label="Communication score" value={a.communication_score} />
            <Bar label="Fluency (from audio: fillers, pace, pauses)" value={comm.fluency} right={comm.fluency == null ? 'n/a – typed answers' : undefined} />
            <Bar label="Grammar" value={comm.grammar} />
            <Bar label="Vocabulary" value={comm.vocabulary} />
            <Bar label="Answer clarity" value={comm.clarity} />
            <Bar label="Answer structure" value={comm.structure} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Speaking pace" value={comm.avg_wpm ? `${Math.round(comm.avg_wpm)} wpm` : 'n/a'} sub={comm.pace ? { slow: 'a bit slow', good: 'comfortable', fast: 'a bit fast' }[comm.pace] : 'needs voice answers'} />
            <Mini label="Filler words" value={String(comm.filler_count)} sub={Object.entries(comm.top_fillers).slice(0, 2).map(([w, c]) => `${w} ×${c}`).join(', ') || 'none detected'} />
            <Mini label="Long pauses (2s+)" value={comm.voice_answers ? String(comm.long_pauses) : 'n/a'} sub={`${comm.voice_answers} voice / ${comm.typed_answers} typed`} />
            <Mini label="Confident phrasing" value={String(comm.confidence_language)} sub="from wording only" />
          </div>
          {comm.tips.length > 0 && <div className="mt-5"><List title="Personalised suggestions" items={comm.tips} tone="text-brand-300" /></div>}
          <p className="mt-4 text-xs text-white/40">Pace, pauses and fluency are measured from your microphone signal. Facial expression and emotion are not analysed. Browser speech recognition often omits “umm”-style fillers, so filler counts can be under-reported.</p>
        </Card>
      </Section>

      {/* D. question-wise */}
      <Section id="qs" title="D. Question-wise analysis">
        <div className="space-y-3">{data.questions.map((q) => <QuestionCard key={q.order} q={q} />)}</div>
      </Section>

      {/* E. plan */}
      <Section id="plan" title="E. Personalised improvement plan">
        {data.plan_source === 'rule_based' && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-amber-100">
            <FlaskConical className="size-4" />
            <span className="flex-1">The AI was unavailable when the report was generated, so this plan was assembled from your measured scores with simple rules.</span>
            <Button variant="ghost" onClick={regenerate} loading={regen}><RefreshCw className="size-4" /> Regenerate with AI</Button>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="mb-3 flex items-center gap-2 font-semibold"><Lightbulb className="size-4 text-warn" /> Topics to study</h3>
            {plan.topics_to_study.length ? (
              <ul className="space-y-3 text-sm">
                {plan.topics_to_study.map((t, i) => (
                  <li key={i}><p className="font-medium">{t.topic}</p><p className="text-white/60">{t.reason} {t.how_to_study}</p>
                    <Link to={`/interview/new?topic=${encodeURIComponent(t.topic)}`} className="text-xs text-brand-300 hover:underline">Practise this →</Link></li>
                ))}
              </ul>
            ) : <p className="text-sm text-white/50">No weak topics. Try a harder difficulty next.</p>}
          </Card>
          <Card><h3 className="mb-3 font-semibold">Communication exercises</h3><Bullets items={plan.communication_exercises} /></Card>
          <Card><h3 className="mb-3 flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-brand-300" /> Recommended practice</h3><Bullets items={plan.recommended_practice} /></Card>
          <Card><h3 className="mb-3 flex items-center gap-2 font-semibold"><Target className="size-4 text-good" /> Next practice goals</h3><Bullets items={plan.next_goals} /></Card>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/interview/new" className="btn btn-primary">Practise again</Link>
          <Link to="/analytics" className="btn btn-ghost">See analytics</Link>
        </div>
      </Section>
    </div>
  )
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-white/50">Nothing to add.</p>
  return <ul className="space-y-2 text-sm text-white/80">{items.map((t, i) => <li key={i} className="flex gap-2"><span className="text-brand-300">•</span>{t}</li>)}</ul>
}
function Mini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="text-[0.7rem] text-white/50">{label}</div>
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="text-[0.7rem] text-white/45">{sub}</div>
    </div>
  )
}
