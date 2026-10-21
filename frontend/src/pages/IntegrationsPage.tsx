import React from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  Youtube,
  Instagram,
  Facebook,
  Cpu,
  Database,
  Mail,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  CheckCircle
} from '../components/Icons';

export const IntegrationsPage: React.FC = () => {
  const integrations = [
    {
      id: 'youtube',
      name: 'YouTube Data API v3',
      category: 'Social Publishing',
      status: 'needs_setup',
      statusLabel: 'Awaiting OAuth Login',
      description: 'Used for autonomous resumable video uploads to YouTube Shorts. Paused at interactive Google account login boundary.',
      icon: <Youtube size={26} color="#FF0000" />,
      actionText: 'Connect in n8n (port 5678)',
      actionUrl: 'http://localhost:5678',
      details: 'Credential name must be "YouTube OAuth2". Required scope: https://www.googleapis.com/auth/youtube.upload'
    },
    {
      id: 'instagram',
      name: 'Instagram Graph API v21.0',
      category: 'Social Publishing',
      status: 'needs_setup',
      statusLabel: 'Fail-Closed (Gated)',
      description: 'Two-phase container creation and video publishing pipeline for Instagram Reels. Safely locked behind adapter_verified_instagram = false.',
      icon: <Instagram size={26} color="#E1306C" />,
      details: 'Requires Meta Business Account, Linked Page, and public HTTPS media URL.'
    },
    {
      id: 'facebook',
      name: 'Facebook Reels API v21.0',
      category: 'Social Publishing',
      status: 'needs_setup',
      statusLabel: 'Fail-Closed (Gated)',
      description: 'Meta Graph API v21.0 Page video reels initialization and publish commit. Safely locked behind adapter_verified_facebook = false.',
      icon: <Facebook size={26} color="#1877F2" />,
      details: 'Requires Facebook Page Access Token and rupload protocol implementation.'
    },
    {
      id: 'n8n',
      name: 'n8n Workflow Engine',
      category: 'Core Orchestration',
      status: 'healthy',
      statusLabel: '16/16 Active',
      description: 'Local orchestration daemon on port 5678 executing discovery, QA, and publishing workflows.',
      icon: <Cpu size={26} color="var(--accent-primary)" />,
      actionText: 'Open n8n Canvas',
      actionUrl: 'http://localhost:5678',
      details: 'Node v24.18.0 &bull; D:\\n8n_data &bull; Webhook Auth enabled'
    },
    {
      id: 'postgresql',
      name: 'PostgreSQL 16.8',
      category: 'Relational Store',
      status: 'healthy',
      statusLabel: 'Connected',
      description: 'Durable ACID database hosting schema migrations 001-008, jobs queue, and content versions.',
      icon: <Database size={26} color="#336791" />,
      details: 'localhost:5432 &bull; content_automation &bull; D:\\pgsql\\data'
    },
    {
      id: 'gmail',
      name: 'Email Alerts (Gmail SMTP)',
      category: 'Notifications',
      status: 'not_verified',
      statusLabel: 'Static / Mock',
      description: 'Workflow 15 supervisor notifications node. Requires SMTP or Google OAuth credential to send live alert emails.',
      icon: <Mail size={26} color="#EA4335" />,
      details: 'Alert deduplication active in PostgreSQL.'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Breadcrumbs items={[{ label: 'Studio', href: '/dashboard' }, { label: 'Platform Integrations' }]} />

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Platform Integrations & Credentials</h1>
          <p className="page-subtitle">
            Direct audit of social media publishing adapters, local daemon connections, and API authentications.
          </p>
        </div>
      </div>

      <div className="grid-2">
        {integrations.map(item => (
          <GlassCard key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface-secondary)',
                    border: '1px solid var(--border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {item.icon}
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{item.name}</h3>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {item.category}
                  </span>
                </div>
              </div>
              <StatusBadge status={item.status} label={item.statusLabel} />
            </div>

            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {item.description}
            </p>

            <div style={{ padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {item.details}
            </div>

            {item.actionUrl && (
              <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                <a
                  href={item.actionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {item.actionText} <ExternalLink size={13} />
                </a>
              </div>
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
};
