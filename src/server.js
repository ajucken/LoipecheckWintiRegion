const path = require('path');
const express = require('express');
const { fetchAllStatuses } = require('./sources');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

app.get('/api/loipen', async (req, res) => {
  try {
    const data = await fetchAllStatuses();
    res.set('Cache-Control', 'no-store');
    res.json({
      generatedAt: new Date().toISOString(),
      areas: data
    });
  } catch (error) {
    console.error('Failed to build response', error);
    res.status(500).json({ error: 'Aggregation failed' });
  }
});

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(express.static(path.join(__dirname, '../public')));

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Loipencheck server listening on port ${PORT}`);
});
