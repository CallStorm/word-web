import { useEffect, useRef, useState } from 'react'

export function AnnotationPopover({
  x,
  y,
  initialText = '',
  onSave,
  onCancel,
}: {
  x: number
  y: number
  initialText?: string
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initialText)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="absolute z-30 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-600 dark:bg-slate-900"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">批注</p>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 500))}
        placeholder="描述要修改的内容…"
        rows={3}
        className="w-full resize-none rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          取消
        </button>
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => onSave(text.trim())}
          className="rounded bg-gemini-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          保存
        </button>
      </div>
    </div>
  )
}
