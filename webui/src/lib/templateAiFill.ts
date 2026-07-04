export type TemplateAiFillResult = {
  template_data: Record<string, string>
  filled_keys?: string[]
  missing_keys?: string[]
}

/** Merge AI fill result into existing slot values (only overwrite returned keys). */
export function mergeTemplateSlotValues(
  current: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  const next = { ...current }
  for (const [key, val] of Object.entries(incoming)) {
    if (val.trim()) next[key] = val.trim()
  }
  return next
}
