/** Legacy PPT-specific job options — used by edit flow and visual style components. */
export type JobLanguage = 'zh' | 'en' | 'bilingual'
export type JobScenario =
  | 'general'
  | 'proposal'
  | 'product'
  | 'training'
  | 'popular_science'
  | 'speech'
  | 'project_report'
export type JobAudience =
  | 'general'
  | 'executive'
  | 'team'
  | 'client'
  | 'expert'
  | 'student'
export type JobTone = 'professional' | 'friendly' | 'technical' | 'academic' | 'concise'

export type JobCanvas = 'ppt169' | 'ppt43' | 'xhs' | 'story' | 'poster'
export type JobMode = 'briefing' | 'pyramid' | 'narrative' | 'instructional' | 'showcase'
export type JobColorMode = 'auto' | 'brand' | 'industry'
export type JobImageStrategy = 'ai' | 'web' | 'provided' | 'placeholder' | 'none'
export type JobIconStrategy = 'emoji' | 'library' | 'ai' | 'custom'
export type JobFormulaPolicy = 'mixed' | 'render-all' | 'text-only'

export type JobVisualStyle =
  | 'auto'
  | 'swiss-minimal'
  | 'soft-rounded'
  | 'glassmorphism'
  | 'dark-tech'
  | 'blueprint'
  | 'editorial'
  | 'photo-editorial'
  | 'data-journalism'
  | 'brutalist'
  | 'memphis'
  | 'zine'
  | 'vintage-poster'
  | 'paper-cut'
  | 'sketch-notes'
  | 'ink-notes'
  | 'chalkboard'
  | 'ink-wash'
  | 'pixel-art'

export type JobIndustry =
  | 'finance'
  | 'technology'
  | 'healthcare'
  | 'government'
  | 'education'
  | 'retail'
  | 'creative'

export interface PptJobOptions {
  language: JobLanguage
  scenario: JobScenario
  audience: JobAudience
  tone: JobTone
  page_count: number
  canvas: JobCanvas
  mode: JobMode
  visual_style: JobVisualStyle | null
  color_mode: JobColorMode
  brand_hex: string | null
  industry: JobIndustry | null
  image_strategy: JobImageStrategy
  core_topic: string | null
  outline: string[] | null
  key_points: string[] | null
  icon_strategy: JobIconStrategy
  formula_policy: JobFormulaPolicy
  include_speaker_notes: boolean
  split_mode: boolean
}

export interface OptionItem<T extends string = string> {
  value: T
  label: string
}

export const LANGUAGE_OPTIONS: OptionItem<JobLanguage>[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'bilingual', label: '中英双语' },
]

export const SCENARIO_OPTIONS: OptionItem<JobScenario>[] = [
  { value: 'general', label: '通用' },
  { value: 'proposal', label: '方案汇报' },
  { value: 'product', label: '产品介绍' },
  { value: 'training', label: '培训教程' },
  { value: 'popular_science', label: '科普宣传' },
  { value: 'speech', label: '演讲答辩' },
  { value: 'project_report', label: '项目汇报' },
]

export const AUDIENCE_OPTIONS: OptionItem<JobAudience>[] = [
  { value: 'general', label: '通用受众' },
  { value: 'executive', label: '管理层' },
  { value: 'team', label: '团队内部' },
  { value: 'client', label: '客户/合作方' },
  { value: 'expert', label: '评审专家' },
  { value: 'student', label: '学员/学生' },
]

export const TONE_OPTIONS: OptionItem<JobTone>[] = [
  { value: 'professional', label: '专业严谨' },
  { value: 'friendly', label: '轻松友好' },
  { value: 'technical', label: '技术深入' },
  { value: 'academic', label: '学术规范' },
  { value: 'concise', label: '简洁凝练' },
]

export const CANVAS_OPTIONS: OptionItem<JobCanvas>[] = [
  { value: 'ppt169', label: '16:9 演示（默认）' },
  { value: 'ppt43', label: '4:3 演示' },
  { value: 'xhs', label: '小红书 3:4' },
  { value: 'story', label: 'Story 9:16' },
  { value: 'poster', label: '海报/单页' },
]

export const MODE_OPTIONS: OptionItem<JobMode>[] = [
  { value: 'briefing', label: '简报（按内容自然组织）' },
  { value: 'pyramid', label: '金字塔（结论先行）' },
  { value: 'narrative', label: '叙事（故事线）' },
  { value: 'instructional', label: '教学（循序渐进）' },
  { value: 'showcase', label: '展示（视觉主导）' },
]

export const VISUAL_STYLE_OPTIONS: OptionItem<JobVisualStyle>[] = [
  { value: 'auto', label: 'AI 智能感知' },
  { value: 'swiss-minimal', label: '瑞士极简 · 企业内训首选' },
  { value: 'soft-rounded', label: '柔圆亲和 · ToC/教育' },
  { value: 'glassmorphism', label: '玻璃拟态 · 现代科技' },
  { value: 'dark-tech', label: '深色科技 · 技术发布' },
  { value: 'blueprint', label: '蓝图 · 工程方案' },
  { value: 'editorial', label: '编辑设计 · 内容型' },
  { value: 'photo-editorial', label: '图册编辑 · 大图主导' },
  { value: 'data-journalism', label: '数据新闻 · 图表密集' },
  { value: 'brutalist', label: '粗野主义 · 重磅发布' },
  { value: 'memphis', label: '孟菲斯 · 创意营销' },
  { value: 'zine', label: '独立杂志 · 文化设计' },
  { value: 'vintage-poster', label: '复古海报 · 文旅周年' },
  { value: 'paper-cut', label: '剪纸层叠 · 民俗文化' },
  { value: 'sketch-notes', label: '手绘速写 · 教学培训' },
  { value: 'ink-notes', label: '墨笔记 · 方法论' },
  { value: 'chalkboard', label: '黑板粉笔 · 课堂教程' },
  { value: 'ink-wash', label: '水墨留白 · 新中式' },
  { value: 'pixel-art', label: '像素复古 · 游戏怀旧' },
]

export const COLOR_MODE_OPTIONS: OptionItem<JobColorMode>[] = [
  { value: 'auto', label: 'auto（自动选色）' },
  { value: 'brand', label: '品牌色（指定主色）' },
  { value: 'industry', label: '行业预设' },
]

export const INDUSTRY_OPTIONS: OptionItem<JobIndustry>[] = [
  { value: 'finance', label: '金融 · 海军蓝 #003366' },
  { value: 'technology', label: '科技 · 鲜亮蓝 #1565C0' },
  { value: 'healthcare', label: '医疗 · 青绿 #00796B' },
  { value: 'government', label: '政企 · 中国红 #C41E3A' },
  { value: 'education', label: '教育 · 学术深蓝' },
  { value: 'retail', label: '零售 · 暖橙' },
  { value: 'creative', label: '创意 · 多色' },
]

export const IMAGE_STRATEGY_OPTIONS: OptionItem<JobImageStrategy>[] = [
  { value: 'web', label: '网络搜图（默认，速度快）' },
  { value: 'provided', label: '仅使用上传的图片' },
  { value: 'placeholder', label: '占位符/纯色块' },
  { value: 'none', label: '不使用图片' },
  { value: 'ai', label: 'AI 生图（需配置 key，可能失败）' },
]

export const ICON_STRATEGY_OPTIONS: OptionItem<JobIconStrategy>[] = [
  { value: 'library', label: '内置图标库（默认）' },
  { value: 'emoji', label: 'Emoji（休闲）' },
  { value: 'ai', label: 'AI 生成' },
  { value: 'custom', label: '自定义' },
]

export const FORMULA_POLICY_OPTIONS: OptionItem<JobFormulaPolicy>[] = [
  { value: 'mixed', label: '混合（复杂渲染，简单留文本）' },
  { value: 'render-all', label: '全部渲染为图' },
  { value: 'text-only', label: '全部留文本' },
]

export const FONT_FAMILY_OPTIONS: OptionItem<string>[] = [
  {
    value: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
    label: '微软雅黑 / 苹方（默认中文）',
  },
  {
    value: 'SimSun, "Songti SC", serif',
    label: '宋体 / 宋体-简',
  },
  {
    value: 'Arial, Helvetica, sans-serif',
    label: 'Arial / Helvetica',
  },
  {
    value: 'Georgia, "Times New Roman", serif',
    label: 'Georgia / Times',
  },
  {
    value: 'Consolas, "Courier New", monospace',
    label: 'Consolas / Courier（等宽）',
  },
]

export const SPEC_COLOR_LABELS: Record<string, string> = {
  primary: '主色',
  accent: '强调色',
  bg: '背景',
  text: '正文',
  text_secondary: '次要文字',
  border: '边框',
}

export const SPEC_COLOR_KEYS = [
  'primary',
  'accent',
  'bg',
  'text',
  'text_secondary',
  'border',
] as const

export const CONTENT_PRESET_OPTIONS: OptionItem<
  'concise' | 'formal' | 'translate_en' | 'glossary'
>[] = [
  { value: 'concise', label: '全文更简洁' },
  { value: 'formal', label: '语气更正式' },
  { value: 'translate_en', label: '翻译成英文' },
  { value: 'glossary', label: '统一专业术语' },
]

export const GLOBAL_REVISION_KIND_OPTIONS: OptionItem<
  'colors' | 'typography' | 'visual_style' | 'content' | 'custom'
>[] = [
  { value: 'colors', label: '换配色' },
  { value: 'typography', label: '换字体' },
  { value: 'visual_style', label: '换视觉风格' },
  { value: 'content', label: '改内容基调' },
  { value: 'custom', label: '自定义全局指令' },
]

export const DEFAULT_PPT_JOB_OPTIONS: PptJobOptions = {
  language: 'zh',
  scenario: 'general',
  audience: 'general',
  tone: 'professional',
  page_count: 5,
  canvas: 'ppt169',
  mode: 'briefing',
  visual_style: 'auto',
  color_mode: 'auto',
  brand_hex: null,
  industry: null,
  image_strategy: 'web',
  core_topic: null,
  outline: null,
  key_points: null,
  icon_strategy: 'library',
  formula_policy: 'mixed',
  include_speaker_notes: true,
  split_mode: false,
}

export const PAGE_COUNT_MIN = 3
export const PAGE_COUNT_MAX = 30

const ALL_OPTIONS = [
  ...LANGUAGE_OPTIONS,
  ...SCENARIO_OPTIONS,
  ...AUDIENCE_OPTIONS,
  ...TONE_OPTIONS,
  ...CANVAS_OPTIONS,
  ...MODE_OPTIONS,
  ...VISUAL_STYLE_OPTIONS,
  ...COLOR_MODE_OPTIONS,
  ...INDUSTRY_OPTIONS,
  ...IMAGE_STRATEGY_OPTIONS,
  ...ICON_STRATEGY_OPTIONS,
  ...FORMULA_POLICY_OPTIONS,
]

export function optionLabel(value: string): string {
  return ALL_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export type ColorPaletteKey = 'auto' | 'brand' | JobIndustry

export interface ColorPalette {
  swatches: string[]
  label: string
}

export const COLOR_PALETTE: Record<ColorPaletteKey, ColorPalette> = {
  auto: {
    swatches: ['#334155', '#94A3B8', '#0EA5E9', '#F1F5F9'],
    label: 'AI 智能感知主调',
  },
  brand: {
    swatches: ['#1A73E8', '#4A90E2', '#8AB4F8', '#E8F0FE'],
    label: '品牌主色',
  },
  finance: { swatches: ['#003366', '#4A6FA5', '#B0C4DE', '#F0F4F8'], label: '海军蓝 · 金融' },
  technology: { swatches: ['#1565C0', '#42A5F5', '#90CAF9', '#E3F2FD'], label: '鲜亮蓝 · 科技' },
  healthcare: { swatches: ['#00796B', '#4DB6AC', '#80CBC4', '#E0F2F1'], label: '青绿 · 医疗' },
  government: { swatches: ['#C41E3A', '#E57373', '#FFCDD2', '#FFF5F5'], label: '中国红 · 政企' },
  education: { swatches: ['#1A237E', '#5C6BC0', '#9FA8DA', '#E8EAF6'], label: '学术深蓝 · 教育' },
  retail: { swatches: ['#E65100', '#FF9800', '#FFCC80', '#FFF3E0'], label: '暖橙 · 零售' },
  creative: { swatches: ['#E91E63', '#FFC107', '#03A9F4', '#8BC34A'], label: '多色 · 创意' },
}

export function brandPalette(hex: string | null | undefined): ColorPalette {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? '').trim())
  if (!m) return COLOR_PALETTE.brand
  const r = parseInt(m[1].slice(0, 2), 16) / 255
  const g = parseInt(m[1].slice(2, 4), 16) / 255
  const b = parseInt(m[1].slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  const hsl = (hh: number, ss: number, ll: number) =>
    `hsl(${(hh * 360).toFixed(1)} ${(ss * 100).toFixed(1)}% ${(ll * 100).toFixed(1)}%)`
  return {
    swatches: [
      hsl(h, s || 0.6, l),
      hsl((h + 30 / 360) % 1, s || 0.6, l),
      hsl(h, s || 0.6, 0.85),
      hsl(h, s || 0.6, 0.2),
    ],
    label: `品牌主色 #${m[1].toUpperCase()}`,
  }
}

import type { ReactNode } from 'react'

type SwatchSpec = { bg: string; glyph: ReactNode }

const swissRect = <div className="h-3 w-8 rounded-sm bg-slate-900" />

export const VISUAL_STYLE_SWATCH: Record<JobVisualStyle, SwatchSpec> = {
  auto: { bg: 'bg-gradient-to-br from-gemini-100 to-violet-100', glyph: swissRect },
  'swiss-minimal': { bg: 'bg-slate-50', glyph: swissRect },
  'soft-rounded': { bg: 'bg-pink-50', glyph: swissRect },
  glassmorphism: { bg: 'bg-cyan-100', glyph: swissRect },
  'dark-tech': { bg: 'bg-slate-900', glyph: swissRect },
  blueprint: { bg: 'bg-blue-50', glyph: swissRect },
  editorial: { bg: 'bg-stone-100', glyph: swissRect },
  'photo-editorial': { bg: 'bg-amber-100', glyph: swissRect },
  'data-journalism': { bg: 'bg-orange-50', glyph: swissRect },
  brutalist: { bg: 'bg-yellow-300', glyph: swissRect },
  memphis: { bg: 'bg-yellow-100', glyph: swissRect },
  zine: { bg: 'bg-rose-50', glyph: swissRect },
  'vintage-poster': { bg: 'bg-amber-100', glyph: swissRect },
  'paper-cut': { bg: 'bg-emerald-50', glyph: swissRect },
  'sketch-notes': { bg: 'bg-amber-50', glyph: swissRect },
  'ink-notes': { bg: 'bg-stone-100', glyph: swissRect },
  chalkboard: { bg: 'bg-slate-800', glyph: swissRect },
  'ink-wash': { bg: 'bg-slate-100', glyph: swissRect },
  'pixel-art': { bg: 'bg-violet-100', glyph: swissRect },
}

/** @deprecated Use PptJobOptions */
export type JobOptions = PptJobOptions
export const DEFAULT_JOB_OPTIONS = DEFAULT_PPT_JOB_OPTIONS
