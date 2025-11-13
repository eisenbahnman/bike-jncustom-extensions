# Custom extensions for Bike Outliner
A collection of my custom extensions for Bike Outliner. Work in progress.

1. [Bike Tags extension](#BikeTags)
2. [Workspace Extension](#Workspace)

# BikeTags

Inline, hierarchical tags for Bike Outliner with colored chips, tag-based filtering, and a tags sidebar.

## Transparency

>[!IMPORTANT]
> This tagging extension was created with the use of AI end-to-end, including design, implementation, and this documentation.

## What it does

- Parse trailing `#tags` at the end of rows; supports multiple tags per row
- Hierarchical tags with `/` (e.g., `#project/subtask`); ancestors are included automatically
- Render tags as rounded chips; colors are stable per tag
- Apply tags when you exit edit mode on a row or switch to another row
- Provide a tags sidebar with parent/child nesting
- Commands to apply styling, filter by the tag under the caret, clear the filter, and rebuild the sidebar

## Screenshots
![Demo](/screenshots/tagsdemo.png)

## Usage

Type tags at the end of a row:

```
Do something important #this #that/nested
```

Behavior:
- Tags remain inline and serialize with your document; visuals don’t alter text
- Tags apply on exit from edit mode or row changes (Esc, arrow navigation, etc.)
- Filtering keeps rows that match the chosen tag or any of its descendants

## Commands

- BikeTags: Apply Tags (`biketags:apply-tags`)
  - Scans the outline, applies tag chip styling, and persists computed tags
- BikeTags: Filter by Tag at Caret (`biketags:filter-by-tag`)
  - Filters to the tag under the caret (or last trailing tag on the row)
- BikeTags: Clear Filter (`biketags:clear-filter`)
  - Removes the temporary filter
- BikeTags: Rebuild Sidebar (`biketags:rebuild-sidebar`)
  - Rebuilds the tags sidebar from current document tags

## Sidebar

- A “Tags” group appears in the sidebar; tags are listed and nested by hierarchy
- Clicking a tag filters the outline to rows containing that tag or descendants

## Filtering notes

- The filter attribute is `bt-filter` (legacy `data-bt-filter` mirrored for compatibility)
- Computed tags are stored per row in `bt-tags` (legacy `data-bt-tags` mirrored)

## Known limitations

- Tags do not appear automatically in the sidebar on window open. Use the command “BikeTags: Rebuild Sidebar” to populate the list. You have to run this command anytime you add new tags and want to access them from the sidebar.
- Although it supports `.bikemd` files, you may find your markdown files more polluted with extra data, especially if you use tags heavily (good news is that this is always at the end of the line).

## Performance

- Re-application is skipped when the computed tag set for a row hasn’t changed
- Only trailing tags are parsed; this keeps scanning fast and avoids false positives

## Palette

- Colors are assigned via a stable hash across eight hues


# Workspace

This extension integrates with an Apple Shortcut to display links to all .bike files in your iCloud directory in the sidebar.

## Features

- Automatically refreshes workspace file list when documents are opened
- Manual refresh command: `workspace:refresh`
- Clickable links to open files directly from the sidebar

## Screenshots
![Workspace example](/screenshots/workspace-demo.gif)

## Setup

1. Create an Apple Shortcut named "list-bike-files" that:
   - Lists .bike files from your iCloud Bike directory
   - Outputs JSON array with `name`, `displayName`, and `bikeURL` fields
   - Copies the JSON to clipboard

### Sample Apple Shortcut:
![Sample Shortcut](/screenshots/sample-shortcut.png)

```js
const app = Application.currentApplication()
app.includeStandardAdditions = true

const home = app.pathTo("home folder").toString()
const bikePath = `${home}/Library/Mobile\ Documents/iCloud~com~hogbaysoftware~bike/Documents/`

const fm = $.NSFileManager.defaultManager
const path = $.NSString.alloc.initWithUTF8String(bikePath)
const files = ObjC.unwrap(fm.contentsOfDirectoryAtPathError(path, null)) || []

const bikeFiles = files
  .filter(f => f.js.endsWith('.bike'))
  .map(f => {
    const fullPath = `${bikePath}${f.js}`
    // Encode each component of the path to handle spaces and special chars
    const encodedPath = fullPath.split('/').map(encodeURIComponent).join('/')
    
    return {
      name: f.js,
      displayName: f.js.replace('.bike', ''),
      bikeURL: `bike://${encodedPath}`
    }
  })

const json = JSON.stringify(bikeFiles)
app.setTheClipboardTo(json)

json // Return value
```

2. Enable this extension in Bike

3. Open any document to trigger the workspace refresh

## Manual Refresh

Click on the "Workspace" group header in the sidebar to manually refresh the file list.




