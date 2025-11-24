const cheerio = require('cheerio');

const HTTP_HEADERS = {
  'User-Agent': 'LoipencheckBot/1.0 (+https://example.com/contact)',
  'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8'
};

function clean(text) {
  return text ? text.replace(/\s+/g, ' ').trim() : '';
}

function parseStatusFromText(text) {
  const value = clean(text).toLowerCase();
  if (!value) return 'unknown';
  if (/(geöffnet|geoeffnet|offen|präpariert|praepariert|befahrbar|betrieb)/i.test(value)) {
    return 'open';
  }
  if (/(geschlossen|zu|nicht offen|gesperrt)/i.test(value)) {
    return 'closed';
  }
  if (/(teilweise|eingeschränkt|eingeschraenkt|kritisch|vorsicht|wenig schnee|in vorbereitung|präparation)/i.test(value)) {
    return 'partial';
  }
  return 'unknown';
}

function statusFromIconClass(className = '') {
  if (className.includes('icon-status0')) return 'closed';
  if (className.includes('icon-status1')) return 'partial';
  if (className.includes('icon-status2') || className.includes('icon-status3')) return 'open';
  return 'unknown';
}

function statusFromGaisIcon(className = '') {
  if (className.includes('icon-offen')) return 'open';
  if (className.includes('icon-kritisch')) return 'partial';
  if (className.includes('icon-geschlossen')) return 'closed';
  return 'unknown';
}

function statusFromFacilityClass(className = '') {
  if (className.includes('status--success')) return 'open';
  if (className.includes('status--info')) return 'partial';
  if (className.includes('status--error')) return 'closed';
  return 'unknown';
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HTTP_HEADERS, redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
}

async function fetchBergfex(meta) {
  const html = await fetchHtml(meta.url);
  const $ = cheerio.load(html);
  const updated = clean($('dl.loipen-bericht dd').first().text());
  const operation = clean($('dl.loipen-bericht dt').filter((_, el) => /Betrieb/i.test($(el).text())).next('dd').text());
  const trails = [];
  $('table.status-table tbody tr').each((_, row) => {
    const name = clean($(row).find('.loipen-name .bold').text());
    if (!name) return;
    const style = clean($(row).find('.loipen-name .small').text());
    const distance = clean($(row).find('.loipen-laenge').text());
    const desktopStatus = clean($(row).find('td.desktop-only').text());
    const iconClass = $(row).find('.icon-status').attr('class') || '';
    const status = desktopStatus && desktopStatus !== '-' ? parseStatusFromText(desktopStatus) : statusFromIconClass(iconClass);
    trails.push({
      name,
      style,
      distance,
      status,
      detail: null
    });
  });
  return {
    updated,
    open: /offen|betrieb/i.test(operation),
    summary: operation || null,
    trails
  };
}

async function fetchTannenberg(meta) {
  const html = await fetchHtml(meta.url);
  const $ = cheerio.load(html);
  const widget = $('#secondary .widget_text').filter((_, el) => /Schneebericht/i.test($(el).find('.widget-title').text())).first();
  const paragraphs = widget.find('.textwidget p').map((_, el) => clean($(el).text())).get().filter(Boolean);
  const updated = paragraphs[0] || null;
  const info = paragraphs.slice(1, 4).join(' ');
  const open = /präpariert|offen/i.test(info) && !/geschlossen/i.test(info);
  return {
    updated,
    open,
    summary: info || null,
    trails: [
      {
        name: 'Tannenberg Loipen',
        style: 'Klassisch & Skating',
        distance: '3-15 km',
        status: open ? 'open' : 'closed',
        detail: info || 'Keine zusätzlichen Angaben'
      }
    ]
  };
}

function extractCommentTimestamp(html, label) {
  const regex = new RegExp(`${label}\\" \(letzte Aktualisierung am ([^)]+)\)`);
  const match = html.match(regex);
  return match ? match[1] : null;
}

async function fetchSchwedentritt(meta) {
  const html = await fetchHtml(meta.url);
  const $ = cheerio.load(html);
  const updated = extractCommentTimestamp(html, 'Loipenzustand') || null;
  const trails = [];
  let currentDistance = null;
  $('#block_12564 table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (!cells.length) return;
    if (cells.length === 3) {
      currentDistance = clean($(cells[0]).text());
      const style = clean($(cells[1]).text());
      const status = parseStatusFromText($(cells[2]).text());
      trails.push({
        name: `${currentDistance} ${style}`,
        style,
        distance: currentDistance,
        status,
        detail: null
      });
    } else if (cells.length === 2 && currentDistance) {
      const style = clean($(cells[0]).text());
      const status = parseStatusFromText($(cells[1]).text());
      trails.push({
        name: `${currentDistance} ${style}`,
        style,
        distance: currentDistance,
        status,
        detail: null
      });
    }
  });
  const open = trails.some((trail) => trail.status === 'open');
  return {
    updated,
    open,
    summary: 'Loipenbericht Schwedentritt',
    trails
  };
}

async function fetchGais(meta) {
  const html = await fetchHtml(meta.url);
  const $ = cheerio.load(html);
  const trails = [];
  $('div.table--loipe table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;
    const segment = clean($(cells[0]).text());
    const klassik = statusFromGaisIcon($(cells[1]).find('span').attr('class'));
    const skating = statusFromGaisIcon($(cells[2]).find('span').attr('class'));
    if (klassik !== 'unknown') {
      trails.push({ name: `${segment} (klassisch)`, style: 'Klassisch', distance: null, status: klassik, detail: null });
    }
    if (skating !== 'unknown') {
      trails.push({ name: `${segment} (skating)`, style: 'Skating', distance: null, status: skating, detail: null });
    }
  });
  const updated = clean($('div.mod_article h2').filter((_, el) => /Loipenzustand/i.test($(el).text())).closest('.content-table').find('p').first().text()) || null;
  const open = trails.some((trail) => trail.status === 'open');
  return {
    updated,
    open,
    summary: 'Langlaufzentrum Gais – Statusübersicht',
    trails
  };
}

async function fetchSchauenberg(meta) {
  const html = await fetchHtml(meta.url);
  const $ = cheerio.load(html);
  const content = $('.w-post-elm.post_content');
  const lines = content.find('p').map((_, el) => clean($(el).text())).get().filter(Boolean);
  const updatedLine = lines.find((line) => /\d{1,2}\.\s*\w+\s*20\d{2}/.test(line)) || null;
  const trails = [];
  const mapping = [
    { key: /Loipen\s+Huggenberg/i, label: 'Loipen Huggenberg' },
    { key: /Waldloipe/i, label: 'Waldloipe' },
    { key: /Nachtloipe/i, label: 'Nachtloipe' }
  ];
  lines.forEach((line) => {
    mapping.forEach((entry) => {
      if (entry.key.test(line)) {
        const status = parseStatusFromText(line);
        trails.push({ name: entry.label, style: null, distance: null, status, detail: line });
      }
    });
  });
  const webcam = content.find('a[href*="roundshot"]').attr('href') || null;
  const open = trails.some((trail) => trail.status === 'open');
  return {
    updated: updatedLine,
    open,
    summary: lines.slice(0, 4).join(' ') || null,
    trails,
    webcamUrl: webcam
  };
}

async function fetchKyburg(meta) {
  const html = await fetchHtml(meta.url);
  const $ = cheerio.load(html);
  const table = $('table').filter((_, el) => {
    const header = clean($(el).find('tr').first().text());
    return /Zustand/i.test(header) && /Loipe/i.test(header);
  }).first();
  const trails = [];
  table.find('tr').slice(1).each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;
    const name = clean($(cells[0]).text());
    if (!name) return;
    const distance = clean($(cells[1]).text());
    const status = parseStatusFromText($(cells[2]).text());
    const detail = clean($(cells[3]).text());
    trails.push({ name, style: null, distance, status, detail: detail || null });
  });
  const notice = clean(table.parent().find('p').first().text());
  const open = trails.some((trail) => trail.status === 'open');
  return {
    updated: null,
    open,
    summary: notice || 'Status gemäss Loipen Kyburg',
    trails
  };
}

async function fetchFlumserberg(meta) {
  const html = await fetchHtml(meta.url);
  const $ = cheerio.load(html);
  const trails = [];
  $('table.facility-table tbody tr').each((_, row) => {
    if ($(row).attr('aria-hidden') === 'true') return;
    const cells = $(row).find('td');
    if (cells.length < 4) return;
    const typeIcon = $(cells[1]).find('span');
    const typeTitle = typeIcon.attr('title') || typeIcon.attr('aria-label') || '';
    if (!/Langlauf/i.test(typeTitle)) return;
    const styleMatch = typeTitle.match(/Langlauf\s*\(([^)]+)\)/i);
    const style = styleMatch ? styleMatch[1] : clean(typeTitle.replace(/Langlauf/i, '')) || null;
    const name = clean($(cells[2]).text());
    if (!name) return;
    const statusClass = $(cells[3]).find('.status').attr('class') || '';
    const status = statusFromFacilityClass(statusClass);
    trails.push({ name, style, distance: null, status, detail: null });
  });
  const legendNote = clean($('table.facility-table').last().next().text()) || null;
  const open = trails.some((trail) => trail.status === 'open');
  return {
    updated: null,
    open,
    summary: legendNote || 'Status laut Bergbahnen Flumserberg',
    trails
  };
}

const SOURCE_DEFINITIONS = [
  {
    id: 'bergfex',
    name: 'Panoramaloipe Gibswil / am Bachtel',
    url: 'https://www.bergfex.ch/zuerich/langlaufen/gibswil-bachtel-amslen/loipenplan/',
    webcamUrl: 'https://www.bergfex.ch/zuerich/langlaufen/gibswil-bachtel-amslen/webcams/',
    fetchData: fetchBergfex
  },
  {
    id: 'tannenberg',
    name: 'Skiclub Tannenberg',
    url: 'https://www.skiclubtannenberg.ch/lopie/',
    webcamUrl: 'https://www.skiclubtannenberg.ch/webcam/',
    fetchData: fetchTannenberg
  },
  {
    id: 'schwedentritt',
    name: 'Loipe Schwedentritt Einsiedeln',
    url: 'https://www.schwedentritt.ch/langlauf-einsiedeln-loipenzustand-news',
    webcamUrl: 'https://www.schwedentritt.ch/?page=67',
    fetchData: fetchSchwedentritt
  },
  {
    id: 'gais',
    name: 'Langlaufzentrum Gais',
    url: 'https://langlauf-gais.ch/',
    webcamUrl: 'https://langlauf-gais.ch/webcam',
    fetchData: fetchGais
  },
  {
    id: 'schauenberg',
    name: 'Loipen Schauenberg',
    url: 'https://www.loipen-schauenberg.ch/loipenbericht/',
    webcamUrl: 'https://schauenberg.roundshot.co/',
    fetchData: fetchSchauenberg
  },
  {
    id: 'kyburg',
    name: 'Loipe First-Kyburg',
    url: 'https://loipekyburg.ch/',
    webcamUrl: null,
    fetchData: fetchKyburg
  },
  {
    id: 'flumserberg',
    name: 'Langlauf Flumserberg',
    url: 'https://www.flumserberg.ch/langlauf',
    webcamUrl: 'https://www.flumserberg.ch/webcam',
    fetchData: fetchFlumserberg
  }
];

async function fetchAllStatuses() {
  const timestamp = new Date().toISOString();
  const settled = await Promise.allSettled(SOURCE_DEFINITIONS.map((def) => def.fetchData({ ...def })));
  return settled.map((result, index) => {
    const base = {
      id: SOURCE_DEFINITIONS[index].id,
      name: SOURCE_DEFINITIONS[index].name,
      url: SOURCE_DEFINITIONS[index].url,
      webcamUrl: SOURCE_DEFINITIONS[index].webcamUrl,
      fetchedAt: timestamp
    };
    if (result.status === 'fulfilled') {
      const payload = result.value || {};
      return {
        ...base,
        ...payload,
        webcamUrl: payload.webcamUrl || base.webcamUrl,
        error: null
      };
    }
    return {
      ...base,
      updated: null,
      open: false,
      summary: null,
      trails: [],
      error: result.reason.message
    };
  });
}

module.exports = { fetchAllStatuses };
