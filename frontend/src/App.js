import React, { useState, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
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
      }
    }
    aircraftLastAirport[icao24] = airportId;
  });

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
    allAirports: Object.keys(airportCounts).sort(),
    allPairs: Object.keys(airportPairs).sort()
  };
};

// --- Chart Components ---

const BarChart = ({ title, labels, data, label }) => {
  // Check if data is valid before rendering
  if (!Array.isArray(data) || data.length === 0 || !labels || labels.length === 0) {
      // Optionally return a placeholder or null
      // console.log("BarChart: Invalid data or labels", { title, data, labels });
      return <div className="chart-placeholder">No data to display for "{title}"</div>;
  }

  const chartData = {
    labels,
    datasets: [
      {
        label: label || 'Count',
        data: data,
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        borderColor: 'rgba(53, 162, 235, 1)',
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
      },
      title: {
        display: true,
        text: title,
      },
    },
     scales: {
        y: {
            beginAtZero: true,
            ticks: {
                precision: 0 // Ensure y-axis ticks are integers
            }
        },
        x: {
            ticks: {
                autoSkip: true,
                maxRotation: 45, // Rotate labels slightly if needed
                minRotation: 0
            }
        }
    }
  };
  // Add a wrapper div to control size if necessary, especially with maintainAspectRatio: false
  return <div style={{ position: 'relative', height: '300px', width: '100%' }}><Bar options={options} data={chartData} /></div>;
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


  // Memoized data for Airport-filtered charts
  const airportFilteredLandingsByDay = useMemo(() => {
      if (!data) return [];
      if (selectedAirport === 'all') return data.landingsByDay;
      return data.airportLandingsByDay[selectedAirport] || Array(7).fill(0);
  }, [data, selectedAirport]);

  const airportFilteredLandingsByHour = useMemo(() => {
      if (!data) return [];
       if (selectedAirport === 'all') return data.landingsByHour;
      return data.airportLandingsByHour[selectedAirport] || Array(24).fill(0);
  }, [data, selectedAirport]);

  // Memoized data for Pair-filtered charts
   const pairFilteredLandingsByDay = useMemo(() => {
      if (!data || selectedPair === 'none' || !data.pairLandingsByDay[selectedPair]) return [];
      return data.pairLandingsByDay[selectedPair];
  }, [data, selectedPair]);

  const pairFilteredLandingsByHour = useMemo(() => {
       if (!data || selectedPair === 'none' || !data.pairLandingsByHour[selectedPair]) return [];
       return data.pairLandingsByHour[selectedPair];
  }, [data, selectedPair]);


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
          <div className="summary-stats" style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px', backgroundColor: '#f9f9f9' }}>
            <h2>Summary Statistics</h2>
            <p><strong>Time Range:</strong> {formatDateTime(data.earliestTime)} - {formatDateTime(data.latestTime)}</p>
            <p><strong>Total Landings Processed:</strong> {data.totalLandings.toLocaleString()}</p>
            <p><strong>Unique Aircraft (ICAO24):</strong> {data.uniqueAircraftCount.toLocaleString()}</p>
            <p><strong>Unique Callsigns:</strong> {data.uniqueCallsignCount.toLocaleString()}</p>
          </div>

          <div className="filters-container" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap' }}>
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
            {/* --- Row 1: Overall Activity --- */}
            <div className="chart-container">
              <BarChart
                title="Top 20 Most Active Airports"
                labels={data.sortedAirports.map(([id]) => id)}
                data={data.sortedAirports.map(([, count]) => count)}
                label="Total Landings"
              />
            </div>
            <div className="chart-container">
              <BarChart
                title="Top 20 Most Frequent Airport Pairs"
                labels={data.sortedPairs.map(([pair]) => pair)}
                data={data.sortedPairs.map(([, count]) => count)}
                label="Total Flights"
              />
            </div>

            {/* --- Row 2: Activity by Time (Filtered by Airport) --- */}
            <div className="chart-container">
               <BarChart
                title={`Landings by Day of Week (${selectedAirport === 'all' ? 'All Airports' : selectedAirport})`}
                labels={dayLabels}
                data={airportFilteredLandingsByDay}
                label="Landings"
              />
            </div>
            <div className="chart-container">
              <BarChart
                title={`Landings by Hour of Day (${selectedAirport === 'all' ? 'All Airports' : selectedAirport})`}
                labels={hourLabels}
                data={airportFilteredLandingsByHour}
                label="Landings"
              />
            </div>

            {/* --- Row 3: Activity by Time (Filtered by Pair) --- */}
             {selectedPair !== 'none' && ( // Only show pair charts if a pair is selected
                <>
                   <div className="chart-container">
                      <BarChart
                         title={`Flights by Day of Week (Pair: ${selectedPair})`}
                         labels={dayLabels}
                         data={pairFilteredLandingsByDay}
                         label="Flights"
                       />
                   </div>
                   <div className="chart-container">
                      <BarChart
                         title={`Flights by Hour of Day (Pair: ${selectedPair})`}
                         labels={hourLabels}
                         data={pairFilteredLandingsByHour}
                         label="Flights"
                       />
                   </div>
                </>
             )}
          </div>
        </>
      )}
    </div>
  );
}

export default App; 