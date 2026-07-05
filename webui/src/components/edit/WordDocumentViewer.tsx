import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { newAnnotationId, type PageAnnotation } from '../../lib/pageAnnotations'
import type { DocumentOutlineHeading } from '../../lib/documentOutline'
import {
  applyAllHighlights,
  computePopoverPosition,
  computeToolbarPosition,
  getSelectionClientRect,
  observeVisibleHeading,
  observeVisiblePage,
  scheduleWordDocumentReflow,
  scrollToAnnotation,
  scrollToDataPath,
  scrollToPage as scrollToPageInDoc,
  selectionAnchor,
  setActiveHighlight,
  wireTocNavigation,
  wrapRangeWithHighlight,
} from '../../lib/wordDocumentDom'
import { AnnotationPopover } from './AnnotationPopover'

type PendingComment = {
  pageIndex: number
  dataPath: string | null
  quote: string
  clientX: number
  clientY: number
  editId?: string
  initialText?: string
}

export type WordDocumentViewerHandle = {
  startEdit: (ann: PageAnnotation) => void
  scrollToPage: (pageIndex: number) => void
  scrollToDataPath: (dataPath: string) => void
}

export const WordDocumentViewer = forwardRef<
  WordDocumentViewerHandle,
  {
    documentHtmlUrl: string | null
    outlineHeadings: DocumentOutlineHeading[]
    annotations: PageAnnotation[]
    activeAnnotationId: string | null
    onPageChange: (pageIndex: number) => void
    onActiveDataPathChange: (dataPath: string | null) => void
    onAddAnnotation: (ann: PageAnnotation) => void
    onUpdateAnnotation: (id: string, text: string) => void
    onSelectAnnotation: (id: string | null) => void
  }
>(function WordDocumentViewer(
  {
    documentHtmlUrl,
    outlineHeadings,
    annotations,
    activeAnnotationId,
    onPageChange,
    onActiveDataPathChange,
    onAddAnnotation,
    onUpdateAnnotation,
    onSelectAnnotation,
  },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pending, setPending] = useState<PendingComment | null>(null)
  const [selectionBtn, setSelectionBtn] = useState<{ x: number; y: number } | null>(null)

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
    startEdit(ann: PageAnnotation) {
      setPending({
        pageIndex: ann.pageIndex,
        dataPath: ann.dataPath ?? null,
        quote: ann.quote ?? '',
        clientX: 24,
        clientY: 80,
        editId: ann.id,
        initialText: ann.text,
      })
    },
    scrollToPage(pageIndex: number) {
      const doc = getDoc()
      if (doc) scrollToPageInDoc(doc, pageIndex)
    },
    scrollToDataPath(dataPath: string) {
      const doc = getDoc()
      if (doc) scrollToDataPath(doc, dataPath)
    },
  }))

  useEffect(() => {
    setLoaded(false)
    setSelectionBtn(null)
    setPending(null)
  }, [documentHtmlUrl])

  useEffect(() => {
    if (!loaded) return
    const doc = getDoc()
    const iframe = iframeRef.current
    if (!doc || !iframe) return

    syncIframeHeight()

    const onMouseUp = () => {
      const anchor = selectionAnchor(doc)
      if (!anchor) {
        setSelectionBtn(null)
        savedRangeRef.current = null
        return
      }
      const sel = doc.defaultView?.getSelection()
      if (sel && sel.rangeCount > 0) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange()
      }
      const selRect = getSelectionClientRect(doc, iframe, zoom)
      if (!selRect) {
        setSelectionBtn(null)
        return
      }
      setSelectionBtn(computeToolbarPosition(selRect))
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      const mark = target?.closest('mark.ww-comment-highlight')
      if (mark) {
        const id = mark.getAttribute('data-ann-id')
        if (id) onSelectAnnotation(id)
        return
      }
      if (!target?.closest('.ww-popover')) {
        onSelectAnnotation(null)
      }
    }

    doc.addEventListener('mouseup', onMouseUp)
    doc.addEventListener('click', onClick)
    const cleanupPageObserver = observeVisiblePage(doc, onPageChange)
    const outlinePaths = outlineHeadings.map((h) => h.data_path)
    const cleanupHeadingObserver =
      outlinePaths.length > 0
        ? observeVisibleHeading(doc, outlinePaths, onActiveDataPathChange)
        : () => {}
    const scrollRoot = scrollRootRef.current
    const cleanupToc =
      scrollRoot != null
        ? wireTocNavigation(doc, iframe, scrollRoot, zoom)
        : () => {}

    return () => {
      doc.removeEventListener('mouseup', onMouseUp)
      doc.removeEventListener('click', onClick)
      cleanupPageObserver()
      cleanupHeadingObserver()
      cleanupToc()
    }
  }, [loaded, getDoc, onPageChange, onActiveDataPathChange, onSelectAnnotation, outlineHeadings, syncIframeHeight, zoom])

  useEffect(() => {
    const doc = getDoc()
    if (!doc || !loaded) return
    applyAllHighlights(doc, annotations)
  }, [annotations, getDoc, loaded])

  useEffect(() => {
    const doc = getDoc()
    if (!doc || !loaded) return
    setActiveHighlight(doc, activeAnnotationId)
    if (activeAnnotationId) {
      const ann = annotations.find((a) => a.id === activeAnnotationId)
      if (ann) scrollToAnnotation(doc, ann)
    }
  }, [activeAnnotationId, annotations, getDoc, loaded])

  const openAddComment = () => {
    const doc = getDoc()
    const iframe = iframeRef.current
    if (!doc || !iframe) return
    const anchor = selectionAnchor(doc)
    if (!anchor) return
    const selRect = getSelectionClientRect(doc, iframe, zoom)
    setSelectionBtn(null)
    const popoverPos = selRect
      ? computePopoverPosition(selRect)
      : { x: 24, y: 80 }
    setPending({
      ...anchor,
      clientX: popoverPos.x,
      clientY: popoverPos.y,
    })
  }

  const savePending = (text: string) => {
    if (!pending) return
    const doc = getDoc()

    if (pending.editId) {
      onUpdateAnnotation(pending.editId, text)
      setPending(null)
      return
    }

    const ann: PageAnnotation = {
      id: newAnnotationId(),
      pageIndex: pending.pageIndex,
      dataPath: pending.dataPath ?? undefined,
      quote: pending.quote,
      text,
    }

    if (doc && savedRangeRef.current) {
      wrapRangeWithHighlight(doc, savedRangeRef.current, ann.id)
      savedRangeRef.current = null
      doc.defaultView?.getSelection()?.removeAllRanges()
    }

    onAddAnnotation(ann)
    setPending(null)
  }

  if (!documentHtmlUrl) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-slate-100 p-8 text-sm text-slate-500 dark:bg-slate-800/60">
        文档预览生成中，可在右侧填写文字修改意见
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-slate-100 dark:bg-slate-800/60">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700">
        <span>{loaded ? '选中文字后点击「添加批注」' : '加载文档…'}</span>
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

      <div ref={scrollRootRef} className="relative min-h-0 flex-1 overflow-auto p-4">
        <div
          className="mx-auto origin-top transition-transform"
          style={{ transform: `scale(${zoom})`, width: `${100 / zoom}%` }}
        >
          <iframe
            ref={iframeRef}
            src={documentHtmlUrl}
            title="文档预览"
            className="w-full border-0 bg-transparent"
            onLoad={() => {
              const doc = iframeRef.current?.contentDocument ?? null
              scheduleWordDocumentReflow(doc)
              syncIframeHeight()
              setLoaded(true)
            }}
          />
        </div>

        {selectionBtn &&
          createPortal(
            <button
              type="button"
              className="fixed z-[200] rounded-md bg-gemini-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg ring-1 ring-black/10"
              style={{ left: selectionBtn.x, top: selectionBtn.y }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={openAddComment}
            >
              添加批注
            </button>,
            document.body,
          )}

        {pending &&
          createPortal(
            <div className="ww-popover fixed z-[200]" style={{ left: pending.clientX, top: pending.clientY }}>
              <AnnotationPopover
                x={0}
                y={0}
                initialText={pending.initialText ?? ''}
                onSave={savePending}
                onCancel={() => setPending(null)}
              />
            </div>,
            document.body,
          )}
      </div>
    </div>
  )
})
