// The object scanner (`/?scan`): the camera looks for any exhibit object registered as an image
// target, and opens that exhibit's AR view as soon as it recognises one. World tracking is off
// here — nothing is placed in the scene, the camera only has to recognise.

import {IMAGE_TARGET_DATA} from './image-targets'
import {routeFromImageTarget} from './route'
import {TEXT} from './i18n'

/**
 * A camera pipeline module that opens the matching exhibit on the first recognised target.
 * Without A-Frame, 8th Wall delivers `reality.*` events only to pipeline-module listeners.
 *
 * @returns {Object} An 8th Wall camera pipeline module.
 */
const imageTargetRouterModule = () => {
  let leaving = false
  return {
    name: 'image-target-router',
    listeners: [{
      event: 'reality.imagefound',
      process: ({detail}) => {
        const match = routeFromImageTarget(detail.name)
        if (match && !leaving) {
          leaving = true
          // replace: Back from the exhibit returns to the welcome page, not to the scanner.
          window.location.replace(`?c=${match.code}`)
        }
      },
    }],
  }
}

const showHint = () => {
  const root = document.createElement('div')
  root.className = 'ui'
  const hint = document.createElement('div')
  hint.className = 'ui-toast ui-hint is-visible'
  hint.textContent = TEXT.scanHint
  root.appendChild(hint)
  document.body.appendChild(root)
}

/** Starts the camera and watches for every configured image target. */
export const startScan = () => {
  showHint()
  const onxrloaded = () => {
    XR8.XrController.configure({imageTargetData: IMAGE_TARGET_DATA, disableWorldTracking: true})
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.XrController.pipelineModule(),
      LandingPage.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
      imageTargetRouterModule(),
    ])
    XR8.run({canvas: document.getElementById('camerafeed')})
  }
  window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
}

/** True when at least one image target is configured, so scanning can find something. */
export const canScan = IMAGE_TARGET_DATA.length > 0
