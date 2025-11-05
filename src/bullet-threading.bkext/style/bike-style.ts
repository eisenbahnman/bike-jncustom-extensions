import { defineEditorStyleModifier, Color } from 'bike/style'
import { computeIndent } from './util'

let style = defineEditorStyleModifier('bullet-threading-style', 'Bullet Threading', /.*/)

// Bullet Threading: show horizontal line from selected row to parent indent
// The app context sets @bullet-threading attribute on selected row and all ancestors
style.layer('bullet-threading', (row, run, caret, viewport, include) => {
  // Match rows that have the bullet-threading attribute (set by app context)
  // This includes the selected row and all its ancestors
  row('.@bullet-threading', (context, row) => {
    let values = computeIndent(context)
    
    // Horizontal line extending left from this row's bullet to parent's indent
    row.decoration('threading-horizontal', (line, layout) => {
      let bulletX = layout.leadingContent.offset(-values.indent / 2)
      let bulletY = layout.firstLine.centerY
      
      // Horizontal line going left from the bullet toward the parent indent
      // Width is one indent level (going left to where parent's bullet would be)
      line.x = bulletX.offset(-values.indent) // Start one indent to the left
      line.y = bulletY
      line.width = layout.fixed(values.indent)
      line.height = layout.fixed(3)
      line.anchor.x = 0
      line.anchor.y = 0.5
      line.color = Color.systemOrange()
      line.opacity = 1.0
      line.zPosition = -0.5
      line.corners.radius = 1.5
    })
    
    // Vertical line going up from left end of horizontal line to parent's bullet
    row.decoration('threading-vertical', (line, layout) => {
      let bulletY = layout.firstLine.centerY
      let parentBulletX = layout.leadingContent.offset(-values.indent - values.indent / 2)
      
      // Vertical line starts at the current row's bullet Y position
      // and extends upward through the padding to reach the parent
      line.x = parentBulletX
      line.y = bulletY // Start at same Y as horizontal line (bullet center)
      line.width = layout.fixed(3)
      line.height = layout.top
      line.anchor.x = 0.5
      line.anchor.y = 1
      line.color = Color.systemOrange()
      line.opacity = 1.0
      line.zPosition = -0.5
      line.corners.radius = 1.5
    })
  })
})

