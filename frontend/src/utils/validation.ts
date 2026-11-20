export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEmail(v: string): string | null {
  if (!v.trim()) return 'Email is required'
  return EMAIL_RE.test(v.trim()) ? null : 'Enter a valid email address'
}

export function validatePassword(v: string): string | null {
  if (!v) return 'Password is required'
  if (v.length < 8) return 'Use at least 8 characters'
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Include at least one letter and one number'
  if (new TextEncoder().encode(v).length > 72) return 'Password is too long (max 72 bytes)'
  return null
}

export function validateName(v: string): string | null {
  const t = v.trim()
  if (t.length < 2) return 'Enter your full name'
  return t.length > 120 ? 'Name is too long' : null
}

export const hasErrors = (e: Record<string, string | null | undefined>) => Object.values(e).some(Boolean)

export function parseSkills(text: string): string[] {
  return Array.from(new Set(text.split(',').map((s) => s.trim()).filter(Boolean))).slice(0, 30)
}
