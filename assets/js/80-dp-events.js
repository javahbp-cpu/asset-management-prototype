/* ==========================================================================
   事件委派（click + change）· 本模块动作一律 dp 前缀，不与既有模块冲突
   ========================================================================== */
/* 一级页签内的二级页签（内容板块细分）。
   ⚠ 只读 DP.sub、不写状态 —— 同一批 .tbp 会在**同一次渲染**里先后求值（与 dpBaseBHtml 同一条纪律），
     任何一方写状态都会把另一方刚渲染的结果复位。
   items = [[面板 id, 标签, HTML], ...]；owner = 一级面板 id（如 dpA2）；def = 默认二级面板 id。 */
function dpSubTabs(owner, items, def, foot) {
  const want = DP.sub && DP.sub[owner];
  const cur = items.some(x => x[0] === want) ? want : (def || (items[0] && items[0][0]));
  /* ★ A4-U1：ARIA Tabs 模式 —— 按钮 role="tab" + aria-selected + aria-controls，面板 role="tabpanel" + aria-labelledby。
     （容器此前只有 role="tablist"，列表内没有可识别的 tab 项，也没有「当前选中」信息。）
     ★ A4-I1：foot 渲染在**二级面板之外**（一级面板底部）⇒ 任一二级页签下都能看到下发入口与下发状态。 */
  return `<div class="subtabs" id="` + owner + `Sub" role="tablist">`
    + items.map(x => `<button type="button" role="tab" data-st="` + x[0] + `" id="` + owner + `Sub_` + x[0] + `" aria-controls="` + x[0] + `" aria-selected="` + (cur === x[0] ? "true" : "false") + `" class="` + (cur === x[0] ? "on" : "") + `">` + x[1] + `</button>`).join("")
    + `</div>`
    + items.map(x => `<div class="tbp2` + (cur === x[0] ? " on" : "") + `" id="` + x[0] + `" role="tabpanel" aria-labelledby="` + owner + `Sub_` + x[0] + `">` + x[2] + `</div>`).join("")
    + (foot || "");
}
/* 二级页签切换：只作用于本二级容器所在的父节点，不触碰一级 .tbp */
function showSubTab(navId, which) {
  const nav = document.getElementById(navId);
  if (!nav) return;
  const box = nav.parentNode;
  box.querySelectorAll(".tbp2").forEach(p => p.classList.remove("on"));
  const panel = document.getElementById(which);
  if (panel) panel.classList.add("on");
  nav.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.st === which));
}

function dpMount(pg) {
  /* 页签切换不在此绑定：改为全局 click 委派（见下方 DP 页签分支）。
     原因：本模块每次交互都会重建页面 DOM，容器级绑定会随重建失效，而 _dpMounted 守卫
     又阻止重新绑定 —— 表现为「配置操作一次之后页签点不动」。委派不受重渲染影响。 */
  return pg;
}

/* 配置下发状态（单一来源 = 数据）：
   待下发 = 有改动未提交（cfg.dirty）· 下发中 = 已提交、全节点收敛中（页面级瞬态）· 已生效 */
let dpShipping = false;
function dpShipHtml(cfg, path) {
  if (dpShipping) return '配置下发：<span class="tag t-warn">下发中</span>（全节点收敛中 · ≤2s · 不触发 reload）';
  /* dirty 可为布尔（对象级配置）或按路径映射（对抗能力五页签各自独立下发状态） */
  const d = cfg && cfg.dirty;
  const dirty = (d && typeof d === "object")
    ? (Array.isArray(path) ? path.some(p => !!d[p]) : (path ? !!d[path] : Object.keys(d).some(k => !!d[k])))
    : !!d;
  return dirty
    ? '配置下发：<span class="tag t-warn">待下发</span>（改动已入队 · 点「保存并下发」后热生效 ≤2s）'
    : '配置下发：<span class="tag t-ok">已生效</span>（全节点收敛 · 不触发 reload）';
}
/* 提交下发：进入收敛态 → 收敛完成回到数据态（状态只由数据与瞬态标记决定，不再各自改写 DOM） */
function dpShip() {
  /* getElementById 判「存在」是恒真的（两页常驻 DOM）⇒ 原先每次都把两页全量重建各 2 次。
     「下发中 / 已生效」徽标由 dpShipHtml 读 dpShipping + cfg.dirty 派生，隐藏页进入时会重渲染，
     故只重建**当前激活页**即可（收敛态切换不再付两次整页重建）。 */
  const shipPage = () => {
    const cur = document.querySelector(".pg.on");
    const id = cur ? cur.id : "";
    if (id === "pg-dppol") renderDpPolicy();
    else if (id === "pg-dparms") renderDpArms();
  };
  dpShipping = true;
  shipPage();
  setTimeout(() => { dpShipping = false; shipPage(); }, 1200);
}

/* 读取档位编辑区 → 校验：连续、不重叠、闭合 0~100（断言 ③）；返回 {bands, err, errIdx} */
function dpReadBands() {
  const bands = [];
  const n = document.querySelectorAll('input[data-band][data-f="lo"]').length;
  for (let i = 0; i < n; i++) {
    const lo = document.querySelector(`input[data-band="${i}"][data-f="lo"]`);
    const hi = document.querySelector(`input[data-band="${i}"][data-f="hi"]`);
    const act = document.querySelector(`select[data-band="${i}"][data-f="act"]`);
    if (!lo || !hi || !act) return null;
    bands.push({ lo: parseInt(lo.value, 10), hi: parseInt(hi.value, 10), act: act.value, preAct: act.getAttribute("data-pre-act") || "" });
  }
  /* 前置动作属**最高档**的固化语义：读取后归一到末段，避免增删段后悬留在中间段。 */
  const hasPre = bands.some(b => b.preAct === "ADD_AUTH");
  bands.forEach((b, i) => { if (i === bands.length - 1 && hasPre) b.preAct = "ADD_AUTH"; else delete b.preAct; });
  return bands;
}
function dpBandsOk(bands) {
  if (!bands || bands.length < 2) return { err: "档位段数异常（至少 2 段）", idx: -1 };
  /* ★ 先查空值/型：清空输入框时 lo 为 NaN，旧序会把「清空」误报成「首个区间必须从 0 分起」 */
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (!(Number.isFinite(b.lo) && Number.isFinite(b.hi))) return { err: `第 ${i + 1} 段区间存在空值或非数字`, idx: i };
    if (b.lo > b.hi) return { err: `第 ${i + 1} 段下限大于上限`, idx: i };
    /* 评分段只承载观察 / 挑战 / 拒绝：限流熔断由连续失败联动触发，按评分段直接选它是错配
       （兜底校验，同时防旧缓存带进来 —— 下拉本身已不提供该选项） */
    if (DP_BAND_ACTS.map(a => a.k).indexOf(b.act) < 0) {
      return { err: `第 ${i + 1} 段的处置档位须为观察记录 / 动态挑战 / 拒绝访问 —— 限流熔断由连续失败联动触发，不是评分档位`, idx: i };
    }
    /* 前置动作（preAct）取值域仅「追加认证」，且只允许出现在**最高档**（指南 §6.2 P4 两段式）。 */
    if (b.preAct && b.preAct !== "ADD_AUTH") return { err: `第 ${i + 1} 段的前置动作取值非法（仅「追加认证」可用）`, idx: i };
    if (b.preAct && i !== bands.length - 1) return { err: `前置动作只允许出现在最高档（第 ${bands.length} 段）`, idx: i };
  }
  if (bands[0].lo !== 0) return { err: "首个区间必须从 0 分起", idx: 0 };
  if (bands[bands.length - 1].hi !== 100) return { err: "末个区间必须闭合到 100 分", idx: bands.length - 1 };
  for (let i = 1; i < bands.length; i++) {
    const prevHi = bands[i - 1].hi, lo = bands[i].lo;
    if (lo !== prevHi + 1) {
      return lo <= prevHi
        ? { err: `第 ${i + 1} 段与第 ${i} 段区间重叠（前段上限 ${prevHi} · 本段下限 ${lo}）`, idx: i }
        : { err: `第 ${i} 段与第 ${i + 1} 段不连续（${prevHi} ~ ${lo}）`, idx: i };
    }
  }
  return { err: null, idx: -1 };
}

/* 保存当前防护对象（资产）配置的统一入口：克隆生效配置 → 变更 → 写回 → 留痕
   opt：不传 = 对象级整体「待下发」；{path:"det|grade|ex|main"} = 只置该模块待下发；
        true 或 {ship:true, path} = 保存并下发，清「该模块」待下发位（位清空则整体归 false）。
   —— 为什么要按模块分流：检测项参数 / 档位 / 豁免 / 对象主开关 原先共用**同一个**
     对象级布尔位，任一处改动都会点亮别处的下发徽标（跨模块串味）；而 ④ 自身没有下发入口，
     其改动产生的「待下发」永不消解。dpShipHtml 本就支持按路径取值，此处把对象级也升级为映射。 */
function dpMutateCurCfg(mut, logAct, opt) {
  const cur = dpCurObj();
  if (!cur) return null;
  const cfg = JSON.parse(JSON.stringify(cur.cfg));
  mut(cfg);
  const o = (opt === true) ? { ship: true } : (opt || {});
  const d = (cfg.dirty && typeof cfg.dirty === "object") ? cfg.dirty : {};
  if (o.ship) {
    if (o.path) delete d[o.path]; else Object.keys(d).forEach(k => delete d[k]);
    cfg.dirty = Object.keys(d).length ? d : false;
  } else if (o.path) { d[o.path] = true; cfg.dirty = d; }
  else cfg.dirty = true;
  DP.objs[cur.id] = cfg;
  if (logAct) dpLog(cur.name, logAct);
  dpSave();
  return cfg;
}

/* ---- 深链层：URL 意图参数在 dpLoad 复位之后重新施加 --------------------------------
   为什么必须有这一层：dpLoad() 的 restored 分支把「下钻位置」整体复位
   （M1 守卫 —— 上次停在下钻视图，下次打开不该直接落进去）。跨页下钻的意图因此**不能**
   靠会话态传递：会话态一定会被复位吞掉。改由 URL 参数承载，在复位**之后**重新施加。
   参数：?sub=<主体 id>（行为基线 · 主体详情）· ?obj=<资产 id>（防护策略 · 对象配置）
        · ?tab=<页签 id>（dpBaseB / dpBaseO / dpBaseP / dpBaseW，或 dpA1~dpA5）
   只对「本页职责范围内且目标真实存在」的参数生效；目标不存在则静默忽略（不伪造入口）。 */
function dpDeepLink(page) {
  if (window.__dpDeepLink) return;   /* 一次装载只施加一次：页内重渲染不再覆盖用户后续操作 */
  window.__dpDeepLink = true;
  let q = null;
  try { q = new URLSearchParams(location.search); } catch (e) { return; }
  const tab = q.get("tab") || "";
  if (page === "pg-dpbase") {
    const sid = q.get("sub") || "";
    if (sid && DP.base.subs.some(s => s.id === sid)) {
      DP.base.cur = sid; DP.base.view = "detail";
      DP.base.dimFilter = ""; DP.base.stFilter = ""; DP.base.kw = ""; DP.base.page = 1;
    }
    if (tab === "dpBaseB" || tab === "dpBaseO" || tab === "dpBaseP" || tab === "dpBaseW") DP.base.tab = tab;
  } else if (page === "pg-dppol") {
    const oid = q.get("obj") || "";
    if (oid && DP.objs[oid]) { DP.cur = oid; DP.polView = "cfg"; }
    if (DP_POL_CFG_TABS.some(x => x[0] === tab)) DP.polCfgTab = tab;
  } else if (page === "pg-dparms") {
    if (DP_ARMS_TABS.some(t => t[0] === tab)) DP.arms.tab = tab;
  }
}

/* ★ A3-06 / A2-08：可点行已加 tabindex，须补键盘触发 —— 否则纯键盘与读屏用户
   只能绕行行内按钮，行本身仍是「可点不可达」。对全部 `tr[data-act]` 生效
   （行为基线主体 / 客体清单 + 防护对象清单，同一交互口径）。
   ⚠ R53 · D-F1 / D-F2 订正：仅当**该行自身**是焦点所在时才触发下钻；焦点落在行内控件
   （按钮 / 勾选框）时让位给控件 —— 否则本委派会抢走行内动作。 */
document.addEventListener("keydown", function (e) {
  if (e.key !== "Enter" && e.key !== " ") return;
  const row = e.target && e.target.closest ? e.target.closest("tr[data-act]") : null;
  if (!row) return;
  /* ★ R53 · D-F1 / D-F2：原实现只取 e.target.closest("tr[data-act]")，行内控件的 closest()
     同样命中父行 ⇒ row.click() 抢先下钻；而 e.preventDefault() 只取消默认行为、**不阻断**
     同一 keydown 上的其它监听器 ⇒ 行内动作被吞。实测：「加入白名单」对纯键盘 / 读屏用户
     彻底不可达；告警页勾选框按空格反而弹出记录详情浮层。
     判据 = 焦点元素最近的自带 [data-act] 祖先**不是该行**（即命中行内控件）⇒ 交回控件原生激活。 */
  const own = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
  if (own && own !== row) return;
  e.preventDefault();
  row.click();
});
document.addEventListener("click", function (e) {
  /* 防护策略 · 对象配置视图三页签（条件渲染 ⇒ 切页签即重渲染，不走 showTab 的显隐） */
  const ctb = e.target && e.target.closest ? e.target.closest("#dpPolCfgTabs button[data-ct]") : null;
  if (ctb) {
    dpLoad();
    if (DP_POL_CFG_TABS.some(x => x[0] === ctb.dataset.ct)) { DP.polCfgTab = ctb.dataset.ct; dpSave(); renderDpPolicy(); }
    return;
  }
  /* 二级页签（.subtabs + data-st）：命名空间与一级页签完全分离，互不干扰 */
  const stb = e.target && e.target.closest ? e.target.closest(".subtabs button[data-st]") : null;
  if (stb) {
    const nav2 = stb.closest(".subtabs");
    if (nav2 && nav2.id && stb.closest("#pg-dpbase, #pg-dparms")) {
      dpLoad();
      DP.sub = DP.sub || {};
      DP.sub[nav2.id.replace(/Sub$/, "")] = stb.dataset.st;
      dpSave();
      showSubTab(nav2.id, stb.dataset.st);
      /* ★ A4-U1：aria-selected 随 .on 同步 —— 静态属性会在切页签后陈旧，反而误导读屏 */
      nav2.querySelectorAll("button[data-st]").forEach(b => b.setAttribute("aria-selected", b.dataset.st === stb.dataset.st ? "true" : "false"));
      return;
    }
  }
  /* 动态防护四页的页签（委派式）：只在 DP 页容器内接管，不影响既有页面的页签绑定 */
  const tb = e.target && e.target.closest ? e.target.closest(".tabs button[data-t]") : null;
  if (tb) {
    const nav = tb.closest(".tabs");
    if (nav && nav.id && tb.closest("#pg-dpov, #pg-dppol, #pg-dpbase, #pg-dparms, #pg-alert")) {
      dpLoad();
      /* 基线页四页签 / 对抗能力页五页签记忆当前位置：交互重渲染后仍停在原页签 */
      if (nav.id === "dpBaseTabs") { DP.base.tab = tb.dataset.t; dpSave(); }
      if (nav.id === "dpArmsTabs") { DP.arms.tab = tb.dataset.t; dpSave(); }
      if (nav.id === "dpOvTabs") { DP.ovTab = tb.dataset.t; dpSave(); if (DP.ovTab === "dpOvFlow") dpOvRenderRows(); }
      if (nav.id === "dpAlertTabs") { DP.alTab = tb.dataset.t; dpSave(); }
      showTab(nav.id, tb.dataset.t);
      /* ★ A4-U1：aria-selected 随 .on 同步（showTab 只切类，不动 ARIA） */
      nav.querySelectorAll("button[data-t]").forEach(b => b.setAttribute("aria-selected", b.dataset.t === tb.dataset.t ? "true" : "false"));
      return;
    }
  }
  const el = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
  if (!el) return;
  const act = el.dataset.act;
  if (!act || act.slice(0, 2) !== "dp") return;
  dpLoad();

  switch (act) {
    /* ---- 总览 ---- */
    case "dpNav": goPage(el.dataset.v, el.dataset.tab ? { tab: el.dataset.tab } : null); break;
    case "dpOvBar": {
      const band = el.dataset.band;
      DP.ovFilter = (DP.ovFilter === band) ? null : band;
      DP.ovPage = 1; DP.ovTab = "dpOvFlow";
      dpSave(); renderDpOverview();
      break;
    }
    case "dpOvClearF": DP.ovFilter = null; DP.ovAct = null; DP.ovAsset = null; DP.ovPage = 1; dpSave(); renderDpOverview(); break;
    case "dpModuleToggle": {
      const to = !(DP.dpOn !== false);
      ask2FA(
        to ? "启用动态防护" : "停用动态防护",
        () => {
          DP.dpOn = to; dpSave(); renderDpOverview();
          toast(to ? "动态防护已启用：网关第八步恢复执行（演示）" : "动态防护已停用：网关第八步整步短路（演示）");
        },
        null,
        to ? "启用后，网关第八步恢复执行判据、动态令牌校验与行为处置。"
           : "停用后，网关第八步整步短路 —— 不执行判据、不校验与消费动态令牌、不注入防护 JS；第 1~7 环与第 9 环不受影响。"
      );
      break;
    }
    case "dpOvRange": DP.ovRange = el.dataset.v; dpSave(); renderDpOverview(); break;
    case "dpOvActF": {
      DP.ovAct = el.dataset.v || null;
      DP.ovPage = 1; DP.ovTab = "dpOvFlow";
      dpSave();
      renderDpOverview();
      break;
    }
    case "dpOvPause": DP.paused = !DP.paused; dpSave(); renderDpOverview(); break;
    case "dpOvRow": {
      const x = DP.events.find(v => v.id === el.dataset.id);
      if (x) { x.open = !x.open; dpOvRenderRows(); }
      break;
    }
    case "dpOvFull": {
      const x = DP.events.find(v => v.id === el.dataset.id);
      if (x) dpOvFullDlg(x);
      break;
    }
    case "dpOvGoSub": {
      /* 事件行 / 完整事件弹窗 → 关联基线主体：落到行为基线页并直接下钻该主体（页签①）。
         ⚠ 意图必须由 URL 参数承载（?sub=），**不能只改会话态** —— 目标页 dpLoad() 的复位分支
           会把 base.view / base.cur 整体归位（会话态 UI 不跨会话），只改会话态等于
           「跳过去又被弹回主体清单」（2026-10-08 CDP 实测：view=list、cur=默认主体）。 */
      const sid = el.dataset.id;
      if (DP.base.subs.some(s => s.id === sid)) { closeDlg(); goPage("pg-dpbase", { sub: sid }); }
      break;
    }
    case "dpOvGoObj": {
      /* 事件行「防护对象」→ 该对象的策略配置（防护策略 · 对象配置视图） */
      const oid = el.dataset.id;
      if (DP.objs[oid]) goPage("pg-dppol", { obj: oid });
      break;
    }

    /* ---- 防护策略 · 列表 ⇄ 对象配置视图 ---- */
    case "dpPolCfg": {
      DP.cur = el.dataset.id;
      DP.polView = "cfg";
      dpSave(); renderDpPolicy();
      break;
    }
    case "dpPolBack": {
      DP.polView = "list";
      dpSave(); renderDpPolicy();
      break;
    }
    case "dpPolAddObj": {
      /* 候选 = 资产目录中适用（网页应用）且尚未纳入的资产；非 HTTP 资产显式列为不适用 */
      const pool = dpUnIncluded();
      const bad = dpCatalog().filter(x => !dpApplicable(x) && !DP.objs[x.id]);
      if (!pool.length) {
        openDlg("无可纳入的资产", "资产目录中适用动态防护的资产（网页应用）均已纳入防护对象清单。");
        break;
      }
      const grps = Array.from(new Set(pool.map(x => x.grp)));
      const opts = grps.map(g => '<optgroup label="' + esc(g) + '">' +
        pool.filter(x => x.grp === g).map(x => '<option value="' + esc(x.id) + '">' + esc(x.name) +
          "（" + esc(x.type) + " · L" + x.lv + " · " + esc(x.open) + "）</option>").join("") + "</optgroup>").join("");
      openDlg("新增防护对象",
        "对象清单直接引用「资产列表」的已登记资产；纳入后<b>动态防护默认关闭</b>，须在对象视图内单独开启。",
        '<div class="fld"><label>选择资产（按资产分组归集）</label><select id="dpNewObj">' + opts + "</select></div>" +
        (bad.length ? '<div class="fld" style="margin-top:10px"><label>不适用对象</label><div style="font-size:12px;color:#64748b;line-height:1.7">' +
          bad.map(x => esc(x.name) + "（" + esc(x.type) + "）").join("、") +
          " —— 非 HTTP 协议，动态防护工作在 7 层解析，不适用。</div></div>" : ""), "lg");
      document.getElementById("dlg1Ok").onclick = () => {
        const id = document.getElementById("dpNewObj").value;
        const x = dpAsset(id);
        if (!x || !dpApplicable(x)) { closeDlg(); toast("所选资产不适用动态防护（非网页应用），未纳入"); return; }
        DP.objs[id] = dpDefaultCfg();
        DP.cur = id;
        DP.polView = "cfg";
        dpLog(x.name, "纳入防护对象清单（取自资产目录 · 动态防护默认关闭）");
        dpSave(); closeDlg(); renderDpPolicy();
        toast("已纳入防护对象「" + x.name + "」（默认关闭）");
      };
      break;
    }
    case "dpPolRemove": {
      const x = dpAsset(el.dataset.id);
      if (!x || !DP.objs[x.id]) break;
      /* ★ 2026-10-09 用户裁定：移出 = 移除生效面且清空配置、不可逆 ⇒ 提为二次认证
         （与「删除准入策略」同档；原为普通确认）。 */
      ask2FA("移出防护对象清单「" + x.name + "」", () => {
        dpDropObj(x.id);   /* ★ R61·轮16：抹登记 + 同步客体主体 + 落盘（原只 delete ⇒ 客体基线留悬空条目） */
        DP.polView = "list";
        dpLog(x.name, "移出防护对象清单（配置一并清除）");
        dpSave(); renderDpPolicy();
        toast("已移出防护对象清单：" + x.name);
      }, null,
        "将把「<b>" + esc(x.name) + "</b>」移出防护对象清单：其<b>检测策略、评分档位与豁免条目一并清除</b>，" +
        "该资产流量不再进入动态防护评分。<b>资产登记信息不受影响</b>（资产本身仍在「资产列表」）。");
      break;
    }
    case "dpPolGotoRulelib": goPage("pg-rulelib", { tab: "r2" }); break;

    /* ---- 检测策略 ---- */
    case "dpPolDetSave": {
      const cur = dpCurObj(); if (!cur || cur.deny) break;
      confirmDlg("保存并下发", "将把「<b>" + esc(cur.name) + "</b>」（资产）的检测策略推送至全部网关节点：<b>热生效 ≤2s</b>、不触发 reload；" +
        "本页只维护该资产的动态防护配置，资产属性以「资产列表」为准。<b>本次变更入审计</b>。", () => {
        dpMutateCurCfg(() => {}, "保存检测策略并下发", { ship: true, path: "det" });
        dpSave(); renderDpPolicy();
        dpShip();
        toast("检测策略已保存并下发");
      }, "保存并下发");
      break;
    }

    /* A2-06：列表空态「清除全部筛选」（与其它列表同范式） */
    case "dpPolClearF": {
      DP.polKw = ""; DP.polGrp = ""; DP.polSt = ""; DP.polPage = 1;
      dpSave(); renderDpPolicy();
      break;
    }
    /* A2-02：单参数恢复继承（只清该参数覆盖，不影响其它覆盖） */
    case "dpDetReset1": {
      const cur0 = dpCurObj();
      if (!cur0 || cur0.deny) break;
      const seg0 = String(el.dataset.p || "").split(".");
      const def0 = dpDetParamDef(seg0[0]);
      const p0 = def0 && def0.ks.find(x => x.k === seg0[1]);
      if (!p0) break;
      const detN0 = (DP_DETS.find(x => x.k === seg0[0]) || {}).n || seg0[0];
      dpMutateCurCfg(cfg => {
        if (cfg.dpar && cfg.dpar[seg0[0]]) {
          delete cfg.dpar[seg0[0]][seg0[1]];
          if (!Object.keys(cfg.dpar[seg0[0]]).length) delete cfg.dpar[seg0[0]];
        }
      }, "恢复检测项「" + detN0 + "」的单参数为全局默认", { path: "det" });
      renderDpPolicy();
      toast("「" + p0.n + "」已恢复为全局默认（" + detN0 + "）· 已入待下发队列");
      break;
    }

    /* 场景化模板的判据范围（逐资产配置；入口在「防护策略 · 场景化防护模板」） */
    case "dpTplRange": {
      const cur = dpCurObj();
      const t = DP_TPLS.find(x => x.k === el.dataset.tpl);
      if (cur && t && !cur.deny) dpTplRangeDlg(cur.a, t);
      break;
    }

    /* ---- 评分与处置档位 ---- */
    /* A2-10：档位段增删（段数上界 = 可用处置档位数；下界 2 段）—— 原先 UI 只能平移 3 个边界，
       「连续 · 不重叠 · 闭合 0~100」的多段能力在页面上不可达（校验函数本就支持 ≥2 段）。 */
    case "dpBandAdd": {
      const curB = dpCurObj(); if (!curB || curB.deny) break;
      const bsA = dpReadBands();
      if (!bsA || bsA.length >= DP_BAND_ACTS.length) break;
      const lastB = bsA[bsA.length - 1];
      const midB = Math.floor((lastB.lo + lastB.hi) / 2);
      lastB.hi = midB;
      /* 前置动作（追加认证）随**最高档**移动：拆段后归到新末段，不从中间段继承。 */
      bsA.push({ lo: midB + 1, hi: 100, act: lastB.act, preAct: lastB.preAct || "" });
      delete lastB.preAct;
      dpMutateCurCfg(cfg => { cfg.bands = bsA; }, "添加评分档位段（共 " + bsA.length + " 段）", { path: "grade" });
      renderDpPolicy();
      toast("已添加档位段（共 " + bsA.length + " 段）· 已入待下发队列");
      break;
    }
    case "dpBandDel": {
      const curB2 = dpCurObj(); if (!curB2 || curB2.deny) break;
      const bsB = dpReadBands();
      const iB = parseInt(el.dataset.band, 10);
      if (!bsB || !(bsB.length > 2) || !(iB >= 0 && iB < bsB.length)) break;
      const cutB = bsB.splice(iB, 1)[0];
      if (iB === 0) bsB[0].lo = 0; else bsB[iB - 1].hi = cutB.hi;
      bsB[bsB.length - 1].hi = 100;
      /* 前置动作随最高档归位（删除末段时旧前置不丢）。 */
      const keepPre = cutB.preAct === "ADD_AUTH" || bsB.some(b => b.preAct === "ADD_AUTH");
      bsB.forEach((b, k) => { if (k === bsB.length - 1 && keepPre) b.preAct = "ADD_AUTH"; else delete b.preAct; });
      dpMutateCurCfg(cfg => { cfg.bands = bsB; }, "删除评分档位段（共 " + bsB.length + " 段）", { path: "grade" });
      renderDpPolicy();
      toast("已删除档位段（共 " + bsB.length + " 段）· 已入待下发队列");
      break;
    }
    case "dpPolBandSave": {
      const bands = dpReadBands();
      const chk = dpBandsOk(bands);
      const errEl = document.getElementById("dpPolBandErr");
      if (chk.err) {
        if (errEl) errEl.textContent = "校验未通过：" + chk.err + "（区间须连续、不重叠、闭合 0~100）";
        const pv = document.getElementById("dpBandPreview");
        if (pv && bands) pv.innerHTML = dpBandPreview(bands, chk.idx);
        toast("校验未通过：" + chk.err);
        break;
      }
      if (errEl) errEl.textContent = "";
      const cur2 = dpCurObj(); if (!cur2) break;
      confirmDlg("保存并下发", "将把「<b>" + esc(cur2.name) + "</b>」的评分与处置档位推送至全部网关节点：<b>热生效 ≤2s</b>、不触发 reload；区间校验已通过（连续 · 不重叠 · 闭合 0~100）。<b>本次变更入审计</b>。", () => {
        dpMutateCurCfg(cfg => { cfg.bands = bands; }, "调整评分与处置档位并下发", { ship: true, path: "grade" });
        dpSave(); renderDpPolicy();
        dpShip();
        toast("评分与处置档位已保存并下发");
      }, "保存并下发");
      break;
    }
    case "dpPolBandReset": {
      confirmDlg("恢复默认档位", "将丢弃当前评分区间编辑，恢复为出厂默认（全段 <b>观察记录起步</b>）。<b>本次变更入审计</b>。", () => {
        dpMutateCurCfg(cfg => { cfg.bands = dpDefaultCfg().bands; }, "恢复默认评分档位（观察记录起步）", { ship: true, path: "grade" });
        dpSave(); renderDpPolicy(); dpShip();
        toast("已恢复默认档位（观察记录起步）");
      }, "恢复默认");
      break;
    }

    /* ---- 豁免（二次认证 + 必填校验 + 审批演示） ---- */
    case "dpPolExAdd": {
      const cur = dpCurObj(); if (!cur || cur.deny) break;
      openDlg("新增豁免", "豁免本资产某类风险源的既有处置（防护对象直接引用资产目录，无组织级继承）；<b>豁免不覆盖准入拒绝语义</b>；提交后进入「待审批」，审批人 ≠ 创建人。", `
        <div class="fld"><label>风险源类型</label><select id="dpExSrc">${DP_EXSRC.map(s => `<option>${esc(s)}</option>`).join("")}</select></div>
        <div class="fld"><label>生效开始时间（留空 = 立即生效）</label><input id="dpExFrom" type="datetime-local"></div>
        <div class="fld"><label>生效结束时间 <span class="req">*</span>（不设永久豁免）</label><input id="dpExTo" type="datetime-local"></div>
        <div class="fld"><label>原因 <span class="req">*</span></label><input id="dpExReason" maxlength="160" placeholder="例：低风险的查询类页面豁免动态挑战，兼容浏览器刷新"></div>`, "lg");
      document.getElementById("dlg1Ok").onclick = () => {
        const src = document.getElementById("dpExSrc").value;
        const from = document.getElementById("dpExFrom").value;
        const to = document.getElementById("dpExTo").value;
        const reason = document.getElementById("dpExReason").value.trim();
        if (!to) { markBad(document.getElementById("dpExTo"), true); toast("结束时间必填：不设永久豁免"); return; }
        if (!reason) { markBad(document.getElementById("dpExReason"), true); toast("原因必填"); return; }
        if (from && to && from >= to) { markBad(document.getElementById("dpExTo"), true); toast("结束时间必须晚于开始时间"); return; }
        closeDlg();
        ask2FA(`新增豁免（${src}）`, () => {
          dpMutateCurCfg(cfg => {
            cfg.exempts.push({
              id: "ex" + (DP.exSeq++), src: src,
              from: (from || "").replace("T", " "), to: to.replace("T", " "),
              reason: reason, by: DP.actor, approver: "—", status: "待审批",
            });
          }, "新增豁免「" + src + "」（待审批）", { ship: true, path: "ex" });
          renderDpPolicy();
          toast("豁免已提交（二次认证完成 · 已落操作审计 · 待王芳审批）");
        });
      };
      break;
    }
    case "dpPolExApprove":
    case "dpPolExReject": {
      const approve = act === "dpPolExApprove";
      const cur = dpCurObj(); if (!cur) break;
      const eff = dpEffCfg(DP.cur);
      const x = eff.cfg.exempts.find(v => v.id === el.dataset.id);
      if (!x) break;
      /* ★ A2-05：三权互斥拦截 —— 创建人不得审批本人提交的豁免 */
      if (x.by === DP.actor) {
        toast("审批人 ≠ 创建人：本条由「" + x.by + "」提交，请切换操作身份后由他人审批（演示）");
        break;
      }
      const approver = DP.actor;
      ask2FA((approve ? "审批通过" : "驳回") + `豁免（${x.src}）· 审批人：${approver}`, () => {
        dpMutateCurCfg(cfg => {
          const t = cfg.exempts.find(v => v.id === x.id);
          if (t) { t.status = approve ? "生效中" : "已驳回"; t.approver = approver; }
        }, (approve ? "审批通过" : "驳回") + "豁免「" + x.src + "」", { ship: true, path: "ex" });
        renderDpPolicy();
        toast("豁免已" + (approve ? "审批通过并生效" : "驳回") + "（审批人：" + approver + " · 已落操作审计）");
      });
      break;
    }
    case "dpPolExExtend": {
      const cur = dpCurObj(); if (!cur) break;
      const eff = dpEffCfg(DP.cur);
      const x = eff.cfg.exempts.find(v => v.id === el.dataset.id);
      if (!x) break;
      /* ★ A2-04：已驳回（从未生效）无「延长」可言 —— 该动作实为重新提交，标题随状态切换 */
      const redone = x.status === "已驳回";
      openDlg(redone ? "重新申请豁免" : "延长豁免",
        redone ? `本条曾<b>被驳回</b>（未生效）；提交后重新进入「待审批」。` : `当前结束时间：<b>${esc(x.to)}</b>；延长后重新进入「待审批」。`, `
        <div class="fld"><label>新的结束时间（必填 · 不设永久豁免）</label><input id="dpExNewTo" type="datetime-local"></div>
        <div class="fld"><label>延长原因（必填）</label><input id="dpExNewReason" maxlength="160"></div>`, "lg");
      document.getElementById("dlg1Ok").onclick = () => {
        const nt = document.getElementById("dpExNewTo").value;
        const nr = document.getElementById("dpExNewReason").value.trim();
        if (!nt) { toast("结束时间必填：不设永久豁免"); return; }
        if (!nr) { toast("原因必填"); return; }
        if (String(nt).replace("T", " ") <= String(x.to || "")) { toast("新的结束时间必须晚于当前结束时间（" + x.to + "）"); return; }
        closeDlg();
        ask2FA(`延长豁免（${x.src}）`, () => {
          dpMutateCurCfg(cfg => {
            const t = cfg.exempts.find(v => v.id === x.id);
            if (t) { t.to = nt.replace("T", " "); t.reason = nr; t.status = "待审批"; t.approver = "—"; }
          }, "延长豁免「" + x.src + "」（待审批）", { ship: true, path: "ex" });
          renderDpPolicy();
          toast("豁免延长已提交（二次认证完成 · 重新进入待审批）");
        });
      };
      break;
    }
    case "dpPolExDel": {
      const cur = dpCurObj(); if (!cur) break;
      const eff = dpEffCfg(DP.cur);
      const x = eff.cfg.exempts.find(v => v.id === el.dataset.id);
      if (!x) break;
      ask2FA(`删除豁免（${x.src}）`, () => {
        dpMutateCurCfg(cfg => { cfg.exempts = cfg.exempts.filter(v => v.id !== x.id); }, "删除豁免「" + x.src + "」", { ship: true, path: "ex" });
        renderDpPolicy();
        toast("豁免已删除（已落操作审计）");
      }, null, "删除后该风险源在本资产的既有处置立即恢复、不再豁免；本条豁免记录不可恢复。");
      break;
    }

    /* ---- 基线 ---- */
    case "dpBasePick": {
      /* 首页清单 → 下钻该主体基线（与防护策略「列表 → 对象配置视图」同构） */
      DP.base.cur = el.dataset.id;
      DP.base.view = "detail";
      dpSave(); renderDpBaseline();
      break;
    }
    case "dpBaseBack": {
      DP.base.view = "list";
      dpSave(); renderDpBaseline();
      break;
    }
    case "dpBaseReset": {
      DP.base.kw = ""; DP.base.dimFilter = ""; DP.base.stFilter = "";
      DP.base.sort = "dev"; DP.base.page = 1;
      dpSave(); renderDpBaseline();
      break;
    }
    case "dpBaseParamSave": {
      /* ★ 取值先落局部变量、确认后才写状态 —— 否则点「取消」时阈值已在内存生效，
         「写盘才生效」的承诺被绕过（实测：取消后切页签即按新阈值重判）。 */
      const nDims = {};
      DP_BASEDIMS.forEach(d => {
        const inp = document.querySelector(`input[data-dimbase="${d.k}"]`);
        if (inp) { const v = parseFloat(inp.value); if (Number.isFinite(v) && v > 0) nDims[d.k] = v; }
      });
      const coldEl = document.getElementById("dpBaseCold");
      let nCold = null;
      if (coldEl) { const v = parseInt(coldEl.value, 10); if (Number.isFinite(v) && v >= 1) nCold = v; }
      /* 校验失败必须**出声**：原先全部输入非法时 nDims 为空，弹窗照常弹出并可点确定，
         但没有任何字段被改、页面无任何提示 —— 用户以为保存成功（典型静默失败）。 */
      const _badDim = DP_BASEDIMS.filter(d => {
        const inp = document.querySelector('input[data-dimbase="' + d.k + '"]');
        return inp && !(parseFloat(inp.value) > 0);
      }).map(d => d.n);
      if (_badDim.length) { toast("判定阈值须为正数（σ）：" + _badDim.join(" / ")); break; }
      if (coldEl && !(nCold >= 1)) { toast("冷启动观察期须为 ≥1 的整数天"); break; }
      confirmDlg("保存并下发", "将把行为基线学习与判定参数（四类默认阈值 σ / 冷启动观察期）推送至全部网关节点：<b>热生效 ≤2s</b>。" +
        "收紧阈值可能在下一窗口产生新的偏离判定；调整观察期会同步改变冷启动对象范围。<b>本次变更入审计</b>。", () => {
        DP_BASEDIMS.forEach(d => { if (nDims[d.k] != null) DP.base.dims[d.k] = nDims[d.k]; });
        if (nCold != null) DP.base.cold = nCold;
        dpLog("全局", "调整基线学习与判定参数并下发");
        dpApplyCold();   /* ★ A3-01：观察期变更会改冷启动对象范围，须同会话重算 */
        dpSave(); renderDpBaseline();
        toast("基线参数已保存并下发");
      }, "保存并下发");
      break;
    }
    case "dpBaseSubReset": {
      const s = DP.base.subs.find(v => v.id === el.dataset.id);
      if (!s) break;
      const _su = s.dim === "asset" ? "客体" : "主体";
      /* ★ 2026-10-09 用户裁定：重置基线 = 重算该主体的判定基准（改变生效面判定）
         ⇒ 提为二次认证（与「手动触发基线重建」同档；原为普通确认）。 */
      ask2FA("重置该" + _su + "基线「" + s.key + "」", () => {
        s.series = dpSubSeries(s.mu, s.sd, [], 0);
        s.hist = [];
        /* 当前值一并回到基线：否则「状态＝正常 / 偏离记录＝未产生偏离 / 指标判定列＝偏离」三处互斥
           （E-03：原实现只清 series/hist/samples/last，主指标当前值仍停在偏离峰值）。 */
        (s.metrics || []).forEach(m => { m.cur = m.mu; m.hit = true; if (m.st) m.st = 0; });
        s.samples = Math.round(s.samples * 1.06);
        s.last = "刚刚重建";
        s.touched = true; s.rs = 1;   /* 用户态：重播种时须回灌（见 dpSubsCarry） */
        dpLog(s.label, "重置该" + _su + "基线（以学习窗口 " + DP.base.win + " 重新学习）");
        dpSave(); renderDpBaseline();
        toast(_su + "基线已重置（重新学习完成 · 样本 " + s.samples + "）");
      }, null, "将以最近学习窗口（" + DP.base.win + "）重新学习「<b>" + esc(s.key) + "</b>（" + esc(s.name) +
        "，" + (s.dim === "asset" ? "来源账号 " + (s.sources || []).length + " 个" : "访问防护对象 " + (s.assets || []).length + " 个") +
        "）的" + (s.dim === "asset" ? "访问图案" : "行为") + "基线：样本重算、判定带重建、该" + _su +
        "历史偏离记录归档。<b>本次操作入审计</b>。");
      break;
    }
    case "dpBaseSubWl": {
      const s = DP.base.subs.find(v => v.id === el.dataset.id);
      if (!s) break;
      openDlg("加入观察期白名单", "命中白名单的偏离只记录、不处置；仅观察记录起步期生效，转入「动态挑战」/「拒绝访问」后失效。", `
        <div class="fld"><label>基线维度</label><input value="${esc(dpDim(s.dim).n)}" readonly></div>
        <div class="fld"><label>主体</label><input value="${esc(s.key)} · ${esc(s.name)}" readonly></div>
        <div class="fld"><label>指标（该主体主指标）</label><input id="dpWlMetric" maxlength="64" value="${esc(s.main)}" readonly title="命中的判定 = 指标精确等于该主体主指标，故随主体给定、不可改（可改会建出永不命中的死条目）"></div>
        <div class="fld"><label>审批人</label><input id="dpWlApprover" maxlength="32" placeholder="例：王芳"></div>
        <div class="fld"><label>到期时间 <span class="req">*</span></label><input id="dpWlExpire" type="date" value="${dpWlDefaultExpire()}"></div>
        <div class="fld"><label>原因 <span class="req">*</span></label><input id="dpWlReason" maxlength="160" placeholder="例：夜间批处理固定模式，偏离为预期"></div>`, "lg");
      document.getElementById("dlg1Ok").onclick = () => {
        const metric = document.getElementById("dpWlMetric").value.trim();
        const reason = document.getElementById("dpWlReason").value.trim();
        const approver = document.getElementById("dpWlApprover").value.trim();
        const expire = document.getElementById("dpWlExpire").value.trim();
        if (!metric) { markBad(document.getElementById("dpWlMetric"), true); toast("指标必填"); return; }
        if (!reason) { markBad(document.getElementById("dpWlReason"), true); toast("原因必填"); return; }
        /* ★ R61：到期时间必填 —— 原实现非必填且无校验 ⇒ 可建**永久条目**；而命中判据
           `!w.expire || w.expire >= DP_TODAY` 等于「无到期 = 永不失效」，与同模块豁免表单
           「必填 · 不设永久豁免」正面冲突。 */
        if (!expire) { markBad(document.getElementById("dpWlExpire"), true); toast("到期时间必填：观察期白名单为**有期限**豁免，不设永久条目"); return; }
        if (expire < DP_TODAY) { markBad(document.getElementById("dpWlExpire"), true); toast("到期时间不得早于今日（" + DP_TODAY + "）：到期日当天仍有效、次日失效"); return; }
        /* ★ R53 · D-F6：行内入口原为**零校验**（同 (dim, sub, metric) 可重复入库）⇒ 补与页签入口同一判据。 */
        if (dpWlDup(s.dim, dpSubKey(s), metric)) { toast("该主体该指标已在观察期白名单中，无需重复新增"); return; }
        /* ★ R61：审批人不得与创建人相同（与豁免审批的三权互斥同口径，指南 §8.4）。 */
        if (approver && approver === DP.actor) { markBad(document.getElementById("dpWlApprover"), true); toast("审批人不得与创建人相同（" + DP.actor + "）：三权互斥，本条须由他人审批"); return; }
        closeDlg();
        /* ★ 2026-10-09 用户裁定：加入白名单 = 该主体偏离不再处置（改变生效面）⇒ 与「移除白名单」
           对称，提为二次认证。沿用「新增豁免」的范式：表单校验 → 关表单 → 二次认证 → 落库。 */
        ask2FA("加入观察期白名单「" + dpSubKey(s) + "」", () => {
          DP.base.wl.push({ id: "wl" + Date.now(), dim: s.dim, sub: dpSubKey(s), metric: metric, reason: reason, by: DP.actor, approver: approver, at: dpNowTs(), expire: expire });
          dpLog(s.label, "加入观察期白名单");
          dpSave(); renderDpBaseline();
          toast("白名单条目已新增（该主体命中的偏离只记录、不处置）");
        }, null, "命中白名单的偏离只记录、不处置；仅观察记录起步期生效，转入「动态挑战」/「拒绝访问」后失效。");
      };
      break;
    }
    case "dpBaseSubTh": {
      const s = DP.base.subs.find(v => v.id === el.dataset.id);
      if (!s) break;
      const dimDef = DP.base.dims[s.dim];
      const _su2 = s.dim === "asset" ? "客体" : "主体";
      openDlg("调整本" + _su2 + "判定阈值", "仅对「<b>" + esc(s.label) + "</b>」生效；留空则恢复为维度默认 " + dimDef.toFixed(1) + "σ。", `
        <div class="fld"><label>${_su2}</label><input value="${esc(s.label)}" readonly></div>
        <div class="fld"><label>判定阈值（σ）</label><input id="dpSubTh" value="${esc(s.th != null ? s.th : "")}" placeholder="留空 = 维度默认 ${dimDef.toFixed(1)}σ"></div>`, "lg");
      document.getElementById("dlg1Ok").onclick = () => {
        const v = document.getElementById("dpSubTh").value.trim();
        /* ★ R53 · D-F5：取值先落局部变量、确认后才写状态 —— 否则点「取消」时阈值已在内存生效
           （与参数块 :4633 同一防护）。 */
        let nv = null;
        if (v !== "") {
          const f = parseFloat(v);
          if (!Number.isFinite(f) || f <= 0) { toast("阈值须为正数（留空恢复维度默认）"); return; }
          nv = f;
        }
        /* ★ R53 · D-F5：原实现**无任何确认档**（点「确定」即写盘）。本阈值为**配置内容**变更
           （可逆、不改生效面集合成员），与同页「维度默认阈值」同档 ⇒ 普通确认；与
           「重置基线 / 白名单 / 提前结束观察期」的二次认证的区分轴 =「可逆性 + 是否改生效面集合」。 */
        closeDlg();
        confirmDlg("调整本" + _su2 + "判定阈值", "将把「<b>" + esc(s.label) + "</b>」的判定阈值设为 " +
          (nv != null ? "<b>" + nv.toFixed(1) + "σ</b>" : "维度默认 <b>" + dimDef.toFixed(1) + "σ</b>") +
          "：收紧阈值可能在下一窗口产生新的偏离判定；该阈值直接决定本" + _su2 + "的偏离判定与处置档位。<b>本次变更入审计</b>。", () => {
          s.th = nv;
          s.touched = true;   /* 用户态：重播种时须回灌（见 dpSubsCarry） */
          dpLog(s.label, "调整本" + _su2 + "判定阈值" + (s.th != null ? "（" + s.th.toFixed(1) + "σ）" : "（恢复维度默认）"));
          dpSave(); renderDpBaseline();
          toast("本" + _su2 + "判定阈值已更新");
        }, "确定调整");
      };
      break;
    }
    case "dpBaseWlAdd": {
      /* ★ R61·轮8：「必填」标记统一 —— 原同一弹窗 4 个必填项三种标法（一个把「（必填）」写进标签文字、
         一个标 `*`、两个不标）。判据统一为：**必填 且 用户可填**标 `<span class="req">*</span>`；
         只读派生项（行内入口的「指标」，随主体给定、不可改）与选填项（「审批人」）不标 ——
         与该弹窗「安全级别由认证方式唯一确定（disabled）不标 `*`」的先例同口径。 */
      openDlg("新增白名单条目", "命中白名单的偏离只记录、不处置；仅观察记录起步期生效。", `
        <div class="fld"><label>基线维度</label><select id="dpWlDim">${DP_BASEDIMS.map(d => `<option value="${d.k}">${esc(d.n)}</option>`).join("")}</select></div>
        <div class="fld"><label>主体标识（须与身份管理台账一致） <span class="req">*</span></label><input id="dpWlSub" maxlength="64" placeholder="例：BZPC-0007-3A2C / wangfang / t_pc_0007"></div>
        <div class="fld"><label>指标（须与所选主体主指标一致） <span class="req">*</span></label><input id="dpWlMetric" maxlength="64" value="${esc(dpDim("app").metric)}" title="命中的判定 = 指标精确等于该主体主指标；不一致即建出永不命中的死条目"></div>
        <div class="fld"><label>审批人</label><input id="dpWlApprover" maxlength="32" placeholder="例：王芳"></div>
        <div class="fld"><label>到期时间 <span class="req">*</span></label><input id="dpWlExpire" type="date" value="${dpWlDefaultExpire()}"></div>
        <div class="fld"><label>原因 <span class="req">*</span></label><input id="dpWlReason" maxlength="160" placeholder="例：夜间批处理固定模式，偏离为预期"></div>`, "lg");
      /* 指标默认值随所选「基线维度」联动 —— 原为写死的「登录频次」，切到设备 / 客体维度即文不对题。 */
      {
        const dimSel = document.getElementById("dpWlDim");
        if (dimSel) dimSel.onchange = () => {
          const mi = document.getElementById("dpWlMetric");
          if (mi) mi.value = dpDim(dimSel.value).metric;
        };
      }
      document.getElementById("dlg1Ok").onclick = () => {
        const dim = document.getElementById("dpWlDim").value;
        const sub = document.getElementById("dpWlSub").value.trim();
        const metric = document.getElementById("dpWlMetric").value.trim();
        const reason = document.getElementById("dpWlReason").value.trim();
        const approver = document.getElementById("dpWlApprover").value.trim();
        const expire = document.getElementById("dpWlExpire").value.trim();
        if (!sub) { markBad(document.getElementById("dpWlSub"), true); toast("主体标识必填"); return; }
        if (!/^[A-Za-z0-9_.\-]{3,64}$/.test(sub)) { markBad(document.getElementById("dpWlSub"), true); toast("主体标识格式不符：须为 3~64 位字母 / 数字 / _ . -（与身份管理台账标识一致）"); return; }
        /* ★ A3-02：本表单自称「须与身份管理台账一致」，原实现只校格式 ⇒ 可落进**永不命中的死条目**；
           同 dim+sub 重复条目还会互相遮蔽。两条一并补齐。 */
        if (!DP.base.subs.some(s => s.dim === dim && dpSubKey(s) === sub)) { markBad(document.getElementById("dpWlSub"), true); toast("主体标识不在身份台账：" + sub + "（请从已建模主体中选择）"); return; }
        if (!metric) { markBad(document.getElementById("dpWlMetric"), true); toast("指标必填"); return; }
        /* ★ R61：指标须与该主体的主指标一致 —— 行内入口已把「指标」设为只读，本入口此前仅校非空
           ⇒ 可手填任意指标、建出**永不命中**的死条目（命中判据 = 指标精确等于主体主指标）。 */
        var _subRec = DP.base.subs.filter(function (v) { return v.dim === dim && dpSubKey(v) === sub; })[0];
        if (_subRec && String(_subRec.main) !== metric) { markBad(document.getElementById("dpWlMetric"), true); toast("指标须与该主体的主指标一致（" + _subRec.main + "），否则该条永不命中"); return; }
        /* ★ R53 · D-F6：去重判据统一到匹配语义（维度 + 主体标识 + 指标），与行内入口共用 dpWlDup()。 */
        if (dpWlDup(dim, sub, metric)) { toast("该主体该指标已在观察期白名单中，无需重复新增"); return; }
        if (!reason) { markBad(document.getElementById("dpWlReason"), true); toast("原因必填"); return; }
        /* ★ R61：到期时间必填（同「加入观察期白名单」入口）—— 不设永久条目，与豁免表单口径一致。 */
        if (!expire) { markBad(document.getElementById("dpWlExpire"), true); toast("到期时间必填：观察期白名单为**有期限**豁免，不设永久条目"); return; }
        if (expire < DP_TODAY) { markBad(document.getElementById("dpWlExpire"), true); toast("到期时间不得早于今日（" + DP_TODAY + "）：到期日当天仍有效、次日失效"); return; }
        /* ★ R61：同上 —— 审批人不得与创建人相同（三权互斥）。 */
        if (approver && approver === DP.actor) { markBad(document.getElementById("dpWlApprover"), true); toast("审批人不得与创建人相同（" + DP.actor + "）：三权互斥，本条须由他人审批"); return; }
        closeDlg();
        /* ★ 2026-10-09 用户裁定：与「加入观察期白名单」（行内入口）同一口径 ⇒ 二次认证。 */
        ask2FA("新增观察期白名单「" + sub + "」", () => {
          DP.base.wl.push({ id: "wl" + Date.now(), dim: dim, sub: sub, metric: metric, reason: reason, by: DP.actor, approver: approver, at: dpNowTs(), expire: expire });
          dpLog("全局", "新增观察期白名单「" + sub + "」");
          dpSave(); renderDpBaseline();
          toast("白名单条目已新增");
        }, null, "命中白名单的偏离只记录、不处置；仅观察记录起步期生效。");
      };
      break;
    }
    case "dpBaseWlDel": {
      const i0 = DP.base.wl.findIndex(w => w.id === el.dataset.id);
      if (i0 < 0) break;
      const w0 = DP.base.wl[i0];
      /* ★ 2026-10-09 用户裁定：移除白名单 = 恢复对该主体的处置（改变生效面）⇒ 提为二次认证。 */
      ask2FA("移除白名单条目「" + w0.sub + "（" + w0.metric + "）」", () => {
        const i = DP.base.wl.findIndex(w => w.id === w0.id);
        if (i >= 0) DP.base.wl.splice(i, 1);
        dpLog("全局", "移除观察期白名单「" + w0.sub + "」");
        dpSave(); renderDpBaseline();
        toast("白名单条目已移除");
      }, null, "将移除「<b>" + esc(w0.sub) + "</b>（" + esc(w0.metric) + "）」的观察期白名单：" +
        "其后该主体的同类偏离<b>恢复按评分档位处置</b>，可能产生误报。<b>本次操作入审计</b>。");
      break;
    }
    case "dpBaseColdEnd": {
      const a = dpAsset(el.dataset.id), c0 = DP.objs[el.dataset.id];
      if (!a || !c0) break;
      const d0 = Math.max(1, dpDaysSince(c0.onAt));
      /* ★ 2026-10-09 用户裁定：提前结束观察期 = 由「只观察」转为按档位正常处置
         （等于开始真实拦截 / 阻断流量）⇒ 属启用类，提为二次认证。 */
      ask2FA("提前结束观察期「" + a.name + "」", () => {
        DP.base.coldEnd.push(a.id);
        dpLog(a.name, "提前结束冷启动观察期（转入正常基线）");
        dpApplyCold();   /* ★ A3-01：同会话重算客体主体样本，否则残留旧态 */
        dpSave(); renderDpBaseline();
        toast("「" + a.name + "」已转入正常基线（偏离恢复按档位处置）");
      }, null, "将把「<b>" + esc(a.name) + "</b>」（已启用 " + d0 + " 天）提前转入正常基线：其后偏离按评分档位<b>正常处置</b>，不再只观察。" +
        "样本不足时可能产生误报。<b>本次操作入审计</b>。");
      break;
    }
    case "dpBaseRebuild": {
      const p = { app: dpPopStat("app"), acct: dpPopStat("acct"), dev: dpPopStat("dev"), asset: dpPopStat("asset") };
      ask2FA("手动触发基线重建（全部已建模主体重算）", () => {
        DP.base.rebuilds.unshift({ at: dpNowTs(), by: DP.actor + "（手动）",
          result: "重建中 · 已受理（应用 " + p.app.n + " · 账号 " + p.acct.n + " · 设备 " + p.dev.n + " · 客体 " + p.asset.n + "）" });
        dpLog("全局", "手动触发基线重建");
        dpSave(); renderDpBaseline();
        toast("基线重建已受理（已落操作审计）");
        /* 句柄留存：连续触发两次否则会「后发先至」——先进队列反而后完成 */
        if (window._dpRebuildTimer) clearTimeout(window._dpRebuildTimer);
        window._dpRebuildTimer = setTimeout(() => {
          const r0 = DP.base.rebuilds[0];
          if (r0 && r0.result.indexOf("重建中") === 0) {
            /* ★ A3-03：原先结尾写死，与同页仍在「学习训练中」（样本不足）的主体互斥 ——
               改为按实算派生，与页面自己的周期重建记录同一口径。 */
            const lvlTxt = dpRebuildLvl();
            r0.result = "完成 · 应用 " + p.app.n + " · 账号 " + p.acct.n + " · 设备 " + p.dev.n + " · 客体 " + p.asset.n + " · " + lvlTxt;
            dpSave();
            if (document.getElementById("pg-dpbase")) { renderDpBaseline(); toast("基线重建完成 · " + lvlTxt); }
          }
        }, 4000);
      }, null, "执行期间该主体<b>只观察</b>、不参与判定与处置（指南 §8.4）；完成后已建模主体的中位数与稳健尺度按最近学习窗口重算，历史偏离记录保留。");
      break;
    }

    /* ---- 风险事件告警（公共页） ---- */
    case "dpAlertSrcF": {
      DP.alSrc = el.dataset.v || "";
      DP.alPage = 1;
      dpSave(); renderDpAlert();
      break;
    }
    case "dpAlertTest": {
      const a = DP.alerts.find(v => v.id === el.dataset.id);
      if (!a) break;
      const lastBefore = dpAlertLast(a.id);
      /* 测试发送**不改变规则与记录状态**（不写触发时间）⇒ 触发器读值不变；
         但「对外发送（含 Webhook）」属数据外发，须留一条审计 ⇒ 需要落盘，非空转。 */
      dpLog("全局", "测试发送告警规则「" + a.name + "」（渠道：" + a.ch.join("、") + "）· 不写入触发时间");
      dpSave();
      renderDpAlert();
      /* ★ R8：原文案承诺「送达结果见『告警记录』的『通知送达』列」，但测试发送按设计**不写入记录**
         ⇒ 用户按提示去看永远看不到本次结果（承诺了一个不存在的落点）。改为实话，并把
         「已下发渠道」限定为**可用渠道**，不可用的单列「已跳过」。 */
      const _u = a.ch.filter(n => dpChanUsable(dpChanByName(n)));
      const _s = a.ch.filter(n => !dpChanUsable(dpChanByName(n)));
      toast((a.on ? "测试告警已下发（渠道：" + (_u.join("、") || "无可用渠道") + "）"
                   : "规则「" + a.name + "」当前已停用 —— 测试发送仅验证渠道配置，不恢复规则触发（渠道："
                     + (_u.join("、") || "无可用渠道") + "）")
            + " · 测试下发只落一条操作审计、不写入告警记录（触发时间仍为 " + (lastBefore || "未触发") + "）"
            + (_s.length ? " · 已跳过不可用渠道：" + _s.join("、") : ""));
      break;
    }
    case "dpAlertAdd":
    case "dpAlertEdit": {
      const a = act === "dpAlertEdit" ? DP.alerts.find(v => v.id === el.dataset.id) : null;
      openDlg(a ? "编辑告警规则" : "新增告警规则", "告警规则挂在防护域上：来源域产生符合条件的风险事件时触发；条件支持「事件类型 + 频率窗口」表达。", `
        <div class="fld"><label>名称（必填）</label><input id="dpAlName" maxlength="30" value="${a ? esc(a.name) : ""}" ${a && a.preset ? 'readonly title="预置模板名称不可修改"' : ""}>${a && a.preset ? '<div class="help">预置模板：名称与防护域随模板给定；条件 / 级别 / 模板 / 渠道可按本行调整。</div>' : ""}</div>
        <div class="fld"><label>防护域</label><select id="dpAlSrc" ${a && a.preset ? 'disabled title="预置模板防护域不可修改"' : ""}>${DP_ALERT_SRCS.map(s => `<option ${a && a.src === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>${a && a.preset ? '<div class="help">由预置模板固定，不可修改。</div>' : ""}</div>
        <div class="fld"><label>触发条件（必填）</label><input id="dpAlCond" maxlength="160" list="dpAlCondEvt" value="${a ? esc(a.cond) : ""}" placeholder="例：risk_action_taken（风险处置已执行）5 分钟内 > 100 次"><datalist id="dpAlCondEvt">${DP_ALERT_EVTS.map(e => `<option value="${esc(e[1])}（${esc(e[0])}）">${esc(e[1])}</option>`).join("")}</datalist><div class="help">须含引擎事件类型（可从候选选择）+ 频率窗口（例：5 分钟内 > 50 次）；针对某事件本身的规则写「…发生时触发」。</div></div>
        <div class="fld"><label>告警级别</label><select id="dpAlLv">${DP_ALERT_LVS.map(v => `<option ${(a ? (a.lv || "一般") : "一般") === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select><div class="help">级别随规则携带，供记录分诊与检索使用。</div></div>
        <div class="fld"><label>通知模板</label><select id="dpAlTpl">${["简洁通知", "详细报告（含事件样本）"].map(t => `<option ${a && a.tpl === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="fld"><label>通知渠道（必填）</label><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          ${(() => { const _cs = DP.chans || []; const _ns = _cs.map(ch => dpChanName(ch.kind)); const _items = _cs.map(ch => { const c = dpChanName(ch.kind); const m = dpChanMissing(ch); const bad = !ch.on || m.length; const why = !ch.on ? "已停用" : "待配置"; const tip = !bad ? "已启用且配置齐备" : (ch.on ? "配置不完整（缺：" + m.join(" / ") + "）：命中该渠道的投递将失败" : "该渠道已停用：命中时跳过该渠道，其余渠道不受影响"); return `<label style="font-weight:400" title="${esc(tip)}"><input type="checkbox" class="dpAlCh" value="${esc(c)}" ${(a ? (a.ch || []).indexOf(c) >= 0 : c === "站内信") ? "checked" : ""}> ${esc(c)}${bad ? ` <span class="muted" style="font-size:11px">（${why}）</span>` : ""}</label>`; }); const _ex = (a ? (a.ch || []) : []).filter(n => _ns.indexOf(n) < 0); const _exi = _ex.map(n => `<label style="font-weight:400" title="该渠道不在通知渠道台账中（悬空引用）"><input type="checkbox" class="dpAlCh" value="${esc(n)}" checked> ${esc(n)} <span class="muted" style="font-size:11px">（未登记）</span></label>`); return _items.concat(_exi).join(""); })()}
          <label style="font-weight:400;margin-left:auto"><input type="checkbox" id="dpAlOn" ${(a ? a.on : true) ? "checked" : ""}> 启用</label>
        </div></div>`, "lg");
      document.getElementById("dlg1Ok").onclick = () => {
        const name = document.getElementById("dpAlName").value.trim();
        const src = document.getElementById("dpAlSrc").value;
        const cond = document.getElementById("dpAlCond").value.trim();
        const tpl = document.getElementById("dpAlTpl").value;
        const lv = document.getElementById("dpAlLv").value;
        const onEl = document.getElementById("dpAlOn");
        const on = onEl ? onEl.checked : true;
        const chs = Array.from(document.querySelectorAll(".dpAlCh:checked")).map(c => c.value);
        if (!name) { toast("名称必填"); return; }
        if (!cond) { toast("触发条件必填"); return; }
        const condBad = dpAlertCondCheck(cond);
        if (condBad) { toast(condBad); return; }
        if (!chs.length) { toast("至少选择一个通知渠道"); return; }
        const dup = DP.alerts.filter(v => v.name === name && (!a || v.id !== a.id))[0];
        if (dup) { toast("已存在同名规则「" + name + "」：同名规则在记录里无法区分，请改用其他名称"); return; }
        if (a) { a.name = name; a.cond = cond; a.tpl = tpl; a.ch = chs; a.lv = lv; a.on = on; if (!a.preset) a.src = src; }
        else DP.alerts.push({ id: "al" + (DP._alSeq++), name: name, src: src, cond: cond, tpl: tpl, ch: chs, lv: lv, on: on, preset: false });
        /* 新增 / 改域后，命中的规则可能落在当前「来源域」筛选之外（列表看不到结果）⇒ 复位筛选 */
        const landedSrc = a ? (a.preset ? a.src : src) : src;
        const filterCleared = !!DP.alSrc && DP.alSrc !== landedSrc;
        if (filterCleared) DP.alSrc = "";
        dpLog("全局", (a ? "更新" : "新增") + "告警规则「" + name + "」（级别 " + lv + " · " + (on ? "启用" : "停用") + "）");
        dpSave(); closeDlg(); renderDpAlert();
        toast((a ? "告警规则已更新" : "告警规则已新增") + (filterCleared ? "（已清除来源域筛选以便查看）" : ""));
      };
      break;
    }
    case "dpAlertChanCfg": {
      const c = dpChanById(el.dataset.id);
      const sp = c ? dpChanSpec(c.kind) : null;
      if (!c || !sp) break;
      const nm = dpChanName(c.kind);
      openDlg("配置通知渠道 · " + nm, sp.d + " 连接参数在台账内只存一份，引用该渠道的全部规则共用本配置。", `
        <div class="fld"><label>渠道与类型</label><input value="${esc(nm)}（${esc(dpChanType(c.kind))}）" readonly title="渠道类型在建立台账时确定，不可更改"></div>
        <div id="dpChanFields" data-chan-kind="${esc(c.kind)}">${sp.fields.map(f => dpChanFieldHtml(f, c.cfg || {})).join("")}</div>`, "lg");
      /* 条件必填（need）随被依赖字段联动：change 后读回当前值重渲染，已输入内容不丢（label for 随渲染输出） */
      const _body = document.getElementById("dlg1Body");
      if (_body && !_body._chanNeedBound) {
        _body._chanNeedBound = 1;
        _body.addEventListener("change", function (ev) {
          const t = ev.target;
          if (!t || !t.dataset || !t.dataset.chanFld) return;
          const box = document.getElementById("dpChanFields");
          if (!box) return;
          const _sp = dpChanSpec(box.dataset.chanKind);
          if (!_sp) return;
          box.innerHTML = _sp.fields.map(function (f) { return dpChanFieldHtml(f, dpChanReadCfg(_sp, c.cfg)); }).join("");
        });
      }
      document.getElementById("dlg1Ok").onclick = () => {
        const next = dpChanReadCfg(sp, c.cfg);
        const miss = dpChanMissing({ kind: c.kind, on: c.on, cfg: next });
        if (miss.length) { toast("必填项未完成：" + miss.join(" / ")); return; }
        /* 只改配置内容、不改生效面 ⇒ 普通确认（生效面启停另在列表开关上走二次认证） */
        confirmDlg("保存通知渠道配置", "将保存「<b>" + esc(nm) + "</b>」的连接参数；引用该渠道的全部规则共用本配置，后续告警按新参数投递。", () => {
          c.cfg = next;
          dpLog("全局", "更新通知渠道「" + nm + "」配置");
          dpSave(); closeDlg(); alertHostRefresh();
          toast("通知渠道「" + nm + "」配置已保存");
        }, "保存");
      };
      break;
    }
    case "dpAlertChanTest": {
      const c = dpChanById(el.dataset.id);
      const sp = c ? dpChanSpec(c.kind) : null;
      if (!c || !sp) break;
      const nm = dpChanName(c.kind);
      const miss = dpChanMissing(c);
      if (miss.length) { toast("「" + nm + "」配置不完整（缺：" + miss.join(" / ") + "）—— 请先补全再测试发送"); break; }
      /* 测试发送不改变渠道与规则状态 ⇒ 与规则测试同口径：只留一条审计、不改触发时间 */
      dpLog("全局", "测试发送通知渠道「" + nm + "」（不改变启用状态与规则触发时间）");
      dpSave(); alertHostRefresh();
      toast(c.kind === "inapp"
        ? "站内信为平台内置渠道：测试消息已投递到站内信通知中心（不对外发送，无连通性校验）"
        : "已向「" + nm + "」发送测试告警" + (c.on ? "" : "（该渠道当前已停用：本次仅验证配置，不恢复投递）")
          + " · 测试下发只落一条操作审计、不写入告警记录");
      break;
    }
    case "dpAlertChanGo": {
      /* 2026-10-13：「系统配置」模块 —— 渠道连接参数与启停 / 测试统一在通知渠道配置页维护，
         告警页页签只呈现摘要与后果，此处为唯一跳转入口。 */
      location.href = "sys-notify-channel.html";
      break;
    }
    case "dpAlertDel": {
      const a = DP.alerts.find(v => v.id === el.dataset.id);
      if (!a || a.preset) break;
      ask2FA(`删除告警规则（${a.name}）`, () => {
        DP.alerts = DP.alerts.filter(v => v.id !== a.id);
        dpLog("全局", "删除告警规则「" + a.name + "」");
        dpSave(); renderDpAlert();
        toast("告警规则「" + a.name + "」已删除（已落操作审计）");
      }, null, "删除后该防护域不再按此规则触发通知；规则不可恢复（预置模板不可删除）。");
      break;
    }

    /* ---- 告警记录（页签③）：筛选 / 勾选 / 状态流转 ---- */
    case "dpAlertRecGo": {
      /* 统计卡下钻：切到记录页，并落一个够用的初筛（data-v="open" = 未处理全部时间窗） */
      DP.alTab = "dpAlertRec";
      DP.alRecSrc = ""; DP.alRecSel = {}; DP.alRecPage = 1;
      if (el.dataset.v === "open") { DP.alRecRange = "all"; DP.alRecSt = "open"; }
      dpSave(); renderDpAlert();
      break;
    }
    case "dpAlertRecRange": DP.alRecRange = el.dataset.v; DP.alRecPage = 1; DP.alRecSel = {}; dpSave(); renderDpAlert(); break;
    case "dpAlertRecStF": DP.alRecSt = el.dataset.v; DP.alRecPage = 1; DP.alRecSel = {}; dpSave(); renderDpAlert(); break;
    case "dpAlertRecSrcF": DP.alRecSrc = el.dataset.v; DP.alRecPage = 1; DP.alRecSel = {}; dpSave(); renderDpAlert(); break;
    /* 勾选是纯视图态（不落盘）：每次重渲染按 DP.alRecSel 回填，避免 40KB 状态对象空转序列化 */
    case "dpAlertRecSel": {
      DP.alRecSel = DP.alRecSel || {};
      if (el.checked) DP.alRecSel[el.dataset.id] = true; else delete DP.alRecSel[el.dataset.id];
      renderDpAlert();
      break;
    }
    case "dpAlertRecAck":
    case "dpAlertRecIgn": {
      const r = DP.alRecs.find(v => v.id === el.dataset.id);
      if (!r || r.st !== "open") break;
      dpAlertRecMark([r], act === "dpAlertRecAck" ? "ack" : "ignore", false);
      break;
    }
    case "dpAlertRecRs": {
      const r = DP.alRecs.find(v => v.id === el.dataset.id);
      if (!r || r.st === "open") break;
      r.st = "open"; r.by = ""; r.ackAt = "";
      dpLog("全局", "告警记录「" + dpAlertRecName(r) + " · " + r.at + "」转回未处理");
      dpSave(); closeDlg(); renderDpAlert();
      toast("已转回未处理：" + dpAlertRecName(r) + " · " + r.at);
      break;
    }
    case "dpAlertRecBatch": {
      const ids = Object.keys(DP.alRecSel || {});
      const hit = DP.alRecs.filter(r => r.st === "open" && ids.indexOf(r.id) >= 0);
      if (!hit.length) { toast("请先勾选「未处理」的记录（勾选只作用于当前页）"); break; }
      dpAlertRecMark(hit, "ack", true);
      break;
    }
    case "dpAlertRecPick": {
      const r = DP.alRecs.find(v => v.id === el.dataset.id);
      if (r) dpAlertRecDlg(r);
      break;
    }

    /* ---- 检测项参数：清除本资产的覆盖，回到跟随全局 ---- */
    case "dpDetInherit": {
      const cur = dpCurObj();
      if (!cur || cur.deny) break;
      const d = el.dataset.det;
      const det = DP_DETS.find(x => x.k === d) || { n: d };
      confirmDlg("恢复继承全局默认", "将清除检测项「<b>" + esc(det.n) + "</b>」在本资产的参数覆盖，回到跟随<b>全局默认</b>；" +
        "<b>本次变更入审计</b>。", () => {
        dpMutateCurCfg(cfg => { if (cfg.dpar && cfg.dpar[d]) delete cfg.dpar[d]; },
          "清除检测项「" + det.n + "」的逐资产参数覆盖（恢复继承）", { path: "det" });
        renderDpPolicy();
        toast("已恢复继承全局默认：「" + det.n + "」");
      }, "确认恢复");
      break;
    }

    /* ---- 对抗能力（五页签的保存并下发 / 恢复默认） ---- */
    case "dpArmsTokSave": dpArmsCommit("tok"); break;
    case "dpArmsTokReset": dpArmsRestore("tok"); break;
    case "dpArmsInjSave": dpArmsCommit("inj"); break;
    case "dpArmsInjReset": dpArmsRestore("inj"); break;
    case "dpArmsVerSave": dpArmsCommit("ver"); break;
    case "dpArmsVerReset": dpArmsRestore("ver"); break;
    case "dpArmsChaSave": dpArmsCommit(["cha", "hum"]); break;
    case "dpArmsChaReset": dpArmsRestore(["cha", "hum"]); break;
    case "dpArmsTplSave": dpArmsCommit("tpl"); break;
    case "dpArmsTplReset": dpArmsRestore("tpl"); break;
    case "dpArmsTokDiscard": dpArmsDiscard("tok"); break;
    case "dpArmsInjDiscard": dpArmsDiscard("inj"); break;
    case "dpArmsVerDiscard": dpArmsDiscard("ver"); break;
    case "dpArmsChaDiscard": dpArmsDiscard(["cha", "hum"]); break;
    case "dpArmsTplDiscard": dpArmsDiscard("tpl"); break;
    default: break;
  }
}, false);

/* ---- 通知渠道配置弹窗：表单字段由 DP_CHAN_SPEC.fields 派生（新增字段只改规格表，此处不硬编码）---- */
function dpChanFieldHtml(f, cfg) {
  const v = cfg && cfg[f.k] !== undefined ? cfg[f.k] : (f.dflt !== undefined ? f.dflt : "");
  const _needNow = f.req || (f.need && String((cfg || {})[f.need] === undefined ? "" : (cfg || {})[f.need]) !== "无");
  const req = _needNow ? '<span class="req">*</span>' : "";
  const help = f.help ? `<div class="help">${esc(f.help)}</div>` : "";
  const unit = f.u ? ` <span class="muted" style="font-size:12.5px">${esc(f.u)}</span>` : "";
  let ctl;
  if (f.t === "bool") {
    ctl = `<label style="font-weight:400;display:inline-flex;align-items:center;gap:6px"><input type="checkbox" id="dpCf_${f.k}" data-chan-fld="1" ${v ? "checked" : ""}> 启用</label>`;
  } else if (f.t === "num") {
    ctl = `<input type="number" id="dpCf_${f.k}" data-chan-fld="1" class="mini-inp" min="1" value="${esc(String(v))}">` + unit;
  } else if (f.t === "sel") {
    ctl = `<select id="dpCf_${f.k}" data-chan-fld="1">${(f.opts || []).map(o => `<option ${String(v) === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  } else if (f.pw) {
    /* ★ R8：**口令 / Token 一律不回填** —— 原实现把现值写进 value 属性，明文因此进入 DOM HTML
       （查看源代码 / 导出页面即可拿到凭据），与「列表与摘要不回显凭据」的自称口径也不一致。
       现值恒为空串，placeholder 区分「已设置 / 未设置」；读回时「空 = 保留原值」（见 dpChanReadCfg）。 */
    ctl = `<input id="dpCf_${f.k}" data-chan-fld="1" type="password" value="" autocomplete="new-password" placeholder="${esc((cfg && cfg[f.k]) ? "已设置 · 留空表示不修改" : (f.ph || "未设置"))}">`;
  } else {
    ctl = `<input id="dpCf_${f.k}" data-chan-fld="1" type="text" value="${esc(String(v))}" placeholder="${esc(f.ph || "")}">`;
  }
  const forAttr = f.t === "bool" ? "" : ' for="dpCf_' + f.k + '"';
  return `<div class="fld"${f.wide ? ' style="flex:1 1 100%"' : ""}><label${forAttr}>${esc(f.l)}${req}</label>${ctl}${help}</div>`;
}
/* 读配置弹窗取值：按字段类型归一（bool → 布尔；num → 数字或空串；其余 → 去除首尾空白）
   ★ R8：pw 字段留空 = **保留原值**（`prev` = 该渠道当前配置）。口令不回填之后，留空若读成
   「清空」，则编辑任一非密钥字段都会把密钥抹掉、渠道立刻被判「配置不完整」—— 这是必须配套的另一半。 */
function dpChanReadCfg(sp, prev) {
  const cfg = {};
  const old = prev || {};
  sp.fields.forEach(f => {
    const inp = document.getElementById("dpCf_" + f.k);
    if (!inp) return;
    if (f.t === "bool") cfg[f.k] = !!inp.checked;
    else if (f.t === "num") { const t = inp.value.trim(); cfg[f.k] = t === "" ? "" : Number(t); }
    else { const t = inp.value.trim(); cfg[f.k] = (f.pw && t === "") ? (old[f.k] === undefined ? "" : old[f.k]) : t; }
  });
  return cfg;
}
/* 开关 / 下拉类控件（change 委派）：主开关 / 检测项 / 告警启停 / 列表筛选 / 档位编辑联动 */
document.addEventListener("change", function (e) {
  const el = e.target && e.target.closest ? e.target.closest("[data-dpsw],[data-dpsel],[data-band],[data-dpaw],[data-dpasel],[data-dparam],[data-dptpl]") : null;
  if (!el) return;
  dpLoad();

  /* 事件流 · 防护对象过滤 */
  if (el.dataset.dpsel === "ovAsset") {
    DP.ovAsset = el.value || null;
    DP.ovPage = 1; DP.ovTab = "dpOvFlow";
    dpSave(); renderDpOverview();
    return;
  }
  /* 防护策略 · 列表筛选（关键词回车 / 组织 / 状态） */
  if (el.dataset.dpsel === "polKw") {
    DP.polKw = el.value;
    DP.polPage = 1;
    dpSave(); renderDpPolicy();
    return;
  }
  if (el.dataset.dpsel === "polGrp") {
    DP.polGrp = el.value;
    DP.polPage = 1;
    dpSave(); renderDpPolicy();
    return;
  }
  if (el.dataset.dpsel === "polSt") {
    DP.polSt = el.value;
    DP.polPage = 1;
    dpSave(); renderDpPolicy();
    return;
  }
  /* A2-05：操作身份切换（演示）—— 只改记录的操作人与审批权限判据 */
  if (el.dataset.dpsel === "exRole") {
    DP.actor = el.value || "张伟";
    dpSave(); renderDpPolicy();
    toast("操作身份已切换为「" + DP.actor + "」（演示）");
    return;
  }
  /* 行为基线 · 主体清单的检索与筛选（change 委派：回车 / 失焦触发，与策略列表同范式） */
  if (el.dataset.dpsel === "baseKw") { DP.base.kw = el.value; DP.base.page = 1; dpSave(); renderDpBaseline(); return; }
  if (el.dataset.dpsel === "baseDim") { DP.base.dimFilter = el.value || ""; DP.base.page = 1; dpSave(); renderDpBaseline(); return; }
  if (el.dataset.dpsel === "baseSt") { DP.base.stFilter = el.value || ""; DP.base.page = 1; dpSave(); renderDpBaseline(); return; }
  if (el.dataset.dpsel === "baseSort") { DP.base.sort = el.value || "dev"; DP.base.page = 1; dpSave(); renderDpBaseline(); return; }
  /* 档位编辑 → 预览条联动（不落库，仅预览与即时校验提示） */
  if (el.dataset.band != null) {
    const bands = dpReadBands();
    const chk = dpBandsOk(bands);
    const pv = document.getElementById("dpBandPreview");
    if (pv && bands) pv.innerHTML = dpBandPreview(bands, chk.err ? chk.idx : -1);
    const errEl = document.getElementById("dpPolBandErr");
    if (errEl) errEl.textContent = chk.err ? ("当前编辑：" + chk.err) : "";
    return;
  }

  /* 防护策略 · 检测项与参数逐资产覆盖：只写差异；与全局同值即不落覆盖 */
  if (el.dataset.dparam != null) {
    const cur = dpCurObj();
    if (!cur || cur.deny) return;
    const seg = String(el.dataset.dparam).split(".");
    const def = dpDetParamDef(seg[0]);
    const p = def && def.ks.find(x => x.k === seg[1]);
    if (!p || dpDetFixed(p)) return;   /* 口径固定值参数无控件、不可覆盖（防伪造 DOM 注入写入） */
    const raw = p.t === "sw" ? !!el.checked : el.value;
    const detN = (DP_DETS.find(x => x.k === seg[0]) || {}).n || seg[0];
    dpMutateCurCfg(cfg => {
      if (!cfg.dpar) cfg.dpar = {};
      if (!cfg.dpar[seg[0]]) cfg.dpar[seg[0]] = {};
      if (String(dpDetGlobal(p)) === String(raw)) delete cfg.dpar[seg[0]][seg[1]];
      else cfg.dpar[seg[0]][seg[1]] = /^-?\d+$/.test(String(raw)) ? parseInt(raw, 10) : raw;
      if (!Object.keys(cfg.dpar[seg[0]]).length) delete cfg.dpar[seg[0]];
    }, "调整检测项「" + detN + "」的逐资产参数覆盖", { path: "det" });
    renderDpPolicy();
    toast("检测项参数已更新（" + detN + "）· 已入待下发队列");
    return;
  }
  /* 防护策略 · 场景化模板启停（显式覆盖；启用同时写入该模板的参数组合） */
  if (el.dataset.dptpl != null) {
    const cur = dpCurObj();
    if (!cur || cur.deny) return;
    const k = el.dataset.dptpl;
    const on = !!el.checked;
    const t = DP_TPLS.find(x => x.k === k) || { n: k };
    dpMutateCurCfg(cfg => {
      if (!cfg.tpl) cfg.tpl = {};
      cfg.tpl[k] = on;
      if (!cfg.dpar) cfg.dpar = {};
      const pre = DP_TPL_PRESET[k] || {};
      Object.keys(pre).forEach(d => {
        const pd = dpDetParamDef(d);
        if (!cfg.dpar[d]) cfg.dpar[d] = {};
        Object.keys(pre[d]).forEach(x => {
          const q = pd && pd.ks.find(y => y.k === x);
          /* 与全局默认同值即不落覆盖（与检测项参数控件同一去重纪律）——
             否则会落下「看起来覆盖了其实一样」的假覆盖，虚增「参数覆盖」计数。 */
          /* 停用只回滚「本模板落的那个值」—— 原先无条件 delete 会连带抹掉用户手动覆盖的同名参数。
             启用路径不变：仍按「与全局默认同值不落覆盖」去重，杜绝假覆盖。 */
          if (on) {
            if (q && String(dpDetGlobal(q)) !== String(pre[d][x])) cfg.dpar[d][x] = pre[d][x];
          } else if (q && cfg.dpar[d][x] != null && String(cfg.dpar[d][x]) === String(pre[d][x])) {
            delete cfg.dpar[d][x];
          }
        });
        if (!Object.keys(cfg.dpar[d]).length) delete cfg.dpar[d];
      });
    }, (on ? "启用" : "停用") + "场景化防护模板「" + t.n + "」", { path: "det" });
    renderDpPolicy();
    /* 空 preset 模板不得谎称「参数组合已写入本资产」—— 扫号 / 薅羊毛的动作沿用全局默认，
       差异由**判据范围**承载；如实分档陈述。 */
    const hadPre = !!Object.keys(DP_TPL_PRESET[k] || {}).length;
    toast("模板「" + t.n + "」已" + (on
      ? (hadPre ? "启用（参数组合已写入本资产）" : "启用（参数沿用全局默认 · 差异由判据范围承载）")
      : "停用") + " · 已入待下发队列");
    return;
  }
  /* 对抗能力页 · 五页签的开关与下拉（路径形式 tok.ttl / cha.interact → 直接写 DP.arms） */
  if (el.dataset.dpaw != null) {
    const seg = String(el.dataset.dpaw).split(".");
    if (seg.length === 2 && DP.arms[seg[0]] && Object.prototype.hasOwnProperty.call(DP.arms[seg[0]], seg[1])) {
      DP.arms[seg[0]][seg[1]] = !!el.checked;
      if (DP.arms.dirty && typeof DP.arms.dirty === "object") DP.arms.dirty[seg[0]] = true;
      /* 留痕口径与「防护策略 · 检测项与参数」一致：参数一改即留痕 ——
         草稿态跨会话保留，不留痕会让「最近配置变更」与真实改动脱节。 */
      dpLog("全局", "调整对抗能力参数「" + seg[0] + "." + seg[1] + "」");
      dpSave(); renderDpArms();
      /* ★ A4-I2：本页任一参数变更即整页重建，DOM 节点被替换 ⇒ 焦点必丢。按路径在新 DOM 上归位，
         使键盘用户连续调参无需重新 Tab 定位。 */
      const _againW = document.querySelector('[data-dpaw="' + el.dataset.dpaw + '"]');
      if (_againW && _againW.focus) _againW.focus();
      toast("对抗能力参数已更新 · 已入待下发队列");
    }
    return;
  }
  if (el.dataset.dpasel != null) {
    const seg = String(el.dataset.dpasel).split(".");
    if (seg.length === 2 && DP.arms[seg[0]] && Object.prototype.hasOwnProperty.call(DP.arms[seg[0]], seg[1])) {
      const raw = el.value;
      DP.arms[seg[0]][seg[1]] = /^-?\d+$/.test(raw) ? parseInt(raw, 10) : raw;
      if (DP.arms.dirty && typeof DP.arms.dirty === "object") DP.arms.dirty[seg[0]] = true;
      dpLog("全局", "调整对抗能力参数「" + seg[0] + "." + seg[1] + "」");
      dpSave(); renderDpArms();
      /* ★ A4-I2：同上 —— 下拉变更后按路径归位焦点 */
      const _againS = document.querySelector('[data-dpasel="' + el.dataset.dpasel + '"]');
      if (_againS && _againS.focus) _againS.focus();
      toast("对抗能力参数已更新 · 已入待下发队列");
    }
    return;
  }

  const key = el.dataset.dpsw;
  if (!key) return;
  if (key === "main") {
    const cur = dpCurObj();
    if (!cur || cur.deny) { el.checked = !el.checked; return; }
    /* ★ 2026-10-09 用户裁定（二次认证范围）：主开关是**启停类**动作 —— 决定该对象是否受动态
       防护，与「资产启用 / 停用」完全同型（后者全站一律 ask2FA），故由普通确认**提为二次认证**。
       主开关同时是全站唯一「即时下发」路径（一拨即推送全部网关、无待下发队列可撤）。
       ⚠ 先回滚开关再弹窗：认证弹窗期间界面不得呈现「未认证却已生效」的错觉；`cancel`
         回调再兜一次（幂等），认证通过后由 renderDpPolicy 重渲染为已变。 */
    const on = el.checked;
    el.checked = !on;
    ask2FA(on ? "启用动态防护「" + cur.name + "」" : "关闭动态防护「" + cur.name + "」",
      () => {
        dpMutateCurCfg(cfg => { cfg.on = on; }, (on ? "启用" : "关闭") + "动态防护", { ship: true, path: "main" });
        /* 启用即记启用日期：冷启动观察期由「启用日期 + 观察期」推导（新纳入对象此前无 onAt） */
        if (on && !DP.objs[cur.id].onAt) { DP.objs[cur.id].onAt = DP_TODAY; dpSave(); }
        /* ★ 2026-10-10（R27 · C-3）：同步「客体主体集合」—— 否则新启用的对象不入客体基线、
           「客体 N / 冷启动卡」与「已启用对象」两处漂移（判据 ④）。 */
        dpSyncAssetSubs();
        /* 对象主开关是**即时生效**语义：启用 / 停用本身就是一次下发动作，不留「待下发」队列
           （原实现只入队不推送，徽标永远停在待下发，且开关状态与页面显示相互矛盾）。 */
        renderDpPolicy();
        dpShip();
        toast(on ? "动态防护已启用并下发" : "动态防护已关闭并下发");
      },
      () => { el.checked = !on; },
      on
        ? "将把「<b>" + esc(cur.name) + "</b>」纳入动态防护：此后其流量按本资产的检测项与评分档位评分处置。" +
          "<b>即时推送全部网关节点 · 热生效 ≤2s · 不触发 reload</b>。<b>本次变更入审计</b>。"
        : "将关闭「<b>" + esc(cur.name) + "</b>」的动态防护：<b>即时推送全部网关节点 · 热生效 ≤2s</b>。" +
          "此后该对象不再评分、不再处置（已建立的行为基线保留）。<b>本次变更入审计</b>。");
    return;
  } else if (key.slice(0, 4) === "det.") {
    const k = key.slice(4);
    const cur = dpCurObj();
    if (!cur || cur.deny) { el.checked = !el.checked; return; }
    /* 检测项名取单源表（不硬编码字面量）；启停属对象配置改动，与参数覆盖同一留痕口径 */
    const detNm = (DP_DETS.find(x => x.k === k) || { n: k }).n;
    dpMutateCurCfg(cfg => { cfg.det[k] = el.checked; },
      (el.checked ? "启用" : "停用") + "检测项「" + detNm + "」", { path: "det" });
    toast("检测项已" + (el.checked ? "启用" : "停用") + " · 已入待下发队列");
    renderDpPolicy();
  } else if (key.slice(0, 6) === "alert.") {
    const a = DP.alerts.find(v => v.id === key.slice(6));
    if (a) {
      /* ★ 2026-10-12（R57 · 交-9）：告警规则启停原为**零确认** —— 直接改 a.on 并即时保存，
         而本页脚注自陈「规则本身的启停与删除仍按二次认证执行」、删除侧（dpAlertDel）亦确为
         ask2FA ⇒ 文案承诺与实现相反。按全站判据（改变生效面 ⇒ 二次认证）与同页主开关（main）
         同型处理：先回滚开关（认证期间不得呈现「未认证却已生效」），取消回调再兜一次幂等回滚。 */
      const on = el.checked;
      el.checked = !on;
      ask2FA((on ? "启用" : "停用") + "告警规则「" + a.name + "」",
        () => {
          a.on = on;
          dpLog("全局", (on ? "启用" : "停用") + "告警规则「" + a.name + "」");
          dpSave(); renderDpAlert();
          toast("告警规则「" + a.name + "」已" + (on ? "启用" : "停用") + "（已落操作审计）");
        },
        () => { el.checked = !on; },
        on
          ? "该规则将<b>重新参与风险事件触发</b>：命中条件即产生告警并按通知渠道投递。<b>本次变更入审计</b>。"
          : "该规则将<b>停止触发</b>：命中条件不再产生告警（已产生的历史记录保留）。<b>本次变更入审计</b>。");
    }
  } else if (key.slice(0, 5) === "chan.") {
    const ch = dpChanById(key.slice(5));
    if (ch) {
      /* ★ 通知渠道启停属**改变生效面**（决定该渠道是否参与投递）—— 与规则启停 / 主开关同型，
         按全站判据走二次认证；先回滚开关再弹窗（认证期间不得呈现「未认证却已生效」）。 */
      const on = el.checked;
      el.checked = !on;
      const nm = dpChanName(ch.kind);
      const refN = dpChanRules(nm).length;
      ask2FA((on ? "启用" : "停用") + "通知渠道「" + nm + "」",
        () => {
          ch.on = on;
          dpLog("全局", (on ? "启用" : "停用") + "通知渠道「" + nm + "」");
          dpSave(); alertHostRefresh();
          toast("通知渠道「" + nm + "」已" + (on ? "启用" : "停用") + "（已落操作审计）");
        },
        () => { el.checked = !on; },
        on
          ? "该渠道将<b>参与告警投递</b>：命中规则产生告警时按其连接参数发送"
            + (refN ? "（当前被 " + refN + " 条规则引用）" : "（当前无规则引用，启用后需在规则中勾选）")
            + "。<b>本次变更入审计</b>。"
          : "该渠道将<b>停止投递</b>：命中时跳过该渠道，其余渠道不受影响（已产生的历史记录保留）"
            + (refN ? "；<b>当前有 " + refN + " 条规则引用本渠道</b>" : "") + "。<b>本次变更入审计</b>。");
    }
  }
}, false);

