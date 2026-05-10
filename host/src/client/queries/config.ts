import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { client } from '../api'
import type { Config, ButtonBinding } from '../../server/config'
import { setBinding } from '../lib/binding'

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await client.api.config.$get()
      if (!res.ok) throw new Error(`config ${res.status}`)
      return res.json()
    },
  })
}

export function useFireButton() {
  return useMutation({
    mutationFn: async ({ id, slot }: { id: string; slot: 'press' | 'hold' }) => {
      const res = await client.api.fire[':id'][':slot'].$post({ param: { id, slot } })
      const body = (await res.json()) as { ok: boolean; error?: string }
      if (!body.ok) throw new Error(body.error ?? `fire ${res.status}`)
      return body
    },
  })
}

export function useSaveBinding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      config,
      profileName,
      id,
      binding,
    }: {
      config: Config
      profileName: string
      id: string
      binding: ButtonBinding
    }) => {
      const next = setBinding(config, profileName, id, binding)
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const body = (await res.json()) as { ok: boolean; error?: string }
      if (!body.ok) throw new Error(body.error ?? `save failed: ${res.status}`)
      return body
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      qc.invalidateQueries({ queryKey: ['status'] })
    },
  })
}
