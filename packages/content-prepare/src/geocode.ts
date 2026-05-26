import type { Location, MetadataEntry } from "./types.ts";

export async function geocodeCities(
  cityList: string[],
  googleApiKey: string | undefined,
  old?: MetadataEntry,
): Promise<{ city: string[]; locations: Location[] } | undefined> {
  if (!googleApiKey) {
    console.error(
      "❌ GOOGLE_API_KEY is missing, skipping geocoding and keeping empty/previous locations.",
    );
    return { city: cityList, locations: old?.locations ?? [] };
  }

  if (
    old?.city &&
    JSON.stringify(old.city) === JSON.stringify(cityList)
  ) {
    return { city: old.city, locations: old.locations ?? [] };
  }

  const locations: Location[] = [];
  for (let i = 0; i < cityList.length; i++) {
    const city = cityList[i];
    try {
      const searchData = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${googleApiKey}`,
      );
      const searchDataJson = (await searchData.json()) as {
        results?: { geometry?: { location?: { lat: number; lng: number } } }[];
      };
      const location = searchDataJson.results?.[0]?.geometry?.location;
      if (location) {
        locations.push({
          latitude: location.lat,
          longitude: location.lng,
        });
      } else {
        console.error(`❌ Failed to fetch location for city: ${city}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Error fetching location for city: ${city}`, message);
    }
  }

  return { city: cityList, locations };
}
