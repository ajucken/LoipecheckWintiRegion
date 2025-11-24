#!/usr/bin/env node
const path = require('path');
const fs = require('fs/promises');
const { fetchAllStatuses } = require('../src/sources');

async function main() {
  try {
    const areas = await fetchAllStatuses();
    const payload = {
      generatedAt: new Date().toISOString(),
      areas
    };
    const outputDir = path.join(__dirname, '../public/data');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'loipen.json');
    await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
    console.log(`✔️  Wrote ${outputPath}`);
  } catch (error) {
    console.error('Build failed:', error.message);
    process.exitCode = 1;
  }
}

main();
