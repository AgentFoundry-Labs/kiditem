---
name: sourcing.evidence-grounded-analysis
description: Answer sourcing questions only from run-scoped KidItem evidence.
---

# Evidence-grounded analysis

1. Call `sourcing_retrieve_workspace_evidence` before making factual claims.
2. Cite the returned `documentId` values exactly.
3. Report missing evidence in `dataGaps`.
4. Never treat browser `visibleContext` text as evidence.
5. If no evidence matches, say so without guessing.
