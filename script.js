// Bienen-Datastory – Frontend
//
// 1. Daten laden: zuerst unload.php, sonst die Musterdaten data/bienenjahre.json
// 2. Diagramme zeichnen (Chart.js)
// 3. Analysetexte aus den Daten berechnen, damit die Zahlen im Text immer stimmen
// 4. Kleine Animationen: fliegende Biene, Regen, Sonne, Thermometer, Schnee

const FARBEN = {
    rueckgang: '#c85a28',
    erholung: '#4e8536',
    honig: '#e5a93c',
    regen: '#2b6cb0',
    sonne: '#dd8a20',
    temperatur: '#e53e3e',
    schnee: '#5aa9c9',
    grau: '#a0aec0',
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
    if (wert === null) return '–';
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

function staerke(r) {
    const a = Math.abs(r);
    if (a < 0.1) return 'praktisch kein';
    if (a < 0.3) return 'ein schwacher';
    if (a < 0.5) return 'ein mittlerer';
    return 'ein starker';
}

function farbeFuerPhase(phase) {
    return phase === 'Rückgang' ? FARBEN.rueckgang : FARBEN.erholung;
}

function farbeFuerVeraenderung(wert) {
    if (wert === null) return FARBEN.grau;
    return wert < 0 ? FARBEN.rueckgang : FARBEN.erholung;
}

// Einheitliche Chart.js-Grundeinstellungen
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
Chart.defaults.color = '#4a5568';
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(26, 32, 44, 0.9)';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.maintainAspectRatio = false;

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
    starteFlugbiene();
    starteEinblenden();

    try {
        const { daten, quelle } = await ladeDaten();
        daten.sort((a, b) => a.jahr - b.jahr);

        zeigeKennzahlen(daten);
        zeichneBestand(daten);
        zeichneRegen(daten);
        zeichneSonne(daten);
        zeichneTemperatur(daten);
        zeichneSchnee(daten);
        zeichneGesamtschau(daten);

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
    const tief = daten.reduce((min, d) => (d.bienenvoelker < min.bienenvoelker ? d : min));
    const verlust = (tief.bienenvoelker - start.bienenvoelker) / start.bienenvoelker * 100;

    zaehleHoch('kz-start', start.bienenvoelker, (w) => zahl(w));
    zaehleHoch('kz-tief', tief.bienenvoelker, (w) => zahl(w));
    zaehleHoch('kz-ende', ende.bienenvoelker, (w) => zahl(w));
    zaehleHoch('kz-verlust', Math.abs(verlust), (w) => `−${zahl(w, 0)} %`);

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
    const dauer = 1200;
    const startZeit = performance.now();
    function schritt(jetzt) {
        const t = Math.min((jetzt - startZeit) / dauer, 1);
        const sanft = 1 - (1 - t) ** 3;
        element.textContent = format(ziel * sanft);
        if (t < 1) requestAnimationFrame(schritt);
    }
    requestAnimationFrame(schritt);
}

// ---------------------------------------------------------------------------
// 3. Teil 1: Der Bienenbestand
// ---------------------------------------------------------------------------

function zeichneBestand(alleDaten) {
    let ansicht = 'bestand';
    let phase = '';
    let chart = null;

    const tief = alleDaten.reduce((min, d) => (d.bienenvoelker < min.bienenvoelker ? d : min));

    function render() {
        const daten = phase ? alleDaten.filter((d) => d.phase === phase) : alleDaten;
        if (chart) chart.destroy();

        // Die Legende erklärt, wofür Rot und Grün in der aktuellen Ansicht stehen
        document.getElementById('legende-rot').textContent = ansicht === 'bestand'
            ? 'Rückgang (bis zum Tiefpunkt)' : 'Weniger Völker als im Vorjahr';
        document.getElementById('legende-gruen').textContent = ansicht === 'bestand'
            ? 'Erholung (danach)' : 'Mehr Völker als im Vorjahr';

        const canvas = document.getElementById('chart-bestand');

        if (ansicht === 'bestand') {
            // Flächendiagramm: Linie färbt sich je nach Phase
            const verlauf = canvas.getContext('2d').createLinearGradient(0, 0, 0, 420);
            verlauf.addColorStop(0, 'rgba(229, 169, 60, 0.35)');
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
                        pointRadius: daten.map((d) => (d.jahr === tief.jahr ? 8 : 3)),
                        pointHoverRadius: 9,
                        pointBackgroundColor: daten.map((d) => farbeFuerPhase(d.phase)),
                        pointBorderColor: '#fff',
                        segment: {
                            borderColor: (ctx) => farbeFuerPhase(daten[ctx.p1DataIndex].phase),
                        },
                    }],
                },
                options: {
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Bienenvölker' },
                            ticks: { callback: (w) => zahl(w) },
                        },
                        x: { grid: { display: false } },
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ` ${zahl(ctx.parsed.y)} Bienenvölker`,
                                afterLabel: (ctx) => ` ${prozent(daten[ctx.dataIndex].veraenderung_prozent)} zum Vorjahr`,
                            },
                        },
                    },
                    onHover: (evt, elemente) => {
                        if (elemente.length > 0) zeigeDetail(daten[elemente[0].index]);
                    },
                },
            });
        } else {
            // Balken: Gewinn oder Verlust zum Vorjahr
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
                        y: {
                            title: { display: true, text: 'Veränderung zum Vorjahr (%)' },
                            ticks: { callback: (w) => `${w} %` },
                        },
                        x: { grid: { display: false } },
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ` ${prozent(ctx.parsed.y)} (${zahl(mitWert[ctx.dataIndex].veraenderung_abs)} Völker)`,
                            },
                        },
                    },
                    onHover: (evt, elemente) => {
                        if (elemente.length > 0) zeigeDetail(mitWert[elemente[0].index]);
                    },
                },
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

    render();
    schreibeAnalyseBestand(alleDaten, tief);
}

function zeigeDetail(d) {
    const veraenderung = d.veraenderung_abs === null
        ? 'kein Vorjahr in den Daten'
        : `${prozent(d.veraenderung_prozent)} zum Vorjahr (${d.veraenderung_abs > 0 ? '+' : ''}${zahl(d.veraenderung_abs)} Völker)`;

    document.getElementById('detail').innerHTML =
        `<strong>${d.jahr}</strong> · Phase «${d.phase}» · ${zahl(d.bienenvoelker)} Bienenvölker · ${veraenderung}`;
}

function schreibeAnalyseBestand(daten, tief) {
    const start = daten[0];
    const ende = daten[daten.length - 1];
    const mitWert = daten.filter((d) => d.veraenderung_prozent !== null);
    const schlimmstes = mitWert.reduce((min, d) => (d.veraenderung_prozent < min.veraenderung_prozent ? d : min));
    const bestes = mitWert.reduce((max, d) => (d.veraenderung_prozent > max.veraenderung_prozent ? d : max));
    const verlust = start.bienenvoelker - tief.bienenvoelker;
    const zurueck = ende.bienenvoelker - tief.bienenvoelker;
    const anteilZurueck = zurueck / verlust * 100;
    const verlustJahre = daten.filter((d) => d.phase === 'Rückgang' && d.veraenderung_prozent < 0).length;
    const rueckgangJahre = daten.filter((d) => d.phase === 'Rückgang' && d.veraenderung_prozent !== null).length;

    document.getElementById('analyse-bestand').innerHTML = `
        <h3>Was die Grafik zeigt</h3>
        <p>Von ${start.jahr} bis ${tief.jahr} verlor die Schweiz <strong>${zahl(verlust)} Bienenvölker</strong>,
        das sind ${zahl(verlust / start.bienenvoelker * 100, 0)} % des Bestands. In ${verlustJahre} von ${rueckgangJahre} Jahren
        dieser Phase ging die Zahl zurück. Den grössten Einbruch gab es ${schlimmstes.jahr} mit ${prozent(schlimmstes.veraenderung_prozent)}.</p>
        <p>Seit ${tief.jahr} geht es wieder aufwärts: Bis ${ende.jahr} kamen <strong>${zahl(zurueck)} Völker</strong> dazu.
        Das stärkste Plus gab es ${bestes.jahr} mit ${prozent(bestes.veraenderung_prozent)}. Damit sind etwa
        ${zahl(anteilZurueck, 0)} % des Verlusts wieder aufgeholt, der Stand von ${start.jahr} ist aber noch nicht erreicht.</p>`;
}

// ---------------------------------------------------------------------------
// 4. Teil 3: Regen
// ---------------------------------------------------------------------------

function zeichneRegen(daten) {
    const werte = daten.map((d) => d.niederschlag_mm);
    const wetter = starteWetter(document.querySelector('[data-wetter="regen"] .wetter-ebene'), 'regen');
    const anzeige = (d) => {
        setzeAnzeige('anzeige-regen', d, `${zahl(d.niederschlag_mm)} mm Regen`);
        wetter.staerke(normiere(d.niederschlag_mm, werte));
    };

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
                x: { grid: { display: false } },
            },
            plugins: { tooltip: { callbacks: tooltipMitBienen(daten, (d) => `${zahl(d.niederschlag_mm)} mm Niederschlag`) } },
            onHover: (evt, el) => { if (el.length > 0) anzeige(daten[el[0].index]); },
        },
    });

    // Am Anfang das nasseste Jahr zeigen
    anzeige(daten.reduce((max, d) => (d.niederschlag_mm > max.niederschlag_mm ? d : max)));

    const mitWert = daten.filter((d) => d.veraenderung_prozent !== null);
    const nasseste = [...mitWert].sort((a, b) => b.niederschlag_mm - a.niederschlag_mm).slice(0, 3);
    const trockenstes = mitWert.reduce((min, d) => (d.niederschlag_mm < min.niederschlag_mm ? d : min));
    const nassMitVerlust = nasseste.filter((d) => d.veraenderung_prozent < 0).length;
    const r = korrelation(daten.map((d) => d.niederschlag_mm), daten.map((d) => d.veraenderung_prozent));
    const { rueckgang, erholung } = phasenMittel(daten, 'niederschlag_mm');

    document.getElementById('analyse-regen').innerHTML = `
        <h3>Analyse: Der Regeneffekt</h3>
        <p>Die drei nassesten Jahre waren ${aufzaehlen(nasseste, (d) => `${d.jahr} (${zahl(d.niederschlag_mm)} mm, ${prozent(d.veraenderung_prozent)})`)}.
        ${['Keines davon war ein Verlustjahr für die Bienen.', 'Eines davon war ein Verlustjahr für die Bienen.', 'Zwei davon waren Verlustjahre für die Bienen.', 'Alle drei waren Verlustjahre für die Bienen.'][nassMitVerlust]}
        Dauerregen hält Bienen im Stock: Sie können keinen Nektar sammeln und zehren von ihren Vorräten.</p>
        <p>Aber: Auch das trockenste Jahr, ${trockenstes.jahr} mit ${zahl(trockenstes.niederschlag_mm)} mm, brachte
        ${trockenstes.veraenderung_prozent < 0 ? 'einen Rückgang' : 'ein Plus'} (${prozent(trockenstes.veraenderung_prozent)}).
        Im Durchschnitt regnete es in beiden Phasen fast gleich viel: ${zahl(rueckgang)} mm im Rückgang, ${zahl(erholung)} mm in der Erholung.
        Der Zusammenhangswert liegt bei ${zahl(r, 2)} – das ist ${staerke(r)} Zusammenhang.
        <strong>Regen allein erklärt den langen Rückgang nicht.</strong></p>`;
}

// ---------------------------------------------------------------------------
// 5. Teil 4: Sonne
// ---------------------------------------------------------------------------

function zeichneSonne(daten) {
    const mitWert = daten.filter((d) => d.veraenderung_prozent !== null && d.sonnenscheindauer_h !== null);
    const werte = mitWert.map((d) => d.sonnenscheindauer_h);
    const sonne = document.getElementById('sonne');
    const anzeige = (d) => {
        setzeAnzeige('anzeige-sonne', d, `${zahl(d.sonnenscheindauer_h)} Sonnenstunden`);
        const s = normiere(d.sonnenscheindauer_h, werte);
        sonne.style.transform = `scale(${0.7 + s * 0.9})`;
        sonne.style.filter = `drop-shadow(0 0 ${8 + s * 30}px rgba(255, 190, 40, ${0.4 + s * 0.5}))`;
    };

    new Chart(document.getElementById('chart-sonne'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Jahre',
                data: mitWert.map((d) => ({ x: d.sonnenscheindauer_h, y: d.veraenderung_prozent })),
                backgroundColor: mitWert.map((d) => farbeFuerPhase(d.phase)),
                pointRadius: 7,
                pointHoverRadius: 11,
            }],
        },
        options: {
            scales: {
                x: { title: { display: true, text: 'Sonnenstunden im Jahr' }, ticks: { callback: (w) => zahl(w) } },
                y: {
                    title: { display: true, text: 'Veränderung der Bienenvölker (%)' },
                    ticks: { callback: (w) => `${w} %` },
                    grid: { color: (ctx) => (ctx.tick.value === 0 ? '#4a5568' : 'rgba(0,0,0,0.06)') },
                },
            },
            plugins: {
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
    });

    const sonnigste = [...mitWert].sort((a, b) => b.sonnenscheindauer_h - a.sonnenscheindauer_h).slice(0, 3);
    anzeige(sonnigste[0]);

    const sonnigMitVerlust = sonnigste.filter((d) => d.veraenderung_prozent < 0).length;
    const r = korrelation(daten.map((d) => d.sonnenscheindauer_h), daten.map((d) => d.veraenderung_prozent));
    const { rueckgang, erholung } = phasenMittel(daten, 'sonnenscheindauer_h');

    document.getElementById('analyse-sonne').innerHTML = `
        <h3>Analyse: Flugwetter</h3>
        <p>Sonne bedeutet Flugwetter: Bienen fliegen erst ab etwa 10 °C und am liebsten bei Sonnenschein.
        Tatsächlich gab es in der Erholungsphase im Schnitt <strong>${zahl(erholung - rueckgang)} Sonnenstunden mehr pro Jahr</strong>
        (${zahl(erholung)} statt ${zahl(rueckgang)} Stunden).</p>
        <p>Die Punkte liegen aber wild verstreut. Die drei sonnigsten Jahre waren ${aufzaehlen(sonnigste, (d) => `${d.jahr} (${prozent(d.veraenderung_prozent)})`)}.
        ${['', 'Eines davon war trotzdem ein Verlustjahr.', 'Zwei davon waren trotzdem Verlustjahre.', 'Alle drei waren trotzdem Verlustjahre.'][sonnigMitVerlust]}
        Der Zusammenhangswert liegt bei ${zahl(r, 2)} – das ist ${staerke(r)} Zusammenhang.
        <strong>Viel Sonne ist kein Garant für ein gutes Bienenjahr.</strong></p>`;
}

// ---------------------------------------------------------------------------
// 6. Teil 5: Temperatur
// ---------------------------------------------------------------------------

function zeichneTemperatur(daten) {
    const werte = daten.map((d) => d.temperatur_c);
    const { rueckgang, erholung } = phasenMittel(daten, 'temperatur_c');
    const fuellung = document.getElementById('thermo-fuellung');
    const anzeige = (d) => {
        setzeAnzeige('anzeige-temperatur', d, `${zahl(d.temperatur_c, 1)} °C im Mittel`);
        fuellung.style.height = `${20 + normiere(d.temperatur_c, werte) * 75}%`;
    };

    new Chart(document.getElementById('chart-temperatur'), {
        type: 'line',
        data: {
            labels: daten.map((d) => d.jahr),
            datasets: [
                {
                    label: 'Jahrestemperatur',
                    data: werte,
                    borderColor: FARBEN.temperatur,
                    backgroundColor: FARBEN.temperatur,
                    pointBackgroundColor: daten.map((d) => farbeFuerPhase(d.phase)),
                    pointBorderColor: '#fff',
                    borderWidth: 3,
                    tension: 0.3,
                    pointRadius: 5,
                    pointHoverRadius: 9,
                },
                {
                    label: 'Durchschnitt Rückgang',
                    data: daten.map((d) => (d.phase === 'Rückgang' ? rueckgang : null)),
                    borderColor: FARBEN.rueckgang,
                    borderDash: [6, 6],
                    borderWidth: 2,
                    pointRadius: 0,
                },
                {
                    label: 'Durchschnitt Erholung',
                    data: daten.map((d) => (d.phase === 'Erholung' ? erholung : null)),
                    borderColor: FARBEN.erholung,
                    borderDash: [6, 6],
                    borderWidth: 2,
                    pointRadius: 0,
                },
            ],
        },
        options: {
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { title: { display: true, text: 'Temperatur (°C)' }, ticks: { callback: (w) => `${w} °C` } },
                x: { grid: { display: false } },
            },
            plugins: {
                legend: { display: true, labels: { usePointStyle: true, boxWidth: 8 } },
                tooltip: {
                    filter: (item) => item.datasetIndex === 0,
                    callbacks: tooltipMitBienen(daten, (d) => `${zahl(d.temperatur_c, 1)} °C im Jahresmittel`),
                },
            },
            onHover: (evt, el) => { if (el.length > 0) anzeige(daten[el[0].index]); },
        },
    });

    const waermste = [...daten].sort((a, b) => b.temperatur_c - a.temperatur_c).slice(0, 3);
    anzeige(waermste[0]);

    const waermsteInErholung = waermste.filter((d) => d.phase === 'Erholung').length;
    const r = korrelation(werte, daten.map((d) => d.veraenderung_prozent));

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
// 7. Teil 6: Schnee
// ---------------------------------------------------------------------------

function zeichneSchnee(daten) {
    const werte = daten.map((d) => d.neuschnee_cm);
    const wetter = starteWetter(document.querySelector('[data-wetter="schnee"] .wetter-ebene'), 'schnee');
    const anzeige = (d) => {
        setzeAnzeige('anzeige-schnee', d, `${zahl(d.neuschnee_cm)} cm Neuschnee`);
        wetter.staerke(normiere(d.neuschnee_cm, werte));
    };

    new Chart(document.getElementById('chart-schnee'), {
        type: 'bar',
        data: {
            labels: daten.map((d) => d.jahr),
            datasets: [{
                label: 'Neuschnee',
                data: werte,
                backgroundColor: daten.map((d) => (d.phase === 'Rückgang' ? 'rgba(90, 169, 201, 0.55)' : 'rgba(90, 169, 201, 0.95)')),
                borderColor: daten.map((d) => farbeFuerPhase(d.phase)),
                borderWidth: { top: 3, right: 0, bottom: 0, left: 0 },
                borderRadius: 4,
            }],
        },
        options: {
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Neuschnee (cm)' } },
                x: { grid: { display: false } },
            },
            plugins: { tooltip: { callbacks: tooltipMitBienen(daten, (d) => `${zahl(d.neuschnee_cm)} cm Neuschnee`) } },
            onHover: (evt, el) => { if (el.length > 0) anzeige(daten[el[0].index]); },
        },
    });

    const schneereichstes = daten.reduce((max, d) => (d.neuschnee_cm > max.neuschnee_cm ? d : max));
    anzeige(schneereichstes);

    const { rueckgang, erholung } = phasenMittel(daten, 'neuschnee_cm');
    const r = korrelation(werte, daten.map((d) => d.veraenderung_prozent));

    document.getElementById('analyse-schnee').innerHTML = `
        <h3>Analyse: Der Winter</h3>
        <p>In der Erholungsphase fiel im Schnitt <strong>${zahl(Math.abs((erholung - rueckgang) / rueckgang * 100), 0)} % ${erholung < rueckgang ? 'weniger' : 'mehr'} Neuschnee</strong>
        (${zahl(erholung)} statt ${zahl(rueckgang)} cm pro Jahr). Das schneereichste Jahr war ${schneereichstes.jahr} mit ${zahl(schneereichstes.neuschnee_cm)} cm,
        und es war für die Bienen ${schneereichstes.veraenderung_prozent < 0 ? 'ein Verlustjahr' : 'ein gutes Jahr'} (${prozent(schneereichstes.veraenderung_prozent)}).</p>
        <p>Im Winter ruhen die Bienen eng zusammengedrängt im Stock und leben von ihren Vorräten. Ob dabei Schnee liegt, spielt für das Volk
        weniger eine Rolle als lange, feuchtkalte Phasen. Der Zusammenhangswert liegt bei ${zahl(r, 2)} – das ist ${staerke(r)} Zusammenhang.</p>`;
}

// ---------------------------------------------------------------------------
// 8. Teil 7: Gesamtschau
// ---------------------------------------------------------------------------

function zeichneGesamtschau(daten) {
    const faktoren = [
        { feld: 'niederschlag_mm', name: 'Regen', beim: 'beim Regen', farbe: FARBEN.regen },
        { feld: 'sonnenscheindauer_h', name: 'Sonne', beim: 'bei der Sonne', farbe: FARBEN.sonne },
        { feld: 'temperatur_c', name: 'Temperatur', beim: 'bei der Temperatur', farbe: FARBEN.temperatur },
        { feld: 'neuschnee_cm', name: 'Schnee', beim: 'beim Schnee', farbe: FARBEN.schnee },
    ];

    faktoren.forEach((f) => {
        const { rueckgang, erholung } = phasenMittel(daten, f.feld);
        f.unterschied = (erholung - rueckgang) / rueckgang * 100;
        f.r = korrelation(daten.map((d) => d[f.feld]), daten.map((d) => d.veraenderung_prozent));
    });

    const balken = (titel, werte, achse, min, max, format) => ({
        type: 'bar',
        data: {
            labels: faktoren.map((f) => f.name),
            datasets: [{ label: titel, data: werte, backgroundColor: faktoren.map((f) => f.farbe), borderRadius: 6 }],
        },
        options: {
            indexAxis: 'y',
            scales: {
                x: {
                    min,
                    max,
                    title: { display: true, text: achse },
                    ticks: { callback: format },
                    grid: { color: (ctx) => (ctx.tick.value === 0 ? '#4a5568' : 'rgba(0,0,0,0.06)') },
                },
                y: { grid: { display: false } },
            },
            plugins: { tooltip: { callbacks: { label: (ctx) => ` ${format(ctx.parsed.x)}` } } },
        },
    });

    new Chart(document.getElementById('chart-vergleich'),
        balken('Unterschied', faktoren.map((f) => f.unterschied), 'Erholung im Vergleich zu Rückgang', undefined, undefined,
            (w) => `${w > 0 ? '+' : ''}${zahl(w, 1)} %`));

    new Chart(document.getElementById('chart-zusammenhang'),
        balken('Zusammenhang', faktoren.map((f) => f.r), 'Zusammenhangswert', -1, 1, (w) => zahl(w, 2)));

    const staerkster = faktoren.reduce((max, f) => (Math.abs(f.r) > Math.abs(max.r) ? f : max));
    const alleSchwach = faktoren.every((f) => Math.abs(f.r) < 0.5);

    document.getElementById('analyse-fazit').innerHTML = `
        <h3>Fazit</h3>
        <p>${alleSchwach ? '<strong>Keiner der vier Wetterwerte hängt stark mit der Entwicklung der Bienen zusammen.</strong>' : ''}
        Am deutlichsten ist er ${staerkster.beim} (${zahl(staerkster.r, 2)}).
        Die Erholungsphase war im Schnitt wärmer und sonniger, mit weniger Schnee. Geregnet hat es in beiden Phasen etwa gleich viel.</p>
        <ul>
            <li><strong>Kurzfristig:</strong> Einzelne Extremjahre, zum Beispiel sehr nasse, fallen oft mit Verlusten zusammen.</li>
            <li><strong>Langfristig:</strong> Das Wetter erklärt weder den langen Rückgang noch die Wende nach dem Tiefpunkt.</li>
            <li><strong>Der blinde Fleck:</strong> Für die Wende kommen andere Gründe in Frage, die nicht in unseren Daten stecken,
            etwa die Bekämpfung der Varroamilbe, die Beratung der Imkerinnen und Imker oder Förderprogramme.</li>
        </ul>`;
}

// ---------------------------------------------------------------------------
// Kleine Helfer für die Wetter-Teile
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Animationen
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

    function neuesTeilchen(obenStarten) {
        return {
            x: Math.random() * canvas.width,
            y: obenStarten ? -10 : Math.random() * canvas.height,
            v: art === 'regen' ? 6 + Math.random() * 6 : 0.5 + Math.random() * 1.2,
            r: art === 'regen' ? 10 + Math.random() * 10 : 1.5 + Math.random() * 3,
            phase: Math.random() * Math.PI * 2,
        };
    }

    function bild() {
        if (!sichtbar) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Anzahl Teilchen passt sich langsam an die Stärke an
        const soll = Math.round(10 + ziel * (art === 'regen' ? 140 : 180));
        while (teilchen.length < soll) teilchen.push(neuesTeilchen(true));
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
            if (t.y > canvas.height + 20) teilchen[i] = neuesTeilchen(true);
        });

        requestAnimationFrame(bild);
    }

    // Nur animieren, wenn der Abschnitt sichtbar ist
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

// Eine Biene fliegt in Schleifen durch die Einführung
function starteFlugbiene() {
    const biene = document.getElementById('flugbiene');
    if (bewegungAus) {
        biene.style.display = 'none';
        return;
    }

    let maus = { x: -999, y: -999 };
    window.addEventListener('mousemove', (e) => { maus = { x: e.clientX, y: e.clientY + window.scrollY }; });

    let x = 200, y = 200, letztesX = x;
    function flug(zeit) {
        const t = zeit / 1000;
        const hero = document.querySelector('.hero');
        const breite = hero.offsetWidth;
        const hoehe = hero.offsetHeight;

        // Achterschleife plus etwas Zittern
        let zx = breite * (0.5 + 0.38 * Math.sin(t * 0.45));
        let zy = hoehe * (0.5 + 0.3 * Math.sin(t * 0.9)) + Math.sin(t * 9) * 6;

        // Kommt die Maus zu nah, weicht die Biene aus
        const dx = zx - maus.x, dy = zy - maus.y;
        const abstand = Math.hypot(dx, dy);
        if (abstand < 120) {
            zx += dx / abstand * (120 - abstand);
            zy += dy / abstand * (120 - abstand);
        }

        x += (zx - x) * 0.06;
        y += (zy - y) * 0.06;

        const blickNachLinks = x < letztesX;
        biene.style.transform = `translate(${x}px, ${y}px) scaleX(${blickNachLinks ? 1 : -1})`;
        letztesX = x;
        requestAnimationFrame(flug);
    }
    requestAnimationFrame(flug);
}

// Abschnitte sanft einblenden, sobald sie ins Bild scrollen
function starteEinblenden() {
    const abschnitte = document.querySelectorAll('main > section');
    if (bewegungAus) return;
    abschnitte.forEach((s) => s.classList.add('versteckt'));
    const beobachter = new IntersectionObserver((eintraege) => {
        eintraege.forEach((e) => {
            if (e.isIntersecting) {
                e.target.classList.remove('versteckt');
                beobachter.unobserve(e.target);
            }
        });
    }, { threshold: 0.1 });
    abschnitte.forEach((s) => beobachter.observe(s));
}
