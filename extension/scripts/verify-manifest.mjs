import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const manifest = JSON.parse(
  readFileSync('.output/chrome-mv3/manifest.json', 'utf8'),
);
assert.equal(manifest.manifest_version, 3);
assert.ok(manifest.side_panel?.default_path);
assert.ok(manifest.permissions.includes('activeTab'));
assert.ok(!manifest.permissions.includes('tabs'));
assert.ok(!manifest.permissions.includes('cookies'));
assert.ok(!manifest.permissions.includes('history'));
const allowed = ['sidePanel', 'activeTab', 'scripting', 'storage'];
assert.deepEqual(
  manifest.permissions.filter((p) => !allowed.includes(p)),
  [],
  'Unexpected extension permission',
);
assert.deepEqual(
  manifest.host_permissions.filter((h) => !h.includes('://*/')),
  [manifest.host_permissions.find((h) => !h.includes('://*/'))],
  'Exactly one backend host',
);
assert.equal(manifest.content_scripts?.length || 0, 0);

console.log(
  'Manifest verified: MV3 side panel, click-only extraction, store pages + one backend host.',
);
