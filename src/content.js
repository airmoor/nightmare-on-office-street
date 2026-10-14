// All of the game's text in one place: what's on the hero's screens, the notifications and the endings

/**
 * The hero's main monitor: three files on a loop tell the story of the night
 */
export const CODE_FILES = [
    {
        name: 'payments/retry.ts',
        ticket: 'JIRA-4821 · due yesterday',
        status: 'main · 3 failing checks',
        lines: [
            '// TODO: make this AI-native (per CEO)',
            'export async function retryPayment(id) {',
            '  const tx = await db.tx.find(id)',
            "  if (!tx) throw new Error('not found')",
            '  for (let i = 0; i < 3; i++) {',
            '    if (await gateway.charge(tx)) return',
            '    await sleep(2 ** i * 1000)',
            '  }',
            '  // works on my machine. ship it',
            "  return escalate(tx, 'on-call: me')",
            '}',
        ],
    },
    {
        name: 'self-assessment.md',
        ticket: 'HR · due 09:00',
        status: 'draft · autosaved',
        lines: [
            '# Self-assessment, Q3',
            '## Impact',
            '- Kept payments up through 3 reorgs',
            '- Mentored 2 juniors (both laid off)',
            '- Adopted 4 AI tools, as requested',
            '## Areas to improve',
            '- Be more AI-native',
            '- Be more visible',
            '- Sleep is not a deliverable',
        ],
    },
    {
        name: 'resume_final_v7.md',
        ticket: 'personal · close fast',
        status: 'private · not synced',
        lines: [
            '# Senior Engineer, open to work',
            '- 7 years shipping things nobody saw',
            '- Survived 4 restructurings',
            '- Fluent in TypeScript, Jira, fear',
            '## Looking for',
            '- A team that exists next month',
            '- A manager who never says',
            '  "quick sync?"',
        ],
    },
]

// Reasons that pop up above a desk when someone is fired
export const firingReasons = [
    'LOW PERFORMANCE',
    'INSUFFICIENT AI ADOPTION',
    'ROLE NO LONGER REQUIRED',
    'RESTRUCTURING',
    'NOT AI-NATIVE ENOUGH',
    'REPLACED BY AGENT',
]

/**
 * Notifications that fly at the hero
 */
export const accents = {
    news: '#ff5a5a',
    slack: '#a78bfa',
    email: '#f5a524',
    calendar: '#38bdf8',
    linkedin: '#60a5fa',
    ai: '#34d399',
}

export const newsFeed = [
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

// Two volleys per night (see Bursts in main.js): at = fraction of the shift, fire = who loses their lamp
export const BURSTS = [
    {
        at: 0, // fraction of the shift
        fire: 'neighbour',
        cards: [
            { label: 'Slack · #general', text: 'Your access to #team-platform has been removed', accent: accents.slack },
            { label: 'Calendar', text: '15-min "catch-up" with HR — tomorrow, 9:00', accent: accents.calendar },
            { label: 'Breaking', text: 'Big Tech cuts 12,000 jobs, cites AI efficiency', accent: accents.news },
        ],
    },
    {
        at: 0.5, // 02:00
        fire: 2,
        cards: [
            { label: 'Email · CEO', text: 'A message from leadership: "Tough decisions"', accent: accents.email },
            { label: 'Slack · Manager', text: 'You online? Need you on a call at 7', accent: accents.slack },
            { label: 'Breaking', text: 'AI agents now close 60% of tickets', accent: accents.news },
        ],
    },
]

// Noise (from Middle on): grey, semi-transparent, harmless
const NOISE_ACCENT = '#6b7280'
export const noiseFeed = [
    { label: 'Email · All staff', text: 'RE: RE: RE: please remove me from this list' },
    { label: 'LinkedIn', text: 'Hot take: sleep is a skill issue 🧵 1/47' },
    { label: 'Slack · #random', text: 'Tabs or spaces? Wrong answers only 👇' },
    { label: 'Newsletter', text: '10 AI tools you must try this week' },
    { label: 'Slack · #social', text: 'Who took my oat milk from the fridge?' },
    { label: 'Email · Facilities', text: 'Reminder: the 3rd floor printer is still broken' },
].map((item) => ({ ...item, accent: NOISE_ACCENT, noise: true }))

// Replies on the second monitor
export const rejections = [
    "We'll get back to you",
    'Unfortunately, we decided to move forward with other candidates',
    'The position has been filled',
    "We'll keep your CV on file",
    'You are overqualified for this role',
    'We are looking for someone with more AI experience',
]

/**
 * Endings
 * The finale has two beats:
 *   story   — the hero's last notification, flying into the scene like an in-game card (an in-world joke)
 *   summary — the results in terminal style, like the intro: what happened (title), why (cause), a remark (line),
 *             a tip for the next night (tip) and the shift log
 * The summary speaks to the player as "you", like the intro and the handbook. This night's numbers come from stats
 *
 * calm      — made it to 06:00 and went home: the ghosts leave at dawn, the first interview invite shows on the second monitor
 * fired     — Performance = 0, but he dismissed notifications all night: fired for being "responsive"
 * frozen    — Performance = 0 and he just sat there: time stops, cards hang in the air
 * burnout   — Stress = 100: a flash and ringing ears, then a dark, empty office
 * loggedOff — secret: he switched off his own lamp and left while the ghosts watched him go
 */
export const endings = {
    calm: {
        icon: '🌅',
        name: 'Made it to morning',
        accent: '#ff8a3d',
        duration: 8,
        title: () => 'Made it<br />to 06:00',
        cause: () => 'You survived the night shift.',
        line: () => 'The ghosts left at dawn. They can’t stay in daylight. You can. Barely.',
        story: (stats) => ({
            sender: 'Email · Recruiter',
            time: '06:00',
            title: 'Are you free Tuesday?',
            meta: `reply to application #${stats.applications}`,
        }),
        // One more notification after the summary. The night is survived, but nothing is over
        sting: { sender: 'Slack · Manager', time: '06:01', text: 'Morning! Quick sync? 🙂' },
    },
    fired: {
        icon: '👻',
        name: 'Very responsive',
        accent: '#ff5a5a',
        duration: 7,
        title: (stats) => `Fired<br />at ${stats.time}`,
        cause: () => 'Performance hit zero.',
        line: (stats) =>
            stats.dismissed === 0
                ? 'You didn’t answer a single notification. Nobody answered yours either.'
                : `You answered ${stats.dismissed} notifications tonight.${stats.missed === 0 ? ' Every single one.' : ''} Nobody answered yours.`,
        tip: 'Performance only grows while you hold your monitor. Notifications can wait a little.',
        story: () => ({
            sender: 'Calendar · HR',
            title: 'Quick sync? 🙂',
            meta: '15 min · no agenda · camera on',
            text: 'Please bring your badge.',
        }),
    },
    frozen: {
        icon: '🧊',
        name: 'Frozen',
        accent: '#7dd3fc',
        duration: 7,
        title: (stats) => `Frozen<br />at ${stats.frozenSince}`,
        cause: (stats) => `Performance hit zero. You stopped working at ${stats.frozenSince}.`,
        line: () => 'The ghosts drifted past your desk and didn’t look twice. They thought you were one of them.',
        tip: 'Hold your monitor to work. Sitting still drains performance.',
        story: (stats) => ({
            sender: 'Slack · Manager',
            time: `seen ${stats.frozenSince}`,
            title: 'are you still there?',
            text: 'Your status still says 🟢 Active.',
        }),
    },
    burnout: {
        icon: '🔥',
        name: 'Out of office',
        accent: '#9fb4d9',
        duration: 7,
        title: (stats) => `Burnt out<br />at ${stats.time}`,
        cause: () => 'Stress hit 100.',
        line: (stats) =>
            stats.missed > 0
                ? `${stats.missed} notifications got through. Each one landed on you.`
                : 'Nothing got through. It still landed on you.',
        tip: 'Click notifications before they reach your desk. Every one that hits adds stress.',
        story: () => ({
            sender: 'Automatic reply',
            title: 'I’m out of office.',
            text: 'For anything urgent, contact my replacement. It has already read your message.',
        }),
    },
    loggedOff: {
        icon: '🚪',
        name: 'Logged off',
        accent: '#ffd9a0',
        duration: 9,
        title: (stats) => `Logged off<br />at ${stats.time}`,
        cause: () => 'You switched off your own lamp.',
        line: () => 'Every other light in this office was switched off by someone else.',
        story: (stats) => ({
            sender: 'Slack',
            title: '🔴 Offline',
            text: `${stats.unread} unread. They’ll keep.`,
        }),
        scoreCounts: false, // tonight's score doesn't count, and that's fine
    },
}
