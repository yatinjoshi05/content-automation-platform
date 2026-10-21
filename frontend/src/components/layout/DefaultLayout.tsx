import React, { useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { AppFooter } from './AppFooter';

export interface DefaultLayoutProps {
  children: React.ReactNode;
}

export const DefaultLayout: React.FC<DefaultLayoutProps> = ({ children }) => {
  const [unfoldable, setUnfoldable] = useState(false);
  const [showMobile, setShowMobile] = useState(false);

  return (
    <div className="min-vh-100 d-flex flex-column bg-body-tertiary">
      {/* SIDEBAR */}
      <AppSidebar
        unfoldable={unfoldable}
        onToggleUnfoldable={() => setUnfoldable(prev => !prev)}
        showMobile={showMobile}
        onCloseMobile={() => setShowMobile(false)}
      />

      {/* MAIN WRAPPER */}
      <div
        className="wrapper d-flex flex-column min-vh-100"
        style={{
          paddingLeft: '0px',
          marginLeft: '0px',
          transition: 'margin-left 0.2s ease-in-out',
          minHeight: '100vh'
        }}
      >
        <style>{`
          @media (min-width: 992px) {
            .wrapper {
              margin-left: ${unfoldable ? '4rem' : '16rem'} !important;
            }
          }
        `}</style>

        {/* HEADER */}
        <AppHeader onToggleSidebarMobile={() => setShowMobile(prev => !prev)} />

        {/* BODY CONTENT */}
        <main className="body flex-grow-1 px-4 pb-4">
          <div className="container-fluid p-0">
            {children}
          </div>
        </main>

        {/* FOOTER */}
        <AppFooter />
      </div>
    </div>
  );
};
