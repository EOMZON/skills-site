# Skills Site

Pure presentation layer for the public skills registry.

## Principles

- Reads from `../skills-registry`
- Does not hand-author skill content
- Builds static HTML
- Exposes agent-friendly JSON and `llms.txt`

## Build

```bash
cd skills-site
npm run build
npm run verify
```

Output goes to `dist/`.

`verify` rebuilds the public projection, checks its privacy/source contract, proves a failed build preserves the last-known-good output, and exercises clone/pull registry fallback with an offline fake Git executable. Registry URLs are passed as a single argument and are never evaluated by a shell.
