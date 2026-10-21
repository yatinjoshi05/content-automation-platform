import React from 'react';
import { Workflow } from '../types';
import { GitFork, ExternalLink } from '../components/Icons';

type WorkflowMonitorPageProps = {
  workflows: Workflow[];
  n8nUiUrl: string;
  isLoading: boolean;
};

export const WorkflowMonitorPage: React.FC<WorkflowMonitorPageProps> = ({
  workflows,
  n8nUiUrl,
  isLoading
}) => {
  return (
    <div className="workflows-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>n8n Workflow Monitor</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            15 modular workflows deployed and running under Node.js 24.18.0 with isolated-vm execution.
          </p>
        </div>

        <a
          href={n8nUiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <span>Open n8n Web UI</span>
          <ExternalLink size={14} />
        </a>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <GitFork size={18} color="var(--accent-primary)" />
            Deployed Workflows ({workflows.length} Active)
          </h3>
          <span className="badge badge-success">All Published</span>
        </div>

        {isLoading ? (
          <div className="loading-spinner" />
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Workflow Name</th>
                  <th>Stable ID</th>
                  <th>Nodes</th>
                  <th>Triggers / Webhooks</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((w) => (
                  <tr key={w.id || w.file}>
                    <td style={{ fontWeight: 600 }}>{w.name || w.file}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {w.id}
                    </td>
                    <td>{w.node_count} nodes</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {w.webhook_paths?.map((p) => (
                          <span key={p} className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                            /{p}
                          </span>
                        ))}
                        {w.triggers?.filter(t => !t.type.endsWith('.webhook')).map((t, idx) => (
                          <span key={idx} className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-success">Active</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
