import React from 'react';
import { useRouter } from '../../utils/router';

interface AppSidebarProps {
  unfoldable: boolean;
  onToggleUnfoldable: () => void;
  showMobile: boolean;
  onCloseMobile: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  unfoldable,
  onToggleUnfoldable,
  showMobile,
  onCloseMobile
}) => {
  const { currentPath, navigate } = useRouter();

  const isNavActive = (path: string) => {
    if (path === '/' && (currentPath === '/' || currentPath === '/dashboard')) return true;
    return currentPath === path;
  };

  const handleNav = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    navigate(path);
    if (showMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {showMobile && (
        <div
          className="sidebar-backdrop fade show d-lg-none"
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1025
          }}
        ></div>
      )}

      <div
        className={`sidebar sidebar-fixed border-end ${unfoldable ? 'sidebar-narrow-unfoldable' : ''} ${showMobile ? 'show' : ''}`}
        data-coreui-theme="dark"
        style={{
          width: unfoldable ? '4rem' : '16rem',
          transition: 'width 0.2s ease-in-out, transform 0.2s ease-in-out',
          zIndex: 1030
        }}
      >
        {/* BRAND HEADER */}
        <div className="sidebar-header border-bottom d-flex align-items-center justify-content-between px-3" style={{ height: '56px' }}>
          <a
            href="#/dashboard"
            onClick={e => handleNav(e, '/dashboard')}
            className="sidebar-brand text-decoration-none d-flex align-items-center gap-2 text-white"
          >
            {/* CoreUI Hexagon Sygnet Logo */}
            <svg width="30" height="30" viewBox="0 0 102 115" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M96 24.124 57 1.608a12 12 0 0 0-12 0L6 24.124a12.034 12.034 0 0 0-6 10.393V79.55a12.033 12.033 0 0 0 6 10.392l39 22.517a12 12 0 0 0 12 0l39-22.517a12.033 12.033 0 0 0 6-10.392V34.517a12.034 12.034 0 0 0-6-10.393ZM94 79.55a4 4 0 0 1-2 3.464l-39 22.517a4 4 0 0 1-4 0L10 83.014a4 4 0 0 1-2-3.464V34.517a4 4 0 0 1 2-3.464L49 8.536a4 4 0 0 1 4 0l39 22.517a4 4 0 0 1 2 3.464V79.55Z"
                fill="currentColor"
              />
              <path
                d="M74.022 70.071h-2.866a4 4 0 0 0-1.925.494L51.95 80.05 32 68.531V45.554l19.95-11.519 17.29 9.455a4 4 0 0 0 1.919.49h2.863a2 2 0 0 0 2-2v-2.71a2 2 0 0 0-1.04-1.756L55.793 27.02a8.04 8.04 0 0 0-7.843.09L28 38.626a8.025 8.025 0 0 0-4 6.929V68.53a8 8 0 0 0 4 6.928l19.95 11.519a8.043 8.043 0 0 0 7.843.088l19.19-10.532a2 2 0 0 0 1.038-1.753v-2.71a2 2 0 0 0-2-2Z"
                fill="currentColor"
              />
            </svg>
            {!unfoldable && (
              <div className="d-flex flex-column">
                <span className="fw-bold tracking-wide" style={{ fontSize: '0.95rem', letterSpacing: '0.04em' }}>
                  CONTENT AUTO
                </span>
                <span className="text-secondary" style={{ fontSize: '0.68rem', letterSpacing: '0.02em' }}>
                  COMMAND CENTER
                </span>
              </div>
            )}
          </a>
          <button
            type="button"
            className="btn-close btn-close-white d-lg-none"
            aria-label="Close"
            onClick={onCloseMobile}
          ></button>
        </div>

        {/* SIDEBAR NAVIGATION */}
        <ul className="sidebar-nav list-unstyled mb-0 py-2" style={{ overflowY: 'auto', flexGrow: 1 }}>
          {/* SECTION: COMMAND CENTER */}
          <li className="nav-item">
            <a
              href="#/dashboard"
              className={`nav-link d-flex align-items-center ${isNavActive('/dashboard') ? 'active' : ''}`}
              onClick={e => handleNav(e, '/dashboard')}
            >
              <i className="nav-icon cil-speedometer me-3 fs-5"></i>
              {!unfoldable && <span>Overview Dashboard</span>}
              {!unfoldable && <span className="badge bg-success ms-auto text-white">LIVE</span>}
            </a>
          </li>

          {/* SECTION: CONTENT OPERATIONS */}
          {!unfoldable && <li className="nav-title text-uppercase px-3 py-2 small fw-semibold text-secondary">CONTENT OPERATIONS</li>}

          <li className="nav-item">
            <a
              href="#/create"
              className={`nav-link d-flex align-items-center ${isNavActive('/create') ? 'active' : ''}`}
              onClick={e => handleNav(e, '/create')}
            >
              <i className="nav-icon cil-pencil me-3 fs-5"></i>
              {!unfoldable && <span>Content Pipeline</span>}
            </a>
          </li>

          <li className="nav-item">
            <a
              href="#/library"
              className={`nav-link d-flex align-items-center ${isNavActive('/library') ? 'active' : ''}`}
              onClick={e => handleNav(e, '/library')}
            >
              <i className="nav-icon cil-media-play me-3 fs-5"></i>
              {!unfoldable && <span>Content Library</span>}
              {!unfoldable && <span className="badge bg-primary ms-auto text-white">50</span>}
            </a>
          </li>

          <li className="nav-item">
            <a
              href="#/publishing"
              className={`nav-link d-flex align-items-center ${isNavActive('/publishing') ? 'active' : ''}`}
              onClick={e => handleNav(e, '/publishing')}
            >
              <i className="nav-icon cil-send me-3 fs-5"></i>
              {!unfoldable && <span>Publishing Queue</span>}
              {!unfoldable && <span className="badge bg-warning ms-auto text-dark">6 Review</span>}
            </a>
          </li>

          {/* SECTION: AI & AUTOMATION */}
          {!unfoldable && <li className="nav-title text-uppercase px-3 py-2 small fw-semibold text-secondary">AI &amp; AUTOMATION</li>}

          <li className="nav-item">
            <a
              href="#/models"
              className={`nav-link d-flex align-items-center ${isNavActive('/models') ? 'active' : ''}`}
              onClick={e => handleNav(e, '/models')}
            >
              <i className="nav-icon cil-cpu me-3 fs-5"></i>
              {!unfoldable && <span>AI Provider Control</span>}
              {!unfoldable && <span className="badge bg-info-subtle text-info border border-info ms-auto">P10/P15</span>}
            </a>
          </li>

          <li className="nav-item">
            <a
              href="#/jobs"
              className={`nav-link d-flex align-items-center ${isNavActive('/jobs') ? 'active' : ''}`}
              onClick={e => handleNav(e, '/jobs')}
            >
              <i className="nav-icon cil-task me-3 fs-5"></i>
              {!unfoldable && <span>Workflow Jobs</span>}
              {!unfoldable && <span className="badge bg-secondary-subtle text-secondary ms-auto">33</span>}
            </a>
          </li>

          <li className="nav-item">
            <a
              href="#/integrations"
              className={`nav-link d-flex align-items-center ${isNavActive('/integrations') ? 'active' : ''}`}
              onClick={e => handleNav(e, '/integrations')}
            >
              <i className="nav-icon cil-link me-3 fs-5"></i>
              {!unfoldable && <span>Integrations</span>}
            </a>
          </li>

          {/* SECTION: ANALYTICS & REVENUE */}
          {!unfoldable && <li className="nav-title text-uppercase px-3 py-2 small fw-semibold text-secondary">ANALYTICS &amp; REVENUE</li>}

          <li className="nav-item">
            <a
              href="#/analytics"
              className={`nav-link d-flex align-items-center ${isNavActive('/analytics') ? 'active' : ''}`}
              onClick={e => handleNav(e, '/analytics')}
            >
              <i className="nav-icon cil-chart-line me-3 fs-5"></i>
              {!unfoldable && <span>Performance Analytics</span>}
            </a>
          </li>

          {/* SECTION: SYSTEM & AUDIT */}
          {!unfoldable && <li className="nav-title text-uppercase px-3 py-2 small fw-semibold text-secondary">SYSTEM &amp; AUDIT</li>}

          <li className="nav-item">
            <a
              href="#/logs"
              className={`nav-link d-flex align-items-center ${isNavActive('/logs') ? 'active' : ''}`}
              onClick={e => handleNav(e, '/logs')}
            >
              <i className="nav-icon cil-notes me-3 fs-5"></i>
              {!unfoldable && <span>System Logs</span>}
            </a>
          </li>

          <li className="nav-item">
            <a
              href="#/settings"
              className={`nav-link d-flex align-items-center ${isNavActive('/settings') ? 'active' : ''}`}
              onClick={e => handleNav(e, '/settings')}
            >
              <i className="nav-icon cil-settings me-3 fs-5"></i>
              {!unfoldable && <span>Settings &amp; Channels</span>}
            </a>
          </li>
        </ul>

        {/* SIDEBAR FOOTER (COLLAPSE TOGGLER) */}
        <div className="sidebar-footer border-top d-none d-lg-flex justify-content-end p-2">
          <button
            type="button"
            className="sidebar-toggler"
            title="Toggle Sidebar Width"
            onClick={onToggleUnfoldable}
            style={{
              width: '100%',
              height: '35px',
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer'
            }}
          >
            <i className={`cil-chevron-${unfoldable ? 'right' : 'left'}`}></i>
          </button>
        </div>
      </div>
    </>
  );
};
