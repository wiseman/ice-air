import React from 'react';

const SummaryStatistics = ({ displayedData }) => {
    if (!displayedData) return null; // Don't render if no data

    return (
        <div className="summary-stats">
            <h2>Summary Statistics</h2>
            {/* Use stats from displayedData which reflects filtering */}
            <p><strong>Total Flights:</strong> {displayedData.totalFlightsProcessed.toLocaleString()}</p>
            <p><strong>Unique Aircraft:</strong> {displayedData.uniqueAircraftCount.toLocaleString()}</p>
            <p><strong>Unique Callsigns:</strong> {displayedData.uniqueCallsignCount.toLocaleString()}</p>
            <p><strong>Number of Days:</strong> {displayedData.numberOfDays}</p>
        </div>
    );
};

export default SummaryStatistics; 