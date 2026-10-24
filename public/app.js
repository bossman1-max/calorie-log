/* Calorie Log: all state, rendering and export.
   No framework, no build step. One localStorage key holds everything. */

(function () {
  "use strict";

  // ---------------------------------------------------------------- constants

  var KEY = "clog-v1";
  var UNDO_KEY = "clog-undo";
  var SLOTS = [
    { id: "breakfast", label: "Breakfast" },
    { id: "lunch", label: "Lunch" },
    { id: "dinner", label: "Dinner" },
    { id: "snacks", label: "Snacks" }
  ];
  var DEFAULT_SPLITS = ["Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Cardio", "Rest"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var QUICK_MAX = 6;

  // ------------------------------------------------------------ date helpers

  // Always build keys from local date parts. toISOString() is UTC, which in UTC+8 returns
  // yesterday for anything logged before 08:00, filing breakfast under the wrong day,
  // silently, forever.
  function ymd(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function fromYmd(s) {
    var p = s.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function addDays(s, n) {
    var d = fromYmd(s);
    d.setDate(d.getDate() + n);
    return ymd(d);
  }
  function daysBetween(a, b) {
    return Math.round((fromYmd(b) - fromYmd(a)) / 86400000);
  }
  function todayKey() {
    return ymd(new Date());
  }
  function keysInRange(from, to) {
    var out = [];
    if (daysBetween(from, to) < 0) return out;
    for (var k = from; daysBetween(k, to) >= 0; k = addDays(k, 1)) out.push(k);
    return out;
  }
  function longDate(k) {
    var d = fromYmd(k);
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() + " (" + DOWS[d.getDay()] + ")";
  }
  function shortDate(k) {
    var d = fromYmd(k);
    return DOWS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()];
  }
  // "12-23 Oct 2026", "28 Sep - 11 Oct 2026", "28 Dec 2025 - 11 Jan 2026"
  function rangeLabel(from, to) {
    if (from === to) return longDate(from);
    var a = fromYmd(from), b = fromYmd(to);
    if (a.getFullYear() === b.getFullYear()) {
      if (a.getMonth() === b.getMonth()) {
        return a.getDate() + "-" + b.getDate() + " " + MONTHS[b.getMonth()] + " " + b.getFullYear();
      }
      return a.getDate() + " " + MONTHS[a.getMonth()] + " - " + b.getDate() + " " + MONTHS[b.getMonth()] + " " + b.getFullYear();
    }
    return a.getDate() + " " + MONTHS[a.getMonth()] + " " + a.getFullYear() +
      " - " + b.getDate() + " " + MONTHS[b.getMonth()] + " " + b.getFullYear();
  }
  function relativeLabel(k) {
    var n = daysBetween(k, todayKey());
    if (n === 0) return "Today";
    if (n === 1) return "Yesterday";
    if (n === -1) return "Tomorrow";
    if (n > 0) return n + " days ago";
    return "in " + -n + " days";
  }
  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  // ----------------------------------------------------------------- storage

  function blankDay() {
    return { split: "", weight: "", shake: false, note: "", meals: { breakfast: [], lunch: [], dinner: [], snacks: [] } };
  }

  function freshState() {
    return { version: 1, splits: DEFAULT_SPLITS.slice(), lastCopiedThrough: "", days: {}, foods: {} };
  }

  // Tolerate anything missing or half-shaped, so a partial/older blob never white-screens.
  function normalise(raw) {
    var s = freshState();
    if (!raw || typeof raw !== "object") return s;
    if (Array.isArray(raw.splits) && raw.splits.length) s.splits = raw.splits.filter(function (x) { return typeof x === "string" && x.trim(); });
    if (typeof raw.lastCopiedThrough === "string") s.lastCopiedThrough = raw.lastCopiedThrough;
    if (raw.foods && typeof raw.foods === "object") s.foods = raw.foods;
    if (raw.days && typeof raw.days === "object") {
      Object.keys(raw.days).forEach(function (k) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
        var d = raw.days[k] || {};
        var day = blankDay();
        day.split = typeof d.split === "string" ? d.split : "";
        day.weight = d.weight == null ? "" : String(d.weight);
        day.shake = !!d.shake;
        day.note = typeof d.note === "string" ? d.note : "";
        SLOTS.forEach(function (sl) {
          var arr = d.meals && d.meals[sl.id];
          day.meals[sl.id] = Array.isArray(arr) ? arr.filter(function (x) { return typeof x === "string" && x.trim(); }) : [];
        });
        s.days[k] = day;
      });
    }
    return s;
  }

  var state;
  try {
    state = normalise(JSON.parse(localStorage.getItem(KEY)));
  } catch (e) {
    state = freshState();
  }

  function dayHasContent(day) {
    if (!day) return false;
    if (day.split || day.note || day.shake) return true;
    if (String(day.weight).trim()) return true;
    return SLOTS.some(function (sl) { return day.meals[sl.id].length > 0; });
  }

  function save() {
    // Navigating to a date creates a day object; prune the untouched ones so they
    // never show up in History or pad out an export.
    Object.keys(state.days).forEach(function (k) {
      if (!dayHasContent(state.days[k])) delete state.days[k];
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      toast("Could not save. This device's storage is full.");
    }
  }

  function ensureDay(k) {
    if (!state.days[k]) state.days[k] = blankDay();
    return state.days[k];
  }
  function getDay(k) {
    return state.days[k] || blankDay();
  }
  function contentKeys() {
    return Object.keys(state.days).filter(function (k) { return dayHasContent(state.days[k]); }).sort();
  }
  function countItems(day) {
    return SLOTS.reduce(function (n, sl) { return n + day.meals[sl.id].length; }, 0);
  }

  // -------------------------------------------------------------- food memory

  function noteFood(text, slot) {
    var key = text.trim().toLowerCase();
    if (!key) return;
    var f = state.foods[key];
    if (!f) f = state.foods[key] = { label: text.trim(), n: 0, last: "", slots: {} };
    f.label = text.trim();
    f.n += 1;
    f.last = todayKey();
    f.slots[slot] = (f.slots[slot] || 0) + 1;
  }

  // Only ever suggest things actually eaten in THIS slot. Weighting dinner foods lower
  // was not enough: with a short history they still floated into breakfast. A hard
  // filter keeps the row short and every chip plausible. Typing still searches
  // everything, so nothing is unreachable.
  function quickPicks(slot, exclude) {
    var taken = {};
    exclude.forEach(function (t) { taken[t.trim().toLowerCase()] = true; });
    var today = todayKey();
    return Object.keys(state.foods)
      .filter(function (k) { return !taken[k] && (state.foods[k].slots[slot] || 0) > 0; })
      .map(function (k) {
        var f = state.foods[k];
        var age = f.last ? Math.min(daysBetween(f.last, today), 120) : 120;
        var recency = Math.max(0, 30 - age) / 10;
        return { key: k, label: f.label, score: f.slots[slot] * 3 + recency };
      })
      .sort(function (a, b) { return b.score - a.score || a.label.localeCompare(b.label); })
      .slice(0, QUICK_MAX);
  }

  function matchFoods(query, slot, exclude) {
    var q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    var taken = {};
    exclude.forEach(function (t) { taken[t.trim().toLowerCase()] = true; });
    return Object.keys(state.foods)
      .filter(function (k) { return !taken[k] && k.indexOf(q) !== -1; })
      // A prefix match is a nudge, not a trump card: something eaten every morning
      // should still beat a rarity that happens to start with the same letters.
      .map(function (k) {
        var f = state.foods[k];
        return { key: k, label: f.label, score: (k.indexOf(q) === 0 ? 5 : 0) + (f.slots[slot] || 0) * 3 + f.n };
      })
      .sort(function (a, b) { return b.score - a.score || a.label.localeCompare(b.label); })
      .slice(0, QUICK_MAX);
  }

  // Predict the next split: find what usually follows the most recent one.
  // Falls back to the next name in the list, so it works from day one.
  function suggestSplit(forKey) {
    var prior = contentKeys().filter(function (k) { return k < forKey && state.days[k].split; });
    if (!prior.length) return "";
    var last = state.days[prior[prior.length - 1]].split;
    var tally = {};
    for (var i = 0; i < prior.length - 1; i++) {
      if (state.days[prior[i]].split === last) {
        var nxt = state.days[prior[i + 1]].split;
        tally[nxt] = (tally[nxt] || 0) + 1;
      }
    }
    var best = "", bestN = 0;
    Object.keys(tally).forEach(function (k) { if (tally[k] > bestN) { bestN = tally[k]; best = k; } });
    if (best) return best;
    var idx = state.splits.indexOf(last);
    return idx === -1 ? "" : state.splits[(idx + 1) % state.splits.length];
  }

  // ---------------------------------------------------------------- formatter

  function formatDay(k) {
    var day = state.days[k];
    if (!day) return "";
    var out = [longDate(k) + (day.split ? " · " + day.split : "")];
    SLOTS.forEach(function (sl) {
      var items = day.meals[sl.id];
      if (!items.length) return;
      out.push("", sl.label);
      items.forEach(function (t) { out.push("- " + t); });
    });
    var tail = [];
    // Always printed: a skipped shake is real information for whoever counts the protein.
    tail.push("Protein shake: " + (day.shake ? "yes" : "no"));
    if (String(day.weight).trim()) tail.push("Weight: " + String(day.weight).trim() + " kg");
    if (day.note.trim()) tail.push("Note: " + day.note.trim());
    out.push("", tail.join("\n"));
    return out.join("\n");
  }

  // Returns { text, used, skipped } so the UI can report gaps instead of hiding them.
  function formatRange(from, to) {
    var all = keysInRange(from, to);
    var used = all.filter(function (k) { return state.days[k] && dayHasContent(state.days[k]); });
    var skipped = all.length - used.length;
    if (!used.length) return { text: "", used: [], skipped: skipped };
    if (used.length === 1) return { text: formatDay(used[0]), used: used, skipped: skipped };
    var header = "Food log · " + rangeLabel(used[0], used[used.length - 1]) + " · " + plural(used.length, "day");
    var body = used.map(formatDay).join("\n\n---\n\n");
    return { text: header + "\n\n" + body, used: used, skipped: skipped };
  }

  function newDayKeys() {
    var keys = contentKeys();
    if (!keys.length) return [];
    var from = state.lastCopiedThrough ? addDays(state.lastCopiedThrough, 1) : keys[0];
    var latest = keys[keys.length - 1];
    var to = daysBetween(todayKey(), latest) > 0 ? latest : todayKey();
    return keys.filter(function (k) { return k >= from && k <= to; });
  }

  // ------------------------------------------------------------------- the UI

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var cur = todayKey();
  var slotRefs = {};

  // ---- toast

  var toastTimer;
  function toast(msg, actionLabel, onAction) {
    clearTimeout(toastTimer);
    $("toast-text").textContent = msg;
    var btn = $("toast-action");
    if (actionLabel) {
      btn.textContent = actionLabel;
      btn.hidden = false;
      btn.onclick = function () { $("toast").hidden = true; onAction(); };
    } else {
      btn.hidden = true;
      btn.onclick = null;
    }
    $("toast").hidden = false;
    toastTimer = setTimeout(function () { $("toast").hidden = true; }, actionLabel ? 9000 : 2600);
  }

  // ---- clipboard: three tiers, in gesture

  // onSuccess only fires once the text has actually reached the clipboard, or once the
  // manual sheet has been dismissed, never optimistically, because the caller uses it
  // to advance the copy marker and a failed copy must not mark days as settled.
  function copyText(text, dayCount, onSuccess) {
    if (!text) { toast("Nothing to copy for this range."); return; }
    function win() {
      toast("Copied " + plural(dayCount, "day") + ".");
      if (onSuccess) onSuccess();
    }
    function legacy() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        var ok = document.execCommand("copy");
        ta.remove();
        if (ok) return true;
      } catch (e) { /* fall through to the manual sheet */ }
      return false;
    }
    // writeText must be *called* inside the gesture; awaiting it afterwards is fine.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(win, function () {
        if (legacy()) win(); else manual(text, onSuccess);
      });
      return;
    }
    if (legacy()) { win(); return; }
    manual(text, onSuccess);
  }

  var manualDone = null;
  function manual(text, onSuccess) {
    manualDone = onSuccess;
    var ta = $("manual-text");
    ta.value = text;
    $("manual").showModal();
    ta.focus();
    ta.setSelectionRange(0, text.length);
  }

  // ---- screens

  function showScreen(name) {
    commitAllPending();
    ["today", "history", "copy", "settings"].forEach(function (n) {
      var sec = $("s-" + n);
      var on = n === name;
      sec.classList.toggle("is-active", on);
      sec.hidden = !on;
    });
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.classList.toggle("is-active", t.dataset.screen === name);
    });
    $("scroll").scrollTop = 0;
    if (name === "history") renderHistory();
    if (name === "copy") renderCopy();
    if (name === "settings") renderSettings();
  }

  // ---- today

  function renderDateBar() {
    var d = fromYmd(cur);
    $("date-main").textContent = (DOWS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()]).toUpperCase();
    $("date-sub").textContent = relativeLabel(cur) + " · " + d.getFullYear();
    $("date-pick").value = cur;
  }

  function renderSplits() {
    var row = $("split-row");
    row.textContent = "";
    var day = getDay(cur);
    var hint = day.split ? "" : suggestSplit(cur);
    $("split-hint").textContent = hint ? "suggested" : "";
    state.splits.forEach(function (name) {
      var b = el("button", "chip", name);
      if (day.split === name) b.classList.add("is-on");
      else if (hint === name) b.classList.add("is-suggested");
      b.onclick = function () {
        var d = ensureDay(cur);
        d.split = d.split === name ? "" : name;
        save();
        renderSplits();
        updateWaiting();
      };
      row.appendChild(b);
    });
  }

  function refreshSlot(slot) {
    var ref = slotRefs[slot];
    if (!ref) return;
    var items = getDay(cur).meals[slot];

    ref.count.textContent = items.length ? String(items.length) : "";

    ref.list.textContent = "";
    items.forEach(function (text, i) {
      var li = el("li", "item");
      var t = el("button", "item-text", text);
      t.onclick = function () { editItem(slot, i, li, t); };
      var x = el("button", "item-del", "×");
      x.setAttribute("aria-label", "Remove " + text);
      x.onclick = function () {
        ensureDay(cur).meals[slot].splice(i, 1);
        save();
        refreshSlot(slot);
        updateWaiting();
      };
      li.appendChild(t);
      li.appendChild(x);
      ref.list.appendChild(li);
    });

    renderQuick(slot);
  }

  // Tapping a suggestion blurs the input, which would otherwise commit the half-typed
  // text as well and add two entries. A timestamp rather than a flag, so a tap that
  // drags off the chip without firing a click cannot leave the guard stuck on.
  var chipTapAt = 0;

  function renderQuick(slot) {
    var ref = slotRefs[slot];
    var items = getDay(cur).meals[slot];
    var q = ref.input.value.trim();
    var picks = q ? matchFoods(q, slot, items) : quickPicks(slot, items);
    ref.quick.textContent = "";
    picks.forEach(function (p) {
      var b = el("button", "chip is-suggested", p.label);
      b.addEventListener("pointerdown", function () { chipTapAt = Date.now(); });
      b.onclick = function () {
        chipTapAt = Date.now();
        ref.input.value = "";
        addItem(slot, p.label);
      };
      ref.quick.appendChild(b);
    });
  }

  // Typing a food and then tapping away used to lose it: weight and note save on every
  // keystroke, but a list item needs a commit point, and Enter is easy to skip on a phone
  // keyboard. Blur is that commit point, so anything typed is kept no matter how you leave
  // the field. An accidental entry is one tap to delete; a lost dinner is gone.
  function commitPending(slot) {
    var ref = slotRefs[slot];
    if (ref && ref.input.value.trim()) addItem(slot, ref.input.value);
  }
  function commitAllPending() {
    SLOTS.forEach(function (sl) { commitPending(sl.id); });
  }

  function addItem(slot, text) {
    text = text.trim();
    if (!text) return;
    ensureDay(cur).meals[slot].push(text);
    noteFood(text, slot);
    save();
    var ref = slotRefs[slot];
    ref.input.value = "";
    refreshSlot(slot);
    updateWaiting();
  }

  function editItem(slot, i, li, textBtn) {
    var input = el("input", "item-edit");
    input.value = getDay(cur).meals[slot][i];
    li.replaceChild(input, textBtn);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    var done = false;
    function commit() {
      if (done) return;
      done = true;
      var v = input.value.trim();
      var arr = ensureDay(cur).meals[slot];
      if (v) { arr[i] = v; noteFood(v, slot); } else { arr.splice(i, 1); }
      save();
      refreshSlot(slot);
      updateWaiting();
    }
    input.onblur = commit;
    input.onkeydown = function (e) {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      if (e.key === "Escape") { done = true; refreshSlot(slot); }
    };
  }

  function buildMeals() {
    var host = $("meals");
    host.textContent = "";
    slotRefs = {};
    SLOTS.forEach(function (sl) {
      var wrap = el("div", "meal");

      var head = el("div", "rule-head");
      head.appendChild(el("span", "rule-label", sl.label));
      head.appendChild(el("i", "rule"));
      var count = el("span", "rule-meta");
      head.appendChild(count);
      wrap.appendChild(head);

      var list = el("ul", "items");
      wrap.appendChild(list);

      var form = el("form", "addrow");
      var input = el("input", "add-input");
      input.placeholder = "Add food";
      input.setAttribute("autocomplete", "off");
      input.setAttribute("enterkeyhint", "done");
      input.setAttribute("aria-label", "Add to " + sl.label.toLowerCase());
      form.appendChild(input);
      form.onsubmit = function (e) { e.preventDefault(); addItem(sl.id, input.value); };
      input.oninput = function () { renderQuick(sl.id); };
      input.onblur = function () {
        if (Date.now() - chipTapAt < 600) return; // a suggestion chip is handling this tap
        commitPending(sl.id);
      };
      wrap.appendChild(form);

      var quick = el("div", "chiprow quickrow");
      wrap.appendChild(quick);

      slotRefs[sl.id] = { list: list, count: count, quick: quick, input: input };
      host.appendChild(wrap);
    });
  }

  function renderExtras() {
    var day = getDay(cur);
    $("shake").setAttribute("aria-pressed", day.shake ? "true" : "false");
    $("weight").value = day.weight || "";
    $("note").value = day.note || "";
  }

  function renderToday(direction) {
    renderDateBar();
    renderSplits();
    buildMeals();
    SLOTS.forEach(function (sl) { refreshSlot(sl.id); });
    renderExtras();
    updateWaiting();
    if (direction) {
      var t = $("turnable");
      t.classList.remove("turn-next", "turn-prev");
      void t.offsetWidth;
      t.classList.add(direction > 0 ? "turn-next" : "turn-prev");
    }
  }

  function goTo(key, direction) {
    // Commit while `cur` is still the day you typed it on, not the one you moved to.
    commitAllPending();
    cur = key;
    renderToday(direction);
  }

  function updateWaiting() {
    var n = newDayKeys().length;
    var pill = $("waiting");
    pill.hidden = n === 0;
    pill.textContent = plural(n, "day") + " waiting";
  }

  // ---- history

  function renderHistory() {
    var host = $("history-list");
    host.textContent = "";
    var keys = contentKeys().reverse();
    $("history-count").textContent = keys.length ? String(keys.length) : "";
    if (!keys.length) {
      host.appendChild(el("p", "empty", "Nothing logged yet. Add a meal on Today and it shows up here."));
      return;
    }
    keys.forEach(function (k) {
      var day = state.days[k];
      var row = el("button", "dayrow");
      var dot = el("span", "dot");
      if (state.lastCopiedThrough && k <= state.lastCopiedThrough) dot.classList.add("is-copied");
      dot.title = dot.classList.contains("is-copied") ? "Already copied" : "Not copied yet";
      row.appendChild(dot);
      row.appendChild(el("span", "dayrow-date", shortDate(k)));
      row.appendChild(el("span", "dayrow-split", day.split || "No split"));
      row.appendChild(el("span", "dayrow-count", plural(countItems(day), "item")));
      row.onclick = function () { goTo(k, 0); showScreen("today"); };
      host.appendChild(row);
    });
  }

  // ---- copy

  var rangeMode = "14";

  function setRangeInputs(from, to) {
    $("from-date").value = from;
    $("to-date").value = to;
  }

  function defaultRangeFor(mode) {
    var keys = contentKeys();
    var today = todayKey();
    if (mode === "day") return [cur, cur];
    if (mode === "all") return keys.length ? [keys[0], keys[keys.length - 1]] : [today, today];
    var n = Number(mode);
    return [addDays(today, -(n - 1)), today];
  }

  function renderCopy() {
    var fresh = newDayKeys();
    $("new-count").textContent = fresh.length ? plural(fresh.length, "day") : "none";
    var btn = $("copy-new");
    if (fresh.length) {
      $("new-range").textContent = rangeLabel(fresh[0], fresh[fresh.length - 1]);
      btn.textContent = "Copy " + plural(fresh.length, "day");
      btn.disabled = false;
    } else {
      $("new-range").textContent = state.lastCopiedThrough
        ? "Everything through " + rangeLabel(state.lastCopiedThrough, state.lastCopiedThrough) + " is copied."
        : "Nothing logged yet.";
      btn.textContent = "Nothing new to copy";
      btn.disabled = true;
    }

    if (!$("from-date").value || !$("to-date").value) {
      var r = defaultRangeFor(rangeMode);
      setRangeInputs(r[0], r[1]);
    }
    Array.prototype.forEach.call(document.querySelectorAll("#range-row .chip"), function (c) {
      c.classList.toggle("is-on", c.dataset.range === rangeMode);
    });
    renderPreview();
  }

  function renderPreview() {
    var from = $("from-date").value, to = $("to-date").value;
    var pre = $("preview"), meta = $("preview-meta"), note = $("skip-note"), btn = $("copy-range");
    if (!from || !to) {
      pre.textContent = "Pick a start and end date.";
      meta.textContent = "";
      note.hidden = true;
      btn.disabled = true;
      return;
    }
    if (daysBetween(from, to) < 0) {
      pre.textContent = "The start date is after the end date.";
      meta.textContent = "";
      note.hidden = true;
      btn.disabled = true;
      return;
    }
    var r = formatRange(from, to);
    if (!r.used.length) {
      pre.textContent = "No days logged in this range.";
      meta.textContent = "0 days";
      note.hidden = true;
      btn.disabled = true;
      return;
    }
    pre.textContent = r.text;
    meta.textContent = plural(r.used.length, "day");
    if (r.skipped > 0) {
      note.textContent = plural(r.skipped, "day") + " in this range had nothing logged and " + (r.skipped === 1 ? "was" : "were") + " skipped.";
      note.hidden = false;
    } else {
      note.hidden = true;
    }
    btn.disabled = false;
    btn.textContent = "Copy " + plural(r.used.length, "day");
  }

  // ---- settings

  function renderSettings() {
    var host = $("split-editor");
    host.textContent = "";
    $("split-count").textContent = String(state.splits.length);

    state.splits.forEach(function (name, i) {
      var row = el("div", "splitrow");

      var input = el("input");
      input.value = name;
      input.setAttribute("aria-label", "Split name");
      input.onchange = function () {
        var v = input.value.trim();
        if (!v) { input.value = name; return; }
        // Keep already-logged days pointing at the renamed split.
        Object.keys(state.days).forEach(function (k) {
          if (state.days[k].split === name) state.days[k].split = v;
        });
        state.splits[i] = v;
        save();
        renderSettings();
        renderSplits();
      };
      row.appendChild(input);

      var up = el("button", "icon-btn", "↑");
      up.setAttribute("aria-label", "Move " + name + " up");
      up.disabled = i === 0;
      up.onclick = function () {
        state.splits.splice(i - 1, 0, state.splits.splice(i, 1)[0]);
        save(); renderSettings(); renderSplits();
      };
      row.appendChild(up);

      var down = el("button", "icon-btn", "↓");
      down.setAttribute("aria-label", "Move " + name + " down");
      down.disabled = i === state.splits.length - 1;
      down.onclick = function () {
        state.splits.splice(i + 1, 0, state.splits.splice(i, 1)[0]);
        save(); renderSettings(); renderSplits();
      };
      row.appendChild(down);

      var del = el("button", "icon-btn is-danger", "×");
      del.setAttribute("aria-label", "Remove " + name);
      del.onclick = function () {
        state.splits.splice(i, 1);
        save(); renderSettings(); renderSplits();
      };
      row.appendChild(del);

      host.appendChild(row);
    });

    $("marker-date").value = state.lastCopiedThrough || "";
    $("marker-state").textContent = state.lastCopiedThrough
      ? "Days up to " + longDate(state.lastCopiedThrough) + " count as copied. Move this back to copy a window again."
      : "Nothing is marked as copied, so every logged day counts as waiting.";

    var bytes = 0;
    try { bytes = new Blob([localStorage.getItem(KEY) || ""]).size; } catch (e) { bytes = 0; }
    $("storage-note").textContent = contentKeys().length + " days stored, about " + Math.max(1, Math.round(bytes / 1024)) + " KB.";
  }

  function downloadBackup() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "calorie-log-" + todayKey() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("Backup downloaded.");
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (e) {
        return toast("That file is not valid JSON.");
      }
      var incoming = normalise(parsed);
      var n = Object.keys(incoming.days).length;
      if (!n && !incoming.splits.length) return toast("That file has no log data in it.");
      if (!confirm("Replace the current log with this backup?\n\nBackup has " + plural(n, "day") + ". This device has " + plural(contentKeys().length, "day") + ".")) return;
      state = incoming;
      save();
      cur = todayKey();
      renderToday(0);
      renderSettings();
      toast("Imported " + plural(n, "day") + ".");
    };
    reader.onerror = function () { toast("Could not read that file."); };
    reader.readAsText(file);
  }

  function wipe() {
    if (!confirm("Delete every logged day on this device?\n\nYou can undo this until you close the app.")) return;
    try { sessionStorage.setItem(UNDO_KEY, localStorage.getItem(KEY) || ""); } catch (e) { /* undo just will not be offered */ }
    state = freshState();
    save();
    cur = todayKey();
    renderToday(0);
    renderSettings();
    toast("Everything deleted.", "Undo", function () {
      try {
        state = normalise(JSON.parse(sessionStorage.getItem(UNDO_KEY)));
        save();
        cur = todayKey();
        renderToday(0);
        renderSettings();
        toast("Restored.");
      } catch (e) {
        toast("Could not restore the backup.");
      }
    });
  }

  // ------------------------------------------------------------------- wiring

  $("prev-day").onclick = function () { goTo(addDays(cur, -1), -1); };
  $("next-day").onclick = function () { goTo(addDays(cur, 1), 1); };
  $("date-main").onclick = function () {
    var p = $("date-pick");
    p.style.pointerEvents = "auto";
    if (p.showPicker) { try { p.showPicker(); return; } catch (e) { /* fall through */ } }
    p.focus();
    p.click();
  };
  $("date-pick").onchange = function () {
    if (!this.value) return;
    goTo(this.value, daysBetween(cur, this.value) > 0 ? 1 : -1);
  };

  $("shake").onclick = function () {
    var d = ensureDay(cur);
    d.shake = !d.shake;
    save();
    renderExtras();
    updateWaiting();
  };
  $("weight").oninput = function () {
    ensureDay(cur).weight = this.value.replace(/[^\d.]/g, "");
    save();
    updateWaiting();
  };
  $("weight").onblur = function () { this.value = getDay(cur).weight || ""; };
  $("note").oninput = function () {
    ensureDay(cur).note = this.value;
    save();
    updateWaiting();
  };

  $("waiting").onclick = function () { showScreen("copy"); };

  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
    t.onclick = function () { showScreen(t.dataset.screen); };
  });

  $("copy-new").onclick = function () {
    var fresh = newDayKeys();
    if (!fresh.length) return;
    var r = formatRange(fresh[0], fresh[fresh.length - 1]);
    copyText(r.text, r.used.length, function () {
      // Settle up to today, not just the last logged day, so a gap at the end does
      // not keep reappearing as "waiting".
      var latest = fresh[fresh.length - 1];
      state.lastCopiedThrough = daysBetween(todayKey(), latest) > 0 ? latest : todayKey();
      save();
      renderCopy();
      updateWaiting();
    });
  };

  $("copy-range").onclick = function () {
    var r = formatRange($("from-date").value, $("to-date").value);
    copyText(r.text, r.used.length);
  };

  Array.prototype.forEach.call(document.querySelectorAll("#range-row .chip"), function (c) {
    c.onclick = function () {
      rangeMode = c.dataset.range;
      var r = defaultRangeFor(rangeMode);
      setRangeInputs(r[0], r[1]);
      renderCopy();
    };
  });

  $("from-date").onchange = function () { rangeMode = "custom"; renderCopy(); };
  $("to-date").onchange = function () { rangeMode = "custom"; renderCopy(); };

  $("add-split-form").onsubmit = function (e) {
    e.preventDefault();
    var v = $("add-split").value.trim();
    if (!v) return;
    if (state.splits.indexOf(v) === -1) state.splits.push(v);
    $("add-split").value = "";
    save();
    renderSettings();
    renderSplits();
  };

  $("export").onclick = downloadBackup;
  $("import-btn").onclick = function () { $("import-file").click(); };
  $("import-file").onchange = function () {
    if (this.files && this.files[0]) importBackup(this.files[0]);
    this.value = "";
  };
  $("marker-date").onchange = function () {
    state.lastCopiedThrough = this.value || "";
    save();
    renderSettings();
    updateWaiting();
  };
  $("marker-clear").onclick = function () {
    state.lastCopiedThrough = "";
    save();
    renderSettings();
    updateWaiting();
    toast("Copy marker cleared.");
  };
  $("wipe").onclick = wipe;
  $("manual-close").onclick = function () {
    $("manual").close();
    var fn = manualDone;
    manualDone = null;
    if (fn) fn();
  };

  // Switching apps on a phone does not reliably fire blur, so bank anything typed
  // before the page goes away.
  window.addEventListener("pagehide", commitAllPending);

  // Coming back to the app after midnight should land on the new day, not yesterday.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") { commitAllPending(); return; }
    if ($("s-today").classList.contains("is-active") && cur !== todayKey() && relativeLabel(cur) === "Yesterday") {
      goTo(todayKey(), 1);
    }
    updateWaiting();
  });

  renderToday(0);

  // ---- service worker

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      // No reload-on-controllerchange: the worker revalidates in the background, so the
      // next ordinary load already has fresh assets. Forcing a reload here risks a loop.
      navigator.serviceWorker.register("/sw.js").catch(function () { /* offline support is optional */ });
    });
  }
})();
