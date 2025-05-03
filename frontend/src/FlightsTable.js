import React from 'react';

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
            {/* <th>ICAO</th> */} { /* Keep ICAO commented for now */}
            <th>Link</th> { /* New Link column */}
          </tr>
        </thead>
        <tbody>
          {displayFlights.map((flight, index) => {
            const landingTimeFormatted = formatTableDateTime(flight.landing_time);
            const icao = flight.icao || '';
            const takeoffTime = formatUrlDateTime(flight.takeoff_time);
            const landingTimeUrl = formatUrlDateTime(flight.landing_time);
            
            let adsbLink = '#'; // Default link if times are invalid
            if (icao && takeoffTime && landingTimeUrl) {
              adsbLink = `https://globe.adsbexchange.com/?icao=${icao}&showTrace=${takeoffTime.date}&startTime=${takeoffTime.time}&endTime=${landingTimeUrl.time}`;
            } else if (icao && landingTimeUrl) {
               // Fallback if only landing time is valid - link to general ICAO page for the day
               adsbLink = `https://globe.adsbexchange.com/?icao=${icao}&showTrace=${landingTimeUrl.date}`;
            }

            return (
              <tr key={`${landingTimeFormatted}-${icao}-${index}`}> { /* Use landing time in key */}
                <td>{landingTimeFormatted}</td>
                <td>{flight.origin || 'N/A'}</td>
                <td>{flight.destination || 'N/A'}</td>
                <td>{flight.callsign || 'N/A'}</td>
                {/* <td>{icao}</td> */}
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