import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { TemplateSlot } from '../../api/types'
import type { TemplateAiFillResult } from '../../lib/templateAiFill'
import { notifyError, notifySuccess } from '../../stores/toastStore'
import { getDefaultModelInfo, type ModelInfo } from '../jobs/AiOptimizeButton'

type TemplateAiFillButtonProps = {
  sourceText: string
  files?: File[]
  templateName: string
  slots: TemplateSlot[]
  label?: string
  disabled?: boolean
  className?: string
  onResult: (data: TemplateAiFillResult, model: ModelInfo) => void
}

export function TemplateAiFillButton({
  sourceText,
  files = [],
  templateName,
  slots,
  label = 'AI 填充',
  disabled,
  className = '',
  onResult,
}: TemplateAiFillButtonProps) {
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
    if (loading || disabled || slots.length === 0) return
    const text = sourceText.trim()
    if (!text && files.length === 0) {
      notifyError('请先输入相关信息或上传参考文件')
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
      fd.append('mode', files.length > 0 && !text ? 'document' : 'topic')
      fd.append('source_text', text)
      fd.append('template_name', templateName)
      fd.append(
        'slots_json',
        JSON.stringify(
          slots.map((s) => ({
            key: s.key,
            label: s.label,
            hint: s.hint ?? undefined,
          })),
        ),
      )
      for (const f of files) fd.append('files', f, f.name)

      const resp = (await api('POST', '/api/app/llm/template-fill', fd)) as Record<string, unknown>
      const modelUsed = (resp.model_used as ModelInfo | undefined) ?? m
      const result: TemplateAiFillResult = {
        template_data: (resp.template_data as Record<string, string>) ?? {},
        filled_keys: resp.filled_keys as string[] | undefined,
        missing_keys: resp.missing_keys as string[] | undefined,
      }
      onResult(result, modelUsed)
      const filled = result.filled_keys?.length ?? Object.keys(result.template_data).length
      const missing = result.missing_keys?.length ?? 0
      if (filled > 0) {
        notifySuccess(
          `AI 已填充 ${filled} 个变量${missing > 0 ? `，${missing} 个待补充` : ''}（${modelUsed.name ?? '模型'}）`,
        )
      } else {
        notifyError('未能从素材中提取变量，请补充信息后重试或手动填写')
      }
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
    model?.configured && model.name ? `当前模型：${model.name}` : '未配置模型'

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading || disabled || slots.length === 0}
        className="rounded-md border border-gemini-300 bg-gemini-50 px-2.5 py-1 text-xs text-gemini-700 hover:bg-gemini-100 disabled:opacity-50 dark:border-gemini-700 dark:bg-gemini-950 dark:text-gemini-200 dark:hover:bg-gemini-900"
      >
        {loading ? '填充中…' : `✨ ${label}`}
      </button>
      <span
        className={`text-[10px] ${model?.configured ? 'text-slate-400' : 'text-amber-600 dark:text-amber-400'}`}
      >
        {tag}
      </span>
    </div>
  )
}
