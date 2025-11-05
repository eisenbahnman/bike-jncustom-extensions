import { StyleContext, Insets } from 'bike/style'

/**
 * Compute indent value based on font size.
 * This replicates the indent calculation from computeValues, including font scaling logic.
 * Returns an object with indent property to match the original pattern.
 */
export function computeIndent(context: StyleContext): { indent: number } {
  // Use cache with unique key for bullet-threading extension
  if (context.userCache.has('bullet-threading-indent')) {
    return context.userCache.get('bullet-threading-indent')
  }

  let font = context.settings.font
  let viewportSize = context.viewportSize
  let lineWidth = context.settings.lineWidth ?? Number.MAX_SAFE_INTEGER
  
  // First calculate with base font (matching computeGeometryForFont logic)
  let fontAttributes = font.resolve(context)
  let pointSize = fontAttributes.pointSize
  let uiScale = pointSize / 14
  let indent = 22 * uiScale
  let rowPaddingBase = context.settings.rowSpacingMultiple * pointSize * uiScale
  let rowTextPaddingBase = 5 * uiScale
  let rowTextMarginBase = rowPaddingBase / 2
  let rowPadding = new Insets(rowPaddingBase, rowPaddingBase, rowPaddingBase, indent)
  let rowTextMargin = new Insets(rowTextMarginBase, 0, rowTextMarginBase, 0)
  let rowTextPadding = new Insets(0, rowTextPaddingBase, 0, rowTextPaddingBase)
  
  // If font scaling is enabled and lineWidth is set, check if we need to scale
  if (context.settings.allowFontScaling == true && lineWidth > 0 && lineWidth < Number.MAX_SAFE_INTEGER) {
    let golden = 1.618
    let inverseGolden = 1 / golden
    let xWidth = fontAttributes.xWidth
    let textWidth = Math.ceil(xWidth * lineWidth)
    let rowWidth = textWidth + rowPadding.width + Math.max(rowTextMargin.width, rowTextPadding.width)
    let rowToViewRatio = rowWidth / viewportSize.width
    
    // Recalculate with scaled font if needed
    if (rowToViewRatio > 2) {
      font = font.withPointSize(pointSize - 1)
      fontAttributes = font.resolve(context)
      pointSize = fontAttributes.pointSize
      uiScale = pointSize / 14
      indent = 22 * uiScale
    } else if (rowToViewRatio < inverseGolden) {
      let desiredRowWidth = viewportSize.width * inverseGolden
      let neededScale = 1.0 + (desiredRowWidth - rowWidth) / desiredRowWidth
      font = font.withPointSize(pointSize * neededScale)
      fontAttributes = font.resolve(context)
      pointSize = fontAttributes.pointSize
      uiScale = pointSize / 14
      indent = 22 * uiScale
    }
  }
  
  let result = { indent: indent }
  context.userCache.set('bullet-threading-indent', result)
  return result
}

