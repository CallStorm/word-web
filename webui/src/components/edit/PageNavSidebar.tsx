import type { EditTargetSlide } from '../../api/types'
import { AuthenticatedSlideImage } from '../jobs/AuthenticatedSlideImage'

export function PageNavSidebar({
  slides,
  currentIndex,
  annotatedPages,
  onSelect,
}: {
  slides: EditTargetSlide[]
  currentIndex: number
  annotatedPages: Set<number>
  onSelect: (index: number) => void
}) {
  if (slides.length === 0) {
    return (
      <aside className="flex w-28 shrink-0 flex-col border-r border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/50">
        <p className="text-center text-xs text-slate-400">无预览页</p>
      </aside>
    )
  }

  return (
    <aside className="flex w-28 shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="border-b border-slate-200 px-2 py-2 text-xs font-medium text-slate-500 dark:border-slate-700">
        页面
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-2">
          {slides.map((sl, i) => {
            const active = i === currentIndex
            const hasNote = annotatedPages.has(sl.index)
            return (
              <li key={sl.index}>
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  className={`relative w-full overflow-hidden rounded border transition ${
                    active
                      ? 'border-gemini-500 ring-1 ring-gemini-500'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-600'
                  }`}
                  title={`第 ${sl.index} 页`}
                >
                  <AuthenticatedSlideImage
                    url={sl.image_url}
                    alt={`第 ${sl.index} 页`}
                    className="aspect-[4/3] w-full object-cover object-top"
                  />
                  <span className="absolute bottom-0 left-0 bg-black/60 px-1 text-[10px] text-white">
                    {sl.index}
                  </span>
                  {hasNote && (
                    <span
                      className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400"
                      title="有批注"
                    />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
