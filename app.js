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
  const mb = n => (n / 1048576).toFixed(n > 10485760 ? 0 : 1).replace(".", ",") + " MB";
  const punti = n => (Math.round(n * 10) / 10).toString().replace(".", ",");
  const due = n => String(n).padStart(2, "0");
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // esiti nell'ordine in cui si mostrano; "Tutte" li mette in fila in quest'ordine
  const ESITI = [["rosa", "In rosa"], ["quasi", "Quasi"], ["da_verificare", "Da verificare"], ["scartata", "Scartate"]];
  const RANGO = Object.fromEntries(ESITI.map(([k], i) => [k, i]));
  const NOME_ESITO = { rosa: "In rosa", quasi: "Quasi", da_verificare: "Da verificare", scartata: "Scartata" };
  // lo ZIP si costruisce in memoria: su telefono oltre ~300 MB la pagina rischia di essere chiusa dal sistema
  const telefono = isIOS || /Android/i.test(navigator.userAgent);
  const MAX_ZIP = (telefono ? 300 : 1500) * 1048576;
  const presenti = ESITI.filter(([k]) => DATI.some(v => v.esito === k));
  const stato = {
    // si apre sulla rosa quando e' abbastanza ricca; altrimenti su Tutte (che mette comunque la rosa in testa)
    esito: DATI.filter(v => v.esito === "rosa").length >= 6 ? "rosa" : "tutte",
    fonte: "tutte", ordina: "punteggio", selezione: false, scelte: new Set(), vista: [],
  };
  const galleria = $("#raccolta");
  const schede = new Map();

  if (DATI.some(v => v.prova || v.esito === "da_verificare")) $("#avvisoProva").hidden = false;
  $("#navConta").textContent = `${DATI.length} fotografie`;

  /* ---------- copertina: la fotografia migliore ---------- */
  (function copertina() {
    const cand = DATI.filter(scaricabile).sort((a, b) => (RANGO[a.esito] ?? 9) - (RANGO[b.esito] ?? 9) || b.punteggio - a.punteggio);
    const v = cand.find(x => x.w >= x.h) || cand[0];
    const fig = $("#eroeFoto");
    const parti = () => requestAnimationFrame(() => document.body.classList.add("pronto"));
    if (!v) { parti(); return; }
    fig.style.setProperty("--lqip", `url("${v.lqip}")`);
    const img = el("img", { alt: v.titolo || "", decoding: "async", fetchpriority: "high",
      srcset: `${v.img.t960} 960w, ${v.img.grande} 2048w`, src: v.img.grande,
      // "cover" su un telefono in verticale ritaglia una foto orizzontale: serve la larghezza che riempie l'altezza
      sizes: `${Math.ceil(Math.max(innerWidth, innerHeight * v.w / v.h))}px` });
    img.addEventListener("load", () => { img.classList.add("caricata"); parti(); }, { once: true });
    img.addEventListener("error", parti, { once: true });
    setTimeout(parti, 1600);
    fig.append(img);
    fig.style.cursor = "zoom-in";
    fig.addEventListener("click", () => { const i = stato.vista.indexOf(v); if (i >= 0) apri(i); });
    $("#eroeCredito").textContent = `Fotografia: ${v.autore}${v.fonte ? " / " + v.fonte : ""}`;
  })();

  /* ---------- filtri ---------- */
  const perEsito = v => stato.esito === "tutte" || v.esito === stato.esito;
  function filtri() {
    const voci = presenti.length > 1 ? [...presenti, ["tutte", "Tutte"]] : [["tutte", "Tutte"]];
    $("#esiti").replaceChildren(...voci.map(([val, testo]) => el("button", {
      type: "button", "aria-pressed": String(stato.esito === val),
      onclick: () => { stato.esito = val; filtri(); disegna(); scrollSu(); },
    }, testo, el("sup", {}, String(val === "tutte" ? DATI.length : DATI.filter(v => v.esito === val).length)))));
    const base = DATI.filter(perEsito);
    if (stato.fonte !== "tutte" && !base.some(v => v.fonte === stato.fonte)) stato.fonte = "tutte";
    const conta = {};
    for (const v of base) conta[v.fonte] = (conta[v.fonte] || 0) + 1;
    const box = $("#filtri");
    box.replaceChildren();
    if (Object.keys(conta).length < 2) return;  // una fonte sola: niente filtri inutili
    const chip = (val, testo, n) => el("button", {
      class: "chip", type: "button", "aria-pressed": String(stato.fonte === val),
      onclick: () => { stato.fonte = val; filtri(); disegna(); scrollSu(); },
    }, testo, el("small", {}, String(n)));
    box.append(chip("tutte", "Ogni fonte", base.length));
    for (const f of Object.keys(conta).sort((a, b) => a.localeCompare(b, "it"))) box.append(chip(f, f, conta[f]));
  }
  $("#ordina").addEventListener("change", e => { stato.ordina = e.target.value; disegna(); });

  function scrollSu() {
    const top = galleria.getBoundingClientRect().top + scrollY - barra.offsetHeight - 8;
    if (scrollY > top) scrollTo({ top, behavior: "smooth" });
  }
  function calcolaVista() {
    const v = DATI.filter(x => perEsito(x) && (stato.fonte === "tutte" || x.fonte === stato.fonte));
    const pix = x => (x.w || 0) * (x.h || 0);
    const ord = {
      punteggio: (a, b) => b.punteggio - a.punteggio || pix(b) - pix(a),
      risoluzione: (a, b) => pix(b) - pix(a) || b.punteggio - a.punteggio,
      fonte: (a, b) => a.fonte.localeCompare(b.fonte, "it") || b.punteggio - a.punteggio,
      catalogo: () => 0,
    }[stato.ordina];
    return v.slice().sort((a, b) => (RANGO[a.esito] ?? 9) - (RANGO[b.esito] ?? 9) || ord(a, b));
  }

  /* ---------- schede ---------- */
  const osservatore = "IntersectionObserver" in window
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("vista"); osservatore.unobserve(e.target); } }),
      { rootMargin: "0px 0px -6% 0px" })
    : null;

  function scheda(v) {
    const ok = scaricabile(v);
    const titolo = v.titolo || v.autore || v.id;
    let foto;
    if (ok) {
      const img = el("img", {
        alt: titolo, loading: "lazy", decoding: "async", draggable: "false",
        srcset: `${v.img.t480} 480w, ${v.img.t960} 960w`, src: v.img.t480,
      });
      const fatto = () => img.classList.add("caricata");
      img.addEventListener("load", fatto);
      if (img.complete && img.naturalWidth) fatto();
      foto = el("div", { class: "foto", style: `background-image:url("${v.lqip}")` }, img);
    } else {
      foto = el("div", { class: "foto" }, el("div", { class: "rif" },
        el("div", {}, el("strong", {}, "Solo riferimento"), el("span", {}, `${v.fonte} · chiedi ad Ale`))));
    }
    const etichette = el("div", { class: "etichette" });
    if (v.esito && v.esito !== "rosa") etichette.append(el("span", { class: `etichetta ${v.esito}` }, NOME_ESITO[v.esito] || v.esito));
    if (v.prova) etichette.append(el("span", { class: "etichetta" }, "Prova"));
    foto.append(etichette);
    if (ok) foto.append(el("span", { class: "spunta", "aria-hidden": "true", html: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>' }));
    const fig = el("figure", { class: "scheda", tabindex: "0", role: "button", "aria-label": `Apri: ${titolo}` },
      el("div", { class: "entra" },
        foto,
        el("figcaption", { class: "didascalia" },
          el("span", { class: "num" }),
          el("h3", {}, titolo),
          el("span", { class: "voto", title: "Punteggio da 0 a 10" }, punti(v.punteggio), el("small", {}, " /10")),
          el("p", {}, [v.fonte, v.autore].filter(Boolean).join(" · ")))));
    fig._v = v;
    fig._foto = foto;
    fig.addEventListener("click", () => tocca(fig));
    fig.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tocca(fig); } });
    if (osservatore) osservatore.observe(fig); else fig.classList.add("vista");
    return fig;
  }

  function tocca(fig) {
    const v = fig._v;
    if (stato.selezione) {
      if (!scaricabile(v)) return avviso("Questa è solo un riferimento: il file non si può scaricare. Chiedi ad Ale.");
      stato.scelte.has(v.id) ? stato.scelte.delete(v.id) : stato.scelte.add(v.id);
      fig.classList.toggle("scelta", stato.scelte.has(v.id));
      aggiornaSel();
    } else apri(stato.vista.indexOf(v));
  }

  function disegna() {
    stato.vista = calcolaVista();
    const visibili = new Set(stato.vista.map(v => v.id));
    for (const [id, n] of schede) if (!visibili.has(id)) n.remove();
    stato.vista.forEach((v, i) => {
      let n = schede.get(v.id);
      if (!n) { n = scheda(v); schede.set(v.id, n); }
      n.querySelector(".num").textContent = due(i + 1);
      n.classList.toggle("scelta", stato.scelte.has(v.id));
      galleria.append(n);
    });
    $("#vuoto").hidden = stato.vista.length > 0;
    impagina();
  }

  /* masonry che rispetta l'ordine: ogni scheda va nella colonna piu' corta */
  let ultimaLarghezza = 0;
  function impagina() {
    const st = getComputedStyle(galleria);
    const W = galleria.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
    const vw = window.innerWidth;
    const col = vw < 1100 ? 2 : 3;
    const gap = vw < 700 ? 14 : vw < 1100 ? 32 : 48;
    const cw = (W - gap * (col - 1)) / col;
    const alt = new Array(col).fill(0);
    const sx = parseFloat(st.paddingLeft);
    const figli = [...galleria.children];
    // prima si scrivono tutte le misure, poi si leggono tutte le altezze: un solo ricalcolo, non uno per scheda
    for (const n of figli) {
      const v = n._v;
      n.style.width = cw + "px";
      n._foto.style.height = cw * (v.w && v.h ? v.h / v.w : 0.75) + "px";
      const img = n._foto.querySelector("img");
      if (img) img.sizes = Math.ceil(cw) + "px";
    }
    const altezze = figli.map(n => n.offsetHeight);
    for (let k = 0; k < figli.length; k++) {
      const n = figli[k], h = altezze[k];
      let c = 0;
      for (let i = 1; i < col; i++) if (alt[i] < alt[c] - 1) c = i;
      n.style.transform = `translate(${sx + c * (cw + gap)}px, ${alt[c]}px)`;
      // sfalsamento editoriale: sui computer la colonna centrale parte piu' in basso
      if (k < col && col === 3 && c === 1) { alt[c] += 90; n.style.transform = `translate(${sx + c * (cw + gap)}px, ${alt[c]}px)`; }
      alt[c] += h + gap * (vw < 700 ? 1.8 : 1.4);
    }
    galleria.style.height = Math.max(0, ...alt) + "px";
    ultimaLarghezza = vw;
    requestAnimationFrame(() => galleria.classList.add("pronta"));
  }
  let timerResize;
  addEventListener("resize", () => {
    clearTimeout(timerResize);
    timerResize = setTimeout(() => { if (innerWidth !== ultimaLarghezza) impagina(); if (lb.aperta) lb.mostra(lb.i, false); }, 120);
  });
  document.fonts && document.fonts.ready.then(impagina);

  const barra = $("#barra"), nav = $("#nav");
  addEventListener("scroll", () => nav.classList.toggle("via", scrollY > innerHeight * 0.6), { passive: true });


  /* ---------- selezione e zip ---------- */
  function aggiornaSel() {
    document.body.classList.toggle("selezione", stato.selezione);
    $("#modoSel").setAttribute("aria-pressed", String(stato.selezione));
    $("#barraSel").hidden = !stato.selezione;
    const n = stato.scelte.size;
    $("#contaSel").textContent = n === 1 ? "1 selezionata" : `${n} selezionate`;
    $("#scaricaSel").disabled = n === 0;
  }
  $("#modoSel").addEventListener("click", () => { stato.selezione = !stato.selezione; if (!stato.selezione) { stato.scelte.clear(); disegna(); } aggiornaSel(); });
  $("#chiudiSel").addEventListener("click", () => { stato.selezione = false; stato.scelte.clear(); disegna(); aggiornaSel(); });
  $("#selTutte").addEventListener("click", () => {
    const tutte = stato.vista.filter(scaricabile);
    const giaTutte = tutte.every(v => stato.scelte.has(v.id));
    for (const v of tutte) giaTutte ? stato.scelte.delete(v.id) : stato.scelte.add(v.id);
    disegna(); aggiornaSel();
  });
  $("#scaricaSel").addEventListener("click", () => zip(DATI.filter(v => stato.scelte.has(v.id))));

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
        el("div", { class: "rif", style: "background:#1f1a15;border-color:#352c24;color:#cbbfae" },
          el("div", {}, el("strong", { style: "color:#efe7db" }, "Solo riferimento"),
            el("span", {}, `La licenza (${v.fonte}) non permette di passarti il file: chiedi ad Ale.`)))));
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
      }, scaricabile(v) ? el("img", { src: v.img.t480, alt: "", loading: "lazy", decoding: "async" }) : null)));
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
    if (v.pagina) azioni.append(el("a", { class: "bottone", href: v.pagina, target: "_blank", rel: "noopener noreferrer" }, "Pagina della fonte"));

    const campi = el("dl", { class: "campi" });
    const riga = (k, val) => val && campi.append(el("dt", {}, k), el("dd", {}, val));
    riga("Fonte", v.fonte);
    riga("Autore", v.autore);
    riga("Licenza", v.licenza);
    riga("Pixel", v.risoluzione ? v.risoluzione.replace("x", " × ") : "");
    riga("Esito", NOME_ESITO[v.esito] || "");
    riga("Punteggio", `${punti(v.punteggio)} / 10`);
    if (!ok) riga("Uso", "Solo riferimento: chiedi ad Ale");

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
    nav.classList.add("via");
    const n = id && schede.get(id);
    if (n) { n.focus({ preventScroll: true }); const r = n.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight) n.scrollIntoView({ block: "center" }); }
  }
  addEventListener("popstate", () => { if (lb.aperta) chiudi(true); else apriDaHash(); });
  addEventListener("hashchange", () => { if (!lb.aperta) apriDaHash(); });
  function apriDaHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    let i = stato.vista.findIndex(v => v.id === id);
    if (i < 0 && DATI.some(v => v.id === id)) {  // link a una foto fuori dai filtri attuali: si allargano
      stato.esito = "tutte"; stato.fonte = "tutte";
      filtri(); disegna();
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

  /* ---------- crediti nel piede ---------- */
  $("#crediti").replaceChildren(...DATI.filter(scaricabile).map(v => el("p", {},
    el("b", {}, v.titolo || v.nome_file), " — ", v.attribuzione || [v.autore, v.fonte].filter(Boolean).join(", "), ". ", v.licenza, ".")));

  filtri();
  disegna();
  aggiornaSel();
  apriDaHash();
})();
