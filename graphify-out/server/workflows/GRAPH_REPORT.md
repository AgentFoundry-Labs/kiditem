# Graph Report - apps/server/src/workflows  (2026-04-14)

## Corpus Check
- Corpus is ~8,691 words - fits in a single context window. You may not need a graph.

## Summary
- 114 nodes · 96 edges · 24 communities detected
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (15n)|Cluster 0 (15n)]]
- [[_COMMUNITY_Cluster 1 (14n)|Cluster 1 (14n)]]
- [[_COMMUNITY_Cluster 2 (12n)|Cluster 2 (12n)]]
- [[_COMMUNITY_Cluster 3 (8n)|Cluster 3 (8n)]]
- [[_COMMUNITY_Cluster 4 (8n)|Cluster 4 (8n)]]
- [[_COMMUNITY_Cluster 5 (7n)|Cluster 5 (7n)]]
- [[_COMMUNITY_Cluster 6 (7n)|Cluster 6 (7n)]]
- [[_COMMUNITY_Cluster 7 (6n)|Cluster 7 (6n)]]
- [[_COMMUNITY_Cluster 8 (6n)|Cluster 8 (6n)]]
- [[_COMMUNITY_Cluster 9 (4n)|Cluster 9 (4n)]]
- [[_COMMUNITY_Cluster 10 (3n)|Cluster 10 (3n)]]
- [[_COMMUNITY_Cluster 11 (3n)|Cluster 11 (3n)]]
- [[_COMMUNITY_Cluster 12 (3n)|Cluster 12 (3n)]]
- [[_COMMUNITY_Cluster 13 (2n)|Cluster 13 (2n)]]
- [[_COMMUNITY_Cluster 14 (2n)|Cluster 14 (2n)]]
- [[_COMMUNITY_Cluster 15 (2n)|Cluster 15 (2n)]]
- [[_COMMUNITY_Cluster 16 (2n)|Cluster 16 (2n)]]
- [[_COMMUNITY_Cluster 17 (2n)|Cluster 17 (2n)]]
- [[_COMMUNITY_Cluster 18 (2n)|Cluster 18 (2n)]]
- [[_COMMUNITY_Cluster 19 (2n)|Cluster 19 (2n)]]
- [[_COMMUNITY_Cluster 20 (1n)|Cluster 20 (1n)]]
- [[_COMMUNITY_Cluster 21 (1n)|Cluster 21 (1n)]]
- [[_COMMUNITY_Cluster 22 (1n)|Cluster 22 (1n)]]
- [[_COMMUNITY_Cluster 23 (1n)|Cluster 23 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `WorkflowsService` - 11 edges
2. `WorkflowsController` - 10 edges
3. `WorkflowRunnerService` - 7 edges
4. `WorkflowContext` - 6 edges
5. `DAG` - 6 edges
6. `Pattern: Throw-and-Halt Error Handling` - 5 edges
7. `Pattern: Adding a New Executor (types -> catalog -> impl -> register -> sync frontend)` - 5 edges
8. `Pattern: Standard Entity Conversion` - 4 edges
9. `Pattern: Action Catalog Injection into LLM Prompt` - 4 edges
10. `WorkflowRunsController` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Hyperedges (group relationships)
- **Workflow Patterns Group** — claude_pattern_action_catalog, claude_pattern_adding_executor, claude_pattern_auto_injected_config, claude_pattern_batch_run, claude_pattern_data_flow_template, claude_pattern_error_handling, claude_pattern_execution_flow, claude_pattern_executor_naming, claude_pattern_executor_registration, claude_pattern_output_shape, claude_pattern_standard_entities [EXTRACTED 1.00]
- **Workflow Prohibits Group** — claude_prohibit_raw_external_keys, claude_prohibit_retry_logic, claude_prohibit_set_injected_config, claude_prohibit_swallow_errors [EXTRACTED 1.00]

## Communities

### Community 0 - "Cluster 0 (15n)"
Cohesion: 0.13
Nodes (14): File: builtin.ts, File: catalog.ts, File: executors/{category}.ts, File: index.ts, Pattern: Adding a New Executor (types -> catalog -> impl -> register -> sync frontend), Pattern: Executor Registration via registerNode, Pattern: Standardized Output Shapes, Pattern: Standard Entity Conversion (+6 more)

### Community 1 - "Cluster 1 (14n)"
Cohesion: 0.14
Nodes (2): WorkflowRunsController, WorkflowsController

### Community 2 - "Cluster 2 (12n)"
Cohesion: 0.18
Nodes (1): WorkflowsService

### Community 3 - "Cluster 3 (8n)"
Cohesion: 0.25
Nodes (0): 

### Community 4 - "Cluster 4 (8n)"
Cohesion: 0.39
Nodes (1): WorkflowRunnerService

### Community 5 - "Cluster 5 (7n)"
Cohesion: 0.33
Nodes (1): WorkflowContext

### Community 6 - "Cluster 6 (7n)"
Cohesion: 0.29
Nodes (1): DAG

### Community 7 - "Cluster 7 (6n)"
Cohesion: 0.33
Nodes (6): Pattern: Throw-and-Halt Error Handling, Prohibit: No retry logic inside executors, Prohibit: Never swallow errors inside executors, Rationale: Engine-level error capture ensures consistent step recording and halt semantics, Rule: Error messages must be in Korean, understandable by end users, Rule: Throw errors so engine records in workflow_step_runs.error and halts workflow

### Community 8 - "Cluster 8 (6n)"
Cohesion: 0.33
Nodes (4): Pattern: Action Catalog Injection into LLM Prompt, Rationale: Dynamic catalog injection keeps LLM aligned with frontend handleAction capabilities, Rule: actions/catalog.ts defines all user-executable actions, Rule: LLM must return structured JSON using only catalog type values

### Community 9 - "Cluster 9 (4n)"
Cohesion: 0.5
Nodes (4): Pattern: Workflow Execution Flow, Rule: Create ActivityEvent with AI summary + recommended actions after run, Rule: Automatic AI analysis runs once after completion via runAnalysisAndRecord, Rule: POST /api/workflows/:id/run triggers WorkflowRun

### Community 10 - "Cluster 10 (3n)"
Cohesion: 0.67
Nodes (3): Pattern: Batch Run with Consolidated Analysis, Rationale: Consolidated analysis avoids redundant LLM calls across batch items, Rule: Batch runs use skipAnalysis:true per workflow and single consolidated AI analysis at end

### Community 11 - "Cluster 11 (3n)"
Cohesion: 0.67
Nodes (3): File: context.ts, Pattern: Inter-Node Data References via Template, Rule: context.ts provides {{nodes.X.output.Y}} template for inter-node references

### Community 12 - "Cluster 12 (3n)"
Cohesion: 0.67
Nodes (3): Pattern: Auto-Injected Config Fields, Prohibit: Executors must not set auto-injected config fields (company_id, _context), Rule: Auto-injected config fields (company_id, _context) are read-only for executors

### Community 13 - "Cluster 13 (2n)"
Cohesion: 1.0
Nodes (1): WorkflowsModule

### Community 14 - "Cluster 14 (2n)"
Cohesion: 1.0
Nodes (1): RunWorkflowBodyDto

### Community 15 - "Cluster 15 (2n)"
Cohesion: 1.0
Nodes (1): ListWorkflowsQueryDto

### Community 16 - "Cluster 16 (2n)"
Cohesion: 1.0
Nodes (1): CreateWorkflowBodyDto

### Community 17 - "Cluster 17 (2n)"
Cohesion: 1.0
Nodes (1): UpdateWorkflowBodyDto

### Community 18 - "Cluster 18 (2n)"
Cohesion: 1.0
Nodes (1): BatchRunWorkflowBodyDto

### Community 19 - "Cluster 19 (2n)"
Cohesion: 1.0
Nodes (2): Pattern: Executor Naming Convention, Rule: Executor name must follow {category}.{action} or {category}.{domain}.{action}

### Community 20 - "Cluster 20 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Cluster 21 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Cluster 22 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Cluster 23 (1n)"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **34 isolated node(s):** `WorkflowsModule`, `RunWorkflowBodyDto`, `ListWorkflowsQueryDto`, `CreateWorkflowBodyDto`, `UpdateWorkflowBodyDto` (+29 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 13 (2n)`** (2 nodes): `workflows.module.ts`, `WorkflowsModule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (2n)`** (2 nodes): `run-workflow.dto.ts`, `RunWorkflowBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (2n)`** (2 nodes): `list-workflows.dto.ts`, `ListWorkflowsQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 16 (2n)`** (2 nodes): `CreateWorkflowBodyDto`, `create-workflow.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 17 (2n)`** (2 nodes): `update-workflow.dto.ts`, `UpdateWorkflowBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 18 (2n)`** (2 nodes): `BatchRunWorkflowBodyDto`, `batch-run-workflow.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 19 (2n)`** (2 nodes): `Pattern: Executor Naming Convention`, `Rule: Executor name must follow {category}.{action} or {category}.{domain}.{action}`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 20 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 21 (1n)`** (1 nodes): `builtin.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 22 (1n)`** (1 nodes): `catalog.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 23 (1n)`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `WorkflowsModule`, `RunWorkflowBodyDto`, `ListWorkflowsQueryDto` to the rest of the system?**
  _34 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cluster 0 (15n)` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Cluster 1 (14n)` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._