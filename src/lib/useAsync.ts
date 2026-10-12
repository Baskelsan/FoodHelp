import { useCallback, useEffect, useState, type DependencyList } from 'react'
import { describeError } from './data.ts'

interface AsyncState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
}

/** Exécute une fonction asynchrone au montage (et quand deps change). */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({
    data: undefined,
    error: null,
    loading: true,
  })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (error: unknown) =>
        !cancelled && setState({ data: undefined, error: describeError(error), loading: false }),
    )
    return () => {
      cancelled = true
    }
    // fn change à chaque rendu : seules deps et version déclenchent un rechargement
  }, [...deps, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { ...state, reload }
}
