import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import GUI from 'lil-gui'
import { createGalaxy, defaultGalaxyParams, type GalaxyParams } from './galaxy'
import { createStarfield } from './starfield'
import { createDeepSpaceBackground } from './deepSpaceBackground'
import { createEarth, earthScaleFromDistance } from './earth'

export function createScene(canvas?: HTMLCanvasElement) {
  const scene = new THREE.Scene()
  scene.background = createDeepSpaceBackground()

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.set(0, 0, 4)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  const app = document.getElementById('app')!
  if (!canvas) app.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.minDistance = 0.5
  controls.maxDistance = 50 // Increased to allow zooming way out

  const starfield = createStarfield()
  scene.add(starfield.points)

  // Light so Earth reads as a 3D sphere
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
  dirLight.position.set(2, 1, 3)
  dirLight.target.position.set(0, 0, 0)
  scene.add(dirLight)
  scene.add(dirLight.target)

  const galaxyParams: GalaxyParams = {
    ...defaultGalaxyParams,
    particleCount: 180000,
    armCount: 2,
  }

  // Define our "Local Group"
  const earth = createEarth()

  const galaxyDefinitions = [
    { name: 'Milky Way', params: { ...galaxyParams }, scale: 1, pos: [0, 0, 0], isOurs: true },
    { name: 'Andromeda', params: { ...galaxyParams, particleCount: 220000, armColorYoung: new THREE.Color(0xbbaaff) }, scale: 1.2, pos: [12, 4, -15], isOurs: false },
    { name: 'Triangulum', params: { ...galaxyParams, particleCount: 60000, armCount: 3, spiralPitch: 0.35, armColorYoung: new THREE.Color(0x99ddff) }, scale: 0.5, pos: [-8, -6, -20], isOurs: false },
    { name: 'Large Magellanic Cloud', params: { ...galaxyParams, particleCount: 25000, armCount: 1, bulgeFraction: 0.1 }, scale: 0.3, pos: [2, -1.5, 1.5], isOurs: false },
    { name: 'Small Magellanic Cloud', params: { ...galaxyParams, particleCount: 15000, armCount: 1, bulgeFraction: 0.05 }, scale: 0.2, pos: [1.2, -2.5, 0.8], isOurs: false },
    { name: 'M32', params: { ...galaxyParams, particleCount: 12000, armCount: 0, bulgeFraction: 0.8 }, scale: 0.15, pos: [11.5, 4.5, -14.5], isOurs: false },
    { name: 'NGC 205', params: { ...galaxyParams, particleCount: 18000, armCount: 2, spiralPitch: 0.4 }, scale: 0.25, pos: [12.8, 3.2, -15.5], isOurs: false },
  ]

  const galaxies: { mesh: THREE.Group, def: typeof galaxyDefinitions[0], label: HTMLDivElement }[] = []
  const labelsContainer = document.createElement('div')
  labelsContainer.className = 'labels-container'
  app.appendChild(labelsContainer)

  galaxyDefinitions.forEach(def => {
    const mesh = createGalaxy({ params: def.params, scale: def.scale, position: def.pos as [number, number, number] })
    scene.add(mesh)

    // Add Earth specifically to the Milky Way
    if (def.isOurs) {
      ; (mesh.children[0] as THREE.Object3D).add(earth)
    }

    // Create 2D HTML Label
    const label = document.createElement('div')
    label.className = `galaxy-label ${def.isOurs ? 'milky-way' : ''}`
    label.innerText = def.name
    labelsContainer.appendChild(label)

    galaxies.push({ mesh, def, label })
  })

  // Specific "You are here" label for Earth
  const earthLabel = document.createElement('div')
  earthLabel.className = 'earth-label'
  earthLabel.innerText = 'You are here'
  labelsContainer.appendChild(earthLabel)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.8,
    0.4,
    0.3
  )
  composer.addPass(bloomPass)

  const state = {
    rotationSpeed: 0.002,
    bloomStrength: 0.8,
    bloomRadius: 0.4,
    bloomThreshold: 0.3,
    flyToEarth() {
      if (state.flyToEarthActive) return

      earth.getWorldPosition(earthWorldPos)
      flyStartPos.copy(camera.position)
      flyStartTarget.copy(controls.target)

      // Calculate a "view entire local group" position
      flyZoomOutMidPos.set(0, 15, 30) // Way up and back
      flyZoomOutMidTarget.set(2, 0, -5) // Looking roughly at center of mass

      flyEndPos.copy(earthWorldPos).add(new THREE.Vector3(0.15, 0.08, 0.15))

      flyPhase = 'zoom_out_local_group'
      flyPhaseStartTime = performance.now()
      state.flyToEarthActive = true
    },
    flyToEarthActive: false,
  }

  const earthWorldPos = new THREE.Vector3()
  const cameraTarget = new THREE.Vector3()

  const flyStartPos = new THREE.Vector3()
  const flyStartTarget = new THREE.Vector3()
  const flyZoomOutMidPos = new THREE.Vector3()
  const flyZoomOutMidTarget = new THREE.Vector3()
  const flyEndPos = new THREE.Vector3()
  const flyResetPos = new THREE.Vector3(0, 0, 5)
  const flyResetTarget = new THREE.Vector3(0, 0, 0)

  let flyPhase: 'zoom_out_local_group' | 'hold_out' | 'zoom_in_earth' | 'hold_earth' | 'reset' = 'zoom_out_local_group'

  const FLY_DURATIONS = {
    zoom_out_local_group: 4,
    hold_out: 2.5,
    zoom_in_earth: 6.5, // Long dive
    hold_earth: 4,
    reset: 3
  }
  let flyPhaseStartTime = 0

  const gui = new GUI({ title: 'Universe' })
  gui.add(state, 'rotationSpeed', 0, 0.01, 0.0005).name('Rotation speed')
  const bloomFolder = gui.addFolder('Bloom')
  bloomFolder.add(state, 'bloomStrength', 0, 2, 0.05).name('Strength')
  bloomFolder.add(state, 'bloomRadius', 0, 1, 0.02).name('Radius')
  bloomFolder.add(state, 'bloomThreshold', 0, 1, 0.02).name('Threshold')
  gui.close()

  window.addEventListener('resize', () => {
    const w = window.innerWidth
    const h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    composer.setSize(w, h)
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    bloomPass.setSize(w, h)
  })

  // Overlay
  const overlay = document.createElement('div')
  overlay.className = 'earth-overlay'
  overlay.innerHTML = `
    <p class="earth-message">We are but a speck in a vast cosmic ocean. Zoom out to see our Local Group of galaxies. You can find our home here(pale blue dot)..Each galaxy has billions of stars and planets. Each dots you see on the background are stars, galaxies, and local group of galaxies.</p>
    <button type="button" class="earth-btn" id="find-earth">Show True Scale</button>
  `
  app.appendChild(overlay)
  overlay.querySelector('#find-earth')!.addEventListener('click', () => state.flyToEarth())

  const tempV = new THREE.Vector3()

  // Helper to project 3D pos to 2D screen coordinate for labels
  function updateLabelPosition(label: HTMLDivElement, worldPos: THREE.Vector3) {
    tempV.copy(worldPos)
    tempV.project(camera)

    // Check if behind camera
    if (tempV.z > 1) {
      label.classList.add('hidden-label')
      return
    }

    label.classList.remove('hidden-label')
    const x = (tempV.x * 0.5 + 0.5) * window.innerWidth
    const y = (-(tempV.y * 0.5) + 0.5) * window.innerHeight
    label.style.left = `${x}px`
    label.style.top = `${y}px`
  }

  return {
    update() {
      starfield.update(performance.now() / 1000)
      controls.update()

      earth.getWorldPosition(earthWorldPos)
      const earthDist = camera.position.distanceTo(earthWorldPos)

      if (state.flyToEarthActive) {
        const elapsed = (performance.now() - flyPhaseStartTime) / 1000
        let t = 0
        let currentDuration = 1

        if (flyPhase === 'zoom_out_local_group') {
          currentDuration = FLY_DURATIONS.zoom_out_local_group
          t = Math.min(1, elapsed / currentDuration)
          const smooth = t * t * (3 - 2 * t)
          camera.position.lerpVectors(flyStartPos, flyZoomOutMidPos, smooth)
          cameraTarget.lerpVectors(flyStartTarget, flyZoomOutMidTarget, smooth)
          controls.target.copy(cameraTarget)
          if (t >= 1) { flyPhase = 'hold_out'; flyPhaseStartTime = performance.now() }
        }
        else if (flyPhase === 'hold_out') {
          if (elapsed >= FLY_DURATIONS.hold_out) { flyPhase = 'zoom_in_earth'; flyPhaseStartTime = performance.now() }
        }
        else if (flyPhase === 'zoom_in_earth') {
          currentDuration = FLY_DURATIONS.zoom_in_earth
          t = Math.min(1, elapsed / currentDuration)
          // Exponential ease-in-out for dramatic zoom
          const smooth = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
          camera.position.lerpVectors(flyZoomOutMidPos, flyEndPos, smooth)
          cameraTarget.lerpVectors(flyZoomOutMidTarget, earthWorldPos, smooth)
          controls.target.copy(cameraTarget)
          if (t >= 1) { flyPhase = 'hold_earth'; flyPhaseStartTime = performance.now() }
        }
        else if (flyPhase === 'hold_earth') {
          cameraTarget.copy(earthWorldPos)
          controls.target.copy(cameraTarget)
          if (elapsed >= FLY_DURATIONS.hold_earth) {
            flyStartPos.copy(camera.position)
            flyStartTarget.copy(earthWorldPos)
            flyPhase = 'reset'
            flyPhaseStartTime = performance.now()
          }
        }
        else if (flyPhase === 'reset') {
          currentDuration = FLY_DURATIONS.reset
          t = Math.min(1, elapsed / currentDuration)
          const smooth = t * t * (3 - 2 * t)
          camera.position.lerpVectors(flyStartPos, flyResetPos, smooth)
          cameraTarget.lerpVectors(flyStartTarget, flyResetTarget, smooth)
          controls.target.copy(cameraTarget)
          if (t >= 1) {
            state.flyToEarthActive = false
            flyPhase = 'zoom_out_local_group'
          }
        }
      }

      // Update Earth visibility
      earth.scale.setScalar(earthScaleFromDistance(earthDist))

      // Update 2D labels
      galaxies.forEach(g => {
        g.mesh.getWorldPosition(tempV)
        updateLabelPosition(g.label, tempV)

        // Fade out galaxy labels if we get too close to them (so they don't block the view)
        const dist = camera.position.distanceTo(tempV)
        if (dist < g.def.scale * 2) {
          g.label.style.opacity = '0'
        } else {
          g.label.style.opacity = '1'
        }

        // Spin each galaxy slowly
        ; (g.mesh.children[0] as THREE.Points).rotation.z += state.rotationSpeed * (1 / g.def.scale) * 0.2
      })

      // Update Earth Label
      updateLabelPosition(earthLabel, earthWorldPos)
      // Only show Earth label when quite close to the Milky Way but not so close that Earth is fully formed yet 
      if (earthDist < 1.0) {
        earthLabel.style.opacity = '1'
      } else {
        earthLabel.style.opacity = '0'
      }

      bloomPass.strength = state.bloomStrength
      bloomPass.radius = state.bloomRadius
      bloomPass.threshold = state.bloomThreshold
      composer.render()
    },
  }
}
