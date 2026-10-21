import React from 'react';

export const DashboardBrand: React.FC<{ className?: string }> = ({ className = 'mb-4' }) => {
  return (
    <div className={`row g-4 ${className}`}>
      {/* 1. FACEBOOK */}
      <div className="col-sm-6 col-lg-4">
        <div className="card shadow-sm border overflow-hidden">
          <div
            className="card-header position-relative d-flex justify-content-center align-items-center py-4 border-0"
            style={{ backgroundColor: '#3b5998' }}
          >
            <i className="cib-facebook text-white" style={{ fontSize: '48px' }}></i>
          </div>
          <div className="card-body row text-center py-3 m-0">
            <div className="col border-end">
              <div className="fs-5 fw-semibold text-body">89k</div>
              <div className="text-uppercase text-body-secondary small">friends</div>
            </div>
            <div className="col">
              <div className="fs-5 fw-semibold text-body">459</div>
              <div className="text-uppercase text-body-secondary small">feeds</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. YOUTUBE */}
      <div className="col-sm-6 col-lg-4">
        <div className="card shadow-sm border overflow-hidden">
          <div
            className="card-header position-relative d-flex justify-content-center align-items-center py-4 border-0"
            style={{ backgroundColor: '#ff0132' }}
          >
            <i className="cib-youtube text-white" style={{ fontSize: '48px' }}></i>
          </div>
          <div className="card-body row text-center py-3 m-0">
            <div className="col border-end">
              <div className="fs-5 fw-semibold text-body">973k</div>
              <div className="text-uppercase text-body-secondary small">subscribers</div>
            </div>
            <div className="col">
              <div className="fs-5 fw-semibold text-body">1.792</div>
              <div className="text-uppercase text-body-secondary small">new comments</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. LINKEDIN */}
      <div className="col-sm-6 col-lg-4">
        <div className="card shadow-sm border overflow-hidden">
          <div
            className="card-header position-relative d-flex justify-content-center align-items-center py-4 border-0"
            style={{ backgroundColor: '#4875b4' }}
          >
            <i className="cib-linkedin text-white" style={{ fontSize: '48px' }}></i>
          </div>
          <div className="card-body row text-center py-3 m-0">
            <div className="col border-end">
              <div className="fs-5 fw-semibold text-body">500+</div>
              <div className="text-uppercase text-body-secondary small">contacts</div>
            </div>
            <div className="col">
              <div className="fs-5 fw-semibold text-body">292</div>
              <div className="text-uppercase text-body-secondary small">feeds</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
