import React, { useRef, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { enUS } from 'date-fns/locale';
// Note: Chart.js instance, TimeScale adapter, and registrations are handled in App.js

const TimeSeriesChart = ({ title, labels, data1, label1, data2, label2 }) => {
    const chartRef = useRef(null);
  
    // Ensure the chart is properly destroyed when component unmounts or when props change
    useEffect(() => {
      // no explicit destroy; wrapper does it
    }, [title, labels, data1, data2]);
  
    if (!Array.isArray(labels) || labels.length === 0 || !Array.isArray(data1) || !Array.isArray(data2)) {
      return <div className="chart-placeholder">No time series data to display for "{title}"</div>;
    }
  
    const axisColor = 'rgba(200, 200, 200, 0.85)';
    const gridColor = 'rgba(255, 255, 255, 0.08)';
    const color1 = 'rgba(0, 230, 255, 0.7)'; // Teal/Cyan
    const color2 = 'rgba(255, 159, 64, 0.7)'; // Orange
  
    const chartData = {
      labels: labels, // Expecting date strings (YYYY-MM-DD)
      datasets: [
        {
          label: label1 || 'Dataset 1',
          data: data1,
          borderColor: color1,
          backgroundColor: `${color1}60`, // Slightly transparent fill
          tension: 0.1, // Slight curve
          pointRadius: 1, // Smaller points
          pointHoverRadius: 5,
          fill: false,
          yAxisID: 'y', // Use the primary y-axis
        },
        {
          label: label2 || 'Dataset 2',
          data: data2,
          borderColor: color2,
          backgroundColor: `${color2}60`,
          tension: 0.1,
          pointRadius: 1,
          pointHoverRadius: 5,
          fill: false,
          yAxisID: 'y', // Use the primary y-axis
        },
      ],
    };
  
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index', // Show tooltips for all datasets at the same index
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: axisColor,
            font: { family: 'IBM Plex Mono', size: 12 }
          }
        },
        title: {
          display: true,
          text: title,
          color: axisColor,
          font: { family: 'Inter', size: 14 }
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleFont: { family: 'Inter', size: 12 },
          bodyFont: { family: 'IBM Plex Mono', size: 11 },
        }
      },
      scales: {
        y: { // Primary y-axis
          type: 'linear',
          display: true,
          position: 'left',
          beginAtZero: true,
          grid: {
            color: gridColor
          },
          ticks: {
            precision: 0,
            color: axisColor,
            font: { family: 'IBM Plex Mono' }
          },
          title: {
            display: true,
            text: 'Count',
            color: axisColor,
            font: { family: 'Inter', size: 12 }
          }
        },
        x: {
          type: 'time', // Use time scale
          time: {
            unit: 'day', // Display ticks per day
            tooltipFormat: 'PPP', // Format for tooltip header (e.g., 'Jan 1, 2024')
            displayFormats: {
              day: 'MMM d' // Format for x-axis labels (e.g., 'Jan 1')
            }
          },
          adapters: {
            date: {
              locale: enUS
            }
          },
          grid: {
            display: false
          },
          ticks: {
            color: axisColor,
            font: { family: 'IBM Plex Mono' },
            maxRotation: 45,
            autoSkip: true, // Automatically skip labels to prevent overlap
            maxTicksLimit: 20 // Limit the number of visible ticks
          }
        }
      }
    };
  
    return (
      <div style={{ position: 'relative', height: '350px', width: '100%' }}>
        <Line
          ref={chartRef}
          options={options}
          data={chartData}
          key={`timeseries-${title}-${labels.length}`} // Force re-render with unique key
        />
      </div>
    );
  };

export default TimeSeriesChart; 