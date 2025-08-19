const { useState, useMemo, useEffect, useRef } = React;

/* =========================================================
   Workout Store (localStorage)
========================================================= */
const FT_STORE_KEY = 'ft_workout_v1';
const emptyStore = () => ({
  exercises: [],
  programs: [],
  workouts: [],
  prs: {}
});

const loadWorkoutStore = () => {
  try {
    const raw = localStorage.getItem(FT_STORE_KEY);
    if (!raw) return emptyStore();
    const data = JSON.parse(raw);
    return {
      exercises: Array.isArray(data.exercises) ? data.exercises : [],
      programs: Array.isArray(data.programs) ? data.programs : [],
      workouts: Array.isArray(data.workouts) ? data.workouts : [],
      prs: data.prs && typeof data.prs === 'object' && !Array.isArray(data.prs) ? data.prs : {}
    };
  } catch (err) {
    console.error('Failed to load workout store', err);
    return emptyStore();
  }
};

// Compute personal records from workouts
function computePRs(workouts) {
  const prs = {};
  workouts.forEach(w => {
    (w.entries || []).forEach(entry => {
      const ex = entry.exercise;
      if (!ex) return;
      const sets = entry.sets || [];
      sets.forEach(set => {
        const weight = Number(set.weight);
        const reps = Number(set.reps);
        const est = e1RM(weight, reps);
        const cur = prs[ex] || { e1rm: 0, weight: 0, reps: 0 };
        if (Number.isFinite(est) && est > cur.e1rm) {
          cur.e1rm = est;
          cur.weight = weight;
          cur.reps = reps;
        }
        if (Number.isFinite(weight) && weight > cur.weight) cur.weight = weight;
        if (Number.isFinite(reps) && reps > cur.reps) cur.reps = reps;
        prs[ex] = cur;
      });
    });
  });
  return prs;
}

// Export current store as JSON string
function exportJSON() {
  return JSON.stringify(loadWorkoutStore(), null, 2);
}

// Import and validate JSON, recompute PRs
function importJSON(text) {
  const required = ['exercises', 'programs', 'workouts', 'prs'];
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Invalid JSON');
  }
  if (!required.every(k => Object.prototype.hasOwnProperty.call(data, k))) {
    throw new Error('Missing keys');
  }
  const safe = {
    exercises: Array.isArray(data.exercises) ? data.exercises : [],
    programs: Array.isArray(data.programs) ? data.programs : [],
    workouts: Array.isArray(data.workouts) ? data.workouts : []
  };
  safe.prs = computePRs(safe.workouts);
  localStorage.setItem(FT_STORE_KEY, JSON.stringify(safe));
  return safe;
}

// Flatten workouts into CSV
function exportCSV() {
  const { workouts } = loadWorkoutStore();
  const rows = [['date','program','week','day','exercise','set','weight','unit','reps','rpe','e1rm','notes']];
  workouts.forEach(w => {
    const { date='', program='', week='', day='', entries=[] } = w || {};
    entries.forEach(entry => {
      const ex = entry.exercise || '';
      (entry.sets || []).forEach((set, idx) => {
        const weight = set.weight ?? '';
        const reps = set.reps ?? '';
        const e1 = e1RM(weight, reps);
        rows.push([
          date,
          program,
          week,
          day,
          ex,
          idx + 1,
          weight,
          set.unit ?? '',
          reps,
          set.rpe ?? '',
          Number.isFinite(e1) ? e1.toFixed(2) : '',
          (set.notes || '').replace(/\n/g, ' ')
        ]);
      });
    });
  });
  return rows.map(r => r.map(v => (`${v}`).replace(/"/g, '""')).map(v => `"${v}"`).join(',')).join('\n');
}

const saveWorkoutStore = updater => {
  const current = loadWorkoutStore();
  const next = typeof updater === 'function' ? updater(current) : updater;
  const safe = {
    exercises: Array.isArray(next.exercises) ? next.exercises : [],
    programs: Array.isArray(next.programs) ? next.programs : [],
    workouts: Array.isArray(next.workouts) ? next.workouts : []
  };
  safe.prs = computePRs(safe.workouts);
  localStorage.setItem(FT_STORE_KEY, JSON.stringify(safe));
  return safe;
};

window.ftWorkoutStore = {
  load: loadWorkoutStore,
  save: saveWorkoutStore,
  exportJSON,
  importJSON,
  exportCSV,
  key: FT_STORE_KEY
};

/* =========================================================
   Utils
========================================================= */
const lbToKg = lb => lb * 0.45359237;
const kgToLb = kg => kg / 0.45359237;
const inToCm = inches => inches * 2.54;
const cmToIn = cm => cm / 2.54;
const ftInToCm = (ft, inches) => (ft * 12 + inches) * 2.54;
const cmToFtIn = cm => {const totalIn = Math.round(cm / 2.54);return { ft: Math.floor(totalIn / 12), inch: totalIn % 12 };};
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const pInt = v => Number.parseInt(v, 10);
const pFloat = v => Number.parseFloat(v);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

// Compact unique ID helper (base36 timestamp)
const uid = (() => {
  let last = 0;
  return () => {
    const now = Date.now();
    last = now > last ? now : last + 1;
    return last.toString(36);
  };
})();

// Epley estimated 1RM with sanity checks
const e1RM = (weight, reps) => {
  const w = Number(weight);
  const r = Number(reps);
  if (!(Number.isFinite(w) && Number.isFinite(r) && w > 0 && r > 0)) return NaN;
  return w * (1 + r / 30);
};

/* =========================================================
   Metrics
========================================================= */
const bmi = (kg, cm) => kg > 0 && cm > 0 ? kg / Math.pow(cm / 100, 2) : NaN;

// U.S. Navy body-fat — inputs in cm (guarded for bad inputs)
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

/* =========================================================
   Categorization, colors & FFMI percentile
========================================================= */
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
    // Verywell Health categories (men)
    if (pct <= 5) return 'text-rose-600';
    if (pct <= 13) return 'text-emerald-600';
    if (pct <= 17) return 'text-emerald-600';
    if (pct <= 24) return 'text-amber-600';
    return 'text-rose-600';
  } else {
    // Verywell Health categories (women)
    if (pct <= 13) return 'text-rose-600';
    if (pct <= 20) return 'text-emerald-600';
    if (pct <= 24) return 'text-emerald-600';
    if (pct <= 31) return 'text-amber-600';
    return 'text-rose-600';
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

// Height-adjusted FFMI (logic only)
const ffmiAdjusted = (ffmiVal, cm) => {
  if (!Number.isFinite(ffmiVal) || !Number.isFinite(cm)) return NaN;
  const h = cm / 100;
  return ffmiVal + 6.3 * (1.8 - h);
};

/* =========================================================
   Tiny inline reference link
========================================================= */
const Ref = ({ href, label = 'research' }) => /*#__PURE__*/
React.createElement("a", { href: href, target: "_blank", rel: "noreferrer", className: "underline" }, label);


/* =========================================================
   References
========================================================= */
const CIT = {
  // Core concepts
  bmi_misclass_athletes: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3703297/",
  ffmi_method_kouri: "https://www.ncbi.nlm.nih.gov/pubmed/7496846",
  ffmi_athletes_loenneke: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3445648/",
  bmi_obesity_limit: "https://pubmed.ncbi.nlm.nih.gov/18695655/",

  // Protein/deficit/surplus & training quality
  jissn_high_protein_cut: "https://jissn.biomedcentral.com/articles/10.1186/1550-2783-11-20",
  bjsm_review: "https://bjsm.bmj.com/content/52/6/376",
  carbs_training_tandf: "https://www.tandfonline.com/doi/full/10.1080/02640414.2011.610348",
  weekly_rate_ijsnem: "https://journals.humankinetics.com/view/journals/ijsnem/21/2/article-p97.xml",
  high_protein_preserves_LBM: "https://pubmed.ncbi.nlm.nih.gov/19927027/",

  // Partitioning / insulin sensitivity context
  insulin_partitioning: "https://www.nature.com/articles/ijo2010173",
  recomp_ajcn: "https://academic.oup.com/ajcn/article/103/3/738/4564646",

  // Friendly reading hub
  mm_research_hub: "https://meaningfulmacros.com/" };


/* =========================================================
   Small UI bits
========================================================= */
const Section = ({ id, title, right, children }) => /*#__PURE__*/
React.createElement("section", { id, className: "card p-4 mb-4" }, /*#__PURE__*/
React.createElement("header", { className: "flex items-center justify-between mb-3" }, /*#__PURE__*/
React.createElement("h2", { className: "text-lg font-semibold" }, title),
right),

children);



function SmartTooltip({ anchorRef, tip, href, open, onRequestClose, preferred = 'right' }) {
  const tooltipRef = React.useRef(null);
  const [mounted, setMounted] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  const [pos, setPos] = React.useState({
    top: 0, left: 0, placement: 'right', arrowLeft: 12, arrowTop: 12 });


  const computePosition = React.useCallback(() => {
    const a = anchorRef === null || anchorRef === void 0 ? void 0 : anchorRef.current;
    const t = tooltipRef === null || tooltipRef === void 0 ? void 0 : tooltipRef.current;
    if (!a || !t) return;

    // Viewport-relative rect for fixed positioning (NO scroll offsets here)
    const rect = a.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    // Ensure we have tooltip size; if first frame, guess then reflow next frame
    let w = t.offsetWidth || 320;
    let h = t.offsetHeight || 120;

    const margin = 8; // viewport clamp margin
    const gap = 10; // distance from anchor

    // Fit checks within viewport (since coordinates are viewport-based)
    const fitsRight = rect.right + gap + w <= vw - margin;
    const fitsLeft = rect.left - gap - w >= margin;
    const fitsBottom = rect.bottom + gap + h <= vh - margin;
    const fitsTop = rect.top - gap - h >= margin;

    const order = (() => {
      const arr = ['right', 'left', 'bottom', 'top'];
      const idx = arr.indexOf(preferred);
      return idx === -1 ? arr : [arr[idx], ...arr.filter((_, i) => i !== idx)];
    })();

    let placement = 'right';
    let top = 0,left = 0,arrowLeft = 12,arrowTop = 12;

    for (const p of order) {
      if (p === 'right' && fitsRight) {
        placement = 'right';
        left = rect.right + gap;
        top = rect.top + (rect.height - h) / 2;
        top = Math.max(margin, Math.min(top, vh - h - margin));
        arrowTop = rect.top + rect.height / 2 - top;
        arrowTop = Math.max(10, Math.min(arrowTop, h - 10));
        arrowLeft = -6;
        break;
      }
      if (p === 'left' && fitsLeft) {
        placement = 'left';
        left = rect.left - gap - w;
        top = rect.top + (rect.height - h) / 2;
        top = Math.max(margin, Math.min(top, vh - h - margin));
        arrowTop = rect.top + rect.height / 2 - top;
        arrowTop = Math.max(10, Math.min(arrowTop, h - 10));
        arrowLeft = w - 6;
        break;
      }
      if (p === 'bottom' && fitsBottom) {
        placement = 'bottom';
        top = rect.bottom + gap;
        left = rect.left + (rect.width - w) / 2;
        left = Math.max(margin, Math.min(left, vw - w - margin));
        arrowLeft = rect.left + rect.width / 2 - left;
        arrowLeft = Math.max(10, Math.min(arrowLeft, w - 10));
        arrowTop = -6;
        break;
      }
      if (p === 'top' && fitsTop) {
        placement = 'top';
        top = rect.top - gap - h;
        left = rect.left + (rect.width - w) / 2;
        left = Math.max(margin, Math.min(left, vw - w - margin));
        arrowLeft = rect.left + rect.width / 2 - left;
        arrowLeft = Math.max(10, Math.min(arrowLeft, w - 10));
        arrowTop = h - 6;
        break;
      }
    }

    // If nothing “fits”, clamp a right-side placement within viewport
    if (!['right', 'left', 'bottom', 'top'].includes(placement)) {
      placement = preferred || 'right';
      if (placement === 'left') {
        left = rect.left - gap - w;
        top = rect.top + (rect.height - h) / 2;
      } else if (placement === 'bottom') {
        top = rect.bottom + gap;
        left = rect.left + (rect.width - w) / 2;
      } else if (placement === 'top') {
        top = rect.top - gap - h;
        left = rect.left + (rect.width - w) / 2;
      } else {
        // default right
        left = rect.right + gap;
        top = rect.top + (rect.height - h) / 2;
      }
      left = Math.max(margin, Math.min(left, vw - w - margin));
      top = Math.max(margin, Math.min(top, vh - h - margin));
      // arrow roughly toward anchor center
      arrowTop = Math.max(10, Math.min(rect.top + rect.height / 2 - top, h - 10));
      arrowLeft = Math.max(10, Math.min(rect.left + rect.width / 2 - left, w - 10));
      if (placement === 'right') arrowLeft = -6;
      if (placement === 'left') arrowLeft = w - 6;
      if (placement === 'bottom') arrowTop = -6;
      if (placement === 'top') arrowTop = h - 6;
    }

    setPos({ top, left, placement, arrowLeft, arrowTop });
  }, [anchorRef, preferred]);

  // Lifecycle: open/close & recalc on resize/scroll; observe size changes
  React.useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => {
        setVisible(true);
        computePosition();
        // Recompute once more after layout settles
        requestAnimationFrame(computePosition);
      });

      const onScroll = () => computePosition();
      const onResize = () => computePosition();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize);

      // Observe tooltip & anchor size changes (content, fonts, etc.)
      const t = tooltipRef.current;
      const a = anchorRef === null || anchorRef === void 0 ? void 0 : anchorRef.current;
      const ro = new ResizeObserver(() => computePosition());
      if (t) ro.observe(t);
      if (a) ro.observe(a);

      return () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
        ro.disconnect();
      };
    } else {
      setVisible(false);
      const id = setTimeout(() => setMounted(false), 160);
      return () => clearTimeout(id);
    }
  }, [open, computePosition, anchorRef]);

  // Close on outside click / Esc
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = e => {
      const t = tooltipRef.current,a = anchorRef === null || anchorRef === void 0 ? void 0 : anchorRef.current;
      if (!t || !a) return;
      if (!t.contains(e.target) && !a.contains(e.target)) onRequestClose === null || onRequestClose === void 0 ? void 0 : onRequestClose();
    };
    const onKey = e => {if (e.key === 'Escape') onRequestClose === null || onRequestClose === void 0 ? void 0 : onRequestClose();};
    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onRequestClose, anchorRef]);

  if (!mounted) return null;

  const style = {
    top: pos.top,
    left: pos.left,
    maxWidth: 'min(92vw, 360px)',
    opacity: visible ? 1 : 0,
    transform:
    pos.placement === 'right' ?
    visible ? 'translateX(0) scale(1)' : 'translateX(6px) scale(0.98)' :
    pos.placement === 'left' ?
    visible ? 'translateX(0) scale(1)' : 'translateX(-6px) scale(0.98)' :
    visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.98)',
    transition: 'opacity 140ms ease, transform 160ms cubic-bezier(.2,.7,.2,1)',
    transformOrigin:
    pos.placement === 'right' ? 'left center' :
    pos.placement === 'left' ? 'right center' :
    pos.placement === 'bottom' ? 'top center' : 'bottom center' };


  const arrowCommon = 'absolute h-3 w-3 rotate-45 bg-white border border-slate-200 shadow-sm';
  const arrowStyle =
  pos.placement === 'right' ? { top: pos.arrowTop, left: -6 } :
  pos.placement === 'left' ? { top: pos.arrowTop, left: 'calc(100% - 6px)' } :
  pos.placement === 'bottom' ? { left: pos.arrowLeft, top: -6 } :
  { left: pos.arrowLeft, top: 'calc(100% - 6px)' };

  return ReactDOM.createPortal( /*#__PURE__*/
  React.createElement("div", {
    ref: tooltipRef,
    className: "fixed z-[61] pointer-events-auto",
    style: style,
    role: "tooltip" }, /*#__PURE__*/


  React.createElement("div", { className: arrowCommon, style: arrowStyle, "aria-hidden": "true" }), /*#__PURE__*/

  React.createElement("div", {
    className: "rounded-xl border border-slate-200 shadow-lg bg-white/95 backdrop-blur p-3 text-xs text-slate-700",
    onMouseEnter: e => e.stopPropagation(),
    onMouseLeave: () => onRequestClose === null || onRequestClose === void 0 ? void 0 : onRequestClose(),
    style: { lineHeight: 1.35 } }, /*#__PURE__*/

  React.createElement("div", { style: { whiteSpace: 'pre-line' } },
  typeof tip === 'string' ? tip.replace(/\\n/g, '\n') : tip || ''),

  href && /*#__PURE__*/
  React.createElement("div", { className: "mt-2" }, /*#__PURE__*/
  React.createElement("a", { className: "underline", href: href, target: "_blank", rel: "noreferrer" }, "Source")))),




  document.body);

}

// Info: debounced show/hide (prevents flicker) + hover/focus/click
// ───────────────────────────────────────────────────────────────
const Info = ({ abbr, tip, href }) => {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const timers = React.useRef({ open: null, close: null });

  const clearTimers = () => {
    if (timers.current.open) clearTimeout(timers.current.open);
    if (timers.current.close) clearTimeout(timers.current.close);
    timers.current.open = null;
    timers.current.close = null;
  };

  const openWithDelay = () => {
    clearTimers();
    timers.current.open = setTimeout(() => setOpen(true), 70);
  };
  const closeWithDelay = () => {
    clearTimers();
    timers.current.close = setTimeout(() => setOpen(false), 200);
  };

  React.useEffect(() => () => clearTimers(), []);

  return /*#__PURE__*/(
    React.createElement("span", { className: "inline-flex items-center gap-1 text-xs text-slate-500 ml-1" },
    abbr && abbr !== 'i' && /*#__PURE__*/React.createElement("span", { className: "font-semibold" }, "(", abbr, ")"), /*#__PURE__*/

    React.createElement("button", {
      ref: btnRef,
      className: "icon-btn hover:bg-slate-100 transition-colors duration-150",
      type: "button",
      "aria-label": tip || abbr || 'Info',
      "aria-expanded": open ? 'true' : 'false',
      onMouseEnter: openWithDelay,
      onMouseLeave: closeWithDelay,
      onFocus: openWithDelay,
      onBlur: () => setOpen(false),
      onClick: () => setOpen(v => !v) }, "i"), /*#__PURE__*/




    React.createElement(SmartTooltip, {
      anchorRef: btnRef,
      tip: tip,
      href: href,
      open: open,
      onRequestClose: () => setOpen(false),
      preferred: "right" // try right of the (i); falls back automatically
    })));


};


const InstagramSVG = () => /*#__PURE__*/
React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", className: "w-4 h-4", fill: "currentColor" }, /*#__PURE__*/React.createElement("path", { d: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM18 6.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" }));

const TikTokSVG = () => /*#__PURE__*/
React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 48 48", className: "w-4 h-4", fill: "currentColor" }, /*#__PURE__*/React.createElement("path", { d: "M30 6c1.6 3.6 4.6 6.3 8.3 7.2v6.1c-3.2-.1-6.2-1.1-8.7-2.8v12.3c0 7.1-5.7 12.8-12.8 12.8S4 35.9 4 28.8s5.7-12.8 12.8-12.8c1.2 0 2.4.2 3.5.5v6.4c-.9-.4-1.9-.6-3-.6-3.4 0-6.3 2.8-6.3 6.3s2.8 6.3 6.3 6.3 6.3-2.8 6.3-6.3V6h6.4z" }));


const Social = () => /*#__PURE__*/
React.createElement("div", { className: "flex items-center gap-4 text-sm" }, /*#__PURE__*/
React.createElement("a", { className: "inline-flex items-center gap-1 underline", href: "https://www.instagram.com/luisitin2001", target: "_blank", rel: "noreferrer", title: "@luisitin2001 on Instagram" }, /*#__PURE__*/React.createElement(InstagramSVG, null), "Instagram"), /*#__PURE__*/
React.createElement("span", { className: "text-slate-400" }, "\u2022"), /*#__PURE__*/
React.createElement("a", { className: "inline-flex items-center gap-1 underline", href: "https://www.tiktok.com/@luisitin2001", target: "_blank", rel: "noreferrer" }, /*#__PURE__*/React.createElement(TikTokSVG, null), "TikTok"));



/* =========================================================
   Recommendation Engine
========================================================= */
function recommendPhase({ sex, BF, FFMI, FFMIadj, BMIval, TDEE }) {
  const isMale = sex === 'male';
  const ok = Number.isFinite(BF) && Number.isFinite(FFMIadj) && Number.isFinite(BMIval);

  if (!ok) {
    return {
      phase: null,
      kcal: null,
      targets: [],
      profileLine: null,
      research: [],
      notes: [] };

  }

  const f1 = n => Number.isFinite(n) ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—';
  const capWords = s => typeof s === 'string' ? s.replace(/\b\w/g, c => c.toUpperCase()) : s;

  const bmiTag = bmiInfo(BMIval).label;
  const ffmiPct = Math.round(ffmiPercentile(FFMI, sex)); // percentile uses unadjusted FFMI

  function bfCategory(pct) {
    if (!Number.isFinite(pct)) return '—';
    if (isMale) {
      if (pct <= 5) return 'essential';
      if (pct <= 13) return 'athlete';
      if (pct <= 17) return 'fitness';
      if (pct <= 24) return 'average';
      return 'obese';
    } else {
      if (pct <= 13) return 'essential';
      if (pct <= 20) return 'athlete';
      if (pct <= 24) return 'fitness';
      if (pct <= 31) return 'average';
      return 'obese';
    }
  }
  const bfCat = bfCategory(BF);
  const bfCatCap = capWords(bfCat);

  // FFMI band (height-adjusted for logic only)
  const ffmiBand = (() => {
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
  const ffmiBandCap = capWords(ffmiBand);

  const ffmiHigh = ffmiBand === 'high' || ffmiBand === 'very high';

  // Decide phase (BF% first, FFMI tiebreaker)
  let phase = 'maintain';
  if (isMale) {
    if (BF >= 40 || BF >= 30) phase = 'cut';else
    if (BF >= 25) phase = 'cut';else
    if (BF >= 22) phase = FFMIadj <= 21 ? 'cut' : 'recomp';else
    if (BF >= 18) phase = FFMIadj >= 21 ? 'recomp' : 'cut';else
    if (BF >= 15) phase = FFMIadj < 22 ? 'lean bulk' : FFMIadj >= 23 ? 'maintain' : 'lean bulk';else
    if (BF >= 12) phase = FFMIadj < 23 ? 'lean bulk' : 'maintain';else
    if (BF >= 10) phase = FFMIadj >= 24 ? 'maintain' : 'lean bulk';else
    phase = 'lean bulk';
  } else {
    if (BF >= 45 || BF >= 40) phase = 'cut';else
    if (BF >= 35) phase = 'cut';else
    if (BF >= 30) phase = FFMIadj <= 20 ? 'cut' : 'recomp';else
    if (BF >= 26) phase = FFMIadj >= 18 ? 'recomp' : 'lean bulk';else
    if (BF >= 22) phase = FFMIadj < 20 ? 'lean bulk' : 'maintain';else
    if (BF >= 18) phase = FFMIadj >= 20 ? 'maintain' : 'lean bulk';else
    phase = 'lean bulk';
  }

  // Discrete targets (lb/week) + kcal/day
  const hasTDEE = Number.isFinite(TDEE);
  const targets = [];
  if (hasTDEE) {
    const CUT_RATES = [0.5, 1.0, 2.0];
    const BULK_RATES = [0.5, 0.75, 1.0];
    const pick = phase === 'cut' ? CUT_RATES : phase === 'lean bulk' ? BULK_RATES : [];
    pick.forEach(rateLb => {
      const kcalDelta = 7700 * lbToKg(rateLb) / 7; // kcal/day
      const kcal = phase === 'cut' ? TDEE - kcalDelta : TDEE + kcalDelta;
      targets.push({ rateLb, kcal: Math.round(kcal), sign: phase === 'cut' ? '−' : '+' });
    });
  }

  // Because (bulleted; uses actual statuses; numeric not color-coded)
  const bfDirective = bfCat === 'average' || bfCat === 'obese' ?
  'which means you have room for fat loss' :
  'which gives you plenty of runway to build muscle';

  const ffmiMeaning = (() => {
    switch (ffmiBand) {
      case 'low':return 'you have significant capacity for natural muscle growth';
      case 'moderate':return 'you still have a lot of capacity for natural muscle growth';
      case 'trained':return 'you have a solid base; gains will be slower but meaningful';
      case 'high':return 'you are approaching the upper end of typical natural muscularity';
      case 'very high':return 'you are near the upper limit of typical natural muscularity';
      default:return '';}

  })();

  const profileLine = /*#__PURE__*/
  React.createElement("ul", { className: "list-disc pl-5 space-y-1" }, /*#__PURE__*/
  React.createElement("li", null, "You have ", /*#__PURE__*/
  React.createElement("span", { className: "font-semibold" }, bfCatCap), " body fat for a ", sex, " (", Math.round(BF), "%), ", bfDirective, "."), /*#__PURE__*/

  React.createElement("li", null, "Your FFMI is ", /*#__PURE__*/
  React.createElement("span", { className: "font-semibold" }, f1(FFMI)), " (", /*#__PURE__*/React.createElement("span", { className: "font-semibold" }, ffmiBandCap), Number.isFinite(ffmiPct) ? `, ~${ffmiPct}th percentile` : '', ") \u2014 ", ffmiMeaning, "."), /*#__PURE__*/

  React.createElement("li", null, "Your BMI is ", /*#__PURE__*/
  React.createElement("span", { className: "font-semibold" }, f1(BMIval)), " (", bmiTag, ") \u2014 a screening number; BF% and FFMI drive the decision."));




  // Recommended research
  const research = [/*#__PURE__*/
  React.createElement("li", { key: "mm" }, /*#__PURE__*/React.createElement("a", { className: "underline", href: CIT.mm_research_hub, target: "_blank", rel: "noreferrer" }, "MeaningfulMacros \u2014 Fitness Blog")), /*#__PURE__*/
  React.createElement("li", { key: "fmi" }, /*#__PURE__*/React.createElement("a", { className: "underline", href: CIT.bmi_misclass_athletes, target: "_blank", rel: "noreferrer" }, "BMI can misclassify muscular people")), /*#__PURE__*/
  React.createElement("li", { key: "kouri" }, /*#__PURE__*/React.createElement("a", { className: "underline", href: CIT.ffmi_method_kouri, target: "_blank", rel: "noreferrer" }, "Height-adjusted FFMI method (Kouri et\xA0al., 1995)"))];


  // Notes (context checks)
  const notes = [];
  if (BMIval >= 30 && (isMale ? BF >= 25 : BF >= 32)) {
    notes.push( /*#__PURE__*/
    React.createElement("p", { key: "note-bmi-health" }, "Note: With high BF% and BMI \u2265 30, a health-first cut is the safest play (", /*#__PURE__*/
    React.createElement(Ref, { href: CIT.bmi_misclass_athletes }), ")."));


  } else if (BMIval >= 27 && ffmiHigh) {
    notes.push( /*#__PURE__*/
    React.createElement("p", { key: "note-bmi-muscle" }, "Note: High BMI + high FFMI often means you\u2019re muscular, not just \u201Coverweight.\u201D Decide by BF% and FFMI, not BMI alone (", /*#__PURE__*/
    React.createElement(Ref, { href: CIT.bmi_misclass_athletes }), ", ", /*#__PURE__*/React.createElement(Ref, { href: CIT.bmi_obesity_limit }), ")."));


  }

  return { phase, targets, profileLine, research, notes };
}

/* ---------------- Info DB + Panel ---------------- */
const INFO_DB = [
{
  id: 'ffmi',
  label: 'FFMI (Fat-Free Mass Index)',
  body: /*#__PURE__*/
  React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("p", { className: "mb-2" }, "FFMI describes muscularity: ", /*#__PURE__*/React.createElement("span", { className: "mono" }, "lean mass \xF7 height\xB2"), " (kg/m\xB2). It scales out height so two people with the same lean mass per height score similarly."), /*#__PURE__*/
  React.createElement("ul", { className: "list-disc pl-5 space-y-1" }, /*#__PURE__*/
  React.createElement("li", null, "Useful for tracking muscle gain independent of fat mass."), /*#__PURE__*/
  React.createElement("li", null, "Percentiles help compare to population norms."), /*#__PURE__*/
  React.createElement("li", null, "High values suggest a large lean mass base."))),



  sources: [{ label: 'Kouri et al., 1995', href: CIT.ffmi_method_kouri }] },

{
  id: 'ffmi_adj',
  label: 'Height-Adjusted FFMI',
  body: /*#__PURE__*/
  React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("p", { className: "mb-2" }, "A correction that centers FFMI to ~1.80 m: ", /*#__PURE__*/React.createElement("span", { className: "mono" }, "FFMI", /*#__PURE__*/React.createElement("sub", null, "adj"), " = FFMI + 6.3 \xD7 (1.8 \u2212 height", /*#__PURE__*/React.createElement("sub", null, "m"), ")"), "."), /*#__PURE__*/
  React.createElement("ul", { className: "list-disc pl-5 space-y-1" }, /*#__PURE__*/
  React.createElement("li", null, "Improves comparison across very tall/short individuals."), /*#__PURE__*/
  React.createElement("li", null, "We use it inside the logic; the UI shows non-adjusted FFMI for simplicity."))),



  sources: [{ label: 'Kouri et al., 1995', href: CIT.ffmi_method_kouri }] },

{
  id: 'bmi',
  label: 'BMI (Body Mass Index)',
  body: /*#__PURE__*/
  React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("p", { className: "mb-2" }, "Screening ratio of weight to height: ", /*#__PURE__*/React.createElement("span", { className: "mono" }, "kg \xF7 m\xB2"), ". Quick health screen, not a composition tool."), /*#__PURE__*/
  React.createElement("ul", { className: "list-disc pl-5 space-y-1" }, /*#__PURE__*/
  React.createElement("li", null, "Can misclassify very muscular people as \u201Coverweight/obese\u201D."), /*#__PURE__*/
  React.createElement("li", null, "Best used alongside BF% and FFMI."))),



  sources: [
  { label: 'CDC overview', href: 'https://www.cdc.gov/bmi/about/index.html' },
  { label: 'FMI vs BMI (BMC Public Health, 2013)', href: CIT.bmi_misclass_athletes }] },


{
  id: 'bf_navy',
  label: 'BF% (U.S. Navy Tape)',
  body: /*#__PURE__*/
  React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("p", { className: "mb-2" }, "Circumference method using neck, waist (and hip for women). Gives a reasonable field estimate of body fat % if measured consistently."), /*#__PURE__*/
  React.createElement("ul", { className: "list-disc pl-5 space-y-1" }, /*#__PURE__*/
  React.createElement("li", null, "Measure relaxed, same time of day, minimal clothing."), /*#__PURE__*/
  React.createElement("li", null, "Calibrated for populations; individual error can vary."))),



  sources: [{ label: 'U.S. Navy method', href: 'https://www.calculator.net/body-fat-calculator.html' }] },

{
  id: 'bmr_msj',
  label: 'BMR — Mifflin–St Jeor',
  body: /*#__PURE__*/
  React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("p", { className: "mb-2" }, "Resting energy estimate from height, weight, age, sex. Well-validated for adults."), /*#__PURE__*/
  React.createElement("p", { className: "mono text-xs" }, "Male: 10\xB7kg + 6.25\xB7cm \u2212 5\xB7age + 5"), /*#__PURE__*/
  React.createElement("p", { className: "mono text-xs" }, "Female: 10\xB7kg + 6.25\xB7cm \u2212 5\xB7age \u2212 161")),


  sources: [{ label: 'Original paper', href: 'https://pubmed.ncbi.nlm.nih.gov/2305711/' }] },

{
  id: 'bmr_km',
  label: 'BMR — Katch–McArdle',
  body: /*#__PURE__*/
  React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("p", { className: "mb-2" }, "Resting energy from lean mass: ", /*#__PURE__*/React.createElement("span", { className: "mono" }, "370 + 21.6 \xD7 LBM"), ". Useful if BF% is known.")),


  sources: [{ label: 'ACE explainer', href: 'https://www.acefitness.org/certifiednewsarticle/2882/resting-metabolic-rate-best-ways-to-measure-it-and-raise-it-too/' }] },

{
  id: 'tdee',
  label: 'TDEE (Total Daily Energy Expenditure)',
  body: /*#__PURE__*/
  React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("p", { className: "mb-2" }, "Calories you burn per day: ", /*#__PURE__*/React.createElement("span", { className: "mono" }, "BMR \xD7 activity multiplier"), ". Drives cut/bulk/maintain targets.")),


  sources: [{ label: 'NIDDK planner', href: 'https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner' }] },

{
  id: 'activity',
  label: 'Activity Multipliers',
  body: /*#__PURE__*/
  React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("ul", { className: "list-disc pl-5 space-y-1" }, /*#__PURE__*/
  React.createElement("li", null, "Sedentary \u2248 1.2x \u2022 Light 1.375x \u2022 Moderate 1.55x \u2022 Very 1.725x \u2022 Extra 1.9x"), /*#__PURE__*/
  React.createElement("li", null, "Manual override lets you tune if your lifestyle is atypical."))),



  sources: [{ label: 'Common practice', href: 'https://examine.com/guides/how-to-lose-weight/' }] },

{
  id: 'fmi_vs_bmi',
  label: 'FMI vs. BMI & %BF',
  body: /*#__PURE__*/
  React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("p", { className: "mb-2" }, "Fat Mass Index (FMI) can classify adiposity better than BMI alone, especially in muscular individuals.")),


  sources: [{ label: 'BMC Public Health (2013)', href: CIT.bmi_misclass_athletes }] },

{
  id: 'recomp',
  label: 'Body Recomposition',
  body: /*#__PURE__*/
  React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("p", { className: "mb-2" }, "Gaining muscle and losing fat concurrently is most feasible for newer lifters or those with higher BF% and room for growth.")),


  sources: [{ label: 'AJCN (2016) trial', href: CIT.recomp_ajcn }] }];



function InfoPanel() {var _item$sources;
  const [key, setKey] = React.useState('ffmi');
  const item = React.useMemo(() => INFO_DB.find(x => x.id === key) || INFO_DB[0], [key]);

  return /*#__PURE__*/(
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("div", { className: "grid sm:grid-cols-3 gap-3" }, /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("label", { className: "block text-sm font-medium" }, "Topic"), /*#__PURE__*/
    React.createElement("select", { className: "field", value: key, onChange: e => setKey(e.target.value) },
    INFO_DB.map(x => /*#__PURE__*/React.createElement("option", { key: x.id, value: x.id }, x.label))))), /*#__PURE__*/




    React.createElement("div", { className: "mt-3 p-3 rounded-xl border bg-white/70 fade-slide-in" }, /*#__PURE__*/
    React.createElement("div", { className: "text-sm space-y-2" }, item.body),
    ((_item$sources = item.sources) === null || _item$sources === void 0 ? void 0 : _item$sources.length) > 0 && /*#__PURE__*/
    React.createElement("div", { className: "text-xs text-slate-600 mt-3" }, "Sources:",
    ' ',
    item.sources.map((s, i) => /*#__PURE__*/
    React.createElement(React.Fragment, { key: s.href }, /*#__PURE__*/
    React.createElement("a", { className: "underline", href: s.href, target: "_blank", rel: "noreferrer" }, s.label),
    i < item.sources.length - 1 ? ', ' : ''))))));







}

/* =========================================================
   App
========================================================= */
function App() {
  const [view, setView] = useState('Profile');
  const [wtTab, setWtTab] = useState('wt-exercises');
  const [unit, setUnit] = useState('imperial'); // imperial shows ft/in & lb
  const [sex, setSex] = useState('male');
  const [age, setAge] = useState('');
  const [ageErr, setAgeErr] = useState('');

  // height/weight state
  const [hFt, setHFt] = useState('');
  const [hIn, setHIn] = useState('');
  const [hCm, setHCm] = useState('');
  const [wLb, setWLb] = useState('');
  const [wKg, setWKg] = useState('');

  // Body-fat
  const [bfMode, setBfMode] = useState('manual');
  const [bfManual, setBfManual] = useState('');
  const [neck, setNeck] = useState('');
  const [waist, setWaist] = useState('');
  const [hip, setHip] = useState('');

  // Energy & Goals
  const [activity, setActivity] = useState('1.55');
  const [activityManual, setActivityManual] = useState('');
  const [goalType, setGoalType] = useState(''); // '', 'cut', 'bulk', 'maintain'
  const [goalRate, setGoalRate] = useState(''); // per week

  // Workout tracker exercises
  const [exercises, setExercises] = useState(() => ftWorkoutStore.load().exercises);
  const [exName, setExName] = useState('');
  const [exMuscles, setExMuscles] = useState('');
  const [exUnit, setExUnit] = useState('lb');
  const [exTags, setExTags] = useState('');
  const [exNotes, setExNotes] = useState('');
  const [exSearch, setExSearch] = useState('');
  const [exErr, setExErr] = useState('');

  // Workout programs
  const [programs, setPrograms] = useState(() => ftWorkoutStore.load().programs);
  const [progName, setProgName] = useState('');
  const [progWeeks, setProgWeeks] = useState('');
  const [progDays, setProgDays] = useState('');
  const [editingProgId, setEditingProgId] = useState(null);

  // Workout log
  const [workouts, setWorkouts] = useState(() => ftWorkoutStore.load().workouts);
  const [prs, setPrs] = useState(() => ftWorkoutStore.load().prs);

  const blankEntry = () => ({ id: uid(), exercise: '', muscleGroup: '', weight: '', reps: '', rpe: '', notes: '' });
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logProgram, setLogProgram] = useState('');
  const [logWeek, setLogWeek] = useState('');
  const [logDay, setLogDay] = useState('');
  const [logEntries, setLogEntries] = useState([blankEntry()]);
  const [logSearch, setLogSearch] = useState('');
  const [logExFilter, setLogExFilter] = useState('');
  const [logMgFilter, setLogMgFilter] = useState('');
  const muscleGroupOptions = useMemo(() => Array.from(new Set(exercises.flatMap(ex => ex.muscleGroups || []))), [exercises]);

  const filteredExercises = useMemo(() => {
    const term = exSearch.trim().toLowerCase();
    return exercises
      .filter(ex => {
        if (!term) return true;
        const name = ex.name.toLowerCase();
        const tags = (ex.tags || []).join(' ').toLowerCase();
        return name.includes(term) || tags.includes(term);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, exSearch]);

  const handleAddExercise = e => {
    e.preventDefault();
    const name = exName.trim();
    if (!name) {
      setExErr('Name is required');
      return;
    }
    const exercise = {
      id: Date.now().toString(36),
      name,
      muscleGroups: exMuscles.split(',').map(s => s.trim()).filter(Boolean),
      unit: exUnit,
      tags: exTags.split(',').map(s => s.trim()).filter(Boolean),
      notes: exNotes.trim()
    };
    const next = [...exercises, exercise];
    ftWorkoutStore.save(store => ({ ...store, exercises: next }));
    setExercises(next);
    setExName('');
    setExMuscles('');
    setExUnit('lb');
    setExTags('');
    setExNotes('');
    setExErr('');
    window.dispatchEvent(new Event('ft-exercises-changed'));
  };

  const handleDeleteExercise = id => {
    const next = exercises.filter(ex => ex.id !== id);
    ftWorkoutStore.save(store => ({ ...store, exercises: next }));
    setExercises(next);
    window.dispatchEvent(new Event('ft-exercises-changed'));
  };

  // Program helpers
  const updatePrograms = next => {
    ftWorkoutStore.save(store => ({ ...store, programs: next }));
    setPrograms(next);
  };

  const handleCreateProgram = e => {
    e.preventDefault();
    const name = progName.trim();
    const w = parseInt(progWeeks, 10);
    const d = parseInt(progDays, 10);
    if (!name || !w || !d) return;
    const plan = Array.from({ length: w }, () => Array.from({ length: d }, () => []));
    const program = { id: uid(), name, weeks: w, days: d, plan };
    const next = [...programs, program];
    updatePrograms(next);
    setProgName('');
    setProgWeeks('');
    setProgDays('');
    setEditingProgId(program.id);
  };

  const handleEditProgram = id => setEditingProgId(id);

  const handleDeleteProgram = id => {
    const next = programs.filter(p => p.id !== id);
    updatePrograms(next);
    if (editingProgId === id) setEditingProgId(null);
  };

  const updateProgram = (id, updater) => {
    const next = programs.map(p => p.id === id ? updater(p) : p);
    updatePrograms(next);
  };

  const handleAddBlock = (wIdx, dIdx) => {
    updateProgram(editingProgId, p => {
      const plan = p.plan.map((w, wi) => w.map((day, di) => {
        if (wi === wIdx && di === dIdx) {
          return [...day, { id: uid(), exercise: '', sets: '', reps: '', perc: '', rpe: '', notes: '' }];
        }
        return day;
      }));
      return { ...p, plan };
    });
  };

  const handleRemoveBlock = (wIdx, dIdx, blockId) => {
    updateProgram(editingProgId, p => {
      const plan = p.plan.map((w, wi) => w.map((day, di) => {
        if (wi === wIdx && di === dIdx) {
          return day.filter(b => b.id !== blockId);
        }
        return day;
      }));
      return { ...p, plan };
    });
  };

  const handleBlockChange = (wIdx, dIdx, blockId, field, value) => {
    updateProgram(editingProgId, p => {
      const plan = p.plan.map((w, wi) => w.map((day, di) => {
        if (wi === wIdx && di === dIdx) {
          return day.map(b => b.id === blockId ? { ...b, [field]: value } : b);
        }
        return day;
      }));
      return { ...p, plan };
    });
  };

  const editingProgram = programs.find(p => p.id === editingProgId);

  const renderProgramList = () => /*#__PURE__*/React.createElement(React.Fragment, null,
    /*#__PURE__*/React.createElement("form", { onSubmit: handleCreateProgram, className: "card p-4 space-y-2" }, /*#__PURE__*/React.createElement("input", {
      className: "field",
      placeholder: "Program name",
      value: progName,
      onChange: e => setProgName(e.target.value)
    }), /*#__PURE__*/React.createElement("input", {
      className: "field",
      type: "number",
      min: "1",
      placeholder: "Weeks",
      value: progWeeks,
      onChange: e => setProgWeeks(e.target.value)
    }), /*#__PURE__*/React.createElement("input", {
      className: "field",
      type: "number",
      min: "1",
      placeholder: "Days per week",
      value: progDays,
      onChange: e => setProgDays(e.target.value)
    }), /*#__PURE__*/React.createElement("div", { className: "text-right" }, /*#__PURE__*/React.createElement("button", { type: "submit", className: "kbd" }, "Create"))), programs.length > 0 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", { className: "font-medium mb-2" }, "Saved Programs"), /*#__PURE__*/React.createElement("div", { className: "card-grid" }, programs.map(p => /*#__PURE__*/React.createElement("div", { key: p.id, className: "card p-4 space-y-2" }, /*#__PURE__*/React.createElement("div", { className: "font-medium" }, p.name), /*#__PURE__*/React.createElement("div", { className: "text-xs text-slate-600" }, `${p.weeks}w x ${p.days}d`), /*#__PURE__*/React.createElement("div", { className: "flex gap-2 mt-2" }, /*#__PURE__*/React.createElement("button", { type: "button", className: "px-2 py-1 border rounded text-xs", onClick: () => handleEditProgram(p.id) }, "Edit"), /*#__PURE__*/React.createElement("button", { type: "button", className: "px-2 py-1 border rounded text-xs", onClick: () => handleDeleteProgram(p.id) }, "Delete")))))));

  const renderBlock = (block, wIdx, dIdx) => /*#__PURE__*/React.createElement("div", { key: block.id, className: "space-y-1" }, /*#__PURE__*/React.createElement("div", { className: "flex gap-1" }, /*#__PURE__*/React.createElement("select", {
    className: "field flex-1",
    value: block.exercise,
    onChange: e => handleBlockChange(wIdx, dIdx, block.id, 'exercise', e.target.value)
  }, /*#__PURE__*/React.createElement("option", { value: "" }, "Select exercise"), exercises.map(ex => /*#__PURE__*/React.createElement("option", { key: ex.id, value: ex.name }, ex.name))), /*#__PURE__*/React.createElement("input", {
    className: "field w-16",
    placeholder: "Sets",
    value: block.sets,
    onChange: e => handleBlockChange(wIdx, dIdx, block.id, 'sets', e.target.value)
  }), /*#__PURE__*/React.createElement("input", {
    className: "field w-16",
    placeholder: "Reps",
    value: block.reps,
    onChange: e => handleBlockChange(wIdx, dIdx, block.id, 'reps', e.target.value)
  })), /*#__PURE__*/React.createElement("div", { className: "flex gap-1 items-start" }, /*#__PURE__*/React.createElement("input", {
    className: "field w-20",
    placeholder: "%1RM",
    value: block.perc,
    onChange: e => handleBlockChange(wIdx, dIdx, block.id, 'perc', e.target.value)
  }), /*#__PURE__*/React.createElement("input", {
    className: "field w-16",
    placeholder: "RPE",
    value: block.rpe,
    onChange: e => handleBlockChange(wIdx, dIdx, block.id, 'rpe', e.target.value)
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "icon-btn",
    onClick: () => handleRemoveBlock(wIdx, dIdx, block.id)
  }, "\u2715")), /*#__PURE__*/React.createElement("textarea", {
    className: "field",
    placeholder: "Notes",
    rows: "2",
    value: block.notes,
    onChange: e => handleBlockChange(wIdx, dIdx, block.id, 'notes', e.target.value)
  }));

  const renderProgramEditor = () => {
    if (!editingProgram) return null;
    return /*#__PURE__*/React.createElement("div", { className: "space-y-4" }, /*#__PURE__*/React.createElement("div", { className: "flex items-center gap-2" }, /*#__PURE__*/React.createElement("input", {
      className: "field flex-1",
      value: editingProgram.name,
      onChange: e => updateProgram(editingProgId, p => ({ ...p, name: e.target.value }))
    }), /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "px-2 py-1 border rounded text-xs",
      onClick: () => setEditingProgId(null)
    }, "Back")), /*#__PURE__*/React.createElement("div", {
      className: "grid gap-4",
      style: { gridTemplateColumns: `repeat(${editingProgram.days}, minmax(0,1fr))` }
    }, editingProgram.plan.flatMap((week, wIdx) => week.map((day, dIdx) => /*#__PURE__*/React.createElement("fieldset", { key: `${wIdx}-${dIdx}`, className: "p-2 border rounded space-y-2" }, /*#__PURE__*/React.createElement("legend", { className: "text-sm font-medium" }, `Week ${wIdx + 1} Day ${dIdx + 1}`), day.map(block => renderBlock(block, wIdx, dIdx)), /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "px-2 py-1 border rounded text-xs",
      onClick: () => handleAddBlock(wIdx, dIdx)
    }, "Add Block"))))));
  };

  const addLogRow = () => setLogEntries(rows => [...rows, blankEntry()]);
  const updateLogRow = (id, field, value) => setLogEntries(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  const removeLogRow = id => setLogEntries(rows => rows.filter(r => r.id !== id));

  const handleLogSubmit = e => {
    e.preventDefault();
    const entries = logEntries.filter(r => r.exercise);
    if (entries.length === 0) return;
    const workout = {
      id: uid(),
      date: logDate,
      program: logProgram,
      week: logWeek,
      day: logDay,
      entries: entries.map(r => {
        const weight = Number(r.weight);
        const reps = Number(r.reps);
        const unit = exercises.find(ex => ex.name === r.exercise)?.unit || 'lb';
        const e1 = e1RM(weight, reps);
        return {
          id: uid(),
          exercise: r.exercise,
          muscleGroup: r.muscleGroup,
          sets: [{
            weight: r.weight,
            reps: r.reps,
            rpe: r.rpe,
            notes: r.notes,
            unit,
            e1rm: Number.isFinite(e1) ? e1 : undefined
          }]
        };
      })
    };
    const next = ftWorkoutStore.save(store => ({ ...store, workouts: [...store.workouts, workout] }));
    setWorkouts(next.workouts);
    setPrs(next.prs);
    setLogDate(new Date().toISOString().slice(0, 10));
    setLogProgram('');
    setLogWeek('');
    setLogDay('');
    setLogEntries([blankEntry()]);
  };

  const filteredWorkouts = useMemo(() => {
    const term = logSearch.trim().toLowerCase();
    return workouts
      .filter(w => {
        if (logExFilter && !(w.entries || []).some(e => e.exercise === logExFilter)) return false;
        if (logMgFilter && !(w.entries || []).some(e => {
          const ex = exercises.find(x => x.name === e.exercise);
          return ex && (ex.muscleGroups || []).includes(logMgFilter);
        })) return false;
        if (term) {
          const hasNote = (w.entries || []).some(entry =>
            (entry.sets || []).some(set => (set.notes || '').toLowerCase().includes(term))
          );
          if (!hasNote) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [workouts, logSearch, logExFilter, logMgFilter, exercises]);

  // Fun facts
  const FUN = [
  'BMI is a screening tool; it cannot distinguish muscle from fat.',
  'Muscle tissue burns more calories at rest than fat tissue.',
  'Your body can store carbohydrates as glycogen in both muscles and your liver for quick energy.',
  'VO₂ max is a measure of how efficiently your body uses oxygen during intense exercise.',
  'You start losing strength faster than muscle size when you stop training — neural adaptations fade first.',
  'Delayed onset muscle soreness (DOMS) often peaks 24–72 hours after unfamiliar or intense exercise.',
  'Protein needs rise during a calorie deficit to help preserve muscle mass.',
  'Fast-twitch muscle fibers produce more force but fatigue faster than slow-twitch fibers.',
  'Strength training can increase bone mineral density and lower osteoporosis risk.',
  'You burn calories even after your workout ends — called EPOC.',
  'Creatine monohydrate is one of the most researched supplements for increasing strength and muscle mass.',
  'Sleep is where much of your physical recovery and muscle repair occurs.'];

  const [factIdx, setFactIdx] = useState(0);
  useEffect(() => {const id = setInterval(() => setFactIdx(i => (i + 1) % FUN.length), 10000);return () => clearInterval(id);}, []);
  const shuffleFact = () => setFactIdx(i => (i + 1) % FUN.length);

  const VIEWS = ['Profile', 'Energy & Goals', 'Unlock Potential', 'Workout Tracker', 'Info'];
  const toId = v => 'view-' + v.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Reveal for the recommendation block
  const [recReady, setRecReady] = useState(false);
  useEffect(() => {
    if (view === 'Unlock Potential') {
      setRecReady(false);
      const id = setTimeout(() => setRecReady(true), 450);
      return () => clearTimeout(id);
    }
  }, [view]);

  useEffect(() => {
    if (view === 'Workout Tracker') setWtTab('wt-exercises');
  }, [view]);

  // Workout store helpers
  const handleExportJSON = () => {
    const data = ftWorkoutStore.exportJSON();
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'workout-store.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try { ftWorkoutStore.importJSON(reader.result); location.reload(); }
        catch (err) { alert('Import failed'); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleExportCSV = () => {
    const data = ftWorkoutStore.exportCSV();
    const blob = new Blob([data], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'workouts.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

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

  /* ---------- Micro animation component for numbers ---------- */
  const SmoothNumber = ({ value, format = 'int', className = '' }) => {
    const formatter = format === 'int' ? n => Number.isFinite(n) ? Math.round(n) : NaN : n => Number.isFinite(n) ? Number(n) : NaN;
    const toText = format === 'int' ? n => Number.isFinite(n) ? Math.round(n).toLocaleString() : '—' : n => Number.isFinite(n) ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—';
    const rafRef = useRef(null);
    const startRef = useRef(null);
    const fromRef = useRef(Number.isFinite(value) ? value : NaN);
    const [display, setDisplay] = useState(Number.isFinite(value) ? value : NaN);

    useEffect(() => {
      if (!Number.isFinite(value)) {setDisplay(NaN);fromRef.current = NaN;return;}
      const from = Number.isFinite(display) ? display : value;
      fromRef.current = from;
      const duration = 650;
      cancelAnimationFrame(rafRef.current);
      startRef.current = null;

      const tick = ts => {
        if (!startRef.current) startRef.current = ts;
        const t = clamp((ts - startRef.current) / duration, 0, 1);
        const eased = easeOutCubic(t);
        const next = from + (value - from) * eased;
        setDisplay(next);
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
      // value only
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return /*#__PURE__*/React.createElement("span", { className: "mono transition-opacity " + className }, toText(display));
  };

  return /*#__PURE__*/(
    React.createElement("div", { className: "max-w-5xl mx-auto px-4 py-6" }, /*#__PURE__*/

    React.createElement("div", { className: "flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4 animate-fadeUp" }, /*#__PURE__*/
    React.createElement("div", {
      className: "w-16 h-16 rounded-2xl bg-yellow-100 flex items-center justify-center text-3xl shadow bouncy select-none",
      "aria-hidden": "true",
      title: "Hi!" }, "\uD83D\uDE42"), /*#__PURE__*/




    React.createElement("div", { className: "flex-1 min-w-0" }, /*#__PURE__*/
    React.createElement("h1", { className: "text-2xl md:text-3xl font-bold tracking-tight" }, "Fitness Toolkit"), /*#__PURE__*/
    React.createElement("p", { className: "text-slate-600" }, "Let's build muscle and outwit gravity. Strong today, stronger next Tuesday.")), /*#__PURE__*/

    React.createElement(Social, null)), /*#__PURE__*/



    React.createElement(Section, { title: "Pick a Tool", right: /*#__PURE__*/React.createElement("span", { className: "text-xs text-slate-500" }, "Everything updates automatically") }, /*#__PURE__*/
    // Display all view tabs including Workout Tracker
    React.createElement("div", { className: "flex gap-2 overflow-x-auto pb-2" },
    VIEWS.map((v) => /*#__PURE__*/
    React.createElement("button", {
      key: v,
      onClick: () => setView(v),
      className:
      (view === v ? 'bg-slate-900 text-white ' : 'bg-white hover:bg-slate-50 ') +
      'border rounded-2xl px-3 py-2 text-left transition-colors flex-shrink-0',
      style: { minWidth: '8rem' },
      "data-target": toId(v),
      role: "tab",
      "aria-selected": view === v
    },


    v))), /*#__PURE__*/




    React.createElement("div", { className: "mt-3 flex items-center justify-between text-sm text-slate-600" }, /*#__PURE__*/
    React.createElement("div", { className: "flex items-center gap-2" }, /*#__PURE__*/
    React.createElement("span", { className: "px-2 py-0.5 rounded bg-slate-100" }, "Fun fact"), /*#__PURE__*/
    React.createElement("span", { key: factIdx, className: "animate-fadeUp" }, FUN[factIdx])), /*#__PURE__*/

    React.createElement("button", { className: "icon-btn hover:bg-slate-100", "aria-label": "Shuffle fun fact", title: "Shuffle fun fact", onClick: shuffleFact }, /*#__PURE__*/
    React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", className: "w-4 h-4", fill: "currentColor" }, /*#__PURE__*/React.createElement("path", { d: "M7 3v2h.59L5 8.59 6.41 10 10 6.41V7h2V3H7zm10 0h4v4h-2V6.41l-3.29 3.3-1.42-1.42L17.59 5H17V3zM3 13h4v-2H3v2zm6.71 3.29 1.42 1.42L5 23h2v-2h.59l3.3-3.29-1.18-1.42zM19 14h2v4h-4v-2h1.59l-3.29-3.29 1.42-1.42L19 14.59V14z" }))))),





    view === 'Profile' && /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement(Section, { title: "Profile", right: /*#__PURE__*/React.createElement("button", { className: "kbd", onClick: () => {localStorage.removeItem(ftWorkoutStore.key);location.reload();} }, "Reset") }, /*#__PURE__*/
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
    React.createElement("div", { className: "text-sm" }, "BMI: ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold" }, /*#__PURE__*/React.createElement(SmoothNumber, { value: bmi(W_kg, H_cm), format: "one" }))), /*#__PURE__*/

    React.createElement("div", { className: "text-sm mt-1" }, "Status: ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold " + bmiInfo(bmi(W_kg, H_cm)).color }, bmiInfo(bmi(W_kg, H_cm)).label)), /*#__PURE__*/

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






    React.createElement("div", { className: "mt-3 text-sm" }, "Estimated/Entered BF%: ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold" }, /*#__PURE__*/React.createElement(SmoothNumber, { value: BFpct, format: "one" }), "%")),


    (() => {
      const cap = s => typeof s === "string" ? s.replace(/\b\w/g, c => c.toUpperCase()) : s;
      const label = (() => {
        if (!Number.isFinite(BFpct)) return "—";
        if (sex === "male") {
          if (BFpct <= 5) return "essential";
          if (BFpct <= 13) return "athlete";
          if (BFpct <= 17) return "fitness";
          if (BFpct <= 24) return "average";
          return "obese";
        } else {
          if (BFpct <= 13) return "essential";
          if (BFpct <= 20) return "athlete";
          if (BFpct <= 24) return "fitness";
          if (BFpct <= 31) return "average";
          return "obese";
        }
      })();
      return /*#__PURE__*/(
        React.createElement("div", { className: "text-xs mt-1" }, "Status:",
        " ", /*#__PURE__*/
        React.createElement("span", { className: "font-semibold " + bfColorClass(sex, BFpct) }, cap(label))));


    })(), /*#__PURE__*/

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
    React.createElement("div", { className: "text-sm" }, /*#__PURE__*/React.createElement(SmoothNumber, { value: BMRmsj, format: "int" }), " kcal/day")), /*#__PURE__*/

    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1 flex items-center" }, "BMR ", /*#__PURE__*/React.createElement(Info, { abbr: "KM", tip: "Katch\u2013McArdle: estimates BMR from lean mass (needs body-fat %). Useful if you know body composition.", href: "https://www.acefitness.org/certifiednewsarticle/2882/resting-metabolic-rate-best-ways-to-measure-it-and-raise-it-too/" })), /*#__PURE__*/
    React.createElement("div", { className: "text-sm" }, /*#__PURE__*/React.createElement(SmoothNumber, { value: BMRkm, format: "int" }), " kcal/day")), /*#__PURE__*/

    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1 flex items-center" }, "TDEE ", /*#__PURE__*/React.createElement(Info, { abbr: "TDEE", tip: "Total Daily Energy Expenditure: calories you burn per day (BMR \xD7 activity).", href: "https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner" })), /*#__PURE__*/
    React.createElement("div", { className: "text-sm" }, /*#__PURE__*/React.createElement(SmoothNumber, { value: TDEE, format: "int" }), " kcal/day"))), /*#__PURE__*/




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
    React.createElement("div", { className: "mono text-base" }, /*#__PURE__*/React.createElement(SmoothNumber, { value: recommendCalories, format: "int" }), " kcal/day")))), /*#__PURE__*/




    React.createElement("div", { className: "text-xs text-slate-600 mt-2" },
    goalType === 'maintain' && 'Maintain within ±5% of TDEE and aim for 0.8–1.0 g protein per lb of body weight (≈1.8–2.2 g/kg).',
    (goalType === 'cut' || goalType === 'bulk') && 'Use this as a target. For meal ideas, tap "High Protein Meals" at the bottom.',
    projectedBMIRisky && /*#__PURE__*/
    React.createElement("div", { className: "text-rose-600 mt-1" }, "Note: This target may lead to a BMI outside the healthy range. Consider a less aggressive pace or keep it short term."))))),








    view === 'Unlock Potential' && /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement(Section, { title: "Unlock Potential", right: /*#__PURE__*/React.createElement(Social, null) }, /*#__PURE__*/

    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1 flex items-center" }, "FFMI",
    " ", /*#__PURE__*/
    React.createElement(Info, {
      abbr: "FFMI",
      tip: "Fat-Free Mass Index: lean mass divided by height squared (kg/m\xB2). Useful for describing muscularity.",
      href: CIT.ffmi_method_kouri })), /*#__PURE__*/


    React.createElement("div", { className: "text-sm" }, "FFMI: ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold" }, /*#__PURE__*/React.createElement(SmoothNumber, { value: FFMI, format: "one" }))), /*#__PURE__*/

    React.createElement("div", { className: "text-sm mt-1" }, "Approx. percentile:",
    " ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold " + percentileColor(ffmiPercentile(FFMI, sex)) },
    Number.isFinite(ffmiPercentile(FFMI, sex)) ? Math.round(ffmiPercentile(FFMI, sex)) : '—', "th")), /*#__PURE__*/


    React.createElement("div", { className: "text-[11px] text-slate-500 mt-1" }, "Percentiles estimated from population norms.",
    " ", /*#__PURE__*/
    React.createElement("a", {
      className: "underline",
      href: "https://www.sciencedirect.com/science/article/abs/pii/S1871403X11000068",
      target: "_blank",
      rel: "noreferrer" }, "Kim et\xA0al., 2011"), "."), /*#__PURE__*/




    React.createElement("p", { className: "text-xs text-slate-500 mt-1" }, "FFMI better differentiates muscularity than BMI in trained individuals.",
    " ", /*#__PURE__*/
    React.createElement("a", { className: "underline", href: CIT.bmi_misclass_athletes, target: "_blank", rel: "noreferrer" }, "research"), ".")), /*#__PURE__*/






    React.createElement("div", { className: "grid md:grid-cols-2 gap-3 mt-3" }, /*#__PURE__*/

    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1" }, "BMI Snapshot"), /*#__PURE__*/
    React.createElement("div", { className: "text-sm" }, "BMI: ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold" }, /*#__PURE__*/React.createElement(SmoothNumber, { value: bmi(W_kg, H_cm), format: "one" }))), /*#__PURE__*/

    React.createElement("div", { className: "text-xs mt-1" }, "Status:",
    " ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold " + bmiInfo(bmi(W_kg, H_cm)).color },
    bmiInfo(bmi(W_kg, H_cm)).label)), /*#__PURE__*/


    React.createElement("p", { className: "text-[11px] text-slate-500 mt-1" }, "BMI is a screening tool and can misclassify muscular athletes.",
    " ", /*#__PURE__*/
    React.createElement("a", { className: "underline", href: CIT.bmi_misclass_athletes, target: "_blank", rel: "noreferrer" }, "research"), ".")), /*#__PURE__*/






    React.createElement("div", { className: "p-3 rounded-xl border bg-white/60" }, /*#__PURE__*/
    React.createElement("div", { className: "font-medium mb-1" }, "Body Fat Snapshot"), /*#__PURE__*/
    React.createElement("div", { className: "text-sm" }, "BF%: ", /*#__PURE__*/
    React.createElement("span", { className: "font-semibold" }, /*#__PURE__*/React.createElement(SmoothNumber, { value: BFpct, format: "one" }), "%")),

    (() => {
      const cap = s => typeof s === "string" ? s.replace(/\b\w/g, c => c.toUpperCase()) : s;
      const label = (() => {
        if (!Number.isFinite(BFpct)) return "—";
        if (sex === "male") {
          if (BFpct <= 5) return "essential";
          if (BFpct <= 13) return "athlete";
          if (BFpct <= 17) return "fitness";
          if (BFpct <= 24) return "average";
          return "obese";
        } else {
          if (BFpct <= 13) return "essential";
          if (BFpct <= 20) return "athlete";
          if (BFpct <= 24) return "fitness";
          if (BFpct <= 31) return "average";
          return "obese";
        }
      })();
      return /*#__PURE__*/(
        React.createElement("div", { className: "text-xs mt-1" }, "Status:",
        " ", /*#__PURE__*/
        React.createElement("span", { className: "font-semibold " + bfColorClass(sex, BFpct) }, cap(label))));


    })())),




    (() => {var _rec$targets;
      const BMIval = bmi(W_kg, H_cm);
      const rec = recommendPhase({
        sex,
        BF: BFpct,
        FFMI,
        FFMIadj: ffmiAdjusted(FFMI, H_cm), // logic only
        BMIval,
        TDEE });


      return /*#__PURE__*/(
        React.createElement("div", { className: "mt-4 p-4 rounded-2xl border bg-gradient-to-b from-white to-slate-50" }, /*#__PURE__*/
        React.createElement("div", { className: "flex items-center justify-between mb-2" }, /*#__PURE__*/
        React.createElement("div", { className: "text-lg font-semibold" }, "Phase Recommendation"), /*#__PURE__*/
        React.createElement("div", { className: "text-xs text-slate-500" }, "Research-based; BF% \u2192 FFMI \u2192 BMI check")),


        !recReady ? /*#__PURE__*/
        React.createElement("div", { className: "animate-pulse space-y-3" }, /*#__PURE__*/
        React.createElement("div", { className: "h-4 bg-slate-200 rounded w-1/3" }), /*#__PURE__*/
        React.createElement("div", { className: "h-3 bg-slate-200 rounded w-5/6" }), /*#__PURE__*/
        React.createElement("div", { className: "h-3 bg-slate-200 rounded w-4/6" }), /*#__PURE__*/
        React.createElement("div", { className: "h-3 bg-slate-200 rounded w-3/6" })) : /*#__PURE__*/


        /* Ready content */
        React.createElement("div", { className: "space-y-2 animate-fadeUp" }, /*#__PURE__*/
        React.createElement("div", { className: "flex flex-wrap items-center gap-2" }, /*#__PURE__*/
        React.createElement("span", { key: rec.phase, className: "px-2 py-0.5 rounded-full text-xs border bg-white transition-all duration-300" },
        rec.phase ? rec.phase.toUpperCase() : '—'),


        (_rec$targets = rec.targets) !== null && _rec$targets !== void 0 && _rec$targets.length ? /*#__PURE__*/
        React.createElement("span", { className: "text-sm text-slate-700" }, "Targets:",

        rec.targets.map((t) => /*#__PURE__*/
        React.createElement("span", { key: t.sign + t.rateLb, className: "inline-block ml-2 px-2 py-0.5 rounded-full border bg-white" },
        t.sign, t.rateLb, " lb/wk \u2022 ", Math.round(t.kcal).toLocaleString(), " kcal/day"))) : /*#__PURE__*/




        React.createElement("span", { className: "text-sm text-slate-500" }, "Enter activity to show calorie targets")),




        rec.profileLine && /*#__PURE__*/
        React.createElement("div", { className: "mt-1 text-sm space-y-2" }, /*#__PURE__*/
        React.createElement("div", { className: "font-medium text-slate-700" }, "Because"),
        rec.profileLine),




        rec.research.length > 0 && /*#__PURE__*/
        React.createElement("div", { className: "mt-1 text-sm space-y-2" }, /*#__PURE__*/
        React.createElement("div", { className: "font-medium text-slate-700" }, "Recommended research"), /*#__PURE__*/
        React.createElement("ul", { className: "list-disc pl-5 space-y-1" },
        rec.research)),





        rec.notes.length > 0 && /*#__PURE__*/
        React.createElement("div", { className: "mt-1 text-sm space-y-1" }, /*#__PURE__*/
        React.createElement("div", { className: "font-medium text-slate-700" }, "Notes"),
        rec.notes))));






    })())),





    view === 'Workout Tracker' && /*#__PURE__*/React.createElement(Section, {
      id: toId('Workout Tracker'),
      title: 'Workout Tracker',
      right: /*#__PURE__*/React.createElement("div", { className: "flex gap-2" }, /*#__PURE__*/React.createElement("button", { onClick: handleExportJSON, className: "px-2 py-1 border rounded" }, "Export JSON"), /*#__PURE__*/React.createElement("button", { onClick: handleImportJSON, className: "px-2 py-1 border rounded" }, "Import JSON"), /*#__PURE__*/React.createElement("button", { onClick: handleExportCSV, className: "px-2 py-1 border rounded" }, "Export CSV"))
    }, /*#__PURE__*/React.createElement("div", { className: "subtabs mb-4", role: "tablist" }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setWtTab('wt-exercises'),
      className: (wtTab === 'wt-exercises' ? 'bg-slate-900 text-white ' : 'bg-white hover:bg-slate-50 ') + 'border rounded px-3 py-1 text-sm',
      "data-target": "wt-exercises",
      role: "tab",
      "aria-selected": wtTab === 'wt-exercises'
    }, "Exercises"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setWtTab('wt-programs'),
      className: (wtTab === 'wt-programs' ? 'bg-slate-900 text-white ' : 'bg-white hover:bg-slate-50 ') + 'border rounded px-3 py-1 text-sm',
      "data-target": "wt-programs",
      role: "tab",
      "aria-selected": wtTab === 'wt-programs'
    }, "Programs"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setWtTab('wt-log'),
      className: (wtTab === 'wt-log' ? 'bg-slate-900 text-white ' : 'bg-white hover:bg-slate-50 ') + 'border rounded px-3 py-1 text-sm',
      "data-target": "wt-log",
      role: "tab",
      "aria-selected": wtTab === 'wt-log'
      }, "Log \u0026 Progress")),
    /*#__PURE__*/React.createElement("div", {
      id: "wt-exercises",
      hidden: wtTab !== 'wt-exercises',
      className: "space-y-4"
    }, /*#__PURE__*/React.createElement("form", {
      className: "card p-4 space-y-2",
      onSubmit: handleAddExercise
    }, /*#__PURE__*/React.createElement("div", {
      className: "grid gap-2"
    }, /*#__PURE__*/React.createElement("input", {
      className: "field",
      placeholder: "Name",
      value: exName,
      onChange: e => setExName(e.target.value)
    }), /*#__PURE__*/React.createElement("input", {
      className: "field",
      placeholder: "Muscle groups (comma separated)",
      value: exMuscles,
      onChange: e => setExMuscles(e.target.value)
    }), /*#__PURE__*/React.createElement("select", {
      className: "field",
      value: exUnit,
      onChange: e => setExUnit(e.target.value)
    }, /*#__PURE__*/React.createElement("option", { value: "lb" }, "lb"), /*#__PURE__*/React.createElement("option", { value: "kg" }, "kg"), /*#__PURE__*/React.createElement("option", { value: "bodyweight" }, "bodyweight")), /*#__PURE__*/React.createElement("input", {
      className: "field",
      placeholder: "Tags (comma separated)",
      value: exTags,
      onChange: e => setExTags(e.target.value)
    }), /*#__PURE__*/React.createElement("textarea", {
      className: "field",
      placeholder: "Notes",
      rows: "2",
      value: exNotes,
      onChange: e => setExNotes(e.target.value)
    })), exErr && /*#__PURE__*/React.createElement("div", {
      className: "text-sm text-red-600"
    }, exErr), /*#__PURE__*/React.createElement("div", {
      className: "text-right"
    }, /*#__PURE__*/React.createElement("button", {
      type: "submit",
      className: "kbd"
    }, "Add Exercise"))), /*#__PURE__*/React.createElement("div", {
      className: "flex"
    }, /*#__PURE__*/React.createElement("input", {
      className: "field flex-1",
      placeholder: "Search",
      value: exSearch,
      onChange: e => setExSearch(e.target.value)
    })), /*#__PURE__*/React.createElement("div", {
      className: "card-grid"
    }, filteredExercises.map(ex => /*#__PURE__*/React.createElement("div", {
      key: ex.id,
      className: "card p-4 space-y-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-start justify-between"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "font-medium"
    }, ex.name), ex.muscleGroups.length > 0 && /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-slate-500"
    }, ex.muscleGroups.join(', '))), /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "icon-btn",
      title: "Delete",
      onClick: () => handleDeleteExercise(ex.id)
    }, "\u2715")), /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-slate-600"
    }, "Unit: ", ex.unit), ex.tags.length > 0 && /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-slate-500"
    }, "Tags: ", ex.tags.join(', ')), ex.notes && /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-slate-500 whitespace-pre-wrap"
    }, ex.notes))))
    ),
    /*#__PURE__*/React.createElement("div", {
      id: "wt-programs",
      hidden: wtTab !== 'wt-programs',
      className: "space-y-4"
    }, editingProgId ? renderProgramEditor() : renderProgramList()),
    /*#__PURE__*/React.createElement("div", {
      id: "wt-log",
      hidden: wtTab !== 'wt-log',
      className: "space-y-4"
    }, /*#__PURE__*/React.createElement("form", {
      onSubmit: handleLogSubmit,
      className: "card p-4 space-y-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2"
    }, /*#__PURE__*/React.createElement("input", {
      type: "date",
      className: "field",
      value: logDate,
      onChange: e => setLogDate(e.target.value)
    }), /*#__PURE__*/React.createElement("select", {
      className: "field",
      value: logProgram,
      onChange: e => setLogProgram(e.target.value)
    }, /*#__PURE__*/React.createElement("option", { value: "" }, "Program"), programs.map(p => /*#__PURE__*/React.createElement("option", { key: p.id, value: p.name }, p.name))), /*#__PURE__*/React.createElement("input", {
      className: "field w-16",
      placeholder: "Week",
      value: logWeek,
      onChange: e => setLogWeek(e.target.value)
    }), /*#__PURE__*/React.createElement("input", {
      className: "field w-16",
      placeholder: "Day",
      value: logDay,
      onChange: e => setLogDay(e.target.value)
    })), logEntries.map(row => /*#__PURE__*/React.createElement("div", {
      key: row.id,
      className: "flex gap-1 items-start"
    }, /*#__PURE__*/React.createElement("select", {
      className: "field flex-1",
      value: row.exercise,
      onChange: e => {
        const exName = e.target.value;
        const mg = exercises.find(ex => ex.name === exName)?.muscleGroups?.[0] || '';
        setLogEntries(rows => rows.map(r => r.id === row.id ? { ...r, exercise: exName, muscleGroup: mg } : r));
      }
    }, /*#__PURE__*/React.createElement("option", { value: "" }, "Exercise"), exercises.map(ex => /*#__PURE__*/React.createElement("option", { key: ex.id, value: ex.name }, ex.name))), /*#__PURE__*/React.createElement("select", {
      className: "field w-36",
      value: row.muscleGroup,
      onChange: e => updateLogRow(row.id, 'muscleGroup', e.target.value)
    }, /*#__PURE__*/React.createElement("option", { value: "" }, "Muscle"), muscleGroupOptions.map(mg => /*#__PURE__*/React.createElement("option", { key: mg, value: mg }, mg))), /*#__PURE__*/React.createElement("input", {
      className: "field w-20",
      placeholder: "Weight",
      value: row.weight,
      onChange: e => updateLogRow(row.id, 'weight', e.target.value)
    }), /*#__PURE__*/React.createElement("input", {
      className: "field w-16",
      placeholder: "Reps",
      value: row.reps,
      onChange: e => updateLogRow(row.id, 'reps', e.target.value)
    }), /*#__PURE__*/React.createElement("input", {
      className: "field w-16",
      placeholder: "RPE",
      value: row.rpe,
      onChange: e => updateLogRow(row.id, 'rpe', e.target.value)
    }), /*#__PURE__*/React.createElement("input", {
      className: "field flex-1",
      placeholder: "Notes",
      value: row.notes,
      onChange: e => updateLogRow(row.id, 'notes', e.target.value)
    }), /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "icon-btn",
      onClick: () => removeLogRow(row.id)
    }, "\u2715"))), /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between pt-2"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "px-2 py-1 border rounded text-xs",
      onClick: addLogRow
    }, "Add Row"), /*#__PURE__*/React.createElement("button", {
      type: "submit",
      className: "kbd"
    }, "Save Workout"))), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2"
    }, /*#__PURE__*/React.createElement("input", {
      className: "field flex-1",
      placeholder: "Search notes",
      value: logSearch,
      onChange: e => setLogSearch(e.target.value)
    }), /*#__PURE__*/React.createElement("select", {
      className: "field",
      value: logExFilter,
      onChange: e => setLogExFilter(e.target.value)
    }, /*#__PURE__*/React.createElement("option", { value: "" }, "All exercises"), exercises.map(ex => /*#__PURE__*/React.createElement("option", { key: ex.id, value: ex.name }, ex.name))), /*#__PURE__*/React.createElement("select", {
      className: "field",
      value: logMgFilter,
      onChange: e => setLogMgFilter(e.target.value)
    }, /*#__PURE__*/React.createElement("option", { value: "" }, "All muscle groups"), muscleGroupOptions.map(mg => /*#__PURE__*/React.createElement("option", { key: mg, value: mg }, mg)))), /*#__PURE__*/React.createElement("div", {
      className: "space-y-2"
    }, filteredWorkouts.map(w => /*#__PURE__*/React.createElement("div", {
      key: w.id,
      className: "card p-4 space-y-1"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-sm font-medium"
    }, w.date, w.program ? ` \u00b7 ${w.program}` : '', w.week && w.day ? ` \u00b7 W${w.week}D${w.day}` : ''), w.entries && w.entries.map(entry => (entry.sets || []).map((set, idx) => /*#__PURE__*/React.createElement("div", {
      key: entry.id + '-' + idx,
      className: "text-sm"
    }, `${entry.exercise}: ${set.weight}${set.unit} x ${set.reps}${set.rpe ? ' @RPE ' + set.rpe : ''}${Number.isFinite(set.e1rm) ? ' (e1RM ' + set.e1rm.toFixed(2) + ')' : ''}${set.notes ? ' - ' + set.notes : ''}`)))), filteredWorkouts.length === 0 && /*#__PURE__*/React.createElement("div", {
      className: "text-sm text-slate-500"
    }, "No workouts")))
    )),

    view === 'Info' && /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement(Section, { title: "Info", right: /*#__PURE__*/React.createElement("span", { className: "text-xs text-slate-500" }, "Quick references") }, /*#__PURE__*/
    React.createElement(InfoPanel, null))), /*#__PURE__*/





    React.createElement("div", { className: "text-center text-xs text-slate-500 space-y-2 mt-8 mb-8" }, /*#__PURE__*/
    React.createElement("div", null, /*#__PURE__*/
    React.createElement("a", { className: "underline", href: "https://meaningfulmacros.com", target: "_blank", rel: "noreferrer" }, "High Protein Meals")), /*#__PURE__*/

    React.createElement("div", null, "Built for clarity, not diagnosis. Always consult a professional for personalized advice."))));



}

/* =========================================================
   Self-tests (console)
========================================================= */
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

/* =========================================================
   Mount
========================================================= */
ReactDOM.createRoot(document.getElementById('root')).render( /*#__PURE__*/React.createElement(App, null));

