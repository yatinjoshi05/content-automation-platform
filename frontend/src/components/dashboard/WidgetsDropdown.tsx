import React, { useState } from 'react';
import { ChartComponent } from '../ui/ChartComponent';

export const WidgetsDropdown: React.FC<{ className?: string }> = ({ className = 'mb-4' }) => {
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
      x: {
        display: false,
        grid: { display: false }
      },
      y: {
        display: false,
        grid: { display: false }
      }
    },
    elements: {
      line: {
        borderWidth: 1.5,
        tension: 0.4
      },
      point: {
        radius: 4,
        hitRadius: 10,
        hoverRadius: 5
      }
    }
  };

  return (
    <div className={`row g-4 ${className}`}>
      {/* 1. USERS WIDGET (PRIMARY PURPLE #5856d6) */}
      <div className="col-sm-6 col-xl-3">
        <div className="card text-white bg-primary position-relative overflow-hidden shadow-sm" style={{ backgroundColor: '#5856d6' }}>
          <div className="card-body pb-0 d-flex justify-content-between align-items-start">
            <div>
              <div className="fs-4 fw-semibold">
                26K{' '}
                <span className="fs-6 fw-normal">
                  (-12.4% <i className="cil-arrow-bottom small"></i>)
                </span>
              </div>
              <div className="text-white-50 small">Users</div>
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
                <ul className="dropdown-menu dropdown-menu-end show" style={{ position: 'absolute', inset: '0px 0px auto auto', margin: '0px', transform: 'translate(0px, 28px)' }}>
                  <li><button className="dropdown-item" type="button" onClick={() => setOpenDropdown(null)}>Action</button></li>
                  <li><button className="dropdown-item" type="button" onClick={() => setOpenDropdown(null)}>Another action</button></li>
                  <li><button className="dropdown-item" type="button" onClick={() => setOpenDropdown(null)}>Something else here...</button></li>
                  <li><hr className="dropdown-divider" /></li>
                  <li><button className="dropdown-item disabled" type="button">Disabled action</button></li>
                </ul>
              )}
            </div>
          </div>
          <div className="mt-3 mx-3" style={{ height: '70px' }}>
            <ChartComponent
              type="line"
              data={{
                labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
                datasets: [
                  {
                    label: 'Users',
                    backgroundColor: 'transparent',
                    borderColor: 'rgba(255,255,255,.55)',
                    pointBackgroundColor: '#5856d6',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    data: [65, 59, 84, 84, 51, 55, 40]
                  }
                ]
              }}
              options={{
                ...chartOptionsCommon,
                scales: {
                  ...chartOptionsCommon.scales,
                  y: { min: 30, max: 89, display: false }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. INCOME WIDGET (INFO CYAN/BLUE #3399ff) */}
      <div className="col-sm-6 col-xl-3">
        <div className="card text-white bg-info position-relative overflow-hidden shadow-sm" style={{ backgroundColor: '#3399ff' }}>
          <div className="card-body pb-0 d-flex justify-content-between align-items-start">
            <div>
              <div className="fs-4 fw-semibold">
                $6.200{' '}
                <span className="fs-6 fw-normal">
                  (40.9% <i className="cil-arrow-top small"></i>)
                </span>
              </div>
              <div className="text-white-50 small">Income</div>
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
                <ul className="dropdown-menu dropdown-menu-end show" style={{ position: 'absolute', inset: '0px 0px auto auto', margin: '0px', transform: 'translate(0px, 28px)' }}>
                  <li><button className="dropdown-item" type="button" onClick={() => setOpenDropdown(null)}>Action</button></li>
                  <li><button className="dropdown-item" type="button" onClick={() => setOpenDropdown(null)}>Another action</button></li>
                  <li><button className="dropdown-item" type="button" onClick={() => setOpenDropdown(null)}>Something else here...</button></li>
                  <li><hr className="dropdown-divider" /></li>
                  <li><button className="dropdown-item disabled" type="button">Disabled action</button></li>
                </ul>
              )}
            </div>
          </div>
          <div className="mt-3 mx-3" style={{ height: '70px' }}>
            <ChartComponent
              type="line"
              data={{
                labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
                datasets: [
                  {
                    label: 'Income',
                    backgroundColor: 'transparent',
                    borderColor: 'rgba(255,255,255,.55)',
                    pointBackgroundColor: '#3399ff',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    data: [1, 18, 9, 17, 34, 22, 11]
                  }
                ]
              }}
              options={{
                ...chartOptionsCommon,
                scales: {
                  ...chartOptionsCommon.scales,
                  y: { min: -9, max: 39, display: false }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* 3. CONVERSION RATE WIDGET (WARNING GOLD #f9b115) */}
      <div className="col-sm-6 col-xl-3">
        <div className="card text-white bg-warning position-relative overflow-hidden shadow-sm" style={{ backgroundColor: '#f9b115' }}>
          <div className="card-body pb-0 d-flex justify-content-between align-items-start">
            <div>
              <div className="fs-4 fw-semibold">
                2.49%{' '}
                <span className="fs-6 fw-normal">
                  (84.7% <i className="cil-arrow-top small"></i>)
                </span>
              </div>
              <div className="text-white-50 small">Conversion Rate</div>
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
                <ul className="dropdown-menu dropdown-menu-end show" style={{ position: 'absolute', inset: '0px 0px auto auto', margin: '0px', transform: 'translate(0px, 28px)' }}>
                  <li><button className="dropdown-item" type="button" onClick={() => setOpenDropdown(null)}>Action</button></li>
                  <li><button className="dropdown-item" type="button" onClick={() => setOpenDropdown(null)}>Another action</button></li>
                  <li><button className="dropdown-item" type="button" onClick={() => setOpenDropdown(null)}>Something else here...</button></li>
                  <li><hr className="dropdown-divider" /></li>
                  <li><button className="dropdown-item disabled" type="button">Disabled action</button></li>
                </ul>
              )}
            </div>
          </div>
          <div className="mt-3" style={{ height: '70px' }}>
            <ChartComponent
              type="line"
              data={{
                labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
                datasets: [
                  {
                    label: 'Conversion Rate',
                    backgroundColor: 'rgba(255,255,255,.2)',
                    borderColor: 'rgba(255,255,255,.55)',
                    data: [78, 81, 80, 45, 34, 12, 40],
                    fill: true
                  }
                ]
              }}
              options={{
                ...chartOptionsCommon,
                elements: {
                  line: { borderWidth: 2, tension: 0.4 },
                  point: { radius: 0, hitRadius: 10, hoverRadius: 4 }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* 4. SESSIONS WIDGET (DANGER CORAL RED #e55353) */}
      <div className="col-sm-6 col-xl-3">
        <div className="card text-white bg-danger position-relative overflow-hidden shadow-sm" style={{ backgroundColor: '#e55353' }}>
          <div className="card-body pb-0 d-flex justify-content-between align-items-start">
            <div>
              <div className="fs-4 fw-semibold">
                44K{' '}
                <span className="fs-6 fw-normal">
                  (-23.6% <i className="cil-arrow-bottom small"></i>)
                </span>
              </div>
              <div className="text-white-50 small">Sessions</div>
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
                <ul className="dropdown-menu dropdown-menu-end show" style={{ position: 'absolute', inset: '0px 0px auto auto', margin: '0px', transform: 'translate(0px, 28px)' }}>
                  <li><button className="dropdown-item" type="button" onClick={() => setOpenDropdown(null)}>Action</button></li>
                  <li><button className="dropdown-item" type="button" onClick={() => setOpenDropdown(null)}>Another action</button></li>
                  <li><button className="dropdown-item" type="button" onClick={() => setOpenDropdown(null)}>Something else here...</button></li>
                  <li><hr className="dropdown-divider" /></li>
                  <li><button className="dropdown-item disabled" type="button">Disabled action</button></li>
                </ul>
              )}
            </div>
          </div>
          <div className="mt-3 mx-3" style={{ height: '70px' }}>
            <ChartComponent
              type="bar"
              data={{
                labels: [
                  '1', '2', '3', '4', '5', '6', '7', '8',
                  '9', '10', '11', '12', '13', '14', '15', '16'
                ],
                datasets: [
                  {
                    label: 'Sessions',
                    backgroundColor: 'rgba(255,255,255,.2)',
                    borderColor: 'rgba(255,255,255,.55)',
                    data: [78, 81, 80, 45, 34, 12, 40, 85, 65, 23, 12, 98, 34, 84, 67, 82],
                    barPercentage: 0.6
                  }
                ]
              }}
              options={{
                ...chartOptionsCommon,
                scales: {
                  x: { display: false },
                  y: { display: false }
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
