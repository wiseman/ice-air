import React, { useRef } from 'react';
import { Bar } from 'react-chartjs-2';
// Note: Chart.js instance and registration is handled in App.js

const DualBarChart = ({ title, labels, data1, label1, data2, label2 }) => {
    const chartRef = useRef(null);
  
    // Check if data is valid before rendering
    if (!Array.isArray(data1) || data1.length === 0 || 
        !Array.isArray(data2) || data2.length === 0 || 
        !labels || labels.length === 0) {
        return <div className="chart-placeholder">No data to display for "{title}"</div>;
    }
  
    // Format dates for display - convert YYYY-MM-DD to shorter format
    const formattedLabels = labels.map(dateStr => {
      try {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      } catch (e) {
        return dateStr;
      }
    });
  
    const axisColor = 'rgba(200, 200, 200, 0.85)';
    const gridColor = 'rgba(255, 255, 255, 0.08)';
  
    const chartData = {
      labels: formattedLabels,
      datasets: [
        {
          label: label1 || 'Dataset 1',
          data: data1,
          backgroundColor: 'rgba(0, 230, 255, 0.7)', // Teal/Cyan
          borderColor: 'rgba(0, 230, 255, 1)',
          borderWidth: 1,
          order: 1
        },
        {
          label: label2 || 'Dataset 2',
          data: data2,
          backgroundColor: 'rgba(255, 159, 64, 0.7)', // Orange
          borderColor: 'rgba(255, 159, 64, 1)',
          borderWidth: 1,
          order: 0
        },
      ],
    };
  
    const options = {
      responsive: true,
      maintainAspectRatio: false,
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
          callbacks: {
            title: function(tooltipItems) {
              // Display full date in tooltip
              if (tooltipItems.length > 0) {
                const index = tooltipItems[0].dataIndex;
                const originalDate = labels[index];
                return originalDate;
              }
              return '';
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: axisColor,
            font: { family: 'IBM Plex Mono' },
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 20
          }
        },
        y: {
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
        }
      }
    };
  
    return (
      <div style={{ position: 'relative', height: '350px', width: '100%' }}>
        <Bar
          ref={chartRef}
          options={options}
          data={chartData}
          key={`dualbar-${title}-${labels.length}`}
        />
      </div>
    );
  };

export default DualBarChart; 