import { Link } from 'react-router-dom'
import type { Job } from '../../api/types'
import { downloadUrl } from '../../api/client'
import { StatusPill } from './StatusPill'
import { QueueBadge } from './QueueBadge'
import { CoverPlaceholder } from './CoverPlaceholder'
import { AuthenticatedSlideImage } from './AuthenticatedSlideImage'
import { JobCardTitleTip } from './JobCardTitleTip'
import { confirmDialog } from '../../stores/modalStore'
import { useDeleteJob, useRetryJob } from '../../hooks/useJobs'
import { notifyError, notifySuccess } from '../../stores/toastStore'
import { DOCUMENT_COVER_CLASS, DOCUMENT_PREVIEW_IMG_CLASS, JOB_CARD_CLASS, JOB_CARD_FOOTER_CLASS } from '../../lib/documentAspect'

export function JobCard({
  job,
  sharedErrorCount = 0,
}: {
  job: Job
  sharedErrorCount?: number
}) {
  const hasDocx = !!job.docx_path
  const isDone = job.status === 'done'
  const showDownload = isDone && hasDocx
  const canRetry =
    job.status === 'failed' ||
    job.status === 'cancelled' ||
    (job.status === 'paused' && !job.session_id)
  const deleteJob = useDeleteJob()
  const retryJob = useRetryJob()

  const previewOk = !!job.has_preview && isDone

  const stopBubble = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!hasDocx) return
    downloadUrl(`/api/jobs/${job.id}/docx`, `${job.project_name || job.id}.docx`)
  }

  const handleRetry = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await retryJob.mutateAsync(job.id)
    } catch (err) {
      notifyError(err instanceof Error ? err.message : '重试失败')
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const ok = await confirmDialog({
      title: '删除作品',
      body: `确认删除「${job.project_name || '(未命名)'}」？此操作不可恢复。`,
      confirmText: '删除',
      cancelText: '取消',
    })
    if (!ok) return
    try {
      await deleteJob.mutateAsync(job.id)
      notifySuccess('作品已删除')
    } catch (err) {
      notifyError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const errText =
    job.status === 'cancelled'
      ? '用户取消'
      : job.error_message?.trim()
  const showErr = (job.status === 'failed' || job.status === 'cancelled') && !!errText

  const displayErr =
    showErr && sharedErrorCount >= 2 && job.status === 'failed'
      ? `相同错误（共 ${sharedErrorCount} 个作品）`
      : errText

  return (
    <article
      className={`${JOB_CARD_CLASS}
                  ${job.status === 'running' ? 'ring-1 ring-inset ring-gemini-200 dark:ring-gemini-800' : ''}`}
    >
      <Link to={`/jobs/${job.id}`} className="block">
        <div className={DOCUMENT_COVER_CLASS}>
          {previewOk ? (
            <AuthenticatedSlideImage
              url={`/api/jobs/${job.id}/preview`}
              alt={job.project_name || '封面预览'}
              className={DOCUMENT_PREVIEW_IMG_CLASS}
              loading="lazy"
            />
          ) : (
            <CoverPlaceholder status={job.status} id={job.id} hasDocx={hasDocx} />
          )}

          <div className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-white/85 px-1.5 py-1 opacity-0 shadow-sm backdrop-blur transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 dark:bg-slate-900/85">
              {isDone && hasDocx && (
                <Link
                  to={`/jobs/${job.id}/edit`}
                  onClick={stopBubble}
                  className="rounded-full p-1 text-gemini-600 hover:bg-gemini-100 dark:hover:bg-gemini-900/30"
                  title="预览与修改"
                  aria-label="预览与修改"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </Link>
              )}
              {isDone && showDownload && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="rounded-full p-1 text-gemini-600 hover:bg-gemini-100 dark:hover:bg-gemini-900/30"
                  title="下载 DOCX"
                  aria-label="下载 DOCX"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteJob.isPending}
                className="rounded-full p-1 text-rose-600 hover:bg-rose-100 disabled:opacity-50 dark:hover:bg-rose-900/30"
                title="删除"
                aria-label="删除"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
              {canRetry && (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retryJob.isPending}
                  className="rounded-full p-1 text-gemini-600 hover:bg-gemini-100 disabled:opacity-50 dark:hover:bg-gemini-900/30"
                  title="重试"
                  aria-label="重试"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
              )}
            </div>

          {canRetry && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retryJob.isPending}
              className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-gemini-700 shadow-sm backdrop-blur hover:bg-white disabled:opacity-50 dark:bg-slate-900/90 dark:text-gemini-300"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              重试
            </button>
          )}
        </div>
      </Link>

      <div className={JOB_CARD_FOOTER_CLASS}>
        <JobCardTitleTip job={job} displayErr={displayErr} />
        <StatusPill status={job.status} />
        <QueueBadge position={job.queue_position} />
      </div>
    </article>
  )
}
