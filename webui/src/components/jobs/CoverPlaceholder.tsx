import { normalizeJobStatus, statusLabel } from '../../lib/format'
import type { JobStatus } from '../../api/types'

const ACTIVE: JobStatus[] = ['queued', 'running', 'paused']

/**
 * Non-blank cover for jobs without a rendered preview.
 * - queued/running/paused → generating state (spinner)
 * - failed/cancelled → muted failure mark
 * - done without PNG → static Word placeholder (no misleading spinner)
 */
export function CoverPlaceholder({
  status,
  id: _id,
  hasDocx = false,
}: {
  status: JobStatus | string
  id: string
  hasDocx?: boolean
}) {
  const normalized = normalizeJobStatus(status)
  const isActive = ACTIVE.includes(normalized as JobStatus)
  const isFailed = normalized === 'failed' || normalized === 'cancelled'
  const isDone = normalized === 'done'

  const gradient = isFailed
    ? 'linear-gradient(135deg, rgb(254 242 242 / 0.9), rgb(248 250 252 / 0.95))'
    : 'linear-gradient(160deg, #eff6fc 0%, #deebf7 55%, #f3f2f1 100%)'

  const showSpinner = isActive
  const showDocIcon = isDone && hasDocx && !isFailed

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 ${
        isFailed ? 'dark:bg-gradient-to-br dark:from-rose-950/50 dark:to-slate-900/80' : ''
      }`}
      style={{ background: gradient }}
    >
      {showSpinner ? (
        <span className="h-6 w-6 rounded-full border-2 border-slate-400/60 border-t-transparent animate-spin" />
      ) : showDocIcon ? (
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-slate-400/80"
          aria-hidden
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      ) : isFailed ? (
        <span className="text-xl text-rose-400/80">⚠</span>
      ) : (
        <span className="h-6 w-6 rounded-full border-2 border-slate-400/60 border-t-transparent animate-spin" />
      )}
      <span
        className={`text-center text-[10px] leading-tight ${
          isFailed
            ? 'text-rose-500/90 dark:text-rose-400/80'
            : isActive
              ? 'text-slate-500 dark:text-slate-400'
              : showDocIcon
                ? 'text-slate-400/80'
                : 'text-slate-400/80'
        }`}
      >
        {isActive
          ? statusLabel(normalized)
          : isFailed
            ? '生成失败'
            : showDocIcon
              ? '暂无封面预览'
              : '封面加载中'}
      </span>
    </div>
  )
}
