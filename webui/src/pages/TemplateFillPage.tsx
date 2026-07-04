import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { TemplateSlot } from '../api/types'
import { useAuthStore } from '../stores/authStore'
import { notifyError, notifySuccess } from '../stores/toastStore'
import { invalidateJobLists } from '../hooks/useJobs'
import { FileUploadZone } from '../components/jobs/FileUploadZone'
import { TemplateGallery } from '../components/templates/TemplateGallery'
import { useTemplate } from '../hooks/useTemplates'
import { parseOutlineLines } from '../lib/jobOptions'

const PANEL_CLASS =
  'rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40'

export function TemplateFillPage() {
  const quota = useAuthStore((s) => s.quota)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()

  const [projectName, setProjectName] = useState('')
  const [templateId, setTemplateId] = useState<string | null>(searchParams.get('templateId'))
  const [coreTopic, setCoreTopic] = useState('')
  const [outlineText, setOutlineText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [slotValues, setSlotValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [planConfirmed, setPlanConfirmed] = useState(false)

  const templateQ = useTemplate(templateId ?? undefined)
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
    setPlanConfirmed(false)
  }, [templateId])

  const requiredFilled =
    slots.length === 0 ||
    slots.every((s) => (slotValues[s.key] ?? '').trim().length > 0)

  const canStart = useMemo(
    () =>
      quota() > 0 &&
      !!templateId &&
      (!!coreTopic.trim() || requiredFilled) &&
      planConfirmed &&
      !submitting,
    [quota, templateId, coreTopic, requiredFilled, planConfirmed, submitting],
  )

  const applyOutlineToSlots = () => {
    const lines = parseOutlineLines(outlineText)
    if (lines.length === 0 || slots.length === 0) return
    const next = { ...slotValues }
    slots.forEach((slot, i) => {
      if (lines[i] && !next[slot.key]?.trim()) {
        next[slot.key] = lines[i]
      }
    })
    setSlotValues(next)
    notifySuccess('已从大纲填充部分变量')
  }

  const submit = async () => {
    if (!canStart || !templateId) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      const prompt =
        coreTopic.trim() ||
        slots.map((s) => `${s.label}: ${slotValues[s.key] ?? ''}`).join('\n')
      fd.append('prompt', prompt)
      if (projectName.trim()) fd.append('project_name', projectName.trim())
      fd.append('generation_mode', 'template')
      fd.append('template_id', templateId)
      fd.append('core_topic', coreTopic.trim() || prompt.slice(0, 500))
      if (outlineText.trim()) fd.append('outline', outlineText)
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

  const outlineLines = parseOutlineLines(outlineText)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">模板填充</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            选择模板、填写变量，系统将按占位符合并生成文档。
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

        {templateId && slots.length > 0 && (
          <section className={PANEL_CLASS}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
                ② 填写变量（{slots.length} 个）
              </h2>
              {outlineLines.length > 0 && (
                <button
                  type="button"
                  onClick={applyOutlineToSlots}
                  className="text-xs text-gemini-600 hover:underline"
                >
                  从大纲填充
                </button>
              )}
            </div>
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

        <section className={PANEL_CLASS}>
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {slots.length > 0 ? '③ 补充说明（可选）' : '② 填充内容'}
          </h2>
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
              <span className="text-xs text-slate-500">
                内容说明 {slots.length === 0 && <span className="text-rose-500">*</span>}
              </span>
              <textarea
                value={coreTopic}
                onChange={(e) => {
                  setCoreTopic(e.target.value)
                  setPlanConfirmed(false)
                }}
                rows={5}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                placeholder={
                  slots.length > 0
                    ? '可选：描述未填变量或整体背景，AI 将补充缺失字段。'
                    : '描述要写入模板的信息。'
                }
              />
            </label>

            <FileUploadZone files={files} onChange={setFiles} />

            <label className="block">
              <span className="text-xs text-slate-500">章节/字段大纲（可选，每行一条）</span>
              <textarea
                value={outlineText}
                onChange={(e) => {
                  setOutlineText(e.target.value)
                  setPlanConfirmed(false)
                }}
                rows={4}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
                placeholder={'甲方信息\n乙方信息\n合同金额\n交付条款'}
              />
            </label>
          </div>
        </section>

        {quota() <= 0 && (
          <p className="text-sm text-rose-600">Credits 不足，无法创建任务</p>
        )}

        <section className="rounded-xl border-2 border-gemini-200 bg-gemini-50/40 p-4 shadow-sm dark:border-gemini-800 dark:bg-gemini-950/30">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {slots.length > 0 ? '④ 确认并提交' : '③ 确认并提交'}
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            模板填充 · {templateId ? '已选模板' : '未选模板'}
            {slots.length > 0 && ` · 已填 ${Object.values(slotValues).filter((v) => v.trim()).length}/${slots.length} 变量`}
            {outlineLines.length > 0 && ` · 大纲 ${outlineLines.length} 条`}
          </p>

          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={planConfirmed}
              onChange={(e) => setPlanConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-gemini-600 focus:ring-gemini-500"
            />
            <span>我已确认模板与内容无误，开始后将合并变量生成文档。</span>
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
      </div>
    </div>
  )
}
