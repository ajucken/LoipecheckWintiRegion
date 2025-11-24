const areaContainer = document.getElementById('areas');
const statusAlert = document.getElementById('statusAlert');
const lastUpdated = document.getElementById('lastUpdated');
const loadingState = document.getElementById('loadingState');

const STATUS_META = {
  open: { label: 'Offen', className: 'success' },
  closed: { label: 'Geschlossen', className: 'danger' },
  partial: { label: 'Eingeschränkt', className: 'warning' },
  unknown: { label: 'Unbekannt', className: 'secondary' }
};

function createBadge(status) {
  const meta = STATUS_META[status] || STATUS_META.unknown;
  const span = document.createElement('span');
  span.className = `badge bg-${meta.className} status-pill`;
  span.textContent = meta.label;
  return span;
}

function createTrailTable(trails) {
  const table = document.createElement('table');
  table.className = 'table table-sm align-middle mb-0';
  table.innerHTML = `
    <thead>
      <tr>
        <th class="text-nowrap">Segment</th>
        <th>Stil</th>
        <th class="text-nowrap">Distanz</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');
  trails.forEach((trail) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${trail.name || '—'}</td>
      <td>${trail.style || '—'}</td>
      <td>${trail.distance || '—'}</td>
      <td></td>
    `;
    tr.querySelector('td:last-child').appendChild(createBadge(trail.status));
    tbody.appendChild(tr);
  });
  return table;
}

function createActionButtons(area) {
  const wrapper = document.createElement('div');
  wrapper.className = 'd-flex flex-wrap gap-2 mt-3';
  const reportBtn = document.createElement('a');
  reportBtn.className = 'btn btn-outline-primary btn-sm';
  reportBtn.href = area.url;
  reportBtn.target = '_blank';
  reportBtn.rel = 'noopener noreferrer';
  reportBtn.textContent = 'Zum Loipenbericht';
  wrapper.appendChild(reportBtn);
  if (area.webcamUrl) {
    const camBtn = document.createElement('a');
    camBtn.className = 'btn btn-outline-secondary btn-sm';
    camBtn.href = area.webcamUrl;
    camBtn.target = '_blank';
    camBtn.rel = 'noopener noreferrer';
    camBtn.textContent = 'Webcam öffnen';
    wrapper.appendChild(camBtn);
  }
  return wrapper;
}

function createAreaCard(area) {
  const col = document.createElement('div');
  col.className = 'col-12 col-lg-6';
  const card = document.createElement('div');
  card.className = 'card h-100 shadow-sm';
  const cardBody = document.createElement('div');
  cardBody.className = 'card-body d-flex flex-column';

  const header = document.createElement('div');
  header.className = 'd-flex justify-content-between align-items-start gap-2 mb-2';
  const title = document.createElement('div');
  title.innerHTML = `<h5 class="mb-0">${area.name}</h5>`;
  header.appendChild(title);
  header.appendChild(createBadge(area.open ? 'open' : 'closed'));

  const metaInfo = document.createElement('p');
  metaInfo.className = 'text-muted small mb-3';
  metaInfo.textContent = area.updated ? `Stand: ${area.updated}` : 'Stand: keine Angabe';

  cardBody.appendChild(header);
  cardBody.appendChild(metaInfo);

  if (area.error) {
    const errorAlert = document.createElement('div');
    errorAlert.className = 'alert alert-warning mb-0';
    errorAlert.textContent = `Fehler beim Abrufen: ${area.error}`;
    cardBody.appendChild(errorAlert);
  } else {
    if (area.summary) {
      const summary = document.createElement('p');
      summary.textContent = area.summary;
      cardBody.appendChild(summary);
    }
    if (area.trails && area.trails.length) {
      cardBody.appendChild(createTrailTable(area.trails));
    } else {
      const placeholder = document.createElement('p');
      placeholder.className = 'text-muted mb-0';
      placeholder.textContent = 'Keine detaillierten Streckendaten verfügbar.';
      cardBody.appendChild(placeholder);
    }
    cardBody.appendChild(createActionButtons(area));
  }

  card.appendChild(cardBody);
  col.appendChild(card);
  return col;
}

async function loadData() {
  try {
    const response = await fetch(`data/loipen.json?ts=${Date.now()}`);
    if (!response.ok) throw new Error('API-Fehler');
    const payload = await response.json();
    const { areas, generatedAt } = payload;
    areaContainer.innerHTML = '';
    if (areas?.length) {
      areas.forEach((area) => areaContainer.appendChild(createAreaCard(area)));
    }
    lastUpdated.textContent = generatedAt ? `Zuletzt aktualisiert: ${new Date(generatedAt).toLocaleString('de-CH')}` : '';
  } catch (error) {
    statusAlert.textContent = `Daten konnten nicht geladen werden (${error.message}).`;
    statusAlert.classList.remove('d-none');
  } finally {
    loadingState.classList.add('d-none');
  }
}

loadData();
