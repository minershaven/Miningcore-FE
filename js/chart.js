/* Tiny dependency-free SVG line/area chart with hover tooltip */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const charts = new Set();

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  /**
   * opts: { series: [{name, color, values:[{t:Date, v:Number}], area:true, axis:'left'|'right'}], format: v=>str, formatRight, timeFormat }
   */
  function lineChart(el, opts) {
    el.classList.add("chart");
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.hidden = true;

    function draw() {
      if (!el.isConnected) { charts.delete(draw); return; }
      const W = el.clientWidth || 600, Hh = el.clientHeight || 240;
      const pad = { l: 64, r: opts.series.some((s) => s.axis === "right") ? 56 : 12, t: 10, b: 26 };
      const iw = W - pad.l - pad.r, ih = Hh - pad.t - pad.b;
      const all = opts.series.flatMap((s) => s.values);
      if (!all.length) { el.innerHTML = '<div class="empty">No data yet</div>'; return; }
      const t0 = Math.min(...all.map((d) => +d.t)), t1 = Math.max(...all.map((d) => +d.t));
      const maxL = niceMax(Math.max(0, ...opts.series.filter((s) => s.axis !== "right").flatMap((s) => s.values.map((d) => d.v))) * 1.08);
      const maxR = niceMax(Math.max(0, ...opts.series.filter((s) => s.axis === "right").flatMap((s) => s.values.map((d) => d.v))) * 1.08);
      const x = (t) => pad.l + (t1 === t0 ? iw / 2 : ((+t - t0) / (t1 - t0)) * iw);
      const y = (v, right) => pad.t + ih - (v / (right ? maxR : maxL)) * ih;

      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", `0 0 ${W} ${Hh}`);
      let html = `<defs>${opts.series.map((s, i) => `<linearGradient id="g${i}${el.dataset.cid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".28"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`).join("")}</defs>`;
      html += '<g class="grid">';
      for (let k = 0; k <= 4; k++) {
        const yy = pad.t + (ih * k) / 4;
        html += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/>`;
      }
      html += '</g><g class="axis">';
      for (let k = 0; k <= 4; k++) {
        const yy = pad.t + (ih * k) / 4;
        html += `<text x="${pad.l - 10}" y="${yy + 4}" text-anchor="end">${(opts.format || String)(maxL * (1 - k / 4))}</text>`;
        if (pad.r > 20) html += `<text x="${W - pad.r + 8}" y="${yy + 4}">${(opts.formatRight || String)(maxR * (1 - k / 4))}</text>`;
      }
      const ticks = Math.max(2, Math.min(7, Math.floor(iw / 90)));
      const span = t1 - t0;
      for (let k = 0; k <= ticks; k++) {
        const t = t0 + (span * k) / ticks;
        const d = new Date(t);
        const label = span > 3 * 86400e3 ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        html += `<text x="${x(t)}" y="${Hh - 6}" text-anchor="${k === 0 ? "start" : k === ticks ? "end" : "middle"}">${label}</text>`;
      }
      html += "</g>";
      opts.series.forEach((s, i) => {
        const vals = s.values.slice().sort((a, b) => a.t - b.t);
        if (!vals.length) return;
        const r = s.axis === "right";
        const pts = vals.map((d) => `${x(d.t).toFixed(1)},${y(d.v, r).toFixed(1)}`);
        if (s.area !== false) html += `<path class="area" fill="url(#g${i}${el.dataset.cid})" d="M${pts[0].split(",")[0]},${pad.t + ih} L${pts.join(" L")} L${pts[pts.length - 1].split(",")[0]},${pad.t + ih} Z"/>`;
        html += `<path class="line" stroke="${s.color}" ${s.dash ? 'stroke-dasharray="4 4"' : ""} d="M${pts.join(" L")}"/>`;
      });
      html += `<line class="cursor" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" visibility="hidden"/>`;
      html += opts.series.map((s, i) => `<circle class="pt" data-i="${i}" r="4" fill="${s.color}" stroke="#050505" stroke-width="2" visibility="hidden"/>`).join("");
      html += `<rect x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="transparent" class="hit"/>`;
      svg.innerHTML = html;
      el.innerHTML = "";
      el.appendChild(svg);
      el.appendChild(tip);

      const hit = svg.querySelector(".hit"), cursor = svg.querySelector(".cursor");
      const move = (ev) => {
        const rect = svg.getBoundingClientRect();
        const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left) * (W / rect.width);
        const t = t0 + ((px - pad.l) / iw) * (t1 - t0);
        let rows = "", cx = null, minY = Infinity;
        opts.series.forEach((s, i) => {
          if (!s.values.length) return;
          const d = s.values.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
          const c = svg.querySelector(`.pt[data-i="${i}"]`);
          const yy = y(d.v, s.axis === "right");
          cx = x(d.t);
          minY = Math.min(minY, yy);
          c.setAttribute("cx", cx); c.setAttribute("cy", yy); c.setAttribute("visibility", "visible");
          rows += `<div class="r"><i style="background:${s.color}"></i>${s.name}: <b>${(s.axis === "right" ? opts.formatRight : opts.format || String)(d.v)}</b></div>`;
          if (i === 0) tip.dataset.t = new Date(d.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        });
        cursor.setAttribute("x1", cx); cursor.setAttribute("x2", cx); cursor.setAttribute("visibility", "visible");
        tip.innerHTML = `<div class="t">${tip.dataset.t}</div>${rows}`;
        tip.hidden = false;
        const left = Math.min(Math.max((cx / W) * rect.width, 80), rect.width - 80);
        tip.style.left = left + "px";
        tip.style.top = Math.max(40, (minY / Hh) * rect.height) + "px";
      };
      const leave = () => {
        tip.hidden = true;
        cursor.setAttribute("visibility", "hidden");
        svg.querySelectorAll(".pt").forEach((c) => c.setAttribute("visibility", "hidden"));
      };
      hit.addEventListener("mousemove", move);
      hit.addEventListener("touchmove", move, { passive: true });
      hit.addEventListener("mouseleave", leave);
      hit.addEventListener("touchend", leave);
    }
    el.dataset.cid = Math.random().toString(36).slice(2, 7);
    draw();
    charts.add(draw);
  }

  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => charts.forEach((d) => d()), 150);
  });

  window.Charts = { lineChart };
})();
