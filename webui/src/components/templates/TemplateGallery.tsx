import { useMemo } from 'react'
import type { Template } from '../../api/types'
import { useTemplates } from '../../hooks/useTemplates'
import catalogData from '../../lib/templateCatalog.json'

type CatalogEntry = (typeof catalogData.templates)[number]

const CATALOG_BY_BUILTIN_ID = new Map(
  catalogData.templates.map((t) => [t.builtin_id, t] as const),
)

function catalogForTemplate(t: Template): CatalogEntry | undefined {
  return CATALOG_BY_BUILTIN_ID.get(t.id)
}

function TemplateCard({
  template,
  catalog,
  selected,
  onSelect,
}: {
  template: Template
  catalog?: CatalogEntry
  selected: boolean
  onSelect: () => void
}) {
  const icon = catalog?.icon ?? '📄'
  const description = template.description || catalog?.description || ''

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex flex-col overflow-hidden rounded-lg border text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
        selected
          ? 'border-gemini-500 ring-1 ring-gemini-500'
          : 'border-slate-200 dark:border-slate-700'
      } bg-white/80 dark:bg-slate-900/60`}
    >
      <div className="relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
        <span className="text-4xl" aria-hidden>
          {icon}
        </span>
        {selected && (
          <span className="absolute right-2 top-2 rounded-full bg-gemini-600 px-2 py-0.5 text-[10px] font-medium text-white">
            已选
          </span>
        )}
      </div>
      <div className="relative px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {template.name}
          </span>
          {template.is_builtin && (
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              内置
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          {description}
        </p>
        <p className="mt-1.5 text-[10px] text-slate-400">
          {template.placeholder_count} 个占位符
        </p>
      </div>
    </button>
  )
}

export function TemplateGallery({
  value,
  onChange,
  category,
}: {
  value: string | null
  onChange: (templateId: string | null) => void
  category?: string
}) {
  const { data: templates, isLoading, error } = useTemplates()

  const filtered = useMemo(() => {
    const list = templates ?? []
    if (!category) return list
    return list.filter((t) => t.category === category)
  }, [templates, category])

  if (isLoading) {
    return <p className="text-sm text-slate-400">加载模板…</p>
  }

  if (error) {
    return (
      <p className="text-sm text-rose-600">
        加载模板失败：{error instanceof Error ? error.message : String(error)}
      </p>
    )
  }

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        暂无可用模板。请先在
        <a href="/templates" className="mx-1 text-gemini-600 hover:underline">
          模板管理
        </a>
        上传。
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {filtered.map((t) => (
        <TemplateCard
          key={t.id}
          template={t}
          catalog={catalogForTemplate(t)}
          selected={value === t.id}
          onSelect={() => onChange(value === t.id ? null : t.id)}
        />
      ))}
    </div>
  )
}
