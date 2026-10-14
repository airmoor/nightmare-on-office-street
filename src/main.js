import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import GUI from 'lil-gui'
import { createCardTexture, createGlowLabelTexture, createScreenTexture, monoFontReady } from './canvasText.js'
import { createSound } from './sound.js'
import { BURSTS, CODE_FILES, endings, firingReasons, newsFeed, noiseFeed, rejections } from './content.js'
import { addToSet, readItem, readSet, STORAGE_KEYS, writeItem } from './storage.js'
import { createClock, hashNoise, isCoarsePointer, pickRandom, prefersReducedMotion, randomBetween, smoothstep } from './utils.js'

/**
 * Base
 */
// The panel only shows with #debug in the URL, e.g. localhost:5173/#debug
const gui = new GUI({ title: 'Debug' })
const updateDebugVisibility = () => gui.show(window.location.hash === '#debug')
updateDebugVisibility()
window.addEventListener('hashchange', updateDebugVisibility)
const canvas = document.querySelector('canvas.webgl')
// Long press is the core mechanic, so the browser's "Save image…" menu must not open on it
canvas.addEventListener('contextmenu', (event) => event.preventDefault())
const scene = new THREE.Scene()

const params = {
    background: '#05060a',
    fogDensity: 0.06,
    fogDensityGrowth: 0.015, // how much the fog thickens by the end of the story
    vignetteStrength: 0.55, // how dark the screen edges get at maximum stress
    heroLightIntensity: 25,
    cameraShake: 0.04,
}

const sound = createSound()
const clock = createClock()

scene.background = new THREE.Color(params.background)
scene.fog = new THREE.FogExp2(params.background, params.fogDensity)

/**
 * Textures
 */
// A soft light pool drawn on a canvas: white center -> transparent edge.
// It's a "fake" light: it looks like a lamp but costs the GPU almost nothing
const createLightPoolTexture = () => {
    const size = 256
    const poolCanvas = document.createElement('canvas')
    poolCanvas.width = size
    poolCanvas.height = size
    const context = poolCanvas.getContext('2d')
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.35)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    const texture = new THREE.CanvasTexture(poolCanvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}
const lightPoolTexture = createLightPoolTexture()

/**
 * Shared geometries & materials
 * One geometry shared by all desks instead of one per desk: faster
 */
const geometries = {
    deskTop: new THREE.BoxGeometry(1.6, 0.06, 0.8),
    deskLeg: new THREE.BoxGeometry(0.05, 0.75, 0.05),
    monitor: new THREE.BoxGeometry(0.7, 0.42, 0.04),
    screen: new THREE.PlaneGeometry(0.64, 0.36),
    monitorStand: new THREE.BoxGeometry(0.05, 0.2, 0.05),
    chairSeat: new THREE.BoxGeometry(0.5, 0.06, 0.5),
    chairBack: new THREE.BoxGeometry(0.5, 0.55, 0.06),
    chairLeg: new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8),
    torso: new THREE.CapsuleGeometry(0.2, 0.35, 4, 12),
    head: new THREE.SphereGeometry(0.16, 16, 16),
    thigh: new THREE.BoxGeometry(0.36, 0.14, 0.42),
    cord: new THREE.CylinderGeometry(0.01, 0.01, 2, 4),
    shade: new THREE.ConeGeometry(0.28, 0.22, 20, 1, true),
    bulb: new THREE.SphereGeometry(0.07, 12, 12),
    lightPool: new THREE.PlaneGeometry(3.2, 3.2),
}

const materials = {
    desk: new THREE.MeshStandardMaterial({ color: '#3a3f4a', roughness: 0.7 }),
    metal: new THREE.MeshStandardMaterial({ color: '#22252c', roughness: 0.4, metalness: 0.6 }),
    chair: new THREE.MeshStandardMaterial({ color: '#1b1d22', roughness: 0.8 }),
    shade: new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.5, side: THREE.DoubleSide }),
    skin: new THREE.MeshStandardMaterial({ color: '#c9a58c', roughness: 0.8 }),
    pants: new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.9 }),
}

const colors = {
    bulbOn: new THREE.Color('#ffd9a0'),
    bulbOff: new THREE.Color('#1a1a1a'),
    screenOn: new THREE.Color('#5d8bd6'),
    screenOff: new THREE.Color('#050608'),
    screenWork: new THREE.Color('#9be7c4'), // the hero's screen while he works
}

/**
 * Floor
 */
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.9 })
)
floor.rotation.x = -Math.PI * 0.5
floor.receiveShadow = true
scene.add(floor)

/**
 * Builders
 */
const createPerson = (shirtColor) => {
    const person = new THREE.Group()
    const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.9 })

    const torso = new THREE.Mesh(geometries.torso, shirt)
    torso.position.y = 0.98
    torso.rotation.x = -0.12 // slightly hunched towards the monitor
    person.add(torso)

    const head = new THREE.Mesh(geometries.head, materials.skin)
    head.position.set(0, 1.5, -0.08)
    person.add(head)

    const thighs = new THREE.Mesh(geometries.thigh, materials.pants)
    thighs.position.set(0, 0.55, -0.15)
    person.add(thighs)

    // Needed for the Logged off ending, when the hero stands up and walks away
    person.userData = { torso, thighs }

    return person
}

const createChair = () => {
    const chair = new THREE.Group()

    const seat = new THREE.Mesh(geometries.chairSeat, materials.chair)
    seat.position.y = 0.47
    chair.add(seat)

    const back = new THREE.Mesh(geometries.chairBack, materials.chair)
    back.position.set(0, 0.78, 0.25)
    chair.add(back)

    const leg = new THREE.Mesh(geometries.chairLeg, materials.metal)
    leg.position.y = 0.22
    chair.add(leg)

    return chair
}

const createDesk = ({ shirtColor }) => {
    const desk = new THREE.Group()

    // Desktop and legs
    const top = new THREE.Mesh(geometries.deskTop, materials.desk)
    top.position.y = 0.75
    desk.add(top)

    for (const [x, z] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) {
        const leg = new THREE.Mesh(geometries.deskLeg, materials.metal)
        leg.position.set(x, 0.375, z)
        desk.add(leg)
    }

    // Monitor: housing + glowing screen (MeshBasicMaterial ignores lighting)
    const stand = new THREE.Mesh(geometries.monitorStand, materials.metal)
    stand.position.set(0, 0.88, -0.22)
    desk.add(stand)

    const monitor = new THREE.Mesh(geometries.monitor, materials.metal)
    monitor.position.set(0, 1.15, -0.22)
    desk.add(monitor)

    const screen = new THREE.Mesh(
        geometries.screen,
        new THREE.MeshBasicMaterial({ color: colors.screenOn.clone() })
    )
    screen.position.set(0, 1.15, -0.199)
    desk.add(screen)

    // Chair and person sit in front of the desk (+z), facing the monitor (-z)
    const chair = createChair()
    chair.position.z = 0.65
    desk.add(chair)

    const person = createPerson(shirtColor)
    person.position.z = 0.65
    desk.add(person)

    // Pendant lamp
    const cord = new THREE.Mesh(geometries.cord, materials.metal)
    cord.position.y = 3.7
    desk.add(cord)

    const shade = new THREE.Mesh(geometries.shade, materials.shade)
    shade.position.y = 2.7
    desk.add(shade)

    const bulb = new THREE.Mesh(
        geometries.bulb,
        new THREE.MeshBasicMaterial({ color: colors.bulbOn.clone() })
    )
    bulb.position.y = 2.6
    desk.add(bulb)

    // Light pool on the floor under the lamp
    const lightPool = new THREE.Mesh(
        geometries.lightPool,
        new THREE.MeshBasicMaterial({
            color: colors.bulbOn,
            map: lightPoolTexture,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        })
    )
    lightPool.rotation.x = -Math.PI * 0.5
    lightPool.position.set(0, 0.01, 0.2)
    desk.add(lightPool)

    desk.traverse((child) => {
        if (child.isMesh && child !== lightPool) {
            child.castShadow = true
            child.receiveShadow = true
        }
    })

    // Everything we'll need to change later goes into userData
    desk.userData = {
        state: 'on', // 'on' | 'flickering' | 'off'
        flickerStart: 0,
        bulb,
        screen,
        lightPool,
        person,
        basePoolOpacity: lightPool.material.opacity,
    }

    return desk
}

/**
 * Office layout
 */
const office = {
    rows: 4,
    cols: 5,
    spacingX: 3.2,
    spacingZ: 3,
    heroRow: 2,
    heroCol: 2,
}

const colleagueShirts = ['#4b5563', '#6b7280', '#3f4d5c', '#5a5148', '#47524a', '#584b5a']

const colleagues = []
let heroDesk = null

for (let row = 0; row < office.rows; row++) {
    for (let col = 0; col < office.cols; col++) {
        const isHero = row === office.heroRow && col === office.heroCol
        const desk = createDesk({
            // The hero wears an orange hoodie: a small Halloween nod
            shirtColor: isHero ? '#d9772b' : colleagueShirts[(row * office.cols + col) % colleagueShirts.length],
        })
        desk.position.set(
            (col - (office.cols - 1) / 2) * office.spacingX,
            0,
            (row - (office.rows - 1) / 2) * office.spacingZ
        )
        scene.add(desk)

        if (isHero) heroDesk = desk
        else colleagues.push(desk)
    }
}

/**
 * Hero desk extras
 */
// A pumpkin on the hero's desk
const pumpkin = new THREE.Group()
const pumpkinBody = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 12),
    new THREE.MeshStandardMaterial({ color: '#e0701e', roughness: 0.6, emissive: '#3a1400' })
)
pumpkinBody.scale.y = 0.8
pumpkin.add(pumpkinBody)
const pumpkinStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.018, 0.05, 6),
    new THREE.MeshStandardMaterial({ color: '#3d4a1e' })
)
pumpkinStem.position.y = 0.09
pumpkin.add(pumpkinStem)
pumpkin.position.set(0.62, 0.86, 0.25)
pumpkin.traverse((child) => { if (child.isMesh) child.castShadow = true })
heroDesk.add(pumpkin)

// Second monitor: the hero spends all day applying for jobs on it
const jobScreen = createScreenTexture({ width: 512, height: 288 })

const jobMonitor = new THREE.Group()
const jobMonitorBody = new THREE.Mesh(geometries.monitor, materials.metal)
jobMonitorBody.castShadow = true
jobMonitor.add(jobMonitorBody)
const jobMonitorScreen = new THREE.Mesh(
    geometries.screen,
    new THREE.MeshBasicMaterial({ map: jobScreen.texture })
)
jobMonitorScreen.position.z = 0.021
jobMonitor.add(jobMonitorScreen)
jobMonitor.scale.setScalar(0.8)
jobMonitor.position.set(0.62, 1.1, -0.12)
jobMonitor.rotation.y = -0.45
heroDesk.add(jobMonitor)

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

const updateCodeScreen = (elapsedTime, deltaTime) => {
    const { phase } = experience
    let typing = false
    let speed = CODE_TYPE_SPEED

    if (phase === 'running') {
        typing = game.working
    } else if (phase === 'intro' || phase === 'explore') {
        // On his own the hero types in bursts: quick, then frozen, staring at the screen
        typing = Math.sin(elapsedTime * 0.9) + Math.sin(elapsedTime * 2.3) * 0.5 > -0.3
        speed = CODE_IDLE_SPEED
        heroDesk.userData.person.position.y = typing ? Math.abs(Math.sin(elapsedTime * 25)) * 0.012 : 0
    } else {
        return // finale: the screen freezes on whatever was typed
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

// The point every notification flies to: the hero's head
const heroHead = heroDesk.position.clone().add(new THREE.Vector3(0, 1.5, 0.57))

// An invisible box around the hero's monitor: much easier to hit with a finger than the screen itself.
// visible: false on the material means the mesh isn't drawn, but the Raycaster still finds it
const workHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.8, 0.6),
    new THREE.MeshBasicMaterial({ visible: false })
)
workHitbox.position.set(0, 1.1, -0.1)
heroDesk.add(workHitbox)

// A similar invisible sphere around the hero's lamp: it switches the light off and leaves (Logged off ending)
const lampHitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 8),
    new THREE.MeshBasicMaterial({ visible: false })
)
lampHitbox.position.set(0, 2.65, 0)
heroDesk.add(lampHitbox)
const lampHold = { holding: false, progress: 0 } // 0 → 1 while the player holds the lamp

/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight('#8090b0', 0.16)
scene.add(ambientLight)

// Cold "moonlight" from the windows so silhouettes read
const moonLight = new THREE.DirectionalLight('#6f86b8', 0.45)
moonLight.position.set(-8, 10, -6)
scene.add(moonLight)

// The only real warm light is above the hero. It's the only one that casts shadows
const heroLight = new THREE.SpotLight('#ffd9a0', params.heroLightIntensity, 8, Math.PI * 0.28, 0.6, 2)
heroLight.position.set(0, 2.6, 0)
heroLight.target.position.set(0, 0, 0.2)
heroLight.castShadow = true
heroLight.shadow.mapSize.set(1024, 1024)
heroLight.shadow.camera.near = 0.5
heroLight.shadow.camera.far = 6
heroDesk.add(heroLight, heroLight.target)

// Bluish monitor glow on the hero's face
const monitorGlow = new THREE.PointLight('#6f9cff', 1.5, 2.5, 2)
monitorGlow.position.set(0, 1.15, 0.05)
heroDesk.add(monitorGlow)

/**
 * Firing colleagues
 * The lamp flickers for ~1.2 seconds, then goes out and the person disappears
 */
const FLICKER_DURATION = 1.2

const fireColleague = (desk) => {
    if (desk.userData.state !== 'on') return
    desk.userData.state = 'flickering'
    desk.userData.flickerStart = clock.getElapsedTime()
    showFiringLabel(desk)
    sound.buzz()
}

const fireRandomColleague = () => {
    const working = colleagues.filter((desk) => desk.userData.state === 'on')
    if (working.length === 0) return null
    const desk = pickRandom(working)
    fireColleague(desk)
    return desk
}

/**
 * Firing labels
 * The reason for the firing pops up above the desk: it appears, slowly rises and fades
 */
const LABEL_LIFETIME = 3.5
const floatingLabels = []

const showFiringLabel = (desk, reason = pickRandom(firingReasons)) => {
    const { texture, aspect } = createGlowLabelTexture(reason)
    // A Sprite always faces the camera, which is handy for labels
    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, opacity: 0 })
    )
    sprite.renderOrder = 5 // above lamps and cords, but below cards
    const height = 0.4 * getSpriteScale()
    sprite.scale.set(height * aspect, height, 1)
    sprite.position.copy(desk.position)
    sprite.position.y = 2.0
    scene.add(sprite)

    floatingLabels.push({ sprite, start: clock.getElapsedTime() })
}

const updateFiringLabels = (elapsedTime) => {
    // Iterate backwards because we remove items as we go
    for (let i = floatingLabels.length - 1; i >= 0; i--) {
        const { sprite, start } = floatingLabels[i]
        const t = elapsedTime - start

        if (t > LABEL_LIFETIME) {
            scene.remove(sprite)
            sprite.material.map.dispose()
            sprite.material.dispose()
            floatingLabels.splice(i, 1)
            continue
        }

        const fadeIn = Math.min(t / 0.3, 1)
        const fadeOut = Math.min((LABEL_LIFETIME - t) / 1, 1)
        sprite.material.opacity = Math.min(fadeIn, fadeOut)
        sprite.position.y = 2.0 + t * 0.15
    }
}

// power: 1 is fully lit, 0 is darkness
const setDeskPower = (desk, power) => {
    const { bulb, screen, lightPool, basePoolOpacity } = desk.userData
    bulb.material.color.lerpColors(colors.bulbOff, colors.bulbOn, power)
    screen.material.color.lerpColors(colors.screenOff, colors.screenOn, power)
    lightPool.material.opacity = basePoolOpacity * power
}

const resetOffice = () => {
    for (const desk of colleagues) {
        desk.userData.state = 'on'
        desk.userData.person.visible = true
        setDeskPower(desk, 1)
    }
    removeGhosts()
    story.firedCount = 0
    story.nextFireAt = clock.getElapsedTime() + story.startDelay
}

const updateColleagues = (elapsedTime) => {
    for (const desk of colleagues) {
        if (desk.userData.state !== 'flickering') continue

        const t = elapsedTime - desk.userData.flickerStart
        if (t < FLICKER_DURATION) {
            // Pseudo-random flicker, ~12 times per second
            setDeskPower(desk, hashNoise(Math.floor(t * 12)) > 0.45 ? 1 : 0.1)
        } else {
            setDeskPower(desk, 0)
            desk.userData.person.visible = false
            desk.userData.state = 'off'
            spawnGhost(desk, elapsedTime)
        }
    }
}

/**
 * Ghosts
 * A fired colleague rises from the chair as a ghost carrying a box of belongings and wanders around the office
 */
const createGhostGeometry = () => {
    // LatheGeometry spins a profile around the Y axis, like a potter's wheel
    const profile = [
        new THREE.Vector2(0.3, 0),
        new THREE.Vector2(0.29, 0.2),
        new THREE.Vector2(0.27, 0.45),
        new THREE.Vector2(0.24, 0.62),
        new THREE.Vector2(0.18, 0.76),
        new THREE.Vector2(0.1, 0.84),
        new THREE.Vector2(0.001, 0.87),
    ]
    const geometry = new THREE.LatheGeometry(profile, 32)

    // Wavy hem: move the bottom vertices up and down along a sine wave
    const position = geometry.attributes.position
    for (let i = 0; i < position.count; i++) {
        if (position.getY(i) > 0.01) continue
        const angle = Math.atan2(position.getZ(i), position.getX(i))
        position.setY(i, Math.sin(angle * 7) * 0.05)
    }
    geometry.computeVertexNormals()

    return geometry
}

const ghostGeometries = {
    body: createGhostGeometry(),
    eye: new THREE.SphereGeometry(0.035, 8, 8),
    box: new THREE.BoxGeometry(0.34, 0.2, 0.24),
}

const ghostMaterials = {
    body: new THREE.MeshStandardMaterial({
        color: '#dfe8ff',
        emissive: '#6c7fa8',
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
    }),
    eye: new THREE.MeshBasicMaterial({ color: '#0a0a0f' }),
    box: new THREE.MeshStandardMaterial({ color: '#8a6a42', roughness: 0.9 }),
}

const GHOST_APPEAR_DURATION = 2
const ghosts = []

const createGhost = () => {
    const ghost = new THREE.Group()

    ghost.add(new THREE.Mesh(ghostGeometries.body, ghostMaterials.body))

    // Eyes and box are at the front, i.e. +z: that's where the ghost "looks"
    for (const x of [-0.07, 0.07]) {
        const eye = new THREE.Mesh(ghostGeometries.eye, ghostMaterials.eye)
        eye.position.set(x, 0.66, 0.2)
        ghost.add(eye)
    }

    const box = new THREE.Mesh(ghostGeometries.box, ghostMaterials.box)
    box.position.set(0, 0.32, 0.3)
    ghost.add(box)

    return ghost
}

const spawnGhost = (desk, elapsedTime) => {
    const ghost = createGhost()
    const direction = Math.random() < 0.5 ? -1 : 1

    ghost.userData = {
        start: elapsedTime,
        origin: desk.position.clone().add(new THREE.Vector3(0, 0, 0.65)), // the chair
        radius: 1.5 + Math.random() * 2,
        speed: (0.15 + Math.random() * 0.2) * direction,
        phase: Math.random() * Math.PI * 2,
    }
    ghost.scale.setScalar(0)
    ghost.position.copy(ghost.userData.origin)
    scene.add(ghost)
    ghosts.push(ghost)
}

const removeGhosts = () => {
    for (const ghost of ghosts) scene.remove(ghost)
    ghosts.length = 0
}

// In the finale the ghosts dissolve: 1 → 0
let ghostVisibility = 1

// In the Logged off ending the ghosts stop and watch the hero leave
const ghostWatch = {
    pausedAt: null, // when the ghosts stopped moving
    target: null, // what they're looking at (a point in the scene)
}

const ghostTarget = new THREE.Vector3()

const updateGhosts = (elapsedTime) => {
    for (const ghost of ghosts) {
        const { start, origin, radius, speed, phase } = ghost.userData
        const t = elapsedTime - start

        // Appearing: grows and rises from the chair (easeOut: fast at first, smooth at the end)
        const appear = Math.min(t / GHOST_APPEAR_DURATION, 1)
        const eased = appear * (2 - appear)
        ghost.scale.setScalar(eased * ghostVisibility)

        // Then wanders in a circle. Subtract cos/sin(phase) so the circle starts exactly at the chair.
        // Once the ghosts stop, wander time freezes at the moment they stopped
        const walkedTime = ghostWatch.pausedAt === null ? t : Math.min(t, ghostWatch.pausedAt - start)
        const wanderTime = Math.max(0, walkedTime - GHOST_APPEAR_DURATION)
        const angle = phase + wanderTime * speed
        ghost.position.x = origin.x + (Math.cos(angle) - Math.cos(phase)) * radius
        ghost.position.z = origin.z + (Math.sin(angle) - Math.sin(phase)) * radius
        ghost.position.y = THREE.MathUtils.lerp(0.3, 0.9, eased) + Math.sin(elapsedTime * 2 + phase) * 0.08

        if (ghostWatch.target) {
            // Slowly turn towards the hero. The ghost faces +z, hence atan2(dx, dz)
            ghostTarget.copy(ghostWatch.target).sub(ghost.position)
            const targetAngle = Math.atan2(ghostTarget.x, ghostTarget.z)
            const turn = Math.atan2(Math.sin(targetAngle - ghost.rotation.y), Math.cos(targetAngle - ghost.rotation.y))
            ghost.rotation.y += turn * 0.05
        } else if (wanderTime > 0) {
            // Face the direction of movement (tangent to the circle)
            ghost.rotation.y = Math.atan2(-Math.sin(angle) * speed, Math.cos(angle) * speed)
        }
    }
}

/**
 * Story timeline
 * Each firing comes sooner than the previous one:
 * interval = firstInterval * acceleration ^ firedCount, but never less than minInterval
 */
const story = {
    autoplay: true,
    startDelay: 3,
    firstInterval: 9,
    acceleration: 0.9,
    minInterval: 2,
    firedCount: 0,
    nextFireAt: 3,
}

// 0 is the start of the story, 1 means everyone is fired
const getStoryProgress = () => story.firedCount / colleagues.length

const updateStory = (elapsedTime) => {
    if (experience.phase !== 'running' || isTutorial() || !story.autoplay || elapsedTime < story.nextFireAt) return

    if (fireRandomColleague()) story.firedCount++

    const interval = Math.max(
        story.minInterval,
        story.firstInterval * story.acceleration ** story.firedCount
    )
    story.nextFireAt = elapsedTime + interval
}

/**
 * News feed
 * Cards fly out of the dark towards the hero's head. The further the story goes, the more there are and the faster they fly
 */
// One texture per text: if a card repeats, don't draw it again
const cardTextures = new Map()
const getCardTexture = (item) => {
    if (!cardTextures.has(item.text)) cardTextures.set(item.text, createCardTexture(item))
    return cardTextures.get(item.text)
}

const flyingCards = []

/**
 * Bursts
 * The night isn't an even stream; it has two set pieces. At 22:00, a cold open: the lamp of the colleague across the desk goes out
 * and a volley of three notifications arrives, so the player is busy from the first seconds and gets what the game is about.
 * At 02:00, a wave of layoffs: two lamps go out at once and a second volley arrives, so the middle of the night doesn't sag.
 * After each volley there is a short pause, then the regular stream
 */
const BURST_FIRE_DELAY = 0.3 // the lamp goes out slightly before the cards
const BURST_CARD_STEP = 0.7 // interval between cards in a volley
const BURST_BREATH = 3.5 // pause after a volley before the regular stream resumes
const bursts = { queue: [] } // timed events: { at, fire } or { at, item }

const getNearestColleague = () => {
    let nearest = null
    let nearestDistance = Infinity
    for (const desk of colleagues) {
        if (desk.userData.state !== 'on') continue
        const distance = desk.position.distanceTo(heroDesk.position)
        if (distance < nearestDistance) {
            nearest = desk
            nearestDistance = distance
        }
    }
    return nearest
}

// Queues all of the night's volleys. Called in beginShift, once the shift length is known
const scheduleBursts = (elapsedTime) => {
    bursts.queue = []
    for (const burst of BURSTS) {
        const start = elapsedTime + burst.at * shift.duration
        bursts.queue.push({ at: start + BURST_FIRE_DELAY, fire: burst.fire })
        burst.cards.forEach((item, index) => {
            bursts.queue.push({ at: start + BURST_FIRE_DELAY + 0.2 + index * BURST_CARD_STEP, item, last: index === burst.cards.length - 1 })
        })
        // A volley at the very start: the regular stream waits until it's over
        if (burst.at === 0) {
            news.nextSpawnAt = start + BURST_FIRE_DELAY + 0.2 + (burst.cards.length - 1) * BURST_CARD_STEP + BURST_BREATH
        }
    }
    // Regular firings start one regular interval after the neighbour, not after startDelay
    story.nextFireAt = elapsedTime + BURST_FIRE_DELAY + story.firstInterval * story.acceleration
}

const updateBursts = (elapsedTime) => {
    if (experience.phase !== 'running') {
        bursts.queue.length = 0
        return
    }
    while (bursts.queue.length && elapsedTime >= bursts.queue[0].at) {
        const event = bursts.queue.shift()
        if (event.fire === 'neighbour') {
            const neighbour = getNearestColleague()
            if (neighbour) {
                fireColleague(neighbour)
                story.firedCount++
            }
        } else if (event.fire) {
            for (let i = 0; i < event.fire; i++) if (fireRandomColleague()) story.firedCount++
        }
        if (event.item) {
            spawnCard(event.item, elapsedTime)
            // After the last card of a volley, pause the regular stream
            if (event.last) news.nextSpawnAt = Math.max(news.nextSpawnAt, elapsedTime + BURST_BREATH)
        }
    }
}

const news = {
    nextSpawnAt: 1.5,
    feedIndex: 0,
    // Intervals and speed at the start and at the end of the story
    spawnIntervalStart: 3.5,
    spawnIntervalEnd: 0.9,
    flightDurationStart: 9,
    flightDurationEnd: 3.5,
}

const SPAWN_RADIUS_MIN = 8
const SPAWN_RADIUS_MAX = 11
const DISMISS_DURATION = 0.25

/**
 * Noise
 * From Middle on, some notifications are noise: mailing lists, LinkedIn, #random. They are grey and semi-transparent,
 * so they can be told apart from important ones at a glance, without reading the text.
 * Noise is harmless: if it lands, nothing happens; if you click it, you just wasted time. No new rules:
 * players notice on their own that grey ones can be ignored and learn to choose where to spend their clicks
 */
const NOISE_OPACITY = 0.7
const NOISE_SCALE = 0.85

// The level sets the share of noise (game.noiseChance). On Junior it's 0, the feed is as before
const nextFeedItem = () => {
    if (Math.random() < game.noiseChance) return pickRandom(noiseFeed)
    return newsFeed[news.feedIndex++ % newsFeed.length]
}

// A random point on a ring around the hero, somewhere in the dark.
// Skip the sector on the camera side: a card from there flies straight into the lens and blows up into a blurry blob covering half the screen
const CAMERA_SIDE_GAP = THREE.MathUtils.degToRad(50)
const randomSpawnPoint = () => {
    const cameraAngle = Math.atan2(camera.position.z - heroHead.z, camera.position.x - heroHead.x)
    const angle = cameraAngle + CAMERA_SIDE_GAP + Math.random() * (Math.PI * 2 - CAMERA_SIDE_GAP * 2)
    const radius = THREE.MathUtils.lerp(SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX, Math.random()) * SPAWN_SCALE
    return new THREE.Vector3(
        heroHead.x + Math.cos(angle) * radius,
        2.5 + Math.random() * 2.5,
        heroHead.z + Math.sin(angle) * radius
    )
}

// from: where it starts (a random point in the dark by default); duration: a fixed flight time.
// Returns the created card
const spawnCard = (item, elapsedTime, { from = randomSpawnPoint(), duration: fixedDuration } = {}) => {
    const { texture, aspect } = getCardTexture(item)
    // depthTest: false so lamps, cords and ghosts never hide the card: it has to be read and clicked in time.
    // fog: false so distant cards don't sink into the fog. Order: labels (5) → cards (6) → HOLD TO WORK (10)
    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, fog: false, opacity: 0 })
    )
    sprite.renderOrder = 6
    const height = (item.noise ? 0.45 * NOISE_SCALE : 0.45) * getCardScale()
    sprite.scale.set(height * aspect, height, 1)
    sprite.position.copy(from)
    scene.add(sprite)

    // Flight time depends on distance: a card spawned closer arrives sooner
    const baseDuration = THREE.MathUtils.lerp(news.flightDurationStart, news.flightDurationEnd, getNightDifficulty())
    const averageRadius = (SPAWN_RADIUS_MIN + SPAWN_RADIUS_MAX) / 2 * SPAWN_SCALE
    const duration = fixedDuration ?? Math.max(1.5, baseDuration * from.distanceTo(heroHead) / averageRadius)

    const card = {
        item,
        maxOpacity: item.noise ? NOISE_OPACITY : 1,
        sprite,
        from,
        baseScale: sprite.scale.clone(),
        start: elapsedTime,
        duration,
        dismissedAt: null,
    }
    flyingCards.push(card)
    sound.ping()
    return card
}

const removeCard = (index) => {
    const card = flyingCards[index]
    scene.remove(card.sprite)
    card.sprite.material.dispose() // leave the texture alone, it's cached
    flyingCards.splice(index, 1)
}

// Dismissing a notification brings a little relief, but sometimes a new one pops up in its place
const dismissCard = (card) => {
    const elapsedTime = clock.getElapsedTime()
    card.dismissedAt = elapsedTime
    sound.pop()

    // Noise: it closes and that's it. No points, no relief, no new card, just time spent
    if (card.item.noise) return

    addDismissScore(card.sprite.position)
    if (experience.phase === 'running') {
        game.dismissed++
        game.lastActionAt = elapsedTime
    }
    game.stress = Math.max(0, game.stress - game.stressReliefPerDismiss)

    // No extra cards during the tutorial: the player learns on a single one
    if (!isTutorial() && Math.random() < game.respawnChance) {
        const offset = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            .normalize()
            .multiplyScalar(0.8)
        spawnCard(nextFeedItem(), elapsedTime, { from: card.sprite.position.clone().add(offset) })
    }
}

const updateNews = (elapsedTime) => {
    const progress = getNightDifficulty()

    if (experience.phase === 'running' && !isTutorial() && !shift.over && elapsedTime >= news.nextSpawnAt) {
        spawnCard(nextFeedItem(), elapsedTime)
        // Increase the rate (cards per second) linearly rather than shrinking the interval. Otherwise 1/interval
        // shoots up hyperbolically towards morning: steady until 04:00, then almost twice as many cards in the last hour
        const rate = THREE.MathUtils.lerp(1 / news.spawnIntervalStart, 1 / news.spawnIntervalEnd, progress)
        news.nextSpawnAt = elapsedTime + 1 / rate
    }

    for (let i = flyingCards.length - 1; i >= 0; i--) {
        const card = flyingCards[i]

        // A dismissed card briefly "pops": it grows and vanishes
        if (card.dismissedAt !== null) {
            const dismissT = (elapsedTime - card.dismissedAt) / DISMISS_DURATION
            if (dismissT >= 1) {
                removeCard(i)
                continue
            }
            card.sprite.scale.copy(card.baseScale).multiplyScalar(1 + dismissT * 0.5)
            card.sprite.material.opacity = (1 - dismissT) * card.maxOpacity
            continue
        }

        // Frozen ending: time has stopped and the cards just hang in the air around the hero
        if (experience.cardsFrozen) continue

        const t = (elapsedTime - card.start) / card.duration // 0 → 1

        if (t >= 1) {
            removeCard(i)
            // Noise landed and nothing happens. Harmless
            if (!card.item.noise) onCardHit()
            else showCallout('noise', 'Grey ones are noise — <strong>safe to ignore</strong>', heroHead)
            continue
        }

        // The night's first noise card, once it's actually visible (at spawn it's still in the dark off-screen)
        if (card.item.noise && t > CALLOUT_CARD_PROGRESS) {
            showCallout('noise', 'Grey ones are noise — <strong>safe to ignore</strong>', card.sprite.position)
        }

        // t * t: slow at first, fast at the end, so the card "pounces"
        card.sprite.position.lerpVectors(card.from, heroHead, t * t)

        // Fades in at the start, fades and shrinks right at the head
        const fadeIn = Math.min(t / 0.1, 1)
        const fadeOut = Math.min((1 - t) / 0.15, 1)
        card.sprite.material.opacity = Math.min(fadeIn, fadeOut) * card.maxOpacity
        card.sprite.scale.copy(card.baseScale).multiplyScalar(0.4 + 0.6 * fadeOut)
    }
}

/**
 * Job applications
 * The counter on the second monitor: more and more applications, and the only replies are rejections
 */
const applications = {
    sent: 211, // he's been applying for months
    interviews: 0,
    lastReply: rejections[0],
    nextAt: 1,
    interval: 1.6,
}

const drawJobScreen = () => {
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
const sendApplications = () => {
    applications.sent += 1 + Math.floor(Math.random() * 3)
    if (Math.random() < 0.35) applications.lastReply = pickRandom(rejections)
    drawJobScreen()
}

const updateApplications = (elapsedTime) => {
    if (experience.phase !== 'running' || isTutorial() || elapsedTime < applications.nextAt) return
    applications.nextAt = elapsedTime + applications.interval
    sendApplications()
}

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
}

// Hint sprites recompute their size when the screen rotates
const spriteScaleUpdaters = []

window.addEventListener('resize', () => {
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight
    sizes.pixelRatio = Math.min(window.devicePixelRatio, 2)

    camera.aspect = sizes.width / sizes.height
    camera.fov = getCameraFov()
    camera.updateProjectionMatrix()
    if (experience.phase === 'intro' || experience.phase === 'running') applyCameraDistance()
    for (const update of spriteScaleUpdaters) update()

    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(sizes.pixelRatio)
})

/**
 * Camera
 */
// On a phone the whole office isn't needed: the hero and what's flying at him matter more.
// So in portrait the camera is closer, the angle a bit wider, and labels and cards are larger
const isPortrait = () => sizes.width < sizes.height
const getCameraFov = () => (isPortrait() ? 55 : 45)
const CAMERA_DISTANCE_PORTRAIT = 12
// On wide screens the camera is also closer than the original spot (≈13.6): the hero and cards are 1.5× larger and the room is still visible
const CAMERA_DISTANCE_LANDSCAPE = 9
const getSpriteScale = () => (isPortrait() ? 1.3 : 1)
// Cards get even larger: they carry text that has to be read on the fly
const getCardScale = () => (isPortrait() ? 1.5 : 1)
// Cards spawn closer to the hero than the edge of the office, otherwise on a narrow screen they spend half the flight off-frame.
// Same for any orientation, so the pace doesn't depend on how the phone is held
const SPAWN_SCALE = 0.75

const camera = new THREE.PerspectiveCamera(getCameraFov(), sizes.width / sizes.height, 0.1, 100)
camera.position.set(7, 7.5, 11)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.target.copy(heroDesk.position).add(new THREE.Vector3(0, 0.8, 0))
controls.enableDamping = true
const MAX_POLAR_ANGLE = Math.PI * 0.45 // don't let the camera look under the floor
controls.maxPolarAngle = MAX_POLAR_ANGLE
controls.minDistance = 3
controls.maxDistance = 22

const applyCameraDistance = () => {
    const distance = isPortrait() ? CAMERA_DISTANCE_PORTRAIT : CAMERA_DISTANCE_LANDSCAPE
    camera.position.sub(controls.target).setLength(distance).add(controls.target)
}
applyCameraDistance()

/**
 * Camera modes
 * During the shift the camera is nearly fixed: the office can be turned a little, but not sideways,
 * zoomed or panned; otherwise a stray swipe that misses a card ruins the whole frame.
 * The camera is free in Look around mode (no game) and on the final screen
 */
const gameplayView = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
const GAMEPLAY_ROTATE_RANGE = THREE.MathUtils.degToRad(15) // how far the office can be turned left and right
const GAMEPLAY_TILT_RANGE = THREE.MathUtils.degToRad(8) // and up and down

const lockCamera = () => {
    controls.minAzimuthAngle = gameplayView.theta - GAMEPLAY_ROTATE_RANGE
    controls.maxAzimuthAngle = gameplayView.theta + GAMEPLAY_ROTATE_RANGE
    controls.minPolarAngle = gameplayView.phi - GAMEPLAY_TILT_RANGE
    controls.maxPolarAngle = Math.min(MAX_POLAR_ANGLE, gameplayView.phi + GAMEPLAY_TILT_RANGE)
    controls.enableZoom = false
    controls.enablePan = false
    controls.rotateSpeed = 0.4
}

const unlockCamera = () => {
    controls.minAzimuthAngle = -Infinity
    controls.maxAzimuthAngle = Infinity
    controls.minPolarAngle = 0
    controls.maxPolarAngle = MAX_POLAR_ANGLE
    controls.enableZoom = true
    controls.enablePan = true
    controls.rotateSpeed = 1
}

// On the start screen the camera orbits the office, so by the time the shift starts it can be facing anywhere.
// Ease it back to the gameplay view first and only then apply the limits, otherwise the frame snaps to the boundary
const CAMERA_RETURN_DURATION = 1.2
const cameraReturn = { active: false, progress: 0, from: new THREE.Spherical() }
const cameraOffset = new THREE.Vector3()

const startCameraReturn = () => {
    cameraReturn.from.setFromVector3(cameraOffset.copy(camera.position).sub(controls.target))
    cameraReturn.progress = 0
    cameraReturn.active = true
}

const updateCameraReturn = (deltaTime) => {
    if (!cameraReturn.active) return
    cameraReturn.progress = Math.min(1, cameraReturn.progress + deltaTime / CAMERA_RETURN_DURATION)
    const t = cameraReturn.progress
    const eased = smoothstep(t)
    // Take the short way round, even if auto-rotate has wound up more than a full turn
    const fullTurn = Math.PI * 2
    const thetaDelta = ((gameplayView.theta - cameraReturn.from.theta) % fullTurn + fullTurn * 1.5) % fullTurn - Math.PI
    const view = new THREE.Spherical(
        cameraReturn.from.radius,
        THREE.MathUtils.lerp(cameraReturn.from.phi, gameplayView.phi, eased),
        cameraReturn.from.theta + thetaDelta * eased
    )
    camera.position.copy(controls.target).add(cameraOffset.setFromSpherical(view))
    if (t === 1) {
        cameraReturn.active = false
        if (experience.phase === 'running') lockCamera()
    }
}

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(sizes.pixelRatio)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping

/**
 * Pointer interaction
 * The Raycaster casts a ray from the camera through the point under the cursor and finds what it hits
 */
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const cardScreenPosition = new THREE.Vector3()

// Padding around a card in pixels: a moving target is hard to hit precisely, so we forgive near misses
const CARD_HIT_PADDING = 18

/**
 * Find the card under the cursor in screen pixels rather than with a ray:
 * that lets us add padding around the card and makes it much easier to hit
 */
const getCardUnderPointer = (event) => {
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    let closestCard = null
    let closestDistance = Infinity

    for (const card of flyingCards) {
        if (card.dismissedAt !== null) continue

        cardScreenPosition.copy(card.sprite.position).project(camera)
        if (cardScreenPosition.z > 1) continue // card is behind the camera
        const x = (cardScreenPosition.x + 1) / 2 * sizes.width
        const y = (1 - cardScreenPosition.y) / 2 * sizes.height

        // How many screen pixels one scene unit covers at the card's distance
        const distance = camera.position.distanceTo(card.sprite.position)
        const pixelsPerUnit = sizes.height / (2 * distance * tanHalfFov)
        const halfWidth = card.sprite.scale.x * pixelsPerUnit / 2 + CARD_HIT_PADDING
        const halfHeight = card.sprite.scale.y * pixelsPerUnit / 2 + CARD_HIT_PADDING

        const isInside = Math.abs(event.clientX - x) <= halfWidth && Math.abs(event.clientY - y) <= halfHeight
        // If cards overlap, take the one closest to the camera: it's drawn on top
        if (isInside && distance < closestDistance) {
            closestCard = card
            closestDistance = distance
        }
    }

    return closestCard
}

const isPointerOn = (event, object) => {
    // Convert pixels to the -1..1 coordinates the Raycaster expects
    pointer.x = (event.clientX / sizes.width) * 2 - 1
    pointer.y = -(event.clientY / sizes.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    return raycaster.intersectObject(object).length > 0
}

const isPointerOnMonitor = (event) => isPointerOn(event, workHitbox)
const isPointerOnLamp = (event) => canLogOff() && isPointerOn(event, lampHitbox)

// While a finger or mouse button is busy with a card or the monitor, don't rotate the camera
let isPointerBusy = false

const holdPointer = () => {
    isPointerBusy = true
    controls.enabled = false
}

const releasePointer = () => {
    game.working = false
    lampHold.holding = false
    if (!isPointerBusy) return
    isPointerBusy = false
    if (experience.phase === 'running') controls.enabled = true
}

canvas.addEventListener('pointerdown', (event) => {
    if (experience.phase !== 'running') return

    // Dismiss the card on press, not on release:
    // in the 100–200 ms between them a fast card can fly out from under the cursor
    const card = getCardUnderPointer(event)
    if (card) {
        dismissCard(card)
        holdPointer()
        return
    }

    // Holding the monitor: the hero works
    if (isPointerOnMonitor(event)) {
        game.working = true
        holdPointer()
        return
    }

    // Holding his own lamp: the light slowly dims; hold to the end and he switches it off and leaves.
    // A hold rather than a tap: on phones the lamp is next to the monitor, and a stray tap used to end the night
    if (isPointerOnLamp(event)) {
        lampHold.holding = true
        holdPointer()
    }
})

canvas.addEventListener('pointerup', releasePointer)
// Finger left the screen or the browser cancelled the touch: release too
canvas.addEventListener('pointercancel', releasePointer)
canvas.addEventListener('pointerleave', releasePointer)

canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return
    const isInteractive = experience.phase === 'running'
        && (getCardUnderPointer(event) || isPointerOnMonitor(event) || isPointerOnLamp(event))
    canvas.style.cursor = isInteractive ? 'pointer' : ''
})

/**
 * Debug
 */
const sceneFolder = gui.addFolder('Scene')
sceneFolder.add(params, 'fogDensity').min(0).max(0.2).step(0.001).name('fog density')
sceneFolder.add(params, 'fogDensityGrowth').min(0).max(0.1).step(0.001).name('fog growth')
sceneFolder.add(params, 'vignetteStrength').min(0).max(1).step(0.01).name('vignette strength')
sceneFolder.add(params, 'cameraShake').min(0).max(0.2).step(0.001).name('camera shake')
sceneFolder.addColor(params, 'background').onChange((value) => {
    scene.background.set(value)
    scene.fog.color.set(value)
})

const lightsFolder = gui.addFolder('Lights')
lightsFolder.add(ambientLight, 'intensity').min(0).max(1).step(0.01).name('ambient')
lightsFolder.add(moonLight, 'intensity').min(0).max(2).step(0.01).name('moon')
lightsFolder.add(params, 'heroLightIntensity').min(0).max(80).step(0.5).name('hero lamp')
lightsFolder.add(monitorGlow, 'intensity').min(0).max(10).step(0.1).name('monitor glow')

const storyFolder = gui.addFolder('Story')
storyFolder.add(story, 'autoplay').onChange((value) => {
    if (value) story.nextFireAt = clock.getElapsedTime() + 1
})
storyFolder.add(story, 'firstInterval').min(1).max(20).step(0.5).name('first interval (s)')
storyFolder.add(story, 'acceleration').min(0.5).max(1).step(0.01)
storyFolder.add(story, 'minInterval').min(0.5).max(5).step(0.1).name('min interval (s)')
storyFolder.add({ fireRandomColleague }, 'fireRandomColleague').name('🔥 fire random colleague')
storyFolder.add({ resetOffice }, 'resetOffice').name('↺ reset office')

const newsFolder = gui.addFolder('News')
newsFolder.add(news, 'spawnIntervalStart').min(0.5).max(10).step(0.1).name('interval at start')
newsFolder.add(news, 'spawnIntervalEnd').min(0.1).max(5).step(0.1).name('interval at end')
newsFolder.add(news, 'flightDurationStart').min(1).max(20).step(0.5).name('flight at start')
newsFolder.add(news, 'flightDurationEnd').min(1).max(20).step(0.5).name('flight at end')

/**
 * Experience
 * Story phases: intro (start screen) → running → ending (laptop closed, dawn) → done
 */
const experience = {
    phase: 'intro',
    ending: null, // 'calm' | 'fired' | 'burnout' | 'frozen' | 'loggedOff'
    endingsFound: new Set(),
    endingTime: '',
    endingStats: null, // this night's numbers for the ending text: time, how many dismissed, how many missed
    cardsFrozen: false, // Frozen ending: cards freeze in mid-air
    aftermathShown: false, // burnout ending: whether the empty office after the flash has been shown
    endingStart: 0,
    lastIntensity: -1,
}

const ui = {
    intro: document.querySelector('[data-intro]'),
    start: document.querySelector('[data-start]'),
    starts: document.querySelectorAll('[data-start]'),
    handbook: document.querySelector('[data-handbook]'),
    handbookOpen: document.querySelector('[data-handbook-open]'),
    clockPanel: document.querySelector('[data-clock-panel]'),
    clock: document.querySelector('[data-clock]'),
    clockGoal: document.querySelector('[data-clock-goal]'),
    coach: document.querySelector('[data-coach]'),
    coachText: document.querySelector('[data-coach-text]'),
    coachSkip: document.querySelector('[data-coach-skip]'),
    shiftOver: document.querySelector('[data-shift-over]'),
    goHome: document.querySelector('[data-go-home]'),
    outroEndings: document.querySelector('[data-outro-endings]'),
    outro: document.querySelector('[data-outro]'),
    restart: document.querySelector('[data-restart]'),
    mute: document.querySelector('[data-mute]'),
    hud: document.querySelector('[data-hud]'),
    performance: document.querySelector('[data-meter="performance"]'),
    stress: document.querySelector('[data-meter="stress"]'),
    vignette: document.querySelector('[data-vignette]'),
    whiteout: document.querySelector('[data-whiteout]'),
    outroTitle: document.querySelector('[data-outro-title]'),
    outroStory: document.querySelector('[data-outro-story]'),
    outroStorySender: document.querySelector('[data-outro-story-sender]'),
    outroStoryTime: document.querySelector('[data-outro-story-time]'),
    outroStoryTitle: document.querySelector('[data-outro-story-title]'),
    outroStoryMeta: document.querySelector('[data-outro-story-meta]'),
    outroStoryText: document.querySelector('[data-outro-story-text]'),
    outroBody: document.querySelector('[data-outro-body]'),
    outroCause: document.querySelector('[data-outro-cause]'),
    outroLine: document.querySelector('[data-outro-line]'),
    outroTip: document.querySelector('[data-outro-tip]'),
    outroLog: document.querySelector('[data-outro-log]'),
    outroEndingName: document.querySelector('[data-outro-ending-name]'),
    outroSting: document.querySelector('[data-outro-sting]'),
    outroStingSender: document.querySelector('[data-outro-sting-sender]'),
    outroStingTime: document.querySelector('[data-outro-sting-time]'),
    outroStingText: document.querySelector('[data-outro-sting-text]'),
    outroFound: document.querySelector('[data-outro-found]'),
    score: document.querySelector('[data-score]'),
    combo: document.querySelector('[data-combo]'),
    popups: document.querySelector('[data-popups]'),
    levelButtons: document.querySelectorAll('[data-level]'),
    levelDesc: document.querySelector('[data-level-desc]'),
    promote: document.querySelector('[data-promote]'),
    explore: document.querySelector('[data-explore]'),
    exploreBar: document.querySelector('[data-explore-bar]'),
    exploreHint: document.querySelector('[data-explore-hint]'),
    exploreBack: document.querySelector('[data-explore-back]'),
}

// On touch screens say "Tap" instead of "Click"
const actionWord = isCoarsePointer() ? 'Tap' : 'Click'
for (const element of document.querySelectorAll('[data-action-word]')) element.textContent = actionWord

// While the start screen is up, the camera slowly orbits the office
controls.autoRotate = true
controls.autoRotateSpeed = 0.3

const startShift = () => {
    if (experience.phase !== 'intro') return
    experience.phase = 'running'
    sound.start()
    controls.autoRotate = false
    startCameraReturn()
    restoreIntroLights()

    if (ui.handbook.open) ui.handbook.close()
    ui.intro.classList.add('is-hidden')
    setTimeout(() => (ui.intro.hidden = true), 1200)
    ui.hud.hidden = false
    ui.clockPanel.hidden = false
    ui.clockGoal.textContent = `${currentLevel.name} · night shift`

    if (shouldShowTutorial()) startTutorial()
    else beginShift()
}

/**
 * Look around
 * No-game mode: the office is static, nobody gets fired, the camera is free to rotate, zoom and pan.
 * Exit with Esc or the button; the page simply reloads back to the start screen
 */
// Keeps panning from drifting into the void beyond the office walls
const EXPLORE_BOUNDS = new THREE.Box3(new THREE.Vector3(-9, 0.3, -7), new THREE.Vector3(9, 3, 7))

const startExplore = () => {
    if (experience.phase !== 'intro') return
    experience.phase = 'explore'
    sound.start()
    controls.autoRotate = false
    restoreIntroLights()
    unlockCamera()
    startAmbient(clock.getElapsedTime())

    if (ui.handbook.open) ui.handbook.close()
    ui.intro.classList.add('is-hidden')
    setTimeout(() => (ui.intro.hidden = true), 1200)
    ui.exploreHint.textContent = isCoarsePointer()
        ? 'drag to look around · pinch to zoom · two fingers to move'
        : 'drag to look around · scroll to zoom · right-drag to move'
    ui.exploreBar.hidden = false
}

const leaveExplore = () => window.location.reload()

ui.explore.addEventListener('click', startExplore)
ui.exploreBack.addEventListener('click', leaveExplore)
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && experience.phase === 'explore') leaveExplore()
})

/**
 * Look around: the office lives on its own
 * The same events as during a shift, just rarer and without consequences: now and then a lamp goes out and a ghost rises,
 * notifications drift slowly towards the hero (no need to click, they melt at his head), rejections pile up on the second monitor.
 * When the office is almost empty, someone flips the breaker and it all starts over
 */
const AMBIENT_FIRE_EVERY = [5, 9] // seconds between firings
const AMBIENT_CARD_EVERY = [3, 5] // between notifications
const AMBIENT_CARD_FLIGHT = 10 // notifications fly slower than in the game
const AMBIENT_APPLICATION_EVERY = 2.5
const AMBIENT_RELIGHT_WHEN_LEFT = 5 // how many colleagues are left when the office "restarts"
const ambient = { nextFireAt: 0, nextCardAt: 0, nextApplicationAt: 0 }

const startAmbient = (elapsedTime) => {
    ambient.nextFireAt = elapsedTime + 2.5
    ambient.nextCardAt = elapsedTime + 1.5
    ambient.nextApplicationAt = elapsedTime + 1
}

const updateAmbient = (elapsedTime) => {
    if (experience.phase !== 'explore') return

    if (elapsedTime >= ambient.nextFireAt) {
        ambient.nextFireAt = elapsedTime + randomBetween(AMBIENT_FIRE_EVERY)
        const working = colleagues.filter((desk) => desk.userData.state === 'on').length
        if (working <= AMBIENT_RELIGHT_WHEN_LEFT) {
            resetOffice()
            sound.buzz()
        } else {
            fireRandomColleague()
        }
    }

    if (elapsedTime >= ambient.nextCardAt) {
        ambient.nextCardAt = elapsedTime + randomBetween(AMBIENT_CARD_EVERY)
        // Real news only: grey noise explains nothing without the game
        spawnCard(pickRandom(newsFeed), elapsedTime, { duration: AMBIENT_CARD_FLIGHT })
    }

    if (elapsedTime >= ambient.nextApplicationAt) {
        ambient.nextApplicationAt = elapsedTime + AMBIENT_APPLICATION_EVERY
        sendApplications()
    }
}

// Story timers count from when the shift actually started (after the tutorial), not from page load
const beginShift = () => {
    const elapsedTime = clock.getElapsedTime()
    story.nextFireAt = elapsedTime + story.startDelay
    news.nextSpawnAt = elapsedTime + 1.5
    applications.nextAt = elapsedTime + 1
    shift.start = elapsedTime
    shift.duration = getShiftDuration()
    scheduleBursts(elapsedTime)
}

/**
 * Clock in
 * The shift starts with a hold, the same mechanic as working at the monitor, so the player learns it before starting.
 * Let go too early and the bar slides back
 */
const HOLD_DURATION = 0.9
const clockIn = { holding: false, progress: 0 }

// There are two clock-in buttons: on the screen and inside the handbook. Track the one under the finger
let holdButton = null

const beginHold = (button) => {
    if (experience.phase !== 'intro') return
    sound.start() // this is a user gesture, so audio can start: the hum swells while you hold
    clockIn.holding = true
    holdButton = button
    button.classList.add('is-holding')
}

const endHold = () => {
    clockIn.holding = false
    holdButton?.classList.remove('is-holding')
}

for (const button of ui.starts) {
    button.addEventListener('pointerdown', (event) => {
        try {
            button.setPointerCapture(event.pointerId) // the finger may slide off the button without breaking the hold
        } catch {
            // already released or unsupported: the hold still works
        }
        beginHold(button)
    })
    button.addEventListener('pointerup', endHold)
    button.addEventListener('pointercancel', endHold)
    button.addEventListener('lostpointercapture', endHold)
    button.addEventListener('contextmenu', (event) => event.preventDefault()) // a long press on a phone doesn't open the menu
    // Keyboards and screen readers send click with detail === 0: for them the shift starts right away, no hold
    button.addEventListener('click', (event) => {
        if (event.detail === 0) startShift()
    })
}

/**
 * Handbook is a native <dialog>: the browser handles focus, Esc and the top layer.
 * It also closes on a backdrop click (the click lands on the dialog itself, not on .handbook-sheet)
 */
const closeHandbook = () => {
    if (!ui.handbook.open) return
    ui.handbook.classList.add('is-closing')
    const finish = () => {
        ui.handbook.classList.remove('is-closing')
        ui.handbook.close()
    }
    if (prefersReducedMotion) finish()
    else setTimeout(finish, 180)
}

ui.handbookOpen.addEventListener('click', () => {
    ui.handbook.showModal()
    ui.handbookOpen.setAttribute('aria-expanded', 'true')
})
ui.handbook.addEventListener('close', () => {
    ui.handbookOpen.setAttribute('aria-expanded', 'false')
    endHold()
})
ui.handbook.addEventListener('cancel', (event) => {
    event.preventDefault() // Esc also goes through the closing animation
    closeHandbook()
})
ui.handbook.addEventListener('click', (event) => {
    if (event.target === ui.handbook) closeHandbook()
})
ui.handbook.querySelector('[data-handbook-close]').addEventListener('click', closeHandbook)

const updateClockIn = (deltaTime) => {
    if (experience.phase !== 'intro') return
    const speed = clockIn.holding ? 1 / HOLD_DURATION : -2 / HOLD_DURATION
    const progress = THREE.MathUtils.clamp(clockIn.progress + speed * deltaTime, 0, 1)
    if (progress === clockIn.progress) return
    clockIn.progress = progress
    for (const button of ui.starts) button.style.setProperty('--hold', progress.toFixed(3))
    if (progress === 1) {
        endHold()
        startShift()
    }
}

// The first click anywhere on the start screen starts the office hum, so the screen has sound from then on
window.addEventListener('pointerdown', () => {
    if (experience.phase === 'intro') sound.start()
})

/**
 * Intro lights
 * While the start screen is up, colleagues' lamps go out one by one: the subtitle comes true before the player's eyes.
 * When nearly all are out, someone flips the breaker and it starts over.
 * Only brightness changes (setDeskPower), not state: the shift starts with a fully lit office
 */
const introLights = { nextAt: 2.5, flickering: null, flickerStart: 0, dark: new Set(), relightAt: 0, minute: -1 }
const introClock = document.querySelector('[data-intro-clock]')

const restoreIntroLights = () => {
    if (introLights.flickering) setDeskPower(introLights.flickering, 1)
    for (const desk of introLights.dark) setDeskPower(desk, 1)
    introLights.flickering = null
    introLights.dark.clear()
}

const updateIntroLights = (elapsedTime) => {
    if (experience.phase !== 'intro') return

    // The clock in the corner: 21:58, a minute later 21:59, then it stops. The shift starts at 22:00
    const minute = Math.min(Math.floor(elapsedTime / 60), 1)
    if (minute !== introLights.minute) {
        introLights.minute = minute
        introClock.innerHTML = `21<span class="blink">:</span>${58 + minute}`
    }

    if (introLights.relightAt) {
        if (elapsedTime < introLights.relightAt) return
        restoreIntroLights()
        introLights.relightAt = 0
        introLights.nextAt = elapsedTime + 4
        sound.click()
        return
    }

    const desk = introLights.flickering
    if (desk) {
        const t = elapsedTime - introLights.flickerStart
        if (t >= FLICKER_DURATION) {
            setDeskPower(desk, 0)
            introLights.dark.add(desk)
            introLights.flickering = null
        } else if (!prefersReducedMotion) {
            setDeskPower(desk, hashNoise(Math.floor(t * 12) + desk.id) > 0.45 ? 1 : 0.1)
        }
        return
    }

    if (elapsedTime < introLights.nextAt) return
    const lit = colleagues.filter((candidate) => !introLights.dark.has(candidate))
    if (lit.length <= 2) {
        introLights.relightAt = elapsedTime + 6 // sit in the dark for a while
        return
    }
    introLights.flickering = pickRandom(lit)
    introLights.flickerStart = elapsedTime
    introLights.nextAt = elapsedTime + FLICKER_DURATION + 2.5 + Math.random() * 3
    sound.buzz()
}
/**
 * Sound toggle
 * The choice is saved in localStorage so the sound stays off after a reload
 */
const muteLabel = document.querySelector('[data-mute-label]')

const setMuted = (muted) => {
    sound.setMuted(muted)
    ui.mute.classList.toggle('is-muted', muted)
    muteLabel.textContent = muted ? 'Sound off' : 'Sound on'
    writeItem(STORAGE_KEYS.muted, muted ? '1' : '0')
}

const toggleMute = () => setMuted(!sound.isMuted())

setMuted(readItem(STORAGE_KEYS.muted) === '1')

ui.mute.addEventListener('click', toggleMute)

// If Safari suspended audio (tab hidden, a phone call), resume on the next touch
window.addEventListener('pointerdown', sound.resume)
window.addEventListener('touchend', sound.resume) // older iOS only treats touchend as a gesture
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sound.resume()
})
window.addEventListener('keydown', (event) => {
    // Don't hijack M while typing in a Debug panel field
    const isTyping = event.target instanceof Element && event.target.closest('input, textarea')
    if (event.key.toLowerCase() !== 'm' || isTyping) return
    toggleMute()
})

/**
 * Shift clock
 * The shift runs from 22:00 to 06:00. Its length in seconds is chosen so that
 * every colleague has been fired by 06:00
 */
const shift = {
    start: 0,
    duration: 90,
    over: false,
    startHour: 22,
    hours: 8,
}

const getShiftDuration = () => {
    let total = story.startDelay
    for (let fired = 1; fired < colleagues.length; fired++) {
        total += Math.max(story.minInterval, story.firstInterval * story.acceleration ** fired)
    }
    return total + FLICKER_DURATION + 3 // a short pause after the last firing
}

const getShiftFraction = (elapsedTime) =>
    THREE.MathUtils.clamp((elapsedTime - shift.start) / shift.duration, 0, 1)

/**
 * Difficulty within the night: 0 at 22:00 → 1 at 06:00. It drives the Performance decay and the rate and speed of cards.
 * It used to follow the number of fired colleagues, but firings speed up towards morning, so in the last 20% of the night
 * difficulty jumped from 0.68 to 1: an even night and then a wall. Now it grows with time, almost linearly.
 * A curve of 1 means steady growth with no wall at dawn. The volleys (Bursts) fill the quiet start and middle. Fog, lamp flicker and sound
 * still follow the firings (getStoryProgress): that's atmosphere, not difficulty
 */
const DIFFICULTY_CURVE = 1

const getNightDifficulty = () => {
    if (experience.phase !== 'running' || isTutorial()) return 0
    return getShiftFraction(clock.getElapsedTime()) ** DIFFICULTY_CURVE
}

const formatShiftTime = (fraction) => {
    const minutes = shift.startHour * 60 + Math.floor(fraction * shift.hours * 60)
    const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0')
    const mm = String(minutes % 60).padStart(2, '0')
    return `${hh}:${mm}`
}

const endShift = () => {
    shift.over = true
    ui.clock.textContent = formatShiftTime(1)
    ui.clockPanel.style.setProperty('--night', 1)
    ui.clockGoal.textContent = 'Shift over'
    ui.shiftOver.hidden = false
    game.working = false

    // Morning: every notification still in flight quietly disappears
    const elapsedTime = clock.getElapsedTime()
    for (const card of flyingCards) {
        if (card.dismissedAt === null) card.dismissedAt = elapsedTime
    }
}

ui.goHome.addEventListener('click', () => startEnding('calm'))

/**
 * Tension
 * The more people are fired, the thicker the fog, the more the hero's lamp flickers and the harder the camera shakes
 */
const cameraShake = new THREE.Vector3()

const updateTension = (elapsedTime) => {
    if (experience.phase !== 'intro' && experience.phase !== 'running') return

    const tension = experience.phase === 'running' ? getStoryProgress() : 0
    scene.fog.density = params.fogDensity + params.fogDensityGrowth * tension

    // In the second half of the story the hero's lamp starts shorting out
    let lampPower = 1
    // On the start screen the hero's lamp occasionally dips: one or two short drops every half minute
    if (experience.phase === 'intro' && !prefersReducedMotion && hashNoise(Math.floor(elapsedTime * 10)) < 0.012) lampPower = 0.2
    if (tension > 0.5 && hashNoise(Math.floor(elapsedTime * 10)) < (tension - 0.5) * 0.4) lampPower = 0.25
    // While the lamp is held, the light fades smoothly: that is the progress indicator
    lampPower *= 1 - lampHold.progress * 0.9
    heroLight.intensity = params.heroLightIntensity * lampPower
    setDeskPower(heroDesk, lampPower)

    // tension changes in steps, so only update the sound when it changes
    if (tension !== experience.lastIntensity) {
        sound.setIntensity(tension)
        experience.lastIntensity = tension
    }

    // Shake: a sum of sines at different frequencies looks like random noise
    const amplitude = params.cameraShake * tension * tension
    cameraShake.set(
        Math.sin(elapsedTime * 37) * Math.sin(elapsedTime * 13),
        Math.sin(elapsedTime * 29 + 1) * Math.sin(elapsedTime * 7),
        Math.sin(elapsedTime * 23 + 2) * Math.sin(elapsedTime * 11)
    ).multiplyScalar(amplitude)
}

/**
 * Game
 * Two meters pull in opposite directions:
 * Performance grows while you hold the monitor and constantly drains on its own (faster towards the end of the shift)
 * Stress grows when a notification reaches the head and drops when you dismiss one
 */
const DANGER_LEVEL = 25 // below this mark (above it for Stress) the meter turns red

const game = {
    performance: 100,
    stress: 0,
    working: false,
    hitFlash: 0, // vignette flash when a card hits: 1 → 0

    workRate: 16, // Performance per second gained by working
    performanceDecayStart: 2, // Performance per second lost at the start of the shift
    performanceDecayEnd: 6, // ... and at the end
    stressPerHit: 8,
    stressReliefPerDismiss: 2,
    stressDecay: 1.5, // Stress per second that fades on its own
    respawnChance: 0.5, // chance that a new card appears where one was dismissed
    noiseChance: 0, // share of harmless noise among notifications (from Middle on, see Noise and Levels)

    // What the player did this night: used to pick the ending and write its text
    dismissed: 0, // notifications dismissed
    missed: 0, // notifications that reached the head
    lastActionAt: null, // last time the player worked or dismissed a card

    // Score
    score: 0,
    combo: 0, // cards dismissed in a row without a miss
    hasWorked: false, // whether the player has worked at all; until then the hint above the monitor shows
    workPointsPerSecond: 5,
    dismissPoints: 10,
    comboStep: 5, // every 5 cards in a row the multiplier grows by 1
    maxMultiplier: 5,
    calmBonus: 500,
}

const getMultiplier = () => Math.min(game.maxMultiplier, 1 + Math.floor(game.combo / game.comboStep))

// Convert a scene point to screen pixels to show "+20" next to the card
const projectToScreen = (position) => {
    const projected = position.clone().project(camera)
    return { x: (projected.x + 1) / 2 * sizes.width, y: (1 - projected.y) / 2 * sizes.height }
}

const POPUP_LIFT = 36
const showPopup = (position, text, isBad = false) => {
    const { x, y } = projectToScreen(position)
    const popup = document.createElement('span')
    popup.className = isBad ? 'popup is-bad' : 'popup'
    popup.textContent = text
    popup.style.left = `${x}px`
    popup.style.top = `${y - POPUP_LIFT}px` // slightly above the point, otherwise "+50" lands right on the card text
    ui.popups.append(popup)
    popup.addEventListener('animationend', () => popup.remove())
}

const addDismissScore = (position) => {
    if (experience.phase !== 'running') return
    game.combo++
    const multiplier = getMultiplier()
    const points = game.dismissPoints * multiplier
    game.score += points
    showPopup(position, multiplier > 1 ? `+${points} ×${multiplier}` : `+${points}`)

    // The multiplier went up: briefly bump the combo label
    // Past the ×maxMultiplier cap the multiplier stops growing, so no more bumps
    if (game.combo % game.comboStep === 0 && game.combo / game.comboStep < game.maxMultiplier) {
        ui.combo.classList.remove('is-bump')
        void ui.combo.offsetWidth // force a reflow so the CSS animation restarts
        ui.combo.classList.add('is-bump')
    }
}

/**
 * Hold hint
 * A pulsing label above the hero's monitor that shows the monitor can be held.
 * Visible until the player has worked at least once, and again whenever Performance sags
 */
// A glowing hint sprite. The texture is created right away and again once IBM Plex Mono has loaded;
// otherwise on a first visit the label would keep the fallback font and a wrong width
const HINT_HEIGHT = 0.24
const createHintSprite = (text, color, materialOptions = {}) => {
    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ transparent: true, fog: false, opacity: 0, ...materialOptions })
    )
    let aspect = 1
    const updateScale = () => {
        const height = HINT_HEIGHT * getSpriteScale()
        sprite.scale.set(height * aspect, height, 1)
    }
    const render = () => {
        const label = createGlowLabelTexture(text, color)
        sprite.material.map?.dispose()
        sprite.material.map = label.texture
        sprite.material.needsUpdate = true
        aspect = label.aspect
        updateScale()
    }
    render()
    monoFontReady.then(render)
    spriteScaleUpdaters.push(updateScale)
    return sprite
}

// depthTest: false: on top of everything so the hero and cards never cover it
const holdHint = createHintSprite('HOLD TO WORK', '#d4f1ff', { depthTest: false })
holdHint.renderOrder = 10
const holdHintBase = heroDesk.position.clone().add(new THREE.Vector3(0, 1.62, -0.22))
holdHint.position.copy(holdHintBase)
scene.add(holdHint)

const updateHoldHint = (elapsedTime) => {
    const needsHint = experience.phase === 'running' && !shift.over && !game.working
        && (!game.hasWorked || game.performance < DANGER_LEVEL + 15)
    const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 5)

    // Fade in and out smoothly
    // During the tutorial a big coach bubble replaces the label above the monitor (see Tutorial)
    const target = needsHint && !isTutorial() ? 0.6 + 0.4 * pulse : 0
    holdHint.material.opacity += (target - holdHint.material.opacity) * 0.15
    holdHint.position.y = holdHintBase.y + Math.sin(elapsedTime * 2.5) * 0.03

    // The screen also flickers green to hint where to press
    if (needsHint) heroDesk.userData.screen.material.color.lerp(colors.screenWork, 0.15 + 0.35 * pulse)
}

const gameFolder = gui.addFolder('Game')
gameFolder.add(game, 'performance').min(0).max(100).step(1).listen()
gameFolder.add(game, 'stress').min(0).max(100).step(1).listen()
gameFolder.add(game, 'workRate').min(0).max(50).step(0.5).name('work rate /s')
gameFolder.add(game, 'performanceDecayStart').min(0).max(20).step(0.5).name('perf decay at start /s')
gameFolder.add(game, 'performanceDecayEnd').min(0).max(20).step(0.5).name('perf decay at end /s')
gameFolder.add(game, 'stressPerHit').min(0).max(30).step(1).name('stress per hit')
gameFolder.add(game, 'stressReliefPerDismiss').min(0).max(10).step(0.5).name('relief per dismiss')
gameFolder.add(game, 'stressDecay').min(0).max(10).step(0.1).name('stress decay /s')
gameFolder.add(game, 'respawnChance').min(0).max(1).step(0.05).name('respawn chance')

const onCardHit = () => {
    if (experience.phase !== 'running' || shift.over) return

    // The tutorial card landed: no penalty, just send it again
    if (isTutorial()) {
        spawnTutorialCard(clock.getElapsedTime())
        return
    }

    game.stress = Math.min(100, game.stress + game.stressPerHit)
    game.missed++
    game.hitFlash = 1
    sound.hit()

    if (game.combo >= game.comboStep) showPopup(heroHead, 'Combo lost', true)
    game.combo = 0

    // Check for burnout right on impact. If we waited for updateGame, stress would have time
    // to decay a hair (100 → 99.97) and the ">= 100" check would never fire
    if (game.stress >= 100) startEnding('burnout')
}

// The HUD updates every frame: touch the DOM only when a value actually changed
const hud = {
    score: null,
    multiplier: null,
    meters: new Map(), // meter → { fill, width, isDanger }
}

const setMeter = (meter, value, isDanger) => {
    if (!hud.meters.has(meter)) hud.meters.set(meter, { fill: meter.querySelector('[data-meter-fill]') })
    const state = hud.meters.get(meter)
    const width = `${value.toFixed(1)}%`
    if (state.width !== width) {
        state.fill.style.width = width
        state.width = width
    }
    if (state.isDanger !== isDanger) {
        meter.classList.toggle('is-danger', isDanger)
        state.isDanger = isDanger
    }
}

const updateHud = () => {
    const score = Math.floor(game.score)
    if (score !== hud.score) {
        ui.score.textContent = score
        hud.score = score
    }
    const multiplier = getMultiplier()
    if (multiplier !== hud.multiplier) {
        // CSS hides the word combo on phones: with a four-digit score it wraps and the HUD jumps
        ui.combo.innerHTML = multiplier > 1 ? `×${multiplier}<span class="hud-combo-word"> combo</span>` : ''
        hud.multiplier = multiplier
    }
    setMeter(ui.performance, game.performance, game.performance < DANGER_LEVEL)
    setMeter(ui.stress, game.stress, game.stress > 100 - DANGER_LEVEL)
}

const updateGame = (elapsedTime, deltaTime) => {
    game.hitFlash = Math.max(0, game.hitFlash - deltaTime * 3)

    if (experience.phase !== 'running') {
        ui.vignette.style.opacity = 0
        return
    }

    // After 06:00 the meters freeze: the shift is over, all that's left is to go home
    if (shift.over) {
        ui.vignette.style.opacity = Math.max(0, Number(ui.vignette.style.opacity) - deltaTime)
        return
    }

    // During the tutorial the clock stands still and Performance doesn't drain; only the player's actions change it
    if (!isTutorial()) {
        const shiftFraction = getShiftFraction(elapsedTime)
        ui.clock.textContent = formatShiftTime(shiftFraction)
        ui.clockPanel.style.setProperty('--night', shiftFraction) // the night bar under the clock
        if (shiftFraction >= 1) {
            endShift()
            return
        }
    }

    const decay = isTutorial() ? 0 : THREE.MathUtils.lerp(game.performanceDecayStart, game.performanceDecayEnd, getNightDifficulty())
    const work = game.working ? game.workRate : 0
    if (game.working) {
        game.hasWorked = true
        game.lastActionAt = elapsedTime
        game.score += game.workPointsPerSecond * deltaTime
    }
    game.performance = THREE.MathUtils.clamp(game.performance + (work - decay) * deltaTime, 0, 100)
    game.stress = THREE.MathUtils.clamp(game.stress - game.stressDecay * deltaTime, 0, 100)

    // While working: the screen brightens, the hero jitters over the keyboard, keys click
    const { screen, person } = heroDesk.userData
    if (game.working) {
        screen.material.color.lerp(colors.screenWork, 0.6)
        person.position.y = Math.abs(Math.sin(elapsedTime * 25)) * 0.015
        sound.type()
    } else {
        person.position.y = 0
    }

    updateHud()
    ui.vignette.style.opacity = Math.min(1, (game.stress / 100) * params.vignetteStrength + game.hitFlash * 0.3)

    if (game.performance <= 0) startEnding(isFrozen(elapsedTime) ? 'frozen' : 'fired')
}

/**
 * Tutorial
 * On first launch the game teaches two actions in place: hold the monitor, then dismiss one slow notification.
 * During the tutorial the clock stands still, nobody gets fired and stress doesn't rise.
 * To replay the tutorial, open the page with #tutorial in the URL
 */
const TUTORIAL_START_PERFORMANCE = 55 // a partly empty meter, so the player sees work filling it
const TUTORIAL_CARD_DURATION = 10 // the tutorial card flies slowly; regular ones take about 9 s at the start
const TUTORIAL_DONE_DURATION = 2.5 // how long "Nice!" stays up after the tutorial

const tutorial = {
    step: null, // null: no tutorial | 'work' | 'dismiss' | 'done' (shift already running, "Nice!" showing)
    card: null,
    doneAt: 0,
}

const tutorialAnchor = new THREE.Vector3()

const isTutorial = () => tutorial.step === 'work' || tutorial.step === 'dismiss'

const shouldShowTutorial = () => {
    if (window.location.hash === '#tutorial') return true
    return readItem(STORAGE_KEYS.tutorialDone) !== '1'
}

const setCoach = (html, hasRing = true) => {
    ui.coachText.innerHTML = html
    ui.coach.classList.toggle('has-ring', hasRing)
    // Restart the bubble's entrance animation so the step change is noticeable
    ui.coachText.classList.remove('is-new')
    void ui.coachText.offsetWidth
    ui.coachText.classList.add('is-new')
}

const startTutorial = () => {
    tutorial.step = 'work'
    game.performance = TUTORIAL_START_PERFORMANCE
    ui.performance.classList.add('is-coached')
    ui.coach.hidden = false
    ui.coachSkip.hidden = false
    setCoach('<span class="rule-key">Hold</span> the monitor to work')
}

// The card spawns halfway between the hero and the camera, slightly to the side, so it's always in frame, even on a narrow screen
const tutorialSpawnPoint = () => {
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    return heroHead.clone().lerp(camera.position, 0.5)
        .addScaledVector(cameraRight, 1.8)
        .add(new THREE.Vector3(0, 0.8, 0))
}

const spawnTutorialCard = (elapsedTime) => {
    tutorial.card = spawnCard(newsFeed[1], elapsedTime, { from: tutorialSpawnPoint(), duration: TUTORIAL_CARD_DURATION })
}

const finishTutorial = () => {
    // without localStorage the tutorial just shows again next time
    writeItem(STORAGE_KEYS.tutorialDone, '1')
    ui.performance.classList.remove('is-coached')
    ui.coachSkip.hidden = true
    beginShift()
}

ui.coachSkip.addEventListener('click', () => {
    if (!isTutorial()) return
    // Quietly remove the tutorial card, no points
    if (tutorial.card && tutorial.card.dismissedAt === null) tutorial.card.dismissedAt = clock.getElapsedTime()
    tutorial.step = null
    ui.coach.hidden = true
    game.performance = 100
    finishTutorial()
})

const updateTutorial = (elapsedTime) => {
    if (tutorial.step === null) return

    // The shift ended before the hint faded: just hide it
    if (experience.phase !== 'running') {
        tutorial.step = null
        ui.coach.hidden = true
        return
    }

    // Step 1 is done once work has filled Performance to the top
    if (tutorial.step === 'work' && game.performance >= 100) {
        tutorial.step = 'dismiss'
        ui.performance.classList.remove('is-coached')
        setCoach(`<span class="rule-key">${actionWord}</span> the notification before it reaches you`)
        spawnTutorialCard(elapsedTime)
    }

    if (tutorial.step === 'dismiss' && tutorial.card.dismissedAt !== null) {
        tutorial.step = 'done'
        tutorial.doneAt = elapsedTime
        setCoach('Nice! Now survive until <strong>06:00</strong>', false)
        finishTutorial()
    }

    if (tutorial.step === 'done' && elapsedTime - tutorial.doneAt > TUTORIAL_DONE_DURATION) {
        tutorial.step = null
        ui.coach.hidden = true
        return
    }

    // The hint hovers over whatever needs doing now: the monitor, the card, and at the end the hero
    const anchor = tutorial.step === 'work'
        ? workHitbox.getWorldPosition(tutorialAnchor)
        : tutorial.step === 'dismiss' ? tutorial.card.sprite.position : heroHead
    placeCoach(anchor)
}

const COACH_FLIP_Y = 190
const placeCoach = (anchor) => {
    const { x, y } = projectToScreen(anchor)
    ui.coach.style.transform = `translate(${x}px, ${y}px)`
    // Target near the top edge: put the bubble below it, not over the HUD and clock
    ui.coach.classList.toggle('is-below', y < COACH_FLIP_Y)

    // Keep the bubble from sliding off-screen while the tail still points at the target
    const halfWidth = ui.coachText.offsetWidth / 2
    const margin = 16
    const offset = THREE.MathUtils.clamp(x, margin + halfWidth, sizes.width - margin - halfWidth) - x
    ui.coach.style.setProperty('--shift', `${offset}px`)
}

/**
 * Callouts
 * The same bubble as in the tutorial, but one-off: the first time something new shows up during a night
 * (currently grey noise), an explanation pops up above it for a few seconds. It doesn't introduce a new rule,
 * it just answers "wait, what's this?"
 */
const CALLOUT_DURATION = 4
const CALLOUT_CARD_PROGRESS = 0.35 // show once the card has covered a third of its path and is visible

const callout = {
    shown: new Set(),
    anchor: null, // the scene point the bubble hovers over. A live reference, so the bubble follows the card
    until: 0,
}

const showCallout = (kind, html, anchor) => {
    // The tutorial takes priority, and we never show two hints at once
    if (callout.shown.has(kind) || tutorial.step !== null || callout.anchor) return
    callout.shown.add(kind)
    callout.anchor = anchor
    callout.until = clock.getElapsedTime() + CALLOUT_DURATION
    ui.coach.hidden = false
    setCoach(html, false)
}

const updateCallout = (elapsedTime) => {
    if (!callout.anchor) return
    if (experience.phase !== 'running' || shift.over || elapsedTime > callout.until) {
        callout.anchor = null
        ui.coach.hidden = true
        return
    }
    placeCoach(callout.anchor)
}

/**
 * Frozen or Very responsive
 * Both endings mean Performance hit zero. But if the player kept dismissing notifications the whole time,
 * he got fired for being "responsive". If he just sat and watched, he froze
 */
const FROZEN_AFTER = 8 // this many seconds without a single action and the hero has "frozen"
const RESPONSIVE_MIN_DISMISSED = 5

const isFrozen = (elapsedTime) =>
    game.lastActionAt === null
    || elapsedTime - game.lastActionAt > FROZEN_AFTER
    || game.dismissed < RESPONSIVE_MIN_DISMISSED

// The hero can switch off his own lamp only in the second half of the night, once it starts shorting out on its own
const LOG_OFF_FROM = 0.5
const canLogOff = () => experience.phase === 'running' && !shift.over && getStoryProgress() >= LOG_OFF_FROM

const LAMP_HOLD_DURATION = 1.2
const updateLampHold = (deltaTime) => {
    if (!canLogOff()) {
        lampHold.holding = false
        lampHold.progress = 0
        return
    }
    // Let go early and the light comes back quickly
    const speed = lampHold.holding ? 1 / LAMP_HOLD_DURATION : -3 / LAMP_HOLD_DURATION
    lampHold.progress = THREE.MathUtils.clamp(lampHold.progress + speed * deltaTime, 0, 1)
    if (lampHold.progress === 1) {
        lampHold.holding = false
        startEnding('loggedOff')
    }
}

/**
 * Lamp hint
 * A dim label by the hero's lamp: a quiet hint that you can just leave
 */
// The hint is honest about what happens (the night ends), but doesn't forbid it: this is the secret ending
// fog: false (inside createHintSprite), otherwise the fog eats almost the whole label
const lampHint = createHintSprite('hold to switch off · go home', '#ffd9a0', { depthWrite: false })
const lampHintBase = heroDesk.position.clone().add(new THREE.Vector3(0, 3.05, 0))
lampHint.position.copy(lampHintBase)
scene.add(lampHint)

const updateLampHint = (elapsedTime) => {
    // Breathes slowly and barely visibly, unlike the bright HOLD TO WORK
    const target = canLogOff() ? 0.45 + 0.2 * Math.sin(elapsedTime * 1.2) : 0
    lampHint.material.opacity += (target - lampHint.material.opacity) * 0.05
    lampHint.position.y = lampHintBase.y + Math.sin(elapsedTime * 0.8) * 0.04
}

// Each level keeps its own best score: Junior and Lead scores aren't comparable.
// Junior uses the old key so best scores from before levels existed aren't lost
const getBestScoreKey = () =>
    currentLevelKey === 'junior' ? STORAGE_KEYS.bestScore : `${STORAGE_KEYS.bestScore}:${currentLevelKey}`

const getBestScore = () => Number(readItem(getBestScoreKey())) || 0

// Saves the best score and reports whether it was beaten
const saveBestScore = (score) => {
    const previousBest = getBestScore()
    if (score > previousBest) writeItem(getBestScoreKey(), String(score))
    return { best: Math.max(score, previousBest), isNewBest: score > previousBest }
}

// Endings the player has already seen, stored in localStorage to show "2/5"
const saveEnding = (kind) => addToSet(STORAGE_KEYS.endings, kind)

const dawn = {
    background: new THREE.Color('#4a3640'),
    moonColor: new THREE.Color('#ffb27a'),
    moonIntensity: 1.4,
    ambientIntensity: 0.35,
    fogDensity: 0.035,
}

// In the finale the camera flies in to the hero
const endingCamera = {
    position: heroDesk.position.clone().add(new THREE.Vector3(2.6, 2, 3.4)),
    target: heroDesk.position.clone().add(new THREE.Vector3(0, 1, 0)),
}

// Where the transition starts from, captured when the ending begins
const endingFrom = {}

const startEnding = (kind) => {
    if (experience.phase !== 'running') return
    const elapsedTime = clock.getElapsedTime()
    const shiftTime = (time) => formatShiftTime(getShiftFraction(time))
    const stillFlying = flyingCards.filter((card) => card.dismissedAt === null).length

    experience.phase = 'ending'
    experience.ending = kind
    // The final camera move drives the camera itself: drop the gameplay limits so they don't clip it
    cameraReturn.active = false
    unlockCamera()
    experience.endingStart = elapsedTime
    experience.endingIsNew = !readSet(STORAGE_KEYS.endings).has(kind)
    experience.endingsFound = saveEnding(kind)
    experience.endingTime = shiftTime(elapsedTime)
    experience.endingStats = {
        time: experience.endingTime,
        frozenSince: shiftTime(game.lastActionAt ?? shift.start),
        dismissed: game.dismissed,
        missed: game.missed,
        unread: game.missed + stillFlying,
        applications: applications.sent,
    }
    if (kind === 'calm') game.score += game.calmBonus

    ui.shiftOver.hidden = true
    ui.hud.hidden = true
    ui.clockPanel.hidden = true
    game.working = false
    heroDesk.userData.person.position.y = 0
    cameraShake.set(0, 0, 0)
    controls.enabled = false

    // Frozen: cards stay where time stopped them. In every other ending they fade
    experience.cardsFrozen = kind === 'frozen'
    if (!experience.cardsFrozen) {
        for (const card of flyingCards) {
            if (card.dismissedAt === null) card.dismissedAt = elapsedTime
        }
    }

    Object.assign(endingFrom, {
        background: scene.background.clone(),
        fogDensity: scene.fog.density,
        moonColor: moonLight.color.clone(),
        moonIntensity: moonLight.intensity,
        ambientIntensity: ambientLight.intensity,
        monitorGlow: monitorGlow.intensity,
        cameraPosition: camera.position.clone(),
        controlsTarget: controls.target.clone(),
    })

    if (kind === 'calm') {
        heroLight.intensity = params.heroLightIntensity
        setDeskPower(heroDesk, 1)
        // The first invitation in the whole history of applications
        applications.interviews = 1
        applications.lastReply = 'Are you free Tuesday?'
        drawJobScreen()
        sound.calm()
    } else if (kind === 'fired') {
        showFiringLabel(heroDesk, 'LOW PERFORMANCE')
        sound.buzz()
        sound.calm({ chord: false })
    } else if (kind === 'frozen') {
        // The sound cuts off almost immediately, as if time stopped
        sound.calm({ chord: false, fade: 0.4 })
    } else if (kind === 'burnout') {
        ui.whiteout.classList.add('is-visible')
        sound.tinnitus()
        sound.calm({ chord: false })
    } else if (kind === 'loggedOff') {
        // Lights and screens go out at once: he flipped the switch himself
        sound.click()
        heroLight.intensity = 0
        setDeskPower(heroDesk, 0)
        jobMonitorScreen.material.color.setScalar(0)
        monitorGlow.intensity = 0
        // The ghosts stop and watch him go
        ghostWatch.pausedAt = elapsedTime
        ghostWatch.target = new THREE.Vector3()
        sound.calm()
    }
}

let stingTimeout = null
let summaryTimeout = null
const STORY_BEAT = 2600 // how long the story card stays alone before the summary appears

const setText = (element, text) => {
    element.textContent = text ?? ''
    element.hidden = !text
}

const showOutro = (kind) => {
    const ending = endings[kind]
    const stats = experience.endingStats

    // Beat 1: the last notification, in the scene
    const storyCard = ending.story(stats)
    ui.outro.style.setProperty('--accent', ending.accent)
    ui.outroStorySender.textContent = storyCard.sender
    ui.outroStoryTime.textContent = storyCard.time ?? stats.time
    ui.outroStoryTitle.textContent = storyCard.title
    setText(ui.outroStoryMeta, storyCard.meta)
    setText(ui.outroStoryText, storyCard.text)

    // Beat 2: the summary
    ui.outroTitle.innerHTML = ending.title(stats)
    ui.outroCause.textContent = ending.cause(stats)
    ui.outroLine.textContent = ending.line(stats)
    setText(ui.outroTip, ending.tip ? `next night: ${ending.tip}` : '')

    // In the Logged off ending the score doesn't count: keep the best score and show an honest label instead of a number
    const scoreCounts = ending.scoreCounts !== false
    const score = Math.floor(game.score)
    const { best, isNewBest } = scoreCounts ? saveBestScore(score) : { best: getBestScore(), isNewBest: false }
    const rows = [
        ['role', currentLevel.name],
        ['answered', stats.dismissed],
        ['missed', stats.missed],
        ...(kind === 'calm' ? [['applications', stats.applications]] : []),
        ['score', scoreCounts ? score : 'didn’t count', isNewBest ? 'new best' : null],
        ['best', best],
    ]
    ui.outroLog.replaceChildren(...rows.flatMap(([label, value, flag]) => {
        const term = document.createElement('dt')
        term.textContent = label
        const detail = document.createElement('dd')
        detail.textContent = value
        if (flag) {
            const mark = document.createElement('span')
            mark.className = 'outro-flag'
            mark.textContent = flag
            detail.append(mark)
        }
        return [term, detail]
    }))

    // Survived until morning: the level is passed and the next one can be tried
    const nextLevel = LEVEL_ORDER[LEVEL_ORDER.indexOf(currentLevelKey) + 1]
    if (kind === 'calm') markLevelPassed(currentLevelKey)
    if (kind === 'calm' && nextLevel) {
        ui.promote.dataset.next = nextLevel
        ui.promote.textContent = `or get promoted → ${levels[nextLevel].name}`
        ui.promote.hidden = false
    }

    // Didn't make it to morning on a high grade: offer a step down with the same button
    const previousLevel = LEVEL_ORDER[LEVEL_ORDER.indexOf(currentLevelKey) - 1]
    if (FAIL_ENDINGS.includes(kind) && DEMOTE_FROM.includes(currentLevelKey) && previousLevel) {
        ui.promote.dataset.next = previousLevel
        ui.promote.textContent = `or step down ← ${levels[previousLevel].name}`
        ui.promote.hidden = false
    }

    // Every ending is a slot: found ones show an icon, unfound ones are empty. The current one is highlighted and labelled
    const kinds = Object.keys(endings)
    ui.outroFound.textContent = `${experience.endingsFound.size}/${kinds.length}`
    ui.outroEndings.replaceChildren(...kinds.map((key) => {
        const slot = document.createElement('span')
        const isFound = experience.endingsFound.has(key)
        slot.className = 'outro-ending'
        slot.classList.toggle('is-locked', !isFound)
        slot.classList.toggle('is-current', key === kind)
        slot.textContent = isFound ? endings[key].icon : ''
        slot.title = isFound ? endings[key].name : 'not found yet'
        slot.setAttribute('aria-label', slot.title)
        return slot
    }))
    ui.outroEndingName.textContent = `${experience.endingIsNew ? 'new: ' : ''}${ending.name}`

    ui.outro.hidden = false
    ui.outroBody.hidden = true
    sound.ping()

    const showSummary = () => {
        clearTimeout(summaryTimeout)
        ui.outro.removeEventListener('pointerdown', showSummary)
        window.removeEventListener('keydown', showSummary)
        if (!ui.outroBody.hidden) return
        ui.outro.classList.add('is-summary')
        ui.outroBody.hidden = false
        ui.restart.focus({ preventScroll: true })

        // The last notification arrives just when it seems to be over
        if (ending.sting) {
            clearTimeout(stingTimeout)
            stingTimeout = setTimeout(() => {
                ui.outroStingSender.textContent = ending.sting.sender
                ui.outroStingTime.textContent = ending.sting.time
                ui.outroStingText.textContent = ending.sting.text
                ui.outroSting.hidden = false
                sound.ping()
            }, 2500)
        }
    }
    summaryTimeout = setTimeout(showSummary, prefersReducedMotion ? 0 : STORY_BEAT)
    // For the impatient: a click or key press shows the summary immediately
    ui.outro.addEventListener('pointerdown', showSummary, { once: true })
    window.addEventListener('keydown', showSummary, { once: true })
}

/**
 * Restart: "hold to clock in again", the same hold as in the intro.
 * Its own small requestAnimationFrame loop: by this point the game tick isn't waiting for anything
 */
const restartHold = { holding: false, progress: 0, last: 0, frame: 0 }

const stepRestartHold = (now) => {
    const deltaTime = Math.min((now - restartHold.last) / 1000, 0.1)
    restartHold.last = now
    const speed = restartHold.holding ? 1 / HOLD_DURATION : -2 / HOLD_DURATION
    restartHold.progress = THREE.MathUtils.clamp(restartHold.progress + speed * deltaTime, 0, 1)
    ui.restart.style.setProperty('--hold', restartHold.progress.toFixed(3))
    if (restartHold.progress === 1) {
        window.location.reload()
        return
    }
    if (restartHold.holding || restartHold.progress > 0) restartHold.frame = requestAnimationFrame(stepRestartHold)
}

const beginRestartHold = () => {
    restartHold.holding = true
    ui.restart.classList.add('is-holding')
    cancelAnimationFrame(restartHold.frame)
    restartHold.last = performance.now()
    restartHold.frame = requestAnimationFrame(stepRestartHold)
}

const endRestartHold = () => {
    restartHold.holding = false
    ui.restart.classList.remove('is-holding')
}

ui.restart.addEventListener('pointerdown', (event) => {
    try {
        ui.restart.setPointerCapture(event.pointerId)
    } catch {
        // already released or unsupported: the hold still works
    }
    beginRestartHold()
})
ui.restart.addEventListener('pointerup', endRestartHold)
ui.restart.addEventListener('pointercancel', endRestartHold)
ui.restart.addEventListener('lostpointercapture', endRestartHold)
ui.restart.addEventListener('contextmenu', (event) => event.preventDefault())
// Keyboards and screen readers: no hold
ui.restart.addEventListener('click', (event) => {
    if (event.detail === 0) window.location.reload()
})

const updateCalmEnding = (t, eased) => {
    const screensOff = Math.min(t * 4, 1) // screens go dark in the first 2 seconds
    const lerp = THREE.MathUtils.lerp

    scene.background.lerpColors(endingFrom.background, dawn.background, eased)
    scene.fog.color.copy(scene.background)
    scene.fog.density = lerp(endingFrom.fogDensity, dawn.fogDensity, eased)

    moonLight.color.lerpColors(endingFrom.moonColor, dawn.moonColor, eased)
    moonLight.intensity = lerp(endingFrom.moonIntensity, dawn.moonIntensity, eased)
    ambientLight.intensity = lerp(endingFrom.ambientIntensity, dawn.ambientIntensity, eased)

    // The work screen goes dark while the second monitor with the invite stays on
    heroDesk.userData.screen.material.color.lerpColors(colors.screenOn, colors.screenOff, screensOff)
    monitorGlow.intensity = endingFrom.monitorGlow * (1 - screensOff)

    // Ghosts can't stand daylight
    ghostVisibility = 1 - eased
}

const updateFiredEnding = (elapsedTime) => {
    // The hero's lamp flickers and goes out just like the colleagues', then he rises as a ghost
    const t = elapsedTime - experience.endingStart
    let power = 0
    if (t < FLICKER_DURATION) {
        power = hashNoise(Math.floor(t * 12)) > 0.45 ? 1 : 0.1
    } else if (heroDesk.userData.person.visible) {
        heroDesk.userData.person.visible = false
        spawnGhost(heroDesk, elapsedTime)
    }

    heroLight.intensity = params.heroLightIntensity * power
    setDeskPower(heroDesk, power)
    jobMonitorScreen.material.color.setScalar(power)
    monitorGlow.intensity = endingFrom.monitorGlow * power
}

// Burnout: a flash, and as it fades, a dark empty office with every lamp out.
// Only the monitor is on, and the hero sits slumped in front of it
const WHITEOUT_DURATION = 2.5

const updateBurnoutEnding = (elapsedTime) => {
    const t = elapsedTime - experience.endingStart
    if (t < WHITEOUT_DURATION || experience.aftermathShown) return
    experience.aftermathShown = true

    for (const desk of colleagues) setDeskPower(desk, 0)
    ghostVisibility = 0

    heroLight.intensity = 0
    setDeskPower(heroDesk, 0)
    heroDesk.userData.screen.material.color.copy(colors.screenOn).multiplyScalar(0.7)
    monitorGlow.intensity = 4
    heroDesk.userData.person.rotation.x = -0.25

    moonLight.color.set('#6f86b8')
    moonLight.intensity = 0.3
    ambientLight.intensity = 0.04
    scene.fog.density = 0.07

    ui.whiteout.classList.remove('is-visible') // CSS fades the flash out
}

// Logged off: he sits in the dark for a second, then stands up, steps away from the desk and walks down the aisle into the dark
const LOG_OFF_STAND_AT = 1.2
const LOG_OFF_WALK_AT = 2.4
const LOG_OFF_AISLE_Z = 1.5 // the aisle between desk rows, in desk coordinates
const LOG_OFF_SPEED = 1.1

const updateLoggedOffEnding = (elapsedTime) => {
    const t = elapsedTime - experience.endingStart
    const { person } = heroDesk.userData
    const { torso, thighs } = person.userData

    // The ghosts look at wherever the hero is now
    heroDesk.localToWorld(ghostWatch.target.copy(person.position).setY(1))

    if (t < LOG_OFF_STAND_AT) return

    // Standing up: legs vertical, back straight
    torso.rotation.x = 0
    thighs.rotation.x = Math.PI / 2
    thighs.scale.z = 1.9
    thighs.position.set(0, 0.4, 0)
    const step = Math.abs(Math.sin(t * 8)) * 0.03

    if (t < LOG_OFF_WALK_AT) {
        // Steps away from the desk into the aisle, back turned to the monitor
        const back = (t - LOG_OFF_STAND_AT) / (LOG_OFF_WALK_AT - LOG_OFF_STAND_AT)
        person.rotation.y = Math.PI
        person.position.set(0, 0.1 + step, THREE.MathUtils.lerp(0.65, LOG_OFF_AISLE_Z, back))
        return
    }

    // Turns and walks down the aisle into the dark, away from the camera
    const walked = (t - LOG_OFF_WALK_AT) * LOG_OFF_SPEED
    person.rotation.y = THREE.MathUtils.lerp(Math.PI, Math.PI / 2, Math.min(walked * 2, 1))
    person.position.set(-walked, 0.1 + step, LOG_OFF_AISLE_Z)
}

const updateEnding = (elapsedTime) => {
    if (experience.phase !== 'ending') return

    const kind = experience.ending
    const t = Math.min((elapsedTime - experience.endingStart) / endings[kind].duration, 1)
    const eased = smoothstep(t)

    if (kind === 'calm') updateCalmEnding(t, eased)
    if (kind === 'fired') updateFiredEnding(elapsedTime)
    if (kind === 'burnout') updateBurnoutEnding(elapsedTime)
    if (kind === 'loggedOff') updateLoggedOffEnding(elapsedTime)

    camera.position.lerpVectors(endingFrom.cameraPosition, endingCamera.position, eased)
    controls.target.lerpVectors(endingFrom.controlsTarget, endingCamera.target, eased)

    if (t >= 1) {
        experience.phase = 'done'
        controls.enabled = true
        // He left: he's no longer in the office
        if (kind === 'loggedOff') heroDesk.userData.person.visible = false
        showOutro(kind)
    }
}

/**
 * Levels
 * The rules are the same on every level: hold the monitor, dismiss notifications.
 * Levels only change the pace: how fast Performance drains, how often and how fast cards fly,
 * how much a missed one costs, and how much harmless, distracting noise is mixed in.
 *
 * Levels form an even ladder: only the easiest (Junior, the game's original numbers) and the hardest (Lead) are defined,
 * and every level takes values between them by its tier: 0, 1/3, 2/3, 1.
 * So the difficulty step between neighbouring levels is always the same, and only two sets of numbers need tuning.
 * Tune them in #debug → Game / News, then copy the numbers here
 */
const LEVEL_EASIEST = {
    game: {
        performanceDecayStart: 2,
        performanceDecayEnd: 6,
        stressPerHit: 8,
        stressDecay: 1.5,
        respawnChance: 0.5,
        noiseChance: 0,
    },
    news: { spawnIntervalStart: 3, spawnIntervalEnd: 1.2, flightDurationStart: 9, flightDurationEnd: 3.5 },
}

const LEVEL_HARDEST = {
    game: {
        performanceDecayStart: 4,
        performanceDecayEnd: 10,
        stressPerHit: 12,
        stressDecay: 1, // stress fades slower: missed cards pile up and the second meter adds pressure too
        respawnChance: 0.55,
        noiseChance: 0.3,
    },
    news: { spawnIntervalStart: 2, spawnIntervalEnd: 0.8, flightDurationStart: 6.5, flightDurationEnd: 2.5 },
}

const levels = {
    junior: { tier: 0, name: 'Junior', description: 'The night shift as it is. Hold the monitor, clear notifications.' },
    middle: { tier: 1 / 3, name: 'Middle', description: 'More notifications, and faster. Some are just noise.' },
    senior: { tier: 2 / 3, name: 'Senior', description: 'Everything at once. Your work slips away faster.' },
    lead: { tier: 1, name: 'Lead', description: 'No one is coming to help. Good luck.' },
}

// Level parameters: each number lies between Junior and Lead, by the level's tier
const getLevelParams = (group, tier) => Object.fromEntries(
    Object.keys(LEVEL_EASIEST[group]).map((key) => [
        key,
        THREE.MathUtils.lerp(LEVEL_EASIEST[group][key], LEVEL_HARDEST[group][key], tier),
    ])
)

const LEVEL_ORDER = Object.keys(levels)
// Grades from which a step down is offered after a loss, and which endings count as a loss
// (loggedOff isn't a loss: the hero left on his own)
const DEMOTE_FROM = ['senior', 'lead']
const FAIL_ENDINGS = ['fired', 'burnout', 'frozen']

let currentLevelKey = 'junior'
let currentLevel = levels.junior

// Levels already survived until morning get a checkmark on the start screen
const getPassedLevels = () => readSet(STORAGE_KEYS.passedLevels)
const markLevelPassed = (key) => addToSet(STORAGE_KEYS.passedLevels, key)
const saveLevel = (key) => writeItem(STORAGE_KEYS.level, key)

const applyLevel = (key) => {
    // hasOwn rather than levels[key]: localStorage could hold something like 'toString'
    currentLevelKey = Object.hasOwn(levels, key) ? key : 'junior'
    currentLevel = levels[currentLevelKey]

    Object.assign(game, getLevelParams('game', currentLevel.tier))
    Object.assign(news, getLevelParams('news', currentLevel.tier))

    const passed = getPassedLevels()
    for (const button of ui.levelButtons) {
        button.setAttribute('aria-checked', String(button.dataset.level === currentLevelKey))
        button.classList.toggle('is-passed', passed.has(button.dataset.level))
    }
    ui.levelDesc.textContent = currentLevel.description

    for (const controller of gui.controllersRecursive()) controller.updateDisplay()
}

for (const button of ui.levelButtons) {
    button.addEventListener('click', () => {
        if (experience.phase !== 'intro') return
        applyLevel(button.dataset.level)
        saveLevel(currentLevelKey)
    })
}

// Left/right arrows switch the level, like a regular radio group
ui.levelButtons[0]?.parentElement.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const step = event.key === 'ArrowRight' ? 1 : -1
    const index = (LEVEL_ORDER.indexOf(currentLevelKey) + step + LEVEL_ORDER.length) % LEVEL_ORDER.length
    applyLevel(LEVEL_ORDER[index])
    saveLevel(currentLevelKey)
    document.querySelector(`[data-level="${currentLevelKey}"]`).focus()
})

ui.promote.addEventListener('click', () => {
    saveLevel(ui.promote.dataset.next)
    window.location.reload()
})

applyLevel(readItem(STORAGE_KEYS.level))

gui.addFolder('Level').add({ level: currentLevelKey }, 'level', LEVEL_ORDER).onChange((key) => {
    applyLevel(key)
    saveLevel(key)
})
gameFolder.add(game, 'noiseChance').min(0).max(1).step(0.01).name('noise share')

// Endings on a button, so you don't have to play a whole shift for each (works once a shift is running)
const endingsFolder = gui.addFolder('Endings').close()
for (const kind of Object.keys(endings)) endingsFolder.add({ [kind]: () => startEnding(kind) }, kind)

/**
 * Animate
 */
let previousTime = 0

// On phones the intro text covers the bottom half of the screen: shift the frame so the office sits on top.
// After the start, ease the scene back to the center
const INTRO_PORTRAIT_SHIFT = 0.2 // fraction of the screen height
let introFraming = 1
// In the finale it's the other way round: the summary is on the left (at the bottom on phones), so the hero moves right (or up)
const OUTRO_LANDSCAPE_SHIFT = 0.18 // fraction of the screen width
let outroFraming = 0
const updateIntroFraming = (deltaTime) => {
    if (experience.phase !== 'intro') introFraming = Math.max(0, introFraming - deltaTime / 1.2)
    if (experience.phase === 'ending' || experience.phase === 'done') outroFraming = Math.min(1, outroFraming + deltaTime / 2.5)
    const portrait = sizes.width < sizes.height
    const shiftY = portrait ? INTRO_PORTRAIT_SHIFT * Math.max(smoothstep(introFraming), smoothstep(outroFraming)) : 0
    const shiftX = portrait ? 0 : -OUTRO_LANDSCAPE_SHIFT * smoothstep(outroFraming)
    if (shiftX || shiftY) camera.setViewOffset(sizes.width, sizes.height, sizes.width * shiftX, sizes.height * shiftY, sizes.width, sizes.height)
    else if (camera.view && camera.view.enabled) camera.clearViewOffset()
}

const tick = () => {
    clock.update()
    const elapsedTime = clock.getElapsedTime()
    const deltaTime = elapsedTime - previousTime // the step is already clamped in clock.update()
    previousTime = elapsedTime

    updateStory(elapsedTime)
    updateIntroLights(elapsedTime)
    updateClockIn(deltaTime)
    updateColleagues(elapsedTime)
    updateFiringLabels(elapsedTime)
    updateGhosts(elapsedTime)
    updateBursts(elapsedTime)
    updateAmbient(elapsedTime)
    updateCodeScreen(elapsedTime, deltaTime)
    updateNews(elapsedTime)
    updateApplications(elapsedTime)
    updateLampHold(deltaTime)
    updateTension(elapsedTime)
    updateGame(elapsedTime, deltaTime) // after updateTension: draws the "working" color over its screen color
    updateTutorial(elapsedTime)
    updateCallout(elapsedTime)
    updateHoldHint(elapsedTime)
    updateLampHint(elapsedTime)
    updateEnding(elapsedTime)
    updateIntroFraming(deltaTime)

    updateCameraReturn(deltaTime)
    controls.update()
    if (experience.phase === 'explore') controls.target.clamp(EXPLORE_BOUNDS.min, EXPLORE_BOUNDS.max)

    // Shake is added only for the render so it doesn't accumulate in the camera position
    camera.position.add(cameraShake)
    renderer.render(scene, camera)
    camera.position.sub(cameraShake)

    window.requestAnimationFrame(tick)
}

tick()
