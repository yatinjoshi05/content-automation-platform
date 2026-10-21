import React from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Cpu, CheckCircle, AlertTriangle, ShieldCheck, RefreshCw } from '../components/Icons';

export const ModelsPage: React.FC = () => {
  const models = [
    {
      id: 'gemini',
      provider: 'Google Gemini',
      model: 'gemini-3.6-flash',
      priority: 10,
      role: 'Primary Synthesizer',
      tier: 'Free Tier',
      status: 'healthy',
      latency: '~650ms',
      capabilities: ['text', 'script', 'ideas', 'hooks'],
      rpmLimit: '15 RPM / 1M TPM'
    },
    {
      id: 'groq',
      provider: 'Groq Cloud',
      model: 'llama-3.3-70b-versatile',
      priority: 15,
      role: 'Quota Failover Standby',
      tier: 'Free Tier',
      status: 'healthy',
      latency: '~280ms',
      capabilities: ['text', 'script', 'critique'],
      rpmLimit: '30 RPM / 6k TPM'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Breadcrumbs items={[{ label: 'Studio', href: '/dashboard' }, { label: 'AI Model Router' }]} />

      <div className="page-header-row">
        <div>
          <h1 className="page-title">AI Model Router & Quota Failover</h1>
          <p className="page-subtitle">
            Autonomous provider switching, free-tier priority hierarchies, and circuit-breaker monitoring.
          </p>
        </div>
      </div>

      {/* Safety Guarantee Card */}
      <div
        style={{
          padding: '16px 20px',
          background: 'var(--accent-soft)',
          border: '1px solid var(--border-accent)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 14
        }}
      >
        <ShieldCheck size={24} color="var(--accent-primary)" />
        <div style={{ fontSize: '0.8125rem' }}>
          <strong style={{ color: 'var(--text-primary)', display: 'block', fontSize: '0.875rem' }}>
            Zero Silent Paid Provider Guarantee:
          </strong>
          The router is configured strictly with free-tier providers (Priority 10 Gemini Flash, Priority 15 Groq Llama 3.3). When all free capacity is temporarily exhausted, jobs pause safely in PostgreSQL with backoff rather than silently routing to paid providers.
        </div>
      </div>

      {/* Model Cards */}
      <div className="grid-2">
        {models.map(m => (
          <GlassCard key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface-secondary)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--accent-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Cpu size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>{m.provider}</h3>
                  <code style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{m.model}</code>
                </div>
              </div>
              <StatusBadge status={m.status} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.8125rem', padding: '12px 0', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Routing Role:</span>
                <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{m.role}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Priority Rank:</span>
                <span style={{ fontWeight: 600 }}>Priority {m.priority}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Billing Tier:</span>
                <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>{m.tier}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Rate Limits:</span>
                <span>{m.rpmLimit}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Avg Latency:</span>
                <span>{m.latency}</span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Eligible Capabilities
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {m.capabilities.map(cap => (
                  <span
                    key={cap}
                    style={{
                      fontSize: '0.6875rem',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface-secondary)',
                      border: '1px solid var(--border-subtle)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Failover Logic Specification */}
      <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Failover Execution & Circuit Breakers</h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          1. <strong>Primary Selection:</strong> The job runner executes <code>ca_pick_model(ARRAY['text'], false)</code> which queries <code>model_routing_config</code> and returns Priority 10 Gemini.<br />
          2. <strong>Quota Exhaustion (HTTP 429):</strong> If Gemini returns a rate-limit or quota error, the caller dispatches <code>ca_pick_model(ARRAY['text'], true)</code>, instantly routing to standby Priority 15 Groq.<br />
          3. <strong>Complete Provider Exhaustion:</strong> If both providers return 429 or 503, the task runner places the job in <code>retrying</code> status with <code>next_retry_at = now() + interval '5 minutes'</code>, preserving attempt counts until rolling quotas reset.
        </p>
      </GlassCard>
    </div>
  );
};
