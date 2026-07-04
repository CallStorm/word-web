import { useCallback, useRef, useState } from 'react'
import type { EditTargetSlide } from '../../api/types'
import type { TemplateSlot } from '../../api/types'
import { DocumentOutlineSidebar } from '../edit/DocumentOutlineSidebar'
import {
  TemplateDocumentViewer,
  type TemplateDocumentViewerHandle,
} from './TemplateDocumentViewer'
import { TemplateSlotPanel } from './TemplateSlotPanel'
import type { DocumentOutlineHeading } from '../../lib/documentOutline'
import type { TextSelectionAnchor } from '../../lib/wordDocumentDom'

export function TemplateEditLayout({
  documentHtmlUrl,
  documentOutline,
  slides,
  slots,
  dirty,
  readOnly,
  onMarkVariable,
  onRemoveSlot,
  onMoveSlotUp,
  onMoveSlotDown,
}: {
  documentHtmlUrl: string | null
  documentOutline: DocumentOutlineHeading[]
  slides: EditTargetSlide[]
  slots: TemplateSlot[]
  dirty: boolean
  readOnly?: boolean
  onMarkVariable?: (anchor: TextSelectionAnchor) => void
  onRemoveSlot: (key: string) => void
  onMoveSlotUp: (index: number) => void
  onMoveSlotDown: (index: number) => void
}) {
  const viewerRef = useRef<TemplateDocumentViewerHandle>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [activeDataPath, setActiveDataPath] = useState<string | null>(null)

  const handlePageFromViewer = useCallback(
    (viewerPageIndex: number) => {
      const listIndex = slides.findIndex((s) => s.index === viewerPageIndex)
      if (listIndex >= 0 && listIndex !== currentIndex) {
        setCurrentIndex(listIndex)
      }
    },
    [slides, currentIndex],
  )

  const handleJumpToPage = useCallback(
    (listIndex: number) => {
      setCurrentIndex(listIndex)
      const idx = slides[listIndex]?.index
      if (idx != null) {
        viewerRef.current?.scrollToPage(idx)
      }
    },
    [slides],
  )

  const handleSelectHeading = useCallback((heading: DocumentOutlineHeading) => {
    setActiveDataPath(heading.data_path)
    viewerRef.current?.scrollToDataPath(heading.data_path)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <DocumentOutlineSidebar
        headings={documentOutline}
        slides={slides}
        currentIndex={currentIndex}
        annotatedPages={new Set()}
        activeDataPath={activeDataPath}
        onSelectHeading={handleSelectHeading}
        onSelectPage={handleJumpToPage}
      />
      <TemplateDocumentViewer
        ref={viewerRef}
        documentHtmlUrl={documentHtmlUrl}
        outlineHeadings={documentOutline}
        slotKeys={slots.map((s) => s.key)}
        readOnly={readOnly}
        onPageChange={handlePageFromViewer}
        onActiveDataPathChange={setActiveDataPath}
        onMarkVariable={readOnly ? undefined : onMarkVariable}
      />
      <aside className="flex min-h-0 w-[320px] shrink-0 flex-col border-l border-slate-200 dark:border-slate-700">
        <TemplateSlotPanel
          slots={slots}
          dirty={dirty}
          readOnly={readOnly}
          onRemove={onRemoveSlot}
          onMoveUp={onMoveSlotUp}
          onMoveDown={onMoveSlotDown}
        />
      </aside>
    </div>
  )
}
