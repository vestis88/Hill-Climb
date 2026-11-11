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

import { setTestMode, tuningEnabled } from './tuning'
import { showCode, type CloudSync } from '../save/cloud'

const when = (t: number | null) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')

/** The "Sync between devices" rows: off, start or join, or the family code and status. */
function syncRows(cloud: CloudSync | undefined, joining: boolean, joinError: boolean): string {
  if (!cloud?.available) return ''
  const code = cloud.code
  if (!code) {
    return `<div class="sync"><span>Sync between devices<br><small style="opacity:.7">Share coins, upgrades and scores with your other iPhone or iPad</small></span>
      ${joining
        ? `<span class="join"><input data-act="code" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="16">
           <button class="small" data-act="join-go">Join</button><button class="small" data-act="join-no">Cancel</button>
           ${joinError ? '<small class="err">That code did not work</small>' : ''}</span>`
        : '<span class="seg"><button data-act="sync-new">Start</button><button data-act="join">Join with code</button></span>'}</div>`
  }
  const status = { off: '', syncing: 'Syncing…', ok: `Synced ${when(cloud.lastSync)}`, error: 'Could not reach the cloud; will retry' }[cloud.state]
  return `<div class="sync"><span>Sync between devices<br><small style="opacity:.7">Family code: <b class="code">${showCode(code)}</b><br>${status}</small></span>
    <span class="seg"><button data-act="sync-now">Sync now</button><button data-act="sync-leave">Stop</button></span></div>`
}

export function showSettings(el: HTMLElement, s: Settings, onChange: () => void, onReset: () => void, onBack: () => void, cloud?: CloudSync): void {
  let confirming = false
  let joining = false
  let joinError = false
  const render = () => {
    el.innerHTML = `
      <div class="bar"><h2>Settings</h2><button class="small" data-act="back">Back</button></div>
      <div class="rows" style="max-width:420px">
        <div><span>Sound</span><span class="seg"><button data-sound="on" class="${s.sound ? 'on' : ''}">On</button><button data-sound="off" class="${s.sound ? '' : 'on'}">Off</button></span></div>
        <div><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-act="volume" style="width:55%"></div>
        <div><span>Test mode<br><small style="opacity:.7">Everything unlocked, nothing bought</small></span><span class="seg"><button data-test="off" class="${tuningEnabled() ? '' : 'on'}">Off</button><button data-test="on" class="${tuningEnabled() ? 'on' : ''}">On</button></span></div>
        ${syncRows(cloud, joining, joinError)}
        <div><span>Pedals</span><span class="seg"><button data-pedals="normal" class="${s.swapPedals ? '' : 'on'}">Brake left</button><button data-pedals="swap" class="${s.swapPedals ? 'on' : ''}">Gas left</button></span></div>
      </div>
      <div class="actions">
        ${confirming
          ? `<span>Delete all coins, upgrades and unlocks${cloud?.code ? ' on this device (it also stops syncing)' : ''}?</span><button class="small" data-act="reset-yes" style="background:#e5383b">Yes, reset</button><button class="small" data-act="reset-no">Cancel</button>`
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
    else if (b.dataset.test) setTestMode(b.dataset.test === 'on')
    else if (b.dataset.act === 'back') return onBack()
    else if (b.dataset.act === 'reset') confirming = true
    else if (b.dataset.act === 'reset-no') confirming = false
    else if (b.dataset.act === 'sync-new') void cloud?.createFamily()
    else if (b.dataset.act === 'join') {
      joining = true
      joinError = false
    } else if (b.dataset.act === 'join-no') joining = false
    else if (b.dataset.act === 'join-go') {
      const typed = el.querySelector<HTMLInputElement>('input[data-act="code"]')?.value ?? ''
      void cloud?.join(typed).then((ok) => {
        joinError = !ok
        if (ok) joining = false
        else cloud?.leave()
        render()
      })
      return
    } else if (b.dataset.act === 'sync-now') void cloud?.syncNow()
    else if (b.dataset.act === 'sync-leave') cloud?.leave()
    else if (b.dataset.act === 'reset-yes') {
      confirming = false
      onReset()
    }
    onChange()
    render()
  }
  // Re-draw as the sync status changes (only while this screen is showing).
  if (cloud) cloud.onState = () => el.isConnected && !el.classList.contains('hidden') && !joining && render()
}
