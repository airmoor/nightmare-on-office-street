/**
 * Small wrappers around localStorage.
 * It can be unavailable or throw (private mode, blocked site data), so every access is guarded:
 * reads fall back to a default and writes are simply skipped. The game works without it, it just forgets
 */
export const STORAGE_KEYS = {
    muted: 'nightmare-office:muted',
    tutorialDone: 'nightmare-office:tutorial-done',
    endings: 'nightmare-office:endings',
    bestScore: 'nightmare-office:best',
    level: 'nightmare-office:level',
    passedLevels: 'nightmare-office:passed',
}

export const readItem = (key) => {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

export const writeItem = (key, value) => {
    try {
        localStorage.setItem(key, value)
    } catch {
        // storage unavailable: nothing to persist
    }
}

// A set of strings stored as a JSON array
export const readSet = (key) => {
    try {
        return new Set(JSON.parse(readItem(key) || '[]'))
    } catch {
        return new Set()
    }
}

// Adds a value to a stored set and returns the updated set
export const addToSet = (key, value) => {
    const set = readSet(key)
    set.add(value)
    writeItem(key, JSON.stringify([...set]))
    return set
}
