const KEYBOARD: [string, string][] = [
  ['W / ↑', 'Accelerate'],
  ['S / ↓', 'Brake · reverse when stopped'],
  ['A / D', 'Steer left / right'],
  ['Space', 'Handbrake (rear wheels)'],
  ['Q / E', 'Air tyres down / pump up'],
  ['F', 'Toggle 4WD / 2WD'],
  ['L', 'Toggle LOW range (below 8 km/h)'],
  ['N', 'Headlights'],
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
        rock crawling. Stop at the base-camp fuel station to refuel and repair.
      </p>
    </div>
  )
}
