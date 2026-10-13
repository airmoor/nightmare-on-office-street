/**
  * All sound is generated in code with the Web Audio API: no audio files, no licenses.
  * Graph: sources (oscillators, noise) → filters → gain → master → speakers
 *
  * Browsers only allow audio after a user gesture,
  * so start() runs on the first press: holding clock in, Look around, or any tap on the screen
 *
  * iOS: Web Audio is silent by default when the ring/silent switch is on.
  * Safari 17+ lets us declare "this is media playback" via navigator.audioSession.
  * On older iOS the trick is to loop a silent <audio> element, which switches the phone into media mode
 */
const createSilentWavUrl = () => {
    const sampleRate = 8000
    const samples = 800 // 0.1 seconds
    const buffer = new ArrayBuffer(44 + samples)
    const view = new DataView(buffer)
    const writeString = (offset, text) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
    }

    // WAV header: 8-bit mono
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + samples, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate, true)
    view.setUint16(32, 1, true)
    view.setUint16(34, 8, true)
    writeString(36, 'data')
    view.setUint32(40, samples, true)
    for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128) // 128 is silence for 8-bit audio

    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

const unlockIOSPlayback = () => {
    if (navigator.audioSession) {
        try {
            navigator.audioSession.type = 'playback'
        } catch {
            // read-only in some Safari versions: playback still works, just not in silent mode
        }
        return
    }

    const audio = document.createElement('audio')
    audio.src = createSilentWavUrl()
    audio.loop = true
    audio.setAttribute('playsinline', '')
    audio.play().catch(() => {})
}

export const createSound = () => {
    let context = null
    let master = null
    let drone = null
    let hiss = null
    let heartbeatTimeout = null
    let intensity = 0
    let muted = false
    let lastPingAt = 0

    // Ramp parameters smoothly to avoid clicks
    const rampTo = (param, value, duration = 0.3) => {
        const now = context.currentTime
        param.cancelScheduledValues(now)
        param.setValueAtTime(param.value, now)
        param.linearRampToValueAtTime(value, now + duration)
    }

    // A short sound: an oscillator with a volume envelope (fast attack, smooth decay)
    const blip = ({ type = 'sine', from, to = from, duration, volume, delay = 0 }) => {
        if (!context) return
        const start = context.currentTime + delay
        const oscillator = context.createOscillator()
        const gain = context.createGain()

        oscillator.type = type
        oscillator.frequency.setValueAtTime(from, start)
        oscillator.frequency.exponentialRampToValueAtTime(to, start + duration)

        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(volume, start + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

        oscillator.connect(gain).connect(master)
        oscillator.start(start)
        oscillator.stop(start + duration + 0.05)
    }

    // Low office hum: two slightly detuned oscillators produce a beating effect
    const createDrone = () => {
        const gain = context.createGain()
        gain.gain.value = 0
        const filter = context.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 320 // phone speakers barely play anything below ~200 Hz

        for (const frequency of [55, 55.7]) {
            const oscillator = context.createOscillator()
            oscillator.type = 'sawtooth'
            oscillator.frequency.value = frequency
            oscillator.connect(filter)
            oscillator.start()
        }
        filter.connect(gain).connect(master)

        return { gain, filter }
    }

    // Ventilation hiss: white noise through a band-pass filter
    const createHiss = () => {
        const length = context.sampleRate * 2
        const buffer = context.createBuffer(1, length, context.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1

        const source = context.createBufferSource()
        source.buffer = buffer
        source.loop = true

        const filter = context.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 900
        filter.Q.value = 0.6

        const gain = context.createGain()
        gain.gain.value = 0

        source.connect(filter).connect(gain).connect(master)
        source.start()

        return { gain }
    }

    // Heartbeat: the higher the tension, the faster it beats
    const scheduleHeartbeat = () => {
        const interval = 1.3 - intensity * 0.85 // from 1.3 s down to 0.45 s
        if (intensity > 0.2) {
            const volume = 0.12 + intensity * 0.16
            // triangle instead of sine: its overtones make the thump audible even on a phone speaker
            blip({ type: 'triangle', from: 90, to: 45, duration: 0.16, volume })
            blip({ type: 'triangle', from: 75, to: 40, duration: 0.14, volume: volume * 0.7, delay: 0.2 })
        }
        heartbeatTimeout = setTimeout(scheduleHeartbeat, interval * 1000)
    }

    const start = () => {
        if (context) return
        unlockIOSPlayback()

        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        context = new AudioContextClass()
        context.resume() // Safari sometimes creates the context already suspended
        master = context.createGain()
        master.gain.value = muted ? 0 : 0.8
        // The compressor tames peaks so overlapping sounds near the end don't blow up the volume
        const compressor = context.createDynamicsCompressor()
        compressor.threshold.value = -24
        compressor.knee.value = 12
        compressor.ratio.value = 6
        compressor.attack.value = 0.005
        compressor.release.value = 0.25
        master.connect(compressor).connect(context.destination)

        drone = createDrone()
        hiss = createHiss()
        rampTo(drone.gain.gain, 0.05, 2)
        rampTo(hiss.gain.gain, 0.012, 2)
        scheduleHeartbeat()
    }

    // 0 is calm, 1 is maximum anxiety
    const setIntensity = (value) => {
        intensity = value
        if (!context) return
        rampTo(drone.gain.gain, 0.05 + value * 0.035)
        rampTo(drone.filter.frequency, 320 + value * 450)
        rampTo(hiss.gain.gain, 0.012 + value * 0.008)
    }

    // Notification: two short rising tones, at most once every 0.15 s
    const ping = () => {
        if (!context || context.currentTime - lastPingAt < 0.15) return
        lastPingAt = context.currentTime
        blip({ from: 880, duration: 0.12, volume: 0.04 })
        blip({ from: 1320, duration: 0.18, volume: 0.035, delay: 0.07 })
    }

    // Card dismissed: a short downward "poof"
    const pop = () => blip({ type: 'triangle', from: 600, to: 120, duration: 0.12, volume: 0.08 })

    // A lamp shorting out when someone gets fired
    const buzz = () => {
        for (let i = 0; i < 4; i++) {
            blip({ type: 'square', from: 120, duration: 0.06, volume: 0.03, delay: i * 0.18 + Math.random() * 0.1 })
        }
    }

    // Keyboard clicks while the hero works, at most once every 0.08 s
    let lastTypeAt = 0
    const type = () => {
        if (!context || context.currentTime - lastTypeAt < 0.08) return
        lastTypeAt = context.currentTime
        blip({ type: 'square', from: 1800 + Math.random() * 900, to: 900, duration: 0.025, volume: 0.015 })
    }

    // The hero switches off his own lamp: a light switch click
    const click = () => {
        blip({ type: 'square', from: 2400, to: 1600, duration: 0.02, volume: 0.04 })
        blip({ type: 'triangle', from: 140, to: 70, duration: 0.08, volume: 0.06, delay: 0.01 })
    }

    // A card reached the hero's head: a dull thud
    const hit = () => blip({ type: 'triangle', from: 160, to: 55, duration: 0.25, volume: 0.09 })

    // Burnout: a high-pitched ringing in the ears that slowly fades
    const tinnitus = () => {
        if (!context) return
        const now = context.currentTime
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.frequency.value = 3800
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.03, now + 1.5)
        gain.gain.linearRampToValueAtTime(0, now + 9)
        oscillator.connect(gain).connect(master)
        oscillator.start(now)
        oscillator.stop(now + 9.5)
    }

    // Finale: the anxiety drains away. The calm ending leaves a quiet, warm chord.
    // fade is how many seconds the hum takes to die out; in the Frozen ending it cuts off almost instantly
    const calm = ({ chord = true, fade = 4 } = {}) => {
        if (!context) return
        clearTimeout(heartbeatTimeout)
        rampTo(drone.gain.gain, 0, fade)
        rampTo(hiss.gain.gain, 0, fade)
        if (!chord) return

        const now = context.currentTime
        for (const frequency of [261.6, 329.6, 392, 523.3]) {
            const oscillator = context.createOscillator()
            const gain = context.createGain()
            oscillator.frequency.value = frequency
            gain.gain.setValueAtTime(0, now + 2)
            gain.gain.linearRampToValueAtTime(0.025, now + 5)
            gain.gain.linearRampToValueAtTime(0, now + 14)
            oscillator.connect(gain).connect(master)
            oscillator.start(now + 2)
            oscillator.stop(now + 14.5)
        }
    }

    // Safe to call before start(): the sound will then start muted
    const setMuted = (value) => {
        muted = value
        if (context) rampTo(master.gain, muted ? 0 : 0.8, 0.2)
    }

    const isMuted = () => muted

    // iOS suspends audio when the tab is hidden or a call comes in. Wake it on the next touch
    const resume = () => {
        if (context && context.state !== 'running') context.resume()
    }

    return { start, resume, setIntensity, ping, pop, buzz, type, hit, click, tinnitus, calm, setMuted, isMuted }
}
