import { DOCUMENT_COVER_CLASS, JOB_CARD_CLASS, JOB_CARD_FOOTER_CLASS } from '../../lib/documentAspect'

/** Loading placeholder matching JobCard's grid cell shape. */
export function SkeletonCard() {
  return (
    <div className={JOB_CARD_CLASS}>
      <div className={`${DOCUMENT_COVER_CLASS} skeleton-shimmer`} />
      <div className={JOB_CARD_FOOTER_CLASS}>
        <div className="skeleton-shimmer h-3.5 w-2/3 rounded" />
      </div>
    </div>
  )
}
