import { normalizeJobStatus, statusLabel } from '../../lib/format'
import type { JobStatus } from '../../api/types'

const STATUS_CLASS: Record<string, string> = {
  queued: 'status-queued',
  running: 'status-running',
  paused: 'status-paused',
  done: 'status-done',
  failed: 'status-failed',
  cancelled: 'status-cancelled',
}

export function StatusPill({ status }: { status: JobStatus | string }) {
  const normalized = normalizeJobStatus(status)
  const cls = STATUS_CLASS[normalized] || 'status-queued'
  const isRunning = normalized === 'running'
  return (
    <span className={`status-pill ${cls}${isRunning ? ' status-running-pulse' : ''}`}>
      {isRunning && <span className="status-running-dot" />}
      {statusLabel(normalized)}
    </span>
  )
}
