export type JobLanguage = 'zh' | 'en'
export type GenerationMode = 'freeform' | 'template'
export type JobScenario =
  | 'report'
  | 'contract'
  | 'letter'
  | 'memo'
  | 'academic'
  | 'general'
export type JobAudience =
  | 'general'
  | 'executive'
  | 'team'
  | 'client'
  | 'expert'
  | 'student'
export type JobTone = 'formal' | 'casual' | 'technical' | 'professional' | 'concise'
export type PageSize = 'A4' | 'Letter'
export type CitationStyle = 'APA' | 'IEEE' | 'MLA' | 'Chicago'

export interface JobOptions {
  generation_mode: GenerationMode
  template_id: string | null
  language: JobLanguage
  scenario: JobScenario
  audience: JobAudience
  tone: JobTone
  section_count: number
  include_toc: boolean
  include_cover: boolean
  page_size: PageSize
  citation_style: CitationStyle | null
  core_topic: string | null
  outline: string[] | null
  template_data?: Record<string, string> | null
}

export interface OptionItem<T extends string = string> {
  value: T
  label: string
}

export const LANGUAGE_OPTIONS: OptionItem<JobLanguage>[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

export const GENERATION_MODE_OPTIONS: OptionItem<GenerationMode>[] = [
  { value: 'freeform', label: '自由撰写' },
  { value: 'template', label: '模板填充' },
]

export const SCENARIO_OPTIONS: OptionItem<JobScenario>[] = [
  { value: 'report', label: '工作报告' },
  { value: 'memo', label: '会议纪要' },
  { value: 'contract', label: '合同' },
  { value: 'letter', label: '公函/信件' },
  { value: 'academic', label: '学术论文' },
  { value: 'general', label: '通用文档' },
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
  { value: 'formal', label: '正式' },
  { value: 'professional', label: '专业严谨' },
  { value: 'technical', label: '技术深入' },
  { value: 'concise', label: '简洁凝练' },
  { value: 'casual', label: '轻松友好' },
]

export const PAGE_SIZE_OPTIONS: OptionItem<PageSize>[] = [
  { value: 'A4', label: 'A4' },
  { value: 'Letter', label: 'Letter' },
]

export const CITATION_STYLE_OPTIONS: OptionItem<CitationStyle>[] = [
  { value: 'APA', label: 'APA' },
  { value: 'IEEE', label: 'IEEE' },
  { value: 'MLA', label: 'MLA' },
  { value: 'Chicago', label: 'Chicago' },
]

export const DEFAULT_JOB_OPTIONS: JobOptions = {
  generation_mode: 'freeform',
  template_id: null,
  language: 'zh',
  scenario: 'report',
  audience: 'general',
  tone: 'formal',
  section_count: 5,
  include_toc: true,
  include_cover: true,
  page_size: 'A4',
  citation_style: null,
  core_topic: null,
  outline: null,
}

export const SECTION_COUNT_MIN = 2
export const SECTION_COUNT_MAX = 30

const ALL_OPTIONS = [
  ...LANGUAGE_OPTIONS,
  ...GENERATION_MODE_OPTIONS,
  ...SCENARIO_OPTIONS,
  ...AUDIENCE_OPTIONS,
  ...TONE_OPTIONS,
  ...PAGE_SIZE_OPTIONS,
  ...CITATION_STYLE_OPTIONS,
]

export function optionLabel(value: string): string {
  return ALL_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export function formatJobOptionsSummary(options: JobOptions): string {
  return [
    optionLabel(options.generation_mode),
    optionLabel(options.language),
    optionLabel(options.scenario),
    optionLabel(options.tone),
    `${options.section_count} 节`,
  ].join(' · ')
}

export function sanitizeJobOptions(o: Partial<JobOptions>): JobOptions {
  return { ...DEFAULT_JOB_OPTIONS, ...o }
}

export function parseOutlineLines(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}
