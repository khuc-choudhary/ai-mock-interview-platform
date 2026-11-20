import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Volume2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useMeta, useSettings, useToast } from '../context/AppContext'
import { api } from '../services/api'
import { Button, Card, InlineError, Modal, PageHeader, SelectField, TextField } from '../components/ui'
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis'
import { browserSttSupported, recorderSupported } from '../hooks/useSpeechInput'
import { hasErrors, validatePassword } from '../utils/validation'

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="text-xs text-white/50">{hint}</span>}</span>
      <input type="checkbox" role="switch" className="size-5 accent-brand-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export default function SettingsPage() {
  const { user, setUser, adoptToken, signOut } = useAuth()
  const { meta } = useMeta()
  const { settings, update } = useSettings()
  const toast = useToast()
  const nav = useNavigate()
  const tts = useSpeechSynthesis({ lang: 'en-IN', rate: settings.ttsRate, voiceName: settings.voiceName, enabled: true })

  const [goal, setGoal] = useState(user!.profile.daily_goal)
  const [savingGoal, setSavingGoal] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState<Record<string, string | null>>({})
  const [pwServer, setPwServer] = useState<string | null>(null)
  const [pwBusy, setPwBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function saveGoal() {
    setSavingGoal(true)
    try {
      const p = user!.profile
      setUser(await api.updateMe({ full_name: user!.full_name, education: p.education, experience_level: p.experience_level, preferred_role: p.preferred_role, skills: p.skills, daily_goal: goal, timezone: p.timezone }))
      toast('success', 'Daily goal updated')
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSavingGoal(false)
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    const errs = { current: pw.current ? null : 'Enter your current password', next: validatePassword(pw.next), confirm: pw.next === pw.confirm ? null : 'Passwords do not match' }
    setPwErrors(errs)
    if (hasErrors(errs)) return
    setPwBusy(true)
    setPwServer(null)
    try {
      const r = await api.changePassword(pw.current, pw.next)
      adoptToken(r.access_token, r.user)
      setPw({ current: '', next: '', confirm: '' })
      toast('success', 'Password changed. Other devices were signed out.')
    } catch (err) {
      setPwServer((err as Error).message)
    } finally {
      setPwBusy(false)
    }
  }

  async function deleteAccount() {
    setDeleting(true)
    try {
      await api.deleteAccount()
      await signOut()
      nav('/login')
    } catch (e) {
      toast('error', (e as Error).message)
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Settings" />

      <Card className="space-y-4">
        <h2 className="font-display font-bold">Practice</h2>
        <div>
          <label className="label" htmlFor="goal">Daily interview goal: <span className="font-semibold text-white">{goal}</span></label>
          <div className="flex items-center gap-3">
            <input id="goal" type="range" min={1} max={10} value={goal} onChange={(e) => setGoal(Number(e.target.value))} className="flex-1 accent-brand-500" />
            <Button variant="ghost" onClick={saveGoal} loading={savingGoal} disabled={goal === user!.profile.daily_goal}>Save</Button>
          </div>
        </div>
        <Toggle checked={settings.instantFeedback} onChange={(v) => update({ instantFeedback: v })} label="Show feedback after each answer" hint="Turn off for a more realistic interview. Feedback is always in your report." />
      </Card>

      <Card className="space-y-4">
        <h2 className="font-display font-bold">Voice</h2>
        <Toggle checked={settings.ttsEnabled} onChange={(v) => update({ ttsEnabled: v })} label="Interviewer speaks questions aloud" hint={tts.supported ? 'Uses your browser’s text-to-speech.' : 'Not supported in this browser.'} />
        <div>
          <label className="label" htmlFor="rate">Speaking speed: {settings.ttsRate.toFixed(1)}×</label>
          <input id="rate" type="range" min={0.7} max={1.4} step={0.1} value={settings.ttsRate} onChange={(e) => update({ ttsRate: Number(e.target.value) })} className="w-full accent-brand-500" />
        </div>
        {tts.voices.length > 0 && (
          <SelectField label="Voice" value={settings.voiceName} onChange={(e) => update({ voiceName: e.target.value })}>
            <option value="">Automatic (matches interview language)</option>
            {tts.voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
          </SelectField>
        )}
        <Button variant="ghost" onClick={() => void tts.speak('Hello! This is how your interviewer will sound.', true)} disabled={!tts.supported}><Volume2 className="size-4" /> Preview voice</Button>

        <SelectField label="Speech-to-text engine" value={settings.speechEngine} onChange={(e) => update({ speechEngine: e.target.value as typeof settings.speechEngine })}>
          <option value="auto">Automatic (browser first, Whisper as fallback)</option>
          <option value="browser" disabled={!browserSttSupported}>Browser speech recognition{browserSttSupported ? '' : ' (not supported here)'}</option>
          <option value="whisper" disabled={!meta?.whisper_available || !recorderSupported}>Whisper (server){meta?.whisper_available ? '' : ' (not configured)'}</option>
        </SelectField>
        <p className="text-xs text-white/45">Browser recognition works best in Chrome/Edge. Whisper keeps filler words like “umm” and works in any browser with a microphone.</p>
      </Card>

      <Card>
        <h2 className="mb-4 font-display font-bold">Change password</h2>
        <form onSubmit={changePassword} className="space-y-4" noValidate>
          {pwServer && <InlineError message={pwServer} />}
          <TextField label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} error={pwErrors.current} />
          <TextField label="New password" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} error={pwErrors.next} />
          <TextField label="Confirm new password" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={pwErrors.confirm} />
          <Button type="submit" loading={pwBusy}>Update password</Button>
        </form>
      </Card>

      <Card className="border-bad/25">
        <h2 className="font-display font-bold text-red-200">Danger zone</h2>
        <p className="mt-1 text-sm text-white/60">Deleting your account permanently removes your profile, interviews, answers and reports.</p>
        <Button variant="danger" className="mt-4" onClick={() => setConfirmDelete(true)}>Delete my account</Button>
      </Card>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your account?" footer={<><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" loading={deleting} onClick={deleteAccount}>Delete everything</Button></>}>
        This cannot be undone. All of your interview history and reports will be erased.
      </Modal>
    </div>
  )
}
