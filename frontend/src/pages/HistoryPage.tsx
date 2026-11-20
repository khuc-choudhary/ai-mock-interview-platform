import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Clock, FileText, History as HistoryIcon, Play, Search, Trash2 } from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../context/AppContext'
import { Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, Skeleton } from '../components/ui'
import type { HistoryPage as Page, SessionSummary } from '../types'
import { categoryLabel, fmtDateTime, fmtDuration, scoreTone, toneText } from '../utils/format'

const PAGE = 10

export default function HistoryPage() {
  const toast = useToast()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [days, setDays] = useState('')
  const [sort, setSort] = useState('newest')
  const [items, setItems] = useState<SessionSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [toDelete, setToDelete] = useState<SessionSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const query = (offset: number) => api.listInterviews({ q: debounced || undefined, category: category || undefined, status: status || undefined, days: days ? Number(days) : undefined, sort, limit: PAGE, offset })

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    query(0)
      .then((p: Page) => live && (setItems(p.items), setTotal(p.total)))
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, category, status, days, sort])

  async function loadMore() {
    setMore(true)
    try {
      const p = await query(items.length)
      setItems((x) => [...x, ...p.items])
      setTotal(p.total)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setMore(false)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      await api.deleteInterview(toDelete.id)
      setItems((x) => x.filter((i) => i.id !== toDelete.id))
      setTotal((t) => t - 1)
      toast('success', 'Interview deleted')
      setToDelete(null)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const filtered = !!(debounced || category || status || days)

  return (
    <div>
      <PageHeader title="Interview history" subtitle="Every interview you have taken, with full reports." actions={<Button onClick={() => nav('/interview/new')}><Play className="size-4" /> New interview</Button>} />

      <Card className="mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
          <input className="field !pl-9" placeholder="Search role or topic…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search interviews" />
        </div>
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All types</option>
          {Object.entries(categoryLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="field" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          <option value="completed">Completed</option>
          <option value="in_progress">In progress</option>
          <option value="abandoned">Abandoned</option>
        </select>
        <div className="grid grid-cols-2 gap-3">
          <select className="field" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Date range">
            <option value="">All time</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
          <select className="field" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="score_desc">Top score</option>
            <option value="score_asc">Lowest score</option>
          </select>
        </div>
      </Card>

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HistoryIcon className="size-6" />}
            title={filtered ? 'No interviews match your filters' : 'No interviews yet'}
            text={filtered ? 'Try clearing a filter or searching for something else.' : 'Take your first mock interview and it will show up here.'}
            action={!filtered && <Link to="/interview/new" className="btn btn-primary">Start interview</Link>}
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((s) => (
              <li key={s.id}>
                <Card className="flex flex-wrap items-center gap-4 p-4">
                  <div className={`grid size-14 shrink-0 place-items-center rounded-2xl bg-white/6 font-display text-xl font-bold ${toneText[scoreTone(s.overall_score)]}`}>
                    {s.overall_score ?? '—'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.job_role}</p>
                    <p className="text-xs text-white/50">
                      {categoryLabel[s.category]}{s.topic ? ` · ${s.topic}` : ''} · {s.difficulty} · {s.language}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/45">
                      <span>{fmtDateTime(s.started_at)}</span>
                      <span className="flex items-center gap-1"><Clock className="size-3" />{fmtDuration(s.duration_seconds)}</span>
                      {s.status === 'completed' ? <Badge tone="good">completed{s.ended_early ? ' early' : ''}</Badge> : s.status === 'in_progress' ? <Badge tone="brand">in progress</Badge> : <Badge>abandoned</Badge>}
                      {s.ai_mode === 'demo' && <Badge tone="warn">demo</Badge>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {s.status === 'completed' && <Link to={`/history/${s.id}`} className="btn btn-ghost"><FileText className="size-4" /> Report</Link>}
                    {s.status === 'in_progress' && <Link to={`/interview/${s.id}`} className="btn btn-primary"><Play className="size-4" /> Resume</Link>}
                    <button className="btn btn-danger !px-3" onClick={() => setToDelete(s)} aria-label={`Delete interview: ${s.job_role}`}><Trash2 className="size-4" /></button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          {items.length < total && (
            <div className="mt-5 text-center"><Button variant="ghost" onClick={loadMore} loading={more}>Load more ({total - items.length} remaining)</Button></div>
          )}
        </>
      )}

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete this interview?"
        footer={<><Button variant="ghost" onClick={() => setToDelete(null)}>Cancel</Button><Button variant="danger" loading={deleting} onClick={confirmDelete}>Delete permanently</Button></>}
      >
        “{toDelete?.job_role}” and its answers, evaluations and report will be permanently removed. This also updates your analytics.
      </Modal>
    </div>
  )
}
