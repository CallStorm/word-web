import type { JobStatus } from '../api/types'

export const DEFAULT_TIMEZONE =
  import.meta.env.VITE_DISPLAY_TIMEZONE?.trim() || 'Asia/Shanghai'

let configuredTimezone = DEFAULT_TIMEZONE

export function setDisplayTimezone(tz: string) {
  if (tz.trim()) configuredTimezone = tz.trim()
}

export function getDisplayTimezone(): string {
  return configuredTimezone
}

/** Parse server ISO timestamps; naive values are treated as UTC. */
export function parseServerDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const s = String(iso).trim()
  if (!s) return null
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(s)
  const d = new Date(hasOffset ? s : `${s}Z`)
  return isNaN(d.getTime()) ? null : d
}

export function fmtTime(iso: string | null | undefined): string {
  const d = parseServerDate(iso)
  if (!d) return '—'
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} 天前`
  return d.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    timeZone: getDisplayTimezone(),
  })
}

export function fmtDateTime(iso: string | null | undefined): string {
  const d = parseServerDate(iso)
  if (!d) return '—'
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: getDisplayTimezone(),
  })
}

const TERMINAL_JOB_STATUSES = new Set(['done', 'failed', 'cancelled'])

/** Map legacy quality-related statuses to done for display. */
export function normalizeJobStatus(status: string): JobStatus | string {
  if (status === 'done_with_warnings' || status === 'quality_failed') return 'done'
  return status
}

/** Elapsed ms from job creation; terminal jobs use updated_at as end. */
export function jobElapsedMs(
  job: { status: string; created_at: string | null; updated_at?: string | null },
  now: Date = new Date(),
): number | null {
  const start = parseServerDate(job.created_at)
  if (!start) return null
  const terminal = TERMINAL_JOB_STATUSES.has(normalizeJobStatus(job.status) as string)
  const end = terminal ? parseServerDate(job.updated_at) ?? now : now
  return Math.max(0, end.getTime() - start.getTime())
}

export function fmtDuration(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec} 秒`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  if (min < 60) return remSec > 0 ? `${min} 分 ${remSec} 秒` : `${min} 分钟`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return remMin > 0 ? `${hr} 小时 ${remMin} 分` : `${hr} 小时`
}

const FAST_FAIL_MS = 5000

/** Duration segment for job card meta line (handles failed 0s → 未完成). */
export function fmtJobMetaLine(
  job: {
    status: string
    created_at: string | null
    updated_at?: string | null
  },
  now: Date = new Date(),
): string {
  const dateText = fmtDateTime(job.created_at)
  const elapsedMs = jobElapsedMs(job, now)
  const isActive = job.status === 'queued' || job.status === 'running' || job.status === 'paused'
  const isFailedOrCancelled = job.status === 'failed' || job.status === 'cancelled'

  let durationLabel: string
  if (isFailedOrCancelled && (elapsedMs == null || elapsedMs < FAST_FAIL_MS)) {
    durationLabel = '未完成'
  } else if (elapsedMs == null) {
    durationLabel = '—'
  } else {
    durationLabel = fmtDuration(elapsedMs)
  }

  const prefix = isActive ? '已用时' : isFailedOrCancelled && durationLabel === '未完成' ? '' : '耗时'

  if (prefix) {
    return `${dateText} · ${prefix} ${durationLabel}`
  }
  return `${dateText} · ${durationLabel}`
}

type JobTipInput = {
  status: string
  created_at: string | null
  updated_at?: string | null
  prompt?: string | null
  error_message?: string | null
  cost_usd?: number | null
}

/** Label + value for job card hover tooltip duration row. */
export function fmtJobDurationLabel(
  job: Pick<JobTipInput, 'status' | 'created_at' | 'updated_at'>,
  now: Date = new Date(),
): { label: string; value: string } {
  const elapsedMs = jobElapsedMs(job, now)
  const isActive = job.status === 'queued' || job.status === 'running' || job.status === 'paused'
  const isFailedOrCancelled = job.status === 'failed' || job.status === 'cancelled'

  let value: string
  if (isFailedOrCancelled && (elapsedMs == null || elapsedMs < FAST_FAIL_MS)) {
    value = '未完成'
  } else if (elapsedMs == null) {
    value = '—'
  } else {
    value = fmtDuration(elapsedMs)
  }

  if (isActive) return { label: '已用时', value }
  if (isFailedOrCancelled && value === '未完成') return { label: '耗时', value }
  return { label: '耗时', value }
}

/** Structured lines for job card title hover tooltip. */
export function buildJobCardTipLines(
  job: JobTipInput,
  opts?: { sharedErrorCount?: number; displayErr?: string | null },
  now: Date = new Date(),
): { label: string; value: string; tone?: 'error' | 'muted' }[] {
  const lines: { label: string; value: string; tone?: 'error' | 'muted' }[] = []

  lines.push({ label: '创建时间', value: fmtDateTime(job.created_at) })

  const duration = fmtJobDurationLabel(job, now)
  lines.push({ label: duration.label, value: duration.value })

  if (job.cost_usd != null) {
    lines.push({ label: '费用', value: fmtCost(job.cost_usd), tone: 'muted' })
  }

  const prompt = job.prompt?.trim()
  if (prompt) {
    lines.push({ label: 'Prompt', value: prompt })
  }

  const err = opts?.displayErr?.trim()
  if (err) {
    lines.push({ label: '失败原因', value: err, tone: 'error' })
  }

  return lines
}

export function fmtCost(usd: number | null | undefined): string {
  if (usd == null) return '—'
  return `$${Number(usd).toFixed(3)}`
}

export function truncate(s: string | null | undefined, n = 60): string {
  if (!s) return ''
  const t = String(s).replace(/\s+/g, ' ')
  return t.length > n ? t.slice(0, n) + '…' : t
}

export function colorFromId(id: string | null | undefined): string {
  if (!id) return '#94a3b8'
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  const hue = Math.abs(h) % 360
  return `hsl(${hue} 65% 55%)`
}

export function avatarLetter(name: string | null | undefined): string {
  if (!name) return '?'
  const s = String(name).trim()
  return s[s.length - 1] || '?'
}

const STATUS_LABELS: Record<string, string> = {
  queued: '排队',
  running: '运行中',
  paused: '待确认',
  done: '完成',
  failed: '失败',
  cancelled: '已取消',
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[normalizeJobStatus(status) as string] || status
}
