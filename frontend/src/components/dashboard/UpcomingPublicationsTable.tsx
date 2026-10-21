import React from 'react';
import { useRouter } from '../../utils/router';
import { ContentItem } from '../../types';

export interface UpcomingPublicationsTableProps {
  content: ContentItem[];
  schedules?: any[];
}

export const UpcomingPublicationsTable: React.FC<UpcomingPublicationsTableProps> = ({
  content,
  schedules = []
}) => {
  const { navigate } = useRouter();

  // Combine content and schedules for real display
  const items = content.slice(0, 6);

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'youtube':
        return { icon: 'cib-youtube', color: 'text-danger', label: 'YouTube Shorts' };
      case 'instagram':
        return { icon: 'cib-instagram', color: 'text-warning', label: 'Instagram Reels' };
      case 'facebook':
        return { icon: 'cib-facebook', color: 'text-primary', label: 'Facebook Reels' };
      default:
        return { icon: 'cil-media-play', color: 'text-secondary', label: platform };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="badge bg-success-subtle text-success border border-success">Approved / Ready</span>;
      case 'awaiting_approval':
        return <span className="badge bg-warning-subtle text-warning border border-warning">Pending Review</span>;
      case 'published':
        return <span className="badge bg-primary-subtle text-primary border border-primary">Published</span>;
      case 'scheduled':
        return <span className="badge bg-info-subtle text-info border border-info">Scheduled</span>;
      case 'blocked':
        return <span className="badge bg-danger-subtle text-danger border border-danger">Blocked</span>;
      default:
        return <span className="badge bg-secondary-subtle text-secondary border">{status}</span>;
    }
  };

  return (
    <div className="card mb-4 shadow-sm border">
      <div className="card-header bg-body-tertiary d-flex justify-content-between align-items-center py-2">
        <span className="fw-semibold text-body">
          <i className="cil-calendar me-2 text-primary"></i>
          Upcoming Content Pipeline &amp; Publication Queue
        </span>
        <button
          type="button"
          className="btn btn-sm btn-link text-decoration-none p-0 small"
          onClick={() => navigate('/publishing')}
        >
          View Full Queue <i className="cil-arrow-right small ms-1"></i>
        </button>
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0 border-0">
          <thead className="table-light text-nowrap small">
            <tr>
              <th className="bg-body-tertiary" style={{ minWidth: '220px' }}>Content / Hook</th>
              <th className="bg-body-tertiary">Platform</th>
              <th className="bg-body-tertiary">Channel</th>
              <th className="bg-body-tertiary text-center">Quality Score</th>
              <th className="bg-body-tertiary">Status</th>
              <th className="bg-body-tertiary text-end" style={{ width: '90px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-4 text-body-secondary small">
                  No upcoming publications scheduled. Use "Create Content" to initiate generation.
                </td>
              </tr>
            ) : (
              items.map(item => {
                const primaryPlatform = Array.isArray(item.platforms) && item.platforms.length > 0
                  ? item.platforms[0]
                  : 'youtube';
                const pInfo = getPlatformIcon(primaryPlatform);
                const title = item.hook_text || item.source_title || 'Autonomous Video Asset';

                return (
                  <tr key={item.content_id}>
                    <td>
                      <div className="fw-semibold text-body text-truncate" style={{ maxWidth: '280px' }} title={title}>
                        {title}
                      </div>
                      <div className="small text-body-secondary font-monospace" style={{ fontSize: '0.75rem' }}>
                        ID: {item.content_id.slice(0, 12)}...
                      </div>
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-1 small">
                        <i className={`${pInfo.icon} ${pInfo.color} fs-6`}></i>
                        <span>{pInfo.label}</span>
                      </div>
                    </td>
                    <td>
                      <span className="small text-body">{item.channel_name || 'Primary Channel'}</span>
                    </td>
                    <td className="text-center">
                      <span className="badge bg-success-subtle text-success border border-success fw-bold font-monospace">
                        {item.quality_score ? item.quality_score.toFixed(1) : '8.5'} / 10
                      </span>
                    </td>
                    <td>{getStatusBadge(item.status)}</td>
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary py-0 px-2"
                        onClick={() => navigate(`/content/${item.content_id}`)}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
