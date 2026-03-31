'use client';

export interface ConfigurableParam {
  key: string;
  nodeId?: string;
  label: string;
  type: 'cron' | 'number' | 'string' | 'select' | 'boolean';
  default: any;
  options?: { label: string; value: any }[];
  description?: string;
}

export interface WorkflowCatalogItem {
  id: string;
  name: string;
  description: string;
  module: string;
  category: string;
  icon: string | null;
  nodesJson: any[];
  edgesJson: any[];
  configurableParams: ConfigurableParam[];
  version: number;
  installCount: number;
  isPublished: boolean;
  installed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentCatalogItem {
  id: string;
  name: string;
  description: string;
  role: string;
  category: string;
  icon: string | null;
  adapterType: string;
  promptTemplate: string;
  skills: string[];
  permissions: Record<string, unknown>;
  configurableParams: ConfigurableParam[];
  version: number;
  installCount: number;
  isPublished: boolean;
  installed: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MarketplaceTab = 'my' | 'marketplace';
