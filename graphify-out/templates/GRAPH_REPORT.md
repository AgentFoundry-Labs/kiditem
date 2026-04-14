# Graph Report - packages/templates  (2026-04-14)

## Corpus Check
- Corpus is ~3,802 words - fits in a single context window. You may not need a graph.

## Summary
- 28 nodes · 16 edges · 15 communities detected
- Extraction: 81% EXTRACTED · 19% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (4n)|Cluster 0 (4n)]]
- [[_COMMUNITY_Cluster 1 (4n)|Cluster 1 (4n)]]
- [[_COMMUNITY_Cluster 2 (3n)|Cluster 2 (3n)]]
- [[_COMMUNITY_Cluster 3 (3n)|Cluster 3 (3n)]]
- [[_COMMUNITY_Cluster 4 (2n)|Cluster 4 (2n)]]
- [[_COMMUNITY_Cluster 5 (2n)|Cluster 5 (2n)]]
- [[_COMMUNITY_Cluster 6 (2n)|Cluster 6 (2n)]]
- [[_COMMUNITY_Cluster 7 (1n)|Cluster 7 (1n)]]
- [[_COMMUNITY_Cluster 8 (1n)|Cluster 8 (1n)]]
- [[_COMMUNITY_Cluster 9 (1n)|Cluster 9 (1n)]]
- [[_COMMUNITY_Cluster 10 (1n)|Cluster 10 (1n)]]
- [[_COMMUNITY_Cluster 11 (1n)|Cluster 11 (1n)]]
- [[_COMMUNITY_Cluster 12 (1n)|Cluster 12 (1n)]]
- [[_COMMUNITY_Cluster 13 (1n)|Cluster 13 (1n)]]
- [[_COMMUNITY_Cluster 14 (1n)|Cluster 14 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `Pattern: Template Registration via getTemplate()` - 3 edges
2. `transformKeys()` - 2 edges
3. `parseDetailPageData()` - 2 edges
4. `getDisabledSections()` - 2 edges
5. `themeVars()` - 2 edges
6. `Pattern: parseDetailPageData snake_case to camelCase conversion` - 2 edges
7. `File: src/templates/{id}/` - 2 edges
8. `File: getTemplate()` - 2 edges
9. `Pattern: Detail Page Templates` - 1 edges
10. `Pattern: Theme Customization via CSS Variables` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Hyperedges (group relationships)
- **Template authoring workflow** — claude_pattern_snake_to_camel_parsing, claude_pattern_template_registration, claude_pattern_theme_customization [INFERRED]

## Communities

### Community 0 - "Cluster 0 (4n)"
Cohesion: 0.67
Nodes (2): getDisabledSections(), themeVars()

### Community 1 - "Cluster 1 (4n)"
Cohesion: 0.67
Nodes (3): File: getTemplate(), File: src/templates/{id}/, Pattern: Template Registration via getTemplate()

### Community 2 - "Cluster 2 (3n)"
Cohesion: 1.0
Nodes (2): parseDetailPageData(), transformKeys()

### Community 3 - "Cluster 3 (3n)"
Cohesion: 0.67
Nodes (2): Pattern: parseDetailPageData snake_case to camelCase conversion, Rule: parseDetailPageData() converts snake_case API response to camelCase

### Community 4 - "Cluster 4 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 5 - "Cluster 5 (2n)"
Cohesion: 1.0
Nodes (2): Pattern: Theme Customization via CSS Variables, Rule: Theme customization uses CSS custom properties (--theme-color-main, etc.)

### Community 6 - "Cluster 6 (2n)"
Cohesion: 1.0
Nodes (2): Pattern: Detail Page Templates, Rule: Package name is @kiditem/templates

### Community 7 - "Cluster 7 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 8 - "Cluster 8 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 9 - "Cluster 9 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "Cluster 10 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Cluster 11 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Cluster 12 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Cluster 13 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Cluster 14 (1n)"
Cohesion: 1.0
Nodes (1): Rule: layout.components[].enabled controls per-section show/hide

## Knowledge Gaps
- **6 isolated node(s):** `Pattern: Detail Page Templates`, `Pattern: Theme Customization via CSS Variables`, `Rule: parseDetailPageData() converts snake_case API response to camelCase`, `Rule: Theme customization uses CSS custom properties (--theme-color-main, etc.)`, `Rule: layout.components[].enabled controls per-section show/hide` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 4 (2n)`** (2 nodes): `getTemplate()`, `registry.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 5 (2n)`** (2 nodes): `Pattern: Theme Customization via CSS Variables`, `Rule: Theme customization uses CSS custom properties (--theme-color-main, etc.)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 6 (2n)`** (2 nodes): `Pattern: Detail Page Templates`, `Rule: Package name is @kiditem/templates`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 7 (1n)`** (1 nodes): `tsup.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 8 (1n)`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 9 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (1n)`** (1 nodes): `placeholder.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (1n)`** (1 nodes): `config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (1n)`** (1 nodes): `generate-json-schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (1n)`** (1 nodes): `config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (1n)`** (1 nodes): `Rule: layout.components[].enabled controls per-section show/hide`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 2 inferred relationships involving `Pattern: Template Registration via getTemplate()` (e.g. with `File: src/templates/{id}/` and `File: getTemplate()`) actually correct?**
  _`Pattern: Template Registration via getTemplate()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Pattern: Detail Page Templates`, `Pattern: Theme Customization via CSS Variables`, `Rule: parseDetailPageData() converts snake_case API response to camelCase` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._