import React, { useState } from 'react';

const SummaryStatistics = ({ displayedData }) => {
    const [showDetailedStats, setShowDetailedStats] = useState(false);
    const [callsignPage, setCallsignPage] = useState(1);
    const [registrationPage, setRegistrationPage] = useState(1);
    const itemsPerPage = 25; // Show 25 items per page
    
    if (!displayedData) return null; // Don't render if no data

    const toggleDetailedStats = () => {
        setShowDetailedStats(!showDetailedStats);
        // Reset pagination when showing/hiding
        setCallsignPage(1);
        setRegistrationPage(1);
    };
    
    // Calculate pagination for callsigns
    const callsignTotalPages = Math.ceil((displayedData.allSortedCallsigns?.length || 0) / itemsPerPage);
    const callsignStart = (callsignPage - 1) * itemsPerPage;
    const callsignEnd = callsignStart + itemsPerPage;
    const paginatedCallsigns = displayedData.allSortedCallsigns?.slice(callsignStart, callsignEnd) || [];
    
    // Calculate pagination for registrations
    const registrationTotalPages = Math.ceil((displayedData.allSortedRegistrations?.length || 0) / itemsPerPage);
    const registrationStart = (registrationPage - 1) * itemsPerPage;
    const registrationEnd = registrationStart + itemsPerPage;
    const paginatedRegistrations = displayedData.allSortedRegistrations?.slice(registrationStart, registrationEnd) || [];

    // Check if we should show top stats section
    const hasTopStats = displayedData.topCallsigns?.length > 0 || displayedData.topRegistrations?.length > 0;
    const hasCallsigns = displayedData.topCallsigns?.length > 0;
    const hasRegistrations = displayedData.topRegistrations?.length > 0;

    return (
        <div className="summary-stats">
            <h2>Summary Statistics</h2>
            {/* Use stats from displayedData which reflects filtering */}
            <p><strong>Total Flights:</strong> {displayedData.totalFlightsProcessed.toLocaleString()}</p>
            <p><strong>Unique Aircraft:</strong> {displayedData.uniqueAircraftCount.toLocaleString()}</p>
            <p><strong>Unique Callsigns:</strong> {displayedData.uniqueCallsignCount.toLocaleString()}</p>
            {displayedData.uniqueRegistrationCount > 0 && (
                <p><strong>Unique Registrations:</strong> {displayedData.uniqueRegistrationCount.toLocaleString()}</p>
            )}
            
            {/* Header row with Toggle button */}
            {hasTopStats && (
                <div className="top-stats-header">
                    <div className="top-stats-title">
                        <strong>Frequency Analysis</strong>
                    </div>
                    <button 
                        className="stats-toggle-button"
                        onClick={toggleDetailedStats}
                        aria-expanded={showDetailedStats}
                    >
                        {showDetailedStats ? 'Hide Details ▲' : 'Show Details ▼'}
                    </button>
                </div>
            )}
            
            {/* Two-column layout for callsigns and registrations - only show when detailed stats are hidden */}
            {hasTopStats && !showDetailedStats && (
                <div className="top-stats-columns">
                    {/* Callsigns column */}
                    {hasCallsigns && (
                        <div className="top-stats-column">
                            <div className="column-header">
                                <strong>Top Callsigns</strong>
                            </div>
                            <div className="top-items">
                                {displayedData.topCallsigns.map(([callsign, count], index) => (
                                    <span key={index} className="top-item">{callsign}: {count.toLocaleString()}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* Registrations column */}
                    {hasRegistrations && (
                        <div className="top-stats-column">
                            <div className="column-header">
                                <strong>Top Registrations</strong>
                            </div>
                            <div className="top-items">
                                {displayedData.topRegistrations.map(([registration, count], index) => (
                                    <span key={index} className="top-item">{registration}: {count.toLocaleString()}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
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
                        
                        {/* Registrations Table - Only show if registrations exist */}
                        {displayedData.allSortedRegistrations && displayedData.allSortedRegistrations.length > 0 && (
                            <div className="table-container">
                                <h3>All Registrations ({displayedData.allSortedRegistrations.length})</h3>
                                
                                {/* Registration pagination */}
                                {registrationTotalPages > 1 && (
                                    <div className="stats-pagination">
                                        <button 
                                            onClick={() => setRegistrationPage(prev => Math.max(prev - 1, 1))}
                                            disabled={registrationPage === 1}
                                        >
                                            Previous
                                        </button>
                                        <span className="page-info">
                                            Page {registrationPage} of {registrationTotalPages}
                                        </span>
                                        <button 
                                            onClick={() => setRegistrationPage(prev => Math.min(prev + 1, registrationTotalPages))}
                                            disabled={registrationPage === registrationTotalPages}
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                                
                                <table className="flights-table">
                                    <thead>
                                        <tr>
                                            <th>Registration</th>
                                            <th>Flights</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedRegistrations.map(([registration, count], index) => (
                                            <tr key={index}>
                                                <td>{registration}</td>
                                                <td>{count.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            <p><strong>Number of Days:</strong> {displayedData.numberOfDays}</p>
        </div>
    );
};

export default SummaryStatistics; 