// API client for communication with the Backend-for-Frontend (BFF) server

const API_BASE = '/api';

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }
    return data as T;
  } catch (err: any) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
}

// API Methods
export const api = {
  getStatus: () => fetchApi<any>('/status'),
  getOverview: () => fetchApi<any>('/overview'),
  getJobs: (status?: string, type?: string) => {
    const query = new URLSearchParams();
    if (status) query.append('status', status);
    if (type) query.append('type', type);
    return fetchApi<any>(`/jobs?${query.toString()}`);
  },
  retryJob: (jobId: string) => fetchApi<any>(`/jobs/${jobId}/retry`, { method: 'POST' }),
  getContent: () => fetchApi<any>('/content'),
  getApprovals: (status?: string) => fetchApi<any>(`/approvals?status=${status || 'awaiting_approval'}`),
  submitApprovalDecision: (approvalId: string, decision: {
    action: 'approve' | 'reject' | 'edit' | 'regenerate';
    by?: string;
    comments?: string;
    per_platform?: any;
    version?: number;
  }) => fetchApi<any>(`/approvals/${approvalId}/decision`, {
    method: 'POST',
    body: JSON.stringify(decision)
  }),
  getSchedules: () => fetchApi<any>('/schedules'),
  rescheduleContent: (payload: { content_id: string; platform: string; scheduled_at: string }) => fetchApi<any>('/schedules/reschedule', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getWorkflows: () => fetchApi<any>('/workflows'),
  getAnalytics: () => fetchApi<any>('/analytics'),
  getSettings: () => fetchApi<any>('/settings'),
  updateSetting: (key: string, value: any) => fetchApi<any>('/settings', {
    method: 'POST',
    body: JSON.stringify({ key, value })
  }),
  getChannels: () => fetchApi<any>('/channels'),
  saveChannel: (channel: any) => fetchApi<any>('/channels', {
    method: 'POST',
    body: JSON.stringify(channel)
  })
};
