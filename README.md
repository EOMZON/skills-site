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
```

Output goes to `dist/`.
