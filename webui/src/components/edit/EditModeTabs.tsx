export type EditMode = 'per_page' | 'global'

export function EditModeTabs({
  mode,
  onChange,
}: {
  mode: EditMode
  onChange: (m: EditMode) => void
}) {
  return (
    <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => onChange('per_page')}
        className={`px-4 py-2 text-sm font-medium transition ${
          mode === 'per_page'
            ? 'border-b-2 border-gemini-500 text-gemini-600 dark:text-gemini-400'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
      >
        逐页/逐节修改
      </button>
      <button
        type="button"
        onClick={() => onChange('global')}
        className={`px-4 py-2 text-sm font-medium transition ${
          mode === 'global'
            ? 'border-b-2 border-gemini-500 text-gemini-600 dark:text-gemini-400'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
      >
        全局修改
      </button>
    </div>
  )
}
