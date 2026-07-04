export type DocumentOutlineHeading = {
  line: number
  text: string
  level: number
  style?: string | null
  data_path: string
}

export type OutlineTreeNode = DocumentOutlineHeading & {
  children: OutlineTreeNode[]
}

/** Build a Word-style heading tree from a flat outline list. */
export function buildOutlineTree(headings: DocumentOutlineHeading[]): OutlineTreeNode[] {
  const roots: OutlineTreeNode[] = []
  const stack: OutlineTreeNode[] = []

  for (const heading of headings) {
    const node: OutlineTreeNode = { ...heading, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop()
    }
    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }
    stack.push(node)
  }
  return roots
}

export function flattenOutlineTree(nodes: OutlineTreeNode[]): DocumentOutlineHeading[] {
  const out: DocumentOutlineHeading[] = []
  const walk = (list: OutlineTreeNode[]) => {
    for (const node of list) {
      const { children, ...heading } = node
      out.push(heading)
      if (children.length > 0) walk(children)
    }
  }
  walk(nodes)
  return out
}
