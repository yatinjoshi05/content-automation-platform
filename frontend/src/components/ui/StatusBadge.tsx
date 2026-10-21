import React from 'react';

export type StatusType =
  | 'published'
  | 'scheduled'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'draft'
  | 'running'
  | 'queued'
  | 'completed'
  | 'failed'
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'needs_setup'
  | 'not_verified'
  | string;

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className = '' }) => {
  const norm = String(status || '').toLowerCase().replace(/[\s-]/g, '_');

  let badgeClass = 'badge-neutral';
  let dotColor = 'var(--text-muted)';
  let displayLabel = label || norm.replace(/_/g, ' ');

  if (['published', 'completed', 'approved', 'healthy'].includes(norm)) {
    badgeClass = 'badge-success';
    dotColor = 'var(--status-success)';
  } else if (['scheduled', 'awaiting_approval', 'queued', 'needs_setup'].includes(norm)) {
    badgeClass = 'badge-warning';
    dotColor = 'var(--status-warning)';
  } else if (['failed', 'rejected', 'danger', 'error', 'unavailable'].includes(norm)) {
    badgeClass = 'badge-danger';
    dotColor = 'var(--status-danger)';
  } else if (['running', 'processing', 'info'].includes(norm)) {
    badgeClass = 'badge-info';
    dotColor = 'var(--status-info)';
  } else if (['not_verified', 'degraded'].includes(norm)) {
    badgeClass = 'badge-warning';
    dotColor = 'var(--status-warning)';
  }

  return (
    <span className={`badge ${badgeClass} ${className}`}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: dotColor
        }}
      />
      {displayLabel}
    </span>
  );
};
