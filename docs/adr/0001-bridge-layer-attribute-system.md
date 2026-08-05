# ADR-0001: Bridge-layer attribute system for player sub-attributes

**Status:** Accepted (2026-08-05)
**Discussed with:** Administrator

## Context

The engine (`public/sim.js`) exposes only a single `ovr` integer via `window.SIM.state()`. The React app needs to display finer-grained player attributes (Technical, Physical, Mental with 15 sub-attributes in total) to give depth to the player card. The engine is obfuscated and cannot be forked.

## Decision

Build an attribute system in the bridge layer (`src/attributes.js`), separate from both the engine and React state management:

1. Attributes live as private state inside the bridge module, queried via exported functions bridged through `SIM.*` on `simEngine.js`.
2. Initial attributes are derived from position-specific weight matrices, a seed-driven deterministic RNG, a hidden potential value, and a development curve type.
3. Each `NEXT_STEP` tick, attributes evolve based on age, development curve, potential ceiling, and the engine's latest `ovr` value (used as an anchor for OVR-attribute consistency).
4. The GameContext reducer does not store or know about attributes — it is purely a bridge-layer concern.
5. UI is accessed by clicking the OVR badge in CareerView, which opens a modal panel.

## Alternatives considered

- **Pure frontend derivation from OVR alone** — rejected because it can't model position-specific profiles or independent growth curves.
- **Extending `window.SIM.state()`** — rejected because the engine is obfuscated; reverse-engineering would be fragile and costly.
- **Storing attributes in GameContext state** — rejected because it violates low coupling; attributes should be a self-contained module.

## Consequences

- Any component can query attributes by importing `SIM` (already a dependency of all game views).
- Attribute changes are invisible to GameContext (no reducer changes), reducing blast radius.
- The attribute module is fully testable in isolation (pure functions for generation/ticking, no React dependency).
- Future modules (e.g., scouting, training) can consume the same attribute interface without knowing internal details.
- Risk: attribute-derived OVR might drift from engine OVR over long careers. Mitigated by anchoring tick to engine OVR deltas.
