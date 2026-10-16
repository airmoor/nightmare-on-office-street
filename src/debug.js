import GUI from 'lil-gui'

/**
 * Debug panel (lil-gui). main.js loads this module only when the URL has #debug,
 * so lil-gui stays out of the bundle regular players download.
 * Tune the numbers here, then copy them into params, levels.js and friends
 */
export const createDebugPanel = ({
    params,
    scene,
    lights,
    story,
    news,
    game,
    clock,
    fireRandomColleague,
    resetOffice,
    levelOrder,
    getLevelKey,
    onLevelChange,
    endingKinds,
    startEnding,
}) => {
    const gui = new GUI({ title: 'Debug' })

    const sceneFolder = gui.addFolder('Scene')
    sceneFolder.add(params, 'fogDensity').min(0).max(0.2).step(0.001).name('fog density')
    sceneFolder.add(params, 'fogDensityGrowth').min(0).max(0.1).step(0.001).name('fog growth')
    sceneFolder.add(params, 'vignetteStrength').min(0).max(1).step(0.01).name('vignette strength')
    sceneFolder.add(params, 'cameraShake').min(0).max(0.2).step(0.001).name('camera shake')
    sceneFolder.addColor(params, 'background').onChange((value) => {
        scene.background.set(value)
        scene.fog.color.set(value)
    })

    const lightsFolder = gui.addFolder('Lights')
    lightsFolder.add(lights.ambient, 'intensity').min(0).max(1).step(0.01).name('ambient')
    lightsFolder.add(lights.moon, 'intensity').min(0).max(2).step(0.01).name('moon')
    lightsFolder.add(params, 'heroLightIntensity').min(0).max(80).step(0.5).name('hero lamp')
    lightsFolder.add(lights.monitorGlow, 'intensity').min(0).max(10).step(0.1).name('monitor glow')

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

    const gameFolder = gui.addFolder('Game')
    gameFolder.add(game, 'performance').min(0).max(100).step(1).listen()
    gameFolder.add(game, 'stress').min(0).max(100).step(1).listen()
    gameFolder.add(game, 'workRate').min(0).max(50).step(0.5).name('work rate /s')
    gameFolder.add(game, 'performanceDecayStart').min(0).max(20).step(0.5).name('perf decay at start /s')
    gameFolder.add(game, 'performanceDecayEnd').min(0).max(20).step(0.5).name('perf decay at end /s')
    gameFolder.add(game, 'stressPerHit').min(0).max(30).step(1).name('stress per hit')
    gameFolder.add(game, 'stressReliefPerDismiss').min(0).max(10).step(0.5).name('relief per dismiss')
    gameFolder.add(game, 'stressDecay').min(0).max(10).step(0.1).name('stress decay /s')
    gameFolder.add(game, 'respawnChance').min(0).max(1).step(0.05).name('respawn chance')
    gameFolder.add(game, 'noiseChance').min(0).max(1).step(0.01).name('noise share')

    const level = { level: getLevelKey() }
    gui.addFolder('Level').add(level, 'level', levelOrder).onChange(onLevelChange)

    // Endings on a button, so you don't have to play a whole shift for each (works once a shift is running)
    const endingsFolder = gui.addFolder('Endings').close()
    for (const kind of endingKinds) endingsFolder.add({ [kind]: () => startEnding(kind) }, kind)

    return {
        show: (visible) => gui.show(visible),
        // Level params change outside the panel: pull fresh values into the controls
        refresh: () => {
            level.level = getLevelKey()
            for (const controller of gui.controllersRecursive()) controller.updateDisplay()
        },
    }
}
