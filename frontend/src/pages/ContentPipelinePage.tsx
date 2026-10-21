import React, { useState } from 'react';
import { Job, ContentItem } from '../types';
import { RefreshCw, AlertCircle, CheckCircle, Clock, X } from '../components/Icons';

type ContentPipelinePageProps = {
  jobs: Job[];
  content: ContentItem[];
  onRetryJob: (jobId: string) => Promise<void>;
  isLoading: boolean;
};

export const ContentPipelinePage: React.FC<ContentPipelinePageProps> = ({
  jobs,
  content,
  onRetryJob,
  isLoading
}) => {
  const [selectedTab, setSelectedTab] = useState<'jobs' | 'content'>('jobs');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const filteredJobs = jobs.filter(j => {
    if (statusFilter === 'all') return true;
    return j.status === statusFilter;
  });

  const handleRetry = async (job: Job) => {
    if (!window.confirm(`Are you sure you want to retry job ${job.job_type} (${job.job_id.slice(0, 8)})?`)) {
      return;
    }
    setRetryingId(job.job_id);
    setRetryError(null);
    try {
      await onRetryJob(job.job_id);
      if (selectedJob?.job_id === job.job_id) {
        setSelectedJob(null);
      }
    } catch (err: any) {
      setRetryError(err.message || 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="pipeline-page">
      {/* Sub-navigation tabs & filter controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn ${selectedTab === 'jobs' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedTab('jobs')}
          >
            Pipeline Jobs ({jobs.length})
          </button>
          <button
            className={`btn ${selectedTab === 'content' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedTab('content')}
          >
            Content Items ({content.length})
          </button>
        </div>

        {selectedTab === 'jobs' && (
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>Status:</span>
            {['all', 'queued', 'running', 'completed', 'failed'].map((st) => (
              <button
                key={st}
                className={`btn btn-sm ${statusFilter === st ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStatusFilter(st)}
              >
                {st.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {retryError && (
        <div className="alert-banner alert-danger" style={{ marginBottom: '1rem' }}>
          <AlertCircle size={18} />
          <span>{retryError}</span>
        </div>
      )}

      {/* View 1: Jobs Table */}
      {selectedTab === 'jobs' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Execution Pipeline Jobs</h2>
              <div className="card-subtitle">
                Stage progression: trend_research → source_discovery → rights → policy → clipping → packaging → approval → scheduler → publishing
              </div>
            </div>
            <span className="badge badge-neutral">{filteredJobs.length} items shown</span>
          </div>

          {isLoading ? (
            <div className="loading-spinner" />
          ) : filteredJobs.length === 0 ? (
            <div className="empty-state">
              <Clock className="empty-icon" />
              <div className="empty-title">No Jobs Matching Filter</div>
              <div className="empty-desc">
                {statusFilter === 'all'
                  ? 'No automated pipeline jobs have executed yet. Jobs are automatically triggered via n8n cron schedules.'
                  : `No jobs currently in '${statusFilter}' status.`}
              </div>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Stage / Type</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Created</th>
                    <th>Finished / Next</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((j) => (
                    <tr key={j.job_id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {j.job_id.slice(0, 8)}...
                      </td>
                      <td style={{ fontWeight: 600 }}>{j.job_type}</td>
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
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {new Date(j.created_at).toLocaleString()}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {j.finished_at ? new Date(j.finished_at).toLocaleTimeString() : (j.next_retry_at ? `Retry: ${new Date(j.next_retry_at).toLocaleTimeString()}` : '-')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => setSelectedJob(j)}
                          >
                            Details
                          </button>
                          {j.status === 'failed' && j.attempt < j.max_attempts && (
                            <button
                              className="btn btn-sm btn-warning"
                              onClick={() => handleRetry(j)}
                              disabled={retryingId === j.job_id}
                            >
                              {retryingId === j.job_id ? 'Re-queueing...' : 'Retry'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* View 2: Content Items Table */}
      {selectedTab === 'content' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Content Artifacts</h2>
              <div className="card-subtitle">Discovered and packaged short-form content entities</div>
            </div>
            <span className="badge badge-neutral">{content.length} items</span>
          </div>

          {isLoading ? (
            <div className="loading-spinner" />
          ) : content.length === 0 ? (
            <div className="empty-state">
              <CheckCircle className="empty-icon" />
              <div className="empty-title">No Content Artifacts Created Yet</div>
              <div className="empty-desc">
                Discovered source videos and packaged clips will appear here once ingested by CA 03 Source Discovery.
              </div>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Content ID</th>
                    <th>Channel</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>Hook / Title</th>
                    <th>Score</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {content.map((c) => (
                    <tr key={c.content_id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {c.content_id.slice(0, 8)}...
                      </td>
                      <td>{c.channel_name || 'Default Channel'}</td>
                      <td>
                        <span className="badge badge-info">{c.status}</span>
                      </td>
                      <td>v{c.current_version} {c.approved_version ? `(appr: v${c.approved_version})` : ''}</td>
                      <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.hook_text || c.source_title || 'Untitled'}
                      </td>
                      <td>
                        {c.quality_score !== null ? (
                          <span style={{ fontWeight: 600, color: Number(c.quality_score) >= 7.5 ? 'var(--status-success)' : 'var(--status-warning)' }}>
                            {Number(c.quality_score).toFixed(1)} / 10
                          </span>
                        ) : 'Pending QA'}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Job Details Modal */}
      {selectedJob && (
        <div className="modal-overlay" onClick={() => setSelectedJob(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Job Details: {selectedJob.job_type}</h3>
              <button
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setSelectedJob(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
              <div>
                <strong>Job UUID:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedJob.job_id}</span>
              </div>
              <div>
                <strong>Correlation ID:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedJob.correlation_id}</span>
              </div>
              <div>
                <strong>Current Status:</strong> <span className="badge badge-info">{selectedJob.status}</span>
              </div>
              <div>
                <strong>Attempts:</strong> {selectedJob.attempt} / {selectedJob.max_attempts}
              </div>
              {selectedJob.error_code && (
                <div>
                  <strong>Error Code:</strong> <span className="badge badge-danger">{selectedJob.error_code}</span>
                </div>
              )}
              {selectedJob.error_message && (
                <div style={{ background: 'var(--status-danger-bg)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(244, 63, 94, 0.3)' }}>
                  <strong>Error Message:</strong>
                  <div style={{ marginTop: '0.3rem', color: '#fecdd3', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {selectedJob.error_message}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions">
              {selectedJob.status === 'failed' && selectedJob.attempt < selectedJob.max_attempts && (
                <button
                  className="btn btn-warning"
                  onClick={() => handleRetry(selectedJob)}
                  disabled={retryingId === selectedJob.job_id}
                >
                  {retryingId === selectedJob.job_id ? 'Retrying...' : 'Re-queue Job'}
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setSelectedJob(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
