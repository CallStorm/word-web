export type PageAnnotation = {
  id: string
  pageIndex: number
  /** docx element path, e.g. /body/p[3] */
  dataPath?: string
  /** Selected source text */
  quote?: string
  /** Legacy PNG pin coordinates */
  x?: number
  y?: number
  text: string
}

export const MAX_COMMENT = 1000
export const MAX_QUOTE = 200

export function newAnnotationId(): string {
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function formatPosition(x: number, y: number): string {
  const px = Math.round(Math.max(0, Math.min(1, x)) * 100)
  const py = Math.round(Math.max(0, Math.min(1, y)) * 100)
  return `[位置 ${px}%,${py}%]`
}

function formatAnnotationLine(ann: PageAnnotation): string {
  const comment = ann.text.trim()
  if (!comment) return ''

  if (ann.dataPath) {
    const quote = ann.quote?.trim()
    if (quote) {
      const clipped = quote.slice(0, MAX_QUOTE)
      return `- [段落 ${ann.dataPath}] 引用「${clipped}」：${comment}`
    }
    return `- [段落 ${ann.dataPath}]：${comment}`
  }

  if (ann.x != null && ann.y != null) {
    return `- ${formatPosition(ann.x, ann.y)} ${comment}`
  }

  return `- ${comment}`
}

/** Single annotation as revision comment (no leading bullet). */
export function formatAnnotationComment(ann: PageAnnotation): string {
  const line = formatAnnotationLine(ann)
  return line.startsWith('- ') ? line.slice(2) : line
}

/** One revision item per annotation (same page may produce multiple items). */
export function collectRevisionItems(
  annotations: PageAnnotation[],
): {
  slide_index?: number
  data_path?: string
  quote?: string
  comment: string
}[] {
  return annotations
    .filter((a) => a.text.trim())
    .map((a) => {
      const item: {
        slide_index?: number
        data_path?: string
        quote?: string
        comment: string
      } = {
        comment: a.text.trim().slice(0, MAX_COMMENT),
      }
      if (a.dataPath) {
        item.data_path = a.dataPath
        if (a.quote?.trim()) {
          item.quote = a.quote.trim().slice(0, MAX_QUOTE)
        }
      } else {
        item.slide_index = a.pageIndex
        const prefix = formatAnnotationComment(a)
        if (prefix !== a.text.trim()) {
          item.comment = prefix.slice(0, MAX_COMMENT)
        }
      }
      return item
    })
}

/** Merge pin annotations + optional freeform supplement into revision comment. */
export function buildPageComment(
  pageIndex: number,
  annotations: PageAnnotation[],
  supplement: string,
): string {
  const pins = annotations
    .filter((a) => a.pageIndex === pageIndex)
    .map(formatAnnotationLine)
    .filter(Boolean)

  const extra = supplement.trim()
  const parts: string[] = []

  if (pins.length > 0) {
    parts.push(`第 ${pageIndex} 页批注：`, ...pins)
  }
  if (extra) {
    if (parts.length > 0) parts.push(`用户补充：${extra}`)
    else parts.push(extra)
  }

  return parts.join('\n').slice(0, MAX_COMMENT)
}

export function pageHasFeedback(
  pageIndex: number,
  annotations: PageAnnotation[],
  supplement: string,
): boolean {
  return (
    supplement.trim().length > 0 ||
    annotations.some((a) => a.pageIndex === pageIndex && a.text.trim())
  )
}

export function collectRevisionComments(
  slideIndexes: number[],
  annotations: PageAnnotation[],
  supplements: Record<number, string>,
): { slide_index: number; comment: string }[] {
  const allIndexes = new Set(slideIndexes)
  for (const ann of annotations) {
    if (ann.text.trim()) allIndexes.add(ann.pageIndex)
  }
  const out: { slide_index: number; comment: string }[] = []
  for (const idx of Array.from(allIndexes).sort((a, b) => a - b)) {
    const comment = buildPageComment(idx, annotations, supplements[idx] ?? '')
    if (comment.trim()) {
      out.push({ slide_index: idx, comment })
    }
  }
  return out
}
