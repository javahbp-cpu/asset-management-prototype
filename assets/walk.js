/* ==========================================================================
   白泽零信任 · 资产管理原型 · 场景走查条
   --------------------------------------------------------------------------
   由 URL 上的 ?flow=<流程号>&step=<幕号> 驱动，在页面右下角渲染逐幕导航：
   「上一幕 / 下一幕」+ 进度点 + 「≡ 场景走查」返回链接，体例对齐
   《原型-无端网关-20260917/assets/proto.js》的 .flow-nav。

   挂载方式（两条，都不改任何页面结构）：
     · 产品页（28 个）—— app 末模块 assets/js/90-tail.js 的挂载器检测到 flow 参数时动态注入本文件；
     · 关键业务说明页（FL1~FL3）—— 页内静态引入 ../assets/walk.js。
   本文件不含流程数据：按资源根前缀按需加载 assets/flows.js 后渲染。

   ⚠ 无 flow 参数时本文件立即返回，对常规访问零影响。
   ========================================================================== */
(function () {
  "use strict";

  var mf = /[?&]flow=([^&]+)/.exec(location.search);
  if (!mf) return;
  var FID = decodeURIComponent(mf[1]);
  var ms = /[?&]step=(\d+)/.exec(location.search);
  var WANT = Math.max(1, parseInt(ms ? ms[1] : "1", 10) || 1);

  /* 资源根前缀：场景走查页与产品页同级；关键业务说明页在其下一级 */
  var ROOT = /\/关键业务说明\//.test(decodeURIComponent(location.pathname)) ? "../" : "";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");  /* 双引号：esc 返回值会写进 title="…" 属性 */
  }

  function render() {
    if (document.querySelector(".flow-nav")) return;  /* 幂等：同页只挂一条 */
    var flows = window.BZ_AM_FLOWS;
    if (!flows || !flows.length) return;

    var flow = null;
    for (var i = 0; i < flows.length; i++) {
      if (flows[i].id === FID) { flow = flows[i]; break; }
    }
    if (!flow || !flow.steps || !flow.steps.length) return;

    var n = flow.steps.length;
    var idx = Math.min(n - 1, WANT - 1);

    /* 同页判定：目标幕与「当前地址」同文件且同参数时，页面内容不会变。
       ⚠ 只看文件名不够 —— F4 的 5 幕同为 asset-detail.html 但 tab 各异，页面是会变的。
       命中哪些流程由流程定义实算（见场景走查页图例），此处不另列清单，避免两处说法不一。 */
    function hrefOf(k) {
      return flow.steps[k].href.split("/").pop();
    }
    var HERE = (function () {
      var p = decodeURIComponent(location.pathname.split("/").pop());
      var s = decodeURIComponent((location.search || "").replace(/^\?/, ""))
        .split("&").filter(function (kv) {
          return kv && kv.indexOf("flow=") !== 0 && kv.indexOf("step=") !== 0;
        }).join("&");
      return p + (s ? "?" + s : "");
    })();
    function sameAsHere(k) { return hrefOf(k) === HERE; }
    var sameAsPrev = idx > 0 && hrefOf(idx - 1) === hrefOf(idx);

    /* 目标 URL = 幕自身的深链 + flow/step 参数（保留原参数，供分享与续走） */
    function href(k) {
      var h = flow.steps[k].href;
      return ROOT + h + (h.indexOf("?") >= 0 ? "&" : "?") +
        "flow=" + encodeURIComponent(FID) + "&step=" + (k + 1);
    }

    var dots = flow.steps.map(function (s, k) {
      return '<a class="fdot' + (k === idx ? " on" : "") + '"' +
        (k === idx ? ' aria-current="step"' : "") +
        ' href="' + href(k) + '" title="' + (k + 1) + " · " + esc(s.t) + '">' +
        (k + 1) + "</a>";
    }).join("");

    var prev = idx > 0
      ? '<a class="fb" href="' + href(idx - 1) + '">&larr; 上一幕' +
        (sameAsHere(idx - 1) ? '（同页）' : '') + '</a>'
      : '<span class="fb off">&larr; 上一幕</span>';
    var next = idx < n - 1
      ? '<a class="fb go" href="' + href(idx + 1) + '">下一幕' +
        (sameAsHere(idx + 1) ? '（同页）' : '') + ' &rarr;</a>'
      : '<span class="fb off">已是最后一幕</span>';

    var nav = document.createElement("div");
    nav.className = "flow-nav";
    nav.setAttribute("role", "navigation");
    nav.setAttribute("aria-label", "场景走查逐幕导航");
    nav.innerHTML =
      '<div class="frow">' +
        '<span class="fid">' + esc(flow.id) + '</span>' +
        '<span class="fname">' + esc(flow.name) + '</span>' +
        '<span class="fcount">' + (idx + 1) + " / " + n + '</span>' +
        '<a class="fq" href="' + ROOT + '场景走查.html">&equiv; 场景走查</a>' +
      '</div>' +
      '<div class="fbody"><b>' + esc(flow.steps[idx].t) + '</b>' +
        '<span>' + esc(flow.steps[idx].d) + '</span>' +
        (sameAsPrev
          ? '<span class="fsame">本幕与上一幕目标相同（同页同参数）· 页面内容不变，请按上方说明在页内观察</span>'
          : '') + '</div>' +
      '<div class="frow fctl">' + prev +
        '<span class="dots">' + dots + '</span>' + next + '</div>';

    document.body.appendChild(nav);
    document.body.classList.add("has-flow-nav");
  }

  if (window.BZ_AM_FLOWS) { render(); return; }
  var s = document.createElement("script");
  s.src = ROOT + "assets/flows.js";
  s.onload = render;
  s.onerror = function () { /* 数据取不到就不挂条，不打扰浏览 */ };
  document.head.appendChild(s);
})();
