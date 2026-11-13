const sb = supabase.createClient(MIETERS.URL, MIETERS.KEY);
const app = document.getElementById('app');
const $ = id => document.getElementById(id);
let me = null;       // ingelogde gebruiker: { id, username, avatar }
let cleanup = [];    // functies die bij het verlaten van een pagina worden uitgevoerd

// ---------- Hulpfuncties ----------
// Voert een functie pas uit als het even stil is: veel realtime-meldingen vlak na elkaar worden één keer verwerkt
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pub = (bucket, path) => sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
const email = naam => naam.toLowerCase() + '@mieters.app';   // Supabase wil een e-mailadres; we maken er een van je gebruikersnaam

function avatar(p, size = 30) {
    const stijl = `width:${size}px;height:${size}px`;
    return p && p.avatar
        ? `<img class="av" loading="lazy" decoding="async" style="${stijl}" src="${esc(pub('avatars', p.avatar))}">`
        : `<div class="av av-leeg" style="${stijl}">${esc(((p && p.username) || '?')[0].toUpperCase())}</div>`;
}

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
// ruw = het bestand wordt nog verkleind, dus een grotere foto is dan prima (een GIF blijft maximaal 5 MB)
function checkFile(file, ruw = false) {
    const max = ruw && file && file.type !== 'image/gif' ? 25 : 5;
    if (!file || !TYPES[file.type] || file.size > max * 1024 * 1024)
        throw new Error('Kies een jpg, png, gif of webp. Een GIF mag maximaal 5 MB zijn.');
}
// Verkleint grote foto's tot maximaal 1600 px. Dat scheelt laadtijd, en de verborgen gegevens in een foto (zoals de GPS-locatie) verdwijnen.
async function verkleind(file, max = 1600, altijd = false) {
    if (!altijd && (file.type === 'image/gif' || file.size < 400 * 1024)) return file;
    try {
        const bmp = await createImageBitmap(file);
        const f = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(bmp.width * f));
        cv.height = Math.max(1, Math.round(bmp.height * f));
        cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
        bmp.close();
        const blob = await new Promise(r => cv.toBlob(r, 'image/webp', altijd ? 0.8 : 0.85));
        return blob && TYPES[blob.type] && (altijd || blob.size < file.size) ? new File([blob], 'foto', { type: blob.type }) : file;
    } catch (e) { return file; }
}
// Een foto op de Foto's-pagina krijgt ook een miniatuur (_t.webp), want in het raster hoeft niet elke foto op volle grootte geladen te worden
const thumbPad = p => p.replace(/\.[^./]+$/, '_t.webp');
const thumbUrl = p => pub('photos', thumbPad(p));
const fotoImg = p => `<img loading="lazy" decoding="async" src="${esc(thumbUrl(p))}" data-orig="${esc(pub('photos', p))}">`;
// bestaat de miniatuur nog niet (oude foto), dan valt de browser terug op de originele foto
document.addEventListener('error', e => {
    const i = e.target;
    if (i && i.tagName === 'IMG' && i.dataset && i.dataset.orig && i.src !== i.dataset.orig) i.src = i.dataset.orig;
}, true);
async function maakMiniatuur(bron, pad) {
    const klein = await verkleind(bron, 400, true);
    const { error } = await sb.storage.from('photos').upload(thumbPad(pad), klein, { cacheControl: '31536000', contentType: klein.type });
    if (error) throw error;
}
async function upload(bucket, file, uid) {
    checkFile(file, true);
    // Profielfoto's worden maar klein getoond: 192 px is ruim genoeg en scheelt veel data. Foto's gaan naar maximaal 1600 px.
    file = await verkleind(file, bucket === 'avatars' ? 192 : 1600, bucket === 'avatars');
    checkFile(file);
    const pad = `${uid}/${crypto.randomUUID()}.${TYPES[file.type]}`;
    // De bestandsnaam is willekeurig en verandert nooit, dus de browser mag hem lang onthouden
    const { error } = await sb.storage.from(bucket).upload(pad, file, { cacheControl: '31536000', contentType: file.type });
    if (error) throw error;
    if (bucket === 'photos') { try { await maakMiniatuur(file, pad); } catch (e) {} }
    return pad;
}

// Oude, te grote bestanden van jezelf worden eenmalig verkleind (alleen jouw eigen profielfoto en foto's), zodat de site minder data kost
async function optimaliseerBestanden() {
    if (!me || window.__optimaliseerd) return;
    window.__optimaliseerd = true;
    const vlag = 'mieters.opt1.' + me.id;
    try {
        if (localStorage.getItem(vlag) === '1') return;
        const haal = async (bucket, pad) => { const r = await fetch(pub(bucket, pad)); if (!r.ok) throw new Error('niet gevonden'); return r.blob(); };
        if (me.avatar) {                                  // 1. je profielfoto
            const naam = me.avatar.split('/').pop();
            const { data: lijst } = await sb.storage.from('avatars').list(me.id, { limit: 1000 });
            const info = (lijst || []).find(f => f.name === naam);
            if (info && info.metadata && info.metadata.size > 100 * 1024) {
                const blob = await haal('avatars', me.avatar);
                const klein = await verkleind(new File([blob], 'a', { type: blob.type }), 192, true);
                if (klein.size < blob.size) {
                    const pad = `${me.id}/${crypto.randomUUID()}.${TYPES[klein.type]}`;
                    const { error } = await sb.storage.from('avatars').upload(pad, klein, { cacheControl: '31536000', contentType: klein.type });
                    if (!error) {
                        const { error: e2 } = await sb.from('profiles').update({ avatar: pad }).eq('id', me.id);
                        if (e2) await sb.storage.from('avatars').remove([pad]);
                        else { await sb.storage.from('avatars').remove([me.avatar]); me.avatar = pad; }
                    }
                }
            }
        }
        const { data: fotos } = await sb.storage.from('photos').list(me.id, { limit: 1000 });   // 2. miniaturen voor je foto's
        const namen = new Set((fotos || []).map(f => f.name));
        for (const f of fotos || []) {
            if (/_t\.[a-z]+$/.test(f.name) || !f.metadata || f.metadata.size < 80 * 1024) continue;
            const pad = `${me.id}/${f.name}`;
            if (namen.has(thumbPad(pad).split('/').pop())) continue;
            const blob = await haal('photos', pad);
            await maakMiniatuur(new File([blob], 'f', { type: blob.type }), pad);
        }
        localStorage.setItem(vlag, '1');
    } catch (e) { /* het is een extraatje: bij een fout probeert de site het de volgende keer opnieuw */ window.__optimaliseerd = false; }
}

async function laadMij() {
    const { data: { session } } = await sb.auth.getSession();
    me = null;
    if (session) {
        const { data } = await sb.from('profiles').select('id,username,avatar').eq('id', session.user.id).single();
        me = data;
        if (me) setTimeout(optimaliseerBestanden, 6000);
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
    // De database telt zelf (zie beveiliging.sql): één klein antwoord in plaats van 500 berichten ophalen
    const { data } = await sb.rpc('ongelezen_totaal');
    ongelezenTotaal = Number(data) || 0;
    document.title = (ongelezenTotaal ? `(${ongelezenTotaal}) ` : '') + 'Mieters';
    renderMenu();
}
const laadMeldingenSnel = debounce(() => laadMeldingen(), 400);
function startMeldingen() {
    if (meldingenKanaal) return;
    meldingenKanaal = sb.channel('meldingen')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, laadMeldingenSnel)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_messages' }, laadMeldingenSnel)
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
    if (['chat', 'profile', 'bot', 'schaak', 'dam'].includes(naam) && !me) { location.hash = '#/login'; return; }
    renderMenu();
    if (me) { startMeldingen(); laadMeldingen(); } else stopMeldingen();
    const paginas = { login, register, photos, profile, chat, bot, games, schaak: schaakPartij, dam: damPartij };
    let a = arg || '';
    try { a = decodeURIComponent(a); } catch (e) { a = ''; }     // een kapotte link (bijv. %zz) mag de site niet laten crashen
    await (paginas[naam] || home)(a);
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
        <div class="foto-item">${fotoImg(r.path)}
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
        <label>Wachtwoord</label><br><input name="p" type="password" minlength="8" required><br><br>
        <label>Profielfoto</label><br><input name="file" type="file" accept="image/*" required><br><br>
        <button>Registreren</button></form>
        <p>Al een account? <a href="#/login">Inloggen</a></p></div>`;
    $('f').onsubmit = async e => {
        e.preventDefault();
        const f = e.target, naam = f.u.value.trim();
        try {
            checkFile(f.file.files[0], true);   // eerst controleren, zodat er geen half account ontstaat
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
        `<div id="fotos" class="fotos"></div><p class="meer"><button id="meer-fotos" hidden>Meer foto's laden</button></p><div id="overlay" hidden><img></div>`;

    let aantal = 24;     // eerst 24 foto's, de rest op verzoek
    async function laad() {
        const { data } = await sb.from('photos').select('id,path,description,profiles(username,avatar)').order('created_at', { ascending: false }).limit(aantal + 1);
        if (!$('fotos')) return;
        $('meer-fotos').hidden = !(data && data.length > aantal);
        $('fotos').innerHTML = (data || []).slice(0, aantal).map(r => `
            <div class="foto-item">
                ${fotoImg(r.path)}
                <div class="rij">${avatar(r.profiles)}<p>${esc(r.profiles && r.profiles.username)}</p></div>
                ${r.description ? `<p class="beschr">${esc(r.description).replace(/@([a-zA-Z0-9_]+)/g, '<strong class="mention">@$1</strong>')}</p>` : ''}
            </div>`).join('');
        if (!data || !data.length) $('fotos').innerHTML = '<p class="leeg">Nog geen foto\'s. Wees de eerste!</p>';
    }
    $('fotos').onclick = e => {
        if (e.target.tagName !== 'IMG') return;
        $('overlay').querySelector('img').src = e.target.dataset.orig || e.target.src;
        $('overlay').hidden = false;
    };
    $('overlay').onclick = () => { $('overlay').hidden = true; };
    $('meer-fotos').onclick = () => { aantal += 24; laad(); };

    if (me) $('up').onsubmit = async e => {
        e.preventDefault();
        const f = e.target;
        try {
            const pad = await upload('photos', f.file.files[0], me.id);
            const { error } = await sb.from('photos').insert({ user_id: me.id, path: pad, description: f.desc.value.trim() });
            if (error) { await sb.storage.from('photos').remove([pad, thumbPad(pad)]); throw error; }
            f.reset();
            $('fout').textContent = '';
            laad();
        } catch (err) { $('fout').textContent = err.message; }
    };

    const laadSnel = debounce(laad, 300);
    const kanaal = sb.channel('fotos').on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, laadSnel).subscribe();
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
        <div id="meld"></div>
        <button id="uit">Uitloggen</button></div>
        <h3>Mijn foto's</h3>
        <div class="fotos">${(fotos || []).map(r => `
            <div class="foto-item klein">${fotoImg(r.path)}
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
            const oud = me.avatar; me.avatar = pad;
            if (oud) sb.storage.from('avatars').remove([oud]);      // geen oude bestanden laten liggen
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
    $('uit').onclick = async () => { try { if (typeof meldingenUit === 'function') await meldingenUit(); } catch (e) {} await sb.auth.signOut(); me = null; location.hash = '#/'; };
    if (typeof meldingBlok === 'function') meldingBlok();      // alleen als meldingen.js er staat
    app.querySelectorAll('.x').forEach(b => b.onclick = async () => {
        if (!confirm('Wil je deze foto verwijderen?')) return;
        await sb.from('photos').delete().eq('id', b.dataset.id);
        await sb.storage.from('photos').remove([b.dataset.pad, thumbPad(b.dataset.pad)]);
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
        const { data: nieuwste } = await sb.from('messages').select('id,sender,recipient,body,image,read,created_at,hidden_by_sender,hidden_by_recipient')
            .or(`and(sender.eq.${me.id},recipient.eq.${andere.id}),and(sender.eq.${andere.id},recipient.eq.${me.id})`).order('created_at', { ascending: false }).limit(100);
        const data = (nieuwste || []).reverse();      // alleen de laatste 100 berichten, op volgorde
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
        const { data: nieuwste } = await sb.from('group_messages').select('id,sender,body,image,created_at,profiles(username,avatar)').eq('group_id', groepId).order('created_at', { ascending: false }).limit(100);
        const data = (nieuwste || []).reverse();
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

    const bijPrive = debounce(() => { laadLijst(); laadBerichten(); }, 300);
    const bijGroep = debounce(() => { laadLijst(); laadGroepBerichten(); }, 300);
    const kanaal = sb.channel('chats')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, bijPrive)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_messages' }, bijGroep)
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

    let bezig = false;
    $('bf2').onsubmit = async e => {
        e.preventDefault();
        const vraag = e.target.v.value.trim();
        if (!vraag || bezig) return;
        bezig = true;
        e.target.v.value = '';
        voegToe(true, vraag);
        const laden = voegToe(false, 'Bot is aan het typen...');
        const { data: res, error } = await sb.functions.invoke('bot', { body: { vraag } });
        laden.remove();
        bezig = false;
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
    schaken: { naam: 'Schaken', geenScores: true },
    dammen: { naam: 'Dammen', geenScores: true },
    drift: { naam: 'Drift' },
};

function games(spel) {
    if (!SPELLEN[spel]) spel = 'snake';
    app.innerHTML = `<h2>Spellen</h2>
        <div class="spel-tabs">${Object.entries(SPELLEN).map(([k, s]) => `<a href="#/games/${k}" class="${k === spel ? 'actief' : ''}">${s.naam}</a>`).join('')}</div>
        <div class="spel-wrap"><div id="speelveld"></div><div id="scores"></div></div>`;
    ({ snake, wordle, schaken: schaakLobby, dammen: damLobby, drift })[spel]();
    if (spel !== 'snake') laadScores(spel);      // Snake laadt zelf de Top 10 van de gekozen variant
}

// Bewaart je score alleen als het je beste is
async function bewaarScore(spel, score) {
    if (!me) return;
    // De database controleert de score en bewaart alleen je beste (zie beveiliging.sql)
    await sb.rpc('bewaar_score', { p_game: spel, p_score: score });
    laadScores(spel);
}

async function laadScores(spel) {
    const el = $('scores');
    if (!el) return;
    if ((SPELLEN[spel] || {}).geenScores) { el.innerHTML = ''; return; }
    const { data } = await sb.from('highscores').select('score,profiles(username,avatar)')
        .eq('game', spel).order('score', { ascending: false }).limit(10);
    el.innerHTML = `<h3>${snakeTitel(spel) || (typeof scoreTitel === 'function' ? esc(scoreTitel(spel)) : 'Top 10')}</h3>` + ((data || []).map((r, i) => `
        <div class="score-rij"><span>${i + 1}.</span>${avatar(r.profiles, 22)}
        <strong>${esc(r.profiles && r.profiles.username)}</strong><span class="punten">${r.score}</span></div>`).join('')
        || '<p class="leeg">Nog geen scores.</p>') + (me ? '' : '<p class="intro">Log in om je score te bewaren.</p>');
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
