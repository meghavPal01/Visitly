import { useCallback, useEffect, useRef, useState } from 'react'

export function useFetch(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const seq = useRef(0)
  const run = useCallback(() => {
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then((data) => id === seq.current && setState({ data, loading: false, error: null }))
      .catch((error) => id === seq.current && error.name !== 'AbortError' && setState({ data: null, loading: false, error }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { run(); return () => { seq.current++ } }, [run])
  return { ...state, reload: run }
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}
