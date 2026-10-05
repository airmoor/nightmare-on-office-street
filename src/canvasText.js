import * as THREE from 'three'

/**
 * Хелперы, которые рисуют текст на <canvas> и превращают его в текстуру.
 * Это проще и легче, чем 3D Text: текст — просто картинка на плоскости или спрайте
 */

const FONT_FAMILY = 'Inter, system-ui, -apple-system, Segoe UI, sans-serif'

// Разбиваем текст на строки, чтобы он влезал в maxWidth
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
 * Карточка уведомления: тёмный фон, цветная метка сверху, текст
 * Возвращает текстуру и соотношение сторон, чтобы правильно отмасштабировать спрайт
 */
export const createCardTexture = ({ label, text, accent = '#ff5a5a', width = 512 }) => {
    const padding = 28
    const labelSize = 22
    const textSize = 34
    const lineHeight = 42

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    // Сначала меряем текст, чтобы узнать высоту карточки
    context.font = `600 ${textSize}px ${FONT_FAMILY}`
    const lines = wrapText(context, text, width - padding * 2)
    const height = padding * 2 + labelSize + 16 + lines.length * lineHeight

    // Изменение размера canvas сбрасывает настройки context — поэтому font задаём ещё раз ниже
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
 * Светящаяся надпись без фона, например «LOW PERFORMANCE» над столом
 */
export const createGlowLabelTexture = (text, color = '#ff4d4d') => {
    const fontSize = 64
    const padding = 40

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    context.font = `800 ${fontSize}px ${FONT_FAMILY}`
    const textWidth = context.measureText(text).width

    canvas.width = Math.ceil(textWidth + padding * 2)
    canvas.height = fontSize + padding * 2

    context.font = `800 ${fontSize}px ${FONT_FAMILY}`
    context.textBaseline = 'middle'
    context.fillStyle = color
    context.shadowColor = color
    context.shadowBlur = 24
    context.fillText(text, padding, canvas.height / 2)

    return { texture: toTexture(canvas), aspect: canvas.width / canvas.height }
}

/**
 * Экран, который перерисовывается каждый раз при изменении данных
 * draw(context, width, height) — твоя функция рисования
 */
export const createScreenTexture = ({ width = 512, height = 288 }) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    const texture = toTexture(canvas)

    const redraw = (draw) => {
        context.clearRect(0, 0, width, height)
        draw(context, width, height, FONT_FAMILY)
        texture.needsUpdate = true // говорим Three.js, что картинку надо загрузить в GPU заново
    }

    return { texture, redraw }
}
