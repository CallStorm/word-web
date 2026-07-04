import { useCallback, useMemo, useRef, useState } from 'react'
import type { ContentPreset, EditTargetSlide, GlobalRevisionKind } from '../../api/types'
import { type PageAnnotation } from '../../lib/pageAnnotations'
import { GlobalEditPanel } from './GlobalEditPanel'
import { DocumentOutlineSidebar } from './DocumentOutlineSidebar'
import { WordDocumentViewer, type WordDocumentViewerHandle } from './WordDocumentViewer'
import type { DocumentOutlineHeading } from '../../lib/documentOutline'

function ReviewCommentCard({
  ann,
  active,
  onSelect,
  onEdit,
  onDelete,
}: {
  ann: PageAnnotation
  active: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={`rounded-lg border p-3 text-sm transition-colors ${
        active
          ? 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20'
          : 'border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800'
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <p className="mb-1 text-xs font-medium text-slate-500">
          第 {ann.pageIndex} 页
          {ann.dataPath ? ` · ${ann.dataPath}` : ''}
        </p>
        {ann.quote && (
          <p className="mb-2 border-l-2 border-amber-300 pl-2 text-xs italic text-slate-600 dark:text-slate-300">
            「{ann.quote.length > 80 ? `${ann.quote.slice(0, 80)}…` : ann.quote}」
          </p>
        )}
        <p className="text-slate-800 dark:text-slate-100">{ann.text}</p>
      </button>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-gemini-600 hover:underline"
        >
          编辑
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-red-500 hover:underline"
        >
          删除
        </button>
      </div>
    </div>
  )
}

function ReviewCommentPanel({
  pageIndex,
  pageAnnotations,
  activeAnnotationId,
  slides,
  onSelectAnnotation,
  onEditAnnotation,
  onDeleteAnnotation,
  globalKind,
  onGlobalKindChange,
  contentPreset,
  onContentPresetChange,
  contentComment,
  onContentCommentChange,
  customComment,
  onCustomCommentChange,
}: {
  pageIndex: number
  pageAnnotations: PageAnnotation[]
  activeAnnotationId: string | null
  slides: EditTargetSlide[]
  onSelectAnnotation: (id: string | null) => void
  onEditAnnotation: (ann: PageAnnotation) => void
  onDeleteAnnotation: (id: string) => void
  globalKind: GlobalRevisionKind
  onGlobalKindChange: (k: GlobalRevisionKind) => void
  contentPreset: ContentPreset | null
  onContentPresetChange: (v: ContentPreset | null) => void
  contentComment: string
  onContentCommentChange: (v: string) => void
  customComment: string
  onCustomCommentChange: (v: string) => void
}) {
  const allAnnotations = useMemo(
    () =>
      [...pageAnnotations].sort((a, b) =>
        a.pageIndex !== b.pageIndex ? a.pageIndex - b.pageIndex : a.id.localeCompare(b.id),
      ),
    [pageAnnotations],
  )

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700">
        审阅与修改
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          <section className="space-y-3">
            <p className="text-xs text-slate-500">
              选中正文文字添加批注（当前第 {pageIndex} 页）
            </p>

            {allAnnotations.length > 0 ? (
              <div className="space-y-2">
                {allAnnotations.map((ann) => (
                  <ReviewCommentCard
                    key={ann.id}
                    ann={ann}
                    active={activeAnnotationId === ann.id}
                    onSelect={() => onSelectAnnotation(ann.id)}
                    onEdit={() => onEditAnnotation(ann)}
                    onDelete={() => {
                      if (window.confirm('删除这条批注？')) onDeleteAnnotation(ann.id)
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-5 text-center text-xs text-slate-400 dark:border-slate-600">
                暂无批注
              </p>
            )}
          </section>

          <section className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <p className="text-xs font-medium text-slate-500">全局修改（可选，可与批注一并提交）</p>
            <GlobalEditPanel
              slides={slides}
              kind={globalKind}
              onKindChange={onGlobalKindChange}
              contentPreset={contentPreset}
              onContentPresetChange={onContentPresetChange}
              contentComment={contentComment}
              onContentCommentChange={onContentCommentChange}
              customComment={customComment}
              onCustomCommentChange={onCustomCommentChange}
            />
          </section>
        </div>
      </div>
    </aside>
  )
}

export function DocumentReviewLayout({
  slides,
  currentIndex,
  onCurrentIndexChange,
  documentHtmlUrl,
  documentOutline,
  annotations,
  onAnnotationsChange,
  globalKind,
  onGlobalKindChange,
  contentPreset,
  onContentPresetChange,
  contentComment,
  onContentCommentChange,
  customComment,
  onCustomCommentChange,
}: {
  slides: EditTargetSlide[]
  currentIndex: number
  onCurrentIndexChange: (i: number) => void
  documentHtmlUrl: string | null
  documentOutline: DocumentOutlineHeading[]
  annotations: PageAnnotation[]
  onAnnotationsChange: (next: PageAnnotation[]) => void
  globalKind: GlobalRevisionKind
  onGlobalKindChange: (k: GlobalRevisionKind) => void
  contentPreset: ContentPreset | null
  onContentPresetChange: (v: ContentPreset | null) => void
  contentComment: string
  onContentCommentChange: (v: string) => void
  customComment: string
  onCustomCommentChange: (v: string) => void
}) {
  const viewerRef = useRef<WordDocumentViewerHandle>(null)
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [activeDataPath, setActiveDataPath] = useState<string | null>(null)

  const slide = slides[currentIndex]
  const pageIndex = slide?.index ?? currentIndex + 1

  const annotatedPages = useMemo(() => {
    const set = new Set<number>()
    for (const ann of annotations) {
      if (ann.text.trim()) set.add(ann.pageIndex)
    }
    return set
  }, [annotations])

  const handlePageFromViewer = useCallback(
    (viewerPageIndex: number) => {
      const listIndex = slides.findIndex((s) => s.index === viewerPageIndex)
      if (listIndex >= 0 && listIndex !== currentIndex) {
        onCurrentIndexChange(listIndex)
      }
    },
    [slides, currentIndex, onCurrentIndexChange],
  )

  const handleJumpToPage = useCallback(
    (listIndex: number) => {
      onCurrentIndexChange(listIndex)
      const idx = slides[listIndex]?.index
      if (idx != null) {
        viewerRef.current?.scrollToPage(idx)
      }
    },
    [onCurrentIndexChange, slides],
  )

  const addAnnotation = (ann: PageAnnotation) => {
    onAnnotationsChange([...annotations, ann])
    setActiveAnnotationId(ann.id)
  }

  const updateAnnotation = (id: string, text: string) => {
    onAnnotationsChange(annotations.map((a) => (a.id === id ? { ...a, text } : a)))
  }

  const deleteAnnotation = (id: string) => {
    onAnnotationsChange(annotations.filter((a) => a.id !== id))
    if (activeAnnotationId === id) setActiveAnnotationId(null)
  }

  const handleSelectAnnotation = (id: string | null) => {
    setActiveAnnotationId(id)
    if (!id) return
    const ann = annotations.find((a) => a.id === id)
    if (!ann) return
    if (ann.dataPath) setActiveDataPath(ann.dataPath)
    const listIndex = slides.findIndex((s) => s.index === ann.pageIndex)
    if (listIndex >= 0) onCurrentIndexChange(listIndex)
  }

  const handleSelectHeading = useCallback((heading: DocumentOutlineHeading) => {
    setActiveDataPath(heading.data_path)
    viewerRef.current?.scrollToDataPath(heading.data_path)
  }, [])

  return (
    <div className="flex min-h-[calc(100vh-12rem)] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <DocumentOutlineSidebar
        headings={documentOutline}
        slides={slides}
        currentIndex={currentIndex}
        annotatedPages={annotatedPages}
        activeDataPath={activeDataPath}
        onSelectHeading={handleSelectHeading}
        onSelectPage={handleJumpToPage}
      />
      <WordDocumentViewer
        ref={viewerRef}
        documentHtmlUrl={documentHtmlUrl}
        outlineHeadings={documentOutline}
        annotations={annotations}
        activeAnnotationId={activeAnnotationId}
        onPageChange={handlePageFromViewer}
        onActiveDataPathChange={setActiveDataPath}
        onAddAnnotation={addAnnotation}
        onUpdateAnnotation={updateAnnotation}
        onSelectAnnotation={handleSelectAnnotation}
      />
      <ReviewCommentPanel
        pageIndex={pageIndex}
        pageAnnotations={annotations}
        activeAnnotationId={activeAnnotationId}
        slides={slides}
        onSelectAnnotation={handleSelectAnnotation}
        onEditAnnotation={(ann) => viewerRef.current?.startEdit(ann)}
        onDeleteAnnotation={deleteAnnotation}
        globalKind={globalKind}
        onGlobalKindChange={onGlobalKindChange}
        contentPreset={contentPreset}
        onContentPresetChange={onContentPresetChange}
        contentComment={contentComment}
        onContentCommentChange={onContentCommentChange}
        customComment={customComment}
        onCustomCommentChange={onCustomCommentChange}
      />
    </div>
  )
}
