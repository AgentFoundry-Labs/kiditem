export interface WorkflowNodeDef {
  id: string;
  type: string;
  label: string;
  config: Record<string, any>;
  position: { x: number; y: number };
}

export interface WorkflowEdgeDef {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ExecuteData {
  nodeId: string;
  inputData: Record<string, any>;
}

export class DAG {
  readonly nodes: Map<string, WorkflowNodeDef>;
  private adjacency: Map<string, string[]>;
  private incoming: Map<string, string[]>;
  private edgeLabels: Map<string, string | undefined>;

  constructor(nodesJson: any[], edgesJson: any[]) {
    this.nodes = new Map();
    this.adjacency = new Map();
    this.incoming = new Map();
    this.edgeLabels = new Map();

    for (const n of nodesJson) {
      const def: WorkflowNodeDef = {
        id: n.id,
        type: n.data?.nodeType ?? n.type ?? '',
        label: n.data?.label ?? n.label ?? '',
        config: n.data?.config ?? n.config ?? {},
        position: n.position ?? { x: 0, y: 0 },
      };
      this.nodes.set(n.id, def);
      this.adjacency.set(n.id, []);
      this.incoming.set(n.id, []);
    }

    for (const e of edgesJson) {
      const targets = this.adjacency.get(e.source);
      if (targets) targets.push(e.target);

      const sources = this.incoming.get(e.target);
      if (sources) sources.push(e.source);

      this.edgeLabels.set(`${e.source}:${e.target}`, e.label);
    }
  }

  getStartNodes(): string[] {
    return [...this.nodes.keys()].filter(
      (id) => (this.incoming.get(id) ?? []).length === 0,
    );
  }

  getNextNodes(nodeId: string, branch?: string | null): string[] {
    const targets = this.adjacency.get(nodeId) ?? [];
    if (branch === undefined || branch === null) return targets;
    return targets.filter(
      (t) => this.edgeLabels.get(`${nodeId}:${t}`) === branch,
    );
  }

  getIncoming(nodeId: string): string[] {
    return this.incoming.get(nodeId) ?? [];
  }

  getIncomingCount(nodeId: string): number {
    return (this.incoming.get(nodeId) ?? []).length;
  }
}
