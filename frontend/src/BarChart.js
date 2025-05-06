import React, { useRef } from 'react';
import { Bar } from 'react-chartjs-2';
// Note: Chart.js instance and registration is handled in App.js
// No need to register scales/elements here again if Chart.js is configured globally

const BarChart = ({ title, labels, data, label, onBarClick, showAllLabels = false }) => {
    const chartRef = useRef();

    // Check if data is valid before rendering
    if (!Array.isArray(data) || data.length === 0 || !labels || labels.length === 0) {
      // Optionally return a placeholder or null
      // console.log("BarChart: Invalid data or labels", { title, data, labels });
      return <div className="chart-placeholder">No data to display for "{title}"</div>;
    }

    const axisColor = 'rgba(200, 200, 200, 0.85)';
    const gridColor = 'rgba(255, 255, 255, 0.08)';

    const chartData = {
      labels,
      datasets: [
        {
          label: label || 'Count',
          data: data,
          backgroundColor: 'rgba(0, 230, 255, 0.35)',
          borderColor: 'rgba(0, 230, 255, 1)',
          borderWidth: 1,
        },
      ],
    };
    const options = {
      responsive: true,
      maintainAspectRatio: false, // Allow chart to resize height
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
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: gridColor
          },
          ticks: {
            precision: 0, // Ensure y-axis ticks are integers
            color: axisColor,
            font: { family: 'IBM Plex Mono' }
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            autoSkip: !showAllLabels, // Don't skip labels when showAllLabels is true
            maxRotation: showAllLabels ? 90 : 45, // Rotate more when showing all labels
            minRotation: showAllLabels ? 45 : 0, // Minimum rotation when showing all labels
            color: axisColor,
            font: { family: 'IBM Plex Mono' }
          }
        }
      },
      onClick: (event, elements) => {
        if (!elements.length || !onBarClick) return;

        const { index } = elements[0];
        const clickedLabel = labels[index];
        onBarClick(clickedLabel);
      }
    };
    // Add a wrapper div to control size if necessary, especially with maintainAspectRatio: false
    return <div style={{ position: 'relative', height: '300px', width: '100%' }}><Bar key={`bar-${title}-${labels.join('-')}`} ref={chartRef} options={options} data={chartData} /></div>;
  };

export default BarChart; 