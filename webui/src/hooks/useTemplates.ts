import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Template, TemplateSlot, TemplatesListResponse } from '../api/types'

export const TEMPLATES_KEY = ['templates'] as const
export const templateKey = (id: string) => ['template', id] as const

async function fetchTemplates(): Promise<Template[]> {
  const data = await api<TemplatesListResponse>('GET', '/api/templates')
  return data.templates || []
}

export function useTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: fetchTemplates,
    staleTime: 60_000,
  })
}

export function useTemplate(id: string | undefined) {
  return useQuery({
    queryKey: templateKey(id ?? ''),
    queryFn: () => api<Template>('GET', `/api/templates/${id}`),
    enabled: !!id,
  })
}

export function useUploadTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fd: FormData) =>
      api<{ id: string; name: string; placeholder_count: number; cover_url?: string | null }>(
        'POST',
        '/api/templates',
        fd,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
    },
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; description?: string; category?: string } }) =>
      api<Template>('PUT', `/api/templates/${id}`, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
      qc.invalidateQueries({ queryKey: templateKey(id) })
    },
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>('DELETE', `/api/templates/${id}`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
      qc.removeQueries({ queryKey: templateKey(id) })
    },
  })
}

export function useForkTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<Template>('POST', `/api/templates/${id}/fork`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
    },
  })
}

export function useSaveTemplateSlots() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, slots, name }: { id: string; slots: TemplateSlot[]; name?: string }) =>
      api<Template>('PUT', `/api/templates/${id}/slots`, { slots, name }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
      qc.invalidateQueries({ queryKey: templateKey(id) })
    },
  })
}

export function useSyncTemplatePreview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<Template>('POST', `/api/templates/${id}/preview/sync`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
      qc.invalidateQueries({ queryKey: templateKey(id) })
    },
  })
}

export function useReanalyzeTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<Template>('POST', `/api/templates/${id}/analyze`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
      qc.invalidateQueries({ queryKey: templateKey(id) })
    },
  })
}
