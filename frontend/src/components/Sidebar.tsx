import React from 'react';
import { useRouter } from '../utils/router';
import {
  LayoutDashboard,
  Layers,
  Calendar,
  BarChart3,
  GitFork,
  Cpu,
  Activity,
  HardDrive,
  FileText,
  Settings,
  Plus,
  ChevronRight,
  Server
} from './Icons';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  systemStatusOnline: boolean;
  diskFreeGb?: number;
}

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  systemStatusOnline,
  diskFreeGb
}) => {
  const { pathname, navigate } = useRouter();

  const mainNav: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'create', label: 'Create Content', href: '/create', icon: <Plus size={18} /> },
    { id: 'library', label: 'Content Library', href: '/library', icon: <Layers size={18} /> },
    { id: 'publishing', label: 'Publishing', href: '/publishing', icon: <Calendar size={18} /> },
    { id: 'analytics', label: 'Analytics', href: '/analytics', icon: <BarChart3 size={18} /> }
  ];

  const automationNav: NavItem[] = [
    { id: 'jobs', label: 'Jobs', href: '/jobs', icon: <GitFork size={18} /> },
    { id: 'models', label: 'Model Router', href: '/models', icon: <Cpu size={18} /> },
    { id: 'integrations', label: 'Integrations', href: '/integrations', icon: <Server size={18} /> }
  ];

  const systemNav: NavItem[] = [
    { id: 'logs', label: 'System Logs', href: '/logs', icon: <FileText size={18} /> },
    { id: 'settings', label: 'Settings', href: '/settings', icon: <Settings size={18} /> }
  ];

  const renderSection = (title: string, items: NavItem[]) => (
    <div style={{ marginBottom: 20 }}>
      {!isCollapsed && (
        <div
          style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            padding: '0 16px 8px',
            userSelect: 'none'
          }}
        >
          {title}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map(item => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <button
              key={item.id}
              onClick={() => navigate(item.href)}
              title={isCollapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: isCollapsed ? '10px 0' : '9px 16px',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                borderRadius: 'var(--radius-md)',
                border: '1px solid',
                borderColor: isActive ? 'var(--border-accent)' : 'transparent',
                background: isActive ? 'var(--accent-soft)' : 'transparent',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                textAlign: 'left'
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--bg-surface-secondary)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <span style={{ display: 'flex', flexShrink: 0 }}>{item.icon}</span>
              {!isCollapsed && (
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
              )}
              {!isCollapsed && item.badge && (
                <span
                  style={{
                    fontSize: '0.6875rem',
                    background: 'var(--accent-primary)',
                    color: '#fff',
                    borderRadius: 'var(--radius-full)',
                    padding: '1px 6px',
                    fontWeight: 700
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <aside
      style={{
        width: isCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        transition: 'width var(--transition-normal)'
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          padding: isCollapsed ? '0 8px' : '0 20px',
          borderBottom: '1px solid var(--border-subtle)'
        }}
      >
        <div
          onClick={() => navigate('/dashboard')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #FF003C 0%, #990024 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: '1rem',
              boxShadow: '0 0 12px var(--accent-glow)'
            }}
          >
            CA
          </div>
          {!isCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                ContentAuto
              </span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                Enterprise Studio
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: isCollapsed ? '16px 8px' : '16px 12px'
        }}
      >
        {renderSection('Main', mainNav)}
        {renderSection('Automation', automationNav)}
        {renderSection('System', systemNav)}
      </div>

      {/* Telemetry & System Status Footer */}
      {!isCollapsed ? (
        <div
          style={{
            padding: '16px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          {/* Storage Usage Widget */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <HardDrive size={13} /> Disk Space
              </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {diskFreeGb !== undefined ? `${diskFreeGb} GB Free` : '21.4 GB / 50 GB'}
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 5,
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--bg-main)',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: '43%',
                  height: '100%',
                  background: 'linear-gradient(90deg, #10B981 0%, var(--accent-primary) 100%)',
                  borderRadius: 'var(--radius-full)'
                }}
              />
            </div>
          </div>

          {/* System Status Indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              paddingTop: 4
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: systemStatusOnline ? 'var(--status-success)' : 'var(--status-danger)',
                  boxShadow: systemStatusOnline ? '0 0 8px rgba(16,185,129,0.6)' : '0 0 8px var(--accent-glow)'
                }}
              />
              System Status
            </span>
            <span
              style={{
                color: systemStatusOnline ? 'var(--status-success)' : 'var(--status-danger)',
                fontWeight: 600
              }}
            >
              {systemStatusOnline ? 'Operational' : 'Degraded'}
            </span>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '12px 0',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'center'
          }}
        >
          <span
            title={systemStatusOnline ? 'System Operational' : 'System Degraded'}
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: systemStatusOnline ? 'var(--status-success)' : 'var(--status-danger)'
            }}
          />
        </div>
      )}
    </aside>
  );
};
