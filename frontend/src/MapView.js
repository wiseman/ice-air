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

  // Find airport coordinates for filtered data
  const filteredAirports = React.useMemo(() => {
    // Ensure airports data is loaded before filtering
    if (Object.keys(airports).length === 0 || Object.keys(airportTraffic).length === 0) {
        return [];
    }
    return Object.keys(airportTraffic)
      .filter(code => airports[code]) // Only include airports we have coordinates for
      .map(code => ({
        code,
        ...airports[code],
        traffic: airportTraffic[code]
      }));
  }, [airports, airportTraffic]); // Depend on airports and airportTraffic

  // Calculate bounds for initial map view - MUST BE CALLED AT TOP LEVEL
  const bounds = React.useMemo(() => {
    if (filteredAirports.length < 2) {
      // Not enough points to determine bounds
      return null; 
    }

    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;

    filteredAirports.forEach(airport => {
      minLat = Math.min(minLat, airport.lat);
      maxLat = Math.max(maxLat, airport.lat);
      minLng = Math.min(minLng, airport.lng);
      maxLng = Math.max(maxLng, airport.lng);
    });
    
    // Add a small padding to the bounds
    const paddingFactor = 0.1; // 10% padding
    const latPadding = (maxLat - minLat) * paddingFactor;
    const lngPadding = (maxLng - minLng) * paddingFactor;

    return [
      [Math.max(-90, minLat - latPadding), Math.max(-180, minLng - lngPadding)], // Southwest corner
      [Math.min(90, maxLat + latPadding), Math.min(180, maxLng + lngPadding)]  // Northeast corner
    ];
  }, [filteredAirports]);

  // Calculate max traffic and circle size function - MUST BE CALLED AT TOP LEVEL
  const maxTraffic = React.useMemo(() => Math.max(...Object.values(airportTraffic), 1), [airportTraffic]);

  const getCircleSize = React.useCallback((airportCode) => {
    const traffic = airportTraffic[airportCode] || 0;
    // Scale between 5 and 20 pixels based on traffic
    return 5 + (traffic / maxTraffic) * 15;
  }, [airportTraffic, maxTraffic]); // Add dependencies

  if (loading) {
    return <div className="loading-map">Loading map data...</div>;
  }

  if (error) {
    return <div className="map-error">Error: {error}</div>;
  }

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
          bounds={bounds} // Pass the calculated bounds
          onAirportClick={onAirportClick}
          onBackgroundClick={onBackgroundClick}
        />
      </React.Suspense>
    </div>
  );
};

export default MapView; 