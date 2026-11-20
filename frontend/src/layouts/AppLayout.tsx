import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, BookOpen, History, LayoutDashboard, LogOut, Menu, Mic, Settings, User, X, AudioLines } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/interview/new', label: 'Start Interview', icon: Mic },
  { to: '/history', label: 'Interview History', icon: History },
  { to: '/analytics', label: 'Performance Analytics', icon: BarChart3 },
  { to: '/learning', label: 'Learning & Improvement', icon: BookOpen },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-sky-brand shadow-lg shadow-brand-500/30">
        <AudioLines className="size-5 text-white" />
      </span>
      <span className="font-display text-lg font-bold tracking-tight">InterviewAI</span>
    </div>
  )
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/interview/new'}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
              isActive ? 'bg-brand-500/20 text-white shadow-inner shadow-brand-400/10' : 'text-white/60 hover:bg-white/7 hover:text-white',
            )
          }
        >
          <Icon className="size-[1.1rem]" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function UserBox() {
  const { user, signOut } = useAuth()
  const nav = useNavigate()
  return (
    <div className="mt-auto border-t border-white/10 pt-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-sky-brand text-sm font-bold">
          {user?.full_name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{user?.full_name}</p>
          <p className="truncate text-xs text-white/45">{user?.email}</p>
        </div>
      </div>
      <button
        className="btn btn-ghost w-full"
        onClick={async () => {
          await signOut()
          nav('/login')
        }}
      >
        <LogOut className="size-4" /> Log out
      </button>
    </div>
  )
}

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/8 bg-ink-950/50 p-5 backdrop-blur-xl lg:flex">
        <div className="mb-8 px-1">
          <Brand />
        </div>
        <NavItems />
        <UserBox />
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/8 bg-ink-950/70 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Brand />
        <button className="btn btn-ghost !p-2" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink-950/70" onClick={() => setOpen(false)} />
            <motion.aside
              className="absolute inset-y-0 left-0 flex w-72 flex-col bg-ink-900 p-5 shadow-2xl"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'tween', duration: 0.2 }}
            >
              <div className="mb-6 flex items-center justify-between">
                <Brand />
                <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-1.5 hover:bg-white/10">
                  <X className="size-5" />
                </button>
              </div>
              <NavItems onNavigate={() => setOpen(false)} />
              <UserBox />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="min-w-0 flex-1">
        <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </motion.div>
      </main>
    </div>
  )
}
