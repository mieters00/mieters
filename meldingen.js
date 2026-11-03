// ---------- Meldingen (push) ----------
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.gaNaar) location.hash = e.data.gaNaar; });
}
const b64naarBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const isApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// 'installeren' | 'niet-ondersteund' | 'geblokkeerd' | 'uit' | 'aan'
async function meldingStatus() {
    if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) return isApple() ? 'installeren' : 'niet-ondersteund';
    if (Notification.permission === 'denied') return 'geblokkeerd';
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 3000))]);
    if (!reg) return 'niet-ondersteund';
    return (await reg.pushManager.getSubscription()) && Notification.permission === 'granted' ? 'aan' : 'uit';
}
async function meldingenAan() {
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Je hebt geen toestemming gegeven voor meldingen.');
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64naarBytes(MIETERS.VAPID) });
    const j = sub.toJSON();
    const { error } = await sb.rpc('push_registreer', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
    if (error) throw new Error('Meldingen aanzetten is niet gelukt.');
}
async function meldingenUit() {
    if (!('serviceWorker' in navigator && 'PushManager' in window)) return;
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 3000))]);
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub) return;
    await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
}

// Het blok op de profielpagina
async function meldingBlok() {
    const el = $('meld');
    if (!el) return;
    const st = await meldingStatus();
    if (!$('meld')) return;
    const tekst = {
        aan: 'Meldingen staan aan op dit apparaat: je hoort het bij een nieuw bericht, een uitnodiging en als je aan zet bent.',
        uit: 'Krijg een melding bij een nieuw bericht, een uitnodiging voor een partij en als je aan zet bent.',
        geblokkeerd: 'Meldingen zijn geblokkeerd. Zet ze aan bij Instellingen, Meldingen, Mieters.',
        installeren: 'Op een iPad of iPhone werkt dit alleen als Mieters op je beginscherm staat: tik in Safari op het deelicoon, kies "Zet op beginscherm" en open Mieters daarna via dat icoon.',
        'niet-ondersteund': 'Dit apparaat of deze browser ondersteunt geen meldingen.',
    }[st];
    const knop = st === 'uit' ? '<button id="meld-aan">Meldingen aanzetten</button>'
        : st === 'aan' ? '<button id="meld-test">Testmelding sturen</button> <button id="meld-uit" class="header-knop">Uitzetten</button>' : '';
    el.innerHTML = `<h3>Meldingen</h3><p>${esc(tekst)}</p>${knop} <span class="fout" id="meld-fout"></span>`;
    const fout = t => { if ($('meld-fout')) $('meld-fout').textContent = t; };
    if ($('meld-aan')) $('meld-aan').onclick = async () => { try { await meldingenAan(); meldingBlok(); } catch (e) { fout(e.message); } };
    if ($('meld-uit')) $('meld-uit').onclick = async () => { try { await meldingenUit(); meldingBlok(); } catch (e) { fout('Uitzetten is niet gelukt.'); } };
    if ($('meld-test')) $('meld-test').onclick = async () => {
        fout('');
        const { data, error } = await sb.functions.invoke('push', { body: { test: true } });
        fout(error || !data || !data.verstuurd ? 'De testmelding kon niet worden verstuurd.' : 'Verstuurd! Binnen een paar seconden zie je hem.');
    };
}