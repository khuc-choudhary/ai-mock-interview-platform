import { useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/AppContext'
import { api } from '../services/api'
import { Button, Card, InlineError, PageHeader, SelectField, TextField } from '../components/ui'
import { experienceLabel } from '../utils/format'
import { hasErrors, parseSkills, validateName } from '../utils/validation'
import type { Experience } from '../types'

export default function ProfilePage() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const p = user!.profile
  const [f, setF] = useState({
    full_name: user!.full_name,
    education: p.education ?? '',
    experience_level: p.experience_level as Experience,
    preferred_role: p.preferred_role ?? '',
    skills: p.skills.join(', '),
  })
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = { full_name: validateName(f.full_name) }
    setErrors(errs)
    if (hasErrors(errs)) return
    setBusy(true)
    setServerError(null)
    try {
      const u = await api.updateMe({
        full_name: f.full_name.trim(),
        education: f.education.trim() || null,
        experience_level: f.experience_level,
        preferred_role: f.preferred_role.trim() || null,
        skills: parseSkills(f.skills),
        daily_goal: p.daily_goal,
        timezone: p.timezone,
      })
      setUser(u)
      toast('success', 'Profile saved')
    } catch (err) {
      setServerError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Your profile" subtitle="Used to pre-fill and personalise your interviews." />
      <Card>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {serverError && <InlineError message={serverError} />}
          <TextField label="Full name" value={f.full_name} onChange={set('full_name')} error={errors.full_name} />
          <TextField label="Email" value={user!.email} disabled hint="Your email is your login and can't be changed here." />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Education" placeholder="e.g. MCA, B.Tech CSE" value={f.education} onChange={set('education')} />
            <SelectField label="Experience level" value={f.experience_level} onChange={set('experience_level')}>
              {Object.entries(experienceLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectField>
          </div>
          <TextField label="Preferred job role" placeholder="e.g. Python Developer" value={f.preferred_role} onChange={set('preferred_role')} />
          <TextField label="Skills" value={f.skills} onChange={set('skills')} placeholder="Python, SQL, React" hint="Comma-separated." />
          {parseSkills(f.skills).length > 0 && (
            <div className="flex flex-wrap gap-2">{parseSkills(f.skills).map((s) => <span key={s} className="chip border-brand-400/30 bg-brand-500/15 text-brand-300">{s}</span>)}</div>
          )}
          <Button type="submit" loading={busy}><Save className="size-4" /> Save changes</Button>
        </form>
      </Card>
    </div>
  )
}
