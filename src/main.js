import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import GUI from 'lil-gui'
import { createCardTexture, createGlowLabelTexture, createScreenTexture } from './canvasText.js'
import { createSound } from './sound.js'

/**
 * Base
 */
// Панель видна только по адресу с #debug, например localhost:5173/#debug
const gui = new GUI({ title: 'Debug' })
const updateDebugVisibility = () => gui.show(window.location.hash === '#debug')
updateDebugVisibility()
window.addEventListener('hashchange', updateDebugVisibility)
const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()

const params = {
    background: '#05060a',
    fogDensity: 0.06,
    fogDensityGrowth: 0.015, // насколько сгущается туман к концу истории
    vignetteStrength: 0.55, // насколько темнеют края экрана при максимальном стрессе
    heroLightIntensity: 25,
    cameraShake: 0.04,
}

const sound = createSound()

scene.background = new THREE.Color(params.background)
scene.fog = new THREE.FogExp2(params.background, params.fogDensity)

/**
 * Textures
 */
// Мягкое световое пятно рисуем на canvas: белый центр -> прозрачный край.
// Это «фейковый» свет: выглядит как лампа, но почти ничего не стоит для GPU
const createLightPoolTexture = () => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.35)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}
const lightPoolTexture = createLightPoolTexture()

/**
 * Shared geometries & materials
 * Одна геометрия на все столы, а не своя у каждого: так быстрее
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
    screenWork: new THREE.Color('#9be7c4'), // экран героя, пока он работает
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
    torso.rotation.x = -0.12 // чуть сутулится к монитору
    person.add(torso)

    const head = new THREE.Mesh(geometries.head, materials.skin)
    head.position.set(0, 1.5, -0.08)
    person.add(head)

    const thighs = new THREE.Mesh(geometries.thigh, materials.pants)
    thighs.position.set(0, 0.55, -0.15)
    person.add(thighs)

    // Понадобится в концовке Logged off, когда герой встаёт и уходит
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

    // Столешница и ножки
    const top = new THREE.Mesh(geometries.deskTop, materials.desk)
    top.position.y = 0.75
    desk.add(top)

    for (const [x, z] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) {
        const leg = new THREE.Mesh(geometries.deskLeg, materials.metal)
        leg.position.set(x, 0.375, z)
        desk.add(leg)
    }

    // Монитор: корпус + светящийся экран (MeshBasicMaterial не зависит от света)
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

    // Стул и человек сидят перед столом (+z), лицом к монитору (-z)
    const chair = createChair()
    chair.position.z = 0.65
    desk.add(chair)

    const person = createPerson(shirtColor)
    person.position.z = 0.65
    desk.add(person)

    // Подвесная лампа
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

    // Световое пятно на полу под лампой
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

    // Всё, что понадобится менять потом, складываем в userData
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
            // Герой в оранжевом худи — маленький хеллоуинский намёк
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
// Тыква на столе героя
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

// Второй монитор: на нём герой весь день откликается на вакансии
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

// Точка, в которую летят все новости — голова героя
const heroHead = heroDesk.position.clone().add(new THREE.Vector3(0, 1.5, 0.57))

// Невидимая коробка вокруг монитора героя: по ней проще попасть пальцем, чем по самому экрану.
// visible: false в материале — меш не рисуется, но Raycaster его всё равно находит
const workHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.8, 0.6),
    new THREE.MeshBasicMaterial({ visible: false })
)
workHitbox.position.set(0, 1.1, -0.1)
heroDesk.add(workHitbox)

// Такая же невидимая сфера вокруг лампы героя: по ней можно выключить свет и уйти (концовка Logged off)
const lampHitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 8),
    new THREE.MeshBasicMaterial({ visible: false })
)
lampHitbox.position.set(0, 2.65, 0)
heroDesk.add(lampHitbox)

/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight('#8090b0', 0.08)
scene.add(ambientLight)

// Холодный «лунный» свет из окон — чтобы читались силуэты
const moonLight = new THREE.DirectionalLight('#6f86b8', 0.25)
moonLight.position.set(-8, 10, -6)
scene.add(moonLight)

// Единственный настоящий тёплый свет — над героем. Только он отбрасывает тени
const heroLight = new THREE.SpotLight('#ffd9a0', params.heroLightIntensity, 8, Math.PI * 0.28, 0.6, 2)
heroLight.position.set(0, 2.6, 0)
heroLight.target.position.set(0, 0, 0.2)
heroLight.castShadow = true
heroLight.shadow.mapSize.set(1024, 1024)
heroLight.shadow.camera.near = 0.5
heroLight.shadow.camera.far = 6
heroDesk.add(heroLight, heroLight.target)

// Синеватый отсвет монитора на лице героя
const monitorGlow = new THREE.PointLight('#6f9cff', 1.5, 2.5, 2)
monitorGlow.position.set(0, 1.15, 0.05)
heroDesk.add(monitorGlow)

/**
 * Firing colleagues
 * Лампа мигает ~1.2 секунды, потом гаснет, а человек исчезает
 */
const FLICKER_DURATION = 1.2

const firingReasons = [
    'LOW PERFORMANCE',
    'INSUFFICIENT AI ADOPTION',
    'ROLE NO LONGER REQUIRED',
    'RESTRUCTURING',
    'NOT AI-NATIVE ENOUGH',
    'REPLACED BY AGENT',
]

const fireColleague = (desk) => {
    if (desk.userData.state !== 'on') return
    desk.userData.state = 'flickering'
    desk.userData.flickerStart = clock.getElapsedTime()
    showFiringLabel(desk)
    sound.buzz()
}

const pickRandom = (array) => array[Math.floor(Math.random() * array.length)]

const fireRandomColleague = () => {
    const working = colleagues.filter((desk) => desk.userData.state === 'on')
    if (working.length === 0) return null
    const desk = pickRandom(working)
    fireColleague(desk)
    return desk
}

/**
 * Firing labels
 * Над столом всплывает причина увольнения: появляется, медленно поднимается и тает
 */
const LABEL_LIFETIME = 3.5
const floatingLabels = []

const showFiringLabel = (desk, reason = pickRandom(firingReasons)) => {
    const { texture, aspect } = createGlowLabelTexture(reason)
    // Sprite всегда повёрнут к камере — удобно для надписей
    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 })
    )
    const height = 0.4
    sprite.scale.set(height * aspect, height, 1)
    sprite.position.copy(desk.position)
    sprite.position.y = 2.0
    scene.add(sprite)

    floatingLabels.push({ sprite, start: clock.getElapsedTime() })
}

const updateFiringLabels = (elapsedTime) => {
    // Идём с конца массива, потому что удаляем элементы по ходу
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

// power: 1 — всё горит, 0 — темнота
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
            // Псевдослучайное мигание ~12 раз в секунду
            const step = Math.floor(t * 12)
            const noise = Math.abs(Math.sin(step * 12.9898) * 43758.5453) % 1
            setDeskPower(desk, noise > 0.45 ? 1 : 0.1)
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
 * Уволенный коллега поднимается со стула призраком с коробкой вещей и бродит по офису
 */
const createGhostGeometry = () => {
    // LatheGeometry «вращает» профиль вокруг оси Y — как гончарный круг
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

    // Делаем волнистый подол: двигаем нижние вершины вверх-вниз по синусоиде
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

    // Глаза и коробка спереди, то есть по +z: туда призрак «смотрит»
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
        origin: desk.position.clone().add(new THREE.Vector3(0, 0, 0.65)), // стул
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

// В финале призраки растворяются: 1 → 0
let ghostVisibility = 1

// В концовке Logged off призраки останавливаются и смотрят, как герой уходит
const ghostWatch = {
    pausedAt: null, // с какого момента призраки стоят на месте
    target: null, // на кого смотрят (точка в сцене)
}

const ghostTarget = new THREE.Vector3()

const updateGhosts = (elapsedTime) => {
    for (const ghost of ghosts) {
        const { start, origin, radius, speed, phase } = ghost.userData
        const t = elapsedTime - start

        // Появление: растёт и поднимается со стула (easeOut — быстро в начале, плавно в конце)
        const appear = Math.min(t / GHOST_APPEAR_DURATION, 1)
        const eased = appear * (2 - appear)
        ghost.scale.setScalar(eased * ghostVisibility)

        // Потом бродит по кругу. Вычитаем cos/sin(phase), чтобы круг начинался ровно от стула.
        // Если призраки остановились — время блуждания замирает на моменте остановки
        const walkedTime = ghostWatch.pausedAt === null ? t : Math.min(t, ghostWatch.pausedAt - start)
        const wanderTime = Math.max(0, walkedTime - GHOST_APPEAR_DURATION)
        const angle = phase + wanderTime * speed
        ghost.position.x = origin.x + (Math.cos(angle) - Math.cos(phase)) * radius
        ghost.position.z = origin.z + (Math.sin(angle) - Math.sin(phase)) * radius
        ghost.position.y = THREE.MathUtils.lerp(0.3, 0.9, eased) + Math.sin(elapsedTime * 2 + phase) * 0.08

        if (ghostWatch.target) {
            // Медленно поворачиваемся к герою. Призрак «смотрит» по +z, поэтому atan2(dx, dz)
            ghostTarget.copy(ghostWatch.target).sub(ghost.position)
            const targetAngle = Math.atan2(ghostTarget.x, ghostTarget.z)
            const turn = Math.atan2(Math.sin(targetAngle - ghost.rotation.y), Math.cos(targetAngle - ghost.rotation.y))
            ghost.rotation.y += turn * 0.05
        } else if (wanderTime > 0) {
            // Поворачиваем лицом по направлению движения (касательная к кругу)
            ghost.rotation.y = Math.atan2(-Math.sin(angle) * speed, Math.cos(angle) * speed)
        }
    }
}

/**
 * Story timeline
 * Каждое следующее увольнение происходит быстрее предыдущего:
 * interval = firstInterval * acceleration ^ firedCount, но не меньше minInterval
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

// 0 — начало истории, 1 — уволены все
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
 * Карточки прилетают из темноты к голове героя. Чем дальше история — тем их больше и тем они быстрее
 */
const accents = {
    news: '#ff5a5a',
    slack: '#a78bfa',
    email: '#f5a524',
    calendar: '#38bdf8',
    linkedin: '#60a5fa',
    ai: '#34d399',
}

const newsFeed = [
    { label: 'Breaking', text: 'New AI model writes code 40% faster than senior devs', accent: accents.news },
    { label: 'Slack · Manager', text: 'Quick sync? 🙂', accent: accents.slack },
    { label: 'Email · HR', text: 'Mandatory AI adoption training — due today', accent: accents.email },
    { label: 'Breaking', text: 'Tech layoffs hit a new record this quarter', accent: accents.news },
    { label: 'Calendar', text: 'Performance review — tomorrow, 9:00', accent: accents.calendar },
    { label: 'LinkedIn', text: 'Your former teammate is now #OpenToWork', accent: accents.linkedin },
    { label: 'Slack · #general', text: 'Please welcome our new AI teammate 🤖', accent: accents.slack },
    { label: 'Changelog', text: 'Model v7 is out. v6 is deprecated (released 3 weeks ago)', accent: accents.ai },
    { label: 'Breaking', text: 'Markets fall amid recession fears', accent: accents.news },
    { label: 'Email · CEO', text: 'We are becoming an AI-first company', accent: accents.email },
    { label: 'Slack · Manager', text: 'Why is the ticket still in progress?', accent: accents.slack },
    { label: 'Breaking', text: 'Experts: 2 years left for most junior roles', accent: accents.news },
    { label: 'Calendar', text: 'All-hands: "Org changes" — 16:00', accent: accents.calendar },
    { label: 'Changelog', text: 'Your framework is now legacy', accent: accents.ai },
]

// Одна текстура на каждый текст: если карточка повторяется, не рисуем её заново
const cardTextures = new Map()
const getCardTexture = (item) => {
    if (!cardTextures.has(item.text)) cardTextures.set(item.text, createCardTexture(item))
    return cardTextures.get(item.text)
}

const flyingCards = []
const news = {
    nextSpawnAt: 1.5,
    feedIndex: 0,
    // Интервалы и скорость в начале и в конце истории
    spawnIntervalStart: 3.5,
    spawnIntervalEnd: 0.9,
    flightDurationStart: 9,
    flightDurationEnd: 3.5,
}

const SPAWN_RADIUS_MIN = 8
const SPAWN_RADIUS_MAX = 11
const DISMISS_DURATION = 0.25

const nextFeedItem = () => newsFeed[news.feedIndex++ % newsFeed.length]

// Случайная точка на кольце вокруг героя, где-то в темноте
const randomSpawnPoint = () => {
    const angle = Math.random() * Math.PI * 2
    const radius = THREE.MathUtils.lerp(SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX, Math.random())
    return new THREE.Vector3(
        heroHead.x + Math.cos(angle) * radius,
        2.5 + Math.random() * 2.5,
        heroHead.z + Math.sin(angle) * radius
    )
}

const spawnCard = (item, elapsedTime, from = randomSpawnPoint()) => {
    const { texture, aspect } = getCardTexture(item)
    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 })
    )
    const height = 0.45
    sprite.scale.set(height * aspect, height, 1)
    sprite.position.copy(from)
    scene.add(sprite)

    // Длительность полёта зависит от расстояния: карточка, родившаяся рядом, долетает быстрее
    const baseDuration = THREE.MathUtils.lerp(news.flightDurationStart, news.flightDurationEnd, getStoryProgress())
    const averageRadius = (SPAWN_RADIUS_MIN + SPAWN_RADIUS_MAX) / 2
    const duration = Math.max(1.5, baseDuration * from.distanceTo(heroHead) / averageRadius)

    flyingCards.push({
        sprite,
        from,
        baseScale: sprite.scale.clone(),
        start: elapsedTime,
        duration,
        dismissedAt: null,
    })
    sound.ping()
}

const removeCard = (index) => {
    const card = flyingCards[index]
    scene.remove(card.sprite)
    card.sprite.material.dispose() // текстуру не трогаем — она в кэше
    flyingCards.splice(index, 1)
}

// Закрыл уведомление — стало чуть спокойнее, но иногда на его месте тут же появляется новое
const dismissCard = (card) => {
    const elapsedTime = clock.getElapsedTime()
    card.dismissedAt = elapsedTime
    sound.pop()
    addDismissScore(card.sprite.position)
    if (experience.phase === 'running') {
        game.dismissed++
        game.lastActionAt = elapsedTime
    }
    game.stress = Math.max(0, game.stress - game.stressReliefPerDismiss)

    // Во время обучения новых карточек не подкидываем — игрок учится на одной
    if (!isTutorial() && Math.random() < game.respawnChance) {
        const offset = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            .normalize()
            .multiplyScalar(0.8)
        spawnCard(nextFeedItem(), elapsedTime, card.sprite.position.clone().add(offset))
    }
}

const updateNews = (elapsedTime) => {
    const progress = getStoryProgress()

    if (experience.phase === 'running' && !isTutorial() && !shift.over && elapsedTime >= news.nextSpawnAt) {
        spawnCard(nextFeedItem(), elapsedTime)
        news.nextSpawnAt = elapsedTime + THREE.MathUtils.lerp(news.spawnIntervalStart, news.spawnIntervalEnd, progress)
    }

    for (let i = flyingCards.length - 1; i >= 0; i--) {
        const card = flyingCards[i]

        // Закрытая карточка коротко «лопается»: растёт и исчезает
        if (card.dismissedAt !== null) {
            const dismissT = (elapsedTime - card.dismissedAt) / DISMISS_DURATION
            if (dismissT >= 1) {
                removeCard(i)
                continue
            }
            card.sprite.scale.copy(card.baseScale).multiplyScalar(1 + dismissT * 0.5)
            card.sprite.material.opacity = 1 - dismissT
            continue
        }

        // Концовка Frozen: время остановилось, карточки так и висят в воздухе вокруг героя
        if (experience.cardsFrozen) continue

        const t = (elapsedTime - card.start) / card.duration // 0 → 1

        if (t >= 1) {
            removeCard(i)
            onCardHit()
            continue
        }

        // t * t — медленно в начале, быстро в конце: карточка «набрасывается»
        card.sprite.position.lerpVectors(card.from, heroHead, t * t)

        // Появляется в начале, тает и уменьшается у самой головы
        const fadeIn = Math.min(t / 0.1, 1)
        const fadeOut = Math.min((1 - t) / 0.15, 1)
        card.sprite.material.opacity = Math.min(fadeIn, fadeOut)
        card.sprite.scale.copy(card.baseScale).multiplyScalar(0.4 + 0.6 * fadeOut)
    }
}

/**
 * Job applications
 * Счётчик на втором мониторе: откликов всё больше, ответов — только отказы
 */
const rejections = [
    "We'll get back to you",
    'Unfortunately, we decided to move forward with other candidates',
    'The position has been filled',
    "We'll keep your CV on file",
    'You are overqualified for this role',
    'We are looking for someone with more AI experience',
]

const applications = {
    sent: 211, // он откликается уже несколько месяцев
    interviews: 0,
    lastReply: rejections[0],
    nextAt: 1,
    interval: 1.6,
}

const drawJobScreen = () => {
    jobScreen.redraw((context, width, height, font) => {
        context.fillStyle = '#0d1117'
        context.fillRect(0, 0, width, height)

        context.fillStyle = '#7d8590'
        context.font = `600 24px ${font}`
        context.fillText('JOB APPLICATIONS', 28, 44)

        context.fillStyle = '#f2f4f8'
        context.font = `800 72px ${font}`
        context.fillText(String(applications.sent), 28, 128)
        context.fillStyle = '#7d8590'
        context.font = `600 24px ${font}`
        context.fillText('sent', 32, 160)

        // Ноль интервью — красный. Первое приглашение (только на рассвете) — зелёное
        context.fillStyle = applications.interviews > 0 ? '#34d399' : '#ff6b6b'
        context.font = `800 72px ${font}`
        context.fillText(String(applications.interviews), 300, 128)
        context.fillStyle = '#7d8590'
        context.font = `600 24px ${font}`
        context.fillText('interviews', 302, 160)

        context.fillStyle = '#c9d1d9'
        context.font = `italic 500 22px ${font}`
        const reply = applications.lastReply.length > 42
            ? `${applications.lastReply.slice(0, 41)}…`
            : applications.lastReply
        context.fillText(`“${reply}”`, 28, 240)
    })
}
drawJobScreen()

const updateApplications = (elapsedTime) => {
    if (experience.phase !== 'running' || isTutorial() || elapsedTime < applications.nextAt) return
    applications.nextAt = elapsedTime + applications.interval

    applications.sent += 1 + Math.floor(Math.random() * 3)
    if (Math.random() < 0.35) applications.lastReply = pickRandom(rejections)
    drawJobScreen()
}

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
}

window.addEventListener('resize', () => {
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight
    sizes.pixelRatio = Math.min(window.devicePixelRatio, 2)

    camera.aspect = sizes.width / sizes.height
    camera.fov = getCameraFov()
    camera.updateProjectionMatrix()

    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(sizes.pixelRatio)
})

/**
 * Camera
 */
// На вертикальном экране телефона в кадр влезает мало офиса — расширяем угол обзора
const getCameraFov = () => (sizes.width < sizes.height ? 65 : 45)

const camera = new THREE.PerspectiveCamera(getCameraFov(), sizes.width / sizes.height, 0.1, 100)
camera.position.set(7, 7.5, 11)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.target.copy(heroDesk.position).add(new THREE.Vector3(0, 0.8, 0))
controls.enableDamping = true
controls.maxPolarAngle = Math.PI * 0.45 // не даём заглянуть под пол
controls.minDistance = 3
controls.maxDistance = 22

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(sizes.pixelRatio)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping

/**
 * Pointer interaction
 * Raycaster пускает луч из камеры через точку под курсором и ищет, во что он попал
 */
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const cardScreenPosition = new THREE.Vector3()

// Запас вокруг карточки в пикселях: по летящей цели трудно попасть точно, поэтому прощаем промах
const CARD_HIT_PADDING = 18

/**
 * Ищем карточку под курсором прямо в пикселях экрана, а не лучом:
 * так можно добавить запас вокруг карточки, и попасть по ней намного проще
 */
const getCardUnderPointer = (event) => {
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    let closestCard = null
    let closestDistance = Infinity

    for (const card of flyingCards) {
        if (card.dismissedAt !== null) continue

        cardScreenPosition.copy(card.sprite.position).project(camera)
        if (cardScreenPosition.z > 1) continue // карточка за камерой
        const x = (cardScreenPosition.x + 1) / 2 * sizes.width
        const y = (1 - cardScreenPosition.y) / 2 * sizes.height

        // Сколько пикселей экрана занимает одна единица сцены на расстоянии карточки
        const distance = camera.position.distanceTo(card.sprite.position)
        const pixelsPerUnit = sizes.height / (2 * distance * tanHalfFov)
        const halfWidth = card.sprite.scale.x * pixelsPerUnit / 2 + CARD_HIT_PADDING
        const halfHeight = card.sprite.scale.y * pixelsPerUnit / 2 + CARD_HIT_PADDING

        const isInside = Math.abs(event.clientX - x) <= halfWidth && Math.abs(event.clientY - y) <= halfHeight
        // Если карточки перекрываются, берём ближайшую к камере — она нарисована сверху
        if (isInside && distance < closestDistance) {
            closestCard = card
            closestDistance = distance
        }
    }

    return closestCard
}

const isPointerOn = (event, object) => {
    // Переводим пиксели в координаты от -1 до 1, которые ждёт Raycaster
    pointer.x = (event.clientX / sizes.width) * 2 - 1
    pointer.y = -(event.clientY / sizes.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    return raycaster.intersectObject(object).length > 0
}

const isPointerOnMonitor = (event) => isPointerOn(event, workHitbox)
const isPointerOnLamp = (event) => canLogOff() && isPointerOn(event, lampHitbox)

// Пока палец или кнопка мыши заняты карточкой или монитором, камеру не крутим
let isPointerBusy = false

const holdPointer = () => {
    isPointerBusy = true
    controls.enabled = false
}

const releasePointer = () => {
    game.working = false
    if (!isPointerBusy) return
    isPointerBusy = false
    if (experience.phase === 'running') controls.enabled = true
}

canvas.addEventListener('pointerdown', (event) => {
    if (experience.phase !== 'running') return

    // Карточку закрываем сразу при нажатии, а не при отпускании:
    // иначе за 100–200 мс между ними быстрая карточка успевает улететь из-под курсора
    const card = getCardUnderPointer(event)
    if (card) {
        dismissCard(card)
        holdPointer()
        return
    }

    // Зажали монитор — герой работает
    if (isPointerOnMonitor(event)) {
        game.working = true
        holdPointer()
        return
    }

    // Нажали на свою лампу — выключил свет и ушёл
    if (isPointerOnLamp(event)) startEnding('loggedOff')
})

canvas.addEventListener('pointerup', releasePointer)
// Палец ушёл с экрана или браузер отменил касание — тоже отпускаем
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
 * Фазы истории: intro (стартовый экран) → running → ending (закрыл ноутбук, рассвет) → done
 */
const experience = {
    phase: 'intro',
    ending: null, // 'calm' | 'fired' | 'burnout' | 'frozen' | 'loggedOff'
    endingsFound: new Set(),
    endingTime: '',
    endingStats: null, // цифры этой ночи для текста концовки: время, сколько закрыл, сколько пропустил
    cardsFrozen: false, // концовка Frozen: карточки замирают в воздухе
    aftermathShown: false, // для концовки burnout: показали ли уже пустой офис после вспышки
    endingStart: 0,
    lastIntensity: -1,
}

const ui = {
    intro: document.querySelector('[data-intro]'),
    start: document.querySelector('[data-start]'),
    clockPanel: document.querySelector('[data-clock-panel]'),
    clock: document.querySelector('[data-clock]'),
    clockGoal: document.querySelector('[data-clock-goal]'),
    coach: document.querySelector('[data-coach]'),
    coachText: document.querySelector('[data-coach-text]'),
    coachSkip: document.querySelector('[data-coach-skip]'),
    shiftOver: document.querySelector('[data-shift-over]'),
    goHome: document.querySelector('[data-go-home]'),
    outroCard: document.querySelector('[data-outro-card]'),
    outroTime: document.querySelector('[data-outro-time]'),
    outroBest: document.querySelector('[data-outro-best]'),
    outroEndings: document.querySelector('[data-outro-endings]'),
    outro: document.querySelector('[data-outro]'),
    restart: document.querySelector('[data-restart]'),
    mute: document.querySelector('[data-mute]'),
    hud: document.querySelector('[data-hud]'),
    performance: document.querySelector('[data-meter="performance"]'),
    stress: document.querySelector('[data-meter="stress"]'),
    vignette: document.querySelector('[data-vignette]'),
    whiteout: document.querySelector('[data-whiteout]'),
    outroEnding: document.querySelector('[data-outro-ending]'),
    outroTitle: document.querySelector('[data-outro-title]'),
    outroMeta: document.querySelector('[data-outro-meta]'),
    outroLead: document.querySelector('[data-outro-lead]'),
    outroSting: document.querySelector('[data-outro-sting]'),
    outroStingSender: document.querySelector('[data-outro-sting-sender]'),
    outroStingTime: document.querySelector('[data-outro-sting-time]'),
    outroStingText: document.querySelector('[data-outro-sting-text]'),
    outroFound: document.querySelector('[data-outro-found]'),
    outroScore: document.querySelector('[data-outro-score]'),
    score: document.querySelector('[data-score]'),
    combo: document.querySelector('[data-combo]'),
    popups: document.querySelector('[data-popups]'),
}

// На сенсорных экранах пишем «Tap» вместо «Click»
const actionWord = window.matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click'
for (const element of document.querySelectorAll('[data-action-word]')) element.textContent = actionWord

// Пока висит стартовый экран, камера медленно облетает офис
controls.autoRotate = true
controls.autoRotateSpeed = 0.3

const startShift = () => {
    experience.phase = 'running'
    sound.start()
    controls.autoRotate = false

    ui.intro.classList.add('is-hidden')
    setTimeout(() => (ui.intro.hidden = true), 1200)
    ui.hud.hidden = false
    ui.clockPanel.hidden = false

    if (shouldShowTutorial()) startTutorial()
    else beginShift()
}

// Таймеры истории отсчитываем от момента, когда смена реально началась (после обучения), а не от загрузки страницы
const beginShift = () => {
    const elapsedTime = clock.getElapsedTime()
    story.nextFireAt = elapsedTime + story.startDelay
    news.nextSpawnAt = elapsedTime + 1.5
    applications.nextAt = elapsedTime + 1
    shift.start = elapsedTime
    shift.duration = getShiftDuration()
}

ui.start.addEventListener('click', startShift)
ui.restart.addEventListener('click', () => window.location.reload())
/**
 * Sound toggle
 * Выбор запоминаем в localStorage, чтобы после перезагрузки звук остался выключенным.
 * localStorage может быть недоступен (например, в приватном режиме), поэтому оборачиваем в try/catch
 */
const MUTE_STORAGE_KEY = 'nightmare-office:muted'
const muteLabel = document.querySelector('[data-mute-label]')

const setMuted = (muted) => {
    sound.setMuted(muted)
    ui.mute.classList.toggle('is-muted', muted)
    ui.mute.setAttribute('aria-pressed', String(muted))
    muteLabel.textContent = muted ? 'Sound off' : 'Sound on'
    try {
        localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0')
    } catch {}
}

const toggleMute = () => setMuted(!sound.isMuted())

try {
    setMuted(localStorage.getItem(MUTE_STORAGE_KEY) === '1')
} catch {
    setMuted(false)
}

ui.mute.addEventListener('click', toggleMute)

// Если Safari приостановил звук (свернули вкладку, был звонок), возобновляем при следующем касании
window.addEventListener('pointerdown', sound.resume)
window.addEventListener('touchend', sound.resume) // старые iOS считают жестом только touchend
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sound.resume()
})
window.addEventListener('keydown', (event) => {
    // Не перехватываем M, когда печатают в поле Debug-панели
    const isTyping = event.target instanceof Element && event.target.closest('input, textarea')
    if (event.key.toLowerCase() !== 'm' || isTyping) return
    toggleMute()
})

/**
 * Shift clock
 * Смена идёт с 22:00 до 06:00. Её длина в секундах подбирается так,
 * чтобы к 06:00 успели уволить всех коллег
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
    return total + FLICKER_DURATION + 3 // небольшая пауза после последнего увольнения
}

const getShiftFraction = (elapsedTime) =>
    THREE.MathUtils.clamp((elapsedTime - shift.start) / shift.duration, 0, 1)

const formatShiftTime = (fraction) => {
    const minutes = shift.startHour * 60 + Math.floor(fraction * shift.hours * 60)
    const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0')
    const mm = String(minutes % 60).padStart(2, '0')
    return `${hh}:${mm}`
}

const endShift = () => {
    shift.over = true
    ui.clock.textContent = formatShiftTime(1)
    ui.clockGoal.textContent = 'Shift over'
    ui.shiftOver.hidden = false
    game.working = false

    // Утро: все уведомления, что ещё летят, тихо исчезают
    const elapsedTime = clock.getElapsedTime()
    for (const card of flyingCards) {
        if (card.dismissedAt === null) card.dismissedAt = elapsedTime
    }
}

ui.goHome.addEventListener('click', () => startEnding('calm'))

const hashNoise = (n) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1

/**
 * Tension
 * Чем больше уволено, тем гуще туман, тем чаще мигает лампа героя и сильнее дрожит камера
 */
const cameraShake = new THREE.Vector3()

const updateTension = (elapsedTime) => {
    if (experience.phase !== 'intro' && experience.phase !== 'running') return

    const tension = experience.phase === 'running' ? getStoryProgress() : 0
    scene.fog.density = params.fogDensity + params.fogDensityGrowth * tension

    // Во второй половине истории лампа героя начинает коротить
    let lampPower = 1
    if (tension > 0.5 && hashNoise(Math.floor(elapsedTime * 10)) < (tension - 0.5) * 0.4) lampPower = 0.25
    heroLight.intensity = params.heroLightIntensity * lampPower
    setDeskPower(heroDesk, lampPower)

    // tension меняется ступеньками, так что звук обновляем только при изменении
    if (tension !== experience.lastIntensity) {
        sound.setIntensity(tension)
        experience.lastIntensity = tension
    }

    // Дрожание: сумма синусов разной частоты выглядит как случайный шум
    const amplitude = params.cameraShake * tension * tension
    cameraShake.set(
        Math.sin(elapsedTime * 37) * Math.sin(elapsedTime * 13),
        Math.sin(elapsedTime * 29 + 1) * Math.sin(elapsedTime * 7),
        Math.sin(elapsedTime * 23 + 2) * Math.sin(elapsedTime * 11)
    ).multiplyScalar(amplitude)
}

/**
 * Game
 * Две шкалы тянут в разные стороны:
 * Performance растёт, пока держишь монитор, и всё время падает сама (к концу смены — быстрее)
 * Stress растёт, когда уведомление долетает до головы, и снижается, когда его закрываешь
 */
const game = {
    performance: 100,
    stress: 0,
    working: false,
    hitFlash: 0, // вспышка виньетки при попадании карточки: 1 → 0

    workRate: 16, // сколько Performance в секунду даёт работа
    performanceDecayStart: 2, // сколько Performance в секунду теряется в начале смены
    performanceDecayEnd: 6, // ... и в конце
    stressPerHit: 8,
    stressReliefPerDismiss: 2,
    stressDecay: 1.5, // сколько Stress в секунду уходит само
    respawnChance: 0.5, // шанс, что на месте закрытой карточки появится новая

    // Что игрок делал этой ночью — по этому выбираем концовку и пишем её текст
    dismissed: 0, // сколько уведомлений закрыл
    missed: 0, // сколько долетело до головы
    lastActionAt: null, // когда последний раз работал или закрывал карточку

    // Очки
    score: 0,
    combo: 0, // сколько карточек закрыто подряд без пропущенных
    hasWorked: false, // работал ли игрок хоть раз — пока нет, показываем подсказку над монитором
    workPointsPerSecond: 5,
    dismissPoints: 10,
    comboStep: 5, // каждые 5 карточек подряд множитель растёт на 1
    maxMultiplier: 5,
    calmBonus: 500,
}

const getMultiplier = () => Math.min(game.maxMultiplier, 1 + Math.floor(game.combo / game.comboStep))

// Переводим точку сцены в пиксели экрана — чтобы показать «+20» рядом с карточкой
const projectToScreen = (position) => {
    const projected = position.clone().project(camera)
    return { x: (projected.x + 1) / 2 * sizes.width, y: (1 - projected.y) / 2 * sizes.height }
}

const showPopup = (position, text, isBad = false) => {
    const { x, y } = projectToScreen(position)
    const popup = document.createElement('span')
    popup.className = isBad ? 'popup is-bad' : 'popup'
    popup.textContent = text
    popup.style.left = `${x}px`
    popup.style.top = `${y}px`
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

    // Множитель вырос — коротко «подпрыгиваем» надписью комбо
    if (game.combo % game.comboStep === 0 && multiplier <= game.maxMultiplier) {
        ui.combo.classList.remove('is-bump')
        void ui.combo.offsetWidth // трюк, чтобы CSS-анимация запустилась заново
        ui.combo.classList.add('is-bump')
    }
}

/**
 * Hold hint
 * Пульсирующая надпись над монитором героя: показывает, что монитор можно зажать.
 * Видна, пока игрок ни разу не поработал, и снова — когда Performance проседает
 */
const holdHintTexture = createGlowLabelTexture('HOLD TO WORK', '#34d399')
const holdHint = new THREE.Sprite(
    new THREE.SpriteMaterial({
        map: holdHintTexture.texture,
        transparent: true,
        depthTest: false, // поверх всего, чтобы герой и карточки её не закрывали
        fog: false,
        opacity: 0,
    })
)
holdHint.renderOrder = 10
holdHint.scale.set(0.24 * holdHintTexture.aspect, 0.24, 1)
const holdHintBase = heroDesk.position.clone().add(new THREE.Vector3(0, 1.62, -0.22))
holdHint.position.copy(holdHintBase)
scene.add(holdHint)

const updateHoldHint = (elapsedTime) => {
    const needsHint = experience.phase === 'running' && !shift.over && !game.working
        && (!game.hasWorked || game.performance < DANGER_LEVEL + 15)
    const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 5)

    // Плавно проявляем и прячем
    // Во время обучения вместо надписи над монитором показываем большую подсказку (см. Tutorial)
    const target = needsHint && !isTutorial() ? 0.6 + 0.4 * pulse : 0
    holdHint.material.opacity += (target - holdHint.material.opacity) * 0.15
    holdHint.position.y = holdHintBase.y + Math.sin(elapsedTime * 2.5) * 0.03

    // Экран тоже мерцает зелёным — подсказываем, куда нажимать
    if (needsHint) heroDesk.userData.screen.material.color.lerp(colors.screenWork, 0.15 + 0.35 * pulse)
}

const DANGER_LEVEL = 25

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

    // Учебная карточка долетела — без штрафа, просто запускаем её ещё раз
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

    // Проверяем выгорание сразу при попадании. Если ждать updateGame, стресс успевает
    // чуть-чуть спасть (100 → 99.97), и проверка «>= 100» никогда не срабатывает
    if (game.stress >= 100) startEnding('burnout')
}

const setMeter = (meter, value, isDanger) => {
    meter.querySelector('[data-meter-fill]').style.width = `${value}%`
    meter.classList.toggle('is-danger', isDanger)
}

const updateGame = (elapsedTime, deltaTime) => {
    game.hitFlash = Math.max(0, game.hitFlash - deltaTime * 3)

    if (experience.phase !== 'running') {
        ui.vignette.style.opacity = 0
        return
    }

    // После 06:00 шкалы замирают: смена закончилась, осталось только уйти домой
    if (shift.over) {
        ui.vignette.style.opacity = Math.max(0, Number(ui.vignette.style.opacity) - deltaTime)
        return
    }

    // Пока идёт обучение, часы стоят, а Performance сама не падает — меняется только от действий игрока
    if (!isTutorial()) {
        const shiftFraction = getShiftFraction(elapsedTime)
        ui.clock.textContent = formatShiftTime(shiftFraction)
        if (shiftFraction >= 1) {
            endShift()
            return
        }
    }

    const decay = isTutorial() ? 0 : THREE.MathUtils.lerp(game.performanceDecayStart, game.performanceDecayEnd, getStoryProgress())
    const work = game.working ? game.workRate : 0
    if (game.working) {
        game.hasWorked = true
        game.lastActionAt = elapsedTime
        game.score += game.workPointsPerSecond * deltaTime
    }
    game.performance = THREE.MathUtils.clamp(game.performance + (work - decay) * deltaTime, 0, 100)
    game.stress = THREE.MathUtils.clamp(game.stress - game.stressDecay * deltaTime, 0, 100)

    // Пока работает: экран светлеет, герой чуть подрагивает над клавиатурой, слышно стук клавиш
    const { screen, person } = heroDesk.userData
    if (game.working) {
        screen.material.color.lerp(colors.screenWork, 0.6)
        person.position.y = Math.abs(Math.sin(elapsedTime * 25)) * 0.015
        sound.type()
    } else {
        person.position.y = 0
    }

    ui.score.textContent = Math.floor(game.score)
    const multiplier = getMultiplier()
    ui.combo.textContent = multiplier > 1 ? `×${multiplier} combo` : ''

    setMeter(ui.performance, game.performance, game.performance < DANGER_LEVEL)
    setMeter(ui.stress, game.stress, game.stress > 100 - DANGER_LEVEL)
    ui.vignette.style.opacity = Math.min(1, (game.stress / 100) * params.vignetteStrength + game.hitFlash * 0.3)

    if (game.performance <= 0) startEnding(isFrozen(elapsedTime) ? 'frozen' : 'fired')
}

/**
 * Tutorial
 * При первом запуске учим двум действиям прямо в игре: зажать монитор, потом закрыть одно медленное уведомление.
 * Пока идёт обучение, часы стоят, никого не увольняют и стресс не растёт.
 * Пройти обучение заново: открыть страницу с #tutorial в адресе
 */
const TUTORIAL_STORAGE_KEY = 'nightmare-office:tutorial-done'
const TUTORIAL_START_PERFORMANCE = 55 // неполная шкала — чтобы было видно, как работа её наполняет
const TUTORIAL_CARD_DURATION = 10 // учебная карточка летит медленно, обычные в начале — около 9 с
const TUTORIAL_DONE_DURATION = 2.5 // сколько висит «Nice!» после обучения

const tutorial = {
    step: null, // null — обучения нет | 'work' | 'dismiss' | 'done' (смена уже идёт, висит «Nice!»)
    card: null,
    doneAt: 0,
}

const tutorialAnchor = new THREE.Vector3()

const isTutorial = () => tutorial.step === 'work' || tutorial.step === 'dismiss'

const shouldShowTutorial = () => {
    if (window.location.hash === '#tutorial') return true
    try {
        return localStorage.getItem(TUTORIAL_STORAGE_KEY) !== '1'
    } catch {
        return true
    }
}

const setCoach = (html, hasRing = true) => {
    ui.coachText.innerHTML = html
    ui.coach.classList.toggle('has-ring', hasRing)
    // Перезапускаем появление пузыря, чтобы смену шага было заметно
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

// Карточка вылетает на полпути между героем и камерой, чуть сбоку — так она точно в кадре, даже на узком экране
const tutorialSpawnPoint = () => {
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    return heroHead.clone().lerp(camera.position, 0.5)
        .addScaledVector(cameraRight, 1.8)
        .add(new THREE.Vector3(0, 0.8, 0))
}

const spawnTutorialCard = (elapsedTime) => {
    spawnCard(newsFeed[1], elapsedTime, tutorialSpawnPoint())
    tutorial.card = flyingCards[flyingCards.length - 1]
    tutorial.card.duration = TUTORIAL_CARD_DURATION
}

const finishTutorial = () => {
    try {
        localStorage.setItem(TUTORIAL_STORAGE_KEY, '1')
    } catch {
        // без localStorage обучение просто покажется ещё раз
    }
    ui.performance.classList.remove('is-coached')
    ui.coachSkip.hidden = true
    beginShift()
}

ui.coachSkip.addEventListener('click', () => {
    if (!isTutorial()) return
    // Учебную карточку тихо убираем, без очков
    if (tutorial.card && tutorial.card.dismissedAt === null) tutorial.card.dismissedAt = clock.getElapsedTime()
    tutorial.step = null
    ui.coach.hidden = true
    game.performance = 100
    finishTutorial()
})

const updateTutorial = (elapsedTime) => {
    if (tutorial.step === null) return

    // Смена кончилась раньше, чем погасла подсказка, — просто прячем её
    if (experience.phase !== 'running') {
        tutorial.step = null
        ui.coach.hidden = true
        return
    }

    // Шаг 1 пройден, когда работа заполнила Performance до конца
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

    // Подсказка висит над тем, с чем сейчас нужно что-то сделать: монитором, карточкой, а в конце — героем
    const anchor = tutorial.step === 'work'
        ? workHitbox.getWorldPosition(tutorialAnchor)
        : tutorial.step === 'dismiss' ? tutorial.card.sprite.position : heroHead
    const { x, y } = projectToScreen(anchor)
    ui.coach.style.transform = `translate(${x}px, ${y}px)`

    // Пузырь не даём увезти за край экрана, а хвостик всё равно смотрит на цель
    const halfWidth = ui.coachText.offsetWidth / 2
    const margin = 16
    const shift = THREE.MathUtils.clamp(x, margin + halfWidth, sizes.width - margin - halfWidth) - x
    ui.coach.style.setProperty('--shift', `${shift}px`)
}

/**
 * Frozen или Very responsive
 * Обе концовки — Performance упала до нуля. Но если игрок всё это время закрывал уведомления,
 * его уволили за «отзывчивость». А если просто сидел и смотрел — он замер
 */
const FROZEN_AFTER = 8 // столько секунд без единого действия — и герой «замер»
const RESPONSIVE_MIN_DISMISSED = 5

const isFrozen = (elapsedTime) =>
    game.lastActionAt === null
    || elapsedTime - game.lastActionAt > FROZEN_AFTER
    || game.dismissed < RESPONSIVE_MIN_DISMISSED

// Выключить свою лампу можно только во второй половине ночи — когда она сама начинает коротить
const LOG_OFF_FROM = 0.5
const canLogOff = () => experience.phase === 'running' && !shift.over && getStoryProgress() >= LOG_OFF_FROM

/**
 * Lamp hint
 * Тусклая надпись у лампы героя — тихий намёк, что можно просто уйти
 */
const lampHintTexture = createGlowLabelTexture('switch it off?', '#ffd9a0')
const lampHint = new THREE.Sprite(
    // fog: false — иначе туман съедает надпись почти целиком
    new THREE.SpriteMaterial({ map: lampHintTexture.texture, transparent: true, depthWrite: false, fog: false, opacity: 0 })
)
lampHint.scale.set(0.22 * lampHintTexture.aspect, 0.22, 1)
const lampHintBase = heroDesk.position.clone().add(new THREE.Vector3(0, 3.05, 0))
lampHint.position.copy(lampHintBase)
scene.add(lampHint)

const updateLampHint = (elapsedTime) => {
    // Дышит медленно и еле заметно — в отличие от яркой HOLD TO WORK
    const target = canLogOff() ? 0.45 + 0.2 * Math.sin(elapsedTime * 1.2) : 0
    lampHint.material.opacity += (target - lampHint.material.opacity) * 0.05
    lampHint.position.y = lampHintBase.y + Math.sin(elapsedTime * 0.8) * 0.04
}

/**
 * Endings
 * Каждая концовка — последнее уведомление героя: отправитель, заголовок, текст.
 * В текст подставляются цифры именно этой ночи (stats), поэтому lead — функция
 *
 * calm      — дожил до 06:00 и ушёл домой: призраки уходят с рассветом, на втором мониторе — первое приглашение
 * fired     — Performance = 0, но он всю ночь закрывал уведомления: увольнение «за отзывчивость»
 * frozen    — Performance = 0, а он просто сидел: время замирает, карточки висят в воздухе
 * burnout   — Stress = 100: вспышка и звон в ушах, потом тёмный пустой офис
 * loggedOff — секретная: сам выключил свою лампу и ушёл, призраки смотрят ему вслед
 */
const endings = {
    calm: {
        icon: '🌅',
        name: 'Made it to morning',
        accent: '#ff8a3d',
        duration: 8,
        sender: 'Sunrise',
        time: () => '06:00',
        title: 'The ghosts left at dawn.',
        lead: (stats) => [
            'That’s the rule: they can’t stay in daylight. He can. Barely.',
            `On the second screen, after ${stats.applications} applications: “Are you free Tuesday?”`,
        ],
        // Через пару секунд после финала — ещё одно уведомление. Ночь пережита, но ничего не закончилось
        sting: { sender: 'Slack · Manager', time: '06:01', text: 'Morning! Quick sync? 🙂' },
    },
    fired: {
        icon: '👻',
        name: 'Very responsive',
        accent: '#ff5a5a',
        duration: 7,
        sender: 'Calendar · HR',
        title: 'Quick sync? 🙂',
        meta: '15 min · no agenda · camera on',
        lead: (stats) => [
            `He answered ${stats.dismissed} notifications tonight.${stats.missed === 0 ? ' Every single one.' : ''} Nobody answered his.`,
            'Please bring your badge. You won’t need it after.',
        ],
    },
    frozen: {
        icon: '🧊',
        name: 'Frozen',
        accent: '#7dd3fc',
        duration: 7,
        sender: 'Slack · Manager',
        time: (stats) => `seen ${stats.frozenSince}`,
        title: 'are you still there?',
        lead: (stats) => [
            `He hadn’t moved since ${stats.frozenSince}. The ghosts drifted past his desk and didn’t look twice. They thought he was one of them.`,
            'His status still says 🟢 Active.',
        ],
    },
    burnout: {
        icon: '🔥',
        name: 'Out of office',
        accent: '#9fb4d9',
        duration: 7,
        sender: 'Automatic reply',
        title: 'I’m out of office.',
        lead: () => [
            'I don’t know when I’ll be back.',
            'For anything urgent, please contact my replacement. It has already read your message.',
        ],
    },
    loggedOff: {
        icon: '🚪',
        name: 'Logged off',
        accent: '#ffd9a0',
        duration: 9,
        sender: 'Status · Offline',
        title: 'He switched off his own lamp.',
        lead: (stats) => [
            'Every other light in this office was switched off by someone else.',
            `${stats.unread} unread. They’ll keep.`,
        ],
        scoreCounts: false, // счёт этой ночи не считается — и это нормально
    },
}

const ENDINGS_STORAGE_KEY = 'nightmare-office:endings'
const BEST_SCORE_STORAGE_KEY = 'nightmare-office:best'

const getBestScore = () => {
    try {
        return Number(localStorage.getItem(BEST_SCORE_STORAGE_KEY)) || 0
    } catch {
        return 0
    }
}

// Сохраняет рекорд и сообщает, побит ли он
const saveBestScore = (score) => {
    const previousBest = getBestScore()
    try {
        if (score > previousBest) localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(score))
    } catch {}
    return { best: Math.max(score, previousBest), isNewBest: score > previousBest }
}

// Какие концовки зритель уже видел — храним в localStorage, чтобы показывать «2/5»
const saveEnding = (kind) => {
    try {
        const found = new Set(JSON.parse(localStorage.getItem(ENDINGS_STORAGE_KEY) || '[]'))
        found.add(kind)
        localStorage.setItem(ENDINGS_STORAGE_KEY, JSON.stringify([...found]))
        return found
    } catch {
        return new Set([kind])
    }
}

const dawn = {
    background: new THREE.Color('#4a3640'),
    moonColor: new THREE.Color('#ffb27a'),
    moonIntensity: 1.4,
    ambientIntensity: 0.35,
    fogDensity: 0.035,
}

// Камера в финале подлетает к герою
const endingCamera = {
    position: heroDesk.position.clone().add(new THREE.Vector3(2.6, 2, 3.4)),
    target: heroDesk.position.clone().add(new THREE.Vector3(0, 1, 0)),
}

// Сюда в момент концовки запоминаем, откуда начинаем переход
const endingFrom = {}

const startEnding = (kind) => {
    if (experience.phase !== 'running') return
    const elapsedTime = clock.getElapsedTime()
    const shiftTime = (time) => formatShiftTime(getShiftFraction(time))
    const stillFlying = flyingCards.filter((card) => card.dismissedAt === null).length

    experience.phase = 'ending'
    experience.ending = kind
    experience.endingStart = elapsedTime
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

    // Frozen: карточки остаются висеть там, где их застала остановка времени. В остальных — тают
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
        // Первое приглашение за всю историю откликов
        applications.interviews = 1
        applications.lastReply = 'Are you free Tuesday?'
        drawJobScreen()
        sound.calm()
    } else if (kind === 'fired') {
        showFiringLabel(heroDesk, 'LOW PERFORMANCE')
        sound.buzz()
        sound.calm({ chord: false })
    } else if (kind === 'frozen') {
        // Звук обрывается почти сразу — как будто время остановилось
        sound.calm({ chord: false, fade: 0.4 })
    } else if (kind === 'burnout') {
        ui.whiteout.classList.add('is-visible')
        sound.tinnitus()
        sound.calm({ chord: false })
    } else if (kind === 'loggedOff') {
        // Свет и экраны гаснут сразу — он сам нажал на выключатель
        sound.click()
        heroLight.intensity = 0
        setDeskPower(heroDesk, 0)
        jobMonitorScreen.material.color.setScalar(0)
        monitorGlow.intensity = 0
        // Призраки останавливаются и смотрят ему вслед
        ghostWatch.pausedAt = elapsedTime
        ghostWatch.target = new THREE.Vector3()
        sound.calm()
    }
}

let stingTimeout = null

const showOutro = (kind) => {
    const ending = endings[kind]
    const stats = experience.endingStats
    ui.outroCard.style.setProperty('--accent', ending.accent)
    ui.outroEnding.textContent = ending.sender
    ui.outroTime.textContent = ending.time ? ending.time(stats) : stats.time
    ui.outroTitle.textContent = ending.title
    ui.outroMeta.textContent = ending.meta ?? ''
    ui.outroMeta.hidden = !ending.meta
    ui.outroLead.replaceChildren(...ending.lead(stats).map((text) => {
        const paragraph = document.createElement('p')
        paragraph.textContent = text
        return paragraph
    }))

    // В концовке Logged off счёт не считается: рекорд не обновляем, а вместо цифры — честная надпись
    const scoreCounts = ending.scoreCounts !== false
    const score = Math.floor(game.score)
    const { best, isNewBest } = scoreCounts ? saveBestScore(score) : { best: getBestScore(), isNewBest: false }
    ui.outroScore.textContent = scoreCounts ? score : 'didn’t count'
    ui.outroBest.innerHTML = isNewBest ? `${best}<span class="new-best">New best!</span>` : String(best)

    // Все концовки: найденные — с иконкой и названием, ненайденные — «???»
    const kinds = Object.keys(endings)
    ui.outroFound.textContent = `${experience.endingsFound.size}/${kinds.length}`
    ui.outroEndings.replaceChildren(...kinds.map((key) => {
        const item = document.createElement('li')
        const isFound = experience.endingsFound.has(key)
        item.className = 'outro-ending'
        item.classList.toggle('is-locked', !isFound)
        item.classList.toggle('is-current', key === kind)
        item.textContent = isFound ? `${endings[key].icon} ${endings[key].name}` : '??? '
        return item
    }))

    ui.outro.hidden = false

    // Последнее уведомление приходит, когда кажется, что всё уже закончилось
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

const updateCalmEnding = (t, eased) => {
    const screensOff = Math.min(t * 4, 1) // экраны гаснут в первые 2 секунды
    const lerp = THREE.MathUtils.lerp

    scene.background.lerpColors(endingFrom.background, dawn.background, eased)
    scene.fog.color.copy(scene.background)
    scene.fog.density = lerp(endingFrom.fogDensity, dawn.fogDensity, eased)

    moonLight.color.lerpColors(endingFrom.moonColor, dawn.moonColor, eased)
    moonLight.intensity = lerp(endingFrom.moonIntensity, dawn.moonIntensity, eased)
    ambientLight.intensity = lerp(endingFrom.ambientIntensity, dawn.ambientIntensity, eased)

    // Рабочий экран гаснет, а второй монитор с приглашением остаётся гореть
    heroDesk.userData.screen.material.color.lerpColors(colors.screenOn, colors.screenOff, screensOff)
    monitorGlow.intensity = endingFrom.monitorGlow * (1 - screensOff)

    // Призраки не выносят дневного света
    ghostVisibility = 1 - eased
}

const updateFiredEnding = (elapsedTime) => {
    // Лампа героя мигает и гаснет так же, как у коллег, а потом он встаёт призраком
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

// Выгорание: вспышка, а когда она спадает — тёмный пустой офис, все лампы погасли.
// Горит только монитор, и герой, ссутулившись, сидит перед ним
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

    ui.whiteout.classList.remove('is-visible') // CSS плавно уберёт вспышку
}

// Logged off: секунду сидит в темноте, потом встаёт, отходит от стола и уходит по проходу во тьму
const LOG_OFF_STAND_AT = 1.2
const LOG_OFF_WALK_AT = 2.4
const LOG_OFF_AISLE_Z = 1.5 // проход между рядами столов, в координатах стола
const LOG_OFF_SPEED = 1.1

const updateLoggedOffEnding = (elapsedTime) => {
    const t = elapsedTime - experience.endingStart
    const { person } = heroDesk.userData
    const { torso, thighs } = person.userData

    // Призраки смотрят туда, где сейчас герой
    heroDesk.localToWorld(ghostWatch.target.copy(person.position).setY(1))

    if (t < LOG_OFF_STAND_AT) return

    // Встаёт: ноги вертикально, спина прямо
    torso.rotation.x = 0
    thighs.rotation.x = Math.PI / 2
    thighs.scale.z = 1.9
    thighs.position.set(0, 0.4, 0)
    const step = Math.abs(Math.sin(t * 8)) * 0.03

    if (t < LOG_OFF_WALK_AT) {
        // Отходит от стола в проход, повернувшись спиной к монитору
        const back = (t - LOG_OFF_STAND_AT) / (LOG_OFF_WALK_AT - LOG_OFF_STAND_AT)
        person.rotation.y = Math.PI
        person.position.set(0, 0.1 + step, THREE.MathUtils.lerp(0.65, LOG_OFF_AISLE_Z, back))
        return
    }

    // Поворачивается и уходит по проходу в темноту, прочь от камеры
    const walked = (t - LOG_OFF_WALK_AT) * LOG_OFF_SPEED
    person.rotation.y = THREE.MathUtils.lerp(Math.PI, Math.PI / 2, Math.min(walked * 2, 1))
    person.position.set(-walked, 0.1 + step, LOG_OFF_AISLE_Z)
}

const updateEnding = (elapsedTime) => {
    if (experience.phase !== 'ending') return

    const kind = experience.ending
    const t = Math.min((elapsedTime - experience.endingStart) / endings[kind].duration, 1)
    const eased = t * t * (3 - 2 * t) // smoothstep: плавно в начале и в конце

    if (kind === 'calm') updateCalmEnding(t, eased)
    if (kind === 'fired') updateFiredEnding(elapsedTime)
    if (kind === 'burnout') updateBurnoutEnding(elapsedTime)
    if (kind === 'loggedOff') updateLoggedOffEnding(elapsedTime)

    camera.position.lerpVectors(endingFrom.cameraPosition, endingCamera.position, eased)
    controls.target.lerpVectors(endingFrom.controlsTarget, endingCamera.target, eased)

    if (t >= 1) {
        experience.phase = 'done'
        controls.enabled = true
        // Ушёл — его больше нет в офисе
        if (kind === 'loggedOff') heroDesk.userData.person.visible = false
        showOutro(kind)
    }
}

/**
 * Animate
 */
const clock = new THREE.Clock()

let previousTime = 0

const tick = () => {
    const elapsedTime = clock.getElapsedTime()
    const deltaTime = Math.min(elapsedTime - previousTime, 0.1) // если вкладка была скрыта, не делаем огромный скачок
    previousTime = elapsedTime

    updateStory(elapsedTime)
    updateColleagues(elapsedTime)
    updateFiringLabels(elapsedTime)
    updateGhosts(elapsedTime)
    updateNews(elapsedTime)
    updateApplications(elapsedTime)
    updateTension(elapsedTime)
    updateGame(elapsedTime, deltaTime) // после updateTension: поверх его цвета экрана рисуем «работу»
    updateTutorial(elapsedTime)
    updateHoldHint(elapsedTime)
    updateLampHint(elapsedTime)
    updateEnding(elapsedTime)

    controls.update()

    // Дрожание добавляем только на время рендера, чтобы оно не копилось в позиции камеры
    camera.position.add(cameraShake)
    renderer.render(scene, camera)
    camera.position.sub(cameraShake)

    window.requestAnimationFrame(tick)
}

tick()
