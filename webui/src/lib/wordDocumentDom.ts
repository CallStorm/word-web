import type { PageAnnotation } from './pageAnnotations'

const HIGHLIGHT_CLASS = 'ww-comment-highlight'

export type TextSelectionAnchor = {
  pageIndex: number
  dataPath: string | null
  quote: string
}

export function injectHighlightStyles(doc: Document) {
  if (doc.getElementById('ww-comment-styles')) return
  const style = doc.createElement('style')
  style.id = 'ww-comment-styles'
  style.textContent = `
    mark.${HIGHLIGHT_CLASS} {
      background: #fff2cc;
      border-bottom: 2px solid #f4b400;
      cursor: pointer;
      padding: 0 1px;
    }
    mark.${HIGHLIGHT_CLASS}.ww-active {
      background: #ffe599;
      outline: 2px solid #f4b400;
    }
  `
  doc.head.appendChild(style)
}

function findAttr(node: Node | null, attr: string): string | null {
  let el: Element | null =
    node instanceof Element ? node : node?.parentElement ?? null
  while (el) {
    const value = el.getAttribute(attr)
    if (value) return value
    el = el.parentElement
  }
  return null
}

export function selectionAnchor(doc: Document): TextSelectionAnchor | null {
  const sel = doc.defaultView?.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const quote = sel.toString().trim()
  if (!quote) return null

  const range = sel.getRangeAt(0)
  const pageRaw = findAttr(range.startContainer, 'data-page')
  const pageIndex = pageRaw ? parseInt(pageRaw, 10) : 1
  const dataPath = findAttr(range.startContainer, 'data-path')

  return {
    pageIndex: Number.isFinite(pageIndex) && pageIndex > 0 ? pageIndex : 1,
    dataPath,
    quote: quote.slice(0, 200),
  }
}

/** Map iframe-local selection rect to top-level viewport coordinates. */
export function getSelectionClientRect(
  doc: Document,
  iframe: HTMLIFrameElement,
  zoom = 1,
): DOMRect | null {
  const sel = doc.defaultView?.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const rects = sel.getRangeAt(0).getClientRects()
  if (rects.length === 0) return null
  const local = rects[rects.length - 1]
  const iframeRect = iframe.getBoundingClientRect()
  return new DOMRect(
    iframeRect.left + local.left * zoom,
    iframeRect.top + local.top * zoom,
    local.width * zoom,
    local.height * zoom,
  )
}

/** Place a small toolbar beside the selection, clamped to the viewport. */
export function computeToolbarPosition(
  selRect: DOMRect,
  toolbar = { width: 88, height: 32 },
): { x: number; y: number } {
  const gap = 8
  const maxX = window.innerWidth - toolbar.width - gap
  const maxY = window.innerHeight - toolbar.height - gap

  let x = selRect.right + gap
  let y = selRect.top + Math.max(0, (selRect.height - toolbar.height) / 2)

  if (x > maxX) {
    x = selRect.left - toolbar.width - gap
  }
  if (x < gap) {
    x = Math.min(selRect.left, maxX)
  }

  if (y > maxY) {
    y = selRect.bottom + gap
  }
  if (y > maxY) {
    y = selRect.top - toolbar.height - gap
  }

  return {
    x: Math.max(gap, Math.min(x, maxX)),
    y: Math.max(gap, Math.min(y, maxY)),
  }
}

export function computePopoverPosition(
  selRect: DOMRect,
  popover = { width: 288, height: 140 },
): { x: number; y: number } {
  const gap = 8
  const maxX = window.innerWidth - popover.width - gap
  const maxY = window.innerHeight - popover.height - gap

  let x = selRect.left
  let y = selRect.bottom + gap

  if (y > maxY) {
    y = selRect.top - popover.height - gap
  }

  return {
    x: Math.max(gap, Math.min(x, maxX)),
    y: Math.max(gap, Math.min(y, maxY)),
  }
}

export function wrapRangeWithHighlight(
  doc: Document,
  range: Range,
  annId: string,
): boolean {
  const mark = doc.createElement('mark')
  mark.className = HIGHLIGHT_CLASS
  mark.dataset.annId = annId

  try {
    range.surroundContents(mark)
    return true
  } catch {
    try {
      const fragment = range.extractContents()
      mark.appendChild(fragment)
      range.insertNode(mark)
      return true
    } catch {
      return false
    }
  }
}

function highlightTextInElement(el: Element, quote: string, annId: string, doc: Document) {
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? ''
    const idx = text.indexOf(quote)
    if (idx < 0) continue
    const range = doc.createRange()
    range.setStart(node, idx)
    range.setEnd(node, idx + quote.length)
    wrapRangeWithHighlight(doc, range, annId)
    return
  }
}

export function applyAnnotationHighlight(doc: Document, ann: PageAnnotation) {
  if (doc.querySelector(`mark[data-ann-id="${ann.id}"]`)) return

  if (ann.dataPath) {
    const el = doc.querySelector(`[data-path="${CSS.escape(ann.dataPath)}"]`)
    if (!el) return
    const quote = ann.quote?.trim()
    if (quote) {
      highlightTextInElement(el, quote, ann.id, doc)
    } else {
      const range = doc.createRange()
      range.selectNodeContents(el)
      wrapRangeWithHighlight(doc, range, ann.id)
    }
    return
  }
}

export function applyAllHighlights(doc: Document, annotations: PageAnnotation[]) {
  injectHighlightStyles(doc)
  for (const ann of annotations) {
    if (ann.text.trim()) applyAnnotationHighlight(doc, ann)
  }
}

export function setActiveHighlight(doc: Document, annId: string | null) {
  doc.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`).forEach((el) => {
    el.classList.toggle('ww-active', annId != null && el.getAttribute('data-ann-id') === annId)
  })
}

export function scrollToAnnotation(doc: Document, ann: PageAnnotation) {
  const mark = doc.querySelector(`mark[data-ann-id="${ann.id}"]`)
  if (mark) {
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  if (ann.dataPath) {
    doc.querySelector(`[data-path="${CSS.escape(ann.dataPath)}"]`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
    return
  }
  scrollToPage(doc, ann.pageIndex)
}

export function scrollToPage(doc: Document, pageIndex: number) {
  const page = doc.querySelector(`.page[data-page="${pageIndex}"]`)
  page?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function scrollToDataPath(doc: Document, dataPath: string) {
  doc.querySelector(`[data-path="${CSS.escape(dataPath)}"]`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

export function observeVisibleHeading(
  doc: Document,
  dataPaths: string[],
  onActive: (dataPath: string | null) => void,
): () => void {
  const elements = dataPaths
    .map((path) => doc.querySelector(`[data-path="${CSS.escape(path)}"]`))
    .filter((el): el is Element => !!el)
  if (elements.length === 0) return () => {}

  let current: string | null = null
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible.length === 0) return
      const path = visible[0].target.getAttribute('data-path')
      if (path && path !== current) {
        current = path
        onActive(path)
      }
    },
    { root: null, threshold: 0, rootMargin: '-15% 0px -70% 0px' },
  )
  elements.forEach((el) => observer.observe(el))
  return () => observer.disconnect()
}

export function observeVisiblePage(
  doc: Document,
  onPage: (pageIndex: number) => void,
): () => void {
  const pages = Array.from(doc.querySelectorAll('.page[data-page]'))
  if (pages.length === 0) return () => {}

  let current = 1
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
      if (visible.length === 0) return
      const page = visible[0].target.getAttribute('data-page')
      const idx = page ? parseInt(page, 10) : current
      if (Number.isFinite(idx) && idx > 0 && idx !== current) {
        current = idx
        onPage(idx)
      }
    },
    { root: null, threshold: [0.25, 0.5, 0.75] },
  )
  pages.forEach((p) => observer.observe(p))
  return () => observer.disconnect()
}
