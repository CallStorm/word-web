/** A4 portrait ratio for Word document thumbnails. */
export const DOCUMENT_ASPECT_CLASS = 'aspect-[210/297]'

/** Full-bleed cover on job cards (no outer pad / paper frame). */
export const DOCUMENT_COVER_CLASS = `${DOCUMENT_ASPECT_CLASS} relative w-full overflow-hidden rounded-t-sm bg-white dark:bg-[#1b1a19]`

/** Zoom/crop legacy landscape PNGs so page content fills the card. */
export const DOCUMENT_PREVIEW_IMG_CLASS =
  'absolute inset-0 h-full w-full object-cover object-[center_15%] scale-[1.35] origin-top'

/** Compact job card shell (shadow, no border). */
export const JOB_CARD_CLASS =
  'group relative overflow-hidden rounded-sm bg-office-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:bg-[#292827]'

export const JOB_CARD_FOOTER_CLASS =
  'flex items-center gap-1.5 border-t border-office-border/50 px-2 py-1'
