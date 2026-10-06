/**
 * Весь звук генерируется кодом через Web Audio API — никаких файлов и лицензий.
 * Схема: источники (осцилляторы, шум) → фильтры → gain (громкость) → master → колонки
 *
 * Браузер разрешает звук только после действия пользователя,
 * поэтому start() вызывается по клику на кнопку «Start shift»
 */
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
        filter.frequency.value = 200

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
            const volume = 0.15 + intensity * 0.35
            blip({ from: 70, to: 40, duration: 0.16, volume })
            blip({ from: 60, to: 35, duration: 0.14, volume: volume * 0.7, delay: 0.2 })
        }
        heartbeatTimeout = setTimeout(scheduleHeartbeat, interval * 1000)
    }

    const start = () => {
        if (context) return
        context = new AudioContext()
        master = context.createGain()
        master.gain.value = muted ? 0 : 0.8
        master.connect(context.destination)

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
        rampTo(drone.gain.gain, 0.05 + value * 0.09)
        rampTo(drone.filter.frequency, 200 + value * 700)
        rampTo(hiss.gain.gain, 0.012 + value * 0.02)
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

    // Финал: тревога уходит, остаётся тихий тёплый аккорд
    const calm = () => {
        if (!context) return
        clearTimeout(heartbeatTimeout)
        rampTo(drone.gain.gain, 0, 4)
        rampTo(hiss.gain.gain, 0, 4)

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

    const toggleMute = () => {
        muted = !muted
        if (context) rampTo(master.gain, muted ? 0 : 0.8, 0.2)
        return muted
    }

    return { start, setIntensity, ping, pop, buzz, calm, toggleMute }
}
