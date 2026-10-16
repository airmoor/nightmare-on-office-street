export const pickRandom = (array) => array[Math.floor(Math.random() * array.length)]
export const randomBetween = ([min, max]) => min + Math.random() * (max - min)

// Deterministic pseudo-noise in 0..1: the same n always gives the same value (lamp flicker)
export const hashNoise = (n) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1

// smoothstep: smooth at the start and at the end
export const smoothstep = (t) => t * t * (3 - 2 * t)

export const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const isCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches

/**
 * Our own clock instead of THREE.Clock: it only accumulates a clamped frame step.
 * While the tab is hidden there are no frames, so game time stands still instead of racing ahead
 */
const MAX_FRAME_STEP = 0.1

export const createClock = () => {
    let elapsed = 0
    let last = performance.now()
    return {
        update() {
            const now = performance.now()
            elapsed += Math.min((now - last) / 1000, MAX_FRAME_STEP)
            last = now
        },
        getElapsedTime: () => elapsed,
    }
}
