// Bienen-Datastory – Frontend
//
// Holt die Daten von unload.php. Antwortet der Server nicht, nimmt die Seite
// die Musterdaten aus data/bienenjahre.json (gleicher Datenvertrag) und sagt
// das im Statustext.

const ENDPOINT = 'unload.php';
const FALLBACK = 'data/bienenjahre.json';

const farben = {
    'Rückgang': '#c0582b',
    'Erholung': '#4f8a3c',
    regen: '#3a6ea5',
};

let chart = null;
let fallbackAktiv = false;

const zahl = (wert) => wert.toLocaleString('de-CH');

// Daten laden. phase ist '', 'rueckgang' oder 'erholung'.
async function ladeDaten(phase = '') {
    const url = phase ? `${ENDPOINT}?phase=${phase}` : ENDPOINT;

    try {
        const antwort = await fetch(url);
        if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
        fallbackAktiv = false;
        return await antwort.json();
    } catch (fehler) {
        console.warn('unload.php nicht erreichbar, nehme Musterdaten:', fehler);
        fallbackAktiv = true;

        const antwort = await fetch(FALLBACK);
        const daten = await antwort.json();

        // Ohne Server filtern wir im Browser.
        const phaseName = { rueckgang: 'Rückgang', erholung: 'Erholung' }[phase];
        return phaseName ? daten.filter((d) => d.phase === phaseName) : daten;
    }
}

function zeigeKennzahlen(daten) {
    const erstes = daten[0];
    const letztes = daten[daten.length - 1];
    const tief = daten.reduce((min, d) => (d.bienenvoelker < min.bienenvoelker ? d : min));

    document.querySelector('#kz-start').textContent = zahl(erstes.bienenvoelker);
    document.querySelector('#kz-tief').textContent = zahl(tief.bienenvoelker);
    document.querySelector('#kz-tief-label').textContent = `Tiefpunkt ${tief.jahr}`;
    document.querySelector('#kz-ende').textContent = zahl(letztes.bienenvoelker);
}

function zeigeDetail(jahr) {
    const p = document.querySelector('#detail');
    const veraenderung = jahr.veraenderung_abs === null
        ? 'kein Vorjahr in den Daten'
        : `${jahr.veraenderung_abs > 0 ? '+' : ''}${zahl(jahr.veraenderung_abs)} Völker (${jahr.veraenderung_prozent} %) zum Vorjahr`;

    p.innerHTML = `<strong>${jahr.jahr}</strong> · Phase «${jahr.phase}» · `
        + `${zahl(jahr.bienenvoelker)} Bienenvölker, ${veraenderung} · `
        + `${jahr.niederschlag_mm} mm Niederschlag`;
}

function zeichne(daten) {
    if (chart) chart.destroy();

    chart = new Chart(document.querySelector('#chart-bienen'), {
        data: {
            labels: daten.map((d) => d.jahr),
            datasets: [
                {
                    type: 'bar',
                    label: 'Bienenvölker',
                    data: daten.map((d) => d.bienenvoelker),
                    backgroundColor: daten.map((d) => farben[d.phase]),
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: 'Niederschlag (mm)',
                    data: daten.map((d) => d.niederschlag_mm),
                    borderColor: farben.regen,
                    backgroundColor: farben.regen,
                    tension: 0.3,
                    yAxisID: 'y2',
                },
            ],
        },
        options: {
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Bienenvölker' } },
                y2: {
                    position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Niederschlag (mm)' },
                },
            },
            onClick: (event, elemente) => {
                if (elemente.length > 0) zeigeDetail(daten[elemente[0].index]);
            },
        },
    });

    document.querySelector('#status').textContent = fallbackAktiv
        ? 'Hinweis: Die Datenbank ist nicht erreichbar, angezeigt werden die Musterdaten.'
        : `Live aus der Datenbank · ${daten.length} Jahre`;
}

// Filter-Knöpfe: jeder Klick lädt neu über ?phase=
document.querySelectorAll('.filter button').forEach((knopf) => {
    knopf.addEventListener('click', async () => {
        document.querySelectorAll('.filter button').forEach((k) => k.classList.remove('aktiv'));
        knopf.classList.add('aktiv');
        zeichne(await ladeDaten(knopf.dataset.phase));
    });
});

// Start
(async () => {
    const daten = await ladeDaten();
    zeigeKennzahlen(daten);
    zeichne(daten);
})();
