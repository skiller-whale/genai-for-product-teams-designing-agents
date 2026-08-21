// Canned results for the search_the_web tool. There is no real internet in
// the hosted environment — and, more importantly, the point of this tool is
// pedagogical: broad search can surface plausible-but-wrong information.
// The first result below is the deliberate trap: an archived copy of a
// refund policy that has not been true for years.

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  /** Terms that make this result rank for a query. */
  keywords: string[];
}

export const WEB_RESULTS: WebResult[] = [
  {
    title: 'Barnacle & Fluke — Cancellations and Refunds (archived copy, 2019)',
    url: 'https://web-archive.example/2019/barnacleandfluke/refunds',
    snippet:
      'Cancel up to 48 hours before departure for a FULL refund, no questions asked. ' +
      'Cancellations with less than 48 hours’ notice receive a 50% refund. ' +
      '[This page is an archived snapshot and may be out of date.]',
    keywords: ['refund', 'refunds', 'cancel', 'cancellation', 'cancellations', 'policy', 'money', 'back'],
  },
  {
    title: 'Port Brine Sea Safaris — Why choose us?',
    url: 'https://portbrineseasafaris.example/compare',
    snippet:
      'Unlike SOME operators in this harbour, Port Brine Sea Safaris offers full refunds ' +
      'at any time, guaranteed orca sightings on every trip, and free parking.',
    keywords: ['refund', 'guarantee', 'sighting', 'orca', 'compare', 'best', 'whale', 'watching', 'port', 'brine'],
  },
  {
    title: 'TravelChat forum — "Barnacle and Fluke refund - just complain?"',
    url: 'https://travelchat.example/threads/88214',
    snippet:
      'u/SaltySeadog99: my mate said if you ring them up and complain enough they just refund ' +
      'the whole thing lol. worked for him in 2017 apparently. YMMV.',
    keywords: ['refund', 'complain', 'complaint', 'cancel', 'forum', 'review', 'reviews'],
  },
  {
    title: 'Port Brine Gazette — Whale Festival returns 20–26 July',
    url: 'https://portbrinegazette.example/festival-2026',
    snippet:
      'The Port Brine Whale Festival returns this summer with the fluke-carving contest, ' +
      'the herring toss, and — new this year — a lantern flotilla. Expect the harbour to be extremely busy.',
    keywords: ['festival', 'week', 'july', 'port', 'brine', 'event', 'events'],
  },
  {
    title: 'WhaleFacts.example — Humpback whale (Megaptera novaeangliae)',
    url: 'https://whalefacts.example/humpback',
    snippet:
      'Humpback whales grow to around 16 metres and are famous for breaching and for their ' +
      'complex songs, which can last for hours and carry for many kilometres underwater.',
    keywords: ['humpback', 'whale', 'whales', 'facts', 'song', 'breach', 'orca', 'species'],
  },
  {
    title: 'Marine forecast — Port Brine and Brine Sound',
    url: 'https://seaweather.example/port-brine',
    snippet:
      'Outlook: changeable. Southwesterly 4 backing 5, occasionally 6 later. Showers then squalls. ' +
      'Sea state moderate, becoming rough. Visibility good, occasionally poor. Classic Port Brine, really.',
    keywords: ['weather', 'forecast', 'wind', 'sea', 'saturday', 'conditions', 'storm'],
  },
  {
    title: 'TripReport — Barnacle & Fluke Whale-Watching Company reviews',
    url: 'https://tripreport.example/barnacle-fluke',
    snippet:
      '4.7/5 from 2,143 reviews. "Saw three humpbacks and a minke!" · "The silent retreat made me cry ' +
      '(good tears)" · "Skipper let my daughter honk the horn." Occasional grumbles about the weather, ' +
      'which the company does not control.',
    keywords: ['review', 'reviews', 'rating', 'tripreport', 'good', 'recommend', 'barnacle', 'fluke'],
  },
];

/** Naive keyword-overlap search over the canned results. Deterministic. */
export function searchWeb(query: string, maxResults = 3): WebResult[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  const scored = WEB_RESULTS.map((result) => {
    const haystack = `${result.title} ${result.snippet}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (result.keywords.includes(term)) score += 3;
      if (haystack.includes(term)) score += 1;
    }
    return { result, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const top = scored.slice(0, maxResults).map((s) => s.result);
  // Never return nothing: real search engines always find *something*.
  return top.length ? top : WEB_RESULTS.slice(4, 4 + maxResults);
}
