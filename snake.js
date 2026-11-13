// ---------- Snake: spelregels van alle modi (zonder scherm, zodat ze te testen zijn) ----------
const SNAKE = (() => {
    const COLS = 17, ROWS = 15, MAXSCORE = 252;
    const MODI = [
        { id: 'classic', naam: 'Klassiek', tekst: 'Het gewone Snake.' },
        { id: 'wall', naam: 'Muur', tekst: 'Elke keer dat je een appel eet, komt er een muur bij. Rij er niet tegenaan.' },
        { id: 'portal', naam: 'Portaal', tekst: 'Twee portalen: ga je de ene in, dan kom je uit de andere. Ze verspringen als je een appel eet.' },
        { id: 'cheese', naam: 'Kaas', tekst: 'Je slang zit vol gaten. Door de doorzichtige stukken kun je zonder gevaar heen.' },
        { id: 'borderless', naam: 'Grenzeloos', tekst: 'Geen randen: ga je er aan de ene kant uit, dan kom je er aan de andere kant weer in.' },
        { id: 'peaceful', naam: 'Vredig', tekst: 'Je kunt niet doodgaan. Eet 252 appels om te winnen. Deze modus heeft geen Top 10.' },
        { id: 'twin', naam: 'Tweeling', tekst: 'Je bestuurt twee slangen tegelijk met dezelfde toetsen. Gaat er één dood, dan is het over.' },
        { id: 'winged', naam: 'Gevleugeld', tekst: 'De appels vliegen rond en kaatsen tegen de rand en tegen je lijf.' },
        { id: 'yinyang', naam: 'Yin Yang', tekst: 'Een tweede slang spiegelt jou en gaat de andere kant op. Raak elkaar niet.' },
        { id: 'key', naam: 'Sleutel', tekst: 'Elke appel zit achter een slot. Pak eerst de gouden sleutel. Tegen een slot botsen is dood.' },
        { id: 'sokoban', naam: 'Kisten', tekst: 'Duw kisten op de rode vakjes. Zit een kist vast, dan ga je dood.' },
        { id: 'poison', naam: 'Gif', tekst: 'Naast de gewone appels ligt een grijze gifappel: eet je die, dan gaat je slang even zelf zwabberen.' },
    ];
    const R4 = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    const binnen = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
    const opSlang = (g, x, y) => g.slangen.some(s => s.cellen.some(c => c.x === x && c.y === y));
    const opMuur = (g, x, y) => g.muren.some(m => m.x === x && m.y === y);

    function bezet(g, x, y) {
        return opSlang(g, x, y) || opMuur(g, x, y) || g.appels.some(a => a.x === x && a.y === y) || g.kisten.some(k => k.x === x && k.y === y)
            || g.doelen.some(d => d.x === x && d.y === y) || g.portalen.some(p => p.x === x && p.y === y) || (g.sleutel && g.sleutel.x === x && g.sleutel.y === y);
    }
    // een lege plek, eventueel met een extra eis; null als er geen plek meer is
    function vrijePlek(g, ok = () => true) {
        for (let i = 0; i < 300; i++) { const x = Math.floor(g.rnd() * COLS), y = Math.floor(g.rnd() * ROWS); if (!bezet(g, x, y) && ok(x, y)) return { x, y }; }
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!bezet(g, x, y) && ok(x, y)) return { x, y };
        return null;
    }
    const nieuweAppel = (g, soort = 'appel') => {
        const p = vrijePlek(g);
        if (!p) return null;
        const a = { x: p.x, y: p.y, soort };
        if (g.modus === 'winged') { a.dx = g.rnd() < 0.5 ? -1 : 1; a.dy = g.rnd() < 0.5 ? -1 : 1; }
        return a;
    };
    function zetPortalen(g) {
        g.portalen = [];
        const a = vrijePlek(g); if (!a) return;
        g.portalen.push(a);
        const b = vrijePlek(g, (x, y) => Math.abs(x - a.x) + Math.abs(y - a.y) >= 6);
        if (b) g.portalen.push(b); else g.portalen = [];
    }
    function nieuweKist(g) {
        const k = vrijePlek(g, (x, y) => x >= 2 && y >= 2 && x < COLS - 2 && y < ROWS - 2);       // niet langs de rand, anders zit hij meteen vast
        if (k) g.kisten.push(k);
        const d = vrijePlek(g);
        if (d) g.doelen.push(d);
    }

    function maak(modus, n, rnd = Math.random) {
        const g = { modus, n, rnd, score: 0, stand: 'wacht', teller: 0, tik: 0, groei: 0, dwaal: 0, richting: { x: 1, y: 0 }, wachtrij: [], slangen: [], vorige: [], muren: [], appels: [], portalen: [], kisten: [], doelen: [], sleutel: null, slot: false };
        const slang = y => ({ cellen: [{ x: 4, y, gat: false }, { x: 3, y, gat: true }, { x: 2, y, gat: false }] });
        if (modus === 'twin') g.slangen = [slang(4), slang(10)];
        else if (modus === 'yinyang') g.slangen = [slang(7), { cellen: [{ x: 12, y: 7, gat: false }, { x: 13, y: 7, gat: true }, { x: 14, y: 7, gat: false }] }];
        else g.slangen = [slang(7)];
        g.vorige = g.slangen.map(s => s.cellen.map(c => ({ x: c.x, y: c.y })));
        if (modus === 'sokoban') for (let i = 0; i < n; i++) nieuweKist(g);
        else for (let i = 0; i < n; i++) { const a = nieuweAppel(g); if (a) g.appels.push(a); }
        if (modus === 'poison') { const a = nieuweAppel(g, 'gif'); if (a) g.appels.push(a); }
        if (modus === 'portal') zetPortalen(g);
        if (modus === 'key') { g.slot = true; g.sleutel = vrijePlek(g); }
        return g;
    }

    // Zet een bocht in de wachtrij. Geeft true terug als dit het spel net gestart heeft.
    function richt(g, dx, dy) {
        if (g.stand === 'dood' || g.stand === 'gewonnen') return false;
        const start = g.stand === 'wacht';
        if (start) g.stand = 'speel';
        const l = g.wachtrij.length ? g.wachtrij[g.wachtrij.length - 1] : g.richting;
        if ((dx === l.x && dy === l.y) || (dx === -l.x && dy === -l.y)) return start;
        if (g.wachtrij.length < 2) g.wachtrij.push({ x: dx, y: dy });
        return start;
    }
    function willekeurigeRichting(g) {
        const opties = R4.filter(r => !(r.x === -g.richting.x && r.y === -g.richting.y));
        const kop = g.slangen[0].cellen[0];
        const veilig = opties.filter(r => { const x = kop.x + r.x, y = kop.y + r.y; return binnen(x, y) && !opMuur(g, x, y) && !opSlang(g, x, y); });
        const kies = veilig.length ? veilig : opties;
        return kies[Math.floor(g.rnd() * kies.length)];
    }
    function vliegAppels(g) {
        const dicht = (x, y) => !binnen(x, y) || opSlang(g, x, y);
        for (const a of g.appels) {
            if (a.soort !== 'appel') continue;
            if (dicht(a.x + a.dx, a.y)) a.dx = -a.dx;
            if (dicht(a.x, a.y + a.dy)) a.dy = -a.dy;
            const nx = a.x + a.dx, ny = a.y + a.dy;
            if (!dicht(nx, ny)) { a.x = nx; a.y = ny; }
        }
    }

    // Eén tik van het spel. Geeft een lijst gebeurtenissen terug: eet, gif, sleutel, dood, gewonnen.
    function stap(g) {
        const ev = [];
        if (g.stand !== 'speel') return ev;
        g.tik++;
        if (g.dwaal > 0) { g.dwaal--; g.wachtrij.length = 0; g.richting = willekeurigeRichting(g); }
        else if (g.wachtrij.length) { const r = g.wachtrij.shift(); if (!(r.x === -g.richting.x && r.y === -g.richting.y)) g.richting = r; }
        const rondom = g.modus === 'borderless' || g.modus === 'peaceful', vredig = g.modus === 'peaceful';

        // waar komt de kop van elke slang terecht?
        const info = g.slangen.map((s, i) => {
            const d = g.modus === 'yinyang' && i === 1 ? { x: -g.richting.x, y: -g.richting.y } : g.richting;
            const k = { x: s.cellen[0].x + d.x, y: s.cellen[0].y + d.y, gat: (g.teller + 1) % 2 === 1, dood: false };
            if (rondom) { k.x = (k.x + COLS) % COLS; k.y = (k.y + ROWS) % ROWS; }
            else if (!binnen(k.x, k.y)) k.dood = true;
            return { s, d, k, eet: -1, gif: -1, duw: null };
        });
        let sleutelGepakt = false;
        for (const o of info) {
            const k = o.k;
            if (k.dood) continue;
            if (opMuur(g, k.x, k.y)) { k.dood = true; continue; }
            if (g.portalen.length === 2) {
                const [p, q] = g.portalen;
                if (k.x === p.x && k.y === p.y) { k.x = q.x; k.y = q.y; } else if (k.x === q.x && k.y === q.y) { k.x = p.x; k.y = p.y; }
            }
            if (g.sleutel && k.x === g.sleutel.x && k.y === g.sleutel.y) sleutelGepakt = true;
            const ai = g.appels.findIndex(a => a.x === k.x && a.y === k.y);
            if (ai >= 0) {
                if (g.slot && !sleutelGepakt) { k.dood = true; continue; }       // tegen een slot botsen
                if (g.appels[ai].soort === 'gif') o.gif = ai; else o.eet = ai;
            }
            const ki = g.kisten.findIndex(b => b.x === k.x && b.y === k.y);
            if (ki >= 0) {                                                       // een kist duwen
                const t = { x: k.x + o.d.x, y: k.y + o.d.y };
                const vast = !binnen(t.x, t.y) || opMuur(g, t.x, t.y) || opSlang(g, t.x, t.y) || g.kisten.some((b, j) => j !== ki && b.x === t.x && b.y === t.y);
                if (vast) { k.dood = true; continue; }
                o.duw = { ki, t, doel: g.doelen.findIndex(d => d.x === t.x && d.y === t.y) };
            }
        }
        // een slot dat net opengaat: de appel die achter het slot zat mag je in dezelfde stap niet meteen eten
        const iemandEet = info.some(o => o.eet >= 0 || (o.duw && o.duw.doel >= 0));
        const wacht = g.groei > 0;
        for (const o of info) o.groei = o.eet >= 0 || (o.duw && o.duw.doel >= 0) || wacht || (g.modus === 'yinyang' && iemandEet);
        if (wacht) g.groei--;
        const aantalEet = info.filter(o => o.eet >= 0 || (o.duw && o.duw.doel >= 0)).length;
        if (g.modus === 'yinyang' && aantalEet > 1) g.groei += aantalEet - 1;       // twee appels tegelijk: de rest van de groei volgt in de volgende stappen

        // botsingen met slangen (de staart schuift weg, tenzij de slang groeit). Bij Kaas zijn de gaten niet gevaarlijk.
        if (!vredig) for (const o of info) {
            const k = o.k;
            if (k.dood) continue;
            for (const p of info) {
                const lichaam = p.groei ? p.s.cellen : p.s.cellen.slice(0, -1);
                if (lichaam.some(c => c.x === k.x && c.y === k.y && !(g.modus === 'cheese' && c.gat))) { k.dood = true; break; }
                if (p !== o && p.k.x === k.x && p.k.y === k.y) { k.dood = true; break; }
            }
        }
        if (info.some(o => o.k.dood)) { g.stand = 'dood'; ev.push({ t: 'dood' }); return ev; }

        // de stap zetten
        g.vorige = g.slangen.map(s => s.cellen.map(c => ({ x: c.x, y: c.y })));
        g.teller++;
        for (const o of info) { o.s.cellen.unshift({ x: o.k.x, y: o.k.y, gat: o.k.gat }); if (!o.groei) o.s.cellen.pop(); }
        if (sleutelGepakt) { g.slot = false; g.sleutel = null; ev.push({ t: 'sleutel' }); }

        const eten = () => {
            g.score++; ev.push({ t: 'eet' });
            if (g.modus === 'wall') { const m = vrijePlek(g, (x, y) => g.slangen.every(s => Math.abs(x - s.cellen[0].x) + Math.abs(y - s.cellen[0].y) > 3)); if (m) g.muren.push(m); }
            if (g.modus === 'portal') zetPortalen(g);
        };
        for (const o of info) {
            if (o.eet >= 0) {
                const nw = nieuweAppel(g);
                if (nw) g.appels[o.eet] = nw; else g.appels[o.eet] = null;
                eten();
                if (g.modus === 'key') { g.slot = true; g.sleutel = vrijePlek(g); }
            }
            if (o.gif >= 0) {
                g.dwaal = 8; ev.push({ t: 'gif' });
                g.appels[o.gif] = nieuweAppel(g, 'gif');
            }
            if (o.duw) {
                g.kisten[o.duw.ki] = o.duw.t;
                if (o.duw.doel >= 0) { g.kisten.splice(o.duw.ki, 1); g.doelen.splice(o.duw.doel, 1); eten(); nieuweKist(g); }
            }
        }
        g.appels = g.appels.filter(Boolean);
        if (g.modus === 'winged' && g.tik % 2 === 0) vliegAppels(g);
        if (vredig && g.score >= MAXSCORE) { g.stand = 'gewonnen'; ev.push({ t: 'gewonnen' }); }
        return ev;
    }
    return { COLS, ROWS, MAXSCORE, MODI, maak, richt, stap };
})();

// ---------- Snake: scherm ----------
// Elke combinatie van modus en aantal appels heeft een eigen Top 10. Klassiek met 1 appel is de oude lijst ('snake').
function snakeSleutel(modus, n) { return modus === 'peaceful' ? null : 'snake' + (modus === 'classic' ? '' : '-' + modus) + (n === 1 ? '' : '-' + n); }
function snakeTitel(k) {
    const ids = SNAKE.MODI.filter(m => m.id !== 'classic').map(m => m.id).join('|');
    const m = new RegExp('^snake(?:-(' + ids + '))?(?:-([35]))?$').exec(k);
    if (!m) return null;
    const modus = SNAKE.MODI.find(x => x.id === (m[1] || 'classic')), n = m[2] || '1';
    return `Top 10 - ${modus.naam}, ${n} ${m[1] === 'sokoban' ? (n === '1' ? 'kist' : 'kisten') : (n === '1' ? 'appel' : 'appels')}`;
}

function snake() {
    const { COLS, ROWS } = SNAKE, S = 30, TICK = 130, DPR = 2;
    $('speelveld').innerHTML = `<div class="snake-keuze snake-modi" id="sn-modi"><span>Spelmodus:</span>${SNAKE.MODI.map(m => `<button data-m="${m.id}">${esc(m.naam)}</button>`).join('')}</div>
        <p class="snake-uitleg" id="sn-uitleg"></p>
        <div class="snake-keuze" id="sn-keuze"><span id="sn-aantal">Aantal appels:</span><button data-n="1">1</button><button data-n="3">3</button><button data-n="5">5</button></div><div class="snake-wrap">
        <div class="snake-balk"><span class="appel-icoon"></span><b id="sn-score">0</b><span class="beker">Beste</span><b id="sn-best">0</b></div>
        <canvas class="snake" width="${COLS * S * DPR}" height="${ROWS * S * DPR}"></canvas></div>
        <div class="pijlen"><button data-d="0,-1">↑</button><button data-d="-1,0">←</button><button data-d="0,1">↓</button><button data-d="1,0">→</button></div>
        <p class="intro">Pijltjestoetsen of WASD. Op je telefoon veeg je over het veld. Kies hierboven een spelmodus en met hoeveel appels je speelt: elke combinatie heeft een eigen Top 10.</p>`;
    const cv = document.querySelector('canvas.snake'), ctx = cv.getContext('2d');
    ctx.scale(DPR, DPR);
    let g, modus = 'classic', appelTal = 1, best = 0, acc = 0, laatste = performance.now(), raf, pop = 0, klaar = false;
    const sleutel = () => snakeSleutel(modus, appelTal);

    function nieuw() { g = SNAKE.maak(modus, appelTal); pop = 0; acc = 0; klaar = false; $('sn-score').textContent = '0'; }
    async function afronden() {
        if (klaar) return;
        klaar = true;
        if (g.score > best) { best = g.score; $('sn-best').textContent = best; }
        const k = sleutel();
        if (k && g.score > 0) await bewaarScore(k, g.score);
    }
    function stap() {
        const voor = g.score;
        SNAKE.stap(g);
        if (g.score !== voor) { pop = 1; $('sn-score').textContent = g.score; }
        if (g.stand === 'dood' || g.stand === 'gewonnen') afronden();
    }
    function richt(dx, dy) {
        if (g.stand === 'dood' || g.stand === 'gewonnen') return;
        const startje = SNAKE.richt(g, dx, dy);
        if (startje) acc = 0;
        // Draai meteen, in plaats van te wachten op de volgende tik
        if (g.wachtrij.length === 1 && (startje || acc > TICK * 0.3)) { acc = 0; stap(); }
    }

    // ---------- tekenen ----------
    const midden = (x, y) => ({ x: (x + 0.5) * S, y: (y + 0.5) * S });
    function tekst(regels) {
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(0, 0, COLS * S, ROWS * S);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        regels.forEach(([t, grootte, y]) => { ctx.font = `800 ${grootte}px "Nunito Sans", sans-serif`; ctx.fillText(t, COLS * S / 2, y); });
    }
    function appel(a) {
        const c = midden(a.x, a.y), ra = S * 0.38 * (1 + Math.sin(performance.now() / 300) * 0.04), gif = a.soort === 'gif';
        if (g.modus === 'winged') {              // vleugeltjes
            ctx.fillStyle = 'rgba(255,255,255,.9)';
            ctx.beginPath(); ctx.ellipse(c.x - ra - 2, c.y - 3, 6, 3, -0.6, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.ellipse(c.x + ra + 2, c.y - 3, 6, 3, 0.6, 0, 7); ctx.fill();
        }
        ctx.fillStyle = gif ? '#6d5a82' : '#e7471d';
        ctx.beginPath(); ctx.arc(c.x, c.y + 1, ra, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.beginPath(); ctx.arc(c.x - ra * 0.35, c.y - ra * 0.25, ra * 0.25, 0, 7); ctx.fill();
        ctx.fillStyle = gif ? '#3b3046' : '#3f8a2a';
        ctx.beginPath(); ctx.ellipse(c.x + 3, c.y - ra - 1, 5, 2.5, -0.5, 0, 7); ctx.fill();
        if (gif) { ctx.fillStyle = '#fff'; ctx.font = `800 ${S * 0.4}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('x', c.x, c.y + S * 0.16); }
    }
    function slot(a) {                           // een slot met een sleutelgat, over de appel heen
        const c = midden(a.x, a.y);
        ctx.fillStyle = '#7b8794'; ctx.fillRect(c.x - S * 0.4, c.y - S * 0.36, S * 0.8, S * 0.72);
        ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 2; ctx.strokeRect(c.x - S * 0.4, c.y - S * 0.36, S * 0.8, S * 0.72);
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(c.x, c.y - 2, S * 0.1, 0, 7); ctx.fill(); ctx.fillRect(c.x - 1.5, c.y - 2, 3, S * 0.2);
    }
    function sleutelTeken(k) {
        const c = midden(k.x, k.y);
        ctx.fillStyle = '#f5c518'; ctx.strokeStyle = '#a07d00'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(c.x - S * 0.14, c.y, S * 0.2, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillRect(c.x, c.y - 2, S * 0.36, 4); ctx.fillRect(c.x + S * 0.24, c.y, 3, S * 0.16); ctx.fillRect(c.x + S * 0.12, c.y, 3, S * 0.12);
    }
    function tekenSlang(sl, si, t) {
        const tweede = si === 1, kleur = g.modus === 'yinyang' && tweede ? '#f59e0b' : g.modus === 'twin' && tweede ? '#14b8a6' : '#4a7cf5';
        const vorig = g.vorige[si] || [];
        const pts = sl.cellen.map((c, i) => {      // de delen glijden vloeiend, behalve als ze springen (rond de rand of door een portaal)
            const v = vorig[i] || vorig[vorig.length - 1] || c, tt = Math.abs(c.x - v.x) > 1.5 || Math.abs(c.y - v.y) > 1.5 ? 1 : t;
            return { ...midden(v.x + (c.x - v.x) * tt, v.y + (c.y - v.y) * tt), gat: c.gat };
        });
        if (g.modus === 'cheese') {                // kaas: de gaten zijn doorzichtig
            pts.forEach((p, i) => { ctx.fillStyle = kleur; ctx.globalAlpha = i && p.gat ? 0.22 : 1; ctx.beginPath(); ctx.arc(p.x, p.y, S * 0.38, 0, 7); ctx.fill(); });
            ctx.globalAlpha = 1;
        } else {
            ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = kleur; ctx.lineWidth = S * 0.74;
            ctx.beginPath();
            pts.forEach((p, i) => (i && Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) < S * 1.6 ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.stroke();
        }
        const h = pts[0], rk = S * 0.42 * (1 + (si === 0 ? pop * 0.18 : 0)), d = g.modus === 'yinyang' && tweede ? { x: -g.richting.x, y: -g.richting.y } : g.richting;
        ctx.fillStyle = kleur; ctx.beginPath(); ctx.arc(h.x, h.y, rk, 0, 7); ctx.fill();
        [-1, 1].forEach(z => {
            const ex = h.x + d.x * S * 0.12 - d.y * z * S * 0.17, ey = h.y + d.y * S * 0.12 + d.x * z * S * 0.17;
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, S * 0.13, 0, 7); ctx.fill();
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex + d.x * S * 0.05, ey + d.y * S * 0.05, S * 0.065, 0, 7); ctx.fill();
        });
    }
    function teken(t) {
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { ctx.fillStyle = (r + c) % 2 ? '#a2d149' : '#aad751'; ctx.fillRect(c * S, r * S, S, S); }
        for (const d of g.doelen) {                // rode doelvakjes (kisten)
            const c = midden(d.x, d.y);
            ctx.fillStyle = 'rgba(231,71,29,.35)'; ctx.fillRect(c.x - S * 0.46, c.y - S * 0.46, S * 0.92, S * 0.92);
            ctx.strokeStyle = '#e7471d'; ctx.lineWidth = 3; ctx.strokeRect(c.x - S * 0.38, c.y - S * 0.38, S * 0.76, S * 0.76);
        }
        g.portalen.forEach((p, i) => {
            const c = midden(p.x, p.y);
            ctx.fillStyle = i ? '#f59e0b' : '#3b82f6'; ctx.beginPath(); ctx.arc(c.x, c.y, S * 0.44, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.arc(c.x, c.y, S * 0.26, 0, 7); ctx.fill();
        });
        for (const m of g.muren) {                 // bakstenen muur
            ctx.fillStyle = '#9a4a2c'; ctx.fillRect(m.x * S + 1, m.y * S + 1, S - 2, S - 2);
            ctx.fillStyle = '#c0714d'; ctx.fillRect(m.x * S + 1, m.y * S + 1, S - 2, 3); ctx.fillRect(m.x * S + S / 2, m.y * S + 1, 2, S / 2 - 1); ctx.fillRect(m.x * S + S / 4, m.y * S + S / 2, 2, S / 2 - 1);
        }
        for (const b of g.kisten) {
            ctx.fillStyle = '#b07a3b'; ctx.fillRect(b.x * S + 2, b.y * S + 2, S - 4, S - 4);
            ctx.strokeStyle = '#6e4a1f'; ctx.lineWidth = 2; ctx.strokeRect(b.x * S + 3, b.y * S + 3, S - 6, S - 6);
            ctx.beginPath(); ctx.moveTo(b.x * S + 4, b.y * S + 4); ctx.lineTo(b.x * S + S - 4, b.y * S + S - 4); ctx.moveTo(b.x * S + S - 4, b.y * S + 4); ctx.lineTo(b.x * S + 4, b.y * S + S - 4); ctx.stroke();
        }
        if (g.sleutel) sleutelTeken(g.sleutel);
        for (const a of g.appels) { appel(a); if (g.slot && a.soort === 'appel') slot(a); }
        g.slangen.forEach((sl, i) => tekenSlang(sl, i, t));
        pop = Math.max(0, pop - 0.06);
        if (g.stand === 'wacht') tekst([['Druk op een pijltje om te starten', 20, ROWS * S / 2 + 6]]);
        if (g.stand === 'dood') tekst([['Game over', 34, ROWS * S / 2 - 14], [`Score: ${g.score}`, 20, ROWS * S / 2 + 16], ['Spatie of tik om opnieuw te spelen', 15, ROWS * S / 2 + 44]]);
        if (g.stand === 'gewonnen') tekst([['Gewonnen!', 36, ROWS * S / 2 - 8], [`${g.score} appels gegeten`, 18, ROWS * S / 2 + 22], ['Spatie of tik om opnieuw te spelen', 15, ROWS * S / 2 + 48]]);
    }
    function lus(nu) {
        const dt = Math.min(nu - laatste, 100);
        laatste = nu;
        if (g.stand === 'speel') {
            acc += dt;
            while (acc >= TICK && g.stand === 'speel') { acc -= TICK; stap(); }
        }
        teken(g.stand === 'speel' ? acc / TICK : 1);
        raf = requestAnimationFrame(lus);
    }

    // ---------- bediening ----------
    const RICHTINGEN = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
    const afgelopen = () => g.stand === 'dood' || g.stand === 'gewonnen';
    const toets = e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (RICHTINGEN[k]) { e.preventDefault(); richt(...RICHTINGEN[k]); }
        else if ((k === '1' || k === '3' || k === '5') && g.stand !== 'speel') kies(+k);
        else if ((k === ' ' || k === 'enter') && afgelopen()) { e.preventDefault(); nieuw(); }
    };
    // Swipen werkt direct tijdens de beweging, niet pas als je je vinger loslaat
    let begin = null, geveegd = false;
    cv.addEventListener('touchstart', e => { begin = { x: e.touches[0].clientX, y: e.touches[0].clientY }; geveegd = false; }, { passive: true });
    cv.addEventListener('touchmove', e => {
        if (!begin) return;
        const p = e.touches[0], dx = p.clientX - begin.x, dy = p.clientY - begin.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
        if (Math.abs(dx) > Math.abs(dy)) richt(dx > 0 ? 1 : -1, 0); else richt(0, dy > 0 ? 1 : -1);
        begin = { x: p.clientX, y: p.clientY };
        geveegd = true;
    }, { passive: true });
    cv.addEventListener('touchend', () => { if (!geveegd && afgelopen()) nieuw(); begin = null; });
    cv.onclick = () => { if (afgelopen()) nieuw(); };
    document.addEventListener('keydown', toets);
    document.querySelectorAll('.pijlen button').forEach(b => b.onclick = () => richt(...b.dataset.d.split(',').map(Number)));
    cleanup.push(() => { cancelAnimationFrame(raf); document.removeEventListener('keydown', toets); });

    // ---------- keuzes en Top 10 ----------
    function laadBest() {
        best = 0; $('sn-best').textContent = '0';
        const k = sleutel();
        if (me && k) sb.from('highscores').select('score').eq('game', k).eq('user_id', me.id).maybeSingle()
            .then(({ data }) => { if (data && $('sn-best')) { best = data.score; $('sn-best').textContent = best; } });
    }
    function laadLijst() {
        const k = sleutel();
        if (k) laadScores(k);
        else if ($('scores')) $('scores').innerHTML = '<h3>Vredig</h3><p class="intro">Bij deze modus is er geen Top 10: je kunt niet doodgaan. Eet 252 appels om te winnen.</p>';
    }
    function toonKeuze() {
        document.querySelectorAll('#sn-modi button').forEach(b => b.classList.toggle('actief', b.dataset.m === modus));
        document.querySelectorAll('#sn-keuze button').forEach(b => b.classList.toggle('actief', +b.dataset.n === appelTal));
        $('sn-uitleg').textContent = SNAKE.MODI.find(m => m.id === modus).tekst;
        $('sn-aantal').textContent = modus === 'sokoban' ? 'Aantal kisten:' : 'Aantal appels:';
    }
    function kies(n) {
        appelTal = n;
        try { localStorage.setItem('mieters.snake.appels', String(n)); } catch (e) {}
        toonKeuze(); nieuw(); laadBest(); laadLijst();
    }
    function kiesModus(id) {
        modus = id;
        try { localStorage.setItem('mieters.snake.modus', id); } catch (e) {}
        toonKeuze(); nieuw(); laadBest(); laadLijst();
    }
    document.querySelectorAll('#sn-modi button').forEach(b => b.onclick = () => { b.blur(); kiesModus(b.dataset.m); });
    document.querySelectorAll('#sn-keuze button').forEach(b => b.onclick = () => { b.blur(); kies(+b.dataset.n); });
    let bewaardN = 1, bewaardM = 'classic';
    try { bewaardN = +localStorage.getItem('mieters.snake.appels') || 1; bewaardM = localStorage.getItem('mieters.snake.modus') || 'classic'; } catch (e) {}
    appelTal = [1, 3, 5].includes(bewaardN) ? bewaardN : 1;
    modus = SNAKE.MODI.some(m => m.id === bewaardM) ? bewaardM : 'classic';
    toonKeuze(); nieuw(); laadBest(); laadLijst();
    raf = requestAnimationFrame(lus);
}
