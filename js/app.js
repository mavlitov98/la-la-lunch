/* Ла Ла Ланч: полка блюд, меню, карточка блюда, корзина, заказ (демо, без отправки на сервер). Данные в js/menu.js */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => r.querySelectorAll(s);
const fmt = (n) => n.toLocaleString("ru-RU") + " ₽";
const icons = () => window.lucide && lucide.createIcons();
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const BYID = {};
Object.entries(MENU).forEach(([cat, items]) => items.forEach((d) => { d.cat = cat; BYID[d.id] = d; }));

/* demo photos available in img/; dishes without one get a drawn plate with the section icon */
const PHOTOS = new Set(["branch1", "branch2", "b-kinoa", "pasta", "funchoza", "lapsha", "solyanka", "k-sup"]);
/* demo only: dishes without their own picture borrow the closest-looking one */
const DUP = {
  syrniki: "branch1", omlet: "branch1", scrambl: "branch2", manka: "pasta", oves: "fusilli",
  "b-losos": "b-kinoa", "b-krevetki": "fusilli", "b-klub": "iced-latte", "b-banan": "pasta", "b-yagody": "b-kinoa",
  "s-cezar": "b-kinoa", "s-krevetki": "fusilli", "s-rostbif": "branch1", "s-pechen": "branch2", "s-grek": "b-kinoa", "s-ovosh": "fusilli",
  borsch: "solyanka", grib: "k-sup", okroshka: "k-sup",
  naggets: "branch1", fri: "fusilli", sous: "solyanka",
  fondan: "iced-foam", "sh-vishnya": "branch2", "sh-grusha": "pasta",
  "k-palochki": "b-kinoa",
};
const photoOf = (d) => d.photo || (PHOTOS.has(d.id) ? d.id : DUP[d.id] || null);

const cart = {};          // "id|sizeIndex" -> qty
const sel = {};           // id -> chosen size index
let cur = Object.keys(MENU)[0];
let view = "cards";
let raf = 0;

const si = (d) => sel[d.id] || 0;
const multi = (d) => d.s && d.s.length > 1;
const price = (d, i = si(d)) => (d.s ? d.s[i][1] : d.p);
const amount = (d, i = si(d)) => (d.s ? d.s[i][0] : d.w);
const keyOf = (d, i = si(d)) => d.id + "|" + i;
/* a dish photo, or a CSS-drawn cup on a saucer for drinks without photos */
const img = (d, cls = "food", lazy = true) => {
  const ph = photoOf(d);
  if (ph) return `<img class="${cls}" src="img/${ph}.webp?v=2" alt="${d.n}" ${lazy ? 'loading="lazy"' : ""} decoding="async" width="640" height="640">`;
  if (d.cup) return `<span class="${cls} cup" role="img" aria-label="${d.n}" style="--c1:${d.cup[0]};--c2:${d.cup[1]}"><span class="mug"></span></span>`;
  return `<span class="${cls} cup dishph" role="img" aria-label="${d.n}"><i data-lucide="${ICONS[d.cat]}"></i></span>`;
};

/* ---------- motion helpers (transitions.dev) ---------- */
const cssMs = (name, fb) => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fb;
};

// Tabs sliding: write the active tab's offsetLeft / offsetWidth onto the pill
function pillTo(bar, tab, animate) {
  const pill = bar && $(".t-tabs-pill", bar);
  if (!pill || !tab) return;
  if (!animate) {
    const prev = pill.style.transition;
    pill.style.transition = "none";
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;
    void pill.offsetWidth;
    pill.style.transition = prev;
  } else {
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;
  }
}
function placePills() {
  pillTo($("#tabs"), $('#tabs .t-tab[aria-selected="true"]'), false);
  pillTo($(".viewtoggle"), $('.viewtoggle .t-tab[aria-pressed="true"]'), false);
}

// Number pop-in: only the characters that changed pop, the shared prefix stays still
function popText(el, str) {
  const prev = el.dataset.v ?? el.textContent.replace(/\s+$/, "");
  if (prev === str) return;
  el.dataset.v = str;
  let same = 0;
  while (same < prev.length && same < str.length && prev[same] === str[same]) same++;
  el.classList.add("t-digit-group");
  el.classList.remove("is-animating");
  el.replaceChildren(
    ...[...str].map((ch, i) => {
      const sp = document.createElement("span");
      sp.className = "t-digit";
      sp.textContent = ch;
      if (i < same) sp.dataset.same = "";
      return sp;
    })
  );
  void el.offsetHeight;
  el.classList.add("is-animating");
}

// Toast: rises in, leaves on its own
let toastTimer = 0;
function toast(text) {
  const t = $("#toast");
  $("#toastText").textContent = text;
  t.classList.remove("is-open");
  void t.offsetWidth;
  t.classList.add("is-open");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-open"), 1800);
}

// Success check: reset to "out", reflow, flip to "in" so it replays every order
function showCheck() {
  const c = $("#doneCheck");
  c.setAttribute("data-state", "out");
  void c.offsetWidth;
  c.setAttribute("data-state", "in");
}

// Error state shake with auto-revert; typing clears it
function showError(wrap, input) {
  wrap.classList.add("is-error");
  input.classList.add("is-error");
  input.classList.remove("is-shaking");
  void input.offsetWidth;
  input.classList.add("is-shaking");
  const shakeMs = cssMs("--shake-dur-a", 80) * 2 + cssMs("--shake-dur-b", 60) * 2;
  setTimeout(() => input.classList.remove("is-shaking"), shakeMs + 20);
  if (wrap._revertTimer) clearTimeout(wrap._revertTimer);
  wrap._revertTimer = setTimeout(() => {
    wrap._revertTimer = null;
    wrap.classList.remove("is-error");
    input.classList.remove("is-error");
  }, shakeMs + cssMs("--revert-hold", 3000));
}
function clearError(wrap, input) {
  if (wrap._revertTimer) { clearTimeout(wrap._revertTimer); wrap._revertTimer = null; }
  wrap.classList.remove("is-error");
  input.classList.remove("is-error");
}

/* ---------- small building blocks ---------- */
function ctl(key, big = false) {
  const q = cart[key] || 0;
  const d = BYID[key.split("|")[0]];
  if (q)
    return `<div class="stepper"><button type="button" data-dec="${key}" aria-label="Убрать ${d.n}"><i data-lucide="minus"></i></button><b class="t-digit-group is-animating" aria-live="polite"><span class="t-digit">${q}</span></b><button type="button" data-inc="${key}" aria-label="Добавить ещё ${d.n}"><i data-lucide="plus"></i></button></div>`;
  return big
    ? `<button type="button" class="btn btn-primary btn-add" data-inc="${key}"><i data-lucide="plus"></i>В корзину</button>`
    : `<button type="button" class="add" data-inc="${key}" aria-label="Добавить ${d.n}"><i data-lucide="plus"></i></button>`;
}
/* КБЖУ for the chosen portion (drinks scale by volume) */
function kbju(d, i = si(d)) {
  if (d.s) {
    const per = KBJU100[d.id], ml = parseInt(d.s[i][0], 10) / 100;
    return per && per.map((v) => Math.round(v * ml));
  }
  return KBJU[d.id];
}
const KBJU_LABELS = ["ккал", "белки, г", "жиры, г", "углев., г"];
function kbjuBlock(d) {
  const v = kbju(d);
  if (!v) return "";
  return `<div class="kbju" data-kbju="${d.id}">${v
    .map((n, k) => `<div><b data-k="${k}">${n}</b><span>${KBJU_LABELS[k]}</span></div>`)
    .join("")}</div>
    <p class="kbju-cap">${d.s ? "На " + d.s[si(d)][0] : amount(d) ? "На порцию " + amount(d) : "На порцию"}</p>`;
}

function sizes(d) {
  if (!multi(d)) return "";
  return `<div class="sizes" role="group" aria-label="Объём, мл">${d.s
    .map((x, i) => `<button type="button" data-size="${d.id}|${i}" aria-pressed="${i === si(d)}">${parseInt(x[0], 10)}</button>`)
    .join("")}<span>мл</span></div>`;
}

/* ---------- hero shelf: pick a category, swipe the plates, "+" adds straight to the cart ---------- */
const SHELF_CATS = ["Бранчи", "Боулы", "Супы", "Пасты", "Кофе"].filter((k) => MENU[k]);
let shelfCat = SHELF_CATS[0], shelfIdx = 0, shelfTimer = 0, shelfPaused = false;
const shelf = $("#shelf");
$("#heroCats").innerHTML = SHELF_CATS
  .map((k) => `<button type="button" data-cat="${k}" aria-pressed="${k === shelfCat}">${k}</button>`).join("");
function renderShelf(animate = false) {
  const items = MENU[shelfCat].filter((d) => photoOf(d)).slice(0, 6);
  shelf.innerHTML = items
    .map((d, i) => `
    <article class="pcard${animate ? " is-entering" : ""}" style="--i:${i}" data-open="${d.id}">
      ${img(d, "pcard-pic", i > 1)}
      <p class="pcard-name">${d.n}</p>
      <div class="pcard-row">
        <span class="pcard-price"><b data-price="${d.id}">${fmt(price(d))}</b><small>${amount(d) || ""}</small></span>
        <span data-ctl="${d.id}">${ctl(keyOf(d))}</span>
      </div>
    </article>`)
    .join("");
  $("#shelfDots").innerHTML = items.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("");
  shelf.scrollLeft = 0;
  shelfIdx = 0;
  icons();
}
const shelfCards = () => $$(".pcard", shelf);
const shelfX = (c) => c.offsetLeft - (shelf.clientWidth - c.offsetWidth) / 2;
shelf.addEventListener("scroll", () => {
  let best = 0, dist = Infinity;
  shelfCards().forEach((c, i) => { const d = Math.abs(shelfX(c) - shelf.scrollLeft); if (d < dist) { dist = d; best = i; } });
  if (best === shelfIdx) return;
  shelfIdx = best;
  $$("#shelfDots i").forEach((e, i) => e.classList.toggle("on", i === best));
}, { passive: true });
// autoplay stops for good once the visitor touches the shelf
["pointerdown", "wheel"].forEach((t) => shelf.addEventListener(t, () => (shelfPaused = true), { passive: true }));
function shelfAutoplay(on) {
  clearInterval(shelfTimer);
  if (!on || reduceMotion) return;
  shelfTimer = setInterval(() => {
    const cards = shelfCards();
    if (shelfPaused || !cards.length) return;
    shelf.scrollTo({ left: shelfX(cards[(shelfIdx + 1) % cards.length]), behavior: "smooth" });
  }, 3800);
}
$("#heroCats").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (!b || b.dataset.cat === shelfCat) return;
  shelfCat = b.dataset.cat;
  $$("#heroCats button").forEach((x) => x.setAttribute("aria-pressed", x === b));
  b.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  renderShelf(true);
});
renderShelf();
shelfAutoplay(true);
document.addEventListener("visibilitychange", () => shelfAutoplay(!document.hidden));

/* ---------- opening hours: daily 09:00–21:00, Stavropol runs on Moscow time ---------- */
const OPEN_H = 9, CLOSE_H = 21;
function showHours() {
  const h = +new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", hour12: false }).format(new Date()) % 24;
  const open = h >= OPEN_H && h < CLOSE_H;
  $("#heroHours").textContent = open ? "Открыто до 21:00" : "Откроемся в 9:00";
  $("#liveDot").classList.toggle("closed", !open);
}
showHours();
setInterval(showHours, 60000);

/* ---------- tabs ---------- */
function renderTabs() {
  const bar = $("#tabs");
  bar.classList.add("t-tabs");
  bar.innerHTML =
    `<span class="t-tabs-pill" aria-hidden="true"></span>` +
    Object.keys(MENU)
      .map((k) => `<button type="button" class="tab t-tab" role="tab" data-k="${k}" aria-selected="${k === cur}"><i data-lucide="${ICONS[k]}"></i>${k}</button>`)
      .join("");
  icons();
}
$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (!b || b.dataset.k === cur) return;
  cur = b.dataset.k;
  $$(".tab").forEach((t) => t.setAttribute("aria-selected", t === b));
  pillTo($("#tabs"), b, true);
  b.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  renderDishes();
});

/* ---------- dishes: carousel, list, or bar card for drinks ---------- */
function renderDishes() {
  const el = $("#dishes");
  // "is-entering" pauses scroll snapping before the new cards exist (see renderCards)
  el.className = view === "cards" ? "carousel is-entering" : "grid";
  $("#cardnav").hidden = view !== "cards";
  if (view === "list") renderList();
  else renderCards();
  icons();
  if (view === "cards") updateFocus(); // set scales before paint so nothing snaps a frame later
}
function renderCards() {
  const el = $("#dishes");
  el.innerHTML =
    `<div class="spacer" aria-hidden="true"></div>` +
    MENU[cur]
      .map(
        (d, i) => `
    <article class="card is-entering" style="--i:${i}" data-open="${d.id}">
      <button type="button" class="card-open" aria-label="${d.n}, подробнее">
        <span class="plate">${img(d)}</span>
        <span class="card-name">${d.n}</span>
      </button>
      ${amount(d) && !multi(d) ? `<span class="chip"><i data-lucide="weight"></i>${amount(d)}</span>` : ""}
      ${sizes(d)}
      ${d.d ? `<p class="card-desc">${d.d}</p>` : ""}
      ${kbju(d) ? `<div class="card-kbju" data-kbju="${d.id}">${kbju(d).map((n, k) => `<div><b data-k="${k}">${n}</b><span>${KBJU_LABELS[k]}</span></div>`).join("")}</div>` : ""}
      <div class="foot"><span class="cprice" data-price="${d.id}">${fmt(price(d))}</span><span data-ctl="${d.id}">${ctl(keyOf(d))}</span></div>
    </article>`
      )
      .join("") +
    `<div class="spacer" aria-hidden="true"></div>`;
  const n = MENU[cur].length;
  $("#dots").innerHTML = n <= 8 ? MENU[cur].map(() => `<span class="dot"></span>`).join("") : `<span class="counter" id="counter"></span>`;
  el.scrollLeft = 0;
  // Snapping is paused while the cards slide in: Chrome/Safari would otherwise snap to the card's
  // animated (translated) position and leave the carousel 48px off-centre.
  el.classList.add("is-entering");
  clearTimeout(renderCards.t);
  renderCards.t = setTimeout(() => {
    $$(".card.is-entering", el).forEach((c) => c.classList.remove("is-entering"));
    el.classList.remove("is-entering");
  }, 1200);
}
function renderList() {
  $("#dishes").innerHTML = MENU[cur]
    .map(
      (d, i) => `
    <article class="dish" style="--i:${i}" data-open="${d.id}">
      <div class="pic">${img(d)}</div>
      <div class="body">
        <h3><button type="button" class="linkish">${d.n}</button></h3>
        ${amount(d) && !multi(d) ? `<span class="w">${amount(d)}</span>` : ""}
        ${d.d ? `<p>${d.d}</p>` : ""}
        ${sizes(d)}
        <div class="row"><span class="price" data-price="${d.id}">${fmt(price(d))}</span><span data-ctl="${d.id}">${ctl(keyOf(d))}</span></div>
      </div>
    </article>`
    )
    .join("");
}
function refresh(id) {
  const d = BYID[id];
  $$(`[data-ctl="${id}"]`).forEach((e) => (e.innerHTML = ctl(keyOf(d), e.hasAttribute("data-big"))));
  $$(`[data-price="${id}"]`).forEach((e) => popText(e, fmt(price(d))));
  const v = kbju(d);
  $$(`[data-kbju="${id}"]`).forEach((box) => {
    $$("b[data-k]", box).forEach((b) => popText(b, String(v[+b.dataset.k])));
    const cap = box.nextElementSibling;
    if (cap && cap.classList.contains("kbju-cap") && d.s) cap.textContent = "На " + d.s[si(d)][0];
  });
  $$(`[data-size^="${id}|"]`).forEach((b) => b.setAttribute("aria-pressed", b.dataset.size === keyOf(d)));
  icons();
}

/* scale and fade cards by their distance from the carousel centre */
function updateFocus() {
  raf = 0;
  const c = $("#dishes");
  if (!c.classList.contains("carousel")) return;
  const mid = c.scrollLeft + c.clientWidth / 2;
  const cards = $$(".card", c);
  let best = 0, bd = Infinity;
  cards.forEach((el, i) => {
    const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
    if (dist < bd) { bd = dist; best = i; }
    el.style.setProperty("--t", Math.max(0, 1 - dist / (el.offsetWidth + 16)).toFixed(3));
  });
  $$("#dots .dot").forEach((e, i) => e.classList.toggle("on", i === best));
  const ctr = $("#counter");
  if (ctr) ctr.textContent = `${best + 1} из ${cards.length}`;
}
$("#dishes").addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(updateFocus); }, { passive: true });
addEventListener("resize", () => requestAnimationFrame(updateFocus));
function step(dir) {
  const c = $("#dishes"), card = $(".card", c);
  if (card) c.scrollBy({ left: dir * (card.offsetWidth + 16), behavior: "smooth" });
}
$("#prev").addEventListener("click", () => step(-1));
$("#next").addEventListener("click", () => step(1));
$$("[data-view]").forEach((b) =>
  b.addEventListener("click", () => {
    view = b.dataset.view;
    $$("[data-view]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    pillTo($(".viewtoggle"), b, true);
    renderDishes();
  })
);

/* ---------- sheets (cart, dish): iOS-safe scroll lock, swipe down to close ---------- */
const scrim = $("#scrim");
let openSheet = null, lockY = 0;

function lockScroll(on) {
  const b = document.body, html = document.documentElement;
  if (on) {
    lockY = window.scrollY;
    Object.assign(b.style, { position: "fixed", top: `-${lockY}px`, left: "0", right: "0" });
  } else {
    Object.assign(b.style, { position: "", top: "", left: "", right: "" });
    html.style.scrollBehavior = "auto";
    window.scrollTo(0, lockY);
    html.style.scrollBehavior = "";
  }
}
function showSheet(el) {
  if (openSheet === el) return;
  if (openSheet) hideSheet(false);
  else lockScroll(true);
  openSheet = el;
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  scrim.classList.add("open");
  el.scrollTop = 0;
  shelfAutoplay(false);
}
function hideSheet(unlock = true) {
  if (!openSheet) return;
  closeTime();
  openSheet.classList.remove("open");
  openSheet.setAttribute("aria-hidden", "true");
  openSheet = null;
  if (unlock) {
    scrim.classList.remove("open");
    lockScroll(false);
    shelfAutoplay(true);
  }
}
scrim.addEventListener("click", () => hideSheet());
$$("[data-close]").forEach((b) => b.addEventListener("click", () => hideSheet()));

$$(".sheet").forEach((sheet) => {
  let y0 = null, t0 = 0, dy = 0, dragging = false;
  sheet.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || e.target.closest(".time-menu, input, textarea")) { y0 = null; return; }
    y0 = e.touches[0].clientY; t0 = e.timeStamp; dy = 0; dragging = false;
  }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (y0 === null) return;
    const d = e.touches[0].clientY - y0;
    if (!dragging) {
      if (d > 6 && sheet.scrollTop <= 0) { dragging = true; sheet.style.transition = "none"; }
      else if (Math.abs(d) > 6) { y0 = null; return; } // a normal scroll, leave it alone
      else return;
    }
    e.preventDefault(); // stop iOS from rubber-banding the content instead of moving the sheet
    dy = Math.max(0, d);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: false });
  const end = (e) => {
    if (!dragging) { y0 = null; return; }
    const fast = dy / Math.max(1, e.timeStamp - t0) > 0.6; // a quick flick closes it too
    dragging = false; y0 = null;
    sheet.style.transition = "";
    sheet.style.transform = "";
    if (dy > 90 || (fast && dy > 30)) hideSheet();
  };
  sheet.addEventListener("touchend", end);
  sheet.addEventListener("touchcancel", end);
});

$$("[data-drag]").forEach((head) => {
  const sheet = head.closest(".sheet");
  let y0 = null, dy = 0;
  head.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.target.closest("button")) return; // touch is handled above
    y0 = e.clientY; dy = 0;
    sheet.style.transition = "none";
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener("pointermove", (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    sheet.style.transition = "";
    sheet.style.transform = "";
    if (dy > 90) hideSheet();
  };
  head.addEventListener("pointerup", end);
  head.addEventListener("pointercancel", end);
});

/* ---------- dish detail ---------- */
function openDish(id) {
  const d = BYID[id];
  if (!d) return;
  $("#dBody").innerHTML = `
    <div class="d-hero">${img(d, "d-photo", false)}</div>
    <div class="d-info">
      <h2 id="dTitle">${d.n}</h2>
      ${amount(d) ? `<span class="chip chip-light"><i data-lucide="weight"></i>${amount(d)}</span>` : ""}
      ${d.d ? `<p class="d-desc">${d.d}</p>` : ""}
      ${sizes(d)}
      ${kbjuBlock(d)}
      <div class="d-buy">
        <span class="d-price" data-price="${d.id}">${fmt(price(d))}</span>
        <span data-ctl="${d.id}" data-big>${ctl(keyOf(d), true)}</span>
      </div>
    </div>`;
  icons();
  showSheet($("#dishSheet"));
}

/* ---------- cart ---------- */
const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
const total = () =>
  Object.keys(cart).reduce((s, k) => {
    const [id, i] = k.split("|");
    return s + price(BYID[id], +i) * cart[k];
  }, 0);

function renderCart() {
  const n = count(), sum = total(), keys = Object.keys(cart);
  $("#dockBadge").dataset.open = String(n > 0);
  document.body.classList.toggle("has-cart", n > 0);
  if (n) popText($("#dockCount"), String(n));
  $$("[data-cart-label]").forEach((e) => popText(e, n ? fmt(sum) : "Корзина"));
  if ($("#sum").textContent !== fmt(sum)) popText($("#sum"), fmt(sum));
  $("#lines").innerHTML = keys.length
    ? keys
        .map((k) => {
          const [id, i] = k.split("|"), d = BYID[id];
          const thumb = `<span class="line-pic">${img(d)}</span>`;
          return `<div class="line">${thumb}<div><div class="n">${d.n}${multi(d) ? ", " + d.s[i][0] : ""}</div><div class="p">${cart[k]} × ${fmt(price(d, +i))}</div></div>${ctl(k)}</div>`;
        })
        .join("")
    : `<div class="empty">Корзина пуста. Добавьте что-нибудь из меню.</div>`;
  $("#checkout").hidden = !keys.length;
  icons();
}
function openCart() {
  $("#cartView").hidden = false;
  $("#done").hidden = true;
  renderCart();
  fillTimes();
  showSheet($("#sheet"));
}

document.addEventListener("click", (e) => {
  const sz = e.target.closest("[data-size]");
  const inc = e.target.closest("[data-inc]");
  const dec = e.target.closest("[data-dec]");
  const open = e.target.closest("[data-open]");
  if (sz) {
    const [id, i] = sz.dataset.size.split("|");
    sel[id] = +i;
    refresh(id);
    return;
  }
  if (inc) {
    const k = inc.dataset.inc;
    cart[k] = (cart[k] || 0) + 1;
    if (cart[k] === 1) {
      const d = BYID[k.split("|")[0]], i = +k.split("|")[1];
      toast(`Добавлено: ${d.n}${multi(d) ? ", " + d.s[i][0] : ""}`);
    }
    refresh(k.split("|")[0]);
    renderCart();
    const dc = $("#dockCart");
    dc.classList.remove("bump");
    void dc.offsetWidth;
    dc.classList.add("bump");
    return;
  }
  if (dec) {
    const k = dec.dataset.dec;
    cart[k] = Math.max(0, (cart[k] || 0) - 1);
    if (!cart[k]) delete cart[k];
    refresh(k.split("|")[0]);
    renderCart();
    return;
  }
  if (open) return openDish(open.dataset.open);
  if (e.target.closest("[data-open-cart]")) openCart();
});

/* ---------- checkout form ---------- */
/* ---------- custom time picker (menu dropdown from transitions.dev) ---------- */
const ASAP = "Как можно скорее";
const timeBtn = $("#f-time"), timeMenu = $("#timeMenu");
function fillTimes() {
  const now = new Date(), t = new Date(now), slots = [];
  t.setMinutes(Math.ceil((now.getMinutes() + 30) / 15) * 15, 0, 0);
  for (let i = 0; i < 12; i++) {
    slots.push(t.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
    t.setMinutes(t.getMinutes() + 15);
  }
  const cur = $("#timeInput").value;
  const pick = cur === ASAP || slots.includes(cur) ? cur : ASAP;
  const opt = (v, cls = "") =>
    `<button type="button" class="topt ${cls}" role="option" data-time="${v}" aria-selected="${v === pick}" tabindex="-1">${cls ? '<i data-lucide="zap"></i>' : ""}${v}</button>`;
  timeMenu.innerHTML = opt(ASAP, "asap") + `<div class="time-cap">Ко времени, сегодня</div><div class="time-grid">${slots.map((v) => opt(v)).join("")}</div>`;
  setTime(pick);
  icons();
}
function setTime(v) {
  $("#timeInput").value = v;
  $("#timeValue").textContent = v === ASAP ? ASAP : "Сегодня к " + v;
  $$(".topt", timeMenu).forEach((o) => o.setAttribute("aria-selected", o.dataset.time === v));
}
const timeCloseMs = () => cssMs("--dropdown-close-dur", 150);
let timeHideT = 0;
function openTime() {
  // open upward when there is not enough room below inside the sheet
  const sheetBox = $("#sheet").getBoundingClientRect(), btn = timeBtn.getBoundingClientRect();
  const below = Math.min(innerHeight, sheetBox.bottom) - btn.bottom, above = btn.top - Math.max(0, sheetBox.top);
  timeMenu.dataset.origin = below < 300 && above > below ? "bottom-center" : "top-center";
  clearTimeout(timeHideT);
  timeMenu.hidden = false; // closed menu is out of layout so it doesn't stretch the sheet's scroll
  timeMenu.classList.remove("is-closing");
  void timeMenu.offsetWidth; // start the open transition from the closed state
  timeMenu.classList.add("is-open");
  timeBtn.setAttribute("aria-expanded", "true");
  const sel = $('.topt[aria-selected="true"]', timeMenu) || $(".topt", timeMenu);
  timeMenu.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function closeTime() {
  if (!timeMenu.classList.contains("is-open")) return;
  timeMenu.classList.remove("is-open");
  timeMenu.classList.add("is-closing");
  timeBtn.setAttribute("aria-expanded", "false");
  timeHideT = setTimeout(() => { timeMenu.classList.remove("is-closing"); timeMenu.hidden = true; }, timeCloseMs());
}
timeBtn.addEventListener("click", () => (timeMenu.classList.contains("is-open") ? closeTime() : openTime()));
timeMenu.addEventListener("click", (e) => {
  const o = e.target.closest(".topt");
  if (!o) return;
  setTime(o.dataset.time);
  closeTime();
});
document.addEventListener("click", (e) => {
  if (timeMenu.classList.contains("is-open") && !e.target.closest(".select-wrap")) closeTime();
});
$$('input[name="how"]').forEach((r) => r.addEventListener("change", () => ($("#addrField").hidden = $("#how-pick").checked)));
/* phone mask: +7 (XXX) XXX-XX-XX. Separators are only added once the next digit exists,
   so backspace always deletes a digit instead of getting stuck on ")" or "-". */
const tel = $("#f-phone");
function maskPhone(d) {
  if (!d) return "";
  let s = "+7 (" + d.slice(0, 3);
  if (d.length > 3) s += ") " + d.slice(3, 6);
  if (d.length > 6) s += "-" + d.slice(6, 8);
  if (d.length > 8) s += "-" + d.slice(8, 10);
  return s;
}
function phoneDigits(v) {
  let d = v.replace(/\D/g, "");
  if (v.trim().startsWith("+7")) d = d.slice(1);                       // our own prefix
  else if (d.length === 11 && /^[78]/.test(d)) d = d.slice(1);           // pasted 8XXXXXXXXXX / 7XXXXXXXXXX
  return d.slice(0, 10);
}
tel.addEventListener("focus", () => { if (!tel.value) tel.value = "+7 ("; });
tel.addEventListener("blur", () => { if (!phoneDigits(tel.value)) tel.value = ""; });
tel.addEventListener("input", () => {
  const d = phoneDigits(tel.value);
  tel.value = d ? maskPhone(d) : (document.activeElement === tel ? "+7 (" : "");
  tel.setSelectionRange(tel.value.length, tel.value.length);
});

function setErr(id, msg) {
  const input = $("#f-" + id), wrap = input.closest(".field");
  if (msg) {
    $("#e-" + id).textContent = msg;
    showError(wrap, input);
  } else clearError(wrap, input);
  input.setAttribute("aria-invalid", msg ? "true" : "false");
  return !msg;
}
function validate() {
  const name = $("#f-name").value.trim();
  const digits = phoneDigits($("#f-phone").value);
  const del = $("#how-del").checked;
  const ok = [
    setErr("name", name ? "" : "Как к вам обращаться?"),
    setErr("phone", digits.length === 10 ? "" : "Введите номер полностью, чтобы мы перезвонили"),
    setErr("addr", !del || $("#f-addr").value.trim() ? "" : "Укажите улицу и дом"),
  ];
  const firstBad = ["name", "phone", "addr"].find((f, i) => !ok[i]);
  if (firstBad) $("#f-" + firstBad).focus();
  return !firstBad;
}
["name", "phone", "addr"].forEach((f) =>
  $("#f-" + f).addEventListener("input", () => clearError($("#f-" + f).closest(".field"), $("#f-" + f)))
);
$("#orderForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validate()) return;
  $("#cartView").hidden = true;
  $("#done").hidden = false;
  showCheck();
  for (const k in cart) delete cart[k];
  renderCart();
  renderDishes();
});
$("#again").addEventListener("click", () => {
  hideSheet();
  document.getElementById("menu").scrollIntoView({ behavior: "smooth" });
});

/* ---------- top bar + dock state ---------- */
new IntersectionObserver(([en]) => document.body.classList.toggle("scrolled", !en.isIntersecting), {
  rootMargin: "-70px 0px 0px 0px",
}).observe($("#heroLogo"));

const io = new IntersectionObserver(
  (es) =>
    es.forEach((en) => {
      if (!en.isIntersecting) return;
      $$(".dock [data-sec]").forEach((a) => a.classList.toggle("on", a.dataset.sec === en.target.id));
      document.body.dataset.sec = en.target.id; // phones: the dock is hidden on the hero while the cart is empty
    }),
  { rootMargin: "-45% 0px -50% 0px" }
);
["home", "menu", "contacts"].forEach((id) => io.observe(document.getElementById(id)));

/* ---------- no zoom on iOS Safari (it ignores user-scalable=no) ---------- */
// pinch gestures; double-tap zoom is already off via touch-action: manipulation in CSS
["gesturestart", "gesturechange", "gestureend"].forEach((t) => document.addEventListener(t, (e) => e.preventDefault()));

/* ---------- no keyboard control, no focus on buttons ---------- */
// nothing is reachable by Tab; a clicked button/link drops focus so Enter/Space can't re-trigger it
const typing = (el) => el && el.matches("input:not([type=radio]):not([type=hidden]), textarea, select");
// only the navigation keys are blocked: F12, F5, Cmd/Ctrl shortcuts etc. keep working
const NAV_KEYS = new Set(["Tab", "Enter", " ", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"]);
document.addEventListener("keydown", (e) => {
  if (!NAV_KEYS.has(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (typing(e.target) && e.key !== "Tab") return; // still type into the form fields
  e.preventDefault();
}, true);
document.addEventListener("click", (e) => {
  const b = e.target.closest("button, a, label, [tabindex]");
  if (b && !typing(document.activeElement)) document.activeElement?.blur();
}, true);

/* ---------- start ---------- */
renderTabs();
renderDishes();
renderCart();
icons();

requestAnimationFrame(placePills);
document.fonts && document.fonts.ready.then(placePills);
addEventListener("resize", placePills);

// texts reveal: section headings rise in once, when they scroll into view
const revealIO = new IntersectionObserver(
  (es) => es.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add("is-shown");
    revealIO.unobserve(en.target);
  }),
  { rootMargin: "0px 0px -12% 0px" }
);
$$("[data-reveal]").forEach((el) => {
  el.classList.add("t-stagger");
  revealIO.observe(el);
});
