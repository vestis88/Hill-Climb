/** Player settings, kept in this browser. */
export interface Settings {
  sound: boolean
  volume: number
  /** Gas on the left, brake on the right. */
  swapPedals: boolean
  /** Which ghost riders to race: all of them, only records, or none. */
  ghosts: 'all' | 'records' | 'off'
  /** Players who get Hjälp (young players): more fuel, a forgiving start, no tipping over. */
  help: string[]
  /** Background music on or off. */
  music: boolean
  /** Duel: side by side (landscape, left and right) or opposite each other (portrait, top and bottom). */
  duelLayout: 'beside' | 'opposite'
}

const KEY = 'ridgeline.settings'

export function loadSettings(): Settings {
  const defaults: Settings = { sound: true, volume: 0.7, swapPedals: false, ghosts: 'all', help: [], music: true, duelLayout: 'beside' }
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
import { screenInfo } from './viewport'
import { PLAYERS } from '../data/players'

const when = (t: number | null) => (t ? new Date(t).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '')

/** The "Sync between devices" rows: off, start or join, or the family code and status. */
function syncRows(cloud: CloudSync | undefined, joining: boolean, joinError: boolean): string {
  if (!cloud?.available) return ''
  const code = cloud.code
  if (!code) {
    return `<div class="sync"><span>Synka mellan enheter<br><small style="opacity:.7">Dela mynt, uppgraderingar och resultat med din andra iPhone eller iPad</small></span>
      ${joining
        ? `<span class="join"><input data-act="code" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="16">
           <button class="small" data-act="join-go">Gå med</button><button class="small" data-act="join-no">Avbryt</button>
           ${joinError ? '<small class="err">Koden fungerade inte</small>' : ''}</span>`
        : '<span class="seg"><button data-act="sync-new">Starta</button><button data-act="join">Gå med med kod</button></span>'}</div>`
  }
  const status = { off: '', syncing: 'Synkar…', ok: `Synkad ${when(cloud.lastSync)}`, error: 'Når inte molnet, försöker igen' }[cloud.state]
  return `<div class="sync"><span>Synka mellan enheter<br><small style="opacity:.7">Familjekod: <b class="code">${showCode(code)}</b><br>${status}</small></span>
    <span class="seg"><button data-act="sync-now">Synka nu</button><button data-act="sync-leave">Sluta</button></span></div>`
}

export function showSettings(el: HTMLElement, s: Settings, onChange: () => void, onReset: () => void, onBack: () => void, cloud?: CloudSync, onClearScores?: () => void): void {
  let confirming = false
  let clearing = false
  let joining = false
  let joinError = false
  const render = () => {
    el.innerHTML = `
      <div class="bar"><h2>Inställningar</h2><button class="small" data-act="back">Tillbaka</button></div>
      <div class="rows" style="max-width:420px">
        <div><span>Ljud</span><span class="seg"><button data-sound="on" class="${s.sound ? 'on' : ''}">På</button><button data-sound="off" class="${s.sound ? '' : 'on'}">Av</button></span></div>
        <div><span>Musik</span><span class="seg"><button data-music="on" class="${s.music ? 'on' : ''}">På</button><button data-music="off" class="${s.music ? '' : 'on'}">Av</button></span></div>
        <div><span>Volym</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-act="volume" style="width:55%"></div>
        <div><span>Testläge<br><small style="opacity:.7">Visar Trimning: provkör alla fordon och banor med valfri trimning. Räknas inte.</small></span><span class="seg"><button data-test="off" class="${tuningEnabled() ? '' : 'on'}">Av</button><button data-test="on" class="${tuningEnabled() ? 'on' : ''}">På</button></span></div>
        ${syncRows(cloud, joining, joinError)}
        <div><span>Spöken</span><span class="seg"><button data-ghosts="all" class="${s.ghosts === 'all' ? 'on' : ''}">Alla</button><button data-ghosts="records" class="${s.ghosts === 'records' ? 'on' : ''}">Bara rekord</button><button data-ghosts="off" class="${s.ghosts === 'off' ? 'on' : ''}">Av</button></span></div>
        <div><span>Hjälp<br><small style="opacity:.7">Mer bränsle, snällare start och välter inte lika lätt</small></span><span class="seg">${PLAYERS.map((p) => `<button data-help="${p.name}" class="${s.help.includes(p.name) ? 'on' : ''}">${p.name}</button>`).join('')}</span></div>
        <div><span>Duell<br><small style="opacity:.7">Bredvid: vänster och höger halva. Mot varandra: iPaden står på höjden mellan er</small></span><span class="seg"><button data-duel="beside" class="${s.duelLayout === 'opposite' ? '' : 'on'}">Bredvid varandra</button><button data-duel="opposite" class="${s.duelLayout === 'opposite' ? 'on' : ''}">Mot varandra</button></span></div>
        <div><span>Pedaler</span><span class="seg"><button data-pedals="normal" class="${s.swapPedals ? '' : 'on'}">Broms vänster</button><button data-pedals="swap" class="${s.swapPedals ? 'on' : ''}">Gas vänster</button></span></div>
      </div>
      <div class="screeninfo">${screenInfo()}</div>
      <div class="actions">
        ${confirming
          ? `<span>Radera alla mynt, uppgraderingar och upplåsningar${cloud?.code ? ' på den här enheten (synkningen stoppas också)' : ''}?</span><button class="small" data-act="reset-yes" style="background:#e5383b">Ja, nollställ</button><button class="small" data-act="reset-no">Avbryt</button>`
          : clearing
            ? '<span>Rensa alla topplistor, rekord och spöken? Mynt och uppgraderingar finns kvar.</span><button class="small" data-act="clear-yes" style="background:#e5383b">Ja, rensa</button><button class="small" data-act="clear-no">Avbryt</button>'
            : '<button class="small" data-act="clear">Rensa topplistor och spöken…</button><button class="small" data-act="reset">Nollställ framsteg…</button>'}
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
    else if (b.dataset.music) s.music = b.dataset.music === 'on'
    else if (b.dataset.duel) s.duelLayout = b.dataset.duel as Settings['duelLayout']
    else if (b.dataset.ghosts) s.ghosts = b.dataset.ghosts as Settings['ghosts']
    else if (b.dataset.help) {
      const n = b.dataset.help
      s.help = s.help.includes(n) ? s.help.filter((x) => x !== n) : [...s.help, n]
    }
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
    else if (b.dataset.act === 'clear') clearing = true
    else if (b.dataset.act === 'clear-no') clearing = false
    else if (b.dataset.act === 'clear-yes') {
      clearing = false
      onClearScores?.()
    } else if (b.dataset.act === 'reset-yes') {
      confirming = false
      onReset()
    }
    onChange()
    render()
  }
  // Re-draw as the sync status changes (only while this screen is showing).
  if (cloud) cloud.onState = () => el.isConnected && !el.classList.contains('hidden') && !joining && render()
}
