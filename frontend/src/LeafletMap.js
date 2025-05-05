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
  defaultZoom,
  onAirportClick,
  onBackgroundClick
}) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const airportMarkersRef = useRef({});
  const flightPathsRef = useRef({});
  const arrowsRef = useRef({});

  // Initialize the map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    
    // Initialize the map if it doesn't exist
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        attributionControl: true
      });
      
      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapRef.current);
    }

    // --- NEW: Add listener for map background clicks ---
    if (mapRef.current && onBackgroundClick) {
      const mapClickHandler = (e) => {
        // Check if the click was on the map directly, not on a layer (like a marker)
        if (e.originalEvent.target === mapRef.current._container) {
          onBackgroundClick();
        }
      };
      mapRef.current.on('click', mapClickHandler);

      // Store the handler to remove it later
      mapRef.current._backgroundClickHandler = mapClickHandler;
    }
    
    // Clean up the map on unmount
    return () => {
      if (mapRef.current) {
        // --- NEW: Remove background click listener ---
        if (mapRef.current._backgroundClickHandler) {
          mapRef.current.off('click', mapRef.current._backgroundClickHandler);
        }
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [onBackgroundClick]); // Add onBackgroundClick as dependency
  
  // Add airport markers
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Remove existing airport markers
    Object.values(airportMarkersRef.current).forEach(marker => {
      marker.remove();
    });
    airportMarkersRef.current = {};
    
    // Add airport markers
    filteredAirports.forEach(airport => {
      const { code, lat, lng, traffic } = airport;
      
      // Create circle marker
      const radius = getCircleSize(code);
      const color = selectedAirport === code ? '#ff9f40' : '#8a2be2';
      
      const marker = L.circleMarker([lat, lng], {
        radius,
        fillColor: color,
        color: '#333',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.7
      }).addTo(mapRef.current);
      
      // Add tooltip
      marker.bindTooltip(`<div><strong>${code}</strong><br>Traffic: ${traffic} flights</div>`, {
        direction: 'top',
        offset: [0, -10],
        opacity: 0.9
      });
      
      // Add click handler
      marker.on('click', () => {
        if (onAirportClick) {
          onAirportClick(code);
        }
      });
      
      // Store reference to marker
      airportMarkersRef.current[code] = marker;
    });
  }, [filteredAirports, getCircleSize, selectedAirport, onAirportClick]);

  // Add flight paths with directional arrows
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Find max traffic count for scaling
    const maxCount = trafficData.length > 0 ? trafficData[0].count : 1;
    
    // Remove existing flight paths and arrows
    Object.values(flightPathsRef.current).forEach(path => {
      path.remove();
    });
    flightPathsRef.current = {};
    
    Object.values(arrowsRef.current).forEach(arrow => {
      if (arrow.parentNode) {
        arrow.parentNode.removeChild(arrow);
      }
    });
    arrowsRef.current = {};
    
    // Add flight paths
    trafficData.forEach(route => {
      const { origin, destination, originCoords, destCoords, count } = route;
      const pairKey = `${origin}-${destination}`;
      const isSelected = selectedPair === pairKey;
      
      // Calculate path
      const pathCoords = calculateCurvedPath(originCoords, destCoords);
      
      // Calculate line thickness based on flight count (between 1 and 5)
      const weight = 1 + Math.min(4, (count / maxCount) * 4);
      
      // Calculate color opacity based on flight count
      const opacity = Math.min(0.9, 0.3 + (count / maxCount) * 0.6);
      
      // Choose color based on selection state
      const color = isSelected ? '#ff9f40' : '#8a2be2';
      
      // Create polyline
      const flightPath = L.polyline(pathCoords, {
        weight,
        color,
        opacity,
        dashArray: isSelected ? "" : "4,4" // Dashed if not selected
      }).addTo(mapRef.current);
      
      // Add tooltip
      flightPath.bindTooltip(
        `<div><strong>${origin} → ${destination}</strong><br><strong>Flights: ${count}</strong></div>`,
        { direction: 'top', opacity: 0.9 }
      );
      
      // Store reference to path
      flightPathsRef.current[pairKey] = flightPath;
      
      // Add directional arrow
      const pathLength = pathCoords.length;
      const midIndex = Math.floor(pathLength / 2);
      
      // Get point just before middle for direction
      const point1 = mapRef.current.latLngToLayerPoint(
        L.latLng(pathCoords[midIndex > 0 ? midIndex - 1 : 0])
      );
      
      // Get middle point for arrow position
      const point2 = mapRef.current.latLngToLayerPoint(
        L.latLng(pathCoords[midIndex])
      );
      
      // Calculate direction
      const dx = point2.x - point1.x;
      const dy = point2.y - point1.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      // Calculate size of arrow (scale with line weight)
      const arrowSize = 6 + weight * 1.5;
      
      // Use the SVG renderer to add arrows
      const svg = mapRef.current._renderer._container;
      
      // Create a new arrow marker as an SVG path
      const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      arrowPath.setAttribute("id", `arrow-${pairKey}`);
      arrowPath.setAttribute("d", `M 0,${-arrowSize / 2} L ${arrowSize * 1.5},0 L 0,${arrowSize / 2} Z`);
      arrowPath.setAttribute("fill", color);
      arrowPath.setAttribute("fill-opacity", opacity.toString());
      arrowPath.setAttribute("stroke", "none");
      arrowPath.setAttribute("transform", `translate(${point2.x},${point2.y}) rotate(${angle})`);
      
      // --- NEW: Add hover events to arrow --- 
      const handleArrowMouseOver = (e) => {
        const targetPath = flightPathsRef.current[pairKey];
        if (targetPath) {
           // Open the tooltip associated with the main flight path
           // Optional: Try to position it near the mouse event
           const map = mapRef.current;
           if (map) {
             const latlng = map.mouseEventToLatLng(e);
             targetPath.openTooltip(latlng);
           } else {
             targetPath.openTooltip(); 
           }
        }
      };
      const handleArrowMouseOut = () => {
        const targetPath = flightPathsRef.current[pairKey];
        if (targetPath) {
          targetPath.closeTooltip();
        }
      };

      arrowPath.addEventListener('mouseover', handleArrowMouseOver);
      arrowPath.addEventListener('mouseout', handleArrowMouseOut);
      // Store handlers for cleanup
      arrowPath._mouseOverHandler = handleArrowMouseOver;
      arrowPath._mouseOutHandler = handleArrowMouseOut;
      
      // Add the arrow to the SVG container
      svg.appendChild(arrowPath);
      
      // Store reference to arrow
      arrowsRef.current[pairKey] = arrowPath;
      
      // Update the arrow when the map moves
      const updateArrow = () => {
        if (!mapRef.current) return;
        
        // Update points based on new map view
        const newPoint1 = mapRef.current.latLngToLayerPoint(
          L.latLng(pathCoords[midIndex > 0 ? midIndex - 1 : 0])
        );
        const newPoint2 = mapRef.current.latLngToLayerPoint(
          L.latLng(pathCoords[midIndex])
        );
        
        // Calculate new direction
        const newDx = newPoint2.x - newPoint1.x;
        const newDy = newPoint2.y - newPoint1.y;
        const newAngle = Math.atan2(newDy, newDx) * 180 / Math.PI;
        
        // Update transform
        arrowPath.setAttribute("transform", `translate(${newPoint2.x},${newPoint2.y}) rotate(${newAngle})`);
      };
      
      // Add event listeners for map movements
      mapRef.current.on('moveend', updateArrow);
      mapRef.current.on('zoomend', updateArrow);
      
      // Store the event handlers for cleanup
      flightPath._updateArrow = updateArrow;
    });
    
    // Clean up event listeners when the component unmounts or trafficData changes
    return () => {
      if (mapRef.current) {
        Object.values(flightPathsRef.current).forEach(path => {
          if (path._updateArrow) {
            mapRef.current.off('moveend', path._updateArrow);
            mapRef.current.off('zoomend', path._updateArrow);
          }
        });

        // --- NEW: Clean up arrow hover listeners ---
        Object.values(arrowsRef.current).forEach(arrow => {
          if (arrow._mouseOverHandler) {
            arrow.removeEventListener('mouseover', arrow._mouseOverHandler);
          }
          if (arrow._mouseOutHandler) {
            arrow.removeEventListener('mouseout', arrow._mouseOutHandler);
          }
        });
        // --- End NEW ---
      }
    };
  }, [trafficData, selectedPair]);

  return (
    <div 
      ref={mapContainerRef} 
      style={{ height: '700px', width: '100%' }}
    />
  );
};

export default LeafletMap; 