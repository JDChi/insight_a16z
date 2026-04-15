# Frontend UI Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the public frontend to two clear primary content types and remove topic/digest UI clutter from the visible experience.

**Architecture:** Keep the existing Astro structure, but change how public pages source and present content. Reuse current cards/layouts where possible, add one dedicated investment list route, and tighten article detail presentation instead of introducing a large component rewrite.

**Tech Stack:** Astro, TypeScript, workspace-shared content fixtures/API responses

---

## File Map

- Modify: `apps/web/src/lib/content-source.ts`
- Modify: `apps/web/src/components/SiteHeader.astro`
- Modify: `apps/web/src/components/ArticleCard.astro`
- Modify: `apps/web/src/components/FilterBar.astro`
- Modify: `apps/web/src/layouts/ContentLayout.astro`
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/src/pages/articles/index.astro`
- Modify: `apps/web/src/pages/articles/[slug].astro`
- Modify: `apps/web/src/pages/archive.astro`
- Create: `apps/web/src/pages/investments/index.astro`

## Task 1: Separate the data model the homepage consumes

- [ ] Add content-source helpers so homepage uses `Article` and `Investment News` as separate arrays with fixed homepage counts.
- [ ] Keep existing topic/digest helpers untouched for now so hidden routes continue to build.

## Task 2: Simplify public navigation and homepage

- [ ] Remove `专题` and `周报` from the visible header.
- [ ] Replace the current hero + topic/digest-heavy homepage with a minimal intro plus two stacked sections.
- [ ] Ensure the `最新文章` section renders 4 items and `最新投资动态` renders 3 items.

## Task 3: Give investments a dedicated list page

- [ ] Add a dedicated list route for investment news.
- [ ] Keep `/articles` limited to `Article`.
- [ ] Update homepage and header links to use the dedicated route instead of a filter-driven explanation.

## Task 4: Clarify archive and detail presentation

- [ ] Keep archive as a broader browse surface, but change copy so it reads as secondary navigation.
- [ ] Remove topic references from article detail pages.
- [ ] Make the content type more visible in the detail header rather than burying it in generic meta.

## Task 5: Tighten card-level hierarchy

- [ ] Improve `ArticleCard` so content-type labeling is more immediately readable.
- [ ] Preserve summaries and topic tags unless they conflict with the new clarity goal.

## Task 6: Verify

- [ ] Run `pnpm --filter @insight-a16z/web check`
- [ ] Run `pnpm --filter @insight-a16z/web build`
- [ ] Fix any issues before concluding
