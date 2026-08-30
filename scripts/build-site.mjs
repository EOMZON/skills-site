import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
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
  live: "已上线",
  "coming-next": "即将补充",
  "sanitized-later": "稍后公开",
  "private-only": "仅私有"
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
    execFileSync("git", ["clone", "--depth=1", remoteRegistryUrl, vendoredRegistryRoot], {
      stdio: "inherit"
    });
  } else {
    execFileSync("git", ["-C", vendoredRegistryRoot, "pull", "--ff-only"], {
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

function isExternalHref(href) {
  return /^https?:\/\//i.test(String(href || ""));
}

function anchorAttrs(href) {
  const extra = isExternalHref(href) ? ` target="_blank" rel="noreferrer noopener"` : "";
  return `href="${escapeHtml(href)}"${extra}`;
}

function preferredSkillHref(skill) {
  return `/skills/${skill.id}/index.html`;
}

function sourceSkillHref(skill) {
  return skill.source_skill_md_url || skill.source_tree_url || `/skills/${skill.id}/index.html`;
}

function sourceLink(label, href) {
  return `<a class="mono-link" ${anchorAttrs(href)}>${escapeHtml(label)}</a>`;
}

function humanizeVisibility(value) {
  const labels = {
    public: "公开",
    sanitized: "脱敏公开",
    "sanitized-later": "稍后脱敏公开",
    "private-only": "私有",
    private: "私有"
  };
  return labels[value] || value || "—";
}

function humanizeStability(value) {
  const labels = {
    stable: "稳定",
    beta: "测试中",
    experimental: "实验中",
    draft: "草稿",
    deprecated: "已弃用"
  };
  return labels[value] || value || "—";
}

function stripNeedPrefix(text) {
  return String(text || "")
    .replace(/^需要/, "")
    .trim();
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
    { label: "首页", href: "/index.html" },
    { label: "GitHub 仓库", href: registryPublicRepoUrl },
    { label: "技能目录", href: `${registryPublicRepoUrl}/tree/${registryPublicRepoBranch}/content/skills` },
    { label: "作者主页", href: authorGithubUrl }
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
    <script>
      window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    </script>
    <script defer src="/_vercel/insights/script.js"></script>
  </head>
  <body>
    <div class="site-shell">
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="/index.html"><strong>Skills</strong><span>Registry</span></a>
          <nav class="nav">
            ${navLinks.map((link) => `<a ${anchorAttrs(link.href)}>${escapeHtml(link.label)}</a>`).join("")}
          </nav>
        </div>
      </header>
      ${body}
      <footer class="footer">
        <div>想看完整步骤、最新更新和示例，请到 <a ${anchorAttrs(registryPublicRepoUrl)}>GitHub</a>。</div>
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
      .map((item) => `<a ${anchorAttrs(preferredSkillHref(item))}>${escapeHtml(item.title)}</a>`)
      .join(" · ");
    const taskItems = (guide?.core_tasks || [scene.summary]).slice(0, 3);
return `<article class="scene-entry">
  <div class="scene-head">
    <div class="scene-meta-row">
      <span class="status-pill status-${status}">${escapeHtml(sceneStatusLabel[status] || status)}</span>
      <span class="count-pill">${skills.length} 个技能</span>
    </div>
    <h3 class="scene-entry-title"><a href="/scenes/${scene.id}/index.html">${escapeHtml(scene.title)}</a></h3>
    <p class="scene-entry-summary">${escapeHtml(scene.summary)}</p>
  </div>
  <div class="scene-tasks">
    <p class="scene-label">你可能要做</p>
    <ul class="compact-list">
      ${taskItems.map((task) => `<li>${escapeHtml(task)}</li>`).join("")}
    </ul>
  </div>
  <div class="scene-starters">
    <p class="scene-label">建议先看</p>
    <div class="scene-links">${starter || '<span class="muted">这个场景的入口技能还在补充</span>'}</div>
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
    <h3 class="skill-name"><a ${anchorAttrs(preferredSkillHref(skill))}>${escapeHtml(skill.title)}</a></h3>
    <div class="skill-meta">${escapeHtml((skill.use_when && skill.use_when[0]) || skill.sceneTitle || "")}</div>
    <div class="skill-contract">${escapeHtml(humanizeVisibility(skill.visibility || "public"))} · ${escapeHtml(humanizeStability(skill.stability || "stable"))} · ${escapeHtml(skill.invoke)}</div>
  </div>
  <div class="skill-copy">${escapeHtml(skill.summary)}</div>
  <div class="skill-io">${previewInputs(skill.inputs)}</div>
  <div class="skill-io">${previewText(skill.returns)}</div>
  <div class="skill-call">${sourceLink("查看 GitHub 说明", sourceSkillHref(skill))}</div>
</div>`
  )
  .join("\n")}
</div>`;
}

function renderEndpointList(links) {
  return `<div class="endpoint-list">
${links
  .map(
    (link) => `<a class="endpoint-card" ${anchorAttrs(link.href)}>
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
    .map((item) => `<a ${anchorAttrs(preferredSkillHref(item))}>${escapeHtml(item.title)}</a>`)
    .join(" · ");
  const chains = (guide.chains || [])
    .map((chain) =>
      chain
        .map((id) => manifestsById.get(id))
        .filter(Boolean)
        .map((item) => `<a ${anchorAttrs(preferredSkillHref(item))}>${escapeHtml(item.title)}</a>`)
        .join(" → ")
    )
    .filter(Boolean);

  return `<div class="scene-guide">
    ${
      guide.core_tasks?.length
        ? `<div class="guide-line"><span>关键任务</span>${guide.core_tasks
            .slice(0, 3)
            .map((task) => escapeHtml(task))
            .join(" · ")}</div>`
        : ""
    }
    ${starter ? `<div class="guide-line"><span>建议起手</span>${starter}</div>` : ""}
    ${chains.length ? `<div class="guide-line"><span>推荐顺序</span>${chains[0]}</div>` : ""}
  </div>`;
}

function renderCoverage(sceneEntries, manifestsById) {
  return `<div class="scene-blocks">
${sceneEntries
  .map(
    ({ scene, skills, guide }) => `<section class="scene-block">
  <div class="scene-block-head">
    <div>
      <p class="section-kicker">场景</p>
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
        `<code>${escapeHtml(input.name)}</code>：${escapeHtml(input.description)}${input.required ? "（必填）" : "（选填）"}`
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
      label: "能直接落地",
      body: "不是只给你一句 prompt。很多 skill 会直接产出页面、脚本、部署结果或可复查记录。"
    },
    {
      label: "先按任务找",
      body: "不知道 skill 名也没关系，先按你要完成的事找入口。"
    },
    {
      label: "先看能不能用",
      body: "每个 skill 会先告诉你适合什么时候用、要准备什么、会拿到什么。"
    },
    {
      label: "详细说明在 GitHub",
      body: "想看完整步骤、更新和示例，直接去 GitHub。"
    }
  ];
  const agentLinks = [
    {
      name: "打开 GitHub 仓库",
      href: registryPublicRepoUrl,
      description: "想看完整说明、更新或示例时，从这里进入。"
    },
    {
      name: "浏览全部技能",
      href: `${registryPublicRepoUrl}/tree/${registryPublicRepoBranch}/content/skills`,
      description: "直接按文件夹浏览所有公开 skill。"
    },
    {
      name: "查看最近更新",
      href: `${registryPublicRepoUrl}/commits/${registryPublicRepoBranch}`,
      description: "想确认最近改了什么，直接看这里。"
    }
  ];

  return layout({
    title: "Skills Registry",
    description: "先按任务找到合适的 skill，再去 GitHub 查看完整说明。",
    canonicalPath: "index.html",
    body: `<main class="page">
  <section class="hero">
    <div>
      <p class="hero-kicker">按任务找技能</p>
      <h1 class="hero-title">先找到要做的事，再点最合适的 skill。</h1>
      <p class="hero-copy">这里先帮你缩小范围：你要完成什么、先看哪个 skill、值不值得继续深看。需要完整步骤和最新更新，再去 GitHub。</p>
      <div class="hero-actions">
        <a class="hero-link" ${anchorAttrs(registryPublicRepoUrl)}>打开 GitHub 仓库</a>
        <a class="hero-link" ${anchorAttrs(`${registryPublicRepoUrl}/tree/${registryPublicRepoBranch}/content/skills`)}>浏览全部技能</a>
        <a class="hero-link" ${anchorAttrs(`${registryPublicRepoUrl}/commits/${registryPublicRepoBranch}`)}>查看最近更新</a>
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
    <div class="stat"><span class="stat-value">${stats.listedSkills}</span><span class="stat-label">已收录技能</span></div>
    <div class="stat"><span class="stat-value">${stats.publicSkills}</span><span class="stat-label">公开技能</span></div>
    <div class="stat"><span class="stat-value">${stats.sanitizedSkills}</span><span class="stat-label">脱敏公开</span></div>
    <div class="stat"><span class="stat-value">${stats.liveScenes}</span><span class="stat-label">已上线场景</span></div>
  </section>

  <section class="section" id="scenes">
    <div class="section-header">
      <div>
        <p class="section-kicker">场景</p>
        <h2 class="section-title">先看你要完成什么</h2>
      </div>
      <div class="section-summary">每个场景会先告诉你在解决什么、从哪里起手、先看哪些 skill。需要细节时再进 GitHub。</div>
    </div>
    ${renderSceneGrid(sceneEntries)}
  </section>

  <section class="section">
    <div class="section-header">
      <div>
        <p class="section-kicker">技能总览</p>
        <h2 class="section-title">挑到合适的，再看完整说明</h2>
      </div>
      <div class="section-summary">这里先帮你判断每个 skill 是干什么的、适合什么时候用、输入输出大概是什么。确定对路，再点进 GitHub 看步骤。</div>
    </div>
    ${renderCoverage(activeSceneEntries, manifestsById)}
  </section>

  <section class="section">
    <div class="section-header">
      <div>
        <p class="section-kicker">继续往下看</p>
        <h2 class="section-title">想继续往下看，就去 GitHub</h2>
      </div>
      <div class="section-summary">GitHub 里有完整说明、最新更新和全部技能文件。首页只负责帮你先挑路。</div>
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
  const primaryUse = (manifest.use_when || []).find(Boolean) || manifest.summary;
  const primaryTask = stripNeedPrefix(primaryUse) || "完成这件事";
  const dependencyLines = [`所属场景：${escapeHtml(sceneTitle)}`];
  const quickInputs =
    Array.isArray(manifest.inputs) && manifest.inputs.length
      ? manifest.inputs
          .slice(0, 3)
          .map((input) => `<code>${escapeHtml(input.name)}</code>`)
          .join("、")
      : "必要上下文";
  const quickReturns =
    Array.isArray(manifest.returns) && manifest.returns.length
      ? manifest.returns
          .slice(0, 3)
          .map((item) => escapeHtml(item))
          .join("、")
      : "处理结果";

  if (manifest.dependencies?.bins?.length) {
    dependencyLines.push(
      `需要安装：${manifest.dependencies.bins.map((bin) => `<code>${escapeHtml(bin)}</code>`).join(" · ")}`
    );
  }
  if (manifest.dependencies?.services?.length) {
    dependencyLines.push(
      `依赖服务：${manifest.dependencies.services.map((service) => escapeHtml(service)).join(" · ")}`
    );
  }
  if (manifest.dependencies?.stateful) {
    dependencyLines.push("运行时可能会登录或改写配置，建议在正式项目环境里执行");
  } else {
    dependencyLines.push("通常不会依赖之前的登录态，也较少改动现有环境");
  }
  if (!manifest.dependencies?.bins?.length && !manifest.dependencies?.services?.length) {
    dependencyLines.push("没有额外运行环境要求");
  }
  const detailLead = `<div class="detail-note">
    <p class="source-kicker">先看能不能用</p>
    <h2 class="detail-note-title">如果你正要${escapeHtml(primaryTask)}，先看它能不能直接帮上你。</h2>
    <p class="detail-note-copy">先对照下面看两件事：你要准备什么，做完后会拿到什么。都对得上，就去 GitHub 按步骤做。</p>
    <div class="scene-guide">
      <div class="guide-line"><span>先准备</span>${quickInputs}</div>
      <div class="guide-line"><span>会得到</span>${quickReturns}</div>
    </div>
    <div class="source-actions">
      ${manifest.source_skill_md_url ? sourceLink("查看完整说明", manifest.source_skill_md_url) : ""}
      ${manifest.source_tree_url ? sourceLink("查看 GitHub 文件", manifest.source_tree_url) : ""}
      ${manifest.source_repo ? sourceLink("打开 GitHub 仓库", manifest.source_repo) : ""}
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
        <p class="side-label">调用方式</p>
        <div><span class="skill-invoke">${escapeHtml(manifest.invoke)}</span></div>
      </div>
      <div class="side-card">
        <p class="side-label">你需要提供</p>
        ${renderDetailInputs(manifest.inputs)}
      </div>
      <div class="side-card">
        <p class="side-label">你会得到</p>
        ${renderSideList((manifest.returns || []).map((item) => escapeHtml(item)))}
      </div>
      <div class="side-card">
        <p class="side-label">适合什么时候用</p>
        ${renderSideList((manifest.use_when || []).map((item) => escapeHtml(item)))}
      </div>
      <div class="side-card">
        <p class="side-label">什么时候先别用</p>
        ${renderSideList((manifest.avoid_when || []).map((item) => escapeHtml(item)))}
      </div>
      <div class="side-card">
        <p class="side-label">关键词</p>
        <div class="skill-tags">${tags.map((tag) => escapeHtml(tag)).join(" · ") || "—"}</div>
      </div>
      ${
        dependencyLines.length
          ? `<div class="side-card">
        <p class="side-label">运行前准备</p>
        ${renderSideList(dependencyLines)}
      </div>`
          : ""
      }
      ${
        related.length
          ? `<div class="side-card">
        <p class="side-label">搭配使用</p>
        ${renderSideList(
          related.map(
            (item) => `<a ${anchorAttrs(preferredSkillHref(item))}>${escapeHtml(item.title)}</a>`
          )
        )}
      </div>`
          : ""
      }
      <div class="side-card">
        <p class="side-label">版本信息</p>
        ${renderSideList([
          `可见性：${escapeHtml(humanizeVisibility(manifest.visibility || "public"))}`,
          `稳定性：${escapeHtml(humanizeStability(manifest.stability || "stable"))}`,
          `最近更新：${escapeHtml(manifest.updated_at)}`
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

  ensureDir(distRoot);
  fs.copyFileSync(stylesSrc, path.join(distRoot, "site.css"));
  if (fs.existsSync(faviconSrc)) {
    fs.copyFileSync(faviconSrc, path.join(distRoot, "favicon.svg"));
  }

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
