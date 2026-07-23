import { commands } from '../commands/registry'
import { PLANE, CAMERA_INITIAL_CENTER } from './config'
import type { AircraftSim } from '../map/aircraft'
import { AIRCRAFT_TYPES } from '../map/aircraftTypes'
import { RouteBrain } from '../map/brain'
import { bearingDeg } from '../map/geo'
import { INTRUDER_PROBE_ROUTE } from '../map/routes'
import type { RadarField } from '../map/radarField'
import type { TrafficScheduler } from '../map/trafficScheduler'
import type { Subwoofer } from './hud/subwoofer'

export interface SceneCommandDeps {
  sim: AircraftSim
  radarField: RadarField
  traffic: TrafficScheduler
  subwoofer: Subwoofer
  setDevToolsVisible: (visible: boolean) => void
}

export function registerSceneCommands({ sim, radarField, traffic, subwoofer, setDevToolsVisible }: SceneCommandDeps): void {
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
      // Even compass spread, not Math.random(): the world model must stay
      // deterministic (see the determinism principle in root CLAUDE.md) — any
      // future real randomness must be a seeded PRNG in src/map/.
      for (let i = 0; i < count; i++) {
        sim.spawn({
          lon: CAMERA_INITIAL_CENTER.lon,
          lat: CAMERA_INITIAL_CENTER.lat,
          headingDeg: (i * 360) / count,
          type: AIRCRAFT_TYPES.il20m.typeId,
        })
      }
      return `Spawned ${count} aircraft (${sim.count} in the air).`
    },
  })

  commands.register({
    name: 'spawn-intruder',
    description: 'Spawn a Russian Il-20M on a Baltic probing route past Bornholm.',
    run: () => {
      const { spawn, waypoints } = INTRUDER_PROBE_ROUTE
      const profile = AIRCRAFT_TYPES.il20m
      const ac = sim.spawn(
        {
          ...spawn,
          // Point down the first leg from the start, so the intruder enters
          // clean instead of opening with a swerve.
          headingDeg: bearingDeg(spawn.lon, spawn.lat, waypoints[0].lon, waypoints[0].lat),
          type: profile.typeId,
        },
        new RouteBrain(waypoints, profile.turnRateDegPerSec),
      )
      return `${profile.name} inbound as track #${ac.id} (${sim.count} in the air).`
    },
  })

  commands.register({
    name: 'dev-tools',
    description: 'Show or hide the developer toolbar (usage: /dev-tools true|false).',
    run: (args) => {
      const raw = args.trim().toLowerCase()
      if (raw === 'true') {
        setDevToolsVisible(true)
        return 'Developer toolbar shown.'
      }
      if (raw === 'false') {
        setDevToolsVisible(false)
        return 'Developer toolbar hidden.'
      }
      return `Usage: /dev-tools <true|false>`
    },
  })

  commands.register({
    name: 'traffic',
    description: 'Control ambient public air traffic (usage: /traffic on|off|rate <multiplier>).',
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter((part) => part !== '')
      if (parts.length === 1 && parts[0] === 'on') {
        traffic.setEnabled(true)
        return 'Public traffic resumed.'
      }
      if (parts.length === 1 && parts[0] === 'off') {
        traffic.setEnabled(false)
        return 'Public traffic paused (flights already airborne continue).'
      }
      if (parts.length === 2 && parts[0] === 'rate') {
        const multiplier = Number.parseFloat(parts[1])
        if (!Number.isFinite(multiplier) || multiplier <= 0) return 'Usage: /traffic rate <positive number>'
        traffic.setRateMultiplier(multiplier)
        return `Traffic rate multiplier set to ${multiplier}.`
      }
      if (parts.length === 0) {
        const { spawned, skippedAtCap } = traffic.stats
        return `Traffic is ${traffic.isEnabled ? 'on' : 'off'}: ${spawned} flights spawned, ${skippedAtCap} skipped at the cap (${sim.count} aircraft in the air).`
      }
      return 'Usage: /traffic <on|off|rate <multiplier>>'
    },
  })

  commands.register({
    name: 'clear-planes',
    description: 'Remove all simulated aircraft.',
    run: () => {
      const removed = sim.clear()
      radarField.clearContacts()
      return `Removed ${removed} aircraft.`
    },
  })
}
