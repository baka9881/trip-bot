/**
 * Flight options from a Google Flights results page, read from each result's
 * accessibility label: "From 11137 New Taiwan dollars round trip total. Nonstop
 * flight with Peach Aviation. Leaves Taiwan Taoyuan International Airport at
 * 6:50 PM on Sunday, December 20 and arrives at Kansai International Airport at
 * 10:20 PM on Sunday, December 20. Total duration 2 hr 30 min."
 */
export interface FlightOption {
  price: number;
  airline: string;
  stops: number;
  departs: string; // "18:50"
  arrives: string; // "22:20", "+1" when the next day
  duration: string; // "2 hr 30 min"
  lowCost: boolean;
}

// Carriers that charge for checked bags (and often cabin bags) on their base fares.
const LOW_COST = /peach|jetstar|tigerair|scoot|zipair|hk express|spring|airasia|vietjet|cebu|lion|jeju|t'way|jin air|air busan|eastar|thai vietjet|starflyer|skymark|air do/i;

function clock(time: string): string {
  const match = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(time.trim());
  if (!match) return time.trim();
  const hour = Number(match[1]) % 12 + (/pm/i.test(match[3]!) ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

export function parseFlightLabel(label: string): FlightOption | null {
  const text = label.replace(/\s+/g, ' ');
  const price = /From ([\d,]+) [A-Za-z ]+? round trip total/.exec(text);
  const carrier = /(Nonstop|(\d+) stops?) flight with (.+?)\./.exec(text);
  const times = /Leaves .+? at (\d{1,2}:\d{2}\s*[AP]M) on [^,]+, (\w+ \d{1,2}) and arrives at .+? at (\d{1,2}:\d{2}\s*[AP]M) on [^,]+, (\w+ \d{1,2})/.exec(text);
  const duration = /Total duration ([^.]+?)\./.exec(text);
  if (!price || !carrier || !times) return null;
  const airline = carrier[3]!.replace(/\s*Operated by.*$/i, '').trim();
  return {
    price: Number(price[1]!.replace(/,/g, '')),
    airline,
    stops: carrier[1] === 'Nonstop' ? 0 : Number(carrier[2]),
    departs: clock(times[1]!),
    arrives: `${clock(times[3]!)}${times[2] === times[4] ? '' : ' +1'}`,
    duration: duration?.[1]?.trim() ?? '',
    lowCost: LOW_COST.test(airline) || /does not include overhead bin/i.test(text),
  };
}

/** Distinct options, cheapest first (the page repeats each result in several labels). */
export function parseFlightLabels(labels: readonly string[]): FlightOption[] {
  const seen = new Set<string>();
  const options: FlightOption[] = [];
  for (const label of labels) {
    const option = parseFlightLabel(label);
    if (!option) continue;
    const key = `${option.airline}|${option.departs}|${option.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(option);
  }
  return options.sort((a, b) => a.price - b.price);
}
