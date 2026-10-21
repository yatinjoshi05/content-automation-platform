import React, { useState } from 'react';
import { ChartComponent } from '../ui/ChartComponent';
import { useRouter } from '../../utils/router';

export interface OperationalKPIWidgetsProps {
  stats: {
    jobs: { queued: number; running: number; completed: number; failed: number; total: number };
    approvals: { awaiting: number; approved: number; rejected: number };
    active_channels: number;
  };
  className?: string;
}

export const OperationalKPIWidgets: React.FC<OperationalKPIWidgetsProps> = ({
  stats,
  className = 'mb-4'
}) => {
  const { navigate } = useRouter();
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);

  const toggleDropdown = (index: number) => {
    setOpenDropdown(prev => (prev === index ? null : index));
  };

  const chartOptionsCommon = {
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true }
    },
    maintainAspectRatio: false,
    scales: {
      x: { display: false, grid: { display: false } },
      y: { display: false, grid: { display: false } }
    },
    elements: {
      line: { borderWidth: 1.5, tension: 0.4 },
      point: { radius: 3, hitRadius: 10, hoverRadius: 4 }
    }
  };

  const inFlightCount = stats.jobs.queued + stats.jobs.running;

  return (
    <div className={`row g-4 ${className}`}>
      {/* 1. TOTAL CONTENT JOBS (PURPLE #5856d6) */}
      <div className="col-sm-6 col-xl-3">
        <div className="card text-white shadow-sm position-relative overflow-hidden" style={{ backgroundColor: '#5856d6' }}>
          <div className="card-body pb-0 d-flex justify-content-between align-items-start">
            <div>
              <div className="fs-4 fw-bold">
                {stats.jobs.total}{' '}
                <span className="fs-6 fw-normal opacity-75">
                  ({stats.jobs.completed} completed)
                </span>
              </div>
              <div className="text-white-50 small">Total Content Jobs</div>
            </div>
            <div className="dropdown">
              <button
                type="button"
                className="btn btn-transparent text-white p-0 shadow-none border-0"
                onClick={() => toggleDropdown(1)}
                aria-expanded={openDropdown === 1}
              >
                <i className="cil-options"></i>
              </button>
              {openDropdown === 1 && (
                <ul className="dropdown-menu dropdown-menu-end show" style={{ position: 'absolute', inset: '0px 0px auto auto', transform: 'translate(0px, 28px)' }}>
                  <li><button className="dropdown-item" type="button" onClick={() => { setOpenDropdown(null); navigate('/library'); }}>Open Library</button></li>
                  <li><button className="dropdown-item" type="button" onClick={() => { setOpenDropdown(null); navigate('/create'); }}>Create New Script</button></li>
                </ul>
              )}
            </div>
          </div>
          <div className="mt-3 mx-3" style={{ height: '70px' }}>
            <ChartComponent
              type="line"
              data={{
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [
                  {
                    label: 'Jobs Generated',
                    backgroundColor: 'transparent',
                    borderColor: 'rgba(255,255,255,.55)',
                    pointBackgroundColor: '#5856d6',
                    pointBorderColor: '#fff',
                    data: [12, 18, 24, 20, 28, 30, stats.jobs.total]
                  }
                ]
              }}
              options={chartOptionsCommon}
            />
          </div>
        </div>
      </div>

      {/* 2. IN-FLIGHT PIPELINE QUEUE (BLUE #3399ff) */}
      <div className="col-sm-6 col-xl-3">
        <div className="card text-white shadow-sm position-relative overflow-hidden" style={{ backgroundColor: '#3399ff' }}>
          <div className="card-body pb-0 d-flex justify-content-between align-items-start">
            <div>
              <div className="fs-4 fw-bold">
                {inFlightCount}{' '}
                <span className="fs-6 fw-normal opacity-75">
                  ({stats.jobs.running} running, {stats.jobs.queued} queued)
                </span>
              </div>
              <div className="text-white-50 small">Jobs In Flight</div>
            </div>
            <div className="dropdown">
              <button
                type="button"
                className="btn btn-transparent text-white p-0 shadow-none border-0"
                onClick={() => toggleDropdown(2)}
                aria-expanded={openDropdown === 2}
              >
                <i className="cil-options"></i>
              </button>
              {openDropdown === 2 && (
                <ul className="dropdown-menu dropdown-menu-end show" style={{ position: 'absolute', inset: '0px 0px auto auto', transform: 'translate(0px, 28px)' }}>
                  <li><button className="dropdown-item" type="button" onClick={() => { setOpenDropdown(null); navigate('/jobs'); }}>View Job Queue</button></li>
                  <li><a className="dropdown-item" href="http://localhost:5678" target="_blank" rel="noreferrer">Open n8n Workflows</a></li>
                </ul>
              )}
            </div>
          </div>
          <div className="mt-3 mx-3" style={{ height: '70px' }}>
            <ChartComponent
              type="line"
              data={{
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [
                  {
                    label: 'Queue Size',
                    backgroundColor: 'transparent',
                    borderColor: 'rgba(255,255,255,.55)',
                    pointBackgroundColor: '#3399ff',
                    pointBorderColor: '#fff',
                    data: [5, 12, 8, 15, 22, 19, inFlightCount]
                  }
                ]
              }}
              options={chartOptionsCommon}
            />
          </div>
        </div>
      </div>

      {/* 3. APPROVAL GATE (GOLD/WARNING #f9b115) */}
      <div className="col-sm-6 col-xl-3">
        <div className="card text-white shadow-sm position-relative overflow-hidden" style={{ backgroundColor: '#f9b115' }}>
          <div className="card-body pb-0 d-flex justify-content-between align-items-start">
            <div>
              <div className="fs-4 fw-bold">
                {stats.approvals.awaiting}{' '}
                <span className="fs-6 fw-normal opacity-75">
                  ({stats.approvals.approved} approved)
                </span>
              </div>
              <div className="text-white-50 small">Pending Human Approval</div>
            </div>
            <div className="dropdown">
              <button
                type="button"
                className="btn btn-transparent text-white p-0 shadow-none border-0"
                onClick={() => toggleDropdown(3)}
                aria-expanded={openDropdown === 3}
              >
                <i className="cil-options"></i>
              </button>
              {openDropdown === 3 && (
                <ul className="dropdown-menu dropdown-menu-end show" style={{ position: 'absolute', inset: '0px 0px auto auto', transform: 'translate(0px, 28px)' }}>
                  <li><button className="dropdown-item" type="button" onClick={() => { setOpenDropdown(null); navigate('/publishing'); }}>Review Pending Gate</button></li>
                </ul>
              )}
            </div>
          </div>
          <div className="mt-3" style={{ height: '70px' }}>
            <ChartComponent
              type="line"
              data={{
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [
                  {
                    label: 'Pending Approvals',
                    backgroundColor: 'rgba(255,255,255,.2)',
                    borderColor: 'rgba(255,255,255,.55)',
                    data: [2, 4, 3, 5, 8, 4, stats.approvals.awaiting],
                    fill: true
                  }
                ]
              }}
              options={{
                ...chartOptionsCommon,
                elements: {
                  line: { borderWidth: 2, tension: 0.4 },
                  point: { radius: 0 }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* 4. FAILED / BLOCKED JOBS (RED #e55353) */}
      <div className="col-sm-6 col-xl-3">
        <div className="card text-white shadow-sm position-relative overflow-hidden" style={{ backgroundColor: '#e55353' }}>
          <div className="card-body pb-0 d-flex justify-content-between align-items-start">
            <div>
              <div className="fs-4 fw-bold">
                {stats.jobs.failed}{' '}
                <span className="fs-6 fw-normal opacity-75">
                  {stats.jobs.failed === 0 ? '(Optimal: 0)' : 'Unhandled'}
                </span>
              </div>
              <div className="text-white-50 small">Failed or Blocked Jobs</div>
            </div>
            <div className="dropdown">
              <button
                type="button"
                className="btn btn-transparent text-white p-0 shadow-none border-0"
                onClick={() => toggleDropdown(4)}
                aria-expanded={openDropdown === 4}
              >
                <i className="cil-options"></i>
              </button>
              {openDropdown === 4 && (
                <ul className="dropdown-menu dropdown-menu-end show" style={{ position: 'absolute', inset: '0px 0px auto auto', transform: 'translate(0px, 28px)' }}>
                  <li><button className="dropdown-item" type="button" onClick={() => { setOpenDropdown(null); navigate('/jobs'); }}>Inspect Error Logs</button></li>
                </ul>
              )}
            </div>
          </div>
          <div className="mt-3 mx-3" style={{ height: '70px' }}>
            <ChartComponent
              type="bar"
              data={{
                labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'],
                datasets: [
                  {
                    label: 'Failures',
                    backgroundColor: 'rgba(255,255,255,.25)',
                    borderColor: 'rgba(255,255,255,.55)',
                    data: [0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, stats.jobs.failed],
                    barPercentage: 0.6
                  }
                ]
              }}
              options={chartOptionsCommon}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
