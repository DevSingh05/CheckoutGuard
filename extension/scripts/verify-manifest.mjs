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
assert.equal(manifest.host_permissions.length, 1);
assert.ok(!manifest.host_permissions[0].includes('://*'));
assert.equal(manifest.content_scripts?.length || 0, 0);
console.log(
  'Manifest verified: MV3 side panel, explicit-click extraction, one backend host.',
);
