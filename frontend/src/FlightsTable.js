import React, { useState, useEffect } from 'react';

// Helper to format Date objects nicely for the table (local time)
const formatTableDateTime = (date) => {
  if (!date || !(date instanceof Date)) return 'N/A';
  try {
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  } catch (e) {
    console.warn("Invalid date for table:", date);
    return 'Invalid Date';
  }
};

// Helper to format Date objects for ADSBExchange URL (UTC YYYY-MM-DD and HH:MM:SS)
const formatUrlDateTime = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return null;
  try {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}:${seconds}` };
  } catch (e) {
    console.warn("Invalid date for URL formatting:", date);
    return null;
  }
};

const FlightsTable = ({ flights }) => {
  const [aircraftDataMap, setAircraftDataMap] = useState(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAircraftData = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/aircraft.csv');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        const header = lines[0].split(',').map(h => h.trim());
        const icaoIndex = header.indexOf('icao');
        const manufacturerIndex = header.indexOf('Manufacturer');
        const typeIndex = header.indexOf('Type');
        const ownerIndex = header.indexOf('RegisteredOwners');

        if (icaoIndex === -1 || manufacturerIndex === -1 || typeIndex === -1 || ownerIndex === -1) {
          console.error('CSV header is missing required columns (icao, Manufacturer, Type, RegisteredOwners)');
          throw new Error('Invalid CSV header');
        }

        const dataMap = new Map();
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(','); // Simple split, assumes no commas within fields
          if (values.length === header.length) {
            const icao = values[icaoIndex].trim().toLowerCase();
            if (icao) {
              dataMap.set(icao, {
                Manufacturer: values[manufacturerIndex].trim(),
                Type: values[typeIndex].trim(),
                RegisteredOwners: values[ownerIndex].trim(),
              });
            }
          } else {
            console.warn(`Skipping malformed CSV line ${i + 1}: ${lines[i]}`);
          }
        }
        setAircraftDataMap(dataMap);
      } catch (error) {
        console.error("Failed to fetch or parse aircraft data:", error);
        // Handle error state if needed, maybe set an error flag in state
      } finally {
        setIsLoading(false);
      }
    };

    fetchAircraftData();
  }, []); // Empty dependency array ensures this runs only once on mount

  if (isLoading) {
    return <p>Loading aircraft data...</p>;
  }

  if (!flights || flights.length === 0) {
    return <p>No flights match the current filters.</p>;
  }

  // Limit the number of rows displayed for performance, e.g., first 100
  const displayFlights = flights.slice(0, 100); // Adjust limit as needed

  return (
    <div className="table-container">
      <h3>Filtered Flight Data ({flights.length} total matches{flights.length > displayFlights.length ? `, showing first ${displayFlights.length}` : ''})</h3>
      <table className="flights-table">
        <thead>
          <tr>
            <th>Landing Time</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Callsign</th>
            <th>Registration</th>
            {/* <th>ICAO</th> */} { /* Keep ICAO commented for now */}
            <th>Manufacturer</th>
            <th>Type</th>
            <th>Registered Owner</th>
            <th>Link</th> { /* New Link column */}
          </tr>
        </thead>
        <tbody>
          {displayFlights.map((flight, index) => {
            const landingTimeFormatted = formatTableDateTime(flight.landing_time);
            const lowerIcao = flight.icao ? flight.icao.toLowerCase() : null;
            const aircraftInfo = lowerIcao ? aircraftDataMap.get(lowerIcao) : null;

            const takeoffTime = formatUrlDateTime(flight.takeoff_time);
            const landingTimeUrl = formatUrlDateTime(flight.landing_time);
            
            let adsbLink = '#'; // Default link if times are invalid
            if (lowerIcao && takeoffTime && landingTimeUrl) {
              adsbLink = `https://globe.adsbexchange.com/?icao=${lowerIcao}&showTrace=${takeoffTime.date}&startTime=${takeoffTime.time}&endTime=${landingTimeUrl.time}`;
            } else if (lowerIcao && landingTimeUrl) {
               // Fallback if only landing time is valid - link to general ICAO page for the day
               adsbLink = `https://globe.adsbexchange.com/?icao=${lowerIcao}&showTrace=${landingTimeUrl.date}`;
            }

            return (
              <tr key={`${landingTimeFormatted}-${lowerIcao}-${index}`}> { /* Use landing time in key */}
                <td>{landingTimeFormatted}</td>
                <td>{flight.origin || 'N/A'}</td>
                <td>{flight.destination || 'N/A'}</td>
                <td>{flight.callsign || 'N/A'}</td>
                <td>{flight.registration || 'N/A'}</td>
                {/* <td>{lowerIcao || 'N/A'}</td> */}
                <td>{aircraftInfo ? aircraftInfo.Manufacturer : ''}</td>
                <td>{aircraftInfo ? aircraftInfo.Type : ''}</td>
                <td>{aircraftInfo ? aircraftInfo.RegisteredOwners : ''}</td>
                <td>
                  {adsbLink !== '#' ? (
                    <a href={adsbLink} target="_blank" rel="noopener noreferrer">
                      ADSBx
                    </a>
                  ) : (
                    <span>N/A</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {flights.length > displayFlights.length && (
        <p>...</p>
      )}
    </div>
  );
};

export default FlightsTable; 