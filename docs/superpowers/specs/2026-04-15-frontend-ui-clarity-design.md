# Frontend UI Clarity Design

**Date:** 2026-04-15

## Goal

Clarify the public site's information architecture so users can immediately understand the visible content model without inferring relationships between overlapping concepts.

## Approved Direction

The public UI should expose only two primary content categories:

- `文章`: analysis pages sourced from `Articles`
- `投资动态`: analysis pages sourced from `Investment News`

The following concepts should be removed from the visible frontend for this iteration:

- `专题`
- `周报`

These backend/data capabilities can remain in place, but they should not appear in the public navigation, homepage modules, or article detail surfaces for now.

## Information Architecture

### Navigation

Visible primary navigation:

- `文章`
- `投资动态`
- `归档`

### Homepage

Homepage should use a top-to-bottom structure, not a persistent two-column layout:

1. Minimal hero with the site positioning statement
2. `最新文章` section
3. `最新投资动态` section

Homepage content limits:

- `最新文章`: 4 items
- `最新投资动态`: 3 items

`文章` should appear before `投资动态`.

### List Pages

Each primary category should have its own dedicated list page. Users should not have to rely on a type filter to understand where they are.

- `/articles`: only `Article`
- dedicated investment list page: only `Investment News`

`归档` can remain as a broader browse surface, but it should not be the primary navigation model.

### Detail Pages

Detail pages should keep the existing analysis structure, but make type recognition clearer:

- show content type prominently near the title
- retain source information (`英文原标题`, source link)
- remove `关联专题`

## Visual Direction

This iteration is a clarity pass, not a full rebrand.

Keep:

- current warm palette
- soft panel aesthetic
- existing typography system

Adjust:

- stronger section hierarchy
- more visible content-type labeling
- fewer competing modules on the homepage

## Non-Goals

- redesigning backend models
- deleting topic/digest APIs or pages
- introducing complex filters or new interaction patterns
- changing the content strategy away from structured Chinese analysis
