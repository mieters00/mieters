// ---------- Drift (3D): spelregels en natuurkunde ----------
const DRIFT = (() => {
    const RAND = 2.0;        // zo ver (m) van de rand botst het midden van de auto
    const RONDE = 90;        // seconden per rit
    // prijs = munten die de auto kost, latG = hoeveel zijwaartse kracht de banden aankunnen voordat de auto gaat onderstuuren
    const CARS = [
        { id: 'sedan', naam: 'Stadsauto', prijs: 0, latG: 15, maxSpeed: 25, accel: 10.5, grip: 7.0, hbGrip: 2.8, steer: 2.1, over: 0.24, tekst: 'Makkelijk te besturen. Hier begin je mee.' },
        { id: 'hatchback-sports', naam: 'Sporthatchback', prijs: 300, latG: 16, maxSpeed: 27, accel: 12, grip: 6.8, hbGrip: 2.6, steer: 2.2, over: 0.28, tekst: 'Klein en wendbaar, glijdt snel weg.' },
        { id: 'taxi', naam: 'Taxi', prijs: 600, latG: 16, maxSpeed: 26, accel: 11.5, grip: 6.6, hbGrip: 2.6, steer: 2.1, over: 0.3, tekst: 'Stabiel en voorspelbaar.' },
        { id: 'sedan-sports', naam: 'Sportsedan', prijs: 1000, latG: 18, maxSpeed: 30, accel: 13.5, grip: 6.4, hbGrip: 2.4, steer: 2.2, over: 0.32, tekst: 'Snel, met een achterkant die graag uitbreekt.' },
        { id: 'police', naam: 'Politieauto', prijs: 1500, latG: 18, maxSpeed: 31, accel: 14, grip: 6.3, hbGrip: 2.4, steer: 2.2, over: 0.34, tekst: 'Veel vermogen en een lange drift.' },
        { id: 'suv', naam: 'SUV', prijs: 2000, latG: 16, maxSpeed: 28, accel: 12.5, grip: 6.0, hbGrip: 2.2, steer: 1.8, over: 0.36, tekst: 'Zwaar: draait traag, maar blijft lang glijden.' },
        { id: 'firetruck', naam: 'Brandweerwagen', prijs: 2600, latG: 13, maxSpeed: 26, accel: 10, grip: 5.4, hbGrip: 2.0, steer: 1.6, over: 0.42, tekst: 'Groot, lomp en grappig om mee te slippen.' },
        { id: 'race', naam: 'Racewagen', prijs: 3500, latG: 22, maxSpeed: 36, accel: 17, grip: 7.4, hbGrip: 2.4, steer: 2.4, over: 0.32, tekst: 'Heel snel en direct. Voor ervaren drifters.' },
        { id: 'race-future', naam: 'Toekomstauto', prijs: 5000, latG: 25, maxSpeed: 40, accel: 20, grip: 7.0, hbGrip: 2.3, steer: 2.6, over: 0.42, tekst: 'De snelste van allemaal.' },
    ];
    const klem = (v, a, b) => Math.max(a, Math.min(b, v));

    function nieuwAuto(c, start) {
        return { c, x: start.x, z: start.z, yaw: start.yaw, vx: 0, vz: 0, yr: 0, steerV: 0, speed: 0, vf: 0, vl: 0, ang: 0, acc: 0, lading: 0, boostT: 0, uitDrift: 0 };
    }

    const maakKegels = kaart => kaart.kegelPlekken.map(p => ({ x: p.x, z: p.z, vx: 0, vz: 0, omlaag: false, tilt: 0, richting: 0 }));

    // Eén tijdstapje. inp = { steer: -1..1 (links = +1), gas, brake, hand }
    function stap(a, inp, dt, kegels, kaart) {
        const c = a.c, ev = { muur: 0, kegels: 0, boost: 0 };
        a.steerV += (inp.steer - a.steerV) * Math.min(1, 9 * dt);
        const boost = a.boostT > 0, hb = inp.hand ? 1 : 0, gas = (inp.gas || boost) ? 1 : 0;
        const maxS = c.maxSpeed * (boost ? 1.35 : 1), acc = c.accel * (boost ? 2.2 : 1);
        const v0 = Math.hypot(a.vx, a.vz);
        const vf0 = a.vx * Math.sin(a.yaw) + a.vz * Math.cos(a.yaw);

        // draaien: stilstaand kun je niet sturen, snel iets minder scherp, achteruit omgekeerd, handrem helpt
        let doel = a.steerV * c.steer * klem(v0 / 4, 0, 1) / (1 + v0 / 45);
        if (vf0 < -0.5) doel = -doel;
        if (hb) doel *= 1.15;
        const yrMax = (c.latG / Math.max(v0, 3)) * (hb ? 1.7 : 1 + 2.4 * c.over * gas * Math.abs(a.steerV));
        doel = klem(doel, -yrMax, yrMax);
        a.yr += (doel - a.yr) * Math.min(1, (hb ? 5 : 8) * dt);
        a.yaw += a.yr * dt;

        // snelheid ontbinden in vooruit (vf) en opzij (vl) ten opzichte van de nieuwe stand van de auto
        const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), lx = Math.cos(a.yaw), lz = -Math.sin(a.yaw);
        let vf = a.vx * fx + a.vz * fz, vl = a.vx * lx + a.vz * lz;
        const vfVoor = vf;

        if (gas) vf += acc * (1 - klem(vf / maxS, 0, 1)) * dt;
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

        // rand en obstakels: terugduwen en afkaatsen
        const botst = (nx, nz, diep) => {
            a.x -= nx * diep; a.z -= nz * diep;
            const vn = a.vx * nx + a.vz * nz;
            if (vn > 0) { a.vx -= 1.3 * vn * nx; a.vz -= 1.3 * vn * nz; a.vx *= 0.85; a.vz *= 0.85; if (vn > 3) ev.muur = Math.max(ev.muur, vn); }
        };
        const g = kaart.grens(a.x, a.z);
        if (g.d > -RAND) botst(g.nx, g.nz, g.d + RAND);
        for (const o of kaart.obstakels) {
            const dx = a.x - o.x, dz = a.z - o.z, dd = Math.hypot(dx, dz), min = o.r + 1.8;
            if (dd < min) botst(-dx / (dd || 1), -dz / (dd || 1), min - dd);
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
        // drift-boost: tijdens een drift laad je op, als de drift stopt krijg je een zetje
        if (a.boostT > 0) a.boostT = Math.max(0, a.boostT - dt);
        if (a.speed > 7 && a.vf > 2 && a.ang > 0.26 && a.ang < 1.48) { a.lading = Math.min(1, a.lading + dt * 0.45); a.uitDrift = 0; }
        else {
            a.uitDrift += dt;
            if (a.uitDrift > 0.2) { if (a.lading >= 0.25) { a.boostT = 0.5 + a.lading * 1.6; ev.boost = a.boostT; } a.lading = 0; }
        }
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
    function nieuweRonde(tijd = RONDE) { return { tijd, score: 0, ketting: 0, kettingTijd: 0, genade: 0, mult: 1, kegels: 0, langste: 0 }; }
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

    // ---------- kaarten ----------
    // sleutel = de naam waaronder de scores in de database staan (elke kaart heeft zijn eigen Top 10)
    const KAARTEN = [
        { id: 'veld', naam: 'Parkeerplaats', sleutel: 'drift', modus: 'drift', type: 'cirkel', R: 70, tekst: 'Vrij driften op een groot rond veld met kegels. Punten voor lange, schuine drifts.' },
        { id: 'industrie', naam: 'Industrieterrein', sleutel: 'drift-industrie', modus: 'drift', type: 'rechthoek', hx: 85, hz: 55, r: 28, tekst: 'Vrij driften tussen olietanks en kegels. Punten voor lange, schuine drifts.' },
        { id: 'stad', naam: 'Stadscircuit', sleutel: 'stad', modus: 'race', ronden: 3, medailles: [95000, 115000, 140000], type: 'baan', breedte: 20, punten: [[-100, -70], [-20, -70], [60, -70], [100, -62], [122, -35], [122, 5], [105, 35], [75, 48], [40, 45], [20, 25], [0, 10], [-25, 18], [-45, 40], [-70, 62], [-105, 60], [-130, 35], [-135, -10], [-125, -45]], tekst: 'Race 3 ronden: een lange rechte start, ruime bochten en een slinger in het midden.' },
        { id: 'berg', naam: 'Bergcircuit', sleutel: 'berg', modus: 'race', ronden: 3, medailles: [100000, 120000, 145000], type: 'baan', breedte: 16, punten: [[-90, -50], [-30, -55], [30, -45], [74, -18], [100, 14], [108, 46], [84, 72], [44, 66], [18, 46], [0, 18], [-20, -6], [-46, 8], [-66, 36], [-92, 66], [-126, 52], [-134, 10], [-114, -22], [-98, -40]], tekst: 'Race 3 ronden: smal en kronkelig met scherpe haarspeldbochten. Met drift houd je snelheid.' },
        { id: 'speedway', naam: 'Speedway', sleutel: 'speedway', modus: 'race', ronden: 3, medailles: [95000, 115000, 140000], type: 'baan', breedte: 24, punten: (() => { const p = []; for (let i = 0; i < 18; i++) { const t = (i / 18) * 2 * Math.PI; let z = 70 * Math.sin(t); if (i === 5) z += 12; if (i === 6) z -= 12; if (i === 7) z += 4.8; p.push([150 * Math.cos(t), z]); } return p; })(), tekst: 'Race 3 ronden: een supersnel ovaal met een chicane. Hier haal je de hoogste snelheid.' },
    ];
    // zet een gesloten lijn om in punten met gelijke onderlinge afstand, plus de rijrichting (tx, tz)
    function herbemonster(p, afstand) {
        const n = p.length, lengte = [0];
        for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; lengte.push(lengte[i] + Math.hypot(b.x - a.x, b.z - a.z)); }
        const totaal = lengte[n], m = Math.max(8, Math.round(totaal / afstand)), uit = [];
        let j = 0;
        for (let i = 0; i < m; i++) {
            const s = (i * totaal) / m;
            while (j < n - 1 && lengte[j + 1] < s) j++;
            const a = p[j], b = p[(j + 1) % n], f = (s - lengte[j]) / (lengte[j + 1] - lengte[j] || 1);
            uit.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
        }
        for (let i = 0; i < m; i++) { const a = uit[i], b = uit[(i + 1) % m], l = Math.hypot(b.x - a.x, b.z - a.z) || 1; a.tx = (b.x - a.x) / l; a.tz = (b.z - a.z) / l; }
        return uit;
    }
    // gladde gesloten lijn door controlepunten (Catmull-Rom)
    function spline(pts, per = 16) {
        const n = pts.length, uit = [];
        const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return ['x', 'z'].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)); };
        for (let i = 0; i < n; i++) for (let j = 0; j < per; j++) { const q = cr(pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n], j / per); uit.push({ x: q[0], z: q[1] }); }
        return uit;
    }
    function afgerondeRechthoek(hx, hz, r, stappen = 14) {
        const p = [];
        [[hx - r, hz - r, 0], [-(hx - r), hz - r, 90], [-(hx - r), -(hz - r), 180], [hx - r, -(hz - r), 270]].forEach(([cx, cz, g0]) => {
            for (let i = 0; i <= stappen; i++) { const t = ((g0 + (90 * i) / stappen) * Math.PI) / 180; p.push({ x: cx + r * Math.cos(t), z: cz + r * Math.sin(t) }); }
        });
        return p;
    }
    function maakKaart(def) {
        const k = { def, id: def.id, modus: def.modus, naam: def.naam, sleutel: def.sleutel, tekst: def.tekst, type: def.type, obstakels: [], kegelPlekken: [], muren: [], omtrek: null, midden: null, breedte: def.breedte || 0, straal: 0, start: { x: 0, z: 0, yaw: 0 } };
        const res = { d: 0, nx: 1, nz: 0 };
        const ring = (n, r, off, cx = 0, cz = 0) => { for (let i = 0; i < n; i++) { const t = off + (i / n) * Math.PI * 2; k.kegelPlekken.push({ x: cx + Math.cos(t) * r, z: cz + Math.sin(t) * r }); } };
        if (def.type === 'cirkel') {
            k.grens = (x, z) => { const r = Math.hypot(x, z) || 1e-9; res.d = r - def.R; res.nx = x / r; res.nz = z / r; return res; };
            k.omtrek = Array.from({ length: 96 }, (_, i) => ({ x: Math.cos((i / 96) * 6.2832) * def.R, z: Math.sin((i / 96) * 6.2832) * def.R }));
            k.muren = [herbemonster(Array.from({ length: 180 }, (_, i) => ({ x: Math.cos((i / 180) * 6.2832) * (def.R + 0.4), z: Math.sin((i / 180) * 6.2832) * (def.R + 0.4) })), 6.6)];
            k.straal = def.R; k.start = { x: 0, z: -32, yaw: Math.PI / 2 };
            ring(24, 48, 0.1); ring(12, 20, 0.4);
        } else if (def.type === 'rechthoek') {
            const { hx, hz, r } = def;
            k.grens = (x, z) => {
                const qx = Math.abs(x) - (hx - r), qz = Math.abs(z) - (hz - r), ox = Math.max(qx, 0), oz = Math.max(qz, 0), buiten = Math.hypot(ox, oz);
                res.d = buiten + Math.min(Math.max(qx, qz), 0) - r;
                if (buiten > 1e-9) { res.nx = Math.sign(x || 1) * (ox / buiten); res.nz = Math.sign(z || 1) * (oz / buiten); }
                else if (qx > qz) { res.nx = Math.sign(x || 1); res.nz = 0; } else { res.nx = 0; res.nz = Math.sign(z || 1); }
                return res;
            };
            k.omtrek = afgerondeRechthoek(hx, hz, r);
            k.muren = [herbemonster(afgerondeRechthoek(hx + 0.4, hz + 0.4, r + 0.4, 24), 6.6)];
            k.straal = Math.hypot(hx, hz); k.start = { x: -60, z: -38, yaw: Math.PI / 2 };
            k.obstakels = [{ x: 0, z: 0, r: 6 }, { x: -50, z: 26, r: 4 }, { x: 50, z: 26, r: 4 }, { x: 52, z: -24, r: 4 }, { x: -22, z: 36, r: 3.5 }];
            for (let x = -60; x <= 60; x += 15) k.kegelPlekken.push({ x, z: -22 });
            for (let x = -52; x <= 68; x += 15) k.kegelPlekken.push({ x, z: 14 });
            ring(10, 17, 0.2);
            k.kegelPlekken = k.kegelPlekken.filter(p => k.grens(p.x, p.z).d < -6 && k.obstakels.every(o => Math.hypot(p.x - o.x, p.z - o.z) > o.r + 3) && Math.hypot(p.x - k.start.x, p.z - k.start.z) > 8);
        } else {
            const mid = herbemonster(spline(def.punten.map(([x, z]) => ({ x, z }))), 3), n = mid.length, h = def.breedte / 2;
            k.midden = mid;
            k.grens = (x, z) => {
                let beste = 1e18, qx = 0, qz = 0, bi = 0;
                for (let i = 0; i < n; i++) {
                    const a = mid[i], b = mid[(i + 1) % n], sx = b.x - a.x, sz = b.z - a.z, l2 = sx * sx + sz * sz || 1;
                    const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / l2)), px = a.x + sx * t, pz = a.z + sz * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
                    if (d2 < beste) { beste = d2; qx = px; qz = pz; bi = i; }
                }
                const d = Math.sqrt(beste);
                res.d = d - h;
                if (d > 1e-6) { res.nx = (x - qx) / d; res.nz = (z - qz) / d; } else { res.nx = mid[bi].tz; res.nz = -mid[bi].tx; }
                return res;
            };
            const kant = o => herbemonster(mid.map(p => ({ x: p.x + p.tz * o, z: p.z - p.tx * o })), 6.6);
            k.muren = [kant(h + 0.4), kant(-(h + 0.4))];
            k.straal = Math.max(...mid.map(p => Math.hypot(p.x, p.z))) + h;
            k.start = { x: mid[0].x, z: mid[0].z, yaw: Math.atan2(mid[0].tx, mid[0].tz) };
            // kegels aan de binnenkant van de scherpste bochten
            const kr = mid.map((_, i) => { const a = mid[(i - 4 + n) % n], b = mid[(i + 4) % n]; return Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz)); });
            const top = Math.max(...kr);
            for (let i = 0; i < n && def.modus !== 'race'; i++) {
                let piek = kr[i] > top * 0.55;
                for (let d = -10; d <= 10 && piek; d++) if (kr[(i + d + n) % n] > kr[i]) piek = false;
                if (!piek || Math.min(i, n - i) < 14) continue;
                const a = mid[(i - 4 + n) % n], b = mid[(i + 4) % n], links = (b.tx - a.tx) * mid[i].tz - (b.tz - a.tz) * mid[i].tx > 0 ? 1 : -1;
                for (const v of [-3, 0, 3]) { const p = mid[(i + v + n) % n]; k.kegelPlekken.push({ x: p.x + p.tz * links * (h - 3.5), z: p.z - p.tx * links * (h - 3.5) }); }
            }
        }
        return k;
    }
    // ---------- race ----------
    function nieuweRace(kaart) { return { n: kaart.midden.length, ronden: kaart.def.ronden || 3, idx: 0, vg: 0, tijd: 0, rondeStart: 0, rondes: [], klaar: false }; }
    // volgt waar de auto op de baan is (de baan is gesloten door de muren, dus afsnijden kan niet) en telt de ronden
    function raceStap(r, a, kaart, dt) {
        const mid = kaart.midden, n = r.n, uit = [];
        r.tijd += dt;
        let bi = r.idx, bd = 1e18;
        for (let o = -8; o <= 14; o++) { const i = (r.idx + o + n) % n, dx = mid[i].x - a.x, dz = mid[i].z - a.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
        let st = bi - r.idx; if (st > n / 2) st -= n; if (st < -n / 2) st += n;
        r.vg += st; r.idx = bi;
        const voltooid = Math.floor(r.vg / n);
        if (voltooid > r.rondes.length && voltooid <= r.ronden) {
            const t = r.tijd - r.rondeStart; r.rondes.push(t); r.rondeStart = r.tijd;
            uit.push({ t: 'ronde', nr: voltooid, tijd: t });
            if (voltooid >= r.ronden) { r.klaar = true; uit.push({ t: 'finish', tijd: r.tijd }); }
        }
        return uit;
    }
    return { RAND, RONDE, CARS, KAARTEN, spline, nieuweRace, raceStap, maakKaart, herbemonster, nieuwAuto, maakKegels, stap, stapKegels, nieuweRonde, tel, klem };
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
                <div class="dr-blok"><small id="dr-l1">Punten</small><b id="dr-punten">0</b></div>
                <div class="dr-blok"><small>Tijd</small><b id="dr-tijd">90</b></div>
                <div class="dr-blok"><small>Snelheid</small><b id="dr-kmh">0</b></div>
            </div>
            <div class="dr-ketting" id="dr-ketting"></div>
            <div class="dr-boost" id="dr-boost" hidden><i id="dr-boostbalk"></i><span>BOOST</span></div>
            <div class="dr-popup" id="dr-popup"></div>
            <div class="dr-menu" id="dr-menu" hidden></div>
            <div class="dr-hoek"><button class="dr-mini" id="dr-geluid" title="Geluid">&#128266;</button><button class="dr-mini" id="dr-vol" title="Volledig scherm">&#9974;</button></div>
            <div class="dr-touch" id="dr-touch" hidden>
                <div class="dr-groep"><button data-k="L">&#9664;</button><button data-k="R">&#9654;</button></div>
                <div class="dr-groep"><button data-k="hand" class="klein">DRIFT</button><button data-k="rem" class="klein">REM</button><button data-k="gas" class="groot">GAS</button></div>
                <button class="dr-mini dr-autogas" id="dr-autogas">Auto-gas: aan</button>
            </div>
        </div>
        <p class="intro dr-uitleg">Pijltjes of W, A, S en D: sturen en gas &middot; <b>Spatie: handrem</b> &middot; Esc: terug naar de garage. <b>Drift om je boost op te laden:</b> laat je de drift los, dan krijg je een zetje. Rij je een race, dan telt je snelste tijd. Met elke rit verdien je munten, en daarmee koop je nieuwe auto's. Auto's: Kenney.nl (CC0).</p></div>`;
    try { await driftLaadThree(); } catch (e) { if ($('dr-laad')) $('dr-laad').textContent = 'Het 3D-spel kon niet worden geladen. Controleer je internet en probeer het opnieuw.'; return; }
    if (!$('dr-canvas')) return;                    // je was al weggegaan
    driftBouw();
}

function driftBouw() {
    const { CARS, KAARTEN } = DRIFT, DT = 1 / 90;
    const scherm = $('dr-scherm'), canvas = $('dr-canvas');
    const kleur = h => new THREE.Color(h).convertSRGBToLinear();     // kleuren zoals ze er op het scherm uit moeten zien
    const opslag = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
    const sleutelBest = k => 'mieters.drift.best.' + k + '.' + (me ? me.id : 'gast');

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

    // ---------- de wereld (wordt per kaart opgebouwd) ----------
    const lam = h => new THREE.MeshLambertMaterial({ color: kleur(h) });
    const dubbel = h => { const m = lam(h); m.side = THREE.DoubleSide; return m; };
    const gras = new THREE.Mesh(new THREE.CircleGeometry(450, 48), lam(0x4f9a49)); gras.rotation.x = -Math.PI / 2; gras.position.y = -0.06; scene.add(gras);
    const wereld = new THREE.Group(); scene.add(wereld);
    const dummy = new THREE.Object3D();
    function wisWereld() {
        for (const o of [...wereld.children]) { wereld.remove(o); o.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); }); }
    }
    function bouwWereld(k) {
        wisWereld();
        const plat = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; wereld.add(m); return m; };
        // een strook langs de middenlijn van een baan: offset = zijwaartse verschuiving, halve = halve breedte
        const lint = (mid, offset, halve, y, mat) => {
            const n = mid.length, pos = new Float32Array(n * 6), idx = [];
            mid.forEach((p, i) => {
                const nx = p.tz, nz = -p.tx;
                pos.set([p.x + nx * (offset + halve), y, p.z + nz * (offset + halve), p.x + nx * (offset - halve), y, p.z + nz * (offset - halve)], i * 6);
            });
            for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
            const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
            wereld.add(new THREE.Mesh(geo, mat));
        };
        const ringlijn = (r1, r2, h) => plat(new THREE.RingGeometry(r1, r2, 96), new THREE.MeshBasicMaterial({ color: kleur(h) }), 0.02);
        const startlijn = (x, z, tx, tz, breedte) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(breedte, 1.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: kleur(0xffffff) }));
            m.position.set(x, 0.04, z); m.rotation.y = Math.atan2(tx, tz); wereld.add(m);
        };
        if (k.type === 'baan') {
            lint(k.midden, 0, k.breedte / 2, 0.01, dubbel(0x3c4046));
            const witM = new THREE.MeshBasicMaterial({ color: kleur(0xffffff), side: THREE.DoubleSide });
            lint(k.midden, k.breedte / 2 - 1, 0.18, 0.03, witM); lint(k.midden, -(k.breedte / 2 - 1), 0.18, 0.03, witM);
            startlijn(k.midden[0].x, k.midden[0].z, k.midden[0].tx, k.midden[0].tz, k.breedte);
            if (k.def.modus === 'race') {      // start- en finishpoort
                const p0 = k.midden[0], nx = p0.tz, nz = -p0.tx, yaw = Math.atan2(p0.tx, p0.tz), rand = k.breedte / 2 + 1.2;
                for (const z of [-1, 1]) { const paal = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 7, 10), lam(0xd8342c)); paal.position.set(p0.x + nx * rand * z, 3.5, p0.z + nz * rand * z); wereld.add(paal); }
                const balk = new THREE.Mesh(new THREE.BoxGeometry(k.breedte + 3, 1.1, 0.7), lam(0xffffff)); balk.position.set(p0.x, 7, p0.z); balk.rotation.y = yaw; wereld.add(balk);
                const band = new THREE.Mesh(new THREE.BoxGeometry(k.breedte + 3.02, 0.35, 0.72), lam(0x111111)); band.position.set(p0.x, 7, p0.z); band.rotation.y = yaw; wereld.add(band);
            }
        } else {
            plat(new THREE.ShapeGeometry(new THREE.Shape(k.omtrek.map(p => new THREE.Vector2(p.x, -p.z)))), lam(k.type === 'rechthoek' ? 0x5b5f64 : 0x3c4046), 0);
            if (k.type === 'cirkel') {
                ringlijn(k.def.R - 6.4, k.def.R - 6, 0xffffff); ringlijn(19.8, 20.2, 0xffd84a); ringlijn(47.8, 48.2, 0xffd84a);
                startlijn(0, -34, 0, 1, 28);
            } else {
                startlijn(k.start.x, k.start.z, 0, 1, 12);
                const geel = new THREE.MeshBasicMaterial({ color: kleur(0xffd84a) });
                for (const z of [-22, 14]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(k.def.hx * 2 - 24, 0.3).rotateX(-Math.PI / 2), geel); l.position.set(0, 0.03, z + 5); wereld.add(l); }
            }
        }
        // olietanks
        for (const o of k.obstakels) {
            const tank = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 7, 28), lam(0xdfe3e6)); tank.position.set(o.x, 3.5, o.z); wereld.add(tank);
            const band = new THREE.Mesh(new THREE.CylinderGeometry(o.r + 0.05, o.r + 0.05, 1, 28), lam(0xd8342c)); band.position.set(o.x, 3, o.z); wereld.add(band);
            const dop = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.8, o.r, 0.8, 28), lam(0x8b9298)); dop.position.set(o.x, 7.3, o.z); wereld.add(dop);
        }
        // muurblokken langs de rand: rood en wit
        const blokken = k.muren.flat(), muur = new THREE.InstancedMesh(new THREE.BoxGeometry(6.8, 0.9, 1.2), lam(0xffffff), blokken.length);
        blokken.forEach((p, i) => {
            dummy.position.set(p.x, 0.45, p.z); dummy.rotation.set(0, Math.atan2(-p.tz, p.tx), 0); dummy.updateMatrix();
            muur.setMatrixAt(i, dummy.matrix); muur.setColorAt(i, kleur(i % 2 ? 0xffffff : 0xd8342c));
        });
        muur.instanceMatrix.needsUpdate = true; muur.instanceColor.needsUpdate = true; wereld.add(muur);
        // bomen buiten de kaart
        let zaad = 7; const rnd = () => (zaad = (zaad * 16807) % 2147483647) / 2147483647;
        const bomen = 110, kruin = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 6, 8), lam(0x2f7d3a), bomen), stam = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 6), lam(0x6b4a2b), bomen);
        dummy.rotation.set(0, 0, 0);
        for (let i = 0; i < bomen; i++) {
            const t = rnd() * Math.PI * 2, r = k.straal + 14 + rnd() * 110, sc = 0.8 + rnd() * 0.9;
            dummy.scale.setScalar(sc);
            dummy.position.set(Math.cos(t) * r, 5 * sc, Math.sin(t) * r); dummy.updateMatrix(); kruin.setMatrixAt(i, dummy.matrix);
            dummy.position.set(Math.cos(t) * r, 1 * sc, Math.sin(t) * r); dummy.updateMatrix(); stam.setMatrixAt(i, dummy.matrix);
        }
        dummy.scale.setScalar(1); wereld.add(kruin); wereld.add(stam);
    }

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
        fase: 'garage', keuze: 0, kaartNr: 0, kaart: null, besten: {}, tijden: {}, autos: ['sedan'], munten: 0, serverOk: false, status: '', modus: 'drift', race: null, auto: null, a: null, ronde: null, kegels: [], kegelObj: [], rest: 0, aftel: 0, vorige: 0, raf: 0, laadNr: 0,
        camYaw: Math.PI / 2, camPos: new THREE.Vector3(), garageHoek: 0.6, shake: 0, remT: 0, rookT: 0, stil: opslag.get('mieters.drift.stil') === '1',
        autoGas: ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches), touch: false, laden: false, audio: null, popT: 0, laatsteTekst: {},
    };
    S.touch = S.autoGas;
    const knop = { L: false, R: false, gas: false, rem: false, hand: false };
    const invoer = () => ({ steer: (knop.L ? 1 : 0) - (knop.R ? 1 : 0), gas: knop.gas || (S.autoGas && S.fase === 'rijden'), brake: knop.rem, hand: knop.hand });
    const eigen = i => S.autos.includes(CARS[i].id);
    const fmt = t => { const m = Math.floor(t / 60), x = t - m * 60; return m + ':' + (x < 10 ? '0' : '') + x.toFixed(2); };
    const tekst = (id, t) => { const e = $(id); if (e && S.laatsteTekst[id] !== t) { S.laatsteTekst[id] = t; e.textContent = t; } };
    const popup = (t, klas) => { const e = $('dr-popup'); if (!e) return; e.textContent = t; e.className = 'dr-popup ' + (klas || ''); void e.offsetWidth; e.classList.add('toon'); };

    // kegels
    const resetKegels = async () => {
        S.kegels = DRIFT.maakKegels(S.kaart);
        const sjabloon = await kegelModel;
        if (!$('dr-canvas')) return;
        S.kegelObj.forEach(o => scene.remove(o)); S.kegelObj = [];
        for (const k of S.kegels) { const o = sjabloon.clone(true); o.rotation.order = 'YXZ'; o.position.set(k.x, 0, k.z); scene.add(o); S.kegelObj.push(o); }
    };

    // ---------- Top 10 ----------
    async function laadTijden(k) {
        const el = $('scores'); if (!el) return;
        const { data } = await sb.from('race_tijden').select('tijd_ms,ronde_ms,profiles(username,avatar)').eq('baan', k.sleutel).order('tijd_ms', { ascending: true }).limit(10);
        if (!$('scores')) return;
        el.innerHTML = `<h3>Top 10 - ${esc(k.naam)}</h3>` + ((data || []).length
            ? data.map((r, i) => `<div class="score-rij">${avatar(r.profiles || {}, 22)}<span>${i + 1}. ${esc(r.profiles && r.profiles.username)}</span><span class="punten">${fmt(r.tijd_ms / 1000)}</span></div>`).join('')
            : '<p class="leeg">Nog geen tijden. Wees de eerste!</p>');
    }
    const laadLijst = () => { const k = S.kaart; if (!k) return; if (k.modus === 'race') laadTijden(k); else if ($('scores')) laadScores(k.sleutel); };

    // ---------- kaart kiezen ----------
    const kaartCache = [];
    async function kiesKaart(i) {
        S.kaartNr = ((i % KAARTEN.length) + KAARTEN.length) % KAARTEN.length;
        S.kaart = kaartCache[S.kaartNr] || (kaartCache[S.kaartNr] = DRIFT.maakKaart(KAARTEN[S.kaartNr]));
        opslag.set('mieters.drift.kaart', S.kaart.id);
        S.modus = S.kaart.modus;
        bouwWereld(S.kaart); wisRem();
        laadLijst();
        menu();
        await resetKegels();
    }
    // ---------- garage ----------
    async function kiesAuto(i) {
        S.keuze = ((i % CARS.length) + CARS.length) % CARS.length;
        const mijn = ++S.laadNr;
        S.laden = true; menu();
        const auto = await laadAuto(CARS[S.keuze].id);
        if (mijn !== S.laadNr || !$('dr-canvas')) return;
        if (S.auto) scene.remove(S.auto.groep);
        S.auto = auto; zetSlot(auto, !eigen(S.keuze)); scene.add(auto.groep);
        S.laden = false; menu();
    }
    function balk(label, w) { return `<div class="dr-stat"><span>${label}</span><i><u style="width:${Math.round(DRIFT.klem(w, 0.05, 1) * 100)}%"></u></i></div>`; }
    async function koop() {
        const c = CARS[S.keuze];
        let uit = null;
        try { uit = await sb.rpc('koop_auto', { p_auto: c.id }); } catch (e) { uit = { error: e }; }
        if (!uit || uit.error || !uit.data) { S.status = 'Kopen is niet gelukt.'; menu(); return; }
        S.munten = uit.data.munten; S.autos = uit.data.autos; S.status = 'Gekocht: ' + c.naam + '!';
        if (S.auto) zetSlot(S.auto, false);
        menu();
    }
    function menu() {
        const m = $('dr-menu'); if (!m) return;
        if (S.fase !== 'garage' && S.fase !== 'klaar') { m.hidden = true; return; }
        m.hidden = false;
        if (S.fase === 'klaar') return;           // het resultaatscherm vult het menu zelf
        const c = CARS[S.keuze], mijn = eigen(S.keuze), kk = S.kaart, race = kk.modus === 'race';
        const t = S.tijden[kk.sleutel], kb = S.besten[kk.sleutel] || 0;
        const kopen = mijn ? '' : (me && S.serverOk
            ? `<button class="dr-koop" id="dr-koop" ${S.munten >= c.prijs ? '' : 'disabled'}>${S.munten >= c.prijs ? 'Koop voor ' + c.prijs + ' munten' : 'Nog ' + (c.prijs - S.munten) + ' munten nodig'}</button>`
            : `<span class="dr-slot">&#128274; ${c.prijs} munten</span>`);
        const medailles = race ? `<small class="dr-medailles">&#129351; ${fmt(kk.def.medailles[0] / 1000)} &middot; &#129352; ${fmt(kk.def.medailles[1] / 1000)} &middot; &#129353; ${fmt(kk.def.medailles[2] / 1000)}</small>` : '';
        const beste = race ? (t ? `Jouw beste tijd: <b>${fmt(t.tijd_ms / 1000)}</b>` : 'Nog geen tijd gezet') : `Jouw beste op deze kaart: <b>${kb}</b> punten`;
        m.innerHTML = `<div class="dr-titel">Garage <span class="dr-munten">&#128176; ${S.munten} munten</span></div>
            <div class="dr-rij"><button class="dr-pijl" id="dr-vorige">&#9664;</button>
              <div class="dr-info"><b>${esc(c.naam)}</b> ${kopen}
                <p>${esc(c.tekst)}</p>
                ${balk('Snelheid', c.maxSpeed / 40)}${balk('Optrekken', c.accel / 20)}${balk('Grip', c.latG / 30)}</div>
              <button class="dr-pijl" id="dr-volgende">&#9654;</button></div>
            <div class="dr-lijst">${CARS.map((x, i) => `<button class="dr-chip ${i === S.keuze ? 'actief' : ''} ${eigen(i) ? '' : 'slot'}" data-i="${i}">${eigen(i) ? '' : '&#128274; '}${esc(x.naam)}</button>`).join('')}</div>
            <div class="dr-rij dr-kaartrij"><button class="dr-pijl klein" id="dr-kvorige">&#9664;</button>
              <div class="dr-info"><b>${esc(kk.naam)}</b> <span class="dr-modus">${race ? 'Race, ' + kk.def.ronden + ' ronden' : 'Vrij driften, 90 seconden'}</span><p>${esc(kk.tekst)}</p><small>${beste}</small> ${medailles}</div>
              <button class="dr-pijl klein" id="dr-kvolgende">&#9654;</button></div>
            <button class="dr-start" id="dr-start" ${mijn && !S.laden ? '' : 'disabled'}>${S.laden ? 'Laden...' : mijn ? 'Start (Enter)' : 'Koop deze auto om te rijden'}</button>
            ${S.status ? `<p class="dr-beste">${esc(S.status)}</p>` : ''}`;
        $('dr-kvorige').onclick = () => kiesKaart(S.kaartNr - 1);
        $('dr-kvolgende').onclick = () => kiesKaart(S.kaartNr + 1);
        $('dr-vorige').onclick = () => kiesAuto(S.keuze - 1);
        $('dr-volgende').onclick = () => kiesAuto(S.keuze + 1);
        $('dr-start').onclick = startRit;
        if ($('dr-koop')) $('dr-koop').onclick = koop;
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
        if (!eigen(S.keuze) || S.laden || !S.auto) return;
        audioStart();
        opslag.set('mieters.drift.auto', CARS[S.keuze].id);
        zetSlot(S.auto, false);
        S.modus = S.kaart.modus; const race = S.modus === 'race';
        S.a = DRIFT.nieuwAuto(CARS[S.keuze], S.kaart.start); S.ronde = DRIFT.nieuweRonde(race ? 99999 : undefined);
        S.race = race ? DRIFT.nieuweRace(S.kaart) : null;
        S.aftel = 3.2; S.rest = 0; S.fase = 'aftellen';
        S.camYaw = S.a.yaw; S.camPos.set(0, 0, 0); wisRem(); resetKegels();
        tekst('dr-l1', race ? 'Ronde' : 'Punten');
        $('dr-hud').hidden = false; $('dr-boost').hidden = false; $('dr-touch').hidden = !S.touch; $('dr-ketting').textContent = ''; menu();
    }
    function naarGarage() {
        S.fase = 'garage'; knop.L = knop.R = knop.gas = knop.rem = knop.hand = false;
        $('dr-hud').hidden = true; $('dr-boost').hidden = true; $('dr-touch').hidden = true; $('dr-ketting').textContent = ''; $('dr-popup').className = 'dr-popup';
        audioUpdate(0); kiesAuto(S.keuze);
    }
    const knoppenUit = () => { $('dr-hud').hidden = true; $('dr-boost').hidden = true; $('dr-touch').hidden = true; $('dr-ketting').textContent = ''; };
    // rit op een driftveld afgelopen
    async function klaar() {
        S.fase = 'klaar';
        const r = S.ronde, score = Math.floor(r.score), kaart = S.kaart, oudKaart = S.besten[kaart.sleutel] || 0;
        S.besten[kaart.sleutel] = Math.max(oudKaart, score);
        opslag.set(sleutelBest(kaart.sleutel), String(S.besten[kaart.sleutel]));
        knoppenUit();
        const m = $('dr-menu'); m.hidden = false;
        m.innerHTML = `<div class="dr-titel">Rit afgelopen! <small>${esc(kaart.naam)}</small></div><div class="dr-groot">${score}</div><p>punten</p>
            <p>${score > oudKaart && score > 0 ? '&#127942; <b>Nieuw record op deze kaart!</b>' : 'Jouw beste op deze kaart: <b>' + S.besten[kaart.sleutel] + '</b>'}</p>
            <p class="dr-beste">Kegels omgereden: ${r.kegels} &middot; Langste drift: ${r.langste.toFixed(1)} s</p>
            <p class="dr-beste" id="dr-bewaard">${me ? (score > 0 ? 'Bezig met opslaan...' : '') : 'Log in om punten, munten en een plek in de Top 10 te krijgen.'}</p>
            <div class="dr-rij2"><button class="dr-start" id="dr-opnieuw">Opnieuw</button><button class="dr-start twee" id="dr-garage">Garage</button></div>`;
        $('dr-opnieuw').onclick = startRit; $('dr-garage').onclick = naarGarage;
        if (me && score > 0) {
            let fout = null, bel = null;
            try { ({ error: fout } = await sb.rpc('bewaar_score', { p_game: kaart.sleutel, p_score: score })); } catch (e) { fout = e; }
            try { const r2 = await sb.rpc('drift_beloning', { p_kaart: kaart.sleutel, p_score: score }); if (!r2.error) bel = r2.data; } catch (e) {}
            if (bel) S.munten = bel.munten;
            const t = $('dr-bewaard');
            if (t) t.innerHTML = (bel ? `&#128176; <b>+${bel.erbij} munten</b> (je hebt er nu ${bel.munten}). ` : '') + (fout ? 'Je score kon niet in de Top 10 worden gezet.' : '');
            if (!fout) laadLijst();
        }
    }
    // race afgelopen
    async function klaarRace() {
        S.fase = 'klaar';
        const race = S.race, kaart = S.kaart, tijd = race.tijd, beste = Math.min(...race.rondes), drift = Math.min(60000, Math.floor(S.ronde.score + S.ronde.ketting));
        knoppenUit();
        const m = $('dr-menu'); m.hidden = false;
        m.innerHTML = `<div class="dr-titel">Race afgelopen! <small>${esc(kaart.naam)}</small></div><div class="dr-groot">${fmt(tijd)}</div>
            <p class="dr-beste">Rondes: ${race.rondes.map(fmt).join(' &middot; ')} (snelste ${fmt(beste)}) &middot; Driftpunten: ${drift}</p>
            <p class="dr-beste" id="dr-bewaard">${me ? 'Bezig met opslaan...' : 'Log in om je tijd te bewaren en munten te verdienen.'}</p>
            <div class="dr-rij2"><button class="dr-start" id="dr-opnieuw">Opnieuw</button><button class="dr-start twee" id="dr-garage">Garage</button></div>`;
        $('dr-opnieuw').onclick = startRit; $('dr-garage').onclick = naarGarage;
        if (!me) return;
        let uit = null;
        try { uit = await sb.rpc('race_afronden', { p_baan: kaart.sleutel, p_tijd_ms: Math.round(tijd * 1000), p_ronde_ms: Math.round(beste * 1000), p_drift: drift, p_auto: CARS[S.keuze].id }); } catch (e) { uit = { error: e }; }
        const t = $('dr-bewaard');
        if (!uit || uit.error || !uit.data) { if (t) t.textContent = 'Je tijd en munten konden niet worden opgeslagen.'; return; }
        const d = uit.data;
        S.munten = d.munten;
        if (d.record) S.tijden[kaart.sleutel] = { tijd_ms: Math.round(tijd * 1000), ronde_ms: Math.round(beste * 1000) };
        const medaille = { goud: '&#129351; <b>Goud!</b>', zilver: '&#129352; <b>Zilver!</b>', brons: '&#129353; <b>Brons!</b>' }[d.medaille] || '';
        if (t) t.innerHTML = `${d.record ? '&#127942; <b>Nieuw record op dit circuit!</b> ' : ''}${medaille}<br>&#128176; <b>+${d.erbij} munten</b> (je hebt er nu ${d.munten})`;
        laadLijst();
    }
    function gebeurtenis(u) {
        if (S.modus === 'race') { if (u.t === 'verloren') S.shake = 1; return; }
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
        const ev = DRIFT.stap(S.a, invoer(), dt, S.kegels, S.kaart); DRIFT.stapKegels(S.kegels, dt);
        for (const u of DRIFT.tel(S.ronde, S.a, dt, ev)) gebeurtenis(u);
        if (ev.muur) S.shake = Math.max(S.shake, 0.6);
        if (ev.boost) popup('BOOST!', 'goed');
        if (S.modus === 'race') {
            for (const u of DRIFT.raceStap(S.race, S.a, S.kaart, dt)) {
                if (u.t === 'ronde' && u.nr < S.race.ronden) popup('Ronde ' + u.nr + ': ' + fmt(u.tijd), 'klein');
                if (u.t === 'finish') klaarRace();
            }
        } else if (S.ronde.tijd <= 0) klaar();
    }

    // ---------- tekenen ----------
    const hoekVerschil = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    const vec = new THREE.Vector3(), kijk = new THREE.Vector3();
    function teken(dt) {
        const auto = S.auto, a = S.a;
        if (S.fase === 'garage' || S.fase === 'klaar' || !a) {
            S.garageHoek += dt * 0.6;
            if (auto) { auto.groep.position.set(S.kaart.start.x, 0, S.kaart.start.z); auto.groep.rotation.y = S.garageHoek; auto.binnen.rotation.set(0, 0, 0); }
            camera.fov = 50; camera.updateProjectionMatrix();
            camera.position.set(S.kaart.start.x + 5.5, 2.6, S.kaart.start.z - 8); camera.lookAt(S.kaart.start.x, 0.8, S.kaart.start.z);
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
            camera.fov = 62 + sp * 0.45 + (a.boostT > 0 ? 9 : 0); camera.updateProjectionMatrix();
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
            const r = S.ronde, k = $('dr-ketting');
            if (S.modus === 'race' && S.race) { tekst('dr-punten', Math.min(S.race.ronden, S.race.rondes.length + 1) + '/' + S.race.ronden); tekst('dr-tijd', fmt(S.race.tijd)); }
            else { tekst('dr-punten', String(Math.floor(r.score))); tekst('dr-tijd', String(Math.ceil(r.tijd))); }
            tekst('dr-kmh', Math.round(a.speed * 3.6) + ' km/u');
            if (k) { const t = S.modus === 'drift' && r.ketting > 0 ? `DRIFT x${r.mult}   ${Math.round(r.ketting)}` : ''; if (S.laatsteTekst.k !== t) { S.laatsteTekst.k = t; k.textContent = t; } }
            const bb = $('dr-boostbalk'), bx = $('dr-boost');
            if (bb && bx) {      // boost-balk: vult zich tijdens een drift, en loopt leeg tijdens het boosten
                const actief = a.boostT > 0, pct = Math.round((actief ? Math.min(1, a.boostT / 2.1) : a.lading) * 100), sl = pct + (actief ? 'a' : 'o');
                if (S.laatsteTekst.b !== sl) { S.laatsteTekst.b = sl; bb.style.width = pct + '%'; bx.classList.toggle('actief', actief); }
            }
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
        for (const k of KAARTEN) S.besten[k.sleutel] = Math.max(+opslag.get(sleutelBest(k.sleutel)) || 0, 0);
        if (me) {
            const [hs, st, tj] = await Promise.all([
                sb.from('highscores').select('game,score').eq('user_id', me.id).in('game', KAARTEN.filter(k => k.modus === 'drift').map(k => k.sleutel)),
                sb.rpc('race_status'),
                sb.from('race_tijden').select('baan,tijd_ms,ronde_ms').eq('user_id', me.id),
            ]);
            (hs.data || []).forEach(r => { S.besten[r.game] = Math.max(S.besten[r.game] || 0, r.score); opslag.set(sleutelBest(r.game), String(S.besten[r.game])); });
            if (!st.error && st.data) { S.autos = st.data.autos; S.munten = st.data.munten; S.serverOk = true; }
            else S.status = 'Munten en auto\'s kopen werken nog niet: de database moet nog worden bijgewerkt (race.sql).';
            (tj.data || []).forEach(r => { S.tijden[r.baan] = r; });
        } else S.status = 'Log in om munten te verdienen en auto\'s te kopen.';
        const kid = opslag.get('mieters.drift.kaart'), ki = KAARTEN.findIndex(k => k.id === kid);
        S.kaartNr = ki >= 0 ? ki : 0;
        S.kaart = kaartCache[S.kaartNr] = DRIFT.maakKaart(KAARTEN[S.kaartNr]);
        S.modus = S.kaart.modus;
        bouwWereld(S.kaart);
        laadLijst();
        const bewaard = opslag.get('mieters.drift.auto'), i = CARS.findIndex(c => c.id === bewaard);
        S.keuze = i >= 0 && eigen(i) ? i : 0;
        $('dr-laad').hidden = true;
        S.a = null;
        await resetKegels();
        await kiesAuto(S.keuze);
        S.raf = requestAnimationFrame(lus);
        CARS.forEach((c, n) => setTimeout(() => laadAuto(c.id), 600 + n * 400));       // de rest alvast op de achtergrond laden
    })();
}

function scoreTitel(sleutel) {
    const k = DRIFT.KAARTEN.find(x => x.sleutel === sleutel);
    return k ? 'Top 10 - ' + k.naam : 'Top 10';
}