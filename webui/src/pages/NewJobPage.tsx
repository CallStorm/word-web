import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { notifyError, notifySuccess } from '../stores/toastStore'
import { invalidateJobLists } from '../hooks/useJobs'
import { FileUploadZone } from '../components/jobs/FileUploadZone'
import { TemplateGallery } from '../components/templates/TemplateGallery'
import {
  AUDIENCE_OPTIONS,
  CITATION_STYLE_OPTIONS,
  DEFAULT_JOB_OPTIONS,
  LANGUAGE_OPTIONS,
  PAGE_SIZE_OPTIONS,
  SCENARIO_OPTIONS,
  SECTION_COUNT_MAX,
  SECTION_COUNT_MIN,
  TONE_OPTIONS,
  formatJobOptionsSummary,
  parseOutlineLines,
  type GenerationMode,
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

const SECTION_COUNT_OPTIONS = Array.from(
  { length: SECTION_COUNT_MAX - SECTION_COUNT_MIN + 1 },
  (_, i) => SECTION_COUNT_MIN + i,
)

export function NewJobPage() {
  const quota = useAuthStore((s) => s.quota)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [projectName, setProjectName] = useState('')
  const [options, setOptions] = useState<JobOptions>(DEFAULT_JOB_OPTIONS)
  const [coreTopic, setCoreTopic] = useState('')
  const [outlineText, setOutlineText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [planConfirmed, setPlanConfirmed] = useState(false)
  const [openOptions, setOpenOptions] = useState(true)

  const prerequisitesOk = useMemo(() => {
    if (quota() <= 0) return false
    if (!coreTopic.trim()) return false
    if (options.generation_mode === 'template' && !options.template_id) return false
    return true
  }, [quota, coreTopic, options.generation_mode, options.template_id])

  const canStart = useMemo(
    () => prerequisitesOk && planConfirmed && !submitting,
    [prerequisitesOk, planConfirmed, submitting],
  )

  const set = <K extends keyof JobOptions>(key: K, v: JobOptions[K]) => {
    setOptions((o) => ({ ...o, [key]: v }))
    setPlanConfirmed(false)
  }

  const setGenerationMode = (mode: GenerationMode) => {
    setOptions((o) => ({
      ...o,
      generation_mode: mode,
      template_id: mode === 'freeform' ? null : o.template_id,
    }))
    setPlanConfirmed(false)
  }

  const submit = async () => {
    if (!canStart) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('prompt', coreTopic.trim())
      if (projectName.trim()) fd.append('project_name', projectName.trim())
      fd.append('generation_mode', options.generation_mode)
      if (options.template_id) fd.append('template_id', options.template_id)
      fd.append('language', options.language)
      fd.append('scenario', options.scenario)
      fd.append('audience', options.audience)
      fd.append('tone', options.tone)
      fd.append('section_count', String(options.section_count))
      fd.append('include_toc', options.include_toc ? 'true' : 'false')
      fd.append('include_cover', options.include_cover ? 'true' : 'false')
      fd.append('page_size', options.page_size)
      if (options.citation_style) fd.append('citation_style', options.citation_style)
      if (coreTopic.trim()) fd.append('core_topic', coreTopic.trim())
      if (outlineText.trim()) fd.append('outline', outlineText)
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
            选择自由撰写或模板填充，配置文档选项后开始生成。
          </p>
        </div>
        <Link to="/" className="text-sm text-slate-500 hover:text-gemini-600">
          取消
        </Link>
      </div>

      <div className="space-y-4">
        <section className={PANEL_CLASS}>
          <h2 className={SECTION_HEADER}>
            <span>① 生成模式</span>
          </h2>
          <div className="mt-3 space-y-3">
            <div className="inline-flex rounded-md border border-slate-200 p-0.5 dark:border-slate-700">
              {(['freeform', 'template'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setGenerationMode(m)}
                  className={`rounded px-4 py-1.5 text-sm transition ${
                    options.generation_mode === m
                      ? 'bg-gemini-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                  }`}
                >
                  {m === 'freeform' ? '自由撰写' : '模板填充'}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              {options.generation_mode === 'freeform'
                ? '由 AI 按大纲自由撰写 Word 文档。'
                : '选择内置或自定义模板，填充 {{key}} 占位符。'}
            </p>

            {options.generation_mode === 'template' && (
              <div>
                <span className="text-xs text-slate-500">选择模板</span>
                <div className="mt-2">
                  <TemplateGallery
                    value={options.template_id}
                    onChange={(id) => set('template_id', id)}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <h2 className={SECTION_HEADER}>
            <span>② 内容与素材</span>
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
              <span className="text-xs text-slate-500">
                核心主题 <span className="text-rose-500">*</span>
              </span>
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
            <span>③ 文档选项</span>
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

              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-500">目标章节数</span>
                  <select
                    value={String(options.section_count)}
                    onChange={(e) => set('section_count', parseInt(e.target.value, 10))}
                    className={SELECT_CLASS}
                  >
                    {SECTION_COUNT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} 节
                      </option>
                    ))}
                  </select>
                </label>
                <OptionSelect
                  label="页面尺寸"
                  options={PAGE_SIZE_OPTIONS}
                  value={options.page_size}
                  onChange={(v) => set('page_size', v)}
                  className="min-w-[6rem]"
                />
                <OptionSelect
                  label="引用格式"
                  options={[{ value: '', label: '无' }, ...CITATION_STYLE_OPTIONS]}
                  value={options.citation_style ?? ''}
                  onChange={(v) => set('citation_style', v ? (v as JobOptions['citation_style']) : null)}
                  className="min-w-[7rem]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-5 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={options.include_toc}
                    onChange={(e) => set('include_toc', e.target.checked)}
                  />
                  <span>生成目录</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={options.include_cover}
                    onChange={(e) => set('include_cover', e.target.checked)}
                  />
                  <span>包含封面</span>
                </label>
              </div>
            </div>
          )}
        </section>

        {quota() <= 0 && (
          <p className="text-sm text-rose-600">Credits 不足，无法创建任务</p>
        )}

        <section className="rounded-xl border-2 border-gemini-200 bg-gemini-50/40 p-4 shadow-sm dark:border-gemini-800 dark:bg-gemini-950/30">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">④ 确认并提交</h2>
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
