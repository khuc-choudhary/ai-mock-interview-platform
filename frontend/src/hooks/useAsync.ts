import { useCallback, useEffect, useRef, useState } from 'react'

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const seq = useRef(0)

  const run = useCallback(() => {
    const id = ++seq.current
    setLoading(true)
    setError(null)
    fnRef
      .current()
      .then((d) => seq.current === id && setData(d))
      .catch((e: Error) => seq.current === id && setError(e.message))
      .finally(() => seq.current === id && setLoading(false))
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps)
  return { data, error, loading, reload: run, setData }
}
