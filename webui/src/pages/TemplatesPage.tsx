import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Template } from '../api/types'
import {
  useDeleteTemplate,
  useReanalyzeTemplate,
  useTemplates,
  useUploadTemplate,
} from '../hooks/useTemplates'
import { confirmDialog } from '../stores/modalStore'
import { notifyError, notifySuccess } from '../stores/toastStore'
import catalogData from '../lib/templateCatalog.json'

const PANEL_CLASS =
  'rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40'

function catalogIcon(t: Template): string {
  const entry = catalogData.templates.find((c) => c.builtin_id === t.id)
  return entry?.icon ?? '📄'
}

export function TemplatesPage() {
  const { data: templates, isLoading, error } = useTemplates()
  const uploadTemplate = useUploadTemplate()
  const deleteTemplate = useDeleteTemplate()
  const reanalyze = useReanalyzeTemplate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [uploadName, setUploadName] = useState('')
  const [uploadCategory, setUploadCategory] = useState('custom')
  const [uploadDesc, setUploadDesc] = useState('')

  const builtins = (templates ?? []).filter((t) => t.is_builtin)
  const custom = (templates ?? []).filter((t) => !t.is_builtin)

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      notifyError('请选择 .docx 模板文件')
      return
    }
    if (!uploadName.trim()) {
      notifyError('请填写模板名称')
      return
    }
    const fd = new FormData()
    fd.append('name', uploadName.trim())
    fd.append('category', uploadCategory)
    fd.append('description', uploadDesc)
    fd.append('file', file, file.name)
    try {
      const res = await uploadTemplate.mutateAsync(fd)
      notifySuccess(`已上传「${res.name}」，识别 ${res.placeholder_count} 个占位符`)
      setUploadName('')
      setUploadDesc('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      notifyError('上传失败: ' + (e instanceof Error ? e.message : String(e)))
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

  const handleReanalyze = async (t: Template) => {
    try {
      const res = await reanalyze.mutateAsync(t.id)
      notifySuccess(`已重新分析，${res.placeholder_count} 个占位符`)
    } catch (e) {
      notifyError('分析失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">模板管理</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            内置模板来自 word-master；也可上传自定义 .docx 模板（含 {'{{key}}'} 占位符）。
          </p>
        </div>
        <Link to="/jobs/new" className="text-sm text-gemini-600 hover:underline">
          创建文档 →
        </Link>
      </div>

      <section className={PANEL_CLASS}>
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">上传自定义模板</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs text-slate-500">模板名称</span>
            <input
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              placeholder="例：公司合同模板"
            />
          </label>
          <label>
            <span className="text-xs text-slate-500">分类</span>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="custom">自定义</option>
              <option value="report">报告</option>
              <option value="memo">纪要</option>
              <option value="contract">合同</option>
              <option value="letter">信件</option>
            </select>
          </label>
          <label>
            <span className="text-xs text-slate-500">.docx 文件</span>
            <input
              ref={fileRef}
              type="file"
              accept=".docx"
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-gemini-50 file:px-3 file:py-1.5 file:text-sm file:text-gemini-700 dark:text-slate-400 dark:file:bg-gemini-950 dark:file:text-gemini-200"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-xs text-slate-500">描述（可选）</span>
            <input
              value={uploadDesc}
              onChange={(e) => setUploadDesc(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={uploadTemplate.isPending}
          onClick={handleUpload}
          className="mt-3 rounded-md bg-gemini-600 px-4 py-2 text-sm font-medium text-white hover:bg-gemini-700 disabled:opacity-50"
        >
          {uploadTemplate.isPending ? '上传中…' : '上传模板'}
        </button>
      </section>

      {isLoading && <p className="mt-6 text-sm text-slate-400">加载中…</p>}
      {error && (
        <p className="mt-6 text-sm text-rose-600">
          {error instanceof Error ? error.message : '加载失败'}
        </p>
      )}

      {!isLoading && !error && (
        <div className="mt-6 space-y-6">
          <TemplateSection title="内置模板" items={builtins} onReanalyze={handleReanalyze} />
          <TemplateSection
            title="我的模板"
            items={custom}
            emptyHint="尚未上传自定义模板"
            onDelete={handleDelete}
            onReanalyze={handleReanalyze}
          />
        </div>
      )}
    </div>
  )
}

function TemplateSection({
  title,
  items,
  emptyHint,
  onDelete,
  onReanalyze,
}: {
  title: string
  items: Template[]
  emptyHint?: string
  onDelete?: (t: Template) => void
  onReanalyze?: (t: Template) => void
}) {
  return (
    <section className={PANEL_CLASS}>
      <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">{emptyHint ?? '暂无'}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className="text-2xl" aria-hidden>
                {catalogIcon(t)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{t.name}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">
                    {t.category}
                  </span>
                </div>
                {t.description && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                )}
                <p className="mt-1 text-[11px] text-slate-400">
                  {t.placeholder_count} 个占位符
                  {t.placeholders.length > 0 && (
                    <span className="ml-1">
                      · {t.placeholders.slice(0, 5).join(', ')}
                      {t.placeholders.length > 5 ? '…' : ''}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {onReanalyze && (
                  <button
                    type="button"
                    onClick={() => onReanalyze(t)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    重新分析
                  </button>
                )}
                {onDelete && !t.is_builtin && (
                  <button
                    type="button"
                    onClick={() => onDelete(t)}
                    className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-900/20"
                  >
                    删除
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
