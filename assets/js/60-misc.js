/* ============================================================================
   资产侧「身份适配」（出站方向）· 渲染与交互
   ----------------------------------------------------------------------------
   ★ 2026-09-29：原「认证族」7 页（认证场景工作台 / 认证源 / 认证能力字典 /
     认证策略与场景 / 生物识别绑定 / 机器与智能体身份 / 免认证访问）
     **已从本原型撤除** —— 改由全新的「身份」「认证」两个模块承接。
   ★ 本节只保留**身份适配**（资产级 · 「用户 / 主体 → 资产」注入 + 免认证跳转）：
     它归**资产管理**，是本模块的页面，故随本模块一并保留。
   ★ 与 v18 口径一致：本页是「用户 / 主体 → 资产」注入的**唯一配置面**；
     「网关 → 上游」连接级机器凭据在资产管理的「代理与上游」—— 两层不混用。
   ========================================================================== */

/* —— 以下段落属「身份适配」，与上方切除段无依赖 —— */
function authTag(txt, cls){ return '<span class="tag ' + (cls || "t-info") + '">' + esc(txt) + "</span>"; }

/* —— 以下段落属「身份适配」，与上方切除段无依赖 —— */
function authRole(){
  /* 权威取值：顶栏操作者全称（含角色前缀，如「安全管理员 张伟」）。
     ⚠ 不能用只返回姓名的 opUser() 作首选 —— 它没有角色前缀，会导致角色恒为默认值。 */
  var full = "";
  var t = document.getElementById("topbarUser");
  if (t) full = String(t.textContent || "");
  if (!full) { try { if (typeof opUser === "function") full = String(opUser() || ""); } catch (e) { full = ""; } }
  if (full.indexOf("系统管理员") >= 0) return "系统管理员";
  if (full.indexOf("审计管理员") >= 0) return "审计管理员";
  if (full.indexOf("安全管理员") >= 0) return "安全管理员";
  return "安全管理员";
}
function authCanEdit(k){ return true; }   /* 原型不做角色门禁（见 §2b）：恒可编辑 */
function authToolbar(k, resetAct, saveAct, saveLabel){
  /* 恒出保存类动作；不再有「🔒 对本页只读」分支（原型不做角色门禁，见 §2b） */
  return '<div class="toolbar"><button class="btn" type="button" data-auth="' + resetAct + '">恢复出厂默认</button>' +
    '<button class="btn primary" type="button" data-auth="' + saveAct + '">' + esc(saveLabel || "保存并生效") + "</button></div>";
}
function authRoNote(k, pageName){ return ""; }   /* 原型不出「只读态」横幅（见 §2b） */
function authApplyRo(el, k){ return; }   /* 原型不置灰任何控件（见 §2b） */

/* ---------- 2c. 弹窗表单小件（统一 id 约定，便于校验与取值） ---------- */
function ack(id){ var e = document.getElementById(id); return !!(e && e.checked); }

/* —— 以下段落属「身份适配」，与上方切除段无依赖 —— */
/* ★ R61·轮10：以下 SS / SSO_MODE_DEF 是**已撤除能力**（4A 认证族的会话安全模式 · 旧 SSO 档位定义）
   的残留 —— 出厂代码**零引用**；仅本文件 :753 / :755 / :757 / :1057 的沿革注以它们为历史指称对象，
   故保留不删。⚠ 档位真源是下方 **ADAPT_MODES**（含 N 档）—— SSO_MODE_DEF 缺 N，误用即漏一档，
   属已发生并记录在案的事故（见 :757）。新增代码**不得**引用本常量。 */
var SS = {
  modes: { A: { on: 12, opened: 9, err: 1 }, B: { on: 6, opened: 5, err: 0 }, C: { on: 3, opened: 3, err: 0 }, D: { on: 2, opened: 2, err: 0 } },
  vault: { entries: 5, highRiskOff: true, reviewDue: false }
};
var SSO_MODE_DEF = [
  { k: "A", name: "token 注入",    desc: "平台持有资产业务 token，注入请求头 / 参数",         strength: "强", risk: "低" },
  { k: "B", name: "key ＋ userinfo", desc: "注入 key，业务侧回调 userinfo 换取身份",            strength: "强", risk: "低" },
  { k: "C", name: "协议级 SSO",    desc: "平台作 IdP，业务侧走标准协议信任联合身份",          strength: "强", risk: "低" },
  { k: "D", name: "账号密码代填",  desc: "平台在资产登录页代填表单（托管口令，受资产实现约束）", strength: "弱", risk: "高" }
];

/* —— 以下段落属「身份适配」，与上方切除段无依赖 —— */
var ADAPT_MODES = [
  { k: "N", name: "不注入（仅平台鉴权）" },
  { k: "A", name: "token 注入" },
  { k: "B", name: "key ＋ userinfo" },
  { k: "C", name: "协议级 SSO" },
  { k: "D", name: "账号密码代填" }
];

/* —— 以下段落属「身份适配」，与上方切除段无依赖 —— */
function adaptAsset(){
  if (typeof byId !== "function") return null;
  /* ★ 2026-09-30（第十六轮）：改走 adaptCurAid() 单一入口 ——
     原「window._adaptAid || window._detailAid」把**未持久化的页内变量**排在**已持久化的
     _detailAid** 之前，而该变量又被旧版 adaptCurAid 覆写成常量 CUR，导致整个 t6 锚定 a1。
     函数声明提升保证此处可安全引用定义在 11711 的 adaptCurAid。 */
  var aid = (typeof adaptCurAid === "function") ? adaptCurAid()
    : (window._detailAid || window._adaptAid || "");
  return byId(aid) || null;
}
function adaptSt(){ var a = adaptAsset(); return (a && a._adapt) || null; }
function adaptAssetName(){
  var a = adaptAsset(); if (a && a.name) return a.name;
  var t = document.getElementById("detName");
  var nm = t ? String(t.textContent || "").trim() : "";
  return nm || "当前资产";
}
/* 演示种子：资产**未配置过**（无 `_adapt`）时按名称给出初始档位；一旦保存过，以 `a._adapt.mode` 为准。
   ⚠ 种子非「不注入」的资产视为**已作信任声明**（信任声明是 A 档前置条件，配置过即已声明）；
     未配置资产默认「不注入 + 未声明」，可现场演示 A 档的信任门禁。
   ★ 2026-09-30 修复：本常量此前**只有引用、没有定义** ——
     renderDetAdapt() / renderAdaptPage() 一执行即抛「ADAPT_MODE_OF is not defined」，
     身份适配页从未真正渲染出来过。此处按原定义恢复，键名对齐当前资产台账。 */
var ADAPT_MODE_OF = {
  "核心网银门户": "A", "对公网银体验门户": "A", "统一身份门户": "C", "信贷审批系统": "B",
  "运维审计堡垒机": "C", "监管报送接口": "B", "客户数据仓库": "A",
  /* ★ 2026-10-10（R25/R26）：**D 档（账号密码代填）的承载面判据** —— 代填须有可填的登录表单，
     故 D 档资产必须同时满足：① type=网页应用；② 存在**非「显式公开」**的页面路径（有登录页）；
     ③ 已启用。按此判据全台账仅三条合格 ⇒ 报表中心 / 报表导出网关 / 运维堡垒机 Web 控制台。
     ⚠ R25 曾把「手机银行后台」（res 仅 `kind:"API"`，无页面可填）与「对外行情资讯门户」
       （整站 `显式公开（public）`，无需登录）也标为 D 档 ⇒ 对无表单资产做代填，自相矛盾
       （R26 跨模块评审 A-3 指出，本条为 R25 引入的缺陷）。 */
  "报表中心": "D", "报表导出网关": "D", "运维堡垒机 Web 控制台": "D"
};
function adaptSeedMode(){ return ADAPT_MODE_OF[adaptAssetName()] || "N"; }

/* —— 以下段落属「身份适配」，与上方切除段无依赖 —— */
var ADAPT_MODE_TMP = {}, ADAPT_TRUST_TMP = {}, ADAPT_F_TMP = {};
/* ★ 2026-09-30（第七轮）：机器身份草稿仓 —— 单选 / 凭据选择只写这里，
   「保存并下发」才落 a._inj / a._injCred（与用户身份卡的草稿语义对齐）。 */
var UP_INJ_DRAFT = {};
/* ★ 2026-09-30（第十七轮 · 全量评审修复）：**D 档契约草稿仓** ——
   弹窗内的改动只写这里，「保存契约」/「保存并下发」才落 a._adapt.d。
   此前弹窗控件一 change 就 adaptStashD() 直写资产对象，用户点 X 取消后改动已进内存，
   随后任意一次 saveDemoState（点机器身份「保存并下发」、切页跳转）就把它持久化了
   —— 取消形同虚设，且与 A/B/C 档「控件＝草稿 / 保存＝落库」的统一语义不对称。
   ⚠ 无参调用 adaptStashD() 仍是**就地写资产**（保存路径与既有门禁依赖该语义）。 */
var ADAPT_D_TMP = {};
function adaptKey(){ var a = adaptAsset(); return a ? a.id : "_"; }
function adaptMode(){
  /* ★ 2026-09-30（第七轮）：草稿优先 —— 与 adaptF 同一优先级链。
     档位条点击只写 ADAPT_MODE_TMP（草稿），保存（adaptSave）才落 a._adapt.mode；
     此前档位点击直写资产对象，机器身份卡任何一次 saveDemoState 都会把
     未保存的档位选择一并持久化 —— 同页两套保存语义，演示即穿帮。 */
  var k = adaptKey();
  if (ADAPT_MODE_TMP[k]) return ADAPT_MODE_TMP[k];
  var st = adaptSt();
  if (st && st.mode) return st.mode;
  return adaptSeedMode();
}

/* —— 以下段落属「身份适配」，与上方切除段无依赖 —— */
function adaptTrust(){
  /* ★ 2026-09-30（第七轮）：草稿优先 —— 原链「已存值优先」会让
     「已保存 trust=true 后取消勾选」不生效（与 adaptF 优先级反转同款缺陷）；
     信任声明勾选只写 ADAPT_TRUST_TMP，保存时随 adaptSave 落库。 */
  var k = adaptKey();
  if (typeof ADAPT_TRUST_TMP[k] === "boolean") return ADAPT_TRUST_TMP[k];
  var st = adaptSt();
  if (st && typeof st.trust === "boolean") return st.trust;
  return adaptSeedMode() !== "N";
}

/* ---------- 2c-2. 身份适配表单小件（曾被漏定义 —— 整个适配表单层会 ReferenceError） ----------
   ⚠ 2026-09-30 修复：adaptCard / adaptFld / adaptIn / adaptSel / adaptF / adaptScopeRow /
     adaptContentSel 此前**只有调用、没有定义**，renderDetAdapt() 一执行即抛
     「adaptCard is not defined」，页签因此从来渲染不出来。此处按原有调用签名补齐。
   取值约定：adaptF(档位, 字段, 默认) —— 从当前资产 _adapt.f 覆盖位取，无则回默认；
             写回统一在 adaptSave 里按同名字段落 _adapt.f。 */
/* 参数卡卡头右侧的状态标签（保存态 / 信任态）。原属已删的「当前档位参数」空卡头，
   2026-09-30 迁到此处的唯一理由：状态需要可见，但不值得为它单开一张 86px 空卡。 */
/* 参数子节头：参数区并入「用户身份」卡后的分节行（非卡头）——
   档名 + 副题 + 状态 chips 一行，替代原「token 注入参数」独立卡的卡头。 */
function adaptSecHead(title, sub){
  return '<div class="adapt-sec-h"><b>' + esc(title) + '</b>' +
    (sub ? '<span class="sub">' + esc(sub) + '</span>' : "") +
    '<span class="chips">' + adaptStatusChips() + '</span></div>';
}
function adaptStatusChips(){
  var a0 = adaptAsset(), saved = !!adaptSt(), tr = adaptTrust();
  /* chips 挂参数子节头（adaptSecHead）：保存态各档都有；信任态仅 A 档 ——
     ★ 2026-09-30（第五轮）：原文案「未声明信任 · A 档不可配」在 B/C/D 档下也照出，
     而信任声明只是 A 档的前置，别档出现即误导。 */
  /* ★ 2026-09-30（第七轮）：保存态 chip 三态 —— 已保存 / 未保存 / 未保存的切换 ——
     档位草稿（ADAPT_MODE_TMP）与已存 mode 不同即提示，避免「切换即生效」误读。 */
  var stC = adaptSt();
  var dm = ADAPT_MODE_TMP[adaptKey()] || null;
  var savedMode = (stC && stC.mode) || null;
  var chipSave = (dm && dm !== savedMode)
    ? '<span class="tag t-warn" title="档位已切换但尚未保存 —— 点「保存并下发」后写入资产对象">未保存的切换：' + esc(dm) + "</span>"
    : (savedMode
      ? '<span class="tag t-ok" title="已写入资产对象并随 ASSETS 落盘（DEMO_KEY）">已保存' + (a0 ? " · " + esc(a0.id) : "") + "</span>"
      : '<span class="tag t-gray" title="当前档位尚未保存 —— 保存后写入资产对象">未保存</span>');
  var chipTrust = "";
  if (adaptMode() === "A") {
    chipTrust = tr
      ? '<span class="tag t-info">已声明信任</span>'
      : '<span class="tag t-warn">未声明信任 · 本档不可配</span>';
  }
  return chipSave + chipTrust;
}

function adaptCard(title, sub, body, footNote, chips){
  /* chips（选填）：卡头右侧状态标签。用于承载原「当前档位参数」空卡里的保存态 / 信任态 ——
     2026-09-30 用户裁定删除该空卡（卡体为空、档名重复），信息并入本卡头。 */
  return '<div class="card"><div class="card-h"><h3>' + esc(title) +
    (sub ? '<span class="sub">' + esc(sub) + "</span>" : "") + "</h3>" +
    (chips ? '<div class="toolbar"><span class="mini">' + chips + "</span></div>" : "") + "</div>" +
    '<div class="card-b">' + body + "</div>" +
    (footNote ? '<div class="card-b" style="border-top:1px dashed var(--line);padding-top:8px"><div class="mini">' + footNote + "</div></div>" : "") +
    "</div>";
}
function adaptFld(label, control, help){
  /* 支持两种调用：adaptFld(label, control, help) 与
     adaptFld(label, control, help, wide) —— wide=true 时占满两列（长文本框 / 长说明用）。 */
  var wide = arguments.length > 3 && arguments[3];
  /* ★ 2026-09-30：label 允许携带**唯一白名单标记** `<span class="req">*</span>`（必填星号）。
     此前一律 esc(label)，把 D 档「资产登录页地址 <span class="req">*</span>」整串当文本转义，
     页面上直接显示出标签源码（实测踩到）。这里先转义、再把白名单标记还原，其余标签仍被转义。 */
  var lb = esc(label);
  if (lb.indexOf("&lt;span class=&quot;req&quot;&gt;*&lt;/span&gt;") >= 0) {
    lb = lb.split("&lt;span class=&quot;req&quot;&gt;*&lt;/span&gt;").join('<span class="req">*</span>');
  }
  /* ★ 2026-09-30（第十七轮 · 无障碍）：label 与控件建立 for 关联 ——
     此前页内表单（#detAdaptForm 内 A/B/C 档约 20 个控件）的 <label> 与控件是**兄弟**且无 for，
     读屏读不出控件名称（openDlg 的兜底只作用于 #dlg1Body）。此处从 control 串里取 id 建立关联；
     取不到 id（纯展示型 fld，如「注入范围」）则不加 for，行为与原来一致。 */
  var idm = /\sid="([^"]+)"/.exec(control);
  return '<div class="fld' + (wide ? " wide" : "") + '" style="margin-bottom:10px"><label' +
    (idm ? ' for="' + idm[1] + '"' : "") + ">" + lb + "</label>" + control +
    (help ? '<div class="help">' + help + "</div>" : "") + "</div>";
}
/* 参数字段的双列网格容器：短字段两列并排，窄屏（<720px）回落单列。
   实测 A 档 7 字段单列堆叠达 1033px（1.36 屏）→ 双列后约减半。 */
function adaptGrid(inner){
  return '<div class="fld-grid">' + inner + "</div>";
}
/* 长段说明（原「注入纪律」「注入范围」这类）改为行内提示块 ——
   不再逐条占据表单垂直空间，只在需要时一眼扫到。 */
function adaptNote(text, title){
  return '<div class="adapt-inline-note"><b>' + esc(title || "说明") + "</b>" + text + "</div>";
}
function adaptIn(id, val, ph, width, disabled){
  /* ★ 2026-09-30：必须显式 type="text"。
     proto.css 的输入框规则是 input[type=text] 属性选择器，无 type 的 <input> 匹配不上，
     回落浏览器原生外观（实测 h=21px / border-radius:0 / border:1.6px inset rgb(118,118,118)），
     与同页 <select>（h=32px / 圆角 9px）并排即为「同页同类控件风格不统一」。 */
  return '<input type="text" id="' + id + '" value="' + esc(val == null ? "" : val) + '"' +
    (ph ? ' placeholder="' + esc(ph) + '"' : "") +
    (width ? ' style="width:' + width + 'px"' : "") +
    (disabled ? " disabled" : "") + ">";
}
function adaptSel(id, opts, val, width, disabled){
  /* ★ 2026-09-30（第十六轮 · 全量评审修复）：**渲染层统一归一** ——
     原实现 o === val 严格匹配且**无兜底 option**：存量值 / 旧版本值不在选项内时，
     没有任何 option 带 selected，浏览器静默回落显示第一项，而状态（草稿、落库值）仍是旧值
     —— 「显示的」与「生效的」不是一个值。最典型是 bdPath：下拉显示「资产直连（默认）」，
     下方完整调用地址却按旧值「网关代理」拼接，同卡自相矛盾。
     归一收在渲染层 → 25 处调用点零改动，且草稿回收（adaptStashF）读到的即归一后的值。 */
  if (opts && opts.length && opts.indexOf(val) < 0) val = opts[0];
  return '<select id="' + id + '"' + (width ? ' style="width:' + width + 'px"' : "") + (disabled ? " disabled" : "") + ">" +
    opts.map(function(o){ return "<option" + (o === val ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
    "</select>";
}
/* 当前资产在该档位下的已存取值；无则回默认。优先 adaptSt().f[field]，其次 _TMP 草稿。 */
/* 当前资产在该档位下的已存取值；无则回默认。
   ★ 2026-09-30（第六轮 b）：取值优先级反转 —— **草稿（ADAPT_F_TMP）优先于已保存值（_adapt.f）**。
     此前已保存值优先：用户保存 V1 后再输入 V2（未保存）→ 切档 → 切回，看到的是旧值 V1
     而不是自己刚输入的 V2（最新输入被旧存值掩盖，实测坐实）。
     配套：adaptStashF(true) 保存落库后即清本档草稿，避免旧草稿盖住新存值。 */
function adaptF(mode, field, dflt){
  var tmp = ADAPT_F_TMP[adaptKey()];
  if (tmp && tmp[mode] && tmp[mode][field] != null) return tmp[mode][field];
  var st = adaptSt();
  if (st && st.f && st.f[mode] && st.f[mode][field] != null) return st.f[mode][field];
  return dflt;
}

/* 注入范围：平台安全基线固定不可改（仅非 public 路径），此处只呈现不提供控件。
   ★ 2026-09-30：并入一条 .mini 单行 + help，去掉重复的「仅非 public 路径」表述（标题已说明）。 */
function adaptScopeRow(){
  return '<div class="fld wide" style="margin-bottom:0"><label>注入范围</label>' +
    '<div class="mini" style="line-height:1.7"><b>仅非 public 路径</b>　·　平台安全基线，固定不可改</div>' +
    '<div class="help">显式公开（public）路径不回送主体身份；如需注入，须先在其细粒度策略中取消 public 标记。</div></div>';
}
/* 注入内容：本档**固定**为「平台重签的短时 JWT」，无第二选项。
   ★ 2026-09-30（用户裁定）：「仅用户标识」**撤除** —— 裸标识（X-User-Id 类）不带签名，
     客户端可伪造、资产无从验证；只用用户标识的资产改走 B 档（key ＋ userinfo）换取，
     或直接读 JWT 的标准 claim（sub）。「原样透传」亦不在资产配置面（针对生态内部平台）。
   ⚠ 两类凭据的网关行为不同，勿混（用户定义四要素）：
   · 原始 Bearer token —— **一次访问一次有效 / 短时间有效 / 不出网关 /
     在网关内被还原成明文**（还原后供网关侧完成认证，资产永远见不到）；
   · 重签短时 JWT —— 服务端签发的**成品**，网关**只转发、不解析**
     （§3.6：实时向服务端请求签发后注入）。 */
function adaptContentSel(val, trust){
  var opts = ["重签短时 token"];
  /* 存量已存「仅用户标识」/「原样透传…」值 → 回落唯一选项（选项已撤，select 不得悬空） */
  if (opts.indexOf(val) < 0) val = opts[0];
  return adaptSel("adContent", opts, val, 260, !trust);
}

/* —— 以下段落属「身份适配」，与上方切除段无依赖 —— */
function adaptFormA(){
  var trust = adaptTrust(), dis = !trust;
  /* ★ 2026-09-30（第八轮 d · 用户裁定）：**字段映射功能整体撤除** ——
     平台自身即 JWT 签发方，claim 名直签即成，「签发后 rename」属多余环节；
     资产按 OIDC 标准 claim（sub / name / email…）读取，标准客户端免适配。
     （内部事实 · 用户裁定：原始 Bearer token＝一次访问一次有效 / 短时间有效 / 不出网关 /
     网关内还原明文认证；重签短时 token 是 JWT 成品、网关只转发不解析、携带用户身份声明；
     「原样透传」针对生态内部平台，对资产不可选。） */
  var content = adaptF("A","content","重签短时 token");
  return adaptSecHead("A · token 注入参数", "平台签发短时 token，注入上游请求") +
    /* 前置：信任声明（FR-1.4「前置，默认否」）—— 未声明信任的资产不得配置注入（AC-F2.2-4）。 */
    '<div class="fld wide" style="margin-bottom:10px"><label>信任声明 <span class="req">*</span></label>' +
      '<label class="chk"><input type="checkbox" id="adTrust" data-auth-adapt-trust="1"' + (trust ? " checked" : "") + ">" +
      "<span>本资产声明信任平台注入的身份（<b>前置条件</b>；未声明时本档不可配置，「保存并下发」将被拒绝）</span></label>" +
    "</div>" +
    adaptGrid(
      adaptFld("启用范围", adaptSel("adScope", ["两者（默认）", "无端", "有端"], adaptF("A","scope","两者（默认）"), 200, dis), "在哪些接入路径生效；有端由<b>端侧 SDK</b> 承载（§2.3）。") +
      adaptFld("注入位置", adaptSel("adPos", ["请求头（默认）", "Cookie", "查询参数"], adaptF("A","pos","请求头（默认）"), 200, dis), "<b>查询参数</b>会使 token 落入访问日志，仅用于存量资产。") +
      adaptFld("令牌字段名", adaptIn("adField", adaptF("A","field","Authorization"), "", 200, dis), "默认 <b>Authorization</b>。") +
      adaptFld("注入内容", adaptContentSel(content, trust), "本档固定为<b>平台重签的短时 JWT</b>（OIDC 标准 claim：sub / name / email…）；<b>不提供「只注入用户 ID」</b>（裸标识可伪造、资产无从验证，需标识者改用 B 档或读 <code class=\"kr\">sub</code>）。") +
      adaptFld("透传策略", adaptSel("adPass", ["覆盖为白泽 token（默认）", "透传用户自带"], adaptF("A","pass","覆盖为白泽 token（默认）"), 200, dis), "<b>用户请求自带</b>同名字段（可能是其他系统凭据）时怎么办：默认以平台签发值<b>覆盖</b>——用户已过白泽认证，平台签发值才是本会话的权威凭据；透传自带值会让资产被其他凭据误导，造成身份混淆（§3.7 透传冲突）。") +
      adaptFld("未认证跳转", adaptSel("adRedirect", ["平台登录页（默认）", "拒绝访问"], adaptF("A","redirect","平台登录页（默认）"), 200, dis), "未登录用户访问时的处理（未认证不放行）。")
    ) +
    /* ★ 2026-09-30（用户裁定 · 去重）：配置区**不再重复承载端点交付内容** ——
       本档「给资产侧开发者什么」统一由下方「配套信息 → 接入信息交付」卡按档位产出
       （adaptDeliverInfo()：注入位置 / 字段名 / JWT 形态 / OIDC 标准验签端点 / 内容解析）；
       配置区只留**可配置项**，避免同一件事两处表述、两处漂移。 */
    adaptNote("注入前<b>先删除同名客户端字段</b>再写可信值（顺序颠倒会被客户端自带值覆盖）；不并存、不双写。"
      + "「查询参数」仅对存量资产开放并按平台口径脱敏。", "注入纪律与边界") +
    adaptScopeRow();
}

/* ★ 2026-09-30（第六轮 · 同日订正）：勾选组控件族 ——
   「按需声明的字段集」勾选组（B 档 userinfo 返回字段集）走这里。
   ⚠ 原注释所称的「源 → 目标」成对控件**两处均已撤除**：A 档注入的是平台重签 JWT
   （资产按 OIDC 标准 claim 读取）、C 档主标识由协议规范封装 —— 两档都不存在字段映射。 */
/* B 档 userinfo 返回字段集 —— **单一真源**：控件选项与旧值白名单此前是两处硬编码同名数组，
   增删一项要改两处，漏改则勾选值被静默回落为默认。 */
var B_FIELD_OPTS = ["用户标识", "姓名", "工号", "组织", "会话上下文"];
function adaptChkGrp(id, opts, curArr){
  return '<span class="chkgrp" id="' + id + '" data-chkgrp="1" style="display:flex;flex-wrap:wrap;gap:8px 16px">' +
    opts.map(function(o){
      var on = (curArr || []).indexOf(o) >= 0;
      return '<label class="chk"><input type="checkbox" value="' + esc(o) + '"' + (on ? " checked" : "") + '><span>' + esc(o) + "</span></label>";
    }).join("") + "</span>";
}
function adaptChkVal(saved){
  /* 旧存量值（如 "sub, name, dept"）不含已知选项时回落默认「用户标识」 */
  var known = B_FIELD_OPTS;
  var arr = String(saved || "").split(/[,，、;；\s]+/).filter(Boolean);
  var hit = arr.filter(function(x){ return known.indexOf(x) >= 0; });
  return hit.length ? hit : ["用户标识"];
}
function adaptFormB(){
  /* ★ 2026-09-30（用户裁定口径 · 权威源 §4.4「调用路径（双路径，按资产网络可达性选择）」）：
     资产服务端能否访问平台服务，取决于**网络位置与网络策略**：可访问（内网互通）⇒ 直连平台
     userinfo 接口；网络隔离不可达 ⇒ 经网关代理端点（https://{无端网关}/_baize/sso/userinfo）。
     ⚠ 另一条独立约束：**资产的网页前端只能访问网关** —— 由前端发起的换取须走网关代理地址。
     「换取路径」字段保留（源 §4.4 双路径），完整调用地址随选择联动展示，管理员可复制给资产侧开发者。
     ★ 2026-10-12（跨侧收口）：网关代理地址统一落在网关保留命名空间 /_baize/* 内 ——
     技术指南 §5.1 定「平台端点统一 /_baize/* 前缀；资产不得占用」，落在普通路径的
     代理端点会被资产同名路径遮蔽；网关侧「未声明子路径 404 不转发」也要求它可被声明。 */
  /* ★ 2026-09-30（第十六轮）：取值**先归一**再判定 —— adaptSel 已在渲染层兜底，
     本处若仍拿未归一的原值判 proxy，会出现「下拉显示资产直连、完整调用地址却是网关代理」。 */
  var bPath = adaptF("B","path","资产直连（默认）");
  if (["资产直连（默认）","网关代理"].indexOf(bPath) < 0) bPath = "资产直连（默认）";
  var proxy = bPath.indexOf("网关代理") === 0;
  var full = proxy ? "https://{无端网关}/_baize/sso/userinfo" : "https://<平台>/api/v1/sso/userinfo";
  return adaptSecHead("B · key ＋ userinfo 参数", "一次性 key ＋ userinfo 换取") +
    adaptGrid(
      adaptFld("启用范围", adaptSel("bdScope", ["两者（默认）", "无端", "有端"], adaptF("B","scope","两者（默认）"), 200), "该 key 注入规则生效的接入路径；有端由<b>端侧 SDK</b> 承载（§2.3）。") +
      adaptFld("注入位置", adaptSel("bdPos", ["请求头（默认）", "Cookie", "查询参数"], adaptF("B","pos","请求头（默认）"), 200), "key 注入<b>换取入口请求</b>的位置。") +
      adaptFld("key 字段名", adaptIn("bdField", adaptF("B","field","X-SSO-Key"), "", 200), "注入到资产的字段名，默认 <b>X-SSO-Key</b>；资产回调 userinfo 时 key 一律经该请求头传递。") +
      adaptFld("key 有效期 <span class=\"req\">*</span>", adaptIn("bdTtl", adaptF("B","ttl","300"), "秒", 120), "默认 300 秒；仅接受正整数（秒），超期作废。") +
      /* ★ 2026-09-30（第十四轮 · 用户裁定）：原「注入入口 URL」「换取路径」两行**并为一块** ——
         key 进哪（入口）与从哪换（路径）是同一件事的两端，分两行既费高度、又把一条链拆成两截。
         完整调用地址随「换取路径」联动呈现，管理员可直接复制给资产侧开发者。 */
      '<div class="fld" style="margin-bottom:10px"><label>key 注入与换取</label>' +
        '<div class="adapt-pair" style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">' +
          '<div style="flex:1;min-width:240px">' +
            '<div class="mini" style="margin-bottom:4px">注入入口 URL（资产侧）<span class="req" style="color:var(--err)">*</span> · 仅注入该 URL 的请求</div>' +
            adaptIn("bdUrl", adaptF("B","url",""), "/sso/entry", 320) +
          "</div>" +
          '<div style="flex:none;width:210px">' +
            '<div class="mini" style="margin-bottom:4px">换取路径（资产 → 平台）</div>' +
            adaptSel("bdPath", ["资产直连（默认）", "网关代理"], bPath, 200) +
          "</div>" +
        "</div>" +
        '<div class="mini" style="margin-top:8px;line-height:1.8">完整调用地址（交资产侧开发者）：<br><code class="kr">GET ' + esc(full) + '</code>　请求头 <code class="kr">X-SSO-Key: &lt;key&gt;</code></div>' +
        '<div class="help">按资产<b>服务端</b>的网络可达性选择；资产<b>前端</b>发起的换取只能走网关代理。</div>' +
      "</div>" +
      adaptFld("userinfo 返回字段集", adaptChkGrp("bdFields", B_FIELD_OPTS, adaptChkVal(adaptF("B","fields","用户标识"))), "<b>最小集合</b>：按资产注册声明，要什么给什么。") +
      adaptFld("来源限制 <span class=\"req\">*</span>", adaptIn("bdSrc", adaptF("B","src",""), "IP 网段 / 域名（可叠加，多条）", 320), "允许回调 userinfo 的请求来源，白名单外一律拒绝并告警。", true)
    ) +
    adaptNote("key <b>单次消费</b>、与会话绑定、登出即作废；仅经 HTTPS 通道传输，HTTP 资产<b>不建议启用</b>本模式。"
      + "有端路径 key 由 SDK <b>实时向服务端请求签发</b>，注入后不保存、用完即弃。", "key 安全设计") +
    adaptScopeRow();
}

/* ★ 2026-09-30（第十五轮 · 用户裁定）：C 档**协议规格表** —— 协议不是标签，
   它决定**配什么、交付什么**：
   · §5.2 / FR-3.1：平台自动生成的接入配置三种协议各不相同
     （**CAS 服务地址、SAML 元数据、OIDC client 凭据**）；
   · §5.5「元数据发布」的适用对象只写 **SAML / OIDC**（CAS 无标准 metadata 文档）；
   · FR-3.4 的签名针对**断言 / 票据**：SAML 签断言、OIDC 签 ID Token，
     CAS 的 ST 是随机会话标识、不做签名（§5.2「签发服务票据（ST），提供票据校验端点」）。
   ⚠ 配置区 help 内**不写协议标准端点**（交付内容单点在「接入信息交付」卡承载）。 */
var CD_PROTO_DEF = {
  "OIDC": {
    /* ★ 2026-09-30（用户裁定 · 对齐 A 档）：**本档不存在「映射」** ——
       标准协议的主标识由**协议规范**规定，平台以**用户主标识**直接封装，
       不提供「源字段 → 目标标识」的选择（与 A 档撤除字段映射同理）。
       OIDC Core 1.0 §2：sub 为 REQUIRED 且「Issuer 内本地唯一、永不复用」；
       preferred_username / email 属 profile / email scope 的**可变** claim，不保证唯一稳定。 */
    idName: "sub",
    idField: "ID Token 的 subject",
    cert: true,
    meta: true,
    protoHelp: "选型后平台<b>自动生成</b>该资产的协议接入配置（<b>client 凭据 + 发现文档</b>），见下方「接入信息交付」。",
    idNote: "平台以<b>用户主标识</b>直接封装为 <b>sub</b>，无字段映射可配（决定该用户显示为谁）。OIDC 规定 sub 在签发方内<b>唯一且永不复用</b>。",
    certHelp: "ID Token 签名证书（标准 RP <b>强制校验签名</b>，不可关闭）；到期续期纳入证书生命周期管理。",
    metaHelp: "对外发布 <b>OIDC 发现文档</b>（含授权 / 令牌 / 用户信息端点与公钥集），资产侧 RP 据此自动完成对接配置。",
    sloHelp: "登出白泽时按 OIDC 规范向资产的 <b>end_session</b> 端点发起登出；依赖资产侧实现完整度，<b>尽力而为并记录</b>。",
    ttlHelp: "ID Token 有效期（<b>exp</b> 声明）。留空＝按协议惯例。",
    note: "协议握手在<b>浏览器层</b>完成（无端＝用户浏览器、有端＝SDK 内置浏览器），<b>不依赖端侧 SDK 注入能力</b>，可独立排期；资产侧配置由双方按交付的接入信息联调完成。"
  },
  "SAML 2.0": {
    /* ★ 2026-09-30（用户裁定 · 对齐 A 档）：同 OIDC，本档不存在「映射」——
       SAML 2.0 Core §2.2.2 规定断言主体为**单一** <NameID>，平台直接封装。 */
    idName: "NameID",
    idField: "断言的 NameID",
    cert: true,
    meta: true,
    protoHelp: "选型后平台<b>自动生成</b>该资产的协议接入配置（<b>IdP 元数据</b>），见下方「接入信息交付」。",
    idNote: "平台以<b>用户主标识</b>直接封装为断言的 <b>NameID</b>，无字段映射可配；资产侧 SP 以此为登录主体。",
    /* ★ 2026-09-30 调研补全（SAML 2.0 Core §8.3 NameID Policy）：Format 是**双方必须对齐**的项 ——
       资产 SP 在 AuthnRequest 的 NameIDPolicy 中声明其支持的 Format，返回不匹配的格式会直接登录失败；
       transient 仅对单次 SSO 有效、不能用于识别用户（SAML 2.0 规范与各 IdP 实现文档一致）。
       默认取 unspecified：此时 NameID 值即平台封装的主标识（与 FR-3.3 的口径一致）。 */
    nameIdFmt: ["未指定 unspecified（默认）", "邮箱地址 emailAddress", "持久标识 persistent", "临时标识 transient"],
    nameIdFmtHelp: "须与资产 SP 的 <b>NameIDPolicy</b> 一致，不一致资产侧会拒绝登录；<b>未指定</b>时 NameID 值为平台封装的主标识；<b>持久标识</b>由平台按「用户 × 资产」生成<b>不透明</b>持久标识（主标识不参与）；<b>临时标识</b>仅对单次 SSO 有效、<b>不能用于识别用户</b>。",
    certHelp: "断言（Assertion）签名证书；资产侧按元数据中的证书校验签名，<b>到期未续期会导致校验失败</b>（§5.6）。",
    metaHelp: "对外发布 <b>IdP 元数据</b>（EntityID / SSO 端点 / 签名证书），资产侧导入即完成基础对接配置。",
    sloHelp: "登出白泽时按 <b>SAML Logout profile</b> 向资产发起登出；依赖资产侧实现完整度，<b>尽力而为并记录</b>。",
    ttlHelp: "断言的 <b>NotOnOrAfter</b> 有效期。留空＝按协议惯例。",
    note: "协议握手在<b>浏览器层</b>完成（无端＝用户浏览器、有端＝SDK 内置浏览器），<b>不依赖端侧 SDK 注入能力</b>，可独立排期；资产侧配置由双方按交付的接入信息联调完成。"
  },
  "CAS": {
    /* ★ 2026-09-30（用户裁定 · 对齐 A 档）：同 OIDC / SAML，本档不存在「映射」——
       CAS 票据校验返回**单值** Principal-Id，平台直接封装。 */
    idName: "Principal-Id",
    idField: "票据校验返回的 Principal-Id",
    cert: false,
    meta: false,
    protoHelp: "选型后平台<b>自动生成</b>该资产的协议接入配置（<b>CAS 服务地址与票据校验端点</b>），见下方「接入信息交付」。",
    idNote: "平台以<b>用户主标识</b>直接封装为票据校验返回的 <b>Principal-Id</b>（单值），无字段映射可配；资产侧以此为登录主体。",
    /* ★ 2026-09-30 调研补全（CAS Protocol 2.0 §2.5 / 3.0）：**校验端点决定能否拿到属性** ——
       2.0 的 /serviceValidate 只回 cas:user；3.0 的 /p3/serviceValidate 才回属性。
       ⚠ 主标识（Principal-Id）两版本均提供；版本差异只影响**附加属性**（扩展需求），
       本项按「交予资产的票据校验端点」设。 */
    casVer: ["CAS 3.0（默认）", "CAS 2.0"],
    casVerHelp: "3.0 的票据校验端点<b>返回用户属性</b>；2.0 <b>仅返回用户名</b>（主标识 Principal-Id 两版本均提供）。需向资产传递附加属性时须用 3.0。",
    certHelp: "",
    metaHelp: "",
    sloHelp: "登出白泽时调用资产的 <b>CAS 登出端点</b>；依赖资产侧实现完整度，<b>尽力而为并记录</b>。",
    ttlHelp: "签发票据（TGT / ST）的有效期。留空＝按协议惯例。",
    note: "协议握手在<b>浏览器层</b>完成（无端＝用户浏览器、有端＝SDK 内置浏览器），<b>不依赖端侧 SDK 注入能力</b>。CAS 票据为随机会话标识、<b>不做签名</b>，真实性由 <b>HTTPS 通道 + 资产侧回平台校验票据</b>保证；该协议无标准元数据文档，故本档无「签名证书 / 元数据发布」两项。"
  }
};
/* C 档协议取值**归一** —— 存量 / 旧版本值不在 CD_PROTO_DEF 时回落 OIDC。
   ★ 2026-09-30（第十七轮 · 全量评审修复）：表单（adaptFormC）与交付卡（adaptDeliverInfo）
     此前各自判定，存量非法值会让「表单按 OIDC 渲染、交付卡按旧串拼 SAML 分支」
     （交付卡判据是 indexOf("SAML") === 0，旧串 "SAML" 也命中）—— 同页两处结论相反。 */
function adaptProto(){
  var p = adaptF("C", "proto", "OIDC");
  return CD_PROTO_DEF[p] ? p : "OIDC";
}
/* ★ 2026-09-30（用户裁定）：原 `adaptProtoSlug`（协议短名，仅用于 mapDst 跨协议分键）
   随「身份标识映射」一并撤除 —— 本档已无映射类字段，无键可分。 */
/* C 档待落库控件表 —— 字段集**随协议**：CAS 无签名证书 / 元数据发布。
   写死 id 表会让页面上不存在的两项被静默跳过，配置面与落库面口径不一。
   ★ 2026-09-30（用户裁定）：本档**无映射类字段**（主标识由协议规范封装），
   mapSrc / mapDst@<协议> 一对键随之失去读取方，不再列入。 */
function adaptCIds(){
  var pp = adaptProto();
  var ids = { proto:"cdProto", slo:"cdSlo", ttl:"cdTtl" };
  var P = CD_PROTO_DEF[pp] || CD_PROTO_DEF["OIDC"];
  if (P.nameIdFmt) ids.nameFmt = "cdNameFmt";
  if (P.casVer) ids.casVer = "cdCasVer";
  if (P.cert) ids.cert = "cdCert";
  if (P.meta) ids.meta = "cdMeta";
  return ids;
}
function adaptFormC(){
  /* ★ 2026-09-30（第十五轮 · 用户裁定）：C 档**协议驱动** —— 协议不是标签，
     它决定**配什么、交付什么**：
     · §5.2 / FR-3.1：平台自动生成的接入配置三种协议各不相同
       （**CAS 服务地址、SAML 元数据、OIDC client 凭据**）；
     · §5.5「元数据发布」的适用对象只写 **SAML / OIDC**（CAS 无标准 metadata 文档）；
     · FR-3.4 的签名针对**断言 / 票据**：SAML 签断言、OIDC 签 ID Token，
       CAS 的 ST 是随机会话标识、不做签名（§5.2「签发服务票据（ST），提供票据校验端点」）。
     故字段集与交付内容按协议分叉，而非「协议一选、其余照旧」。 */
  var proto = adaptProto();
  var P = CD_PROTO_DEF[proto] || CD_PROTO_DEF["OIDC"];
  var inner =
    adaptFld("协议类型", adaptSel("cdProto", ["OIDC", "SAML 2.0", "CAS"], proto, 200), P.protoHelp) +
    /* ★ 2026-09-30（用户裁定 · 对齐 A 档「注入内容」的只读体例）：**本档没有映射** ——
       标准协议的主标识由**协议规范**规定（OIDC 的 sub 在签发方内唯一且永不复用 /
       SAML 断言的 NameID / CAS 票据校验的 Principal-Id），平台以**用户主标识**直接封装，
       不存在「源字段 → 目标标识」这一层可配，故本行为**只读陈述**、不是配置项。
       ⚠ 边界：向资产传递**附加属性**（工号 / 邮箱 / 组织 → 资产的 claim / assertion attribute）
         不在本条覆盖内，属扩展需求 —— 须先在需求侧立项（OIDC claims / SAML AttributeStatement /
         CAS 3.0 attributes 均具备承载能力），再在原型补「附加属性」表。 */
    adaptFld("对外主标识", '<span class="tag t-info">' + esc(P.idName) + "</span>" +
      '<span class="mini" style="margin-left:8px">' + esc(P.idField) + "</span>", P.idNote, true);
  if (P.nameIdFmt) inner += adaptFld("NameID 格式", adaptSel("cdNameFmt", P.nameIdFmt, adaptF("C","nameFmt",P.nameIdFmt[0]), 240), P.nameIdFmtHelp);
  if (P.casVer) inner += adaptFld("CAS 协议版本", adaptSel("cdCasVer", P.casVer, adaptF("C","casVer",P.casVer[0]), 200), P.casVerHelp);
  if (P.cert) inner += adaptFld("签名证书", adaptSel("cdCert", ["平台默认证书", "指定证书"], adaptF("C","cert","平台默认证书"), 200), P.certHelp);
  if (P.meta) inner += adaptFld("元数据发布", adaptSel("cdMeta", ["是（默认）", "否"], adaptF("C","meta","是（默认）"), 200), P.metaHelp);
  inner +=
    adaptFld("SLO（单点登出）", adaptSel("cdSlo", ["启用（默认）", "关闭"], adaptF("C","slo","启用（默认）"), 200), P.sloHelp) +
    adaptFld("票据有效期", adaptIn("cdTtl", adaptF("C","ttl",""), "需覆盖协议默认时再填秒数", 200), P.ttlHelp);
  return adaptSecHead("C · 协议级 SSO 参数", "平台作 IdP · 自动生成接入配置 · 身份标识为唯一主标识（单条）") +
    adaptGrid(inner) + adaptNote(P.note, "边界");
}

/* D 档「账号密码代填」—— ★ 代填契约在此按【资产】配置（这是本页签存在的关键理由之一）。
   凭据本体（谁在哪个资产用什么账号）由《认证模块》的「用户代填账号托管」承载；
   而「该资产登录页长什么样、字段选择器怎么填、提交方式与验证判据」是**资产属性**，
   同一资产下所有用户共用一份，故只能配在资产侧 —— 不能配在用户托管账号上。 */
/* 登录形态历史值归一（第十四轮 f）：旧三档「两步（账号页 → 密码页）」/「多步 + 动态挑战」
   → 现行两档「多步（两步及以上）」。d 就地改写，随下一次保存落库即完成收敛。
   adaptSel 是 o === val 严格匹配、无兜底项 —— 不归一会让下拉静默落回「单步」，
   与已按多步展开的字段组状态自相矛盾。 */
function adaptNormKind(d){
  if (d && d.kind && (d.kind.indexOf("两步") === 0 || d.kind.indexOf("多步 +") === 0)) d.kind = "多步（两步及以上）";
  return (d && d.kind) || "单步（账号+密码同页）";
}
function adaptFormD(){
  /* ★ 2026-09-30（第五轮）：去卡化 —— 摘要区并入「用户身份」卡（adaptSecHead 分节）；
     弹窗录入（完整契约，adaptContractDlg）逻辑不变。
     ★ 2026-09-30（第六轮）：摘要行补「表单识别规则 / 凭据托管方式」（§6.6 配置项可见性）。 */
  var d = adaptDRead();
  var hasUrl = !!(d.url && d.url !== "—");
  var rec = String(d.recogn || "").indexOf("自定义") === 0;
  var hasSel = !!(d.userSel && d.userSel !== "—" && d.pwdSel && d.pwdSel !== "—");
  var conf = hasUrl && (!rec || hasSel);
  var kind = adaptNormKind(d);
  var rows =
    '<div class="kv" style="grid-template-columns:130px 1fr;margin-bottom:6px"><span class="k">登录页地址</span><span class="mini">' +
      (hasUrl ? '<code class="kr">' + esc(d.url) + "</code>" : '<span style="color:var(--err)">未配置</span>') + "</span></div>" +
    '<div class="kv" style="grid-template-columns:130px 1fr;margin-bottom:6px"><span class="k">表单识别</span><span class="mini">' +
      (rec ? ("自定义选择器 · " + (hasSel ? "账号 / 密码 / 提交 三组已配置" : '<span style="color:var(--err)">未配置完整</span>')) : "自动（字段特征库，默认）") + "</span></div>" +
    '<div class="kv" style="grid-template-columns:130px 1fr;margin-bottom:6px"><span class="k">登录形态</span><span class="mini">' + esc(kind) + "</span></div>" +
    '<div class="kv" style="grid-template-columns:130px 1fr;margin-bottom:6px"><span class="k">登录成功判据</span><span class="mini">' +
      (d.verify && d.verify !== "—" ? esc(d.verify) : "未配置") + "</span></div>" +
    '<div class="kv" style="grid-template-columns:130px 1fr"><span class="k">凭据托管</span><span class="mini">' +
      esc(d.trustee || "用户自管（默认）") + "</span></div>";
  return adaptSecHead("D · 账号密码代填 · 表单契约（按资产）", "托管凭据代填 · 四档中最弱环") +
    '<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:300px">' + rows + "</div>" +
      '<div style="flex:none;padding-top:2px">' +
        '<button class="btn primary" type="button" data-auth="adaptOpenContract">' +
          (conf ? "修改表单契约" : "配置表单契约") + " →</button>" +
      "</div>" +
    "</div>" +
    adaptNote(
      "代填依赖本契约定位登录页字段。<b>选择器未命中</b>（应用改版）→ 本次代填失败并<b>提示手动登录</b>；" +
      "须重配契约、测试通过后方可恢复。",
      "契约失效即停止代填") +
    "<div style=\"margin-top:2px\">" + authTag(conf ? "契约已配置" : "契约未配置 · 代填不可用", conf ? "t-ok" : "t-warn") + "</div>";
}

/* D 档「表单契约」弹窗：12 字段完整录入（页内只留摘要，避免 1.7 屏长表单）。
   ⚠ adaptStashD() 按 id 取值 —— 弹窗内渲染同一组 id，故保存逻辑无需改动。
   弹窗保存走独立入口（data-act），不回写页内表单，避免两处 id 冲突。 */
/* 校验命中第①步字段（登录页地址 / 选择器）时：先收值 → 切回第①步 → 重绘，
   否则 markBad 打在一个 display:none 的控件上，用户看不到任何反馈（两步化的必然配套）。 */
function adjustContractBack(){ adaptStashD(true); window.__dlgStep = 1; adaptContractDlg(); }
function adaptContractDlg(){
  var d = adaptDRead();
  var kind = adaptNormKind(d);
  var multiStep = kind.indexOf("多步") === 0;
  var g = function (k, dv) { var v = d[k]; return (v && v !== "—") ? v : dv; };
  /* ★ 2026-09-30（第六轮 · 参数对齐权威源 §6.6）：
     「表单识别规则」默认**自动（字段特征库）**、自定义选择器仅兜底（原文默认值＝自动，
       此前强制手填选择器属口径反转）；「验证码策略」两选（人工输入（默认）/ 短信自动回填（可选定制））；
     「凭据绑定范围」＝一对一（默认）/ 多对一；「代填失败动作」＝提示手动登录（默认）/ 阻断访问；
     新增「凭据托管方式」（用户自管（默认）/ 管理员托管）与「启用范围」。
     外层 .adapt-dlg 包装：弹窗内控件宽度统一（CSS scope，不影响其它弹窗）。 */
  var rec0 = String(d.recogn || "").indexOf("自定义") === 0;
  /* ★ 2026-09-30（第十四轮 · 用户裁定「弹窗太长」）：改为**两步**录入（原 12 字段平铺 → 785px / 可视 728px 必滚动）。
     ① 登录页与识别 ② 提交与凭据 —— 每步 3 行，均不滚动。
     ⚠ 非当前步仅 display:none，**字段仍全部在 DOM** —— adaptStashD() 按 id 取值不受影响；
     步间切换前先 adaptStashD() 收值，保存校验命中第①步字段时自动跳回第①步。 */
  var step = (window.__dlgStep === 2) ? 2 : 1;
  var h =
    '<div class="adapt-dlg">' +
    '<div class="dlg-steps">' +
      '<span class="st' + (step === 1 ? " on" : "") + '" data-dstep="1">① 登录页与识别</span>' +
      '<span class="st' + (step === 2 ? " on" : "") + '" data-dstep="2">② 提交与凭据</span>' +
      '<span class="lnk" data-dstep="' + (step === 1 ? 2 : 1) + '">' + (step === 1 ? "下一步 →" : "← 上一步") + "</span>" +
    "</div>" +
    /* —— 第 ① 步：登录页与识别 —— */
    '<div class="fld-grid' + (step === 1 ? "" : " off") + '">' +
      '<div class="dlg-sec">登录页</div>' +
      adaptFld("资产登录页地址 <span class=\"req\">*</span>", adaptIn("ddUrl", d.url || "", "https://<资产>/login", 320), "须为 https://；存量 http 按例外登记。") +
      adaptFld("备用 / 跳转地址", adaptIn("ddUrlAlt", d.urlAlt && d.urlAlt !== "—" ? d.urlAlt : "", "无则留空", 320)) +
      adaptFld("登录形态", adaptSel("ddKind", ["单步（账号+密码同页）", "多步（两步及以上）"], kind, 240), "单步＝一次填完；多步＝首屏提交后按跳转后页面组继续填充。") +
      '<div class="dlg-sec">识别与填充</div>' +
      adaptFld("表单识别规则", adaptSel("ddRecogn", ["自动（字段特征库，默认）", "自定义选择器"], g("recogn","自动（字段特征库，默认）"), 240), "自动＝按字段特征库识别；自定义用于未覆盖的资产。") +
      adaptFld("登录成功判据", adaptIn("ddVerify", d.verify && d.verify !== "—" ? d.verify : "", "如 URL 含 /portal/home", 320), "不满足即计一次失败。") +
      /* 选择器组仅在「自定义选择器」时展开 —— 自动模式留空即可。 */
      '<div id="ddSelWrap" class="fld wide" style="margin:0;min-height:0;display:' + (rec0 ? "block" : "none") + '">' +
        '<div class="fld-grid">' +
          adaptFld("账号字段选择器 <span class=\"req\">*</span>", adaptIn("ddUserSel", d.userSel && d.userSel !== "—" ? d.userSel : "", "如 #loginForm input[name=\"username\"]", 320)) +
          adaptFld("密码字段选择器 <span class=\"req\">*</span>", adaptIn("ddPwdSel", d.pwdSel && d.pwdSel !== "—" ? d.pwdSel : "", "如 #loginForm input[name=\"password\"]", 320)) +
          adaptFld("提交按钮选择器", adaptIn("ddSubmitSel", d.submitSel && d.submitSel !== "—" ? d.submitSel : "", "如 #loginForm button[type=\"submit\"]", 320)) +
        "</div>" +
      "</div>" +
      (multiStep ? (function(){
        var s2 = d.step2 || {};
        return '<div class="fld wide" style="margin:0;min-height:0;border-left:2.5px solid var(--primary);padding-left:10px">' +
          '<div class="mini" style="margin-bottom:6px"><b>跳转后页面</b> · 多步形态专用</div>' +
          '<div class="fld-grid">' +
            adaptFld("页面地址", adaptIn("ddS2Url", s2.url || "", "https://<资产>/step2", 320)) +
            adaptFld("账号选择器", adaptIn("ddS2User", s2.userSel && s2.userSel !== "—" ? s2.userSel : "", "如无则留空", 320)) +
            adaptFld("密码选择器", adaptIn("ddS2Pwd", s2.pwdSel && s2.pwdSel !== "—" ? s2.pwdSel : "", "", 320)) +
            adaptFld("提交按钮", adaptIn("ddS2Submit", s2.submitSel && s2.submitSel !== "—" ? s2.submitSel : "", "", 320)) +
          "</div>" +
          '<div class="help">首屏提交后页面跳转，平台按本组选择器继续填充；<b>任一选择器缺失即整体失败</b>。</div>' +
        "</div>";
      })() : "") +
    "</div>" +
    /* —— 第 ② 步：提交与凭据 —— */
    '<div class="fld-grid' + (step === 2 ? "" : " off") + '">' +
      '<div class="dlg-sec">提交与降级</div>' +
      adaptFld("提交方式", adaptSel("ddSubmit", ["自动提交", "等用户点击"], d.submit || "自动提交", 200), "「等用户点击」仅填充、不提交。") +
      adaptFld("验证码策略", adaptSel("ddCaptcha", ["人工输入（默认）", "短信验证码自动回填（可选定制）"], g("captcha","人工输入（默认）"), 240), "人机校验，<b>不承诺全免密</b>。") +
      adaptFld("代填失败动作", adaptSel("ddFail", ["提示手动登录（默认）", "阻断访问"], g("fail","提示手动登录（默认）"), 200), "默认友好降级；严格场景可阻断。") +
      adaptFld("启用范围", adaptSel("ddScope", ["两者（默认）", "无端", "有端"], g("scope","两者（默认）"), 200), "按接入路径生效；有端由<b>端侧 SDK</b> 承载（§2.3）。") +
      '<div class="dlg-sec">凭据</div>' +
      adaptFld("凭据绑定范围", adaptSel("ddBind", ["一对一（默认）", "多对一（多人共用资产账号）"], g("bind","一对一（默认）"), 240), "多对一＝多人共用同一资产账号。") +
      adaptFld("凭据托管方式", adaptSel("ddTrustee", ["用户自管（默认）", "管理员托管"], g("trustee","用户自管（默认）"), 200), "自管＝用户录入、可删除；托管＝管理员维护。") +
    "</div>";
  h += adaptNote("契约存服务端；<b>本处只配契约、不存凭据</b>。", "边界") +
    "</div>";
  openDlg("配置账号密码代填 · 表单契约", "<b>资产</b>：" + esc(adaptAssetName()) + "　·　契约按资产存，同资产下所有用户共用一份。", h, "lg");
  var ok = document.getElementById("dlg1Ok");
  if (ok) {
    ok.textContent = "保存契约";
    ok.onclick = function () {
      /* ★ 2026-09-30（第十七轮）：校验**先于**提交 —— 原实现先 adaptStashD() 落资产再校验，
         失败时半成品契约已进资产对象。现在改为：收进草稿 → 校验 → 通过才提交。 */
      adaptStashD(true);
      var d2 = adaptDRead();
      if (!d2.url) { window.__dlgStep = 1; adjustContractBack(); toast("须先填写资产登录页地址"); markBad("ddUrl", true); return; }
      if (!/^https?:\/\//i.test(String(d2.url).trim())) { window.__dlgStep = 1; adjustContractBack(); toast("「资产登录页地址」须为 https:// 开头（存量 http 按例外登记）"); markBad("ddUrl", true); return; }
      var rec2 = String(d2.recogn || "").indexOf("自定义") === 0;
      /* ★ R61·轮8：两枚必填选择器须**逐项**给出字段级错误态并点名 —— 原实现只给一句笼统 toast，
         与同函数上方 ddUrl 的 markBad 先例（:631 / :632）不一致，用户不知该改哪一格。 */
      if (rec2 && (!d2.userSel || !d2.pwdSel)) {
        window.__dlgStep = 1; adjustContractBack();
        if (!d2.userSel) markBad("ddUserSel", true);
        if (!d2.pwdSel) markBad("ddPwdSel", true);
        toast("自定义识别模式须填写" + (!d2.userSel && !d2.pwdSel ? "账号 / 密码字段选择器" : (d2.userSel ? "密码字段选择器" : "账号字段选择器")));
        return;
      }
      adaptStashD();                        /* 校验通过 → 草稿提交到资产 */
      delete ADAPT_D_TMP[adaptKey()];
      if (typeof adaptSyncAuContract === "function") adaptSyncAuContract();
      if (typeof saveDemoState === "function") saveDemoState();
      closeDlg();
      renderAdaptPage();
      toast("表单契约已保存（演示）");
    };
  }
  /* ★ 登录形态切换须**直接绑定**：弹窗挂在 body 级（#dlg1），change 事件冒泡到不了
     #pg-detail 的委托层 —— 此前切「两步」弹窗内纹丝不动的根因（委托层分支永远收不到）。
     切换后先 adaptStashD() 收值，再重开弹窗以展开 / 收起第二步组。 */
  var kd = document.getElementById("ddKind");
  if (kd) kd.onchange = function () { adaptStashD(true); adaptContractDlg(); };
  /* 表单识别规则切换同样重开弹窗 —— 决定选择器组展开 / 收起（自动模式可留空）。 */
  var rd = document.getElementById("ddRecogn");
  if (rd) rd.onchange = function () { adaptStashD(true); adaptContractDlg(); };
  /* 步骤条 / 下一步·上一步：切换前先收值（非当前步字段虽在 DOM，但值以本次编辑为准）。 */
  document.querySelectorAll("#dlg1Body .dlg-steps [data-dstep]").forEach(function (el) {
    el.onclick = function () {
      adaptStashD(true);
      window.__dlgStep = parseInt(el.getAttribute("data-dstep"), 10);
      adaptContractDlg();
    };
  });
  return true;
}

/* N 档（不传导）**不出参数区** —— 2026-09-30 用户裁定：不传导时不该显示一张满是文字的卡片。
   处置见 renderDetAdapt：m === "N" 时直接返回，只留「恢复默认 / 保存并下发」。
   「不传导是什么」由分段控件下方的 help 承担（一句话），不在正文复述。 */
function renderDetAdapt(){
  /* ★ 2026-09-30（第五轮）：双宿主 —— #detAdaptForm（参数子节）与 #adaptBarHost（提交栏）
     都住在「用户身份」卡内（adaptUserBlock 产出）。本函数只填内容、不建卡。
     原版把参数与提交栏各拼一张独立 .card，顶层碎成「用户身份卡 / 参数卡 / 裸提交卡」三张平级卡。
     N 档：参数区置空（卡与档位条仍在、可随时切档），提交栏保留。
     ⚠ 不再回退 #detAdaptBody —— 该回退曾把整页覆盖成单卡（N 档踩过）；
       宿主找不到说明页面骨架未建，直接 return 即可。 */
  var host = document.getElementById("detAdaptForm");
  var bar = document.getElementById("adaptBarHost");
  if (!host || !bar) return;
  var m = adaptMode();
  var cbar = authCanEdit("det")
    ? '<div class="card-b cbar">' +
        '<button class="btn" type="button" data-auth="adaptReset">恢复默认</button>' +
        '<button class="btn primary" type="button" data-auth="adaptSave">保存并下发</button></div>'
    : '<div class="card-b"><div class="mini">🔒 当前角色 <b>' + esc(authRole()) +
      "</b> 对「身份适配」无编辑权（编辑权＝系统管理员）—— 可查看、不可改。</div></div>";
  if (m === "N") { host.innerHTML = ""; bar.innerHTML = cbar; authApplyRo(host, "det"); return; }
  var form = (m === "A") ? adaptFormA() : (m === "B") ? adaptFormB() : (m === "C") ? adaptFormC() : adaptFormD();
  host.innerHTML = '<div class="card-b">' + form + "</div>";
  bar.innerHTML = cbar;
  authApplyRo(host, "det");
}

/* —— 以下段落属「身份适配」，与上方切除段无依赖 —— */

function adaptRefAssets(){ return (typeof ASSETS !== "undefined" && ASSETS) ? ASSETS : []; }
function adaptCurAid(){
  /* ★ 2026-09-30（第十六轮 · 全量评审修复）：**资产绑定** —— 原实现只认 window._adaptAid，
     失效时回落到常量 CUR（"a1"），并把结果**写回** window._adaptAid；而 goPage 是
     location.href 整页跳转（本文件 47–51），_adaptAid 不持久化、跨页必丢 —— 于是
     renderAdaptPage 首行调用本函数就把 _adaptAid 钉成 "a1"，而 adaptAsset() 的
     _adaptAid 优先级又高于 _detailAid，结果：从资产列表打开**任意**资产的 t6，
     看到的与保存的都是 a1 的配置（该页签对非 a1 资产完全失效）。
     修法：回落链补 _detailAid（唯一被持久化的「当前详情资产」，见 saveDemoState 的
     detailAid 字段）；写回**保留**，但必须写回**解析后**的正确 id —— 原实现往高优先级
     槽位写回常量 CUR，那才是污染源。
     ⚠ _adaptAid 是既有契约：全仓 15 个门禁脚本用它定位「当前适配资产」，页面内多次
       重渲染也靠它保持稳定 —— 修 bug 不等于砸掉契约。 */
  var list = adaptRefAssets();
  var has = function (x) { return !!x && list.some(function (a) { return a.id === x; }); };
  var id = has(window._adaptAid) ? window._adaptAid
    : has(window._detailAid) ? window._detailAid
    : ((list[0] && list[0].id) || (typeof CUR !== "undefined" ? CUR : ""));
  window._adaptAid = id;
  return id;
}
function adaptAssetSel(){
  var cur = adaptCurAid();
  return '<select id="adaptAssetSel" data-adapt-asset="1" style="width:340px">' +
    adaptRefAssets().map(function(a){
      return '<option value="' + esc(a.id) + '"' + (a.id === cur ? " selected" : "") + ">" + esc(a.name) + "（" + esc(a.id) + "）</option>";
    }).join("") + "</select>";
}

/* —— 以下段落属「身份适配」，与上方切除段无依赖 —— */
/* 用户身份档位卡（A~D）：★ 不再显示任何全局统计 ——
   单资产配置面上出现「启用资产 12 个」会被读成本资产数据（语义越权）。
   改为呈现「适用条件 / 代价」，这才是选档时真正需要的信息。 */
var USER_MODE_FACTS = {
  /* ★ 2026-09-30（第十六轮 · 全量评审）：need 原写「须先作信任声明（前置）」，
     而 adaptTierNote 渲染时已加「<b>前置</b>：」前缀 —— 页面实际呈现
     「前置：须先作信任声明（前置）」，同词重复两次。去掉行内的「（前置）」。 */
  A: { need: "须先作信任声明", cost: "业务侧不需改造，注入请求头 / 参数", tag: "推荐" },
  B: { need: "业务侧须实现 userinfo 回调", cost: "身份由业务侧主动换取，时效可控", tag: "推荐" },
  C: { need: "业务侧须支持 OIDC / SAML / CAS", cost: "标准协议联合身份，改造量最大", tag: "推荐" },
  D: { need: "须先配本页签的表单契约", cost: "托管口令代填，受资产登录页实现约束", tag: "最弱环" }
};
function adaptModeCards(){
  /* ★ 2026-09-30：四张 356px 大卡 → 一行紧凑档位条。
     理由：四档卡底边实测 785px，**越过首屏 762px**，客户打开页签看不全主操作；
     而卡片里「前置 / 形态」两行长文属解释性内容，按页面「能删就删」原则应退出首屏。
     保留：档名 + 强弱标记（选档时唯一需当场比较的信息）。
     让位：前置条件 / 形态代价 —— 改为选中档后在下方一行说明（adaptTierNote）。 */
  var cur = adaptMode();
  /* ★ 2026-09-30（用户裁定）：档位条**并入 N 档** —— 由「先问是否传导、再问哪档」的两级结构，
     改为**一行五档平铺**（不传导 / A / B / C / D）。
     理由：N（不传导）本就是「传导形态」的一个取值，把它单拎出来当上一级问题，
     客户要走两步、且两级控件的选中态互相牵制（改上面一级会让下面一级的选中失效）。
     档序沿用 SSO_MODE_DEF 自然序 N→A→B→C→D：N 在最左（出厂默认），编号档随后。
     强度信息由每档自带徽标承担（N 中性灰、A/B/C 强、D 弱），不靠排序表达。 */
  /* ⚠ 数据源必须是 ADAPT_MODES 而非 SSO_MODE_DEF —— 后者只有 A/B/C/D、**不含 N**
     （N 是「身份适配」页签特有的档位，定义在 ADAPT_MODES 里）。
     首版误用 SSO_MODE_DEF，filter 恒不命中 N，五档只剩四档（2026-09-30 实测踩到）。
     ADAPT_MODES 的定义顺序本就是 N→A→B→C→D，故直接沿用其序、无需再排。 */
  var order = ADAPT_MODES;
  return order.map(function(m){
    var on = cur === m.k;
    var isN = (m.k === "N");
    var strong = isN ? "默认" : (m.k === "D" ? "弱" : "强");
    var scls = isN ? "t-gray" : (m.k === "D" ? "t-warn" : "t-ok");
    /* N 档的档名较长（不注入（仅平台鉴权）），档位条里用短名「不传导」。 */
    var nm = isN ? "不传导" : m.name;
    return '<button type="button" class="' + (on ? "on" : "") + (isN ? " tb-n-default" : "") +
        '" data-adapt-mode="' + esc(m.k) + '"' +
        (on ? ' aria-pressed="true"' : ' aria-pressed="false"') +
        ' title="' + esc(m.name) + '">' +
      '<span class="tb-k">' + esc(isN ? "—" : m.k) + "</span>" +
      '<span class="tb-n">' + esc(nm) + "</span>" +
      '<span class="tag ' + scls + ' tb-s">' + strong + "</span>" +
      "</button>";
  }).join("");
}
/* 选中档的一行说明（原四档卡里的「前置 / 形态」两行，移到这里，只显示当前档）。
   ★ 2026-09-30：N 档并入档位条后，其说明也走本函数（此前 N 不在 USER_MODE_FACTS 里、直接返回空）。 */
function adaptTierNote(){
  var m = adaptMode();
  var draftN = ADAPT_MODE_TMP[adaptKey()] || null;
  var savedN = (adaptSt() && adaptSt().mode) || null;
  var dirtyN = draftN && draftN !== savedN;
  if (m === "N") {
    /* ★ N 档无参数子节头（chips 只挂 A~D 档），「未保存的切换」提示在本行补 ——
       否则切到 N 后页面上没有任何「未保存」标记，档位高亮看着像已生效。 */
    return '<div class="mini" style="margin-top:10px;padding:8px 10px;background:var(--bg2);border-radius:6px;line-height:1.7">' +
      "<b>当前档位</b>　<b>不传导</b>：只做平台自身鉴权，<b>不改写上游请求、不附加身份字段</b>（出厂默认）。" +
      (dirtyN ? '　<span style="color:var(--warn)">（未保存 —— 点「保存并下发」后生效）</span>' : "") +
      "</div>";
  }
  var f = USER_MODE_FACTS[m] || null;
  if (!f) return "";
  return '<div class="mini" style="margin-top:10px;padding:8px 10px;background:var(--bg2);border-radius:6px;line-height:1.7">' +
    "<b>当前档位</b>　" +
    "<b>前置</b>：" + esc(f.need) + "　·　<b>形态</b>：" + esc(f.cost) +
    "</div>";
}
/* 机器身份配置块（网关 → 上游 · 连接级机器凭据）。
   ★ 2026-09-30 用户裁定：**由 t4 移入 t6**。理由：t6 页面标题是「平台向上游出示什么身份」，
     机器身份与用户身份是同一问题的两面 —— 此前机器身份的**配置面**在 t4，t6 只留一行跳转指引，
     同一件事被劈成两页；客户看 t6 时无法就地改机器身份。移入后 t6 为该问题的唯一配置面。
   资产键沿用 a._inj / a._injCred —— 与 t4 / 编辑向导同源，故不存在两份状态。 */
function upInjBlock(){
  var a = adaptAsset(); if (!a) return "";
  upCfgEnsure(a);
  var s = upCfgDft(a);
  /* ★ 2026-09-30（第七轮）：机器身份草稿化 —— 草稿（UP_INJ_DRAFT）优先于已存值，
     整页重渲染（如信任声明勾选触发）后草稿选择不再丢失。 */
  var dr = UP_INJ_DRAFT[adaptKey()] || {};
  var inj = (dr.inj != null) ? dr.inj : s.inj;
  var credSel = (dr.cred != null && dr.cred !== "") ? dr.cred : s.cred;
  var injCred = (inj === "cred");
  var non = upScopeInfo(a).non;
  var radios = ["none", "cred"].map(function (v) {
    var on = (inj === v);
    return '<label class="' + (on ? "on" : "") + '">' +
      '<input type="radio" name="adInj" value="' + v + '"' + (on ? " checked" : "") + ">" +
      (v === "none" ? "不注入" : "注入网关托管凭据") + "</label>";
  }).join("");
  /* ★ 2026-09-30（第十六轮 · 全量评审修复）：凭据下拉**兜底** ——
     a._injCred 指向已停用 / 已删除的凭据时（UP_CREDS 只列「启用」态），
     原实现没有任何 option 命中 → 浏览器显示第一项，而「保存并下发」仍把旧 id 落库
     —— 「看到的」与「保存的」不是一个凭据。 */
  var credList = UP_CREDS();
  if (credSel && !credList.some(function (c) { return c[0] === credSel; })) credSel = (credList[0] || [])[0] || "";
  var credOpts = credList.map(function (c) {
    return '<option value="' + esc(c[0]) + '"' + (credSel === c[0] ? " selected" : "") + ">" +
      esc(c[1]) + "（" + esc(c[2]) + "）</option>";
  }).join("");
  /* ★ 2026-09-30（第五轮）：单卡化 + 与用户身份卡同构。
     原结构「体卡 + 独立裸提交卡」两张平级卡；行结构原用 .kv（130px 标签列）。
     现与用户身份卡对齐：rowlab 行标签 → .rmode 独占行 → .fldrow 凭据行 → 提交栏为卡内末行。
     （.fldrow 原规则 scoped .up-cfg，本卡不在 .up-cfg 内而失配 → display:block，
       proto.css 第 8 段已给出无 scope 版本。） */
  return '<div class="card"><div class="card-h">' +
      '<h3>机器身份<span class="sub">连接级 · 对所有访问者恒定</span></h3>' +
      '<div class="toolbar"><button class="btn sm" type="button" data-auth="adaptGotoCredHost">凭据在「网关凭据托管」→</button></div>' +
    "</div>" +
    '<div class="card-b">' +
      /* ★ 2026-09-30（用户裁定）：删行标签「上游认证注入」与「二选一 · 点击选用」——
         前者与卡标题「机器身份 · 网关 → 上游」语义重复，后者对两枚胶囊单选是废话。 */
      (non === 0 ? '<div style="margin-bottom:6px"><span class="tag t-warn" title="本资产全部在网路径均为 public —— 按「public 永不注入」硬规则，本区块当前不生效；若确需注入，请先在「资产细粒度访问策略」中取消 public。">当前不生效</span></div>' : "") +
      '<span class="rmode" id="adInjMode">' + radios + "</span>" +
      '<div id="adCredRow" class="fldrow" style="display:' + (injCred ? "" : "none") + ';margin-top:8px"><label>托管凭据</label><div>' +
        '<select id="adCredSel">' + credOpts + "</select>" +
        '<div class="help">网关到上游的<b>机器对接凭据</b>（Basic / API-Key / OAuth2 Client），由平台维护，见 <a href="#" class="hl" style="text-decoration:none" onclick="goCred(\'c1\');return false">网关凭据托管</a>。</div>' +
        '<div id="adCredFlow" class="help" style="margin-top:6px"></div>' +
      "</div></div>" +
    "</div>" +
    (authCanEdit("det")
      ? '<div class="card-b cbar">' +
          '<button class="btn" type="button" data-auth="adaptInjReset">恢复默认</button>' +
          '<button class="btn primary" type="button" data-auth="adaptInjSave">保存并下发</button></div>'
      : '<div class="card-b"><div class="mini">🔒 当前角色 <b>' + esc(authRole()) +
        "</b> 对「身份适配」无编辑权 —— 可查看、不可改。</div></div>") +
    "</div>";
}

/* 机器身份块的事件绑定（渲染后调用；不用委托，因本块由 t6 每次重绘重建）。 */
function upInjBind(){
  var a = adaptAsset(); if (!a) return;
  /* ★ 2026-09-30：控件回退为 .rmode 单选后，事件绑定同步回退为 <label> 点击
     （点 label 触发其内 radio 的隐式选中，故读 input.value 取档位）。 */
  /* ★ 2026-09-30（第七轮）：点击 / 选择只写 UP_INJ_DRAFT，不写 a._inj、不 saveDemoState。
     此前点单选即落盘但 toast 说「（未保存）」—— 文案与行为相反；
     「保存并下发」读 upCfgDft（即已被点击污染的 a._inj），按钮形同虚设。 */
  var k = adaptKey();
  var im = document.getElementById("adInjMode");
  if (im) im.querySelectorAll("label").forEach(function (l) {
    l.addEventListener("click", function () {
      var v = l.querySelector("input").value;
      im.querySelectorAll("label").forEach(function (x) {
        x.classList.remove("on"); var xi = x.querySelector("input"); if (xi) xi.checked = false;
      });
      l.classList.add("on"); l.querySelector("input").checked = true;
      UP_INJ_DRAFT[k] = UP_INJ_DRAFT[k] || {};
      UP_INJ_DRAFT[k].inj = v;
      var cr = document.getElementById("adCredRow"); if (cr) cr.style.display = (v === "cred") ? "" : "none";
      toast("机器身份已切换：" + (v === "none" ? "不注入" : "注入网关托管凭据") + "（未保存）");
    });
  });
  var cred = document.getElementById("adCredSel");
  if (cred) cred.onchange = function () {
    UP_INJ_DRAFT[k] = UP_INJ_DRAFT[k] || {};
    UP_INJ_DRAFT[k].cred = cred.value;
    var f = document.getElementById("adCredFlow"); if (f) f.innerHTML = upCredFlow(cred.value);
    toast("托管凭据已选择（未保存）");
  };
  var cf = document.getElementById("adCredFlow");
  if (cf) {
    var dr2 = UP_INJ_DRAFT[k] || {}, s0 = upCfgDft(a);
    cf.innerHTML = upCredFlow((dr2.cred != null && dr2.cred !== "") ? dr2.cred : s0.cred);
  }
}
/* 机器身份（网关 → 上游连接级机器凭据）· t6 页面入口。
   ★ 2026-09-30 用户裁定：**由 t4 移入本页**。此前配置面在「上游透传与校验」（原「注入网关
   托管凭据」），t6 只留一行跳转指引 —— 同一件事被劈成两页，客户在 t6 看不到、也改不了机器身份。
   移入后配置面唯一：t6 的「机器身份」块（写 a._inj / a._injCred）。 */
function adaptMachineHint(){
  return upInjBlock();
}

/* —— 以下段落属「身份适配」，与上方切除段无依赖 —— */
/* ★ 2026-09-30（用户裁定）：接入信息交付**按档位切换** ——
   此前只交付 B 档（key ＋ userinfo）一组地址，A/C/D/N 档无内容可交；
   而「给资产侧开发者什么」正是本页存在的理由，各档交付物完全不同，须逐档呈现。
   · N 不注入 —— 无接口交付（不注入任何身份字段）；
   · A token 注入 —— 注入位置/字段名 + JWT 内容形态 + OIDC 标准验签端点（发现文档 / jwks_uri）；
   · B key ＋ userinfo —— userinfo 直连/网关代理地址 + key 字段 + 换取约定；
   · C 协议级 SSO —— 协议 + 对外发布的元数据（IdP metadata / 发现文档）+ 唯一主标识映射；
   · D 账号密码代填 —— 无接口交付（浏览器层代填）+ 需资产侧配合项。
   ⚠ 端点一律按开放协议标准的固定发现约定给出（RFC 8615 well-known / SAML metadata），不写内部自定路径。
   卡片与「复制 / 导出」共用本函数返回的数据，避免两处口径漂移。 */
function adaptDeliverInfo(){
  var m = adaptMode();
  var NM = ((ADAPT_MODES.filter(function (x) { return x.k === m; })[0]) || {}).name || m;
  var reach = "资产<b>服务端</b>能否直连平台取决于其网络位置与网络策略；资产的<b>网页前端只能访问网关</b>。";
  var rows = [], text = "";
  if (m === "A") {
    var apos = adaptF("A", "pos", "请求头（默认）");
    var afld = adaptF("A", "field", "Authorization");
    rows = [
      ["注入位置", esc(apos)],
      ["令牌字段名", '<code class="kr">' + esc(afld) + "</code>"],
      ["令牌形态", "平台<b>重签的短时 JWT</b> —— OIDC 标准 claim（sub / name / email…），audience 限定本资产、短时效、单向派生"],
      ["内容解析", "payload 为 Base64URL <b>编码</b>（编码 ≠ 加密），标准 JWT 库直接读取，<b>无需解密端点</b>"],
      ["验签公钥", '发现文档 <code class="kr">GET https://&lt;平台&gt;/.well-known/openid-configuration</code>；公钥集（jwks_uri）<code class="kr">GET https://&lt;平台&gt;/.well-known/jwks.json</code>'],
      ["在线校验（可选）", "需即时感知登出 / 吊销时叠加 <b>RFC 7662 自省端点</b>（<code class=\"kr\">POST</code>，地址随发现文档的 <code class=\"kr\">introspection_endpoint</code> 暴露）；不透明 token 只能走此路"],
      ["对接结论", reach]
    ];
    /* ★ 2026-09-30（第十七轮 · 全量评审）：未声明信任时交付卡**标失效** ——
       信任声明是 A 档前置（未声明不可保存、参数控件禁用），而交付卡此前不读该状态，
       照样把全部接入信息列给资产侧，配置与交付两边结论不一致。 */
    if (!adaptTrust()) rows.unshift(["生效状态",
      "<b>本档未声明信任</b> —— 参数不可保存，以下接入信息尚未生效（前置条件未满足）"]);
    text = "档位 A（token 注入）：注入位置 " + apos + "，令牌字段名 " + afld + "；内容为平台重签的短时 JWT（OIDC 标准 claim：sub / name / email 等）；"
      + "payload 为 Base64URL 编码（非加密），标准 JWT 库直接解析，无需解密端点；"
      + "验签公钥：发现文档 https://<平台>/.well-known/openid-configuration、公钥集 https://<平台>/.well-known/jwks.json；"
      + "如需即时感知登出 / 吊销，叠加 RFC 7662 自省端点（POST，地址随发现文档的 introspection_endpoint 暴露）。资产服务端能否直连平台取决于网络位置与网络策略；资产的网页前端只能访问网关。";
  } else if (m === "B") {
    rows = [
      ["userinfo 直连地址", '<code class="kr">https://&lt;平台&gt;/api/v1/sso/userinfo</code>（GET · 资产服务端可访问平台服务时用，适配服务端发起的换取）'],
      ["网关代理地址", '<code class="kr">https://{无端网关}/_baize/sso/userinfo</code>（GET · 资产无法访问平台时用；前端发起的换取走此地址）'],
      ["key 字段", '<code class="kr">X-SSO-Key</code>（回调 userinfo 时经请求头传递，URL 与访问日志不含 key）'],
      ["换取约定", "资产在换取入口拿 key → 调 userinfo 换用户信息 → 建自身会话 → 跳转首页；key 单次消费、短时有效"],
      ["来源登记", "资产侧换取请求的来源 <b>IP / 域名须先向平台登记</b>（本页「来源限制」），白名单外一律拒绝并告警"],
      ["对接结论", reach]
    ];
    text = "档位 B（key ＋ userinfo）：userinfo 地址 https://<平台>/api/v1/sso/userinfo（资产服务端可访问平台服务时用）；https://{无端网关}/_baize/sso/userinfo（资产无法访问平台时用）；资产的网页前端只能访问网关；key 字段 X-SSO-Key（经请求头传递）。";
  } else if (m === "C") {
    /* ★ 2026-09-30（第十五轮 · 用户裁定）：交付内容**按协议** ——
       §5.2 表给出三协议各自的平台职责与资产侧要求；FR-3.1 直接点名交付物：
       「CAS 服务地址、SAML 元数据、OIDC client 凭据」。
       此前只按「SAML / 非 SAML」二分，选 CAS 会输出 OIDC 发现文档（协议与交付物不符）。 */
    var proto2 = adaptProto();
    var P2 = CD_PROTO_DEF[proto2] || CD_PROTO_DEF["OIDC"];
    /* ★ 2026-09-30（用户裁定）：主标识由协议规范封装，交付卡直接陈述**协议标准标识**。 */
    var idRow = "<b>" + esc(P2.idName) + "</b>（" + esc(P2.idField) + "）";
    var cReach = "协议握手在<b>浏览器层</b>完成（无端＝用户浏览器、有端＝SDK 内置浏览器），不依赖端侧 SDK 注入能力。" + reach;
    /* ★ 2026-09-30（第十六轮 · 全量评审）：交付内容随「元数据发布」开关**联动** ——
       此前 cdMeta 可设为「否」，交付卡却**无条件**写「对外发布发现文档 / IdP metadata」，
       同一页两处结论相反；管理员按交付卡给资产方，资产方却拿不到那个文档。 */
    var metaOn = String(adaptF("C", "meta", "是")).indexOf("是") === 0;
    if (proto2.indexOf("SAML") === 0) {
      rows = [
        ["对接协议", "SAML 2.0（平台作 <b>IdP</b>）"],
        ["元数据交付", metaOn
          ? "对外发布 <b>IdP metadata</b>：EntityID / SSO 端点（HTTP-Redirect 与 HTTP-POST 两种 binding）/ 签名证书"
          : "<b>已关闭元数据发布</b> —— 资产 SP 无法自动导入，须离线交换 EntityID / SSO 端点 / 签名证书"],
        ["对外主标识", idRow],
        ["NameID 格式", esc(adaptF("C", "nameFmt", "未指定 unspecified（默认）")) + "　—— 须与资产 SP 的 <b>NameIDPolicy</b> 一致，不一致资产侧会拒绝登录"],
        ["资产侧动作", "导入 IdP metadata；与平台交换双方 <b>EntityID</b> 与 ACS 地址，完成断言握手联调"],
        ["对接结论", cReach]
      ];
      text = "档位 C（协议级 SSO）：协议 SAML 2.0，平台作 IdP；交付 IdP metadata（EntityID / SSO 端点 / 签名证书）；"
        + "对外主标识：" + P2.idName + "（" + P2.idField + "）；"
        + "资产侧导入 metadata 并交换双方 EntityID 与 ACS 地址；协议握手在浏览器层完成。";
    } else if (proto2.indexOf("CAS") === 0) {
      /* ★ 2026-09-30（调研订正 · CAS Protocol 2.0 §2.5 / 3.0）：票据校验端点随协议版本 ——
         2.0 的 /serviceValidate 只回用户名（cas:user），3.0 的 /p3/serviceValidate 才回属性。 */
      var casVer = adaptF("C", "casVer", "CAS 3.0（默认）");
      var casV3 = casVer.indexOf("3.0") > 0;
      var casEP = casV3 ? "/p3/serviceValidate" : "/serviceValidate";
      rows = [
        ["对接协议", "CAS（平台作 <b>IdP</b>）· " + esc(casVer)],
        ["服务地址", '资产 CAS 客户端指向 <code class="kr">https://&lt;平台&gt;/cas</code>：<code class="kr">/login</code>（登录）· <code class="kr">/logout</code>（登出）· <code class="kr">' + casEP + '</code>（票据校验）—— 按 CAS 协议约定的服务路径'],
        ["属性返回", casV3
          ? "票据校验<b>返回用户属性</b>（工号 / 邮箱等可用于身份映射）"
          : "<b>仅返回用户名</b>（cas:user），不含属性 —— 需向资产传递工号 / 邮箱时须改用 <b>CAS 3.0</b>"],
        ["对外主标识", idRow],
        ["资产侧动作", "资产侧 CAS 客户端指向平台服务地址、向平台<b>登记 service 回调地址</b>，完成票据回校验联调（政企存量系统常见）"],
        ["票据与安全", "票据为随机会话标识、<b>不做签名</b>；真实性由 <b>HTTPS 通道 + 资产侧回平台校验</b>保证；本协议无标准元数据文档"],
        ["对接结论", cReach]
      ];
      text = "档位 C（协议级 SSO）：协议 CAS（" + casVer + "），平台作 IdP；交付 CAS 服务地址 https://<平台>/cas（含 /login、/logout、" + casEP + "）；"
        + (casV3 ? "票据校验返回用户属性；" : "票据校验仅返回用户名，需属性时须用 CAS 3.0；")
        + "对外主标识：" + P2.idName + "（" + P2.idField + "）；"
        + "资产侧 CAS 客户端指向平台服务地址并完成票据回校验；票据不做签名，靠 HTTPS 与回校验保证真实性；协议握手在浏览器层完成。";
    } else {
      rows = [
        ["对接协议", "OIDC（平台作 <b>IdP</b>）"],
        ["发现文档", metaOn
          ? '对外发布 <code class="kr">https://&lt;平台&gt;/.well-known/openid-configuration</code>（含授权 / 令牌 / 用户信息端点，公钥集 <code class="kr">jwks_uri</code>）'
          : '<b>已关闭元数据发布</b> —— RP 无法自动发现端点，须离线提供授权 / 令牌 / 用户信息端点与 <code class="kr">jwks_uri</code>'],
        ["client 凭据", "<b>client_id / client_secret</b> —— 平台自动生成，随接入配置一并交付"],
        ["对外主标识", idRow],
        ["资产侧动作", "按发现文档配置 RP（client_id / client_secret / redirect_uri <b>须报平台登记</b>），完成授权码握手联调"],
        ["对接结论", cReach]
      ];
      text = "档位 C（协议级 SSO）：协议 OIDC，平台作 IdP；交付 client 凭据（client_id / client_secret）与发现文档 https://<平台>/.well-known/openid-configuration（含 jwks_uri）；"
        + "对外主标识：" + P2.idName + "（" + P2.idField + "）；"
        + "资产侧按发现文档配置 RP（client_id / client_secret / redirect_uri）；协议握手在浏览器层完成。";
    }
    /* ★ 2026-09-30（第十七轮 · 全量评审）：交付卡补 **SLO 行** ——
       配置区有「单点登出 启用 / 关闭」（cdSlo），而交付卡此前不含任何 SLO 信息，
       配置与交付脱节；资产侧可能按交付卡断言「无单点登出」。 */
    var sloOn = String(adaptF("C", "slo", "启用")).indexOf("启用") === 0;
    rows.splice(Math.max(rows.length - 1, 0), 0, ["单点登出（SLO）", sloOn
      ? "启用 —— 登出白泽时按协议向资产发起单点登出；依赖资产侧实现完整度，<b>尽力而为并记录</b>"
      : "<b>关闭</b> —— 不做单点登出，资产侧会话保留至其自身超时"]);
  } else if (m === "D") {
    rows = [
      ["交付对象", "<b>无接口交付</b> —— 代填在浏览器层完成，资产侧不接收身份字段、无需开发对接"],
      ["需资产侧配合", "登记时声明信任平台凭据；提供登录页地址与表单契约（选择器未命中即停止代填）"],
      ["凭据保管", "本页只配<b>表单契约</b>、不落任何凭据；凭据托管策略见下方「代填凭据」卡"],
      ["对接结论", "代填受资产登录页结构约束，页面改版会导致失效，须重新配置契约并测试"]
    ];
    text = "档位 D（账号密码代填）：无接口交付——代填在浏览器层完成，资产侧无需开发对接；需资产侧配合（声明信任平台凭据、提供登录页地址与表单契约）；登录凭据由平台凭据托管加密保管（SM4）、入审计、可独立吊销；页面改版会导致代填失效，须重新配置契约并测试。";
  } else {
    rows = [
      ["交付对象", "<b>无接口交付</b> —— 本档不向资产注入任何身份字段，仅由平台完成访问鉴权"],
      ["需资产侧配合", "接受平台网络侧鉴权；资产自身可无认证体系"],
      ["后续如需识别用户", "切换 A（token 注入）／B（key ＋ userinfo）／C（协议级 SSO）档"]
    ];
    text = "档位 N（不注入 · 仅平台鉴权）：无接口交付——不向资产注入任何身份字段，仅由平台完成访问鉴权；资产自身可无认证体系；后续如需识别用户，切换 A / B / C 档。";
  }
  return { mode: m, name: NM, rows: rows, text: text };
}
function adaptDeliverCard(){
  var info = adaptDeliverInfo();
  return '<div class="card"><div class="card-h"><h3>接入信息交付<span class="sub">交付给资产侧开发者</span></h3>' +
    '<div class="toolbar"><button class="btn" type="button" data-auth="authCopy2">复制接入信息</button>' +
    '<button class="btn" type="button" data-auth="authExportInfo">导出接入信息</button></div></div>' +
    '<div class="card-b">' +
    '<div class="note" style="margin:0 0 10px">本资产当前档位 <b>' + esc(info.mode) + " · " + esc(info.name) +
      "</b>；下列信息随<b>档位切换</b>变化。地址中的 <code class=\"kr\">&lt;平台&gt;</code> 与 "
      + '<code class="kr">{无端网关}</code> 为占位符，按实际部署域名替换。</div>' +
    info.rows.map(function (r) {
      return '<div class="kv" style="grid-template-columns:150px 1fr;margin-bottom:6px"><span class="k">' + r[0] + '</span><span class="mini">' + r[1] + "</span></div>";
    }).join("") +
    "</div></div>";
}

function adaptVaultCard(){
  /* ★ 2026-09-30（第十六轮 · 全量评审）：**删三条全局统计** ——
     「代填凭据 N 条 / 高危资产代填 / 90 天必要性复核」取自全局 SS.vault，
     摆在**单个资产**的配置面上会被读成本资产数据（语义越权）——
     与本页 11728 已确立的口径同源：「单资产配置面不出现全局统计」。
     本卡退回其唯一职责：把 D 档代填与凭据托管接起来。 */
  /* ★ 2026-09-30（第十七轮 · 全量评审修复）：副题原写「由『网关凭据托管』统一承载」，
     而本卡按钮（authGotoCred）实际跳转 **pg-auusercred（用户代填账号托管）** ——
     副题与跳转目标指向两个不同页面（「网关凭据托管」是机器身份卡的 pg-cred）。
     本卡讲的是**代填凭据**（谁在哪个资产用什么账号），归属用户代填账号托管。 */
  return '<div class="card"><div class="card-h"><h3>代填凭据<span class="sub">由「用户代填账号托管」统一承载</span></h3>' +
    '<div class="toolbar"><button class="btn" type="button" data-auth="authGotoCred">前往凭据托管 →</button></div></div>' +
    '<div class="card-b">' +
    '<div class="mini">本页只配<b>表单契约</b>；代填所用的账号口令由凭据托管加密保管、入审计、可独立吊销，此处不落任何凭据。</div>' +
    "</div></div>";
}
/* 次要信息折叠区：把「接入信息交付 / 凭据托管联动」两张只读卡收进 <details>。
   理由：这两块对本资产「配什么」无直接帮助，恒常展开会**把主配置区挤到屏外**；
   客户演示时打开必看，但不应抢占首屏。 */
function adaptMoreInfo(){
  return '<details class="card" style="overflow:hidden">' +
    '<summary style="cursor:pointer;list-style:none;padding:14px 18px;display:flex;align-items:center;gap:8px">' +
      '<span style="font-size:15px;font-weight:500">配套信息</span>' +
      '<span class="sub" style="font-size:12.5px;color:var(--txt3)">接入信息交付 · 凭据托管联动</span>' +
      '<span style="margin-left:auto;font-size:12.5px;color:var(--txt3)">点击展开</span>' +
    "</summary>" +
    '<div id="adaptInfoBody" style="padding:0 0 2px">' + adaptDeliverCard() + adaptVaultCard() + "</div>" +
    "</details>";
}
/* ★ 2026-09-30（用户裁定）：原「生命周期与缺口」卡**删除** ——
   其内容是**账号供给**（认证源 → 同步与供给）的开通状态，不是本资产「身份适配」的可配置项，
   对管理员在本页的决策无帮助（「边界」一栏属平台自身能力声明，更不属本页口径）。 */

/* —— 以下段落属「身份适配」，与上方切除段无依赖 —— */
/* 身份适配页签（资产详情 t6）· 页级渲染
   ★ 2026-09-30：由「独立页」改为「资产详情页签」。
     · 资产已由所在详情页确定（window._detailAid），故**不再需要资产引用选择器**；
     · 代填契约（D 档）随资产走 —— 这正是本页签存在的关键理由。 */
function renderAdaptPage(){
  var el = document.getElementById("detAdaptBody"); if (!el) return;
  adaptCurAid();
  var a = (typeof adaptAsset === "function") ? adaptAsset() : null;
  var nm = a ? a.name : "（未选择资产）";
  /* ★ 2026-09-30（第五轮）：顶层 = 导语 + 用户身份卡 + 机器身份卡 + 折叠配套。
     一张卡 = 一个业务块 = 一次提交；参数区与提交栏都是卡内子区（不再各成一张卡）。
     导语两要点的顺序改为与正文一致（用户身份在前 —— 它是主操作）。
     删 MARK_USER_HOST 占位 + outerHTML 替换机制：adaptUserBlock 直接拼进 innerHTML。 */
  el.innerHTML =
    /* ★ 2026-09-30（第十六轮 · 全量评审）：导语收成一句 ——
       两条 lead-pt 与下方两张卡的卡头（用户身份 / 机器身份）逐字重复，
       「方向不同、互不影响」属解释性修辞（机制说明，非可感知结果），一并去。 */
    '<div class="lead-bar">' +
      '<p class="lead-line">本页签配置 <b>平台向「' + esc(nm) + '」发出的请求里带什么身份</b>：用户身份（用户 → 资产）与机器身份（平台 → 上游）两块。</p>' +
      '<p class="lead-note">连接安全（TLS / 信任锚 / mTLS）与请求头治理在「<b>代理与上游</b>」页签。</p>' +
    "</div>" +
    /* ① 用户身份卡：档位条 + 参数子区 + 提交栏同卡（宿主由 adaptUserBlock 产出） */
    adaptUserBlock() +
    /* ② 机器身份卡：行选择 + 凭据 + 提交栏同卡（与用户身份卡同构） */
    adaptMachineHint() +
    /* ③ 次要信息：接入信息交付 / 凭据托管联动（默认收起，避免占屏挤压主配置区） */
    adaptMoreInfo();
  renderDetAdapt();
  /* 机器身份块的事件绑定（本块每次重绘重建，故用直接绑定而非委托） */
  if (typeof upInjBind === "function") upInjBind();
}

function adaptUserBlock(){
  /* 用户身份卡：档位选择 + 参数子区 + 提交栏**同卡**（第五轮合并）。
     #detAdaptForm / #adaptBarHost 由 renderDetAdapt() 填充。
     ⚠ 两个宿主必须**无条件产出**：renderDetAdapt 找不到会直接 return，
       参数区将永远空白（旧版回退 #detAdaptBody 会覆盖整页，该回退已删）。 */
  return '<div class="card"><div class="card-h">' +
      '<h3>用户身份<span class="sub">代用户访问时带什么身份</span></h3>' +
      '<div class="toolbar"><button class="btn sm" type="button" data-auth="adaptGotoCred">凭据在「用户代填账号托管」→</button></div></div>' +
    '<div class="card-b">' +
      '<div class="rowlab"><span class="t">传导形态</span></div>' +
      '<div class="tier-bar" role="group" aria-label="传导形态档位">' + adaptModeCards() + "</div>" +
      adaptTierNote() +
    "</div>" +
    '<div id="detAdaptForm"></div>' +
    '<div id="adaptBarHost"></div>' +
    "</div>";
}

/* 兼容旧调用名 */
function renderAdapt(){ renderAdaptPage(); }

/* ==========================================================================
   多页化 bootstrap：恢复持久化数据 → 按当前页渲染
   （替代原单文件的末尾初始化；深链 ?pg=... / #cred 也在此统一处理）
   ========================================================================== */
