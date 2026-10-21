// Domain type definitions for Content Automation Frontend

export type ServiceStatus = {
  online: boolean;
  status?: number;
  url?: string;
  host?: string;
  port?: string;
  database?: string;
  error?: string | null;
};

export type SystemTelemetry = {
  cpu_percent: number | null;
  ram_percent: number | null;
  disk_free_gb: number | null;
  captured_at: string;
  source: string;
};

export type SystemStatusResponse = {
  ok: boolean;
  services: {
    n8n: ServiceStatus;
    postgresql: ServiceStatus;
    qa_worker: ServiceStatus;
    openshorts: ServiceStatus;
  };
  telemetry: SystemTelemetry | null;
  timestamp: string;
};

export type Job = {
  job_id: string;
  job_type: string;
  entity_id: string | null;
  correlation_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  attempt: number;
  max_attempts: number;
  priority: number;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
  next_retry_at: string | null;
  created_at: string;
};

export type ContentItem = {
  content_id: string;
  status: string;
  current_version: number;
  approved_version: number | null;
  created_at: string;
  updated_at: string;
  channel_name: string | null;
  platforms: string[];
  hook_text: string | null;
  quality_score: number | null;
  thumbnail_url: string | null;
  per_platform: Record<string, any>;
  source_title: string | null;
  source_url: string | null;
};

export type Approval = {
  approval_id: string;
  content_id: string;
  kind: string;
  status: 'awaiting_approval' | 'approved' | 'rejected' | 'auto_approved';
  decision: string | null;
  comments: string | null;
  version: number;
  metadata_snapshot: any;
  requested_at: string;
  approved_at: string | null;
  approved_by: string | null;
  content_status: string;
  channel_name: string | null;
  channel_platforms: string[];
  quality_threshold: number;
  hook_text: string | null;
  quality_score: number | null;
  thumbnail_url: string | null;
  per_platform: Record<string, any>;
  qa: any;
  video_url: string | null;
  video_path: string | null;
  clip_thumbnail: string | null;
  duration: number | null;
  rights_status: string | null;
  monetization_status: string | null;
  policy_risk: string | null;
  policy_reasons: any;
};

export type Schedule = {
  schedule_id: string;
  content_id: string;
  platform: string;
  scheduled_at: string;
  timezone: string;
  status: 'pending' | 'scheduled' | 'published' | 'failed' | 'cancelled' | string;
  publication_attempts: number;
  last_error: string | null;
  published_at: string | null;
  channel_name: string | null;
  hook_text: string | null;
  thumbnail_url: string | null;
  per_platform: Record<string, any>;
};

export type Publication = {
  id: string;
  content_id: string;
  platform: string;
  status: string;
  published_at: string | null;
  error: string | null;
  platform_post_id: string | null;
  channel_name: string | null;
};

export type Workflow = {
  file: string;
  id: string;
  name: string;
  node_count: number;
  triggers: Array<{ name: string; type: string }>;
  webhook_paths: string[];
  status: 'active' | 'inactive';
};

export type AnalyticsSnapshot = {
  id: string;
  platform: string;
  captured_at: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  watch_time_seconds: number | null;
  avg_view_duration_seconds: number | null;
  retention: number | null;
  impressions: number | null;
  channel_name: string | null;
};

export type EarningsRecord = {
  id: string;
  platform: string;
  period_start: string | null;
  period_end: string | null;
  gross_amount: number | null;
  usd_amount: number | null;
  rpm: number | null;
  confirmation: 'estimated' | 'confirmed';
  payout_status: string | null;
  recorded_at: string;
  channel_name: string | null;
};

export type Setting = {
  key: string;
  value: any;
  description: string | null;
};

export type JobTypeConfig = {
  job_type: string;
  worker_type: string;
  heavy: boolean;
  enabled: boolean;
  max_attempts: number;
};

export type Channel = {
  id: string;
  name: string;
  platforms: string[];
  autonomy_mode: 'manual' | 'automatic';
  posts_per_day: number;
  quality_threshold: number;
  preferred_windows: Array<{ start: string }>;
  clip_min_seconds: number;
  clip_max_seconds: number;
  status: string;
  created_at: string;
  niche_name: string | null;
};

export type SystemError = {
  id: string;
  category: string;
  severity: string;
  message: string;
  workflow: string | null;
  created_at: string;
};

export type OverviewStats = {
  jobs: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    total: number;
  };
  approvals: {
    awaiting: number;
    approved: number;
    rejected: number;
  };
  active_channels: number;
};
