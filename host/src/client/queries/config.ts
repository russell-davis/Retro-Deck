import { useQuery, useMutation } from '@tanstack/react-query'
import { client } from '../api'

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
