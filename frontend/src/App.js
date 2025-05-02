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
import { Bar, Line } from 'react-chartjs-2';
import {
  DateRangePicker,
  Label,
  Group,
  DateInput,
  DateSegment,
  Button,
  Popover,
  Dialog,
  RangeCalendar,
  CalendarCell,
  CalendarGrid,
  Heading
} from 'react-aria-components';
import {
  parseDate,
  parseAbsoluteToLocal, // Or parseZonedDateTime, parseAbsolute depending on timestamp format
  today,
  getLocalTimeZone,
  CalendarDate,
  toCalendarDate
} from '@internationalized/date';
import { I18nProvider } from '@react-aria/i18n';

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

// Step 1: Initial Processing (Parse, Validate, Sort, Get Range)
const processInitialData = (flights) => {
  // Filter out invalid timestamps *before* sorting and processing
  const validFlights = flights.filter(flight => {
    const time = flight.timestamp; // Use timestamp
    if (!time) return false;
    try {
      const d = new Date(time);
      return !isNaN(d.getTime());
    } catch (e) {
      return false; // Handle potential Date constructor errors
    }
  }).map(flight => ({ // Convert timestamp to Date object early
    ...flight,
    timestamp: new Date(flight.timestamp)
  })).sort((a, b) => a.timestamp - b.timestamp); // Sort by timestamp (Date objects)

  if (validFlights.length === 0) {
    throw new Error("No valid rows with parseable timestamps found in CSV.");
  }

  // Determine min/max time from the sorted valid flights
  const minTime = validFlights[0].timestamp;
  const maxTime = validFlights[validFlights.length - 1].timestamp;

  return {
    rawFlights: validFlights, // Return the raw, sorted, validated flights with Date objects
    earliestTime: minTime,
    latestTime: maxTime,
  };
};


// Step 2: Aggregation Logic (Takes a list of flights, returns aggregated stats/charts)
const aggregateFlightData = (flights) => {
  if (!flights || flights.length === 0) {
    // Return empty/default structure if no flights after filtering
    return {
      totalFlightsProcessed: 0,
      uniqueAircraftCount: 0,
      uniqueCallsignCount: 0,
      sortedAirports: [],
      sortedPairs: [],
      landingsByDay: Array(7).fill(0),
      landingsByHour: Array(24).fill(0),
      airportLandingsByDay: {},
      airportLandingsByHour: {},
      pairLandingsByDay: {},
      pairLandingsByHour: {},
      arrivalsFrom: {},
      allAirports: [],
      allPairs: [],
      dailyLabels: [],
      dailyUniqueAircraftCounts: [],
      dailyTotalLandings: [],
      airportDailyActivity: {},
      pairDailyActivity: {}
    };
  }

  const airportCounts = {}; // Counts landings at destination airports
  const airportPairs = {};
  const landingsByDay = Array(7).fill(0); // Landings at destination by day
  const landingsByHour = Array(24).fill(0); // Landings at destination by hour
  const airportLandingsByDay = {}; // Landings at specific destination airport by day
  const airportLandingsByHour = {}; // Landings at specific destination airport by hour
  const pairLandingsByDay = {}; // Flights for a specific pair by day
  const pairLandingsByHour = {}; // Flights for a specific pair by hour
  const uniqueIcaos = new Set();
  const uniqueCallsigns = new Set();
  const arrivalsFrom = {}; // Stores arrivals count: arrivalsFrom[destination][origin] = count
  const airportDailyActivity = {}; // Stores airport-specific daily activity
  const pairDailyActivity = {}; // Stores pair-specific daily activity

  // Min/max times for the *filtered* set (if needed for display, otherwise use overall min/max)
  let minTime = flights[0].timestamp;
  let maxTime = flights[flights.length - 1].timestamp; // Already sorted

  flights.forEach(flight => {
    // Destructure using new column names. Ensure origin/destination are present for pair logic.
    // Timestamp is already a Date object here
    const { timestamp, icao, origin, destination, callsign } = flight;
    if (!icao || !destination) return; // Skip if essential info missing for destination stats

    const landingTime = timestamp; // Already a Date object

    const dayOfWeek = landingTime.getDay(); // 0=Sun, 6=Sat
    const hourOfDay = landingTime.getHours();

    // Add to sets for unique counts
    uniqueIcaos.add(icao);
    if (callsign) {
      uniqueCallsigns.add(callsign.trim());
    }

    // Increment overall counts based on destination
    airportCounts[destination] = (airportCounts[destination] || 0) + 1;
    landingsByDay[dayOfWeek]++;
    landingsByHour[hourOfDay]++;

    // Increment per-destination airport counts
    if (!airportLandingsByDay[destination]) airportLandingsByDay[destination] = Array(7).fill(0);
    if (!airportLandingsByHour[destination]) airportLandingsByHour[destination] = Array(24).fill(0);
    airportLandingsByDay[destination][dayOfWeek]++;
    airportLandingsByHour[destination][hourOfDay]++;

    // Track airport pairs directly if origin is present
    if (origin && origin !== destination) {
      const pair = `${origin}-${destination}`;
      airportPairs[pair] = (airportPairs[pair] || 0) + 1;

      if (!pairLandingsByDay[pair]) pairLandingsByDay[pair] = Array(7).fill(0);
      if (!pairLandingsByHour[pair]) pairLandingsByHour[pair] = Array(24).fill(0);
      pairLandingsByDay[pair][dayOfWeek]++;
      pairLandingsByHour[pair][hourOfDay]++;

      // Calculate Arrivals From
      if (!arrivalsFrom[destination]) {
        arrivalsFrom[destination] = {};
      }
      arrivalsFrom[destination][origin] = (arrivalsFrom[destination][origin] || 0) + 1;
    }
  });

  // --- Calculate Daily Activity (based on the filtered flight list) ---
  const dailyLabels = [];
  const dailyUniqueAircraftCounts = [];
  const dailyTotalLandings = [];

  if (flights.length > 0) {
      // Use the actual min/max time of the *filtered* data for iteration
      const startLoopDate = new Date(minTime);
      startLoopDate.setUTCHours(0, 0, 0, 0);
      const endLoopDate = new Date(maxTime);
      endLoopDate.setUTCHours(0, 0, 0, 0);

      // Create a map for quick lookup of flights by date string
      const flightsByDate = {};
      flights.forEach(flight => {
          const dateStr = flight.timestamp.toISOString().split('T')[0];
          if (!flightsByDate[dateStr]) {
              flightsByDate[dateStr] = [];
          }
          flightsByDate[dateStr].push(flight);
      });


      let currentDate = new Date(startLoopDate);
      while (currentDate <= endLoopDate) {
          const dateString = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
          let dailyUniqueAircraft = new Set();
          let dailyLandings = 0;

          airportDailyActivity[dateString] = {};
          pairDailyActivity[dateString] = {};

          // Use the pre-grouped flights for this date
          const todaysFlights = flightsByDate[dateString] || [];

          todaysFlights.forEach(flight => {
              if (flight.icao) dailyUniqueAircraft.add(flight.icao);
              if (flight.destination) dailyLandings++;

              // Track per-destination daily activity
              if (flight.destination) {
                  if (!airportDailyActivity[dateString][flight.destination]) {
                      airportDailyActivity[dateString][flight.destination] = { landings: 0, uniqueAircraft: new Set() };
                  }
                  airportDailyActivity[dateString][flight.destination].landings++;
                  if (flight.icao) airportDailyActivity[dateString][flight.destination].uniqueAircraft.add(flight.icao);
              }

              // Track pair activity
              if (flight.origin && flight.destination && flight.origin !== flight.destination) {
                  const pair = `${flight.origin}-${flight.destination}`;
                  if (!pairDailyActivity[dateString][pair]) {
                      pairDailyActivity[dateString][pair] = { flights: 0, uniqueAircraft: new Set() };
                  }
                  pairDailyActivity[dateString][pair].flights++;
                  if (flight.icao) pairDailyActivity[dateString][pair].uniqueAircraft.add(flight.icao);
              }
          });


          // Only add the day if there was activity (optional, keeps charts cleaner if gaps)
          // Or always add it to show gaps:
          dailyLabels.push(dateString);
          dailyUniqueAircraftCounts.push(dailyUniqueAircraft.size);
          dailyTotalLandings.push(dailyLandings);

          // Move to the next day
          currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
  }
  // --- End Daily Activity Calculation ---

  const sortedAirports = Object.entries(airportCounts) // Based on destination landings
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 20);

  const sortedPairs = Object.entries(airportPairs) // Based on origin-destination flights
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 20);

  // Return aggregated data based on the input flight list
  return {
    // Stats for the *filtered* period
    totalFlightsProcessed: flights.length,
    uniqueAircraftCount: uniqueIcaos.size,
    uniqueCallsignCount: uniqueCallsigns.size,
    // Chart Data for the *filtered* period
    sortedAirports,
    sortedPairs,
    landingsByDay,
    landingsByHour,
    airportLandingsByDay,
    airportLandingsByHour,
    pairLandingsByDay,
    pairLandingsByHour,
    arrivalsFrom,
    allAirports: Object.keys(airportCounts).sort(),
    allPairs: Object.keys(airportPairs).sort(),
    // Daily Activity for the *filtered* period
    dailyLabels,
    dailyUniqueAircraftCounts,
    dailyTotalLandings,
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
  const [initialData, setInitialData] = useState(null); // Holds rawFlights, earliestTime, latestTime
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAirport, setSelectedAirport] = useState('all'); // Destination filter
  const [selectedPair, setSelectedPair] = useState('none'); // Pair filter
  const [dateRange, setDateRange] = useState(null); // Holds { start: DateValue, end: DateValue } or null
  const fileInputRef = React.createRef();

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setInitialData(null); // Clear previous raw data
    setSelectedAirport('all');
    setSelectedPair('none');
    setDateRange(null); // Reset date filter temporarily

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          if (!results.data || results.data.length === 0) {
            throw new Error("CSV file is empty or invalid.");
          }
          const requiredColumns = ['timestamp', 'icao', 'origin', 'destination'];
          const actualColumns = results.meta.fields.map(field => field ? field.trim() : '');
          if (!requiredColumns.every(col => actualColumns.includes(col))) {
             throw new Error(`CSV must include columns: ${requiredColumns.join(', ')}. Found: ${actualColumns.join(', ')}`);
          }

          // Perform initial processing only
          const processed = processInitialData(results.data);

          // No need for extensive checks here as processInitialData throws errors
          setInitialData(processed); // Store raw flights and date range
          
          // Set date range to cover the entire time span
          if (processed.earliestTime && processed.latestTime) {
            setDateRange({
              start: getCalendarDate(processed.earliestTime),
              end: getCalendarDate(processed.latestTime)
            });
          }
          
          setLoading(false);
        } catch (err) {
          console.error("Processing Error:", err);
          setError(`Failed to process data: ${err.message}`);
          setLoading(false);
          setInitialData(null); // Ensure data is null on error
        }
      },
      error: (err) => {
        console.error("Parsing Error:", err);
        setError(`Failed to parse CSV: ${err.message}`);
        setLoading(false);
        setInitialData(null); // Ensure data is null on error
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [fileInputRef]); // Dependencies remain the same

  // --- Filtering Logic with DateRangePicker ---
  const filteredFlights = useMemo(() => {
    if (!initialData?.rawFlights) return [];

    const { rawFlights } = initialData;

    if (!dateRange?.start || !dateRange?.end) {
      return rawFlights; // No filter applied
    }

    // Convert react-aria start/end dates (which are CalendarDate/DateTime) to JS Date objects
    // representing the very beginning and end of the selected days in UTC for comparison.
    const startFilterTime = dateRange.start.toDate(getLocalTimeZone());
    startFilterTime.setHours(0, 0, 0, 0); // Start of the day in local time zone

    const endFilterTime = dateRange.end.toDate(getLocalTimeZone());
    endFilterTime.setHours(23, 59, 59, 999); // End of the day in local time zone

    return rawFlights.filter(flight => {
      // Compare flight timestamp (already a JS Date) with the filter range boundaries
      const flightTimeMs = flight.timestamp.getTime();

      const afterStart = flightTimeMs >= startFilterTime.getTime();
      const beforeEnd = flightTimeMs <= endFilterTime.getTime();

      return afterStart && beforeEnd;
    });
  }, [initialData?.rawFlights, dateRange]);


  // --- Aggregation on Filtered Data ---
  const displayedData = useMemo(() => {
    // This performs all calculations (counts, stats, daily activity)
    // based *only* on the flights that passed the date filter.
    return aggregateFlightData(filteredFlights);
  }, [filteredFlights]);


  // --- Click Handlers for Charts ---
  const handleAirportClick = useCallback((airportId) => {
    // Use displayedData.allAirports which is based on filtered data
    if (displayedData && displayedData.allAirports.includes(airportId)) {
      setSelectedAirport(airportId);
      setSelectedPair('none');
    }
  }, [displayedData]); // Depends on the result of aggregation

  const handlePairClick = useCallback((pairId) => {
    // Use displayedData.allPairs which is based on filtered data
    if (displayedData && displayedData.allPairs.includes(pairId)) {
      setSelectedPair(pairId);
      setSelectedAirport('all');
    }
  }, [displayedData]); // Depends on the result of aggregation

  // --- Derive specific chart data from displayedData based on filters ---
  const displayLandingsByDay = useMemo(() => {
    if (!displayedData) return [];
    if (selectedPair !== 'none' && displayedData.pairLandingsByDay[selectedPair]) {
      return displayedData.pairLandingsByDay[selectedPair];
    }
    if (selectedAirport !== 'all' && displayedData.airportLandingsByDay[selectedAirport]) {
      return displayedData.airportLandingsByDay[selectedAirport];
    }
    // Fallback to overall landings (for the filtered period)
    return displayedData.landingsByDay || [];
  }, [displayedData, selectedAirport, selectedPair]);

  const displayLandingsByHour = useMemo(() => {
    if (!displayedData) return [];
    if (selectedPair !== 'none' && displayedData.pairLandingsByHour[selectedPair]) {
      return displayedData.pairLandingsByHour[selectedPair];
    }
    if (selectedAirport !== 'all' && displayedData.airportLandingsByHour[selectedAirport]) {
      return displayedData.airportLandingsByHour[selectedAirport];
    }
     // Fallback to overall landings (for the filtered period)
    return displayedData.landingsByHour || [];
  }, [displayedData, selectedAirport, selectedPair]);

  // Determine the label for the time chart titles based on filters
  const activeFilterLabel = useMemo(() => {
    if (selectedPair !== 'none') return `Leg: ${selectedPair}`;
    if (selectedAirport !== 'all') return `Destination: ${selectedAirport}`;
    return 'All Destinations';
  }, [selectedAirport, selectedPair]);

  // Determine the label for the data points in time charts
  const timeChartDataLabel = useMemo(() => {
    if (selectedPair !== 'none') return 'Flights';
    return 'Flights';
  }, [selectedPair]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hourLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

  // Helper to format Date objects or ISO strings
  const formatDateTime = (dateOrIsoString) => {
    if (!dateOrIsoString) return 'N/A';
    try {
      let dt;
      if (dateOrIsoString instanceof Date) {
        dt = dateOrIsoString;
      } else if (dateOrIsoString.toDate) { // Check if it's an @internationalized/date object
        dt = dateOrIsoString.toDate(getLocalTimeZone()); // Convert to local JS Date
      } else {
        dt = new Date(dateOrIsoString); // Assume ISO string
      }
      if (isNaN(dt.getTime())) return 'Invalid Date';
      return dt.toLocaleString();
    } catch (e) {
      console.warn("Invalid date format:", dateOrIsoString);
      return 'Invalid Date';
    }
  };

  // Memoized Data for Arrivals From Chart (derived from displayedData)
  const arrivalsFromChartData = useMemo(() => {
    if (!displayedData || selectedAirport === 'all' || !displayedData.arrivalsFrom || !displayedData.arrivalsFrom[selectedAirport]) {
      return [];
    }
    return Object.entries(displayedData.arrivalsFrom[selectedAirport])
      .sort(([, countA], [, countB]) => countB - countA)
      .slice(0, 20);
  }, [displayedData, selectedAirport]);

  // Filtered daily activity data based on selection (derived from displayedData)
   const filteredDailyActivityChartData = useMemo(() => {
    if (!displayedData || !displayedData.dailyLabels) {
      return { labels: [], uniqueAircraftCounts: [], totalLandings: [] };
    }

    // Base data from the filtered & aggregated results
    const { dailyLabels, dailyUniqueAircraftCounts, dailyTotalLandings, airportDailyActivity, pairDailyActivity } = displayedData;

    // If no further filter (airport/pair), use the aggregated daily totals
    if (selectedAirport === 'all' && selectedPair === 'none') {
      return {
        labels: dailyLabels,
        uniqueAircraftCounts: dailyUniqueAircraftCounts,
        totalLandings: dailyTotalLandings
      };
    }

    // Apply airport or pair filter to the *already aggregated* daily data
    const labels = [...dailyLabels];
    const uniqueAircraftCounts = Array(labels.length).fill(0);
    const totalLandings = Array(labels.length).fill(0);

    if (selectedAirport !== 'all') {
      labels.forEach((dateStr, index) => {
        if (airportDailyActivity[dateStr]?.[selectedAirport]) {
          const airportData = airportDailyActivity[dateStr][selectedAirport];
          uniqueAircraftCounts[index] = airportData.uniqueAircraft.size;
          totalLandings[index] = airportData.landings;
        }
      });
    } else if (selectedPair !== 'none') {
      labels.forEach((dateStr, index) => {
        if (pairDailyActivity[dateStr]?.[selectedPair]) {
          const pairData = pairDailyActivity[dateStr][selectedPair];
          uniqueAircraftCounts[index] = pairData.uniqueAircraft.size;
          totalLandings[index] = pairData.flights;
        }
      });
    }

    return { labels, uniqueAircraftCounts, totalLandings };
  }, [displayedData, selectedAirport, selectedPair]);

  // --- Convert JS Date to CalendarDate for min/max Value ---  
  const getCalendarDate = (jsDate) => {
    if (!jsDate || !(jsDate instanceof Date)) return undefined;
    // Convert JS Date (local) into a CalendarDate object
    // We need year, month, day in the *local* time zone
    return new CalendarDate(jsDate.getFullYear(), jsDate.getMonth() + 1, jsDate.getDate());
    // Alternative if timestamps are UTC: use parseAbsoluteToLocal(jsDate.toISOString()).date;
    // Or more robustly if input is guaranteed UTC:
    // return toCalendarDate(new CalendarDateTime(jsDate.getUTCFullYear(), jsDate.getUTCMonth() + 1, jsDate.getUTCDate(), jsDate.getUTCHours(), jsDate.getUTCMinutes()));
  };

  return (
    <I18nProvider locale={navigator.language || 'en-US'}>
      <div className="container">
        <h1>ICE Air Activity Analysis</h1>

        <div className="upload-section">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            ref={fileInputRef}
          />
          <span>Upload a CSV file (timestamp, icao, origin, destination, callsign)</span>
        </div>

        {loading && <p className="loading">Loading and processing data...</p>}
        {error && <p className="error">Error: {error}</p>}

        {/* Display content only after initial data is loaded */}
        {initialData && (
          <>
            {/* --- Date Range Filter using React Aria --- */}
            <div className="date-filter-section">
                <DateRangePicker
                    label="Filter by Date Range"
                    value={dateRange}
                    onChange={setDateRange}
                    minValue={getCalendarDate(initialData.earliestTime)}
                    maxValue={getCalendarDate(initialData.latestTime)}
                    granularity="day" // Only select dates, not times
                    isDisabled={loading}
                >
                    <Label>Filter Date Range:</Label>
                    <Group className="date-picker-group">
                        <DateInput slot="start" className="date-input">
                            {(segment) => <DateSegment segment={segment} className="date-segment" />}
                        </DateInput>
                        <span aria-hidden="true">–</span>
                        <DateInput slot="end" className="date-input">
                            {(segment) => <DateSegment segment={segment} className="date-segment" />}
                        </DateInput>
                        <Button className="calendar-button">▼</Button>
                    </Group>
                    <Popover>
                        <Dialog className="calendar-dialog">
                            <RangeCalendar>
                                <header className="calendar-header">
                                    <Button slot="previous">◀</Button>
                                    <Heading />
                                    <Button slot="next">▶</Button>
                                </header>
                                <CalendarGrid className="calendar-grid">
                                    {(date) => <CalendarCell date={date} />}
                                </CalendarGrid>
                            </RangeCalendar>
                        </Dialog>
                    </Popover>
                </DateRangePicker>
                {/* Optional: Add a manual clear button if needed, interacting with setDateRange(null) */}
                {dateRange && (
                    <Button 
                        onPress={() => setDateRange(null)} 
                        className="clear-range-button" 
                        isDisabled={loading}
                    >
                        Clear Range
                    </Button>
                )}
            </div>

            {/* --- Summary Statistics Section (Uses displayedData) --- */}
            <div className="summary-stats">
                <h2>Summary Statistics</h2>
                {/* Use stats from displayedData which reflects filtering */}
                <p><strong>Total Flights:</strong> {displayedData.totalFlightsProcessed.toLocaleString()}</p>
                <p><strong>Unique Aircraft:</strong> {displayedData.uniqueAircraftCount.toLocaleString()}</p>
                <p><strong>Unique Callsigns:</strong> {displayedData.uniqueCallsignCount.toLocaleString()}</p>
            </div>

             {/* --- Airport/Pair Filters (Uses displayedData for options) --- */}
            <div className="filters-container">
              <div className="filter-section">
                <label htmlFor="airport-filter">Filter by Destination Airport:</label>
                <select
                  id="airport-filter"
                  value={selectedAirport}
                  onChange={(e) => { setSelectedAirport(e.target.value); setSelectedPair('none'); }}
                   // Options are based on airports present in the *filtered* data
                  disabled={loading || !displayedData.allAirports || displayedData.allAirports.length === 0}
                >
                  <option value="all">All Destinations</option>
                  {/* Sort airports alphabetically for dropdown */}
                  {[...displayedData.allAirports].sort().map(airport => (
                    <option key={airport} value={airport}>{airport}</option>
                  ))}
                </select>
              </div>

              <div className="filter-section">
                <label htmlFor="pair-filter">Filter by Airport Pair (Origin-Destination):</label>
                <select
                  id="pair-filter"
                  value={selectedPair}
                  onChange={(e) => { setSelectedPair(e.target.value); setSelectedAirport('all'); }}
                  // Options are based on pairs present in the *filtered* data
                  disabled={loading || !displayedData.allPairs || displayedData.allPairs.length === 0}
                >
                  <option value="none">No Pair Selected</option>
                   {/* Sort pairs alphabetically for dropdown */}
                  {[...displayedData.allPairs].sort().map(pair => (
                    <option key={pair} value={pair}>{pair}</option>
                  ))}
                </select>
              </div>
            </div>


            {/* --- Charts Grid (Uses data derived from displayedData) --- */}
             {/* Add a check if displayedData exists and has data before rendering charts */}
             {displayedData.totalFlightsProcessed > 0 ? (
                <div className="charts-grid">
                  {/* Row 1: Top Destinations/Pairs (from filtered data) */}
                  <div className="chart-container">
                    <BarChart
                      title="Top 20 Destination Airports"
                      labels={displayedData.sortedAirports.map(([id]) => id)}
                      data={displayedData.sortedAirports.map(([, count]) => count)}
                      label="Total Landings"
                      onBarClick={handleAirportClick}
                    />
                  </div>
                  <div className="chart-container">
                    <BarChart
                      title="Top 20 Most Frequent Legs"
                      labels={displayedData.sortedPairs.map(([pair]) => pair)}
                      data={displayedData.sortedPairs.map(([, count]) => count)}
                      label="Total Flights"
                      onBarClick={handlePairClick}
                    />
                  </div>

                  {/* Row 2: Activity by Time (uses displayLandingsByDay/Hour derived from displayedData) */}
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

                  {/* Row 3: Arrivals From (uses arrivalsFromChartData derived from displayedData) */}
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
                   {/* Placeholder if destination selected but no arrival data *in the filtered range* */}
                   {selectedAirport !== 'all' && arrivalsFromChartData.length === 0 && (
                    <div className="chart-container chart-placeholder">
                       No arrival data recorded for {selectedAirport} { dateRange ? 'in the selected date range.' : '.'}
                    </div>
                   )}


                  {/* Row 4: Daily Activity (uses filteredDailyActivityChartData derived from displayedData) */}
                  {filteredDailyActivityChartData.labels && filteredDailyActivityChartData.labels.length > 0 && (
                    <div className="chart-container full-width">
                      {/* Use DualBarChart or TimeSeriesChart - Using DualBarChart as before */}
                       <DualBarChart
                          key={`daily-${activeFilterLabel}-${dateRange?.start}-${dateRange?.end}`} // Key needs to change with data/filter
                          title={`Daily Activity Over Time (${activeFilterLabel})`}
                          labels={filteredDailyActivityChartData.labels}
                          data1={filteredDailyActivityChartData.uniqueAircraftCounts}
                          label1="# Unique Aircraft"
                          data2={filteredDailyActivityChartData.totalLandings}
                          label2={selectedPair !== 'none' ? '# Flights' : '# Flights'}
                      />
                      {/* Example using TimeSeriesChart instead:
                      <TimeSeriesChart
                        key={`daily-ts-${activeFilterLabel}-${startDate}-${endDate}`}
                        title={`Daily Activity Over Time (${activeFilterLabel})`}
                        labels={filteredDailyActivityChartData.labels}
                        data1={filteredDailyActivityChartData.uniqueAircraftCounts}
                        label1="# Unique Aircraft"
                        data2={filteredDailyActivityChartData.totalLandings}
                        label2={selectedPair !== 'none' ? '# Flights' : '# Landings'}
                      />
                      */}
                    </div>
                  )}
                   {/* Placeholder if no daily data to show */}
                   {(!filteredDailyActivityChartData.labels || filteredDailyActivityChartData.labels.length === 0) && (
                       <div className="chart-container full-width chart-placeholder">
                          No daily activity data to display { dateRange ? 'for the selected date range.' : '.'}
                       </div>
                   )}
                </div>
              ) : (
                   // Show message if filters result in no data
                   <p className="info-message">No flight data available for the selected date range or filters.</p>
              )}
          </>
        )}
      </div>
    </I18nProvider>
  );
}

export default App; 