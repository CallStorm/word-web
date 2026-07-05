import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { notifyError, notifySuccess } from '../stores/toastStore'
import { invalidateJobLists } from '../hooks/useJobs'
import { FileUploadZone } from '../components/jobs/FileUploadZone'
import { AiAutoFillButton } from '../components/jobs/AiAutoFillButton'
import { AiOptimizeButton } from '../components/jobs/AiOptimizeButton'
import {
  applySuggestedOptions,
  outlineToText,
  type AiAutoFillResult,
} from '../lib/aiAutoFill'
import {
  AUDIENCE_OPTIONS,
  DEFAULT_JOB_OPTIONS,
  LANGUAGE_OPTIONS,
  SCENARIO_OPTIONS,
  TONE_OPTIONS,
  formatJobOptionsSummary,
  parseOutlineLines,
  type JobOptions,
} from '../lib/jobOptions'
import { pickHint } from '../lib/aiHints'

const SELECT_CLASS =
  'w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800'

const PANEL_CLASS =
  'rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40'

const SECTION_HEADER =
  'flex w-full items-center justify-between text-left text-sm font-medium text-slate-700 dark:text-slate-200'

function OptionSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  className = '',
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-xs text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={SELECT_CLASS}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function NewJobPage() {
  const quota = useAuthStore((s) => s.quota)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [projectName, setProjectName] = useState('')
  const [options, setOptions] = useState<JobOptions>(DEFAULT_JOB_OPTIONS)
  const [coreTopic, setCoreTopic] = useState('')
  const [outlineText, setOutlineText] = useState('')
  const [keyPoints, setKeyPoints] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [planConfirmed, setPlanConfirmed] = useState(false)
  const [openOptions, setOpenOptions] = useState(true)

  const prerequisitesOk = useMemo(() => {
    if (quota() <= 0) return false
    return !!coreTopic.trim()
  }, [quota, coreTopic])

  const canStart = useMemo(
    () => prerequisitesOk && planConfirmed && !submitting,
    [prerequisitesOk, planConfirmed, submitting],
  )

  const set = <K extends keyof JobOptions>(key: K, v: JobOptions[K]) => {
    setOptions((o) => ({ ...o, [key]: v }))
    setPlanConfirmed(false)
  }

  const applyAutoFill = (data: AiAutoFillResult) => {
    if (data.core_topic?.trim()) setCoreTopic(data.core_topic.trim())
    if (data.outline?.length) setOutlineText(outlineToText(data.outline))
    if (data.key_points?.length) setKeyPoints(data.key_points)
    setOptions((o) => applySuggestedOptions(o, data.suggested_options))
    setOpenOptions(true)
    setPlanConfirmed(false)
  }

  const submit = async () => {
    if (!canStart) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('prompt', coreTopic.trim())
      if (projectName.trim()) fd.append('project_name', projectName.trim())
      fd.append('generation_mode', 'freeform')
      fd.append('language', options.language)
      fd.append('scenario', options.scenario)
      fd.append('audience', options.audience)
      fd.append('tone', options.tone)
      fd.append('core_topic', coreTopic.trim())
      if (outlineText.trim()) fd.append('outline', outlineText)
      if (keyPoints.length > 0) fd.append('key_points', keyPoints.join('\n'))
      for (const f of files) fd.append('files', f, f.name)
      const job = await api<{ id: string }>('POST', '/api/jobs', fd)
      notifySuccess('已开始生成，请稍候…')
      invalidateJobLists(qc)
      navigate(`/jobs/${job.id}`)
    } catch (e) {
      notifyError('创建失败: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmitting(false)
    }
  }

  const hint = pickHint(coreTopic)
  const outlineLines = parseOutlineLines(outlineText)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 dark:bg-gradient-to-b dark:from-slate-950 dark:to-slate-900">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">创建 Word 文档</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            输入核心主题后，可用 AI 自动生成大纲与文档选项；确认后开始生成。
          </p>
        </div>
        <Link to="/" className="text-sm text-slate-500 hover:text-gemini-600">
          取消
        </Link>
      </div>

      <div className="space-y-4">
        <section className={PANEL_CLASS}>
          <h2 className={SECTION_HEADER}>
            <span>① 内容与素材</span>
          </h2>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-xs text-slate-500">项目名称（可选）</span>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                placeholder="例：2026 年度工作报告"
              />
            </label>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  核心主题 <span className="text-rose-500">*</span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <AiAutoFillButton
                    coreTopic={coreTopic}
                    files={files}
                    language={options.language}
                    scenario={options.scenario}
                    audience={options.audience}
                    tone={options.tone}
                    disabled={!coreTopic.trim() && files.length === 0}
                    onResult={(data) => applyAutoFill(data)}
                  />
                  <AiOptimizeButton
                    endpoint="generate-outline"
                    label="仅生成大纲"
                    disabled={!coreTopic.trim()}
                    body={{
                      core_topic: coreTopic.trim(),
                      scenario: options.scenario,
                      audience: options.audience,
                      language: options.language,
                    }}
                    onResult={(data) => {
                      const outline = data.outline
                      if (Array.isArray(outline) && outline.length > 0) {
                        setOutlineText(outline.map(String).join('\n'))
                        setPlanConfirmed(false)
                      }
                    }}
                  />
                </div>
              </div>
              <textarea
                value={coreTopic}
                onChange={(e) => {
                  setCoreTopic(e.target.value)
                  setPlanConfirmed(false)
                }}
                rows={4}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                placeholder="描述文档主题与要点。例：撰写 2026 年上半年部门工作报告，突出项目进展与下阶段计划。"
              />
            </div>

            {hint && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
            )}

            {keyPoints.length > 0 && (
              <div className="rounded-md border border-gemini-100 bg-gemini-50/60 px-3 py-2 dark:border-gemini-900 dark:bg-gemini-950/30">
                <p className="text-[11px] font-medium text-gemini-700 dark:text-gemini-300">
                  AI 建议要点
                </p>
                <ul className="mt-1 list-inside list-disc text-xs text-slate-600 dark:text-slate-300">
                  {keyPoints.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            <FileUploadZone files={files} onChange={setFiles} />

            <div>
              <span className="text-xs text-slate-500">章节大纲（每行一节标题，可选）</span>
              <textarea
                value={outlineText}
                onChange={(e) => {
                  setOutlineText(e.target.value)
                  setPlanConfirmed(false)
                }}
                rows={5}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
                placeholder={'一、工作概述\n二、主要成果\n三、存在问题\n四、下阶段计划'}
              />
            </div>
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <button
            type="button"
            onClick={() => setOpenOptions((v) => !v)}
            className={SECTION_HEADER}
          >
            <span>② 文档选项</span>
            <span className="text-slate-400">{openOptions ? '▾' : '▸'}</span>
          </button>
          {openOptions && (
            <div className="mt-3 space-y-4">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <OptionSelect
                  label="语言"
                  options={LANGUAGE_OPTIONS}
                  value={options.language}
                  onChange={(v) => set('language', v)}
                  className="flex-1 min-w-[6rem]"
                />
                <OptionSelect
                  label="场景"
                  options={SCENARIO_OPTIONS}
                  value={options.scenario}
                  onChange={(v) => set('scenario', v)}
                  className="flex-1 min-w-[7rem]"
                />
                <OptionSelect
                  label="受众"
                  options={AUDIENCE_OPTIONS}
                  value={options.audience}
                  onChange={(v) => set('audience', v)}
                  className="flex-1 min-w-[7rem]"
                />
                <OptionSelect
                  label="语调"
                  options={TONE_OPTIONS}
                  value={options.tone}
                  onChange={(v) => set('tone', v)}
                  className="flex-1 min-w-[6rem]"
                />
              </div>
            </div>
          )}
        </section>

        {quota() <= 0 && (
          <p className="text-sm text-rose-600">Credits 不足，无法创建任务</p>
        )}

        <section className="rounded-xl border-2 border-gemini-200 bg-gemini-50/40 p-4 shadow-sm dark:border-gemini-800 dark:bg-gemini-950/30">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">③ 确认并提交</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {formatJobOptionsSummary(options)}
            {outlineLines.length > 0 && ` · 大纲 ${outlineLines.length} 节`}
          </p>

          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={planConfirmed}
              onChange={(e) => setPlanConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-gemini-600 focus:ring-gemini-500"
            />
            <span>我已确认内容与文档选项无误，开始后将自动生成。</span>
          </label>

          <button
            type="button"
            disabled={!canStart}
            onClick={submit}
            className="mt-4 w-full rounded-md bg-gemini-600 py-2.5 text-sm font-medium text-white hover:bg-gemini-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '正在创建…' : '开始生成'}
          </button>
        </section>
      </div>
    </div>
  )
}
