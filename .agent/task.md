# Task List: Label System Refactoring

## Infrastructure
- [ ] **Implement SpatialIndex** <!-- id: 1 -->
  - Create a lightweight spatial index class (R-Tree inspired) in `panorama.html`.
  - Methods: `insert(rect)`, `search(rect)`, `clear()`.
- [ ] **Refactor Layout Logic (LabelGenerator)** <!-- id: 2 -->
  - Extract H/V/Wrap calculation logic from `drawLabels`.
  - Create `generateCandidates(group, ...)` function that returns possible layout variants.

## Core Algorithm
- [ ] **Implement PositionScorer** <!-- id: 3 -->
  - Define scoring function based on overlap, tier, and centering.
- [ ] **Implement LayoutOptimizer** <!-- id: 4 -->
  - Main loop to place labels.
  - Integrate Tier-based sorting and multi-candidate trials.
  - Use `SpatialIndex` for collision detection.

## Integration & Rendering
- [ ] **Implement LabelRenderer** <!-- id: 5 -->
  - Function to generate DOM elements from placement results.
  - Ensure CSS classes (`era-label`, tiers) and events are attached.
- [ ] **Wiring Up** <!-- id: 6 -->
  - Replace `Core.render.drawLabels` with the new system.
  - Verify render loop and event handling.

## Polish
- [ ] **Tuning & Visual Fixes** <!-- id: 7 -->
  - Adjust padding/margins for collision boxes.
  - Optimize fallback dots interaction.
