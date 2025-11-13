# Workspace Extension

This extension integrates with an Apple Shortcut to display links to all .bike files in your iCloud directory in the sidebar.

## Features

- Automatically refreshes workspace file list when documents are opened
- Manual refresh command: `workspace:refresh`
- Clickable links to open files directly from the sidebar

## Issues

- relies on Apple shortcut to work (not sure if there’s currently a better way)
- obliterates clipboard if there’s no clipboard manager/history
- doesn’t yet support sub-directories
- for now, lists onlike .bike files
- getting some strange glitches where extension is triggered with Bike in background, not sure if related to autosave or some other process

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

