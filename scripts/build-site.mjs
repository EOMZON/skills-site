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
const registryPublicRepoUrl = normalizeRepoUrl(
  process.env.SKILLS_REGISTRY_PUBLIC_REPO_URL || "https://github.com/EOMZON/skills-registry"
);
const registryPublicRepoBranch = process.env.SKILLS_REGISTRY_PUBLIC_REPO_BRANCH || "main";
const siteOrigin = normalizeRepoUrl(process.env.SKILLS_SITE_ORIGIN || "https://skills.zondev.top");
const authorGithubUrl = process.env.SKILLS_AUTHOR_GITHUB_URL || "https://github.com/EOMZON";
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

function normalizeRepoUrl(repoUrl) {
  return String(repoUrl || "")
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
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

function buildSourceMeta(entry) {
  const sourceRepo = normalizeRepoUrl(entry.source_repo || registryPublicRepoUrl);
  const sourcePath = entry.source_path || (entry.manifest_path ? path.posix.dirname(entry.manifest_path) : `content/skills/${entry.id}`);
  const manifestPath = entry.manifest_path || `${sourcePath}/manifest.json`;
  const skillMdPath = entry.skill_md_path || `${sourcePath}/SKILL.md`;

  return {
    source_repo: sourceRepo,
    source_path: sourcePath,
    source_tree_url: entry.source_tree_url || `${sourceRepo}/tree/${registryPublicRepoBranch}/${sourcePath}`,
    source_manifest_url:
      entry.source_manifest_url || `${sourceRepo}/blob/${registryPublicRepoBranch}/${manifestPath}`,
    source_skill_md_url:
      entry.source_skill_md_url || `${sourceRepo}/blob/${registryPublicRepoBranch}/${skillMdPath}`
  };
}

function toPublicRegistrySkill(skill) {
  const sourceMeta = buildSourceMeta(skill);
  return {
    id: skill.id,
    title: skill.title,
    summary: skill.summary,
    scene: skill.scene,
    keywords: skill.keywords || [],
    invoke: skill.invoke,
    visibility: skill.visibility || "public",
    stability: skill.stability || "stable",
    updated_at: skill.updated_at,
    ...sourceMeta,
    detail_path: `/skills/${skill.id}/index.html`,
    data_path: `/data/skills/${skill.id}.json`
  };
}

function toPublicRegistryDocument(registry) {
  return {
    schema_version: registry.schema_version,
    generated_at: registry.generated_at,
    total_skills: registry.total_skills,
    visibility_counts: registry.visibility_counts || {},
    source_repo: registry.source_repo || registryPublicRepoUrl,
    scenes: (registry.scenes || []).map((scene) => ({
      ...scene,
      detail_path: `/scenes/${scene.id}/index.html`,
      data_path: `/data/scenes/${scene.id}.json`
    })),
    skills: (registry.skills || []).map((skill) => toPublicRegistrySkill(skill))
  };
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

function githubBlobUrl(repoUrl, filePath) {
  return `${normalizeRepoUrl(repoUrl)}/blob/${registryPublicRepoBranch}/${filePath.replace(/^\/+/, "")}`;
}

function preferredSkillHref(skill) {
  return skill.source_skill_md_url || skill.source_tree_url || `/skills/${skill.id}/index.html`;
}

function sourceLink(label, href) {
  return `<a class="mono-link" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
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

function layout({ title, description, body, canonicalPath }) {
  const canonical = `${siteOrigin}/${canonicalPath.replace(/^\/+/, "")}`;
  const navLinks = [
    { label: "Home", href: "/index.html" },
    { label: "GitHub Repo", href: registryPublicRepoUrl },
    { label: "Browse Skills", href: `${registryPublicRepoUrl}/tree/${registryPublicRepoBranch}/content/skills` },
    { label: "Follow @EOMZON", href: authorGithubUrl }
  ];
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
            ${navLinks.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join("")}
          </nav>
        </div>
      </header>
      ${body}
      <footer class="footer">
        <div>Skills Site · discovery layer only · full public docs and updates live on <a href="${escapeHtml(registryPublicRepoUrl)}">GitHub</a> · follow <a href="${escapeHtml(authorGithubUrl)}">@EOMZON</a></div>
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
      .map((item) => `<a href="${escapeHtml(preferredSkillHref(item))}">${escapeHtml(item.title)}</a>`)
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
    <div>GitHub</div>
  </div>
${skills
  .map(
    (skill) => `<div class="skill-row">
  <div>
    <h3 class="skill-name"><a href="${escapeHtml(preferredSkillHref(skill))}">${escapeHtml(skill.title)}</a></h3>
    <div class="skill-meta">${escapeHtml((skill.use_when && skill.use_when[0]) || skill.sceneTitle || "")}</div>
    <div class="skill-contract">${escapeHtml(skill.visibility || "public")} · ${escapeHtml(skill.stability || "stable")} · ${escapeHtml(skill.invoke)}</div>
  </div>
  <div class="skill-copy">${escapeHtml(skill.summary)}</div>
  <div class="skill-io">${previewInputs(skill.inputs)}</div>
  <div class="skill-io">${previewText(skill.returns)}</div>
  <div class="skill-call">${sourceLink("View on GitHub", preferredSkillHref(skill))}</div>
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
    .map((item) => `<a href="${escapeHtml(preferredSkillHref(item))}">${escapeHtml(item.title)}</a>`)
    .join(" · ");
  const chains = (guide.chains || [])
    .map((chain) =>
      chain
        .map((id) => manifestsById.get(id))
        .filter(Boolean)
        .map((item) => `<a href="${escapeHtml(preferredSkillHref(item))}">${escapeHtml(item.title)}</a>`)
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
      label: "Private source -> public source",
      body: "私有作者源先沉淀，再导出可公开的 GitHub 版本；敏感运行细节不在公开层硬展开。"
    },
    {
      label: "GitHub-first",
      body: "站点负责发现与筛选，完整公开说明、更新历史和 star 入口都回到 GitHub。"
    }
  ];
  const agentLinks = [
    {
      name: "Open Repo",
      href: registryPublicRepoUrl,
      description: "公开仓库总入口。需要完整说明、star 或 follow 时，优先回到这里。"
    },
    {
      name: "Browse All Skills",
      href: `${registryPublicRepoUrl}/tree/${registryPublicRepoBranch}/content/skills`,
      description: "直接浏览所有公开 skill 文件夹，而不是下载站内镜像。"
    },
    {
      name: "Browse Content Source",
      href: `${registryPublicRepoUrl}/tree/${registryPublicRepoBranch}/content`,
      description: "查看 skills、scenes 和 guides 的 GitHub 源目录，而不是站内镜像。"
    },
    {
      name: "Follow @EOMZON",
      href: authorGithubUrl,
      description: "如果你是顺着某个 skill 过来的，这里是继续 follow 作者的入口。"
    }
  ];

  return layout({
    title: "Skills Registry",
    description: "Scenario-first skills discovery layer with GitHub-first source links.",
    canonicalPath: "index.html",
    body: `<main class="page">
  <section class="hero">
    <div>
      <p class="hero-kicker">Scenario-First Skill Registry</p>
      <h1 class="hero-title">先按场景找，再去 GitHub 取用。</h1>
      <p class="hero-copy">这个站点只回答三件事: 你要完成什么、先点哪个 skill、值不值得继续深看。完整公开说明、更新历史和后续 star，都应该回到 GitHub 源头。</p>
      <div class="hero-actions">
        <a class="hero-link" href="${escapeHtml(registryPublicRepoUrl)}">Open GitHub</a>
        <a class="hero-link" href="${escapeHtml(`${registryPublicRepoUrl}/tree/${registryPublicRepoBranch}/content/skills`)}">Browse Skills</a>
        <a class="hero-link" href="${escapeHtml(authorGithubUrl)}">Follow @EOMZON</a>
      </div>
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

  <section class="section" id="scenes">
    <div class="section-header">
      <div>
        <p class="section-kicker">Scenes</p>
        <h2 class="section-title">先看你要完成什么</h2>
      </div>
      <div class="section-summary">每个 scene 只保留最必要的判断信息: 你在解决什么问题、从哪里起手、哪些 skill 值得点进去。skill 点击优先跳 GitHub。</div>
    </div>
    ${renderSceneGrid(sceneEntries)}
  </section>

  <section class="section">
    <div class="section-header">
      <div>
        <p class="section-kicker">Coverage</p>
        <h2 class="section-title">按场景展开，然后直接跳 GitHub</h2>
      </div>
      <div class="section-summary">这里保留最必要的判断信息: 这是什么、适合什么时候用、输入输出大概是什么。真正的 skill 说明、更新与获取路径都回到 GitHub。</div>
    </div>
    ${renderCoverage(activeSceneEntries, manifestsById)}
  </section>

  <section class="section">
    <div class="section-header">
      <div>
        <p class="section-kicker">GitHub</p>
        <h2 class="section-title">真正的公开入口在 GitHub</h2>
      </div>
      <div class="section-summary">机器镜像仍然存在，但不再占据主导航。对人类访问者来说，主入口应该是 GitHub 仓库、技能目录和作者主页。</div>
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
      <div class="section-summary">场景页回答三件事: 常见任务是什么、从哪里起手、现在有哪些已列出 skill 值得点去 GitHub 深看。</div>
    </div>
    ${body}
  </section>
</main>`
  });
}

function buildDetailPage(manifest, scenesById, manifestsById) {
  const sceneTitle = scenesById.get(manifest.scene)?.title || manifest.scene;
  const tags = manifest.keywords || [];
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
  const detailLead = `<div class="detail-note">
    <p class="source-kicker">GitHub First</p>
    <h2 class="detail-note-title">完整公开说明放在 GitHub，不放在站内长期镜像。</h2>
    <p class="detail-note-copy">这个页面只保留快速判断和调用契约。真正的公开文档、更新历史，以及 star / follow 行为都应该回到 GitHub。</p>
    <div class="source-actions">
      ${manifest.source_skill_md_url ? sourceLink("Read on GitHub", manifest.source_skill_md_url) : ""}
      ${manifest.source_tree_url ? sourceLink("Browse Folder", manifest.source_tree_url) : ""}
      ${manifest.source_repo ? sourceLink("Open Repo", manifest.source_repo) : ""}
      ${sourceLink("Follow @EOMZON", authorGithubUrl)}
    </div>
  </div>`;

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
      ${detailLead}
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
            (item) => `<a href="${escapeHtml(preferredSkillHref(item))}">${escapeHtml(item.title)}</a>`
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
  preview: /scenes/${scene.id}/index.html
  mirror_json: /data/scenes/${scene.id}.json
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
  preview: /skills/${skill.id}/index.html
  mirror_json: /data/skills/${skill.id}.json
  preferred_source: ${skill.source_skill_md_url || skill.source_tree_url || skill.source_repo || registry.source_repo || registryPublicRepoUrl}`
    )
    .join("\n");

  return `# Skills Registry

Scenario-first skills discovery layer with GitHub-first source links.

Registry repo: ${registry.source_repo || registryPublicRepoUrl}

## Preferred public source

- ${registry.source_repo || registryPublicRepoUrl}
- ${registryPublicRepoUrl}/tree/${registryPublicRepoBranch}/content/skills

## Site mirrors for agents

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
preview: /skills/${manifest.id}/index.html
mirror_json: /data/skills/${manifest.id}.json
preferred_source: ${manifest.source_skill_md_url || manifest.source_tree_url || manifest.source_repo || registryPublicRepoUrl}
source_repo: ${manifest.source_repo || registryPublicRepoUrl}`;
  })
  .join("\n\n")}
`;
}

function buildRobotsTxt() {
  return `User-agent: *
Allow: /

Sitemap: ${siteOrigin}/sitemap.xml
`;
}

function buildSitemap(paths) {
  const uniquePaths = Array.from(new Set(paths)).sort();
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${uniquePaths
  .map((pagePath) => `  <url><loc>${escapeHtml(`${siteOrigin}/${pagePath.replace(/^\/+/, "")}`)}</loc></url>`)
  .join("\n")}
</urlset>
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
  const publicRegistry = toPublicRegistryDocument(registry);
  const sceneGuides = fs.existsSync(sceneGuidesPath) ? readJson(sceneGuidesPath) : { scenes: [] };
  const scenesById = new Map(scenesDoc.scenes.map((scene) => [scene.id, scene]));
  const sceneGuidesById = new Map((sceneGuides.scenes || []).map((guide) => [guide.id, guide]));

  const manifests = registry.skills.map((skill) => {
    const manifestPath = path.join(registryRoot, skill.manifest_path);
    const manifest = readJson(manifestPath);
    const sourceMeta = buildSourceMeta(skill);
    return {
      ...manifest,
      ...sourceMeta,
      sceneTitle: scenesById.get(manifest.scene)?.title || manifest.scene
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
      buildDetailPage(manifest, scenesById, manifestsById)
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
          source_repo: publicManifest.source_repo || registryPublicRepoUrl,
          source_tree_url: publicManifest.source_tree_url,
          source_manifest_url: publicManifest.source_manifest_url,
          source_skill_md_url: publicManifest.source_skill_md_url,
          detail_path: `/skills/${publicManifest.id}/index.html`,
          site_data_path: `/data/skills/${publicManifest.id}.json`
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

  writeFile(path.join(distRoot, "data", "registry.json"), JSON.stringify(publicRegistry, null, 2) + "\n");
  writeFile(path.join(distRoot, "llms.txt"), buildLlmsTxt(publicRegistry, scenesById, sceneGuidesById));
  writeFile(path.join(distRoot, "llms-full.txt"), buildLlmsFullTxt(manifests, scenesById));
  writeFile(path.join(distRoot, "robots.txt"), buildRobotsTxt());
  writeFile(
    path.join(distRoot, "sitemap.xml"),
    buildSitemap([
      "index.html",
      ...scenesDoc.scenes.map((scene) => `scenes/${scene.id}/index.html`),
      ...manifests.map((manifest) => `skills/${manifest.id}/index.html`)
    ])
  );
  console.log(`Built skills-site into ${distRoot}`);
}

main();
