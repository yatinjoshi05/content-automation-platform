import React from 'react';
import { Youtube, Instagram, Facebook, Video } from '../Icons';

export type PlatformType = 'youtube' | 'instagram' | 'facebook' | string;

interface PlatformBadgeProps {
  platform: PlatformType;
  showIconOnly?: boolean;
  className?: string;
}

export const PlatformBadge: React.FC<PlatformBadgeProps> = ({
  platform,
  showIconOnly = false,
  className = ''
}) => {
  const p = String(platform || '').toLowerCase();

  let icon = <Video size={13} />;
  let label = 'Video';
  let color = 'var(--text-secondary)';

  if (p.includes('youtube')) {
    icon = <Youtube size={13} color="#FF0000" />;
    label = 'YouTube Shorts';
    color = '#FF4444';
  } else if (p.includes('instagram')) {
    icon = <Instagram size={13} color="#E1306C" />;
    label = 'Instagram Reels';
    color = '#E1306C';
  } else if (p.includes('facebook')) {
    icon = <Facebook size={13} color="#1877F2" />;
    label = 'Facebook Reels';
    color = '#1877F2';
  }

  return (
    <span
      className={`platform-badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-surface-secondary)',
        border: '1px solid var(--border-default)',
        fontSize: '0.75rem',
        fontWeight: 500,
        color
      }}
    >
      {icon}
      {!showIconOnly && <span>{label}</span>}
    </span>
  );
};
