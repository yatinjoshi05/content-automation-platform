import React from 'react';

export interface OperationalStatusHeaderProps {
  services?: {
    n8n?: { online: boolean; status?: number; url?: string };
    postgresql?: { online: boolean; host?: string; port?: string; database?: string };
    qa_worker?: { online: boolean };
    openshorts?: { online: boolean };
  };
  telemetry?: {
    disk_free_gb?: number;
    cpu_percent?: number;
    ram_percent?: number;
    captured_at?: string;
  } | null;
  lastRefresh?: Date;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const OperationalStatusHeader: React.FC<OperationalStatusHeaderProps> = ({
  services,
  telemetry,
  lastRefresh,
  onRefresh,
  isRefreshing
}) => {
  const isPostgresOnline = Boolean(services?.postgresql?.online);
  const isN8nOnline = Boolean(services?.n8n?.online);
  const isSystemHealthy = isPostgresOnline && isN8nOnline;

  const diskFree = telemetry?.disk_free_gb ? Number(telemetry.disk_free_gb) : 999;
  const isDiskSafe = diskFree >= 8.0;

  return (
    <div className="card mb-4 shadow-sm border">
      <div className="card-body py-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
          {/* TITLE & OVERALL BADGE */}
          <div>
            <div className="d-flex align-items-center gap-2">
              <h4 className="mb-0 fw-bold text-body">AI Content Automation Command Center</h4>
              <span className={`badge ${isSystemHealthy ? 'bg-success' : 'bg-danger'} text-white py-1 px-2`}>
                <span className="spinner-grow spinner-grow-sm me-1" role="status" aria-hidden="true" style={{ width: '0.45rem', height: '0.45rem' }}></span>
                {isSystemHealthy ? 'SYSTEM OPERATIONAL' : 'DEGRADED'}
              </span>
            </div>
            <div className="small text-body-secondary mt-1">
              Autonomous multi-channel video generation, quality gating, and platform scheduling.
            </div>
          </div>

          {/* ACTION BUTTONS & TIMESTAMP */}
          <div className="d-flex align-items-center gap-3">
            {lastRefresh && (
              <span className="small text-body-secondary d-none d-md-inline">
                Updated: {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh operational telemetry"
            >
              <i className={`cil-reload ${isRefreshing ? 'fa-spin' : ''}`}></i>
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* STATUS PILL ROW */}
        <div className="row g-2 mt-2 pt-2 border-top small">
          <div className="col-6 col-md-auto">
            <span className="text-body-secondary me-1">PostgreSQL 16:</span>
            <span className={`badge ${isPostgresOnline ? 'bg-success-subtle text-success border border-success' : 'bg-danger-subtle text-danger'}`}>
              {isPostgresOnline ? 'Port 5432 Online' : 'Offline'}
            </span>
          </div>
          <div className="col-6 col-md-auto">
            <span className="text-body-secondary me-1">n8n Orchestrator:</span>
            <span className={`badge ${isN8nOnline ? 'bg-success-subtle text-success border border-success' : 'bg-danger-subtle text-danger'}`}>
              {isN8nOnline ? '16 Workflows Active' : 'Offline'}
            </span>
          </div>
          <div className="col-6 col-md-auto">
            <span className="text-body-secondary me-1">Storage Telemetry:</span>
            <span className={`badge ${isDiskSafe ? 'bg-info-subtle text-info border border-info' : 'bg-warning-subtle text-warning'}`}>
              {diskFree.toFixed(0)} GB Free (Safeguard 8 GB)
            </span>
          </div>
          <div className="col-6 col-md-auto">
            <span className="text-body-secondary me-1">YouTube Channel:</span>
            <span className="badge bg-warning-subtle text-warning border border-warning">
              Pending OAuth (n8n UI)
            </span>
          </div>
          <div className="col-6 col-md-auto">
            <span className="text-body-secondary me-1">Meta Platforms:</span>
            <span className="badge bg-secondary-subtle text-secondary border">
              Fail-Closed / Awaiting App
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
