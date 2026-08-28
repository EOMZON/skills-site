import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const read = (relative) => fs.readFileSync(path.join(dist, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(dist, relative));
const registry = JSON.parse(read('data/registry.json'));
const sceneGuides = JSON.parse(read('data/scene-guides.json'));
const ndjson = read('data/skills.ndjson').trim().split('\n').filter(Boolean).map(JSON.parse);

assert.equal(registry.total_skills, registry.skills.length, 'registry total must match skills');
assert.equal(ndjson.length, registry.skills.length, 'NDJSON must match registry skills');
assert.equal(new Set(registry.skills.map((skill) => skill.id)).size, registry.skills.length, 'skill IDs must be unique');

const skillIds = new Set(registry.skills.map((skill) => skill.id));
for (const skill of registry.skills) {
  for (const field of ['id', 'title', 'summary', 'scene', 'invoke', 'source_tree_url']) {
    assert.ok(skill[field], `${skill.id || 'skill'} missing ${field}`);
  }
  assert.ok(['public', 'sanitized'].includes(skill.visibility), `${skill.id} must be publishable`);
  assert.match(skill.source_tree_url, /^https:\/\/github\.com\/EOMZON\/skills-registry\//, `${skill.id} source owner mismatch`);
  assert.ok(exists(`data/skills/${skill.id}.json`), `${skill.id} data missing`);
  assert.ok(exists(`skills/${skill.id}/index.html`), `${skill.id} detail missing`);
  assert.match(
    read(`skills/${skill.id}/index.html`),
    new RegExp(`<link rel="canonical" href="https://skills\\.zondev\\.top/skills/${skill.id}/index\\.html"`),
    `${skill.id} canonical path drifted`
  );
}

assert.equal(registry.scenes.length, sceneGuides.scenes.length, 'scene index and guides must match');
assert.equal(new Set(registry.scenes.map((scene) => scene.id)).size, registry.scenes.length, 'scene IDs must be unique');
for (const scene of sceneGuides.scenes) {
  assert.ok(exists(`data/scenes/${scene.id}.json`), `${scene.id} scene data missing`);
  assert.ok(exists(`scenes/${scene.id}/index.html`), `${scene.id} scene detail missing`);
  assert.match(
    read(`scenes/${scene.id}/index.html`),
    new RegExp(`<link rel="canonical" href="https://skills\\.zondev\\.top/scenes/${scene.id}/index\\.html"`),
    `${scene.id} canonical path drifted`
  );
  const referenced = [...(scene.starter_ids || []), ...(scene.chains || []).flat()];
  for (const id of referenced) assert.ok(skillIds.has(id), `${scene.id} references missing skill ${id}`);
}

for (const file of ['llms.txt', 'llms-full.txt', 'sitemap.xml']) {
  assert.ok(exists(file) && read(file).trim().length > 0, `${file} missing or empty`);
}
const homepage = read('index.html');
assert.match(homepage, /https:\/\/skills\.zondev\.top/, 'production canonical missing');

const publicFiles = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else publicFiles.push(full);
  }
};
walk(dist);
const leakPattern = /\/Users\/[A-Za-z0-9._-]+|~\/\.codex\/skills|GITHUB_TOKEN|(?:API|SECRET|ACCESS)[_-]?KEY\s*[:=]|BEGIN [A-Z ]*PRIVATE KEY/i;
for (const file of publicFiles) {
  const content = fs.readFileSync(file);
  if (content.includes(0)) continue;
  assert.doesNotMatch(content.toString('utf8'), leakPattern, `private data pattern in ${path.relative(dist, file)}`);
}

console.log(`Skills contract PASS: ${registry.skills.length} skills, ${registry.scenes.length} scenes, ${publicFiles.length} public files`);
