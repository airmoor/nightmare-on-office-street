/**
 * Весь звук генерируется кодом через Web Audio API — никаких файлов и лицензий.
 * Схема: источники (осцилляторы, шум) → фильтры → gain (громкость) → master → колонки
 *
 * Браузер разрешает звук только после действия пользователя,
 * поэтому start() вызывается на первое нажатие: удержание clock in, Look around или клик по экрану
 *
 * iOS: по умолчанию Web Audio молчит, если включён беззвучный режим (переключатель сбоку).
 * Safari 17+ позволяет сказать «это проигрывание медиа» через navigator.audioSession.
 * Для старых iOS работает трюк: одновременно играть беззвучный <audio> — он переключает телефон в режим медиа
 */
const createSilentWavUrl = () => {
    const sampleRate = 8000
    const samples = 800 // 0.1 секунды
    const buffer = new ArrayBuffer(44 + samples)
    const view = new DataView(buffer)
    const writeString = (offset, text) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
    }

    // Заголовок WAV: 8-битный моно
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
    for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128) // 128 — тишина для 8 бит

    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

const unlockIOSPlayback = () => {
    if (navigator.audioSession) {
        try {
            navigator.audioSession.type = 'playback'
        } catch {}
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

    // Плавно меняем параметр, чтобы не было щелчков
    const rampTo = (param, value, duration = 0.3) => {
        const now = context.currentTime
        param.cancelScheduledValues(now)
        param.setValueAtTime(param.value, now)
        param.linearRampToValueAtTime(value, now + duration)
    }

    // Короткий звук: осциллятор с огибающей громкости (быстро вверх, плавно вниз)
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

    // Низкий гул офиса: два чуть расстроенных осциллятора дают «биение»
    const createDrone = () => {
        const gain = context.createGain()
        gain.gain.value = 0
        const filter = context.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 320 // ниже ~200 Гц динамик телефона почти ничего не играет

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

    // Шипение вентиляции: белый шум через полосовой фильтр
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

    // Сердцебиение «тук-тук»: чем выше напряжение, тем чаще
    const scheduleHeartbeat = () => {
        const interval = 1.3 - intensity * 0.85 // от 1.3 с до 0.45 с
        if (intensity > 0.2) {
            const volume = 0.12 + intensity * 0.16
            // triangle вместо sine: у него есть обертоны, и удар слышно даже на динамике телефона
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
        context.resume() // Safari иногда создаёт контекст сразу на паузе
        master = context.createGain()
        master.gain.value = muted ? 0 : 0.8
        // Компрессор сглаживает пики: когда звуки накладываются в конце, общая громкость не взлетает
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

    // 0 — спокойно, 1 — максимальная тревога
    const setIntensity = (value) => {
        intensity = value
        if (!context) return
        rampTo(drone.gain.gain, 0.05 + value * 0.035)
        rampTo(drone.filter.frequency, 320 + value * 450)
        rampTo(hiss.gain.gain, 0.012 + value * 0.008)
    }

    // Уведомление: два коротких тона вверх. Не чаще, чем раз в 0.15 с
    const ping = () => {
        if (!context || context.currentTime - lastPingAt < 0.15) return
        lastPingAt = context.currentTime
        blip({ from: 880, duration: 0.12, volume: 0.04 })
        blip({ from: 1320, duration: 0.18, volume: 0.035, delay: 0.07 })
    }

    // Закрыли карточку: короткий «пуф» вниз
    const pop = () => blip({ type: 'triangle', from: 600, to: 120, duration: 0.12, volume: 0.08 })

    // Лампа коротит при увольнении
    const buzz = () => {
        for (let i = 0; i < 4; i++) {
            blip({ type: 'square', from: 120, duration: 0.06, volume: 0.03, delay: i * 0.18 + Math.random() * 0.1 })
        }
    }

    // Стук клавиш, пока герой работает. Не чаще, чем раз в 0.08 с
    let lastTypeAt = 0
    const type = () => {
        if (!context || context.currentTime - lastTypeAt < 0.08) return
        lastTypeAt = context.currentTime
        blip({ type: 'square', from: 1800 + Math.random() * 900, to: 900, duration: 0.025, volume: 0.015 })
    }

    // Герой сам выключает свою лампу: щелчок выключателя
    const click = () => {
        blip({ type: 'square', from: 2400, to: 1600, duration: 0.02, volume: 0.04 })
        blip({ type: 'triangle', from: 140, to: 70, duration: 0.08, volume: 0.06, delay: 0.01 })
    }

    // Карточка долетела до головы: глухой удар
    const hit = () => blip({ type: 'triangle', from: 160, to: 55, duration: 0.25, volume: 0.09 })

    // Выгорание: высокий звон в ушах, который медленно затихает
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

    // Финал: тревога уходит. В спокойной концовке остаётся тихий тёплый аккорд.
    // fade — за сколько секунд затихает гул: в концовке Frozen звук обрывается почти сразу
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

    // Можно вызывать и до start(): тогда звук сразу начнётся выключенным
    const setMuted = (value) => {
        muted = value
        if (context) rampTo(master.gain, muted ? 0 : 0.8, 0.2)
    }

    const isMuted = () => muted

    // iOS ставит звук на паузу, когда вкладку свернули или пришёл звонок. Будим его по касанию
    const resume = () => {
        if (context && context.state !== 'running') context.resume()
    }

    return { start, resume, setIntensity, ping, pop, buzz, type, hit, click, tinnitus, calm, setMuted, isMuted }
}
