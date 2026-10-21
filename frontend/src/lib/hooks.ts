import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from './api'

export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function useAppConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity })
}

/** Live check of a subdomain; `unchanged` skips the request when editing the current name. */
export function useNameAvailability(name: string, exceptId?: string, unchanged = false) {
  const debounced = useDebounced(name.trim().toLowerCase(), 350)
  const query = useQuery({
    queryKey: ['name', debounced, exceptId],
    queryFn: () => api.nameAvailability(debounced, exceptId),
    enabled: debounced.length > 0 && !unchanged,
  })
  const pending = name.trim().toLowerCase() !== debounced || query.isFetching
  return { ...query.data, checking: pending && !unchanged, ready: unchanged || (!pending && !!query.data?.available) }
}
