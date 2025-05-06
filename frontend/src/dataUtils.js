import {
  getLocalTimeZone,
  CalendarDate,
  // Potentially others like toCalendarDate if needed later
} from '@internationalized/date';

// --- Data Processing Logic ---

// Step 1: Initial Processing (Parse, Validate, Sort, Get Range)
export const processInitialData = (flights) => {
  // Filter out invalid landing_times *before* sorting and processing
  const validFlights = flights.filter(flight => {
    const time = flight.landing_time; // Use landing_time
    if (!time) return false;
    try {
      const d = new Date(time);
      return !isNaN(d.getTime());
    } catch (e) {
      return false; // Handle potential Date constructor errors
    }
  }).map(flight => ({ // Convert times to Date objects early
    ...flight,
    landing_time: new Date(flight.landing_time), // Keep landing_time as main timestamp
    // Keep takeoff_time if it exists (it might be null/empty)
    takeoff_time: flight.takeoff_time ? new Date(flight.takeoff_time) : null, 
    // Preserve registration field
    registration: flight.registration || null,
  })).sort((a, b) => a.landing_time - b.landing_time); // Sort by landing_time (Date objects)

  if (validFlights.length === 0) {
    throw new Error("No valid rows with parseable landing_times found in CSV.");
  }

  // Determine min/max time from the sorted valid flights based on landing_time
  const minTime = validFlights[0].landing_time;
  const maxTime = validFlights[validFlights.length - 1].landing_time;

  return {
    rawFlights: validFlights, // Return the raw, sorted, validated flights with Date objects
    earliestTime: minTime, // This now represents earliest *landing* time
    latestTime: maxTime,   // This now represents latest *landing* time
  };
};


// Step 2: Aggregation Logic (Takes a list of flights, returns aggregated stats/charts)
export const aggregateFlightData = (flights) => {
  if (!flights || flights.length === 0) {
    // Return empty/default structure if no flights after filtering
    return {
      totalFlightsProcessed: 0,
      uniqueAircraftCount: 0,
      uniqueCallsignCount: 0,
      uniqueRegistrationCount: 0,  // New field for unique registrations
      topCallsigns: [],
      topIcaos: [],
      topRegistrations: [],        // New field for top registrations
      allSortedCallsigns: [],
      allSortedIcaos: [],
      allSortedRegistrations: [],  // New field for all sorted registrations
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
      pairDailyActivity: {},
      numberOfDays: 0
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
  const uniqueRegistrations = new Set(); // New set for unique registrations
  const callsignCounts = {}; // Track callsign frequencies
  const icaoCounts = {}; // Track ICAO hex frequencies
  const registrationCounts = {}; // Track registration frequencies
  const arrivalsFrom = {}; // Stores arrivals count: arrivalsFrom[destination][origin] = count
  const airportDailyActivity = {}; // Stores airport-specific daily activity
  const pairDailyActivity = {}; // Stores pair-specific daily activity

  // Min/max times for the *filtered* set (if needed for display, otherwise use overall min/max)
  let minTime = flights[0].landing_time; // Use landing_time
  let maxTime = flights[flights.length - 1].landing_time; // Use landing_time (already sorted)

  flights.forEach(flight => {
    // Destructure using new column names. Ensure origin/destination are present for pair logic.
    // landing_time is already a Date object here
    const { landing_time, icao, origin, destination, callsign, takeoff_time, registration } = flight; // Added registration
    if (!icao || !destination) return; // Skip if essential info missing for destination stats

    // Use landing_time for calculations
    const calculationTime = landing_time; // Alias for clarity if needed, or just use landing_time directly

    const dayOfWeek = calculationTime.getDay(); // 0=Sun, 6=Sat
    const hourOfDay = calculationTime.getHours();

    // Add to sets for unique counts
    uniqueIcaos.add(icao);
    icaoCounts[icao] = (icaoCounts[icao] || 0) + 1;
    
    if (callsign) {
      const trimmedCallsign = callsign.trim();
      uniqueCallsigns.add(trimmedCallsign);
      callsignCounts[trimmedCallsign] = (callsignCounts[trimmedCallsign] || 0) + 1;
    }
    
    // Track registrations if present
    if (registration) {
      const trimmedRegistration = registration.trim();
      uniqueRegistrations.add(trimmedRegistration);
      registrationCounts[trimmedRegistration] = (registrationCounts[trimmedRegistration] || 0) + 1;
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

      // Create a map for quick lookup of flights by date string (using landing_time)
      const flightsByDate = {};
      flights.forEach(flight => {
          const dateStr = flight.landing_time.toISOString().split('T')[0]; // Use landing_time
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

  // Get the top callsigns
  const topCallsigns = Object.entries(callsignCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 5);

  // Get the top ICAO hexes
  const topIcaos = Object.entries(icaoCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 5);
    
  // Get the top registrations
  const topRegistrations = Object.entries(registrationCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 5);

  // Get full sorted lists (all items for detailed tables)
  const allSortedCallsigns = Object.entries(callsignCounts)
    .sort(([, countA], [, countB]) => countB - countA);
    
  const allSortedIcaos = Object.entries(icaoCounts)
    .sort(([, countA], [, countB]) => countB - countA);
    
  // Get all sorted registrations
  const allSortedRegistrations = Object.entries(registrationCounts)
    .sort(([, countA], [, countB]) => countB - countA);

  // Return aggregated data based on the input flight list
  return {
    // Stats for the *filtered* period
    totalFlightsProcessed: flights.length,
    uniqueAircraftCount: uniqueIcaos.size,
    uniqueCallsignCount: uniqueCallsigns.size,
    uniqueRegistrationCount: uniqueRegistrations.size,  // New field
    topCallsigns,
    topIcaos,
    topRegistrations,  // New field
    allSortedCallsigns,
    allSortedIcaos,
    allSortedRegistrations,  // New field
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
    pairDailyActivity,
    numberOfDays: dailyLabels.length
  };
};


// --- Utility Functions ---

// Helper to format Date objects or ISO strings
export const formatDateTime = (dateOrIsoString) => {
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

// --- Convert JS Date to CalendarDate for min/max Value ---  
export const getCalendarDate = (jsDate) => {
    if (!jsDate || !(jsDate instanceof Date)) return undefined;
    // Convert JS Date (local) into a CalendarDate object
    // We need year, month, day in the *local* time zone
    return new CalendarDate(jsDate.getFullYear(), jsDate.getMonth() + 1, jsDate.getDate());
    // Alternative if timestamps are UTC: use parseAbsoluteToLocal(jsDate.toISOString()).date;
    // Or more robustly if input is guaranteed UTC:
    // return toCalendarDate(new CalendarDateTime(jsDate.getUTCFullYear(), jsDate.getUTCMonth() + 1, jsDate.getUTCDate(), jsDate.getUTCHours(), jsDate.getUTCMinutes()));
  }; 