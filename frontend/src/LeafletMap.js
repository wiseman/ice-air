import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for Leaflet's default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Utility function to calculate curved path between two points
const calculateCurvedPath = (start, end, curveIntensity = 0.2) => {
  // Calculate mid-point
  const offsetX = end.lng - start.lng;
  const offsetY = end.lat - start.lat;
  
  // Calculate distance
  const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
  
  // Scale curve intensity with distance
  const curveStrength = distance * curveIntensity;
  
  // Find a control point to make the path curve
  const controlX = (start.lng + end.lng) / 2;
  const controlY = (start.lat + end.lat) / 2;
  
  // Perpendicular to the straight line
  const perpendicularX = -offsetY / distance;
  const perpendicularY = offsetX / distance;
  
  // Control point location
  const midpointX = controlX + perpendicularX * curveStrength;
  const midpointY = controlY + perpendicularY * curveStrength;
  
  // Generate points along the curve using quadratic Bezier
  const points = 20; // Number of points for smooth curve
  const latlngs = [];
  
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    
    // Quadratic Bezier curve formula
    const lat = Math.pow(1-t, 2) * start.lat + 
                2 * (1-t) * t * midpointY + 
                Math.pow(t, 2) * end.lat;
                
    const lng = Math.pow(1-t, 2) * start.lng + 
                2 * (1-t) * t * midpointX + 
                Math.pow(t, 2) * end.lng;
                
    latlngs.push([lat, lng]);
  }
  
  return latlngs;
};

const LeafletMap = ({ 
  trafficData, 
  filteredAirports, 
  getCircleSize, 
  selectedAirport,
  selectedPair,
  defaultCenter,
  defaultZoom
}) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const airportLayersRef = useRef({});
  const pathLayersRef = useRef({});
  
  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    // Create map if it doesn't exist
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        attributionControl: true
      });
      
      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapInstanceRef.current);
    }
    
    // Cleanup on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [defaultCenter, defaultZoom]);
  
  // Update airports on filteredAirports change
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    // Clear previous airport markers
    Object.values(airportLayersRef.current).forEach(layer => {
      mapInstanceRef.current.removeLayer(layer);
    });
    airportLayersRef.current = {};
    
    // Add airport markers
    filteredAirports.forEach(airport => {
      const { code, lat, lng, traffic } = airport;
      
      // Create circle marker
      const radius = getCircleSize(code);
      const color = selectedAirport === code ? '#ff9f40' : '#00e6ff';
      
      const marker = L.circleMarker([lat, lng], {
        radius,
        fillColor: color,
        color: '#333',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.7
      }).addTo(mapInstanceRef.current);
      
      // Add tooltip
      marker.bindTooltip(`<div><strong>${code}</strong><br>Traffic: ${traffic} flights</div>`, {
        direction: 'top',
        offset: [0, -10],
        opacity: 0.9,
        className: 'custom-tooltip'
      });
      
      // Store reference to marker
      airportLayersRef.current[code] = marker;
    });
  }, [filteredAirports, getCircleSize, selectedAirport]);
  
  // Update flight paths
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    // Clear previous path layers
    Object.values(pathLayersRef.current).forEach(layer => {
      mapInstanceRef.current.removeLayer(layer);
    });
    pathLayersRef.current = {};
    
    // Add flight paths
    trafficData.forEach(route => {
      const { origin, destination, originCoords, destCoords, count } = route;
      const pairKey = `${origin}-${destination}`;
      const isSelected = selectedPair === pairKey;
      
      // Calculate curved path
      const pathCoords = calculateCurvedPath(originCoords, destCoords);
      
      // Calculate line thickness based on flight count (between 1 and 5)
      const maxCount = trafficData[0]?.count || 1;
      const weight = 1 + Math.min(4, (count / maxCount) * 4);
      
      // Calculate color opacity based on flight count
      const opacity = Math.min(0.9, 0.3 + (count / maxCount) * 0.6);
      
      // Choose color based on selection state
      const color = isSelected ? '#ff9f40' : '#00e6ff';
      
      // Create polyline
      const path = L.polyline(pathCoords, {
        color,
        weight,
        opacity,
        dashArray: isSelected ? '' : '4,4' // Dashed if not selected
      }).addTo(mapInstanceRef.current);
      
      // Add tooltip
      path.bindTooltip(
        `<div><strong>From-To: ${origin} → ${destination}</strong><br><strong>Flights: ${count}</strong></div>`,
        { direction: 'top', opacity: 0.9, className: 'custom-tooltip' }
      );
      
      // Store reference to path
      pathLayersRef.current[pairKey] = path;
    });
  }, [trafficData, selectedPair]);
  
  return (
    <div ref={mapRef} style={{ height: '600px', width: '100%' }}></div>
  );
};

export default LeafletMap; 