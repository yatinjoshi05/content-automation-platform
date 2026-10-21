import React from 'react';
import { GlassCard } from './GlassCard';
import { ArrowUpRight, ArrowDownRight } from '../Icons';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  comparisonLabel?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  changeType = 'neutral',
  comparisonLabel = 'vs previous period',
  icon,
  onClick,
  className = ''
}) => {
  return (
    <GlassCard
      interactive={!!onClick}
      onClick={onClick}
      className={`stat-card ${className}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {title}
        </span>
        {icon && (
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-soft)',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
          {value}
        </span>
      </div>

      {(change || comparisonLabel) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
          {change && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                fontWeight: 600,
                color:
                  changeType === 'positive'
                    ? 'var(--status-success)'
                    : changeType === 'negative'
                    ? 'var(--status-danger)'
                    : 'var(--text-secondary)'
              }}
            >
              {changeType === 'positive' ? (
                <ArrowUpRight size={14} />
              ) : changeType === 'negative' ? (
                <ArrowDownRight size={14} />
              ) : null}
              {change}
            </span>
          )}
          {comparisonLabel && (
            <span style={{ color: 'var(--text-muted)' }}>{comparisonLabel}</span>
          )}
        </div>
      )}
    </GlassCard>
  );
};
