import React, { useState } from 'react';
import { Approval } from '../types';
import { CheckCircle, Shield, AlertCircle, Clock, X } from '../components/Icons';

type ApprovalQueuePageProps = {
  approvals: Approval[];
  onDecision: (approvalId: string, decision: any) => Promise<void>;
  isLoading: boolean;
};

export const ApprovalQueuePage: React.FC<ApprovalQueuePageProps> = ({
  approvals,
  onDecision,
  isLoading
}) => {
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [modalMode, setModalMode] = useState<'reject' | 'edit' | null>(null);
  const [rejectComments, setRejectComments] = useState<string>('');
  const [editForm, setEditForm] = useState<{ title: string; description: string; hashtags: string }>({
    title: '',
    description: '',
    hashtags: ''
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleApprove = async (approval: Approval) => {
    if (!window.confirm(`Confirm approval for content "${approval.hook_text || 'Untitled'}"? This will advance the item to the scheduling stage.`)) {
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    try {
      await onDecision(approval.approval_id, { action: 'approve' });
    } catch (err: any) {
      setActionError(err.message || 'Approval failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegenerate = async (approval: Approval) => {
    if (!window.confirm(`Request regeneration for this clip? A new clipping and packaging job will be queued.`)) {
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    try {
      await onDecision(approval.approval_id, { action: 'regenerate' });
    } catch (err: any) {
      setActionError(err.message || 'Regenerate request failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRejectModal = (approval: Approval) => {
    setSelectedApproval(approval);
    setRejectComments('');
    setModalMode('reject');
  };

  const openEditModal = (approval: Approval) => {
    setSelectedApproval(approval);
    const platformData = approval.per_platform?.youtube || Object.values(approval.per_platform || {})[0] || {};
    setEditForm({
      title: platformData.title || approval.hook_text || '',
      description: platformData.description || '',
      hashtags: Array.isArray(platformData.hashtags) ? platformData.hashtags.join(', ') : ''
    });
    setModalMode('edit');
  };

  const submitReject = async () => {
    if (!selectedApproval) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await onDecision(selectedApproval.approval_id, {
        action: 'reject',
        comments: rejectComments || 'Rejected by operator'
      });
      setModalMode(null);
    } catch (err: any) {
      setActionError(err.message || 'Rejection failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitEdit = async () => {
    if (!selectedApproval) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const hashtagsArr = editForm.hashtags
        .split(',')
        .map(s => s.trim().replace(/^#/, ''))
        .filter(Boolean);

      const perPlatform: Record<string, any> = {
        youtube: {
          title: editForm.title,
          description: editForm.description,
          hashtags: hashtagsArr
        }
      };

      await onDecision(selectedApproval.approval_id, {
        action: 'edit',
        per_platform: perPlatform
      });
      setModalMode(null);
    } catch (err: any) {
      setActionError(err.message || 'Edit failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="approval-page">
      {actionError && (
        <div className="alert-banner alert-danger">
          <AlertCircle size={18} />
          <span>{actionError}</span>
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Human-in-the-Loop Approval Queue</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Review packaged video clips before scheduling. Autonomy gates ensure unverified rights or low-quality clips never publish automatically.
        </p>
      </div>

      {isLoading ? (
        <div className="loading-spinner" />
      ) : approvals.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <CheckCircle className="empty-icon" color="var(--status-success)" />
            <div className="empty-title">Approval Queue Is Clear</div>
            <div className="empty-desc">
              All packaged videos have been reviewed or auto-approved. New candidates will appear here when packaging completes.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {approvals.map((item) => {
            const platformMeta = item.per_platform?.youtube || Object.values(item.per_platform || {})[0] || {};
            const score = item.quality_score ? Number(item.quality_score) : null;
            const threshold = item.quality_threshold || 7.5;
            const isScorePass = score !== null && score >= threshold;

            return (
              <div key={item.approval_id} className="card" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                {/* Media Preview Column */}
                <div style={{ flex: '0 0 280px', maxWidth: '320px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column' }}>
                  {item.thumbnail_url || item.clip_thumbnail ? (
                    <img
                      src={item.thumbnail_url || item.clip_thumbnail || ''}
                      alt="Clip Thumbnail"
                      style={{ width: '100%', height: '180px', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', background: '#07090e' }}>
                      Thumbnail Rendering...
                    </div>
                  )}

                  <div style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <div><strong>Duration:</strong> {item.duration ? `${item.duration}s` : 'Short (< 60s)'}</div>
                    <div><strong>Channel:</strong> {item.channel_name || 'Primary'}</div>
                    <div><strong>Version:</strong> v{item.version}</div>
                  </div>
                </div>

                {/* Content & Metadata Details Column */}
                <div style={{ flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {platformMeta.title || item.hook_text || 'Untitled Video Clip'}
                      </h3>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Requested: {new Date(item.requested_at).toLocaleString()}
                      </div>
                    </div>
                    <span className="badge badge-warning">Awaiting Approval</span>
                  </div>

                  {/* Caption & Description Preview */}
                  <div style={{ background: 'var(--bg-surface)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Caption / Description:</div>
                    <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: '90px', overflowY: 'auto' }}>
                      {platformMeta.description || item.metadata_snapshot?.caption || 'No description provided.'}
                    </div>
                    {platformMeta.hashtags && (
                      <div style={{ marginTop: '0.4rem', color: 'var(--accent-primary)', fontSize: '0.8rem' }}>
                        {Array.isArray(platformMeta.hashtags) ? platformMeta.hashtags.map((h: string) => `#${h}`).join(' ') : ''}
                      </div>
                    )}
                  </div>

                  {/* Quality & Policy Badges */}
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>QA Score:</span>
                      <span className={`badge ${isScorePass ? 'badge-success' : 'badge-danger'}`}>
                        {score !== null ? `${score.toFixed(1)} / 10` : 'Not Scored'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Rights:</span>
                      <span className={`badge ${item.rights_status === 'verified' ? 'badge-success' : 'badge-warning'}`}>
                        {item.rights_status || 'Unverified'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Monetization:</span>
                      <span className={`badge ${item.monetization_status === 'allowed' ? 'badge-success' : 'badge-warning'}`}>
                        {item.monetization_status || 'Review Required'}
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div style={{ marginTop: 'auto', display: 'flex', gap: '0.65rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                    <button
                      className="btn btn-success"
                      onClick={() => handleApprove(item)}
                      disabled={isSubmitting}
                    >
                      <CheckCircle size={16} />
                      <span>Approve</span>
                    </button>

                    <button
                      className="btn btn-secondary"
                      onClick={() => openEditModal(item)}
                      disabled={isSubmitting}
                    >
                      Edit Metadata
                    </button>

                    <button
                      className="btn btn-danger"
                      onClick={() => openRejectModal(item)}
                      disabled={isSubmitting}
                    >
                      Reject
                    </button>

                    <button
                      className="btn btn-secondary"
                      onClick={() => handleRegenerate(item)}
                      disabled={isSubmitting}
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {modalMode === 'reject' && selectedApproval && (
        <div className="modal-overlay" onClick={() => setModalMode(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Reject Content Clip</h3>
              <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setModalMode(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Rejection Reason / Comments:</label>
              <textarea
                className="form-textarea"
                rows={4}
                value={rejectComments}
                onChange={(e) => setRejectComments(e.target.value)}
                placeholder="Explain why this clip is being rejected (e.g. copyright concern, poor pacing, offensive content)..."
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModalMode(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={submitReject} disabled={isSubmitting}>
                {isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {modalMode === 'edit' && selectedApproval && (
        <div className="modal-overlay" onClick={() => setModalMode(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Video Metadata (v{selectedApproval.version + 1})</h3>
              <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setModalMode(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Short Title:</label>
              <input
                type="text"
                className="form-input"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                maxLength={100}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description / Caption:</label>
              <textarea
                className="form-textarea"
                rows={4}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                maxLength={2000}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Hashtags (comma separated):</label>
              <input
                type="text"
                className="form-input"
                value={editForm.hashtags}
                onChange={(e) => setEditForm({ ...editForm, hashtags: e.target.value })}
                placeholder="shorts, viral, trending"
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModalMode(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submitEdit} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save & Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
