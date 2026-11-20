import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import type { SpeechMetrics } from '../types'

/* Minimal typings for the (webkit-prefixed) Web Speech API */
interface SRResult { isFinal: boolean; 0: { transcript: string } }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SRInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type SRCtor = new () => SRInstance

const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
const SpeechRecognitionImpl: SRCtor | undefined = w.SpeechRecognition ?? w.webkitSpeechRecognition

export const browserSttSupported = !!SpeechRecognitionImpl
export const recorderSupported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export type Engine = 'browser' | 'whisper' | 'none'
export type MicStatus = 'idle' | 'starting' | 'recording' | 'transcribing'

const SPEECH_RMS = 0.018 // amplitude above which a 100 ms frame counts as speech
const PAUSE_MS = 700
const LONG_PAUSE_MS = 2000

/** Resolves which engine to use from the user's preference + what the browser/server supports. */
export function resolveEngine(pref: 'auto' | 'browser' | 'whisper', whisperAvailable: boolean): Engine {
  const canWhisper = whisperAvailable && recorderSupported
  if (pref === 'browser') return browserSttSupported ? 'browser' : canWhisper ? 'whisper' : 'none'
  if (pref === 'whisper') return canWhisper ? 'whisper' : browserSttSupported ? 'browser' : 'none'
  return browserSttSupported ? 'browser' : canWhisper ? 'whisper' : 'none'
}

export function describeMicError(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Microphone access was blocked. Allow the microphone in your browser’s site settings, then try again — or type your answer instead.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found. Connect one, or type your answer instead.'
  if (name === 'NotReadableError') return 'Your microphone is being used by another application. Close it and try again.'
  return 'Could not start the microphone. You can type your answer instead.'
}

interface Options {
  engine: Engine
  lang: string // BCP-47, e.g. en-IN
  language: string // server language label for Whisper
  onText: (finalText: string, interim: string) => void
}

/**
 * Records speech via the browser recogniser or MediaRecorder+Whisper, while measuring real audio metrics
 * (speaking time, pauses) from the microphone signal with an AnalyserNode. Metrics accumulate across
 * start/stop segments until reset().
 */
export function useSpeechInput({ engine, lang, language, onText }: Options) {
  const [status, setStatus] = useState<MicStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState(0)
  const [seconds, setSeconds] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const recogRef = useRef<SRInstance | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const wantRef = useRef(false)
  const finalRef = useRef('')
  const startedAt = useRef(0)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  // accumulated metrics
  const m = useRef({ recording: 0, speaking: 0, pauses: 0, longPauses: 0, longest: 0 })
  const seg = useRef({ firstSpeech: -1, lastSpeech: -1, silenceStart: -1, last: 0 })

  const teardownAudio = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
    setLevel(0)
  }, [])

  const closeSegment = useCallback(() => {
    const s = seg.current
    if (s.firstSpeech >= 0) m.current.recording += Math.max(0, s.lastSpeech - s.firstSpeech) / 1000
    seg.current = { firstSpeech: -1, lastSpeech: -1, silenceStart: -1, last: 0 }
  }, [])

  const reset = useCallback(() => {
    m.current = { recording: 0, speaking: 0, pauses: 0, longPauses: 0, longest: 0 }
    seg.current = { firstSpeech: -1, lastSpeech: -1, silenceStart: -1, last: 0 }
    finalRef.current = ''
    setSeconds(0)
    setError(null)
  }, [])

  const getMetrics = useCallback((): SpeechMetrics | null => {
    // include the still-open segment without mutating it
    const s = seg.current
    const open = s.firstSpeech >= 0 ? Math.max(0, s.lastSpeech - s.firstSpeech) / 1000 : 0
    const rec = m.current.recording + open
    if (rec <= 0) return null
    return {
      recording_seconds: Math.round(rec * 10) / 10,
      speaking_seconds: Math.round(Math.min(m.current.speaking, rec) * 10) / 10,
      pause_count: m.current.pauses,
      long_pause_count: m.current.longPauses,
      longest_pause_seconds: Math.round(m.current.longest * 10) / 10,
    }
  }, [])

  const startMetering = useCallback((stream: MediaStream) => {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ctxRef.current = ctx
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    seg.current = { firstSpeech: -1, lastSpeech: -1, silenceStart: -1, last: performance.now() }

    timerRef.current = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      setLevel(Math.min(1, rms * 8))
      const now = performance.now()
      const s = seg.current
      const dt = now - s.last
      s.last = now
      setSeconds((now - startedAt.current) / 1000)
      if (rms > SPEECH_RMS) {
        if (s.firstSpeech < 0) s.firstSpeech = now
        // speech resumed after a silence: commit that silence as a pause (leading/trailing silence is never counted)
        if (s.silenceStart >= 0 && s.firstSpeech !== now) {
          const gap = now - s.silenceStart
          if (gap >= PAUSE_MS) {
            m.current.pauses++
            if (gap >= LONG_PAUSE_MS) m.current.longPauses++
            m.current.longest = Math.max(m.current.longest, gap / 1000)
          }
        }
        s.silenceStart = -1
        s.lastSpeech = now
        m.current.speaking += dt / 1000
      } else if (s.firstSpeech >= 0 && s.silenceStart < 0) {
        s.silenceStart = now
      }
    }, 100)
  }, [])

  const finishWhisper = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'audio/webm' })
    chunksRef.current = []
    if (blob.size < 800) {
      setStatus('idle')
      setError('That recording was too short. Try again and speak for a few seconds.')
      return
    }
    try {
      const text = await api.transcribe(blob, language)
      finalRef.current = (finalRef.current + ' ' + text).trim()
      onTextRef.current(finalRef.current, '')
      setError(null)
    } catch (e) {
      setError(`${(e as Error).message} You can type your answer instead.`)
    } finally {
      setStatus('idle')
    }
  }, [language])

  const start = useCallback(async () => {
    if (status !== 'idle' || engine === 'none') return
    setError(null)
    setStatus('starting')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      setStatus('idle')
      setError(describeMicError(e))
      return
    }
    streamRef.current = stream
    startedAt.current = performance.now()
    wantRef.current = true
    startMetering(stream)

    if (engine === 'browser' && SpeechRecognitionImpl) {
      const launch = () => {
        const r = new SpeechRecognitionImpl()
        recogRef.current = r
        r.lang = lang
        r.continuous = true
        r.interimResults = true
        r.onresult = (e) => {
          let interim = ''
          let finals = ''
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i]
            if (res.isFinal) finals += res[0].transcript
            else interim += res[0].transcript
          }
          if (finals) finalRef.current = (finalRef.current + ' ' + finals.trim()).trim()
          onTextRef.current(finalRef.current, interim.trim())
        }
        r.onerror = (e) => {
          if (e.error === 'no-speech' || e.error === 'aborted') return
          wantRef.current = false
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError(describeMicError({ name: 'NotAllowedError' }))
          else if (e.error === 'network') setError('Browser speech recognition could not reach its service. Check your connection, or type your answer.')
          else if (e.error === 'language-not-supported') setError('This browser does not support speech recognition for the selected language. Please type your answer.')
          else setError(`Speech recognition error (${e.error}). You can type your answer instead.`)
        }
        r.onend = () => {
          // Chrome ends the session after a silence; restart while the user still wants to record
          if (wantRef.current) {
            try { launch() } catch { /* already starting */ }
          } else {
            setStatus((s) => (s === 'recording' ? 'idle' : s))
          }
        }
        r.start()
      }
      launch()
      setStatus('recording')
    } else {
      chunksRef.current = []
      const rec = new MediaRecorder(stream)
      recorderRef.current = rec
      rec.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data)
      rec.onstop = () => void finishWhisper()
      rec.start()
      setStatus('recording')
    }
  }, [status, engine, lang, startMetering, finishWhisper])

  const stop = useCallback(() => {
    wantRef.current = false
    closeSegment()
    if (engine === 'browser') {
      recogRef.current?.stop()
      setStatus('idle')
    } else if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      setStatus('transcribing')
      recorderRef.current.stop()
    } else {
      setStatus('idle')
    }
    teardownAudio()
  }, [engine, closeSegment, teardownAudio])

  // stop everything on unmount
  useEffect(
    () => () => {
      wantRef.current = false
      try { recogRef.current?.abort() } catch { /* noop */ }
      teardownAudio()
    },
    [teardownAudio],
  )

  /** Text already recognised is kept in finalRef; call when the user edits the textarea manually. */
  const syncText = useCallback((text: string) => {
    finalRef.current = text.trim()
  }, [])

  return { status, error, level, seconds, start, stop, reset, getMetrics, syncText, clearError: () => setError(null) }
}
