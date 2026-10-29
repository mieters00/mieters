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

// Totaal aantal ongelezen berichten, voor het bolletje bij Chat in het menu en de titel van het tabblad
let ongelezenTotaal = 0, meldingenKanaal = null;
async function laadMeldingen() {
    if (!me) return;
    const [{ count }, { data: gmsg }, { data: lezen }] = await Promise.all([
        sb.from('messages').select('id', { count: 'exact', head: true }).eq('recipient', me.id).eq('read', false).eq('hidden_by_recipient', false),
        sb.from('group_messages').select('group_id,created_at').neq('sender', me.id).order('created_at', { ascending: false }).limit(500),
        sb.from('group_reads').select('group_id,last_read'),
    ]);
    const gelezen = Object.fromEntries((lezen || []).map(r => [r.group_id, r.last_read]));
    const inGroepen = (gmsg || []).filter(m => !gelezen[m.group_id] || m.created_at > gelezen[m.group_id]).length;
    ongelezenTotaal = (count || 0) + inGroepen;
    document.title = (ongelezenTotaal ? `(${ongelezenTotaal}) ` : '') + 'Mieters';
    renderMenu();
}
function startMeldingen() {
    if (meldingenKanaal) return;
    meldingenKanaal = sb.channel('meldingen')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, laadMeldingen)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_messages' }, laadMeldingen)
        .subscribe();
}
function stopMeldingen() {
    if (meldingenKanaal) { sb.removeChannel(meldingenKanaal); meldingenKanaal = null; }
    ongelezenTotaal = 0;
    document.title = 'Mieters';
}

// ---------- Menu en router ----------
function renderMenu() {
    const nu = location.hash.replace(/^#\/?/, '').split('/')[0];
    const k = (h, t) => `<a href="#/${h}" class="${nu === h ? 'actief' : ''}">${t}</a>`;
    $('menu').innerHTML = `<a href="#/"><img class="logo" src="image/mieters.png" alt="mieters"></a><div class="links">` +
        k('', 'Home') + k('chat', 'Chat' + (ongelezenTotaal ? `<span class="badge" title="Ongelezen berichten">${ongelezenTotaal > 99 ? '99+' : ongelezenTotaal}</span>` : '')) + k('photos', "Foto's") + k('games', 'Spellen') +
        (me ? k('profile', avatar(me, 22) + ' Profiel') : k('login', 'Inloggen')) + `</div>`;
}

async function route() {
    cleanup.forEach(f => f());
    cleanup = [];
    const [naam, arg] = location.hash.replace(/^#\/?/, '').split('/');
    if (['chat', 'profile', 'bot'].includes(naam) && !me) { location.hash = '#/login'; return; }
    renderMenu();
    if (me) { startMeldingen(); laadMeldingen(); } else stopMeldingen();
    const paginas = { login, register, photos, profile, chat, bot, games };
    await (paginas[naam] || home)(decodeURIComponent(arg || ''));
}

// ---------- Pagina's ----------
async function home() {
    app.innerHTML = `<h1 class="kop">${me ? 'Hé ' + esc(me.username) : 'Mieters'}</h1>
        <p class="intro">${me
            ? 'Dit zijn de nieuwste foto\'s.'
            : 'Foto\'s en berichten voor ons. <a href="#/login">Inloggen</a> of <a href="#/register">account maken</a>.'}</p>
        <section class="quote" id="quote"></section>
        <div id="nieuw" class="fotos"></div>
        <p class="meer"><a href="#/photos">Alle foto's →</a></p>`;
    laadQuote();
    const { data } = await sb.from('photos').select('path,description,profiles(username,avatar)').order('created_at', { ascending: false }).limit(8);
    if (!$('nieuw')) return;
    $('nieuw').innerHTML = (data || []).map(r => `
        <div class="foto-item"><img src="${esc(pub('photos', r.path))}">
        <div class="rij">${avatar(r.profiles)}<p>${esc(r.profiles && r.profiles.username)}</p></div>
        ${r.description ? `<p class="beschr">${esc(r.description)}</p>` : ''}</div>`).join('') || '<p class="leeg">Nog geen foto\'s.</p>';
    $('nieuw').onclick = e => { if (e.target.tagName === 'IMG' && !e.target.classList.contains('av')) location.hash = '#/photos'; };
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
        const naam = f.u.value.trim();
        const { data: adres } = await sb.rpc('login_email', { naam });
        const { error } = await sb.auth.signInWithPassword({ email: adres || email(naam), password: f.p.value });
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
    app.innerHTML = `<div class="blok"><h2>${esc(me.username)}</h2>
        <form id="nf"><input name="naam" value="${esc(me.username)}" pattern="[A-Za-z0-9_]{3,20}" title="3 tot 20 letters, cijfers of _" required> <button>Naam wijzigen</button> <span class="fout" id="fout2"></span></form>
        ${avatar(me, 150)}<br><br>
        <form id="pf"><input type="file" name="file" accept="image/*" required><br><br>
        <button>Profielfoto uploaden</button> <span class="fout" id="fout"></span></form>
        <button id="uit">Uitloggen</button></div>
        <h3>Mijn foto's</h3>
        <div class="fotos">${(fotos || []).map(r => `
            <div class="foto-item klein"><img src="${esc(pub('photos', r.path))}">
            <button class="x" data-id="${r.id}" data-pad="${esc(r.path)}">×</button>
            ${r.description ? `<p class="beschr">${esc(r.description)}</p>` : ''}</div>`).join('')}</div>
        <p class="gevaar"><a href="#" id="del">Account verwijderen</a></p>`;

    $('nf').onsubmit = async e => {
        e.preventDefault();
        const naam = e.target.naam.value.trim();
        if (naam === me.username) return;
        const { error } = await sb.from('profiles').update({ username: naam }).eq('id', me.id);
        if (error) { $('fout2').textContent = error.code === '23505' ? 'Deze naam is al bezet.' : 'Kies 3 tot 20 letters, cijfers of _.'; return; }
        me.username = naam;
        profile();
    };
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

async function chat(arg) {
    const gm = /^groep-(\d+)(-info)?$/.exec(arg);        // #/chat/groep-12 of #/chat/groep-12-info
    const groepId = gm ? Number(gm[1]) : null;
    const info = !!(gm && gm[2]);
    const nieuweGroep = arg === 'nieuwe-groep';
    app.innerHTML = `<div class="whatsapp"><div class="contacten">
        <div class="contacten-header"><h3>Chats</h3><a href="#/chat/nieuwe-groep" class="groep-knop">+ Groep</a></div>
        <div class="zoek"><input id="zoek" type="search" placeholder="Zoek mensen of groepen..." autocomplete="off"></div>
        <div id="lijst"></div></div><div class="chatvenster" id="venster"></div></div>`;

    const [{ data: gebruikers }, { data: gr }] = await Promise.all([
        sb.from('profiles').select('id,username,avatar').neq('id', me.id).order('username'),
        sb.from('groups').select('id,name,created_by,avatar').order('name'),
    ]);
    const users = gebruikers || [];
    let groepen = gr || [];
    const andere = (!gm && !nieuweGroep) ? users.find(u => u.username === arg) : null;
    const groep = gm ? groepen.find(g => g.id === groepId) : null;
    document.querySelector('.whatsapp').classList.toggle('open', !!(andere || groep || nieuweGroep || gm));
    const groepAv = (g, size) => g.avatar
        ? `<img class="av" style="width:${size}px;height:${size}px" src="${esc(pub('avatars', g.avatar))}">`
        : `<div class="av av-leeg" style="width:${size}px;height:${size}px">${esc((g.name || '?')[0].toUpperCase())}</div>`;
    const fmt = d => new Date(d).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    // ----- Lijst links, met zoekbalk -----
    let zoekterm = '', laatsteP = {}, laatsteG = {}, ongelezenP = {}, ongelezenG = {};
    function tekenLijst() {
        const q = zoekterm.trim().toLowerCase();
        const tijd = m => (m && m.created_at) || '';
        const items = [
            ...groepen.map(g => ({ soort: 'groep', id: g.id, naam: g.name, laatste: laatsteG[g.id], ongelezen: ongelezenG[g.id] || 0, g })),
            ...users.map(u => ({ soort: 'prive', id: u.id, naam: u.username, laatste: laatsteP[u.id], ongelezen: ongelezenP[u.id] || 0, u })),
        ].filter(i => !q || i.naam.toLowerCase().includes(q))
         .sort((a, b) => tijd(b.laatste).localeCompare(tijd(a.laatste)) || a.naam.localeCompare(b.naam));
        $('lijst').innerHTML = items.map(i => {
            const href = i.soort === 'groep' ? `#/chat/groep-${i.id}` : `#/chat/${encodeURIComponent(i.naam)}`;
            const actief = i.soort === 'groep' ? groepId === i.id : (!gm && arg === i.naam);
            const tekst = i.laatste ? (i.laatste.image ? 'Foto' : i.laatste.body) : 'Nog geen berichten';
            const pic = i.soort === 'groep' ? groepAv(i.g, 45) : avatar(i.u, 45);
            const nieuw = actief ? 0 : i.ongelezen;     // in de chat die je nu leest hoort geen teken te staan
            return `<a class="contact ${actief ? 'actief' : ''} ${nieuw ? 'ongelezen' : ''}" href="${href}">${pic}
                <div class="contact-info"><strong>${esc(i.naam)}</strong><span>${esc(tekst)}</span></div>
                ${nieuw ? `<span class="badge" title="Ongelezen berichten">${nieuw > 99 ? '99+' : nieuw}</span>` : ''}</a>`;
        }).join('') || '<p class="leeg">Niemand gevonden.</p>';
    }
    async function laadLijst() {
        const [{ data: pm }, { data: gmsg }, { data: lezen }] = await Promise.all([
            sb.from('messages').select('sender,recipient,body,image,read,created_at,hidden_by_sender,hidden_by_recipient').order('created_at', { ascending: false }).limit(500),
            sb.from('group_messages').select('group_id,sender,body,image,created_at').order('created_at', { ascending: false }).limit(500),
            sb.from('group_reads').select('group_id,last_read'),
        ]);
        laatsteP = {}; laatsteG = {}; ongelezenP = {}; ongelezenG = {};
        (pm || []).forEach(m => {
            const eigen = m.sender === me.id;
            if (eigen ? m.hidden_by_sender : m.hidden_by_recipient) return;
            const ander = eigen ? m.recipient : m.sender;
            if (!laatsteP[ander]) laatsteP[ander] = m;
            if (!eigen && !m.read) ongelezenP[ander] = (ongelezenP[ander] || 0) + 1;
        });
        const gelezen = Object.fromEntries((lezen || []).map(r => [r.group_id, r.last_read]));
        (gmsg || []).forEach(m => {
            if (!laatsteG[m.group_id]) laatsteG[m.group_id] = m;
            if (m.sender !== me.id && (!gelezen[m.group_id] || m.created_at > gelezen[m.group_id]))
                ongelezenG[m.group_id] = (ongelezenG[m.group_id] || 0) + 1;
        });
        tekenLijst();
    }
    async function herlaadGroepen() {
        const { data } = await sb.from('groups').select('id,name,created_by,avatar').order('name');
        groepen = data || [];
        tekenLijst();
    }
    $('zoek').oninput = e => { zoekterm = e.target.value; tekenLijst(); };

    // ----- Privéchat (zoals eerst) -----
    async function laadBerichten() {
        if (!andere) return;
        const { data } = await sb.from('messages').select('*')
            .or(`and(sender.eq.${me.id},recipient.eq.${andere.id}),and(sender.eq.${andere.id},recipient.eq.${me.id})`).order('created_at');
        const zichtbaar = (data || []).filter(m => !(m.sender === me.id ? m.hidden_by_sender : m.hidden_by_recipient));
        const cache = await chatUrls(zichtbaar.filter(m => m.image).map(m => m.image));
        const fotoUrl = p => (cache[p] && cache[p].url) || '';
        $('chat').innerHTML = zichtbaar.map(m => {
            const eigen = m.sender === me.id;
            return `<div class="bericht-rij ${eigen ? 'eigen' : ''}">${avatar(eigen ? me : andere)}
                <div class="bericht">${m.image ? `<a href="${esc(fotoUrl(m.image))}" target="_blank" rel="noopener"><img class="chat-foto" src="${esc(fotoUrl(m.image))}"></a>` : ''}${esc(m.body)}<div class="bericht-voet"><span>${fmt(m.created_at)}</span>
                ${eigen ? `<button class="msg-del" data-id="${m.id}" data-img="${esc(m.image || '')}" title="Bericht verwijderen">verwijder</button><span class="vinkje ${m.read ? 'gelezen' : ''}">✓✓</span>` : ''}</div></div></div>`;
        }).join('');
        $('chat').scrollTop = $('chat').scrollHeight;
        $('chat').onclick = async e => {
            const b = e.target.closest('.msg-del');
            if (!b || !confirm('Wil je dit bericht verwijderen?')) return;
            await sb.from('messages').delete().eq('id', b.dataset.id).eq('sender', me.id);
            if (b.dataset.img) await sb.storage.from('chat').remove([b.dataset.img]);
            laadBerichten();
            laadLijst();
        };
        if (zichtbaar.some(m => m.recipient === me.id && !m.read))
            await sb.from('messages').update({ read: true }).eq('recipient', me.id).eq('sender', andere.id).eq('read', false);
    }

    // ----- Groepschat -----
    async function laadGroepBerichten() {
        if (!groep || info || !$('chat')) return;
        const { data } = await sb.from('group_messages').select('id,sender,body,image,created_at,profiles(username,avatar)').eq('group_id', groepId).order('created_at');
        const cache = await chatUrls((data || []).filter(m => m.image).map(m => m.image));
        const fotoUrl = p => (cache[p] && cache[p].url) || '';
        $('chat').innerHTML = (data || []).map(m => {
            const eigen = m.sender === me.id;
            return `<div class="bericht-rij ${eigen ? 'eigen' : ''}">${avatar(eigen ? me : m.profiles)}
                <div class="bericht">${eigen ? '' : `<strong class="afzender">${esc(m.profiles && m.profiles.username)}</strong>`}${m.image ? `<a href="${esc(fotoUrl(m.image))}" target="_blank" rel="noopener"><img class="chat-foto" src="${esc(fotoUrl(m.image))}"></a>` : ''}${esc(m.body)}
                <div class="bericht-voet"><span>${fmt(m.created_at)}</span>${eigen ? `<button class="msg-del" data-id="${m.id}" data-img="${esc(m.image || '')}" title="Bericht verwijderen">verwijder</button>` : ''}</div></div></div>`;
        }).join('');
        $('chat').scrollTop = $('chat').scrollHeight;
        $('chat').onclick = async e => {
            const b = e.target.closest('.msg-del');
            if (!b || !confirm('Wil je dit bericht verwijderen?')) return;
            await sb.from('group_messages').delete().eq('id', b.dataset.id).eq('sender', me.id);
            if (b.dataset.img) await sb.storage.from('chat').remove([b.dataset.img]);
            laadGroepBerichten();
            laadLijst();
        };
        sb.rpc('mark_group_read', { gid: groepId }).then(laadMeldingen);
    }
    function toonGroep() {
        $('venster').innerHTML = `<div class="chat-header"><a class="terug" href="#/chat">←</a>
            <a class="kop-link" href="#/chat/groep-${groepId}-info">${groepAv(groep, 40)}<span><strong>${esc(groep.name)}</strong><small>Tik voor groepsinfo</small></span></a></div>
            <div id="chat"></div>
            <form id="bf"><label class="bijlage" title="Foto of GIF sturen">+<input type="file" id="gbijlage" accept="image/*" hidden></label><input name="b" placeholder="Typ een bericht..." autocomplete="off" maxlength="2000"><button>Versturen</button></form>`;
        $('bf').onsubmit = async e => {
            e.preventDefault();
            const tekst = e.target.b.value.trim();
            if (!tekst) return;
            e.target.b.value = '';
            const { error } = await sb.from('group_messages').insert({ group_id: groepId, sender: me.id, body: tekst });
            if (error) toast(error.message);
            laadGroepBerichten();
            laadLijst();
        };
        $('gbijlage').onchange = async e => {
            const f = e.target.files[0];
            e.target.value = '';
            if (!f) return;
            try {
                const pad = await upload('chat', f, me.id);
                const { error } = await sb.from('group_messages').insert({ group_id: groepId, sender: me.id, body: '', image: pad });
                if (error) throw error;
                laadGroepBerichten();
                laadLijst();
            } catch (err) { toast(err.message); }
        };
        laadGroepBerichten();
    }
    async function toonInfo() {
        const eigenaar = groep.created_by === me.id;
        const { data: leden } = await sb.from('group_members').select('user_id,profiles(username,avatar)').eq('group_id', groepId);
        const lidIds = new Set((leden || []).map(l => l.user_id));
        const nietLeden = users.filter(u => !lidIds.has(u.id));
        $('venster').innerHTML = `<div class="chat-header"><a class="terug" href="#/chat/groep-${groepId}">←</a><strong style="flex:1">Groepsinfo</strong>
            <a class="header-knop" href="#/chat/groep-${groepId}">Terug naar chat</a></div>
            <div class="beheer">
                <div class="groep-kop">${groepAv(groep, 90)}<h2>${esc(groep.name)}</h2><p class="intro">${(leden || []).length} leden</p>
                    <form id="hf"><input type="file" name="file" accept="image/*" required> <button>Groepsfoto wijzigen</button> <span class="fout" id="foutf"></span></form></div>
                ${eigenaar ? `<form id="hn"><label>Groepsnaam</label><br><input name="naam" value="${esc(groep.name)}" maxlength="40" required> <button>Opslaan</button></form>` : ''}
                <h3>Leden</h3>
                ${(leden || []).map(l => `<div class="lid-rij">${avatar(l.profiles, 28)}
                    <span>${esc(l.profiles && l.profiles.username)}${l.user_id === me.id ? ' (jij)' : ''}${l.user_id === groep.created_by ? ' · maker' : ''}</span>
                    ${eigenaar && l.user_id !== me.id ? `<button class="klein-knop" data-uid="${esc(l.user_id)}">Verwijderen</button>` : ''}</div>`).join('')}
                ${nietLeden.length ? `<h3>Lid toevoegen</h3><form id="hl"><select name="uid">${nietLeden.map(u => `<option value="${esc(u.id)}">${esc(u.username)}</option>`).join('')}</select> <button>Toevoegen</button></form>` : ''}
                <p class="gevaar"><a href="#" id="uit-groep">${eigenaar ? 'Groep verwijderen' : 'Groep verlaten'}</a></p>
            </div>`;
        $('hf').onsubmit = async e => {
            e.preventDefault();
            try {
                const pad = await upload('avatars', e.target.file.files[0], me.id);
                const { error } = await sb.from('groups').update({ avatar: pad }).eq('id', groepId);
                if (error) throw error;
                groep.avatar = pad;
                herlaadGroepen();
                toonInfo();
            } catch (err) { $('foutf').textContent = err.message; }
        };
        if ($('hn')) $('hn').onsubmit = async e => {
            e.preventDefault();
            const naam = e.target.naam.value.trim();
            if (naam) {
                const { error } = await sb.from('groups').update({ name: naam }).eq('id', groepId);
                if (error) { toast(error.message); return; }
                groep.name = naam;
            }
            herlaadGroepen();
            toonInfo();
        };
        document.querySelectorAll('.klein-knop').forEach(b => b.onclick = async () => {
            await sb.from('group_members').delete().eq('group_id', groepId).eq('user_id', b.dataset.uid);
            toonInfo();
        });
        if ($('hl')) $('hl').onsubmit = async e => {
            e.preventDefault();
            const { error } = await sb.from('group_members').insert({ group_id: groepId, user_id: e.target.uid.value });
            if (error) toast(error.message);
            toonInfo();
        };
        $('uit-groep').onclick = async e => {
            e.preventDefault();
            if (eigenaar) {
                if (!confirm('Dit verwijdert de groep en alle berichten voor iedereen. Weet je het zeker?')) return;
                await sb.from('groups').delete().eq('id', groepId);
            } else {
                if (!confirm('Wil je deze groep verlaten?')) return;
                await sb.from('group_members').delete().eq('group_id', groepId).eq('user_id', me.id);
            }
            location.hash = '#/chat';
        };
    }
    function toonNieuweGroep() {
        $('venster').innerHTML = `<div class="chat-header"><a class="terug" href="#/chat">←</a><strong>Nieuwe groep</strong></div>
            <form id="gf" class="beheer"><label>Groepsnaam</label><br><input name="naam" maxlength="40" required><br><br>
            <label>Groepsfoto (optioneel)</label><br><input type="file" name="file" accept="image/*"><br><br>
            <label>Leden</label><div class="ledenlijst">${users.map(u => `<label class="lid"><input type="checkbox" value="${esc(u.id)}"> ${avatar(u, 24)} ${esc(u.username)}</label>`).join('')}</div>
            <button>Groep aanmaken</button> <span class="fout" id="fout"></span></form>`;
        $('gf').onsubmit = async e => {
            e.preventDefault();
            const naam = e.target.naam.value.trim();
            const ids = [...e.target.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
            if (!naam || ids.length === 0) { $('fout').textContent = 'Geef een naam en kies minstens één lid.'; return; }
            let foto = null;
            const bestand = e.target.file.files[0];
            if (bestand) {
                try { checkFile(bestand); foto = await upload('avatars', bestand, me.id); }
                catch (err) { $('fout').textContent = err.message; return; }
            }
            const { data: g, error } = await sb.from('groups').insert({ name: naam, created_by: me.id, avatar: foto }).select().single();
            if (error) { $('fout').textContent = error.message; return; }
            const { error: e2 } = await sb.from('group_members').insert([me.id, ...ids].map(uid => ({ group_id: g.id, user_id: uid })));
            if (e2) { $('fout').textContent = e2.message; return; }
            location.hash = '#/chat/groep-' + g.id;
        };
    }
    function toonPrive() {
        $('venster').innerHTML = `<div class="chat-header"><a class="terug" href="#/chat">←</a>${avatar(andere, 40)}<strong style="flex:1">${esc(andere.username)}</strong></div><div id="chat"></div>
            <form id="bf"><label class="bijlage" title="Foto of GIF sturen">+<input type="file" id="bijlage" accept="image/*" hidden></label><input name="b" placeholder="Typ een bericht..." autocomplete="off" maxlength="2000"><button>Versturen</button></form>`;
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
        laadBerichten();
    }

    // ----- Welk scherm rechts? -----
    if (nieuweGroep) toonNieuweGroep();
    else if (gm && !groep) $('venster').innerHTML = `<div class="chat-header"><a class="terug" href="#/chat">←</a><strong>Groep</strong></div><div class="chat-leeg">Deze groep bestaat niet (meer).</div>`;
    else if (groep && info) toonInfo();
    else if (groep) toonGroep();
    else if (andere) toonPrive();
    else $('venster').innerHTML = `<div class="chat-leeg">Kies een chat om te beginnen</div>`;

    const kanaal = sb.channel('chats')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => { laadLijst(); laadBerichten(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_messages' }, () => { laadLijst(); laadGroepBerichten(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, herlaadGroepen)
        .subscribe();
    cleanup.push(() => sb.removeChannel(kanaal));
    laadLijst();
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
    snake:  { naam: 'Snake' },
    wordle: { naam: 'Woordspel', geenScores: true },
};

function games(spel) {
    if (!SPELLEN[spel]) spel = 'snake';
    app.innerHTML = `<h2>Spellen</h2>
        <div class="spel-tabs">${Object.entries(SPELLEN).map(([k, s]) => `<a href="#/games/${k}" class="${k === spel ? 'actief' : ''}">${s.naam}</a>`).join('')}</div>
        <div class="spel-wrap"><div id="speelveld"></div><div id="scores"></div></div>`;
    ({ snake, wordle })[spel]();
    laadScores(spel);
}

// Bewaart je score alleen als het je beste is
async function bewaarScore(spel, score) {
    if (!me) return;
    const { data: oud } = await sb.from('highscores').select('score').eq('game', spel).eq('user_id', me.id).maybeSingle();
    if (!oud || score > oud.score) await sb.from('highscores').upsert({ game: spel, user_id: me.id, score });
    laadScores(spel);
}

async function laadScores(spel) {
    const el = $('scores');
    if (!el) return;
    if (SPELLEN[spel].geenScores) { el.innerHTML = ''; return; }
    const { data } = await sb.from('highscores').select('score,profiles(username,avatar)')
        .eq('game', spel).order('score', { ascending: false }).limit(10);
    el.innerHTML = `<h3>Top 10</h3>` + ((data || []).map((r, i) => `
        <div class="score-rij"><span>${i + 1}.</span>${avatar(r.profiles, 22)}
        <strong>${esc(r.profiles && r.profiles.username)}</strong><span class="punten">${r.score}</span></div>`).join('')
        || '<p class="leeg">Nog geen scores.</p>') + (me ? '' : '<p class="intro">Log in om je score te bewaren.</p>');
}

function snake() {
    const COLS = 17, ROWS = 15, S = 30, TICK = 130, DPR = 2;
    $('speelveld').innerHTML = `<div class="snake-wrap">
        <div class="snake-balk"><span class="appel-icoon"></span><b id="sn-score">0</b><span class="beker">Beste</span><b id="sn-best">0</b></div>
        <canvas class="snake" width="${COLS * S * DPR}" height="${ROWS * S * DPR}"></canvas></div>
        <div class="pijlen"><button data-d="0,-1">↑</button><button data-d="-1,0">←</button><button data-d="0,1">↓</button><button data-d="1,0">→</button></div>
        <p class="intro">Pijltjestoetsen of WASD. Op je telefoon veeg je over het veld.</p>`;
    const cv = document.querySelector('canvas.snake'), ctx = cv.getContext('2d');
    ctx.scale(DPR, DPR);
    let slang, vorige, richting, wachtrij, appel, score, best = 0, stand, acc = 0, laatste = performance.now(), raf, pop = 0;

    function zetAppel() {
        do { appel = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; }
        while (slang.some(s => s.x === appel.x && s.y === appel.y));
    }
    function nieuw() {
        slang = [{ x: 4, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 7 }];
        vorige = slang.map(s => ({ ...s }));
        richting = { x: 1, y: 0 };
        wachtrij = [];
        score = 0;
        stand = 'wacht';
        acc = 0;
        $('sn-score').textContent = '0';
        zetAppel();
    }
    async function dood() {
        stand = 'dood';
        if (score > best) { best = score; $('sn-best').textContent = best; }
        await bewaarScore('snake', score);
    }
    function stap() {
        if (wachtrij.length) {
            const r = wachtrij.shift();
            if (!(r.x === -richting.x && r.y === -richting.y)) richting = r;
        }
        const kop = { x: slang[0].x + richting.x, y: slang[0].y + richting.y };
        const eet = kop.x === appel.x && kop.y === appel.y;
        const lichaam = eet ? slang : slang.slice(0, -1);        // de staart schuift weg, tenzij we groeien
        if (kop.x < 0 || kop.y < 0 || kop.x >= COLS || kop.y >= ROWS || lichaam.some(s => s.x === kop.x && s.y === kop.y)) return dood();
        vorige = slang.map(s => ({ ...s }));
        slang.unshift(kop);
        if (eet) { score++; pop = 1; $('sn-score').textContent = score; zetAppel(); }
        else slang.pop();
    }
    function richt(dx, dy) {
        if (stand === 'dood') return;
        if (stand === 'wacht') { stand = 'speel'; acc = 0; }
        const l = wachtrij.length ? wachtrij[wachtrij.length - 1] : richting;
        if ((dx === l.x && dy === l.y) || (dx === -l.x && dy === -l.y)) return;
        if (wachtrij.length < 2) wachtrij.push({ x: dx, y: dy });
    }

    function tekst(regels) {
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(0, 0, COLS * S, ROWS * S);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        regels.forEach(([t, grootte, y]) => { ctx.font = `800 ${grootte}px "Nunito Sans", sans-serif`; ctx.fillText(t, COLS * S / 2, y); });
    }
    function teken(t) {
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            ctx.fillStyle = (r + c) % 2 ? '#a2d149' : '#aad751';
            ctx.fillRect(c * S, r * S, S, S);
        }
        // appel
        const ax = (appel.x + .5) * S, ay = (appel.y + .5) * S, ra = S * 0.38 * (1 + Math.sin(performance.now() / 300) * 0.04);
        ctx.fillStyle = '#e7471d';
        ctx.beginPath(); ctx.arc(ax, ay + 1, ra, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.beginPath(); ctx.arc(ax - ra * .35, ay - ra * .25, ra * .25, 0, 7); ctx.fill();
        ctx.fillStyle = '#3f8a2a';
        ctx.beginPath(); ctx.ellipse(ax + 3, ay - ra - 1, 5, 2.5, -0.5, 0, 7); ctx.fill();
        // slang: de lichaamsdelen glijden vloeiend naar hun volgende plek
        const pts = slang.map((s, i) => {
            const v = vorige[i] || vorige[vorige.length - 1];
            return { x: (v.x + (s.x - v.x) * t + .5) * S, y: (v.y + (s.y - v.y) * t + .5) * S };
        });
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.strokeStyle = '#4a7cf5';
        ctx.lineWidth = S * 0.74;
        ctx.beginPath();
        pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.stroke();
        const h = pts[0], rk = S * 0.42 * (1 + pop * 0.18), dx = richting.x, dy = richting.y;
        ctx.fillStyle = '#4a7cf5';
        ctx.beginPath(); ctx.arc(h.x, h.y, rk, 0, 7); ctx.fill();
        [-1, 1].forEach(z => {
            const ex = h.x + dx * S * 0.12 - dy * z * S * 0.17, ey = h.y + dy * S * 0.12 + dx * z * S * 0.17;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(ex, ey, S * 0.13, 0, 7); ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.arc(ex + dx * S * 0.05, ey + dy * S * 0.05, S * 0.065, 0, 7); ctx.fill();
        });
        pop = Math.max(0, pop - 0.06);
        if (stand === 'wacht') tekst([['Druk op een pijltje om te starten', 20, ROWS * S / 2 + 6]]);
        if (stand === 'dood') tekst([['Game over', 34, ROWS * S / 2 - 14], [`Score: ${score}`, 20, ROWS * S / 2 + 16], ['Spatie of tik om opnieuw te spelen', 15, ROWS * S / 2 + 44]]);
    }
    function lus(nu) {
        const dt = Math.min(nu - laatste, 100);
        laatste = nu;
        if (stand === 'speel') {
            acc += dt;
            while (acc >= TICK && stand === 'speel') { acc -= TICK; stap(); }
        }
        teken(stand === 'speel' ? acc / TICK : 1);
        raf = requestAnimationFrame(lus);
    }

    const RICHTINGEN = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
    const toets = e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (RICHTINGEN[k]) { e.preventDefault(); richt(...RICHTINGEN[k]); }
        else if ((k === ' ' || k === 'enter') && stand === 'dood') { e.preventDefault(); nieuw(); }
    };
    let begin = null;
    cv.addEventListener('touchstart', e => { begin = e.touches[0]; }, { passive: true });
    cv.addEventListener('touchend', e => {
        if (!begin) return;
        const eind = e.changedTouches[0], dx = eind.clientX - begin.clientX, dy = eind.clientY - begin.clientY;
        begin = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { if (stand === 'dood') nieuw(); return; }
        if (Math.abs(dx) > Math.abs(dy)) richt(dx > 0 ? 1 : -1, 0); else richt(0, dy > 0 ? 1 : -1);
    });
    cv.onclick = () => { if (stand === 'dood') nieuw(); };
    document.addEventListener('keydown', toets);
    document.querySelectorAll('.pijlen button').forEach(b => b.onclick = () => richt(...b.dataset.d.split(',').map(Number)));
    cleanup.push(() => { cancelAnimationFrame(raf); document.removeEventListener('keydown', toets); });

    if (me) sb.from('highscores').select('score').eq('game', 'snake').eq('user_id', me.id).maybeSingle()
        .then(({ data }) => { if (data && $('sn-best')) { best = data.score; $('sn-best').textContent = best; } });
    nieuw();
    raf = requestAnimationFrame(lus);
}

// Woordspel: raad een woord van 5 letters in 6 pogingen. Daarna kun je meteen een nieuw woord spelen, zo vaak je wilt.
const WOORDEN = 'aarde actie adres alarm album alles ander angst appel arend armen asiel baard balen banen basis beeld beest beide beker beleg bende beter beurt bezem bezig bloem bloed blond boden boete bonen boten braaf brand breed brief brood bruin buien buurt chaos clown daken dagen dames datum deken delen diner dieet dwaas draad droom drank druif dwerg eerst eigen eiken emmer enkel fiets flink fluit fruit gaten gebak geluk gerst gezin glans graag graan grens grond groen groot grote haast haken halen halve hamer harde hazen heide helft hemel hoofd hoeve hoger hotel huilt huren idiot jacht jager jaren jonge juist kaart kaars kamer kapot katje keten keuze kerel kerst kleur klein kleed klomp knoop koken komen kopen kopje korte kraan krant kring kroon kruid kunst laars leden leger lente leren lepel leuke licht lopen lucht lunch maken maand macht maart merel meter mogen modem molen motor muren nacht naald naast namen negen niets nodig noten oever onder oogst opera orgel paard paars patat peper pizza plaat plank plant plein poort proef pruim raden raken ramen regen rente saaie salon schip sfeer sinds sjaal slaap slang sluit smaak snoep soort sport staal stoel stoom storm straf strak strik taart tafel tegel tekst thuis toren trein trots uilen vader varen veren vezel visie vogel vraag vrede vrouw vuist vuren waard wagen water weten winst woord wraak zaken zalig zeker zeven zomer zonde zwaar zwart zweet aders afval agent akker alsof anker anjer apart april asbak avond baken banjo beden begin beste beton bezit blank blauw blind blits blote bocht bodem boord borst bosje boter bouwt boven braam brein breuk broek bruid buigt cacao cavia cello chips circa cobra dadel dalen demon dicht dikte dorst draak drama droog duwen dikke eisen eland enorm extra fabel falen feest ficus flauw flits foute front fobie forel fleur gamen garen geest gelei genre geval goede gooit graad grill groei gunst haren harig heden heeft heren hobby hoeft hoort horde humor hecht hoest idool ieder imago inzet items jeans jubel kader kanon kapel karaf karma kazen kegel kever klant klaar klauw kleef klerk klets klont kluis knaap knoei knots koers koest kogel kolom komst koord koper kraag kraam krans kreet kroeg kruis kruik kudde kusje kwart kwast kweek laden lager lanen latex leeft leeuw leven lever liter loket loods loont magie magma maker mamma manen manie mango markt media menen metro model mooie motto musea nagel nicht nieuw noord oasis offer omdat oraal ouder ovaal pakje panda pasta pauze peren piste plaag plato plots pluim poker polis poten praat prima print prins puree raket rapen recht reden reeds retro riant riool robot rotte route ruilt ruzie sauna schat schep schok serie shirt skate slaaf slaat sleur slood sloot smeer snack snaar spaak speel speen spoor sprak spuit staat stage stand steen stelt steun stoep stond stout strip stuur super swing taken talen tarwe taxis tegen teken tempo thema titel tonen toost tosti toets trage twist uitje uiten vaart vacht valse vanaf verse vette vleug vlieg vloer vlees voren vorig vorst vroeg vulde waait waren warme weken wezen wilde woede wonen woont worst wrede yacht zacht zagen zalen zegel zelfs zicht zodat zorgt zucht zusje zwaan zweer zwoel'.split(' ');
let laatsteWoord = '';

function wordle() {
    let woord = '', gokken = [], huidig = '';
    let stats = { gespeeld: 0, gewonnen: 0, reeks: 0 };
    try { stats = Object.assign(stats, JSON.parse(localStorage.getItem('woordspel:stats'))); } catch (e) { /* niet erg */ }
    $('speelveld').innerHTML = `<p id="score"></p><p id="wstats" class="intro"></p><div class="wordle" id="bord"></div><div class="toetsen" id="toetsen"></div>`;

    function nieuwSpel() {
        do { woord = WOORDEN[Math.floor(Math.random() * WOORDEN.length)]; } while (woord === laatsteWoord);
        laatsteWoord = woord;
        gokken = [];
        huidig = '';
        teken();
    }
    function beoordeel(gok) {
        const uitslag = Array(5).fill('fout'), over = {};
        for (let i = 0; i < 5; i++) {
            if (gok[i] === woord[i]) uitslag[i] = 'goed';
            else over[woord[i]] = (over[woord[i]] || 0) + 1;
        }
        for (let i = 0; i < 5; i++) {
            if (uitslag[i] !== 'goed' && over[gok[i]] > 0) { uitslag[i] = 'bijna'; over[gok[i]]--; }
        }
        return uitslag;
    }
    const gewonnen = () => gokken.includes(woord);
    const klaar = () => gewonnen() || gokken.length >= 6;

    function teken() {
        const rang = { fout: 1, bijna: 2, goed: 3 }, letters = {};
        let bord = '';
        for (let r = 0; r < 6; r++) {
            let vakken = '';
            const gok = gokken[r];
            const uitslag = gok ? beoordeel(gok) : null;
            for (let i = 0; i < 5; i++) {
                if (gok) {
                    vakken += `<div class="w-vak ${uitslag[i]}">${gok[i]}</div>`;
                    if (!letters[gok[i]] || rang[uitslag[i]] > rang[letters[gok[i]]]) letters[gok[i]] = uitslag[i];
                } else if (r === gokken.length && !klaar()) {
                    vakken += `<div class="w-vak ${huidig[i] ? 'bezig' : ''}">${huidig[i] || ''}</div>`;
                } else vakken += `<div class="w-vak"></div>`;
            }
            bord += `<div class="w-rij">${vakken}</div>`;
        }
        $('bord').innerHTML = bord;
        const knop = k => `<button data-k="${k}" class="${letters[k] || ''}">${k === 'backspace' ? 'Wis' : k}</button>`;
        $('toetsen').innerHTML = ['qwertyuiop', 'asdfghjkl'].map(rij => `<div>${[...rij].map(knop).join('')}</div>`).join('')
            + `<div>${knop('enter')}${[...'zxcvbnm'].map(knop).join('')}${knop('backspace')}</div>`;
        const nieuwKnop = ' <button id="nieuw">Nieuw woord</button>';
        $('score').innerHTML = gewonnen() ? `Goed gedaan! Je had het in ${gokken.length} ${gokken.length === 1 ? 'poging' : 'pogingen'}.` + nieuwKnop
            : klaar() ? `Helaas, het woord was ${woord.toUpperCase()}.` + nieuwKnop
            : 'Raad het woord. Je hebt 6 pogingen.';
        if ($('nieuw')) $('nieuw').onclick = nieuwSpel;
        $('wstats').textContent = `Gespeeld: ${stats.gespeeld} · Gewonnen: ${stats.gewonnen} · Reeks: ${stats.reeks}`;
    }
    function toets(k) {
        if (klaar()) { if (k === 'enter') nieuwSpel(); return; }
        if (k === 'enter') {
            if (huidig.length < 5) { toast('Vul 5 letters in.'); return; }
            gokken.push(huidig);
            huidig = '';
            if (klaar()) {
                stats.gespeeld++;
                if (gewonnen()) { stats.gewonnen++; stats.reeks++; } else stats.reeks = 0;
                try { localStorage.setItem('woordspel:stats', JSON.stringify(stats)); } catch (e) { /* niet erg */ }
            }
        } else if (k === 'backspace') huidig = huidig.slice(0, -1);
        else if (/^[a-z]$/.test(k) && huidig.length < 5) huidig += k;
        teken();
    }
    $('toetsen').onclick = e => { const k = e.target.dataset.k; if (k) toets(k); };
    const keydown = e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === 'enter' || k === 'backspace' || /^[a-z]$/.test(k)) { e.preventDefault(); toets(k); }
    };
    document.addEventListener('keydown', keydown);
    cleanup.push(() => document.removeEventListener('keydown', keydown));
    nieuwSpel();
}

// ---------- Start ----------
window.addEventListener('hashchange', route);
(async () => { await laadMij(); await route(); })();
