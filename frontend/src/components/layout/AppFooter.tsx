import React from 'react';

export const AppFooter: React.FC = () => {
  return (
    <footer className="footer border-top px-4 py-3 bg-body-tertiary d-flex flex-wrap justify-content-between align-items-center small text-body-secondary">
      <div>
        <a href="https://coreui.io" target="_blank" rel="noopener noreferrer" className="text-decoration-none fw-semibold text-body">
          CoreUI
        </a>{' '}
        <span>© 2026 creativeLabs.</span>
      </div>
      <div>
        <span>Powered by </span>
        <a href="https://coreui.io/react" target="_blank" rel="noopener noreferrer" className="text-decoration-none fw-semibold text-body">
          CoreUI React Admin &amp; Dashboard Template
        </a>
      </div>
    </footer>
  );
};
