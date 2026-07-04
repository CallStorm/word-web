import type { TemplateSlot } from '../../api/types'

export function TemplateSlotPanel({
  slots,
  dirty,
  onRemove,
  onMoveUp,
  onMoveDown,
  readOnly,
}: {
  slots: TemplateSlot[]
  dirty: boolean
  readOnly?: boolean
  onRemove: (key: string) => void
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100">变量列表</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {slots.length} 个变量
          {dirty && <span className="ml-2 text-amber-600">· 有未保存变更</span>}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {slots.length === 0 ? (
          <p className="text-sm text-slate-400">
            {readOnly ? '此模板暂无变量定义。' : '在左侧选中文字并标记为变量。'}
          </p>
        ) : (
          <ul className="space-y-2">
            {slots.map((slot, index) => (
              <li
                key={slot.key}
                className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{slot.label}</p>
                    <p className="mt-0.5 font-mono text-xs text-gemini-600">{`{{${slot.key}}}`}</p>
                    {slot.hint && (
                      <p className="mt-1 text-xs text-slate-500">{slot.hint}</p>
                    )}
                    {slot.sample_text && (
                      <p className="mt-1 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500 dark:border-slate-600">
                        {slot.sample_text}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    {!readOnly && (
                      <>
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => onMoveUp(index)}
                          className="rounded px-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700"
                          title="上移"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index === slots.length - 1}
                          onClick={() => onMoveDown(index)}
                          className="rounded px-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700"
                          title="下移"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(slot.key)}
                          className="rounded px-1 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                          title="删除"
                        >
                          删
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
