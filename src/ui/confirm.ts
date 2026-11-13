/**
 * "Köpa …?": every purchase asks first, for small fingers that tap everything. The Buy button
 * sits away from where the first tap was (bottom right of a centred box) and only works after a
 * short moment, so a quick double tap never buys by mistake.
 */
export interface Purchase {
  title: string
  detail?: string
  price: number
  coins: number
  onYes(): void
  onNo?(): void
}

const ARM_MS = 600

export function confirmPurchase(p: Purchase): void {
  document.querySelector('.confirm')?.remove()
  const after = p.coins - p.price
  const el = document.createElement('div')
  el.className = 'confirm'
  el.innerHTML = `
    <div class="confirm-box" role="dialog" aria-modal="true">
      <h2>${p.title}</h2>
      ${p.detail ? `<p>${p.detail}</p>` : ''}
      <div class="confirm-price"><b class="coin">●</b> ${p.price}</div>
      <p class="confirm-left">Du har ● ${p.coins} · kvar efteråt ● ${after}</p>
      <div class="actions">
        <button class="big blue" data-act="no">Avbryt</button>
        <button class="big" data-act="yes" disabled>Köp</button>
      </div>
    </div>`
  document.body.appendChild(el)
  const yes = el.querySelector<HTMLButtonElement>('[data-act="yes"]')!
  setTimeout(() => (yes.disabled = false), ARM_MS)
  const close = () => el.remove()
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button')
    // A tap outside the box cancels too.
    if (!b && e.target === el) {
      close()
      p.onNo?.()
      return
    }
    if (!b || b.disabled) return
    close()
    if (b.dataset.act === 'yes') p.onYes()
    else p.onNo?.()
  })
}
