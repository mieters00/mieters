// ---------- Schaken: spelregels (draait in de browser) ----------
const SCHAAK = (() => {
    const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const N = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
    const K = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const LET = { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'P', P: '' };       // Nederlandse stuknamen
    const col = x => (x === x.toUpperCase() ? 'w' : 'b');
    const a2i = a => (8 - +a[1]) * 8 + 'abcdefgh'.indexOf(a[0]);
    const i2a = i => 'abcdefgh'[i & 7] + (8 - (i >> 3));

    function parse(fen) {
        const [p, t, c, e, h, f] = fen.split(' ');
        const b = [];
        for (const ch of p) { if (ch === '/') continue; if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) b.push(''); else b.push(ch); }
        return { b, turn: t, c: c === '-' ? '' : c, ep: e === '-' ? -1 : a2i(e), half: +h, full: +f };
    }
    function fen(s) {
        let out = '';
        for (let r = 0; r < 8; r++) {
            let n = 0;
            for (let f = 0; f < 8; f++) { const x = s.b[r * 8 + f]; if (!x) n++; else { if (n) out += n; n = 0; out += x; } }
            if (n) out += n;
            if (r < 7) out += '/';
        }
        return `${out} ${s.turn} ${s.c || '-'} ${s.ep < 0 ? '-' : i2a(s.ep)} ${s.half} ${s.full}`;
    }
    const key = s => fen(s).split(' ').slice(0, 4).join(' ');

    function attacked(s, i, by) {
        const r = i >> 3, f = i & 7, w = by === 'w';
        const at = (rr, ff) => (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 ? s.b[rr * 8 + ff] : null);
        const pr = w ? r + 1 : r - 1;
        for (const d of [-1, 1]) if (at(pr, f + d) === (w ? 'P' : 'p')) return true;
        for (const [df, dr] of N) if (at(r + dr, f + df) === (w ? 'N' : 'n')) return true;
        for (const [df, dr] of K) if (at(r + dr, f + df) === (w ? 'K' : 'k')) return true;
        for (const [df, dr] of K) {
            let rr = r + dr, ff = f + df;
            while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
                const x = s.b[rr * 8 + ff];
                if (x) { if (col(x) === by) { const u = x.toUpperCase(); if (u === 'Q' || (df && dr ? u === 'B' : u === 'R')) return true; } break; }
                rr += dr; ff += df;
            }
        }
        return false;
    }

    function pseudo(s) {
        const me = s.turn, opp = me === 'w' ? 'b' : 'w', out = [];
        for (let i = 0; i < 64; i++) {
            const x = s.b[i];
            if (!x || col(x) !== me) continue;
            const u = x.toUpperCase(), r = i >> 3, f = i & 7;
            const add = (to, extra) => out.push({ from: i, to, ...extra });
            if (u === 'P') {
                const dir = me === 'w' ? -1 : 1, start = me === 'w' ? 6 : 1, last = me === 'w' ? 0 : 7;
                const push = (to, extra = {}) => { if (to >> 3 === last) for (const p of 'qrbn') add(to, { promo: p, ...extra }); else add(to, extra); };
                const one = i + dir * 8;
                if (!s.b[one]) { push(one); if (r === start && !s.b[one + dir * 8]) add(one + dir * 8, { dbl: true }); }
                for (const d of [-1, 1]) {
                    if (f + d < 0 || f + d > 7) continue;
                    const to = one + d, t = s.b[to];
                    if (t && col(t) !== me) push(to); else if (to === s.ep) add(to, { ep: true });
                }
            } else if (u === 'N' || u === 'K') {
                for (const [df, dr] of (u === 'N' ? N : K)) {
                    const rr = r + dr, ff = f + df;
                    if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
                    const t = s.b[rr * 8 + ff];
                    if (!t || col(t) !== me) add(rr * 8 + ff);
                }
                const home = me === 'w' ? 60 : 4;
                if (u === 'K' && i === home && !attacked(s, i, opp)) {
                    const ks = me === 'w' ? 'K' : 'k', qs = me === 'w' ? 'Q' : 'q';
                    if (s.c.includes(ks) && !s.b[home + 1] && !s.b[home + 2] && !attacked(s, home + 1, opp) && !attacked(s, home + 2, opp)) add(home + 2, { castle: 'k' });
                    if (s.c.includes(qs) && !s.b[home - 1] && !s.b[home - 2] && !s.b[home - 3] && !attacked(s, home - 1, opp) && !attacked(s, home - 2, opp)) add(home - 2, { castle: 'q' });
                }
            } else {
                const dirs = K.filter(([df, dr]) => u === 'Q' || (u === 'R' ? !(df && dr) : (df && dr)));
                for (const [df, dr] of dirs) {
                    let rr = r + dr, ff = f + df;
                    while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
                        const t = s.b[rr * 8 + ff];
                        if (!t) add(rr * 8 + ff); else { if (col(t) !== me) add(rr * 8 + ff); break; }
                        rr += dr; ff += df;
                    }
                }
            }
        }
        return out;
    }

    function apply(s, m) {
        const b = s.b.slice(), x = b[m.from], u = x.toUpperCase(), me = s.turn;
        const cap = b[m.to] || m.ep;
        b[m.to] = m.promo ? (me === 'w' ? m.promo.toUpperCase() : m.promo) : x;
        b[m.from] = '';
        if (m.ep) b[m.to + (me === 'w' ? 8 : -8)] = '';
        if (m.castle === 'k') { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = ''; }
        if (m.castle === 'q') { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = ''; }
        let c = s.c;
        const strip = chars => { for (const ch of chars) c = c.replace(ch, ''); };
        if (u === 'K') strip(me === 'w' ? 'KQ' : 'kq');
        for (const [i, ch] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (m.from === i || m.to === i) strip(ch);
        return { b, turn: me === 'w' ? 'b' : 'w', c, ep: m.dbl ? (m.from + m.to) / 2 : -1, half: u === 'P' || cap ? 0 : s.half + 1, full: s.full + (me === 'b' ? 1 : 0) };
    }
    function inCheck(s) { return attacked(s, s.b.indexOf(s.turn === 'w' ? 'K' : 'k'), s.turn === 'w' ? 'b' : 'w'); }
    function legal(s) {
        const k = s.turn === 'w' ? 'K' : 'k', opp = s.turn === 'w' ? 'b' : 'w';
        return pseudo(s).filter(m => { const n = apply(s, m); return !attacked(n, n.b.indexOf(k), opp); });
    }
    // null = de partij gaat door
    function status(s, keys) {
        if (!legal(s).length) return inCheck(s) ? 'mat' : 'pat';
        if (s.half >= 100) return '50';
        const rest = s.b.filter(x => x && x.toUpperCase() !== 'K');
        if (!rest.length || (rest.length === 1 && 'bBnN'.includes(rest[0]))) return 'materiaal';
        const k = key(s);
        if (keys.filter(x => x === k).length >= 3) return 'herhaling';
        return null;
    }
    const toUci = m => i2a(m.from) + i2a(m.to) + (m.promo || '');
    function fromUci(s, u) {
        const f = a2i(u.slice(0, 2)), t = a2i(u.slice(2, 4)), p = u[4];
        return legal(s).find(m => m.from === f && m.to === t && m.promo === p);
    }
    function label(s, m, n) {
        const u = s.b[m.from].toUpperCase(), cap = s.b[m.to] || m.ep;
        let t = m.castle ? (m.castle === 'k' ? 'O-O' : 'O-O-O')
            : LET[u] + i2a(m.from) + (cap ? 'x' : '-') + i2a(m.to) + (m.promo ? '=' + LET[m.promo.toUpperCase()] : '');
        if (inCheck(n)) t += legal(n).length ? '+' : '#';
        return t;
    }
    function replay(moves) {
        let s = parse(START);
        const keys = [key(s)], zetten = [];
        let laatste = null;
        for (const u of moves) {
            const m = fromUci(s, u);
            if (!m) break;
            const n = apply(s, m);
            zetten.push(label(s, m, n)); laatste = m; s = n; keys.push(key(s));
        }
        return { s, keys, zetten, laatste };
    }
    return { START, parse, fen, key, legal, apply, status, inCheck, toUci, replay };
})();

// ---------- Schaken: scherm ----------
const SCHAAK_SEL = '*, w:profiles!chess_games_white_fkey(username,avatar), z:profiles!chess_games_black_fkey(username,avatar)';
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟\uFE0E' };
const REDEN = { mat: 'schaakmat', pat: 'pat', '50': '50 zetten', materiaal: 'te weinig materiaal', herhaling: 'driemaal dezelfde stelling' };
const uitslag = g => (g.result === 'remise' ? 'Remise' : g.result === (g.white === me.id ? 'wit' : 'zwart') ? 'Gewonnen' : 'Verloren') + (g.reden ? ' · ' + g.reden : '');

// ---------- Animatie (gedeeld door schaken en dammen) ----------
const GEEN_ANIMATIE = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
// Laat een stuk van zijn beginvak over de vakken in "route" naar zijn eindvak schuiven (bij dammen kunnen dat er meerdere zijn)
function schuif(bord, el, van, route, ms) {
    if (!el || !el.animate || GEEN_ANIMATIE()) return;
    const pos = i => { const c = bord.querySelector(`[data-i="${i}"]`); return c && c.getBoundingClientRect(); };
    const eind = pos(route[route.length - 1]), stappen = [van, ...route].map(pos);
    if (!eind || stappen.some(r => !r)) return;
    el.style.position = 'relative';
    el.style.zIndex = 5;
    el.animate(stappen.map(r => ({ transform: `translate(${r.left - eind.left}px, ${r.top - eind.top}px)` })),
        { duration: ms * route.length, easing: 'ease-in-out' });
}
// Een geslagen stuk blijft heel even staan en vervaagt dan, zodat je ziet wat er gebeurt
function spook(bord, i, html, wacht, duur = 220) {
    const c = bord.querySelector(`[data-i="${i}"]`);
    if (!c || !c.animate || GEEN_ANIMATIE()) return;
    c.insertAdjacentHTML('beforeend', `<span class="spook">${html}</span>`);
    const s = c.lastElementChild;
    s.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.6)' }], { duration: duur, delay: wacht, fill: 'both' }).onfinish = () => s.remove();
}

function schaakLobby() { return spelLobby({ tabel: 'chess_games', sel: SCHAAK_SEL, hash: 'schaak', start: { fen: SCHAAK.START } }); }

// C = { tabel, sel, hash, start } beschrijft het spel: schaken (chess_games) of dammen (draughts_games)
async function spelLobby(C) {
    const el = $('speelveld');
    if (!me) { el.innerHTML = '<p class="intro">Log in om te spelen. <a href="#/login">Inloggen</a></p>'; return; }
    el.innerHTML = `<div class="schaak-lobby"><form id="uitdaag" class="blok"><h3>Daag iemand uit</h3>
        <select name="tegen" required><option value="">Kies een speler</option></select> <button>Uitdagen</button>
        <p class="fout" id="sch-fout"></p></form>
        <form id="botform" class="blok"><h3>Speel tegen de computer</h3>
        <select name="niveau"><option value="1">Makkelijk</option><option value="2" selected>Gemiddeld</option><option value="3">Moeilijk</option></select>
        <select name="kleur"><option value="w">Ik speel wit</option><option value="z">Ik speel zwart</option></select> <button>Start</button>
        <p class="intro" style="margin:8px 0 0">Deze partij wordt niet bewaard.</p></form><div id="sch-lijst"></div></div>`;
    sb.from('profiles').select('id,username').neq('id', me.id).order('username').limit(500).then(({ data }) => {
        const s = document.querySelector('#uitdaag select');
        if (s) (data || []).forEach(p => s.add(new Option(p.username, p.id)));
    });
    $('uitdaag').onsubmit = async e => {
        e.preventDefault();
        const tegen = e.target.tegen.value;
        if (!tegen) return;
        const wit = Math.random() < 0.5;       // wie wit krijgt, wordt geloot
        const { error } = await sb.from(C.tabel).insert({ white: wit ? me.id : tegen, black: wit ? tegen : me.id, created_by: me.id, status: 'uitgenodigd', ...C.start, moves: [] });
        $('sch-fout').textContent = error ? 'Uitdagen lukte niet. Je kunt maximaal 10 uitnodigingen open hebben.' : '';
        if (!error) laad();
    };
    $('botform').onsubmit = e => { e.preventDefault(); location.hash = `#/${C.hash}/bot-${e.target.niveau.value}-${e.target.kleur.value}`; };
    async function laad() {
        if (!$('sch-lijst')) return;
        const { data } = await sb.from(C.tabel).select(C.sel).order('updated_at', { ascending: false }).limit(40);
        const lijst = data || [];
        const rij = (g, tekst, knoppen = '') => {
            const tegen = g.white === me.id ? g.z : g.w;
            return `<div class="score-rij">${avatar(tegen, 22)}<a href="#/${C.hash}/${g.id}"><strong>${esc(tegen && tegen.username)}</strong></a><span class="sch-info">${esc(tekst)}</span>${knoppen}</div>`;
        };
        const del = (g, t) => `<button class="klein-knop" data-del="${g.id}">${t}</button>`;
        const blok = (titel, rijen) => rijen.length ? `<div class="blok"><h3>${titel}</h3>${rijen.join('')}</div>` : '';
        $('sch-lijst').innerHTML =
            blok('Uitnodigingen voor jou', lijst.filter(g => g.status === 'uitgenodigd' && g.created_by !== me.id)
                .map(g => rij(g, 'daagt je uit', `<button class="klein-knop" style="color:var(--primair)" data-acc="${g.id}">Accepteren</button>${del(g, 'Weigeren')}`))) +
            blok('Lopende partijen', lijst.filter(g => g.status === 'bezig')
                .map(g => rij(g, (g.moves.length % 2 === 0) === (g.white === me.id) ? 'jij bent aan zet' : 'wacht op tegenstander'))) +
            blok('Verstuurd', lijst.filter(g => g.status === 'uitgenodigd' && g.created_by === me.id)
                .map(g => rij(g, 'wacht op antwoord', del(g, 'Intrekken')))) +
            blok('Afgelopen', lijst.filter(g => g.status === 'afgelopen').slice(0, 8)
                .map(g => rij(g, uitslag(g), del(g, 'Weghalen'))));
        if (!lijst.length) $('sch-lijst').innerHTML = '<p class="leeg">Nog geen partijen. Daag iemand uit!</p>';
    }
    $('sch-lijst').onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.acc) {
            const { error } = await sb.from(C.tabel).update({ status: 'bezig' }).eq('id', b.dataset.acc);
            if (error) toast('Dat lukte niet.'); else location.hash = `#/${C.hash}/` + b.dataset.acc;
        }
        if (b.dataset.del) { await sb.from(C.tabel).delete().eq('id', b.dataset.del); laad(); }
    };
    const snel = debounce(laad, 300);
    const kanaal = sb.channel('lobby-' + C.tabel).on('postgres_changes', { event: '*', schema: 'public', table: C.tabel }, snel).subscribe();
    cleanup.push(() => sb.removeChannel(kanaal));
    laad();
}

async function schaakPartij(id) {
    const BOT = /^bot-([123])-([wz])$/.exec(id);      // tegen de computer: niets in de database
    if (!BOT && !/^[0-9a-f-]{36}$/i.test(id)) { location.hash = '#/games/schaken'; return; }
    app.innerHTML = '<div class="schaak"><p class="intro">Laden...</p></div>';
    const { data } = BOT ? { data: botPartij(BOT) } : await sb.from('chess_games').select(SCHAAK_SEL).eq('id', id).maybeSingle();
    if (!data) { app.innerHTML = '<div class="schaak"><p class="intro">Deze partij bestaat niet (meer). <a href="#/games/schaken">Terug</a></p></div>'; return; }
    let g = data, sel = -1, kies = null, getoond = -1;      // getoond = aantal zetten dat al op het scherm stond
    const wit = () => g.white === me.id;

    let weg = false;
    cleanup.push(() => { weg = true; });
    function botZet() {      // is de computer aan de beurt, dan laat hij even na en zet
        if (!BOT || weg || g.status !== 'bezig') return;
        if (SCHAAK.replay(g.moves).s.turn === (wit() ? 'w' : 'b')) return;
        const n = g.moves.length, t0 = Date.now();
        setTimeout(() => {      // eerst even wachten, zodat jouw zet klaar is met schuiven
            if (weg) return;
            const R = SCHAAK.replay(g.moves), m = CHESSBOT.kies(R.s, R.keys, +BOT[1]);
            setTimeout(() => { if (!weg && m && g.status === 'bezig' && g.moves.length === n) zet(m, R); }, Math.max(0, BOTWACHT[+BOT[1]] - (Date.now() - t0)));
        }, 450);
    }
    async function wijzig(velden) {
        if (BOT) { g = { ...g, ...velden }; sel = -1; kies = null; render(); botZet(); return; }
        const { data: d, error } = await sb.from('chess_games').update(velden).eq('id', g.id).select(SCHAAK_SEL).single();
        if (error) {
            toast('Dat mag nu niet.');
            const { data: vers } = await sb.from('chess_games').select(SCHAAK_SEL).eq('id', g.id).maybeSingle();
            if (vers) g = vers;
        } else g = d;
        sel = -1; kies = null; render();
    }
    function zet(m, R) {
        const n = SCHAAK.apply(R.s, m);
        const eind = SCHAAK.status(n, [...R.keys, SCHAAK.key(n)]);
        const v = { moves: [...g.moves, SCHAAK.toUci(m)], fen: SCHAAK.fen(n), draw_offer: null };
        if (eind) { v.status = 'afgelopen'; v.reden = REDEN[eind]; v.result = eind === 'mat' ? (R.s.turn === 'w' ? 'wit' : 'zwart') : 'remise'; }
        wijzig(v);
    }

    function render() {
        const R = SCHAAK.replay(g.moves), s = R.s, bezig = g.status === 'bezig';
        const mijn = bezig && s.turn === (wit() ? 'w' : 'b');
        const doelen = sel >= 0 && mijn ? SCHAAK.legal(s).filter(m => m.from === sel) : [];
        const schaak = bezig && SCHAAK.inCheck(s) ? s.b.indexOf(s.turn === 'w' ? 'K' : 'k') : -1;
        const tegen = wit() ? g.z : g.w;
        let cellen = '';
        for (let k = 0; k < 64; k++) {
            const i = wit() ? k : 63 - k, x = s.b[i];
            const klas = ['vak', ((i >> 3) + (i & 7)) % 2 ? 'donker' : 'licht'];
            if (i === sel) klas.push('sel');
            if (R.laatste && (i === R.laatste.from || i === R.laatste.to)) klas.push('laatste');
            if (i === schaak) klas.push('schaak');
            if (doelen.some(m => m.to === i)) klas.push('doel', x ? 'doel-bezet' : 'doel-leeg');
            cellen += `<div class="${klas.join(' ')}" data-i="${i}">${x ? `<span class="st ${x === x.toUpperCase() ? 'w' : 'z'}">${GLYPH[x.toUpperCase()]}</span>` : ''}</div>`;
        }
        let tekst;
        if (g.status === 'uitgenodigd') tekst = g.created_by === me.id ? 'Wacht tot je tegenstander de uitnodiging accepteert.' : 'Je bent uitgedaagd!';
        else if (g.status === 'afgelopen') tekst = uitslag(g);
        else tekst = mijn ? (schaak >= 0 ? 'Schaak! Jij bent aan zet.' : 'Jij bent aan zet.') : `Wachten op ${(tegen && tegen.username) || 'tegenstander'}...`;
        let knoppen = '';
        if (g.status === 'uitgenodigd' && g.created_by !== me.id) knoppen = '<button id="sch-acc">Accepteren</button> <button id="sch-weiger" class="header-knop">Weigeren</button>';
        if (bezig) {
            knoppen = '<button id="sch-op" class="header-knop">Opgeven</button> ' + (BOT ? '' : g.draw_offer === me.id
                ? '<button id="sch-remise-weg" class="header-knop">Remise-voorstel intrekken</button>'
                : g.draw_offer ? '<span class="sch-info">Remise voorgesteld:</span> <button id="sch-remise-ja">Accepteren</button> <button id="sch-remise-weg" class="header-knop">Weigeren</button>'
                : '<button id="sch-remise" class="header-knop">Remise voorstellen</button>');
        }
        let lijst = '';
        for (let i = 0; i < R.zetten.length; i += 2) lijst += `<span>${i / 2 + 1}. ${esc(R.zetten[i])} ${esc(R.zetten[i + 1] || '')}</span>`;
        const promo = kies ? `<div class="sch-promo">Kies een stuk: ${['q', 'r', 'b', 'n'].map(p => `<button data-promo="${p}"><span class="st ${s.turn === 'w' ? 'w' : 'z'}">${GLYPH[p.toUpperCase()]}</span></button>`).join('')}</div>` : '';
        app.innerHTML = `<div class="schaak"><p><a href="#/games/schaken">← Alle partijen</a></p>
            <div class="sch-spelers">${avatar(g.w, 24)}<strong>${esc(g.w && g.w.username)}</strong> (wit) tegen ${avatar(g.z, 24)}<strong>${esc(g.z && g.z.username)}</strong> (zwart)</div>
            <p class="sch-status">${esc(tekst)}</p>${promo}
            <div class="bord" id="sch-bord">${cellen}</div>
            <div class="sch-knoppen">${knoppen}</div>
            <div class="sch-zetten">${lijst || '<span class="sch-info">Nog geen zetten.</span>'}</div></div>`;

        if (getoond >= 0 && g.moves.length > getoond && R.laatste) {      // er is een nieuwe zet: laat hem zien
            const m = R.laatste, bord = $('sch-bord'), vorig = SCHAAK.replay(g.moves.slice(0, -1)).s;
            schuif(bord, bord.querySelector(`[data-i="${m.to}"] .st`), m.from, [m.to], 280);
            if (m.castle) {
                const van = m.castle === 'k' ? m.from + 3 : m.from - 4, naar = m.castle === 'k' ? m.from + 1 : m.from - 1;
                schuif(bord, bord.querySelector(`[data-i="${naar}"] .st`), van, [naar], 280);
            }
            const vangst = m.ep ? m.to + (vorig.turn === 'w' ? 8 : -8) : m.to, geslagen = vorig.b[vangst];
            if (geslagen) spook(bord, vangst, `<span class="st ${geslagen === geslagen.toUpperCase() ? 'w' : 'z'}">${GLYPH[geslagen.toUpperCase()]}</span>`, 180);
        }
        getoond = g.moves.length;
        const klik = (id, f) => { const el = $(id); if (el) el.onclick = f; };
        klik('sch-acc', () => wijzig({ status: 'bezig' }));
        klik('sch-weiger', async () => { await sb.from('chess_games').delete().eq('id', g.id); location.hash = '#/games/schaken'; });
        klik('sch-op', () => { if (confirm('Weet je zeker dat je wilt opgeven?')) wijzig({ status: 'afgelopen', result: wit() ? 'zwart' : 'wit', reden: 'opgegeven' }); });
        klik('sch-remise', () => wijzig({ draw_offer: me.id }));
        klik('sch-remise-weg', () => wijzig({ draw_offer: null }));
        klik('sch-remise-ja', () => wijzig({ status: 'afgelopen', result: 'remise', reden: 'overeengekomen' }));
        document.querySelectorAll('[data-promo]').forEach(b => b.onclick = () => zet(kies.find(m => m.promo === b.dataset.promo), R));
        $('sch-bord').onclick = e => {
            const c = e.target.closest('.vak');
            if (!c || !mijn || kies) return;
            const i = +c.dataset.i, x = s.b[i], zetten = doelen.filter(m => m.to === i);
            if (zetten.length) { if (zetten.length > 1) { kies = zetten; render(); } else zet(zetten[0], R); return; }
            sel = x && (x === x.toUpperCase()) === (s.turn === 'w') ? i : -1;
            render();
        };
    }

    const kanaal = BOT ? null : sb.channel('schaak-' + id).on('postgres_changes', { event: '*', schema: 'public', table: 'chess_games', filter: 'id=eq.' + id }, p => {
        if (p.eventType === 'DELETE') { location.hash = '#/games/schaken'; return; }
        g = { ...g, ...p.new }; sel = -1; kies = null; render();
    }).subscribe();
    if (kanaal) cleanup.push(() => sb.removeChannel(kanaal));
    render();
    botZet();
}
