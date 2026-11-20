import { Link } from 'react-router-dom'
import { BookOpen, FlaskConical, Play } from 'lucide-react'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import { Badge, Bar, Card, DemoBanner, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { fmtDate } from '../utils/format'

export default function LearningPage() {
  const { data, error, loading, reload } = useAsync(api.learning)
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-56" /></div>

  return (
    <div>
      <DemoBanner />
      <PageHeader title="Learning & improvement" subtitle="What to study next, drawn from your real interview results." />
      {data.plans.length === 0 ? (
        <Card><EmptyState icon={<BookOpen className="size-6" />} title="Nothing to recommend yet" text="Complete an interview and you'll get a personalised study plan here." action={<Link to="/interview/new" className="btn btn-primary">Start interview</Link>} /></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5">
            <Card>
              <h2 className="mb-3 font-display font-bold">Weakest topics</h2>
              <div className="space-y-3">
                {data.weak_topics.map((t) => (
                  <div key={t.topic}>
                    <Bar label={t.topic} value={t.avg} right={`${t.avg} · ${t.count} answers`} />
                    <Link to={`/interview/new?topic=${encodeURIComponent(t.topic)}`} className="mt-1 inline-flex items-center gap-1 text-xs text-brand-300 hover:underline"><Play className="size-3" /> Practise</Link>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h2 className="mb-3 font-display font-bold">Skills to build</h2>
              <div className="space-y-3">{data.weak_skills.map((s) => <Bar key={s.key} label={s.label} value={s.avg} />)}</div>
            </Card>
          </div>

          <div className="space-y-5 lg:col-span-2">
            {data.plans.map((p) => (
              <Card key={p.session_id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display font-bold">{p.job_role} <span className="text-sm font-normal text-white/45">· {fmtDate(p.date)}</span></h2>
                  <div className="flex items-center gap-2">
                    {p.ai_mode === 'demo' && <Badge tone="warn"><FlaskConical className="size-3" /> demo plan</Badge>}
                    {p.plan_source === 'rule_based' && <Badge>rule-based</Badge>}
                    <Link to={`/history/${p.session_id}`} className="text-xs text-brand-300 hover:underline">Full report →</Link>
                  </div>
                </div>
                {p.plan.summary && <p className="mb-3 text-sm text-white/75">{p.plan.summary}</p>}
                {(p.plan.topics_to_study?.length ?? 0) > 0 && (
                  <>
                    <p className="label">Study</p>
                    <ul className="mb-3 space-y-2 text-sm">
                      {p.plan.topics_to_study!.map((t, i) => <li key={i}><span className="font-medium">{t.topic}</span> <span className="text-white/60">— {t.reason} {t.how_to_study}</span></li>)}
                    </ul>
                  </>
                )}
                {p.concepts_to_revise.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">{p.concepts_to_revise.map((c) => <Badge key={c.concept} tone="warn">{c.concept}</Badge>)}</div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Mini title="Communication exercises" items={p.plan.communication_exercises} />
                  <Mini title="Next goals" items={p.plan.next_goals} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Mini({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null
  return (
    <div>
      <p className="label">{title}</p>
      <ul className="space-y-1 text-sm text-white/75">{items.map((t, i) => <li key={i} className="flex gap-2"><span className="text-brand-300">•</span>{t}</li>)}</ul>
    </div>
  )
}
