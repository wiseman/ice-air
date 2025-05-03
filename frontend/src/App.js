import React, { useState, useCallback, useMemo, useRef, useEffect, Suspense } from 'react';
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
  Heading,
  ComboBox,
  Input,
  ListBox,
  ListBoxItem,
  Key
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
import MapView from './MapView';
import FlightsTable from './FlightsTable';
import './styles.css'; // Import the CSS file
import { processInitialData, aggregateFlightData, getCalendarDate, formatDateTime } from './dataUtils';
import SummaryStatistics from './SummaryStatistics';
// Import the extracted chart components
import BarChart from './BarChart';
import DualBarChart from './DualBarChart';
import TimeSeriesChart from './TimeSeriesChart';

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

// --- Chart Components --- (MOVED TO SEPARATE FILES)

// const BarChart = ({ title, labels, data, label, onBarClick }) => {
//   // ... (code moved)
// };
//
// // --- NEW Dual Bar Chart Component --- (MOVED TO SEPARATE FILES)
// const DualBarChart = ({ title, labels, data1, label1, data2, label2 }) => {
//   // ... (code moved)
// };
//
// // --- NEW Time Series Chart Component --- (MOVED TO SEPARATE FILES)
// const TimeSeriesChart = ({ title, labels, data1, label1, data2, label2 }) => {
//   // ... (code moved)
// };

// --- Main App Component ---

function App() {
  const [initialData, setInitialData] = useState(null); // Holds rawFlights, earliestTime, latestTime
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAirport, setSelectedAirport] = useState('all'); // Destination filter - Use Key type
  const [selectedPair, setSelectedPair] = useState('none'); // Pair filter - Use Key type
  const [dateRange, setDateRange] = useState(null); // Holds { start: DateValue, end: DateValue } or null
  const fileInputRef = React.createRef();

  // State for ComboBox input values
  const [airportInputValue, setAirportInputValue] = useState('');
  const [pairInputValue, setPairInputValue] = useState('');
  
  // Debounce timers for input changes
  const airportInputTimer = useRef(null);
  const pairInputTimer = useRef(null);

  // Add error handler for ResizeObserver errors
  useEffect(() => {
    // Suppress ResizeObserver loop limit exceeded error
    const errorHandler = (e) => {
      if (e && e.message && e.message.includes('ResizeObserver')) {
        // Prevent the error from being displayed in console
        e.stopImmediatePropagation();
      }
    };
    
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setInitialData(null); // Clear previous raw data
    setSelectedAirport('all');
    setSelectedPair('none');
    setAirportInputValue(''); // Reset input values
    setPairInputValue(''); // Reset input values
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

    let flightsToFilter = initialData.rawFlights;

    // 1. Filter by Date Range
    if (dateRange?.start && dateRange?.end) {
      const startFilterTime = dateRange.start.toDate(getLocalTimeZone());
      startFilterTime.setHours(0, 0, 0, 0); // Start of the day
      const endFilterTime = dateRange.end.toDate(getLocalTimeZone());
      endFilterTime.setHours(23, 59, 59, 999); // End of the day

      flightsToFilter = flightsToFilter.filter(flight => {
        const flightTimeMs = flight.timestamp.getTime();
        const afterStart = flightTimeMs >= startFilterTime.getTime();
        const beforeEnd = flightTimeMs <= endFilterTime.getTime();
        return afterStart && beforeEnd;
      });
    }

    // 2. Filter by Selected Airport (Destination)
    if (selectedAirport !== 'all') {
      flightsToFilter = flightsToFilter.filter(flight => flight.destination === selectedAirport);
    }

    // 3. Filter by Selected Pair (Origin-Destination)
    // This takes precedence if both airport and pair are somehow selected (UI prevents this)
    if (selectedPair !== 'none') {
      flightsToFilter = flightsToFilter.filter(flight =>
          flight.origin && flight.destination && `${flight.origin}-${flight.destination}` === selectedPair
      );
    }

    return flightsToFilter;
    
  }, [initialData?.rawFlights, dateRange, selectedAirport, selectedPair]); // <-- Add selectedAirport and selectedPair to dependencies

  // New memoized value for date-filtered flights only (no airport/pair filtering)
  // This is used for top charts and ComboBox options
  const dateFilteredFlights = useMemo(() => {
    if (!initialData?.rawFlights) return [];

    let flightsToFilter = initialData.rawFlights;

    // Only apply date filtering
    if (dateRange?.start && dateRange?.end) {
      const startFilterTime = dateRange.start.toDate(getLocalTimeZone());
      startFilterTime.setHours(0, 0, 0, 0); // Start of the day
      const endFilterTime = dateRange.end.toDate(getLocalTimeZone());
      endFilterTime.setHours(23, 59, 59, 999); // End of the day

      flightsToFilter = flightsToFilter.filter(flight => {
        const flightTimeMs = flight.timestamp.getTime();
        const afterStart = flightTimeMs >= startFilterTime.getTime();
        const beforeEnd = flightTimeMs <= endFilterTime.getTime();
        return afterStart && beforeEnd;
      });
    }

    return flightsToFilter;
  }, [initialData?.rawFlights, dateRange]);

  // --- Aggregation on Filtered Data ---
  const displayedData = useMemo(() => {
    // This performs all calculations (counts, stats, daily activity)
    // based *only* on the flights that passed the date filter.
    const aggData = aggregateFlightData(filteredFlights);

     // Ensure input values are updated if selection changes due to filtering
     if (selectedAirport !== 'all' && !aggData.allAirports.includes(selectedAirport)) {
       setSelectedAirport('all');
       setAirportInputValue('');
     }
     if (selectedPair !== 'none' && !aggData.allPairs.includes(selectedPair)) {
       setSelectedPair('none');
       setPairInputValue('');
     }

    return aggData;
  }, [filteredFlights, selectedAirport, selectedPair]); // Add selectedAirport/Pair

  // New aggregation for top charts - only uses date filtering
  const topChartsData = useMemo(() => {
    // This performs aggregation on date-filtered flights only
    return aggregateFlightData(dateFilteredFlights);
  }, [dateFilteredFlights]);


  // --- Click Handlers for Charts ---
  const handleAirportClick = useCallback((airportId) => {
    // Use topChartsData.allAirports which contains all airports in the date range
    if (topChartsData && topChartsData.allAirports.includes(airportId)) {
      setSelectedAirport(airportId);
      setSelectedPair('none');
      setAirportInputValue(airportId); // Update input field text
      setPairInputValue('');
    }
  }, [topChartsData]); // Depends on topChartsData now

  const handlePairClick = useCallback((pairId) => {
    // Use topChartsData.allPairs which contains all pairs in the date range
    if (topChartsData && topChartsData.allPairs.includes(pairId)) {
      setSelectedPair(pairId);
      setSelectedAirport('all');
      setPairInputValue(pairId); // Update input field text
      setAirportInputValue('');
    }
  }, [topChartsData]); // Depends on topChartsData now

  // --- NEW: Handler for map clicks ---
  const handleMapAirportClick = useCallback((airportCode) => {
    // Check if the clicked airport is valid within the current context
    if (topChartsData && topChartsData.allAirports.includes(airportCode)) {
      setSelectedAirport(airportCode);
      setSelectedPair('none'); // Reset pair filter when airport is clicked on map
      setAirportInputValue(airportCode); // Update input value
      setPairInputValue('');
    }
  }, [topChartsData]); // Use topChartsData for validation

  // --- NEW: Handler for map background clicks ---
  const handleMapBackgroundClick = useCallback(() => {
    setSelectedAirport('all');
    setSelectedPair('none');
    setAirportInputValue(''); // Clear input values
    setPairInputValue('');
  }, []); // No dependencies needed

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
  // const getCalendarDate = (jsDate) => {
  //   if (!jsDate || !(jsDate instanceof Date)) return undefined;
  //   // Convert JS Date (local) into a CalendarDate object
  //   // We need year, month, day in the *local* time zone
  //   return new CalendarDate(jsDate.getFullYear(), jsDate.getMonth() + 1, jsDate.getDate());
  //   // Alternative if timestamps are UTC: use parseAbsoluteToLocal(jsDate.toISOString()).date;
  //   // Or more robustly if input is guaranteed UTC:
  //   // return toCalendarDate(new CalendarDateTime(jsDate.getUTCFullYear(), jsDate.getUTCMonth() + 1, jsDate.getUTCDate(), jsDate.getUTCHours(), jsDate.getUTCMinutes()));
  // };

  // --- Determine if filters are active --- 
  const isDateRangeFiltered = useMemo(() => {
    // Check if the dateRange is set and different from the initial full range
    if (!dateRange || !initialData?.earliestTime || !initialData?.latestTime) {
        return false; // No range set or initial data not ready
    }
    const startMatchesInitial = dateRange.start.compare(getCalendarDate(initialData.earliestTime)) === 0;
    const endMatchesInitial = dateRange.end.compare(getCalendarDate(initialData.latestTime)) === 0;
    return !(startMatchesInitial && endMatchesInitial);
  }, [dateRange, initialData?.earliestTime, initialData?.latestTime]);

  const isAirportFiltered = selectedAirport !== 'all';
  const isPairFiltered = selectedPair !== 'none';
  const filtersActive = isDateRangeFiltered || isAirportFiltered || isPairFiltered;

  // --- Handlers for ComboBox Selection ---
  const handleAirportSelectionChange = useCallback((key) => {
      if (key === null) { // Handle case where user clears selection or types non-matching value
          setSelectedAirport('all');
          setAirportInputValue(''); // Clear input if selection cleared
      } else {
          setSelectedAirport(key);
          const selectedText = key === 'all' ? '' : (displayedData?.allAirports.find(a => a === key) || '');
          setAirportInputValue(selectedText); // Update input to match selection
      }
      // Reset pair filter when airport changes
      setSelectedPair('none');
      setPairInputValue('');
  }, [displayedData?.allAirports]);

  const handlePairSelectionChange = useCallback((key) => {
      if (key === null) {
          setSelectedPair('none');
          setPairInputValue('');
      } else {
          setSelectedPair(key);
          const selectedText = key === 'none' ? '' : (displayedData?.allPairs.find(p => p === key) || '');
          setPairInputValue(selectedText); // Update input to match selection
      }
      // Reset airport filter when pair changes
      setSelectedAirport('all');
      setAirportInputValue('');
  }, [displayedData?.allPairs]);

  // Debounced input change handlers
  const handleAirportInputChange = useCallback((value) => {
    // Clear any existing timeout
    if (airportInputTimer.current) {
      clearTimeout(airportInputTimer.current);
    }
    
    // Debounce the input change by 50ms
    airportInputTimer.current = setTimeout(() => {
      setAirportInputValue(value);
    }, 50);
  }, []);

  const handlePairInputChange = useCallback((value) => {
    // Clear any existing timeout
    if (pairInputTimer.current) {
      clearTimeout(pairInputTimer.current);
    }
    
    // Debounce the input change by 50ms
    pairInputTimer.current = setTimeout(() => {
      setPairInputValue(value);
    }, 50);
  }, []);

  // --- Prepare options for ComboBoxes (with filtering by text only) ---
  const airportOptions = useMemo(() => {
    if (!topChartsData?.allAirports) return [{ id: 'all', name: 'All Destinations' }];
    // Filter by input text only, not by selectedAirport
    const filtered = topChartsData.allAirports
      .filter(airport => airport.toLowerCase().includes(airportInputValue.toLowerCase()))
      .sort();
    return [
      { id: 'all', name: 'All Destinations' },
      ...filtered.map(airport => ({ id: airport, name: airport }))
    ];
  }, [topChartsData?.allAirports, airportInputValue]);

  const pairOptions = useMemo(() => {
    if (!topChartsData?.allPairs) return [{ id: 'none', name: 'No Pair Selected' }];
    // Filter by input text only, not by selectedPair
    const filtered = topChartsData.allPairs
      .filter(pair => pair.toLowerCase().includes(pairInputValue.toLowerCase()))
      .sort();
    return [
      { id: 'none', name: 'No Pair Selected' },
      ...filtered.map(pair => ({ id: pair, name: pair }))
    ];
  }, [topChartsData?.allPairs, pairInputValue]);

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
            <SummaryStatistics displayedData={displayedData} />

             {/* --- NEW: ComboBox Filters --- */}
            <div className="filters-container">
                <div className="filter-section">
                  <ComboBox
                    label="Filter by Destination Airport:"
                    items={airportOptions}
                    selectedKey={selectedAirport}
                    onSelectionChange={handleAirportSelectionChange}
                    inputValue={airportInputValue}
                    onInputChange={handleAirportInputChange}
                    allowsCustomValue={false} // Don't allow values not in the list
                    isDisabled={loading || !displayedData.allAirports}
                    aria-label="Filter by Destination Airport" // Good for accessibility
                    menuTrigger="input" // Open on typing
                  >
                    <Label>Destination Airport:</Label>
                    <Group className="combobox-group"> {/* Use Group for styling input + button */}
                        <Input className="combobox-input" />
                        <Button className="combobox-button">▼</Button>
                    </Group>
                    <Popover className="combobox-popover">
                        <ListBox className="combobox-listbox">
                            {(item) => <ListBoxItem textValue={item.name} className="combobox-item">{item.name}</ListBoxItem>}
                        </ListBox>
                    </Popover>
                </ComboBox>
              </div>

              <div className="filter-section">
                 <ComboBox
                    label="Filter by Airport Pair (Origin-Destination):"
                    items={pairOptions}
                    selectedKey={selectedPair}
                    onSelectionChange={handlePairSelectionChange}
                    inputValue={pairInputValue}
                    onInputChange={handlePairInputChange}
                    allowsCustomValue={false} // Don't allow values not in the list
                    isDisabled={loading || !displayedData.allPairs}
                    aria-label="Filter by Airport Pair"
                    menuTrigger="input"
                  >
                    <Label>Airport Pair (Origin-Dest):</Label>
                    <Group className="combobox-group">
                        <Input className="combobox-input" />
                        <Button className="combobox-button">▼</Button>
                    </Group>
                    <Popover className="combobox-popover">
                        <ListBox className="combobox-listbox">
                           {(item) => <ListBoxItem textValue={item.name} className="combobox-item">{item.name}</ListBoxItem>}
                        </ListBox>
                    </Popover>
                </ComboBox>
              </div>
            </div>


            {/* --- Charts Grid (Uses data derived from displayedData) --- */}
             {/* Add a check if displayedData exists and has data before rendering charts */}
             {displayedData.totalFlightsProcessed > 0 ? (
                <div className="charts-grid">
                  {/* Row 1: Top Destinations/Pairs (from date-filtered data only) */}
                  <div className="chart-container">
                    <BarChart
                      title="Top 20 Destination Airports"
                      labels={topChartsData.sortedAirports.map(([id]) => id)}
                      data={topChartsData.sortedAirports.map(([, count]) => count)}
                      label="Total Landings"
                      onBarClick={handleAirportClick}
                    />
                  </div>
                  <div className="chart-container">
                    <BarChart
                      title="Top 20 Most Frequent Legs"
                      labels={topChartsData.sortedPairs.map(([pair]) => pair)}
                      data={topChartsData.sortedPairs.map(([, count]) => count)}
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
              
              {/* Map visualization section */}
              {displayedData.totalFlightsProcessed > 0 && (
                <div className="map-section">
                  <h2>Flight Routes Map</h2>
                  <MapView 
                    flightData={filteredFlights} 
                    selectedAirport={selectedAirport === 'all' ? null : selectedAirport}
                    selectedPair={selectedPair === 'none' ? null : selectedPair}
                    onAirportClick={handleMapAirportClick}
                    onBackgroundClick={handleMapBackgroundClick}
                  />
                </div>
              )}

            {/* --- Filtered Flights Table (conditional) --- */}
            {filtersActive && displayedData.totalFlightsProcessed > 0 && (
              <div className="table-section">
                 <FlightsTable flights={filteredFlights} />
              </div>
            )}
            {filtersActive && displayedData.totalFlightsProcessed === 0 && (
              <div className="table-section">
                 <p className="info-message">No flights match the current filter criteria.</p>
              </div>
            )}
          </>
        )}
      </div>
    </I18nProvider>
  );
}

export default App; 