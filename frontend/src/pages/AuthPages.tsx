import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import AuthLayout from '../layouts/AuthLayout'
import { Button, InlineError, SelectField, TextField } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { experienceLabel } from '../utils/format'
import { hasErrors, parseSkills, validateEmail, validateName, validatePassword } from '../utils/validation'
import type { Experience } from '../types'

export function LoginPage() {
  const { signIn, user } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = { email: validateEmail(email), password: password ? null : 'Password is required' }
    setErrors(errs)
    if (hasErrors(errs)) return
    setBusy(true)
    setServerError(null)
    try {
      await signIn(email.trim(), password)
      nav((loc.state as { from?: string } | null)?.from ?? '/dashboard', { replace: true })
    } catch (err) {
      setServerError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue your interview practice.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {serverError && <InlineError message={serverError} />}
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <div className="text-right text-xs">
          <Link to="/forgot-password" className="text-brand-300 hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
      </form>
      <p className="mt-5 text-center text-sm text-white/60">
        New here? <Link to="/register" className="font-semibold text-brand-300 hover:underline">Create an account</Link>
      </p>
    </AuthLayout>
  )
}

export function RegisterPage() {
  const { signUp, user } = useAuth()
  const nav = useNavigate()
  const [f, setF] = useState({ full_name: '', email: '', password: '', education: '', experience_level: 'fresher' as Experience, preferred_role: '', skills: '' })
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))

  if (user) return <Navigate to="/dashboard" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = { full_name: validateName(f.full_name), email: validateEmail(f.email), password: validatePassword(f.password) }
    setErrors(errs)
    if (hasErrors(errs)) return
    setBusy(true)
    setServerError(null)
    try {
      await signUp({
        full_name: f.full_name.trim(),
        email: f.email.trim(),
        password: f.password,
        education: f.education.trim() || null,
        experience_level: f.experience_level,
        preferred_role: f.preferred_role.trim() || null,
        skills: parseSkills(f.skills),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      })
      nav('/dashboard', { replace: true })
    } catch (err) {
      setServerError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Set up your profile so interviews match your goals.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {serverError && <InlineError message={serverError} />}
        <TextField label="Full name" autoComplete="name" value={f.full_name} onChange={set('full_name')} error={errors.full_name} />
        <TextField label="Email" type="email" autoComplete="email" value={f.email} onChange={set('email')} error={errors.email} />
        <TextField label="Password" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} error={errors.password} hint="At least 8 characters with a letter and a number." />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Education (optional)" placeholder="e.g. MCA, B.Tech CSE" value={f.education} onChange={set('education')} />
          <SelectField label="Experience level" value={f.experience_level} onChange={set('experience_level')}>
            {Object.entries(experienceLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
        </div>
        <TextField label="Preferred job role (optional)" placeholder="e.g. Python Developer" value={f.preferred_role} onChange={set('preferred_role')} />
        <TextField label="Skills (optional)" placeholder="Python, SQL, React" value={f.skills} onChange={set('skills')} hint="Comma-separated." />
        <Button type="submit" className="w-full" loading={busy}>Create account</Button>
      </form>
      <p className="mt-5 text-center text-sm text-white/60">
        Already registered? <Link to="/login" className="font-semibold text-brand-300 hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ message: string; link?: string | null } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const err = validateEmail(email)
    setError(err)
    if (err) return
    setBusy(true)
    setServerError(null)
    try {
      const r = await api.forgotPassword(email.trim())
      setDone({ message: r.message, link: r.dev_reset_link })
    } catch (e2) {
      setServerError((e2 as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Forgot password" subtitle="We'll email you a link to reset it.">
      {done ? (
        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-2 text-good"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><p>{done.message}</p></div>
          {done.link && (
            <a href={done.link} className="btn btn-ghost w-full">Open reset link (development only)</a>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {serverError && <InlineError message={serverError} />}
          <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
          <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
        </form>
      )}
      <p className="mt-5 text-center text-sm"><Link to="/login" className="text-brand-300 hover:underline">Back to sign in</Link></p>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = { pw: validatePassword(pw), pw2: pw === pw2 ? null : 'Passwords do not match' }
    setErrors(errs)
    if (hasErrors(errs)) return
    setBusy(true)
    setServerError(null)
    try {
      await api.resetPassword(token, pw)
      setDone(true)
      setTimeout(() => nav('/login'), 1800)
    } catch (e2) {
      setServerError((e2 as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Reset password" subtitle="Choose a new password for your account.">
      {!token ? (
        <InlineError message="This reset link is missing its token. Request a new one." />
      ) : done ? (
        <div className="flex items-start gap-2 text-sm text-good"><CheckCircle2 className="mt-0.5 size-4" /> Password updated. Redirecting to sign in…</div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {serverError && <InlineError message={serverError} />}
          <TextField label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={errors.pw} />
          <TextField label="Confirm new password" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={errors.pw2} />
          <Button type="submit" className="w-full" loading={busy}>Update password</Button>
        </form>
      )}
      <p className="mt-5 text-center text-sm"><Link to="/login" className="text-brand-300 hover:underline">Back to sign in</Link></p>
    </AuthLayout>
  )
}
