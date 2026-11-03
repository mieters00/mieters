// ---------- De computer als tegenstander ----------
// Draait helemaal in je browser: geen server, geen kosten. De partij wordt niet bewaard.
const BOTNAAM = ['', 'Computer (makkelijk)', 'Computer (gemiddeld)', 'Computer (moeilijk)'];
const BOTWACHT = [0, 1000, 1500, 2200];      // minimale tijd (ms) tot de computer zet, zodat hij niet meteen terugspeelt
function botPartij(B) {      // B = resultaat van /^bot-([123])-([wz])$/
    const ik = B[2] === 'w', bot = { username: BOTNAAM[+B[1]], avatar: null };
    return { id: 'bot', white: ik ? me.id : 'bot', black: ik ? 'bot' : me.id, created_by: me.id, status: 'bezig', moves: [], result: null, reden: null, draw_offer: null, w: ik ? me : bot, z: ik ? bot : me };
}

const tik = ctx => { if ((++ctx.n & 127) === 0 && Date.now() > ctx.tot) throw ctx; };     // tijd is op

// Zoekt de beste zet: steeds dieper kijken tot de tijd op is, en de beste zet van de laatste afgeronde ronde nemen.
// "ruis" maakt de computer slordiger op het makkelijke niveau.
function botWortel(E, s, keys, cfg) {
    let ms = E.legal(s);
    if (ms.length <= 1) return ms[0] || null;
    if (E.volgorde) ms = E.volgorde(s, ms);
    const ctx = { n: 0, tot: Date.now() + cfg.ms };
    let beste = ms[0];
    for (let d = 1; d <= cfg.d; d++) {
        let alfa = -Infinity, scD = -Infinity, bD = null;
        try {
            for (const m of ms) {
                const n = E.apply(s, m);
                const herh = keys.filter(k => k === E.key(n)).length;      // herhalen van stellingen liever vermijden
                let sc = -E.zoek(n, d - 1, -Infinity, cfg.ruis ? Infinity : -alfa, 1, ctx);
                sc += (Math.random() - 0.5) * 2 * cfg.ruis - herh * 30;
                if (sc > scD) { scD = sc; bD = m; if (!cfg.ruis) alfa = sc; }
            }
        } catch (e) { if (e !== ctx) throw e; break; }
        beste = bD;
        ms = [bD, ...ms.filter(m => m !== bD)];
        if (scD > 90000) break;      // mat gevonden
    }
    return beste;
}

const CHESSBOT = (() => {
    const W = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
    const CFG = [null, { d: 1, ms: 500, ruis: 120 }, { d: 2, ms: 1200, ruis: 12 }, { d: 5, ms: 2200, ruis: 0 }];
    const centrum = i => 3.5 - Math.max(Math.abs((i >> 3) - 3.5), Math.abs((i & 7) - 3.5));
    function waardeer(s) {       // positief = goed voor de speler die aan zet is
        let v = 0;
        for (let i = 0; i < 64; i++) {
            const x = s.b[i];
            if (!x) continue;
            const u = x.toUpperCase(), wit = x === u, r = i >> 3;
            let p = W[u];
            if (u === 'P') p += (wit ? 6 - r : r - 1) * 8 + (centrum(i) > 1.5 ? 6 : 0);
            else if (u === 'N' || u === 'B') p += centrum(i) * 8;
            v += wit ? p : -p;
        }
        return s.turn === 'w' ? v : -v;
    }
    const volgorde = (s, ms) => ms.map(m => [(s.b[m.to] ? W[s.b[m.to].toUpperCase()] * 10 - W[s.b[m.from].toUpperCase()] : m.ep ? 900 : 0) + (m.promo === 'q' ? 800 : 0), m])
        .sort((a, b) => b[0] - a[0]).map(x => x[1]);
    function rust(s, alfa, beta, ms, q, ctx) {       // na de laatste zet nog slagen uitspelen, zodat hij niet blind een stuk weggeeft
        tik(ctx);
        if (!ms.length) return SCHAAK.inCheck(s) ? -99000 : 0;
        const stand = waardeer(s);
        if (stand >= beta) return stand;
        if (stand > alfa) alfa = stand;
        if (q >= 6) return alfa;
        for (const m of volgorde(s, ms.filter(m => s.b[m.to] || m.ep || m.promo === 'q'))) {
            const n = SCHAAK.apply(s, m);
            const sc = -rust(n, -beta, -alfa, SCHAAK.legal(n), q + 1, ctx);
            if (sc >= beta) return sc;
            if (sc > alfa) alfa = sc;
        }
        return alfa;
    }
    function zoek(s, d, alfa, beta, ply, ctx) {
        tik(ctx);
        const ms = SCHAAK.legal(s);
        if (!ms.length) return SCHAAK.inCheck(s) ? -100000 + ply : 0;
        if (s.half >= 100) return 0;
        if (d <= 0) return rust(s, alfa, beta, ms, 0, ctx);
        let beste = -Infinity;
        for (const m of volgorde(s, ms)) {
            const sc = -zoek(SCHAAK.apply(s, m), d - 1, -beta, -alfa, ply + 1, ctx);
            if (sc > beste) beste = sc;
            if (beste > alfa) alfa = beste;
            if (alfa >= beta) break;
        }
        return beste;
    }
    const E = { legal: SCHAAK.legal, apply: SCHAAK.apply, key: SCHAAK.key, zoek, volgorde };
    return { kies: (s, keys, niveau) => botWortel(E, s, keys, CFG[niveau]) };
})();

const DAMBOT = (() => {
    const CFG = [null, { d: 1, ms: 500, ruis: 30 }, { d: 4, ms: 1200, ruis: 3 }, { d: 10, ms: 2200, ruis: 0 }];
    function waardeer(s) {
        let v = 0;
        for (let i = 0; i < 50; i++) {
            const x = s.b[i];
            if (x === '.') continue;
            const wit = x.toLowerCase() === 'w', dam = x === 'W' || x === 'Z', r = Math.floor(i / 5), k = i % 5, c = r % 2 === 0 ? 2 * k + 1 : 2 * k;
            let p = 100;
            if (dam) p = 320;
            else {
                p += (wit ? 9 - r : r) * 4 + (c >= 3 && c <= 6 ? 3 : 0);
                if (wit ? r === 9 : r === 0) p += 6;      // de achterste rij houdt de dam van de tegenstander tegen
            }
            v += wit ? p : -p;
        }
        return s.turn === 'w' ? v : -v;
    }
    function zoek(s, d, alfa, beta, ply, ctx) {
        tik(ctx);
        const ms = DAM.legal(s);
        if (!ms.length) return -100000 + ply;
        if (s.quiet >= 50) return 0;
        if (d <= 0 && (!ms[0].over.length || ply >= 24)) return waardeer(s);      // een verplichte slag eerst uitspelen
        let beste = -Infinity;
        for (const m of ms) {
            const sc = -zoek(DAM.apply(s, m), d - 1, -beta, -alfa, ply + 1, ctx);
            if (sc > beste) beste = sc;
            if (beste > alfa) alfa = beste;
            if (alfa >= beta) break;
        }
        return beste;
    }
    const E = { legal: DAM.legal, apply: DAM.apply, key: DAM.key, zoek };
    return { kies: (s, keys, niveau) => botWortel(E, s, keys, CFG[niveau]) };
})();
