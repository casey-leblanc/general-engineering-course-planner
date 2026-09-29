// Popovers, toasts and dialogs (ported from the two old planners, which each carried their own copy).
import { el, esc, icons } from './dom.js';

/* ---------------------------------------------------------------- toast */

export function toast(msg, actionLabel, onAction) {
  const host = el('toasts');
  const d = document.createElement('div');
  d.className = 'toast';
  d.setAttribute('role', 'status');
  d.innerHTML = `<span>${esc(msg)}</span>`;
  if (actionLabel) {
    const b = document.createElement('button');
    b.textContent = actionLabel;
    b.onclick = () => { if (onAction) onAction(); d.remove(); };
    d.appendChild(b);
  }
  host.appendChild(d);
  setTimeout(() => d.remove(), actionLabel ? 6500 : 2800);
}

/* ---------------------------------------------------------------- popover */

let popAnchor = null;
export function closePops() {
  document.querySelectorAll('.pop').forEach(p => p.remove());
  popAnchor = null;
  document.removeEventListener('pointerdown', popOutside);
  document.removeEventListener('keydown', popEsc);
}
function popOutside(e) {
  if (e.target.closest('.pop')) return;
  if (popAnchor && popAnchor.contains(e.target)) return;
  closePops();
}
function popEsc(e) { if (e.key === 'Escape') closePops(); }

/** Open a menu next to `anchor`; build(pop, close) fills it. Tapping the same anchor again closes it. */
export function openPop(anchor, build) {
  if (popAnchor === anchor) { closePops(); return; }
  closePops();
  const pop = document.createElement('div');
  pop.className = 'pop';
  build(pop, closePops);
  el('pop-host').appendChild(pop);
  const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = r.left, top = r.bottom + 6;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - 8 - pw;
  if (left < 8) left = 8;
  if (top + ph > window.innerHeight - 8 && r.top - 6 - ph > 8) top = r.top - 6 - ph;
  pop.style.left = `${left + window.scrollX}px`;
  pop.style.top = `${top + window.scrollY}px`;
  popAnchor = anchor;
  setTimeout(() => { document.addEventListener('pointerdown', popOutside); document.addEventListener('keydown', popEsc); }, 0);
}

export function menuItem(pop, { label, icon = '', danger = false, disabled = false, onClick }) {
  const b = document.createElement('button');
  b.className = `it${danger ? ' danger' : ''}`;
  b.disabled = disabled;
  b.innerHTML = icon + esc(label);
  b.onclick = onClick;
  pop.appendChild(b);
  return b;
}
export function menuLabel(pop, text) {
  const d = document.createElement('div');
  d.className = 'gl';
  d.textContent = text;
  pop.appendChild(d);
}
export const menuSep = pop => { const d = document.createElement('div'); d.className = 'sep'; pop.appendChild(d); };

/** A popover holding free-form HTML (rule details, requirement explanations). */
export function infoPop(anchor, html) {
  openPop(anchor, pop => { pop.classList.add('info-pop'); pop.innerHTML = html; });
}

/* ---------------------------------------------------------------- dialogs */

/** Generic dialog. Returns { root, close }. body is HTML; buttons: [{label, primary, action}] where action(root, close) may return false to stay open. */
export function dialog({ title, body, buttons, wide = false, className = '' }) {
  const ov = document.createElement('div');
  ov.className = `overlay ${className}`.trim();
  ov.innerHTML = `<div class="dialog${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <h3>${esc(title)}</h3>
    <div class="dlg-body">${body}</div>
    <div class="dlg-foot"></div></div>`;
  const foot = ov.querySelector('.dlg-foot');
  const escH = e => { if (e.key === 'Escape') close(); };
  const close = () => { ov.remove(); document.removeEventListener('keydown', escH); };
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = `btn2${b.primary ? ' primary' : ''}`;
    btn.textContent = b.label;
    btn.onclick = () => { if (b.action ? b.action(ov, close) !== false : true) close(); };
    if (b.cancel) btn.dataset.cancel = '1';
    foot.appendChild(btn);
  }
  document.addEventListener('keydown', escH);
  ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  document.body.appendChild(ov);
  const first = ov.querySelector('input,select,textarea');
  if (first) first.focus();
  return { root: ov, close };
}

export function confirmModal({ title = 'Are you sure?', message = '', confirmText, danger = false, alert = false, onConfirm }) {
  const root = document.createElement('div');
  root.className = 'modal-root';
  root.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h4 class="modal-title">${esc(title)}</h4><p class="modal-msg">${esc(message)}</p>
    <div class="modal-acts"><button type="button" class="modal-btn modal-cancel"${alert ? ' style="display:none"' : ''}>Cancel</button><button type="button" class="modal-btn modal-go${danger ? ' danger' : ''}">${esc(confirmText || (alert ? 'OK' : 'Confirm'))}</button></div></div>`;
  const go = root.querySelector('.modal-go'), cancel = root.querySelector('.modal-cancel');
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  const close = () => { document.removeEventListener('keydown', onKey); root.remove(); };
  cancel.onclick = close;
  go.onclick = () => { close(); if (onConfirm) onConfirm(); };
  root.addEventListener('click', e => { if (e.target === root) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(root);
  (alert ? go : cancel).focus();
}

export function noteDialog({ heading, current, onSave }) {
  dialog({
    title: 'Note',
    body: `<div style="font-size:12px;color:var(--ink-soft);margin:0 0 8px">${esc(heading)}</div>
      <div class="field"><label for="f-note">Comment <span class="faint">(shows in this course's details)</span></label>
      <textarea id="f-note" maxlength="200" rows="3" placeholder="e.g., also counts toward the minor">${esc(current)}</textarea></div>`,
    buttons: [
      { label: 'Cancel', cancel: true },
      ...(current ? [{ label: 'Remove', action: () => { onSave(''); } }] : []),
      { label: 'Save', primary: true, action: root => { onSave(root.querySelector('#f-note').value.trim()); } },
    ],
  });
}

/** Add or edit a custom course (or edit the credits / difficulty of a placeholder). */
export function courseDialog({ mode, initial = {}, onSave }) {
  const custom = mode === 'custom';
  const diff = initial.diff || 'normal';
  const { root } = dialog({
    title: custom ? (initial.code ? 'Edit course' : 'Add a custom course') : 'Edit details',
    body: `${custom ? `<div class="field"><label for="f-code">Course number</label><p class="field-err" id="err-code">This field is required.</p><input id="f-code" type="text" maxlength="16" placeholder="e.g., ENGR 3100" value="${esc(initial.code || '')}"></div>
      <div class="field"><label for="f-title">Course title <span class="faint">(optional)</span></label><input id="f-title" type="text" maxlength="60" placeholder="e.g., Introduction to Robotics" value="${esc(initial.title || '')}"></div>` : ''}
      <div class="field inline">
        <div><label for="f-cr">Credits</label><p class="field-err" id="err-cr">Enter 0 to 20.</p><input id="f-cr" type="number" min="0" max="20" step="1" value="${esc(initial.cr ?? 3)}"></div>
        <div><label for="f-diff">Difficulty</label><select id="f-diff">
          <option value="normal"${diff === 'normal' ? ' selected' : ''}>Typical</option><option value="hard"${diff === 'hard' ? ' selected' : ''}>Difficult</option><option value="hardest"${diff === 'hardest' ? ' selected' : ''}>Very difficult</option></select></div>
      </div>
      ${custom ? `<div class="field"><label for="f-note">Note <span class="faint">(optional, shows on the tile)</span></label><input id="f-note" type="text" maxlength="120" placeholder="e.g., counts toward the minor" value="${esc(initial.note || '')}"></div>
      <div class="faint small">Prerequisites and semester availability are not checked for custom courses.</div>` : ''}`,
    buttons: [
      { label: 'Cancel', cancel: true },
      {
        label: custom && !initial.code ? 'Add course' : 'Save', primary: true,
        action: ov => {
          const bad = (input, errId) => { input.classList.add('err'); ov.querySelector(`#${errId}`).classList.add('show'); input.focus(); return false; };
          const codeEl = ov.querySelector('#f-code'), crEl = ov.querySelector('#f-cr');
          if (codeEl) { codeEl.classList.remove('err'); ov.querySelector('#err-code').classList.remove('show'); }
          crEl.classList.remove('err'); ov.querySelector('#err-cr').classList.remove('show');
          if (codeEl && !codeEl.value.trim()) return bad(codeEl, 'err-code');
          const cr = parseInt(crEl.value, 10);
          if (!Number.isInteger(cr) || cr < 0 || cr > 20) return bad(crEl, 'err-cr');
          onSave({
            code: codeEl ? codeEl.value.trim() : undefined, title: custom ? ov.querySelector('#f-title').value.trim() : undefined,
            cr, diff: ov.querySelector('#f-diff').value, note: custom ? ov.querySelector('#f-note').value.trim() : undefined,
          });
        },
      },
    ],
  });
  return root;
}

export { icons };
