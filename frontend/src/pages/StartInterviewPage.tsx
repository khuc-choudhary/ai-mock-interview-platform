import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Blend, Briefcase, Code2, MessagesSquare, Sparkles, Users } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext'
import { useMeta, useToast } from '../context/AppContext'
import { api } from '../services/api'
import { Button, Card, DemoBanner, InlineError, PageHeader, Segmented, TextField } from '../components/ui'
import type { Category, Difficulty, Experience, InterviewConfig, Language } from '../types'

const CATEGORIES: { id: Category; title: string; desc: string; icon: typeof Code2 }[] = [
  { id: 'technical', title: 'Technical', desc: 'Concepts and scenarios for a specific technology', icon: Code2 },
  { id: 'hr', title: 'HR', desc: 'Behavioural and situational questions', icon: Users },
  { id: 'communication', title: 'Communication', desc: 'Speaking clearly and explaining ideas', icon: MessagesSquare },
  { id: 'mixed', title: 'Mixed', desc: 'Technical + HR + communication', icon: Blend },
]

export default function StartInterviewPage() {
  const { user } = useAuth()
  const { meta, error: metaError } = useMeta()
  const toast = useToast()
  const nav = useNavigate()
  const [params] = useSearchParams()

  const [category, setCategory] = useState<Category>((params.get('category') as Category) || 'technical')
  const [topic, setTopic] = useState<string>(params.get('topic') || '')
  const [role, setRole] = useState(user?.profile.preferred_role ?? '')
  const [experience, setExperience] = useState<Experience>(user?.profile.experience_level ?? 'fresher')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [duration, setDuration] = useState<10 | 15 | 30 | 45>(15)
  const [numQ, setNumQ] = useState(6)
  const [language, setLanguage] = useState<Language>('English')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roleError, setRoleError] = useState<string | null>(null)

  const topics = useMemo(() => {
    if (!meta) return []
    return category === 'technical' ? meta.technical_topics : category === 'hr' ? meta.hr_topics : category === 'communication' ? meta.communication_topics : []
  }, [meta, category])

  // keep topic valid for the selected category; default technical topic to the first one
  useEffect(() => {
    if (!meta) return
    if (category === 'mixed') setTopic('')
    else if (!topics.includes(topic)) setTopic(category === 'technical' ? topics[0] ?? '' : '')
  }, [category, topics, meta, topic])

  // number of questions cannot exceed one per minute of duration
  const maxQ = Math.min(30, duration)
  useEffect(() => setNumQ((n) => Math.min(n, maxQ)), [maxQ])

  const suggestedRole = category === 'technical' && topic ? `${topic} Developer` : ''

  async function start() {
    if (role.trim().length < 2) {
      setRoleError('Enter the job role you are interviewing for')
      return
    }
    setRoleError(null)
    setError(null)
    setBusy(true)
    const cfg: InterviewConfig = {
      category,
      topic: category === 'mixed' ? null : topic || null,
      job_role: role.trim(),
      experience_level: experience,
      difficulty,
      duration_minutes: duration,
      num_questions: numQ,
      language,
    }
    try {
      const s = await api.createInterview(cfg)
      nav(`/interview/${s.id}`)
    } catch (e) {
      setError((e as Error).message)
      toast('error', 'Could not start the interview')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <DemoBanner />
      <PageHeader title="Configure your interview" subtitle="Questions are generated live from these choices and adapt to your answers." />
      {metaError && <InlineError message={`Could not load server configuration: ${metaError}`} />}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card>
            <span className="label">Interview type</span>
            <div className="grid gap-3 sm:grid-cols-2">
              {CATEGORIES.map(({ id, title, desc, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(id)}
                  aria-pressed={category === id}
                  className={clsx('flex items-start gap-3 rounded-xl border p-4 text-left transition', category === id ? 'border-brand-400 bg-brand-500/20' : 'border-white/10 bg-white/4 hover:bg-white/8')}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-brand-300"><Icon className="size-[1.1rem]" /></span>
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="text-xs text-white/55">{desc}</span>
                  </span>
                </button>
              ))}
            </div>

            {topics.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} key={category} className="mt-5">
                <span className="label">{category === 'technical' ? 'Technology' : 'Focus area'}</span>
                <div className="flex flex-wrap gap-2">
                  {category !== 'technical' && (
                    <TopicChip active={topic === ''} onClick={() => setTopic('')}>All areas</TopicChip>
                  )}
                  {topics.map((t) => <TopicChip key={t} active={topic === t} onClick={() => setTopic(t)}>{t}</TopicChip>)}
                </div>
              </motion.div>
            )}
          </Card>

          <Card className="space-y-5">
            <div>
              <TextField
                label="Job role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder={suggestedRole || 'e.g. Backend Developer'}
                error={roleError}
                list="role-suggestions"
                maxLength={120}
              />
              <datalist id="role-suggestions">
                {['Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Data Analyst', 'Data Scientist', 'ML Engineer', 'Mobile Developer', suggestedRole].filter(Boolean).map((r) => <option key={r} value={r} />)}
              </datalist>
              {!role && suggestedRole && (
                <button type="button" className="mt-1.5 text-xs text-brand-300 hover:underline" onClick={() => setRole(suggestedRole)}>Use “{suggestedRole}”</button>
              )}
            </div>
            <Segmented label="Experience level" value={experience} onChange={setExperience} options={[{ value: 'fresher', label: 'Fresher' }, { value: '0-2', label: '0–2 years' }, { value: '2-5', label: '2–5 years' }, { value: 'experienced', label: 'Experienced' }]} />
            <Segmented label="Difficulty" value={difficulty} onChange={setDifficulty} options={[{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]} />
            <Segmented label="Duration" value={duration} onChange={setDuration} options={[10, 15, 30, 45].map((m) => ({ value: m as 10 | 15 | 30 | 45, label: `${m} min` }))} />
            <div>
              <label className="label" htmlFor="numq">Number of questions: <span className="font-semibold text-white">{numQ}</span> <span className="text-white/40">(including follow-ups)</span></label>
              <input id="numq" type="range" min={3} max={maxQ} value={numQ} onChange={(e) => setNumQ(Number(e.target.value))} className="w-full accent-brand-500" />
              <div className="flex justify-between text-[0.7rem] text-white/40"><span>3</span><span>{maxQ}</span></div>
            </div>
            <Segmented label="Interview language" value={language} onChange={setLanguage} options={[{ value: 'English', label: 'English' }, { value: 'Hindi', label: 'हिन्दी (Hindi)' }, { value: 'Hinglish', label: 'Hinglish' }]} />
          </Card>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <h2 className="flex items-center gap-2 font-display font-bold"><Briefcase className="size-4 text-brand-300" /> Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Type', category === 'mixed' ? 'Mixed' : `${CATEGORIES.find((c) => c.id === category)?.title}${topic ? ` · ${topic}` : ''}`],
                ['Role', role || '—'],
                ['Level', experience === 'fresher' ? 'Fresher' : experience === 'experienced' ? 'Experienced' : `${experience} years`],
                ['Difficulty', difficulty],
                ['Length', `${numQ} questions · ${duration} min`],
                ['Language', language],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-white/50">{k}</dt><dd className="text-right font-medium capitalize">{v}</dd></div>
              ))}
            </dl>
            {error && <div className="mt-4"><InlineError message={error} /></div>}
            <Button className="mt-5 w-full !py-3" onClick={start} loading={busy} disabled={!meta || (category === 'technical' && !topic)}>
              <Sparkles className="size-4" /> {busy ? `${meta?.interviewer_name ?? 'Your interviewer'} is preparing…` : 'Start interview'}
            </Button>
            <p className="mt-3 text-xs text-white/40">You'll enter a lobby first, so you can check your microphone before the interview begins.</p>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function TopicChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={clsx('rounded-full border px-3.5 py-1.5 text-sm transition', active ? 'border-brand-400 bg-brand-500/25 text-white' : 'border-white/10 bg-white/5 text-white/65 hover:bg-white/10')}>
      {children}
    </button>
  )
}
