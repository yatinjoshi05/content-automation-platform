import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type RouteId =
  | 'home'
  | 'dashboard'
  | 'create'
  | 'library'
  | 'content-detail'
  | 'publishing'
  | 'jobs'
  | 'analytics'
  | 'models'
  | 'integrations'
  | 'logs'
  | 'settings';

export interface RouterContextValue {
  pathname: string;
  currentPath: string;
  routeId: RouteId;
  params: Record<string, string>;
  navigate: (path: string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function matchRoute(path: string): { routeId: RouteId; params: Record<string, string> } {
  const clean = path.split('?')[0].split('#')[0] || '/';

  if (clean === '/' || clean === '') {
    return { routeId: 'dashboard', params: {} };
  }
  if (clean === '/dashboard') {
    return { routeId: 'dashboard', params: {} };
  }
  if (clean === '/create') {
    return { routeId: 'create', params: {} };
  }
  if (clean === '/library') {
    return { routeId: 'library', params: {} };
  }
  if (clean.startsWith('/content/')) {
    const id = clean.replace('/content/', '').split('/')[0];
    return { routeId: 'content-detail', params: { id } };
  }
  if (clean === '/publishing') {
    return { routeId: 'publishing', params: {} };
  }
  if (clean === '/jobs') {
    return { routeId: 'jobs', params: {} };
  }
  if (clean === '/analytics') {
    return { routeId: 'analytics', params: {} };
  }
  if (clean === '/models') {
    return { routeId: 'models', params: {} };
  }
  if (clean === '/integrations') {
    return { routeId: 'integrations', params: {} };
  }
  if (clean === '/logs') {
    return { routeId: 'logs', params: {} };
  }
  if (clean === '/settings') {
    return { routeId: 'settings', params: {} };
  }

  return { routeId: 'dashboard', params: {} };
}

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pathname, setPathname] = useState<string>(
    typeof window !== 'undefined' ? window.location.pathname || '/' : '/'
  );

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (window.location.pathname !== to) {
      window.history.pushState(null, '', to);
      setPathname(to);
      window.scrollTo(0, 0);
    }
  }, []);

  const { routeId, params } = matchRoute(pathname);

  return (
    <RouterContext.Provider value={{ pathname, currentPath: pathname, routeId, params, navigate }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = (): RouterContextValue => {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useRouter must be used within RouterProvider');
  }
  return ctx;
};

export const Link: React.FC<{
  href: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}> = ({ href, children, className = '', style, onClick }) => {
  const { navigate } = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onClick) onClick();
    navigate(href);
  };

  return (
    <a href={href} onClick={handleClick} className={className} style={style}>
      {children}
    </a>
  );
};
