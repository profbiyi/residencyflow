
export enum PipelineStatus {
  Running = 'RUNNING',
  Idle = 'IDLE',
  Failed = 'FAILED',
  Completed = 'COMPLETED'
}

export type SyncMode = 'full_load' | 'incremental_append' | 'incremental_merge';

export type Frequency = 'realtime' | 'hourly' | 'daily' | 'weekly' | 'manual';

export type UserRole = 'SuperAdmin' | 'Owner' | 'Admin' | 'Viewer';

export type SchemaPolicy = 'evolve' | 'freeze' | 'discard_value' | 'fail';

export interface NotificationConfig {
  email?: string;
  slackWebhook?: string;
  onFailure: boolean;
  onSuccess: boolean;
}

export interface TransformationConfig {
  dbtRepoUrl?: string;
  dbtModelName?: string;
  runAfterLoad: boolean;
}

export interface PerformanceConfig {
  batchSize: number; // e.g., 10000
  parallelism: number; // e.g., 4 threads
  memoryLimit: string; // e.g., '512MB'
}

export interface RunHistory {
  id: string;
  pipelineId: string;
  status: 'Success' | 'Failed' | 'Running';
  startTime: string;
  duration: string;
  rows: number;
  logs: string[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string; // URL friendly name
  createdAt: string;
  status: 'Active' | 'Suspended';
  ownerEmail?: string; // For display in Super Admin
  plan: 'Starter' | 'Pro' | 'Enterprise';
  billingCycle: 'Monthly' | 'Yearly';
}

export interface User {
  id: string;
  organizationId: string | null; // Links user to an organization (null for SuperAdmin)
  name: string;
  companyName: string; // Display name for UI
  email: string;
  role?: UserRole;
  avatar?: string;
}

export interface TeamMember {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'Active' | 'Pending';
  joinedAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  status: 'Success' | 'Failure';
}

export interface BillingStats {
  planName: string;
  rowsUsed: number;
  rowsLimit: number;
  costCurrent: number;
  renewalDate: string;
}

// --- SCHEMA DRIVEN FORMS ---
export interface JsonSchemaProperty {
  type: 'string' | 'integer' | 'boolean' | 'array';
  title?: string;
  description?: string;
  default?: any;
  enum?: string[];
  format?: 'password' | 'email' | 'uri' | 'json';
  secret?: boolean; // UI Hint
}

export interface ConnectorSpecification {
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
}

export interface ConnectorType {
  id: string;
  name: string;
  icon: string;
  type: 'source' | 'destination';
  description: string;
  category?: string;
  schema: ConnectorSpecification; 
}

export interface ConnectorInstance {
  id: string;
  organizationId: string; // Data Isolation Scope
  name: string; 
  typeId: string; 
  status: 'active' | 'error' | 'pending';
  configuration?: Record<string, any>; 
  region?: string;
  createdBy: string; // User ID for audit
}

export interface Pipeline {
  id: string;
  organizationId: string; // Data Isolation Scope
  name: string;
  sourceId: string; 
  destinationId: string; 
  frequency: Frequency;
  syncMode: SyncMode;
  status: PipelineStatus;
  lastRun: string;
  rowsProcessed: number;
  latency: string;
  errorRate: string;
  residency: string;
  createdBy: string; // User ID for audit
  
  // Enterprise Features
  schemaPolicy: SchemaPolicy;
  notifications?: NotificationConfig;
  transformation?: TransformationConfig;
  performance?: PerformanceConfig;
}

// --- OBSERVABILITY & LINEAGE ---
export interface DataQualityMetric {
  column: string;
  nullCount: number;
  uniqueCount: number;
  min?: string | number;
  max?: string | number;
  score: number; // 0-100
}

export interface ColumnLineage {
  sourceColumn: string;
  targetColumn: string;
  transformationType: 'Direct' | 'Hashed (PII)' | 'Derived' | 'Redacted';
}

export interface LineageNode {
  id: string;
  label: string;
  type: 'source' | 'transform' | 'storage' | 'model';
  status: 'healthy' | 'error' | 'warning';
  icon: string;
  freshness: string;
  volume: string;
  metrics?: DataQualityMetric[];
  columns?: ColumnLineage[];
  x?: number; // For visual layout
  y?: number;
}

export interface LineageEdge {
  from: string;
  to: string;
}

export interface ChartData {
  name: string;
  value: number;
  secondary?: number;
}

export interface InsightResult {
  title: string;
  description: string;
  sqlQuery?: string;
  severity: 'info' | 'warning' | 'positive';
}

export interface BackendState {
  status: 'online' | 'offline' | 'connecting';
  version: string;
  workerCount: number;
  uptime: string;
}