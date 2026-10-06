// app.js is the main entry point. The page's address decides what it shows (see route.js):
//  - /?c=03   the AR view of that exhibit, through the 8th Wall camera pipeline;
//  - /        the welcome page, which has no camera at all (see welcome.js).

import {initScenePipelineModule} from './threejs-scene-init'
import {resolveRoute, routeFromImageTarget} from './route'
import {startWelcome} from './welcome'
import {IMAGE_TARGET_DATA} from './image-targets'
import {TEXT} from './i18n'
import * as THREE from 'three';

window.THREE = THREE

const startAr = (exhibit) => {
  const onxrloaded = () => {
    XR8.addCameraPipelineModules([  // Add camera pipeline modules.
      // Existing pipeline modules.
      XR8.GlTextureRenderer.pipelineModule(),      // Draws the camera feed.
      XR8.Threejs.pipelineModule(),                // Creates a ThreeJS AR Scene.
      XR8.CanvasScreenshot.pipelineModule(),       // Lets the photo button capture the camera feed plus content.
      XR8.XrController.pipelineModule(),           // Enables SLAM tracking.
      LandingPage.pipelineModule(),         // Detects unsupported browsers and gives hints.
      XRExtras.FullWindowCanvas.pipelineModule(),  // Modifies the canvas to fill the window.
      XRExtras.Loading.pipelineModule(),           // Manages the loading screen on startup.
      XRExtras.RuntimeError.pipelineModule(),      // Shows an error image on runtime error.
      // Custom pipeline modules.
      initScenePipelineModule(exhibit),  // Sets up the threejs camera and scene content.
    ])

    const canvas = document.getElementById('camerafeed')
    // Open the camera and start running the camera run loop.
    XR8.run({canvas})
  }

  window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
}

// Starts a camera-only scan session for image target detection.
// Navigates to the matching exhibit when any configured image target is found.
const startImageTargetScan = () => {
  document.querySelector('.welcome-ui')?.remove()
  document.querySelector('.welcome-canvas')?.remove()
  document.body.classList.remove('welcome-page')

  const canvas = document.createElement('canvas')
  canvas.id = 'camerafeed'
  document.body.appendChild(canvas)

  const overlay = document.createElement('div')
  overlay.className = 'ui scan-overlay'
  const hint = document.createElement('p')
  hint.className = 'scan-hint'
  hint.textContent = TEXT.scanHint
  overlay.appendChild(hint)
  document.body.appendChild(overlay)

  const onxrloaded = () => {
    XR8.XrController.configure({imageTargetData: IMAGE_TARGET_DATA, disableWorldTracking: true})
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.XrController.pipelineModule(),
      LandingPage.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
    ])
    window.addEventListener('reality.imagefound', (e) => {
      const match = routeFromImageTarget(e.detail.name)
      if (match) {
        window.location.search = `?c=${match.code}`
      }
    })
    XR8.run({canvas})
  }

  window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
}

const hasScan = IMAGE_TARGET_DATA.length > 0

const route = resolveRoute(window.location.search)
if (route.kind === 'exhibit') {
  startAr(route.exhibit)
} else {
  startWelcome({
    unknownCode: route.unknownCode,
    hasScan,
    onScan: hasScan ? startImageTargetScan : null,
  })
}
