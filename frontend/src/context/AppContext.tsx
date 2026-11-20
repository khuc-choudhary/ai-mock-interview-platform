import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { api } from '../services/api'
import type { Meta } from '../types'

/* ---------- Server meta (demo/live mode, topics, whisper availability) ---------- */
interface MetaState {
  meta: Meta | null
  error: string | null
}
const MetaCtx = createContext<MetaState>({ meta: null, error: null })

/* ---------- Toasts ---------- */
type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  text: string
}
const ToastCtx = createContext<(kind: ToastKind, text: string) => void>(() => {})

/* ---------- Local user settings ---------- */
export interface Settings {
  ttsEnabled: boolean
  ttsRate: number
  voiceName: string
  speechEngine: 'auto' | 'browser' | 'whisper'
  instantFeedback: boolean
}
const DEFAULT_SETTINGS: Settings = {
  ttsEnabled: true,
  ttsRate: 1,
  voiceName: '',
  speechEngine: 'auto',
  instantFeedback: true,
}
const SettingsCtx = createContext<{ settings: Settings; update: (p: Partial<Settings>) => void }>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
})

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('mi_settings')
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const nextId = useRef(1)

  useEffect(() => {
    api
      .meta()
      .then(setMeta)
      .catch((e: Error) => setMetaError(e.message))
  }, [])

  const toast = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }, [])

  const update = useCallback((p: Partial<Settings>) => {
    setSettings((s) => {
      const n = { ...s, ...p }
      try {
        localStorage.setItem('mi_settings', JSON.stringify(n))
      } catch {
        /* ignore */
      }
      return n
    })
  }, [])

  const metaValue = useMemo(() => ({ meta, error: metaError }), [meta, metaError])
  const settingsValue = useMemo(() => ({ settings, update }), [settings, update])

  return (
    <MetaCtx.Provider value={metaValue}>
      <SettingsCtx.Provider value={settingsValue}>
        <ToastCtx.Provider value={toast}>
          {children}
          <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2" aria-live="polite">
            <AnimatePresence>
              {toasts.map((t) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  className="glass pointer-events-auto flex items-start gap-2.5 p-3 text-sm"
                >
                  {t.kind === 'success' ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" />
                  ) : t.kind === 'error' ? (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-bad" />
                  ) : (
                    <Info className="mt-0.5 size-4 shrink-0 text-brand-300" />
                  )}
                  <span>{t.text}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ToastCtx.Provider>
      </SettingsCtx.Provider>
    </MetaCtx.Provider>
  )
}

export const useMeta = () => useContext(MetaCtx)
export const useToast = () => useContext(ToastCtx)
export const useSettings = () => useContext(SettingsCtx)
