import { AppExtensionContext, CommandContext, Row, Window, Outline } from 'bike/app'
import type { Selection } from 'bike/app'

type TagToken = {
  tag: string
  start: number
  end: number
}

type TagHierarchyNode = {
  tag: string
  children: TagHierarchyNode[]
}

const COLOR_COUNT = 8

// Attribute names (support both legacy "data-*" and new non-prefixed forms)
const TAGS_ATTR_NEW = 'bt-tags'
const TAGS_ATTR_OLD = 'data-bt-tags'
const FILTER_ATTR_NEW = 'bt-filter'
const FILTER_ATTR_OLD = 'data-bt-filter'

function getRowTagsAttribute(row: Row): string | undefined {
  return (
    (row.getAttribute(TAGS_ATTR_NEW, 'string') as string | undefined) ??
    (row.getAttribute(TAGS_ATTR_OLD, 'string') as string | undefined)
  )
}

function setRowTagsAttribute(row: Row, value: string) {
  row.setAttribute(TAGS_ATTR_NEW, value)
  row.setAttribute(TAGS_ATTR_OLD, value)
}

function removeRowTagsAttribute(row: Row) {
  row.removeAttribute(TAGS_ATTR_NEW)
  row.removeAttribute(TAGS_ATTR_OLD)
}

function setRowFilterAttribute(row: Row, value: string) {
  row.setAttribute(FILTER_ATTR_NEW, value)
  row.setAttribute(FILTER_ATTR_OLD, value)
}

function removeRowFilterAttribute(row: Row) {
  row.removeAttribute(FILTER_ATTR_NEW)
  row.removeAttribute(FILTER_ATTR_OLD)
}

export async function activate(context: AppExtensionContext) {
  bike.commands.addCommands({
    commands: {
      'biketags:apply-tags': applyTagsCommand,
      'biketags:filter-by-tag': filterByTagCommand,
      'biketags:clear-filter': clearFilterCommand,
      'biketags:rebuild-sidebar': () => {
        try {
          const win = bike.frontmostWindow
          if (!win) return false
          setupTagsSidebar(win)
          return true
        } catch { return false }
      },
    },
  })

  // Auto-apply when leaving edit mode or switching rows
  bike.observeFrontmostOutlineEditor((editor) => {
    let lastRowId: string | undefined
    let lastType: 'caret' | 'text' | 'block' | undefined
    editor.observeSelection((selection) => {
      if (!selection) return
      const currentRow = selection.row
      const currentType = selection.type
      // If entering block selection on this row, apply to current row
      if ((lastType === 'caret' || lastType === 'text') && currentType === 'block') {
        applyTagsToRowId(editor.outline, currentRow.id)
      }
      // If row changed while editing (caret/text -> new row), apply to the row we left
      if (
        lastRowId &&
        currentRow.id !== lastRowId &&
        (lastType === 'caret' || lastType === 'text')
      ) {
        applyTagsToRowId(editor.outline, lastRowId)
      }
      lastRowId = currentRow.id
      lastType = currentType
    }, 250)
  })

  // Add Tags sidebar using observeWindows pattern (like !bike.bkext does)
  // observeWindows fires for ALL windows (existing and new), just not immediately
  bike.observeWindows(async (window: Window) => {
    console.log('[BikeTags] observeWindows triggered for:', window.title)
    setupTagsSidebarOnce(window)
  })

  // Also proactively setup for any currently open windows
  try {
    for (const w of bike.windows) {
      setupTagsSidebarOnce(w)
    }
  } catch (e) {
    console.error('[BikeTags] Error during initial windows setup:', e)
  }

  // And for future frontmost window switches
  try {
    bike.observeFrontmostWindow((w: Window) => {
      if (!w) return
      console.log('[BikeTags] observeFrontmostWindow triggered for:', w.title)
      setupTagsSidebarOnce(w)
    })
  } catch (e) {
    console.error('[BikeTags] Error setting up frontmost window observer:', e)
  }

  // Extra safety: attempt retries shortly after activation to catch race with window creation
  try {
    let attempts = 0
    const maxAttempts = 10
    const retry = () => {
      try {
        const w = bike.frontmostWindow
        if (w) setupTagsSidebarOnce(w)
      } catch {}
      if (++attempts < maxAttempts) {
        setTimeout(retry, 300)
      }
    }
    setTimeout(retry, 0)
  } catch (e) {
    console.error('[BikeTags] Error scheduling sidebar setup retries:', e)
  }

  // When an editor appears, ensure the window has sidebar initialized
  try {
    bike.observeFrontmostOutlineEditor(() => {
      const w = bike.frontmostWindow
      if (w) setupTagsSidebarOnce(w)
    })
  } catch (e) {
    console.error('[BikeTags] Error observing frontmost editor for sidebar init:', e)
  }
}

// Guard to ensure we initialize a given window only once
const _initializedWindows = new WeakSet<any>()

function setupTagsSidebarOnce(window: Window) {
  try {
    if (_initializedWindows.has(window as any)) return
    _initializedWindows.add(window as any)
    setupTagsSidebar(window)
  } catch (e) {
    console.error('[BikeTags] setupTagsSidebarOnce error:', e)
  }
}

function applyTagsCommand(context: CommandContext): boolean {
  const editor = context.editor
  if (!editor) return false

  const outline = editor.outline

  editor.transaction({ animate: 'default' }, () => {
    for (const row of outline.root.descendants) {
      applyTagsToRow(row)
    }
  })

  return true
}

function filterByTagCommand(context: CommandContext & { tag?: string }): boolean {
  const editor = context.editor
  if (!editor) return false

  // Check if tag is provided via context (from sidebar), otherwise get from selection
  let target = context.tag
  if (!target) {
    const selection = editor.selection
    if (!selection) return false
    // Determine tag under caret or fall back to last trailing tag
    target = tagFromSelection(selection) || lastTrailingTag(selection.row)
  }
  
  if (!target) return false

  const outline = editor.outline

  editor.transaction({ animate: 'default' }, () => {
    for (const row of outline.root.descendants) {
      const raw = getRowTagsAttribute(row)
      let match = false
      if (raw) {
        try {
          const list = JSON.parse(raw) as string[]
          // Match if the row has the exact tag or any descendant tag
          match = list.some(t => t === target || t.startsWith(target + '/'))
        } catch {}
      }
      if (match) {
        setRowFilterAttribute(row, '1')
      } else {
        removeRowFilterAttribute(row)
      }
    }
    editor.filter = '//@bt-filter'
  })

  return true
}

function clearFilterCommand(context: CommandContext): boolean {
  const editor = context.editor
  if (!editor) return false

  const outline = editor.outline
  editor.transaction({ animate: 'default' }, () => {
    for (const row of outline.root.descendants) {
      removeRowFilterAttribute(row)
    }
    editor.filter = ''
  })

  return true
}

function applyTagsToRowId(outline: import('bike/app').Outline, rowId: string) {
  const row = outline.getRowById(rowId)
  if (!row) return
  outline.transaction({ animate: 'none' }, () => {
    applyTagsToRow(row)
  })
}

function applyTagsToRow(row: Row) {
  const tokens = findTrailingTags(row)
  // If no tags now, remove attribute if present and return
  if (tokens.length === 0) {
    if (getRowTagsAttribute(row)) {
      removeRowTagsAttribute(row)
    }
    return
  }

  // Compute new tag set (including ancestors) for storage
  const tagPaths = new Set<string>()
  const fullTags: string[] = []
  for (const token of tokens) {
    const normalized = normalizeTag(token.tag)
    fullTags.push(normalized)
    addAncestors(normalized).forEach((t) => tagPaths.add(t))
  }
  const newSet = Array.from(tagPaths).sort()

  // Compare with existing set; if equal, skip re-application
  const existingRaw = getRowTagsAttribute(row)
  if (existingRaw) {
    try {
      const existing = (JSON.parse(existingRaw) as string[]).slice().sort()
      if (arraysEqual(existing, newSet)) {
        return
      }
    } catch {}
  }

  // Apply visual attributes and persist tags
  // Remove any previous biketag and bt-color-* attributes first
  row.text.removeAttribute('biketag')
  for (let i = 0; i < COLOR_COUNT; i++) {
    row.text.removeAttribute(`bt-color-${i}`)
  }
  for (const token of tokens) {
    const normalized = normalizeTag(token.tag)
    row.text.addAttribute('biketag', '', [token.start, token.end])
    const colorIndex = stableIndexForTag(normalized, COLOR_COUNT)
    row.text.addAttribute(`bt-color-${colorIndex}`, '', [token.start, token.end])
  }
  setRowTagsAttribute(row, JSON.stringify(newSet))
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function caretCharIndex(selection: Selection): number | undefined {
  if (selection.type === 'caret') return selection.detail.char
  if (selection.type === 'text') return selection.detail.headChar
  return undefined
}

function tagFromSelection(selection: Selection): string | undefined {
  const index = caretCharIndex(selection)
  const row = selection.row
  const tokens = findTrailingTags(row)
  if (tokens.length === 0) return undefined
  if (index === undefined) return undefined
  for (const t of tokens) {
    // inside run or right at end boundary
    if ((index >= t.start && index < t.end) || index === t.end) {
      return normalizeTag(t.tag)
    }
    // caret can sit just after a space; consider left char
    if (index > 0 && index - 1 >= t.start && index - 1 < t.end) {
      return normalizeTag(t.tag)
    }
  }
  return undefined
}

function lastTrailingTag(row: Row): string | undefined {
  const tokens = findTrailingTags(row)
  if (tokens.length === 0) return undefined
  return normalizeTag(tokens[tokens.length - 1].tag)
}

function findTrailingTags(row: Row): TagToken[] {
  const s = row.text.string
  const tokens: TagToken[] = []
  // Parse from end; match ... [space]#tag[/sub]* possibly repeated at end.
  // Ignore trailing whitespace and allow multiple tags separated by spaces.
  let endIndex = s.length
  while (endIndex > 0 && /\s/.test(s[endIndex - 1])) endIndex--
  let tail = s.slice(0, endIndex)
  const re = /(?:^|\s)(#[\w-]+(?:\/[\w-]+)*)$/
  while (true) {
    const m = re.exec(tail)
    if (!m) break
    const tagText = m[1]
    // compute start position accounting for optional leading space
    const hasLeadingSpace = m.index > 0 && tail[m.index] === ' '
    const startInTail = m.index + (hasLeadingSpace ? 1 : 0)
    const start = startInTail
    const end = start + tagText.length
    tokens.unshift({ tag: tagText, start, end })
    // Move tail left to find previous tag and trim any trailing whitespace
    tail = tail.slice(0, m.index)
    while (tail.length > 0 && /\s/.test(tail[tail.length - 1])) {
      tail = tail.slice(0, -1)
    }
  }
  return tokens
}

function normalizeTag(tag: string): string {
  // Ensure leading # and normalize consecutive slashes
  let t = tag.trim()
  if (!t.startsWith('#')) t = '#' + t
  t = t.replace(/\/+/, '/')
  return t
}

function addAncestors(full: string): string[] {
  // full like #a/b/c -> [#a, #a/b, #a/b/c]
  const parts = full.slice(1).split('/')
  const out: string[] = []
  for (let i = 1; i <= parts.length; i++) {
    out.push('#' + parts.slice(0, i).join('/'))
  }
  return out
}

function stableIndexForTag(tag: string, modulo: number): number {
  // djb2 hash
  let hash = 5381
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) + hash) + tag.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % modulo
}

// Sidebar integration

function setupTagsSidebar(window: Window) {
  console.log('[BikeTags] setupTagsSidebar called for window:', window.title)
  
  // Validate window has sidebar
  if (!window.sidebar) {
    console.error('[BikeTags] Window has no sidebar!', window.title)
    return
  }
  
  // Store tag items for cleanup
  let tagItemHandles: any[] = []

  // Add Tags group sidebar item
  try {
    const tagsGroupItem = window.sidebar.addItem({
      id: 'biketags:tags',
      text: 'Tags',
      ordering: { section: 'filters', afterId: 'bike:headings' },
      isGroup: true,
      action: 'biketags:clear-filter',
    })
    console.log('[BikeTags] Tags group item created successfully')
  } catch (e) {
    console.error('[BikeTags] Failed to create Tags group item (with ordering):', e)
    try {
      const tagsGroupItem = window.sidebar.addItem({
        id: 'biketags:tags',
        text: 'Tags',
        isGroup: true,
        action: 'biketags:clear-filter',
      })
      console.log('[BikeTags] Tags group item created successfully (fallback without ordering)')
    } catch (e2) {
      console.error('[BikeTags] Failed to create Tags group item (fallback). Proceeding without group:', e2)
      // Do not return; continue so tag items may still be added without ordering.
    }
  }

  // Helper function to setup editor observer
  const setupEditorObserver = (editor: any) => {
    try {
      if (!editor) {
        // Clean up all tag items when no editor
        console.log('[BikeTags] Cleaning up', tagItemHandles.length, 'tag items (no editor)')
        tagItemHandles.forEach(h => h.dispose())
        tagItemHandles = []
        return
      }

      console.log('[BikeTags] Setting up editor observer for editor')

      // Helper function to update sidebar tags
      const updateSidebarTags = () => {
        try {
          // Clean up old tag items
          if (tagItemHandles.length > 0) {
            console.log('[BikeTags] Cleaning up', tagItemHandles.length, 'existing tag items')
            tagItemHandles.forEach(h => h.dispose())
            tagItemHandles = []
          }
          
          // Index all tags and rebuild hierarchy
          const allTags = indexAllTags(editor.outline)
          const hierarchy = buildTagHierarchy(allTags)
          
          // Add new tag items to sidebar
          tagItemHandles = addTagHierarchyToSidebar(window, hierarchy, null)
          console.log('[BikeTags] Created', tagItemHandles.length, 'total sidebar items')
        } catch (e) {
          console.error('[BikeTags] Error in updateSidebarTags:', e)
        }
      }

      // CRITICAL: Populate sidebar immediately on load
      // streamQuery only fires on CHANGES, not initial setup
      console.log('[BikeTags] Performing initial sidebar population...')
      updateSidebarTags()

      // Use streamQuery to continuously monitor tag changes (legacy + new)
      const disposables: any[] = []
      try { disposables.push(editor.outline.streamQuery('//@data-bt-tags', () => updateSidebarTags())) } catch {}
      try { disposables.push(editor.outline.streamQuery('//@bt-tags', () => updateSidebarTags())) } catch {}
      // Do not auto-apply while typing; tags apply on exit edit mode or row switch
    } catch (e) {
      console.error('[BikeTags] Error in setupEditorObserver:', e)
    }
  }

  try {
    // CRITICAL FIX: Handle current editor immediately if it exists
    const currentEditor = window.currentOutlineEditor
    if (currentEditor) {
      console.log('[BikeTags] Current editor exists, setting up immediately')
      setupEditorObserver(currentEditor)
    }

    // Observe future editor changes
    window.observeCurrentOutlineEditor((editor) => {
      console.log('[BikeTags] observeCurrentOutlineEditor triggered, editor:', editor ? 'present' : 'null')
      setupEditorObserver(editor)
    })
  } catch (e) {
    console.error('[BikeTags] Error setting up editor observers:', e)
  }
}

function addTagHierarchyToSidebar(
  window: Window, 
  nodes: TagHierarchyNode[], 
  afterId: string | null,
  level: number = 0
): any[] {
  const handles: any[] = []
  
  const sanitizeId = (tag: string): string => {
    // Remove leading '#', replace '/' with '--', and strip other unsafe chars
    const core = tag.replace(/^#/, '')
    return 'biketags:tag:' + core
      .replace(/\//g, '--')
      .replace(/[^a-zA-Z0-9:_-]/g, '-')
  }
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const tagId = sanitizeId(node.tag)
    
    // Get display name (short name for nested tags with indentation)
    const displayName = getTagDisplayName(node.tag, level)
    
    console.log(`[BikeTags] Adding sidebar item: id="${tagId}", text="${displayName}", level=${level}`)
    
    // Create action that filters by this tag
    const action = () => {
      const editor = window.currentOutlineEditor
      if (!editor) return
      
      console.log(`[BikeTags] Filtering by tag: ${node.tag}`)
      
      // Manually apply the filter with this tag
      const target = node.tag
      editor.transaction({ animate: 'default' }, () => {
        for (const row of editor.outline.root.descendants) {
            const raw = getRowTagsAttribute(row)
          let match = false
          if (raw) {
            try {
              const list = JSON.parse(raw) as string[]
              // Match if the row has the exact tag or any descendant tag
              match = list.some(t => t === target || t.startsWith(target + '/'))
            } catch {}
          }
          if (match) {
              setRowFilterAttribute(row, '1')
          } else {
              removeRowFilterAttribute(row)
          }
        }
          editor.filter = '//@bt-filter'
      })
    }
    
    try {
      const prevId = afterId || (i === 0 ? 'biketags:tags' : sanitizeId(nodes[i-1].tag))
      const itemHandle = window.sidebar.addItem({
        id: tagId,
        text: displayName,
        symbol: 'tag',
        ordering: { 
          section: 'filters',
          afterId: prevId,
        },
        action: action,
      })
      handles.push(itemHandle)
      console.log(`[BikeTags] Successfully added sidebar item: ${tagId}`)
    } catch (e) {
      console.error(`[BikeTags] Failed to add sidebar item ${tagId} (ordered):`, e)
      try {
        const itemHandle = window.sidebar.addItem({
          id: tagId,
          text: displayName,
          symbol: 'tag',
          action: action,
        })
        handles.push(itemHandle)
        console.log(`[BikeTags] Successfully added sidebar item without ordering: ${tagId}`)
      } catch (e2) {
        console.error(`[BikeTags] Failed to add sidebar item ${tagId} (no ordering):`, e2)
      }
    }
    
    // Recursively add children with increased level
    if (node.children.length > 0) {
      const childHandles = addTagHierarchyToSidebar(window, node.children, tagId, level + 1)
      handles.push(...childHandles)
    }
  }
  
  return handles
}

function getTagDisplayName(tag: string, level: number): string {
  // For nested tags, show indentation with the short name
  // e.g., "#project/web/frontend" at level 2 -> "    frontend"
  const parts = tag.split('/')
  const shortName = parts[parts.length - 1]
  
  if (level === 0) {
    // Root level tags show full name
    return tag
  } else {
    // Nested tags show short name with indentation
    const indent = '  '.repeat(level)
    return indent + shortName
  }
}

function indexAllTags(outline: Outline): Set<string> {
  const tags = new Set<string>()
  
  for (const row of outline.root.descendants) {
    const raw = row.getAttribute('data-bt-tags', 'string') as string | undefined
    if (raw) {
      try {
        const list = JSON.parse(raw) as string[]
        list.forEach(tag => tags.add(tag))
      } catch (e) {
        console.error('[BikeTags] Failed to parse tags for row:', row.text.string, 'Error:', e)
      }
    }
  }
  
  const tagArray = Array.from(tags)
  console.log(`[BikeTags] Found ${tagArray.length} unique tags:`, tagArray)
  
  return tags
}

function buildTagHierarchy(tags: Set<string>): TagHierarchyNode[] {
  // Sort by depth first so parents (#a) come before children (#a/b)
  const sortedByDepth = Array.from(tags).sort((a, b) => {
    const da = a.split('/').length
    const db = b.split('/').length
    if (da !== db) return da - db
    return a.localeCompare(b)
  })

  const nodeMap = new Map<string, TagHierarchyNode>()
  const rootNodes: TagHierarchyNode[] = []

  const ensureNode = (t: string): TagHierarchyNode => {
    let n = nodeMap.get(t)
    if (!n) {
      n = { tag: t, children: [] }
      nodeMap.set(t, n)
    }
    return n
  }

  for (const tag of sortedByDepth) {
    const node = ensureNode(tag)
    const lastSlash = tag.lastIndexOf('/')
    if (lastSlash > 0) {
      const parentTag = tag.substring(0, lastSlash)
      const parent = ensureNode(parentTag)
      // Only add once
      if (!parent.children.includes(node)) parent.children.push(node)
      // Ensure parent is placed at root if it doesn't have a parent itself
      if (parentTag.indexOf('/') === -1 && !rootNodes.includes(parent)) rootNodes.push(parent)
    } else {
      if (!rootNodes.includes(node)) rootNodes.push(node)
    }
  }

  console.log(`[BikeTags] Built hierarchy with ${rootNodes.length} root nodes`)
  return rootNodes
}


