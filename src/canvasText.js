import * as THREE from 'three'

/**
 * Helpers that draw text on a <canvas> and turn it into a texture.
 * Simpler and lighter than 3D text: the text is just an image on a plane or a sprite
 */

// Notifications come from other people's apps, so they use a "system" font.
// Everything that belongs to the office itself (the hero's screen, labels above desks) is monospace, like the game UI
const FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif"
const MONO_FAMILY = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

// Canvas doesn't wait for web fonts: text drawn before the font loads keeps the fallback font.
// document.fonts.load triggers loading the needed faces itself (the DOM may never use them)
export const monoFontReady = Promise.all(
    ['400 20px', 'italic 400 20px', '500 20px', '600 20px'].map((style) =>
        document.fonts?.load(`${style} 'IBM Plex Mono'`)
    )
).catch(() => {})

// Split text into lines that fit within maxWidth
const wrapText = (context, text, maxWidth) => {
    const words = text.split(' ')
    const lines = []
    let line = ''

    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word
        if (context.measureText(candidate).width > maxWidth && line) {
            lines.push(line)
            line = word
        } else {
            line = candidate
        }
    }
    if (line) lines.push(line)

    return lines
}

const toTexture = (canvas) => {
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

/**
 * Notification card: dark background, colored label on top, then the text
 * Returns the texture and its aspect ratio so the sprite can be scaled correctly
 */
export const createCardTexture = ({ label, text, accent = '#ff5a5a', width = 512 }) => {
    const padding = 28
    const labelSize = 22
    const textSize = 34
    const lineHeight = 42

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    // Measure the text first to know the card height
    context.font = `600 ${textSize}px ${FONT_FAMILY}`
    const lines = wrapText(context, text, width - padding * 2)
    const height = padding * 2 + labelSize + 16 + lines.length * lineHeight

    // Resizing a canvas resets the context state, so the font is set again below
    canvas.width = width
    canvas.height = height

    context.fillStyle = 'rgba(14, 16, 22, 0.92)'
    context.beginPath()
    context.roundRect(0, 0, width, height, 24)
    context.fill()

    context.strokeStyle = accent
    context.lineWidth = 3
    context.stroke()

    context.fillStyle = accent
    context.font = `700 ${labelSize}px ${FONT_FAMILY}`
    context.fillText(label.toUpperCase(), padding, padding + labelSize)

    context.fillStyle = '#f2f4f8'
    context.font = `600 ${textSize}px ${FONT_FAMILY}`
    lines.forEach((line, index) => {
        context.fillText(line, padding, padding + labelSize + 16 + (index + 1) * lineHeight - 8)
    })

    return { texture: toTexture(canvas), aspect: width / height }
}

/**
 * Glowing label without a background, e.g. "LOW PERFORMANCE" above a desk
 */
export const createGlowLabelTexture = (text, color = '#ff4d4d') => {
    const fontSize = 64
    const padding = 40

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    context.font = `600 ${fontSize}px ${MONO_FAMILY}`
    const textWidth = context.measureText(text).width

    canvas.width = Math.ceil(textWidth + padding * 2)
    canvas.height = fontSize + padding * 2

    context.font = `600 ${fontSize}px ${MONO_FAMILY}`
    context.textBaseline = 'middle'
    context.fillStyle = color
    context.shadowColor = color
    context.shadowBlur = 24
    context.fillText(text, padding, canvas.height / 2)

    return { texture: toTexture(canvas), aspect: canvas.width / canvas.height }
}

/**
 * A screen that is redrawn whenever its data changes
 * draw(context, width, height, font) is your drawing function
 */
export const createScreenTexture = ({ width = 512, height = 288 }) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    const texture = toTexture(canvas)

    const redraw = (draw) => {
        context.clearRect(0, 0, width, height)
        draw(context, width, height, MONO_FAMILY)
        texture.needsUpdate = true // tell Three.js to re-upload the image to the GPU
    }

    return { texture, redraw }
}
