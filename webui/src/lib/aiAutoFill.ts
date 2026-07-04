import type {
  JobAudience,
  JobLanguage,
  JobOptions,
  JobScenario,
  JobTone,
} from './jobOptions'
import { SECTION_COUNT_MAX, SECTION_COUNT_MIN } from './jobOptions'

export type AiSuggestedOptions = {
  language?: string
  scenario?: string
  audience?: string
  tone?: string
  page_count?: number
}

export type AiAutoFillResult = {
  core_topic?: string
  key_points?: string[]
  suggested_options?: AiSuggestedOptions
  outline?: string[]
}

const SCENARIO_MAP: Record<string, JobScenario> = {
  general: 'general',
  report: 'report',
  proposal: 'report',
  product: 'report',
  training: 'memo',
  popular_science: 'general',
  speech: 'letter',
  project_report: 'report',
  contract: 'contract',
  letter: 'letter',
  memo: 'memo',
  academic: 'academic',
}

const TONE_MAP: Record<string, JobTone> = {
  formal: 'formal',
  professional: 'professional',
  friendly: 'casual',
  casual: 'casual',
  technical: 'technical',
  academic: 'formal',
  concise: 'concise',
}

const AUDIENCE_MAP: Record<string, JobAudience> = {
  general: 'general',
  executive: 'executive',
  team: 'team',
  client: 'client',
  expert: 'expert',
  student: 'student',
}

export function mapAiLanguage(raw: string | undefined, fallback: JobLanguage): JobLanguage {
  if (raw === 'en') return 'en'
  return raw === 'zh' ? 'zh' : fallback
}

export function mapAiScenario(raw: string | undefined, fallback: JobScenario): JobScenario {
  if (!raw) return fallback
  return SCENARIO_MAP[raw] ?? fallback
}

export function mapAiAudience(raw: string | undefined, fallback: JobAudience): JobAudience {
  if (!raw) return fallback
  return AUDIENCE_MAP[raw] ?? fallback
}

export function mapAiTone(raw: string | undefined, fallback: JobTone): JobTone {
  if (!raw) return fallback
  return TONE_MAP[raw] ?? fallback
}

export function mapAiSectionCount(raw: number | undefined, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback
  return Math.min(SECTION_COUNT_MAX, Math.max(SECTION_COUNT_MIN, Math.round(raw)))
}

/** Apply LLM suggested_options onto Word job options. */
export function applySuggestedOptions(
  current: JobOptions,
  suggested: AiSuggestedOptions | undefined,
): JobOptions {
  if (!suggested) return current
  return {
    ...current,
    language: mapAiLanguage(suggested.language, current.language),
    scenario: mapAiScenario(suggested.scenario, current.scenario),
    audience: mapAiAudience(suggested.audience, current.audience),
    tone: mapAiTone(suggested.tone, current.tone),
    section_count: mapAiSectionCount(suggested.page_count, current.section_count),
  }
}

export function outlineToText(outline: string[] | undefined): string {
  return (outline ?? []).join('\n')
}
