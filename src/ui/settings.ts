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
import { showCode } from '../save/cloud'
import type { BackupEntry, CloudBackup } from '../save/backup'
import type { Restore } from '../save/restore'
import { screenInfo } from './viewport'
import { PLAYERS } from '../data/players'

const when = (t: number | null) => {
  if (!t) return ''
  const d = new Date(t)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** "Återskapa framsteg": give back roughly what was lost (only adds, never takes away). */
function restoreRows(state: 'closed' | 'form' | 'done', g: Restore): string {
  const head = 'Återskapa framsteg<br><small style="opacity:.7">Ge tillbaka ungefär det som försvann: lägger bara till, tar aldrig bort.</small>'
  if (state !== 'form') {
    return `<div><span>${head}${state === 'done' ? '<br><small style="color:#7be37b">Tillagt!</small>' : ''}</span><button class="small" data-act="give-open">Lägg till…</button></div>`
  }
  const num = (k: string, v: number, max: number, w = 90) => `<input type="number" inputmode="numeric" min="0" max="${max}" value="${v}" data-give="${k}" style="width:${w}px">`
  return `<div class="give"><span>${head}</span>
    <label>Mynt att lägga till ${num('coins', g.coins, 10000000, 110)}</label>
    <label>Klurbanor klarade (från första) ${num('klur', g.klur, 999)}</label>
    <label>Uppgraderingar på alla fordon minst nivå ${num('level', g.level, 15, 70)}</label>
    <label>Lås upp alla fordon och banor <input type="checkbox" data-give="unlockAll" ${g.unlockAll ? 'checked' : ''}></label>
    <span class="btns"><button class="small" data-act="give-yes" style="background:#2b9348">Lägg till</button><button class="small" data-act="give-no">Avbryt</button></span></div>`
}

/** What the backup rows are showing: the normal rows, typing a code, or the list to load from. */
interface BackupUi {
  joining: boolean
  joinError: boolean
  list: BackupEntry[] | null | 'loading' | 'error'
  confirm: BackupEntry | null
}

/** "Säkerhetskopior i molnet": start or use a code, this device's name and last backup, and loading a backup. */
function backupRows(b: CloudBackup | undefined, ui: BackupUi): string {
  if (!b?.available) return ''
  const code = b.code
  if (!code) {
    return `<div class="sync"><span>Säkerhetskopior i molnet<br><small style="opacity:.7">Varje enhet sparar sina framsteg (mynt, rekord, spöken) i molnet. Du väljer själv vilken du vill läsa in, inget synkas.</small></span>
      ${ui.joining
        ? `<span class="join"><input data-act="code" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="16">
           <button class="small" data-act="use-go">Använd</button><button class="small" data-act="use-no">Avbryt</button>
           ${ui.joinError ? '<small class="err">Koden fungerade inte</small>' : ''}</span>`
        : '<span class="btns"><button class="small" data-act="backup-start">Starta</button><button class="small" data-act="use">Använd kod från en annan enhet</button></span>'}</div>`
  }
  const status = { off: '', working: 'Sparar…', ok: `Sparad ${when(b.last)}`, error: 'Når inte molnet, försöker igen senare' }[b.state] || (b.last ? `Senast sparad ${when(b.last)}` : 'Inte sparad än')
  let list = ''
  if (ui.list === 'loading') list = '<div class="backups"><small>Hämtar…</small></div>'
  else if (ui.list === 'error') list = '<div class="backups"><small class="err">Når inte molnet just nu</small></div>'
  else if (ui.list) {
    list = `<div class="backups">${ui.list.map((e) => {
      const mine = e.device === b.device
      const asking = ui.confirm?.device === e.device
      return `<div class="backup ${mine ? 'mine' : ''}"><span><b>${e.name}</b>${mine ? ' <small>(den här enheten)</small>' : ''}<br>
        <small>${when(e.at)} · ● ${e.summary.coins} · ${e.summary.klur} klurbanor · rekord ${e.summary.best} m${e.summary.players.length ? ` · ${e.summary.players.join(', ')}` : ''}</small></span>
        ${asking
          ? `<span class="btns"><button class="small" data-act="load-yes" data-device="${e.device}" style="background:#e5383b">Ersätt mina framsteg</button><button class="small" data-act="load-no">Avbryt</button></span>`
          : `<button class="small" data-act="load" data-device="${e.device}">Läs in</button>`}</div>`
    }).join('') || '<small>Inga säkerhetskopior än</small>'}</div>`
  }
  return `<div class="sync"><span>Säkerhetskopior i molnet<br><small style="opacity:.7">Kod: <b class="code">${showCode(code)}</b> · ${status}<br>
      Den här enheten: <input data-act="devname" value="${b.name.replace(/"/g, '&quot;')}" maxlength="30" style="width:120px"></small></span>
    <span class="btns"><button class="small" data-act="backup-now">Spara nu</button><button class="small" data-act="backup-list">Läs in framsteg…</button><button class="small" data-act="backup-stop">Sluta</button></span></div>
    ${list}`
}

export function showSettings(el: HTMLElement, s: Settings, onChange: () => void, onReset: () => void, onBack: () => void, backup?: CloudBackup, onClearScores?: () => void, onRestored?: () => void, onRestore?: (r: Restore) => void): void {
  let confirming = false
  // Giving back lost progress (test mode only): closed, the form, or just added.
  let restoring: 'closed' | 'form' | 'done' = 'closed'
  const give: Restore = { coins: 0, unlockAll: false, klur: 0, level: 1 }
  let clearing = false
  const ui: BackupUi = { joining: false, joinError: false, list: null, confirm: null }
  const render = () => {
    el.innerHTML = `
      <div class="bar"><h2>Inställningar</h2><button class="small" data-act="back">Tillbaka</button></div>
      <div class="rows settings">
        <div><span>Ljud</span><span class="seg"><button data-sound="on" class="${s.sound ? 'on' : ''}">På</button><button data-sound="off" class="${s.sound ? '' : 'on'}">Av</button></span></div>
        <div><span>Musik</span><span class="seg"><button data-music="on" class="${s.music ? 'on' : ''}">På</button><button data-music="off" class="${s.music ? '' : 'on'}">Av</button></span></div>
        <div><span>Volym</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-act="volume" style="width:55%"></div>
        <div><span>Testläge<br><small style="opacity:.7">Visar Trimning: provkör alla fordon och banor med valfri trimning. Räknas inte.</small></span><span class="seg"><button data-test="on" class="${tuningEnabled() ? 'on' : ''}">På</button><button data-test="off" class="${tuningEnabled() ? '' : 'on'}">Av</button></span></div>
        ${tuningEnabled() && onRestore ? restoreRows(restoring, give) : ''}
        ${backupRows(backup, ui)}
        <div><span>Spöken</span><span class="seg"><button data-ghosts="all" class="${s.ghosts === 'all' ? 'on' : ''}">Alla</button><button data-ghosts="records" class="${s.ghosts === 'records' ? 'on' : ''}">Bara rekord</button><button data-ghosts="off" class="${s.ghosts === 'off' ? 'on' : ''}">Av</button></span></div>
        <div><span>Hjälp<br><small style="opacity:.7">Mer bränsle, snällare start och välter inte lika lätt</small></span><span class="seg">${PLAYERS.map((p) => `<button data-help="${p.name}" class="${s.help.includes(p.name) ? 'on' : ''}">${p.name}</button>`).join('')}</span></div>
        <div><span>Duell<br><small style="opacity:.7">Bredvid: vänster och höger halva. Mot varandra: iPaden står på höjden mellan er</small></span><span class="seg"><button data-duel="beside" class="${s.duelLayout === 'opposite' ? '' : 'on'}">Bredvid varandra</button><button data-duel="opposite" class="${s.duelLayout === 'opposite' ? 'on' : ''}">Mot varandra</button></span></div>
        <div><span>Pedaler</span><span class="seg"><button data-pedals="normal" class="${s.swapPedals ? '' : 'on'}">Broms vänster</button><button data-pedals="swap" class="${s.swapPedals ? 'on' : ''}">Gas vänster</button></span></div>
      </div>
      <div class="screeninfo">${screenInfo()}</div>
      <div class="actions">
        ${confirming
          ? `<span>Radera alla mynt, uppgraderingar och upplåsningar på den här enheten?</span><button class="small" data-act="reset-yes" style="background:#e5383b">Ja, nollställ</button><button class="small" data-act="reset-no">Avbryt</button>`
          : clearing
            ? '<span>Rensa alla topplistor, rekord och spöken? Mynt och uppgraderingar finns kvar.</span><button class="small" data-act="clear-yes" style="background:#e5383b">Ja, rensa</button><button class="small" data-act="clear-no">Avbryt</button>'
            : '<button class="small" data-act="clear">Rensa topplistor och spöken…</button><button class="small" data-act="reset">Nollställ framsteg…</button>'}
      </div>`
  }
  render()
  el.oninput = (e) => {
    const t = e.target as HTMLInputElement
    if (t.dataset.give) {
      const k = t.dataset.give as keyof Restore
      if (k === 'unlockAll') give.unlockAll = t.checked
      else give[k] = Math.max(0, Number(t.value) || 0)
      return
    }
    if (t.dataset.act === 'volume') {
      s.volume = Number(t.value)
      onChange()
    }
  }
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b) return
    if (b.dataset.act === 'give-open') restoring = 'form'
    else if (b.dataset.act === 'give-no') restoring = 'closed'
    else if (b.dataset.act === 'give-yes') {
      onRestore?.({ ...give })
      Object.assign(give, { coins: 0, unlockAll: false, klur: 0, level: 1 })
      restoring = 'done'
    } else if (b.dataset.sound) s.sound = b.dataset.sound === 'on'
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
    else if (b.dataset.act === 'backup-start') void backup?.start().then(render)
    else if (b.dataset.act === 'use') {
      ui.joining = true
      ui.joinError = false
    } else if (b.dataset.act === 'use-no') ui.joining = false
    else if (b.dataset.act === 'use-go') {
      const typed = el.querySelector<HTMLInputElement>('input[data-act="code"]')?.value ?? ''
      void backup?.use(typed).then((ok) => {
        ui.joinError = !ok
        if (ok) {
          ui.joining = false
          void backup.backupNow()
        } else backup.stop()
        render()
      })
      return
    } else if (b.dataset.act === 'backup-now') void backup?.backupNow()
    else if (b.dataset.act === 'backup-stop') {
      backup?.stop()
      ui.list = null
    } else if (b.dataset.act === 'backup-list') {
      ui.list = 'loading'
      ui.confirm = null
      void backup?.list().then((l) => {
        ui.list = l ?? 'error'
        render()
      })
    } else if (b.dataset.act === 'load' && Array.isArray(ui.list)) ui.confirm = ui.list.find((e) => e.device === b.dataset.device) ?? null
    else if (b.dataset.act === 'load-no') ui.confirm = null
    else if (b.dataset.act === 'load-yes' && b.dataset.device) {
      ui.list = 'loading'
      render()
      void backup?.load(b.dataset.device).then((ok) => {
        if (ok) onRestored?.()
        else {
          ui.list = 'error'
          render()
        }
      })
      return
    }
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
  // The device name is saved as it is typed.
  el.onchange = (e) => {
    const t = e.target as HTMLInputElement
    if (t.dataset.act === 'devname' && backup) backup.name = t.value
  }
  // Re-draw as the backup status changes (only while this screen is showing).
  if (backup) backup.onState = () => el.isConnected && !el.classList.contains('hidden') && !ui.joining && document.activeElement?.getAttribute('data-act') !== 'devname' && render()
}
