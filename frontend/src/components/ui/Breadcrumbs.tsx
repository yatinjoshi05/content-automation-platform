import React from 'react';
import { useRouter } from '../../utils/router';
import { ChevronRight } from '../Icons';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export const Breadcrumbs: React.FC<{ items: BreadcrumbItem[] }> = ({ items }) => {
  const { navigate } = useRouter();

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: '0.8125rem',
        color: 'var(--text-muted)',
        marginBottom: 16
      }}
      aria-label="Breadcrumb"
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={idx}>
            {item.href && !isLast ? (
              <span
                onClick={() => navigate(item.href!)}
                style={{
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  textDecoration: 'none'
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                {item.label}
              </span>
            ) : (
              <span
                style={{
                  color: isLast ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isLast ? 600 : 400
                }}
              >
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight size={13} color="var(--text-muted)" />}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
