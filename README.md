# Ridgeline 4x4 — Off-Road Trail Driving

A browser 3D off-road driving game for desktop, phone and tablet. You drive one of three 4x4 trucks on a
custom raycast vehicle controller running in Rapier's fixed physics timestep, through a valley with timed
trails, mud bogs, rock gardens, fallen logs, a steep hill climb and a switchback ridge, by day or by night.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 – also prints a Network URL for phones/tablets on your Wi-Fi
npm run build        # type-check + static build in dist/
npm run preview      # serve the production build (also on your LAN, port 4173)
```

### Playing on a phone or tablet
1. Run `npm run dev` (or `npm run preview` after a build) on your PC.
2. On the phone, connected to the same Wi-Fi, open the **Network** URL that Vite prints (e.g. `http://192.168.1.20:5173`).
3. Tap **Play**. The game goes fullscreen and landscape where the browser allows it. You can also use
   "Add to Home Screen" to launch it fullscreen like an app.

### Hosting it online
`npm run build` produces a fully static `dist/` folder. Everything (including the physics WASM) is bundled,
and paths are relative, so it works from any host or sub-folder: Netlify, Vercel, GitHub Pages, itch.io
(HTML5 upload), or any web server.

## How to play

**Main menu → Play → 1. Trail → 2. Truck → Drive.** Reach each checkpoint gate in order (follow the light
beam and the arrow in the top bar) to finish the trail against the clock. Best times are saved.

| Trail | Difficulty | Time of day | Features |
| --- | --- | --- | --- |
| Base Camp Loop | Easy | 10:00 | Tutorial dirt road |
| Valley Traverse | Medium | 07:12 | Whoops, mud bog, gully, logs |
| Boulder Run | Hard | 05:36 dawn | Rocky trail, rock garden, hill climb |
| Ridge Summit | Hard | 17:24 dusk | Steep switchbacks |
| Night Crawl | Extreme | 21:30 night | Rocky trail by headlight |
| Free Roam | — | 08:00 | Whole valley, no clock |

| Truck | Character |
| --- | --- |
| Ridgeback | Long-bed pickup, balanced |
| Nomad | Expedition wagon: heavy, most torque, very stable |
| Bandit | Short-wheelbase 2-door: light, nimble, most suspension travel |

### Controls

| Keyboard | Touch | Action |
| --- | --- | --- |
| W / ↑ | GAS | Accelerate |
| S / ↓ | BRAKE | Brake; reverse once stopped |
| A / D | ◀ ▶ | Steer |
| Space | HB | Handbrake |
| Q / E | PSI − / + | Air tyres down / pump up |
| F | 4WD button | 4WD ↔ 2WD |
| L | HIGH/LOW button | Transfer case (below 8 km/h) |
| N | 💡 (top bar) | Headlights (automatic at night) |
| C | 📷 | Chase → hood → free orbit → cinematic camera |
| Mouse drag / wheel | Drag / pinch | Orbit / zoom camera |
| R | ⟲ | Recover the truck |
| Esc / P | ⏸ | Pause: restart, change trail or truck, settings |

**Tips:**
- Air down for mud and rocks: 8–18 psi gives much more grip but more rolling resistance. Pump up for the dirt roads.
- LOW range multiplies torque ×2.72 and holds 1st–2nd gear. Use it for crawling and engine-braked descents.
- Stop at the base-camp fuel station to refuel and repair.

## Performance & devices

- **Graphics: Auto / Low / Medium / High** (Main menu → Settings). Auto picks a tier from the device: phones
  and weak GPUs get Low, integrated GPUs get Medium, discrete GPUs get High.
- **Adaptive resolution:**
  - The loading screen benchmarks the scene and picks the starting resolution.
  - During play, resolution is lowered only if frame rate stays low.
  - It goes back up while paused.
- **What the tiers change:** shadows (none + blob shadow / single-tap / soft PCF), Lambert vs PBR terrain,
  terrain shader detail, grass, tree and bush density, draw distance, fog and reflections.
- **Rendering optimisations:**
  - Terrain is rendered in culled tiles.
  - Rocks are merged per 160 m chunk.
  - Trees are instanced per chunk, with trunk and crown merged.
  - Grass is chunked and fades out with distance (no popping).
  - Each truck is merged to about a dozen draw calls.
  - All geometry is uploaded behind the loading screen.
  - The HUD writes straight to the DOM, so there are no React re-renders while driving.
- **Measured** on an Intel HD 620 laptop GPU at 1280×720:
  - Low: ~115–140 fps
  - Medium (Auto's choice there): ~60–80 fps
  - High: ~35 fps (meant for discrete GPUs)
  - Phone emulation (Low): steady 60 fps at full resolution

## Simulation notes

- **Suspension:** each wheel casts 5 rays across the tyre footprint (it climbs rock edges and logs).
  Springs, dampers, bump stops and anti-roll bars; the force is applied along the chassis up axis.
- **Tyres:**
  - Slip-angle lateral curve, with static friction at low speed using gravity-predicted velocities, so a parked truck holds on slopes.
  - Friction ellipse.
  - Surface grip and rolling resistance come from grass / dirt / rock / mud / wood, and from tyre pressure.
- **Drivetrain:**
  - Engine torque curve and torque converter.
  - 5-speed automatic, with shift hysteresis based on ground speed.
  - Transfer case (HIGH/LOW).
  - Locked differentials: torque goes to the tyres with grip, and the driveline spins up as one body (with engine inertia) when traction is exceeded.
  - Integral traction control.
  - Hill-hold, anti-rollback and fuel burn from power × BSFC.
- **Damage** comes from impact g-forces (crashes, hard landings) and reduces engine power. It is repaired at base camp.

## Project structure

```
src/game/         store (phases, settings), quality tiers, stages, runtime state, input,
                  GameCanvas, StageManager (checkpoints/timer), AdaptiveResolution, SceneReady
src/vehicle/      trucks (specs), vehicleConfig, VehicleController, Suspension, WheelPhysics,
                  Drivetrain, truckGeometry (parametric merged bodies), TruckModel, RunningGear, BlobShadow
src/environment/  worldConfig (map, roads, surfaces), terrainGenerator, worldGen, textures,
                  Terrain, Vegetation (trees, grass, bushes, logs), Rocks, Landmarks, Lighting (day/night)
src/physics/      PhysicsWorld, static collider helper, surface registry
src/camera/       CameraRig (4 modes, collision + foliage avoidance, pinch zoom)
src/hud/          HUD, TouchControls
src/ui/           MainMenu (settings), SelectScreen, LoadingScreen, PauseMenu, ResultsScreen
src/audio/        procedural engine / tyre / wind sound
```

In dev builds `window.__game` exposes telemetry, the store, the vehicle, the world and perf numbers.

## Not included yet

Multiplayer, a winch, vehicle customisation and a store.
