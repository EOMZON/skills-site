import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const localRegistryRoot = path.resolve(root, "..", "skills-registry");
const remoteRegistryUrl = process.env.SKILLS_REGISTRY_GIT_URL || "https://github.com/EOMZON/skills-registry.git";
const vendoredRegistryRoot = path.join(root, ".cache", "skills-registry");
const registryRoot = resolveRegistryRoot();
const registryContentRoot = path.join(registryRoot, "content");
const distRoot = path.join(root, "dist");
const stylesSrc = path.join(root, "src", "site.css");
const faviconSrc = path.join(root, "src", "favicon.svg");
const sceneGuidesPath = path.join(registryContentRoot, "scene-guides.json");
const sceneStatusLabel = {
  live: "Live",
  "coming-next": "Coming Next",
  "sanitized-later": "Sanitized Later",
  "private-only": "Private Only"
};

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

function resolveRegistryRoot() {
  if (process.env.SKILLS_REGISTRY_ROOT) {
    const explicitRoot = path.resolve(process.env.SKILLS_REGISTRY_ROOT);
    if (!fs.existsSync(explicitRoot)) {
      throw new Error(`SKILLS_REGISTRY_ROOT does not exist: ${explicitRoot}`);
    }
    return explicitRoot;
  }

  if (fs.existsSync(localRegistryRoot)) {
    return localRegistryRoot;
  }

  ensureDir(path.dirname(vendoredRegistryRoot));
  if (!fs.existsSync(vendoredRegistryRoot)) {
    execSync(`git clone --depth=1 ${remoteRegistryUrl} "${vendoredRegistryRoot}"`, {
      stdio: "inherit"
    });
  } else {
    execSync(`git -C "${vendoredRegistryRoot}" pull --ff-only`, {
      stdio: "inherit"
    });
  }

  return vendoredRegistryRoot;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripRuntimeFields(manifest) {
  const { _markdown, sceneTitle, ...publicManifest } = manifest;
  return publicManifest;
}

function previewText(items, limit = 2) {
  if (!Array.isArray(items) || items.length === 0) return "—";
  return items
    .slice(0, limit)
    .map((item) => escapeHtml(item))
    .join(" · ");
}

function previewInputs(inputs, limit = 2) {
  if (!Array.isArray(inputs) || inputs.length === 0) return "—";
  return inputs
    .slice(0, limit)
    .map((input) => `<code>${escapeHtml(input.name)}</code>`)
    .join(" · ");
}

function countByVisibility(items) {
  return items.reduce((counts, item) => {
    const visibility = item.visibility || "public";
    counts[visibility] = (counts[visibility] || 0) + 1;
    return counts;
  }, {});
}

function skillSort(a, b, scenesById) {
  const ao = scenesById.get(a.scene)?.order || Number.MAX_SAFE_INTEGER;
  const bo = scenesById.get(b.scene)?.order || Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.title.localeCompare(b.title, "zh-Hans-CN");
}

function stripFrontMatter(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function markdownToHtml(markdown) {
  const lines = stripFrontMatter(markdown).replace(/\r\n/g, "\n").split("\n");
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

    paragraph.push(line.trim());
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
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/site.css" />
  </head>
  <body>
    <div class="site-shell">
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="/index.html"><strong>Skills</strong><span>Registry</span></a>
          <nav class="nav">
            <a href="/index.html">Home</a>
            <a href="/data/registry.json">registry.json</a>
            <a href="/data/scenes.json">scenes.json</a>
            <a href="/llms.txt">llms.txt</a>
          </nav>
        </div>
      </header>
      ${body}
      <footer class="footer">
        <div>Skills Site · scenario-first registry renderer · source of truth: <code>skills-registry</code></div>
      </footer>
    </div>
  </body>
</html>
`;
}

function renderSceneGrid(sceneEntries) {
  return `<div class="scene-directory">
${sceneEntries
  .map(({ scene, skills, guide }) => {
    const status = guide?.status || (skills.length ? "live" : "coming-next");
    const starter = (guide?.starter_ids || [])
      .map((id) => skills.find((skill) => skill.id === id))
      .filter(Boolean)
      .map((item) => `<a href="/skills/${item.id}/index.html">${escapeHtml(item.title)}</a>`)
      .join(" · ");
    const taskItems = (guide?.core_tasks || [scene.summary]).slice(0, 3);
return `<article class="scene-entry">
  <div class="scene-head">
    <div class="scene-meta-row">
      <span class="status-pill status-${status}">${escapeHtml(sceneStatusLabel[status] || status)}</span>
      <span class="count-pill">${skills.length} listed</span>
    </div>
    <h3 class="scene-entry-title"><a href="/scenes/${scene.id}/index.html">${escapeHtml(scene.title)}</a></h3>
    <p class="scene-entry-summary">${escapeHtml(scene.summary)}</p>
  </div>
  <div class="scene-tasks">
    <p class="scene-label">Core Tasks</p>
    <ul class="compact-list">
      ${taskItems.map((task) => `<li>${escapeHtml(task)}</li>`).join("")}
    </ul>
  </div>
  <div class="scene-starters">
    <p class="scene-label">Start With</p>
    <div class="scene-links">${starter || '<span class="muted">No listed starter yet</span>'}</div>
  </div>
</article>`;
  })
  .join("\n")}
</div>`;
}

function renderSkillTable(skills) {
  return `<div class="skill-table">
  <div class="skill-head">
    <div>Skill</div>
    <div>作用</div>
    <div>输入</div>
    <div>产出</div>
    <div>Invoke</div>
  </div>
${skills
  .map(
    (skill) => `<div class="skill-row">
  <div>
    <h3 class="skill-name"><a href="/skills/${skill.id}/index.html">${escapeHtml(skill.title)}</a></h3>
    <div class="skill-meta">${escapeHtml((skill.use_when && skill.use_when[0]) || skill.sceneTitle || "")}</div>
    <div class="skill-contract">${escapeHtml(skill.visibility || "public")} · ${escapeHtml(skill.stability || "stable")}</div>
  </div>
  <div class="skill-copy">${escapeHtml(skill.summary)}</div>
  <div class="skill-io">${previewInputs(skill.inputs)}</div>
  <div class="skill-io">${previewText(skill.returns)}</div>
  <div><span class="skill-invoke">${escapeHtml(skill.invoke)}</span></div>
</div>`
  )
  .join("\n")}
</div>`;
}

function renderEndpointList(links) {
  return `<div class="endpoint-list">
${links
  .map(
    (link) => `<a class="endpoint-card" href="${escapeHtml(link.href)}">
  <div class="endpoint-name">${escapeHtml(link.name)}</div>
  <div class="endpoint-desc">${escapeHtml(link.description)}</div>
</a>`
  )
  .join("\n")}
</div>`;
}

function renderGuideBlock(guide, manifestsById) {
  if (!guide) return "";
  const starter = (guide.starter_ids || [])
    .map((id) => manifestsById.get(id))
    .filter(Boolean)
    .map((item) => `<a href="/skills/${item.id}/index.html">${escapeHtml(item.title)}</a>`)
    .join(" · ");
  const chains = (guide.chains || [])
    .map((chain) =>
      chain
        .map((id) => manifestsById.get(id))
        .filter(Boolean)
        .map((item) => `<a href="/skills/${item.id}/index.html">${escapeHtml(item.title)}</a>`)
        .join(" → ")
    )
    .filter(Boolean);

  return `<div class="scene-guide">
    ${
      guide.core_tasks?.length
        ? `<div class="guide-line"><span>Core Tasks</span>${guide.core_tasks
            .slice(0, 3)
            .map((task) => escapeHtml(task))
            .join(" · ")}</div>`
        : ""
    }
    ${starter ? `<div class="guide-line"><span>Starter</span>${starter}</div>` : ""}
    ${chains.length ? `<div class="guide-line"><span>Chain</span>${chains[0]}</div>` : ""}
  </div>`;
}

function renderCoverage(sceneEntries, manifestsById) {
  return `<div class="scene-blocks">
${sceneEntries
  .map(
    ({ scene, skills, guide }) => `<section class="scene-block">
  <div class="scene-block-head">
    <div>
      <p class="section-kicker">Scene</p>
      <h3 class="scene-block-title"><a href="/scenes/${scene.id}/index.html">${escapeHtml(scene.title)}</a></h3>
    </div>
    <div class="scene-block-summary">${escapeHtml(scene.summary)}</div>
  </div>
  ${renderGuideBlock(guide, manifestsById)}
  ${renderSkillTable(skills)}
</section>`
  )
  .join("\n")}
</div>`;
}

function renderSideList(values) {
  return `<div class="side-list">${values.map((value) => `<div>${value}</div>`).join("")}</div>`;
}

function renderDetailInputs(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) return renderSideList(["—"]);
  return renderSideList(
    inputs.map(
      (input) =>
        `<code>${escapeHtml(input.name)}</code> ${escapeHtml(input.description)}${input.required ? " (required)" : ""}`
    )
  );
}

function collectSceneEntries(scenesDoc, manifests, sceneGuidesById, scenesById) {
  return scenesDoc.scenes
    .map((scene) => ({
      scene,
      guide: sceneGuidesById.get(scene.id) || null,
      skills: manifests
        .filter((manifest) => manifest.scene === scene.id)
        .sort((a, b) => skillSort(a, b, scenesById))
    }));
}

function buildHome({ scenesDoc, manifests, scenesById, sceneGuidesById, manifestsById, stats }) {
  const sceneEntries = collectSceneEntries(scenesDoc, manifests, sceneGuidesById, scenesById);
  const activeSceneEntries = sceneEntries.filter((entry) => entry.skills.length > 0);
  const differentiators = [
    {
      label: "Executable systems",
      body: "不是 prompt 片段。很多 skill 会直接落到报告、页面、脚本、部署或可复查产物。"
    },
    {
      label: "Scenario-first",
      body: "先按要完成的事情分组，再在 scene 里看可调用的 skill，而不是先按工具名找。"
    },
    {
      label: "Private source -> exposed manifests",
      body: "私有作者源先沉淀，再导出 exposed manifest；涉及状态和敏感运行细节的 workflow 以 sanitized 方式列出。"
    },
    {
      label: "Agent-readable",
      body: "人看页面，AI 读 JSON 和 llms.txt。每个 skill 都有稳定的 machine entry point。"
    }
  ];
  const agentLinks = [
    {
      name: "registry.json",
      href: "/data/registry.json",
      description: "所有已列出 skills 的轻量索引，含 visibility 与 scene。"
    },
    {
      name: "scene-guides.json",
      href: "/data/scene-guides.json",
      description: "scene 级别的 core tasks、starter 与 chain 提示。"
    },
    {
      name: "skills.ndjson",
      href: "/data/skills.ndjson",
      description: "每行一个 manifest，适合 agent 批量抓取。"
    },
    {
      name: "llms-full.txt",
      href: "/llms-full.txt",
      description: "扩展版文本契约，补足 inputs、returns 和 dependencies。"
    }
  ];

  return layout({
    title: "Skills Registry",
    description: "Scenario-first skill registry for human browsing and agent consumption.",
    canonicalPath: "index.html",
    body: `<main class="page">
  <section class="hero">
    <div>
      <p class="hero-kicker">Scenario-First Skill Registry</p>
      <h1 class="hero-title">先按场景进入，再选 skill。</h1>
      <p class="hero-copy">首页先回答能做什么、从哪里起手、会拿到什么产出。公开层只保留可复用调用契约；需要收口运行细节的 workflow 用 sanitized entry 暴露，私有作者源继续留在上游，不把展示层做成又一面大卡片墙。</p>
    </div>
    <div class="hero-notes">
      ${differentiators
        .map(
          (item) => `<div class="hero-note"><strong>${escapeHtml(item.label)}</strong>${escapeHtml(item.body)}</div>`
        )
        .join("\n")}
    </div>
  </section>

  <section class="stats-strip">
    <div class="stat"><span class="stat-value">${stats.listedSkills}</span><span class="stat-label">Listed Skills</span></div>
    <div class="stat"><span class="stat-value">${stats.publicSkills}</span><span class="stat-label">Public</span></div>
    <div class="stat"><span class="stat-value">${stats.sanitizedSkills}</span><span class="stat-label">Sanitized</span></div>
    <div class="stat"><span class="stat-value">${stats.liveScenes}</span><span class="stat-label">Live Scenes</span></div>
  </section>

  <section class="section">
    <div class="section-header">
      <div>
        <p class="section-kicker">Scenes</p>
        <h2 class="section-title">先看你要完成什么</h2>
      </div>
      <div class="section-summary">每个 scene 都直接暴露当前列出状态、核心任务和起手 skill。尚未列出 skills 的 scene 也保留在首页，作为真实路线图而不是被隐藏的空白。</div>
    </div>
    ${renderSceneGrid(sceneEntries)}
  </section>

  <section class="section">
    <div class="section-header">
      <div>
        <p class="section-kicker">Coverage</p>
        <h2 class="section-title">按场景展开的已列出 skills</h2>
      </div>
      <div class="section-summary">这里专注看当前已经进入 registry 的技能索引，其中同时包含 fully public 与 sanitized entry。每一行同时暴露作用、输入、产出、可见性与调用方式，而不是只放一段摘要文案。</div>
    </div>
    ${renderCoverage(activeSceneEntries, manifestsById)}
  </section>

  <section class="section">
    <div class="section-header">
      <div>
        <p class="section-kicker">For Agents</p>
        <h2 class="section-title">机器入口保持稳定</h2>
      </div>
      <div class="section-summary">展示层给人看，数据层给 agent 读。这里暴露的是最稳定的入口，不要求 agent 从 HTML 里猜结构。</div>
    </div>
    ${renderEndpointList(agentLinks)}
  </section>
</main>`
  });
}

function buildScenePage(scene, skills, scenesById, guide, manifestsById) {
  const normalized = skills.sort((a, b) => skillSort(a, b, scenesById));
  const status = guide?.status || (normalized.length ? "live" : "coming-next");
  const body = normalized.length
    ? `${renderGuideBlock(guide, manifestsById)}${renderSkillTable(normalized)}`
    : `<p class="empty-state">这个 scene 已经预留在 taxonomy 中，但目前还没有 listed skills。</p>`;

  return layout({
    title: `${scene.title} · Skills`,
    description: scene.summary,
    canonicalPath: `scenes/${scene.id}/index.html`,
    body: `<main class="page">
  <section class="page-head">
    <p class="meta-kicker">Scene</p>
    <div class="page-meta-row">
      <h1 class="page-title">${escapeHtml(scene.title)}</h1>
      <span class="status-pill status-${status}">${escapeHtml(sceneStatusLabel[status] || status)}</span>
    </div>
    <p class="page-subtitle">${escapeHtml(scene.summary)}</p>
    <div class="page-count">${normalized.length} listed skills</div>
  </section>
  <section class="section">
    <div class="section-header">
      <div>
        <p class="section-kicker">Index</p>
        <h2 class="section-title">${normalized.length} listed skills</h2>
      </div>
      <div class="section-summary">场景页回答三件事: 常见任务是什么、从哪里起手、现在有哪些已列出 skill 可以继续往下走。</div>
    </div>
    ${body}
  </section>
</main>`
  });
}

function buildDetailPage(manifest, markdown, scenesById, manifestsById) {
  const sceneTitle = scenesById.get(manifest.scene)?.title || manifest.scene;
  const tags = manifest.keywords || [];
  const prose = markdownToHtml(markdown);
  const related = (manifest.related_ids || [])
    .map((id) => manifestsById.get(id))
    .filter(Boolean);
  const dependencyLines = [`Scene: ${escapeHtml(sceneTitle)}`];

  if (manifest.dependencies?.bins?.length) {
    dependencyLines.push(`Bins: ${manifest.dependencies.bins.map((bin) => `<code>${escapeHtml(bin)}</code>`).join(" · ")}`);
  }
  if (manifest.dependencies?.services?.length) {
    dependencyLines.push(
      `Services: ${manifest.dependencies.services.map((service) => escapeHtml(service)).join(" · ")}`
    );
  }
  if (manifest.dependencies?.stateful) {
    dependencyLines.push("Stateful workflow");
  } else {
    dependencyLines.push("Stateless workflow");
  }
  if (!manifest.dependencies?.bins?.length && !manifest.dependencies?.services?.length) {
    dependencyLines.push("No special runtime");
  }

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
        <p class="side-label">Inputs</p>
        ${renderDetailInputs(manifest.inputs)}
      </div>
      <div class="side-card">
        <p class="side-label">Returns</p>
        ${renderSideList((manifest.returns || []).map((item) => escapeHtml(item)))}
      </div>
      <div class="side-card">
        <p class="side-label">Use When</p>
        ${renderSideList((manifest.use_when || []).map((item) => escapeHtml(item)))}
      </div>
      <div class="side-card">
        <p class="side-label">Avoid When</p>
        ${renderSideList((manifest.avoid_when || []).map((item) => escapeHtml(item)))}
      </div>
      <div class="side-card">
        <p class="side-label">Keywords</p>
        <div class="skill-tags">${tags.map((tag) => escapeHtml(tag)).join(" · ") || "—"}</div>
      </div>
      ${
        dependencyLines.length
          ? `<div class="side-card">
        <p class="side-label">Dependencies</p>
        ${renderSideList(dependencyLines)}
      </div>`
          : ""
      }
      ${
        related.length
          ? `<div class="side-card">
        <p class="side-label">Related</p>
        ${renderSideList(
          related.map(
            (item) => `<a href="/skills/${item.id}/index.html">${escapeHtml(item.title)}</a>`
          )
        )}
      </div>`
          : ""
      }
      <div class="side-card">
        <p class="side-label">Contract</p>
        ${renderSideList([
          `Visibility: ${escapeHtml(manifest.visibility || "public")}`,
          `Stability: ${escapeHtml(manifest.stability || "stable")}`,
          `Updated: ${escapeHtml(manifest.updated_at)}`
        ])}
      </div>
      <div class="side-card">
        <p class="side-label">Machine</p>
        ${renderSideList([
          `<a href="/data/skills/${manifest.id}.json">manifest.json</a>`,
          `<a href="/data/scenes/${manifest.scene}.json">scene.json</a>`,
          `<a href="/data/skills.ndjson">skills.ndjson</a>`,
          `<a href="/llms-full.txt">llms-full.txt</a>`
        ])}
      </div>
    </aside>
  </section>
</main>`
  });
}

function buildLlmsTxt(registry, scenesById, sceneGuidesById) {
  const sceneLines = registry.scenes
    .map((scene) => {
      const full = scenesById.get(scene.id);
      const guide = sceneGuidesById.get(scene.id);
      const status = guide?.status || (scene.count > 0 ? "live" : "coming-next");
      const starters = (guide?.starter_ids || []).join(", ") || "none yet";
      return `- ${full?.title || scene.id} (${scene.id}) [${sceneStatusLabel[status] || status}, ${scene.count} skills]
  paths: /scenes/${scene.id}/index.html | /data/scenes/${scene.id}.json
  starters: ${starters}`;
    })
    .join("\n");
  const skillLines = registry.skills
    .map(
      (skill) => `- ${skill.title} (${skill.id})
  invoke: ${skill.invoke}
  scene: ${skill.scene}
  summary: ${skill.summary}
  visibility: ${skill.visibility || "public"}
  stability: ${skill.stability || "stable"}
  paths: /skills/${skill.id}/index.html | /data/skills/${skill.id}.json`
    )
    .join("\n");

  return `# Skills Registry

Scenario-first skill registry with public and sanitized entries.

## Canonical machine-readable entry points

- /data/registry.json
- /data/scenes.json
- /data/scene-guides.json
- /data/skills.ndjson
- /data/skills/<id>.json
- /data/scenes/<scene>.json

## Scenes

${sceneLines}

## Current listed skills

${skillLines}
`;
}

function buildLlmsFullTxt(manifests, scenesById) {
  return `# Skills Registry Full Contract

${manifests
  .map((manifest) => {
    const sceneTitle = scenesById.get(manifest.scene)?.title || manifest.scene;
    return `## ${manifest.title}
id: ${manifest.id}
invoke: ${manifest.invoke}
scene: ${sceneTitle} (${manifest.scene})
summary: ${manifest.summary}
visibility: ${manifest.visibility || "public"}
stability: ${manifest.stability || "stable"}
stateful: ${manifest.dependencies?.stateful ? "true" : "false"}
inputs: ${(manifest.inputs || [])
      .map((input) => `${input.name}${input.required ? " (required)" : ""}: ${input.description}`)
      .join(" | ") || "none"}
returns: ${(manifest.returns || []).join(" | ") || "none"}
bins: ${(manifest.dependencies?.bins || []).join(", ") || "none"}
services: ${(manifest.dependencies?.services || []).join(", ") || "none"}
json: /data/skills/${manifest.id}.json`;
  })
  .join("\n\n")}
`;
}

function main() {
  ensureDir(distRoot);
  fs.copyFileSync(stylesSrc, path.join(distRoot, "site.css"));
  if (fs.existsSync(faviconSrc)) {
    fs.copyFileSync(faviconSrc, path.join(distRoot, "favicon.svg"));
  }

  const scenesDoc = readJson(path.join(registryContentRoot, "scenes.json"));
  const registry = readJson(path.join(registryContentRoot, "registry.json"));
  const sceneGuides = fs.existsSync(sceneGuidesPath) ? readJson(sceneGuidesPath) : { scenes: [] };
  const scenesById = new Map(scenesDoc.scenes.map((scene) => [scene.id, scene]));
  const sceneGuidesById = new Map((sceneGuides.scenes || []).map((guide) => [guide.id, guide]));

  const manifests = registry.skills.map((skill) => {
    const manifestPath = path.join(registryRoot, skill.manifest_path);
    const skillMdPath = path.join(registryRoot, skill.skill_md_path);
    const manifest = readJson(manifestPath);
    return {
      ...manifest,
      sceneTitle: scenesById.get(manifest.scene)?.title || manifest.scene,
      _markdown: fs.readFileSync(skillMdPath, "utf8")
    };
  });

  const manifestsById = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const activeSceneEntries = collectSceneEntries(scenesDoc, manifests, sceneGuidesById, scenesById);
  const visibilityCounts = countByVisibility(manifests);
  const stats = {
    listedSkills: manifests.length,
    publicSkills: visibilityCounts.public || 0,
    sanitizedSkills: visibilityCounts.sanitized || 0,
    liveScenes: activeSceneEntries.filter((entry) => entry.skills.length > 0).length
  };

  writeFile(
    path.join(distRoot, "index.html"),
    buildHome({ scenesDoc, manifests, scenesById, sceneGuidesById, manifestsById, stats })
  );

  for (const scene of scenesDoc.scenes) {
    const sceneSkills = manifests.filter((manifest) => manifest.scene === scene.id);
    writeFile(
      path.join(distRoot, "scenes", scene.id, "index.html"),
      buildScenePage(scene, sceneSkills, scenesById, sceneGuidesById.get(scene.id) || null, manifestsById)
    );
  }

  for (const manifest of manifests) {
    writeFile(
      path.join(distRoot, "skills", manifest.id, "index.html"),
      buildDetailPage(manifest, manifest._markdown, scenesById, manifestsById)
    );
    writeFile(
      path.join(distRoot, "data", "skills", `${manifest.id}.json`),
      JSON.stringify(stripRuntimeFields(manifest), null, 2) + "\n"
    );
  }

  const sceneIndex = {
    schema_version: "1.0.0",
    generated_at: registry.generated_at,
    visibility_counts: visibilityCounts,
    scenes: scenesDoc.scenes.map((scene) => {
      const sceneSkills = manifests.filter((manifest) => manifest.scene === scene.id);
      const guide = sceneGuidesById.get(scene.id) || null;
      return {
        id: scene.id,
        title: scene.title,
        summary: scene.summary,
        count: sceneSkills.length,
        visibility_counts: countByVisibility(sceneSkills),
        status: guide?.status || (sceneSkills.length ? "live" : "coming-next"),
        detail_path: `/scenes/${scene.id}/index.html`,
        data_path: `/data/scenes/${scene.id}.json`
      };
    })
  };

  writeFile(path.join(distRoot, "data", "scenes.json"), JSON.stringify(sceneIndex, null, 2) + "\n");
  writeFile(path.join(distRoot, "data", "scene-guides.json"), JSON.stringify(sceneGuides, null, 2) + "\n");
  writeFile(
    path.join(distRoot, "data", "skills.ndjson"),
    manifests.map((manifest) => JSON.stringify(stripRuntimeFields(manifest))).join("\n") + "\n"
  );

  for (const scene of scenesDoc.scenes) {
    const sceneSkills = manifests
      .filter((manifest) => manifest.scene === scene.id)
      .sort((a, b) => skillSort(a, b, scenesById))
      .map((manifest) => {
        const publicManifest = stripRuntimeFields(manifest);
        return {
          id: publicManifest.id,
          title: publicManifest.title,
          summary: publicManifest.summary,
          invoke: publicManifest.invoke,
          keywords: publicManifest.keywords,
          visibility: publicManifest.visibility || "public",
          stability: publicManifest.stability || "stable",
          updated_at: publicManifest.updated_at,
          detail_path: `/skills/${publicManifest.id}/index.html`,
          manifest_path: `/data/skills/${publicManifest.id}.json`
        };
      });
    const guide = sceneGuidesById.get(scene.id) || null;

    writeFile(
      path.join(distRoot, "data", "scenes", `${scene.id}.json`),
      JSON.stringify(
        {
          schema_version: "1.0.0",
          id: scene.id,
          title: scene.title,
          summary: scene.summary,
          total_skills: sceneSkills.length,
          visibility_counts: countByVisibility(sceneSkills),
          status: guide?.status || "live",
          guide: guide
            ? {
                core_tasks: guide.core_tasks || [],
                starter_ids: guide.starter_ids || [],
                chains: guide.chains || []
              }
            : null,
          skills: sceneSkills
        },
        null,
        2
      ) + "\n"
    );
  }

  writeFile(path.join(distRoot, "data", "registry.json"), JSON.stringify(registry, null, 2) + "\n");
  writeFile(path.join(distRoot, "llms.txt"), buildLlmsTxt(registry, scenesById, sceneGuidesById));
  writeFile(path.join(distRoot, "llms-full.txt"), buildLlmsFullTxt(manifests, scenesById));
  console.log(`Built skills-site into ${distRoot}`);
}

main();
