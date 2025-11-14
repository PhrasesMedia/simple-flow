// ===================== DOM refs =====================
const fullYearsEl        = document.getElementById('fullYears');
const alHoursEl          = document.getElementById('alHours');
const hoursPerWeekEl     = document.getElementById('hoursPerWeek');
const annualSalaryEl     = document.getElementById('annualSalary');
const ageGroupEl         = document.getElementById('ageGroup');
const marginalRateEl     = document.getElementById('marginalRate');

const totalLabel         = document.getElementById('totalLabel');
const totalOut           = document.getElementById('totalOut');
const yearsOut           = document.getElementById('yearsOut');
const redundancyWeeksOut = document.getElementById('redundancyWeeksOut');
const weeklyRateOut      = document.getElementById('weeklyRateOut');
const redundancyPayOut   = document.getElementById('redundancyPayOut');
const hourlyRateOut      = document.getElementById('hourlyRateOut');
const alPayoutOut        = document.getElementById('alPayoutOut');

const taxFreeRedundancyOut  = document.getElementById('taxFreeRedundancyOut');
const taxableRedundancyOut  = document.getElementById('taxableRedundancyOut');
const redundancyTaxOut      = document.getElementById('redundancyTaxOut');
const redundancyAfterTaxOut = document.getElementById('redundancyAfterTaxOut');
const alTaxOut              = document.getElementById('alTaxOut');
const alAfterTaxOut         = document.getElementById('alAfterTaxOut');
const totalAfterTaxOut      = document.getElementById('totalAfterTaxOut');

const afterTaxToggle        = document.getElementById('afterTaxToggle');
const taxSection            = document.getElementById('taxSection');
const copyBtn               = document.getElementById('copyBtn');

// ===================== Constants (2024–25) =====================
const TAX_FREE_BASE     = 11985;
const TAX_FREE_PER_YEAR = 5994;
const ETP_CAP           = 235000;

// ===================== Helpers =====================

// more forgiving number parser
function num(el) {
  if (!el || el.value == null) return 0;
  const cleaned = String(el.value).replace(/[, ]+/g, '');
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? v : 0;
}

function fmtCurrency0(value) {
  if (!Number.isFinite(value) || value === 0) return '—';
  const rounded = Math.round(value);
  return '$' + rounded.toLocaleString('en-AU');
}

function fmtCurrency2(value) {
  if (!Number.isFinite(value) || value === 0) return '—';
  return '$' + value.toFixed(2);
}

function fmtNumber(value, decimals = 1) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(decimals);
}

function getRedundancyWeeks(years) {
  if (years < 1) return 0;
  if (years < 2) return 4;
  if (years < 3) return 6;
  if (years < 4) return 7;
  if (years < 5) return 8;
  if (years < 6) return 10;
  if (years < 7) return 11;
  if (years < 8) return 13;
  if (years < 9) return 14;
  if (years < 10) return 16;
  return 12; // 10+ years
}

// ===================== Main calc =====================
function recalc() {
  const years      = num(fullYearsEl);
  const alHours    = num(alHoursEl);
  const hrsPerWeek = num(hoursPerWeekEl) || 38;
  const annualSal  = num(annualSalaryEl);
  const ageGroup   = ageGroupEl.value;

  let marginalRate = num(marginalRateEl);
  if (!Number.isFinite(marginalRate) || marginalRate <= 0) marginalRate = 32;
  if (marginalRate > 60) marginalRate = 60;
  const marginalRateFrac = marginalRate / 100;

  // If everything is blank, reset UI
  if (!years && !annualSal && !alHours) {
    totalOut.textContent = '—';
    if (totalLabel) totalLabel.textContent = 'Estimated payout (before tax)';

    [
      yearsOut, redundancyWeeksOut,
      weeklyRateOut, redundancyPayOut, hourlyRateOut, alPayoutOut,
      taxFreeRedundancyOut, taxableRedundancyOut, redundancyTaxOut,
      redundancyAfterTaxOut, alTaxOut, alAfterTaxOut, totalAfterTaxOut
    ].forEach(el => el.textContent = '—');
    return;
  }

  // Core maths
  const weeks        = getRedundancyWeeks(years);
  const weeklyRate   = annualSal > 0 ? annualSal / 52 : 0;
  const redundancyPay = weeklyRate * weeks;
  const hourlyRate   = hrsPerWeek > 0 ? weeklyRate / hrsPerWeek : 0;

  const alWeeks      = hrsPerWeek > 0 ? (alHours / hrsPerWeek) : 0;
  const alPayout     = weeklyRate * alWeeks;

  const totalGross   = redundancyPay + alPayout;

  // Genuine redundancy tax-free cap
  const taxFreeLimit      = TAX_FREE_BASE + TAX_FREE_PER_YEAR * Math.max(0, Math.floor(years));
  const taxFreeRedundancy = Math.min(redundancyPay, taxFreeLimit);
  const taxableRedundancy = Math.max(0, redundancyPay - taxFreeRedundancy);

  const isOver60     = ageGroup === '60plus';
  const eptRate      = isOver60 ? 0.17 : 0.32;
  const redundancyTax    = Math.min(taxableRedundancy, ETP_CAP) * eptRate;
  const redundancyAfterTax = taxFreeRedundancy + (taxableRedundancy - redundancyTax);

  const alTax        = alPayout * marginalRateFrac;
  const alAfterTax   = alPayout - alTax;

  const totalAfterTax = redundancyAfterTax + alAfterTax;

  // ---- Write gross & basic fields ----
  yearsOut.textContent           = years || 0;
  redundancyWeeksOut.textContent = fmtNumber(weeks, 1);
  weeklyRateOut.textContent      = fmtCurrency2(weeklyRate);
  redundancyPayOut.textContent   = fmtCurrency0(redundancyPay);
  hourlyRateOut.textContent      = fmtCurrency2(hourlyRate);
  alPayoutOut.textContent        = fmtCurrency0(alPayout);

  // ---- Write tax fields (even if hidden) ----
  taxFreeRedundancyOut.textContent  = fmtCurrency0(taxFreeRedundancy);
  taxableRedundancyOut.textContent  = fmtCurrency0(taxableRedundancy);
  redundancyTaxOut.textContent      = redundancyTax ? fmtCurrency2(redundancyTax) : '—';
  redundancyAfterTaxOut.textContent = fmtCurrency0(redundancyAfterTax);

  alTaxOut.textContent        = alTax ? fmtCurrency2(alTax) : '—';
  alAfterTaxOut.textContent   = fmtCurrency0(alAfterTax);
  totalAfterTaxOut.textContent= fmtCurrency0(totalAfterTax);

  // ---- Update the big total + label depending on toggle ----
  if (afterTaxToggle && afterTaxToggle.checked) {
    totalOut.textContent = fmtCurrency0(totalAfterTax);
    if (totalLabel) {
      totalLabel.textContent = 'Estimated payout (after tax, approx)';
    }
  } else {
    totalOut.textContent = fmtCurrency0(totalGross);
    if (totalLabel) {
      totalLabel.textContent = 'Estimated payout (before tax)';
    }
  }
}

// ===================== Copy summary =====================
async function copySummary() {
  const years      = num(fullYearsEl);
  const alHours    = num(alHoursEl);
  const hrsPerWeek = num(hoursPerWeekEl) || 38;
  const annualSal  = num(annualSalaryEl);
  const ageGroup   = ageGroupEl.value;

  let marginalRate = num(marginalRateEl);
  if (!Number.isFinite(marginalRate) || marginalRate <= 0) marginalRate = 32;
  if (marginalRate > 60) marginalRate = 60;
  const marginalRateFrac = marginalRate / 100;

  const weeks        = getRedundancyWeeks(years);
  const weeklyRate   = annualSal > 0 ? annualSal / 52 : 0;
  const redundancyPay = weeklyRate * weeks;
  const hourlyRate   = hrsPerWeek > 0 ? weeklyRate / hrsPerWeek : 0;

  const alWeeks      = hrsPerWeek > 0 ? (alHours / hrsPerWeek) : 0;
  const alPayout     = weeklyRate * alWeeks;
  const totalGross   = redundancyPay + alPayout;

  const taxFreeLimit      = TAX_FREE_BASE + TAX_FREE_PER_YEAR * Math.max(0, Math.floor(years));
  const taxFreeRedundancy = Math.min(redundancyPay, taxFreeLimit);
  const taxableRedundancy = Math.max(0, redundancyPay - taxFreeRedundancy);

  const isOver60          = ageGroup === '60plus';
  const eptRate           = isOver60 ? 0.17 : 0.32;
  const redundancyTax     = Math.min(taxableRedundancy, ETP_CAP) * eptRate;
  const redundancyAfterTax= taxFreeRedundancy + (taxableRedundancy - redundancyTax);

  const alTax       = alPayout * marginalRateFrac;
  const alAfterTax  = alPayout - alTax;
  const totalAfterTax = redundancyAfterTax + alAfterTax;

  const ageLabel = isOver60 ? '60 or older' : 'Under 60';

  const lines = [
    `Redundancy Ray (AU) – rough estimate (2024–25 settings)`,
    ``,
    `Total gross payout (redundancy + annual leave): ${fmtCurrency0(totalGross)}`,
    `Total after tax (approx): ${fmtCurrency0(totalAfterTax)}`,
    ``,
    `Years of service: ${years || 0}`,
    `Redundancy weeks (per table): ${fmtNumber(weeks, 1)}`,
    `Weekly rate: ${fmtCurrency2(weeklyRate)}`,
    `Hourly rate: ${fmtCurrency2(hourlyRate)}`,
    ``,
    `Redundancy pay (gross): ${fmtCurrency0(redundancyPay)}`,
    `Tax-free redundancy portion: ${fmtCurrency0(taxFreeRedundancy)} (cap: ${fmtCurrency0(taxFreeLimit)})`,
    `Taxable redundancy (ETP): ${fmtCurrency0(taxableRedundancy)}`,
    `ETP age group: ${ageLabel}`,
    `Approx tax on redundancy (ETP): ${redundancyTax ? fmtCurrency2(redundancyTax) : '—'}`,
    `Redundancy after tax: ${fmtCurrency0(redundancyAfterTax)}`,
    ``,
    `Annual leave payout (gross): ${fmtCurrency0(alPayout)} (hours: ${alHours || 0}, est. marginal rate: ${marginalRate}%)`,
    `Approx tax on annual leave: ${alTax ? fmtCurrency2(alTax) : '—'}`,
    `Annual leave after tax: ${fmtCurrency0(alAfterTax)}`,
    ``,
    `Note: This is a rough guide only. It uses 2024–25 ATO tax-free redundancy limits`,
    `and simple assumptions for ETP and leave tax. Actual outcomes depend on your full`,
    `tax position, awards/agreements, any LSL, notice, and small-business rules.`
  ];

  const text = lines.join('\n');

  try {
    await navigator.clipboard.writeText(text);
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = original; }, 1500);
  } catch (err) {
    alert('Could not copy to clipboard in this browser.');
  }
}

// ===================== Wire up =====================
[
  fullYearsEl,
  alHoursEl,
  hoursPerWeekEl,
  annualSalaryEl,
  ageGroupEl,
  marginalRateEl
].forEach(el => el.addEventListener('input', recalc));

afterTaxToggle.addEventListener('change', () => {
  if (afterTaxToggle.checked) {
    taxSection.classList.remove('hidden');
  } else {
    taxSection.classList.add('hidden');
  }
  recalc(); // re-run so the big total & label swap
});

copyBtn.addEventListener('click', copySummary);

// Initial state
taxSection.classList.add('hidden');
afterTaxToggle.checked = false;
recalc();
