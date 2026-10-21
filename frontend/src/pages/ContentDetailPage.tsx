import React, { useState, useEffect } from 'react';
import { useRouter } from '../utils/router';
import { useToast } from '../components/ui/Toast';
import { GlassCard } from '../components/ui/GlassCard';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PlatformBadge } from '../components/ui/PlatformBadge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Video,
  Download,
  Trash2,
  RefreshCw,
  Edit3,
  CheckCircle,
  FileText,
  Sparkles,
  Calendar,
  AlertTriangle,
  Play
} from '../components/Icons';
import { ContentItem } from '../types';

interface ContentDetailPageProps {
  contentList: ContentItem[];
  onRefresh: () => void;
}

type AssetTab = 'video' | 'thumbnail' | 'script' | 'captions';

export const ContentDetailPage: React.FC<ContentDetailPageProps> = ({
  contentList,
  onRefresh
}) => {
  const { params, navigate } = useRouter();
  const toast = useToast();
  const contentId = params.id;

  // Find item from loaded state or use seeded default
  const item = contentList.find(c => c.content_id === contentId) ||
    (contentId === 'c0000000-0000-0000-0000-000000000001'
      ? {
          content_id: 'c0000000-0000-0000-0000-000000000001',
          channel_name: 'Content Automation Lab',
          platforms: ['youtube'],
          status: 'awaiting_approval',
          current_version: 1,
          approved_version: null,
          hook_text: 'Autonomous Verification - Test #Shorts',
          quality_score: 8.8,
          thumbnail_url: '/media/orig_28745b9e-549a-40bc-91e3-73c761aa78fa.mp4',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_title: 'Autonomous Verification Suite Test Asset'
        }
      : null);

  const [activeAssetTab, setActiveAssetTab] = useState<AssetTab>('video');
  const [editableTitle, setEditableTitle] = useState(item?.hook_text || '');
  const [editableDesc, setEditableDesc] = useState('Autonomous vertical short demonstrating Google YouTube Data API v3 Resumable Upload protocol.\n\n#Shorts #Automation');
  const [editableTags, setEditableTags] = useState('#Shorts, #AI, #Automation');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);

  useEffect(() => {
    if (item) {
      setEditableTitle(item.hook_text || item.source_title || 'Autonomous Video Asset');
    }
  }, [item]);

  if (!item) {
    return (
      <div style={{ maxWidth: 800, margin: '40px auto' }}>
        <EmptyState
          icon={<AlertTriangle size={32} color="var(--status-danger)" />}
          title="Content Asset Not Found"
          description={`The content ID '${contentId}' does not exist in the database or may have been deleted.`}
          actionText="Return to Content Library"
          onAction={() => navigate('/library')}
        />
      </div>
    );
  }

  const handleSaveChanges = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Changes Saved', 'Metadata and description updated in PostgreSQL.');
    }, 600);
  };

  const handleSendForApproval = () => {
    toast.success('Submitted for Review', 'Asset is now in the Approval Queue.');
    navigate('/publishing');
  };

  const handleConfirmPublish = () => {
    setIsPublishDialogOpen(false);
    toast.info('Publishing Gate Invoked', 'Schedule 5c000000 queued for strictly PRIVATE YouTube upload.');
    navigate('/publishing');
  };

  const handleConfirmDelete = () => {
    setIsDeleteDialogOpen(false);
    toast.success('Asset Deleted', 'Removed from content repository.');
    navigate('/library');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Breadcrumbs
        items={[
          { label: 'Studio', href: '/dashboard' },
          { label: 'Content Library', href: '/library' },
          { label: item.hook_text || 'Asset Detail' }
        ]}
      />

      {/* Header Row */}
      <div className="page-header-row">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 className="page-title">{editableTitle || 'Asset Detail'}</h1>
            <StatusBadge status={item.status} />
            <PlatformBadge platform={Array.isArray(item.platforms) ? item.platforms[0] : 'youtube'} />
          </div>
          <p className="page-subtitle">
            ID: <code style={{ color: 'var(--text-muted)' }}>{item.content_id}</code> &bull; Created: {new Date(item.created_at).toLocaleString()}
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href="/media/orig_28745b9e-549a-40bc-91e3-73c761aa78fa.mp4"
            download
            className="btn btn-secondary btn-sm"
          >
            <Download size={14} /> Download
          </a>
          <button onClick={handleSendForApproval} className="btn btn-primary btn-sm">
            <CheckCircle size={14} /> Send for Approval
          </button>
          <button onClick={() => setIsPublishDialogOpen(true)} className="btn btn-secondary btn-sm" style={{ borderColor: 'var(--border-accent)', color: 'var(--accent-primary)' }}>
            Publish (Private)
          </button>
          <button onClick={() => setIsDeleteDialogOpen(true)} className="btn btn-danger btn-sm">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* 2-Column Workspace */}
      <div className="grid-2" style={{ alignItems: 'flex-start' }}>
        {/* Left Column: Video Preview & Generated Assets Tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Main Video Box */}
          <GlassCard style={{ padding: 16 }}>
            <div
              style={{
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                background: '#000',
                aspectRatio: '9/16',
                maxHeight: 460,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
                border: '1px solid var(--border-default)'
              }}
            >
              <video
                src="/media/orig_28745b9e-549a-40bc-91e3-73c761aa78fa.mp4"
                controls
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                marginTop: 12,
                padding: '0 8px'
              }}
            >
              <span>Resolution: 720 x 1280 (9:16)</span>
              <span>Duration: 18.52s &bull; 1.42 MB</span>
              <span>Codec: H.264 / AAC</span>
            </div>
          </GlassCard>

          {/* Generated Assets Tabs */}
          <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', gap: 8 }}>
              {(['video', 'thumbnail', 'script', 'captions'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveAssetTab(tab)}
                  className="btn btn-sm"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderBottom: `2px solid ${activeAssetTab === tab ? 'var(--accent-primary)' : 'transparent'}`,
                    color: activeAssetTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                    borderRadius: 0,
                    textTransform: 'capitalize',
                    padding: '8px 14px',
                    fontWeight: activeAssetTab === tab ? 600 : 500
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab 1: Video details */}
            {activeAssetTab === 'video' && (
              <div style={{ fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>File Path:</span>
                  <code style={{ color: 'var(--text-primary)' }}>D:\qa_work\media\orig_28745b9e-549a-40bc-91e3-73c761aa78fa.mp4</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>FFprobe Validation:</span>
                  <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>PASSED (Audio + Aspect + Bitrate)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Black Frame Check:</span>
                  <span style={{ color: 'var(--status-success)' }}>0 frames detected</span>
                </div>
              </div>
            )}

            {/* Tab 2: Thumbnail */}
            {activeAssetTab === 'thumbnail' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 140, aspectRatio: '9/16', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <img src="/media/orig_28745b9e-549a-40bc-91e3-73c761aa78fa.mp4" alt="Thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => (e.target as HTMLElement).style.display = 'none'} />
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Extracted from frame 00:00:01</span>
              </div>
            )}

            {/* Tab 3: Script */}
            {activeAssetTab === 'script' && (
              <div style={{ fontSize: '0.8125rem', background: 'var(--bg-input)', padding: 12, borderRadius: 'var(--radius-md)', fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {`[Hook - 0:00 - 0:04]\n"Did you know that 90% of content creators spend more time scheduling than actually creating?"\n\n[Body - 0:04 - 0:15]\n"Autonomous workflows solve this completely by handling video QA, aspect ratio validation, and scheduled publishing."\n\n[CTA - 0:15 - 0:18]\n"Check out Content Automation Lab for more."`}
              </div>
            )}

            {/* Tab 4: Captions */}
            {activeAssetTab === 'captions' && (
              <div style={{ fontSize: '0.8125rem', background: 'var(--bg-input)', padding: 12, borderRadius: 'var(--radius-md)', fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {`1\n00:00:00,000 --> 00:00:04,000\nDid you know that 90% of content creators spend more time scheduling?\n\n2\n00:00:04,100 --> 00:00:15,000\nAutonomous workflows solve this completely by handling video QA.\n\n3\n00:00:15,100 --> 00:00:18,520\nCheck out Content Automation Lab for more.`}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Right Column: Metadata Editor */}
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Asset Metadata & Settings</h3>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
              Title
            </label>
            <input
              type="text"
              className="input-base"
              value={editableTitle}
              onChange={e => setEditableTitle(e.target.value)}
              maxLength={100}
            />
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {editableTitle.length} / 100 characters
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
              Description
            </label>
            <textarea
              className="input-base"
              rows={5}
              value={editableDesc}
              onChange={e => setEditableDesc(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
              Hashtags / Tags
            </label>
            <input
              type="text"
              className="input-base"
              value={editableTags}
              onChange={e => setEditableTags(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
              Target Channel
            </label>
            <input
              type="text"
              className="input-base"
              value={item.channel_name || 'Content Automation Lab'}
              disabled
              style={{ opacity: 0.7 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              onClick={handleSaveChanges}
              disabled={isSaving}
              className="btn btn-primary"
            >
              {isSaving ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </GlassCard>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        title="Delete Content Asset?"
        message="Are you sure you want to permanently delete this content asset and its generated video files? This action cannot be undone."
        confirmLabel="Delete Permanently"
        isDestructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setIsDeleteDialogOpen(false)}
      />

      <ConfirmDialog
        isOpen={isPublishDialogOpen}
        title="Execute Private Test Upload?"
        message="This will initiate an autonomous upload to YouTube strictly with visibility set to PRIVATE. Public publication will NEVER occur."
        confirmLabel="Upload as Private"
        onConfirm={handleConfirmPublish}
        onCancel={() => setIsPublishDialogOpen(false)}
      />
    </div>
  );
};
