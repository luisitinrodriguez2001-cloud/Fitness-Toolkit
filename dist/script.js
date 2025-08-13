const { useState, useMemo, useEffect } = React;

// ---------- Utils ----------
const lbToKg = lb => lb * 0.45359237;
const kgToLb = kg => kg / 0.45359237;
const inToCm = inches => inches * 2.54;
const cmToIn = cm => cm / 2.54;
const ftInToCm = (ft, inches) => (ft * 12 + inches) * 2.54;
const cmToFtIn = cm => {const totalIn = Math.round(cm / 2.54);return { ft: Math.floor(totalIn / 12), inch: totalIn % 12 };};
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const pInt = v => Number.parseInt(v, 10);
const pFloat = v => Number.parseFloat(v);

// ---------- Metrics ----------
const bmi = (kg, cm) => kg > 0 && cm > 0 ? kg / Math.pow(cm / 100, 2) : NaN;
// U.S. Navy body-fat — inputs in cm
const bfNavy = (sex, H_cm, neck_cm, waist_cm, hip_cm) => {
  if (!Number.isFinite(H_cm) || !Number.isFinite(neck_cm) || !Number.isFinite(waist_cm)) return NaN;
  if (sex === 'male') {
    const diff = waist_cm - neck_cm;
    if (!(diff > 0)) return NaN;
    return 495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(H_cm)) - 450;
  } else {
    if (!Number.isFinite(hip_cm)) return NaN;
    const sum = waist_cm + hip_cm - neck_cm;
    if (!(sum > 0)) return NaN;
    return 495 / (1.29579 - 0.35004 * Math.log10(sum) + 0.22100 * Math.log10(H_cm)) - 450;
  }
};
// BMR — Mifflin–St Jeor (kg, cm, yrs)
const bmrMSJ = (sex, kg, cm, age) => sex === 'male' ? 10 * kg + 6.25 * cm - 5 * age + 5 : 10 * kg + 6.25 * cm - 5 * age - 161;
// BMR — Katch–McArdle (requires body-fat %)
const bmrKM = (kg, bfPct) => 370 + 21.6 * (kg * (1 - bfPct / 100));
// FFMI (unadjusted)
const ffmi = (kg, bfPct, cm) => {
  if (!Number.isFinite(kg) || !Number.isFinite(cm)) return NaN;
  const LBM = kg * (1 - bfPct / 100);
  const m = cm / 100;return LBM / (m * m);
};

// ---------- Categorization, colors & FFMI percentile ----------
const bmiInfo = b => {
  if (!Number.isFinite(b)) return { label: '—', color: '' };
  if (b < 18.5) return { label: 'Underweight', color: 'text-amber-600' };
  if (b < 25) return { label: 'Normal', color: 'text-emerald-600' };
  if (b < 30) return { label: 'Overweight', color: 'text-amber-600' };
  return { label: 'Obesity', color: 'text-rose-600' };
};
const bfColorClass = (sex, pct) => {
  if (!Number.isFinite(pct)) return '';
  if (sex === 'male') {
    // Verywell Health categories (men): essential 2–5, athletes 6–13, fitness 14–17, average 18–24, obese 25+
    if (pct <= 5) return 'text-rose-600'; // essential -> red
    if (pct <= 13) return 'text-emerald-600'; // athletes -> green
    if (pct <= 17) return 'text-emerald-600'; // fitness  -> green
    if (pct <= 24) return 'text-amber-600'; // average  -> orange
    return 'text-rose-600'; // obese    -> red
  } else {
    // Verywell Health categories (women): essential 10–13, athletes 14–20, fitness 21–24, average 25–31, obese 32+
    if (pct <= 13) return 'text-rose-600'; // essential -> red
    if (pct <= 20) return 'text-emerald-600'; // athletes -> green
    if (pct <= 24) return 'text-emerald-600'; // fitness  -> green
    if (pct <= 31) return 'text-amber-600'; // average  -> orange
    return 'text-rose-600'; // obese    -> red
  }
};
const erf = x => {const sign = x < 0 ? -1 : 1;x = Math.abs(x);const a1 = 0.254829592,a2 = -0.284496736,a3 = 1.421413741,a4 = -1.453152027,a5 = 1.061405429,p = 0.3275911;const t = 1 / (1 + p * x);const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);return sign * y;};
const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
// Kim et al., Clin Nutr 2011: 5th–95th ~ 16.3–22.3 (men), 13.3–17.8 (women)
const ffmiParams = {
  male: { mu: 19.3, sd: (22.3 - 16.3) / (2 * 1.645) },
  female: { mu: 15.55, sd: (17.8 - 13.3) / (2 * 1.645) } };

const ffmiPercentile = (value, sex) => {
  if (!Number.isFinite(value)) return NaN;
  const p = ffmiParams[sex || 'male'];
  if (!p || !Number.isFinite(p.sd) || p.sd <= 0) return NaN;
  const z = (value - p.mu) / p.sd;
  return clamp(normCdf(z) * 100, 0, 100);
};
const percentileColor = p => {
  if (!Number.isFinite(p)) return '';
  if (p < 25) return 'text-amber-600';
  if (p < 75) return 'text-emerald-600';
  if (p < 90) return 'text-sky-600';
  return 'text-violet-600';
};

// Height-adjusted FFMI: FFMI_adj = FFMI + 6.3 * (1.8 - height_m)  (Kouri et al., 1995)
const ffmiAdjusted = (ffmiVal, cm) => {
  if (!Number.isFinite(ffmiVal) || !Number.isFinite(cm)) return NaN;
  const h = cm / 100;
  return ffmiVal + 6.3 * (1.8 - h);
};

// Tiny inline reference link; use short labels instead of full URLs in text
const Ref = ({ href, label }) => /*#__PURE__*/
React.createElement("a", { href: href, target: "_blank", rel: "noreferrer", className: "underline" }, label || 'source');


// Centralized references (exact URLs preserved, shown as links not raw text)
const CIT = {
  bmi_misclass_athletes: "https://pubmed.ncbi.nlm.nih.gov/17473762/",
  bmi_vs_ffmi_users: "https://pubmed.ncbi.nlm.nih.gov/8655095/",
  obesity_bmi_limit: "https://pubmed.ncbi.nlm.nih.gov/18669570/",
  acsm_position_2016: "https://journals.lww.com/acsm-msse/Fulltext/2016/03000/Position_of_the_Academy_of_Nutrition_and_Dietetics,.20.aspx",
  insulin_partitioning: "https://www.nature.com/articles/ijo2010173",
  jissn_high_protein_cut: "https://jissn.biomedcentral.com/articles/10.1186/1550-2783-11-20",
  weekly_rate_ijsnem: "https://journals.humankinetics.com/view/journals/ijsnem/21/2/article-p97.xml",
  recomp_ajcn: "https://academic.oup.com/ajcn/article/103/3/738/4564646",
  carbs_training_tandf: "https://www.tandfonline.com/doi/full/10.1080/02640414.2011.610348",
  lean_bulk_tandf: "https://www.tandfonline.com/doi/full/10.1080/02640414.2011.588802",
  bjsm_review: "https://bjsm.bmj.com/content/52/6/376",
  high_protein_preserves_LBM: "https://pubmed.ncbi.nlm.nih.gov/19927027/",
  phase_obesity_mdpi: "https://www.mdpi.com/2072-6643/17/7/1265" };


// ---------- Small UI bits ----------
const Section = ({ title, right, children }) => /*#__PURE__*/
React.createElement("section", { className: "card p-4 mb-4" }, /*#__PURE__*/
React.createElement("header", { className: "flex items-center justify-between mb-3" }, /*#__PURE__*/
React.createElement("h2", { className: "text-lg font-semibold" }, title),
right),

children);



// (i) info shows inline tooltip with short explainer + credible source link
const Info = ({ abbr, tip, href }) => /*#__PURE__*/
React.createElement("span", { className: "inline-flex items-center gap-1 text-xs text-slate-500 ml-1" },
abbr && abbr !== 'i' && /*#__PURE__*/React.createElement("span", { className: "font-semibold" }, "(", abbr, ")"), /*#__PURE__*/
React.createElement("button", { className: "icon-btn hover:bg-slate-100", type: "button", "aria-label": tip || abbr }, "i", /*#__PURE__*/

React.createElement("span", { className: "tooltip" }, /*#__PURE__*/
React.createElement("span", { className: "tooltip-content", style: { whiteSpace: 'pre-line' } }, (typeof tip === 'string' ? tip.replace(/\\n/g, '\n') : tip) || ''),
href && /*#__PURE__*/React.createElement("a", { href: href, target: "_blank", rel: "noreferrer" }, "Source"))));





const InstagramSVG = () => /*#__PURE__*/
React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", className: "w-4 h-4", fill: "currentColor" }, /*#__PURE__*/React.createElement("path", { d: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM18 6.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" }));

const TikTokSVG = () => /*#__PURE__*/
React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 48 48", className: "w-4 h-4", fill: "currentColor" }, /*#__PURE__*/React.createElement("path", { d: "M30 6c1.6 3.6 4.6 6.3 8.3 7.2v6.1c-3.2-.1-6.2-1.1-8.7-2.8v12.3c0 7.1-5.7 12.8-12.8 12.8S4 35.9 4 28.8s5.7-12.8 12.8-12.8c1.2 0 2.4.2 3.5.5v6.4c-.9-.4-1.9-.6-3-.6-3.4 0-6.3 2.8-6.3 6.3s2.8 6.3 6.3 6.3 6.3-2.8 6.3-6.3V6h6.4z" }));


const Social = () => /*#__PURE__*/
React.createElement("div", { className: "flex items-center gap-4 text-sm" }, /*#__PURE__*/
React.createElement("a", { className: "inline-flex items-center gap-1 underline", href: "https://www.instagram.com/luisitin2001", target: "_blank", rel: "noreferrer", title: "@luisitin2001 on Instagram" }, /*#__PURE__*/React.createElement(InstagramSVG, null), "Instagram"), /*#__PURE__*/
React.createElement("span", { className: "text-slate-400" }, "\u2022"), /*#__PURE__*/
React.createElement("a", { className: "inline-flex items-center gap-1 underline", href: "https://www.tiktok.com/@luisitin2001", target: "_blank", rel: "noreferrer" }, /*#__PURE__*/React.createElement(TikTokSVG, null), "TikTok"));




// Build exhaustive, BF%-first recommendations with FFMI as tiebreaker and BMI as sanity check
function recommendPhase({ sex, BF, FFMI, FFMIadj, BMIval, TDEE }) {
  const s = sex === 'female' ? 'female' : 'male';
  const isMale = s === 'male';
  const ok = Number.isFinite(BF) && Number.isFinite(FFMI) && Number.isFinite(BMIval);

  // FFMI category thresholds
  const ffmiBand = (() => {
    if (!Number.isFinite(FFMIadj)) return '—';
    if (isMale) {
      if (FFMIadj < 19) return 'low';
      if (FFMIadj < 21) return 'moderate';
      if (FFMIadj < 23) return 'trained';
      if (FFMIadj <= 24.5) return 'high';
      return 'very high';
    } else {
      if (FFMIadj < 16) return 'low';
      if (FFMIadj < 18) return 'moderate';
      if (FFMIadj < 20) return 'trained';
      if (FFMIadj <= 21.5) return 'high';
      return 'very high';
    }
  })();

  const lines = [];
  let phase = null; // 'cut' | 'recomp' | 'maintain' | 'lean bulk'
  let kcalLow = NaN,kcalHigh = NaN;

  if (!ok) {
    return {
      phase: null,
      lines: [/*#__PURE__*/React.createElement("p", { key: "need" }, "Enter sex, height, weight, BF%, and activity to see a tailored recommendation.")],
      kcal: null };

  }

  // --- Core decision tree by sex & BF% with FFMI modifiers ---
  if (isMale) {
    if (BF >= 40) {
      phase = 'cut';
      lines.push( /*#__PURE__*/
      React.createElement("p", { key: "m40" }, "Cut with a 15\u201325% calorie deficit because cardiometabolic risk rises with adiposity and high fatness impairs insulin sensitivity and nutrient partitioning. ", /*#__PURE__*/
      React.createElement(Ref, { href: CIT.acsm_position_2016, label: "position paper" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.insulin_partitioning, label: "insulin sensitivity" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.jissn_high_protein_cut, label: "high-protein cut" }), "."));


    } else if (BF >= 30) {
      phase = 'cut';
      lines.push( /*#__PURE__*/
      React.createElement("p", { key: "m30_39" }, "Cut with resistance training as the anchor and aim to lose ~0.5\u20131.0% body weight per week to better preserve lean mass. ", /*#__PURE__*/
      React.createElement(Ref, { href: CIT.weekly_rate_ijsnem, label: "weekly rate" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.jissn_high_protein_cut, label: "protein support" }), "."));


    } else if (BF >= 25) {
      phase = 'cut';
      lines.push( /*#__PURE__*/
      React.createElement("p", { key: "m25_29" }, "Cut regardless of FFMI because lowering fatness improves health markers and primes later muscle gain; if you\u2019re \u201Cmuscular but fluffy\u201D (FFMI \u2265 23), a cut will reveal existing muscle before a lean bulk. ", /*#__PURE__*/
      React.createElement(Ref, { href: CIT.acsm_position_2016, label: "health markers" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.phase_obesity_mdpi, label: "bulk-then-cut evidence" }), "."));


    } else if (BF >= 22) {
      if (FFMIadj <= 21) {
        phase = 'cut';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "m22_25_lowffmi" }, "Cut to improve insulin sensitivity and future nutrient partitioning. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.recomp_ajcn, label: "partitioning" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.jissn_high_protein_cut, label: "protein" }), "."));


      } else {
        phase = 'recomp';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "m22_25_recomp" }, "Recomp at maintenance if FFMI 21\u201323: slowly add muscle and reduce fat with high protein and progressive resistance training. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.recomp_ajcn, label: "recomp evidence" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.jissn_high_protein_cut, label: "protein" }), "."));


      }
    } else if (BF >= 18) {
      if (FFMIadj >= 21) {
        phase = 'recomp';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "m18_22_recomp" }, "Recomp at or near maintenance because you can improve body composition while maintaining performance. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.recomp_ajcn, label: "recomp" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.acsm_position_2016, label: "performance" }), "."));


      } else {
        phase = 'cut';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "m18_22_cut" }, "Brief cut toward ~15\u201317% BF can set up a more efficient lean bulk. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.acsm_position_2016, label: "cut setup" }), "."));


      }
    } else if (BF >= 15) {
      if (FFMIadj < 22) {
        phase = 'lean bulk';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "m15_18_bulk" }, "Lean bulk because you\u2019re lean enough to add muscle efficiently. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.lean_bulk_tandf, label: "surplus guidance" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.bjsm_review, label: "training support" }), "."));


      } else if (FFMIadj >= 23) {
        phase = 'maintain';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "m15_18_maint" }, "Maintain or use a very slow bulk since you\u2019re already fairly muscular and want to limit fat gain. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.bjsm_review, label: "maintenance" }), "."));


      } else {
        phase = 'lean bulk';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "m15_18_mid" }, "Lean bulk is appropriate; keep rate conservative to manage fat gain. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.lean_bulk_tandf, label: "rate" }), "."));


      }
    } else if (BF >= 12) {
      if (FFMIadj < 23) {
        phase = 'lean bulk';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "m12_15_bulk" }, "Lean bulk to capitalize on favorable partitioning when this lean. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.lean_bulk_tandf, label: "partitioning" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.bjsm_review, label: "training" }), "."));


      } else {
        phase = 'maintain';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "m12_15_maint" }, "Maintain or slow bulk if FFMI \u2265 23\u201324.5; cutting further often compromises training quality without much visual payoff. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.bjsm_review, label: "training quality" }), "."));


      }
    } else if (BF >= 10) {
      if (FFMIadj >= 24) {
        phase = 'maintain';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "m10_12_maint" }, "Maintain because you\u2019re both lean and muscular; very low BF can suppress performance and recovery. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.acsm_position_2016, label: "performance" }), "."));


      } else {
        phase = 'lean bulk';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "m10_12_bulk" }, "Lean bulk; staying very lean can hinder progress. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.acsm_position_2016, label: "recovery" }), "."));


      }
    } else {
      phase = 'lean bulk';
      lines.push( /*#__PURE__*/
      React.createElement("p", { key: "m_lt10" }, "Lean bulk with a 5\u201315% surplus targeting ~0.25\u20130.5% body-weight gain per week. ", /*#__PURE__*/
      React.createElement(Ref, { href: CIT.weekly_rate_ijsnem, label: "weekly rate" }), "."));


    }
  } else {
    // Female tree
    if (BF >= 45) {
      phase = 'cut';
      lines.push( /*#__PURE__*/
      React.createElement("p", { key: "f45" }, "Cut with a 15\u201325% deficit and 1.0\u20131.4 g/lb protein to reduce health risk while preserving muscle via resistance training. ", /*#__PURE__*/
      React.createElement(Ref, { href: CIT.acsm_position_2016, label: "position paper" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.jissn_high_protein_cut, label: "protein" }), "."));


    } else if (BF >= 40) {
      phase = 'cut';
      lines.push( /*#__PURE__*/
      React.createElement("p", { key: "f40_45" }, "Cut with a ~0.5\u20131.0% weekly loss rate to protect lean mass and maintain performance. ", /*#__PURE__*/
      React.createElement(Ref, { href: CIT.weekly_rate_ijsnem, label: "weekly rate" }), "."));


    } else if (BF >= 35) {
      phase = 'cut';
      lines.push( /*#__PURE__*/
      React.createElement("p", { key: "f35_40" }, "Cut regardless of FFMI: reducing adiposity improves metabolic health and sets up efficient future muscle gain. ", /*#__PURE__*/
      React.createElement(Ref, { href: CIT.acsm_position_2016, label: "health" }), "."));


    } else if (BF >= 30) {
      if (FFMIadj <= 20) {
        phase = 'cut';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "f30_35_cut" }, "Cut to prioritize health and nutrient partitioning. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.recomp_ajcn, label: "partitioning" }), "."));


      } else {
        phase = 'recomp';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "f30_35_recomp" }, "Recomp at maintenance if FFMI \u2265 20: gain a bit of muscle while trimming fat without a dedicated bulk. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.recomp_ajcn, label: "recomp" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.jissn_high_protein_cut, label: "protein" }), "."));


      }
    } else if (BF >= 26) {
      if (FFMIadj >= 18) {
        phase = 'recomp';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "f26_30_recomp" }, "Recomp or short cut to enhance training quality and insulin sensitivity. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.recomp_ajcn, label: "recomp" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.insulin_partitioning, label: "insulin" }), "."));


      } else {
        phase = 'lean bulk';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "f26_30_bulk" }, "Lean bulk if FFMI < 18 because you\u2019re lean enough to prioritize muscle. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.insulin_partitioning, label: "partitioning" }), "."));


      }
    } else if (BF >= 22) {
      if (FFMIadj < 20) {
        phase = 'lean bulk';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "f22_26_bulk" }, "Lean bulk to exploit efficient muscle gain at this leanness. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.bjsm_review, label: "training" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.lean_bulk_tandf, label: "surplus" }), "."));


      } else {
        phase = 'maintain';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "f22_26_maint" }, "Maintain or very slow bulk if FFMI \u2265 20\u201321.5 since you\u2019re relatively muscular for your leanness. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.bjsm_review, label: "maintenance" }), "."));


      }
    } else if (BF >= 18) {
      if (FFMIadj >= 20) {
        phase = 'maintain';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "f18_22_maint" }, "Maintain or slow bulk because performance and recovery are optimized here. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.lean_bulk_tandf, label: "bulk dynamics" }), "."));


      } else {
        phase = 'lean bulk';
        lines.push( /*#__PURE__*/
        React.createElement("p", { key: "f18_22_bulk" }, "Lean bulk to add lean mass efficiently. ", /*#__PURE__*/
        React.createElement(Ref, { href: CIT.lean_bulk_tandf, label: "surplus" }), "."));


      }
    } else {
      phase = 'lean bulk';
      lines.push( /*#__PURE__*/
      React.createElement("p", { key: "f_lt18" }, "Lean bulk with a modest surplus to avoid the performance drag of staying too lean. ", /*#__PURE__*/
      React.createElement(Ref, { href: CIT.acsm_position_2016, label: "performance" }), "."));


    }
  }

  // BMI context and FFMI ceiling notes
  if (BMIval >= 30 && BF >= (isMale ? 25 : 32)) {
    lines.push( /*#__PURE__*/
    React.createElement("p", { key: "bmi_health" }, "Use BMI only as context: with high BF% and BMI \u2265 30, prioritize a health-first cut. ", /*#__PURE__*/
    React.createElement(Ref, { href: CIT.bmi_misclass_athletes, label: "BMI limits" }), "."));


  } else if (BMIval >= 27 && (ffmiBand === 'high' || ffmiBand === 'very high')) {
    lines.push( /*#__PURE__*/
    React.createElement("p", { key: "bmi_misclass" }, "High BMI with moderate BF% and high FFMI suggests muscular misclassification; decide by BF% and FFMI rather than BMI. ", /*#__PURE__*/
    React.createElement(Ref, { href: CIT.bmi_misclass_athletes, label: "BMI vs athletes" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.obesity_bmi_limit, label: "context" }), "."));


  }
  if (isMale && FFMIadj >= 24 || !isMale && FFMIadj >= 21) {
    lines.push( /*#__PURE__*/
    React.createElement("p", { key: "ffmi_ceiling" }, "Height-adjusted FFMI values near ~25 (men) or ~21.5 (women) are uncommon in non-users; favor brief cuts or maintenance/very slow bulks over chasing rapid scale weight. ", /*#__PURE__*/
    React.createElement(Ref, { href: CIT.bmi_vs_ffmi_users, label: "FFMI paper" }), "."));


  }

  // Translate phase to calories/macros (give ranges; use TDEE if available)
  const hasTDEE = Number.isFinite(TDEE);
  if (phase === 'cut') {
    const lo = hasTDEE ? TDEE * 0.75 : NaN;
    const hi = hasTDEE ? TDEE * 0.90 : NaN;
    kcalLow = lo;kcalHigh = hi;
    lines.push( /*#__PURE__*/
    React.createElement("p", { key: "cut_macros" }, "On a cut, create a 10\u201325% deficit and target ~0.5\u20131.0% body-weight loss per week; set protein at 1.0\u20131.4 g/lb (2.3\u20133.1 g/kg), keep fats ~20\u201330% of calories, and bias remaining calories to carbs\u2014especially around training\u2014to maintain strength. ", /*#__PURE__*/
    React.createElement(Ref, { href: CIT.weekly_rate_ijsnem, label: "rate" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.jissn_high_protein_cut, label: "protein" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.acsm_position_2016, label: "position paper" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.carbs_training_tandf, label: "carb timing" }), "."));


    lines.push( /*#__PURE__*/
    React.createElement("p", { key: "cut_preserve" }, "Resistance training plus higher protein reduces lean mass losses relative to lower protein or cardio-only approaches. ", /*#__PURE__*/
    React.createElement(Ref, { href: CIT.high_protein_preserves_LBM, label: "R+protein" }), "."));


  } else if (phase === 'recomp' || phase === 'maintain') {
    const lo = hasTDEE ? TDEE * 0.97 : NaN;
    const hi = hasTDEE ? TDEE * 1.03 : NaN;
    kcalLow = lo;kcalHigh = hi;
    lines.push( /*#__PURE__*/
    React.createElement("p", { key: "recomp_macros" }, "At maintenance/recomp, hover near maintenance, set protein ~0.9\u20131.1 g/lb (2.0\u20132.4 g/kg), and time more carbs on training days to keep performance high. ", /*#__PURE__*/
    React.createElement(Ref, { href: CIT.bjsm_review, label: "performance" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.carbs_training_tandf, label: "carb timing" }), "."));


  } else if (phase === 'lean bulk') {
    const lo = hasTDEE ? TDEE * 1.05 : NaN;
    const hi = hasTDEE ? TDEE * 1.15 : NaN;
    kcalLow = lo;kcalHigh = hi;
    lines.push( /*#__PURE__*/
    React.createElement("p", { key: "bulk_macros" }, "On a lean bulk, use a 5\u201315% surplus and aim for ~0.25\u20130.5% body-weight gain per week; set protein ~0.73\u20131.0 g/lb (1.6\u20132.2 g/kg), keep fats ~20\u201335% of calories, and push carbs higher to support volume and glycogen. ", /*#__PURE__*/
    React.createElement(Ref, { href: CIT.bjsm_review, label: "protein range" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.weekly_rate_ijsnem, label: "weekly rate" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.lean_bulk_tandf, label: "carb support" }), "."));


  }

  // Training phase note
  lines.push( /*#__PURE__*/
  React.createElement("p", { key: "train_phase" }, "Match training to phase: resistance training is non-negotiable; emphasize load retention with slightly reduced volume when cutting, and progressive overload with higher volume in surplus. ", /*#__PURE__*/
  React.createElement(Ref, { href: CIT.high_protein_preserves_LBM, label: "cut training" }), " ", /*#__PURE__*/React.createElement(Ref, { href: CIT.bjsm_review, label: "bulk training" }), "."));



  return {
    phase,
    lines,
    kcal: Number.isFinite(kcalLow) && Number.isFinite(kcalHigh) ? { low: kcalLow, high: kcalHigh } : null,
    ffmiBand };

}


// ---------- App ----------
function App() {
  const [view, setView] = useState('Profile');
  const [unit, setUnit] = useState('imperial'); // fixed: imperial shows ft/in & lb
  const [sex, setSex] = useState('male');
  const [age, setAge] = useState(''); // placeholder-driven
  const [ageErr, setAgeErr] = useState('');

  // height/weight state for both systems (placeholders, not defaults)
  const [hFt, setHFt] = useState('');
  const [hIn, setHIn] = useState('');
  const [hCm, setHCm] = useState('');
  const [wLb, setWLb] = useState('');
  const [wKg, setWKg] = useState('');

  // Navy/Manual body-fat
  const [bfMode, setBfMode] = useState('manual');
  const [bfManual, setBfManual] = useState('');
  const [neck, setNeck] = useState('');
  const [waist, setWaist] = useState('');
  const [hip, setHip] = useState('');

  // Energy & Goals extras
  const [activity, setActivity] = useState('1.55');
  const [activityManual, setActivityManual] = useState(''); // keep your default
  // Goal planner additions
  const [goalType, setGoalType] = useState(''); // '', 'cut', 'bulk', 'maintain'
  const [goalRate, setGoalRate] = useState(''); // per week

  // Fun facts (2 for now)
  const FUN = [
  'BMI is a screening tool; it cannot distinguish muscle from fat.',
  'Muscle tissue burns more calories at rest than fat tissue.'];

  const [factIdx, setFactIdx] = useState(0);
  useEffect(() => {const id = setInterval(() => setFactIdx(i => (i + 1) % FUN.length), 10000);return () => clearInterval(id);}, []);
  const shuffleFact = () => setFactIdx(i => (i + 1) % FUN.length);

  // visual reveal for the recommendation block when the Unlock tab is viewed
  const [recReady, setRecReady] = useState(false);
  useEffect(() => {
    if (view === 'Unlock Potential') {
      setRecReady(false);
      const id = setTimeout(() => setRecReady(true), 450);
      return () => clearTimeout(id);
    }
  }, [view]);


  // Unit sync on toggle
  useEffect(() => {
    if (unit === 'imperial') {
      const cm = parseFloat(hCm);if (Number.isFinite(cm)) {const { ft, inch } = cmToFtIn(cm);setHFt(String(ft));setHIn(String(inch));}
      const kg = parseFloat(wKg);if (Number.isFinite(kg)) {setWLb(String(Math.round(kgToLb(kg) * 10) / 10));}
    } else {
      const ft = pInt(hFt),inch = pInt(hIn);if (Number.isFinite(ft) && Number.isFinite(inch)) {setHCm(String(ftInToCm(ft, inch)));}
      const lb = parseFloat(wLb);if (Number.isFinite(lb)) {setWKg(String(Math.round(lbToKg(lb) * 10) / 10));}
    }
  }, [unit]);

  // Derived height/weight in metric for calc
  const H_cm = useMemo(() => {
    if (unit === 'imperial') {
      const ft = pInt(hFt),inch = pInt(hIn);if (Number.isFinite(ft) && Number.isFinite(inch)) return ftInToCm(ft, inch);return NaN;
    } else {const cm = pFloat(hCm);return Number.isFinite(cm) ? cm : NaN;}
  }, [unit, hFt, hIn, hCm]);
  const W_kg = useMemo(() => {
    if (unit === 'imperial') {const lb = pFloat(wLb);return Number.isFinite(lb) ? lbToKg(lb) : NaN;} else {const kg = pFloat(wKg);return Number.isFinite(kg) ? kg : NaN;}
  }, [unit, wLb, wKg]);

  // Body-fat percentage
  const BFpct = useMemo(() => {
    if (bfMode === 'manual') {const v = pFloat(bfManual);return Number.isFinite(v) ? clamp(v, 0, 100) : NaN;}
    const n = pFloat(neck),w = pFloat(waist),h = sex === 'female' ? pFloat(hip) : undefined;
    if (!Number.isFinite(n) || !Number.isFinite(w) || !Number.isFinite(H_cm)) return NaN;
    const neck_cm = unit === 'imperial' ? inToCm(n) : n;
    const waist_cm = unit === 'imperial' ? inToCm(w) : w;
    const hip_cm = sex === 'female' ? unit === 'imperial' ? inToCm(h) : h : undefined;
    return bfNavy(sex, H_cm, neck_cm, waist_cm, hip_cm);
  }, [bfMode, neck, waist, hip, sex, unit, H_cm, bfManual]);

  // BMR & TDEE
  const AGE = useMemo(() => {const n = pInt(age);return Number.isFinite(n) ? n : NaN;}, [age]);
  const BMRmsj = useMemo(() => Number.isFinite(W_kg) && Number.isFinite(H_cm) && Number.isFinite(AGE) ? bmrMSJ(sex, W_kg, H_cm, AGE) : NaN, [sex, W_kg, H_cm, AGE]);
  const BMRkm = useMemo(() => Number.isFinite(W_kg) && Number.isFinite(BFpct) ? bmrKM(W_kg, BFpct) : NaN, [W_kg, BFpct]);
  const BMRavg = useMemo(() => {
    if (Number.isFinite(BMRmsj) && Number.isFinite(BMRkm)) return (BMRmsj + BMRkm) / 2;
    return Number.isFinite(BMRmsj) ? BMRmsj : Number.isFinite(BMRkm) ? BMRkm : NaN;
  }, [BMRmsj, BMRkm]);
  const activityFactor = useMemo(() => activity === 'manual' ? pFloat(activityManual) : pFloat(activity), [activity, activityManual]);
  const TDEE = useMemo(() => Number.isFinite(BMRavg) && Number.isFinite(activityFactor) ? BMRavg * activityFactor : NaN, [BMRavg, activityFactor]);

  const FFMI = useMemo(() => Number.isFinite(W_kg) && Number.isFinite(BFpct) && Number.isFinite(H_cm) ? ffmi(W_kg, BFpct, H_cm) : NaN, [W_kg, BFpct, H_cm]);

  // Goal calories & BMI caution
  const rateKg = useMemo(() => {
    const r = pFloat(goalRate);
    if (!Number.isFinite(r)) return NaN;
    return unit === 'imperial' ? lbToKg(r) : r;
  }, [goalRate, unit]);

  const dailyKcalDelta = useMemo(() => Number.isFinite(rateKg) ? 7700 * rateKg / 7 : NaN, [rateKg]);
  const recommendCalories = useMemo(() => {
    if (!Number.isFinite(TDEE)) return NaN;
    if (goalType === 'cut' && Number.isFinite(dailyKcalDelta)) return TDEE - dailyKcalDelta;
    if (goalType === 'bulk' && Number.isFinite(dailyKcalDelta)) return TDEE + dailyKcalDelta;
    if (goalType === 'maintain') return TDEE;
    return NaN;
  }, [TDEE, goalType, dailyKcalDelta]);

  const projectedBMIRisky = useMemo(() => {
    if (!Number.isFinite(W_kg) || !Number.isFinite(H_cm)) return false;
    // rough 4-week projection to flag aggressiveness
    const weeks = 4;
    const projW = goalType === 'cut' && Number.isFinite(rateKg) ? W_kg - rateKg * weeks :
    goalType === 'bulk' && Number.isFinite(rateKg) ? W_kg + rateKg * weeks :
    W_kg;
    const b = bmi(projW, H_cm);
    return Number.isFinite(b) && (b < 18.5 || b >= 25);
  }, [goalType, rateKg, W_kg, H_cm]);

  const fmt1 = n => Number.isFinite(n) ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—';
  const fmt0 = n => Number.isFinite(n) ? Math.round(n).toLocaleString() : '—';

  const onAgeChange = v => {setAge(v);const n = pInt(v);if (v === '') {setAgeErr('');return;}if (!Number.isFinite(n)) {setAgeErr('Enter a whole number');return;}if (n < 10 || n > 99) {setAgeErr('Age must be 10–99');return;}setAgeErr('');};

  // rates for dropdowns by unit
  const cutRates = unit === 'imperial' ? [0.5, 1.0, 2.0] : [0.25, 0.5, 0.9];
  const bulkRates = unit === 'imperial' ? [0.5, 0.75, 1.0] : [0.25, 0.34, 0.45];

  return /*#__PURE__*/(
    React.createElement("div", { className: "max-w-5xl mx-auto px-4 py-6" }, /*#__PURE__*/

    React.createElement("div", { className: "flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4" }, /*#__PURE__*/
    React.createElement("div", { className: "w-16 h-16 rounded-2xl bg-yellow-100 flex items-center justify-center text-3xl shadow" }, "\uD83D\uDE42"), /*#__PURE__*/
    React.createElement("div", { className: "flex-1 min-w-0" }, /*#__PURE__*/
    React.createElement("h1", { className: "text-2xl md:text-3xl font-bold tracking-tight" }, "Fitness Toolkit"), /*#__PURE__*/
    React.createElement("p", { className: "text-slate-600" }, "Let's build muscle and outwit gravity. Strong today, stronger next Tuesday.")), /*#__PURE__*/

    React.createElement(Social, null)), /*#__PURE__*/



    React.createElement(Section, { title: "Pick a Tool", right: /*#__PURE__*/React.createElement("span", { className: "text-xs text-slate-500" }, "Everything updates automatically") }, /*#__PURE__*/
    React.createElement("div", { className: "grid grid-cols-3 gap-2" },
    ['Profile', 'Energy & Goals', 'Unlock Potential'].map((v) => /*#__PURE__*/
    React.createElement("button", { key: v, onClick: () => setView(v), className: (view === v ? 'bg-slate-900 text-white ' : 'bg-white ') + 'border rounded-2xl px-3 py-2 text-left' }, v))), /*#__PURE__*/



    React.createElement("div", { className: "mt-3 flex items-center justify-between text-sm text-slate-600" }, /*#__PURE__*/
    React.createElement("div", { className: "flex items-center gap-2" }, /*#__PURE__*/React.createElement("span", { className: "px-2 py-0.5 rounded bg-slate-100" }, "Fun fact"), /*#__PURE__*/React.createElement("span", null, FUN[factIdx])), /*#__PURE__*/
    React.createElement("button", { className: "icon-btn hover:bg-slate-100", "aria-label": "Shuffle fun fact", title: "Shuffle fun fact", onClick: shuffleFact }, /*#__PURE__*/
    React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", className: "w-4 h-4", fill: "currentColor" }, /*#__PURE__*/React.createElement("path", { d: "M7 3v2h.59L5 8.59 6.41 10 10 6.41V7h2V3H7zm10 0h4v4h-2V6.41l-3.29 3.3-1.42-1.42L17.59 5H17V3zM3 13h4v-2H3v2zm6.71 3.29 1.42 1.42L5 23h2v-2h.59l3.3-3.29-1.18-1.42zM19 14h2v4h-4v-2h1.59l-3.29-3.29 1.42-1.42L19 14.59V14z" }))))),





    view === 'Profile' && /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement(Section, { title: "Profile", right: /*#__PURE__*/React.createElement("button", { className: "kbd", onClick: () => {localStorage.clear();location.reload();} }, "Reset") }, /*#__PURE__*/
    React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" }, /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Sex"), /*#__PURE__*/
    React.createElement("select", { className: "field", value: sex, onChange: e => setSex(e.target.value) }, /*#__PURE__*/
    React.createElement("option", { value: "male" }, "Male"), /*#__PURE__*/
    React.createElement("option", { value: "female" }, "Female"))), /*#__PURE__*/


    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Age (years)"), /*#__PURE__*/
    React.createElement("input", { type: "number", className: "field", placeholder: "e.g., 28", value: age, onChange: e => onAgeChange(e.target.value) }),
    ageErr && /*#__PURE__*/React.createElement("p", { className: "text-xs text-rose-600 mt-1" }, ageErr)), /*#__PURE__*/

    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Units"), /*#__PURE__*/
    React.createElement("select", { className: "field", value: unit, onChange: e => setUnit(e.target.value) }, /*#__PURE__*/
    React.createElement("option", { value: "imperial" }, "Imperial (ft/in, lb)"), /*#__PURE__*/
    React.createElement("option", { value: "metric" }, "Metric (cm, kg)")))),




    unit === 'imperial' ? /*#__PURE__*/
    React.createElement("div", { className: "grid grid-cols-3 gap-4 mt-4" }, /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Height (ft)"), /*#__PURE__*/
    React.createElement("input", { type: "number", className: "field", placeholder: "e.g., 5", value: hFt, onChange: e => setHFt(e.target.value) })), /*#__PURE__*/

    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Height (in)"), /*#__PURE__*/
    React.createElement("input", { type: "number", className: "field", placeholder: "e.g., 10", value: hIn, onChange: e => setHIn(e.target.value) })), /*#__PURE__*/

    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Weight (lb)"), /*#__PURE__*/
    React.createElement("input", { type: "number", className: "field", placeholder: "e.g., 165", value: wLb, onChange: e => setWLb(e.target.value) }))) : /*#__PURE__*/



    React.createElement("div", { className: "grid grid-cols-3 gap-4 mt-4" }, /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Height (cm)"), /*#__PURE__*/
    React.createElement("input", { type: "number", className: "field", placeholder: "e.g., 178", value: hCm, onChange: e => setHCm(e.target.value) })), /*#__PURE__*/

    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Weight (kg)"), /*#__PURE__*/
    React.createElement("input", { type: "number", className: "field", placeholder: "e.g., 75", value: wKg, onChange: e => setWKg(e.target.value) })))), /*#__PURE__*/





    React.createElement(Section, { title: "Screening & Composition", right: /*#__PURE__*/React.createElement(Social, null) }, /*#__PURE__*/
    React.createElement("div", { className: "grid md:grid-cols-2 gap-4" }, /*#__PURE__*/
    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1 flex items-center" }, "Body Mass Index ", /*#__PURE__*/React.createElement(Info, { abbr: "BMI", tip: "Body Mass Index: weight (kg) / height (m)^2. A quick screening tool\u2014it doesn\u2019t distinguish muscle from fat.", href: "https://www.cdc.gov/bmi/about/index.html" })), /*#__PURE__*/
    React.createElement("div", { className: "text-sm" }, "BMI: ", /*#__PURE__*/React.createElement("span", { className: "font-semibold" }, fmt1(bmi(W_kg, H_cm)))), /*#__PURE__*/
    React.createElement("div", { className: "text-sm mt-1" }, "Status: ", /*#__PURE__*/React.createElement("span", { className: "font-semibold " + bmiInfo(bmi(W_kg, H_cm)).color }, bmiInfo(bmi(W_kg, H_cm)).label)), /*#__PURE__*/
    React.createElement("p", { className: "text-xs text-slate-500 mt-1" }, "Underweight <18.5 \u2022 Normal 18.5\u201324.9 \u2022 Overweight 25\u201329.9 \u2022 Obesity \u226530")), /*#__PURE__*/


    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1 flex items-center" }, "Body Fat Percentage ", /*#__PURE__*/React.createElement(Info, { abbr: "BF%", tip: "U.S. Navy circumference estimate using neck, waist and (for women) hip. Healthy ranges adapted from Verywell Health.", href: "https://www.verywellhealth.com/body-fat-percentage-chart-8550202" })), /*#__PURE__*/
    React.createElement("div", { className: "grid grid-cols-2 gap-3" }, /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Method"), /*#__PURE__*/
    React.createElement("select", { className: "field", value: bfMode, onChange: e => setBfMode(e.target.value) }, /*#__PURE__*/
    React.createElement("option", { value: "navy" }, "Estimate: U.S. Navy Tape"), /*#__PURE__*/
    React.createElement("option", { value: "manual" }, "Manual %"))),


    bfMode === 'manual' && /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Body Fat (%)"), /*#__PURE__*/
    React.createElement("input", { type: "number", step: "0.1", className: "field", placeholder: "e.g., 18", value: bfManual, onChange: e => setBfManual(e.target.value) }))),




    bfMode === 'navy' && /*#__PURE__*/
    React.createElement("div", { className: "grid grid-cols-3 gap-3 mt-2" }, /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Neck (", unit === 'imperial' ? 'in' : 'cm', ")"), /*#__PURE__*/
    React.createElement("input", { type: "number", className: "field", placeholder: unit === 'imperial' ? 'e.g., 15' : 'e.g., 38', value: neck, onChange: e => setNeck(e.target.value) })), /*#__PURE__*/

    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Waist (", unit === 'imperial' ? 'in' : 'cm', ")"), /*#__PURE__*/
    React.createElement("input", { type: "number", className: "field", placeholder: unit === 'imperial' ? 'e.g., 32' : 'e.g., 81', value: waist, onChange: e => setWaist(e.target.value) })),

    sex === 'female' && /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Hip (", unit === 'imperial' ? 'in' : 'cm', ")"), /*#__PURE__*/
    React.createElement("input", { type: "number", className: "field", placeholder: unit === 'imperial' ? 'e.g., 38' : 'e.g., 97', value: hip, onChange: e => setHip(e.target.value) }))), /*#__PURE__*/





    React.createElement("div", { className: "mt-3 text-sm" }, "Estimated/Entered BF%: ", /*#__PURE__*/React.createElement("span", { className: "font-semibold " + bfColorClass(sex, BFpct) }, fmt1(BFpct))), /*#__PURE__*/
    React.createElement("div", { className: "mt-1 text-sm hidden" }, "Color cue: $1"), /*#__PURE__*/
    React.createElement("p", { className: "text-xs text-slate-500 mt-1" }, "Men: Essential 2\u20135 \u2022 Athletes 6\u201313 \u2022 Fitness 14\u201317 \u2022 Average 18\u201324 \u2022 Obese \u226525"), /*#__PURE__*/


    React.createElement("p", { className: "text-xs text-slate-500" }, "Women: Essential 10\u201313 \u2022 Athletes 14\u201320 \u2022 Fitness 21\u201324 \u2022 Average 25\u201331 \u2022 Obese \u226532"), /*#__PURE__*/
    React.createElement("p", { className: "text-[11px] text-slate-400" }, "Source: Verywell Health."))))),







    view === 'Energy & Goals' && /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement(Section, { title: "Energy & Goals", right: /*#__PURE__*/React.createElement(Social, null) }, /*#__PURE__*/
    React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" }, /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Activity ", /*#__PURE__*/React.createElement(Info, { abbr: "i", tip: "Sedentary: 0\u20131 workouts/week.\\nLightly active: 1\u20133.\\nModerately active: 3\u20135.\\nVery active: 5\u20137 or physically demanding job.\\nExtra active: 2-a-day training or very heavy labor." })), /*#__PURE__*/
    React.createElement("select", { className: "field", value: activity, onChange: e => setActivity(e.target.value) }, /*#__PURE__*/
    React.createElement("option", { value: "1.2" }, "Sedentary (1.2xBMR)"), /*#__PURE__*/
    React.createElement("option", { value: "1.375" }, "Lightly active (1.375xBMR)"), /*#__PURE__*/
    React.createElement("option", { value: "1.55" }, "Moderately active (1.55xBMR)"), /*#__PURE__*/
    React.createElement("option", { value: "1.725" }, "Very active (1.725xBMR)"), /*#__PURE__*/
    React.createElement("option", { value: "1.9" }, "Extra active (1.9xBMR)"), /*#__PURE__*/
    React.createElement("option", { value: "manual" }, "Manual (xBMR)")),

    activity === 'manual' && /*#__PURE__*/
    React.createElement("div", { className: "mt-2" }, /*#__PURE__*/
    React.createElement("label", { className: "block text-xs text-slate-600" }, "Manual multiplier (xBMR)"), /*#__PURE__*/
    React.createElement("input", { type: "number", step: "0.01", min: "1", className: "field", placeholder: "e.g., 1.45", value: activityManual, onChange: e => setActivityManual(e.target.value) })))), /*#__PURE__*/





    React.createElement("div", { className: "grid md:grid-cols-3 gap-3 mt-4" }, /*#__PURE__*/
    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1 flex items-center" }, "BMR ", /*#__PURE__*/React.createElement(Info, { abbr: "MSJ", tip: "Mifflin\u2013St Jeor: estimates resting energy use from weight, height, age and sex; well-validated in adults.", href: "https://pubmed.ncbi.nlm.nih.gov/2305711/" })), /*#__PURE__*/
    React.createElement("div", { className: "text-sm" }, fmt0(BMRmsj), " kcal/day")), /*#__PURE__*/

    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1 flex items-center" }, "BMR ", /*#__PURE__*/React.createElement(Info, { abbr: "KM", tip: "Katch\u2013McArdle: estimates BMR from lean mass (needs body-fat %). Useful if you know body composition.", href: "https://www.acefitness.org/certifiednewsarticle/2882/resting-metabolic-rate-best-ways-to-measure-it-and-raise-it-too/" })), /*#__PURE__*/
    React.createElement("div", { className: "text-sm" }, fmt0(BMRkm), " kcal/day")), /*#__PURE__*/

    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1 flex items-center" }, "TDEE ", /*#__PURE__*/React.createElement(Info, { abbr: "TDEE", tip: "Total Daily Energy Expenditure: calories you burn per day (BMR \xD7 activity).", href: "https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner" })), /*#__PURE__*/
    React.createElement("div", { className: "text-sm" }, fmt0(TDEE), " kcal/day"))), /*#__PURE__*/




    React.createElement("div", { className: "mt-4 p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "grid sm:grid-cols-3 gap-3" }, /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Goal"), /*#__PURE__*/
    React.createElement("select", { className: "field", value: goalType, onChange: e => {setGoalType(e.target.value);setGoalRate('');} }, /*#__PURE__*/
    React.createElement("option", { value: "" }, "Select"), /*#__PURE__*/
    React.createElement("option", { value: "cut" }, "Cut"), /*#__PURE__*/
    React.createElement("option", { value: "bulk" }, "Bulk"), /*#__PURE__*/
    React.createElement("option", { value: "maintain" }, "Maintain"))),



    (goalType === 'cut' || goalType === 'bulk') && /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Weekly rate (", unit === 'imperial' ? 'lb' : 'kg', "/week)"), /*#__PURE__*/
    React.createElement("select", { className: "field", value: goalRate, onChange: e => setGoalRate(e.target.value) }, /*#__PURE__*/
    React.createElement("option", { value: "" }, "Select"),
    (goalType === 'cut' ? cutRates : bulkRates).map((r) => /*#__PURE__*/
    React.createElement("option", { key: r, value: r }, r)))), /*#__PURE__*/





    React.createElement("div", { className: "sm:col-span-1 flex items-end" }, /*#__PURE__*/
    React.createElement("div", { className: "text-sm" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium" }, "Recommended calories"), /*#__PURE__*/
    React.createElement("div", { className: "mono text-base" }, fmt0(recommendCalories), " kcal/day")))), /*#__PURE__*/




    React.createElement("div", { className: "text-xs text-slate-600 mt-2" },
    goalType === 'maintain' && 'Maintain within ±5% of TDEE and aim for 0.8–1.0 g protein per lb of body weight (≈1.8–2.2 g/kg).',
    (goalType === 'cut' || goalType === 'bulk') && 'Use this as a target. For meal ideas, tap "High Protein Meals" at the bottom.',
    projectedBMIRisky && /*#__PURE__*/
    React.createElement("div", { className: "text-rose-600 mt-1" }, "Note: This target may lead to a BMI outside the healthy range. Consider a less aggressive pace or keep it short term."))))),








    view === 'Unlock Potential' && /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement(Section, { title: "Unlock Potential", right: /*#__PURE__*/React.createElement(Social, null) }, /*#__PURE__*/

    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1 flex items-center" }, "FFMI ", /*#__PURE__*/
    React.createElement(Info, { abbr: "FFMI", tip: "Fat-Free Mass Index: lean mass divided by height squared (kg/m\xB2). The height-adjusted form helps compare across statures.", href: "https://pubmed.ncbi.nlm.nih.gov/8655095/" })), /*#__PURE__*/

    React.createElement("div", { className: "text-sm" }, "FFMI: ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold" }, fmt1(FFMI)), /*#__PURE__*/
    React.createElement("span", { className: "text-slate-500" }, " \u2022 adj:"), " ", /*#__PURE__*/React.createElement("span", { className: "font-semibold" }, fmt1(ffmiAdjusted(FFMI, H_cm)))), /*#__PURE__*/

    React.createElement("div", { className: "text-sm mt-1" }, "Approx. percentile: ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold " + percentileColor(ffmiPercentile(FFMI, sex)) }, fmt0(ffmiPercentile(FFMI, sex)), "th")), /*#__PURE__*/

    React.createElement("div", { className: "text-[11px] text-slate-500 mt-1" }, "Percentiles estimated from population norms. ", /*#__PURE__*/
    React.createElement("a", { className: "underline", href: "https://www.sciencedirect.com/science/article/abs/pii/S1871403X11000068", target: "_blank", rel: "noreferrer" }, "Kim et\xA0al., 2011"), "."), /*#__PURE__*/

    React.createElement("p", { className: "text-xs text-slate-500 mt-1" }, "FFMI better differentiates muscularity than BMI in trained individuals. ", /*#__PURE__*/
    React.createElement("a", { className: "underline", href: "https://pubmed.ncbi.nlm.nih.gov/17473762/", target: "_blank", rel: "noreferrer" }, "evidence"), ".")), /*#__PURE__*/




    React.createElement("div", { className: "grid md:grid-cols-3 gap-3 mt-3" }, /*#__PURE__*/
    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1" }, "BMI Snapshot"), /*#__PURE__*/
    React.createElement("div", { className: "text-sm" }, "BMI: ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold" }, fmt1(bmi(W_kg, H_cm)))), /*#__PURE__*/

    React.createElement("div", { className: "text-xs mt-1" }, "Status: ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold " + bmiInfo(bmi(W_kg, H_cm)).color }, bmiInfo(bmi(W_kg, H_cm)).label)), /*#__PURE__*/

    React.createElement("p", { className: "text-[11px] text-slate-500 mt-1" }, "BMI is a screening tool and can misclassify muscular athletes. ", /*#__PURE__*/
    React.createElement("a", { className: "underline", href: "https://pubmed.ncbi.nlm.nih.gov/17473762/", target: "_blank", rel: "noreferrer" }, "evidence"), ".")), /*#__PURE__*/



    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1" }, "Body Fat Snapshot"), /*#__PURE__*/
    React.createElement("div", { className: "text-sm" }, "BF%: ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold " + bfColorClass(sex, BFpct) }, fmt1(BFpct))), /*#__PURE__*/

    React.createElement("p", { className: "text-[11px] text-slate-500 mt-1" }, "BF% is the primary driver; FFMI is the tiebreaker; BMI is a context check.",
    ' ', /*#__PURE__*/
    React.createElement("a", { className: "underline", href: "https://pubmed.ncbi.nlm.nih.gov/17473762/", target: "_blank", rel: "noreferrer" }, "BMI limits"), " \u2022", ' ', /*#__PURE__*/
    React.createElement("a", { className: "underline", href: "https://pubmed.ncbi.nlm.nih.gov/8655095/", target: "_blank", rel: "noreferrer" }, "FFMI method"), ".")), /*#__PURE__*/



    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1" }, "Height-Adjusted FFMI Band"), /*#__PURE__*/
    React.createElement("div", { className: "text-sm" },
    (() => {var _ref$find;
      const adj = ffmiAdjusted(FFMI, H_cm);
      if (!Number.isFinite(adj)) return '—';
      const maleBands = [[-Infinity, 19, 'low'], [19, 21, 'moderate'], [21, 23, 'trained'], [23, 24.5, 'high'], [24.5, Infinity, 'very high']];
      const femaleBands = [[-Infinity, 16, 'low'], [16, 18, 'moderate'], [18, 20, 'trained'], [20, 21.5, 'high'], [21.5, Infinity, 'very high']];
      const ref = sex === 'male' ? maleBands : femaleBands;
      const tag = ((_ref$find = ref.find(([a, b]) => adj >= a && adj < b)) === null || _ref$find === void 0 ? void 0 : _ref$find[2]) || '—';
      return /*#__PURE__*/React.createElement("span", { className: "font-semibold capitalize" }, tag);
    })()), /*#__PURE__*/

    React.createElement("p", { className: "text-[11px] text-slate-500 mt-1" }, "Height adjustment per Kouri et\xA0al. ", /*#__PURE__*/
    React.createElement("a", { className: "underline", href: "https://pubmed.ncbi.nlm.nih.gov/8655095/", target: "_blank", rel: "noreferrer" }, "method"), "."))),





    (() => {
      const BMIval = bmi(W_kg, H_cm);
      const rec = recommendPhase({
        sex,
        BF: BFpct,
        FFMI,
        FFMIadj: ffmiAdjusted(FFMI, H_cm),
        BMIval,
        TDEE });


      return /*#__PURE__*/(
        React.createElement("div", { className: "mt-4 p-4 rounded-2xl border bg-gradient-to-b from-white to-slate-50" }, /*#__PURE__*/
        React.createElement("div", { className: "flex items-center justify-between mb-2" }, /*#__PURE__*/
        React.createElement("div", { className: "text-lg font-semibold" }, "Phase Recommendation"), /*#__PURE__*/
        React.createElement("div", { className: "text-xs text-slate-500" }, "Evidence-based; BF% \u2192 FFMI \u2192 BMI check")),



        !recReady ? /*#__PURE__*/
        React.createElement("div", { className: "animate-pulse space-y-3" }, /*#__PURE__*/
        React.createElement("div", { className: "h-4 bg-slate-200 rounded w-1/3" }), /*#__PURE__*/
        React.createElement("div", { className: "h-3 bg-slate-200 rounded w-5/6" }), /*#__PURE__*/
        React.createElement("div", { className: "h-3 bg-slate-200 rounded w-4/6" }), /*#__PURE__*/
        React.createElement("div", { className: "h-3 bg-slate-200 rounded w-3/6" })) : /*#__PURE__*/


        React.createElement("div", { className: "space-y-2" }, /*#__PURE__*/
        React.createElement("div", { className: "flex items-center gap-2" }, /*#__PURE__*/
        React.createElement("span", { className: "px-2 py-0.5 rounded-full text-xs border bg-white" },
        rec.phase ? rec.phase.toUpperCase() : '—'),

        rec.kcal && Number.isFinite(rec.kcal.low) && Number.isFinite(rec.kcal.high) ? /*#__PURE__*/
        React.createElement("span", { className: "text-sm text-slate-700" }, "Target: ", /*#__PURE__*/
        React.createElement("span", { className: "font-semibold mono" }, fmt0(rec.kcal.low), "\u2013", fmt0(rec.kcal.high)), " kcal/day") : /*#__PURE__*/


        React.createElement("span", { className: "text-sm text-slate-500" }, "Enter activity to show calorie targets")), /*#__PURE__*/




        React.createElement("div", { className: "mt-1 text-sm space-y-2" },
        rec.lines))));





    })())), /*#__PURE__*/



    React.createElement("div", { className: "text-center text-xs text-slate-500 space-y-2 mt-8 mb-8" }, /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("a", { className: "underline", href: "https://meaningfulmacros.com", target: "_blank", rel: "noreferrer" }, "High Protein Meals")), /*#__PURE__*/

    React.createElement("div", null, "Built for clarity, not diagnosis. Always consult a professional for personalized advice."))));



}

// --------- Lightweight self-tests (console only; do not affect UI) ---------
(function runSelfTests() {
  const approx = (a, b, t = 0.1) => Math.abs(a - b) <= t;
  try {
    console.assert(approx(bmi(70, 175), 22.86, 0.05), 'BMI test failed');
    const msjMale = bmrMSJ('male', 70, 175, 25); // ≈1674
    console.assert(approx(msjMale, 1674, 2), 'MSJ male test failed');
    const km = bmrKM(70, 15); // ≈1655
    console.assert(approx(km, 1655, 5), 'Katch–McArdle test failed');
    const ffmiVal = ffmi(70, 15, 175); // ≈19.43
    console.assert(approx(ffmiVal, 19.43, 0.1), 'FFMI test failed');
    const navy = bfNavy('male', 175, 40, 80); // sanity: finite
    console.assert(Number.isFinite(navy), 'Navy BF% not finite');
    const pMale = ffmiPercentile(20, 'male');
    console.assert(Number.isFinite(pMale) && pMale > 0 && pMale < 100, 'FFMI percentile male failed');
    console.log('[Self-tests] Passed');
  } catch (e) {
    console.warn('[Self-tests] Issue:', e);
  }
})();

ReactDOM.createRoot(document.getElementById('root')).render( /*#__PURE__*/React.createElement(App, null));