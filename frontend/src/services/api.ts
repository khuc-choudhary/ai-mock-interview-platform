import type {
  Analytics,
  Dashboard,
  HistoryPage,
  InterviewConfig,
  Learning,
  Meta,
  Profile,
  Report,
  SessionDetail,
  SessionSummary,
  SpeechMetrics,
  SubmitResponse,
  TokenResponse,
  User,
  Question,
} from '../types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8000'
const TOKEN_KEY = 'mi_token'

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(t: string) {
    try {
      localStorage.setItem(TOKEN_KEY, t)
    } catch {
      /* storage unavailable */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

export class ApiError extends Error {
  status: number
  network: boolean
  constructor(message: string, status: number, network = false) {
    super(message)
    this.status = status
    this.network = network
  }
}

async function raw(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = tokenStore.get()
  if (auth && token) headers.set('Authorization', `Bearer ${token}`)
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(`Can't reach the server at ${BASE}. Make sure the backend is running (python -m uvicorn app.main:app --port 8000) and try again.`, 0, true)
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') message = data.detail
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401 && auth && token) {
      tokenStore.clear()
      window.dispatchEvent(new Event('auth:expired'))
    }
    throw new ApiError(message, res.status)
  }
  return res
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const res = await raw(path, init, auth)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const json = (body: unknown) => ({ body: JSON.stringify(body) })

export const api = {
  meta: () => request<Meta>('/meta', {}, false),

  // auth
  register: (body: Record<string, unknown>) => request<TokenResponse>('/auth/register', { method: 'POST', ...json(body) }, false),
  login: (email: string, password: string) =>
    request<TokenResponse>('/auth/login', { method: 'POST', ...json({ email, password }) }, false),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  me: () => request<User>('/auth/me'),
  updateMe: (body: Record<string, unknown>) => request<User>('/auth/me', { method: 'PUT', ...json(body) }),
  changePassword: (current_password: string, new_password: string) =>
    request<TokenResponse>('/auth/change-password', { method: 'POST', ...json({ current_password, new_password }) }),
  deleteAccount: () => request<{ message: string }>('/auth/me', { method: 'DELETE' }),
  forgotPassword: (email: string) =>
    request<{ message: string; dev_reset_link?: string | null }>('/auth/forgot-password', { method: 'POST', ...json({ email }) }, false),
  resetPassword: (token: string, new_password: string) =>
    request<{ message: string }>('/auth/reset-password', { method: 'POST', ...json({ token, new_password }) }, false),

  // interviews
  createInterview: (cfg: InterviewConfig) => request<SessionDetail>('/interviews', { method: 'POST', ...json(cfg) }),
  getInterview: (id: string) => request<SessionDetail>(`/interviews/${id}`),
  listInterviews: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)))
    return request<HistoryPage>(`/interviews?${qs.toString()}`)
  },
  deleteInterview: (id: string) => request<void>(`/interviews/${id}`, { method: 'DELETE' }),
  submitAnswer: (
    id: string,
    body: { question_id: string; text: string; input_method: 'voice' | 'typed'; speech_metrics?: SpeechMetrics | null },
  ) => request<SubmitResponse>(`/interviews/${id}/answers`, { method: 'POST', ...json(body) }),
  nextQuestion: (id: string) =>
    request<{ done: boolean; question: Question | null }>(`/interviews/${id}/next`, { method: 'POST' }),
  pause: (id: string) => request<SessionDetail>(`/interviews/${id}/pause`, { method: 'POST' }),
  resume: (id: string) => request<SessionDetail>(`/interviews/${id}/resume`, { method: 'POST' }),
  finish: (id: string, ended_early: boolean) =>
    request<{ status: string; report_available: boolean; session: SessionSummary }>(`/interviews/${id}/finish`, {
      method: 'POST',
      ...json({ ended_early }),
    }),
  report: (id: string) => request<Report>(`/interviews/${id}/report`),
  regenerateReport: (id: string) => request<Report>(`/interviews/${id}/report/regenerate`, { method: 'POST' }),
  async downloadReportPdf(id: string) {
    const res = await raw(`/interviews/${id}/report.pdf`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `interview-report-${id.slice(0, 8)}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  },

  // analytics
  dashboard: () => request<Dashboard>('/dashboard'),
  analytics: () => request<Analytics>('/analytics'),
  learning: () => request<Learning>('/learning'),

  // speech
  async transcribe(blob: Blob, language: string): Promise<string> {
    const fd = new FormData()
    fd.append('audio', blob, 'answer.webm')
    fd.append('language', language)
    const data = await request<{ text: string }>('/speech/transcribe', { method: 'POST', body: fd })
    return data.text
  },
}

export type { Profile }
