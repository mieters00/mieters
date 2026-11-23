// ---------- Flappy: spelregels (zonder scherm, zodat ze te testen zijn) ----------
const FLAPPY = (() => {
    const W = 360, H = 540, GROND = 70, GRONDY = H - GROND, R = 14, X = 90;
    const ZWAARTE = 1400, SPRONG = -420, SNELHEID = 150, GAT = 160, BREEDTE = 58, AFSTAND = 210, MAXSCORE = 2000;
    const klem = (v, a, b) => Math.max(a, Math.min(b, v));

    function maak(rnd = Math.random) {
        return { rnd, stand: 'wacht', y: H / 2 - 40, vy: 0, hoek: 0, pijpen: [], score: 0, tijd: 0, afstand: 0 };
    }
    function nieuwePijp(g, x) {
        const min = GAT / 2 + 50, max = GRONDY - GAT / 2 - 50;
        return { x, gatY: min + g.rnd() * (max - min), geteld: false };
    }
    // Een tik of toets: omhoog vliegen. De eerste tik start het spel.
    function flap(g) {
        if (g.stand === 'dood') return false;
        if (g.stand === 'wacht') { g.stand = 'speel'; g.pijpen = [nieuwePijp(g, W + 100)]; }
        g.vy = SPRONG;
        return true;
    }
    // Raakt de vogel de rechthoek (x1,y1)-(x2,y2)? Een iets kleinere vogel dan getekend, dat voelt eerlijker.
    function raakt(g, x1, y1, x2, y2) {
        const cx = klem(X, x1, x2), cy = klem(g.y, y1, y2), dx = X - cx, dy = g.y - cy, r = R - 2;
        return dx * dx + dy * dy < r * r;
    }
    function stap(g, dt) {
        const ev = [];
        g.tijd += dt;
        if (g.stand === 'wacht') { g.y = H / 2 - 40 + Math.sin(g.tijd * 5) * 6; return ev; }
        g.vy += ZWAARTE * dt;
        g.y += g.vy * dt;
        g.hoek = klem(g.vy / 600, -0.5, 1.2);
        if (g.y < R) { g.y = R; if (g.vy < 0) g.vy = 0; }                     // het plafond: je blijft er tegenaan hangen
        if (g.stand === 'dood') {                                              // na de botsing valt de vogel nog naar de grond
            if (g.y >= GRONDY - R) { g.y = GRONDY - R; g.vy = 0; }
            return ev;
        }
        for (const p of g.pijpen) p.x -= SNELHEID * dt;
        g.afstand += SNELHEID * dt;
        const laatste = g.pijpen[g.pijpen.length - 1];
        if (!laatste || laatste.x < W - AFSTAND) g.pijpen.push(nieuwePijp(g, W + BREEDTE));
        g.pijpen = g.pijpen.filter(p => p.x > -BREEDTE - 10);
        for (const p of g.pijpen) if (!p.geteld && p.x + BREEDTE / 2 < X) { p.geteld = true; g.score++; ev.push({ t: 'punt' }); }
        let dood = g.y + R >= GRONDY;
        for (const p of g.pijpen) {
            if (raakt(g, p.x, -50, p.x + BREEDTE, p.gatY - GAT / 2) || raakt(g, p.x, p.gatY + GAT / 2, p.x + BREEDTE, GRONDY)) dood = true;
        }
        if (dood) { g.stand = 'dood'; if (g.y > GRONDY - R) g.y = GRONDY - R; ev.push({ t: 'dood' }); }
        return ev;
    }
    return { W, H, GROND, GRONDY, R, X, GAT, BREEDTE, MAXSCORE, maak, flap, stap };
})();

// ---------- Flappy: scherm ----------
function flappy() {
    const { W, H, GRONDY, R, X, GAT, BREEDTE } = FLAPPY, DPR = 2, DT = 1 / 120;
    $('speelveld').innerHTML = `<div class="flappy-wrap"><div class="flappy-balk"><span>Score <b id="fl-score">0</b></span><span>Beste <b id="fl-best">0</b></span></div>
        <canvas class="flappy" width="${W * DPR}" height="${H * DPR}"></canvas></div>
        <p class="intro">Tik, klik, spatie of pijltje omhoog om te vliegen. Vlieg door de gaten tussen de buizen en raak niets aan.</p>`;
    const cv = document.querySelector('canvas.flappy'), ctx = cv.getContext('2d');
    ctx.scale(DPR, DPR);
    let g = FLAPPY.maak(), best = 0, laatste = performance.now(), acc = 0, raf, doodTijd = 0, klaar = false;
    // een paar wolken die langzaam voorbij gaan
    const wolken = [{ x: 40, y: 80, s: 1 }, { x: 200, y: 140, s: 0.8 }, { x: 320, y: 50, s: 1.2 }];

    if (me) sb.from('highscores').select('score').eq('game', 'flappy').eq('user_id', me.id).maybeSingle()
        .then(({ data }) => { if (data && $('fl-best')) { best = data.score; $('fl-best').textContent = best; } });

    function nieuw() { g = FLAPPY.maak(); acc = 0; klaar = false; $('fl-score').textContent = '0'; }
    async function afronden() {
        if (klaar) return;
        klaar = true; doodTijd = performance.now();
        if (g.score > best) { best = g.score; $('fl-best').textContent = best; }
        if (me && g.score > 0) await bewaarScore('flappy', g.score);
    }
    function vlieg() {
        if (g.stand === 'dood') { if (performance.now() - doodTijd > 450) nieuw(); return; }      // niet per ongeluk meteen opnieuw
        if (g.stand === 'wacht') acc = 0;
        FLAPPY.flap(g);
    }
    function stap() {
        const voor = g.score;
        const ev = FLAPPY.stap(g, DT);
        if (g.score !== voor) $('fl-score').textContent = g.score;
        if (ev.some(e => e.t === 'dood')) afronden();
    }

    // ---------- tekenen ----------
    function pijp(p) {
        const boven = p.gatY - GAT / 2, onder = p.gatY + GAT / 2, kap = 22;
        ctx.fillStyle = '#5bbf2a'; ctx.strokeStyle = '#33691e'; ctx.lineWidth = 2;
        ctx.fillRect(p.x, 0, BREEDTE, boven - kap); ctx.strokeRect(p.x, -2, BREEDTE, boven - kap + 2);
        ctx.fillRect(p.x - 4, boven - kap, BREEDTE + 8, kap); ctx.strokeRect(p.x - 4, boven - kap, BREEDTE + 8, kap);
        ctx.fillRect(p.x, onder + kap, BREEDTE, GRONDY - onder - kap); ctx.strokeRect(p.x, onder + kap, BREEDTE, GRONDY - onder - kap);
        ctx.fillRect(p.x - 4, onder, BREEDTE + 8, kap); ctx.strokeRect(p.x - 4, onder, BREEDTE + 8, kap);
        ctx.fillStyle = 'rgba(255,255,255,.28)';            // glans
        ctx.fillRect(p.x + 6, 0, 7, boven - kap); ctx.fillRect(p.x + 6, onder + kap, 7, GRONDY - onder - kap);
    }
    function vogel() {
        ctx.save();
        ctx.translate(X, g.y); ctx.rotate(g.hoek);
        ctx.fillStyle = '#f7d51d'; ctx.strokeStyle = '#8a6d00'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill(); ctx.stroke();
        const klap = g.stand === 'speel' ? Math.sin(g.tijd * 22) * 4 : Math.sin(g.tijd * 9) * 2;      // met de vleugel slaan
        ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.ellipse(-4, 3 + klap * 0.4, 8, 5 + Math.abs(klap) * 0.3, -0.3, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -5, 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(8, -5, 2.4, 0, 7); ctx.fill();
        ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(R - 2, -1); ctx.lineTo(R + 10, 2); ctx.lineTo(R - 2, 6); ctx.closePath(); ctx.fill();
        ctx.restore();
    }
    function tekst(t, grootte, y, kleur = '#fff') {
        ctx.font = `800 ${grootte}px "Nunito Sans", sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = Math.max(3, grootte / 7); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(t, W / 2, y);
        ctx.fillStyle = kleur; ctx.fillText(t, W / 2, y);
    }
    function teken() {
        ctx.fillStyle = '#70c5ce'; ctx.fillRect(0, 0, W, GRONDY);
        ctx.fillStyle = '#a8dde3'; ctx.fillRect(0, GRONDY - 90, W, 90);                          // lichter bij de horizon
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        for (const w of wolken) {
            const x = ((w.x - g.afstand * 0.15 * w.s) % (W + 120) + (W + 120)) % (W + 120) - 60;
            ctx.beginPath(); ctx.ellipse(x, w.y, 34 * w.s, 14 * w.s, 0, 0, 7); ctx.ellipse(x + 20 * w.s, w.y - 8 * w.s, 22 * w.s, 12 * w.s, 0, 0, 7); ctx.ellipse(x - 18 * w.s, w.y - 5 * w.s, 18 * w.s, 10 * w.s, 0, 0, 7); ctx.fill();
        }
        for (const p of g.pijpen) pijp(p);
        ctx.fillStyle = '#ded895'; ctx.fillRect(0, GRONDY, W, H - GRONDY);                         // de grond met een bewegend streeppatroon
        ctx.fillStyle = '#73bf2e'; ctx.fillRect(0, GRONDY, W, 14);
        ctx.fillStyle = '#5ea322';
        const scroll = g.stand === 'dood' ? 0 : g.afstand % 28;
        for (let x = -28 + (28 - scroll); x < W + 28; x += 28) { ctx.beginPath(); ctx.moveTo(x, GRONDY); ctx.lineTo(x + 14, GRONDY); ctx.lineTo(x + 4, GRONDY + 14); ctx.lineTo(x - 10, GRONDY + 14); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = '#c8b75f'; ctx.fillRect(0, GRONDY + 14, W, 3);
        vogel();
        if (g.stand !== 'wacht') tekst(String(g.score), 46, 70);
        if (g.stand === 'wacht') { tekst('Tik om te starten', 24, H / 2 + 40); tekst('Spatie of ↑ werkt ook', 15, H / 2 + 66); }
        if (g.stand === 'dood') {
            ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(W / 2 - 110, H / 2 - 80, 220, 150);
            ctx.strokeStyle = '#8a6d00'; ctx.lineWidth = 3; ctx.strokeRect(W / 2 - 110, H / 2 - 80, 220, 150);
            ctx.textAlign = 'center'; ctx.fillStyle = '#c0392b'; ctx.font = '800 28px "Nunito Sans", sans-serif'; ctx.fillText('Game over', W / 2, H / 2 - 42);
            ctx.fillStyle = '#333'; ctx.font = '700 18px "Nunito Sans", sans-serif';
            ctx.fillText(`Score: ${g.score}`, W / 2, H / 2 - 8); ctx.fillText(`Beste: ${best}`, W / 2, H / 2 + 20);
            ctx.font = '600 14px "Nunito Sans", sans-serif'; ctx.fillText('Tik of spatie om opnieuw te spelen', W / 2, H / 2 + 52);
        }
    }
    function lus(nu) {
        const dt = Math.min((nu - laatste) / 1000, 0.1);
        laatste = nu;
        acc += dt;
        while (acc >= DT) { acc -= DT; stap(); }
        teken();
        raf = requestAnimationFrame(lus);
    }

    // ---------- bediening ----------
    const toets = e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === ' ' || k === 'arrowup' || k === 'w' || k === 'enter') { e.preventDefault(); if (!e.repeat) vlieg(); }
    };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); vlieg(); });
    document.addEventListener('keydown', toets);
    cleanup.push(() => { cancelAnimationFrame(raf); document.removeEventListener('keydown', toets); });
    raf = requestAnimationFrame(lus);
}
