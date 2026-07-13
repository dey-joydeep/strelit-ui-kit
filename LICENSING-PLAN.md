# Licensing Plan

## Status

This document is a planning note only. It is **not** the final legal licensing text for the product.

The goal is to avoid blocking development while preserving a clear intended direction.

## Intended Model

The expected commercial model is **open core**, not classic dual licensing.

Why:

- the current codebase is derived from an MIT-licensed v2 base
- MIT already grants broad reuse rights for the core
- selling a second license for the exact same MIT core is weak leverage
- commercial value is better created through add-ons, tooling, integration layers, and services

## Planned Licensing Direction

### Core

- core workspace/layout engine remains under `MIT`
- upstream MIT obligations and notices must be preserved where required

### Commercial Parts

Commercial parts should be introduced later as clearly separated modules such as:

- pro add-ons
- enterprise modules
- premium framework adapters
- visual builder/editor tooling
- persistence/collaboration features
- migration/validation/support tooling

These should be licensed separately under a commercial license when they actually exist.

## Structural Guidance

When commercial code is introduced, keep it clearly separated from MIT core code.

Preferred direction:

- `packages/core` or equivalent for MIT-covered code
- `packages/pro` and/or `packages/enterprise` for commercial modules

Avoid mixing MIT core and proprietary code in the same folders without clear boundaries.

## Deferred Decisions

These are intentionally postponed until product shape is more mature:

- final commercial license text
- whether commercial modules live in the same repo or separate repos
- contributor agreement / CLA policy
- paid support / OEM / hosted-service terms
- trademark/brand policy text

## Current Rule

Until commercial modules are actually designed and implemented:

- continue development normally
- keep the current repo aligned with the MIT-derived core direction
- defer final legal packaging until the product surface is clearer
