export interface ActionParamField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  required?: boolean;
  options?: { value: string; label: string }[];
}

export type ActionExecutorType =
  | 'api_call'
  | 'navigate'
  | 'workflow'
  | 'client_action';

export interface ActionDefinition {
  type: string;
  label: string;
  description: string;
  objectType: string;
  conditions: ActionCondition[];
  params: ActionParamField[];
  executor: ActionExecutorType;
  executorConfig: Record<string, any>;
}

export interface ActionCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'not_exists';
  value?: any;
}
