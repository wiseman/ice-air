import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import 'chartjs-adapter-date-fns';        // registers the adapter
import { enUS } from 'date-fns/locale';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,            // keep TimeScale
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar, Line, getElementAtEvent } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  TimeScale
);

// --- Data Processing Logic ---

const processData = (visits) => {
  // Ensure visits are sorted by time first (important for min/max time)
  // Filter out invalid dates *before* sorting and processing
  const validVisits = visits.filter(visit => {
    const time = visit.time;
    if (!time) return false;
    const d = new Date(time);
    return !isNaN(d.getTime());
  }).sort((a, b) => new Date(a.time) - new Date(b.time));

  if (validVisits.length === 0) {
    throw new Error("No valid rows with parseable dates found in CSV.");
  }

  const airportCounts = {};
  const airportPairs = {};
  const landingsByDay = Array(7).fill(0);
  const landingsByHour = Array(24).fill(0);
  const aircraftLastAirport = {};
  const airportLandingsByDay = {};
  const airportLandingsByHour = {};
  const pairLandingsByDay = {};
  const pairLandingsByHour = {};
  const uniqueIcaos = new Set();
  const uniqueCallsigns = new Set();
  const arrivalsFrom = {}; // Added: Store arrivals from source -> destination
  const dailyActivity = {}; // Added: Store daily stats
  const airportDailyActivity = {}; // Added: Store airport-specific daily activity
  const pairDailyActivity = {}; // Added: Store pair-specific daily activity

  // Initialize min/max times with the first valid visit
  let minTime = new Date(validVisits[0].time);
  let maxTime = new Date(validVisits[0].time);

  validVisits.forEach(visit => {
    // Already validated time, icao24 and airportId presence needed for core logic
    const { time, icao24, airportId, callSign } = visit;
    if (!icao24 || !airportId) return; // Skip if essential IDs missing, time already checked

    const landingTime = new Date(time);
    // Update min/max times
    if (landingTime < minTime) minTime = landingTime;
    if (landingTime > maxTime) maxTime = landingTime;

    const dayOfWeek = landingTime.getDay();
    const hourOfDay = landingTime.getHours();

    // Add to sets for unique counts
    uniqueIcaos.add(icao24);
    if (callSign) { // Only count if callsign is present
      uniqueCallsigns.add(callSign.trim()); // Trim whitespace
    }

    // Increment overall counts
    airportCounts[airportId] = (airportCounts[airportId] || 0) + 1;
    landingsByDay[dayOfWeek]++;
    landingsByHour[hourOfDay]++;

    // Increment per-airport counts
    if (!airportLandingsByDay[airportId]) airportLandingsByDay[airportId] = Array(7).fill(0);
    if (!airportLandingsByHour[airportId]) airportLandingsByHour[airportId] = Array(24).fill(0);
    airportLandingsByDay[airportId][dayOfWeek]++;
    airportLandingsByHour[airportId][hourOfDay]++;

    // Track airport pairs
    if (aircraftLastAirport[icao24]) {
      const lastAirport = aircraftLastAirport[icao24];
      if (lastAirport !== airportId) {
        const pair = `${lastAirport}-${airportId}`;
        airportPairs[pair] = (airportPairs[pair] || 0) + 1;

        if (!pairLandingsByDay[pair]) pairLandingsByDay[pair] = Array(7).fill(0);
        if (!pairLandingsByHour[pair]) pairLandingsByHour[pair] = Array(24).fill(0);
        pairLandingsByDay[pair][dayOfWeek]++;
        pairLandingsByHour[pair][hourOfDay]++;

        // --- Calculate Arrivals From --- >
        if (!arrivalsFrom[airportId]) {
          arrivalsFrom[airportId] = {}; // Initialize destination if not present
        }
        arrivalsFrom[airportId][lastAirport] = (arrivalsFrom[airportId][lastAirport] || 0) + 1;
        // <--------------------------------
      }
    }
    aircraftLastAirport[icao24] = airportId;
  });

  // --- Calculate Daily Activity (Full Range) ---
  const dailyLabels = [];
  const dailyUniqueAircraftCounts = [];
  const dailyTotalLandings = [];

  if (minTime && maxTime) {
    const currentDate = new Date(minTime);
    currentDate.setUTCHours(0, 0, 0, 0); // Start at the beginning of the min day (UTC)
    const endDate = new Date(maxTime);
    endDate.setUTCHours(0, 0, 0, 0); // End at the beginning of the max day (UTC)

    while (currentDate <= endDate) {
      const dateString = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      let dailyUniqueAircraft = new Set();
      let dailyLandings = 0;
      
      // Initialize daily structures for airports and pairs
      airportDailyActivity[dateString] = {};
      pairDailyActivity[dateString] = {};

      // Efficiently find visits for the current day (assumes validVisits is sorted)
      // This is less efficient than the previous aggregation method, consider optimizing if performance is critical
      validVisits.forEach(visit => {
        const visitDate = new Date(visit.time);
        visitDate.setUTCHours(0, 0, 0, 0);
        if (visitDate.getTime() === currentDate.getTime()) {
          dailyUniqueAircraft.add(visit.icao24);
          dailyLandings++;
          
          // Track per-airport daily activity
          if (visit.airportId) {
            if (!airportDailyActivity[dateString][visit.airportId]) {
              airportDailyActivity[dateString][visit.airportId] = {
                landings: 0,
                uniqueAircraft: new Set()
              };
            }
            airportDailyActivity[dateString][visit.airportId].landings++;
            airportDailyActivity[dateString][visit.airportId].uniqueAircraft.add(visit.icao24);
            
            // Track pair activity if this aircraft has a previous airport
            if (aircraftLastAirport[visit.icao24]) {
              const lastAirport = aircraftLastAirport[visit.icao24];
              if (lastAirport !== visit.airportId) {
                const pair = `${lastAirport}-${visit.airportId}`;
                if (!pairDailyActivity[dateString][pair]) {
                  pairDailyActivity[dateString][pair] = {
                    flights: 0,
                    uniqueAircraft: new Set()
                  };
                }
                pairDailyActivity[dateString][pair].flights++;
                pairDailyActivity[dateString][pair].uniqueAircraft.add(visit.icao24);
              }
            }
          }
        }
      });

      dailyLabels.push(dateString);
      dailyUniqueAircraftCounts.push(dailyUniqueAircraft.size);
      dailyTotalLandings.push(dailyLandings);

      // Move to the next day
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }
  }
  // --- End Daily Activity Calculation ---

  const sortedAirports = Object.entries(airportCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 20);

  const sortedPairs = Object.entries(airportPairs)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 20);

  return {
    // Stats
    earliestTime: minTime.toISOString(),
    latestTime: maxTime.toISOString(),
    totalLandings: validVisits.length,
    uniqueAircraftCount: uniqueIcaos.size,
    uniqueCallsignCount: uniqueCallsigns.size,
    // Chart Data
    sortedAirports,
    sortedPairs,
    landingsByDay,
    landingsByHour,
    airportLandingsByDay,
    airportLandingsByHour,
    pairLandingsByDay,
    pairLandingsByHour,
    arrivalsFrom, // Added
    allAirports: Object.keys(airportCounts).sort(),
    allPairs: Object.keys(airportPairs).sort(),
    // Daily Activity Data
    dailyLabels,
    dailyUniqueAircraftCounts,
    dailyTotalLandings,
    // Additional Daily Activity Data
    airportDailyActivity,
    pairDailyActivity
  };
};

// --- Chart Components ---

const BarChart = ({ title, labels, data, label, onBarClick }) => {
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
          autoSkip: true,
          maxRotation: 45, // Rotate labels slightly if needed
          minRotation: 0,
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

// --- NEW Dual Bar Chart Component ---
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

// --- NEW Time Series Chart Component ---
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

// --- Main App Component ---

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAirport, setSelectedAirport] = useState('all');
  const [selectedPair, setSelectedPair] = useState('none');
  const fileInputRef = React.createRef();

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setData(null);
    setSelectedAirport('all');
    setSelectedPair('none');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          // Basic validation
          if (!results.data || results.data.length === 0) {
            throw new Error("CSV file is empty or invalid.");
          }
          const requiredColumns = ['time', 'icao24', 'airportId'];
          const actualColumns = results.meta.fields.map(field => field.trim()); // Trim whitespace from headers
          if (!requiredColumns.every(col => actualColumns.includes(col))) {
            throw new Error(`CSV must include columns: ${requiredColumns.join(', ')}. Found: ${actualColumns.join(', ')}`);
          }
          // Add check for date parsing errors during processing
          const processed = processData(results.data);
          // Example check if data processing returned something meaningful
          if (!processed || !processed.allAirports || processed.allAirports.length === 0) {
            throw new Error("Could not process data. Check CSV content and format, especially dates.");
          }

          setData(processed);
          setLoading(false);
        } catch (err) {
          console.error("Processing Error:", err);
          setError(`Failed to process data: ${err.message}`);
          setLoading(false);
        }
      },
      error: (err) => {
        console.error("Parsing Error:", err);
        setError(`Failed to parse CSV: ${err.message}`);
        setLoading(false);
      }
    });

    // Reset file input value so the same file can be re-uploaded
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

  }, [fileInputRef]); // Add fileInputRef to dependencies


  // --- Click Handlers for Charts ---
  const handleAirportClick = useCallback((airportId) => {
    if (data && data.allAirports.includes(airportId)) {
      setSelectedAirport(airportId);
      setSelectedPair('none'); // Reset pair filter when airport is clicked
    }
  }, [data]);

  const handlePairClick = useCallback((pairId) => {
    if (data && data.allPairs.includes(pairId)) {
      setSelectedPair(pairId);
      setSelectedAirport('all'); // Reset airport filter when pair is clicked
    }
  }, [data]);


  // --- Combined Memoized Data for Time Charts ---
  const displayLandingsByDay = useMemo(() => {
    if (!data) return [];
    if (selectedPair !== 'none' && data.pairLandingsByDay[selectedPair]) {
      return data.pairLandingsByDay[selectedPair];
    }
    if (selectedAirport !== 'all' && data.airportLandingsByDay[selectedAirport]) {
      return data.airportLandingsByDay[selectedAirport];
    }
    return data.landingsByDay || [];
  }, [data, selectedAirport, selectedPair]);

  const displayLandingsByHour = useMemo(() => {
    if (!data) return [];
    if (selectedPair !== 'none' && data.pairLandingsByHour[selectedPair]) {
      return data.pairLandingsByHour[selectedPair];
    }
    if (selectedAirport !== 'all' && data.airportLandingsByHour[selectedAirport]) {
      return data.airportLandingsByHour[selectedAirport];
    }
    return data.landingsByHour || [];
  }, [data, selectedAirport, selectedPair]);

  // Determine the label for the time chart titles
  const activeFilterLabel = useMemo(() => {
    if (selectedPair !== 'none') return `Pair: ${selectedPair}`;
    if (selectedAirport !== 'all') return `Airport: ${selectedAirport}`;
    return 'All Airports';
  }, [selectedAirport, selectedPair]);

  // Determine the label for the data points in time charts
  const timeChartDataLabel = useMemo(() => {
    if (selectedPair !== 'none') return 'Flights';
    return 'Landings';
  }, [selectedPair]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hourLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

  // Helper to format date/time strings
  const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleString();
    } catch (e) {
      return 'Invalid Date';
    }
  };

  // --- Memoized Data for Arrivals From Chart ---
  const arrivalsFromChartData = useMemo(() => {
    if (!data || selectedAirport === 'all' || !data.arrivalsFrom || !data.arrivalsFrom[selectedAirport]) {
      return []; // No airport selected or no arrival data
    }
    // Convert the arrivals object for the selected airport into a sorted array
    return Object.entries(data.arrivalsFrom[selectedAirport])
      .sort(([, countA], [, countB]) => countB - countA) // Sort descending by count
      .slice(0, 20); // Take top 20 sources
  }, [data, selectedAirport]);

  // NEW: Filtered daily activity data based on selection
  const filteredDailyActivity = useMemo(() => {
    if (!data) return { 
      labels: [], 
      uniqueAircraftCounts: [], 
      totalLandings: [] 
    };
    
    // If no filter, use all data
    if (selectedAirport === 'all' && selectedPair === 'none') {
      return {
        labels: data.dailyLabels,
        uniqueAircraftCounts: data.dailyUniqueAircraftCounts,
        totalLandings: data.dailyTotalLandings
      };
    }
    
    // Initialize arrays
    const labels = [...data.dailyLabels];
    const uniqueAircraftCounts = Array(labels.length).fill(0);
    const totalLandings = Array(labels.length).fill(0);
    
    // Filter by airport
    if (selectedAirport !== 'all') {
      labels.forEach((dateStr, index) => {
        if (data.airportDailyActivity[dateStr] && 
            data.airportDailyActivity[dateStr][selectedAirport]) {
          
          const airportData = data.airportDailyActivity[dateStr][selectedAirport];
          uniqueAircraftCounts[index] = airportData.uniqueAircraft.size;
          totalLandings[index] = airportData.landings;
        }
      });
    }
    // Filter by pair
    else if (selectedPair !== 'none') {
      labels.forEach((dateStr, index) => {
        if (data.pairDailyActivity[dateStr] && 
            data.pairDailyActivity[dateStr][selectedPair]) {
          
          const pairData = data.pairDailyActivity[dateStr][selectedPair];
          uniqueAircraftCounts[index] = pairData.uniqueAircraft.size;
          totalLandings[index] = pairData.flights;
        }
      });
    }
    
    return { labels, uniqueAircraftCounts, totalLandings };
  }, [data, selectedAirport, selectedPair]);

  return (
    <div className="container">
      <h1>Aircraft Activity Visualizer</h1>

      <div className="upload-section">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          ref={fileInputRef} // Attach ref here
        />
        <span>Upload a CSV file (time, icao24, airportId)</span>
      </div>

      {loading && <p className="loading">Loading and processing data...</p>}
      {error && <p className="error">Error: {error}</p>}

      {data && (
        <>
          {/* --- Summary Statistics Section --- */}
          <div className="summary-stats">
            <h2>Summary Statistics</h2>
            <p><strong>Time Range:</strong> {formatDateTime(data.earliestTime)} - {formatDateTime(data.latestTime)}</p>
            <p><strong>Total Landings Processed:</strong> {data.totalLandings.toLocaleString()}</p>
            <p><strong>Unique Aircraft (ICAO24):</strong> {data.uniqueAircraftCount.toLocaleString()}</p>
            <p><strong>Unique Callsigns:</strong> {data.uniqueCallsignCount.toLocaleString()}</p>
          </div>

          <div className="filters-container">
            {/* Airport Filter */}
            <div className="filter-section">
              <label htmlFor="airport-filter">Filter by Airport:</label>
              <select
                id="airport-filter"
                value={selectedAirport}
                onChange={(e) => setSelectedAirport(e.target.value)}
                disabled={!data.allAirports || data.allAirports.length === 0}
              >
                <option value="all">All Airports</option>
                {data.allAirports.map(airport => (
                  <option key={airport} value={airport}>{airport}</option>
                ))}
              </select>
            </div>

            {/* Airport Pair Filter */}
            <div className="filter-section">
              <label htmlFor="pair-filter">Filter by Airport Pair:</label>
              <select
                id="pair-filter"
                value={selectedPair}
                onChange={(e) => setSelectedPair(e.target.value)}
                disabled={!data.allPairs || data.allPairs.length === 0}
              >
                <option value="none">No Pair Selected</option>
                {data.allPairs.map(pair => (
                  <option key={pair} value={pair}>{pair}</option>
                ))}
              </select>
            </div>
          </div>


          <div className="charts-grid">
            {/* --- Row 1: Overall Activity (Clickable) --- */}
            <div className="chart-container">
              <BarChart
                title="Top 20 Most Active Airports (Click to Filter)"
                labels={data.sortedAirports.map(([id]) => id)}
                data={data.sortedAirports.map(([, count]) => count)}
                label="Total Landings"
                onBarClick={handleAirportClick}
              />
            </div>
            <div className="chart-container">
              <BarChart
                title="Top 20 Most Frequent Airport Pairs (Click to Filter)"
                labels={data.sortedPairs.map(([pair]) => pair)}
                data={data.sortedPairs.map(([, count]) => count)}
                label="Total Flights"
                onBarClick={handlePairClick}
              />
            </div>

            {/* --- Row 2: Activity by Time (Dynamically Filtered) --- */}
            <div className="chart-container">
              <BarChart
                title={`Activity by Day of Week (${activeFilterLabel})`}
                labels={dayLabels}
                data={displayLandingsByDay}
                label={timeChartDataLabel}
              />
            </div>
            <div className="chart-container">
              <BarChart
                title={`Activity by Hour of Day (${activeFilterLabel})`}
                labels={hourLabels}
                data={displayLandingsByHour}
                label={timeChartDataLabel}
              />
            </div>

            {/* --- Row 3: Arrivals From (Conditional) --- */}
            {selectedAirport !== 'all' && arrivalsFromChartData.length > 0 && (
              <div className="chart-container">
                <BarChart
                  title={`Top 20 Sources for Arrivals at ${selectedAirport}`}
                  labels={arrivalsFromChartData.map(([source]) => source)}
                  data={arrivalsFromChartData.map(([, count]) => count)}
                  label="Arrivals"
                />
              </div>
            )}

            {/* --- NEW Row 4: Daily Activity Time Series --- */}
            {data.dailyLabels && data.dailyLabels.length > 0 && (
              <div className="chart-container full-width">
                <DualBarChart
                  key={`daily-${activeFilterLabel}`}
                  title={`Daily Activity Over Time (${activeFilterLabel})`}
                  labels={filteredDailyActivity.labels}
                  data1={filteredDailyActivity.uniqueAircraftCounts}
                  label1="# Unique Aircraft"
                  data2={filteredDailyActivity.totalLandings}
                  label2={selectedPair !== 'none' ? '# Flights' : '# Landings'}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App; 