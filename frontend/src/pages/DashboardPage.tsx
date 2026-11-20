import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Brain, Flame, Gauge, MessageSquare, Mic, Play, Target, Trophy } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import { Badge, Button, Card, DemoBanner, EmptyState, ErrorState, ScoreRing, Skeleton, StatCard, chartTooltipStyle } from '../components/ui'
import { categoryLabel, fmtDate, fmtShortDate, scoreTone, toneText } from '../utils/format'

export default function DashboardPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync(api.dashboard)
  const first = user?.full_name.split(' ')[0]

  if (error) return <ErrorState message={error} onRetry={reload} />

  const goalPct = data ? Math.min(100, Math.round((data.completed_today / data.daily_goal) * 100)) : 0

  return (
    <div>
      <DemoBanner />
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Welcome back, {first} 👋</h1>
          <p className="mt-1 text-sm text-white/60">Every practice round makes the real interview easier.</p>
        </div>
        <Button onClick={() => nav('/interview/new')} className="!px-5 !py-3">
          <Play className="size-4" /> Start New Interview
        </Button>
      </div>

      {loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<Trophy className="size-4" />} label="Interviews completed" value={data.total_interviews} sub={`${data.streak_days} day streak`} tone="text-brand-300" />
            <StatCard icon={<Gauge className="size-4" />} label="Average score" value={<span className={toneText[scoreTone(data.avg_score)]}>{data.avg_score ?? '—'}</span>} sub="across completed interviews" tone="text-sky-brand" />
            <StatCard icon={<Brain className="size-4" />} label="Technical knowledge" value={<span className={toneText[scoreTone(data.technical_score)]}>{data.technical_score ?? '—'}</span>} sub="accuracy + understanding" tone="text-good" />
            <StatCard icon={<MessageSquare className="size-4" />} label="Communication" value={<span className={toneText[scoreTone(data.communication_score)]}>{data.communication_score ?? '—'}</span>} sub={data.fluency_score != null ? `Fluency & delivery: ${data.fluency_score}` : 'Fluency appears after voice answers'} tone="text-warn" />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h2 className="font-display font-bold">Performance improvement</h2>
              <p className="text-xs text-white/50">Overall score for your last interviews</p>
              {data.trend.length === 0 ? (
                <EmptyState title="No completed interviews yet" text="Finish your first interview to see your progress chart." action={<Link to="/interview/new" className="btn btn-primary">Start interview</Link>} />
              ) : (
                <div className="mt-4 h-60">
                  <ResponsiveContainer>
                    <AreaChart data={data.trend.map((t, i) => ({ ...t, n: `#${i + 1}`, label: fmtShortDate(t.date) }))}>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1fa3d1" stopOpacity={0.55} />
                          <stop offset="100%" stopColor="#1fa3d1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke="#8b8fb5" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} stroke="#8b8fb5" fontSize={11} tickLine={false} axisLine={false} width={30} />
                      <Tooltip {...chartTooltipStyle} />
                      <Area type="monotone" dataKey="score" name="Overall" stroke="#1fa3d1" strokeWidth={2.5} fill="url(#g1)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card>
              <h2 className="font-display font-bold">Daily practice goal</h2>
              <div className="mt-4 flex items-center gap-5">
                <ScoreRing value={goalPct} size={92} label="done" />
                <div className="text-sm">
                  <p className="text-2xl font-bold tabular-nums">{data.completed_today}<span className="text-white/45">/{data.daily_goal}</span></p>
                  <p className="text-white/55">interviews today</p>
                  {data.completed_today >= data.daily_goal ? (
                    <p className="mt-1 flex items-center gap-1 text-good"><Flame className="size-3.5" /> Goal reached!</p>
                  ) : (
                    <p className="mt-1 text-white/50">{data.daily_goal - data.completed_today} to go</p>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs text-white/40">Change your goal in Settings.</p>
            </Card>

            <Card className="lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display font-bold">Recent interviews</h2>
                <Link to="/history" className="flex items-center gap-1 text-xs text-brand-300 hover:underline">View all <ArrowRight className="size-3" /></Link>
              </div>
              {data.recent.length === 0 ? (
                <EmptyState title="Nothing here yet" text="Your completed interviews will appear here." icon={<Mic className="size-6" />} />
              ) : (
                <ul className="divide-y divide-white/8">
                  {data.recent.map((r) => (
                    <li key={r.id}>
                      <Link to={`/history/${r.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition hover:bg-white/5">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.job_role}</p>
                          <p className="text-xs text-white/50">{categoryLabel[r.category]}{r.topic ? ` · ${r.topic}` : ''} · {fmtDate(r.ended_at)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.ai_mode === 'demo' && <Badge tone="warn">demo</Badge>}
                          <span className={`font-display text-xl font-bold tabular-nums ${toneText[scoreTone(r.overall_score)]}`}>{r.overall_score}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 flex items-center gap-2 font-display font-bold"><Target className="size-4 text-brand-300" /> Areas to improve</h2>
              {data.recommended.length === 0 ? (
                <p className="text-sm text-white/50">{data.total_interviews === 0 ? 'Complete an interview and we will pinpoint what to work on.' : 'Nice work. No weak areas below 75 right now.'}</p>
              ) : (
                <ul className="space-y-3">
                  {data.recommended.map((r) => (
                    <li key={r.type + r.name} className="rounded-xl bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{r.name}</span>
                        <span className={`text-sm font-bold ${toneText[scoreTone(r.score)]}`}>{r.score}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">{r.hint}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
