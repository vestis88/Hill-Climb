/** Player settings, kept in this browser. */
export interface Settings {
  sound: boolean
  volume: number
  /** Gas on the left, brake on the right. */
  swapPedals: boolean
}

const KEY = 'ridgeline.settings'

export function loadSettings(): Settings {
  const defaults: Settings = { sound: true, volume: 0.7, swapPedals: false }
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults
  } catch {
    return defaults
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // not persisted
  }
}

export function showSettings(el: HTMLElement, s: Settings, onChange: () => void, onReset: () => void, onBack: () => void): void {
  let confirming = false
  const render = () => {
    el.innerHTML = `
      <div class="bar"><h2>Settings</h2><button class="small" data-act="back">Back</button></div>
      <div class="rows" style="max-width:420px">
        <div><span>Sound</span><span class="seg"><button data-sound="on" class="${s.sound ? 'on' : ''}">On</button><button data-sound="off" class="${s.sound ? '' : 'on'}">Off</button></span></div>
        <div><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-act="volume" style="width:55%"></div>
        <div><span>Pedals</span><span class="seg"><button data-pedals="normal" class="${s.swapPedals ? '' : 'on'}">Brake left</button><button data-pedals="swap" class="${s.swapPedals ? 'on' : ''}">Gas left</button></span></div>
      </div>
      <div class="actions">
        ${confirming
          ? '<span>Delete all coins, upgrades and unlocks?</span><button class="small" data-act="reset-yes" style="background:#e5383b">Yes, reset</button><button class="small" data-act="reset-no">Cancel</button>'
          : '<button class="small" data-act="reset">Reset progress…</button>'}
      </div>`
  }
  render()
  el.oninput = (e) => {
    const t = e.target as HTMLInputElement
    if (t.dataset.act === 'volume') {
      s.volume = Number(t.value)
      onChange()
    }
  }
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b) return
    if (b.dataset.sound) s.sound = b.dataset.sound === 'on'
    else if (b.dataset.pedals) s.swapPedals = b.dataset.pedals === 'swap'
    else if (b.dataset.act === 'back') return onBack()
    else if (b.dataset.act === 'reset') confirming = true
    else if (b.dataset.act === 'reset-no') confirming = false
    else if (b.dataset.act === 'reset-yes') {
      confirming = false
      onReset()
    }
    onChange()
    render()
  }
}
