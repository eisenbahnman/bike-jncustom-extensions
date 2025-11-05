import { AppExtensionContext, Window } from 'bike/app'

export async function activate(context: AppExtensionContext) {
  // Observe all windows to track selection changes
  bike.observeWindows(async (window: Window) => {
    // Observe when the current outline editor changes
    window.observeCurrentOutlineEditor((editor) => {
      // Store previous threading row IDs to clear attributes
      let previousThreadingRowIds: Set<string> = new Set()
      // Track the previous selected row ID to avoid updating when only caret position changes
      let previousSelectedRowId: string | null = null

      // Helper function to build ancestor chain for a row
      function buildAncestorChain(row: any): Set<string> {
        const chain = new Set<string>()
        chain.add(row.id)
        let current = row.parent
        while (current && current !== editor.outline.root) {
          chain.add(current.id)
          current = current.parent
        }
        return chain
      }

      // Function to update threading attributes based on current selection
      function updateThreadingAttributes() {
        const selection = editor.selection

        if (!selection) {
          // Clear all threading attributes when there's no selection
          previousThreadingRowIds.forEach((rowId) => {
            const row = editor.outline.getRowById(rowId)
            if (row) {
              row.removeAttribute('bullet-threading')
            }
          })
          previousThreadingRowIds.clear()
          previousSelectedRowId = null
          return
        }

        // Get the selected row (for caret/text, use the row; for block, use the topmost row)
        const selectedRow = selection.row
        const selectedRowId = selectedRow.id

        // Only update if the selected row has actually changed
        if (selectedRowId === previousSelectedRowId) {
          return // Row hasn't changed, skip update to avoid flickering
        }

        // Build new ancestor chain
        const newThreadingRowIds = buildAncestorChain(selectedRow)
        
        // Find rows that need to be removed (were in previous chain but not in new chain)
        const rowsToRemove: string[] = []
        previousThreadingRowIds.forEach((rowId) => {
          if (!newThreadingRowIds.has(rowId)) {
            rowsToRemove.push(rowId)
          }
        })
        
        // Find rows that need to be added (are in new chain but not in previous chain)
        const rowsToAdd: string[] = []
        newThreadingRowIds.forEach((rowId) => {
          if (!previousThreadingRowIds.has(rowId)) {
            rowsToAdd.push(rowId)
          }
        })

        // Only update attributes that actually changed - this prevents flickering
        // Remove attributes from rows that are no longer in the chain
        rowsToRemove.forEach((rowId) => {
          const row = editor.outline.getRowById(rowId)
          if (row) {
            row.removeAttribute('bullet-threading')
          }
        })
        
        // Add attributes to rows that are newly in the chain
        rowsToAdd.forEach((rowId) => {
          const row = editor.outline.getRowById(rowId)
          if (row) {
            row.setAttribute('bullet-threading', 'true')
          }
        })

        // Store for next update
        previousThreadingRowIds = newThreadingRowIds
        previousSelectedRowId = selectedRowId
      }

      // Update on initial load
      updateThreadingAttributes()

      // Observe selection changes and update attributes instantly (debounce = 0)
      editor.observeSelection((selection) => {
        updateThreadingAttributes()
      }, 0) // Set debounce to 0 for instant updates
    })
  })
}

