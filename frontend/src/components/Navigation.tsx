import React from 'react';
import {
  LayoutDashboard,
  Layers,
  CheckCircle,
  Calendar,
  GitFork,
  BarChart3,
  Settings
} from './Icons';
import { SystemTelemetry } from '../types';

type NavigationProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingApprovalsCount: number;
  telemetry: SystemTelemetry | null;
};

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  pendingApprovalsCount,
  telemetry
}) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'pipeline', label: 'Content Pipeline', icon: Layers },
    { id: 'approvals', label: 'Approval Queue', icon: CheckCircle, badge: pendingApprovalsCount },
    { id: 'calendar', label: 'Calendar & Ready', icon: Calendar },
    { id: 'workflows', label: 'Workflow Monitor', icon: GitFork },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-badge">CA</div>
        <div>
          <div className="logo-text">Content Automation</div>
          <div className="logo-sub">Local Orchestration</div>
        </div>
      </div>

      <ul className="nav-list">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <li key={item.id}>
              <button
                className={`nav-item-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={18} className="nav-icon" />
                <span className="nav-text">{item.label}</span>
                {item.badge && item.badge > 0 ? (
                  <span className="nav-badge">{item.badge}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="sidebar-footer">
        <div className="system-telemetry-mini">
          <div className="telemetry-row">
            <span>Disk Free:</span>
            <span className="telemetry-val">
              {telemetry?.disk_free_gb !== null && telemetry?.disk_free_gb !== undefined
                ? `${Number(telemetry.disk_free_gb).toFixed(1)} GB`
                : 'N/A'}
            </span>
          </div>
          <div className="telemetry-row">
            <span>CPU / RAM:</span>
            <span className="telemetry-val">
              {telemetry?.cpu_percent !== null && telemetry?.cpu_percent !== undefined
                ? `${telemetry.cpu_percent}% / ${telemetry.ram_percent}%`
                : 'N/A'}
            </span>
          </div>
          <div className="telemetry-row" style={{ marginTop: '0.2rem' }}>
            <span>Safeguard:</span>
            <span className="telemetry-val" style={{ color: 'var(--status-success)' }}>
              Active (Fail-closed)
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
