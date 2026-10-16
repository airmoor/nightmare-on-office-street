import * as THREE from 'three'

/**
 * Ghosts
 * A fired colleague rises from the chair as a ghost carrying a box of belongings and wanders around the office
 *
 * Ghosts live in `ghostRoot`, which main.js adds to the scene
 */
export const ghostRoot = new THREE.Group()

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

export const spawnGhost = (desk, elapsedTime) => {
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
    ghostRoot.add(ghost)
    ghosts.push(ghost)
}

export const removeGhosts = () => {
    for (const ghost of ghosts) ghostRoot.remove(ghost)
    ghosts.length = 0
}

// In the finale the ghosts dissolve: 1 → 0
let ghostVisibility = 1
export const setGhostVisibility = (value) => {
    ghostVisibility = value
}

// In the Logged off ending the ghosts stop and watch the hero leave
export const ghostWatch = {
    pausedAt: null, // when the ghosts stopped moving
    target: null, // what they're looking at (a point in the scene)
}

const ghostTarget = new THREE.Vector3()

export const updateGhosts = (elapsedTime) => {
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
