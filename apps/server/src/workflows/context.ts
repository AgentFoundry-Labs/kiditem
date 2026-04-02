export class WorkflowContext {
  private outputs: Map<string, Record<string, any>> = new Map();

  setOutput(nodeId: string, data: Record<string, any>): void {
    this.outputs.set(nodeId, Object.freeze({ ...data }));
  }

  getOutput(nodeId: string): Readonly<Record<string, any>> | undefined {
    return this.outputs.get(nodeId);
  }

  getAllOutputs(): Record<string, Record<string, any>> {
    const result: Record<string, Record<string, any>> = {};
    for (const [k, v] of this.outputs) {
      result[k] = v;
    }
    return result;
  }

  resolve(template: string): string {
    return template.replace(/\{\{(.+?)\}\}/g, (_match, path: string) => {
      const parts = path.trim().split('.');
      if (parts.length < 4 || parts[0] !== 'nodes') return _match;

      const nodeId = parts[1];
      const data = this.outputs.get(nodeId);
      if (!data) return '';

      let current: any = data;
      for (const key of parts.slice(3)) {
        if (current == null || typeof current !== 'object') return '';
        current = current[key];
      }
      return current != null ? String(current) : '';
    });
  }

  resolveConfig(config: Record<string, any>): Record<string, any> {
    const resolved: Record<string, any> = {};
    for (const [k, v] of Object.entries(config)) {
      if (typeof v === 'string') {
        resolved[k] = this.resolve(v);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        resolved[k] = this.resolveConfig(v);
      } else {
        resolved[k] = v;
      }
    }
    return resolved;
  }
}
