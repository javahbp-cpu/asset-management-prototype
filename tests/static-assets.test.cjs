const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || entry.name === 'tests') return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : file.endsWith('.html') ? [file] : [];
  });
}

test('all pages request the current shared assets instead of a cached previous release', () => {
  const stale = [];
  let references = 0;
  for (const file of htmlFiles(root)) {
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(/(?:src|href)="((?:\.\.\/)?assets\/(?:app\.js|proto\.css)(?:\?[^" ]*)?)"/g)) {
      references++;
      const [relative, query = ''] = match[1].split('?');
      const bytes = readFileSync(path.resolve(path.dirname(file), relative));
      const version = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
      // 内容更新时必须同步资源地址，避免新版页面执行旧版路由脚本。
      if (new URLSearchParams(query).get('v') !== version) stale.push(`${path.relative(root, file)}: ${match[1]}`);
    }
  }
  assert.ok(references > 0, 'no shared asset references checked');
  assert.deepEqual(stale, [], 'shared asset URLs must include their current content hash');
});
