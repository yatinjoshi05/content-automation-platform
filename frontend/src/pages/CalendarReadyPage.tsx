import React, { useState } from 'react';
import { Schedule, Publication } from '../types';
import { Calendar, Clock, CheckCircle, AlertCircle, X } from '../components/Icons';

type CalendarReadyPageProps = {
  schedules: Schedule[];
  publications: Publication[];
  onReschedule: (payload: { content_id: string; platform: string; scheduled_at: string }) => Promise<void>;
  isLoading: boolean;
};

export const CalendarReadyPage: React.FC<CalendarReadyPageProps> = ({
  schedules,
  publications,
  onReschedule,
  isLoading
}) => {
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [newDate, setNewDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const openRescheduleModal = (item: Schedule) => {
    setSelectedSchedule(item);
    setRescheduleError(null);
    // Default to tomorrow at the same time
    const d = new Date(item.scheduled_at);
    d.setDate(d.getDate() + 1);
    setNewDate(d.toISOString().slice(0, 16));
  };

  const submitReschedule = async () => {
    if (!selectedSchedule || !newDate) return;
    setIsSubmitting(true);
    setRescheduleError(null);
    try {
      const isoDate = new Date(newDate).toISOString();
      await onReschedule({
        content_id: selectedSchedule.content_id,
        platform: selectedSchedule.platform,
        scheduled_at: isoDate
      });
      setSelectedSchedule(null);
    } catch (err: any) {
      setRescheduleError(err.message || 'Reschedule failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="calendar-page">
      {rescheduleError && (
        <div className="alert-banner alert-danger">
          <AlertCircle size={18} />
          <span>{rescheduleError}</span>
        </div>
      )}

      {/* Overview Intro */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Publication Calendar & Ready Queue</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Approved content queued for publication windows. Slots are generated according to channel cadence and preferred windows.
        </p>
      </div>

      <div className="grid-2" style={{ marginBottom: '1.75rem' }}>
        {/* Ready / Scheduled Content Table */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header">
            <h3 className="card-title">
              <Clock size={18} color="var(--accent-primary)" />
              Scheduled Queue ({schedules.length})
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ordered by publication window</span>
          </div>

          {isLoading ? (
            <div className="loading-spinner" />
          ) : schedules.length === 0 ? (
            <div className="empty-state">
              <Calendar className="empty-icon" />
              <div className="empty-title">Ready Queue Is Empty</div>
              <div className="empty-desc">
                Approved content will appear here with assigned publishing time slots according to channel rules.
              </div>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Target Date & Time</th>
                    <th>Channel</th>
                    <th>Platform</th>
                    <th>Status</th>
                    <th>Hook / Title</th>
                    <th>Attempts</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.schedule_id}>
                      <td style={{ fontWeight: 600 }}>
                        {new Date(s.scheduled_at).toLocaleString()}
                      </td>
                      <td>{s.channel_name || 'Primary'}</td>
                      <td>
                        <span className="badge badge-info">{s.platform}</span>
                      </td>
                      <td>
                        <span className={`badge ${
                          s.status === 'published' ? 'badge-success' :
                          s.status === 'failed' ? 'badge-danger' : 'badge-warning'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.hook_text || 'Approved Short'}
                      </td>
                      <td>{s.publication_attempts}</td>
                      <td>
                        {s.status === 'pending' && (
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => openRescheduleModal(s)}
                          >
                            Reschedule
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Publications Audit Log Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <CheckCircle size={18} color="var(--status-success)" />
            Publication Log & Reconciliation
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Historical records</span>
        </div>

        {publications.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem 1rem' }}>
            <div className="empty-title">No Publications Recorded Yet</div>
            <div className="empty-desc">
              Published videos will be recorded here with platform IDs and reconciliation status.
            </div>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Channel</th>
                  <th>Post ID</th>
                  <th>Status</th>
                  <th>Published Time</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {publications.map((p) => (
                  <tr key={p.id}>
                    <td><span className="badge badge-info">{p.platform}</span></td>
                    <td>{p.channel_name || 'Default'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.platform_post_id || '-'}</td>
                    <td>
                      <span className={`badge ${p.status === 'published' ? 'badge-success' : 'badge-danger'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td>{p.published_at ? new Date(p.published_at).toLocaleString() : '-'}</td>
                    <td style={{ color: 'var(--status-danger)', fontSize: '0.8rem' }}>{p.error || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reschedule Modal */}
      {selectedSchedule && (
        <div className="modal-overlay" onClick={() => setSelectedSchedule(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Reschedule Publishing Time</h3>
              <button
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setSelectedSchedule(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div><strong>Platform:</strong> {selectedSchedule.platform}</div>
              <div><strong>Current Schedule:</strong> {new Date(selectedSchedule.scheduled_at).toLocaleString()}</div>
            </div>

            <div className="form-group">
              <label className="form-label">New Date & Time:</label>
              <input
                type="datetime-local"
                className="form-input"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setSelectedSchedule(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submitReschedule} disabled={isSubmitting}>
                {isSubmitting ? 'Updating...' : 'Save New Time'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
