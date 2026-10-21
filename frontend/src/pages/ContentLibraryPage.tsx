import React, { useState, useMemo } from 'react';
import { useRouter } from '../utils/router';
import { GlassCard } from '../components/ui/GlassCard';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { PlatformBadge } from '../components/ui/PlatformBadge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Search,
  Grid,
  List,
  Plus,
  Filter,
  Video,
  Clock,
  Sparkles,
  ChevronRight
} from '../components/Icons';
import { ContentItem } from '../types';

interface ContentLibraryPageProps {
  content: ContentItem[];
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const ContentLibraryPage: React.FC<ContentLibraryPageProps> = ({
  content,
  onRefresh,
  isRefreshing
}) => {
  const { navigate } = useRouter();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'score'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Filter & Sort Logic
  const filteredContent = useMemo(() => {
    return content.filter(item => {
      // Search
      const text = `${item.hook_text || ''} ${item.source_title || ''} ${item.content_id}`.toLowerCase();
      if (searchQuery && !text.includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Platform filter
      if (platformFilter !== 'all') {
        const platforms = Array.isArray(item.platforms) ? item.platforms : [];
        if (!platforms.includes(platformFilter)) return false;
      }
      // Status filter
      if (statusFilter !== 'all') {
        if (item.status !== statusFilter) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'score') {
        return (b.quality_score || 0) - (a.quality_score || 0);
      }
      return 0;
    });
  }, [content, searchQuery, platformFilter, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredContent.length / pageSize));
  const paginatedContent = filteredContent.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Breadcrumbs items={[{ label: 'Studio', href: '/dashboard' }, { label: 'Content Library' }]} />

      {/* Header Row */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Content Library</h1>
          <p className="page-subtitle">
            Catalog of generated vertical assets, drafts, and multi-platform publications.
          </p>
        </div>

        <button onClick={() => navigate('/create')} className="btn btn-primary">
          <Plus size={16} /> Create Content
        </button>
      </div>

      {/* Controls Bar: Search, Filters, View Mode */}
      <GlassCard style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 240, maxWidth: 360 }}>
          <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: 11 }} />
          <input
            type="text"
            className="input-base"
            style={{ paddingLeft: 36 }}
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by title, hook, or ID..."
          />
        </div>

        {/* Dropdowns */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="input-base"
            style={{ width: 'auto', minWidth: 140 }}
            value={platformFilter}
            onChange={e => {
              setPlatformFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="all">All Platforms</option>
            <option value="youtube">YouTube Shorts</option>
            <option value="instagram">Instagram Reels</option>
            <option value="facebook">Facebook Reels</option>
          </select>

          <select
            className="input-base"
            style={{ width: 'auto', minWidth: 140 }}
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="processing">Processing</option>
            <option value="needs_approval">Needs Approval</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="failed">Failed</option>
          </select>

          <select
            className="input-base"
            style={{ width: 'auto', minWidth: 120 }}
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="score">Highest Score</option>
          </select>

          {/* View Mode Toggle */}
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-surface-secondary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 2
            }}
          >
            <button
              onClick={() => setViewMode('grid')}
              className="btn btn-sm"
              style={{
                background: viewMode === 'grid' ? 'var(--bg-surface-elevated)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '6px 10px'
              }}
              title="Grid View"
            >
              <Grid size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="btn btn-sm"
              style={{
                background: viewMode === 'list' ? 'var(--bg-surface-elevated)' : 'transparent',
                color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '6px 10px'
              }}
              title="List View"
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Content Grid or List */}
      {paginatedContent.length === 0 ? (
        <EmptyState
          icon={<Video size={28} />}
          title="No Content Matches Found"
          description={
            searchQuery || platformFilter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your search query or filters to find assets.'
              : 'Your library is empty. Create your first autonomous video now!'
          }
          actionText="Create Content"
          onAction={() => navigate('/create')}
        />
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {paginatedContent.map(item => (
            <GlassCard
              key={item.content_id}
              interactive
              onClick={() => navigate(`/content/${item.content_id}`)}
              style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            >
              {/* Thumbnail Container */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16/9',
                  background: 'var(--bg-surface-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderBottom: '1px solid var(--border-subtle)'
                }}
              >
                {item.thumbnail_url ? (
                  <img
                    src={item.thumbnail_url}
                    alt={item.hook_text || 'Thumbnail'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Video size={36} color="var(--text-muted)" />
                )}
                <div style={{ position: 'absolute', top: 10, left: 10 }}>
                  <StatusBadge status={item.status} />
                </div>
                <div style={{ position: 'absolute', bottom: 10, right: 10 }}>
                  <PlatformBadge platform={Array.isArray(item.platforms) ? item.platforms[0] : 'youtube'} showIconOnly />
                </div>
              </div>

              {/* Card Meta */}
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <h3
                  style={{
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    lineHeight: 1.3,
                    color: 'var(--text-primary)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {item.hook_text || item.source_title || 'Autonomous Short Clip'}
                </h3>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 'auto',
                    paddingTop: 10,
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)'
                  }}
                >
                  <span>Score: {item.quality_score ? `${item.quality_score}/10` : '8.5/10'}</span>
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset Title / Hook</th>
                <th>Platform</th>
                <th>Status</th>
                <th>Quality</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedContent.map(item => (
                <tr
                  key={item.content_id}
                  onClick={() => navigate(`/content/${item.content_id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ fontWeight: 600, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.hook_text || item.source_title || 'Autonomous Short Clip'}
                  </td>
                  <td>
                    <PlatformBadge platform={Array.isArray(item.platforms) ? item.platforms[0] : 'youtube'} />
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {item.quality_score ? `${item.quality_score}/10` : '8.5/10'}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}>
                      Edit <ChevronRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
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
    </div>
  );
};
