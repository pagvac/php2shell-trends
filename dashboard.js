/* The PHP2Shell patch race — interactive dashboard (ECharts, no build step).
   Reads data/timeseries.json (anonymized aggregate counts) and renders live charts. */
(function () {
  "use strict";
  var FIX = new Date("2026-10-21T00:00:00Z");
  var css = getComputedStyle(document.documentElement);
  var C = function (n) { return css.getPropertyValue("--" + n).trim(); };
  var INK = C("ink"), MUTED = C("muted"), GRID = C("grid"), BORDER = C("border");
  var COL = { ok: C("patched"), vulnerable: C("vuln"), eol: C("eol"), unknown: C("unknown") };
  var BRANCH_PALETTE = ["#1a9850", "#2a9d8f", "#2980b9", "#6a51a3", "#d6a414",
                        "#e8702a", "#d9433b", "#8a8f98", "#5b6370", "#a05195",
                        "#4d908e", "#bc5090"];

  function fmt(n) {
    if (n >= 1e6) return "~" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
    return String(Math.round(n));
  }
  function statusTotal(s) { return (s.ok || 0) + (s.vulnerable || 0) + (s.eol || 0) + (s.unknown || 0); }

  function baseAxis() {
    return {
      axisLine: { lineStyle: { color: BORDER } },
      axisLabel: { color: MUTED },
      axisTick: { show: false }
    };
  }
  function mkChart(id) {
    var c = echarts.init(document.getElementById(id), null, { renderer: "canvas" });
    window.addEventListener("resize", function () { c.resize(); });
    return c;
  }
  var tooltipBG = C("card"), tooltip = {
    backgroundColor: tooltipBG, borderColor: BORDER, textStyle: { color: INK }
  };

  function renderKPIs(points) {
    var last = points[points.length - 1], prev = points.length > 1 ? points[0] : null;
    var s = last.by_status, tot = statusTotal(s) || 1;
    var patchable = (s.ok || 0) + (s.vulnerable || 0);
    var pctFix = patchable ? 100 * (s.ok || 0) / patchable : 0;
    var pctVuln = 100 * (s.vulnerable || 0) / tot;
    var pctEol = 100 * (s.eol || 0) / tot;
    var days = Math.max(0, Math.floor((new Date(last.date) - FIX) / 86400000));
    var vel = "—";
    if (prev) {
      var spanD = Math.max((new Date(last.date) - new Date(prev.date)) / 86400000, 1e-9);
      var dv = ((s.ok || 0) - (prev.by_status.ok || 0)) / spanD;
      if (dv > 0) vel = "+" + fmt(dv) + "/day";
    }
    var tiles = [
      { n: pctFix.toFixed(1) + "%", l: "patched", s: "of " + fmt(patchable) + " fixable hosts", c: COL.ok },
      { n: Math.round(pctVuln) + "%", l: "still vulnerable", s: "of all PHP hosts", c: COL.vulnerable },
      { n: Math.round(pctEol) + "%", l: "end-of-life", s: fmt(s.eol || 0) + " hosts — unfixable", c: COL.eol },
      { n: days + "d", l: "since fix", s: "patch velocity " + vel, c: MUTED }
    ];
    document.getElementById("kpis").innerHTML = tiles.map(function (t) {
      return '<div class="kpi" style="border-left-color:' + t.c + '">' +
        '<div class="n">' + t.n + '</div><div class="l">' + t.l + '</div>' +
        '<div class="s">' + t.s + "</div></div>";
    }).join("");
  }

  function renderAdoption(c, points) {
    var data = points.filter(function (p) {
      return ((p.by_status.ok || 0) + (p.by_status.vulnerable || 0)) > 0;
    }).map(function (p) {
      var pa = (p.by_status.ok || 0) + (p.by_status.vulnerable || 0);
      return [p.date, +(100 * (p.by_status.ok || 0) / pa).toFixed(2)];
    });
    c.setOption({
      grid: { left: 52, right: 18, top: 16, bottom: 64 },
      tooltip: Object.assign({ trigger: "axis", valueFormatter: function (v) { return v + "%"; } }, tooltip),
      xAxis: Object.assign({ type: "time" }, baseAxis()),
      yAxis: Object.assign({ type: "value", axisLabel: { formatter: "{value}%", color: MUTED },
        splitLine: { lineStyle: { color: GRID } } }, { axisLine: { show: false }, axisTick: { show: false } }),
      dataZoom: [{ type: "slider", height: 20, bottom: 18, borderColor: BORDER,
        textStyle: { color: MUTED } }, { type: "inside" }],
      series: [{
        type: "line", smooth: true, data: data, symbol: "circle", symbolSize: 6,
        lineStyle: { color: COL.ok, width: 2.5 }, itemStyle: { color: COL.ok },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1,
          [{ offset: 0, color: COL.ok + "55" }, { offset: 1, color: COL.ok + "00" }]) },
        markLine: { symbol: "none", silent: true,
          data: [{ xAxis: FIX.toISOString(), label: { formatter: "fix released", color: MUTED, position: "insideEndTop" } }],
          lineStyle: { color: MUTED, type: "dashed" } }
      }]
    });
  }

  function renderExposure(c, points) {
    var keys = [["ok", "patched"], ["vulnerable", "vulnerable"], ["eol", "EOL"], ["unknown", "unknown"]];
    var series = keys.map(function (k) {
      return {
        name: k[1], type: "line", stack: "share", symbol: "none", smooth: false,
        lineStyle: { width: 0 }, areaStyle: { opacity: 0.85 }, color: COL[k[0]],
        data: points.map(function (p) {
          var t = statusTotal(p.by_status) || 1;
          return [p.date, +(100 * (p.by_status[k[0]] || 0) / t).toFixed(2)];
        })
      };
    });
    c.setOption({
      grid: { left: 46, right: 16, top: 34, bottom: 40 },
      legend: { top: 2, textStyle: { color: INK }, icon: "roundRect" },
      tooltip: Object.assign({ trigger: "axis", valueFormatter: function (v) { return v + "%"; } }, tooltip),
      xAxis: Object.assign({ type: "time" }, baseAxis()),
      yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%", color: MUTED },
        splitLine: { lineStyle: { color: GRID } }, axisLine: { show: false }, axisTick: { show: false } },
      series: series
    });
  }

  function renderBranches(c, points) {
    var set = {};
    points.forEach(function (p) { Object.keys(p.by_branch || {}).forEach(function (b) { set[b] = 1; }); });
    var branches = Object.keys(set).sort().reverse();
    var series = branches.map(function (b, i) {
      return {
        name: b, type: "line", symbol: "none", smooth: true, lineStyle: { width: 2 },
        color: BRANCH_PALETTE[i % BRANCH_PALETTE.length],
        data: points.map(function (p) {
          var bb = p.by_branch || {}, t = 0;
          Object.keys(bb).forEach(function (k) { t += bb[k]; });
          return [p.date, +(100 * (bb[b] || 0) / (t || 1)).toFixed(2)];
        })
      };
    });
    c.setOption({
      grid: { left: 46, right: 16, top: 34, bottom: 40 },
      legend: { top: 2, textStyle: { color: INK }, type: "scroll" },
      tooltip: Object.assign({ trigger: "axis", valueFormatter: function (v) { return v + "%"; } }, tooltip),
      xAxis: Object.assign({ type: "time" }, baseAxis()),
      yAxis: { type: "value", axisLabel: { formatter: "{value}%", color: MUTED },
        splitLine: { lineStyle: { color: GRID } }, axisLine: { show: false }, axisTick: { show: false } },
      series: series
    });
  }

  fetch("data/timeseries.json", { cache: "no-store" }).then(function (r) { return r.json(); })
    .then(function (ts) {
      var points = ts.points || [];
      if (!points.length) { document.getElementById("updated").textContent = "no data yet"; return; }
      document.getElementById("updated").textContent =
        "data through " + points[points.length - 1].date;
      renderKPIs(points);
      renderAdoption(mkChart("adoption"), points);
      renderExposure(mkChart("exposure"), points);
      renderBranches(mkChart("branches"), points);
    })
    .catch(function (e) {
      document.getElementById("updated").textContent = "failed to load data";
      console.error(e);
    });
})();
