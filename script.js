// Bienen-Datastory – Frontend
//
// 1. Daten laden: zuerst unload.php, sonst die Musterdaten data/bienenjahre.json
// 2. Kapitel zeichnen: Bestand (Wabe + Diagramm), Frühstück, Regen, Sonne,
//    Temperatur, Schnee, Fazit
// 3. Analysetexte aus den Daten berechnen, damit die Zahlen im Text immer stimmen
// 4. Animationen: Bienenschwarm, Pollenspur, Regen, Sonne, Thermometer, Schnee

const FARBEN = {
    rueckgang: '#c85a28',
    erholung: '#4e8536',
    honig: '#e5a93c',
    regen: '#2b6cb0',
    sonne: '#dd8a20',
    temperatur: '#e53e3e',
    schnee: '#5aa9c9',
    grau: '#a0aec0',
    dunkel: '#1a202c',
};

const bewegungAus = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

// Zahl im Schweizer Format: 269938 -> 269'938
function zahl(wert, stellen = 0) {
    return wert.toLocaleString('de-CH', {
        minimumFractionDigits: stellen,
        maximumFractionDigits: stellen,
    });
}

// Prozent mit Vorzeichen: -5.21 -> −5.2 %
function prozent(wert) {
    if (wert === null || wert === undefined) return '–';
    const zeichen = wert > 0 ? '+' : wert < 0 ? '−' : '±';
    return `${zeichen}${zahl(Math.abs(wert), 1)} %`;
}

function mittelwert(werte) {
    return werte.reduce((summe, w) => summe + w, 0) / werte.length;
}

// Korrelation (Pearson): Zahl zwischen −1 und +1.
// 0 heisst kein Zusammenhang, nahe ±1 heisst starker Zusammenhang.
function korrelation(xs, ys) {
    const paare = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x !== null && y !== null);
    const mx = mittelwert(paare.map((p) => p[0]));
    const my = mittelwert(paare.map((p) => p[1]));
    let zaehler = 0, nx = 0, ny = 0;
    paare.forEach(([x, y]) => {
        zaehler += (x - mx) * (y - my);
        nx += (x - mx) ** 2;
        ny += (y - my) ** 2;
    });
    return zaehler / Math.sqrt(nx * ny);
}

// Kurzform für «der Zusammenhang ist …»
function staerkeKurz(r) {
    const a = Math.abs(r);
    if (a < 0.1) return 'praktisch null';
    if (a < 0.3) return 'schwach';
    if (a < 0.5) return 'mittel';
    return 'stark';
}

function staerke(r) {
    const a = Math.abs(r);
    if (a < 0.1) return 'praktisch kein';
    if (a < 0.3) return 'ein schwacher';
    if (a < 0.5) return 'ein mittlerer';
    return 'ein starker';
}

// Kurze Antwort auf die Kapitelfrage, abgeleitet aus dem Zusammenhangswert
function urteil(r) {
    const a = Math.abs(r);
    if (a < 0.3) return { wort: 'Kaum', klasse: 'kaum' };
    if (a < 0.5) return { wort: 'Teilweise', klasse: 'teilweise' };
    return { wort: 'Deutlich', klasse: 'deutlich' };
}

function farbeFuerPhase(phase) {
    return phase === 'Rückgang' ? FARBEN.rueckgang : FARBEN.erholung;
}

function farbeFuerVeraenderung(wert) {
    if (wert === null) return FARBEN.grau;
    return wert < 0 ? FARBEN.rueckgang : FARBEN.erholung;
}

function phasenMittel(daten, feld) {
    const werte = (phase) => daten.filter((d) => d.phase === phase && d[feld] !== null).map((d) => d[feld]);
    return { rueckgang: mittelwert(werte('Rückgang')), erholung: mittelwert(werte('Erholung')) };
}

// Wert auf 0 bis 1 umrechnen: kleinster Wert = 0, grösster Wert = 1
function normiere(wert, alle) {
    const gueltig = alle.filter((w) => w !== null);
    const min = Math.min(...gueltig);
    const max = Math.max(...gueltig);
    return max === min ? 0.5 : (wert - min) / (max - min);
}

// "A, B und C"
function aufzaehlen(liste, format) {
    const teile = liste.map(format);
    return teile.length > 1 ? `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}` : teile[0];
}

function maxNach(daten, feld) {
    return daten.reduce((max, d) => (d[feld] > max[feld] ? d : max));
}

function minNach(daten, feld) {
    return daten.reduce((min, d) => (d[feld] < min[feld] ? d : min));
}

// Tooltip: Wetterwert plus Entwicklung der Bienen im selben Jahr
function tooltipMitBienen(daten, wetterText) {
    return {
        label: (ctx) => ` ${wetterText(daten[ctx.dataIndex])}`,
        afterLabel: (ctx) => ` Bienen: ${prozent(daten[ctx.dataIndex].veraenderung_prozent)} zum Vorjahr`,
    };
}

// Kasten über dem Diagramm: das gerade gewählte Jahr
function setzeAnzeige(id, d, wetterText) {
    const klasse = d.veraenderung_prozent === null ? '' : d.veraenderung_prozent < 0 ? 'minus' : 'plus';
    document.getElementById(id).innerHTML =
        `<strong>${d.jahr}</strong><span>${wetterText}</span>`
        + `<span class="bienen ${klasse}">🐝 ${prozent(d.veraenderung_prozent)}</span>`;
}

// «Kurz gesagt»-Kasten unter dem Kapiteltitel
function setzeKurz(id, antwort, text) {
    const marke = antwort ? `<span class="urteil ${antwort.klasse}">${antwort.wort}</span>` : '';
    document.getElementById(id).innerHTML = `${marke}<p><b>Kurz gesagt:</b> ${text}</p>`;
}

// ---------------------------------------------------------------------------
// Chart.js: Grundeinstellungen und eigene kleine Plugins
// ---------------------------------------------------------------------------

Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
Chart.defaults.font.size = 13;
Chart.defaults.color = '#4a5568';
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(26, 32, 44, 0.92)';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.titleFont = { weight: 'bold', size: 14 };
Chart.defaults.maintainAspectRatio = false;

// Senkrechte Linie beim gewählten Jahr (Kapitel 1)
const jahrMarker = {
    id: 'jahrMarker',
    afterDatasetsDraw(chart, args, opts) {
        const index = chart.data.labels.indexOf(opts.jahr);
        if (index < 0) return;
        const x = chart.scales.x.getPixelForValue(index);
        const { top, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = 'rgba(26, 32, 44, 0.5)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🐝', x, top + 4);
        ctx.restore();
    },
};

// Waagrechte, gestrichelte Hilfslinien mit Beschriftung (z. B. Durchschnitt)
const hilfslinien = {
    id: 'hilfslinien',
    afterDatasetsDraw(chart, args, opts) {
        const ctx = chart.ctx;
        const { left, right } = chart.chartArea;
        (opts.linien || []).forEach((linie) => {
            const y = chart.scales.y.getPixelForValue(linie.wert);
            const x1 = linie.von === undefined ? left : chart.scales.x.getPixelForValue(linie.von);
            const x2 = linie.bis === undefined ? right : chart.scales.x.getPixelForValue(linie.bis);
            ctx.save();
            ctx.strokeStyle = linie.farbe;
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();
            ctx.setLineDash([]);
            // Beschriftung mit weissem Hintergrund, damit sie lesbar bleibt
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'left';
            const breite = ctx.measureText(linie.text).width;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(x1 + 2, y - 22, breite + 10, 18);
            ctx.fillStyle = linie.farbe;
            ctx.fillText(linie.text, x1 + 7, y - 8);
            ctx.restore();
        });
    },
};

// Vier Ecken im Streudiagramm beschriften (Kapitel 4)
const quadranten = {
    id: 'quadranten',
    beforeDatasetsDraw(chart, args, opts) {
        const { left, right, top, bottom } = chart.chartArea;
        const x = chart.scales.x.getPixelForValue(opts.x);
        const y = chart.scales.y.getPixelForValue(0);
        const ctx = chart.ctx;
        ctx.save();

        // Leicht eingefärbte Hälften: oben grün (mehr Bienen), unten rot (weniger)
        ctx.fillStyle = 'rgba(78, 133, 54, 0.05)';
        ctx.fillRect(left, top, right - left, y - top);
        ctx.fillStyle = 'rgba(200, 90, 40, 0.05)';
        ctx.fillRect(left, y, right - left, bottom - y);

        ctx.strokeStyle = 'rgba(26, 32, 44, 0.35)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = 'rgba(45, 55, 72, 0.6)';
        ctx.textAlign = 'left';
        ctx.fillText('trüb & mehr Bienen', left + 8, top + 16);
        ctx.fillText('trüb & weniger Bienen', left + 8, bottom - 8);
        ctx.textAlign = 'right';
        ctx.fillText('sonnig & mehr Bienen', right - 8, top + 16);
        ctx.fillText('sonnig & weniger Bienen', right - 8, bottom - 8);
        ctx.textAlign = 'center';
        ctx.fillText('Durchschnitt', x, top + 32);
        ctx.restore();
    },
};

// ---------------------------------------------------------------------------
// 1. Daten laden
// ---------------------------------------------------------------------------

async function ladeDaten() {
    try {
        const antwort = await fetch('unload.php');
        if (!antwort.ok) throw new Error(`Server-Fehler: ${antwort.status}`);
        const daten = await antwort.json();
        if (!Array.isArray(daten) || daten.length === 0) throw new Error('Keine Daten vorhanden.');
        return { daten, quelle: 'datenbank' };
    } catch (fehler) {
        console.warn('unload.php nicht erreichbar, nehme Musterdaten:', fehler);
        const antwort = await fetch('data/bienenjahre.json');
        return { daten: await antwort.json(), quelle: 'fallback' };
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    starteSchwarm();
    startePollenspur();
    starteNavigation();
    starteEinblenden();
    zeigeFruehstueck();

    try {
        const { daten, quelle } = await ladeDaten();
        daten.sort((a, b) => a.jahr - b.jahr);

        zeigeKennzahlen(daten);
        zeichneBestand(daten);
        zeichneRegen(daten);
        zeichneSonne(daten);
        zeichneTemperatur(daten);
        zeichneSchnee(daten);
        zeichneFazit(daten);

        document.getElementById('status').textContent = quelle === 'datenbank'
            ? `Live aus der Datenbank · ${daten.length} Jahre`
            : 'Hinweis: Die Datenbank ist nicht erreichbar, angezeigt werden die Musterdaten.';
    } catch (fehler) {
        console.error(fehler);
        document.getElementById('status').textContent = 'Die Daten konnten nicht geladen werden.';
    }
});

// ---------------------------------------------------------------------------
// 2. Kennzahlen oben
// ---------------------------------------------------------------------------

function zeigeKennzahlen(daten) {
    const start = daten[0];
    const ende = daten[daten.length - 1];
    const tief = minNach(daten, 'bienenvoelker');
    const verlust = (start.bienenvoelker - tief.bienenvoelker) / start.bienenvoelker * 100;

    zaehleHoch('kz-start', start.bienenvoelker, (w) => zahl(w));
    zaehleHoch('kz-tief', tief.bienenvoelker, (w) => zahl(w));
    zaehleHoch('kz-ende', ende.bienenvoelker, (w) => zahl(w));
    zaehleHoch('kz-verlust', verlust, (w) => `−${zahl(w, 0)} %`);

    document.getElementById('kz-tief-label').textContent = `Tiefpunkt ${tief.jahr}`;
    document.getElementById('kz-ende-label').textContent = `Völker ${ende.jahr}`;
    document.getElementById('kz-verlust-label').textContent = `Verlust ${start.jahr} bis ${tief.jahr}`;
}

// Zahl von 0 bis zum Zielwert hochzählen lassen
function zaehleHoch(id, ziel, format) {
    const element = document.getElementById(id);
    if (bewegungAus) {
        element.textContent = format(ziel);
        return;
    }
    const dauer = 1400;
    const startZeit = performance.now();
    function schritt(jetzt) {
        const t = Math.min((jetzt - startZeit) / dauer, 1);
        element.textContent = format(ziel * (1 - (1 - t) ** 3));
        if (t < 1) requestAnimationFrame(schritt);
    }
    requestAnimationFrame(schritt);
}

// ---------------------------------------------------------------------------
// 3. Kapitel 1: Der Bienenbestand (Wabe + Diagramm + Zeitreise)
// ---------------------------------------------------------------------------

const VOELKER_PRO_ZELLE = 10000;

function zeichneBestand(alleDaten) {
    let ansicht = 'bestand';
    let phase = '';
    let jahr = alleDaten[0].jahr;
    let chart = null;

    const tief = minNach(alleDaten, 'bienenvoelker');
    const regler = document.getElementById('jahr-regler');
    regler.min = alleDaten[0].jahr;
    regler.max = alleDaten[alleDaten.length - 1].jahr;
    regler.value = jahr;

    // --- Die Wabe aufbauen: so viele Zellen, wie der grösste Wert braucht ---
    const wabe = document.getElementById('wabe');
    const anzahlZellen = Math.ceil(maxNach(alleDaten, 'bienenvoelker').bienenvoelker / VOELKER_PRO_ZELLE);
    const proReihe = 7;
    const zellen = [];
    for (let i = 0; i < anzahlZellen; i += proReihe) {
        const reihe = document.createElement('div');
        reihe.className = 'wabe-reihe';
        for (let j = i; j < Math.min(i + proReihe, anzahlZellen); j++) {
            const zelle = document.createElement('div');
            zelle.className = 'zelle';
            reihe.appendChild(zelle);
            zellen.push(zelle);
        }
        wabe.appendChild(reihe);
    }

    function zeigeJahr(neuesJahr) {
        jahr = neuesJahr;
        const d = alleDaten.find((x) => x.jahr === jahr);
        if (!d) return;

        // Wabe füllen: volle Zellen, eine angebrochene Zelle, der Rest leer
        const voll = d.bienenvoelker / VOELKER_PRO_ZELLE;
        zellen.forEach((zelle, i) => {
            const anteil = Math.max(0, Math.min(1, voll - i));
            zelle.style.setProperty('--fuellung', `${anteil * 100}%`);
            zelle.classList.toggle('leer', anteil === 0);
        });

        document.getElementById('wabe-zahl').textContent = zahl(d.bienenvoelker);
        document.getElementById('regler-jahr').textContent = d.jahr;
        regler.value = d.jahr;

        const veraenderung = d.veraenderung_prozent === null
            ? 'Startjahr der Daten'
            : `${prozent(d.veraenderung_prozent)} zum Vorjahr`;
        const klasse = d.veraenderung_prozent === null ? '' : d.veraenderung_prozent < 0 ? 'minus' : 'plus';
        document.getElementById('wabe-info').innerHTML =
            `<span class="phase-marke ${d.phase === 'Rückgang' ? 'rot' : 'gruen'}">${d.phase}</span>`
            + ` <span class="${klasse}">${veraenderung}</span>`;

        if (chart) {
            chart.options.plugins.jahrMarker.jahr = jahr;
            chart.update('none');
        }
    }

    function render() {
        const daten = phase ? alleDaten.filter((d) => d.phase === phase) : alleDaten;
        if (chart) chart.destroy();

        document.getElementById('legende-rot').textContent = ansicht === 'bestand'
            ? 'Rückgang (bis zum Tiefpunkt)' : 'Weniger Völker als im Vorjahr';
        document.getElementById('legende-gruen').textContent = ansicht === 'bestand'
            ? 'Erholung (danach)' : 'Mehr Völker als im Vorjahr';

        const canvas = document.getElementById('chart-bestand');
        const hover = (liste) => (evt, elemente) => {
            if (elemente.length > 0) zeigeJahr(liste[elemente[0].index].jahr);
        };

        if (ansicht === 'bestand') {
            const verlauf = canvas.getContext('2d').createLinearGradient(0, 0, 0, 400);
            verlauf.addColorStop(0, 'rgba(229, 169, 60, 0.4)');
            verlauf.addColorStop(1, 'rgba(229, 169, 60, 0.02)');

            chart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: daten.map((d) => d.jahr),
                    datasets: [{
                        label: 'Bienenvölker',
                        data: daten.map((d) => d.bienenvoelker),
                        fill: true,
                        backgroundColor: verlauf,
                        borderWidth: 4,
                        tension: 0.3,
                        pointRadius: daten.map((d) => (d.jahr === tief.jahr ? 8 : 0)),
                        pointHoverRadius: 9,
                        pointBackgroundColor: daten.map((d) => farbeFuerPhase(d.phase)),
                        pointBorderColor: '#fff',
                        segment: { borderColor: (ctx) => farbeFuerPhase(daten[ctx.p1DataIndex].phase) },
                    }],
                },
                options: {
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y: { beginAtZero: true, ticks: { callback: (w) => zahl(w) } },
                        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
                    },
                    plugins: {
                        jahrMarker: { jahr },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ` ${zahl(ctx.parsed.y)} Bienenvölker`,
                                afterLabel: (ctx) => ` ${prozent(daten[ctx.dataIndex].veraenderung_prozent)} zum Vorjahr`,
                            },
                        },
                    },
                    onHover: hover(daten),
                },
                plugins: [jahrMarker],
            });
        } else {
            const mitWert = daten.filter((d) => d.veraenderung_prozent !== null);
            chart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: mitWert.map((d) => d.jahr),
                    datasets: [{
                        label: 'Veränderung zum Vorjahr',
                        data: mitWert.map((d) => d.veraenderung_prozent),
                        backgroundColor: mitWert.map((d) => farbeFuerVeraenderung(d.veraenderung_prozent)),
                        borderRadius: 4,
                    }],
                },
                options: {
                    scales: {
                        y: { ticks: { callback: (w) => `${w} %` } },
                        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
                    },
                    plugins: {
                        jahrMarker: { jahr },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ` ${prozent(ctx.parsed.y)} (${zahl(mitWert[ctx.dataIndex].veraenderung_abs)} Völker)`,
                            },
                        },
                    },
                    onHover: hover(mitWert),
                },
                plugins: [jahrMarker],
            });
        }
    }

    // Knöpfe: jede Gruppe ändert eine Variable und zeichnet neu
    document.querySelectorAll('[data-ansicht]').forEach((knopf) => {
        knopf.addEventListener('click', () => {
            document.querySelectorAll('[data-ansicht]').forEach((k) => k.classList.remove('aktiv'));
            knopf.classList.add('aktiv');
            ansicht = knopf.dataset.ansicht;
            render();
        });
    });

    document.querySelectorAll('[data-phase]').forEach((knopf) => {
        knopf.addEventListener('click', () => {
            document.querySelectorAll('[data-phase]').forEach((k) => k.classList.remove('aktiv'));
            knopf.classList.add('aktiv');
            phase = knopf.dataset.phase;
            render();
        });
    });

    // Zeitreise: Regler und Play-Knopf
    regler.addEventListener('input', () => zeigeJahr(Number(regler.value)));

    const knopf = document.getElementById('abspielen');
    let takt = null;
    function stoppe() {
        clearInterval(takt);
        takt = null;
        knopf.textContent = '▶';
        knopf.setAttribute('aria-label', 'Zeitreise abspielen');
    }
    knopf.addEventListener('click', () => {
        if (takt) {
            stoppe();
            return;
        }
        if (jahr >= alleDaten[alleDaten.length - 1].jahr) zeigeJahr(alleDaten[0].jahr);
        knopf.textContent = '❚❚';
        knopf.setAttribute('aria-label', 'Zeitreise anhalten');
        takt = setInterval(() => {
            const naechstes = alleDaten.find((d) => d.jahr > jahr);
            if (!naechstes) {
                stoppe();
                return;
            }
            zeigeJahr(naechstes.jahr);
        }, 450);
    });

    render();
    zeigeJahr(jahr);
    schreibeAnalyseBestand(alleDaten, tief);
}

function schreibeAnalyseBestand(daten, tief) {
    const start = daten[0];
    const ende = daten[daten.length - 1];
    const mitWert = daten.filter((d) => d.veraenderung_prozent !== null);
    const schlimmstes = minNach(mitWert, 'veraenderung_prozent');
    const bestes = maxNach(mitWert, 'veraenderung_prozent');
    const verlust = start.bienenvoelker - tief.bienenvoelker;
    const zurueck = ende.bienenvoelker - tief.bienenvoelker;
    const nochUnter = (start.bienenvoelker - ende.bienenvoelker) / start.bienenvoelker * 100;
    const verlustJahre = daten.filter((d) => d.phase === 'Rückgang' && d.veraenderung_prozent < 0).length;
    const rueckgangJahre = daten.filter((d) => d.phase === 'Rückgang' && d.veraenderung_prozent !== null).length;

    setzeKurz('kurz-bestand', null,
        `Bis ${tief.jahr} gingen ${zahl(verlust / start.bienenvoelker * 100, 0)} % des Bestands verloren. Seither wächst er wieder,
        liegt ${ende.jahr} aber noch ${zahl(nochUnter, 0)} % unter dem Stand von ${start.jahr}.`);

    document.getElementById('analyse-bestand').innerHTML = `
        <h3>Was die Grafik zeigt</h3>
        <p>Von ${start.jahr} bis ${tief.jahr} verlor die Schweiz <strong>${zahl(verlust)} Bienenvölker</strong>.
        In ${verlustJahre} von ${rueckgangJahre} Jahren dieser Phase ging die Zahl zurück.
        Den grössten Einbruch gab es ${schlimmstes.jahr} mit ${prozent(schlimmstes.veraenderung_prozent)}.</p>
        <p>Seit ${tief.jahr} geht es wieder aufwärts: Bis ${ende.jahr} kamen <strong>${zahl(zurueck)} Völker</strong> dazu.
        Das stärkste Plus gab es ${bestes.jahr} mit ${prozent(bestes.veraenderung_prozent)}. Damit sind etwa
        ${zahl(zurueck / verlust * 100, 0)} % des Verlusts wieder aufgeholt.</p>`;
}

// ---------------------------------------------------------------------------
// 4. Kapitel 2: Frühstück mit und ohne Bienen
// ---------------------------------------------------------------------------
//
// Vereinfachte Einteilung: «ja» = stark auf Bestäubung durch Tiere angewiesen,
// «teilweise» = Ernte fällt ohne Bestäuber deutlich kleiner aus,
// «nein» = Wind- oder Selbstbestäubung bzw. kein Pflanzenprodukt.

const FRUEHSTUECK = [
    { emoji: '🍎', name: 'Apfel', bienen: 'ja' },
    { emoji: '🍓', name: 'Erdbeeren', bienen: 'ja' },
    { emoji: '🍒', name: 'Kirschen', bienen: 'ja' },
    { emoji: '🫐', name: 'Heidelbeeren', bienen: 'ja' },
    { emoji: '🍯', name: 'Honig', bienen: 'ja' },
    { emoji: '☕', name: 'Kaffee', bienen: 'teilweise' },
    { emoji: '🍊', name: 'Orangensaft', bienen: 'teilweise' },
    { emoji: '🍞', name: 'Brot', bienen: 'nein' },
    { emoji: '🥚', name: 'Ei', bienen: 'nein' },
    { emoji: '🥛', name: 'Milch', bienen: 'nein' },
    { emoji: '🧈', name: 'Butter', bienen: 'nein' },
];

function zeigeFruehstueck() {
    const tisch = document.getElementById('tisch');
    tisch.innerHTML = FRUEHSTUECK.map((z) => `
        <li class="zutat" data-bienen="${z.bienen}">
            <span class="zutat-emoji" aria-hidden="true">${z.emoji}</span>
            <span class="zutat-name">${z.name}</span>
        </li>`).join('');

    const schalter = document.getElementById('ohne-bienen');
    const ja = FRUEHSTUECK.filter((z) => z.bienen === 'ja').length;
    const teilweise = FRUEHSTUECK.filter((z) => z.bienen === 'teilweise').length;

    schalter.addEventListener('click', () => {
        const ohne = schalter.getAttribute('aria-pressed') !== 'true';
        schalter.setAttribute('aria-pressed', String(ohne));
        tisch.classList.toggle('ohne', ohne);
        document.getElementById('schalter-text').textContent = ohne ? 'Ohne Bienen' : 'Mit Bienen';
        document.getElementById('tisch-text').innerHTML = ohne
            ? `<strong>${ja} von ${FRUEHSTUECK.length} Dingen</strong> verschwinden fast ganz, ${teilweise} weitere würden knapp und teuer.
               Übrig bleibt ein ziemlich graues Frühstück. <small>(vereinfacht)</small>`
            : 'Klickt auf den Schalter und schaut, was vom Tisch verschwindet.';
    });
}

// ---------------------------------------------------------------------------
// 5. Kapitel 3: Regen
// ---------------------------------------------------------------------------

function zeichneRegen(daten) {
    const werte = daten.map((d) => d.niederschlag_mm);
    const wetter = starteWetter(document.querySelector('#regen .wetter-ebene'), 'regen');
    const anzeige = (d) => {
        setzeAnzeige('anzeige-regen', d, `${zahl(d.niederschlag_mm)} mm Regen`);
        wetter.staerke(normiere(d.niederschlag_mm, werte));
    };
    const schnitt = mittelwert(werte);

    new Chart(document.getElementById('chart-regen'), {
        type: 'bar',
        data: {
            labels: daten.map((d) => d.jahr),
            datasets: [{
                label: 'Niederschlag',
                data: werte,
                backgroundColor: daten.map((d) => farbeFuerVeraenderung(d.veraenderung_prozent)),
                borderRadius: 4,
            }],
        },
        options: {
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Niederschlag (mm)' }, ticks: { callback: (w) => zahl(w) } },
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
            },
            plugins: {
                hilfslinien: { linien: [{ wert: schnitt, text: `Durchschnitt ${zahl(schnitt)} mm`, farbe: FARBEN.regen }] },
                tooltip: { callbacks: tooltipMitBienen(daten, (d) => `${zahl(d.niederschlag_mm)} mm Niederschlag`) },
            },
            onHover: (evt, el) => { if (el.length > 0) anzeige(daten[el[0].index]); },
        },
        plugins: [hilfslinien],
    });

    anzeige(maxNach(daten, 'niederschlag_mm'));

    const mitWert = daten.filter((d) => d.veraenderung_prozent !== null);
    const nasseste = [...mitWert].sort((a, b) => b.niederschlag_mm - a.niederschlag_mm).slice(0, 3);
    const trockenstes = minNach(mitWert, 'niederschlag_mm');
    const nassMitVerlust = nasseste.filter((d) => d.veraenderung_prozent < 0).length;
    const r = korrelation(werte, daten.map((d) => d.veraenderung_prozent));
    const { rueckgang, erholung } = phasenMittel(daten, 'niederschlag_mm');
    const nassSatz = [
        'Keines der drei nassesten Jahre war ein Verlustjahr.',
        'Eines der drei nassesten Jahre war ein Verlustjahr.',
        'Zwei der drei nassesten Jahre waren Verlustjahre.',
        'Alle drei nassesten Jahre waren Verlustjahre.',
    ][nassMitVerlust];

    setzeKurz('kurz-regen', urteil(r),
        `${nassSatz} ${trockenstes.veraenderung_prozent < 0 ? 'Aber auch das trockenste Jahr war eines.' : ''}
        Über alle Jahre gesehen ist der Zusammenhang nur ${staerkeKurz(r)}.`);

    document.getElementById('analyse-regen').innerHTML = `
        <h3>Analyse: Der Regeneffekt</h3>
        <p>Die drei nassesten Jahre waren ${aufzaehlen(nasseste, (d) => `${d.jahr} (${zahl(d.niederschlag_mm)} mm, ${prozent(d.veraenderung_prozent)})`)}.
        Dauerregen hält Bienen im Stock: Sie können keinen Nektar sammeln und zehren von ihren Vorräten.</p>
        <p>Das trockenste Jahr, ${trockenstes.jahr} mit ${zahl(trockenstes.niederschlag_mm)} mm, brachte
        ${trockenstes.veraenderung_prozent < 0 ? 'aber ebenfalls einen Rückgang' : 'ein Plus'} (${prozent(trockenstes.veraenderung_prozent)}).
        Im Durchschnitt regnete es in beiden Phasen fast gleich viel: ${zahl(rueckgang)} mm im Rückgang, ${zahl(erholung)} mm in der Erholung.
        Der Zusammenhangswert liegt bei ${zahl(r, 2)} – das ist ${staerke(r)} Zusammenhang.
        <strong>Regen allein erklärt den langen Rückgang nicht.</strong></p>`;
}

// ---------------------------------------------------------------------------
// 6. Kapitel 4: Sonne
// ---------------------------------------------------------------------------

function zeichneSonne(daten) {
    const mitWert = daten.filter((d) => d.veraenderung_prozent !== null && d.sonnenscheindauer_h !== null);
    const werte = mitWert.map((d) => d.sonnenscheindauer_h);
    const schnitt = mittelwert(werte);
    const sonne = document.getElementById('sonne-icon');
    const anzeige = (d) => {
        setzeAnzeige('anzeige-sonne', d, `${zahl(d.sonnenscheindauer_h)} Sonnenstunden`);
        const s = normiere(d.sonnenscheindauer_h, werte);
        sonne.style.transform = `scale(${0.7 + s * 0.8})`;
        sonne.style.filter = `drop-shadow(0 0 ${8 + s * 30}px rgba(255, 190, 40, ${0.4 + s * 0.5}))`;
    };

    new Chart(document.getElementById('chart-sonne'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Jahre',
                data: mitWert.map((d) => ({ x: d.sonnenscheindauer_h, y: d.veraenderung_prozent })),
                backgroundColor: mitWert.map((d) => farbeFuerPhase(d.phase)),
                borderColor: '#fff',
                borderWidth: 2,
                pointRadius: 8,
                pointHoverRadius: 12,
            }],
        },
        options: {
            scales: {
                x: { title: { display: true, text: 'Sonnenstunden im Jahr →' }, ticks: { callback: (w) => zahl(w) } },
                y: {
                    title: { display: true, text: 'Veränderung der Bienenvölker →' },
                    ticks: { callback: (w) => `${w} %` },
                    grid: { color: (ctx) => (ctx.tick.value === 0 ? '#4a5568' : 'rgba(0,0,0,0.06)') },
                },
            },
            plugins: {
                quadranten: { x: schnitt },
                tooltip: {
                    callbacks: {
                        title: (items) => `${mitWert[items[0].dataIndex].jahr}`,
                        label: (ctx) => {
                            const d = mitWert[ctx.dataIndex];
                            return [` ${zahl(d.sonnenscheindauer_h)} Sonnenstunden`, ` Bienen: ${prozent(d.veraenderung_prozent)}`];
                        },
                    },
                },
            },
            onHover: (evt, el) => { if (el.length > 0) anzeige(mitWert[el[0].index]); },
        },
        plugins: [quadranten],
    });

    const sonnigste = [...mitWert].sort((a, b) => b.sonnenscheindauer_h - a.sonnenscheindauer_h).slice(0, 3);
    anzeige(sonnigste[0]);

    const sonnigMitVerlust = sonnigste.filter((d) => d.veraenderung_prozent < 0).length;
    const r = korrelation(daten.map((d) => d.sonnenscheindauer_h), daten.map((d) => d.veraenderung_prozent));
    const { rueckgang, erholung } = phasenMittel(daten, 'sonnenscheindauer_h');
    const mehr = erholung > rueckgang;

    setzeKurz('kurz-sonne', urteil(r),
        `In der Erholungsphase war es im Schnitt ${mehr ? 'sonniger' : 'trüber'}. Jahr für Jahr passt die Sonne aber kaum zu den Bienen:
        Die Punkte liegen in allen vier Ecken.`);

    document.getElementById('analyse-sonne').innerHTML = `
        <h3>Analyse: Flugwetter</h3>
        <p>Sonne bedeutet Flugwetter: Bienen fliegen erst ab etwa 10 °C und am liebsten bei Sonnenschein.
        In der Erholungsphase gab es im Schnitt <strong>${zahl(Math.abs(erholung - rueckgang))} Sonnenstunden ${mehr ? 'mehr' : 'weniger'} pro Jahr</strong>
        (${zahl(erholung)} statt ${zahl(rueckgang)} Stunden).</p>
        <p>Die drei sonnigsten Jahre waren ${aufzaehlen(sonnigste, (d) => `${d.jahr} (${prozent(d.veraenderung_prozent)})`)}.
        ${['', 'Eines davon war trotzdem ein Verlustjahr.', 'Zwei davon waren trotzdem Verlustjahre.', 'Alle drei waren trotzdem Verlustjahre.'][sonnigMitVerlust]}
        Der Zusammenhangswert liegt bei ${zahl(r, 2)} – das ist ${staerke(r)} Zusammenhang.
        <strong>Viel Sonne ist kein Garant für ein gutes Bienenjahr.</strong></p>`;
}

// ---------------------------------------------------------------------------
// 7. Kapitel 5: Temperatur als Klimastreifen
// ---------------------------------------------------------------------------

// Farbe zwischen Blau (kühl), Hell (mittel) und Rot (warm)
function streifenFarbe(s) {
    const blau = [43, 108, 176];
    const hell = [247, 241, 230];
    const rot = [197, 48, 48];
    const [a, b, t] = s < 0.5 ? [blau, hell, s * 2] : [hell, rot, (s - 0.5) * 2];
    const mix = a.map((wert, i) => Math.round(wert + (b[i] - wert) * t));
    return `rgb(${mix.join(', ')})`;
}

function zeichneTemperatur(daten) {
    const werte = daten.map((d) => d.temperatur_c);
    const fuellung = document.getElementById('thermo-fuellung');
    const anzeige = (d) => {
        setzeAnzeige('anzeige-temperatur', d, `${zahl(d.temperatur_c, 1)} °C im Mittel`);
        fuellung.style.height = `${15 + normiere(d.temperatur_c, werte) * 80}%`;
    };

    document.getElementById('skala-min').textContent = `${zahl(Math.min(...werte), 1)} °C`;
    document.getElementById('skala-max').textContent = `${zahl(Math.max(...werte), 1)} °C`;

    new Chart(document.getElementById('chart-temperatur'), {
        data: {
            labels: daten.map((d) => d.jahr),
            datasets: [
                {
                    type: 'line',
                    label: 'Bienenvölker',
                    data: daten.map((d) => d.bienenvoelker),
                    borderColor: FARBEN.dunkel,
                    borderWidth: 3,
                    tension: 0.3,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: daten.map((d) => farbeFuerPhase(d.phase)),
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    yAxisID: 'y',
                    order: 0,
                },
                {
                    type: 'bar',
                    label: 'Temperatur',
                    data: daten.map(() => 1),
                    backgroundColor: werte.map((w) => streifenFarbe(normiere(w, werte))),
                    barPercentage: 1,
                    categoryPercentage: 1,
                    yAxisID: 'streifen',
                    order: 1,
                },
            ],
        },
        options: {
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Bienenvölker' }, ticks: { callback: (w) => zahl(w) } },
                streifen: { display: false, min: 0, max: 1 },
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => (ctx.dataset.type === 'bar'
                            ? ` ${zahl(daten[ctx.dataIndex].temperatur_c, 1)} °C im Jahresmittel`
                            : ` ${zahl(ctx.parsed.y)} Bienenvölker (${prozent(daten[ctx.dataIndex].veraenderung_prozent)})`),
                    },
                },
            },
            onHover: (evt, el) => { if (el.length > 0) anzeige(daten[el[0].index]); },
        },
    });

    const waermste = [...daten].sort((a, b) => b.temperatur_c - a.temperatur_c).slice(0, 3);
    anzeige(waermste[0]);

    const waermsteInErholung = waermste.filter((d) => d.phase === 'Erholung').length;
    const r = korrelation(werte, daten.map((d) => d.veraenderung_prozent));
    const { rueckgang, erholung } = phasenMittel(daten, 'temperatur_c');

    setzeKurz('kurz-temperatur', urteil(r),
        `Rechts werden die Streifen röter, und genau dort steigt die Bienenlinie wieder.
        Das ist ${staerke(r)} Zusammenhang, aber noch kein Beweis.`);

    document.getElementById('analyse-temperatur').innerHTML = `
        <h3>Analyse: Die Erwärmung im Blick</h3>
        <p>In der Erholungsphase war es im Schnitt <strong>${zahl(erholung - rueckgang, 1)} °C wärmer</strong>
        (${zahl(erholung, 1)} statt ${zahl(rueckgang, 1)} °C). Die drei wärmsten Jahre waren ${aufzaehlen(waermste, (d) => `${d.jahr} (${zahl(d.temperatur_c, 1)} °C)`)},
        ${waermsteInErholung === 3 ? 'alle in der Erholungsphase' : `${waermsteInErholung} davon in der Erholungsphase`}.</p>
        <p>Von allen vier Klimawerten passt die Temperatur am ehesten zur Entwicklung der Bienen: Der Zusammenhangswert liegt bei ${zahl(r, 2)}
        – das ist ${staerke(r)} Zusammenhang. Mildere Frühlinge können der Brut helfen. Wärme hilft aber auch der Varroamilbe.
        <strong>Dass beides gleichzeitig passiert, beweist noch keine Ursache.</strong></p>`;
}

// ---------------------------------------------------------------------------
// 8. Kapitel 6: Schnee
// ---------------------------------------------------------------------------

function zeichneSchnee(daten) {
    const werte = daten.map((d) => d.neuschnee_cm);
    const wetter = starteWetter(document.querySelector('#schnee .wetter-ebene'), 'schnee');
    const anzeige = (d) => {
        setzeAnzeige('anzeige-schnee', d, `${zahl(d.neuschnee_cm)} cm Neuschnee`);
        wetter.staerke(normiere(d.neuschnee_cm, werte));
    };
    const { rueckgang, erholung } = phasenMittel(daten, 'neuschnee_cm');
    const letzterRueckgang = daten.filter((d) => d.phase === 'Rückgang').length - 1;

    const canvas = document.getElementById('chart-schnee');
    const verlauf = canvas.getContext('2d').createLinearGradient(0, 0, 0, 380);
    verlauf.addColorStop(0, 'rgba(90, 169, 201, 0.55)');
    verlauf.addColorStop(1, 'rgba(90, 169, 201, 0.05)');

    new Chart(canvas, {
        type: 'line',
        data: {
            labels: daten.map((d) => d.jahr),
            datasets: [{
                label: 'Neuschnee',
                data: werte,
                fill: true,
                backgroundColor: verlauf,
                borderColor: FARBEN.schnee,
                borderWidth: 3,
                tension: 0.35,
                pointRadius: 5,
                pointHoverRadius: 9,
                pointBackgroundColor: daten.map((d) => farbeFuerPhase(d.phase)),
                pointBorderColor: '#fff',
            }],
        },
        options: {
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Neuschnee (cm)' } },
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
            },
            plugins: {
                hilfslinien: {
                    linien: [
                        { wert: rueckgang, von: 0, bis: letzterRueckgang, text: `Ø Rückgang ${zahl(rueckgang)} cm`, farbe: FARBEN.rueckgang },
                        { wert: erholung, von: letzterRueckgang + 1, bis: daten.length - 1, text: `Ø Erholung ${zahl(erholung)} cm`, farbe: FARBEN.erholung },
                    ],
                },
                tooltip: { callbacks: tooltipMitBienen(daten, (d) => `${zahl(d.neuschnee_cm)} cm Neuschnee`) },
            },
            onHover: (evt, el) => { if (el.length > 0) anzeige(daten[el[0].index]); },
        },
        plugins: [hilfslinien],
    });

    const schneereichstes = maxNach(daten, 'neuschnee_cm');
    anzeige(schneereichstes);

    const r = korrelation(werte, daten.map((d) => d.veraenderung_prozent));
    const unterschied = Math.abs((erholung - rueckgang) / rueckgang * 100);

    setzeKurz('kurz-schnee', urteil(r),
        `In der Erholungsphase fiel im Schnitt ${zahl(unterschied, 0)} % ${erholung < rueckgang ? 'weniger' : 'mehr'} Schnee.
        Mit den Bienen hängt der Schnee aber kaum zusammen.`);

    document.getElementById('analyse-schnee').innerHTML = `
        <h3>Analyse: Der Winter</h3>
        <p>In der Erholungsphase fiel im Schnitt <strong>${zahl(unterschied, 0)} % ${erholung < rueckgang ? 'weniger' : 'mehr'} Neuschnee</strong>
        (${zahl(erholung)} statt ${zahl(rueckgang)} cm pro Jahr). Das schneereichste Jahr war ${schneereichstes.jahr} mit ${zahl(schneereichstes.neuschnee_cm)} cm,
        und es war für die Bienen ${schneereichstes.veraenderung_prozent < 0 ? 'ein Verlustjahr' : 'ein gutes Jahr'} (${prozent(schneereichstes.veraenderung_prozent)}).</p>
        <p>Im Winter ruhen die Bienen eng zusammengedrängt im Stock und leben von ihren Vorräten. Ob dabei Schnee liegt, spielt für das Volk
        weniger eine Rolle als lange, feuchtkalte Phasen. Der Zusammenhangswert liegt bei ${zahl(r, 2)} – das ist ${staerke(r)} Zusammenhang.</p>`;
}

// ---------------------------------------------------------------------------
// 9. Kapitel 7: Fazit als Wetter-Zeugnis
// ---------------------------------------------------------------------------

function zeichneFazit(daten) {
    const faktoren = [
        { feld: 'niederschlag_mm', name: 'Regen', icon: '🌧️', ziel: '#regen', beim: 'beim Regen' },
        { feld: 'sonnenscheindauer_h', name: 'Sonne', icon: '☀️', ziel: '#sonne', beim: 'bei der Sonne' },
        { feld: 'temperatur_c', name: 'Temperatur', icon: '🌡️', ziel: '#temperatur', beim: 'bei der Temperatur' },
        { feld: 'neuschnee_cm', name: 'Schnee', icon: '❄️', ziel: '#schnee', beim: 'beim Schnee' },
    ];

    faktoren.forEach((f) => {
        const { rueckgang, erholung } = phasenMittel(daten, f.feld);
        f.unterschied = (erholung - rueckgang) / rueckgang * 100;
        f.r = korrelation(daten.map((d) => d[f.feld]), daten.map((d) => d.veraenderung_prozent));
        f.urteil = urteil(f.r);
    });

    document.getElementById('zeugnis').innerHTML = faktoren.map((f) => `
        <a class="zeugnis-karte" href="${f.ziel}">
            <span class="zeugnis-icon" aria-hidden="true">${f.icon}</span>
            <h3>${f.name}</h3>
            <span class="urteil ${f.urteil.klasse}">${f.urteil.wort}</span>
            <div class="meter" role="img" aria-label="Zusammenhang ${zahl(f.r, 2)}">
                <div style="--wert: ${Math.abs(f.r) * 100}%"></div>
            </div>
            <p class="zeugnis-wert">Zusammenhang ${zahl(f.r, 2)} (${staerkeKurz(f.r)})</p>
            <p class="zeugnis-wert">Erholung vs. Rückgang: <b>${f.unterschied > 0 ? '+' : ''}${zahl(f.unterschied, 1)} %</b></p>
        </a>`).join('');

    const staerkster = faktoren.reduce((max, f) => (Math.abs(f.r) > Math.abs(max.r) ? f : max));
    const alleUnterMittel = faktoren.every((f) => Math.abs(f.r) < 0.5);

    document.getElementById('analyse-fazit').innerHTML = `
        <h3>Was bleibt</h3>
        <p>${alleUnterMittel ? '<strong>Keiner der vier Wetterwerte hängt stark mit der Entwicklung der Bienen zusammen.</strong>' : ''}
        Am deutlichsten ist der Zusammenhang ${staerkster.beim} (${zahl(staerkster.r, 2)}).</p>
        <ul>
            <li><strong>Kurzfristig:</strong> Einzelne Extremjahre, zum Beispiel sehr nasse, fallen oft mit Verlusten zusammen.</li>
            <li><strong>Langfristig:</strong> Das Wetter erklärt weder den langen Rückgang noch die Wende nach dem Tiefpunkt.</li>
            <li><strong>Der blinde Fleck:</strong> Für die Wende kommen andere Gründe in Frage, die nicht in unseren Daten stecken,
            etwa die Bekämpfung der Varroamilbe, die Beratung der Imkerinnen und Imker oder Förderprogramme.</li>
        </ul>`;
}

// ---------------------------------------------------------------------------
// Animationen und Navigation
// ---------------------------------------------------------------------------

// Regen oder Schnee auf einer Canvas-Ebene. staerke(0..1) bestimmt, wie viel fällt.
function starteWetter(canvas, art) {
    const ctx = canvas.getContext('2d');
    const teilchen = [];
    let ziel = 0.5;
    let sichtbar = false;

    function groesse() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
    groesse();
    window.addEventListener('resize', groesse);

    function neuesTeilchen() {
        return {
            x: Math.random() * canvas.width,
            y: -10 - Math.random() * canvas.height * 0.3,
            v: art === 'regen' ? 6 + Math.random() * 6 : 0.5 + Math.random() * 1.2,
            r: art === 'regen' ? 10 + Math.random() * 10 : 1.5 + Math.random() * 3,
            phase: Math.random() * Math.PI * 2,
        };
    }

    function bild() {
        if (!sichtbar) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Anzahl Teilchen passt sich an die Stärke an
        const soll = Math.round(10 + ziel * (art === 'regen' ? 140 : 180));
        while (teilchen.length < soll) teilchen.push(neuesTeilchen());
        if (teilchen.length > soll) teilchen.splice(0, teilchen.length - soll);

        teilchen.forEach((t, i) => {
            t.y += t.v;
            if (art === 'regen') {
                ctx.strokeStyle = 'rgba(43, 108, 176, 0.25)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(t.x, t.y);
                ctx.lineTo(t.x - 2, t.y + t.r);
                ctx.stroke();
            } else {
                t.phase += 0.02;
                t.x += Math.sin(t.phase) * 0.6;
                ctx.fillStyle = 'rgba(140, 190, 220, 0.75)';
                ctx.beginPath();
                ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
                ctx.fill();
            }
            if (t.y > canvas.height + 20) teilchen[i] = neuesTeilchen();
        });

        requestAnimationFrame(bild);
    }

    // Nur animieren, wenn das Kapitel sichtbar ist
    if (!bewegungAus) {
        new IntersectionObserver(([eintrag]) => {
            const vorher = sichtbar;
            sichtbar = eintrag.isIntersecting;
            if (sichtbar && !vorher) {
                groesse();
                requestAnimationFrame(bild);
            }
        }).observe(canvas.parentElement);
    }

    return { staerke: (wert) => { ziel = wert; } };
}

// Drei Bienen fliegen in Schleifen durch die Einführung und weichen der Maus aus
function starteSchwarm() {
    const schwarm = document.getElementById('schwarm');
    if (bewegungAus) return;

    const bienen = [
        { tempo: 0.45, versatz: 0, groesse: 2.4 },
        { tempo: 0.33, versatz: 2.1, groesse: 1.7 },
        { tempo: 0.58, versatz: 4.2, groesse: 1.3 },
    ].map((b) => {
        const el = document.createElement('span');
        el.className = 'flugbiene';
        el.textContent = '🐝';
        el.style.fontSize = `${b.groesse}rem`;
        schwarm.appendChild(el);
        return { ...b, el, x: 0, y: 0, letztesX: 0 };
    });

    let maus = { x: -999, y: -999 };
    schwarm.parentElement.addEventListener('mousemove', (e) => {
        const box = schwarm.getBoundingClientRect();
        maus = { x: e.clientX - box.left, y: e.clientY - box.top };
    });

    function flug(zeit) {
        const t = zeit / 1000;
        const breite = schwarm.offsetWidth;
        const hoehe = schwarm.offsetHeight;

        bienen.forEach((b) => {
            const s = t * b.tempo + b.versatz;
            // Achterschleife plus etwas Zittern
            let zx = breite * (0.5 + 0.42 * Math.sin(s));
            let zy = hoehe * (0.5 + 0.38 * Math.sin(s * 2)) + Math.sin(t * 9 + b.versatz) * 6;

            const dx = zx - maus.x, dy = zy - maus.y;
            const abstand = Math.hypot(dx, dy) || 1;
            if (abstand < 130) {
                zx += dx / abstand * (130 - abstand);
                zy += dy / abstand * (130 - abstand);
            }

            b.x += (zx - b.x) * 0.06;
            b.y += (zy - b.y) * 0.06;
            b.el.style.transform = `translate(${b.x}px, ${b.y}px) scaleX(${b.x < b.letztesX ? 1 : -1})`;
            b.letztesX = b.x;
        });
        requestAnimationFrame(flug);
    }
    requestAnimationFrame(flug);
}

// Der Bienen-Mauszeiger hinterlässt eine kleine Pollenspur
function startePollenspur() {
    if (bewegungAus || !window.matchMedia('(pointer: fine)').matches) return;
    let zuletzt = 0;
    window.addEventListener('mousemove', (e) => {
        const jetzt = performance.now();
        if (jetzt - zuletzt < 45) return;
        zuletzt = jetzt;
        const pollen = document.createElement('span');
        pollen.className = 'pollen';
        pollen.style.left = `${e.clientX + 4}px`;
        pollen.style.top = `${e.clientY + 18}px`;
        document.body.appendChild(pollen);
        setTimeout(() => pollen.remove(), 900);
    });
}

// Navigation: aktives Kapitel markieren und Lesefortschritt anzeigen
function starteNavigation() {
    const links = document.querySelectorAll('[data-kapitel]');
    const balken = document.getElementById('fortschritt');

    const beobachter = new IntersectionObserver((eintraege) => {
        eintraege.forEach((e) => {
            if (!e.isIntersecting) return;
            links.forEach((l) => l.classList.toggle('aktiv', l.dataset.kapitel === e.target.id));
        });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('.kapitel').forEach((k) => beobachter.observe(k));

    window.addEventListener('scroll', () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        balken.style.width = `${max > 0 ? window.scrollY / max * 100 : 0}%`;
        document.body.classList.toggle('gescrollt', window.scrollY > 40);
    }, { passive: true });
}

// Kapitel sanft einblenden, sobald sie ins Bild scrollen
function starteEinblenden() {
    if (bewegungAus) return;
    const abschnitte = document.querySelectorAll('main > section');
    abschnitte.forEach((s) => s.classList.add('versteckt'));
    const beobachter = new IntersectionObserver((eintraege) => {
        eintraege.forEach((e) => {
            if (e.isIntersecting) {
                e.target.classList.remove('versteckt');
                beobachter.unobserve(e.target);
            }
        });
    }, { threshold: 0.05 });
    abschnitte.forEach((s) => beobachter.observe(s));
}
