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
        k('', 'Home') + k('chat', 'Chat') + k('photos', "Foto's") +
        (me ? k('profile', avatar(me, 22) + ' Profiel') : k('login', 'Inloggen')) + `</div>`;
}

async function route() {
    cleanup.forEach(f => f());
    cleanup = [];
    const [naam, arg] = location.hash.replace(/^#\/?/, '').split('/');
    if (['chat', 'profile', 'bot'].includes(naam) && !me) { location.hash = '#/login'; return; }
    renderMenu();
    const paginas = { login, register, photos, profile, chat, bot };
    await (paginas[naam] || home)(decodeURIComponent(arg || ''));
}

// ---------- Pagina's ----------
function home() {
    app.innerHTML = `<section class="hero"><h1>${me ? 'Hallo ' + esc(me.username) + '!' : 'Welkom bij Mieters'}</h1>
        <p>Deel foto's en chat met je vrienden.</p>
        <div class="hero-knoppen">${me
            ? '<a class="knop" href="#/chat">Naar je chats</a><a class="knop licht" href="#/photos">Bekijk foto\'s</a>'
            : '<a class="knop" href="#/register">Account maken</a><a class="knop licht" href="#/login">Inloggen</a>'}</div></section>
        <section class="kaarten">
        <a class="kaart" href="#/chat"><span>💬</span><h3>Chat</h3><p>Stuur berichten, live en met leesbevestiging.</p></a>
        <a class="kaart" href="#/photos"><span>📷</span><h3>Foto's</h3><p>Deel foto's met een beschrijving en @vermeldingen.</p></a>
        <a class="kaart" href="#/profile"><span>👤</span><h3>Profiel</h3><p>Beheer je profielfoto en je eigen foto's.</p></a></section>`;
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

async function chat(met) {
    app.innerHTML = `<div class="whatsapp"><div class="contacten"><div class="contacten-header"><h3>Chats</h3></div>
        <div id="lijst"></div></div><div class="chatvenster" id="venster"></div></div>`;
    const { data: users } = await sb.from('profiles').select('id,username,avatar').neq('id', me.id).order('username');
    const andere = (users || []).find(u => u.username === met);
    document.querySelector('.whatsapp').classList.toggle('open', !!andere);

    async function laadLijst() {
        const { data } = await sb.from('messages').select('sender,recipient,body,created_at,hidden_by_sender,hidden_by_recipient').order('created_at', { ascending: false }).limit(500);
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
                <span>${esc(laatste[u.id] ? laatste[u.id].body : 'Nog geen berichten')}</span></div></a>`).join('');
    }

    async function laadBerichten() {
        if (!andere) return;
        const { data } = await sb.from('messages').select('*')
            .or(`and(sender.eq.${me.id},recipient.eq.${andere.id}),and(sender.eq.${andere.id},recipient.eq.${me.id})`).order('created_at');
        const zichtbaar = (data || []).filter(m => !(m.sender === me.id ? m.hidden_by_sender : m.hidden_by_recipient));
        $('chat').innerHTML = zichtbaar.map(m => {
            const eigen = m.sender === me.id;
            const tijd = new Date(m.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            return `<div class="bericht-rij ${eigen ? 'eigen' : ''}">${avatar(eigen ? me : andere)}
                <div class="bericht">${esc(m.body)}<div class="bericht-voet"><span>${tijd}</span>
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
            <form id="bf"><input name="b" placeholder="Typ een bericht..." autocomplete="off" maxlength="2000" required><button>Versturen</button></form>`;
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

// ---------- Start ----------
window.addEventListener('hashchange', route);
(async () => { await laadMij(); await route(); })();
