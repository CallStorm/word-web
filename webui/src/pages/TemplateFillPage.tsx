import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { notifyError, notifySuccess } from '../stores/toastStore'
import { invalidateJobLists } from '../hooks/useJobs'
import { FileUploadZone } from '../components/jobs/FileUploadZone'
import { TemplateGallery } from '../components/templates/TemplateGallery'
import { parseOutlineLines } from '../lib/jobOptions'

const PANEL_CLASS =
  'rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40'

export function TemplateFillPage() {
  const quota = useAuthStore((s) => s.quota)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [projectName, setProjectName] = useState('')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [coreTopic, setCoreTopic] = useState('')
  const [outlineText, setOutlineText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [planConfirmed, setPlanConfirmed] = useState(false)

  const canStart = useMemo(
    () =>
      quota() > 0 &&
      !!templateId &&
      !!coreTopic.trim() &&
      planConfirmed &&
      !submitting,
    [quota, templateId, coreTopic, planConfirmed, submitting],
  )

  const submit = async () => {
    if (!canStart || !templateId) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('prompt', coreTopic.trim())
      if (projectName.trim()) fd.append('project_name', projectName.trim())
      fd.append('generation_mode', 'template')
      fd.append('template_id', templateId)
      fd.append('core_topic', coreTopic.trim())
      if (outlineText.trim()) fd.append('outline', outlineText)
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
            选择 Word 模板，描述要填入的内容，AI 将按占位符生成文档。
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
            上传。
          </p>
        </section>

        <section className={PANEL_CLASS}>
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">② 填充内容</h2>
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
                内容说明 <span className="text-rose-500">*</span>
              </span>
              <textarea
                value={coreTopic}
                onChange={(e) => {
                  setCoreTopic(e.target.value)
                  setPlanConfirmed(false)
                }}
                rows={5}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                placeholder="描述要写入模板的信息，例如合同双方、金额、条款要点，或报告各章节要点。"
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
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">③ 确认并提交</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            模板填充模式 · {templateId ? '已选模板' : '未选模板'}
            {outlineLines.length > 0 && ` · 大纲 ${outlineLines.length} 条`}
          </p>

          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={planConfirmed}
              onChange={(e) => setPlanConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-gemini-600 focus:ring-gemini-500"
            />
            <span>我已确认模板与内容无误，开始后将按模板结构生成。</span>
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
