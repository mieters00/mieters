// ---------- Drift (3D): spelregels en natuurkunde ----------
const DRIFT = (() => {
    const ARENA = 70;        // straal van het speelveld in meters
    const RONDE = 90;        // seconden per rit
    // unlock = het aantal punten dat je beste rit minstens moet hebben om deze auto te rijden
    const CARS = [
        { id: 'sedan', naam: 'Stadsauto', unlock: 0, maxSpeed: 25, accel: 10.5, grip: 7.0, hbGrip: 2.8, steer: 2.1, over: 0.24, tekst: 'Makkelijk te besturen. Hier begin je mee.' },
        { id: 'hatchback-sports', naam: 'Sporthatchback', unlock: 400, maxSpeed: 27, accel: 12, grip: 6.8, hbGrip: 2.6, steer: 2.2, over: 0.28, tekst: 'Klein en wendbaar, glijdt snel weg.' },
        { id: 'taxi', naam: 'Taxi', unlock: 900, maxSpeed: 26, accel: 11.5, grip: 6.6, hbGrip: 2.6, steer: 2.1, over: 0.3, tekst: 'Stabiel en voorspelbaar.' },
        { id: 'sedan-sports', naam: 'Sportsedan', unlock: 1800, maxSpeed: 30, accel: 13.5, grip: 6.4, hbGrip: 2.4, steer: 2.2, over: 0.32, tekst: 'Snel, met een achterkant die graag uitbreekt.' },
        { id: 'police', naam: 'Politieauto', unlock: 3000, maxSpeed: 31, accel: 14, grip: 6.3, hbGrip: 2.4, steer: 2.2, over: 0.34, tekst: 'Veel vermogen en een lange drift.' },
        { id: 'suv', naam: 'SUV', unlock: 4500, maxSpeed: 28, accel: 12.5, grip: 6.0, hbGrip: 2.2, steer: 1.8, over: 0.36, tekst: 'Zwaar: draait traag, maar blijft lang glijden.' },
        { id: 'firetruck', naam: 'Brandweerwagen', unlock: 6500, maxSpeed: 26, accel: 10, grip: 5.4, hbGrip: 2.0, steer: 1.6, over: 0.42, tekst: 'Groot, lomp en grappig om mee te slippen.' },
        { id: 'race', naam: 'Racewagen', unlock: 9000, maxSpeed: 36, accel: 17, grip: 7.4, hbGrip: 2.4, steer: 2.4, over: 0.32, tekst: 'Heel snel en direct. Voor ervaren drifters.' },
        { id: 'race-future', naam: 'Toekomstauto', unlock: 12000, maxSpeed: 40, accel: 20, grip: 7.0, hbGrip: 2.3, steer: 2.6, over: 0.42, tekst: 'De snelste van allemaal.' },
    ];
    const klem = (v, a, b) => Math.max(a, Math.min(b, v));

    function nieuwAuto(c) {
        return { c, x: 0, z: -32, yaw: Math.PI / 2, vx: 0, vz: 0, yr: 0, steerV: 0, speed: 0, vf: 0, vl: 0, ang: 0, acc: 0 };
    }

    // Kegels: twee ringen om tegenaan te rijden. Elke omgereden kegel geeft punten.
    function maakKegels() {
        const k = [];
        const ring = (n, r, off) => { for (let i = 0; i < n; i++) { const t = off + (i / n) * Math.PI * 2; k.push({ x: Math.cos(t) * r, z: Math.sin(t) * r, vx: 0, vz: 0, omlaag: false, tilt: 0, richting: 0 }); } };
        ring(24, 48, 0.1);
        ring(12, 20, 0.4);
        return k;
    }

    // Eén tijdstapje. inp = { steer: -1..1 (links = +1), gas, brake, hand }
    function stap(a, inp, dt, kegels) {
        const c = a.c, ev = { muur: 0, kegels: 0 };
        a.steerV += (inp.steer - a.steerV) * Math.min(1, 9 * dt);
        const hb = inp.hand ? 1 : 0, gas = inp.gas ? 1 : 0;
        const v0 = Math.hypot(a.vx, a.vz);
        const vf0 = a.vx * Math.sin(a.yaw) + a.vz * Math.cos(a.yaw);

        // draaien: stilstaand kun je niet sturen, snel iets minder scherp, achteruit omgekeerd, handrem helpt
        let doel = a.steerV * c.steer * klem(v0 / 4, 0, 1) / (1 + v0 / 45);
        if (vf0 < -0.5) doel = -doel;
        if (hb) doel *= 1.15;
        a.yr += (doel - a.yr) * Math.min(1, (hb ? 5 : 8) * dt);
        a.yaw += a.yr * dt;

        // snelheid ontbinden in vooruit (vf) en opzij (vl) ten opzichte van de nieuwe stand van de auto
        const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), lx = Math.cos(a.yaw), lz = -Math.sin(a.yaw);
        let vf = a.vx * fx + a.vz * fz, vl = a.vx * lx + a.vz * lz;
        const vfVoor = vf;

        if (gas) vf += c.accel * (1 - klem(vf / c.maxSpeed, 0, 1)) * dt;
        if (inp.brake) {
            if (vf > 0.5) vf = Math.max(0, vf - c.accel * 1.4 * dt);
            else vf -= c.accel * 0.45 * dt * (1 - klem(-vf / (c.maxSpeed * 0.3), 0, 1));
        } else if (!gas) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt);
        vf -= vf * 0.04 * dt + Math.sign(vf) * 0.0006 * vf * vf * dt;
        if (hb) vf *= Math.exp(-0.35 * dt);

        // grip: de zijwaartse snelheid dooft uit. Met handrem of gas in de bocht is er minder grip, en dan glijd je.
        let grip = hb ? c.hbGrip : c.grip;
        grip *= 1 - c.over * gas * Math.abs(a.steerV) * klem(v0 / (c.maxSpeed * 0.7), 0, 1);
        grip *= 1 - 0.45 * klem((Math.abs(vl) - 2) / 6, 0, 1);
        vl *= Math.exp(-grip * dt);

        a.vx = fx * vf + lx * vl;
        a.vz = fz * vf + lz * vl;
        a.x += a.vx * dt;
        a.z += a.vz * dt;
        if (!gas && !inp.brake && Math.hypot(a.vx, a.vz) < 0.15) { a.vx = 0; a.vz = 0; vf = 0; vl = 0; }

        // muur
        const d = Math.hypot(a.x, a.z), lim = ARENA - 2.0;
        if (d > lim) {
            const nx = a.x / d, nz = a.z / d, vn = a.vx * nx + a.vz * nz;
            a.x = nx * lim; a.z = nz * lim;
            if (vn > 0) {
                a.vx -= 1.3 * vn * nx; a.vz -= 1.3 * vn * nz;
                a.vx *= 0.85; a.vz *= 0.85;
                if (vn > 3) ev.muur = vn;
            }
        }
        // kegels
        if (kegels) for (const k of kegels) {
            if (k.omlaag) continue;
            const dx = k.x - a.x, dz = k.z - a.z;
            if (dx * dx + dz * dz < 2.0 * 2.0) {
                k.omlaag = true;
                k.vx = a.vx * 1.05 + (Math.random() - 0.5) * 2;
                k.vz = a.vz * 1.05 + (Math.random() - 0.5) * 2;
                k.richting = Math.atan2(k.vx, k.vz);
                a.vx *= 0.985; a.vz *= 0.985;
                ev.kegels++;
            }
        }
        a.vf = a.vx * fx + a.vz * fz; a.vl = a.vx * lx + a.vz * lz;
        a.speed = Math.hypot(a.vx, a.vz);
        a.ang = a.vf > 0.5 ? Math.atan2(Math.abs(a.vl), a.vf) : 0;
        a.acc += ((a.vf - vfVoor) / dt - a.acc) * Math.min(1, 6 * dt);
        return ev;
    }
    function stapKegels(kegels, dt) {
        for (const k of kegels) if (k.omlaag) {
            k.x += k.vx * dt; k.z += k.vz * dt;
            const f = Math.exp(-2.2 * dt); k.vx *= f; k.vz *= f;
            k.tilt = Math.min(1.45, k.tilt + dt * 9);
        }
    }

    // ---------- punten ----------
    function nieuweRonde() { return { tijd: RONDE, score: 0, ketting: 0, kettingTijd: 0, genade: 0, mult: 1, kegels: 0, langste: 0 }; }
    // geeft een lijst gebeurtenissen terug: { t: 'bank' | 'verloren', punten }
    function tel(r, a, dt, ev) {
        const uit = [];
        const graden = a.ang * 180 / Math.PI;
        const driftend = a.speed > 7 && a.vf > 2 && graden > 15 && graden < 85;
        const bank = () => { const p = Math.round(r.ketting); if (p > 0) { r.score += p; uit.push({ t: 'bank', punten: p, mult: r.mult }); } r.langste = Math.max(r.langste, r.kettingTijd); r.ketting = 0; r.kettingTijd = 0; r.mult = 1; r.genade = 0; };
        if (ev.kegels) { r.score += 50 * ev.kegels; r.kegels += ev.kegels; uit.push({ t: 'kegel', punten: 50 * ev.kegels }); }
        if (ev.muur && r.ketting > 0) { const p = Math.round(r.ketting); uit.push({ t: 'verloren', punten: p }); r.ketting = 0; r.kettingTijd = 0; r.mult = 1; r.genade = 0; }
        if (driftend) {
            r.kettingTijd += dt; r.genade = 0.7;
            r.mult = Math.min(5, 1 + Math.floor(r.kettingTijd / 2));
            r.ketting += dt * (a.speed / 10) * Math.min(graden, 60) * 1.0 * r.mult;
        } else if (r.ketting > 0) {
            r.genade -= dt;
            if (r.genade <= 0) bank();
        }
        r.tijd = Math.max(0, r.tijd - dt);
        if (r.tijd === 0 && r.ketting > 0) bank();
        return uit;
    }
    return { ARENA, RONDE, CARS, nieuwAuto, maakKegels, stap, stapKegels, nieuweRonde, tel, klem };
})();

// ---------- Drift (3D): scherm ----------
let driftLaden = null;
function driftScript(src) {
    return new Promise((ok, fout) => {
        const s = document.createElement('script');
        s.src = src; s.onload = ok; s.onerror = () => fout(new Error('laden mislukt: ' + src));
        document.head.appendChild(s);
    });
}
// three.js komt van de CDN (vaste versie), pas als je de Drift-tab opent
function driftLaadThree() {
    if (window.THREE && THREE.GLTFLoader) return Promise.resolve();
    if (!driftLaden) {
        const cdn = v => `https://cdn.jsdelivr.net/npm/three@${v}`;
        driftLaden = driftScript(`${cdn('0.147.0')}/build/three.min.js`)
            .then(() => driftScript(`${cdn('0.147.0')}/examples/js/loaders/GLTFLoader.js`).catch(() => driftScript(`${cdn('0.146.0')}/examples/js/loaders/GLTFLoader.js`)))
            .catch(e => { driftLaden = null; throw e; });
    }
    return driftLaden;
}

async function drift() {
    const el = $('speelveld');
    el.style.width = '100%';
    el.innerHTML = `<div class="dr">
        <div class="dr-scherm" id="dr-scherm"><canvas id="dr-canvas"></canvas>
            <div class="dr-laad" id="dr-laad">Drift wordt geladen...</div>
            <div class="dr-hud" id="dr-hud" hidden>
                <div class="dr-blok"><small>Punten</small><b id="dr-punten">0</b></div>
                <div class="dr-blok"><small>Tijd</small><b id="dr-tijd">90</b></div>
                <div class="dr-blok"><small>Snelheid</small><b id="dr-kmh">0</b></div>
            </div>
            <div class="dr-ketting" id="dr-ketting"></div>
            <div class="dr-popup" id="dr-popup"></div>
            <div class="dr-menu" id="dr-menu" hidden></div>
            <div class="dr-hoek"><button class="dr-mini" id="dr-geluid" title="Geluid">&#128266;</button><button class="dr-mini" id="dr-vol" title="Volledig scherm">&#9974;</button></div>
            <div class="dr-touch" id="dr-touch" hidden>
                <div class="dr-groep"><button data-k="L">&#9664;</button><button data-k="R">&#9654;</button></div>
                <div class="dr-groep"><button data-k="hand" class="klein">DRIFT</button><button data-k="rem" class="klein">REM</button><button data-k="gas" class="groot">GAS</button></div>
                <button class="dr-mini dr-autogas" id="dr-autogas">Auto-gas: aan</button>
            </div>
        </div>
        <p class="intro dr-uitleg">Pijltjes of W, A, S en D: sturen en gas &middot; <b>Spatie: handrem (zo drift je!)</b> &middot; Esc: terug naar de garage. Je hebt 90 seconden: hoe langer en hoe harder je driftt, hoe meer punten. Een botsing tegen de muur kost je de punten van je drift. Auto's: Kenney.nl (CC0).</p></div>`;
    try { await driftLaadThree(); } catch (e) { if ($('dr-laad')) $('dr-laad').textContent = 'Het 3D-spel kon niet worden geladen. Controleer je internet en probeer het opnieuw.'; return; }
    if (!$('dr-canvas')) return;                    // je was al weggegaan
    driftBouw();
}

function driftBouw() {
    const { ARENA, CARS } = DRIFT, DT = 1 / 90;
    const scherm = $('dr-scherm'), canvas = $('dr-canvas');
    const kleur = h => new THREE.Color(h).convertSRGBToLinear();     // kleuren zoals ze er op het scherm uit moeten zien
    const opslag = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
    const sleutelBest = 'mieters.drift.best.' + (me ? me.id : 'gast');

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
    catch (e) { $('dr-laad').textContent = 'Je apparaat of browser ondersteunt geen 3D (WebGL).'; return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    scene.background = kleur(0x9ed0f5);
    scene.fog = new THREE.Fog(kleur(0x9ed0f5), 90, 280);
    const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 500);
    scene.add(new THREE.HemisphereLight(0xffffff, kleur(0x6a7a58), 0.95));
    const zon = new THREE.DirectionalLight(0xffffff, 0.85); zon.position.set(60, 90, 40); scene.add(zon);

    // ---------- de wereld ----------
    const lam = h => new THREE.MeshLambertMaterial({ color: kleur(h) });
    const plat = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; scene.add(m); return m; };
    plat(new THREE.CircleGeometry(450, 48), lam(0x4f9a49), -0.06);
    plat(new THREE.CircleGeometry(ARENA, 96), lam(0x3c4046), 0);
    const lijn = (r1, r2, h) => plat(new THREE.RingGeometry(r1, r2, 96), new THREE.MeshBasicMaterial({ color: kleur(h) }), 0.02);
    lijn(ARENA - 6.4, ARENA - 6, 0xffffff); lijn(19.8, 20.2, 0xffd84a); lijn(47.8, 48.2, 0xffd84a);
    plat(new THREE.PlaneGeometry(1.2, 28), new THREE.MeshBasicMaterial({ color: kleur(0xffffff) }), 0.025).position.set(0, 0.025, -34);
    const dummy = new THREE.Object3D();
    const N = 64, muur = new THREE.InstancedMesh(new THREE.BoxGeometry(6.8, 0.9, 1.2), lam(0xffffff), N);
    for (let i = 0; i < N; i++) {
        const t = (i / N) * Math.PI * 2;
        dummy.position.set(Math.cos(t) * (ARENA + 0.4), 0.45, Math.sin(t) * (ARENA + 0.4));
        dummy.rotation.set(0, -t - Math.PI / 2, 0); dummy.updateMatrix();
        muur.setMatrixAt(i, dummy.matrix); muur.setColorAt(i, kleur(i % 2 ? 0xffffff : 0xd8342c));
    }
    muur.instanceMatrix.needsUpdate = true; muur.instanceColor.needsUpdate = true; scene.add(muur);
    let zaad = 7; const rnd = () => (zaad = (zaad * 16807) % 2147483647) / 2147483647;
    const bomen = 110, kruin = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 6, 8), lam(0x2f7d3a), bomen), stam = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 6), lam(0x6b4a2b), bomen);
    for (let i = 0; i < bomen; i++) {
        const t = rnd() * Math.PI * 2, r = ARENA + 14 + rnd() * 110, s = 0.8 + rnd() * 0.9;
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(s);
        dummy.position.set(Math.cos(t) * r, 5 * s, Math.sin(t) * r); dummy.updateMatrix(); kruin.setMatrixAt(i, dummy.matrix);
        dummy.position.set(Math.cos(t) * r, 1 * s, Math.sin(t) * r); dummy.updateMatrix(); stam.setMatrixAt(i, dummy.matrix);
    }
    dummy.scale.setScalar(1); scene.add(kruin); scene.add(stam);

    // ---------- remsporen en rook ----------
    const MAXREM = 600, remGeo = new THREE.PlaneGeometry(0.34, 0.95); remGeo.rotateX(-Math.PI / 2);
    const rem = new THREE.InstancedMesh(remGeo, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.5, depthWrite: false }), MAXREM);
    rem.frustumCulled = false; dummy.scale.set(0, 0, 0); dummy.updateMatrix();
    for (let i = 0; i < MAXREM; i++) rem.setMatrixAt(i, dummy.matrix);
    dummy.scale.set(1, 1, 1); scene.add(rem);
    let remI = 0;
    const zetRem = (x, z, hoek) => { dummy.position.set(x, 0.04, z); dummy.rotation.set(0, hoek, 0); dummy.updateMatrix(); rem.setMatrixAt(remI, dummy.matrix); remI = (remI + 1) % MAXREM; rem.instanceMatrix.needsUpdate = true; };
    const wisRem = () => { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); for (let i = 0; i < MAXREM; i++) rem.setMatrixAt(i, dummy.matrix); dummy.scale.set(1, 1, 1); rem.instanceMatrix.needsUpdate = true; };
    const rc = document.createElement('canvas'); rc.width = rc.height = 64;
    const rg = rc.getContext('2d'), grad = rg.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); rg.fillStyle = grad; rg.fillRect(0, 0, 64, 64);
    const rookTex = new THREE.CanvasTexture(rc), rook = [];
    for (let i = 0; i < 44; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: rookTex, transparent: true, opacity: 0, depthWrite: false }));
        sp.visible = false; scene.add(sp); rook.push({ sp, leven: 0, vx: 0, vz: 0 });
    }
    let rookI = 0;
    const zetRook = (x, z, vx, vz) => { const r = rook[rookI]; rookI = (rookI + 1) % rook.length; r.leven = 0.9; r.vx = vx * 0.25 + (Math.random() - 0.5); r.vz = vz * 0.25 + (Math.random() - 0.5); r.sp.position.set(x, 0.5, z); r.sp.visible = true; };

    // ---------- modellen ----------
    const loader = new THREE.GLTFLoader();
    const glb = naam => new Promise((ok, nee) => loader.load('drift/cars/' + naam + '.glb', g => ok(g.scene), undefined, nee));
    const SCHAAL = 1.35, cache = {};
    const reserveAuto = () => {       // als de bestanden ontbreken: een eenvoudige auto van blokjes, zodat het spel toch werkt
        const m = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 2.7), lam(0xd8342c)); body.position.y = 0.6; m.add(body);
        const dak = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.3), lam(0xf2f2f2)); dak.position.set(0, 1.1, -0.2); m.add(dak);
        for (const [n, x, z] of [['wheel-front-left', 0.7, 0.85], ['wheel-front-right', -0.7, 0.85], ['wheel-back-left', 0.7, -0.85], ['wheel-back-right', -0.7, -0.85]]) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 14).rotateZ(Math.PI / 2), lam(0x222222)); w.name = n; w.position.set(x, 0.3, z); m.add(w);
        }
        return m;
    };
    function laadAuto(id) {
        if (!cache[id]) cache[id] = glb(id).catch(() => reserveAuto()).then(model => {
            const binnen = new THREE.Group(), groep = new THREE.Group(), wielen = [];
            model.scale.setScalar(SCHAAL); binnen.add(model); groep.add(binnen);
            model.traverse(o => { if (/^wheel-/.test(o.name)) { o.rotation.order = 'YXZ'; wielen.push({ o, voor: /front/.test(o.name), x: o.position.x * SCHAAL, z: o.position.z * SCHAAL, spin: 0 }); } });
            return { id, groep, binnen, wielen, vergrendeld: null };
        });
        return cache[id];
    }
    const zetSlot = (auto, slot) => {      // een vergrendelde auto zie je donker
        if (auto.vergrendeld === slot) return;
        auto.vergrendeld = slot;
        auto.groep.traverse(o => {
            if (!o.isMesh) return;
            o.userData.m0 = o.userData.m0 || o.material;
            if (slot) { if (!o.userData.mSlot) { o.userData.mSlot = o.material.clone(); o.userData.mSlot.color.setScalar(0.12); } o.material = o.userData.mSlot; } else o.material = o.userData.m0;
        });
    };
    const kegelModel = glb('cone').then(m => { m.scale.setScalar(2.4); return m; }).catch(() => {
        const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 12).translate(0, 0.6, 0), lam(0xff7a1a)); return m;
    });

    // ---------- spelstaat ----------
    const S = {
        fase: 'garage', keuze: 0, beste: 0, auto: null, a: null, ronde: null, kegels: [], kegelObj: [], rest: 0, aftel: 0, vorige: 0, raf: 0, laadNr: 0,
        camYaw: Math.PI / 2, camPos: new THREE.Vector3(), garageHoek: 0.6, shake: 0, remT: 0, rookT: 0, stil: opslag.get('mieters.drift.stil') === '1',
        autoGas: ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches), touch: false, laden: false, audio: null, popT: 0, laatsteTekst: {},
    };
    S.touch = S.autoGas;
    const knop = { L: false, R: false, gas: false, rem: false, hand: false };
    const invoer = () => ({ steer: (knop.L ? 1 : 0) - (knop.R ? 1 : 0), gas: knop.gas || (S.autoGas && S.fase === 'rijden'), brake: knop.rem, hand: knop.hand });
    const open = i => CARS[i].unlock <= S.beste;
    const tekst = (id, t) => { const e = $(id); if (e && S.laatsteTekst[id] !== t) { S.laatsteTekst[id] = t; e.textContent = t; } };
    const popup = (t, klas) => { const e = $('dr-popup'); if (!e) return; e.textContent = t; e.className = 'dr-popup ' + (klas || ''); void e.offsetWidth; e.classList.add('toon'); };

    // kegels
    const resetKegels = async () => {
        S.kegels = DRIFT.maakKegels();
        const sjabloon = await kegelModel;
        if (!$('dr-canvas')) return;
        S.kegelObj.forEach(o => scene.remove(o)); S.kegelObj = [];
        for (const k of S.kegels) { const o = sjabloon.clone(true); o.rotation.order = 'YXZ'; o.position.set(k.x, 0, k.z); scene.add(o); S.kegelObj.push(o); }
    };

    // ---------- garage ----------
    async function kiesAuto(i) {
        S.keuze = ((i % CARS.length) + CARS.length) % CARS.length;
        const mijn = ++S.laadNr;
        S.laden = true; menu();
        const auto = await laadAuto(CARS[S.keuze].id);
        if (mijn !== S.laadNr || !$('dr-canvas')) return;
        if (S.auto) scene.remove(S.auto.groep);
        S.auto = auto; zetSlot(auto, !open(S.keuze)); scene.add(auto.groep);
        S.laden = false; menu();
    }
    function balk(label, w) { return `<div class="dr-stat"><span>${label}</span><i><u style="width:${Math.round(DRIFT.klem(w, 0.05, 1) * 100)}%"></u></i></div>`; }
    function menu() {
        const m = $('dr-menu'); if (!m) return;
        if (S.fase !== 'garage' && S.fase !== 'klaar') { m.hidden = true; return; }
        m.hidden = false;
        if (S.fase === 'klaar') return;           // het resultaatscherm vult het menu zelf
        const c = CARS[S.keuze], vrij = open(S.keuze);
        m.innerHTML = `<div class="dr-titel">Kies je auto</div>
            <div class="dr-rij"><button class="dr-pijl" id="dr-vorige">&#9664;</button>
              <div class="dr-info"><b>${esc(c.naam)}</b> ${vrij ? '' : '<span class="dr-slot">&#128274; vanaf ' + c.unlock + ' punten</span>'}
                <p>${esc(c.tekst)}</p>
                ${balk('Snelheid', c.maxSpeed / 40)}${balk('Optrekken', c.accel / 20)}${balk('Driftgemak', (8.2 - c.grip) / 3.2)}</div>
              <button class="dr-pijl" id="dr-volgende">&#9654;</button></div>
            <div class="dr-lijst">${CARS.map((x, i) => `<button class="dr-chip ${i === S.keuze ? 'actief' : ''} ${open(i) ? '' : 'slot'}" data-i="${i}">${open(i) ? '' : '&#128274; '}${esc(x.naam)}</button>`).join('')}</div>
            <button class="dr-start" id="dr-start" ${vrij && !S.laden ? '' : 'disabled'}>${S.laden ? 'Laden...' : vrij ? 'Start (Enter)' : 'Nog niet vrijgespeeld'}</button>
            <p class="dr-beste">Jouw beste: <b>${S.beste}</b> punten${me ? '' : ' &middot; <a href="#/login">Log in</a> om je score te bewaren'}</p>`;
        $('dr-vorige').onclick = () => kiesAuto(S.keuze - 1);
        $('dr-volgende').onclick = () => kiesAuto(S.keuze + 1);
        $('dr-start').onclick = startRit;
        m.querySelectorAll('.dr-chip').forEach(b => b.onclick = () => kiesAuto(+b.dataset.i));
    }

    // ---------- geluid ----------
    function audioStart() {
        try {
            if (!S.audio) {
                const C = window.AudioContext || window.webkitAudioContext, ctx = new C();
                const osc = ctx.createOscillator(); osc.type = 'sawtooth';
                const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 600;
                const motor = ctx.createGain(); motor.gain.value = 0;
                osc.connect(filt); filt.connect(motor); motor.connect(ctx.destination); osc.start();
                const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
                const ruis = ctx.createBufferSource(); ruis.buffer = buf; ruis.loop = true;
                const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1500; band.Q.value = 2;
                const gil = ctx.createGain(); gil.gain.value = 0;
                ruis.connect(band); band.connect(gil); gil.connect(ctx.destination); ruis.start();
                S.audio = { ctx, osc, motor, gil };
            }
            if (S.audio.ctx.state === 'suspended') S.audio.ctx.resume();
        } catch (e) { S.audio = null; }
    }
    function audioUpdate(slip) {
        const A = S.audio; if (!A || !S.a) return;
        try {
            const t = A.ctx.currentTime, rijdt = S.fase === 'rijden' || S.fase === 'aftellen';
            A.osc.frequency.setTargetAtTime(48 + (S.a.speed / S.a.c.maxSpeed) * 150 + (knop.gas || S.autoGas ? 14 : 0), t, 0.08);
            A.motor.gain.setTargetAtTime(S.stil || !rijdt ? 0 : 0.035, t, 0.1);
            A.gil.gain.setTargetAtTime(S.stil || !rijdt ? 0 : slip * 0.05, t, 0.06);
        } catch (e) {}
    }
    const geluidKnop = () => { const b = $('dr-geluid'); if (b) b.innerHTML = S.stil ? '&#128263;' : '&#128266;'; };

    // ---------- een rit ----------
    function startRit() {
        if (!open(S.keuze) || S.laden || !S.auto) return;
        audioStart();
        opslag.set('mieters.drift.auto', CARS[S.keuze].id);
        zetSlot(S.auto, false);
        S.a = DRIFT.nieuwAuto(CARS[S.keuze]); S.ronde = DRIFT.nieuweRonde(); S.aftel = 3.2; S.rest = 0; S.fase = 'aftellen';
        S.camYaw = S.a.yaw; S.camPos.set(0, 0, 0); wisRem(); resetKegels();
        $('dr-hud').hidden = false; $('dr-touch').hidden = !S.touch; $('dr-ketting').textContent = ''; menu();
    }
    function naarGarage() {
        S.fase = 'garage'; knop.L = knop.R = knop.gas = knop.rem = knop.hand = false;
        $('dr-hud').hidden = true; $('dr-touch').hidden = true; $('dr-ketting').textContent = ''; $('dr-popup').className = 'dr-popup';
        audioUpdate(0); kiesAuto(S.keuze);
    }
    async function klaar() {
        S.fase = 'klaar';
        const r = S.ronde, score = Math.floor(r.score), oud = S.beste;
        S.beste = Math.max(S.beste, score); opslag.set(sleutelBest, String(S.beste));
        const nieuw = CARS.filter(c => c.unlock > oud && c.unlock <= S.beste);
        $('dr-hud').hidden = true; $('dr-touch').hidden = true; $('dr-ketting').textContent = '';
        const m = $('dr-menu'); m.hidden = false;
        m.innerHTML = `<div class="dr-titel">Rit afgelopen!</div><div class="dr-groot">${score}</div><p>punten</p>
            <p>${score > oud && score > 0 ? '&#127942; <b>Nieuw record!</b>' : 'Jouw beste: <b>' + S.beste + '</b>'}</p>
            <p class="dr-beste">Kegels omgereden: ${r.kegels} &middot; Langste drift: ${r.langste.toFixed(1)} s</p>
            ${nieuw.length ? `<p class="dr-unlock">&#128275; Vrijgespeeld: <b>${nieuw.map(c => esc(c.naam)).join(', ')}</b></p>` : ''}
            ${me ? '' : '<p class="dr-beste"><a href="#/login">Log in</a> om je score in de Top 10 te zetten.</p>'}
            <div class="dr-rij2"><button class="dr-start" id="dr-opnieuw">Opnieuw</button><button class="dr-start twee" id="dr-garage">Garage</button></div>`;
        $('dr-opnieuw').onclick = startRit; $('dr-garage').onclick = naarGarage;
        if (me && score > 0) { try { await bewaarScore('drift', score); } catch (e) {} }
    }
    function gebeurtenis(u) {
        if (u.t === 'bank') popup(`+${u.punten}${u.mult > 1 ? '  (x' + u.mult + ')' : ''}`, 'goed');
        else if (u.t === 'verloren') { popup(`Botsing! -${u.punten}`, 'fout'); S.shake = 1; }
        else if (u.t === 'kegel') popup(`+${u.punten}`, 'klein');
    }
    function stapSim(dt) {
        if (S.fase === 'aftellen') {
            const oud = Math.ceil(S.aftel); S.aftel -= dt;
            if (S.aftel <= 0) { S.fase = 'rijden'; popup('GO!', 'goed'); }
            else if (Math.ceil(S.aftel) !== oud) popup(String(Math.ceil(S.aftel)), 'groot');
            return;
        }
        const ev = DRIFT.stap(S.a, invoer(), dt, S.kegels); DRIFT.stapKegels(S.kegels, dt);
        for (const u of DRIFT.tel(S.ronde, S.a, dt, ev)) gebeurtenis(u);
        if (ev.muur) S.shake = Math.max(S.shake, 0.6);
        if (S.ronde.tijd <= 0) klaar();
    }

    // ---------- tekenen ----------
    const hoekVerschil = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    const vec = new THREE.Vector3(), kijk = new THREE.Vector3();
    function teken(dt) {
        const auto = S.auto, a = S.a;
        if (S.fase === 'garage' || S.fase === 'klaar' || !a) {
            S.garageHoek += dt * 0.6;
            if (auto) { auto.groep.position.set(0, 0, 0); auto.groep.rotation.y = S.garageHoek; auto.binnen.rotation.set(0, 0, 0); }
            camera.fov = 50; camera.updateProjectionMatrix();
            camera.position.set(5.5, 2.6, -8); camera.lookAt(0, 0.8, 0);
        } else if (auto) {
            auto.groep.position.set(a.x, 0, a.z); auto.groep.rotation.y = a.yaw;
            auto.binnen.rotation.z = DRIFT.klem(a.yr * a.speed * 0.0035, -0.14, 0.14);
            auto.binnen.rotation.x = DRIFT.klem(a.acc * 0.006, -0.08, 0.08);
            for (const w of auto.wielen) { w.spin += a.vf * dt / (0.3 * SCHAAL); w.o.rotation.x = w.spin; if (w.voor) w.o.rotation.y = a.steerV * 0.5; }
            // camera: kijkt een beetje mee met de rijrichting, zodat je de drift ziet
            const sp = a.speed, tx = Math.sin(a.yaw) * 0.65 + (sp > 4 ? (a.vx / sp) * 0.35 : 0), tz = Math.cos(a.yaw) * 0.65 + (sp > 4 ? (a.vz / sp) * 0.35 : 0);
            S.camYaw += hoekVerschil(Math.atan2(tx, tz), S.camYaw) * Math.min(1, 3 * dt);
            const afstand = 8.5 + sp * 0.06;
            vec.set(a.x - Math.sin(S.camYaw) * afstand, 3.6 + sp * 0.02, a.z - Math.cos(S.camYaw) * afstand);
            if (S.camPos.lengthSq() === 0) S.camPos.copy(vec);
            S.camPos.lerp(vec, 1 - Math.exp(-7 * dt));
            S.shake = Math.max(0, S.shake - dt * 2.2);
            camera.position.set(S.camPos.x + (Math.random() - 0.5) * S.shake * 0.6, S.camPos.y + (Math.random() - 0.5) * S.shake * 0.4, S.camPos.z + (Math.random() - 0.5) * S.shake * 0.6);
            camera.fov = 62 + sp * 0.45; camera.updateProjectionMatrix();
            camera.lookAt(a.x + Math.sin(S.camYaw) * 3, 1, a.z + Math.cos(S.camYaw) * 3);

            // remsporen en rook zodra je slipt
            const inp = invoer(), slip = a.speed > 4 && (Math.abs(a.vl) > 2.5 || (inp.hand && a.speed > 5)) && S.fase === 'rijden';
            if (slip) {
                S.remT -= dt; S.rookT -= dt;
                const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), lx = Math.cos(a.yaw), lz = -Math.sin(a.yaw);
                if (S.remT <= 0) {
                    S.remT = 0.035;
                    for (const w of auto.wielen) if (!w.voor) zetRem(a.x + lx * w.x + fx * w.z, a.z + lz * w.x + fz * w.z, Math.atan2(a.vx, a.vz));
                }
                if (S.rookT <= 0) {
                    S.rookT = 0.06;
                    for (const w of auto.wielen) if (!w.voor) zetRook(a.x + lx * w.x + fx * w.z, a.z + lz * w.x + fz * w.z, a.vx, a.vz);
                }
            }
            audioUpdate(slip ? DRIFT.klem(Math.abs(a.vl) / 8, 0.2, 1) : 0);
            // HUD
            tekst('dr-punten', String(Math.floor(S.ronde.score)));
            tekst('dr-tijd', String(Math.ceil(S.ronde.tijd)));
            tekst('dr-kmh', Math.round(a.speed * 3.6) + ' km/u');
            const r = S.ronde;
            const k = $('dr-ketting');
            if (k) { const t = r.ketting > 0 ? `DRIFT x${r.mult}   ${Math.round(r.ketting)}` : ''; if (S.laatsteTekst.k !== t) { S.laatsteTekst.k = t; k.textContent = t; } }
        }
        for (const r of rook) if (r.leven > 0) {
            r.leven -= dt; const p = 1 - Math.max(0, r.leven) / 0.9;
            r.sp.position.x += r.vx * dt; r.sp.position.z += r.vz * dt; r.sp.position.y += dt * 0.8;
            r.sp.scale.setScalar(0.8 + p * 2.6); r.sp.material.opacity = 0.55 * (1 - p);
            if (r.leven <= 0) r.sp.visible = false;
        }
        S.kegels.forEach((k, i) => { const o = S.kegelObj[i]; if (!o) return; o.position.set(k.x, k.omlaag ? Math.sin(k.tilt) * 0.25 : 0, k.z); if (k.omlaag) { o.rotation.y = k.richting; o.rotation.x = k.tilt; } else { o.rotation.set(0, 0, 0); } });
        renderer.render(scene, camera);
    }
    function lus(t) {
        S.raf = requestAnimationFrame(lus);
        const nu = t / 1000, dt = Math.min(0.05, Math.max(0.001, nu - (S.vorige || nu - 0.016))); S.vorige = nu;
        if (S.fase === 'rijden' || S.fase === 'aftellen') {
            S.rest += dt; let n = 0;
            while (S.rest >= DT && n < 6 && (S.fase === 'rijden' || S.fase === 'aftellen')) { stapSim(DT); S.rest -= DT; n++; }
        }
        teken(dt);
    }

    // ---------- bediening ----------
    const toets = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'rem', KeyS: 'rem', Space: 'hand', ShiftLeft: 'hand' };
    const onKey = (e, aan) => {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        const k = toets[e.code];
        if (S.fase === 'garage' && aan) {
            if (e.code === 'ArrowLeft') { kiesAuto(S.keuze - 1); e.preventDefault(); return; }
            if (e.code === 'ArrowRight') { kiesAuto(S.keuze + 1); e.preventDefault(); return; }
            if (e.code === 'Enter') { startRit(); e.preventDefault(); return; }
        }
        if (S.fase === 'klaar' && aan && e.code === 'Enter') { startRit(); e.preventDefault(); return; }
        if (aan && e.code === 'Escape' && S.fase !== 'garage') { naarGarage(); return; }
        if (k && (S.fase === 'rijden' || S.fase === 'aftellen' || !aan)) { knop[k] = aan; e.preventDefault(); }
        else if (k && aan && S.fase !== 'garage') e.preventDefault();
    };
    const kd = e => onKey(e, true), ku = e => onKey(e, false);
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    scherm.querySelectorAll('.dr-touch [data-k]').forEach(b => {
        const zet = aan => e => { e.preventDefault(); knop[b.dataset.k] = aan; if (aan && b.setPointerCapture) { try { b.setPointerCapture(e.pointerId); } catch (x) {} } b.classList.toggle('aan', aan); };
        b.addEventListener('pointerdown', zet(true));
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => b.addEventListener(n, zet(false)));
        b.addEventListener('contextmenu', e => e.preventDefault());
    });
    $('dr-autogas').onclick = () => { S.autoGas = !S.autoGas; $('dr-autogas').textContent = 'Auto-gas: ' + (S.autoGas ? 'aan' : 'uit'); };
    $('dr-autogas').textContent = 'Auto-gas: ' + (S.autoGas ? 'aan' : 'uit');
    $('dr-geluid').onclick = () => { S.stil = !S.stil; opslag.set('mieters.drift.stil', S.stil ? '1' : '0'); geluidKnop(); audioUpdate(0); };
    geluidKnop();
    $('dr-vol').onclick = () => {
        try {
            if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            else (scherm.requestFullscreen || scherm.webkitRequestFullscreen).call(scherm);
        } catch (e) {}
    };
    const pas = () => { const w = scherm.clientWidth, h = scherm.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = window.ResizeObserver ? new ResizeObserver(pas) : null;
    if (ro) ro.observe(scherm); else window.addEventListener('resize', pas);
    pas();

    cleanup.push(() => {
        cancelAnimationFrame(S.raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
        window.removeEventListener('resize', pas); if (ro) ro.disconnect();
        try { if (S.audio) S.audio.ctx.close(); } catch (e) {}
        try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {}
        S.laadNr = -1; S.fase = 'weg';
        try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    });

    // ---------- starten ----------
    (async () => {
        S.beste = Math.max(+opslag.get(sleutelBest) || 0, 0);
        if (me) {
            const { data } = await sb.from('highscores').select('score').eq('game', 'drift').eq('user_id', me.id).maybeSingle();
            if (data) S.beste = Math.max(S.beste, data.score);
            opslag.set(sleutelBest, String(S.beste));
        }
        const bewaard = opslag.get('mieters.drift.auto'), i = CARS.findIndex(c => c.id === bewaard);
        S.keuze = i >= 0 && open(i) ? i : 0;
        $('dr-laad').hidden = true;
        S.a = null;
        await resetKegels();
        await kiesAuto(S.keuze);
        S.raf = requestAnimationFrame(lus);
        CARS.forEach((c, n) => setTimeout(() => laadAuto(c.id), 600 + n * 400));       // de rest alvast op de achtergrond laden
    })();
}