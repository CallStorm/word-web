import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { TemplateSlot } from '../api/types'
import { useAuthStore } from '../stores/authStore'
import { notifyError, notifySuccess } from '../stores/toastStore'
import { invalidateJobLists } from '../hooks/useJobs'
import { FileUploadZone } from '../components/jobs/FileUploadZone'
import { TemplateAiFillButton } from '../components/templates/TemplateAiFillButton'
import { TemplateGallery } from '../components/templates/TemplateGallery'
import { useTemplate } from '../hooks/useTemplates'
import { mergeTemplateSlotValues } from '../lib/templateAiFill'

const PANEL_CLASS =
  'rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40'

function buildPromptFallback(
  extraPrompt: string,
  sourceText: string,
  slots: TemplateSlot[],
  slotValues: Record<string, string>,
): string {
  if (extraPrompt.trim()) return extraPrompt.trim()
  if (sourceText.trim()) return sourceText.trim()
  return slots.map((s) => `${s.label}: ${slotValues[s.key] ?? ''}`).join('\n')
}

export function TemplateFillPage() {
  const quota = useAuthStore((s) => s.quota)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()

  const [projectName, setProjectName] = useState('')
  const [templateId, setTemplateId] = useState<string | null>(searchParams.get('templateId'))
  const [sourceText, setSourceText] = useState('')
  const [extraPrompt, setExtraPrompt] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [slotValues, setSlotValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [planConfirmed, setPlanConfirmed] = useState(false)

  const templateQ = useTemplate(templateId ?? undefined)
  const templateName = templateQ.data?.name ?? '模板'

  const slots: TemplateSlot[] = useMemo(() => {
    const t = templateQ.data
    if (!t) return []
    if (t.slots?.length) return t.slots
    return (t.placeholders ?? []).map((ph, i) => {
      const key = typeof ph === 'string' ? ph : ph.key
      const hint = typeof ph === 'string' ? key.replace(/_/g, ' ') : ph.hint || key
      return {
        key,
        label: hint || key,
        hint: hint || null,
        order: i,
        source: 'analyze',
      }
    })
  }, [templateQ.data])

  useEffect(() => {
    const fromUrl = searchParams.get('templateId')
    if (fromUrl) setTemplateId(fromUrl)
  }, [searchParams])

  useEffect(() => {
    setSlotValues({})
    setSourceText('')
    setExtraPrompt('')
    setPlanConfirmed(false)
  }, [templateId])

  const filledCount = useMemo(
    () => Object.values(slotValues).filter((v) => v.trim()).length,
    [slotValues],
  )

  const hasContent = useMemo(() => {
    if (slots.length === 0) return !!sourceText.trim() || !!extraPrompt.trim()
    return filledCount > 0 || !!extraPrompt.trim()
  }, [slots.length, filledCount, extraPrompt, sourceText])

  const canStart = useMemo(
    () => quota() > 0 && !!templateId && hasContent && planConfirmed && !submitting,
    [quota, templateId, hasContent, planConfirmed, submitting],
  )

  const applyAiFill = (data: Record<string, string>) => {
    setSlotValues((prev) => mergeTemplateSlotValues(prev, data))
    setPlanConfirmed(false)
  }

  const submit = async () => {
    if (!canStart || !templateId) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      const prompt = buildPromptFallback(extraPrompt, sourceText, slots, slotValues)
      fd.append('prompt', prompt)
      if (projectName.trim()) fd.append('project_name', projectName.trim())
      fd.append('generation_mode', 'template')
      fd.append('template_id', templateId)
      if (sourceText.trim()) fd.append('core_topic', sourceText.trim().slice(0, 2000))
      if (extraPrompt.trim()) fd.append('generation_hint', extraPrompt.trim())

      const templateData: Record<string, string> = {}
      for (const slot of slots) {
        const val = (slotValues[slot.key] ?? '').trim()
        if (val) templateData[slot.key] = val
      }
      if (Object.keys(templateData).length > 0) {
        fd.append('template_data', JSON.stringify(templateData))
      }
      for (const f of files) fd.append('files', f, f.name)

      const job = await api<{ id: string }>('POST', '/api/jobs', fd)
      notifySuccess('已开始填充模板，请稍候…')
      invalidateJobLists(qc)
      navigate(`/jobs/${job.id}`)
    } catch (e) {
      notifyError('创建失败: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">模板填充</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            选择模板，提供素材后 AI 自动填入变量，确认后生成文档。
          </p>
        </div>
        <Link to="/" className="text-sm text-slate-500 hover:text-gemini-600">
          取消
        </Link>
      </div>

      <div className="space-y-4">
        <section className={PANEL_CLASS}>
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">① 选择模板</h2>
          <div className="mt-3">
            <TemplateGallery
              value={templateId}
              onChange={(id) => {
                setTemplateId(id)
                setPlanConfirmed(false)
              }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            需要新模板？前往
            <Link to="/templates" className="mx-1 text-gemini-600 hover:underline">
              模板管理
            </Link>
            导入或编辑。
          </p>
        </section>

        {templateId && (
          <section className={PANEL_CLASS}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">② 提供素材</h2>
              {slots.length > 0 && (
                <TemplateAiFillButton
                  sourceText={sourceText}
                  files={files}
                  templateName={templateName}
                  slots={slots}
                  disabled={!sourceText.trim() && files.length === 0}
                  onResult={(data) => applyAiFill(data.template_data)}
                />
              )}
            </div>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-xs text-slate-500">项目名称（可选）</span>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  placeholder="例：2026 年度合同"
                />
              </label>

              <label className="block">
                <span className="text-xs text-slate-500">相关信息</span>
                <textarea
                  value={sourceText}
                  onChange={(e) => {
                    setSourceText(e.target.value)
                    setPlanConfirmed(false)
                  }}
                  rows={5}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  placeholder="粘贴或描述要写入模板的内容，例如合同双方、金额、条款要点，或报告各章节要点。"
                />
              </label>

              <FileUploadZone files={files} onChange={setFiles} />
            </div>
          </section>
        )}

        {templateId && slots.length > 0 && (
          <section className={PANEL_CLASS}>
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
              ③ 模板变量（{filledCount}/{slots.length} 已填）
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              AI 填充后可手动修改；未填变量可在生成时由 AI 根据素材补充。
            </p>
            <div className="mt-3 space-y-3">
              {slots.map((slot) => (
                <label key={slot.key} className="block">
                  <span className="text-xs text-slate-500">
                    {slot.label}
                    <span className="ml-1 font-mono text-[10px] text-slate-400">{`{{${slot.key}}}`}</span>
                  </span>
                  {slot.hint && (
                    <span className="ml-1 text-[10px] text-slate-400">· {slot.hint}</span>
                  )}
                  <input
                    value={slotValues[slot.key] ?? ''}
                    onChange={(e) => {
                      setSlotValues((prev) => ({ ...prev, [slot.key]: e.target.value }))
                      setPlanConfirmed(false)
                    }}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    placeholder={slot.sample_text || slot.label}
                  />
                </label>
              ))}
            </div>
          </section>
        )}

        {templateId && (
          <section className={PANEL_CLASS}>
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {slots.length > 0 ? '④ 生成微调（可选）' : '③ 生成微调（可选）'}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              提交生成时的额外说明，不影响上方 AI 填充，例如语气、格式或需强调的内容。
            </p>
            <label className="mt-3 block">
              <span className="text-xs text-slate-500">额外提示词</span>
              <textarea
                value={extraPrompt}
                onChange={(e) => {
                  setExtraPrompt(e.target.value)
                  setPlanConfirmed(false)
                }}
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                placeholder="例：语气更正式；金额保留两位小数；缺失字段从附件中推断。"
              />
            </label>
          </section>
        )}

        {quota() <= 0 && (
          <p className="text-sm text-rose-600">Credits 不足，无法创建任务</p>
        )}

        {templateId && (
          <section className="rounded-xl border-2 border-gemini-200 bg-gemini-50/40 p-4 shadow-sm dark:border-gemini-800 dark:bg-gemini-950/30">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {slots.length > 0 ? '⑤ 确认并提交' : '④ 确认并提交'}
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              模板填充 · {templateName}
              {slots.length > 0 && ` · 已填 ${filledCount}/${slots.length} 变量`}
            </p>

            <label className="mt-4 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={planConfirmed}
                onChange={(e) => setPlanConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-gemini-600 focus:ring-gemini-500"
              />
              <span>我已确认模板与变量无误，开始后将合并生成文档。</span>
            </label>

            <button
              type="button"
              disabled={!canStart}
              onClick={submit}
              className="mt-4 w-full rounded-md bg-gemini-600 py-2.5 text-sm font-medium text-white hover:bg-gemini-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '正在创建…' : '开始填充'}
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
