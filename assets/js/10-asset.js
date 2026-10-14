/* ==========================================================================
   白泽零信任 · 资产管理原型 · 共享脚本
   --------------------------------------------------------------------------
   由《原型-资产管理-20260907.html》单文件拆分而来（2026-09-20）。
   内容 = 原三个 <script> 块按原顺序拼接，仅追加「多页外壳适配层」与「顶层接线兜底」：
     · 原三段脚本同处全局词法作用域，拼接后语义不变（§ 见下方保留原样）。
     · 单元素顶层接线统一改为 bind(sel,fn)：元素不在本页时静默跳过。
     · 跨页跳转统一走 goPage：跳转前把演示数据落盘 localStorage（key: baize.assetmgmt.demo.v1）。
   ========================================================================== */

const PG_CUR = (document.body && document.body.dataset.page) || "pg-list";
const PG_FILE = {
  "pg-list": "index.html", "pg-detail": "asset-detail.html", "pg-edit": "asset-edit.html",
  "pg-cred": "cred-hosting.html", "pg-asp": "access-policy.html",
  "pg-fg": "fine-grained.html", "pg-fgreq": "access-requirement.html",
  "pg-websec": "web-security-policy.html",
  "pg-rate": "rate-limit-policy.html", "pg-reqcon": "request-constraint.html",
  "pg-rulelib": "rule-library.html",
  /* 2026-09-29：原「认证族」7 页已从本原型撤除，改由全新的「身份」「认证」两模块承接。
     2026-09-30：身份适配不再是独立页 —— 它是「资产详情 / 资产编辑」的页签（t6），
     随资产对象走，故此处不留条目（唯一配置面 = 资产详情的身份适配页签）。 */
  /* 2026-09-29：新增「身份」6 页 —— 用户 / 终端 / 客户端软件 / 客户端实例 /
     智能体软件 / 智能体实例。粒度口径：软件级登记（软件 + 版本列表）与
     实例级注册（终端 + License 证书）是两个层级，勿混。 */
  "pg-iduser": "identity-user.html",
  "pg-idterm": "identity-terminal.html",
  "pg-idcsw": "identity-clientsw.html",
  "pg-idcin": "identity-clientinst.html",
  "pg-idagsw": "identity-agentsw.html",
  "pg-idagin": "identity-agentinst.html",
  /* 2026-09-29：新增「认证」6 页 —— 方式字典 / 认证源 / 网关凭据托管 /
     用户代填账号托管 / 签发凭据管理 / 强认证器绑定管理。 */
  "pg-audict": "auth-dict.html",
  "pg-ausrc": "auth-source.html",
  "pg-auusercred": "auth-user-cred.html",
  "pg-auissue": "auth-issue.html",
  "pg-auauthr": "auth-authenticator.html",
  /* 2026-09-30：新增「动态防护」3 页（二期口径第一批）—— 防护总览 / 防护策略 / 行为基线；
     另有公共页「风险事件告警」（pg-alert，覆盖各防护域，不属动态防护模块）。
     2026-10-08：增第 4 页「对抗能力」（pg-dparms）—— 二期 F1.1 / F1.2 的参数面与效果面。 */
  "pg-dpov": "dp-overview.html",
  "pg-dppol": "dp-policy.html",
  "pg-dpbase": "dp-baseline.html",
  "pg-dparms": "dp-arms.html",
  "pg-alert": "alert-events.html",
  "pg-login": "login.html"
};
const DEMO_KEY = "baize.assetmgmt.demo.v1";
/* ★ 2026-10-10（R27）：演示数据版本 —— **改动本段种子（ASSETS / POLICIES / CRED_LIST / CA_LIST /
   MTLS_LIST）必须同轮递增**。原 `saveDemoState` 已写 `schema` 却**无人读**（旧注释称「供将来
   迁移分叉」）⇒ 改种子后旧档照样覆盖，用户始终看到改前的数据。此处与认证段（au-*）/ 身份段
   （id-*）/ 动态防护段（DP_VER）的判版纪律对齐：`loadDemoState` 遇版本不符即**整档丢弃**、
   回落当前种子（与「重置演示数据」同效）。 */
const DEMO_SCHEMA = 5;   /* 5：R55 收敛 ABAC 取值域 —— user.role 条件字面量改台账域词、
                            client.software 引用改身份台账 id（sw_bz → sw_baize_pc） */

/* 跨页跳转的唯一出口：先落盘演示数据，再改地址栏。
   —— 「资产列表 / 详情 / 向导 / 网关凭据托管 / 策略族（含 Web 安全防护策略的三子页）/ 规则库」
       之间的一切切换都经过这里。
   2026-09-29：原「认证族」7 页从本原型撤除，改由「身份」「认证」两模块承接；
   2026-09-30：身份适配由独立页改为**资产详情页签（t6）**，不再经此处跨页跳转。 */
function goPage(id, params) {
  saveDemoState();
  let url = PG_FILE[id] || "index.html";
  if (params) { const qs = new URLSearchParams(params).toString(); if (qs) url += "?" + qs; }
  location.href = url;
}
/* 顶层接线兜底：多页化后每页只保留自己的容器，缺元素时静默跳过（不再抛 null 异常）。 */
function bind(sel, fn) { const el = document.querySelector(sel); if (el) fn(el); }

/* 字段级错误态（全站统一口径）：校验失败给输入框加 .bad（红框）并聚焦；
   同时挂一枚「输入即清除」的一次性监听 —— 错误态不滞留，与登录页 .bad 行为一致。
   ⚠ 只在这里兜一次：此前各处校验只 toast，输入框无任何视觉反馈（2026-09-20 评审发现）。 */
function markBad(id, on) {
  const e = typeof id === "string" ? document.getElementById(id) : id;
  if (!e) return;
  e.classList.toggle("bad", !!on);
  /* ★ 2026-10-10（R13）：错误态此前只有 .bad 红框（纯视觉）⇒ 读屏用户无感，补 aria-invalid。 */
  try { if (on) { e.setAttribute("aria-invalid", "true"); } else { e.removeAttribute("aria-invalid"); } } catch (_e1) { /* 忽略 */ }
  if (on) {
    /* ★ 2026-10-10（R14）：一次性监听原先只清 .bad 红框、**不清 aria-invalid** ⇒ 用户已改正，
       读屏仍在该字段上持续播报「无效」。清除路径必须与设置路径成对。 */

    /* ★ 2026-10-12（R58 · 交-2）：原监听为 `{ once: true }` 的**追加**式 —— 同一字段每轮校验各挂一枚，
       连点 N 次「确定」即累积 N 枚，下次输入 N 个回调齐发（虽幂等，但属无谓开销且随点击线性增长）。
       改为**一次性绑定 + 元素标志位**：同一元素至多挂一枚。 */
    if (!e.__mbBound) { e.__mbBound = 1; e.addEventListener("input", () => { e.classList.remove("bad"); try { e.removeAttribute("aria-invalid"); } catch (_e2) { /* 忽略 */ } }); }
    /* ★ 2026-10-11（R17）：一轮校验里多字段同时标红时，原实现每个 markBad 都 focus() ⇒ 焦点停在
       **最后一个**失败字段，用户自上而下修表要先 Shift+Tab 退回。改为「同轮只聚焦首个失败字段」：
       布尔锁在下一个宏任务（即用户下一次操作之前）自动释放。 */
    if (e.focus && !window.__mbFocusLock) {
      window.__mbFocusLock = 1;
      try { e.focus(); } catch (_e) { /* 元素不可聚焦：忽略 */ }
      setTimeout(function () { window.__mbFocusLock = 0; }, 0);
    }
  }
}
window.markBad = markBad;

/* ---- 控制面登录态（入口门禁） ------------------------------------------------
   · 登录页是唯一入口：未登录访问任一业务页 → 跳 login.html?back=<原页>，登录后回跳原页。
   · 登录态与演示数据用两个 key，语义互不相干：「重置演示数据」不清登录态，
     「退出登录」也不清演示数据（换人评审时两种诉求不同）。
   · 凭据口径：账号 + 密码，提交前按平台既有口径以 SM2 加密（与原型内「删除资产」等
     二次认证弹窗同一说法）。本原型不实现真实加密与校验，演示账号见登录页提示。 */
/* ★ R61·轮16：`YYYY-MM-DD` **真值校验**（格式 + 日历往返）。
   此前 8 处校验点只做 `/^\d{4}-\d{2}-\d{2}$/` 形态匹配 ⇒ `2027-02-30` / `2026-13-01`
   / `2026-04-31` 一律放行；这些串落库后被 `credExpSt()` 等按**字典序**派生状态
   ⇒ 「不存在的日期」被当成有效日期展示、参与「即将过期」判定。
   本助手由信任锚 / mTLS 证书 / License / 签发凭据四类共用，日期口径单一。 */
function bzYmdOk(s) {
  const t = String(s == null ? "" : s).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const y = +t.slice(0, 4), m = +t.slice(5, 7), d = +t.slice(8, 10);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
const SESSION_KEY = "baize.assetmgmt.session.v1";
/* ⚠ localStorage 在**隐私模式 / 配额不足**时会抛异常；旧写法 catch 后静默丢弃 ⇒
   登录「成功」但登录态没落盘，跳回业务页又被门禁踢回登录页，形成 ping-pong（用户表现为「登不进去」）。
   故补一层**内存兜底**：localStorage 不可用时，登录态至少在本页生命周期内有效。 */
let _sessionMem = null;
function getSession() {
  try { const s = localStorage.getItem(SESSION_KEY); if (s) return JSON.parse(s); } catch (e) { /* 落到内存兜底 */ }
  return _sessionMem;
}
function setSession(o) {
  _sessionMem = o;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(o)); } catch (e) { /* 内存兜底已生效 */ }
}
function clearSession() {
  _sessionMem = null;
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}
/* ★ R61（轮6）：顶栏操作者随会话回填。
   原实现：31 个壳页把顶栏写死为「安全管理员 张伟」，而 `opUser()`（审计署名）
   与 `authRole()`（角色判定）都以**顶栏文本为权威取值** ⇒ 登录任意账号后署名恒为「张伟」、
   角色恒为「安全管理员」，且与身份台账（张伟 = 系统管理员、王芳 = 安全管理员）自相矛盾。
   现按会话身份显示：会话给 `name` 则原样采用（门禁 / 旧快照注入的形态），
   否则按 `user` 到**身份台账**（`idSeed().users`）按账号 / id / 姓名反查，显示「角色 姓名」；
   未登记账号原样显示（如实反映登录人，不臆造角色）；无会话时保留壳页静态文本。 */
function sessionTopbar(){
  var s = getSession(); if(!s) return;
  var raw = String(s.name || s.user || "").trim(); if(!raw) return;
  var out = raw;
  if(typeof idSeed === "function"){
    try{
      var u = (idSeed().users || []).filter(function(x){ return x.acct===raw || x.id===raw || x.name===raw; })[0];
      if(u) out = u.role + " " + u.name;
    }catch(e){ /* 台账不可用时原样显示 */ }
  }
  var t = document.querySelector("#topbarUser"); if(t) t.textContent = out;
}
/* 当前页「文件名 + 查询串」，供 ?back= 回跳（不含目录，file:// 与 http 都成立） */
function curFileUrl() { return (location.pathname.split("/").pop() || "index.html") + location.search + location.hash; }
/* 门禁：非登录页且无登录态 → 去登录页并记住原目标；返回 true 表示已拦截，调用方须立即停止渲染。 */
function requireLogin() {
  if (PG_CUR === "pg-login") return false;
  if (getSession()) return false;
  location.replace("login.html?back=" + encodeURIComponent(curFileUrl()));
  return true;
}
function doLogout() { clearSession(); location.replace("login.html"); }
window.requireLogin = requireLogin;
window.doLogout = doLogout;

/* ---- 演示数据持久化（切页保留演示中的改动；localStorage 不可写时静默降级） ---- */
function saveDemoState() {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify({
      schema: DEMO_SCHEMA,
      ASSETS, POLICIES, CRED_LIST, CA_LIST, MTLS_LIST,
      detailAid: window._detailAid || "",
      curAcl: CUR_ACL,
      S: { view: S.view, cur: S.cur, mode: S.mode, designer: S.designer, filter: S.filter, selRows: Array.from(S.selRows || []) },
      FG: { view: FG.view, cur: FG.cur, filter: FG.filter, rq: FG.rq },
      credTab: window._credTab || "c1",
      pgc: { PAsset: window.PAsset, PAsp: window.PAsp, PFg: window.PFg, PFgMx: window.PFgMx, PFgSub: window.PFgSub, PFgFam: window.PFgFam },
      /* ★ R61·轮8：列表筛选条件随快照存 —— 原只存页码 `pgc` 而不存筛选条件，回跳后「页码还在、条件没了」。 */
      listF: listFSnapshot()
    }));
  } catch (e) { /* 隐私模式 / 配额不足：仅本次会话内有效 */ }
}
function loadDemoState() {
  /* ★ 2026-10-12（R56 · A-6）：本页已读过演示档 ⇒ 允许「本页退出出口」回落盘。
     未登录 / 登录页 / 深链重定向都在 bootstrap 中早于本函数 return，此时内存里只有**种子**，
     若一并落盘会把用户已存的改动覆盖掉 —— 用本闸把它们排除在外。 */
  window.__demoReady = 1;
  let s = null;
  try { s = JSON.parse(localStorage.getItem(DEMO_KEY) || "null"); } catch (e) { s = null; }
  if (!s) return;
  /* ★ 2026-10-10（R27）：判版 —— 旧档（无 schema）或版本不符一律丢弃，回落当前种子。
     否则改了本段种子（如给资产新增 `_adapt` 契约）也会被旧快照盖掉，改动等于没改。 */
  if (s.schema !== DEMO_SCHEMA) return;
  try {
    if (Array.isArray(s.ASSETS)) ASSETS.splice(0, ASSETS.length, ...s.ASSETS);
    /* ★ 2026-10-12（R53 · A1-F1）：无端编排的中间态（开通中 / 撤销中）只由**当页内存中的定时器**
       驱动；页面跳转 = 整页重载，定时器不复存在 ⇒ 从快照恢复出来的中间态是遗留态，无任何推进路径
       （开关恒禁用、重试按钮不渲染、删除又被「编排互斥」拒绝）。此处自愈为「异常」，暴露「重试」入口。 */
    ASSETS.forEach(function (a) { if (a && (a.open === "开通中" || a.open === "撤销中")) { a.open = "异常"; } });
    if (s.POLICIES && typeof s.POLICIES === "object") { Object.keys(POLICIES).forEach(k => delete POLICIES[k]); Object.assign(POLICIES, s.POLICIES); }
    [[CRED_LIST, s.CRED_LIST], [CA_LIST, s.CA_LIST], [MTLS_LIST, s.MTLS_LIST]]
      .forEach(([arr, v]) => { if (Array.isArray(v)) arr.splice(0, arr.length, ...v); });
    /* 【第二十轮】旧存档逐字段补齐：此前整段 splice ⇒ 缺 assets / st 的旧条目直接进内存，
       渲染 / 引用 / 删除保护会读到 undefined（同一 store 的 WS / RL 早已逐键补齐，此处对齐）。
       schema 由 saveDemoState 写入，供将来迁移分叉；旧档（无 schema）与 schema=1 走同一补齐路径。 */
    [].concat(CRED_LIST, CA_LIST, MTLS_LIST).forEach(function(c){
      if (!c || typeof c !== "object") return;
      if (!Array.isArray(c.assets)) c.assets = [];
      if (typeof c.st !== "string" || !c.st) c.st = c.exp ? "有效" : "已启用";
    });
    if (s.detailAid) window._detailAid = s.detailAid;
    if (s.curAcl) CUR_ACL = s.curAcl;
    if (s.S) {
      if (s.S.view) S.view = s.S.view;
      if (s.S.cur) S.cur = s.S.cur;
      S.mode = s.S.mode || ""; S.designer = s.S.designer || null; S.filter = s.S.filter || {};
      S.selRows = new Set(s.S.selRows || []);
    }
    if (s.FG) {
      if (s.FG.view) FG.view = s.FG.view;
      if (s.FG.cur) FG.cur = s.FG.cur;
      FG.filter = s.FG.filter || {}; FG.rq = s.FG.rq || null;
    }
    /* FG.rq 的 a / r / pt / o 是指向 ASSETS 内活对象的引用，JSON 往返会断链；
       这里按 key 重新挂回，并恢复不变式「FG.rq.cond === S.designer.tree」
       —— reqSave() 以 R.cond 为唯一权威（第 6051 行 cleanTree(R.cond)），
       断链会让「保存」写回一份陈旧条件树，把本轮编辑悄悄丢掉。 */
    if (FG.rq && S.designer && S.designer.scope === "path") {
      FG.rq.cond = S.designer.tree;
      const hit = FG.rq.fam ? famByKey(FG.rq.key) : pathByKey(FG.rq.key);
      if (hit) { FG.rq.a = hit.a; FG.rq.r = hit.r; FG.rq.pt = hit.pt; FG.rq.o = hit.o; }
      else { FG.rq = null; S.designer = null; }   /* 目标已不存在：交回 renderFgReq 的既有回退 */
    }
    if (s.credTab) window._credTab = s.credTab;
    if (s.pgc) Object.keys(s.pgc).forEach(k => { if (s.pgc[k] != null) window[k] = s.pgc[k]; });
    /* ★ R61·轮8：筛选控件回填须**早于首渲染**（90-tail.js：loadDemoState() → assetListRender()），
       否则首渲染按空筛选算出签名、与快照页码对不上。 */
    if (typeof assetFilterSet === "function") assetFilterSet(s.listF);
  } catch (e) { /* 快照结构不匹配：按种子数据继续 */ }
}
/* ★ 2026-10-12（R56 · A-6）：本页退出出口 —— 与 goPage()「跨页出口」成对。
   此前**只有跨页跳转**落盘；页内写侧（资产启停 / 准入与准入策略的启停 · 复制 · 删除 /
   细粒度访问要求的设置与清除 / 资产级匿名开放声明 / 资源与细粒度清单的增删改 /
   网络层允许网段 …）改完**内存态**后直接刷新或关标签页 ⇒ 变更丢失、回退到上一次落盘，
   表现为「改完没动过页面，一刷新全回去了」。此处补齐「本页退出」出口：离开文档前落盘一次
   （幂等 —— 写的就是当前内存态；未读过档的页面由 __demoReady 闸排除）。 */
try {
  var _persistOnExit = function () {
    if (window.__noPersist || !window.__demoReady) return;
    try { if (typeof saveDemoState === "function") saveDemoState(); } catch (_eP) {}
  };
  window.addEventListener("pagehide", _persistOnExit);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") _persistOnExit();
  });
} catch (_eQ) { /* 忽略 */ }

/* 重置演示数据（页脚提供入口）：清快照并回资产列表。
   2026-09-21：新增页（Web 安全防护策略族三子页共用一个 key / 规则库管理一个 key）的演示改动
   各自落独立 key，一并清除，避免「重置」后新页仍留改动。 */
function resetDemo() { try { window.__noPersist = 1; localStorage.removeItem(DEMO_KEY); localStorage.removeItem("baize.assetmgmt.websec.v1"); localStorage.removeItem("baize.assetmgmt.rulelib.v1"); localStorage.removeItem("baize.assetmgmt.dp.v1"); localStorage.removeItem("baize.assetmgmt.auth.v1"); localStorage.removeItem("baize.assetmgmt.identity.v1"); } catch (e) {} location.href = "index.html"; }
window.resetDemo = resetDemo;

/* ==========================================================================
   以下为原单文件脚本内容（保持原顺序与原文，未作逻辑改动）
   ========================================================================== */
/* ===== 基础工具 ===== */
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
let _cur="pg-list";
function showPage(id){
  /* 多页化（2026-09-20）：目标页不在本文件时交给 goPage 跨页跳转（跳转前先落盘演示数据）；
     同页调用保持原语义（容器高亮 + 滚动归位）。 */
  if (PG_FILE[id] && id !== PG_CUR) {
    /* ★ 2026-10-12（R53 · A1-F5）：向导页（pg-edit）承载五步填写，侧栏直接跳转会**静默丢弃**
       已填内容与已添加的资源 / 细粒度清单（efExit 有脏值确认，侧栏路径却绕过它）。
       与 efExit 同口径：脏值先确认，放弃时经 efDiscard 回滚后离开。 */
    if (PG_CUR === "pg-edit" && typeof efDirty === "function" && efDirty()) {
      confirmDlg("放弃本次填写？", '<div class="note warn">未保存的内容将丢失：本次已改动的<b>上游连接配置</b>（改写 / TLS / mTLS / 幂等 / 跨域 / 请求头白名单 / 大响应体）将回滚到进入本页时的状态。</div>',
        () => { $("#dlgCfm").classList.remove("show"); efDiscard(); goPage(id); }, "放弃");
      return;
    }
    goPage(id); return;
  }
  $$(".pg").forEach(p=>p.classList.remove("on"));
  const tgt=document.getElementById(id);
  if(!tgt) return;
  tgt.classList.add("on");
  /* R18 导航上下文高亮：详情与编辑向导同属「资产管理」上下文，侧栏「资产列表」应保持高亮。
     此前按页面 id 精确匹配，一进详情两项全灭，而编辑向导里却保留——同一上下文两种表现。 */
  $$("#side .mi").forEach(m=>m.classList.toggle("on", m.dataset.pg===id || ((id==="pg-detail"||id==="pg-edit") && m.dataset.pg==="pg-list")));
  _cur=id;
  window.scrollTo(0,0);
  /* ★ 2026-10-10（R15）：侧栏当前项须同步 `aria-current`（见上方 __sideMarkCur）。 */
  try { if (window.__sideMarkCur) window.__sideMarkCur(); } catch (_esc) { /* 忽略 */ }
}
$$("#side .mi").forEach(m=>m.addEventListener("click",()=>{
  const id=m.dataset.pg;
  /* 一级面包屑取该菜单项所属分组（.g），不再写死「资产管理」——
     2026-09-20 凭据托管移入「安全设置」组后，写死会让面包屑与侧栏不一致。 */
  let gEl=m.previousElementSibling; while(gEl&&!gEl.classList.contains("g")) gEl=gEl.previousElementSibling;
  document.getElementById("crumbs").innerHTML=`<span class="p">${gEl?gEl.textContent.trim():""}</span><span class="sep">/</span><span>${m.textContent.replace(m.querySelector(".ic").textContent,"").trim()}</span>`;
  showPage(id);
}));
/* ★ 2026-10-10（R14）：侧栏菜单项**键盘不可达** —— `.mi` 是无 tabindex 的 div，纯键盘用户无法经
   侧栏在页面间导航。只补 tabindex/role 与 Enter/Space → click()；菜单项原有 click 处理器
   （本处及各页自行绑定的）**原样复用**，不新增第二条执行链路。 */
$$("#side .mi").forEach(m=>{
  if(m.getAttribute("tabindex")==null) m.setAttribute("tabindex","0");
  if(!m.getAttribute("role")) m.setAttribute("role","button");
  m.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); m.click(); } });
});
/* ★ 2026-10-10（R15）：R14 让侧栏可聚焦后，**导航地标仍然缺失** —— `#side` 不是 `role="navigation"`、
   `.main` 不是 `role="main"`、当前项无 `aria-current`、也没有「跳到正文」。实测每页要按 22 次 Tab
   才到正文首个控件（`tabBeforeMain:22`）。此处一次性补齐（**不改六外壳**）。 */
try {
  var _side = document.getElementById("side");
  if (_side) {
    if (!_side.getAttribute("role")) _side.setAttribute("role", "navigation");
    if (!_side.getAttribute("aria-label")) _side.setAttribute("aria-label", "主导航");
  }
  var _mainEl = document.querySelector(".main");
  if (_mainEl && !_mainEl.getAttribute("role")) _mainEl.setAttribute("role", "main");
  /* 当前项 `aria-current`：`.on` 由 showPage 翻转，故做成可重入函数、由 showPage 调用。 */
  window.__sideMarkCur = function () {
    $$("#side .mi").forEach(function (m) {
      if (m.classList.contains("on")) m.setAttribute("aria-current", "page");
      else m.removeAttribute("aria-current");
    });
  };
  window.__sideMarkCur();
  if (!document.getElementById("skipMain")) {
    var _sk = document.createElement("a");
    _sk.id = "skipMain"; _sk.href = "#";
    _sk.textContent = "跳到正文";
    _sk.addEventListener("click", function (e9) {
      e9.preventDefault();
      var m9 = document.querySelector(".main"); if (!m9) return;
      if (!m9.getAttribute("tabindex")) m9.setAttribute("tabindex", "-1");
      try { m9.focus(); } catch (_ex) { /* 忽略 */ }
      try { m9.scrollIntoView(); } catch (_ey) { /* 忽略 */ }
    });
    document.body.insertBefore(_sk, document.body.firstChild);
  }
} catch (_esz) { /* 忽略 */ }
let toastTimer;
function toast(msg){const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"),2600);}
/* R17 复位写在打开时：调用方随后按需覆盖文案与处理器。此前 #dlg1Ok 的文案被「关闭会话」改写之后
   再无复位处，导致其后每一扇 #dlg1 弹窗的确认按钮都写着「关闭会话」（如「删除资产」）——按钮文案
   与实际动作不符。凡复用同一扇弹窗，复位一律写在「打开」这一侧（与 #dlgCfm 同口径）。 */
function openDlg(title,msg,bodyHtml,size){
  $("#dlg1Title").textContent=title; $("#dlg1Msg").innerHTML=msg||""; $("#dlg1Body").innerHTML=bodyHtml||"";
  const okB=$("#dlg1Ok"); okB.textContent="确定"; okB.onclick=closeDlg;
  const noB=$("#dlg1No"); noB.textContent="取消"; noB.style.display="";
  const d=$("#dlg1 .dlg"); d.classList.remove("lg","xl"); if(size) d.classList.add(size);
  /* 无障碍（第十九轮）：把弹窗内 .fld 的 label 与控件建立 for / id 关联 ——
     此前只补了「点标签即聚焦」（M4），读屏仍读不出控件名称；此处一次性补齐，免改数百处模板。 */
  try {
    $("#dlg1Body").querySelectorAll(".fld").forEach(function(f){
      var lb=f.querySelector("label"), ct=f.querySelector("input,select,textarea");
      if(!lb||!ct) return;
      if(!lb.contains(ct)&&!lb.htmlFor){
        if(!ct.id) ct.id="dlgfld-"+Math.random().toString(36).slice(2,8);
        lb.htmlFor=ct.id;
      }
      /* ★ 2026-10-10（R13）：标了 <span class="req">*</span> 的必填项补 required / aria-required ——
         此前「必填」只是视觉标记，无障碍树上并非必填（读屏不播报）。 */
      if(lb.querySelector(".req") && !ct.disabled){
        ct.setAttribute("aria-required","true");
        if(ct.tagName==="INPUT"||ct.tagName==="TEXTAREA"){ try{ ct.required=true; }catch(_e4){} }
      }
    });
  } catch(_e) {}
  /* ★ 2026-10-11（R17）：判脏基线改为**交互标记**（见 dlg1Dirty）—— 每次开窗清零。
     不用「打开时的取值快照」：多个入口（ucNew 的 auOwnerSync、isIssue 的 isKindSync/isCnSync）
     在 openDlg 之后**同步重写**控件取值/选项，快照当场失真 ⇒ 未动过的表单被误判为「已填写」。 */
  window.__dlgDirty0 = 0;
  /* ★ 2026-10-12（R53 · A1-F8）：判脏豁免位随开窗清零，由需要的调用方（节点管理）在其后置 1 ——
     避免上一扇即时提交弹窗的抑制态泄漏到下一扇表单弹窗（反之，漏清会让表单弹窗丢掉脏值拦截）。 */
  window.__dlgNoDirty = 0;
  /* ★ 2026-09-30（第十七轮 · 无障碍）：记录触发元素，关闭时归还焦点 ——
     只在「弹窗原本未打开」时记录，避免弹窗内重开（步骤切换）把记录覆盖成已销毁的节点。 */
  try { if (!$("#dlg1").classList.contains("show")) window.__dlgPrevFocus = document.activeElement; } catch(_e) {}
  $("#dlg1").classList.add("show");
  /* ★ 2026-10-10（R15）：R14 给 `#dlg1Body` 加了独立滚动（`max-height:68vh; overflow:auto`）后，
     容器本身**不可键盘滚动**（`bodyTabindex:null`）—— 焦点在 `.ops` 按钮上时 PageDown 无效，
     纯键盘用户只能靠 Tab 间接滚动。仅当内容**确实溢出**时补 `tabindex="0"`（须在 `.show` 之后测，
     隐藏时 `scrollHeight` 恒 0）。 */
  try {
    var _bd = $("#dlg1Body");
    _bd.removeAttribute("tabindex");
    if (_bd.scrollHeight > _bd.clientHeight + 1) _bd.setAttribute("tabindex", "0");
  } catch (_ebd) { /* 忽略 */ }
  /* 无障碍（第十九轮）：打开弹窗即把焦点移入首个可编辑控件（此前需手动 Tab 进来）。
     ★ 2026-10-10（R13）：**无任何可编辑控件**的纯消息弹窗（如「不可删除」「源未启用」）此前
     焦点根本不进入弹窗（留在触发按钮 / body），键盘用户要先穿过整页才能到弹窗按钮
     ⇒ 无控件时回退聚焦主按钮 #dlg1Ok。 */
  try {
    var _f0=$("#dlg1Body").querySelector("input:not([readonly]),select,textarea");
    if(!_f0){ var _ok0=$("#dlg1Ok"); if(_ok0 && !_ok0.disabled) _f0=_ok0; }
    if(_f0&&_f0.focus) _f0.focus();
  } catch(_e) {}
}
/* 表单类弹窗的**脏值拦截**（R17）--------------------------------------------------------
   本仓把 #dlg1 同时当「提示弹窗」与「表单弹窗」用。既有注释写「点击遮罩取消——取消不产生任何
   变更，故无数据损失」，那只对**提示类**成立：新增认证源 / 签发凭据 / 轮换证书 / 上传信任锚这类
   弹窗里填了半张表，一次误触遮罩或一个 Esc 即**静默丢弃**、无任何提示。
   此处按「弹窗内是否产生过 input/change」判脏，脏则先确认再关（确认框里选取消则留在原弹窗）。
   ⚠ 判据必须是**交互**而非**取值差异**：开窗后调用方还会同步预填控件（见 openDlg 内注释），
     按取值差异判会把「刚开窗、用户未动」误判为脏。 */
function dlg1Dirty() {
  /* ★ 2026-10-12（R53 · A1-F8）：**即时提交类弹窗**（节点管理）由调用方置 `window.__dlgNoDirty`
     整体豁免判脏 —— 该弹窗行编辑「失焦即写台账」，关窗不丢数据，弹「尚未提交的录入 / 关闭后不会保存」
     与实际（已提交、已落库）相反，且「取消」按钮已被隐藏、Esc 与点遮罩是仅剩路径。 */
  if (window.__dlgNoDirty) return false;
  /* 脏 ≡ 用户在**本弹窗内**产生过 input/change（监听挂在下文 #dlg1Body 上）。
     程序化赋值不触发事件 ⇒ 开窗时的预填不再误判为脏。 */
  return !!window.__dlgDirty0;
}
/* 「取消 / Esc / 点遮罩」三条关闭途径共用入口：脏则确认，不脏直接关。
   ⚠ 提交成功后的 `closeDlg()` 调用**不走这里** —— 那是已落库的正常收尾，不该再问一句。 */
function tryCloseDlg1() {
  if (dlg1Dirty()) {
    confirmDlg("放弃已填写的内容？", "该弹窗内有<b>尚未提交的录入</b>，关闭后<b>不会保存</b>。", closeDlg, "放弃并关闭");
    return;
  }
  closeDlg();
}
function closeDlg(){$("#dlg1").classList.remove("show");
/* ★ 2026-10-12（R61 · P0）：关窗须**清空弹窗正文** —— 原实现只摘 .show、DOM 留在原地。
   D 档「表单契约」弹窗的字段（ddUrl / ddRecogn / ddTrustee…）在页内没有第二份，而页面级
   「保存并下发」的 adaptStashD(true) 是**按 id 回读 DOM** 取值的 ⇒ 用户在契约弹窗里改了
   登录页地址后点「取消」，隐藏的旧控件仍被后续保存读到，**已取消的编辑被静默落库**
   （取消形同虚设）。清空正文后：关窗即无残留控件，页面级保存只认「保存契约」提交过的值。 */
{ var _dlgB=document.getElementById("dlg1Body"); if(_dlgB) _dlgB.innerHTML=""; } window._nbOps=0; window._nbRes=null; /* ★ 2026-09-30（第十六轮）：弹窗关闭即复位两步契约弹窗的步号 ——
     原实现从不复位，仅靠「开窗即置 1」掩盖；任何绕过 adaptOpenContract 的重开路径都会
     落在上一步（脏值隐患）。 */
window.__dlgStep=1;
/* ★ 2026-09-30（第十七轮 · 无障碍）：焦点归还触发元素 —— 原实现关闭后焦点留在被移除的节点上
   （浏览器回退 body），键盘用户需从头 Tab 一遍。 */
try { if (window.__dlgPrevFocus && window.__dlgPrevFocus.focus) window.__dlgPrevFocus.focus(); } catch(_e) {}
window.__dlgPrevFocus = null;
/* ★ 2026-10-10（R17）：交互标记随弹窗关闭一并清零 —— 否则下次打开前的任何判脏调用会拿到旧标记。 */
window.__dlgDirty0 = 0; window.__dlgNoDirty = 0;}
$("#dlg1No").onclick = tryCloseDlg1;
/* ★ 2026-10-10（R17）：点遮罩同走判脏入口 —— 表单类弹窗误触遮罩是最常见的丢数据路径。 */
$("#dlg1").addEventListener("click", e => { if (e.target.id === "dlg1") tryCloseDlg1(); });
/* ★ 2026-10-11（R17）：脏值监听 —— 挂在 #dlg1Body **容器**上（openDlg 只替换其 innerHTML，
   容器本身常驻）。用捕获阶段，避免个别控件 stopPropagation 时漏记。 */
["input", "change"].forEach(function (ev) {
  $("#dlg1Body").addEventListener(ev, function () { window.__dlgDirty0 = 1; }, true);
});
/* ★ 2026-10-10（R14）：两扇弹窗此前只有 aria-labelledby（标题）、正文容器未关联 ⇒ 读屏进入弹窗
   只听到标题、错过「吊销后立即失效」这类**后果说明**。运行时补 aria-describedby（不必改六外壳）。 */
try {
  var _d1a = document.getElementById("dlg1"); if (_d1a) _d1a.setAttribute("aria-describedby", "dlg1Msg");
  var _dca = document.getElementById("dlgCfm"); if (_dca) _dca.setAttribute("aria-describedby", "cfmMsg");
  /* ★ 2026-10-12（R56 · B-3）：#dlg1 在 28 个壳页均静态带 role="dialog" aria-modal="true"
     aria-labelledby，而 #dlgCfm 只在 8 个壳页有（身份 / 认证 / 凭据族）—— 其余 20 个壳页上，
     通用确认弹窗与二次认证对读屏**不是对话框**、也不播报标题。壳页由生成器维护，直改 20 个
     壳页有被覆盖的风险 ⇒ 与上面 aria-describedby 同法，运行期按「缺则补」对齐两个弹窗
     （已带的壳页取到值即不动）。 */
  /* ★ 2026-10-12（R56 · C-5）：资产名称 #eaName2 无长度上限 —— 超长名会撑破列表 / 面包屑 /
     下拉（本页对表格折行有实测纪律）。壳页 asset-edit.html 直改有被生成器覆盖的风险，
     故与上面同法在运行期补（不设上限的「名称」是布局稳定的隐藏变量）。 */
  try {
    var _an = document.getElementById("eaName2");
    if (_an && !_an.getAttribute("maxlength")) _an.setAttribute("maxlength", "64");
  } catch (_eR) { /* 忽略 */ }
  [[_d1a, "dlg1Title"], [_dca, "cfmTitle"]].forEach(function (pair) {
    var _el = pair[0], _lb = pair[1]; if (!_el) return;
    if (!_el.getAttribute("role")) _el.setAttribute("role", "dialog");
    if (!_el.getAttribute("aria-modal")) _el.setAttribute("aria-modal", "true");
    if (!_el.getAttribute("aria-labelledby")) _el.setAttribute("aria-labelledby", _lb);
  });
} catch (_e7) { /* 忽略 */ }
/* ★ 2026-10-10（R13）：模态**焦点陷阱** —— 模态开启时背景内容对键盘用户应当是**不可达**的，
   此前 Tab 会一路走出弹窗进入页面主体。两层（#dlg1 < #dlgCfm）各陷自身，只在**最上一层**生效。 */
(function () {
  var SEL = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function trap(root) {
    root.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var cfm = document.getElementById("dlgCfm");
      var isTop = (cfm && cfm.classList.contains("show")) ? (root === cfm) : (root.id === "dlg1" && root.classList.contains("show"));
      if (!isTop) return;
      var items = Array.prototype.filter.call(root.querySelectorAll(SEL), function (el) {
        return el.offsetParent !== null || el === document.activeElement;
      });
      if (items.length < 2) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }, true);
  }
  var _d1 = document.getElementById("dlg1"); if (_d1) trap(_d1);
  var _dc = document.getElementById("dlgCfm"); if (_dc) trap(_dc);
})();
/* R24 弹窗关闭途径统一口径：
   ① Esc = 取消（三扇弹窗一致，含表单类）；
   ② 提示 / 确认 / 二次认证类弹窗（#dlg1 / #dlgCfm）支持点击遮罩取消——取消不产生任何变更，
      故无数据损失（二次认证取消还须走 cfmNo 以触发调用方的 UI 回滚）；
   ③ 条件编辑已迁至独立页面 #pg-fgreq（2026-09-13 用户指令），弹窗层不再承载表单编辑。
   层叠顺序按 DOM：#dlg1 < #dlgCfm，Esc 只关最上一扇。 */
function closeTopDialog() {
  const cfm = $("#dlgCfm");
  if (cfm.classList.contains("show")) {
    const no = $("#dlgCfm [data-act='cfmNo']");
    /* 策略体检为单按钮收尾（取消按钮被隐藏），此时等同点「关闭」 */
    if (no && no.style.display !== "none") { no.click(); return; }
    const yes = $("#cfmYes"); if (yes) yes.click();
    return;
  }
  /* ★ 2026-10-10（R17）：Esc 同走判脏入口（与「取消」「点遮罩」三条途径口径一致）。 */
  if ($("#dlg1").classList.contains("show")) { tryCloseDlg1(); return; }
}
$("#dlgCfm").addEventListener("click", e => { if (e.target.id === "dlgCfm") closeTopDialog(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeTopDialog(); });
/* R5 弹窗键盘可达性：Enter 提交 -----------------------------------------------------------
   此前只有 Esc（= 取消），表单类弹窗必须鼠标点「确定」—— 纯键盘用户走不到提交。
   · 输入框 / 下拉里回车 = 点「确定」（校验逻辑与鼠标路径完全同一份，不经第二条链路）；
   · 文本域内回车是换行、按钮回车是原生激活 ⇒ 一律不接管（避免双触发）；
   · 层叠顺序 #dlg1 < #dlgCfm，同时显示时只作用于最上一扇。 */
document.addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey) return;
  const tg = e.target && e.target.tagName;
  if (tg === "TEXTAREA" || tg === "BUTTON" || tg === "A") return;
  /* ★ R55（交互-1）：判序与上方注释 / closeTopDialog 对齐 —— **先判最上一扇 #dlgCfm**。
     原实现先判 #dlg1 并早退：层叠态（表单弹窗未关即叠二次认证）下 Enter 永远点到
     底层 #dlg1Ok —— 会重开弹窗并把已输入的认证凭据清空，键盘用户走不到提交。 */
  const cf = $("#dlgCfm");
  if (cf && cf.classList.contains("show")) {
    const y = $("#cfmYes");
    if (y) { e.preventDefault(); y.click(); }
    return;
  }
  const d1 = $("#dlg1");
  if (d1 && d1.classList.contains("show")) {
    const b = document.getElementById("dlg1Ok");
    if (b) { e.preventDefault(); b.click(); }
  }
});
/* 环境标识 */
const ENV="生产";

/* ===== 演示数据 ===== */
const TYPES=["网页应用","远程主机","文件服务","数据库","其他 TCP"];
const RISK_CLS={低:"t-ok",中:"t-warn",高:"t-err"};
const LV_CLS={1:"lv l1",2:"lv l2",3:"lv l3",4:"lv l4",5:"lv l5"};

const ASSETS=[
 {id:"a1",name:"核心网银门户",type:"网页应用",dept:"电子银行部",lv:4,grp:"核心业务",owner:"李俊",open:"已开通",
  res:[
   {id:"r1",name:"网银门户主站",kind:"页面与静态资源",main:1,nodes:["10.20.1.11:8443","10.20.1.12:8443"],lb:"加权随机",lbWeights:[3,1],nodeSt:{"10.20.1.11:8443":{s:"on",f:2},"10.20.1.12:8443":{s:"fail",t:"09-13 15:12",f:3}},hcFail:3,ext:"ebank-portal.baize.example.com",paths:[
     {name:"门户首页",m:"GET",mt:"精确",p:"/",v:"v1",risk:"中",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥经理"},
     {name:"登录页",m:"GET",mt:"精确",p:"/login",v:"v1",risk:"低",owner:"李俊",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"退出登录",m:"GET",mt:"精确",p:"/logout",v:"v1",risk:"低",owner:"李俊",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"帮助中心",m:"GET",mt:"前缀",p:"/help/*",v:"v1",risk:"低",owner:"李俊",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"爬虫协议文件",m:"GET",mt:"精确",p:"/robots.txt",v:"v1",risk:"低",owner:"李俊",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"开放公告内容",m:"GET",mt:"前缀",p:"/open/*",v:"v1",risk:"中",owner:"李俊",lc:"已激活"},
     {name:"站点地图",m:"GET",mt:"精确",p:"/sitemap.xml",v:"v1",risk:"低",owner:"李俊",lc:"已下线"}]},
   {id:"r2",name:"账户与转账 API",kind:"API",nodes:["10.20.2.21:8080","10.20.2.22:8080"],nodeSt:{"10.20.2.21:8080":{s:"drain",t:"09-13 16:20"}},ext:"ebank-api.baize.example.com",paths:[
     {name:"账户体系接口前缀",m:"GET",mt:"前缀",p:"/api/accounts/*",v:"v1",risk:"高",owner:"李俊",lc:"已激活",req:"用户标签=对公客户经理"},
     {name:"单笔转账",m:"POST",mt:"精确",p:"/api/transfer",v:"v2",risk:"高",owner:"李俊",lc:"已激活",
      req:"用户所属组织机构 属于 电子银行部 且 用户职级 ≥ 经理 且 认证安全级别 ≥ 3 级",
      _rq:{kind:"attr",by:"张伟",at:"2026-09-05 10:00",cond:{t:"g",op:"and",ch:[
        {t:"c",attr:"user.org",op:"in",v:["org_ebank"],mode:"const"},
        {t:"c",attr:"user.rank",op:"gte",v:"经理",mode:"const"},
        {t:"c",attr:"auth.level",op:"gte",v:"3 级",mode:"const"}]}}},
     {name:"查询客户资料",m:"GET",mt:"参数化",p:"/api/accounts/{id}/profile",v:"v1",risk:"高",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部"},
     {name:"账户流水查询",m:"GET",mt:"参数化 · 前缀",p:"/api/accounts/{id}/txns/*",v:"v1",risk:"高",owner:"李俊",lc:"已激活",
      req:"用户所属组织机构 属于 电子银行部（含子组织） 且 用户职级 ≥ 经理 且 环境网络区域 属于 办公网 且 认证安全级别 ≥ 4 级 且 认证方式 ∈ 指纹识别、USB Key 硬件令牌 且 认证复合方式数 ≥ 2 种方式叠加",
      _rq:{kind:"attr",by:"张伟",at:"2026-09-08 09:40",cond:{t:"g",op:"and",ch:[
        {t:"c",attr:"user.org",op:"in",v:["org_ebank"],inc:true,mode:"const"},
        {t:"c",attr:"user.rank",op:"gte",v:"经理",mode:"const"},
        {t:"c",attr:"env.zone",op:"in",v:["办公网"],mode:"const"},
        {t:"c",attr:"auth.level",op:"gte",v:"4 级",mode:"const"},
        {t:"c",attr:"auth.method",op:"in",v:["指纹识别","USB Key 硬件令牌"],q:"any",mode:"const"},
        {t:"c",attr:"auth.composite",op:"gte",v:"2",mode:"const"}]}}},
     {name:"调整账户限额",m:"PUT",mt:"参数化",p:"/api/accounts/{id}/limit",v:"v1",risk:"高",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥总监"},
     {name:"批量转账",m:"POST",mt:"精确",p:"/api/transfer/batch",v:"v2",risk:"高",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥总监 且 用户标签=审批人"}]},
   {id:"r3",name:"门户静态资源",kind:"页面与静态资源",nodes:["10.20.3.31:80"],ext:"ebank-assets.baize.example.com",paths:[
     {name:"门户静态资源目录",m:"GET",mt:"前缀",p:"/assets/*",v:"-",risk:"低",owner:"李俊",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"前端资源清单",m:"GET",mt:"精确",p:"/assets/manifest.json",v:"-",risk:"低",owner:"李俊",lc:"已激活",req:"登录即可（经鉴权会话）"}]},
   {id:"r4",name:"对账查询 API",kind:"API",nodes:["10.20.2.41:8080"],nodeSt:{"10.20.2.41:8080":{s:"probe"}},ext:"ebank-recon.baize.example.com",paths:[
     {name:"对账查询接口前缀",m:"GET",mt:"前缀",p:"/api/recon/*",v:"v1",risk:"中",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥专员"},
     {name:"按日对账单下载",m:"GET",mt:"参数化",p:"/api/recon/statement/{date}",v:"v1",risk:"高",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥经理"}]},
   {id:"r5",name:"客户通知服务",kind:"API",nodes:["10.20.2.42:8080","10.20.2.43:8080"],ext:"ebank-notify.baize.example.com",paths:[
     {name:"发送客户通知",m:"POST",mt:"精确",p:"/api/notify/send",v:"v1",risk:"中",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥经理"},
     {name:"通知模板列表",m:"GET",mt:"精确",p:"/api/notify/templates",v:"v1",risk:"低",owner:"李俊",lc:"已激活",req:"登录即可（经鉴权会话）"}]},
   {id:"r6",name:"安全令牌服务",kind:"API",nodes:["10.20.2.44:8080"],ext:"ebank-token.baize.example.com",paths:[
     {name:"签发安全令牌",m:"POST",mt:"精确",p:"/api/token/issue",v:"v1",risk:"高",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥经理"},
     {name:"吊销安全令牌",m:"POST",mt:"精确",p:"/api/token/revoke",v:"v1",risk:"高",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥总监"}]},
   {id:"r7",name:"门户图像 CDN",kind:"页面与静态资源",nodes:["10.20.3.32:80","10.20.3.33:80"],nodeSt:{"10.20.3.32:80":{s:"off",t:"09-13 09:40",f:0}},ext:"ebank-img.baize.example.com",paths:[
     {name:"门户图像目录",m:"GET",mt:"前缀",p:"/img/*",v:"-",risk:"低",owner:"李俊",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"主题图标库（多级目录通配）",m:"GET",mt:"** 多段通配 · * 通配",p:"/img/theme/**/icons/*.svg",v:"-",risk:"低",owner:"李俊",lc:"已激活",req:"登录即可（经鉴权会话）"}]},
   {id:"r8",name:"字体与图标",kind:"页面与静态资源",nodes:["10.20.3.34:80"],ext:"ebank-fonts.baize.example.com",paths:[
     {name:"字体资源目录",m:"GET",mt:"前缀",p:"/fonts/*",v:"-",risk:"低",owner:"李俊",lc:"已激活",req:"登录即可（经鉴权会话）"}]},
   {id:"r9",name:"对账单下载",kind:"文件传输",nodes:["10.20.3.42:80"],ext:"ebank-statdl.baize.example.com",paths:[
     {name:"下载对账单文件",m:"GET",mt:"参数化",p:"/stat/{fileId}",v:"v1",risk:"中",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥经理"},
     {name:"下载历史归档对账单",m:"GET",mt:"参数化",p:"/stat/archive/{fileId}",v:"v1",risk:"中",owner:"李俊",lc:"已下线"}]},
   {id:"r10",name:"凭证归档下载",kind:"文件传输",nodes:["10.20.3.43:80","10.20.3.44:80"],ext:"ebank-archdl.baize.example.com",paths:[
     {name:"下载凭证文件",m:"GET",mt:"参数化",p:"/vouch/{fileId}",v:"v1",risk:"高",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户标签=审批人"}]},
   {id:"r11",name:"外部报表导出",kind:"文件传输",nodes:["10.20.3.45:80"],ext:"ebank-extdl.baize.example.com",paths:[
     {name:"外部报表导出",m:"POST",mt:"精确",p:"/ext/export",v:"v1",risk:"高",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥经理 且 用户标签=常态化出差"}]}]},
 {id:"a2",name:"信贷审批系统",type:"网页应用",dept:"信贷管理部",lv:5,grp:"核心业务",owner:"王芳",open:"已开通",
  res:[
   {id:"r1",name:"信贷门户页面",kind:"页面与静态资源",main:1,nodes:["10.20.1.21:8443"],ext:"loan-app.baize.example.com",paths:[
     {name:"门户首页",m:"GET",mt:"精确",p:"/",v:"v1",risk:"中",owner:"王芳",lc:"已激活",req:"用户所属组织机构=信贷管理部"},
     {name:"登录相关子页面",m:"GET",mt:"前缀",p:"/login/*",v:"v1",risk:"低",owner:"王芳",lc:"已激活",req:"登录即可（经鉴权会话）"}]},
   {id:"r2",name:"信贷 API",kind:"API",nodes:["10.20.2.31:8080","10.20.2.32:8080"],ext:"loan-api.baize.example.com",paths:[
     {name:"信贷接口前缀",m:"GET",mt:"前缀",p:"/api/loan/*",v:"v1",risk:"高",owner:"王芳",lc:"已激活",req:"用户所属组织机构=信贷管理部"},
     {name:"信贷审批",m:"POST",mt:"精确",p:"/api/loan/approve",v:"v1",risk:"高",owner:"王芳",lc:"已激活",req:"用户标签=审批岗"},
     {name:"贷款申请",m:"POST",mt:"精确",p:"/api/loan/apply",v:"v1",risk:"高",owner:"王芳",lc:"已激活",req:"用户所属组织机构=信贷管理部 且 用户职级≥经理"},
     {name:"查询还款计划",m:"GET",mt:"参数化",p:"/api/loan/{loanId}/plan",v:"v1",risk:"高",owner:"王芳",lc:"已激活",req:"用户所属组织机构=信贷管理部"},
     {name:"调整贷款利率",m:"PUT",mt:"参数化",p:"/api/loan/{loanId}/rate",v:"v1",risk:"高",owner:"王芳",lc:"已激活",req:"用户所属组织机构=信贷管理部 且 用户职级≥总监"},
     {name:"贷款影像资料下载",m:"GET",mt:"参数化 · 前缀",p:"/api/loan/{loanId}/docs/*",v:"v1",risk:"中",owner:"王芳",lc:"已激活",req:"用户所属组织机构=信贷管理部 且 用户职级≥专员"},
     {name:"查询还款计划（gRPC 服务方法）",m:"gRPC 一元调用",mt:"精确",p:"/loan.LoanService/GetPlan",v:"v1",risk:"高",owner:"王芳",lc:"已激活",proto:"gRPC",req:"用户所属组织机构=信贷管理部 且 用户职级≥经理"},
     {name:"遗留审批接口（已下线）",m:"POST",mt:"精确",p:"/api/loan/legacy/approve",v:"v1",risk:"高",owner:"王芳",lc:"已下线"}]},
   {id:"r3",name:"影像附件服务",kind:"文件传输",nodes:["10.20.3.41:80"],ext:"loan-img.baize.example.com",paths:[
     {name:"影像文件",m:"GET",mt:"参数化",p:"/img/{docId}",v:"v1",risk:"中",owner:"王芳",lc:"已激活"},
     {name:"下载影像原件",m:"GET",mt:"参数化",p:"/img/download/{docId}",v:"v1",risk:"高",owner:"王芳",lc:"已激活",req:"用户所属组织机构=信贷管理部 且 用户标签=审批岗"},
     {name:"归档影像",m:"GET",mt:"参数化",p:"/img/archive/{docId}",v:"v1",risk:"中",owner:"王芳",lc:"已下线"}]},
   {id:"r4",name:"影像上传服务",kind:"文件传输",nodes:["10.20.3.46:80"],ext:"loan-upload.baize.example.com",paths:[
     {name:"上传影像资料",m:"POST",mt:"精确",p:"/upload/doc",v:"v1",risk:"高",owner:"王芳",lc:"已激活",req:"用户所属组织机构=信贷管理部 且 用户标签=审批岗"}]},
   {id:"r5",name:"审批进度推送",kind:"长连接",nodes:["10.20.2.33:8080"],ext:"loan-sse.baize.example.com",paths:[
     {name:"审批进度事件流",m:"GET",mt:"前缀",p:"/events/approval/*",v:"v1",risk:"中",owner:"王芳",lc:"已激活",req:"用户所属组织机构=信贷管理部"}]},
   {id:"r6",name:"信贷后台控制台",kind:"管理控制台",nodes:["10.20.1.22:8443"],ext:"loan-admin.baize.example.com",paths:[
     {name:"后台控制台入口",m:"GET",mt:"前缀",p:"/admin/*",v:"v1",risk:"高",owner:"王芳",lc:"已激活",req:"用户所属组织机构=信贷管理部 且 用户职级≥总监"}]},
   {id:"r7",name:"审批消息长连接",kind:"长连接",nodes:["10.20.2.34:8080"],drainMax:900,ext:"loan-ws.baize.example.com",paths:[
     {name:"审批消息通道（WebSocket 双向流）",m:"WS 帧（双向）",mt:"精确",p:"/ws/approval",v:"v1",risk:"中",owner:"王芳",lc:"已激活",proto:"WebSocket",req:"用户所属组织机构=信贷管理部"}]}]},
 {id:"a3",en:0,name:"客户数据仓库",type:"数据库",dept:"数据管理部",lv:5,grp:"数据平台",owner:"陈丽",open:"未开通",addr:"10.20.5.8:5432",addrProto:"PostgreSQL",client:"DBeaver",ext:"-",res:[
   {id:"r1",name:"客户数据仓库实例",kind:"数据库实例",proto:"PostgreSQL",host:"10.20.5.8",port:"5432",path:"",open:"desktop",client:"DBeaver",paths:[]},
   {id:"r2",name:"客户画像检索",kind:"NoSQL 实例",proto:"Elasticsearch",host:"10.20.5.9",port:"9200",path:"",open:"desktop",client:"elasticsearch-head",paths:[]},
   {id:"r3",name:"Kibana 控制台",kind:"管理控制台",main:0,nodes:["10.20.5.9:5601"],ext:"kibana.baize.example.com",paths:[
     {name:"检索控制台首页",m:"GET",mt:"精确",p:"/",v:"v1",risk:"高",owner:"陈丽",lc:"已激活",req:"用户所属组织机构=数据管理部 且 用户职级≥经理"},
     {name:"Dev Tools 查询入口",m:"POST",mt:"前缀",p:"/api/console/*",v:"v1",risk:"高",owner:"陈丽",lc:"已激活",req:"用户所属组织机构=数据管理部 且 用户标签=数据开发"},
     {name:"控制台静态资源",m:"GET",mt:"前缀",p:"/static/*",v:"-",risk:"低",owner:"陈丽",lc:"已激活",req:"登录即可（经鉴权会话）"}]}]},
 {id:"a4",name:"报表中心",type:"网页应用",dept:"综合管理部",lv:3,grp:"办公协同",owner:"周琴",open:"已开通",
  res:[
   {id:"r1",name:"报表门户",kind:"页面与静态资源",main:1,nodes:["10.20.1.41:8443"],ext:"report.baize.example.com",paths:[
     {name:"报表页面目录",m:"GET",mt:"前缀",p:"/reports/*",v:"v1",risk:"中",owner:"周琴",lc:"已激活",req:"登录即可（经鉴权会话）"}]},
   {id:"r2",name:"报表下载服务",kind:"文件传输",nodes:["10.20.3.51:80"],ext:"report-dl.baize.example.com",paths:[
     {name:"下载报表文件",m:"GET",mt:"参数化",p:"/dl/{fileId}",v:"v1",risk:"低",owner:"周琴",lc:"已激活",req:"登录即可（经鉴权会话）"}]}],
  /* ★ 2026-10-10（R27 · C-4）：D 档契约落在**资产侧**（唯一真源）—— 页④「用户代填账号托管」
     只读引用本契约，不再自持副本（原「双写 + 双读」，任一侧单独改动即成漂移源）。 */
  _adapt:{mode:"D",d:{url:"https://report.baize.example.com/login.do",urlAlt:"—",kind:"多步（两步及以上）",userSel:"#userName",pwdSel:"#passWord",submitSel:"#loginBtn",submit:"等用户点击",captcha:"无",verify:"URL 含 /report/",step2:{url:"https://report.baize.example.com/report/main.jsp",userSel:"#u",pwdSel:"input[name=\"pwd\"]",submitSel:"#okBtn"}}}},
 {id:"a5",name:"统一身份门户",type:"网页应用",dept:"科技管理部",lv:3,grp:"办公协同",owner:"张伟",open:"已开通",
  res:[{id:"r1",name:"SSO 认证页",kind:"页面与静态资源",main:1,nodes:["10.20.1.51:8443"],ext:"idp.baize.example.com",paths:[
     {name:"单点登录页面目录",m:"GET",mt:"前缀",p:"/sso/*",v:"v1",risk:"中",owner:"张伟",lc:"已激活",req:"登录即可（经鉴权会话）"}]}]},
 {id:"a6",name:"监管报送接口",type:"网页应用",dept:"合规部",lv:4,grp:"数据平台",owner:"陈丽",open:"已开通",
  res:[{id:"r1",name:"报送 API",kind:"API",main:1,nodes:["10.20.4.61:8080","10.20.4.62:8080"],ext:"regreport.baize.example.com",paths:[
     {name:"监管数据报送",m:"POST",mt:"精确",p:"/api/submit",v:"v1",risk:"高",owner:"陈丽",lc:"已激活",req:"用户所属组织机构=合规部"},
     {name:"报送状态查询",m:"GET",mt:"精确",p:"/api/status",v:"v1",risk:"低",owner:"陈丽",lc:"已激活",req:"登录即可（经鉴权会话）"}]}]},
 {id:"a7",name:"运维审计堡垒机",type:"远程主机",dept:"科技管理部",lv:5,grp:"核心业务",owner:"张伟",open:"未开通",addr:"10.10.1.20:22",addrProto:"SSH",client:"SecureCRT",ext:"-",res:[
   {id:"r1",name:"堡垒机运维会话",kind:"终端会话",proto:"SSH",host:"10.10.1.20",port:"22",path:"",open:"web",client:null,paths:[]},
   {id:"r2",name:"堡垒机文件传输",kind:"文件传输会话",proto:"SFTP",host:"10.10.1.20",port:"22",path:"",open:"web",client:null,relay:{scan:1,type:1,dlp:1,zip:1,maxMB:200,toSec:30},paths:[]}]},
 {id:"a8",name:"对公客户影像库",type:"文件服务",dept:"电子银行部",lv:4,grp:"数据平台",owner:"李俊",open:"未开通",en:0,addr:"10.20.3.11",addrProto:"FTP",ext:"-",res:[
   {id:"r1",name:"影像共享目录",kind:"文件共享",proto:"FTP",host:"10.20.3.11",port:"",path:"/image/corp",open:"desktop",client:"资源管理器",paths:[]},
   {id:"r2",name:"影像共享（FTPS 挂载）",kind:"文件共享",proto:"FTPS",host:"10.20.3.11",port:"990",path:"/image/corp",open:"desktop",client:"资源管理器",paths:[]}]},
 {id:"a9",name:"手机银行后台",type:"网页应用",dept:"电子银行部",lv:4,grp:"核心业务",owner:"李俊",open:"异常",
  res:[{id:"r1",name:"手机银行 API",kind:"API",main:1,nodes:["10.20.4.71:8080"],ext:"mb-backend.baize.example.com",paths:[
     {name:"手机银行接口前缀",m:"GET",mt:"前缀",p:"/api/mb/*",v:"v2",risk:"高",owner:"李俊",lc:"已激活",req:"登录即可（经鉴权会话）"}]}]},
 {id:"a10",name:"报表导出网关",type:"网页应用",dept:"综合管理部",lv:2,grp:"办公协同",owner:"周琴",open:"已开通",
  res:[{id:"r1",name:"导出网关页面",kind:"页面与静态资源",main:1,nodes:["10.20.1.61:8443"],ext:"export.baize.example.com",paths:[
     {name:"报表文件下载目录",m:"GET",mt:"前缀",p:"/xls/*",v:"v1",risk:"低",owner:"周琴",lc:"已激活",req:"登录即可（经鉴权会话）"}]}],
  _adapt:{mode:"D",d:{url:"https://export.baize.example.com/auth",urlAlt:"—",kind:"单步（账号+密码同页）",userSel:"input#txtUser",pwdSel:"input#txtPass",submitSel:"input#btnLogin",submit:"自动提交",captcha:"图形验证码",verify:"出现元素 .user-avatar"}}},
 {id:"a11",name:"生产区运维桌面",type:"远程主机",dept:"科技管理部",lv:4,grp:"核心业务",owner:"张伟",open:"未开通",addr:"10.10.3.5:3389",addrProto:"RDP",ext:"-",res:[
   {id:"r1",name:"生产区运维桌面会话",kind:"远程桌面会话",proto:"RDP",host:"10.10.3.5",port:"3389",path:"",open:"web",client:null,paths:[]},
   {id:"r2",name:"桌面虚拟通道",kind:"虚拟通道",proto:"RDP",host:"10.10.3.5",port:"3389",path:"",open:"web",client:null,paths:[]}]},
 {id:"a12",name:"行情推送 TCP 通道",type:"其他 TCP",dept:"金融市场部",lv:3,grp:"核心业务",owner:"赵敏",open:"未开通",addr:"10.20.8.9:9000",addrProto:"自定义 TCP",ext:"-",res:[
   {id:"r1",name:"行情推送通道",kind:"客户端通道",proto:"自定义 TCP",host:"10.20.8.9",port:"9000",path:"",open:"desktop",client:"自研行情客户端",paths:[]},
   {id:"r2",name:"行情消息队列",kind:"消息与队列",proto:"Kafka",host:"10.20.8.10",port:"9092",path:"",open:"desktop",client:"自研行情客户端",paths:[]}]},
 {id:"a13",en:0,name:"反洗钱报送门户",type:"网页应用",dept:"合规部",lv:4,grp:"数据平台",owner:"陈丽",open:"未开通",
  res:[{id:"r1",name:"报送门户页面",kind:"页面与静态资源",main:1,nodes:["10.20.4.81:8443"],ext:"aml-report.baize.example.com",paths:[
     {name:"门户页面资源目录",m:"GET",mt:"前缀",p:"/portal/*",v:"v1",risk:"中",owner:"陈丽",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"反洗钱数据报送",m:"POST",mt:"精确",p:"/api/aml/submit",v:"v1",risk:"高",owner:"陈丽",lc:"已激活",req:"用户所属组织机构=合规部"}]}]},
 {id:"a15",name:"对公网银体验门户",type:"网页应用",dept:"电子银行部",lv:1,grp:"开发测试",owner:"李俊",open:"未开通",en:0,res:[
  {id:"r1",name:"体验门户主站",kind:"页面与静态资源",main:1,nodes:["10.20.7.11:8443"],ext:"ebank-ux.baize.example.com",paths:[
     {name:"体验门户首页",m:"GET",mt:"精确",p:"/",v:"v1",risk:"低",owner:"李俊",lc:"已激活",req:"显式公开（public）"},
     {name:"体验数据下载",m:"GET",mt:"参数化",p:"/demo/{pack}",v:"v1",risk:"中",owner:"李俊",lc:"已激活",req:"用户所属组织机构=电子银行部"}]}]},
 {id:"a19",name:"对外行情资讯门户",type:"网页应用",dept:"金融市场部",lv:1,grp:"对外服务",owner:"赵敏",open:"已开通",res:[
  {id:"r1",name:"行情资讯主站",kind:"页面与静态资源",main:1,nodes:["10.30.1.11:443"],ext:"market-news.baize.example.com",paths:[
     {name:"资讯首页",m:"GET",mt:"精确",p:"/",v:"v1",risk:"低",owner:"赵敏",lc:"已激活",req:"显式公开（public）"},
     {name:"行情数据接口",m:"GET",mt:"前缀",p:"/api/quotes/*",v:"v1",risk:"低",owner:"赵敏",lc:"已激活",req:"显式公开（public）"},
     {name:"资讯详情页",m:"GET",mt:"参数化",p:"/news/{id}",v:"v1",risk:"低",owner:"赵敏",lc:"已激活",req:"显式公开（public）"}]},
  {id:"r2",name:"静态资源站",kind:"页面与静态资源",nodes:["10.30.1.12:443"],ext:"market-cdn.baize.example.com",paths:[
     {name:"静态资源目录",m:"GET",mt:"前缀",p:"/static/*",v:"-",risk:"低",owner:"赵敏",lc:"已激活",req:"显式公开（public）"}]}]},
 {id:"a20",name:"运维堡垒机 Web 控制台",type:"网页应用",dept:"科技管理部",lv:5,grp:"核心业务",owner:"张伟",open:"已开通",res:[
  {id:"r1",name:"控制台 Web 服务",kind:"管理控制台",main:1,nodes:["10.10.2.21:8443"],ext:"bastion-web.baize.example.com",paths:[
     {name:"控制台首页",m:"GET",mt:"精确",p:"/",v:"v1",risk:"高",owner:"张伟",lc:"已激活",req:"用户所属组织机构=科技管理部 且 用户职级≥经理"},
     {name:"会话录制回放",m:"GET",mt:"前缀",p:"/sessions/playback/*",v:"v1",risk:"高",owner:"张伟",lc:"已激活",req:"用户角色包含 审计管理员"},
     {name:"运维指令下发",m:"POST",mt:"精确",p:"/api/cmd/exec",v:"v1",risk:"高",owner:"张伟",lc:"已激活",req:"用户所属组织机构=科技管理部 且 用户标签=运维岗"},
     {name:"控制台静态资源",m:"GET",mt:"前缀",p:"/static/*",v:"-",risk:"低",owner:"张伟",lc:"已激活",req:"登录即可（经鉴权会话）"}]}],
  _adapt:{mode:"D",d:{url:"https://bastion-web.baize.example.com/",urlAlt:"—",kind:"单步（账号+密码同页）",userSel:"#loginForm input[name=\"username\"]",pwdSel:"#loginForm input[name=\"password\"]",submitSel:"#loginForm button[type=\"submit\"]",submit:"自动提交",captcha:"无",verify:"登录后 URL 须为 /console/home"}}},
];
/* License 授权范围（业务系统级）受控取值域 —— 与资产台账**显式挂钩**（消除下游各自命名）：
   下游（认证段「签发凭据」的授权范围 / 身份段客户端实例 License 的授权范围）一律取此处名称，
   不再另立一套业务系统名。每个业务系统的 ids 指向台账中的资产，可用于交叉核对。 */
const LIC_SCOPE_SET = [
  { name: "信贷核心系统", ids: ["a1", "a2", "a9"] },
  { name: "客户管理平台", ids: ["a8", "a9"] },
  { name: "报表分析平台", ids: ["a4", "a10"] },
  { name: "办公自动化平台", ids: ["a4", "a5", "a10"] },
  { name: "数据中台", ids: ["a3", "a6", "a13"] },
  { name: "代码库", ids: ["a15"] },
  { name: "需求库", ids: ["a15"] },
  { name: "沙箱环境", ids: ["a15"] }
];
function licScopeNames() { return LIC_SCOPE_SET.map(function (x) { return x.name; }); }
function licScopeAssets(name) { for (var i = 0; i < LIC_SCOPE_SET.length; i++) if (LIC_SCOPE_SET[i].name === name) return LIC_SCOPE_SET[i].ids.slice(); return []; }
/* 演示初始更新时间（登记 / 最近变更基准；运行期操作会动态刷新 _upd） */
[["a1","2026-09-06"],["a2","2026-09-05"],["a3","2026-09-10"],["a4","2026-09-06"],["a5","2026-09-03"],["a6","2026-09-05"],["a7","2026-09-02"],["a8","2026-09-01"],["a9","2026-09-06"],["a10","2026-09-04"],["a11","2026-09-06"],["a12","2026-09-05"],["a13","2026-09-10"],["a15","2026-09-06"],["a19","2026-09-07"],["a20","2026-09-08"]].forEach(([id,d])=>{const x=ASSETS.find(a=>a.id===id); if(x) x._upd=d;});
const CUR="a1";           // 当前详情资产
let CUR_ACL="a1";         // ASP / GAP 共享的当前资产

function byId(id){return ASSETS.find(a=>a.id===id);}

/* ===== 资产列表 ===== */
/* 状态栏合并展示两个维度：① 资产启用（启用/停用，所有类型可操作；停用=整体下线，禁止开通无端访问）② 无端访问开通状态（仅网页应用） */
const EN_ON=a=>a.en!==0;
/* 资产状态标签：资产级生命周期统一用「已启用 / 未启用」；
   无端访问开通状态（五态：未开通/开通中/已开通/撤销中/异常）另由 openTag 表达，仅出现在无端访问管理语境 */
function enTag(a){ return EN_ON(a) ? '<span class="tag t-ok">已启用</span>' : '<span class="tag t-gray">未启用</span>'; }
function enTagHtml(a){ return enTag(a); }
function enSwitch(id,on){
  const a=byId(id); if(!a) return;
  if(on===EN_ON(a)) return;
  /* 资产启用 / 停用属敏感变更：先二次认证，通过后才落状态；取消则回滚开关位置 */
  const prevEn=a.en, prevOpen=a.open;
  const apply=()=>{
    a.en=on?1:0; a._upd=nowD();
    if(!on&&a.open!=="未开通"){ a.open="未开通"; }   // 停用=整体下线：无端编排同步撤销（节点 2 秒内停止放行）
    toast(on?"资产已启用：恢复在网可访问（演示）":"资产未启用：整体下线，无端访问已同步撤销、2 秒内全节点停止放行（演示）");
    syncOpenUI(a);
    const det=document.getElementById("pg-detail");
    if(det&&det.classList.contains("on")&&(window._detailAid||CUR)===a.id) renderEnState(a);
  };
  const rollback=()=>{
    a.en=prevEn; a.open=prevOpen;
    const sw=document.getElementById("swEn"); if(sw) sw.checked=EN_ON(a);
    syncOpenUI(a);
    const det=document.getElementById("pg-detail");
    if(det&&det.classList.contains("on")&&(window._detailAid||CUR)===a.id) renderEnState(a);
  };
  ask2FA(on?"启用资产「"+a.name+"」":"停用资产「"+a.name+"」", apply, rollback);
}
function openTagHtml(st){ const c={未开通:'t-gray',开通中:'t-warn',已开通:'t-ok',撤销中:'t-warn',异常:'t-err'}; return `<span class="tag ${c[st]||"t-gray"}">${st}</span>`; }
function openCellHtml(a){
  // 仅网页应用、远程主机支持「无端访问」；其余（数据库/文件服务/自定义 TCP）= 不适用
  if(a.type!=="网页应用" && a.type!=="远程主机"){
    return '<span class="tag t-gray" title="本类资产无「无端访问编排」开关（该开关仅网页应用需要）；访问入口在详情「资源与访问」资源行的「打开方式」（桌面客户端 / 平台会话）">不适用</span>';
  }
  // 远程主机：支持无端访问，形态=平台内嵌会话（WebSSH / WebRDP / WebVNC / Web-SFTP）
  if(a.type!=="网页应用"){
    return '<span class="tag t-gray" title="访问承载（平台内嵌会话）：会话在详情「资源与访问」资源行经平台内嵌方式发起——终端 WebSSH、远程桌面 WebRDP / WebVNC、文件传输 Web-SFTP（指令 / 文件动作 / 画面流录制）；该承载方式在资源行「打开方式」选择，无资产级开通开关">平台会话</span>';
  }
  // 网页应用：无端访问开关
  const st=a.open;
  const on=st==="已开通";
  const lock=st==="开通中"||st==="撤销中"||st==="异常"||!EN_ON(a);
  const tip=!EN_ON(a)?"资产未启用：请先启用资产（状态栏上行开关）后再开通无端访问":(st==="异常"?"无端访问编排未完成：点「重试」幂等续跑":(st==="开通中"||st==="撤销中"?"编排进行中，操作互斥":"开启=开通无端访问（default deny 兜底）；关闭=撤销并清理编排对象"));
  const sw=`<span class="switch" title="${tip}"><input type="checkbox" class="sw-open" ${on?"checked":""} ${lock?"disabled":""} onchange="openSwitch('${a.id}',this.checked,this)"><span class="sl"></span></span>`;
  const act=(st==="异常"&&EN_ON(a))?`<button class="btn link" onclick="openRetry('${a.id}')">重试</button>`:"";
  return `<span style="display:inline-flex; align-items:center; gap:8px; white-space:nowrap">${sw}${openTagHtml(st)}${act}</span>`;
}
/* 状态栏两行：行1=无端访问开通（网页应用）；行2=资产启用（全类型），停用时无端开关禁用 */
function stateCellHtml(a){
  const openRow=`<span style="display:inline-flex; align-items:center; gap:6px; white-space:nowrap"><span class="muted" style="font-size:12px">无端</span>${openCellHtml(a)}</span>`;
  const enRow=`<span style="display:inline-flex; align-items:center; gap:6px; white-space:nowrap"><span class="muted" style="font-size:12px">资产</span>
    <span class="switch" title="${EN_ON(a)?"启用中：点击停用将整体下线并撤销无端访问编排（2 秒内全节点停止放行）":"未启用：点击启用恢复在网可访问"}"><input type="checkbox" class="sw-en" ${EN_ON(a)?"checked":""} onchange="enSwitch('${a.id}',this.checked)"><span class="sl"></span></span>
    ${enTagHtml(a)}</span>`;
  return `<span style="display:inline-flex; flex-direction:column; gap:5px; align-items:flex-start">${openRow}${enRow}</span>`;
}
function assetListRender(){
  /* ★ 2026-10-12（R61 · P0）：本函数**只适用于资产列表页** —— 表体与分页器的宿主
     `#assetTbl tbody` / `#assetPager` 仅存在于 index.html。编辑页 / 详情页（任何非列表页）
     `$("#assetTbl tbody")` 返回 null，下方 innerHTML 写入即抛 TypeError，并**吞掉调用点
     后续语句**：向导保存后的「跳转详情 + 成功提示」（efSubmit 尾部）与后端资源保存后的
     成功 toast（backRerender 调用点）全部丢失。CDP 实测坐实（2026-10-12 R61）：
     在 asset-edit.html 点「保存修改」后地址栏不动、无任何反馈，控制台报
     `Cannot set properties of null (setting 'innerHTML')`。
     ⇒ 按宿主存在性整函数短路（与 :830 / 90-tail 的 `PG_CUR==="pg-list"` 守卫同口径，此处更稳）。 */
  const _tb = document.querySelector("#assetTbl tbody");
  if (!_tb) return;
  /* ★ 2026-10-12（R53 · A1-F10）：筛选控件缺失时按空值处理（非列表页 / 壳未装全），
     不再因跨页复用而读 null.value 抛错。 */
  const _fv = assetFilterVals();
  const k=(_fv.fK||"").trim().toLowerCase(), ty=_fv.fType, lv=_fv.fLv, st=_fv.fSt, en=_fv.fEn;
  const hitText=a=>[a.name,a.addr,a.ext].concat((a.res||[]).map(r=>[r.ext].concat(r.nodes||[]).join(" "))).join(" ").toLowerCase();
  const rows=ASSETS.filter(a=>(!k||hitText(a).includes(k))&&(!ty||a.type===ty)&&(!lv||("L"+a.lv)===lv)&&(!st||(a.type==="网页应用"&&a.open===st))&&(en===""||(en==="1"?EN_ON(a):!EN_ON(a))));
  pgKeep("Asset",[k,ty,lv,st,en].join("|"));
  const total=rows.length, pg=Math.max(1,Math.ceil(total/LIST_PAGE));
  window.PAsset=Math.min(Math.max(1,window.PAsset||1),pg);
  const slice=rows.slice((window.PAsset-1)*LIST_PAGE, window.PAsset*LIST_PAGE);
  _tb.innerHTML=(slice.length?slice.map(a=>`<tr>
    <td><div class="a-name"><span class="a-nm" title="${xesc(a.name)}">${xesc(a.name)}</span></div><div class="a-sub" title="${xesc(accText(a))}">${xesc(accText(a))}</div></td>
    <td>${a.type}</td><td>${a.dept}</td>
    <td><span class="${LV_CLS[a.lv]}">L${a.lv}</span></td><td>${a.grp}</td>
    <td>${stateCellHtml(a)}</td><td>${esc(a.owner||"—")}</td><td class="col-dt">${a._upd||nowD()}</td>
    <td class="cell-op"><button class="btn sm" onclick="openDetail('${a.id}')">详情</button>
      <button class="btn sm" onclick="editForm('${a.id}')">编辑</button>
      <button class="btn sm danger" onclick="delAsset('${a.id}')">删除</button></td></tr>`).join("") :
    `<tr><td colspan="9"><div class="empty"><div class="big">无匹配资产</div><span class="muted">调整筛选条件或登记新资产</span><div style="margin-top:10px"><button class="btn sm" onclick="assetClearF()">清空筛选条件</button></div></div></td></tr>`);
  /* ★ R61·轮9：末位提示不得写「勾选/批量」—— 本表 9 列无任何行勾选框（index.html:84），默认提示是无处兑现
     的假承诺；口径同身份模块 6 表（40-identity.js:2710「未开放批量操作」）。 */
  pgmk("#assetPager",total,window.PAsset,"assetPg","项",LIST_PAGE,"未开放批量操作");
}
/* ★ R61（轮7）：空态一键清空筛选（范式同 `aspEmptyRow` / `wsClearF`）——
   原实现筛选到空后只能逐个手改 5 个控件；全站其余列表（准入策略 / 细粒度要求 / Web 安全各表）
   均已在空态给出该出口，本页缺失属范式不一致。 */
function assetClearF(){
  ["fK","fType","fLv","fEn","fSt"].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=""; });
  window.PAsset=1; assetListRender(); toast("已清空筛选条件");
}
/* ★ R61·轮8：列表 5 个筛选控件的**读写单一出口** —— 渲染期取值、快照落盘、快照回填三处共用。
   原实现只在渲染期从 DOM 读一次，既不落盘也不回填 ⇒「筛选 → 进详情 → 返回」后条件全丢；
   而页 A（准入策略）的筛选早已入快照 `S.filter`，属同一功能两套行为。
   取值一律按「控件缺失即空值」处理（非列表页 / 壳未装全时不抛 null.value，原 _fv 的防护在此保留）。 */
function assetFilterVals(){ const g=id=>{const e=document.getElementById(id); return e?e.value:"";}; return {fK:g("fK"),fType:g("fType"),fLv:g("fLv"),fSt:g("fSt"),fEn:g("fEn")}; }
/* ★ R61·轮10：`listF` 的**写侧**只在控件真实存在的页面取值。
   goPage() 与「本页退出出口」在**任意页**都会落盘一次，而详情 / 向导 / 策略族页面没有
   #fK / #fType / #fLv / #fSt / #fEn 控件 —— assetFilterVals 的「控件缺失即空值」本是防抛错的
   防护，落到写侧却把列表页存下的筛选条件覆盖成**全空**，于是「筛选 → 进详情 → 返回」条件仍丢
   （R61·轮8 只补了「存」与「回填」，没堵住这条**覆盖**路径；页 A 的 S.filter 是内存态、不读 DOM，
   故不受影响）。处置：无控件时**沿用已存快照里的 listF**，不在无控件页面重算。 */
function listFSnapshot(){
  if (["fK","fType","fLv","fSt","fEn"].some(function(id){ return document.getElementById(id); })) return assetFilterVals();
  try { var s = JSON.parse(localStorage.getItem(DEMO_KEY) || "{}"); if (s && s.listF) return s.listF; } catch (e) {}
  return assetFilterVals();
}
function assetFilterSet(o){ if(!o) return; Object.keys(o).forEach(function(k){ const e=document.getElementById(k); if(e && o[k]!=null) e.value=o[k]; }); }
/* ★ 2026-10-12（R58 · 交-3）：原逐键直绑 `input` ⇒ 搜索框每敲一键即全量 filter + 表体重建，且**绕过**了全站统一的 260ms 防抖通道（`input[type=search]` → 合成 `change`）。改绑 `change`：下拉筛选行为不变（change 同样一次触发），搜索框改由防抖通道驱动。 */
["fK","fType","fLv","fEn","fSt"].forEach(id=>{const el=document.getElementById(id); if(el) el.addEventListener("change",assetListRender);});

function openDetail(id){
  const a=byId(id); if(!a) return;
  /* 多页化：详情已独立成页（asset-detail.html）。跨页进入先记下资产，再跳转。 */
  if (PG_CUR !== "pg-detail") { window._detailAid = id; goPage("pg-detail", { aid: id }); return; }
  /* ★ R61·轮10：详情页分支**必须**回写 _detailAid —— 细粒度「去维护生命周期」/ 凭据「引用资产」/
     认证源适配三处都用 goPage("pg-detail",{aid}) 直达本页，不经上面的跨页分支；
     而 CUR 是常量 "a1"，(window._detailAid||CUR) 实际由 _detailAid 独占决定 ⇒ 滞留快照旧值时
     守卫恒假，详情页「启用 / 停用」与「无端开通」变更后状态标签不刷新（开关动了、标签没动）。 */
  window._detailAid = id;
  backMig(a);                       // 迁移先行：头部 detAddr / 首条后端资源在首次打开即按迁移后镜像展示（补默认端口）
  showPage("pg-detail");
  document.getElementById("crumbs").innerHTML=`<span class="p">资产管理</span><span class="sep">/</span><span>资产列表</span><span class="sep">/</span><span>${esc(a.name)}</span>`;
  $("#detTitle").textContent="资产详情 · "+a.name;
  $("#detName").textContent=a.name; const mr=mainRes(a);
  $("#detAddr").textContent=(a.res&&a.res.length&&!a.res.some(isBackRes)?mr.name+" · "+(mr.proto||accScheme(mr.nodes)).toLowerCase()+"://"+(mr.ext&&mr.ext!=="-"?mr.ext:((mr.nodes||[])[0]||""))+" · "+(mr.nodes||[]).join(", "):addrText(a));
  $("#detType").textContent=a.type; $("#detType").className="tag "+(a.type==="网页应用"?"t-info":"t-gray");
  $("#detLv").textContent="L"+a.lv; $("#detLv").className=LV_CLS[a.lv];
  $("#mName").textContent=a.name; $("#mType").textContent=a.type;
  $("#mDept").textContent=a.dept; $("#mGrp").textContent=a.grp; $("#mOwner").textContent=a.owner;
  $("#mLevel").innerHTML=`<span class="${LV_CLS[a.lv]}">L${a.lv}</span>`;
  const ms=$("#mState"); if(ms) ms.innerHTML=enTagHtml(a)+' <span class="muted" style="margin:0 2px">·</span> '+openTagHtml(a.open||"未开通");
  // 代理与上游配置区（t4 页）：整体渲染 + 回填（id 与向导 s4 前缀区分，避免双渲染冲突）
  upRenderDetail(a);
  renderRes(a); renderPaths(a);
  renderEnState(a);
  renderOpenState(a);
  applyDetailView(a);
  showTab("detTabs","t1");
}
/* 通用页内 Tab 切换：navId 触发，面板为同容器下的 .tbp */
function showTab(navId,which){
  const nav=document.getElementById(navId);
  if(!nav) return;
  const host=nav.closest(".pg");
  if(host){ host.querySelectorAll(".tbp").forEach(p=>p.classList.remove("on")); }
  const panel=document.getElementById(which);
  if(panel) panel.classList.add("on");
  nav.querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.t===which));
}
bind("#detTabs", el=>el.addEventListener("click",e=>{const b=e.target.closest("button"); if(b) showTab("detTabs", b.dataset.t);}));
/* 2026-09-30：身份适配页签（t6）内容在切换时渲染 —— 与 t1~t5 的静态骨架不同，
   它按当前资产的 _adapt 状态现算（资产引用选择器也在页内，故每次进入重渲染）。 */
bind("#detTabs", el=>el.addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return;
  if(b.dataset.t==="t6" && typeof renderAdaptPage==="function") renderAdaptPage();
}));
bind("#btnBackList", el=>el.onclick=()=>showPage("pg-list"));

/* ===== 无端访问开通 / 撤销 / 重试：列表列内开关与详情主开关共用一套状态机 =====
   状态机（仅网页应用可开通；开通中/撤销中编排互斥；异常=编排未完成走「重试」幂等续跑，不重开）：
   未开通 --开启--> 开通中 --编排完成--> 已开通；已开通 --关闭--> 撤销中 --对象清理--> 未开通 */
const OPEN_STATE_TAG={未开通:'t-gray',开通中:'t-warn',已开通:'t-ok',撤销中:'t-warn',异常:'t-err'};
/* 资产状态（启用/停用）：头部开关与标签；停用时无端访问编排已撤销且禁止再次开通 */
function renderEnState(a){
  const s=$("#detEnState"), sw=$("#swEn"); if(!s||!sw) return;
  const on=EN_ON(a);
  s.textContent=on?"已启用":"未启用"; s.className="tag "+(on?"t-ok":"t-gray");
  sw.checked=on;
  sw.title=on?"启用中：点击停用将整体下线并撤销无端访问编排（2 秒内全节点停止放行）":"未启用：点击启用恢复在网可访问";
}
function renderOpenState(a){
  const st=a.open, s=$("#detOpenState"), sw=$("#swOpen"); if(!s||!sw) return;
  if(a.type!=="网页应用"){ sw.checked=false; sw.disabled=true; s.textContent="—"; s.className="tag t-gray"; const act2=$("#detOpenAct"); if(act2) act2.innerHTML=""; return; }
  s.textContent=st; s.className="tag "+OPEN_STATE_TAG[st];
  sw.checked=st==="已开通";
  const lock=st==="开通中"||st==="撤销中"||st==="异常"||!EN_ON(a);   // 停用=整体下线 → 禁止开通；异常 → 右侧「重试」续跑
  sw.disabled=lock;
  sw.title=lock?(!EN_ON(a)?"资产未启用：请先启用资产后再开通无端访问":(st==="异常"?"无端访问编排未完成：点右侧「重试」幂等续跑":"编排进行中，操作互斥")):"";
  const act=$("#detOpenAct");
  if(act) act.innerHTML=st==="异常"&&EN_ON(a)?`<button class="btn sm" onclick="openRetry('${a.id}')">重试</button>`:"";
}
function syncOpenUI(a){
  const det=document.getElementById("pg-detail");
  if(det&&det.classList.contains("on")&&(window._detailAid||CUR)===a.id){ renderEnState(a); renderOpenState(a); }
  /* ★ 2026-10-12（R53 · A1-F10）：列表重绘只在列表页执行 —— 详情 / 向导页没有 #fK 等筛选控件，
     无条件调用会让 assetListRender 读 null.value 抛错，并**吞掉紧随其后的开通终态注册**（定时器
     根本没注册 ⇒ 详情页开通永久停在「开通中」）。 */
  if(PG_CUR==="pg-list") assetListRender();
}
function doOpen(a,retry){
  if(!EN_ON(a)){ toast("资产未启用：请先启用资产（列表/详情「状态」栏）后再开通无端访问"); return; }
  a.open="开通中"; a._upd=nowD(); syncOpenUI(a);
  setTimeout(()=>{
    /* ★ 2026-10-12（R57 · 交-2）：编排推进前复核启用态 —— 在「开通中」停用资产时 enSwitch 已把
       open 置回「未开通」，而本定时器仍无条件回写「已开通」⇒ 落到状态机非法组合
       （en=0 且 open=已开通：资产未启用却显示无端已开通，删除/重开都再被拦）。 */
    if(!EN_ON(a)){ a.open="未开通"; a._upd=nowD(); syncOpenUI(a); toast("资产在编排期间被停用：开通流程已中止（演示）"); return; }
    a.open="已开通"; a._upd=nowD(); syncOpenUI(a); toast(retry?"重试成功：编排按幂等续跑完成（演示）":"已开通：代理/路由/上游/细粒度资源清单容器已编排，未配置访问要求前 default deny（演示）");},900);
}
function doClose(a){
  a.open="撤销中"; a._upd=nowD(); syncOpenUI(a);
  setTimeout(()=>{a.open="未开通"; a._upd=nowD(); syncOpenUI(a); toast("已撤销：节点 2 秒内停止放行、长连接断开、编排对象清理完成（演示）");},900);
}
function openSwitch(id,on,el){
  const a=byId(id); if(!a||a.type!=="网页应用") return;
  if(!EN_ON(a)){ toast("资产未启用：请先启用资产后再开通无端访问"); return; }
  const st=a.open;
  if(st==="开通中"||st==="撤销中"||st==="异常") return;   // 控件已禁用，此处仅防御
  if(on){ if(st!=="未开通") return; } else { if(st!=="已开通") return; }
  /* ★ R61（轮5）：无端开通 / 撤销与资产启用 / 停用同属「改变生效面」的动作（开通后该资产经无端网关
     对用户可达、撤销即停止放行并清理编排对象）⇒ 与同行 enSwitch 同档：先二次认证、通过后才推进编排；
     取消则把开关扳回原位、不产生任何变更。 */
  const rollback=()=>{ if(el) el.checked=!on; };
  if(on) ask2FA("开通无端访问「"+a.name+"」", ()=>doOpen(a,false), rollback,
    "开通后该资产经无端网关对用户可达（未配置访问要求前<b>默认拒绝</b>）：将编排代理 / 路由 / 上游 / 细粒度资源清单容器。");
  else ask2FA("撤销无端访问「"+a.name+"」", ()=>doClose(a), rollback,
    "撤销后<b>节点 2 秒内停止放行、长连接断开、编排对象清理完成</b>；<b>不可恢复</b>，如需恢复须重新开通。");
}
function openRetry(id){
  const a=byId(id); if(!a) return;
  if(!EN_ON(a)){toast("资产未启用：请先启用资产后再重试开通"); return;}
  if(a.open!=="异常"){toast("仅异常状态可重试（幂等续跑）"); return;}
  doOpen(a,true);
}
function crumb(g,p){document.getElementById("crumbs").innerHTML=`<span class="p">${g}</span><span class="sep">/</span><span>${p}</span>`;}
function nowD(){return "2026-09-30";} /* 演示基准日（**全原型唯一**，= 认证段 AU_TS_STAMP 的日期部分）：须**晚于**台账内最晚的初始更新时间（2026-09-10），否则编辑 / 启停后「更新时间」反而回退；登记/编辑/开通等变更落 _upd，列表「更新时间」随之刷新。★ R61·轮8：原写 2026-09-12 ⇒ 与 20-policy 的 AU_TS_STAMP、70-dp 的 DP_TODAY（均 2026-09-30）不同源，且早于本文件 nodeSt 种子的 09-13 ⇒ 同页出现「明天才发生」的摘除时刻。 */
/* 视图分层（详情页 · v11t tab 拆分）：① 无端访问开通仅「网页应用」；② 页签 = 基础信息 t1 / 资源与访问 t2（恒显，所有资产类型）/ 细粒度资源清单 t3 / 代理与上游 t4（仅可按 Web 资源化资产可见）/ 访问记录 t5；③「资源与访问」卡对所有资产开放——网页/桌面+后端 Web 登记网页式资源（多节点 / 外部地址 / 细粒度清单），非网页资产登记后端服务资源（协议 + 主机/端口/路径 + 打开方式 + 指令审计）；响应地址改写随「代理与上游」 */
function applyDetailView(a){
  const hasOpen=a.type==="网页应用";
  const web=assetWebish(a);
  const set=(id,show)=>{const el=document.getElementById(id); if(el) el.style.display=show?"":"none";};
  set("detOpenWrap",hasOpen);
  set("addrCard",true);
  const nav=document.getElementById("detTabs");
  if(nav) nav.querySelectorAll("button").forEach(b=>{ const t=b.dataset.t; if(t==="t3"||t==="t4") b.style.display=web?"":"none"; else b.style.display=""; });
  const cur=document.querySelector("#pg-detail .tbp.on");
  if(!web&&cur&&(cur.id==="t3"||cur.id==="t4")) showTab("detTabs","t1");
  const sub=document.getElementById("addrCardSub");
  if(sub) sub.textContent=web
    ? "主资源 + 附属资源（每项独立：类型 / 访问协议 / 多节点 / 外部访问地址）"
    : "后端服务资源（每项独立：访问协议 + 主机/端口/路径 · 打开方式 · 客户端）。"+ (a.type==="远程主机"?"远程主机类资源默认经平台内嵌方式访问（浏览器内）：终端 WebSSH、远程桌面 WebRDP、文件传输 Web-SFTP；可切换桌面客户端（本地拉起）——同一主机上终端与文件通道的承载方式须一致。":"数据库 / 文件服务 / 其他 TCP 经桌面客户端或平台会话访问；端口留空按协议自动补全默认。") +"资源类型决定细粒度资源清单承载（页面与静态资源 / API / 长连接 / 文件传输 / 管理控制台 5 类支持；非 Web 类仅访问入口与打开方式）。";
}

/* ===== 资产详情 · 资源与外部访问 ===== */
function mainRes(a){return (a.res||[]).find(r=>r.main)||(a.res||[])[0]||{};}
/* 访问地址展示：网页应用取主资源——优先用资源登记的访问协议（proto，如 HTTPS / FTP），未登记时按主节点端口启发（8443/443→https，其余→http）；无外部域名回落主节点内部地址；非网页资产按登记的访问协议与资源地址组合展示（如 SSH → ssh://10.10.1.20:22、PostgreSQL → postgresql://10.20.5.8:5432、自定义 TCP → tcp://10.20.8.9:9000） */
function accScheme(nodes){const p=String((nodes||[])[0]||"").split(":").pop();return (p==="443"||p==="8443")?"https":"http";}
function accText(a){
  if(!(a.res&&a.res.length)||(a.res||[]).some(isBackRes)) return addrText(a);
  const mr=mainRes(a);
  const dom=(mr.ext&&mr.ext!=="-"&&mr.ext!=="")?mr.ext:"";
  const host=dom||((mr.nodes&&mr.nodes[0])||"");
  if(!(dom||host)) return "—";
  const sch=String(mr.proto||accScheme(mr.nodes)).toLowerCase();
  return sch+"://"+host;
}
/* ============ v11q · 后端服务资源模型与平台内嵌会话（WebSSH / WebRDP / WebVNC / Web-SFTP） ============
   非网页资产的后端服务资源地址登记于「资源与访问」（res[] 内的 isBackRes 形态资源）：
   {id,name,kind,proto,host,port,path,open:'web'|'desktop',client,paths:[]}
   - open='web'     ：经平台内嵌会话访问——终端 WebSSH（SSH / Telnet）、远程桌面 WebRDP（RDP）与 WebVNC（VNC）、文件传输 Web-SFTP（SFTP / SCP）（默认平台会话）
   - open='desktop' ：调用绑定的桌面客户端访问
   资产级 addr/addrProto/client 保留为兼容镜像，由 syncAssetFromRes 依首条后端资源维护（列表 / 头部地址 / 兼容展示共用）。 */
function isBackRes(r){ return !!(r&&r.host); }
function resNextId(a){ const max=(a.res||[]).reduce((m,r)=>{const n=parseInt(String(r.id).replace(/^r/,""),10); return isNaN(n)?m:Math.max(m,n);},0); return "r"+(max+1); }
function backKindOf(t){ return {"远程主机":"终端会话","数据库":"数据库实例","文件服务":"文件共享","其他 TCP":"客户端通道"}[t]||"客户端通道"; }
function backResText(r,proto){ if(!r||!r.host) return ""; return joinAddr(r.host,r.port,r.path,proto||r.proto)||""; }
function syncAssetFromRes(a){
  const b=(a.res||[]).find(isBackRes);
  if(b){ a.addr=backResText(b); a.addrProto=b.proto; a.client=(b.open==="desktop")?(b.client||undefined):undefined; }
}
function protoOfAddr(addr){ const m=/^([a-z][a-z0-9+.-]*):\/\//i.exec(String(addr||"")); return m?m[1].toUpperCase():""; }
/* 旧数据一次性迁移（打开详情 / 编辑向导进入时触发，幂等）：资产级 addr → res[] 首条后端服务资源 */
function backMig(a){
  if(!a||a.type==="网页应用"||a._migB) return;
  nwNorm(a);
  if(!(a.res&&a.res.length)&&a.addr&&a.addr!=="-"){
    const proto=a.addrProto||protoOfAddr(a.addr)||"自定义 TCP";
    const pa=parseAddr(a.addr);
    /* 资源类型随协议对齐：不固定取该资产类型的默认类型——否则 RDP / VNC 会话会落成「终端会话」、
       NoSQL 协议会落成关系型的「数据库实例」、消息与队列协议会落成「客户端通道」，
       与「候选 = 资产类型 ∩ 资源类型」冲突。改为在候选集内取第一个能承载该协议的类型；
       都不承载时保留默认类型（登记面会把原值并入候选，不丢数据）。 */
    const kinds=KIND_BY_ASSET[a.type]||[];
    const kind=kinds.find(k=>protoCands(k,a.type).includes(proto))||backKindOf(a.type);
    const r={id:"r1",name:"后端服务",kind:kind,proto:proto,host:pa.host,port:pa.port,path:pa.path,open:wayDefault(proto),client:(a.client&&a.client!=="-")?a.client:null,paths:[]};
    a.res=[r];
  }
  a._migB=1;
  syncAssetFromRes(a);
}
/* —— 终端类协议：平台内嵌会话（打开方式候选；默认平台会话）—— 终端 WebSSH（SSH / Telnet）、远程桌面 WebRDP（RDP）与 WebVNC（VNC）、文件传输 Web-SFTP（SFTP / SCP）
   平台会话为网关对「该主机」的会话代理通道：SSH 指令审计与危险指令过滤（黑名单 → 强制追加认证 → 放行/拦截 + 告警）见 PRD 一期 §2 行为与指令安全；
   文件通道的文件动作审计与目录白名单校验与之同源——故同一主机上终端与文件通道的承载方式须一致（见 PRD F6.3；原型不做页面承载，会话入口提供说明）—— */
const TERM_WAYS={SSH:"WebSSH",Telnet:"WebSSH",RDP:"WebRDP",VNC:"WebVNC",SFTP:"Web-SFTP",SCP:"Web-SFTP"};
function wayDefault(proto){ return TERM_WAYS[proto]?"web":"desktop"; }
function wayLabel(proto,open){ return open==="web"?(TERM_WAYS[proto]||"平台会话"):"桌面客户端"; }
/* —— 承载方式一致性（F6.3）：同一资产（主机）内「终端会话」与「文件传输会话」的承载方式须一致 ——
   终端会话采用平台内嵌会话（WebSSH）时，其文件通道必须走平台内置方式（Web-SFTP），不得回落本地桌面客户端：
   文件动作若经本机客户端直连，会绕开网关侧的目录白名单与文件动作审计，与指令级审计形成盲区（终端被审计、文件通道绕过）。
   判定为单向——平台会话侧的终端锁定文件通道；终端走桌面客户端时不反向限制文件通道（文件走平台方式不构成盲区）。 */
const WAY_TWIN={"终端会话":"文件传输会话","文件传输会话":"终端会话"};
function wayConsistErr(a,r,nextOpen,nextProto){
  if(!a||!r) return null;
  const twin=WAY_TWIN[r.kind]; if(!twin) return null;
  const proto=nextProto||r.proto, open=nextOpen||r.open||wayDefault(proto);
  if(!TERM_WAYS[proto]) return null;
  const o=(a.res||[]).find(x=>x!==r&&x.kind===twin&&TERM_WAYS[x.proto]);
  if(!o) return null;
  if((o.open||wayDefault(o.proto))!=="web") return null;
  if(open==="web") return null;
  const mine=(r.kind==="文件传输会话")?"目录白名单与文件动作审计":"指令级审计与危险指令过滤";
  return "同主机（同一资产）的「"+twin+"」已采用平台 "+TERM_WAYS[o.proto]+"：本资源的承载方式须与之一致，改走桌面客户端会绕开网关侧的"+mine
    +"。如需桌面客户端，请先将「"+twin+"」切换为桌面客户端。";
}
/* —— 文件安全中转（F6.3）：远程主机的文件上传下载不直连目标，一律经安全中转站两段式完成 ——
   ① 投递（上传）：文件 / 任务包先上传到安全中转站（隔离暂存区），不直接进入目标主机；
   ② 领取（取走）：目标侧 / 任务从中转站领取文件，取到后任务才正式开始。
   两段是两个独立阶段，中转站是其间唯一的通道——端点与目标之间不存在直连路径（中转站为持久暂存点，含保留期，非瞬时缓冲区）。
   投递时完成内容检测，检测通过才允许真正传入目标；下载同理由中转站交付。
   检测不通过 / 超时 / 逾期未领取 / 中转站不可达一律拒绝并告警（fail-closed），不提供「检测失败仍放行」档，处置不可降级为直连。 */
const RELAY_ITEMS=[
  {k:"scan", n:"病毒 / 恶意代码扫描", fixed:1, d:"强制项，不可关闭；命中即拒绝并告警"},
  {k:"type", n:"文件类型校验", fixed:0, d:"以文件头判定真实类型，与扩展名不符或不在白名单即拒绝"},
  {k:"dlp",  n:"敏感内容识别（DLP）", fixed:0, d:"按关键字 / 正则 / 数据分级识别，命中即拒绝并告警"},
  {k:"zip",  n:"压缩包深度检查", fixed:0, d:"多层解压后逐项扫描，防嵌套绕过与解压炸弹"}];
function isFileKind(k){ return ["文件传输会话","文件传输"].includes(k); }
/* 安全中转的作用面 = 远程主机（资产类型）的文件上传下载通道：即「文件传输会话」（SFTP / SCP）
   与远程主机下登记的「文件传输」；其它资产类型的文件入口（网页应用 / 文件服务下的「文件传输」等）不在本轮口径内。 */
function fileRelayApplies(a,r){ return !!(a&&r&&a.type==="远程主机"&&isFileKind(r.kind)); }
function relayOf(r){ return Object.assign({scan:1,type:1,dlp:1,zip:1,maxMB:200,toSec:30,keepH:24},(r&&r.relay)||{}); }
function relayText(r){
  if(!r||!isFileKind(r.kind)) return "";
  const g=relayOf(r), on=RELAY_ITEMS.filter(i=>g[i.k]).map(i=>i.n.replace(/（.*?）/,""));
  return "两段式投递：① 投递——文件 / 任务包先上传到安全中转站（隔离暂存），不直接进入目标主机；② 领取——目标侧 / 任务从中转站取走文件，取到后任务才正式开始。"
    +"两段为独立阶段，中转站是其间唯一通道，端点与目标之间无直连路径（保留期 "+g.keepH+" 小时）。"
    +"投递时完成内容检测："+on.join(" + ")+"；单文件上限 "+g.maxMB+"MB · 检测超时 "+g.toSec+"s；检测不通过 / 超时 / 逾期未领取 / 中转站不可达 → 拒绝并告警";
}
function openRelayDlg(rid){
  const a=ctxAsset(), r=(a.res||[]).find(x=>x.id===rid); if(!r) return;
  const g=relayOf(r);
  const row=i=>
    `<label style="display:flex;gap:9px;align-items:flex-start;padding:7px 0;border-bottom:1px dashed var(--line)${i.fixed?";opacity:.9":""}">
       <input type="checkbox" id="rl_${i.k}" ${g[i.k]?"checked":""} ${i.fixed?"disabled":""} style="margin-top:3px">
       <span><b>${i.n}</b>${i.fixed?'<span class="tag t-err" style="margin-left:6px">强制</span>':""}<br>
       <span class="muted" style="font-size:12.5px">${i.d}</span></span></label>`;
  openDlg("文件安全中转 · "+r.name,
    "远程主机的文件上传下载不直连目标：文件 / 任务包先上传到安全中转站（投递），目标侧 / 任务再从中转站取走（领取），取到后任务才正式开始。两段为独立阶段，中转站是其间唯一通道。投递时完成内容检测，检测通过才允许真正传入目标，下载经中转站交付；检测不通过或中转站不可达即拒绝并告警，不提供「检测失败仍放行」档。",
    `<div class="rsg"><div class="rsg-h"><span class="bar"></span><span class="tt">内容检测项</span><span class="sub">默认全开 · 病毒扫描为强制项</span></div>
       <div style="padding:0 2px">${RELAY_ITEMS.map(row).join("")}</div></div>
     <div class="rsg"><div class="rsg-h"><span class="bar"></span><span class="tt">中转站与流转约束</span><span class="sub">超限 / 超时 / 逾期即拒绝</span></div>
       <div class="form-grid c3">
         <div class="fld"><label>单文件大小上限（MB）</label><input type="number" id="rlMaxMB" value="${g.maxMB}" min="1" max="10240"></div>
         <div class="fld"><label>检测超时（秒）</label><input type="number" id="rlToSec" value="${g.toSec}" min="1" max="600"></div>
         <div class="fld"><label>中转站保留期（小时）</label><input type="number" id="rlKeepH" value="${g.keepH}" min="1" max="720"></div>
         <div class="fld" style="grid-column:1 / -1"><div class="muted" style="font-size:12.5px">作用面为<b>远程主机的文件上传下载通道</b>（文件传输会话 SFTP / SCP）。中转站是<b>持久暂存点</b>而非瞬时缓冲区：文件在保留期内可被目标侧 / 任务领取，逾期未领取即清除并告警。投递与领取两段的动作与检测结论（文件指纹 SM3 · 真实类型 · 大小 · 处置 · 耗时）随文件动作审计入 ES，与指令审计同源可检索。</div></div>
       </div></div>`,"lg");
  const okB=$("#dlg1Ok"); okB.textContent="保存";
  okB.onclick=()=>{
    r.relay={scan:1,type:$("#rl_type").checked?1:0,dlp:$("#rl_dlp").checked?1:0,zip:$("#rl_zip").checked?1:0,
      maxMB:Math.min(10240,Math.max(1,+$("#rlMaxMB").value||200)),toSec:Math.min(600,Math.max(1,+$("#rlToSec").value||30)),keepH:Math.min(720,Math.max(1,+$("#rlKeepH").value||24))};
    closeDlg(); backRerender(a);
    toast("文件安全中转已保存：检测项 "+RELAY_ITEMS.filter(i=>r.relay[i.k]).length+" 项 · 单文件上限 "+r.relay.maxMB+"MB · 保留期 "+r.relay.keepH+"h（变更入审计）（演示）");
  };
}
/* —— 平台会话 · 打开（占位弹窗：真实 WebSSH/WebRDP/WebVNC 为网关渲染会话；SSH 指令审计 / 危险指令过滤为 PRD 能力要求，原型不承载）
   —— 入参为资产 id 与资源 id（与 openDesktopRes 同模式；行内 onclick 传 id 字符串，此处自行解析）—— */
function openWebSession(aId,rId){
  const a=byId(aId), r=(a&&a.res||[]).find(x=>x.id===rId); if(!a||!r) return;
  const tw=TERM_WAYS[r.proto]||"平台会话";
  const ssh=(r.proto==="SSH"||r.proto==="Telnet"), fto=(r.proto==="SFTP"||r.proto==="SCP");
  const brief = ssh ? "经平台 "+tw+" 建立浏览器内会话（不落本地客户端）。会话内指令逐条审计，危险指令强制追加认证后放行 / 拦截并告警——能力要求见 PRD 一期 §2；本页为会话入口示意。"
    : (fto ? "经平台 "+tw+" 建立浏览器内文件通道（不落本地客户端）。文件动作（上传 / 下载 / 删除 / 重命名）逐条审计，目录白名单之外的路径拒绝——能力要求见 PRD 一期；本页为会话入口示意。"
    : "经平台 "+tw+" 建立浏览器内会话（不落本地客户端）。远程桌面经画布流渲染，画面流全程录制与键盘日志归档审计（审计中心检索）；图形会话为画面级审计，不产生指令级审计。");
  const sid = ssh ? "WB-SSH-20260906-0842" : (fto ? "WB-SFTP-20260906-0517" : "WB-RDP-20260906-0631");
  const note = ssh ? "会话已建立：连接 "+schemeOf(r.proto)+"://"+backResText(r)+"。指令审计与危险指令过滤（"+r.proto+" 会话）为网关侧策略，逐条落审计并可被检索。"
    : (fto ? "文件通道已建立：连接 "+schemeOf(r.proto)+"://"+backResText(r)+"。文件不直连目标，一律经安全中转站两段式完成——① 投递：先上传到中转站（隔离暂存）；② 领取：目标侧 / 任务从中转站取走，取到后任务才正式开始。投递时完成内容检测，不通过即拒绝并告警。文件动作逐条落审计、目录白名单之外的路径被拒绝——与同主机终端会话共用同一审计链路。"
    : "会话已建立：远程桌面运行中（分辨率 1440×900），键鼠与剪贴板按会话策略控制。");
  const form = ssh ? "WebSSH：浏览器内经网关渲染的终端会话；平台侧完成指令级审计与过滤，客户端本地不落指令痕迹。"
    : (fto ? "Web-SFTP：浏览器内经网关渲染的文件通道（目录浏览 / 上传 / 下载）；文件经安全中转站两段式投递（先上传到中转站、再由目标侧 / 任务领取，取到后任务才开始）并完成内容检测后才放行，平台侧一并完成文件动作审计与目录白名单校验，客户端本地不落文件痕迹——与同主机终端会话的承载方式一致。"
    : tw+"：浏览器内经网关渲染的远程桌面（HTML5 Canvas / WebSocket 画布流）。");
  openDlg(tw+(fto?" 文件通道 · ":" 会话 · ")+a.name, brief,
    `<div style="margin:2px 0 10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap">
       <span class="tag t-info">${tw}</span><span class="tag t-gray">${esc(r.name)}</span>
       <span class="tag t-gray">${schemeOf(r.proto)}://${backResText(r)||"—"}</span>
       <span class="muted" style="margin-left:auto">${fto?"通道":"会话"} SID ${sid}</span></div>
     <div class="note" style="margin:4px 0 8px">${note}</div>
     <div class="kv"><span class="k">访问形态</span><div>${form}</div></div>`,"xl");
  $("#dlg1Ok").textContent="关闭会话"; $("#dlg1Ok").onclick=()=>{closeDlg(); renderRes(a);};
  $("#dlg1No").style.display="none";
}
/* —— 桌面客户端打开（资源级；替换原资产级 openNwClient）—— */
function openDesktopRes(aId,rId){
  const a=byId(aId), r=(a&&a.res||[]).find(x=>x.id===rId); if(!a||!r) return;
  const conn=schemeOf(r.proto)+"://"+backResText(r), cl=r.client||clientDefault(a.type,r.proto);
  openDlg("打开桌面客户端","将调用本机已安装的桌面客户端打开该后端连接（浏览器原型内为模拟演示）。",
    `<div class="kv"><span class="k">资产</span><div><b>${xesc(a.name)}</b>（${a.type} · L${a.lv} · ${esc(r.name)}）</div></div>
     <div class="kv"><span class="k">客户端</span><div><span class="tag t-info">${xesc(cl)}</span><span class="muted" style="margin-left:6px">${r.client?"（已绑定）":"（未绑定 · 按协议推荐）"}</span></div></div>
     <div class="kv"><span class="k">连接串</span><div><span class="kr">${xesc(conn)}</span><button class="btn sm" style="margin-left:8px" onclick="clipText('${conn}')">复制</button></div></div>
     <div class="note" style="margin-top:6px">正式环境经自定义协议 / 应用链接（${schemeOf(r.proto)}://…）拉起本机客户端；账号 / 库名 / 连接参数由客户端侧填写。终端 / 远程桌面 / 文件传输类资源可在资源卡切换为平台内嵌会话（WebSSH / WebRDP / WebVNC / Web-SFTP）；同一主机上终端会话与文件传输会话的承载方式须一致。</div>`);
  $("#dlg1Ok").onclick=()=>{ closeDlg(); toast("已调用「"+cl+"」打开 "+conn+"（演示模拟）"); };
}

const RES_PAGE=5, PATH_PAGE=8, LIST_PAGE=6, ASP_PAGE=10;
const MXP = 10;   /* 页 B 矩阵每页条数（路径 / 资源对象 / 附属 L7 入口共用，2026-09-13） */   /* ASP_PAGE：安全策略两页资产列表每页条数 */
function resPager(total, page){
  /* ★ R61（轮6）：与 pgmk 同源 —— **有数据即渲染、单页也渲染**（2026-10-08 用户裁定：
     分页器整体消失 ⇒ 会误判「该列表没有分页」）；仅**零条**时不渲染（那是空态）。
     ★ 并补 `cur` 夹取（旧实现 `cur=page||1` 不夹取，页码越界会把「首页」按钮误放开）。 */
  if(total<=0) return "";
  const pages=Math.max(1,Math.ceil(total/RES_PAGE)), cur=Math.min(Math.max(1,page||1),pages), one=pages<=1;
  const win=[]; for(let i=Math.max(1,cur-2); i<=Math.min(pages,cur+2); i++) win.push(i);
  const btn=(label, pageNo, on, dis)=>`<button class="b ${on?"on":""}" ${dis?"disabled":""} onclick="resGoto(${pageNo})">${label}</button>`;
  return `<div class="pager tight">
    ${btn("« 首页", 1, false, one||cur===1)}
    ${btn("‹ 上页", cur-1, false, one||cur===1)}
    ${win.map(n=>btn(n, n, n===cur)).join("")}
    ${btn("下页 ›", cur+1, false, one||cur===pages)}
    ${btn("末页 »", pages, false, one||cur===pages)}
    <span class="info">共 ${total} 项 · 第 ${cur}/${pages} 页</span></div>`;
}
function pathPager(total, page){
  /* ★ R61（轮6）：同 resPager —— 有数据即渲染、单页也渲染（2026-10-08 用户裁定）；仅零条不渲染。 */
  if(total<=0) return "";
  const pages=Math.max(1,Math.ceil(total/PATH_PAGE)), cur=Math.min(Math.max(1,page||1),pages), one=pages<=1;
  const win=[]; for(let i=Math.max(1,cur-2); i<=Math.min(pages,cur+2); i++) win.push(i);
  const btn=(label, pageNo, on, dis)=>`<button class="b ${on?"on":""}" ${dis?"disabled":""} onclick="pathGoto(${pageNo})">${label}</button>`;
  return `<div class="pager tight">
    ${btn("« 首页", 1, false, one||cur===1)}
    ${btn("‹ 上页", cur-1, false, one||cur===1)}
    ${win.map(n=>btn(n, n, n===cur)).join("")}
    ${btn("下页 ›", cur+1, false, one||cur===pages)}
    ${btn("末页 »", pages, false, one||cur===pages)}
    <span class="info">共 ${total} 条 · 第 ${cur}/${pages} 页</span></div>`;
}
function resGoto(p){ const a=curAsset(); if(!a) return; a._resPage=Math.max(1,p); renderRes(a); renderPaths(a); }
function pathGoto(p){ const a=curAsset(); if(!a) return; a._pathPage=Math.max(1,p); renderPaths(a); }

/* —— 通用分页（全列表）：pgmk 写页码条；pgKeep 过滤器变化回第 1 页 —— */
function pgmk(elId,total,page,go,unit,size,hint){
  size=size||LIST_PAGE;
  const el=$(elId); if(!el) return;
  /* ★ 有数据即渲染，单页也渲染（2026-10-08 用户裁定）：分页器整体消失 ⇒ 读代码 / 看演示的人会
     误判「该列表没有分页」。单页时导航按钮一律禁用，信息行仍给出「共 N 项 · 第 1/1 页」。
     仅**零条**时不渲染 —— 那是空态（无数据），不是「无分页」。 */
  if(total<=0){ el.innerHTML=""; return; }
  const pages=Math.max(1,Math.ceil(total/size)), cur=Math.min(Math.max(1,page||1),pages), one=pages<=1;
  const win=[]; for(let i=Math.max(1,cur-2); i<=Math.min(pages,cur+2); i++) win.push(i);
  /* ★ 2026-10-10（R12）：补 `data-pgr`（角色键）—— 分页按钮此前**没有任何标识属性**
     （只有内联 onclick），整段重渲染后无从复定位，键盘焦点必然掉到 body。
     角色键（first / prev / 页码 / next / last）在重渲染前后稳定，故可按它找回同角色按钮。 */
  const btn=(lb,p,on,dis,k)=>`<button class="b ${on?"on":""}" ${dis?"disabled":""} data-pgr="${k}" onclick="${go}(${p})">${lb}</button>`;
  el.innerHTML=`<div class="pager tight">
    ${btn("« 首页",1,false,one||cur===1,"first")}
    ${btn("‹ 上页",cur-1,false,one||cur===1,"prev")}
    ${win.map(n=>btn(n,n,n===cur,false,n)).join("")}
    ${btn("下页 ›",cur+1,false,one||cur===pages,"next")}
    ${btn("末页 »",pages,false,one||cur===pages,"last")}
    <span class="info">共 ${total} ${unit} · 第 ${cur}/${pages} 页 · ${hint||"勾选/批量作用于当前页"}</span></div>`;
}
/* ★ R61·轮8：签名标记 `_S<key>` **不落盘**（只有 `P<key>` 进快照 `pgc`）⇒ 整页重载后首渲染时
   `_S<key>` 为 undefined，必与当前签名不等 ⇒ 无条件把页码压回 1，`pgc` 的页码持久化**恒失效**
   （资产列表 / 准入策略 / 细粒度五处同款）。改为**首渲染不复位**：签名标记未建立时不判「签名变化」，
   让快照里的页码先生效；此后同会话内签名一变即复位，原语义不变。 */
function pgKeep(key,sig){ const w=window; if(w["_S"+key]!==undefined && w["_S"+key]!==sig){ w["P"+key]=1; } w["_S"+key]=sig; }
function pgPage(key,p){ window["P"+key]=Math.max(1,p); }
function assetPg(p){ pgPage("Asset",p); assetListRender(); }
/* ===== 资源访问协议：候选一律 = 资产类型入口协议 ∩ 资源类型常用（精确交集，不铺开全量协议）===== */
const PROTO_ALL=["HTTP","HTTPS","WebSocket","gRPC","FTP","FTPS","SFTP","SCP","SMB","NFS","SSH","Telnet","RDP","VNC","SMTP","SMTPS","POP3","IMAP","LDAP","LDAPS","MySQL","PostgreSQL","Oracle","SQL Server","Redis","MongoDB","Elasticsearch","MQTT","AMQP","Kafka","自定义 TCP"];
const PROTO_KIND={"页面与静态资源":["HTTP","HTTPS"],"API":["HTTP","HTTPS","gRPC"],"长连接":["WebSocket","HTTP","HTTPS"],"文件传输":["HTTP","HTTPS"],"管理控制台":["HTTP","HTTPS"],"客户端通道":["自定义 TCP"],"远程桌面会话":["RDP","VNC"],"虚拟通道":["RDP","VNC"],"终端会话":["SSH","Telnet"],"文件传输会话":["SFTP","SCP"],"文件共享":["FTP","FTPS","SFTP","SMB","NFS"],"数据库实例":["MySQL","PostgreSQL","Oracle","SQL Server"],"NoSQL 实例":["Redis","MongoDB","Elasticsearch"],"消息与队列":["MQTT","AMQP","Kafka"]};
const PROTO_ASSET={"网页应用":["HTTP","HTTPS","WebSocket","gRPC"],"远程主机":["RDP","VNC","SSH","Telnet"],"文件服务":["FTP","FTPS","SFTP","SMB","NFS"],"数据库":["MySQL","PostgreSQL","Oracle","SQL Server","Redis","MongoDB","Elasticsearch"],"其他 TCP":["MQTT","AMQP","Kafka","自定义 TCP"]};
/* PROTO_ALL 仅作「协议全集」权威清单与校验基准（冒烟断言候选 ⊆ 全集），不作为任何资源类型的候选来源 */
/* Web 类资源类型（= l7 族）：可登记细粒度资源清单（细粒度访问控制）；非 Web 资源类型（terminal / db / file / tcp 族）仅访问入口与打开方式，不承载无端接入代理与细粒度资源清单
   —— 细粒度清单承载以资源类型 kind 为判定依据，而非资产类型：同一资产若同时登记 Web 类 + 非 Web 类资源，资源级按 kind 独立承载；T2~T4 区域按「该资产存在任意 Web 类资源」显隐 */
const WEB_KINDS=["页面与静态资源","API","长连接","文件传输","管理控制台"];
function resourceWebish(r){ return !!(r&&WEB_KINDS.includes(r.kind)); }
function protoIsWeb(p){ return ["HTTP","HTTPS","WebSocket","gRPC"].includes(p); }
/* 匿名开放（路径级「显式公开」/ 资产级整资产匿名）限定：仅 HTTP 协议资源可承载匿名开放；
   WS(S) / gRPC 等长连接与消息类协议不具备幂等的无状态请求语义，不参与匿名（§2.2） */
function protoIsHttp(p){ return ["HTTP","HTTPS","HTTP/2"].includes(p); }
/* 资产已登记资源涉及的全部协议（用于整资产匿名的 HTTP-only 校验） */
function assetProtos(a){
  const set=new Set();
  (a.res||[]).forEach(r=>{
    if((r.paths||[]).length) (r.paths||[]).forEach(p=>{ const pp=pathProto(a,p); if(pp&&pp!=="-") set.add(pp); });
    else if(r.proto) set.add(r.proto);
  });
  if(!set.size&&a.addrProto) set.add(a.addrProto);
  return [...set];
}
function nonHttpProtos(a){ return assetProtos(a).filter(p=>!protoIsHttp(p)); }
/* 当前配置对象是否允许选「显式公开」：非族对象（L7 路径/对象）、资产安全等级为 L1、资源协议为 HTTP 系 */
function canAnonPublic(rq){
  if(!rq||rq.fam||!rq.pt) return false;
  if(!rq.a||rq.a.lv!==1) return false;
  return protoIsHttp(pathProto(rq.a,rq.pt)||"");
}
/* 详情/向导统一判定「可按 Web 资源化（资源与访问 登记 + 细粒度资源清单）」：网页应用恒 true；其它资产按 res 中是否存在任意 Web 类资源 */
function assetWebish(a){
  if(!a) return false;
  if(a.type==="网页应用") return true;
  return (a.res||[]).some(resourceWebish);
}
/* —— 非网页资产「后端服务资源地址」：协议候选 = 资产类型 ∩ 资源类型（kind 缺省取该资产类型的默认资源类型），地址为 host:port[/path]（可含反代子路径）—— */
function nwProtoList(t,kind){ return protoCands(kind||backKindOf(t), t); }
function nwProtoDefault(t,kind){ const l=nwProtoList(t,kind); return l.includes("HTTPS")?"HTTPS":(l[0]||"自定义 TCP"); }
function nwProtoOptions(t,cur,kind){ let list=nwProtoList(t,kind); if(cur&&!list.includes(cur)) list=[cur].concat(list); return list.map(o=>`<option ${o===cur?"selected":""}>${o}</option>`).join(""); }
/* scheme 展示：协议名 → URL scheme（小写；非标准名特例映射） */
function schemeOf(p){ const m={"自定义 TCP":"tcp","SQL Server":"sqlserver"}; return m[p]||String(p||"").toLowerCase(); }
/* 非网页资产访问地址展示：协议://地址（未登记协议时原样地址） */
function addrText(a){ if(a.addrProto) return schemeOf(a.addrProto)+"://"+(a.addr||"—"); return a.addr||"—"; }
/* —— 端口策略（v11p 定稿）：客户多采用非标端口 → 端口不做标准校验约束；仅当用户未提供端口时按协议自动补全默认端口（无默认端口的协议如 自定义 TCP 必须显式填写）—— */
const PORT_OF={HTTP:80,HTTPS:443,WebSocket:443,gRPC:443,FTP:21,FTPS:990,SFTP:22,SCP:22,SMB:445,NFS:2049,SSH:22,Telnet:23,RDP:3389,VNC:5900,MQTT:1883,AMQP:5672,Kafka:9092,MySQL:3306,PostgreSQL:5432,Oracle:1521,"SQL Server":1433,Redis:6379,MongoDB:27017,Elasticsearch:9200,SMTP:25,SMTPS:465,POP3:110,IMAP:143,LDAP:389,LDAPS:636};
function portDefault(p){ return PORT_OF[p]!==undefined?PORT_OF[p]:null; }
/* 解析登记地址字符串 host[:port][/path]（兼容 [IPv6]:port）→ {host,port,path}；port / path 缺省为空串 */
function parseAddr(s){
  s=String(s||"").trim(); if(!s) return {host:"",port:"",path:""};
  let path=""; const pi=s.indexOf("/");
  if(pi>=0){ path=s.slice(pi).replace(/\/+$/,""); s=s.slice(0,pi); }
  let host=s, port="";
  if(s.charAt(0)==="["){ const e=s.indexOf("]"); if(e>0){ host=s.slice(0,e+1); port=s.slice(e+1).replace(/^:/,""); } }
  else { const c=s.lastIndexOf(":"); if(c>0){ host=s.slice(0,c); port=s.slice(c+1); } }
  return {host:host,port:port,path:path};
}
/* 组合登记：host 必填；port 空 → 按协议补默认（无默认则返回 "" 表示需显式填端口）；path 非空时统一以 / 衔接（SMB 共享名亦如此：host:445/share）；host 框误粘 host:port 时自动拆出端口 */
function joinAddr(host,port,path,proto){
  let h=String(host||"").trim();
  if(!h) return "";
  if(/^[a-z][a-z0-9+.-]*:\/\//i.test(h)) h=h.replace(/^[a-z][a-z0-9+.-]*:\/\//i,"");
  h=h.replace(/\/+$/,"");
  let p=(port||"").trim(), pa=(path||"").trim();
  const okp=(x)=>/^\d+$/.test(x)&&+x>=1&&+x<=65535;
  if(p){ if(!okp(p)) return "!"; }
  else if(h.charAt(0)!=="["&&h.indexOf(":")>0){   // host 框误粘 host:port → 拆出端口
    const c=h.lastIndexOf(":"), tail=h.slice(c+1);
    if(okp(tail)){ p=tail; h=h.slice(0,c); } else if(/^\d+$/.test(tail)){ return "!"; }
  }
  let out=h;
  if(p) out+=":"+p;
  else { const d=portDefault(proto); if(!d) return ""; out+=":"+d; }
  if(pa) out+= (pa.charAt(0)==="/")?pa:"/"+pa;
  return out;
}
/* 兼容旧数据：addr 曾内嵌 scheme（如 ssh://host:port）时剥离为 addrProto + addr */
function nwNorm(a){ if(a&&!a.addrProto&&/^[a-z][a-z0-9+.-]*:\/\//i.test(String(a.addr||""))){ a.addrProto=String(a.addr).split(":")[0].toUpperCase(); a.addr=String(a.addr).replace(/^[a-z][a-z0-9+.-]*:\/\//i,""); } return a; }
/* 向导 S2：非网页资产的后端服务资源类型（候选随资产类型）；协议候选以「资产类型 ∩ 资源类型」为准 */
function eaKindCur(t){ const el=$("#eaKind2"); return (el&&el.value)?el.value:backKindOf(t); }
function eaKindFill(t){
  const el=$("#eaKind2"); if(!el) return;
  const arr=KIND_BY_ASSET[t]||KIND_BY_ASSET["网页应用"];
  const d=backKindOf(t);
  const cur=(el.value&&arr.includes(el.value))?el.value:(arr.includes(d)?d:arr[0]);
  el.innerHTML=kindOptions({type:t}, cur);
  el.value=cur;
}
/* 向导内：资源地址协议候选填充（候选 = 资产类型 ∩ 资源类型；cur 为空 → 按候选池推荐默认；编辑回填原值） */
function eaProtoFill(t,cur){
  const sel=$("#eaProto2"); if(!sel) return;
  eaKindFill(t);
  const kind=eaKindCur(t);
  const def=nwProtoDefault(t,kind);
  sel.innerHTML=nwProtoOptions(t,cur||def,kind);
  sel.value=cur||def;
  const h=$("#eaProtoHint2"); if(h) h.textContent="候选 = 资产类型（"+t+"）∩ 资源类型（"+kind+"）："+nwProtoList(t,kind).join(" / ");
  eaAddrHintSync(t);
  const cs=$("#eaClient2"); if(cs){
    const p=sel.value, oldv=cs.value;
    // 客户端默认随协议：仅当用户曾显式选择（dataset.u==="1"）且仍在新协议候选内才保留原值；
    // 否则回落到新协议的默认客户端，避免类型 / 协议切换残留上一协议的自动默认（如 数据库 MySQL→PostgreSQL 仍停 Navicat）
    const keep=(cs.dataset.u==="1"&&oldv&&clientCands(t,p).includes(oldv))?oldv:null;
    cs.innerHTML=clientOptions(p,keep||clientDefault(t,p),t);
    cs.dataset.u=keep?"1":"0";
  }
  eaDesktopUI();
}
/* 地址三框联动提示：端口占位 / 路径占位 / 说明文案 随当前协议与资产类型刷新 */
function eaAddrHintSync(t){
  const pEl=$("#eaProto2"); if(!pEl) return;
  const p=pEl.value, dp=portDefault(p);
  const portEl=$("#eaPort2");
  if(portEl){ portEl.placeholder=dp?("留空补 "+dp):"必填"; portEl.title=dp?("端口可留空：保存时自动补全默认 "+dp+"；非标端口可直接填写"):"该协议无默认端口，必须显式填写端口"; }
  const paEl=$("#eaPath2");
  if(paEl) paEl.placeholder=(p==="SMB")?"共享名（可选）":(t==="数据库"?"库名（可选）":(t==="其他 TCP"&&["MQTT","AMQP","Kafka"].includes(p))?"不填（可选）":"路径 / 子路径（可选）");
  const ah=$("#eaAddrHint2");
  if(ah) ah.innerHTML="分栏录入 <b>主机 : 端口 / 路径</b>。端口可留空，保存时按协议自动补全（"+p+" → "+(dp?"<b>"+dp+"</b>":"<b>需显式填写</b>（该协议无默认端口）")+"）；<b>非标端口可直接填写，不做标准端口约束</b>。路径可选："+(p==="SMB"?"SMB 共享名（如 share → "+schemeOf(p)+"://host:445/share）":(t==="数据库"?"库名（打开客户端时定位库，如 core → "+schemeOf(p)+"://host:"+(dp||"PORT")+"/core）":(t==="其他 TCP"&&["MQTT","AMQP","Kafka"].includes(p)?"不填路径（"+schemeOf(p)+"://host:"+(dp||"PORT")+"；主题 / vhost 在策略侧表达）":"反向代理子路径 / 应用上下文（如 api → "+schemeOf(p)+"://host/api）")));
}
/* 回填：登记地址字符串拆分回三框 */
function eaAddrFill(addr){
  const pa=parseAddr(addr);
  const he=$("#eaHost2"), pe=$("#eaPort2"), th=$("#eaPath2");
  if(he) he.value=pa.host; if(pe) pe.value=pa.port; if(th) th.value=pa.path;
}
/* —— 桌面客户端（本地打开方式）：候选随访问协议；打开时按 {scheme}://{host} 拉起本机客户端 / 系统处理 —— */
const CLIENTS={
  PostgreSQL:["DBeaver","Navicat","pgAdmin","psql（命令行）"],
  MySQL:["Navicat","DBeaver","MySQL Workbench","mysql（命令行）"],
  Oracle:["Navicat","DBeaver","SQL Developer"],
  "SQL Server":["Navicat","DBeaver","SSMS"],
  Redis:["Another Redis Desktop Manager","RedisInsight"],
  MongoDB:["Navicat","MongoDB Compass"],
  SSH:["SecureCRT","Xshell","PuTTY","Windows Terminal"],
  Telnet:["SecureCRT","Xshell","PuTTY"],
  RDP:["微软远程桌面（mstsc）"], VNC:["VNC Viewer"],
  FTP:["FileZilla","WinSCP","Xftp"], FTPS:["FileZilla","WinSCP"], SFTP:["WinSCP","FileZilla","Xftp"],
  SMB:["文件资源管理器"], "自定义 TCP":["自选客户端（注册应用协议）"]
};
/* 客户端候选 = 本地打开方式，随访问协议映射（clientsFor）；客户端登记、版本与合规基线由客户端维度承载，本页仅登记打开方式 */
function clientsFor(p){ return CLIENTS[p]||["系统默认 / 自选客户端"]; }
function clientDef(p){ return clientsFor(p)[0]; }
/* 客户端候选：按访问协议映射（type 参数保留为调用签名，不再参与分流） */
function clientCands(type,p){ return clientsFor(p); }
function clientDefault(type,p){ return clientCands(type,p)[0]; }
function clientOptions(p,cur,type){ let list=clientCands(type,p).slice(); if(cur&&!list.includes(cur)) list=[cur].concat(list); return list.map(o=>`<option ${o===cur?"selected":""}>${o}</option>`).join(""); }
/* 演示：预设客户端在常用终端的安装探测表（白泽有端终端通常内置企业客户端；Postman 等按实际演示部分缺失） */
const CLIENT_INSTALLED={"企业应用客户端（白泽有端）":true,Postman:true,DBeaver:true,Navicat:true,"SecureCRT":true,"微软远程桌面（mstsc）":true,FileZilla:true,Xshell:false,PuTTY:false,WinSCP:false};
function clientInstalled(c){ if(!c||/自选|自定义/.test(c)) return null; return CLIENT_INSTALLED[c]===true; }
function clipText(t){
  const ta=document.createElement("textarea"); ta.value=t; ta.style.position="fixed"; ta.style.opacity="0";
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand("copy"); toast("已复制连接串："+t); }catch(e){ toast("复制失败（演示环境）"); }
  ta.remove();
}
/* —— 地址格式（v11p 定稿）：登记向导分栏录入 主机 / 端口 / 路径；端口仅留空时按协议自动补全默认（非标端口自由填写，不做标准约束）；无默认端口的协议（自定义 TCP 等）必须显式填端口 —— */
const ADDR_FMT={
  "远程主机":{f:"主机 + 端口",p:"RDP 3389 · VNC 5900 · SSH 22 · Telnet 23",n:"不支持子路径；账号由客户端侧解析填写，网关只登记节点"},
  "文件服务":{f:"主机 + 端口 + 路径",p:"FTP 21 · FTPS 990 · SFTP 22 · SMB 445 · NFS 2049",n:"SMB 时路径为共享名（host:445/share）；NFS 时路径为导出路径（host:2049/export）"},
  "数据库":{f:"主机 + 端口 + 路径",p:"关系型 PostgreSQL 5432 · MySQL 3306 · Oracle 1521 · SQL Server 1433；NoSQL Redis 6379 · MongoDB 27017 · Elasticsearch 9200",n:"两者均登记连接实例；库名 / 账号由打开客户端时补全。实例的 Web 管理 / 检索界面（Kibana、pgAdmin、RedisInsight 类）按「管理控制台」单独登记，取其界面地址与端口，与实例端口分列"},
  "其他 TCP":{f:"主机 + 端口 + 路径",p:"MQTT 1883 · AMQP 5672 · Kafka 9092；自定义 TCP 无默认（必填）",n:"路径为反向代理 / 应用上下文前缀（可选）；消息与队列类协议不填路径，主题 / vhost 在策略侧表达"}
};
function nwFmtHint(t){ const f=ADDR_FMT[t]||ADDR_FMT["其他 TCP"]; return "地址分栏录入（"+f.f+"）：端口可留空，保存时按协议自动补全默认（"+f.p+"），非标端口可直接填写、不做标准约束。"+f.n; }
/* —— 资源类型全集（场景化）与配色；资源类型候选随资产类型，覆盖各类实际应用（含 Electron 等客户端形态）—— */
const RES_KINDS={"页面与静态资源":"t-info",API:"t-gray","长连接":"t-ok","文件传输":"t-warn","管理控制台":"t-err","客户端通道":"t-warn","远程桌面会话":"t-warn","虚拟通道":"t-info","终端会话":"t-gray","文件传输会话":"t-warn","文件共享":"t-gray","数据库实例":"t-info","NoSQL 实例":"t-info","消息与队列":"t-warn"};
const RES_KC=RES_KINDS;
/* 资源类型候选随资产类型收敛（F3.2 规则 10 的映射表）；资产类型为封闭五类，API 服务不单列资产类型 */
const KIND_BY_ASSET={
  "网页应用":["页面与静态资源","API","长连接","文件传输","管理控制台","客户端通道"],
  "远程主机":["终端会话","远程桌面会话","虚拟通道","文件传输会话","管理控制台","客户端通道"],
  "文件服务":["文件共享","管理控制台","客户端通道"],
  "数据库":["数据库实例","NoSQL 实例","管理控制台","客户端通道"],
  "其他 TCP":["客户端通道","消息与队列"]
};
/* 资源类型语义边界（F3.2 规则 11）：登记弹窗随所选类型给出提示，防「方向相反 / 语义不同」的两类被合并登记 */
const KIND_NOTE={
  "文件传输":"该入口以文件上下行为主要内容（上传 / 下载方向留在路径与方法上表达，不按方向拆分类型）：上传入口建议启用请求体上限与内容类型白名单，下载入口建议启用限速与 Range 约束（按资产与路径配置）。",
  "管理控制台":"资产的后台 / 运维入口，独立于业务页面登记，便于对该类入口整体加严（认证强度、来源网段、会话录制）。",
  "长连接":"持续连接语义：双向 WebSocket 与单向 SSE / 长轮询同属此类，方向由协议与子协议表达、不另拆类型；本类存量连接生命周期最长，排空上限（资源级参数）对其影响最显著，建议按业务连接特征上调。",
  "页面与静态资源":"人机界面及其被引用的子资源（HTML / CSS / JS / 图片 / 字体）；按路径与方法判定，不按响应内容类型区分。",
  "客户端通道":"兜底能力：承载无法归入既有类型的自定义 / 专有协议，按目标地址判定，全资产类型可选。",
  "消息与队列":"发布订阅类中间件（MQTT / AMQP / Kafka），按主题授权，不并入「客户端通道」。",
  "文件传输会话":"承载于终端之上的文件通道（SFTP / SCP），与交互式「终端会话」分开登记；支持经平台内置 Web-SFTP 在浏览器内使用——与同主机终端会话的承载方式须一致（终端走 WebSSH 时本类不得回落桌面客户端，以免文件动作绕开网关侧审计），也可经桌面客户端访问。文件不直连目标，一律经安全中转站两段式完成——① 投递：先上传到中转站（隔离暂存）；② 领取：目标侧 / 任务从中转站取走，取到后任务才正式开始；投递时完成内容检测，不通过 / 逾期未领取 / 中转站不可达即拒绝并告警。",
  "虚拟通道":"远程桌面会话内的可管控通道（剪贴板 / 磁盘映射 / 打印机 / 音频 / 摄像头），各项可分别置为允许或拒绝。",
  "NoSQL 实例":"自「数据库实例」拆出，取值域为键值 / 文档 / 检索类实例；其检索 / 管理界面（如 Elasticsearch 的 Kibana）按「管理控制台」单独登记，地址取该界面入口，与实例端口分列。",
  "数据库实例":"关系型实例（MySQL / PostgreSQL / Oracle / SQL Server）；其 Web 管理界面（pgAdmin / phpMyAdmin / 堡垒机控制台类）按「管理控制台」单独登记，不与实例端口混登。",
  "API":"机器对机器接口，无浏览器会话承载；以资源 × 方法 × 路径登记细粒度条目，与人机页面分开，便于对数据接口单独加严与全量请求审计。",
  "远程桌面会话":"图形化远程会话（RDP / VNC）；会话内的剪贴板 / 磁盘映射 / 打印机等按「虚拟通道」单独登记，与本类分开表达。",
  "终端会话":"字符终端会话（SSH / Telnet）；经平台 WebSSH 打开时指令级审计与危险指令过滤随行，其文件通道按「文件传输会话」单独登记、承载方式与之一致（终端走 WebSSH 时文件通道走内置 Web-SFTP）。",
  "文件共享":"面向目录协议的原生共享入口（FTP / FTPS / SFTP / SMB / NFS），路径即共享名 / 导出路径；默认只读、写与删除单独开放。与人机页面的 HTTP 文件上下行不同，后者归「文件传输」。"
};
/* 资源类型的默认安全基线建议（F3.2 规则 13）：仅作登记与配置时的建议，不自动生效、不改判定、不阻断保存；
   认证强度建议高于一期承载上限 L2 时，说明行标注「待二期承载后生效」（F5.3） */
const KIND_BASE={
  "页面与静态资源":"认证 ≥ L1（登录即可）· 无来源限制 · 常规访问审计",
  "API":"认证 ≥ L2 · 按敏感度分级设定认证强度 · 全量请求审计",
  "长连接":"认证 ≥ L2 · 限制单连接时长与并发数 · 全量会话审计",
  "文件传输":"认证 ≥ L3 · 请求体上限 20MB 与内容类型白名单 · 文件动作全量审计",
  "管理控制台":"认证 ≥ L4 · 限制来源网段 · 会话录制",
  "客户端通道":"认证 ≥ L3 · 目标地址白名单 · 全量连接审计",
  "远程桌面会话":"认证 ≥ L3 · 会话录制 · 剪贴板与磁盘映射默认拒绝",
  "虚拟通道":"各通道分别设定：剪贴板与磁盘映射默认拒绝，打印机 / 音频按需开放",
  "终端会话":"认证 ≥ L4 · 命令集白名单 · 会话录制",
  "文件传输会话":"认证 ≥ L4 · 目录白名单 · 强制安全中转（两段式投递 + 病毒扫描 / DLP 检测）· 文件动作审计独立于命令审计",
  "文件共享":"认证 ≥ L3 · 目录白名单 · 默认只读，写与删除单独开放",
  "数据库实例":"认证 ≥ L4 · 来源限定管理网段 · 语句类别默认只读",
  "NoSQL 实例":"认证 ≥ L4 · 来源限定管理网段 · 键空间白名单",
  "消息与队列":"认证 ≥ L3 · 主题白名单 · 全量发布订阅审计"
};
function baseNoteText(kind){
  const base=KIND_BASE[kind]; if(!base) return "默认安全基线建议：按资产安全等级与访问来源设定。";
  let t="默认安全基线建议："+base+"（建议性质，不自动生效、不改判定、不阻断保存）";
  if(base.indexOf("L3")>=0||base.indexOf("L4")>=0||base.indexOf("L5")>=0){
    t+="；其中认证强度建议高于一期承载上限 L2 —— 一期按 L2 承载并在策略中标注「待二期承载后生效」";
  }
  return t;
}
function kindNoteSet(px, kind){
  const kn=document.getElementById(px+"KindNote");
  if(kn) kn.textContent = KIND_NOTE[kind] || "资源类型候选随资产类型收敛（按映射表）；类型创建后不可直接修改，需按目标类型重新登记迁移。";
  const bn=document.getElementById(px+"BaseNote");
  if(bn) bn.textContent = baseNoteText(kind);
}
function kindOptions(a,cur){ /* 资源类型候选随资产类型；旧数据 cur 不在候选时并入不丢 */
  let arr=KIND_BY_ASSET[a.type]||KIND_BY_ASSET["网页应用"];
  if(cur&&!arr.includes(cur)) arr=[cur].concat(arr);
  return arr.map(k=>`<option ${k===cur?"selected":""}>${k}</option>`).join("");
}
/* 协议候选 = 资产类型入口协议 ∩ 资源类型常用（精确交集，不再铺开全量协议）；
   交集为空时回落该资源类型自身可用协议（如数据库资产的「管理控制台」→ HTTP/HTTPS、远程主机资产的「文件传输会话」→ SFTP/SCP）；
   无法归入既有类型的自定义 / 专有协议统一由「客户端通道」承担，不以下拉兜底项承载。
   isMain 保留于签名以兼容既有调用点：主资源与附属资源同一口径（候选均由「资产类型 ∩ 资源类型」决定）。 */
function protoCands(kind,assetType){
  const rec=PROTO_KIND[kind]||[];
  const at=assetType?(PROTO_ASSET[assetType]||null):null;
  /* 未登记资源类型（演示 / 迁移中的旧数据）不铺开全量协议：资产类型已知时收敛到该资产类型的入口协议集
     （候选仍受该资产承载范围约束），资产类型亦未知时才收至兜底能力「客户端通道」口径（自定义 TCP）。 */
  if(!rec.length) return at?at.slice():["自定义 TCP"];
  if(!at) return rec.slice();
  const both=rec.filter(x=>at.includes(x));
  return both.length?both:rec.slice();
}
function protoOptions(kind,isMain,assetType,cur){
  const list=protoCands(kind,assetType);
  if(cur&&!list.includes(cur)) list=[cur].concat(list);
  return list.map(o=>`<option ${o===cur?"selected":""}>${o}</option>`).join("");
}
/* 推荐默认：已登记回填原值；新建时按「资产类型 ∩ 资源类型」候选池取推荐（HTTP 类场景优先 HTTPS） */
function protoRec(a,r){
  if(r.proto) return r.proto;
  const pool=protoCands(r.kind, a&&a.type);
  return pool.includes("HTTPS")?"HTTPS":(pool[0]||"自定义 TCP");
}
/* 超时 / 健康检查：结构化数字字段为权威（toC/toR/toK、hcOn/hcMode/hcInt/hcFail/hcAct/hcRec…），展示文案一律派生 */
/* 探测协议族随访问协议联动：HTTP 系（HTTP/HTTPS/WebSocket/gRPC）走 HTTP(S) 探活；其余（数据库/SSH/RDP/FTP/SMB/自定义 TCP 等）走 TCP 端口探活 */
function httpLikeProto(p){ return ["HTTP","HTTPS","WebSocket","gRPC"].includes(p); }
function hcProbeDef(p){ return httpLikeProto(p)?(p==="HTTPS"?"HTTPS":"HTTP"):"TCP"; }
function hcProbeCands(p){ return httpLikeProto(p)?["HTTP","HTTPS"]:["TCP"]; }
function hcProbeOptions(cur,proto){ const cs=hcProbeCands(proto), v=cs.includes(cur)?cur:(hcProbeDef(proto)||cs[0]||"HTTP"); return cs.map(c=>`<option ${c===v?"selected":""}>${c}</option>`).join(""); }
function toText(r){ return "连接 "+(r.toC||3)+"s / 读写 "+(r.toR||60)+"s / keepalive "+(r.toK||32)+"s / 排空上限 "+(r.drainMax||300)+"s"; }
function hcText(r){
  if(r.hcOn===0) return "健康检查已停用（仅凭网关连接成败判定）";
  const mode=r.hcMode||"被动观察";
  const pv=r.hcProbe||hcProbeDef(r.proto)||"TCP";
  const tail=" · 连续失败 "+(r.hcFail||2)+" 次"+(r.hcAct==="仅告警"?"仅告警":"自动摘除")+" · "+(r.hcRec||"自动试探恢复");
  /* ★ R61：被动观察没有「探查间隔」这个参数（编辑弹窗对被动观察隐藏 HcIntRow，见 hcModeSync）——
     原实现无条件拼「每 N s」，把不可配置项显示成已配置事实。仅主动探测呈现探测间隔。 */
  if(mode!=="主动探测") return "被动观察（既有请求成败采样）"+tail;
  return "主动探测（"+(httpLikeProto(pv)?(pv+" "+r.hcPath+" 期望 "+(r.hcCode||"200")):"TCP 节点端口")+"） · 每 "+(r.hcInt||10)+"s"+tail;
}
// 匹配语义由路径自动派生（无需人工选择，可组合叠加，特征彼此独立）：
//   {参数}      → 参数化（单层段变量，匹配并捕获一段）
//   独立段 **   → ** 多段通配（跨零至任意层级，如 a 层下 ** 再 b 层、或尾部 ** 开放）
//   末尾整段 *  → 前缀（开放其后任意子路径，含多层，如 /static/*、/{id}/txns/*）
//   其余 *（中缀或文件名部分，如 a*b、中间段 *、*.html）→ * 通配（仅单层或段内片段，不跨层级）
//   均无        → 精确
// 转正则执行示意：{p}→[^/]+ 且捕获；独立段 **→(?:[^/]+/)*；*→[^/]*（前缀等价 ^前缀 开放）
function mtTags(p){
  const s=String(p||"").trim(), tags=[];
  if(!/[*{]/.test(s)) return ["精确"];
  if(/\{[^}]+\}/.test(s)) tags.push("参数化");
  if(/(^|\/)\*\*(\/|$)/.test(s)) tags.push("** 多段通配");
  const tail=s.slice(s.lastIndexOf("/")+1);
  if(tail==="*"||s==="*") tags.push("前缀");
  const stripped=s.replace(/(^|\/)\*\*(\/|$)/g,"$1$2").replace(/\/\*$/,"").replace(/^\*$/,"");
  if(/[*]/.test(stripped)) tags.push("* 通配");
  return tags;
}
function mtOf(p){ return mtTags(p).join(" · ")||"精确"; }
function resDefault(r){
  if(r.proto==undefined){ const m0=String((r.nodes||[])[0]||"").match(/:(\d{2,5})(?:\/|$)/); const pp=m0?m0[1]:""; r.proto=(pp==="443"||pp==="8443")?"HTTPS":"HTTP"; }
  if(r.lb==undefined) r.lb="轮询";
  if(r.lbWeights==null||!Array.isArray(r.lbWeights)) r.lbWeights=(r.nodes||[]).map(()=>1);
  if(r.lbWeights.length!==(r.nodes||[]).length){
    const fixed=(r.nodes||[]).map((_,i)=>r.lbWeights[i]||1); r.lbWeights=fixed;
  }
  if(r.toC==null){ const m=String(r.to||"").match(/(\d+)\s*s?\s*\/[^0-9]*(\d+)\s*s?\s*\/[^0-9]*(\d+)/); r.toC=m?+m[1]:3; r.toR=m?+m[2]:60; r.toK=m?+m[3]:32; delete r.to; }
  if(r.hcOn==null){ r.hcOn=1; r.hcMode="被动观察"; r.hcInt=r.hcInt||10; r.hcFail=r.hcFail||2; r.hcAct="自动摘除"; r.hcRec="自动试探恢复"; r.hcProbe=hcProbeDef(r.proto); r.hcPath="/healthz"; r.hcCode="200"; delete r.hc; }
}
/* 列表资源行：内部节点 chips 默认折叠显示（前 2 个 + 「等 N」计数）；≤2 时全显；lbAlgo=加权随机 时 chip 后追加 (w=N) */
function resNodesChipsHtml(r){
  const nodes=r.nodes||[], t=nodeTally(r);
  if(nodes.length<=2) return nodes.map(x=>nodeChipHtml(r,x)).join("");
  const head=nodes.slice(0,2).map(x=>nodeChipHtml(r,x)).join("");
  const rest=nodeTallyText(r);
  const more=`<span class="tag t-gray" style="margin:2px 6px 2px 0" title="还有 ${nodes.length-2} 个后端节点（${rest}）；点「管理」查看 / 编辑">等 ${nodes.length-2} 个</span>`;
  return head+more;
}
/* ============ 后端服务资源：行渲染 / 即时切换 / 登记弹窗（v11q） ============ */
/* 资源卡行：地址 + 打开方式（平台内嵌会话 WebSSH/WebRDP/WebVNC/Web-SFTP 或桌面客户端）+ 客户端 + 指令审计；后端协议切换联动打开方式候选 */
function backResRow(a,r,gi){
  const KC=RES_KC, tw=TERM_WAYS[r.proto]||"";
  const addr=backResText(r);
  const open=r.open||wayDefault(r.proto);
  const showOpen=!!tw, showClient=!tw||open==="desktop";
  const openBtn=tw
    ? (open==="web"
        ? `<button class="btn sm primary" onclick="openWebSession('${a.id}','${r.id}')">打开 ${tw}</button>`
        : `<button class="btn sm primary" onclick="openDesktopRes('${a.id}','${r.id}')">打开客户端</button>`)
    : `<button class="btn sm primary" onclick="openDesktopRes('${a.id}','${r.id}')">打开客户端</button>`;
  return `<div class="rule">
    <div class="rule-h"><span class="idx">R${String(gi).padStart(2,"0")}</span>
      <b>${xesc(r.name)}</b><span class="tag ${KC[r.kind]||"t-gray"}">${r.kind}</span>
      ${tw?`<span class="tag ${open==="web"?"t-info":"t-gray"}">${open==="web"?tw+" · 平台会话":"桌面客户端"}</span>`:""}
      <span class="muted" style="margin-left:auto">${addr?xesc(addr):"—"}</span>
      ${openBtn}
      <button class="btn sm" onclick="editRes('${r.id}')">编辑</button>
      <button class="btn sm danger" onclick="delRes('${r.id}')">删除</button></div>
    <div class="conds-wrap" style="padding-top:2px">
      <div class="kv"><span class="k">访问协议</span>
        <select onchange="setBackProto('${r.id}',this.value)" title="候选 = 资产类型（${a.type}）∩ 资源类型（${r.kind}）；不铺开全量协议">${nwProtoOptions(a.type,r.proto,r.kind)}</select>
        <div class="muted" style="grid-column:1 / -1">候选 = 资产类型（${a.type}）∩ 资源类型（${r.kind}）：${nwProtoList(a.type,r.kind).join(" / ")}；切换即时生效、变更入审计，2 秒内全节点收敛。</div></div>
      <div class="kv"><span class="k">后端资源地址</span><div><span class="kr">${xesc(addr)||"—"}</span>
        <span class="muted" style="margin-left:6px">完整入口 ${schemeOf(r.proto)}://${xesc(addr)||"—"}</span>
        <button class="btn sm" style="margin-left:8px" onclick="editRes('${r.id}')">重新登记</button></div></div>
      ${showOpen?`<div class="kv"><span class="k">打开方式</span><div>
        <span class="rmode" style="margin:0">
          <label class="${open==="web"?"on":""}"><input type="radio" name="way_${r.id}" value="web" ${open==="web"?"checked":""} onchange="setBackOpen('${r.id}','web')">${tw}（平台 · 默认）</label>
          <label class="${open==="desktop"?"on":""}"><input type="radio" name="way_${r.id}" value="desktop" ${open==="desktop"?"checked":""} onchange="setBackOpen('${r.id}','desktop')">桌面客户端</label>
        </span>
        <div class="muted" style="grid-column:1 / -1">${open==="web"
          ? "默认经平台 "+tw+" 在浏览器内访问："+((r.kind==="文件传输会话")?"文件动作（上传 / 下载 / 删除）逐条审计、目录白名单校验随行，与同主机终端会话共用同一审计链路；":"会话与指令全程审计随行；")
          : "已切换桌面客户端访问：经本机客户端直连后端，不在网关侧留下"+((r.kind==="文件传输会话"||r.kind==="终端会话")?"文件 / 指令动作":"指令")+"审计；"}</div></div></div>`:""}
      ${showClient?`<div class="kv"><span class="k">桌面客户端</span><div>
        <select onchange="setBackClient('${r.id}',this.value)" title="本地打开方式；候选随访问协议">${clientOptions(r.proto,r.client||clientDefault(a.type,r.proto),a.type)}</select>
        <div class="muted" style="font-size:12.5px;margin-top:4px">${r.client?"已绑定「"+xesc(r.client)+"」":"未绑定 · 打开时按协议推荐「"+clientDefault(a.type,r.proto)+"」"}；绑定变更入审计<span id="bkDet_${r.id}" style="margin-left:6px"></span></div></div></div>`:""}
      ${fileRelayApplies(a,r)?`<div class="kv" style="padding-top:6px; border-top:1px dashed var(--line)"><span class="k">文件安全中转</span><div>
        <span class="tag t-info">强制启用</span>
        <span class="muted" style="margin-left:6px">${relayText(r)}</span>
        <button class="btn sm" style="margin-left:8px" onclick="openRelayDlg('${r.id}')">配置检测项</button></div></div>`:""}
      ${(r.proto==="SSH"||r.proto==="Telnet")?`<div class="kv" style="padding-top:6px; border-top:1px dashed var(--line)"><span class="k">指令审计与过滤</span><div>
        <span class="muted">WebSSH 会话指令级审计与危险指令过滤为网关能力（要求见 PRD 一期），指令与告警在审计中心检索；本原型不做页面承载。</span></div></div>`:""}
    </div></div>`;
}
function setBackProto(rid,v){
  const a=ctxAsset(), r=(a.res||[]).find(x=>x.id===rid); if(!r) return;
  const nextOpen = !TERM_WAYS[v] ? "desktop" : (r.open!=="desktop" ? "web" : "desktop");
  const we=wayConsistErr(a,r,nextOpen,v);      /* 承载方式一致性：改协议后的拟取值与同主机配对资源冲突则拒绝 */
  if(we){ toast(we); backRerender(a); return; }
  r.proto=v; r.open=nextOpen;
  if(r.open==="desktop"&&r.client&&!clientCands(a.type,v).includes(r.client)) r.client=null;
  backRerender(a);
  toast("访问协议已设为「"+v+"」，入口 "+schemeOf(v)+"://"+backResText(r)+"（变更入审计，2 秒内全节点生效）（演示）");
}
function setBackOpen(rid,v){
  const a=ctxAsset(), r=(a.res||[]).find(x=>x.id===rid); if(!r) return;
  const we=wayConsistErr(a,r,v);                 /* 承载方式一致性：同主机终端为平台会话时，文件通道不得改桌面客户端 */
  if(we){ toast(we); backRerender(a); return; }
  r.open=v;
  const wrap=document.querySelectorAll("#addrWrap .rule");  // 同步 rmode 视觉（label .on ↔ input.checked）
  wrap.forEach(w=>{ w.querySelectorAll('input[name="way_'+rid+'"]').forEach(inp=>{ const lb=inp.closest("label"); if(lb) lb.classList.toggle("on", inp.checked); }); });
  backRerender(a);
  toast((v==="web"?"打开方式已切换为平台 "+TERM_WAYS[r.proto]+" 会话（浏览器内访问）":"打开方式已切换为桌面客户端（经本机客户端访问）")+"（演示）");
}
function setBackClient(rid,v){
  const a=ctxAsset(), r=(a.res||[]).find(x=>x.id===rid); if(!r) return;
  r.client=v; backRerender(a);
  toast("桌面客户端已绑定「"+v+"」，打开时调用该客户端（演示）");
}
/* —— 后端服务资源登记 / 编辑表单（非网页资产；三框地址 + 打开方式 + 客户端）—— */
function backFormHtml(a,r,defProto){
  const twCand=(a.type==="远程主机");
  const kind=(r&&r.kind)||backKindOf(a.type);
  const proto=(r&&r.proto)||defProto||nwProtoDefault(a.type,kind);
  const tw=TERM_WAYS[proto]||"";
  const open=(r&&r.open)||wayDefault(proto);
  const sel=(v,opts)=>opts.map(o=>`<option ${o===v?"selected":""}>${o}</option>`).join("");
  return `<div class="form-grid">
      <div class="fld"><label>资源名称 <span class="req">*</span></label><input type="text" id="bkName" value="${r?xesc(r.name):""}" placeholder="如：生产库主实例 / 堡垒机运维入口"></div>
      <div class="fld"><label>资源类型</label><select id="bkKind" onchange="bkFormSync(${twCand})">${kindOptions(a,kind)}</select></div>
      <div class="fld"><label>访问协议 <span class="req">*</span></label><select id="bkProto" data-k="${kind}" onchange="bkFormSync(${twCand})">${nwProtoOptions(a.type,proto,kind)}</select></div>
      <div class="fld full" style="border-top:1px dashed var(--line); padding-top:10px"><label>后端服务资源地址 <span class="req">*</span></label>
        <div style="display:flex; gap:6px; align-items:center">
          <input type="text" id="bkHost" value="${r?(xesc(r.host)||""):""}" placeholder="主机：IP / 域名" style="flex:1 1 44%">
          <span class="muted">:</span>
          <input type="text" id="bkPort" inputmode="numeric" value="${r?(xesc(r.port)||""):""}" placeholder="端口（留空补默认）" style="flex:0 0 92px" title="端口可留空：保存时按协议自动补全默认端口；非标端口直接填写">
          <span class="muted">/</span>
          <input type="text" id="bkPath" value="${r?(xesc(r.path)||""):""}" placeholder="${proto==="SMB"?"共享名":"路径 / 子路径（可选）"}" style="flex:1 1 34%">
        </div>
        <div class="help" id="bkAddrHint">${backAddrHint(a.type,proto)}</div></div>
      ${tw?`<div class="fld full"><label>打开方式</label>
        <span class="rmode" id="bkWay">
          <label class="${open==="web"?"on":""}"><input type="radio" name="bkWay" value="web" ${open==="web"?"checked":""} onchange="bkWaySync()">${tw}（平台 · 默认）</label>
          <label class="${open==="desktop"?"on":""}"><input type="radio" name="bkWay" value="desktop" ${open==="desktop"?"checked":""} onchange="bkWaySync()">桌面客户端</label>
        </span>
        <div class="help" id="bkWayHint">${open==="web"?"经平台 "+tw+" 在浏览器内访问（SSH 会话指令审计与危险指令过滤随行）；":"经本机桌面客户端访问"}</div></div>`:""}
      ${!tw||open==="desktop"?`<div class="fld" style="${tw?"":"grid-column:1 / -1"}"><label>桌面客户端 <span class="muted" style="font-weight:400">候选随访问协议</span></label>
        <select id="bkClient" ${tw&&open==="web"?"disabled":""} title="${tw&&open==="web"?"平台会话打开，无需绑定客户端":"本地打开方式"}">${(tw&&open==="web")?clientOptions(proto,clientDefault(a.type,proto),a.type):clientOptions(proto,(r&&r.client)||clientDefault(a.type,proto),a.type)}</select>
        <div class="help" id="bkClientHint">${(tw&&open==="web")?"平台会话打开，无需绑定桌面客户端；切换「桌面客户端」后此处启用。":"未绑定时打开按协议推荐默认客户端。"}</div></div>`:""}
      <input type="hidden" id="bkOpen" value="${open}">
    </div>`;
}
function backAddrHint(t,p){ const dp=portDefault(p); return "分栏录入 主机 : 端口 / 路径。端口可留空按协议自动补全默认（"+p+" → "+(dp?dp:"需显式填写（无默认端口）")+"），非标端口自由填写；"+(p==="SMB"?"SMB 路径为共享名。":(t==="数据库"?"路径为库名（客户端定位库，可选）。":(t==="其他 TCP"&&["MQTT","AMQP","Kafka"].includes(p)?"消息与队列类协议不填路径（主题 / vhost 在策略侧表达）。":"路径为反向代理 / 应用上下文（可选）。"))); }
/* 后端表单联动：协议/资源类型变化 → 打开方式与客户端刷新 */
function bkFormSync(isTerm){
  const pEl=$("#bkProto"); if(!pEl) return;
  /* 资源类型变化 → 协议候选重算为「资产类型 ∩ 资源类型」；原值仍在候选内则保留，否则回落候选池推荐项 */
  const kEl=$("#bkKind"), at=(ctxAsset()&&ctxAsset().type)||"其他 TCP", k=kEl?kEl.value:"";
  if(pEl.dataset.k!==k){
    const old=pEl.value, list=nwProtoList(at,k);
    pEl.innerHTML=nwProtoOptions(at,(old&&list.includes(old))?old:nwProtoDefault(at,k),k);
    pEl.dataset.k=k;
  }
  const p=pEl.value, tw=TERM_WAYS[p]||"";
  const ah=$("#bkAddrHint"); if(ah) ah.textContent=backAddrHint(ctxAsset()?ctxAsset().type:"",p);
  const wayBox=$("#bkWay");
  if(wayBox){
    if(tw){
      wayBox.style.display="";
      const cur=(($("#bkOpen").value||"web")==="desktop")?"desktop":"web";
      wayBox.innerHTML=`<label class="${cur==="web"?"on":""}"><input type="radio" name="bkWay" value="web" ${cur==="web"?"checked":""} onchange="bkWaySync()">${tw}（平台 · 默认）</label>
        <label class="${cur==="desktop"?"on":""}"><input type="radio" name="bkWay" value="desktop" ${cur==="desktop"?"checked":""} onchange="bkWaySync()">桌面客户端</label>`;
      $("#bkWayHint").textContent=cur==="web"?"经平台 "+tw+" 在浏览器内访问（"+((p==="SFTP"||p==="SCP")?"文件动作逐条审计、目录白名单校验随行，与同主机终端会话共用同一审计链路":"会话指令级审计与危险指令过滤随行")+"）；":"经本机桌面客户端访问（不在网关侧留下"+((p==="SFTP"||p==="SCP")?"文件动作":"指令")+"审计）；";
    } else {
      wayBox.style.display="none"; $("#bkOpen").value="desktop";
      const cs=$("#bkClient"); if(cs){ cs.disabled=false; cs.innerHTML=clientOptions(p,clientDefault(ctxAsset()?ctxAsset().type:"",p),ctxAsset()?ctxAsset().type:"网页应用"); }
      const clRow=cs?cs.closest(".fld"):null; if(clRow) clRow.style.display="";
    }
  }
  bkWaySync();
}
function bkWaySync(){
  const wb=$("#bkWay"); if(!wb) return;
  const open=(wb.querySelector('input[name="bkWay"]:checked')||{}).value||"web";
  $("#bkOpen").value=open;
  wb.querySelectorAll("label").forEach(l=>{ const inp=l.querySelector("input"); if(inp) l.classList.toggle("on",inp.checked); });
  const hint=$("#bkWayHint");
  const hp=$("#bkProto")?$("#bkProto").value:"", hfto=(hp==="SFTP"||hp==="SCP"), hw=TERM_WAYS[hp]||"平台会话";
  if(hint) hint.textContent=open==="web"
    ? "经平台 "+hw+" 在浏览器内访问（"+(hfto?"文件动作逐条审计、目录白名单校验随行，与同主机终端会话共用同一审计链路":"会话指令级审计与危险指令过滤随行")+"）；"
    : "经本机桌面客户端访问（不在网关侧留下"+(hfto?"文件动作":"指令")+"审计）；";
  const cs=$("#bkClient");
  if(cs){
    const tw=TERM_WAYS[$("#bkProto").value]||"";
    const p=$("#bkProto").value;
    if(tw&&open==="web"){ cs.disabled=true; cs.innerHTML=clientOptions(p,clientDefault(ctxAsset()?ctxAsset().type:"",p),ctxAsset()?ctxAsset().type:"网页应用"); const row=cs.closest(".fld"); if(row) row.style.display="none"; }
    else { cs.disabled=false; cs.innerHTML=clientOptions(p,cs.value||clientDefault(ctxAsset()?ctxAsset().type:"",p),ctxAsset()?ctxAsset().type:"网页应用"); const row=cs.closest(".fld"); if(row) row.style.display=""; }
  }
}
function addBackRes(){
  const a=ctxAsset();
  openDlg("添加后端服务资源","登记该项资产的后端连接目标（协议 + 主机 / 端口 / 路径）。远程主机类资源可选择打开方式：默认平台内嵌会话（终端 WebSSH / 远程桌面 WebRDP · WebVNC / 文件传输 Web-SFTP），也可切换桌面客户端——同一主机上终端与文件通道的承载方式须一致。",
    backFormHtml(a,null,null),"xl");
  $("#dlg1Ok").onclick=()=>{
    const name=$("#bkName").value.trim(), kind=$("#bkKind").value, proto=$("#bkProto").value;
    const host=$("#bkHost").value.trim(), port=$("#bkPort").value.trim(), path=$("#bkPath").value.trim();
    const open=$("#bkOpen").value||wayDefault(proto);
    let client=null;
    if(open==="desktop"||!TERM_WAYS[proto]) client=$("#bkClient").value||null;
    if(!name){ markBad($("#bkName"), true); toast("资源名称为必填"); return;}
    const we=wayConsistErr(a,{id:"",kind:kind,proto:proto,open:open},open,proto);
    if(we){toast(we); return;}
    if(!host){ markBad($("#bkHost"), true); toast("后端服务资源地址：主机（IP / 域名）为必填"); return;}
    if(port&&(!/^\d+$/.test(port)||+port<1||+port>65535)){ markBad($("#bkPort"), true); toast("端口需为 1~65535 的数字（留空自动补默认端口）"); return;}
    if(!port&&!portDefault(proto)){ markBad($("#bkPort"), true); toast("协议「"+proto+"」无默认端口，需显式填写端口（1~65535）"); return;}
    if(a.anon==="asset"&&!protoIsHttp(proto)){ markBad($("#bkProto"), true); toast("该资产已整资产匿名开放，仅允许登记 HTTP 协议资源（当前协议 "+proto+"）"); return;}
    a.res=a.res||[];
    const r={id:resNextId(a),name:name,kind:kind,proto:proto,host:host,port:port,path:path,open:open,client:client,paths:[]};
    a.res.push(r);
    closeDlg(); backRerender(a);
    toast("已添加后端服务资源「"+name+"（"+proto+" → "+joinAddr(host,port,path,proto)+"）」"+(TERM_WAYS[proto]?"，默认 "+TERM_WAYS[proto]+" 访问":"")+"（演示）");
  };
}
function editBackRes(a,r){
  openDlg("编辑后端服务资源","资源类型与访问协议切换会联动候选；地址变更即时同步资产入口与列表（2 秒内全节点收敛，变更入审计）。同一主机上终端会话与文件传输会话的承载方式须一致。",
    backFormHtml(a,r,r.proto),"xl");
  const way=r.open||wayDefault(r.proto), tw=TERM_WAYS[r.proto];
  if(!tw||way==="desktop"){
    const cs=$("#bkClient"); if(cs&&!cs.disabled) cs.innerHTML=clientOptions(r.proto,r.client||clientDefault(a.type,r.proto),a.type);
  }
  $("#dlg1Ok").onclick=()=>{
    const name=$("#bkName").value.trim(), kind=$("#bkKind").value, proto=$("#bkProto").value;
    const host=$("#bkHost").value.trim(), port=$("#bkPort").value.trim(), path=$("#bkPath").value.trim();
    const open=$("#bkOpen").value||r.open||wayDefault(proto);
    if(!name){ markBad($("#bkName"), true); toast("资源名称为必填"); return;}
    if(!host){ markBad($("#bkHost"), true); toast("后端服务资源地址：主机（IP / 域名）为必填"); return;}
    if(port&&(!/^\d+$/.test(port)||+port<1||+port>65535)){ markBad($("#bkPort"), true); toast("端口需为 1~65535 的数字（留空自动补默认端口）"); return;}
    if(!port&&!portDefault(proto)){ markBad($("#bkPort"), true); toast("协议「"+proto+"」无默认端口，需显式填写端口（1~65535）"); return;}
    if(a.anon==="asset"&&!protoIsHttp(proto)){ markBad($("#bkProto"), true); toast("该资产已整资产匿名开放，仅允许登记 HTTP 协议资源（当前协议 "+proto+"）"); return;}
    const we=wayConsistErr(a,{id:r.id,kind:kind,proto:proto,open:open},open,proto);
    if(we){toast(we); return;}
    r.name=name; r.kind=kind; r.proto=proto; r.host=host; r.port=port; r.path=path; r.open=open;
    r.client=(open==="desktop"||!TERM_WAYS[proto])?($("#bkClient").value||null):null;
    closeDlg(); backRerender(a);
    toast("后端服务资源「"+name+"」已保存："+joinAddr(host,port,path,proto)+"（变更入审计）（演示）");
  };
}
function backRerender(a){
  syncAssetFromRes(a);
  const t=$("#detAddr"); if(t) t.textContent=addrText(a);
  renderRes(a); assetListRender();
}
function renderRes(a){
  const list=a.res||[];
  list.forEach(r=>{ if(!isBackRes(r)) resDefault(r); });
  const total=list.length;
  if(!a._resPage||a._resPage<1) a._resPage=1;
  const pages=Math.max(1,Math.ceil(total/RES_PAGE));
  if(a._resPage>pages) a._resPage=pages;
  const slice=list.slice((a._resPage-1)*RES_PAGE, a._resPage*RES_PAGE);
  const KC=RES_KC;
  const LB=["轮询","最少连接","源地址哈希","随机","加权随机"];
  const emptyTip=a.type==="网页应用"
    ? "「+ 添加资源」登记（每项资源独立承载细粒度资源清单）"
    : "「+ 添加资源」登记后端服务资源（协议 + 主机 / 端口 / 路径 · 打开方式 · 客户端）";
  const _outRes=(a.res||[]).filter(r=>(r.nodes||[]).length&&nodeAllOut(r));
  const _outBanner=_outRes.length
    ? `<div class="note red" style="margin:0 0 10px"><b>资源无可用上游</b>：${_outRes.map(r=>xesc(r.name)).join("、")} 的全部节点均不在服务面（无「在线」或「下线中」节点）——相关请求返回 <b>502</b>，不静默降级。请在对应资源卡的「内部节点」处恢复节点或补充节点。</div>`
    : "";
  $("#addrWrap").innerHTML=_outBanner+(slice.length?slice.map((r,i)=>{
    const gi=(a._resPage-1)*RES_PAGE+i+1;
    if(isBackRes(r)) return backResRow(a,r,gi);
    return `<div class="rule">
    <div class="rule-h"><span class="idx">R${String(gi).padStart(2,"0")}</span>
      <b>${esc(r.name)}</b><span class="tag ${KC[r.kind]||"t-gray"}">${r.kind}</span>${r.main?'<span class="badge-main">主资源</span>':""}
      ${nodeAllOut(r)?'<span class="tag t-err" title="无可用上游：全部节点均不在服务面（无「在线」或「下线中」节点）">无可用上游 · 502</span>':""}
      <span class="muted" style="margin-left:auto">${(r.paths||[]).length} 条细粒度资源 · ${(r.nodes||[]).length} 节点（${nodeTallyText(r)}）</span>
      <button class="btn sm" onclick="editRes('${r.id}')">编辑</button>
      ${r.main?"":`<button class="btn sm danger" onclick="delRes('${r.id}')">删除</button>`}</div>
    <div class="conds-wrap" style="padding-top:2px">
      <div class="kv"><span class="k">访问协议</span>
        <select onchange="setProto('${r.id}',this.value)" title="候选 = 资产类型（${a.type}）∩ 资源类型（${r.kind}）；不铺开全量协议">${protoOptions(r.kind,!!r.main,a.type,r.proto)}</select>
        <div class="muted" style="grid-column:1 / -1">候选 = 资产类型（${a.type}）∩ 资源类型（${r.kind}）：${protoCands(r.kind,a.type).join(" / ")}${r.main?"（主资源入口）":""}；选择后即时生效、变更入审计，2 秒内全节点收敛。</div></div>
      <div class="kv"><span class="k">内部节点</span><div>${resNodesChipsHtml(r)}<button class="btn sm" onclick="nodeMgr('${r.id}')">管理</button>${nodeAllOut(r)?`<div class="note red" style="margin-top:6px">${xesc(nodeOutText(r))}</div>`:""}</div></div>
      <div class="kv"><span class="k">外部访问地址</span><span class="kr">${xesc(r.ext||"—")}</span><div class="muted" style="grid-column:1 / -1">DNS 指向网关；默认派生 {资源}.{网关域名}，可自定义客户域名</div></div>
      <div class="kv"><span class="k">负载均衡</span><select onchange="setLb('${r.id}',this.value)" title="选择后即时生效，变更入审计，2 秒内全节点收敛">
        ${LB.map(x=>`<option ${x===r.lb?"selected":""}>${x}</option>`).join("")}</select></div>
      <div class="kv"><span class="k">健康检查</span><div>${hcText(r)} <button class="btn sm" onclick="editRes('${r.id}')" style="margin-left:6px">配置</button></div></div>
      <div class="kv"><span class="k">超时</span><div>${toText(r)} <button class="btn sm" onclick="editRes('${r.id}')" style="margin-left:6px">配置</button></div></div>
      <div class="kv" style="padding-top:6px; border-top:1px dashed var(--line)"><span class="k">细粒度资源清单</span>
        <button class="btn link" onclick="viewResPaths('${r.id}')">查看 / 管理 ${(r.paths||[]).length} 条 →</button></div>
    </div></div>`;
  }).join("") : `<div class="empty"><div class="big">该资产暂无资源</div><span class="muted">${emptyTip}</span></div>`)+resPager(total,a._resPage);
}
function setLb(rid,v){ const a=curAsset(), r=(a.res||[]).find(x=>x.id===rid); if(!r) return; r.lb=v; toast("负载均衡已设为「"+v+"」（变更入审计）（演示）"); assetRerender(); }
function setProto(rid,v){ const a=curAsset(), r=(a.res||[]).find(x=>x.id===rid); if(!r) return; r.proto=v; toast("访问协议已设为「"+v+"」（变更入审计，2 秒内全节点收敛）（演示）"); assetRerender(); }
/* 资源弹窗内联动：资源类型变化 → 协议候选重算（保留当前值，若已不在候选则回落新类型常用首项） */
function protoDlgSync(mode){
  const px=(mode==="add")?"nRes":"er";
  const kindSel=$("#"+px+"Kind"), pSel=$("#"+px+"Proto"); if(!kindSel||!pSel) return;
  const a=ctxAsset(); const isMain=$("#"+px+"IsMain").value==="1";
  const kind=kindSel.value;
  pSel.innerHTML=protoOptions(kind,isMain,(a&&a.type)||"网页应用","");
  // 资源类型变化 → 协议候选即切为「资产类型 ∩ 资源类型」精确交集，并自动选中候选池推荐协议
  const rec=protoRec(a,{kind:kind,main:isMain?1:0});
  if(rec&&[...pSel.options].some(o=>o.value===rec)) pSel.value=rec;
  kindNoteSet(px, kind);
  hcProbeSync(true);   // 资源类型变化重算协议后，探测方式候选 / 默认强制刷新
}
function viewResPaths(resId){
  showTab("detTabs","t3");
  const a=ctxAsset(); if(a) a._pathPage=1;
  const sel=$("#fPathRes"); if(sel) sel.value=resId;
  renderPaths(ctxAsset());
}
/* 资源弹窗统一入口（v11ab：添加/编辑共用）
   openResDlg(a, r, mode)  · mode: "add" → 添加资源（基本 4 字段 + 节点）；"edit" → 编辑资源（全部字段 + 权重区）
   渲染 ID 前缀：add → nRes* / edit → er* — 与历史 v11y 等探针契约一致 */
function openResDlg(a, rOrNull, mode){
  const r = rOrNull;
  const isAdd = (mode==="add");
  const px = isAdd ? "nRes" : "er";
  const LB=["轮询","最少连接","源地址哈希","随机","加权随机"];
  const MO=["被动观察","主动探测"];
  const ACT=["自动摘除","仅告警"];
  const REC=["自动试探恢复","手工确认恢复"];
  const sel=(v,opts)=>opts.map(o=>`<option ${o===v?"selected":""}>${o}</option>`).join("");
  let defKind, defProto, isMain;
  if(isAdd){
    isMain = !(a.res&&a.res.length);
    const cand = KIND_BY_ASSET[a.type]||KIND_BY_ASSET["网页应用"];
    defKind = isMain?cand[0]:(cand.includes("API")?"API":cand[0]);
    defProto = protoRec(a,{kind:defKind,main:isMain?1:0});
  } else {
    resDefault(r);
    isMain = !!r.main; defKind = r.kind; defProto = r.proto;
  }
  const rR = r || {name:"",kind:defKind,proto:defProto,ext:"",nodes:[],lb:"轮询",toC:3,toR:60,toK:32,hcOn:1,hcMode:"被动观察",hcInt:10,hcFail:2,hcAct:"自动摘除",hcRec:"自动试探恢复",hcProbe:hcProbeDef(defProto),hcPath:"/healthz",hcCode:"200",main:isMain?1:0};
  const title = isAdd ? "添加资源" : "编辑资源";
  const msg = isAdd
    ? "登记一项资源：基本信息、后端节点、流量与健康检查均在完整表单内配置（与编辑资源一致）。"
    : "资源类型切换会联动访问协议候选并自动选中推荐；超时与健康检查为结构化配置，变更 2 秒内全节点收敛。";
  const nodeLabel = isAdd ? "后端服务节点" : "后端服务节点（内部节点）";
  const mainFlag = isAdd ? isMain : !!rR.main;
  const protoHelp = mainFlag ? "主资源入口 · 候选随资源类型联动" : "候选随资源类型联动";
  const body = `<div class="dlg-scroll">
      <div class="rsg">
        <div class="rsg-h"><span class="bar"></span><span class="tt">基本信息</span><span class="sub">名称 · 类型 · 对外入口</span></div>
        <div class="form-grid">
          <div class="fld"><label>资源名称 <span class="req">*</span></label><input type="text" id="${px}Name" maxlength="64" value="${isAdd?"":xesc(rR.name)}" ${isAdd?'placeholder="如：账户与转账 API"':""}></div>
          <div class="fld"><label>资源类型</label><select id="${px}Kind" onchange="protoDlgSync('${isAdd?'add':'edit'}')">${kindOptions(a,isAdd?defKind:rR.kind)}</select></div>
          <div class="fld" style="grid-column:1 / -1; margin-top:-4px"><div class="muted" id="${px}KindNote" style="font-size:12.5px"></div></div>
          <div class="fld" style="grid-column:1 / -1; margin-top:-6px"><div class="muted" id="${px}BaseNote" style="font-size:12.5px"></div></div>
          <div class="fld"><label>访问协议${mainFlag?' <span class="badge-main">主</span>':''} <span class="muted" style="margin-left:2px">${mainFlag?"主资源入口 · 随类型联动":"随类型联动"}</span></label><select id="${px}Proto" onchange="nodeProtoSync()" title="候选 = 资产类型 ∩ 资源类型（精确交集，不铺开全量协议）；切换资源类型后此处候选自动刷新并选中推荐协议">${protoOptions(isAdd?defKind:rR.kind,isAdd?isMain:!!rR.main,a.type,isAdd?defProto:rR.proto)}</select></div>
          <div class="fld"><label>外部访问地址</label><input type="text" id="${px}Ext" value="${isAdd?"":xesc(rR.ext||"")}" placeholder="${isAdd?"默认派生 {资源}.{网关域名}，可自定义客户域名":"默认派生 {资源id}.{网关域名}"}"></div>
        </div>
        <input type="hidden" id="${px}IsMain" value="${mainFlag?'1':'0'}">
      </div>
      <div class="rsg">
        <div class="rsg-h"><span class="bar"></span><span class="tt">${nodeLabel}</span><span class="req">*</span>
          <span class="right"><span class="lk">负载均衡算法</span><select id="${px}Lb" onchange="erLbSync()">${sel(rR.lb||"轮询",LB)}</select></span></div>
        ${nodeBoxHTML(resProtoOf(rR),nodeLabel,{noLabel:1})}
      </div>
      <div class="rsg">
        <div class="rsg-h"><span class="bar"></span><span class="tt">超时与健康检查</span><span class="sub">结构化参数 · 变更 2 秒内全节点收敛</span></div>
        <div class="form-grid c4">
          <div class="fld"><label>连接超时（秒）</label><input type="number" id="${px}ToC" min="1" max="3600" value="${rR.toC}" title="超过时限的连接判定失败并回收"></div>
          <div class="fld"><label>读写超时（秒）</label><input type="number" id="${px}ToR" min="1" max="3600" value="${rR.toR}" title="超过时限的读写判定失败并回收"></div>
          <div class="fld"><label>keepalive（秒）</label><input type="number" id="${px}ToK" min="1" max="3600" value="${rR.toK}" title="超过时限的空闲 keepalive 判定失败并回收"></div>
          <div class="fld"><label>排空上限（秒）<span class="muted" style="margin-left:2px">出厂默认 300</span></label><input type="number" id="${px}DrainMax" min="1" max="86400" value="${rR.drainMax||300}" placeholder="300" title="资源级参数：作用于该资源下所有节点的「下线中 → 已下线」排空——人工「下线」后进入排空，超过该时限仍未排空则强制断开存量连接并转「已下线」，断开事件入审计。出厂默认 300 秒，按该资源的存量连接特征覆盖（1~86400 秒），长连接类资源建议上调；排空必须有界，不提供「不设上限」"></div>
        </div>
        <div class="muted" style="font-size:12.5px; margin-top:6px"><b>排空上限为资源级参数</b>，作用于该资源下所有节点的「下线中 → 已下线」；出厂默认 300 秒，按该资源的存量连接特征覆盖（1~86400 秒），长连接类资源建议上调。排空必须有界——超过上限仍未排空即强制断开并转「已下线」，断开事件入审计。</div>
        <div class="sec">
          <div class="sec-h">
            <span>健康检查</span>
            <label class="hc-toggle"><input type="checkbox" id="${px}HcOn" ${rR.hcOn?"checked":""} onchange="hcModeSync()"> 启用</label>
            <span class="muted" style="margin-left:auto">停用 = 仅凭连接成败判定</span>
          </div>
          <div id="${px}HcDetail" class="hc-grid">
            <div class="fld"><label>检查模式</label><select id="${px}HcMode" onchange="hcModeSync()">${sel(rR.hcMode,MO)}</select></div>
            <div class="fld" id="${px}HcIntRow"><label>探测间隔（秒）</label><input type="number" id="${px}HcInt" min="1" max="3600" value="${rR.hcInt}"></div>
            <div class="fld"><label>连续失败阈值（次）</label><input type="number" id="${px}HcFail" min="1" max="20" value="${rR.hcFail}"></div>
            <div class="fld"><label>失败处置</label><select id="${px}HcAct">${sel(rR.hcAct,ACT)}</select></div>
            <div class="fld"><label>恢复方式</label><select id="${px}HcRec">${sel(rR.hcRec,REC)}</select></div>
            <div id="${px}HcProbeRow" style="grid-column:1 / -1; display:none; border-top:1px dashed var(--line); padding-top:10px; margin-top:4px">
              <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px 16px">
                <div class="fld"><label>探测方式<span class="muted" style="margin-left:2px">随访问协议</span></label><select id="${px}HcProbe" onchange="hcProbeUiSync()">${hcProbeOptions(rR.hcProbe||hcProbeDef(rR.proto||defProto), rR.proto||defProto)}</select></div>
                <div id="${px}HcHttpRow" style="display:contents">
                  <div class="fld"><label>探测路径</label><input type="text" id="${px}HcPath" value="${xesc(rR.hcPath||"")}" placeholder="/healthz"></div>
                  <div class="fld"><label>期望状态码</label><input type="text" id="${px}HcCode" value="${xesc(rR.hcCode||"")}" placeholder="200"></div>
                </div>
              </div>
              <div class="muted" style="font-size:12.5px; margin-top:8px">探测协议与访问协议同族：HTTPS 资源以 HTTPS 探活路径，HTTP 资源以 HTTP 探活；TCP 探测复用内部节点端口，不需路径。HTTP(S) 探测需开放探活路径（鉴权链放行健康检查通道）。</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  openDlg(title, msg, body, "xl");
  window._dlgPx = px;                       // 当前资源弹窗 ID 前缀（联动函数按此前缀取控件；edit=er / add=nRes / 节点管理="")
  window._nbOps=0; window._nbRes=null;   // 表单模式：行编辑为草稿，随本弹窗「确定」统一提交
  nodeBoxOpen(isAdd?[]:(rR.nodes||[]), resProtoOf(rR), isAdd?[]:(rR.lbWeights||[]), rR.lb||"", isAdd?{}:(rR.nodeSt||{}));
  hcModeSync(); hcProbeSync(); erLbSync(); kindNoteSet(px, isAdd?defKind:rR.kind);
  $("#dlg1Ok").onclick=()=>{
    /* ★ 2026-10-12（R56 · C-1）：原实现只保下限 —— 连接超时 / 读写超时 / keepalive / 探测间隔 /
       连续失败阈值在 HTML 上声明了 max（3600 / 20），保存侧却只做 Math.max(1,…)：填入 99999
       会被原样落库，界面声明与落库值自相矛盾。改为按控件自身 max 夹取（声明即生效）；
       无 max 声明时维持原下限行为。 */
    const num=(id,f)=>{const _ne=document.getElementById(id);const v=parseInt(_ne?_ne.value:"",10);
      const _mx=(_ne&&_ne.max)?parseInt(_ne.max,10):NaN;
      if(isNaN(v)||v<1) return f; return (!isNaN(_mx)&&v>_mx)?_mx:v;};
    const name=$(`#${px}Name`).value.trim();
    if(!name){ markBad($("#"+px+"Name"), true); toast("资源名称为必填"); return;}
    const kind=$("#"+px+"Kind").value;
    const pSel=$("#"+px+"Proto"), proto=pSel.value||(pSel.options[0]?pSel.options[0].value:"HTTP");
    if(a.anon==="asset"&&!protoIsHttp(proto)){ markBad(pSel, true); toast("该资产已整资产匿名开放，仅允许登记 HTTP 协议资源（当前协议 "+proto+"）"); return;}
    const nerr=nodeBoxErr(); if(nerr){ toast(nerr); return; }   // 存在未填完 / 端口非法 / 地址重复的行时阻断保存
    const nodes=nodeBoxNodes();
    const ext=$("#"+px+"Ext").value.trim();
    // 表单同构：add / edit 走同一套收集（LB / 超时 / 健康检查 / 节点权重）
    const out={name,kind,proto,nodes,ext,lb:$("#"+px+"Lb").value,lbWeights:nodeBoxWeights(),nodeSt:nodeStFromRows(),
      toC:num(px+"ToC",3),toR:num(px+"ToR",60),toK:num(px+"ToK",32),hcOn:0,hcMode:"被动观察",hcInt:10,hcFail:2,hcAct:"自动摘除",hcRec:"自动试探恢复",hcProbe:"",hcPath:"",hcCode:""};
    { const dm=parseInt(($("#"+px+"DrainMax")||{}).value,10); out.drainMax=(!isNaN(dm)&&dm>0)?Math.min(dm,86400):300; }
    /* 登记连通性校验（F3.5 规则 6）：保存时对「待探测」节点执行一次——地址有效即通过，转「在线」入池；
       该校验独立于健康检查模式，健康检查停用或被动观察时同样执行。 */
    let _probed=0;
    Object.keys(out.nodeSt).forEach(k=>{ if(out.nodeSt[k].s==="probe"){ delete out.nodeSt[k]; _probed++; } });
    const hcOn=$("#"+px+"HcOn");
    if(hcOn&&hcOn.checked){
      out.hcOn=1;
      out.hcMode=$("#"+px+"HcMode").value;
      out.hcInt=num(px+"HcInt",10); out.hcFail=num(px+"HcFail",2);
      out.hcAct=$("#"+px+"HcAct").value; out.hcRec=$("#"+px+"HcRec").value;
      if(out.hcMode==="主动探测"){
        out.hcProbe=$("#"+px+"HcProbe").value;
        if(out.hcProbe!=="TCP"){
          const hp=$("#"+px+"HcPath").value.trim(), hc=$("#"+px+"HcCode").value.trim();
          if(!hp){toast("主动 "+out.hcProbe+" 探测需填写探测路径"); return;}
          out.hcPath=hp; out.hcCode=hc||"200";
        } else { out.hcPath=""; out.hcCode=""; }
      }
    }
    if(isAdd){
      if(!nodes.length){toast("资源名称与至少一个内部节点为必填"); return;}
      a.res=a.res||[];
      const maxId=a.res.reduce((m,r)=>{const n=parseInt(String(r.id).replace(/^r/,""),10); return isNaN(n)?m:Math.max(m,n);},0);
      const nid=maxId+1;
      out.main=a.res.length?0:1; out.paths=[];
      if(!out.ext) out.ext="res-"+(a.id||"new")+"-r"+nid+".baize.example.com";
      a.res.push(Object.assign({id:"r"+nid},out));
      closeDlg(); assetRerender();
      toast("已添加资源「"+name+"（"+kind+" · "+proto+" · "+nodes.length+" 节点）」"+(a.res.length===1?"（自动设为主资源）":"")+"，可在细粒度资源清单登记路径（演示）");
      if(_probed) toast("登记连通性校验通过："+_probed+" 个新登记节点已入负载池（校验独立于健康检查模式）");
    } else {
      if(!nodes.length){ toast("至少保留一个后端服务节点"); return; }
      if(!out.ext) out.ext=rR.ext;
      Object.assign(rR,out);
      closeDlg(); toast("资源「"+name+"」已保存（结构化超时与健康检查；变更入审计，2 秒内全节点生效）（演示）"); assetRerender();
      if(_probed) toast("登记连通性校验通过："+_probed+" 个新登记节点已入负载池");
    }
  };
}
function openAddRes(){
  const a=ctxAsset();
  const webish=formOn()?efTypeWeb():(a&&assetWebish(a));
  if(a&&!webish){ addBackRes(); return; }        // 非网页资产 → 后端服务资源表单
  openResDlg(a, null, "add");
}
bind("#btnAddRes", el=>el.onclick=openAddRes);

/* ===== 资产详情 · 资源编辑 / 节点管理 / 资源删除 ===== */
function curAsset(){ return ctxAsset(); }
/* 编辑弹窗内健康检查联动：停用 → 隐藏参数；模式=主动 → 展开探测参数（按当前弹窗 ID 前缀取控件） */
function dlgPx(){ return window._dlgPx||"er"; }
function hcModeSync(){
  const px=dlgPx();
  const onEl=$("#"+px+"HcOn"), det=$("#"+px+"HcDetail");
  if(!onEl||!det) return;
  const on=onEl.checked;
  det.style.display=on?"":"none";
  if(on){
    const modeEl=$("#"+px+"HcMode");
    if(modeEl){
      const isAct=(modeEl.value==="主动探测");
      const probe=$("#"+px+"HcProbeRow"); if(probe) probe.style.display=isAct?"":"none";
      const intRow=$("#"+px+"HcIntRow"); if(intRow) intRow.style.display=isAct?"":"none";   // 被动观察无需探查间隔
      det.classList.toggle("c5",isAct);   // 列数自动切换：被动 4 控件 4 栏一行 / 主动 5 控件 5 栏一行
    }
  }
}
/* 探测方式随访问协议联动：httpLike 系（HTTP/HTTPS/WebSocket/gRPC）候选 HTTP·HTTPS 且默认同名（HTTPS→HTTPS），
   其余访问协议候选仅 TCP。force=协议变化（类型联动 / 手工切换访问协议）→ 探测方式对齐默认；
   打开弹窗回填（不强制）→ 保留存量值，仅当存量落出候选时回落默认 */
function hcProbeSync(force){
  const px=dlgPx(), sel=$("#"+px+"HcProbe"); if(!sel) return;
  const pSel=$("#"+px+"Proto"); const proto=(pSel&&pSel.value)||"HTTP";
  const cur=sel.value||"";
  const def=hcProbeDef(proto), cands=hcProbeCands(proto);
  const v=force?def:(cands.includes(cur)?cur:def);
  sel.innerHTML=cands.map(c=>`<option ${c===v?"selected":""}>${c}</option>`).join("");
  hcProbeUiSync();
}
/* 探测方式变化：HTTP / HTTPS → 显示探测路径与期望状态码；TCP → 隐藏两列（TCP 复用内部节点端口） */
function hcProbeUiSync(){
  const px=dlgPx(), sel=$("#"+px+"HcProbe"); if(!sel) return;
  const http=httpLikeProto(sel.value);
  const row=$("#"+px+"HcHttpRow"); if(row) row.style.display=http?"contents":"none";
  const pathEl=$("#"+px+"HcPath"), codeEl=$("#"+px+"HcCode");
  if(pathEl){ pathEl.disabled=!http; if(!http&&pathEl.value) pathEl.value=""; }
  if(codeEl){ codeEl.disabled=!http; if(!http&&codeEl.value) codeEl.value=""; }
}
function editRes(resId){
  const a=curAsset(), r=(a.res||[]).find(x=>x.id===resId); if(!r) return;
  if(isBackRes(r)){ editBackRes(a,r); return; }          // 后端服务资源 → 轻量三框表单
  openResDlg(a, r, "edit");
}
/* ===== 节点小列表（v11ag）：地址三栏**可直接修改** + 状态显式标记 + 行内运维操作 =====
   取代原「chips + 单行录入」：节点不再只是可新增的一次性录入项——每一行就是一个可直接改的地址，
   并承载该节点的运行状态与运维动作（下线 / 恢复上线 / 删除）。
   同一套渲染按 window._nbOps 分流两种提交模型：
   ① 表单内（资源登记 / 编辑）：行编辑为草稿，随弹窗「确定」提交（nodeBoxNodes / nodeBoxWeights）；
   ② 节点管理（运维）：行编辑失焦即提交，「下线 / 恢复上线 / 删除」先经二次认证。
   状态以**行**承载而非按地址索引：地址改动后状态随行迁移；但提交时检测到地址变化即「视为新登记」
   把状态复位为在线、重新接受健康检查——不把旧地址的故障态静默套到另一台主机上。 */
const NODE_STS = {
  on:    { l: "在线",   c: "t-ok"   },
  probe: { l: "待探测", c: "t-info" },
  drain: { l: "下线中", c: "t-warn" },
  off:   { l: "已下线", c: "t-gray" },
  fail:  { l: "已摘除", c: "t-err"  }
};
const NODE_ORDER = ["on", "probe", "drain", "off", "fail"];
/* 是否承接流量：在线接收新流量、下线中仅承载存量连接——两者都在服务面上，故为参数变更的二次认证判定面 */
function nodeServing(s){ return s === "on" || s === "drain"; }
/* 状态时刻（MM-DD HH:mm）：人工下线 / 排空完成 / 自动摘除的时间戳 */
/* ★ R61·轮8：原实现取**真实系统日**的 MM-DD HH:MM（`String(nowTs()).slice(5)`），与 nowD() 的固定
   基准日不同源 ⇒ 同一资产的「更新时间」（nowD）与节点状态时间（nowHM）各说一个「今天」。
   改为基准日的 MM-DD + 真实**时分**（范式同 70-dp.js 的 dpNowTs），格式与 nodeSt 种子 "09-13 15:12" 一致。 */
function nowHM(){ const d=new Date(), p=n=>String(n).padStart(2,"0"); return nowD().slice(5) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); }
/* 节点状态元信息：l 标签文案 / c 标签色 / pool 池位 / badge 失败计数角标 / tip 悬停说明 / note 一句话说明（派生，不落库）
   thr = 该资源健康检查的「连续失败阈值」，用于「探测异常 n/N」角标；**角标不是独立状态** */
function nodeStMeta(st, thr) {
  const s = (st && st.s) || "on", o = st || {}, f = o.f || 0, n = thr || 3;
  if (s === "probe") return { s: "probe", l: NODE_STS.probe.l, c: NODE_STS.probe.c, pool: "未入池", badge: "",
    tip: "待探测（未入池）：节点新登记或迁移后、登记连通性校验结论返回前；通过转「在线」、不通过转「已摘除」。该校验独立于健康检查模式——健康检查停用或被动观察时同样执行，避免未经校验的节点直接承接流量",
    note: "登记连通性校验中 · 未入池" };
  if (s === "drain") return { s: "drain", l: NODE_STS.drain.l, c: NODE_STS.drain.c, pool: "半离池", badge: "",
    tip: `下线中（半离池 · 人工）${o.t ? "，自 " + o.t + " 起" : ""}：不再接收新连接、仅承载存量连接；存量连接结束或超过排空上限后转「已下线」，期间也可随时「恢复」回在线`,
    note: `人工下线 · 排空存量连接${o.t ? "（" + o.t + "）" : ""}` };
  if (s === "off") return { s: "off", l: NODE_STS.off.l, c: NODE_STS.off.c, pool: "离池", badge: "",
    tip: `已下线（离池 · 人工）${o.t ? "，" + o.t : ""}：排空完成、退出负载池；只能人工「恢复」——自动试探恢复不作用于该状态（人工下线代表运维意图，不得被探活结果自动推翻）`,
    note: `人工下线 · 已排空${o.t ? "（" + o.t + "）" : ""}` };
  if (s === "fail") return { s: "fail", l: NODE_STS.fail.l, c: NODE_STS.fail.c, pool: "离池", badge: "",
    tip: `已摘除（离池 · 健康检查 / 登记校验）${f ? "，连续失败 " + f + " 次" : ""}${o.t ? "，" + o.t : ""}：不在负载池内、不接收流量；可自动试探恢复，或人工「恢复」`,
    note: `健康检查连续失败${f ? " " + f + " 次" : ""}，${o.t || "—"} 自动摘除` };
  const badge = f > 0 ? `<span class="nst">探测异常 ${f}/${n}</span>` : "";
  return { s: "on", l: NODE_STS.on.l, c: NODE_STS.on.c, pool: "在池", badge,
    tip: "在线（在池）：在负载池内，按负载均衡算法接收流量" + (f > 0 ? `；健康检查连续失败 ${f} 次，未达摘除阈值（阈值 ${n} 次）` : ""),
    note: f > 0 ? `在池 · 探测异常 ${f}/${n}（未达摘除阈值）` : "在池 · 正常接收流量" };
}
function nodeStMetaOf(r, addr) { return nodeStMeta(((r && r.nodeSt) || {})[addr], (r && r.hcFail) || 3); }
/* 状态构成文案（卡片收起态 / 核对页共用）：五态齐备、按固定顺序，计数为 0 的一律不出现 */
function nodeTallyText(r){
  const t=nodeTally(r);
  return NODE_ORDER.map(k => t[k] ? NODE_STS[k].l + " " + t[k] : "").filter(Boolean).join(" · ")||"—";
}
/* 状态汇总：卡片把节点收成「等 N 个」时，说清被收起的节点构成 */
function nodeTally(r) {
  const t = { on: 0, probe: 0, drain: 0, off: 0, fail: 0 };
  ((r && r.nodes) || []).forEach(n => { const s = ((r.nodeSt || {})[n] || {}).s || "on"; t[s] = (t[s] || 0) + 1; });
  return t;
}
/* 全部离池：资源无任何「在线 / 下线中」节点 → 无可用上游；资源卡与详情页显式告警，请求按 F6.2 返回 502 */
function nodeAllOut(r){ const t = nodeTally(r); return ((r && r.nodes) || []).length > 0 && !t.on && !t.drain; }
function nodeOutText(r){ return `该资源全部 ${(r.nodes || []).length} 个节点均不在服务面（${nodeTallyText(r)}）——无可用上游，请求返回 502，不静默降级。请在「内部节点」处恢复节点或补充节点。`; }
/* 节点标签：地址 + 状态词（状态显式标记；加权随机时并显权重） */
function nodeChipHtml(r, addr) {
  const m = nodeStMetaOf(r, addr);
  const i = ((r && r.nodes) || []).indexOf(addr);
  const w = (r && r.lb === "加权随机") ? `<span class="nst">w=${((r.lbWeights || [])[i]) || 1}</span>` : "";
  return `<span class="tag ${m.c}" style="margin:2px 6px 2px 0" title="${xesc(addr + " · " + m.note)}">${xesc(addr)}${w}<span class="nst">${m.l}</span>${m.badge || ""}</span>`;
}
/* 资源协议启发（未显式登记时按节点端口：8443 / 443 → HTTPS，其余 HTTP） */
function resProtoOf(r){
  if(r&&r.proto) return r.proto;
  const n=String(((r||{}).nodes||[])[0]||""); const m=(n.match(/:(\d{2,5})(?:\/|$)/)||[])[1];
  return (m==="443"||m==="8443")?"HTTPS":"HTTP";
}
function nodeProtoCur(){ const p=document.getElementById("nResProto")||document.getElementById("erProto"); return (p&&p.value)||(window._nbProto||"HTTP"); }
/* ---- 行数据模型：{h 主机, p 端口, pa 路径, s 状态, t 状态时刻, f 连续失败次数, a 上次提交地址} ---- */
function nodeRows(){ return window._nbRows || (window._nbRows = []); }
function nodeRowAddr(i){
  const r=nodeRows()[i]; if(!r) return "";
  const v=joinAddr(r.h,r.p,r.pa,nodeProtoCur());
  return (v && v!=="!")?v:"";
}
function nodeRowLabel(i){
  const r=nodeRows()[i]; if(!r) return "（未填完）";
  return nodeRowAddr(i) || String(r.h||"").trim() || "（未填完）";
}
function nodeBoxOpen(arr,proto,weights,lbAlgo,stMap){
  window._nbProto=proto||"HTTP";
  const list=arr||[], w=weights||[], st=stMap||{};
  window._nbRows=list.map(a=>{ const p=parseAddr(a), o=st[a]||{};
    return { h:p.host, p:p.port, pa:p.path, s:o.s||"on", t:o.t||"", f:o.f||0, a:a }; });
  window._nbWeights=list.map((x,i)=>(w[i]===undefined?1:w[i]));
  /* ★ 2026-10-12（R53 · A1-F2）：权重改动基线 —— 权重是流量编排参数（变更入审计、不认证），
     但原实现没有任何落库触发点，「改了权重、重开弹窗即回落」。 */
  window._nbW0=(window._nbWeights||[]).join(",");
  window._nbLbAlgo=lbAlgo||"";
  nodeListDraw();
}
/* 行校验：整行三栏全空视为未启用行（不报错）；其余逐行校验主机 / 端口 / 重复 */
function nodeBoxErr(){
  const rows=nodeRows(), seen={};
  for(let i=0;i<rows.length;i++){
    const r=rows[i], tag="第 "+(i+1)+" 行 ";
    if(!String(r.h||"").trim() && !String(r.p||"").trim() && !String(r.pa||"").trim()) continue;
    if(!String(r.h||"").trim()) return tag+"未填主机（IP / 域名）";
    const v=joinAddr(r.h,r.p,r.pa,nodeProtoCur());
    if(v==="!") return tag+"端口需为 1~65535 的数字";
    if(!v) return tag+"协议「"+nodeProtoCur()+"」无默认端口，需显式填写端口（1~65535）";
    if(seen[v]) return "节点 "+v+" 重复";
    seen[v]=1;
  }
  return "";
}
/* 收集：跳过未填完的行；节点与权重严格同序（避免下标错位） */
function nodeBoxNodes(){
  const out=[]; nodeRows().forEach((r,i)=>{ const a=nodeRowAddr(i); if(a) out.push(a); }); return out;
}
function nodeBoxWeights(){
  const ws=window._nbWeights||[], out=[];
  nodeRows().forEach((r,i)=>{ const a=nodeRowAddr(i); if(a) out.push(ws[i]||1); });
  return out;
}
function nodeStFromRows(){
  const out={};
  nodeRows().forEach((r,i)=>{ const a=nodeRowAddr(i); if(!a) return;
    const s=r.s||"on", f=r.f||0;
    /* 在线但已连续失败若干次（未达摘除阈值）时同样落库——用于「探测异常 n/N」角标，角标不是独立状态 */
    if(s!=="on" || f>0) out[a]={ s:s, t:r.t||"", f:f };
  });
  return out;
}
/* 参数变更不改状态：地址 / 端口 / 路径属登记口径，运行状态只由「下线 / 恢复 / 健康检查」改变。
   此处**不再**做「地址变更 → 复位为在线」的迁移——那会把人工下线的节点静默拉回负载池；
   也不把旧地址的故障态套到新主机：状态随行保留，要重新入池必须显式「恢复」。 */

function nodeRowSet(i,k,v){ const r=nodeRows()[i]; if(r) r[k]=v; }
function nodeRowAdd(){
  /* 新登记节点先置「待探测」（F3.5 规则 6）：入池前执行一次登记连通性校验，通过后才置「在线」 */
  nodeRows().push({ h:"", p:"", pa:"", s:"probe", t:"", f:0, a:"" });
  (window._nbWeights||(window._nbWeights=[])).push(1);
  nodeListDraw();
  const el=document.querySelector("#nboxList .nrow:last-child input.c-h"); if(el) el.focus();
}
function nodeListDraw(){
  const w=document.getElementById("nboxList"); if(!w) return;
  const proto=nodeProtoCur(), ops=!!window._nbOps, rows=nodeRows();
  const wt=(window._nbLbAlgo==="加权随机"), ws=window._nbWeights||[];
  const head=`<div class="nlist-h"><span class="c-h">主机（IP / 域名）</span><span class="sep">:</span><span class="c-p">端口</span><span class="sep">/</span><span class="c-a">路径（可选）</span>`
    + (wt ? `<span class="c-w" title="加权随机算法下每节点权重（1~100）">权重</span>` : "")
    + (ops ? `<span class="c-s">运行状态</span><span class="c-o">运维操作</span>` : "") + `</div>`;
  const thr=(window._nbRes && window._nbRes.hcFail) || window._nbThr || 3;
  const body=rows.length ? rows.map((r,i)=>{
    const m=nodeStMeta(r,thr);
    const wCell=wt ? `<input class="c-w" type="number" min="1" max="100" value="${ws[i]||1}" title="加权随机算法下该节点权重（1~100）" oninput="nbWeightSet(${i},this.value)" onchange="nodeRowCommit()">` : "";
    /* 运维操作按状态分流（F3.5 规则 9）：在线 → 下线 / 删除；下线中、已下线、已摘除 → 恢复 / 删除；
       待探测尚未入池、无「下线」语义 → 只给 删除 */
    const act = m.s === "on"
      ? `<button class="btn sm" onclick="nodeAct('offline',${i})" title="下线（排空）：进入「下线中」——不再接收新连接、仅承载存量连接；排空完成或超过排空上限后转「已下线」，期间可随时「恢复」">下线</button>`
      : (m.s === "probe"
          ? ``
          : `<button class="btn sm" onclick="nodeAct('online',${i})" title="恢复：重新入池并接受健康检查；未通过者会被再次摘除。自动试探恢复不作用于「已下线」">恢复</button>`);
    const cell=ops ? `<span class="c-s"><span class="tag ${m.c}" title="${xesc(m.tip)}">${m.l}</span>${m.badge||""}</span><span class="c-o">`
      + act
      + `<button class="btn sm danger" onclick="nodeRowDel(${i})" title="从节点列表删除（含权重与运行状态，不可撤销）">删除</button></span>` : "";
    return `<div class="nrow">`
      + `<input class="c-h" type="text" value="${xesc(r.h)}" placeholder="IP / 域名" oninput="nodeRowSet(${i},'h',this.value)" onchange="nodeRowCommit()">`
      + `<span class="sep">:</span>`
      + `<input class="c-p" type="text" inputmode="numeric" value="${xesc(r.p)}" placeholder="${portDefault(proto)||"必填"}" oninput="nodeRowSet(${i},'p',this.value)" onchange="nodeRowCommit()">`
      + `<span class="sep">/</span>`
      + `<input class="c-a" type="text" value="${xesc(r.pa)}" placeholder="（可选）" oninput="nodeRowSet(${i},'pa',this.value)" onchange="nodeRowCommit()">`
      + wCell + cell + `</div>`;
  }).join("") : `<div class="nlist-empty">尚未添加节点：点下方「+ 添加节点」录入主机与端口</div>`;
  w.innerHTML=head+body;
  /* 固定位控件：常驻可见、不可操作时 disabled 并写明原因（与页脚批量启停同口径） */
  const ra=document.getElementById("nbRestoreAll");
  if(ra){
    const n=rows.filter(r=>["drain","off","fail"].indexOf(r.s||"on")>=0).length;
    ra.disabled=!n;
    ra.title=n ? `恢复全部 ${n} 个非在线节点（下线中 / 已下线 / 已摘除）：统一入池并按健康检查重新判定`
               : "当前没有需要恢复的节点：全部节点均在线或在待探测中（待探测由登记连通性校验决定去向）";
  }
}


function nodeBoxHTML(proto,label,opts){
  const o=opts||{}, dp=portDefault(proto)||"";
  const inner=`<div id="nboxList" class="nlist"></div>
    <div class="nb-foot"><button class="btn sm" onclick="nodeRowAdd()">+ 添加节点</button>
      <span class="help" id="nbHint">主机 + 端口 + 路径；端口留空按访问协议补默认（${proto} → ${dp||"无默认端口，需显式填写"}）；路径为反向代理子路径（如 /api-v2）；负载均衡选「加权随机」时列表内联出现权重列（1~100）。新增节点先置「待探测」，保存时执行一次登记连通性校验（HTTP 系走探活、其余走 TCP 端口连通性），通过后入池。</span></div>`;
  return o.noLabel ? inner : `<div class="fld full" style="margin-top:2px"><label>${label||"内部节点"} <span class="req">*</span></label>${inner}</div>`;
}
function nodeProtoSync(){
  const p=nodeProtoCur(), dp=portDefault(p);
  nodeListDraw();                     // 端口占位随协议重算（此刻输入焦点在下拉框上，重绘无副作用）
  const hp=document.getElementById("nbHint");
  if(hp) hp.textContent="主机 + 端口 + 路径；端口留空按访问协议补默认（"+p+" → "+(dp||"无默认端口，需显式填写")+"）；路径为反向代理子路径（如 /api-v2）；负载均衡选「加权随机」时列表内联出现权重列（1~100）。新增节点先置「待探测」，保存时执行一次登记连通性校验后入池。";
  hcProbeSync(true);   // 访问协议变化 → 探测方式候选 / 默认强制跟随（节点管理弹窗无探测控件时内部判空返回）
}
/* ---- 运维态（节点管理弹窗）：失焦即提交 ----
   敏感面判定 = **该行是否在负载池内**：在线行（含新增行）的参数变更会即刻影响在服流量，
   故与「下线 / 恢复 / 删除」同档，先经二次认证，取消则回滚；已下线 / 已摘除不在池内，
   参数更正直接提交并记审计。权重属流量编排参数，与资源级「负载均衡算法」同档（变更入审计、不认证）。 ---- */
function nodeRowCommit(){
  if(!window._nbOps || !window._nbRes) return;      // 表单模式：行编辑为草稿，随弹窗「确定」统一提交
  const bad=nodeBoxErr(); if(bad){ toast(bad); return; }   // 校验不过只提示，保留已填内容便于就地改错
  const chg=[];
  nodeRows().forEach((r,i)=>{ const a=nodeRowAddr(i);
    if(r.a!==undefined && r.a!==a) chg.push({ r:r, from:r.a||"", to:a, m:nodeStMeta(r) }); });
  /* ★ 2026-10-12（R53 · A1-F2）：权重与地址变更分开处理 —— 地址变更影响在服面（在池行走二次认证），
     权重变更只落库入审计（与「负载均衡算法」同档）。原实现「无地址变化即早退」⇒ 权重永不落库。 */
  if(!chg.length){
    const wNow=(window._nbWeights||[]).join(",");
    if(wNow!==(window._nbW0||"")) nodeLiveSave("节点权重已更新：负载编排按新权重生效（变更入审计）");
    return;
  }
  const apply=()=>{ chg.forEach(c=>{ c.r.a=c.to; });   // 状态与状态记录都不动，仅记下本次地址
    nodeLiveSave(`节点参数已更新（${chg.length} 项）：运行状态不变；变更处按新地址重新接受健康检查`); };
  const atRisk=chg.filter(c=>c.m.s==="on");
  if(!atRisk.length){ apply(); return; }
  const list=atRisk.map(c=>`<div>· <b>${xesc(c.from||"（未填完）")}</b> → <b>${xesc(c.to)}</b>（${c.m.l}）</div>`).join("");
  ask2FA(`修改在服节点参数（${atRisk.length} 项）`, apply, ()=>{ nodeRollbackRows(chg); },
    `下列节点在负载池内，参数变更即刻影响在服流量：${list}`
    + `<b>运行状态不因参数更正而改变</b>——新地址仍按「失败处置」接受健康检查，不可达会被再次摘除；`
    + `要把不在池内的节点放回服务，请用「恢复」。已下线 / 已摘除的节点不在池内，其参数更正不需认证。`);
}
/* 取消认证 → 回滚到提交前地址（还原三栏、重绘并复位行数据） */
function nodeRollbackRows(chg){
  (chg||[]).forEach(c=>{ const p=parseAddr(c.from||"");
    c.r.h=p.host||""; c.r.p=p.port||""; c.r.pa=p.path||""; c.r.a=c.from; });
  nodeListDraw(); toast("已取消：节点参数未变更");
}

function nodeLiveSave(msg){
  const r=window._nbRes; if(!r) return;
  r.nodes=nodeBoxNodes(); r.lbWeights=nodeBoxWeights(); r.nodeSt=nodeStFromRows();
  window._nbW0=(window._nbWeights||[]).join(",");   /* ★ R53（A1-F2）：落库后刷新权重基线 */
  nodeListDraw();
  toast(msg+"（变更入审计，2 秒内全节点收敛）（演示）");
  assetRerender();
}
function nodeRowDel(i){
  const rows=nodeRows(); if(i<0||i>=rows.length) return;
  const addr=nodeRowAddr(i);
  const doDel=()=>{
    rows.splice(i,1); (window._nbWeights||[]).splice(i,1);
    if(window._nbOps && window._nbRes) nodeLiveSave("已从节点列表删除："+(addr||"未填完的行"));
    else { nodeListDraw(); toast("节点已移除："+(addr||"未填完的行")+"（变更入审计，2 秒内全节点收敛）（演示）"); }
  };
  if(!(window._nbOps && window._nbRes)){ doDel(); return; }
  ask2FA("删除后端节点「"+(addr||"未填完的行")+"」", doDel, null,
    "删除后该节点及其权重、运行状态一并移除，须<b>重新登记</b>才能恢复；如需临时退出流量请改用「下线」。");
}
function nodeAct(kind,i){
  const r=nodeRows()[i]; if(!r) return;
  const res=window._nbRes||{}, addr=nodeRowAddr(i);
  if(kind==="offline"){
    ask2FA("下线后端节点「"+addr+"」", ()=>{
      r.s="drain"; r.t=nowHM(); r.f=0;
      nodeLiveSave("节点 "+addr+" 已进入「下线中」：不再接收新连接、仅承载存量连接；排空完成或超过排空上限后转「已下线」，期间可随时「恢复」");
    }, null, "下线为人工处置：节点进入 <b>下线中</b>（半离池）——不再接收新连接、仅承载存量连接；存量连接结束或超过排空上限后转「已下线」。"
      + "本资源排空上限为 <b>"+((res&&res.drainMax)||300)+" 秒</b>（资源级参数，作用于该资源下所有节点）：超时仍未排空即强制断开存量连接并转「已下线」，断开事件入审计。"
      + "自动试探恢复<b>不作用于</b>「下线中」与「已下线」：人工下线代表运维意图，不得被探活结果自动推翻。");
  } else {
    ask2FA("恢复节点「"+addr+"」", ()=>{
      r.s="on"; r.t=""; r.f=0;
      nodeLiveSave("节点 "+addr+" 已恢复：重新入池并接受健康检查（未通过者会再次被摘除）（2 秒内全节点收敛）");
    }, null, "恢复为敏感变更：节点重新进入负载池并按负载均衡算法接收流量；恢复后统一入池并按健康检查重新判定，未通过者再次被摘除。"
      + "当前恢复方式为「"+(res.hcRec||"自动试探恢复")+"」。");
  }
}
/* 一键恢复全部（F3.5 规则 10）：对当前资源下全部非在线节点（下线中 / 已下线 / 已摘除）执行恢复。
   待探测不在其列——它尚未入池，去向由登记连通性校验决定。批量与单节点的认证口径、审计口径一致。 */
function nodeRestoreAll(){
  const res=window._nbRes; if(!res) return;
  const rows=nodeRows(), idx=[];
  rows.forEach((r,i)=>{ if(["drain","off","fail"].indexOf(r.s||"on")>=0) idx.push(i); });
  if(!idx.length){ toast("当前没有需要恢复的节点：全部节点均在线或在待探测中（待探测由登记连通性校验决定去向）"); return; }
  const list=idx.map(i=>`<div>· <b>${xesc(nodeRowAddr(i)||"（未填完）")}</b>（${NODE_STS[rows[i].s||"on"].l}）</div>`).join("");
  ask2FA(`一键恢复全部节点（${idx.length} 个）`, ()=>{
    idx.forEach(i=>{ rows[i].s="on"; rows[i].t=""; rows[i].f=0; });
    nodeLiveSave("已一键恢复 "+idx.length+" 个节点：统一入池并按健康检查重新判定，未通过者将再次被摘除");
  }, null, `下列非在线节点将统一恢复入池并接受健康检查：${list}`
    + "<b>待探测节点不在本次范围内</b>——它尚未入池，由登记连通性校验决定转「在线」或「已摘除」。"
    + "恢复后未通过健康检查的节点会被再次摘除并告警。全过程入审计。");
}
/* 关闭节点管理弹窗时的演示推进：把在途状态结算到确定态（真实产品由登记校验返回与排空事件驱动）
   —— 待探测 → 按登记连通性校验结论转「在线」或「已摘除」；下线中 → 排空完成转「已下线」。 */
function nodeSettleInFlight(){
  const res=window._nbRes; if(!res) return;
  const rows=nodeRows(), done=[];
  rows.forEach((r,i)=>{
    const a=nodeRowAddr(i);
    if(r.s==="probe"){
      if(a){ r.s="on"; r.t=""; r.f=0; done.push((a||"")+"：登记连通性校验通过 → 在线"); }
      else { r.s="fail"; r.t=nowHM(); r.f=(res.hcFail||3); done.push("（未填完的行）：登记连通性校验不通过 → 已摘除"); }
    } else if(r.s==="drain"){
      r.s="off"; r.t=nowHM(); done.push((a||"")+"：排空完成 → 已下线");
    }
  });
  if(!done.length) return;
  res.nodes=nodeBoxNodes(); res.lbWeights=nodeBoxWeights(); res.nodeSt=nodeStFromRows();
  toast("演示推进：" + done.join("；") + "（变更入审计）");
}
function nodeMgr(resId){
  const a=curAsset(), r=(a.res||[]).find(x=>x.id===resId); if(!r) return;
  const proto=resProtoOf(r);
  window._dlgPx="";                                  // 节点管理独立弹窗：权重已内联为列，无独立权重表挂载点
  window._nbOps=1; window._nbRes=r; window._nbThr=r.hcFail||3;
  nodeBoxOpen(r.nodes, proto, r.lbWeights, r.lb, r.nodeSt||{});
  openDlg("节点管理 · "+r.name,
    `节点以小列表呈现：主机 / 端口 / 路径${r.lb==="加权随机"?" / 权重":""}可直接编辑，失焦即提交。`
    + `运行状态取五态——在线 / 待探测 / 下线中 / 已下线 / 已摘除，只由「人工下线 / 人工恢复 / 健康检查 / 登记校验」改变，参数更正不改状态。`
    + `判定面是该节点是否承接流量：在线（接收新流量）与下线中（仅承载存量连接）的参数变更，以及「下线 / 恢复 / 删除 / 一键恢复全部」均先经二次认证；待探测、已下线、已摘除的参数更正直接提交并记审计。`
    + `自动试探恢复只作用于「已摘除」；人工下线代表运维意图，其两种状态不被探活结果自动推翻。`
    + `本资源排空上限 ${(r.drainMax)||300} 秒（资源级参数）：节点「下线」后进入排空，存量连接结束或超过该时限即转「已下线」。`
    + `当前：${nodeTallyText(r)}。`,
    `<div id="nboxList" class="nlist" style="max-height:280px; overflow:auto"></div>
     <div class="nb-foot" style="margin-top:8px"><button class="btn sm" onclick="nodeRowAdd()">+ 添加节点</button>
       <button class="btn sm" id="nbRestoreAll" onclick="nodeRestoreAll()" disabled>一键恢复全部</button>
       <span class="help" id="nbHint">主机 + 端口 + 路径；端口留空按访问协议补默认（${proto} → ${portDefault(proto)||"需显式填写"}）${r.lb==="加权随机"?"；权重列限 1~100":""}。新增节点先置「待探测」，登记连通性校验通过后入池。状态改动入审计，2 秒内全节点收敛。</span></div>`,
    "lg");
  nodeListDraw();
  /* ★ 2026-10-12（R53 · A1-F8）：本弹窗行编辑为「失焦即提交」（已写 r.nodes / r.lbWeights），
     关窗不丢数据 ⇒ 豁免脏值拦截：Esc / 点遮罩直接关闭，不再弹与事实相反的「关闭后不会保存」。 */
  window.__dlgNoDirty=1;
  const okB=$("#dlg1Ok"); okB.textContent="关闭";
  okB.onclick=()=>{ nodeSettleInFlight(); closeDlg(); assetRerender(); };   // 行编辑已即时提交，此处只负责收尾
  $("#dlg1No").style.display="none";
}

function nbWeightSet(i,v){
  const ws=window._nbWeights||(window._nbWeights=[]);
  const n=parseInt(v,10);
  ws[i]=(isNaN(n)||n<1)?1:(n>100?100:n);
}
/* 资源弹窗 LB 切换 → 同步 _nbLbAlgo + 小列表重绘（权重列随算法增删，仍与节点同行同序） */
function erLbSync(){
  const px=dlgPx();
  const lbEl=$("#"+px+"Lb"); if(!lbEl) return;
  window._nbLbAlgo=lbEl.value;
  nodeListDraw();
}

function delRes(resId){
  const a=curAsset(), r=(a.res||[]).find(x=>x.id===resId); if(!r) return;
  if(a.open!=="未开通"){toast("资产无端访问为「"+a.open+"」：请先撤销开通再删除资源，避免线上路径悬空"); return;}
  /* 引用检查按「已激活」计：已下线条目不参与授权、其访问要求为暂停态，不构成删除阻碍（下线可逆、删除不可逆） */
  const _rref=(r.paths||[]).filter(q=>q.req&&q.lc!=="已下线").length;
  if(_rref){toast("该资源有 "+_rref+" 条已激活路径承载访问要求，删除被拒：请先把这些路径下线（下线可逆，随时可重新激活）后再删除（演示）"); return;}
  /* ★ 2026-10-12（R57 · 表-1）：原实现自画「账号密码（SM2 加密提交）」输入框却**从不读取其值** ——
     空口令即删、toast 却称「追加认证通过」，属安全语义欺骗（与 R53 已修的 delAsset 完全同型）。
     删除资源改变生效面 ⇒ 与全站同档，统一走二次认证入口；前置校验亦前移至认证之前。 */
  ask2FA("删除资源「" + r.name + "」", () => {
    a.res=a.res.filter(x=>x.id!==resId);
    if(isBackRes(r)){                 // 后端资源删除 → 同步资产级镜像（删空则清镜像，回到空态引导重新登记）
      if(!(a.res||[]).some(isBackRes)){ a.addr=""; a.addrProto=undefined; a.client=undefined; a._migB=1; }
      backRerender(a);
    } else {
      assetRerender();
    }
    toast("资源已删除（二次认证通过，操作入审计）（演示）");
  }, null,
    "将同时删除该资源登记的 " + ((r.paths || []).length) + " 条细粒度资源清单，<b>删除不可逆</b>；变更写入审计。");
}

/* ===== 资产详情 · 细粒度资源清单 ===== */
function flatResPaths(a){
  const out=[];
  (a.res||[]).forEach(res=>(res.paths||[]).forEach(p=>out.push(Object.assign({resId:res.id,resName:res.name,resKind:res.kind,resMain:res.main},p))));
  return out;
}
/* 方法筛选取值域 = 本资产清单的**实际方法集**（去重；HTTP 方法按标准序，其余按字典序）。
   不写死 HTTP 五法：清单里可有 gRPC 流类型（如「gRPC 一元调用」）与 WS 帧（如「WS 帧（双向）」），
   固定候选会让这些条目**既筛不到、又被任一 HTTP 方法勾选静默排除**——取值域必须与可命中值域相交。 */
const M_ORD=["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"];
function methodOpts(a){
  const set=[];
  flatResPaths(a).forEach(r=>{ if(r.m && set.indexOf(r.m)<0) set.push(r.m); });
  return set.sort((x,y)=>{
    const ix=M_ORD.indexOf(x), iy=M_ORD.indexOf(y);
    if(ix>=0 && iy>=0) return ix-iy;
    if(ix>=0) return -1;
    if(iy>=0) return 1;
    return x<y?-1:(x>y?1:0);
  });
}
function pathReqTag(req){
  if(!req) return '<span class="tag t-gray">默认拒绝</span>';
  if(req.includes("public")) return '<span class="tag t-ok">显式公开</span>';
  return '<span class="tag t-info">'+req+'</span>';
}
function renderPaths(a){
  const flat=flatResPaths(a);
  $("#nPaths").textContent=flat.length;
  const resSel=$("#fPathRes"); const cur=resSel.value;
  const resArr=a.res||[];
  resSel.innerHTML='<option value="">全部资源</option>'+resArr.map(r=>`<option value="${r.id}">${esc(r.name)}（${esc(r.kind)}）</option>`).join("");
  if(resArr.some(r=>r.id===cur)) resSel.value=cur;
  /* 方法筛选：取值域按**本资产清单实际方法**重建（多选 chips；不勾任一 = 不限）。
     资产切换或清单变更后，仅保留仍存在的选中值——避免留下永远筛不到条目的幽灵勾选。 */
  const mOpts=methodOpts(a);
  const mSel=(a._mSel||[]).filter(mm=>mOpts.indexOf(mm)>=0);
  a._mSel=mSel;
  const mChip=(mm,on)=>`<span class="chip${on?" on":""}" data-act="fPathMTog" data-m="${xesc(mm)}">${xesc(mm||"全部方法")}</span>`;
  $("#fPathMethod").innerHTML=mChip("",mSel.length===0)+mOpts.map(mm=>mChip(mm,mSel.indexOf(mm)>=0)).join("");
  const resId=resSel.value, rk=$("#fPathRisk").value, lc=$("#fPathLc").value;
  const kw=($("#fPathK").value||"").trim().toLowerCase();
  const list=flat.filter(r=>(!resId||r.resId===resId)&&(!mSel.length||mSel.indexOf(r.m)>=0)&&(!rk||r.risk===rk)&&(!lc||r.lc===lc)
    &&(!kw||(r.name||"").toLowerCase().includes(kw)||r.p.toLowerCase().includes(kw)));
  const _flt=!!(resId||mSel.length||rk||lc||kw);   /* ★ R61：筛选态判据，供空态分流 */
  const KC=RES_KC;
  const total=list.length;
  if(!a._pathPage||a._pathPage<1) a._pathPage=1;
  const pages=Math.max(1,Math.ceil(total/PATH_PAGE));
  if(a._pathPage>pages) a._pathPage=pages;
  const slice=list.slice((a._pathPage-1)*PATH_PAGE, a._pathPage*PATH_PAGE);
  $("#pathTbl tbody").innerHTML=(slice.length?slice.map(r=>`<tr>
    <td>${xesc(r.resName)}${r.resMain?'<span class="badge-main">主</span>':""}<div class="muted">${r.resKind}</div></td>
    <td><b>${xesc(r.name||"—")}</b></td>
    <td><span class="tag t-gray">${r.m}</span></td>
    <td class="col-num">${xesc(r.p)}</td><td>${xesc(r.v)}</td>
    <td><span class="tag ${RISK_CLS[r.risk]}">${r.risk}</span></td><td>${pathReqTag(r.req)}</td><td>${xesc(r.owner)}</td>
    <td>${lcTag(r.lc)}</td>
    <td>${r.lc==="已下线"?`<button class="btn link" onclick="reactivatePath('${r.resId}','${r.m}','${escJsAttr(r.p)}')" title="重新激活：恢复为「已激活」，该条目下线期间的访问要求原样恢复">重新激活</button>`:`<button class="btn link danger" onclick="archivePath('${r.resId}','${r.m}','${escJsAttr(r.p)}')" title="下线（可逆）：生命周期转「已下线」，该条目的访问要求按未配置处理（default deny）；承载访问要求时须先完成二次认证，重新激活后原要求恢复">下线</button>`}
    <button class="btn link" onclick="openApiEdit('${r.resId}',${JSON.stringify(r).replace(/"/g,'&quot;')})">编辑</button></td></tr>`).join("") :
    `<tr><td colspan="10"><div class="empty"><div class="big">${_flt?"无匹配条目":"未登记细粒度资源"}</div><span class="muted">${_flt?"当前筛选条件下没有条目，调整筛选条件后重试":"先「+ 添加资源」再手工登记或 OpenAPI 导入；访问要求由策略引擎 default deny 统一裁决"}</span>${_flt?'<div style="margin-top:10px"><button class="btn sm" onclick="pathClearF()">清空筛选条件</button></div>':""}</div></td></tr>`);
  $("#pathPager").innerHTML=pathPager(total, a._pathPage);
  window._detailAid=a.id;
}
["fPathK","fPathRes","fPathRisk","fPathLc"].forEach(id=>{const el=document.getElementById(id); if(el){el.addEventListener("input",()=>{const a=byId(window._detailAid||CUR); if(a) a._pathPage=1; renderPaths(byId(window._detailAid||CUR));}); el.addEventListener("change",()=>{const a=byId(window._detailAid||CUR); if(a) a._pathPage=1; renderPaths(byId(window._detailAid||CUR));});}});
/* ★ R61（轮7）：细粒度清单空态「清空筛选条件」—— 该表筛选控件为 1 搜索 + 3 下拉 + 方法 chips，
   空态此前只给文字（同类列表如「资产访问控制策略」「Web 安全各表」均已给出该出口）。 */
function pathClearF(){
  ["fPathK","fPathRes","fPathRisk","fPathLc"].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=""; });
  var a=byId(window._detailAid||CUR); if(!a) return;
  a._mSel=[]; a._pathPage=1; renderPaths(a); toast("已清空筛选条件");
}
bind("#btnAddApi", el=>el.onclick=()=>openApiEdit("",null));
/* 登记 / 编辑弹窗内：按路径实时派生匹配语义 chips（参数化 / 前缀 / ** 多段通配 / * 通配 / 精确，可组合叠加） */
function apiMtAuto(){
  const pEl=$("#apiP"), box=$("#apiMtChips"); if(!pEl||!box) return;
  const mtCls={"精确":"t-gray","参数化":"t-ok","前缀":"t-info","** 多段通配":"t-err","* 通配":"t-warn"};
  const tags=mtTags(pEl.value);
  box.innerHTML=tags.length?tags.map(t=>`<span class="tag ${mtCls[t]||"t-gray"}">${t}</span>`).join(" "):'<span class="muted">—</span>';
}
/* 当前操作人（演示）：细粒度资源「负责人」登记/修改时自动落账，取自顶栏用户；审计署名同源 */
function opUser(){
  try{
    const t=document.querySelector("#topbarUser");
    if(t){ const s=t.textContent.split("｜")[0].trim(); if(s){
      const parts=s.split(/\s+/);
      return parts.length>=2 ? parts[parts.length-1] : s;
    } }
  }catch(e){}
  return "张伟";
}
/* 登记面方法候选（HTTP 方法全集）。条目身份 =「资源 × 方法 × 路径」的分量，**一条一个方法**——
   多选只用于「一次展开多条独立条目」（见保存分支），不是单条记录多值。gRPC 流类型 / WS 帧
   另由作用对象级承载（设计稿 §10.1 列组表），本弹窗按 HTTP 方法登记。 */
const API_METHODS=["GET","POST","PUT","PATCH","DELETE"];
/* ★ 2026-10-12（R57 · 表-3）：上面注释说「gRPC 流类型 / WS 帧另由作用对象级承载」，但**筛选面**
   的 methodOpts 明示「不写死 HTTP 五法：清单里可有 gRPC 流类型（如「gRPC 一元调用」）与 WS 帧
   （如「WS 帧（双向）」）」，且种子清单确有这两类条目 —— 于是同一弹窗「筛得到、建不出」：
   含 gRPC / WS 条目的资产无法新增同类条目，登记面与筛选面取值域自相矛盾。
   修法：候选 = 标准 HTTP 五法 ∪ 该资产清单**已有**的方法（按首次出现序），与 methodOpts 同源；
   既不新增产品能力（仍只登记已存在的方法类型），也不再让取值域两处各写一套。 */
function apiMethodCands(a){
  const out = API_METHODS.slice();
  flatResPaths(a).forEach(function (p) { if (p && p.m && out.indexOf(p.m) < 0) out.push(p.m); });
  return out;
}
/* 当前勾选的方法（chips 的 .on）；编辑态恒为单项 */
function apiMSelected(){
  const box=$("#apiM"); return box?[...box.querySelectorAll(".chip.on")].map(c=>c.dataset.m):[];
}
function openApiEdit(resId,r){
  const a=ctxAsset();
  if(!(a.res||[]).length){toast("当前资产暂无资源：请先到「资源与访问」添加资源"); return;}
  const resOptions=(a.res||[]).map(x=>`<option value="${x.id}" ${x.id===resId?"selected":""}>${esc(x.name)}（${esc(x.kind)}）</option>`).join("");
  const sel=(v,opts)=>opts.map(o=>`<option ${o===v?"selected":""}>${o}</option>`).join("");
  openDlg(r?"编辑细粒度资源":"登记细粒度资源",
    r?"唯一键（资源×方法×路径）变更与新增均查重；生命周期置「已下线」即停用。匹配语义随路径自动派生，改路径即自动更新，无需手工选择。":"登记后同路径不同方法是不同条目；唯一键（资源×方法×路径）重复将被拒绝。方法可多选——保存时按方法展开为多条独立条目，任一条键冲突即整体拒绝、不产生半截数据。提供业务可读清单名称；匹配语义由系统按路径特征自动判定（{参数} / ** / * 均可识别并可组合）。访问要求由策略引擎 default deny 统一裁决。",`
    <div class="dlg-scroll">
    <div class="form-grid c3">
      <div class="fld full"><label>所属资源 <span class="req">*</span></label><select id="apiResSel">${resOptions}</select></div>
      <div class="fld full"><label>HTTP 方法 <span class="req">*</span></label>
        <div class="chips" id="apiM" data-single="${r?1:0}">${apiMethodCands(a).map(mm=>`<span class="chip${(r?r.m===mm:mm==="GET")?" on":""}" data-act="apiMChip" data-m="${xesc(mm)}">${xesc(mm)}</span>`).join("")}</div>
        <div class="help">${r?"条目身份为「资源 × 方法 × 路径」，方法即本条目的身份分量——修改即改写这一条。":"可多选：每个方法保存为一条独立条目（唯一键 = 资源 × 方法 × 路径），与 OpenAPI 导入同口径；与既有条目同路径同方法时整体拒绝、不部分写入。"}</div></div>
      <div class="fld"><label>API 版本</label><input type="text" id="apiV" value="${r?xesc(r.v):"v1"}"></div>
      <div class="fld"><label>风险等级</label><select id="apiRisk">${sel(r?r.risk:"中",["低","中","高"])}</select></div>
      <div class="fld full"><label>清单名称 <span class="req">*</span></label><input type="text" id="apiName" value="${r?xesc(r.name||""):""}" placeholder="业务可读名称，如：查询客户资料 / 批量转账"></div>
      <div class="fld"><label>负责人</label><input type="text" id="apiOwner" value="${opUser()}" readonly style="background:#f4f6f9" title="自动取当前操作人（登记 / 修改均自动落账）"><div class="help">自动取当前操作人；登记时记为登记人，修改保存后更新为最后修改人</div></div>
      <div class="fld"><label>生命周期</label><select id="apiLc">${sel(r?r.lc:"已激活",["已激活","已下线"])}</select></div>
      <div class="fld full"><label>规范化路径 <span class="req">*</span></label><input type="text" id="apiP" value="${r?xesc(r.p):""}" placeholder="/api/accounts/{id}/txns/* · /img/**/icons/*.svg · /a/*/b · /login" oninput="apiMtAuto()"></div>
      <div class="fld full"><label>匹配语义<span class="muted" style="font-weight:400; margin-left:4px">按路径自动派生，无需选择</span></label>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap"><span id="apiMtChips"></span></div>
        <div class="help">{参数} → 参数化；独立段 ** → ** 多段通配（跨零至任意层级，如 /a/**/b）；末尾整段 * → 前缀（开放其后任意子路径，如 /static/*）；中缀或文件名部分的 * → * 通配（不跨层级，如 *.html、/a/*/b）；特征可组合叠加（如 /img/**/icons/*.svg → ** 多段通配 · * 通配）。修改路径实时更新。</div></div>
    </div>
    </div>`,"lg");
  apiMtAuto();
  $("#dlg1Ok").onclick=()=>{
    const name=$("#apiName").value.trim(), ms=apiMSelected(), p=$("#apiP").value.trim();
    /* ★ R61·轮12：校验序按**视觉序**（表单为 所属资源 → HTTP 方法 → … → 清单名称 → … → 规范化路径）——
       原先先提示「清单名称」（视觉第 5 位）、再提示「HTTP 方法」（视觉第 2 位），用户改完前者才发现后者也没选。 */
    if(!ms.length){ markBad($("#apiM"), true); toast(r?"请选择方法":"请至少选择一种方法"); return;}
    if(!name){ markBad($("#apiName"), true); toast("清单名称为必填（业务可读名称）"); return;}
    if(!p){ markBad($("#apiP"), true); toast("规范化路径为必填"); return;}
    if(!p.startsWith("/")){ markBad($("#apiP"), true); toast("规范化路径需以 / 开头"); return;}
    const toRes=a.res.find(x=>x.id===$("#apiResSel").value);
    let self=null, fromRes=null;
    if(r){
      fromRes=a.res.find(x=>x.id===r.resId)||null;
      const arr=fromRes?(fromRes.paths||[]):[];
      const i=arr.findIndex(q=>q.m===r.m&&q.p===r.p);
      if(i>=0) self=arr[i];
      if(!self){toast("原条目不存在（可能已变更），请刷新后重试"); return;}
    }
    const base={mt:mtOf(p),p,v:$("#apiV").value.trim()||"v1",risk:$("#apiRisk").value,owner:opUser(),lc:$("#apiLc").value};
    if(r){
      /* 编辑：方法单选——条目身份（资源 × 方法 × 路径）是标量，改方法即改写这一条 */
      const m=ms[0];
      const dup=((toRes.paths)||[]).some(q=>q!==self&&q.m===m&&q.p===p);
      if(dup){toast("唯一键冲突：该资源已存在 "+m+" "+p+" 的条目"); return;}
      Object.assign(self,{name,m},base);
      if(fromRes!==toRes){fromRes.paths=fromRes.paths.filter(q=>q!==self); toRes.paths=toRes.paths||[]; toRes.paths.push(self);}
      closeDlg(); toast("细粒度资源条目已保存（匹配语义按路径自动更新；变更入审计）（演示）"); assetRerender(); return;
    }
    /* 新增：多选**展开**——每个方法一条独立条目（唯一键仍是「资源 × 方法 × 路径」的标量身份）。
       逐条过唯一键，任一条冲突即整体不写入（与 OpenAPI 导入同一事务口径）。 */
    toRes.paths=toRes.paths||[];
    const dupM=ms.filter(mm=>toRes.paths.some(q=>q.m===mm&&q.p===p));
    if(dupM.length){toast("唯一键冲突：该资源已存在 "+dupM.join(" / ")+" "+p+" 的条目，未写入任何条目"); return;}
    ms.forEach(mm=>toRes.paths.push(Object.assign({name,m:mm},base)));
    closeDlg();
    toast(ms.length>1?("已登记 "+ms.length+" 条细粒度资源（"+ms.join(" / ")+"），各为独立条目；匹配语义自动派生，唯一键入清单（演示）"):"已登记细粒度资源：匹配语义自动派生，唯一键入清单；访问要求由策略引擎 default deny 统一裁决（演示）");
    assetRerender();
  };
}
function archivePath(resId,m,p){
  const a=ctxAsset();
  const res=(a.res||[]).find(x=>x.id===resId); const it=(res&&res.paths||[]).find(q=>q.m===m&&q.p===p);
  if(!it) return;
  const doArchive=()=>{ it.lc="已下线"; assetRerender();
    toast("已下线 "+m+" "+p+"：生命周期=已下线，策略判定按停用处理（演示）"); };
  /* 承载访问要求的条目：下线即暂停一条生效中的访问要求 → 二次认证 + 影响面明示（既不静默执行，也不硬拒）。
     下线可逆：req 字段保留（属「暂停」而非「解除引用」），重新激活后该访问要求原样恢复。 */
  if(it.req){
    ask2FA("下线细粒度路径「"+m+" "+p+"」", doArchive, null,
      "该条目<b>承载访问要求</b>（"+xesc(it.req)+"）：下线后该条目的访问要求<b>按未配置处理（default deny）</b>——请求不达上游，细粒度页对应行不再出现。"
      + "生命周期取<b>已激活 / 已下线</b>两态：下线<b>随时可「重新激活」</b>，重新激活后本条目的访问要求<b>原样恢复</b>，无需重配。");
    return;
  }
  doArchive();
}
function reactivatePath(resId,m,p){
  const a=ctxAsset();
  const res=(a.res||[]).find(x=>x.id===resId); const it=(res&&res.paths||[]).find(q=>q.m===m&&q.p===p);
  if(!it) return;
  it.lc="已激活"; assetRerender();
  toast("已重新激活 "+m+" "+p+"：生命周期=已激活；下线期间的访问要求已按原要求恢复（下线为暂停、未解除引用）（演示）");
}
/* OpenAPI 导入（三种文档来源：粘贴 / 上传文件 / 文档地址）。事务性导入：任一来源的文档统一走同一解析器
   （支持 OpenAPI 2.0 / 3.0 JSON），解析失败或任一条目触发唯一键冲突（资源 × 方法 × 路径）则整体回滚，不产生半截数据。
   解析预览与确认提交共用同一份分析结果，保证所见即所导。 */
const _OAI_DEMO='{"openapi":"3.0.1","info":{"version":"v1"},"paths":{"/api/accounts":{"get":{},"post":{}},"/api/accounts/{id}":{"get":{},"delete":{}},"/api/transfer":{"post":{}}}}';
const _OAI_DEMO_ORDERS='{"openapi":"3.0.1","info":{"version":"v1"},"paths":{"/api/orders":{"get":{},"post":{}}}}';
const _OAI_URL_DEMOS={ "https://api.example.com/openapi.json":_OAI_DEMO, "http://api.example.com/openapi.json":_OAI_DEMO, "https://api.example.com/orders.json":_OAI_DEMO_ORDERS };
function openApiImport(){
  const a=ctxAsset();
  if(!(a.res||[]).length){toast("当前资产暂无资源：请先到「资源与访问」添加资源"); return;}
  const resOptions=(a.res||[]).map(x=>`<option value="${x.id}">${esc(x.name)}（${esc(x.kind)}）</option>`).join("");
  let oiMode="paste", oiFileText="", oiUrlText="";
  openDlg("OpenAPI 导入","支持三种文档来源：粘贴 JSON / 上传 .json 文件 / 填写文档地址由网关侧拉取。解析出的条目按唯一键（资源 × 方法 × 路径）并入所选资源清单，与手工登记同一匹配语义规则；事务性导入：解析失败或任一条目触发唯一键冲突则整体回滚，不产生半截数据。",`
    <div class="form-grid">
      <div class="fld full"><label>导入到资源 <span class="req">*</span></label><select id="oiRes">${resOptions}</select>
        <div class="help">目标资源需已登记为「API / 页面」类；导入的条目将并入其细粒度资源清单。</div></div>
      <div class="fld full"><label>文档来源</label>
        <div class="rmode" style="margin:0" id="oiMode">
          <label class="on"><input type="radio" name="oiMode" value="paste" checked>粘贴文档</label>
          <label><input type="radio" name="oiMode" value="file">上传文件</label>
          <label><input type="radio" name="oiMode" value="url">文档地址</label>
        </div>
        <div class="help">三种来源共用同一解析器；切换到任一来源即自动重新解析并刷新下方预览。</div></div>
      <div class="fld full" id="oiPanes">
        <div id="oiPanePaste">
          <label>OpenAPI JSON 文档 <span class="req">*</span></label>
          <textarea id="oiDoc" style="width:100%;height:150px;box-sizing:border-box;border:1px solid var(--line2);border-radius:8px;padding:8px;font-family:Consolas;font-size:12.5px">${_OAI_DEMO}</textarea>
          <div class="help">仅支持 OpenAPI 2.0 / 3.0 JSON；匹配语义由路径自动派生（含 {name} → 参数化、尾缀 /* → 前缀，可组合），与手工登记同一规则；版本取自 <code>info.version</code> 默认 v1。</div>
        </div>
        <div id="oiPaneFile" style="display:none">
          <label>本地文件 <span class="req">*</span></label>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
            <input type="file" id="oiFile" accept=".json,application/json" style="display:none">
            <button class="btn" id="oiPick">选择 .json 文件</button>
            <span id="oiFileName" class="muted"></span>
            <span id="oiFileState"></span>
          </div>
          <div class="help">选择文件后在本页完成读取与解析，内容不上传；文件内容须为 OpenAPI 2.0 / 3.0 JSON（解析规则同粘贴）。</div>
        </div>
        <div id="oiPaneUrl" style="display:none">
          <label>OpenAPI 文档地址 <span class="req">*</span></label>
          <div style="display:flex; gap:8px; align-items:center">
            <input type="text" id="oiUrl" style="flex:1" placeholder="https://api.example.com/openapi.json">
            <button class="btn" id="oiFetch">拉取文档</button>
          </div>
          <div style="margin-top:6px" id="oiUrlState" class="muted">示例：https://api.example.com/openapi.json（演示环境内置可拉取）</div>
          <div class="help">由平台侧代理解析远程文档地址；浏览器直接拉取受跨域限制的地址时，可改用粘贴 / 上传。</div>
        </div>
      </div>
      <div class="fld full"><label>解析预览</label>
        <div id="oiSum" class="muted" style="font-size:12.5px; line-height:1.7">等待文档内容：粘贴、选择文件或拉取地址后将自动解析。</div></div>
    </div>`,"lg");
  /* 统一解析 + 查重：返回 {empty|fail|ok,items,dups,target} */
  const curText=()=> oiMode==="paste"? ($("#oiDoc").value||"") : oiMode==="file"? oiFileText : oiUrlText;
  const oiAnalyze=()=>{
    const resSel=$("#oiRes"); const target=a.res.find(x=>x.id===resSel.value);
    const txt=curText().trim();
    if(!txt) return {empty:1};
    let doc; try{ doc=JSON.parse(txt); }catch(e){ return {fail:"JSON 解析失败："+e.message}; }
    if(!doc||typeof doc!=="object"||!doc.paths||typeof doc.paths!=="object") return {fail:"文档格式不正确：缺 paths 对象"};
    const METHODS=["get","post","put","patch","delete"], ver=(doc.info&&doc.info.version)||"v1", items=[];
    for(const [raw,ops] of Object.entries(doc.paths)){
      const p=raw;
      if(!p.startsWith("/")) return {fail:"路径必须以 / 开头："+raw};
      for(const m of METHODS){
        if(ops&&typeof ops==="object"&&ops[m]) items.push({m:m.toUpperCase(),mt:mtOf(p),p,v:ver,risk:"中",owner:opUser(),lc:"已激活"});
      }
    }
    if(!items.length) return {fail:"未解析到任何条目（文档中无 get / post / put / patch / delete 操作）"};
    const has=target&&(target.paths||[]).length?target.paths:[];
    const dups=items.filter(it=>has.some(q=>q.m===it.m&&q.p===it.p));
    return {ok:1, items, dups, target};
  };
  const oiPreview=()=>{
    const box=$("#oiSum"); if(!box) return;
    const st=oiAnalyze();
    if(st.empty){ box.className="muted"; box.style.color=""; box.innerHTML="等待文档内容：粘贴、选择文件或拉取地址后将自动解析。"; return; }
    if(st.fail){ box.className=""; box.style.color=""; box.innerHTML=`<span class="tag t-err">解析失败</span><span style="color:var(--err); margin-left:6px">${xesc(st.fail)}（整体回滚，不产生半截数据）</span>`; return; }
    const brief=st.items.slice(0,60).map(it=>`<span class="kr" style="white-space:nowrap">${it.m} ${xesc(it.p)}</span>`).join(" ");
    const dupHtml=st.dups.length?`<div style="color:var(--err); margin:4px 0"><span class="tag t-err">唯一键冲突 ${st.dups.length} 条</span> ${xesc(st.dups.map(d=>d.m+" "+d.p).join("、"))} 已在目标清单存在，需先清理或改选资源后才能导入</div>`:"";
    box.className=""; box.style.color="";
    box.innerHTML=`<span class="tag t-ok">解析成功 · 共 ${st.items.length} 条待导入</span>${dupHtml}<div style="max-height:92px; overflow:auto; margin-top:4px; font-size:12.5px; line-height:1.9">${brief}${st.items.length>60?"<span class=\"muted\"> … 其余省略</span>":""}</div>`;
  };
  const oiModeSync=()=>{
    const v=document.querySelector('#oiMode input:checked');
    if(!v) return; oiMode=v.value;
    $$("#oiMode label").forEach(l=>l.classList.toggle("on", l.querySelector("input").checked));
    $("#oiPanePaste").style.display=oiMode==="paste"?"":"none";
    $("#oiPaneFile").style.display=oiMode==="file"?"":"none";
    $("#oiPaneUrl").style.display=oiMode==="url"?"":"none";
    oiPreview();
  };
  $$("#oiMode input").forEach(inp=>inp.addEventListener("change",oiModeSync));
  $("#oiRes").addEventListener("change",oiPreview);
  $("#oiDoc").addEventListener("input",oiPreview);
  oiPreview(); /* 打开即按默认来源（粘贴示例）出预览 */
  /* 上传文件：FileReader 本地读取，读取完成后落入文件文本并预览 */
  $("#oiPick").onclick=()=>$("#oiFile").click();
  $("#oiFile").addEventListener("change",()=>{
    const f=$("#oiFile").files[0];
    const fn=$("#oiFileName"), st=$("#oiFileState");
    if(!f){ fn.textContent=""; st.innerHTML=""; return; }
    fn.textContent=f.name+"（"+(f.size>=1024?(f.size/1024).toFixed(1)+" KB":f.size+" B")+"）";
    if(!/\.json$/i.test(f.name)){ st.innerHTML='<span class="tag t-warn">非 .json 后缀</span>'; }
    else st.innerHTML="";
    const rd=new FileReader();
    rd.onload=()=>{ oiFileText=String(rd.result||""); st.innerHTML='<span class="tag t-ok">已读取 · 待预览</span>'; oiPreview(); };
    rd.onerror=()=>{ st.innerHTML='<span class="tag t-err">读取失败</span>'; };
    rd.readAsText(f);
  });
  /* 文档地址：真实 fetch（同源 / 已放开跨域可达即解析）；演示示例地址走内置映射模拟拉取 */
  $("#oiFetch").onclick=()=>{
    const u=$("#oiUrl").value.trim(), st=$("#oiUrlState");
    if(!u){ toast("请填写 OpenAPI 文档地址"); return; }
    if(!/^https?:\/\//i.test(u)){ toast("文档地址需以 http:// 或 https:// 开头"); return; }
    st.innerHTML='<span class="tag t-gray">拉取中…</span> <span style="font-family:Consolas">'+xesc(u)+'</span>';
    (async()=>{
      let text=null, err="";
      try{
        const ctrl=new AbortController(), tm=setTimeout(()=>ctrl.abort(),8000);
        const r=await fetch(u,{signal:ctrl.signal}); clearTimeout(tm);
        if(!r.ok) err="HTTP "+r.status; else text=await r.text();
      }catch(e){ err=(e&&e.name==="AbortError")?"连接超时":String((e&&e.message)||e); }
      if(text!=null){ oiUrlText=text; st.innerHTML='<span class="tag t-ok">拉取成功</span> <span style="font-family:Consolas">'+xesc(u)+'</span><span class="muted" style="margin-left:6px">'+xesc(fmtSize(text.length))+'</span>'; oiPreview(); }
      else if(_OAI_URL_DEMOS[u]){ oiUrlText=_OAI_URL_DEMOS[u]; st.innerHTML='<span class="tag t-ok">拉取成功（演示示例）</span> <span style="font-family:Consolas">'+xesc(u)+'</span>'; oiPreview(); }
      else st.innerHTML='<span class="tag t-err">拉取失败</span> <span style="font-family:Consolas">'+xesc(u)+'</span><span class="muted" style="margin-left:6px">'+xesc(err)+'（浏览器跨域 / 网络受限，可改用粘贴或上传）</span>';
    })();
  };
  /* 确认导入：与预览同一分析结果；冲突 / 失败整体回滚 */
  $("#dlg1Ok").onclick=()=>{
    const st=oiAnalyze();
    if(st.empty){ toast("请先提供 OpenAPI 文档（粘贴 / 上传文件 / 拉取文档地址）"); return; }
    if(st.fail){ toast(st.fail+"（整体回滚）"); return; }
    if(!st.target){ toast("目标资源不存在（资源列表已变更，请刷新）"); return; }
    if(st.dups.length){ toast("唯一键冲突：目标资源已存在 "+st.dups[0].m+" "+st.dups[0].p+" 等 "+st.dups.length+" 条（整体回滚）"); return; }
    st.target.paths=st.target.paths||[];
    st.target.paths=st.target.paths.concat(st.items);
    closeDlg(); assetRerender();
    toast("导入成功：共解析 "+st.items.length+" 个细粒度资源条目（事务提交；变更入审计）（演示）");
  };
}
bind("#btnOpenapi", el=>el.onclick=openApiImport);
bind("#btnSyncApi", el=>el.onclick=()=>toast("已同步资产侧路径结构（与登记同源，无变更）（演示）"));

/* ===== 整页分步向导：登记 / 编辑资产（pg-edit） ===== */
let _formMode="register", _formAsset=null, _formStep=1, _efErr=0, _formFrom="pg-list";
let _efSnap="";   /* R25 进入向导时的语义字段快照：离页时据此判断「有改动先确认」 */
/* ★ 2026-10-12（R53 · A1-F6）：向导内「代理与上游 / 响应地址改写」为即时生效（直接写资产对象），
   故需保留一份进入时的基线，供「取消 / 跳页」时回滚。 */
let _efBase=null;
function formOn(){ const el=document.getElementById("pg-edit"); return !!(el&&el.classList.contains("on")); }
function ctxAsset(){ return _formAsset || byId(window._detailAid||CUR); }
function assetRerender(){
  if(formOn()){ efRenderRes(); efRenderPaths(); efSummary(); }
  else { const a=ctxAsset(); if(a){ renderRes(a); renderPaths(a); } }
}
function efTypeWeb(){ /* 向导内「可按 Web 资源化」：网页应用恒真（细粒度资源清单承载以资源类型 kind 判定） */
  if(!_formAsset) return false;
  const tEl=document.getElementById("eaType2"), tv=tEl?tEl.value:_formAsset.type;
  return tv==="网页应用";
}
/* 安全等级为登记属性（PRD §0.4 术语）：按类型给出建议默认，登记 / 编辑均可调整；变更入审计 */
function lvDefault(t){ return {数据库:4,"远程主机":4,"文件服务":4}[t]||3; }
function lvOpts(){
  const s=$("#eaLvSel"); if(!s) return null;
  if(!s.dataset.init){ s.innerHTML=["L1","L2","L3","L4","L5"].map(x=>`<option>${x}</option>`).join(""); s.dataset.init="1"; }
  return s;
}
/* 向导 S2 联动 UI：非网页资产（后端地址区）note / 客户端控件；步骤可达规则 */
function eaDesktopUI(){
  const tEl=$("#eaType2"); if(!tEl) return;
  const dlg=$("#eaAddrBox2"); if(!dlg) return;
  const note=$("#eaAddrNote2"), wb=$("#eaWebableHint2");
  if(note) note.innerHTML="非网页资产登记<b>后端服务资源地址（访问协议 + 主机 / 端口 / 路径）</b>作为<b>访问入口</b>：远程主机类默认经平台内嵌方式访问（浏览器内）——终端 <b>WebSSH</b>、远程桌面 <b>WebRDP</b> / <b>WebVNC</b>、文件传输 <b>Web-SFTP</b>，可切换<b>桌面客户端</b>；同一主机上终端会话与文件传输会话的承载方式须一致。数据库 / 文件服务 / 其他 TCP 经桌面客户端访问。端口留空按协议自动补全默认。细粒度资源清单承载由<b>资源类型</b>决定（页面与静态资源 / API / 长连接 / 文件传输 / 管理控制台 5 类支持；非 Web 类仅访问入口与打开方式）。访问协议候选 = 资产类型 ∩ 资源类型（精确交集，不铺开全量协议）。";
  const cr=$("#eaClientReq2"); if(cr) cr.style.display="none";
  const clb=$("#eaClientLb2"); if(clb) clb.textContent="（打开资产时调用的本机客户端；候选随访问协议）";
  const btn=$("#btnEaClientDetect"); if(btn) btn.style.display="";
  const ch=$("#eaClientHint2"); if(ch) ch.textContent="未绑定时打开按协议推荐默认客户端；登记后可在资产详情「资源与访问」调整绑定。";
  if(wb) wb.style.display="none";
  efStepRule();
}
/* 向导内检索预设客户端在终端是否已安装（演示）——非网页资产后端地址区 */
function eaClientDetect(){
  const cs=$("#eaClient2"); if(!cs||!cs.value) return;
  const cl=cs.value, st=clientInstalled(cl), hint=$("#eaClientHint2"); if(!hint) return;
  if(st===null) hint.innerHTML="<b>自选 / 自定义可执行</b>：无法自动检索，登记可执行路径后由管理员确认（演示）";
  else if(st) hint.innerHTML='<span class="tag t-ok">已安装</span><span class="muted" style="margin-left:4px">「运营终端-01」可调用（版本 / 签名核验通过）</span>';
  else hint.innerHTML='<span class="tag t-err">未检测到安装</span><span class="muted" style="margin-left:4px">请先在终端安装该客户端，或换绑其它预设客户端</span>';
  toast("已检索本机安装情况：客户端「"+cl+"」（演示模拟）");
}
/* 步骤可达规则：可按 Web 资源化（网页应用）→ 全 5 步；其它资产仅 1 基础信息 / 2 资源与访问 / 5 核对与提交（3 细粒度 · 4 代理与上游 专属 Web 资源化） */
function efStepRule(){
  const web=efTypeWeb(), cur=_formStep;
  $$("#efSteps .step").forEach(st=>{ const n=+st.dataset.s; st.classList.toggle("disabled", !web&&(n===3||n===4)); st.title = (!web&&(n===3||n===4)) ? "非网页应用无此步骤：细粒度资源清单 / 代理与上游仅网页应用需要" : ""; });
  if(!web&&(cur===3||cur===4)) efGo(5); else efStepNav();
}
function efSyncType(){
  const t=$("#eaType2").value;
  if(_formAsset) _formAsset.type=t;
  if(t!=="网页应用"){ ["eaHost2","eaPort2","eaPath2"].forEach(id=>{const el=document.getElementById(id); if(el) el.value="";}); }   // 资产形态变化：清空旧类型遗留的后端地址三框
  const ls=lvOpts(); if(ls) ls.value="L"+lvDefault(t);
  const hint=$("#eaLvHint"); if(hint) hint.textContent="按类型建议 L"+lvDefault(t)+"，可调整；登记后仍可修改（变更入审计）";
  if(t!=="网页应用") eaProtoFill(t, null);   // 预填 S2 后端地址区：协议候选 / 端口占位 / hint 文本
  eaDesktopUI();
  const s=_formStep;   // 类型即形态：按当前停留步骤即时刷新视图（S2 资源/地址区形态、S3 清单、S4 上游、S5 汇总校验），避免旧类型界面残留
  if(s===2) efBody2View(); else if(s===3) efRenderPaths(); else if(s===4) efUpstream(); else if(s===5) efSummary();
}
function efLvVal(){ const ls=lvOpts(); return parseInt(String((ls&&ls.value)||"L3").replace(/^L/,""),10)||3; }
function efFill(){
  const a=_formAsset;
  const sel=$("#eaType2");
  sel.innerHTML=TYPES.map(t=>`<option value="${t}" ${t===a.type?"selected":""}>${t}</option>`).join("");
  sel.disabled=(_formMode==="edit");
  $("#eaName2").value=a.name||"";
  /* ★ 2026-10-12（R57 · 表-8）：所属部门改为**受控候选** —— 取值域由平台组织树 ORG_TREE 派生
     （与策略侧 user.org 的组织树、身份台账的归属组织同源）。原为自由文本 ⇒ 可造出组织树之外的
     第二套部门名册，而该值被资产详情与策略条件的部门取值域读取。存量值不在组织树内时**保留
     原值**（缺项动态补 option），与下方「资产分组」同一处置（R26 · 跨模块评审 A-5），
     不静默回落到第一个部门。 */
  (function(){ var _sel=$("#eaDept2"); if(!_sel) return;
    var _names=(typeof ORG_TREE!=="undefined"&&ORG_TREE[0]&&ORG_TREE[0].kids)?ORG_TREE[0].kids.map(function(n){return n.name;}):[];
    var _d=String(a.dept||"");
    var _html=_names.map(function(n){ return '<option value="'+esc(n)+'">'+esc(n)+"</option>"; }).join("");
    if(!_d){ _html='<option value=""></option>'+_html; }
    else if(_names.indexOf(_d)<0){ _html+='<option value="'+esc(_d)+'">'+esc(_d)+"</option>"; }
    _sel.innerHTML=_html; _sel.value=_d; })();
  $("#eaOwner2").value=a.owner||"";
  /* R51：负责人候选由身份台账派生（datalist），不得手输台账外姓名。 */
  (function(){ var dl=document.getElementById("eaOwnerList");
    if(dl){ var pool=(typeof idUserNamePool==="function")?idUserNamePool():[];
      dl.innerHTML=pool.map(function(n){ return '<option value="'+n+'"></option>'; }).join(""); } })();
  /* ★ 2026-10-10（R26 · 跨模块评审 A-5）：取值域补齐「对外服务」。台账含 1 条
     grp:"对外服务"（a19 对外行情资讯门户），而下拉此前只有 4 项 ⇒ 旧兜底把它**静默回落**
     「核心业务」，用户一保存就篡改了资产分组（且认证源「适用范围」以资产组为取值域，
     连带打破「与资产组同域」的前提）。此处不再回落，改为**保留原值**（缺项动态补 option）。 */
  (function(){ var _sel=$("#eaGrp2"); if(!_sel) return; var _g=String(a.grp||"");
    if(!_g) { _sel.value="核心业务"; return; }
    var _has=[].slice.call(_sel.options).some(function(o){ return o.value===_g; });
    if(!_has){ var _o=document.createElement("option"); _o.value=_g; _o.textContent=_g; _sel.appendChild(_o); }
    _sel.value=_g; })();
  /* ★ 2026-10-12（R57 · 交-3）：向导内「资产状态」改为**只读**。
     启停/停用改变生效面（停用 = 整体下线 + 撤销无端编排），全站同档走二次认证（列表与详情的
     状态开关 enSwitch 即如此）。向导是多步长表单、保存是一个整块提交动作，若在其中再实现一次
     「改状态即认证」，同一动作就有两个实现，必然回退到不一致。收敛到唯一入口：状态在列表 /
     详情的「状态」栏切换 —— 与详情页既有脚注「保存后可在列表『状态』栏切换」一致。 */
  const enS=$("#eaEn2");
  if(enS){ enS.value=(a.en===0)?"0":"1"; enS.disabled=true;
    enS.title="资产状态在「资产列表 / 资产详情」的「状态」栏切换（启停改变生效面，需二次认证）"; }
  if(_formMode==="edit"){
    const ls=lvOpts(); if(ls) ls.value="L"+(a.lv||3);
    const hint=$("#eaLvHint"); if(hint) hint.textContent="当前 L"+(a.lv||3)+"：登记属性，按敏感度调整（变更入审计）";
    if(a.type!=="网页应用"){
      nwNorm(a); eaProtoFill(a.type,a.addrProto); eaAddrFill(a.addr);
      const cs=$("#eaClient2"); if(cs){ cs.innerHTML=clientOptions(a.addrProto,a.client||clientDefault(a.type,a.addrProto),a.type); cs.dataset.u=a.client?"1":"0"; }
    }
    eaDesktopUI();
  } else {
    // 登记向导每次打开为干净初始态：清空上一表单实例可能残留的后端地址三框 / 客户端选择（地址区在 S2「资源与访问」登记）
    ["eaHost2","eaPort2","eaPath2"].forEach(id=>{const el=document.getElementById(id); if(el) el.value="";});
    const pc=$("#eaClient2"); if(pc){ pc.value=""; pc.dataset.u="0"; }   // 登记向导干净初始态：客户端未选择 → 切换协议时跟随新协议默认
    efSyncType();
  }
}
function efGo(s){
  if(!_formAsset) return;
  const web=efTypeWeb();
  if(!web&&(s===3||s===4)) return;
  _formStep=s;
  $$("#efSteps .step").forEach(st=>{
    const n=+st.dataset.s;
    st.classList.toggle("on",n===s);
    st.classList.toggle("done",n<s);
    st.classList.toggle("disabled",!web&&(n===3||n===4)); st.title = (!web&&(n===3||n===4)) ? "非网页应用无此步骤：细粒度资源清单 / 代理与上游仅网页应用需要" : "";
  });
  for(let i=1;i<=5;i++){ const b=document.getElementById("efBody"+i); if(b) b.style.display=i===s?"":"none"; }
  if(s===2) efBody2View();
  if(s===3) efRenderPaths();
  if(s===4) efUpstream();
  if(s===5) efSummary();
  efStepNav();
  window.scrollTo(0,0);
}
function efStepNav(){
  const s=_formStep;
  $("#btnEfPrev").style.display=s===1?"none":"";
  $("#btnEfNext").style.display=s===5?"none":"";
  $("#btnEfSubmit").style.display=s===5?"":"none";
  $("#btnEfSubmit").textContent=_formMode==="edit"?"保存修改":"完成登记";
  /* 步进提示：非 Web 资产跳过第 3 / 4 步，提示文案同步跳过（与实际可达步一致）。 */
  const HINT={1:"第 1 步 · 基础信息（名称 / 类型 / 安全等级 / 归属）",2:"第 2 步 · 资源与访问（登记访问入口）",3:"第 3 步 · 细粒度资源清单",4:"第 4 步 · 代理与上游",5:"第 5 步 · 核对与提交"};
  const hint=$("#efStepHint"); if(hint) hint.textContent=HINT[s]||"";
}
function efNext(){ const web=efTypeWeb(); let s=_formStep+1; if(!web&&(s===3||s===4)) s=5; if(s>5) return; efGo(s); }
function efPrev(){ const web=efTypeWeb(); let s=_formStep-1; if(!web&&(s===4||s===3)) s=2; if(s<1) return; efGo(s); }
/* S2「资源与访问」视图：可按 Web 资源化 → 网页式资源表（+ 添加资源）；否则 → 后端服务资源快捷登记（协议 + 主机/端口/路径 · 打开方式 · 客户端） */
function efBody2View(){
  const a=_formAsset; if(!a) return;
  const t=a.type, web=efTypeWeb();
  const sub=$("#efBody2Sub");
  if(sub) sub.textContent=web
    ? "登记主资源 + 附属资源（每项独立：多节点 / 外部访问地址 / 细粒度资源清单）；首个资源自动设为主资源"
    : "登记该项资产的后端服务资源地址：访问协议 + 主机 / 端口 / 路径 · 打开方式 · 客户端；端口留空按协议自动补全默认";
  const box=$("#eaAddrBox2"), wrap=$("#efResWrap"), add=$("#btnEfAddRes");
  if(box) box.style.display=web?"none":"block";
  if(add) add.style.display=web?"":"none";
  if(wrap) wrap.style.display=web?"":"none";
  if(web){
    efRenderRes();
    const more=$("#eaBackMore2"); if(more) more.style.display="none";
    eaDesktopUI();
  } else {
    const br=(a.res||[]).find(isBackRes);
    if(br){ eaProtoFill(t,br.proto); eaAddrFill(joinAddr(br.host,br.port,br.path,br.proto)); }
    const backN=(a.res||[]).filter(isBackRes).length, more=$("#eaBackMore2");
    if(more){ more.style.display=backN>0?"block":"none"; more.textContent="该资产共登记 "+backN+" 条后端服务资源（含此前在详情「资源与访问」添加）：此处维护主登记项，其余条目保存后可在详情继续调整。"; }
    eaDesktopUI();
  }
}
/* ===== 代理与上游 · 可编辑配置组件（详情 t4 与 向导 S4 共用；id 前缀区分，详情 pfx="" / 向导 pfx="ef"）=====
   资产键：_inj 注入模式（两档：不注入 / 注入网关托管凭据；**配置面 = 资产详情「身份适配 → 机器身份」**）/
            _injCred 托管凭据（同上配置面）/ _hdrAllow 允许透传业务头（配置面 = 「上游透传与校验」）/
   _tls 上游 TLS / _idem401 非幂等 401 重放 / _scRw Set-Cookie 域重写 / _rewrite 响应地址改写 /
   _rwBigEx 大响应放行例外 / _nets 允许目标网段。全部就地编辑、变更即时写资产并提示收敛。
   注入范围（2026-09-20 用户口径）：固定为「仅非 public 路径」（硬规则、不提供开关）——显式公开（public）
   路径匿名直达、无主体身份，永不注入平台身份 / 托管凭据；计数与说明见 upScopeInfo / upScopeHtml。
   档位收敛（2026-09-22 v18 用户裁定）：「注入平台 token」注入的是**主体（用户）身份**，属二期 F2.2
   出站身份适配层 —— 该档已**迁入资产详情「身份适配」页签（A 档）**；本页自此只保留「网关 → 上游」
   连接级的机器凭据（不注入 / 注入网关托管凭据），**配置面在资产详情「身份适配」**（2026-09-30 由本处移入）。
   引擎侧三档不变（FL2 §10）。 */
function upCfgDft(a){
  return { inj:(a._inj==="cred")?"cred":"none",
    cred:a._injCred||"cred-rpt",
    rw:a._rewrite!==false, big:a._rwBigEx||[],
    tls:a._tls!==false, idem:a._idem401!==false, sc:a._scRw!==false,
    hdr:a._hdrAllow||[], nets:(a._nets&&a._nets.length)?a._nets.slice():["10.0.0.0/8","172.16.0.0/12","192.168.0.0/16"],
    tlsMode:(a._tlsMode==="ca"||a._tlsMode==="test")?a._tlsMode:"platform",
    tlsCa:a._tlsCa||"", tlsSni:a._tlsSni||"", mtls:a._mtls||"", tlsWhy:a._tlsWhy||"" };
}
/* 渲染前把缺省配置物化到资产（仅首次 / 未定义时补默认；用户删空的 [] 保留，避免刷新即还原） */
function upCfgEnsure(a){
  if(!a) return;
  if(a._nets===undefined) a._nets=["10.0.0.0/8","172.16.0.0/12","192.168.0.0/16"];
  if(!Array.isArray(a._hdrAllow)) a._hdrAllow=[];
  if(!Array.isArray(a._rwBigEx)) a._rwBigEx=[];
}
/* —— 上游认证注入范围（硬规则：public 路径永不注入）—— */
/* 范围是平台安全基线、不可配，故只做只读呈现（不含控件）。
   计数口径：只统计「在网路径」（lc≠「已下线」）；public = 路径级「显式公开」或资产级「整资产匿名」。 */
function upScopeInfo(a){
  var all=(typeof flatResPaths==="function")?flatResPaths(a||{}):[];
  var live=all.filter(function(p){ return p.lc!=="已下线"; });
  var anonAll=!!(a&&a.anon==="asset");
  var isPub=function(p){ return anonAll||(p&&p._rq&&p._rq.kind==="public")||/显式公开/.test((p&&p.req)||""); };
  var pub=live.filter(isPub).length, non=live.length-pub, off=all.length-live.length;
  var val='<b>仅非 public 路径</b> <span class="muted">（平台安全基线 · 固定不可改）</span>';
  var head=anonAll
    ? '该资产为 <b>整资产匿名开放</b>：'+live.length+' 条在网路径全部 public ⇒ <b>上游认证注入不生效</b>（上游按公开资源处理）。'
    : '该资产 '+live.length+' 条在网路径中：<b>public '+pub+' 条</b>不注入，其余 <b>'+non+' 条</b>在注入范围内。';
  var help=head
    +'<br>「显式公开（public）」路径匿名直达、<b>无主体身份</b>；向其注入平台身份 / 托管凭据＝把特权凭据交给匿名流量，故<b>永不注入</b>。若某路径确需凭据，请在「资产细粒度访问策略」中取消其 public。'
    +(off? ' <span class="muted">（另 '+off+' 条已下线路径不计入）</span>' : '')
    +'<br><span class="muted">本条仅约束<b>请求级注入</b>（本页＝<b>网关托管凭据</b>）；用户 / 主体身份的 token 注入由《认证模块》的「身份适配」页承载（本原型不含该页）。mTLS 客户端证书在 TLS 握手阶段出示、早于路径判定，属连接级，不在本条作用域内。</span>'
    +'<br><span class="muted">口径收窄（2026-09-20 安全评审）：PRD 一期 §0.2／§0.3 原文为「public 只免除用户认证、<b>上游认证注入照常</b>」；本页按评审口径收窄为 <b>public 永不注入</b>。</span>';
  return { val:val, help:help, head:head, anonAll:anonAll, pub:pub, non:non, live:live.length, off:off, inactive:non===0 };
}
function upScopeHtml(a){ var s=upScopeInfo(a); return s.val+'<div class="help">'+s.help+'</div>'; }
/* —— 托管凭据：换取式 / 静态注入 摘要（资产侧只读反映凭据托管的类型语义）—— */
function upCredFlow(credId){
  var c=(typeof credById==="function")?credById(credId):null;
  if(!c) return "";
  if(c.type!=="OAuth2 Client") return '<b>静态注入</b>：网关直接注入该凭据（'+esc(c.type)+'），不经换取。';
  var o=c.oauth||{};
  var am=(o.authMethod==="client_secret_post")?"client_secret_post（密钥放 body）":"client_secret_basic（Basic 头）";
  return '<b>换取式注入</b>：网关以 <b>POST application/x-www-form-urlencoded</b> 调 <b>'+(o.endpoint?esc(o.endpoint):"（未配置令牌端点）")+'</b> '
    +'（grant_type='+esc(o.mode||"client_credentials")+' · 客户端认证 '+esc(am)+(o.scope?(' · scope '+esc(o.scope)):"")+(o.audience?(' · audience '+esc(o.audience)):"")+'）'
    +'换取<b>短时 access token</b>，再注入 <b>Authorization: Bearer</b>；token 过期自动重取，上游 401 仅 GET / HEAD 自动刷新并重放一次。';
}
/* 预置信任锚候选（内网私有 PKI 常见命名；上传与轮换在「凭据托管 · CA 管理」维护） */
const UP_TLS_CAS=["网银域根 CA（bank-wy-root）","OA 域根 CA（bank-oa-root）","数据报送域根 CA（bank-rpt-root）"];
/* 资产侧两处下拉：与凭据托管三分区逐行对应，且**直接由凭据托管驱动**（库里新增 / 停用，资产侧自动跟着变）。
   ⚠ 旧写法把「mTLS 客户端证书」混进了「网关托管凭据」下拉、类型写作「双向 TLS」，与三分区映射矛盾。 */
const UP_CREDS = () => CRED_LIST.filter(c => c.st === "已启用").map(c => [c.id, c.name, c.type]);
const UP_MTLS  = () => MTLS_LIST.filter(c => credExpSt(c.exp) !== "已过期").map(c => [c.id, c.name, "mTLS"]);
const UP_HDR_CANDS=["X-User-Id","X-User-Dept","X-Client-Id","X-Request-Id","X-Forwarded-For","X-Real-IP","X-Correlation-Id"];
/* 单条 chips 值项；× 删除（xesc 转义后写入 data-v，避免特殊字符截断） */
function upChipItem(v){ return `<span class="tag t-ok" data-v="${xesc(v)}" style="margin:0; display:inline-flex; align-items:center">${xesc(v)}<b class="x" style="cursor:pointer; margin-left:5px; color:inherit" title="移除">×</b></span>`; }
/* CIDR 严格校验：IPv4 四段 0~255 + 前缀 0~32（含掩码合法性） */
function upCidrOk(v){
  const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(String(v||"").trim());
  if(!m) return false;
  for(let i=1;i<=4;i++){ if(+m[i]>255) return false; }
  const p=+m[5]; return p>=0&&p<=32;
}
/* 目标 chips 行重绘（用于非局部场景；删除走局部 chip.remove） */
function upChipDraw(wrapId,arr){ const w=document.getElementById(wrapId); if(!w) return; w.innerHTML=arr.map(upChipItem).join("")||`<span class="muted" style="font-size:12.5px">未配置</span>`; }
/* 通用「输入 + 添加」行（role 区分：hdr / big / net） */
function upAddRow(pfx,role,ph){ return `<div style="display:flex; gap:6px; align-items:center; margin:6px 0 2px"><input type="text" id="${pfx}${role}In" placeholder="${ph}" ${role==="hdr"?'list="'+pfx+'HdrList"':""} style="flex:1; min-width:0"><button class="btn sm" id="${pfx}${role}Add">+ 添加</button></div>`; }
/* —— 上游透传与校验卡 ——
   ★ 2026-09-30：原名「注入网关托管凭据」。机器身份凭据注入已按用户裁定移入资产详情
   「身份适配」页（唯一配置面），本卡保留「网关 → 上游」通路的其余治理项：
   请求头透传白名单 / Cookie 域重写 / 上游 TLS 校验（含 mTLS）/ 401 重放。 */
function upAuthRender(elId,pfx,a){
  const el=document.getElementById(elId); if(!el) return;
  upCfgEnsure(a);
  const s=upCfgDft(a), R=pfx, I=(pfx==="")?{Rw:"swRewrite",Tls:"swTls"}:{Rw:"efSwRw",Tls:"efSwTls"};
  el.innerHTML=`
    <div class="kv"><span class="k">允许透传的业务头<span class="muted" style="font-weight:400">（白名单；未列出的一律删除）</span></span><div>
      <div id="${R}HdrWrap" style="display:flex; flex-wrap:wrap; gap:6px; align-items:center"></div>
      <datalist id="${R}HdrList">${UP_HDR_CANDS.map(x=>`<option value="${x}">`).join("")}</datalist>
      ${upAddRow(R,"hdr","业务头名，如 X-User-Id（候选可下拉，回车 / 添加生效）")}
      <div class="help">客户端认证头与平台身份头默认删除，仅上方允许的业务头透传；<b>网关会话 Cookie 永不透传上游</b>。</div></div></div>
    <div class="kv"><span class="k">上游 TLS 校验</span><span class="st"><span class="switch"><input type="checkbox" id="${I.Tls}" ${s.tls?"checked":""}><span class="sl"></span></span><span>证书链 / 有效期 / SNI / 主机名（生产 L4～L5 不可关闭）</span></span></div>
    <div id="${R}TlsZone" class="tls-sub" style="display:${s.tls?"":"none"}">
      <div class="kv"><span class="k">校验模式</span><div>
        <span class="rmode" id="${R}TlsMode" style="margin:0">
          <label class="${s.tlsMode!=="ca"&&s.tlsMode!=="test"?"on":""}"><input type="radio" name="${R}tlsMode" value="platform" ${s.tlsMode!=="ca"&&s.tlsMode!=="test"?"checked":""}>平台 CA 校验</label>
          <label class="${s.tlsMode==="ca"?"on":""}"><input type="radio" name="${R}tlsMode" value="ca" ${s.tlsMode==="ca"?"checked":""}>自定义信任锚</label>
          <label class="${s.tlsMode==="test"?"on":""}"><input type="radio" name="${R}tlsMode" value="test" ${s.tlsMode==="test"?"checked":""}>测试例外（跳过校验）</label>
        </span>
        <div class="muted">平台 CA：证书链（平台信任库）/ 有效期 / SNI / 主机名；自定义锚用于内网私有 PKI；测试例外仅限测试环境并全程审计。</div></div></div>
      <div class="kv" id="${R}CaRow" style="display:${s.tlsMode==="ca"?"":"none"}"><span class="k">信任锚（根 CA）</span><div>
        <input type="text" id="${R}TlsCaIn" list="${R}CaList" value="${xesc(s.tlsCa||"")}" placeholder="选择平台预置 CA 或输入名称">
        <datalist id="${R}CaList">${UP_TLS_CAS.map(x=>`<option value="${x}">`).join("")}</datalist>
        <div class="help">内网私有 PKI / 自签证书在此登记；上传与轮换走 <a href="#" class="hl" style="text-decoration:none" onclick="goCred('c2');return false">凭据托管 · CA 管理</a>，变更入审计。</div></div></div>
      <div class="kv" id="${R}WhyRow" style="display:${s.tlsMode==="test"?"":"none"}"><span class="k">例外原因 <span class="req">*</span></span><div>
        <input type="text" id="${R}TlsWhyIn" value="${xesc(s.tlsWhy||"")}" placeholder="如：测试环境自签证书，联调窗口至 09-30">
        <div class="help">跳过证书链与主机名校验并<b>全程审计</b>；生产 L4～L5 不允许开启（保存被拒）。</div></div></div>
      <div class="kv" id="${R}SniRow" style="display:${s.tlsMode==="test"?"none":""}"><span class="k">证书主机名 / SNI 覆盖 <span class="muted" style="font-weight:400">（选填）</span></span><div>
        <input type="text" id="${R}TlsSniIn" value="${xesc(s.tlsSni||"")}" placeholder="节点为 IP 直连而证书签给域名时填写，如 pay.bank.local">
        <div class="help">留空 = 以节点 host 作为 SNI 与主机名校验对象。</div></div></div>
      <div class="kv" id="${R}MtlsRow" style="display:${s.tlsMode==="test"?"none":""}"><span class="k">客户端证书（mTLS） <span class="muted" style="font-weight:400">（选填）</span></span><div>
        <select id="${R}MtlsSel"><option value="">不使用（单向 TLS）</option>${UP_MTLS().map(c=>`<option value="${c[0]}" ${s.mtls===c[0]?"selected":""}>${c[1]}（mTLS）</option>`).join("")}</select>
        <div class="help">证书与私钥由 <a href="#" class="hl" style="text-decoration:none" onclick="goCred('c3');return false">凭据托管 · mTLS 客户端证书</a> 托管，握手自动出示，私钥不出平台。</div></div></div>
    </div>
    <div class="kv"><span class="k">401 重放</span><div style="display:flex; align-items:center; gap:10px"><span class="switch"><input type="checkbox" id="${R}IdemSw" ${s.idem?"checked":""}><span class="sl"></span></span><span>非幂等请求携带幂等键时可自动重放一次；GET / HEAD 自动重放（固定行为，无需开启）</span></div></div>
    <div class="kv"><span class="k">Set-Cookie 处理</span><div style="display:flex; align-items:center; gap:10px"><span class="switch"><input type="checkbox" id="${R}ScSw" ${s.sc?"checked":""}><span class="sl"></span></span><span>业务 Cookie 按资产外部域重写 Domain / Path；平台保留前缀与父域写入固定删除</span></div></div>`;
  /* —— 绑定（闭包 a / s）—— */
  const q=id=>document.getElementById(id);
  /* TLS 配置组（L4～L5：开关不可关、测试例外禁开；详情取 ctxAsset().lv / 向导取 efLvVal） */
  const lvNow=()=> (formOn()?efLvVal():(ctxAsset()&&ctxAsset().lv))||3;
  const tl=q(I.Tls), zone=q(R+"TlsZone");
  const rows={ca:q(R+"CaRow"),why:q(R+"WhyRow"),sni:q(R+"SniRow"),mt:q(R+"MtlsRow")};
  const syncRows=(mode)=>{
    const test=mode==="test";
    if(rows.ca) rows.ca.style.display=mode==="ca"?"":"none";
    if(rows.why) rows.why.style.display=test?"":"none";
    if(rows.sni) rows.sni.style.display=test?"none":"";
    if(rows.mt) rows.mt.style.display=test?"none":"";
  };
  const setMode=m=>{
    if(m==="test"&&lvNow()>=4){ toast("生产 L4～L5 不允许开启测试例外（跳过 TLS 校验）（演示）"); return false; }
    a._tlsMode=m; syncRows(m);
    if(!pfx) toast("上游 TLS 校验模式已切换："+(m==="platform"?"平台 CA 校验（链 / 有效期 / SNI / 主机名）":m==="ca"?"自定义信任锚（内网私有 CA）":"测试例外（跳过校验，全程审计）")+"，2 秒内全节点生效（演示）");
    return true;
  };
  if(tl) tl.onchange=()=>{
    if(!tl.checked&&lvNow()>=4){ tl.checked=true; toast("生产 L4～L5 不可关闭上游 TLS 校验（演示）"); return; }
    a._tls=tl.checked; if(zone) zone.style.display=tl.checked?"":"none";
    if(!pfx) toast("上游 TLS 校验已"+(tl.checked?"开启（按所选模式校验上游证书）":"关闭（L1～L3 可关）")+"（演示）"); };
  const tm=q(R+"TlsMode");
  if(tm) tm.querySelectorAll("label").forEach(l=>l.addEventListener("click",()=>{
    const v=l.querySelector("input").value;
    setMode(v);   /* 守卫在 setMode 内：L4～L5 切测试例外被拒时 _tlsMode 不变 */
    /* 以 a._tlsMode 为准重绘选中态（platform 语义 = 非 ca 且非 test，覆盖 undefined；同时覆盖 label 原生选中，保证数据与视觉一致） */
    const m=a._tlsMode;
    tm.querySelectorAll("label").forEach(x=>{const xi=x.querySelector("input"); const on=(xi.value==="platform")?(m!=="ca"&&m!=="test"):xi.value===m; x.classList.toggle("on",on); if(xi) xi.checked=on;});
    const w=q(R+"TlsWhyIn"); if(v==="test"&&a._tlsMode==="test"&&w&&!a._tlsWhy){ w.classList.add("bad"); if(!pfx) toast("测试例外需填写例外原因（必填，入审计）（演示）"); }
  }));
  const caIn=q(R+"TlsCaIn"); if(caIn) caIn.onchange=()=>{ a._tlsCa=caIn.value.trim(); if(!pfx) toast("自定义信任锚已更新（变更入审计，2 秒内全节点生效）（演示）"); };
  const sniIn=q(R+"TlsSniIn"); if(sniIn) sniIn.onchange=()=>{ a._tlsSni=sniIn.value.trim(); if(!pfx) toast("证书主机名 / SNI 覆盖已更新（演示）"); };
  const whyIn=q(R+"TlsWhyIn"); if(whyIn) whyIn.onchange=()=>{ const v=whyIn.value.trim();
    if(!v){ whyIn.classList.add("bad"); if(!pfx) toast("测试例外原因必填（演示）"); return; }
    whyIn.classList.remove("bad"); a._tlsWhy=v; if(!pfx) toast("测试例外已登记（跳过校验全程审计）（演示）"); };
  const mtSel=q(R+"MtlsSel"); if(mtSel) mtSel.onchange=()=>{ a._mtls=mtSel.value||""; if(!pfx) toast(mtSel.value?"已启用 mTLS 客户端证书（凭据托管，握手自动出示）（演示）":"已关闭 mTLS（单向 TLS）（演示）"); };
  /* 401 幂等重放 / Set-Cookie 域重写 */
  const idem=q(R+"IdemSw"); if(idem) idem.onchange=()=>{ a._idem401=idem.checked; if(!pfx) toast("非幂等 401 重放已"+(idem.checked?"开启（需携带幂等键）":"关闭")+"（演示）"); };
  const sc=q(R+"ScSw"); if(sc) sc.onchange=()=>{ a._scRw=sc.checked; if(!pfx) toast("Set-Cookie 域重写已"+(sc.checked?"开启（按外部域重写 Domain / Path）":"关闭")+"（演示）"); };
  /* 身份头白名单 chips */
  upChipDraw(R+"HdrWrap",s.hdr);
  const hdrIn=q(R+"hdrIn"), hdrAdd=q(R+"hdrAdd"), hdrWrap=q(R+"HdrWrap");
  const chipBind=(wrap,key)=>{
    if(!wrap) return;
    wrap.addEventListener("click",ev=>{ const b=ev.target.closest("b.x"); if(!b) return; const chip=b.closest(".tag"); if(!chip) return;
      const v=chip.dataset.v, arr=a[key]||[]; const i=arr.indexOf(v); if(i>=0){ arr.splice(i,1); chip.remove(); if(!arr.length) upChipDraw(wrap.id,arr); }
      if(!pfx) toast("已移除："+v+"（2 秒内全节点生效）（演示）"); });
  };
  chipBind(hdrWrap,"_hdrAllow");
  const addOne=(inp,key,val)=>{
    if(!val) return;
    const arr=a[key]||[];
    if(arr.includes(val)){ toast("已存在："+val); return; }
    arr.push(val); a[key]=arr; upChipDraw(R+"HdrWrap",arr);
  };
  hdrAdd&&hdrAdd.addEventListener("click",()=>{ addOne(hdrIn,"_hdrAllow",(hdrIn.value||"").trim()); hdrIn.value=""; hdrIn.focus(); });
  hdrIn&&hdrIn.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); addOne(hdrIn,"_hdrAllow",(hdrIn.value||"").trim()); hdrIn.value=""; } });
}
/* —— 响应地址改写卡 —— */
function upRwRender(elId,pfx,a){
  const el=document.getElementById(elId); if(!el) return;
  upCfgEnsure(a);
  const s=upCfgDft(a), R=pfx, RwId=(pfx==="")?"swRewrite":"efSwRw";
  el.innerHTML=`
    <div class="kv"><span class="k">响应地址改写</span><span class="st"><span class="switch"><input type="checkbox" id="${RwId}" ${s.rw?"checked":""}><span class="sl"></span></span><span>内部域名改写为资产外部访问地址（HTML / CSS / JS / JSON URL / 3xx Location）</span></span></div>
    <div class="kv"><span class="k">大响应放行例外<span class="muted" style="font-weight:400">（URL 前缀；L4～L5 阻断生效时放行）</span></span><div>
      <div id="${R}BigWrap" style="display:flex; flex-wrap:wrap; gap:6px; align-items:center"></div>
      ${upAddRow(R,"big","URL 前缀，如 /report/export-large")}
      <div class="help">改写仅针对已登记的内部域名映射，签名 / 加密 / 二进制内容不处理；L1～L3 无法完整检查时原样透传并告警，L4～L5 阻断发送，可登记上方显式例外（风险操作，保存确认并审计）。</div></div></div>`;
  const q=id=>document.getElementById(id);
  const rw=q(RwId);
  if(rw) rw.onchange=()=>{ a._rewrite=rw.checked; if(!pfx) toast("响应地址改写已"+(rw.checked?"开启（2 秒内全节点生效）":"关闭")+"（演示）"); };
  upChipDraw(R+"BigWrap",s.big);
  const wrap=q(R+"BigWrap"), inp=q(R+"bigIn"), add=q(R+"bigAdd");
  if(wrap) wrap.addEventListener("click",ev=>{ const b=ev.target.closest("b.x"); if(!b) return; const chip=b.closest(".tag"); if(!chip) return;
    const v=chip.dataset.v, arr=a._rwBigEx||[]; const i=arr.indexOf(v); if(i>=0){ arr.splice(i,1); chip.remove(); if(!arr.length) upChipDraw(wrap.id,arr); } if(!pfx) toast("已移除例外："+v+"（演示）"); });
  const doBig=()=>{ const v=(inp.value||"").trim(); if(!v) return; const arr=a._rwBigEx||[]; if(arr.includes(v)){ toast("已存在："+v); return; } arr.push(v); a._rwBigEx=arr; upChipDraw(R+"BigWrap",arr); inp.value=""; inp.focus(); if(!pfx) toast("已登记例外："+v+"（风险操作入审计）（演示）"); };
  if(add) add.addEventListener("click",doBig);
  if(inp) inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); doBig(); } });
}
/* —— 目标网段安全校验卡 —— */
function upNetRender(elId,pfx,a){
  const el=document.getElementById(elId); if(!el) return;
  upCfgEnsure(a);
  const s=upCfgDft(a), R=pfx;
  el.innerHTML=`
    <div class="muted" style="margin:0 0 6px; line-height:1.6">域名每次解析均按下方允许网段校验（防 SSRF / DNS rebinding），越界节点摘除并告警；上游目标仅来自平台签名配置。</div>
    <div class="kv"><span class="k">允许目标网段</span><div>
      <div id="${R}NetWrap" style="display:flex; flex-wrap:wrap; gap:6px; align-items:center"></div>
      ${upAddRow(R,"net","CIDR，如 10.0.0.0/8（回车 / 添加生效）")}</div></div>`;
  const q=id=>document.getElementById(id);
  upChipDraw(R+"NetWrap",s.nets);
  const wrap=q(R+"NetWrap"), inp=q(R+"netIn"), add=q(R+"netAdd");
  if(wrap) wrap.addEventListener("click",ev=>{ const b=ev.target.closest("b.x"); if(!b) return; const chip=b.closest(".tag"); if(!chip) return;
    const v=chip.dataset.v, arr=a._nets||[]; const i=arr.indexOf(v); if(i>=0){ arr.splice(i,1); chip.remove(); if(!arr.length) upChipDraw(wrap.id,arr); } if(!pfx) toast("已移除目标网段："+v+"（2 秒内全节点生效）（演示）"); });
  const doNet=()=>{ const v=(inp.value||"").trim(); if(!v) return;
    if(!upCidrOk(v)){ toast("目标网段需为合法 CIDR：IPv4 + /前缀（0～32），如 10.0.0.0/8"); return; }
    const arr=a._nets||[]; if(arr.includes(v)){ toast("已存在："+v); return; } arr.push(v); a._nets=arr; upChipDraw(R+"NetWrap",arr); inp.value=""; inp.focus(); if(!pfx) toast("目标网段已更新（2 秒内全节点生效）（演示）"); };
  if(add) add.addEventListener("click",doNet);
  if(inp) inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); doNet(); } });
}
/* —— 详情 t4 渲染（openDetail 调用；向导 s4 不渲染，避免 id 冲突）—— */
function upRenderDetail(a){
  upRwRender("t4RwBody","",a); upAuthRender("t4AuthBody","",a); upNetRender("t4NetBody","",a);
}
/* S4 代理与上游：渲染向导侧配置区（登记默认；编辑回填 _inj/_rewrite/_tls 等全部资产键） */
function efUpstream(){
  const a=_formAsset; if(!a) return;
  upRwRender("s4RwWrap","ef",a); upAuthRender("s4AuthWrap","ef",a); upNetRender("s4NetWrap","ef",a);
}
function efRenderRes(){
  const a=_formAsset, list=a.res||[];
  const KC=RES_KC;
  $("#efResWrap").innerHTML=list.length?`<table>
    <thead><tr><th>资源名称</th><th>类型</th><th>访问协议</th><th>内部节点</th><th>外部访问地址</th><th>细粒度清单</th><th>负载均衡</th><th style="width:200px">操作</th></tr></thead>
    <tbody>${list.map(r=>{const bk=isBackRes(r); return `<tr>
      <td><b>${esc(r.name)}</b>${r.main?'<span class="badge-main">主</span>':""}</td>
      <td><span class="tag ${KC[r.kind]||"t-gray"}">${r.kind}</span></td>
      <td><span class="tag t-gray">${r.proto||"HTTP"}</span></td>
      <td>${bk?'<span class="muted">—（单一连接目标）</span>':(r.nodes||[]).map(x=>nodeChipHtml(r,x)).join("")+`<button class="btn sm" onclick="nodeMgr('${r.id}')">管理</button>`}</td>
      <td><span class="kr">${xesc(r.ext||"—")}</span></td>
      <td>${bk?'<span class="muted">—</span>':(r.paths||[]).length+" 条"}</td>
      <td>${bk?'<span class="muted">—</span>':(r.lb||"轮询")}</td>
      <td><button class="btn sm" onclick="editRes('${r.id}')">编辑</button>
      ${bk?"":'<button class="btn link" onclick="efGo(3)">清单</button>'}
      ${r.main?"":`<button class="btn sm danger" onclick="delRes('${r.id}')">删除</button>`}</td></tr>`;}).join("")}</tbody></table>`
    : `<div class="empty"><div class="big">尚未登记资源</div><span class="muted">点击右上「+ 添加资源」登记主资源（首个资源自动设为主资源；每项资源承载独立细粒度资源清单）</span></div>`;
}
function efRenderPaths(){
  const a=_formAsset; const flat=flatResPaths(a);
  const KC=RES_KC;
  $("#efPathWrap").innerHTML=flat.length?`<table>
    <thead><tr><th>所属资源</th><th>名称</th><th>方法</th><th>规范化路径</th><th>版本</th><th>风险</th><th>负责人</th><th>生命周期</th><th style="width:160px">操作</th></tr></thead>
    <tbody>${flat.map(r=>`<tr>
      <td>${xesc(r.resName)}${r.resMain?'<span class="badge-main">主</span>':""}<div class="muted">${r.resKind}</div></td>
      <td><b>${xesc(r.name||"—")}</b></td>
      <td><span class="tag t-gray">${r.m}</span></td>
      <td class="col-num">${xesc(r.p)}</td><td>${xesc(r.v)}</td>
      <td><span class="tag ${RISK_CLS[r.risk]}">${r.risk}</span></td>
      <td>${xesc(r.owner||"—")}</td>
      <td>${lcTag(r.lc)}</td>
      <td>${r.lc==="已下线"?`<button class="btn link" onclick="reactivatePath('${r.resId}','${r.m}','${escJsAttr(r.p)}')" title="重新激活：恢复为「已激活」，该条目下线期间的访问要求原样恢复">重新激活</button>`:`<button class="btn link danger" onclick="archivePath('${r.resId}','${r.m}','${escJsAttr(r.p)}')" title="下线（可逆）：生命周期转「已下线」，该条目的访问要求按未配置处理（default deny）；承载访问要求时须先完成二次认证，重新激活后原要求恢复">下线</button>`}
      <button class="btn link" onclick="openApiEdit('${r.resId}',${JSON.stringify(r).replace(/"/g,'&quot;')})">编辑</button></td></tr>`).join("")}</tbody></table>`
    : `<div class="empty"><div class="big">尚未登记细粒度资源</div><span class="muted">通过「OpenAPI 导入」或「+ 登记细粒度资源」逐步建立清单；访问要求由策略引擎 default deny 统一裁决</span></div>`;
}
/* S4 汇总 · 后端地址预览：网页类（含桌面+Web 后端）展示资源与清单统计；其它类型展示三框组合后的地址（端口留空 → 预览即补默认） */
function efAddrKV(web){
  if(web){
    const a=_formAsset;
    return `<div class="kv"><span class="k">资源（${(a.res||[]).length} 项）</span><div>${(a.res||[]).map(r=>`${r.main?"<b>主</b> ":""}${esc(r.name)}（${esc(r.kind)}） · ${(r.nodes||[]).length} 节点（${nodeTallyText(r)}） · 清单 ${(r.paths||[]).length} 条`).join("<br>")||"—"}</div></div>
    <div class="kv"><span class="k">细粒度资源清单</span><div><b>${flatResPaths(a).length} 条</b><span class="muted" style="margin-left:6px">访问要求由策略引擎 default deny 统一裁决</span></div></div>`;
  }
  const hst=($("#eaHost2").value||"").trim(), prt=($("#eaPort2").value||"").trim(), pth=($("#eaPath2").value||"").trim(), proto=$("#eaProto2").value||"";
  const joined=hst?joinAddr(hst,prt,pth,proto):"";
  let note;
  if(joined==="!") note="端口需为 1~65535 的数字";
  else if(!joined) note=(!hst)?"主机未填写（端口可留空由系统补默认）":(portDefault(proto)?"端口留空：保存时按协议自动补全默认 "+portDefault(proto):"该协议无默认端口，需显式填写端口（1~65535）");
  else note="完整入口 "+schemeOf(proto)+"://"+joined+(prt?"（端口为显式填写）":"（端口留空已按协议补全默认）");
  return `<div class="kv"><span class="k">后端地址</span><div><span class="tag t-info">${xesc(proto)||"—"}</span><span class="kr" style="margin-left:6px">${xesc(joined&&joined!=="!"?joined:"—")}</span>
    <div class="muted" style="font-size:12.5px;margin-top:3px">${xesc(note)}</div></div></div>`;
}
function efSummary(){
  const a=_formAsset, web=efTypeWeb();
  const name=$("#eaName2").value.trim(), type=$("#eaType2").value, dept=$("#eaDept2").value.trim();
  const grp=$("#eaGrp2").value, owner=$("#eaOwner2").value.trim();
  const en=($("#eaEn2").value||"1")==="1";
  const client=$("#eaClient2").value||"";
  const errs=[];
  if(!name) errs.push("资产名称必填");
  /* ★ 2026-10-12（R53 · A1-F7）：资产名是跨模块引用键（见 A1-F4）⇒ 必须唯一 ——
     同名会使「引用资产」无法唯一定位；对照规则库 / 策略名的重名拦截。 */
  else if(ASSETS.some(x=>x.name===name && x.id!==((_formAsset||{}).id))) errs.push("资产名称「"+name+"」已被占用：资产名是多模块的引用键，须保持唯一");
  if(!dept) errs.push("所属部门必填");
  if(type==="网页应用"){
    if(!(a.res||[]).length) errs.push("尚未登记任何资源：请在第 2 步「资源与访问」添加资源（首个资源自动设为主资源）");
    else if(!(a.res||[]).some(r=>r.main)) errs.push("缺少主资源标记：请编辑首个资源");
    else {
      const mr=(a.res||[]).find(r=>r.main);
      if(!mr.nodes||!mr.nodes.length) errs.push("主资源「"+mr.name+"」未登记内部节点（后端服务地址）");
      if(!mr.ext) errs.push("主资源「"+mr.name+"」未登记外部访问地址");
    }
  } else {
    if(!($("#eaProto2").value||"")) errs.push("需选择访问协议（后端服务资源地址）");
    const hst=($("#eaHost2").value||"").trim(), prt=($("#eaPort2").value||"").trim();
    if(!hst) errs.push("需登记后端服务资源地址：主机（IP / 域名）为必填（端口可留空由系统补默认）");
    else if(prt&&(!/^\d+$/.test(prt)||+prt<1||+prt>65535)) errs.push("端口需为 1~65535 的数字；留空保存时按协议自动补全默认端口");
    else if(!prt&&!portDefault($("#eaProto2").value)) errs.push("协议「"+$("#eaProto2").value+"」无默认端口，需显式填写端口（1~65535）");
  }
  const typeDesc=type==="网页应用"
    ? "网页应用可开通无端访问；登记资源与细粒度资源清单"
    : "非网页资产按资源类型登记访问入口与打开方式：远程主机类默认经平台内嵌方式访问——终端 WebSSH / 远程桌面 WebRDP · WebVNC / 文件传输 Web-SFTP（可切换桌面客户端，同一主机上终端与文件通道须一致），数据库 / 文件服务 / 其他 TCP 经桌面客户端访问；资源类型决定细粒度资源清单承载（页面与静态资源 / API / 长连接 / 文件传输 / 管理控制台属 l7 族，支持细粒度清单；其余族仅访问入口与打开方式）";
  const rows=`<div class="kv"><span class="k">资产名称</span><div><b>${name||"—"}</b></div></div>
    <div class="kv"><span class="k">资产状态</span><div><span class="tag ${en?"t-ok":"t-gray"}">${en?"已启用":"未启用"}</span><span class="muted" style="margin-left:6px">未启用状态下不允许开通无端访问；保存后可在列表「状态」栏切换</span></div></div>
    <div class="kv"><span class="k">资产类型</span><div>${type}<span class="muted" style="margin-left:6px"> · ${typeDesc}</span></div></div>
    <div class="kv"><span class="k">安全等级</span><div><span class="${LV_CLS[efLvVal()]}">L${efLvVal()}</span><span class="muted" style="margin-left:8px">登记属性 · 驱动防护出厂默认</span></div></div>
    <div class="kv"><span class="k">所属部门 / 资产分组</span><div>${dept||"—"} / ${grp}</div></div>
    <div class="kv"><span class="k">负责人</span><div>${owner||"—"}</div></div>
    ${efAddrKV(web)}`;
  $("#efSummaryWrap").innerHTML=`<div style="display:grid; grid-template-columns:1fr 1fr; gap:0 34px">${rows}</div>
    ${errs.length?`<div class="note red" style="margin-top:12px"><b>保存前需修正：</b><br>${errs.map(e=>"· "+e).join("<br>")}</div>`
      :`<div class="note blue" style="margin-top:12px">信息完整，可保存。保存后进入资产详情，可继续维护资源与访问 / 细粒度清单 / 代理与上游。</div>`}`;
  _efErr=errs.length;
}
function efSubmit(){
  efSummary();
  if(_efErr){ toast("存在未通过项，请返回修正后再保存"); return; }
  const a=_formAsset;
  const name=$("#eaName2").value.trim(), type=$("#eaType2").value, dept=$("#eaDept2").value.trim();
  const grp=$("#eaGrp2").value, owner=$("#eaOwner2").value.trim();
  const en=($("#eaEn2").value||"1")==="1"?1:0;
  const isWebAsset=(type==="网页应用"), web=efTypeWeb();
  const clVal=$("#eaClient2").value||"";
  if(!name||!dept){toast("资产名称 / 所属部门为必填"); return;}
  if(web&&(!(a.res||[]).length||!a.res.some(r=>r.main))){toast("请先登记主资源（第 2 步「资源与访问」）"); return;}
  let addr2="";
  if(!web){
    const proto=$("#eaProto2").value||"";
    if(!proto){toast("需选择访问协议（后端服务资源地址）"); return;}
    const hst=($("#eaHost2").value||"").trim(), prt=($("#eaPort2").value||"").trim(), pth=($("#eaPath2").value||"").trim();
    addr2=joinAddr(hst,prt,pth,proto);
    if(!hst){toast("需登记后端服务资源地址：主机（IP / 域名）为必填（端口可留空自动补默认）"); return;}
    if(prt&&(!/^\d+$/.test(prt)||+prt<1||+prt>65535)){toast("端口需为 1~65535 的数字（留空保存时自动补全默认端口）"); return;}
    if(!addr2){toast("协议「"+proto+"」无默认端口，需显式填写端口（1~65535）"); return;}
  }
  if(_formMode==="edit"){
    const _oldName=a.name;   /* ★ R53（A1-F4 / E-F2）：改名级联的基准 */
    if(a.anon==="asset"&&efLvVal()!==1){toast("该资产已声明整资产匿名开放，安全等级须保持 L1；请先在「资产细粒度访问策略」关闭匿名声明再调整等级"); return;}
    a.name=name; a.dept=dept; a.grp=grp; a.owner=owner; a.lv=efLvVal(); a.en=en;
    renameAssetRefs(_oldName,name);   /* ★ R53（A1-F4 / E-F2）：资产名是跨模块引用键，改名须级联更新下游 */
    if(web){
      const mr=(a.res||[]).find(r=>r.main)||(a.res||[])[0];
      if(mr){ a.addr=(mr.nodes||[])[0]||a.addr||""; a.addrProto=mr.proto||a.addrProto; a.ext=mr.ext||a.ext||"-"; }
      syncAssetFromRes(a);
    } else {
      const proto=$("#eaProto2").value, cl=clVal||null;
      a.addr=addr2; a.addrProto=proto; a.client=cl;
      // 第 2 步快捷登记后端地址 → 同步「资源与访问」首条后端资源（详情多后端资源登记在「资源与访问」完成）
      const br=(a.res||[]).find(isBackRes);
      if(br){
        const pa=parseAddr(addr2);
        br.proto=proto; br.host=pa.host; br.port=pa.port; br.path=pa.path.replace(/^\/+/,"");   // 镜像 path 存三框输入口径（不带分隔 /），重进编辑回填与原输入一致
        br.client=(br.open==="desktop"||!TERM_WAYS[proto])?cl:null;
        if(!TERM_WAYS[proto]) br.open="desktop";
      } else if(addr2){
        const pa=parseAddr(addr2), ow=wayDefault(proto);
        (a.res=a.res||[]).push({id:resNextId(a),name:"后端服务",kind:backKindOf(type),proto:proto,host:pa.host,port:pa.port,path:pa.path.replace(/^\/+/,""),open:ow,client:(ow==="desktop")?cl:null,paths:[]});
      }
      syncAssetFromRes(a);
    }
    if(en===0&&a.open!=="未开通"){ a.open="未开通"; }   // 停用=整体下线：无端编排同步撤销（2 秒内全节点停止放行）
    assetListRender();
  } else {
    const maxA=ASSETS.reduce((m,x)=>{const n=parseInt(String(x.id).replace(/^a/,""),10); return isNaN(n)?m:Math.max(m,n);},0);
    a.id="a"+(maxA+1); a.name=name; a.type=type; a.dept=dept; a.grp=grp; a.owner=owner; a.lv=efLvVal(); a.en=en;
    a.open="未开通";
    if(web){
      const mr=(a.res||[]).find(r=>r.main)||(a.res||[])[0];
      if(mr){ a.addr=(mr.nodes||[])[0]||""; a.addrProto=mr.proto||""; a.ext=mr.ext||"-"; }
      else { a.addr=""; a.addrProto=""; a.ext="-"; }
    } else {
      const proto=$("#eaProto2").value, cl=clVal||null, pa=parseAddr(addr2), ow=wayDefault(proto);
      a.addr=addr2; a.addrProto=proto; a.client=cl;
      a.res=[{id:"r1",name:"后端服务",kind:backKindOf(type),proto:proto,host:pa.host,port:pa.port,path:pa.path.replace(/^\/+/,""),open:ow,client:cl,paths:[]}];
      a.ext="-";
    }
    ASSETS.push(a); assetListRender();
  }
  // 代理与上游（第 4 步）：保存资产级配置
  // ★ 机器身份（_inj / _injCred）不在本步收集 —— 2026-09-30 起其配置面为资产详情「身份适配」，
  //   登记向导不承载该资产键（新建资产取默认「不注入」，入详情后再配）。
  const rwEl=document.getElementById("efSwRw"), tlEl=document.getElementById("efSwTls");
  if(rwEl) a._rewrite=rwEl.checked;
  if(tlEl) a._tls=tlEl.checked;
  a._upd=nowD(); const id=a.id; _efSnap=""; _efBase=null; _formAsset=null; const doneEdit=_formMode==="edit";
  /* R19 openDetail 已写入三级面包屑（资产管理 / 资产列表 / 资产名）。此处不再回写两级——
     否则保存后明明落在资产详情，面包屑却只走到「资产列表」，与当前页面层级不符。 */
  showPage("pg-detail"); openDetail(id);
  toast(doneEdit?"资产信息已保存（变更入审计）（演示）":"资产「"+name+"」已登记（L"+a.lv+"，"+(en?"已启用":"未启用")+"），后端地址 "+a.addr+"（端口未填已按协议补全默认）（演示）");
}
/* R25 未保存确认：向导承载五步填写，静默离页会丢掉已填内容与已添加的资源 / 细粒度清单。
   与策略设计器「零改动直接返回、有改动先确认」同一口径——改动基线只取语义字段，
   渲染期写入的运行时标记不参与比对，避免误判。 */
function efSnap(){
  const v = id => { const e = document.getElementById(id); return e ? String(e.value || "") : ""; };
  const A = _formAsset || {};
  return JSON.stringify({
    n: v("eaName2"), d: v("eaDept2"), o: v("eaOwner2"), g: v("eaGrp2"), t: v("eaType2"),
    lv: v("eaLvSel"), en: v("eaEn2"), proto: v("eaProto2"), host: v("eaHost2"), port: v("eaPort2"), pth: v("eaPath2"),
    res: ((_formAsset || {}).res || []).map(r => [r.id, r.proto || "", r.host || "", r.port || "", r.path || "", (r.paths || []).length]),
    /* ★ 2026-10-12（R53 · A1-F6）：「代理与上游 / 响应地址改写」的开关与模式**直接写资产对象**
       （与详情页同体例、即时生效），但原不进快照 ⇒ 改了却判不脏，「取消」也撤不回。
       纳入快照后：取消前会先确认，取消时按基线回滚。 */
    up: [A._rewrite === true, A._tls === true, A._tlsMode || "", A._tlsCa || "", A._tlsSni || "", A._tlsWhy || "",
         A._mtls || "", A._idem401 === true, A._scRw === true,
         (A._hdrAllow || []).join("|"), (A._rwBigEx || []).join("|")]
  });
}
function efDirty(){ return !!_formAsset && _efSnap !== efSnap(); }
/* ★ R53（A1-F6）：向导内「代理与上游 / 响应地址改写」为即时生效，取消 / 跳页离开时按基线回滚。 */
const EF_UP_KEYS=["_rewrite","_tls","_tlsMode","_tlsCa","_tlsSni","_tlsWhy","_mtls","_idem401","_scRw","_hdrAllow","_rwBigEx"];
function efCaptureUpstream(a){
  const o={}; EF_UP_KEYS.forEach(function(k){ if(a&&Object.prototype.hasOwnProperty.call(a,k)) o[k]=JSON.parse(JSON.stringify(a[k])); });
  return o;
}
function efRevertUpstream(){
  if(!_efBase||!_formAsset) return;
  EF_UP_KEYS.forEach(function(k){
    if(Object.prototype.hasOwnProperty.call(_efBase,k)) _formAsset[k]=JSON.parse(JSON.stringify(_efBase[k])); else delete _formAsset[k];
  });
}
function efDiscard(){ efRevertUpstream(); _efBase=null; _formAsset=null; _formMode="register"; _efSnap=""; }
function efExit(){
  const backEdit=_formMode==="edit", id=backEdit&&_formAsset?_formAsset.id:null;
  const go=()=>{
    efDiscard();   /* ★ R53（A1-F6）：取消时回滚「即时生效」的上游配置改动 */
    if(backEdit&&id&&_formFrom==="pg-detail"){ window._detailAid=id; goPage("pg-detail",{aid:id}); }
    else { goPage("pg-list"); }
  };
  if(efDirty()){
    confirmDlg("放弃本次填写？", '<div class="note warn">未保存的内容将丢失：本次已改动的<b>上游连接配置</b>（改写 / TLS / mTLS / 幂等 / 跨域 / 请求头白名单 / 大响应体）将回滚到进入本页时的状态。</div>',
      () => { $("#dlgCfm").classList.remove("show"); go(); }, "放弃");
    return;
  }
  go();
}
function enterForm(mode,a,from){
  /* 多页化：登记 / 编辑向导已独立成页（asset-edit.html）。跨页进入时把意图写进 URL 再跳转，
     避免在本页对不存在的 #efTitle / #pg-edit 渲染。 */
  if (PG_CUR !== "pg-edit") { goPage("pg-edit", { mode: mode, aid: (mode === "edit" && a && a.id) ? a.id : "", from: from || "pg-list" }); return; }
  _formMode=mode; _formFrom=from||"pg-list";
  _formAsset=(mode==="edit")?a:{name:"",type:"网页应用",dept:"",grp:"核心业务",owner:"",addr:"",ext:"-",open:"未开通",en:1,lv:0,res:[]};
  _efBase=(mode==="edit")?efCaptureUpstream(a):null;   /* ★ R53（A1-F6）：上游配置回滚基线 */
  $("#efTitle").textContent=(mode==="edit")?"编辑资产 · "+(a&&a.name||""):"登记资产";
  $("#efModeTag").textContent=(mode==="edit")?"编辑已有资产：分步修改并保存（变更入审计）":"登记新资产：按步骤填写全部信息";
  showPage("pg-edit");
  $("#crumbs").innerHTML=`<span class="p">资产管理</span><span class="sep">/</span><span>资产列表</span><span class="sep">/</span><span>${mode==="edit"?"编辑资产":"登记资产"}</span>`;
  $$("#side .mi").forEach(m=>m.classList.toggle("on",m.dataset.pg==="pg-list"));
  efFill(); efGo(1); _efSnap=efSnap();
}
bind("#btnEfPrev", el=>el.onclick=efPrev);
bind("#btnEfNext", el=>el.onclick=efNext);
bind("#btnEfSubmit", el=>el.onclick=efSubmit);
bind("#btnEfExit", el=>el.onclick=efExit);
bind("#btnEfAddRes", el=>el.onclick=openAddRes);
bind("#btnEfAddApi", el=>el.onclick=()=>openApiEdit("",null));
bind("#btnEfOpenapi", el=>el.onclick=openApiImport);
bind("#eaType2", el=>el.addEventListener("change",efSyncType));
$$("#efSteps .step").forEach(st=>st.addEventListener("click",()=>{
  const n=+st.dataset.s;
  if(!efTypeWeb()&&(n===3||n===4)){ toast("非网页应用无「细粒度资源清单 / 代理与上游」步骤：本类资产的资源在第 2 步「资源与访问」按后端服务登记"); return; }
  efGo(n);
}));

/* ★ 2026-10-12（R53 · A1-F4 / E-F2）：资产名是跨模块引用键 —— 凭据托管三张台账的「引用资产」、
   身份侧客户端软件的「可访问资产」、出站身份适配的档位种子表（ADAPT_MODE_OF）均按**资产名**引用。
   改名 / 删除时必须级联更新，否则引用悬挂、台账行「→ 资产详情」按名查找落空。
   （根治手段「跨模块引用键统一为资产 id」见评审建议，本轮先做定点级联 + 唯一性校验。） */
function assetRefTables(){
  var out = [];
  try { if (typeof CRED_LIST !== "undefined") out.push(CRED_LIST); } catch (e) {}
  try { if (typeof MTLS_LIST !== "undefined") out.push(MTLS_LIST); } catch (e) {}
  try { if (typeof CA_LIST !== "undefined") out.push(CA_LIST); } catch (e) {}
  try { if (typeof ID !== "undefined" && ID && ID.csw) out.push(ID.csw); } catch (e) {}
  return out;
}
function renameAssetRefs(oldName, newName){
  if(!oldName || oldName === newName) return;
  assetRefTables().forEach(function(arr){ (arr||[]).forEach(function(r){
    if(r && Array.isArray(r.assets)) r.assets = r.assets.map(function(n){ return n === oldName ? newName : n; });
  }); });
  try { if (typeof ADAPT_MODE_OF !== "undefined" && Object.prototype.hasOwnProperty.call(ADAPT_MODE_OF, oldName)) { ADAPT_MODE_OF[newName] = ADAPT_MODE_OF[oldName]; delete ADAPT_MODE_OF[oldName]; } } catch (e) {}
  /* ★ 2026-10-12（R57 · 表-2）：认证侧「用户代填账号托管」AU.uc.items 以资产**名**记录
     （写入侧 `asset: av`、消费侧按 `a.name === uo.asset` 反查），而 assetRefTables() 只覆盖
     凭据 / 证书 / 信任锚三张表 ⇒ 资产改名后该引用悬空、托管项跳转失效。此处补入级联
     （AU 定义在认证段，合并后同文件可见，仍按既有 typeof 兜底写法防御）。 */
  try {
    if (typeof AU !== "undefined" && AU && AU.uc && Array.isArray(AU.uc.items)) {
      AU.uc.items.forEach(function (it) { if (it && it.asset === oldName) it.asset = newName; });
    }
  } catch (e) {}
}
function dropAssetRefs(name){
  if(!name) return;
  assetRefTables().forEach(function(arr){ (arr||[]).forEach(function(r){
    if(r && Array.isArray(r.assets)) r.assets = r.assets.filter(function(n){ return n !== name; });
  }); });
  try { if (typeof ADAPT_MODE_OF !== "undefined") delete ADAPT_MODE_OF[name]; } catch (e) {}
  /* ★ 2026-10-12（R57 · 表-2）：与 renameAssetRefs 同一处引用缺口 —— 资产被删时托管项也不得
     留悬空引用（与凭据 / 证书 / 信任锚的 dropAssetRefs 同口径）。 */
  try {
    if (typeof AU !== "undefined" && AU && AU.uc && Array.isArray(AU.uc.items)) {
      AU.uc.items = AU.uc.items.filter(function (it) { return !it || it.asset !== name; });
    }
  } catch (e) {}
}

/* ===== 资产新增 / 删除 / 编辑 ===== */
bind("#btnNewAsset", el=>el.onclick=()=>enterForm("register"));
function delAsset(id){
  const a=byId(id); if(!a) return;
  if(a.open==="开通中"||a.open==="撤销中"){toast("当前状态为「"+a.open+"」，编排互斥：待流程完成后重试"); return;}
  const openNote=a.open==="已开通"?"该资产无端访问<b>已开通</b>：确认删除将同步撤销开通（先发高优安全关闭 → 停止签发授权码 → 清理资产访问状态 → 断开长连接 → 软删除）后再删除资产。":(a.open==="异常"?"该资产无端访问<b>编排未完成（异常）</b>：确认删除将<b>一并清理残留编排对象</b>后再删除登记。":"无端访问未开通，直接删除登记。");
  /* ★ 2026-10-12（R53 · A1-F3）：原实现自画密码框却从不读取其值 —— 空口令即删，toast 却称
     「追加认证通过」，属安全语义欺骗。删除改变生效面 ⇒ 与全站同档，统一走二次认证入口。 */
  const _polGrp = POLICIES[id] || {};
  const polN = ((_polGrp.agentless||[]).length + (_polGrp.agent||[]).length);
  const polNote = polN ? `<div class="note warn" style="margin-top:8px">该资产名下另有 <b>${polN}</b> 条准入策略：将随资产<b>一并删除</b>（不保留不可见的孤儿策略）。</div>` : "";
  /* ★ 2026-10-12（R57 · 交-1）：前置校验必须在**二次认证之前**。
     原实现把「无已激活路径承载访问要求」的判定放在 ask2FA 回调之内 ⇒ 用户先做完二次认证、
     再被告知「删除被拒」，等于白认证一次；同文件凭据删除（credDel）是把前置挡在 2FA 之前，
     两处口径相反。判据：**能不能做先判，要不要认证后判** —— 不可行的动作不该进认证流程。 */
  /* 只计「已激活」路径的访问要求（已下线为暂停态，不阻塞删除） */
  const _refs=flatResPaths(a).filter(q=>q.req&&q.lc!=="已下线").length;
  if(_refs){toast("资产 "+a.name+" 有 "+_refs+" 条已激活路径承载访问要求，删除被拒：请先把这些路径下线（下线可逆，随时可重新激活）后再删除（演示）"); return;}
  ask2FA(`删除资产「${a.name}」`,
    ()=>{
      const i=ASSETS.findIndex(x=>x.id===id); if(i<0) return;
      dropAssetRefs(a.name);                       /* ★ R53（A1-F4 / E-F2）：级联清理按资产名的跨模块引用 */
      try { if (typeof dpDropObj === "function") dpDropObj(id); } catch (e) {}   /* ★ R61·轮16：随资产一并移出动态防护登记（原残留 DP.objs 悬空 id ⇒ 冷启动卡「客体 N」虚高） */
      ASSETS.splice(i,1);
      if(POLICIES[id]) delete POLICIES[id];        /* ★ R53（A2-F8）：随资产一并删除其准入策略，不留孤儿 */
      toast("已删除资产「"+a.name+"」（二次认证通过，操作入审计）（演示）");
      if((window._detailAid||CUR)===id){ window._detailAid=""; showPage("pg-list"); crumb("资产管理","资产列表"); }
      assetListRender();
    }, null,
    `删除为高危操作：删除前校验「无已激活路径承载访问要求」；无端访问将同步撤销；删除不可逆，变更写入审计。
     <div class="note red" style="margin-top:8px">删除对象：<b>${esc(a.name)}</b>（${esc(a.type)} · L${a.lv}）—— ${openNote}</div>${polNote}`);
}
function editForm(id){
  const a=byId(id); if(!a) return;
  enterForm("edit",a,"pg-list");
}
/* t1 基础信息卡头「编辑」与详情头部「编辑」同源：进入五步编辑向导（资源地址 / 细粒度清单 / 代理与上游均在其中维护） */
function editMeta(){ const a=byId(window._detailAid||CUR); if(a) enterForm("edit",a,"pg-detail"); }
bind("#btnEditMeta", el=>el.onclick=editMeta);


function xesc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

/* ★ 2026-10-12（R58 · 交-1）：属性内嵌 JS 字符串的**双层转义**。
   路径 / 名称等可编辑值注入 `onclick="…"` 时，此前只做 JS 单引号逃生、未防 HTML 属性引号 ⇒
   值含双引号即从属性逃逸（同轮 `<td>` 文本侧已补 `xesc`）。本函数先做 JS 逃生（反斜杠与单引号），
   再做 HTML 属性转义；两层顺序不可颠倒（先 HTML 后 JS 会把已转义的实体再破开）。 */
function escJsAttr(s){return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function fmtSize(n){ return n>=1024 ? (n/1024).toFixed(1)+" KB" : n+" B"; }

/* ===== 初始化 ===== */
/* 资产列表初始化已移至文件末尾 bootstrap：先恢复 localStorage 中的演示数据，再渲染 */
/* API 资产已并入细粒度资源清单（API 为资源类型） */
/* 顶栏「退出登录」：每页都在，用 bind 兜底后接到门禁出口 doLogout */
bind("#btnLogout", el=>el.onclick=doLogout);
/* 无障碍：.fld 标签无 for/id 关联，用事件委派补「点标签 → 聚焦控件」 */
document.addEventListener("click", function(e){
  var l = (e.target && e.target.closest) ? e.target.closest(".fld > label") : null;
  if (!l) return;
  if (l.querySelector("input,select,textarea,button")) return;   /* 包含式标签：交回原生 */
  var ctl = l.parentElement.querySelector("input,select,textarea");
  if (ctl && !ctl.disabled) ctl.focus();
}, false);
