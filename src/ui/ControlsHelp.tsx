const KEYBOARD: [string, string][] = [
  ['W / ↑', 'Accelerate'],
  ['S / ↓', 'Brake · reverse when stopped'],
  ['A / D', 'Steer left / right'],
  ['Space', 'Handbrake (rear wheels)'],
  ['Q / E', 'Air tyres down / pump up'],
  ['F', 'Toggle 4WD / 2WD'],
  ['L', 'Toggle LOW range (below 8 km/h)'],
  ['N', 'Headlights'],
  ['G', 'Winch: hook nearest tree / boulder ahead · release'],
  ['V / B', 'Winch reel in / pay out'],
  ['T', 'Automatic ↔ manual gearbox'],
  ['X / Z', 'Manual: shift up / down (or drag the lever)'],
  ['C', 'Change camera'],
  ['Mouse drag / wheel', 'Orbit camera / zoom'],
  ['R', 'Recover vehicle'],
  ['M', 'Sound on / off'],
  ['Esc / P', 'Pause menu'],
]

const TOUCH: [string, string][] = [
  ['◀ ▶', 'Steer (left thumb)'],
  ['GAS / BRAKE', 'Pedals (right thumb) · hold BRAKE when stopped to reverse'],
  ['HB', 'Handbrake'],
  ['WINCH · IN · OUT', 'Hook the nearest tree / boulder ahead, reel in, pay out'],
  ['Gear lever', 'Drag it (R · N · D or R · N · 1–5) · A/M = gearbox · H/L = range'],
  ['PSI − / +', 'Air tyres down / pump up'],
  ['4WD · LOW', 'Drive mode and transfer case'],
  ['Drag on screen', 'Orbit camera · pinch to zoom'],
]

export function ControlsHelp({ touch = false }: { touch?: boolean }) {
  const rows = touch ? TOUCH : KEYBOARD
  return (
    <div className="controls">
      <h3>Controls</h3>
      <dl>
        {rows.map(([k, d]) => (
          <div key={k} className="controls-row">
            <dt><kbd>{k}</kbd></dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
      <p className="controls-tip">
        Air down for mud and rocks (8–18 psi), pump up for the dirt roads. Use <b>LOW</b> range for steep climbs and
        rock crawling. Stuck? Hook the winch to a tree ahead and reel in. Stop at the base-camp fuel station to refuel and repair.
      </p>
    </div>
  )
}
