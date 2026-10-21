import React from 'react';
import { Job, SystemError } from '../../types';
import { useRouter } from '../../utils/router';

export interface RecentJobsFeedProps {
  recentJobs: Job[];
  recentErrors: SystemError[];
  onRetryJob?: (jobId: string) => void;
}

export const RecentJobsFeed: React.FC<RecentJobsFeedProps> = ({
  recentJobs,
  recentErrors,
  onRetryJob
}) => {
  const { navigate } = useRouter();

  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="badge bg-success-subtle text-success border border-success">Completed</span>;
      case 'running':
        return (
          <span className="badge bg-info text-white">
            <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" style={{ width: '0.45rem', height: '0.45rem' }}></span>
            Running
          </span>
        );
      case 'queued':
        return <span className="badge bg-secondary-subtle text-secondary border">Queued</span>;
      case 'failed':
        return <span className="badge bg-danger-subtle text-danger border border-danger">Failed</span>;
      default:
        return <span className="badge bg-secondary">{status}</span>;
    }
  };

  return (
    <div className="row g-4 mb-4">
      {/* LEFT: RECENT BACKGROUND WORKFLOW JOBS */}
      <div className="col-12 col-lg-7">
        <div className="card shadow-sm border h-100">
          <div className="card-header bg-body-tertiary d-flex justify-content-between align-items-center py-2">
            <span className="fw-semibold text-body">
              <i className="cil-task me-2 text-primary"></i>
              Active Background Jobs &amp; Workers
            </span>
            <button
              type="button"
              className="btn btn-sm btn-link text-decoration-none p-0 small"
              onClick={() => navigate('/jobs')}
            >
              View All Jobs <i className="cil-arrow-right small ms-1"></i>
            </button>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 border-0 small">
              <thead className="table-light text-nowrap">
                <tr>
                  <th className="bg-body-tertiary">Job Type</th>
                  <th className="bg-body-tertiary">Status</th>
                  <th className="bg-body-tertiary text-center">Attempt</th>
                  <th className="bg-body-tertiary text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-3 text-body-secondary">
                      No active jobs in flight.
                    </td>
                  </tr>
                ) : (
                  recentJobs.slice(0, 5).map(job => (
                    <tr key={job.job_id}>
                      <td>
                        <div className="fw-semibold text-body">{job.job_type}</div>
                        <div className="text-body-secondary font-monospace" style={{ fontSize: '0.72rem' }}>
                          ID: {job.job_id.slice(0, 8)}...
                        </div>
                      </td>
                      <td>{getJobStatusBadge(job.status)}</td>
                      <td className="text-center font-monospace">
                        {job.attempt} / {job.max_attempts || 3}
                      </td>
                      <td className="text-end">
                        {job.status === 'failed' && onRetryJob ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger py-0 px-2"
                            onClick={() => onRetryJob(job.job_id)}
                          >
                            Retry
                          </button>
                        ) : (
                          <span className="badge bg-light text-secondary border">Nominal</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RIGHT: RECENT SYSTEM ERRORS & AUDIT FEED */}
      <div className="col-12 col-lg-5">
        <div className="card shadow-sm border h-100">
          <div className="card-header bg-body-tertiary d-flex justify-content-between align-items-center py-2">
            <span className="fw-semibold text-body">
              <i className="cil-warning me-2 text-warning"></i>
              Actionable Errors &amp; Alerts
            </span>
            <button
              type="button"
              className="btn btn-sm btn-link text-decoration-none p-0 small"
              onClick={() => navigate('/logs')}
            >
              System Logs <i className="cil-arrow-right small ms-1"></i>
            </button>
          </div>
          <div className="card-body p-3">
            {recentErrors.length === 0 ? (
              <div className="text-center py-4 text-body-secondary small">
                <i className="cil-check-circle fs-3 text-success d-block mb-2"></i>
                Zero unhandled system exceptions in current execution cycle.
              </div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {recentErrors.slice(0, 4).map((err, idx) => (
                  <div key={idx} className="p-2 rounded bg-danger-subtle border border-danger-subtle text-danger small">
                    <div className="fw-bold d-flex justify-content-between">
                      <span>{err.category || 'Operational Alert'}</span>
                      <span className="badge bg-danger text-white">{err.severity || 'Unresolved'}</span>
                    </div>
                    <div className="text-body-secondary mt-1" style={{ fontSize: '0.75rem' }}>
                      {err.message || 'Error occurred during workflow execution'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
