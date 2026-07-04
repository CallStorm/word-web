import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Job } from '../../api/types'
import { buildJobCardTipLines } from '../../lib/format'

const SHOW_DELAY_MS = 200

export function JobCardTitleTip({
  job,
  displayErr,
}: {
  job: Job
  displayErr?: string | null
}) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const title = job.project_name || '(未命名)'
  const tipLines = buildJobCardTipLines(job, { displayErr })

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const show = () => {
    clearTimer()
    timerRef.current = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS)
  }

  const hide = () => {
    clearTimer()
    setVisible(false)
  }

  useEffect(() => () => clearTimer(), [])

  return (
    <div
      ref={wrapRef}
      className="relative min-w-0 flex-1"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <Link
        to={`/jobs/${job.id}`}
        className="block truncate text-sm text-office-text hover:text-gemini-700 dark:hover:text-gemini-300"
        title={title}
      >
        {title}
      </Link>

      {visible && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-40 mb-1.5 min-w-[220px] max-w-[min(280px,calc(100vw-2rem))] rounded-sm border border-office-border bg-office-surface px-3 py-2 text-left shadow-lg dark:border-[#3b3a39] dark:bg-[#292827]"
        >
          <dl className="space-y-1.5 text-xs">
            {tipLines.map((line) => (
              <div key={line.label}>
                <dt className="text-[10px] font-medium uppercase tracking-wide text-office-muted dark:text-[#a19f9d]">
                  {line.label}
                </dt>
                <dd
                  className={`mt-0.5 ${
                    line.tone === 'error'
                      ? 'text-rose-600 dark:text-rose-400'
                      : line.tone === 'muted'
                        ? 'text-office-muted dark:text-[#a19f9d]'
                        : line.label === 'Prompt'
                          ? 'max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200'
                          : 'text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {line.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
