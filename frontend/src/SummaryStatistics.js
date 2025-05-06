import React, { useState } from 'react';

const SummaryStatistics = ({ displayedData }) => {
    const [showDetailedStats, setShowDetailedStats] = useState(false);
    const [callsignPage, setCallsignPage] = useState(1);
    const [icaoPage, setIcaoPage] = useState(1);
    const itemsPerPage = 25; // Show 25 items per page
    
    if (!displayedData) return null; // Don't render if no data

    const toggleDetailedStats = () => {
        setShowDetailedStats(!showDetailedStats);
        // Reset pagination when showing/hiding
        setCallsignPage(1);
        setIcaoPage(1);
    };
    
    // Calculate pagination for callsigns
    const callsignTotalPages = Math.ceil((displayedData.allSortedCallsigns?.length || 0) / itemsPerPage);
    const callsignStart = (callsignPage - 1) * itemsPerPage;
    const callsignEnd = callsignStart + itemsPerPage;
    const paginatedCallsigns = displayedData.allSortedCallsigns?.slice(callsignStart, callsignEnd) || [];
    
    // Calculate pagination for ICAOs
    const icaoTotalPages = Math.ceil((displayedData.allSortedIcaos?.length || 0) / itemsPerPage);
    const icaoStart = (icaoPage - 1) * itemsPerPage;
    const icaoEnd = icaoStart + itemsPerPage;
    const paginatedIcaos = displayedData.allSortedIcaos?.slice(icaoStart, icaoEnd) || [];

    return (
        <div className="summary-stats">
            <h2>Summary Statistics</h2>
            {/* Use stats from displayedData which reflects filtering */}
            <p><strong>Total Flights:</strong> {displayedData.totalFlightsProcessed.toLocaleString()}</p>
            <p><strong>Unique Aircraft:</strong> {displayedData.uniqueAircraftCount.toLocaleString()}</p>
            <p><strong>Unique Callsigns:</strong> {displayedData.uniqueCallsignCount.toLocaleString()}</p>
            
            {/* Condensed view of top callsigns and ICAOs */}
            <div className="top-stats-preview">
                {displayedData.topCallsigns && displayedData.topCallsigns.length > 0 && (
                    <div className="top-callsigns">
                        <p><strong>Top Callsigns:</strong></p>
                        <ul>
                            {displayedData.topCallsigns.map(([callsign, count], index) => (
                                <li key={index}>{callsign}: {count.toLocaleString()}</li>
                            ))}
                        </ul>
                    </div>
                )}
                
                {displayedData.topIcaos && displayedData.topIcaos.length > 0 && (
                    <div className="top-icaos">
                        <p><strong>Top ICAO Hexes:</strong></p>
                        <ul>
                            {displayedData.topIcaos.map(([icao, count], index) => (
                                <li key={index}>{icao}: {count.toLocaleString()}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
            
            {/* Toggle button for detailed tables */}
            {(displayedData.topCallsigns?.length > 0 || displayedData.topIcaos?.length > 0) && (
                <button 
                    className="stats-toggle-button"
                    onClick={toggleDetailedStats}
                    aria-expanded={showDetailedStats}
                >
                    {showDetailedStats ? 'Hide Details ▲' : 'Show Details ▼'}
                </button>
            )}
            
            {/* Detailed tables section - with FlightsTable styling */}
            {showDetailedStats && (
                <div className="table-section">
                    <div className="stats-tables-container">
                        {/* Callsigns Table */}
                        <div className="table-container">
                            <h3>All Callsigns ({displayedData.allSortedCallsigns.length})</h3>
                            
                            {/* Callsign pagination - moved to top */}
                            {callsignTotalPages > 1 && (
                                <div className="stats-pagination">
                                    <button 
                                        onClick={() => setCallsignPage(prev => Math.max(prev - 1, 1))}
                                        disabled={callsignPage === 1}
                                    >
                                        Previous
                                    </button>
                                    <span className="page-info">
                                        Page {callsignPage} of {callsignTotalPages}
                                    </span>
                                    <button 
                                        onClick={() => setCallsignPage(prev => Math.min(prev + 1, callsignTotalPages))}
                                        disabled={callsignPage === callsignTotalPages}
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                            
                            <table className="flights-table">
                                <thead>
                                    <tr>
                                        <th>Callsign</th>
                                        <th>Flights</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedCallsigns.map(([callsign, count], index) => (
                                        <tr key={index}>
                                            <td>{callsign}</td>
                                            <td>{count.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* ICAO Hexes Table */}
                        <div className="table-container">
                            <h3>All ICAO Hexes ({displayedData.allSortedIcaos.length})</h3>
                            
                            {/* ICAO pagination - moved to top */}
                            {icaoTotalPages > 1 && (
                                <div className="stats-pagination">
                                    <button 
                                        onClick={() => setIcaoPage(prev => Math.max(prev - 1, 1))}
                                        disabled={icaoPage === 1}
                                    >
                                        Previous
                                    </button>
                                    <span className="page-info">
                                        Page {icaoPage} of {icaoTotalPages}
                                    </span>
                                    <button 
                                        onClick={() => setIcaoPage(prev => Math.min(prev + 1, icaoTotalPages))}
                                        disabled={icaoPage === icaoTotalPages}
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                            
                            <table className="flights-table">
                                <thead>
                                    <tr>
                                        <th>ICAO Hex</th>
                                        <th>Flights</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedIcaos.map(([icao, count], index) => (
                                        <tr key={index}>
                                            <td>{icao}</td>
                                            <td>{count.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            
            <p><strong>Number of Days:</strong> {displayedData.numberOfDays}</p>
        </div>
    );
};

export default SummaryStatistics; 