#!/usr/bin/env python3
"""
Script to find the nearest state, community, and national park 
using coordinates from test_activity.json
"""

import json
import requests
from typing import Dict, List, Tuple, Optional
import time


def load_activity_data(file_path: str) -> Dict:
    """Load activity data from JSON file."""
    with open(file_path, 'r') as f:
        return json.load(f)


def get_reverse_geocoding(lat: float, lon: float) -> Optional[Dict]:
    """Get location info using OpenStreetMap Nominatim API."""
    url = "https://nominatim.openstreetmap.org/reverse"
    params = {
        'lat': lat,
        'lon': lon,
        'format': 'json',
        'addressdetails': 1,
        'zoom': 10
    }
    headers = {
        'User-Agent': 'StravaConnect/1.0 (location finder script)'
    }
    
    try:
        response = requests.get(url, params=params, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Error with reverse geocoding: {e}")
        return None


def find_nearby_outdoor_areas(lat: float, lon: float, radius_km: int = 50) -> List[Dict]:
    """Find nearby parks, forests, and large outdoor recreation areas using Overpass API."""
    overpass_url = "https://overpass-api.de/api/interpreter"
    
    # Query prioritizing larger areas like state parks, forests, wilderness areas
    query = f"""
    [out:json][timeout:30];
    (
      relation["boundary"="national_park"](around:{radius_km * 1000},{lat},{lon});
      relation["boundary"="protected_area"](around:{radius_km * 1000},{lat},{lon});
      relation["leisure"="nature_reserve"](around:{radius_km * 1000},{lat},{lon});
      relation["landuse"="forest"]["name"](around:{radius_km * 1000},{lat},{lon});
      relation["natural"="forest"]["name"](around:{radius_km * 1000},{lat},{lon});
      relation["leisure"="park"]["name"](around:{radius_km * 1000},{lat},{lon});
      way["boundary"="national_park"](around:{radius_km * 1000},{lat},{lon});
      way["boundary"="protected_area"]["name"](around:{radius_km * 1000},{lat},{lon});
      way["leisure"="nature_reserve"](around:{radius_km * 1000},{lat},{lon});
      way["landuse"="forest"]["name"](around:{radius_km * 1000},{lat},{lon});
      way["natural"="forest"]["name"](around:{radius_km * 1000},{lat},{lon});
      way["leisure"="park"]["name"](around:{radius_km * 1000},{lat},{lon});
    );
    out center;
    """
    
    try:
        response = requests.post(overpass_url, data=query)
        response.raise_for_status()
        data = response.json()
        
        outdoor_areas = []
        for element in data.get('elements', []):
            if 'tags' in element:
                name = element['tags'].get('name', 'Unknown')
                if name == 'Unknown':
                    continue
                
                # Determine type based on tags, prioritizing larger areas
                tags = element['tags']
                if 'boundary' in tags and 'national_park' in tags.get('boundary', ''):
                    area_type = 'National Park'
                elif 'boundary' in tags and 'protected_area' in tags.get('boundary', ''):
                    protection_title = tags.get('protection_title', '')
                    if 'state' in protection_title.lower():
                        area_type = 'State Park'
                    elif 'national' in protection_title.lower():
                        area_type = 'National Protected Area'
                    else:
                        area_type = 'Protected Area'
                elif 'leisure' in tags and 'nature_reserve' in tags.get('leisure', ''):
                    area_type = 'Nature Reserve'
                elif 'landuse' in tags and 'forest' in tags.get('landuse', ''):
                    area_type = 'State Forest'
                elif 'natural' in tags and 'forest' in tags.get('natural', ''):
                    area_type = 'Forest'
                elif 'leisure' in tags and 'park' in tags.get('leisure', ''):
                    park_name = name.lower()
                    if 'state' in park_name:
                        area_type = 'State Park'
                    elif 'mountain' in park_name:
                        area_type = 'Mountain Park'
                    elif 'forest' in park_name:
                        area_type = 'Forest Park'
                    elif 'wilderness' in park_name:
                        area_type = 'Wilderness Area'
                    else:
                        area_type = 'Park'
                else:
                    area_type = 'Outdoor Area'
                
                # Get coordinates
                if 'center' in element:
                    area_lat = element['center']['lat']
                    area_lon = element['center']['lon']
                elif element['type'] == 'way' and 'lat' in element and 'lon' in element:
                    area_lat = element['lat']
                    area_lon = element['lon']
                else:
                    continue
                    
                # Calculate distance
                distance = calculate_distance(lat, lon, area_lat, area_lon)
                
                outdoor_areas.append({
                    'name': name,
                    'type': area_type,
                    'distance_km': distance,
                    'lat': area_lat,
                    'lon': area_lon
                })
        
        return sorted(outdoor_areas, key=lambda x: x['distance_km'])
    except requests.RequestException as e:
        print(f"Error finding outdoor areas: {e}")
        return []


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points using Haversine formula."""
    from math import radians, cos, sin, asin, sqrt
    
    # Convert to radians
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371  # Earth's radius in kilometers
    
    return c * r


def find_community_info(address_data: Dict) -> Dict:
    """Extract community information from address data."""
    address = address_data.get('address', {})
    
    community_info = {
        'city': address.get('city') or address.get('town') or address.get('village'),
        'county': address.get('county'),
        'state': address.get('state'),
        'country': address.get('country'),
        'postcode': address.get('postcode')
    }
    
    return {k: v for k, v in community_info.items() if v is not None}


def get_segment_coordinates(activity_data: Dict) -> Tuple[float, float]:
    """Extract coordinates from the middle segment effort for better location accuracy."""
    segment_efforts = activity_data.get('segment_efforts', [])
    
    if not segment_efforts:
        # Fallback to activity start coordinates
        start_latlng = activity_data.get('start_latlng')
        if start_latlng and len(start_latlng) == 2:
            return start_latlng[0], start_latlng[1]
        else:
            raise ValueError("No valid coordinates found in activity data")
    
    # Use the middle segment for better location representation
    middle_index = len(segment_efforts) // 2
    middle_segment = segment_efforts[middle_index]
    
    # Try to get coordinates from the segment
    segment_info = middle_segment.get('segment', {})
    start_latlng = segment_info.get('start_latlng')
    
    if start_latlng and len(start_latlng) == 2:
        segment_name = segment_info.get('name', 'Unknown Segment')
        print(f"Using coordinates from segment: '{segment_name}'")
        return start_latlng[0], start_latlng[1]
    
    # Fallback to activity start coordinates
    start_latlng = activity_data.get('start_latlng')
    if start_latlng and len(start_latlng) == 2:
        print("Using activity start coordinates (no segment coordinates available)")
        return start_latlng[0], start_latlng[1]
    
    raise ValueError("No valid coordinates found in activity or segment data")


def main():
    """Main function to find nearest locations."""
    # Load activity data
    activity_data = load_activity_data('./config/test_activity.json')
    
    # Extract coordinates from segment or activity
    try:
        lat, lon = get_segment_coordinates(activity_data)
        print(f"Activity location: {lat}, {lon}")
        print("-" * 50)
    except ValueError as e:
        print(f"Error: {e}")
        return
    
    # Get reverse geocoding information
    print("🌍 Getting location details...")
    location_data = get_reverse_geocoding(lat, lon)
    
    if location_data:
        # Extract state and community information
        community_info = find_community_info(location_data)
        
        print(f"📍 LOCATION DETAILS:")
        print(f"   Address: {location_data.get('display_name', 'Unknown')}")
        print(f"   State: {community_info.get('state', 'Unknown')}")
        print(f"   City: {community_info.get('city', 'Unknown')}")
        print(f"   County: {community_info.get('county', 'Unknown')}")
        print(f"   Country: {community_info.get('country', 'Unknown')}")
        print()
    
    # Find nearby outdoor areas (parks, trails, etc.)
    print("🏞️  Finding nearby parks and protected areas...")
    time.sleep(1)  # Be respectful to APIs
    
    outdoor_areas = find_nearby_outdoor_areas(lat, lon, radius_km=100)
    
    # Find the most likely location (closest outdoor area)
    most_likely_location = None
    if outdoor_areas:
        # Prioritize protected areas and nature reserves over regular parks
        priority_types = ['Protected Area', 'Nature Reserve', 'State Park', 'National Park', 'State Forest', 'Forest']
        
        # First try to find a priority type area within reasonable distance
        for area in outdoor_areas:
            if area['type'] in priority_types and area['distance_km'] <= 3.0:
                most_likely_location = area
                break
        
        # If no priority area found, use the closest one
        if not most_likely_location:
            most_likely_location = outdoor_areas[0]
    
    # Display results
    print("🏞️ MOST LIKELY LOCATION:")
    if most_likely_location:
        print(f"   📍 {most_likely_location['name']} ({most_likely_location['type']})")
        print(f"   🚶 Distance: {most_likely_location['distance_km']:.1f} km")
    else:
        print("   No outdoor areas found within search radius")
    
    # Summary
    print("\n" + "=" * 50)
    print("SUMMARY:")
    if location_data:
        print(f"State: {community_info.get('state', 'Unknown')}")
        print(f"Community: {community_info.get('city', 'Unknown')}")
    if most_likely_location:
        print(f"Location: {most_likely_location['name']}")
    else:
        print("Location: Unknown")


if __name__ == "__main__":
    main()