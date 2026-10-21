import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from '../utils/router';
import { useTheme } from '../utils/theme';
import {
  Search,
  Bell,
  Moon,
  Sun,
  User,
  RefreshCw,
  X,
  ExternalLink,
  ChevronDown,
  LogOut,
  Settings,
  CheckCircle,
  AlertTriangle
} from './Icons';

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
  unreadNotifications?: number;
}

export const Header: React.FC<HeaderProps> = ({
  onRefresh,
  isRefreshing,
  unreadNotifications = 3
}) => {
  const { pathname, navigate } = useRouter();
  const { theme, toggleTheme } = useTheme();

  // Search Palette state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Dropdown states
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Global hotkey Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsNotificationOpen(false);
        setIsUserMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isSearchOpen]);

  // Quick search targets
  const searchResults = [
    { title: 'Dashboard Analytics', path: '/dashboard', type: 'Overview' },
    { title: 'Create Script & Video', path: '/create', type: 'Action' },
    { title: 'Content Library Assets', path: '/library', type: 'Library' },
    { title: 'Publishing Approvals Queue', path: '/publishing', type: 'Queue' },
    { title: 'Background Jobs Monitor', path: '/jobs', type: 'System' },
    { title: 'AI Model Router (Gemini & Groq)', path: '/models', type: 'Routing' },
    { title: 'Platform Integrations (YouTube, Meta)', path: '/integrations', type: 'Config' },
    { title: 'System Logs & Errors', path: '/logs', type: 'Audit' },
    { title: 'Application Preferences & Channels', path: '/settings', type: 'Settings' }
  ].filter(item =>
    searchQuery === '' ||
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <header className="app-header">
        {/* Global Search Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => setIsSearchOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '7px 14px',
              fontSize: '0.8125rem',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              minWidth: 260
            }}
          >
            <Search size={15} color="var(--text-muted)" />
            <span>Search workflows, assets, jobs...</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '0.6875rem',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)'
              }}
            >
              Ctrl K
            </span>
          </button>
        </div>

        {/* Right Action Icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Refresh Action */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="btn btn-ghost btn-sm"
            title="Refresh live data"
            style={{ padding: 8 }}
          >
            <RefreshCw
              size={16}
              className={isRefreshing ? 'icon-spin' : ''}
              style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}
            />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="btn btn-ghost btn-sm"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            style={{ padding: 8 }}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {/* Notifications Menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsNotificationOpen(prev => !prev)}
              className="btn btn-ghost btn-sm"
              style={{ position: 'relative', padding: 8 }}
              title="Notifications"
            >
              <Bell size={17} />
              {unreadNotifications > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-primary)',
                    boxShadow: '0 0 6px var(--accent-glow)'
                  }}
                />
              )}
            </button>

            {isNotificationOpen && (
              <div
                className="glass-card"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 320,
                  padding: 16,
                  zIndex: 100,
                  boxShadow: 'var(--shadow-lg)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Notifications</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                    {unreadNotifications} new
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8125rem' }}>
                  <div style={{ padding: '8px 10px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle size={13} color="var(--status-success)" /> Video QA Passed
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 2 }}>
                      orig_28745b9e vertical video verified for YouTube Shorts.
                    </div>
                  </div>
                  <div style={{ padding: '8px 10px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={13} color="var(--status-warning)" /> YouTube OAuth
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 2 }}>
                      Awaiting Google account login in n8n credential store.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User Account Menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsUserMenuOpen(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-default)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '0.8125rem'
                }}
              >
                AD
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                  Admin
                </span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  Studio Ops
                </span>
              </div>
              <ChevronDown size={14} color="var(--text-muted)" />
            </button>

            {isUserMenuOpen && (
              <div
                className="glass-card"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 200,
                  padding: 8,
                  zIndex: 100,
                  boxShadow: 'var(--shadow-lg)'
                }}
              >
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    navigate('/settings');
                  }}
                  className="btn-ghost"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    fontSize: '0.8125rem',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    textAlign: 'left'
                  }}
                >
                  <Settings size={15} /> Settings
                </button>
                <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    navigate('/');
                  }}
                  className="btn-ghost"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    fontSize: '0.8125rem',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    textAlign: 'left',
                    color: 'var(--text-muted)'
                  }}
                >
                  <LogOut size={15} /> Exit to Landing Page
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Command Palette / Search Modal */}
      {isSearchOpen && (
        <div className="modal-overlay" onClick={() => setIsSearchOpen(false)}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 540, padding: 0, overflow: 'hidden' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-default)'
              }}
            >
              <Search size={18} color="var(--text-muted)" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search workflows, content, channels..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.9375rem',
                  color: 'var(--text-primary)'
                }}
              />
              <button
                onClick={() => setIsSearchOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto', padding: 8 }}>
              {searchResults.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  No matching destinations found.
                </div>
              ) : (
                searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setIsSearchOpen(false);
                      navigate(item.path);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      color: 'var(--text-primary)',
                      transition: 'background var(--transition-fast)'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>{item.title}</span>
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-surface-elevated)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {item.type}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
