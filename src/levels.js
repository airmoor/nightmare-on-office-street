import { MathUtils } from 'three'

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
export const LEVEL_EASIEST = {
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

export const LEVEL_HARDEST = {
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

export const levels = {
    junior: { tier: 0, name: 'Junior', description: 'The night shift as it is. Hold the monitor, clear notifications.' },
    middle: { tier: 1 / 3, name: 'Middle', description: 'More notifications, and faster. Some are just noise.' },
    senior: { tier: 2 / 3, name: 'Senior', description: 'Everything at once. Your work slips away faster.' },
    lead: { tier: 1, name: 'Lead', description: 'No one is coming to help. Good luck.' },
}

// Level parameters: each number lies between Junior and Lead, by the level's tier
export const getLevelParams = (group, tier) => Object.fromEntries(
    Object.keys(LEVEL_EASIEST[group]).map((key) => [
        key,
        MathUtils.lerp(LEVEL_EASIEST[group][key], LEVEL_HARDEST[group][key], tier),
    ])
)

export const LEVEL_ORDER = Object.keys(levels)
// Grades from which a step down is offered after a loss, and which endings count as a loss
// (loggedOff isn't a loss: the hero left on his own)
export const DEMOTE_FROM = ['senior', 'lead']
export const FAIL_ENDINGS = ['fired', 'burnout', 'frozen']
