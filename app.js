const sb = supabase.createClient(MIETERS.URL, MIETERS.KEY);
const app = document.getElementById('app');
const $ = id => document.getElementById(id);
let me = null;       // ingelogde gebruiker: { id, username, avatar }
let cleanup = [];    // functies die bij het verlaten van een pagina worden uitgevoerd

// ---------- Hulpfuncties ----------
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pub = (bucket, path) => sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
const email = naam => naam.toLowerCase() + '@mieters.app';   // Supabase wil een e-mailadres; we maken er een van je gebruikersnaam

function avatar(p, size = 30) {
    const stijl = `width:${size}px;height:${size}px`;
    return p && p.avatar
        ? `<img class="av" style="${stijl}" src="${esc(pub('avatars', p.avatar))}">`
        : `<div class="av av-leeg" style="${stijl}">${esc(((p && p.username) || '?')[0].toUpperCase())}</div>`;
}

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
function checkFile(file) {
    if (!file || !TYPES[file.type] || file.size > 5 * 1024 * 1024)
        throw new Error('Kies een jpg, png, gif of webp van maximaal 5 MB.');
}
async function upload(bucket, file, uid) {
    checkFile(file);
    const pad = `${uid}/${crypto.randomUUID()}.${TYPES[file.type]}`;
    const { error } = await sb.storage.from(bucket).upload(pad, file);
    if (error) throw error;
    return pad;
}

async function laadMij() {
    const { data: { session } } = await sb.auth.getSession();
    me = null;
    if (session) {
        const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
        me = data;
    }
}

function toast(tekst) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = tekst;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3500);
}

// ---------- Menu en router ----------
function renderMenu() {
    const nu = location.hash.replace(/^#\/?/, '').split('/')[0];
    const k = (h, t) => `<a href="#/${h}" class="${nu === h ? 'actief' : ''}">${t}</a>`;
    $('menu').innerHTML = `<a href="#/"><img class="logo" src="image/mieters.png" alt="mieters"></a><div class="links">` +
        k('', 'Home') + k('chat', 'Chat') + k('photos', "Foto's") + k('games', 'Spellen') +
        (me ? k('profile', avatar(me, 22) + ' Profiel') : k('login', 'Inloggen')) + `</div>`;
}

async function route() {
    cleanup.forEach(f => f());
    cleanup = [];
    const [naam, arg] = location.hash.replace(/^#\/?/, '').split('/');
    if (['chat', 'profile', 'bot'].includes(naam) && !me) { location.hash = '#/login'; return; }
    renderMenu();
    const paginas = { login, register, photos, profile, chat, bot, games };
    await (paginas[naam] || home)(decodeURIComponent(arg || ''));
}

// ---------- Pagina's ----------
function home() {
    app.innerHTML = `<section class="hero"><h1>${me ? 'Hallo ' + esc(me.username) + '!' : 'Welkom bij Mieters'}</h1>
        <p>Deel foto's en chat met je vrienden.</p>
        <div class="hero-knoppen">${me
            ? '<a class="knop" href="#/chat">Naar je chats</a><a class="knop licht" href="#/photos">Bekijk foto\'s</a>'
            : '<a class="knop" href="#/register">Account maken</a><a class="knop licht" href="#/login">Inloggen</a>'}</div></section>
        <section class="quote" id="quote"></section>
        <section class="kaarten">
        <a class="kaart" href="#/chat"><span>💬</span><h3>Chat</h3><p>Stuur berichten, live en met leesbevestiging.</p></a>
        <a class="kaart" href="#/photos"><span>📷</span><h3>Foto's</h3><p>Deel foto's met een beschrijving en @vermeldingen.</p></a>
        <a class="kaart" href="#/profile"><span>👤</span><h3>Profiel</h3><p>Beheer je profielfoto en je eigen foto's.</p></a></section>`;
    laadQuote();
}

// Quote van de dag: eerst kijken of hij al is opgeslagen, anders vraagt de functie hem aan de AI
async function laadQuote() {
    const dag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
    let { data } = await sb.from('daily_quotes').select('quote').eq('day', dag).maybeSingle();
    if (!data) {
        const r = await sb.functions.invoke('quote');
        data = r.data && r.data.quote ? r.data : null;
    }
    const el = $('quote');
    if (el && data) el.innerHTML = `<small>Quote van de dag</small><p>${esc(data.quote)}</p>`;
}

function login() {
    app.innerHTML = `<div class="auth-kaart"><h2>Inloggen</h2><p class="fout" id="fout"></p>
        <form id="f"><label>Gebruikersnaam</label><br><input name="u" required><br><br>
        <label>Wachtwoord</label><br><input name="p" type="password" required><br><br>
        <button>Inloggen</button></form>
        <p>Nog geen account? <a href="#/register">Registreren</a></p></div>`;
    $('f').onsubmit = async e => {
        e.preventDefault();
        const f = e.target;
        const { error } = await sb.auth.signInWithPassword({ email: email(f.u.value.trim()), password: f.p.value });
        if (error) { $('fout').textContent = 'Gebruikersnaam of wachtwoord klopt niet.'; return; }
        await laadMij();
        location.hash = '#/';
    };
}

function register() {
    app.innerHTML = `<div class="auth-kaart"><h2>Account aanmaken</h2><p class="fout" id="fout"></p>
        <form id="f"><label>Gebruikersnaam</label><br>
        <input name="u" required pattern="[A-Za-z0-9_]{3,20}" title="3 tot 20 letters, cijfers of _"><br><br>
        <label>Wachtwoord</label><br><input name="p" type="password" minlength="6" required><br><br>
        <label>Profielfoto</label><br><input name="file" type="file" accept="image/*" required><br><br>
        <button>Registreren</button></form>
        <p>Al een account? <a href="#/login">Inloggen</a></p></div>`;
    $('f').onsubmit = async e => {
        e.preventDefault();
        const f = e.target, naam = f.u.value.trim();
        try {
            checkFile(f.file.files[0]);   // eerst controleren, zodat er geen half account ontstaat
            const { data, error } = await sb.auth.signUp({ email: email(naam), password: f.p.value });
            if (error) throw new Error(/registered/i.test(error.message) ? 'Deze gebruikersnaam is al bezet.' : error.message);
            if (!data.session) throw new Error('Zet "Confirm email" uit in Supabase (zie SETUP.md).');
            const pad = await upload('avatars', f.file.files[0], data.user.id);
            const { error: e2 } = await sb.from('profiles').insert({ id: data.user.id, username: naam, avatar: pad });
            if (e2) throw e2;
            await laadMij();
            location.hash = '#/';
        } catch (err) { $('fout').textContent = err.message; }
    };
}

async function photos() {
    app.innerHTML = (me
        ? `<form id="up"><input type="file" name="file" accept="image/*" required><br><br>
           <input name="desc" placeholder="Voeg een beschrijving toe..." maxlength="300"><br><br>
           <button>Uploaden</button> <span class="fout" id="fout"></span></form>`
        : `<p><a href="#/login">Inloggen</a> om foto's te uploaden.</p>`) +
        `<div id="fotos" class="fotos"></div><div id="overlay" hidden><img></div>`;

    async function laad() {
        const { data } = await sb.from('photos').select('id,path,description,profiles(username,avatar)').order('created_at', { ascending: false });
        $('fotos').innerHTML = (data || []).map(r => `
            <div class="foto-item">
                <img src="${esc(pub('photos', r.path))}">
                <div class="rij">${avatar(r.profiles)}<p>${esc(r.profiles && r.profiles.username)}</p></div>
                ${r.description ? `<p class="beschr">${esc(r.description).replace(/@([a-zA-Z0-9_]+)/g, '<strong class="mention">@$1</strong>')}</p>` : ''}
            </div>`).join('');
        if (!data || !data.length) $('fotos').innerHTML = '<p class="leeg">Nog geen foto\'s. Wees de eerste!</p>';
    }
    $('fotos').onclick = e => {
        if (e.target.tagName !== 'IMG') return;
        $('overlay').querySelector('img').src = e.target.src;
        $('overlay').hidden = false;
    };
    $('overlay').onclick = () => { $('overlay').hidden = true; };

    if (me) $('up').onsubmit = async e => {
        e.preventDefault();
        const f = e.target;
        try {
            const pad = await upload('photos', f.file.files[0], me.id);
            const { error } = await sb.from('photos').insert({ user_id: me.id, path: pad, description: f.desc.value.trim() });
            if (error) { await sb.storage.from('photos').remove([pad]); throw error; }
            f.reset();
            $('fout').textContent = '';
            laad();
        } catch (err) { $('fout').textContent = err.message; }
    };

    const kanaal = sb.channel('fotos').on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, laad).subscribe();
    cleanup.push(() => sb.removeChannel(kanaal));
    laad();
}

async function profile() {
    const { data: fotos } = await sb.from('photos').select('id,path,description').eq('user_id', me.id).order('created_at', { ascending: false });
    app.innerHTML = `<div class="blok"><h2>${esc(me.username)}</h2><br>${avatar(me, 150)}<br><br>
        <form id="pf"><input type="file" name="file" accept="image/*" required><br><br>
        <button>Profielfoto uploaden</button> <span class="fout" id="fout"></span></form>
        <button id="uit">Uitloggen</button></div>
        <h3>Mijn foto's</h3>
        <div class="fotos">${(fotos || []).map(r => `
            <div class="foto-item klein"><img src="${esc(pub('photos', r.path))}">
            <button class="x" data-id="${r.id}" data-pad="${esc(r.path)}">×</button>
            ${r.description ? `<p class="beschr">${esc(r.description)}</p>` : ''}</div>`).join('')}</div>
        <p class="gevaar"><a href="#" id="del">Account verwijderen</a></p>`;

    $('pf').onsubmit = async e => {
        e.preventDefault();
        try {
            const pad = await upload('avatars', e.target.file.files[0], me.id);
            const { error } = await sb.from('profiles').update({ avatar: pad }).eq('id', me.id);
            if (error) throw error;
            me.avatar = pad;
            profile();
        } catch (err) { $('fout').textContent = err.message; }
    };
    $('del').onclick = async e => {
        e.preventDefault();
        if (!confirm('Dit verwijdert je account en al je foto\'s, berichten en botgesprekken permanent. Weet je het zeker?')) return;
        const { data: res, error } = await sb.functions.invoke('account-verwijderen');
        if (error || !res || !res.ok) { toast((res && res.bericht) || 'Account verwijderen is niet gelukt.'); return; }
        await sb.auth.signOut({ scope: 'local' });
        me = null;
        location.hash = '#/';
    };
    $('uit').onclick = async () => { await sb.auth.signOut(); me = null; location.hash = '#/'; };
    app.querySelectorAll('.x').forEach(b => b.onclick = async () => {
        if (!confirm('Wil je deze foto verwijderen?')) return;
        await sb.from('photos').delete().eq('id', b.dataset.id);
        await sb.storage.from('photos').remove([b.dataset.pad]);
        profile();
    });
}

// Afbeeldingen in de chat staan in een privé opslag; hiermee halen we tijdelijke links op (en onthouden ze)
const urlCache = {};
async function chatUrls(paden) {
    const nu = Date.now();
    const nodig = paden.filter(p => !urlCache[p] || urlCache[p].tot < nu);
    if (nodig.length) {
        const { data } = await sb.storage.from('chat').createSignedUrls(nodig, 3600);
        (data || []).forEach(x => { if (x.signedUrl) urlCache[x.path] = { url: x.signedUrl, tot: nu + 3300 * 1000 }; });
    }
    return urlCache;
}

async function chat(met) {
    app.innerHTML = `<div class="whatsapp"><div class="contacten"><div class="contacten-header"><h3>Chats</h3></div>
        <div id="lijst"></div></div><div class="chatvenster" id="venster"></div></div>`;
    const { data: users } = await sb.from('profiles').select('id,username,avatar').neq('id', me.id).order('username');
    const andere = (users || []).find(u => u.username === met);
    document.querySelector('.whatsapp').classList.toggle('open', !!andere);

    async function laadLijst() {
        const { data } = await sb.from('messages').select('sender,recipient,body,image,created_at,hidden_by_sender,hidden_by_recipient').order('created_at', { ascending: false }).limit(500);
        const laatste = {};
        (data || []).forEach(m => {
            const eigen = m.sender === me.id;
            if (eigen ? m.hidden_by_sender : m.hidden_by_recipient) return;
            const ander = eigen ? m.recipient : m.sender;
            if (!laatste[ander]) laatste[ander] = m;
        });
        const tijd = u => (laatste[u.id] && laatste[u.id].created_at) || '';
        const lijst = [...users].sort((a, b) => tijd(b).localeCompare(tijd(a)) || a.username.localeCompare(b.username));
        $('lijst').innerHTML = lijst.map(u => `
            <a class="contact ${u.username === met ? 'actief' : ''}" href="#/chat/${encodeURIComponent(u.username)}">
                ${avatar(u, 45)}<div class="contact-info"><strong>${esc(u.username)}</strong>
                <span>${esc(laatste[u.id] ? (laatste[u.id].image ? '📷 Foto' : laatste[u.id].body) : 'Nog geen berichten')}</span></div></a>`).join('');
    }

    async function laadBerichten() {
        if (!andere) return;
        const { data } = await sb.from('messages').select('*')
            .or(`and(sender.eq.${me.id},recipient.eq.${andere.id}),and(sender.eq.${andere.id},recipient.eq.${me.id})`).order('created_at');
        const zichtbaar = (data || []).filter(m => !(m.sender === me.id ? m.hidden_by_sender : m.hidden_by_recipient));
        const cache = await chatUrls(zichtbaar.filter(m => m.image).map(m => m.image));
        const fotoUrl = p => (cache[p] && cache[p].url) || '';
        $('chat').innerHTML = zichtbaar.map(m => {
            const eigen = m.sender === me.id;
            const tijd = new Date(m.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            return `<div class="bericht-rij ${eigen ? 'eigen' : ''}">${avatar(eigen ? me : andere)}
                <div class="bericht">${m.image ? `<a href="${esc(fotoUrl(m.image))}" target="_blank" rel="noopener"><img class="chat-foto" src="${esc(fotoUrl(m.image))}"></a>` : ''}${esc(m.body)}<div class="bericht-voet"><span>${tijd}</span>
                ${eigen ? `<span class="vinkje ${m.read ? 'gelezen' : ''}">✓✓</span>` : ''}</div></div></div>`;
        }).join('');
        $('chat').scrollTop = $('chat').scrollHeight;
        if (zichtbaar.some(m => m.recipient === me.id && !m.read))
            await sb.from('messages').update({ read: true }).eq('recipient', me.id).eq('sender', andere.id).eq('read', false);
    }

    if (!andere) {
        $('venster').innerHTML = `<div class="chat-leeg">Kies een chat om te beginnen</div>`;
    } else {
        $('venster').innerHTML = `<div class="chat-header"><a class="terug" href="#/chat">←</a>${avatar(andere, 40)}<strong style="flex:1">${esc(andere.username)}</strong>
            <button class="header-knop" id="wis">Verwijderen</button></div><div id="chat"></div>
            <form id="bf"><label class="bijlage" title="Foto of GIF sturen">📎<input type="file" id="bijlage" accept="image/*" hidden></label><input name="b" placeholder="Typ een bericht..." autocomplete="off" maxlength="2000"><button>Versturen</button></form>`;
        $('bf').onsubmit = async e => {
            e.preventDefault();
            const tekst = e.target.b.value.trim();
            if (!tekst) return;
            e.target.b.value = '';
            const { error } = await sb.from('messages').insert({ sender: me.id, recipient: andere.id, body: tekst });
            if (error) toast(error.message);
            laadBerichten();
            laadLijst();
        };
        $('bijlage').onchange = async e => {
            const f = e.target.files[0];
            e.target.value = '';
            if (!f) return;
            try {
                const pad = await upload('chat', f, me.id);
                const { error } = await sb.from('messages').insert({ sender: me.id, recipient: andere.id, body: '', image: pad });
                if (error) throw error;
                laadBerichten();
                laadLijst();
            } catch (err) { toast(err.message); }
        };
        $('wis').onclick = async () => {
            if (!confirm('Wil je deze chat verwijderen?')) return;
            await sb.from('messages').update({ hidden_by_sender: true }).eq('sender', me.id).eq('recipient', andere.id);
            await sb.from('messages').update({ hidden_by_recipient: true }).eq('recipient', me.id).eq('sender', andere.id);
            location.hash = '#/chat';
        };
    }

    const kanaal = sb.channel('berichten').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' },
        () => { laadLijst(); laadBerichten(); }).subscribe();
    cleanup.push(() => sb.removeChannel(kanaal));
    laadLijst();
    laadBerichten();
}

async function bot() {
    const { data } = await sb.from('bot_history').select('role,content').order('id');
    app.innerHTML = `<div class="bot-container"><div class="bot-header"><h2>AI Bot</h2>
        <a href="#" id="wis" class="wis-knop">Gesprek wissen</a></div>
        <div id="botchat"></div>
        <form id="bf2"><input name="v" placeholder="Stel een vraag..." autocomplete="off" maxlength="2000" required><button>Versturen</button></form></div>`;
    const botchat = $('botchat');

    function voegToe(eigen, tekst) {
        const rij = document.createElement('div');
        rij.className = 'bot-rij ' + (eigen ? 'eigen' : 'bot');
        const naam = document.createElement('span');
        naam.className = 'naam';
        naam.textContent = eigen ? 'Jij' : 'Bot';
        const inhoud = document.createElement('div');
        inhoud.className = 'bot-bericht';
        inhoud.textContent = tekst;      // textContent: geen HTML uitvoeren
        rij.append(naam, inhoud);
        botchat.appendChild(rij);
        botchat.scrollTop = botchat.scrollHeight;
        return rij;
    }

    if (!data || data.length === 0) voegToe(false, 'Hallo! Ik ben de AI bot. Stel me een vraag!');
    else data.forEach(r => voegToe(r.role === 'user', r.content));

    $('bf2').onsubmit = async e => {
        e.preventDefault();
        const vraag = e.target.v.value.trim();
        if (!vraag) return;
        e.target.v.value = '';
        voegToe(true, vraag);
        const laden = voegToe(false, 'Bot is aan het typen...');
        const { data: res, error } = await sb.functions.invoke('bot', { body: { vraag } });
        laden.remove();
        voegToe(false, error || !res ? 'Fout: de bot is niet bereikbaar.' : res.antwoord);
    };
    $('wis').onclick = async e => {
        e.preventDefault();
        if (!confirm('Wil je het gesprek wissen?')) return;
        await sb.from('bot_history').delete().eq('user_id', me.id);
        bot();
    };
}

// ---------- Spellen ----------
const SPELLEN = {
    snake:   { naam: 'Snake', laag: false },
    memory:  { naam: 'Memory', laag: true },
    klikker: { naam: 'Klikker', laag: false },
    reactie: { naam: 'Reactietest', laag: true, eenheid: ' ms' },
    mol:     { naam: 'Mep de mol', laag: false },
    rps:     { naam: 'Steen papier schaar', laag: false },
    rit:     { naam: 'Gekke rit', laag: false, geenScores: true },
};

function games(spel) {
    if (!SPELLEN[spel]) spel = 'snake';
    app.innerHTML = `<h2>Spellen</h2>
        <div class="spel-tabs">${Object.entries(SPELLEN).map(([k, s]) => `<a href="#/games/${k}" class="${k === spel ? 'actief' : ''}">${s.naam}</a>`).join('')}</div>
        <div class="spel-wrap"><div id="speelveld"></div><div id="scores"></div></div>`;
    ({ snake, memory, klikker, reactie, mol, rps, rit })[spel]();
    laadScores(spel, SPELLEN[spel].laag);
}

// Bewaart je score alleen als het je beste is (bij Memory is minder zetten beter)
async function bewaarScore(spel, score, laagIsBeter) {
    if (!me) return;
    const { data: oud } = await sb.from('highscores').select('score').eq('game', spel).eq('user_id', me.id).maybeSingle();
    const beter = !oud || (laagIsBeter ? score < oud.score : score > oud.score);
    if (beter) await sb.from('highscores').upsert({ game: spel, user_id: me.id, score });
    laadScores(spel, laagIsBeter);
}

async function laadScores(spel, laagIsBeter) {
    if (SPELLEN[spel].geenScores) { if ($('scores')) $('scores').innerHTML = ''; return; }
    const { data } = await sb.from('highscores').select('score,profiles(username,avatar)')
        .eq('game', spel).order('score', { ascending: laagIsBeter }).limit(10);
    const el = $('scores');
    if (!el) return;
    el.innerHTML = `<h3>Top 10</h3>` + ((data || []).map((r, i) => `
        <div class="score-rij"><span>${i + 1}.</span>${avatar(r.profiles, 22)}
        <strong>${esc(r.profiles && r.profiles.username)}</strong><span class="punten">${r.score}${SPELLEN[spel].eenheid || ''}</span></div>`).join('')
        || '<p class="leeg">Nog geen scores.</p>') + (me ? '' : '<p class="intro">Log in om je score te bewaren.</p>');
}

function snake() {
    $('speelveld').innerHTML = `<p id="score">Score: 0</p><canvas class="snake" width="300" height="300"></canvas>
        <div class="pijlen"><button data-d="0,-1">↑</button><button data-d="-1,0">←</button><button data-d="0,1">↓</button><button data-d="1,0">→</button></div>`;
    const ctx = document.querySelector('canvas.snake').getContext('2d');
    const N = 15, S = 20;
    let slang, richting, volgende, appel, score, timer;

    function nieuw() {
        slang = [{ x: 7, y: 7 }];
        richting = volgende = { x: 1, y: 0 };
        score = 0;
        $('score').textContent = 'Score: 0';
        zetAppel();
        teken();
        clearInterval(timer);
        timer = setInterval(stap, 120);
    }
    function zetAppel() {
        do { appel = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; }
        while (slang.some(s => s.x === appel.x && s.y === appel.y));
    }
    function stap() {
        richting = volgende;
        const kop = { x: slang[0].x + richting.x, y: slang[0].y + richting.y };
        if (kop.x < 0 || kop.y < 0 || kop.x >= N || kop.y >= N || slang.some(s => s.x === kop.x && s.y === kop.y)) return einde();
        slang.unshift(kop);
        if (kop.x === appel.x && kop.y === appel.y) { score++; $('score').textContent = 'Score: ' + score; zetAppel(); }
        else slang.pop();
        teken();
    }
    function teken() {
        ctx.fillStyle = '#10241d';
        ctx.fillRect(0, 0, 300, 300);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(appel.x * S, appel.y * S, S - 2, S - 2);
        ctx.fillStyle = '#34d399';
        slang.forEach(s => ctx.fillRect(s.x * S, s.y * S, S - 2, S - 2));
    }
    async function einde() {
        clearInterval(timer);
        $('score').innerHTML = `Game over! Score: ${score} <button id="opnieuw">Opnieuw</button>`;
        $('opnieuw').onclick = nieuw;
        await bewaarScore('snake', score, false);
    }
    function stuur(dx, dy) {
        if (dx === -richting.x && dy === -richting.y && slang.length > 1) return;   // niet achteruit
        volgende = { x: dx, y: dy };
    }
    const toets = e => {
        const k = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
        if (!k) return;
        e.preventDefault();
        stuur(k[0], k[1]);
    };
    document.addEventListener('keydown', toets);
    document.querySelectorAll('.pijlen button').forEach(b => b.onclick = () => stuur(...b.dataset.d.split(',').map(Number)));
    cleanup.push(() => { clearInterval(timer); document.removeEventListener('keydown', toets); });
    nieuw();
}

function memory() {
    const plaatjes = ['🍎', '🐶', '🚀', '🎸', '🌵', '🍕', '⚽', '🦊'];
    const kaarten = [...plaatjes, ...plaatjes].sort(() => Math.random() - 0.5);
    let open = [], zetten = 0, gevonden = 0, wacht = false;
    $('speelveld').innerHTML = `<p id="score">Zetten: 0</p>
        <div class="memory">${kaarten.map((k, i) => `<button class="mem" data-i="${i}">?</button>`).join('')}</div>
        <p><button id="nieuwspel">Nieuw spel</button></p>`;
    const knoppen = [...document.querySelectorAll('.mem')];
    $('nieuwspel').onclick = memory;
    knoppen.forEach(b => b.onclick = () => {
        const i = Number(b.dataset.i);
        if (wacht || open.includes(i)) return;
        b.textContent = kaarten[i];
        open.push(i);
        if (open.length < 2) return;
        zetten++;
        $('score').textContent = 'Zetten: ' + zetten;
        const [a, c] = open;
        open = [];
        if (kaarten[a] === kaarten[c]) {
            [a, c].forEach(n => { knoppen[n].disabled = true; knoppen[n].classList.add('klaar'); });
            if (++gevonden === plaatjes.length) {
                $('score').textContent = `Gewonnen in ${zetten} zetten!`;
                bewaarScore('memory', zetten, true);
            }
        } else {
            wacht = true;
            setTimeout(() => { knoppen[a].textContent = knoppen[c].textContent = '?'; wacht = false; }, 800);
        }
    });
}

function klikker() {
    $('speelveld').innerHTML = `<p id="score">Klik zo snel je kan! Je hebt 10 seconden.</p><button id="grote" class="groot">KLIK!</button>`;
    let n = 0, tijd = 10, timer = null;
    const info = () => { $('score').textContent = `Klikken: ${n} · nog ${tijd} s`; };
    $('grote').onclick = () => {
        if (!timer) timer = setInterval(() => { tijd--; info(); if (tijd <= 0) einde(); }, 1000);
        n++;
        info();
    };
    function einde() {
        clearInterval(timer);
        $('grote').disabled = true;
        $('score').innerHTML = `Klaar! ${n} klikken <button id="opnieuw">Opnieuw</button>`;
        $('opnieuw').onclick = klikker;
        bewaarScore('klikker', n, false);
    }
    cleanup.push(() => clearInterval(timer));
}

function reactie() {
    $('speelveld').innerHTML = `<div id="vlak" class="reactie start">Klik om te starten</div><p id="score"></p>`;
    let stand = 'start', t0 = 0, timeout;
    $('vlak').onclick = () => {
        const v = $('vlak');
        if (stand === 'start') {
            stand = 'wacht';
            v.className = 'reactie wacht';
            v.textContent = 'Wacht op groen...';
            timeout = setTimeout(() => { stand = 'nu'; v.className = 'reactie nu'; v.textContent = 'KLIK NU!'; t0 = performance.now(); }, 1500 + Math.random() * 3000);
        } else if (stand === 'wacht') {
            clearTimeout(timeout);
            stand = 'start';
            v.className = 'reactie start';
            v.textContent = 'Te vroeg! Klik om opnieuw te proberen';
        } else {
            const ms = Math.round(performance.now() - t0);
            stand = 'start';
            v.className = 'reactie start';
            v.textContent = 'Klik om opnieuw te spelen';
            $('score').textContent = `Jouw tijd: ${ms} ms`;
            bewaarScore('reactie', ms, true);
        }
    };
    cleanup.push(() => clearTimeout(timeout));
}

function mol() {
    $('speelveld').innerHTML = `<p id="score">Mep de mol! Druk op start, je hebt 20 seconden.</p>
        <div class="gaten">${Array.from({ length: 9 }, (_, i) => `<button class="gat"></button>`).join('')}</div>
        <p><button id="start">Start</button></p>`;
    const gaten = [...document.querySelectorAll('.gat')];
    let score = 0, tijd = 0, actief = -1, wissel, klok;
    const info = () => { $('score').textContent = `Score: ${score} · nog ${tijd} s`; };
    function toon() {
        gaten.forEach(g => g.textContent = '');
        actief = Math.floor(Math.random() * 9);
        gaten[actief].textContent = '🐹';
    }
    gaten.forEach((g, i) => g.onclick = () => {
        if (i !== actief) return;
        score++;
        actief = -1;
        g.textContent = '💥';
        info();
    });
    function einde() {
        clearInterval(wissel);
        clearInterval(klok);
        actief = -1;
        gaten.forEach(g => g.textContent = '');
        $('score').textContent = `Klaar! Je hebt ${score} mollen gemept.`;
        bewaarScore('mol', score, false);
    }
    $('start').onclick = () => {
        clearInterval(wissel);
        clearInterval(klok);
        score = 0;
        tijd = 20;
        info();
        toon();
        wissel = setInterval(toon, 750);
        klok = setInterval(() => { tijd--; info(); if (tijd <= 0) einde(); }, 1000);
    };
    cleanup.push(() => { clearInterval(wissel); clearInterval(klok); });
}

function rps() {
    const opties = [['🪨', 'Steen'], ['📄', 'Papier'], ['✂️', 'Schaar']];
    let reeks = 0;
    $('speelveld').innerHTML = `<p id="score">Win zo vaak mogelijk achter elkaar. Reeks: 0</p>
        <div class="rps">${opties.map((o, i) => `<button data-i="${i}">${o[0]}<br><small>${o[1]}</small></button>`).join('')}</div>
        <p id="uitslag"></p>`;
    document.querySelectorAll('.rps button').forEach(b => b.onclick = () => {
        const jij = Number(b.dataset.i), pc = Math.floor(Math.random() * 3);
        let tekst;
        if (jij === pc) tekst = 'Gelijkspel!';
        else if ((jij + 2) % 3 === pc) { reeks++; tekst = 'Jij wint!'; }
        else {
            tekst = `Verloren... je reeks was ${reeks}.`;
            if (reeks > 0) bewaarScore('rps', reeks, false);
            reeks = 0;
        }
        $('uitslag').textContent = `Jij: ${opties[jij][0]}  Computer: ${opties[pc][0]} · ${tekst}`;
        $('score').textContent = `Reeks: ${reeks}`;
    });
}

// Gekke rit: een eigen autospel (geen kopie van een bestaand spel). Rij naar de finish zonder te crashen.
function rit() {
    const W = 640, H = 320, L = 22, R = 9, G = 0.35;
    const LEVELS = [
        { punten: [[0, 240], [700, 240], [900, 170], [1100, 240], [1500, 240], [1700, 190], [1900, 240], [2500, 240]], gaten: [], finish: 2350 },
        { punten: [[0, 240], [600, 240], [780, 190], [930, 190], [1300, 190], [1500, 240], [2200, 240]], gaten: [[780, 930]], finish: 2050 },
        { punten: [[0, 240], [400, 240], [480, 215], [560, 240], [640, 215], [720, 240], [800, 215], [880, 240], [960, 205], [1040, 240], [1120, 240], [1250, 170], [1400, 240], [1900, 240]], gaten: [], finish: 1750 },
        { punten: [[0, 240], [500, 240], [650, 185], [800, 185], [1000, 185], [1150, 240], [1500, 240], [1650, 185], [1800, 185], [1950, 240], [2400, 240]], gaten: [[650, 800], [1650, 1800]], finish: 2250 },
        { punten: [[0, 240], [500, 240], [660, 190], [820, 190], [1000, 190], [1120, 240], [1300, 240], [1400, 200], [1500, 240], [1600, 200], [1700, 240], [1800, 240], [1950, 180], [2120, 180], [2200, 240], [2800, 240]], gaten: [[660, 800], [1950, 2120]], finish: 2650 },
        { punten: [[0, 240], [900, 240], [1040, 170], [1240, 170], [1500, 170], [1650, 240], [2300, 240]], gaten: [[1040, 1240]], finish: 2100 },
    ];
    $('speelveld').innerHTML = `<p id="score"></p><canvas class="rit" width="${W}" height="${H}"></canvas>
        <div class="ritknoppen"><button id="rem">⬅ Rem</button><button id="gas">Gas ➡</button></div>
        <p class="levels">${LEVELS.map((_, i) => `<button data-l="${i}">Level ${i + 1}</button>`).join('')}</p>`;
    const ctx = document.querySelector('canvas.rit').getContext('2d');
    const toets = { gas: false, rem: false };
    let lv, nr, x, y, a, vx, vy, w, stand, timer, draai, cam, stof;

    function grond(px) {
        if (lv.gaten.some(g => px > g[0] && px < g[1])) return 2000;
        const p = lv.punten;
        if (px <= p[0][0]) return p[0][1];
        for (let i = 1; i < p.length; i++) {
            if (px <= p[i][0]) {
                const f = (px - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
                return p[i - 1][1] + f * (p[i][1] - p[i - 1][1]);
            }
        }
        return p[p.length - 1][1];
    }
    // Zet een punt op de auto (dx, dy) om naar een plek in de wereld
    const punt = (dx, dy) => ({ x: x + Math.cos(a) * dx - Math.sin(a) * dy, y: y + Math.sin(a) * dx + Math.cos(a) * dy });

    function start(n) {
        nr = n;
        lv = LEVELS[n];
        x = 80; y = grond(80) - 30; a = 0; vx = vy = w = 0; draai = 0; cam = 0; stof = [];
        stand = 'rijden';
        $('score').textContent = `Level ${n + 1}: haal de finish!`;
        clearInterval(timer);
        timer = setInterval(() => {
            if (stand === 'rijden') stap();
            stof.forEach(p => { p.x += p.vx; p.y += p.vy; p.l -= 0.04; });
            stof = stof.filter(p => p.l > 0);
            teken();
        }, 1000 / 60);
    }
    function dood() {
        stand = 'dood';
        $('score').innerHTML = `Gecrasht! <button id="opnieuw">Opnieuw</button>`;
        $('opnieuw').onclick = () => start(nr);
    }
    function gewonnen() {
        stand = 'gewonnen';
        if (nr + 1 < LEVELS.length) {
            $('score').innerHTML = `Gehaald! <button id="volgende">Volgend level</button>`;
            $('volgende').onclick = () => start(nr + 1);
        } else $('score').textContent = 'Alle levels gehaald! Je bent een held 🏆';
    }

    function stap() {
        vy += G;
        const f = punt(L, 8), r = punt(-L, 8);
        const pf = f.y + R - grond(f.x), pr = r.y + R - grond(r.x);
        const cf = pf > 0, cr = pr > 0;
        if (cf && cr) {                                   // beide wielen op de grond
            y -= Math.min((pf + pr) / 2, 14);
            const s = Math.atan2(grond(f.x) - grond(r.x), f.x - r.x);
            a += (s - a) * 0.35;
            w = 0;
            let v = vx * Math.cos(s) + vy * Math.sin(s);
            v += (toets.gas ? 0.25 : 0) - (toets.rem ? 0.22 : 0);
            v *= toets.gas ? 0.98 : 0.99;
            v = Math.max(v, -5);
            vx = v * Math.cos(s);
            vy = v * Math.sin(s);
            draai += v / R;
            if (toets.gas && v > 2 && Math.random() < 0.5) stof.push({ x: r.x, y: r.y + R, vx: -vx * 0.2 - Math.random(), vy: -Math.random() * 1.5, l: 1 });
        } else if (cf || cr) {                            // één wiel: de auto kantelt
            y -= Math.min(cf ? pf : pr, 14);
            if (vy > 2.5) vy = -vy * 0.25; else if (vy > 0) vy *= 0.2;   // een kleine stuiter bij hard landen
            w += cf ? -0.006 : 0.006;
        }
        x += vx; y += vy; a += w; w *= 0.985;
        if (a > Math.PI) a -= 2 * Math.PI;
        if (a < -Math.PI) a += 2 * Math.PI;
        const daken = [punt(10, -22), punt(-10, -22)];
        if (y > 700 || daken.some(p => p.y > grond(p.x) - 2)) return dood();
        if (x > lv.finish) gewonnen();
    }

    function teken() {
        cam += (Math.max(0, x - 200) - cam) * 0.12;
        const lucht = ctx.createLinearGradient(0, 0, 0, H);
        lucht.addColorStop(0, '#6ec1ff');
        lucht.addColorStop(1, '#d8f0ff');
        ctx.fillStyle = lucht;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff6b0';
        ctx.beginPath(); ctx.arc(520, 55, 28, 0, 7); ctx.fill();
        // bergen op de achtergrond, die langzamer meebewegen
        [[0.2, '#a9c9e8', 110, 90], [0.4, '#8fb5d8', 70, 60]].forEach(([snel, kleur, hoog, breed]) => {
            ctx.fillStyle = kleur;
            ctx.beginPath();
            ctx.moveTo(0, H);
            for (let px = 0; px <= W; px += 8) ctx.lineTo(px, 215 - Math.abs(Math.sin((px + cam * snel) / breed)) * hoog);
            ctx.lineTo(W, H);
            ctx.fill();
        });
        // grond met een grasrandje
        const top = [];
        for (let px = 0; px <= W; px += 4) top.push(Math.min(grond(px + cam), H + 10));
        ctx.fillStyle = '#7a5230';
        ctx.beginPath();
        ctx.moveTo(0, H);
        top.forEach((gy, k) => ctx.lineTo(k * 4, gy));
        ctx.lineTo(W, H);
        ctx.fill();
        ctx.strokeStyle = '#5fae3a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        top.forEach((gy, k) => { if (gy >= H) return; (k && top[k - 1] < H) ? ctx.lineTo(k * 4, gy) : ctx.moveTo(k * 4, gy); });
        ctx.stroke();
        // finish met een geblokte vlag
        const fx = lv.finish - cam, fy = grond(lv.finish);
        ctx.fillStyle = '#222';
        ctx.fillRect(fx, fy - 80, 4, 80);
        for (let rij = 0; rij < 3; rij++) for (let kol = 0; kol < 4; kol++) {
            ctx.fillStyle = (rij + kol) % 2 ? '#111' : '#fff';
            ctx.fillRect(fx + 4 + kol * 8, fy - 80 + rij * 8, 8, 8);
        }
        // stof
        stof.forEach(p => {
            ctx.fillStyle = `rgba(230,220,200,${p.l * 0.6})`;
            ctx.beginPath(); ctx.arc(p.x - cam, p.y, 3 + (1 - p.l) * 4, 0, 7); ctx.fill();
        });
        // schaduw onder de auto
        const gy = grond(x);
        if (gy < 1000 && gy - y < 140) {
            ctx.fillStyle = 'rgba(0,0,0,.25)';
            ctx.beginPath(); ctx.ellipse(x - cam, gy, 34, 4, 0, 0, 7); ctx.fill();
        }
        // de auto
        ctx.save();
        ctx.translate(x - cam, y);
        ctx.rotate(a);
        ctx.fillStyle = '#d93636';
        ctx.beginPath(); ctx.roundRect(-32, -14, 64, 20, 6); ctx.fill();
        ctx.fillStyle = '#b52a2a';
        ctx.beginPath(); ctx.roundRect(-12, -26, 30, 14, 5); ctx.fill();
        ctx.fillStyle = '#bfe6ff';
        ctx.fillRect(-8, -23, 12, 8);
        ctx.fillRect(7, -23, 8, 8);
        ctx.fillStyle = '#fff3a0';
        ctx.fillRect(28, -9, 4, 5);
        [-L, L].forEach(wx => {
            ctx.save();
            ctx.translate(wx, 8);
            ctx.rotate(draai);
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
            ctx.strokeStyle = '#9aa0a6';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-R + 2, 0); ctx.lineTo(R - 2, 0); ctx.moveTo(0, -R + 2); ctx.lineTo(0, R - 2); ctx.stroke();
            ctx.restore();
        });
        ctx.restore();
        // voortgangsbalk bovenin
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(20, 12, W - 40, 6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(20, 12, (W - 40) * Math.min(1, x / lv.finish), 6);
    }

    const sleutel = (e, aan) => {
        const k = e.key.toLowerCase();
        if (k === 'arrowright' || k === 'd') { toets.gas = aan; e.preventDefault(); }
        if (k === 'arrowleft' || k === 'a') { toets.rem = aan; e.preventDefault(); }
    };
    const omlaag = e => sleutel(e, true), omhoog = e => sleutel(e, false);
    document.addEventListener('keydown', omlaag);
    document.addEventListener('keyup', omhoog);
    ['gas', 'rem'].forEach(n => {
        const b = $(n);
        b.onpointerdown = () => { toets[n] = true; };
        b.onpointerup = b.onpointerleave = b.onpointercancel = () => { toets[n] = false; };
    });
    document.querySelectorAll('[data-l]').forEach(b => b.onclick = () => start(Number(b.dataset.l)));
    cleanup.push(() => { clearInterval(timer); document.removeEventListener('keydown', omlaag); document.removeEventListener('keyup', omhoog); });
    start(0);
}

// ---------- Start ----------
window.addEventListener('hashchange', route);
(async () => { await laadMij(); await route(); })();