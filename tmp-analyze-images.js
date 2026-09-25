const https = require('https');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'node' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'node' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

(async () => {
  const api = 'https://api.github.com/repos/AdamPark7014/ARTA-app/contents/docs/pr5-screens?ref=cursor/excel-professional-ui-ff0d';
  const list = await new Promise((resolve, reject) => {
    https.get(api, { headers: { 'User-Agent': 'node', Accept: 'application/vnd.github+json' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
  const out = [];
  for (const f of list) {
    if (!/\.png$/i.test(f.name)) continue;
    const buf = await fetchBuffer(f.download_url);
    const png = PNG.sync.read(buf);
    const set = new Set();
    const { data, width, height } = png;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (width * y + x) << 2;
        set.add(`${data[i]},${data[i+1]},${data[i+2]},${data[i+3]}`);
      }
    }
    out.push({ name: f.name, size: f.size, colors: set.size, sha: f.sha });
  }
  out.sort((a,b) => a.name.localeCompare(b.name));
  console.log(JSON.stringify(out, null, 2));
})();
