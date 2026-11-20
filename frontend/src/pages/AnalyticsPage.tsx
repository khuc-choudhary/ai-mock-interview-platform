import { Link } from 'react-router-dom'
import { Bar as RBar, BarChart, CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, BarChart3, Repeat, TrendingUp } from 'lucide-react'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import { Bar, Card, DemoBanner, EmptyState, ErrorState, PageHeader, Skeleton, chartTooltipStyle } from '../components/ui'
import { fmtShortDate, scoreTone, toneText } from '../utils/format'

const AXIS = { stroke: '#8b8fb5', fontSize: 11, tickLine: false, axisLine: false } as const

export default function AnalyticsPage() {
  const { data, error, loading, reload } = useAsync(api.analytics)
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}</div>

  if (data.total_interviews === 0)
    return (
      <div>
        <PageHeader title="Performance analytics" />
        <Card><EmptyState icon={<BarChart3 className="size-6" />} title="No data to analyse yet" text="Complete an interview and your charts, topic performance and recurring mistakes will appear here." action={<Link to="/interview/new" className="btn btn-primary">Start interview</Link>} /></Card>
      </div>
    )

  const series = data.series.map((s, i) => ({ ...s, label: `${fmtShortDate(s.date)} #${i + 1}` }))
  const imp = data.improvement
  const topics = data.topic_performance.slice(0, 10)
  const radar = data.criteria_performance.map((c) => ({ skill: c.label.replace('Answer ', ''), value: c.avg }))

  return (
    <div>
      <DemoBanner />
      <PageHeader title="Performance analytics" subtitle={`Based on ${data.total_interviews} completed interview${data.total_interviews > 1 ? 's' : ''} and ${data.total_answers} evaluated answers.`} />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="flex flex-col justify-center">
          <p className="flex items-center gap-2 text-xs text-white/55"><TrendingUp className="size-4 text-brand-300" /> Improvement</p>
          {imp ? (
            <>
              <p className={`mt-2 flex items-center gap-1 font-display text-4xl font-bold ${imp.change_points >= 0 ? 'text-good' : 'text-bad'}`}>
                {imp.change_points >= 0 ? <ArrowUpRight className="size-7" /> : <ArrowDownRight className="size-7" />}
                {imp.change_percent != null ? `${imp.change_percent > 0 ? '+' : ''}${imp.change_percent}%` : `${imp.change_points} pts`}
              </p>
              <p className="mt-1 text-xs text-white/50">Average of your first {imp.window} interview{imp.window > 1 ? 's' : ''} ({imp.first_avg}) vs. latest {imp.window} ({imp.latest_avg}).</p>
            </>
          ) : <p className="mt-2 text-sm text-white/55">Complete at least 2 interviews to see your improvement.</p>}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-display font-bold">Interview score over time</h2>
          <div className="mt-3 h-56">
            <ResponsiveContainer>
              <LineChart data={series}>
                <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis domain={[0, 100]} width={30} {...AXIS} />
                <Tooltip {...chartTooltipStyle} />
                <Line type="monotone" dataKey="overall" name="Overall" stroke="#1fa3d1" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-display font-bold">Technical vs communication</h2>
          <div className="mt-3 h-60">
            <ResponsiveContainer>
              <LineChart data={series}>
                <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis domain={[0, 100]} width={30} {...AXIS} />
                <Tooltip {...chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="technical" name="Technical" stroke="#ff2d95" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="communication" name="Communication" stroke="#fbbf24" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="font-display font-bold">Skill profile</h2>
          <div className="mt-2 h-60">
            <ResponsiveContainer>
              <RadarChart data={radar} outerRadius="68%">
                <PolarGrid stroke="rgb(255 255 255 / 0.12)" />
                <PolarAngleAxis dataKey="skill" tick={{ fill: '#8b8fb5', fontSize: 10 }} />
                <Radar dataKey="value" name="Avg score" stroke="#1fa3d1" fill="#1fa3d1" fillOpacity={0.35} />
                <Tooltip {...chartTooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-display font-bold">Topic-wise performance</h2>
          <div style={{ height: Math.max(180, topics.length * 34) }} className="mt-3">
            <ResponsiveContainer>
              <BarChart data={topics} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid stroke="rgb(255 255 255 / 0.06)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} {...AXIS} />
                <YAxis type="category" dataKey="topic" width={140} {...AXIS} />
                <Tooltip {...chartTooltipStyle} formatter={(v, _n, p) => [`${v}/100 (${((p?.payload as { count?: number } | undefined)?.count ?? 0)} answers)`, 'Average']} />
                <RBar dataKey="avg" fill="#1fa3d1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="font-display font-bold">Weekly practice activity</h2>
          <p className="text-xs text-white/45">Last 14 days</p>
          <div className="mt-2 h-52">
            <ResponsiveContainer>
              <BarChart data={data.weekly_activity.map((d) => ({ ...d, label: fmtShortDate(d.date) }))}>
                <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
                <XAxis dataKey="label" {...AXIS} interval={1} />
                <YAxis allowDecimals={false} width={24} {...AXIS} />
                <Tooltip {...chartTooltipStyle} />
                <RBar dataKey="questions" name="Questions answered" fill="#ff2d95" radius={[4, 4, 0, 0]} />
                <RBar dataKey="interviews" name="Interviews" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-display font-bold"><Repeat className="size-4 text-warn" /> Frequently repeated mistakes</h2>
          {data.repeated_mistakes.length === 0 ? (
            <p className="text-sm text-white/50">No concept has been missed more than once yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.repeated_mistakes.map((m) => (
                <li key={m.concept} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <span className="min-w-0"><span className="font-medium capitalize">{m.concept}</span><span className="block truncate text-xs text-white/45">{m.topic}</span></span>
                  <span className="chip border-warn/30 text-warn">×{m.count}</span>
                </li>
              ))}
            </ul>
          )}
          {data.top_fillers.length > 0 && (
            <div className="mt-4 border-t border-white/8 pt-3">
              <p className="label">Most used filler words</p>
              <div className="flex flex-wrap gap-2">{data.top_fillers.map((f) => <span key={f.word} className="chip">{f.word} ×{f.count}</span>)}</div>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-display font-bold">Strongest & weakest</h2>
          <p className="label !text-good">Strongest topics</p>
          <div className="mb-4 space-y-2.5">{data.strongest.map((t) => <Bar key={t.topic} label={t.topic} value={t.avg} />)}</div>
          <p className="label !text-bad">Weakest topics</p>
          <div className="space-y-2.5">{data.weakest.map((t) => <Bar key={t.topic} label={t.topic} value={t.avg} />)}</div>
        </Card>

        <Card>
          <h2 className="mb-3 font-display font-bold">Skills</h2>
          <p className="label !text-good">Strongest skills</p>
          <ul className="mb-4 space-y-1 text-sm">{data.strongest_skills.map((s) => <li key={s.key} className="flex justify-between"><span>{s.label}</span><span className={`font-semibold ${toneText[scoreTone(s.avg)]}`}>{s.avg}</span></li>)}</ul>
          <p className="label !text-bad">Needs work</p>
          <ul className="space-y-1 text-sm">{data.weakest_skills.map((s) => <li key={s.key} className="flex justify-between"><span>{s.label}</span><span className={`font-semibold ${toneText[scoreTone(s.avg)]}`}>{s.avg}</span></li>)}</ul>
        </Card>
      </div>
    </div>
  )
}
