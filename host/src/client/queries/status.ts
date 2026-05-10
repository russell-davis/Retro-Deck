import { useQuery } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { client } from '../api'

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const res = await client.api.status.$get()
      if (!res.ok) throw new Error(`status ${res.status}`)
      return res.json()
    },
    refetchInterval: 5_000,
  })
}

export function useActivateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await client.api.profile[':name'].$post({ param: { name } })
      if (!res.ok) throw new Error(`activate ${res.status}`)
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] })
      qc.invalidateQueries({ queryKey: ['config'] })
    },
  })
}
