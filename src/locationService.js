const axios = require('axios');

class LocationService {
  constructor() {
    this.nominatimBaseUrl = 'https://nominatim.openstreetmap.org';
    this.overpassBaseUrl = 'https://overpass-api.de/api/interpreter';
    
    // Define sport types that are typically indoor activities or don't need location lookup
    this.indoorSportTypes = new Set([
      'Badminton',
      'Crossfit',
      'Elliptical',
      'HighIntensityIntervalTraining',
      'IceSkate', // Indoor rinks
      'Pickleball',
      'Pilates',
      'Racquetball',
      'Squash',
      'StairStepper',
      'Swim', // Pool swimming
      'TableTennis',
      'Tennis', // Indoor courts
      'VirtualRide',
      'VirtualRow',
      'VirtualRun',
      'WeightTraining',
      'Workout',
      'Yoga'
    ]);
  }

  /**
   * Check if an activity is typically indoor and doesn't need location lookup
   */
  isIndoorActivity(activityData) {
    const sportType = activityData.sport_type;
    const isTrainer = activityData.trainer === true;
    const hasNoCoordinates = !activityData.start_latlng || activityData.start_latlng.length === 0;
    
    return this.indoorSportTypes.has(sportType) || isTrainer || hasNoCoordinates;
  }

  /**
   * Extract coordinates from the middle segment effort for better location accuracy
   */
  getSegmentCoordinates(activityData) {
    const segmentEfforts = activityData.segment_efforts || [];
    
    if (segmentEfforts.length === 0) {
      // Fallback to activity start coordinates
      const startLatLng = activityData.start_latlng;
      if (startLatLng && startLatLng.length === 2) {
        return { lat: startLatLng[0], lon: startLatLng[1], source: 'activity_start' };
      }
      throw new Error('No valid coordinates found in activity data');
    }
    
    // Use the middle segment for better location representation
    const middleIndex = Math.floor(segmentEfforts.length / 2);
    const middleSegment = segmentEfforts[middleIndex];
    
    // Try to get coordinates from the segment
    const segmentInfo = middleSegment.segment || {};
    const startLatLng = segmentInfo.start_latlng;
    
    if (startLatLng && startLatLng.length === 2) {
      const segmentName = segmentInfo.name || 'Unknown Segment';
      return { 
        lat: startLatLng[0], 
        lon: startLatLng[1], 
        source: 'segment',
        segmentName 
      };
    }
    
    // Fallback to activity start coordinates
    const activityStartLatLng = activityData.start_latlng;
    if (activityStartLatLng && activityStartLatLng.length === 2) {
      return { 
        lat: activityStartLatLng[0], 
        lon: activityStartLatLng[1], 
        source: 'activity_start' 
      };
    }
    
    throw new Error('No valid coordinates found in activity or segment data');
  }

  /**
   * Get location info using OpenStreetMap Nominatim API
   */
  async getReverseGeocoding(lat, lon) {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      format: 'json',
      addressdetails: '1',
      zoom: '10'
    });

    const headers = {
      'User-Agent': 'StravaConnect/1.0 (location finder service)'
    };

    try {
      const response = await axios.get(`${this.nominatimBaseUrl}/reverse?${params}`, { headers });
      return response.data;
    } catch (error) {
      console.error('Error with reverse geocoding:', error.message);
      return null;
    }
  }

  /**
   * Find nearby parks, forests, and large outdoor recreation areas using Overpass API
   */
  async findNearbyOutdoorAreas(lat, lon, radiusKm = 50) {
    const radiusMeters = radiusKm * 1000;
    
    // Query prioritizing larger areas like state parks, forests, wilderness areas
    const query = `
    [out:json][timeout:30];
    (
      relation["boundary"="national_park"](around:${radiusMeters},${lat},${lon});
      relation["boundary"="protected_area"](around:${radiusMeters},${lat},${lon});
      relation["leisure"="nature_reserve"](around:${radiusMeters},${lat},${lon});
      relation["landuse"="forest"]["name"](around:${radiusMeters},${lat},${lon});
      relation["natural"="forest"]["name"](around:${radiusMeters},${lat},${lon});
      relation["leisure"="park"]["name"](around:${radiusMeters},${lat},${lon});
      way["boundary"="national_park"](around:${radiusMeters},${lat},${lon});
      way["boundary"="protected_area"]["name"](around:${radiusMeters},${lat},${lon});
      way["leisure"="nature_reserve"](around:${radiusMeters},${lat},${lon});
      way["landuse"="forest"]["name"](around:${radiusMeters},${lat},${lon});
      way["natural"="forest"]["name"](around:${radiusMeters},${lat},${lon});
      way["leisure"="park"]["name"](around:${radiusMeters},${lat},${lon});
    );
    out center;
    `;

    try {
      const response = await axios.post(this.overpassBaseUrl, query);
      const data = response.data;
      
      const outdoorAreas = [];
      for (const element of data.elements || []) {
        if (!element.tags) continue;
        
        const name = element.tags.name;
        if (!name || name === 'Unknown') continue;
        
        // Determine type based on tags, prioritizing larger areas
        const tags = element.tags;
        let areaType;
        
        if (tags.boundary === 'national_park') {
          areaType = 'National Park';
        } else if (tags.boundary === 'protected_area') {
          const protectionTitle = tags.protection_title || '';
          if (protectionTitle.toLowerCase().includes('state')) {
            areaType = 'State Park';
          } else if (protectionTitle.toLowerCase().includes('national')) {
            areaType = 'National Protected Area';
          } else {
            areaType = 'Protected Area';
          }
        } else if (tags.leisure === 'nature_reserve') {
          areaType = 'Nature Reserve';
        } else if (tags.landuse === 'forest') {
          areaType = 'State Forest';
        } else if (tags.natural === 'forest') {
          areaType = 'Forest';
        } else if (tags.leisure === 'park') {
          const parkName = name.toLowerCase();
          if (parkName.includes('state')) {
            areaType = 'State Park';
          } else if (parkName.includes('mountain')) {
            areaType = 'Mountain Park';
          } else if (parkName.includes('forest')) {
            areaType = 'Forest Park';
          } else if (parkName.includes('wilderness')) {
            areaType = 'Wilderness Area';
          } else {
            areaType = 'Park';
          }
        } else {
          areaType = 'Outdoor Area';
        }
        
        // Get coordinates
        let areaLat, areaLon;
        if (element.center) {
          areaLat = element.center.lat;
          areaLon = element.center.lon;
        } else if (element.type === 'way' && element.lat && element.lon) {
          areaLat = element.lat;
          areaLon = element.lon;
        } else {
          continue;
        }
        
        // Calculate distance
        const distance = this.calculateDistance(lat, lon, areaLat, areaLon);
        
        outdoorAreas.push({
          name,
          type: areaType,
          distanceKm: distance,
          lat: areaLat,
          lon: areaLon
        });
      }
      
      return outdoorAreas.sort((a, b) => a.distanceKm - b.distanceKm);
    } catch (error) {
      console.error('Error finding outdoor areas:', error.message);
      return [];
    }
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const toRadians = (degrees) => degrees * (Math.PI / 180);
    
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }

  /**
   * Extract community information from address data
   */
  findCommunityInfo(addressData) {
    const address = addressData.address || {};
    
    const communityInfo = {
      city: address.city || address.town || address.village || null,
      county: address.county || null,
      state: address.state || null,
      country: address.country || null,
      postcode: address.postcode || null
    };
    
    // Filter out null values
    return Object.fromEntries(
      Object.entries(communityInfo).filter(([, value]) => value !== null)
    );
  }

  /**
   * Find the most likely location for an activity
   */
  async findActivityLocation(activityData) {
    try {
      // Check if this is an indoor activity that doesn't need location lookup
      if (this.isIndoorActivity(activityData)) {
        console.log(`Skipping location lookup for indoor activity: ${activityData.name} (${activityData.sport_type})`);
        return {
          coordinates: null,
          community: { 
            state: 'Indoor Activity', 
            city: 'Indoor Activity' 
          },
          location: null,
          indoor: true
        };
      }
      // Extract coordinates from segment or activity
      const coordinates = this.getSegmentCoordinates(activityData);
      const { lat, lon } = coordinates;
      
      // Get reverse geocoding information
      const locationData = await this.getReverseGeocoding(lat, lon);
      
      // Find nearby outdoor areas
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
      const outdoorAreas = await this.findNearbyOutdoorAreas(lat, lon, 100);
      
      // Find the most likely location (closest outdoor area)
      let mostLikelyLocation = null;
      if (outdoorAreas.length > 0) {
        // Prioritize protected areas and nature reserves over regular parks
        const priorityTypes = ['Protected Area', 'Nature Reserve', 'State Park', 'National Park', 'State Forest', 'Forest'];
        
        // First try to find a priority type area within reasonable distance
        for (const area of outdoorAreas) {
          if (priorityTypes.includes(area.type) && area.distanceKm <= 3.0) {
            mostLikelyLocation = area;
            break;
          }
        }
        
        // If no priority area found, use the closest one
        if (!mostLikelyLocation) {
          mostLikelyLocation = outdoorAreas[0];
        }
      }
      
      // Extract community info
      let communityInfo = {};
      if (locationData) {
        communityInfo = this.findCommunityInfo(locationData);
      }
      
      // Process location name and type for better display
      let locationName = null;
      let locationType = null;
      let cleanLocationName = null;
      
      if (mostLikelyLocation) {
        locationName = mostLikelyLocation.name;
        locationType = mostLikelyLocation.type;
        
        // Clean up the location name by removing redundant type information
        cleanLocationName = locationName;
        const typeWords = locationType.toLowerCase().split(/[\s()]+/).filter(w => w.length > 2);
        
        // Remove type words from the name for cleaner display
        for (const typeWord of typeWords) {
          const regex = new RegExp(`\\b${typeWord}\\b`, 'gi');
          cleanLocationName = cleanLocationName.replace(regex, '').trim();
        }
        
        // Clean up extra whitespace and common suffixes
        cleanLocationName = cleanLocationName
          .replace(/\s+/g, ' ')
          .replace(/\s+(park|trail|area|forest|reserve|conservation)$/gi, '')
          .trim();
          
        console.log(`Location found: "${cleanLocationName}" (${locationType}) - ${mostLikelyLocation.distanceKm.toFixed(1)} km`);
      }

      return {
        coordinates: {
          lat,
          lon,
          source: coordinates.source,
          segmentName: coordinates.segmentName
        },
        community: {
          state: communityInfo.state || 'Unknown',
          city: communityInfo.city || 'Unknown',
          county: communityInfo.county || null,
          country: communityInfo.country || null
        },
        location: mostLikelyLocation ? {
          fullName: mostLikelyLocation.name,
          cleanName: cleanLocationName,
          type: mostLikelyLocation.type,
          distanceKm: Math.round(mostLikelyLocation.distanceKm * 10) / 10
        } : null,
        rawLocationData: locationData
      };
      
    } catch (error) {
      console.error('Error finding activity location:', error.message);
      return {
        coordinates: null,
        community: { state: 'Unknown', city: 'Unknown' },
        location: null,
        error: error.message
      };
    }
  }
}

module.exports = LocationService;