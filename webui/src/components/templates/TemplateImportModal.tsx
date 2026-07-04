import { useRef, useState } from 'react'

const CATEGORY_OPTIONS = [
  { value: 'custom', label: '自定义' },
  { value: 'report', label: '报告' },
  { value: 'memo', label: '纪要' },
  { value: 'contract', label: '合同' },
  { value: 'letter', label: '信件' },
  { value: 'application', label: '申请' },
]

export function TemplateImportModal({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: { name: string; category: string; description: string; file: File }) => void
  pending?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('custom')
  const [description, setDescription] = useState('')

  if (!open) return null

  const handleSubmit = () => {
    const file = fileRef.current?.files?.[0]
    if (!file || !name.trim()) return
    onSubmit({ name: name.trim(), category, description, file })
  }

  const resetAndClose = () => {
    setName('')
    setDescription('')
    setCategory('custom')
    if (fileRef.current) fileRef.current.value = ''
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-template-title"
      >
        <h2 id="import-template-title" className="text-base font-semibold text-slate-800 dark:text-slate-100">
          导入模板
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          上传 .docx 文件作为模板，可在编辑页标记变量。
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs text-slate-500">模板名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              placeholder="例：公司合同模板"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">分类</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">描述（可选）</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">.docx 文件</span>
            <input
              ref={fileRef}
              type="file"
              accept=".docx"
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-gemini-50 file:px-3 file:py-1.5 file:text-sm file:text-gemini-700 dark:text-slate-400 dark:file:bg-gemini-950 dark:file:text-gemini-200"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            取消
          </button>
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={handleSubmit}
            className="rounded-md bg-gemini-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-gemini-700 disabled:opacity-50"
          >
            {pending ? '上传中…' : '导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
