import React from 'react';

export const ProviderFallbackMonitor: React.FC = () => {
  return (
    <div className="card mb-4 shadow-sm border">
      <div className="card-header bg-body-tertiary d-flex justify-content-between align-items-center py-2">
        <span className="fw-semibold text-body">
          <i className="cil-cpu me-2 text-primary"></i>
          AI Model Routing &amp; Free-Tier Failover Policy
        </span>
        <span className="badge bg-success-subtle text-success border border-success small">
          Zero Paid Model Guarantee
        </span>
      </div>
      <div className="card-body">
        <div className="row g-3">
          {/* PRIMARY PROVIDER */}
          <div className="col-12 col-md-6 border-end-md">
            <div className="p-3 rounded bg-body-tertiary border h-100">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <span className="badge bg-primary text-white me-2">Priority 10</span>
                  <span className="fw-bold text-body">Google Gemini 1.5 Flash</span>
                </div>
                <span className="badge bg-success text-white">Active Primary</span>
              </div>
              <div className="small text-body-secondary mb-2">
                Primary model for trend analysis, script synthesis, and thumbnail prompt engineering.
              </div>
              <div className="d-flex flex-wrap gap-2 small">
                <span className="badge bg-secondary-subtle text-secondary border">Cost: $0.00 / Free Tier</span>
                <span className="badge bg-secondary-subtle text-secondary border">Rate Limit: 15 RPM / 1M TPM</span>
                <span className="badge bg-success-subtle text-success border border-success">Health: Nominal</span>
              </div>
            </div>
          </div>

          {/* FALLBACK PROVIDER */}
          <div className="col-12 col-md-6">
            <div className="p-3 rounded bg-body-tertiary border h-100">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <span className="badge bg-info text-white me-2">Priority 15</span>
                  <span className="fw-bold text-body">Groq Llama 3 70B Versatile</span>
                </div>
                <span className="badge bg-info-subtle text-info border border-info">Standby Fallback</span>
              </div>
              <div className="small text-body-secondary mb-2">
                Automatic failover target on Gemini 429 quota exhaustion or API degradation.
              </div>
              <div className="d-flex flex-wrap gap-2 small">
                <span className="badge bg-secondary-subtle text-secondary border">Cost: $0.00 / Free Tier</span>
                <span className="badge bg-secondary-subtle text-secondary border">Rate Limit: 30 RPM / 6K TPM</span>
                <span className="badge bg-info-subtle text-info border border-info">Checkpoint: Resume Enabled</span>
              </div>
            </div>
          </div>
        </div>

        {/* FAILOVER SAFETY NOTICE */}
        <div className="alert alert-light border d-flex align-items-center gap-2 mt-3 mb-0 py-2 px-3 small text-body-secondary">
          <i className="cil-shield-alt text-primary fs-5"></i>
          <div>
            <strong>Fail-Safe Operational Rule:</strong> When providers exhaust quota, the system halts or fails over to Groq without silent data loss. Jobs persist step checkpoints and resume upon quota reset.
          </div>
        </div>
      </div>
    </div>
  );
};
