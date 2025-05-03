import React from 'react';

// Helper to format Date objects nicely for the table
const formatTableDateTime = (date) => {
  if (!date || !(date instanceof Date)) return 'N/A';
  try {
    if (isNaN(date.getTime())) return 'Invalid Date';
    // Example format: YYYY-MM-DD HH:MM:SS (local time)
    return date.toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  } catch (e) {
    console.warn("Invalid date for table:", date);
    return 'Invalid Date';
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
            <th>Timestamp</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Callsign</th>
            {/* Add other relevant columns if needed */}
            {/* <th>ICAO</th> */}
          </tr>
        </thead>
        <tbody>
          {displayFlights.map((flight, index) => (
            <tr key={`${flight.timestamp?.toISOString()}-${flight.icao}-${index}`}> {/* Basic key */}
              <td>{formatTableDateTime(flight.timestamp)}</td>
              <td>{flight.origin || 'N/A'}</td>
              <td>{flight.destination || 'N/A'}</td>
              <td>{flight.callsign || 'N/A'}</td>
              {/* <td>{flight.icao || 'N/A'}</td> */}
            </tr>
          ))}
        </tbody>
      </table>
      {flights.length > displayFlights.length && (
        <p>...</p>
      )}
    </div>
  );
};

export default FlightsTable; 