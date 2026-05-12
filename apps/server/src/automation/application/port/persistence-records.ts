// Opaque JSON payload at the application-port boundary. Repository adapters
// own ORM-specific JsonNull/InputJsonValue conversion.
export type JsonValue = unknown;

export interface AlertRecord {
  id: string;
  organizationId: string;
  kind: string;
  status: string;
  type: string;
  severity: string;
  title: string;
  message: string | null;
  targetType: string | null;
  targetId: string | null;
  operationKey: string | null;
  sourceType: string | null;
  sourceId: string | null;
  actorUserId: string | null;
  actionTaskId: string | null;
  href: string | null;
  progress: number | null;
  metadata: JsonValue;
  isRead: boolean;
  readAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionTaskRecord {
  id: string;
  organizationId: string;
  taskKey: string;
  type: string;
  label: string;
  detail: string | null;
  where: string | null;
  href: string | null;
  priority: string;
  role: string | null;
  status: string;
  date: Date;
  assigneeUserId: string | null;
  apiCall: JsonValue;
  result: JsonValue;
  notes: JsonValue;
  activityLog: JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketplaceRecord {
  id: string;
  type: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  module: string | null;
  nodesJson: JsonValue;
  edgesJson: JsonValue;
  role: string | null;
  adapterType: string | null;
  promptTemplate: string | null;
  skills: string[];
  permissions: JsonValue;
  configurableParams: JsonValue;
  version: number;
  installCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowTemplateRecord {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  module: string;
  isActive: boolean;
  triggerType: string;
  schedule: string | null;
  nodesJson: JsonValue;
  edgesJson: JsonValue;
  version: number;
  marketplaceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowRunRecord {
  id: string;
  organizationId: string | null;
  templateId: string;
  status: string;
  triggeredBy: string;
  triggeredByUserId: string | null;
  contextData: JsonValue;
  steps: JsonValue;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
