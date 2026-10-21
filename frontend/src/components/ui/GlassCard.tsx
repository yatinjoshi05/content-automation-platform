import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  interactive = false,
  onClick,
  style
}) => {
  return (
    <div
      onClick={onClick}
      className={`glass-card ${interactive ? 'glass-card-interactive' : ''} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
};
