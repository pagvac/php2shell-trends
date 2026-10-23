/* php2shell://patch-race — interactive dashboard (ECharts, no build step).
   Reads data/timeseries.json (anonymized aggregate counts) and renders live charts.
   Terminal theme; palette validated with the dataviz skill's validator. */
(function () {
  "use strict";
  var FIX = new Date("2026-10-21T00:00:00Z");
  var css = getComputedStyle(document.documentElement);
  var V = function (n) { return css.getPropertyValue("--" + n).trim(); };
  var INK = V("ink"), MUTED = V("muted"), DIM = V("dim"), GRIDL = V("grid-line"),
      BORDER = V("border"), PANEL = V("panel"), NEON = V("neon");
  var STATUS = { ok: V("patched"), vulnerable: V("vuln"), eol: V("eol"), unknown: V("unknown") };
  // validated dark categorical hues (fixed order, never cycled); 8 then fold to "Other".
  var CAT = [V("s1"), V("s2"), V("s3"), V("s4"), V("s5"), V("s6"), V("s7"), V("s8")];
  var MONO = '"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace';

  function fmt(n) {
    if (n >= 1e6) return "~" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
    return String(Math.round(n));
  }
  function stot(s) { return (s.ok || 0) + (s.vulnerable || 0) + (s.eol || 0) + (s.unknown || 0); }

  var AXIS = {
    axisLine: { lineStyle: { color: BORDER } },
    axisTick: { show: false },
    axisLabel: { color: MUTED, fontFamily: MONO, fontSize: 11 },
    splitLine: { lineStyle: { color: GRIDL } }
  };
  var TT = {
    backgroundColor: PANEL, borderColor: BORDER, borderWidth: 1,
    textStyle: { color: INK, fontFamily: MONO, fontSize: 12 },
    axisPointer: { lineStyle: { color: DIM, type: "dashed" },
      crossStyle: { color: DIM }, label: { backgroundColor: "#0a0f0c", color: INK, fontFamily: MONO } }
  };
  var LEGEND = { textStyle: { color: INK, fontFamily: MONO, fontSize: 11 }, inactiveColor: DIM,
    icon: "roundRect", itemWidth: 12, itemHeight: 8 };

  function mk(id) {
    var c = echarts.init(document.getElementById(id), null, { renderer: "canvas" });
    window.addEventListener("resize", function () { c.resize(); });
    return c;
  }
  var pct = function (v) { return v + "%"; };

  function kpis(points) {
    var last = points[points.length - 1], first = points.length > 1 ? points[0] : null;
    var s = last.by_status, tot = stot(s) || 1, fix = (s.ok || 0) + (s.vulnerable || 0);
    var vel = "--";
    if (first) {
      var days = Math.max((new Date(last.date) - new Date(first.date)) / 864e5, 1e-9);
      var dv = ((s.ok || 0) - (first.by_status.ok || 0)) / days;
      if (dv > 0) vel = "+" + fmt(dv) + "/d";
    }
    var d = Math.max(0, Math.floor((new Date(last.date) - FIX) / 864e5));
    var tiles = [
      { n: (fix ? (100 * (s.ok || 0) / fix).toFixed(1) : "0") + "%", c: STATUS.ok,
        l: "patched", s: "of " + fmt(fix) + " fixable hosts" },
      { n: Math.round(100 * (s.vulnerable || 0) / tot) + "%", c: STATUS.vulnerable,
        l: "still vulnerable", s: "of all PHP hosts" },
      { n: Math.round(100 * (s.eol || 0) / tot) + "%", c: STATUS.eol,
        l: "end-of-life", s: fmt(s.eol || 0) + " hosts · unfixable" },
      { n: d + "d", c: NEON, l: "since fix", s: "velocity " + vel }
    ];
    document.getElementById("kpis").innerHTML = tiles.map(function (t) {
      return '<div class="kpi" style="--kc:' + t.c + '">' +
        '<div class="n" style="color:' + t.c + '">' + t.n + '</div>' +
        '<div class="l">' + t.l + '</div><div class="s">' + t.s + "</div></div>";
    }).join("");
  }

  function adoption(c, points) {
    var data = points.filter(function (p) {
      return ((p.by_status.ok || 0) + (p.by_status.vulnerable || 0)) > 0;
    }).map(function (p) {
      var fx = (p.by_status.ok || 0) + (p.by_status.vulnerable || 0);
      return [p.date, +(100 * (p.by_status.ok || 0) / fx).toFixed(2)];
    });
    c.setOption({
      backgroundColor: "transparent",
      grid: { left: 50, right: 16, top: 16, bottom: 66 },
      tooltip: Object.assign({ trigger: "axis", valueFormatter: pct }, TT),
      xAxis: Object.assign({ type: "time" }, AXIS, { splitLine: { show: false } }),
      yAxis: Object.assign({ type: "value", axisLabel: { formatter: "{value}%", color: MUTED, fontFamily: MONO, fontSize: 11 } }, AXIS, { axisLine: { show: false } }),
      dataZoom: [{ type: "slider", height: 18, bottom: 20, borderColor: BORDER,
        fillerColor: "rgba(57,255,133,.12)", handleStyle: { color: NEON },
        textStyle: { color: MUTED, fontFamily: MONO }, dataBackground: { lineStyle: { color: DIM } } },
        { type: "inside" }],
      series: [{
        type: "line", smooth: true, data: data, symbol: "circle", symbolSize: 6,
        lineStyle: { color: STATUS.ok, width: 2.5, shadowColor: STATUS.ok, shadowBlur: 10 },
        itemStyle: { color: STATUS.ok },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1,
          [{ offset: 0, color: "rgba(55,224,122,.28)" }, { offset: 1, color: "rgba(55,224,122,0)" }]) },
        markLine: { symbol: "none", silent: true,
          data: [{ xAxis: FIX.toISOString(),
            label: { formatter: "fix", color: MUTED, fontFamily: MONO, position: "insideEndTop" } }],
          lineStyle: { color: DIM, type: "dashed" } }
      }]
    });
  }

  function exposure(c, points) {
    var keys = [["ok", "patched"], ["vulnerable", "vulnerable"], ["eol", "EOL"], ["unknown", "unknown"]];
    c.setOption({
      backgroundColor: "transparent",
      grid: { left: 44, right: 14, top: 32, bottom: 38 },
      legend: Object.assign({ top: 2 }, LEGEND),
      tooltip: Object.assign({ trigger: "axis", valueFormatter: pct }, TT),
      xAxis: Object.assign({ type: "time" }, AXIS, { splitLine: { show: false } }),
      yAxis: Object.assign({ type: "value", max: 100, axisLabel: { formatter: "{value}%", color: MUTED, fontFamily: MONO, fontSize: 11 } }, AXIS, { axisLine: { show: false } }),
      series: keys.map(function (k) {
        return { name: k[1], type: "line", stack: "s", symbol: "none",
          lineStyle: { width: 0 }, areaStyle: { opacity: 0.82 }, color: STATUS[k[0]],
          emphasis: { focus: "series" },
          data: points.map(function (p) {
            var t = stot(p.by_status) || 1;
            return [p.date, +(100 * (p.by_status[k[0]] || 0) / t).toFixed(2)];
          }) };
      })
    });
  }

  function branches(c, points) {
    var last = points[points.length - 1].by_branch || {};
    var ordered = Object.keys(last).sort(function (a, b) { return (last[b] || 0) - (last[a] || 0); });
    var top = ordered.slice(0, 7), rest = ordered.slice(7);           // fixed order; fold the rest
    var names = top.concat(rest.length ? ["other"] : []);
    var series = names.map(function (name, i) {
      var isOther = name === "other";
      return {
        name: name, type: "line", symbol: "none", smooth: true,
        lineStyle: { width: 2, color: isOther ? V("dim") : CAT[i % CAT.length] },
        color: isOther ? V("dim") : CAT[i % CAT.length], emphasis: { focus: "series" },
        data: points.map(function (p) {
          var bb = p.by_branch || {}, t = 0;
          Object.keys(bb).forEach(function (k) { t += bb[k]; });
          var v = isOther ? rest.reduce(function (a, k) { return a + (bb[k] || 0); }, 0) : (bb[name] || 0);
          return [p.date, +(100 * v / (t || 1)).toFixed(2)];
        })
      };
    });
    c.setOption({
      backgroundColor: "transparent",
      grid: { left: 44, right: 14, top: 32, bottom: 38 },
      legend: Object.assign({ top: 2, type: "scroll" }, LEGEND),
      tooltip: Object.assign({ trigger: "axis", valueFormatter: pct }, TT),
      xAxis: Object.assign({ type: "time" }, AXIS, { splitLine: { show: false } }),
      yAxis: Object.assign({ type: "value", axisLabel: { formatter: "{value}%", color: MUTED, fontFamily: MONO, fontSize: 11 } }, AXIS, { axisLine: { show: false } }),
      series: series
    });
  }

  fetch("data/timeseries.json", { cache: "no-store" }).then(function (r) { return r.json(); })
    .then(function (ts) {
      var points = ts.points || [];
      var u = document.getElementById("updated");
      if (!points.length) { u.textContent = "no data yet"; return; }
      u.textContent = points[points.length - 1].date;
      kpis(points);
      adoption(mk("adoption"), points);
      exposure(mk("exposure"), points);
      branches(mk("branches"), points);
    })
    .catch(function (e) { document.getElementById("updated").textContent = "load error"; console.error(e); });
})();
