document.addEventListener('DOMContentLoaded', () => {
    const dataUrl = 'unload.php';

    fetch(dataUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server-Fehler: ${response.status}`);
            }
            return response.json();
        })
        .then(payload => {
            // Flexibel: Handhabt direkte Arrays [ {...} ] und verschachtelte Objekte { data: [...] }
            const data = Array.isArray(payload) ? payload : (payload.data || []);

            if (data.length === 0) {
                throw new Error('Keine Daten vorhanden.');
            }

            initDashboard(data);
        })
        .catch(err => {
            console.warn('Fehler beim Laden über unload.php, versuche Fallback-Datei:', err);

            // Fallback: Lade aus dem Ordner data/ falls die Datenbank noch nicht gefüllt ist
            fetch('data/bienenjahre.json')
                .then(res => res.json())
                .then(data => initDashboard(data))
                .catch(e => {
                    console.error('Fallback fehlgeschlagen:', e);
                    document.getElementById('status').innerText = 'Fehler beim Laden der Daten. Bitte etl/load.php aufrufen.';
                });
        });
});

function initDashboard(data) {
    // 1. Kennzahlen in den Kacheln setzen
    const start = data[0];
    const ende = data[data.length - 1];
    const tief = data.reduce((min, p) => p.bienenvoelker < min.bienenvoelker ? p : min, data[0]);

    document.getElementById('kz-start').innerText = start.bienenvoelker.toLocaleString('de-CH');
    document.getElementById('kz-tief').innerText = tief.bienenvoelker.toLocaleString('de-CH');
    document.getElementById('kz-tief-label').innerText = `Tiefpunkt ${tief.jahr}`;
    document.getElementById('kz-ende').innerText = ende.bienenvoelker.toLocaleString('de-CH');

    const jahre = data.map(d => d.jahr);
    const bienen = data.map(d => d.bienenvoelker);

    // Farbzuordnung aus dem Originaldesign: Braun für Rückgang (#c85a28), Grün für Erholung (#4e8536)
    const barColors = data.map(d => d.phase === 'Rückgang' ? '#c85a28' : '#4e8536');

    // -------------------------------------------------------------
    // 1. Diagramm: Niederschlag (Original)
    // -------------------------------------------------------------
    const ctxBienen = document.getElementById('chart-bienen').getContext('2d');
    const chart1 = new Chart(ctxBienen, {
        type: 'bar',
        data: {
            labels: jahre,
            datasets: [
                { label: 'Bienenvölker', data: bienen, backgroundColor: barColors, yAxisID: 'y' },
                {
                    label: 'Niederschlag (mm)',
                    data: data.map(d => d.niederschlag_mm),
                    type: 'line',
                    borderColor: '#2b6cb0',
                    backgroundColor: '#2b6cb0',
                    borderWidth: 3,
                    pointRadius: 4,
                    tension: 0.2,
                    yAxisID: 'y1'
                }
            ]
        },
        options: createChartOptions('Bienenvölker', 'Niederschlag (mm)', (evt, active) => {
            if (active.length > 0) {
                const idx = active[0].index;
                const d = data[idx];
                document.getElementById('detail').innerText =
                    `Jahr ${d.jahr}: ${d.bienenvoelker.toLocaleString('de-CH')} Völker (${d.phase}) · Niederschlag: ${d.niederschlag_mm ?? '-'} mm · Sonne: ${d.sonnenscheindauer_h ?? '-'} h · Temp: ${d.temperatur_c ?? '-'} °C · Schnee: ${d.neuschnee_cm ?? '-'} cm`;
            }
        })
    });

    // Filter-Buttons für Diagramm 1 ("Alle Jahre", "Rückgang", "Erholung")
    document.querySelectorAll('.filter button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter button').forEach(b => b.classList.remove('aktiv'));
            e.target.classList.add('aktiv');

            const phase = e.target.getAttribute('data-phase');
            const filtered = phase === 'rueckgang' ? data.filter(d => d.phase === 'Rückgang') :
                phase === 'erholung'  ? data.filter(d => d.phase === 'Erholung') : data;

            chart1.data.labels = filtered.map(d => d.jahr);
            chart1.data.datasets[0].data = filtered.map(d => d.bienenvoelker);
            chart1.data.datasets[0].backgroundColor = filtered.map(d => d.phase === 'Rückgang' ? '#c85a28' : '#4e8536');
            chart1.data.datasets[1].data = filtered.map(d => d.niederschlag_mm);
            chart1.update();
        });
    });

    // -------------------------------------------------------------
    // 2. Diagramm: Sonnenscheindauer
    // -------------------------------------------------------------
    new Chart(document.getElementById('chart-sonne').getContext('2d'), {
        type: 'bar',
        data: {
            labels: jahre,
            datasets: [
                { label: 'Bienenvölker', data: bienen, backgroundColor: barColors, yAxisID: 'y' },
                {
                    label: 'Sonnenscheindauer (h)',
                    data: data.map(d => d.sonnenscheindauer_h),
                    type: 'line',
                    borderColor: '#dd6b20',
                    backgroundColor: '#dd6b20',
                    borderWidth: 3,
                    pointRadius: 4,
                    tension: 0.2,
                    yAxisID: 'y1'
                }
            ]
        },
        options: createChartOptions('Bienenvölker', 'Sonnenscheindauer (h)')
    });

    // -------------------------------------------------------------
    // 3. Diagramm: Temperatur
    // -------------------------------------------------------------
    new Chart(document.getElementById('chart-temp').getContext('2d'), {
        type: 'bar',
        data: {
            labels: jahre,
            datasets: [
                { label: 'Bienenvölker', data: bienen, backgroundColor: barColors, yAxisID: 'y' },
                {
                    label: 'Temperatur (°C)',
                    data: data.map(d => d.temperatur_c),
                    type: 'line',
                    borderColor: '#e53e3e',
                    backgroundColor: '#e53e3e',
                    borderWidth: 3,
                    pointRadius: 4,
                    tension: 0.2,
                    yAxisID: 'y1'
                }
            ]
        },
        options: createChartOptions('Bienenvölker', 'Temperatur (°C)')
    });

    // -------------------------------------------------------------
    // 4. Diagramm: Neuschnee
    // -------------------------------------------------------------
    new Chart(document.getElementById('chart-schnee').getContext('2d'), {
        type: 'bar',
        data: {
            labels: jahre,
            datasets: [
                { label: 'Bienenvölker', data: bienen, backgroundColor: barColors, yAxisID: 'y' },
                {
                    label: 'Neuschnee (cm)',
                    data: data.map(d => d.neuschnee_cm),
                    type: 'line',
                    borderColor: '#319795',
                    backgroundColor: '#319795',
                    borderWidth: 3,
                    pointRadius: 4,
                    tension: 0.2,
                    yAxisID: 'y1'
                }
            ]
        },
        options: createChartOptions('Bienenvölker', 'Neuschnee (cm)')
    });

    // -------------------------------------------------------------
    // 5. Diagramm: Gesamtschau (Alle Faktoren)
    // -------------------------------------------------------------
    new Chart(document.getElementById('chart-alle').getContext('2d'), {
        type: 'line',
        data: {
            labels: jahre,
            datasets: [
                { label: 'Bienenvölker', data: bienen, borderColor: '#c85a28', borderWidth: 3, yAxisID: 'y' },
                { label: 'Niederschlag (mm)', data: data.map(d => d.niederschlag_mm), borderColor: '#2b6cb0', borderWidth: 2, yAxisID: 'y1' },
                { label: 'Sonnenschein (h)', data: data.map(d => d.sonnenscheindauer_h), borderColor: '#dd6b20', borderWidth: 2, yAxisID: 'y1' },
                { label: 'Temperatur (°C x 100)', data: data.map(d => d.temperatur_c ? d.temperatur_c * 100 : null), borderColor: '#e53e3e', borderWidth: 2, yAxisID: 'y1' },
                { label: 'Neuschnee (cm)', data: data.map(d => d.neuschnee_cm), borderColor: '#319795', borderWidth: 2, yAxisID: 'y1' }
            ]
        },
        options: createChartOptions('Bienenvölker', 'Klimawerte (skaliert)', null)
    });
}

// Hilfsfunktion zur Erstellung einheitlicher Optionen für Chart.js
function createChartOptions(yLabelLeft, yLabelRight, onClickHandler = null) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        onClick: onClickHandler,
        scales: {
            y: {
                type: 'linear',
                position: 'left',
                title: { display: true, text: yLabelLeft },
                suggestedMax: 300000
            },
            y1: {
                type: 'linear',
                position: 'right',
                title: { display: true, text: yLabelRight },
                grid: { drawOnChartArea: false }
            }
        }
    };
}