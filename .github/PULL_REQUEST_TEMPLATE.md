<!--
Thanks for opening a PR! Please fill in the sections below.
-->

## Summary

<!-- One or two sentences. What does this change and why? -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / internal-only
- [ ] Docs
- [ ] Build / CI / tooling

## Related issues

<!-- Closes #123, Refs #456 -->

## What I did

- 

## How I verified it

<!-- Commands run, projects tested against, before/after numbers. -->

```bash
npm run typecheck
npm run build
# manual checks:
node dist/index.js init --cwd <some-project>
node dist/index.js add db-navigator --cwd <some-project>
```

## Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] I tested the change against at least one real-world project
- [ ] If I added a new skill template, it includes a `manifest.json` and `SKILL.md`
- [ ] If I added a new detector / extractor, it degrades gracefully when nothing matches
- [ ] No new runtime dependencies were added without justification

## Notes for reviewers

<!-- Anything reviewers should pay extra attention to, or pieces I'm unsure about. -->
