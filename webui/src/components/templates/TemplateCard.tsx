import { Link } from 'react-router-dom'
import type { Template } from '../../api/types'
import { AuthenticatedSlideImage } from '../jobs/AuthenticatedSlideImage'
import {
  DOCUMENT_COVER_CLASS,
  DOCUMENT_PREVIEW_IMG_CLASS,
  JOB_CARD_CLASS,
  JOB_CARD_FOOTER_CLASS,
} from '../../lib/documentAspect'

export function TemplateCard({
  template,
  onDelete,
  onFork,
}: {
  template: Template
  onDelete?: (t: Template) => void
  onFork?: (t: Template) => void
}) {
  const slotCount = template.slots?.length || template.placeholder_count || 0
  const coverUrl = `/api/templates/${template.id}/cover`

  const stopBubble = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  return (
    <article className={JOB_CARD_CLASS}>
      <Link to={`/templates/fill?templateId=${template.id}`} className="block">
        <div className={DOCUMENT_COVER_CLASS}>
          <AuthenticatedSlideImage
            url={coverUrl}
            alt={template.name}
            className={DOCUMENT_PREVIEW_IMG_CLASS}
            loading="lazy"
          />

          <div className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-white/85 px-1.5 py-1 opacity-0 shadow-sm backdrop-blur transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 dark:bg-slate-900/85">
            <Link
              to={`/templates/${template.id}/edit`}
              onClick={stopBubble}
              className="rounded-full p-1 text-gemini-600 hover:bg-gemini-100 dark:hover:bg-gemini-900/30"
              title="编辑"
              aria-label="编辑"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </Link>
            {onFork && (
              <button
                type="button"
                onClick={(e) => {
                  stopBubble(e)
                  onFork(template)
                }}
                className="rounded-full p-1 text-gemini-600 hover:bg-gemini-100 dark:hover:bg-gemini-900/30"
                title="复制"
                aria-label="复制"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            )}
            <Link
              to={`/templates/fill?templateId=${template.id}`}
              onClick={stopBubble}
              className="rounded-full p-1 text-gemini-600 hover:bg-gemini-100 dark:hover:bg-gemini-900/30"
              title="使用"
              aria-label="使用"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </Link>
            {!template.is_builtin && onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  stopBubble(e)
                  onDelete(template)
                }}
                className="rounded-full p-1 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30"
                title="删除"
                aria-label="删除"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </Link>

      <div className={JOB_CARD_FOOTER_CLASS}>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
          {template.name}
        </span>
        <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-500 dark:bg-slate-800">
          {template.category}
        </span>
        <span className="shrink-0 text-[9px] text-slate-400">{slotCount} 变量</span>
      </div>
    </article>
  )
}
