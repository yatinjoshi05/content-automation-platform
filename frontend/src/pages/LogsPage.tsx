import React, { useState, useMemo } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Search, Filter, RefreshCw, AlertTriangle, FileText, Info } from '../components/Icons';
import { SystemError } from '../types';

interface LogsPageProps {
  recentErrors: SystemError[];
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const LogsPage: React.FC<LogsPageProps> = ({
  recentErrors,
  onRefresh,
  isRefreshing
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const filteredLogs = useMemo(() => {
    return recentErrors.filter(l => {
      const match = `${l.category} ${l.severity} ${l.message} ${l.workflow || ''}`.toLowerCase();
      if (searchQuery && !match.includes(searchQuery.toLowerCase())) return false;
      if (severityFilter !== 'all' && l.severity.toLowerCase() !== severityFilter) return false;
      return true;
    });
  }, [recentErrors, searchQuery, severityFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Breadcrumbs items={[{ label: 'Studio', href: '/dashboard' }, { label: 'System Logs' }]} />

      <div className="page-header-row">
        <div>
          <h1 className="page-title">System Logs & Audit Events</h1>
          <p className="page-subtitle">
            Diagnostic event trail, workflow exception logs, and supervisor error captures.
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
            placeholder="Search log messages, workflows, or categories..."
          />
        </div>

        <select
          className="input-base"
          style={{ width: 'auto', minWidth: 140 }}
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
        >
          <option value="all">All Severities</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </GlassCard>

      {/* Logs Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Severity</th>
              <th>Category</th>
              <th>Workflow</th>
              <th>Log Message</th>
            </tr>
          </thead>
          <tbody>
            {paginatedLogs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                  No system error records found. System operates nominally with zero unhandled exceptions.
                </td>
              </tr>
            ) : (
              paginatedLogs.map((l, idx) => (
                <tr key={l.id || idx}>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background:
                          l.severity === 'error'
                            ? 'var(--status-danger-bg)'
                            : l.severity === 'warning'
                            ? 'var(--status-warning-bg)'
                            : 'var(--status-info-bg)',
                        color:
                          l.severity === 'error'
                            ? 'var(--status-danger)'
                            : l.severity === 'warning'
                            ? 'var(--status-warning)'
                            : 'var(--status-info)'
                      }}
                    >
                      {l.severity}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500, fontSize: '0.8125rem' }}>{l.category}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                    {l.workflow || 'orchestrator'}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-primary)' }}>
                    {l.message}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="btn btn-secondary btn-sm"
          >
            Previous
          </button>
          <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="btn btn-secondary btn-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
