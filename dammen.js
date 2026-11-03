// ---------- Dammen (10x10, internationale/Nederlandse regels): spelregels ----------
// Velden 1 t/m 50 zoals gebruikelijk: zwart staat boven (1-20), wit onder (31-50). Wit begint.
// Stukken: w/z = schijf, W/Z = dam. Slaan is verplicht, de meeste stukken moeten geslagen worden.
const DAM = (() => {
    const START = 'z'.repeat(20) + '.'.repeat(10) + 'w'.repeat(20);
    const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    const sq = (r, c) => (r < 0 || r > 9 || c < 0 || c > 9 || (r + c) % 2 === 0 ? -1 : r * 5 + (c >> 1));
    const rc = i => { const r = Math.floor(i / 5), k = i % 5; return [r, r % 2 === 0 ? 2 * k + 1 : 2 * k]; };
    const eig = (x, kant) => x !== '.' && x.toLowerCase() === kant;
    const isDam = x => x === 'W' || x === 'Z';
    const parse = str => ({ b: str.split(''), turn: 'w', quiet: 0 });
    const key = s => s.b.join('') + s.turn;

    // Alle slagreeksen voor het stuk op i. Geslagen stukken blijven tot het eind van de zet liggen en kunnen niet nog eens geslagen worden.
    function captures(b, i, me) {
        const uit = [], b2 = b.slice(), dam = isDam(b[i]);
        b2[i] = '.';
        (function dfs(pos, pad, over) {
            let door = false;
            const [r, c] = rc(pos);
            for (const [dr, dc] of DIRS) {
                let rr = r + dr, cc = c + dc, s = sq(rr, cc);
                if (dam) while (s >= 0 && b2[s] === '.') { rr += dr; cc += dc; s = sq(rr, cc); }
                if (s < 0 || b2[s] === '.' || eig(b2[s], me) || over.includes(s)) continue;
                let l = sq(rr + dr, cc + dc), lr = rr + dr, lc = cc + dc;
                while (l >= 0 && b2[l] === '.') {
                    door = true;
                    dfs(l, [...pad, l], [...over, s]);
                    if (!dam) break;
                    lr += dr; lc += dc; l = sq(lr, lc);
                }
            }
            if (!door && pad.length) uit.push({ path: pad, over });
        })(i, [], []);
        return uit;
    }
    function legal(s) {
        const me = s.turn, caps = [];
        for (let i = 0; i < 50; i++) if (eig(s.b[i], me)) for (const m of captures(s.b, i, me)) caps.push({ from: i, ...m });
        if (caps.length) { const mx = Math.max(...caps.map(m => m.over.length)); return caps.filter(m => m.over.length === mx); }
        const out = [];
        for (let i = 0; i < 50; i++) {
            const x = s.b[i];
            if (!eig(x, me)) continue;
            const [r, c] = rc(i);
            for (const [dr, dc] of DIRS) {
                if (!isDam(x) && dr !== (me === 'w' ? -1 : 1)) continue;
                let rr = r + dr, cc = c + dc, t = sq(rr, cc);
                while (t >= 0 && s.b[t] === '.') {
                    out.push({ from: i, path: [t], over: [] });
                    if (!isDam(x)) break;
                    rr += dr; cc += dc; t = sq(rr, cc);
                }
            }
        }
        return out;
    }
    function apply(s, m) {
        const b = s.b.slice(), x = b[m.from], dest = m.path[m.path.length - 1];
        b[m.from] = '.';
        for (const o of m.over) b[o] = '.';
        b[dest] = !isDam(x) && rc(dest)[0] === (s.turn === 'w' ? 0 : 9) ? x.toUpperCase() : x;   // alleen promoveren als je er eindigt
        return { b, turn: s.turn === 'w' ? 'z' : 'w', quiet: m.over.length || !isDam(x) ? 0 : s.quiet + 1 };
    }
    // null = de partij gaat door
    function status(s, keys) {
        if (!legal(s).length) return 'geenzetten';
        if (s.quiet >= 50) return '25';
        const k = key(s);
        return keys.filter(x => x === k).length >= 3 ? 'herhaling' : null;
    }
    const str = m => [m.from, ...m.path].map(i => i + 1).join(m.over.length ? 'x' : '-');
    function fromStr(s, t) {
        const n = t.split(/[-x]/).map(x => +x - 1);
        return legal(s).find(m => m.from === n[0] && m.path.length === n.length - 1 && m.path.every((p, k) => p === n[k + 1]));
    }
    function replay(moves) {
        let s = parse(START);
        const keys = [key(s)], zetten = [];
        let laatste = null;
        for (const t of moves) {
            const m = fromStr(s, t);
            if (!m) break;
            zetten.push(str(m)); laatste = m; s = apply(s, m); keys.push(key(s));
        }
        return { s, keys, zetten, laatste };
    }
    return { START, parse, key, legal, apply, status, str, replay, sq };
})();

// ---------- Dammen: scherm ----------
const DAM_SEL = '*, w:profiles!draughts_games_white_fkey(username,avatar), z:profiles!draughts_games_black_fkey(username,avatar)';
const DREDEN = { geenzetten: 'geen zetten meer', herhaling: 'driemaal dezelfde stelling', '25': '25 zetten met alleen dammen' };

function damLobby() { return spelLobby({ tabel: 'draughts_games', sel: DAM_SEL, hash: 'dam', start: {} }); }

async function damPartij(id) {
    const BOT = /^bot-([123])-([wz])$/.exec(id);      // tegen de computer: niets in de database
    if (!BOT && !/^[0-9a-f-]{36}$/i.test(id)) { location.hash = '#/games/dammen'; return; }
    app.innerHTML = '<div class="schaak"><p class="intro">Laden...</p></div>';
    const haal = () => sb.from('draughts_games').select(DAM_SEL).eq('id', id).maybeSingle();
    const { data } = BOT ? { data: botPartij(BOT) } : await haal();
    if (!data) { app.innerHTML = '<div class="schaak"><p class="intro">Deze partij bestaat niet (meer). <a href="#/games/dammen">Terug</a></p></div>'; return; }
    let g = data, sel = -1, pad = [], getoond = -1;      // getoond = aantal zetten dat al op het scherm stond
    const wit = () => g.white === me.id;

    let weg = false;
    cleanup.push(() => { weg = true; });
    function botZet() {
        if (!BOT || weg || g.status !== 'bezig') return;
        if (DAM.replay(g.moves).s.turn === (wit() ? 'w' : 'z')) return;
        const n = g.moves.length, t0 = Date.now();
        setTimeout(() => {
            if (weg) return;
            const R = DAM.replay(g.moves), m = DAMBOT.kies(R.s, R.keys, +BOT[1]);
            setTimeout(() => { if (!weg && m && g.status === 'bezig' && g.moves.length === n) zet(m, R); }, Math.max(0, BOTWACHT[+BOT[1]] - (Date.now() - t0)));
        }, 450);
    }
    async function wijzig(velden) {
        if (BOT) { g = { ...g, ...velden }; sel = -1; pad = []; render(); botZet(); return; }
        const { data: d, error } = await sb.from('draughts_games').update(velden).eq('id', g.id).select(DAM_SEL).single();
        if (error) { toast('Dat mag nu niet.'); const { data: vers } = await haal(); if (vers) g = vers; } else g = d;
        sel = -1; pad = []; render();
    }
    function zet(m, R) {
        const n = DAM.apply(R.s, m);
        const eind = DAM.status(n, [...R.keys, DAM.key(n)]);
        const v = { moves: [...g.moves, DAM.str(m)], draw_offer: null };
        if (eind) { v.status = 'afgelopen'; v.reden = DREDEN[eind]; v.result = eind === 'geenzetten' ? (R.s.turn === 'w' ? 'wit' : 'zwart') : 'remise'; }
        wijzig(v);
    }

    function render() {
        const R = DAM.replay(g.moves), s = R.s, bezig = g.status === 'bezig';
        const mijn = bezig && s.turn === (wit() ? 'w' : 'z');
        const alle = mijn ? DAM.legal(s) : [];
        const kand = sel >= 0 ? alle.filter(m => m.from === sel && pad.every((p, k) => m.path[k] === p)) : [];
        const doelen = new Set(kand.map(m => m.path[pad.length]));
        const laatste = R.laatste ? [R.laatste.from, R.laatste.path[R.laatste.path.length - 1]] : [];
        const tegen = wit() ? g.z : g.w, tel = x => s.b.filter(p => p.toLowerCase() === x).length;
        let cellen = '';
        for (let k = 0; k < 100; k++) {
            const r = wit() ? (k / 10) | 0 : 9 - ((k / 10) | 0), c = wit() ? k % 10 : 9 - (k % 10), i = DAM.sq(r, c);
            if (i < 0) { cellen += '<div class="dvak licht"></div>'; continue; }
            const x = s.b[i], klas = ['dvak', 'donker'];
            if (i === sel || pad.includes(i)) klas.push('sel');
            if (laatste.includes(i)) klas.push('laatste');
            if (doelen.has(i)) klas.push('doel');
            cellen += `<div class="${klas.join(' ')}" data-i="${i}" data-n="${i + 1}">${x !== '.' ? `<span class="dsch ${x.toLowerCase()}${x === 'W' || x === 'Z' ? ' dam' : ''}"></span>` : ''}</div>`;
        }
        let tekst;
        if (g.status === 'uitgenodigd') tekst = g.created_by === me.id ? 'Wacht tot je tegenstander de uitnodiging accepteert.' : 'Je bent uitgedaagd!';
        else if (g.status === 'afgelopen') tekst = uitslag(g);
        else tekst = mijn ? (alle.length && alle[0].over.length ? 'Jij bent aan zet. Je moet slaan!' : 'Jij bent aan zet.') : `Wachten op ${(tegen && tegen.username) || 'tegenstander'}...`;
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
        app.innerHTML = `<div class="schaak"><p><a href="#/games/dammen">← Alle partijen</a></p>
            <div class="sch-spelers">${avatar(g.w, 24)}<strong>${esc(g.w && g.w.username)}</strong> (wit) tegen ${avatar(g.z, 24)}<strong>${esc(g.z && g.z.username)}</strong> (zwart)</div>
            <p class="sch-status">${esc(tekst)}</p>
            <div class="dambord" id="dam-bord">${cellen}</div>
            <p class="sch-info" style="padding:6px 0">Wit: ${tel('w')} stukken · Zwart: ${tel('z')} stukken</p>
            <div class="sch-knoppen">${knoppen}</div>
            <div class="sch-zetten">${lijst || '<span class="sch-info">Nog geen zetten.</span>'}</div></div>`;

        if (getoond >= 0 && g.moves.length > getoond && R.laatste) {      // er is een nieuwe zet: laat hem zien
            const m = R.laatste, bord = $('dam-bord'), vorig = DAM.replay(g.moves.slice(0, -1)).s, eind = m.path[m.path.length - 1];
            schuif(bord, bord.querySelector(`[data-i="${eind}"] .dsch`), m.from, m.path, 260);
            m.over.forEach((o, k) => {      // geslagen stukken verdwijnen op het moment dat jouw stuk erlangs komt
                const x = vorig.b[o];
                spook(bord, o, `<span class="dsch ${x.toLowerCase()}${x === 'W' || x === 'Z' ? ' dam' : ''}"></span>`, 260 * k + 100);
            });
        }
        getoond = g.moves.length;
        const klik = (id2, f) => { const el = $(id2); if (el) el.onclick = f; };
        klik('sch-acc', () => wijzig({ status: 'bezig' }));
        klik('sch-weiger', async () => { await sb.from('draughts_games').delete().eq('id', g.id); location.hash = '#/games/dammen'; });
        klik('sch-op', () => { if (confirm('Weet je zeker dat je wilt opgeven?')) wijzig({ status: 'afgelopen', result: wit() ? 'zwart' : 'wit', reden: 'opgegeven' }); });
        klik('sch-remise', () => wijzig({ draw_offer: me.id }));
        klik('sch-remise-weg', () => wijzig({ draw_offer: null }));
        klik('sch-remise-ja', () => wijzig({ status: 'afgelopen', result: 'remise', reden: 'overeengekomen' }));
        $('dam-bord').onclick = e => {
            const c = e.target.closest('.dvak');
            if (!c || !c.dataset.i || !mijn) return;
            const i = +c.dataset.i;
            const volgende = kand.filter(m => m.path[pad.length] === i);
            if (volgende.length) {
                pad.push(i);
                for (;;) {      // zit er maar één mogelijkheid in, dan vult de site de rest van de slag zelf in
                    const klaar = volgende.find(m => m.path.length === pad.length);
                    if (klaar) return zet(klaar, R);
                    const vervolg = new Set(volgende.map(m => m.path[pad.length]));
                    if (vervolg.size !== 1) break;
                    pad.push([...vervolg][0]);
                }
                render();
                return;
            }
            sel = alle.some(m => m.from === i) ? i : -1;
            pad = [];
            render();
        };
    }

    const kanaal = BOT ? null : sb.channel('dam-' + id).on('postgres_changes', { event: '*', schema: 'public', table: 'draughts_games', filter: 'id=eq.' + id }, p => {
        if (p.eventType === 'DELETE') { location.hash = '#/games/dammen'; return; }
        g = { ...g, ...p.new }; sel = -1; pad = []; render();
    }).subscribe();
    if (kanaal) cleanup.push(() => sb.removeChannel(kanaal));
    render();
    botZet();
}
