import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Clock, Loader2, LogOut, Mic, MicOff, Pause, Play, RotateCcw, Send, Volume2, VolumeX, Keyboard, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import InterviewerAvatar, { type InterviewerStatus } from '../components/InterviewerAvatar'
import { Badge, Button, DemoBanner, ErrorState, InlineError, Modal, Spinner } from '../components/ui'
import { useMeta, useSettings, useToast } from '../context/AppContext'
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis'
import { describeMicError, resolveEngine, useSpeechInput } from '../hooks/useSpeechInput'
import { api } from '../services/api'
import type { Evaluation, Question, SessionDetail } from '../types'
import { fmtClock, scoreTone, speechLang, toneText, verdictLabel, verdictTone } from '../utils/format'
import { Brand } from '../layouts/AppLayout'

type Phase = 'idle' | 'submitting' | 'next' | 'finishing'

export default function InterviewRoomPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { meta } = useMeta()
  const { settings } = useSettings()

  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [joined, setJoined] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [answer, setAnswer] = useState('')
  const [interim, setInterim] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [nextError, setNextError] = useState<string | null>(null)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ ev: Evaluation; n: number } | null>(null)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [timeUp, setTimeUp] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [micTest, setMicTest] = useState<{ ok: boolean; text: string } | null>(null)

  const clock = useRef({ base: 0, at: Date.now() })
  const speechSeq = useRef(0)
  const spokenFor = useRef<string | null>(null)

  const lang = speechLang[session?.language ?? 'English']
  const engine = resolveEngine(settings.speechEngine, !!meta?.whisper_available)
  const tts = useSpeechSynthesis({ lang, rate: settings.ttsRate, voiceName: settings.voiceName, enabled: settings.ttsEnabled })

  const speech = useSpeechInput({
    engine,
    lang,
    language: session?.language ?? 'English',
    onText: (final, itm) => {
      setAnswer(final)
      setInterim(itm)
    },
  })
  const recording = speech.status === 'recording'

  /* ---------- load ---------- */
  const load = useCallback(() => {
    setLoadError(null)
    api
      .getInterview(id)
      .then((s) => {
        setSession(s)
        setPaused(s.is_paused)
        clock.current = { base: s.elapsed_seconds, at: Date.now() }
        setElapsed(s.elapsed_seconds)
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [id])
  useEffect(load, [load])

  useEffect(() => {
    if (session && session.status !== 'in_progress') nav(session.status === 'completed' ? `/history/${id}` : '/history', { replace: true })
  }, [session, id, nav])

  const current: Question | null = useMemo(
    () => session?.questions.find((q) => !q.answer?.evaluation) ?? null,
    [session],
  )
  const answeredCount = session?.questions.filter((q) => q.answer?.evaluation).length ?? 0
  const total = session?.num_questions ?? 0
  const remaining = session ? session.duration_minutes * 60 - elapsed : 0

  /* ---------- timer ---------- */
  useEffect(() => {
    if (!joined || paused || !session) return
    const t = window.setInterval(() => setElapsed(clock.current.base + (Date.now() - clock.current.at) / 1000), 1000)
    return () => window.clearInterval(t)
  }, [joined, paused, session])

  useEffect(() => {
    if (session && joined && remaining <= 0 && !timeUp) setTimeUp(true)
  }, [remaining, session, joined, timeUp])

  /* ---------- speaking helpers ---------- */
  const stopTalking = useCallback(() => {
    speechSeq.current++
    tts.cancel()
  }, [tts])

  const speakQuestion = useCallback(
    async (q: Question, withIntro = false) => {
      const seq = ++speechSeq.current
      const parts: string[] = []
      if (withIntro && session) parts.push(session.greeting ?? '', session.introduction ?? '')
      if (q.lead_in) parts.push(q.lead_in)
      parts.push(q.text)
      for (const p of parts.filter(Boolean)) {
        if (seq !== speechSeq.current) return
        await tts.speak(p)
      }
    },
    [session, tts],
  )

  /* speak every newly-arrived question once (after the user has joined) */
  useEffect(() => {
    if (!joined || !current || paused || phase !== 'idle') return
    if (spokenFor.current === current.id) return
    spokenFor.current = current.id
    setAnswer('')
    setInterim('')
    speech.reset()
    void speakQuestion(current, answeredCount === 0 && current.order_index === 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, current?.id, paused, phase])

  /* ---------- actions ---------- */
  async function testMic() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
      setMicTest({ ok: true, text: 'Microphone works.' })
    } catch (e) {
      setMicTest({ ok: false, text: describeMicError(e) })
    }
  }

  const finish = useCallback(
    async (early: boolean) => {
      stopTalking()
      speech.stop()
      setPhase('finishing')
      setFinishError(null)
      try {
        const r = await api.finish(id, early)
        if (r.report_available) nav(`/history/${id}`, { replace: true })
        else {
          toast('info', 'The interview ended before any question was answered, so nothing was saved.')
          nav('/dashboard', { replace: true })
        }
      } catch (e) {
        setFinishError((e as Error).message)
        setPhase('idle')
      }
    },
    [id, nav, speech, stopTalking, toast],
  )

  const loadNext = useCallback(async () => {
    setPhase('next')
    setNextError(null)
    try {
      const r = await api.nextQuestion(id)
      if (r.done || !r.question) {
        await finish(false)
        return
      }
      const q = r.question
      setSession((s) => (s && !s.questions.some((x) => x.id === q.id) ? { ...s, questions: [...s.questions, q] } : s))
      setPhase('idle')
    } catch (e) {
      setNextError((e as Error).message)
      setPhase('idle')
    }
  }, [id, finish])

  async function submit() {
    if (!current || phase !== 'idle') return
    const text = answer.trim()
    if (!text) return
    speech.stop()
    stopTalking()
    setSubmitError(null)
    setPhase('submitting')
    const metrics = speech.getMetrics()
    try {
      const res = await api.submitAnswer(id, {
        question_id: current.id,
        text,
        input_method: metrics ? 'voice' : 'typed',
        speech_metrics: metrics,
      })
      const n = current.order_index + 1
      setFeedback({ ev: res.evaluation, n })
      setSession((s) =>
        s
          ? {
              ...s,
              questions: s.questions.map((q) =>
                q.id === current.id
                  ? { ...q, answer: { id: 'local', text, input_method: metrics ? 'voice' : 'typed', word_count: 0, submitted_at: new Date().toISOString(), evaluation: res.evaluation } }
                  : q,
              ),
            }
          : s,
      )
      if (res.limit_reached || timeUp) {
        await finish(false)
        return
      }
      await loadNext()
    } catch (e) {
      setSubmitError((e as Error).message)
      setPhase('idle')
    }
  }

  async function togglePause() {
    try {
      if (paused) {
        const s = await api.resume(id)
        clock.current = { base: s.elapsed_seconds, at: Date.now() }
        setElapsed(s.elapsed_seconds)
        setPaused(false)
      } else {
        speech.stop()
        stopTalking()
        const s = await api.pause(id)
        setElapsed(s.elapsed_seconds)
        setPaused(true)
      }
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  function toggleMic() {
    if (recording) {
      speech.stop()
    } else {
      stopTalking()
      void speech.start()
    }
  }

  /* time is up with nothing typed -> end automatically */
  useEffect(() => {
    if (timeUp && phase === 'idle' && !answer.trim() && !recording && !paused && joined) {
      const t = setTimeout(() => void finish(false), 1500)
      return () => clearTimeout(t)
    }
  }, [timeUp, phase, answer, recording, paused, joined, finish])

  /* ---------- render ---------- */
  if (loadError) return <div className="p-6"><ErrorState message={loadError} onRetry={load} /></div>
  if (!session) return <Spinner label="Loading your interview…" />

  const name = session.interviewer_name
  const busy = phase !== 'idle'
  const status: InterviewerStatus = busy ? 'thinking' : tts.speaking ? 'speaking' : 'listening'

  if (phase === 'finishing') {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <InterviewerAvatar status="thinking" size={110} />
          <h1 className="mt-6 font-display text-2xl font-bold">Preparing your report…</h1>
          <p className="mt-2 text-sm text-white/60">{name} is reviewing every answer and writing your improvement plan.</p>
          <Loader2 className="mx-auto mt-5 size-6 animate-spin text-brand-300" />
        </div>
      </div>
    )
  }

  /* lobby */
  if (!joined) {
    const resumed = answeredCount > 0
    const sttLabel = engine === 'browser' ? 'Browser speech recognition' : engine === 'whisper' ? 'Whisper transcription (server)' : 'Unavailable in this browser — you can type answers'
    return (
      <div className="grid min-h-screen place-items-center p-4">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
          <div className="mb-6 flex justify-center"><Brand /></div>
          <DemoBanner />
          <div className="glass p-7 text-center">
            <div className="mb-5 flex justify-center"><InterviewerAvatar status="listening" /></div>
            <h1 className="font-display text-2xl font-bold">{resumed ? `Welcome back, let's continue` : `Ready to meet ${name}?`}</h1>
            <p className="mt-1 text-sm text-white/60">{session.job_role} · {session.difficulty} · {session.num_questions} questions · {session.duration_minutes} min</p>
            <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left text-sm">
              <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-good" /> Speech input: <span className="text-white/70">{sttLabel}</span></li>
              <li className="flex items-center gap-2">
                {tts.supported ? <CheckCircle2 className="size-4 text-good" /> : <VolumeX className="size-4 text-warn" />}
                Interviewer voice: <span className="text-white/70">{tts.supported ? (settings.ttsEnabled ? 'on' : 'off (Settings)') : 'not supported — text only'}</span>
              </li>
              {tts.supported && settings.ttsEnabled && tts.voices.length > 0 && !tts.voices.some((v) => v.lang.toLowerCase().startsWith(lang.split('-')[0])) && (
                <li className="flex items-start gap-2 text-amber-200"><VolumeX className="mt-0.5 size-4 shrink-0" /> No {session.language === 'Hindi' ? 'Hindi' : 'matching'} voice is installed on this device, so questions will be shown as text (or read in another voice). Install a voice in your OS language settings to hear them.</li>
              )}
              <li className="flex items-center gap-2"><Keyboard className="size-4 text-good" /> You can always type your answer instead.</li>
            </ul>
            {engine !== 'none' && (
              <div className="mt-4">
                <Button variant="ghost" onClick={testMic}><Mic className="size-4" /> Test microphone</Button>
                {micTest && <p className={clsx('mt-2 text-xs', micTest.ok ? 'text-good' : 'text-bad')} role="status">{micTest.text}</p>}
              </div>
            )}
            <Button className="mt-6 w-full !py-3" onClick={() => setJoined(true)}>
              <Play className="size-4" /> {resumed ? 'Resume interview' : 'Join interview'}
            </Button>
            <button className="mt-3 text-xs text-white/45 hover:text-white/80" onClick={() => nav('/dashboard')}>Leave</button>
          </div>
        </motion.div>
      </div>
    )
  }

  const isLast = current ? current.order_index + 1 >= total : false
  const lowTime = remaining <= 60

  return (
    <div className="flex min-h-screen flex-col">
      {/* top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-white/8 bg-ink-950/60 px-4 py-3 backdrop-blur-xl sm:px-6">
        <Brand />
        <div className="flex items-center gap-2">
          {session.ai_mode === 'demo' && <Badge tone="warn">Demo mode · not real AI</Badge>}
          <Badge tone="brand">{session.topic ?? session.category}</Badge>
        </div>
      </header>

      {session.ai_mode === 'demo' && (
        <div className="px-4 pt-3 sm:px-6"><DemoBanner /></div>
      )}

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-5 p-4 sm:p-6 lg:grid-cols-2">
        {/* LEFT: interviewer */}
        <section className="glass flex flex-col p-5 sm:p-6" aria-label="Interviewer">
          <div className="flex items-center gap-4">
            <InterviewerAvatar status={status} size={96} />
            <div>
              <h2 className="font-display text-xl font-bold">{name}</h2>
              <p className="text-xs text-white/50">AI interviewer</p>
              <motion.span key={status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={clsx('chip mt-2', status === 'speaking' && 'border-brand-400/50 text-brand-300', status === 'thinking' && 'border-warn/40 text-warn', status === 'listening' && 'border-good/40 text-good')} role="status">
                <span className={clsx('size-1.5 rounded-full', status === 'speaking' ? 'bg-brand-300' : status === 'thinking' ? 'bg-warn' : 'bg-good', status !== 'listening' && 'animate-pulse')} />
                {status === 'speaking' ? 'Speaking' : status === 'thinking' ? 'Thinking' : 'Listening'}
              </motion.span>
            </div>
          </div>

          <div className="mt-5 flex-1 space-y-3">
            {answeredCount === 0 && current?.order_index === 0 && (session.greeting || session.introduction) && (
              <div className="rounded-2xl rounded-tl-sm bg-white/6 p-4 text-sm text-white/80">
                {session.greeting && <p>{session.greeting}</p>}
                {session.introduction && <p className="mt-2">{session.introduction}</p>}
              </div>
            )}
            <AnimatePresence mode="wait">
              {current ? (
                <motion.div key={current.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl rounded-tl-sm border border-brand-400/25 bg-brand-500/12 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-brand-300">
                    <span className="font-semibold">Question {current.order_index + 1}</span>
                    {current.kind === 'followup' && <Badge tone="brand">follow-up</Badge>}
                  </div>
                  {current.lead_in && <p className="mb-2 text-sm text-white/65">{current.lead_in}</p>}
                  <p className="text-lg font-medium leading-snug">{current.text}</p>
                </motion.div>
              ) : phase === 'next' ? (
                <div className="flex items-center gap-2 rounded-2xl bg-white/6 p-4 text-sm text-white/70"><Loader2 className="size-4 animate-spin" /> {name} is thinking about your answer…</div>
              ) : null}
            </AnimatePresence>

            {nextError && <InlineError message={`Couldn't get the next question: ${nextError}`} onRetry={loadNext} retrying={phase === 'next'} />}

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" disabled={!current || busy || paused} onClick={() => current && void speakQuestion(current)}>
                {tts.speaking ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                {tts.speaking ? 'Playing…' : 'Play question'}
              </Button>
              <Button variant="ghost" disabled={!current || busy || paused} onClick={() => { stopTalking(); if (current) void tts.speak(current.text, true) }}>
                <RotateCcw className="size-4" /> Repeat question
              </Button>
              {tts.speaking && <Button variant="ghost" onClick={stopTalking}>Stop audio</Button>}
            </div>

            {settings.instantFeedback && feedback && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-white/10 bg-white/4 p-3.5 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-white/50">Feedback on question {feedback.n}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={verdictTone[feedback.ev.verdict]}>{verdictLabel[feedback.ev.verdict]}</Badge>
                    <span className={clsx('font-display text-lg font-bold', toneText[scoreTone(feedback.ev.overall_score)])}>{feedback.ev.overall_score}</span>
                  </span>
                </div>
                <p className="text-white/75">{feedback.ev.feedback}</p>
                {feedback.ev.ai_mode === 'demo' && <p className="mt-1 text-xs text-warn">Demo heuristic, not a real AI evaluation.</p>}
              </motion.div>
            )}
          </div>
        </section>

        {/* RIGHT: candidate */}
        <section className="glass flex flex-col p-5 sm:p-6" aria-label="Your answer">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Your answer</h2>
            {recording && <span className="chip border-bad/40 text-bad"><span className="size-2 animate-pulse rounded-full bg-bad" /> Recording {fmtClock(speech.seconds)}</span>}
            {speech.status === 'transcribing' && <span className="chip text-brand-300"><Loader2 className="size-3 animate-spin" /> Transcribing…</span>}
          </div>

          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={toggleMic}
              disabled={engine === 'none' || busy || paused || !current || speech.status === 'transcribing' || speech.status === 'starting'}
              aria-pressed={recording}
              aria-label={recording ? 'Stop recording' : 'Start recording'}
              className={clsx('relative grid size-16 shrink-0 place-items-center rounded-full text-white transition disabled:opacity-40', recording ? 'bg-bad shadow-[0_0_30px_rgb(248_113_113/0.5)]' : 'bg-gradient-to-br from-brand-500 to-sky-brand shadow-[0_0_24px_rgb(0_123_167/0.45)] hover:scale-105')}
            >
              {recording && <span className="absolute inset-0 rounded-full border-2 border-bad/60" style={{ transform: `scale(${1 + speech.level * 0.6})`, transition: 'transform 0.1s' }} />}
              {engine === 'none' ? <MicOff className="size-6" /> : recording ? <MicOff className="size-6" /> : <Mic className="size-6" />}
            </button>
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{engine === 'none' ? 'Microphone input unavailable' : recording ? 'Listening to you… tap to stop' : 'Tap the mic to speak your answer'}</p>
              <p className="text-xs text-white/50">
                {engine === 'browser' && 'Using your browser’s speech recognition.'}
                {engine === 'whisper' && 'Audio is sent to the server’s Whisper transcription when you stop.'}
                {engine === 'none' && 'This browser has no speech recognition. Type your answer below.'}
              </p>
              {recording && (
                <div className="mt-1.5 flex h-4 items-end gap-0.5" aria-hidden>
                  {Array.from({ length: 16 }).map((_, i) => (
                    <span key={i} className="w-1 rounded-full bg-brand-300 transition-all" style={{ height: `${Math.max(12, Math.min(100, speech.level * 100 * (0.5 + ((i * 7) % 5) / 5)))}%` }} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {speech.error && <div className="mt-3"><InlineError message={speech.error} /></div>}

          <label htmlFor="answer" className="label mt-4">Transcript — edit it freely before submitting</label>
          <textarea
            id="answer"
            className="field min-h-44 flex-1 resize-y text-[0.95rem] leading-relaxed"
            placeholder="Speak with the microphone or type your answer here…"
            value={answer + (interim ? (answer ? ' ' : '') + interim : '')}
            readOnly={recording}
            disabled={!current || busy || paused}
            maxLength={6000}
            onChange={(e) => {
              setAnswer(e.target.value)
              speech.syncText(e.target.value)
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void submit()
            }}
          />
          <div className="mt-1 flex justify-between text-xs text-white/40">
            <span>{recording ? 'Stop recording to edit the text.' : 'Ctrl+Enter to submit'}</span>
            <span>{answer.trim() ? answer.trim().split(/\s+/).length : 0} words</span>
          </div>

          {submitError && (
            <div className="mt-3"><InlineError message={`${submitError} Your answer is kept — you can retry.`} onRetry={submit} retrying={phase === 'submitting'} /></div>
          )}
          {timeUp && <p className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-amber-100">Time is up. {answer.trim() ? 'Submit your answer to finish the interview.' : 'Wrapping up…'}</p>}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => { speech.reset(); setAnswer(''); setInterim('') }} disabled={!answer || busy || recording}>Clear</Button>
            <Button onClick={submit} loading={phase === 'submitting' || phase === 'next'} disabled={!answer.trim() || !current || busy || recording || paused} className="!px-6">
              <Send className="size-4" /> {phase === 'submitting' ? 'Evaluating…' : phase === 'next' ? 'Next question…' : isLast ? 'Submit & finish' : 'Submit answer'}
            </Button>
          </div>
          {!answer.trim() && current && !busy && <p className="mt-2 text-right text-xs text-white/40">An answer is required to continue.</p>}
        </section>
      </main>

      {/* bottom bar */}
      <footer className="sticky bottom-0 border-t border-white/8 bg-ink-950/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2">
          <div className="min-w-[10rem] flex-1">
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-semibold">Question {Math.min(answeredCount + 1, total)} of {total}</span>
              <span className="text-white/45">{answeredCount} answered</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-sky-brand" animate={{ width: `${(answeredCount / Math.max(1, total)) * 100}%` }} />
            </div>
          </div>
          <div className={clsx('flex items-center gap-1.5 font-display text-lg font-bold tabular-nums', lowTime ? 'text-bad' : 'text-white')} aria-label="Remaining time">
            <Clock className="size-4" /> {fmtClock(Math.max(0, remaining))}
          </div>
          <p className="hidden items-center gap-1 text-xs text-white/45 md:flex">
            <ArrowRight className="size-3" /> {isLast ? 'This is the final question' : 'Next question is generated from your answer'}
          </p>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={togglePause} disabled={busy}>{paused ? <><Play className="size-4" /> Resume</> : <><Pause className="size-4" /> Pause</>}</Button>
            <Button variant="danger" onClick={() => setConfirmEnd(true)} disabled={phase === 'submitting'}><LogOut className="size-4" /> End interview</Button>
          </div>
        </div>
        {finishError && <div className="mx-auto mt-2 max-w-6xl"><InlineError message={`Couldn't finish: ${finishError}`} onRetry={() => void finish(false)} /></div>}
      </footer>

      {/* pause overlay */}
      <AnimatePresence>
        {paused && (
          <motion.div className="fixed inset-0 z-[80] grid place-items-center bg-ink-950/85 p-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="glass max-w-sm p-8 text-center">
              <Pause className="mx-auto size-10 text-brand-300" />
              <h2 className="mt-3 font-display text-xl font-bold">Interview paused</h2>
              <p className="mt-1 text-sm text-white/60">The timer is stopped. Resume when you are ready.</p>
              <Button className="mt-5 w-full" onClick={togglePause}><Play className="size-4" /> Resume</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="End the interview now?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmEnd(false)}>Keep going</Button>
            <Button variant="danger" onClick={() => { setConfirmEnd(false); void finish(true) }}>End & see report</Button>
          </>
        }
      >
        {answeredCount > 0
          ? `You've answered ${answeredCount} of ${total} questions. Your report will be generated from the answers you have given so far.`
          : "You haven't answered any questions yet, so no report will be created and nothing will be saved."}
      </Modal>
    </div>
  )
}
