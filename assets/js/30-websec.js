/* ==========================================================================
   认证 · 网关凭据托管（网关托管凭据管理）· 一期
   --------------------------------------------------------------------------
   三个分区（与资产「代理与上游」卡逐行对应）：
     ① 网关托管凭据   口令 / 密钥类：Basic / API-Key / OAuth2 Client
     ② CA 管理        信任锚（根 CA / 自签证书）：仅托管公钥证书，上传、轮换、引用保护
     ③ mTLS 客户端证书 证书 + 私钥；握手自动出示，私钥不出平台、不可导出、不可回读
   需求依据：F6.2 规则 6~9（上游 TLS 校验 / 身份头默认删除 / 可信凭据注入 / 上游认证三档）
            F9.3 规则 2·3（帮助语口径「由平台维护」；「不参与谁能访问判定」）
            AC-F6.2-4 / AC-F9.3-1；WBS B7.1（上游认证配置面与语义边界说明）
   与资产详情 / 登记向导「上游透传与校验」卡双向可达：
     · 卡内「托管凭据」下拉            → 本页「网关托管凭据」
     · 卡内「信任锚（根 CA）」行        → 本页「CA 管理」
     · 卡内「客户端证书（mTLS）」行     → 本页「mTLS 客户端证书」（mTLS 客户端证书，私钥不出平台）
   演示基准日取认证模块统一运行时刻 AU_TS_STAMP（2026-09-30 09:14）的日期部分；「即将过期」= 有效期 ≤ 30 天。
   ========================================================================== */
/* ① 网关托管凭据：口令 / 密钥类（mTLS 客户端证书因含私钥、形态为证书，单列第 ③ 分区维护） */
const CRED_TYPES = ["Basic", "API-Key", "OAuth2 Client"];
const CRED_LIST = [
  { id:"cred-rpt",    name:"监管报送网关", type:"Basic",         where:"Authorization: Basic", user:"svc-report", inj:{ carrier:"header", field:"Authorization", prefix:"Basic " }, assets:["监管报送接口"],   rot:"2026-08-12", st:"已启用" },
  { id:"cred-aml",    name:"反洗钱报送",   type:"OAuth2 Client", where:"Authorization: Bearer（平台代取 token）", oauth:{ endpoint:"https://aml-gw.example.com/oauth2/token", mode:"client_credentials", authMethod:"client_secret_basic", scope:"aml.report", audience:"https://aml.example.com" }, clientId:"aml-gw-client", assets:["反洗钱报送门户"], rot:"2026-09-01", st:"已启用" },
  { id:"cred-open",   name:"开放平台对接", type:"API-Key",       where:"X-API-Key（请求头）", inj:{ carrier:"header", field:"X-API-Key", prefix:"" }, assets:[],                 rot:"2026-07-18", st:"已启用" },
  { id:"cred-legacy", name:"老报送通道",   type:"Basic",         where:"Authorization: Basic", user:"svc-legacy", inj:{ carrier:"header", field:"Authorization", prefix:"Basic " }, assets:[],                 rot:"2026-03-02", st:"已停用" }
];
/* ③ mTLS 客户端证书：证书 + 私钥；私钥不出平台、不可导出、不可回读 */
const MTLS_LIST = [
  { id:"mtls-mb",  name:"手机银行对账", subj:"CN=mb-recon.bank.local",  issuer:"CN=Bank Internal Issuing CA", exp:"2027-03-15", fp:"5D:0A:77:…:31", assets:["手机银行后台"], rot:"2026-06-30", keyEnc:true,  st:"有效" },
  { id:"mtls-rpt", name:"数据报送前置", subj:"CN=rpt-front.bank.local", issuer:"CN=Bank RPT Root CA",         exp:"2026-09-28", fp:"E1:6B:3C:…:02", assets:["监管报送接口"],     rot:"2026-04-08", keyEnc:false, st:"已过期" }
];
const CA_LIST = [
  { id:"ca-wy",    name:"网银域根 CA",      code:"bank-wy-root",         type:"根 CA",       subj:"CN=Bank WY Root CA, O=XX Bank",  exp:"2031-05-08", fp:"3F:9A:C1:…:C2", assets:["核心网银门户","对公网银体验门户"], st:"有效" },
  { id:"ca-oa",    name:"OA 域根 CA",       code:"bank-oa-root",         type:"根 CA",       subj:"CN=Bank OA Root CA, O=XX Bank",  exp:"2027-11-20", fp:"7C:11:8E:…:5E", assets:["统一身份门户"],           st:"有效" },
  { id:"ca-rpt",   name:"数据报送域根 CA",  code:"bank-rpt-root",        type:"根 CA",       subj:"CN=Bank RPT Root CA, O=XX Bank", exp:"2026-10-02", fp:"A2:4D:F0:…:90", assets:["监管报送接口"],      st:"即将过期" },
  { id:"ca-front", name:"报送前置自签证书", code:"rpt-front.bank.local", type:"自签叶证书", subj:"CN=rpt-front.bank.local",        exp:"2026-09-30", fp:"B8:22:19:…:4A", assets:[],                    st:"已过期" }
];
/* ② 平台签发 CA 清单 —— 供**平台签发给主体**的凭据（客户端 License 证书 / 智能体短时凭据）
   选择签发者，取值域＝本清单（闭集）。
   ⚠ 与 `CA_LIST`（页③「CA 管理（信任锚）」）**不是同一池**，不得互相并入：
   `CA_LIST` 是「网关 → 上游」**出站方向**的信任锚（种子条条带 `assets` 被访问域归属）；
   本清单是平台自身作为签发者的 CA。两者混用会造出「客户端 License 证书由网银域根 CA 签发」这类错误。
   ★ 2026-10-09：本清单原为 `AU.gw.cas`（已撤除的重复页 `pg-augwcred` 的残留种子），
   在此升格为与 `CRED_LIST` / `CA_LIST` / `MTLS_LIST` 同体例的模块级常量，去处影子化。 */
const GW_SIGN_CAS = [
  { id: "sg_01", name: "白泽内网 CA",     type: "内网私有 PKI", cn: "Baize Internal Root CA", exp: "2031-01-01" },
  { id: "sg_02", name: "外购 CA（CFCA）", type: "外购 CA",      cn: "CFCA RSA ROOT",           exp: "2029-06-30" }
];
const _ST_TAG = { "已启用":"t-ok", "已停用":"t-gray", "有效":"t-ok", "即将过期":"t-warn", "已过期":"t-err" };
const stTag = s => `<span class="tag ${_ST_TAG[s]||"t-gray"}">${esc(s)}</span>`;
/* 日期工具（第十九轮）：基准日取认证模块统一运行时刻 AU_TS_STAMP 的日期部分（即「今天」），上传 / 轮换若把 exp 写成该日期，
     就会出现「刚换的证书当天到期、却仍标有效」的自相矛盾（评审 D1）。故一律 +365 天；
     并给出按 exp 推导状态的唯一真源 credExpSt（≤0 已过期 / ≤30 即将过期 / 否则有效）。 */
/* ★ 2026-10-09：原实现用 toISOString()（UTC）取回日期，在 TZ=+08:00 下一律**少 1 天**
   （实测 addDays("2026-09-30",365) → "2027-09-29"、addDays("2027-03-13",365) → "2028-03-11"），
   且同一份演示在不同时区机器上产出不同日期。改为按**本地日期分量**格式化，与入参同一时区基准。 */
const addDays = (d, n) => { const t = new Date(d + "T00:00:00"); t.setDate(t.getDate() + n);
  const p2 = (x) => (x < 10 ? "0" : "") + x;
  return t.getFullYear() + "-" + p2(t.getMonth() + 1) + "-" + p2(t.getDate()); };
const credExpSt = exp => { const days = Math.round((new Date(exp + "T00:00:00") - new Date(AU_TS_STAMP.slice(0, 10) + "T00:00:00")) / 86400000); return days <= 0 ? "已过期" : days <= 30 ? "即将过期" : "有效"; };
/* 状态真源接线（第二十轮）：CA / mTLS 的「有效性状态」**唯一**由 exp 派生 ——
   第十九轮抽出了 credExpSt 却零调用（新建 / 轮换写死 st:"有效"、种子写死「即将过期」），
   改 exp 不改 st 会自相矛盾。credNormalize 在每次渲染前把 CA / mTLS 的 st 重算回写；
   ⚠ CRED 的「启用 / 停用」是运维态、与证书有效期无关，**不参与**派生。
   已核对：种子 st 字面量已与 credExpSt 在基准日（AU_TS_STAMP）下的推导结果对齐 —— 含 2 条按当日
   推为「已过期」的（`ca-front` exp 2026-09-30、`mtls-rpt` exp 2026-09-28），原字面量写「即将过期」
   与派生不符；即便日后 AU_TS_STAMP 前移，credNormalize 也会在每次渲染前覆盖，UI 口径以现算为准。 */
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
const taStyle = "width:100%;box-sizing:border-box;padding:8px 10px;font-size:12.5px;font-family:ui-monospace,Menlo,Consolas,monospace";

/* 页③ 主操作按钮（随激活分区变化）—— 与其余 5 页同范式：主操作置于页头 .title-row 的 .toolbar */
function credActBtn(ct) {
  return ct === "c2" ? '<button class="btn primary" onclick="caUp()">+ 上传信任锚</button>'
       : ct === "c3" ? '<button class="btn primary" onclick="mtlsUp()">+ 上传客户端证书</button>'
       : '<button class="btn primary" onclick="credNew()">+ 新建凭据</button>';
}
function renderCred(){
  credNormalize();
  const host = document.getElementById("pg-cred"); if(!host) return;
  const tab = ["c1", "c2", "c3"].indexOf(window._credTab) >= 0 ? window._credTab : "c1";
  host.innerHTML = `
    ${idTitle("网关凭据托管", "网关到上游的<b>机器对接凭据</b>与<b>信任锚</b>；由平台统一托管，<b>不参与「谁能访问」判定</b>", '<div class="toolbar">' + credActBtn(tab) + "</div>")}
    ${idScopeNote("上游连接与通道安全配置（网关 → 资产后端）<b>不参与「谁能访问」判定</b>；浏览器会话流量不需要资产凭据，本页仅针对<b>网关到上游</b>的连接。账号密码代填（用户凭据）属平台基座认证集成能力，<b>与本页不同层</b>")}

    <div class="tabs" id="credTabs" role="tablist">
      <button type="button" role="tab" id="credTabsTab_c1" aria-controls="ct-c1" aria-selected="${tab==="c1"?"true":"false"}" data-ct="c1" class="${tab==="c1"?"on":""}">网关托管凭据<span class="num">${CRED_LIST.length}</span></button>
      <button type="button" role="tab" id="credTabsTab_c2" aria-controls="ct-c2" aria-selected="${tab==="c2"?"true":"false"}" data-ct="c2" class="${tab==="c2"?"on":""}">CA 管理（信任锚）<span class="num">${CA_LIST.length}</span></button>
      <button type="button" role="tab" id="credTabsTab_c3" aria-controls="ct-c3" aria-selected="${tab==="c3"?"true":"false"}" data-ct="c3" class="${tab==="c3"?"on":""}">mTLS 客户端证书<span class="num">${MTLS_LIST.length}</span></button>
    </div>

    <div class="tbp ${tab==="c1"?"on":""}" id="ct-c1" role="tabpanel" aria-labelledby="credTabsTab_c1">
      <div class="card">
        <div class="card-h">
          <h3>网关托管凭据<span class="sub">网关到上游的机器对接凭据（口令 / 密钥类）；由平台托管，录入后明文不可回读</span></h3>
        </div>
        <div class="card-b">
          <div class="toolbar" style="margin-bottom:12px">
            <div class="input-w"><input type="search" id="credK" placeholder="搜索凭据名称 / 适用上游" aria-label="搜索凭据名称或适用上游" style="width:240px"><i>搜索</i></div>
            <select id="credFType" aria-label="筛选凭据类型"><option value="">全部类型</option>${CRED_TYPES.map(t=>`<option>${esc(t)}</option>`).join("")}</select>
            <select id="credFSt" aria-label="筛选凭据状态"><option value="">全部状态</option><option value="已启用">启用</option><option value="已停用">停用</option></select>
          </div>
          <div class="tbl-wrap">
            <table class="lst" id="credTbl">
              <colgroup><col style="width:106px"><col style="width:167px"><col style="width:277px"><col style="width:106px"><col style="width:100px"><col style="width:84px"><col style="width:182px"></colgroup>
              <thead><tr><th>凭据名称</th><th>类型</th><th>注入位置</th><th>引用资产</th><th>最近轮换</th><th>状态</th><th>操作</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="lst-foot"><div id="credPager" style="flex:1"></div></div>
          <!-- ★ 2026-10-10（R19·A4）：原「口径」长解释已按门户「能删就删」收进「关键业务说明 · FL2（凭据全生命周期全流程）」。 -->
        </div>
      </div>
    </div>

    <div class="tbp ${tab==="c2"?"on":""}" id="ct-c2" role="tabpanel" aria-labelledby="credTabsTab_c2">
      <div class="card">
        <div class="card-h">
          <h3>信任锚（根 CA）<span class="sub">内网私有 PKI / 自签证书；供上游 TLS「自定义信任锚」引用</span></h3>
        </div>
        <div class="card-b">
          <!-- ★ 2026-10-10（R11）：c2 补筛选行 —— 该表含「即将过期 / 已过期」状态却无法按状态筛，
               与页内 c1 及其余 5 页列表体例不一致。 -->
          <div class="toolbar" style="margin-bottom:12px">
            <div class="input-w"><input type="search" id="caK" placeholder="搜索名称 / 标识 / 主体 / 指纹" aria-label="搜索信任锚" style="width:240px"><i>搜索</i></div>
            <select id="caFSt" aria-label="筛选信任锚状态"><option value="">全部状态</option><option>有效</option><option>即将过期</option><option>已过期</option></select>
          </div>
          <div class="tbl-wrap">
            <table class="lst" id="caTbl">
              <colgroup><col style="width:132px"><col style="width:96px"><col style="width:150px"><col style="width:102px"><col style="width:136px"><col style="width:122px"><col style="width:100px"><col style="width:184px"></colgroup>
              <thead><tr><th>名称</th><th>类型</th><th>主体（Subject）</th><th>有效期至</th><th>指纹（SHA-256）</th><th>引用资产</th><th>状态</th><th>操作</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="lst-foot"><div id="caPager" style="flex:1"></div></div>
          <!-- ★ 2026-10-10（R19·A4）：原「口径」长解释已按门户「能删就删」收进「关键业务说明 · FL2（凭据全生命周期全流程）」。 -->
        </div>
      </div>
    </div>

    <div class="tbp ${tab==="c3"?"on":""}" id="ct-c3" role="tabpanel" aria-labelledby="credTabsTab_c3">
      <div class="card">
        <div class="card-h">
          <h3>mTLS 客户端证书<span class="sub">网关到上游双向 TLS 握手时出示；证书与私钥由平台托管，私钥不出平台</span></h3>
        </div>
        <div class="card-b">
          <!-- ★ 2026-10-10（R11）：c3 补筛选行（同上，与 c1 同体例） -->
          <div class="toolbar" style="margin-bottom:12px">
            <div class="input-w"><input type="search" id="mtlsK" placeholder="搜索名称 / 标识 / 主体 / 颁发者" aria-label="搜索客户端证书" style="width:240px"><i>搜索</i></div>
            <select id="mtlsFSt" aria-label="筛选客户端证书状态"><option value="">全部状态</option><option>有效</option><option>即将过期</option><option>已过期</option></select>
          </div>
          <div class="tbl-wrap">
            <table class="lst" id="mtlsTbl">
              <colgroup><col style="width:132px"><col style="width:132px"><col style="width:150px"><col style="width:102px"><col style="width:136px"><col style="width:108px"><col style="width:88px"><col style="width:184px"></colgroup>
              <thead><tr><th>名称</th><th>主体（Subject）</th><th>颁发者</th><th>有效期至</th><th>指纹（SHA-256）</th><th>引用资产</th><th>状态</th><th>操作</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="lst-foot"><div id="mtlsPager" style="flex:1"></div></div>
          <!-- ★ 2026-10-10（R19·A4）：原「口径」长解释已按门户「能删就删」收进「关键业务说明 · FL2（凭据全生命周期全流程）」。 -->
        </div>
      </div>
    </div>
`;

  host.querySelectorAll("#credTabs button").forEach(b=>b.addEventListener("click",()=>credTab(b.dataset.ct)));
  /* ★ 2026-10-10（R9）：页③ 搜索框与认证 5 页同源问题 —— 组合中的 input 走整页重渲染会销毁
     输入节点、打断中文候选；组合期间跳过，compositionend 时再渲染一次。 */
  ["credK","credFType","credFSt"].forEach(id=>{ const el=host.querySelector("#"+id); if(el){ el.addEventListener("input",(ev)=>{ if(ev.isComposing) return; CRED_PG.c1=1; credRows(); }); el.addEventListener("compositionend",()=>{ CRED_PG.c1=1; credRows(); }); } });
  /* ★ 2026-10-10（R11）：c2 / c3 的筛选控件事件（与 c1 同口径，含 IME 组合态守卫） */
  [["caK","caFSt","c2",caRows],["mtlsK","mtlsFSt","c3",mtlsRows]].forEach(function(cfg){
    [cfg[0],cfg[1]].forEach(function(id2){ var el2=host.querySelector("#"+id2); if(!el2) return;
      var go=function(ev){ if(ev&&ev.isComposing) return; CRED_PG[cfg[2]]=1; cfg[3](); };
      el2.addEventListener("input",go); el2.addEventListener("change",go); el2.addEventListener("compositionend",go); });
  });
  /* ★ 2026-10-10（R10）：主操作已移到页头 .title-row（随分区切换、用内联 onclick 绑定），
     原按 id 绑定的三行随之撤除 —— 否则 querySelector 返回 null、空指针报错且按钮失灵。 */
  credRows(); caRows(); mtlsRows();
}

function credTab(ct){
  window._credTab = ct;
  const host = document.getElementById("pg-cred"); if(!host) return;
  /* ★ 2026-10-10（R13）：切换时补 aria-selected —— 原实现只切 .on 类，aria-selected 停在**渲染时**
     写入的旧值（静态陈旧属性），读屏用户切了页签仍听到旧的选中项。口径同 R12 页①/页④。 */
  host.querySelectorAll("#credTabs button").forEach(b=>{const _on=b.dataset.ct===ct; b.classList.toggle("on", _on); b.setAttribute("aria-selected", _on?"true":"false");});
  /* 分区板：统一按 .tbp 的 id 约定（ct-<分区>）切换，新增分区不必再改本函数 */
  host.querySelectorAll(".tbp").forEach(p=>p.classList.toggle("on", p.id === "ct-" + ct));
  /* ★ 2026-10-10（R10）：三个分区主操作不同（新建凭据 / 上传信任锚 / 上传客户端证书），
     页头按钮随分区切换 —— 不换会「看着 A 分区、按的却是 B 分区的动作」。 */
  var tb = host.querySelector(".title-row .toolbar");
  if (tb) tb.innerHTML = credActBtn(ct);
  /* ★ 2026-10-10（R15）：页③ 页签 roving 同步。 */
  try { auTabsRoveAll(); } catch (_et2) { /* 忽略 */ }
}
/* 与「代理与上游」卡互跳：详情 / 向导两处的帮助语链接均调用本函数 */
function goCred(tab){
  if(tab) window._credTab = tab;
  /* 多页化：凭据托管已独立成页（cred-hosting.html）。 */
  if (PG_CUR !== "pg-cred") { goPage("pg-cred", tab ? { tab: tab } : {}); return; }
  showPage("pg-cred");
  document.getElementById("crumbs").innerHTML='<span class="p">认证</span><span class="sep">/</span><span>网关凭据托管</span>';
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
  const rowsAll=CRED_LIST.filter(c=>(!k||[c.name,c.id,c.where,c.up||""].concat(c.assets).join(" ").toLowerCase().includes(k))&&(!t||c.type===t)&&(!s||c.st===s));
  const rows=credSlice(rowsAll, "c1");
  const tb=host.querySelector("#credTbl tbody"); if(!tb) return;
  credPager("c1", "credPager", rowsAll.length, "条凭据", "搜索 / 筛选 / 分页只作用于本表");
  tb.innerHTML = rows.length ? rows.map(c=>`<tr>
    <td><b>${esc(c.name)}</b><div class="muted">${esc(c.id)}</div>${c.up ? `<div class="muted" style="font-size:11.5px">上游：${esc(c.up)}</div>` : ""}</td>
    <td>${esc(c.type)}${c.oauth ? '<div class="muted" style="font-size:11.5px">换取式 · '+esc(c.oauth.mode||"client_credentials")+'</div>' : ""}</td>
    <td class="muted">${esc(c.where)}</td>
    <td>${refCell(refsOf("cred", c.id), c.id)}</td>
    <td class="col-dt">${c.rot?esc(c.rot):'<span class="muted">—</span>'}</td>
    <td>${stTag(c.st)}</td>
    <td class="cell-op"><span class="opgrp">
      <button class="btn link" id="credEdit_${c.id}" data-id="${c.id}" onclick="credEdit('${c.id}')">编辑</button>
      <button class="btn link" id="credRotate_${c.id}" data-id="${c.id}" onclick="credRotate('${c.id}')">轮换</button>
      <button class="btn link" id="credToggle_${c.id}" data-id="${c.id}" onclick="credToggle('${c.id}')">${c.st==="已启用"?"停用":"启用"}</button>
      <button class="btn link danger" id="credDel_${c.id}" data-id="${c.id}" onclick="credDel('${c.id}')">删除</button>
    </span></td></tr>`).join("") :
    ((k || t || s)
      ? '<tr><td colspan="7" class="mini">无匹配条目，请调整搜索 / 筛选条件。 <button class="btn link" type="button" onclick="credClearF()">清空筛选条件</button></td></tr>'
      : idEmptyRow(7, "暂无托管凭据 · 新建凭据后由资产「身份适配 → 机器身份」引用"));
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
    rows.push(`<div class="fld"><label>用户名 <span class="req">*</span></label><input type="text" id="ceUser" value="${esc(c.user||"")}"></div>`);
    rows.push(`<div class="fld"><label>口令 <span class="muted">（不可回读）</span></label><input type="text" value="••••••••" readonly><div class="help">口令变更请用「轮换」。</div></div>`);
  }
  if(isKey){
    rows.push(`<div class="fld"><label>注入载体</label><select id="ceCarrier">${["header","query","cookie"].map(v=>sel(v,inj.carrier,CARN[v])).join("")}</select></div>`);
    rows.push(`<div class="fld"><label>字段名 <span class="req">*</span></label><input type="text" id="ceField" value="${esc(inj.field||"")}"></div>`);
    rows.push(`<div class="fld"><label>值前缀</label><select id="cePrefix">${sel("",inj.prefix,"无")}${sel("Bearer ",inj.prefix,"Bearer ")}${sel("ApiKey ",inj.prefix,"ApiKey ")}</select></div>`);
    rows.push(`<div class="fld"><label>密钥值 <span class="muted">（不可回读）</span></label><input type="text" value="••••••••" readonly><div class="help">密钥变更请用「轮换」。</div></div>`);
  }
  if(isOAuth){
    rows.push(`<div class="fld"><label>客户端标识 client_id <span class="req">*</span></label><input type="text" id="ceOauthId" value="${esc(c.clientId||"")}"></div>`);
    rows.push(`<div class="fld"><label>客户端密钥 client_secret <span class="muted">（不可回读）</span></label><input type="text" value="••••••••" readonly><div class="help">client_secret 变更请用「轮换」。</div></div>`);
    rows.push(`<div class="fld full"><label>令牌端点 token_endpoint <span class="req">*</span></label><input type="text" id="ceOauthEp" value="${esc(o.endpoint||"")}"></div>`);
    /* ★ R61：单选项下拉是「假控件」（看起来能改，其实只有一条路）⇒ 改只读承载；隐藏字段保留 client_credentials 供提交读取（见下方 c.oauth.mode 与 :298 的兜底校验）。 */
    rows.push(`<div class="fld"><label>授权模式 grant_type</label><input type="hidden" id="ceOauthMode" value="client_credentials"><span class="tag t-info">client_credentials</span> <span class="muted" style="font-size:12.5px">客户端凭据（当前版本唯一取值，不可切换）</span></div>`);
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
      if(!/^https:\/\//i.test(ep)){ markBad("ceOauthEp",true); toast("令牌端点必须为 HTTPS："+ep); return; }
      if(!((document.getElementById("ceOauthId")||{}).value||"").trim()){ markBad("ceOauthId",true); toast("OAuth2 Client：客户端标识 client_id 为必填"); return; }
      var ceMode=((document.getElementById("ceOauthMode")||{}).value||"");
      if(ceMode!=="client_credentials"){ markBad("ceOauthMode", true); toast("当前版本仅承载 client_credentials；password / mTLS 换 token 在后续版本提供"); return; }
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
    closeDlg(); toast("凭据「"+name+"」已更新（仅非敏感元数据；凭据值变更请用「轮换」，变更入审计）（演示）"); saveDemoState(); renderCred(); credTab("c1");
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
        <div class="help">网关在本端点以 <b>POST application/x-www-form-urlencoded</b> 发起换取，响应取 <b>access_token</b>；必须 HTTPS。</div></div>
      <div class="fld" id="cnOauthModeWrap" style="display:none"><label>授权模式 grant_type</label><input type="hidden" id="cnOauthMode" value="client_credentials"><span class="tag t-info">client_credentials</span> <span class="muted" style="font-size:12.5px">客户端凭据（当前版本唯一取值，不可切换）</span></div>
      <div class="fld" id="cnOauthAuthWrap" style="display:none"><label>客户端认证方式 token_endpoint_auth_method</label><select id="cnOauthAuth"><option value="client_secret_basic">client_secret_basic（Basic 头 · 推荐）</option><option value="client_secret_post">client_secret_post（密钥放 body）</option></select></div>
      <div class="fld" id="cnOauthScopeWrap" style="display:none"><label>scope <span class="muted" style="font-weight:400">（选填）</span></label><input type="text" id="cnOauthScope" placeholder="如：aml.report"></div>
      <div class="fld" id="cnOauthAudWrap" style="display:none"><label>audience / resource <span class="muted" style="font-weight:400">（选填）</span></label><input type="text" id="cnOauthAud" placeholder="如：https://aml.example.com"></div>
      <div class="note" style="margin:0">凭据值按<b>类型</b>分别录入（Basic：用户名 + 口令；API-Key：密钥值；OAuth2：client_id + client_secret）；录入即加密托管并脱敏，界面不再显示明文，变更请用「轮换」。</div>
      <div class="fld full"><label>适用上游 <span class="muted">（选填，仅作检索备注）</span></label><input type="text" id="cnUp" placeholder="如：监管报送接口">
        <div class="help">仅用于检索。<b>此处不产生引用</b>——该凭据被哪个资产使用，在资产「身份适配 → 机器身份」中配置。</div></div>
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
    /* 与 credEdit 同口径 trim：否则纯空格能通过「必填」校验，并原样落库成密钥。 */
    const clientSecret=isOAuth?(document.getElementById("cnOauthSecret").value||"").trim():"";
    const oauth=isOAuth?{ endpoint:(document.getElementById("cnOauthEp").value||"").trim(), mode:document.getElementById("cnOauthMode").value, authMethod:document.getElementById("cnOauthAuth").value, scope:(document.getElementById("cnOauthScope").value||"").trim(), audience:(document.getElementById("cnOauthAud").value||"").trim() }:null;
    if(!name){ markBad("cnName",true); toast("凭据名称为必填"); return; }
    /* 重名保护与 CA 区一致：同名凭据会让「引用资产 / 适用上游」检索与审计口径含糊。 */
    if(CRED_LIST.some(x=>x.name===name)){ markBad("cnName",true); toast("同名凭据已存在："+name); return; }
    if(isBasic){ if(!user||!pass.trim()){ markBad("cnUser",!user); markBad("cnPass",!pass.trim()); toast("Basic：用户名与口令均为必填"); return; } }
    else if(isKey){ if(!apikey.trim()){ markBad("cnKey",true); toast("API-Key：密钥值为必填"); return; } if(!field){ markBad("cnField",true); toast("API-Key：字段名为必填（如 X-API-Key）"); return; } }
    else if(isOAuth){
      if(!clientId||!clientSecret){ markBad("cnOauthId",!clientId); markBad("cnOauthSecret",!clientSecret); toast("OAuth2 Client：客户端标识 client_id 与客户端密钥 client_secret 为必填"); return; }
      if(!oauth.endpoint){ markBad("cnOauthEp",true); toast("OAuth2 Client 为换取式：令牌端点必填——网关用它换取短时 access token 后再注入"); return; }
      /* 帮助语已写「必须 HTTPS」，此前无任何校验 ⇒ 填 http:// 也能入库。 */
      if(!/^https:\/\//i.test(oauth.endpoint)){ markBad("cnOauthEp",true); toast("令牌端点必须为 HTTPS："+oauth.endpoint); return; }
      if(oauth.mode!=="client_credentials"){ markBad($("#cnOauthMode"), true); toast("当前版本仅承载 client_credentials；password / mTLS 换 token 在后续版本提供"); return; }
    }
    /* ⚠ 库侧不建立引用：「适用上游」只作检索备注（up），不得写入 assets（引用资产）。
       「哪个资产用哪条凭据」在资产「身份适配 → 机器身份」侧配置。 */
    CRED_LIST.push({ id:"cred-"+Date.now().toString(36), name, type, where, up: up, user: user, inj: inj, oauth: oauth, clientId: clientId, assets: [], rot: "", st:"已启用" });
    CRED_PG.c1 = Math.max(1, Math.ceil(CRED_LIST.length / AU_PAGE));
    closeDlg(); toast("已新建凭据「"+name+"」：明文加密托管、不可回读，2 秒内全节点生效（变更入审计，演示）"); saveDemoState(); renderCred(); credTab("c1");
  };
}
function credRotate(id){
  const c=credById(id); if(!c) return;
  openDlg("轮换凭据 · "+c.name,"凭据变更一律以「轮换（替换）」完成，界面不提供查看明文。",`
    ${refsOf("cred", c.id).length? `<div class="note warn">该凭据正被 <b>${esc(refsOf("cred", c.id).join("、"))}</b> 引用：选「立即失效」将使其上游注入立刻失败，请求返回 <b>502</b>；建议用「双值过渡」。</div>` : `<div class="note">当前无资产引用该凭据。</div>`}
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
    /* ★ 2026-10-10（R19）：轮换改变该凭据的生效值 ⇒ 属生效面动作，与同页启停 / 删除同档走二次认证。 */
    closeDlg();
    ask2FA("轮换凭据「"+c.name+"」", ()=>{
      c.rot=AU_TS_STAMP.slice(0, 10); c.rotMode=dual?"dual":"now"; if(dual) c.rotKeepDays=Number(days);
      toast("凭据「"+c.name+"」已轮换："+(dual?("双值过渡（旧值保留 "+days+" 天）"):"立即失效")+"，变更入审计（演示）");
      saveDemoState(); renderCred(); credTab("c1");
    }, null, dual?("轮换后上游即刻改用新值，旧值保留 "+days+" 天供平滑切换。") : "轮换后旧值<b>立即失效</b>，上游注入即刻改用新值。");
  };
}
function credToggle(id){
  const c=credById(id); if(!c) return;
  const refs=refsOf("cred", c.id);
  /* 启停是**生效面**动作（改变该凭据是否参与上游注入）⇒ 与同模块另 5 页同档：走二次认证。
     此前「启用」直接落库、「停用」只走普通确认，同组同名模块两套档位属硬伤。 */
  if(c.st!=="已启用"){
    ask2FA("启用凭据「"+c.name+"」",
      ()=>{ c.st="已启用"; toast("凭据「"+c.name+"」已启用（演示）"); saveDemoState(); renderCred(); credTab("c1"); },
      null,
      "启用后该凭据<b>即刻参与上游注入</b>。"+(refs.length? "当前被 <b>"+esc(refs.join("、"))+"</b> 引用。" : "当前无资产引用该凭据。")+"<b>本次变更入审计</b>。");
    return;
  }
  ask2FA("停用凭据「"+c.name+"」",
    ()=>{ c.st="已停用"; toast("凭据「"+c.name+"」已停用（变更入审计，演示）"); saveDemoState(); renderCred(); credTab("c1"); },
    null,
    (refs.length? "该凭据正被 <b>"+esc(refs.join("、"))+"</b> 引用：停用后其上游注入失败，请求返回 <b>502</b>，须先替换或解除引用。" : "")
    +"停用不等于删除：凭据保留在库中，可随时重新启用。<b>停用动作入审计</b>。");
}
function credDel(id){
  const c=credById(id); if(!c) return;
  if(refsOf("cred", c.id).length){ openDlg("无法删除 · "+c.name,`该凭据被 <b>${esc(refsOf("cred", c.id).join("、"))}</b> 引用，受删除保护。`,`
    <div class="note">请先在资产「身份适配 → 机器身份」中<b>解除引用</b>（改用其它凭据或切到「不注入」），再回到本页删除。</div>`); return; }
  ask2FA("删除凭据「"+c.name+"」",
    ()=>{ const i=CRED_LIST.indexOf(c); if(i>=0) CRED_LIST.splice(i,1); toast("凭据「"+c.name+"」已删除（入审计，演示）"); saveDemoState(); renderCred(); credTab("c1"); },
    null, "删除后<b>不可恢复</b>；库中记录与历史引用一并清理。<b>该动作入审计</b>。");
}
/* 反向引用清单：三个分区（凭据 / 信任锚 / mTLS 客户端证书）共用同一套「只读弹窗」构造器，
   只在「摘要字段」与「挂载路径」上不同。kind: "cred" | "ca" | "mtls" 决定标题量词与路径。
   ⚠ 只读视图：底部只留一个「关闭」，不提供「取消 / 确定」这对无意义动作。 */
function refMount(kind){
  return kind==="ca" ? "上游 TLS 校验 → 自定义信任锚（根 CA）"
       : kind==="mtls" ? "上游 TLS 校验 → 客户端证书（mTLS）"
       : "托管凭据";
}
function refNoun(kind){ return kind==="ca"?"信任锚":kind==="mtls"?"客户端证书":"凭据"; }
function openRefDlg(kind, obj, meta){
  const refs=refsOf(kind, obj.id); const cnt=refs.length, mount=refMount(kind); const where=(kind==="cred")?"身份适配 → 机器身份":"代理与上游";
  const body=cnt? `${meta}
    <div class="sec-t">引用资产</div>
    <div class="dlg-scroll"><div class="ref-list">
      ${refs.map(a=>`<div class="ref-item">
        <div class="ri-main"><div class="ri-name">${esc(a)}</div><div class="ri-path">${where} → ${mount}</div></div>
        <button class="btn link" onclick="refGo(this)" data-an="${esc(a)}">打开资产</button>
      </div>`).join("")}
    </div></div>
    <div class="note blue">本清单为<b>反向引用</b>只读视图；解除引用需在对应资产的「${where} → ${mount}」中操作。查看动作<b>入审计</b>。</div>`
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
    <div class="rm"><span class="k">最近轮换</span><span class="v">${c.rot?esc(c.rot):"—"}</span></div>
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

/* ★ 2026-10-10（R12）：DN（主体 Subject / 颁发者）的**语义断点** —— 与页④「登录入口」
   host 列同体例：keep-all 禁止盲目断词，显式在 RDN 分隔符（`,`）与域名点（`.`）后插 `<wbr>`，
   `overflow-wrap:anywhere` 仅作兜底。此前是 `word-break:break-all` ⇒ `CN=Bank Internal Issuing CA`
   会断成 `...Issu` / `ing CA`，长标识的断点落在**词中间**，读起来像被截断。 */
function dnWbr(s) {
  return esc(String(s == null ? "" : s)).replace(/\./g, ".<wbr>").replace(/,/g, ",<wbr>");
}

/* —— CA 管理（信任锚） —— */
function caRows(){
  const host=document.getElementById("pg-cred"); if(!host) return;
  const tb=host.querySelector("#caTbl tbody"); if(!tb) return;
  /* ★ 2026-10-10（R11）：c2 筛选（与 c1 同体例）—— 搜索名称 / 标识 / 类型 / 主体 / 指纹 / 引用资产 */
  const _k=(host.querySelector("#caK")||{}).value||"", _ks=_k.trim().toLowerCase();
  const _s=(host.querySelector("#caFSt")||{}).value||"";
  const _all=CA_LIST.filter(c=>(!_ks||[c.name,c.code||"",c.type,c.subj||"",c.fp||""].concat(c.assets||[]).join(" ").toLowerCase().includes(_ks))&&(!_s||c.st===_s));
  const cRows=credSlice(_all, "c2");
  credPager("c2", "caPager", _all.length, "个信任锚", "分页只作用于本表");
  tb.innerHTML = cRows.length ? cRows.map(c=>`<tr>
    <td><b>${esc(c.name)}</b><div class="muted">${esc(c.code)}</div></td>
    <td>${esc(c.type)}</td>
    <td class="muted">${dnWbr(c.subj)}</td>
    <td class="col-dt">${esc(c.exp)}</td>
    <td class="muted" title="SHA-256 指纹（演示截断）">${esc(c.fp)}</td>
    <td>${refCell(refsOf("ca", c.id), c.id, "ca")}</td>
    <td>${stTag(c.st)}</td>
    <td class="cell-op"><span class="opgrp">
      <button class="btn link" id="caView_${c.id}" data-id="${c.id}" onclick="caView('${c.id}')">查看</button>
      <button class="btn link" id="caEdit_${c.id}" data-id="${c.id}" onclick="caEdit('${c.id}')">编辑</button>
      <button class="btn link" id="caRotate_${c.id}" data-id="${c.id}" onclick="caRotate('${c.id}')">轮换</button>
      <button class="btn link danger" id="caDel_${c.id}" data-id="${c.id}" onclick="caDel('${c.id}')">删除</button>
    </span></td></tr>`).join("") :
    (_ks || _s)
      ? emptyRowBtn(8, "没有符合条件的信任锚", null, null, "caClearF")
      : idEmptyRow(8, "尚未上传信任锚 · 上传内网私有 PKI / 自签证书后，供上游 TLS 引用");
}
/* ★ R61·轮9：CA / mTLS 台账表的空态清空出口 —— 两表筛选直读 DOM（#caK / #caFSt、#mtlsK / #mtlsFSt），
   与 wsF() 驱动的 8 类表不同，故不能复用 wsClearF；沿用本表既有的内联 onclick 范式。 */
function caClearF(){ var h=document.getElementById("pg-cred"); if(!h) return; var k=h.querySelector("#caK"); if(k) k.value=""; var s=h.querySelector("#caFSt"); if(s) s.value=""; CRED_PG.c2=1; caRows(); toast("已清空筛选条件（演示）"); }
function mtlsClearF(){ var h=document.getElementById("pg-cred"); if(!h) return; var k=h.querySelector("#mtlsK"); if(k) k.value=""; var s=h.querySelector("#mtlsFSt"); if(s) s.value=""; CRED_PG.c3=1; mtlsRows(); toast("已清空筛选条件（演示）"); }
/* ★ R61·轮12：本表（c1）的三个筛选控件直读 DOM（#credK / #credFType / #credFSt），**不经 wsF()**
   ⇒ 空态「清空筛选条件」原先写的 `data-ws="wsClearF" data-v="cred"` 是**死按钮**：
   `wsReList("cred")` 里 `wsCfg("cred")` 无定义即 return，点了没有任何反应。
   （同文件上方注释已写明「与 wsF() 驱动的 8 类表不同，故不能复用 wsClearF」—— 注释对、代码错。）
   范式与 caClearF / mtlsClearF 一致：清 DOM → 复位页码 → 重渲染 → 提示。 */
function credClearF(){ var h=document.getElementById("pg-cred"); if(!h) return; var k=h.querySelector("#credK"); if(k) k.value=""; var t=h.querySelector("#credFType"); if(t) t.value=""; var s=h.querySelector("#credFSt"); if(s) s.value=""; CRED_PG.c1=1; credRows(); toast("已清空筛选条件（演示）"); }
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
    /* ★ 资产侧「上游 TLS 校验 → 自定义信任锚」存的是**锚名**（a._tlsCa），不是 id ⇒
       改名必须级联改引用，否则引用失联：本页「引用资产」列变空、caDel 的引用保护失效，
       被在线资产使用的锚会被当成「未被引用」直接删除。 */
    const oldName=c.name, oldWithCode=oldName+"（"+c.code+"）", newWithCode=name+"（"+c.code+"）";
    if(name!==oldName){
      ASSETS.forEach(function(a){
        if(a._tlsCa===oldName) a._tlsCa=name;
        else if(a._tlsCa===oldWithCode) a._tlsCa=newWithCode;
      });
      /* 跨对象改动：显式落盘，不等页面切换时的统一保存点。 */
      if(typeof saveDemoState==="function") saveDemoState();
    }
    c.name=name; c.type=document.getElementById("ceType").value;
    /* ★ 2026-10-10（R14）：改**类型**此前不落盘（仅「改名」分支调了 saveDemoState）⇒ 硬刷新 /
       直开新页后类型改动丢失；同页 c1 / c3 的编辑均显式落盘。改为无条件落盘。 */
    if(typeof saveDemoState==="function") saveDemoState();
    closeDlg(); toast("信任锚「"+name+"」已更新（仅名称 / 类型；证书内容变更请用「轮换」，变更入审计）（演示）"); renderCred(); credTab("c2");
  };
}

/* ★ 2026-10-11（R17）：上传信任锚此前把**展示层缺省符「（上传）」**直接写进 `code`（标识）字段 ——
   `code` 会被列表子行 / 编辑弹窗只读位 / 引用清单摘要渲染，并参与搜索；多条上传项的「标识」于是
   全部相同、失去区分度（与 R14 裁决⑤「展示层缺省符不得当数据落库」同族）。
   改为按名称派生一个稳定、唯一的标识（非 ASCII 名称退化为 `anchor-` 前缀 + 短后缀）。 */
function caUploadCode(nm){
  const s=String(nm||"").replace(/[^0-9A-Za-z]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase();
  return (s||"anchor")+"-"+Date.now().toString(36).slice(-4);
}
function caUp(){
  openDlg("上传信任锚","内网私有 PKI / 自签证书在此登记；仅托管公钥证书，不含私钥。",`
    <div class="form-grid">
      <div class="fld"><label>名称 <span class="req">*</span></label><input type="text" id="caName" placeholder="如：数据报送域根 CA"></div>
      <div class="fld"><label>类型 <span class="req">*</span></label><select id="caType"><option>根 CA</option><option>中间 CA</option><option>自签叶证书</option></select></div>
      <div class="fld full"><label>证书内容 <span class="req">*</span></label><textarea id="caPem" rows="5" placeholder="-----BEGIN CERTIFICATE-----&#10;…&#10;-----END CERTIFICATE-----" style="${taStyle}"></textarea>
        <div class="help">粘贴 PEM，或上传 .pem / .crt / .cer 文件。</div></div>
      <div class="fld full"><label>上传文件 <span class="muted">（可选）</span></label><input type="file" id="caFile" accept=".pem,.crt,.cer"></div>
      <div class="fld full"><label>有效期至 <span class="req">*</span></label><input type="text" id="caExp" value="${addDays(AU_TS_STAMP.slice(0, 10), 365)}" placeholder="YYYY-MM-DD">
        <div class="help">演示环境不解析 X.509：默认值按演示期预填（今日 + 365 天），请按证书实际「Not After」填写；主体与指纹留「待解析」由真实解析补齐。</div></div>
    </div>`,"lg");
  const f=document.getElementById("caFile");
  if(f) f.addEventListener("change",()=>{
    if(!(f.files&&f.files[0])) return;
    const fl=f.files[0];
    if(typeof FileReader==="undefined"){ toast("当前环境不支持读取本地文件，请把 PEM 内容粘贴到上方文本框"); return; }
    const rd=new FileReader();
    rd.onload=()=>{ const ta=document.getElementById("caPem"); if(ta) ta.value=String(rd.result||""); toast("已读取 "+fl.name+"（"+Math.max(1,Math.round(fl.size/1024))+" KB）；本演示不解析证书内容，请确认「有效期至」按证书实际 Not After 填写"); try{ markBad("caPem", false); }catch(e){} };
    rd.onerror=()=>{ toast("文件读取失败："+fl.name+"，请改为粘贴 PEM 内容"); };
    rd.readAsText(fl);
  });
  document.getElementById("dlg1Ok").onclick=()=>{
    const name=(document.getElementById("caName").value||"").trim();
    const type=document.getElementById("caType").value;
    const pem=(document.getElementById("caPem").value||"").trim();
    if(!name||!pem){ markBad("caName",!name); markBad("caPem",!pem); toast("名称与证书内容为必填"); return; }
    /* ★ 2026-10-10（R14）：内容须是 PEM 证书 —— 此前接受任意串；主体 / 指纹一律落
       「（已解析主体）」这类**占位串**，随后被当成证书真值在列表 / 查看弹窗 / 引用清单展示。
       本演示不解析 X.509 ⇒ 至少校验 PEM 头，未解析字段落「待解析」（不冒充已解析值），
       有效期由录入位提供（此前也无法录入真实值）。 */
    if(!/-----BEGIN CERTIFICATE-----/.test(pem)){ markBad("caPem",true); toast("请粘贴 PEM 格式证书（须含 -----BEGIN CERTIFICATE-----）"); return; }
    const exp=(document.getElementById("caExp").value||"").trim();
    if(!bzYmdOk(exp)){ markBad("caExp",true); toast("有效期须为有效的 YYYY-MM-DD 日期"); return; }
    if(CA_LIST.some(c=>c.name===name)){ markBad("caName",true); toast("同名信任锚已存在："+name); return; }
    CA_LIST.push({ id:"ca-"+Date.now().toString(36), name, code:caUploadCode(name), type, subj:"待解析", exp: exp, fp:"待解析", assets:[], st: credExpSt(exp) });
    closeDlg(); toast("已上传信任锚「"+name+"」：主体 / 指纹待解析，变更入审计（演示）"); saveDemoState(); renderCred(); credTab("c2");
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
    <div class="note">此处仅托管<b>公钥证书</b>；私钥不在此库——mTLS 客户端证书的私钥在「mTLS 客户端证书」分区中托管，私钥不出平台。</div>`,"lg");
}
function caRotate(id){
  const c=caById(id); if(!c) return;
  openDlg("轮换信任锚 · "+c.name,"轮换<b>就地更新该锚的证书内容</b>（同一台账记录，不新增条目）。",`
    <div class="fld"><label>新证书内容 <span class="req">*</span></label><textarea id="crPem" rows="4" placeholder="-----BEGIN CERTIFICATE-----…" style="${taStyle}"></textarea>
      <div class="help">演示环境不解析 X.509：主体与指纹将置「待解析」，由真实解析补齐。</div></div>
    <div class="fld"><label>有效期至 <span class="req">*</span></label><input type="text" id="crExp" value="${addDays(AU_TS_STAMP.slice(0, 10), 365)}" placeholder="YYYY-MM-DD">
      <div class="help">默认值按演示期预填（今日 + 365 天），请按证书实际「Not After」填写。</div></div>
    <div class="note">若上游切换 CA 期间需要<b>新旧并存过渡</b>（避免断链），先用<b>「上传信任锚」把新锚另存为一条</b>，待上游全部切换完成后再删除旧锚 —— 本动作<b>不做并存</b>。<b>轮换入审计</b>。</div>`,"lg");
  document.getElementById("dlg1Ok").onclick=()=>{
    const v=(document.getElementById("crPem").value||"").trim();
    if(!v){ markBad("crPem", true); toast("请粘贴新证书内容"); return; }
    /* ★ 2026-10-10（R15）：轮换与上传同属 PEM 录入 —— 上传已校形态（caUp），轮换却只判非空
       ⇒ 同一口径只闭合了一半。此处补齐（正则与 caUp 完全一致）。 */
    if(!/-----BEGIN CERTIFICATE-----/.test(v)){ markBad("crPem", true); toast("请粘贴 PEM 格式证书（须含 -----BEGIN CERTIFICATE-----）"); return; }
    const _cx=(document.getElementById("crExp").value||"").trim();
    if(!bzYmdOk(_cx)){ markBad("crExp",true); toast("有效期须为有效的 YYYY-MM-DD 日期"); return; }
    /* ★ 2026-10-10（R16）：就地更新的是**证书内容** —— 旧证书的主体 / 指纹随之作废。
       原实现两者原样保留（列表展示的是**旧证书**的主体与指纹，与「已轮换」自相矛盾），
       有效期还写死「基准日 + 365」、不接受真实值。三处一并按 caUp 同口径处理。 */
    /* ★ 2026-10-10（R19）：轮换改变信任锚证书内容（生效面）⇒ 走二次认证，与同页删除同档。 */
    closeDlg();
    ask2FA("轮换信任锚「"+c.name+"」", ()=>{
      c.exp=_cx; c.subj="待解析"; c.fp="待解析"; c.st=credExpSt(_cx);
      toast("信任锚「"+c.name+"」已轮换：证书内容就地更新（入审计，演示）");
      saveDemoState(); renderCred(); credTab("c2");
    }, null, "轮换后证书内容就地更新，引用该锚的上游 TLS 校验即刻改用新证书。");
  };
}
function caDel(id){
  const c=caById(id); if(!c) return;
  /* 用词：本动作是**从平台信任库移除**（并非发布 CRL 的证书吊销），与 mTLS 分区统一为「删除」。 */
  if(refsOf("ca", c.id).length){ openDlg("无法删除 · "+c.name,`该信任锚被 <b>${esc(refsOf("ca", c.id).join("、"))}</b> 引用，受引用保护。`,`
    <div class="note">请先在资产「代理与上游 → 上游 TLS 校验 → 自定义信任锚」中改用其它锚或改回「平台 CA 校验」，再回到本页删除。</div>`); return; }
  ask2FA("删除信任锚「"+c.name+"」",
    ()=>{ const i=CA_LIST.indexOf(c); if(i>=0) CA_LIST.splice(i,1); toast("信任锚「"+c.name+"」已删除（入审计，演示）"); saveDemoState(); renderCred(); credTab("c2"); },
    null, "删除后引用该锚的上游链路将失去信任来源；该锚当前未被引用，可安全删除。<b>该动作入审计</b>。");
}

/* —— mTLS 客户端证书 —— */
function mtlsRows(){
  const host=document.getElementById("pg-cred"); if(!host) return;
  const tb=host.querySelector("#mtlsTbl tbody"); if(!tb) return;
  /* ★ 2026-10-10（R11）：c3 筛选（与 c1 同体例） */
  const _k=(host.querySelector("#mtlsK")||{}).value||"", _ks=_k.trim().toLowerCase();
  const _s=(host.querySelector("#mtlsFSt")||{}).value||"";
  const _all=MTLS_LIST.filter(c=>(!_ks||[c.name,c.id||"",c.subj||"",c.issuer||"",c.fp||""].concat(c.assets||[]).join(" ").toLowerCase().includes(_ks))&&(!_s||c.st===_s));
  const mRows=credSlice(_all, "c3");
  credPager("c3", "mtlsPager", _all.length, "份证书", "分页只作用于本表");
  tb.innerHTML = mRows.length ? mRows.map(c=>`<tr>
    <td><b>${esc(c.name)}</b><div class="muted">${esc(c.id)}${c.keyEnc?" · 口令加密":" · 明文托管"}${c.up?" · "+esc(c.up):""}</div></td>
    <td class="muted">${dnWbr(c.subj)}</td>
    <td class="muted">${dnWbr(c.issuer)}</td>
    <td class="col-dt">${esc(c.exp)}</td>
    <td class="muted" title="SHA-256 指纹（演示截断）">${esc(c.fp)}</td>
    <td>${refCell(refsOf("mtls", c.id), c.id, "mtls")}</td>
    <td>${stTag(c.st)}</td>
    <td class="cell-op"><span class="opgrp">
      <button class="btn link" id="mtlsView_${c.id}" data-id="${c.id}" onclick="mtlsView('${c.id}')">查看</button>
      <button class="btn link" id="mtlsEdit_${c.id}" data-id="${c.id}" onclick="mtlsEdit('${c.id}')">编辑</button>
      <button class="btn link" id="mtlsRotate_${c.id}" data-id="${c.id}" onclick="mtlsRotate('${c.id}')">轮换</button>
      <button class="btn link danger" id="mtlsDel_${c.id}" data-id="${c.id}" onclick="mtlsDel('${c.id}')">删除</button>
    </span></td></tr>`).join("") :
    (_ks || _s)
      ? emptyRowBtn(8, "没有符合条件的客户端证书", null, null, "mtlsClearF")
      : idEmptyRow(8, "尚未上传客户端证书 · 上传证书与私钥后，供上游双向 TLS 握手引用");
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
    closeDlg(); toast("客户端证书「"+name+"」已更新（仅名称 / 适用上游；证书与私钥变更请用「轮换」，变更入审计）（演示）"); saveDemoState(); renderCred(); credTab("c3");
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
      <div class="fld full"><label>有效期至 <span class="req">*</span></label><input type="text" id="muExp" value="${addDays(AU_TS_STAMP.slice(0, 10), 365)}" placeholder="YYYY-MM-DD">
        <div class="help">演示环境不解析 X.509：默认值按演示期预填（今日 + 365 天），请按证书实际「Not After」填写；主体与指纹留「待解析」由真实解析补齐。</div></div>
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
    /* ★ 2026-10-10（R14）：同 caUp —— 校验 PEM 形态，未解析字段落「待解析」，有效期由录入位提供。 */
    if(!/-----BEGIN CERTIFICATE-----/.test(cert)){ markBad("muCert",true); toast("请粘贴 PEM 格式客户端证书（须含 -----BEGIN CERTIFICATE-----）"); return; }
    if(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key)){ markBad("muKey",true); toast("请粘贴 PEM 格式私钥（须含 -----BEGIN … PRIVATE KEY-----）"); return; }
    const mExp=(document.getElementById("muExp").value||"").trim();
    if(!bzYmdOk(mExp)){ markBad("muExp",true); toast("有效期须为有效的 YYYY-MM-DD 日期"); return; }
    MTLS_LIST.push({ id:"mtls-"+Date.now().toString(36), name, subj:"待解析", issuer:"待解析", exp: mExp, fp:"待解析", up: up, keyEnc: !!keyPass, assets: [], rot: "", st: credExpSt(mExp) });
    closeDlg(); toast("已上传客户端证书「"+name+"」：私钥已托管且不出平台（"+(keyPass?"口令加密":"明文")+"），主体 / 指纹待解析，变更入审计（演示）"); saveDemoState(); renderCred(); credTab("c3");
  };
}
function mtlsView(id){
  const c=mtlsById(id); if(!c) return;
  openDlg("mTLS 客户端证书 · "+c.name,"",`
    <div class="kv"><span class="k">主体（Subject）</span><div>${esc(c.subj)}</div></div>
    <div class="kv"><span class="k">颁发者</span><div>${esc(c.issuer)}</div></div>
    <div class="kv"><span class="k">有效期至</span><div>${esc(c.exp)}${c.st==="即将过期"?` <span class="tag t-warn">即将过期</span>`:""}</div></div>
    <div class="kv"><span class="k">指纹（SHA-256）</span><div class="muted">${esc(c.fp)}</div></div>
    ${c.up?`<div class="kv"><span class="k">适用上游</span><div>${esc(c.up)}</div></div>`:""}
    <div class="kv"><span class="k">最近轮换</span><div class="muted">${c.rot?esc(c.rot):"—"}</div></div>
    <div class="kv"><span class="k">引用资产</span><div>${refCell(refsOf("mtls", c.id))}</div></div>
    <div class="kv"><span class="k">私钥</span><div><span class="tag t-ok">已托管</span> <span class="muted">不可回读 · 不可导出 · 不出平台</span>${c.keyEnc?' <span class="tag t-info">口令加密</span>':' <span class="muted">明文托管</span>'}</div></div>
    <div class="note">网关在<b>握手阶段自动出示</b>本证书完成双向 TLS；资产侧在「代理与上游 → 客户端证书（mTLS）」引用。</div>`,"lg");
}
function mtlsRotate(id){
  const c=mtlsById(id); if(!c) return;
  openDlg("轮换 mTLS 客户端证书 · "+c.name,"轮换<b>就地更新该证书与私钥</b>（同一台账记录，不新增条目）。",`
    <div class="fld"><label>新客户端证书（PEM） <span class="req">*</span></label><textarea id="mrCert" rows="3" placeholder="-----BEGIN CERTIFICATE-----…" style="${taStyle}"></textarea></div>
    <div class="fld"><label>新私钥（PEM） <span class="req">*</span></label><textarea id="mrKey" rows="3" placeholder="-----BEGIN PRIVATE KEY-----…" style="${taStyle}"></textarea></div>
    <div class="fld" id="mrPassWrap"><label>新私钥口令 <span class="muted">（选填，仅加密私钥需要）</span></label><input type="password" id="mrPass" placeholder="新私钥已加密时填写；明文留空">
      <div class="help">口令仅用于平台侧解密私钥，<b>不落浏览器、不可回读</b>；与私钥同源托管。</div></div>
    <div class="fld"><label>新证书有效期至 <span class="req">*</span></label><input type="text" id="mrExp" value="${addDays(AU_TS_STAMP.slice(0, 10), 365)}" placeholder="YYYY-MM-DD">
      <div class="help">演示环境不解析 X.509：默认值按演示期预填（今日 + 365 天），请按证书实际「Not After」填写；主体 / 颁发者 / 指纹将置「待解析」。</div></div>
    <div class="note">若上游切换期间需要<b>新旧并存过渡</b>（避免握手失败），先用<b>「上传客户端证书」把新证另存为一条</b>，待切换完成后再删除旧证 —— 本动作<b>不做并存</b>。<b>轮换入审计</b>。</div>`,"lg");
  document.getElementById("dlg1Ok").onclick=()=>{
    const cert=(document.getElementById("mrCert").value||"").trim();
    const key=(document.getElementById("mrKey").value||"").trim();
    if(!cert||!key){ markBad("mrCert",!cert); markBad("mrKey",!key); toast("新客户端证书与私钥均为必填"); return; }
    /* ★ 2026-10-10（R15）：同 mtlsUp —— 校 PEM 形态（证书与私钥各一）。 */
    if(!/-----BEGIN CERTIFICATE-----/.test(cert)){ markBad("mrCert",true); toast("请粘贴 PEM 格式客户端证书（须含 -----BEGIN CERTIFICATE-----）"); return; }
    if(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key)){ markBad("mrKey",true); toast("请粘贴 PEM 格式私钥（须含 -----BEGIN … PRIVATE KEY-----）"); return; }
    const keyPass=((document.getElementById("mrPass")||{}).value||"");
    if(/encrypted/i.test(key) && !(keyPass||"").trim()){ markBad("mrKey", true); toast("私钥为加密格式（ENCRYPTED），请填写「新私钥口令」"); return; }
    const _mx=(document.getElementById("mrExp").value||"").trim();
    if(!bzYmdOk(_mx)){ markBad("mrExp",true); toast("有效期须为有效的 YYYY-MM-DD 日期"); return; }
    /* ★ 2026-10-10（R16）：同 caRotate —— 新旧证书不同，旧证书的主体 / 颁发者 / 指纹随之作废，
       须置「待解析」而非原样保留（否则列表展示的是**旧证书**的身份信息）。 */
    /* ★ 2026-10-10（R19）：轮换改变证书与私钥（生效面）⇒ 走二次认证，与同页删除同档。 */
    closeDlg();
    ask2FA("轮换客户端证书「"+c.name+"」", ()=>{
      c.exp=_mx; c.subj="待解析"; c.issuer="待解析"; c.fp="待解析"; c.st=credExpSt(_mx); c.rot=AU_TS_STAMP.slice(0, 10); c.keyEnc=!!keyPass;
      toast("客户端证书「"+c.name+"」已轮换：证书与私钥就地更新（入审计，演示）");
      saveDemoState(); renderCred(); credTab("c3");
    }, null, "轮换后网关上游握手即刻改用新证书与私钥。");
  };
}
function mtlsDel(id){
  const c=mtlsById(id); if(!c) return;
  if(refsOf("mtls", c.id).length){ openDlg("无法删除 · "+c.name,`该客户端证书被 <b>${esc(refsOf("mtls", c.id).join("、"))}</b> 引用，受引用保护。`,
    `<div class="note">请先在资产「代理与上游 → 客户端证书（mTLS）」中改用其它证书或改为「不使用（单向 TLS）」，再回到本页删除。</div>`); return; }
  ask2FA("删除 mTLS 客户端证书「"+c.name+"」",
    ()=>{ const i=MTLS_LIST.indexOf(c); if(i>=0) MTLS_LIST.splice(i,1); toast("客户端证书「"+c.name+"」已删除（入审计，演示）"); saveDemoState(); renderCred(); credTab("c3"); },
    null, "删除后证书与托管的私钥<b>一并清理</b>，<b>该动作入审计</b>；请确认无上游仍依赖该证书。");
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
     · 匿名与 public 只免裁决链第 ⑤~⑦ 环，① ② ③ 与 ⑧ 均照常执行（本族三页均属前段，故永不豁免）。
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
/* 裁决顺序 9 环（页级说明共用） */
var WS_CHAIN = "① URI 规范化 / 方法 / 请求体约束 → ② WAF 与 Origin / 跳转校验、请求头清洗 → ③ 网关级 / 登录级 / 资产级全局限流 → ④ public 判定 → ⑤ 主体认证 → ⑥ 资产访问状态 → ⑦ 访问对象准入（统一 ABAC 一次联合求值） → ⑧ 动态防护与行为处置 → ⑨ 上游认证注入与代理";

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

/* ★ R61·轮16：WS store **判版常量**。原 WS 无 schema ⇒ 与 RL（第十七轮起即有 schema 迁移判据）
   口径不对称；改 wsSeed 字段形状后，旧 localStorage 快照会让新判据读旧值。 */
const WS_SCHEMA = 1;

function wsSeed() {
  return {
    schema: WS_SCHEMA,           /* ★ R61·轮16：store 判版 · 与 rlSeed 同口径 */
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
      { v: "203.0.113.77",       ver: "IPv4", scope: "平台级", note: "恶意爬虫出口", at: "2026-09-16", op: "李俊" },
      { v: "192.0.2.180",        ver: "IPv4", scope: "平台级", note: "漏洞扫描器", at: "2026-09-17", op: "王芳" },
      { v: "2001:db8:bad::/48",  ver: "IPv6", scope: "平台级", note: "已知恶意出口段（IPv6）", at: "2026-09-18", op: "李俊" }
    ],
    white: [
      { v: "10.20.30.0/24",      ver: "IPv4", scope: "平台级", note: "内部扫描器出口", at: "2026-09-10", op: "张伟" },
      { v: "192.0.2.77",         ver: "IPv4", scope: "平台级", note: "合作方专线", at: "2026-09-19", op: "李俊" },
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
      { name: "系统文件探测特征", scope: "请求体", re: "(?i)etc/passwd",       op: "李俊", on: true, at: "2026-09-17" }
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
var WS_DATE = AU_TS_STAMP.slice(0, 10);   /* 新增条目的「添加时间」= 本模块声明的演示基准日（AU_TS_STAMP 的日期部分，见文件头「即「今天」」）。★ R61·轮8：原取**真实日期**（wsNow().slice(0,10)）⇒ 模块内出现两个「今天」：种子 at=2026-09-12、声明基准日=2026-09-30、新增条目=真实当天。 */

function wsLoad() {
  WS = wsSeed();
  /* ★ R61·轮16：store **判版**（与 rlLoad 同口径）—— 快照 schema 与现行不符 ⇒ **整包丢弃**回落 seed。
     原实现无判版：逐键搬迁会把上一版口径的字段原样带进来，字段形状变更后新判据读旧值。 */
  try {
    var s = JSON.parse(localStorage.getItem(WS_KEY) || "null");
    if (s && typeof s === "object" && s.schema === WS_SCHEMA) { for (var k in s) WS[k] = s[k]; }
  } catch (e) { /* 演示环境：忽略 */ }
  /* 兼容旧快照：补齐后加的字段 + 把「字符串数组」形态的 IP 名单升为对象列表（改 wsSeed 后必看） */
  var d = wsSeed();
  if (!WS.req || typeof WS.req !== "object") WS.req = d.req;
  else { for (var rk in d.req) { if (WS.req[rk] === undefined) WS.req[rk] = d.req[rk]; } }
  /* ★ 2026-09-23 第十七轮：rate / baseline / 覆盖字典 此前**无逐键补齐、无类型兜底**，与 req 的处理不对称。
     旧存档缺 rate 子键 ⇒ 页② 阈值表格渲染出 undefined；assetRate 为 null ⇒ Object.keys(null) 抛错 ⇒ **整页白屏**。
     此处按 req 同口径逐键补齐 + 对象兜底（真实旧存档不再失真）。 */
  if (!WS.rate || typeof WS.rate !== "object") WS.rate = d.rate;
  else {
    for (var rt in d.rate) { if (WS.rate[rt] === undefined) WS.rate[rt] = d.rate[rt]; }
    /* ★ 2026-09-30：补缺键**不校额度关系** ⇒ 存量存档里的倒挂值被原样保留：页①「额度关系」
       note 会渲染出「外层 ≥ 内层」与「外层的数 < 内层的数」并存的自相矛盾文案。
       编辑路径的守卫（本文件 rate 分支）只拦**新写入**，Q35 只守**种子值** —— 都修不了存量。
       故在此做**存量归一**：同为「来源 IP」计数依据的两维必须 外层 ≥ 内层
       （账号维按失败计数、资产级按 IP/用户 × 资产，口径不同，不参与比较）。
       另：网关 CC 恰为 1000 是 PRD v1.61 之前的旧出厂阈值（已改 20000）⇒ 升为现行默认，
       而不是把它当「用户刻意配置」只抬到内层值。 */
    var _rCc = Number(WS.rate.gatewayCc), _rIp = Number(WS.rate.loginIp);
    if (!isFinite(_rCc) || _rCc < 1) _rCc = d.rate.gatewayCc;
    if (!isFinite(_rIp) || _rIp < 1) _rIp = d.rate.loginIp;
    if (_rCc === 1000) _rCc = d.rate.gatewayCc;
    if (_rCc < _rIp) _rCc = _rIp;
    WS.rate.gatewayCc = _rCc; WS.rate.loginIp = _rIp;
  }
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
  WS.schema = d.schema;                       /* ★ R61·轮16：归一后落定判版 */
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
/* 发布 / 回滚时间：**日期锚定演示基准日**（AU_TS_STAMP 的日期部分）、时刻取真实时分。
   ★ R61·轮8：原取真实系统日 ⇒ 与本页「添加时间」（WS_DATE = 基准日）不同源，
   同页「添加时间」与「发布时间 / 回滚时间」并列两个「今天」。（更早一轮的目的是修「写死日期导致
   回滚时间恒早于操作时间」，该目的由「基准日 + 真实时刻」同样满足：同日内时刻仍随操作前移。） */
function wsNow() {
  var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
  return AU_TS_STAMP.slice(0, 10) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
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
      /* ★ 2026-10-12（R53 · A2-F6）：与页 B 矩阵同口径 —— 「已下线」即停用、不参与授权，
         不得出现在限流 / WAF 的条目级覆盖清单里（否则可给下线条目设阈值 = 死配置）。 */
      if (p.lc === "已下线") return;
      out.push({ key: a.id + "|" + r.id + "|" + p.m + "|" + p.p, entry: a.name + " · " + p.m + " " + p.p, aid: a.id, rid: r.id, m: p.m, p: p.p });
    }); });
  });
  return out;
}
/* 条目级覆盖「按资产下钻」的取值器（2026-09-21 用户反馈「条目级不该从全局下拉里选、太反人类」）：
   条目天然属于某个资产 ⇒ 只在该资产的条目清单里设值。
   ★ 2026-10-12（R53 · A2-F7）：存储键补齐**方法**（`aid|rid|m|path`）—— 页 A / 页 B 的 pathKey 为
   `as.id|r.id|p.m|p.p`（含方法），而此处原为 `aid|rid|path`（不含方法）⇒ 同路径多方法时两条落
   同一 key、互相顶替。两处主键自此同构。 */
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
    (a.res || []).forEach(function (r) { (r.paths || []).forEach(function (p) { if (p.lc === "已下线") return; if (wm.indexOf(p.m) >= 0) hit = true; }); });
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
      var inherit = a.lv <= 2 ? "关闭" : WS.rate.assetAuthed + " " + wsWinUnit();
      return '<tr><td><input type="checkbox" data-ws-sel="r" data-v="' + esc(a.id) + '"' + (wsSel("r")[a.id] ? " checked" : "") + "></td>" +
        "<td>" + esc(a.name) + (ov ? ' <span class="tag t-info">已覆盖</span>' : "") + "</td>" +
        '<td class="mini">' + esc(wsLv(a)) + "</td>" +
        /* ★ 2026-09-23 第十七轮：「未认证」维度出厂默认继承平台阈值，但**从不显示该基准值** ⇒ 填覆盖值时无参照。
           补显平台基准；保留「未认证 继承」字样，Q45 的两行契约不变。 */
        '<td class="mini"><div>未认证 继承（平台 ' + WS.rate.assetAnon + " " + wsWinUnit() + '）</div><div>已认证 ' + esc(inherit) + "</div></td>" +
        '<td><input type="number" min="1" step="1" style="width:100px" aria-label="' + esc(a.name) + ' 未认证覆盖阈值（' + wsWinUnit() + '）" data-ws-arate="' + esc(a.id) + '" data-k="anon" value="' + (ovN != null ? ovN : "") + '" placeholder="继承">' +
        (ovN != null ? ' <button class="btn link" type="button" data-ws="wsARateReset" data-v="' + esc(a.id) + '" data-k="anon">恢复继承</button>' : "") + "</td>" +
        '<td><input type="number" min="1" step="1" style="width:100px" aria-label="' + esc(a.name) + ' 已认证覆盖阈值（' + wsWinUnit() + '）" data-ws-arate="' + esc(a.id) + '" data-k="auth" value="' + (ovA != null ? ovA : "") + '" placeholder="继承">' +
        (ovA != null ? ' <button class="btn link" type="button" data-ws="wsARateReset" data-v="' + esc(a.id) + '" data-k="auth">恢复继承</button>' : "") + "</td>" +
        "<td>" + wsEntryCell(a) + "</td></tr>";
    }
  };
  if (kind === "e") return {                                    /* 条目级覆盖（**按资产下钻**：行 = 该资产已登记入口条目） */
    rows: function () { return WSEAID ? wsEntriesOf(WSEAID) : []; },
    text: function (r) { return String(r.m || "") + " " + String(r.p || ""); },
    ov: function (r) { return wsEntryOv(r.key) != null; },
    unit: "条", flagLabel: "只看已覆盖", ph: "搜索方法 / 路径", cols: 3,
    empty: "该资产未在细粒度资源清单登记 Web 接口条目，无可设条目级覆盖。",
    head: '<th style="width:110px">方法</th><th>路径</th><th style="width:250px">条目级覆盖（' + wsWinUnit() + '）</th>',
    row: function (r) {
      var v = wsEntryOv(r.key);
      return '<tr><td><code class="kr">' + esc(r.m) + '</code></td><td><code>' + esc(r.p) + "</code></td>" +
        '<td><input type="number" min="1" step="1" style="width:110px" aria-label="' + esc(r.m) + ' ' + esc(r.p) + ' 条目级覆盖阈值（' + wsWinUnit() + '）" data-ws-erate="' + esc(r.key) + '" value="' + (v != null ? v : "") + '" placeholder="继承">' +
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
/* ★ R61·轮11：主数取**筛后**（合 50-auth.js:1080 明文口径「分页器与表内工具条取筛后集」）——
   原主数取全量，与紧邻分页器的「共 N 条」在主数位上并列出两个不同数值；全量以括注保留。 */
function wsCount(kind) {
  var cfg = wsCfg(kind), f = wsF(kind), n = wsFilterRows(f, cfg).length, total = cfg.rows().length;
  return "共 " + n + " " + cfg.unit + (n !== total ? "（筛前 " + total + "）" : "");
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
  /* ★ R61（轮7.5）：条目级覆盖数同样不在重渲染锚点上，一并就地同步 ——
     卡片明示两个维度后，数字须与 u2 页签徽标（资产级去重资产数 + 条目级条目数）可对上。 */
  var covREl = document.querySelector("[data-ws-covrent]");
  if (covREl) covREl.textContent = String((WS.entryCov || []).length);
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
  ["pg-websec", "Web 防护（WAF）", "攻击特征检测与处置；观察 / 阻断的唯一合法处"],
  ["pg-rate", "集群级限流", "五类维度的频次限制（不含观察档）"],
  ["pg-reqcon", "请求约束", "体积 / 并发 / 方法白名单 / 下载限速"]
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
/* 页级只读说明：只讲本页所在环节 + 匿名豁免口径；完整 9 环放在可折叠里（默认收起，不占高度） */
function wsPosNote(ring, desc) {
  return '<div class="note blue" style="margin-bottom:14px"><b>执行时序</b>：本页 = 第 <b>' + ring + '</b> 环（' + desc + '），<b>先于任何身份判定</b>。' +
    "全流量生效，含<b>未开通资产</b>与<b>匿名流量</b>；匿名 / public 只免第 <b>⑤~⑦</b> 环，<b>本环照常执行</b>。" +
    '<details class="rb-fold"><summary>查看完整裁决顺序（9 环）</summary><div class="mini" style="margin-top:6px;line-height:1.7">' + WS_CHAIN + "</div></details></div>";
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
    navId: "rlTabs", host: "pg-rulelib", navNodeId: "RlTabsNodeId000001", aria: "WAF 规则库管理分区",
    tabs: RL_TABS, mount: [],
    get: function () { return RLTAB; }, set: function (v) { RLTAB = v; }
  }
};
/* 徽标计数（0 不显示）：页① TAB③ 只数自定义 PCRE（预置基线不可数）；
   页② 只在「覆盖」TAB 上计数（资产级 + 条目级覆盖项合计）。 */
function wsTabCount(g, k) {
  if (g === "rate") {
    if (k === "u2") {
      /* ★ R61：资产级部分与 wsRateCovAssets() 同为**按资产去重**（同一资产被两个维度各覆盖一次只算 1）——
         原实现两个维度各自计数再相加，同一资产被算成 2。本徽标 = 资产级去重资产数 + **条目级覆盖条目数**
         （两类合并计数，对应 u2 页签描述「资产级覆盖 + 条目级覆盖」），故数值可大于覆盖卡的「N 个资产」；
         覆盖卡已另标「条目级覆盖 M 条」明示构成。 */
      var _covU = {};
      Object.keys(WS.assetRate).forEach(function (id) { _covU[id] = 1; });
      Object.keys(WS.assetRateAnon).forEach(function (id) { _covU[id] = 1; });
      return Object.keys(_covU).length + (WS.entryCov || []).length;
    }
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
      '<div class="note">L1~L2 <b>观察</b> · L3~L5 <b>阻断</b>；出厂固定、不可编辑，仅对「未被单资产覆盖」的资产生效。</div>' +
      '<div class="card-sect"><h4>单资产覆盖</h4><span class="sub">覆盖层 L3 · 只存偏离项；勾选多行可批量设置</span></div>' +
      wsListBlock("a") +
    "</div></div>";
}
/* TAB② IP 黑白名单：例外名单（作用域 → 黑名单 → 白名单 → 冲突语义） */
function wsPaneIp() {
  return '<div class="card"><div class="card-h"><h3>IP 黑白名单<span class="sub">名单为清单列表；冲突时黑名单优先</span></h3>' +
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
      '<div class="note">当前特征库版本：<b>' + esc(wsFeatureVer()) + "</b>（随平台版本交付 · SM2 签名下发；与「规则库管理」页<b>同源</b>）。上方<b>自定义 PCRE 为站点自有规则</b>，<b>与特征库互相独立</b>、<b>不随库下发</b>　" +
      /* ★ 2026-09-23 第十七轮：关闭的内置基线须**在规则库页同源可见**（否则两页对同一规则的状态自相矛盾）。 */
      (function () { var off = ["sqli", "xss", "scanner"].filter(function (k) { return WS.baseline[k] === false; }); return off.length ? '<b class="red">已关闭基线：' + off.map(function (k) { return k.toUpperCase(); }).join(" / ") + "</b>（该类规则在规则库页同步标「基线已关」）　" : ""; })() +
      '<button class="btn link" type="button" data-ws="wsGotoLib">前往 WAF 规则库管理 →</button></div>' +
    "</div></div>";
}
/* TAB④ 命中与观测：只读（「命中了记什么、去哪查」）—— 与「可配置的检测规则」不同层，故单列一 TAB */
function wsPaneObserve() {
  return '<div class="card"><div class="card-h"><h3>命中与观测<span class="sub">只读 · 本 TAB 无可配置项</span></h3></div>' +
    '<div class="card-b">' +
      '<div class="card-sect" style="border-top:0;padding-top:0"><h4>命中日志字段</h4><span class="sub">不记录原始敏感值</span></div>' +
      '<div class="note">WAF 命中日志记录：<b>模式 / 规则 ID / 特征库版本 / 处置 / 耗时</b>；<b>不记录原始敏感值</b>。</div>' +
      '<div class="card-sect"><h4>事件归类</h4><span class="sub">唯一归类，不双写</span></div>' +
      '<div class="note">观察命中 → <b>命中事件</b>；阻断命中 / 限流 429 → <b>风险事件</b>；<b>唯一归类、不双写</b>。' +
      "日志在<b>审计事件查询</b>中检索（该页不在本原型范围内）。</div>" +
    "</div></div>";
}
function wsHtmlWaf() {
  return wsHead("pg-websec", "Web 防护（WAF）", "防护模式 / IP 黑白名单 / 攻击检测 / 命中与观测；观察 = 仅记录，阻断 = 拒绝且不进入后续裁决", wsActions('<button class="btn" type="button" data-ws="wsCheck">防护体检</button>')) +
    wsPosNote("②", "WAF 与 Origin / 跳转校验、请求头清洗") +
    /* 检测面 = 本页**前提**：只读、固定六项、无关闭入口 ⇒ 不进 TAB，压成一行常驻（F7.1 规则 1）。
       放在 TAB 之外的理由：切到任何 TAB 都必须能看到「这一层在查什么、且关不掉」。 */
    '<div class="note"><b>检测面</b>（<b>固定六项、无关闭入口</b>，在<b>身份与授权之前</b>检查）：' +
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
    ask2FA("批量导入" + label, function () {
        var arr = isB ? WS.black : WS.white;
        res.add.forEach(function (e) { arr.push(e); });
        wsSaveStore(); wsCurRender(); toast("已导入 " + res.add.length + " 条至" + label + "（演示）");
      }, null,
      "将向<b>" + label + "</b>新增 <b>" + res.add.length + "</b> 条" + (res.dup.length ? "（另有 <b>" + res.dup.length + "</b> 条重复，已跳过）" : "") + "。" +
      (isB ? "黑名单<b>命中即阻断</b>，优先于白名单。" : "白名单<b>只跳过攻击特征检测</b>，<b>不等于放行</b>：限流、主体认证、资产访问状态、ABAC、请求约束与审计<b>照常执行</b>。") +
      '<div style="margin-top:8px;max-height:150px;overflow:auto;border-top:1px dashed var(--line,#dfe3ea);padding-top:6px;line-height:1.7">' + pv +
      (res.add.length > 12 ? '<br><span class="mini">… 其余 ' + (res.add.length - 12) + ' 条略</span>' : '') + '</div>' +
      "<b>本次变更入审计</b>。一次性导入可放宽上百条来源约束 ⇒ 与单条新增同档二次认证。");
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
function wsAssetAuthedNote() { return "用户 × 资产；L1~L2 关闭、L3~L5 " + WS.rate.assetAuthed + " " + wsWinUnit(); }
/* ★ R61：阈值单位随「计数窗口」派生（单一真源）——「计数窗口」独立可编辑（默认 60s），
   单位若恒写「次/分钟」，把窗口改成 30 / 120 秒后读数与单位自相矛盾（同一条判据在页内多个出口）。 */
/* ★ R61·轮8：本函数是限流「单位」的**唯一真源**；写法统一为紧凑式 `次/分钟`（与全站改动后的
   `次/分钟` / `DP_ISSUE_OPTS` 一致），非 60 秒窗口同样紧凑。 */
function wsWinUnit() { return (Number(WS.rate.windowSec) === 60) ? "次/分钟" : ("次/" + WS.rate.windowSec + " 秒"); }
/* ★ 2026-09-23 第十八轮：覆盖卡说明抽为函数（含可编辑的 assetAuthed）—— 旧实现把「走 60 次/分钟」
   写死在 TAB②，改阈值后同屏说明仍述旧值。渲染与改动共用同一真源。 */
function wsAssetCoverNote() {
  return "未认证维度出厂默认<b>继承平台阈值</b>；已认证维度 <b>L1~L2 关闭、L3~L5 走 " + WS.rate.assetAuthed + " " + wsWinUnit() + "</b> —— 在 L1~L2 资产上填值即为「为它单独开启用户级限流」。";
}
function wsRateQuotaNote() {
  return "<b>额度关系</b>（同级计数依据下 <b>外层 ≥ 内层</b>）：网关 CC 按该来源 IP 的<b>全部请求</b>计数（" + WS.rate.gatewayCc +
    " " + wsWinUnit() + "）；登录 · 来源 IP 只数其中<b>登录请求</b>（" + WS.rate.loginIp +
    " " + wsWinUnit() + "）—— 内层计数集合是外层的<b>子集</b>，<b>外层必须不低于内层</b>，否则内层永远无法触发（死配置）。账号维度按<b>失败计数</b>（" + WS.rate.loginAccount +
    " " + wsWinUnit() + "），与「请求总量」口径<b>不可直接比大小</b>，其额度更低是因为<b>身份更窄</b>。";
}
/* ★ 2026-09-23 第十八轮：计数窗口说明抽为函数（含可编辑的 windowSec）—— 渲染与改动共用同一真源，
   改窗口后**就地刷新**，避免说明与数据自相矛盾；顺带把界面里裸露的英文标识 statusCode 改为中文。 */
function wsRateWinNote() {
  return "突发容量 = 阈值 × <b>20%</b>，随阈值<b>实时重算</b>；令牌桶不产生固定窗口双倍突发。各档阈值均按<b>上方「计数窗口」（当前 " + WS.rate.windowSec + " 秒）</b>内计数，窗口变更后阈值口径随之变化。状态码（系统内部字段，界面不暴露）。";
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
  /* ★ R61：阈值单位随「计数窗口」派生 —— 窗口独立可编辑（默认 60s），
     单位若恒写「次/分钟」，把窗口改成 30 / 120 秒后读数与单位自相矛盾。 */
  var _wu = wsWinUnit();
  return '<div class="card"><div class="card-h"><h3>阈值与维度<span class="sub">共享状态原子计数（滑动窗口 / 令牌桶）· 按集群统一计数</span></h3></div>' +
    '<div class="card-b"><div class="tbl-wrap"><table class="lst"><thead><tr><th style="width:44px">序号</th><th>维度</th><th style="width:190px">阈值</th><th>计数依据</th><th style="width:110px">突发容量</th><th style="width:120px">出厂默认档</th></tr></thead><tbody>' +
    rows.map(function (r, i) {
      var k = r[0], v = WS.rate[k];
      return '<tr><td class="mini">' + (i + 1) + '</td><td data-ws-dim="' + k + '">' + esc(r[1]) + '</td><td><input type="number" min="1" step="1" style="width:110px" aria-label="' + esc(r[1]) + ' 阈值（' + _wu + '）" data-ws-rate="' + k + '" value="' + v + '"> <span class="mini" data-ws-win-unit>' + _wu + '</span></td>' +
        '<td class="mini"' + (k === "assetAuthed" ? " data-ws-dimnote" : "") + ">" + esc(r[2]) + '</td><td class="mini" data-burst="' + k + '">' + wsBurst(v) + '</td><td class="mini">' + esc(r[3]) + "</td></tr>";
    }).join("") + "</tbody></table></div>" +
    '<div class="toolbar" style="margin-top:12px"><span class="mini">计数窗口</span><input type="number" min="1" step="1" style="width:90px" aria-label="计数窗口（秒）" data-ws-rate="windowSec" value="' + WS.rate.windowSec + '"><span class="mini">秒</span>' +
    '<span class="mini" style="margin-left:18px">超限动作</span>' + wsSeg("rateAction", ["拒绝", "延时", "仅记录"], WS.rate.action) + '<span class="mini" style="margin-left:8px">「仅记录」＝超限只记日志、不阻断也不延时（等同 WAF 观察档）</span>' +
    /* ★ R61：「延时」档原为空转档位（选了无任何可配参数）—— 补延时时长录入位。 */
    (WS.rate.action === "延时" ? '<span class="mini" style="margin-left:10px">延时时长（毫秒）</span><input type="number" min="1" step="100" style="width:96px" aria-label="延时时长（毫秒）" data-ws-rate="delayMs" value="' + (WS.rate.delayMs || 1000) + '">' : "") + "</div>" +
    '<div class="note" data-ws-win-note>' + wsRateWinNote() + "</div>" +
    '<div class="note">排列顺序按<b>管理员配置时的心理顺序</b>：管控半径<b>由宽到窄</b> —— 网关级 → 登录级 → 资产级。维度集合固定，仅呈现次序不同。</div>' +
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
    '<div class="toolbar"><span class="mini">当前覆盖 <b data-ws-covr>' + covR + "</b> 个资产 · 条目级覆盖 <b data-ws-covrent>" + (WS.entryCov || []).length + "</b> 条</span></div></div>" +
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
    ? "资产级覆盖：未认证 " + (ovN != null ? ovN + " " + wsWinUnit() : "继承") + "；已认证 " + (ovA != null ? ovA + " " + wsWinUnit() : "继承")
    : "平台继承：未认证继承；已认证 " + (a.lv <= 2 ? "关闭" : WS.rate.assetAuthed + " " + wsWinUnit());
  return '<div class="card"><div class="card-h">' +
    '<button class="btn link" type="button" data-ws="wsEntryBack">← 返回资产覆盖列表</button>' +
    '<h3 style="margin:0 0 0 10px">条目级覆盖 · ' + esc(a.name) + '<span class="sub">覆盖层 L4 · 条目来源：该资产细粒度资源清单，不重复维护</span></h3>' +
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
  return wsHead("pg-rate", "集群级限流", "阈值与维度 / 覆盖（资产级 + 条目级）/ 故障语义；按集群统一计数，超限动作取「拒绝 / 延时 / 仅记录」——「仅记录」即超限只记日志、不阻断也不延时", wsActions()) +
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
  return wsHead("pg-reqcon", "请求约束", "体积 / 并发 / 方法白名单 / 下载限速；确定性物理限制，防资源滥用与 OOM", wsActions()) +
    wsPosNote("①", "URI 规范化 / 方法 / 请求体约束") +
    '<div class="card"><div class="card-h"><h3>体积与并发</h3></div>' +
      '<div class="card-b">' +
        '<div class="kv" style="margin-bottom:10px;grid-template-columns:150px auto 1fr"><span class="k">请求体上限</span><input type="number" min="1" step="1" style="width:110px" aria-label="请求体上限（MB）" data-ws-req="bodyMax" value="' + WS.req.bodyMax + '"><span class="mini">MB　超限 413 <code class="kr">BODY_TOO_LARGE</code></span></div>' +
        '<div class="kv" style="margin-bottom:10px;grid-template-columns:150px auto 1fr"><span class="k">登录端点请求体</span><b>16 KB</b><span class="mini">（固定，不可配）</span></div>' +
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
    '<div><h2>WAF 规则库管理</h2><div class="muted" style="margin-top:4px">WAF 特征库与语义检测规则集 · 特征库版本化 · SM2 签名下发</div></div>' +
    '<div class="toolbar"><button class="btn primary" type="button" data-rl="rlImport">导入规则包</button></div></div>' +
    '<div class="muted" style="margin:-6px 0 12px;font-size:12.5px">当前生效 <b>' + esc(RL.current) + '</b> · ' + esc(RL.publishedAt) + ' 发布 · ' + (RL.signed ? "SM2 验签通过" : "未验签") + ' · 条目 ' + RL.entries + ' · 近 7 日命中 预置 ' + RL.hit.preset + ' / 自定义覆盖 ' + RL.hit.custom + '</div>' +
    wsTabsNav("rulelib") +
    /* ── 面板 ① 版本库 ─────────────────────────────────────────── */
    wsTabPane("rulelib", "r1",
      '<div class="card"><div class="card-h"><h3>版本库<span class="sub">多版本并存 · 版本号单调递增 · 未下发即不生效</span></h3></div><div class="card-b">' +
        '<div class="tbl-wrap"><table class="lst"><thead><tr><th style="width:150px">版本</th><th style="width:140px">发布时间</th><th style="width:80px">条目数</th><th style="width:140px">签名</th><th>状态</th><th style="width:200px">操作</th></tr></thead><tbody>' +
        ((pendRow + vRows) || '<tr><td colspan="6" class="mini">尚无版本记录（未导入任何规则包）。</td></tr>') + "</tbody></table></div>" +
        '<div id="rlPgVer" style="margin-top:8px"></div>' +
        '<div class="note">导入后进入<b>受控发布链</b>、<b>不直接生效</b>；<b>版本号须单调递增</b>（不得导入更旧或同版包）。流程：<b>导入 → 签名校验 → 灰度（观察）→ 发布 → 全量下发</b>，每步就绪后在该行内出现下一步按钮。<b>回滚不得以版本号倒退实现</b> —— 以<b>更高版本号重新签名下发</b>；<b>仅回滚库文件，不动已生成的策略</b>（策略属用户资产）。</div>' +
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
      '<div style="display:grid;gap:14px">' +
        '<div class="card"><div class="card-h"><h3>库分区<span class="sub">本库两类构成（WAF 域 · 均本期实装）</span></h3></div><div class="card-b">' + libs +
          '<div class="note">本库只承载<b>库</b>（特征库版本 / 签名 / 回滚）；管理员在 Web 安全防护策略页自建的正则规则（<b>自定义 PCRE</b>）属<b>站点自有规则</b>，<b>与特征库互相独立</b>，<b>不在本库、不随库下发</b>。<br><b>「客户端真实性判定特征集」「推理与基线规则」属其他安全域，各自独立成库（独立版本线 / 独立承载页），不在本库；本期仅登记，不实现。</b><br>库内规则的<b>状态</b>与 Web 安全防护策略页的<b>内置基线开关同源</b>：关闭某类基线后，该类规则在本页同步标「基线已关」。</div>' +
        "</div></div>" +
        '<div class="card"><div class="card-h"><h3>失败自动回滚<span class="sub">验签 / 下发失败自动回滚 + 高危告警</span></h3></div><div class="card-b">' +
          '<div class="note">网关<b>能自证</b>的情形仅限自身的执行结果：<b>验签失败</b> · <b>下发失败</b> · <b>节点确认超时</b> ⇒ 自动回滚上一版本、以更高版本号重签，并推送高危告警；无有效版本时按<b>原样放行</b> + 告警；连续中断达阈值自动<b>熔断</b>。规则库不替代一期裁决链，也不改变其 fail-closed 语义。</div>' +
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
      ? "资产级限流覆盖 <b>" + wsRateCovAssets() + "</b> 个资产"
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
  if (a === "wsPcreToggle") {                                   /* 行内启停：停用检测规则属敏感变更 ⇒ 二次认证 */
    var pi = Number(el.getAttribute("data-v"));
    if (isNaN(pi) || !WS.pcre[pi]) return;
    var turnOn = WS.pcre[pi].on === false, pn = WS.pcre[pi].name;
    if (!turnOn) {
      ask2FA("停用自定义规则", function () {
        WS.pcre[pi].on = false; wsSaveStore(); wsReList("p"); toast("规则已停用（演示）");
      }, null,
        "停用 <b>" + esc(pn) + "</b> 后该规则<b>不再参与攻击检测</b>（规则保留、可随时启用）。变更走受控版本发布、滚动生效。<b>本次变更入审计</b>。确认停用？");
      return;
    }
    /* ★ 2026-10-12（R57 · 交-4）：启用方向原为**零确认** —— 与同控件的停用方向（普通确认）
       以及全站同族（准入策略 / 凭据 / 动态防护主开关，均 ask2FA）都不一致。
       判据：启用检测规则同样改变生效面（决定该类攻击是否被识别），应与停用同档。 */
    ask2FA("启用自定义规则「" + pn + "」", function () {
      WS.pcre[pi].on = true; wsSaveStore(); wsReList("p"); toast("规则已启用（演示）");
    }, null, "该规则将<b>参与攻击检测</b>，变更走受控版本发布、滚动生效。<b>本次变更入审计</b>。");
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
      /* ★ R61·轮10：新条目 push 到末页 ⇒ 本表页码指向末页，否则用户停在当前页看不到新增（与 auPgNew / CRED_PG.c1「落库后跳新行所在页」同惯例；黑名单种子 6 条 > WS_LP=5，可观测）。 */
      var _ipK = isB ? "b" : "w";
      wsF(_ipK).p = Math.max(1, Math.ceil(arr.length / wsLp(_ipK)));
      wsSaveStore(); wsCurRender(); toast("已加入" + (isB ? "黑名单" : "白名单") + "：" + v + "（演示）");
    };
    if (!isB) {
      /* ★ 2026-10-12（R53 · 存-3 取舍）：加入白名单**放宽**防护面（跳过攻击特征检测）⇒ 与
         「移除白名单条目」（收紧）及动态防护侧同类入口同档，统一走二次认证；
         原为普通确认，使「放宽」比「收紧」更容易 —— 风险方向与认证强度倒挂。 */
      ask2FA("加入白名单 " + v, push, null,
        "白名单<b>只跳过攻击特征检测</b>，<b>不等于放行</b>：限流、主体认证、资产访问状态、ABAC、请求约束与审计<b>照常执行</b>。本次加入 <b>" + esc(v) + "</b>（生效范围：" + esc(scope) + "）。");
      return;
    }
    /* ★ R61：与「加入白名单」同档 —— 名单条目的**任何增删都改变防护生效面**
       （哪些来源被阻断 / 被跳过特征检测），故四个动作（加黑 / 加白 / 删黑 / 删白）统一二次认证；
       原实现「加黑名单」零确认、「加白名单」二次认证，同一个列表的同一类动作两种档位。 */
    ask2FA("加入黑名单 " + v, push, null,
      "该来源将被<b>阻断</b>（回到常规检测之外）。本次加入 <b>" + esc(v) + "</b>（生效范围：" + esc(scope) + "）。");
    return;
  }
  if (a === "wsIpDel") {
    var k2 = el.getAttribute("data-v"), vv = el.getAttribute("data-i"), arr2 = k2 === "b" ? WS.black : WS.white;
    var i2 = -1; for (var q = 0; q < arr2.length; q++) { if (arr2[q].v === vv) { i2 = q; break; } }
    if (i2 < 0) return;
    /* ★ 2026-09-21 第十二轮：移除名单条目**属破坏性动作**（黑名单移除 = 不再阻断该来源；
       白名单移除 = 不再跳过特征检测）。原实现点了即删、无二次认证 —— 与同页「白名单加入」
       的二次认证、以及自定义 PCRE 的「删除」二次认证**口径不一致**（探针实测该分支无确认）。 */
    /* ★ R61：移除同属**改变防护生效面**（黑名单移除＝不再阻断该来源；白名单移除＝不再跳过
       特征检测）⇒ 与加入侧统一二次认证。原实现走普通确认，与同表「加入白名单」的二次认证
       及全站「移除 / 删除类一律二次认证」的口径都不一致。 */
    ask2FA("移除" + (k2 === "b" ? "黑名单" : "白名单") + "条目「" + vv + "」",
      function () {
        for (var q2 = 0; q2 < arr2.length; q2++) { if (arr2[q2].v === vv) { arr2.splice(q2, 1); break; } }
        wsSaveStore(); wsCurRender(); toast("已移除：" + vv + "（演示）");
      }, null,
      "将移除 <b>" + esc(vv) + "</b>。" +
      (k2 === "b" ? "移除后该来源<b>不再被阻断</b>（回到常规检测）。" : "移除后该来源<b>不再跳过攻击特征检测</b>。") +
      "<b>本次变更入审计</b>。");
    return;
  }
  if (a === "wsPcreAdd") { openPcreDlg(); return; }
  if (a === "wsPcreDel") {
    var i3 = Number(el.getAttribute("data-v"));
    if (isNaN(i3)) return;
    /* ★ 2026-09-23 第十七轮：① 删除会连**选择态**一起留下（WSSEL.p 按规则名记）⇒ 计数虚高、表头全选错乱；
       ② 旧文案自相矛盾（既说「立即失效」又说「滚动生效」）。此处一并收敛。 */
    var delName = (WS.pcre[i3] || {}).name;
    ask2FA("删除自定义规则", function () {
      WS.pcre.splice(i3, 1);
      if (delName && WSSEL.p) delete WSSEL.p[delName];
      wsSaveStore(); renderWebSec(); toast("自定义规则已删除（演示）");
    }, null, "删除后该规则立即失效、<b>不可恢复</b>；变更走受控规则版本发布、<b>滚动生效</b>。<b>本次变更入审计</b>。");
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

/* ★ 2026-10-12（R61）：原为模块**自建的第二套二次认证弹窗**（自带 #ws2faPwd、无认证方式
   选择），与全站统一的 ask2FA（#tfaPwd，方式取自「认证方式字典」）并存 ⇒ 同一页面相邻两个
   动作弹出两种形态的弹窗（规则库「全量下发」走本函数、「回滚版本」走 ask2FA），字段与文案对不上。
   现收敛为**单点实现**：本函数只做参数顺序适配（op, note, ok → op, ok, cancel, note），
   实际弹窗一律走 ask2FA。 */
function wsAsk2FA(op, note, ok) { ask2FA(op, ok, null, note); }

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
  /* ★ R61（轮5）：覆盖项数按**资产去重** —— 三个键控表均以资产 id 为键，同一资产同时命中
     「单资产防护模式」与「资产级限流」两档覆盖时原实现重复计数，体检面板的「覆盖 N 项」因此虚高。
     ⚠ 本口径与覆盖卡 / u2 徽标**不完全相同**：体检为跨维度总览，额外纳入「单资产防护模式」
     （覆盖卡与 u2 徽标仅计限流维度），条目级覆盖键为条目、单独累加。 */
  var _covSet = {};
  Object.keys(WS.modeOverride).forEach(function (aid) { _covSet[aid] = 1; });
  Object.keys(WS.assetRate).forEach(function (aid) { _covSet[aid] = 1; });
  Object.keys(WS.assetRateAnon).forEach(function (aid) { _covSet[aid] = 1; });
  var covN = Object.keys(_covSet).length + (WS.entryCov || []).length;
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
  /* ★ R61：切到「仅记录」= 超限不再阻断 / 延时（**放宽防护**）⇒ 与放宽类动作同档二次认证；
     反方向（拒绝 / 延时）不放宽防护，保持即时生效。 */
  if (name === "rateAction") {
    if (v === "仅记录" && WS.rate.action !== "仅记录") {
      ask2FA("将超限动作改为「仅记录」", function () { WS.rate.action = v; wsSaveStore(); renderRate(); }, null,
        "「仅记录」= 超限请求<b>只记日志、不阻断也不延时</b>，属放宽防护；变更入审计。");
      return;
    }
    WS.rate.action = v; wsSaveStore(); renderRate(); return;
  }
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
      ask2FA("关闭基线检测", function () {
        WS.baseline[k] = false; wsSaveStore(); renderWebSec(); toast("已关闭 " + k.toUpperCase() + " 基线（演示）");
      }, null,
        "关闭 <b>" + k.toUpperCase() + " 基线</b>将<b>显著降低防护</b>：该类攻击在特征级不再被识别。确认关闭？");
      return;
    }
    /* ★ 2026-10-12（R57 · 交-4）：重新开启方向原为**零确认**，关闭方向有普通确认 —— 同一控件
       两方向两档。开启基线 = 恢复对该类攻击的特征级识别，同属改变生效面 ⇒ 与关闭同档。 */
    ask2FA("重新开启 " + k.toUpperCase() + " 基线", function () {
      WS.baseline[k] = true; wsSaveStore(); renderWebSec();
      toast("已重新开启 " + k.toUpperCase() + " 基线（演示）");
    }, null, "该类攻击将<b>在特征级重新被识别</b>。<b>本次变更入审计</b>。");
    return;   /* ★ 第十八轮：重新开启也须重渲染 —— 否则 TAB③「已关闭基线」红字残留、与页④「生效中」自相矛盾 */
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
        toast("额度关系：网关 CC（" + outer + "）不得低于登录 · 来源 IP（" + inner + " " + wsWinUnit() + "），否则内层永远无法触发");
        return;
      }
    }
    WS.rate[rate] = n; wsSaveStore(); toast("已更新（演示）");
    var b2 = document.querySelector('[data-burst="' + rate + '"]'); if (b2) b2.textContent = wsBurst(n);
    /* ★ 2026-09-23 第十七轮：含阈值数值的说明**就地刷新** —— 说明与数据必须同步，不得等下次重渲染。
       ★ 2026-09-23 第十八轮：**补全** TAB② 覆盖卡 note 与计数窗口说明（旧实现只刷 TAB① 三处，
       改 assetAuthed / windowSec 后同屏说明仍述旧值）；覆盖面板若在 DOM 则一并重绘（不整页刷新、不动 TAB 态）。 */
    var dn2 = document.querySelector("[data-ws-dimnote]"); if (dn2) dn2.textContent = wsAssetAuthedNote();
    var qn2 = document.querySelector("[data-ws-quota-note]"); if (qn2) qn2.innerHTML = wsRateQuotaNote();
    var wn2 = document.querySelector("[data-ws-win-note]"); if (wn2) wn2.innerHTML = wsRateWinNote();
    /* ★ R61：改「计数窗口」后阈值列的**单位与 aria-label** 须一并刷新 —— 原实现只刷突发容量
       与各 note，单位 span 恒停在渲染期写入的旧值（窗口改 30 / 120 秒后同屏出现
       「阈值 1000 次/分钟」与说明「按 30 秒窗口计数」自相矛盾）。 */
    if (rate === "windowSec") {
      /* ★ R61·轮8：单位改走单一真源 —— 上面 `WS.rate[rate] = n` 已生效，wsWinUnit() 读到的即新窗口。 */
      var _wu2 = wsWinUnit();
      [].slice.call(document.querySelectorAll("[data-ws-win-unit]")).forEach(function (sp) { sp.textContent = _wu2; });
      [].slice.call(document.querySelectorAll("input[data-ws-rate]")).forEach(function (ip2) {
        var al = ip2.getAttribute("aria-label") || "";
        if (!al || al.indexOf("计数窗口") >= 0) return;
        ip2.setAttribute("aria-label", al.replace(/（[^）]*）\s*$/, "（" + _wu2 + "）"));
      });
    }
    var cv2 = document.querySelector("[data-ws-covernote]"); if (cv2) cv2.innerHTML = wsAssetCoverNote();
    if (document.getElementById("wt-u2")) wsReRateCover();
    return;
  }
  if (req) {
    if (!wsIntOk(t.value)) { markBad(t, true); t.value = WS.req[req]; toast("该值须为 ≥1 的整数"); return; }
    var n2 = Math.floor(Number(t.value));
    /* ★ 2026-09-23 第十七轮：放宽**下载速率**与放宽体积 / 并发同属「扩大资源占用面」，口径须一致
       （旧实现只有 bodyMax / connMax 走确认，downloadRate 直接落库）。
       ★ R61（轮6）口径再上修：放宽类属**改变生效面**（放宽即提权）⇒ 与收紧类同档走**二次认证**。
       同页同族三处（批量导入来源约束 / 加入白名单 / 超限动作改「仅记录」）与权威指南 5.2
       「放宽限流阈值 ⇒ 二次认证」均为二次认证；原走普通确认，使『放宽』比『收紧』更容易。 */
    var rWiden = (req === "bodyMax" && n2 > WS.req.bodyMax) || (req === "connMax" && n2 > WS.req.connMax) || (req === "downloadRate" && n2 > WS.req.downloadRate);
    if (rWiden) {
      t.value = WS.req[req];   /* 未确认前先复原显示，避免「展示值与状态不一致」 */
      var rName = req === "bodyMax" ? "请求体上限" : (req === "connMax" ? "并发上限" : "下载速率");
      ask2FA("放宽" + rName, function () {
        WS.req[req] = n2; wsSaveStore(); renderReqCon(); toast("已更新（演示）");
      }, null, "将 <b>" + rName + "</b> 由 <b>" + WS.req[req] + "</b> 放宽至 <b>" + n2 + "</b>，<b>会扩大资源占用面</b>（放宽即提权，与收紧类同档）。<b>本次变更入审计</b>。");
      return;
    }
    WS.req[req] = n2; wsSaveStore(); toast("已更新（演示）"); return;
  }
  if (ar) {
    var arK = t.getAttribute("data-k"), arStore = arK === "anon" ? WS.assetRateAnon : WS.assetRate;
    var n3 = String(t.value).trim();
    if (!n3) { delete arStore[ar]; wsSaveStore(); wsReList("r"); return; }
    var nv = Number(n3);
    if (!wsIntOk(n3)) { markBad(t, true); t.value = arStore[ar] != null ? arStore[ar] : ""; toast("覆盖阈值须为 ≥1 的整数"); return; }
    nv = Math.floor(nv);
    arStore[ar] = nv; wsSaveStore(); wsReList("r");
    toast("资产级限流已覆盖为 " + nv + " " + wsWinUnit() + "（" + (arK === "anon" ? "未认证 · IP × 资产" : "已认证 · 用户 × 资产") + "）（演示）");
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
    toast("条目级覆盖已设为 " + erV + " " + wsWinUnit() + "（演示）");
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
    '<div class="fld"><label>覆盖阈值</label><input type="number" min="1" step="1" id="wsBatchNum" placeholder="' + wsWinUnit() + '"><div class="help">留空 = <b>清除覆盖</b>、恢复继承平台阈值。</div></div>' +
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
      (n == null ? "清除覆盖、恢复继承" : "覆盖为 <b>" + n + " " + wsWinUnit() + "</b>") + "。确认应用？", function () {
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
    openDlg("导入规则包", "导入后进入受控发布链（签名校验 → 灰度（观察）→ 发布 → 全量下发）；SM2 签名由厂商私钥签发，网关侧以预置公钥验签。", html);
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
    ask2FA("回滚版本", function () {
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
    }, null,
      "回滚到 <b>" + esc(tv) + "</b> 不得以版本号倒退实现 —— 将以<b>更高版本号重新签名下发</b>；<b>仅回滚库文件，不动已生成的策略</b>（策略属用户资产）。确认回滚？");
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
    /* ★ 2026-10-12（R57 · 交-5）：库规则启停原为**零确认** —— 同页「全量下发」走二次认证，
       而启用/停用一条库规则同样改变生效面（决定该项检测是否参与）。按全站判据同档。 */
    ask2FA((rk.on ? "停用" : "启用") + "库规则「" + (rk.name || "") + "」", function () {
      rk.on = !rk.on;
      rk.ov = (rk.disp !== "继承库设定" && rk.disp !== (rk.def || rk.disp)) || (rk.on === false);
      rlSaveStore(); renderRuleLib(); toast("规则已" + (rk.on ? "启用" : "停用") + "（" + (rk.ov ? "自定义覆盖" : "已回库设定") + "）（演示）");
    }, null, "该项检测的<b>参与与否</b>将随之改变，变更走受控版本发布、滚动生效。<b>本次变更入审计</b>。");
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
/* 2026-10-09：原「误报率告警阈值」输入项已随「误报率监控」卡移除（用户裁定：误报率不能
   由网关自证 ⇒ 不在规则库呈现）⇒ 本页暂无 change 型控件。保留空实现以维持接线契约
   （第 6 节 `rlEl.addEventListener("change", rlOnChange)` 未动）。 */
function rlOnChange(e) {}

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

