import React, { useState } from 'react';
import { ChartComponent } from '../ui/ChartComponent';

export const MainChart: React.FC = () => {
  const [period, setPeriod] = useState<'Day' | 'Month' | 'Year'>('Month');

  const progressExample = [
    { title: 'Visits', value: '29.703 Users', percent: 40, color: 'bg-success' },
    { title: 'Unique', value: '24.093 Users', percent: 20, color: 'bg-info' },
    { title: 'Pageviews', value: '78.706 Views', percent: 60, color: 'bg-warning' },
    { title: 'New Users', value: '22.123 Users', percent: 80, color: 'bg-danger' },
    { title: 'Bounce Rate', value: 'Average Rate', percent: 40.15, color: 'bg-primary' }
  ];

  return (
    <div className="card mb-4 shadow-sm border">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h4 id="traffic" className="card-title mb-0 fw-semibold">
              Traffic
            </h4>
            <div className="small text-body-secondary">October 2025 - April 2026</div>
          </div>
          <div className="d-none d-md-flex align-items-center">
            <div className="btn-group me-3" role="group">
              {(['Day', 'Month', 'Year'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  className={`btn btn-sm btn-outline-secondary ${period === value ? 'active bg-secondary text-white' : ''}`}
                  onClick={() => setPeriod(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              style={{ backgroundColor: '#5856d6', borderColor: '#5856d6' }}
              title="Download Data"
            >
              <i className="cil-cloud-download"></i>
            </button>
          </div>
        </div>

        <div style={{ height: '300px', marginTop: '30px' }}>
          <ChartComponent
            type="line"
            data={{
              labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
              datasets: [
                {
                  label: 'Traffic Volume',
                  backgroundColor: 'rgba(51, 153, 255, 0.1)',
                  borderColor: '#3399ff',
                  pointHoverBackgroundColor: '#3399ff',
                  borderWidth: 2,
                  data: [165, 159, 140, 151, 184, 195, 140],
                  fill: true,
                  tension: 0.4
                },
                {
                  label: 'Visits',
                  backgroundColor: 'transparent',
                  borderColor: '#2eb85c',
                  pointHoverBackgroundColor: '#2eb85c',
                  borderWidth: 2,
                  data: [95, 130, 160, 110, 90, 85, 115],
                  tension: 0.4
                },
                {
                  label: 'Target Baseline',
                  backgroundColor: 'transparent',
                  borderColor: '#e55353',
                  pointHoverBackgroundColor: '#e55353',
                  borderWidth: 1,
                  borderDash: [8, 5],
                  data: [65, 65, 65, 65, 65, 65, 65]
                }
              ]
            }}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
              },
              scales: {
                x: {
                  grid: {
                    color: 'rgba(0, 0, 0, 0.05)',
                    drawOnChartArea: true
                  },
                  ticks: {
                    color: '#6c757d'
                  }
                },
                y: {
                  beginAtZero: true,
                  max: 250,
                  grid: {
                    color: 'rgba(0, 0, 0, 0.05)'
                  },
                  ticks: {
                    color: '#6c757d',
                    stepSize: 50
                  }
                }
              },
              elements: {
                line: { tension: 0.4 },
                point: { radius: 0, hitRadius: 10, hoverRadius: 4 }
              }
            }}
          />
        </div>
      </div>

      {/* FOOTER SUMMARY METRICS */}
      <div className="card-footer bg-body-tertiary border-top py-3">
        <div className="row text-center gy-3">
          {progressExample.map((item, index) => (
            <div key={index} className="col-sm-6 col-md-4 col-xl">
              <div className="text-body-secondary small">{item.title}</div>
              <div className="fw-semibold text-truncate fs-6 my-1">
                {item.value} ({item.percent}%)
              </div>
              <div className="progress progress-thin" style={{ height: '4px' }}>
                <div
                  className={`progress-bar ${item.color}`}
                  role="progressbar"
                  style={{ width: `${item.percent}%` }}
                  aria-valuenow={item.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
