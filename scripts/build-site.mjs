import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const registryRoot = process.env.SKILLS_REGISTRY_ROOT
  ? path.resolve(process.env.SKILLS_REGISTRY_ROOT)
  : path.resolve(root, "..", "skills-registry");
const registryContentRoot = path.join(registryRoot, "content");
const distRoot = path.join(root, "dist");
const stylesSrc = path.join(root, "src", "site.css");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const chunks = [];
  let inList = false;
  let inCode = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    if (text) chunks.push(`<p>${inline(text)}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!inList) return;
    chunks.push("</ul>");
    inList = false;
  };

  function inline(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushParagraph();
      closeList();
      if (inCode) {
        chunks.push("</code></pre>");
        inCode = false;
      } else {
        chunks.push("<pre><code>");
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      chunks.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (/^---\s*$/.test(line) && chunks.length === 0 && paragraph.length === 0) {
      continue;
    }

    if (/^#\s+/.test(line)) {
      flushParagraph();
      closeList();
      chunks.push(`<h1>${inline(line.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }

    if (/^##\s+/.test(line)) {
      flushParagraph();
      closeList();
      chunks.push(`<h2>${inline(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }

    if (/^###\s+/.test(line)) {
      flushParagraph();
      closeList();
      chunks.push(`<h3>${inline(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }

    if (/^- /.test(line)) {
      flushParagraph();
      if (!inList) {
        chunks.push("<ul>");
        inList = true;
      }
      chunks.push(`<li>${inline(line.replace(/^- /, ""))}</li>`);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    if (!/^---/.test(line)) paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();
  if (inCode) chunks.push("</code></pre>");

  return chunks.join("\n");
}

function layout({ title, description, body, canonicalPath }) {
  const canonical = `/${canonicalPath.replace(/^\/+/, "")}`;
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="stylesheet" href="/site.css" />
  </head>
  <body>
    <div class="site-shell">
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="/index.html"><strong>Skills</strong><span>Registry</span></a>
          <nav class="nav">
            <a href="/index.html">Home</a>
            <a href="/llms.txt">llms.txt</a>
            <a href="/data/registry.json">registry.json</a>
          </nav>
        </div>
      </header>
      ${body}
      <footer class="footer">
        <div>Skills Site · scenario-first registry renderer · data source: <code>skills-registry</code></div>
      </footer>
    </div>
  </body>
</html>
`;
}

function renderSceneGrid(scenes, sceneCounts) {
  return `<div class="scene-grid">
${scenes
  .map(
    (scene, index) => `<a class="scene-card" href="/scenes/${scene.id}/index.html">
  <div class="scene-index">${String(index + 1).padStart(2, "0")}</div>
  <div>
    <h3 class="scene-title">${escapeHtml(scene.title)}</h3>
    <p class="scene-desc">${escapeHtml(scene.summary)}</p>
  </div>
  <div class="scene-count">${sceneCounts.get(scene.id) || 0} skills</div>
</a>`
  )
  .join("\n")}
</div>`;
}

function renderSkillRows(skills) {
  return `<div class="skill-table">
${skills
  .map(
    (skill) => `<div class="skill-row">
  <div>
    <h3 class="skill-name"><a href="/skills/${skill.id}/index.html">${escapeHtml(skill.title)}</a></h3>
    <div class="skill-meta">${escapeHtml(skill.sceneTitle || skill.scene)}</div>
  </div>
  <div class="skill-copy">${escapeHtml(skill.summary)}</div>
  <div class="skill-return">${escapeHtml((skill.returns && skill.returns[0]) || (skill.use_when && skill.use_when[0]) || "")}</div>
  <div><span class="skill-invoke">${escapeHtml(skill.invoke)}</span></div>
</div>`
  )
  .join("\n")}
</div>`;
}

function buildHome({ registry, scenesById, manifests, stats }) {
  const featuredIds = ["best-minds", "frontend-design", "vercel-deploy"];
  const featured = manifests
    .filter((manifest) => featuredIds.includes(manifest.id))
    .map((manifest) => ({ ...manifest, sceneTitle: scenesById.get(manifest.scene)?.title || manifest.scene }));

  const scenes = [...scenesById.values()].sort((a, b) => a.order - b.order);
  const sceneCounts = new Map();
  for (const item of manifests) sceneCounts.set(item.scene, (sceneCounts.get(item.scene) || 0) + 1);

  return layout({
    title: "Skills Registry",
    description: "Scenario-first skill registry for human browsing and agent consumption.",
    canonicalPath: "index.html",
    body: `<main class="page">
  <section class="hero">
    <div>
      <p class="hero-kicker">Scenario-First Skill Registry</p>
      <h1 class="hero-title">Find the right skill for the job.</h1>
      <p class="hero-copy">This site is a pure presentation layer over a machine-readable registry. People browse by scene. Agents read structured manifests. The public object model stays simple: only <code>skill</code>.</p>
    </div>
    <div class="hero-notes">
      <div class="hero-note"><strong>Executable systems</strong>These are not prompt snippets. Many skills are built around real outputs, pipelines, and delivery.</div>
      <div class="hero-note"><strong>Scenario-first</strong>Scenes answer what you are trying to do, not which tool happens to be underneath.</div>
      <div class="hero-note"><strong>Agent-readable</strong>Every skill can expose a public manifest and a longform Markdown page.</div>
    </div>
  </section>

  <section class="stats-strip">
    <div class="stat"><span class="stat-value">${stats.totalSkills}</span><span class="stat-label">Public Skills</span></div>
    <div class="stat"><span class="stat-value">${stats.totalScenes}</span><span class="stat-label">Scenes</span></div>
    <div class="stat"><span class="stat-value">${stats.publicCount}</span><span class="stat-label">Public Now</span></div>
    <div class="stat"><span class="stat-value">${stats.sanitizedCount}</span><span class="stat-label">Sanitized Layer</span></div>
  </section>

  <section class="section">
    <div class="section-header">
      <div>
        <p class="section-kicker">Scenes</p>
        <h2 class="section-title">Browse by application scenario</h2>
      </div>
      <div class="section-summary">The public taxonomy stays deliberately narrow. Tools and platform words belong in keywords and dependencies, not in the top navigation.</div>
    </div>
    ${renderSceneGrid(scenes, sceneCounts)}
  </section>

  <section class="section">
    <div class="section-header">
      <div>
        <p class="section-kicker">Start Now</p>
        <h2 class="section-title">Core public skills</h2>
      </div>
      <div class="section-summary">A tighter first screen: fewer entries, clearer purpose, stronger return signal.</div>
    </div>
    ${renderSkillRows(featured)}
  </section>
</main>`
  });
}

function buildScenePage(scene, skills, scenesById) {
  const normalized = skills
    .map((skill) => ({
      ...skill,
      sceneTitle: scenesById.get(skill.scene)?.title || skill.scene
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));

  return layout({
    title: `${scene.title} · Skills`,
    description: scene.summary,
    canonicalPath: `scenes/${scene.id}/index.html`,
    body: `<main class="page">
  <section class="page-head">
    <p class="meta-kicker">Scene</p>
    <h1 class="page-title">${escapeHtml(scene.title)}</h1>
    <p class="page-subtitle">${escapeHtml(scene.summary)}</p>
  </section>
  <section class="section">
    <div class="section-header">
      <div>
        <p class="section-kicker">Index</p>
        <h2 class="section-title">${normalized.length} public skills</h2>
      </div>
      <div class="section-summary">Scene-first listing. Tool names are kept in skill metadata, not used as public top-level categories.</div>
    </div>
    ${renderSkillRows(normalized)}
  </section>
</main>`
  });
}

function buildDetailPage(manifest, markdown, scenesById) {
  const sceneTitle = scenesById.get(manifest.scene)?.title || manifest.scene;
  const tags = manifest.keywords || [];
  const prose = markdownToHtml(markdown);

  return layout({
    title: `${manifest.title} · Skills`,
    description: manifest.summary,
    canonicalPath: `skills/${manifest.id}/index.html`,
    body: `<main class="page">
  <section class="page-head">
    <p class="meta-kicker">${escapeHtml(sceneTitle)}</p>
    <h1 class="page-title">${escapeHtml(manifest.title)}</h1>
    <p class="page-subtitle">${escapeHtml(manifest.summary)}</p>
  </section>
  <section class="detail-grid">
    <article class="detail-main prose">
      ${prose}
    </article>
    <aside class="detail-side">
      <div class="side-card">
        <p class="side-label">Invoke</p>
        <div><span class="skill-invoke">${escapeHtml(manifest.invoke)}</span></div>
      </div>
      <div class="side-card">
        <p class="side-label">Use When</p>
        <div class="skill-copy">${manifest.use_when.map((item) => `<div>${escapeHtml(item)}</div>`).join("")}</div>
      </div>
      <div class="side-card">
        <p class="side-label">Avoid When</p>
        <div class="skill-copy">${manifest.avoid_when.map((item) => `<div>${escapeHtml(item)}</div>`).join("")}</div>
      </div>
      <div class="side-card">
        <p class="side-label">Returns</p>
        <div class="skill-copy">${manifest.returns.map((item) => `<div>${escapeHtml(item)}</div>`).join("")}</div>
      </div>
      <div class="side-card">
        <p class="side-label">Keywords</p>
        <div class="skill-tags">${tags.map((tag) => escapeHtml(tag)).join(" · ")}</div>
      </div>
      <div class="side-card">
        <p class="side-label">Manifest</p>
        <div><a href="/data/skills/${manifest.id}.json">JSON</a></div>
      </div>
    </aside>
  </section>
</main>`
  });
}

function buildLlmsTxt(registry, scenesById) {
  const sceneLines = registry.scenes
    .map((scene) => {
      const full = scenesById.get(scene.id);
      return `- ${full?.title || scene.id}: /scenes/${scene.id}/index.html`;
    })
    .join("\n");
  const skillLines = registry.skills
    .map((skill) => `- ${skill.title}: /skills/${skill.id}/index.html | /data/skills/${skill.id}.json`)
    .join("\n");

  return `# Skills Registry

Public, scenario-first skill registry.

## Canonical machine-readable entry points

- /data/registry.json
- /data/skills/<id>.json

## Scenes

${sceneLines}

## Current skills

${skillLines}
`;
}

function main() {
  ensureDir(distRoot);
  fs.copyFileSync(stylesSrc, path.join(distRoot, "site.css"));

  const scenesDoc = readJson(path.join(registryContentRoot, "scenes.json"));
  const registry = readJson(path.join(registryContentRoot, "registry.json"));
  const scenesById = new Map(scenesDoc.scenes.map((scene) => [scene.id, scene]));

  const manifests = registry.skills.map((skill) => {
    const manifestPath = path.join(registryRoot, skill.manifest_path);
    const skillMdPath = path.join(registryRoot, skill.skill_md_path);
    return {
      ...readJson(manifestPath),
      _markdown: fs.readFileSync(skillMdPath, "utf8")
    };
  });

  const stats = {
    totalSkills: manifests.length,
    totalScenes: scenesDoc.scenes.length,
    publicCount: manifests.filter((item) => item.visibility === "public").length,
    sanitizedCount: manifests.filter((item) => item.visibility === "sanitized").length
  };

  writeFile(path.join(distRoot, "index.html"), buildHome({ registry, scenesById, manifests, stats }));

  for (const scene of scenesDoc.scenes) {
    const sceneSkills = manifests.filter((manifest) => manifest.scene === scene.id);
    writeFile(
      path.join(distRoot, "scenes", scene.id, "index.html"),
      buildScenePage(scene, sceneSkills, scenesById)
    );
  }

  for (const manifest of manifests) {
    writeFile(
      path.join(distRoot, "skills", manifest.id, "index.html"),
      buildDetailPage(manifest, manifest._markdown, scenesById)
    );
    writeFile(
      path.join(distRoot, "data", "skills", `${manifest.id}.json`),
      JSON.stringify(manifest, null, 2) + "\n"
    );
  }

  writeFile(path.join(distRoot, "data", "registry.json"), JSON.stringify(registry, null, 2) + "\n");
  writeFile(path.join(distRoot, "llms.txt"), buildLlmsTxt(registry, scenesById));
  console.log(`Built skills-site into ${distRoot}`);
}

main();
