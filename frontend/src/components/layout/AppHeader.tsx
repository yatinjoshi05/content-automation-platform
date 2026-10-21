import React, { useState, useEffect } from 'react';
import { useRouter } from '../../utils/router';
import { useTheme } from '../../utils/theme';

interface AppHeaderProps {
  onToggleSidebarMobile: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onToggleSidebarMobile }) => {
  const { currentPath, navigate } = useRouter();
  const { theme, setTheme } = useTheme();

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Synchronize CoreUI data-coreui-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-coreui-theme', theme);
  }, [theme]);

  // Keyboard shortcut Ctrl+/ or Ctrl+K to open search modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.key === 'k')) {
        e.preventDefault();
        setSearchModalOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getBreadcrumbTitle = () => {
    switch (currentPath) {
      case '/':
      case '/dashboard':
        return 'Dashboard';
      case '/create':
        return 'Create Content';
      case '/library':
        return 'Content Library';
      case '/publishing':
        return 'Publishing Queue';
      case '/jobs':
        return 'Workflow Jobs';
      case '/analytics':
        return 'Analytics & Performance';
      case '/models':
        return 'Model Router';
      case '/integrations':
        return 'Platform Integrations';
      case '/logs':
        return 'System Logs';
      case '/settings':
        return 'Settings & Configuration';
      default:
        return 'Dashboard';
    }
  };

  return (
    <header className="header header-sticky p-0 mb-4 bg-body border-bottom" style={{ zIndex: 1020 }}>
      {/* TOP NAVBAR CONTAINER */}
      <div className="container-fluid border-bottom px-4 d-flex align-items-center" style={{ minHeight: '56px' }}>
        {/* HAMBURGER TOGGLE */}
        <button
          className="header-toggler border-0 bg-transparent p-0 me-3 text-body"
          type="button"
          onClick={onToggleSidebarMobile}
          aria-label="Toggle navigation"
        >
          <i className="cil-menu fs-4"></i>
        </button>

        {/* SEARCH TRIGGER */}
        <div
          className="d-flex align-items-center bg-body-tertiary px-3 py-1 rounded-pill border cursor-pointer me-auto"
          style={{ cursor: 'pointer', maxWidth: '240px' }}
          onClick={() => setSearchModalOpen(true)}
        >
          <i className="cil-magnifying-glass me-2 text-body-secondary small"></i>
          <span className="text-body-secondary small me-4">Search</span>
          <span className="badge bg-secondary-subtle text-secondary small py-1 px-2 font-monospace">
            Ctrl /
          </span>
        </div>

        {/* RIGHT NAVBAR CONTROLS */}
        <ul className="header-nav d-flex align-items-center list-unstyled mb-0 gap-3">
          {/* NOTIFICATION ICONS */}
          <li className="nav-item">
            <button className="nav-link border-0 bg-transparent text-body p-1 position-relative" title="Notifications">
              <i className="cil-bell fs-5"></i>
              <span className="position-absolute top-0 start-100 translate-middle p-1 bg-danger border border-light rounded-circle"></span>
            </button>
          </li>
          <li className="nav-item">
            <button className="nav-link border-0 bg-transparent text-body p-1" title="Tasks">
              <i className="cil-list fs-5"></i>
            </button>
          </li>
          <li className="nav-item">
            <button className="nav-link border-0 bg-transparent text-body p-1" title="Messages">
              <i className="cil-envelope-open fs-5"></i>
            </button>
          </li>

          {/* DIVIDER */}
          <li className="nav-item py-1">
            <div className="vr h-100 mx-1 text-body-secondary"></div>
          </li>

          {/* THEME SWITCHER DROPDOWN */}
          <li className="nav-item position-relative">
            <button
              className="nav-link border-0 bg-transparent text-body p-1 dropdown-toggle shadow-none"
              type="button"
              onClick={() => setThemeDropdownOpen(prev => !prev)}
              aria-expanded={themeDropdownOpen}
              title="Toggle Theme"
            >
              <i className={`cil-${theme === 'dark' ? 'moon' : 'sun'} fs-5`}></i>
            </button>
            {themeDropdownOpen && (
              <ul
                className="dropdown-menu dropdown-menu-end show shadow"
                style={{ position: 'absolute', inset: '0px 0px auto auto', transform: 'translate(0px, 36px)' }}
              >
                <li>
                  <button
                    className={`dropdown-item d-flex align-items-center ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => {
                      setTheme('light');
                      setThemeDropdownOpen(false);
                    }}
                  >
                    <i className="cil-sun me-2"></i> Light
                  </button>
                </li>
                <li>
                  <button
                    className={`dropdown-item d-flex align-items-center ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => {
                      setTheme('dark');
                      setThemeDropdownOpen(false);
                    }}
                  >
                    <i className="cil-moon me-2"></i> Dark
                  </button>
                </li>
                <li>
                  <button
                    className="dropdown-item d-flex align-items-center"
                    onClick={() => {
                      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                      setTheme(prefersDark ? 'dark' : 'light');
                      setThemeDropdownOpen(false);
                    }}
                  >
                    <i className="cil-contrast me-2"></i> Auto
                  </button>
                </li>
              </ul>
            )}
          </li>

          {/* DIVIDER */}
          <li className="nav-item py-1">
            <div className="vr h-100 mx-1 text-body-secondary"></div>
          </li>

          {/* USER AVATAR DROPDOWN */}
          <li className="nav-item position-relative">
            <div
              className="d-flex align-items-center cursor-pointer"
              style={{ cursor: 'pointer' }}
              onClick={() => setUserDropdownOpen(prev => !prev)}
            >
              <div className="position-relative">
                <img
                  src="/assets/avatars/1.jpg"
                  alt="Admin"
                  className="rounded-circle"
                  width="36"
                  height="36"
                  style={{ objectFit: 'cover' }}
                />
                <span
                  className="position-absolute bottom-0 end-0 p-1 bg-success border border-white rounded-circle"
                  style={{ transform: 'translate(15%, 15%)' }}
                ></span>
              </div>
            </div>

            {userDropdownOpen && (
              <ul
                className="dropdown-menu dropdown-menu-end show shadow py-2"
                style={{ position: 'absolute', inset: '0px 0px auto auto', transform: 'translate(0px, 44px)', minWidth: '220px' }}
              >
                <li className="dropdown-header text-uppercase text-body-secondary small fw-bold px-3 py-1">Account</li>
                <li>
                  <button className="dropdown-item d-flex align-items-center px-3 py-1" onClick={() => setUserDropdownOpen(false)}>
                    <i className="cil-bell me-2 small"></i> Updates
                    <span className="badge bg-info ms-auto text-white">42</span>
                  </button>
                </li>
                <li>
                  <button className="dropdown-item d-flex align-items-center px-3 py-1" onClick={() => setUserDropdownOpen(false)}>
                    <i className="cil-envelope-open me-2 small"></i> Messages
                    <span className="badge bg-success ms-auto text-white">7</span>
                  </button>
                </li>
                <li>
                  <button className="dropdown-item d-flex align-items-center px-3 py-1" onClick={() => setUserDropdownOpen(false)}>
                    <i className="cil-task me-2 small"></i> Tasks
                    <span className="badge bg-danger ms-auto text-white">3</span>
                  </button>
                </li>
                <li><hr className="dropdown-divider my-2" /></li>
                <li className="dropdown-header text-uppercase text-body-secondary small fw-bold px-3 py-1">Settings</li>
                <li>
                  <button
                    className="dropdown-item d-flex align-items-center px-3 py-1"
                    onClick={() => {
                      setUserDropdownOpen(false);
                      navigate('/settings');
                    }}
                  >
                    <i className="cil-user me-2 small"></i> Profile & Engine
                  </button>
                </li>
                <li>
                  <button className="dropdown-item d-flex align-items-center px-3 py-1" onClick={() => setUserDropdownOpen(false)}>
                    <i className="cil-lock-locked me-2 small"></i> Lock Account
                  </button>
                </li>
              </ul>
            )}
          </li>
        </ul>
      </div>

      {/* SUBHEADER BREADCRUMB BAR */}
      <div className="container-fluid px-4 py-2 bg-body-tertiary">
        <nav aria-label="breadcrumb">
          <ol className="breadcrumb my-0 small">
            <li className="breadcrumb-item">
              <a
                href="#/dashboard"
                onClick={e => {
                  e.preventDefault();
                  navigate('/dashboard');
                }}
                className="text-decoration-none"
              >
                Home
              </a>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              {getBreadcrumbTitle()}
            </li>
          </ol>
        </nav>
      </div>

      {/* SEARCH MODAL (COREUI MODAL DIALOG) */}
      {searchModalOpen && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg border">
              <div className="modal-header border-bottom py-3">
                <div className="input-group">
                  <span className="input-group-text bg-transparent border-0">
                    <i className="cil-magnifying-glass"></i>
                  </span>
                  <input
                    type="search"
                    className="form-control border-0 shadow-none fs-5"
                    placeholder="Search components, workflows, jobs..."
                    autoFocus
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setSearchModalOpen(false)}
                ></button>
              </div>
              <div className="modal-body p-3">
                <p className="text-body-secondary small mb-2 fw-semibold">Quick Destinations</p>
                <div className="list-group list-group-flush">
                  {[
                    { label: 'Dashboard Overview', path: '/dashboard', badge: 'Core' },
                    { label: 'Content Creation Studio', path: '/create', badge: 'Workflow' },
                    { label: 'Content Library & Videos', path: '/library', badge: 'Catalog' },
                    { label: 'Publishing & Approvals', path: '/publishing', badge: 'Gate' },
                    { label: 'Background Jobs & Workers', path: '/jobs', badge: 'Jobs' },
                    { label: 'Performance Analytics', path: '/analytics', badge: 'Metrics' },
                    { label: 'Settings & Credentials', path: '/settings', badge: 'System' }
                  ]
                    .filter(item => !searchQuery || item.label.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2"
                        onClick={() => {
                          setSearchModalOpen(false);
                          navigate(item.path);
                        }}
                      >
                        <span className="text-body">{item.label}</span>
                        <span className="badge bg-secondary-subtle text-secondary small">{item.badge}</span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
