import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type MouseEvent } from 'react'
import { api, type Session } from './api'

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

/**
 * Click handler for panel links that open a published site: a plain click goes through the site's
 * /__team hop so this browser is marked as the team's there and its visits aren't counted. The
 * href stays the clean URL, so "copy link address" never hands a client a team-marked link.
 */
export function useOpenSite() {
  const queryClient = useQueryClient()
  return (url: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const token = queryClient.getQueryData<Session | null>(['session'])?.teamToken
    if (!token || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    window.open(`${url}/__team?${new URLSearchParams({ t: token, next: '/' })}`, '_blank', 'noopener,noreferrer')
  }
}
