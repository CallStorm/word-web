import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { EditTargetsResponse, TemplateSlot } from '../api/types'
import { TemplateEditLayout } from '../components/templates/TemplateEditLayout'
import { TemplateSlotDialog } from '../components/templates/TemplateSlotDialog'
import {
  useForkTemplate,
  useSaveTemplateSlots,
  useTemplate,
} from '../hooks/useTemplates'
import type { TextSelectionAnchor } from '../lib/wordDocumentDom'
import { notifyError, notifySuccess } from '../stores/toastStore'

function slotsEqual(a: TemplateSlot[], b: TemplateSlot[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function TemplateEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: template, isLoading, error } = useTemplate(id)
  const saveSlots = useSaveTemplateSlots()
  const forkTemplate = useForkTemplate()

  const targetsQ = useQuery({
    queryKey: ['template', id, 'edit-targets'],
    queryFn: () => api<EditTargetsResponse>('GET', `/api/templates/${id}/edit-targets`),
    enabled: !!id,
  })

  const [name, setName] = useState('')
  const [slots, setSlots] = useState<TemplateSlot[]>([])
  const [savedSlots, setSavedSlots] = useState<TemplateSlot[]>([])
  const [markDialog, setMarkDialog] = useState<{ anchor: TextSelectionAnchor } | null>(null)
  const [previewVersion, setPreviewVersion] = useState(0)

  const readOnly = template?.is_builtin ?? false

  useEffect(() => {
    if (!template) return
    setName(template.name)
    const initial = template.slots?.length ? template.slots : []
    setSlots(initial)
    setSavedSlots(initial)
  }, [template])

  useEffect(() => {
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prev
    }
  }, [])

  const dirty = useMemo(() => {
    if (readOnly) return false
    if (template && name !== template.name) return true
    return !slotsEqual(slots, savedSlots)
  }, [name, slots, savedSlots, template, readOnly])

  const documentHtmlUrl = useMemo(() => {
    const base = targetsQ.data?.document_html_url ?? template?.document_html_url
    if (!base) return null
    const sep = base.includes('?') ? '&' : '?'
    return `${base}${sep}v=${previewVersion}`
  }, [targetsQ.data?.document_html_url, template?.document_html_url, previewVersion])

  const documentOutline = targetsQ.data?.document_outline ?? []
  const slides = targetsQ.data?.slides ?? []

  if (isLoading || targetsQ.isLoading) {
    return (
      <div className="flex h-[calc(100vh-3rem)] items-center justify-center text-slate-400">
        加载中…
      </div>
    )
  }

  if (error || !template || !id) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-rose-600">模板不存在或加载失败</p>
        <Link to="/templates" className="mt-4 inline-block text-sm text-gemini-600 hover:underline">
          返回模板库
        </Link>
      </div>
    )
  }

  const handleAddSlot = (data: { key: string; label: string; hint: string }) => {
    if (slots.some((s) => s.key === data.key)) {
      notifyError(`变量 key「${data.key}」已存在`)
      return
    }
    const anchor = markDialog?.anchor
    if (!anchor) return
    const next: TemplateSlot = {
      key: data.key,
      label: data.label,
      hint: data.hint || null,
      sample_text: anchor.quote,
      data_path: anchor.dataPath,
      order: slots.length,
      source: 'manual',
    }
    setSlots([...slots, next])
    setMarkDialog(null)
  }

  const handleRemove = (key: string) => {
    setSlots(slots.filter((s) => s.key !== key).map((s, i) => ({ ...s, order: i })))
  }

  const moveSlot = (index: number, delta: number) => {
    const next = [...slots]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setSlots(next.map((s, i) => ({ ...s, order: i })))
  }

  const handleSave = async () => {
    if (readOnly) return
    try {
      const res = await saveSlots.mutateAsync({
        id,
        name: name.trim(),
        slots: slots.map((s, i) => ({ ...s, order: i })),
      })
      setSavedSlots(res.slots ?? slots)
      setName(res.name)
      setPreviewVersion((v) => v + 1)
      notifySuccess('已保存并更新预览')
    } catch (e) {
      notifyError('保存失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const handleFork = async () => {
    try {
      const copy = await forkTemplate.mutateAsync(id)
      notifySuccess('已复制，正在进入编辑…')
      navigate(`/templates/${copy.id}/edit`, { replace: true })
    } catch (e) {
      notifyError('复制失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          readOnly={readOnly}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium read-only:opacity-80 hover:border-slate-200 focus:border-gemini-400 focus:outline-none dark:hover:border-slate-600"
        />
        {readOnly && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">
            内置 · 只读
          </span>
        )}
        <Link to="/templates" className="text-sm text-slate-500 hover:text-gemini-600">
          取消
        </Link>
        {readOnly ? (
          <button
            type="button"
            disabled={forkTemplate.isPending}
            onClick={handleFork}
            className="rounded-md bg-gemini-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-gemini-700 disabled:opacity-50"
          >
            复制为我的模板
          </button>
        ) : (
          <button
            type="button"
            disabled={!dirty || saveSlots.isPending}
            onClick={handleSave}
            className="rounded-md bg-gemini-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-gemini-700 disabled:opacity-50"
          >
            {saveSlots.isPending ? '保存中…' : '保存'}
          </button>
        )}
      </header>

      <TemplateEditLayout
        documentHtmlUrl={documentHtmlUrl}
        documentOutline={documentOutline}
        slides={slides}
        slots={slots}
        dirty={dirty}
        readOnly={readOnly}
        onMarkVariable={(anchor) => setMarkDialog({ anchor })}
        onRemoveSlot={handleRemove}
        onMoveSlotUp={(i) => moveSlot(i, -1)}
        onMoveSlotDown={(i) => moveSlot(i, 1)}
      />

      <TemplateSlotDialog
        open={!!markDialog && !readOnly}
        sampleText={markDialog?.anchor.quote ?? ''}
        onSave={handleAddSlot}
        onCancel={() => setMarkDialog(null)}
      />
    </div>
  )
}
