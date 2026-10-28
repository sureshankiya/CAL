/**
 * Site seismic parameters from the USGS Seismic Design Web Services
 * (https://earthquake.usgs.gov/ws/designmaps/asce7-16.json | asce7-22.json) and, optionally,
 * coordinates for an address from the US Census Bureau geocoder. Values are shown to the
 * engineer and applied only after confirmation.
 *
 * shortcut: the response is read from response.data (the documented layout); parsing was not
 * checked against a live call from the build environment — confirm the first lookup against
 * the USGS web page.
 */

export interface SeismicLookup {
  ss: number;
  s1: number;
  sds: number;
  sd1: number;
  sdc?: string;
  url: string;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Parse a USGS design-maps JSON response. */
export function parseUsgs(json: unknown, url: string): SeismicLookup {
  const j = json as { response?: { data?: Record<string, unknown> } | Array<{ data?: Record<string, unknown> }> };
  const r = j?.response;
  const d = Array.isArray(r) ? r[0]?.data : r?.data;
  const ss = num(d?.ss);
  const s1 = num(d?.s1);
  const sds = num(d?.sds);
  const sd1 = num(d?.sd1);
  if (ss === undefined || s1 === undefined || sds === undefined || sd1 === undefined)
    throw new Error("USGS response without S_s / S_1 / S_DS / S_D1 — use the USGS web tool and enter the values");
  return { ss, s1, sds, sd1, sdc: typeof d?.sdc === "string" ? d.sdc : undefined, url };
}

export async function usgsSeismic(
  asce7: "ASCE 7-16" | "ASCE 7-22",
  lat: number,
  lon: number,
  riskCategory: string,
  siteClass: string,
): Promise<SeismicLookup> {
  const ref = asce7 === "ASCE 7-22" ? "asce7-22" : "asce7-16";
  const sc = siteClass.toUpperCase().replace(/[^A-Z]/g, "") || "D";
  const url = `https://earthquake.usgs.gov/ws/designmaps/${ref}.json?latitude=${lat}&longitude=${lon}&riskCategory=${encodeURIComponent(riskCategory)}&siteClass=${encodeURIComponent(sc)}&title=HouseCalc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS service: HTTP ${res.status}`);
  return parseUsgs(await res.json(), url);
}

/** Latitude / longitude of a US address (Census geocoder, one-line address). */
export async function geocodeAddress(address: string): Promise<{ lat: number; lon: number; matched: string }> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoder: HTTP ${res.status}`);
  const j = (await res.json()) as {
    result?: { addressMatches?: Array<{ matchedAddress: string; coordinates: { x: number; y: number } }> };
  };
  const m = j.result?.addressMatches?.[0];
  if (!m) throw new Error("Address not found — enter the latitude and longitude");
  return { lat: m.coordinates.y, lon: m.coordinates.x, matched: m.matchedAddress };
}
