// app.js is the main entry point. The page's address decides what it shows (see route.js):
//  - /?c=03   the AR view of that exhibit, through the 8th Wall camera pipeline;
//  - /?scan   the camera, looking for an exhibit object (see scan.js);
//  - /        the welcome page, which has no camera at all (see welcome.js).

import {initScenePipelineModule} from './threejs-scene-init'
import {resolveRoute} from './route'
import {startWelcome} from './welcome'
import {canScan, startScan} from './scan'
import {startXr} from './xr-pipeline'
import * as THREE from 'three';

window.THREE = THREE

const route = resolveRoute(window.location.search)
if (route.kind === 'exhibit') {
  startXr(initScenePipelineModule(route.exhibit))
} else if (route.kind === 'scan' && canScan) {
  startScan()
} else {
  startWelcome({unknownCode: route.kind === 'welcome' && route.unknownCode, hasScan: canScan})
}
