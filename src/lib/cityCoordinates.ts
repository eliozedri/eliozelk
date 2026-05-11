// src/lib/cityCoordinates.ts

export const CITY_COORDINATES: Record<string, [number, number]> = {
  "תל אביב": [32.0853, 34.7818],
  "תל-אביב": [32.0853, 34.7818],
  "ירושלים": [31.7683, 35.2137],
  "חיפה": [32.7940, 34.9896],
  "באר שבע": [31.2530, 34.7915],
  "נתניה": [32.3215, 34.8532],
  "פתח תקווה": [32.0840, 34.8878],
  "ראשון לציון": [31.9730, 34.7925],
  "אשדוד": [31.8040, 34.6553],
  "אשקלון": [31.6688, 34.5743],
  "רחובות": [31.8927, 34.8113],
  "חולון": [32.0107, 34.7797],
  "בת ים": [32.0204, 34.7505],
  "הרצליה": [32.1663, 34.8441],
  "כפר סבא": [32.1826, 34.9077],
  "רמת גן": [32.0824, 34.8140],
  "בני ברק": [32.0835, 34.8326],
  "לוד": [31.9527, 34.8954],
  "רמלה": [31.9298, 34.8695],
  "מודיעין": [31.8969, 35.0100],
  "קריית גת": [31.6100, 34.7642],
  "שדרות": [31.5244, 34.5953],
  "נתיבות": [31.4178, 34.5924],
  "אופקים": [31.3159, 34.6212],
  "קריית שמונה": [33.2073, 35.5695],
  "נהריה": [33.0056, 35.0981],
  "עכו": [32.9233, 35.0818],
  "קריית אתא": [32.8008, 35.1050],
  "עפולה": [32.6065, 35.2892],
  "בית שאן": [32.4985, 35.4977],
  "טבריה": [32.7922, 35.5312],
  "צפת": [32.9647, 35.4960],
  "נצרת": [32.6996, 35.2985],
  "רהט": [31.3933, 34.7547],
  "דימונה": [31.0659, 35.0335],
  "ערד": [31.2569, 35.2131],
  "מצפה רמון": [30.6100, 34.8017],
  "אילת": [29.5569, 34.9519],
  "יבנה": [31.8762, 34.7431],
  "נס ציונה": [31.9294, 34.7975],
  "גדרה": [31.8120, 34.7764],
  "שוהם": [31.9958, 34.9438],
  "יהוד": [32.0336, 34.8886],
  "מזכרת בתיה": [31.8519, 34.8289],
  "אלעד": [32.0538, 34.9533],
  "גבעתיים": [32.0689, 34.8124],
};

export const ISRAEL_CENTER: [number, number] = [31.5, 34.9];
export const ISRAEL_DEFAULT_ZOOM = 8;

/** Returns coordinates for an exact city name match, or null. */
export function getCoordinatesForCity(city: string): [number, number] | null {
  if (!city) return null;
  return CITY_COORDINATES[city.trim()] ?? null;
}

/**
 * Tries to find coordinates by scanning a free-text location string
 * for any known city name. Returns the first match, or null.
 */
export function extractCityCoordinates(location: string): [number, number] | null {
  if (!location) return null;
  const direct = getCoordinatesForCity(location);
  if (direct) return direct;
  for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
    if (location.includes(city)) return coords;
  }
  return null;
}
