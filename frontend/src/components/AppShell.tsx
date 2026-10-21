import React from 'react';
import { DefaultLayout } from './layout/DefaultLayout';

export interface AppShellProps {
  children: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  systemStatusOnline?: boolean;
  diskFreeGb?: number;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return <DefaultLayout>{children}</DefaultLayout>;
};

export default AppShell;
