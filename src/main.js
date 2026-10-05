import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import GUI from 'lil-gui'

/**
 * Base
 */
const gui = new GUI({ title: 'Debug' })
const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()

const params = {
    background: '#05060a',
    fogDensity: 0.06,
}

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
pumpkin.position.set(0.55, 0.86, -0.1)
pumpkin.traverse((child) => { if (child.isMesh) child.castShadow = true })
heroDesk.add(pumpkin)

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
const heroLight = new THREE.SpotLight('#ffd9a0', 25, 8, Math.PI * 0.28, 0.6, 2)
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

const fireColleague = (desk) => {
    if (desk.userData.state !== 'on') return
    desk.userData.state = 'flickering'
    desk.userData.flickerStart = clock.getElapsedTime()
}

const fireRandomColleague = () => {
    const working = colleagues.filter((desk) => desk.userData.state === 'on')
    if (working.length === 0) return
    fireColleague(working[Math.floor(Math.random() * working.length)])
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
        }
    }
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
    camera.updateProjectionMatrix()

    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(sizes.pixelRatio)
})

/**
 * Camera
 */
const camera = new THREE.PerspectiveCamera(45, sizes.width / sizes.height, 0.1, 100)
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
 * Debug
 */
const sceneFolder = gui.addFolder('Scene')
sceneFolder.add(scene.fog, 'density').min(0).max(0.2).step(0.001).name('fog density')
sceneFolder.addColor(params, 'background').onChange((value) => {
    scene.background.set(value)
    scene.fog.color.set(value)
})

const lightsFolder = gui.addFolder('Lights')
lightsFolder.add(ambientLight, 'intensity').min(0).max(1).step(0.01).name('ambient')
lightsFolder.add(moonLight, 'intensity').min(0).max(2).step(0.01).name('moon')
lightsFolder.add(heroLight, 'intensity').min(0).max(80).step(0.5).name('hero lamp')
lightsFolder.add(monitorGlow, 'intensity').min(0).max(10).step(0.1).name('monitor glow')

const storyFolder = gui.addFolder('Story')
storyFolder.add({ fireRandomColleague }, 'fireRandomColleague').name('🔥 fire random colleague')
storyFolder.add({ resetOffice }, 'resetOffice').name('↺ reset office')

/**
 * Animate
 */
const clock = new THREE.Clock()

const tick = () => {
    const elapsedTime = clock.getElapsedTime()

    updateColleagues(elapsedTime)

    controls.update()
    renderer.render(scene, camera)
    window.requestAnimationFrame(tick)
}

tick()
