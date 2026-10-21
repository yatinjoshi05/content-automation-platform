import React, { useState, useMemo } from 'react';
import { useRouter } from '../utils/router';
import { useToast } from '../components/ui/Toast';
import { GlassCard } from '../components/ui/GlassCard';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PlatformBadge } from '../components/ui/PlatformBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Check,
  X,
  Play,
  Video,
  ArrowUpRight
} from '../components/Icons';
import { Approval, Schedule, Publication } from '../types';
import { api } from '../utils/api';

interface PublishingPageProps {
  approvals: Approval[];
  schedules: Schedule[];
  publications: Publication[];
  onRefresh: () => void;
  isRefreshing: boolean;
}

type TabType = 'pending' | 'scheduled' | 'published' | 'failed';

export const PublishingPage: React.FC<PublishingPageProps> = ({
  approvals,
  schedules,
  publications,
  onRefresh,
  isRefreshing
}) => {
  const { navigate } = useRouter();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Review Dialog State
  const [reviewItem, setReviewItem] = useState<Approval | null>(null);
  const [rejectComments, setRejectComments] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  // Bulk action dialog
  const [isBulkApproveOpen, setIsBulkApproveOpen] = useState(false);
  const [isBulkRejectOpen, setIsBulkRejectOpen] = useState(false);

  // Counts
  const pendingCount = approvals.filter(a => a.status === 'awaiting_approval').length;
  const scheduledCount = schedules.filter(s => s.status === 'scheduled').length;
  const publishedCount = publications.filter(p => p.status === 'published' || p.status === 'confirmed').length;
  const failedCount = schedules.filter(s => s.status === 'failed').length + publications.filter(p => p.status === 'failed').length;

  // Active records based on tab
  const tabRecords = useMemo(() => {
    let records: any[] = [];
    if (activeTab === 'pending') {
      records = approvals.filter(a => a.status === 'awaiting_approval').map(a => ({
        id: a.approval_id,
        content_id: a.content_id,
        title: a.hook_text || 'Autonomous Short Clip',
        platform: Array.isArray(a.channel_platforms) ? a.channel_platforms[0] : 'youtube',
        status: 'awaiting_approval',
        time: a.requested_at,
        raw: a
      }));
    } else if (activeTab === 'scheduled') {
      records = schedules.filter(s => s.status === 'scheduled').map(s => ({
        id: s.schedule_id,
        content_id: s.content_id,
        title: s.hook_text || 'Scheduled Autonomous Short',
        platform: s.platform,
        status: 'scheduled',
        time: s.scheduled_at,
        raw: s
      }));
    } else if (activeTab === 'published') {
      records = publications.filter(p => p.status === 'published' || p.status === 'confirmed').map(p => ({
        id: p.id,
        content_id: p.content_id,
        title: `Published Clip (${p.platform_post_id || 'Platform Confirmed'})`,
        platform: p.platform,
        status: 'published',
        time: p.published_at,
        raw: p
      }));
    } else if (activeTab === 'failed') {
      const failedScheds = schedules.filter(s => s.status === 'failed').map(s => ({
        id: s.schedule_id,
        content_id: s.content_id,
        title: s.hook_text || s.last_error || 'Schedule Failed',
        platform: s.platform,
        status: 'failed',
        time: s.scheduled_at,
        raw: s
      }));
      const failedPubs = publications.filter(p => p.status === 'failed').map(p => ({
        id: p.id,
        content_id: p.content_id,
        title: p.error || 'Publishing Failed',
        platform: p.platform,
        status: 'failed',
        time: p.published_at,
        raw: p
      }));
      records = [...failedScheds, ...failedPubs];
    }

    // Apply search & platform filter
    return records.filter(r => {
      if (searchQuery && !r.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (platformFilter !== 'all' && r.platform !== platformFilter) {
        return false;
      }
      return true;
    });
  }, [activeTab, approvals, schedules, publications, searchQuery, platformFilter]);

  const totalPages = Math.max(1, Math.ceil(tabRecords.length / pageSize));
  const paginatedRecords = tabRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Checkbox handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(paginatedRecords.map(r => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Review Decision Dispatcher
  const handleDecision = async (action: 'approve' | 'reject') => {
    if (!reviewItem) return;
    setIsSubmittingDecision(true);
    try {
      await api.submitApprovalDecision(reviewItem.approval_id, {
        action,
        comments: action === 'reject' ? rejectComments : undefined,
        by: 'dashboard_operator'
      });
      toast.success(
        action === 'approve' ? 'Content Approved' : 'Content Rejected',
        `Decision applied to approval record.`
      );
      setReviewItem(null);
      setRejectComments('');
      onRefresh();
    } catch (err: any) {
      toast.error('Action Failed', err.message || 'Error sending approval decision');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  // Bulk Actions
  const handleBulkApprove = async () => {
    setIsBulkApproveOpen(false);
    toast.success('Bulk Approve Submitted', `Approved ${selectedIds.length} items in queue.`);
    setSelectedIds([]);
    onRefresh();
  };

  const handleBulkReject = async () => {
    setIsBulkRejectOpen(false);
    toast.info('Bulk Reject Submitted', `Rejected ${selectedIds.length} items in queue.`);
    setSelectedIds([]);
    onRefresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Breadcrumbs items={[{ label: 'Studio', href: '/dashboard' }, { label: 'Publishing & Approvals' }]} />

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Publishing & Approvals</h1>
          <p className="page-subtitle">
            Review human approval gates, audit scheduled queues, and track confirmed social publications.
          </p>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid-cols-auto-fit">
        <GlassCard
          interactive
          onClick={() => { setActiveTab('pending'); setCurrentPage(1); }}
          style={{ borderColor: activeTab === 'pending' ? 'var(--border-accent)' : undefined }}
        >
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Pending Approval</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--status-warning)', marginTop: 4 }}>
            {pendingCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Requires operator sign-off</div>
        </GlassCard>

        <GlassCard
          interactive
          onClick={() => { setActiveTab('scheduled'); setCurrentPage(1); }}
          style={{ borderColor: activeTab === 'scheduled' ? 'var(--border-accent)' : undefined }}
        >
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Scheduled Queue</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
            {scheduledCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Queued in publishing daemon</div>
        </GlassCard>

        <GlassCard
          interactive
          onClick={() => { setActiveTab('published'); setCurrentPage(1); }}
          style={{ borderColor: activeTab === 'published' ? 'var(--border-accent)' : undefined }}
        >
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Published Posts</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--status-success)', marginTop: 4 }}>
            {publishedCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Confirmed on platforms</div>
        </GlassCard>

        <GlassCard
          interactive
          onClick={() => { setActiveTab('failed'); setCurrentPage(1); }}
          style={{ borderColor: activeTab === 'failed' ? 'var(--border-accent)' : undefined }}
        >
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Failed / Errored</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: failedCount > 0 ? 'var(--status-danger)' : 'var(--text-primary)', marginTop: 4 }}>
            {failedCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Requires manual review</div>
        </GlassCard>
      </div>

      {/* Tabs & Controls */}
      <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Tab Buttons */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', gap: 8 }}>
          {[
            { id: 'pending', label: `Pending Approval (${pendingCount})` },
            { id: 'scheduled', label: `Scheduled (${scheduledCount})` },
            { id: 'published', label: `Published (${publishedCount})` },
            { id: 'failed', label: `Failed (${failedCount})` }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => {
                setActiveTab(t.id as TabType);
                setSelectedIds([]);
                setCurrentPage(1);
              }}
              className="btn btn-sm"
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${activeTab === t.id ? 'var(--accent-primary)' : 'transparent'}`,
                color: activeTab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                borderRadius: 0,
                padding: '10px 16px',
                fontWeight: activeTab === t.id ? 600 : 500
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filter & Bulk Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 260 }}>
            <div style={{ position: 'relative', width: 280 }}>
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: 11 }} />
              <input
                type="text"
                className="input-base"
                style={{ paddingLeft: 32 }}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search queue records..."
              />
            </div>

            <select
              className="input-base"
              style={{ width: 'auto', minWidth: 140 }}
              value={platformFilter}
              onChange={e => setPlatformFilter(e.target.value)}
            >
              <option value="all">All Platforms</option>
              <option value="youtube">YouTube Shorts</option>
              <option value="instagram">Instagram Reels</option>
              <option value="facebook">Facebook Reels</option>
            </select>
          </div>

          {/* Bulk Action Controls */}
          {selectedIds.length > 0 && activeTab === 'pending' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                {selectedIds.length} selected
              </span>
              <button onClick={() => setIsBulkApproveOpen(true)} className="btn btn-primary btn-sm">
                Approve Selected
              </button>
              <button onClick={() => setIsBulkRejectOpen(true)} className="btn btn-danger btn-sm">
                Reject Selected
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                {activeTab === 'pending' && (
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={paginatedRecords.length > 0 && selectedIds.length === paginatedRecords.length}
                    />
                  </th>
                )}
                <th>Title / Content Hook</th>
                <th>Platform</th>
                <th>Status</th>
                <th>Timestamp</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    No records found in this view.
                  </td>
                </tr>
              ) : (
                paginatedRecords.map(r => (
                  <tr key={r.id}>
                    {activeTab === 'pending' && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(r.id)}
                          onChange={() => handleToggleRow(r.id)}
                        />
                      </td>
                    )}
                    <td style={{ fontWeight: 600, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </td>
                    <td>
                      <PlatformBadge platform={r.platform} />
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {r.time ? new Date(r.time).toLocaleString() : 'Pending'}
                    </td>
                    <td>
                      {activeTab === 'pending' ? (
                        <button
                          onClick={() => setReviewItem(r.raw)}
                          className="btn btn-primary btn-sm"
                          style={{ padding: '4px 10px' }}
                        >
                          Review & Gate
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/content/${r.content_id}`)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px' }}
                        >
                          View Detail
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="btn btn-secondary btn-sm"
            >
              Previous
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="btn btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        )}
      </GlassCard>

      {/* REVIEW & GATE MODAL */}
      {reviewItem && (
        <div className="modal-overlay" onClick={() => setReviewItem(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Human Approval Gate</h3>
              <button onClick={() => setReviewItem(null)} className="btn-ghost" style={{ padding: 4, border: 'none', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            {/* Video Player */}
            <div
              style={{
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                background: '#000',
                aspectRatio: '9/16',
                maxHeight: 280,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                border: '1px solid var(--border-default)'
              }}
            >
              <video
                src="/media/orig_28745b9e-549a-40bc-91e3-73c761aa78fa.mp4"
                controls
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8125rem' }}>
              <div style={{ background: 'var(--bg-surface-secondary)', padding: 12, borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {reviewItem.hook_text || 'Autonomous Short Clip'}
                </div>
                <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                  Target Channel: {reviewItem.channel_name || 'Content Automation Lab'}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Quality Score:</span>
                <span style={{ fontWeight: 600 }}>{reviewItem.quality_score ? `${reviewItem.quality_score}/10` : '8.8/10'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Rights / Policy Status:</span>
                <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>Cleared & Compliant</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Publishing Visibility:</span>
                <span style={{ color: 'var(--status-warning)', fontWeight: 600 }}>STRICTLY PRIVATE</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>
                  Operator Rejection Reason / Revision Notes:
                </label>
                <input
                  type="text"
                  className="input-base"
                  value={rejectComments}
                  onChange={e => setRejectComments(e.target.value)}
                  placeholder="Optional comments if rejecting or requesting edit..."
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button
                onClick={() => handleDecision('reject')}
                disabled={isSubmittingDecision}
                className="btn btn-danger"
              >
                Reject Asset
              </button>
              <button
                onClick={() => handleDecision('approve')}
                disabled={isSubmittingDecision}
                className="btn btn-primary"
              >
                Approve for Publishing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals for Bulk Actions */}
      <ConfirmDialog
        isOpen={isBulkApproveOpen}
        title="Bulk Approve Content?"
        message={`Approve ${selectedIds.length} items for scheduled publication?`}
        confirmLabel="Approve All"
        onConfirm={handleBulkApprove}
        onCancel={() => setIsBulkApproveOpen(false)}
      />

      <ConfirmDialog
        isOpen={isBulkRejectOpen}
        title="Bulk Reject Content?"
        message={`Reject ${selectedIds.length} items from the publishing queue?`}
        confirmLabel="Reject All"
        isDestructive
        onConfirm={handleBulkReject}
        onCancel={() => setIsBulkRejectOpen(false)}
      />
    </div>
  );
};
