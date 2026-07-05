import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, downloadUrl } from '../api/client'
import type { RevisionsListResponse, SseEvent } from '../api/types'
import { useJob, useDeleteJob, useRetryJob } from '../hooks/useJobs'
import { useJobEvents } from '../hooks/useJobEvents'
import { StatusPill } from '../components/jobs/StatusPill'
import { fmtCost, fmtDateTime, truncate } from '../lib/format'
import {
  AUDIENCE_OPTIONS,
  CITATION_STYLE_OPTIONS,
  GENERATION_MODE_OPTIONS,
  LANGUAGE_OPTIONS,
  PAGE_SIZE_OPTIONS,
  SCENARIO_OPTIONS,
  TONE_OPTIONS,
  type JobOptions,
} from '../lib/jobOptions'
import { confirmDialog } from '../stores/modalStore'
import { notifyError, notifySuccess } from '../stores/toastStore'

const STAGES = [
  '1 解析素材',
  '2 规划大纲',
  '3 分析模板',
  '4 模板合并',
  '5 文档构建',
  '6 质量检查',
  '7 导出完成',
]

type Tab = 'overview' | 'raw' | 'timeline' | 'files'

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: job, isLoading, error, refetch } = useJob(id)
  const deleteJob = useDeleteJob()
  const retryJob = useRetryJob()
  const [tab, setTab] = useState<Tab>('overview')
  const [timeline, setTimeline] = useState<SseEvent[]>([])
  const [stage, setStage] = useState<Record<string, unknown> | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [submittingResume, setSubmittingResume] = useState(false)

  const onEvent = useCallback(
    (ev: SseEvent) => {
      if (ev.type === 'status') {
        refetch()
        if (ev.payload.status === 'paused') {
          setConfirmText(String(ev.payload.pending_confirm || ''))
        }
      } else if (ev.type === 'stage') {
        setStage(ev.payload)
      } else if (['tool', 'agent_text', 'result', 'error', 'spec', 'section', 'outline'].includes(ev.type)) {
        setTimeline((prev) => {
          const next = [...prev, ev]
          return next.length > 500 ? next.slice(-500) : next
        })
      } else if (ev.type === 'docx') {
        refetch()
      }
    },
    [refetch],
  )

  const { sseStatus } = useJobEvents(id, onEvent)

  const hasDocx = !!job?.docx_path
  const isPaused = job?.status === 'paused'
  const isPausedStuck = isPaused && !job?.session_id
  const isActive = job && ['running', 'queued', 'paused'].includes(job.status)

  const revisionsQ = useQuery({
    queryKey: ['job', id, 'revisions'],
    queryFn: () =>
      api<RevisionsListResponse>('GET', `/api/jobs/${id}/revisions`),
    enabled: !!id,
    refetchInterval: 10_000,
  })
  const revisions = revisionsQ.data?.items ?? []
  const latestDone = revisions.find((r) => r.is_latest && r.status === 'done')

  const currentStageIdx = useMemo(() => {
    if (!stage) return -1
    const name = String(stage.stage || stage.name || '')
    return STAGES.findIndex((s) => s === name || s.startsWith(name))
  }, [stage])

  const rawOutputText = useMemo(() => {
    const lines: string[] = []
    let lastAgentText = ''
    for (const ev of timeline) {
      const seq = ev.seq ?? '?'
      if (ev.type === 'agent_text') {
        const text = String(ev.payload?.text || '')
        if (!text || text === lastAgentText) continue
        lastAgentText = text
        lines.push(`--- [#${seq}] assistant ---`, text, '')
      } else if (ev.type === 'tool') {
        const p = ev.payload || {}
        lines.push(`--- [#${seq}] tool:${p.tool || '?'} (${p.stage || ''}) ---`)
        if (p.command) lines.push(`command: ${String(p.command)}`)
        if (p.file_path) lines.push(`file: ${String(p.file_path)}`)
        lines.push('')
      } else if (ev.type === 'stage') {
        lines.push(`--- [#${seq}] stage: ${ev.payload?.stage || ''} ---`, '')
      } else if (ev.type === 'section') {
        lines.push(`--- [#${seq}] section ---`, String(ev.payload?.title || ev.payload?.name || ''), '')
      } else if (ev.type === 'outline') {
        lines.push(`--- [#${seq}] outline ---`)
        const items = ev.payload?.items ?? ev.payload?.outline
        if (Array.isArray(items)) {
          for (const item of items) lines.push(`  - ${String(item)}`)
        }
        lines.push('')
      } else if (ev.type === 'error') {
        lines.push(`--- [#${seq}] stderr ---`, String(ev.payload?.message || ''), '')
      } else if (ev.type === 'result') {
        const p = ev.payload || {}
        lines.push(
          `--- [#${seq}] result ---`,
          `cost: ${p.cost_usd ?? '—'}`,
          `stop: ${p.stop_reason ?? '—'}`,
          '',
        )
      } else if (ev.type === 'spec') {
        lines.push(`--- [#${seq}] spec ---`)
        if (ev.payload?.design_spec) lines.push('design_spec.md:', String(ev.payload.design_spec), '')
        if (ev.payload?.spec_lock) lines.push('spec_lock.md:', String(ev.payload.spec_lock), '')
        if (!ev.payload?.design_spec && !ev.payload?.spec_lock) lines.push('')
      }
    }
    if (lines.length) return lines.join('\n')
    if (job?.last_agent_text) return job.last_agent_text
    return ''
  }, [timeline, job?.last_agent_text])

  const doCancel = async () => {
    if (!id) return
    const ok = await confirmDialog({
      title: '取消任务',
      body: '确认取消这个任务？取消后无法恢复。',
      confirmText: '确认取消',
      cancelText: '不取消',
    })
    if (!ok) return
    try {
      await api('POST', `/api/jobs/${id}/cancel`)
      notifySuccess('已取消')
      await refetch()
    } catch (e) {
      notifyError('取消失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const doResume = async () => {
    if (!id || !confirmText.trim()) {
      notifyError('请输入确认内容')
      return
    }
    setSubmittingResume(true)
    try {
      await api('POST', `/api/jobs/${id}/resume`, { confirm: confirmText })
      notifySuccess('已提交确认，任务继续')
      setConfirmText('')
      await refetch()
    } catch (e) {
      notifyError('提交失败: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmittingResume(false)
    }
  }

  const doDownload = () => {
    if (!id) return
    if (!latestDone && !hasDocx) return
    const targetId = latestDone ? latestDone.job_id : id
    const filename = latestDone
      ? `${job?.project_name || id}-${targetId.slice(0, 6)}.docx`
      : `${job?.project_name || id}.docx`
    downloadUrl(`/api/jobs/${targetId}/docx`, filename)
  }

  const copyRaw = async () => {
    try {
      await navigator.clipboard.writeText(rawOutputText)
      notifySuccess('已复制到剪贴板')
    } catch {
      notifyError('复制失败')
    }
  }

  if (isLoading) {
    return <div className="py-20 text-center text-slate-400">加载中…</div>
  }

  if (error || !job) {
    return (
      <div className="py-20 text-center">
        <p className="text-rose-600">{error instanceof Error ? error.message : '加载失败'}</p>
        <Link to="/" className="mt-4 inline-block text-sm text-gemini-600 hover:underline">
          返回首页
        </Link>
      </div>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: '概览' },
    { key: 'raw', label: '原始输出' },
    { key: 'timeline', label: '时间线' },
    { key: 'files', label: '产物' },
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-4">
        <Link to="/" className="text-sm text-slate-500 hover:text-gemini-600">
          ← 返回任务列表
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{job.project_name || '(未命名)'}</h1>
            <span
              className={`sse-dot ${sseStatus === 'connected' ? 'connected' : sseStatus === 'error' ? 'error' : ''}`}
              title={sseStatus}
            />
            <StatusPill status={job.status} />
          </div>
          <p className="mt-2 text-sm text-slate-500">{truncate(job.prompt, 200)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isActive && job.status !== 'paused' && (
            <button
              type="button"
              onClick={doCancel}
              className="rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-800"
            >
              取消
            </button>
          )}
          {job.status === 'done' && hasDocx && (
            <Link
              to={`/jobs/${job.id}/edit`}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              预览与修改
            </Link>
          )}
          {hasDocx && (
            <button
              type="button"
              onClick={doDownload}
              className="rounded-md bg-gemini-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gemini-700"
            >
              {latestDone ? '下载最新 DOCX' : '下载 DOCX'}
            </button>
          )}
        </div>
      </div>

      {job.status === 'running' && currentStageIdx >= 0 && (
        <div className="mb-6">
          <div className="mb-2 flex gap-1">
            {STAGES.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full ${
                  i <= currentStageIdx ? 'bg-gemini-500' : 'bg-slate-200 dark:bg-slate-700'
                }`}
                title={s}
              />
            ))}
          </div>
          <p className="text-xs text-slate-500">{STAGES[currentStageIdx]}</p>
        </div>
      )}

      {isPausedStuck && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-900/20">
          <h3 className="text-sm font-medium text-rose-800 dark:text-rose-200">
            任务已中断，无法继续确认
          </h3>
          <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">
            生成会话已丢失（常见于服务异常或数据库繁忙）。不能提交确认，请删除后重新创建，或尝试重试。
          </p>
          {job.error_message && (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{job.error_message}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={retryJob.isPending}
              onClick={async () => {
                if (!id) return
                try {
                  await retryJob.mutateAsync(id)
                  notifySuccess('已重新排队')
                  await refetch()
                } catch (e) {
                  notifyError(e instanceof Error ? e.message : '重试失败')
                }
              }}
              className="rounded-md bg-gemini-600 px-4 py-1.5 text-sm text-white hover:bg-gemini-700 disabled:opacity-50"
            >
              {retryJob.isPending ? '提交中…' : '重试生成'}
            </button>
            <button
              type="button"
              onClick={doCancel}
              className="rounded-md border border-rose-300 px-4 py-1.5 text-sm text-rose-700 hover:bg-rose-100 dark:border-rose-700 dark:text-rose-300"
            >
              标记取消
            </button>
            <button
              type="button"
              disabled={deleteJob.isPending}
              onClick={async () => {
                if (!id) return
                const ok = await confirmDialog({
                  title: '删除作品',
                  body: '确认删除此中断的任务？',
                  confirmText: '删除',
                  cancelText: '取消',
                })
                if (!ok) return
                try {
                  await deleteJob.mutateAsync(id)
                  notifySuccess('已删除')
                  navigate('/')
                } catch (e) {
                  notifyError(e instanceof Error ? e.message : '删除失败')
                }
              }}
              className="rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
            >
              删除
            </button>
          </div>
        </div>
      )}

      {isPaused && !isPausedStuck && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">需要确认</h3>
          <textarea
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-md border border-amber-200 px-3 py-2 text-sm dark:border-amber-700 dark:bg-slate-900"
            placeholder="输入确认内容…"
          />
          <button
            type="button"
            disabled={submittingResume}
            onClick={doResume}
            className="mt-2 rounded-md bg-amber-600 px-4 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {submittingResume ? '提交中…' : '提交确认'}
          </button>
        </div>
      )}

      {job.status === 'running' || job.status === 'queued' ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          正在自动生成 Word 文档，请稍候。生成过程中无法修改大纲或选项。
        </div>
      ) : null}

      <div className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm ${
              tab === t.key
                ? 'border-b-2 border-gemini-600 font-medium text-gemini-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">状态</dt>
              <dd>{job.status}</dd>
            </div>
            <div>
              <dt className="text-slate-500">费用</dt>
              <dd>{fmtCost(job.cost_usd)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">创建时间</dt>
              <dd>{fmtDateTime(job.created_at)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">更新时间</dt>
              <dd>{fmtDateTime(job.updated_at)}</dd>
            </div>
          </dl>

          <JobOptionsPanel job={job} />

          {job.error_message && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
              {job.error_message}
            </div>
          )}
          {job.last_agent_text && (
            <div>
              <h3 className="mb-2 font-medium">最新 Agent 输出</h3>
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-100 p-4 text-xs dark:bg-slate-800">
                {job.last_agent_text}
              </pre>
            </div>
          )}
        </div>
      )}

      {tab === 'overview' && (
        <section className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            版本历史
          </h3>
          {revisionsQ.isLoading ? (
            <p className="text-xs text-slate-400">加载中…</p>
          ) : revisions.length === 0 ? (
            <p className="text-xs text-slate-400">暂无</p>
          ) : (
            <ol className="space-y-2">
              {revisions.map((r) => (
                <li
                  key={r.job_id}
                  className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm ${
                    r.is_latest
                      ? 'border-gemini-300 bg-gemini-50/50 dark:border-gemini-700 dark:bg-gemini-900/20'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/jobs/${r.job_id}`}
                        className="truncate font-mono text-xs text-slate-600 hover:underline dark:text-slate-300"
                      >
                        {r.job_id.slice(0, 8)}…
                      </Link>
                      {r.is_self && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          原版
                        </span>
                      )}
                      {r.is_latest && (
                        <span className="rounded bg-gemini-200 px-1.5 py-0.5 text-[10px] text-gemini-800 dark:bg-gemini-800 dark:text-gemini-200">
                          最新
                        </span>
                      )}
                      <span className="text-xs text-slate-500">{r.status}</span>
                    </div>
                    {r.revision_mode === 'global' && r.global_summary && (
                      <p className="mt-1 text-xs text-gemini-700 dark:text-gemini-300">
                        全局 · {r.global_summary}
                      </p>
                    )}
                    {r.comments.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-xs text-slate-500 dark:text-slate-400">
                        {r.comments.slice(0, 3).map((c, i) => (
                          <li key={i} className="truncate">
                            <span className="font-mono">#{c.slide_index}</span> {c.comment}
                          </li>
                        ))}
                        {r.comments.length > 3 && (
                          <li className="text-slate-400">… 还有 {r.comments.length - 3} 条</li>
                        )}
                      </ul>
                    )}
                    {r.created_at && (
                      <p className="mt-1 text-[10px] text-slate-400">
                        {fmtDateTime(r.created_at)}
                      </p>
                    )}
                  </div>
                  {r.status === 'done' && r.docx_url && (
                    <button
                      type="button"
                      onClick={() => downloadUrl(r.docx_url!, `${r.job_id.slice(0, 8)}.docx`)}
                      className="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      下载
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {tab === 'raw' && (
        <div>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={copyRaw}
              disabled={!rawOutputText}
              className="text-xs text-gemini-600 hover:underline disabled:opacity-50"
            >
              复制
            </button>
          </div>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-4 font-mono text-xs dark:bg-slate-800">
            {rawOutputText || '(暂无输出)'}
          </pre>
        </div>
      )}

      {tab === 'timeline' && (
        <div className="max-h-[60vh] space-y-2 overflow-auto">
          {timeline.length === 0 ? (
            <p className="text-sm text-slate-400">等待事件…</p>
          ) : (
            timeline.map((ev, i) => (
              <div
                key={i}
                className="rounded border border-slate-200 p-2 text-xs dark:border-slate-700"
              >
                <span className="font-mono text-slate-400">#{ev.seq}</span>{' '}
                <span className="font-medium">{ev.type}</span>
                <pre className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-400">
                  {JSON.stringify(ev.payload, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'files' && (
        <div className="text-sm">
          {hasDocx ? (
            <button
              type="button"
              onClick={doDownload}
              className="text-gemini-600 hover:underline"
            >
              下载 {job.project_name || job.id}.docx
            </button>
          ) : (
            <p className="text-slate-400">产物尚未就绪</p>
          )}
        </div>
      )}
    </div>
  )
}

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function optionLabelFrom(list: { value: string; label: string }[], value: string | null | undefined): string {
  if (value == null) return '—'
  return list.find((x) => x.value === value)?.label ?? value
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-xs">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all text-slate-700 dark:text-slate-300">{value || '—'}</dd>
    </div>
  )
}

function FieldList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="space-y-1.5">
      {items.map((it) => (
        <FieldRow key={it.label} label={it.label} value={it.value} />
      ))}
    </dl>
  )
}

function FieldGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </h4>
      {children}
    </section>
  )
}

function JobOptionsPanel({ job }: { job: { project_name: string | null; prompt: string; options: JobOptions | null; uploads: { name: string; size: number | null }[] } }) {
  const o = job.options
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h3 className="mb-3 text-sm font-medium">创建参数</h3>

      <div className="mb-4 space-y-3">
        <FieldGroup title="项目">
          <FieldList
            items={[
              { label: '项目名称', value: job.project_name || '（未命名）' },
              { label: '核心主题', value: <span className="whitespace-pre-wrap">{job.prompt}</span> },
            ]}
          />
        </FieldGroup>

        {job.uploads && job.uploads.length > 0 && (
          <FieldGroup title="上传素材">
            <ul className="space-y-1 text-xs">
              {job.uploads.map((u) => (
                <li key={u.name} className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <span className="break-all">{u.name}</span>
                  <span className="ml-auto text-slate-400">{fmtBytes(u.size)}</span>
                </li>
              ))}
            </ul>
          </FieldGroup>
        )}
      </div>

      {o && (
        <div className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-700">
          <FieldGroup title="生成设置">
            <FieldList
              items={[
                { label: '生成模式', value: optionLabelFrom(GENERATION_MODE_OPTIONS, o.generation_mode) },
                { label: '语言', value: optionLabelFrom(LANGUAGE_OPTIONS, o.language) },
                { label: '场景', value: optionLabelFrom(SCENARIO_OPTIONS, o.scenario) },
                { label: '受众', value: optionLabelFrom(AUDIENCE_OPTIONS, o.audience) },
                { label: '语调', value: optionLabelFrom(TONE_OPTIONS, o.tone) },
              ]}
            />
          </FieldGroup>

          <FieldGroup title="文档结构">
            <FieldList
              items={[
                { label: '目标章节数', value: `${o.section_count} 节` },
                { label: '页面尺寸', value: optionLabelFrom(PAGE_SIZE_OPTIONS, o.page_size) },
                { label: '生成目录', value: o.include_toc ? '是' : '否' },
                { label: '封面页', value: o.include_cover ? '是' : '否' },
                {
                  label: '引用格式',
                  value: o.citation_style
                    ? optionLabelFrom(CITATION_STYLE_OPTIONS, o.citation_style)
                    : '无',
                },
              ]}
            />
          </FieldGroup>

          {(o.outline?.length || o.core_topic) && (
            <FieldGroup title="内容结构">
              <div className="space-y-3">
                {o.core_topic && o.core_topic !== job.prompt && (
                  <FieldRow label="扩展描述" value={<span className="whitespace-pre-wrap">{o.core_topic}</span>} />
                )}
                {o.outline && o.outline.length > 0 && (
                  <FieldRow
                    label="章节大纲"
                    value={
                      <ol className="list-decimal space-y-0.5 pl-4">
                        {o.outline.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ol>
                    }
                  />
                )}
              </div>
            </FieldGroup>
          )}
        </div>
      )}
    </div>
  )
}
