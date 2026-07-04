import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  computeToolbarPosition,
  getSelectionClientRect,
  observeVisibleHeading,
  observeVisiblePage,
  scrollToDataPath,
  scrollToPage as scrollToPageInDoc,
  selectionAnchor,
  type TextSelectionAnchor,
} from '../../lib/wordDocumentDom'
import type { DocumentOutlineHeading } from '../../lib/documentOutline'

export type TemplateDocumentViewerHandle = {
  scrollToPage: (pageIndex: number) => void
  scrollToDataPath: (dataPath: string) => void
}

export const TemplateDocumentViewer = forwardRef<
  TemplateDocumentViewerHandle,
  {
    documentHtmlUrl: string | null
    outlineHeadings: DocumentOutlineHeading[]
    slotKeys: string[]
    readOnly?: boolean
    onPageChange?: (pageIndex: number) => void
    onActiveDataPathChange?: (dataPath: string | null) => void
    onMarkVariable?: (anchor: TextSelectionAnchor) => void
  }
>(function TemplateDocumentViewer(
  {
    documentHtmlUrl,
    outlineHeadings,
    slotKeys,
    readOnly = false,
    onPageChange,
    onActiveDataPathChange,
    onMarkVariable,
  },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [selectionBtn, setSelectionBtn] = useState<{ x: number; y: number } | null>(null)
  const savedAnchorRef = useRef<TextSelectionAnchor | null>(null)

  const getDoc = useCallback((): Document | null => {
    return iframeRef.current?.contentDocument ?? null
  }, [])

  const syncIframeHeight = useCallback(() => {
    const doc = getDoc()
    const iframe = iframeRef.current
    if (!doc || !iframe) return
    const height = Math.max(
      doc.documentElement.scrollHeight,
      doc.body?.scrollHeight ?? 0,
      doc.documentElement.offsetHeight,
      doc.body?.offsetHeight ?? 0,
    )
    iframe.style.height = `${height}px`
  }, [getDoc])

  useImperativeHandle(ref, () => ({
    scrollToPage(pageIndex: number) {
      const doc = getDoc()
      if (doc) scrollToPageInDoc(doc, pageIndex)
    },
    scrollToDataPath(dataPath: string) {
      const doc = getDoc()
      if (doc) scrollToDataPath(doc, dataPath)
    },
  }))

  const highlightPlaceholders = useCallback(() => {
    const doc = getDoc()
    if (!doc) return
    const styleId = 'ww-slot-highlight-style'
    if (!doc.getElementById(styleId)) {
      const style = doc.createElement('style')
      style.id = styleId
      style.textContent = `
        .ww-slot-placeholder {
          background: rgba(250, 204, 21, 0.35);
          border-radius: 2px;
          padding: 0 1px;
        }
      `
      doc.head?.appendChild(style)
    }
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    const pattern = /\{\{([a-z][a-z0-9_]{0,31})\}\}/g
    const nodes: Text[] = []
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      if (node.nodeValue && pattern.test(node.nodeValue)) {
        nodes.push(node)
      }
      pattern.lastIndex = 0
    }
    for (const node of nodes) {
      const text = node.nodeValue || ''
      if (!/\{\{[a-z][a-z0-9_]{0,31}\}\}/.test(text)) continue
      const span = doc.createElement('span')
      span.innerHTML = text.replace(
        /\{\{([a-z][a-z0-9_]{0,31})\}\}/g,
        '<mark class="ww-slot-placeholder">{{$1}}</mark>',
      )
      node.parentNode?.replaceChild(span, node)
    }
    void slotKeys
  }, [getDoc, slotKeys])

  useEffect(() => {
    setLoaded(false)
    setSelectionBtn(null)
    savedAnchorRef.current = null
  }, [documentHtmlUrl])

  useEffect(() => {
    if (!loaded) return
    const doc = getDoc()
    const iframe = iframeRef.current
    if (!doc || !iframe) return

    syncIframeHeight()
    highlightPlaceholders()

    const onMouseUp = () => {
      if (readOnly || !onMarkVariable) {
        setSelectionBtn(null)
        return
      }
      const anchor = selectionAnchor(doc)
      if (!anchor) {
        setSelectionBtn(null)
        savedAnchorRef.current = null
        return
      }
      if (/\{\{[a-z][a-z0-9_]{0,31}\}\}/.test(anchor.quote)) {
        setSelectionBtn(null)
        savedAnchorRef.current = null
        return
      }
      savedAnchorRef.current = anchor
      const selRect = getSelectionClientRect(doc, iframe, zoom)
      if (!selRect) {
        setSelectionBtn(null)
        return
      }
      setSelectionBtn(computeToolbarPosition(selRect))
    }

    doc.addEventListener('mouseup', onMouseUp)
    const cleanupPageObserver = onPageChange ? observeVisiblePage(doc, onPageChange) : () => {}
    const outlinePaths = outlineHeadings.map((h) => h.data_path)
    const cleanupHeadingObserver =
      onActiveDataPathChange && outlinePaths.length > 0
        ? observeVisibleHeading(doc, outlinePaths, onActiveDataPathChange)
        : () => {}

    return () => {
      doc.removeEventListener('mouseup', onMouseUp)
      cleanupPageObserver()
      cleanupHeadingObserver()
    }
  }, [
    getDoc,
    highlightPlaceholders,
    loaded,
    onActiveDataPathChange,
    onMarkVariable,
    onPageChange,
    outlineHeadings,
    readOnly,
    syncIframeHeight,
    zoom,
  ])

  const openMarkDialog = () => {
    const anchor = savedAnchorRef.current
    if (!anchor || !onMarkVariable) return
    setSelectionBtn(null)
    onMarkVariable(anchor)
    savedAnchorRef.current = null
    getDoc()?.defaultView?.getSelection()?.removeAllRanges()
  }

  if (!documentHtmlUrl) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-slate-100 p-8 text-sm text-slate-500 dark:bg-slate-800/60">
        文档预览生成中…
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-slate-100 dark:bg-slate-800/60">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700">
        <span>
          {readOnly
            ? '内置模板只读预览'
            : loaded
              ? '选中文字后点击「标记为变量」'
              : '加载文档…'}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(1)))}
            className="rounded px-2 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
            aria-label="缩小"
          >
            −
          </button>
          <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(1)))}
            className="rounded px-2 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
            aria-label="放大"
          >
            +
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto p-4">
        <div
          className="mx-auto origin-top transition-transform"
          style={{ transform: `scale(${zoom})`, width: `${100 / zoom}%` }}
        >
          <iframe
            ref={iframeRef}
            src={documentHtmlUrl}
            title="模板预览"
            className="w-full border-0 bg-transparent"
            onLoad={() => setLoaded(true)}
          />
        </div>

        {selectionBtn &&
          createPortal(
            <button
              type="button"
              className="fixed z-[200] rounded-md bg-gemini-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg ring-1 ring-black/10"
              style={{ left: selectionBtn.x, top: selectionBtn.y }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={openMarkDialog}
            >
              标记为变量
            </button>,
            document.body,
          )}
      </div>
    </div>
  )
})
