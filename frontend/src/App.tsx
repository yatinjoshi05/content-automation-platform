import React, { useState, useEffect, useCallback } from 'react';
import { RouterProvider, useRouter } from './utils/router';
import { ThemeProvider } from './utils/theme';
import { ToastProvider, useToast } from './components/ui/Toast';
import { AppShell } from './components/AppShell';

// Pages
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { CreateContentPage } from './pages/CreateContentPage';
import { ContentLibraryPage } from './pages/ContentLibraryPage';
import { ContentDetailPage } from './pages/ContentDetailPage';
import { PublishingPage } from './pages/PublishingPage';
import { JobsPage } from './pages/JobsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ModelsPage } from './pages/ModelsPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { LogsPage } from './pages/LogsPage';
import { SettingsPage } from './pages/SettingsPage';

import { api } from './utils/api';
import {
  SystemStatusResponse,
  OverviewStats,
  Job,
  ContentItem,
  Approval,
  Schedule,
  Publication,
  Workflow,
  AnalyticsSnapshot,
  EarningsRecord,
  Setting,
  JobTypeConfig,
  Channel,
  SystemError
} from './types';

const AppContent: React.FC = () => {
  const { routeId } = useRouter();
  const toast = useToast();

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);

  // Domain states
  const [overviewStats, setOverviewStats] = useState<OverviewStats>({
    jobs: { queued: 0, running: 0, completed: 0, failed: 0, total: 0 },
    approvals: { awaiting: 0, approved: 0, rejected: 0 },
    active_channels: 0
  });
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [recentErrors, setRecentErrors] = useState<SystemError[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [snapshots, setSnapshots] = useState<AnalyticsSnapshot[]>([]);
  const [earnings, setEarnings] = useState<EarningsRecord[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  // Fetch all live data from BFF
  const loadAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [statusRes, overviewRes] = await Promise.all([
        api.getStatus().catch(() => null),
        api.getOverview().catch(() => null)
      ]);

      if (statusRes?.ok) setSystemStatus(statusRes);
      if (overviewRes?.ok) {
        setOverviewStats(overviewRes.stats);
        setRecentJobs(overviewRes.recent_jobs || []);
        setRecentErrors(overviewRes.recent_errors || []);
      }

      const [jobsRes, contentRes, approvalsRes, schedulesRes, workflowsRes, analyticsRes, settingsRes, channelsRes] =
        await Promise.all([
          api.getJobs().catch(() => ({ jobs: [] })),
          api.getContent().catch(() => ({ content: [] })),
          api.getApprovals().catch(() => ({ approvals: [] })),
          api.getSchedules().catch(() => ({ schedules: [], publications: [] })),
          api.getWorkflows().catch(() => ({ workflows: [] })),
          api.getAnalytics().catch(() => ({ snapshots: [], earnings: [] })),
          api.getSettings().catch(() => ({ settings: [], job_type_config: [] })),
          api.getChannels().catch(() => ({ channels: [] }))
        ]);

      setJobs(jobsRes.jobs || []);
      setContent(contentRes.content || []);
      setApprovals(approvalsRes.approvals || []);
      setSchedules(schedulesRes.schedules || []);
      setPublications(schedulesRes.publications || []);
      setWorkflows(workflowsRes.workflows || []);
      setSnapshots(analyticsRes.snapshots || []);
      setEarnings(analyticsRes.earnings || []);
      setSettings(settingsRes.settings || []);
      setChannels(channelsRes.channels || []);
    } catch (e) {
      console.error('Failed to load studio data:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleRetryJob = async (jobId: string) => {
    try {
      await api.retryJob(jobId);
      toast.success('Job Re-queued', `Job ${jobId.slice(0, 8)} re-queued.`);
      loadAllData();
    } catch (e: any) {
      toast.error('Retry Failed', e.message || 'Error retrying job');
    }
  };

  const isSystemOnline = Boolean(
    systemStatus?.services?.postgresql?.online &&
    systemStatus?.services?.n8n?.online
  );

  const diskFreeGb = systemStatus?.telemetry?.disk_free_gb
    ? Number(systemStatus.telemetry.disk_free_gb)
    : undefined;

  return (
    <AppShell
      onRefresh={loadAllData}
      isRefreshing={isRefreshing}
      systemStatusOnline={isSystemOnline}
      diskFreeGb={diskFreeGb}
    >
      {routeId === 'home' && <HomePage />}

      {routeId === 'dashboard' && (
        <DashboardPage
          stats={overviewStats}
          content={content}
          recentJobs={recentJobs}
          recentErrors={recentErrors}
          telemetry={systemStatus?.telemetry || null}
          services={systemStatus?.services}
          onRefresh={loadAllData}
          isRefreshing={isRefreshing}
          onRetryJob={handleRetryJob}
        />
      )}

      {routeId === 'create' && <CreateContentPage />}

      {routeId === 'library' && (
        <ContentLibraryPage
          content={content}
          onRefresh={loadAllData}
          isRefreshing={isRefreshing}
        />
      )}

      {routeId === 'content-detail' && (
        <ContentDetailPage
          contentList={content}
          onRefresh={loadAllData}
        />
      )}

      {routeId === 'publishing' && (
        <PublishingPage
          approvals={approvals}
          schedules={schedules}
          publications={publications}
          onRefresh={loadAllData}
          isRefreshing={isRefreshing}
        />
      )}

      {routeId === 'jobs' && (
        <JobsPage
          jobs={jobs}
          onRefresh={loadAllData}
          isRefreshing={isRefreshing}
        />
      )}

      {routeId === 'analytics' && (
        <AnalyticsPage
          snapshots={snapshots}
          earnings={earnings}
          onRefresh={loadAllData}
          isRefreshing={isRefreshing}
        />
      )}

      {routeId === 'models' && <ModelsPage />}

      {routeId === 'integrations' && <IntegrationsPage />}

      {routeId === 'logs' && (
        <LogsPage
          recentErrors={recentErrors}
          onRefresh={loadAllData}
          isRefreshing={isRefreshing}
        />
      )}

      {routeId === 'settings' && (
        <SettingsPage
          settings={settings}
          channels={channels}
          onRefresh={loadAllData}
        />
      )}
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <RouterProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </RouterProvider>
    </ThemeProvider>
  );
};

export default App;
