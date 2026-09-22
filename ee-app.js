"use strict";
/**
 * LSU Engineering Course Planner — Alternate Tab Version
 * Features:
 * - Electrical Engineering (B.S.E.E.) + Biological Engineering (B.S.B.E.)
 * - Double Major Mode (BE + EE Dual Degree with shared course resolution)
 * - Robotics Engineering Minor Integration & Tracking
 * - Degree Audit & Requirements Checklist Engine
 * - Exact MILP Auto-Arrange Course Optimizer (HiGHS)
 * - Extensible architecture for future LSU majors
 * - LSU Course Catalog search & direct course adder
 * - Prerequisite & semester availability validation
 */

(function () {
  /* ===== Configuration & Keys ===== */
  const STORAGE_KEY = 'lsuee.v2.state';
  const CONFIG = {
    maxYear: 6,
    termCap: 18,
    summerCap: 6,
    recHard: 2,
    recHardest: 1
  };

  /* Canonical term definitions */
  const SEASON_OFF = { fall: 0, spring: 1, summer: 2 };
  const SEASON_CODE = { fall: 'F', spring: 'S', summer: 'Su' };

  function termPos(k) {
    if (k === 'completed') return -1;
    const m = String(k).match(/^year(\d+)-(fall|spring|summer)$/);
    return m ? parseInt(m[1], 10) * 3 + SEASON_OFF[m[2]] : Infinity;
  }
  function termSeason(k) {
    const m = String(k).match(/-(fall|spring|summer)$/);
    return m ? SEASON_CODE[m[1]] : '';
  }
  function termLabel(k) {
    if (k === 'completed') return 'AP / Transfer Credit';
    const m = String(k).match(/^year(\d+)-(fall|spring|summer)$/);
    return m ? 'Year ' + m[1] + ' ' + m[2][0].toUpperCase() + m[2].slice(1) : k;
  }
  function defaultTerms() {
    return [
      'completed',
      'year1-fall', 'year1-spring',
      'year2-fall', 'year2-spring',
      'year3-fall', 'year3-spring',
      'year4-fall', 'year4-spring'
    ];
  }

  /* ===== State Model ===== */
  let state = {
    v: 2,
    major: 'EE',
    doubleMajor: true,       // Defaulting to double major (BE + EE) as requested!
    secondaryMajor: 'BE',
    minor: 'ROBOTICS',       // Defaulting to Robotics Engineering Minor!
    terms: defaultTerms(),
    plan: {},                 // id -> termKey
    done: {},                 // id -> termKey (if completed)
    tileMeta: {}              // id -> custom metadata / overrides
  };

  let persistArmed = false;
  let undoSnap = null;
  const expanded = new Set();
  let draggedId = null;
  let currentCatalogTargetTerm = null;

  function cloneState() {
    return JSON.parse(JSON.stringify(state));
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  function save() {
    if (!persistArmed) return;
    lsSet(STORAGE_KEY, JSON.stringify(state));
    const s = document.getElementById('saved-indicator');
    if (s) {
      s.textContent = 'Saved';
      s.classList.remove('saving');
    }
  }
  function touch() {
    persistArmed = true;
    save();
  }

  function planToPlacements(planArr) {
    const out = {};
    planArr.forEach(([tKey, ids]) => {
      ids.forEach(id => { out[id] = tKey; });
    });
    return out;
  }

  function getActiveMajorObj() {
    return LSU_MAJORS[state.major] || LSU_MAJORS.EE;
  }
  function getSecondaryMajorObj() {
    return state.doubleMajor ? (LSU_MAJORS[state.secondaryMajor] || LSU_MAJORS.BE) : null;
  }

  /* Load default state for given major or double major */
  function loadPlanPreset(presetType) {
    let presetArr;
    let terms = defaultTerms().slice();

    if (presetType === 'double') {
      state.major = 'EE';
      state.doubleMajor = true;
      state.secondaryMajor = 'BE';
      presetArr = PLAN_DOUBLE_MAJOR_DEFAULT;
      // Add Year 5 terms for double major
      if (!terms.includes('year5-fall')) terms.push('year5-fall');
      if (!terms.includes('year5-spring')) terms.push('year5-spring');
    } else if (presetType === 'BE') {
      state.major = 'BE';
      state.doubleMajor = false;
      presetArr = PLAN_BE_DEFAULT;
    } else {
      state.major = 'EE';
      state.doubleMajor = false;
      presetArr = PLAN_EE_DEFAULT;
    }

    state.terms = terms.sort((a, b) => termPos(a) - termPos(b));
    state.plan = planToPlacements(presetArr);
    state.done = {};
    state.tileMeta = {};
    touch();
    render();
    toast('Loaded ' + (presetType === 'double' ? 'BE + EE Double Major' : (state.major + ' Recommended')) + ' Plan');
  }

  /* ===== Tile Definition Resolver ===== */
  function tileDef(id) {
    const meta = (state && state.tileMeta && state.tileMeta[id]) || {};
    if (LSU_CATALOG[id]) {
      return Object.assign({ type: 'catalog', note: meta.note || '' }, LSU_CATALOG[id], meta);
    }
    if (PLACEHOLDERS[id]) {
      return Object.assign({ type: 'placeholder', note: meta.note || '' }, PLACEHOLDERS[id], meta);
    }
    if (meta.custom) {
      return {
        type: 'custom',
        code: meta.code || 'CUSTOM',
        title: meta.title || 'Custom Course',
        cr: parseInt(meta.cr, 10) || 3,
        dept: 'CUSTOM',
        sem: ['F','S','Su'],
        pre: [],
        co: [],
        diff: meta.diff || 'normal',
        note: meta.note || '',
        desc: 'Custom course added by student.'
      };
    }
    return {
      type: 'custom',
      code: meta.code || id,
      title: meta.title || id,
      cr: parseInt(meta.cr, 10) || 0,
      dept: 'GEN',
      sem: ['F','S','Su'],
      pre: [],
      co: [],
      diff: 'normal',
      note: meta.note || ''
    };
  }

  function isDone(id) {
    return !!(state.done && state.done[id]);
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function el(id) { return document.getElementById(id); }

  function formatReqList(list, sep = ', ') {
    if (!list || !list.length) return 'None';
    return list.map(item => {
      if (Array.isArray(item)) {
        return item.map(p => tileDef(p).code || p).join(' or ');
      }
      return tileDef(item).code || item;
    }).join(sep);
  }

  /* ===== Validation ===== */
  function validate(id, P) {
    const def = tileDef(id);
    const here = P[id];
    const myPos = termPos(here);

    if (here === 'completed') return { pre: true, co: true, sem: true, ok: true };

    let pre = true;
    if (def.pre && def.pre.length) {
      if (def.preAny) {
        pre = def.pre.some(p => {
          if (Array.isArray(p)) return p.some(cand => P[cand] !== undefined && termPos(P[cand]) < myPos);
          return P[p] !== undefined && termPos(P[p]) < myPos;
        });
      } else {
        for (const p of def.pre) {
          if (Array.isArray(p)) {
            const satisfied = p.some(cand => P[cand] !== undefined && termPos(P[cand]) < myPos);
            if (!satisfied) {
              pre = false;
              break;
            }
          } else {
            const pk = P[p];
            if (pk === undefined || termPos(pk) >= myPos) {
              pre = false;
              break;
            }
          }
        }
      }
    }

    let co = true;
    if (def.co && def.co.length) {
      if (def.coreqAny) {
        co = def.co.some(c => {
          if (Array.isArray(c)) return c.some(cand => P[cand] !== undefined && termPos(P[cand]) <= myPos);
          return P[c] !== undefined && termPos(P[c]) <= myPos;
        });
      } else {
        for (const c of def.co) {
          if (Array.isArray(c)) {
            const satisfied = c.some(cand => P[cand] !== undefined && termPos(P[cand]) <= myPos);
            if (!satisfied) {
              co = false;
              break;
            }
          } else {
            const ck = P[c];
            if (ck === undefined || termPos(ck) > myPos) {
              co = false;
              break;
            }
          }
        }
      }
    }

    const currentSeason = termSeason(here);
    const sem = def.sem && def.sem.includes(currentSeason);

    return { pre, co, sem, ok: pre && co && sem };
  }

  /* ===== Columns Projection ===== */
  function projectColumns() {
    const cols = state.terms.map(k => ({ key: k, tiles: [] }));
    const byKey = {};
    cols.forEach(c => { byKey[c.key] = c; });

    const allIds = new Set([...Object.keys(state.plan), ...Object.keys(state.done)]);
    allIds.forEach(id => {
      const term = isDone(id) ? state.done[id] : state.plan[id];
      if (!term) return;
      const col = byKey[term] || byKey['completed'];
      if (col) col.tiles.push(id);
    });

    cols.forEach(c => {
      c.tiles.sort((a, b) => {
        const da = tileDef(a), db = tileDef(b);
        return (da.code || '').localeCompare(db.code || '');
      });
    });

    return cols;
  }

  function colCredits(col) {
    return col.tiles.reduce((sum, id) => sum + tileDef(id).cr, 0);
  }

  /* ===== Major & Minor Badge Resolver ===== */
  function getMajorBadge(id) {
    const cat = getCourseMajorCategory(id, state);
    if (cat === 'robo') {
      return '<span class="t-major-badge robo" title="Robotics Engineering Minor">ROBO</span>';
    }
    if (!state.doubleMajor) {
      return '';
    }
    if (cat === 'both') {
      return '<span class="t-major-badge both" title="Required for both Biological & Electrical Engineering">BE + EE</span>';
    }
    if (cat === 'ee') {
      return '<span class="t-major-badge ee" title="Electrical Engineering Requirement">EE</span>';
    }
    if (cat === 'be') {
      return '<span class="t-major-badge be" title="Biological Engineering Requirement">BE</span>';
    }
    return '';
  }

  /* ===== Render Main Ledger ===== */
  function render() {
    const cols = projectColumns();
    const P = {};
    for (const c of cols) for (const id of c.tiles) P[id] = c.key;

    const ledger = el('ledger');
    ledger.innerHTML = cols.map(col => {
      const cr = colCredits(col);
      const isBank = col.key === 'completed';
      const season = termSeason(col.key);
      const cap = isBank ? null : (season === 'Su' ? CONFIG.summerCap : CONFIG.termCap);
      const hasTiles = col.tiles.length > 0;
      const termAllDone = hasTiles && col.tiles.every(id => isDone(id));
      const over = cap !== null && cr > cap && !termAllDone;

      let nH = 0, nHH = 0;
      for (const id of col.tiles) {
        const d = tileDef(id);
        if (d.diff === 'hard') nH++;
        else if (d.diff === 'hardest') nHH++;
      }
      const counts = isBank ? '' :
        ((nH > 0 ? `<span class="tcount avg" title="${nH} difficult course${nH > 1 ? 's' : ''}">${nH}</span>` : '') +
         (nHH > 0 ? `<span class="tcount most" title="${nHH} very difficult course${nHH > 1 ? 's' : ''}">${nHH}</span>` : ''));
      const countWrap = counts ? `<span class="tcounts">${counts}</span>` : '';

      const termChk = isBank
        ? `<span class="t-done term-chk on locked" title="AP / transfer credit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></span>`
        : `<button class="t-done term-chk${termAllDone ? ' on' : ''}" data-act="termdone" data-key="${col.key}"${hasTiles ? '' : ' disabled'} title="${termAllDone ? 'Uncheck semester' : 'Mark semester complete'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></button>`;

      const tiles = col.tiles.map(id => renderTile(id, P)).join('');

      return `<div class="col${isBank ? ' bank' : ''}${over ? ' over' : ''}" data-key="${col.key}">
        <div class="col-h">
          <div class="col-name">${termChk}${esc(termLabel(col.key))}</div>
          ${canRemoveTerm(col.key) ? `<button class="col-del" data-act="delterm" data-key="${col.key}" title="Remove this semester"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}
          <div class="col-meta">
            <span class="col-cr">${cr} ${cr === 1 ? 'credit' : 'credits'}</span>
            ${countWrap}
          </div>
        </div>
        <div class="col-b">
          ${tiles || (isBank ? '<div style="color:var(--ink-faint);font-size:12px;padding:6px 2px">Drag AP / transfer credit here</div>' : '')}
          <div class="col-acts-row">
            <button class="col-add col-add-catalog" data-act="add-catalog" data-key="${col.key}" title="Add a course from LSU course catalog"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>Add from Catalog</button>
            <button class="col-add col-add-custom" data-act="add-custom" data-key="${col.key}" title="Add a custom elective / course"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Custom</button>
          </div>
        </div>
      </div>`;
    }).join('');

    updateProgress(P);
    updateIssues(P);
    renderDegreeAudit();
    updateChevrons();
    syncMajorUI();
  }

  function renderTile(id, P) {
    const d = tileDef(id);
    const v = validate(id, P);
    const here = P[id];
    const isBank = here === 'completed';
    const done = isDone(id);
    const cls = (v.ok || done) ? '' : 'bad';
    const majorBadge = getMajorBadge(id);

    const diffBadge = d.diff === 'hardest'
      ? '<span class="t-dbadge most" title="Very difficult">very difficult</span>'
      : d.diff === 'hard'
      ? '<span class="t-dbadge avg" title="Difficult">difficult</span>'
      : '';

    const preTxt = formatReqList(d.pre);
    const coTxt = formatReqList(d.co, d.coreqAny ? ' or ' : ', ');
    const semTxt = d.sem ? d.sem.map(s => s === 'F' ? 'Fall' : s === 'S' ? 'Spring' : 'Summer').join(', ') : 'All terms';

    const chk = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>';
    const doneBox = isBank
      ? `<span class="t-done locked" title="AP / transfer credit">${chk}</span>`
      : `<button class="t-done${done ? ' on' : ''}" data-act="done" title="${done ? 'Completed' : 'Mark completed'}" aria-pressed="${done}">${chk}</button>`;

    const isOpen = expanded.has(id);

    const catalogRefLink = d.catalogRef
      ? `<div class="r cat-link"><a href="${d.catalogRef}" target="_blank" rel="noopener">LSU Course Catalog Entry ↗</a></div>`
      : '';

    const descEl = d.desc ? `<div class="r desc-text">${esc(d.desc)}</div>` : '';

    const detailEl = `
      <div class="r"><b${!v.pre ? ' class="v"' : ''}>Prerequisites:</b> ${esc(preTxt)}</div>
      <div class="r"><b${!v.co ? ' class="v"' : ''}>Corequisites:</b> ${esc(coTxt)}</div>
      <div class="r"><b${!v.sem ? ' class="v"' : ''}>Offered:</b> ${esc(semTxt)}</div>
      ${descEl}
      ${catalogRefLink}
    `;

    const noteEl = d.note ? `<div class="t-note">${esc(d.note)}</div>` : '';

    return `<div class="tile ${cls} ${d.type}${done ? ' done' : ''}" draggable="true" data-id="${id}">
      <div class="t-top">
        ${doneBox}
        <span class="t-code">${esc(d.code)}</span>
        <button class="t-menu" data-act="menu" title="Course actions"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button>
      </div>
      <div class="t-title">${esc(d.title || d.label || '')}</div>
      ${(majorBadge || diffBadge) ? `<div class="t-diffrow">${majorBadge}${diffBadge}</div>` : ''}
      ${noteEl}
      <div class="t-creditrow">
        <span class="t-credits">${d.cr} ${d.cr === 1 ? 'credit' : 'credits'}</span>
        <button class="t-details-link${isOpen ? ' open' : ''}" data-act="info" aria-expanded="${isOpen}">
          <span class="lk">${isOpen ? 'Hide details' : 'View details'}</span>
          <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>
        </button>
      </div>
      <div class="t-info${isOpen ? ' open' : ''}">${detailEl}</div>
    </div>`;
  }

  /* ===== Progress & Dual Degree Requirement Calculation ===== */
  function updateProgress(P) {
    const cols = projectColumns();
    let totalDone = 0;
    let totalPlanned = 0;

    for (const c of cols) {
      for (const id of c.tiles) {
        const cr = tileDef(id).cr;
        totalPlanned += cr;
        if (isDone(id)) totalDone += cr;
      }
    }

    // Tally specific degree requirements
    const activeMajor = getActiveMajorObj();
    const secondaryMajor = getSecondaryMajorObj();

    let eeDone = 0, eeTarget = LSU_MAJORS.EE.totalCredits;
    let beDone = 0, beTarget = LSU_MAJORS.BE.totalCredits;

    const allPlaced = new Set();
    cols.forEach(c => c.tiles.forEach(id => {
      if (isDone(id)) allPlaced.add(id);
    }));

    allPlaced.forEach(id => {
      const cr = tileDef(id).cr;
      const cat = getCourseMajorCategory(id);
      if (cat === 'both' || cat === 'ee') eeDone += cr;
      if (cat === 'both' || cat === 'be') beDone += cr;
    });

    const targetCredits = state.doubleMajor ? (eeTarget + 30) : activeMajor.totalCredits; // Double major typically adds ~30 distinct credits

    el('prog-num').textContent = totalDone;
    el('prog-target').textContent = targetCredits;

    const pct = v => Math.min(100, Math.round(v / targetCredits * 100));
    el('prog-done').style.width = pct(totalDone) + '%';
    el('prog-plan').style.width = pct(totalPlanned) + '%';

    // Dual Progress Meter
    const dualWrap = el('dual-prog-wrap');
    if (dualWrap) {
      if (state.doubleMajor) {
        dualWrap.style.display = 'flex';
        el('be-prog-txt').textContent = `${Math.min(beDone, beTarget)} / ${beTarget} cr`;
        el('ee-prog-txt').textContent = `${Math.min(eeDone, eeTarget)} / ${eeTarget} cr`;
        el('be-prog-bar').style.width = Math.min(100, Math.round(beDone / beTarget * 100)) + '%';
        el('ee-prog-bar').style.width = Math.min(100, Math.round(eeDone / eeTarget * 100)) + '%';
      } else {
        dualWrap.style.display = 'none';
      }
    }
  }

  /* ===== Issues Panel ===== */
  function updateIssues(P) {
    const issues = [];
    for (const c of projectColumns()) {
      for (const id of c.tiles) {
        const d = tileDef(id);
        const v = validate(id, P);
        if (!v.ok && !isDone(id)) {
          const reasons = [];
          if (!v.pre) reasons.push('prerequisite not completed earlier (grade C or better required)');
          if (!v.co) reasons.push('corequisite must be taken prior or concurrently');
          if (!v.sem) reasons.push('not offered in ' + (termSeason(c.key) === 'F' ? 'Fall' : termSeason(c.key) === 'S' ? 'Spring' : 'Summer'));
          issues.push({
            type: 'err',
            id,
            key: c.key,
            title: (d.code ? d.code + ' — ' : '') + d.title,
            where: termLabel(c.key),
            msg: reasons.join('; ')
          });
        }
      }
      if (c.key !== 'completed') {
        const season = termSeason(c.key);
        const cap = season === 'Su' ? CONFIG.summerCap : CONFIG.termCap;
        const cr = colCredits(c);
        const termAllDone = c.tiles.length > 0 && c.tiles.every(id => isDone(id));
        if (cr > cap && !termAllDone) {
          issues.push({
            type: 'err',
            key: c.key,
            title: termLabel(c.key),
            where: termLabel(c.key),
            msg: `${cr} credits exceeds the recommended ${cap}-credit maximum`
          });
        }
      }
    }

    const pill = el('ipill');
    const ib = el('ib');
    if (!issues.length) {
      pill.className = 'p clear';
      pill.textContent = 'All clear';
      ib.innerHTML = '<div style="padding:10px;color:var(--ink-soft);font-size:12.5px">No prerequisite, credit load, or semester scheduling problems detected.</div>';
      return;
    }
    pill.className = 'p bad';
    pill.textContent = issues.length + (issues.length === 1 ? ' item' : ' items');
    ib.innerHTML = issues.map(it => `<div class="iss" data-key="${it.key}"${it.id ? ` data-id="${it.id}"` : ''}>
      <span class="ic ${it.type}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg></span>
      <span class="tx">${esc(it.title)}<br><span class="w">${esc(it.where)} — ${esc(it.msg)}</span></span>
    </div>`).join('');
  }

  /* ===== Degree Audit & Requirements Checklist ===== */
  function renderDegreeAudit() {
    const sec = el('degree-audit-section');
    if (!sec) return;
    const body = el('audit-body');
    const pill = el('audit-overall-pill');
    const countEl = el('audit-summary-count');
    if (!body) return;

    const reports = auditDegreeRequirements(state.plan, state.done, state);

    let totalItems = 0, totalDone = 0, totalPlanned = 0, totalMissing = 0;
    reports.forEach(rep => {
      rep.categories.forEach(cat => {
        cat.items.forEach(it => {
          totalItems++;
          if (it.status === 'completed') totalDone++;
          else if (it.status === 'planned') totalPlanned++;
          else totalMissing++;
        });
      });
    });

    if (pill) {
      if (totalMissing === 0) {
        pill.className = 'audit-badge-status all-clear';
        pill.textContent = `✓ All Requirements Satisfied`;
      } else {
        pill.className = 'audit-badge-status pending';
        pill.textContent = `${totalMissing} Missing Requirement${totalMissing > 1 ? 's' : ''}`;
      }
    }

    if (countEl) {
      countEl.innerHTML = `<b>${totalDone}</b> Completed · <b>${totalPlanned}</b> Planned · <b style="${totalMissing > 0 ? 'color:var(--bad-text, #dc2626)' : ''}">${totalMissing}</b> Missing`;
    }

    body.innerHTML = reports.map(rep => {
      const repTitle = rep.major
        ? `${rep.major} Degree Requirements (B.S. — ${rep.targetCredits} cr)`
        : `${rep.minor} (21 cr)`;

      const catCards = rep.categories.map(cat => {
        const catDone = cat.items.filter(it => it.status === 'completed').length;
        const catPlanned = cat.items.filter(it => it.status === 'planned').length;
        const catMissing = cat.items.filter(it => it.status === 'missing').length;
        const isSatisfied = cat.customStatus !== undefined ? cat.customStatus : (catMissing === 0);

        const rows = cat.items.map(it => {
          let statusHtml = '';
          let actionHtml = '';

          if (it.status === 'completed') {
            statusHtml = `<span class="it-status done" title="Course completed in ${termLabel(it.term)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg> Done (${termLabel(it.term)})</span>`;
          } else if (it.status === 'planned') {
            statusHtml = `<button class="it-status planned" data-locate-term="${it.term}" data-locate-id="${it.id}" title="Click to view course in ${termLabel(it.term)}">⏳ In ${esc(termLabel(it.term))}</button>`;
          } else {
            statusHtml = `<span class="it-status missing">⚠ Missing</span>`;
            actionHtml = `<button class="audit-add-quick-btn" data-add-id="${it.addId || it.id}" data-name="${esc(it.name)}" title="Add ${esc(it.name)} to your plan">+ Add to Plan</button>`;
          }

          return `<div class="audit-item-row ${it.status}">
            <div class="audit-item-main">
              <span class="audit-item-name" title="${esc(it.name)}">${esc(it.name)}</span>
              <span class="audit-item-cr">${it.cr} cr</span>
            </div>
            <div class="audit-item-side">
              ${statusHtml}
              ${actionHtml}
            </div>
          </div>`;
        }).join('');

        return `<div class="audit-cat-card ${isSatisfied ? 'fulfilled' : 'needs-action'}">
          <div class="audit-cat-h">
            <div class="audit-cat-name">${esc(cat.name)}</div>
            <span class="audit-cat-pill ${isSatisfied ? 'good' : 'warn'}">
              ${isSatisfied ? '✓ Fulfilled' : `${catMissing} missing`}
            </span>
          </div>
          ${cat.desc ? `<div class="audit-cat-desc">${esc(cat.desc)}</div>` : ''}
          <div class="audit-items-list">${rows}</div>
        </div>`;
      }).join('');

      return `<div class="audit-report">
        <div class="audit-report-title"><h3>${esc(repTitle)}</h3></div>
        <div class="audit-cats-grid">${catCards}</div>
      </div>`;
    }).join('');
  }

  function findBestTermForQuickAdd(cid) {
    const cols = projectColumns();
    const cr = tileDef(cid).cr || 3;
    for (const c of cols) {
      if (c.key === 'completed' || termSeason(c.key) === 'Su') continue;
      if (colCredits(c) + cr <= CONFIG.termCap) return c.key;
    }
    return state.terms.find(t => t !== 'completed' && termSeason(t) !== 'Su') || 'year1-fall';
  }

  function wireAuditSection() {
    const hdr = el('audit-toggle-header');
    if (hdr) {
      hdr.onclick = e => {
        if (e.target.closest('button') && e.target.id !== 'audit-collapse-toggle') return;
        el('degree-audit-section').classList.toggle('collapsed');
      };
    }

    const body = el('audit-body');
    if (body) {
      body.addEventListener('click', e => {
        const addBtn = e.target.closest('.audit-add-quick-btn');
        if (addBtn) {
          const addId = addBtn.dataset.addId;
          const targetTerm = findBestTermForQuickAdd(addId);
          state.plan[addId] = targetTerm;
          delete state.done[addId];
          touch();
          render();
          toast(`Added ${tileDef(addId).code || addId} to ${termLabel(targetTerm)}`, 'Auto-arrange', autoArrange);
          return;
        }

        const locateBtn = e.target.closest('[data-locate-term]');
        if (locateBtn) {
          locate(locateBtn.dataset.locateTerm, locateBtn.dataset.locateId);
          return;
        }
      });
    }
  }

  /* ===== Semesters Management ===== */
  function canRemoveTerm(key) {
    if (key === 'completed') return false;
    const defs = new Set(['year1-fall','year1-spring','year2-fall','year2-spring','year3-fall','year3-spring','year4-fall','year4-spring']);
    return !defs.has(key);
  }

  function addTerm(key) {
    if (state.terms.includes(key)) return;
    state.terms.push(key);
    state.terms.sort((a, b) => termPos(a) - termPos(b));
    touch();
    render();
    toast(`${termLabel(key)} added`);
  }

  function removeTerm(key) {
    if (!canRemoveTerm(key)) return;
    undoSnap = cloneState();
    const remaining = state.terms.filter(k => k !== key);
    const targetKey = remaining[remaining.length - 1] || 'completed';

    // Move tiles from removed semester
    for (const id in state.plan) if (state.plan[id] === key) state.plan[id] = targetKey;
    for (const id in state.done) if (state.done[id] === key) state.done[id] = targetKey;

    state.terms = remaining;
    touch();
    render();
    toast(`Removed ${termLabel(key)}`, 'Undo', () => {
      if (undoSnap) { state = undoSnap; undoSnap = null; touch(); render(); }
    });
  }

  /* ===== Tile Moving & Toggling ===== */
  function moveTile(id, toKey) {
    const wasDone = isDone(id);
    if (toKey === 'completed') {
      state.done[id] = 'completed';
    } else if (wasDone) {
      state.done[id] = toKey;
    } else {
      delete state.done[id];
      state.plan[id] = toKey;
    }
    touch();
    render();
  }

  function toggleDone(id) {
    if (isDone(id)) {
      delete state.done[id];
    } else {
      state.done[id] = state.plan[id] || 'year1-fall';
    }
    touch();
    render();
  }

  function toggleTermDone(key) {
    const col = projectColumns().find(c => c.key === key);
    if (!col || !col.tiles.length) return;
    const allDone = col.tiles.every(id => isDone(id));
    col.tiles.forEach(id => {
      if (allDone) delete state.done[id];
      else state.done[id] = key;
    });
    touch();
    render();
  }

  function deleteTile(id) {
    const d = tileDef(id);
    undoSnap = cloneState();
    delete state.plan[id];
    delete state.done[id];
    if (state.tileMeta[id]) delete state.tileMeta[id];
    touch();
    render();
    toast('Removed ' + (d.code || d.title), 'Undo', () => {
      if (undoSnap) { state = undoSnap; undoSnap = null; touch(); render(); }
    });
  }

  /* ===== Popover Helper ===== */
  let popAnchor = null;
  function closeAllPops() {
    document.querySelectorAll('.pop').forEach(p => p.remove());
    popAnchor = null;
    document.removeEventListener('pointerdown', popOutside);
    document.removeEventListener('keydown', popEsc);
  }
  function popOutside(e) {
    if (e.target.closest('.pop')) return;
    if (popAnchor && popAnchor.contains(e.target)) return;
    closeAllPops();
  }
  function popEsc(e) { if (e.key === 'Escape') closeAllPops(); }

  function openPop(anchor, build) {
    if (popAnchor === anchor) { closeAllPops(); return; }
    closeAllPops();
    const pop = document.createElement('div');
    pop.className = 'pop';
    build(pop, closeAllPops);
    el('pop-host').appendChild(pop);
    const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = r.left, top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - 8 - pw;
    if (left < 8) left = 8;
    if (top + ph > window.innerHeight - 8 && r.top - 6 - ph > 8) top = r.top - 6 - ph;
    pop.style.left = (left + window.scrollX) + 'px';
    pop.style.top = (top + window.scrollY) + 'px';
    popAnchor = anchor;
    setTimeout(() => {
      document.addEventListener('pointerdown', popOutside);
      document.addEventListener('keydown', popEsc);
    }, 0);
  }

  function openTileMenu(anchor, id) {
    openPop(anchor, (pop, close) => {
      const d = tileDef(id);
      const cur = isDone(id) ? state.done[id] : state.plan[id];

      const lbl = document.createElement('div');
      lbl.className = 'gl';
      lbl.textContent = 'Move to';
      pop.appendChild(lbl);

      const sc = document.createElement('div');
      sc.className = 'sc';
      state.terms.forEach(k => {
        if (k === cur) return;
        const b = document.createElement('button');
        b.className = 'it';
        b.textContent = termLabel(k);
        b.onclick = () => { moveTile(id, k); close(); toast('Moved to ' + termLabel(k)); };
        sc.appendChild(b);
      });
      pop.appendChild(sc);

      const sep = document.createElement('div');
      sep.className = 'sep';
      pop.appendChild(sep);

      const nb = document.createElement('button');
      nb.className = 'it';
      nb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' + (d.note ? 'Edit note…' : 'Add note…');
      nb.onclick = () => { close(); openNoteDialog(id); };
      pop.appendChild(nb);

      const del = document.createElement('button');
      del.className = 'it danger';
      del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>Delete from plan';
      del.onclick = () => { close(); deleteTile(id); };
      pop.appendChild(del);
    });
  }

  function openNoteDialog(id) {
    const meta = state.tileMeta[id] || (state.tileMeta[id] = {});
    const d = tileDef(id);
    const cur = meta.note || '';

    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">
      <h3>Course Note</h3>
      <div class="dlg-body">
        <div style="font-size:12px;color:var(--ink-soft);margin-bottom:8px">${esc((d.code ? d.code + ' — ' : '') + d.title)}</div>
        <div class="field">
          <label>Comment / Note</label>
          <textarea id="f-note" maxlength="200" rows="3" placeholder="e.g., counting toward double major requirement">${esc(cur)}</textarea>
        </div>
      </div>
      <div class="dlg-foot">
        <button class="btn2" data-x="cancel">Cancel</button>
        ${cur ? '<button class="btn2" data-x="remove">Remove</button>' : ''}
        <button class="btn2 primary" data-x="ok">Save</button>
      </div>
    </div>`;
    document.body.appendChild(ov);

    const close = () => ov.remove();
    ov.querySelector('[data-x="cancel"]').onclick = close;
    const rm = ov.querySelector('[data-x="remove"]');
    if (rm) rm.onclick = () => { delete meta.note; touch(); render(); close(); };
    ov.querySelector('[data-x="ok"]').onclick = () => {
      const val = ov.querySelector('#f-note').value.trim();
      if (val) meta.note = val; else delete meta.note;
      touch(); render(); close();
    };
  }

  /* ===== Custom Course Dialog ===== */
  function openCustomCourseDialog(termKey) {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">
      <h3>Add Custom Course</h3>
      <div class="dlg-body">
        <div class="field">
          <label>Course Number / Code</label>
          <input id="cf-code" type="text" maxlength="16" placeholder="e.g., ENGR 3100">
        </div>
        <div class="field">
          <label>Course Title</label>
          <input id="cf-title" type="text" maxlength="60" placeholder="e.g., Applied Mechatronics">
        </div>
        <div class="field inline">
          <div>
            <label>Credits</label>
            <input id="cf-cr" type="number" min="1" max="12" value="3">
          </div>
          <div>
            <label>Difficulty</label>
            <select id="cf-diff">
              <option value="normal">Typical</option>
              <option value="hard">Difficult</option>
              <option value="hardest">Very difficult</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Note (optional)</label>
          <input id="cf-note" type="text" maxlength="120" placeholder="e.g., technical elective approval">
        </div>
      </div>
      <div class="dlg-foot">
        <button class="btn2" data-x="cancel">Cancel</button>
        <button class="btn2 primary" data-x="ok">Add Course</button>
      </div>
    </div>`;
    document.body.appendChild(ov);

    const close = () => ov.remove();
    ov.querySelector('[data-x="cancel"]').onclick = close;
    ov.querySelector('[data-x="ok"]').onclick = () => {
      const code = ov.querySelector('#cf-code').value.trim();
      if (!code) { alert('Please enter a course code'); return; }
      const title = ov.querySelector('#cf-title').value.trim();
      const cr = parseInt(ov.querySelector('#cf-cr').value, 10) || 3;
      const diff = ov.querySelector('#cf-diff').value;
      const note = ov.querySelector('#cf-note').value.trim();

      const nid = 'c-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
      state.tileMeta[nid] = { custom: true, code, title, cr, diff, note };
      state.plan[nid] = termKey || 'year1-fall';
      touch();
      render();
      close();
      toast(`Added ${code}`);
    };
  }

  /* ===== LSU Course Catalog Drawer / Modal ===== */
  function openCatalogModal(preselectedTerm) {
    currentCatalogTargetTerm = preselectedTerm || state.terms.find(t => t !== 'completed') || 'year1-fall';
    let currentDeptFilter = 'ALL';
    let currentQuery = '';

    const modal = document.createElement('div');
    modal.className = 'overlay catalog-overlay';
    modal.innerHTML = `
      <div class="dialog catalog-dialog" role="dialog" aria-modal="true">
        <div class="cat-modal-h">
          <div class="cat-modal-title">
            <h3>LSU Course Catalog</h3>
            <p class="cat-sub">Search and add courses from Electrical Engineering, Biological Engineering, Math, Sciences, and General Education.</p>
          </div>
          <button class="cat-close-btn" data-x="close"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>

        <div class="cat-controls">
          <div class="cat-search-box">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input id="cat-search-input" type="text" placeholder="Search by course code or keyword (e.g. EE 2120, circuits, biology, calculus)...">
          </div>
          <div class="cat-filter-chips">
            <button class="filter-chip on" data-dept="ALL">All Courses</button>
            <button class="filter-chip" data-dept="EE">Electrical Eng (EE)</button>
            <button class="filter-chip" data-dept="BE">Biological Eng (BE)</button>
            <button class="filter-chip" data-dept="ROBO">Robotics Minor</button>
            <button class="filter-chip" data-dept="MATH">Mathematics</button>
            <button class="filter-chip" data-dept="PHYS_CHEM">Physics &amp; Chemistry</button>
            <button class="filter-chip" data-dept="GENED">General Education</button>
          </div>
        </div>

        <div class="cat-list-wrap" id="cat-list"></div>

        <div class="cat-modal-foot">
          <span class="cat-foot-note">Courses and descriptions directly referenced from the <strong>LSU General Catalog</strong> &amp; <strong>College of Engineering Flowcharts</strong>.</span>
          <button class="btn2 primary" data-x="close">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelectorAll('[data-x="close"]').forEach(b => b.onclick = close);

    const searchInput = modal.querySelector('#cat-search-input');
    searchInput.focus();

    function renderCatalogList() {
      const listEl = modal.querySelector('#cat-list');
      const q = currentQuery.toLowerCase().trim();

      const courses = Object.keys(LSU_CATALOG).map(id => ({ id, ...LSU_CATALOG[id] }));

      // Also include common placeholders
      Object.keys(PLACEHOLDERS).forEach(pid => {
        courses.push({ id: pid, ...PLACEHOLDERS[pid], isPlaceholder: true });
      });

      const filtered = courses.filter(c => {
        // Department filter
        if (currentDeptFilter === 'EE' && c.dept !== 'EE') return false;
        if (currentDeptFilter === 'BE' && c.dept !== 'BE' && c.dept !== 'SCI' && !c.id.startsWith('BE') && !c.id.startsWith('BIOL')) return false;
        if (currentDeptFilter === 'ROBO' && !c.isRobotics && !c.id.startsWith('ENGR3100') && !c.id.startsWith('ENGR41') && !c.id.startsWith('ENGR42') && c.id !== 'ME2543' && !['EE3530','EE3755','BE3320','CE2460'].includes(c.id)) return false;
        if (currentDeptFilter === 'MATH' && c.dept !== 'MATH' && c.dept !== 'CSC') return false;
        if (currentDeptFilter === 'PHYS_CHEM' && c.dept !== 'PHYS' && c.dept !== 'CHEM') return false;
        if (currentDeptFilter === 'GENED' && c.dept !== 'GENED' && c.dept !== 'ENGL') return false;

        // Search query filter
        if (q) {
          const matchCode = (c.code || '').toLowerCase().includes(q);
          const matchTitle = (c.title || c.label || '').toLowerCase().includes(q);
          const matchDesc = (c.desc || '').toLowerCase().includes(q);
          if (!matchCode && !matchTitle && !matchDesc) return false;
        }
        return true;
      });

      if (!filtered.length) {
        listEl.innerHTML = '<div class="cat-empty">No matching courses found in the catalog.</div>';
        return;
      }

      listEl.innerHTML = filtered.map(c => {
        const inPlanTerm = state.done[c.id] || state.plan[c.id];
        const isPlaced = inPlanTerm !== undefined;
        const majorBadge = getMajorBadge(c.id);

        const preTxt = formatReqList(c.pre);
        const semTxt = c.sem ? c.sem.map(s => s === 'F' ? 'Fall' : s === 'S' ? 'Spring' : 'Summer').join(', ') : 'All';

        const termOptions = state.terms.map(tk => `
          <option value="${tk}"${tk === currentCatalogTargetTerm ? ' selected' : ''}>${termLabel(tk)}</option>
        `).join('');

        return `
          <div class="cat-card${isPlaced ? ' in-plan' : ''}">
            <div class="cat-card-h">
              <span class="cat-card-code">${esc(c.code)}</span>
              <span class="cat-card-cr">${c.cr} ${c.cr === 1 ? 'credit' : 'credits'}</span>
              ${majorBadge}
              ${c.diff === 'hardest' ? '<span class="t-dbadge most">very difficult</span>' : c.diff === 'hard' ? '<span class="t-dbadge avg">difficult</span>' : ''}
              ${isPlaced ? `<span class="cat-inplan-badge">✓ in ${esc(termLabel(inPlanTerm))}</span>` : ''}
            </div>
            <div class="cat-card-title">${esc(c.title || c.label)}</div>
            ${c.desc ? `<p class="cat-card-desc">${esc(c.desc)}</p>` : ''}
            <div class="cat-card-reqs">
              <span><b>Prereqs:</b> ${esc(preTxt)}</span>
              <span><b>Offered:</b> ${esc(semTxt)}</span>
            </div>
            <div class="cat-card-acts">
              <select class="cat-term-sel" data-id="${c.id}">${termOptions}</select>
              <button class="btn-cat-add" data-id="${c.id}">${isPlaced ? 'Move to Semester' : '+ Add to Plan'}</button>
              ${c.catalogRef ? `<a class="cat-lsu-link" href="${c.catalogRef}" target="_blank" rel="noopener">Catalog ↗</a>` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Wire Add Buttons
      listEl.querySelectorAll('.btn-cat-add').forEach(btn => {
        btn.onclick = () => {
          const cid = btn.dataset.id;
          const sel = listEl.querySelector(`.cat-term-sel[data-id="${cid}"]`);
          const targetTerm = sel ? sel.value : currentCatalogTargetTerm;
          currentCatalogTargetTerm = targetTerm;

          state.plan[cid] = targetTerm;
          delete state.done[cid];
          touch();
          render();
          renderCatalogList();
          toast(`Added ${tileDef(cid).code} to ${termLabel(targetTerm)}`);
        };
      });
    }

    renderCatalogList();

    // Event listeners
    searchInput.addEventListener('input', e => {
      currentQuery = e.target.value;
      renderCatalogList();
    });

    modal.querySelectorAll('.filter-chip').forEach(chip => {
      chip.onclick = () => {
        modal.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('on'));
        chip.classList.add('on');
        currentDeptFilter = chip.dataset.dept;
        renderCatalogList();
      };
    });
  }

  /* ===== Major Switcher & Double Major UI Sync ===== */
  function syncMajorUI() {
    const sel = el('primary-major-select');
    if (sel) sel.value = state.major;

    const dmChk = el('double-major-toggle');
    if (dmChk) dmChk.checked = state.doubleMajor;

    const secWrap = el('sec-major-wrap');
    if (secWrap) secWrap.style.display = state.doubleMajor ? 'flex' : 'none';

    const secSel = el('secondary-major-select');
    if (secSel) secSel.value = state.secondaryMajor;

    const minSel = el('minor-select');
    if (minSel) minSel.value = state.minor || 'none';
  }

  function setMajor(primary, isDouble, secondary) {
    state.major = primary;
    state.doubleMajor = isDouble;
    if (isDouble && secondary) state.secondaryMajor = secondary;
    touch();
    render();
  }

  /* ===== Drag & Drop Delegation ===== */
  function wireDnD() {
    const ledger = el('ledger');
    ledger.addEventListener('dragstart', e => {
      const t = e.target.closest('.tile');
      if (!t) return;
      draggedId = t.dataset.id;
      t.classList.add('drag');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', draggedId); } catch (_) {}
    });
    ledger.addEventListener('dragend', () => {
      draggedId = null;
      ledger.querySelectorAll('.tile.drag').forEach(t => t.classList.remove('drag'));
      ledger.querySelectorAll('.col.drop').forEach(c => c.classList.remove('drop'));
    });
    ledger.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const c = e.target.closest('.col');
      ledger.querySelectorAll('.col.drop').forEach(x => { if (x !== c) x.classList.remove('drop'); });
      if (c) c.classList.add('drop');
    });
    ledger.addEventListener('drop', e => {
      e.preventDefault();
      const c = e.target.closest('.col');
      if (c && draggedId) moveTile(draggedId, c.dataset.key);
    });
  }

  /* ===== Click Delegations ===== */
  function wireClicks() {
    el('ledger').addEventListener('click', e => {
      const del = e.target.closest('[data-act="delterm"]');
      if (del) { removeTerm(del.dataset.key); return; }

      const addCat = e.target.closest('[data-act="add-catalog"]');
      if (addCat) { openCatalogModal(addCat.dataset.key); return; }

      const addCustom = e.target.closest('[data-act="add-custom"]');
      if (addCustom) { openCustomCourseDialog(addCustom.dataset.key); return; }

      const dn = e.target.closest('[data-act="done"]');
      if (dn) { toggleDone(dn.closest('.tile').dataset.id); return; }

      const tdn = e.target.closest('[data-act="termdone"]');
      if (tdn) { toggleTermDone(tdn.dataset.key); return; }

      const mb = e.target.closest('[data-act="menu"]');
      if (mb) { openTileMenu(mb, mb.closest('.tile').dataset.id); return; }

      const ib = e.target.closest('[data-act="info"]');
      if (ib) {
        const tile = ib.closest('.tile'), tid = tile.dataset.id;
        const open = expanded.has(tid) ? (expanded.delete(tid), false) : (expanded.add(tid), true);
        tile.querySelector('.t-info').classList.toggle('open', open);
        ib.classList.toggle('open', open);
        const lk = ib.querySelector('.lk');
        if (lk) lk.textContent = open ? 'Hide details' : 'View details';
        ib.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }
    });

    el('ib').addEventListener('click', e => {
      const row = e.target.closest('.iss');
      if (!row) return;
      locate(row.dataset.key, row.dataset.id);
    });
  }

  function locate(key, id) {
    const led = el('ledger'), col = led.querySelector(`.col[data-key="${key}"]`);
    if (col && col.scrollIntoView) col.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    if (id) {
      const t = led.querySelector(`.tile[data-id="${id}"]`);
      if (t) { t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1200); }
    }
  }

  function updateChevrons() {
    const led = el('ledger'), max = led.scrollWidth - led.clientWidth;
    el('sc-left').disabled = led.scrollLeft <= 2;
    el('sc-right').disabled = led.scrollLeft >= max - 2;
  }

  /* Toast Notification */
  function toast(msg, actionLabel, onAction) {
    const host = el('toasts'), d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = `<span>${esc(msg)}</span>`;
    if (actionLabel) {
      const b = document.createElement('button');
      b.textContent = actionLabel;
      b.onclick = () => { onAction && onAction(); d.remove(); };
      d.appendChild(b);
    }
    host.appendChild(d);
    setTimeout(() => d.remove(), actionLabel ? 6000 : 2600);
  }

  /* Share Link */
  function shareLink() {
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
    const url = location.origin + location.pathname + '?plan=' + encodeURIComponent(payload);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => toast('Link copied to clipboard'));
    } else {
      prompt('Copy this link:', url);
    }
  }

  /* Reset Confirmation */
  function resetPlan() {
    if (confirm('Reset to the default recommended plan? This will clear any custom changes.')) {
      loadPlanPreset(state.doubleMajor ? 'double' : state.major);
    }
  }

  /* Add Semester Popover */
  function openAddTermMenu(anchor) {
    openPop(anchor, (pop, close) => {
      const available = [
        'year1-summer',
        'year2-summer',
        'year3-summer',
        'year4-summer',
        'year5-fall',
        'year5-spring',
        'year5-summer',
        'year6-fall',
        'year6-spring'
      ].filter(k => !state.terms.includes(k));

      const lbl = document.createElement('div');
      lbl.className = 'gl';
      lbl.textContent = available.length ? 'Add a Semester' : 'All semesters already added';
      pop.appendChild(lbl);

      const sc = document.createElement('div');
      sc.className = 'sc';
      available.forEach(k => {
        const b = document.createElement('button');
        b.className = 'it';
        b.textContent = termLabel(k);
        b.onclick = () => { addTerm(k); close(); };
        sc.appendChild(b);
      });
      pop.appendChild(sc);
    });
  }

  /* ===== Auto-Arrange (Exact MILP Optimizer via HiGHS) ===== */
  const DIFF_FACTOR = { normal: 1, hard: 1.5, hardest: 2 };
  const SUMMER_SCHEDULABLE = { MA: 1, MJ: 1, JA: 1, BOTH: 1 };

  function effFactor(id, diff) {
    return DIFF_FACTOR[diff] || 1;
  }

  function buildScenario() {
    const sorted = state.terms.slice().sort((a, b) => termPos(a) - termPos(b));
    const rankOf = {}; sorted.forEach((k, i) => { rankOf[k] = i; });

    const movable = [], movCnt = {};
    const allPlanIds = Object.keys(state.plan);

    allPlanIds.forEach(id => {
      if (isDone(id)) return;
      const d = tileDef(id);
      const summer = SUMMER_SCHEDULABLE[d.summer] ? d.summer : null;
      let seasons = (d.sem || ['F', 'S']).slice();
      if (!summer) seasons = seasons.filter(s => s !== 'Su');

      let pres = [];
      (d.pre || []).forEach(p => {
        if (Array.isArray(p)) {
          const active = p.find(cand => state.plan[cand] !== undefined || state.done[cand] !== undefined);
          if (active) pres.push(active);
          else pres.push(p[0]);
        } else {
          pres.push(p);
        }
      });
      if (d.preAny) {
        const filtered = pres.filter(p => state.plan[p] !== undefined || state.done[p] !== undefined);
        if (filtered.length) pres = filtered;
      }

      let cos = [];
      (d.co || []).forEach(c => {
        if (Array.isArray(c)) {
          const active = c.find(cand => state.plan[cand] !== undefined || state.done[cand] !== undefined);
          if (active) cos.push(active);
          else cos.push(c[0]);
        } else {
          cos.push(c);
        }
      });
      if (d.coreqAny) {
        const filtered = cos.filter(c => state.plan[c] !== undefined || state.done[c] !== undefined);
        if (filtered.length) cos = filtered;
      }

      movable.push({
        id,
        cr: d.cr,
        eff: d.cr * effFactor(id, d.diff),
        seasons,
        summer,
        isDesign: id.includes('DESIGN') || id.includes('4810') || id.includes('4820') || id.includes('4390') || id.includes('4392'),
        isHum: d.dept === 'GENED' || id.startsWith('HUMN') || id.startsWith('ART') || id.startsWith('SOCSCI'),
        pre: pres,
        co: cos,
        coAny: !!d.coreqAny,
        float: !d.pre || !d.pre.length
      });
      const curTerm = state.plan[id];
      if (curTerm) movCnt[curTerm] = (movCnt[curTerm] || 0) + 1;
    });

    let apCredits = 0;
    for (const did in state.done) {
      if (state.done[did] === 'completed') apCredits += tileDef(did).cr;
    }

    const doneCnt = {}, fixedCr = {}, fixedEff = {}, fixedRank = {}, fixedTP = {};
    for (const id in state.done) {
      const k = state.done[id];
      if (rankOf[k] !== undefined) {
        fixedRank[id] = rankOf[k];
        fixedTP[id] = termPos(k);
      }
      if (k === 'completed') continue;
      const d = tileDef(id);
      doneCnt[k] = (doneCnt[k] || 0) + 1;
      fixedCr[k] = (fixedCr[k] || 0) + d.cr;
      fixedEff[k] = (fixedEff[k] || 0) + d.cr * effFactor(id, d.diff);
    }

    const terms = sorted.map(k => ({
      key: k,
      rank: rankOf[k],
      season: termSeason(k),
      tp: termPos(k),
      open: (k !== 'completed' && termPos(k) >= 0 && !((doneCnt[k] || 0) > 0 && (movCnt[k] || 0) === 0))
    }));

    let defPlanArr = state.doubleMajor ? PLAN_DOUBLE_MAJOR_DEFAULT : (state.major === 'BE' ? PLAN_BE_DEFAULT : PLAN_EE_DEFAULT);
    const defOf = {};
    defPlanArr.forEach(([k, arr]) => arr.forEach(id => { defOf[id] = k; }));

    const defTerm = {}, defTP = {};
    movable.forEach(c => {
      const dk = defOf[c.id] !== undefined ? defOf[c.id] : null;
      defTerm[c.id] = dk;
      defTP[c.id] = (dk != null && !c.float) ? termPos(dk) : null;
    });

    const pairs = [];
    if ((state.plan['EE4810'] || state.done['EE4810']) && (state.plan['EE4820'] || state.done['EE4820'])) {
      pairs.push({ a: 'EE4810', b: 'EE4820', gap: 1 });
    }
    if ((state.plan['BE4390'] || state.done['BE4390']) && (state.plan['BE4392'] || state.done['BE4392'])) {
      pairs.push({ a: 'BE4390', b: 'BE4392', gap: 1 });
    }

    return {
      terms,
      movable,
      fixedRank,
      fixedTP,
      fixedCr,
      fixedEff,
      defTerm,
      defTP,
      pairs,
      apCredits,
      desMinCredits: 60,
      caps: { fsMin: 12, fsMax: CONFIG.termCap, suMax: CONFIG.summerCap },
      weights: { band: 1e7, even: 1e3, flat: 20, desExtra: 2e3, coSep: 1.5e3, anchor: 300, anchorPair: 1500 }
    };
  }

  let _highs = null, _highsLoading = null;
  function highsFactory() {
    const f = (typeof Highs !== 'undefined' && Highs) || (typeof Module !== 'undefined' && Module)
          || (typeof window !== 'undefined' && (window.Highs || window.Module));
    return typeof f === 'function' ? f : null;
  }
  function loadHighs() {
    if (_highs) return Promise.resolve(_highs);
    if (_highsLoading) return _highsLoading;
    _highsLoading = new Promise((resolve, reject) => {
      const go = () => {
        const F = highsFactory();
        if (!F) { reject(new Error('optimizer global not found after load')); return; }
        F({ locateFile: f => f }).then(h => { _highs = h; resolve(h); }).catch(reject);
      };
      if (highsFactory()) { go(); return; }
      const s = document.createElement('script'); s.src = 'highs.js'; s.async = true;
      s.onload = go; s.onerror = () => reject(new Error('Could not load highs.js.'));
      document.head.appendChild(s);
    });
    return _highsLoading;
  }

  let _solverWorker = null, _solveSeq = 0;
  function solveOffThread(scn, opts) {
    return new Promise((resolve, reject) => {
      if (typeof Worker === 'undefined') { reject(new Error('Web Workers unavailable')); return; }
      let worker;
      try { worker = _solverWorker || (_solverWorker = new Worker('solver-worker.js')); }
      catch (err) { _solverWorker = null; reject(new Error('worker create failed: ' + ((err && err.message) || err))); return; }
      const id = ++_solveSeq;
      const cleanup = () => { worker.removeEventListener('message', onMsg); worker.removeEventListener('error', onErr); };
      const onMsg = (e) => { if (!e.data || e.data.id !== id) return; cleanup(); e.data.ok ? resolve(e.data.res) : reject(new Error(e.data.error || 'solver error')); };
      const onErr = (err) => { cleanup(); _solverWorker = null; reject(new Error('worker error: ' + ((err && err.message) || 'load failure'))); };
      worker.addEventListener('message', onMsg);
      worker.addEventListener('error', onErr);
      worker.postMessage({ id, scn, opts });
    });
  }

  async function autoArrange() {
    const btn = el('btn-auto');
    if (btn) { btn.disabled = true; btn.classList.add('busy'); }
    try {
      const scn = buildScenario();
      if (!scn.movable.length) {
        toast('Nothing to arrange — every course is already marked complete.');
        return;
      }
      const opts = { output_flag: false, mip_rel_gap: 0.05, time_limit: 20 };
      await new Promise(r => { const raf = window.requestAnimationFrame || (cb => setTimeout(cb, 16)); raf(() => raf(r)); });
      let res;
      try {
        res = await solveOffThread(scn, opts);
      } catch (workerErr) {
        let highs;
        try { highs = await loadHighs(); }
        catch (e) {
          toast(location.protocol === 'file:'
            ? 'Auto-arrange needs the page served over HTTP. Open it through a local server, not by double-clicking the file.'
            : 'Could not load the optimizer. Make sure highs.js and highs.wasm sit next to index.html.');
          return;
        }
        res = await BECPlanner.solvePlan(scn, lp => highs.solve(lp, opts));
      }
      if (res.status === 'infeasible') {
        toast('Could not fit every course into the semesters you have. ' + (res.reason || 'Try adding a semester, then auto-arrange again.'));
        return;
      }
      if (res.status !== 'optimal') {
        toast('Auto-arrange hit a snag' + (res.reason ? (': ' + res.reason) : '') + '. Nothing was changed.');
        return;
      }
      undoSnap = cloneState();
      for (const id in res.placements) {
        state.plan[id] = res.placements[id];
      }
      touch();
      render();
      const planDesc = state.doubleMajor ? 'BE + EE double major' : (state.major + ' degree');
      toast('Auto-arranged your ' + planDesc + ' plan', 'Undo', () => {
        if (undoSnap) { state = undoSnap; undoSnap = null; touch(); render(); }
      });
    } catch (e) {
      toast('Auto-arrange failed: ' + ((e && e.message) || e));
    } finally {
      const b = el('btn-auto');
      if (b) { b.disabled = false; b.classList.remove('busy'); }
    }
  }

  /* Load Initial State */
  function loadInitial() {
    const params = new URLSearchParams(location.search);
    const planParam = params.get('plan');
    if (planParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(escape(atob(planParam))));
        state = parsed;
        if (!state.minor) state.minor = 'ROBOTICS';
        persistArmed = true;
        return;
      } catch (e) {
        console.warn('Could not decode shared plan', e);
      }
    }
    const saved = lsGet(STORAGE_KEY);
    if (saved) {
      try {
        state = JSON.parse(saved);
        if (!state.minor) state.minor = 'ROBOTICS';
        persistArmed = true;
        return;
      } catch (e) {
        console.warn('Could not load saved plan', e);
      }
    }
    // Default initial state: BE + EE Double Major preset!
    loadPlanPreset('double');
  }

  /* Initialize */
  function init() {
    loadInitial();
    render();
    wireDnD();
    wireClicks();
    wireAuditSection();

    el('ledger').addEventListener('scroll', updateChevrons, { passive: true });
    window.addEventListener('resize', updateChevrons);

    el('sc-left').onclick = () => { el('ledger').scrollBy({ left: -220, behavior: 'smooth' }); };
    el('sc-right').onclick = () => { el('ledger').scrollBy({ left: 220, behavior: 'smooth' }); };

    el('btn-share').onclick = shareLink;
    el('btn-print').onclick = () => window.print();
    el('btn-reset').onclick = resetPlan;
    el('btn-auto').onclick = autoArrange;
    el('btn-addterm').onclick = function () { openAddTermMenu(this); };

    el('btn-open-catalog').onclick = () => openCatalogModal();
    el('btn-preset-plan').onclick = function () {
      openPop(this, (pop, close) => {
        const presets = [
          { label: 'BE + EE Double Major (Recommended)', type: 'double' },
          { label: 'Electrical Engineering (B.S.E.E. 8-Sem Flowchart)', type: 'EE' },
          { label: 'Biological Engineering (B.S.B.E. 8-Sem Flowchart)', type: 'BE' }
        ];
        const lbl = document.createElement('div');
        lbl.className = 'gl';
        lbl.textContent = 'Load Degree Flowchart Plan';
        pop.appendChild(lbl);

        presets.forEach(p => {
          const b = document.createElement('button');
          b.className = 'it';
          b.textContent = p.label;
          b.onclick = () => { loadPlanPreset(p.type); close(); };
          pop.appendChild(b);
        });
      });
    };

    // Major & Minor Selectors
    el('primary-major-select').addEventListener('change', e => {
      setMajor(e.target.value, state.doubleMajor, state.secondaryMajor);
    });
    el('double-major-toggle').addEventListener('change', e => {
      setMajor(state.major, e.target.checked, state.secondaryMajor);
    });
    el('secondary-major-select').addEventListener('change', e => {
      setMajor(state.major, state.doubleMajor, e.target.value);
    });
    const minorSel = el('minor-select');
    if (minorSel) {
      minorSel.addEventListener('change', e => {
        state.minor = e.target.value;
        touch();
        render();
      });
    }

    el('ih').onclick = () => el('issues').classList.toggle('cl');
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();

