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
    fogDensityGrowth: 0.04, // насколько сгущается туман к концу истории
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

const showFiringLabel = (desk) => {
    const { texture, aspect } = createGlowLabelTexture(pickRandom(firingReasons))
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

const updateGhosts = (elapsedTime) => {
    for (const ghost of ghosts) {
        const { start, origin, radius, speed, phase } = ghost.userData
        const t = elapsedTime - start

        // Появление: растёт и поднимается со стула (easeOut — быстро в начале, плавно в конце)
        const appear = Math.min(t / GHOST_APPEAR_DURATION, 1)
        const eased = appear * (2 - appear)
        ghost.scale.setScalar(eased * ghostVisibility)

        // Потом бродит по кругу. Вычитаем cos/sin(phase), чтобы круг начинался ровно от стула
        const wanderTime = Math.max(0, t - GHOST_APPEAR_DURATION)
        const angle = phase + wanderTime * speed
        ghost.position.x = origin.x + (Math.cos(angle) - Math.cos(phase)) * radius
        ghost.position.z = origin.z + (Math.sin(angle) - Math.sin(phase)) * radius
        ghost.position.y = THREE.MathUtils.lerp(0.3, 0.9, eased) + Math.sin(elapsedTime * 2 + phase) * 0.08

        // Поворачиваем лицом по направлению движения (касательная к кругу)
        if (wanderTime > 0) {
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
    if (experience.phase !== 'running' || !story.autoplay || elapsedTime < story.nextFireAt) return

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
    spawnIntervalEnd: 0.5,
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

// Закрыл одно уведомление — рядом появились два новых, как головы у гидры
const dismissCard = (card) => {
    const elapsedTime = clock.getElapsedTime()
    card.dismissedAt = elapsedTime
    sound.pop()

    for (let i = 0; i < 2; i++) {
        const offset = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            .normalize()
            .multiplyScalar(0.8)
        spawnCard(nextFeedItem(), elapsedTime, card.sprite.position.clone().add(offset))
    }
}

const updateNews = (elapsedTime) => {
    const progress = getStoryProgress()

    if (experience.phase === 'running' && elapsedTime >= news.nextSpawnAt) {
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

        const t = (elapsedTime - card.start) / card.duration // 0 → 1

        if (t >= 1) {
            removeCard(i)
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

        context.fillStyle = '#ff6b6b'
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
    if (experience.phase !== 'running' || elapsedTime < applications.nextAt) return
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
const pointerDownPosition = { x: 0, y: 0 }

const getCardUnderPointer = (event) => {
    // Переводим пиксели в координаты от -1 до 1, которые ждёт Raycaster
    pointer.x = (event.clientX / sizes.width) * 2 - 1
    pointer.y = -(event.clientY / sizes.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)

    const activeCards = flyingCards.filter((card) => card.dismissedAt === null)
    const [hit] = raycaster.intersectObjects(activeCards.map((card) => card.sprite))
    return hit ? activeCards.find((card) => card.sprite === hit.object) : null
}

canvas.addEventListener('pointerdown', (event) => {
    pointerDownPosition.x = event.clientX
    pointerDownPosition.y = event.clientY
})

canvas.addEventListener('pointerup', (event) => {
    // Если мышь заметно сдвинулась, это был поворот камеры, а не клик
    const moved = Math.hypot(event.clientX - pointerDownPosition.x, event.clientY - pointerDownPosition.y)
    if (moved > 5) return

    const card = getCardUnderPointer(event)
    if (card) dismissCard(card)
})

canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return
    canvas.style.cursor = getCardUnderPointer(event) ? 'pointer' : ''
})

/**
 * Debug
 */
const sceneFolder = gui.addFolder('Scene')
sceneFolder.add(params, 'fogDensity').min(0).max(0.2).step(0.001).name('fog density')
sceneFolder.add(params, 'fogDensityGrowth').min(0).max(0.1).step(0.001).name('fog growth')
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
    allGoneAt: null, // когда уволили последнего коллегу
    endingStart: 0,
    lastIntensity: -1,
}

const ui = {
    intro: document.querySelector('[data-intro]'),
    start: document.querySelector('[data-start]'),
    hint: document.querySelector('[data-hint]'),
    close: document.querySelector('[data-close]'),
    outro: document.querySelector('[data-outro]'),
    restart: document.querySelector('[data-restart]'),
    mute: document.querySelector('[data-mute]'),
}

// Пока висит стартовый экран, камера медленно облетает офис
controls.autoRotate = true
controls.autoRotateSpeed = 0.3

const startShift = () => {
    experience.phase = 'running'
    sound.start()
    controls.autoRotate = false

    ui.intro.classList.add('is-hidden')
    setTimeout(() => (ui.intro.hidden = true), 1200)

    // Таймеры истории отсчитываем от момента старта, а не от загрузки страницы
    const elapsedTime = clock.getElapsedTime()
    story.nextFireAt = elapsedTime + story.startDelay
    news.nextSpawnAt = elapsedTime + 1.5
    applications.nextAt = elapsedTime + 1

    setTimeout(() => ui.hint.classList.add('is-visible'), 2500)
    setTimeout(() => ui.hint.classList.remove('is-visible'), 9000)
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

    // Всех уволили — даём герою выход
    if (experience.phase === 'running' && experience.allGoneAt === null
        && colleagues.every((desk) => desk.userData.state === 'off')) {
        experience.allGoneAt = elapsedTime
        setTimeout(() => (ui.close.hidden = false), 2500)
    }
}

/**
 * Ending
 * Герой закрывает ноутбук: экраны гаснут, призраки растворяются, тревога стихает, наступает рассвет
 */
const ENDING_DURATION = 8

const dawn = {
    background: new THREE.Color('#4a3640'),
    moonColor: new THREE.Color('#ffb27a'),
    moonIntensity: 1.4,
    ambientIntensity: 0.35,
    fogDensity: 0.035,
    cameraPosition: heroDesk.position.clone().add(new THREE.Vector3(2.6, 2, 3.4)),
    controlsTarget: heroDesk.position.clone().add(new THREE.Vector3(0, 1, 0)),
}

// Сюда в момент закрытия ноутбука запоминаем, откуда начинаем переход
const endingFrom = {}

const closeLaptop = () => {
    const elapsedTime = clock.getElapsedTime()
    experience.phase = 'ending'
    experience.endingStart = elapsedTime
    ui.close.hidden = true

    for (const card of flyingCards) {
        if (card.dismissedAt === null) card.dismissedAt = elapsedTime
    }

    heroLight.intensity = params.heroLightIntensity
    setDeskPower(heroDesk, 1)
    cameraShake.set(0, 0, 0)
    sound.calm()
    controls.enabled = false

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
}

ui.close.addEventListener('click', closeLaptop)

const updateEnding = (elapsedTime) => {
    if (experience.phase !== 'ending') return

    const t = Math.min((elapsedTime - experience.endingStart) / ENDING_DURATION, 1)
    const eased = t * t * (3 - 2 * t) // smoothstep: плавно в начале и в конце
    const screensOff = Math.min(t * 4, 1) // экраны гаснут в первые 2 секунды
    const lerp = THREE.MathUtils.lerp

    scene.background.lerpColors(endingFrom.background, dawn.background, eased)
    scene.fog.color.copy(scene.background)
    scene.fog.density = lerp(endingFrom.fogDensity, dawn.fogDensity, eased)

    moonLight.color.lerpColors(endingFrom.moonColor, dawn.moonColor, eased)
    moonLight.intensity = lerp(endingFrom.moonIntensity, dawn.moonIntensity, eased)
    ambientLight.intensity = lerp(endingFrom.ambientIntensity, dawn.ambientIntensity, eased)

    heroDesk.userData.screen.material.color.lerpColors(colors.screenOn, colors.screenOff, screensOff)
    jobMonitorScreen.material.color.setScalar(1 - screensOff)
    monitorGlow.intensity = endingFrom.monitorGlow * (1 - screensOff)

    ghostVisibility = 1 - eased

    camera.position.lerpVectors(endingFrom.cameraPosition, dawn.cameraPosition, eased)
    controls.target.lerpVectors(endingFrom.controlsTarget, dawn.controlsTarget, eased)

    if (t >= 1) {
        experience.phase = 'done'
        controls.enabled = true
        ui.outro.hidden = false
    }
}

/**
 * Animate
 */
const clock = new THREE.Clock()

const tick = () => {
    const elapsedTime = clock.getElapsedTime()

    updateStory(elapsedTime)
    updateColleagues(elapsedTime)
    updateFiringLabels(elapsedTime)
    updateGhosts(elapsedTime)
    updateNews(elapsedTime)
    updateApplications(elapsedTime)
    updateTension(elapsedTime)
    updateEnding(elapsedTime)

    controls.update()

    // Дрожание добавляем только на время рендера, чтобы оно не копилось в позиции камеры
    camera.position.add(cameraShake)
    renderer.render(scene, camera)
    camera.position.sub(cameraShake)

    window.requestAnimationFrame(tick)
}

tick()
