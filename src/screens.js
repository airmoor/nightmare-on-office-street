import { createScreenTexture, monoFontReady } from './canvasText.js'
import { CODE_FILES, rejections } from './content.js'
import { heroDesk, jobScreen } from './office.js'
import { pickRandom } from './utils.js'

// The hero's two monitors, drawn on canvas textures

/**
 * Code screen
 * The hero's main monitor shows an editor. While the player holds the monitor, text is typed character by character; let go and the cursor blinks.
 * Three files on a loop tell the story of the night: an urgent ticket → a performance review self-assessment → a resume.
 * Light theme: the screen is a light source in the dark office, and the material color (blue, green while working)
 * still tints the whole image, so the monitor glows as before, it just has something on it now
 */
const codeScreen = createScreenTexture({ width: 512, height: 288 })
heroDesk.userData.screen.material.map = codeScreen.texture
heroDesk.userData.screen.material.needsUpdate = true

const CODE_TYPE_SPEED = 38 // characters per second while the player holds the monitor
const CODE_IDLE_SPEED = 16 // on the start screen and in Look around the hero types on his own, unhurried
const CODE_FILE_PAUSE = 2.5 // seconds a finished file stays on screen before the next one opens
const code = { file: 0, typed: 0, doneAt: null, drawnChars: -1, drawnCursor: null }
const getCodeLength = (file) => file.lines.reduce((total, line) => total + line.length + 1, 0)

const drawCodeScreen = (showCursor) => {
    const file = CODE_FILES[code.file]
    codeScreen.redraw((context, width, height, font) => {
        context.fillStyle = '#eef2f8'
        context.fillRect(0, 0, width, height)
        context.textBaseline = 'middle'

        // Tab with the file name and a "burning" ticket
        context.fillStyle = '#d5deec'
        context.fillRect(0, 0, width, 34)
        context.font = `500 15px ${font}`
        context.fillStyle = '#1f2a3a'
        context.textAlign = 'left'
        context.fillText(file.name, 14, 17)
        context.fillStyle = '#c0392b'
        context.textAlign = 'right'
        context.fillText(file.ticket, width - 14, 17)

        // Typed lines. If they don't fit, show the last ones, as if the editor scrolled
        const lineHeight = 23
        const top = 44
        const maxLines = Math.floor((height - top - 30) / lineHeight)
        let left = Math.floor(code.typed)
        const shown = []
        for (const line of file.lines) {
            if (left <= 0) break
            shown.push(line.slice(0, left))
            left -= line.length + 1
        }
        if (shown.length === 0) shown.push('')
        const first = Math.max(0, shown.length - maxLines)

        context.font = `18px ${font}`
        shown.slice(first).forEach((text, index) => {
            const y = top + index * lineHeight + lineHeight / 2
            context.fillStyle = '#9aa6b8'
            context.textAlign = 'right'
            context.fillText(String(first + index + 1), 32, y)
            context.textAlign = 'left'
            const trimmed = text.trimStart()
            context.fillStyle = trimmed.startsWith('//') || trimmed.startsWith('#') ? '#4f7a57' : '#1b2433'
            context.fillText(text, 44, y)
            if (showCursor && first + index === shown.length - 1) {
                context.fillStyle = '#1b2433'
                context.fillRect(44 + context.measureText(text).width + 1, y - 10, 10, 20)
            }
        })

        // Status bar
        context.fillStyle = '#d5deec'
        context.fillRect(0, height - 26, width, 26)
        context.font = `13px ${font}`
        context.fillStyle = '#4a5568'
        context.fillText(file.status, 14, height - 13)
    })
}
drawCodeScreen(true)

/**
 * mode:
 *   'player' — the player drives it: text is typed only while `working` is true
 *   'auto'   — start screen and Look around: the hero types on his own
 *   'frozen' — finale: the screen freezes on whatever was typed
 */
export const updateCodeScreen = (elapsedTime, deltaTime, { mode, working = false }) => {
    if (mode === 'frozen') return

    let typing = working
    let speed = CODE_TYPE_SPEED
    if (mode === 'auto') {
        // On his own the hero types in bursts: quick, then frozen, staring at the screen
        typing = Math.sin(elapsedTime * 0.9) + Math.sin(elapsedTime * 2.3) * 0.5 > -0.3
        speed = CODE_IDLE_SPEED
        heroDesk.userData.person.position.y = typing ? Math.abs(Math.sin(elapsedTime * 25)) * 0.012 : 0
    }

    const total = getCodeLength(CODE_FILES[code.file])
    if (typing && code.typed < total) code.typed = Math.min(total, code.typed + speed * deltaTime)
    if (code.typed >= total) {
        if (code.doneAt === null) code.doneAt = elapsedTime
        if (elapsedTime - code.doneAt > CODE_FILE_PAUSE) {
            code.file = (code.file + 1) % CODE_FILES.length
            code.typed = 0
            code.doneAt = null
        }
    }

    // Cursor is solid while typing, blinking otherwise. Redraw only when something changed
    const showCursor = typing || Math.floor(elapsedTime * 2) % 2 === 0
    const chars = Math.floor(code.typed) + code.file * 10000
    if (chars !== code.drawnChars || showCursor !== code.drawnCursor) {
        code.drawnChars = chars
        code.drawnCursor = showCursor
        drawCodeScreen(showCursor)
    }
}

/**
 * Job applications
 * The counter on the second monitor: more and more applications, and the only replies are rejections
 */
export const applications = {
    sent: 211, // he's been applying for months
    interviews: 0,
    lastReply: rejections[0],
    nextAt: 1,
    interval: 1.6,
}

export const drawJobScreen = () => {
    jobScreen.redraw((context, width, height, font) => {
        context.fillStyle = '#0d1117'
        context.fillRect(0, 0, width, height)

        context.fillStyle = '#84949c'
        context.font = `500 22px ${font}`
        context.fillText('JOB APPLICATIONS', 28, 44)

        context.fillStyle = '#d4f1ff'
        context.font = `400 72px ${font}`
        context.fillText(String(applications.sent), 28, 128)
        context.fillStyle = '#84949c'
        context.font = `500 22px ${font}`
        context.fillText('sent', 32, 160)

        // Zero interviews is red. The first invitation (only at dawn) is green
        context.fillStyle = applications.interviews > 0 ? '#34d399' : '#ff6b6b'
        context.font = `400 72px ${font}`
        context.fillText(String(applications.interviews), 300, 128)
        context.fillStyle = '#84949c'
        context.font = `500 22px ${font}`
        context.fillText('interviews', 302, 160)

        // Monospace is wide: truncate the phrase so it fits on the screen
        context.fillStyle = '#c9d6dc'
        context.font = `italic 400 20px ${font}`
        const reply = applications.lastReply.length > 36
            ? `${applications.lastReply.slice(0, 35)}…`
            : applications.lastReply
        context.fillText(`“${reply}”`, 28, 240)
    })
}
drawJobScreen()
// Canvas doesn't wait for web fonts: redraw the screen once IBM Plex Mono has loaded
monoFontReady.then(drawJobScreen)

// 1–3 more applications, and sometimes a new rejection
export const sendApplications = () => {
    applications.sent += 1 + Math.floor(Math.random() * 3)
    if (Math.random() < 0.35) applications.lastReply = pickRandom(rejections)
    drawJobScreen()
}
