import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Template } from '../api/types'
import { TemplateCard } from '../components/templates/TemplateCard'
import { TemplateImportModal } from '../components/templates/TemplateImportModal'
import {
  useDeleteTemplate,
  useForkTemplate,
  useTemplates,
  useUploadTemplate,
} from '../hooks/useTemplates'
import { confirmDialog } from '../stores/modalStore'
import { notifyError, notifySuccess } from '../stores/toastStore'

type Filter = 'all' | 'builtin' | 'mine'

export function TemplatesPage() {
  const navigate = useNavigate()
  const { data: templates, isLoading, error } = useTemplates()
  const uploadTemplate = useUploadTemplate()
  const deleteTemplate = useDeleteTemplate()
  const forkTemplate = useForkTemplate()

  const [filter, setFilter] = useState<Filter>('all')
  const [importOpen, setImportOpen] = useState(false)

  const filtered = useMemo(() => {
    const list = templates ?? []
    if (filter === 'builtin') return list.filter((t) => t.is_builtin)
    if (filter === 'mine') return list.filter((t) => !t.is_builtin)
    return list
  }, [templates, filter])

  const handleImport = async (data: {
    name: string
    category: string
    description: string
    file: File
  }) => {
    const fd = new FormData()
    fd.append('name', data.name)
    fd.append('category', data.category)
    fd.append('description', data.description)
    fd.append('file', data.file, data.file.name)
    try {
      const res = await uploadTemplate.mutateAsync(fd)
      notifySuccess(`已导入「${res.name}」`)
      setImportOpen(false)
      navigate(`/templates/${res.id}/edit`)
    } catch (e) {
      notifyError('导入失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const handleDelete = async (t: Template) => {
    const ok = await confirmDialog({
      title: '删除模板',
      body: `确认删除「${t.name}」？此操作不可恢复。`,
      confirmText: '删除',
      cancelText: '取消',
    })
    if (!ok) return
    try {
      await deleteTemplate.mutateAsync(t.id)
      notifySuccess('已删除')
    } catch (e) {
      notifyError('删除失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const handleFork = async (t: Template) => {
    try {
      const copy = await forkTemplate.mutateAsync(t.id)
      notifySuccess(`已复制为「${copy.name}」`)
      navigate(`/templates/${copy.id}/edit`)
    } catch (e) {
      notifyError('复制失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">模板管理</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            共 {filtered.length} 个 · 固定结构 + 可替换变量
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/templates/fill" className="text-sm text-slate-500 hover:text-gemini-600">
            模板填充
          </Link>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="rounded-md bg-gemini-600 px-4 py-2 text-sm font-medium text-white hover:bg-gemini-700"
          >
            导入模板
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {(
          [
            ['all', '全部'],
            ['builtin', '内置'],
            ['mine', '我的'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === value
                ? 'bg-gemini-100 text-gemini-800 dark:bg-gemini-900/40 dark:text-gemini-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-slate-400">加载中…</p>}
      {error && (
        <p className="text-sm text-rose-600">
          {error instanceof Error ? error.message : '加载失败'}
        </p>
      )}

      {!isLoading && !error && (
        filtered.length === 0 ? (
          <p className="text-sm text-slate-400">暂无模板，点击右上角导入。</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onDelete={handleDelete}
                onFork={handleFork}
              />
            ))}
          </div>
        )
      )}

      <TemplateImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSubmit={handleImport}
        pending={uploadTemplate.isPending}
      />
    </div>
  )
}
