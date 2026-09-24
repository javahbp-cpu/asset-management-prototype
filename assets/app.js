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
  "pg-login": "login.html"
};
const DEMO_KEY = "baize.assetmgmt.demo.v1";

/* 跨页跳转的唯一出口：先落盘演示数据，再改地址栏。
   —— 「资产列表 / 详情 / 向导 / 凭据托管 / 策略族（含 Web 安全防护策略的三子页）/ 规则库」之间的一切切换都经过这里。 */
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
  if (on) {
    e.addEventListener("input", () => e.classList.remove("bad"), { once: true });
    if (e.focus) { try { e.focus(); } catch (_e) { /* 元素不可聚焦：忽略 */ } }
  }
}
window.markBad = markBad;

/* ---- 控制面登录态（入口门禁） ------------------------------------------------
   · 登录页是唯一入口：未登录访问任一业务页 → 跳 login.html?back=<原页>，登录后回跳原页。
   · 登录态与演示数据用两个 key，语义互不相干：「重置演示数据」不清登录态，
     「退出登录」也不清演示数据（换人评审时两种诉求不同）。
   · 凭据口径：账号 + 密码，提交前按平台既有口径以 SM2 加密（与原型内「删除资产」等
     二次认证弹窗同一说法）。本原型不实现真实加密与校验，演示账号见登录页提示。 */
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
      schema: 1,
      ASSETS, POLICIES, CRED_LIST, CA_LIST, MTLS_LIST,
      detailAid: window._detailAid || "",
      curAcl: CUR_ACL,
      S: { view: S.view, cur: S.cur, mode: S.mode, designer: S.designer, filter: S.filter, selRows: Array.from(S.selRows || []) },
      FG: { view: FG.view, cur: FG.cur, filter: FG.filter, rq: FG.rq },
      credTab: window._credTab || "c1",
      pgc: { PAsset: window.PAsset, PAsp: window.PAsp, PFg: window.PFg, PFgMx: window.PFgMx, PFgSub: window.PFgSub, PFgFam: window.PFgFam }
    }));
  } catch (e) { /* 隐私模式 / 配额不足：仅本次会话内有效 */ }
}
function loadDemoState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(DEMO_KEY) || "null"); } catch (e) { s = null; }
  if (!s) return;
  try {
    if (Array.isArray(s.ASSETS)) ASSETS.splice(0, ASSETS.length, ...s.ASSETS);
    if (s.POLICIES && typeof s.POLICIES === "object") { Object.keys(POLICIES).forEach(k => delete POLICIES[k]); Object.assign(POLICIES, s.POLICIES); }
    [[CRED_LIST, s.CRED_LIST], [CA_LIST, s.CA_LIST], [MTLS_LIST, s.MTLS_LIST]]
      .forEach(([arr, v]) => { if (Array.isArray(v)) arr.splice(0, arr.length, ...v); });
    /* 【第二十轮】旧存档逐字段补齐：此前整段 splice ⇒ 缺 assets / st 的旧条目直接进内存，
       渲染 / 引用 / 删除保护会读到 undefined（同一 store 的 WS / RL 早已逐键补齐，此处对齐）。
       schema 由 saveDemoState 写入，供将来迁移分叉；旧档（无 schema）与 schema=1 走同一补齐路径。 */
    [].concat(CRED_LIST, CA_LIST, MTLS_LIST).forEach(function(c){
      if (!c || typeof c !== "object") return;
      if (!Array.isArray(c.assets)) c.assets = [];
      if (typeof c.st !== "string" || !c.st) c.st = c.exp ? "有效" : "启用";
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
  } catch (e) { /* 快照结构不匹配：按种子数据继续 */ }
}
/* 重置演示数据（页脚提供入口）：清快照并回资产列表。
   2026-09-21：新增页（Web 安全防护策略族三子页共用一个 key / 规则库管理一个 key）的演示改动
   各自落独立 key，一并清除，避免「重置」后新页仍留改动。 */
function resetDemo() { try { localStorage.removeItem(DEMO_KEY); localStorage.removeItem("baize.assetmgmt.websec.v1"); localStorage.removeItem("baize.assetmgmt.rulelib.v1"); } catch (e) {} location.href = "index.html"; }
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
  if (PG_FILE[id] && id !== PG_CUR) { goPage(id); return; }
  $$(".pg").forEach(p=>p.classList.remove("on"));
  const tgt=document.getElementById(id);
  if(!tgt) return;
  tgt.classList.add("on");
  /* R18 导航上下文高亮：详情与编辑向导同属「资产管理」上下文，侧栏「资产列表」应保持高亮。
     此前按页面 id 精确匹配，一进详情两项全灭，而编辑向导里却保留——同一上下文两种表现。 */
  $$("#side .mi").forEach(m=>m.classList.toggle("on", m.dataset.pg===id || ((id==="pg-detail"||id==="pg-edit") && m.dataset.pg==="pg-list")));
  _cur=id;
  window.scrollTo(0,0);
}
$$("#side .mi").forEach(m=>m.addEventListener("click",()=>{
  const id=m.dataset.pg;
  /* 一级面包屑取该菜单项所属分组（.g），不再写死「资产管理」——
     2026-09-20 凭据托管移入「安全设置」组后，写死会让面包屑与侧栏不一致。 */
  let gEl=m.previousElementSibling; while(gEl&&!gEl.classList.contains("g")) gEl=gEl.previousElementSibling;
  document.getElementById("crumbs").innerHTML=`<span class="p">${gEl?gEl.textContent.trim():""}</span><span class="sep">/</span><span>${m.textContent.replace(m.querySelector(".ic").textContent,"").trim()}</span>`;
  showPage(id);
}));
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
      if(!lb||!ct||lb.contains(ct)||lb.htmlFor) return;
      if(!ct.id) ct.id="dlgfld-"+Math.random().toString(36).slice(2,8);
      lb.htmlFor=ct.id;
    });
  } catch(_e) {}
  $("#dlg1").classList.add("show");
  /* 无障碍（第十九轮）：打开弹窗即把焦点移入首个可编辑控件（此前需手动 Tab 进来）。 */
  try { var _f0=$("#dlg1Body").querySelector("input:not([readonly]),select,textarea"); if(_f0&&_f0.focus) _f0.focus(); } catch(_e) {}
}
function closeDlg(){$("#dlg1").classList.remove("show"); window._nbOps=0; window._nbRes=null;}
$("#dlg1No").onclick=closeDlg;
$("#dlg1").addEventListener("click",e=>{if(e.target.id==="dlg1") closeDlg();});
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
  if ($("#dlg1").classList.contains("show")) closeDlg();
}
$("#dlgCfm").addEventListener("click", e => { if (e.target.id === "dlgCfm") closeTopDialog(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeTopDialog(); });
/* 环境标识 */
const ENV="生产";

/* ===== 演示数据 ===== */
const TYPES=["网页应用","远程主机","文件服务","数据库","其他 TCP"];
const RISK_CLS={低:"t-ok",中:"t-warn",高:"t-err"};
const LV_CLS={1:"lv l1",2:"lv l2",3:"lv l3",4:"lv l4",5:"lv l5"};

const ASSETS=[
 {id:"a1",name:"核心网银门户",type:"网页应用",dept:"电子银行部",lv:4,grp:"核心业务",owner:"李工",open:"已开通",
  res:[
   {id:"r1",name:"网银门户主站",kind:"页面与静态资源",main:1,nodes:["10.20.1.11:8443","10.20.1.12:8443"],lb:"加权随机",lbWeights:[3,1],nodeSt:{"10.20.1.11:8443":{s:"on",f:2},"10.20.1.12:8443":{s:"fail",t:"09-13 15:12",f:3}},hcFail:3,ext:"ebank-portal.baize.example.com",paths:[
     {name:"门户首页",m:"GET",mt:"精确",p:"/",v:"v1",risk:"中",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥经理"},
     {name:"登录页",m:"GET",mt:"精确",p:"/login",v:"v1",risk:"低",owner:"李工",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"退出登录",m:"GET",mt:"精确",p:"/logout",v:"v1",risk:"低",owner:"李工",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"帮助中心",m:"GET",mt:"前缀",p:"/help/*",v:"v1",risk:"低",owner:"李工",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"爬虫协议文件",m:"GET",mt:"精确",p:"/robots.txt",v:"v1",risk:"低",owner:"李工",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"开放公告内容",m:"GET",mt:"前缀",p:"/open/*",v:"v1",risk:"中",owner:"李工",lc:"已激活"},
     {name:"站点地图",m:"GET",mt:"精确",p:"/sitemap.xml",v:"v1",risk:"低",owner:"李工",lc:"已下线"}]},
   {id:"r2",name:"账户与转账 API",kind:"API",nodes:["10.20.2.21:8080","10.20.2.22:8080"],nodeSt:{"10.20.2.21:8080":{s:"drain",t:"09-13 16:20"}},ext:"ebank-api.baize.example.com",paths:[
     {name:"账户体系接口前缀",m:"GET",mt:"前缀",p:"/api/accounts/*",v:"v1",risk:"高",owner:"李工",lc:"已激活",req:"用户标签=对公客户经理"},
     {name:"单笔转账",m:"POST",mt:"精确",p:"/api/transfer",v:"v2",risk:"高",owner:"李工",lc:"已激活",
      req:"用户所属组织机构 属于 电子银行部 且 用户职级 ≥ 经理 且 认证安全级别 ≥ 3 级",
      _rq:{kind:"attr",by:"张伟",at:"2026-09-05 10:00",cond:{t:"g",op:"and",ch:[
        {t:"c",attr:"user.org",op:"in",v:["org_ebank"],mode:"const"},
        {t:"c",attr:"user.rank",op:"gte",v:"经理",mode:"const"},
        {t:"c",attr:"auth.level",op:"gte",v:"3 级",mode:"const"}]}}},
     {name:"查询客户资料",m:"GET",mt:"参数化",p:"/api/accounts/{id}/profile",v:"v1",risk:"高",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部"},
     {name:"账户流水查询",m:"GET",mt:"参数化 · 前缀",p:"/api/accounts/{id}/txns/*",v:"v1",risk:"高",owner:"李工",lc:"已激活",
      req:"用户所属组织机构 属于 电子银行部（含子组织） 且 用户职级 ≥ 经理 且 环境网络区域 属于 办公网 且 认证安全级别 ≥ 4 级 且 认证方式 ∈ 指纹识别、USB Key 硬件令牌 且 认证复合方式数 ≥ 2 种方式叠加",
      _rq:{kind:"attr",by:"张伟",at:"2026-09-08 09:40",cond:{t:"g",op:"and",ch:[
        {t:"c",attr:"user.org",op:"in",v:["org_ebank"],inc:true,mode:"const"},
        {t:"c",attr:"user.rank",op:"gte",v:"经理",mode:"const"},
        {t:"c",attr:"env.zone",op:"in",v:["办公网"],mode:"const"},
        {t:"c",attr:"auth.level",op:"gte",v:"4 级",mode:"const"},
        {t:"c",attr:"auth.method",op:"in",v:["指纹识别","USB Key 硬件令牌"],q:"any",mode:"const"},
        {t:"c",attr:"auth.composite",op:"gte",v:"2",mode:"const"}]}}},
     {name:"调整账户限额",m:"PUT",mt:"参数化",p:"/api/accounts/{id}/limit",v:"v1",risk:"高",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥总监"},
     {name:"批量转账",m:"POST",mt:"精确",p:"/api/transfer/batch",v:"v2",risk:"高",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥总监 且 用户标签=审批人"}]},
   {id:"r3",name:"门户静态资源",kind:"页面与静态资源",nodes:["10.20.3.31:80"],ext:"ebank-assets.baize.example.com",paths:[
     {name:"门户静态资源目录",m:"GET",mt:"前缀",p:"/assets/*",v:"-",risk:"低",owner:"李工",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"前端资源清单",m:"GET",mt:"精确",p:"/assets/manifest.json",v:"-",risk:"低",owner:"李工",lc:"已激活",req:"登录即可（经鉴权会话）"}]},
   {id:"r4",name:"对账查询 API",kind:"API",nodes:["10.20.2.41:8080"],nodeSt:{"10.20.2.41:8080":{s:"probe"}},ext:"ebank-recon.baize.example.com",paths:[
     {name:"对账查询接口前缀",m:"GET",mt:"前缀",p:"/api/recon/*",v:"v1",risk:"中",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥专员"},
     {name:"按日对账单下载",m:"GET",mt:"参数化",p:"/api/recon/statement/{date}",v:"v1",risk:"高",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥经理"}]},
   {id:"r5",name:"客户通知服务",kind:"API",nodes:["10.20.2.42:8080","10.20.2.43:8080"],ext:"ebank-notify.baize.example.com",paths:[
     {name:"发送客户通知",m:"POST",mt:"精确",p:"/api/notify/send",v:"v1",risk:"中",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥经理"},
     {name:"通知模板列表",m:"GET",mt:"精确",p:"/api/notify/templates",v:"v1",risk:"低",owner:"李工",lc:"已激活",req:"登录即可（经鉴权会话）"}]},
   {id:"r6",name:"安全令牌服务",kind:"API",nodes:["10.20.2.44:8080"],ext:"ebank-token.baize.example.com",paths:[
     {name:"签发安全令牌",m:"POST",mt:"精确",p:"/api/token/issue",v:"v1",risk:"高",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥经理"},
     {name:"吊销安全令牌",m:"POST",mt:"精确",p:"/api/token/revoke",v:"v1",risk:"高",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥总监"}]},
   {id:"r7",name:"门户图像 CDN",kind:"页面与静态资源",nodes:["10.20.3.32:80","10.20.3.33:80"],nodeSt:{"10.20.3.32:80":{s:"off",t:"09-13 09:40",f:0}},ext:"ebank-img.baize.example.com",paths:[
     {name:"门户图像目录",m:"GET",mt:"前缀",p:"/img/*",v:"-",risk:"低",owner:"李工",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"主题图标库（多级目录通配）",m:"GET",mt:"** 多段通配 · * 通配",p:"/img/theme/**/icons/*.svg",v:"-",risk:"低",owner:"李工",lc:"已激活",req:"登录即可（经鉴权会话）"}]},
   {id:"r8",name:"字体与图标",kind:"页面与静态资源",nodes:["10.20.3.34:80"],ext:"ebank-fonts.baize.example.com",paths:[
     {name:"字体资源目录",m:"GET",mt:"前缀",p:"/fonts/*",v:"-",risk:"低",owner:"李工",lc:"已激活",req:"登录即可（经鉴权会话）"}]},
   {id:"r9",name:"对账单下载",kind:"文件传输",nodes:["10.20.3.42:80"],ext:"ebank-statdl.baize.example.com",paths:[
     {name:"下载对账单文件",m:"GET",mt:"参数化",p:"/stat/{fileId}",v:"v1",risk:"中",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥经理"},
     {name:"下载历史归档对账单",m:"GET",mt:"参数化",p:"/stat/archive/{fileId}",v:"v1",risk:"中",owner:"李工",lc:"已下线"}]},
   {id:"r10",name:"凭证归档下载",kind:"文件传输",nodes:["10.20.3.43:80","10.20.3.44:80"],ext:"ebank-archdl.baize.example.com",paths:[
     {name:"下载凭证文件",m:"GET",mt:"参数化",p:"/vouch/{fileId}",v:"v1",risk:"高",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户标签=审批人"}]},
   {id:"r11",name:"外部报表导出",kind:"文件传输",nodes:["10.20.3.45:80"],ext:"ebank-extdl.baize.example.com",paths:[
     {name:"外部报表导出",m:"POST",mt:"精确",p:"/ext/export",v:"v1",risk:"高",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部 且 用户职级≥经理 且 用户标签=常态化出差"}]}]},
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
 {id:"a3",en:0,name:"客户数据仓库",type:"数据库",dept:"数据管理部",lv:5,grp:"数据平台",owner:"赵磊",open:"未开通",addr:"10.20.5.8:5432",addrProto:"PostgreSQL",client:"DBeaver",ext:"-",res:[
   {id:"r1",name:"客户数据仓库实例",kind:"数据库实例",proto:"PostgreSQL",host:"10.20.5.8",port:"5432",path:"",open:"desktop",client:"DBeaver",paths:[]},
   {id:"r2",name:"客户画像检索",kind:"NoSQL 实例",proto:"Elasticsearch",host:"10.20.5.9",port:"9200",path:"",open:"desktop",client:"elasticsearch-head",paths:[]},
   {id:"r3",name:"Kibana 控制台",kind:"管理控制台",main:0,nodes:["10.20.5.9:5601"],ext:"kibana.baize.example.com",paths:[
     {name:"检索控制台首页",m:"GET",mt:"精确",p:"/",v:"v1",risk:"高",owner:"赵磊",lc:"已激活",req:"用户所属组织机构=数据管理部 且 用户职级≥经理"},
     {name:"Dev Tools 查询入口",m:"POST",mt:"前缀",p:"/api/console/*",v:"v1",risk:"高",owner:"赵磊",lc:"已激活",req:"用户所属组织机构=数据管理部 且 用户标签=数据开发"},
     {name:"控制台静态资源",m:"GET",mt:"前缀",p:"/static/*",v:"-",risk:"低",owner:"赵磊",lc:"已激活",req:"登录即可（经鉴权会话）"}]}]},
 {id:"a4",name:"报表中心",type:"网页应用",dept:"综合管理部",lv:3,grp:"办公协同",owner:"孙悦",open:"已开通",
  res:[
   {id:"r1",name:"报表门户",kind:"页面与静态资源",main:1,nodes:["10.20.1.41:8443"],ext:"report.baize.example.com",paths:[
     {name:"报表页面目录",m:"GET",mt:"前缀",p:"/reports/*",v:"v1",risk:"中",owner:"孙悦",lc:"已激活",req:"登录即可（经鉴权会话）"}]},
   {id:"r2",name:"报表下载服务",kind:"文件传输",nodes:["10.20.3.51:80"],ext:"report-dl.baize.example.com",paths:[
     {name:"下载报表文件",m:"GET",mt:"参数化",p:"/dl/{fileId}",v:"v1",risk:"低",owner:"孙悦",lc:"已激活",req:"登录即可（经鉴权会话）"}]}]},
 {id:"a5",name:"统一身份门户",type:"网页应用",dept:"科技管理部",lv:3,grp:"办公协同",owner:"周宁",open:"开通中",
  res:[{id:"r1",name:"SSO 认证页",kind:"页面与静态资源",main:1,nodes:["10.20.1.51:8443"],ext:"idp.baize.example.com",paths:[
     {name:"单点登录页面目录",m:"GET",mt:"前缀",p:"/sso/*",v:"v1",risk:"中",owner:"周宁",lc:"已激活",req:"登录即可（经鉴权会话）"}]}]},
 {id:"a6",name:"监管报送接口",type:"网页应用",dept:"合规部",lv:4,grp:"数据平台",owner:"吴敏",open:"已开通",
  res:[{id:"r1",name:"报送 API",kind:"API",main:1,nodes:["10.20.4.61:8080","10.20.4.62:8080"],ext:"regreport.baize.example.com",paths:[
     {name:"监管数据报送",m:"POST",mt:"精确",p:"/api/submit",v:"v1",risk:"高",owner:"吴敏",lc:"已激活",req:"用户所属组织机构=合规部"},
     {name:"报送状态查询",m:"GET",mt:"精确",p:"/api/status",v:"v1",risk:"低",owner:"吴敏",lc:"已激活",req:"登录即可（经鉴权会话）"}]}]},
 {id:"a7",name:"运维审计堡垒机",type:"远程主机",dept:"科技管理部",lv:5,grp:"核心业务",owner:"郑浩",open:"未开通",addr:"10.10.1.20:22",addrProto:"SSH",client:"SecureCRT",ext:"-",res:[
   {id:"r1",name:"堡垒机运维会话",kind:"终端会话",proto:"SSH",host:"10.10.1.20",port:"22",path:"",open:"web",client:null,paths:[]},
   {id:"r2",name:"堡垒机文件传输",kind:"文件传输会话",proto:"SFTP",host:"10.10.1.20",port:"22",path:"",open:"web",client:null,relay:{scan:1,type:1,dlp:1,zip:1,maxMB:200,toSec:30},paths:[]}]},
 {id:"a8",name:"对公客户影像库",type:"文件服务",dept:"电子银行部",lv:4,grp:"数据平台",owner:"冯军",open:"未开通",en:0,addr:"10.20.3.11",addrProto:"FTP",ext:"-",res:[
   {id:"r1",name:"影像共享目录",kind:"文件共享",proto:"FTP",host:"10.20.3.11",port:"",path:"/image/corp",open:"desktop",client:"资源管理器",paths:[]},
   {id:"r2",name:"影像共享（FTPS 挂载）",kind:"文件共享",proto:"FTPS",host:"10.20.3.11",port:"990",path:"/image/corp",open:"desktop",client:"资源管理器",paths:[]}]},
 {id:"a9",name:"手机银行后台",type:"网页应用",dept:"电子银行部",lv:4,grp:"核心业务",owner:"陈静",open:"异常",
  res:[{id:"r1",name:"手机银行 API",kind:"API",main:1,nodes:["10.20.4.71:8080"],ext:"mb-backend.baize.example.com",paths:[
     {name:"手机银行接口前缀",m:"GET",mt:"前缀",p:"/api/mb/*",v:"v2",risk:"高",owner:"陈静",lc:"已激活",req:"登录即可（经鉴权会话）"}]}]},
 {id:"a10",name:"报表导出网关",type:"网页应用",dept:"综合管理部",lv:2,grp:"办公协同",owner:"孙悦",open:"已开通",
  res:[{id:"r1",name:"导出网关页面",kind:"页面与静态资源",main:1,nodes:["10.20.1.61:8443"],ext:"export.baize.example.com",paths:[
     {name:"报表文件下载目录",m:"GET",mt:"前缀",p:"/xls/*",v:"v1",risk:"低",owner:"孙悦",lc:"已激活",req:"登录即可（经鉴权会话）"}]}]},
 {id:"a11",name:"生产区运维桌面",type:"远程主机",dept:"科技管理部",lv:4,grp:"核心业务",owner:"郑浩",open:"未开通",addr:"10.10.3.5:3389",addrProto:"RDP",ext:"-",res:[
   {id:"r1",name:"生产区运维桌面会话",kind:"远程桌面会话",proto:"RDP",host:"10.10.3.5",port:"3389",path:"",open:"web",client:null,paths:[]},
   {id:"r2",name:"桌面虚拟通道",kind:"虚拟通道",proto:"RDP",host:"10.10.3.5",port:"3389",path:"",open:"web",client:null,paths:[]}]},
 {id:"a12",name:"行情推送 TCP 通道",type:"其他 TCP",dept:"金融市场部",lv:3,grp:"核心业务",owner:"许静",open:"未开通",addr:"10.20.8.9:9000",addrProto:"自定义 TCP",ext:"-",res:[
   {id:"r1",name:"行情推送通道",kind:"客户端通道",proto:"自定义 TCP",host:"10.20.8.9",port:"9000",path:"",open:"desktop",client:"自研行情客户端",paths:[]},
   {id:"r2",name:"行情消息队列",kind:"消息与队列",proto:"Kafka",host:"10.20.8.10",port:"9092",path:"",open:"desktop",client:"自研行情客户端",paths:[]}]},
 {id:"a13",en:0,name:"反洗钱报送门户",type:"网页应用",dept:"合规部",lv:4,grp:"数据平台",owner:"吴敏",open:"未开通",
  res:[{id:"r1",name:"报送门户页面",kind:"页面与静态资源",main:1,nodes:["10.20.4.81:8443"],ext:"aml-report.baize.example.com",paths:[
     {name:"门户页面资源目录",m:"GET",mt:"前缀",p:"/portal/*",v:"v1",risk:"中",owner:"吴敏",lc:"已激活",req:"登录即可（经鉴权会话）"},
     {name:"反洗钱数据报送",m:"POST",mt:"精确",p:"/api/aml/submit",v:"v1",risk:"高",owner:"吴敏",lc:"已激活",req:"用户所属组织机构=合规部"}]}]},
 {id:"a15",name:"对公网银体验门户",type:"网页应用",dept:"电子银行部",lv:1,grp:"开发测试",owner:"李工",open:"未开通",en:0,res:[
  {id:"r1",name:"体验门户主站",kind:"页面与静态资源",main:1,nodes:["10.20.7.11:8443"],ext:"ebank-ux.baize.example.com",paths:[
     {name:"体验门户首页",m:"GET",mt:"精确",p:"/",v:"v1",risk:"低",owner:"李工",lc:"已激活",req:"显式公开（public）"},
     {name:"体验数据下载",m:"GET",mt:"参数化",p:"/demo/{pack}",v:"v1",risk:"中",owner:"李工",lc:"已激活",req:"用户所属组织机构=电子银行部"}]}]},
 {id:"a19",name:"对外行情资讯门户",type:"网页应用",dept:"金融市场部",lv:1,grp:"对外服务",owner:"许静",open:"已开通",res:[
  {id:"r1",name:"行情资讯主站",kind:"页面与静态资源",main:1,nodes:["10.30.1.11:443"],ext:"market-news.baize.example.com",paths:[
     {name:"资讯首页",m:"GET",mt:"精确",p:"/",v:"v1",risk:"低",owner:"许静",lc:"已激活",req:"显式公开（public）"},
     {name:"行情数据接口",m:"GET",mt:"前缀",p:"/api/quotes/*",v:"v1",risk:"低",owner:"许静",lc:"已激活",req:"显式公开（public）"},
     {name:"资讯详情页",m:"GET",mt:"参数化",p:"/news/{id}",v:"v1",risk:"低",owner:"许静",lc:"已激活",req:"显式公开（public）"}]},
  {id:"r2",name:"静态资源站",kind:"页面与静态资源",nodes:["10.30.1.12:443"],ext:"market-cdn.baize.example.com",paths:[
     {name:"静态资源目录",m:"GET",mt:"前缀",p:"/static/*",v:"-",risk:"低",owner:"许静",lc:"已激活",req:"显式公开（public）"}]}]},
 {id:"a20",name:"运维堡垒机 Web 控制台",type:"网页应用",dept:"科技管理部",lv:5,grp:"核心业务",owner:"郑浩",open:"已开通",res:[
  {id:"r1",name:"控制台 Web 服务",kind:"管理控制台",main:1,nodes:["10.10.2.21:8443"],ext:"bastion-web.baize.example.com",paths:[
     {name:"控制台首页",m:"GET",mt:"精确",p:"/",v:"v1",risk:"高",owner:"郑浩",lc:"已激活",req:"用户所属组织机构=科技管理部 且 用户职级≥经理"},
     {name:"会话录制回放",m:"GET",mt:"前缀",p:"/sessions/playback/*",v:"v1",risk:"高",owner:"郑浩",lc:"已激活",req:"用户角色包含 审计员"},
     {name:"运维指令下发",m:"POST",mt:"精确",p:"/api/cmd/exec",v:"v1",risk:"高",owner:"郑浩",lc:"已激活",req:"用户所属组织机构=科技管理部 且 用户标签=运维岗"},
     {name:"控制台静态资源",m:"GET",mt:"前缀",p:"/static/*",v:"-",risk:"低",owner:"郑浩",lc:"已激活",req:"登录即可（经鉴权会话）"}]}]},
];
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
    toast(on?"资产已启用：恢复在网可访问（演示）":"资产已停用：整体下线，无端访问已同步撤销、2 秒内全节点停止放行（演示）");
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
    return '<span class="tag t-gray" title="无端访问仅网页应用 / 远程主机（SSH · RDP）支持；本类资产访问入口在详情「资源与访问」资源行（经桌面客户端 / 平台会话）">不适用</span>';
  }
  // 远程主机：支持无端访问，形态=平台内嵌会话（WebSSH / WebRDP / WebVNC / Web-SFTP）
  if(a.type!=="网页应用"){
    return '<span class="tag t-gray" title="支持无端访问：会话在详情「资源与访问」资源行经平台内嵌方式发起——终端 WebSSH、远程桌面 WebRDP / WebVNC、文件传输 Web-SFTP（指令 / 文件动作 / 画面流录制）">平台会话</span>';
  }
  // 网页应用：无端访问开关
  const st=a.open;
  const on=st==="已开通";
  const lock=st==="开通中"||st==="撤销中"||st==="异常"||!EN_ON(a);
  const tip=!EN_ON(a)?"资产已停用：请先启用资产（状态栏上行开关）后再开通无端访问":(st==="异常"?"无端访问编排未完成：点「重试」幂等续跑":(st==="开通中"||st==="撤销中"?"编排进行中，操作互斥":"开启=开通无端访问（default deny 兜底）；关闭=撤销并清理编排对象"));
  const sw=`<span class="switch" title="${tip}"><input type="checkbox" class="sw-open" ${on?"checked":""} ${lock?"disabled":""} onchange="openSwitch('${a.id}',this.checked)"><span class="sl"></span></span>`;
  const act=st==="异常"?`<button class="btn link" onclick="openRetry('${a.id}')">重试</button>`:"";
  return `<span style="display:inline-flex; align-items:center; gap:8px; white-space:nowrap">${sw}${openTagHtml(st)}${act}</span>`;
}
/* 状态栏两行：行1=无端访问开通（网页应用）；行2=资产启用（全类型），停用时无端开关禁用 */
function stateCellHtml(a){
  const openRow=`<span style="display:inline-flex; align-items:center; gap:6px; white-space:nowrap"><span class="muted" style="font-size:12px">无端</span>${openCellHtml(a)}</span>`;
  const enRow=`<span style="display:inline-flex; align-items:center; gap:6px; white-space:nowrap"><span class="muted" style="font-size:12px">资产</span>
    <span class="switch" title="${EN_ON(a)?"启用中：点击停用将整体下线并撤销无端访问编排（2 秒内全节点停止放行）":"已停用：点击启用恢复在网可访问"}"><input type="checkbox" class="sw-en" ${EN_ON(a)?"checked":""} onchange="enSwitch('${a.id}',this.checked)"><span class="sl"></span></span>
    ${enTagHtml(a)}</span>`;
  return `<span style="display:inline-flex; flex-direction:column; gap:5px; align-items:flex-start">${openRow}${enRow}</span>`;
}
function assetListRender(){
  const k=($("#fK").value||"").trim().toLowerCase(), ty=$("#fType").value, lv=$("#fLv").value, st=$("#fSt").value, en=$("#fEn").value;
  const hitText=a=>[a.name,a.addr,a.ext].concat((a.res||[]).map(r=>[r.ext].concat(r.nodes||[]).join(" "))).join(" ").toLowerCase();
  const rows=ASSETS.filter(a=>(!k||hitText(a).includes(k))&&(!ty||a.type===ty)&&(!lv||("L"+a.lv)===lv)&&(!st||(a.type==="网页应用"&&a.open===st))&&(en===""||(en==="1"?EN_ON(a):!EN_ON(a))));
  pgKeep("Asset",[k,ty,lv,st,en].join("|"));
  const total=rows.length, pg=Math.max(1,Math.ceil(total/LIST_PAGE));
  window.PAsset=Math.min(Math.max(1,window.PAsset||1),pg);
  const slice=rows.slice((window.PAsset-1)*LIST_PAGE, window.PAsset*LIST_PAGE);
  $("#assetTbl tbody").innerHTML=(slice.length?slice.map(a=>`<tr>
    <td><div class="a-name"><span class="a-nm" title="${xesc(a.name)}">${xesc(a.name)}</span></div><div class="a-sub" title="${xesc(accText(a))}">${xesc(accText(a))}</div></td>
    <td>${a.type}</td><td>${a.dept}</td>
    <td><span class="${LV_CLS[a.lv]}">L${a.lv}</span></td><td>${a.grp}</td>
    <td>${stateCellHtml(a)}</td><td>${a.owner}</td><td class="col-dt">${a._upd||nowD()}</td>
    <td class="cell-op"><button class="btn sm" onclick="openDetail('${a.id}')">详情</button>
      <button class="btn sm" onclick="editForm('${a.id}')">编辑</button>
      <button class="btn sm danger" onclick="delAsset('${a.id}')">删除</button></td></tr>`).join("") :
    `<tr><td colspan="9"><div class="empty"><div class="big">无匹配资产</div>调整筛选条件或登记新资产</div></td></tr>`);
  pgmk("#assetPager",total,window.PAsset,"assetPg","项",LIST_PAGE);
}
["fK","fType","fLv","fEn","fSt"].forEach(id=>{const el=document.getElementById(id); if(el) el.addEventListener("input",assetListRender);});

function openDetail(id){
  const a=byId(id); if(!a) return;
  /* 多页化：详情已独立成页（asset-detail.html）。跨页进入先记下资产，再跳转。 */
  if (PG_CUR !== "pg-detail") { window._detailAid = id; goPage("pg-detail", { aid: id }); return; }
  backMig(a);                       // 迁移先行：头部 detAddr / 首条后端资源在首次打开即按迁移后镜像展示（补默认端口）
  showPage("pg-detail");
  document.getElementById("crumbs").innerHTML=`<span class="p">资产管理</span><span class="sep">/</span><span>资产列表</span><span class="sep">/</span><span>${a.name}</span>`;
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
bind("#btnBackList", el=>el.onclick=()=>showPage("pg-list"));

/* ===== 无端访问开通 / 撤销 / 重试：列表列内开关与详情主开关共用一套状态机 =====
   状态机（仅网页应用可开通；开通中/撤销中编排互斥；异常=编排未完成走「重试」幂等续跑，不重开）：
   未开通 --开启--> 开通中 --编排完成--> 已开通；已开通 --关闭--> 撤销中 --对象清理--> 未开通 */
const OPEN_STATE_TAG={未开通:'t-gray',开通中:'t-warn',已开通:'t-ok',撤销中:'t-warn',异常:'t-err'};
/* 资产状态（启用/停用）：头部开关与标签；停用时无端访问编排已撤销且禁止再次开通 */
function renderEnState(a){
  const s=$("#detEnState"), sw=$("#swEn"); if(!s||!sw) return;
  const on=EN_ON(a);
  s.textContent=on?"已启用":"已停用"; s.className="tag "+(on?"t-ok":"t-gray");
  sw.checked=on;
  sw.title=on?"启用中：点击停用将整体下线并撤销无端访问编排（2 秒内全节点停止放行）":"已停用：点击启用恢复在网可访问";
}
function renderOpenState(a){
  const st=a.open, s=$("#detOpenState"), sw=$("#swOpen"); if(!s||!sw) return;
  if(a.type!=="网页应用"){ sw.checked=false; sw.disabled=true; s.textContent="—"; s.className="tag t-gray"; const act2=$("#detOpenAct"); if(act2) act2.innerHTML=""; return; }
  s.textContent=st; s.className="tag "+OPEN_STATE_TAG[st];
  sw.checked=st==="已开通";
  const lock=st==="开通中"||st==="撤销中"||st==="异常"||!EN_ON(a);   // 停用=整体下线 → 禁止开通；异常 → 右侧「重试」续跑
  sw.disabled=lock;
  sw.title=lock?(!EN_ON(a)?"资产已停用：请先启用资产后再开通无端访问":(st==="异常"?"无端访问编排未完成：点右侧「重试」幂等续跑":"编排进行中，操作互斥")):"";
  const act=$("#detOpenAct");
  if(act) act.innerHTML=st==="异常"&&EN_ON(a)?`<button class="btn sm" onclick="openRetry('${a.id}')">重试</button>`:"";
}
function syncOpenUI(a){
  const det=document.getElementById("pg-detail");
  if(det&&det.classList.contains("on")&&(window._detailAid||CUR)===a.id){ renderEnState(a); renderOpenState(a); }
  assetListRender();
}
function doOpen(a,retry){
  if(!EN_ON(a)){ toast("资产已停用：请先启用资产（列表/详情「状态」栏）后再开通无端访问"); return; }
  a.open="开通中"; a._upd=nowD(); syncOpenUI(a);
  setTimeout(()=>{a.open="已开通"; a._upd=nowD(); syncOpenUI(a); toast(retry?"重试成功：编排按幂等续跑完成（演示）":"已开通：代理/路由/上游/细粒度资源清单容器已编排，未配置访问要求前 default deny（演示）");},900);
}
function doClose(a){
  a.open="撤销中"; a._upd=nowD(); syncOpenUI(a);
  setTimeout(()=>{a.open="未开通"; a._upd=nowD(); syncOpenUI(a); toast("已撤销：节点 2 秒内停止放行、长连接断开、编排对象清理完成（演示）");},900);
}
function openSwitch(id,on){
  const a=byId(id); if(!a||a.type!=="网页应用") return;
  if(!EN_ON(a)){ toast("资产已停用：请先启用资产后再开通无端访问"); return; }
  const st=a.open;
  if(st==="开通中"||st==="撤销中"||st==="异常") return;   // 控件已禁用，此处仅防御
  if(on){ if(st!=="未开通") return; doOpen(a,false); }
  else { if(st!=="已开通") return; doClose(a); }
}
function openRetry(id){
  const a=byId(id); if(!a) return;
  if(!EN_ON(a)){toast("资产已停用：请先启用资产后再重试开通"); return;}
  if(a.open!=="异常"){toast("仅异常状态可重试（幂等续跑）"); return;}
  doOpen(a,true);
}
function crumb(g,p){document.getElementById("crumbs").innerHTML=`<span class="p">${g}</span><span class="sep">/</span><span>${p}</span>`;}
function nowD(){return "2026-09-06";} /* 演示基准日：登记/编辑/开通等变更落 _upd，列表「更新时间」随之刷新 */
/* 视图分层（详情页 · v11t tab 拆分）：① 无端访问开通仅「网页应用」；② 页签 = 基础信息 t1 / 地址与访问 t2（恒显，所有资产类型）/ 细粒度资源清单 t3 / 代理与上游 t4（仅可按 Web 资源化资产可见）/ 访问记录 t5；③「地址与访问」卡对所有资产开放——网页/桌面+后端 Web 登记网页式资源（多节点 / 外部地址 / 细粒度清单），非网页资产登记后端服务资源（协议 + 主机/端口/路径 + 打开方式 + 指令审计）；响应地址改写随「代理与上游」 */
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
    : "后端服务资源（每项独立：访问协议 + 主机/端口/路径 · 打开方式 · 客户端）。"+ (a.type==="远程主机"?"远程主机类资源默认经平台内嵌方式访问（浏览器内）：终端 WebSSH、远程桌面 WebRDP、文件传输 Web-SFTP；可切换桌面客户端（本地拉起）——同一主机上终端与文件通道的承载方式须一致（见 F6.3）。":"数据库 / 文件服务 / 其他 TCP 经桌面客户端或平台会话访问；端口留空按协议自动补全默认。") +"资源类型决定细粒度资源清单承载（页面与静态资源 / API / 长连接 / 文件传输 / 管理控制台 5 类支持；非 Web 类仅访问入口与打开方式）。";
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
      maxMB:Math.max(1,+$("#rlMaxMB").value||200),toSec:Math.max(1,+$("#rlToSec").value||30),keepH:Math.max(1,+$("#rlKeepH").value||24)};
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
       <span class="tag t-info">${tw}</span><span class="tag t-gray">${r.name}</span>
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
    `<div class="kv"><span class="k">资产</span><div><b>${xesc(a.name)}</b>（${a.type} · L${a.lv} · ${r.name}）</div></div>
     <div class="kv"><span class="k">客户端</span><div><span class="tag t-info">${xesc(cl)}</span><span class="muted" style="margin-left:6px">${r.client?"（已绑定）":"（未绑定 · 按协议推荐）"}</span></div></div>
     <div class="kv"><span class="k">连接串</span><div><span class="kr">${xesc(conn)}</span><button class="btn sm" style="margin-left:8px" onclick="clipText('${conn}')">复制</button></div></div>
     <div class="note" style="margin-top:6px">正式环境经自定义协议 / 应用链接（${schemeOf(r.proto)}://…）拉起本机客户端；账号 / 库名 / 连接参数由客户端侧填写。终端 / 远程桌面 / 文件传输类资源可在资源卡切换为平台内嵌会话（WebSSH / WebRDP / WebVNC / Web-SFTP）；同一主机上终端会话与文件传输会话的承载方式须一致。</div>`);
  $("#dlg1Ok").onclick=()=>{ closeDlg(); toast("已调用「"+cl+"」打开 "+conn+"（演示模拟）"); };
}

const RES_PAGE=5, PATH_PAGE=8, LIST_PAGE=6, ASP_PAGE=10;
const MXP = 10;   /* 页 B 矩阵每页条数（路径 / 资源对象 / 附属 L7 入口共用，2026-09-13） */   /* ASP_PAGE：安全策略两页资产列表每页条数 */
function resPager(total, page){
  if(total<=RES_PAGE) return "";
  const pages=Math.ceil(total/RES_PAGE), cur=page||1;
  const win=[]; for(let i=Math.max(1,cur-2); i<=Math.min(pages,cur+2); i++) win.push(i);
  const btn=(label, pageNo, on, dis)=>`<button class="b ${on?"on":""}" ${dis?"disabled":""} onclick="resGoto(${pageNo})">${label}</button>`;
  return `<div class="pager tight">
    ${btn("« 首页", 1, false, cur===1)}
    ${btn("‹ 上页", cur-1, false, cur===1)}
    ${win.map(n=>btn(n, n, n===cur)).join("")}
    ${btn("下页 ›", cur+1, false, cur===pages)}
    ${btn("末页 »", pages, false, cur===pages)}
    <span class="info">共 ${total} 项 · 第 ${cur}/${pages} 页</span></div>`;
}
function pathPager(total, page){
  if(total<=PATH_PAGE) return "";
  const pages=Math.ceil(total/PATH_PAGE), cur=page||1;
  const win=[]; for(let i=Math.max(1,cur-2); i<=Math.min(pages,cur+2); i++) win.push(i);
  const btn=(label, pageNo, on, dis)=>`<button class="b ${on?"on":""}" ${dis?"disabled":""} onclick="pathGoto(${pageNo})">${label}</button>`;
  return `<div class="pager tight">
    ${btn("« 首页", 1, false, cur===1)}
    ${btn("‹ 上页", cur-1, false, cur===1)}
    ${win.map(n=>btn(n, n, n===cur)).join("")}
    ${btn("下页 ›", cur+1, false, cur===pages)}
    ${btn("末页 »", pages, false, cur===pages)}
    <span class="info">共 ${total} 条 · 第 ${cur}/${pages} 页</span></div>`;
}
function resGoto(p){ const a=curAsset(); if(!a) return; a._resPage=Math.max(1,p); renderRes(a); renderPaths(a); }
function pathGoto(p){ const a=curAsset(); if(!a) return; a._pathPage=Math.max(1,p); renderPaths(a); }

/* —— 通用分页（全列表）：pgmk 写页码条；pgKeep 过滤器变化回第 1 页 —— */
function pgmk(elId,total,page,go,unit,size,hint){
  size=size||LIST_PAGE;
  const el=$(elId); if(!el) return;
  if(total<=size){ el.innerHTML=""; return; }
  const pages=Math.ceil(total/size), cur=Math.min(Math.max(1,page||1),pages);
  const win=[]; for(let i=Math.max(1,cur-2); i<=Math.min(pages,cur+2); i++) win.push(i);
  const btn=(lb,p,on,dis)=>`<button class="b ${on?"on":""}" ${dis?"disabled":""} onclick="${go}(${p})">${lb}</button>`;
  el.innerHTML=`<div class="pager tight">
    ${btn("« 首页",1,false,cur===1)}
    ${btn("‹ 上页",cur-1,false,cur===1)}
    ${win.map(n=>btn(n,n,n===cur)).join("")}
    ${btn("下页 ›",cur+1,false,cur===pages)}
    ${btn("末页 »",pages,false,cur===pages)}
    <span class="info">共 ${total} ${unit} · 第 ${cur}/${pages} 页 · ${hint||"勾选/批量作用于当前页"}</span></div>`;
}
function pgKeep(key,sig){ const w=window; if(w["_S"+key]!==sig){ w["_S"+key]=sig; w["P"+key]=1; } }
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
    if(okp(tail)){ p=tail; h=h.slice(0,c); }
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
  "文件传输":"该入口以文件上下行为主要内容（上传 / 下载方向留在路径与方法上表达，不按方向拆分类型）：上传入口建议启用请求体上限与内容类型白名单，下载入口建议启用限速与 Range 约束（一期 F7.3，按资产与路径配置）。",
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
    t+="；其中认证强度建议高于一期承载上限 L2 —— 一期按 L2 承载并在策略中标注「待二期承载后生效」（见 F5.3）";
  }
  return t;
}
function kindNoteSet(px, kind){
  const kn=document.getElementById(px+"KindNote");
  if(kn) kn.textContent = KIND_NOTE[kind] || "资源类型候选随资产类型收敛（见 F3.2 规则 10 的映射表）；类型创建后不可直接修改，需按目标类型重新登记迁移。";
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
  const head=mode==="主动探测"
    ? "主动探测（"+(httpLikeProto(pv)?(pv+" "+r.hcPath+" 期望 "+(r.hcCode||"200")):"TCP 节点端口")+"）"
    : "被动观察（既有请求成败采样）";
  return head+" · 每 "+(r.hcInt||10)+"s · 连续失败 "+(r.hcFail||2)+" 次"+(r.hcAct==="仅告警"?"仅告警":"自动摘除")+" · "+(r.hcRec||"自动试探恢复");
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
  openDlg("添加后端服务资源","登记该项资产的后端连接目标（协议 + 主机 / 端口 / 路径）。远程主机类资源可选择打开方式：默认平台内嵌会话（终端 WebSSH / 远程桌面 WebRDP · WebVNC / 文件传输 Web-SFTP），也可切换桌面客户端——同一主机上终端与文件通道的承载方式须一致（见 F6.3）。",
    backFormHtml(a,null,null),"xl");
  $("#dlg1Ok").onclick=()=>{
    const name=$("#bkName").value.trim(), kind=$("#bkKind").value, proto=$("#bkProto").value;
    const host=$("#bkHost").value.trim(), port=$("#bkPort").value.trim(), path=$("#bkPath").value.trim();
    const open=$("#bkOpen").value||wayDefault(proto);
    let client=null;
    if(open==="desktop"||!TERM_WAYS[proto]) client=$("#bkClient").value||null;
    if(!name){toast("资源名称为必填"); return;}
    const we=wayConsistErr(a,{id:"",kind:kind,proto:proto,open:open},open,proto);
    if(we){toast(we); return;}
    if(!host){toast("后端服务资源地址：主机（IP / 域名）为必填"); return;}
    if(port&&(!/^\d+$/.test(port)||+port<1||+port>65535)){toast("端口需为 1~65535 的数字（留空自动补默认端口）"); return;}
    if(!port&&!portDefault(proto)){toast("协议「"+proto+"」无默认端口，需显式填写端口（1~65535）"); return;}
    if(a.anon==="asset"&&!protoIsHttp(proto)){toast("该资产已整资产匿名开放，仅允许登记 HTTP 协议资源（当前协议 "+proto+"）"); return;}
    a.res=a.res||[];
    const r={id:resNextId(a),name:name,kind:kind,proto:proto,host:host,port:port,path:path,open:open,client:client,paths:[]};
    a.res.push(r);
    closeDlg(); backRerender(a);
    toast("已添加后端服务资源「"+name+"（"+proto+" → "+joinAddr(host,port,path,proto)+"）」"+(TERM_WAYS[proto]?"，默认 "+TERM_WAYS[proto]+" 访问":"")+"（演示）");
  };
}
function editBackRes(a,r){
  openDlg("编辑后端服务资源","资源类型与访问协议切换会联动候选；地址变更即时同步资产入口与列表（2 秒内全节点收敛，变更入审计）。同一主机上终端会话与文件传输会话的承载方式须一致（见 F6.3）。",
    backFormHtml(a,r,r.proto),"xl");
  const way=r.open||wayDefault(r.proto), tw=TERM_WAYS[r.proto];
  if(!tw||way==="desktop"){
    const cs=$("#bkClient"); if(cs&&!cs.disabled) cs.innerHTML=clientOptions(r.proto,r.client||clientDefault(a.type,r.proto),a.type);
  }
  $("#dlg1Ok").onclick=()=>{
    const name=$("#bkName").value.trim(), kind=$("#bkKind").value, proto=$("#bkProto").value;
    const host=$("#bkHost").value.trim(), port=$("#bkPort").value.trim(), path=$("#bkPath").value.trim();
    const open=$("#bkOpen").value||r.open||wayDefault(proto);
    if(!name){toast("资源名称为必填"); return;}
    if(!host){toast("后端服务资源地址：主机（IP / 域名）为必填"); return;}
    if(port&&(!/^\d+$/.test(port)||+port<1||+port>65535)){toast("端口需为 1~65535 的数字（留空自动补默认端口）"); return;}
    if(!port&&!portDefault(proto)){toast("协议「"+proto+"」无默认端口，需显式填写端口（1~65535）"); return;}
    if(a.anon==="asset"&&!protoIsHttp(proto)){toast("该资产已整资产匿名开放，仅允许登记 HTTP 协议资源（当前协议 "+proto+"）"); return;}
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
    ? `<div class="note red" style="margin:0 0 10px"><b>资源无可用上游</b>：${_outRes.map(r=>xesc(r.name)).join("、")} 的全部节点均不在服务面（无「在线」或「下线中」节点）——相关请求按 F6.2 返回 <b>502</b>，不静默降级。请在对应资源卡的「内部节点」处恢复节点或补充节点。</div>`
    : "";
  $("#addrWrap").innerHTML=_outBanner+(slice.length?slice.map((r,i)=>{
    const gi=(a._resPage-1)*RES_PAGE+i+1;
    if(isBackRes(r)) return backResRow(a,r,gi);
    return `<div class="rule">
    <div class="rule-h"><span class="idx">R${String(gi).padStart(2,"0")}</span>
      <b>${r.name}</b><span class="tag ${KC[r.kind]||"t-gray"}">${r.kind}</span>${r.main?'<span class="badge-main">主资源</span>':""}
      ${nodeAllOut(r)?'<span class="tag t-err" title="无可用上游：全部节点均不在服务面（无「在线」或「下线中」节点）">无可用上游 · 502</span>':""}
      <span class="muted" style="margin-left:auto">${(r.paths||[]).length} 条细粒度资源 · ${(r.nodes||[]).length} 节点（${nodeTallyText(r)}）</span>
      <button class="btn sm" onclick="editRes('${r.id}')">编辑</button>
      ${r.main?"":`<button class="btn sm danger" onclick="delRes('${r.id}')">删除</button>`}</div>
    <div class="conds-wrap" style="padding-top:2px">
      <div class="kv"><span class="k">访问协议</span>
        <select onchange="setProto('${r.id}',this.value)" title="候选 = 资产类型（${a.type}）∩ 资源类型（${r.kind}）；不铺开全量协议">${protoOptions(r.kind,!!r.main,a.type,r.proto)}</select>
        <div class="muted" style="grid-column:1 / -1">候选 = 资产类型（${a.type}）∩ 资源类型（${r.kind}）：${protoCands(r.kind,a.type).join(" / ")}${r.main?"（主资源入口）":""}；选择后即时生效、变更入审计，2 秒内全节点收敛。</div></div>
      <div class="kv"><span class="k">内部节点</span><div>${resNodesChipsHtml(r)}<button class="btn sm" onclick="nodeMgr('${r.id}')">管理</button>${nodeAllOut(r)?`<div class="note red" style="margin-top:6px">${xesc(nodeOutText(r))}</div>`:""}</div></div>
      <div class="kv"><span class="k">外部访问地址</span><span class="kr">${r.ext||"—"}</span><div class="muted" style="grid-column:1 / -1">DNS 指向网关；默认派生 {资源}.{网关域名}，可自定义客户域名</div></div>
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
          <div class="fld"><label>资源名称 <span class="req">*</span></label><input type="text" id="${px}Name" value="${isAdd?"":xesc(rR.name)}" ${isAdd?'placeholder="如：账户与转账 API"':""}></div>
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
    const num=(id,f)=>{const v=parseInt($("#"+id).value,10); return isNaN(v)||v<1?f:v;};
    const name=$(`#${px}Name`).value.trim();
    if(!name){toast("资源名称为必填"); return;}
    const kind=$("#"+px+"Kind").value;
    const pSel=$("#"+px+"Proto"), proto=pSel.value||(pSel.options[0]?pSel.options[0].value:"HTTP");
    if(a.anon==="asset"&&!protoIsHttp(proto)){toast("该资产已整资产匿名开放，仅允许登记 HTTP 协议资源（当前协议 "+proto+"）"); return;}
    const nerr=nodeBoxErr(); if(nerr){ toast(nerr); return; }   // 存在未填完 / 端口非法 / 地址重复的行时阻断保存
    const nodes=nodeBoxNodes();
    const ext=$("#"+px+"Ext").value.trim();
    // 表单同构：add / edit 走同一套收集（LB / 超时 / 健康检查 / 节点权重）
    const out={name,kind,proto,nodes,ext,lb:$("#"+px+"Lb").value,lbWeights:nodeBoxWeights(),nodeSt:nodeStFromRows(),
      toC:num(px+"ToC",3),toR:num(px+"ToR",60),toK:num(px+"ToK",32),hcOn:0,hcMode:"被动观察",hcInt:10,hcFail:2,hcAct:"自动摘除",hcRec:"自动试探恢复",hcProbe:"HTTP",hcPath:"",hcCode:"200"};
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
function nowHM(){ return String(nowTs()).slice(5); }
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
function nodeOutText(r){ return `该资源全部 ${(r.nodes || []).length} 个节点均不在服务面（${nodeTallyText(r)}）——无可用上游，请求按 F6.2 返回 502，不静默降级。请在「内部节点」处恢复节点或补充节点。`; }
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
  if(!chg.length) return;                           // 权重等非参数改动：无地址变化即无在服面变更
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
  openDlg("删除资源","删除为高危操作，需追加认证后执行；将同时删除该资源登记的 "+(r.paths||[]).length+" 条细粒度资源清单。",`
    <div class="note red">删除对象：<b>${r.name}</b>（${r.kind}）—— 存在<b>已激活</b>路径承载访问要求时拒绝删除：请先把这些路径<b>下线</b>（下线可逆，随时可重新激活）。</div>
    <div class="fld"><label>账号密码（SM2 加密提交）</label><input type="password" placeholder="输入当前管理员口令"></div>`);
  $("#dlg1Ok").onclick=()=>{
    /* 引用检查按「已激活」计：已下线条目不参与授权、其访问要求为暂停态，不构成删除阻碍（下线可逆、删除不可逆） */
    const ref=(r.paths||[]).filter(q=>q.req&&q.lc!=="已下线").length;
    if(ref){toast("该资源有 "+ref+" 条已激活路径承载访问要求，删除被拒：请先把这些路径下线（下线可逆，随时可重新激活）后再删除（演示）"); return;}
    a.res=a.res.filter(x=>x.id!==resId); closeDlg();
    if(isBackRes(r)){                 // 后端资源删除 → 同步资产级镜像（删空则清镜像，回到空态引导重新登记）
      if(!(a.res||[]).some(isBackRes)){ a.addr=""; a.addrProto=undefined; a.client=undefined; a._migB=1; }
      backRerender(a);
    } else {
      assetRerender();
    }
    toast("资源已删除（追加认证通过，操作入审计）（演示）");
  };
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
  resSel.innerHTML='<option value="">全部资源</option>'+resArr.map(r=>`<option value="${r.id}">${r.name}（${r.kind}）</option>`).join("");
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
  const KC=RES_KC;
  const total=list.length;
  if(!a._pathPage||a._pathPage<1) a._pathPage=1;
  const pages=Math.max(1,Math.ceil(total/PATH_PAGE));
  if(a._pathPage>pages) a._pathPage=pages;
  const slice=list.slice((a._pathPage-1)*PATH_PAGE, a._pathPage*PATH_PAGE);
  $("#pathTbl tbody").innerHTML=(slice.length?slice.map(r=>`<tr>
    <td>${r.resName}${r.resMain?'<span class="badge-main">主</span>':""}<div class="muted">${r.resKind}</div></td>
    <td><b>${xesc(r.name||"—")}</b></td>
    <td><span class="tag t-gray">${r.m}</span></td>
    <td class="col-num">${r.p}</td><td>${r.v}</td>
    <td><span class="tag ${RISK_CLS[r.risk]}">${r.risk}</span></td><td>${r.owner}</td>
    <td>${lcTag(r.lc)}</td>
    <td>${r.lc==="已下线"?`<button class="btn link" onclick="reactivatePath('${r.resId}','${r.m}','${r.p.replace(/'/g,"\\'")}')" title="重新激活：恢复为「已激活」，该条目下线期间的访问要求原样恢复">重新激活</button>`:`<button class="btn link danger" onclick="archivePath('${r.resId}','${r.m}','${r.p.replace(/'/g,"\\'")}')" title="下线（可逆）：生命周期转「已下线」，该条目的访问要求按未配置处理（default deny）；承载访问要求时须先完成二次认证，重新激活后原要求恢复">下线</button>`}
    <button class="btn link" onclick="openApiEdit('${r.resId}',${JSON.stringify(r).replace(/"/g,'&quot;')})">编辑</button></td></tr>`).join("") :
    `<tr><td colspan="9"><div class="empty"><div class="big">未登记细粒度资源</div><span class="muted">先「+ 添加资源」再手工登记或 OpenAPI 导入；访问要求由策略引擎 default deny 统一裁决</span></div></td></tr>`);
  $("#pathPager").innerHTML=pathPager(total, a._pathPage);
  window._detailAid=a.id;
}
["fPathK","fPathRes","fPathRisk","fPathLc"].forEach(id=>{const el=document.getElementById(id); if(el){el.addEventListener("input",()=>{const a=byId(window._detailAid||CUR); if(a) a._pathPage=1; renderPaths(byId(window._detailAid||CUR));}); el.addEventListener("change",()=>{const a=byId(window._detailAid||CUR); if(a) a._pathPage=1; renderPaths(byId(window._detailAid||CUR));});}});
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
/* 当前勾选的方法（chips 的 .on）；编辑态恒为单项 */
function apiMSelected(){
  const box=$("#apiM"); return box?[...box.querySelectorAll(".chip.on")].map(c=>c.dataset.m):[];
}
function openApiEdit(resId,r){
  const a=ctxAsset();
  if(!(a.res||[]).length){toast("当前资产暂无资源：请先到「地址与访问」添加资源"); return;}
  const resOptions=(a.res||[]).map(x=>`<option value="${x.id}" ${x.id===resId?"selected":""}>${x.name}（${x.kind}）</option>`).join("");
  const sel=(v,opts)=>opts.map(o=>`<option ${o===v?"selected":""}>${o}</option>`).join("");
  openDlg(r?"编辑细粒度资源":"登记细粒度资源",
    r?"唯一键（资源×方法×路径）变更与新增均查重；生命周期置「已下线」即停用。匹配语义随路径自动派生，改路径即自动更新，无需手工选择。":"登记后同路径不同方法是不同条目；唯一键（资源×方法×路径）重复将被拒绝。方法可多选——保存时按方法展开为多条独立条目，任一条键冲突即整体拒绝、不产生半截数据。提供业务可读清单名称；匹配语义由系统按路径特征自动判定（{参数} / ** / * 均可识别并可组合）。访问要求由策略引擎 default deny 统一裁决。",`
    <div class="dlg-scroll">
    <div class="form-grid c3">
      <div class="fld full"><label>所属资源 <span class="req">*</span></label><select id="apiResSel">${resOptions}</select></div>
      <div class="fld full"><label>HTTP 方法 <span class="req">*</span></label>
        <div class="chips" id="apiM" data-single="${r?1:0}">${API_METHODS.concat(r&&API_METHODS.indexOf(r.m)<0?[r.m]:[]).map(mm=>`<span class="chip${(r?r.m===mm:mm==="GET")?" on":""}" data-act="apiMChip" data-m="${xesc(mm)}">${xesc(mm)}</span>`).join("")}</div>
        <div class="help">${r?"条目身份为「资源 × 方法 × 路径」，方法即本条目的身份分量——修改即改写这一条。":"可多选：每个方法保存为一条独立条目（唯一键 = 资源 × 方法 × 路径），与 OpenAPI 导入同口径；与既有条目同路径同方法时整体拒绝、不部分写入。"}</div></div>
      <div class="fld"><label>API 版本</label><input type="text" id="apiV" value="${r?r.v:"v1"}"></div>
      <div class="fld"><label>风险等级</label><select id="apiRisk">${sel(r?r.risk:"中",["低","中","高"])}</select></div>
      <div class="fld full"><label>清单名称 <span class="req">*</span></label><input type="text" id="apiName" value="${r?r.name||"":""}" placeholder="业务可读名称，如：查询客户资料 / 批量转账"></div>
      <div class="fld"><label>负责人</label><input type="text" id="apiOwner" value="${opUser()}" readonly style="background:#f4f6f9" title="自动取当前操作人（登记 / 修改均自动落账）"><div class="help">自动取当前操作人；登记时记为登记人，修改保存后更新为最后修改人</div></div>
      <div class="fld"><label>生命周期</label><select id="apiLc">${sel(r?r.lc:"已激活",["已激活","已下线"])}</select></div>
      <div class="fld full"><label>规范化路径 <span class="req">*</span></label><input type="text" id="apiP" value="${r?r.p:""}" placeholder="/api/accounts/{id}/txns/* · /img/**/icons/*.svg · /a/*/b · /login" oninput="apiMtAuto()"></div>
      <div class="fld full"><label>匹配语义<span class="muted" style="font-weight:400; margin-left:4px">按路径自动派生，无需选择</span></label>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap"><span id="apiMtChips"></span></div>
        <div class="help">{参数} → 参数化；独立段 ** → ** 多段通配（跨零至任意层级，如 /a/**/b）；末尾整段 * → 前缀（开放其后任意子路径，如 /static/*）；中缀或文件名部分的 * → * 通配（不跨层级，如 *.html、/a/*/b）；特征可组合叠加（如 /img/**/icons/*.svg → ** 多段通配 · * 通配）。修改路径实时更新。</div></div>
    </div>
    </div>`,"lg");
  apiMtAuto();
  $("#dlg1Ok").onclick=()=>{
    const name=$("#apiName").value.trim(), ms=apiMSelected(), p=$("#apiP").value.trim();
    if(!name){toast("清单名称为必填（业务可读名称）"); return;}
    if(!ms.length){toast(r?"请选择 HTTP 方法":"请至少选择一种 HTTP 方法"); return;}
    if(!p){toast("规范化路径为必填"); return;}
    if(!p.startsWith("/")){toast("规范化路径需以 / 开头"); return;}
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
  if(!(a.res||[]).length){toast("当前资产暂无资源：请先到「地址与访问」添加资源"); return;}
  const resOptions=(a.res||[]).map(x=>`<option value="${x.id}">${x.name}（${x.kind}）</option>`).join("");
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
  if(note) note.innerHTML="非网页资产登记<b>后端服务资源地址（访问协议 + 主机 / 端口 / 路径）</b>作为<b>访问入口</b>：远程主机类默认经平台内嵌方式访问（浏览器内）——终端 <b>WebSSH</b>、远程桌面 <b>WebRDP</b> / <b>WebVNC</b>、文件传输 <b>Web-SFTP</b>，可切换<b>桌面客户端</b>；同一主机上终端会话与文件传输会话的承载方式须一致（见 F6.3）。数据库 / 文件服务 / 其他 TCP 经桌面客户端访问。端口留空按协议自动补全默认。细粒度资源清单承载由<b>资源类型</b>决定（页面与静态资源 / API / 长连接 / 文件传输 / 管理控制台 5 类支持；非 Web 类仅访问入口与打开方式）。访问协议候选 = 资产类型 ∩ 资源类型（精确交集，不铺开全量协议）。";
  const cr=$("#eaClientReq2"); if(cr) cr.style.display="none";
  const clb=$("#eaClientLb2"); if(clb) clb.textContent="（打开资产时调用的本机客户端；候选随访问协议）";
  const btn=$("#btnEaClientDetect"); if(btn) btn.style.display="";
  const ch=$("#eaClientHint2"); if(ch) ch.textContent="未绑定时打开按协议推荐默认客户端；登记后可在资产详情「地址与访问」调整绑定。";
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
  $$("#efSteps .step").forEach(st=>{ const n=+st.dataset.s; st.classList.toggle("disabled", !web&&(n===3||n===4)); });
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
  $("#eaDept2").value=a.dept||"";
  $("#eaOwner2").value=a.owner||"";
  $("#eaGrp2").value=["核心业务","办公协同","数据平台","开发测试"].includes(a.grp)?a.grp:"核心业务";
  const enS=$("#eaEn2"); if(enS) enS.value=(a.en===0)?"0":"1";
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
    st.classList.toggle("disabled",!web&&(n===3||n===4));
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
    if(more){ more.style.display=backN>0?"block":"none"; more.textContent="该资产共登记 "+backN+" 条后端服务资源（含此前在详情「地址与访问」添加）：此处维护主登记项，其余条目保存后可在详情继续调整。"; }
    eaDesktopUI();
  }
}
/* ===== 代理与上游 · 可编辑配置组件（详情 t4 与 向导 S4 共用；id 前缀区分，详情 pfx="" / 向导 pfx="ef"）=====
   资产键：_inj 注入模式（两档：不注入 / 注入网关托管凭据）/ _injCred 托管凭据 / _hdrAllow 允许透传业务头 /
   _tls 上游 TLS / _idem401 非幂等 401 重放 / _scRw Set-Cookie 域重写 / _rewrite 响应地址改写 /
   _rwBigEx 大响应放行例外 / _nets 允许目标网段。全部就地编辑、变更即时写资产并提示收敛。
   注入范围（2026-09-20 用户口径）：固定为「仅非 public 路径」（硬规则、不提供开关）——显式公开（public）
   路径匿名直达、无主体身份，永不注入平台身份 / 托管凭据；计数与说明见 upScopeInfo / upScopeHtml。
   档位收敛（2026-09-22 v18 用户裁定）：「注入平台 token」注入的是**主体（用户）身份**，属二期 F2.2
   出站身份适配层 —— 该档已**迁入资产详情「身份适配」页签（A 档）**；本页自此只保留「网关 → 上游」
   连接级的机器凭据（不注入 / 注入网关托管凭据）。引擎侧三档不变（FL2 §10），变的是配置面归属。 */
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
const UP_CREDS = () => CRED_LIST.filter(c => c.st === "启用").map(c => [c.id, c.name, c.type]);
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
/* —— 上游认证与凭据处理卡 —— */
function upAuthRender(elId,pfx,a){
  const el=document.getElementById(elId); if(!el) return;
  upCfgEnsure(a);
  const s=upCfgDft(a), R=pfx, I=(pfx==="")?{Rw:"swRewrite",Tls:"swTls",Inj:"injectMode",nm:"inj"}:{Rw:"efSwRw",Tls:"efSwTls",Inj:"efInjMode",nm:"efInj"};
  const radios=["none","cred"].map((v,i)=>`<label class="${s.inj===v?"on":""}"><input type="radio" name="${I.nm}" value="${v}" ${s.inj===v?"checked":""}>${["不注入（上游自行认证）","注入网关托管凭据"][i]}</label>`).join("");
  el.innerHTML=`
    <div class="kv"><span class="k">上游认证注入</span><div>
      <span class="rmode" id="${I.Inj}" style="margin:0">${radios}</span>${upScopeInfo(a).non===0?'<span class="tag t-warn" style="margin-left:8px" title="本资产全部在网路径均为 public —— 按「public 永不注入」硬规则，本区块当前不生效；若确需注入，请先在「资产细粒度访问策略」中取消 public。">当前不生效</span>':''}
      <div id="${R}CredRow" class="fldrow" style="display:${s.inj==="cred"?"":"none"}"><label>托管凭据</label><div>
        <select id="${R}CredSel">${UP_CREDS().map(c=>`<option value="${c[0]}" ${s.cred===c[0]?"selected":""}>${c[1]}（${c[2]}）</option>`).join("")}</select>
        <div class="help">网关到上游的<b>机器对接凭据</b>（Basic / API-Key / OAuth2 Client），由平台维护，见 <a href="#" class="hl" style="text-decoration:none" onclick="goCred('c1');return false">凭据托管</a>；<b>mTLS 客户端证书</b>不走本项，在下方「上游 TLS 校验 → 客户端证书（mTLS）」引用。</div>
        <div id="${R}CredFlow" class="help" style="margin-top:6px"></div></div></div></div></div>
    <div class="kv"><span class="k">用户身份注入</span><div>
      <span class="muted">「用户 / 主体 → 资产」的传导（token 注入 · key 换取 · 协议 SSO · 代填 四档）已<b>统一在资产详情 →「身份适配」页签</b>配置 —— 本页只承载「<b>网关 → 上游</b>」连接级的机器凭据，<b>同一对象不在两处配</b>。</span>
      <button class="btn sm" type="button" data-auth="adaptGo">去「身份适配」配置</button></div></div>
    <div class="kv"><span class="k">注入范围</span><div>${upScopeHtml(a)}</div></div>
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
  /* radio 注入模式联动 */
  const im=q(I.Inj);
  if(im) im.querySelectorAll("label").forEach(l=>l.addEventListener("click",()=>{
    const v=l.querySelector("input").value;
    im.querySelectorAll("label").forEach(x=>{x.classList.remove("on"); const xi=x.querySelector("input"); if(xi) xi.checked=false;});
    l.classList.add("on"); l.querySelector("input").checked=true;
    a._inj=v;
    const cr=q(R+"CredRow");
    if(cr) cr.style.display=v==="cred"?"":"none";
    if(!pfx) toast("上游认证注入已切换："+(v==="none"?"不注入（上游自行认证）":"注入网关托管凭据")+"，2 秒内全节点生效（演示）");
  }));
  /* token 头名 / 凭据 */
  const cred=q(R+"CredSel"); if(cred) cred.onchange=()=>{ a._injCred=cred.value; const f=q(R+"CredFlow"); if(f) f.innerHTML=upCredFlow(cred.value); if(!pfx) toast("托管凭据已切换（演示）"); };
  const cf=q(R+"CredFlow"); if(cf) cf.innerHTML=upCredFlow(s.cred);
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
      <td><b>${r.name}</b>${r.main?'<span class="badge-main">主</span>':""}</td>
      <td><span class="tag ${KC[r.kind]||"t-gray"}">${r.kind}</span></td>
      <td><span class="tag t-gray">${r.proto||"HTTP"}</span></td>
      <td>${bk?'<span class="muted">—（单一连接目标）</span>':(r.nodes||[]).map(x=>nodeChipHtml(r,x)).join("")+`<button class="btn sm" onclick="nodeMgr('${r.id}')">管理</button>`}</td>
      <td><span class="kr">${r.ext||"—"}</span></td>
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
      <td>${r.resName}${r.resMain?'<span class="badge-main">主</span>':""}<div class="muted">${r.resKind}</div></td>
      <td><b>${xesc(r.name||"—")}</b></td>
      <td><span class="tag t-gray">${r.m}</span></td>
      <td class="col-num">${r.p}</td><td>${r.v}</td>
      <td><span class="tag ${RISK_CLS[r.risk]}">${r.risk}</span></td>
      <td>${r.owner||"—"}</td>
      <td>${lcTag(r.lc)}</td>
      <td>${r.lc==="已下线"?`<button class="btn link" onclick="reactivatePath('${r.resId}','${r.m}','${r.p.replace(/'/g,"\\'")}')" title="重新激活：恢复为「已激活」，该条目下线期间的访问要求原样恢复">重新激活</button>`:`<button class="btn link danger" onclick="archivePath('${r.resId}','${r.m}','${r.p.replace(/'/g,"\\'")}')" title="下线（可逆）：生命周期转「已下线」，该条目的访问要求按未配置处理（default deny）；承载访问要求时须先完成二次认证，重新激活后原要求恢复">下线</button>`}
      <button class="btn link" onclick="openApiEdit('${r.resId}',${JSON.stringify(r).replace(/"/g,'&quot;')})">编辑</button></td></tr>`).join("")}</tbody></table>`
    : `<div class="empty"><div class="big">尚未登记细粒度资源</div><span class="muted">通过「OpenAPI 导入」或「+ 登记细粒度资源」逐步建立清单；访问要求由策略引擎 default deny 统一裁决</span></div>`;
}
/* S4 汇总 · 后端地址预览：网页类（含桌面+Web 后端）展示资源与清单统计；其它类型展示三框组合后的地址（端口留空 → 预览即补默认） */
function efAddrKV(web){
  if(web){
    const a=_formAsset;
    return `<div class="kv"><span class="k">资源（${(a.res||[]).length} 项）</span><div>${(a.res||[]).map(r=>`${r.main?"<b>主</b> ":""}${r.name}（${r.kind}） · ${(r.nodes||[]).length} 节点（${nodeTallyText(r)}） · 清单 ${(r.paths||[]).length} 条`).join("<br>")||"—"}</div></div>
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
    <div class="kv"><span class="k">资产状态</span><div><span class="tag ${en?"t-ok":"t-gray"}">${en?"已启用":"已停用"}</span><span class="muted" style="margin-left:6px">停用状态下不允许开通无端访问；保存后可在列表「状态」栏切换</span></div></div>
    <div class="kv"><span class="k">资产类型</span><div>${type}<span class="muted" style="margin-left:6px"> · ${typeDesc}</span></div></div>
    <div class="kv"><span class="k">安全等级</span><div><span class="${LV_CLS[efLvVal()]}">L${efLvVal()}</span><span class="muted" style="margin-left:8px">登记属性 · 驱动防护出厂默认</span></div></div>
    <div class="kv"><span class="k">部门 / 分组</span><div>${dept||"—"} / ${grp}</div></div>
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
    if(a.anon==="asset"&&efLvVal()!==1){toast("该资产已声明整资产匿名开放，安全等级须保持 L1；请先在「资产细粒度访问策略」关闭匿名声明再调整等级"); return;}
    a.name=name; a.dept=dept; a.grp=grp; a.owner=owner; a.lv=efLvVal(); a.en=en;
    if(web){
      const mr=(a.res||[]).find(r=>r.main)||(a.res||[])[0];
      if(mr){ a.addr=(mr.nodes||[])[0]||a.addr||""; a.addrProto=mr.proto||a.addrProto; a.ext=mr.ext||a.ext||"-"; }
      syncAssetFromRes(a);
    } else {
      const proto=$("#eaProto2").value, cl=clVal||null;
      a.addr=addr2; a.addrProto=proto; a.client=cl;
      // 第 2 步快捷登记后端地址 → 同步「资源与访问」首条后端资源（详情多后端资源登记在「地址与访问」完成）
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
  const injEl=document.querySelector('#efInjMode input[name="efInj"]:checked');
  if(injEl) a._inj=injEl.value;
  const rwEl=document.getElementById("efSwRw"), tlEl=document.getElementById("efSwTls");
  if(rwEl) a._rewrite=rwEl.checked;
  if(tlEl) a._tls=tlEl.checked;
  a._upd=nowD(); const id=a.id; _efSnap=""; _formAsset=null; const doneEdit=_formMode==="edit";
  /* R19 openDetail 已写入三级面包屑（资产管理 / 资产列表 / 资产名）。此处不再回写两级——
     否则保存后明明落在资产详情，面包屑却只走到「资产列表」，与当前页面层级不符。 */
  showPage("pg-detail"); openDetail(id);
  toast(doneEdit?"资产信息已保存（变更入审计）（演示）":"资产「"+name+"」已登记（L"+a.lv+"，"+(en?"已启用":"已停用")+"），后端地址 "+a.addr+"（端口未填已按协议补全默认）（演示）");
}
/* R25 未保存确认：向导承载五步填写，静默离页会丢掉已填内容与已添加的资源 / 细粒度清单。
   与策略设计器「零改动直接返回、有改动先确认」同一口径——改动基线只取语义字段，
   渲染期写入的运行时标记不参与比对，避免误判。 */
function efSnap(){
  const v = id => { const e = document.getElementById(id); return e ? String(e.value || "") : ""; };
  return JSON.stringify({
    n: v("eaName2"), d: v("eaDept2"), o: v("eaOwner2"), g: v("eaGrp2"), t: v("eaType2"),
    lv: v("eaLvSel"), en: v("eaEn2"), proto: v("eaProto2"), host: v("eaHost2"), port: v("eaPort2"), pth: v("eaPath2"),
    res: ((_formAsset || {}).res || []).map(r => [r.id, r.proto || "", r.host || "", r.port || "", r.path || "", (r.paths || []).length])
  });
}
function efDirty(){ return !!_formAsset && _efSnap !== efSnap(); }
function efExit(){
  const backEdit=_formMode==="edit", id=backEdit&&_formAsset?_formAsset.id:null;
  const go=()=>{
    _formAsset=null; _formMode="register"; _efSnap="";
    if(backEdit&&id&&_formFrom==="pg-detail"){ window._detailAid=id; goPage("pg-detail",{aid:id}); }
    else { goPage("pg-list"); }
  };
  if(efDirty()){
    confirmDlg("放弃本次填写？", '<div class="note warn">未保存的内容将丢失，含已添加的资源与细粒度资源清单。</div>',
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
  if(!efTypeWeb()&&(n===3||n===4)) return;
  efGo(n);
}));

/* ===== 资产新增 / 删除 / 编辑 ===== */
bind("#btnNewAsset", el=>el.onclick=()=>enterForm("register"));
function delAsset(id){
  const a=byId(id); if(!a) return;
  if(a.open==="开通中"||a.open==="撤销中"){toast("当前状态为「"+a.open+"」，编排互斥：待流程完成后重试"); return;}
  const openNote=a.open==="已开通"?"该资产无端访问<b>已开通</b>：确认删除将同步撤销开通（先发高优安全关闭 → 停止签发授权码 → 清理资产访问状态 → 断开长连接 → 软删除）后再删除资产。":"无端访问未开通，直接删除登记。";
  openDlg("删除资产","删除为高危操作，需追加认证后执行。删除前校验：无端访问已撤销、无已激活路径承载访问要求（如有，请先把这些路径下线——下线可逆、删除不可逆）。",
    `<div class="note red">删除对象：<b>${a.name}</b>（${a.type} · L${a.lv}）—— ${openNote}</div>
     <div class="fld"><label>账号密码（SM2 加密提交）</label><input type="password" placeholder="输入当前管理员口令"></div>`);
  $("#dlg1Ok").onclick=()=>{
    /* 同上：只计「已激活」路径的访问要求（已下线为暂停态，不阻塞删除） */
    const refs=flatResPaths(a).filter(q=>q.req&&q.lc!=="已下线").length;
    if(refs){toast("资产 "+a.name+" 有 "+refs+" 条已激活路径承载访问要求，删除被拒：请先把这些路径下线（下线可逆，随时可重新激活）后再删除（演示）"); return;}
    const i=ASSETS.findIndex(x=>x.id===id); if(i<0) return;
    ASSETS.splice(i,1); closeDlg();
    toast("已删除资产「"+a.name+"」（追加认证通过，操作入审计）（演示）");
    if((window._detailAid||CUR)===id){ window._detailAid=""; showPage("pg-list"); crumb("资产管理","资产列表"); }
    assetListRender();
  };
}
function editForm(id){
  const a=byId(id); if(!a) return;
  enterForm("edit",a,"pg-list");
}
/* t1 基础信息卡头「编辑」与详情头部「编辑」同源：进入五步编辑向导（资源地址 / 细粒度清单 / 代理与上游均在其中维护） */
function editMeta(){ const a=byId(window._detailAid||CUR); if(a) enterForm("edit",a,"pg-detail"); }
bind("#btnEditMeta", el=>el.onclick=editMeta);


function xesc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
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
/* ==========================================================================
   白泽零信任 · 安全策略模块（已并入《原型-资产管理-20260907.html》）
   资产访问控制策略（资产准入） / 资产细粒度访问策略（资源级判定）
   复用宿主 $/$$/toast/ASSETS/byId/showPage/curAsset；mock 数据与资产列表同源
   ========================================================================== */

/* ===== 本模块局部工具（宿主已有 $/$$/toast，不重复定义） ===== */
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nowTs = () => { const d = new Date(); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };


/* ===== 组织树（平台组织与用户） ===== */
const ORG_TREE = [
  { id: "org_root", name: "白泽银行（总行）", kids: [
    { id: "org_ebank", name: "电子银行部" },
    { id: "org_loan", name: "信贷管理部" },
    { id: "org_data", name: "数据管理部" },
    { id: "org_admin", name: "综合管理部" },
    { id: "org_tech", name: "科技管理部", kids: [
      { id: "org_tech_infra", name: "基础架构组" },
      { id: "org_tech_sec", name: "安全运维组" } ] },
    { id: "org_comp", name: "合规部" },
    { id: "org_market", name: "金融市场部" } ] },
];
const ORG_FLAT = (function walk(list, out) { list.forEach(n => { out.push({ id: n.id, name: n.name, depth: n.kids ? 0 : 1 }); if (n.kids) walk(n.kids, out); }); return out; })(ORG_TREE, []);
const orgName = id => (ORG_FLAT.find(o => o.id === id) || { name: id }).name;

/* ===== 客户端软件库（受控清单：软件名称 + 已登记版本序列） ===== */
const SOFT_LIB = [
  { id: "sw_bz", name: "白泽客户端", os: "Windows", versions: ["2.0.0", "2.1.0", "2.2.0", "2.3.0", "2.4.1"] },
  { id: "sw_bz_mac", name: "白泽客户端（macOS）", os: "macOS", versions: ["2.1.0", "2.3.0", "2.4.1"] },
  { id: "sw_ops", name: "运维巡检助手", os: "Windows", versions: ["1.2.0", "1.4.0", "1.5.2"] },
  { id: "sw_ebank", name: "网银安全控件", os: "Windows", versions: ["1.0.0", "1.1.0"] },
];
const softById = id => SOFT_LIB.find(s => s.id === id);
const softByName = n => SOFT_LIB.find(s => s.name === n);

/* 取值多值能力的判定原则（新增属性时照此判定）：
   ① 值域 ≥ 3 的互斥枚举一律给多值（enum-multi + in/notin + q=any）。关键不在"能选多个"，
      而在**白名单与黑名单不等价**：「账号状态 ≠ 离职」是排除法，将来平台新增任何状态都会被
      放行（fail-open）；「账号状态 ∈ {在职}」是白名单，新增状态默认拒绝（fail-closed）。
   ② 值域 = 2 的二值语义（含 bool）保持单值：`∈ {A}` ≡ `= A`，`∈ {A,B}` ≡ 全集（恒真，属配置错误），
      多值不新增表达力，只增加 UI 面积与误配面。
   ③ 有序枚举保持单值：表达需求是「某一档及以上」或「区间」，已由 ≥ / ≤ / 之间 覆盖；
      「跳跃组合」可用「或」子组等价展开，与原式求值一致、无安全语义差异。
   ④ 复合条件保持单值：版本依附于具体名称，多值需为每个名称配一组版本；等价表达是同组内多条条件行。 */
/* ===== 属性字典 =====
   cat：subject 主体属性（用户 / 认证 / 客户端软件 / 终端设备，地位对等）｜ env 环境属性
   scope：both 两形态均可得 ｜ agent 仅"有端接入"可得（无端组置灰）
   editor：E1~E11（§7.1）
   ========================================================================== */
const ATTR_DICT = [
  /* --- 主体属性 · 用户（两形态均可得） --- */
  { id: "user.account", cat: "subject", dim: "user", label: "账号", type: "ref-search", ops: ["eq", "ne", "in"], q: "any", editor: "E11", scope: "both", src: "平台身份链", ex: "zhangsan（张伟）" },
  { id: "user.org", cat: "subject", dim: "user", label: "所属组织机构", type: "org", ops: ["in", "notin"], q: "any", editor: "E3", scope: "both", src: "平台身份链", ex: "电子银行部（含子组织）" },
  { id: "user.dept", cat: "subject", dim: "user", label: "部门", type: "enum-multi", ops: ["in", "notin"], q: "both", editor: "E2", scope: "both", src: "平台身份链", ex: "电子银行部 / 信贷管理部（一人可兼多部门）" },
  { id: "user.post", cat: "subject", dim: "user", label: "岗位", type: "enum-multi", ops: ["in", "notin"], q: "both", editor: "E2", scope: "both", src: "平台身份链", ex: "客户经理 / 审批岗（一人可兼多岗）" },
  { id: "user.rank", cat: "subject", dim: "user", label: "职级", type: "enum-order", ops: ["eq", "ne", "gte", "lte", "between"], q: "none", editor: "E4", scope: "both", src: "平台身份链", ex: "经理（及以上）" },
  { id: "user.role", cat: "subject", dim: "user", label: "角色", type: "enum-multi", ops: ["contains", "notcontains"], q: "both", editor: "E2", scope: "both", src: "平台身份链", ex: "运维管理员 / 审计员（一人可兼多角色，多取值时按「任一命中 / 全部具备」判定）" },
  { id: "user.group", cat: "subject", dim: "user", label: "用户组", type: "enum-multi", ops: ["in", "notin"], q: "both", editor: "E2", scope: "both", src: "平台身份链", ex: "核心业务值守组" },
  { id: "user.tag", cat: "subject", dim: "user", label: "标签", type: "enum-multi", ops: ["contains", "notcontains"], q: "both", editor: "E2", scope: "both", src: "平台身份链", ex: "审批人 / 外协人员（一人可带多标签）" },
  { id: "user.state", cat: "subject", dim: "user", label: "账号状态", type: "enum-multi", ops: ["in", "notin"], q: "any", editor: "E2", scope: "both", src: "平台身份链", ex: "在职 / 离职 / 停用（同一时刻只有一个状态；多取值按白名单判定，等价于排除其余档）" },
  { id: "user.perm", cat: "subject", dim: "user", label: "业务权限", type: "ref-search", ops: ["allof", "anyof"], q: "none", editor: "E11", scope: "both", src: "权限字典", ex: "转账审批权（「全部具备 / 任一命中」由运算符承载）" },
  /* --- 主体属性 · 认证（会话认证强度，两形态均可得；页 A 用于判定是否需要追加认证） --- */
  { id: "auth.level", cat: "subject", dim: "auth", label: "安全级别", type: "enum-order", ops: ["eq", "ne", "gte", "lte", "between"], q: "none", editor: "E4", scope: "both", src: "会话认证记录", ex: "≥ 3 级（级别越高越强）" },
  { id: "auth.method", cat: "subject", dim: "auth", label: "认证方式", type: "enum-multi", ops: ["in", "notin"], q: "any", editor: "E2", scope: "both", src: "会话认证记录", ex: "短信验证码 / 企业微信扫码（同级等效，命中任一即达标）" },
  { id: "auth.composite", cat: "subject", dim: "auth", label: "复合方式数", type: "enum-order", ops: ["eq", "ne", "gte", "lte"], q: "none", editor: "E4", scope: "both", src: "会话认证记录", ex: "≥ 2（两种以上方式叠加）" },
  /* --- 主体属性 · 客户端软件（仅"有端接入"可得） --- */
  { id: "client.software", cat: "subject", dim: "client", label: "客户端软件", type: "composite-soft", ops: ["sw"], q: "none", editor: "E1+E10+E4", scope: "agent", src: "客户端软件库 / SDK 上报", ex: "白泽客户端（版本 ≥ 2.3.0）" },
  { id: "client.os", cat: "subject", dim: "client", label: "运行操作系统", type: "enum-multi", ops: ["in", "notin"], q: "any", editor: "E2", scope: "agent", src: "有端 SDK 上报", ex: "Windows / macOS / Linux（一台终端只运行一个系统）" },
  { id: "client.sign", cat: "subject", dim: "client", label: "软件签名状态", type: "enum-multi", ops: ["in", "notin"], q: "any", editor: "E2", scope: "agent", src: "SDK 校验", ex: "已签名 / 未签名 / 校验失败（多取值按白名单判定，等价于排除其余档）" },
  { id: "client.managed", cat: "subject", dim: "client", label: "托管授权状态", type: "bool", ops: ["eq", "ne"], q: "none", editor: "E8", scope: "agent", src: "网关托管凭据", ex: "已托管 / 未托管" },
  /* --- 主体属性 · 终端设备（仅"有端接入"可得） --- */
  { id: "device.serial", cat: "subject", dim: "device", label: "设备序列号", type: "list", ops: ["in", "notin"], q: "any", editor: "E9", scope: "agent", src: "有端 SDK 采集", ex: "SN-2026-0001…（一机一号；支持批量粘贴，去重后生效）" },
  { id: "device.org", cat: "subject", dim: "device", label: "设备所属组织机构", type: "org", ops: ["in", "notin"], q: "any", editor: "E3", scope: "agent", src: "设备台账 / 注册绑定", ex: "科技管理部（含子组织）" },
  { id: "device.owner", cat: "subject", dim: "device", label: "设备所属人员", type: "ref-search", ops: ["eq", "ne", "in"], q: "any", editor: "E11", scope: "agent", src: "设备台账 / 注册绑定", ex: "张伟（可改为「当前登录用户」做同源比较）" },
  { id: "device.os", cat: "subject", dim: "device", label: "操作系统", type: "os-ver", ops: ["eq"], q: "none", editor: "E10", scope: "agent", src: "有端 SDK 采集", ex: "Windows（版本 ≥ 10）" },
  { id: "device.reg", cat: "subject", dim: "device", label: "设备注册状态", type: "enum-one", ops: ["eq", "ne"], q: "none", editor: "E1", scope: "agent", src: "注册登记", ex: "已注册 / 未注册" },
  { id: "device.revoked", cat: "subject", dim: "device", label: "设备吊销状态", type: "bool", ops: ["eq", "ne"], q: "none", editor: "E8", scope: "agent", src: "吊销列表", ex: "正常 / 已吊销" },
  /* --- 环境属性（两形态均可得） --- */
  { id: "env.ip", cat: "env", dim: "env", label: "来源 IP / 网段", type: "ip", ops: ["in", "notin"], q: "any", editor: "E6", scope: "both", src: "网关可信链（真实 IP）", ex: "10.20.0.0/16" },
  { id: "env.zone", cat: "env", dim: "env", label: "网络区域", type: "enum-multi", ops: ["in", "notin"], q: "any", editor: "E2", scope: "both", src: "网段—区域映射", ex: "办公网 / 生产网 / 测试网 / 管理网 / 公网（一个请求只属于一个区域；VPN / 专线属「接入网络类型」）" },
  { id: "env.geo", cat: "env", dim: "env", label: "地理位置", type: "enum-multi", ops: ["in", "notin"], q: "any", editor: "E2", scope: "both", src: "IP 归属库", ex: "浙江省杭州市" },
  { id: "env.time", cat: "env", dim: "env", label: "时间窗口", type: "time", ops: ["in", "notin"], q: "none", editor: "E7", scope: "both", src: "网关时钟（UTC 存 / 按时区算）", ex: "每天 / 法定工作日 / 法定节假日 / 自定义星期，可按月份限定" },
  { id: "env.nettype", cat: "env", dim: "env", label: "接入网络类型", type: "enum-multi", ops: ["in", "notin"], q: "any", editor: "E2", scope: "both", src: "网关", ex: "行内局域网 / VPN / 专线 / 互联网（一个请求只以一种方式接入；多取值按白名单判定，命中任一即达标）" },
];
const attrById = id => ATTR_DICT.find(a => a.id === id);
const DIM_LABEL = { user: "用户", auth: "认证", client: "客户端软件", device: "终端设备", env: "环境" };
/* 条件回读专用全名：条件行脱离属性选择器的分组上下文后，需自带维度归属才能自明——
   例「所属组织机构」→「用户所属组织机构」、「安全级别」→「认证安全级别」。
   下拉选项仍用简洁 label（分组标题已给出维度），回读用全名，两者不混用。 */
const READ_LABEL = {
  "user.account": "用户账号", "user.org": "用户所属组织机构", "user.dept": "用户部门",
  "user.post": "用户岗位", "user.rank": "用户职级", "user.role": "用户角色",
  "user.group": "用户组", "user.tag": "用户标签", "user.state": "用户账号状态",
  "user.perm": "用户业务权限",
  "auth.level": "认证安全级别", "auth.method": "认证方式", "auth.composite": "认证复合方式数",
  "client.software": "客户端软件", "client.os": "客户端运行操作系统",
  "client.sign": "客户端软件签名状态", "client.managed": "客户端托管授权状态",
  "device.serial": "终端设备序列号", "device.org": "终端设备所属组织机构",
  "device.owner": "终端设备所属人员", "device.os": "终端设备操作系统",
  "device.reg": "终端设备注册状态", "device.revoked": "终端设备吊销状态",
  "env.ip": "环境来源 IP / 网段", "env.zone": "环境网络区域",
  "env.geo": "环境地理位置", "env.time": "环境时间窗口", "env.nettype": "环境接入网络类型",
};
const attrFullLabel = id => READ_LABEL[id] || (attrById(id) ? attrById(id).label : id);
const CAT_LABEL = { subject: "主体属性", env: "环境属性" };
/* 属性字典两级分类：类别 → 维度（属性选择器一级选项按此顺序展开） */
const CAT_DIMS = { subject: ["user", "auth", "client", "device"], env: ["env"] };
/* 资源级属性策略可用的环境属性：仅网络与时间类——
   来源 IP / 网段、网络区域、时间窗口；地理位置、接入网络类型归页 A「资产访问控制策略」准入策略 */
const REQ_ENV_ATTRS = ["env.ip", "env.zone", "env.time"];
/* 认证方式与安全等级字典：**级别档位固定 L1~L5 且序不变**（不新增不删除），可自定义的是级别名称 /
   判定含义与各级别下的方式集合；新增同级方式无需改写任何既有策略、也不使既有策略失效。
   **同一安全级别可包含多种等效方式**（强度相当、可互换使用）——因此「认证」维度拆为两个可引用
   属性：auth.level 取级别做强度门槛（按级别序比较），auth.method 取具体方式做方式限定
   （同级多方式时可精确到一种或几种）。默认口径：L1 免认证登录 · L2 账号密码 / 邮箱验证码 ·
   L3 短信验证码 / 企业微信扫码 / 动态口令（OTP）· L4 指纹识别 / USB Key 硬件令牌 ·
   L5 活体人脸识别 / 虹膜识别 */
const AUTH_METHODS = [
  { level: 1, names: ["免认证登录"] },
  { level: 2, names: ["账号密码", "邮箱验证码"] },
  { level: 3, names: ["短信验证码", "企业微信扫码", "动态口令（OTP）"] },
  { level: 4, names: ["指纹识别", "USB Key 硬件令牌"] },
  { level: 5, names: ["活体人脸识别", "虹膜识别"] },
];
const AUTH_LV_NAMES = lv => (AUTH_METHODS.find(m => m.level === lv) || { names: [] }).names;
/* 级别一览（字典与悬停提示用）：L3 短信验证码 / 企业微信扫码 / 动态口令（OTP） */
const AUTH_LV_LABEL = lv => `L${lv} ${AUTH_LV_NAMES(lv).join(" / ")}`;
/* 认证要求 = 条件组内的「认证」维度条件行（auth.level / auth.method / auth.composite）。
   页 A 准入策略与页 B 资源级策略**同一结构**：认证要求不单独落库，由条件承载——
   追加认证不是策略可选动作，而是认证维度条件不达标时引擎的裁决结果。
   2026-09-13 起页 B 不再单设认证要求区块（用户指令：认证条件并入属性条件）——
   认证一律经条件组内的认证维度条件行配置；下方三个辅助函数保留供条件回读与旧数据兼容使用。 */
const AUTH_ATTRS = ["auth.level", "auth.method", "auth.composite"];
const authNone = () => ({ lv: 0, methods: [], comp: 0 });
/* 从条件组读出认证要求（供条件回读与旧数据兼容使用，不是落库结构） */
function authViewOf(cond) {
  const v = authNone();
  walkTree(cond || { t: "g", op: "and", ch: [] }, (n) => {
    if (!n || n.t !== "c") return;
    const num = parseInt(String(n.v), 10);
    if (n.attr === "auth.level" && n.op === "gte" && !isNaN(num)) v.lv = num;
    else if (n.attr === "auth.method" && (n.op === "in" || n.op === "anyof")) {
      v.methods = Array.isArray(n.v) ? n.v.slice()
        : String(n.v == null ? "" : n.v).split(/[、,]/).map(x => x.trim()).filter(Boolean);
    } else if (n.attr === "auth.composite" && n.op === "gte" && !isNaN(num)) v.comp = num;
  });
  return v;
}
/* 摘除条件组内的认证维度条件行（含子组）：先清后写，避免同一属性多行并存导致语义歧义 */
function dropAuthConds(cond) {
  if (!cond || cond.t !== "g") return cond;
  cond.ch = (cond.ch || []).filter(k => !(k.t === "c" && AUTH_ATTRS.indexOf(k.attr) >= 0));
  cond.ch.forEach(k => { if (k.t === "g") dropAuthConds(k); });
  return cond;
}
/* 把认证要求写回条件组：每次变更都重建这三条条件行，取值为零即不生成——
   不留下「不限」却仍占位的空条件行 */
function setAuthCond(cond, patch) {
  if (!cond) return cond;
  const want = Object.assign(authViewOf(cond), patch || {});
  dropAuthConds(cond);
  const push = (rec) => { if (rec) (cond.ch = cond.ch || []).push(Object.assign({ t: "c", mode: "const", uid: uid() }, rec)); };
  if (want.lv) push({ attr: "auth.level", op: "gte", v: want.lv + " 级" });
  if (want.methods && want.methods.length) push({ attr: "auth.method", op: "in", v: want.methods.slice(), q: "any" });
  if (want.comp) push({ attr: "auth.composite", op: "gte", v: String(want.comp) });
  return cond;
}
/* 旧数据兼容：历史展示文本把认证要求挂在「｜认证要求：…」标记之后，该标记随本轮收敛废止。
   此处把旧段转成条件文本并入条件组解析，不保留独立字段 */
function authSegToCondText(s) {
  const seg = [];
  const m1 = String(s || "").match(/安全级别\s*≥\s*(\d)\s*级/);
  if (m1) seg.push(`${attrFullLabel("auth.level")} ≥ ${m1[1]} 级`);
  const m3 = String(s || "").match(/认证方式\s*∈\s*([^且]+)/);
  if (m3) seg.push(`${attrFullLabel("auth.method")} ∈ ${m3[1].split(/[、,]/).map(x => x.trim()).filter(Boolean).join("、")}`);
  const m2 = String(s || "").match(/复合方式数\s*≥\s*(\d+)\s*种方式叠加|至少\s*(\d+)\s*种方式复合/);
  if (m2) seg.push(`${attrFullLabel("auth.composite")} ≥ ${m2[1] || m2[2]} 种方式叠加`);
  return seg.join(" 且 ");
}

/* 承载期次口径（F5.3 / 设计稿 §10.2）：级别档位固定 L1~L5、渲染层不裁剪档位；
   一期会话认证强度上限为 L2（登录与追加认证均以 F1.1 协议承载），L3~L5 的方式集成在二期提供。
   条件组声明高于 L2 的目标级别时，保存侧给出「待二期承载后生效」提示——只说明承载期次，
   不阻断保存、不改判定，也不改落库结构（认证要求仍由认证维度条件行承载）。 */
function authCarryNote(cond) {
  const v = authViewOf(cond);
  const fromMethods = (v.methods || []).reduce((mx, n) => {
    const hit = AUTH_METHODS.find(x => x.names.indexOf(n) >= 0);
    return hit && hit.level > mx ? hit.level : mx;
  }, 0);
  const lv = Math.max(v.lv || 0, fromMethods);
  return lv > 2 ? `认证安全级别 ≥ L${lv} 高于一期承载上限 L2：该档位待二期承载后生效，本期按 L2 承载` : "";
}

/* 属性可选值域（演示字典） */
/* 属性可选值域（演示字典）
   **渲染层不再为任何属性兜底取值**：凡由取值池驱动的编辑器（enum-one / bool / enum-multi /
   ref-search / enum-order）都必须在此登记，缺失即进入显式空态。
   历史缺陷：device.reg 未登记 → 落到兜底分支渲染成软件签名状态的取值；三条引用型属性
   （账号 / 业务权限 / 设备所属人员）未登记 → 多选弹层空白、无从取值。 */
const VALUE_POOL = {
  "user.account": ["zhangsan（张伟）", "lisi（李娜）", "wangwu（王强）", "zhaoliu（赵敏）", "sunqi（孙琦）", "zhouba（周波）"],
  "user.dept": ["电子银行部", "信贷管理部", "数据管理部", "综合管理部", "科技管理部", "合规部", "金融市场部"],
  "user.post": ["客户经理", "审批岗", "运维岗", "数据开发", "风控专员"],
  "user.rank": ["专员", "经理", "总监", "总经理"],
  "user.role": ["运维管理员", "安全管理员", "审计员", "超级管理员"],
  "user.group": ["核心业务值守组", "变更评审组", "值守组"],
  "user.tag": ["审批人", "外协人员", "常态化出差", "驻场运维"],
  "user.state": ["在职", "离职", "停用"],
  "user.perm": ["转账审批权", "付款审批权", "账户查询权", "批量代发权", "参数维护权", "报表导出权"],
  "auth.level": ["1 级", "2 级", "3 级", "4 级", "5 级"],
  /* 认证方式按安全级别分组（同一级别可含多种等效方式），多选弹层按组呈现 */
  "auth.method": Object.fromEntries(AUTH_METHODS.map(m => [m.level + " 级", m.names.slice()])),
  "auth.composite": ["1", "2", "3"],
  "client.os": ["Windows", "macOS", "Linux"],
  "client.sign": ["已签名", "未签名", "校验失败"],
  "client.managed": ["已托管", "未托管"],
  "device.owner": ["zhangsan（张伟）", "lisi（李娜）", "wangwu（王强）", "zhaoliu（赵敏）", "sunqi（孙琦）"],
  "device.os": { "Windows": ["7", "10", "11", "Server 2019"], "macOS": ["12", "13", "14"], "Linux": ["CentOS 7", "Ubuntu 22.04"] },
  "device.reg": ["已注册", "未注册"],
  "device.revoked": ["正常", "已吊销"],
  /* 网络区域 = 请求来源所在区域（网段—区域映射得出）；接入网络类型 = 用户以何种方式接入。
     两者按类分工、值名不重叠，避免管理员把「公网 / 互联网」「专线 / VPN」当成同一维度。 */
  "env.zone": ["办公网", "生产网", "测试网", "管理网", "公网"],
  "env.geo": ["浙江省杭州市", "北京市", "上海市", "广东省深圳市"],
  "env.nettype": ["行内局域网", "VPN", "专线", "互联网"],
};
const OP_LABEL = { eq: "=", ne: "≠", in: "属于", notin: "不属于", gte: "≥", lte: "≤", between: "之间", contains: "包含", notcontains: "不包含", allof: "全部具备", anyof: "任一命中" };
/* 运算符的**权威来源 = 属性字典的 ops**（属性级声明，随属性语义走）；
   本表仅按**数据类型**给兜底集合，供属性未声明 ops 时回落——避免「类型一刀切」抹掉属性差异
   （历史缺陷：user.perm 的「全部具备 / 任一命中」、client.sign 的「≠」都因只看类型而丢失） */
const OP_BY_TYPE = {
  "enum-one": ["eq", "ne"], "enum-multi": ["in", "notin"], "enum-order": ["eq", "ne", "gte", "lte", "between"],
  "org": ["in", "notin"], "ip": ["in", "notin"], "list": ["in", "notin"], "bool": ["eq", "ne"], "time": ["in", "notin"],
  "ref-search": ["eq", "ne", "in"], "os-ver": ["eq"], "composite-soft": ["sw"],
};
const opsOf = a => (a && a.ops && a.ops.length) ? a.ops.slice() : (a ? (OP_BY_TYPE[a.type] || ["eq"]) : []);
/* q 能力位决定条件行是否出现「任一命中 / 全部具备」开关：
   none = 属性本身单值或运算符已表达（如「包含」「全部具备」），不渲染；
   any  = 多值但锁定「任一命中」（同时刻取值唯一，「全部具备」无业务含义）；
   both = 两态可切。
   注意：any 只约束「判定语义」，不约束「能不能给多值」——值域 ≥ 3 的互斥枚举一律给多值，
   因为 ∈ {A} 是白名单（取值域新增档位时默认拒绝）、≠ A 是排除法（新增档位时默认放行），二者不等价 */
function anyAllHTML(c, a) {
  const qq = (a && a.q) || "both";
  if (qq === "none") return "";
  const lock = qq === "any";
  return `<div class="anyall"><button class="${(c.q || "any") === "any" ? "on" : ""}" data-act="dsQ" data-uid="${c.uid}" data-v="any">任一命中</button><button class="${c.q === "all" ? "on" : ""}" ${lock ? `disabled title="本属性锁定「任一命中」：多取值按「任一命中」判定（白名单写法），「全部具备」在本属性上无对应业务含义"` : ""} data-act="dsQ" data-uid="${c.uid}" data-v="all">全部具备</button></div>`;
}
/* 去重保序（列表型属性「去重后生效」） */
const uniqKeep = arr => { const seen = new Set(); return arr.filter(x => (seen.has(x) ? false : (seen.add(x), true))); };
/* 时间窗口的日期基准：preset 为「日历引用」语义——法定工作日 / 法定节假日由平台按国务院办公厅
   年度放假安排（含调休）判定，不由星期集合展开；只有自定义档才落到逐星期勾选。
   days 取值 1~7 = 周一~周日；months 取值 1~12，空数组 = 全年。 */
const TIME_PRESETS = [["daily", "每天"], ["workday", "法定工作日"], ["holiday", "法定节假日"], ["custom", "自定义"]];
function normTime(v) {
  const t = (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
  return {
    preset: t.preset || ((t.days || []).length ? "custom" : "workday"),
    days: Array.isArray(t.days) ? t.days.slice() : [],
    months: Array.isArray(t.months) ? t.months.slice() : [],
    from: t.from || "09:00", to: t.to || "18:00", tz: t.tz || "Asia/Shanghai",
  };
}
function timeDayText(t) {
  if (t.preset === "daily") return "每天";
  if (t.preset === "workday") return "法定工作日";
  if (t.preset === "holiday") return "法定节假日";
  const D = ["", "一", "二", "三", "四", "五", "六", "日"];
  const ds = t.days.slice().sort((x, y) => x - y);
  if (ds.join(",") === "1,2,3,4,5") return "周一至周五";
  if (ds.join(",") === "6,7") return "周六、周日";
  return ds.length ? ds.map(d => "周" + D[d]).join("、") : "（未选日期）";
}
const timeMonText = t => (t.months.length ? `，限 ${t.months.slice().sort((x, y) => x - y).join("、")} 月` : "");
/* 取值形态内联校验（§8.6）：格式类为错误级（阻断保存），语义类为警告级 */
const RE_IP4 = /^(\d{1,3})(\.\d{1,3}){3}$/;
const okIp4 = s => RE_IP4.test(s) && s.split(".").every(o => +o <= 255);
const ipNum = s => s.split(".").reduce((n, o) => n * 256 + (+o), 0);
/* CIDR / 起止范围用**非捕获重复组**，保证组 1 / 组 2 分别是完整地址与后缀——
   捕获重复组 ((\.\d{1,3}){3}) 会额外占一个捕获组号，使右侧 IP 落到组 3 而非组 2，
   且区间判定若仍按旧组号取 mr[3] 会恒得 undefined —— 即合法范围被误判非法 */
const RE_CIDR = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/;
const RE_RANGE = /^(\d{1,3}(?:\.\d{1,3}){3})\s*-\s*(\d{1,3}(?:\.\d{1,3}){3})$/;
/* 单个取值合法：单 IPv4 ／ CIDR（前缀 0~32）／ 起止范围（两端均为合法 IPv4 且上限不低于下限） */
function okIpItem(x) {
  if (okIp4(x)) return true;
  const mc = x.match(RE_CIDR);
  if (mc) return okIp4(x.split("/")[0]) && +mc[2] <= 32;
  const mr = x.match(RE_RANGE);
  if (mr) return okIp4(mr[1]) && okIp4(mr[2]) && ipNum(mr[1]) <= ipNum(mr[2]);
  return false;
}
function valIssue(a, n) {
  if (!a) return null;
  if (a.type === "ip") {
    const bad = (Array.isArray(n.v) ? n.v : []).filter(x => !okIpItem(x));
    if (bad.length) return { level: "err", text: `「${a.label}」取值非法：${bad.join("、")}——支持单个 IPv4 / CIDR 网段（前缀 0~32）/ 起止范围（上限不低于下限），多个用逗号分隔` };
  }
  if (a.type === "time") {
    const t = normTime(n.v), re = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!re.test(t.from) || !re.test(t.to)) return { level: "err", text: `「${a.label}」时段须为 HH:mm（24 小时制）` };
    if (t.preset === "custom" && !t.days.length) return { level: "err", text: `「${a.label}」日期基准为「自定义」但未勾选任何星期：空窗口永不命中` };
    if (t.from === t.to) return { level: "warn", text: `「${a.label}」起始与结束时间相同（${t.from}）：窗口为零长，请确认` };
    if (t.from > t.to) return { level: "warn", text: `「${a.label}」起始时间晚于结束时间（${t.from}–${t.to}）：将按跨零点窗口解释，请确认` };
  }
  if (a.type === "enum-order" && n.op === "between") {
    const pool = VALUE_POOL[n.attr] || [];
    const b1 = Array.isArray(n.v) ? n.v[0] : n.v, b2 = Array.isArray(n.v) ? n.v[1] : "";
    if (!b1 || !b2) return { level: "err", text: `「${a.label}」区间条件需给出上下两端（当前缺${b1 ? "下限" : "上限"}）` };
    const i1 = pool.indexOf(b1), i2 = pool.indexOf(b2);
    if (i1 >= 0 && i2 >= 0 && i1 > i2) return { level: "err", text: `「${a.label}」区间上下限颠倒：${b1} 高于 ${b2}` };
    if (i1 >= 0 && i1 === i2) return { level: "warn", text: `「${a.label}」区间上下限相同（${b1}）：条件退化为等值，建议改用等号比较` };
  }
  /* 软件版本只有单个版本取值控件，区间第二端无处落值——历史数据若带 between 一律阻断 */
  if (a.type === "composite-soft" && n.v && n.v.verOp === "between") return { level: "err", text: `「${a.label}」软件版本不支持区间比较：请改用 ≥ / ≤ / = / ≠` };
  if (a.type === "list" && Array.isArray(n.v) && n.v.length > 500) return { level: "err", text: `「${a.label}」最多 500 条（当前 ${n.v.length} 条）` };
  return null;
}

/* ===== 资产数据（与《原型-资产管理-20260907.html》同源） =====
   本原型新增字段：
     modes  接入方式登记（agentless 无端 / agent 有端）—— 决定页 A 形态组的显隐（§2.1、D12）
     anon   "asset" = 整资产匿名型（§2.2）；未设 = 普通资产
     net    有端网络层准入摘要（socks5 目标白名单，SG-PROXY-01/02）
     pol    准入策略：{ agentless:[…], agent:[…] }
   ========================================================================== */

/* ===== mock 数据打通：安全策略模块直接复用宿主（资产管理）的 ASSETS 同一份数据对象 =====
   a19 / a20 为演示新增资产，已并入宿主资产数据区；接入形态 / 网络层准入 / 整资产匿名
   为安全策略侧扩展字段，由下表注入（页面深化设计方案 §2.1 / §2.2 演示口径）。 */
const MODE_SEED = {
  a1:  { modes: ["agentless", "agent"], net: { rules: 12, proto: "仅 CONNECT" } },
  a2:  { modes: ["agentless", "agent"], net: { rules: 8,  proto: "仅 CONNECT" } },
  a3:  { modes: ["agent"], net: { rules: 4,  proto: "仅 CONNECT", wl: ["10.20.5.8:5432", "10.20.5.9:9200"] } },
  a4:  { modes: ["agentless", "agent"], net: { rules: 6,  proto: "仅 CONNECT" } },
  a5:  { modes: ["agentless", "agent"], net: { rules: 4,  proto: "仅 CONNECT" } },
  a6:  { modes: ["agentless", "agent"], net: { rules: 2,  proto: "仅 CONNECT" } },
  a7:  { modes: ["agent"], net: { rules: 16, proto: "仅 CONNECT", wl: ["10.10.1.20:22"] } },
  a8:  { modes: ["agent"], net: { rules: 3,  proto: "仅 CONNECT", wl: ["10.20.3.11", "10.20.3.11:990"] } },
  a9:  { modes: ["agentless", "agent"], net: { rules: 6,  proto: "仅 CONNECT" } },
  a10: { modes: ["agentless", "agent"], net: { rules: 3,  proto: "仅 CONNECT" } },
  a11: { modes: ["agent"], net: { rules: 5,  proto: "仅 CONNECT", wl: ["10.10.3.5:3389"] } },
  /* a12 仅登记条数、未登记目标明细：用于演示「无明细 → 警告级提示、不阻断」分支 */
  a12: { modes: ["agent"], net: { rules: 2,  proto: "仅 CONNECT" } },
  a13: { modes: ["agentless", "agent"], net: { rules: 2,  proto: "仅 CONNECT" } },
  a15: { modes: ["agentless", "agent"], net: { rules: 5,  proto: "仅 CONNECT" } },
  a19: { modes: ["agentless"], anon: "asset" },   /* 整资产匿名资产不支持有端接入 */
  a20: { modes: ["agent"], net: { rules: 16, proto: "仅 CONNECT · 目标白名单" } },
};
ASSETS.forEach(a => {
  const s = MODE_SEED[a.id];
  if (s) Object.assign(a, s);
  if (a.ext === undefined) { const m = (a.res || []).find(r => r.main) || (a.res || [])[0]; a.ext = (m && m.ext) || "-"; }
});

/* ------------------------------------------------------------------
   访问控制模式由「资源协议」决定，不由资产类型决定（§10.1 / C15）
   resModel：l7 / terminal / db / file / tcp —— 协议为主键，资产类型仅作兜底
   ================================================================== */
const L7_PROTOS = ["HTTP", "HTTPS", "HTTP/2", "HTTP2", "WS", "WSS", "WebSocket", "gRPC", "GRPC"];
const PROTO_FAM = {
  HTTP: "l7", HTTPS: "l7", "HTTP/2": "l7", HTTP2: "l7", WS: "l7", WSS: "l7", gRPC: "l7", GRPC: "l7", WebSocket: "l7",
  RDP: "terminal", SSH: "terminal", VNC: "terminal", Telnet: "terminal",
  PostgreSQL: "db", MySQL: "db", Redis: "db", Oracle: "db", MongoDB: "db", TDS: "db", "SQL Server": "db", Elasticsearch: "db",
  FTP: "file", FTPS: "file", SFTP: "file", SCP: "file", SMB: "file", NFS: "file",
  MQTT: "tcp", AMQP: "tcp", Kafka: "tcp", "自定义 TCP": "tcp"
};
const TYPE_FAM = { "远程主机": "terminal", "数据库": "db", "文件服务": "file" };
const FAM_LABEL = { l7: "L7 资源", terminal: "运维会话", db: "数据库对象", file: "共享与目录", tcp: "目标地址" };
function pathProto(a, p) { return p.proto || (L7_PROTOS.indexOf(a.addrProto) >= 0 ? a.addrProto : "HTTPS"); }
function resModel(a) {
  const res = a.res || [];
  /* 主承载优先：连接实例类资源（后端服务资源形态，带 host）的协议决定资产主族；
     内嵌的 Web 管理界面（Kibana / pgAdmin / RedisInsight 类「管理控制台」）为附属入口，不改变主族，
     其自身仍按 l7 族承载（页 A 详情的细粒度清单）。仅当资产全部资源均为 L7 时，族才为 l7。 */
  const back = res.filter(r => r && r.host);
  if (back.length) {
    return back.map(r => PROTO_FAM[r.proto] || PROTO_FAM[a.addrProto] || TYPE_FAM[a.type] || "tcp")
               .filter((f, i, arr) => arr.indexOf(f) === i)[0];
  }
  const hasL7 = res.some(r => (r.paths || []).some(p => L7_PROTOS.indexOf(pathProto(a, p)) >= 0));
  if (hasL7) return "l7";
  return PROTO_FAM[a.addrProto] || TYPE_FAM[a.type] || "tcp";
}
const WEB = a => resModel(a) === "l7";   /* 保留原名，语义已改为「按协议判定为 L7 族」 */
const MODE_LABEL = { agentless: "无端接入", agent: "有端接入" };
const hasMode = (a, m) => (a.modes || []).includes(m);
const modeText = a => (a.modes || []).length === 2 ? "双形态" : MODE_LABEL[(a.modes || [])[0]] || "—";

/* ===== 非 L7 族的资源对象 = 后端服务资源登记（只读引用） =====
   对象面与登记面**同源**：矩阵里的每个对象都来自资产详情「资源与访问」登记的后端服务资源
   （a.res），对象 id 直接沿用资源 id——增删登记条目即增删矩阵对象，页 B 不另存一套对象表，
   也无需在新增资源类型时手工同步。风险、协议、目标、共享目录均由登记字段派生或聚合。
   档位链：目标级为各族兜底档；应用级档位（账号级 / 命令级 / 表级 / 目录级）需协议解析能力
   接入（§10.1 D17/D18）——未启用的档位以**置灰可见**方式占位，不隐藏维度。 */
const OBJ_KIND = {
  "数据库实例": "实例", "NoSQL 实例": "实例", "消息与队列": "目标", "客户端通道": "目标",
  "终端会话": "主机", "远程桌面会话": "主机", "虚拟通道": "虚拟通道",
  "文件共享": "共享", "文件传输会话": "文件通道",
};
/* 各族档位链：当前档位 / 待启用档位 / 待启用档位下的维度（列组随族切换） */
const TIER_CHAIN = {
  db:       { tier: "目标级", next: "库 / 表级（待数据库协议解析接入）", dims: ["库", "数据对象", "语句类别"] },
  terminal: { tier: "目标级", next: "登录账号 / 命令级（待协议审计代理接入）", dims: ["账号", "命令集", "会话动作"] },
  file:     { tier: "目标级", next: "共享 / 目录级（待文件协议解析接入）", dims: ["目录", "读写动作"] },
  tcp:      { tier: "目标级", next: "—（该族以目标级为终态）", dims: [] },
  l7:       { tier: "对象级", next: "—", dims: [] },
};
const tierOf = fam => TIER_CHAIN[fam] || TIER_CHAIN.tcp;
const famTier = a => tierOf(resModel(a)).tier;
const famNext = a => tierOf(resModel(a)).next;
/* 资源登记 → 矩阵对象：仅「非 L7 承载」的登记条目成为对象；
   带路径的登记条目属附属 L7 入口，自身按 l7 承载（见 famL7Section），不计入本族对象面 */
function famObjs(a) {
  return (a.res || []).filter(r => !(r.paths || []).length).map(r => {
    const target = r.host ? (r.host + (r.port ? ":" + r.port : "")) : ((r.nodes || [])[0] || "");
    const d = [r.proto, target, r.path ? "路径 " + r.path : ""].filter(Boolean).join(" · ");
    return { id: r.id, k: OBJ_KIND[r.kind] || "对象", n: r.name, d,
      proto: r.proto || "", target: target || "—", share: r.path || "—", relay: r.relay || null, res: r };
  });
}
/* 附属 L7 入口：资产主族为非 L7，但其登记资源内含 L7 承载入口（如数据库资产上的管理控制台） */
const famL7Res = a => (a.res || []).filter(r => (r.paths || []).length);
const famReq = (a, o) => ((a._frq || {})[o.id]) || { kind: "none" };
const famConf = a => famObjs(a).filter(o => famReq(a, o).kind !== "none").length;
function famByKey(key) {
  const [, aid, oid] = key.split("|");
  const a = byId(aid); if (!a) return null;
  const o = famObjs(a).find(x => x.id === oid); if (!o) return null;
  return { a, o };
}
/* 族列组（§10.1）：dim=1 的列属**待启用档位**维度，以置灰可见占位并注明启用前提 */
const FAM_COLS = {
  terminal: [{ t: "协议", f: o => o.proto }, { t: "目标", f: o => o.target }, { t: "账号", dim: 1 }, { t: "命令集", dim: 1 }, { t: "会话动作", dim: 1 }],
  db: [{ t: "库", dim: 1 }, { t: "数据对象", dim: 1 }, { t: "语句类别", dim: 1 }],
  file: [{ t: "协议", f: o => o.proto }, { t: "共享", f: o => o.share }, { t: "目录", dim: 1 }, { t: "读写动作", dim: 1 }],
  tcp: [{ t: "协议", f: o => o.proto }, { t: "目标", f: o => o.target }],
};
const famCols = fam => FAM_COLS[fam] || FAM_COLS.tcp;
/* 资产开通状态与资源级配置解耦：未开通资产可提前配置（当前无流量），页头显式标注生效时点 */
function openHint(a) {
  const st = a.open || "未开通";
  if (st === "已开通") return "";
  const map = {
    "未开通": "资产未开通无端访问：本页配置可提前完成，开通后自动生效（当前无流量经过本资产）。",
    "开通中": "资产正在开通中：配置将在开通完成后生效。",
    "撤销中": "资产正在撤销开通：存量连接按排空策略结束，新增配置暂不生效。",
    "异常": "资产无端访问处于异常状态：配置在异常处置完成、访问恢复后生效。",
  };
  return `<div class="hint-row warn"><i class="ic">未生效</i><div><b>开通状态：${esc(st)}</b> · ${map[st] || map["未开通"]}</div></div>`;
}
const chkHTML = (key, label) => `<input type="checkbox" data-act="fgChk" value="${esc(key)}" ${FG.sel.has(key) ? "checked" : ""} aria-label="${esc(label)}">`;
/* 批量作用面 = 本页勾选的条目（与页 A D20 同口径）：勾选、计数、作用对象在同一屏内自证 */
function fgBatchAvail(a) {
  const ro = !!a && a.anon === "asset";
  const famScope = !!a && !WEB(a);
  /* 单位随**选中项粒度**走，不随资产族走（见 fgSelKind） */
  const kind = fgSelKind() || (famScope ? "fam" : "path");
  const unit = kind === "fam" ? "个对象" : "条路径";
  const n = FG.sel.size;
  const clearN = [...FG.sel].filter(k => { const e = fgEntryOf(k); return e && e.kind !== "none"; }).length;
  const why = ro ? "该资产整资产匿名开放：资源级授权转只读，请先关闭匿名声明"
    : !n ? `未勾选${kind === "fam" ? "对象" : "路径"}：勾选后再批量设置或清除`
      : `作用面 = 本页已勾选的 ${n} ${unit}（不含未勾选与筛选外的条目）`;
  return { n, clearN, set: { ok: !ro && n > 0, why },
    clear: { ok: !ro && clearN > 0, why: clearN > 0 ? `清除所选 ${clearN} ${unit}的访问要求（回到默认拒绝）` : "所选条目均为未配置（默认拒绝），无需清除" } };
}
/* 对象可达性：登记目标是否落在网络层 socks5 目标白名单**明细**内。
   缺明细（只登记条数）或未登记网络层时无法判定 → 返回 true，交由警告分支处置 */
function famReachable(net, o) {
  const wl = (net && net.wl) || [];
  if (!wl.length) return true;
  const host = (o.res || {}).host || "", port = (o.res || {}).port || "";
  return wl.some(x => x === o.target || x === host || (host && x === host + ":" + port));
}
function fgEntryOf(key) {
  if (String(key).indexOf("fam|") === 0) { const h = famByKey(key); return h ? { kind: famReq(h.a, h.o).kind } : null; }
  const h = pathByKey(key); return h ? { kind: reqOf(h.pt).kind } : null;
}
/* 每个批量作用面必须**同粒度**：非 L7 族视图同屏并存「族对象」与「附属 L7 作用对象」两种粒度，
   混选会让「要求形态」的形态限定与保存侧的可达面校验只看首条键——「显式公开」的 L1+HTTP 限定
   （canAnonPublic）与 socks5 目标白名单校验（reqSave）都会被绕过。故跨粒度勾选即先清空再选。 */
function fgSelKind() { const k = [...FG.sel][0]; return k ? (String(k).indexOf("fam|") === 0 ? "fam" : "path") : ""; }
function fgSelClear() {
  FG.sel.clear();
  $$('#pg-fg input[data-act="fgChk"]').forEach(c => { c.checked = false; });
  $$("#pg-fg tbody tr[data-key]").forEach(tr => tr.classList.remove("sel"));
}
/* 行勾选就地同步「每张表各自的全选框 / 已选计数 / 批量按钮可用性」，避免整表重渲染导致滚动跳动 */
function syncFgSel() {
  /* 全选与勾选态**限定所在表**：非 L7 族视图同屏有两张表（资源级矩阵 / 附属 L7 入口），
     各自独立分页——跨表「全选本页」会把另一张表、乃至其未显示的页一并勾上。 */
  $$("#pg-fg table").forEach(tb => {
    const rows = Array.from(tb.querySelectorAll("tbody tr[data-key]"));
    const box = tb.querySelector('thead input[data-act="fgChkAll"]');
    if (!box || !rows.length) return;
    const onPage = rows.filter(tr => FG.sel.has(tr.dataset.key)).length;
    const full = onPage === rows.length;
    box.checked = full;
    box.indeterminate = onPage > 0 && onPage < rows.length;
    box.title = full ? "取消全选本页" : "全选本页";
  });
  const a = byId(FG.cur), BA = fgBatchAvail(a);
  const cnt = $("#fgSelCnt");
  const k0 = fgSelKind() || (a && !WEB(a) ? "fam" : "path");
  if (cnt) cnt.innerHTML = FG.sel.size
    ? `已选 <b>${FG.sel.size}</b> ${k0 === "fam" ? "个对象" : "条路径"}`
    : `未勾选${k0 === "fam" ? "对象" : "路径"}`;
  $$("#pg-fg [data-act='fgBatchSet']").forEach(b => { b.disabled = !BA.set.ok; b.title = BA.set.why; });
  $$("#pg-fg [data-act='fgBatchClear']").forEach(b => { b.disabled = !BA.clear.ok; b.title = BA.clear.why; });
}

/* ===== 准入策略演示数据（页 A） =====
   cond 组树节点：{t:"g", op:"and"|"or"|"not", ch:[…]} ｜ {t:"c", attr, op, v, inc, mode:"const"|"ref", ref}
   ========================================================================== */
let POL_SEQ = 100;
const nid = () => "n" + (++POL_SEQ);

function mkPolicies() {
  return {
    a1: {
      agentless: [
        { id: "asp-a1-1", name: "电子银行部办公网准入", action: "allow", on: true, by: "张伟", at: "2026-09-06 10:12", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_ebank"], inc: true, mode: "const" },
            { t: "c", attr: "env.ip", op: "in", v: ["10.20.0.0/16"], mode: "const" },
            { t: "c", attr: "env.time", op: "in", v: { preset: "workday", days: [1, 2, 3, 4, 5], months: [], from: "08:30", to: "19:00", tz: "Asia/Shanghai" }, mode: "const" } ] } },
        { id: "asp-a1-2", name: "非工作时间访问需追加认证", action: "allow", on: true, by: "张伟", at: "2026-09-06 10:20", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_ebank"], inc: true, mode: "const" },
            { t: "c", attr: "env.time", op: "notin", v: { preset: "workday", days: [1, 2, 3, 4, 5], months: [], from: "08:30", to: "19:00", tz: "Asia/Shanghai" }, mode: "const" },
            { t: "c", attr: "auth.level", op: "gte", v: "3 级", mode: "const" } ] } },
      ],
      agent: [
        { id: "asp-a1-3", name: "研发平台准入（示例 §8.11）", action: "allow", on: true, by: "张伟", at: "2026-09-08 09:40", cond:
          { t: "g", op: "and", ch: [
            { t: "g", op: "or", ch: [
              { t: "c", attr: "user.org", op: "in", v: ["org_tech"], inc: true, mode: "const" },
              { t: "c", attr: "user.role", op: "contains", v: ["运维管理员"], q: "any", mode: "const" } ] },
            { t: "c", attr: "client.software", v: { sw: "sw_bz", verOp: "gte", ver: "2.3.0" }, mode: "const" },
            { t: "c", attr: "device.os", op: "eq", v: { os: "Windows", verOp: "gte", ver: "10" }, mode: "const" },
            { t: "g", op: "or", ch: [
              { t: "c", attr: "env.ip", op: "in", v: ["10.20.0.0/16"], mode: "const" },
              { t: "c", attr: "env.nettype", op: "in", v: ["VPN"], mode: "const" } ] } ] } } ],
    },
    a2: {
      agentless: [
        { id: "asp-a2-1", name: "信贷部内网准入", action: "allow", on: true, by: "王芳", at: "2026-09-05 15:02", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_loan"], inc: true, mode: "const" },
            { t: "c", attr: "env.zone", op: "in", v: ["办公网", "管理网"], mode: "const" } ] } },
      ],
      agent: [
        { id: "asp-a2-2", name: "审批终端准入（设备—人员绑定）", action: "allow", on: true, by: "王芳", at: "2026-09-05 15:20", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_loan"], inc: true, mode: "const" },
            { t: "c", attr: "device.owner", op: "eq", ref: "user.account", mode: "ref" },
            { t: "c", attr: "device.reg", op: "eq", v: "已注册", mode: "const" },
            { t: "c", attr: "device.revoked", op: "eq", v: "正常", mode: "const" } ] } },
        { id: "asp-a2-3", name: "外协人员终端需硬件级认证方式", action: "allow", on: false, by: "王芳", at: "2026-09-04 11:08", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.tag", op: "contains", v: ["外协人员"], q: "any", mode: "const" },
            { t: "c", attr: "auth.method", op: "in", v: ["指纹识别", "USB Key 硬件令牌"], q: "any", mode: "const" },
            { t: "c", attr: "auth.composite", op: "gte", v: "2", mode: "const" } ] } },
      ],
    },
    a3: {
      /* 未开通资产同样可预置策略：开通后即生效，本页统计与动作分布同步计入 */
      agent: [
        { id: "asp-a3-1", name: "数据管理部运维网段准入", action: "allow", on: true, by: "赵磊", at: "2026-09-10 10:26", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_data"], inc: true, mode: "const" },
            { t: "c", attr: "env.ip", op: "in", v: ["10.20.5.0/24"], mode: "const" } ] } },
        { id: "asp-a3-2", name: "非授信网段访问拒绝", action: "reject", on: false, by: "赵磊", at: "2026-09-10 10:31", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "env.ip", op: "notin", v: ["10.20.5.0/24"], mode: "const" } ] } },
      ],
    },
    a4: {
      agentless: [
        { id: "asp-a4-1", name: "综合管理部准入", action: "allow", on: true, by: "孙悦", at: "2026-09-06 09:12", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_admin"], inc: true, mode: "const" },
            { t: "c", attr: "user.state", op: "in", v: ["在职"], mode: "const" } ] } },
      ],
    },
    a6: {
      agentless: [
        { id: "asp-a6-1", name: "合规部与报送专线准入", action: "allow", on: true, by: "吴敏", at: "2026-09-05 16:40", cond:
          { t: "g", op: "or", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_comp"], inc: true, mode: "const" },
            { t: "c", attr: "env.nettype", op: "in", v: ["专线"], mode: "const" } ] } },
      ],
      agent: [
        { id: "asp-a6-2", name: "报送终端准入", action: "allow", on: true, by: "吴敏", at: "2026-09-05 16:52", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_comp"], inc: true, mode: "const" },
            { t: "c", attr: "device.org", op: "in", v: ["org_comp"], inc: true, mode: "const" } ] } },
      ],
    },
    a9: {
      agentless: [
        { id: "asp-a9-1", name: "手机银行后台运维准入", action: "allow", on: true, by: "陈静", at: "2026-09-06 11:30", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.role", op: "contains", v: ["运维管理员"], q: "any", mode: "const" },
            { t: "c", attr: "env.ip", op: "in", v: ["10.20.0.0/16"], mode: "const" } ] } },
      ],
    },
    a13: {
      /* 未开通 + 双形态：两个策略组各自独立配置与计数 */
      agentless: [
        { id: "asp-a13-1", name: "合规部与报送专线准入", action: "allow", on: true, by: "吴敏", at: "2026-09-10 09:48", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_comp"], inc: true, mode: "const" } ] } },
      ],
      agent: [
        { id: "asp-a13-2", name: "报送终端准入（设备归属校验）", action: "allow", on: true, by: "吴敏", at: "2026-09-10 09:55", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_comp"], inc: true, mode: "const" },
            { t: "c", attr: "device.org", op: "in", v: ["org_comp"], inc: true, mode: "const" } ] } },
      ],
    },
    a10: { agentless: [] },
    a20: {
      agent: [
        { id: "asp-a20-1", name: "堡垒机运维终端准入", action: "allow", on: true, by: "郑浩", at: "2026-09-08 14:05", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_tech"], inc: true, mode: "const" },
            { t: "c", attr: "user.role", op: "contains", v: ["运维管理员", "审计员"], q: "any", mode: "const" },
            { t: "c", attr: "client.software", v: { sw: "sw_bz", verOp: "gte", ver: "2.4.1" }, mode: "const" },
            { t: "c", attr: "device.serial", op: "in", v: ["SN-2026-0001", "SN-2026-0002"], mode: "const" } ] } },
        { id: "asp-a20-2", name: "非运维网段访问拒绝", action: "reject", on: true, by: "郑浩", at: "2026-09-08 14:12", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "env.ip", op: "notin", v: ["10.10.0.0/16"], mode: "const" } ] } },
      ],
    },
  };
}
const POLICIES = mkPolicies();
function polOf(id, mode) { POLICIES[id] = POLICIES[id] || {}; return POLICIES[id][mode] || (POLICIES[id][mode] = []); }

/* ===== 页 B：路径访问要求（由既有 req 文本解析为结构化，保持与精简版数据同源） ===== */
/* 条件文本解析（属性字典驱动）
   历史缺陷：只识别 9 个属性，其余一律降级为 user.dept，与「文本 ↔ 结构双向映射以回读全名为准」冲突。
   现改为——① 候选名 = 回读全名 + 简洁名 + 历史短名，按长度降序做前缀最长匹配（保证「用户账号状态」先于「用户账号」命中）；
   ② 运算符按「长优先」匹配；③ 值按属性类型还原（数组 / 区间两端 / 时间对象 / 标量 / 同源比较）。 */
const PARSE_ALIAS = {
  "user.org": ["组织"], "user.dept": ["所属部门"], "user.rank": ["职级"],
  "user.tag": ["标签"], "user.role": ["角色"], "user.state": ["账号状态"], "env.time": ["时间"],
};
const COND_PARSE_CANDS = (() => {
  const out = [];
  ATTR_DICT.forEach(a => {
    [attrFullLabel(a.id), a.label].concat(PARSE_ALIAS[a.id] || []).forEach(lb => {
      if (lb && !out.some(x => x.lb === lb && x.id === a.id)) out.push({ id: a.id, lb });
    });
  });
  return out.sort((x, y) => y.lb.length - x.lb.length);
})();
const COND_PARSE_OPS = [
  ["不属于", "notin"], ["不包含", "notcontains"], ["不等于", "ne"],
  ["全部具备", "allof"], ["任一命中", "anyof"],
  ["属于", "in"], ["包含", "contains"], ["∋", "contains"], ["∈", "in"],
  ["≥", "gte"], [">=", "gte"], ["≤", "lte"], ["<=", "lte"], ["=", "eq"], ["≠", "ne"],
];
/* 运算符归一：历史文本（含页 B 早期「=」写法）反解出的运算符可能不在属性 ops 内
   （如 user.org 的「=」→ eq，而该属性只接受 属于 / 不属于）。按属性 ops 归一到等价项，
   避免出现「重开编辑器后运算符下拉为空、校验又不拦」的不一致状态。 */
const OP_EQUIV = { eq: ["in"], ne: ["notin"], in: ["eq"], notin: ["ne"], contains: ["in"], notcontains: ["notin"], allof: ["anyof"], anyof: ["allof"] };
function normOp(attrId, op) {
  const a = attrById(attrId); if (!a) return op;
  const ops = opsOf(a);
  if (ops.includes(op)) return op;
  for (const alt of (OP_EQUIV[op] || [])) if (ops.includes(alt)) return alt;
  return ops[0] || op;
}
const SCALAR_TYPES = ["enum-one", "bool"];
const ARRAY_TYPES = ["org", "enum-multi", "list", "ip", "ref-search"];
function parseCondSeg(seg) {
  const hit = COND_PARSE_CANDS.find(x => seg.indexOf(x.lb) === 0);
  if (!hit) return null;
  const a = attrById(hit.id);
  let rest = seg.slice(hit.lb.length).trim();
  /* 同源比较：<属性> = <另一属性>（同源比较） */
  let m = rest.match(/^=\s*(.+?)\s*（同源比较）$/);
  if (m) {
    const r = COND_PARSE_CANDS.find(x => x.lb === m[1].trim());
    return { t: "c", attr: hit.id, op: "eq", v: null, mode: "ref", ref: r ? r.id : "" };
  }
  /* 时间窗口：<属性> 在 / 不在 <日子> HH:mm–HH:mm（时区） */
  if (a.type === "time") {
    const tm = rest.match(/^(在|不在)\s*(.+?)\s+(\d{2}:\d{2})[–\-](\d{2}:\d{2})（(.+?)）(?:，限 (.+?) 月)?$/);
    if (tm) {
      const DW = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7 };
      const dt = tm[2];
      let preset = "custom", days = [];
      if (dt === "每天") preset = "daily";
      else if (dt === "法定工作日" || dt === "工作日") preset = "workday";
      else if (dt === "法定节假日") preset = "holiday";
      else if (dt === "周一至周五") days = [1, 2, 3, 4, 5];
      else if (dt === "周六、周日") days = [6, 7];
      else days = dt.split("、").map(s => DW[s.replace("周", "")]).filter(d => d !== undefined);
      const months = tm[6] ? tm[6].split("、").map(x => +x).filter(x => x >= 1 && x <= 12) : [];
      return { t: "c", attr: hit.id, op: tm[1] === "不在" ? "notin" : "in", v: { preset, days, months, from: tm[3], to: tm[4], tz: tm[5] }, mode: "const" };
    }
  }
  /* 区间：<属性> 在 A 到 B 之间 */
  if ((m = rest.match(/^在\s*(.+?)\s*到\s*(.+?)\s*之间$/)))
    return { t: "c", attr: hit.id, op: "between", v: [m[1].trim(), m[2].trim()], mode: "const" };
  const oh = COND_PARSE_OPS.find(o => rest.indexOf(o[0]) === 0);
  if (!oh) return null;
  const op = oh[1];
  let body = rest.slice(oh[0].length).trim();
  /* 后缀剥离与出现顺序无关：组织型条件同时带「全部具备」时，回读文本为
     「…（含子组织）（全部具备）」。历史实现按固定顺序各剥一次，前一个后缀会残留并
     被并入取值 → 文本↔结构往返丢 inc / q。两轮剥离即可覆盖任意顺序。 */
  let inc = false, q = "any";
  for (let pass = 0; pass < 2; pass++) {
    if (/（含子组织）$/.test(body)) { inc = true; body = body.replace(/（含子组织）$/, "").trim(); }
    if (/（全部具备）$/.test(body)) { q = "all"; body = body.replace(/（全部具备）$/, "").trim(); }
  }
  const base = { t: "c", attr: hit.id, op: normOp(hit.id, op), mode: "const" };
  if (SCALAR_TYPES.includes(a.type)) return Object.assign(base, { v: body });
  if (a.type === "composite-soft") { const sw = SOFT_LIB.find(s => s.name === body); return Object.assign(base, { op: "sw", v: { sw: sw ? sw.id : "", verOp: "", ver: "" } }); }
  if (a.type === "os-ver") {
    const vm = body.match(/^(.*?)（版本\s*(>=|<=|≥|≤|=|≠)?\s*(.+?)）$/);
    const VOP = { ">=": "gte", "≥": "gte", "<=": "lte", "≤": "lte", "=": "eq", "≠": "ne" };
    return Object.assign(base, { op: "eq", v: vm ? { os: vm[1].trim(), verOp: VOP[vm[2]] || "gte", ver: vm[3].trim() } : { os: body, verOp: "", ver: "" } });
  }
  if (a.type === "enum-order") return Object.assign(base, { v: body.replace(/\s*种方式叠加$/, "").trim() });
  if (ARRAY_TYPES.includes(a.type)) return Object.assign(base, { v: body.split("、").map(s => s.trim()).filter(Boolean).map(x => hit.id === "user.org" || hit.id === "device.org" ? orgIdOf(x) : x), inc, q });
  return Object.assign(base, { v: body });
}
function parseCond(text) {
  const parts = String(text).split(" 且 ");
  const ch = parts.map(seg => parseCondSeg(seg.trim()))
    /* 无法识别的片段：保留原文、不猜测语义。历史做法把整段塞进「用户部门 属于 …」，
       等于静默改写授权语义；现在原样回读 + 校验报错（fail-closed，需人工确认）。 */
    .map((n, i) => n || { t: "c", attr: "", op: "", v: "", mode: "const", _raw: parts[i].trim() });
  return { t: "g", op: "and", ch };
}
function orgIdOf(name) { const h = ORG_FLAT.find(o => o.name === name || o.name.indexOf(name) >= 0); return h ? h.id : "org_ebank"; }
function reqOf(pt) {
  if (pt._rq) return pt._rq;
  let t = pt.req || "";
  /* 旧数据兼容：历史展示文本以「｜认证要求：…」标记承载认证要求；本轮已把认证要求收敛为
     条件组内的认证维度条件行，故把旧段转成条件文本并入条件解析——不保留独立字段 */
  const am = t.match(/｜认证要求：(.+)$/);
  if (am) {
    const seg = authSegToCondText(am[1]);
    t = (t.slice(0, am.index).trim() + (seg ? " 且 " + seg : "")).trim();
  }
  if (!t) pt._rq = { kind: "none" };
  else if (t.indexOf("显式公开") >= 0) pt._rq = { kind: "public" };
  else if (t.indexOf("登录即可") >= 0) pt._rq = { kind: "login" };
  else pt._rq = { kind: "attr", cond: parseCond(t), by: "张伟", at: "2026-09-05 10:00" };
  return pt._rq;
}
/* 结构化访问要求 → 清单 req 展示文本（页 B 保存后回写，与资产详情 T3 同源）
   单一文本格式：清单展示、保存回写、资产详情 T3 与设计器回读全部走同一条自然语言链路。
   历史实现另有一套「用户部门=X」的紧凑写法（oneReqSeg），反解得到的运算符落在属性 ops 之外，
   且与同屏展示的 condText 不一致——两套格式已合并。 */
function rqTextOf(R) {
  if (R.kind === "public") return "显式公开（public）";
  if (R.kind === "login") return "登录即可（经鉴权会话）";
  if (R.kind === "none") return "";
  /* 认证要求已是条件组内的条件行，随 condText 一并回读——不再另起「｜认证要求：」段 */
  return condText(R.cond);
}
/* 生成一条路径行的标识 */
function pathKey(as, r, p) { return as.id + "|" + r.id + "|" + p.m + "|" + p.p; }

/* 主体属性条件组的自然语言回读（页 B 与页 A 共用渲染的简化版） */
function condText(cond) {
  if (!cond) return "—";
  if (cond.t === "c") return condOneText(cond);
  /* 历史写法为 c => cond.t === "c" ? "" : …，该分支恒不可达（本函数开头已处理 t === "c"） */
  const inner = (cond.ch || []).map(c => (c.t === "g" ? "（" + condText(c) + "）" : condOneText(c))).join(cond.op === "and" ? " 且 " : " 或 ");
  if (cond.op === "not") return "非（" + inner + "）";
  return inner;
}
function condOneText(c) {
  if (!c) return "—";
  /* 无法识别的历史文本片段：原样回读（不猜测、不改写语义），由校验报错要求人工确认 */
  if (!c.attr) return c._raw || "—";
  if (c.attr === "client.software") {
    const sw = softById(c.v && c.v.sw) || { name: "—", versions: [] };
    if (!c.v || !c.v.ver || !c.v.verOp) return `${attrFullLabel("client.software")} = ${sw.name}`;
    return `${attrFullLabel("client.software")} = ${sw.name} 且 版本 ${OP_LABEL[c.v.verOp]} ${c.v.ver}`;
  }
  if (c.attr === "device.os" && c.v && c.v.os) {
    return c.v.ver ? `${attrFullLabel("device.os")} = ${c.v.os}（版本 ${OP_LABEL[c.v.verOp || "gte"]} ${c.v.ver}）` : `${attrFullLabel("device.os")} = ${c.v.os}`;
  }
  if (c.mode === "ref") return `${attrFullLabel(c.attr)} = ${attrFullLabel(c.ref)}（同源比较）`;
  const op = OP_LABEL[c.op] || c.op;
  /* 多值语义后缀由**单一来源**给出，各分支一律复用——避免某专用分支漏拼导致
     文本↔结构往返丢 q（历史缺陷：认证维度分支不带「全部具备」后缀） */
  const qSuf = (c.q === "all" && (((attrById(c.attr) || {}).q) || "both") !== "none") ? "（全部具备）" : "";
  /* 区间（序型属性）：两端都须回读，避免只显示一半 */
  if (c.op === "between") {
    const b1 = Array.isArray(c.v) ? c.v[0] : c.v, b2 = Array.isArray(c.v) ? c.v[1] : "";
    return `${attrFullLabel(c.attr)} 在 ${b1 || "…"} 到 ${b2 || "…"} 之间`;
  }
  /* 认证维度条件即「认证要求」本身：安全级别按级别序比较（同一级别含多种等效方式，
     故不绑定具体方式名）；认证方式按同级多方式精确限定（列出的方式强度相当，任一命中即达标）；
     复合方式数补单位。当前认证不达标时不由本条件判为拒绝，而由引擎触发追加认证至达标后放行 */
  if (c.attr === "auth.level") {
    const lv = parseInt(String(c.v), 10);
    if (!isNaN(lv)) return `${attrFullLabel("auth.level")} ${op} ${lv} 级${qSuf}`;
  }
  if (c.attr === "auth.method") {
    const vs = Array.isArray(c.v) ? c.v.join("、") : c.v;
    return `${attrFullLabel("auth.method")} ${op} ${vs}${qSuf}`;
  }
  if (c.attr === "auth.composite") return `${attrFullLabel("auth.composite")} ${op} ${c.v} 种方式叠加${qSuf}`;
  if (c.attr === "env.time" && c.v) {
    const t = normTime(c.v);
    return `${attrFullLabel("env.time")} ${c.op === "notin" ? "不在" : "在"} ${timeDayText(t)} ${t.from}–${t.to}（${t.tz}）${timeMonText(t)}`;
  }
  let vs;
  if (Array.isArray(c.v)) vs = c.v.map(x => (c.attr === "user.org" || c.attr === "device.org") ? orgName(x) : x).join("、");
  else vs = c.v;
  const inc = c.inc ? "（含子组织）" : "";
  return `${attrFullLabel(c.attr)} ${op} ${vs}${inc}${qSuf}`;
}
/* ==========================================================================
   页 A · 资产访问控制策略
   ========================================================================== */
const S = { view: "list", cur: "a1", mode: "", modeAs: "", designer: null, filter: {}, cfmCb: null, selRows: new Set() };

/* ---- 通用小件 ---- */
function lvTag(l) { return `<span class="lv l${l}">L${l}</span>`; }
function modeTags(a) {
  if (a.anon === "asset") return `<span class="mtag anon">匿名开放</span>`;
  const out = [];
  if (hasMode(a, "agentless")) out.push(`<span class="mtag eg">无端</span>`);
  if (hasMode(a, "agent")) out.push(`<span class="mtag ag">有端</span>`);
  return out.join(" ") || `<span class="muted">—</span>`;
}
/* 页 B 覆盖率统计 */
function coverOf(a) {
  const st = { total: 0, attr: 0, login: 0, pub: 0, none: 0 };
  (a.res || []).forEach(r => (r.paths || []).forEach(p => {
    if (p.lc === "已下线") return;
    st.total++;
    const k = reqOf(p).kind;
    if (k === "attr") st.attr++; else if (k === "login") st.login++; else if (k === "public") st.pub++; else st.none++;
  }));
  return st;
}
/* 策略统计：按形态组分别计数，未启用资产同样计入（策略与资产启用状态解耦） */
function polStat(a) {
  const pols = POLICIES[a.id] || {};
  let n = 0, on = 0, cnt = { allow: 0, reject: 0 }, per = {};
  (a.modes || []).forEach(m => {
    const list = pols[m] || [];
    per[m] = list.length;
    list.forEach(p => { n++; if (p.on) on++; cnt[p.action] = (cnt[p.action] || 0) + 1; });
  });
  return { n, on, cnt, per };
}
/* 比例条：栈式铺满整条轨道——各段占比之和恒为 100%（末段吸收四舍五入误差），
   未配置部分以中性灰段补齐。这样同列内所有行的线条长度、起止位置完全一致，
   行与行之间只体现"分段构成"的差异，不再出现长短参差（§10.1） */
function stackBar(segs) {
  const t = segs.reduce((s, x) => s + (x.n || 0), 0);
  if (!t) return `<div class="bars cov-mini"><i class="b0" style="width:100%"></i></div>`;
  const live = segs.filter(s => s.n > 0);
  let acc = 0;
  const html = live.map((s, i) => {
    const w = i === live.length - 1 ? Math.max(0, 100 - acc) : Math.round(s.n / t * 100);
    acc += w;
    return `<i class="${s.c}" style="width:${w}%"></i>`;
  }).join("");
  return `<div class="bars cov-mini">${html}</div>`;
}
/* 动作分布：动作仅「允许 / 拒绝」两类——认证要求不是独立动作，而是由「认证」维度
   属性条件（认证安全级别 / 复合认证方式数）表达，当前认证不达标时引擎触发追加认证。
   无论是否已配置策略都用同一视觉结构（栈式比例条 + 两类图例），未配置时计数为 0、
   线条为整段灰，保持列内视觉一致，避免空行出现"断档" */
function actBars(c) {
  const t = (c.allow || 0) + (c.reject || 0);
  return `<div class="cov-line" title="允许 ${c.allow || 0} · 拒绝 ${c.reject || 0}${t ? "" : "（尚未配置策略）"}">
      ${stackBar([{ n: c.allow || 0, c: "b3" }, { n: c.reject || 0, c: "b1" }])}
      <span class="cov-num">共 <b>${t}</b> 条</span></div>
    <div class="cov-sub"><span><s class="b3"></s>允许 ${c.allow || 0}</span><span><s class="b1"></s>拒绝 ${c.reject || 0}</span></div>`;
}
function coverCell(a) {
  if (a.anon === "asset") return `<span class="muted">不适用（整资产匿名）</span>`;
  /* 不同类型的资产共用同一视觉结构：栈式比例条 + 「已配置 n/m」+ 单一动作链接；
     资源族、档位、对象样例等细节收入 tooltip，避免列内文字堆叠、列宽失控（§10.1） */
  const fam = resModel(a);
  if (!WEB(a)) {
    /* 非 L7 族：资源级边界 = 后端服务资源登记的可达目标。
       零登记不得回落成「已配置 0 / 0」——计数为 0 时改为成因表述并给出登记去处（§6.1 摘要按族呈现）。 */
    const objs = famObjs(a), conf = famConf(a);
    if (!objs.length) {
      return `<div class="cov-line" title="未登记可达目标：资源级判定以登记目标为边界——请到资产详情「资源与访问」登记后端服务资源"><span class="muted">未登记可达目标</span></div>
      <div class="cov-sub"><button class="btn link" data-act="gotoB" data-id="${a.id}">细粒度策略 →</button></div>`;
    }
    return `<div class="cov-line" title="${FAM_LABEL[fam]} · ${famTier(a)}｜登记对象 ${objs.length} 个 · 已配置 ${conf} 个 · 其余默认拒绝${objs[0] ? "｜首个对象 " + objs[0].d : ""}">
        ${stackBar([{ n: conf, c: "b1" }, { n: objs.length - conf, c: "b0" }])}
        <span class="cov-num">已配置 <b>${conf}</b>/${objs.length}</span></div>
      <div class="cov-sub"><button class="btn link" data-act="gotoB" data-id="${a.id}">细粒度策略 →</button></div>`;
  }
  const c = coverOf(a);
  const configured = c.attr + c.login;
  if (!c.total) return `<span class="muted">清单路径均已下线</span>`;
  return `<div class="cov-line" title="${FAM_LABEL[fam]}｜属性授权 ${c.attr} · 登录即可 ${c.login} · 显式公开 ${c.pub} · 默认拒绝 ${c.none}">
      ${stackBar([{ n: c.attr, c: "b1" }, { n: c.login, c: "b2" }, { n: c.pub, c: "b3" }, { n: c.none, c: "b0" }])}
      <span class="cov-num">已配置 <b>${configured}</b>/${c.total}</span></div>
    <div class="cov-sub"><button class="btn link" data-act="gotoB" data-id="${a.id}">细粒度策略 →</button></div>`;
}

/* R9 策略命名的唯一化生成：名称是策略清单、审计记录与告警通知的唯一定位键。
   「X（副本）」被占用时继续找下一个序号，而不是叠成「X（副本）（副本）」——
   叠后缀既不可读，也会立刻撞上保存侧的「同形态组内名称唯一」校验。 */
function uniqPolName(list, base) {
  const b = String(base || "").trim() || "未命名策略";
  const has = n => (list || []).some(p => String(p.name || "").trim() === n);
  if (!has(b + "（副本）")) return b + "（副本）";
  let i = 2;
  while (has(b + "（副本 " + i + "）")) i++;
  return b + "（副本 " + i + "）";
}
/* R14/R29 批量启停的可用性：未勾选一律禁用；已勾选时按勾选集合的**启停态**判定——
   全部已启用时「批量启用」无对象可改，反之亦然。与 ③ 卡头「全部启用 / 全部停用」、
   行级启停同一套口径（否则点一次只会换来一轮二次认证和「0 条变更」）。
   R29 的「不可操作即隐藏」只适用于**列表操作列**内的行级启停——按钮随行、留在版面上会把行高撑起来；
   页脚批量与 ③ 卡头一键启停是**固定位控件**，隐藏会让工具栏忽多忽少，故维持「禁用 + 写明原因」。
   whyOn / whyOff 与可用性判定同源产出，即可用时写明作用面、不可用时写明原因。 */
function batchAvail() {
  let off = 0, on = 0;
  /* 批量作用面只统计**可选资产**：冻结 / 匿名资产即便因历史状态残留在集合里也不计入，
     否则「批量停用」会指向一批改不动的对象（二次认证过后 0 条变更）。 */
  S.selRows.forEach(id => { const x = byId(id); if (!x || !aspRowSelectable(x)) return; const s = polStat(x); off += s.n - s.on; on += s.on; });
  const some = S.selRows.size > 0;
  return {
    on: some && off > 0, off: some && on > 0,
    whyOn: !some ? "请先在列表中勾选要处理的资产" : (off > 0 ? "启用已勾选资产在全部形态组内的准入策略" : "已勾选资产的准入策略均为启用状态，没有可启用的对象"),
    whyOff: !some ? "请先在列表中勾选要处理的资产" : (on > 0 ? "停用已勾选资产在全部形态组内的准入策略" : "已勾选资产的准入策略均为停用状态，没有可停用的对象")
  };
}
/* R15 冻结态在列表可见：撤销中 / 异常期间准入策略整体只读，行级启停被禁用——
   只靠悬停提示会让管理员以为按钮失效。故把「只读」徽标摆在按钮旁边（与 ④ 卡头同一枚），
   并在 title 里给出可直接照做的下一步。 */
/* R29 「只读」从操作列徽标改为**资产名旁的标签**，位置在「已启用」标签之前（用户裁决）——
   状态标签集中在一处，操作列只留可执行动作。用 t-warn 是因为冻结本身是需要处理的状态
   （异常要重试、撤销中要等收敛），原因仍写在 title 里供直接照做。 */
function rowFrozenTag(a) {
  if (a.anon === "asset") return "";
  const st = a.open || "";
  if (st !== "撤销中" && st !== "异常") return "";
  const why = st === "撤销中" ? "撤销编排进行中" : "无端访问编排未完成（请先在资产列表「状态」列点「重试」幂等续跑）";
  return `<span class="tag t-warn ro" title="资产${st}：准入策略整体只读（${why}）">只读</span>`;
}

/* ---- A1 列表 ---- */
/* R5 行级启用 / 停用：与列表左下的批量启停**同语义**——作用于该资产在**全部形态组**内的准入策略，
   只是作用面收敛为单行（批量作用于当前页已勾选行）。按当前启停态禁用（全部已启用 → 「启用」不可点）；
   属敏感变更，走同一套二次认证（设计稿 §11.1 四入口之一：资产启用停用 · 页 A 资产列表 · 操作列）。 */
/* R29 行级启停：只渲染**当前可操作**的那一枚——全部已启用 → 仅「停用」；全部停用 → 仅「启用」；
   混合态两枚都可用 → 都给。冻结（撤销中 / 异常）时整组不渲染。
   此前两枚恒渲染、靠 disabled 表达不可用，结果操作列被灰按钮撑成两行、行高 93px；
   不可操作的按钮直接隐藏比灰置更干净，也不占版面。 */
function rowToggleBtn(a) {
  if (a.anon === "asset") return "";
  const st = polStat(a);
  if (!st.n) return "";
  if (a.open === "撤销中" || a.open === "异常") return "";
  const allOn = st.on === st.n, noneOn = st.on === 0;
  let h = "";
  if (!allOn) h += `<button class="btn sm" data-act="aspRowToggle" data-v="on" data-id="${a.id}" title="启用该资产在全部形态组内的准入策略">启用</button>`;
  if (!noneOn) h += `<button class="btn sm" data-act="aspRowToggle" data-v="off" data-id="${a.id}" title="停用该资产在全部形态组内的准入策略">停用</button>`;
  return `<span class="opair">${h}</span>`;
}
/* 页 A 列表可选行判定（**单一来源**）：批量启停的作用面只能落在「准入策略可改」的资产上——
   整资产匿名开放（准入策略整体不适用）与冻结态（撤销中 / 异常，准入策略整体只读）二者都必须从
   批量作用面里排除。行勾选框渲染、表头全选范围、批量可用性统计三处读同一份判定，避免
   「源头不渲染、统计仍计入」这类同源破裂；处理方式与页 B 只读态（ro）一致。 */
function aspRowSelectable(a) {
  if (!a) return false;
  if (a.anon === "asset") return false;
  return !(a.open === "撤销中" || a.open === "异常");
}
function renderAspList() {
  const f = S.filter;
  let rows = ASSETS.slice();
  if (f.k) rows = rows.filter(a => (a.name + a.ext || "").includes(f.k) || a.name.includes(f.k) || (a.ext || "").includes(f.k));
  if (f.grp) rows = rows.filter(a => a.grp === f.grp);
  if (f.type) rows = rows.filter(a => a.type === f.type);
  if (f.mode) rows = rows.filter(a => f.mode === "dual" ? (a.modes || []).length === 2 : hasMode(a, f.mode));
  if (f.lv) rows = rows.filter(a => "L" + a.lv === f.lv);
  if (f.en) rows = rows.filter(a => f.en === "1" ? EN_ON(a) : !EN_ON(a));
  if (f.st === "on") rows = rows.filter(a => a.anon !== "asset" && polStat(a).on > 0);
  else if (f.st === "off") rows = rows.filter(a => { const s = polStat(a); return a.anon !== "asset" && s.n > 0 && s.on === 0; });
  else if (f.st === "none") rows = rows.filter(a => a.anon !== "asset" && polStat(a).n === 0);

  /* 分页：与宿主资产列表同一套页码组件；筛选条件变化自动回第 1 页，并清空行勾选（勾选与结果集强相关） */
  const _sig = [f.k, f.grp, f.type, f.mode, f.lv, f.en, f.st].join("|");
  if (window._SAsp !== _sig) S.selRows.clear();
  pgKeep("Asp", _sig);
  const aspTotal = rows.length, aspPages = Math.max(1, Math.ceil(aspTotal / ASP_PAGE));
  window.PAsp = Math.min(Math.max(1, window.PAsp || 1), aspPages);
  const pageRows = rows.slice((window.PAsp - 1) * ASP_PAGE, window.PAsp * ASP_PAGE);
  window._aspTotal = aspTotal;

  /* 准入策略列：策略按形态组维护；未启用资产同样可配置并计入统计
     统计值统一为「已启用 M/N」；每条策略各自带启停状态（配置页逐条可见） */
  const polCell = (a) => {
    if (a.anon === "asset") return `<span class="muted">不适用</span>`;
    if (!(a.modes || []).length) return `<span class="muted">—</span>`;
    return (a.modes || []).map(m => {
      const list = (POLICIES[a.id] || {})[m] || [];
      const on = list.filter(p => p.on).length;
      return `<div class="pm-line"><span class="mtag ${m === "agentless" ? "eg" : "ag"}">${m === "agentless" ? "无端" : "有端"}</span><span class="pm-cnt">已启用 <b>${on}</b>/${list.length}</span></div>`;
    }).join("");
  };
  /* R30 名称定宽：逐字估算当前页最长名称（汉字按 1em、其余按 0.55em），夹在 140~176px。
     逐行各算一个宽度会让标签参差，故取**整页一个值**。 */
  const nmw = (() => {
    let mx = 0;
    pageRows.forEach(a => {
      let w = 0;
      for (const ch of String(a.name || "")) w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? 13 : 7.2;
      mx = Math.max(mx, w);
    });
    return Math.max(140, Math.min(176, Math.ceil(mx) + 2));
  })();
  /* R30 资产列宽 = 名称定宽 + 固定开销 178（gap 6 + 已启用 56 + gap 6 + 等级 32 + gap 6 + 只读 39
     + 单元格左右 padding 28 + 余量 5）。列宽跟着名称走，名称行尾部才不会留下成片空白——
     「加宽资产列」与「不留冗余」本就是同一件事的两面：写死列宽时，加宽只会把空白加宽。 */
  const colw = nmw + 178;
  const body = pageRows.map(a => {
    const st = polStat(a);
    const anon = a.anon === "asset";
    const sel = S.selRows.has(a.id);
    return `<tr data-id="${a.id}" class="${sel ? "sel" : ""}">
      <td class="cell-chk">${aspRowSelectable(a) ? `<input type="checkbox" data-act="aspSelRow" data-id="${a.id}" ${sel ? "checked" : ""} aria-label="选择 ${esc(a.name)}">` : ""}</td>
      <td class="cell-asset">
        <div class="a-name"><span class="a-nm" title="${esc(a.name)}">${esc(a.name)}</span>${enTag(a)}${lvTag(a.lv)}${anon ? `<span class="mtag anon">匿名开放</span>` : ""}${rowFrozenTag(a)}</div>
        <div class="a-sub" title="${esc(a.ext && a.ext !== "-" ? a.ext : (a.addr || "—"))}">${esc(a.ext && a.ext !== "-" ? a.ext : (a.addr || "—"))}</div>
      </td>
      <td class="cell-pol">${polCell(a)}</td>
      <td class="cell-act">${anon ? `<span class="muted">不适用</span>` : actBars(st.cnt)}</td>
      <td class="cell-cov">${coverCell(a)}</td>
      <td class="cell-upd">${a._upd || "—"}</td>
      <td class="cell-op"><span class="opgrp"><button class="btn sm" data-act="aspCfg" data-id="${a.id}">查看策略</button>${rowToggleBtn(a)}</span></td></tr>`;
  }).join("");
  const ba = batchAvail();

  return `
  <div class="title-row">
    <div><h2>资产访问控制策略</h2></div>
  </div>
  <div class="card"><div class="card-b">
    <div class="toolbar" style="margin-bottom:12px">
      <div class="input-w"><input type="search" id="saK" placeholder="搜索资产名称 / 域名" style="width:220px" value="${esc(f.k || "")}"><i>搜索</i></div>
      <select id="saGrp"><option value="">全部分组</option>${[...new Set(ASSETS.map(a => a.grp))].map(g => `<option ${f.grp === g ? "selected" : ""}>${g}</option>`).join("")}</select>
      <select id="saMode"><option value="">全部接入方式</option><option value="agentless" ${f.mode === "agentless" ? "selected" : ""}>无端接入</option><option value="agent" ${f.mode === "agent" ? "selected" : ""}>有端接入</option><option value="dual" ${f.mode === "dual" ? "selected" : ""}>双形态</option></select>
      <select id="saType"><option value="">全部资产类型</option>${TYPES.filter(t => ASSETS.some(a => a.type === t)).map(t=>`<option ${f.type===t?"selected":""}>${t}</option>`).join("")}</select>
      <select id="saLv"><option value="">全部等级</option>${[1,2,3,4,5].map(l=>`<option ${f.lv==="L"+l?"selected":""}>L${l}</option>`).join("")}</select>
      <select id="saOpen"><option value="">全部启用状态</option><option value="1" ${f.en==="1"?"selected":""}>已启用</option><option value="0" ${f.en==="0"?"selected":""}>未启用</option></select>
      <select id="saSt"><option value="">全部策略配置</option><option value="on" ${f.st==="on"?"selected":""}>有启用策略</option><option value="off" ${f.st==="off"?"selected":""}>策略全部停用</option><option value="none" ${f.st==="none"?"selected":""}>未配置策略</option></select>
    </div>
    <div class="tbl-wrap"><table class="mtx asp-tbl" style="--nmw:${nmw}px">
      <colgroup><col style="width:44px"><col style="width:${colw}px"><col style="width:164px"><col><col><col style="width:116px"><col style="width:222px"></colgroup>
      <thead><tr>
        <th class="cell-chk">${pageRows.some(aspRowSelectable) ? `<input type="checkbox" id="aspSelAll" data-act="aspSelAll" title="全选本页">` : ""}</th>
        <th>资产</th><th>准入策略</th>
        <th>动作分布</th><th>细粒度授权</th><th>更新时间</th><th>操作</th>
      </tr></thead><tbody>${body || aspEmptyRow()}</tbody></table></div>
    <div class="lst-foot">
      <div class="toolbar" style="flex:0 0 auto">
        <span class="sel-cnt" id="aspSelCnt">${S.selRows.size ? `已选 <b>${S.selRows.size}</b> 个资产` : "未勾选资产"}</span>
        <button class="btn sm" data-act="aspBatch" data-v="on" ${ba.on ? `title="${esc(ba.whyOn)}"` : `disabled title="${esc(ba.whyOn)}"`}>批量启用</button>
        <button class="btn sm" data-act="aspBatch" data-v="off" ${ba.off ? `title="${esc(ba.whyOff)}"` : `disabled title="${esc(ba.whyOff)}"`}>批量停用</button>
      </div>
      <div id="aspPager" style="flex:1 1 auto; min-width:0"></div>
    </div>
  </div></div>`;
}
/* R2 列表空态分流：两种「空」的成因不同，引导也不同——
   ① 从未登记过资产：本页按资产登记事实生效，引导至「无端访问管理」；
   ② 筛选条件没命中：给出一键清空，不让管理员逐个下拉去回忆改过什么。 */
function aspEmptyRow() {
  if (!ASSETS.length) {
    return `<tr><td colspan="7"><div class="empty"><div class="big">暂无已登记资产</div>`
      + `<span class="muted">本页的准入策略按资产登记事实生效——请先到「无端访问管理」登记并开通资产，再返回本页配置准入策略。</span></div></td></tr>`;
  }
  return `<tr><td colspan="7"><div class="empty"><div class="big">无匹配资产</div>`
    + `<span class="muted">当前筛选条件下没有资产，调整筛选条件后重试</span>`
    + `<div style="margin-top:10px"><button class="btn sm" data-act="aspClearF">清空筛选条件</button></div></div></td></tr>`;
}
/* 页 A 翻页：勾选限定当前页，翻页即清空（避免跨页误批量） */
function aspPg(p) { S.selRows.clear(); window.PAsp = Math.max(1, p | 0); renderAsp(); }

/* 页 A 行勾选：就地同步「表头全选 / 已选计数 / 批量按钮可用性」，避免整表重渲染导致滚动跳动 */
function syncAspSel() {
  /* 行集合只取**含勾选框**的行：冻结 / 匿名行没有勾选框，若按 tr[data-id] 统计，
     表头全选态会把不可选行一并算进去（表现为「全选已勾满、却永远差一行」）。 */
  const ids = $$('#pg-asp tbody input[data-act="aspSelRow"]').map(c => c.dataset.id);
  const all = $("#aspSelAll");
  if (all) {
    const selOnPage = ids.filter(id => S.selRows.has(id)).length;
    const full = ids.length > 0 && selOnPage === ids.length;
    all.checked = full;
    all.indeterminate = selOnPage > 0 && selOnPage < ids.length;
    /* 悬停提示随状态切换：已全选 → 取消全选本页；否则 → 全选本页 */
    all.title = full ? "取消全选本页" : "全选本页";
  }
  const cnt = $("#aspSelCnt");
  if (cnt) cnt.innerHTML = S.selRows.size ? `已选 <b>${S.selRows.size}</b> 个资产` : "未勾选资产";
  /* R14 批量启停的就地刷新：可用性随勾选集合的启停态变化，不能只看「有没有勾」 */
  const _ba = batchAvail();
  $$("#pg-asp [data-act='aspBatch']").forEach(b => {
    const isOn = b.dataset.v === "on";
    b.disabled = isOn ? !_ba.on : !_ba.off;
    /* 可用则写明作用面、不可用则写明原因——两种状态的悬停提示同源产出，不在两处各写一套 */
    b.title = isOn ? _ba.whyOn : _ba.whyOff;
  });
}

/* ---- 页 A 入口与分派 ---- */
function renderAsp() {
  if (PG_CUR !== "pg-asp" && PG_CUR !== "pg-fgreq") return;   /* 多页化：仅准入页与设要求页承载本渲染 */
  /* 页 B 的「设置访问要求」独立页复用同一套组树组件——但分派判据必须是**当前页**
     （`_cur` 由 showPage 单一写入），不能只看「设计器上下文是否存在」：该上下文在离开设要求页后
     仍然挂着（未点取消 / 保存就切走），只判上下文会把内容写进**隐藏的** #pg-fgreq 并提前返回，
     当前页停在旧画面上——「返回列表」「查看策略」点了毫无反应（无报错、无痕）。 */
  if (_cur === "pg-fgreq" && S.designer && S.designer.scope === "path") { renderFgReq(); return; }
  if (S.view === "designer") { renderDesignerInto(); return; }
  const el = $("#pg-asp");
  if (S.view === "list") { el.innerHTML = renderAspList(); pgmk("#aspPager", window._aspTotal || 0, window.PAsp, "aspPg", "个资产", ASP_PAGE, "勾选限定当前页 · 批量启用/停用作用于已勾选资产的准入策略"); syncAspSel(); return; }
  const a = byId(S.cur); if (!a) { S.view = "list"; el.innerHTML = renderAspList(); pgmk("#aspPager", window._aspTotal || 0, window.PAsp, "aspPg", "个资产", ASP_PAGE, "勾选限定当前页 · 批量启用/停用作用于已勾选资产的准入策略"); syncAspSel(); return; }
  el.innerHTML = renderAspCfg(a);
}

/* ---- A2 策略配置视图（查看与编辑同一页，无独立只读详情） ---- */
function renderAspCfg(a) {
  const anon = a.anon === "asset";
  /* R1 资产生命周期冻结：撤销中 / 异常期间编排进行中或未收敛，准入策略整体只读（设计稿 §6.3 只读态来源、§11 空态与异常）。
     未启用（资产停用）不冻结——未启用资产同样可先配置策略，启用后即生效（页脚口径） */
  const openSt = a.open || "";
  const frozen = openSt === "撤销中" || openSt === "异常";
  const frozenWhy = frozen
    ? (openSt === "撤销中"
        ? "撤销编排进行中，策略变更与编排清理互斥；请待撤销完成后重新进入本页。"
        : "无端访问编排未完成（异常），此间策略变更不会生效；请先在资产列表「状态」列点「重试」幂等续跑。")
    : "";
  /* 固定位控件常驻可见 + disabled + title 写明原因：原因集中产出一处，不在每个按钮上复读 */
  const frozAttr = frozen ? `disabled title="${esc(frozenWhy)}"` : "";
  const modes = a.modes || [];
  /* R12 形态定位的两个来源：① 入口（列表「查看策略」）按「首个已配置形态」定好；
     ② 页面内的形态卡切换（aspMode）自行改写。此处只做**兜底**——当前形态不属于本资产时回落到
     首个形态。定位不放在渲染期：否则任何一次重渲染都会重猜意图，把管理员从刚切到的形态组挪走。 */
  if (!S.mode || !modes.includes(S.mode)) S.mode = modes[0] || "";
  const pols = (POLICIES[a.id] || {})[S.mode] || [];
  const st = polStat(a);
  const c = coverOf(a);

  /* ① 资产基本信息：把资产登记事实与细粒度覆盖率收进一张信息卡，用弹性信息格承载 */
  /* 细粒度覆盖率：与列表「细粒度授权」同源组件（栈式色条），但在信息格里改为**内联一行**——
     色条定宽不撑满（长条占满整格只表达一个比例，无信息增益），四项明细紧随其后、
     色点与色段一一对应；四项之和即总数，故不再重复标注「已配置 m/n」 */
  const covCell = c.total
    ? `<div class="cov-line inl" title="属性授权 ${c.attr} · 登录即可 ${c.login} · 显式公开 ${c.pub} · 未配置 ${c.none} · 共 ${c.total} 条">
         ${stackBar([{ n: c.attr, c: "b1" }, { n: c.login, c: "b2" }, { n: c.pub, c: "b3" }, { n: c.none, c: "b0" }])}
         <span class="cov-sub"><span><s class="b1"></s>属性授权 ${c.attr}</span><span><s class="b2"></s>登录即可 ${c.login}</span><span><s class="b3"></s>显式公开 ${c.pub}</span><span><s class="b0"></s>未配置 ${c.none}</span></span>
       </div>`
    : `<span class="muted">清单路径均已下线</span>`;
  const ctx = `
  <div class="title-row">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="btn" data-act="aspBack">← 返回列表</button>
      <h2 style="margin:0">${esc(a.name)}</h2>
      ${modeTags(a)} ${lvTag(a.lv)} ${enTag(a)}
    </div>
    <div class="toolbar">
      <button class="btn" data-act="gotoB" data-id="${a.id}">配置细粒度访问策略 →</button>
    </div>
  </div>
  <div class="card"><div class="card-h"><h3>① 资产基本信息</h3><span class="sub">资产登记事实与细粒度覆盖</span></div><div class="card-b">
    <div class="info-grid">
      <div class="ig"><div class="k">外部映射域名</div><div class="v">${esc(a.ext && a.ext !== "-" ? a.ext : (a.addr || "—"))}</div></div>
      <div class="ig"><div class="k">资产类型</div><div class="v">${esc(a.type)}</div></div>
      <div class="ig"><div class="k">所属分组</div><div class="v">${esc(a.grp)}</div></div>
      <div class="ig"><div class="k">负责人</div><div class="v">${esc(a.owner || "—")}</div></div>
      <div class="ig w2"><div class="k">细粒度覆盖率</div><div class="v">${covCell}</div></div>
    </div>
  </div></div>`;

  /* 整资产匿名型：不显示形态分组器，改为只读横幅（§2.2） */
  if (anon) {
    return ctx + `
    <div class="hint-row ro"><i class="ic">匿名开放</i><div>
      <b>该资产整体匿名开放（整资产匿名型），不进入认证与授权链，准入策略不适用。</b>
      匿名开放<b>仅免除用户认证</b>（及其连带的资产访问状态与授权判定），<b>不做越权判定</b>（无主体身份，越权语义不存在）；
      <b>WAF、限流、请求约束、行为策略与审计等安全防护照常生效</b>。如需按主体属性准入，请先在「资产细粒度访问策略」关闭整资产匿名开放声明。
    </div></div>
    <div class="card"><div class="card-h"><h3>准入策略<span class="sub">不适用</span></h3><span class="rolock">只读</span></div>
      <div class="card-b"><div class="empty"><div class="big">该资产整资产匿名开放，准入策略不适用</div>
      <span class="muted">此为「允许匿名访问」的唯一一种整资产形态：匿名范围 = 资产全部资源，因而不存在"匿名范围之外的越权"。</span></div></div></div>`;
  }

  /* ② 策略组基本信息：按接入形态独立成立，点击卡片切换当前编辑的形态组。
     准入策略（启用 / 停用）与动作分布（允许 / 拒绝）复用列表同源组件（stackBar + cov-*），
     两组并排在**同一行**——总数由「已启用 M/N」的分母与「允许 + 拒绝」共同表达，不再重复标注；
     数值字色与色段一致，省去独立图例行。另附本组最近更新时间 */
  const secGroups = modes.length ? `
  <div class="card"><div class="card-h"><h3>② 策略组基本信息</h3><span class="sub">按接入形态独立成立 · ${modes.length > 1 ? "点击卡片切换" : "单一形态无需切换"}</span></div><div class="card-b">
    <div class="modebar${modes.length === 1 ? " one" : ""}" style="margin-bottom:0">${modes.map(m => {
      const pl = (POLICIES[a.id] || {})[m] || [];
      const on = pl.filter(p => p.on).length;
      const cc = { allow: 0, reject: 0 }; pl.forEach(p => { if (cc[p.action] != null) cc[p.action]++; });
      const last = pl.map(p => p.at || "").filter(Boolean).sort().pop() || "—";
      /* R3 可切换只取决于「资产登记了几种形态」——单形态资产无选项可切，只作展示。
         R30 修正两点：① **该形态组是否已有策略与可否切换无关**——若拿「组内有无策略」当门槛，
         未配置的形态组就永远进不去，等于永远添加不了策略；② **冻结期不再拦切组**：切组是导航不是编辑，
         只读要拦的是「改」，冻结期恰恰需要能翻看另一形态组既有的配置（与本卡「策略体检保留可用」同一逻辑）。 */
      const switchable = modes.length > 1;
      const mcTitle = switchable
        ? (frozen ? "点击切换为当前编辑的形态组（资产" + openSt + "：本页只读，仅可查看）" : "点击切换为当前编辑的形态组")
        : (frozen ? "资产" + openSt + "：本页只读；且该资产仅登记单一接入形态，无需切换" : "该资产仅登记单一接入形态，无需切换");
      return `<div class="mc ${S.mode === m ? "on" : ""}" ${switchable ? `data-act="aspMode" data-m="${m}"` : ""} title="${mcTitle}">
        <div class="t"><span class="mtag ${m === "agentless" ? "eg" : "ag"}">${MODE_LABEL[m]}</span>策略组</div>
        <div class="mrow"><span class="mk">策略</span>
          <div class="cov-line mc-stat">
            <span class="cgrp" title="准入策略：已启用 ${on} 条 · 停用 ${pl.length - on} 条">
              ${stackBar([{ n: on, c: "b3" }, { n: pl.length - on, c: "b0" }])}
              <span class="cov-num">已启用 <b>${on}</b>/${pl.length}</span></span>
            <span class="cgrp" title="动作分布：允许 ${cc.allow} 条 · 拒绝 ${cc.reject} 条${pl.length ? "" : "（尚未配置策略）"}">
              ${stackBar([{ n: cc.allow, c: "b3" }, { n: cc.reject, c: "b1" }])}
              <span class="cov-num">允许 <b class="c-allow">${cc.allow}</b> · 拒绝 <b class="c-reject">${cc.reject}</b></span></span>
          </div></div>
        <div class="mc-meta">
          <div class="mrow"><span class="mk">属性闭包</span><span class="mv">${m === "agentless" ? "用户 + 认证 + 环境（UA 派生浏览器信息仅辅助）" : "用户 + 认证 + 客户端软件 + 终端设备 + 环境（全量）"}</span></div>
          <div class="mrow"><span class="mk">更新时间</span><span class="mv">${esc(last)}</span></div>
        </div>
      </div>`;
    }).join("")}</div>
  </div></div>` : "";

  /* ③ 准入策略 */
  const polCards = pols.length ? pols.map(p => `
    <div class="polcard ${p.on ? "" : "off"}">
      <div class="ph">
        <span class="nm">${esc(p.name)}</span>
        <span class="act-tag act-${p.action}">${p.action === "allow" ? "允许" : "拒绝"}</span>
        <span class="mtag ${S.mode === "agentless" ? "eg" : "ag"}">${MODE_LABEL[S.mode]}</span>
        ${p.on ? `<span class="tag t-ok">已启用</span>` : `<span class="tag t-gray">未启用</span>`}
        <span class="ops">
          <button class="btn sm" data-act="polEdit" data-id="${p.id}" ${frozAttr}>编辑</button>
          <button class="btn sm" data-act="polDup" data-id="${p.id}" ${frozAttr}>复制</button>
          <button class="btn sm" data-act="polToggle" data-id="${p.id}" ${frozAttr}>${p.on ? "停用" : "启用"}</button>
          <button class="btn sm danger" data-act="polDel" data-id="${p.id}" ${frozAttr}>删除</button>
        </span>
      </div>
      <div class="rb"><b>条件回读：</b>${esc(polReadback(p).text)}</div>
      <div class="meta"><span>根组关系：${p.cond.op === "and" ? "满足全部条件（且）" : p.cond.op === "or" ? "满足任一条件（或）" : p.cond.op === "not" ? "排除组（非）" : "未设置"}</span>
        <span>更新：${esc(p.at || "—")} · ${esc(p.by || "—")}</span></div>
    </div>`).join("") : `<div class="empty" style="padding:26px 0"><div class="big">${MODE_LABEL[S.mode]}策略组暂无准入策略</div>
      <span class="muted">开通不自动生成策略；本组无允许命中即<b>默认拒绝</b></span></div>`;

  /* 一键启停作用于**当前形态组**的全部策略；两类按钮按已有启停态禁用（全启用时「全部启用」禁用，反之亦然） */
  const onPols = pols.filter(p => p.on).length;
  const secPol = `
  <div class="card"><div class="card-h">
    <h3>③ 准入策略<span class="sub">${MODE_LABEL[S.mode]}策略组 · ${pols.length} 条 · 已启用 ${onPols} 条</span></h3>
    <div class="toolbar" style="flex:0 0 auto">
      ${frozen ? `<span class="rolock" title="资产${openSt}：准入策略整体只读">只读</span>` : ""}
      <button class="btn sm" data-act="polAll" data-v="on" ${frozen || onPols === pols.length ? `disabled title="${frozen ? frozenWhy : "本组策略均为启用状态，没有可启用的对象"}"` : `title="启用本形态组的全部策略"`}>全部启用</button>
      <button class="btn sm" data-act="polAll" data-v="off" ${frozen || !onPols ? `disabled title="${frozen ? frozenWhy : "本组策略均为停用状态，没有可停用的对象"}"` : `title="停用本形态组的全部策略"`}>全部停用</button>
      <button class="btn sm" data-act="polCheck">策略体检</button>
      <button class="btn primary sm" data-act="polNew" ${frozAttr}>+ 新增策略</button>
    </div>
  </div><div class="card-b">
    ${frozen ? `<div class="hint-row ro" style="margin-bottom:12px"><i class="ic">只读</i><div><b>该资产处于「${openSt}」状态，准入策略整体只读。</b>${frozenWhy}</div></div>` : ""}
    <div class="rulebar"><span class="rb-i">合并</span><div>
      命中按 <b>拒绝 ＞ 允许</b> 合并（任一拒绝即刻终止），无允许命中即默认拒绝；<b>认证维度条件</b>不达标时触发<b>追加认证</b>后放行，不判拒绝。
    </div></div>
    ${polCards}
  </div></div>`;

  /* ④ 高级设置 */
  const secAdv = `
  <div class="card"><div class="card-h"><h3>④ 高级设置<span class="sub">资产级 + 形态边界</span></h3><span class="rolock">引擎强制 · 只读</span></div><div class="card-b">
    <div class="kv" style="grid-template-columns:104px 1fr"><div class="k">越权处置</div><div>
      <span class="tag t-err">一律拒绝</span> <span class="muted">资产级 · 跨形态一致 · 不提供观察档</span></div></div>
    <div class="kv" style="grid-template-columns:104px 1fr"><div class="k">默认拒绝</div><div>
      <span class="tag t-err">强制 · 不可关闭</span> <span class="muted">本形态组无允许命中即拒绝；另一形态边界独立</span></div></div>
  </div></div>`;

  return ctx + secGroups + secPol + secAdv + `
  <div class="card"><div class="card-b">
    <div class="mini">启用即生效、无需重启网关；属性或权限收紧 2 秒内收敛。</div>
  </div></div>`;
}
/* ==========================================================================
   策略设计器 · 布尔组树（§8）
   ========================================================================== */
const MAX_DEPTH = 3;                      // 硬限 3 层（D7）
let UID = 0;
const uid = () => "u" + (++UID);

/* 给组树节点补齐 uid（加载既有策略时） */
function ensureUid(n) {
  if (!n.uid) n.uid = uid();
  if (n.t === "g") (n.ch || []).forEach(ensureUid);
  return n;
}
const clone = o => JSON.parse(JSON.stringify(o));

/* ---- 读回：自然语言 + 括号式 ---- */
function polReadback(p) { return rbTree(p.cond); }
function rbTree(node) {
  const t = rbText(node, 0), c = rbCode(node, 0);
  return { text: t, code: c };
}
function rbText(n, d) {
  if (!n) return "—";
  if (n.t === "c") return condOneText(n);
  const op = n.op;
  const kids = n.ch || [];
  if (!kids.length) return "（空组）";
  const parts = kids.map(k => (k.t === "g" ? "（" + rbText(k, d + 1) + "）" : rbText(k, d + 1)));
  if (op === "not") return "非" + parts[0].replace(/^（|）$/g, "").replace(/^（|）$/g, "");
  const joiner = op === "and" ? "，且 " : "，或 ";
  const head = op === "and" ? "同时满足：" : "满足任一：";
  /* 序号覆盖 1~20（①②…⑳），超出后回落阿拉伯数字，避免 9 条以上丢编号 */
  const circ = i => (i < 20 ? String.fromCharCode(0x2460 + i) : (i + 1) + ".");
  if (d === 0) return head + parts.map((s, i) => circ(i) + s).join(joiner);
  return parts.join(op === "and" ? " 且 " : " 或 ");
}
function rbCode(n, d) {
  if (!n) return "";
  if (n.t === "c") return condCode(n);
  const kids = n.ch || [];
  if (!kids.length) return "()";
  const j = n.op === "and" ? " AND " : n.op === "or" ? " OR " : " NOT ";
  return "(" + kids.map(k => rbCode(k, d + 1)).join(j) + ")";
}
/* 运算符 → 代码式符号（全部具备 / 任一命中 也各有其形，不再一律退化为 =） */
const CODEX_OP = { eq: "=", ne: "≠", in: "∈", notin: "∉", gte: "≥", lte: "≤", between: "∈", contains: "∋", notcontains: "∌", allof: "⊇", anyof: "∩" };
/* 括号式回读的取值格式化：与自然语言回读同源，逐类型显式给出
   （历史实现直接插值 c.v：时间窗口 → [object Object]、区间 → "="、组织 → 原始 id） */
function codeVal(c) {
  const a = attrById(c.attr) || {};
  if (a.type === "time") {
    const t = normTime(c.v);
    const mon = t.months.length ? " 限 " + t.months.slice().sort((x, y) => x - y).join("、") + " 月" : "";
    return `"${timeDayText(t)} ${t.from}–${t.to} (${t.tz})${mon}"`;
  }
  if (a.type === "org") return "{" + (Array.isArray(c.v) ? c.v.map(orgName) : []).map(x => `"${x}"`).join(", ") + "}";
  if (c.op === "between") { const b = Array.isArray(c.v) ? c.v : []; return `["${b[0] || "…"}", "${b[1] || "…"}"]`; }
  if (Array.isArray(c.v)) return "{" + c.v.map(x => `"${x}"`).join(", ") + "}";
  return `"${c.v == null ? "" : c.v}"`;
}
function condCode(c) {
  if (!c.attr) return c._raw || "";
  if (c.attr === "client.software") {
    const sw = softById((c.v || {}).sw);
    const nm = sw ? sw.name : "—";
    if (!c.v || !c.v.ver || !c.v.verOp) return `client.software(name = "${nm}")`;
    return `client.software(name = "${nm}" AND version ${CODEX_OP[c.v.verOp] || "="} "${c.v.ver}")`;
  }
  if (c.mode === "ref") return `${c.attr} == ${c.ref}`;
  if (c.attr === "device.os" && c.v && c.v.os) {
    return `device.os = "${c.v.os}"` + (c.v.ver ? ` AND device.osVersion ${CODEX_OP[c.v.verOp || "gte"] || "≥"} "${c.v.ver}"` : "");
  }
  const q = (c.q === "all" && (((attrById(c.attr) || {}).q) || "both") !== "none") ? "（全部具备）" : "";
  return `${c.attr} ${CODEX_OP[c.op] || "="} ${codeVal(c)}${c.inc ? "（含子组织）" : ""}${q}`;
}

/* ---- 树操作 ---- */
function walkTree(n, fn, parent, depth) {
  fn(n, parent, depth);
  if (n.t === "g") (n.ch || []).forEach(k => walkTree(k, fn, n, depth + 1));
}
function findNode(root, id) { let res = null; walkTree(root, (n, p, d) => { if (n.uid === id) res = { n, p, d }; }, null, 1); return res; }
function depthOf(root, id) { const f = findNode(root, id); return f ? f.d : 0; }
const isAncestor = (root, ancId, nodeId) => { const f = findNode(root, ancId); let hit = false; if (!f) return false; walkTree(f.n, (n) => { if (n.uid === nodeId) hit = true; }); return hit; };
function countDeep(n) { return n.t === "g" ? 1 + Math.max(0, ...(n.ch || []).map(countDeep)) : 0; }

/* ---- 属性闭包（按形态裁剪） ---- */
function attrsForMode(mode) {
  return ATTR_DICT.filter(a => mode === "agent" ? true : a.scope === "both");
}
const inClosure = (attrId, mode) => attrsForMode(mode).some(a => a.id === attrId);

/* ---- 同源比较（属性引用）的同源组 ----
   只对「同一语义轴上的等价属性」开放。历史做法按类型取同类，会把「用户账号 = 用户业务权限」
   「账号状态 = 接入网络类型」「已托管 = 已吊销」这类无意义组合一并列出。
   未列入同源组的属性即表示无可比对象，条件行不显示「属性引用」入口。 */
const REF_GROUPS = [
  ["user.account", "device.owner"],   /* 身份 ↔ 设备归属：设备的登记使用人是否即当前登录用户 */
  ["user.org", "device.org"],         /* 用户组织 ↔ 设备组织：人与设备是否同属一个组织 */
];
/* 资源级可用属性 = 用户维度 + 认证维度（认证要求即此维度条件行）+ 环境属性中的网络与时间类 */
function attrsForPath() { return ATTR_DICT.filter(a => a.dim === "user" || a.dim === "auth" || REQ_ENV_ATTRS.includes(a.id)); }
function refOptions(c, scope) {
  const g = REF_GROUPS.find(x => x.includes(c.attr));
  if (!g) return [];
  const allow = (scope === "path") ? attrsForPath() : attrsForMode(scope);
  return allow.filter(x => x.id !== c.attr && g.includes(x.id));
}

/* ---- 校验 ----
   单条条件行的判定统一收敛到 condIssues()：页 A（准入策略，按形态闭包）与页 B（资源级策略，
   按资源级属性范围）共用同一套规则。历史实现两处各写一份，页 B 漏掉运算符归属与取值形态校验，
   于是「文本反解出的越界运算符」在页 B 侧无声通过。 */
function condIssues(n, ctx) {
  const out = [];
  const a = attrById(n.attr);
  if (!n.attr) { out.push({ level: "err", text: n._raw ? `无法识别的条件片段「${n._raw}」：请重新选择属性与运算符` : "条件行缺属性" }); return out; }
  if (ctx.closure === "mode" && !inClosure(n.attr, ctx.mode)) { out.push({ level: "err", text: `「${a.label}」不在当前形态（${MODE_LABEL[ctx.mode]}）的属性闭包内，越界条件将静默失效` }); return out; }
  if (ctx.closure === "path") {
    /* 资源级可用属性：用户维度 ｜ 认证维度（认证要求即条件组内的认证维度条件行）
       ｜ 环境属性中的网络与时间类（REQ_ENV_ATTRS） */
    const okUser = a.dim === "user", okAuth = a.dim === "auth", okEnv = a.cat === "env" && REQ_ENV_ATTRS.includes(a.id);
    if (!okUser && !okAuth && !okEnv) { out.push({ level: "err", text: `「${a.label}」不在资源级可用属性范围——请到「资产访问控制策略」配置` }); return out; }
  }
  if (n.attr === "client.software") {
    if (!n.v || !n.v.sw) out.push({ level: "err", text: "客户端软件条件缺少主段：软件名称为必选（仅选版本无法定位软件）" });
    return out;
  }
  if (n.mode === "ref") {
    if (!n.ref) out.push({ level: "err", text: `「${a.label}」的取值模式为属性引用，但未选择被引用属性` });
    else if (!REF_GROUPS.some(g => g.includes(n.attr) && g.includes(n.ref))) out.push({ level: "err", text: `「${a.label}」与「${attrFullLabel(n.ref)}」不在同一语义轴，不构成同源比较` });
    return out;
  }
  if (!n.op) { out.push({ level: "err", text: `「${a.label}」未选择运算符` }); return out; }
  /* 运算符必须落在属性支持的集合内——历史文本反解出的「=」等越界运算符在此暴露，
     不再出现「下拉为空但校验通过」的不一致状态 */
  const ops = opsOf(a);
  if (!ops.includes(n.op)) { out.push({ level: "err", text: `「${a.label}」的运算符「${OP_LABEL[n.op] || n.op}」不在该属性支持的取值方式内（支持：${ops.map(o => OP_LABEL[o] || o).join(" / ")}）` }); return out; }
  const empty = n.v == null || (Array.isArray(n.v) && n.v.length === 0) || n.v === "" || (typeof n.v === "object" && !Array.isArray(n.v) && !n.v.sw && !n.v.os && !n.v.days);
  if (empty) { out.push({ level: "err", text: `「${a.label}」未填写取值` }); return out; }
  /* 取值形态校验：格式类阻断保存，语义类仅警告（§8.6 值编辑器内联校验） */
  const vi = valIssue(a, n);
  if (vi) out.push(vi);
  return out;
}
function validateDs(scopeOverride) {
  const D = S.designer, errs = [], warns = [];
  /* 页 B「设置访问要求」复用同一套校验（用户指令：构造器与资产访问控制策略一致）：
     闭包按 scope 切换为资源级（path = 用户 + 认证 + 环境）；页 A 专有的「动作 / 启用位」
     断言在 path 作用域下跳过——页 B 没有这两个字段。 */
  const pathScope = (scopeOverride || D.scope) === "path";
  if (!D.rootOp) errs.push({ uid: "root", text: "未选择根组关系：须在顶部选择「满足全部条件（且）」或「满足任一条件（或）」" });
  else if (D.rootOp !== D.tree.op) D.tree.op = D.rootOp;
  walkTree(D.tree, (n) => {
    if (n.t === "g") {
      if (!(n.ch || []).length) { n._err = 1; errs.push({ uid: n.uid, text: "存在空组：任何组至少需要 1 个子节点" }); }
      else delete n._err;
      return;
    }
    const iss = condIssues(n, pathScope ? { closure: "path" } : { closure: "mode", mode: D.mode });
    if (iss.length) {
      n._err = 1;
      iss.forEach(x => (x.level === "err" ? errs : warns).push({ uid: n.uid, text: x.text }));
      return;
    }
    delete n._err;
  });
  const dp = countDeep(D.tree);
  if (dp >= MAX_DEPTH) warns.push({ uid: "root", text: `表达式已用满 ${MAX_DEPTH} 层嵌套：第 ${MAX_DEPTH} 层内只能放条件行，如需更深请等价改写或拆分为多条策略` });
  if (D.rootOp === "or" && D.tree.op === "or") warns.push({ uid: "root", text: "根组关系为「或」（满足任一条件即准入）：作用面较大，请确认授权范围符合预期" });
  /* 无端形态下「部门」等主体属性取自平台身份链（非 UA 派生），不构成可伪造项，故不再挂载该提示；
     无端不可得属性已由闭包判定阻断，无需重复告警 */
  if (!pathScope) {
    const allow = (POLICIES[D.asId] || {})[D.mode] || [];
    const other = allow.filter(p => p.action === "allow" && p.on && p.id !== D.polId);
    if (D.action === "allow" && !other.length && !D.on) warns.push({ uid: "root", text: "本形态组内将没有任何启用的「允许」策略：该形态的全部请求都会被默认拒绝" });
  }
  return { errs, warns };
}

/* ---- 值编辑器 ---- */
/* 取值池驱动的下拉（枚举型 / 二值型共用）：取值一律取自值域池，缺失由调用方给空态提示 */
function selHTML(c, opts, ph) {
  return `<select class="mini-inp" data-act="dsField" data-uid="${c.uid}" data-f="v"><option value="">${ph || "选择…"}</option>${opts.map(x => `<option ${c.v === x ? "selected" : ""}>${x}</option>`).join("")}</select>`;
}
function valWrapHTML(c, mode) {
  const a = attrById(c.attr); if (!a) return "";
  const isRef = c.mode === "ref";
  /* 页 B（资源级）只开放用户维度与网络时间类环境属性，引用候选须同样受该范围约束 */
  const refs = refOptions(c, (S.designer && S.designer.scope === "path") ? "path" : mode);
  const seg = refs.length ? `<div class="seq" style="margin-right:2px"><div class="seg" style="font-size:12.5px">
      <button class="${!isRef ? "on" : ""}" data-act="dsMode" data-uid="${c.uid}" data-v="const">常量值</button>
      <button class="${isRef ? "on" : ""}" data-act="dsMode" data-uid="${c.uid}" data-v="ref">属性引用</button></div></div>` : "";
  if (isRef) {
    return `<span class="val">${seg}<select class="mini-inp" data-act="dsField" data-uid="${c.uid}" data-f="ref">
      <option value="">选择被引用属性…</option>${refs.map(r => `<option value="${r.id}" ${c.ref === r.id ? "selected" : ""}>${r.cat === "subject" ? (r.dim === "user" ? "当前登录用户 · " : "") : ""}${r.label}（${r.id}）</option>`).join("")}</select>
      <span class="mini">同源比较：如「设备所属人员 = 当前登录用户」</span></span>`;
  }
  let ed = "";
  if (c.attr === "client.software") {
    const sw = softById((c.v || {}).sw) || null;
    const vers = sw ? sw.versions : [];
    /* 级联禁用的原因与可用性同源产出：一处算出，控件只引用，避免「同一个理由在几个控件上各写一遍」 */
    const swWhy = sw ? "" : "请先选择软件名称：运算符与可选版本都取自该软件的版本库";
    const swVerWhy = sw ? "当前为「不限版本」：如需限定具体版本，请先选择版本运算符" : "请先选择软件名称";
    const swVerOpAttr = sw ? "" : `disabled title="${swWhy}"`;
    const swVerAttr = (sw && (c.v || {}).verOp) ? "" : `disabled title="${swVerWhy}"`;
    ed = `<select class="mini-inp" data-act="dsField" data-uid="${c.uid}" data-f="sw"><option value="">软件名称（必选）…</option>
        ${SOFT_LIB.map(s => `<option value="${s.id}" ${(c.v || {}).sw === s.id ? "selected" : ""}>${s.name}</option>`).join("")}</select>
      <select class="mini-inp" data-act="dsField" data-uid="${c.uid}" data-f="verOp" ${swVerOpAttr}>
        <option value="">不限版本</option>${["eq", "ne", "gte", "lte"].map(o => `<option value="${o}" ${(c.v || {}).verOp === o ? "selected" : ""}>${OP_LABEL[o]}</option>`).join("")}</select>
      <select class="mini-inp" data-act="dsField" data-uid="${c.uid}" data-f="ver" ${swVerAttr}>
        <option value="">选择版本…</option>${vers.map(v => `<option ${((c.v || {}).ver) === v ? "selected" : ""}>${v}</option>`).join("")}</select>
      <span class="mini">名称必选、版本可选（留空 = 任意版本）；版本选项来自客户端软件库</span>`;
  } else if (c.attr === "device.os") {
    /* 与「客户端软件」同构：名称必选 + 版本可选（版本带比较运算符，默认 ≥） */
    const os = (c.v || {}).os || "", vv = (c.v || {}).ver || "", vop = (c.v || {}).verOp || "";
    const vers = (VALUE_POOL["device.os"] || {})[os] || [];
    /* 与「客户端软件」同规：禁用原因一处算出 */
    const osWhy = os ? "" : "请先选择操作系统：运算符与可选版本都取自该系统的版本库";
    const osVerWhy = os ? "当前为「不限版本」：如需限定具体版本，请先选择版本运算符" : "请先选择操作系统";
    const osVerOpAttr = os ? "" : `disabled title="${osWhy}"`;
    const osVerAttr = (os && vop) ? "" : `disabled title="${osVerWhy}"`;
    ed = `<select class="mini-inp" data-act="dsField" data-uid="${c.uid}" data-f="os"><option value="">选择操作系统…</option>
        ${Object.keys(VALUE_POOL["device.os"]).map(k => `<option ${os === k ? "selected" : ""}>${k}</option>`).join("")}</select>
      <select class="mini-inp" data-act="dsField" data-uid="${c.uid}" data-f="osverop" ${osVerOpAttr}>
        <option value="">不限版本</option>${["gte", "lte", "eq", "ne"].map(o => `<option value="${o}" ${vop === o ? "selected" : ""}>${OP_LABEL[o]}</option>`).join("")}</select>
      <select class="mini-inp" data-act="dsField" data-uid="${c.uid}" data-f="osver" ${osVerAttr}>
        <option value="">选择版本…</option>${vers.map(v => `<option ${vv === v ? "selected" : ""}>${v}</option>`).join("")}</select>`;
  } else if (c.attr === "env.time") {
    const t = normTime(c.v), custom = t.preset === "custom", DOW = ["一", "二", "三", "四", "五", "六", "日"];
    ed = `<div class="tw">
      <div class="twrow"><span class="lb">日期</span>
        <div class="pre">${TIME_PRESETS.map(p => `<span class="${t.preset === p[0] ? "on" : ""}" data-act="dsTpre" data-uid="${c.uid}" data-v="${p[0]}">${p[1]}</span>`).join("")}</div>
        <div class="dow ${custom ? "" : "off"}">${DOW.map((d, i) => custom
          ? `<span class="${t.days.includes(i + 1) ? "on" : ""}" data-act="dsDow" data-uid="${c.uid}" data-d="${i + 1}">周${d}</span>`
          : `<span title="选择「自定义」后可逐日勾选">周${d}</span>`).join("")}</div></div>
      <div class="twrow"><span class="lb">月份</span>
        <div class="mo">${Array.from({ length: 12 }, (_, i) => `<span class="${t.months.includes(i + 1) ? "on" : ""}" data-act="dsTmon" data-uid="${c.uid}" data-m="${i + 1}">${i + 1}月</span>`).join("")}<span class="${t.months.length ? "" : "on"}" data-act="dsTmon" data-uid="${c.uid}" data-m="0">全年</span></div></div>
      <div class="twrow"><span class="lb">时段</span>
        <input type="text" class="mini-inp" style="width:70px" value="${esc(t.from)}" data-act="dsField" data-uid="${c.uid}" data-f="from">
        <span class="ar">–</span>
        <input type="text" class="mini-inp" style="width:70px" value="${esc(t.to)}" data-act="dsField" data-uid="${c.uid}" data-f="to">
        <select class="mini-inp" data-act="dsField" data-uid="${c.uid}" data-f="tz">${["Asia/Shanghai", "UTC"].map(z => `<option ${t.tz === z ? "selected" : ""}>${z}</option>`).join("")}</select>
        <span class="mini">法定工作日 / 法定节假日按国务院办公厅年度放假安排（含调休）判定，随年度更新；不选月份即全年</span></div>
    </div>`;
  } else if (a.type === "org") {
    const vals = Array.isArray(c.v) ? c.v : [];
    ed = `<div class="sel-wrap"><button class="sel-btn ${vals.length ? "" : "ph"}" data-act="dsPop" data-uid="${c.uid}" data-f="org"><span class="cv">${vals.length ? vals.map(orgName).join("、") : "选择组织机构…"}</span><span class="ar">▾</span></button>
      ${popOpen(c.uid, "org") ? orgPopHTML(c) : ""}</div>
      <label class="qty"><input type="checkbox" data-act="dsField" data-uid="${c.uid}" data-f="inc" ${c.inc ? "checked" : ""}> 含子组织</label>`;
  } else if (a.type === "enum-multi" || a.type === "list") {
    const vals = Array.isArray(c.v) ? c.v : [];
    const isList = a.type === "list";
    ed = `<div class="sel-wrap"><button class="sel-btn ${vals.length ? "" : "ph"}" data-act="dsPop" data-uid="${c.uid}" data-f="multi"><span class="cv">${vals.length ? vals.slice(0, 3).join("、") + (vals.length > 3 ? ` 等 ${vals.length} 项` : "") : (isList ? "录入多值…" : "选择取值…")}</span><span class="ar">▾</span></button>
      ${popOpen(c.uid, "multi") ? multiPopHTML(c) : ""}</div>${anyAllHTML(c, a)}`;
  } else if (a.type === "enum-order") {
    ed = `<select class="mini-inp" data-act="dsField" data-uid="${c.uid}" data-f="v"><option value="">选择${a.label}…</option>${(VALUE_POOL[c.attr] || []).map(x => `<option ${c.v === x ? "selected" : ""}>${x}</option>`).join("")}</select>
      ${c.op === "between" ? `<select class="mini-inp" data-act="dsField" data-uid="${c.uid}" data-f="v2"><option value="">到…</option>${(VALUE_POOL[c.attr] || []).map(x => `<option ${Array.isArray(c.v) && c.v[1] === x ? "selected" : ""}>${x}</option>`).join("")}</select>` : ""}`;
  } else if (a.type === "ref-search") {
    const vals = Array.isArray(c.v) ? c.v : (c.v ? [c.v] : []);
    ed = `<div class="sel-wrap"><button class="sel-btn ${vals.length ? "" : "ph"}" data-act="dsPop" data-uid="${c.uid}" data-f="multi"><span class="cv">${vals.length ? vals.join("、") : "搜索选择…"}</span><span class="ar">▾</span></button>${popOpen(c.uid, "multi") ? multiPopHTML(c) : ""}</div>${anyAllHTML(c, a)}`;
  } else if (a.type === "ip") {
    const vals = Array.isArray(c.v) ? c.v : [];
    ed = `<input type="text" class="mini-inp" style="min-width:180px" placeholder="10.20.0.0/16" value="${esc(vals.join(", "))}" data-act="dsField" data-uid="${c.uid}" data-f="csv"><span class="mini">支持单 IP / CIDR / 起止范围，多个用逗号分隔</span>`;
  } else if (a.type === "bool") {
    /* 二值属性与枚举型同源：取值一律取自值域池，不在渲染层按属性名硬编码 */
    ed = selHTML(c, VALUE_POOL[c.attr] || []);
  } else {
    /* 枚举型（enum-one）：取值取自值域池；未登记时给显式空态提示，
       不再张冠李戴兜底（历史缺陷：device.reg 借用了软件签名状态的取值） */
    const pool = VALUE_POOL[c.attr] || [];
    ed = pool.length ? selHTML(c, pool) : `<span class="mini">该属性暂未登记可选值域，请在「属性字典」中补录后再配置取值</span>`;
  }
  return `<span class="val">${seg}${ed}</span>`;
}
function popOpen(id, f) { return S.pop && S.pop.uid === id && S.pop.f === f; }

/* 属性选择弹层（两级：一级维度 / 二级属性 + 形态闭包置灰）
   一级按属性字典的类别归属分组（主体属性 / 环境属性），二级列出该维度下属性；
   页 B 资源级：主体维度含用户 / 认证（认证要求即认证维度条件行），环境维度仅网络与时间类（REQ_ENV_ATTRS）；
   页 A 准入：主体维度含用户 / 认证 / 客户端软件 / 终端设备，环境维度全量 */
function attrPopHTML(c) {
  const mode = S.designer.mode, pathScope = S.designer.scope === "path";
  const a = byId(S.designer.asId);
  const dims = pathScope ? ["user", "auth", "env"] : CAT_DIMS.subject.concat(CAT_DIMS.env);
  const listOf = d => {
    const list = ATTR_DICT.filter(x => x.dim === d);
    return (pathScope && d === "env") ? list.filter(x => REQ_ENV_ATTRS.includes(x.id)) : list;
  };
  /* 默认维度 = 条件行已选属性所属维度；未选属性时取一级首项 */
  const onAttr = c.attr ? attrById(c.attr) : null;
  const cur = (S.pop && S.pop.dim && dims.indexOf(S.pop.dim) >= 0 && listOf(S.pop.dim).length)
    ? S.pop.dim : (onAttr ? onAttr.dim : dims[0]);
  const nav = d => {
    /* 「仅限有端」按**闭包实算**：该维度内是否存在当前形态可得的属性。
       历史做法按维度名枚举硬判（!== user / auth / env 即视为仅限有端）——属性字典新增维度、
       调整 scope 或形态闭包时都会失真。 */
    const items = listOf(d);
    const avail = pathScope ? items.length : items.filter(x => inClosure(x.id, mode)).length;
    const onlyAgent = !pathScope && items.length > 0 && avail === 0;
    return `<div class="nv ${d === cur ? "on" : ""}" data-act="dsAttrDim" data-uid="${c.uid}" data-dim="${d}">
      <span>${DIM_LABEL[d]}</span><span class="n">${onlyAgent ? "仅限有端" : items.length + " 项"}</span></div>`;
  };
  const catCells = (cat, label) => {
    const ds = dims.filter(d => (d === "env") === (cat === "env"));
    return ds.length ? `<div class="grp-t">${label}</div>` + ds.map(nav).join("") : "";
  };
  const items = listOf(cur).map(x => {
    const grey = !inClosure(x.id, mode);
    return `<div class="it ${grey ? "dis" : ""} ${c.attr === x.id ? "on" : ""}" ${grey ? `data-act="dsGreyTip" data-attr="${x.id}"` : `data-act="dsAttr" data-uid="${c.uid}" data-attr="${x.id}"`}>${x.label} <span class="mini">${x.editor}</span></div>`;
  }).join("");
  const tip = pathScope
    ? `<div class="tip">本页条件组支持<b>用户维度</b>、<b>认证维度</b>（认证要求即认证维度条件行）与<b>环境属性（网络与时间类）</b>；客户端软件 / 终端设备、地理位置与接入网络类型归「资产访问控制策略」。认证维度属性取自平台认证方式字典：<b>级别档位固定 L1~L5 且序不变</b>（不新增不删除），可自定义级别名称与判定含义与各级别下的方式集合。</div>`
    : `<div class="tip blue">置灰项为当前形态（${MODE_LABEL[mode]}）不可得属性，配置后不会生效${mode === "agentless" && (a.modes || []).includes("agent") ? `。<span class="lk" data-act="dsToAgent">切换到「有端接入策略组」配置 →</span>` : ""}</div>`;
  return `<div class="sel-pop show two">
    <div class="sp-l">${catCells("subject", "主体属性")}${catCells("env", "环境属性")}</div>
    <div class="sp-r"><div class="grp-s">${DIM_LABEL[cur]}属性</div>${items || `<div class="empty">该维度当前无可选属性</div>`}</div>
    ${tip}</div>`;
}
/* 组织树弹层 */
function orgPopHTML(c) {
  const vals = Array.isArray(c.v) ? c.v : [];
  const node = (n, dep) => `<div class="nd"><label><input type="checkbox" data-act="dsOrg" data-uid="${c.uid}" data-org="${n.id}" ${vals.includes(n.id) ? "checked" : ""}> ${n.name}</label>
    ${n.kids ? `<div class="kids">${n.kids.map(k => node(k, dep + 1)).join("")}</div>` : ""}</div>`;
  return `<div class="sel-pop show"><div class="grp-t">组织机构（平台组织树）</div>${ORG_TREE.map(n => node(n, 0)).join("")}
    <div class="tip">勾选父组织时若需覆盖下级，请在条件行上打开「含子组织」。</div></div>`;
}
/* 多值列表（可单独重渲染：搜索输入时只换列表容器，保输入焦点） */
function multiListHTML(c) {
  const vals = Array.isArray(c.v) ? c.v : [];
  const raw = VALUE_POOL[c.attr];
  const groups0 = Array.isArray(raw) ? [{ t: "", items: raw }] : (raw ? Object.keys(raw).map(k => ({ t: k, items: raw[k] })) : []);
  /* 引用型属性（E11）支持搜索定位：输入即过滤（跨分组），无匹配时给出显式空态 */
  const kw = ((S.pop && S.pop.kw) || "").trim().toLowerCase();
  const groups = groups0.map(g => ({ t: g.t, items: g.items.filter(x => !kw || String(x).toLowerCase().indexOf(kw) >= 0) })).filter(g => g.items.length);
  if (!groups.length) return `<div class="mini" style="padding:8px 9px">${kw ? "无匹配取值" : "该属性暂未登记可选值域，请在「属性字典」中补录后再配置取值"}</div>`;
  return groups.map(g => (g.t ? `<div class="grp-s">${esc(g.t)}</div>` : "") + g.items.map(x => `<div class="it ${vals.includes(x) ? "on" : ""}" data-act="dsMulti" data-uid="${c.uid}" data-v="${esc(x)}">${esc(x)}</div>`).join("")).join("");
}
function multiPopHTML(c) {
  const a = attrById(c.attr);
  const vals = Array.isArray(c.v) ? c.v : [];
  if (a.type === "list") {
    return `<div class="sel-pop show"><div class="grp-t">多值录入（一行一条，支持批量粘贴）</div>
      <textarea class="mini-inp" style="width:100%;height:120px" data-act="dsField" data-uid="${c.uid}" data-f="lines" placeholder="SN-2026-0001&#10;SN-2026-0002">${esc(vals.join("\n"))}</textarea>
      <div class="tip">去重后生效；最多 500 条。${c.attr === "device.serial" ? attrFullLabel("device.serial") + "由有端 SDK 采集。" : ""}</div></div>`;
  }
  const kw = (S.pop && S.pop.kw) || "";
  const search = a.type === "ref-search"
    ? `<input type="text" class="mini-inp" style="width:100%;box-sizing:border-box;margin-bottom:4px" placeholder="输入关键字搜索取值…" value="${esc(kw)}" data-act="dsKw" data-uid="${c.uid}">`
    : "";
  const tip = (a.q || "both") === "none" ? "取值语义由运算符表达"
    : (a.q === "any" ? "本属性锁定「任一命中」：多个取值按「任一命中」判定，即白名单写法（∈ {甲, 乙} 放行甲或乙、其余默认拒绝）；新增取值不做反向放行，故与「≠ 甲」那种排除法不等价" : "多值语义由条件行上的「任一命中 / 全部具备」开关决定");
  const head = `选择取值（多选）${vals.length ? ` · <span class="lk" data-act="dsClear" data-uid="${c.uid}">清空</span>` : ""}`;
  return `<div class="sel-pop show"><div class="grp-t">${head}<span class="mini" style="float:right">已选 ${vals.length} 项</span></div>
    ${search}
    <div id="kwBox_${c.uid}">${multiListHTML(c)}</div>
    <div class="tip">${tip}${a.type === "ref-search" ? "；引用型属性支持搜索定位" : ""}。</div></div>`;
}

/* ---- 组 / 条件行渲染 ---- */
function grpHTML(node, depth) {
  const cnt = (node.ch || []).length;
  const canSub = depth < MAX_DEPTH;
  return `<div class="gc lv${depth}" data-uid="${node.uid}">
    <div class="gch">
      <span class="muted" style="font-size:12.5px">${depth === 1 ? "根组" : "第 " + depth + " 层组"}</span>
      <span class="op">
        ${depth === 1
          ? `<button class="${node.op === "and" ? "on" : ""}" data-act="dsOp" data-uid="${node.uid}" data-v="and">满足全部（且）</button>
             <button class="${node.op === "or" ? "on" : ""}" data-act="dsOp" data-uid="${node.uid}" data-v="or">满足任一（或）</button>`
          : `<button class="${node.op === "and" ? "on" : ""}" data-act="dsOp" data-uid="${node.uid}" data-v="and">且</button>
             <button class="${node.op === "or" ? "on" : ""}" data-act="dsOp" data-uid="${node.uid}" data-v="or">或</button>
             <button class="not ${node.op === "not" ? "on" : ""}" data-act="dsOp" data-uid="${node.uid}" data-v="not">非</button>`}
      </span>
      <span class="cnt">${cnt} 项</span>
      <span class="ops2">
        <button class="btn sm" data-act="dsAddCond" data-uid="${node.uid}">+ 条件</button>
        <button class="btn sm" ${canSub ? "" : "disabled title=\"已达 3 层上限：第 3 层内只能放条件行，如需更深请等价改写或拆分为多条策略\""} data-act="dsAddGroup" data-uid="${node.uid}">+ 子组</button>
        ${depth === 1 ? "" : `<button class="btn sm danger" data-act="dsDel" data-uid="${node.uid}">删除组</button>`}
      </span>
    </div>
    <div class="gcb">
      ${cnt ? (node.ch || []).map(k => k.t === "g" ? grpHTML(k, depth + 1) : condHTML(k)).join("") : `<div class="mini" style="padding:6px 4px">空组 —— 请添加条件或子组（空组将阻断保存）</div>`}
      ${!canSub ? `<div class="mini" style="padding:4px">已达 ${MAX_DEPTH} 层上限：第 ${MAX_DEPTH} 层组内只能放条件行。</div>` : ""}
    </div></div>`;
}
function condHTML(c) {
  const a = attrById(c.attr);
  /* 运算符以属性字典的 ops 声明为准；历史上的 role / tag 硬编码特判已由属性级 ops 取代 */
  const ops = a ? opsOf(a) : [];
  return `<div class="cond-row ${c._err ? "bad" : ""}" data-uid="${c.uid}">
    <div class="sel-wrap">
      <button class="sel-btn ${c.attr ? "" : "ph"}" data-act="dsPop" data-uid="${c.uid}" data-f="attr">
        <span class="cv">${c.attr ? `${CAT_LABEL[a.cat]} · ${DIM_LABEL[a.dim]} · ${a.label}` : "选择属性…"}</span><span class="ar">▾</span></button>
      ${popOpen(c.uid, "attr") ? attrPopHTML(c) : ""}
    </div>
    ${a && c.attr !== "client.software" ? `<select class="mini-inp" data-act="dsField" data-uid="${c.uid}" data-f="op" ${c.mode === "ref" ? "disabled title=\"同源比较：运算符固定为「=」，取值随被引用的属性走\"" : ""}>
      <option value="">运算符…</option>${ops.map(o => `<option value="${o}" ${c.op === o ? "selected" : ""}>${OP_LABEL[o]}</option>`).join("")}</select>` : ""}
    ${a && c.attr === "client.software" ? `<span class="tagx">复合条件 · 名称必选 + 版本可选</span>` : ""}
    ${a ? valWrapHTML(c, S.designer.mode) : ""}
    ${a && a.scope === "agent" ? `<span class="note">有端专属属性</span>` : ""}
    <span class="ops">
      <button class="btn sm" data-act="dsDup" data-uid="${c.uid}" title="在同组内原位复制本条件行">复制</button>
      <button class="btn sm danger" data-act="dsDel" data-uid="${c.uid}">删除</button>
    </span>
  </div>`;
}

/* ---- 设计器主体 ---- */
function openDesigner(asId, mode, polId) {
  const a = byId(asId);
  /* R1 资产生命周期冻结：撤销中 / 异常期间准入策略整体只读，设计器不开放（设计稿 §6.3 只读态来源） */
  if (a && (a.open === "撤销中" || a.open === "异常")) {
    toast(`该资产处于「${a.open}」状态，准入策略整体只读：` + (a.open === "撤销中"
      ? "撤销编排进行中，请待撤销完成后重试。"
      : "无端访问编排未完成，请先在资产列表「状态」列点「重试」幂等续跑。"));
    return;
  }
  let p = null;
  if (polId) p = ((POLICIES[asId] || {})[mode] || []).find(x => x.id === polId);
  /* 动作只有「允许 / 拒绝」两态；历史数据中的其他动作一律归一为「允许」 */
  const act = p && p.action === "reject" ? "reject" : "allow";
  S.designer = p
    ? { asId, mode, polId, name: p.name, rootOp: p.cond.op, action: act, on: p.on, tree: ensureUid(clone(p.cond)), by: p.by, at: p.at }
    /* 新建策略默认未启用：启用即生效，保存动作不自动扩大生效面（与「复制」副本同口径） */
    : { asId, mode, polId: null, name: "", rootOp: "", action: "allow", on: false, tree: { t: "g", op: "", ch: [], uid: uid() }, by: "张伟", at: "" };
  /* R4 离页脏检查基线：名称 / 根组关系 / 动作 / 启用 / 条件树任一变化才算「有改动」 */
  S.designer._snap = dsSnap(S.designer);
  S.view = "designer"; S.pop = null;
  renderAsp();
}
/* R4 设计器状态签名：只取会影响落库结果的字段，避免 uid / 重渲染痕迹造成误判 */
function dsSnap(D) {
  /* 只序列化语义字段：uid 与 _err / _raw 等运行时标记一律不进签名——
     校验过程本身会写 _err，若把它算进签名，任何一次校验收敛都会被误判成「用户改过」，
     离页确认就退化成永远弹窗的噪声。 */
  const clean = (n) => {
    if (!n) return null;
    const o = { t: n.t, op: n.op, attr: n.attr, v: n.v, inc: n.inc, q: n.q, mode: n.mode, ref: n.ref };
    if (n.t === "g") o.ch = (n.ch || []).map(clean);
    return o;
  };
  return JSON.stringify({ n: D.name, op: D.rootOp, ac: D.action, on: D.on, t: clean(D.tree) });
}
function renderDesignerInto() {
  /* `S.view === "designer"` 与 `S.designer` 是两个状态位，只归位其一就会在这里抛错、整页 JS 中断；
     取不到设计器上下文一律与列表 / 矩阵回退同规——状态位与画面一并归位到页 A 列表。 */
  const D = S.designer, a = D && byId(D.asId);
  if (!a) { S.designer = null; S.sel = null; S.view = "list"; S.pop = null; renderAsp(); return; }
  /* R10 跨形态迁移入口：只有双形态资产存在「另一形态组」；条件能否随迁须按目标形态闭包预校验 */
  const otherMode = ((a && a.modes) || []).find(m => m !== D.mode) || "";
  const v = validateDs();
  const rb = rbTree(D.tree);
  const sel = (S.sel && S.sel.uid) ? findNode(D.tree, S.sel.uid) : null;
  const selAttr = sel && sel.n.t === "c" ? attrById(sel.n.attr) : null;

  $("#pg-asp").innerHTML = `
  <div class="title-row">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="btn" data-act="dsCancel">← 返回</button>
      <h2 style="margin:0">${D.polId ? "编辑准入策略" : "新增准入策略"}</h2>
      <span class="mtag ${D.mode === "agentless" ? "eg" : "ag"}">${MODE_LABEL[D.mode]}策略组</span>
      <span class="muted">${esc(a.name)}</span>
    </div>
    <div class="toolbar" style="flex:0 0 auto; align-items:center">
      <span class="mini">形态由所在策略组决定（只读）</span>
      ${otherMode
        ? `<button class="btn" data-act="dsXMode" title="把当前条件树复制到${MODE_LABEL[otherMode]}策略组：目标形态属性闭包不含的条件会被拦下、不予落库；副本以未启用落库">复制到${MODE_LABEL[otherMode]}策略组</button>`
        : `<span class="mini">该资产仅登记单一接入形态，无另一策略组可迁移</span>`}
    </div>
  </div>
  <div class="dsg-top">
    <div class="fld" style="min-width:170px"><label>接入形态（只读 · 由策略组继承）</label>
      <div class="stack-chip" style="height:32px;width:100%;box-sizing:border-box"><span class="mtag ${D.mode === "agentless" ? "eg" : "ag"}">${MODE_LABEL[D.mode]}</span>策略组</div></div>
    <div class="fld grow"><label>策略名称 <span class="req">*</span></label>
      <input type="text" id="dsName" value="${esc(D.name)}" placeholder="如：研发平台准入" data-act="dsField" data-f="name"></div>
    <div class="fld"><label>根组关系 <span class="req">*</span>（必选、无默认值）</label>
      <select class="mini-inp" data-act="dsRoot" style="height:32px">
        <option value="">请选择…</option>
        <option value="and" ${D.tree.op === "and" ? "selected" : ""}>满足全部条件（且）</option>
        <option value="or" ${D.tree.op === "or" ? "selected" : ""}>满足任一条件（或）</option>
      </select></div>
    <div class="fld"><label>动作</label>
      <select class="mini-inp" data-act="dsAct" style="height:32px">
        ${[["allow", "允许"], ["reject", "拒绝"]].map(([k, t]) => `<option value="${k}" ${D.action === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
    <div class="fld"><label>启用</label>
      <span class="sw-wrap"><label class="switch"><input type="checkbox" data-act="dsOn" ${D.on ? "checked" : ""}><span class="sl"></span></label></span></div>
  </div>
  <div class="dsg">
    <div>
      <div class="card"><div class="card-h"><h3>条件构造区<span class="sub">布尔组树 · 最高 ${MAX_DEPTH} 层嵌套</span></h3>
        <span class="muted">组内只放同类子节点；混用「且/或」请改用子组</span></div>
        <div class="card-b">${grpHTML(D.tree, 1)}</div></div>
    </div>
    <div class="dsg-side">
      <div class="card"><div class="card-h"><h3>实时回读</h3></div><div class="card-b">
        <div class="rb-line">${esc(rb.text) || "—"}</div>
        <details class="rb-fold"${S.dsRbFold ? "" : " open"} ontoggle="S.dsRbFold=!this.open"><summary>括号式结构回读</summary>
          <div class="rb-code">${esc(rb.code)}</div></details>
        <div class="mini" style="margin-top:8px">动作：<b>${D.action === "allow" ? "允许" : "拒绝"}</b>　形态：${MODE_LABEL[D.mode]}（只读）</div>
      </div></div>
      <div class="card"><div class="card-h"><h3>校验</h3><span class="mini">${v.errs.length ? v.errs.length + " 项错误" : v.warns.length ? v.warns.length + " 项警告" : "通过"}</span></div>
        <div class="card-b"><div class="vlist">
          ${v.errs.map(e => `<div class="vi err"><span class="n">错误</span><span class="t">${esc(e.text)}</span></div>`).join("")}
          ${v.warns.map(e => `<div class="vi warn"><span class="n">警告</span><span class="t">${esc(e.text)}</span></div>`).join("")}
          ${!v.errs.length && !v.warns.length ? `<div class="vi ok"><span class="n">通过</span><span class="t">结构合法、属性均在闭包内、取值完整</span></div>` : ""}
        </div></div></div>
      <div class="card"><div class="card-h"><h3>属性说明</h3></div><div class="card-b">
        ${selAttr ? `<div class="kv" style="grid-template-columns:70px 1fr"><div class="k">属性</div><div><b>${selAttr.label}</b></div></div>
        <div class="kv" style="grid-template-columns:70px 1fr"><div class="k">类别</div><div>${CAT_LABEL[selAttr.cat]} · ${DIM_LABEL[selAttr.dim]}</div></div>
        <div class="kv" style="grid-template-columns:70px 1fr"><div class="k">编辑器</div><div>${selAttr.editor}　<span class="mini">由取值结构决定</span></div></div>
        <div class="kv" style="grid-template-columns:70px 1fr"><div class="k">取值示例</div><div class="mini">${esc(selAttr.ex)}</div></div>
        <div class="kv" style="grid-template-columns:70px 1fr"><div class="k">属性源</div><div class="mini">${esc(selAttr.src)}</div></div>
        <div class="kv" style="grid-template-columns:70px 1fr"><div class="k">可得性</div><div class="mini">${selAttr.scope === "agent" ? "仅<b>有端接入</b>可得（当前组：" + MODE_LABEL[D.mode] + "）" : "无端 / 有端<b>均可得</b>"}</div></div>
        ${AUTH_ATTRS.indexOf(selAttr.id) >= 0 ? `<div class="kv" style="grid-template-columns:70px 1fr"><div class="k">期次</div><div class="mini">级别档位固定 L1~L5、渲染层不裁剪；一期会话认证强度上限 <b>L2</b>，声明 L3~L5 时保存侧提示「待二期承载后生效」且不阻断保存</div></div>` : ""}`
        : `<div class="mini">选中某个条件行后，这里显示该属性的类别、编辑器选型、取值示例、属性源与可得性。</div>`}
      </div></div>
    </div>
  </div>
  <div class="card"><div class="card-b" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div id="dsSaveNote" class="save-note">保存时将自动扁平化属性条件</div>
    <div class="toolbar"><button class="btn" data-act="dsCancel">取消</button><button class="btn primary" data-act="dsSave">保存</button></div>
  </div></div>`;
  const nm = $("#dsName"); if (nm && S.focusName) { nm.focus(); S.focusName = false; }
}

/* ---- 树操作实现 ---- */
function dsCtx() { return S.designer; }
function dsAddCond(nid) { const f = findNode(dsCtx().tree, nid); if (f) { f.n.ch.push({ t: "c", attr: "", op: "", v: null, mode: "const", uid: uid() }); renderAsp(); } }
function dsAddGroup(nid) {
  const f = findNode(dsCtx().tree, nid); if (!f) return;
  if (f.d >= MAX_DEPTH) { toast("已达 3 层上限：请等价改写或拆分为多条策略"); return; }
  const op = f.n.op === "and" ? "or" : "and";     // 子组默认取相反类型，便于立刻表达「且中的或」
  f.n.ch.push({ t: "g", op, ch: [], uid: uid() }); renderAsp();
}
function dsDel(nid) {
  const f = findNode(dsCtx().tree, nid); if (!f || !f.p) return;
  f.p.ch = f.p.ch.filter(k => k.uid !== nid); if (S.sel && S.sel.uid === nid) S.sel = null; renderAsp();
}
function dsOp(nid, v) { const f = findNode(dsCtx().tree, nid); if (f) { f.n.op = v; if (f.d === 1) { dsCtx().rootOp = v; } renderAsp(); } }
function dsField(nid, f, val, el) {
  const n = findNode(dsCtx().tree, nid); if (!n) return;
  const c = n.n;
  if (c.t !== "c") return;
  const a = attrById(c.attr) || {};
  if (f === "sw") { c.v = c.v && typeof c.v === "object" ? c.v : {}; c.v.sw = val; c.v.verOp = ""; c.v.ver = ""; }
  else if (f === "verOp") { c.v = c.v || {}; c.v.verOp = val; if (!val) c.v.ver = ""; }
  else if (f === "ver") { c.v = c.v || {}; c.v.ver = val; }
  else if (f === "os") { c.v = { os: val, verOp: "", ver: "" }; }
  else if (f === "osverop") { c.v = c.v || {}; c.v.verOp = val; if (!val) c.v.ver = ""; }
  else if (f === "osver") { c.v = c.v || {}; c.v.ver = val; }
  else if (f === "inc") { c.inc = !!el.checked; }
  /* 列表型：去重保序 + 500 条上限（与弹层提示同口径） */
  else if (f === "lines") {
    const raw = String(val).split("\n").map(s => s.trim()).filter(Boolean);
    c.v = uniqKeep(raw).slice(0, 500);
    if (c.v.length < raw.length) toast(`已去重 / 截断：录入 ${raw.length} 条 → 生效 ${c.v.length} 条（上限 500 条）`);
  }
  else if (f === "csv") {
    const raw = String(val).split(/[,，]/).map(s => s.trim()).filter(Boolean);
    c.v = uniqKeep(raw);
    if (c.v.length < raw.length) toast(`已自动去重：录入 ${raw.length} 项 → 生效 ${c.v.length} 项`);
  }
  else if (f === "ref") { c.ref = val; }
  /* 运算符：切入 / 切出「之间」时在标量与两端数组之间转换（历史缺陷：v 与 v2 互相覆盖，第二端永不落库） */
  else if (f === "op") {
    const wasRange = Array.isArray(c.v);
    c.op = val;
    if (val === "between") c.v = wasRange ? c.v : [typeof c.v === "string" ? c.v : "", ""];
    else if (wasRange) c.v = c.v[0] || "";
  }
  else if (f === "from" || f === "to" || f === "tz") { c.v = normTime(c.v); c.v[f] = val; }
  else if (f === "v2") { c.v = [Array.isArray(c.v) ? (c.v[0] || "") : "", val]; }
  else if (f === "v") { c.v = (c.op === "between" && a.type === "enum-order") ? [val, Array.isArray(c.v) ? (c.v[1] || "") : ""] : val; }
  else { c.v = val; }
  renderAsp();
}
function dsAttr(nid, attr) {
  const n = findNode(dsCtx().tree, nid); if (!n) return;
  const c = n.n, a = attrById(attr);
  c.attr = attr; c.op = opsOf(a)[0]; c.v = a.type === "composite-soft" ? { sw: "", verOp: "", ver: "" } : (a.type === "time" ? { preset: "workday", days: [1, 2, 3, 4, 5], months: [], from: "09:00", to: "18:00", tz: "Asia/Shanghai" } : (a.type === "org" || a.type === "enum-multi" || a.type === "list" ? [] : ""));
  c.inc = false; c.q = "any"; c.mode = "const"; c.ref = "";
  /* 换属性即清掉上一轮的校验标记与原文兜底，避免旧态串到新属性上 */
  delete c._err; delete c._raw;
  S.sel = { uid: nid }; S.pop = null; renderAsp();
}
/* ==========================================================================
   页 B · 资产细粒度访问策略
   ========================================================================== */
/* P3：FG.readonly 曾是死赋值（赋值 1 处 / 读取 0 处），只读实际由局部 ro 承担 */
const FG = { view: "list", cur: "", filter: {}, rq: null, batch: null, sel: new Set() };

function renderFg() {
  if (!$("#pg-fg")) return;   /* 多页化：#pg-fg 只存在于 fine-grained.html */
  const el = $("#pg-fg");
  /* 「是否真的进矩阵」只有一处判定：取不到资产（FG.cur 为空或指向已不存在的资产）就归位列表。
     回退必须把 FG.view 一并归位——只换 innerHTML 会让视图状态与画面背离：列表渲染了却没有
     任何 pgmk 调用（页码条恒为空），而 FG.view 仍是 matrix，后续分页 / 筛选全部走错分支。 */
  const a = FG.view === "matrix" ? byId(FG.cur) : null;
  if (a) {
    el.innerHTML = renderFgMatrix(a);
    syncFgSel();
    if (WEB(a)) pgmk("#fgMxPager", window._fgMxTotal || 0, window.PFgMx, "fgMxPg", "条路径", MXP);
    else {
      pgmk("#fgFamPager", window._fgFamTotal || 0, window.PFgFam, "fgFamPg", "个对象", MXP);
      pgmk("#fgSubPager", window._fgSubTotal || 0, window.PFgSub, "fgSubPg", "条路径", MXP);
    }
    return;
  }
  FG.view = "list";
  el.innerHTML = renderFgList();
  pgmk("#fgPager", window._fgTotal || 0, window.PFg, "fgPg", "个资产", ASP_PAGE, "列表按资产维度，批量在资源级矩阵");
}
function fgStat(a) {
  const c = coverOf(a);
  return { c, configured: c.attr + c.login, total: c.total };
}
/* 列表空态分流（与页 A aspEmptyRow 同口径）：① 未登记资产 → 引导「无端访问管理」；
   ② 筛选无命中 → 一键清空。两种「空」的成因与去处不同，不得共用一套话术。 */
function fgEmptyRow() {
  if (!ASSETS.length) {
    return `<tr><td colspan="7"><div class="empty"><div class="big">暂无已登记资产</div>`
      + `<span class="muted">本页的资源级访问要求按资产登记事实生效——请先到「无端访问管理」登记资产（未开通资产同样可提前配置），再返回本页配置访问要求。</span></div></td></tr>`;
  }
  return `<tr><td colspan="7"><div class="empty"><div class="big">无匹配资产</div>`
    + `<span class="muted">当前筛选条件下没有资产，调整筛选条件后重试</span>`
    + `<div style="margin-top:10px"><button class="btn sm" data-act="fgClearF">清空筛选条件</button></div></div></td></tr>`;
}
function renderFgList() {
  const f = FG.filter;
  let rows = ASSETS.slice();   /* 全资产：控制模式由资源协议决定，非 L7 族同样有资源级策略 */
  if (f.k) rows = rows.filter(a => a.name.includes(f.k) || (a.ext || "").includes(f.k));
  if (f.grp) rows = rows.filter(a => a.grp === f.grp);
  if (f.type) rows = rows.filter(a => a.type === f.type);
  if (f.lv) rows = rows.filter(a => "L" + a.lv === f.lv);
  if (f.en) rows = rows.filter(a => f.en === "1" ? EN_ON(a) : !EN_ON(a));
  /* P2-7 族筛选：矩阵已按族承载，列表若无族维度，按族排查只能靠肉眼 */
  if (f.fam) rows = rows.filter(a => resModel(a) === f.fam);
  /* 分页：与页 A / 宿主资产列表同一套页码组件 */
  pgKeep("Fg", [f.k, f.grp, f.type, f.lv, f.en, f.fam].join("|"));
  const fgTotal = rows.length, fgPages = Math.max(1, Math.ceil(fgTotal / ASP_PAGE));
  window.PFg = Math.min(Math.max(1, window.PFg || 1), fgPages);
  const pageRows = rows.slice((window.PFg - 1) * ASP_PAGE, window.PFg * ASP_PAGE);
  window._fgTotal = fgTotal;
  const body = pageRows.map(a => {
    const { c, configured, total } = fgStat(a);
    const l7 = WEB(a), fam = resModel(a);
    const n = l7 ? total : famObjs(a).length;
    const conf = l7 ? configured : famConf(a);
    const polTxt = a.anon === "asset" ? `<span class="muted">不适用</span>` :
      (a.modes || []).map(m => { const list = (POLICIES[a.id] || {})[m] || []; const on = list.filter(p => p.on).length;
        return `<div class="pm-line"><span class="mtag ${m === "agentless" ? "eg" : "ag"}">${m === "agentless" ? "无端" : "有端"}</span><span class="pm-cnt">已启用 <b>${on}</b>/${list.length}</span></div>`; }).join("");
    /* 授权覆盖：零值分项不进正文——「显式公开 0」在绝大多数行都是纯噪音，而行越短、异常行越显眼；
       完整计数（含 0 值分项）恒定在 tooltip，信息不减、只是不再逐行复读。 */
    const covSeg = total ? [["显式公开", c.pub], ["默认拒绝", c.none]].filter(x => x[1] > 0).map(x => x[0] + " " + x[1]) : [];
    const covTitle = "已配置 " + configured + " / " + total + " · 显式公开 " + c.pub + " · 默认拒绝 " + c.none;
    const covCell = a.anon === "asset"
      ? `<span class="muted">整资产匿名开放，资源级授权不适用</span>`
      : l7
        ? (total ? `<div class="ov-line" style="font-size:13px" title="${covTitle}">已配置 <b>${configured}</b> / ${total}${covSeg.length ? " · " + covSeg.join(" · ") : ""}</div>
        ${stackBar([{ n: c.attr, c: "b1" }, { n: c.login, c: "b2" }, { n: c.pub, c: "b3" }, { n: c.none, c: "b0" }])}`
          : `<span class="muted">清单为空</span>`)
        : (n ? `<div class="ov-line" style="font-size:13px" title="已配置 ${conf} / ${n} · 准入即全部 · 默认拒绝 ${n - conf}">已配置 <b>${conf}</b> / ${n} · 准入即全部 · 默认拒绝 ${n - conf}</div>
           <div class="mini">${esc(famTier(a))}｜${esc(famNext(a))}</div>`
          : `<div class="ov-line" title="未登记可达目标：资源级判定以登记目标为边界——请到资产详情「资源与访问」登记后端服务资源"><span class="muted">未登记可达目标</span></div>
           <div class="mini">资源级判定以登记目标为边界——请先到资产详情「资源与访问」登记</div>`);
    return `<tr data-id="${a.id}">
      <td><div class="a-name"><span class="a-nm" title="${esc(a.name)}">${esc(a.name)}</span>${a.anon === "asset" ? `<span class="mtag anon">匿名开放</span>` : ""}</div>
        <div class="a-sub" title="${esc(a.ext && a.ext !== "-" ? a.ext : (a.addr || "—"))}">${esc(a.ext && a.ext !== "-" ? a.ext : (a.addr || "—"))}</div>
        <div style="margin-top:4px"><span class="mtag fam">${FAM_LABEL[fam]}</span> ${rowFrozenTag(a)}</div></td>
      <td>${lvTag(a.lv)}</td><td>${enTag(a)}</td>
      <td>${a.anon === "asset" ? `<span class="muted">不适用</span>` : (n ? `${n} ${l7 ? "条路径" : "个登记对象"}` : `<span class="muted">未登记可达目标</span>`)}</td>
      <td style="min-width:230px">${covCell}</td>
      <td>${polTxt}</td>
      <td class="cell-op"><button class="btn sm" data-act="fgCfg" data-id="${a.id}">${a.anon === "asset" ? "查看访问要求" : "配置访问要求"}</button></td>
    </tr>`;
  }).join("");
  return `
  <div class="title-row">
    <div><h2>资产细粒度访问策略</h2>
      <div class="muted" style="margin-top:4px">按「资源 × 协议 × 作用对象」配置访问要求——控制模式由资源协议决定：L7（HTTP(S) / WS(S) / gRPC）走作用对象级，其余协议走目标级</div></div>
  </div>
  <div class="hint-row"><i class="ic">分工</i><div>
    业务判定顺序（<b>业务视角由外到内</b>）：<b>「资产访问控制策略」判定资产能否访问（准入）→ 本页判定具体资源能否访问</b>。引擎侧的执行序与此相反——<b>先执行本页的资源级路径授权，通过后才执行资产准入属性策略</b>；这只是业务阅读顺序，不代表判定先后。
    资源授权<b>对无端与有端两种接入形态共用同一份</b>——有端 L7 流量经可信转发进入无端网关执行本判定，因此本页不出现形态切换器。
    <br><b>除允许匿名访问的范围外，所有资产越权即拒绝</b>：未配置即默认拒绝、不达上游。
    <button class="btn link" data-act="aspList">前往「资产访问控制策略」→</button>
  </div></div>
  <div class="card"><div class="card-b">
    <div class="toolbar" style="margin-bottom:12px">
      <div class="input-w"><input type="search" id="gK" placeholder="搜索资产名称 / 域名" style="width:220px" value="${esc(f.k || "")}"><i>搜索</i></div>
      <select id="gGrp"><option value="">全部分组</option>${[...new Set(ASSETS.map(a => a.grp))].map(g => `<option ${f.grp === g ? "selected" : ""}>${g}</option>`).join("")}</select>
      <select id="gType"><option value="">全部资产类型</option>${TYPES.filter(t => ASSETS.some(a => a.type === t)).map(t=>`<option ${f.type===t?"selected":""}>${t}</option>`).join("")}</select>
      <select id="gLv"><option value="">全部等级</option>${[1,2,3,4,5].map(l=>`<option ${f.lv==="L"+l?"selected":""}>L${l}</option>`).join("")}</select>
      <select id="gOpen"><option value="">全部启用状态</option><option value="1" ${f.en==="1"?"selected":""}>已启用</option><option value="0" ${f.en==="0"?"selected":""}>未启用</option></select>
      <select id="gFam"><option value="">全部资源族</option>${["l7", "terminal", "db", "file", "tcp"].map(k => `<option value="${k}" ${f.fam === k ? "selected" : ""}>${FAM_LABEL[k]}</option>`).join("")}</select>
    </div>
    <div class="tbl-wrap"><table class="mtx lst">
      <colgroup><col style="width:288px"><col style="width:76px"><col style="width:104px"><col style="width:126px"><col><col style="width:164px"><col style="width:184px"></colgroup>
      <thead><tr><th>资产</th><th>等级</th><th>启用状态</th><th>作用对象</th><th>授权覆盖</th><th>准入策略</th><th>操作</th></tr></thead>
    <tbody>${body || fgEmptyRow()}</tbody></table></div>
    <div class="lst-foot"><div id="fgPager" style="flex:1"></div></div>
    <div class="mini" style="margin-top:8px">作用对象来源：L7 族 = 资产详情「细粒度资源清单」登记的作用对象（只读引用）；非 L7 族 = 后端服务资源登记的目标 / 账号 / 库 / 共享（只读引用）。应用级档位需协议解析能力接入后启用。</div>
  </div></div>`;
}
/* 页 B 资产选择翻页 */
/* 页 B 翻页：勾选限定当前页，翻页即清空（与页 A D20 同口径，避免跨页误批量） */
function fgPg(p) { FG.sel.clear(); window.PFg = Math.max(1, p | 0); renderFg(); }
/* 矩阵分页：翻页即清空勾选——「全选本页」与批量作用面都只覆盖当前页（与列表视图同口径） */
function fgMxPg(p) { FG.sel.clear(); window.PFgMx = Math.max(1, p | 0); renderFg(); }
function fgFamPg(p) { FG.sel.clear(); window.PFgFam = Math.max(1, p | 0); renderFg(); }
function fgSubPg(p) { FG.sel.clear(); window.PFgSub = Math.max(1, p | 0); renderFg(); }

/* ---- B2 资源级矩阵：按协议族分派（L7 → 作用对象矩阵；非 L7 → 目标级对象矩阵） ---- */
function renderFgMatrix(a) {
  if (!a) return renderFgList();
  if (!WEB(a)) return renderFamMatrix(a);
  const f = FG.filter;
  const modeTip = a.anon === "asset"
    ? `<div class="hint-row ro"><i class="ic">匿名开放</i><div><b>该资产整资产匿名开放，逐路径授权不适用。</b>全部资源直通、<b>仅免除用户认证</b>（WAF / 限流 / 请求约束 / 行为策略与审计照常生效）；关闭下方「资产级匿名开放声明」即可恢复。</div></div>`
    : "";

  const ctxCard = `
  <div class="card"><div class="card-b">
    <div class="kv" style="grid-template-columns:110px 1fr"><div class="k">外部映射域名</div><div>${esc(a.ext || "—")}</div></div>
    <div class="card-sect"><h4>资产级匿名开放声明</h4><span class="sub">整资产形态 · §2.2</span>
      ${a.anon === "asset" ? `<span class="rolock">已开启 · 只读</span>` : ""}</div>
    <div class="kv" style="grid-template-columns:110px 1fr"><div class="k">当前状态</div><div>
      ${a.anon === "asset" ? `<span class="mtag anon">整资产匿名开放</span> <span class="muted">匿名范围 = 资产全部资源；不进认证与授权链（页 A 准入策略整体不适用）</span>`
        : `<span class="tag t-gray">未开启</span> <span class="muted">逐路径授权生效；开启后本资产整体匿名开放，准入与逐路径授权均不再适用</span>`}</div></div>
    <div class="kv" style="grid-template-columns:110px 1fr"><div class="k">操作</div><div class="act-row">
      ${a.anon === "asset"
        ? `<button class="btn sm" data-act="anonOff" data-id="${a.id}">关闭整资产匿名开放</button>`
        : `<button class="btn sm" data-act="anonOn" data-id="${a.id}">声明整资产匿名开放…</button>`}
      <span class="mini">与路径级「显式公开（public）」同源；变更入审计。</span></div></div>
  </div></div>`;

  const ro = a.anon === "asset";
  let rIdx = 0;
  const rowsAll = [];
  (a.res || []).forEach(r => (r.paths || []).forEach(p => { if (p.lc !== "已下线") rowsAll.push({ r, p }); }));
  const rows = rowsAll.filter(({ r, p }) => {
    if (f.k && !(r.name + " " + p.p + " " + p.name).includes(f.k)) return false;
    if (f.res && r.id !== f.res) return false;
    if (f.rq) { const k = reqOf(p).kind; if (f.rq === "none" && k !== "none") return false; if (f.rq !== "none" && k !== f.rq) return false; }
    if (f.risk && p.risk !== f.risk) return false;
    /* 生命周期筛选已取消（2026-09-14）：矩阵只渲染「已激活」条目（入表前已按已下线过滤），
       取值恒定 ⇒「已下线」选项选中必得空表，属**空转控件**（在位、可点、无效果）。
       故列与筛选项一并移除，不留「置灰保留」——把空转改成明示不可用只是换个说法。 */
    return true;
  });
  /* 分页（2026-09-13）：矩阵只渲染当前页；翻页清空勾选（与列表视图同一套页码组件） */
  pgKeep("FgMx", [a.id, f.k, f.res, f.rq, f.risk].join("|"));
  const mxPages = Math.max(1, Math.ceil(rows.length / MXP));
  window.PFgMx = Math.min(Math.max(1, window.PFgMx || 1), mxPages);
  window._fgMxTotal = rows.length; window._fgMxPages = mxPages;
  const pageRows = rows.slice((window.PFgMx - 1) * MXP, window.PFgMx * MXP);
  const body = pageRows.map(({ r, p }) => {
    const rq = reqOf(p), key = pathKey(a, r, p);
    return `<tr data-key="${esc(key)}" class="${FG.sel.has(key) ? "sel" : ""}">
      <td class="cell-chk">${ro ? "" : chkHTML(key, "选择 " + p.p)}</td>
      <td>${rIndexTag(r, a)}</td>
      <td><span class="kr">${esc(p.m)}</span></td>
      <td class="path"><span class="mtag fam">${esc(pathProto(a, p))}</span> ${esc(p.p)}</td>
      <td>${riskTag(p.risk)}</td>
      <td class="cell-rq" style="min-width:230px">${reqCellHtml(rq, a, ro)}</td>
      <td class="cell-op">
        ${ro ? `<span class="muted">只读</span>` : `<span class="opgrp">
          <button class="btn sm" data-act="fgSet" data-a="${a.id}" data-r="${r.id}" data-k="${esc(key)}">设置访问要求</button>
          ${rq.kind === "none" ? "" : `<button class="btn sm danger" data-act="fgClear" data-a="${a.id}" data-r="${r.id}" data-k="${esc(key)}">清除</button>`}</span>`}
      </td></tr>`;
  }).join("");
  /* P1-6 空态按成因分流：① 从未登记细粒度资源 ② 已登记但全部下线
     —— 不再使用「无 7 层路径清单，路径授权不适用」这类能力缺失式表述（§10.1 明令禁止） */
  const anyPath = (a.res || []).some(r => (r.paths || []).length);
  /* 两处空态**不重复**生命周期管理指引——该指引由卡头区（`.card-b` 首行）同屏常驻承载，
     同屏两枚同按钮属重复（2026-09-14；见`_口径手册`教训 68）。 */
  const emptyHTML = anyPath
    ? `<div class="empty"><div class="big">登记路径均已下线</div><span class="muted">下线即停用、不参与授权——如需恢复授权，请先到资产详情维护路径生命周期</span></div>`
    : `<div class="empty"><div class="big">该资产尚未登记细粒度资源</div><span class="muted">没有清单条目就没有可授权的对象——请先到资产详情 →「细粒度资源清单」登记作用对象（方法 / 匹配 / 路径），返回本页即可逐条设置访问要求</span></div>`;
  const BA = fgBatchAvail(a);
  /* 卡头计数：条目数 ≤ 每页时表下页码条不渲染（pgmk 直接清空），卡头即本表规模的**唯一常驻提示**——
     所以计数必须常驻；而筛选态下它等于筛选结果数，不加标注就与总数同形（26 → 2 都写「N 条路径」）。 */
  const mxFiltered = !!(f.k || f.res || f.rq || f.risk);
  const mxSub = "共 " + rows.length + " 条路径" + (mxFiltered ? "（已筛选）" : "");

  return `
  <div class="title-row">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="btn" data-act="fgBack">← 返回资产选择</button>
      <h2 style="margin:0">${esc(a.name)}</h2> ${lvTag(a.lv)} ${enTag(a)} ${modeTags(a)}
      ${ro ? `<span class="rolock">只读（整资产匿名开放）</span>` : ""}
    </div>
    <div class="toolbar"><button class="btn" data-act="aspCfg" data-id="${a.id}">前往「资产访问控制策略」→</button></div>
  </div>
  ${openHint(a)}
  ${modeTip}
  ${ctxCard}
  <div class="card"><div class="card-h"><h3>路径授权矩阵<span class="sub">${mxSub}</span></h3>
    <div class="toolbar">
      <span class="sel-cnt" id="fgSelCnt">${FG.sel.size ? `已选 <b>${FG.sel.size}</b> 条路径` : "未勾选路径"}</span>
      <button class="btn sm" data-act="fgBatchSet" ${BA.set.ok ? `title="${esc(BA.set.why)}"` : `disabled title="${esc(BA.set.why)}"`}>批量设置</button>
      <button class="btn sm" data-act="fgBatchClear" ${BA.clear.ok ? `title="${esc(BA.clear.why)}"` : `disabled title="${esc(BA.clear.why)}"`}>批量清除</button>
    </div></div>
    <div class="card-b">
    <div class="mini" style="margin-bottom:10px">本表只承载<b>已激活</b>条目（已下线即停用、不参与授权）。条目生命周期（下线 / 重新激活）在<b>资产详情 →「细粒度资源清单」</b>维护：<button class="btn link" data-act="fgGoDetail" data-id="${a.id}" title="打开该资产详情并定位到「细粒度资源清单」">去维护生命周期 →</button></div>
    <div class="toolbar" style="margin-bottom:12px">
      <div class="input-w"><input type="search" id="mK" placeholder="搜索清单名称 / 路径" style="width:220px" value="${esc(f.k || "")}"><i>搜索</i></div>
      <select id="mRes"><option value="">全部资源</option>${(a.res || []).map(r => `<option value="${r.id}" ${f.res === r.id ? "selected" : ""}>${esc(r.name)}${r.main ? "（主资源）" : ""}</option>`).join("")}</select>
      <select id="mRq"><option value="">全部授权状态</option>
        <option value="attr" ${f.rq === "attr" ? "selected" : ""}>按主体属性</option>
        <option value="login" ${f.rq === "login" ? "selected" : ""}>登录即可</option>
        <option value="public" ${f.rq === "public" ? "selected" : ""}>显式公开</option>
        <option value="none" ${f.rq === "none" ? "selected" : ""}>默认拒绝（未配置）</option></select>
      <select id="mRisk"><option value="">全部风险</option>${["高", "中", "低"].map(r => `<option ${f.risk === r ? "selected" : ""}>${r}</option>`).join("")}</select>
    </div>
    ${!rowsAll.length ? emptyHTML : `
    <div class="tbl-wrap"><table class="mtx"><thead><tr><th class="cell-chk">${ro ? "" : '<input type="checkbox" id="fgSelAll" data-act="fgChkAll" title="全选本页">'}</th><th>所属资源</th><th>方法</th><th>作用对象（路径 / 服务方法）</th><th>风险</th><th>当前访问要求</th><th>操作</th></tr></thead>
    <tbody>${body || `<tr><td colspan="7"><div class="empty"><div class="big">无匹配路径</div></td></tr>`}</tbody></table></div>`}
    <div class="mini" style="margin-top:10px">「未配置」即 <b>default deny</b>：请求不达上游。访问要求变更 2 秒内收敛并入审计（policyScope = path）。</div>
    <div class="lst-foot"><div id="fgMxPager" style="flex:1"></div></div>
  </div></div>`;
}
function rIndexTag(r, a) { return `${esc(r.name)}${r.main ? `<span class="badge-main">主资源</span>` : ""}`; }

/* ---- B2' 非 L7 族资源矩阵（控制模式由资源协议决定：目标 / 实例 / 共享 / 通道） ----
   对象面 = 资产详情「资源与访问」登记的**非 L7 承载**条目（只读引用，与登记面同源）：
   登记里增一条资源，矩阵里就多一个对象，无需在两处同步维护。
   档位链：目标级为各族兜底档；应用级档位（账号级 / 命令级 / 表级 / 目录级）需协议解析能力接入
   （§10.1 D17/D18）——未启用的档位**以置灰可见方式占位**，不隐藏维度。 */
function famColLabel(fam) {
  return fam === "db" ? "实例 / 库 / 对象" : fam === "file" ? "目标 / 共享 / 目录" : fam === "terminal" ? "主机 / 账号" : "目标";
}
/* 资源登记 → 矩阵行：族列组按族切换，前段为登记面已可得的层字段，后段为待启用档位维度 */
function famRowHTML(a, o, fam, ro) {
  const rq = famReq(a, o), key = "fam|" + a.id + "|" + o.id;
  const nc = famCols(fam).length;
  const cells = famCols(fam).map(c => c.dim
    ? `<td class="cell-dim" title="待启用档位：${esc(famNext(a))}——档位未启用不等于不支持，协议解析能力接入后本列可用">待启用</td>`
    : `<td class="mini">${esc((c.f(o) || "") || "—")}</td>`).join("");
  return `<tr data-key="${esc(key)}" class="${FG.sel.has(key) ? "sel" : ""}">
    <td class="cell-chk">${ro ? "" : chkHTML(key, "选择 " + o.n)}</td>
    <td><span class="mtag fam">${esc(o.k)}</span></td>
    <td style="min-width:190px"><div style="font-weight:500">${esc(o.n)}</div>
      <div class="mini">${esc(o.d)}${o.relay ? ` · <span class="tagx" title="文件上传 / 下载先投递到安全中转站，检测（病毒 / 类型 / 敏感数据）通过后才允许真正传入或下载">强制经文件安全中转</span>` : ""}</div></td>
    ${cells}
    <td class="cell-rq" style="min-width:230px">${reqCellHtml(rq, a, ro)}</td>
    <td class="cell-op">${ro ? `<span class="muted">只读</span>` : `<span class="opgrp">
      <button class="btn sm" data-act="fgSet" data-a="${a.id}" data-k="${esc(key)}">设置访问要求</button>
      ${rq.kind === "none" ? "" : `<button class="btn sm danger" data-act="famClear" data-a="${a.id}" data-o="${o.id}">清除</button>`}</span>`}</td></tr>`;
}
/* 附属 L7 入口：资产主族为非 L7，但其登记资源内含 L7 承载入口（如数据库资产上的管理控制台）。
   资源类型 ≠ 资产主族——附属入口自身按 l7 承载，故并入族信息卡的「附属 L7 入口」小节、按作用对象级授权；
   避免「同一个资产混用两种授权粒度」在同一张表里看不出来。 */
/* 附属入口 = 同卡内小节（2026-09-13 与信息卡合并），自身仍按 L7 作用对象级承载并分页 */
function famL7Section(a, ro) {
  const list = famL7Res(a);
  if (!list.length) return "";
  const rows = [];
  list.forEach(r => (r.paths || []).filter(p => p.lc !== "已下线").forEach(p => rows.push({ r, p })));
  pgKeep("FgSub", a.id);
  const subPages = Math.max(1, Math.ceil(rows.length / MXP));
  window.PFgSub = Math.min(Math.max(1, window.PFgSub || 1), subPages);
  window._fgSubTotal = rows.length;
  const body = rows.slice((window.PFgSub - 1) * MXP, window.PFgSub * MXP).map(({ r, p }) => {
    const rq = reqOf(p), key = pathKey(a, r, p);
    return `<tr data-key="${esc(key)}" class="${FG.sel.has(key) ? "sel" : ""}">
      <td class="cell-chk">${ro ? "" : chkHTML(key, "选择 " + p.p)}</td>
      <td>${rIndexTag(r, a)}</td>
      <td><span class="kr">${esc(p.m)}</span></td>
      <td class="path"><span class="mtag fam">${esc(pathProto(a, p))}</span> ${esc(p.p)}</td>
      <td>${riskTag(p.risk)}</td>
      <td class="cell-rq" style="min-width:230px">${reqCellHtml(rq, a, ro)}</td>
      <td class="cell-op">${ro ? `<span class="muted">只读</span>` : `<span class="opgrp">
        <button class="btn sm" data-act="fgSet" data-a="${a.id}" data-r="${r.id}" data-k="${esc(key)}">设置访问要求</button>
        ${rq.kind === "none" ? "" : `<button class="btn sm danger" data-act="fgClear" data-a="${a.id}" data-r="${r.id}" data-k="${esc(key)}">清除</button>`}</span>`}</td></tr>`;
  }).join("");
  return `<div class="card-sect"><h4>附属 L7 入口</h4><span class="sub">${FAM_LABEL.l7} · 共 ${rows.length} 条路径</span><span class="sub">按<b>作用对象级</b>承载（资源类型 ≠ 资产主族）</span></div>
    ${!rows.length ? `<div class="empty"><div class="big">附属入口无有效路径</div><span class="muted">已下线路径不参与授权——请到资产详情维护路径结构</span><div class="mini" style="margin-top:8px">条目生命周期（下线 / 重新激活）在<b>资产详情 →「细粒度资源清单」</b>维护：<button class="btn link" data-act="fgGoDetail" data-id="${a.id}">去维护生命周期 →</button></div></div>` : `
    <div class="tbl-wrap"><table class="mtx"><thead><tr><th class="cell-chk">${ro ? "" : '<input type="checkbox" data-act="fgChkAll" title="全选本页">'}</th><th>所属资源</th><th>方法</th><th>作用对象（路径 / 服务方法）</th><th>风险</th><th>当前访问要求</th><th>操作</th></tr></thead>
    <tbody>${body}</tbody></table></div>`}
    <div class="mini" style="margin-top:10px">「未配置」即 <b>default deny</b>：请求不达上游。条目来源：资产详情 → 细粒度资源清单（只读引用）。</div>
    <div class="lst-foot"><div id="fgSubPager" style="flex:1"></div></div>`;
}
function renderFamMatrix(a) {
  const fam = resModel(a), objs = famObjs(a), ro = a.anon === "asset";
  const leadRes = objs[0], protos = [...new Set(objs.map(o => o.proto).filter(Boolean))];
  const tierTip = fam === "tcp"
    ? `该族以<b>目标级</b>为终态：可判维度为登记目标（IP / 域名 + 端口）。`
    : `当前档位：<b>${esc(famTier(a))}</b>；待启用：${esc(famNext(a))}（档位未启用不等于不支持——维度以置灰可见方式登记）。`;
  const hint = a.anon === "asset"
    ? `<div class="hint-row ro"><i class="ic">匿名开放</i><div><b>该资产整资产匿名开放，资源级授权不适用。</b>全部资源<b>仅免除用户认证</b>（不做越权判定）；WAF、限流、请求约束、行为策略与审计照常生效。</div></div>`
    : "";
  const BA = fgBatchAvail(a);
  const conf = famConf(a);
  pgKeep("FgFam", a.id);
  const famPages = Math.max(1, Math.ceil(objs.length / MXP));
  window.PFgFam = Math.min(Math.max(1, window.PFgFam || 1), famPages);
  window._fgFamTotal = objs.length;
  const pageObjs = objs.slice((window.PFgFam - 1) * MXP, window.PFgFam * MXP);
  return `
  <div class="title-row">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="btn" data-act="fgBack">← 返回资产选择</button>
      <h2 style="margin:0">${esc(a.name)}</h2> ${lvTag(a.lv)} ${enTag(a)} ${modeTags(a)}
      <span class="mtag fam">${FAM_LABEL[fam]}</span>
      ${ro ? `<span class="rolock">只读（整资产匿名开放）</span>` : ""}
    </div>
    <div class="toolbar"><button class="btn" data-act="aspCfg" data-id="${a.id}">前往「资产访问控制策略」→</button></div>
  </div>
  ${openHint(a)}
  ${hint}
  <div class="hint-row"><i class="ic">资源模型</i><div>
    <b>族由连接实例类资源的协议（${esc((leadRes && leadRes.proto) || a.addrProto || "—")}）决定，不由资产类型决定</b>——本资产为「${esc(a.type)}」，按 <b>${FAM_LABEL[fam]}</b> 承载。
    ${protos.length > 1 ? `含多种协议资源（${esc(protos.join(" / "))}），各按其自身协议承载。` : ""}
    ${famL7Res(a).length ? `另有附属 L7 入口（${esc(famL7Res(a).map(r => r.name).join("、"))}）：<b>资源类型 ≠ 资产主族</b>，自身按 ${FAM_LABEL.l7} 承载，见下方小节。` : ""}
    ${tierTip}
  </div></div>
  <div class="card"><div class="card-b">
    <div class="kv" style="grid-template-columns:120px 1fr"><div class="k">登记目标</div><div>${esc(a.addr || "—")}${a.addrProto ? ` · ${esc(a.addrProto)}` : ""}</div></div>
    <div class="kv" style="grid-template-columns:120px 1fr"><div class="k">对象来源</div><div>资产详情 → 后端服务资源登记（本页<b>只读引用</b>，不可在此编辑；对象与登记条目一一对应）</div></div>
    <div class="kv" style="grid-template-columns:120px 1fr"><div class="k">可达面一致性</div><div>
      ${a.net
        ? `有端 socks5 目标白名单 <b>${a.net.rules}</b> 条 · ${esc(a.net.proto)}${(a.net.wl || []).length ? ` ｜ 已登记明细 <b>${a.net.wl.length}</b> 条` : ` <span class="tag t-warn">未登记明细</span>`}`
        : `<span class="muted">无网络层白名单登记</span>`}
      <div class="mini">资源级配置须落在白名单内——<b>保存时逐条比对</b>，越界即阻断并列出缺失项；仅登记条数时给警告级提示。（维护入口：隧道与资产登记）</div></div></div>
    ${famL7Section(a, ro)}
  </div></div>
  <div class="card"><div class="card-h"><h3>资源级矩阵<span class="sub">${famColLabel(fam)} · 共 ${objs.length} 个登记对象 · 已配置 ${conf}</span></h3>
    <div class="toolbar">
      <span class="sel-cnt" id="fgSelCnt">${FG.sel.size ? `已选 <b>${FG.sel.size}</b> 个对象` : "未勾选对象"}</span>
      <button class="btn sm" data-act="fgBatchSet" ${BA.set.ok ? `title="${esc(BA.set.why)}"` : `disabled title="${esc(BA.set.why)}"`}>批量设置</button>
      <button class="btn sm" data-act="fgBatchClear" ${BA.clear.ok ? `title="${esc(BA.clear.why)}"` : `disabled title="${esc(BA.clear.why)}"`}>批量清除</button>
    </div></div>
    <div class="card-b">
    ${!objs.length ? `<div class="empty"><div class="big">该资产未登记可达目标</div><span class="muted">没有登记条目就没有可授权的对象——请先到资产详情 →「资源与访问」登记后端服务资源，返回本页即可逐条设置访问要求</span></div>` : `
    <div class="tbl-wrap"><table class="mtx"><thead><tr>
      <th class="cell-chk">${ro ? "" : '<input type="checkbox" id="fgSelAll" data-act="fgChkAll" title="全选本页">'}</th>
      <th>对象类型</th><th>对象</th>
      ${famCols(fam).map(c => `<th>${c.t}</th>`).join("")}
      <th>当前访问要求</th><th>操作</th></tr></thead>
    <tbody>${pageObjs.map(o => famRowHTML(a, o, fam, ro)).join("") || `<tr><td colspan="${5 + famCols(fam).length}"><div class="empty"><div class="big">无匹配对象</div></td></tr>`}</tbody></table></div>`}
    <div class="mini" style="margin-top:10px">「未配置」即 <b>default deny</b>：请求不达上游。访问要求变更 2 秒内收敛并入审计（policyScope = resource · resModel = ${fam}）。</div>
    <div class="lst-foot"><div id="fgFamPager" style="flex:1"></div></div>
  </div></div>`;
}
function riskTag(k) { return `<span class="tag ${k === "高" ? "t-err" : k === "中" ? "t-warn" : "t-ok"}">${esc(k)}</span>`; }
/* 生命周期标签：资产详情「细粒度资源清单」与登记向导共用（页 B 矩阵自 v0.43 起不承载该列，
   生命周期只在资产详情一侧呈现与维护，故实现只有一个来源）。 */
function lcTag(lc) { return `<span class="tag ${lc === "已激活" ? "t-ok" : "t-warn"}">${esc(lc)}</span>`; }
function reqCellHtml(rq, a, ro) {
  /* 统一包 .rqbox：让单行态（按主体属性）与双行态（登录即可 / 默认拒绝 / 显式公开）
     在同一个内容高度上，避免整表行高 55 / 64 混排（详见样式表 .rqbox 注释）。 */
  const box = h => `<div class="rqbox">${h}</div>`;
  if (a.anon === "asset") return box(`<span class="mtag anon">随资产级匿名声明直通</span>`);
  if (rq.kind === "none") return box(`<span class="tag t-err">默认拒绝</span><div class="mini">未配置 → 请求不达上游</div>`);
  if (rq.kind === "login") return box(`<span class="tag t-info">登录即可</span><div class="mini">经鉴权会话即可访问</div>`);
  if (rq.kind === "public") return box(`<span class="tag t-ok">显式公开</span><div class="mini">仅免用户认证 · 其余安全防护照常生效</div>`);
  /* 列内不再展开条件明细（2026-09-13 用户要求）：完整条件文本收进 tooltip，弹窗回读仍是权威 */
  return box(`<span class="tag t-info" title="${esc(condText(rq.cond))}">按主体属性</span>`);
}

/* ---- 根据 pathKey 定位路径条目 ---- */
function pathByKey(key) {
  const [aid, rid, m, p] = key.split("|");
  const a = byId(aid); if (!a) return null;
  const r = (a.res || []).find(x => x.id === rid); if (!r) return null;
  const pt = (r.paths || []).find(x => x.m === m && x.p === p); if (!pt) return null;
  return { a, r, pt };
}

/* ---- 作用对象地址派生（2026-09-13 用户要求：作用对象不能只给路径，须同时给出外部访问地址与内部地址）----
   ① 外部访问地址 = 资源登记的客户域名（DNS 指向网关）+ 方法路径；协议与「作用对象」上呈现的协议**同源**（pathProto），
      未登记客户域名时回落内部节点地址（与 accText 同口径），并在页内标注回落原因；
   ② 内部地址 = 该资源在「资源与访问」登记的后端节点逐条 + 路径；非 L7 族对象取登记目标（host:port[/共享目录]，
      缺省端口按协议补全）。
   地址均为**只读引用**——权威登记面仍是资产详情「资源与访问」，本页不提供改写入口。 */
function objPathSfx(pt) { const p = String((pt && pt.p) || ""); return p && p !== "/" ? p : ""; }
/* 协议 → 外部访问地址 scheme：取值与「作用对象」身份串上的协议**同源**（同一个 pathProto 值），
   只做 scheme 归一（WebSocket 的外部地址按 wss 发布、gRPC 走 https）——不引入第二个协议来源，
   避免「身份串标 HTTPS、外部访问地址却写 http」这类同源破裂 */
const EXT_SCHEME = { HTTP: "http", HTTPS: "https", WS: "ws", WSS: "wss", WEBSOCKET: "wss", GRPC: "https", FTP: "ftp", FTPS: "ftps", SFTP: "sftp", SSH: "ssh", RDP: "rdp", VNC: "vnc" };
function objExtAddr(a, r, pt) {
  if (!r) return "";
  const dom = (r.ext && r.ext !== "-") ? r.ext : "";
  const host = dom || ((r.nodes || [])[0] || "");
  if (!host) return "";
  const proto = String(pathProto(a, pt) || "").toUpperCase();
  return (EXT_SCHEME[proto] || proto.toLowerCase()) + "://" + host + objPathSfx(pt);
}
function objIntAddrs(r, pt, fam, o) {
  if (fam) {
    const t = (o && o.res && o.res.host) ? backResText(o.res) : ((o && o.target && o.target !== "—") ? o.target : "");
    return t ? [t] : [];
  }
  if (!r) return [];
  const sfx = objPathSfx(pt);
  return (r.nodes || []).map(n => n + sfx);
}
function addrChips(list) {
  if (!list.length) return '<span class="muted">—</span>';
  const head = list.slice(0, 3), rest = list.length - head.length;
  const all = list.join(" 、 ");
  return head.map(x => '<span class="kr">' + esc(x) + '</span>').join(" ")
    + (rest > 0 ? ' <span class="mini" title="' + esc(all) + '">等 ' + list.length + ' 个节点</span>' : "");
}

/* ---- B3 访问要求设置页（L7 作用对象 / 非 L7 族对象共用同一页面与同一四态） ----
   2026-09-13 用户指令：① 由弹窗改为**单独页面**；② 条件构造器与「资产访问控制策略」**完全一致**
   （共用 grpHTML / condHTML / validateDs 一套组件与校验，版式照搬页 A 设计器）；
   ③ **认证条件并入属性条件**——认证只经条件组内的认证维度属性行配置。 */
function openFgReq(aid, rid, key, batchKeys) {
  const isFam = String(key || "").indexOf("fam|") === 0;
  const hit = isFam ? famByKey(key) : pathByKey(key);
  if (!hit) return;
  /* 批量设置：作用面 = 调用方传入的勾选键集合（本页勾选），弹窗内只编辑一份要求 */
  const batch = batchKeys ? batchKeys.slice() : null;
  const rq = isFam ? famReq(hit.a, hit.o) : reqOf(hit.pt);
  const isAttr = rq.kind === "attr";
  S.designer = {
    scope: "path", asId: aid, mode: (hit.a.modes || [])[0] || "agentless",
    /* 根组关系与页 A 同规（必选、无默认值），并仅在「按主体属性」形态下渲染：编辑既有要求时沿用其树上的 op，新建时留空待选 */
    rootOp: isAttr ? (rq.cond.op || "") : "",
    tree: ensureUid(isAttr ? clone(rq.cond) : { t: "g", op: "and", ch: [], uid: uid() })
  };
  /* 认证要求不随对象独立落库：它就在条件树里（认证维度条件行） */
  FG.rq = { key, fam: isFam, kind: isAttr ? "attr" : (rq.kind || "none"), a: hit.a, r: hit.r, pt: hit.pt, o: hit.o, batch, cond: S.designer.tree };
  S.sel = null;
  S.designer._snap = dsSnap(S.designer);
  setPage("pg-fgreq");
}
/* 要求形态切换（下拉变更）：认证条件恒在条件树内，切换形态不改树，只改解释口径 */
function reqSetKind(v) {
  const R = FG.rq; if (!R || !v) return;
  const pre = R.kind; R.kind = v;
  renderFgReq();
  if (pre !== v && v === "public") toast("「显式公开」将在保存时二次确认（跳过主体认证与准入判定）");
  if (pre !== v && v === "none") toast("保存后该对象回到「未配置」 → 默认拒绝");
}
function renderFgReq() {
  if (!$("#pg-fgreq")) return;   /* 多页化：#pg-fgreq 只存在于 access-requirement.html */
  /* 无效上下文不得静默返回：页面会留着上一次的画面，管理员会以为还在编辑那一份要求。
     与列表 / 矩阵回退同规——状态位与画面一并归位到页 B 的资产选择列表。 */
  const R = FG.rq;
  if (!R || !S.designer) {
    S.designer = null; S.sel = null; FG.rq = null;
    FG.view = "list"; FG.sel.clear();
    setPage("pg-fg");
    return;
  }
  const a = R.a, D = S.designer;
  /* 条件树单一权威 = FG.rq.cond：渲染与校验共用同一引用，避免外部替换后两处读不同对象 */
  D.tree = R.cond;
  const allowPub = canAnonPublic(R);
  const objProto = R.fam ? "" : (pathProto(a, R.pt) || "");
  const kinds = [
    { k: "attr", t: "按主体属性", d: "以条件组表达访问要求：用户维度 + 认证维度 + 环境属性（网络与时间类）。客户端软件、终端设备、地理位置与接入网络类型归「资产访问控制策略」的准入判定。" },
    { k: "login", t: "登录即可", d: "通过主体认证（有效鉴权会话）即可访问，不附加属性条件。" },
    { k: "public", t: "显式公开（public）", d: allowPub ? "命中即跳过主体认证、资产访问状态与准入判定；不跳过安全前置检查、限流与审计。保存需二次确认。" : `不可选：匿名开放要求资产为 L1 级且资源协议为 HTTP${a && a.lv !== 1 ? "（当前资产 L" + a.lv + "）" : R.fam ? "（非 L7 族对象不适用）" : "（当前资源协议 " + objProto + "）"}。`, dis: !allowPub },
    { k: "none", t: "默认拒绝（未配置）", d: "清除该对象的访问要求：回到未配置 → 默认拒绝（请求不达上游）。" }];
  const cur = kinds.filter(x => x.k === R.kind)[0] || null;
  const v = validateDs("path");
  const rb = rbTree(R.cond);
  const sel = (S.sel && S.sel.uid) ? findNode(R.cond, S.sel.uid) : null;
  const selAttr = sel && sel.n.t === "c" ? attrById(sel.n.attr) : null;
  const objLine = R.fam
    ? `${FAM_LABEL[resModel(a)]} · <span class="kr">${esc(R.o.k)}</span> <span class="kr">${esc(R.o.n)}</span>`
    : `<span class="kr">${esc(R.r ? R.r.name : "")}</span> <span class="kr">${esc(R.pt.m)}</span> <span class="kr">${esc(R.pt.p)}</span>（${esc(pathProto(a, R.pt))}）`;
  const scopeTag = R.fam ? FAM_LABEL[resModel(a)] : "作用对象级";
  /* 作用对象地址（只读引用，2026-09-13）：外部访问地址 + 内部地址 + 登记来源，与对象身份同屏自证；
     批量态下地址取首条示例并显式标注作用面条数（各条按其登记地址生效），避免以首条冒充全体 */
  const extAddr = R.fam ? "" : objExtAddr(a, R.r, R.pt);
  const intAddrs = objIntAddrs(R.r, R.pt, R.fam, R.o);
  const hasExtDom = !!(R.r && R.r.ext && R.r.ext !== "-");
  const extCell = extAddr
    ? '<span class="kr">' + esc(extAddr) + '</span>' + (!hasExtDom ? ' <span class="mini">未登记客户域名，按内部节点地址展示</span>' : "")
    : '<span class="muted">—</span><span class="mini"> ' + (R.fam ? "该族经平台会话 / 桌面客户端访问，未发布外部访问地址" : "未登记外部访问地址与内部节点") + '</span>';
  const srcLine = R.fam
    ? ["资源 " + ((R.o && R.o.res && R.o.res.id) || "—"), R.o && R.o.res && R.o.res.kind, R.o && R.o.res && R.o.res.proto,
       (R.o && R.o.res && R.o.res.open) ? wayLabel(R.o.res.proto, R.o.res.open) + (R.o.res.client ? "（" + R.o.res.client + "）" : "") : ""].filter(Boolean).join(" · ")
    : ["资源 " + ((R.r && R.r.id) || "—"), R.r && R.r.kind, (R.pt && R.pt.mt) ? "路径性质 " + R.pt.mt : ""].filter(Boolean).join(" · ");
  const addrNote = (R.batch && R.batch.length) ? "　· 地址取首条示例，作用面共 " + R.batch.length + " 条，各条按其登记地址生效" : "";
  const headNote = R.batch && R.batch.length
    ? `<span class="mini">批量作用面 = 本页已勾选的 <b>${R.batch.length}</b> ${R.fam ? "个对象" : "条路径"}（不含未勾选与筛选外的条目）；保存后统一写入这一份要求，逐条落入审计</span>`
    : `<span class="mini">${R.fam ? "对象与登记条目一一对应" : "路径结构来自资产详情 →「细粒度资源清单」"}，本页只读引用</span>`;
  $("#pg-fgreq").innerHTML = `
  <div class="title-row">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="btn" data-act="reqCancel">← 返回</button>
      <h2 style="margin:0">${R.batch ? "批量设置访问要求" : "设置访问要求"}</h2>
      <span class="mtag ${R.fam ? "fam" : "eg"}">${scopeTag}</span>
      <span class="muted">${esc(a.name)}</span>
    </div>
    <div class="toolbar" style="flex:0 0 auto; align-items:center">${headNote}</div>
  </div>
  <div class="dsg-top">
    <div class="fld grow" style="flex:1 1 100%"><label>作用对象（只读）</label>
      <div class="stack-chip" style="height:32px;width:100%;box-sizing:border-box">${objLine}</div>
      <div class="obj-addr">
        <div class="arow"><span class="alb">外部访问地址</span>${extCell}</div>
        <div class="arow"><span class="alb">内部地址</span>${addrChips(intAddrs)}</div>
        <div class="arow"><span class="alb">登记来源</span><span class="mini">${esc(srcLine) || "—"} · 资产详情「资源与访问」只读引用${addrNote}</span></div>
      </div></div>
    <div class="fld"><label>要求形态 <span class="req">*</span></label>
      <select class="mini-inp" data-act="reqKind" style="height:32px">
        ${kinds.map(x => `<option value="${x.k}" ${R.kind === x.k ? "selected" : ""}${x.dis ? " disabled" : ""}>${x.t}</option>`).join("")}
      </select></div>
    ${R.kind === "attr" ? `<div class="fld"><label>根组关系 <span class="req">*</span>（必选、无默认值）</label>
      <select class="mini-inp" data-act="dsRoot" style="height:32px">
        <option value="">请选择…</option>
        <option value="and" ${D.rootOp === "and" ? "selected" : ""}>满足全部条件（且）</option>
        <option value="or" ${D.rootOp === "or" ? "selected" : ""}>满足任一条件（或）</option>
      </select></div>` : ""}
  </div>
  ${R.kind === "attr" ? `
  <div class="dsg">
    <div>
      <div class="card"><div class="card-h"><h3>条件构造区<span class="sub">布尔组树 · 最高 ${MAX_DEPTH} 层嵌套</span></h3>
        <span class="muted">组内只放同类子节点；混用「且/或」请改用子组</span></div>
        <div class="card-b">${grpHTML(R.cond, 1)}</div></div>
    </div>
    <div class="dsg-side">
      <div class="card"><div class="card-h"><h3>实时回读</h3></div><div class="card-b">
        <div class="rb-line">${esc(rb.text) || "—"}</div>
        <details class="rb-fold"${S.dsRbFold ? "" : " open"} ontoggle="S.dsRbFold=!this.open"><summary>括号式结构回读</summary>
          <div class="rb-code">${esc(rb.code)}</div></details>
        <div class="mini" style="margin-top:8px">未命中本要求 → <b>默认拒绝</b>（403 + 风险事件、请求不达上游）</div>
      </div></div>
      <div class="card"><div class="card-h"><h3>校验</h3><span class="mini">${v.errs.length ? v.errs.length + " 项错误" : v.warns.length ? v.warns.length + " 项警告" : "通过"}</span></div>
        <div class="card-b"><div class="vlist">
          ${v.errs.map(x => `<div class="vi err"><span class="n">错误</span><span class="t">${esc(x.text)}</span></div>`).join("")}
          ${v.warns.map(x => `<div class="vi warn"><span class="n">警告</span><span class="t">${esc(x.text)}</span></div>`).join("")}
          ${!v.errs.length && !v.warns.length ? `<div class="vi ok"><span class="n">通过</span><span class="t">结构合法、属性均在闭包内、取值完整</span></div>` : ""}
        </div></div></div>
      <div class="card"><div class="card-h"><h3>属性说明</h3></div><div class="card-b">
        ${selAttr ? `<div class="kv" style="grid-template-columns:70px 1fr"><div class="k">属性</div><div><b>${selAttr.label}</b></div></div>
        <div class="kv" style="grid-template-columns:70px 1fr"><div class="k">类别</div><div>${CAT_LABEL[selAttr.cat]} · ${DIM_LABEL[selAttr.dim]}</div></div>
        <div class="kv" style="grid-template-columns:70px 1fr"><div class="k">编辑器</div><div>${selAttr.editor}　<span class="mini">由取值结构决定</span></div></div>
        <div class="kv" style="grid-template-columns:70px 1fr"><div class="k">取值示例</div><div class="mini">${esc(selAttr.ex)}</div></div>
        <div class="kv" style="grid-template-columns:70px 1fr"><div class="k">属性源</div><div class="mini">${esc(selAttr.src)}</div></div>
        <div class="kv" style="grid-template-columns:70px 1fr"><div class="k">可得性</div><div class="mini">${selAttr.scope === "agent" ? "仅<b>有端接入</b>可得（当前组：" + MODE_LABEL[D.mode] + "）" : "无端 / 有端<b>均可得</b>"}</div></div>
        ${AUTH_ATTRS.indexOf(selAttr.id) >= 0 ? `<div class="kv" style="grid-template-columns:70px 1fr"><div class="k">期次</div><div class="mini">级别档位固定 L1~L5、渲染层不裁剪；一期会话认证强度上限 <b>L2</b>，声明 L3~L5 时保存侧提示「待二期承载后生效」且不阻断保存</div></div>` : ""}`
        : `<div class="mini">选中某个条件行后，这里显示该属性的类别、编辑器选型、取值示例、属性源与可得性。</div>`}
      </div></div>
    </div>
  </div>` : `
  <div class="card"><div class="card-b">
    <div class="hint-row"><i class="ic">${cur ? esc(cur.t) : "未选择"}</i><div>${cur ? esc(cur.d) : "请先在「要求形态」中选择一项。"}</div></div>
  </div></div>`}
  <div class="hint-row" style="margin-top:12px"><i class="ic">属性维度</i><div>
    资源级条件组的属性闭包 = <b>用户维度 + 认证维度 + 环境属性</b>（网络与时间类）。客户端软件、终端设备、地理位置与接入网络类型归「资产访问控制策略」的准入判定，本页不呈现。
  </div></div>
  <div class="hint-row" style="margin-top:8px"><i class="ic">认证方式字典</i><div>
    认证维度属性（认证安全级别 / 认证方式 / 认证复合方式数）取自平台认证方式字典：<b>级别档位固定 L1~L5 且序不变</b>（不新增不删除），可自定义级别名称与判定含义、各级别下的方式集合；新增同级方式<b>无需改写任何既有策略、也不使既有策略失效</b>，被启用策略引用的方式不可删除。一期会话认证强度上限为 <b>L2</b>，选到 L3~L5 时保存侧提示「待二期承载后生效」且不阻断保存。
  </div></div>
  <div class="hint-row" style="margin-top:8px"><i class="ic">影响面</i><div>
    <b>匿名开放范围之外的访问一律拒绝。</b>
    ${R.kind === "public" ? `选中「显式公开」：该${R.fam ? "对象" : "路径"}将<b>跳过主体认证、资产访问状态与准入策略判定</b>（不跳过安全前置检查、限流与审计）——请确认其确实不含受保护数据。`
      : R.kind === "login" ? `选中「登录即可」：通过主体认证（有效鉴权会话）即可访问该${R.fam ? "对象" : "路径"}，不附加属性条件。`
      : R.kind === "attr" ? `命中本要求条件且<b>当前认证不达标时触发追加认证</b>（认证至达标后放行，不判为拒绝）；其余未配置对象 → 403 + 风险事件、<b>请求不达上游</b>（无观察档）。`
      : `选中「默认拒绝」：该${R.fam ? "对象" : "路径"}保存后回到未配置 → 403 + 风险事件、<b>请求不达上游</b>（无观察档）。`}
    ${R.kind === "attr" ? `　匿名开放（路径级「显式公开」与资产级整资产匿名）<b>仅适用于 L1 级资产上的 HTTP 协议资源</b>，WS(S) / gRPC 等长连接与消息类协议不参与匿名。` : ""}
  </div></div>
  <div class="card"><div class="card-b" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div id="fgrSaveNote" class="save-note">${R.kind === "attr" ? "保存时将自动扁平化属性条件" : R.kind === "login" ? "保存后经鉴权会话即可访问该对象（不附加属性条件）" : R.kind === "public" ? "保存后命中即跳过主体认证与准入判定（需二次确认）" : "保存后该对象回到未配置 → 默认拒绝（请求不达上游）"}</div>
    <div class="toolbar"><button class="btn" data-act="reqCancel">取消</button><button class="btn primary" data-act="reqSave">保存</button></div>
  </div></div>`;
}
function reqSave() {
  const R = FG.rq; if (!R) return;
  if (R.kind === "attr") {
    /* 与页 A 共用同一套条件行判定（含运算符归属 / 引用同源组 / 取值形态校验） */
    /* 与页 A 共用同一套校验函数（scope = path → 闭包为 用户 + 认证 + 环境） */
    S.designer.tree = R.cond;
    const vd = validateDs("path");
    if (vd.errs.length) { toast("存在 " + vd.errs.length + " 项问题： " + vd.errs[0].text); return; }
  }
  /* P1-4 可达面一致性：资源级配置不得超出网络层可达范围，否则「配置存在、流量不可达」——
     非 L7 族对象按登记目标逐条比对 socks5 目标白名单明细：缺失即阻断并列出缺失项；
     仅登记条数（无明细）或未登记网络层时不做判定，改为警告级确认。 */
  const keys0 = R.batch && R.batch.length ? R.batch : [R.key];
  const net = R.a && R.a.net;
  const miss = [];
  if (R.fam && R.kind !== "none") {
    keys0.forEach(k => { const h = famByKey(k); if (h && !famReachable(net, h.o)) miss.push(h.o.n + "（" + h.o.target + "）"); });
  }
  if (miss.length) {
    toast("配置超出网络层可达范围，已阻断保存：" + miss.join("、")
      + " 不在 socks5 目标白名单内——请先在「隧道与资产登记」补齐可达范围，否则配置存在但流量不可达");
    return;
  }
  const needReachWarn = R.fam && R.kind !== "none" && !((net && net.wl) || []).length;
  const doIt = () => {
    /* 认证要求随条件组一并落库（条件内含认证维度条件行），不落独立 auth 字段 */
    const rec = R.kind === "attr" ? { kind: "attr", cond: cleanTree(R.cond), by: "张伟", at: nowTs() } : { kind: R.kind };
    /* 批量与单条同一条写回路径：单条即「只勾一条」，不另写一套逻辑 */
    const keys = R.batch && R.batch.length ? R.batch : [R.key];
    let ok = 0;
    keys.forEach(k => {
      const h = String(k).indexOf("fam|") === 0 ? famByKey(k) : pathByKey(k);
      if (!h) return;
      if (h.o) {
        h.a._frq = h.a._frq || {};
        h.a._frq[h.o.id] = clone(rec);
        h.o.req = rqTextOf({ kind: rec.kind, cond: rec.cond });   /* 数据同源：族对象条件文本与弹窗回读同源 */
      } else {
        h.pt._rq = clone(rec);
        h.pt.req = rqTextOf({ kind: rec.kind, cond: rec.cond });  /* 数据打通：回写清单展示文本，资产详情 T3 同源刷新 */
      }
      ok++;
    });
    FG.sel.clear();
    S.designer = null;        /* 清理设计器上下文，避免 renderAsp 被继续分派到「设置访问要求」页 */
    S.sel = null;
    const carry = R.kind === "attr" ? authCarryNote(R.cond) : "";
    toast((keys.length > 1
      ? `已批量保存 ${ok} 条访问要求，变更 2 秒内收敛并入审计`
      : (R.kind === "none" ? "已清除访问要求：该对象回到默认拒绝" : "已保存访问要求，变更 2 秒内收敛并并入审计")) + (carry ? "　· " + carry : ""));
    setPage("pg-fg");
  };
  if (R.kind === "public") {
    confirmDlg("确认设置为「显式公开」？", `${R.fam ? `${esc(R.o.k)} <b>${esc(R.o.n)}</b>` : `路径 <b>${esc(R.pt.p)}</b>`} 将跳过主体认证、资产访问状态与准入策略判定。<div class="note red" style="margin-top:10px">请确认其不承载受保护数据；变更将写入审计。</div>`, doIt, "确认设为显式公开");
  } else if (needReachWarn) {
    confirmDlg("网络层未登记目标白名单明细", `该资产的网络层准入（socks5 目标白名单）<b>仅登记条数、未登记目标明细</b>，本次保存<b>无法做可达面范围校验</b>：若登记目标不在实际白名单内，本策略将「配置存在、流量不可达」。
      <div class="note warn" style="margin-top:10px">建议先在「隧道与资产登记」补齐目标明细；本次仍可保存，变更入审计。</div>`, doIt, "仍然保存");
  } else doIt();
}
function cleanTree(n) { const o = {}; ["t", "op", "attr", "v", "inc", "q", "mode", "ref"].forEach(k => { if (n[k] !== undefined) o[k] = n[k]; }); if (n.t === "g") { o.ch = (n.ch || []).map(cleanTree); delete o.attr; } return o; }

/* ===== 确认弹窗 ===== */
function confirmDlg(title, html, cb, okText) {
  S.cfmCb = cb; S.tfa = null;
  const no = $("#dlgCfm [data-act='cfmNo']"); if (no) no.style.display = "";
  $("#cfmTitle").textContent = title;
  $("#cfmMsg").innerHTML = html;
  $("#cfmYes").textContent = okText || "确认";
  $("#dlgCfm").classList.add("show");
}

/* ===== 策略体检：本组策略的只读分析（不修改任何策略） =====
   四类发现：① 疑似条件重叠（跨策略）② 策略内可优化项 ③ 悬空条件 ④ 命名冲突。
   跨策略重叠在一般布尔条件下**无法完备判定**，因此结论一律表述为「疑似」——
   工具只把可疑点摆出来并给出打开入口，是否调整由管理员判断，绝不自动改写配置。 */
function chkLeaf(c) {
  if (c.attr === "client.software" && c.v && typeof c.v === "object") return ["sw:" + (c.v.sw || "")];
  const v = c.v;
  return (Array.isArray(v) ? v : v == null ? [] : [v]).map(String);
}
function chkFlatten(n) {
  /* 仅当整棵树为「且」（无嵌套或组、无非组）时才做互斥判定 */
  const map = {}; let flat = true;
  (function walk(x) {
    if (!x) return;
    if (x.t === "c") { (map[x.attr] = map[x.attr] || []).push(x); return; }
    if (x.op !== "and") flat = false;
    (x.ch || []).forEach(walk);
  })(n);
  return { map: map, flat: flat };
}
const CHK_NEG = ["notin", "notcontains", "ne"];
function chkExclusive(A, B) {
  /* 存在公共属性且在该属性上取值域不相交 → 可证明互斥（两条策略不可能同时命中） */
  const keys = Object.keys(A.map);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!B.map[k]) continue;
    let ex = false;
    A.map[k].forEach(ca => B.map[k].forEach(cb => {
      const va = chkLeaf(ca), vb = chkLeaf(cb);
      const na = CHK_NEG.indexOf(ca.op) >= 0, nb = CHK_NEG.indexOf(cb.op) >= 0;
      if (!na && !nb) { if (!va.some(x => vb.indexOf(x) >= 0)) ex = true; }
      else if (!na && nb) { if (va.length && va.every(x => vb.indexOf(x) >= 0)) ex = true; }
      else if (na && !nb) { if (vb.length && vb.every(x => va.indexOf(x) >= 0)) ex = true; }
    }));
    if (ex) return true;
  }
  return false;
}
function chkInner(n, out, depth, parentOp) {
  /* 策略内可优化项：子组仅剩单成员可降级、与父组同类型可扁平化、同组内重复条件 */
  if (!n || n.t !== "g") return;
  const kids = n.ch || [];
  if (depth > 0 && kids.length === 1) out.push("存在仅含 1 个成员的子组，可降级省略括号");
  if (depth > 0 && parentOp && parentOp === n.op && n.op !== "not") out.push("存在与父组同类型的嵌套组，可直接合并（扁平化）");
  const seen = [];
  kids.forEach(k => {
    if (k.t === "g") { chkInner(k, out, depth + 1, n.op); return; }
    const key = k.attr + "|" + k.op + "|" + chkLeaf(k).join(",");
    if (seen.indexOf(key) >= 0) out.push("同一组内存在完全重复的条件行");
    seen.push(key);
  });
}
function chkDangling(n, out) {
  /* 悬空条件：条件引用的属性已不在属性字典中（属性下线或改名） */
  (function walk(x) {
    if (!x) return;
    if (x.t === "c") { if (!attrById(x.attr)) out.push("条件引用的属性已不在属性字典中：" + x.attr); return; }
    (x.ch || []).forEach(walk);
  })(n);
}
function chkBlock(title, n, inner, emptyText) {
  return `<div style="margin-top:16px">
    <div style="display:flex;align-items:center;gap:8px"><b style="font-size:13px">${title}</b>${n ? `<span class="tag t-warn">${n} 项</span>` : `<span class="tag t-ok">未检出</span>`}</div>
    <div style="font-size:12.5px;color:var(--txt2);line-height:1.7;margin-top:6px">${n ? inner : emptyText}</div></div>`;
}
function polCheck() {
  const m = S.mode;
  const list = (POLICIES[S.cur] || {})[m] || [];
  if (!list.length) { toast(MODE_LABEL[m] + "策略组暂无准入策略，无需体检"); return; }
  /* ① 疑似条件重叠：同组内动作相异、且无法证明互斥的策略对 */
  const flat = list.map(p => ({ p: p, f: chkFlatten(p.cond) }));
  const overlaps = [];
  for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
    if (flat[i].p.action === flat[j].p.action) continue;
    if (!flat[i].f.flat || !flat[j].f.flat) { overlaps.push({ a: flat[i].p, b: flat[j].p, why: "两条策略的条件含嵌套或「非」组，无法自动判定是否互斥" }); continue; }
    if (!chkExclusive(flat[i].f, flat[j].f)) overlaps.push({ a: flat[i].p, b: flat[j].p, why: "两条策略的条件无公共属性，无法证明互斥" });
  }
  /* ② 策略内可优化项 ③ 悬空条件 */
  const opt = [], dangling = [];
  list.forEach(p => {
    const o = []; chkInner(p.cond, o, 0, null);
    const u = o.filter((x, i) => o.indexOf(x) === i);
    if (u.length) opt.push({ p: p, items: u });
    const d = []; chkDangling(p.cond, d);
    d.forEach(x => dangling.push({ p: p, text: x }));
  });
  /* ④ 命名冲突：保存与复制两条路径均已唯一化，此处兜底存量数据——
     名称是策略清单、审计记录与告警通知的唯一定位键，重名会让三者无法唯一定位 */
  const nameMap = {};
  list.forEach(p => { const k = String(p.name || "").trim(); if (k) (nameMap[k] = nameMap[k] || []).push(p); });
  const nameDup = Object.keys(nameMap).filter(k => nameMap[k].length > 1).map(k => ({ k: k, n: nameMap[k].length }));
  const onN = list.filter(p => p.on).length;
  const nm = (p, act) => `<b>${esc(p.name)}</b>（${act}）`;
  $("#cfmTitle").textContent = "策略体检 · " + MODE_LABEL[m] + "策略组";
  $("#cfmMsg").innerHTML = `
    <div class="hint-row" style="margin-bottom:4px"><i class="ic">只读</i><div>体检结果<b>仅供判断</b>，本面板不修改任何策略：工具只把可疑点摆出来并给出打开入口，是否调整由你决定。本组共 <b>${list.length}</b> 条策略（已启用 ${onN} 条）。</div></div>
    ${chkBlock("疑似条件重叠", overlaps.length, overlaps.map(o => `<div class="note" style="margin-top:8px">${nm(o.a, o.a.action === "allow" ? "允许" : "拒绝")} × ${nm(o.b, o.b.action === "allow" ? "允许" : "拒绝")}${(!o.a.on || !o.b.on) ? ` <span class="tag t-gray">含未启用策略</span>` : ""}<div class="mini" style="margin-top:4px">${o.why}。若确有交集，实际按 <b>拒绝 ＞ 允许</b> 裁决——请确认是否有意为之。</div></div>`).join(""), "本组动作相异的策略对均可证明互斥，或不存在动作相异的策略对。")}
    ${chkBlock("策略内可优化项", opt.length, opt.map(o => `<div class="note" style="margin-top:8px"><b>${esc(o.p.name)}</b><div class="mini" style="margin-top:4px">${o.items.map(esc).join("；")}</div></div>`).join(""), "各策略结构均已最简：无同类型嵌套组、无单成员子组、无重复条件行。")}
    ${chkBlock("悬空条件", dangling.length, dangling.map(d => `<div class="note red" style="margin-top:8px"><b>${esc(d.p.name)}</b><div class="mini" style="margin-top:4px">${esc(d.text)}——该条件可能恒不命中，请复核后调整。</div></div>`).join(""), "全部条件引用的属性均在属性字典中，无失效引用。")}
    ${chkBlock("策略命名冲突", nameDup.length, nameDup.map(d => `<div class="note red" style="margin-top:8px"><b>${esc(d.k)}</b> 在本形态组内出现 <b>${d.n}</b> 次<div class="mini" style="margin-top:4px">策略清单、审计记录与告警通知均按名称定位，重名会让三者无法唯一定位——请为其中一条改名。</div></div>`).join(""), "本组策略名称互不重复，清单 / 审计 / 告警均可唯一定位。")}
    <div class="mini" style="margin-top:16px">跨策略重叠在一般布尔条件下无法完备判定，以上结论为<b>疑似提示</b>；保存策略时仍会按「疑似重叠」二次确认。</div>`;
  $("#cfmYes").textContent = "关闭";
  const no = $("#dlgCfm [data-act='cfmNo']"); if (no) no.style.display = "none";
  S.tfa = null; S.cfmCb = null;
  $("#dlgCfm").classList.add("show");
}

/* ===== 二次认证：敏感变更（启用 / 停用）的身份再确认 =====
   所有启用 / 停用操作——单条策略、当前形态组「全部启用 / 全部停用」、列表「批量启用 / 批量停用」、
   资产启用开关——**一律先经二次认证**，认证通过才落变更。
   认证方式取自「认证方式字典」（默认口令再认证 L2）；凭据仅用于本次身份确认，不落库、不记入审计明细。
   取消则回调调用方回滚 UI（不产生任何变更）。演示环境：凭据非空即通过。 */
function ask2FA(op, ok, cancel, note) {
  S.tfa = { op: op, ok: ok, cancel: cancel || null, method: "账号密码", pwd: "", note: note || "" };
  render2FA();
}
function render2FA() {
  const t = S.tfa; if (!t) return;
  const no = $("#dlgCfm [data-act='cfmNo']"); if (no) no.style.display = "";
  $("#cfmTitle").textContent = "二次认证";
  $("#cfmMsg").innerHTML = `
    <div class="hint-row" style="margin-bottom:12px"><i class="ic">二次认证</i><div>「<b>${esc(t.op)}</b>」属于<b>敏感变更</b>，需先完成<b>二次认证</b>确认身份；认证通过后操作才执行，取消不产生任何变更。</div></div>
    ${t.note ? `<div class="note" style="margin:0 0 12px">${t.note}</div>` : ""}
    <div style="display:flex;gap:10px;align-items:baseline;margin-bottom:6px"><span style="flex:0 0 62px;color:var(--txt3);font-size:12.5px">认证方式</span><span class="mini">取自「认证方式字典」，默认<b>口令再认证（L2）</b></span></div>
    <div class="seg wrap" style="margin:0 0 12px">${AUTH_METHODS.filter(x => x.level >= 2).map(x => x.names.map(n => `<button class="${t.method === n ? "on" : ""}" data-act="tfaMethod" data-v="${esc(n)}">${esc(n)}</button>`).join("")).join("")}</div>
    <div style="display:flex;gap:10px;align-items:center"><span style="flex:0 0 62px;color:var(--txt3);font-size:12.5px">凭据</span>
      <input type="password" class="mini-inp" id="tfaPwd" style="min-width:220px" placeholder="输入${esc(t.method)}凭据" value="${esc(t.pwd || "")}"></div>
  `;
  $("#cfmYes").textContent = "验证并执行";
  $("#dlgCfm").classList.add("show");
}

/* ==========================================================================
   事件绑定（统一委托）
   ========================================================================== */
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) { if (S.pop) { S.pop = null; renderAsp(); } return; }
  const act = el.dataset.act;
  const D = S.designer;
  switch (act) {
    /* --- 侧栏 / 视图切换 --- */
    case "nav": setPage(el.dataset.pg); break;
    case "aspList": S.view = "list"; S.selRows.clear(); S.filter = {}; window.PAsp = 1; setPage("pg-asp", true); renderAsp(); break;
    case "aspBack": S.view = "list"; S.pop = null; S.selRows.clear(); setPage("pg-asp", true); renderAsp(); break;
    case "aspCfg": {
      S.cur = el.dataset.id || S.cur;
      /* R12 进组定位「首个已配置形态」：沿用上一次进入的形态会让管理员落到空组
         （在有端组看过 a1，再进入有端组一条策略都没有的 a4，就会迎面撞上空组）。
         定位放在**入口**而非渲染期——入口定准一次，页面内任何重渲染都不会把当前形态挪走。 */
      const ea = byId(S.cur);
      if (ea) {
        const ems = ea.modes || [];
        S.mode = ems.find(m => (((POLICIES[ea.id] || {})[m]) || []).length) || ems[0] || "";
        S.modeAs = ea.id;
      }
      S.view = "cfg"; S.pop = null; S.selRows.clear(); setPage("pg-asp", true); renderAsp(); break;
    }
    case "aspMode": S.mode = el.dataset.m; renderAsp(); break;
    case "aspRowToggle": {
      /* R5 行级启停：作用面 = 该资产全部形态组的准入策略（与左下批量同语义、同认证） */
      const ra = byId(el.dataset.id); if (!ra) break;
      const ron = el.dataset.v === "on";
      const rhit = [];
      Object.keys(POLICIES[ra.id] || {}).forEach(m => (POLICIES[ra.id][m] || []).forEach(p => { if (ron ? !p.on : p.on) rhit.push(p); }));
      if (!rhit.length) { toast(ron ? "该资产的准入策略均已启用" : "该资产的准入策略均已停用"); break; }
      ask2FA(`${ron ? "启用" : "停用"}「${ra.name}」全部形态组的 ${rhit.length} 条准入策略`, () => {
        rhit.forEach(p => { p.on = ron; p.at = nowTs(); });
        toast(`已${ron ? "启用" : "停用"} ${rhit.length} 条策略（该资产全部形态组，2 秒内收敛，变更入审计）`);
        renderAsp();
      });
      break;
    }
    case "aspClearF": {
      /* R2 空态一键清空筛选：筛选变化即由 renderAspList 的签名比对清空勾选，无需另行处理 */
      S.filter = {}; S.selRows.clear(); window.PAsp = 1; renderAsp(); break;
    }
    case "aspBatch": {
      const on = el.dataset.v === "on";
      /* 与 batchAvail 同一份可选判定（双保险）：冻结 / 匿名资产不参与批量启停——
         批量入口不得绕过「准入策略整体只读 / 不适用」。 */
      const ids = [...S.selRows].filter(id => aspRowSelectable(byId(id)));
      if (!ids.length) { toast("请先在列表中勾选要处理的资产"); break; }
      const total = ids.reduce((s, id) => s + Object.keys(POLICIES[id] || {}).reduce((k, m) => k + (POLICIES[id][m] || []).length, 0), 0);
      /* 批量启用 / 停用属敏感变更：先二次认证，通过后才落变更 */
      ask2FA(`${on ? "批量启用" : "批量停用"}准入策略（已勾选 ${ids.length} 个资产 · 共 ${total} 条）`, () => {
        let n = 0;
        ids.forEach(id => Object.keys(POLICIES[id] || {}).forEach(m => (POLICIES[id][m] || []).forEach(p => {
          if (on) { if (!p.on) { p.on = true; n++; } } else { if (p.on) { p.on = false; n++; } }
        })));
        toast(`已将 ${ids.length} 个资产的准入策略批量${on ? "启用" : "停用"}：${n} 条状态变更 / 共 ${total} 条（变更 2 秒内收敛并入审计）`);
        renderAsp();
      });
      break;
    }
    case "gotoB": S.cur = el.dataset.id || S.cur; FG.cur = el.dataset.id || S.cur; FG.view = el.dataset.id ? "matrix" : "list"; FG.filter = {}; FG.sel.clear(); window.PFgMx = 1; setPage("pg-fg", true); renderFg(); setCrumbs("资产细粒度访问策略", FG.view === "matrix" ? (byId(FG.cur) ? byId(FG.cur).name : "") : "资产选择"); break;

    /* --- 策略卡片操作 --- */
    /* R13 自动聚焦：标志必须写在渲染**之前**——渲染发生在 openDesigner 内部，
       写在调用之后会让焦点推迟到下一次渲染才落上（表现为「进入新增页光标没进名称框」） */
    case "polNew": S.focusName = true; openDesigner(S.cur, S.mode, null); break;
    case "polEdit": openDesigner(S.cur, S.mode, el.dataset.id); break;
    case "polDup": {
      const src = (POLICIES[S.cur][S.mode] || []).find(p => p.id === el.dataset.id);
      if (!src) break;
      const list = POLICIES[S.cur][S.mode];
      const cp = clone(src);
      cp.id = "asp-" + S.cur + "-" + (++POL_SEQ);
      /* R9 命名唯一化：连点复制不再叠后缀，也不会与保存侧的唯一性校验撞车 */
      cp.name = uniqPolName(list, src.name);
      /* R8 副本一律以未启用落库：复制若继承源策略的启用态，等于用「复制」这个动作
         悄悄扩大生效面，绕过 §11.1 的二次认证；启用仍走卡片上的启停入口。 */
      cp.on = false;
      cp.at = nowTs();
      list.push(cp);
      toast("已复制为「" + cp.name + "」（仅在当前形态组内复制；副本未启用，确认内容无误后在卡片上启用）");
      renderAsp(); break;
    }
    case "polToggle": {
      const p = (POLICIES[S.cur][S.mode] || []).find(x => x.id === el.dataset.id);
      if (!p) break;
      /* 单条策略启停属敏感变更：先二次认证，通过后才落变更 */
      ask2FA(`${p.on ? "停用" : "启用"}准入策略「${p.name}」`, () => {
        p.on = !p.on; p.at = nowTs();
        toast(p.on ? "已启用策略：即时参与判定（2 秒内收敛）" : "已停用策略：不参与判定（2 秒内收敛）");
        renderAsp();
      });
      break;
    }
    case "polCheck": polCheck(); break;
    case "polAll": {
      /* 一键启停作用于**当前形态组**的全部策略（不影响另一形态组） */
      const on = el.dataset.v === "on";
      const list = POLICIES[S.cur][S.mode] || [];
      const hit = list.filter(p => on ? !p.on : p.on);
      if (!hit.length) { toast(on ? "本形态组策略均已启用" : "本形态组策略均已停用"); break; }
      ask2FA(`${on ? "全部启用" : "全部停用"}${MODE_LABEL[S.mode]}策略组的 ${hit.length} 条准入策略（本组共 ${list.length} 条）`, () => {
        hit.forEach(p => { p.on = on; p.at = nowTs(); });
        toast(`已${on ? "启用" : "停用"} ${hit.length} 条策略：本形态组 ${list.length} 条全部${on ? "参与" : "退出"}判定（2 秒内收敛，变更入审计）`);
        renderAsp();
      });
      break;
    }
    case "polDel": {
      const p = (POLICIES[S.cur][S.mode] || []).find(x => x.id === el.dataset.id);
      if (p) {
        /* 删除不可逆且直接改变生效面：与启停同属敏感变更，一律先经二次认证 */
        ask2FA(`删除准入策略「${p.name}」`, () => {
          POLICIES[S.cur][S.mode] = POLICIES[S.cur][S.mode].filter(x => x.id !== p.id);
          toast(`已删除策略「${p.name}」：本形态组剩 ${POLICIES[S.cur][S.mode].length} 条（2 秒内全节点收敛，变更入审计）`);
          renderAsp();
        }, null, `策略「<b>${esc(p.name)}</b>」删除后不再参与判定，且不可撤销；若本形态组因此无允许命中，请求将被<b>默认拒绝</b>。`);
      }
      break;
    }

    /* --- 设计器 --- */
    case "dsPop": { const id = el.dataset.uid, f = el.dataset.f; S.pop = (S.pop && S.pop.uid === id && S.pop.f === f) ? null : { uid: id, f }; S.sel = { uid: id }; renderAsp(); break; }
    case "dsAttrDim": { S.pop = { uid: el.dataset.uid, f: "attr", dim: el.dataset.dim }; renderAsp(); break; }
    case "dsGreyTip": toast("该属性仅在【有端接入】场景可得；当前为无端接入策略组，配置后不会生效。如需按终端 / 客户端属性准入，请到「有端接入策略组」配置。"); break;
    case "dsToAgent": { const pols = (POLICIES[D.asId] || {}).agent || []; S.mode = "agent"; toast("已切换到有端接入策略组" + (pols.length ? `（现有 ${pols.length} 条策略）` : "（暂无策略）")); renderAsp(); break; }
    case "dsAttr": { S.pop = null; dsAttr(el.dataset.uid, el.dataset.attr); break; }
    case "dsOrg": {
      const c = findNode(D.tree, el.dataset.uid).n; const id = el.dataset.org; c.v = Array.isArray(c.v) ? c.v : [];
      const i = c.v.indexOf(id); if (i >= 0) c.v.splice(i, 1); else c.v.push(id); renderAsp(); break;
    }
    case "dsMulti": {
      const c = findNode(D.tree, el.dataset.uid).n; const v = el.dataset.v; c.v = Array.isArray(c.v) ? c.v : [];
      const i = c.v.indexOf(v); if (i >= 0) c.v.splice(i, 1); else c.v.push(v); renderAsp(); break;
    }
    case "dsQ": {
      const c = findNode(D.tree, el.dataset.uid).n;
      const qq = (attrById(c.attr) || {}).q || "both";
      if (qq === "none" || (qq === "any" && el.dataset.v === "all")) break;   /* 锁定「任一命中」的属性不接受 all */
      c.q = el.dataset.v; renderAsp(); break;
    }
    case "dsTpre": {
      const c = findNode(D.tree, el.dataset.uid).n; const t = normTime(c.v);
      t.preset = el.dataset.v;
      if (t.preset === "custom" && !t.days.length) t.days = [1, 2, 3, 4, 5];
      c.v = t; renderAsp(); break;
    }
    case "dsTmon": {
      const c = findNode(D.tree, el.dataset.uid).n; const t = normTime(c.v); const m = +el.dataset.m;
      if (!m) t.months = [];
      else { const i = t.months.indexOf(m); if (i >= 0) t.months.splice(i, 1); else t.months.push(m); }
      c.v = t; renderAsp(); break;
    }
    case "dsDow": {
      const c = findNode(D.tree, el.dataset.uid).n; const d = +el.dataset.d;
      const t = normTime(c.v); t.preset = "custom";
      const i = t.days.indexOf(d); if (i >= 0) t.days.splice(i, 1); else t.days.push(d);
      t.days.sort((x, y) => x - y); c.v = t; renderAsp(); break;
    }
    case "dsMode": { const c = findNode(D.tree, el.dataset.uid).n; c.mode = el.dataset.v; c.ref = ""; if (c.mode === "ref") toast("属性引用：用同上下文另一属性作为取值（如「设备所属人员 = 当前登录用户」）"); renderAsp(); break; }
    case "dsXMode": {
      /* R10 跨形态复制：先在**目标形态**的属性闭包下预校验，越界条件一律拦下（fail-closed）——
         闭包外的条件在目标组会静默失效，先放行再提示等于把「配了不生效」留给运行期。
         副本以未启用落库：新增一条生效策略属于改变生效面，不应由「复制」这个动作悄悄完成。 */
      const DD = S.designer; if (!DD) break;
      const xa = byId(DD.asId);
      const target = ((xa && xa.modes) || []).find(m => m !== DD.mode);
      if (!target) { toast("该资产仅登记单一接入形态，无另一策略组可迁移"); break; }
      const xbad = [];
      walkTree(DD.tree, (n) => {
        if (n.t !== "c") return;
        condIssues(n, { closure: "mode", mode: target }).forEach(x => { if (x.level === "err") xbad.push(x.text); });
      });
      if (xbad.length) {
        confirmDlg("无法复制到" + MODE_LABEL[target] + "策略组",
          `<div class="note red">目标形态（${MODE_LABEL[target]}）的属性闭包不含以下条件所引用的属性，复制后在目标组<b>不会生效</b>；为避免留下「配了不生效」的条件，本次复制未落库：`
          + `<div class="mini" style="margin-top:6px">${xbad.slice(0, 6).map(esc).join("<br>")}</div>`
          + (xbad.length > 6 ? `<div class="mini">…共 ${xbad.length} 项</div>` : "")
          + `</div><div class="mini" style="margin-top:8px">处理方式：① 在当前组删改这些条件后重试；② 直接到「${MODE_LABEL[target]}策略组」用该组的属性闭包另行配置。</div>`,
          null, "知道了");
        break;
      }
      const xlist = (POLICIES[DD.asId] || {})[target] || (POLICIES[DD.asId][target] = []);
      const xnm = uniqPolName(xlist, DD.name);
      xlist.push({ id: "asp-" + DD.asId + "-" + (++POL_SEQ), name: xnm, action: DD.action, on: false, cond: cleanTree(clone(DD.tree)), by: "张伟", at: nowTs() });
      const fromMode = DD.mode;
      S.designer = null; S.view = "cfg"; S.pop = null; S.mode = target; S.modeAs = DD.asId;
      toast(`已从${MODE_LABEL[fromMode]}策略组复制到${MODE_LABEL[target]}组：「${xnm}」（副本未启用，确认后在卡片上启用；启用需二次认证）`);
      renderAsp();
      break;
    }
    case "dsDup": {
      /* 同组内原位复制条件行：同类条件常成组出现，省去重复挑选属性与取值 */
      const f = findNode(D.tree, el.dataset.uid);
      if (!f || !f.p) { toast("根组节点不支持复制"); break; }
      const cp = clone(f.n); cp.uid = uid(); delete cp._err;
      f.p.ch.splice(f.p.ch.indexOf(f.n) + 1, 0, cp);
      S.sel = { uid: cp.uid }; S.pop = null; renderAsp(); toast("已复制该条件行"); break;
    }
    case "dsClear": { const c = findNode(D.tree, el.dataset.uid).n; c.v = []; renderAsp(); break; }
    case "dsOp": dsOp(el.dataset.uid, el.dataset.v); break;
    case "dsAddCond": dsAddCond(el.dataset.uid); break;
    case "dsAddGroup": dsAddGroup(el.dataset.uid); break;
    case "dsDel": dsDel(el.dataset.uid); break;
    case "dsCancel": {
      /* R4 零改动直接返回——只有真改过才需要确认放弃 */
      const D0 = S.designer;
      const dirty = D0 && D0._snap !== dsSnap(D0);
      if (!dirty) { S.designer = null; S.view = "cfg"; S.pop = null; renderAsp(); break; }
      confirmDlg("放弃本次编辑？", "未保存的改动将丢失。", () => { $("#dlgCfm").classList.remove("show"); S.designer = null; S.view = "cfg"; renderAsp(); }, "放弃");
      break;
    }
    case "dsSave": saveDesigner(); break;

    /* --- 页 B --- */
    /* 生命周期管理（下线 / 重新激活）的唯一可操作入口在资产详情「细粒度资源清单」——
       页 B 是只读授权面、不给该动作，但把入口直连出来（2026-09-14）：
       避免「看得出有生命周期、却找不到管理的地方」。 */
    case "fgGoDetail": {
      const a = byId(el.dataset.id || FG.cur);
      if (!a) break;
      openDetail(a.id);
      showTab("detTabs", "t3");
      break;
    }
    /* 资产详情细粒度清单「方法」筛选：多选 chips（取值域按本资产清单实际方法派生）。
       「全部方法」= 清空选择；其余 chip 逐个 toggle；翻页回第 1 页。 */
    case "fPathMTog": {
      const a = byId(window._detailAid || CUR);
      if (!a) break;
      const mv = el.dataset.m || "";
      if (!mv) a._mSel = [];
      else {
        const s = (a._mSel || []).slice();
        const i = s.indexOf(mv);
        if (i >= 0) s.splice(i, 1); else s.push(mv);
        a._mSel = s;
      }
      a._pathPage = 1; renderPaths(a);
      break;
    }
    /* 登记弹窗「HTTP 方法」chips：新增可多选（保存时展开为多条），编辑单选（条目身份为标量） */
    case "apiMChip": {
      const box = $("#apiM");
      if (!box) break;
      if (box.dataset.single === "1") box.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c === el));
      else el.classList.toggle("on");
      break;
    }
    /* 列表空态的去处：一键清空筛选，避免管理员逐个下拉去回忆自己改过哪一项 */
    case "fgClearF": FG.filter = {}; FG.sel.clear(); renderFg(); toast("已清空筛选条件"); break;
    case "fgBack": FG.view = "list"; FG.filter = {}; FG.sel.clear(); renderFg(); setCrumbs("资产细粒度访问策略", "资产选择"); break;
    case "fgCfg": { FG.cur = el.dataset.id; FG.view = "matrix"; FG.filter = {}; FG.sel.clear(); const a = byId(FG.cur); renderFg(); setCrumbs("资产细粒度访问策略", a ? a.name : ""); break; }
    case "fgSet": openFgReq(el.dataset.a, el.dataset.r, el.dataset.k); break;
    case "fgClear": {
      const hit = pathByKey(el.dataset.k); if (!hit) break;
      confirmDlg("清除访问要求？", `路径 <b>${esc(hit.pt.p)}</b> 将回到「未配置」 → <b>默认拒绝</b>（请求不达上游）。`, () => { hit.pt._rq = { kind: "none" }; $("#dlgCfm").classList.remove("show"); toast("已清除：该路径回到默认拒绝"); renderFg(); }, "清除");
      break;
    }
    case "famClear": {
      const a = byId(el.dataset.a); if (!a) break;
      const o = famObjs(a).find(x => x.id === el.dataset.o); if (!o) break;
      confirmDlg("清除访问要求？", `${esc(o.k)} <b>${esc(o.n)}</b> 将回到「未配置」 → <b>默认拒绝</b>（请求不达上游）。`, () => { a._frq = a._frq || {}; a._frq[o.id] = { kind: "none" }; $("#dlgCfm").classList.remove("show"); toast("已清除：该对象回到默认拒绝"); renderFg(); }, "清除");
      break;
    }
    /* 批量作用面 = 本页勾选的条目（Q3 裁决：限定本页，与页 A D20 同口径）。
       作用面在勾选、计数、按钮三处同屏自证，不做「默认整表」的隐式批量。 */
    case "fgBatchSet": {
      const keys = [...FG.sel];
      if (!keys.length) { toast("请先在矩阵中勾选要设置的条目（作用面 = 本页勾选）"); break; }
      openFgReq(FG.cur, null, keys[0], keys);
      break;
    }
    case "fgBatchClear": {
      const keys = [...FG.sel].filter(k => { const e = fgEntryOf(k); return e && e.kind !== "none"; });
      if (!keys.length) { toast("所选条目均为未配置（默认拒绝），无需清除"); break; }
      const unit = byId(FG.cur) && !WEB(byId(FG.cur)) ? "个对象" : "条路径";
      confirmDlg("批量清除访问要求？", `将清除本页勾选的 <b>${keys.length}</b> ${unit}的访问要求，各自回到「未配置」 → <b>默认拒绝</b>（请求不达上游）。未勾选条目不受影响。变更入审计。`, () => {
        keys.forEach(k => {
          if (String(k).indexOf("fam|") === 0) {
            const h = famByKey(k); if (!h) return;
            h.a._frq = h.a._frq || {}; h.a._frq[h.o.id] = { kind: "none" };
          } else {
            const h = pathByKey(k); if (!h) return;
            h.pt._rq = { kind: "none" };
          }
        });
        FG.sel.clear();
        $("#dlgCfm").classList.remove("show");
        toast(`已批量清除 ${keys.length} ${unit}访问要求（变更入审计）`);
        renderFg();
      }, "批量清除");
      break;
    }
    /* 行勾选：限定本页（换资产 / 换筛选即清空），避免跨页误批量；跨粒度即先清空（见 fgSelKind） */
    case "fgChk": {
      const kind = String(el.value).indexOf("fam|") === 0 ? "fam" : "path";
      if (el.checked && FG.sel.size && fgSelKind() !== kind) {
        fgSelClear(); el.checked = true;
        toast("批量作用面不可跨粒度：已清空此前选中，本次仅勾选" + (kind === "fam" ? "资源级对象" : "L7 作用对象"));
      }
      if (el.checked) FG.sel.add(el.value); else FG.sel.delete(el.value);
      const tr = el.closest("tr"); if (tr) tr.classList.toggle("sel", el.checked);
      syncFgSel(); break;
    }
    /* 表头全选：作用面 = **该表当前页**——两张表各自独立分页，不得跨表勾选 */
    case "fgChkAll": {
      const tb = el.closest("table");
      const rows = tb ? Array.from(tb.querySelectorAll("tbody tr[data-key]")) : [];
      const kd = rows.length && rows[0].dataset.key.indexOf("fam|") === 0 ? "fam" : "path";
      const on = el.checked;   /* 先记住表头目标态：fgSelClear 会把它一并清掉 */
      if (on && FG.sel.size && fgSelKind() !== kd) fgSelClear();
      el.checked = on;
      rows.forEach(tr => {
        if (on) FG.sel.add(tr.dataset.key); else FG.sel.delete(tr.dataset.key);
        tr.classList.toggle("sel", on);
      });
      if (tb) Array.from(tb.querySelectorAll('input[data-act="fgChk"]')).forEach(c => { c.checked = on; });
      syncFgSel(); break;
    }
    case "reqCancel": {
      /* R4 零改动直接返回——只有真改过才需要确认放弃（与页 A 同规） */
      const DD = S.designer;
      const dirty = DD && DD._snap !== dsSnap(DD);
      const back = () => { S.designer = null; S.sel = null; setPage("pg-fg"); };
      if (!dirty) { back(); break; }
      confirmDlg("放弃本次编辑？", "未保存的改动将丢失。", () => { $("#dlgCfm").classList.remove("show"); back(); }, "放弃");
      break;
    }
    case "reqSave": reqSave(); break;

    /* --- 匿名开放声明（D16） --- */
    case "anonOn": {
      const a = byId(el.dataset.id);
      if (a.lv !== 1) { toast("整资产匿名开放仅适用于 L1 级资产（当前 L" + a.lv + "）；请先调整资产安全等级"); break; }
      if (hasMode(a, "agent")) { toast("整资产匿名开放不支持有端接入；请先在资产登记中移除有端形态"); break; }
      const ba = nonHttpProtos(a);
      if (ba.length) { toast("整资产匿名开放要求资产下全部资源均为 HTTP 协议；当前存在：" + ba.join("、") + "，请先移除或改为 HTTP 资源"); break; }
      confirmDlg("声明整资产匿名开放？", `<b>${esc(a.name)}</b> 将整体匿名开放：请求不进入认证与授权链，跳过主体认证、资产访问状态与准入判定。
        <div class="note red" style="margin-top:10px">影响：① 该资产在「资产访问控制策略」中的准入策略<b>整体不适用</b>；② 本页路径授权矩阵转只读；③ 现有逐路径访问要求<b>保留但暂不生效</b>（关闭声明后恢复）；④ <b>不做越权判定</b>，但 <b>WAF、限流、请求约束、行为策略与审计照常生效</b>。<br>约束：整资产匿名<b>仅适用于 L1 级、全部资源为 HTTP 协议、且未登记有端接入的资产</b>；请确认该资产不含需要登录保护的资源。</div>`,
        () => { a.anon = "asset"; $("#dlgCfm").classList.remove("show"); toast("已声明整资产匿名开放（变更入审计）"); renderFg(); }, "确认匿名开放");
      break;
    }
    case "anonOff": {
      const a = byId(el.dataset.id);
      confirmDlg("关闭整资产匿名开放？", `关闭后 <b>${esc(a.name)}</b> 恢复为逐路径授权：未配置路径回到<b>默认拒绝</b>，<b>匿名开放范围之外的访问一律拒绝</b>。`, () => {
        delete a.anon; $("#dlgCfm").classList.remove("show"); toast("已关闭整资产匿名开放"); renderFg();
      }, "关闭");
      break;
    }

    /* --- 确认弹窗 --- */
    case "cfmNo": {
      /* 二次认证：取消 = 不产生任何变更，回调调用方回滚 UI 状态 */
      const t = S.tfa; S.tfa = null; S.cfmCb = null;
      $("#dlgCfm").classList.remove("show");
      if (t && t.cancel) t.cancel();
      break;
    }
    case "cfmYes": {
      /* 二次认证模式：先校验凭据，通过后才执行原操作；凭据为空则保持弹窗并提示 */
      if (S.tfa) {
        const t = S.tfa;
        const v = (($("#tfaPwd") || {}).value || "").trim();
        if (!v) { toast("请输入" + t.method + "凭据后再提交（二次认证）"); break; }
        S.tfa = null; S.cfmCb = null; $("#dlgCfm").classList.remove("show");
        t.ok(); break;
      }
      const cb = S.cfmCb; S.cfmCb = null; $("#dlgCfm").classList.remove("show"); if (cb) cb(); break;
    }
    case "tfaMethod": {
      if (S.tfa) { S.tfa.pwd = (($("#tfaPwd") || {}).value || ""); S.tfa.method = el.dataset.v; render2FA(); }
      break;
    }
    default: break;
  }
});
/* 选择变更（下拉 / 输入失焦） */
/* 筛选控件登记表（单一来源，供下方 change 委托的门禁与分派共用）：三个页面各一组。
   新增筛选控件只在此登记一次——门禁白名单与分派链会自动一致。 */
const FILTER_IDS = {
  asp:    ["saK", "saGrp", "saType", "saMode", "saLv", "saOpen", "saSt"],
  fgList: ["gK", "gGrp", "gType", "gLv", "gOpen", "gFam"],
  fgMx:   ["mK", "mRes", "mRq", "mRisk"]
};
const FILTER_IDS_REG = new RegExp("^(" + Object.keys(FILTER_IDS).reduce((acc, k) => acc.concat(FILTER_IDS[k]), []).join("|") + ")$");
document.addEventListener("change", (e) => {
  const t0 = e.target;
  /* 筛选控件登记表（**单一来源**）：门禁白名单与下方分派读取同一份。
     历史上是「手写正则 + 另一条 id 硬枚举链」两处各写一遍——2026-09-13 就因正则漏词，使页 B
     「全部资源族」「全部风险」「全部生命周期」三枚下拉**控件在位、点它毫无反应**（无报错、无痕；其中「全部生命周期」已于 2026-09-14 随矩阵「生命周期」列一并移除——列与筛选**同源消长**）。
     新增筛选控件只在本表登记一次即可，两处自动一致；冒烟 A62 / A63 另设行为断言防回退。 */
  const isFilter = FILTER_IDS_REG.test(t0.id || "");
  const el = t0.closest("[data-act]");
  if (!el && !isFilter) return;
  const D = S.designer;
  const act = el ? el.dataset.act : "";
  /* 组树类变更动作一律要求设计器上下文在位：设计器已清空（保存 / 取消后）时不得解引用 */
  if (/^ds[A-Z]/.test(act) && !D) return;
  if (act === "dsField") { const f = el.dataset.f; if (f === "name") { D.name = el.value; renderAsp(); return; } dsField(el.dataset.uid, f, el.value, el); return; }
  if (act === "dsRoot") { D.tree.op = el.value; D.rootOp = el.value; renderAsp(); return; }
  /* 页 B「设置访问要求」页：要求形态（按主体属性 / 登录即可 / 显式公开 / 默认拒绝） */
  if (act === "reqKind") { reqSetKind(el.value); return; }
  if (act === "dsAct") { D.action = el.value === "reject" ? "reject" : "allow"; renderAsp(); return; }
  if (act === "dsOn") { D.on = el.checked; renderAsp(); return; }
  /* 页 A 行勾选：勾选范围限定当前页（翻页 / 换筛选即清空），避免跨页误批量 */
  if (act === "aspSelRow") {
    const id = el.dataset.id;
    if (el.checked) S.selRows.add(id); else S.selRows.delete(id);
    const tr = el.closest("tr"); if (tr) tr.classList.toggle("sel", el.checked);
    syncAspSel(); return;
  }
  /* 表头全选 = 本页**可选行**（冻结 / 匿名资产没有勾选框，天然不在集合内） */
  if (act === "aspSelAll") {
    $$('#pg-asp tbody input[data-act="aspSelRow"]').forEach(c => {
      if (el.checked) S.selRows.add(c.dataset.id); else S.selRows.delete(c.dataset.id);
      c.checked = el.checked;
      const tr = c.closest("tr"); if (tr) tr.classList.toggle("sel", el.checked);
    });
    syncAspSel(); return;
  }
  if (act === "dsFieldPop") return;
  /* 页 A 筛选（值取自本页控件；宿主资产管理列表用 f* 前缀，勿混用） */
  if (FILTER_IDS.asp.indexOf(t0.id) >= 0) {
    S.filter = {
      k: $("#saK") ? $("#saK").value.trim() : "",
      grp: $("#saGrp") ? $("#saGrp").value : "",
      type: $("#saType") ? $("#saType").value : "",
      mode: $("#saMode") ? $("#saMode").value : "",
      lv: $("#saLv") ? $("#saLv").value : "",
      en: $("#saOpen") ? $("#saOpen").value : "",
      st: $("#saSt") ? $("#saSt").value : ""
    };
    renderAsp(); return;
  }
  /* 页 B 筛选 */
  if (FILTER_IDS.fgList.indexOf(t0.id) >= 0) {
    FG.sel.clear();
    FG.filter = {
      k: $("#gK") ? $("#gK").value.trim() : "",
      grp: $("#gGrp") ? $("#gGrp").value : "",
      type: $("#gType") ? $("#gType").value : "",
      lv: $("#gLv") ? $("#gLv").value : "",
      en: $("#gOpen") ? $("#gOpen").value : "",
      fam: $("#gFam") ? $("#gFam").value : ""
    };
    renderFg(); return;
  }
  if (FILTER_IDS.fgMx.indexOf(t0.id) >= 0) {
    FG.sel.clear();
    FG.filter = { k: $("#mK") ? $("#mK").value : "", res: $("#mRes") ? $("#mRes").value : "", rq: $("#mRq") ? $("#mRq").value : "",
      risk: $("#mRisk") ? $("#mRisk").value : "" };
    renderFg(); return;
  }
});
/* 搜索框即时过滤 */
document.addEventListener("input", (e) => {
  const el = e.target.closest("input[type=search]");
  if (!el) return;
  clearTimeout(el._t); el._t = setTimeout(() => { el.dispatchEvent(new Event("change", { bubbles: true })); }, 260);
});
/* 组树内的自由文本（IP / 版本 / 时间）即时同步，避免重渲染后丢值 */
document.addEventListener("input", (e) => {
  const el = e.target.closest("input[data-act='dsField'],textarea[data-act='dsField']");
  if (!el) return;
  const f = el.dataset.f;
  if (!["csv", "lines", "from", "to", "ver"].includes(f)) return;
  if (!S.designer) return;   /* 设计器上下文已清空（刚保存 / 取消）：不得解引用 */
  const n = findNode(S.designer.tree, el.dataset.uid); if (!n || n.n.t !== "c") return;
  const c = n.n;
  if (f === "csv") c.v = String(el.value).split(/[,，]/).map(s => s.trim()).filter(Boolean);
  else if (f === "lines") c.v = String(el.value).split("\n").map(s => s.trim()).filter(Boolean);
  else if (f === "ver") { c.v = c.v || {}; c.v.ver = el.value; }
  else { c.v = c.v || {}; c.v[f] = el.value; }
  /* 只更新回读，不重渲染（保焦点） */
  const rb = rbTree(S.designer.tree);
  const l1 = document.querySelector(".rb-line"), l2 = document.querySelector(".rb-code");
  if (l1) l1.textContent = rb.text; if (l2) l2.textContent = rb.code;
});
/* 引用型属性取值弹层的关键字过滤：只换列表容器，不整页重渲染（保输入焦点） */
document.addEventListener("input", (e) => {
  const el = e.target.closest("input[data-act='dsKw']");
  if (!el) return;
  if (S.pop) S.pop.kw = el.value;
  const box = document.getElementById("kwBox_" + el.dataset.uid);
  const f = S.designer ? findNode(S.designer.tree, el.dataset.uid) : null;
  if (box && f && f.n.t === "c") box.innerHTML = multiListHTML(f.n);
});

/* ===== 保存设计器 ===== */
function saveDesigner() {
  const D = S.designer;
  const v = validateDs();
  const nm = String(D.name || "").trim();
  if (!nm) v.errs.push({ uid: "root", text: "策略名称为空" });
  else {
    /* R6 名称在同形态组内唯一：策略清单、审计记录与告警通知均按名称定位，重名会让三者无法唯一定位 */
    const dup = (((POLICIES[D.asId] || {})[D.mode]) || []).find(p => String(p.name || "").trim() === nm && p.id !== D.polId);
    if (dup) v.errs.push({ uid: "root", text: `策略名称「${nm}」在本形态组内已存在：请改用不重复的名称，以便策略清单、审计记录与告警通知唯一定位` });
  }
  if (v.errs.length) {
    toast("存在 " + v.errs.length + " 项错误，已阻断保存： " + v.errs[0].text.slice(0, 34) + "…");
    renderAsp(); return;
  }
  const commit = () => {
    const list = POLICIES[D.asId][D.mode] || (POLICIES[D.asId][D.mode] = []);
    const cond = cleanTree(D.tree);
    /* 认证要求不单独落库：它由条件中的认证维度属性（auth.level / auth.composite）承载，
       引擎判定时不达标即触发追加认证，不落成独立动作或独立要求字段 */
    if (D.polId) {
      const p = list.find(x => x.id === D.polId);
      if (p) { p.name = nm; p.action = D.action; p.on = D.on; p.cond = cond; p.at = nowTs(); p.by = "张伟"; }
    } else {
      list.push({ id: "asp-" + D.asId + "-" + (++POL_SEQ), name: nm, action: D.action, on: D.on, cond, by: "张伟", at: nowTs() });
    }
    S.designer = null; S.view = "cfg"; S.pop = null;
    /* 承载期次提示（F5.3）：声明 L3~L5 时并入保存回执——只提示、不阻断，不改判定与落库结构 */
    const carry = authCarryNote(cond);
    toast((D.polId
      ? `已保存准入策略（${MODE_LABEL[D.mode]}组）的变更：启用即生效，变更入审计`
      : `已新增准入策略（${MODE_LABEL[D.mode]}组）：默认未启用，在卡片上启用后方参与裁决`) + (carry ? "　· " + carry : ""));
    renderAsp();
  };
  if (v.warns.length) {
    confirmDlg("保存前确认风险点", `<div class="note warn">${v.warns.map(w => "· " + esc(w.text)).join("<br>")}</div>`, commit, "确认保存");
  } else commit();
}

/* ==========================================================================
   初始化（并入宿主：页面切换复用 showPage，本模块补面包屑 / 渲染 / 页脚提示）
   ========================================================================== */
function setCrumbs(a, bb) { $("#crumbs").innerHTML = `<span class="p">安全策略</span><span class="sep">/</span><span>${esc(a)}</span>${bb ? `<span class="sep">/</span><span>${esc(bb)}</span>` : ""}`; }
function setPage(pg, noRender) {
  /* 多页化：目标页不在本文件 → 先跳转；跨页时不再执行后续渲染（本页没有对应容器）。 */
  if (pg !== PG_CUR) { goPage(pg); return; }
  showPage(pg);
  /* 细粒度页已收敛为页 A 的下钻视图：侧栏仅保留「资产访问控制策略」入口并保持其高亮 */
  $$("#side .mi").forEach(m => m.classList.toggle("on", m.dataset.pg === pg || ((pg === "pg-fg" || pg === "pg-fgreq") && m.dataset.pg === "pg-asp") || ((pg === "pg-detail" || pg === "pg-edit") && m.dataset.pg === "pg-list") || ((pg === "pg-rate" || pg === "pg-reqcon") && m.dataset.pg === "pg-websec")));
  if (pg !== "pg-asp" && pg !== "pg-fg" && pg !== "pg-fgreq") return;
  if (pg === "pg-asp") { if (S.cur) CUR_ACL = S.cur; setCrumbs("资产访问控制策略"); if (!noRender) { S.pop = null; renderAsp(); } }
  else if (pg === "pg-fgreq") { if (FG.cur) CUR_ACL = FG.cur; setCrumbs("资产细粒度访问策略", "设置访问要求"); if (!noRender) renderFgReq(); }
  else { if (FG.cur) CUR_ACL = FG.cur; setCrumbs("资产细粒度访问策略"); if (!noRender) { FG.view = FG.cur && FG.view === "matrix" ? "matrix" : "list"; renderFg(); } }
  const fh = $("#footHint"); if (fh) fh.textContent = pg === "pg-asp" ? "资产准入判定" : "资源级访问判定";
}
/* 侧栏菜单：宿主监听先注册先执行（showPage），本监听后执行补齐面包屑与渲染 */
$$("#side .mi").forEach(m => {
  if (m.dataset.pg === "pg-asp" || m.dataset.pg === "pg-fg") m.addEventListener("click", () => setPage(m.dataset.pg));
});
/* 资产详情 → 安全策略两页入口（btnGoFg 在详情头部与 T3 工具栏各一处，均绑定） */
/* 入口复位：从资产详情进入是「以该资产为上下文」的**新一次进入**——筛选、勾选与页码一律复位到干净视图。
   否则管理员会迎面看到一份被上一次筛选过滤过的列表 / 矩阵，找不到自己刚点进来的资产。 */
const _goAsp = () => { const a = curAsset(); if (!a) return; S.cur = a.id; S.view = "list"; S.mode = ""; S.filter = {}; S.selRows.clear(); window.PAsp = 1; setPage("pg-asp"); };
const _goFg = () => { const a = curAsset(); if (!a) return; FG.cur = a.id; FG.view = "matrix"; FG.filter = {}; FG.sel.clear(); window.PFgMx = 1; setPage("pg-fg"); };
$$("#btnGoAsp").forEach(b => b.addEventListener("click", _goAsp));
/* R26 两处「配置访问要求」入口（详情头部 / 细粒度资源清单工具栏）不再共用同一个 id——id 必须唯一，
   否则 $("#btnGoFg") 只能命中第一处、label 关联与无障碍定位也会歧义。工具栏入口改用 data-go 标记。 */
$$("#btnGoFg").forEach(b => b.addEventListener("click", _goFg));
$$("[data-go='fg']").forEach(b => b.addEventListener("click", _goFg));

/* ==========================================================================
   安全设置 · 凭据托管（网关托管凭据管理）· 一期
   --------------------------------------------------------------------------
   三个分区（与资产「代理与上游」卡逐行对应）：
     ① 网关托管凭据   口令 / 密钥类：Basic / API-Key / OAuth2 Client
     ② CA 管理        信任锚（根 CA / 自签证书）：仅托管公钥证书，上传、轮换、引用保护
     ③ mTLS 客户端证书 证书 + 私钥；握手自动出示，私钥不出平台、不可导出、不可回读
   需求依据：F6.2 规则 6~9（上游 TLS 校验 / 身份头默认删除 / 可信凭据注入 / 上游认证三档）
            F9.3 规则 2·3（帮助语口径「由平台维护」；「不参与谁能访问判定」）
            AC-F6.2-4 / AC-F9.3-1；WBS B7.1（上游认证配置面与语义边界说明）
   与资产详情 / 登记向导「代理与上游 → 上游认证与凭据处理」卡双向可达：
     · 卡内「托管凭据」下拉            → 本页「网关托管凭据」
     · 卡内「信任锚（根 CA）」行        → 本页「CA 管理」
     · 卡内「客户端证书（mTLS）」行     → 本页「mTLS 客户端证书」（mTLS 客户端证书，私钥不出平台）
   演示基准日取宿主 nowD() = 2026-09-06；「即将过期」= 有效期 ≤ 30 天。
   ========================================================================== */
/* ① 网关托管凭据：口令 / 密钥类（mTLS 客户端证书因含私钥、形态为证书，单列第 ③ 分区维护） */
const CRED_TYPES = ["Basic", "API-Key", "OAuth2 Client"];
const CRED_LIST = [
  { id:"cred-rpt",    name:"监管报送网关", type:"Basic",         where:"Authorization: Basic", user:"svc-report", inj:{ carrier:"header", field:"Authorization", prefix:"Basic " }, assets:["监管报送接口"],   rot:"2026-08-12", st:"启用" },
  { id:"cred-aml",    name:"反洗钱报送",   type:"OAuth2 Client", where:"Authorization: Bearer（平台代取 token）", oauth:{ endpoint:"https://aml-gw.example.com/oauth2/token", mode:"client_credentials", authMethod:"client_secret_basic", scope:"aml.report", audience:"https://aml.example.com" }, clientId:"aml-gw-client", assets:["核心网银门户"], rot:"2026-09-01", st:"启用" },
  { id:"cred-open",   name:"开放平台对接", type:"API-Key",       where:"X-API-Key（请求头）", inj:{ carrier:"header", field:"X-API-Key", prefix:"" }, assets:[],                 rot:"2026-07-18", st:"启用" },
  { id:"cred-legacy", name:"老报送通道",   type:"Basic",         where:"Authorization: Basic", user:"svc-legacy", inj:{ carrier:"header", field:"Authorization", prefix:"Basic " }, assets:[],                 rot:"2026-03-02", st:"停用" }
];
/* ③ mTLS 客户端证书：证书 + 私钥；私钥不出平台、不可导出、不可回读 */
const MTLS_LIST = [
  { id:"mtls-mb",  name:"手机银行对账", subj:"CN=mb-recon.bank.local",  issuer:"CN=Bank Internal Issuing CA", exp:"2027-03-15", fp:"5D:0A:77:…:31", assets:["手机银行后台"], rot:"2026-06-30", keyEnc:true,  st:"有效" },
  { id:"mtls-rpt", name:"数据报送前置", subj:"CN=rpt-front.bank.local", issuer:"CN=Bank RPT Root CA",         exp:"2026-09-28", fp:"E1:6B:3C:…:02", assets:["监管报送接口"],     rot:"2026-04-08", keyEnc:false, st:"即将过期" }
];
const CA_LIST = [
  { id:"ca-wy",    name:"网银域根 CA",      code:"bank-wy-root",         type:"根 CA",       subj:"CN=Bank WY Root CA, O=XX Bank",  exp:"2031-05-08", fp:"3F:9A:C1:…:C2", assets:["核心网银门户","对公网银体验门户"], st:"有效" },
  { id:"ca-oa",    name:"OA 域根 CA",       code:"bank-oa-root",         type:"根 CA",       subj:"CN=Bank OA Root CA, O=XX Bank",  exp:"2027-11-20", fp:"7C:11:8E:…:5E", assets:["统一身份门户"],           st:"有效" },
  { id:"ca-rpt",   name:"数据报送域根 CA",  code:"bank-rpt-root",        type:"根 CA",       subj:"CN=Bank RPT Root CA, O=XX Bank", exp:"2026-10-02", fp:"A2:4D:F0:…:90", assets:["监管报送接口"],      st:"即将过期" },
  { id:"ca-front", name:"报送前置自签证书", code:"rpt-front.bank.local", type:"自签叶证书", subj:"CN=rpt-front.bank.local",        exp:"2026-09-30", fp:"B8:22:19:…:4A", assets:[],                    st:"即将过期" }
];
const _ST_TAG = { "启用":"t-ok", "停用":"t-gray", "有效":"t-ok", "即将过期":"t-warn", "已过期":"t-err" };
const stTag = s => `<span class="tag ${_ST_TAG[s]||"t-gray"}">${esc(s)}</span>`;
/* 日期工具（第十九轮）：演示基准日 nowD() 即「今天」，上传 / 轮换若把 exp 写成 nowD()，
     就会出现「刚换的证书当天到期、却仍标有效」的自相矛盾（评审 D1）。故一律 +365 天；
     并给出按 exp 推导状态的唯一真源 credExpSt（≤0 已过期 / ≤30 即将过期 / 否则有效）。 */
const addDays = (d, n) => { const t = new Date(d + "T00:00:00"); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const credExpSt = exp => { const days = Math.round((new Date(exp + "T00:00:00") - new Date(nowD() + "T00:00:00")) / 86400000); return days <= 0 ? "已过期" : days <= 30 ? "即将过期" : "有效"; };
/* 状态真源接线（第二十轮）：CA / mTLS 的「有效性状态」**唯一**由 exp 派生 ——
   第十九轮抽出了 credExpSt 却零调用（新建 / 轮换写死 st:"有效"、种子写死「即将过期」），
   改 exp 不改 st 会自相矛盾。credNormalize 在每次渲染前把 CA / mTLS 的 st 重算回写；
   ⚠ CRED 的「启用 / 停用」是运维态、与证书有效期无关，**不参与**派生。
   已验算：用 credExpSt 重算全部 CA / mTLS 种子 exp，结果与既有写死 st **完全一致**（基准日 2026-09-06）。 */
function credNormalize(){ [].concat(CA_LIST, MTLS_LIST).forEach(function(c){ if(c && c.exp) c.st = credExpSt(c.exp); }); }
/* 引用资产列：默认只读文本；传入 id 时渲染为**只读入口**，点开「反向引用清单」。
   kind: "cred"（默认）| "ca" | "mtls" —— 三个分区共用同一入口，分别派发 credRefs / caRefs / mtlsRefs。
   ⚠ 这不是「把对象应用到资产」的动作 —— 挂载 / 解绑只在资产「代理与上游」侧发生，
   本列只回答「谁在用我」，故用 <a> 而非按钮，避免与真正的「操作」混为一谈。 */
const refCell = (arr, id, kind) => {
  var txt = (arr && arr.length) ? esc(arr.join("、")) : '<span class="muted">未引用</span>';
  if (!id) return txt;
  var fn = kind === "ca" ? "caRefs" : kind === "mtls" ? "mtlsRefs" : "credRefs";
  return '<a href="#" class="hl" style="text-decoration:none" data-cid="' + id + '" onclick="' + fn + '(this.dataset.cid);return false" title="查看引用该对象的资产（只读；挂载与解绑在资产「代理与上游」侧）">' + txt + '</a>';
};
const taStyle = "width:100%;box-sizing:border-box;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:12.5px;font-family:ui-monospace,Menlo,Consolas,monospace";

function renderCred(){
  credNormalize();
  const host = document.getElementById("pg-cred"); if(!host) return;
  const tab = ["c1", "c2", "c3"].indexOf(window._credTab) >= 0 ? window._credTab : "c1";
  host.innerHTML = `
    <div class="title-row">
      <h2>凭据托管</h2>
      <div class="muted">网关到上游的<b>机器对接凭据</b>与<b>信任锚</b>；由平台统一托管，<b>不参与「谁能访问」判定</b></div>
    </div>
    <div class="note blue">上游连接与通道安全配置（网关 → 资产后端）<b>不参与「谁能访问」判定</b>；浏览器会话流量不需要资产凭据，本页仅针对<b>网关到上游</b>的连接。账号密码代填（用户凭据）属平台基座认证集成能力，<b>与本页不同层</b>（F9.3 规则 2·3）。</div>

    <div class="tabs" id="credTabs">
      <button data-ct="c1" class="${tab==="c1"?"on":""}">网关托管凭据<span class="num">${CRED_LIST.length}</span></button>
      <button data-ct="c2" class="${tab==="c2"?"on":""}">CA 管理（信任锚）<span class="num">${CA_LIST.length}</span></button>
      <button data-ct="c3" class="${tab==="c3"?"on":""}">mTLS 客户端证书<span class="num">${MTLS_LIST.length}</span></button>
    </div>

    <div class="tbp ${tab==="c1"?"on":""}" id="ct-c1">
      <div class="card">
        <div class="card-h">
          <h3>网关托管凭据<span class="sub">网关到上游的机器对接凭据（口令 / 密钥类）；由平台托管，录入后明文不可回读</span></h3>
          <div class="toolbar"><button class="btn primary" id="credNewBtn">+ 新建凭据</button></div>
        </div>
        <div class="card-b">
          <div class="toolbar" style="margin-bottom:12px">
            <div class="input-w"><input type="search" id="credK" placeholder="搜索凭据名称 / 适用上游" style="width:240px"><i>搜索</i></div>
            <select id="credFType"><option value="">全部类型</option>${CRED_TYPES.map(t=>`<option>${esc(t)}</option>`).join("")}</select>
            <select id="credFSt"><option value="">全部状态</option><option>启用</option><option>停用</option></select>
          </div>
          <div class="tbl-wrap">
            <table class="lst" id="credTbl">
              <colgroup><col style="width:176px"><col style="width:140px"><col><col style="width:120px"><col style="width:110px"><col style="width:84px"><col style="width:292px"></colgroup>
              <thead><tr><th>凭据名称</th><th>类型</th><th>注入位置</th><th>引用资产</th><th>最近轮换</th><th>状态</th><th>操作</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="note" style="margin-top:12px">
            <b>网关托管凭据口径</b>：① 本区承载<b>口令 / 密钥类</b>机器对接凭据（Basic / API-Key / OAuth2 Client）；<b>mTLS 客户端证书</b>因含私钥、形态为证书，单列「mTLS 客户端证书」分区——F9.3 规则 3 的类型集（Basic / API-Key / mTLS / OAuth2 Client）由本页两个分区共同承载。<br>② <b>明文不可回读</b>——凭据值录入后仅以掩码呈现，界面不提供「查看明文」，变更一律走「轮换（替换）」。<br>③ <b>删除保护</b>——被资产引用时不可删除，须先在资产「代理与上游 → 上游认证与凭据处理」解除引用。<br>④ <b>轮换</b>支持<b>双值过渡</b>（新值生效后旧值保留 N 天，供上游平滑切换）或<b>立即失效</b>。<br>⑤ <b>停用</b>后引用该凭据的资产上游注入失败，请求按 F6.2 规则 13 返回 <b>502</b>，须先替换或解除引用。<br>⑥ 新建 / 轮换 / 停用 / 删除与查看引用<b>全部入审计</b>。<br>⑦ <b>「应用（绑定）」只发生在资产侧</b>——「哪个资产用哪条凭据」在资产「代理与上游 → 上游认证与凭据处理」中配置；本页只做<b>反向只读反映</b>（「引用资产」列点开为只读清单），<b>不提供从库侧挂载 / 解绑的动作</b>。<br>⑧ <b>OAuth2 Client 是「换取式」</b>——网关以 <b>POST application/x-www-form-urlencoded</b> 调<b>令牌端点</b>换取<b>短时 access token</b>（再注入 <b>Authorization: Bearer</b>），token 过期自动重取；F6.2 规则 11 的「上游 401 仅 GET / HEAD 自动刷新并重放一次」适用于<b>注入 token 的模式</b>（平台 token 与换取式托管凭据均在内）。<b>凭据本体</b>＝ client_id（可回读）+ client_secret（密文 · 不可回读）；<b>换取配置</b>＝ 令牌端点 / 授权模式（grant_type）/ 客户端认证方式（token_endpoint_auth_method：client_secret_basic｜client_secret_post）/ scope / audience。授权模式一期承载 client_credentials；password（需资源拥有者账号）与 mTLS 换 token 属二期 F2.x。<b>Basic / API-Key / mTLS 为静态注入</b>，不经换取。<br>⑨ <b>参数按类型驱动</b>——凭据不是一个「单值」：<b>Basic</b> 本体为<b>用户名 + 口令</b>（注入 <b>Authorization: Basic base64(user:pass)</b>）；<b>API-Key</b> 本体为<b>密钥值</b>，注入由<b>注入载体（请求头 / 查询参数 / Cookie）+ 字段名 + 值前缀</b>共同决定；<b>OAuth2 Client</b> 见 ⑧。注入位置<b>由类型推导、不再手填</b>。<br>⑩ <b>可编辑的只有非敏感元数据</b>——名称 / 适用上游 / 注入载体与字段名 / OAuth2 换取配置可「编辑」；<b>类型与凭据值</b>（口令 / 密钥 / client_secret）<b>不可改</b>，凭据值变更一律走「轮换（替换）」。CA / mTLS 同理：名称（CA 另含类型）可编辑，证书内容走「轮换」。
          </div>
        </div>
      </div>
    </div>

    <div class="tbp ${tab==="c2"?"on":""}" id="ct-c2">
      <div class="card">
        <div class="card-h">
          <h3>信任锚（根 CA）<span class="sub">内网私有 PKI / 自签证书；供上游 TLS「自定义信任锚」引用</span></h3>
          <div class="toolbar"><button class="btn primary" id="caUpBtn">+ 上传信任锚</button></div>
        </div>
        <div class="card-b">
          <div class="tbl-wrap">
            <table class="lst" id="caTbl">
              <colgroup><col style="width:176px"><col style="width:100px"><col><col style="width:100px"><col style="width:142px"><col style="width:130px"><col style="width:86px"><col style="width:240px"></colgroup>
              <thead><tr><th>名称</th><th>类型</th><th>主体（Subject）</th><th>有效期至</th><th>指纹（SHA-256）</th><th>引用资产</th><th>状态</th><th>操作</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="note" style="margin-top:12px">
            <b>CA 管理口径</b>：① <b>仅托管公钥证书</b>——此处为<b>信任锚（根 CA / 自签证书）</b>，不含私钥；<b>mTLS 客户端证书（含私钥）</b>在「mTLS 客户端证书」分区中以凭据形式托管，<b>私钥不出平台</b>（F6.2 规则 6）。<br>② <b>上传</b>支持粘贴 PEM 或上传文件（.pem / .crt / .cer），解析主体、有效期与 SHA-256 指纹后确认入库；同名或同指纹重复将被拒绝。<br>③ <b>轮换</b>新旧锚<b>并存过渡</b>（避免上游切换 CA 时断链），过渡结束由管理员停用旧锚。<br>④ <b>引用保护</b>——被资产「代理与上游 → 上游 TLS 校验 → 自定义信任锚」引用时不可删除。<br>⑤ 有效期 ≤ 30 天标注<b>即将过期</b>并提示轮换。<br>⑥ 本列表即资产侧「信任锚（根 CA）」输入框（选择平台预置 CA 或输入名称）的候选来源，变更<b>全部入审计</b>。
          </div>
        </div>
      </div>
    </div>

    <div class="tbp ${tab==="c3"?"on":""}" id="ct-c3">
      <div class="card">
        <div class="card-h">
          <h3>mTLS 客户端证书<span class="sub">网关到上游双向 TLS 握手时出示；证书与私钥由平台托管，私钥不出平台</span></h3>
          <div class="toolbar"><button class="btn primary" id="mtlsUpBtn">+ 上传客户端证书</button></div>
        </div>
        <div class="card-b">
          <div class="tbl-wrap">
            <table class="lst" id="mtlsTbl">
              <colgroup><col style="width:152px"><col><col style="width:184px"><col style="width:100px"><col style="width:142px"><col style="width:120px"><col style="width:84px"><col style="width:258px"></colgroup>
              <thead><tr><th>名称</th><th>主体（Subject）</th><th>颁发者</th><th>有效期至</th><th>指纹（SHA-256）</th><th>引用资产</th><th>状态</th><th>操作</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="note" style="margin-top:12px">
            <b>mTLS 客户端证书口径</b>：① 托管对象 = <b>客户端证书 + 私钥</b>；私钥<b>不出平台、不可导出、不可回读</b>，界面仅呈现证书主体、颁发者、有效期与指纹（F6.2 规则 6）。<br>② <b>使用时由网关在握手阶段自动出示</b>——资产侧在「代理与上游 → 客户端证书（mTLS）」引用本区凭据；未引用则为单向 TLS。<br>③ <b>轮换</b>上传新证书与私钥后<b>新旧并存过渡</b>（避免上游握手失败），过渡结束停用旧证书。<br>④ <b>引用保护</b>——被资产引用时不可删除。<br>⑤ 有效期 ≤ 30 天标注<b>即将过期</b>并提示轮换。<br>⑥ 变更<b>全部入审计</b>。
          </div>
        </div>
      </div>
    </div>

    <div class="note" style="margin-top:2px">
      <b>需求依据</b>：F6.2 规则 6~9（上游 TLS 校验 / 身份头默认删除 / 可信凭据注入 / 上游认证三档：不注入 · 平台 token · 网关托管凭据）· F9.3 规则 2·3（帮助语口径与「不参与判定」）· AC-F6.2-4 / AC-F9.3-1 · WBS B7.1。<br>
      <b>三个分区与「代理与上游」卡逐行对应</b>：<b>网关托管凭据</b> ↔ 上游认证「注入网关托管凭据」档；<b>CA 管理（信任锚）</b> ↔ 上游 TLS「信任锚（根 CA）」；<b>mTLS 客户端证书</b> ↔ 上游 TLS「客户端证书（mTLS）」。
    </div>`;

  host.querySelectorAll("#credTabs button").forEach(b=>b.addEventListener("click",()=>credTab(b.dataset.ct)));
  ["credK","credFType","credFSt"].forEach(id=>{ const el=host.querySelector("#"+id); if(el) el.addEventListener("input",credRows); });
  host.querySelector("#credNewBtn").addEventListener("click", credNew);
  host.querySelector("#caUpBtn").addEventListener("click", caUp);
  host.querySelector("#mtlsUpBtn").addEventListener("click", mtlsUp);
  credRows(); caRows(); mtlsRows();
}

function credTab(ct){
  window._credTab = ct;
  const host = document.getElementById("pg-cred"); if(!host) return;
  host.querySelectorAll("#credTabs button").forEach(b=>b.classList.toggle("on", b.dataset.ct===ct));
  /* 分区板：统一按 .tbp 的 id 约定（ct-<分区>）切换，新增分区不必再改本函数 */
  host.querySelectorAll(".tbp").forEach(p=>p.classList.toggle("on", p.id === "ct-" + ct));
}
/* 与「代理与上游」卡互跳：详情 / 向导两处的帮助语链接均调用本函数 */
function goCred(tab){
  if(tab) window._credTab = tab;
  /* 多页化：凭据托管已独立成页（cred-hosting.html）。 */
  if (PG_CUR !== "pg-cred") { goPage("pg-cred", tab ? { tab: tab } : {}); return; }
  showPage("pg-cred");
  document.getElementById("crumbs").innerHTML='<span class="p">安全设置</span><span class="sep">/</span><span>凭据托管</span>';
  renderCred();
  $$("#side .mi").forEach(m=>m.classList.toggle("on", m.dataset.pg==="pg-cred"));
  window.scrollTo(0,0);
}
window.goCred = goCred;

/* —— 网关托管凭据 —— */
function credRows(){
  const host=document.getElementById("pg-cred"); if(!host) return;
  const k=(host.querySelector("#credK").value||"").trim().toLowerCase();
  const t=host.querySelector("#credFType").value, s=host.querySelector("#credFSt").value;
  const rows=CRED_LIST.filter(c=>(!k||[c.name,c.id,c.where,c.up||""].concat(c.assets).join(" ").toLowerCase().includes(k))&&(!t||c.type===t)&&(!s||c.st===s));
  const tb=host.querySelector("#credTbl tbody"); if(!tb) return;
  tb.innerHTML = rows.length ? rows.map(c=>`<tr>
    <td><b>${esc(c.name)}</b><div class="muted">${esc(c.id)}</div></td>
    <td>${esc(c.type)}${c.oauth ? '<div class="muted" style="font-size:11.5px">换取式 · '+esc(c.oauth.mode||"client_credentials")+'</div>' : ""}</td>
    <td class="muted">${esc(c.where)}</td>
    <td>${refCell(refsOf("cred", c.id), c.id)}</td>
    <td class="col-dt">${esc(c.rot)}</td>
    <td>${stTag(c.st)}</td>
    <td class="cell-op"><span class="opgrp">
      <button class="btn sm" onclick="credEdit('${c.id}')">编辑</button>
      <button class="btn sm" onclick="credRotate('${c.id}')">轮换</button>
      <button class="btn sm" onclick="credToggle('${c.id}')">${c.st==="启用"?"停用":"启用"}</button>
      <button class="btn sm danger" onclick="credDel('${c.id}')">删除</button>
    </span></td></tr>`).join("") :
    `<tr><td colspan="7"><div class="empty"><div class="big">无匹配凭据</div>调整筛选条件或新建凭据</div></td></tr>`;
}
const credById = id => CRED_LIST.find(c=>c.id===id);
/* 引用真源统一（第二十轮）：库侧「引用资产」= **种子登记 ∪ 资产侧显式引用**
   （a._injCred / a._mtls / a._tlsCa）。此前只有种子写死、资产侧改动不回写 ⇒
   库侧看不见新增引用、删除保护也可能失准（同一事实两处实现）。
   ⚠ 只统计**显式**字段（存在且非空），不计资产侧渲染默认值 `a._injCred||"cred-rpt"`；
     故不会把全部资产算成 cred-rpt 的引用。显示 / 反向清单 / 删除保护三处统一读本函数。 */
function refsOf(kind, id){
  const c = kind==="ca" ? caById(id) : kind==="mtls" ? mtlsById(id) : credById(id);
  if(!c) return [];
  const seed = (c.assets||[]).slice();
  const sat = ASSETS.filter(function(a){
    if(kind==="cred") return a._injCred===id;
    if(kind==="mtls") return a._mtls===id;
    return !!a._tlsCa && (a._tlsCa===c.name || a._tlsCa===c.name+"（"+c.code+"）");
  }).map(function(a){ return a.name; });
  return Array.from(new Set(seed.concat(sat)));
}
function credEdit(id){
  const c=credById(id); if(!c) return;
  const t=c.type, isBasic=t==="Basic", isKey=t==="API-Key", isOAuth=t==="OAuth2 Client";
  const inj=c.inj||{carrier:"header",field:"",prefix:""}, o=c.oauth||{};
  const CARN={header:"请求头",query:"查询参数",cookie:"Cookie"};
  const sel=(v,cur,label)=>`<option value="${v}" ${cur===v?"selected":""}>${label}</option>`;
  const rows=[
    `<div class="fld"><label>凭据名称 <span class="req">*</span></label><input type="text" id="ceName" value="${esc(c.name)}"></div>`,
    `<div class="fld"><label>类型 <span class="muted">（不可修改）</span></label><input type="text" value="${esc(c.type)}" readonly></div>`,
  ];
  if(isBasic){
    rows.push(`<div class="fld"><label>用户名</label><input type="text" id="ceUser" value="${esc(c.user||"")}"></div>`);
    rows.push(`<div class="fld"><label>口令 <span class="muted">（不可回读）</span></label><input type="text" value="••••••••" readonly><div class="help">口令变更请用「轮换」。</div></div>`);
  }
  if(isKey){
    rows.push(`<div class="fld"><label>注入载体</label><select id="ceCarrier">${["header","query","cookie"].map(v=>sel(v,inj.carrier,CARN[v])).join("")}</select></div>`);
    rows.push(`<div class="fld"><label>字段名 <span class="req">*</span></label><input type="text" id="ceField" value="${esc(inj.field||"")}"></div>`);
    rows.push(`<div class="fld"><label>值前缀</label><select id="cePrefix">${sel("",inj.prefix,"无")}${sel("Bearer ",inj.prefix,"Bearer ")}${sel("ApiKey ",inj.prefix,"ApiKey ")}</select></div>`);
    rows.push(`<div class="fld"><label>密钥值 <span class="muted">（不可回读）</span></label><input type="text" value="••••••••" readonly><div class="help">密钥变更请用「轮换」。</div></div>`);
  }
  if(isOAuth){
    rows.push(`<div class="fld"><label>客户端标识 client_id</label><input type="text" id="ceOauthId" value="${esc(c.clientId||"")}"></div>`);
    rows.push(`<div class="fld"><label>客户端密钥 client_secret <span class="muted">（不可回读）</span></label><input type="text" value="••••••••" readonly><div class="help">client_secret 变更请用「轮换」。</div></div>`);
    rows.push(`<div class="fld full"><label>令牌端点 token_endpoint <span class="req">*</span></label><input type="text" id="ceOauthEp" value="${esc(o.endpoint||"")}"></div>`);
    rows.push(`<div class="fld"><label>授权模式 grant_type</label><select id="ceOauthMode">${sel("client_credentials",o.mode,"客户端凭据 client_credentials（一期承载）")}${sel("password",o.mode,"账号密码 password（二期）")}${sel("mtls",o.mode,"客户端证书换 token（二期）")}</select></div>`);
    rows.push(`<div class="fld"><label>客户端认证方式</label><select id="ceOauthAuth">${sel("client_secret_basic",o.authMethod,"client_secret_basic（Basic 头 · 推荐）")}${sel("client_secret_post",o.authMethod,"client_secret_post（密钥放 body）")}</select></div>`);
    rows.push(`<div class="fld"><label>scope</label><input type="text" id="ceOauthScope" value="${esc(o.scope||"")}"></div>`);
    rows.push(`<div class="fld"><label>audience / resource</label><input type="text" id="ceOauthAud" value="${esc(o.audience||"")}"></div>`);
  }
  rows.push(`<div class="fld full"><label>适用上游 <span class="muted">（选填，仅作检索备注）</span></label><input type="text" id="ceUp" value="${esc(c.up||"")}"></div>`);
  openDlg("编辑凭据 · "+c.name, "仅可修改<b>非敏感</b>元数据；凭据值（口令 / 密钥 / client_secret）不可回读，变更请用「轮换」。"+(c.rotMode==="dual"?"　最近轮换 "+c.rot+"（双值过渡 · 旧值保留 "+(c.rotKeepDays||7)+" 天）":(c.rot?"　最近轮换 "+c.rot+"（立即失效）":"")), `<div class="form-grid">${rows.join("")}</div>`, "lg");
  document.getElementById("dlg1Ok").onclick=()=>{
    const name=(document.getElementById("ceName").value||"").trim();
    if(!name){ markBad("ceName",true); toast("凭据名称为必填"); return; }
    if(CRED_LIST.some(x=>x!==c && x.name===name)){ markBad("ceName",true); toast("同名凭据已存在："+name); return; }
    if(isKey && !((document.getElementById("ceField").value||"").trim())){ markBad("ceField",true); toast("API-Key：字段名为必填（如 X-API-Key）"); return; }
    if(isOAuth){
      const ep=(document.getElementById("ceOauthEp").value||"").trim();
      if(!ep){ markBad("ceOauthEp",true); toast("OAuth2 Client：令牌端点必填"); return; }
      if(!/^https:\/\//i.test(ep)){ markBad("ceOauthEp",true); toast("令牌端点必须为 HTTPS（F6.2 规则 6）："+ep); return; }
      if(!((document.getElementById("ceOauthId")||{}).value||"").trim()){ markBad("ceOauthId",true); toast("OAuth2 Client：客户端标识 client_id 为必填"); return; }
    }
    /* 校验前置（第二十轮）：此前先写 c.name / c.up 再校验用户名 ⇒ 校验失败 return 时
       「部分落库」（改了一半、取消无效）。现改为**全部校验通过后才写库**。 */
    let _uv="";
    if(isBasic){
      const u=document.getElementById("ceUser"); _uv=(u ? (u.value||"") : "").trim();
      if(!_uv){ markBad("ceUser", true); toast("Basic：用户名为必填"); return; }
    }
    c.name=name; c.up=(document.getElementById("ceUp").value||"").trim();
    if(isBasic){ c.user=_uv; c.inj={ carrier:"header", field:"Authorization", prefix:"Basic " }; }
    if(isKey){ const car=document.getElementById("ceCarrier").value, fld=(document.getElementById("ceField").value||"").trim();
      c.inj={ carrier:car, field:fld, prefix:document.getElementById("cePrefix").value };
      c.where=fld+"（"+CARN[car]+"）"; }
    if(isOAuth){ c.clientId=((document.getElementById("ceOauthId")||{}).value||"").trim();
      c.oauth={ endpoint:(document.getElementById("ceOauthEp").value||"").trim(), mode:document.getElementById("ceOauthMode").value, authMethod:document.getElementById("ceOauthAuth").value, scope:(document.getElementById("ceOauthScope").value||"").trim(), audience:(document.getElementById("ceOauthAud").value||"").trim() }; }
    closeDlg(); toast("凭据「"+name+"」已更新（仅非敏感元数据；凭据值变更请用「轮换」，变更入审计）（演示）"); renderCred(); credTab("c1");
  };
}

function credNew(){
  openDlg("新建托管凭据","网关到上游的机器对接凭据；由平台托管，录入后明文不可回读。",`
    <div class="form-grid">
      <div class="fld"><label>凭据名称 <span class="req">*</span></label><input type="text" id="cnName" placeholder="如：监管报送网关"></div>
      <div class="fld"><label>类型 <span class="req">*</span></label><select id="cnType">${CRED_TYPES.map(t=>`<option>${esc(t)}</option>`).join("")}</select></div>
      <div class="fld full" id="cnInjRow"><label>注入位置 <span class="muted" style="font-weight:400">（按类型自动推导 · 只读）</span></label><input type="text" id="cnInjPreview" readonly>
        <div class="help">网关注入上游请求的方式由<b>类型</b>决定：Basic → <b>Authorization: Basic</b>；API-Key → <b>所选载体 + 字段名</b>；OAuth2 Client → <b>Authorization: Bearer</b>。</div></div>
      <div class="fld" id="cnUserWrap" style="display:none"><label>用户名 <span class="req">*</span></label><input type="text" id="cnUser" placeholder="如：svc-report"></div>
      <div class="fld" id="cnPassWrap" style="display:none"><label>口令 <span class="req">*</span></label><input type="password" id="cnPass" placeholder="贴入口令；提交后不可回读"></div>
      <div class="fld" id="cnKeyWrap" style="display:none"><label>密钥值 <span class="req">*</span></label><input type="password" id="cnKey" placeholder="贴入 API-Key；提交后不可回读"></div>
      <div class="fld" id="cnCarrierWrap" style="display:none"><label>注入载体</label><select id="cnCarrier"><option value="header">请求头 Header</option><option value="query">查询参数 Query</option><option value="cookie">Cookie</option></select></div>
      <div class="fld" id="cnFieldWrap" style="display:none"><label>字段名 <span class="req">*</span></label><input type="text" id="cnField" placeholder="如：X-API-Key"></div>
      <div class="fld" id="cnPrefixWrap" style="display:none"><label>值前缀 <span class="muted" style="font-weight:400">（选填）</span></label><select id="cnPrefix"><option value="">无</option><option value="Bearer ">Bearer </option><option value="ApiKey ">ApiKey </option></select></div>
      <div class="fld" id="cnOauthIdWrap" style="display:none"><label>客户端标识 client_id <span class="req">*</span></label><input type="text" id="cnOauthId" placeholder="如：aml-gw-client"></div>
      <div class="fld" id="cnOauthSecretWrap" style="display:none"><label>客户端密钥 client_secret <span class="req">*</span></label><input type="password" id="cnOauthSecret" placeholder="贴入密钥；提交后不可回读"></div>
      <div class="fld full" id="cnOauthWrap" style="display:none"><label>令牌端点 token_endpoint <span class="req">*</span></label><input type="text" id="cnOauthEp" placeholder="如：https://gw.example.com/oauth2/token">
        <div class="help">网关在本端点以 <b>POST application/x-www-form-urlencoded</b> 发起换取，响应取 <b>access_token</b>；必须 HTTPS（F6.2 规则 6）。</div></div>
      <div class="fld" id="cnOauthModeWrap" style="display:none"><label>授权模式 grant_type</label><select id="cnOauthMode"><option value="client_credentials">客户端凭据 client_credentials（一期承载）</option><option value="password">账号密码 password（二期 F2.x · 需资源拥有者账号）</option><option value="mtls">客户端证书换 token（二期 · 用 mTLS 客户端证书）</option></select></div>
      <div class="fld" id="cnOauthAuthWrap" style="display:none"><label>客户端认证方式 token_endpoint_auth_method</label><select id="cnOauthAuth"><option value="client_secret_basic">client_secret_basic（Basic 头 · 推荐）</option><option value="client_secret_post">client_secret_post（密钥放 body）</option></select></div>
      <div class="fld" id="cnOauthScopeWrap" style="display:none"><label>scope <span class="muted" style="font-weight:400">（选填）</span></label><input type="text" id="cnOauthScope" placeholder="如：aml.report"></div>
      <div class="fld" id="cnOauthAudWrap" style="display:none"><label>audience / resource <span class="muted" style="font-weight:400">（选填）</span></label><input type="text" id="cnOauthAud" placeholder="如：https://aml.example.com"></div>
      <div class="note" style="margin:0">凭据值按<b>类型</b>分别录入（Basic：用户名 + 口令；API-Key：密钥值；OAuth2：client_id + client_secret）；录入即加密托管并脱敏，界面不再显示明文，变更请用「轮换」。</div>
      <div class="fld full"><label>适用上游 <span class="muted">（选填，仅作检索备注）</span></label><input type="text" id="cnUp" placeholder="如：监管报送接口">
        <div class="help">仅用于检索。<b>此处不产生引用</b>——该凭据被哪个资产使用，在资产「代理与上游 → 上游认证与凭据处理」中配置。</div></div>
    </div>`,"lg");
  /* 类型联动：按类型显隐字段，并推导只读「注入位置」预览。
     Basic → 用户名 + 口令；API-Key → 密钥值 + 载体 + 字段名 + 值前缀；OAuth2 Client → 凭据本体 + 换取配置。 */
  const cnTypeEl=document.getElementById("cnType");
  const WRAP={ "Basic":["cnUserWrap","cnPassWrap"], "API-Key":["cnKeyWrap","cnCarrierWrap","cnFieldWrap","cnPrefixWrap"],
    "OAuth2 Client":["cnOauthIdWrap","cnOauthSecretWrap","cnOauthWrap","cnOauthModeWrap","cnOauthAuthWrap","cnOauthScopeWrap","cnOauthAudWrap"] };
  const ALLW=["cnUserWrap","cnPassWrap","cnKeyWrap","cnCarrierWrap","cnFieldWrap","cnPrefixWrap","cnOauthIdWrap","cnOauthSecretWrap","cnOauthWrap","cnOauthModeWrap","cnOauthAuthWrap","cnOauthScopeWrap","cnOauthAudWrap"];
  const CARN={header:"请求头",query:"查询参数",cookie:"Cookie"};
  const injText=()=>{ const t=cnTypeEl.value;
    if(t==="Basic") return "Authorization: Basic";
    if(t==="OAuth2 Client") return "Authorization: Bearer（平台代取 token）";
    const c=(document.getElementById("cnCarrier")||{}).value||"header";
    const f=((document.getElementById("cnField")||{}).value||"").trim()||"（字段名）";
    return f+"（"+(CARN[c]||"请求头")+"）"; };
  const syncByType=()=>{ const on=WRAP[cnTypeEl.value]||[];
    ALLW.forEach(id=>{ const e=document.getElementById(id); if(e) e.style.display=on.indexOf(id)>=0?"":"none"; });
    const pv=document.getElementById("cnInjPreview"); if(pv) pv.value=injText(); };
  cnTypeEl.addEventListener("change",syncByType);
  ["cnField","cnCarrier"].forEach(id=>{ const e=document.getElementById(id); if(e){ e.addEventListener(id==="cnCarrier"?"change":"input",()=>{ const pv=document.getElementById("cnInjPreview"); if(pv) pv.value=injText(); }); } });
  syncByType();
  document.getElementById("dlg1Ok").onclick=()=>{
    const name=(document.getElementById("cnName").value||"").trim();
    const type=document.getElementById("cnType").value;
    /* 注入位置由类型推导（不再手填）；各类型凭据本体分别采集。
       ⚠ 口令 / 密钥 / client_secret 只做校验、不落库（明文不可回读）。 */
    const isOAuth=(type==="OAuth2 Client"), isBasic=(type==="Basic"), isKey=(type==="API-Key");
    const user=isBasic?((document.getElementById("cnUser").value||"").trim()):"";
    const pass=isBasic?(document.getElementById("cnPass").value||""):"";
    const apikey=isKey?(document.getElementById("cnKey").value||""):"";
    const carrier=isKey?document.getElementById("cnCarrier").value:"header";
    const field=isKey?((document.getElementById("cnField").value||"").trim()):"";
    const prefix=isKey?document.getElementById("cnPrefix").value:"";
    const CARN={header:"请求头",query:"查询参数",cookie:"Cookie"};
    const where=isBasic?"Authorization: Basic":isOAuth?"Authorization: Bearer（平台代取 token）":(field+"（"+(CARN[carrier]||"请求头")+"）");
    const inj=isKey?{ carrier:carrier, field:field, prefix:prefix }:(isBasic?{ carrier:"header", field:"Authorization", prefix:"Basic " }:null);
    const up=(document.getElementById("cnUp").value||"").trim();
    /* OAuth2 Client 的「凭据本体 + 换取配置」；其余类型为 null，不落库。 */
    const clientId=isOAuth?((document.getElementById("cnOauthId").value||"").trim()):"";
    const clientSecret=isOAuth?(document.getElementById("cnOauthSecret").value||""):"";
    const oauth=isOAuth?{ endpoint:(document.getElementById("cnOauthEp").value||"").trim(), mode:document.getElementById("cnOauthMode").value, authMethod:document.getElementById("cnOauthAuth").value, scope:(document.getElementById("cnOauthScope").value||"").trim(), audience:(document.getElementById("cnOauthAud").value||"").trim() }:null;
    if(!name){ markBad("cnName",true); toast("凭据名称为必填"); return; }
    /* 重名保护与 CA 区一致：同名凭据会让「引用资产 / 适用上游」检索与审计口径含糊。 */
    if(CRED_LIST.some(x=>x.name===name)){ markBad("cnName",true); toast("同名凭据已存在："+name); return; }
    if(isBasic){ if(!user||!pass.trim()){ markBad("cnUser",!user); markBad("cnPass",!pass.trim()); toast("Basic：用户名与口令均为必填"); return; } }
    else if(isKey){ if(!apikey.trim()){ markBad("cnKey",true); toast("API-Key：密钥值为必填"); return; } if(!field){ markBad("cnField",true); toast("API-Key：字段名为必填（如 X-API-Key）"); return; } }
    else if(isOAuth){
      if(!clientId||!clientSecret){ markBad("cnOauthId",!clientId); markBad("cnOauthSecret",!clientSecret); toast("OAuth2 Client：客户端标识 client_id 与客户端密钥 client_secret 为必填"); return; }
      if(!oauth.endpoint){ markBad("cnOauthEp",true); toast("OAuth2 Client 为换取式：令牌端点必填——网关用它换取短时 access token 后再注入"); return; }
      /* 帮助语已写「必须 HTTPS（F6.2 规则 6）」，此前无任何校验 ⇒ 填 http:// 也能入库。 */
      if(!/^https:\/\//i.test(oauth.endpoint)){ markBad("cnOauthEp",true); toast("令牌端点必须为 HTTPS（F6.2 规则 6）："+oauth.endpoint); return; }
    }
    /* ⚠ 库侧不建立引用：「适用上游」只作检索备注（up），不得写入 assets（引用资产）。
       「哪个资产用哪条凭据」在资产「代理与上游 → 上游认证与凭据处理」侧配置。 */
    CRED_LIST.push({ id:"cred-"+Date.now().toString(36), name, type, where, up: up, user: user, inj: inj, oauth: oauth, clientId: clientId, assets: [], rot: nowD(), st:"启用" });
    closeDlg(); toast("已新建凭据「"+name+"」：明文加密托管、不可回读，2 秒内全节点生效（演示）"); renderCred(); credTab("c1");
  };
}
function credRotate(id){
  const c=credById(id); if(!c) return;
  openDlg("轮换凭据 · "+c.name,"凭据变更一律以「轮换（替换）」完成，界面不提供查看明文。",`
    <div class="rmode" id="rotMode">
      <label class="on"><input type="radio" name="rotm" value="dual" checked>双值过渡（推荐）</label>
      <label><input type="radio" name="rotm" value="now">立即失效</label>
    </div>
    <div class="fld"><label>新凭据值 <span class="req">*</span></label><input type="password" id="rotVal" placeholder="贴入新值；提交后不可回读"></div>
    <div class="fld" id="rotDaysWrap"><label>旧值保留天数</label><input type="number" min="1" max="30" id="rotDays" value="7" style="width:110px">
      <div class="help">过渡期内新旧值同时被接受，供上游平滑切换；到期旧值自动失效（演示）。</div></div>`,"lg");
  document.getElementById("rotMode").querySelectorAll("label").forEach(l=>l.addEventListener("click",()=>{
    document.getElementById("rotMode").querySelectorAll("label").forEach(x=>x.classList.remove("on"));
    l.classList.add("on"); l.querySelector("input").checked=true;
    document.getElementById("rotDaysWrap").style.display = l.querySelector("input").value==="dual" ? "" : "none";
  }));
  document.getElementById("dlg1Ok").onclick=()=>{
    const v=document.getElementById("rotVal").value||"";
    if(!v.trim()){ markBad("rotVal", true); toast("请输入新凭据值"); return; }
    const dual=!!document.querySelector('#rotMode input[value="dual"]').checked;
    const daysRaw=(document.getElementById("rotDays").value||"").trim();
    if(dual && !/^(?:[1-9]|[12]\d|30)$/.test(daysRaw)){ markBad("rotDays", true); toast("旧值保留天数须为 1~30 的整数"); return; }
    const days=daysRaw;
    c.rot=nowD(); c.rotMode=dual?"dual":"now"; if(dual) c.rotKeepDays=Number(days); closeDlg();
    toast("凭据「"+c.name+"」已轮换："+(dual?("双值过渡（旧值保留 "+days+" 天）"):"立即失效")+"，变更入审计（演示）");
    renderCred(); credTab("c1");
  };
}
function credToggle(id){
  const c=credById(id); if(!c) return;
  if(c.st!=="启用"){ c.st="启用"; toast("凭据「"+c.name+"」已启用（演示）"); renderCred(); credTab("c1"); return; }
  confirmDlg("停用凭据 · "+c.name,
    (refsOf("cred", c.id).length? `<div class="note warn">该凭据正被 <b>${esc(refsOf("cred", c.id).join("、"))}</b> 引用：停用后其上游注入失败，请求按 F6.2 规则 13 返回 <b>502</b>，须先替换或解除引用。</div>` : "")
    +`<div class="note">停用不等于删除：凭据保留在库中，可随时重新启用。停用动作<b>入审计</b>。</div>`,
    ()=>{ c.st="停用"; toast("凭据「"+c.name+"」已停用（变更入审计，演示）"); renderCred(); credTab("c1"); },"确认停用");
}
function credDel(id){
  const c=credById(id); if(!c) return;
  if(refsOf("cred", c.id).length){ openDlg("无法删除 · "+c.name,`该凭据被 <b>${esc(refsOf("cred", c.id).join("、"))}</b> 引用，受删除保护。`,`
    <div class="note">请先在资产「代理与上游 → 上游认证与凭据处理」中<b>解除引用</b>（改用其它凭据或切到「不注入」），再回到本页删除。</div>`); return; }
  confirmDlg("删除凭据 · "+c.name,`<div class="note red">删除后不可恢复；库中记录与历史引用一并清理，动作<b>入审计</b>。</div>`,
    ()=>{ const i=CRED_LIST.indexOf(c); if(i>=0) CRED_LIST.splice(i,1); toast("凭据「"+c.name+"」已删除（入审计，演示）"); renderCred(); credTab("c1"); },"确认删除");
}
/* 反向引用清单：三个分区（凭据 / 信任锚 / mTLS 客户端证书）共用同一套「只读弹窗」构造器，
   只在「摘要字段」与「挂载路径」上不同。kind: "cred" | "ca" | "mtls" 决定标题量词与路径。
   ⚠ 只读视图：底部只留一个「关闭」，不提供「取消 / 确定」这对无意义动作。 */
function refMount(kind){
  return kind==="ca" ? "上游 TLS 校验 → 自定义信任锚（根 CA）"
       : kind==="mtls" ? "上游 TLS 校验 → 客户端证书（mTLS）"
       : "上游认证与凭据处理 → 托管凭据";
}
function refNoun(kind){ return kind==="ca"?"信任锚":kind==="mtls"?"客户端证书":"凭据"; }
function openRefDlg(kind, obj, meta){
  const refs=refsOf(kind, obj.id); const cnt=refs.length, mount=refMount(kind);
  const body=cnt? `${meta}
    <div class="sec-t">引用资产</div>
    <div class="dlg-scroll"><div class="ref-list">
      ${refs.map(a=>`<div class="ref-item">
        <div class="ri-main"><div class="ri-name">${esc(a)}</div><div class="ri-path">代理与上游 → ${mount}</div></div>
        <button class="btn sm" onclick="refGo(this)" data-an="${esc(a)}">打开资产</button>
      </div>`).join("")}
    </div></div>
    <div class="note blue">本清单为<b>反向引用</b>只读视图；解除引用需在对应资产的「代理与上游 → ${mount}」中操作。查看动作<b>入审计</b>。</div>`
  : `${meta}
    <div class="ref-empty"><div class="big">未被任何资产引用</div>该${refNoun(kind)}当前未挂载到任何资产，可安全删除。</div>
    <div class="note">本清单为<b>反向引用</b>只读视图。查看动作<b>入审计</b>。</div>`;
  openDlg("引用清单 · "+obj.name, cnt? `${cnt} 个资产引用了该${refNoun(kind)}。` : `${refNoun(kind)}未被任何资产引用。`, body, "lg");
  /* 只读清单：底部只留一个「关闭」，避免「取消 / 确定」这对无意义动作占位。 */
  const noB=document.getElementById("dlg1No"); if(noB) noB.style.display="none";
  const okB=document.getElementById("dlg1Ok"); if(okB) okB.textContent="关闭";
}
function credRefs(id){
  const c=credById(id); if(!c) return;
  /* 凭据摘要：先讲清「这条凭据是什么」（引用关系的上下文），再列引用方。 */
  const meta=`<div class="ref-meta">
    <div class="rm"><span class="k">类型</span><span class="v">${esc(c.type)}${c.oauth?` <span class="ref-badge">换取式 · ${esc(c.oauth.mode||"client_credentials")}</span>`:""}</span></div>
    <div class="rm"><span class="k">注入位置</span><span class="v">${esc(c.where)}</span></div>
    ${c.oauth&&c.oauth.endpoint?`<div class="rm"><span class="k">令牌端点</span><span class="v">${esc(c.oauth.endpoint)}</span></div>`:""}
    ${c.clientId?`<div class="rm"><span class="k">客户端标识</span><span class="v">${esc(c.clientId)}</span></div>`:""}
    <div class="rm"><span class="k">状态</span><span class="v">${stTag(c.st)}</span></div>
  </div>`;
  openRefDlg("cred", c, meta);
}
function caRefs(id){
  const c=caById(id); if(!c) return;
  const meta=`<div class="ref-meta">
    <div class="rm"><span class="k">类型</span><span class="v">${esc(c.type)}</span></div>
    <div class="rm"><span class="k">标识</span><span class="v">${esc(c.code)}</span></div>
    <div class="rm"><span class="k">主体（Subject）</span><span class="v">${esc(c.subj)}</span></div>
    <div class="rm"><span class="k">有效期至</span><span class="v">${esc(c.exp)}</span></div>
    <div class="rm"><span class="k">状态</span><span class="v">${stTag(c.st)}</span></div>
  </div>`;
  openRefDlg("ca", c, meta);
}
function mtlsRefs(id){
  const c=mtlsById(id); if(!c) return;
  const meta=`<div class="ref-meta">
    <div class="rm"><span class="k">主体（Subject）</span><span class="v">${esc(c.subj)}</span></div>
    <div class="rm"><span class="k">颁发者</span><span class="v">${esc(c.issuer)}</span></div>
    <div class="rm"><span class="k">有效期至</span><span class="v">${esc(c.exp)}</span></div>
    <div class="rm"><span class="k">最近轮换</span><span class="v">${esc(c.rot)}</span></div>
    <div class="rm"><span class="k">状态</span><span class="v">${stTag(c.st)}</span></div>
  </div>`;
  openRefDlg("mtls", c, meta);
}
function refGo(btn){
  const an=(btn&&btn.getAttribute("data-an"))||"";
  const a=ASSETS.find(x=>x.name===an);
  closeDlg();
  /* 跨页跳转统一走 goPage（先落盘演示数据再改地址栏），与全站其它入口同口径。 */
  if(a){ goPage("pg-detail", { aid: a.id }); }
  else { toast("演示：未找到资产「"+an+"」，暂不跳转"); }
}

/* —— CA 管理（信任锚） —— */
function caRows(){
  const host=document.getElementById("pg-cred"); if(!host) return;
  const tb=host.querySelector("#caTbl tbody"); if(!tb) return;
  tb.innerHTML = CA_LIST.length ? CA_LIST.map(c=>`<tr>
    <td><b>${esc(c.name)}</b><div class="muted">${esc(c.code)}</div></td>
    <td>${esc(c.type)}</td>
    <td class="muted">${esc(c.subj)}</td>
    <td class="col-dt">${esc(c.exp)}</td>
    <td class="muted" title="SHA-256 指纹（演示截断）">${esc(c.fp)}</td>
    <td>${refCell(refsOf("ca", c.id), c.id, "ca")}</td>
    <td>${stTag(c.st)}</td>
    <td class="cell-op"><span class="opgrp">
      <button class="btn sm" onclick="caView('${c.id}')">查看</button>
      <button class="btn sm" onclick="caEdit('${c.id}')">编辑</button>
      <button class="btn sm" onclick="caRotate('${c.id}')">轮换</button>
      <button class="btn sm danger" onclick="caDel('${c.id}')">吊销</button>
    </span></td></tr>`).join("") :
    `<tr><td colspan="8"><div class="empty"><div class="big">尚未上传信任锚</div>上传内网私有 PKI / 自签证书后，供上游 TLS 引用</div></td></tr>`;
}
const caById = id => CA_LIST.find(c=>c.id===id);
function caEdit(id){
  const c=caById(id); if(!c) return;
  openDlg("编辑信任锚 · "+c.name, "仅可修改<b>名称 / 类型</b>；证书内容变更请用「轮换」。", `
    <div class="form-grid">
      <div class="fld"><label>名称 <span class="req">*</span></label><input type="text" id="ceName" value="${esc(c.name)}"></div>
      <div class="fld"><label>类型</label><select id="ceType">${["根 CA","中间 CA","自签叶证书"].map(v=>`<option ${c.type===v?"selected":""}>${v}</option>`).join("")}</select></div>
      <div class="fld"><label>标识</label><input type="text" value="${esc(c.code)}" readonly></div>
      <div class="fld"><label>有效期至</label><input type="text" value="${esc(c.exp)}" readonly></div>
      <div class="fld full"><label>主体（Subject）</label><input type="text" value="${esc(c.subj)}" readonly></div>
      <div class="fld full"><label>指纹（SHA-256）</label><input type="text" value="${esc(c.fp)}" readonly></div>
    </div>
    <div class="note">此处仅托管<b>公钥证书</b>；证书内容（PEM）变更走「轮换」，私钥不在此库（mTLS 客户端证书的私钥在「mTLS 客户端证书」分区托管）。</div>`, "lg");
  document.getElementById("dlg1Ok").onclick=()=>{
    const name=(document.getElementById("ceName").value||"").trim();
    if(!name){ markBad("ceName",true); toast("名称为必填"); return; }
    if(CA_LIST.some(x=>x!==c && x.name===name)){ markBad("ceName",true); toast("同名信任锚已存在："+name); return; }
    c.name=name; c.type=document.getElementById("ceType").value;
    closeDlg(); toast("信任锚「"+name+"」已更新（仅名称 / 类型；证书内容变更请用「轮换」，变更入审计）（演示）"); renderCred(); credTab("c2");
  };
}

function caUp(){
  openDlg("上传信任锚","内网私有 PKI / 自签证书在此登记；仅托管公钥证书，不含私钥。",`
    <div class="form-grid">
      <div class="fld"><label>名称 <span class="req">*</span></label><input type="text" id="caName" placeholder="如：数据报送域根 CA"></div>
      <div class="fld"><label>类型 <span class="req">*</span></label><select id="caType"><option>根 CA</option><option>中间 CA</option><option>自签叶证书</option></select></div>
      <div class="fld full"><label>证书内容 <span class="req">*</span></label><textarea id="caPem" rows="5" placeholder="-----BEGIN CERTIFICATE-----&#10;…&#10;-----END CERTIFICATE-----" style="${taStyle}"></textarea>
        <div class="help">粘贴 PEM，或上传 .pem / .crt / .cer 文件；入库时解析主体、有效期与 SHA-256 指纹。</div></div>
      <div class="fld full"><label>上传文件 <span class="muted">（可选）</span></label><input type="file" id="caFile" accept=".pem,.crt,.cer"></div>
    </div>`,"lg");
  const f=document.getElementById("caFile");
  if(f) f.addEventListener("change",()=>{ if(f.files&&f.files[0]) toast("已选择文件："+f.files[0].name+"（演示不解析）"); });
  document.getElementById("dlg1Ok").onclick=()=>{
    const name=(document.getElementById("caName").value||"").trim();
    const type=document.getElementById("caType").value;
    const pem=(document.getElementById("caPem").value||"").trim();
    if(!name||!pem){ markBad("caName",!name); markBad("caPem",!pem); toast("名称与证书内容为必填"); return; }
    if(CA_LIST.some(c=>c.name===name)){ markBad("caName",true); toast("同名信任锚已存在："+name); return; }
    CA_LIST.push({ id:"ca-"+Date.now().toString(36), name, code:"（上传）", type, subj:"（已解析主体）", exp: addDays(nowD(), 365), fp:"（已解析指纹）", assets:[], st:"有效" });
    closeDlg(); toast("已上传信任锚「"+name+"」：解析主体 / 有效期 / 指纹后入库，变更入审计（演示）"); renderCred(); credTab("c2");
  };
}
function caView(id){
  const c=caById(id); if(!c) return;
  openDlg("信任锚 · "+c.name,"",`
    <div class="kv"><span class="k">标识</span><div>${esc(c.code)}</div></div>
    <div class="kv"><span class="k">类型</span><div>${esc(c.type)}</div></div>
    <div class="kv"><span class="k">主体（Subject）</span><div>${esc(c.subj)}</div></div>
    <div class="kv"><span class="k">有效期至</span><div>${esc(c.exp)}${c.st==="即将过期"?` <span class="tag t-warn">即将过期</span>`:""}</div></div>
    <div class="kv"><span class="k">指纹（SHA-256）</span><div class="muted">${esc(c.fp)}</div></div>
    <div class="kv"><span class="k">引用资产</span><div>${refCell(refsOf("ca", c.id))}</div></div>
    ${c.transDays?`<div class="kv"><span class="k">双值过渡</span><div>上次轮换设过渡期 ${esc(String(c.transDays))} 天（到期停用旧锚）</div></div>`:""}
    <div class="note">此处仅托管<b>公钥证书</b>；私钥不在此库——mTLS 客户端证书的私钥在「mTLS 客户端证书」分区中托管，私钥不出平台。</div>`,"lg");
}
function caRotate(id){
  const c=caById(id); if(!c) return;
  openDlg("轮换信任锚 · "+c.name,"为避免上游切换 CA 时断链，新旧信任锚并存过渡。",`
    <div class="fld"><label>新证书内容 <span class="req">*</span></label><textarea id="crPem" rows="4" placeholder="-----BEGIN CERTIFICATE-----…" style="${taStyle}"></textarea></div>
    <div class="fld"><label>过渡期</label><select id="crDays"><option value="7">7 天</option><option value="15">15 天</option><option value="30">30 天</option></select>
      <div class="help">过渡期内新旧锚同时可信；过渡结束由管理员停用旧锚（演示按所选天数自动停用旧锚）。</div></div>
    <div class="note">轮换<b>入审计</b>；被引用的信任锚在过渡期内不影响在线资产。</div>`,"lg");
  document.getElementById("dlg1Ok").onclick=()=>{
    const v=(document.getElementById("crPem").value||"").trim();
    if(!v){ markBad("crPem", true); toast("请粘贴新证书内容"); return; }
    const d=document.getElementById("crDays").value;
    c.exp=addDays(nowD(), 365); c.st="有效"; c.transDays=Number(d); closeDlg();
    toast("信任锚「"+c.name+"」已轮换：新旧并存过渡 "+d+" 天，到期停用旧锚（入审计，演示）");
    renderCred(); credTab("c2");
  };
}
function caDel(id){
  const c=caById(id); if(!c) return;
  if(refsOf("ca", c.id).length){ openDlg("无法吊销 · "+c.name,`该信任锚被 <b>${esc(refsOf("ca", c.id).join("、"))}</b> 引用，受引用保护。`,`
    <div class="note">请先在资产「代理与上游 → 上游 TLS 校验 → 自定义信任锚」中改用其它锚或改回「平台 CA 校验」，再回到本页吊销。</div>`); return; }
  confirmDlg("吊销信任锚 · "+c.name,`<div class="note red">吊销后引用该锚的上游链路将失去信任来源；该锚当前未被引用，可安全吊销。动作<b>入审计</b>。</div>`,
    ()=>{ const i=CA_LIST.indexOf(c); if(i>=0) CA_LIST.splice(i,1); toast("信任锚「"+c.name+"」已吊销（入审计，演示）"); renderCred(); credTab("c2"); },"确认吊销");
}

/* —— mTLS 客户端证书 —— */
function mtlsRows(){
  const host=document.getElementById("pg-cred"); if(!host) return;
  const tb=host.querySelector("#mtlsTbl tbody"); if(!tb) return;
  tb.innerHTML = MTLS_LIST.length ? MTLS_LIST.map(c=>`<tr>
    <td><b>${esc(c.name)}</b><div class="muted">${esc(c.id)}${c.keyEnc?" · 口令加密":" · 明文托管"}</div></td>
    <td class="muted">${esc(c.subj)}</td>
    <td class="muted">${esc(c.issuer)}</td>
    <td class="col-dt">${esc(c.exp)}</td>
    <td class="muted" title="SHA-256 指纹（演示截断）">${esc(c.fp)}</td>
    <td>${refCell(refsOf("mtls", c.id), c.id, "mtls")}</td>
    <td>${stTag(c.st)}</td>
    <td class="cell-op"><span class="opgrp">
      <button class="btn sm" onclick="mtlsView('${c.id}')">查看</button>
      <button class="btn sm" onclick="mtlsEdit('${c.id}')">编辑</button>
      <button class="btn sm" onclick="mtlsRotate('${c.id}')">轮换</button>
      <button class="btn sm danger" onclick="mtlsDel('${c.id}')">删除</button>
    </span></td></tr>`).join("") :
    `<tr><td colspan="8"><div class="empty"><div class="big">尚未上传客户端证书</div>上传证书与私钥后，供上游双向 TLS 握手引用</div></td></tr>`;
}
const mtlsById = id => MTLS_LIST.find(c=>c.id===id);
function mtlsEdit(id){
  const c=mtlsById(id); if(!c) return;
  openDlg("编辑客户端证书 · "+c.name, "仅可修改<b>名称 / 适用上游</b>；证书与私钥变更请用「轮换」。", `
    <div class="form-grid">
      <div class="fld"><label>名称 <span class="req">*</span></label><input type="text" id="ceName" value="${esc(c.name)}"></div>
      <div class="fld"><label>适用上游 <span class="muted">（选填，仅作检索备注）</span></label><input type="text" id="ceUp" value="${esc(c.up||"")}"></div>
      <div class="fld"><label>主体（Subject）</label><input type="text" value="${esc(c.subj)}" readonly></div>
      <div class="fld"><label>颁发者</label><input type="text" value="${esc(c.issuer)}" readonly></div>
      <div class="fld"><label>有效期至</label><input type="text" value="${esc(c.exp)}" readonly></div>
      <div class="fld"><label>指纹（SHA-256）</label><input type="text" value="${esc(c.fp)}" readonly></div>
    </div>
    <div class="note">证书与私钥由平台托管（私钥<b>不可回读</b>${c.keyEnc?" · 口令加密":" · 明文托管"}）；变更走「轮换」。资产侧在「代理与上游 → 客户端证书（mTLS）」引用。</div>`, "lg");
  document.getElementById("dlg1Ok").onclick=()=>{
    const name=(document.getElementById("ceName").value||"").trim();
    if(!name){ markBad("ceName",true); toast("名称为必填"); return; }
    if(MTLS_LIST.some(x=>x!==c && x.name===name)){ markBad("ceName",true); toast("同名客户端证书已存在："+name); return; }
    c.name=name; c.up=(document.getElementById("ceUp").value||"").trim();
    closeDlg(); toast("客户端证书「"+name+"」已更新（仅名称 / 适用上游；证书与私钥变更请用「轮换」，变更入审计）（演示）"); renderCred(); credTab("c3");
  };
}

function mtlsUp(){
  openDlg("上传 mTLS 客户端证书","证书与私钥由平台托管；私钥不出平台、不可导出、不可回读。",`
    <div class="form-grid">
      <div class="fld"><label>名称 <span class="req">*</span></label><input type="text" id="muName" placeholder="如：手机银行对账"></div>
      <div class="fld"><label>适用上游 <span class="muted">（选填，仅作检索备注）</span></label><input type="text" id="muUp" placeholder="如：手机银行后台">
        <div class="help">仅用于检索。<b>此处不产生引用</b>——该证书被哪个资产使用，在资产「代理与上游 → 客户端证书（mTLS）」中配置。</div></div>
      <div class="fld full"><label>客户端证书（PEM） <span class="req">*</span></label><textarea id="muCert" rows="4" placeholder="-----BEGIN CERTIFICATE-----…" style="${taStyle}"></textarea></div>
      <div class="fld full"><label>私钥（PEM） <span class="req">*</span></label><textarea id="muKey" rows="4" placeholder="-----BEGIN PRIVATE KEY-----…" style="${taStyle}"></textarea>
        <div class="help">私钥仅用于平台侧托管，<b>不落浏览器、不可回读、不可导出</b>。</div></div>
      <div class="fld full" id="muPassWrap"><label>私钥口令 <span class="muted">（选填，仅加密私钥需要）</span></label><input type="password" id="muPass" placeholder="私钥已加密时填写；明文私钥留空">
        <div class="help">口令仅用于平台侧解密私钥，<b>不落浏览器、不可回读</b>；与私钥同源托管。</div></div>
    </div>`,"lg");
  document.getElementById("dlg1Ok").onclick=()=>{
    const name=(document.getElementById("muName").value||"").trim();
    const cert=(document.getElementById("muCert").value||"").trim();
    const key=(document.getElementById("muKey").value||"").trim();
    const up=(document.getElementById("muUp").value||"").trim();
    const keyPass=((document.getElementById("muPass")||{}).value||"");
    if(!name||!cert||!key){ markBad("muName",!name); markBad("muCert",!cert); markBad("muKey",!key); toast("名称、客户端证书与私钥均为必填"); return; }
    if(MTLS_LIST.some(x=>x.name===name)){ markBad("muName",true); toast("同名客户端证书已存在："+name); return; }
    /* 私钥为加密格式却未给口令 ⇒ keyEnc 会记成「明文托管」，与实际不符（逻辑不一致）。 */
    if(/encrypted/i.test(key) && !(keyPass||"").trim()){ markBad("muKey", true); toast("私钥为加密格式（ENCRYPTED），请填写「私钥口令」"); return; }
    MTLS_LIST.push({ id:"mtls-"+Date.now().toString(36), name, subj:"（已解析主体）", issuer:"（已解析颁发者）", exp: addDays(nowD(), 365), fp:"（已解析指纹）", up: up, keyEnc: !!keyPass, assets: [], rot: nowD(), st:"有效" });
    closeDlg(); toast("已上传客户端证书「"+name+"」：私钥已托管且不出平台（"+(keyPass?"口令加密":"明文")+"），变更入审计（演示）"); renderCred(); credTab("c3");
  };
}
function mtlsView(id){
  const c=mtlsById(id); if(!c) return;
  openDlg("mTLS 客户端证书 · "+c.name,"",`
    <div class="kv"><span class="k">主体（Subject）</span><div>${esc(c.subj)}</div></div>
    <div class="kv"><span class="k">颁发者</span><div>${esc(c.issuer)}</div></div>
    <div class="kv"><span class="k">有效期至</span><div>${esc(c.exp)}${c.st==="即将过期"?` <span class="tag t-warn">即将过期</span>`:""}</div></div>
    <div class="kv"><span class="k">指纹（SHA-256）</span><div class="muted">${esc(c.fp)}</div></div>
    <div class="kv"><span class="k">最近轮换</span><div class="muted">${esc(c.rot)}</div></div>
    ${c.transDays?`<div class="kv"><span class="k">双值过渡</span><div>上次轮换设过渡期 ${esc(String(c.transDays))} 天（到期停用旧证书）</div></div>`:""}
    <div class="kv"><span class="k">引用资产</span><div>${refCell(refsOf("mtls", c.id))}</div></div>
    <div class="kv"><span class="k">私钥</span><div><span class="tag t-ok">已托管</span> <span class="muted">不可回读 · 不可导出 · 不出平台</span>${c.keyEnc?' <span class="tag t-info">口令加密</span>':' <span class="muted">明文托管</span>'}</div></div>
    <div class="note">网关在<b>握手阶段自动出示</b>本证书完成双向 TLS；资产侧在「代理与上游 → 客户端证书（mTLS）」引用。</div>`,"lg");
}
function mtlsRotate(id){
  const c=mtlsById(id); if(!c) return;
  openDlg("轮换 mTLS 客户端证书 · "+c.name,"为避免上游握手失败，新旧证书并存过渡。",`
    <div class="fld"><label>新客户端证书（PEM） <span class="req">*</span></label><textarea id="mrCert" rows="3" placeholder="-----BEGIN CERTIFICATE-----…" style="${taStyle}"></textarea></div>
    <div class="fld"><label>新私钥（PEM） <span class="req">*</span></label><textarea id="mrKey" rows="3" placeholder="-----BEGIN PRIVATE KEY-----…" style="${taStyle}"></textarea></div>
    <div class="fld" id="mrPassWrap"><label>新私钥口令 <span class="muted">（选填，仅加密私钥需要）</span></label><input type="password" id="mrPass" placeholder="新私钥已加密时填写；明文留空">
      <div class="help">口令仅用于平台侧解密私钥，<b>不落浏览器、不可回读</b>；与私钥同源托管。</div></div>
    <div class="fld"><label>过渡期</label><select id="mrDays"><option value="7">7 天</option><option value="15">15 天</option><option value="30">30 天</option></select>
      <div class="help">过渡期内网关按上游可接受的方式出示新旧证书，过渡结束停用旧证书（演示按所选天数停用）。</div></div>`,"lg");
  document.getElementById("dlg1Ok").onclick=()=>{
    const cert=(document.getElementById("mrCert").value||"").trim();
    const key=(document.getElementById("mrKey").value||"").trim();
    if(!cert||!key){ markBad("mrCert",!cert); markBad("mrKey",!key); toast("新客户端证书与私钥均为必填"); return; }
    const keyPass=((document.getElementById("mrPass")||{}).value||"");
    if(/encrypted/i.test(key) && !(keyPass||"").trim()){ markBad("mrKey", true); toast("私钥为加密格式（ENCRYPTED），请填写「新私钥口令」"); return; }
    const d=document.getElementById("mrDays").value;
    c.exp=addDays(nowD(), 365); c.st="有效"; c.rot=nowD(); c.transDays=Number(d); c.keyEnc=!!keyPass; closeDlg();
    toast("客户端证书「"+c.name+"」已轮换：新旧并存过渡 "+d+" 天，到期停用旧证书（入审计，演示）");
    renderCred(); credTab("c3");
  };
}
function mtlsDel(id){
  const c=mtlsById(id); if(!c) return;
  if(refsOf("mtls", c.id).length){ openDlg("无法删除 · "+c.name,`该客户端证书被 <b>${esc(refsOf("mtls", c.id).join("、"))}</b> 引用，受引用保护。`,
    `<div class="note">请先在资产「代理与上游 → 客户端证书（mTLS）」中改用其它证书或改为「不使用（单向 TLS）」，再回到本页删除。</div>`); return; }
  confirmDlg("删除 mTLS 客户端证书 · "+c.name,`<div class="note red">删除后证书与托管的私钥一并清理，动作<b>入审计</b>；请确认无上游仍依赖该证书。</div>`,
    ()=>{ const i=MTLS_LIST.indexOf(c); if(i>=0) MTLS_LIST.splice(i,1); toast("客户端证书「"+c.name+"」已删除（入审计，演示）"); renderCred(); credTab("c3"); },"确认删除");
}

/* 侧栏入口：宿主监听先执行（showPage + 面包屑），本监听随后渲染 */
$$("#side .mi").forEach(m=>{ if(m.dataset.pg==="pg-cred") m.addEventListener("click", ()=>renderCred()); });
/* 深链直达（?pg=pg-cred&tab=c2 / #cred）已改由文件末尾 bootstrap 统一处理 */

/* ==========================================================================
   安全策略 · Web 安全防护策略（三个子页）/ 规则库管理
   --------------------------------------------------------------------------
   承载：web-security-policy.html（pg-websec · Web 防护 WAF）
         rate-limit-policy.html（pg-rate   · 集群级限流）
         request-constraint.html（pg-reqcon · 请求约束）
         rule-library.html（pg-rulelib · 规则库管理，独立菜单项）
   导航口径（2026-09-21 · 用户指令）：**拆分为三个页面，但共用侧栏「Web 安全防护策略」
   这一个菜单入口，在页面顶部通过按钮切换** —— 与既有「资产访问控制策略」下
   fine-grained.html / access-requirement.html 的「一菜单多文件」先例同口径（见 wsSubNav）。
   需求依据：一期 PRD v1.60 §0.3 统一裁决顺序 / F4.1 规则 9 / F7.1 规则 1~10 / F7.3 规则 1~6；
             规则库治理语义取自二期 F1.6 / F1.7 与二期 F5.4（SM2 签名下发 / 版本号单调递增 / 回滚重签）。
   ⚠ 口径边界（务必保留）：
     · 「Web 防护」是**策略类型下拉值**，也是子页名；**侧栏菜单名 = Web 安全防护策略**（族名），两者是两个层面。
     · 术语表对「观察」有排他约束：观察档**只**用于 F7.1 WAF 检测模式（与健康检查被动观察）；
       越权处置不设观察档 —— 故「观察 / 阻断」开关**只出现在 Web 防护（WAF）子页**，不得进入限流 / 请求约束子页。
     · 匿名与 public 只免裁决链第 ⑤~⑧ 环，① ② ③ 照常执行（本族三页均属前段，故永不豁免）。
     · 规则库管理属**二期 M8 口径**（一期 PRD 无「规则库」章节；归档页规原口径为「特征库版本只读」），
       已按新增需求口径于 2026-09-21 追认；导入 / 签名校验 / 灰度 / 回滚归安全管理员。
   ★ 2026-09-22 第二十一轮：本页精简重构为「版本库列表 + 生效规则列表」（页内 TAB + 两表分页）；
     非必要说明尽去，操作链五步并进版本行、自定义覆盖并进规则行（详见 rlHtml 头注）。
   · 本模块为纯演示：不连后端，改动仅落 localStorage（各页各自一个 key，与演示数据 key 分离）。
   ========================================================================== */

/* ---------- 1. 常量与状态 ---------- */

/* 出厂默认（F4.1 规则 9）：WAF 模式按资产安全等级分档 */
var WS_MODE_BY_LV = { L1: "观察", L2: "观察", L3: "阻断", L4: "阻断", L5: "阻断" };
/* 检测面（F7.1 规则 1）：固定六项，无关闭入口 */
var WS_FACES = ["URL", "查询参数", "请求体", "Cookie", "Referer", "User-Agent"];
/* 方法白名单（F7.3 规则 4/5）：GET/HEAD/POST 默认允许且不可取消；PUT/PATCH/DELETE 须登记显式允许；OPTIONS 走浏览器安全；TRACE/CONNECT 永久禁止 */
var WS_METHODS_ALL   = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
var WS_METHODS_LOCK  = ["GET", "HEAD", "POST"];
var WS_METHODS_DENY  = ["TRACE", "CONNECT"];

var WS_KEY = "baize.assetmgmt.websec.v1";
var RL_KEY = "baize.assetmgmt.rulelib.v1";

/* 列表分页档位：5 行/页（当前 16 个资产 ⇒ 4 页，能看出分页与「只作用于本表」语义） */
var WS_LP = 5;
/* 条目级清单档位 8 条/页 —— 与资产详情页「细粒度资源清单」同口径（该页 PATH_PAGE=8）。
   条目清单是「按资产」的局部消费，8 条/页比 5 条/页少翻页，且两处口径一致便于对照。 */
var WS_EP = 8;
function wsLp(kind) { return kind === "e" ? WS_EP : WS_LP; }
/* 裁决顺序 10 环（页级说明共用） */
var WS_CHAIN = "① URI 规范化 / 方法 / 请求体约束 → ② WAF 与 Origin / 跳转校验、请求头清洗 → ③ 网关级 / 登录级 / 资产级全局限流 → ④ public 判定 → ⑤ 主体认证 → ⑥ 资产访问状态 → ⑦ 方法与路径授权 → ⑧ ABAC 属性策略 → ⑨ 行为策略 → ⑩ 上游认证注入与代理";

/* 当前操作人**姓名**（不含角色前缀）—— 复用页面基座的 opUser()（承 PRD 一期 AC-F3.4-7：
   「安全管理员 张伟」只记「张伟」；字段只读、不可手改），与既有「负责人」列同口径。
   ⚠ 本模块**不重写**取值逻辑：基座 opUser() 已改读专属节点 #topbarUser
     （避开顶栏「退出登录」按钮污染 .who 的 textContent 那个老坑）；基座缺失时兜底同基座 =「张伟」。 */
function wsOp() { return (typeof opUser === "function") ? opUser() : "张伟"; }

/* ★ 2026-09-22 第十五轮 · 跨页同源：页① 展示的「当前特征库版本」必须与**规则库管理页同源**。
   三个子页是三份独立文档（各自 JS 上下文），页① 上 `RL` 恒为 null ⇒ 旧写法
   `RL ? RL.current : "2026.09.1"` 实际退化为**写死常量**：规则库下发 / 回滚到新版本后，
   页① 仍显示旧版本（两页自相矛盾）。改为直接读**同一个 localStorage key**（RL_KEY）取 current，
   取不到（从未进过规则库页）再回退出厂 seed。 */
function wsFeatureVer() {
  try {
    var s = JSON.parse(localStorage.getItem(RL_KEY) || "null");
    if (s && typeof s === "object" && s.current) return String(s.current);
  } catch (e) { /* 演示环境：忽略 */ }
  return rlSeed().current;
}
/* ★ 2026-09-22 第十五轮 · 重渲染保留滚动位置：整页重渲染（改下拉 / 开关 / 保存等）本会把页面滚回顶部，
   长表（16 资产 / 10 规则 / 9 版本）尤其打断操作流。渲染前取、渲染后放回（页面不可滚动时 y=0，天然 no-op）。 */
function wsScrollTop() { try { var s = document.scrollingElement || document.documentElement; return s ? (s.scrollTop || 0) : 0; } catch (e) { return 0; } }
function wsScrollTo(y) { if (!y) return; try { var s = document.scrollingElement || document.documentElement; if (s) s.scrollTop = y; } catch (e) { /* 忽略 */ } }

function wsSeed() {
  return {
    modeOverride: {},                                    /* aid -> "观察" | "阻断" */
    listScope: "平台级",                                  /* 平台级 | 平台级+资产级（决定 IP 名单是否可挂到资产） */
    /* IP 黑白名单 = **清单列表**（[{v, ver, scope, note, at, op}]）。
       空态看不出「清单」形态，故预置少量演示条目；黑名单条数刻意 > 每页 5 行，
       让「默认分页」在名单上也能直接看到（评审口径：名单必须是可搜索、可分页的清单）。
       `op` = **操作人**（2026-09-21 新增列，用户反馈「黑白名单、自定义规则等增加操作人列」）：
       只记**姓名**、不含角色前缀、只读 —— 承 PRD 一期 AC-F3.4-7（「安全管理员 张伟」记「张伟」），
       与既有「负责人」列同口径；取值经 wsOp()（复用页面基座 opUser()）。 */
    black: [
      { v: "203.0.113.0/24",     ver: "IPv4", scope: "平台级", note: "境外扫描源段", at: "2026-09-12", op: "王芳" },
      { v: "198.51.100.23",      ver: "IPv4", scope: "平台级", note: "暴力破解来源", at: "2026-09-15", op: "张伟" },
      { v: "198.51.100.41",      ver: "IPv4", scope: "平台级", note: "同段可疑主机", at: "2026-09-15", op: "张伟" },
      { v: "203.0.113.77",       ver: "IPv4", scope: "平台级", note: "恶意爬虫出口", at: "2026-09-16", op: "李工" },
      { v: "192.0.2.180",        ver: "IPv4", scope: "平台级", note: "漏洞扫描器", at: "2026-09-17", op: "王芳" },
      { v: "2001:db8:bad::/48",  ver: "IPv6", scope: "平台级", note: "已知恶意出口段（IPv6）", at: "2026-09-18", op: "李工" }
    ],
    white: [
      { v: "10.20.30.0/24",      ver: "IPv4", scope: "平台级", note: "内部扫描器出口", at: "2026-09-10", op: "张伟" },
      { v: "192.0.2.77",         ver: "IPv4", scope: "平台级", note: "合作方专线", at: "2026-09-19", op: "李工" },
      { v: "2001:db8:600d::/48", ver: "IPv6", scope: "平台级", note: "总部出口（IPv6）", at: "2026-09-19", op: "张伟" }
    ],
    baseline: { sqli: true, xss: true, scanner: true },
    /* 自定义 PCRE 规则 = [{name, scope, re, op}]。
       同样**预置演示条目**：空态既看不出表格形态、也看不出新增的「操作人」列。
       三条分别示意「头名 / 路径 / 请求体」三种作用域（作用域取值域见新建弹窗的 select）；
       `op` 口径同上（**姓名、只读**）。正则均通过 wsPcreCheck（无嵌套量词 ⇒ 无灾难性回溯风险）。 */
    pcre: [
      { name: "拦截特定 UA 注入", scope: "头名",   re: "(?i)union\\s+select", op: "张伟", on: true, at: "2026-09-12" },
      { name: "异常编码目录穿越", scope: "路径",   re: "(?i)%2e%2e%2f",       op: "王芳", on: true, at: "2026-09-14" },
      { name: "系统文件探测特征", scope: "请求体", re: "(?i)etc/passwd",       op: "李工", on: true, at: "2026-09-17" }
    ],
    /* 额度关系（断言 Q35 守）：**同一计数依据（来源 IP）下外层 ≥ 内层** ——
       网关 CC 数该来源 IP 的**全部请求**，登录 · 来源 IP 只数其中的**登录请求**；
       内层计数集合是外层的**子集**，外层若低于内层，内层阈值将**永远无法触发**（死配置）。
       2026-09-21 修正：网关 CC 原为 **1000**，与登录 · 来源 IP 的 **10000** 倒挂 ⇒ 抬到 **20000**
       （用户裁决「抬高网关 CC」；登录 · 来源 IP 保持 10000 不动）。 */
    rate: { loginAccount: 5, loginIp: 10000, gatewayCc: 20000, assetAnon: 60, assetAuthed: 60, windowSec: 60, action: "拒绝" },
    assetRate: {},                                       /* aid -> 覆盖值（已认证 · 用户 × 资产） */
    assetRateAnon: {},                                   /* aid -> 覆盖值（未认证 · IP × 资产） */
    entryCov: [],                                        /* {key, entry, v} */
    req: { bodyMax: 20, connMax: 1000, methods: ["GET", "HEAD", "POST"], download: false, downloadRate: 2048, downloadScope: "按资产" }
  };
}
function rlSeed() {
  return {
    current: "2026.09.1", entries: 1420, signed: true, publishedAt: "2026-09-15 10:20",
    schema: 2,                                           /* ★ 第十七轮：store schema 版本（迁移判据） */
    hit: { preset: 87, custom: 12 },
    stage: 5,                                            /* 操作链进度：0 无 1 导入 2 验签 3 灰度 4 发布 5 全量下发 */
    pending: "",
    autoRollback: 5,                                     /* 误报率阈值 % */
    versions: [
      { v: "2026.09.1", at: "2026-09-15 10:20", entries: 1420, state: "生效中", signed: true },
      { v: "2026.08.3", at: "2026-08-20 09:05", entries: 1388, state: "已归档", signed: true },
      { v: "2026.08.1", at: "2026-08-02 14:40", entries: 1350, state: "已归档", signed: true },
      { v: "2026.07.2", at: "2026-07-18 16:30", entries: 1312, state: "已归档", signed: true },
      { v: "2026.06.4", at: "2026-06-25 09:40", entries: 1284, state: "已归档", signed: true },
      { v: "2026.05.1", at: "2026-05-12 14:05", entries: 1240, state: "已归档", signed: true },
      { v: "2026.04.3", at: "2026-04-22 10:15", entries: 1198, state: "已归档", signed: true },
      { v: "2026.03.2", at: "2026-03-19 11:20", entries: 1160, state: "已归档", signed: true },
      { v: "2026.02.1", at: "2026-02-10 15:50", entries: 1124, state: "已归档", signed: true }
    ],
    /* 生效规则（库内规则条目）：pat = 匹配特征（库内预置 · 随库下发 · 只读）；loc = 检测位置；
       管理员只能改 disp（命中处置）或 on（启停）—— 即「自定义覆盖」（ov=true），库更新不覆盖。 */
    rules: [
      { id: "SQ-1001", name: "SQLi 联合查询注入", cat: "SQLi 基线", loc: "查询参数", pat: "(?i)union\\s+(all\\s+)?select", disp: "阻断", on: true, ov: false },
      { id: "SQ-1017", name: "SQLi 时间盲注", cat: "SQLi 基线", loc: "查询参数", pat: "(?i)(sleep\\(|benchmark\\(|pg_sleep\\()", disp: "阻断", on: true, ov: false },
      { id: "SQ-3121", name: "CVE-2026-3121 检测规则", cat: "SQLi 基线", loc: "请求体", pat: "(?i)'\\s*or\\s*'?\\d+'?\\s*=\\s*'?\\d+", disp: "阻断", def: "观察", on: true, ov: true },
      { id: "XSS-2103", name: "反射型 XSS（script 标签）", cat: "XSS 基线", loc: "查询参数", pat: "(?i)<\\s*script[^>]*>", disp: "阻断", on: true, ov: false },
      { id: "XSS-2111", name: "DOM 型 XSS 特征", cat: "XSS 基线", loc: "请求体", pat: "(?i)(document\\.(write|location)|innerHTML\\s*=)", disp: "观察", def: "阻断", on: true, ov: true },
      { id: "SC-3001", name: "扫描器 UA 特征", cat: "扫描器基线", loc: "User-Agent", pat: "(?i)(sqlmap|nikto|acunetix|masscan|nuclei)", disp: "阻断", on: true, ov: false },
      { id: "SC-3012", name: "扫描器告警抑制（/legacy/report）", cat: "扫描器基线", loc: "URL 路径", pat: "^/legacy/report", disp: "继承库设定", on: false, ov: true },
      { id: "SEM-4002", name: "参数污染语义特征", cat: "语义检测", loc: "查询参数", pat: "(?i)\\w+\\[\\]=\\w+&\\w+=", disp: "阻断", on: true, ov: false },
      { id: "SEM-4011", name: "SQLi 语义级检测（libinjection 指纹）", cat: "语义检测", loc: "查询参数", pat: "libinjection 语义指纹 · 引号闭合失衡", disp: "阻断", on: true, ov: false },
      { id: "SEM-4021", name: "XSS 语义级检测（HTML / JS 上下文）", cat: "语义检测", loc: "请求体", pat: "语义上下文 · HTML / JS 注入点识别", disp: "观察", on: true, ov: false }
    ]
    /* ⚠ 2026-09-22 裁决：③「客户端真实性判定特征集」/ ④「推理与基线规则」已**移出本库**（各自独立成库），
       故原属它们的示例规则（CLI-5001 浏览器挑战失败特征 / ML-6003 业务参数基线偏离）**同步移出**本库规则集。 */
  };
}

var WS = null, RL = null;
/* 列表筛选态：**瞬时 UI 状态，不落盘**（落盘会让「刷新后停在上一筛选」，也污染按默认态截图的审计脚本） */
var WSF = {};
/* 批量选择态：同为**瞬时 UI 状态**。刻意**不放进 WS** —— wsSaveStore 只序列化 WS，
   故选择天然不入 localStorage：刷新回到未选态，审计截图也不会被上一次勾选污染。
   与既有「筛选态 = 瞬时态」同口径。 */
var WSSEL = {};
var WS_DATE = wsNow().slice(0, 10);   /* ★ 2026-09-23 第十八轮：新增条目的「添加时间」取**真实日期**（旧实现写死 2026-09-21，留痕失真；与 wsNow() 同源）。wsNow 为函数声明，提升后此处可调用。 */

function wsLoad() {
  WS = wsSeed();
  try { var s = JSON.parse(localStorage.getItem(WS_KEY) || "null"); if (s && typeof s === "object") { for (var k in s) WS[k] = s[k]; } } catch (e) { /* 演示环境：忽略 */ }
  /* 兼容旧快照：补齐后加的字段 + 把「字符串数组」形态的 IP 名单升为对象列表（改 wsSeed 后必看） */
  var d = wsSeed();
  if (!WS.req || typeof WS.req !== "object") WS.req = d.req;
  else { for (var rk in d.req) { if (WS.req[rk] === undefined) WS.req[rk] = d.req[rk]; } }
  /* ★ 2026-09-23 第十七轮：rate / baseline / 覆盖字典 此前**无逐键补齐、无类型兜底**，与 req 的处理不对称。
     旧存档缺 rate 子键 ⇒ 页② 阈值表格渲染出 undefined；assetRate 为 null ⇒ Object.keys(null) 抛错 ⇒ **整页白屏**。
     此处按 req 同口径逐键补齐 + 对象兜底（真实旧存档不再失真）。 */
  if (!WS.rate || typeof WS.rate !== "object") WS.rate = d.rate;
  else { for (var rt in d.rate) { if (WS.rate[rt] === undefined) WS.rate[rt] = d.rate[rt]; } }
  if (!WS.baseline || typeof WS.baseline !== "object") WS.baseline = d.baseline;
  else { for (var bl in d.baseline) { if (WS.baseline[bl] === undefined) WS.baseline[bl] = d.baseline[bl]; } }
  ["modeOverride", "assetRate", "assetRateAnon"].forEach(function (dk2) {
    if (!WS[dk2] || typeof WS[dk2] !== "object") WS[dk2] = {};
  });
  if (!WS.listScope) WS.listScope = d.listScope;
  if (!Array.isArray(WS.pcre)) WS.pcre = [];
  /* ★ 2026-09-23 第十八轮：entryCov 元素须带 key（旧实现只判数组 ⇒ 缺 key 的幽灵项被计数、徽标虚高，
     而防护体检又报悬空 —— 两处口径打架）。 */
  if (!Array.isArray(WS.entryCov)) WS.entryCov = [];
  WS.entryCov = WS.entryCov.filter(function (e) { return e && typeof e === "object" && e.key; });
  WS.black = wsIpMigrate(WS.black); WS.white = wsIpMigrate(WS.white);
  /* 2026-09-21 第十四轮：自定义 PCRE 增「启用 / 停用」与「添加时间」⇒ 旧快照补齐字段
     （默认启用、时间取当日），避免老 localStorage 快照缺字段导致渲染出「—」或状态未定义。 */
  (WS.pcre || []).forEach(function (r) { if (r.on === undefined) r.on = true; if (!r.at) r.at = WS_DATE; });
}
/* 旧快照的 IP 名单是字符串数组；新形态是 {v, ver, scope, note, at} 列表 */
function wsIpMigrate(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(function (x) {
    if (x && typeof x === "object" && x.v) return x;
    return { v: String(x), ver: wsIpVer(String(x)), scope: "平台级", note: "", at: WS_DATE };
  });
}
/* 落盘时**剔除瞬时字段**（本文件无 tab 字段；保留此处以便后续加瞬时态时不再踩） */
function wsSaveStore() { try { localStorage.setItem(WS_KEY, JSON.stringify(WS)); } catch (e) { /* 忽略 */ } }
function rlLoad() {
  RL = rlSeed();
  try { var s = JSON.parse(localStorage.getItem(RL_KEY) || "null"); if (s && typeof s === "object") { for (var k in s) RL[k] = s[k]; } } catch (e) { /* 忽略 */ }
  /* ★ 2026-09-23 第十六轮：与 wsLoad 同口径 —— **旧快照补齐后加字段**，避免缺字段静默降级
     （旧存档缺 rules ⇒ 生效规则表恒为空；缺 hit ⇒ 顶部统计崩。补齐前与「从没进过本页」表现不一致）。 */
  var d = rlSeed();
  /* ★ 2026-09-23 第十七轮：store 无 schema 版本 / 版本不符 ⇒ 旧存档的**规则集**可能仍是上一轮口径
     （例如仍含已移出本库的 CLI-5001 / ML-6003）。若照单全收会**遮蔽本轮 seed**（历史坑：门禁只能靠
     removeItem 绕过）。按 id 合并：结构（id / name / cat / pat / loc）以 seed 为准，
     保留管理员既有「自定义覆盖」（disp / on / ov）。 */
  /* ★ 2026-09-23 第十八轮：① 迁移条件**不再要求 s.rules 非空** —— 旧实现空数组跳过迁移、又被
     Array.isArray([]) 判为「合法」⇒ 既不迁移也不回退 seed，末尾还把 schema 落定 ⇒ 生效规则表
     **永久空**且再也无法自愈；② 迁移时**保留旧存档的 def（库设定基线）** —— 旧实现只搬 disp/on/ov，
     随后 `def = disp` 把「已被覆盖的 disp」当成库设定 ⇒ 覆盖口径（当前是否偏离库设定）被永久判错。 */
  if (s && Array.isArray(s.rules) && s.schema !== d.schema) {
    var byId = {}; s.rules.forEach(function (x) { if (x && x.id) byId[x.id] = x; });
    RL.rules = d.rules.map(function (r) {
      var o = byId[r.id]; if (!o) return r;
      var m2 = {}; for (var mk in r) m2[mk] = r[mk];
      if (o.disp !== undefined) m2.disp = o.disp;
      if (o.on !== undefined) m2.on = o.on;
      if (o.ov !== undefined) m2.ov = o.ov;
      if (o.def !== undefined) m2.def = o.def;
      return m2;
    });
  }
  if (!Array.isArray(RL.versions) || !RL.versions.length) RL.versions = d.versions;
  if (!Array.isArray(RL.rules) || !RL.rules.length) RL.rules = d.rules;
  /* ★ 2026-09-23 第十八轮：与 wsLoad 同口径 —— 命中统计 / 计数 / 标量逐项补齐 + 类型兜底
     （旧实现 entries/stage/pending/signed/publishedAt 零兜底、hit 只补对象级 ⇒ 旧存档会渲染
     「条目 undefined」「命中 预置 undefined」、五步链全灰）。 */
  if (RL.hit && typeof RL.hit === "object") { for (var hk in d.hit) { if (RL.hit[hk] == null) RL.hit[hk] = d.hit[hk]; } } else RL.hit = d.hit;
  if (RL.entries == null || typeof RL.entries !== "number") RL.entries = d.entries;
  if (RL.stage == null || typeof RL.stage !== "number") RL.stage = d.stage;
  if (typeof RL.pending !== "string") RL.pending = d.pending;
  if (typeof RL.publishedAt !== "string") RL.publishedAt = d.publishedAt;
  if (typeof RL.signed !== "boolean") RL.signed = d.signed;
  if (RL.autoRollback == null) RL.autoRollback = d.autoRollback;
  if (!RL.current) RL.current = d.current;
  (RL.rules || []).forEach(function (r) {
    if (r.on === undefined) r.on = true;
    if (r.disp === undefined) r.disp = "继承库设定";
    if (r.def === undefined) r.def = r.disp;   /* 无「库设定」记录 ⇒ 视为与当前一致（无偏离） */
  });
  RL.schema = d.schema;                         /* ★ 第十七轮：迁移后落定 schema，下次载入不再重复合并 */
}
/* 落盘时剔除**演示专用瞬时字段**（`_simFail` 是「模拟验签失败」勾选态）——
   否则勾一次会永久残留，导致后续「签名校验」步无端失败。 */
function rlSaveStore() {
  try {
    var c = {}; for (var k in RL) { if (k.charAt(0) !== "_") c[k] = RL[k]; }
    localStorage.setItem(RL_KEY, JSON.stringify(c));
  } catch (e) { /* 忽略 */ }
}
/* ★ 2026-09-21 第十二轮：规则库「版本号单调递增」是**卡面红线**（版本列表标题 + 回滚红线都写明）。
   旧导入只校验 `YYYY.MM.N` 格式与「完全重复」，不校验**大于当前最高版本** ⇒ 可导入比现网更旧的
   包（探针 A5.1 实测：current=2026.09.1 时导入 2026.08.0 被接受、还提示「已导入」），与红线冲突。
   `rlVerCmp` 按**数值分段**比较（`2026.09.10 > 2026.09.9`、长度不等时缺位按 0 处理），
   供导入单调性与「取当前最高版本」共用。 */
function rlVerCmp(a, b) {
  var x = String(a).split("."), y = String(b).split("."), n = Math.max(x.length, y.length);
  for (var i = 0; i < n; i++) {
    var p = parseInt(x[i] || "0", 10) || 0, q = parseInt(y[i] || "0", 10) || 0;
    if (p !== q) return p > q ? 1 : -1;
  }
  return 0;
}
function rlMaxVer() {
  var m = RL.current || "0.0.0";
  (RL.versions || []).forEach(function (v) { if (rlVerCmp(v.v, m) > 0) m = v.v; });
  /* ★ 2026-09-23 第十七轮：**在途（未下发）包也是版本基线的一部分**。旧实现只看 current + versions ⇒
     已导入 2026.10.1（在途）时回滚会生成 2026.09.2（低于在途包），随后下发在途包即把回滚结果**静默架空**，
     违反本页红线「版本号单调递增」。 */
  if (RL.pending && rlVerCmp(RL.pending, m) > 0) m = RL.pending;
  return m;
}
/* ★ 2026-09-23 第十六轮：回滚 / 重签下发的**下一版本号**必须由当前**最高版本**派生（单调递增），
   不得硬编码 2026.09. 前缀。旧实现 = 固定前缀 + (现行版本 patch + 1) ⇒ 当现行版本月份 ≠ 09
   （如已导入并全量下发 2026.10.1）时，回滚会生成 **2026.09.2 —— 比现行版本还低**，
   直接违反本页反复申明的红线「回滚不得以版本号倒退实现」（探针实测）。
   新实现取 rlMaxVer() 的补丁位 +1（同时覆盖「与历史版本重号」）。 */
function rlNextVer() {
  var m = String(rlMaxVer() || "0.0.0").split(".");
  return (m[0] || "0") + "." + (m[1] || "0") + "." + ((parseInt(m[2] || "0", 10) || 0) + 1);
}

/* ---------- 2. 小工具 ---------- */

function wsBurst(v) { return Math.max(1, Math.round(Number(v || 0) * 0.2)); }   /* 突发 = 阈值 × 20%（F7.1 规则 7） */
/* ★ 2026-09-21 第十二轮：阈值 / 计数窗口 / 覆盖阈值一律要求 **「≥1 的整数」**。
   文案本来就写「≥1 的整数」，但旧校验只判 `!n || n < 1` ⇒ `1.5` / `2.5` 会被静默写入
   （探针 A2.2/A2.3 实测 gatewayCc=1.5、windowSec=2.5）。次数与秒数都是**计数单位**，
   小数无物理意义（会污染滑动窗口 / 令牌桶的令牌数），故在**单一真源**处统一收紧。
   兼容 `Number("")===0`、`Number("1e3")===1000`、`NaN`、`Infinity` 等边界。 */
function wsIntOk(v) { var n = Number(v); return isFinite(n) && n >= 1 && Math.floor(n) === n; }
/* ★ 2026-09-23 第十七轮：覆盖规模的**单一真源** —— 同一资产可同时有「未认证 / 已认证」两条覆盖，
   按维度相加会把 1 个资产数成 2。此处按 **aid 去重**（并兜底 null ⇒ 不再 Object.keys(null) 抛错）。 */
function wsRateCovAssets() {
  var m = {}, add = function (o) { Object.keys(o || {}).forEach(function (k) { m[k] = 1; }); };
  add(WS.assetRate); add(WS.assetRateAnon);
  return Object.keys(m).length;
}
/* 发布 / 回滚时间取**真实时钟**（旧实现写死 "2026-09-21 11:40"，回滚时间永远早于真实操作时间）。 */
function wsNow() {
  var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function wsLv(a) { return "L" + (a && a.lv != null ? a.lv : 1); }
function wsInheritMode(a) { return WS_MODE_BY_LV[wsLv(a)] || "观察"; }
function wsSeg(name, opts, cur, dis) {
  return '<div class="seg" data-ws-seg="' + esc(name) + '">' + opts.map(function (o) {
    return '<button type="button" data-v="' + esc(o) + '" class="' + (o === cur ? "on" : "") + '"' + (dis ? " disabled" : "") + '>' + esc(o) + "</button>";
  }).join("") + "</div>";
}
/* 条目来源 = 资产细粒度资源清单（F3.4），本页只读消费、不反向写入 */
function wsEntries() {
  var out = [];
  (ASSETS || []).forEach(function (a) {
    (a.res || []).forEach(function (r) { (r.paths || []).forEach(function (p) {
      out.push({ key: a.id + "|" + r.id + "|" + p.p, entry: a.name + " · " + p.m + " " + p.p, aid: a.id, rid: r.id, m: p.m, p: p.p });
    }); });
  });
  return out;
}
/* 条目级覆盖「按资产下钻」的取值器（2026-09-21 用户反馈「条目级不该从全局下拉里选、太反人类」）：
   条目天然属于某个资产 ⇒ 只在该资产的条目清单里设值；存储键仍是 `aid|rid|path`（与既有数据同构、不迁移）。 */
function wsEntriesOf(aid) { return wsEntries().filter(function (e) { return e.aid === aid; }); }
function wsEntryAid(key) { return String(key).split("|")[0]; }
function wsEntryOv(key) {
  var hit = (WS.entryCov || []).filter(function (e) { return e.key === key; })[0];
  return hit ? hit.v : null;
}
function wsEntryCountOf(aid) {
  var n = 0; (WS.entryCov || []).forEach(function (e) { if (wsEntryAid(e.key) === aid) n++; }); return n;
}
/* 资产级覆盖表第 7 列 = 条目级下钻入口（有覆盖显示条数徽标；该资产无 Web 条目则只读提示） */
function wsEntryCell(a) {
  if (!wsEntriesOf(a.id).length) return '<span class="mini">无条目</span>';
  var n = wsEntryCountOf(a.id);
  return '<button class="btn link" type="button" data-ws="wsEntryOpen" data-v="' + esc(a.id) + '">' +
    (n ? '条目级覆盖 <span class="tag t-info">' + n + "</span>" : "条目级设置 ›") + "</button>";
}
function wsAssetById(aid) { for (var i = 0; i < (ASSETS || []).length; i++) if (ASSETS[i].id === aid) return ASSETS[i]; return null; }
function wsIpVer(v) { return String(v).indexOf(":") >= 0 ? "IPv6" : "IPv4"; }
/* IP / CIDR **严格校验** —— 安全名单须「内容确定、可复核」。旧实现是宽松字符类
   `/^[0-9a-fA-F:.]+(\/\d{1,3})?$/`，会放过 `999.999.999.999` / `10.0.0.0/99` / `1.2.3` /
   `1.2.3.4.5` / `:::` / `abc` / `2001:db8::/129`，使「任一行非法 ⇒ 整批拒绝」这条硬规则**永不触发**。
   UI「加入」与批量导入 / 迁移共用本函数（**单一真源**）。
   规则：IPv4 四段十进制 0~255（拒绝前导零，避免 `010` 的八进制歧义）；IPv4 前缀 0~32；
        IPv6 基本形态（至多一个 `::` 压缩段；无压缩须满 8 组，有压缩则有效组数 ≤7；
        hex 组 1~4 位；末组可内嵌点分 IPv4，但仅限 `::` 之后或整体末组）；IPv6 前缀 0~128。
        其余一律非法。 */
function wsIpv4Ok(addr) {
  var p = addr.split(".");
  if (p.length !== 4) return false;
  for (var i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(p[i])) return false;
    if (p[i].length > 1 && p[i].charAt(0) === "0") return false;
    if (Number(p[i]) > 255) return false;
  }
  return true;
}
function wsIpv6Ok(addr) {
  var idx = addr.indexOf("::");
  if (idx !== -1 && addr.indexOf("::", idx + 2) !== -1) return false;   /* 至多一个 :: */
  var dbl = idx !== -1;
  var hp = dbl ? addr.slice(0, idx) : addr;
  var tp = dbl ? addr.slice(idx + 2) : "";
  hp = hp === "" ? [] : hp.split(":");
  tp = tp === "" ? [] : tp.split(":");
  var groups = hp.concat(tp), hx = /^[0-9a-fA-F]{1,4}$/, count = 0, last = groups.length - 1;
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    if (g.indexOf(".") >= 0) {                     /* 内嵌点分 IPv4：只允许在末组，且必须在 :: 之后 */
      if (i !== last) return false;
      if (dbl && i < hp.length) return false;
      if (!wsIpv4Ok(g)) return false;
      count += 2;
    } else if (hx.test(g)) { count += 1; }
    else return false;
  }
  return dbl ? count <= 7 : count === 8;
}
function wsIpOk(v) {
  if (typeof v !== "string") return false;
  var s = v.trim();
  if (!s) return false;
  var slash = s.indexOf("/");
  var addr = slash >= 0 ? s.slice(0, slash) : s;
  var pf = slash >= 0 ? s.slice(slash + 1) : null;
  var isV6 = addr.indexOf(":") >= 0;
  if (pf !== null && !/^\d{1,3}$/.test(pf)) return false;
  if (pf !== null && Number(pf) > (isV6 ? 128 : 32)) return false;
  return isV6 ? wsIpv6Ok(addr) : wsIpv4Ok(addr);
}

/* ---- 批量选择（瞬时态；只服务「批量设置」，不落盘）---- */
function wsSel(kind) { if (!WSSEL[kind]) WSSEL[kind] = {}; return WSSEL[kind]; }
function wsSelIds(kind) { var s = wsSel(kind), out = []; for (var k in s) if (s[k]) out.push(k); return out; }
function wsSelLabel(kind) {
  /* ★ 2026-09-23 第十七轮：单位取自**列表自身的 cfg.unit**（旧实现写死「个资产」⇒ 在
     自定义 PCRE 列表上显示「已选 2 个资产」）。kind="a" / "r" 仍为「个资产」，既有契约不变。 */
  var n = wsSelIds(kind).length, u = (wsCfg(kind) || {}).unit || "个资产";
  var q = u.charAt(0) === "个" ? "个" : "条";
  var noun = u.replace(/^个|^条/, "") || "条目";
  return n ? "已选 " + n + " " + q + noun : "未选择" + noun;
}
function wsSelClear(kind) { WSSEL[kind] = {}; }
/* 工具条在表体之外（不随表体重渲染）⇒ 选择数变化后须手动同步该计数节点 */
function wsSelLabelSync(kind) {
  var el = document.querySelector('[data-ws-selc="' + kind + '"]');
  if (el) el.textContent = wsSelLabel(kind);
}
/* ---- 批量可用性：**「可用性 + 原因」同源产出**（对齐「资产访问控制策略」页 batchAvail 的口径）----
   无勾选 ⇒ 批量动作不可用、原因写明「先在列表中勾选…」；有勾选 ⇒ 写明作用面。
   可用性与悬停原因由本函数**一处产出**，按钮初始态与就地刷新（wsSyncSel）都读它。 */
function wsBatchAvail(kind) {
  var n = wsSelIds(kind).length;
  var what = kind === "p" ? "自定义 PCRE 规则" : (kind === "r" ? "资产级限流覆盖" : "单资产防护模式覆盖");
  return {
    on: n > 0,
    why: n > 0 ? "对已勾选的 " + n + " 个对象批量设置" + what : "请先在列表中勾选要批量处理的条目"
  };
}
/* ---- 表头全选 / 半选（indeterminate）：**就地同步**，不整表重渲染（保住滚动位置）----
   与「资产访问控制策略」页 syncAspSel 同口径；「勾选限定当前页」⇒ 翻页即清空（wsPg_* 负责）。 */
function wsPageIds(kind) {
  var host = document.querySelector('[data-ws-body="' + kind + '"]'); if (!host) return [];
  return [].slice.call(host.querySelectorAll('[data-ws-sel="' + kind + '"]')).map(function (c) { return c.getAttribute("data-v"); });
}
function wsSyncSel(kind) {
  var ids = wsPageIds(kind), all = document.getElementById("wsSelAll_" + kind);
  if (all) {
    var on = 0; ids.forEach(function (id) { if (wsSel(kind)[id]) on++; });
    var full = ids.length > 0 && on === ids.length;
    all.checked = full;
    all.indeterminate = on > 0 && on < ids.length;
    all.title = full ? "取消全选本页" : "全选本页";
  }
  wsSelLabelSync(kind);
  var ba = wsBatchAvail(kind);
  [].slice.call(document.querySelectorAll('[data-ws="wsBatch"][data-v="' + kind + '"]')).forEach(function (b) {
    b.disabled = !ba.on; b.title = ba.why;
  });
}

/* PCRE 保存期校验（F7.1 规则 9）：语法 / 长度 / 执行预算 / 灾难性回溯风险，任一不过即拒绝保存。
   ★ 2026-09-23 第十六轮：本函数模拟的是**PCRE**（服务端），而 `new RegExp` 是 JS 引擎 ——
     PCRE 内联修饰组 `(?i)` / `(?is)` 在 JS 里**不是合法语法**（Invalid group）。而本模块的
     内置示例规则、新建弹窗的 placeholder 示例**全都用 `(?i)`** ⇒ ① 管理员照抄示例必被拒；
     ② 防护体检（wsRunCheck）会把**合法的内置规则全部误报为「正则语法错误」**（探针实测）。
     修法：校验前把**前导内联修饰组**剥离并转为 JS flags（只保留 JS 支持的 i/m/s，丢弃 x/u）。 */
function wsPcreCheck(re) {
  if (!re) return "正则不能为空";
  if (re.length > 512) return "长度超限（>512 字符，超出执行预算）";
  var risk = /\([^)]*[*+][^)]*\)\s*[*+]/.test(re) || /\([^)]*\|[^)]*\)\s*[*+]/.test(re);
  if (risk) return "存在灾难性回溯风险（嵌套量词 / 分支重复）";
  var body = re, flags = "";
  try {
    var m = re.match(/^\(\?([imsxu]+)\)/);
    if (m && m[1]) {
      flags = m[1].split("").filter(function (c) { return "ims".indexOf(c) >= 0; })
        .filter(function (c, i, a) { return a.indexOf(c) === i; }).join("");
      body = re.slice(m[0].length);
    }
  } catch (e2) { body = re; flags = ""; }        /* 校验器自身异常不得外溢（否则体检 / 保存整条挂掉） */
  try { new RegExp(body, flags); } catch (e) { return "正则语法错误：" + e.message; }
  return null;
}
/* 写方法影响面：统计「细粒度资源清单里登记了这些写方法」的资产数（C-4 要求展示受影响资产数） */
function wsAffectedAssets() {
  var wm = WS.req.methods.filter(function (m) { return ["PUT", "PATCH", "DELETE"].indexOf(m) >= 0; });
  if (!wm.length) return 0;
  var n = 0;
  (ASSETS || []).forEach(function (a) {
    var hit = false;
    (a.res || []).forEach(function (r) { (r.paths || []).forEach(function (p) { if (wm.indexOf(p.m) >= 0) hit = true; }); });
    if (hit) n++;
  });
  return n;
}

/* ---- 列表块（搜索 / 只看… / 分页）----
   只重渲染「表体 + 分页」，工具条留在重渲染区之外 ⇒ **输入框不丢焦点**（既有页整页重渲染会丢）。 */
function wsF(kind) { if (!WSF[kind]) WSF[kind] = { k: "", only: false, p: 1 }; return WSF[kind]; }
function wsCfg(kind) {
  if (kind === "a") return {                                   /* 单资产模式覆盖 */
    rows: function () { return ASSETS || []; },
    text: function (a) { return a.name; },
    ov: function (a) { return !!WS.modeOverride[a.id]; },
    unit: "个资产", flagLabel: "只看已覆盖", ph: "搜索资产名称", cols: 5, empty: "暂无已登记资产。",
    batch: true,
    head: '<th>资产</th><th style="width:70px">等级</th><th style="width:150px">平台继承值</th><th>覆盖设置</th>',
    row: function (a) {
      var inh = wsInheritMode(a), cur = WS.modeOverride[a.id] || "继承", ov = !!WS.modeOverride[a.id];
      return '<tr><td><input type="checkbox" data-ws-sel="a" data-v="' + esc(a.id) + '"' + (wsSel("a")[a.id] ? " checked" : "") + "></td>" +
        "<td>" + esc(a.name) + (ov ? ' <span class="tag t-info">已覆盖</span>' : "") + "</td>" +
        '<td class="mini">' + esc(wsLv(a)) + "</td>" +
        '<td class="mini">' + esc(inh) + (ov ? "（继承值）" : "") + "</td>" +
        "<td>" + wsSeg("wsMode:" + a.id, ["继承", "观察", "阻断"], cur) +
        (ov ? ' <button class="btn link" type="button" data-ws="wsModeReset" data-v="' + esc(a.id) + '">恢复继承</button>' : "") +
        "</td></tr>";
    }
  };
  if (kind === "b" || kind === "w") {                           /* IP 黑名单 / 白名单 */
    var isB = kind === "b", label = isB ? "黑名单" : "白名单";
    return {
      rows: function () { return isB ? WS.black : WS.white; },
      text: function (e) { return e.v + " " + (e.note || "") + " " + (e.scope || "") + " " + (e.op || "") + " " + (e.at || ""); },   /* ★ 第十八轮：与 PCRE 表同口径（按操作人 / 时间亦可检索） */
      ov: function (e) { return e.scope !== "平台级"; },
      unit: "条", flagLabel: "只看资产级", ph: "搜索地址 / 网段 / 备注", cols: 7, empty: "尚未配置，当前未启用任何 IP 名单。",
      /* 2026-09-21 新增第 5 列「操作人」（用户反馈「黑白名单、自定义规则等增加操作人列」）：
         列宽预算取「不加横向滚动」——在原有五列上共收窄 60px 抵消新增 76px（IP 版本 −12 /
         生效范围 −24 / 添加时间 −16 / 操作 −4，合计 −56，余 20px 由两列 auto 吸收）；
         实测溢出与改造前同为个位数 px（见评审报告 §4.11）。取值 = **姓名、只读**。 */
      head: '<th>地址 / 网段</th><th style="width:84px">IP 版本</th><th style="width:126px">生效范围</th><th>备注</th><th style="width:76px">操作人</th><th style="width:104px">添加时间</th><th style="width:76px">操作</th>',
      row: function (e) {
        /* ⚠ row 必须返回**完整 tr 元素**（含 tr 开合标签）：wsListBody 直接把它拼进 tbody，
           只给 td 会拼出裸单元格（浏览器自动纠正后表面正常、结构已坏 —— 正是构建期标签护栏与运行时
           Q24 断言守的那类错）。故本行注释亦不写裸标签字面量，避免被构建期计数误判。 */
        return '<tr><td><code class="kr">' + esc(e.v) + '</code></td><td class="mini">' + esc(e.ver || wsIpVer(e.v)) +
          '</td><td class="mini">' + esc(e.scope || "平台级") + '</td><td class="mini">' + esc(e.note || "—") +
          '</td><td class="mini">' + esc(e.op || "—") + '</td><td class="mini">' + esc(e.at || "—") + '</td>' +
          '<td><button class="btn link danger" type="button" data-ws="wsIpDel" data-v="' + kind + '" data-i="' + esc(e.v) + '">移除</button></td></tr>';
      }
    };
  }
  if (kind === "r") return {                                    /* 资产级限流覆盖 */
    rows: function () { return ASSETS || []; },
    text: function (a) { return a.name; },
    ov: function (a) { return WS.assetRate[a.id] != null || WS.assetRateAnon[a.id] != null; },
    unit: "个资产", flagLabel: "只看已覆盖", ph: "搜索资产名称", cols: 7, empty: "暂无已登记资产。",
    batch: true,
    /* 第 7 列「条目级」是**下钻入口**（条目天然属于某资产，不做全局下拉）；
       两列覆盖各再收窄 35px、平台继承值收窄 30px，抵消新增列 ⇒ 整表总宽仍与改造前持平（不新增横向滚动） */
    head: '<th>资产</th><th style="width:70px">等级</th><th style="width:140px">平台继承值</th><th style="width:180px">未认证覆盖（IP × 资产）</th><th style="width:180px">已认证覆盖（用户 × 资产）</th><th style="width:100px">条目级</th>',
    row: function (a) {
      var ovA = WS.assetRate[a.id], ovN = WS.assetRateAnon[a.id], ov = ovA != null || ovN != null;
      var inherit = a.lv <= 2 ? "关闭" : WS.rate.assetAuthed + " 次/分钟";
      return '<tr><td><input type="checkbox" data-ws-sel="r" data-v="' + esc(a.id) + '"' + (wsSel("r")[a.id] ? " checked" : "") + "></td>" +
        "<td>" + esc(a.name) + (ov ? ' <span class="tag t-info">已覆盖</span>' : "") + "</td>" +
        '<td class="mini">' + esc(wsLv(a)) + "</td>" +
        /* ★ 2026-09-23 第十七轮：「未认证」维度出厂默认继承平台阈值，但**从不显示该基准值** ⇒ 填覆盖值时无参照。
           补显平台基准；保留「未认证 继承」字样，Q45 的两行契约不变。 */
        '<td class="mini"><div>未认证 继承（平台 ' + WS.rate.assetAnon + ' 次/分钟）</div><div>已认证 ' + esc(inherit) + "</div></td>" +
        '<td><input type="number" min="1" step="1" style="width:100px" aria-label="' + esc(a.name) + ' 未认证覆盖阈值（次/分钟）" data-ws-arate="' + esc(a.id) + '" data-k="anon" value="' + (ovN != null ? ovN : "") + '" placeholder="继承">' +
        (ovN != null ? ' <button class="btn link" type="button" data-ws="wsARateReset" data-v="' + esc(a.id) + '" data-k="anon">恢复继承</button>' : "") + "</td>" +
        '<td><input type="number" min="1" step="1" style="width:100px" aria-label="' + esc(a.name) + ' 已认证覆盖阈值（次/分钟）" data-ws-arate="' + esc(a.id) + '" data-k="auth" value="' + (ovA != null ? ovA : "") + '" placeholder="继承">' +
        (ovA != null ? ' <button class="btn link" type="button" data-ws="wsARateReset" data-v="' + esc(a.id) + '" data-k="auth">恢复继承</button>' : "") + "</td>" +
        "<td>" + wsEntryCell(a) + "</td></tr>";
    }
  };
  if (kind === "e") return {                                    /* 条目级覆盖（**按资产下钻**：行 = 该资产已登记入口条目） */
    rows: function () { return WSEAID ? wsEntriesOf(WSEAID) : []; },
    text: function (r) { return String(r.m || "") + " " + String(r.p || ""); },
    ov: function (r) { return wsEntryOv(r.key) != null; },
    unit: "条", flagLabel: "只看已覆盖", ph: "搜索方法 / 路径", cols: 3,
    empty: "该资产未在细粒度资源清单（F3.4）登记 Web 接口条目，无可设条目级覆盖。",
    head: '<th style="width:110px">方法</th><th>路径</th><th style="width:250px">条目级覆盖（次/分钟）</th>',
    row: function (r) {
      var v = wsEntryOv(r.key);
      return '<tr><td><code class="kr">' + esc(r.m) + '</code></td><td><code>' + esc(r.p) + "</code></td>" +
        '<td><input type="number" min="1" step="1" style="width:110px" aria-label="' + esc(r.m) + ' ' + esc(r.p) + ' 条目级覆盖阈值（次/分钟）" data-ws-erate="' + esc(r.key) + '" value="' + (v != null ? v : "") + '" placeholder="继承">' +
        (v != null ? ' <button class="btn link" type="button" data-ws="wsEntryDel" data-v="' + esc(r.key) + '">恢复继承</button>' : "") + "</td></tr>";
    }
  };
  if (kind === "p") return {                                    /* 自定义 PCRE 规则（第十四轮：由静态表纳入统一列表器械） */
    rows: function () { return WS.pcre; },
    text: function (r) { return String(r.name || "") + " " + String(r.scope || "") + " " + String(r.re || "") + " " + String(r.op || ""); },
    ov: function (r) { return r.on === false; },
    unit: "条规则", flagLabel: "只看已停用", ph: "搜索名称 / 作用域 / 正则 / 操作人", cols: 8,
    empty: "尚未配置自定义规则，当前仅启用内置基线。",
    batch: true, batchLabel: "批量处理",
    head: '<th>规则名称</th><th style="width:100px">作用域</th><th>正则</th><th style="width:84px">状态</th><th style="width:76px">操作人</th><th style="width:104px">添加时间</th><th style="width:118px">操作</th>',
    row: function (r) {
      var idx = WS.pcre.indexOf(r);
      return '<tr><td><input type="checkbox" data-ws-sel="p" data-v="' + esc(r.name) + '"' + (wsSel("p")[r.name] ? " checked" : "") + "></td>" +
        "<td>" + esc(r.name) + '</td><td><span class="tagx" style="padding:1px 8px">' + esc(r.scope) + "</span></td>" +
        '<td><code class="kr">' + esc(r.re) + "</code></td>" +
        '<td><span class="tag ' + (r.on === false ? "t-gray" : "t-ok") + '">' + (r.on === false ? "已停用" : "启用中") + "</span></td>" +
        '<td class="mini">' + esc(r.op || "—") + '</td><td class="mini">' + esc(r.at || "—") + "</td>" +
        '<td><button class="btn link" type="button" data-ws="wsPcreToggle" data-v="' + idx + '">' + (r.on === false ? "启用" : "停用") + "</button>" +
        '<button class="btn link danger" type="button" data-ws="wsPcreDel" data-v="' + idx + '">删除</button></td></tr>';
    }
  };
  return null;
}
function wsFilterRows(f, cfg) {
  var all = cfg.rows();
  return all.filter(function (r) {
    if (f.k) { var t = String(cfg.text(r) || "").toLowerCase(); if (t.indexOf(f.k.toLowerCase()) < 0) return false; }
    if (f.only && cfg.flagLabel && !cfg.ov(r)) return false;
    return true;
  });
}
function wsListBody(kind, cfg) {
  var f = wsF(kind), all = cfg.rows(), rows = wsFilterRows(f, cfg), LP = wsLp(kind);
  var pages = Math.max(1, Math.ceil(rows.length / LP));
  f.p = Math.min(Math.max(1, f.p), pages);
  var page = rows.slice((f.p - 1) * LP, f.p * LP);
  /* 空态两分（对齐「资产访问控制策略」页 aspEmptyRow）：① 从未配置 ⇒ cfg.empty；
     ② 筛选无命中 ⇒ 给「一键清空」——「两种空」成因不同、引导也不同，否则管理员只能逐个下拉回忆改过什么。 */
  var body;
  if (page.length) body = page.map(cfg.row).join("");
  else if (all.length) body = '<tr><td colspan="' + cfg.cols + '" class="mini">无匹配条目，请调整搜索 / 筛选条件。 ' +
    '<button class="btn link" type="button" data-ws="wsClearF" data-v="' + kind + '">清空筛选条件</button></td></tr>';
  else body = '<tr><td colspan="' + cfg.cols + '" class="mini">' + cfg.empty + "</td></tr>";
  /* 批量列表：表头第 1 列 = 全选框（半选由 wsSyncSel 就地维护）。 */
  var head = (cfg.batch ? '<th style="width:40px"><input type="checkbox" id="wsSelAll_' + kind + '" data-ws-selall="' + kind + '" title="全选本页"></th>' : "") + cfg.head;
  return '<div class="tbl-wrap"><table class="lst"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>" +
    '<div class="lst-foot"><div id="wsPg_' + kind + '" style="flex:1"></div></div>';
}
function wsCount(kind) {
  var cfg = wsCfg(kind), f = wsF(kind), n = wsFilterRows(f, cfg).length, total = cfg.rows().length;
  return "共 " + total + " " + cfg.unit + (n !== total ? "（筛后 " + n + "）" : "");
}
function wsMountPager(kind) {
  var cfg = wsCfg(kind), f = wsF(kind), rows = wsFilterRows(f, cfg);
  pgmk("#wsPg_" + kind, rows.length, f.p, "wsPg_" + kind, cfg.unit, wsLp(kind), "搜索 / 筛选 / 分页只作用于本表");
}
function wsListBar(kind) {
  var cfg = wsCfg(kind), f = wsF(kind);
  return '<div class="toolbar" style="margin-bottom:10px">' +
    '<div class="input-w"><input type="search" id="wsK_' + kind + '" data-ws-fk="' + kind + '" placeholder="' + cfg.ph + '" style="width:230px" value="' + esc(f.k) + '"><i>搜索</i></div>' +
    (cfg.flagLabel ? '<label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" data-ws-fo="' + kind + '"' + (f.only ? " checked" : "") + ">" + cfg.flagLabel + "</label>" : "") +
    '<span class="mini" data-ws-cnt="' + kind + '">' + wsCount(kind) + "</span>" +
    (cfg.batch ? (function () { var ba = wsBatchAvail(kind); return '<span class="mini" data-ws-selc="' + kind + '">' + wsSelLabel(kind) + "</span>" +
      '<button class="btn" type="button" data-ws="wsBatch" data-v="' + kind + '"' + (ba.on ? "" : " disabled") + ' title="' + esc(ba.why) + '">' + (cfg.batchLabel || "批量设置") + "</button>" +
      '<button class="btn link" type="button" data-ws="wsSelNone" data-v="' + kind + '">清空选择</button>'; })() : "") +
    "</div>";
}
function wsListBlock(kind) {
  return wsListBar(kind) + '<div data-ws-body="' + kind + '">' + wsListBody(kind, wsCfg(kind)) + "</div>";
}
/* 只重渲染「表体 + 计数」：工具条（含搜索框）留在外面 ⇒ 输入焦点不丢 */
function wsReList(kind) {
  var cfg = wsCfg(kind); if (!cfg) return;
  var cnt = document.querySelector('[data-ws-cnt="' + kind + '"]');
  if (cnt) cnt.textContent = wsCount(kind);
  var selc = document.querySelector('[data-ws-selc="' + kind + '"]');
  if (selc) selc.textContent = wsSelLabel(kind);
  var host = document.querySelector('[data-ws-body="' + kind + '"]');
  if (host) { host.innerHTML = wsListBody(kind, cfg); wsMountPager(kind); }
  if (cfg.pagerOnly) wsMountPager(kind);
  /* ★ 2026-09-23 第十七轮：页② 覆盖卡的「当前覆盖 N 个资产」不在任何重渲染区锚点上 ⇒
     就地设值 / 恢复继承后卡片头数字陈旧（与同屏 TAB 徽标打架）。此处一并同步。 */
  var covEl = document.querySelector("[data-ws-covr]");
  if (covEl) covEl.textContent = String(wsRateCovAssets());
  if (cfg.batch) wsSyncSel(kind);                     /* 全选 / 半选 + 批量可用性就地同步（不整表重渲染） */
  wsTabBadgeSync();                                   /* 名单 / 覆盖数变化后同步页① TAB 徽标（无 TAB 条则 no-op） */
}
/* pgmk 以「全局函数名 + 页码」生成 onclick，故每个列表需要一个全局入口 */
/* 翻页即清空勾选（对齐「资产访问控制策略」页 aspPg）——勾选与结果集强相关，避免跨页误批量 */
function wsPg_a(p) { wsF("a").p = Math.max(1, p | 0); wsSelClear("a"); wsReList("a"); }
function wsPg_b(p) { wsF("b").p = Math.max(1, p | 0); wsReList("b"); }
function wsPg_w(p) { wsF("w").p = Math.max(1, p | 0); wsReList("w"); }
function wsPg_r(p) { wsF("r").p = Math.max(1, p | 0); wsSelClear("r"); wsReList("r"); }
function wsPg_e(p) { wsF("e").p = Math.max(1, p | 0); wsReList("e"); }
function wsPg_p(p) { wsF("p").p = Math.max(1, p | 0); wsSelClear("p"); wsReList("p"); }

/* ---------- 3. 三个页面（Web 安全防护策略 / 集群级限流 / 请求约束） ---------- */

/* 顶部切换条：三个子页同属侧栏「Web 安全防护策略」这**一个**菜单项，靠这三枚按钮互切。
   与既有先例同口径 —— 「资产访问控制策略」下的 `fine-grained.html` / `access-requirement.html`
   也是**三个文件共享一个菜单项**（侧栏高亮由 setPage 的子页映射补齐），跨页一律走 goPage。 */
var WS_SUBS = [
  ["pg-websec", "Web 防护（WAF）", "F7.1 · 攻击特征检测与处置（观察 / 阻断唯一合法处）"],
  ["pg-rate", "集群级限流", "F7.1 · 五类维度的频次限制（不含观察档）"],
  ["pg-reqcon", "请求约束", "F7.3 · 体积 / 并发 / 方法白名单 / 下载限速"]
];
function wsSubNav(cur) {
  /* ★ 2026-09-21 第十二轮：本组按钮**跨文档导航**（各子页是三份独立 HTML），
     不是「同一文档内切面板」的 TAB ⇒ 旧口径 `role="tablist"` / `role="tab"` / `aria-selected`
     是**错误语义**（ARIA tabs 模式要求 aria-controls + 同文档 role="tabpanel"，本处并不存在），
     且既无 roving tabindex 也无键盘处理，与页内 TAB 条（已修 aria/roving）**两套口径**（探针 B3.1/B3.2）。
     改按导航语义：容器 role="navigation" + aria-label，当前项用 aria-current="page"（Tab 键序天然可达）。 */
  return '<div class="seg" role="navigation" aria-label="Web 安全防护策略 · 子页切换" data-page-node-id="WsSubNav00000001">' +
    WS_SUBS.map(function (s) {
      return '<button type="button" data-ws-sub="' + s[0] + '"' +
        (s[0] === cur ? ' class="on" aria-current="page"' : '') +
        ' title="' + esc(s[2]) + '">' + esc(s[1]) + "</button>";
    }).join("") + "</div>";
}
/* 页级头 = 顶部切换条 + 标题 + 副标题 + 页级动作。
   上下文按页只讲「本页在裁决链的位置」，避免三页重复整条链。 */
function wsHead(cur, h2, sub, actions) {
  return '<div class="title-row"><div>' + wsSubNav(cur) +
    '<h2 style="margin-top:14px">' + h2 + '</h2><div class="muted" style="margin-top:4px">' + sub + "</div></div>" +
    '<div class="toolbar">' + (actions || "") + "</div></div>";
}
function wsActions(pre) {
  return (pre || "") +
    '<button class="btn" type="button" data-ws="wsReset">恢复出厂默认</button>' +
    '<button class="btn primary" type="button" data-ws="wsSave">保存并生效</button>';
}
/* 页级只读说明：只讲本页所在环节 + 匿名豁免口径；完整 10 环放在可折叠里（默认收起，不占高度） */
function wsPosNote(ring, desc) {
  return '<div class="note blue" style="margin-bottom:14px"><b>执行时序</b>：本页 = 第 <b>' + ring + '</b> 环（' + desc + '），<b>先于任何身份判定</b>。' +
    "全流量生效，含<b>未开通资产</b>与<b>匿名流量</b>；匿名 / public 只免第 <b>⑤~⑧</b> 环，<b>本环照常执行</b>。" +
    '<details class="rb-fold"><summary>查看完整裁决顺序（10 环）</summary><div class="mini" style="margin-top:6px;line-height:1.7">' + WS_CHAIN + "</div></details></div>";
}

/* ===== 页 ① Web 安全防护策略（F7.1 WAF；观测档唯一合法处） =====
   ---------- 页内 TAB 分层（2026-09-21 · 用户反馈「WAF 页太长、内容顺序与布局不合理」）----------
   分层原则：**页级只留「前提」与「只读口径」，配置项按主题切 TAB**。
   顺序按**管理员的配置动作链**（也是副标题的口径顺序）：
     页级前提「这一层查什么」→ ① 核心处置「查出来怎么办」→ ② 例外「谁不受约束」
     → ③ 规则细节「用什么规则查」→ ④ 事后「命中了记什么、去哪查」。
   ⚠ **TAB 态 = 瞬时 UI 态**：由模块级 `WSTAB` 持有，**刻意不放 `WS`** ⇒ 不入 localStorage；
     刷新回 TAB①、审计截图永远拿到默认视图（与 `WSF` / `WSSEL` 同口径）。
   ⚠ 四个面板**全部渲染、只切显隐**（沿用 `.tabs` + `.tbp` 既有组件，与凭据托管页同口径）：
     故各 TAB 内列表的 DOM 始终存在 ⇒ 分页 / 筛选 / 勾选态不受切 TAB 影响（断言也不必先切 TAB）。 */
var WS_TABS = [
  ["t1", "防护模式", "按安全等级出厂默认 + 单资产覆盖（最高频、最关键）"],
  ["t2", "IP 黑白名单", "例外名单：作用域 / 黑名单 / 白名单"],
  ["t3", "攻击检测", "内置基线 / 自定义 PCRE / 特征库版本"],
  ["t4", "命中与观测", "命中日志字段 / 事件归类（只读）"]
];
var WSTAB = "t1";

/* 页② 集群级限流：同口径三 TAB —— ① 阈值与维度 / ② 覆盖（资产级 + 条目级）/ ③ 故障语义（只读）。
   顺序仍取**管理员的配置动作链**（与页① 同一口径）：限额定多少 → 谁例外、多细 → 坏了怎么办。
   2026-09-21 用户反馈「限流策略页不拆 tab 吗」⇒ 与页① 同一套公约分层（裁决见规划方案 §3.2）。 */
var WS_RATE_TABS = [
  ["u1", "阈值与维度", "五类维度阈值 / 计数窗口 / 突发容量 / 超限动作"],
  ["u2", "覆盖", "资产级覆盖（可批量）+ 条目级覆盖（更细粒度）"],
  ["u3", "故障语义", "共享状态不可用 / 粘性失效时的处置（只读）"]
];
var RTAB = "u1";
/* 两级覆盖的下钻态：null = 资产覆盖列表（级 1）；aid = 该资产的条目清单（级 2）。
   与 TAB 态同口径 —— **瞬时 UI 态**（模块级，刻意不入 `WS` / localStorage）；
   `goPage` 是整页导航 ⇒ 跨页 / 刷新必然回到级 1，审计与截图永远拿到默认视图。 */
var WSEAID = null;

/* TAB 组登记表：把「页① / 页② 各一套 TAB」收敛成**同一份实现**，按 group 参数化。
   ⚠ 必须参数化的理由（2026-09-21）：页② 分层时若照抄一套新代码，就会**复制**页① 曾经的
     三个真实缺陷（`aria-selected` 与 `.on` 脱同步 / 徽标陈旧 / 键盘不可达，见评审报告 §4.6 D2/D4）。
     共用一份 ⇒ 修一次、两页同得；新页再分层时只需登记一组。
   ⚠ 状态用 get/set **闭包**而非直接属性：**页① 的当前 TAB 仍由模块级 `WSTAB` 持有**
     —— 既有断言（Q7 系列）直接读 `WSTAB`、并以 `wsTabShow("t1")` 调用，通用化不得改其外部契约。
   ⚠ `host` 只作**回退**：正常路径由 TAB 条 `nav.closest(".pg")` 反查承载页
     （三子页是三份独立 HTML，同一份脚本各页只挂自己那一个 `.pg`）。 */
/* 规则库页（2026-09-22 第二十一轮）：两表每页行数 + 页内 TAB 定义。
   ⚠ 分页态 RL._pgV / RL._pgR 为**瞬时态**（下划线前缀 ⇒ rlSaveStore 不落盘），与「筛选态 = 瞬时态」同口径。 */
var RL_PAGE_V = 5, RL_PAGE_R = 8;
var RL_TABS = [["r1", "版本库", "多版本并存 · 当前版本在行内标记"],
               ["r2", "生效规则", "库内规则条目 · 编辑 / 停用即自定义覆盖"],
               ["r3", "设置与回滚", "库分区 / 自动回滚 / 非接管语义"]];
var RLTAB = "r1";

var TAB_GROUPS = {
  waf: {
    navId: "wsWafTabs", host: "pg-websec", navNodeId: "WsWafTabs00000001", aria: "Web 防护（WAF）分区",
    tabs: WS_TABS, mount: ["a", "b", "w", "p"],
    get: function () { return WSTAB; }, set: function (v) { WSTAB = v; }
  },
  rate: {
    navId: "wsRateTabs", host: "pg-rate", navNodeId: "WsRateTabs00000001", aria: "集群级限流分区",
    tabs: WS_RATE_TABS, mount: ["r", "e"],
    get: function () { return RTAB; }, set: function (v) { RTAB = v; }
  },
  /* 规则库页：复用同一份 TAB 实现（继承 aria 同步 / roving tabindex）。
     mount 为空 —— 本页两表在渲染时用 pgmk 直接写入隐藏面板，切 TAB 只切显隐即可。 */
  rulelib: {
    navId: "rlTabs", host: "pg-rulelib", navNodeId: "RlTabsNodeId000001", aria: "规则库管理分区",
    tabs: RL_TABS, mount: [],
    get: function () { return RLTAB; }, set: function (v) { RLTAB = v; }
  }
};
/* 徽标计数（0 不显示）：页① TAB③ 只数自定义 PCRE（预置基线不可数）；
   页② 只在「覆盖」TAB 上计数（资产级 + 条目级覆盖项合计）。 */
function wsTabCount(g, k) {
  if (g === "rate") {
    if (k === "u2") return Object.keys(WS.assetRate).length + Object.keys(WS.assetRateAnon).length + (WS.entryCov || []).length;
    return 0;
  }
  if (k === "t1") return Object.keys(WS.modeOverride).length;         /* 已覆盖资产数 */
  if (k === "t2") return WS.black.length + WS.white.length;           /* 名单条数（黑 + 白） */
  if (k === "t3") return WS.pcre.length;                             /* 自定义 PCRE 条数 */
  return 0;
}
function wsTabNum(g, k) { var n = wsTabCount(g, k); return n > 0 ? '<span class="num">' + n + "</span>" : ""; }
/* 徽标随**数据**变化，但「只重渲染表体」的路径（wsReList）不会重建 TAB 条 ⇒ 徽标会陈旧
   （实测页①：TAB① 覆盖数 1→0 后徽标仍显示 1）。本函数按当前数据重算**本页 TAB 组**的全部徽标；
   通用化后逐组做 —— 页上没有的那一组（如限流页没有 WAF 条）自然 no-op。
   页面里没有 TAB 条的（请求约束）整体 no-op。 */
function wsTabBadgeSync() {
  Object.keys(TAB_GROUPS).forEach(function (g) {
    var G = TAB_GROUPS[g];
    var nav = document.getElementById(G.navId); if (!nav) return;    /* 本页无此组 ⇒ no-op */
    G.tabs.forEach(function (t) {
      var b = nav.querySelector('[data-wt="' + t[0] + '"]'); if (!b) return;
      var old = b.querySelector(".num"); if (old && old.parentNode) old.parentNode.removeChild(old);
      var n = wsTabCount(g, t[0]);
      if (n > 0) b.insertAdjacentHTML("beforeend", '<span class="num">' + n + "</span>");
    });
  });
}
function wsTabsNav(g) {
  var G = TAB_GROUPS[g];
  return '<div class="tabs" id="' + G.navId + '" role="tablist" aria-label="' + esc(G.aria) + '" data-page-node-id="' + G.navNodeId + '" data-tbg="' + g + '">' +
    G.tabs.map(function (t) {
      var on = t[0] === G.get();
      return '<button type="button" role="tab" id="' + G.navId + '-tab-' + t[0] + '" data-wt="' + t[0] + '" title="' + esc(t[2]) + '"' +
        ' aria-controls="wt-' + t[0] + '"' +
        ' aria-selected="' + on + '" tabindex="' + (on ? "0" : "-1") + '"' +
        (on ? ' class="on"' : "") + ">" +
        esc(t[1]) + wsTabNum(g, t[0]) + "</button>";
    }).join("") + "</div>";
}
function wsTabPane(g, k, inner) {
  var on = k === TAB_GROUPS[g].get();
  return '<div class="tbp' + (on ? " on" : "") + '" id="wt-' + k + '" role="tabpanel" aria-labelledby="' + TAB_GROUPS[g].navId + '-tab-' + k + '" aria-hidden="' + (on ? "false" : "true") + '">' + inner + "</div>";
}
/* 切 TAB 只切显隐，**不重渲染**（保住各 TAB 内列表的分页 / 筛选 / 勾选态与滚动位置）；
   只重挂页码条（pgmk 在隐藏态也写得进 DOM，这里只是稳妥起见）。
   ⚠ `aria-selected` / `aria-hidden` 必须与 `.on` **同步**：只切 class 会让读屏与断言
     都拿到**陈旧**值（Q7d 实测：切到 t2 后 `.on`=t2、但按钮 `aria-selected` 仍是 t1 的
     true ⇒ 面板换了、无障碍语义没换，属真实缺陷，本节修复）。
   ⚠ 同时维护 **roving tabindex**（WAI-ARIA tabs 模式）：选中项 tabindex=0，其余 -1 ——
     整条 TAB 条在 Tab 键序里只占 1 个停靠点，其内用 ← / → 移动。 */
function wsTabShow(k, g) {
  g = g || "waf";                                   /* 省略 group ⇒ 页①（保持 wsTabShow("t1") 契约） */
  var G = TAB_GROUPS[g]; if (!G) return;
  var nav = document.getElementById(G.navId);
  var host = (nav && nav.closest) ? nav.closest(".pg") : document.getElementById(G.host);
  if (!host) return;
  G.set(k);
  host.querySelectorAll(".tbp").forEach(function (p) {
    var on = p.id === "wt-" + k;
    p.classList.toggle("on", on);
    p.setAttribute("aria-hidden", on ? "false" : "true");
  });
  host.querySelectorAll('[data-tbg="' + g + '"] button').forEach(function (b) {
    var on = b.getAttribute("data-wt") === k;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.setAttribute("tabindex", on ? "0" : "-1");
  });
  G.mount.forEach(function (m) { wsMountPager(m); });
}
/* TAB 条键盘可达性（D4）：← / → 循环切换，Home / End 跳首末；切换后焦点跟随新选中项。
   ↑ / ↓ 亦可（部分实现习惯用纵向键），此处一并接受。 */
function wsOnKey(e) {
  var t = e.target;
  if (!t || !t.getAttribute) return;
  var bar = t.closest ? t.closest('[role="tablist"][data-tbg]') : null;
  if (!bar) return;
  var g = bar.getAttribute("data-tbg"); var G = TAB_GROUPS[g]; if (!G) return;
  var order = G.tabs.map(function (x) { return x[0]; });
  var i = order.indexOf(t.getAttribute("data-wt"));
  if (i < 0) return;
  var nk = null;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") nk = order[(i + 1) % order.length];
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nk = order[(i - 1 + order.length) % order.length];
  else if (e.key === "Home") nk = order[0];
  else if (e.key === "End") nk = order[order.length - 1];
  else return;
  e.preventDefault();
  wsTabShow(nk, g);
  var btn = bar.querySelector('[data-wt="' + nk + '"]');
  if (btn) btn.focus();
}
/* TAB① 防护模式：等级出厂默认 + 单资产覆盖（「查出来怎么办」，一个主题的两个层次） */
function wsPaneMode() {
  return '<div class="card"><div class="card-h"><h3>防护模式<span class="sub">平台默认按资产安全等级出厂；单个资产可覆盖（覆盖层 L3）</span></h3></div>' +
    '<div class="card-b">' +
      '<table class="mtx lst"><thead><tr><th>安全等级</th><th>L1</th><th>L2</th><th>L3</th><th>L4</th><th>L5</th></tr></thead>' +
      '<tbody><tr><td>默认防护模式</td>' + ["L1", "L2", "L3", "L4", "L5"].map(function (l) {
        var m = WS_MODE_BY_LV[l];
        return '<td><span class="tag ' + (m === "阻断" ? "t-err" : "t-warn") + '">' + m + "</span></td>";
      }).join("") + "</tr></tbody></table>" +
      '<div class="note">L1~L2 <b>观察</b> · L3~L5 <b>阻断</b>；出厂固定、不可编辑，仅对「未被单资产覆盖」的资产生效（F4.1 规则 9）。</div>' +
      '<div class="card-sect"><h4>单资产覆盖</h4><span class="sub">覆盖层 L3 · 只存偏离项；勾选多行可批量设置</span></div>' +
      wsListBlock("a") +
    "</div></div>";
}
/* TAB② IP 黑白名单：例外名单（作用域 → 黑名单 → 白名单 → 冲突语义） */
function wsPaneIp() {
  return '<div class="card"><div class="card-h"><h3>IP 黑白名单<span class="sub">名单为清单列表；冲突时黑名单优先（F7.1 规则 3）</span></h3>' +
    '<div class="toolbar"><span class="mini" style="margin-right:8px">作用域</span>' + wsSeg("listScope", ["平台级", "平台级+资产级"], WS.listScope) + "</div></div>" +
    '<div class="card-b">' +
      '<div class="card-sect" style="border-top:0;padding-top:0"><h4>黑名单</h4><span class="sub">命中即阻断，优先于白名单</span></div>' +
      wsIpAddBar("b") + wsListBlock("b") +
      '<div class="card-sect"><h4>白名单</h4><span class="sub">只跳过攻击特征检测，不等于放行</span></div>' +
      wsIpAddBar("w") + wsListBlock("w") +
      '<div class="note blue">白名单<b>只跳过攻击特征检测</b>；<b>不跳过</b>限流、主体认证、资产访问状态、ABAC、请求约束与审计。' +
      (WS.listScope === "平台级+资产级" ? "名单可挂到<b>平台级</b>或<b>单个资产</b>（生效范围列）；平台级对资产级仍然生效。" : "") + "</div>" +
    "</div></div>";
}
/* TAB③ 攻击检测：内置基线 → 自定义 PCRE → 特征库版本（「用什么规则查」） */
function wsPaneDetect() {
  return '<div class="card"><div class="card-h"><h3>攻击检测<span class="sub">内置基线 / 自定义 PCRE / 版本化特征库</span></h3></div>' +
    '<div class="card-b">' +
      '<div class="card-sect" style="border-top:0;padding-top:0"><h4>内置基线</h4><span class="sub">默认开；关闭将显著降低防护</span></div>' +
      ["sqli", "xss", "scanner"].map(function (k) {
        var nm = { sqli: "SQLi 基线", xss: "XSS 基线", scanner: "扫描器基线" }[k];
        return '<div class="kv" style="margin-bottom:8px;grid-template-columns:130px auto 1fr"><span class="k">' + nm + "</span>" +
          '<label class="switch"><input type="checkbox" data-ws-sw="' + k + '"' + (WS.baseline[k] ? " checked" : "") + '><span class="sl"></span></label>' +
          '<span class="mini" style="margin-left:10px">默认开；关闭将显著降低防护</span></div>';
      }).join("") +
      '<div class="card-sect"><h4>自定义 PCRE 规则</h4><span class="sub">保存期校验语法 / 长度 / 执行预算 / 灾难性回溯；可逐条启停 / 批量处理</span></div>' +
      '<div class="toolbar" style="margin-bottom:8px"><button class="btn" type="button" data-ws="wsPcreAdd">+ 新建规则</button><span class="mini">变更走受控版本发布，滚动生效</span></div>' +
      /* 2026-09-21 第十四轮：自定义 PCRE 由「静态表」纳入**统一列表器械**（搜索 / 计数 / 分页 / 全选 / 批量 / 行内启停）——
         与 IP 名单、与「资产访问控制策略」页的清单同口径；规则一多也不至于无检索、无分页地铺满整页。 */
      wsListBlock("p") +
      '<div class="note">当前特征库版本：<b>' + esc(wsFeatureVer()) + "</b>（随平台版本交付 · SM2 签名下发；与「规则库管理」页<b>同源</b>）。上方<b>自定义 PCRE 为站点自有规则</b>，<b>与特征库互相独立</b>、<b>不随库下发</b>（F7.1 规则 2）　" +
      /* ★ 2026-09-23 第十七轮：关闭的内置基线须**在规则库页同源可见**（否则两页对同一规则的状态自相矛盾）。 */
      (function () { var off = ["sqli", "xss", "scanner"].filter(function (k) { return WS.baseline[k] === false; }); return off.length ? '<b class="red">已关闭基线：' + off.map(function (k) { return k.toUpperCase(); }).join(" / ") + "</b>（该类规则在规则库页同步标「基线已关」）　" : ""; })() +
      '<button class="btn link" type="button" data-ws="wsGotoLib">前往规则库管理 →</button></div>' +
    "</div></div>";
}
/* TAB④ 命中与观测：只读（「命中了记什么、去哪查」）—— 与「可配置的检测规则」不同层，故单列一 TAB */
function wsPaneObserve() {
  return '<div class="card"><div class="card-h"><h3>命中与观测<span class="sub">只读 · 本 TAB 无可配置项</span></h3></div>' +
    '<div class="card-b">' +
      '<div class="card-sect" style="border-top:0;padding-top:0"><h4>命中日志字段</h4><span class="sub">不记录原始敏感值</span></div>' +
      '<div class="note">WAF 命中日志记录：<b>模式 / 规则 ID / 特征库版本 / 处置 / 耗时</b>；<b>不记录原始敏感值</b>（F7.1 规则 10）。</div>' +
      '<div class="card-sect"><h4>事件归类</h4><span class="sub">唯一归类，不双写</span></div>' +
      '<div class="note">观察命中 → <b>命中事件</b>；阻断命中 / 限流 429 → <b>风险事件</b>；<b>唯一归类、不双写</b>。' +
      "日志在<b>审计事件查询</b>中检索（该页不在本原型范围内）。</div>" +
    "</div></div>";
}
function wsHtmlWaf() {
  return wsHead("pg-websec", "Web 防护（WAF）", "F7.1 WAF —— 防护模式 / IP 黑白名单 / 攻击检测 / 命中与观测；观察 = 仅记录，阻断 = 拒绝且不进入后续裁决", wsActions('<button class="btn" type="button" data-ws="wsCheck">防护体检</button>')) +
    wsPosNote("②", "WAF 与 Origin / 跳转校验、请求头清洗") +
    /* 检测面 = 本页**前提**：只读、固定六项、无关闭入口 ⇒ 不进 TAB，压成一行常驻（F7.1 规则 1）。
       放在 TAB 之外的理由：切到任何 TAB 都必须能看到「这一层在查什么、且关不掉」。 */
    '<div class="note"><b>检测面</b>（F7.1 规则 1，<b>固定六项、无关闭入口</b>，在<b>身份与授权之前</b>检查）：' +
      WS_FACES.map(function (f) { return "<b>" + f + "</b>"; }).join(" · ") +
      '。本页是<b>策略配置层唯一</b>可设「观察 / 阻断」的页面：<b>规则库管理</b>页的「命中处置」为<b>库内规则级</b>覆盖（同属 WAF 检测域，非策略配置），<b>限流 / 请求约束</b>两页均不出现该处置。</div>' +
    wsTabsNav("waf") +
    wsTabPane("waf", "t1", wsPaneMode()) +
    wsTabPane("waf", "t2", wsPaneIp()) +
    wsTabPane("waf", "t3", wsPaneDetect()) +
    wsTabPane("waf", "t4", wsPaneObserve());
}
/* IP 名单的「加入」工具条（生效范围仅在作用域含资产级时可选） */
function wsIpAddBar(kind) {
  var isB = kind === "b", assetScope = WS.listScope === "平台级+资产级";
  return '<div class="toolbar" style="margin-bottom:8px">' +
    '<input type="text" id="wsIpIn_' + kind + '" placeholder="' + (isB ? "如 203.0.113.0/24" : "如 198.51.100.7") + '" style="width:230px">' +
    (assetScope ? '<select id="wsIpSc_' + kind + '"><option>平台级</option>' + (ASSETS || []).map(function (a) { return "<option>" + esc(a.name) + "</option>"; }).join("") + "</select>" : "") +
    '<input type="text" id="wsIpNo_' + kind + '" placeholder="备注（可选）" style="width:180px">' +
    '<button class="btn" type="button" data-ws="wsIpAdd" data-v="' + kind + '">' + (isB ? "加入黑名单" : "加入白名单") + "</button></div>" +
    '<div class="toolbar" style="margin-bottom:10px">' +
      '<button class="btn" type="button" data-ws="wsIpImp" data-v="' + kind + '">批量导入</button>' +
      '<button class="btn" type="button" data-ws="wsIpExp" data-v="' + kind + '">导出</button>' +
      '<span class="mini">一次可粘贴多条（每行一条，英文逗号分隔）；导出结果可直接回灌「批量导入」</span>' +
    "</div>";
}

/* IP 名单的**文本形态**（导入 / 导出同源）：每行 `地址/网段[,生效范围][,备注]`；`#` 开头行与空行忽略。
   校验口径（安全名单须「内容确定、可复核」）：
     · **任一行非法 ⇒ 整批拒绝**：不做「部分导入」—— 半截名单会给人虚假的完整感；回报前几个非法行号。
     · 与现有条目重复 ⇒ 跳过（幂等，不算错）。
     · 生效范围只接受「平台级」或已登记资产名（仅在作用域含资产级时），其余判非法。 */
function wsIpParse(text, kind) {
  var arr = kind === "b" ? WS.black : WS.white;
  var exist = {};
  arr.forEach(function (e) { exist[e.v] = 1; });
  var bad = [], dup = [], add = [], seen = {};
  /* ★ 2026-09-23 第十八轮：作用域白名单**恒含已登记资产名**（不再随 listScope 收缩）。
     旧实现把 listScope 切回「平台级」后，历史里已挂到资产的条目在导出文本里仍是「资产名」，
     回灌时被判非法行 ⇒ **整批拒绝**，破坏本页承诺的「导出结果可直接回灌」。校验只认
     「是不是已登记资产名」，与「当前是否允许**新增**资产级条目」解耦（后者由加入条的控制项决定）。 */
  var scopeOk = ["平台级"].concat((ASSETS || []).map(function (a) { return a.name; }));
  String(text || "").split(/\r?\n/).forEach(function (line, i) {
    var s = line.trim();
    if (!s || s.charAt(0) === "#") return;
    var parts = s.split(",").map(function (x) { return x.trim(); });
    var v = parts[0], scope = parts[1] || "平台级", note = parts.slice(2).join(" ").trim();
    if (!v || !wsIpOk(v)) { bad.push(i + 1); return; }
    if (scopeOk.indexOf(scope) < 0) { bad.push(i + 1); return; }
    if (exist[v] || seen[v]) { if (!seen[v]) dup.push(v); seen[v] = 1; return; }
    seen[v] = 1;
    /* ★ 2026-09-21 第十二轮补：批量导入的条目也**必须落「操作人」**（与 UI「加入」同口径）。
       旧实现落下 {v,ver,scope,note,at} 而漏 `op` ⇒ 导入行在「操作人」列显示「—」，
       与「新增操作人列」的既定口径不一致（探针 A1.4/A1.5 实测 op=null、渲染为「—」）。 */
    add.push({ v: v, ver: wsIpVer(v), scope: scope, note: note, at: WS_DATE, op: wsOp() });
  });
  return { bad: bad, dup: dup, add: add };
}
/* 导入失败时在弹窗内留一条**常驻**红字（`.note red`）：
   ① toast 2.6s 就消失，对「粘贴 200 行失败」这种批量操作反馈太弱；
   ② 文本区不做字段级标红 —— 非法行在文本体内，标红整个文本区**指不到具体行**，
      行号才是有效定位信息，两者互补（`markBad` 仍保留：它会把焦点移到文本区）。
   用 createElement 构造，避免在源码里写 HTML 字面量（构建期标签计数护栏管不到 DOM API）。 */
function wsImpErr(msg) {
  var host = $("#dlg1Body"); if (!host) return;
  var old = host.querySelector("[data-ws-imperr]");
  if (old && old.parentNode) old.parentNode.removeChild(old);
  if (!msg) return;
  var d = document.createElement("div");
  d.className = "note red";
  d.setAttribute("data-ws-imperr", "1");
  d.textContent = msg;
  host.appendChild(d);
}
function openIpImpDlg(kind) {
  var isB = kind === "b", label = isB ? "黑名单" : "白名单";
  var html = '<div class="fld"><label>粘贴名单 <span class="req">*</span></label>' +
    '<textarea id="wsIpImpTxt" rows="7" placeholder="203.0.113.0/24,平台级,境外扫描源段&#10;198.51.100.23&#10;# 以 # 开头的行忽略" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12.5px"></textarea>' +
    '<div class="help">每行一条：<code class="kr">地址/网段[,生效范围][,备注]</code>；空行与 <code class="kr">#</code> 开头行忽略。<b>有任一行格式非法即整批拒绝</b>（回报行号）；与现有条目重复的行自动跳过。</div></div>' +
    '<div class="note">示例：<code class="kr">203.0.113.0/24,平台级,境外扫描源段</code>　<code class="kr">198.51.100.23</code>（生效范围 / 备注可省，默认平台级）</div>';
  openDlg("批量导入" + label, "导入是向" + label + "<b>新增条目</b>；<b>不覆盖、不清空</b>现有条目。", html);
  $("#dlg1Ok").textContent = "校验并导入";
  $("#dlg1Ok").onclick = function () {
    var ta = $("#wsIpImpTxt");
    wsImpErr("");                                                /* 每次重试先清掉上一条错误 */
    var res = wsIpParse(ta.value, kind);
    if (res.bad.length) {
      var msg = "第 " + res.bad.slice(0, 5).join(" / ") + " 行格式非法，整批已拒绝（共 " + res.bad.length + " 行不合法，名单条数未变）。修正后重新粘贴即可。";
      markBad(ta, true); wsImpErr(msg); toast("第 " + res.bad.slice(0, 5).join(" / ") + " 行格式非法，整批已拒绝");
      return;
    }
    if (!res.add.length) {
      var m2 = res.dup.length ? "全部 " + res.dup.length + " 条与现有条目重复，无需导入" : "未解析到任何条目";
      markBad(ta, true); wsImpErr(m2); toast(m2);
      return;
    }
    closeDlg();
    /* 2026-09-21 第十四轮：导入**先预览后落库**（对齐参考页 openApiImport 的「预览与提交共用一份分析」）——
       确认框内直接列出**本次将新增的条目原文**，避免「粘 200 行 → 只看到条数 → 落库后才发现粘错」；
       预览与提交**共用同一份 res.add**（同源），不存在「预览一套、落库另一套」。 */
    var pv = res.add.slice(0, 12).map(function (e) {
      return '<code class="kr">' + esc(e.v) + '</code> · ' + esc(e.scope || "平台级") + (e.note ? ' · ' + esc(e.note) : '');
    }).join("<br>");
    confirmDlg("批量导入" + label,
      "将向<b>" + label + "</b>新增 <b>" + res.add.length + "</b> 条" + (res.dup.length ? "（另有 <b>" + res.dup.length + "</b> 条重复，已跳过）" : "") + "。" +
      (isB ? "黑名单<b>命中即阻断</b>，优先于白名单。" : "白名单<b>只跳过攻击特征检测</b>，<b>不等于放行</b>：限流、主体认证、资产访问状态、ABAC、请求约束与审计<b>照常执行</b>。") +
      '<div style="margin-top:8px;max-height:150px;overflow:auto;border-top:1px dashed var(--line,#dfe3ea);padding-top:6px;line-height:1.7">' + pv +
      (res.add.length > 12 ? '<br><span class="mini">… 其余 ' + (res.add.length - 12) + ' 条略</span>' : '') + '</div>' +
      "<b>本次变更入审计</b>。确认导入？", function () {
        var arr = isB ? WS.black : WS.white;
        res.add.forEach(function (e) { arr.push(e); });
        wsSaveStore(); wsCurRender(); toast("已导入 " + res.add.length + " 条至" + label + "（演示）");
      }, "确认导入");
  };
  $("#dlg1No").textContent = "取消";
}
function openIpExpDlg(kind) {
  var isB = kind === "b", label = isB ? "黑名单" : "白名单";
  var arr = isB ? WS.black : WS.white;
  var txt = arr.map(function (e) { return e.v + "," + (e.scope || "平台级") + "," + (e.note || ""); }).join("\n");
  var html = '<div class="fld"><label>当前' + label + '（' + arr.length + ' 条）</label>' +
    '<textarea id="wsIpExpTxt" rows="8" readonly placeholder="（名单为空）" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12.5px">' + esc(txt) + "</textarea>" +
    '<div class="help">格式：<code class="kr">地址/网段,生效范围,备注</code>；导出结果可直接粘回「批量导入」。</div></div>';
  openDlg("导出" + label, "导出<b>当前已配置</b>的条目（含生效范围与备注）；<b>导出不改变任何配置</b>。", html);
  $("#dlg1Ok").textContent = "复制到剪贴板";
  $("#dlg1Ok").onclick = function () {
    var ta = $("#wsIpExpTxt");
    /* ★ 2026-09-22 第十五轮：复制改用 **navigator.clipboard 优先**（异步），失败再回退已废弃的
       document.execCommand("copy")。旧实现只走 execCommand，在部分环境（新版浏览器 / 非安全上下文）
       已失效 ⇒ 「复制到剪贴板」点了没反应。 */
    var fallback = function () {
      var ok = false;
      try {
        ta.removeAttribute("readonly"); ta.focus(); ta.select();
        ok = !!(document.execCommand && document.execCommand("copy"));
        ta.setAttribute("readonly", "readonly");
      } catch (err) { ok = false; }
      return ok;
    };
    var finish = function (ok) {
      toast(ok ? "已复制 " + arr.length + " 条到剪贴板（演示）" : "当前环境不允许自动复制，请手动全选复制");
      if (ok) closeDlg();
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(function () { finish(true); }, function () { finish(fallback()); });
        return;
      }
    } catch (err) { /* 回退 */ }
    finish(fallback());
  };
  $("#dlg1No").textContent = "关闭";
}

/* ===== 页 ② 集群级限流（F7.1；无「观察 / 阻断」处置开关） =====
   ---------- 页内 TAB 分层（2026-09-21 · 用户反馈「限流策略页不拆 tab 吗」）----------
   与页① **同一套公约**（`.tabs` + `.tbp`、只切显隐不重渲染、TAB 态瞬时不入 `WS`），
   顺序同样取**管理员的配置动作链**：① 阈值与维度（「限多少」）→ ② 覆盖（「谁例外、多细」）
   → ③ 故障语义（「坏了怎么办」，只读）。
   ⚠ 页级**常驻**的是两件**前提**（切到任何 TAB 都必须看得到，故不进 TAB）：
     ① 执行时序（第 ③ 环；匿名 / public 照常执行）；
     ② **计数载体（随部署形态）** —— 客户 DMZ **禁独立部署的 Redis 等中间件**，
        计数载体由部署形态决定，这是「为什么计数结果是可信的」前提（同页①「检测面」的处理）。 */
/* ★ 2026-09-23 第十七轮：下列两段说明含**可编辑阈值**，须随改动**就地刷新**
   （旧实现把数值写死在说明里 ⇒ 改完阈值说明仍述旧值，与数据自相矛盾）。故抽为函数，渲染与改动共用同一真源。 */
function wsAssetAuthedNote() { return "用户 × 资产；L1~L2 关闭、L3~L5 " + WS.rate.assetAuthed + " 次/分钟"; }
/* ★ 2026-09-23 第十八轮：覆盖卡说明抽为函数（含可编辑的 assetAuthed）—— 旧实现把「走 60 次/分钟」
   写死在 TAB②，改阈值后同屏说明仍述旧值。渲染与改动共用同一真源。 */
function wsAssetCoverNote() {
  return "未认证维度出厂默认<b>继承平台阈值</b>；已认证维度 <b>L1~L2 关闭、L3~L5 走 " + WS.rate.assetAuthed + " 次/分钟</b> —— 在 L1~L2 资产上填值即为「为它单独开启用户级限流」（F4.1 规则 9）。";
}
function wsRateQuotaNote() {
  return "<b>额度关系</b>（同级计数依据下 <b>外层 ≥ 内层</b>）：网关 CC 按该来源 IP 的<b>全部请求</b>计数（" + WS.rate.gatewayCc +
    " 次/分钟）；登录 · 来源 IP 只数其中<b>登录请求</b>（" + WS.rate.loginIp +
    " 次/分钟）—— 内层计数集合是外层的<b>子集</b>，<b>外层必须不低于内层</b>，否则内层永远无法触发（死配置）。账号维度按<b>失败计数</b>（" + WS.rate.loginAccount +
    " 次/分钟），与「请求总量」口径<b>不可直接比大小</b>，其额度更低是因为<b>身份更窄</b>。";
}
/* ★ 2026-09-23 第十八轮：计数窗口说明抽为函数（含可编辑的 windowSec）—— 渲染与改动共用同一真源，
   改窗口后**就地刷新**，避免说明与数据自相矛盾；顺带把界面里裸露的英文标识 statusCode 改为中文。 */
function wsRateWinNote() {
  return "突发容量 = 阈值 × <b>20%</b>（F7.1 规则 7），随阈值<b>实时重算</b>；令牌桶不产生固定窗口双倍突发。各档阈值均按<b>上方「计数窗口」（当前 " + WS.rate.windowSec + " 秒）</b>内计数，窗口变更后阈值口径随之变化。状态码（系统内部字段，界面不暴露）。";
}
/* TAB① 阈值与维度：五类维度 + 计数窗口 + 超限动作（「限多少」） */
function wsPaneRateThresh() {
  /* 五类限流维度的**呈现顺序**（2026-09-21 裁决）：按「管理员配置时的心理顺序」——
     管控半径**由宽到窄**：网关级 → 登录级 → 资产级。
     维度集合与 PRD §F7.1 规则 6 **完全一致**，仅呈现次序不同（PRD 原文次序为
     登录·账号 → 登录·来源 IP → 网关 CC → 资产·未认证 → 资产·已认证）。 */
  var rows = [
    ["gatewayCc",    "网关 CC · 来源 IP",             "来源 IP",                                            "L1"],
    ["loginAccount", "登录 · 账号",                   "失败计数",                                            "L1"],
    ["loginIp",      "登录 · 来源 IP",                "请求总量（不做失败计数限流，避免误伤共享出口 IP）",       "L1"],
    ["assetAnon",    "资产级（未认证）· IP × 资产",    "IP × 资产",                                          "L1 / L2"],
    ["assetAuthed",  "资产级（已认证）· 用户 × 资产",  wsAssetAuthedNote(),                                   "L1 / L2 / L3"]
  ];
  return '<div class="card"><div class="card-h"><h3>阈值与维度<span class="sub">共享状态原子计数（滑动窗口 / 令牌桶）· 按集群统一计数</span></h3></div>' +
    '<div class="card-b"><div class="tbl-wrap"><table class="lst"><thead><tr><th style="width:44px">序号</th><th>维度</th><th style="width:190px">阈值</th><th>计数依据</th><th style="width:110px">突发容量</th><th style="width:120px">出厂默认档</th></tr></thead><tbody>' +
    rows.map(function (r, i) {
      var k = r[0], v = WS.rate[k];
      return '<tr><td class="mini">' + (i + 1) + '</td><td data-ws-dim="' + k + '">' + esc(r[1]) + '</td><td><input type="number" min="1" step="1" style="width:110px" aria-label="' + esc(r[1]) + ' 阈值（次/分钟）" data-ws-rate="' + k + '" value="' + v + '"> <span class="mini">次/分钟</span></td>' +
        '<td class="mini"' + (k === "assetAuthed" ? " data-ws-dimnote" : "") + ">" + esc(r[2]) + '</td><td class="mini" data-burst="' + k + '">' + wsBurst(v) + '</td><td class="mini">' + esc(r[3]) + "</td></tr>";
    }).join("") + "</tbody></table></div>" +
    '<div class="toolbar" style="margin-top:12px"><span class="mini">计数窗口</span><input type="number" min="1" step="1" style="width:90px" aria-label="计数窗口（秒）" data-ws-rate="windowSec" value="' + WS.rate.windowSec + '"><span class="mini">秒</span>' +
    '<span class="mini" style="margin-left:18px">超限动作</span>' + wsSeg("rateAction", ["拒绝", "延时", "仅记录"], WS.rate.action) + "</div>" +
    '<div class="note" data-ws-win-note>' + wsRateWinNote() + "</div>" +
    '<div class="note">排列顺序按<b>管理员配置时的心理顺序</b>：管控半径<b>由宽到窄</b> —— 网关级 → 登录级 → 资产级。维度集合与 PRD §F7.1 规则 6 一致，仅呈现次序不同。</div>' +
    '<div class="note blue" data-ws-quota-note>' + wsRateQuotaNote() + "</div>" +
    "</div></div>";
}
/* TAB② 覆盖：**两级联动**（级 1 资产级列表 → 级 2 该资产的条目清单）。
   2026-09-21 用户反馈「资产级 / 条目级两层覆盖这种交互太反人类；条目级不该从一个全局下拉里选，
   而且那个原生下拉框（datalist）样式很怪」⇒ 改为：条目级**从具体资产进入**，
   控件一律走设计系统内的就地数字输入，**不再用原生 <datalist> 全局候选**（脱离资产业主选条目既费解也易错配）。
   ⚠ 下钻态是**瞬时 UI 态**（`WSEAID`）：只重渲染本面板（`wsReRateCover`），不整页刷新、不动 TAB 态。 */
function wsPaneRateCover() {
  return WSEAID ? wsPaneEntryDrill(WSEAID) : wsPaneAssetCover();
}
/* 级 1：资产级覆盖列表（可批量设置）+ 每行「条目级」下钻入口 */
function wsPaneAssetCover() {
  var covR = wsRateCovAssets();                 /* ★ 第十七轮：按资产去重（旧实现按维度相加 ⇒ 一个资产算成两个） */
  return '<div class="card"><div class="card-h"><h3>资产级覆盖<span class="sub">覆盖层 L3 · 未认证与已认证两个维度各自独立覆盖</span></h3>' +
    '<div class="toolbar"><span class="mini">当前覆盖 <b data-ws-covr>' + covR + "</b> 个资产</span></div></div>" +
    '<div class="card-b">' + wsListBlock("r") +
    '<div class="note" data-ws-covernote>' + wsAssetCoverNote() + "</div>" +
    '<div class="note blue">条目级覆盖<b>从具体资产进入</b>：点行尾「条目级」下钻到该资产的接口条目清单，逐条设阈值。<b>不设全局条目下拉</b> —— 条目天然属于某个资产。</div></div></div>';
}
/* 级 2：该资产的条目清单（来源 = 该资产细粒度资源清单 F3.4，只读消费、不反向写入）。
   用**同一套列表器械**（搜索 / 只看已覆盖 / 计数 / 分页）—— 与紧邻的资产级列表、与详情页
   「细粒度资源清单」同口径（**8 条/页**，对齐该页 `PATH_PAGE=8`），不另造一张裸表。
   继承来源是**整张清单同源**（未认证 / 已认证两个维度各一个值），故上提为清单级说明；
   逐行重复既占列宽又无信息量（首版实测：28 行表格高 >1600px，出图被截断）。 */
function wsPaneEntryDrill(aid) {
  var a = wsAssetById(aid) || { id: aid, name: aid };
  var total = wsEntriesOf(aid).length, n = wsEntryCountOf(aid);
  var ovN = WS.assetRateAnon[aid], ovA = WS.assetRate[aid];
  var src = (ovN != null || ovA != null)
    ? "资产级覆盖：未认证 " + (ovN != null ? ovN + " 次/分钟" : "继承") + "；已认证 " + (ovA != null ? ovA + " 次/分钟" : "继承")
    : "平台继承：未认证继承；已认证 " + (a.lv <= 2 ? "关闭" : WS.rate.assetAuthed + " 次/分钟");
  return '<div class="card"><div class="card-h">' +
    '<button class="btn link" type="button" data-ws="wsEntryBack">← 返回资产覆盖列表</button>' +
    '<h3 style="margin:0 0 0 10px">条目级覆盖 · ' + esc(a.name) + '<span class="sub">覆盖层 L4 · 条目来源：该资产细粒度资源清单（F3.4），不重复维护</span></h3>' +
    '<div class="toolbar"><span class="mini">本资产条目 <b>' + total + "</b> 条 · 已覆盖 <b>" + n + "</b> 条</span></div></div>" +
    '<div class="card-b">' +
    '<div class="note">本清单条目<b>继承来源</b>：' + esc(src) + '。生效优先级 <b>条目级 &gt; 资产级 &gt; 平台继承</b>；留空 = 逐级回退，不产生「空覆盖」。' +
    '条目级用于<b>收紧</b>敏感写接口（如转账 / 导出）或<b>放宽</b>合法高频轮询接口。条目级设值对<b>未认证与已认证两个维度同时生效</b>（本原型条目级不按维度拆分）。</div>' +
    wsListBlock("e") +
    "</div></div>";
}
/* 只重渲染「覆盖」面板（TAB②）：保住 TAB 态与其余面板；
   级 1 / 级 2 的搜索 · 分页态分别由 `WSF.r` / `WSF.e` 持有 ⇒ 两级来回切换不丢筛选，也不新增一次性状态。 */
function wsReRateCover() {
  var pane = document.getElementById("wt-u2");
  if (!pane) return;
  pane.innerHTML = wsPaneRateCover();
  /* ⚠ 整表重建后**表头全选框**不会自读 WSSEL（wsListBody 只渲染空框），须显式 wsSyncSel 复位，
     否则「勾选 → 下钻再返回 / 保存」后，行仍是勾选态而表头却是未勾选 = 状态自相矛盾（第十六轮）。 */
  if (WSEAID) wsMountPager("e"); else { wsMountPager("r"); wsSyncSel("r"); }
  wsTabBadgeSync();
}
/* TAB③ 故障语义（只读）：共享状态不可用 / 粘性失效时**怎么处置** ——
   与本页「可配置的阈值」不同层，故单列一 TAB（与页① TAB④「命中与观测」同理）。 */
function wsPaneRateFault() {
  var rows = [
    ["<b>形态 B</b> 节点故障 / 滚动升级 / 重哈希致粘性重排", "<b>关键资产 fail-close</b>；窗口期收敛；<b>触发高优告警</b>（nonce 去重退化）"],
    ["<b>形态 C</b> owner 故障（副本在线）", "副本<b>秒级接管</b>、状态不丢 ⇒ <b>无重放窗口</b>（优于形态 B）"],
    ["<b>形态 C</b> 存活成员不足多数 / 网络分区", "<b>少数派拒写</b>（安全优先）；<b>关键资产 fail-close</b>；<b>触发高优告警</b>"],
    ["计数重置（形态 B 退化）", "短暂回到每节点本地计数；<b>总限额 ≈ 单点限额 × 节点数</b>，须在部署文档声明"],
    ["共享状态<b>不可用</b>（多节点）", "资产流量 <b>503</b>；仅最小 <code class=\"kr\">livez</code> / <code class=\"kr\">readyz</code> 端点保留"]
  ];
  return '<div class="card"><div class="card-h"><h3>故障语义<span class="sub">只读 · 本 TAB 无可配置项</span></h3></div>' +
    '<div class="card-b">' +
    '<div class="card-sect" style="border-top:0;padding-top:0"><h4>按部署形态分级</h4><span class="sub">安全优先：不足多数 / 分区一律拒绝写，不做 AP 放宽</span></div>' +
    '<div class="tbl-wrap"><table class="mtx lst"><thead><tr><th style="width:300px">触发</th><th>行为</th></tr></thead><tbody>' +
    rows.map(function (r) { return "<tr><td>" + r[0] + '</td><td class="mini">' + r[1] + "</td></tr>"; }).join("") +
    "</tbody></table></div>" +
    '<div class="note red"><b>fail-closed</b>：共享状态不可用时<b>所有资产流量 503</b>（判为不可信），<b>不静默放行</b>；仅保留最小 <code class="kr">livez</code> / <code class="kr">readyz</code> 端点供探活。</div>' +
    '<div class="note">反语义红线：限流<b>不得</b>在依赖不可用时静默放行（不得 fail-open）。</div>' +
    "</div></div>";
}
function wsHtmlRate() {
  return wsHead("pg-rate", "集群级限流", "F7.1 限流 —— 阈值与维度 / 覆盖（资产级 + 条目级）/ 故障语义；按集群统一计数，超限动作不含「观察」档", wsActions()) +
    wsPosNote("③", "网关级 / 登录级 / 资产级全局限流") +
    /* 计数载体 = 本页**前提**：只读、由部署形态决定 ⇒ 不进 TAB（与页①「检测面」同口径）。
       放在 TAB 之外的理由：切到任何 TAB 都必须能看到「计数在哪、为什么可信」。 */
    '<div class="note blue" style="margin-bottom:14px"><b>计数载体</b>（随部署形态，<b>均由网关自身承载</b>）：' +
      '<b>形态 A</b> 单节点 → 进程<b>本地内存</b>；<b>形态 B</b> 多节点 + 源 IP 粘性 → 状态在<b>实例内</b>（每节点限额近似）；' +
      '<b>形态 C</b> 多节点 + <b>内设共享</b>（无粘性）→ 随包内置、<b>全集群精确计数</b>。' +
      "<b>不引入独立部署的 Redis 等中间件</b>（客户 DMZ 约束）；不支持「多节点 + 无粘性 + 不用形态 C」的组合。</div>" +
    wsTabsNav("rate") +
    wsTabPane("rate", "u1", wsPaneRateThresh()) +
    wsTabPane("rate", "u2", wsPaneRateCover()) +
    wsTabPane("rate", "u3", wsPaneRateFault());
}

/* ===== 页 ③ 请求约束（F7.3） ===== */
function wsHtmlReq() {
  var methodHtml = WS_METHODS_ALL.map(function (m) {
    var locked = WS_METHODS_LOCK.indexOf(m) >= 0;
    var checked = locked || WS.req.methods.indexOf(m) >= 0;
    var dis = locked ? " disabled" : (m === "OPTIONS" ? " disabled" : "");
    var note = locked ? ' <span class="mini">默认允许，不可取消</span>'
      : (m === "OPTIONS" ? ' <span class="mini">按浏览器安全预检处理</span>' : "");
    return '<label style="display:inline-flex;align-items:center;gap:6px;margin:0 18px 8px 0">' +
      '<input type="checkbox" data-ws-method="' + m + '"' + (checked ? " checked" : "") + dis + ">" + m + note + "</label>";
  }).join("");
  var wm = WS.req.methods.filter(function (m) { return ["PUT", "PATCH", "DELETE"].indexOf(m) >= 0; });
  var nAff = wsAffectedAssets();
  return wsHead("pg-reqcon", "请求约束", "F7.3 请求约束 —— 体积 / 并发 / 方法白名单 / 下载限速；确定性物理限制，防资源滥用与 OOM", wsActions()) +
    wsPosNote("①", "URI 规范化 / 方法 / 请求体约束") +
    '<div class="card"><div class="card-h"><h3>体积与并发</h3></div>' +
      '<div class="card-b">' +
        '<div class="kv" style="margin-bottom:10px;grid-template-columns:150px auto 1fr"><span class="k">请求体上限</span><input type="number" min="1" step="1" style="width:110px" aria-label="请求体上限（MB）" data-ws-req="bodyMax" value="' + WS.req.bodyMax + '"><span class="mini">MB　超限 413 <code class="kr">BODY_TOO_LARGE</code></span></div>' +
        '<div class="kv" style="margin-bottom:10px;grid-template-columns:150px auto 1fr"><span class="k">登录端点请求体</span><b>16 KB</b><span class="mini">（固定，承 F1.1，不可配）</span></div>' +
        '<div class="kv" style="margin-bottom:10px;grid-template-columns:150px auto 1fr"><span class="k">单节点最大并发连接</span><input type="number" min="1" step="1" style="width:110px" aria-label="单节点最大并发连接" data-ws-req="connMax" value="' + WS.req.connMax + '"><span class="mini">达限 503 <code class="kr">CONNECTION_LIMITED</code> + <code class="kr">Retry-After</code>；<b>确定性拒绝，不排队</b></span></div>' +
        '<div class="note">合法大请求体超内存阈值写入<b>受限临时卷</b>；磁盘配额满 → <b>507 <code class="kr">TEMP_STORAGE_EXHAUSTED</code></b> + 告警，<b>不 OOM</b>。</div>' +
      "</div></div>" +
    '<div class="card"><div class="card-h"><h3>方法白名单与下载限速<span class="sub">PUT / PATCH / DELETE 须在资产接口清单登记并显式允许；TRACE / CONNECT 永久禁止</span></h3></div>' +
      '<div class="card-b">' +
        '<div>' + methodHtml + "</div>" +
        '<div class="note' + (nAff ? " red" : "") + '" style="margin-top:6px">当前已勾选写方法 ' + (wm.length ? "<b>" + wm.join(" / ") + "</b>" : "无") +
        "，将影响 <b>" + nAff + "</b> 个资产的接口准入（按细粒度资源清单登记的写方法统计）。未在资产接口清单登记的写方法不会被放行。</div>" +
        '<div class="kv" style="margin:14px 0 10px;grid-template-columns:150px auto 1fr"><span class="k">永久禁止方法</span><b>TRACE / CONNECT</b><span class="mini">（固定禁止，无开关）</span></div>' +
        '<div class="kv" style="grid-template-columns:150px auto auto 1fr"><span class="k">下载限速</span>' +
          '<label class="switch"><input type="checkbox" aria-label="启用下载限速" data-ws-swreq="download"' + (WS.req.download ? " checked" : "") + '><span class="sl"></span></label>' +
          '<input type="number" min="1" step="1" style="width:120px;margin-left:12px" aria-label="下载速率（KB/s）" data-ws-req="downloadRate" value="' + WS.req.downloadRate + '"' + (WS.req.download ? "" : " disabled") + '><span class="mini">KB/s</span>' +
          '<span class="mini" style="margin-left:14px">粒度</span>' + wsSeg("downloadScope", ["按资产", "按路径"], WS.req.downloadScope, !WS.req.download) +
        "</div>" +
        '<div class="note">下载限速<b>默认关闭</b>；开启后可选<b>限速粒度</b>（<b>按资产</b>或<b>按路径</b>）；本原型演示粒度切换，<b>速率值全局统一</b>（C-6）。</div>' +
      "</div></div>";
}

function renderWebSec() { var el = document.getElementById("pg-websec"); if (!el) return; if (!WS) wsLoad(); var y = wsScrollTop(); el.innerHTML = wsHtmlWaf(); wsMountPager("a"); wsMountPager("b"); wsMountPager("w"); wsMountPager("p"); wsSyncSel("a"); wsSyncSel("p"); wsScrollTo(y); }
function renderRate()   { var el = document.getElementById("pg-rate");   if (!el) return; if (!WS) wsLoad(); var y = wsScrollTop(); el.innerHTML = wsHtmlRate(); wsMountPager("r"); if (WSEAID) wsMountPager("e"); else wsSyncSel("r"); wsScrollTo(y); }
function renderReqCon() { var el = document.getElementById("pg-reqcon"); if (!el) return; if (!WS) wsLoad(); var y = wsScrollTop(); el.innerHTML = wsHtmlReq(); wsScrollTo(y); }

/* ---------- 4. 规则库管理 ---------- */

/* ★ 2026-09-23 第十七轮：页④ 的规则状态须与页① 的「内置基线」开关**联动**（跨文档 ⇒ 读同一 WS_KEY）。
   旧实现两条链路互不相干：页① 关掉 XSS 基线，页④ 仍标 XSS-2103「生效中」，两页自相矛盾。 */
function rlBaselineOff(cat) {
  var key = /^SQLi/i.test(cat) ? "sqli" : (/^XSS/i.test(cat) ? "xss" : (/^扫描器/.test(cat) ? "scanner" : ""));
  if (!key) return false;                                  /* 语义检测规则集无「基线开关」，恒参与 */
  var b = null;
  try { var s = JSON.parse(localStorage.getItem(WS_KEY) || "null"); b = s && s.baseline; } catch (e) { b = null; }
  if (!b) b = wsSeed().baseline;
  return b[key] === false;
}
function rlStages() {
  var names = ["导入", "签名校验", "灰度（观察）", "发布", "全量下发"], next = RL.stage + 1;
  return names.map(function (n, i) {
    var idx = i + 1, done = RL.stage >= idx;
    return '<span class="chip' + (done ? " on" : "") + '">' + idx + " · " + n + (idx === next ? "（下一步）" : "") + "</span>" +
      (idx < names.length ? ' <span class="mini">→</span> ' : "");
  }).join("");
}
/* ★ 2026-09-22 第二十一轮：规则库页精简重构（用户指令）。
   ① 「就一个版本库列表 + 当前版本标记 + 导入规则等必须的按钮」——非必要说明尽去；
   ② 「真正有意义的生效规则列表又没有」→ 补【生效规则】表（库内规则条目）；
   ③ 「具体规则只有名称，那具体内容呢？」→ 规则条目带【匹配特征】（库内预置，只读）+【检测位置】+【命中处置】；
   ④ 「操作链五步」「自定义覆盖」并进列表行 —— 五步链并进版本行、覆盖并进规则行；
   ⑤ 「适当采用 tab 页」+「两个列表都要分页」—— 页内 TAB（版本库 / 生效规则 / 设置与回滚），两表各自分页。
   数据模型 RL 不变（rules 取代旧 overrides）；分页态 RL._pgV / RL._pgR 为**瞬时态**（下划线前缀，不落盘）。 */
function rlHtml() {
  /* 库分区（2026-09-22 裁决）：本库只含 **WAF 域** 两区 —— ①WAF 特征库 ②语义检测规则集（均本期实装）。
     ③「客户端真实性判定特征集」/ ④「推理与基线规则」属**其他安全域**，**各自独立成库**（独立版本线 / 独立承载页），
     **不在本库**；本期仅登记、不实现（见本卡 note）。 */
  var libs = [
    ["WAF 特征库", "SQLi / XSS / 扫描器基线 + 版本化特征库（随平台版本交付 · SM2 签名下发）", true],
    ["语义检测规则集", "SQLi / XSS 语义级 + 参数污染", true]
  ].map(function (l) {
    return '<div class="kv" style="margin-bottom:8px;align-items:center;grid-template-columns:200px 1fr auto"><span class="k">' +
      esc(l[0]) + '</span><span class="v">' + esc(l[1]) + "</span>" +
      (l[2] ? '<span class="tag t-ok">实装</span>' : '<span class="tag t-gray">未激活</span>') + "</div>";
  }).join("");

  /* 未下发的规则包：并进版本库列表 —— 作为首行出现（五步链在行内 + 下一步按钮） */
  var pendRow = "";
  if (RL.pending && RL.stage >= 1 && RL.stage < 5) {
    var nx = { 1: ["rlVerify", "签名校验", ""], 2: ["rlGray", "进入灰度（观察）", ""], 3: ["rlPublish", "发布", ""], 4: ["rlRollout", "全量下发", " primary"] }[RL.stage] || null;
    pendRow = "<tr>" +
      "<td>" + esc(RL.pending) + ' <span class="tag t-info">未下发</span></td>' +
      '<td class="mini">—</td><td>—</td>' +
      "<td>" + (RL.stage >= 2 ? '<span class="tag t-ok">SM2 验签通过</span>' : '<span class="tag t-gray">待验签</span>') + "</td>" +
      '<td><div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px">' + rlStages() + "</div></td>" +
      "<td>" + (nx ? '<button class="btn' + nx[2] + '" type="button" data-rl="' + nx[0] + '">' + nx[1] + "</button> " : "") +
      '<button class="btn link" type="button" data-rl="rlCancel">撤销</button></td></tr>';
  }

  /* 版本行：当前版本在行内打标；点「生效规则」切到该版本的规则表；归档行给「回滚至此」 */
  var selVer = RL._selVer || RL.current;
  /* ★ 2026-09-23 第十六轮：归档版本 = **只读快照** —— 表头声称「版本 X」却允许逐条编辑，
     会让管理员误以为在改**历史版本**（实际改的是现行库）。自定义覆盖只作用于**当前生效版本**。 */
  var entRO = selVer !== RL.current;
  var pgV = Math.min(Math.max(1, RL._pgV || 1), Math.max(1, Math.ceil(RL.versions.length / RL_PAGE_V)));
  var vRows = RL.versions.slice((pgV - 1) * RL_PAGE_V, pgV * RL_PAGE_V).map(function (v) {
    var cur = v.v === RL.current, sel = v.v === selVer;
    return '<tr data-v="' + esc(v.v) + '">' +
      "<td>" + esc(v.v) + "</td>" +
      '<td class="mini">' + esc(v.at) + "</td>" +
      "<td>" + v.entries + "</td>" +
      "<td>" + (v.signed ? '<span class="tag t-ok">SM2 验签通过</span>' : '<span class="tag t-err">未验签</span>') + "</td>" +
      "<td>" + (cur ? '<span class="tag t-ok">当前生效</span>' : '<span class="tag t-gray">已归档</span>') + (sel ? ' <span class="tag t-info">查看中</span>' : "") + "</td>" +
      '<td><button class="btn link" type="button" data-rl="rlSelVer" data-v="' + esc(v.v) + '" aria-label="查看版本 ' + esc(v.v) + ' 的生效规则">生效规则</button>' +
      (cur ? "" : '<button class="btn link" type="button" data-rl="rlRollback" data-v="' + esc(v.v) + '" aria-label="回滚至版本 ' + esc(v.v) + '">回滚至此</button>') + "</td></tr>";
  }).join("");

  /* 生效规则（库内规则条目）：带匹配特征 / 检测位置 / 命中处置；编辑 / 停用即「自定义覆盖」 */
  var selEnt = (RL.versions.filter(function (v) { return v.v === selVer; })[0] || {}).entries || RL.entries;
  var pgR = Math.min(Math.max(1, RL._pgR || 1), Math.max(1, Math.ceil((RL.rules || []).length / RL_PAGE_R)));
  var rRows = (RL.rules || []).slice((pgR - 1) * RL_PAGE_R, pgR * RL_PAGE_R).map(function (r, i0) {
    var i = (pgR - 1) * RL_PAGE_R + i0;
    /* ★ 2026-09-23 第十七轮：规则状态须与页① 的**内置基线开关**联动（跨文档读同一 WS_KEY）——
       旧实现页① 关掉 XSS 基线、页④ 仍标 XSS-2103「生效中」，两页对同一规则自相矛盾。 */
    var st = !r.on ? '<span class="tag t-gray">已停用</span>'
      : (rlBaselineOff(r.cat) ? '<span class="tag t-warn">基线已关</span>'
      : (r.ov ? '<span class="tag t-info">已覆盖</span>' : '<span class="tag t-ok">生效中</span>'));
    return "<tr>" +
      '<td class="mini">' + esc(r.id) + "</td>" +
      "<td>" + esc(r.name) + "</td>" +
      '<td class="mini">' + esc(r.cat) + "</td>" +
      '<td class="mini" style="font-family:ui-monospace,Consolas,monospace;word-break:break-all">' + esc(r.pat || "—") + "</td>" +
      '<td class="mini">' + esc(r.loc || "—") + "</td>" +
      "<td>" + esc(r.disp || "继承库设定") + "</td>" +
      "<td>" + st + "</td>" +
      '<td>' + (entRO ? '<span class="mini">归档只读</span>' :
        '<button class="btn link" type="button" data-rl="rlRuleEdit" data-v="' + i + '" aria-label="编辑规则 ' + esc(r.id) + '">编辑</button>' +
        '<button class="btn link" type="button" data-rl="rlRuleToggle" data-v="' + i + '" aria-label="' + (r.on ? "停用" : "启用") + '规则 ' + esc(r.id) + '">' + (r.on ? "停用" : "启用") + "</button>") + "</td></tr>";
  }).join("");

  return '<div class="title-row">' +
    '<div><h2>规则库管理</h2><div class="muted" style="margin-top:4px">统一安全规则库（本期 WAF 特征库 / 语义检测规则集实装）· 特征库版本化 · SM2 签名下发</div></div>' +
    '<div class="toolbar"><button class="btn primary" type="button" data-rl="rlImport">导入规则包</button></div></div>' +
    '<div class="muted" style="margin:-6px 0 12px;font-size:12.5px">当前生效 <b>' + esc(RL.current) + '</b> · ' + esc(RL.publishedAt) + ' 发布 · ' + (RL.signed ? "SM2 验签通过" : "未验签") + ' · 条目 ' + RL.entries + ' · 近 7 日命中 预置 ' + RL.hit.preset + ' / 自定义覆盖 ' + RL.hit.custom + '</div>' +
    wsTabsNav("rulelib") +
    /* ── 面板 ① 版本库 ─────────────────────────────────────────── */
    wsTabPane("rulelib", "r1",
      '<div class="card"><div class="card-h"><h3>版本库<span class="sub">多版本并存 · 版本号单调递增 · 未下发即不生效</span></h3></div><div class="card-b">' +
        '<div class="tbl-wrap"><table class="lst"><thead><tr><th style="width:150px">版本</th><th style="width:140px">发布时间</th><th style="width:80px">条目数</th><th style="width:140px">签名</th><th>状态</th><th style="width:200px">操作</th></tr></thead><tbody>' +
        ((pendRow + vRows) || '<tr><td colspan="6" class="mini">尚无版本记录（未导入任何规则包）。</td></tr>') + "</tbody></table></div>" +
        '<div id="rlPgVer" style="margin-top:8px"></div>' +
        '<div class="note">导入为<b>二次确认</b>；<b>版本号须单调递增</b>（不得导入更旧或同版包）。流程：<b>导入 → 签名校验 → 灰度（观察）→ 发布 → 全量下发</b>，每步就绪后在该行内出现下一步按钮。<b>回滚不得以版本号倒退实现</b> —— 以<b>更高版本号重新签名下发</b>；<b>仅回滚库文件，不动已生成的策略</b>（策略属用户资产）。</div>' +
      "</div></div>") +
    /* ── 面板 ② 生效规则 ───────────────────────────────────────── */
    wsTabPane("rulelib", "r2",
      '<div class="card"><div class="card-h"><h3>生效规则<span class="sub">版本 ' + esc(selVer) + ' · 库内 ' + selEnt + ' 条（演示展示子集）' + (entRO ? ' · 归档只读' : ' · 可编辑即自定义覆盖') + '</span></h3></div><div class="card-b">' +
        '<div class="tbl-wrap"><table class="lst"><thead><tr><th style="width:110px">规则 ID</th><th>名称</th><th style="width:120px">类别</th><th style="width:340px">匹配特征</th><th style="width:110px">检测位置</th><th style="width:110px">命中处置</th><th style="width:110px">状态</th><th style="width:140px">操作</th></tr></thead><tbody>' + (rRows || '<tr><td colspan="8" class="mini">该版本无可展示的规则条目（演示仅展示子集）。</td></tr>') + "</tbody></table></div>" +
        '<div id="rlPgRule" style="margin-top:8px"></div>' +
        '<div class="note">本表为<b>演示子集</b>、<b>不随版本切片</b>（切换 / 回滚版本只改表头条目数与只读态，规则集仍为现行库子集）。「匹配特征」为<b>库内预置</b>（随库下发、只读）；管理员只能改<b>命中处置</b>或<b>启停</b>——即「<b>自定义覆盖</b>」，仅作用本网关、<b>库更新不覆盖</b>。与管理员在 Web 安全防护策略页自建的<b>自定义 PCRE</b> 规则互相独立（<b>不在本库、不随库下发</b>）。' + (entRO ? '当前查看的是<b>归档版本快照（只读）</b>；「自定义覆盖」只作用于<b>当前生效版本</b>。' : '') + '</div>' +
      "</div></div>") +
    /* ── 面板 ③ 设置与回滚 ─────────────────────────────────────── */
    wsTabPane("rulelib", "r3",
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px">' +
        '<div class="card"><div class="card-h"><h3>库分区<span class="sub">本库两类构成（WAF 域 · 均本期实装）</span></h3></div><div class="card-b">' + libs +
          '<div class="note">本库只承载<b>库</b>（特征库版本 / 签名 / 回滚）；管理员在 Web 安全防护策略页自建的正则规则（<b>自定义 PCRE</b>）属<b>站点自有规则</b>，<b>与特征库互相独立</b>，<b>不在本库、不随库下发</b>。<br><b>「客户端真实性判定特征集」「推理与基线规则」属其他安全域，各自独立成库（独立版本线 / 独立承载页），不在本库；本期仅登记，不实现。</b><br>库内规则的<b>状态</b>与 Web 安全防护策略页的<b>内置基线开关同源</b>：关闭某类基线后，该类规则在本页同步标「基线已关」。</div>' +
        "</div></div>" +
        '<div class="card"><div class="card-h"><h3>自动回滚<span class="sub">失败 / 误报率超阈自动回滚 + 告警</span></h3></div><div class="card-b">' +
          '<div class="kv" style="grid-template-columns:180px auto 1fr"><span class="k">误报率阈值</span><input type="number" min="1" step="1" max="100" style="width:100px" aria-label="误报率阈值（%）" data-rl-auto="1" value="' + RL.autoRollback + '"><span class="mini">%　超阈自动回滚以更高版本号重签，并推送高危告警</span></div>' +
          '<div class="note">无有效版本时网关按<b>原样放行</b> + 告警；连续中断达阈值自动<b>熔断</b>。规则库不替代一期裁决链，也不改变其 fail-closed 语义。</div>' +
        "</div></div>" +
      "</div>");
}

function renderRuleLib() {
  var el = document.getElementById("pg-rulelib");
  if (!el) return;
  if (!RL) rlLoad();
  var y = wsScrollTop();
  el.innerHTML = rlHtml();
  rlMountPagers();
  wsScrollTo(y);
}
/* 两表分页：pgmk 直接写进各自容器（面板隐藏时也写得进 DOM）⇒ 切 TAB 无需重挂。
   翻页入口必须是**全局函数名**（pgmk 以「函数名(页码)」生成 onclick）。 */
function rlMountPagers() {
  pgmk("#rlPgVer", RL.versions.length, RL._pgV || 1, "rlPgVer", "个版本", RL_PAGE_V, "分页只作用于本表");
  pgmk("#rlPgRule", (RL.rules || []).length, RL._pgR || 1, "rlPgRule", "条规则", RL_PAGE_R, "分页只作用于本表");
}
function rlPgVer(p) { RL._pgV = Math.max(1, p | 0); renderRuleLib(); }
function rlPgRule(p) { RL._pgR = Math.max(1, p | 0); renderRuleLib(); }

/* ---------- 5. 交互 ---------- */

/* 三个页面共享的动作 + 各自页面的重渲染入口 */
function wsRerenderAll() { renderWebSec(); renderRate(); renderReqCon(); }
function wsCurRender() {
  if (document.getElementById("pg-websec")) renderWebSec();
  else if (document.getElementById("pg-rate")) renderRate();
  else if (document.getElementById("pg-reqcon")) renderReqCon();
}

function wsAct(a, el) {
  if (a === "wsSave") {
    /* ★ 2026-09-23 第十八轮：覆盖计数**按当前页取数** —— 旧实现把页① 的「防护模式覆盖」与页② 的
       「资产级限流覆盖」相加报成同一个「资产级覆盖 N 项」⇒ 在页② 上只因改过页① 模式就虚报覆盖规模。 */
    var covLine = (document.getElementById("pg-rate"))
      ? "资产级限流覆盖 <b>" + (Object.keys(WS.assetRate).length + Object.keys(WS.assetRateAnon).length) + "</b> 项"
      : "防护模式覆盖 <b>" + Object.keys(WS.modeOverride).length + "</b> 项";
    confirmDlg("保存并生效", "将把当前配置推送至全部网关节点，最迟 <b>120s</b> 收敛：<br>" + covLine + " · 条目级覆盖 <b>" + (WS.entryCov || []).length + "</b> 条 · 自定义 PCRE <b>" + WS.pcre.length + "</b> 条 · IP 名单 <b>" + (WS.black.length + WS.white.length) + "</b> 条。<br>阈值类<b>热生效</b>；WAF 规则类走<b>受控版本发布</b>、滚动生效。<b>本次变更入审计</b>。",
      function () { wsSaveStore(); wsCurRender(); toast("已保存并生效（演示）"); }, "保存并生效");
    return;
  }
  if (a === "wsReset") {
    /* 2026-09-21 第十四轮：恢复出厂默认 = **最高影响面**的破坏性操作 ⇒ 走**二次认证**
       （对齐「资产访问控制策略」页 ask2FA 的四入口统一口径：敏感变更须先完成身份再确认；取消不产生变更）。 */
    wsAsk2FA("恢复出厂默认", "将清空所有覆盖（资产模式 / 资产级限流 / 条目级 / IP 名单 / 自定义 PCRE），回到按安全等级出厂默认。<b>此操作入审计</b>。", function () {
      WSEAID = null; WSF = {}; WSSEL = {}; WS = wsSeed(); wsSaveStore(); wsCurRender(); toast("已恢复出厂默认（演示）");   /* ★ 第十八轮：一并复位**瞬时筛选 / 选择态**（旧实现只换数据，界面仍停在筛后视图与残留勾选） */
    });
    return;
  }
  if (a === "wsCheck") { wsRunCheck(); return; }
  if (a === "wsClearF") {                                       /* 空态「一键清空筛选条件」（对齐 aspEmptyRow） */
    var ck = el.getAttribute("data-v");
    if (ck) {
      var cf = wsF(ck); cf.k = ""; cf.only = false; cf.p = 1;
      var ci = document.getElementById("wsK_" + ck); if (ci) ci.value = "";
      wsReList(ck); toast("已清空筛选条件（演示）");
    }
    return;
  }
  if (a === "wsPcreToggle") {                                   /* 行内启停：停用检测规则属敏感变更 ⇒ 二次确认 */
    var pi = Number(el.getAttribute("data-v"));
    if (isNaN(pi) || !WS.pcre[pi]) return;
    var turnOn = WS.pcre[pi].on === false, pn = WS.pcre[pi].name;
    if (!turnOn) {
      confirmDlg("停用自定义规则", "停用 <b>" + esc(pn) + "</b> 后该规则<b>不再参与攻击检测</b>（规则保留、可随时启用）。变更走受控版本发布、滚动生效。<b>本次变更入审计</b>。确认停用？", function () {
        WS.pcre[pi].on = false; wsSaveStore(); wsReList("p"); toast("规则已停用（演示）");
      }, "确认停用");
      return;
    }
    WS.pcre[pi].on = true; wsSaveStore(); wsReList("p"); toast("规则已启用（演示）");
    return;
  }
  if (a === "wsBatch") { openBatchDlg(el.getAttribute("data-v")); return; }
  if (a === "wsSelNone") {
    var sk = el.getAttribute("data-v");
    if (sk) { wsSelClear(sk); wsReList(sk); toast("已清空选择（演示）"); }
    return;
  }
  if (a === "wsIpImp") { openIpImpDlg(el.getAttribute("data-v")); return; }
  if (a === "wsIpExp") { openIpExpDlg(el.getAttribute("data-v")); return; }
  if (a === "wsModeReset") {
    var mid = el.getAttribute("data-v");
    if (mid) { delete WS.modeOverride[mid]; wsSaveStore(); wsReList("a"); toast("已恢复继承（演示）"); }
    return;
  }
  if (a === "wsIpAdd") {
    var kind = el.getAttribute("data-v"), isB = kind === "b";
    var inp = $("#wsIpIn_" + kind), noteIn = $("#wsIpNo_" + kind), scSel = $("#wsIpSc_" + kind);
    var v = (inp && inp.value || "").trim();
    if (!v) { markBad(inp, true); toast("请输入 IP 地址或网段"); return; }
    if (!wsIpOk(v)) { markBad(inp, true); toast("IP / CIDR 格式不正确"); return; }
    var arr = isB ? WS.black : WS.white;
    if (arr.some(function (e) { return e.v === v; })) { markBad(inp, true); toast("该条目已存在"); return; }
    var scope = scSel ? scSel.value : "平台级";
    var note = (noteIn && noteIn.value || "").trim();
    var push = function () {
      arr.push({ v: v, ver: wsIpVer(v), scope: scope, note: note, at: WS_DATE, op: wsOp() });
      wsSaveStore(); wsCurRender(); toast("已加入" + (isB ? "黑名单" : "白名单") + "：" + v + "（演示）");
    };
    if (!isB) {
      confirmDlg("加入白名单", "白名单<b>只跳过攻击特征检测</b>，<b>不等于放行</b>：限流、主体认证、资产访问状态、ABAC、请求约束与审计<b>照常执行</b>。确认加入 <b>" + esc(v) + "</b>（生效范围：" + esc(scope) + "）？", push, "确认加入");
      return;
    }
    push(); return;
  }
  if (a === "wsIpDel") {
    var k2 = el.getAttribute("data-v"), vv = el.getAttribute("data-i"), arr2 = k2 === "b" ? WS.black : WS.white;
    var i2 = -1; for (var q = 0; q < arr2.length; q++) { if (arr2[q].v === vv) { i2 = q; break; } }
    if (i2 < 0) return;
    /* ★ 2026-09-21 第十二轮：移除名单条目**属破坏性动作**（黑名单移除 = 不再阻断该来源；
       白名单移除 = 不再跳过特征检测）。原实现点了即删、无二次确认 —— 与同页「白名单加入」
       的二次确认、以及自定义 PCRE 的「删除」确认**口径不一致**（探针实测该分支无确认）。 */
    confirmDlg("移除" + (k2 === "b" ? "黑名单" : "白名单") + "条目",
      "将移除 <b>" + esc(vv) + "</b>。" +
      (k2 === "b" ? "移除后该来源<b>不再被阻断</b>（回到常规检测）。" : "移除后该来源<b>不再跳过攻击特征检测</b>。") +
      "<b>本次变更入审计</b>。确认移除？",
      function () {
        for (var q2 = 0; q2 < arr2.length; q2++) { if (arr2[q2].v === vv) { arr2.splice(q2, 1); break; } }
        wsSaveStore(); wsCurRender(); toast("已移除：" + vv + "（演示）");
      }, "确认移除");
    return;
  }
  if (a === "wsPcreAdd") { openPcreDlg(); return; }
  if (a === "wsPcreDel") {
    var i3 = Number(el.getAttribute("data-v"));
    if (isNaN(i3)) return;
    /* ★ 2026-09-23 第十七轮：① 删除会连**选择态**一起留下（WSSEL.p 按规则名记）⇒ 计数虚高、表头全选错乱；
       ② 旧文案自相矛盾（既说「立即失效」又说「滚动生效」）。此处一并收敛。 */
    var delName = (WS.pcre[i3] || {}).name;
    confirmDlg("删除自定义规则", "删除后该规则立即失效、<b>不可恢复</b>；变更走受控规则版本发布，<b>滚动生效</b>。<b>本次变更入审计</b>。确认删除？", function () {
      WS.pcre.splice(i3, 1);
      if (delName && WSSEL.p) delete WSSEL.p[delName];
      wsSaveStore(); renderWebSec(); toast("自定义规则已删除（演示）");
    }, "删除");
    return;
  }
  if (a === "wsGotoLib") { goPage("pg-rulelib"); return; }
  /* 条目级覆盖：**按资产下钻**（2026-09-21 用户反馈「不该用全局下拉选条目」）。
     `wsEntryOpen` 进入级 2 / `wsEntryBack` 回级 1 / `wsEntryDel` 按 key（aid|rid|path）恢复继承。 */
  if (a === "wsEntryOpen") { var eo = el.getAttribute("data-v"); if (eo) { WSEAID = eo; wsF("e").k = ""; wsF("e").only = false; wsF("e").p = 1; wsReRateCover(); } return; }
  if (a === "wsEntryBack") { WSEAID = null; wsReRateCover(); return; }
  if (a === "wsEntryDel") {
    var ek = el.getAttribute("data-v");
    if (ek) {
      WS.entryCov = (WS.entryCov || []).filter(function (e) { return e.key !== ek; });
      wsSaveStore(); wsReRateCover(); toast("已恢复继承（演示）");
    }
    return;
  }
  if (a === "wsARateReset") {
    var aid = el.getAttribute("data-v"), ak = el.getAttribute("data-k");
    if (aid) {
      if (ak === "anon") delete WS.assetRateAnon[aid]; else delete WS.assetRate[aid];
      wsSaveStore(); wsReList("r"); toast("已恢复继承（演示）");
    }
    return;
  }
}
/* ---------- 2026-09-21 第十四轮：二次认证 / 防护体检（对齐参考页 ask2FA / polCheck） ---------- */

/* 二次认证：敏感变更（恢复出厂默认 / 规则库全量下发）的身份再确认。
   认证方式取自「认证方式字典」（默认口令再认证 L2）；凭据仅用于本次身份确认、不落库、不记审计明细；
   取消不产生任何变更。演示环境：凭据非空即通过（与参考页同口径）。 */
function wsAsk2FA(op, note, ok) {
  var html = '<div class="fld" style="margin-bottom:10px"><label>认证方式</label>' +
    '<div class="note" style="margin:0">口令再认证（L2）· 取自「认证方式字典」</div></div>' +
    '<div class="fld"><label>再认证口令 <span class="req">*</span></label><input type="password" id="ws2faPwd" placeholder="输入口令以确认身份">' +
    '<div class="help">凭据仅用于本次身份确认，<b>不落库、不记入审计明细</b>；演示环境非空即通过。</div></div>' +
    (note ? '<div class="note">' + note + '</div>' : '');
  openDlg("二次认证", "「" + op + "」属敏感变更，需先完成二次认证确认身份；认证通过后操作才执行，取消不产生任何变更。", html);
  $("#dlg1Ok").textContent = "验证并执行";
  $("#dlg1Ok").onclick = function () {
    var p = $("#ws2faPwd");
    if (!String(p.value || "").trim()) { markBad(p, true); toast("请输入再认证口令（演示环境非空即通过）"); return; }
    closeDlg(); ok();
  };
  $("#dlg1No").textContent = "取消";
}

/* IP 归约为「网络地址 + 前缀」的可比较键（供体检做重叠 / 包含判定）——纯算术，不依赖正则 */
function wsIpKey(v) {
  var s = String(v || "").trim(); if (!s) return null;
  var slash = s.indexOf("/"); var addr = slash >= 0 ? s.slice(0, slash) : s;
  var pf = slash >= 0 ? Number(s.slice(slash + 1)) : null;
  if (addr.indexOf(":") >= 0) {                                  /* IPv6：展开 8 组，按前缀保留整组（每组 16 位） */
    var parts = addr.split("::");
    var head = parts[0] ? parts[0].split(":") : [];
    var tail = (parts.length > 1 && parts[1]) ? parts[1].split(":") : [];
    var fill = 8 - head.length - tail.length; if (fill < 0) fill = 0;
    var full = head.slice(); for (var f = 0; f < fill; f++) full.push("0"); full = full.concat(tail);
    var bits6 = pf == null ? 128 : pf; var keep = Math.ceil(bits6 / 16); var seg = [];
    for (var i = 0; i < keep && i < 8; i++) seg.push(String(parseInt(full[i] || "0", 16) || 0));
    return { v6: true, parts: seg.join("."), bits: bits6 };
  }
  var p = addr.split("."); if (p.length !== 4) return null;
  var n = 0; for (var j = 0; j < 4; j++) { var o = Number(p[j]); if (!isFinite(o) || o < 0 || o > 255) return null; n = n * 256 + o; }
  var bits = pf == null ? 32 : pf; if (bits < 0 || bits > 32) return null;
  var size = Math.pow(2, 32 - bits);
  return { v6: false, hi: n - (n % size), bits: bits, size: size };
}
function wsIpOverlap(a, b) {
  if (!a || !b || a.v6 !== b.v6) return false;
  if (a.v6) {                                                    /* IPv6：组串前缀包含即视为重叠（近似） */
    var x = a.parts, y = b.parts;
    return x === y || x.indexOf(y + ".") === 0 || y.indexOf(x + ".") === 0;
  }
  return Math.abs(a.hi - b.hi) < Math.max(a.size, b.size);
}
/* 防护体检（**只读**）：把可疑点摆出来，**不自动改写任何配置** —— 与参考页 polCheck 同口径。 */
function wsRunCheck() {
  if (!WS) wsLoad();
  var krc = function (v) { return '<code class="kr">' + esc(v) + '</code>'; };
  var blk = function (title, n, inner, emptyText) {
    return '<div style="margin-top:14px"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:13px">' + title + '</b>' +
      (n ? '<span class="tag t-warn">' + n + ' 项</span>' : '<span class="tag t-ok">未检出</span>') + '</div>' +
      '<div style="font-size:12.5px;color:var(--txt2);line-height:1.7;margin-top:6px">' + (n ? inner : emptyText) + '</div></div>';
  };
  /* ① 名单重叠 / 包含（含「白名单落在黑名单网段内 ⇒ 黑名单优先、白名单实际不生效」） */
  var ipHits = [];
  var scan = function (arr, label) {
    for (var i = 0; i < arr.length; i++) for (var j = i + 1; j < arr.length; j++) {
      if (wsIpOverlap(wsIpKey(arr[i].v), wsIpKey(arr[j].v)))
        ipHits.push('<b>' + esc(label) + '</b> 内 ' + krc(arr[i].v) + ' 与 ' + krc(arr[j].v) + ' 存在重叠 / 包含');
    }
  };
  scan(WS.black, "黑名单"); scan(WS.white, "白名单");
  WS.white.forEach(function (w) { WS.black.forEach(function (b) {
    if (wsIpOverlap(wsIpKey(w.v), wsIpKey(b.v)))
      ipHits.push(krc(w.v) + '（白名单）落在 ' + krc(b.v) + '（黑名单）网段内 —— <b>黑名单优先</b>，该白名单<b>实际不生效</b>');
  }); });
  /* ② 自定义 PCRE：重名 / 重复正则 / 失效正则（复用 wsPcreCheck 这一校验真源） */
  var pm = {}; WS.pcre.forEach(function (r) { var k = String(r.name || "").trim(); if (k) (pm[k] = pm[k] || []).push(r); });
  var pDupName = Object.keys(pm).filter(function (k) { return pm[k].length > 1; });
  var seenRe = {}; var pDupRe = [];
  WS.pcre.forEach(function (r) { var k = String(r.re || ""); if (seenRe[k]) pDupRe.push(r); else seenRe[k] = 1; });
  var pBad = WS.pcre.map(function (r) { return { r: r, why: wsPcreCheck(r.re) }; }).filter(function (x) { return !!x.why; });
  var pN = pDupName.length + pDupRe.length + pBad.length, pInner = "";
  pDupName.forEach(function (k) { pInner += '<div class="note red" style="margin-top:6px">规则名 <b>' + esc(k) + '</b> 重复 ' + pm[k].length + ' 次 —— 名称是清单 / 审计 / 告警的定位键。</div>'; });
  pDupRe.forEach(function (r) { pInner += '<div class="note" style="margin-top:6px"><b>' + esc(r.name) + '</b> 的正则与另一条完全重复，可合并或删除一条。</div>'; });
  pBad.forEach(function (x) { pInner += '<div class="note red" style="margin-top:6px"><b>' + esc(x.r.name) + '</b>：' + esc(x.why) + '</div>'; });
  /* ③ 悬空覆盖（指向已不存在的资产） */
  var dangling = [];
  Object.keys(WS.modeOverride).forEach(function (aid) { if (!wsAssetById(aid)) dangling.push("单资产防护模式覆盖 → 资产 " + aid); });
  Object.keys(WS.assetRate).forEach(function (aid) { if (!wsAssetById(aid)) dangling.push("资产级（已认证）覆盖 → 资产 " + aid); });
  Object.keys(WS.assetRateAnon).forEach(function (aid) { if (!wsAssetById(aid)) dangling.push("资产级（未认证）覆盖 → 资产 " + aid); });
  (WS.entryCov || []).forEach(function (e) { if (!wsAssetById(wsEntryAid(e.key))) dangling.push("条目级覆盖 → 资产 " + wsEntryAid(e.key)); });
  var covN = Object.keys(WS.modeOverride).length + Object.keys(WS.assetRate).length + Object.keys(WS.assetRateAnon).length + (WS.entryCov || []).length;
  /* ★ 2026-09-23 第十七轮：内置基线被关闭是**显著降低防护**的动作，体检须摆出来（旧实现三项检查全不含基线）。 */
  var baseOffK = ["sqli", "xss", "scanner"].filter(function (k) { return WS.baseline[k] === false; });
  var total = ipHits.length + pN + dangling.length + baseOffK.length;
  confirmDlg("防护体检", '<div class="mini">体检结果<b>仅供判断</b>，本面板<b>不修改任何配置</b>：只把可疑点摆出来。当前 IP 名单 ' + (WS.black.length + WS.white.length) +
    ' 条 · 自定义 PCRE ' + WS.pcre.length + ' 条 · 覆盖 ' + covN + ' 项' + (total ? ' · <b>疑似问题 ' + total + ' 处</b>' : ' · 未检出问题') + '</div>' +
    blk("名单重叠 / 包含", ipHits.length, ipHits.map(function (x) { return '<div class="note" style="margin-top:6px">' + x + '</div>'; }).join(""), "黑名单与白名单内部均无重叠；也无白名单条目被黑名单网段覆盖。") +
    blk("自定义 PCRE 规则", pN, pInner, "规则名称唯一、正则互不重复、且均通过保存期校验。") +
    blk("悬空覆盖", dangling.length, dangling.map(function (x) { return '<div class="note red" style="margin-top:6px">' + esc(x) + '（资产已不存在，该覆盖永不生效）</div>'; }).join(""), "全部覆盖均指向已登记资产，无悬空引用。") +
    blk("内置基线", baseOffK.length, baseOffK.map(function (k) { return '<div class="note red" style="margin-top:6px">' + k.toUpperCase() + ' 基线<b>已关闭</b> —— 该类攻击在特征级不再被识别，防护显著降低。</div>'; }).join(""), "SQLi / XSS / 扫描器三项内置基线均为开启。") +
    '<div class="mini" style="margin-top:14px">IP 重叠按 IPv4 数值区间 / IPv6 前缀组判定，为<b>疑似提示</b>；IPv6 为近似判定。</div>',
    null, "关闭");
  /* 只读面板：隐藏「取消」键（与参考页 polCheck 同口径 —— 面板不改配置，只需一个「关闭」）。 */
  var noB = document.querySelector("#dlgCfm [data-act='cfmNo']"); if (noB) noB.style.display = "none";
}
function wsSegPick(name, v) {
  if (name === "listScope") { WS.listScope = v; wsSaveStore(); renderWebSec(); toast(v === "平台级+资产级" ? "已启用资产级名单：可把条目挂到单个资产（演示）" : "已切换为仅平台级名单（演示）"); return; }
  if (name === "rateAction") { WS.rate.action = v; wsSaveStore(); renderRate(); return; }
  if (name === "downloadScope") { if (!WS.req.download) return; WS.req.downloadScope = v; wsSaveStore(); renderReqCon(); return; }
  if (name.indexOf("wsMode:") === 0) {
    var aid = name.slice("wsMode:".length);
    if (v === "继承") delete WS.modeOverride[aid]; else WS.modeOverride[aid] = v;
    wsSaveStore(); renderWebSec();
    toast(v === "继承" ? "已恢复继承（演示）" : "单资产模式已覆盖为「" + v + "」（演示）");
    return;
  }
}
function wsOnClick(e) {
  /* 顶部子页切换条：跨页统一走 goPage（与全站其它入口同口径，跳转前落盘演示数据）；
     当前子页按钮不再跳转（避免无谓刷新 —— .pg 已经是它）。 */
  var subEl = e.target.closest ? e.target.closest("[data-ws-sub]") : null;
  if (subEl) { var tgt = subEl.getAttribute("data-ws-sub"); if (tgt && tgt !== PG_CUR) goPage(tgt); return; }
  /* 页① 页内 TAB：只切显隐、**不重渲染**（保住各 TAB 内列表的分页 / 筛选 / 勾选态与滚动位置） */
  var tabEl = e.target.closest ? e.target.closest("[data-wt]") : null;
  if (tabEl) {
    var tbar = tabEl.closest ? tabEl.closest('[role="tablist"][data-tbg]') : null;
    var tg = tbar ? tbar.getAttribute("data-tbg") : "waf";
    var wk = tabEl.getAttribute("data-wt");
    if (wk && TAB_GROUPS[tg] && wk !== TAB_GROUPS[tg].get()) wsTabShow(wk, tg);
    return;
  }
  var segEl = e.target.closest ? e.target.closest("[data-ws-seg]") : null;
  if (segEl) { var b = e.target.closest("button"); if (b) { wsSegPick(segEl.getAttribute("data-ws-seg"), b.getAttribute("data-v")); return; } }
  var act = e.target.closest ? e.target.closest("[data-ws]") : null;
  if (act) { wsAct(act.getAttribute("data-ws"), act); }
}
/* 搜索框：输入即筛（防抖 260ms），只重渲染表体 ⇒ 输入焦点不丢 */
function wsOnInput(e) {
  var t = e.target;
  if (!t || !t.getAttribute) return;
  var fk = t.getAttribute("data-ws-fk");
  if (!fk) return;
  clearTimeout(t._wst);
  t._wst = setTimeout(function () { wsF(fk).k = String(t.value || "").trim(); wsF(fk).p = 1; wsSelClear(fk); wsReList(fk); }, 260);   /* ★ 第十八轮：筛选即清勾选（与翻页同口径「勾选限定当前结果集」） */
}
function wsOnChange(e) {
  var t = e.target;
  if (!t || !t.getAttribute) return;
  if (t.getAttribute("data-ws-fk")) return;                       /* 搜索框交由 wsOnInput */
  var sa = t.getAttribute("data-ws-selall");
  if (sa) {                                                       /* 表头全选 / 取消全选本页：只改瞬时态 + 就地同步 */
    var pids = wsPageIds(sa);
    if (t.checked) pids.forEach(function (id) { wsSel(sa)[id] = true; }); else wsSelClear(sa);
    [].slice.call(document.querySelectorAll('[data-ws-sel="' + sa + '"]')).forEach(function (c) { c.checked = !!wsSel(sa)[c.getAttribute("data-v")]; });
    wsSyncSel(sa);
    return;
  }
  var sel = t.getAttribute("data-ws-sel");
  if (sel) {                                                      /* 批量选择：只改瞬时态 + 同步计数，不重渲染表体（保住滚动位置） */
    var sid = t.getAttribute("data-v");
    if (sid) { if (t.checked) wsSel(sel)[sid] = true; else delete wsSel(sel)[sid]; }
    wsSyncSel(sel);                                               /* 同步表头全选 / 半选 + 批量可用性（不重渲染表体） */
    return;
  }
  var fo = t.getAttribute("data-ws-fo");
  if (fo) { wsF(fo).only = !!t.checked; wsF(fo).p = 1; wsSelClear(fo); wsReList(fo); return; }
  if (t.getAttribute("data-ws-sw")) {
    var k = t.getAttribute("data-ws-sw");
    if (!t.checked) {
      t.checked = true;   /* 先复原，待确认后再关 */
      confirmDlg("关闭基线检测", "关闭 <b>" + k.toUpperCase() + " 基线</b>将<b>显著降低防护</b>：该类攻击在特征级不再被识别。确认关闭？", function () {
        WS.baseline[k] = false; wsSaveStore(); renderWebSec(); toast("已关闭 " + k.toUpperCase() + " 基线（演示）");
      }, "确认关闭");
      return;
    }
    WS.baseline[k] = true; wsSaveStore(); renderWebSec(); return;   /* ★ 第十八轮：重新开启也须重渲染 —— 否则 TAB③「已关闭基线」红字残留、与页④「生效中」自相矛盾 */
  }
  if (t.getAttribute("data-ws-swreq") === "download") { WS.req.download = t.checked; wsSaveStore(); renderReqCon(); return; }
  if (t.getAttribute("data-ws-method")) {
    var m = t.getAttribute("data-ws-method");
    if (WS_METHODS_LOCK.indexOf(m) >= 0) { t.checked = true; return; }
    var willOn = !!t.checked;
    /* ★ 2026-09-21 第十二轮：写方法登记须二次确认。**状态只在确认后落库** ——
       旧实现先改 `WS.req.methods` 再弹确认，点「取消」不回滚 ⇒ 取消 = 无效
       （探针 A6.3 实测：取消后 methods 仍含 PUT、复选框仍勾选）。
       与相邻的「放宽体积 / 并发」分支同口径：**未确认前先复原显示**，仅确认后写状态。 */
    if (["PUT", "PATCH", "DELETE"].indexOf(m) >= 0) {
      t.checked = !willOn;
      confirmDlg("登记写方法", "<b>" + m + "</b> 须在<b>资产接口清单登记并显式允许</b>后方可用于相应资产。" +
        (willOn ? "确认登记该方法？" : "确认取消登记该方法？") + "<b>本次变更入审计</b>。", function () {
          if (willOn) { if (WS.req.methods.indexOf(m) < 0) WS.req.methods.push(m); }
          else { WS.req.methods = WS.req.methods.filter(function (x) { return x !== m; }); }
          wsSaveStore(); renderReqCon(); toast(m + (willOn ? " 已登记（演示）" : " 已取消登记（演示）"));
        }, willOn ? "确认登记" : "确认取消");
      return;
    }
    if (WS.req.methods.indexOf(m) >= 0) WS.req.methods = WS.req.methods.filter(function (x) { return x !== m; });
    else WS.req.methods.push(m);
    wsSaveStore(); renderReqCon(); return;
  }
  var rate = t.getAttribute("data-ws-rate"), req = t.getAttribute("data-ws-req"), ar = t.getAttribute("data-ws-arate"), er = t.getAttribute("data-ws-erate");
  if (rate) {
    if (!wsIntOk(t.value)) { markBad(t, true); t.value = WS.rate[rate]; toast("阈值须为 ≥1 的整数"); return; }
    var n = Math.floor(Number(t.value));
    /* ★ 2026-09-21 第十二轮：额度关系（同「来源 IP」依据下 **外层 ≥ 内层**）在**编辑路径**也要守。
       页面 note 明写「外层必须不低于内层」，而 Q35 只守 seed 值、不守编辑 —— 旧实现可把
       网关 CC 直接改成 100（< 登录 · 来源 IP 10000）并静默写入 ⇒ 文案与数据**自相矛盾**，
       且内层阈值永远无法触发（死配置）。仅对「来源 IP」这一同依据的两维比较；
       账号维按失败计数、资产级按 IP/用户 × 资产，口径不同，不参与比较。 */
    if (rate === "gatewayCc" || rate === "loginIp") {
      var outer = rate === "gatewayCc" ? n : WS.rate.gatewayCc;
      var inner = rate === "loginIp" ? n : WS.rate.loginIp;
      if (outer < inner) {
        markBad(t, true); t.value = WS.rate[rate];
        toast("额度关系：网关 CC（" + outer + "）不得低于登录 · 来源 IP（" + inner + " 次/分钟），否则内层永远无法触发");
        return;
      }
    }
    WS.rate[rate] = n; wsSaveStore();
    var b2 = document.querySelector('[data-burst="' + rate + '"]'); if (b2) b2.textContent = wsBurst(n);
    /* ★ 2026-09-23 第十七轮：含阈值数值的说明**就地刷新** —— 说明与数据必须同步，不得等下次重渲染。
       ★ 2026-09-23 第十八轮：**补全** TAB② 覆盖卡 note 与计数窗口说明（旧实现只刷 TAB① 三处，
       改 assetAuthed / windowSec 后同屏说明仍述旧值）；覆盖面板若在 DOM 则一并重绘（不整页刷新、不动 TAB 态）。 */
    var dn2 = document.querySelector("[data-ws-dimnote]"); if (dn2) dn2.textContent = wsAssetAuthedNote();
    var qn2 = document.querySelector("[data-ws-quota-note]"); if (qn2) qn2.innerHTML = wsRateQuotaNote();
    var wn2 = document.querySelector("[data-ws-win-note]"); if (wn2) wn2.innerHTML = wsRateWinNote();
    var cv2 = document.querySelector("[data-ws-covernote]"); if (cv2) cv2.innerHTML = wsAssetCoverNote();
    if (document.getElementById("wt-u2")) wsReRateCover();
    return;
  }
  if (req) {
    if (!wsIntOk(t.value)) { markBad(t, true); t.value = WS.req[req]; toast("该值须为 ≥1 的整数"); return; }
    var n2 = Math.floor(Number(t.value));
    /* ★ 2026-09-23 第十七轮：放宽**下载速率**与放宽体积 / 并发同属「扩大资源占用面」，口径须一致
       （旧实现只有 bodyMax / connMax 走确认，downloadRate 直接落库）。 */
    var rWiden = (req === "bodyMax" && n2 > WS.req.bodyMax) || (req === "connMax" && n2 > WS.req.connMax) || (req === "downloadRate" && n2 > WS.req.downloadRate);
    if (rWiden) {
      t.value = WS.req[req];   /* 未确认前先复原显示，避免「展示值与状态不一致」 */
      var rName = req === "bodyMax" ? "请求体上限" : (req === "connMax" ? "并发上限" : "下载速率");
      confirmDlg("放宽限制", "将 " + rName + " 放宽至 <b>" + n2 + "</b>，会扩大资源占用面。确认放宽？", function () {
        WS.req[req] = n2; wsSaveStore(); renderReqCon(); toast("已更新（演示）");
      }, "确认放宽");
      return;
    }
    WS.req[req] = n2; wsSaveStore(); return;
  }
  if (ar) {
    var arK = t.getAttribute("data-k"), arStore = arK === "anon" ? WS.assetRateAnon : WS.assetRate;
    var n3 = String(t.value).trim();
    if (!n3) { delete arStore[ar]; wsSaveStore(); wsReList("r"); return; }
    var nv = Number(n3);
    if (!wsIntOk(n3)) { markBad(t, true); t.value = arStore[ar] != null ? arStore[ar] : ""; toast("覆盖阈值须为 ≥1 的整数"); return; }
    nv = Math.floor(nv);
    arStore[ar] = nv; wsSaveStore(); wsReList("r");
    toast("资产级限流已覆盖为 " + nv + " 次/分钟（" + (arK === "anon" ? "未认证 · IP × 资产" : "已认证 · 用户 × 资产") + "）（演示）");
    return;
  }
  if (er) {                                                       /* 条目级覆盖（级 2 下钻内就地设值，键 = aid|rid|path） */
    /* ★ 2026-09-23 第十七轮：旧实现**先删后校验** —— 非法输入（0 / 1.5 / abc）会把该条目**原有覆盖直接删除**，
       失败分支既不落盘也不重渲染 ⇒ 内存与 localStorage 分叉、敏感写接口失去收紧配置。改为**校验前置**（对齐 ar 分支）。 */
    var erRaw = String(t.value).trim();
    if (!erRaw) {                                                   /* 留空 = 恢复继承（不写「空覆盖」） */
      WS.entryCov = (WS.entryCov || []).filter(function (e) { return e.key !== er; });
      wsSaveStore(); wsReRateCover(); return;
    }
    if (!wsIntOk(erRaw)) {
      var erOld = wsEntryOv(er);
      markBad(t, true); t.value = erOld != null ? erOld : "";
      toast("条目级覆盖阈值须为 ≥1 的整数（留空 = 继承）"); return;
    }
    var erV = Math.floor(Number(erRaw));
    WS.entryCov = (WS.entryCov || []).filter(function (e) { return e.key !== er; });
    var erMeta = wsEntries().filter(function (e) { return e.key === er; })[0] || { entry: er };
    WS.entryCov.push({ key: er, entry: erMeta.entry, v: erV });
    wsSaveStore(); wsReRateCover();
    toast("条目级覆盖已设为 " + erV + " 次/分钟（演示）");
    return;
  }
}
/* 批量设置：把「已勾选」的资产一次性设为同一处置（页① 模式）或同一覆盖阈值（页② 限流维度）。
   两条硬规则：① **只作用于已勾选行**，未勾选资产一律不动；② 未勾选任何行时**不弹窗**，只给提示。 */
function openBatchDlg(kind) {
  var ids = wsSelIds(kind);
  if (!ids.length) { toast("请先勾选需要批量设置的资产"); return; }
  if (kind === "a") {
    var html = '<div class="fld"><label>目标防护模式</label><select id="wsBatchVal">' +
      ["继承（清除覆盖）", "观察", "阻断"].map(function (x) { return "<option>" + x + "</option>"; }).join("") +
      '</select><div class="help">选「继承」= 清除这些资产的覆盖，回到按安全等级出厂默认。</div></div>' +
      '<div class="note blue">批量设置<b>只作用于已勾选的 ' + ids.length + " 个资产</b>，未勾选资产<b>不受影响</b>；<b>本次变更入审计</b>。</div>";
    openDlg("批量设置单资产覆盖", "覆盖层 L3 · 批量写入偏离项；表内逐资产单点设置仍可用。", html);
    $("#dlg1Ok").textContent = "应用";
    $("#dlg1Ok").onclick = function () {
      var v = $("#wsBatchVal").value, target = v.indexOf("继承") === 0 ? "继承" : v;
      closeDlg();
      confirmDlg("批量设置覆盖", "将对已勾选的 <b>" + ids.length + "</b> 个资产" +
        (target === "继承" ? "清除覆盖、恢复按安全等级继承" : "把防护模式覆盖为 <b>" + target + "</b>") + "。确认应用？",
        function () {
          ids.forEach(function (id) { if (target === "继承") delete WS.modeOverride[id]; else WS.modeOverride[id] = target; });
          wsSaveStore(); wsSelClear(kind); wsCurRender();
          toast("已批量设置 " + ids.length + " 个资产为「" + target + "」（演示）");
        }, "确认应用");
    };
    $("#dlg1No").textContent = "取消";
    return;
  }
  if (kind === "p") {                                           /* 自定义 PCRE：批量删除 / 批量启停 */
    var onN = ids.filter(function (nm) { var rr = WS.pcre.filter(function (x) { return x.name === nm; })[0]; return rr && rr.on !== false; }).length;
    var ph = '<div class="fld" style="margin-bottom:10px"><label>批量动作</label><select id="wsPcreBatch"><option>删除</option><option>停用</option><option>启用</option></select>' +
      '<div class="help">删除<b>不可恢复</b>；停用 / 启用仅切换是否参与攻击检测。</div></div>' +
      '<div class="note blue">将作用于已勾选的 <b>' + ids.length + '</b> 条规则（启用中 ' + onN + ' · 已停用 ' + (ids.length - onN) + '）；未勾选规则<b>不受影响</b>。<b>本次变更入审计</b>。</div>';
    openDlg("批量处理自定义规则", "批量动作只作用于已勾选行，未勾选规则一律不动。", ph);
    $("#dlg1Ok").textContent = "应用";
    $("#dlg1Ok").onclick = function () {
      var act = $("#wsPcreBatch").value;
      var _names = WS.pcre.map(function (x) { return x.name; });
      var tgt = ids.map(function (nm) { return _names.indexOf(nm); }).filter(function (i) { return i >= 0; });
      closeDlg();
      confirmDlg("批量" + act + "规则", "将对已勾选的 <b>" + tgt.length + "</b> 条规则执行「<b>" + esc(act) + "</b>」。" +
        (act === "删除" ? "<b>删除不可恢复</b>。" : "") + "确认应用？", function () {
          if (act === "删除") { tgt.sort(function (a, b) { return b - a; }).forEach(function (i) { WS.pcre.splice(i, 1); }); }
          else { var on = act === "启用"; tgt.forEach(function (i) { WS.pcre[i].on = on; }); }
          wsSaveStore(); wsSelClear(kind); wsCurRender(); toast("已批量" + act + " " + tgt.length + " 条规则（演示）");
        }, "确认" + act);
    };
    $("#dlg1No").textContent = "取消";
    return;
  }
  /* kind === "r"：资产级限流覆盖（未认证 / 已认证两个维度各自独立） */
  var html2 = '<div class="fld" style="margin-bottom:10px"><label>目标维度</label><select id="wsBatchDim">' +
    ["未认证（IP × 资产）", "已认证（用户 × 资产）"].map(function (x) { return "<option>" + x + "</option>"; }).join("") + "</select></div>" +
    '<div class="fld"><label>覆盖阈值</label><input type="number" min="1" step="1" id="wsBatchNum" placeholder="次/分钟"><div class="help">留空 = <b>清除覆盖</b>、恢复继承平台阈值。</div></div>' +
    '<div class="note blue">批量设置<b>只作用于已勾选的 ' + ids.length + " 个资产</b>，未勾选资产<b>不受影响</b>；两个维度各自独立，只改所选维度。<b>本次变更入审计</b>。</div>";
  openDlg("批量设置资产级限流覆盖", "覆盖层 L3 · 未认证与已认证两个维度独立；阈值热生效。", html2);
  $("#dlg1Ok").textContent = "应用";
  $("#dlg1Ok").onclick = function () {
    var dim = $("#wsBatchDim").value, raw = String($("#wsBatchNum").value || "").trim();
    var anon = dim.indexOf("未认证") === 0;
    var n = raw === "" ? null : Number(raw);
    if (raw !== "" && !wsIntOk(raw)) { markBad($("#wsBatchNum"), true); toast("覆盖阈值须为 ≥1 的整数（留空 = 清除覆盖）"); return; }
    if (n != null) n = Math.floor(n);
    closeDlg();
    confirmDlg("批量设置覆盖", "将对已勾选的 <b>" + ids.length + "</b> 个资产的 <b>" + esc(dim) + "</b> 维度" +
      (n == null ? "清除覆盖、恢复继承" : "覆盖为 <b>" + n + " 次/分钟</b>") + "。确认应用？", function () {
        var store = anon ? WS.assetRateAnon : WS.assetRate;
        ids.forEach(function (id) { if (n == null) delete store[id]; else store[id] = n; });
        wsSaveStore(); wsSelClear(kind); wsCurRender();
        toast("已批量设置 " + ids.length + " 个资产的" + (anon ? "未认证" : "已认证") + "维度（演示）");
      }, "确认应用");
  };
  $("#dlg1No").textContent = "取消";
}
function openPcreDlg() {
  var html = '<div class="fld" style="margin-bottom:10px"><label>规则名称 <span class="req">*</span></label><input type="text" id="wsPcreName" placeholder="如：拦截特定 UA 注入"></div>' +
    '<div class="fld" style="margin-bottom:10px"><label>作用域</label><select id="wsPcreScope"><option>路径</option><option>参数名</option><option>头名</option><option>请求体</option></select></div>' +
    '<div class="fld"><label>正则 <span class="req">*</span></label><input type="text" id="wsPcreRe" placeholder="如：(?i)union\\s+select"><div class="help">保存期校验：语法 / 长度（≤512）/ 执行预算 / 灾难性回溯风险</div></div>';
  openDlg("新建自定义 PCRE 规则", "", html);
  $("#dlg1Ok").textContent = "校验并保存";
  $("#dlg1Ok").onclick = function () {
    var nm = $("#wsPcreName"), re = $("#wsPcreRe");
    if (!nm.value.trim()) { markBad(nm, true); toast("规则名称为必填"); return; }
    if (WS.pcre.some(function (r) { return r.name === nm.value.trim(); })) { markBad(nm, true); toast("规则名称已存在"); return; }
    var why = wsPcreCheck(re.value.trim());
    if (why) { markBad(re, true); toast("校验未通过：" + why); return; }
    /* ★ 2026-09-23 第十六轮：新建项**须补齐 on / at** —— 旧实现漏两字段 ⇒ 新行「添加时间」列显示「—」，
       与既有 seed 行、与本列的存在意义（可定位）自相矛盾（R14 已给旧快照补 at，却漏了新增路径）。 */
    var item = { name: nm.value.trim(), scope: $("#wsPcreScope").value, re: re.value.trim(), op: wsOp(), on: true, at: WS_DATE };
    closeDlg();
    /* 二次确认表：PCRE 发布须二次确认 + 明示「受控规则版本发布 · 滚动生效」 */
    confirmDlg("发布自定义规则", "规则 <b>" + esc(item.name) + "</b>（作用域：<b>" + esc(item.scope) + "</b>）将走<b>受控规则版本发布</b>，滚动生效 —— 先观察、后按防护模式处置。<b>本次变更入审计</b>。确认发布？",
      function () { WS.pcre.push(item); wsSaveStore(); renderWebSec(); toast("自定义规则已发布（受控版本 · 滚动生效）（演示）"); }, "确认发布");
  };
  $("#dlg1No").textContent = "取消";
}

function rlAct(a, el) {
  if (a === "rlImport") {
    var html = '<div class="fld" style="margin-bottom:10px"><label>规则包版本号 <span class="req">*</span></label><input type="text" id="rlVer" placeholder="如：2026.09.2"></div>' +
      /* ★ 2026-09-23 第十六轮：文件字段**曾标「必填（*）」却无任何校验** —— 原型无法提供厂商签名包，
         强校验会挡住演示（Q41/Q54 与取证均直接导入）。故**如实标注**：实机必选、演示可跳过，
         并把「本原型只校验版本号」写进 help，去掉虚假的必填承诺。 */
      '<div class="fld" style="margin-bottom:10px"><label>规则包文件 <span class="mini">（实机必选厂商签名包 · 演示可跳过）</span></label><input type="file" id="rlFile" accept=".pkg,.json"><div class="help">由厂商私钥签名的规则包；网关侧以预置公钥验签。<b>本原型不校验文件</b>（无真实包），仅校验版本号。</div></div>' +
      '<div class="fld"><label><input type="checkbox" id="rlSimFail"> 模拟验签失败（演示用）</label><div class="help">勾选后将在「签名校验」步失败，用于演示「保留上一版有效配置 + 高危告警」</div></div>';
    openDlg("导入规则包", "导入为二次确认；SM2 签名由厂商私钥签发，网关侧以预置公钥验签。", html);
    $("#dlg1Ok").textContent = "确认导入";
    $("#dlg1Ok").onclick = function () {
      var v = $("#rlVer"), nv = (v.value || "").trim();
      if (!/^\d{4}\.\d{2}\.\d+$/.test(nv) || Number(nv.split(".")[1]) < 1 || Number(nv.split(".")[1]) > 12) { markBad(v, true); toast("版本号格式应为 YYYY.MM.N（MM 为 01~12）"); return; }   /* ★ 第十八轮：补月份取值域校验（旧实现放过 2026.13.1） */
      if (RL.versions.some(function (x) { return x.v === nv; })) { markBad(v, true); toast("版本号已存在（版本号须单调递增）"); return; }
      /* 单调递增：新包必须**高于当前最高版本**（含已归档版本，避免与历史重复 / 落后） */
      var mx = rlMaxVer();
      if (rlVerCmp(nv, mx) <= 0) { markBad(v, true); toast("版本号须高于当前最高版本 " + mx + "（版本号单调递增，不得导入更旧或同版包）"); return; }
      RL.pending = nv; RL.stage = 1; RL._simFail = $("#rlSimFail").checked;
      rlSaveStore(); closeDlg(); renderRuleLib(); toast("规则包已导入：" + RL.pending + "（演示）");
    };
    return;
  }
  if (a === "rlVerify") {
    if (RL._simFail) {
      RL.stage = 1; rlSaveStore(); renderRuleLib();
      toast("签名校验失败：已拒绝加载，保留上一版有效配置（" + RL.current + "）；已推送高危告警（演示）");
      return;
    }
    RL.stage = 2; rlSaveStore(); renderRuleLib(); toast("SM2 验签通过（SM3 摘要一致）（演示）"); return;
  }
  if (a === "rlGray") { RL.stage = 3; rlSaveStore(); renderRuleLib(); toast("已进入灰度（观察）—— 不产生阻断，仅记录命中（演示）"); return; }
  if (a === "rlPublish") { RL.stage = 4; rlSaveStore(); renderRuleLib(); toast("已发布（演示）"); return; }
  if (a === "rlRollout") {
    if (RL.stage !== 4) return;                       /* 只允许在「已发布」步下发；防重复下发 */
    var pv = RL.pending || RL.current;
    /* ★ 2026-09-23 第十八轮：下发包必须**高于**现行版本（单调递增红线的最后一道闸）。 */
    if (rlVerCmp(pv, RL.current) <= 0) { toast("不得下发不高于现行版本（" + RL.current + "）的包"); return; }
    wsAsk2FA("规则库全量下发", "将把 <b>" + esc(pv) + "</b> 全量下发至全部网关节点，最迟 <b>120s</b> 收敛。<b>变更入审计</b>。", function () {
      RL.publishedAt = wsNow();
      if (!RL.versions.some(function (x) { return x.v === pv; })) {
        RL.versions.unshift({ v: pv, at: RL.publishedAt, entries: RL.entries, state: "生效中", signed: true });
      }
      RL.current = pv; RL.pending = ""; RL.stage = 5; RL.signed = true;
      RL.versions.forEach(function (x, i) { if (i > 0 && x.state === "生效中") x.state = "已归档"; });
      rlSaveStore(); renderRuleLib(); toast("已全量下发，全节点收敛（演示）");
    });
    return;
  }
  if (a === "rlRollback") {
    var tv = el.getAttribute("data-v");
    confirmDlg("回滚版本", "回滚到 <b>" + esc(tv) + "</b> 不得以版本号倒退实现 —— 将以<b>更高版本号重新签名下发</b>；<b>仅回滚库文件，不动已生成的策略</b>（策略属用户资产）。确认回滚？", function () {
      var nv = rlNextVer();
      /* ★ 2026-09-23 第十七轮：回滚的**条目数须跟随目标版本**（旧实现 entries: RL.entries ⇒ 回滚到 1388 条的
         版本却生成「1420 条」的新版本，与确认弹窗承诺的「回滚到 X」自相矛盾）。时间取真实时钟；视图复位到新版本。 */
      var tvE = (RL.versions.filter(function (x) { return x.v === tv; })[0] || {}).entries;
      if (tvE != null) RL.entries = tvE;
      /* ★ 2026-09-23 第十八轮：回滚后**清空在途包**并复位操作链 —— 旧实现只改 current/versions，
         在途行仍在 ⇒ 再点「全量下发」会下发**低于回滚版本**的包、把回滚结果静默架空。 */
      RL.pending = ""; RL.stage = 0;
      RL.current = nv; RL.signed = true; RL.publishedAt = wsNow();
      RL.versions.unshift({ v: nv, at: RL.publishedAt, entries: RL.entries, state: "生效中", signed: true });
      RL._selVer = nv;
      RL.versions.forEach(function (x, i) { if (i > 0 && x.state === "生效中") x.state = "已归档"; });
      rlSaveStore(); renderRuleLib(); toast("已回滚（以更高版本号 " + nv + " 重签下发）（演示）");
    }, "确认回滚");
    return;
  }
  if (a === "rlSelVer") {
    RL._selVer = el.getAttribute("data-v") || RL.current;
    RLTAB = "r2";                                    /* 点「生效规则」→ 直接切到生效规则面板 */
    renderRuleLib();
    return;
  }
  /* 生效规则表：查看库内规则内容（匹配特征 / 检测位置只读）并改命中处置 —— 即「自定义覆盖」 */
  if (a === "rlRuleEdit") {
    /* ★ 2026-09-23 第十八轮：归档版本 = 只读快照 —— 动作层**必须**拦截（旧实现只在渲染层隐藏按钮，
       程序化触发仍会改写现行库规则）。 */
    if ((RL._selVer || RL.current) !== RL.current) { toast("归档版本为只读快照，不可编辑；请切回当前生效版本"); return; }
    var ri = Number(el.getAttribute("data-v"));
    if (isNaN(ri) || !RL.rules || !RL.rules[ri]) return;
    var rr = RL.rules[ri];
    var ro = ' readonly style="background:#f4f6f9"';
    var mono = ' readonly style="background:#f4f6f9;font-family:ui-monospace,Consolas,monospace"';
    var rhtml = '<div class="fld" style="margin-bottom:10px"><label>规则 ID（只读）</label><input type="text" value="' + esc(rr.id) + '"' + ro + '></div>' +
      '<div class="fld" style="margin-bottom:10px"><label>规则名称（只读）</label><input type="text" value="' + esc(rr.name) + '"' + ro + '></div>' +
      '<div class="fld" style="margin-bottom:10px"><label>匹配特征（库内预置 · 只读）</label><input type="text" value="' + esc(rr.pat || "") + '"' + mono + '></div>' +
      '<div class="fld" style="margin-bottom:10px"><label>检测位置（只读）</label><input type="text" value="' + esc(rr.loc || "") + '"' + ro + '></div>' +
      '<div class="fld"><label>命中处置</label><select id="rlRuleDisp">' +
      ["继承库设定", "观察", "阻断"].map(function (x) { return "<option" + (x === (rr.disp || "继承库设定") ? " selected" : "") + ">" + x + "</option>"; }).join("") +
      '</select><div class="help">匹配特征为<b>库内预置、随库下发、不可改</b>；改「命中处置」或启停即记一次「<b>自定义覆盖</b>」，仅作用本网关、<b>库更新不覆盖</b>。</div></div>';
    openDlg("编辑库内规则（自定义覆盖）", "编辑预置项属<b>自定义覆盖</b>，<b>库升级不覆盖</b>本改动；变更入审计。", rhtml);
    $("#dlg1Ok").textContent = "保存";
    $("#dlg1Ok").onclick = function () {
      var rl = RL.rules[ri];
      rl.disp = $("#rlRuleDisp").value;
      /* ★ 2026-09-23 第十六轮：「自定义覆盖」= **当前是否有偏离**（不是「曾改过」）——
         选「继承库设定」= 清除处置覆盖；未改任何项直接保存不再被误记一次覆盖。
         与全站「选继承 = 清除覆盖」口径（wsSegPick 的 delete WS.modeOverride）一致。 */
      rl.ov = (rl.disp !== "继承库设定" && rl.disp !== (rl.def || rl.disp)) || (rl.on === false);
      rlSaveStore(); closeDlg(); renderRuleLib();
      toast(rl.ov ? "已记一次自定义覆盖（演示）" : "已恢复库设定、撤销该覆盖（演示）");
    };
    $("#dlg1No").textContent = "取消";
    return;
  }
  if (a === "rlRuleToggle") {
    if ((RL._selVer || RL.current) !== RL.current) { toast("归档版本为只读快照，不可启停；请切回当前生效版本"); return; }
    var k = Number(el.getAttribute("data-v"));
    if (isNaN(k) || !RL.rules || !RL.rules[k]) return;
    var rk = RL.rules[k];
    rk.on = !rk.on;
    rk.ov = (rk.disp !== "继承库设定" && rk.disp !== (rk.def || rk.disp)) || (rk.on === false);
    rlSaveStore(); renderRuleLib(); toast("规则已" + (rk.on ? "启用" : "停用") + "（" + (rk.ov ? "自定义覆盖" : "已回库设定") + "）（演示）");
    return;
  }
  if (a === "rlCancel") {
    RL.pending = ""; RL.stage = 0; rlSaveStore(); renderRuleLib(); toast("已撤销本次导入（演示）"); return;   /* ★ 第十八轮：撤销后「无在途包」⇒ stage=0（旧实现写 5，与 0=无 的语义不符） */
  }
}
function rlOnClick(e) {
  var act = e.target.closest ? e.target.closest("[data-rl]") : null;
  if (act) rlAct(act.getAttribute("data-rl"), act);
}
function rlOnChange(e) {
  var t = e.target;
  if (t && t.getAttribute && t.getAttribute("data-rl-auto")) {
    if (!wsIntOk(t.value) || Number(t.value) > 100) { markBad(t, true); t.value = RL.autoRollback; toast("阈值须为 1~100 的整数"); return; }   /* ★ 第十八轮：非法输入**复位为原值**（旧实现不复位 ⇒ 展示与状态分叉） */
    RL.autoRollback = Math.floor(Number(t.value)); rlSaveStore(); toast("自动回滚阈值已更新为 " + RL.autoRollback + "%（演示）");
  }
}

/* ---------- 6. 首次接线（仅在承载页生效） ---------- */
(function () {
  ["pg-websec", "pg-rate", "pg-reqcon", "pg-rulelib"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", wsOnClick);
    el.addEventListener("change", wsOnChange);
    el.addEventListener("input", wsOnInput);
    el.addEventListener("keydown", wsOnKey);
  });
  var rlEl = document.getElementById("pg-rulelib");
  if (rlEl) { rlEl.addEventListener("click", rlOnClick); rlEl.addEventListener("change", rlOnChange); }
})();

/* ==========================================================================
   多页化 bootstrap：恢复持久化数据 → 按当前页渲染
   （替代原单文件的末尾初始化；深链 ?pg=... / #cred 也在此统一处理）
   ========================================================================== */
(function bootstrap(){
  /* ① 入口门禁最先跑：未登录访问业务页 → 去登录页（带 ?back= 记住原目标）。
        必须在任何渲染之前，否则会先闪出内容再跳走。 */
  if (requireLogin()) return;

  /* ② 登录页自身不渲染业务内容（表单交互在 login.html 的页内脚本里）。 */
  if (PG_CUR === "pg-login") return;

  const q = new URLSearchParams(location.search);
  /* 兼容单文件时代深链：index.html?pg=pg-cred&tab=c2 直接落到目标页 */
  const want = q.get("pg");
  if (want && PG_FILE[want] && want !== PG_CUR) {
    const t = q.get("tab");
    location.replace(PG_FILE[want] + (t ? ("?tab=" + encodeURIComponent(t)) : ""));
    return;
  }
  if (location.hash === "#cred" && PG_CUR !== "pg-cred") { location.replace("cred-hosting.html"); return; }

  loadDemoState();

  if (PG_CUR === "pg-list") { assetListRender(); }
  else if (PG_CUR === "pg-detail") {
    const aid = q.get("aid") || window._detailAid || CUR_ACL || "";
    if (aid && byId(aid)) openDetail(aid); else goPage("pg-list");
  }
  else if (PG_CUR === "pg-edit") {
    const mode = q.get("mode") || "register", aid = q.get("aid") || "", from = q.get("from") || "pg-list";
    if (mode === "edit" && aid && byId(aid)) enterForm("edit", byId(aid), from); else enterForm("register");
  }
  else if (PG_CUR === "pg-cred") { goCred(q.get("tab") || window._credTab || "c1"); }
  /* 新增页族：先 setPage 高亮侧栏，再按其自身渲染函数铺内容（2026-09-21）。
     ⚠ setPage 的**跨页守卫**是「if (pg !== PG_CUR) { goPage(pg); return; }」——
       故这里必须传 PG_CUR 本身：若三子页都写 setPage("pg-websec")，
       pg-rate / pg-reqcon 会被守卫判成「跨页」而直接弹回第一子页，形成打不开的死循环。
     侧栏高亮由 setPage 内的子页映射把 pg-rate / pg-reqcon 归到 pg-websec。 */
  else if (PG_CUR === "pg-websec") { setPage("pg-websec"); renderWebSec(); }
  else if (PG_CUR === "pg-rate") { setPage("pg-rate"); renderRate(); }
  else if (PG_CUR === "pg-reqcon") { setPage("pg-reqcon"); renderReqCon(); }
  else if (PG_CUR === "pg-rulelib") { setPage("pg-rulelib"); renderRuleLib(); }
  else { setPage(PG_CUR); }
})();
