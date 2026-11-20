import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Mic, ShieldCheck } from 'lucide-react'
import { Brand } from './AppLayout'
import { DemoBanner } from '../components/ui'

export default function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <Brand />
        <div>
          <h2 className="font-display text-4xl font-bold leading-tight">
            Practise interviews with an AI that <span className="bg-gradient-to-r from-brand-300 to-sky-brand bg-clip-text text-transparent">listens, probes and coaches.</span>
          </h2>
          <ul className="mt-8 space-y-4 text-white/70">
            {[
              [Mic, 'Answer by voice or typing — your AI interviewer follows up on what you say.'],
              [BarChart3, 'Per-answer scoring for accuracy, clarity, grammar and fluency.'],
              [ShieldCheck, 'Your interviews and reports are private to your account.'],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Mic
              return (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white/8 text-brand-300">
                    <I className="size-4" />
                  </span>
                  {text as string}
                </li>
              )
            })}
          </ul>
        </div>
        <p className="text-xs text-white/35">© {new Date().getFullYear()} InterviewAI</p>
      </div>
      <div className="flex items-center justify-center p-5 sm:p-10">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <DemoBanner />
          <div className="glass p-6 sm:p-8">
            <h1 className="font-display text-2xl font-bold">{title}</h1>
            <p className="mb-6 mt-1 text-sm text-white/60">{subtitle}</p>
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
