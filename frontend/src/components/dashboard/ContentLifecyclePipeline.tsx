import React from 'react';

export interface ContentLifecyclePipelineProps {
  stats: {
    jobs: { queued: number; running: number; completed: number; failed: number; total: number };
    approvals: { awaiting: number; approved: number; rejected: number };
    active_channels: number;
  };
  contentCount: number;
}

export const ContentLifecyclePipeline: React.FC<ContentLifecyclePipelineProps> = ({
  stats,
  contentCount
}) => {
  const stages = [
    {
      step: 1,
      title: 'Idea Discovery',
      icon: 'cil-lightbulb',
      status: 'Ready',
      count: 'Active',
      color: 'success',
      description: 'US niche trend discovery & hook formulation'
    },
    {
      step: 2,
      title: 'Script Synthesis',
      icon: 'cil-pencil',
      status: 'Ready',
      count: 'Gemini/Groq',
      color: 'success',
      description: 'Free-tier LLM script synthesis & title generation'
    },
    {
      step: 3,
      title: 'Video Production',
      icon: 'cil-media-play',
      status: 'Processing',
      count: `${stats.jobs.queued} Queued`,
      color: 'info',
      description: 'Procedural 9:16 vertical render (1080x1920 30fps)'
    },
    {
      step: 4,
      title: 'Quality & Rights',
      icon: 'cil-shield-alt',
      status: 'Enforced',
      count: 'Score ≥ 7.0',
      color: 'success',
      description: 'Automated policy, safety, and audio checks'
    },
    {
      step: 5,
      title: 'Approval Gate',
      icon: 'cil-check-circle',
      status: stats.approvals.awaiting > 0 ? 'Review Needed' : 'Clear',
      count: `${stats.approvals.awaiting} Pending`,
      color: stats.approvals.awaiting > 0 ? 'warning' : 'success',
      description: `${stats.approvals.approved} approved videos released to calendar`
    },
    {
      step: 6,
      title: 'Scheduling',
      icon: 'cil-calendar',
      status: 'Active',
      count: '3x / Channel',
      color: 'info',
      description: 'Timezone-aware queue across 73 channels'
    },
    {
      step: 7,
      title: 'Publishing',
      icon: 'cil-send',
      status: 'Awaiting Auth',
      count: 'YouTube/Meta',
      color: 'warning',
      description: 'OAuth credential setup pending in n8n'
    },
    {
      step: 8,
      title: 'Analytics & Revenue',
      icon: 'cil-chart-line',
      status: 'Separated',
      count: 'Audit Ledger',
      color: 'primary',
      description: 'Estimated vs confirmed earnings isolation'
    }
  ];

  return (
    <div className="card mb-4 shadow-sm border">
      <div className="card-header bg-body-tertiary d-flex justify-content-between align-items-center py-2">
        <span className="fw-semibold text-body">
          <i className="cil-layers me-2 text-primary"></i>
          End-to-End Content Lifecycle Pipeline
        </span>
        <span className="badge bg-secondary-subtle text-secondary small">
          Architecture &amp; State Monitor
        </span>
      </div>
      <div className="card-body p-3">
        <div className="row g-2">
          {stages.map(s => (
            <div key={s.step} className="col-12 col-sm-6 col-lg-3 col-xl">
              <div
                className={`p-2 rounded border h-100 bg-body-tertiary position-relative`}
                style={{ borderLeftWidth: '4px !important', borderLeftColor: `var(--cui-${s.color}, #3399ff)` }}
              >
                <div className="d-flex justify-content-between align-items-start mb-1">
                  <span className="badge bg-dark-subtle text-body-secondary small fw-bold font-monospace">
                    0{s.step}
                  </span>
                  <span className={`badge bg-${s.color} text-white small`} style={{ fontSize: '0.7rem' }}>
                    {s.status}
                  </span>
                </div>
                <div className="fw-bold text-body small mt-1">{s.title}</div>
                <div className="text-primary fw-semibold small mb-1">{s.count}</div>
                <div className="text-body-secondary" style={{ fontSize: '0.72rem', lineHeight: 1.25 }}>
                  {s.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
