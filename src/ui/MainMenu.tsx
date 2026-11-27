import { useState } from 'react'
import { useGameStore, type TouchSetting } from '../game/store'
import { detectTier, QUALITY_LABELS, type QualitySetting } from '../game/quality'
import { ControlsHelp } from './ControlsHelp'
import { fullscreenSupported, toggleFullscreen, useTouchMode, Icon } from './common'

export function Segmented<T extends string>({ value, options, labels, onChange }: { value: T; options: T[]; labels: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>
          {labels[o]}
        </button>
      ))}
    </div>
  )
}

export function SettingsPanel() {
  const quality = useGameStore((s) => s.qualitySetting)
  const setQuality = useGameStore((s) => s.setQuality)
  const touch = useGameStore((s) => s.touchSetting)
  const setTouch = useGameStore((s) => s.setTouchSetting)
  const muted = useGameStore((s) => s.muted)
  const toggleMute = useGameStore((s) => s.toggleMute)
  return (
    <div className="settings">
      <div className="setting">
        <span>Graphics</span>
        <Segmented<QualitySetting> value={quality} options={['auto', 'low', 'medium', 'high']} labels={QUALITY_LABELS} onChange={setQuality} />
      </div>
      <p className="setting-note">Auto picked <b>{QUALITY_LABELS[detectTier()]}</b> for this device. Resolution also adapts while you drive.</p>
      <div className="setting">
        <span>Touch controls</span>
        <Segmented<TouchSetting> value={touch} options={['auto', 'on', 'off']} labels={{ auto: 'Auto', on: 'On', off: 'Off' }} onChange={setTouch} />
      </div>
      <div className="setting">
        <span>Sound</span>
        <Segmented<'on' | 'off'> value={muted ? 'off' : 'on'} options={['on', 'off']} labels={{ on: 'On', off: 'Off' }} onChange={(v) => (v === 'off') !== muted && toggleMute()} />
      </div>
    </div>
  )
}

export function MainMenu() {
  const openSelect = useGameStore((s) => s.openSelect)
  const toast = useGameStore((s) => s.toast)
  const touch = useTouchMode()
  const [panel, setPanel] = useState<'none' | 'settings' | 'controls'>('none')

  return (
    <div className="screen menu-screen">
      <MenuBackdrop />
      <div className="menu-card">
        <div className="brand">
          <div className="brand-mark">4×4</div>
          <div>
            <h1>RIDGELINE</h1>
            <p className="brand-sub">Off-road trail driving</p>
          </div>
        </div>
        <p className="menu-blurb">
          Crawl rock gardens, wade mud bogs and climb to the summits. Air down, lock in LOW range and beat the clock on
          every trail – day or night.
        </p>
        <div className="menu-buttons">
          <button className="btn primary" onClick={openSelect}>Play</button>
          <button className={`btn ${panel === 'settings' ? 'active' : ''}`} onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}>Settings</button>
          <button className={`btn ${panel === 'controls' ? 'active' : ''}`} onClick={() => setPanel(panel === 'controls' ? 'none' : 'controls')}>Controls</button>
          {fullscreenSupported() && (
            <button className="btn" onClick={toggleFullscreen}><Icon name="fullscreen" /> Fullscreen</button>
          )}
        </div>
        {panel === 'settings' && <SettingsPanel />}
        {panel === 'controls' && <ControlsHelp touch={touch} />}
        {toast && <div className={`menu-toast ${toast.tone}`}>{toast.text}</div>}
      </div>
    </div>
  )
}

export function MenuBackdrop() {
  return (
    <svg className="backdrop" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#25394a" />
          <stop offset="0.55" stopColor="#c98f5a" />
          <stop offset="1" stopColor="#e8b77c" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#sky)" />
      <circle cx="1180" cy="520" r="70" fill="#f6d79a" opacity="0.9" />
      <path d="M0 600 L180 430 L300 520 L470 360 L640 520 L800 410 L980 560 L1150 400 L1330 540 L1480 450 L1600 520 L1600 900 L0 900 Z" fill="#4a3f45" opacity="0.75" />
      <path d="M0 680 L140 590 L260 650 L420 540 L580 660 L760 570 L900 670 L1100 560 L1260 660 L1420 590 L1600 650 L1600 900 L0 900 Z" fill="#2e3532" />
      <path d="M0 760 L200 700 L380 750 L560 690 L760 770 L980 700 L1180 760 L1400 700 L1600 750 L1600 900 L0 900 Z" fill="#1b221f" />
      {Array.from({ length: 34 }, (_, i) => {
        const x = i * 50 + ((i * 37) % 23)
        const h = 40 + ((i * 53) % 35)
        const y = 735 + ((i * 29) % 30)
        return <path key={i} d={`M${x} ${y} l14 -${h} l14 ${h} z`} fill="#141a17" />
      })}
    </svg>
  )
}
