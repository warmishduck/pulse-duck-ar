// app.js is the main entry point. The page's address decides what it shows (see route.js):
//  - /?c=03   the AR view of that exhibit, through the 8th Wall camera pipeline;
//  - /?scan   the camera, looking for an exhibit object (see scan.js);
//  - /        the welcome page, which has no camera at all (see welcome.js).

import {initScenePipelineModule} from './threejs-scene-init'
import {resolveRoute} from './route'
import {startWelcome} from './welcome'
import {canScan, startScan} from './scan'
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

const route = resolveRoute(window.location.search)
if (route.kind === 'exhibit') {
  startAr(route.exhibit)
} else if (route.kind === 'scan' && canScan) {
  startScan()
} else {
  startWelcome({unknownCode: route.kind === 'welcome' && route.unknownCode, hasScan: canScan})
}
