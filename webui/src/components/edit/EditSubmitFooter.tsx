export function EditSubmitFooter({
  annotationCount,
  hasGlobalRevision,
  confirmed,
  onConfirmedChange,
  canSubmit,
  submitting,
  onSubmit,
}: {
  annotationCount: number
  hasGlobalRevision: boolean
  confirmed: boolean
  onConfirmedChange: (v: boolean) => void
  canSubmit: boolean
  submitting: boolean
  onSubmit: () => void
}) {
  const summaryParts: string[] = []
  if (annotationCount > 0) {
    summaryParts.push(`批注 ${annotationCount} 条`)
  }
  if (hasGlobalRevision) {
    summaryParts.push('全局修改 1 项')
  }
  const summary = summaryParts.length > 0 ? summaryParts.join(' · ') : '请添加批注或全局修改'

  return (
    <footer className="sticky bottom-0 -mx-6 mt-2 border-t border-slate-200 bg-white/90 px-6 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => onConfirmedChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-gemini-500 focus:ring-gemini-500"
          />
          确认提交修改（将扣 1 个积分）
        </label>
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className={summaryParts.length > 0 ? 'text-slate-700 dark:text-slate-200' : ''}>
            {summary}
          </span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="rounded-md bg-gemini-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gemini-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '提交中…' : '提交修改'}
          </button>
        </div>
      </div>
    </footer>
  )
}
