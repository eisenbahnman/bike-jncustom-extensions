import { AppExtensionContext, Window } from 'bike/app'
import { URL } from 'bike/app'
import { SidebarItemHandle } from 'bike/app'

interface BikeFile {
  name: string
  displayName: string
  bikeURL: string
}

// Store sidebar item handles per window
const windowWorkspaceItems = new Map<Window, Map<string, SidebarItemHandle>>()

// Track if we're currently refreshing to avoid duplicate triggers
let isRefreshing = false

/**
 * Time to wait (in milliseconds) for the shortcut to complete.
 * Increase this value if you see error messages about empty or invalid clipboard data.
 */
const SHORTCUT_WAIT_TIME = 1000

/**
 * Trigger the Apple Shortcut and update workspace files in all windows
 */
async function refreshWorkspace(context: AppExtensionContext): Promise<void> {
  if (isRefreshing) {
    console.log('Workspace refresh already in progress, skipping')
    return
  }

  isRefreshing = true

  try {
    // Save current clipboard content to restore later
    let originalClipboard = ''
    if (context.permissions.contains('clipboardRead')) {
      try {
        originalClipboard = bike.clipboard.readText()
      } catch (e) {
        console.log('Could not read original clipboard:', e)
      }
    }

    // Trigger the Apple Shortcut
    if (context.permissions.contains('openURL')) {
      const shortcutURL = new URL('shortcuts://run-shortcut?name=list-bike-files&silent=true')
      shortcutURL.open({ activates: false })
    } else {
      console.error('Missing openURL permission')
      isRefreshing = false
      return
    }

    // Wait for shortcut to complete
    await new Promise((resolve) => setTimeout(resolve, SHORTCUT_WAIT_TIME))

    // Read clipboard and parse JSON
    if (!context.permissions.contains('clipboardRead')) {
      console.error('Missing clipboardRead permission')
      isRefreshing = false
      return
    }

    const clipboardData = bike.clipboard.readText()

    // Restore original clipboard
    if (context.permissions.contains('clipboardWrite') && originalClipboard) {
      try {
        bike.clipboard.writeText(originalClipboard)
      } catch (e) {
        console.log('Could not restore clipboard:', e)
      }
    }

    // Parse the JSON array of files
    let bikeFiles: BikeFile[] = []
    try {
      // Check if clipboard is empty
      if (!clipboardData || clipboardData.trim().length === 0) {
        bike.showAlert({
          title: 'Workspace Refresh Failed',
          message:
            'Clipboard is empty. The shortcut may need more time to complete. Try increasing the wait time or running the shortcut manually first.',
          style: 'warning',
          buttons: ['OK'],
        })
        console.error('Clipboard is empty after waiting 1 second')
        isRefreshing = false
        return
      }

      bikeFiles = JSON.parse(clipboardData)

      // Validate it's an array
      if (!Array.isArray(bikeFiles)) {
        bike.showAlert({
          title: 'Workspace Refresh Failed',
          message: `Expected JSON array from shortcut, but received: ${typeof bikeFiles}. Check that the shortcut is outputting the correct format.`,
          style: 'warning',
          buttons: ['OK'],
        })
        console.error('Expected JSON array, got:', typeof bikeFiles)
        console.log('Clipboard data:', clipboardData)
        isRefreshing = false
        return
      }

      // Validate array items have the expected structure
      if (bikeFiles.length > 0) {
        const firstFile = bikeFiles[0]
        if (!firstFile.name || !firstFile.displayName || !firstFile.bikeURL) {
          bike.showAlert({
            title: 'Workspace Refresh Failed',
            message:
              'Shortcut output is missing required fields (name, displayName, bikeURL). Please check the shortcut configuration.',
            style: 'warning',
            buttons: ['OK'],
          })
          console.error('Invalid file structure:', firstFile)
          isRefreshing = false
          return
        }
      }
    } catch (e) {
      // JSON parsing error - likely timing issue or wrong data
      bike.showAlert({
        title: 'Workspace Refresh Failed',
        message: `Could not parse clipboard data as JSON. The shortcut may need more time to complete (current wait: ${SHORTCUT_WAIT_TIME}ms), or the clipboard contains unexpected data.\n\nError: ${e}`,
        style: 'warning',
        buttons: ['OK'],
      })
      console.error('Failed to parse clipboard JSON:', e)
      console.log('Clipboard data:', clipboardData.substring(0, 200))
      isRefreshing = false
      return
    }

    // Update sidebar in all windows
    bike.windows.forEach((window) => {
      updateWindowWorkspace(window, bikeFiles)
    })

    console.log(`Workspace refreshed with ${bikeFiles.length} files`)
  } finally {
    isRefreshing = false
  }
}

/**
 * Update workspace items for a specific window
 */
function updateWindowWorkspace(window: Window, files: BikeFile[]): void {
  // Get or create the map for this window's workspace items
  let workspaceItems = windowWorkspaceItems.get(window)

  // Dispose old items if they exist
  if (workspaceItems) {
    workspaceItems.forEach((handle) => handle.dispose())
    workspaceItems.clear()
  } else {
    workspaceItems = new Map<string, SidebarItemHandle>()
    windowWorkspaceItems.set(window, workspaceItems)
  }

  // Add each file as a sidebar item
  files.forEach((file) => {
    const itemId = `workspace:${file.name}`

    const handle = window.sidebar.addItem({
      id: itemId,
      text: file.displayName,
      symbol: 'doc.text',
      ordering: { section: 'workspace' },
      action: () => {
        // Open the file using the bike:// URL
        const fileURL = new URL(file.bikeURL)
        fileURL.open({})
      },
    })

    workspaceItems.set(file.name, handle)
  })
}

/**
 * Set up the workspace group header for a window
 */
function setupWorkspaceGroup(window: Window, context: AppExtensionContext): void {
  window.sidebar.addItem({
    id: 'workspace:group',
    text: 'Workspace',
    symbol: 'folder',
    isGroup: true,
    ordering: { section: 'workspace' },
    action: () => {
      // Manual refresh when clicking the group header
      refreshWorkspace(context)
    },
  })
}

export async function activate(context: AppExtensionContext) {
  // Set up workspace group header for all current and future windows
  bike.observeWindows(async (window: Window) => {
    setupWorkspaceGroup(window, context)
  })

  // Trigger workspace refresh on document open
  bike.observeDocuments(async (document) => {
    await refreshWorkspace(context)
  })

  // Add a manual refresh command
  bike.commands.addCommands({
    commands: {
      'workspace:refresh': () => {
        refreshWorkspace(context)
        return true
      },
    },
  })

  console.log('Workspace extension activated')
}

