import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for Leaflet's default icon
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// This is a functional component that doesn't render anything
// It's used to fix the Leaflet icon issue
const MapFixIcon = () => {
  useEffect(() => {
    // The fix is applied when the component mounts
  }, []);

  return null;
};

export default MapFixIcon; 