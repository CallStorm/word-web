import { useEffect, useState } from 'react'

export function TemplateSlotDialog({
  open,
  sampleText,
  initialKey,
  initialLabel,
  initialHint,
  onSave,
  onCancel,
}: {
  open: boolean
  sampleText: string
  initialKey?: string
  initialLabel?: string
  initialHint?: string
  onSave: (data: { key: string; label: string; hint: string }) => void
  onCancel: () => void
}) {
  const [key, setKey] = useState(initialKey ?? '')
  const [label, setLabel] = useState(initialLabel ?? '')
  const [hint, setHint] = useState(initialHint ?? '')

  useEffect(() => {
    if (open) {
      setKey(initialKey ?? '')
      setLabel(initialLabel ?? sampleText.slice(0, 32))
      setHint(initialHint ?? '')
    }
  }, [open, initialKey, initialLabel, initialHint, sampleText])

  if (!open) return null

  const validKey = /^[a-z][a-z0-9_]{0,31}$/.test(key.trim())

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">标记为变量</h3>
        <p className="mt-1 text-xs text-slate-500">
          原文：「{sampleText.length > 60 ? `${sampleText.slice(0, 60)}…` : sampleText}」
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs text-slate-500">变量 key（英文 snake_case）</span>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
              placeholder="candidate_name"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">显示名</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">说明（可选，供填表/AI 参考）</span>
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!validKey || !label.trim()}
            onClick={() => onSave({ key: key.trim(), label: label.trim(), hint: hint.trim() })}
            className="rounded-md bg-gemini-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-gemini-700 disabled:opacity-50"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  )
}
