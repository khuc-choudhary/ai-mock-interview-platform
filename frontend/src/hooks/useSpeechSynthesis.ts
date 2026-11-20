import { useCallback, useEffect, useRef, useState } from 'react'

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

function pickVoice(voices: SpeechSynthesisVoice[], lang: string, preferred: string): SpeechSynthesisVoice | undefined {
  if (preferred) {
    const v = voices.find((x) => x.name === preferred)
    if (v) return v
  }
  const base = lang.split('-')[0]
  return (
    voices.find((v) => v.lang.replace('_', '-') === lang) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    undefined
  )
}

/** Browser SpeechSynthesis wrapper. speak() resolves when the utterance ends (or immediately if unsupported/disabled). */
export function useSpeechSynthesis(opts: { lang: string; rate: number; voiceName: string; enabled: boolean }) {
  const [speaking, setSpeaking] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const tokenRef = useRef(0)
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    if (!ttsSupported) return
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  const cancel = useCallback(() => {
    tokenRef.current++
    if (ttsSupported) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  const speak = useCallback((text: string, force = false): Promise<void> => {
    const o = optsRef.current
    if (!ttsSupported || (!o.enabled && !force) || !text.trim()) return Promise.resolve()
    window.speechSynthesis.cancel()
    const token = ++tokenRef.current
    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = o.lang
      u.rate = o.rate
      const v = pickVoice(window.speechSynthesis.getVoices(), o.lang, o.voiceName)
      if (v) u.voice = v
      const done = () => {
        if (tokenRef.current === token) setSpeaking(false)
        resolve()
      }
      u.onstart = () => tokenRef.current === token && setSpeaking(true)
      u.onend = done
      u.onerror = done
      window.speechSynthesis.speak(u)
    })
  }, [])

  useEffect(() => () => {
    if (ttsSupported) window.speechSynthesis.cancel()
  }, [])

  return { speak, cancel, speaking, voices, supported: ttsSupported }
}
