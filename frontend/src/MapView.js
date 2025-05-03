import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';

// Separate component for the actual map to avoid hook issues
const Map = React.lazy(() => import('./LeafletMap'));

const MapView = ({ flightData, selectedAirport, selectedPair, onAirportClick, onBackgroundClick }) => {
  const [airports, setAirports] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Load airport coordinates
  useEffect(() => {
    setLoading(true);
    
    fetch('/airports.csv')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch airport data');
        }
        return response.text();
      })
      .then(csvText => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            // Create a lookup object for airport coordinates
            const airportMap = {};
            results.data.forEach(airport => {
              if (airport.airport_ident && airport.latitude && airport.longitude) {
                airportMap[airport.airport_ident] = {
                  lat: parseFloat(airport.latitude),
                  lng: parseFloat(airport.longitude)
                };
              }
            });
            setAirports(airportMap);
            setLoading(false);
          },
          error: (err) => {
            setError(`Failed to parse airports.csv: ${err.message}`);
            setLoading(false);
          }
        });
      })
      .catch(err => {
        setError(`Error loading airport data: ${err.message}`);
        setLoading(false);
      });
  }, []);

  // Calculate traffic between airport pairs
  const trafficData = React.useMemo(() => {
    if (!flightData || flightData.length === 0 || Object.keys(airports).length === 0) {
      return [];
    }

    // Count flights between airport pairs
    const pairCounts = {};
    
    flightData.forEach(flight => {
      const { origin, destination } = flight;
      if (origin && destination && origin !== destination) {
        const pairKey = `${origin}-${destination}`;
        pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
      }
    });

    // Convert to array and filter out pairs without coordinates
    return Object.entries(pairCounts)
      .map(([pair, count]) => {
        const [origin, destination] = pair.split('-');
        if (!airports[origin] || !airports[destination]) {
          return null;
        }
        return {
          origin,
          destination,
          originCoords: airports[origin],
          destCoords: airports[destination],
          count
        };
      })
      .filter(item => item !== null)
      .sort((a, b) => b.count - a.count); // Sort by count descending
  }, [flightData, airports]);

  // Calculate traffic per airport (for sizing circles)
  const airportTraffic = React.useMemo(() => {
    if (!flightData || flightData.length === 0) {
      return {};
    }

    const traffic = {};
    
    flightData.forEach(flight => {
      const { origin, destination } = flight;
      if (origin) {
        traffic[origin] = (traffic[origin] || 0) + 1;
      }
      if (destination) {
        traffic[destination] = (traffic[destination] || 0) + 1;
      }
    });

    return traffic;
  }, [flightData]);

  if (loading) {
    return <div className="loading-map">Loading map data...</div>;
  }

  if (error) {
    return <div className="map-error">Error: {error}</div>;
  }

  // Find the maximum traffic value for scaling
  const maxTraffic = Math.max(...Object.values(airportTraffic), 1);

  // Calculate circle size based on traffic
  const getCircleSize = (airportCode) => {
    const traffic = airportTraffic[airportCode] || 0;
    // Scale between 5 and 20 pixels based on traffic
    return 5 + (traffic / maxTraffic) * 15;
  };

  // Find airport coordinates for filtered data
  const filteredAirports = Object.keys(airportTraffic)
    .filter(code => airports[code]) // Only include airports we have coordinates for
    .map(code => ({
      code,
      ...airports[code],
      traffic: airportTraffic[code]
    }));

  // Default map bounds
  const defaultCenter = [39.8283, -98.5795]; // Center of US
  const defaultZoom = 4;

  return (
    <div className="map-container">
      <React.Suspense fallback={<div className="loading-map">Loading map...</div>}>
        <Map
          trafficData={trafficData}
          filteredAirports={filteredAirports}
          getCircleSize={getCircleSize}
          selectedAirport={selectedAirport}
          selectedPair={selectedPair}
          defaultCenter={defaultCenter}
          defaultZoom={defaultZoom}
          onAirportClick={onAirportClick}
          onBackgroundClick={onBackgroundClick}
        />
      </React.Suspense>
    </div>
  );
};

export default MapView; 