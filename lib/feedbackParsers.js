// -----------------------------------------------------------
// Customer Feedback Parser (Google Sheets Live Feed)
//
// Columns based on Atelier Guest Feedback Google Sheet:
// Column A: Date
// Column B: Feedback form number
// Column C: Invoice number
// Column D: Captain Name
// Column E-K: Ratings (Food Quality, Taste, Service, Staff Hospitality, Waiting Time, etc.)
//
// Rating Scale:
// Excellent = 5, Very Good = 4, Good = 3, Average = 2, Poor = 1
//
// Metrics Mapping:
// - kit_food_quality (Kitchen team): Avg of Food Quality (Col F) + Taste (Col G) converted to 0.0 - 1.0 (or %)
// - cap_quality (Service Captain, individual): Avg of Service (Col H) + Staff Hospitality (Col I) per captain
// - hlp_quality (Service Helpers, team): Avg of Service (Col H) + Staff Hospitality (Col I) team-wide
// -----------------------------------------------------------

export function ratingTextToScore(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val >= 1 && val <= 5 ? val : null;
  const s = String(val).trim().toLowerCase();
  const map = {
    'excellent': 5,
    'very good': 4,
    'good': 3,
    'average': 2,
    'poor': 1
  };
  if (map[s] !== undefined) return map[s];
  const n = Number(s);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

export function parseCustomerFeedback(rows, { start, end }) {
  if (!rows || rows.length <= 1) {
    return { ok: false, error: 'No feedback rows found' };
  }

  // Row 0 is header
  const headers = rows[0].map(h => String(h ?? '').trim().toLowerCase());
  const data = rows.slice(1);

  // Column lookups
  const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('timestamp'));
  const captainIdx = headers.findIndex(h => h.includes('captain') || h.includes('waiter') || h.includes('server') || h.includes('steward'));
  const foodQualityIdx = headers.findIndex(h => h.includes('food quality'));
  const tasteIdx = headers.findIndex(h => h.includes('taste'));
  const serviceIdx = headers.findIndex(h => h === 'service' || (h.includes('service') && !h.includes('quality')));
  const hospitalityIdx = headers.findIndex(h => h.includes('hospitality') || h.includes('staff'));

  let totalResponses = 0;
  const kitchenScores = [];
  const helperScores = [];
  const captainScores = {}; // captainName -> [scores]

  for (const row of data) {
    if (!row || row.length === 0 || !row.some(c => String(c ?? '').trim() !== '')) continue;

    // Date filter if present
    if (dateIdx >= 0 && row[dateIdx]) {
      const rawDate = String(row[dateIdx]).trim();
      // Handle simple YYYY-MM-DD, DD/MM/YYYY, etc.
      let dStr = null;
      const m1 = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m1) dStr = `${m1[1]}-${m1[2]}-${m1[3]}`;
      const m2 = rawDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (m2) {
        const yr = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
        dStr = `${yr}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
      }
      if (dStr && (dStr < start || dStr > end)) {
        continue;
      }
    }

    totalResponses++;

    // Kitchen rating: Food Quality (Col F) & Taste (Col G)
    const fq = foodQualityIdx >= 0 ? ratingTextToScore(row[foodQualityIdx]) : null;
    const taste = tasteIdx >= 0 ? ratingTextToScore(row[tasteIdx]) : null;
    const kParts = [fq, taste].filter(x => x !== null);
    if (kParts.length > 0) {
      const kAvg = kParts.reduce((a, b) => a + b, 0) / kParts.length;
      kitchenScores.push(kAvg);
    }

    // Service rating: Service (Col H) & Staff Hospitality (Col I)
    const srv = serviceIdx >= 0 ? ratingTextToScore(row[serviceIdx]) : null;
    const hosp = hospitalityIdx >= 0 ? ratingTextToScore(row[hospitalityIdx]) : null;
    const sParts = [srv, hosp].filter(x => x !== null);
    if (sParts.length > 0) {
      const sAvg = sParts.reduce((a, b) => a + b, 0) / sParts.length;
      helperScores.push(sAvg);

      const capName = captainIdx >= 0 ? String(row[captainIdx] ?? '').trim() : '';
      if (capName) {
        if (!captainScores[capName]) captainScores[capName] = [];
        captainScores[capName].push(sAvg);
      }
    }
  }

  // Calculate percentages (score out of 5 -> percentage 0.00 to 1.00)
  // E.g. 4.5 / 5 = 0.90 (90%)
  const kitFoodPercent = kitchenScores.length > 0
    ? Math.round((kitchenScores.reduce((a, b) => a + b, 0) / kitchenScores.length / 5) * 100) / 100
    : null;

  const hlpServicePercent = helperScores.length > 0
    ? Math.round((helperScores.reduce((a, b) => a + b, 0) / helperScores.length / 5) * 100) / 100
    : null;

  const captains = {};
  for (const [name, scores] of Object.entries(captainScores)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    captains[name] = {
      scoreAvg: Math.round(avg * 100) / 100,
      percent: Math.round((avg / 5) * 100) / 100,
      entries: scores.length
    };
  }

  return {
    ok: true,
    totalResponses,
    kitFoodPercent,      // e.g. 0.92 (Target is 0.80)
    hlpServicePercent,   // e.g. 0.88 (Target is 0.80)
    captains             // per-captain breakdown
  };
}
