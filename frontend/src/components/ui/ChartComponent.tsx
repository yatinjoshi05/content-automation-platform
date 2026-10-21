import React, { useEffect, useRef } from 'react';

export interface ChartComponentProps {
  type: 'line' | 'bar' | 'doughnut' | 'pie';
  data: any;
  options: any;
  height?: string | number;
  width?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export const ChartComponent: React.FC<ChartComponentProps> = ({
  type,
  data,
  options,
  height,
  width,
  className,
  style
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const Chart = (window as any).Chart;
    if (!Chart) {
      console.warn('Chart.js not loaded on window.Chart');
      return;
    }

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    try {
      chartInstanceRef.current = new Chart(canvasRef.current, {
        type,
        data,
        options: {
          ...options,
          responsive: true,
          maintainAspectRatio: options?.maintainAspectRatio ?? false
        }
      });
    } catch (err) {
      console.error('Failed to initialize chart:', err);
    }

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [type, JSON.stringify(data), JSON.stringify(options)]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        height: height ?? '100%',
        width: width ?? '100%',
        ...style
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
};
