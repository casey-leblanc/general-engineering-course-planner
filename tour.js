/* ===== Guided tour =====
   A self-contained spotlight tour. No external libraries. Launched by #tour-btn.
   To edit the tour, just change the `steps` array below: each step is
   { sel, title, body }, where `sel` is a CSS selector for the element to
   highlight (or null for a centered welcome/closing card). Steps whose element
   is not on the page are skipped automatically. */
(function () {
  "use strict";

  var steps = [
    { sel: null, title: "Welcome to the course planner",
      body: "Here is a quick walk through what everything does. Use <strong>Next</strong> and <strong>Back</strong> to move through it, or <strong>Exit tour</strong> to leave at any time." },
    { sel: ".prog", title: "Your progress",
      body: function () { var t = document.getElementById("prog-target"); return "This bar fills as you check off courses you have finished, tracking your credits toward the " + ((t && t.textContent) || "0") + " in your recommended plan."; } },
    { sel: "#programs-card", title: "Your programs",
      body: "Choose your majors and minors here. Each program has its own colour and progress bar, and <strong>Add a major or minor</strong> brings in another one. Some programs have tracks, like the Pre-med track of Biological Engineering, and switching keeps your work on each." },
    { sel: ".col:not(.bank) .tile", title: "A course",
      body: "Each tile is one course. Check the box at its top-left to mark it complete, drag the tile to move it, and look for a difficulty flag on the heavier ones. Dashed tiles are placeholders for a slot you still have to fill." },
    { sel: ".col:not(.bank) .tile .t-prog-badge", title: "Which program a course counts for",
      body: "A badge for every program the course counts toward. A <strong>§</strong> means it counts through an advisor rule, a shared placeholder, or your own choice. Click the badge to see exactly why and where the rule came from." },
    { sel: ".col:not(.bank) .tile .t-menu", title: "More for each course",
      body: "The three-dot menu moves a course to another semester, adds a note, picks the course for a placeholder, or counts a course for a particular requirement. You can also just drag a tile wherever you want it." },
    { sel: ".col:not(.bank) .col-h", title: "A semester",
      body: "Each column is one semester. The header shows its credit total and a tally of difficult courses, and its checkbox marks the whole semester complete at once." },
    { sel: ".col.bank", title: "AP and transfer credit",
      body: "Drop anything you earned outside LSU here, like AP, IB, or transfer credit. It counts as already complete, and rules that depend on AP credit see it." },
    { sel: "#btn-auto", title: "Auto-arrange",
      body: "Press this and the planner arranges every course you have not finished across your semesters, evening out the workload while respecting prerequisites and when courses are offered. Check off your completed semesters first so it leaves them alone." },
    { sel: "#btn-addterm", title: "Build out your plan",
      body: "Add a semester here, including summers or a fifth year. Inside any semester, the <strong>Custom</strong> button adds a course that is not in the catalog data, and <strong>Add from catalog</strong> searches every course the planner knows." },
    { sel: "#degree-audit-section", scroll: true, title: "Degree audit",
      body: "Every requirement of every program, and what fills it: done, planned, a placeholder you still have to choose, or missing. <strong>Add to plan</strong> puts a missing course in the best semester, and <strong>Choose course</strong> picks the course for a placeholder." },
    { sel: "#rules-section", scroll: true, title: "Advisor and custom rules",
      body: "What advisors and departments have said counts for what, with the source and how sure we are. Open it to read them, or add your own rule for something only your advisor approved." },
    { sel: "#btn-share", title: "Save and share",
      body: "<strong>Copy link</strong> puts your whole plan, including your own rules, into a link so you can paste it into an email to your advisor." },
    { sel: ".issues", scroll: true, title: "Things to review",
      body: "If a course breaks a rule, like a missing prerequisite or a semester where it is not offered, it turns red and is listed here with the details. Advisor notes and courses whose prerequisites have not been checked are listed here too." },
    { sel: ".doclink", title: "Learn more",
      body: "For the full details on how requirements, rules and the auto-arranger work, visit the documentation page. You can replay this anytime by clicking <strong>Take a tour</strong>." }
  ];


  var running = false, pos = 0, active = [];
  var root, spot, pop, stepEl, titleEl, bodyEl, skipBtn, backBtn, nextBtn;

  function build() {
    root = document.createElement("div"); root.className = "tour-root";
    spot = document.createElement("div"); spot.className = "tour-spot";
    pop = document.createElement("div"); pop.className = "tour-pop";
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-live", "polite");
    pop.innerHTML =
      '<div class="tour-pop-step"></div>' +
      '<h4 class="tour-pop-title"></h4>' +
      '<p class="tour-pop-body"></p>' +
      '<div class="tour-pop-nav">' +
        '<button type="button" class="tour-skip">Exit tour</button>' +
        '<span class="tour-grow"></span>' +
        '<button type="button" class="tour-back">Back</button>' +
        '<button type="button" class="tour-next">Next</button>' +
      '</div>';
    root.appendChild(spot); root.appendChild(pop);
    document.body.appendChild(root);
    stepEl = pop.querySelector(".tour-pop-step");
    titleEl = pop.querySelector(".tour-pop-title");
    bodyEl = pop.querySelector(".tour-pop-body");
    skipBtn = pop.querySelector(".tour-skip");
    backBtn = pop.querySelector(".tour-back");
    nextBtn = pop.querySelector(".tour-next");
    skipBtn.onclick = end;
    backBtn.onclick = prev;
    nextBtn.onclick = next;
  }

  function placeSpot(r) {
    var p = 6;
    spot.style.display = "block";
    spot.style.top = (r.top - p) + "px";
    spot.style.left = (r.left - p) + "px";
    spot.style.width = (r.width + p * 2) + "px";
    spot.style.height = (r.height + p * 2) + "px";
  }

  function placePop(r) {
    var vw = window.innerWidth, vh = window.innerHeight, g = 12, m = 12;
    var pw = pop.offsetWidth, ph = pop.offsetHeight, top;
    if (r.bottom + g + ph <= vh - m) top = r.bottom + g;            // below
    else if (r.top - g - ph >= m) top = r.top - g - ph;            // above
    else top = Math.max(m, Math.min(vh - ph - m, r.bottom + g));   // fallback
    var left = r.left + r.width / 2 - pw / 2;
    left = Math.max(m, Math.min(vw - pw - m, left));
    pop.style.top = top + "px";
    pop.style.left = left + "px";
  }

  function placeCenter() {
    pop.style.top = Math.max(12, (window.innerHeight - pop.offsetHeight) / 2) + "px";
    pop.style.left = Math.max(12, (window.innerWidth - pop.offsetWidth) / 2) + "px";
  }

  function targetOf(step) { return step.sel ? document.querySelector(step.sel) : null; }

  function show() {
    var step = active[pos];
    stepEl.textContent = (pos + 1) + " / " + active.length;
    titleEl.textContent = step.title;
    bodyEl.innerHTML = (typeof step.body === "function") ? step.body() : step.body;
    var last = pos === active.length - 1;
    nextBtn.textContent = last ? "Done" : "Next";
    skipBtn.style.display = last ? "none" : "";
    backBtn.style.visibility = pos === 0 ? "hidden" : "visible";
    var el = targetOf(step);
    if (el) {
      root.classList.remove("dim");
      if (step.scroll) { try { el.scrollIntoView({ block: "center", inline: "nearest" }); } catch (e) { el.scrollIntoView(); } }
      else window.scrollTo(0, 0);
      window.requestAnimationFrame(function () {
        var r = el.getBoundingClientRect();
        placeSpot(r); placePop(r);
      });
    } else {
      spot.style.display = "none";
      root.classList.add("dim");
      window.scrollTo(0, 0);
      window.requestAnimationFrame(placeCenter);
    }
  }

  function reflow() {
    if (!running) return;
    var el = targetOf(active[pos]);
    if (el) { var r = el.getBoundingClientRect(); placeSpot(r); placePop(r); }
    else placeCenter();
  }

  function onKey(e) {
    if (!running) return;
    if (e.key === "Escape") end();
    else if (e.key === "ArrowRight" || e.key === "Enter") next();
    else if (e.key === "ArrowLeft") prev();
  }

  function next() { if (pos < active.length - 1) { pos++; show(); } else end(); }
  function prev() { if (pos > 0) { pos--; show(); } }

  function start() {
    if (running) return;
    active = steps.filter(function (s) { return !s.sel || document.querySelector(s.sel); });
    if (!active.length) return;
    running = true; pos = 0;
    build(); show();
    window.addEventListener("resize", reflow);
    window.addEventListener("scroll", reflow, true);
    window.addEventListener("keydown", onKey);
  }

  function end() {
    if (!running) return;
    running = false;
    window.removeEventListener("resize", reflow);
    window.removeEventListener("scroll", reflow, true);
    window.removeEventListener("keydown", onKey);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
  }

  function wire() { var b = document.getElementById("tour-btn"); if (b) b.onclick = start; }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
  window.startTour = start;
})();
