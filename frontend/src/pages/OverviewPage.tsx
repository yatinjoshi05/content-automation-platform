import React from 'react';
import { Job, SystemError, SystemTelemetry, ServiceStatus } from '../types';
import { AlertCircle, Clock, Shield, CheckCircle } from '../components/Icons';

type OverviewPageProps = {
  stats: {
    jobs: { queued: number; running: number; completed: number; failed: number; total: number };
    approvals: { awaiting: number; approved: number; rejected: number };
    active_channels: number;
  };
  services?: {
    n8n: ServiceStatus;
    postgresql: ServiceStatus;
    qa_worker: ServiceStatus;
    openshorts: ServiceStatus;
  };
  recentJobs: Job[];
  recentErrors: SystemError[];
  telemetry: SystemTelemetry | null;
  onNavigateToApprovals: () => void;
};

export const OverviewPage: React.FC<OverviewPageProps> = ({
  stats,
  services,
  recentJobs,
  recentErrors,
  telemetry,
  onNavigateToApprovals
}) => {
  const diskFree = telemetry?.disk_free_gb ? Number(telemetry.disk_free_gb) : null;
  const isDiskSafe = diskFree !== null ? diskFree >= 8.0 : true;

  return (
    <div className="overview-page">
      {/* Safeguard & Alert Banner */}
      {!isDiskSafe && (
        <div className="alert-banner alert-warning">
          <AlertCircle size={20} />
          <div>
            <strong>Disk Telemetry Safeguard Triggered:</strong> Available space ({diskFree?.toFixed(1)} GB) is below the 8.0 GB safety threshold. Heavy processing jobs are automatically blocked.
          </div>
        </div>
      )}

      {/* Primary Metrics Grid */}
      <div className="grid-4" style={{ marginBottom: '1.75rem' }}>
        <div className="stat-card">
          <span className="stat-label">Queued Jobs</span>
          <span className="stat-value" style={{ color: 'var(--status-info)' }}>
            {stats.jobs.queued}
          </span>
          <span className="stat-sub">Waiting for worker dispatch</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Running Jobs</span>
          <span className="stat-value" style={{ color: 'var(--status-warning)' }}>
            {stats.jobs.running}
          </span>
          <span className="stat-sub">Max concurrency: 1 (conservative)</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Awaiting Approval</span>
          <span className="stat-value" style={{ color: stats.approvals.awaiting > 0 ? 'var(--status-warning)' : 'var(--text-primary)' }}>
            {stats.approvals.awaiting}
          </span>
          <span className="stat-sub">
            {stats.approvals.awaiting > 0 ? (
              <button
                className="btn btn-sm btn-secondary"
                style={{ marginTop: '0.2rem', padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
                onClick={onNavigateToApprovals}
              >
                Review Items →
              </button>
            ) : (
              'Queue clear'
            )}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Failed Jobs</span>
          <span className="stat-value" style={{ color: stats.jobs.failed > 0 ? 'var(--status-danger)' : 'var(--status-success)' }}>
            {stats.jobs.failed}
          </span>
          <span className="stat-sub">
            {stats.jobs.failed > 0 ? 'Action required in Pipeline' : 'Zero unhandled failures'}
          </span>
        </div>
      </div>

      {/* Services & Resource Telemetry Grid */}
      <div className="grid-2" style={{ marginBottom: '1.75rem' }}>
        {/* Core Services Status Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Shield size={18} color="var(--accent-primary)" />
              Core Infrastructure Status
            </h2>
            <span className="badge badge-success">Local Host Verified</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>PostgreSQL 16.8 (Drive D:)</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>localhost:5432 • content_automation</div>
              </div>
              <span className={`badge ${services?.postgresql?.online ? 'badge-success' : 'badge-danger'}`}>
                {services?.postgresql?.online ? 'Online' : 'Offline'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>n8n Core v2.43.6 (Node 24)</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>localhost:5678 • 15 Workflows Active</div>
              </div>
              <span className={`badge ${services?.n8n?.online ? 'badge-success' : 'badge-danger'}`}>
                {services?.n8n?.online ? 'Online (HTTP 200)' : 'Offline'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>QA Worker Service</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>localhost:9100 • Technical QA & Thumbnails</div>
              </div>
              <span className={`badge ${services?.qa_worker?.online ? 'badge-success' : 'badge-neutral'}`}>
                {services?.qa_worker?.online ? 'Online' : 'Standby / Optional'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>OpenShorts Engine</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>localhost:8000 • Autonomous Video Clipper</div>
              </div>
              <span className={`badge ${services?.openshorts?.online ? 'badge-success' : 'badge-neutral'}`}>
                {services?.openshorts?.online ? 'Online' : 'Standby / Optional'}
              </span>
            </div>
          </div>
        </div>

        {/* Real Resource Telemetry Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Clock size={18} color="var(--status-info)" />
              Resource Telemetry & Safeguards
            </h2>
            <span className="badge badge-info">Fail-Closed Guard</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Drive C: / System Disk Free</span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                  {diskFree !== null ? `${diskFree.toFixed(1)} GB free` : 'N/A'}
                </span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: diskFree !== null ? `${Math.min(100, (diskFree / 20) * 100)}%` : '0%',
                    background: isDiskSafe ? 'var(--status-success)' : 'var(--status-danger)',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Threshold: min 8.0 GB required for heavy video transcoding
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>CPU Usage</span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                  {telemetry?.cpu_percent !== null && telemetry?.cpu_percent !== undefined ? `${telemetry.cpu_percent}%` : 'N/A'}
                </span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${telemetry?.cpu_percent || 0}%`,
                    background: (telemetry?.cpu_percent || 0) > 85 ? 'var(--status-danger)' : 'var(--accent-primary)',
                    borderRadius: '4px'
                  }}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>RAM Usage</span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                  {telemetry?.ram_percent !== null && telemetry?.ram_percent !== undefined ? `${telemetry.ram_percent}%` : 'N/A'}
                </span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${telemetry?.ram_percent || 0}%`,
                    background: (telemetry?.ram_percent || 0) > 90 ? 'var(--status-danger)' : 'var(--status-info)',
                    borderRadius: '4px'
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
              Last sampled: {telemetry?.captured_at ? new Date(telemetry.captured_at).toLocaleTimeString() : 'N/A'} • Source: {telemetry?.source || 'system'}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity & Recent Errors */}
      <div className="grid-2">
        {/* Recent Jobs Table */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Recent Pipeline Jobs</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Latest 10 executions</span>
          </div>

          {recentJobs.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <div className="empty-title">No Pipeline Executions Yet</div>
              <div className="empty-desc">
                Jobs will appear here as scheduled content discovery and clipping workflows run.
              </div>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Attempt</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((j) => (
                    <tr key={j.job_id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{j.job_type}</td>
                      <td>
                        <span className={`badge ${
                          j.status === 'completed' ? 'badge-success' :
                          j.status === 'running' ? 'badge-warning' :
                          j.status === 'failed' ? 'badge-danger' : 'badge-info'
                        }`}>
                          {j.status}
                        </span>
                      </td>
                      <td>{j.attempt} / {j.max_attempts}</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {new Date(j.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent System Errors */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">System Error Log</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Latest captures</span>
          </div>

          {recentErrors.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <CheckCircle size={32} color="var(--status-success)" style={{ margin: '0 auto 0.5rem' }} />
              <div className="empty-title" style={{ color: 'var(--status-success)' }}>Zero Active Errors</div>
              <div className="empty-desc">
                No unhandled runtime errors have been recorded in the database.
              </div>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Workflow</th>
                    <th>Message</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentErrors.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <span className="badge badge-danger">{e.category}</span>
                      </td>
                      <td style={{ fontSize: '0.75rem' }}>{e.workflow || 'system'}</td>
                      <td style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.message}>
                        {e.message}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {new Date(e.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
