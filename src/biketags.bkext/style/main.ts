import { Color, defineEditorStyleModifier } from 'bike/style'

let style = defineEditorStyleModifier('biketags-style', 'BikeTags', /.*/)

// Chip decoration per color run (distinct ids avoid override issues for adjacent tags)
style.layer('run-formatting', (row, run, caret, viewport, include) => {

  // Tokyo Night standard palette – background chips per color index
  const colors = [
    new Color(0x7a / 255, 0xa2 / 255, 0xf7 / 255, 1), // 0 #7aa2f7
    new Color(0xbb / 255, 0x9a / 255, 0xf7 / 255, 1), // 1 #bb9af7
    new Color(0x9e / 255, 0xce / 255, 0x6a / 255, 1), // 2 #9ece6a
    new Color(0xe0 / 255, 0xaf / 255, 0x68 / 255, 1), // 3 #e0af68
    new Color(0xf7 / 255, 0x76 / 255, 0x8e / 255, 1), // 4 #f7768e
    new Color(0x7d / 255, 0xcf / 255, 0xff / 255, 1), // 5 #7dcfff
    new Color(0xc0 / 255, 0xca / 255, 0xf5 / 255, 1), // 6 #c0caf5
    new Color(0x73 / 255, 0xda / 255, 0xca / 255, 1), // 7 #73daca
  ]

  for (let i = 0; i < colors.length; i++) {
    run(`.@bt-color-${i}`, (context, text) => {
      const bg = colors[i].withAlpha(0.25)
      const border = colors[i].withAlpha(0.6)
      const pad = 3
      // Adjust text padding for readability over chip
      text.padding.left = 4
      text.padding.right = 4
      // Unique decoration id per color ensures multiple adjacent tags render independently
      text.decoration(`bt-chip-${i}`, (d, layout) => {
        d.zPosition = -1
        d.anchor.x = 0
        d.anchor.y = 0
        d.x = layout.leading.offset(-pad)
        d.y = layout.top
        d.width = layout.width.offset(pad * 2)
        d.height = layout.height
        d.corners.radius = 4
        d.border.width = 1
        d.border.color = border
        d.color = bg
      })
    })
  }
})


