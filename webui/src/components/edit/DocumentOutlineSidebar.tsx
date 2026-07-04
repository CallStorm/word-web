import { useMemo, useState } from 'react'
import type { EditTargetSlide } from '../../api/types'
import {
  buildOutlineTree,
  type DocumentOutlineHeading,
  type OutlineTreeNode,
} from '../../lib/documentOutline'

function OutlineTreeItem({
  node,
  depth,
  activeDataPath,
  expanded,
  onToggle,
  onSelect,
}: {
  node: OutlineTreeNode
  depth: number
  activeDataPath: string | null
  expanded: Set<string>
  onToggle: (dataPath: string) => void
  onSelect: (heading: DocumentOutlineHeading) => void
}) {
  const hasChildren = node.children.length > 0
  const isOpen = expanded.has(node.data_path)
  const active = activeDataPath === node.data_path

  return (
    <li>
      <div
        className="flex min-w-0 items-start gap-0.5"
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.data_path)}
            className="mt-0.5 shrink-0 rounded p-0.5 text-[10px] text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            aria-label={isOpen ? '折叠' : '展开'}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="mt-0.5 inline-block w-4 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node)}
          title={node.text}
          className={`min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-xs leading-snug ${
            active
              ? 'bg-gemini-100 font-medium text-gemini-700 dark:bg-gemini-900/40 dark:text-gemini-300'
              : 'text-slate-700 hover:bg-slate-200/80 dark:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          {node.text}
        </button>
      </div>
      {hasChildren && isOpen && (
        <ul>
          {node.children.map((child) => (
            <OutlineTreeItem
              key={child.data_path}
              node={child}
              depth={depth + 1}
              activeDataPath={activeDataPath}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function PageFallbackList({
  slides,
  currentIndex,
  annotatedPages,
  onSelectPage,
}: {
  slides: EditTargetSlide[]
  currentIndex: number
  annotatedPages: Set<number>
  onSelectPage: (index: number) => void
}) {
  return (
    <ul className="space-y-0.5">
      {slides.map((sl, i) => (
        <li key={sl.index}>
          <button
            type="button"
            onClick={() => onSelectPage(i)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
              i === currentIndex
                ? 'bg-gemini-100 font-medium text-gemini-700 dark:bg-gemini-900/40 dark:text-gemini-300'
                : 'text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <span>第 {sl.index} 页</span>
            {annotatedPages.has(sl.index) && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="有批注" />
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function DocumentOutlineSidebar({
  headings,
  slides,
  currentIndex,
  annotatedPages,
  activeDataPath,
  onSelectHeading,
  onSelectPage,
}: {
  headings: DocumentOutlineHeading[]
  slides: EditTargetSlide[]
  currentIndex: number
  annotatedPages: Set<number>
  activeDataPath: string | null
  onSelectHeading: (heading: DocumentOutlineHeading) => void
  onSelectPage: (index: number) => void
}) {
  const tree = useMemo(() => buildOutlineTree(headings), [headings])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(headings.map((h) => h.data_path)))

  const toggle = (dataPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(dataPath)) next.delete(dataPath)
      else next.add(dataPath)
      return next
    })
  }

  const hasOutline = tree.length > 0

  return (
    <aside className="flex min-h-0 w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700">
        导航
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {hasOutline ? (
          <ul className="space-y-0.5">
            {tree.map((node) => (
              <OutlineTreeItem
                key={node.data_path}
                node={node}
                depth={0}
                activeDataPath={activeDataPath}
                expanded={expanded}
                onToggle={toggle}
                onSelect={onSelectHeading}
              />
            ))}
          </ul>
        ) : slides.length > 0 ? (
          <>
            <p className="mb-2 px-1 text-[11px] text-slate-400">文档无标题大纲，按页浏览</p>
            <PageFallbackList
              slides={slides}
              currentIndex={currentIndex}
              annotatedPages={annotatedPages}
              onSelectPage={onSelectPage}
            />
          </>
        ) : (
          <p className="px-1 text-center text-xs text-slate-400">暂无导航</p>
        )}
      </div>
    </aside>
  )
}
