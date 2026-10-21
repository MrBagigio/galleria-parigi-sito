(() => {
  "use strict";

  const DATI = JSON.parse(document.getElementById("dati").textContent);
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs = {}, ...figli) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const f of figli.flat()) if (f != null && f !== false) n.append(f.nodeType ? f : document.createTextNode(f));
    return n;
  };
  const GATE = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"];
  const NOMI_GATE = {
    E1: "Licenza", E2: "Fotografia vera", E3: "Porte-finestre", E4: "Spina di pesce",
    E5: "Boiserie", E6: "Soffitto liscio", E7: "Niente testi o persone", E8: "Pareti laterali",
  };
  const scaricabile = v => v.pubblicazione === "scaricabile";
  // le foto "solo riferimento" (Envato) si guardano sul sito della fonte: qui niente file
  const doveGuardare = v => (/envato/i.test(v.fonte || "") ? "Envato" : v.fonte || "la fonte");
  async function chiediAle(voci) {
    const testo = (voci.length === 1 ? "Ale, mi serve questa foto:" : `Ale, mi servono queste ${voci.length} foto:`) + "\n" +
      voci.map(v => `- ${v.id} · ${v.titolo || ""}${v.pagina ? "\n  " + v.pagina : ""}`).join("\n");
    if (navigator.share) {
      try { await navigator.share({ text: testo }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(testo); avviso("Messaggio copiato: incollalo ad Ale"); }
    catch { avviso(`Scrivi ad Ale: ${voci.map(v => v.id).join(", ")}`); }
  }
  const mb = n => (n / 1048576).toFixed(n > 10485760 ? 0 : 1).replace(".", ",") + " MB";
  const punti = n => (Math.round(n * 10) / 10).toString().replace(".", ",");
  const due = n => String(n).padStart(2, "0");
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  const ESITI = ["rosa", "quasi", "da_verificare", "scartata"];
  const RANGO = Object.fromEntries(ESITI.map((k, i) => [k, i]));
  const NOME_ESITO = { rosa: "In rosa", quasi: "Quasi", da_verificare: "Da verificare", scartata: "Scartata" };
  const COLORE_ESITO = { rosa: "var(--e-rosa)", quasi: "var(--e-quasi)", da_verificare: "var(--e-verif)", scartata: "var(--e-scart)" };
  // lo ZIP si costruisce in memoria: su telefono oltre ~300 MB la pagina rischia di essere chiusa dal sistema
  const telefono = isIOS || /Android/i.test(navigator.userAgent);
  const MAX_ZIP = (telefono ? 300 : 1500) * 1048576;

  const lato = v => Math.max(v.w || 0, v.h || 0);
  const FACCETTE = [
    { k: "raccolta", nome: "Raccolta", val: v => v.raccolta || "—", soloSePiu: true },
    { k: "esito", nome: "Esito", val: v => v.esito, ordine: (a, b) => (RANGO[a] ?? 9) - (RANGO[b] ?? 9), etichetta: x => NOME_ESITO[x] || x, colore: x => COLORE_ESITO[x] },
    { k: "fonte", nome: "Fonte", val: v => v.fonte || "—" },
    { k: "licenza", nome: "Licenza", val: v => v.licenza || "—" },
    { k: "orient", nome: "Orientamento", val: v => !v.w ? "—" : v.w > v.h * 1.05 ? "Orizzontale" : v.h > v.w * 1.05 ? "Verticale" : "Quadrata",
      ordine: (a, b) => ["Orizzontale", "Verticale", "Quadrata", "—"].indexOf(a) - ["Orizzontale", "Verticale", "Quadrata", "—"].indexOf(b) },
    { k: "ris", nome: "Risoluzione, lato lungo", val: v => !lato(v) ? "—" : lato(v) >= 3000 ? "3000 px e oltre" : lato(v) >= 2000 ? "2000–2999 px" : "sotto 2000 px",
      ordine: (a, b) => ["3000 px e oltre", "2000–2999 px", "sotto 2000 px", "—"].indexOf(a) - ["3000 px e oltre", "2000–2999 px", "sotto 2000 px", "—"].indexOf(b) },
  ];
  // singolare e plurale: "porte" trova anche "porta", "finestre" anche "finestra"
  const radice = t => (t.length > 4 ? t.replace(/[aeio]$/, "") : t);
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const v of DATI) v._testo = norm([v.id, v.titolo, v.note, v.autore, v.fonte, v.licenza, v.raccolta, NOME_ESITO[v.esito], v.attribuzione].join(" "));

  const stato = {
    sel: Object.fromEntries(FACCETTE.map(f => [f.k, new Set()])), gate: new Set(), q: "",
    ordina: "punteggio", vista: [], modo: ls.get("archivio-vista") === "elenco" ? "elenco" : "griglia",
    selezione: false, scelte: new Set(),
  };
  const griglia = $("#griglia"), righe = $("#righe");
  const schede = new Map();

  /* ---------- filtri ---------- */
  const passa = (v, salta) => {
    for (const f of FACCETTE) if (f.k !== salta && stato.sel[f.k].size && !stato.sel[f.k].has(f.val(v))) return false;
    if (salta !== "gate") for (const g of stato.gate) if (v.gate[g] === false) return false;
    if (stato.q) for (const t of stato.q.split(/[\s-]+/)) if (t && !v._testo.includes(radice(t))) return false;
    return true;
  };
  function faccette() {
    const box = $("#faccette");
    box.replaceChildren();
    for (const f of FACCETTE) {
      const tutti = [...new Set(DATI.map(f.val))].sort(f.ordine || ((a, b) => a.localeCompare(b, "it")));
      if (f.soloSePiu && tutti.length < 2) continue;
      const base = DATI.filter(v => passa(v, f.k));
      const sez = el("section", { class: "faccetta" }, el("h3", {}, f.nome));
      for (const x of tutti) {
        const n = base.filter(v => f.val(v) === x).length;
        const cb = el("input", { type: "checkbox" });
        cb.checked = stato.sel[f.k].has(x);
        cb.addEventListener("change", () => { cb.checked ? stato.sel[f.k].add(x) : stato.sel[f.k].delete(x); aggiorna(); });
        sez.append(el("label", { class: n || cb.checked ? "" : "zero" }, cb,
          f.colore ? el("span", { class: "pallino", style: `background:${f.colore(x)}` }) : null,
          el("span", {}, f.etichetta ? f.etichetta(x) : x), el("span", { class: "n" }, String(n))));
      }
      box.append(sez);
    }
    const base = DATI.filter(v => passa(v, "gate"));
    const sez = el("section", { class: "faccetta" }, el("h3", {}, "Criterio rispettato"));
    for (const g of GATE) {
      const n = base.filter(v => v.gate[g] !== false).length;
      const cb = el("input", { type: "checkbox" });
      cb.checked = stato.gate.has(g);
      cb.addEventListener("change", () => { cb.checked ? stato.gate.add(g) : stato.gate.delete(g); aggiorna(); });
      sez.append(el("label", {}, cb, el("span", {}, `${g} · ${NOMI_GATE[g]}`), el("span", { class: "n" }, String(n))));
    }
    box.append(sez);
  }
  function attivi() {
    const box = $("#attivi");
    const chip = (testo, via) => el("button", { type: "button", title: "Togli", onclick: () => { via(); aggiorna(); } }, testo);
    const lista = [];
    for (const f of FACCETTE) for (const x of stato.sel[f.k]) lista.push(chip(f.etichetta ? f.etichetta(x) : x, () => stato.sel[f.k].delete(x)));
    for (const g of stato.gate) lista.push(chip(`${g} rispettato`, () => stato.gate.delete(g)));
    if (stato.q) lista.push(chip(`«${$("#cerca").value.trim()}»`, () => { stato.q = ""; $("#cerca").value = ""; }));
    box.replaceChildren(...lista);
    $("#nFiltri").textContent = lista.length ? `(${lista.length})` : "";
  }
  function azzera() {
    for (const f of FACCETTE) stato.sel[f.k].clear();
    stato.gate.clear(); stato.q = ""; $("#cerca").value = "";
    aggiorna();
  }
  $("#azzera").addEventListener("click", azzera);
  $("#azzera2").addEventListener("click", azzera);
  let timerQ;
  $("#cerca").addEventListener("input", e => { clearTimeout(timerQ); timerQ = setTimeout(() => { stato.q = norm(e.target.value.trim()); aggiorna(); }, 120); });
  $("#cerca").addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });
  $("#ordina").addEventListener("change", e => { stato.ordina = e.target.value; aggiorna(); });
  document.querySelectorAll(".elenco th[data-ord]").forEach(th => th.addEventListener("click", () => {
    stato.ordina = th.dataset.ord === "esito" ? "esito" : th.dataset.ord;
    if ([...$("#ordina").options].some(o => o.value === stato.ordina)) $("#ordina").value = stato.ordina;
    aggiorna();
  }));

  // filtri su telefono: foglio dal basso
  const apriFiltri = on => { document.body.classList.toggle("filtri-aperti", on); $("#velo").hidden = !on; document.body.classList.toggle("bloccato", on); };
  $("#apriFiltri").addEventListener("click", () => apriFiltri(true));
  $("#chiudiFiltri").addEventListener("click", () => apriFiltri(false));
  $("#mostraRisultati").addEventListener("click", () => apriFiltri(false));
  $("#velo").addEventListener("click", () => apriFiltri(false));

  function calcolaVista() {
    const v = DATI.filter(x => passa(x));
    const pix = x => (x.w || 0) * (x.h || 0);
    const ord = {
      punteggio: (a, b) => b.punteggio - a.punteggio || (RANGO[a.esito] ?? 9) - (RANGO[b.esito] ?? 9) || pix(b) - pix(a),
      risoluzione: (a, b) => pix(b) - pix(a) || b.punteggio - a.punteggio,
      titolo: (a, b) => (a.titolo || a.id).localeCompare(b.titolo || b.id, "it"),
      fonte: (a, b) => a.fonte.localeCompare(b.fonte, "it") || b.punteggio - a.punteggio,
      esito: (a, b) => (RANGO[a.esito] ?? 9) - (RANGO[b.esito] ?? 9) || b.punteggio - a.punteggio,
      id: (a, b) => a.id.localeCompare(b.id, "it", { numeric: true }),
    }[stato.ordina] || (() => 0);
    return v.sort(ord);
  }

  /* ---------- griglia ed elenco ---------- */
  const spunta = () => el("span", { class: "spunta", "aria-hidden": "true", html: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>' });
  const attesaAnteprime = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { attesaAnteprime.unobserve(e.target); e.target._quandoVisibile(); }
  }), { rootMargin: "200px" }) : null;
  const osservaAnteprima = (box, fn) => { if (attesaAnteprime) { box._quandoVisibile = fn; attesaAnteprime.observe(box); } else fn(); };
  function miniatura(v, classe) {
    if (!scaricabile(v)) {
      const tessera = () => el("div", { class: "rif" },
        el("span", { class: "rif-fonte" }, doveGuardare(v)),
        classe === "thumb" ? null : el("span", { class: "rif-nota" }, v.note || ""));
      if (!v.anteprima) return el("div", { class: classe }, tessera());
      // anteprima della fonte, collegata e non copiata; se non carica si torna alla scheda senza immagine
      const box = el("div", { class: `${classe} con-anteprima` });
      const img = el("img", { alt: "", loading: "lazy", decoding: "async", draggable: "false", referrerpolicy: "no-referrer", src: v.anteprima });
      let fatta = false;
      const ripiega = () => {  // senza anteprima: la scheda con titolo e nota, tenendo badge e spunta
        if (fatta || img.classList.contains("caricata")) return;
        fatta = true;
        box.classList.remove("con-anteprima");
        box.replaceChildren(tessera(), ...[...box.children].filter(c => c !== img && !c.classList.contains("etichetta-ap")));
      };
      img.addEventListener("load", () => img.classList.add("caricata"));
      img.addEventListener("error", ripiega);
      // un indirizzo che non risponde non da' mai "error": dopo 15 s da quando e' visibile si ripiega
      osservaAnteprima(box, () => setTimeout(() => { if (!(img.complete && img.naturalWidth)) ripiega(); }, 15000));
      box.append(img);
      if (classe !== "thumb") box.append(el("span", { class: "etichetta-ap" }, "Anteprima Envato"));
      return box;
    }
    const img = el("img", { alt: "", loading: "lazy", decoding: "async", draggable: "false", src: v.img.t480,
      srcset: `${v.img.t480} 480w, ${v.img.t960} 960w`, sizes: classe === "thumb" ? "76px" : "(max-width: 699px) 50vw, 240px" });
    const fatto = () => img.classList.add("caricata");
    img.addEventListener("load", fatto); if (img.complete && img.naturalWidth) fatto();
    return el("div", { class: classe, style: `background-image:url("${v.lqip}")` }, img);
  }
  function carta(v) {
    const titolo = v.titolo || v.id;
    const m = miniatura(v, "miniatura");
    if (v.esito && v.esito !== "scartata") m.append(el("span", { class: `badge ${v.esito}` }, NOME_ESITO[v.esito] || v.esito));
    m.append(spunta());
    const fig = el("figure", { class: "carta", tabindex: "0", role: "button", "aria-label": `Apri ${v.id}: ${titolo}` },
      m, el("figcaption", {},
        el("span", { class: "t", title: titolo }, titolo),
        el("span", { class: "m" }, el("span", { class: `esito ${v.esito}` }, NOME_ESITO[v.esito] || ""), "·",
          el("span", { class: "voto" }, punti(v.punteggio)), "·", el("span", {}, v.fonte))));
    return collega(fig, v);
  }
  function riga(v) {
    const titolo = v.titolo || v.id;
    const t = miniatura(v, "thumb");
    t.append(spunta());
    const tr = el("tr", { tabindex: "0" },
      el("td", { class: "c-img" }, t),
      el("td", { class: "c-id id" }, v.id),
      el("td", { class: "c-tit" }, el("div", { class: "tit" }, titolo), v.note ? el("div", { class: "nota" }, v.note) : null),
      el("td", { class: "c-esito" }, el("span", { class: `esito ${v.esito}` }, NOME_ESITO[v.esito] || "")),
      el("td", { class: "c-voto voto" }, punti(v.punteggio)),
      el("td", { class: "c-fonte" }, v.fonte),
      el("td", { class: "c-lic lic" }, v.licenza),
      el("td", { class: "c-px px" }, v.w ? `${v.w}×${v.h}` : ""),
      el("td", { class: "c-gate" }, el("span", { class: "puntini", title: GATE.map(g => `${g} ${v.gate[g] === true ? "sì" : v.gate[g] === false ? "no" : "n/a"}`).join(" · ") },
        GATE.map(g => el("i", { class: v.gate[g] === true ? "si" : v.gate[g] === false ? "no" : "" })))),
      el("td", { class: "c-meta" }, el("span", { class: `esito ${v.esito}` }, NOME_ESITO[v.esito] || ""), ` · ${v.id} · ${v.fonte} · ${v.w ? v.w + "×" + v.h : ""}`),
      el("td", { class: "c-nota" }, v.note ? el("div", { class: "nota" }, v.note) : null));
    return collega(tr, v);
  }
  function collega(n, v) {
    n._v = v;
    n.addEventListener("click", () => tocca(n));
    n.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tocca(n); } });
    return n;
  }
  function tocca(n) {
    const v = n._v;
    if (stato.selezione) {
      stato.scelte.has(v.id) ? stato.scelte.delete(v.id) : stato.scelte.add(v.id);
      document.querySelectorAll(`[data-id="${CSS.escape(v.id)}"]`).forEach(x => x.classList.toggle("scelta", stato.scelte.has(v.id)));
      aggiornaSel();
    } else apri(stato.vista.indexOf(v));
  }

  function disegna() {
    stato.vista = calcolaVista();
    const elenco = stato.modo === "elenco";
    $("#griglia").hidden = elenco; $("#elenco").hidden = !elenco;
    $("#vistaGriglia").setAttribute("aria-pressed", String(!elenco));
    $("#vistaElenco").setAttribute("aria-pressed", String(elenco));
    document.querySelectorAll(".elenco th[data-ord]").forEach(th => th.classList.toggle("attivo", th.dataset.ord === stato.ordina));
    const chiave = elenco ? "r:" : "c:";
    const nodi = stato.vista.map((v, i) => {
      let n = schede.get(chiave + v.id);
      if (!n) { n = elenco ? riga(v) : carta(v); n.dataset.id = v.id; schede.set(chiave + v.id, n); }
      n.classList.toggle("scelta", stato.scelte.has(v.id));
      if (!elenco) n.style.animationDelay = `${Math.min(i, 16) * 18}ms`;
      return n;
    });
    (elenco ? righe : griglia).replaceChildren(...nodi);
    const n = stato.vista.length;
    $("#conta").innerHTML = `<b>${n}</b> ${n === 1 ? "immagine" : "immagini"}${n !== DATI.length ? ` su ${DATI.length}` : ""}`;
    $("#mostraRisultati").textContent = `Mostra ${n} ${n === 1 ? "immagine" : "immagini"}`;
    $("#vuoto").hidden = n > 0;
  }
  function aggiorna() { faccette(); attivi(); disegna(); }
  const cambiaModo = m => { stato.modo = m; ls.set("archivio-vista", m); disegna(); };
  $("#vistaGriglia").addEventListener("click", () => cambiaModo("griglia"));
  // "Dimentica questo dispositivo": toglie la chiave ricordata, la prossima volta si chiede la password
  $("#dimentica").addEventListener("click", () => {
    try { Object.keys(localStorage).filter(k => k.startsWith("galleria-chiave-")).forEach(k => localStorage.removeItem(k)); } catch {}
    avviso("Fatto: la prossima volta ti chiedo la password.");
  });
  // "Sfoglia la raccolta": apre a tutto schermo la prima foto dei risultati, poi si scorre
  $("#sfoglia").addEventListener("click", () => { if (stato.vista.length) apri(0); });
  $("#vistaElenco").addEventListener("click", () => cambiaModo("elenco"));

  // altezza reale della testata (per filtri e intestazioni dell'elenco appiccicati sotto)
  const misuraTesta = () => document.documentElement.style.setProperty("--testa-h", $(".testa").offsetHeight - (parseFloat(getComputedStyle($(".testa")).paddingTop) || 0) + "px");
  addEventListener("resize", () => { misuraTesta(); if (lb.aperta) lb.mostra(lb.i, false); });
  misuraTesta();
  document.fonts && document.fonts.ready.then(misuraTesta);

  /* ---------- selezione e zip ---------- */
  function aggiornaSel() {
    document.body.classList.toggle("selezione", stato.selezione);
    $("#modoSel").setAttribute("aria-pressed", String(stato.selezione));
    $("#barraSel").hidden = !stato.selezione;
    const n = stato.scelte.size;
    $("#contaSel").textContent = n === 1 ? "1 selezionata" : `${n} selezionate`;
    const scelte = DATI.filter(v => stato.scelte.has(v.id));
    const nFile = scelte.filter(scaricabile).length, nRif = scelte.length - nFile;
    $("#scaricaSel").disabled = nFile === 0;
    $("#scaricaSel").textContent = nRif && nFile ? `Scarica ZIP (${nFile})` : "Scarica ZIP";
    $("#chiediSel").hidden = nRif === 0;
    $("#chiediSel").textContent = `Chiedi ad Ale (${nRif})`;
  }
  $("#modoSel").addEventListener("click", () => { stato.selezione = !stato.selezione; if (!stato.selezione) { stato.scelte.clear(); disegna(); } aggiornaSel(); });
  $("#chiudiSel").addEventListener("click", () => { stato.selezione = false; stato.scelte.clear(); disegna(); aggiornaSel(); });
  $("#selTutte").addEventListener("click", () => {
    const tutte = stato.vista;
    const giaTutte = tutte.every(v => stato.scelte.has(v.id));
    for (const v of tutte) giaTutte ? stato.scelte.delete(v.id) : stato.scelte.add(v.id);
    disegna(); aggiornaSel();
  });
  $("#scaricaSel").addEventListener("click", () => zip(DATI.filter(v => stato.scelte.has(v.id))));
  $("#chiediSel").addEventListener("click", () => chiediAle(DATI.filter(v => stato.scelte.has(v.id) && !scaricabile(v))));

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  /* zip "store" (senza compressione: i JPEG non si comprimono), nomi UTF-8 */
  function creaZip(file) {
    const enc = new TextEncoder();
    const d = new Date();
    const ora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const data = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parti = [], centrale = [];
    let off = 0;
    for (const f of file) {
      const nome = enc.encode(f.nome), crc = crc32(f.dati), n = f.dati.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, ora, true); h.setUint16(12, data, true); h.setUint32(14, crc, true);
      h.setUint32(18, n, true); h.setUint32(22, n, true); h.setUint16(26, nome.length, true); h.setUint16(28, 0, true);
      parti.push(h, nome, f.dati);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, ora, true); c.setUint16(14, data, true); c.setUint32(16, crc, true);
      c.setUint32(20, n, true); c.setUint32(24, n, true); c.setUint16(28, nome.length, true);
      c.setUint32(42, off, true);
      centrale.push(c, nome);
      off += 30 + nome.length + n;
    }
    const dimC = centrale.reduce((s, p) => s + p.byteLength, 0);
    const fine = new DataView(new ArrayBuffer(22));
    fine.setUint32(0, 0x06054b50, true); fine.setUint16(8, file.length, true); fine.setUint16(10, file.length, true);
    fine.setUint32(12, dimC, true); fine.setUint32(16, off, true);
    return new Blob([...parti, ...centrale, fine], { type: "application/zip" });
  }

  let zipInCorso = false;
  async function zip(voci) {
    voci = voci.filter(scaricabile);
    if (!voci.length || zipInCorso) return;
    zipInCorso = true;
    const tot = voci.reduce((s, v) => s + (v.peso || 0), 0);
    if (tot > MAX_ZIP) {
      zipInCorso = false;
      return avviso(`Selezione troppo grande: ${mb(tot)}. Uno ZIP arriva al massimo a ${mb(MAX_ZIP)}: dividila in più ZIP.`);
    }
    const t = avviso(`Preparo lo ZIP: 0 di ${voci.length} (${mb(tot)})`, { prog: true, fisso: true });
    try {
      const file = new Array(voci.length);
      let fatti = 0, n = 0, prossimo = 0;
      const lavora = async () => {  // 4 download alla volta, l'ordine nello ZIP resta quello della galleria
        while (prossimo < voci.length) {
          const k = prossimo++, v = voci[k];
          const r = await fetch(v.img.originale);
          if (!r.ok) throw new Error(`${v.nome_file}: ${r.status}`);
          file[k] = { nome: v.nome_file, dati: new Uint8Array(await r.arrayBuffer()) };
          fatti += v.peso || 0; n++;
          t.testo(`Preparo lo ZIP: ${n} di ${voci.length} (${mb(tot)})`);
          t.prog(tot ? fatti / tot : n / voci.length);
        }
      };
      await Promise.all([lavora(), lavora(), lavora(), lavora()]);
      file.push({ nome: "CREDITI.txt", dati: new TextEncoder().encode(crediti(voci)) });
      salva(creaZip(file), `interni-parigini-${voci.length}-immagini.zip`);
      t.testo(isIOS ? "ZIP pronto: lo trovi in File › Download" : "ZIP pronto");
      t.chiudi(3500);
    } catch (e) {
      t.testo("Download non riuscito: " + e.message); t.chiudi(5000);
    } finally { zipInCorso = false; }
  }

  function crediti(voci) {
    return "Crediti e licenze\r\n\r\n" + voci.map(v => [
      v.nome_file, `  Fonte: ${v.fonte} ${v.pagina || ""}`.trimEnd(), `  Autore: ${v.autore}`, `  Licenza: ${v.licenza}`,
      v.attribuzione ? `  Attribuzione: ${v.attribuzione}` : null,
    ].filter(Boolean).join("\r\n")).join("\r\n\r\n") + "\r\n";
  }

  function salva(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: nome, style: "display:none" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /* originali: il blob si prende in anticipo, cosi' la condivisione su iOS parte dentro il tocco */
  const blobCache = new Map();
  function prendiBlob(v) {
    if (!blobCache.has(v.id)) {
      const p = fetch(v.img.originale).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); });
      p.catch(() => blobCache.delete(v.id));
      blobCache.set(v.id, p);
    }
    return blobCache.get(v.id);
  }
  async function scaricaUna(v) {
    const t = avviso("Scarico l'originale…", { fisso: true });
    try {
      salva(await prendiBlob(v), v.nome_file);
      t.testo(isIOS ? "Fatto: lo trovi in File › Download" : "Download avviato"); t.chiudi(2600);
    } catch (e) { t.testo("Download non riuscito"); t.chiudi(4000); }
  }
  const puoCondividere = (() => {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(["x"])], "x.jpg", { type: "image/jpeg" })] })); }
    catch { return false; }
  })();

  /* ---------- avvisi ---------- */
  const toast = $("#toast");
  let timerToast;
  function avviso(msg, { prog = false, fisso = false } = {}) {
    clearTimeout(timerToast);
    toast.replaceChildren(el("div", {}, msg));
    let barraP;
    if (prog) { barraP = el("i"); toast.append(el("div", { class: "barra-prog" }, barraP)); }
    toast.classList.add("vista");
    const chiudi = ms => { clearTimeout(timerToast); timerToast = setTimeout(() => toast.classList.remove("vista"), ms); };
    if (!fisso) chiudi(3200);
    return { testo: s => (toast.firstChild.textContent = s), prog: f => barraP && (barraP.style.width = (f * 100).toFixed(1) + "%"), chiudi };
  }

  /* ---------- lightbox ---------- */
  const lbEl = $("#lb"), nastro = $("#lbNastro"), scena = $("#lbScena"), pannello = $("#lbPannello");
  const lb = { aperta: false, i: 0, slide: [], z: { s: 1, x: 0, y: 0 }, daStoria: false };

  function slide(v) {
    const s = el("div", { class: "lb-slide" });
    if (!v) return s;
    if (scaricabile(v)) {
      const cornice = el("div", { class: "lb-cornice" });
      const lq = el("img", { class: "lqip", src: v.lqip, alt: "", "aria-hidden": "true" });
      const alta = el("img", { class: "alta", alt: v.titolo || v.autore || "", draggable: "false", decoding: "async" });
      cornice.append(lq, alta);
      // CC BY / BY-SA: l'attribuzione e' un obbligo della licenza, si vede sempre sotto la foto
      if (v.attribuzione) cornice.append(el("p", { class: "lb-credito" }, v.attribuzione));
      s.append(cornice);
      s._dimensiona = () => {
        const r = scena.getBoundingClientRect(), cs = getComputedStyle(s);
        const W = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const H = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const k = Math.min(W / v.w, H / v.h, 1.5);
        cornice.style.width = v.w * k + "px"; cornice.style.height = v.h * k + "px";
        alta.style.width = "100%"; alta.style.height = "100%";
      };
      s._carica = () => {
        if (alta.src) return;
        alta.addEventListener("load", () => { alta.classList.add("caricata"); cornice.classList.add("caricata"); }, { once: true });
        alta.src = v.img.grande;
      };
      s._img = alta; s._cornice = cornice;
    } else {
      s.append(el("div", { class: "lb-cornice", style: "width:min(520px,86vw);aspect-ratio:4/3" },
        el("div", { class: "rif rif-grande" },
          el("div", {},
            v.anteprima ? el("figure", { class: "rif-anteprima" },
              el("img", { src: v.anteprima, alt: "", referrerpolicy: "no-referrer", decoding: "async", draggable: "false",
                onerror: e => e.target.closest("figure").remove() }),
              el("figcaption", {}, "Anteprima Envato")) : null,
            el("span", { class: "rif-fonte" }, `${doveGuardare(v)} · ${v.id}`),
            el("strong", {}, v.titolo || v.id),
            v.note ? el("p", {}, v.note) : null,
            el("div", { class: "rif-azioni" },
              el("button", { class: "bottone pieno", type: "button", onclick: () => chiediAle([v]) }, "Chiedi ad Ale"),
              v.pagina ? el("a", { class: "bottone", href: v.pagina, target: "_blank", rel: "noopener noreferrer" }, `Guarda su ${doveGuardare(v)}`) : null),
            v.pagina ? el("small", {}, `Per guardarla su ${doveGuardare(v)} serve un account.`) : null))));
    }
    return s;
  }

  lb.mostra = function (i, anima = true) {
    const V = stato.vista;
    lb.i = (i + V.length) % V.length;
    lb.z = { s: 1, x: 0, y: 0 };
    lbEl.classList.remove("zoom");
    const trio = [V[lb.i - 1] || (V.length > 2 ? V[V.length - 1] : null), V[lb.i], V[lb.i + 1] || (V.length > 2 ? V[0] : null)];
    if (V.length === 2) { trio[0] = lb.i === 1 ? V[0] : null; trio[2] = lb.i === 0 ? V[1] : null; }
    const vecchie = new Map(lb.slide.filter(s => s._id).map(s => [s._id, s]));
    nastro.replaceChildren();
    lb.slide = trio.map((v, k) => {
      const s = (v && vecchie.get(v.id)) || slide(v);
      if (v) { s._id = v.id; vecchie.delete(v.id); }
      s.style.transform = `translateX(${(k - 1) * 100}%)`;
      nastro.append(s);
      if (s._img) { s._img.style.transition = "none"; s._img.style.transform = ""; }
      if (s._dimensiona) { s._dimensiona(); s._carica(); }
      return s;
    });
    nastro.style.transition = "none";
    nastro.style.transform = "translate3d(0,0,0)";
    $("#lbConta").innerHTML = `<b>${due(lb.i + 1)}</b> — ${due(V.length)}`;
    striscia();
    $("#lbPrima").hidden = $("#lbDopo").hidden = V.length < 2;
    if (anima && lb.slide[1]._cornice) lb.slide[1]._cornice.animate([{ opacity: 0.4, transform: "scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.2,.7,.2,1)" });
    riempiPannello(V[lb.i]);
    const id = V[lb.i].id;
    if (location.hash.slice(1) !== id) history.replaceState(history.state, "", "#" + encodeURIComponent(id));
  };

  const strisciaEl = $("#lbStriscia");
  function striscia() {
    const V = stato.vista;
    if (strisciaEl._chiave !== V.map(v => v.id).join()) {
      strisciaEl._chiave = V.map(v => v.id).join();
      strisciaEl.replaceChildren(...V.map((v, i) => el("button", {
        type: "button", "aria-label": `Fotografia ${i + 1}`, onclick: () => lb.mostra(i),
      }, scaricabile(v) ? el("img", { src: v.img.t480, alt: "", loading: "lazy", decoding: "async" })
        : v.anteprima ? el("img", { src: v.anteprima, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" }) : null)));
    }
    [...strisciaEl.children].forEach((b, i) => b.classList.toggle("attuale", i === lb.i));
    const b = strisciaEl.children[lb.i];
    if (b) strisciaEl.scrollTo({ left: b.offsetLeft - strisciaEl.clientWidth / 2 + b.clientWidth / 2, behavior: "smooth" });
  }

  function riempiPannello(v) {
    const ok = scaricabile(v);
    const azioni = el("div", { class: "lb-azioni" });
    if (ok) {
      azioni.append(el("button", { class: "bottone pieno", type: "button", onclick: () => scaricaUna(v) },
        `Scarica l'originale · ${mb(v.peso)}`));
      if (puoCondividere) {
        const b = el("button", { class: "bottone", type: "button" }, isIOS ? "Salva in Foto" : "Condividi");
        b.addEventListener("click", async () => {
          const p = prendiBlob(v);
          let blob = null;
          await Promise.race([p.then(x => (blob = x)), new Promise(r => setTimeout(r, 30))]).catch(() => {});
          if (!blob) {  // non ancora arrivato: il tocco andrebbe perso dopo l'attesa, si chiede un secondo tocco
            b.textContent = "Preparo…"; b.disabled = true;
            try { await p; b.textContent = isIOS ? "Tocca: Salva in Foto" : "Tocca per condividere"; } catch { b.textContent = "Non riuscito"; }
            b.disabled = false; return;
          }
          try {
            await navigator.share({ files: [new File([blob], v.nome_file, { type: blob.type || "image/jpeg" })] });
          } catch (e) { if (e.name !== "AbortError") avviso("Condivisione non riuscita: usa Scarica originale"); }
        });
        azioni.append(b);
      }
      if (lbEl.classList.contains("info")) prendiBlob(v).catch(() => {});
    }
    if (!ok) azioni.append(el("button", { class: "bottone pieno", type: "button", onclick: () => chiediAle([v]) }, "Chiedi ad Ale"));
    if (v.pagina) azioni.append(el("a", { class: "bottone", href: v.pagina, target: "_blank", rel: "noopener noreferrer" },
      ok ? "Pagina della fonte" : `Guarda su ${doveGuardare(v)}`));

    const campi = el("dl", { class: "campi" });
    const riga = (k, val) => val && campi.append(el("dt", {}, k), el("dd", {}, val));
    riga("ID", v.id);
    riga("Raccolta", v.raccolta);
    riga("Fonte", v.fonte);
    riga("Autore", v.autore);
    riga("Licenza", v.licenza);
    riga("Pixel", v.risoluzione ? v.risoluzione.replace("x", " × ") : "");
    riga("Peso", ok && v.peso ? mb(v.peso) : "");
    riga("Esito", NOME_ESITO[v.esito] || "");
    riga("Punteggio", `${punti(v.punteggio)} / 10`);
    if (!ok) riga("Uso", `Il file ce l'ha Ale (licenza ${doveGuardare(v)}): chiediglielo`);

    const gate = el("div", { class: "gate" }, GATE.map(g => el("span", {
      class: v.gate[g] === true ? "si" : v.gate[g] === false ? "no" : "",
      title: `${g} · ${NOMI_GATE[g]}: ${v.gate[g] === true ? "superato" : v.gate[g] === false ? "non superato" : "non applicabile"}`,
    }, g)));

    const blocchi = [
      el("span", { class: "esito-tag" }, (NOME_ESITO[v.esito] || "") +
        (GATE.some(g => v.gate[g] === false) ? " · non rispetta " + GATE.filter(g => v.gate[g] === false).map(g => NOMI_GATE[g].toLowerCase()).join(", ") : "")),
      el("h2", {}, v.titolo || v.autore || v.id),
      el("p", { class: "sotto" }, [v.fonte, v.risoluzione, ok && v.peso ? mb(v.peso) : null].filter(Boolean).join(" · ")),
      azioni,
      el("p", { class: "titoletto" }, "Criteri E1-E8"), gate,
    ];
    if (v.attribuzione) {
      const copia = el("button", { type: "button" }, "Copia attribuzione");
      copia.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(v.attribuzione); avviso("Attribuzione copiata"); }
        catch { avviso("Non riesco a copiare: tieni premuto sul testo"); }
      });
      blocchi.push(el("p", { class: "titoletto" }, "Attribuzione da riportare"), el("div", { class: "attr" }, el("div", {}, v.attribuzione), copia));
    }
    blocchi.push(campi);
    if (v.note) blocchi.push(el("p", { class: "note" }, v.note));
    pannello.replaceChildren(...blocchi.filter(Boolean));
  }

  function apri(i, daHash = false) {
    if (i < 0) return;
    lb.aperta = true;
    lbEl.hidden = false;
    document.body.classList.add("bloccato");
    if (!daHash) history.pushState({ lb: true }, "", "#" + encodeURIComponent(stato.vista[i].id));
    lb.daStoria = !daHash;
    lb.mostra(i);
    requestAnimationFrame(() => lbEl.classList.add("aperta"));
    $("#lbChiudi").focus({ preventScroll: true });
  }
  function chiudi(daPop = false) {
    if (!lb.aperta) return;
    const id = stato.vista[lb.i] && stato.vista[lb.i].id;
    lb.aperta = false;
    lbEl.classList.remove("aperta");
    document.body.classList.remove("bloccato");
    setTimeout(() => { if (!lb.aperta) { lbEl.hidden = true; nastro.replaceChildren(); lb.slide = []; } }, 300);
    if (!daPop) {
      if (lb.daStoria && history.state && history.state.lb) history.back();
      else history.replaceState(null, "", location.pathname + location.search);
    }
    const n = id && schede.get((stato.modo === "elenco" ? "r:" : "c:") + id);
    if (n) { n.focus({ preventScroll: true }); const r = n.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight) n.scrollIntoView({ block: "center" }); }
  }
  addEventListener("popstate", () => { if (lb.aperta) chiudi(true); else apriDaHash(); });
  addEventListener("hashchange", () => { if (!lb.aperta) apriDaHash(); });
  function apriDaHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    let i = stato.vista.findIndex(v => v.id === id);
    if (i < 0 && DATI.some(v => v.id === id)) {  // link a una foto fuori dai filtri attuali: si allargano
      for (const f of FACCETTE) stato.sel[f.k].clear();
      stato.gate.clear(); stato.q = ""; $("#cerca").value = "";
      aggiorna();
      i = stato.vista.findIndex(v => v.id === id);
    }
    if (i >= 0) apri(i, true);
  }

  const vai = d => {
    if (stato.vista.length < 2) return;
    const w = scena.clientWidth;
    nastro.style.transition = "transform .42s cubic-bezier(.2,.7,.2,1)";
    nastro.style.transform = `translate3d(${-d * w}px,0,0)`;
    clearTimeout(vai.t);
    vai.t = setTimeout(() => lb.mostra(lb.i + d, false), 400);
  };
  $("#lbPrima").addEventListener("click", () => vai(-1));
  $("#lbDopo").addEventListener("click", () => vai(1));
  $("#lbChiudi").addEventListener("click", () => chiudi());
  const info = (forza) => {
    const on = lbEl.classList.toggle("info", forza);
    $("#lbInfo").setAttribute("aria-expanded", String(on));
    if (on && scaricabile(stato.vista[lb.i])) prendiBlob(stato.vista[lb.i]).catch(() => {});
    if (on && innerWidth < 900) lbEl.style.setProperty("--alt-pannello", pannello.offsetHeight + "px");
    setTimeout(() => lb.slide.forEach(s => s._dimensiona && s._dimensiona()), 620);
  };
  $("#lbInfo").addEventListener("click", () => info());
  if (innerWidth >= 1200) lbEl.classList.add("info"), $("#lbInfo").setAttribute("aria-expanded", "true");

  addEventListener("keydown", e => {
    if (!lb.aperta) return;
    if (e.key === "Escape") { if (lb.z.s > 1) zoom(1); else chiudi(); }
    else if (e.key === "ArrowLeft") vai(-1);
    else if (e.key === "ArrowRight") vai(1);
    else if (e.key === "i") info();
  });

  /* gesti: scorrere, chiudere tirando giu', pizzicare, doppio tocco */
  function applicaZoom(anima) {
    const s = lb.slide[1]; if (!s || !s._img) return;
    s._img.style.transition = anima ? "transform .3s cubic-bezier(.2,.7,.2,1)" : "none";
    s._img.style.transformOrigin = "50% 50%";
    s._img.style.transform = `translate3d(${lb.z.x}px,${lb.z.y}px,0) scale(${lb.z.s})`;
    lbEl.classList.toggle("zoom", lb.z.s > 1.01);
  }
  function limita() {
    const s = lb.slide[1]; if (!s || !s._cornice) return;
    const r = s._cornice.getBoundingClientRect(), W = scena.clientWidth, H = scena.clientHeight;
    const mx = Math.max(0, (r.width * lb.z.s - W) / 2), my = Math.max(0, (r.height * lb.z.s - H) / 2);
    lb.z.x = Math.max(-mx, Math.min(mx, lb.z.x));
    lb.z.y = Math.max(-my, Math.min(my, lb.z.y));
  }
  function zoom(s, fx, fy) {
    const c = lb.slide[1] && lb.slide[1]._cornice; if (!c) return;
    if (s <= 1) { lb.z = { s: 1, x: 0, y: 0 }; applicaZoom(true); return; }
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const k = s / lb.z.s;
    lb.z.x = (fx - cx) - ((fx - cx) - lb.z.x) * k;
    lb.z.y = (fy - cy) - ((fy - cy) - lb.z.y) * k;
    lb.z.s = s; limita(); applicaZoom(true);
  }

  const punt = new Map();
  let gesto = null, ultimoTocco = 0, timerTap;
  scena.addEventListener("pointerdown", e => {
    if (e.button > 0) return;
    scena.setPointerCapture(e.pointerId);
    punt.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punt.size === 2) {
      const [a, b] = [...punt.values()];
      const c = lb.slide[1] && lb.slide[1]._cornice;
      if (!c) return;
      gesto = { tipo: "pizzico", d0: Math.hypot(a.x - b.x, a.y - b.y), s0: lb.z.s, x0: lb.z.x, y0: lb.z.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      nastro.style.transform = "translate3d(0,0,0)";
    } else if (punt.size === 1) {
      gesto = { tipo: null, x0: e.clientX, y0: e.clientY, t0: performance.now(), zx: lb.z.x, zy: lb.z.y };
    }
  });
  scena.addEventListener("pointermove", e => {
    if (!punt.has(e.pointerId) || !gesto) return;
    punt.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesto.tipo === "pizzico" && punt.size >= 2) {
      const [a, b] = [...punt.values()];
      const s = Math.max(1, Math.min(5, gesto.s0 * Math.hypot(a.x - b.x, a.y - b.y) / gesto.d0));
      const c = lb.slide[1]._cornice.getBoundingClientRect();
      const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const k = s / gesto.s0;
      lb.z.s = s;
      lb.z.x = (mx - cx) - ((gesto.mx - cx) - gesto.x0) * k;
      lb.z.y = (my - cy) - ((gesto.my - cy) - gesto.y0) * k;
      applicaZoom(false);
      return;
    }
    const dx = e.clientX - gesto.x0, dy = e.clientY - gesto.y0;
    if (!gesto.tipo) {
      if (Math.hypot(dx, dy) < 8) return;
      gesto.tipo = lb.z.s > 1.01 ? "sposta" : Math.abs(dx) > Math.abs(dy) ? "scorri" : dy > 0 ? "giu" : "su";
    }
    if (gesto.tipo === "sposta") { lb.z.x = gesto.zx + dx; lb.z.y = gesto.zy + dy; applicaZoom(false); }
    else if (gesto.tipo === "scorri") {
      const bordo = stato.vista.length < 2 ? 0.25 : 1;
      nastro.style.transition = "none"; nastro.style.transform = `translate3d(${dx * bordo}px,0,0)`;
    } else if (gesto.tipo === "giu") {
      nastro.style.transition = "none";
      nastro.style.transform = `translate3d(0,${dy}px,0) scale(${1 - Math.min(dy, 400) / 2000})`;
      lbEl.style.backgroundColor = `rgba(18,15,12,${1 - Math.min(dy, 400) / 520})`;
    }
  });
  const fine = e => {
    if (!punt.has(e.pointerId)) return;
    punt.delete(e.pointerId);
    if (!gesto) return;
    const dx = e.clientX - gesto.x0, dy = e.clientY - gesto.y0, dt = performance.now() - (gesto.t0 || 0);
    if (gesto.tipo === "pizzico") {
      if (punt.size === 0) { if (lb.z.s < 1.05) zoom(1); else { limita(); applicaZoom(true); } gesto = null; }
      else { const p = [...punt.values()][0]; gesto = { tipo: "sposta", x0: p.x, y0: p.y, zx: lb.z.x, zy: lb.z.y, t0: 0 }; }
      return;
    }
    const tipo = gesto.tipo; gesto = null;
    if (tipo === "sposta") { limita(); applicaZoom(true); return; }
    if (tipo === "scorri") {
      const w = scena.clientWidth, v = Math.abs(dx) / Math.max(dt, 1);
      if (stato.vista.length > 1 && (Math.abs(dx) > w * 0.22 || (v > 0.45 && Math.abs(dx) > 30))) vai(dx < 0 ? 1 : -1);
      else { nastro.style.transition = "transform .35s cubic-bezier(.2,.7,.2,1)"; nastro.style.transform = "translate3d(0,0,0)"; }
      return;
    }
    if (tipo === "giu") {
      lbEl.style.backgroundColor = "";
      if (dy > 110 || (dy / Math.max(dt, 1) > 0.5 && dy > 40)) { nastro.style.transition = "transform .3s, opacity .3s"; nastro.style.opacity = "0"; chiudi(); setTimeout(() => (nastro.style.opacity = ""), 320); }
      else { nastro.style.transition = "transform .35s cubic-bezier(.2,.7,.2,1)"; nastro.style.transform = "translate3d(0,0,0)"; }
      return;
    }
    if (tipo === "su") { info(true); return; }
    if (e.type === "pointercancel") return;
    // tocco: doppio = zoom, singolo = mostra/nascondi i comandi (o chiude il pannello)
    const ora = performance.now();
    if (ora - ultimoTocco < 300) {
      clearTimeout(timerTap); ultimoTocco = 0;
      if (lb.z.s > 1.01) zoom(1); else zoom(2.5, e.clientX, e.clientY);
    } else {
      ultimoTocco = ora;
      timerTap = setTimeout(() => {
        if (lbEl.classList.contains("info") && innerWidth < 900) info(false);
        else if (e.pointerType !== "mouse") lbEl.querySelector(".lb-alto").style.opacity = lbEl.querySelector(".lb-alto").style.opacity === "0" ? "" : "0";
      }, 300);
    }
  };
  scena.addEventListener("pointerup", fine);
  scena.addEventListener("pointercancel", fine);
  scena.addEventListener("wheel", e => {
    if (!e.ctrlKey && lb.z.s <= 1.01) return;
    e.preventDefault();
    const s = Math.max(1, Math.min(5, lb.z.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002))));
    if (e.ctrlKey || Math.abs(e.deltaY) > 0) zoom(s, e.clientX, e.clientY);
  }, { passive: false });
  // iOS: niente zoom della pagina col pizzico dentro la lightbox
  ["gesturestart", "gesturechange"].forEach(t => document.addEventListener(t, e => { if (lb.aperta) e.preventDefault(); }, { passive: false }));


  aggiorna();
  aggiornaSel();
  // le animazioni del foglio dei filtri solo dopo il primo disegno: all'apertura non deve scorrere via a vista
  setTimeout(() => document.body.classList.add("avviato"), 600);
  apriDaHash();
})();
