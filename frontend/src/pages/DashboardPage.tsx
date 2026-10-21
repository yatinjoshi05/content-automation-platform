import React from 'react';
import { OperationalStatusHeader } from '../components/dashboard/OperationalStatusHeader';
import { OperationalKPIWidgets } from '../components/dashboard/OperationalKPIWidgets';
import { ContentLifecyclePipeline } from '../components/dashboard/ContentLifecyclePipeline';
import { UpcomingPublicationsTable } from '../components/dashboard/UpcomingPublicationsTable';
import { ProviderFallbackMonitor } from '../components/dashboard/ProviderFallbackMonitor';
import { RecentJobsFeed } from '../components/dashboard/RecentJobsFeed';
import { Job, ContentItem, SystemError, SystemTelemetry, ServiceStatus } from '../types';

export interface DashboardPageProps {
  stats: {
    jobs: { queued: number; running: number; completed: number; failed: number; total: number };
    approvals: { awaiting: number; approved: number; rejected: number };
    active_channels: number;
  };
  content: ContentItem[];
  recentJobs: Job[];
  recentErrors: SystemError[];
  telemetry: SystemTelemetry | null;
  services?: {
    n8n?: ServiceStatus;
    postgresql?: ServiceStatus;
    qa_worker?: ServiceStatus;
    openshorts?: ServiceStatus;
  };
  onRefresh: () => void;
  isRefreshing: boolean;
  onRetryJob?: (jobId: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  stats,
  content,
  recentJobs,
  recentErrors,
  telemetry,
  services,
  onRefresh,
  isRefreshing,
  onRetryJob
}) => {
  return (
    <>
      {/* 1. OPERATIONAL STATUS HEADER WITH SYSTEM HEALTH PILLS */}
      <OperationalStatusHeader
        services={services}
        telemetry={telemetry}
        lastRefresh={new Date()}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
      />

      {/* 2. OPERATIONAL KPI WIDGETS (COREUI WIDGETSTATSA CARDS WITH SPARKLINES) */}
      <OperationalKPIWidgets stats={stats} className="mb-4" />

      {/* 3. END-TO-END CONTENT LIFECYCLE PIPELINE */}
      <ContentLifecyclePipeline stats={stats} contentCount={content.length} />

      {/* 4. UPCOMING PUBLICATIONS PIPELINE & QUEUE */}
      <UpcomingPublicationsTable content={content} />

      {/* 5. AI PROVIDER CONTROL & FREE-TIER FAILOVER MONITOR */}
      <ProviderFallbackMonitor />

      {/* 6. RECENT BACKGROUND WORKFLOW JOBS & ACTIONABLE ERRORS */}
      <RecentJobsFeed
        recentJobs={recentJobs}
        recentErrors={recentErrors}
        onRetryJob={onRetryJob}
      />
    </>
  );
};

export default DashboardPage;
