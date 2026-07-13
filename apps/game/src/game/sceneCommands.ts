import { commands } from '../commands/registry'
import { PLANE, CAMERA_INITIAL_CENTER } from './config'
import type { AircraftSim } from '../map/aircraft'
import type { PlaneLayer } from './layers/PlaneLayer'
import type { Subwoofer } from './hud/subwoofer'

export interface SceneCommandDeps {
  sim: AircraftSim
  planeLayer: PlaneLayer
  subwoofer: Subwoofer
}

/**
 * The game-state console commands, registered here (not in the pure registry)
 * because they need live scene objects — each captures its dependency by
 * closure, per the src/commands/ pattern. Must be called exactly once, from
 * `MainScene.create()`: the registry throws on duplicate names.
 */
export function registerSceneCommands({ sim, planeLayer, subwoofer }: SceneCommandDeps): void {
  commands.register({
    name: 'subwoofer',
    description: 'Drop the bass.',
    hidden: true,
    run: () => {
      subwoofer.trigger()
      return 'BWAAAAH'
    },
  })

  commands.register({
    name: 'spawn-planes',
    description: 'Spawn N test aircraft flying outward from the map centre (default 8).',
    run: (args) => {
      const raw = args.trim()
      const count = raw === '' ? PLANE.defaultSpawnCount : Number.parseInt(raw, 10)
      if (!Number.isInteger(count) || count <= 0) return `Usage: /spawn-planes [positive integer]`
      for (let i = 0; i < count; i++) {
        sim.spawn({
          lon: CAMERA_INITIAL_CENTER.lon,
          lat: CAMERA_INITIAL_CENTER.lat,
          headingDeg: Math.random() * 360,
          speedKmh: PLANE.spawnSpeedKmh,
        })
      }
      return `Spawned ${count} aircraft (${sim.count} in the air).`
    },
  })

  commands.register({
    name: 'clear-planes',
    description: 'Remove all simulated aircraft.',
    run: () => {
      const removed = sim.clear()
      planeLayer.clear()
      return `Removed ${removed} aircraft.`
    },
  })
}
