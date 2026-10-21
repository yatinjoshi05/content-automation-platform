import React from 'react';

interface UserRecord {
  avatar: string;
  status: 'success' | 'danger' | 'warning' | 'secondary';
  name: string;
  isNew: boolean;
  registered: string;
  country: string;
  flagIcon: string;
  usagePercent: number;
  usagePeriod: string;
  usageColor: string;
  paymentIcon: string;
  activity: string;
}

export const TrafficAndSales: React.FC = () => {
  const progressGroup1 = [
    { title: 'Monday', val1: 34, val2: 78 },
    { title: 'Tuesday', val1: 56, val2: 94 },
    { title: 'Wednesday', val1: 12, val2: 67 },
    { title: 'Thursday', val1: 43, val2: 91 },
    { title: 'Friday', val1: 22, val2: 73 },
    { title: 'Saturday', val1: 53, val2: 82 },
    { title: 'Sunday', val1: 9, val2: 69 }
  ];

  const channelGroup = [
    { title: 'Organic Search', icon: 'cib-google', percent: 56, value: '191,235' },
    { title: 'ChatGPT', icon: 'cib-apple', percent: 15, value: '51,223' },
    { title: 'Twitter', icon: 'cib-twitter', percent: 11, value: '37,564' },
    { title: 'LinkedIn', icon: 'cib-linkedin', percent: 8, value: '27,319' }
  ];

  const users: UserRecord[] = [
    {
      avatar: '/assets/avatars/1.jpg',
      status: 'success',
      name: 'Yiorgos Avraamu',
      isNew: true,
      registered: 'Mar 15, 2025',
      country: 'USA',
      flagIcon: 'cif-us',
      usagePercent: 50,
      usagePeriod: 'Mar 1, 2026 - Apr 30, 2026',
      usageColor: 'bg-success',
      paymentIcon: 'cib-cc-mastercard',
      activity: '10 sec ago'
    },
    {
      avatar: '/assets/avatars/2.jpg',
      status: 'danger',
      name: 'Avram Tarasios',
      isNew: false,
      registered: 'Aug 22, 2024',
      country: 'Brazil',
      flagIcon: 'cif-br',
      usagePercent: 22,
      usagePeriod: 'Jan 15, 2026 - Feb 14, 2026',
      usageColor: 'bg-info',
      paymentIcon: 'cib-cc-visa',
      activity: '5 minutes ago'
    },
    {
      avatar: '/assets/avatars/3.jpg',
      status: 'warning',
      name: 'Quintin Ed',
      isNew: true,
      registered: 'Nov 7, 2024',
      country: 'India',
      flagIcon: 'cif-in',
      usagePercent: 74,
      usagePeriod: 'Feb 10, 2026 - Mar 11, 2026',
      usageColor: 'bg-warning',
      paymentIcon: 'cib-cc-stripe',
      activity: '1 hour ago'
    },
    {
      avatar: '/assets/avatars/4.jpg',
      status: 'secondary',
      name: 'Enéas Kwadwo',
      isNew: true,
      registered: 'Jan 30, 2025',
      country: 'France',
      flagIcon: 'cif-fr',
      usagePercent: 98,
      usagePeriod: 'Apr 1, 2026 - Apr 30, 2026',
      usageColor: 'bg-danger',
      paymentIcon: 'cib-cc-paypal',
      activity: 'Last month'
    },
    {
      avatar: '/assets/avatars/5.jpg',
      status: 'success',
      name: 'Agapetus Tadeáš',
      isNew: true,
      registered: 'Jun 12, 2024',
      country: 'Spain',
      flagIcon: 'cif-es',
      usagePercent: 22,
      usagePeriod: 'Mar 20, 2026 - Apr 19, 2026',
      usageColor: 'bg-primary',
      paymentIcon: 'cib-cc-apple-pay',
      activity: 'Last week'
    },
    {
      avatar: '/assets/avatars/6.jpg',
      status: 'danger',
      name: 'Friderik Dávid',
      isNew: true,
      registered: 'Dec 3, 2025',
      country: 'Poland',
      flagIcon: 'cif-pl',
      usagePercent: 43,
      usagePeriod: 'Apr 5, 2026 - May 4, 2026',
      usageColor: 'bg-success',
      paymentIcon: 'cib-cc-amex',
      activity: 'Last week'
    }
  ];

  return (
    <div className="card mb-4 shadow-sm border">
      <div className="card-header bg-body-tertiary fw-semibold">
        Traffic {' & '} Sales
      </div>
      <div className="card-body">
        {/* ROW 1: MINI STATS AND BARS */}
        <div className="row g-4 mb-4">
          {/* LEFT COLUMN: CLIENTS & DAY-OF-WEEK BARS */}
          <div className="col-12 col-md-6 border-end-md">
            <div className="row g-3 mb-3">
              <div className="col-6">
                <div className="border-start border-4 border-info py-1 px-3">
                  <div className="text-body-secondary text-truncate small">New Clients</div>
                  <div className="fs-5 fw-semibold text-body">9,123</div>
                </div>
              </div>
              <div className="col-6">
                <div className="border-start border-4 border-danger py-1 px-3">
                  <div className="text-body-secondary text-truncate small">Recurring Clients</div>
                  <div className="fs-5 fw-semibold text-body">22,643</div>
                </div>
              </div>
            </div>
            <hr className="my-3 text-secondary-emphasis" />
            <div className="d-flex flex-column gap-3">
              {progressGroup1.map((item, idx) => (
                <div key={idx} className="progress-group">
                  <div className="d-flex justify-content-between mb-1">
                    <span className="text-body-secondary small">{item.title}</span>
                    <span className="fw-semibold small">{item.val1}% / {item.val2}%</span>
                  </div>
                  <div className="d-flex flex-column gap-1">
                    <div className="progress progress-thin" style={{ height: '4px' }}>
                      <div className="progress-bar bg-info" style={{ width: `${item.val1}%` }}></div>
                    </div>
                    <div className="progress progress-thin" style={{ height: '4px' }}>
                      <div className="progress-bar bg-danger" style={{ width: `${item.val2}%` }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN: PAGEVIEWS, GENDER, AND ORGANIC CHANNELS */}
          <div className="col-12 col-md-6">
            <div className="row g-3 mb-3">
              <div className="col-6">
                <div className="border-start border-4 border-warning py-1 px-3">
                  <div className="text-body-secondary text-truncate small">Pageviews</div>
                  <div className="fs-5 fw-semibold text-body">78,623</div>
                </div>
              </div>
              <div className="col-6">
                <div className="border-start border-4 border-success py-1 px-3">
                  <div className="text-body-secondary text-truncate small">Organic</div>
                  <div className="fs-5 fw-semibold text-body">49,123</div>
                </div>
              </div>
            </div>
            <hr className="my-3 text-secondary-emphasis" />

            {/* GENDER BREAKDOWN */}
            <div className="mb-4">
              <div className="progress-group mb-3">
                <div className="d-flex align-items-center mb-1">
                  <i className="cil-user me-2 text-warning fs-5"></i>
                  <span className="small text-body-secondary">Male</span>
                  <span className="ms-auto fw-semibold small">53%</span>
                </div>
                <div className="progress progress-thin" style={{ height: '4px' }}>
                  <div className="progress-bar bg-warning" style={{ width: '53%' }}></div>
                </div>
              </div>
              <div className="progress-group">
                <div className="d-flex align-items-center mb-1">
                  <i className="cil-user-female me-2 text-warning fs-5"></i>
                  <span className="small text-body-secondary">Female</span>
                  <span className="ms-auto fw-semibold small">43%</span>
                </div>
                <div className="progress progress-thin" style={{ height: '4px' }}>
                  <div className="progress-bar bg-warning" style={{ width: '43%' }}></div>
                </div>
              </div>
            </div>

            {/* CHANNELS */}
            <div className="d-flex flex-column gap-3">
              {channelGroup.map((item, idx) => (
                <div key={idx} className="progress-group">
                  <div className="d-flex align-items-center mb-1">
                    <i className={`${item.icon} me-2 text-success fs-5`}></i>
                    <span className="small text-body-secondary">{item.title}</span>
                    <span className="ms-auto fw-semibold small">
                      {item.value} <span className="text-body-secondary font-monospace">({item.percent}%)</span>
                    </span>
                  </div>
                  <div className="progress progress-thin" style={{ height: '4px' }}>
                    <div className="progress-bar bg-success" style={{ width: `${item.percent}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ROW 2: USER ACTIVITY TABLE */}
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 border">
            <thead className="table-light text-nowrap">
              <tr>
                <th className="bg-body-tertiary text-center" style={{ width: '50px' }}>
                  <i className="cil-people fs-5"></i>
                </th>
                <th className="bg-body-tertiary">User</th>
                <th className="bg-body-tertiary text-center" style={{ width: '80px' }}>Country</th>
                <th className="bg-body-tertiary">Usage</th>
                <th className="bg-body-tertiary text-center" style={{ width: '120px' }}>Payment Method</th>
                <th className="bg-body-tertiary" style={{ width: '140px' }}>Activity</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item, index) => (
                <tr key={index}>
                  <td className="text-center">
                    <div className="position-relative d-inline-block">
                      <img
                        src={item.avatar}
                        alt={item.name}
                        className="rounded-circle"
                        width="40"
                        height="40"
                        style={{ objectFit: 'cover' }}
                      />
                      <span
                        className={`position-absolute bottom-0 end-0 p-1 bg-${item.status} border border-white rounded-circle`}
                        style={{ transform: 'translate(20%, 20%)' }}
                      ></span>
                    </div>
                  </td>
                  <td>
                    <div className="fw-semibold text-body">{item.name}</div>
                    <div className="small text-body-secondary text-nowrap">
                      <span>{item.isNew ? 'New' : 'Recurring'}</span> | Registered: {item.registered}
                    </div>
                  </td>
                  <td className="text-center">
                    <i className={`${item.flagIcon} fs-3`} title={item.country}></i>
                  </td>
                  <td>
                    <div className="d-flex justify-content-between text-nowrap mb-1">
                      <div className="fw-semibold small">{item.usagePercent}%</div>
                      <div className="ms-3 small text-body-secondary">{item.usagePeriod}</div>
                    </div>
                    <div className="progress progress-thin" style={{ height: '4px' }}>
                      <div
                        className={`progress-bar ${item.usageColor}`}
                        role="progressbar"
                        style={{ width: `${item.usagePercent}%` }}
                        aria-valuenow={item.usagePercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      ></div>
                    </div>
                  </td>
                  <td className="text-center">
                    <i className={`${item.paymentIcon} fs-2 text-body`}></i>
                  </td>
                  <td>
                    <div className="small text-body-secondary text-nowrap">Last login</div>
                    <div className="fw-semibold text-nowrap small text-body">{item.activity}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
