import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { AiAutoFillResult } from '../../lib/aiAutoFill'
import { notifyError, notifySuccess } from '../../stores/toastStore'
import { getDefaultModelInfo, type ModelInfo } from './AiOptimizeButton'

type AiAutoFillButtonProps = {
  coreTopic: string
  files?: File[]
  language?: string
  scenario?: string
  audience?: string
  tone?: string
  label?: string
  disabled?: boolean
  className?: string
  onResult: (data: AiAutoFillResult, model: ModelInfo) => void
}

export function AiAutoFillButton({
  coreTopic,
  files = [],
  language = 'zh',
  scenario = 'general',
  audience = 'general',
  tone = 'professional',
  label = 'AI 智能生成',
  disabled,
  className = '',
  onResult,
}: AiAutoFillButtonProps) {
  const [model, setModel] = useState<ModelInfo | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    getDefaultModelInfo().then((m) => {
      if (alive) setModel(m)
    })
    return () => {
      alive = false
    }
  }, [])

  const onClick = async () => {
    if (loading || disabled) return
    const topic = coreTopic.trim()
    if (!topic && files.length === 0) {
      notifyError('请先输入核心主题或上传参考文件')
      return
    }

    setLoading(true)
    try {
      const m = await getDefaultModelInfo()
      if (!m.configured) {
        notifyError(m.message || '未配置默认模型，请到 管理后台 → 应用设置 配置')
        return
      }

      const fd = new FormData()
      fd.append('mode', files.length > 0 ? 'document' : 'topic')
      fd.append('core_topic', topic)
      fd.append('language', language)
      fd.append('scenario', scenario)
      fd.append('audience', audience)
      fd.append('tone', tone)
      for (const f of files) fd.append('files', f, f.name)

      const resp = (await api('POST', '/api/app/llm/auto-fill', fd)) as Record<string, unknown>
      const modelUsed = (resp.model_used as ModelInfo | undefined) ?? m
      onResult(resp as AiAutoFillResult, modelUsed)
      notifySuccess(`AI 生成完成（${modelUsed.name ?? '模型'}）`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const match = msg.match(/\d+:\s*({.*})/s)
      if (match) {
        try {
          const detail = JSON.parse(match[1])
          notifyError(`AI 失败：${detail.message ?? msg}`)
          return
        } catch {
          /* fall through */
        }
      }
      notifyError(`AI 失败：${msg}`)
    } finally {
      setLoading(false)
    }
  }

  const tag =
    model?.configured && model.name
      ? `当前模型：${model.name}`
      : '未配置模型'

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading || disabled}
        className="rounded-md border border-gemini-300 bg-gemini-50 px-2.5 py-1 text-xs text-gemini-700 hover:bg-gemini-100 disabled:opacity-50 dark:border-gemini-700 dark:bg-gemini-950 dark:text-gemini-200 dark:hover:bg-gemini-900"
      >
        {loading ? '生成中…' : `✨ ${label}`}
      </button>
      <span
        className={`text-[10px] ${model?.configured ? 'text-slate-400' : 'text-amber-600 dark:text-amber-400'}`}
      >
        {tag}
      </span>
    </div>
  )
}
