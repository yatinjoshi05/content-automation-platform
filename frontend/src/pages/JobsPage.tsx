import React, { useState, useMemo } from 'react';
import { useRouter } from '../utils/router';
import { useToast } from '../components/ui/Toast';
import { GlassCard } from '../components/ui/GlassCard';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import {
  GitFork,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle,
  X
} from '../components/Icons';
import { Job } from '../types';
import { api } from '../utils/api';

interface JobsPageProps {
  jobs: Job[];
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const JobsPage: React.FC<JobsPageProps> = ({
  jobs,
  onRefresh,
  isRefreshing
}) => {
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  const filteredJobs = useMemo(() => {
    return jobs.filter(j => {
      const matchText = `${j.job_id} ${j.job_type} ${j.error_message || ''}`.toLowerCase();
      if (searchQuery && !matchText.includes(searchQuery.toLowerCase())) return false;
      if (statusFilter !== 'all' && j.status !== statusFilter) return false;
      if (typeFilter !== 'all' && j.job_type !== typeFilter) return false;
      return true;
    });
  }, [jobs, searchQuery, statusFilter, typeFilter]);

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    try {
      await api.retryJob(jobId);
      toast.success('Job Re-queued', `Job ${jobId.slice(0, 8)} transitioned to queued.`);
      onRefresh();
    } catch (e: any) {
      toast.error('Retry Failed', e.message || 'Cannot retry job');
    } finally {
      setRetryingJobId(null);
    }
  };

  const jobTypes = Array.from(new Set(jobs.map(j => j.job_type))).filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Breadcrumbs items={[{ label: 'Studio', href: '/dashboard' }, { label: 'Background Jobs' }]} />

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Background Jobs & Orchestration</h1>
          <p className="page-subtitle">
            Durable task runner monitoring, lease management, crash recovery, and worker retry controls.
          </p>
        </div>

        <button onClick={onRefresh} disabled={isRefreshing} className="btn btn-secondary btn-sm">
          <RefreshCw size={14} className={isRefreshing ? 'icon-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <GlassCard style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', padding: '14px 18px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: 11 }} />
          <input
            type="text"
            className="input-base"
            style={{ paddingLeft: 32 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search job ID, type, or error..."
          />
        </div>

        <select
          className="input-base"
          style={{ width: 'auto', minWidth: 140 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="retrying">Retrying</option>
        </select>

        <select
          className="input-base"
          style={{ width: 'auto', minWidth: 140 }}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="all">All Job Types</option>
          {jobTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </GlassCard>

      {/* Jobs Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Type</th>
              <th>Status</th>
              <th>Attempt</th>
              <th>Error Details</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                  No matching background tasks found.
                </td>
              </tr>
            ) : (
              filteredJobs.map(j => (
                <tr key={j.job_id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                    {j.job_id.slice(0, 8)}...
                  </td>
                  <td style={{ fontWeight: 600 }}>{j.job_type}</td>
                  <td>
                    <StatusBadge status={j.status} />
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {j.attempt} / {j.max_attempts || 3}
                  </td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: j.error_message ? 'var(--status-danger)' : 'var(--text-muted)' }}>
                    {j.error_message || 'None'}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(j.created_at).toLocaleString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setSelectedJob(j)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '3px 8px' }}
                      >
                        Inspect
                      </button>
                      {j.status === 'failed' && (
                        <button
                          onClick={() => handleRetryJob(j.job_id)}
                          disabled={retryingJobId === j.job_id}
                          className="btn btn-danger btn-sm"
                          style={{ padding: '3px 8px' }}
                        >
                          {retryingJobId === j.job_id ? 'Retrying...' : 'Retry'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Job Inspection Modal */}
      {selectedJob && (
        <div className="modal-overlay" onClick={() => setSelectedJob(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Job Execution Details</h3>
              <button onClick={() => setSelectedJob(null)} className="btn-ghost" style={{ padding: 4, border: 'none', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Job ID:</span>
                <code style={{ color: 'var(--text-primary)' }}>{selectedJob.job_id}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Job Type:</span>
                <span style={{ fontWeight: 600 }}>{selectedJob.job_type}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                <StatusBadge status={selectedJob.status} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Attempt Count:</span>
                <span>{selectedJob.attempt} / {selectedJob.max_attempts || 3}</span>
              </div>
              {selectedJob.started_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Started At:</span>
                  <span>{new Date(selectedJob.started_at).toLocaleString()}</span>
                </div>
              )}
              {selectedJob.finished_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Finished At:</span>
                  <span>{new Date(selectedJob.finished_at).toLocaleString()}</span>
                </div>
              )}
              {selectedJob.error_code && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Error Code:</span>
                  <span style={{ color: 'var(--status-danger)', fontWeight: 600 }}>{selectedJob.error_code}</span>
                </div>
              )}
              {selectedJob.error_message && (
                <div>
                  <span style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4 }}>Error Message:</span>
                  <div style={{ padding: 10, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', color: 'var(--status-danger)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {selectedJob.error_message}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              {selectedJob.status === 'failed' && (
                <button
                  onClick={() => {
                    handleRetryJob(selectedJob.job_id);
                    setSelectedJob(null);
                  }}
                  className="btn btn-primary"
                >
                  Retry Execution
                </button>
              )}
              <button onClick={() => setSelectedJob(null)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
