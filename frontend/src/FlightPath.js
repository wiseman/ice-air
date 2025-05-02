import React from 'react';
import { Polyline, Tooltip } from 'react-leaflet';

// Function to calculate curved path between two points
const calculateCurvedPath = (start, end, curveIntensity = 0.2) => {
  // Calculate mid-point
  const latlngs = [];
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

const FlightPath = ({ origin, destination, count, maxCount, selected }) => {
  // Skip if missing coordinates
  if (!origin || !destination) return null;
  
  // Calculate path
  const pathCoords = calculateCurvedPath(origin, destination);
  
  // Calculate line thickness based on flight count (between 1 and 5)
  const weight = 1 + Math.min(4, (count / maxCount) * 4);
  
  // Calculate color opacity based on flight count (more flights = stronger color)
  const opacity = Math.min(0.9, 0.3 + (count / maxCount) * 0.6);
  
  // Choose color based on selection state
  const color = selected ? '#ff9f40' : '#00e6ff';
  
  return (
    <Polyline
      positions={pathCoords}
      weight={weight}
      color={color}
      opacity={opacity}
      dashArray={selected ? "" : "4,4"} // Dashed if not selected
    >
      <Tooltip direction="top" opacity={0.9}>
        <div>
          <strong>From-To: {origin.code || 'Unknown'} → {destination.code || 'Unknown'}</strong>
          <br />
          <strong>Flights: {count}</strong>
        </div>
      </Tooltip>
    </Polyline>
  );
};

export default FlightPath; 