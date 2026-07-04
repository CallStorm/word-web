import type {
  ContentPreset,
  EditTargetSlide,
  GlobalRevision,
  GlobalRevisionKind,
} from '../../api/types'
import { GlobalEditTypeCards } from './GlobalEditTypeCards'
import { CONTENT_PRESET_OPTIONS } from '../../lib/pptJobOptions'

const MAX_CUSTOM = 2000

export function buildGlobalRevisionPayload(
  kind: GlobalRevisionKind,
  state: {
    colorDraft: Record<string, string>
    fontFamily: string
    visualStyle: string
    contentPreset: ContentPreset | null
    contentComment: string
    customComment: string
  },
): GlobalRevision | null {
  if (kind === 'content') {
    const comment = state.contentComment.trim()
    if (!state.contentPreset && !comment) return null
    return {
      kind: 'content',
      content_preset: state.contentPreset,
      comment: comment || null,
    }
  }
  const comment = state.customComment.trim()
  if (!comment) return null
  return { kind: 'custom', comment }
}

export function GlobalEditPanel({
  slides,
  kind,
  onKindChange,
  contentPreset,
  onContentPresetChange,
  contentComment,
  onContentCommentChange,
  customComment,
  onCustomCommentChange,
}: {
  slides: EditTargetSlide[]
  kind: GlobalRevisionKind
  onKindChange: (k: GlobalRevisionKind) => void
  contentPreset: ContentPreset | null
  onContentPresetChange: (v: ContentPreset | null) => void
  contentComment: string
  onContentCommentChange: (v: string) => void
  customComment: string
  onCustomCommentChange: (v: string) => void
}) {
  return (
    <div className="space-y-4">
      <GlobalEditTypeCards value={kind} onChange={onKindChange} />

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        {kind === 'content' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              尽量保留现有版式与 Title/Heading 样式，仅调整文字。
            </p>
            <div className="flex flex-wrap gap-2">
              {CONTENT_PRESET_OPTIONS.map((opt) => {
                const active = contentPreset === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      onContentPresetChange(active ? null : opt.value)
                    }
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      active
                        ? 'bg-gemini-500 text-white'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <textarea
              value={contentComment}
              onChange={(e) =>
                onContentCommentChange(e.target.value.slice(0, MAX_CUSTOM))
              }
              placeholder="补充说明（可选）"
              rows={3}
              className="w-full resize-y rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        )}

        {kind === 'custom' && (
          <textarea
            value={customComment}
            onChange={(e) =>
              onCustomCommentChange(e.target.value.slice(0, MAX_CUSTOM))
            }
            placeholder="例如：统一加大一级标题字号；将全文翻译成英文；合并重复段落…"
            rows={6}
            className="w-full resize-y rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            maxLength={MAX_CUSTOM}
          />
        )}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        影响范围：全部 {slides.length} 页
      </p>
    </div>
  )
}
