import React, { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { useTheme } from '../utils/theme';
import { useToast } from '../components/ui/Toast';
import {
  Settings as SettingsIcon,
  Moon,
  Sun,
  HardDrive,
  ShieldCheck,
  CheckCircle,
  Database,
  Calendar,
  Plus
} from '../components/Icons';
import { Setting, Channel } from '../types';
import { api } from '../utils/api';

interface SettingsPageProps {
  settings: Setting[];
  channels: Channel[];
  onRefresh: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  channels,
  onRefresh
}) => {
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();

  const getVal = (key: string, def: string) => {
    const s = settings.find(x => x.key === key);
    if (!s || s.value === undefined || s.value === null) return def;
    return typeof s.value === 'string' ? s.value : JSON.stringify(s.value).replace(/^"|"$/g, '');
  };

  const [timezone, setTimezone] = useState(getVal('timezone', 'Asia/Kolkata'));
  const [minFreeDiskGb, setMinFreeDiskGb] = useState(getVal('min_free_disk_gb', '8.0'));
  const [maxConcurrentVideoJobs, setMaxConcurrentVideoJobs] = useState(getVal('max_concurrent_video_jobs', '1'));
  const [notifyEmail, setNotifyEmail] = useState(getVal('notify_email', 'admin@contentauto.internal'));
  const [isSaving, setIsSaving] = useState(false);

  // Channel Creation State
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelAutonomy, setNewChannelAutonomy] = useState<'automatic' | 'manual'>('manual');
  const [newChannelThreshold, setNewChannelThreshold] = useState('7.5');
  const [isSavingChannel, setIsSavingChannel] = useState(false);

  useEffect(() => {
    setTimezone(getVal('timezone', 'Asia/Kolkata'));
    setMinFreeDiskGb(getVal('min_free_disk_gb', '8.0'));
    setMaxConcurrentVideoJobs(getVal('max_concurrent_video_jobs', '1'));
    setNotifyEmail(getVal('notify_email', 'admin@contentauto.internal'));
  }, [settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await Promise.all([
        api.updateSetting('timezone', timezone),
        api.updateSetting('min_free_disk_gb', parseFloat(minFreeDiskGb) || 8.0),
        api.updateSetting('max_concurrent_video_jobs', parseInt(maxConcurrentVideoJobs, 10) || 1),
        api.updateSetting('notify_email', notifyEmail)
      ]);
      toast.success('Settings Saved', 'Application preferences persisted to PostgreSQL.');
      onRefresh();
    } catch (err: any) {
      toast.error('Save Failed', err.message || 'Error updating settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) {
      toast.error('Validation Error', 'Channel name is required.');
      return;
    }
    setIsSavingChannel(true);
    try {
      await api.saveChannel({
        name: newChannelName.trim(),
        platforms: ['youtube'],
        autonomy_mode: newChannelAutonomy,
        quality_threshold: parseFloat(newChannelThreshold) || 7.5
      });
      toast.success('Channel Created', `Added '${newChannelName}' to managed channels.`);
      setNewChannelName('');
      onRefresh();
    } catch (err: any) {
      toast.error('Channel Creation Failed', err.message || 'Error creating channel');
    } finally {
      setIsSavingChannel(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960 }}>
      <Breadcrumbs items={[{ label: 'Studio', href: '/dashboard' }, { label: 'Settings & Preferences' }]} />

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Application Preferences & Configuration</h1>
          <p className="page-subtitle">
            Local engine parameters, storage limits, and channel autonomy modes.
          </p>
        </div>
      </div>

      {/* Theme & Display Preferences */}
      <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>Interface Theme</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
              Active Appearance: {theme === 'dark' ? 'Dark Slate & Red Glow' : 'Light Contrast'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Dark mode is the primary production theme. Light mode provides high-contrast daylight visibility.
            </div>
          </div>
          <button onClick={toggleTheme} className="btn btn-secondary btn-sm">
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            Toggle {theme === 'dark' ? 'Light' : 'Dark'} Mode
          </button>
        </div>
      </GlassCard>

      {/* Engine & Operational Settings Form */}
      <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>Studio Engine Settings</h3>

        <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="grid-2">
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
                Studio Timezone
              </label>
              <input
                type="text"
                className="input-base"
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                Used by Workflow 10 publishing cron schedules.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
                Alert Notification Email
              </label>
              <input
                type="email"
                className="input-base"
                value={notifyEmail}
                onChange={e => setNotifyEmail(e.target.value)}
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                Target recipient for Workflow 15 failure alerts.
              </span>
            </div>
          </div>

          <div className="grid-2">
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
                Min Free Disk Safeguard (GB)
              </label>
              <input
                type="number"
                step="0.5"
                className="input-base"
                value={minFreeDiskGb}
                onChange={e => setMinFreeDiskGb(e.target.value)}
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                Heavy rendering blocks if Drive D: drops below this threshold.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6 }}>
                Max Concurrent Video Jobs
              </label>
              <input
                type="number"
                min="1"
                max="4"
                className="input-base"
                value={maxConcurrentVideoJobs}
                onChange={e => setMaxConcurrentVideoJobs(e.target.value)}
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                Prevent local GPU/CPU saturation during video rendering.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="submit" disabled={isSaving} className="btn btn-primary">
              {isSaving ? 'Persisting...' : 'Save Engine Settings'}
            </button>
          </div>
        </form>
      </GlassCard>

      {/* Channel Management */}
      <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>Managed Channels & Autonomy Modes</h3>

        {/* Existing channels list */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Channel Name</th>
                <th>Platforms</th>
                <th>Autonomy Mode</th>
                <th>Quality Gate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {channels.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                    No channels registered.
                  </td>
                </tr>
              ) : (
                channels.map(ch => (
                  <tr key={ch.id}>
                    <td style={{ fontWeight: 600 }}>{ch.name}</td>
                    <td>
                      <span style={{ textTransform: 'capitalize' }}>
                        {Array.isArray(ch.platforms) ? ch.platforms.join(', ') : 'youtube'}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                        {ch.autonomy_mode}
                      </span>
                    </td>
                    <td>{ch.quality_threshold || 7.5} / 10</td>
                    <td>
                      <span className="badge badge-success">Active</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Add Channel Form */}
        <form onSubmit={handleCreateChannel} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>
              Add Channel Name
            </label>
            <input
              type="text"
              className="input-base"
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)}
              placeholder="e.g. AI Trends Daily"
            />
          </div>

          <div style={{ width: 140 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>
              Autonomy
            </label>
            <select
              className="input-base"
              value={newChannelAutonomy}
              onChange={e => setNewChannelAutonomy(e.target.value as any)}
            >
              <option value="manual">Manual Gate</option>
              <option value="automatic">Auto (No Gate)</option>
            </select>
          </div>

          <div style={{ width: 120 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>
              Min Score
            </label>
            <input
              type="number"
              step="0.1"
              min="5.0"
              max="9.9"
              className="input-base"
              value={newChannelThreshold}
              onChange={e => setNewChannelThreshold(e.target.value)}
            />
          </div>

          <button type="submit" disabled={isSavingChannel} className="btn btn-secondary">
            <Plus size={14} /> Add Channel
          </button>
        </form>
      </GlassCard>
    </div>
  );
};
