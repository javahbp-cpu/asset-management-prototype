/* ==========================================================================
   认证模块 · 6 页（2026-09-29 新增）
   --------------------------------------------------------------------------
   页面与对象（一页一对象，不设总览 / 工作台）：
     auth-dict.html         认证方式字典      pg-audict
     auth-source.html       认证源            pg-ausrc
     cred-hosting.html      网关凭据托管      pg-cred　← 既有页，从「安全设置」组归入本模块
     auth-user-cred.html    用户代填账号托管  pg-auusercred
     auth-issue.html        签发凭据管理      pg-auissue
     auth-authenticator.html 强认证器绑定管理 pg-auauthr

   ★★ 六条硬约束（写代码前先读）：
     ① 主线两级「认证源 → 认证方式」，字典是**旁挂的取值域**（不在主线上）。
        字典统一的是**名字**，不是效力；同一方式在不同源下级别可不同。
     ② 认证策略**不单独成页** —— 已由资产访问策略（ABAC）的 auth.* 三键承载。
        ⚠ 不建「认证策略 / 登录方式」页。
     ③ 「强度级别 + 适用范围」是（源 × 方式）**联合判定**结果，落在**认证源**页。
     ④ 凭据按持有 / 签发方**拆三个页**：网关托管 / 用户代填 / 平台签发，各自独立不合并。
     ⑤ 「认证源 → 认证方式」一对多；每条「源 × 方式」记录带**「无端支持」标签**（**适用性声明** —— 无端接入的判定与执行由**无端网关**承载，本源不承担其执行；2026-10-12 裁定）。
     ⑥ 认证器绑定是**用户 ∖ 认证器**独立台账，不挂字典也不挂源。

   ★ 抗钓鱼是认证方式的内生属性（＝凭据在协议层是否绑定源），**与级别无关** ——
     级别由「源 × 方式」联合判定（见 ①③），不存在「某级别才可置位」的约束。
   ★ 被认证源或访问策略引用（**含已停用 / 已下线对象**）的方式**不可删除**（任一引用链存在即阻断，不区分启用 / 停用）。
   ★ 页面不出现任何租户信息。
   ========================================================================== */

/* ---------- 0. 演示数据 ---------- */
var AU_KEY = "baize.assetmgmt.auth.v1";
var AU = null;
/* ★ 2026-10-10（R24）：RP ID = WebAuthn 的**平台统一作用域**（Relying Party ID）。同一平台下所有
   认证器共用同一个 RP 域名，随平台部署域名确定 —— 不逐条登记。此前「登记认证器」把它做成逐记录
   手填，同平台的不同记录可填成不同域名，而 passkey 只在登记时的 RP 域名下可用 ⇒ 台账会记出
   互相不可用的凭据。现收为模块级常量：弹窗只读展示、落库一律取此常量（见 auAuthrNormalize）。 */
var AU_RP_ID = "baize.example.com";

/* 认证方式字典真源（AU_LEVELS / AU_METHODS）已上移至文件顶部「属性字典」之前 ——
   它是**全平台唯一的「方式名 + 固有属性」取值域**，必须早于引用它的各页渲染函数声明。
   此处不再重复定义，避免出现第二份自造列表。
   ⚠ 自 2026-09-30 起，本字典**不再派生**任何「档位 → 方式集合」视图 —— 级别不归字典，
     实际级别由「认证源 × 认证方式」记录联合判定；字典上的 defLv 仅为**参考默认级别**。 */
/* 认证源：每条记录含「该源支持的方式集合」，每项带 级别 / 适用范围 / 无端支持 标签 */

/* ============================================================================
 * 认证源「连接参数」的真源（结构化字段）
 * ----------------------------------------------------------------------------
 * 「连接参数」区呈现的是**可填参数**（参数名 + 当前值 + 控件），不是散文摘要 ——
 * 参数值就是运营要填进对接配置的东西；说明性文字一律不进本表（收进「关键业务说明」）。
 * 字段模板按 kind 一套；新建源用模板取空值，已建源用 auConnSeed() 带初值。
 * 控件类型：text（默认）/ password（加密存储、界面不回显明文、留空表示不修改）/
 *           select（枚举）/ check（布尔）。
 * ==========================================================================*/
/* ★ 2026-10-10（R25）：认证源「适用范围」的**受控取值域** —— 取资产台账 `ASSETS[].grp`
   （资产分组）为域。此前该列是逐（源 × 方式）**自由文本框**，种子值「办公类资产 /
   外部协作类资产 / 信贷核心系统」与台账取值域无一对应，且资产侧并无该字段
   承载面 ⇒ 一个「联合判定的结果」列却无受控来源，无法作为策略生效范围的可靠输入。
   ★ R55（上下文-1）：改为**由台账派生** + 显式通配项 —— 原为硬编码六项，其中「全部资产」
   并不在 `ASSETS[].grp` 取值域内，与「同名同义」的声明相矛盾。 */
var AU_SCOPE_ALL = "全部资产";
function AU_SCOPE_OPTS() {
  /* ★ R56（A-8）：改为**调用时现算** —— 原为顶层 IIFE，在脚本解析期执行，早于
     `loadDemoState()` 把持久化台账灌回 ⇒ 用户改过资产分组后，刷新拿到的候选域仍是**种子**
     分组集（跨会话不一致）。同族已由 R53 修过（`ID_ASSET_DEF()` 改调用时现算）。 */
  var g = [];
  try {
    if (typeof ASSETS !== "undefined" && ASSETS && ASSETS.length) {
      ASSETS.forEach(function (a) { if (a && a.grp && g.indexOf(a.grp) < 0) g.push(a.grp); });
    }
  } catch (e) { /* 资产段未就绪：回落演示值 */ }
  if (!g.length) g = ["核心业务", "办公协同", "数据平台", "开发测试", "对外服务"];
  return [AU_SCOPE_ALL].concat(g);
}

var AU_CONN_FIELDS = {
  /* 本地账号体系：无外部连接 —— 本表是**账号与口令策略**，不做连通性测试 */
  local: [
    { k: "pwdMin",  label: "口令最小长度（位）", req: true, ph: "如 12", type: "number", min: 6, max: 64 },
    { k: "pwdCplx", label: "复杂度要求", req: true, type: "select",
      /* ★ 2026-10-10（R16）：本字段的 hint 声明「等保要求口令至少由三类组成」，选项集却含
         「大写 + 数字」「小写 + 数字」「仅数字」三个**低于基线**的取值 ⇒ 页面自相矛盾、
         且平台自身的本地账号口令策略不应可选到基线以下。收敛为不低于三类的三项。 */
      opts: ["大写 + 小写 + 数字 + 符号", "大写 + 小写 + 数字", "大写 + 小写 + 符号"],
      ph: "如 大写 + 小写 + 数字 + 符号", hint: "等保要求口令至少由大写 / 小写 / 数字 / 符号中三类组成" },
    { k: "pwdDays", label: "强制轮换周期（天）", req: true, ph: "如 90", type: "number", min: 1, max: 365 },
    { k: "pwdHist", label: "历史口令不可复用（次）", ph: "如 5", type: "number", min: 0, max: 24 },
    { k: "lockN",   label: "连续失败锁定阈值（次）", req: true, ph: "如 5", type: "number", min: 1, max: 20 },
    { k: "lockMin", label: "锁定时长（分钟）", req: true, ph: "如 30", type: "number", min: 1, max: 1440 },
    /* ★ 2026-10-10（R25）：下列两项改为**平台统一只读**（`ro`）。它们是平台实现层的
       固定值，不是可逐源调的业务策略：同一账号库不可能一半 bcrypt 一半 Argon2id；
       解锁方式为全局策略（手册 §4.3.1：需管理员手动解锁）。值恒取模板常量 `v0`，
       不受种子 / 快照 / 迁移覆盖。 */
    { k: "lockHow", label: "锁定解除方式", ro: true, v0: "管理员解锁 / 到期自动解除" },
    { k: "hash",    label: "凭据存储算法", ro: true, v0: "bcrypt（cost 12）" }
  ],
  /* AD / LDAP：对接一个外部目录 */
  ldap: [
    { k: "addr",    label: "目录地址", req: true, url: "ldap", ph: "ldaps://host.domain" },
    { k: "port",    label: "端口", req: true, ph: "如 636", type: "number", min: 1, max: 65535 },
    { k: "base",    label: "Base DN", req: true, ph: "DC=corp,DC=internal" },
    { k: "bind",    label: "Bind DN", req: true, ph: "CN=svc,OU=Service,DC=corp,DC=internal" },
    { k: "pwd",     label: "Bind 口令", type: "password" },
    { k: "enc",     label: "传输加密", type: "select", opts: ["TLS 强制（关闭 start_tls）", "start_tls 升级"] },
    { k: "verify",  label: "证书校验", type: "check", forced: true, hint: "校验服务端证书链（安全基线，强制开启）" },
    { k: "trust",   label: "信任库", ph: "如 平台内置 CA", hint: "信任锚：校验证书链时使用的 CA 信任库（与「证书校验」分工：本项定信任锚，开关定是否校验）" },
    { k: "poolMin", label: "连接池下限", ph: "如 2", type: "number", min: 0, max: 1000 },
    { k: "poolMax", label: "连接池上限", ph: "如 20", type: "number", min: 1, max: 2000 },
    { k: "idle",    label: "空闲回收（秒）", ph: "如 300", type: "number", min: 1, max: 86400 },
    { k: "qto",     label: "单次查询超时（秒）", ph: "如 5", type: "number", min: 1, max: 3600 },
    { k: "fo",      label: "故障转移", type: "check", hint: "主备自动切换：主节点不可用时按「主 → 备」顺序重试，切换事件入审计" },
    /* ★ 2026-10-10（R20）：**备用节点**录入位 —— 此前本模板只有 `fo` 开关，
       「主备自动切换」勾上后**没有任何地方填备节点**（历史上一度有 `port2`，因「收集后零引用」
       被当死字段删除，`fo` 就此变成**孤儿开关**）⇒ 系统无从得知备节点是谁。
       现**成套恢复「备用目录地址 + 备用端口」并让它们真被消费**：
         ① `connSave` 随 `fo` 校验 / 落库（勾选则必填且不得与主地址相同；未勾选则清空）；
         ② 详情页同表回显；
         ③ 连通性测试叙述里列出「主 → 备」两端。
       `dep: "fo"` 见 `auConnForm` 条件显隐 / `auConnDep`。 */
    { k: "foAddr",  label: "备用目录地址", dep: "fo", url: "ldap", ph: "ldaps://host2.domain" },
    { k: "foPort",  label: "备用端口", dep: "fo", ph: "如 636", type: "number", min: 1, max: 65535 }
  ],
  /* OIDC 外部 IdP：平台作 RP，走授权码流 */
  oidc: [
    { k: "issuer",  label: "Issuer", req: true, url: "https", ph: "https://idp.example.com/realms/x" },
    { k: "cid",     label: "Client ID", req: true, ph: "如 baize-sp" },
    { k: "pwd",     label: "Client Secret", type: "password" },
    { k: "cb",      label: "回调地址", req: true, url: "https", ph: "https://portal.example.com/_baize/sso/oidc/callback" },
    { k: "scope",   label: "Scope", ph: "如 openid profile email" },
    { k: "disc",    label: "发现文档", type: "check", def: true, hint: "自动拉取发现文档并从其中取 JWKS 地址" },
    { k: "alg",     label: "签名算法", type: "select",
      opts: ["RS256", "ES256", "PS256", "SM2（国密）"], ph: "如 RS256" },
    { k: "jwks",    label: "JWKS 缓存（小时）", ph: "如 12", type: "number", min: 1, max: 168 },
    /* ★ 2026-10-10（R21）：**反义条件字段** —— 关闭「发现文档」后 RP 无法自动发现
       `jwks_uri`，而 `verify`（ID Token 验签）**强制开启**、必须有验签公钥 ⇒ 此时 JWKS 地址
       须**手工提供**。此前本模板只有「缓存小时数」、**没有地址录入位**，`disc` 一旦关闭
       就出现与 R20 `fo` 完全同型的**能力-输入不闭合**。
       `depOff: "disc"` ⇒ 仅在「发现文档」**未勾选**时显示且必填；勾选时地址由发现文档取得、
       手填值清空（见 `connSave`）。 */
    { k: "jwksUri", label: "JWKS 地址", depOff: "disc", url: "https", ph: "https://idp.example.com/realms/x/protocol/openid-connect/certs" },
    { k: "verify",  label: "ID Token 验签", type: "check", forced: true, hint: "强制验签并校验 iss / aud / exp / nonce（安全基线，强制开启）" },
    { k: "slo",     label: "单点登出", type: "check", hint: "IdP 侧登出通知回本平台" }
  ],
  /* CA / 证书体系 */
  ca: [
    { k: "root",     label: "信任根", req: true, ph: "如 CFCA 机构根证书" },
    { k: "rootExp",  label: "根证书有效期至", ph: "如 2029-06-30", date: true },
    { k: "suite",    label: "证书体系", ph: "如 TLCP 双证书（签名 + 加密）" },
    { k: "chainChk", label: "证书校验", type: "check", forced: true, hint: "校验链完整性与吊销状态（安全基线，强制开启）" },
    { k: "crl",      label: "CRL 拉取周期（小时）", req: true, ph: "如 12", type: "number", min: 1, max: 168 },
    { k: "strict",   label: "CRL 拉取失败策略", type: "check", hint: "拉取失败时拒绝新会话并告警" },
    /* ★ R61：能力开关须配套录入位 —— 有「CRL 拉取周期」却无分发点、有「OCSP 兜底」却无响应者地址，
       拉取 / 查询无目标可达（与同页「备用目录地址」「JWKS 地址」同型缺陷）。 */
    { k: "crlDp",    label: "CRL 分发点地址", url: "http", ph: "http://ca.example.com/crl/root.crl" },
    { k: "ocsp",     label: "OCSP 兜底", type: "check", hint: "CRL 不可用时启用 OCSP 查询" },
    { k: "ocspUri",  label: "OCSP 响应者地址", url: "http", dep: "ocsp", ph: "http://ocsp.example.com" },
    { k: "subjMap",  label: "主体映射来源", ph: "如 证书 CN / UID" }
  ]
};

/* 按 kind 取字段模板并复制一份（避免各源共享同一对象） */
function auConnFields(kind) {
  return (AU_CONN_FIELDS[kind] || AU_CONN_FIELDS.local).map(function (f) {
    var o = {};
    for (var p in f) { if (Object.prototype.hasOwnProperty.call(f, p)) { o[p] = f[p]; } }
    if (f.ro) { o.v = f.v0 || ""; }   /* ★ 平台统一只读：值恒取模板常量 */
    else if (f.type === "check") { o.v = !!(f.forced || f.def); }
    else if (f.type === "select") { o.v = (f.opts || [""])[0]; }
    else { o.v = ""; }
    return o;
  });
}

/* 建一个带初值的 conn（vals 为 {字段键: 值}；pwdSet 表示口令/密钥是否已设置） */
function auConnSeed(kind, vals, pwdSet, lastTest) {
  var fs = auConnFields(kind);
  if (vals) {
    fs.forEach(function (f) {
      if (f.ro) return;   /* ★ 平台统一只读项不受种子 vals 覆盖 */
      if (Object.prototype.hasOwnProperty.call(vals, f.k)) { f.v = vals[f.k]; }
    });
  }
  return { kind: kind, fields: fs, pwdSet: !!pwdSet, lastTest: lastTest || "" };
}

/* 旧版本地存储的 conn 形状升级（{kind, rows:[散文]} → {kind, fields:[参数]}）。
   无 fields ⇒ 按 kind 取模板并把旧行按**标签**搬到同名参数；
   有 fields ⇒ 按模板补齐缺失键（模板日后加字段，旧快照也能跟上），既有值原样保留。 */
function auMigrateConn(c, seeded) {
  if (!c) return c;
  if (c.fields && c.fields.length) {
    var tmpl0 = auConnFields(c.kind), have0 = {};
    c.fields.forEach(function (f) { have0[f.k] = 1; });
    tmpl0.forEach(function (f) { if (!have0[f.k]) { c.fields.push(f); } });
    /* ★ 2026-10-10（R25）：**平台统一只读项就地归一** —— 旧快照里它们是可编辑的
       select（值可逐源不同），不归一则影子值长期驻留。 */
    c.fields.forEach(function (f) {
      var t0 = tmpl0.filter(function (x) { return x.k === f.k; })[0];
      if (t0 && t0.ro) { f.ro = true; f.v = t0.v; delete f.opts; delete f.type; delete f.ph; }
    });
    return c;
  }
  /* 旧 rows 是散文（多个事实挤一行），拆不回结构化参数 —— 硬搬只会把说明文字
     塞进参数值里。有同 id 的新鲜种子就直接采用它的干净值，只保留 pwdSet / lastTest。 */
  if (seeded && seeded.fields) {
    var sc = JSON.parse(JSON.stringify(seeded));
    sc.pwdSet = !!c.pwdSet;
    sc.lastTest = c.lastTest || "";
    return sc;
  }
  var tmpl = auConnFields(c.kind), oldVals = {};
  (c.rows || []).forEach(function (r) {
    if (r && r[0] != null) { oldVals[String(r[0])] = String(r[1] == null ? "" : r[1]).replace(/<[^>]*>/g, "").trim(); }
  });
  tmpl.forEach(function (f) {
    if (f.type === "check") return;
    var v = oldVals[f.label];
    if (v != null && v !== "") { f.v = v; }
  });
  return { kind: c.kind, fields: tmpl, pwdSet: !!c.pwdSet, lastTest: c.lastTest || "" };
}

/* 「连接参数 / 账号与口令策略」的页内参数表：参数名 + 控件 + 现值 */
/* ★ 2026-10-10（R20）：条件字段显隐 —— 由父开关（`dep` 指向的 check 字段）决定。
   渲染期初值由 `auConnForm` 按当前值给出（与本函数同判据），本处只管**交互切换**。 */
function auConnDep(cb) {
  if (!cb || !cb.id) return;
  var key = cb.id.slice(4), on = !!cb.checked;
  /* ★ 2026-10-10（R23）：**chip 底色随勾选同步** —— 连接参数表的开关是 `<label class="chip">`
     套原生复选框，`.chip.on` **只由 class 驱动**（`.chip.on{background:var(--primary)}`），
     样式表**没有** `:has(input:checked)` 兜底 ⇒ 运行时点击只改复选框、**底色停在渲染时那一档**
     （实测：`auc_fo` 由勾选改为未勾选后 `class` 仍是 `chip on`）。父开关与普通开关一律同步。 */
  var lb = cb.closest && cb.closest("label.chip");
  if (lb) { lb.classList.toggle("on", on); }
  var root = (cb.closest && cb.closest(".kv")) || document;
  var nodes = root.querySelectorAll('[data-dep="' + key + '"]');
  for (var i = 0; i < nodes.length; i++) { nodes[i].style.display = on ? "" : "none"; }
  /* 反义条件字段：父开关**关闭**时显示（如「发现文档」关闭 ⇒ 手工填 JWKS 地址）。 */
  var offs = root.querySelectorAll('[data-depoff="' + key + '"]');
  for (var j = 0; j < offs.length; j++) { offs[j].style.display = on ? "none" : ""; }
}
function auConnForm(conn) {
  var _cfs = conn.fields || [];
  /* 当前值表 + 被依赖的开关集合 —— 条件字段（dep）据此定**初值显隐**并给父开关挂 onchange。 */
  var _fv = {}; _cfs.forEach(function (f0) { _fv[f0.k] = f0.v; });
  /* ★ 2026-10-10（R23）：原 `_depKeys`（登记哪些开关有依赖项、**仅**给它们挂 `onchange`）已删除 ——
     普通开关（`verify` / `slo` / `strict` / `ocsp` …）同样需要芯片底色随勾选同步，
     故 `auConnForm` 的**所有**开关一律挂 `auConnDep`（见下 `_foHook`）。 */
  function _depAttr(f) {
    /* `dep`：父开关**开启**时显示；`depOff`：父开关**关闭**时显示（反义条件字段）。 */
    if (f.dep) return ' data-dep="' + f.dep + '"' + (_fv[f.dep] ? "" : ' style="display:none"');
    if (f.depOff) return ' data-depoff="' + f.depOff + '"' + (_fv[f.depOff] ? ' style="display:none"' : "");
    return "";
  }
  return '<div class="kv conn-kv" style="grid-template-columns:170px 1fr 170px 1fr">' +
    _cfs.map(function (f) {
      var id = "auc_" + f.k, ctl;
      var _dep = _depAttr(f);
      /* ★ 2026-10-10（R25）：**平台统一只读项**（锁定解除方式 / 凭据存储算法）——
         值由平台统一设定，界面只读展示（不渲染任何控件、不产生可提交值）。
         返回**两格**：label + 值（标签内置）—— `.kv` 是 grid，多一格会让后续项错位。 */
      if (f.ro) {
        return '<span class="k"' + _dep + ">" + esc(f.label) + "</span>" +
          '<span class="ro-v">' + esc(f.v == null ? "" : f.v) + ' <span class="tag t-gray">平台统一</span></span>';
      }
      if (f.type === "check") {
        /* forced：安全基线项（ID Token 验签 / 证书链校验）—— 强制开启**且不可关闭**。
           此前这类项 hint 里写着「强制」，控件却是可取消勾选的普通开关，文案与控件自相矛盾。 */
        var _foHook = ' onchange="auConnDep(this)"';
        ctl = '<label class="chip' + (f.v ? " on" : "") + '" style="justify-self:start' + (f.forced ? ";opacity:.85" : "") + '"' + _dep + '>' +
          '<input type="checkbox" id="' + id + '"' + (f.v ? " checked" : "") + (f.forced ? " disabled" : "") + _foHook + ">" + esc(f.hint || f.label) +
          (f.forced ? ' <span class="tag t-info">强制</span>' : "") + "</label>";
        return '<span class="k"' + _dep + ">" + esc(f.label) + "</span>" + ctl;
      }
      /* ★ 2026-10-10（R14）：页内 `.kv` 表单的必填此前只有视觉星标（`<span class="req">*</span>`），
         无障碍树上并非必填 —— R13 的 aria-required 补齐写在 openDlg 里、只扫 `#dlg1Body .fld`，
         本表是**页内表单**、不经弹窗 ⇒ 整张表漏网。此处对 `f.req` 的控件直接补 required / aria-required。 */
      var _rq = f.req ? ' required aria-required="true"' : "";
      if (f.type === "select") {
        /* 选项集是**受控取值域**，但既有取值必须可精确复现（R8「holder 可复现不变量」）—— 枚举收口后
           旧快照里的值可能不在新选项集内，直接丢弃会让浏览器静默选中首项、保存时把旧值「看不见地」改写。 */
        var _opts = (f.opts || []).slice();
        if (f.v != null && f.v !== "" && _opts.indexOf(f.v) < 0) _opts.push(f.v);
        ctl = '<select id="' + id + '"' + _rq + _dep + ">" + _opts.map(function (o) {
          return "<option" + (o === f.v ? " selected" : "") + ">" + esc(o) + "</option>";
        }).join("") + "</select>";
      } else if (f.type === "password") {
        /* 口令类字段不挂 _rq：星标会与「编辑态留空＝不修改」的语义打架；其必填由 connSave
           按「首配 / 非首配」两态判定并给出明确提示（口径不变）。 */
        ctl = '<input type="password" id="' + id + '"' + _dep + ' placeholder="' +
          esc((conn.pwdSet ? "已设置 · 留空表示不修改" : "首次配置须填写") + "（加密存储）") + '">';
      } else if (f.type === "number") {
        /* ★ 2026-10-10（R13）：数值语义字段（口令长度 / 轮换周期 / 锁定阈值…）此前一律 text，
           可落库任意串（如 "abc"）⇒ 取值域不闭合。改 number + min/max（浏览器侧约束，落库侧见 connSave）。 */
        ctl = '<input type="number" id="' + id + '" value="' + esc(String(f.v == null ? "" : f.v)) +
          '"' + (f.min != null ? ' min="' + f.min + '"' : "") + (f.max != null ? ' max="' + f.max + '"' : "") +
          _dep + _rq + ' placeholder="' + esc(f.ph || "") + '">';
      } else {
        ctl = '<input type="text" id="' + id + '" value="' + esc(String(f.v == null ? "" : f.v)) +
          '"' + _dep + _rq + ' placeholder="' + esc(f.ph || "") + '">';
      }
      /* ★ 2026-10-10（R12）：可见标签改用 <label for> 绑定控件 —— 此前是 <span class="k">，
         口令策略 / 锁定策略 / 散列算法 / 会话超时等 12 个控件在无障碍树上都没有名字
         （复选框行不受影响：其控件本身被 <label class="chip"> 包住，已有可访问名）。 */
      return '<label class="k" for="' + id + '"' + _dep + ">" + esc(f.label) + (f.req ? ' <span class="req">*</span>' : "") + "</label>" + ctl;
    }).join("") + "</div>";
}

/* ★ 2026-10-10（R25）：适用范围多选 chips —— 列表列（只读展示）、行内编辑弹窗、添加弹窗三处共用。
   取值域 = `AU_SCOPE_OPTS`；历史快照里的旧值若不在域内则**补入**，保证可复现（R8 不变量）。 */
function auScopeChips(name, cur) {
  var sel = String(cur || "").split(/[、,，/]/).map(function (s) { return s.trim(); }).filter(Boolean);
  var opts = AU_SCOPE_OPTS().slice();
  sel.forEach(function (v) { if (opts.indexOf(v) < 0) opts.push(v); });
  return '<span class="chips" data-scope-box="' + esc(name) + '">' + opts.map(function (o) {
    return '<label class="chip' + (sel.indexOf(o) >= 0 ? " on" : "") + '"><input type="checkbox" value="' +
      esc(o) + '"' + (sel.indexOf(o) >= 0 ? " checked" : "") + ' onchange="auScopeSync(this)">' + esc(o) + "</label>";
  }).join("") + "</span>";
}
function auScopeSync(cb) {
  var lb = cb && cb.closest && cb.closest("label.chip");
  if (lb) lb.classList.toggle("on", !!cb.checked);
}
function auScopeRead(box) {
  if (!box) return "";
  var ins = box.querySelectorAll("input:checked"), out = [];
  for (var i = 0; i < ins.length; i++) out.push(ins[i].value);
  return out.join("、");
}
/* 行内编辑入口：弹窗式多选（列表列窄，放不下 chips） */
function auScopeDlg(cur, onOk) {
  openDlg("设置适用范围",
    "取值范围取自<b>资产台账的「资产组」</b> —— 该列是（源 × 方式）联合判定的结果，取值域不自行输入。",
    '<div class="fld"><label>适用范围 <span class="req">*</span></label>' + auScopeChips("dlgScope", cur) + "</div>");
  $("#dlg1Ok").onclick = function () {
    var v = auScopeRead(document.querySelector('[data-scope-box="dlgScope"]'));
    if (!v) { toast("请至少选择一项适用范围：它是本源 × 本方式联合判定的结果列之一"); return; }
    closeDlg(); onOk(v);
  };
}
function auSeed() {
  return {
    schema: "au-6",   /* R53（存-6）：AU.issue 种子补 is_13（待生效衔接份）⇒ 必须升版 */
    dict: {
      methods: JSON.parse(JSON.stringify(AU_METHODS)),
      levels: JSON.parse(JSON.stringify(AU_LEVELS))
    },
    sources: [
      { id: "src_local", name: "本地账号", type: "本地账号体系", st: "已启用", order: 1, tag: "LOCAL",
        desc: "平台自带账号体系，口令策略与锁定机制由平台管控",
        conn: auConnSeed("local", {
          pwdMin: "12", pwdCplx: "大写 + 小写 + 数字 + 符号", pwdDays: "90", pwdHist: "5",
          lockN: "5", lockMin: "30"
        }, true, ""),
        sync: { mode: "—", note: "本地账号由平台自管，<b>不涉及外部同步</b>。" },
        ways: [
          { mid: "pwd", lv: 2, scope: "办公协同", anon: true },
          { mid: "otp", lv: 2, scope: "核心业务、数据平台", anon: false }
        ] },
      { id: "src_ad", name: "AD 域", type: "AD / LDAP", st: "已启用", order: 2, tag: "AD",
        desc: "组织与用户定时同步；口令校验交 LDAP bind",
        conn: auConnSeed("ldap", {
          addr: "ldaps://ad.baize.internal", port: "636",
          base: "DC=baize,DC=internal", bind: "CN=svc_baize,OU=Service,DC=baize,DC=internal",
          enc: "TLS 强制（关闭 start_tls）", verify: true, trust: "平台内置 CA",
          poolMin: "2", poolMax: "20", idle: "300", qto: "5", fo: true,
          foAddr: "ldaps://ad-dc2.baize.internal", foPort: "636"
        }, true, "2026-09-29 09:14 · 连通 往返 42ms"),
        sync: { mode: "定时同步（增量）", note: "每 <b>30 分钟</b>增量拉取；同步范围＝指定 OU 子树。仅管理来源为 <b>AD</b> 的账号，<b>不覆盖内部手工账号</b>；属性冲突时<b>告警而非覆盖</b>。", map: [["账号名", "sAMAccountName"], ["姓名", "displayName"], ["部门", "department"], ["邮箱", "mail"]] },
        ways: [
          { mid: "pwd", lv: 2, scope: "办公协同", anon: false },
          { mid: "fp", lv: 4, scope: "全部资产", anon: false }
        ] },
      { id: "src_oidc", name: "外部 IdP（OIDC）", type: "OIDC 外部 IdP", st: "已启用", order: 3, tag: "OIDC",
        desc: "平台作 RP，走授权码流；用户信息按需映射",
        conn: auConnSeed("oidc", {
          issuer: "https://idp.partner.com/realms/baize", cid: "baize-sp",
          cb: "https://portal.baize.internal/_baize/sso/oidc/callback", scope: "openid profile email",
          disc: true, alg: "RS256", jwks: "12", verify: true, slo: true
        }, true, "2026-09-29 09:14 · 连通 往返 42ms"),
        sync: { mode: "登录时按需映射", note: "不在平台侧建全量账号副本；<b>首次登录时</b>按 sub 建立映射并落账号，此后仅更新时间戳。", map: [["账号名", "preferred_username"], ["姓名", "name"], ["部门", ""], ["邮箱", "email"]] },
        ways: [
          { mid: "pwd", lv: 1, scope: "对外服务", anon: false },
          { mid: "sms", lv: 2, scope: "对外服务", anon: true }
        ] },
      { id: "src_ca", name: "国密 CA 认证", type: "CA / 证书体系", st: "已停用", order: 4, tag: "CA",
        desc: "基于数字证书的强身份认证，供高敏感资产",
        conn: auConnSeed("ca", {
          root: "CFCA 机构根证书", rootExp: "2029-06-30", suite: "TLCP 双证书（签名 + 加密）",
          chainChk: true, crl: "12", strict: true, ocsp: false, subjMap: "证书 CN / UID"
        }, true, ""),
        sync: { mode: "定时同步（CRL）", note: "账号不批量同步；仅按证书主体<b>按需建立映射</b>。吊销状态以 CRL 为准，<b>拉取失败即告警</b>。", map: [["账号名", "UID"], ["姓名", "CN"], ["部门", ""], ["邮箱", ""]] },
        ways: [
          { mid: "usbkey", lv: 4, scope: "核心业务", anon: false }
        ] }
    ],
    /* ★ 2026-10-09：原 `gw: { creds, cas, mtls }` 种子**整块删除**。
       它是已撤除的重复页 `pg-augwcred` 的数据源（撤除见 `_patchlog/_proto_v_drop_gwcred.py`）；
       页③（`pg-cred`）的活台账是模块级常量 `CRED_LIST` / `CA_LIST` / `MTLS_LIST`，两者内容
       完全不同 —— 即页面上凭空多出「两套网关凭据、两套 mTLS 证书」。其中 `gw.creds` / `gw.mtls`
       **从不被读**（纯死登记），`gw.cas` 仅被 `auGwCas()` 读，该函数已改读模块级常量 `GW_SIGN_CAS`。
       保留本注释，以免后来者再从历史备份里「恢复」这套影子数据。 */
    uc: {
      items: [
        {
          id: "uc_01", asset: "运维堡垒机 Web 控制台", assetId: "a20", mode: "用户自管", owner: "张伟", acct: "zhangwei",
          st: "已托管", upd: "2026-08-11", fill: "自动（字段特征库）",
          /* ★ 2026-10-10（R27 · C-4）：本记录**不再自持契约副本** —— 登录契约的唯一真源是
             资产侧「身份适配 → D 档」（`ASSETS[]._adapt.d`，本页由 ucLoginOf 现读）。
             此处 `login` 只承载**测试留痕**（tested / fail），是记录级状态、不属契约。 */
          login: { tested: "2026-08-11" }
        },
        {
          id: "uc_02", asset: "报表导出网关", assetId: "a10", mode: "管理员托管", owner: "组织资产", acct: "rpt_svc",
          st: "已托管", upd: "2026-07-22", fill: "自动（字段特征库）",
          login: { tested: "2026-07-22" }
        },
        {
          id: "uc_03", asset: "报表中心", assetId: "a4", mode: "用户自管", owner: "李俊", acct: "lijun",
          st: "代填失败", upd: "2026-09-02", fill: "自定义选择器",
          login: { tested: "2026-09-02", fail: "表单已改版（#loginBtn 未命中）→ 回退手动登录" }
        }
      ],
      cfg: {
        scope: "两者", form: "自动（字段特征库）",
        captcha: "人工输入", bind: "一对一", fail: "提示手动登录",
        defaultKind: "单步（账号+密码同页）", defaultSubmit: "自动提交"
      }
    },
    /* ⚠ holder 的规范形式＝`"客户端实例 · " + 软件名 + " @ " + 终端名`（`@` **两侧各一空格**）
       —— 签发弹窗按此拼装、cnOf 按此反查；少一个空格即让**查重与 cn 反查同时失效**
       （2026-10-10 R8 实测：种子少空格 ⇒ 同主体同类型可重复签发）。 */
    /* 「绑定主体标识」(cn) = 持有主体所属**客户端实例的序列号 cidseq**（口径见 cnOf）。
       ⚠ 智能体实例的宿主是**该智能体软件的客户端实例**（身份台账 ai_01.host = ci_004
         ⇒ ci_004.cidseq = BZAI-0007-3A2C），不是同终端上的 PC 客户端实例（ci_001）。 */
    issue: [
      { id: "is_01", kind: "客户端 License 证书", holder: "客户端实例 · 白泽客户端（PC） @ 科技管理部-张伟-PC", no: "LC-2026-000701", issued: "2026-03-14", exp: "2027-03-13", st: "有效", ca: "白泽内网 CA", cn: "BZPC-0007-3A2C", fp: "PC7F3A2C91E004B7", scope: "信贷核心系统 / 客户管理平台" },
      { id: "is_02", kind: "客户端 License 证书", holder: "客户端实例 · 白泽客户端（PC） @ 信贷管理部-王芳-PC", no: "LC-2026-001201", issued: "2026-04-02", exp: "2027-04-01", st: "有效", ca: "白泽内网 CA", cn: "BZPC-0012-1D8E", fp: "PC1D8E44A0F22C93", scope: "信贷核心系统 / 客户管理平台 / 报表分析平台" },
      { id: "is_03", kind: "客户端 License 证书", holder: "客户端实例 · 客户集成 OA 插件 @ 综合管理部-周琴-PC", no: "LC-2026-005101", issued: "2026-01-11", exp: "2027-01-10", st: "已吊销", ca: "外购 CA（CFCA）", cn: "CSOA-0021-5C0F", fp: "PC5C0F93D2B661A4", scope: "办公自动化平台" },
      /* ★ 2026-10-10（R9）：原只有一条 is_04（09-29 签发、已过期），而身份台账 ai_01.cred 记的是
         此刻持有的那份（09-30 09:05–09:35）⇒ **本页台账未覆盖主体的当前持有状态**，两模块对
         「该主体现在拿的是哪份」各说一套（短时凭据每次续发编号本就不同，编号差异本身合法）。
         按「按续发周期逐条留痕」补当前份 is_05：台账自此覆盖当前份与历史份，同一时刻只有一条生效。 */
      { id: "is_05", kind: "智能体短时凭据", holder: "智能体实例 · 代码助手 Agent @ 科技管理部-张伟-PC（进程 4821）", no: "AT-3A2C-7F19", issued: "2026-09-30 09:05", exp: "2026-09-30 09:35", st: "有效", cn: "BZAI-0007-3A2C", fp: "PC7F3A2C91E004B7", scope: "代码库 / 需求库", ttl: 30 },
      { id: "is_04", kind: "智能体短时凭据", holder: "智能体实例 · 代码助手 Agent @ 科技管理部-张伟-PC（进程 4821）", no: "AT-3A2C-4821", issued: "2026-09-29 09:12", exp: "2026-09-29 09:42", st: "已过期", cn: "BZAI-0007-3A2C", fp: "PC7F3A2C91E004B7", scope: "代码库 / 需求库", ttl: 30 },
      /* ★ 2026-10-10（跨模块同源轮 X1）：身份侧 6 个客户端实例 lic「当前」份 + 4 个智能体实例 cred
         共 10 份已签发凭据，本台账此前只登记 5 份 ⇒ 从身份侧点过来查不到、「台账覆盖主体当前
         持有状态」只对 ai_01 成立。补齐 6 份：is_06/07/08 ↔ ci_003/ci_004/ci_006 的当前 License，
         is_09/10/11 ↔ ai_02/ai_03/ai_04 的当前短时凭据（编号 / 签发 / 到期逐项与身份侧同源）。
         ★ R53（存-6 取舍）**订正**：原实现把 ci_001 的 lic_001b（LC-2027-000702，生效日
         2027-03-14）排除在台账之外，理由是「未来签发 ⇒ 尚未签发」。该理由不成立 —— 该份**已签发**，
         身份侧对「当前 / 待生效」均出「吊销」按钮，排除它会使两侧对同一编号一有一无，且违背 X1
         已确立的「台账覆盖身份侧全部已签发凭据」口径。改为**入表 + 标「待生效」**（is_13），
         与身份侧阶段轴一一对应。 */
      { id: "is_06", kind: "客户端 License 证书", holder: "客户端实例 · 白泽客户端（PC） @ 电子银行部-李俊-NB", no: "LC-2026-003101", issued: "2026-05-19", exp: "2027-05-18", st: "有效", ca: "白泽内网 CA", cn: "BZPC-0031-9A2C", fp: "NB9A2C77B1155E08", scope: "信贷核心系统 / 报表分析平台" },
      { id: "is_07", kind: "客户端 License 证书", holder: "客户端实例 · AI 安全 agent @ 科技管理部-张伟-PC", no: "LC-2026-004001", issued: "2026-06-01", exp: "2027-05-31", st: "有效", ca: "白泽内网 CA", cn: "BZAI-0007-3A2C", fp: "PC7F3A2C91E004B7", scope: "信贷核心系统 / 数据中台" },
      { id: "is_08", kind: "客户端 License 证书", holder: "客户端实例 · AI 安全 agent @ 信贷管理部-王芳-PC", no: "LC-2026-006001", issued: "2026-08-18", exp: "2027-08-17", st: "有效", ca: "白泽内网 CA", cn: "BZAI-0012-1D8E", fp: "PC1D8E44A0F22C93", scope: "信贷核心系统 / 客户管理平台 / 数据中台" },
      { id: "is_09", kind: "智能体短时凭据", holder: "智能体实例 · 报表生成 Agent @ 科技管理部-张伟-PC（进程 5187）", no: "AT-3A2C-5187", issued: "2026-09-30 08:20", exp: "2026-09-30 08:50", st: "已过期", cn: "BZAI-0007-3A2C", fp: "PC7F3A2C91E004B7", scope: "报表分析平台（只读）", ttl: 30 },
      { id: "is_10", kind: "智能体短时凭据", holder: "智能体实例 · 代码助手 Agent @ 信贷管理部-王芳-PC（进程 2210）", no: "AT-1D8E-2210", issued: "2026-09-30 09:02", exp: "2026-09-30 09:32", st: "有效", cn: "BZAI-0012-1D8E", fp: "PC1D8E44A0F22C93", scope: "代码库 / 需求库", ttl: 30 },
      { id: "is_11", kind: "智能体短时凭据", holder: "智能体实例 · 风控建模 Agent @ 信贷管理部-王芳-PC（进程 9034）", no: "AT-1D8E-9034", issued: "2026-09-30 07:55", exp: "2026-09-30 08:25", st: "已过期", cn: "BZAI-0012-1D8E", fp: "PC1D8E44A0F22C93", scope: "沙箱环境", ttl: 30 },
      /* ★ 2026-10-10（R27 · B-1 补齐）：本条为 ci_007（信贷管理部-王芳-NB / BZPC-0042-7B31）的「当前」
         License。身份侧自 id-8 起即有该份，认证侧台账此前**漏登**（全段 0 命中）—— 而页⑤「签发凭据
         管理」自述「覆盖主体当前持有状态」⇒ 不补则两页对「该实例持有什么」各说一套。
         cn/fp/scope 逐字取自身份侧 ci_007.lic[0] 与其终端 t_nb_0042.sn（同一事实不得另造）。 */
      { id: "is_12", kind: "客户端 License 证书", holder: "客户端实例 · 白泽客户端（PC） @ 信贷管理部-王芳-NB", no: "LC-2026-004201", issued: "2026-06-15", exp: "2027-06-14", st: "有效", ca: "白泽内网 CA", cn: "BZPC-0042-7B31", fp: "NB7B31D9E4F0A6C2", scope: "信贷核心系统 / 客户管理平台" },
      /* ★ R53（存-6）：ci_001 的轮换衔接份 —— 与身份侧 lic_001b 同编号（LC-2027-000702）、
         同签发 / 到期日、同授权范围与 CA；生效日晚于基准日 ⇒ st 由 auIssueSt(exp, issued)
         派生为「待生效」（与身份侧 idLicTagOf 同口径）。 */
      { id: "is_13", kind: "客户端 License 证书", holder: "客户端实例 · 白泽客户端（PC） @ 科技管理部-张伟-PC", no: "LC-2027-000702", issued: "2027-03-14", exp: "2028-03-13", st: "待生效", ca: "白泽内网 CA", cn: "BZPC-0007-3A2C", fp: "PC7F3A2C91E004B7", scope: "信贷核心系统 / 客户管理平台" }
    ],
    authr: [
      { id: "ar_01", user: "张伟", kind: "USB Key 硬件令牌", lv: 4, ctype: "绑定型", dev: "科技管理部-张伟-PC", rpid: "baize.example.com", reg: "2026-06-05", st: "有效", credId: "CID-7F3A-01" },
      { id: "ar_02", user: "张伟", kind: "指纹识别", lv: 4, ctype: "绑定型", dev: "科技管理部-张伟-PC", rpid: "baize.example.com", reg: "2026-06-05", st: "有效", credId: "CID-9C42-02" },
      { id: "ar_03", user: "王芳", kind: "指纹识别", lv: 4, ctype: "可同步凭据", dev: "信贷管理部-王芳-PC", rpid: "baize.example.com", reg: "2026-07-18", st: "有效", credId: "CID-2E88-03" },
      { id: "ar_04", user: "陈丽", kind: "活体人脸识别", lv: 5, ctype: "绑定型", dev: "数据管理部-审计终端", rpid: "baize.example.com", reg: "2026-08-22", st: "有效", credId: "CID-5B17-04" },
      { id: "ar_05", user: "李俊", kind: "指纹识别", lv: 4, ctype: "绑定型", dev: "电子银行部-李俊-NB", rpid: "baize.example.com", reg: "2026-05-20", st: "已吊销", credId: "CID-4D6F-05" }
    ]
  };
}
/* ---------- 认证侧数据口径迁移（就地升级旧快照） ---------- */
/* 旧口径里 WebAuthn / 设备生物因素 / 活体人脸曾被当成「方式名」（内码 webauthn / bio / facial），
   现按 PRD F5.4 回归：L4 / L5 的实现口径是 WebAuthn（FIDO2）**承载协议**，方式名是
   指纹识别 / USB Key 硬件令牌 / 活体人脸识别 / 虹膜识别。旧内码按下表折算。 */
var AU_MID_LEGACY = { webauthn: "fp", bio: "fp", facial: "face" };
function auMigrateWayMid(w) {
  if (w && AU_MID_LEGACY[w.mid]) w.mid = AU_MID_LEGACY[w.mid];
  return w;
}
/* 字典口径迁移：旧快照把「免认证登录」那一档砍掉后整体上移一档（账号密码记成 L1、短信记成
   L2、L3 整档缺失），并含 WebAuthn/bio/facial 三个非 PRD 方式名；旧版级别字段名为 lv
   （且无 srcBind / interactive）、快照键名为 lvdef。命中即按真源重建标准条目；
   运行时自建的方式（内码不在标准集内）保留，不被抹掉。 */
function auMigrateDict(d) {
  if (!d || typeof d !== "object") return d;
  /* 快照无方式清单（或只剩旧键 lvdef）⇒ 按真源重建 */
  if (!Array.isArray(d.methods) || !d.methods.length) {
    d.methods = JSON.parse(JSON.stringify(AU_METHODS));
    d.levels = JSON.parse(JSON.stringify(AU_LEVELS));
    if (d.lvdef) delete d.lvdef;
    return d;
  }
  var std = {};
  AU_METHODS.forEach(function (m) { std[m.id] = m; });
  var stale = d.methods.some(function (m) {
    if (AU_MID_LEGACY[m.id]) return true;
    var s = std[m.id];
    if (!s) return false;
    return String(s.name) !== String(m.name)
      || Number(s.defLv) !== Number(m.defLv)
      || Number(s.authrLv || 0) !== Number(m.authrLv || 0)
      || Boolean(s.srcBind) !== Boolean(m.srcBind)
      || Boolean(s.interactive) !== Boolean(m.interactive);
  });
  /* 快照键名未升级（仍带旧 lvdef、或缺 levels）同样按真源归一 —— 用「或」而非「且」：
     二者同时存在的快照也必须重建，否则旧键 lvdef 永远清不掉。 */
  if (!d.levels || d.lvdef) stale = true;
  if (!stale) return d;
  var custom = d.methods.filter(function (m) {
    return !std[m.id] && !AU_MID_LEGACY[m.id];
  }).map(function (m) {
    /* 自建方式保留，并把旧字段名 / 缺失字段补齐到当前形态 */
    return { id: m.id, name: m.name,
      defLv: Number(m.defLv != null ? m.defLv : m.lv) || 1,
      authrLv: Number(m.authrLv) || 0,
      srcBind: !!m.srcBind, interactive: m.interactive !== false,
      inherent: m.inherent || "—", inSession: m.inSession !== false };
  });
  d.methods = JSON.parse(JSON.stringify(AU_METHODS)).concat(custom);
  d.levels = JSON.parse(JSON.stringify(AU_LEVELS));
  if (d.lvdef) delete d.lvdef;
  return d;
}
function auLoad() {
  /* ★ 认证模块的「持有主体」选项与「绑定主体标识」(cn) 均取自身份模块台账
     ID.cin / ID.ain，而身份数据只在身份模块页由 idLoad() 装载（见 renderId*）——
     直接进入认证模块页时 ID 为 null，会让主体下拉退化成兜底单选项、cn 回落为客户端名
     （与种子记录的序列号口径打架）。此处按需补装，失败不阻断认证模块独立演示。 */
  if (typeof ID === "undefined" || !ID) { try { idLoad(); } catch (e) { /* 忽略 */ } }
  AU = auSeed();
  var _snapDef = auSeed();
  try {
    var s = JSON.parse(localStorage.getItem(AU_KEY) || "null");
    /* ★ 2026-10-10（R25）：**快照 schema 判版** —— 此前无条件采用快照
       （`for (var k in s)` 直接覆盖新种子）⇒ 种子改了用户永远看到旧数据。
       实测：页④长期显示数月前的 4 条（办公自动化平台 / 客户管理平台 /
       旧版报表系统 / 供应商门户），其资产名在资产台账中均不存在
       ⇒ 点「配置契约」报「该资产未在资产管理登记」。
       今按 schema 判版：不一致即整包丢弃，按新种子重建。 */
    if (s && typeof s === "object" && s.schema === _snapDef.schema) {
      for (var k in s) { if (s[k] != null) AU[k] = s[k]; }
    }
  } catch (e) { /* 忽略 */ }
  var d = auSeed();
  ["sources", "issue", "authr"].forEach(function (k) { if (!Array.isArray(AU[k])) AU[k] = d[k]; });
  if (!AU.dict || !Array.isArray(AU.dict.methods)) AU.dict = d.dict;
  /* 字典回归 PRD 一期 F5.4 口径（详见文件顶部 AU_METHODS 处的唯一真源说明） */
  auMigrateDict(AU.dict);
  /* ★ 2026-10-09：`anti` 字段已**整体撤除** —— 抗钓鱼 ≡ 源绑定，同一事实不再两处维护；
     页面一律读 `srcBind`（历史快照里遗留的 anti 键不再被读取，也不参与任何判定）。 */
  AU_SRC_METHODS = (AU.dict.methods || AU_METHODS).slice();
  /* ★ 2026-10-10（R33 · X-2）：先把身份侧权威值同步下来，再按有效期归一状态。 */
  auSyncIssueFromId();
  /* 签发凭据状态按有效期归一（同 web 侧 credNormalize 的体例）。 */
  auIssueNormalize();
  /* ★ 2026-10-10（R24）：认证器登记记录的 RP ID 一律收敛为平台统一常量。 */
  auAuthrNormalize();
  /* ★ 2026-10-09：原为 `if (!AU.gw) AU.gw = d.gw;` —— 随死种子一并撤除
     （`AU.gw` 的唯一读者 `auGwCas()` 已改读模块级常量 `GW_SIGN_CAS`）。
     旧存档曾**整包**持久化 `AU`（`auSave` 即 `JSON.stringify(AU)`），`AU.gw` 会随旧档复活
     ⇒ 此处就地清除，避免影子数据在用户浏览器里长期驻留。 */
  if (AU.gw) delete AU.gw;
  if (!AU.uc) AU.uc = d.uc;
  AU.schema = d.schema;
  /* 归一化：conn 由 {kind, rows:[散文]} 改为 {kind, fields:[参数]} 后，旧快照没有 fields，
     新版参数表会渲染成空表（表现为「每个认证源的连接参数都一样、且找不到可填项」）。
     此处就地升级 —— 与上面 AU.uc 的归一化同一体例。 */
  var seedConn = {};
  (d.sources || []).forEach(function (x) { seedConn[x.id] = x.conn; });
  (AU.sources || []).forEach(function (s) {
    s.conn = s.conn
      ? auMigrateConn(s.conn, seedConn[s.id])
      : JSON.parse(JSON.stringify(seedConn[s.id] || auConnSeed("local", null, false, "")));
    /* 旧内码（webauthn / bio / facial）折算为 PRD 口径的方式内码 */
    (s.ways || []).forEach(auMigrateWayMid);
  });
  /* 归一化：旧版本 localStorage 里的 uc 记录没有 login → 按 id 从种子补齐**测试留痕**，
     种子也没有的（运行时新建）→ 补最小骨架，避免页面出现 undefined。
     ★ 2026-10-10（R27 · C-4）：`login` 已**只承载测试留痕**（契约的唯一真源是资产侧 _adapt.d）
       ⇒ 此处不再补契约字段（补了反而制造第二份可漂移的副本）。 */
  if (AU.uc && Array.isArray(AU.uc.items)) {
    var seedMap = {};
    (d.uc.items || []).forEach(function (s) { seedMap[s.id] = s; });
    AU.uc.items.forEach(function (x) {
      if (x.login && typeof x.login === "object") return;
      if (seedMap[x.id] && seedMap[x.id].login) { x.login = JSON.parse(JSON.stringify(seedMap[x.id].login)); return; }
      x.login = { tested: "未测试" };
    });
    if (!AU.uc.cfg || AU.uc.cfg.url) {
      /* 旧 cfg 里有全局 url（已废弃的「统一登录页」口径）→ 丢弃，改用引擎级默认口径 */
      var oc = AU.uc.cfg || {};
      AU.uc.cfg = { scope: oc.scope || d.uc.cfg.scope, form: oc.form || d.uc.cfg.form,
        captcha: oc.captcha || d.uc.cfg.captcha, bind: oc.bind || d.uc.cfg.bind, fail: oc.fail || d.uc.cfg.fail,
        defaultKind: d.uc.cfg.defaultKind, defaultSubmit: d.uc.cfg.defaultSubmit,
        /* ★ 重建时必须保留运行期写入的「最近批量测试」时刻 —— 全量重建会把清单外的键整体丢弃，
           这正是「最近测试」列长期恒为「—」的成因之一。 */
        tested: oc.tested || "" };
    }
  }
}
function auSave() { try { localStorage.setItem(AU_KEY, JSON.stringify(AU)); } catch (e) { /* 忽略 */ } }

/* ---------- 1. 通用小件 ---------- */
function auLvTag(lv) {
  return '<span class="lv l' + lv + '">L' + lv + "</span>";
}
function auStTag(st) {
  var m = { "已启用": "t-ok", "有效": "t-ok", "已托管": "t-ok", "待配契约": "t-warn", "已停用": "t-gray", "已吊销": "t-err",
            /* ★ 2026-10-10（R9）：原「已过期」映射 t-gray —— 与页③（CA / mTLS 凭据）的 _ST_TAG `"已过期":"t-err"` **同一状态两种颜色**，且灰与「已停用」（人为停用、中性）同色，会把「有效期已过」这一非预期失效读成运维态。统一为 t-err（失效态）。 */
            "已过期": "t-err", "即将过期": "t-warn", "代填失败": "t-err", "待生效": "t-warn" };
  return '<span class="tag ' + (m[st] || "t-gray") + '">' + esc(st) + "</span>";
}
function auMethodName(mid) { for (var i = 0; i < (AU.dict.methods || []).length; i++) if (AU.dict.methods[i].id === mid) return AU.dict.methods[i].name; return mid; }
function auMethod(mid) { for (var i = 0; i < (AU.dict.methods || []).length; i++) if (AU.dict.methods[i].id === mid) return AU.dict.methods[i]; return null; }
/* 该方式是否被任一启用中的源引用（被引用 ⇒ 字典中不可删除） */
/* 「被引用」＝**任一认证源**（无论启用 / 停用）在其「源 × 方式」记录里引用了该方式。
   ⚠ 若只算「已启用」源：一个已停用源的引用不被视为引用 ⇒ 字典页显示「未引用」并放出
   「删除」按钮 ⇒ 删除后该停用源的 ways 里留着指向不存在方式的 mid ⇒ **悬空引用**
   （该源再次启用时认证链引用空对象）。故口径取「所有源」，并按启停拆分用于文案。 */
function auRefSplit(mid) {
  var on = 0, off = 0;
  (AU.sources || []).forEach(function (s) {
    (s.ways || []).forEach(function (w) {
      if (w.mid === mid) { if (s.st === "已启用") on++; else off++; }
    });
  });
  return { on: on, off: off };
}
function auRefCount(mid) { var r = auRefSplit(mid); return r.on + r.off; }
/* 该方式是否被**访问策略**引用 —— 策略条件里的「认证方式 ∈ …」按**方式名**取值（不是内码）
   ⇒ 与认证源侧按 mid 的引用是**两条独立引用链**，必须一并纳入「被引用不可删」判定。
   覆盖面：页 A 准入策略（POLICIES[资产].agentless / agent）与页 B 资源级访问要求
   （ASSETS[].res[].paths[]._rq.cond，随该路径生命周期 lc 启停）。
   ⚠ 只扫认证源会漏放：删掉被策略引用（含已停用策略）的方式后，策略条件里留着指向不存在方式的方式名 ——
     引擎按方式名求值时命中不到任何「源 × 方式」记录，该条件**恒不达标**（静默失效）。 */
function auPolRefSplit(name) {
  var on = 0, off = 0;
  function scanCond(cond, active) {
    var hit = false;
    (function walk(n) {
      if (!n) return;
      if (n.t === "g") { (n.ch || []).forEach(walk); return; }
      if (n.t !== "c" || n.attr !== "auth.method") return;
      var vs = Array.isArray(n.v) ? n.v : String(n.v == null ? "" : n.v).split(/[、,]/);
      for (var i = 0; i < vs.length; i++) { if (String(vs[i]).trim() === name) { hit = true; return; } }
    })(cond);
    if (hit) { if (active) on++; else off++; }
  }
  try {
    if (typeof POLICIES !== "undefined" && POLICIES) {
      Object.keys(POLICIES).forEach(function (aid) {
        var g = POLICIES[aid] || {};
        ["agentless", "agent"].forEach(function (mode) {
          (g[mode] || []).forEach(function (p) { if (p && p.cond) scanCond(p.cond, !!p.on); });
        });
      });
    }
    if (typeof ASSETS !== "undefined" && ASSETS) {
      (ASSETS || []).forEach(function (a) {
        ((a && a.res) || []).forEach(function (r) {
          ((r && r.paths) || []).forEach(function (p) {
            if (p && p._rq && p._rq.cond) scanCond(p._rq.cond, p.lc === "已激活");
          });
        });
      });
    }
  } catch (e) { /* 策略 / 资产台账未就绪时不阻断字典页 */ }
  return { on: on, off: off };
}

/* ===== 认证模块 · 列表分页（2026-10-09 裁定「表格都应该分页」） =====
   复用全站通用分页器（pgmk / .pager.tight，见上方「通用分页」段）：
   · 有数据即渲染（单页也渲染，仅零条不渲染）—— 与 2026-10-08 裁定同口径；
   · 勾选 / 全选 / 批量一律限定「当前页可见行」（与 aspPg 同口径）；
   · 页码状态与筛选条件同层：只活在本次会话内、不进 localStorage —— 筛选条件本身
     也不持久化，单独持久化页码会还原出「无筛选的第 3 页」这种错状态。
   参与分页的是**记录台账**（认证方式清单 / 认证源列表 / 源 × 方式记录 / 托管账号 /
   表单契约 / 签发凭据 / 认证器登记，以及页③的三张凭据表）；
   **不**参与的是**定义表与子表**（级别档位定义固定 L1~L5 五行、表单字段映射固定四项、
   源属性 / 引擎策略等键值表）—— 它们不是可增长的记录台账。 */
var AU_PAGE = 10;
/* ★ 2026-10-10（R15）：设备名（「数据管理部-审计终端」「张伟-PC」）是不可断行的自然长值，
   在 111px 的弹性列里折成「数据管理部-审」/「计终端」—— 断点落在**词中间**。按 R12④ 口径
   （标识类长串的断点须落在**语义边界**）在连字符与斜杠后插 `<wbr>`，让折行发生在「-」「/」之后。 */
function devWbr(s) {
  return esc(String(s == null ? "" : s)).replace(/([-/])/g, "$1<wbr>");
}
function auSlice(rows, holder) {
  var pages = Math.max(1, Math.ceil(rows.length / AU_PAGE));
  var p = Math.min(Math.max(1, Number(holder.pg) || 1), pages);
  holder.pg = p;
  return rows.slice((p - 1) * AU_PAGE, p * AU_PAGE);
}
function auMountPager(elId, total, page, go, unit, hint) {
  if (!document.getElementById(elId.replace("#", ""))) return;
  pgmk(elId, total, page, go, unit, AU_PAGE, hint);
}
/* ★ 2026-10-10（R11）：落库后把页码指向新行所在页。
   原实现各「新增」分支都不动分页状态 ⇒ push 到末尾的新行落在末页、unshift 到开头的新行落在
   首页，两种在当前页都不可见（用户以为「新增没生效」）。atEnd=true 表示新行落在末页。 */
function auPgNew(holder, total, atEnd) {
  if (!holder) return;
  holder.pg = atEnd ? Math.max(1, Math.ceil(Number(total || 0) / AU_PAGE)) : 1;
}
/* 翻页入口一律重渲染本文；页⑤ 翻页同时清空勾选（勾选与结果集强相关，避免跨页误批量） */
function audPg(p)      { AUD.pg = Math.max(1, p | 0); renderAuDict(); }
/* ★ 2026-10-10（R11-H）：档位定义表的翻页入口（与 audPg 同形，页码状态独立）。 */
function audLvPg(p)    { AUD.lv.pg = Math.max(1, p | 0); renderAuDict(); }
function ausrcPg(p)    { AUS.pg = Math.max(1, p | 0); renderAuSrc(); }
function ausrcWayPg(p) { AUW.pg = Math.max(1, p | 0); renderAuSrc(); }
/* ★ 2026-10-10（R13）：认证源详情「字段映射」表的翻页入口（与 ausrcWayPg 同形，页码状态独立）。 */
function ausrcMapPg(p) { AUW.map.pg = Math.max(1, p | 0); renderAuSrc(); }
function auucPg(p)     { AUU.pg = Math.max(1, p | 0); renderAuUserCred(); }
function auucFmtPg(p)  { AUF.pg = Math.max(1, p | 0); renderAuUserCred(); }
function auiPg(p)      { AUI.pg = Math.max(1, p | 0); AUI.sel = []; renderAuIssue(); }
function aurPg(p)      { AUR.pg = Math.max(1, p | 0); renderAuAuthr(); }
/* 页③ 三张凭据表各自的分页状态（同口径：只活在本次会话内） */
var CRED_PG = { c1: 1, c2: 1, c3: 1 };
function credSlice(rows, key) {
  var pages = Math.max(1, Math.ceil(rows.length / AU_PAGE));
  var p = Math.min(Math.max(1, Number(CRED_PG[key]) || 1), pages);
  CRED_PG[key] = p;
  return rows.slice((p - 1) * AU_PAGE, p * AU_PAGE);
}
function credPager(key, elId, total, unit, hint) {
  if (!document.getElementById(elId)) return;
  pgmk("#" + elId, total, CRED_PG[key], "credPg_" + key, unit, AU_PAGE, hint);
}
function credPg_c1(p) { CRED_PG.c1 = Math.max(1, p | 0); credRows(); }
function credPg_c2(p) { CRED_PG.c2 = Math.max(1, p | 0); caRows(); }
function credPg_c3(p) { CRED_PG.c3 = Math.max(1, p | 0); mtlsRows(); }

/* ---------- 2. 页① 认证方式字典（pg-audict） ---------- */
/* ★ 2026-10-10（R11-H）：`lv` 页签（级别档位定义）与 `m` 页签（认证方式清单）各自持有页码 ——
   共用 `AUD.pg` 会在「m 翻到第 2 页 → 切 lv」时把 5 行按第 2 页切片。 */
var AUD = { tab: "lv", k: "", pg: 1, lv: { pg: 1 } };
function auDictFiltered() {
  var k = String(AUD.k || "").toLowerCase();
  if (!k) return (AU.dict.methods || []).slice();
  return (AU.dict.methods || []).filter(function (m) {
    /* ★ 2026-10-09：原过滤条件含 `m.note`，但该字段从未写入、也从未渲染 ⇒「搜索说明」无从命中
       （搜不到任何东西的筛选项）。改为搜可命中的字段：方式名 / 凭据固有属性 / 抗钓鱼判据。 */
    return (m.name + " " + (m.inherent || "") + " " + (m.srcBind ? "抗钓鱼 源绑定" : "")).toLowerCase().indexOf(k) >= 0;
  });
}
function auDictPage() {
  var tab = AUD.tab;
  /* 档位表**只描述档位本身** —— 不列「该档方式」、不判「该档可否抗钓鱼」：
     抗钓鱼是方式的固有属性（源绑定能力），不是档位的属性。 */
  var lvHtml = auSlice(AU.dict.levels || [], AUD.lv).map(function (d) {
    return '<tr><td><b>L' + d.lv + "</b> · " + esc(d.name) + (d.res ? ' <span class="tag t-gray">' + esc(d.res) + "</span>" : "") + "</td>" +
      "<td>" + esc(d.desc) + "</td></tr>";
  }).join("");
  var mHtml = auSlice(auDictFiltered(), AUD).map(function (m) {
    var rfs = auRefSplit(m.id), ref = rfs.on + rfs.off;
    /* ★ 2026-10-10（R30）：引用 = 认证源 + 访问策略（两条独立链，见 auPolRefSplit）。 */
    var pfs = auPolRefSplit(m.name), pref = pfs.on + pfs.off;
    /* ★ 2026-09-30：字典条目的删除门禁改由**方式自身的身份**判定 ——
       内置方式内码在 AU_BUILTIN_IDS 内 ⇒ 不可删（删掉会让方式名取值域残缺、
       已落库的「源 × 方式」记录悬空）；自建方式未引用即可删。
       旧实现按「该档位下方式条数 ≤ 1 则不可删」，其依据是「档位 → 方式集合」这一**已废止**的
       归属关系（级别不归字典），故该判据连同依据一并摘除。
       与「被引用不可删」同为由数据推导的门禁：入口级收口（不渲染入口）+ 提交侧兜底。 */
    var builtin = AU_BUILTIN_IDS.indexOf(m.id) >= 0;
    /* ★ 2026-10-10（R30/R32）：次行文案**须短到单行放得下** —— 本列 150px，实测
       「（含已停用 1）· 策略引用 2」在此列折成两行、整格 3 行（破坏 R15「次行块不折行」）。
       收敛为「停用 N · 策略引用 M」形态，仍由同一个 `.mini` 块级次行承载。 */
    var _seg = [];
    if (rfs.off) _seg.push("停用 " + rfs.off);
    if (pref) _seg.push("策略引用 " + pref);
    var _refCell = (ref || pref)
      ? (ref ? "<b>" + ref + "</b> 个源引用" : "") + (_seg.length ? '<div class="mini" style="margin-top:2px">' + _seg.join(" · ") + "</div>" : "")
      : '<span class="muted">未引用</span>';
    var _opCell = (ref || pref) ? "" : (builtin ? '<span class="muted mini" title="平台内置方式，不可删除 —— 删除会使方式名取值域残缺、历史记录悬空">内置方式</span>' : '<button class="btn link" data-auact="dictDel" data-id="' + m.id + '">删除</button>');
    return "<tr><td><b>" + esc(m.name) + "</b></td>" +
      "<td>" + (m.defLv ? auLvTag(m.defLv) + ' <span class="mini">参考</span>' : '<span class="tag t-gray">—</span>') + "</td>" +
      "<td>" + esc(m.inherent) + "</td>" +
      "<td>" + (m.srcBind ? '<span class="tag t-info">源绑定 · 抗钓鱼</span>' : '<span class="tag t-gray">—</span>') + "</td>" +
      /* ★ 2026-10-10（R11）：「交互式」由 dictNew 采集并已决定二次认证的可用方式（过滤在 render2FA），
         但字典页此前不呈现 ⇒ 补次行；不新增列，避免 1280 下 8 列溢出。 */
      "<td>" + (m.inSession ? "计入" : '<span class="muted">不计入</span>') + '<div class="mini" style="margin-top:2px">' + (m.interactive ? "交互式" : "非交互式") + "</div></td>" +
      /* ★ 2026-10-10（R15）：括注原为 inline `<span class="mini">`，与主文本同流 ⇒ 150px 列里折成
         「1 个源引用 （含已停用」/「1）」，断点落在**非语义边界**。改为**次行块**（同模块既有
         「长值折次行」范式），主行只留「N 个源引用」，列宽 150px 不变即恒稳。 */
      "<td>" + _refCell + "</td>" +
      '<td><span class="opgrp">' + _opCell + "</span></td></tr>";
  }).join("");
  return idTitle("认证方式字典", "<b>方式名</b>的唯一取值域来源 · 全平台唯一权威源 · <b>旁挂</b>于「认证源 → 认证方式」主线之外",
      /* ★ 2026-10-10（R16）：本入口只作用于「认证方式清单」页签（新增的是方式、不是档位），
         而默认落「级别档位定义」页签 ⇒ 默认视图下点新增，屏幕停在档位表、毫无变化，
         toast 却说「已跳至第 N 页」—— 属「点了没反应 + 提示与可见内容不符」。
         入口随页签出现（档位表只读，本无新增语义）。
         ⚠ 本行原串尾部的 `)` 是 `idTitle(` 的闭合括号，插入三元后必须一并保留，
           否则 `idTitle(` 悬空（R16 首次落盘即被 node --check 拦下，见本文件落盘前语法门）。 */
      (tab === "m"
        ? '<div class="toolbar"><button class="btn primary" data-auact="dictNew">新增认证方式</button></div>'
        : "")) +
    idRefNote("本页只回答<b>「平台上有哪些认证方式、各自的凭据形态与固有属性」</b>，<b>不含具体源的效力</b> —— 同一方式在不同源下的级别与适用范围由<b>认证源</b>页联合判定，本页<b>统一的是名字，不是效力</b>。方式上标注的<b>参考默认级别</b>只作新建记录时的初值。") +
    /* ★ 2026-10-10（R12）：补 tablist / tab / tabpanel 语义（范式同动态防护 `#dpOvTabs`）。 */
    '<div class="tabs" id="audTabs" role="tablist">' +
      '<button type="button" role="tab" id="audTabsTab_lv" aria-controls="audPanel" aria-selected="' + (tab === "lv" ? "true" : "false") + '" data-aut="lv" class="' + (tab === "lv" ? "on" : "") + '">级别档位定义<span class="num">L1~L5</span></button>' +
      '<button type="button" role="tab" id="audTabsTab_m" aria-controls="audPanel" aria-selected="' + (tab === "m" ? "true" : "false") + '" data-aut="m" class="' + (tab === "m" ? "on" : "") + '">认证方式清单<span class="num">' + (AU.dict.methods || []).length + "</span></button></div>" +
    '<div class="card" role="tabpanel" id="audPanel" aria-labelledby="audTabsTab_' + (tab === "lv" ? "lv" : "m") + '"><div class="card-h"><h3>' + (tab === "lv" ? "级别档位定义" : "认证方式清单") +
      '<span class="sub">' + (tab === "lv" ? "档位固定 L1~L5 且序不变 · 只描述档位本身 · 不含方式归属" : "方式名的唯一取值范围 · 供认证源引用 · 级别由源 × 方式判定") + "</span></h3></div>" +
      '<div class="card-b">' +
      (tab === "m"
        ? '<div class="toolbar" style="margin-bottom:12px">' +
             '<div class="input-w"><input type="search" id="audK" placeholder="搜索方式名 / 固有属性" aria-label="搜索认证方式" style="width:240px" value="' + esc(AUD.k) + '"><i>搜索</i></div>' +
          "</div>"
        : "") +
      (tab === "lv"
        ? idTbl(["档位", "判定含义"], lvHtml || idEmptyRow(2, "档位定义缺失"), ["220px", null]) +
          /* ★ 2026-10-10（R11-H）：本表此前**整张无分页器**，违反「有数据即渲染分页器」。 */
          '<div class="lst-foot"><div id="audLvPager" style="flex:1"></div></div>'
        /* ★ 2026-10-10（R11）：末段表头由单行改两行 —— 本列 106px 内容盒 78px，单行文案实测 125.9px（溢出 48px，
           1280 下同）。主行「计入会话档位」75.0px、次行「交互式」37.5px，与数据单元格「计入 / 不计入 + mini 次行」形态一致。 */
        : idTbl(["方式名", "参考默认级别", "凭据固有属性", "源绑定（抗钓鱼判据）", "计入会话档位<br><span class=\"mini\">交互式</span>", "被引用", "操作"],
            mHtml || (AUD.k ? emptyRowBtn(7, "没有符合条件的认证方式", "data-auact", "audClearF") : idEmptyRow(7, "暂无认证方式")), /* ★ 2026-10-10（R12）：两个弹性列原按剩余宽**等比平分**（≈208 / ≈208）——
         「方式名」短内容白占宽、「凭据固有属性」长内容反复折行。改为「方式名」定宽 150，
         余量全部归「凭据固有属性」。 */
            ["150px", "108px", null, "156px", "116px", "150px", "92px"]) +
          '<div class="lst-foot"><div id="audMPager" style="flex:1"></div></div>') +
      /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL1（认证源接入与生效全流程）」。 */
      "</div></div>";
}

/* ---------- 3. 页② 认证源（pg-ausrc）唯一落笔处 ---------- */
/* ★ 2026-10-10（R9）：新增源此前把 `sync.mode` **直接写死「未配置」**，而「同步方式」全页无任何
   维护入口（`srcEditAttr` 只改展示属性）⇒ 新建的非本地源**永远不能启用**（启用校验要求账号来源
   明确），详情页还会渲染一个点了只弹「后续版本提供」的死按钮。此处把同步方式的**取值域**与
   **说明派生**收成一处，新增向导与「编辑源属性」共用（穷举既有取值，避免编辑时下拉对不上既有值
   而被静默改写）。「—」＝本地账号体系；「定时同步（CRL）」＝CA / 证书体系专用档。 */
var AU_SYNC_MODES = ["—", "未配置", "定时同步（全量）", "定时同步（增量）", "定时同步（CRL）", "实时同步（事件驱动）", "登录时按需映射"];
/* 🎯 2026-10-10（R12）：上面这份是**并集**（供「方式 → 说明」派生与既有台账回显），
   但**控件取值域必须按源类型收敛** —— 并集直接铺进下拉，会落出「AD 域 · 定时同步（CRL）」这类
   自相矛盾的记录（CRL 是证书吊销列表，目录服务不产生它）。
   判据：档位语义（拉账号 / 拉证书吊销 / 按需建映射）必须与该类型**可提供的能力**一致。 */
var AU_SYNC_BY_TYPE = {
  "本地账号体系": ["—"],
  "AD / LDAP": ["未配置", "定时同步（全量）", "定时同步（增量）", "实时同步（事件驱动）", "登录时按需映射"],
  "OIDC 外部 IdP": ["未配置", "实时同步（事件驱动）", "登录时按需映射"],
  "CA / 证书体系": ["未配置", "定时同步（CRL）", "登录时按需映射"]
};
/* 取某类型可用的同步方式；类型缺省（数据异常）时退回并集，避免下拉为空。 */
function auSyncModes(type) {
  var ls = AU_SYNC_BY_TYPE[String(type == null ? "" : type).trim()];
  return (ls || AU_SYNC_MODES).slice();
}
function auSyncNote(mode) {
  switch (mode) {
    case "—": return "本地账号由平台自管，<b>不涉及外部同步</b>。";
    case "定时同步（全量）": return "按固定周期<b>全量拉取</b>；仅管理来源标注为本源的账号，<b>不覆盖内部手工账号</b>；属性冲突时<b>告警而非覆盖</b>。";
    case "定时同步（增量）": return "按固定周期<b>增量拉取</b>；仅管理来源标注为本源的账号，<b>不覆盖内部手工账号</b>；属性冲突时<b>告警而非覆盖</b>。";
    case "定时同步（CRL）": return "账号不批量同步，仅按证书主体<b>按需建立映射</b>；吊销状态以 <b>CRL</b> 为准，拉取失败即告警。";
    case "实时同步（事件驱动）": return "由来源侧事件<b>实时推送</b>；仅管理来源标注为本源的账号，<b>不覆盖内部手工账号</b>；冲突时<b>告警而非覆盖</b>。";
    case "登录时按需映射": return "不在平台侧建全量账号副本；<b>首次登录时</b>按来源主体建立映射并落账号，此后仅更新时间戳。";
    default: return "本源<b>尚未配置同步</b>；启用前须明确账号从哪来。";
  }
}
/* 新增源：类型选「本地账号体系」时同步方式固定「—」并收起该字段（本地无外部同步） */
/* ★ 2026-10-10（R22）：来源标注**随类型自动带出** —— 类型已唯一确定基础标注
   （与种子 LOCAL / AD / OIDC / CA 同口径），同类型多源自动加序号（AD → AD2 → AD3…）。
   此前要用户手打 ⇒ 既冗余（把已定信息再抄一遍）又制造两类错：标注与类型不一致、
   手打撞车被唯一性校验弹回。标注仍是账号同步的归属键，**需唯一**（自动派生天然满足）；
   用户手工覆盖后不再自动覆盖（`auTagDirty` 置 `data-auto="0"`）。 */
function auTagBase(tp) {
  return tp === "AD / LDAP" ? "AD" : tp === "OIDC 外部 IdP" ? "OIDC" : tp === "CA / 证书体系" ? "CA" : "LOCAL";
}
function auTagAuto(tp, selfId) {
  var base = auTagBase(tp), used = {};
  (AU.sources || []).forEach(function (x) { if (x.id !== selfId) { used[x.tag || x.name] = 1; } });
  if (!used[base]) { return base; }
  var n = 2;
  while (used[base + n]) { n++; }
  return base + n;
}
function auTagDirty(el) { if (el) { el.setAttribute("data-auto", "0"); } }
function auSrcTypeSync(v) {
  var w = document.getElementById("ausSyncWrap"), s2 = document.getElementById("ausSync");
  if (!w || !s2) return;
  var isLocal = (String(v || "") === "本地账号体系");
  w.style.display = isLocal ? "none" : "";
  /* ★ 2026-10-10（R11）：切回非本地时须把「—」恢复为「未配置」——
     原实现只在 isLocal 分支改写值，而 R10「开窗即收放」开窗即置「—」⇒
     用户切成 AD / LDAP 后该值被继承并原样落库（sync.mode="—"，说明写成
     「本地账号由平台自管，不涉及外部同步」），而启用校验必然拒绝「—」、
     界面又无「未配置」可回退 ⇒ 死循环。 */
  if (isLocal) s2.value = "—";
  else if (String(s2.value || "").trim() === "—") s2.value = "未配置";
  /* 🎯 2026-10-10（R12）：选项集按类型重建 —— 例如把类型从「CA / 证书体系」改成「AD / LDAP」时，
     原选的「定时同步（CRL）」必须从下拉消失；当前值若不在新类型可用集内，回落「未配置」。 */
  var ls2 = auSyncModes(v);
  var cur2 = String(s2.value || "").trim();
  if (ls2.indexOf(cur2) < 0) cur2 = (ls2.length && ls2[0] === "—") ? "—" : "未配置";
  s2.innerHTML = ls2.map(function (o5) { return "<option" + (o5 === cur2 ? " selected" : "") + ">" + esc(o5) + "</option>"; }).join("");
  s2.value = cur2;
  /* ★ 2026-10-10（R22）：来源标注随类型刷新（用户手改过则不再覆盖）。 */
  var _tg = document.getElementById("ausTag");
  if (_tg && _tg.getAttribute("data-auto") !== "0") { _tg.value = auTagAuto(String(v || ""), ""); }
}
var AUS = { cur: "", addWay: "", f: { k: "", st: "" }, pg: 1, pgw: 1 };
function auSrcFiltered() {
  var f = AUS.f || {};
  return (AU.sources || []).filter(function (s) {
    if (f.k) {
      var hay = (s.name + " " + s.type + " " + s.tag + " " + (s.desc || "")).toLowerCase();
      if (hay.indexOf(String(f.k).toLowerCase()) < 0) return false;
    }
    if (f.st && s.st !== f.st) return false;
    return true;
  });
}
function auSrcPage() {
  if (AUS.cur) { var s = AU.sources.filter(function (x) { return x.id === AUS.cur; })[0]; if (s) return auSrcDetail(s); }
  /* ★ R61·轮10：「展示顺序」是登录页呈现次序的配置值（表单侧校验唯一性），列表须按它升序 —— 原按数组原始序渲染，改小某条 order 后行次序与列值脱节。 */
  var body = auSlice(auSrcFiltered().sort(function (x, y) { return (Number(x.order) || 0) - (Number(y.order) || 0); }), AUS).map(function (s) {
    return "<tr><td><b>" + esc(s.name) + "</b></td>" +
      "<td>" + esc(s.type) + "</td>" +
      "<td>" + auStTag(s.st) + "</td>" +
      '<td><span class="kr">' + esc(s.tag) + "</span></td>" +
      '<td class="cell-cov">' + (s.ways || []).map(function (w) { return '<span class="tag t-gray">' + esc(auMethodName(w.mid)) + " " + "<b>L" + w.lv + "</b>" + "</span>"; }).join(" ") + "</td>" +
      '<td>' + esc(s.order) + "</td>" +
      '<td><span class="opgrp"><button class="btn link" data-auact="srcView" data-id="' + s.id + '">配置</button>' +
      '<button class="btn link" data-auact="srcToggle" data-id="' + s.id + '">' + (s.st === "已启用" ? "停用" : "启用") + "</button></span></td></tr>";
  }).join("");
  return idTitle("认证源", "回答「用户<b>从哪来</b>」· （认证源 × 认证方式）<b>联合判定的唯一落笔处</b> · 每条「源 × 方式」记录带<b>无端支持</b>标签（<b>无端接入的判定与执行由无端网关承载</b>，本源仅声明适用性）",
      '<div class="toolbar"><button class="btn primary" data-auact="srcNew">新增认证源</button></div>') +
    idRefNote("主线两级：<b>认证源 → 认证方式</b>（一对多）。级别与适用范围是<b>源与方式两端联合判定</b>的结果 —— 换源或换方式任一改变，判定即变；<b>不是源定档，也不是方式定档</b>。本页填的是<b>配置声明级别</b>（该源以该方式认证时可<b>达到</b>的强度）；用户某次登录<b>实际达到</b>的级别在认证时由该源与方式链联合判定确定，两者不得混用。") +
    '<div class="card"><div class="card-b">' +
    '<div class="toolbar" style="margin-bottom:12px">' +
      '<div class="input-w"><input type="search" id="ausrcK" placeholder="搜索认证源 / 类型 / 标注" aria-label="搜索认证源" style="width:250px" value="' + esc(AUS.f.k) + '"><i>搜索</i></div>' +
      '<select id="ausrcSt" aria-label="筛选认证源状态"><option value="">全部状态</option>' +
        ["已启用", "已停用"].map(function (o) { return "<option" + (AUS.f.st === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
      "</select>" +
    "</div>" +
    /* ★ 2026-10-09：删除「支持方式」（N 种）列 —— 与紧邻的「方式 / 级别」列**同一事实两处**：
       后者已逐条列出方式名与级别，个数可数得，无需再占一列。 */
    idTbl(["认证源", "类型", "状态", "来源标注", "方式 / 声明级别", "展示顺序", "操作"],
      body || ((AUS.f.k || AUS.f.st) ? emptyRowBtn(7, "没有符合条件的认证源", "data-auact", "ausClearF") : idEmptyRow(7, "暂无认证源")), /* ★ 2026-10-10（R12）：同上 —— 「认证源」定宽 160，余量归「方式 / 级别」。 */
      ["160px", "150px", "92px", "100px", null, "92px", "140px"]) +
    '<div class="lst-foot"><div id="ausrcPager" style="flex:1"></div></div>' +
    /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL1（认证源接入与生效全流程）」。 */
    "</div></div>";
}
function auSrcDetail(s) {
  var _wp = { pg: AUW.pg };
  var wayRows = auSlice((s.ways || []).map(function (w, i) {
    var m = auMethod(w.mid);
    return "<tr><td><b>" + esc(auMethodName(w.mid)) + "</b></td>" +
      "<td>" + (m && m.srcBind ? '<span class="tag t-ok">抗钓鱼</span>' : '<span class="tag t-gray">—</span>') + "</td>" +
      '<td><select data-auact="wayLv" data-i="' + i + '" data-id="' + esc(w.mid) + '" aria-label="强度级别">' + [1, 2, 3, 4, 5].map(function (n) { return "<option" + (w.lv === n ? " selected" : "") + ">L" + n + "</option>"; }).join("") + "</select></td>" +
      '<td><input class="cov-inp" data-auact="wayScope" data-i="' + i + '" data-id="' + esc(w.mid) + '" aria-label="适用范围" value="' + esc(w.scope) + '" readonly title="适用范围（本源 × 本方式联合判定）· 取值域＝资产台账「资产分组」，点击设置"></td>' +
      '<td><label class="chip' + (w.anon ? " on" : "") + '" title="勾选＝该方式适用于无端（浏览器）接入；无端接入的判定与执行由无端网关承载，本源仅声明适用性"><input type="checkbox" data-auact="wayAnon" data-i="' + i + '" data-id="' + esc(w.mid) + '"' + (w.anon ? " checked" : "") + ">支持无端</label></td>" +
      '<td><button class="btn link" data-auact="wayDel" data-i="' + i + '" data-id="' + esc(w.mid) + '">移除</button></td></tr>';
  }), _wp).join("");
  AUW.pg = _wp.pg;
  /* ★ 2026-10-10（R13）：字段映射表页码只在**换源**时归 1 —— 在渲染入口无条件重置会让
     分页器自己的点击（renderAuSrc → 本函数）每点一次就跳回第 1 页。 */
  if (AUW.map.for !== s.id) { AUW.map.for = s.id; AUW.map.pg = 1; }
  var avail = AU_SRC_METHODS.filter(function (m) {
    return !(s.ways || []).some(function (w) { return w.mid === m.id; })
      && (AU.dict.methods || []).some(function (d) { return d.id === m.id; });
  });
  var conn = auMigrateConn(s.conn || auConnSeed("local", null, false, ""));
  s.conn = conn;
  /* ★ 2026-10-10（R13）：字段映射表此前**整张无分页器**（foot=False / pager=False），
     与本模块「有数据即有分页器（单页也渲染）」的口径冲突；映射字段数在 AD/OIDC/LDAP 常见 8~15 项，
     一旦增多就没有翻页入口。改为与同页「源 × 方式」表同体例：切片 + `.lst-foot` 分页器。 */
  /* ★ R61：字段映射表按**平台字段全集**呈现 —— 原实现只渲染 map 里已有条目，
     而种子（AD / OIDC / CA）仅落 4 项 ⇒ 详情表恒 4 行、看不出「共 6 字段、2 个未映射」，
     且与编辑弹窗的 6 字段清单不一致。改以全集为骨架、未映射补占位，附加 map 内的自定义字段。
     ★ R61（二）：**不涉及外部同步的源不渲染该表** —— 本地账号体系（sync.mode === "—"）无外部属性，
     按全集铺出 6 行全「未映射」是把「不适用」显示成「未配置」。 */
  var _mapSup = !(s.sync && String(s.sync.mode || "") === "—");
  var _mapKeys = ["账号名", "姓名", "邮箱", "部门", "岗位", "状态"];
  var _mapDic = {};
  ((s.sync && s.sync.map) || []).forEach(function (m) { _mapDic[m[0]] = m[1]; if (_mapKeys.indexOf(m[0]) < 0) _mapKeys.push(m[0]); });
  var syncMapAll = _mapSup ? _mapKeys.map(function (k) { return [k, _mapDic[k] == null ? "" : _mapDic[k]]; }) : [];
  /* ★ R61：映射表行数（全集骨架）在此确定 —— 分页器计数改读此处（原读 s.sync.map.length，
     种子只落 4 项 ⇒ 表体 6 行、分页器却报「4 条字段映射」，同一表两处口径不一致）。 */
  AUW.map.total = syncMapAll.length;
  var syncMap = syncMapAll.length
    ? idTbl(["平台字段", "外部来源属性"],
        auSlice(syncMapAll, AUW.map).map(function (m) {
          /* ★ 2026-10-10（R14）：判据不能只判「非空」—— 历史种子把**展示层缺省符** `—` 与
             「—（由管理员手工补录）」当成了外部属性名落库，非空 ⇒ 被渲成「已映射」，
             映射表因此虚报完整性。此处把这两类占位串显式判为**未映射**（与 srcMap 的
             「未映射落空串、不落『—』」注释同一口径）。 */
          var _mv = String(m[1] == null ? "" : m[1]).trim();
          var _isPh = (_mv === "—" || _mv.indexOf("—（") === 0);
          return "<tr><td>" + esc(m[0]) + "</td><td>" + (_mv && !_isPh
            ? '<span class="kr">' + esc(_mv) + "</span>"
            : '<span class="tag t-gray">未映射</span>') + "</td></tr>";
        }).join(""),
        ["160px", null]) +
      '<div class="lst-foot"><div id="ausrcMapPager" style="flex:1"></div></div>'
    : "";
  return idTitle("认证源配置 · " + s.name,
      "类型 " + esc(s.type) + " · 来源标注 <b>" + esc(s.tag) + "</b> · 状态 " + esc(s.st),
      '<div class="toolbar"><button class="btn" data-auact="srcList">← 返回列表</button>' +
      '<button class="btn" data-auact="srcEditAttr" data-id="' + s.id + '">编辑源属性</button>' +
      /* 「紧急撤销信任」只在**已启用**时出现（对未启用的源无可撤销的信任）；与「停用」是两个动作（见 FL1）。 */
      (s.st === "已启用" ? '<button class="btn danger" data-auact="srcRevoke" data-id="' + s.id + '">紧急撤销信任</button>' : "") +
      (s.st === "已停用" ? '<button class="btn" data-auact="srcDel" data-id="' + s.id + '">删除源</button>' : "") +
      /* ★ 2026-10-10（R11）：字典方式已全部引用时**不渲染**该入口 —— 「入口随数据出现」不止于挡点击：
         原实现按钮恒在，点开下拉只有「（字典中的方式均已引用）」，属无意义入口。 */
      (avail.length ? '<button class="btn primary" data-auact="srcAddWay" data-id="' + s.id + '">添加认证方式</button>' : "") + "</div>") +
    '<div class="card"><div class="card-h"><h3>源属性<span class="sub">展示与启用状态 · 决定登录页是否呈现</span></h3></div><div class="card-b">' +
      '<div class="kv" style="grid-template-columns:170px 1fr 170px 1fr">' +
      '<span class="k">展示名称</span><span class="mini">' + esc(s.name) + "</span>" +
      '<span class="k">类型</span><span class="mini">' + esc(s.type) + "</span>" +
      '<span class="k">启用状态</span><span class="mini">' + auStTag(s.st) + "</span>" +
      '<span class="k">展示顺序</span><span class="mini">' + esc(s.order) + "</span>" +
      '<span class="k">来源标注</span><span class="mini">' + esc(s.tag) + "</span>" +
      '<span class="k">说明</span><span class="mini">' + esc(s.desc) + "</span>" +
      "</div></div></div>" +
    '<div class="card"><div class="card-h"><h3>' + (conn.kind === "local" ? "账号与口令策略" : "连接参数") +
      '<span class="sub">' + (conn.kind === "local"
        ? "本地账号的口令与锁定规则 · 参数就地可改"
        : "对接外部身份源所需的参数 · 参数就地可改；口令与密钥加密存储、界面不回显明文") +
      '</span></h3></div><div class="card-b">' +
      auConnForm(conn) +
      '<div class="toolbar" style="margin-top:12px">' +
        '<button class="btn primary" data-auact="connSave" data-id="' + s.id + '">保存' + (conn.kind === "local" ? "账号与口令策略" : "连接参数") + "</button>" +
        (conn.kind === "local" ? "" : '<button class="btn" data-auact="srcTest" data-id="' + s.id + '">连通性测试</button>') +
        '<span class="mini" style="margin-left:8px">' +
          (conn.kind === "local" ? "本地账号体系<b>无外部连接</b>，不做连通性测试"
            : "上次测试：" + (conn.lastTest ? "<b>" + esc(conn.lastTest) + "</b>" : '<span class="tag t-gray">未测试</span>')) +
        "</span>" +
      "</div></div></div>" +
    '<div class="card"><div class="card-h"><h3>同步与映射<span class="sub">账号从哪来、字段怎么落</span></h3></div><div class="card-b">' +
      '<div class="kv" style="grid-template-columns:170px 1fr">' +
      '<span class="k">同步方式</span><span class="mini">' + esc(s.sync ? s.sync.mode : "—") + "</span>" +
      '<span class="k">同步说明</span><span class="mini">' + (s.sync ? s.sync.note : "—") + "</span>" +
      "</div>" +
      (syncMap ? '<div style="margin-top:12px">' + syncMap + "</div>" : "") +
      (s.sync && s.sync.mode === "—"
        ? ""
        : (s.sync && s.sync.mode === "登录时按需映射"
          ? ""
          : (s.sync && s.sync.mode === "未配置"
          ? '<div class="mini" style="margin-top:12px">同步方式<b>尚未配置</b> —— 请先用上方<b>「编辑源属性」</b>选定<b>同步方式</b>；配置后「立即同步」与「编辑字段映射」入口才可用。</div>'
          : '<div class="toolbar" style="margin-top:12px"><button class="btn" data-auact="srcSync" data-id="' + s.id + '">立即同步</button>' +
            '<button class="btn" data-auact="srcMap" data-id="' + s.id + '">编辑字段映射</button>' +
            '<span class="mini" style="margin-left:8px">上次同步：' + (s.sync && s.sync.last ? "<b>" + esc(s.sync.last) + "</b>" : '<span class="tag t-gray">从未同步</span>') + "</span></div>"))) +
            /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL1（认证源接入与生效全流程）」。 */
      "</div></div>" +
    '<div class="card"><div class="card-h"><h3>该源支持的认证方式<span class="sub">一对多 · 每条记录各自判定级别与适用范围</span></h3></div>' +
      '<div class="card-b">' +
      idTbl(["认证方式", "抗钓鱼（随方式）", "级别（联合判定）", "适用范围（联合判定）", '<span title="该方式是否适用于无端（浏览器）接入；无端接入的判定与执行由无端网关承载，本源仅声明适用性（口径同凭据托管「无端网关 / 有端 SDK 共用同一份托管与契约」）">无端支持</span>', "操作"],
        /* ★ 2026-10-10（R16）：原两列均为弹性（`null`）⇒ 剩余宽被等比平分，「认证方式」
           （实测 need 80px）白占 311px、「适用范围」（need 198px）同样只拿到 311px。
           收紧「认证方式」为定宽、余量全部归「适用范围」（唯一随数据变长的列）。 */
        wayRows || idEmptyRow(6, "该源尚未配置方式"), ["110px", "140px", "170px", null, "130px", "90px"]) +
      '<div class="lst-foot"><div id="ausrcWayPager" style="flex:1"></div></div>' +
      /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL1（认证源接入与生效全流程）」。 */
      "</div></div>" +
    '<div class="card"><div class="card-h"><h3>可选方式（取自字典）<span class="sub">字典是唯一取值域 · 本页只能引用、不能自造方式名</span></h3></div>' +
      '<div class="card-b"><div style="display:flex;flex-wrap:wrap;gap:6px">' +
      (avail.length ? avail.map(function (m) { return '<span class="tag t-gray">' + esc(m.name) + "（参考 L" + m.defLv + "）</span>"; }).join("") : '<span class="muted">字典中的方式均已引用</span>') +
      "</div>" +
      /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL1（认证源接入与生效全流程）」。 */
      "</div></div></div>";
}

/* ---------- 5. 页④ 用户代填账号托管（pg-auusercred） ---------- */
var AUU = { tab: "acct", cur: "", f: { k: "", mode: "", st: "" }, pg: 1 };
var AUI = { f: { k: "", kind: "", st: "" }, cur: "", sel: [], pg: 1 };
var AUR = { f: { k: "", lv: "", ctype: "", st: "" }, cur: "", pg: 1 };
/* 页④「表单契约（引用）」表与页② 详情「源 × 方式」表各自的分页状态 */
var AUF = { pg: 1 };
var AUW = { pg: 1, map: { pg: 1, for: null } };
/* ★ R61（轮6）：**页签角标取全集**。全站既定口径（见 30-websec.js
   凭据页签：角标取 CRED_LIST / CA_LIST / MTLS_LIST 全量常量，分页器与表内工具条才取筛后集）：
   页签角标表达「该页签有多少条记录」，不应随筛选漂移。
   原角标用 auUserCredFiltered() ⇒ 与同页「认证方式清单」角标（取 AU.dict.methods 全集）口径不一。 */
function auUserCredAll() { return ((AU.uc || {}).items || []); }
function auUserCredFiltered() {
  var f = AUU.f || {};
  return ((AU.uc || {}).items || []).filter(function (x) {
    if (f.k) {
      var hay = (x.asset + " " + x.owner + " " + x.acct + " " + (x.fill || "")).toLowerCase();
      if (hay.indexOf(String(f.k).toLowerCase()) < 0) return false;
    }
    if (f.mode && x.mode !== f.mode) return false;
    if (f.st && x.st !== f.st) return false;
    return true;
  });
}
/* ★ 2026-10-10（R25）：代填契约的**单一真源** = 资产「身份适配 → D 档」。
   页面自述「本页只读引用该契约」，但实现上每条托管记录自带一份副本
   （`ucNew` 亦以 `seed = dd` **复制**而非引用）⇒ 资产侧改契约本页不同步、两处口径漂移。
   此处统一取值：资产侧已配 D 档契约 ⇒ **以资产侧为准**；未配 ⇒ 回退本记录快照。
   `_src` 标注来源，供界面 / 探针区分。 */
function ucLoginOf(x) {
  var l = (x && x.login && typeof x.login === "object") ? x.login : {};
  try {
    if (typeof ASSETS !== "undefined" && ASSETS) {
      var a = ASSETS.filter(function (z) { return z.id === x.assetId; })[0]
           || ASSETS.filter(function (z) { return z.name === x.asset; })[0];
      if (a && a._adapt && a._adapt.d && a._adapt.d.url) {
        var d = a._adapt.d;
        return { url: d.url, urlAlt: d.urlAlt || "—", kind: d.kind || "单步（账号+密码同页）",
          userSel: d.userSel || "—", pwdSel: d.pwdSel || "—", submitSel: d.submitSel || "—",
          submit: d.submit || "自动提交", captcha: d.captcha || "无", verify: d.verify || "—",
          step2: d.step2, tested: l.tested || "未测试", fail: l.fail, _src: "asset" };
      }
    }
  } catch (e) { /* 忽略 */ }
  var lc = {};
  for (var k in l) { if (Object.prototype.hasOwnProperty.call(l, k)) { lc[k] = l[k]; } }
  lc._src = "snapshot";
  return lc;
}
function auUserCredPage() {
  var uc = AU.uc || { items: [], cfg: {} };
  var body = auSlice(auUserCredFiltered(), AUU).map(function (x) {
    var lg = ucLoginOf(x);
    var host = String(lg.url || "—").replace(/^https?:\/\//, "").split("/")[0];
    /* ★ 2026-10-09：本列只承载「登录入口」（host，一列一事实）。登录形态原被塞进同一格，
       与「表单契约（引用）」页签的「登录形态」列重复 ⇒ 移除。 */
    var _an = (ASSETS.filter(function (a) { return a.id === x.assetId; })[0] || {}).name || x.asset;
    return "<tr><td><b>" + esc(_an) + "</b></td>" +
      "<td>" + (x.mode === "用户自管" ? '<span class="tag t-info">用户自管</span>' : '<span class="tag t-gray">管理员托管</span>') + "</td>" +
      "<td>" + esc(x.owner) + "</td>" +
      '<td><span class="kr">' + esc(x.acct) + "</span></td>" +
      /* ★ 2026-10-10（R8）：host 是长 ASCII 串，原 break-all 在窄列里把它切成三行且断点
         落在字符中间（report.l / egacy.loc / al:8080）。改为**只在 `.` 与 `:` 处**给出断行
         机会（keep-all + <wbr>），断点落回语义边界；overflow-wrap:anywhere 仅作兜底。 */
      '<td><span class="mini" style="font-family:ui-monospace,Consolas,monospace;word-break:keep-all;overflow-wrap:anywhere">' + esc(host).replace(/\./g, ".<wbr>").replace(/:/g, "<wbr>:") + "</span></td>" +
      /* ★ 2026-10-10（R8）：原列直出「自动（字段特征库）」（自然宽 145px）在 88px 列里折
         3 行。改为**短标签 + 次行细则**两行结构（最宽 62px），列宽随之收到 92px，
         并让「填充方式」与引擎策略页的「默认填充方式」同名同义（原名「默认表单识别」）。 */
      "<td>" + (x.fill === "自定义选择器"
        ? '自定义<div class="mini" style="margin-top:2px">资产契约</div>'
        : '自动<div class="mini" style="margin-top:2px">字段特征库</div>') + "</td>" +
      "<td>" + auStTag(x.st) + "</td>" +
      "<td>" + esc(x.upd) + "</td>" +
      /* 按钮文案收短（配置契约 / 测试 / 撤销）—— 「去配置契约」「测试代填」「撤销托管」
         每个多 2 字的字数成本共 40px，是操作列 234px 的主要来源。 */
      '<td><span class="opgrp"><button class="btn link" data-auact="ucGotoFmt" data-id="' + x.id + '">配置契约</button>' +
      '<button class="btn link" data-auact="ucTest" data-id="' + x.id + '">测试</button>' +
      '<button class="btn link' + (x.mode === "用户自管" ? "" : " danger") + '" data-auact="ucDel" data-id="' + x.id + '">' + (x.mode === "用户自管" ? "撤销" : "删除") + "</button></span></td></tr>";
  }).join("");
  var c = uc.cfg || {};
  return idTitle("用户代填账号托管", "平台<b>代用户</b>保管被访问应用的登录账号 · 供<b>无感代填</b> · 凭据 <b>SM4 加密落库</b>",
      '<div class="toolbar"><button class="btn primary" data-auact="ucNew">新增托管账号</button></div>') +
    idRefNote("本页只承载<b>凭据本体</b>（存什么、怎么加密、谁能删）。<b>「该资产登录页长什么样、字段选择器怎么填」在「资产详情 → 身份适配」页签的 D 档</b>配置 —— 代填是资产身份适配四档之一。<b>凭据面与配置面分开</b>，同一对象不在两处配。") +
    /* ★ 2026-10-10（R12）：补 tablist / tab / tabpanel 语义（范式同动态防护 `#dpOvTabs`）。 */
    '<div class="tabs" id="auucTabs" role="tablist">' +
      '<button type="button" role="tab" id="auucTabsTab_acct" aria-controls="auucPanel_acct" aria-selected="' + (AUU.tab === "acct" ? "true" : "false") + '" data-aut="acct" class="' + (AUU.tab === "acct" ? "on" : "") + '">托管账号<span class="num">' + auUserCredAll().length + "</span></button>" +
      '<button type="button" role="tab" id="auucTabsTab_fmt" aria-controls="auucPanel_fmt" aria-selected="' + (AUU.tab === "fmt" ? "true" : "false") + '" data-aut="fmt" class="' + (AUU.tab === "fmt" ? "on" : "") + '">表单契约（引用）</button>' +
      '<button type="button" role="tab" id="auucTabsTab_eng" aria-controls="auucPanel_eng_a auucPanel_eng_b" aria-selected="' + (AUU.tab === "eng" ? "true" : "false") + '" data-aut="eng" class="' + (AUU.tab === "eng" ? "on" : "") + '">引擎策略与安全基石</button></div>' +
    '<div class="card tbp' + (AUU.tab === "acct" ? " on" : "") + '" role="tabpanel" id="auucPanel_acct" aria-labelledby="auucTabsTab_acct"><div class="card-h"><h3>托管账号清单<span class="sub">两种模式：用户自管 / 管理员托管</span></h3>' +
      /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL2（凭据全生命周期全流程）」。 */
      '<div class="card-b">' +
      '<div class="toolbar" style="margin-bottom:12px">' +
        '<div class="input-w"><input type="search" id="auucK" placeholder="搜索应用 / 账号 / 归属" aria-label="搜索托管账号" style="width:240px" value="' + esc(AUU.f.k) + '"><i>搜索</i></div>' +
        '<select id="auucMode" aria-label="筛选托管模式"><option value="">全部托管模式</option>' +
          ["用户自管", "管理员托管"].map(function (o) { return "<option" + (AUU.f.mode === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
        "</select>" +
        '<select id="auucSt" aria-label="筛选托管账号状态"><option value="">全部状态</option>' +
          ["已托管", "待配契约", "代填失败"].map(function (o) { return "<option" + (AUU.f.st === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
        "</select>" +
      "</div>" +
      idTbl(["被访问应用", "托管模式", "账号归属", "账号", "登录入口", "填充方式", "状态", "最近更新", "操作"],
        /* ★ 2026-10-10（R8）重分配：原弹性列是「被访问应用」，但页④ **唯一变长 ASCII 串**是
           「登录入口」的 host（最长 25 字符 = 193px），弹性宽度给首列反而让它恒定折 3 行。
           实测（1280 视口，`_probe_r8_layout.py`）：首列自然宽 132 / 登录入口 193 / 填充方式 145。
           ⇒ ① 首列改**定宽 132**（单行）；② 弹性列移到「登录入口」；
              ③ 「填充方式」改短标签 + 次行细则后自然宽 91 ⇒ 列宽 92；
              ④ 操作列按钮文案缩短（配置契约 / 测试 / 撤销·删除）后自然宽 168 ⇒ 列宽 172
                 （原 234px 中 40px 是「去配置契约 / 测试代填 / 撤销托管」的字数成本）。
           结果：9 列 1280 下合计 896 定宽 + 登录入口 143px，最长 host 断点落在 `.` 语义边界、≤2 行。 */
        body || ((AUU.f.k || AUU.f.mode || AUU.f.st) ? emptyRowBtn(9, "没有符合条件的托管账号", "data-auact", "auucClearF") : idEmptyRow(9, "暂无托管账号")), ["132px", "108px", "80px", "114px", null, "92px", "96px", "102px", "172px"]) +
      '<div class="lst-foot"><div id="auucPager" style="flex:1"></div></div>' +
      /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL2（凭据全生命周期全流程）」。 */
      "</div></div>" +
    '<div class="card tbp' + (AUU.tab === "fmt" ? " on" : "") + '" role="tabpanel" id="auucPanel_fmt" aria-labelledby="auucTabsTab_fmt"><div class="card-h"><h3>表单契约（引用）<span class="sub">契约按资产维度配置 · 本页只读引用</span></h3>' +
      /* ★ 2026-10-10（R12）：入口随数据出现 —— 此前只看「有没有这个页签」，筛无结果时
         按钮仍可点，点了才由确认框告知「全部 0 个资产」，属「点得动、点了才知道没意义」。
         口径对齐页⑤ 批量吊销：**保留入口、0 项置灰**（不藏按钮，藏了会被读成「本页没有这个功能」）。 */
      '<div class="toolbar">' + (auUserCredFiltered().length
        ? '<button class="btn" data-auact="ucTestAll">批量测试全部（' + auUserCredFiltered().length + "）</button>"
        : '<button class="btn" data-auact="ucTestAll" disabled title="当前无可测的账号契约（新增凭据后启用）">批量测试全部</button>') +
      '<span class="mini" style="margin-left:8px">最近测试：<b>' + esc(c.tested || "—") + '</b></span></div></div><div class="card-b">' +
      /* ★ 2026-10-10（R16）：页④ 的搜索 / 筛选控件只在「托管账号」页签渲染，而过滤状态
         （AUU.f）是**页级共享**的 —— 切到本页签时表体已按筛选收敛，页面上却看不到条件、
         也无处清除，会被读成「契约本来就只有这些」。此处显式告知并给清除入口。 */
      (function () {
        if (!(AUU.f.k || AUU.f.mode || AUU.f.st)) return "";
        var _bits = [];
        if (AUU.f.k) _bits.push("搜索「" + esc(AUU.f.k) + "」");
        if (AUU.f.mode) _bits.push("托管模式「" + esc(AUU.f.mode) + "」");
        if (AUU.f.st) _bits.push("状态「" + esc(AUU.f.st) + "」");
        return '<div class="mini" style="margin-bottom:8px">当前筛选（' + _bits.join(" · ") +
          '）对本页生效，命中 <b>' + auUserCredFiltered().length + '</b> 条 · <button type="button" class="btn link" data-auact="auucClearF">清除筛选</button></div>';
      })() +
      idRefNote("代填契约（登录页地址 / 字段选择器 / 两步 / 提交方式 / 验证判据）<b>归属资产维度</b> —— 同一资产的登录页形态对所有用户只有一份，故配在资产侧「身份适配 → D 档 · 账号密码代填」。" +
        "本页<b>只读引用</b>该契约：改契约请到对应资产的详情页。<b>未配置契约的资产不执行代填</b>，直接回退手动登录。") +
      /* ★ 2026-10-10（R13）：本表由「10 列裸表 `.spec-tbl`」重构为「7 列 `.lst` 定宽表 + 契约明细副行」。
         原布局下三个选择器列各需 263px、可用仅 1039px（need 合计 1844）⇒ 选择器被逐字符断成 8 行、
         「提交方式」列被压成 2 字/行竖排；且页面自述的契约组成之一「验证判据」**没有列**
         （种子有值、`idRefNote` 与引擎工作链都写了它，列表却整列丢失）。处置：
         ① 三个选择器 + 登录成功判据收进**整行宽的明细副行**（不再各占一列）；
         ② 主表回归全站 `.lst` 定宽基线（与资产 / 安全策略各表同视觉语言）；
         ③ 「最近测试」列按**结果**着色（日期一律判绿的缺陷见下）；④ 副行断点落语义边界。 */
      (function () {
        var _fh = ["被访问应用", "登录页地址", "登录形态", "提交方式", "验证码", "最近测试", "操作"];
        /* 唯一弹性列＝「登录页地址」（URL 长度随资产变化）；其余定宽合计 **824**。
           ⚠ 2026-10-10（R14）实测：原「登录形态」120px（need 168）与「验证码」120px（need 171）
           装不下本身取值，中文词组被挤成 2 行，而弹性列在 1440 下余白 122px —— 属**列宽预算错配**，
           非宽度不足（定宽合计 706 < 可用 1039，本就有余量）。按实测 need 重新配平为
           136 / auto / 176 / 100 / 180 / 104 / 128（合计 824），留出 auto ≈ 215px@1280、≈ 327px@1440，
           并保持页内横滚为 0。 */
        var _fc = ["136px", null, "176px", "100px", "180px", "104px", "128px"];
        var _frows = auSlice(auUserCredFiltered(), AUF);
        if (!_frows.length) {
          return idTbl(_fh, ((AUU.f.k || AUU.f.mode || AUU.f.st) ? emptyRowBtn(7, "没有符合条件的表单契约", "data-auact", "auucClearF") : idEmptyRow(7, "暂无表单契约 · 契约按资产维度配置，本页只读引用")), _fc);
        }
        return idTbl(_fh, _frows.map(function (x) {
          var lg = ucLoginOf(x);
          var _an2 = (ASSETS.filter(function (a) { return a.id === x.assetId; })[0] || {}).name || x.asset;
          var _sels = [];
          if (lg.userSel) _sels.push("账号 " + esc(lg.userSel));
          if (lg.pwdSel) _sels.push("密码 " + esc(lg.pwdSel));
          if (lg.submitSel) _sels.push("提交 " + esc(lg.submitSel));
          /* 着色判据按**结果**（原「tested === '未通过'」⇒ 只要 tested 是日期就一律判绿，
             种子 uc_03 的失败契约被渲成通过色）；失败时 title 回显原因，日期降为次行。 */
          var _badc = !!lg.fail || lg.tested === "未通过";
          return "<tr><td><b>" + esc(_an2) + "</b></td>" +
            '<td><span class="mini" style="font-family:ui-monospace,Consolas,monospace;word-break:keep-all;overflow-wrap:anywhere">' + esc(lg.url || "—").replace(/\./g, ".<wbr>").replace(/:/g, "<wbr>:") + "</span>" +
              (lg.urlAlt && lg.urlAlt !== "—" ? '<div class="mini" style="opacity:.7">备用：' + esc(lg.urlAlt).replace(/\./g, ".<wbr>").replace(/:/g, "<wbr>:") + "</div>" : "") + "</td>" +
            "<td>" + esc(lg.kind || "—") + "</td>" +
            "<td>" + esc(lg.submit || "—") + "</td>" +
            "<td>" + esc(lg.captcha || "—") + "</td>" +
            "<td>" + (!lg.tested || lg.tested === "未测试"
              ? '<span class="muted">未测试</span>'
              : '<span class="tag ' + (_badc ? "t-err" : "t-ok") + '"' + (_badc && lg.fail ? ' title="' + esc(lg.fail) + '"' : "") + ">" + (_badc ? "未通过" : "通过") + "</span>" +
                (lg.tested === "未通过" ? "" : '<div class="mini">' + esc(lg.tested) + "</div>")) + "</td>" +
            '<td><button class="btn link" data-auact="ucTest" data-id="' + x.id + '">测试</button>' +
              '<button class="btn link" data-auact="ucGotoFmt" data-id="' + x.id + '">配置契约</button></td></tr>' +
            ((_sels.length || lg.verify)
              ? '<tr><td colspan="7" class="mini" style="background:rgba(37,99,235,.04);color:#334155;word-break:keep-all;overflow-wrap:anywhere">' +
                (_sels.length ? "↳ <b>字段选择器</b>：" + _sels.join(" · ") : "") +
                (lg.verify ? (_sels.length ? "<br>" : "↳ ") + "<b>登录成功判据</b>：" + esc(lg.verify) : "") + "</td></tr>"
              : "") +
            (lg.kind && lg.kind.indexOf("多步") === 0 && lg.step2
              ? '<tr><td colspan="7" class="mini" style="background:rgba(37,99,235,.05);color:#1d4ed8">↳ <b>跳转后页面</b>：' +
                esc(lg.step2.url || "—") + " · 账号 " + esc(lg.step2.userSel || "—") + " · 密码 " + esc(lg.step2.pwdSel || "—") + " · 提交 " + esc(lg.step2.submitSel || "—") + "</td></tr>"
              : "") +
            (lg.fail ? '<tr><td colspan="7" class="mini" style="background:rgba(220,38,38,.06);color:#b91c1c">⚠ ' + esc(lg.fail) + "</td></tr>" : "");
        }).join(""), _fc);
      })() +
      '<div class="lst-foot"><div id="auucFmtPager" style="flex:1"></div></div>' +
      /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL2（凭据全生命周期全流程）」。 */
      "</div></div>" +
    '<div class="card tbp' + (AUU.tab === "eng" ? " on" : "") + '" role="tabpanel" id="auucPanel_eng_a" aria-labelledby="auucTabsTab_eng"><div class="card-h"><h3>代填引擎策略<span class="sub">引擎级默认值 · 未配置契约的资产不执行代填</span></h3></div><div class="card-b">' +
      '<div class="kv" style="grid-template-columns:170px 1fr 170px 1fr">' +
      '<span class="k">启用范围</span><span class="mini">' + esc(c.scope) + "（无端网关 / 有端 SDK 共用同一份托管与契约）</span>" +
      '<span class="k">默认填充方式</span><span class="mini">' + esc(c.form) + "</span>" +
      '<span class="k">默认登录形态</span><span class="mini">' + esc(c.defaultKind) + "</span>" +
      '<span class="k">默认提交方式</span><span class="mini">' + esc(c.defaultSubmit) + "</span>" +
      '<span class="k">验证码策略</span><span class="mini">' + esc(c.captcha) + "（不承诺全免密；识别失败即转人工）</span>" +
      '<span class="k">凭据绑定范围</span><span class="mini">' + esc(c.bind) + "（一条凭据绑定一个访问主体）</span>" +
      '<span class="k">代填失败动作</span><span class="mini">' + esc(c.fail) + "（并记录代填失败事件）</span>" +
      "</div>" +
      /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL2（凭据全生命周期全流程）」。 */
      "</div></div>" +
    '<div class="card tbp' + (AUU.tab === "eng" ? " on" : "") + '" role="tabpanel" id="auucPanel_eng_b" aria-labelledby="auucTabsTab_eng"><div class="card-h"><h3>凭据托管安全基石</h3></div><div class="card-b">' +
      '<div class="kv" style="grid-template-columns:170px 1fr">' +
      '<span class="k">加密存储</span><span class="mini">国密 <b>SM4</b> 加密落库，凭据列密文存储</span>' +
      '<span class="k">密钥管理</span><span class="mini">内置轻量 KMS，主密钥独立存放 + 数据加密密钥（DEK）两级架构，算法全为国密</span>' +
      '<span class="k">解密边界</span><span class="mini">解密<b>仅在执行代填的组件内存</b>进行（无端＝网关、有端＝SDK）；有端 SDK <b>不保存任何凭据（含加密态）</b>，每次代填<b>实时向服务端请求</b>、内存解密、<b>用毕即销毁</b></span>' +
      '<span class="k">下发接口</span><span class="mini">双重校验（<b>会话有效</b> + <b>调用方可信</b>），并做频率限制与全量审计</span>' +
      '<span class="k">轮换</span><span class="mini">支持凭据轮换与主密钥轮换，过程平滑</span>' +
      "</div>" +
      /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL2（凭据全生命周期全流程）」。 */
      "</div></div>";
}

/* 日期辅助（认证模块演示基准日取 AU_TS_STAMP，页⑤ 新记录的 issued / exp 与它同源）。
   ★ 2026-09-30 第一轮评审修复：此前「短时有效期（分钟）」被收集后**从不参与落库**
   （exp 一律取 #isExp，其默认值由基准日派生），且轮换用 `.replace(/^20(\d\d)/,"20$1")`
   这类**恒等替换** ⇒ 新旧凭据同到期，「轮换」失去意义。此处提供两个纯函数供两处复用。 */
function auPlusMinutes(base, min) {
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(base || ""));
  if (!m || !(parseInt(min, 10) > 0)) return "";
  var d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  d.setMinutes(d.getMinutes() + parseInt(min, 10));
  var p = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function auPlusYears(base, n) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(base || ""));
  if (!m) return "";
  return (parseInt(m[1], 10) + n) + "-" + m[2] + "-" + m[3];
}
/* 「绑定主体标识」原是序列号列（种子如 BZPC-0007-3A2C），但新签发记录曾把
   holder 里的**客户端名**（如「白泽客户端（PC）」）写进该列 ⇒ 列语义错位、不可回溯。
   ★ 2026-09-30 第一轮评审修复：改为按持有主体反查客户端实例的**序列号** cidseq；
   查不到时才回落到旧行为（客户端名），不做静默丢失。 */
/* 「终端序列号」= 该主体所在**终端的设备序列号**（身份模块「终端管理」页的 sn）。
   ⚠ 2026-10-10（R8）列名订正：原名「终端指纹」与 X.509 的**证书指纹**同名不同物 ——
     本列是终端**设备序列号**，与证书指纹零关系，会同屏并列（页⑤ 签发 CA · 终端序列号）更易误读。
   与「绑定主体标识」同为**派生事实**、不在弹窗内填写：签署与事后追溯时用于核对
   「这份凭据确实签给了这台设备」。
   ⚠ 不取客户端软件的 sn（那是**软件**维度的序列号，与设备不同源）；
     与 `cnOf` 一样按持有主体反查，查不到返回空串、由渲染侧自然省略该段。 */
function fpOf(holder) {
  var h = String(holder || "");
  /* ★ 2026-10-10（R18）：原先按 `h.indexOf(终端名) >= 0` 做**子串**匹配 —— 两个终端名互为前缀时
     （如「科技管理部-张伟-PC」与「科技管理部-张伟-PC2」）会命中**先遍历到的**那个，
     终端序列号张冠李戴（签署与事后追溯核对「这份凭据签给了哪台设备」会打错对象）。
     改为经 `auHolderRef()` 做**全等**解析后再取该主体的终端 sn —— 与跨模块回写同一处标签构造，
     杜绝同族两套匹配口径（R17 已把 `auHolderRef` 定为全等；此处补齐另两个消费点）。 */
  try {
    var ref = auHolderRef(h);
    if (ref && ref.obj && typeof ID !== "undefined" && ID && ID.terms) {
      for (var i = 0; i < ID.terms.length; i++) {
        if (ID.terms[i].id === ref.obj.term) return ID.terms[i].sn || "";
      }
    }
  } catch (e) { /* 身份数据未装载：返回空串，不抛错 */ }
  return "";
}
function cnOf(holder) {
  var h = String(holder || "");
  /* ★ 2026-10-10（R18）：原先按 `h.indexOf(标签) >= 0` 做**子串**匹配 —— 两个主体名互为前缀时
     （如「探针-终端ABC」与「探针-终端ABC2」）会命中**先遍历到的**那个，绑定主体标识张冠李戴：
     该标识直接写进新签发 / 轮换凭据的 `cn` 并渲染为「绑定主体标识」列，网关比对与按主体追溯
     都会打错对象。改为复用 `auHolderRef()` 的**全等**解析（与跨模块回写同一处标签构造），
     两条路径不再各写一份匹配口径。 */
  try {
    var ref = auHolderRef(h);
    if (ref && ref.kind === "cin") return (ref.obj && ref.obj.cidseq) || "—";
    /* ★ 智能体实例必须有自己的分支：否则「智能体实例 · 代码助手 Agent @ …」落到下面的
       泛化回落，绑定主体标识退化成**软件名**（代码助手 Agent）—— 那是软件维度的名字，
       不是实例标识，按主体吊销 / 追溯都会打错对象。 */
    if (ref && ref.kind === "ain") {
      /* ⚠ 不得返回其凭据号：短时凭据每 30 分钟续发一次，用它当「绑定主体标识」
         会让该列随每次续发而变，标识失去稳定性、按主体追溯也会打错对象。
         智能体自己不持证书、其可追溯标识＝**宿主客户端实例的序列号 cidseq**
         （与身份模块「智能体实例管理」页展示的「宿主客户端实例（cidseq）」同源）。 */
      var hAi = null;
      if (typeof ID !== "undefined" && ID && ID.cin) {
        for (var k = 0; k < ID.cin.length; k++) {
          if (ID.cin[k].id === ref.obj.host) { hAi = ID.cin[k]; break; }
        }
      }
      return (hAi && hAi.cidseq) || ref.obj.id || "—";
    }
  } catch (e) { /* 忽略：身份模块状态不可用时不阻断签发 */ }
  var hs = h.split(" · ");
  return (hs[1] || "").split("@")[0].trim() || "—";
}

/* --- 跨模块回写：认证侧 → 身份侧（R17） ------------------------------------------------
   吊销已按 `no` **单向**回写身份侧（R16-A12：`ID.cin[].lic[].tag` / `ID.ain[].cred.st`），
   而**签发与轮换只落本页台账** ⇒ 新签出的凭据在身份侧「实例」页看不见：
     · 「客户端实例」详情的 License 历史缺最新一份；
     · 「智能体实例」的当前短时凭据仍是上一份（`cred` 不更新 ⇒ 运行状态按过期的判、判错）。
   X1 轮曾把两侧一次性对齐 10 份，运行时又被拉开 —— 根因就是「回写只有单向」。
   此处补齐方向：按 `holder` 反查身份对象后按对象类型回写（身份侧无此对象则静默跳过）。 */
function auHolderRef(holder) {
  var h = String(holder || "");
  try {
    if (typeof ID !== "undefined" && ID && ID.cin) {
      for (var i = 0; i < ID.cin.length; i++) {
        var c = ID.cin[i];
        var cn1 = "客户端实例 · " + idName(ID.csw, c.sw, "id", "name") + " @ " + idName(ID.terms, c.term, "id", "name");
        if (h === cn1) return { kind: "cin", obj: c };
      }
    }
    if (typeof ID !== "undefined" && ID && ID.ain) {
      for (var j = 0; j < ID.ain.length; j++) {
        var g = ID.ain[j];
        var cn2 = "智能体实例 · " + idName(ID.asw, g.asw, "id", "name") + " @ " + idName(ID.terms, g.term, "id", "name") + "（进程 " + g.pid + "）";
        if (h === cn2) return { kind: "ain", obj: g };
      }
    }
  } catch (e) { /* 身份数据未装载：返回 null，只落本页台账 */ }
  return null;
}
function auBackfillIdentity(o) {
  if (!o) return;
  try {
    var ref = auHolderRef(o.holder); if (!ref) return;
    if (ref.kind === "cin") {
      /* License 证书侧**留历史**：新份追加、旧份保留（由有效期自行派生为「已过期」）。
         ⚠ **不得**再写一个「当前」：身份侧 idLicTagOf() 按日期派生「当前 / 待生效 / 已过期」，
           列表取当前份是 `filter(tag==="当前")[0]`（取**首个**）；轮换时旧份仍在册且派生为「当前」，
           若继任者也写「当前」⇒ 并列出两个「当前」，[0] 取到**旧份**、新份反而不可见。
         ⇒ 继任者顺延为**在册当前份到期日次日生效**（与身份侧 licRotate 口径一致），标签写「待生效」；
           无在册当前份时（如「先吊销再签发」）才写 `issued=o.issued / tag="当前"`（保持原行为）。
         `tag` 在身份侧只承载**显式态**（idLicTagOf 仅读「已吊销」），写「待生效」仅为可读性与体例一致。 */
      var cc = ref.obj; cc.lic = cc.lic || [];
      var icur = (cc.lic || []).filter(function (l) {
        return typeof idLicTagOf === "function" ? idLicTagOf(l) === "当前" : l.tag === "当前";
      })[0];
      if (icur) {
        var sIss = (typeof idYmdShift === "function" && icur.exp) ? idYmdShift(icur.exp, 1, 0) : o.issued;
        cc.lic.push({ id: "lic_" + Date.now().toString(36), no: o.no, issued: sIss, exp: o.exp, tag: "待生效", ca: o.ca, scope: o.scope });
      } else {
        cc.lic.push({ id: "lic_" + Date.now().toString(36), no: o.no, issued: o.issued, exp: o.exp, tag: "当前", ca: o.ca, scope: o.scope });
      }
    } else {
      /* 智能体短时凭据侧**只认当前份**（身份侧 cred 是单值，与「续发即失效」同语义）：
         整体替换而非追加 —— 顺带清掉上一份可能残留的 `cred.st:"已吊销"`。
         ⚠ **不得** delete 实例自身的 `st`：那是「已终止」，删掉会把已终止实例复活。 */
      ref.obj.cred = { no: o.no, issued: o.issued, exp: o.exp };
    }
    /* ⚠ 回写的是**身份侧**数据（ID.cin / ID.ain 各有自己的持久化键）—— 不落 `idSave()` 的话
       本次改动只活在内存里，跳到身份页 / 刷新即被 `idLoad()` 从本地存档覆盖回去（回写形同虚设）。
       与 `isRevoke` / 批量吊销两处回写同体例（那两处也已调 idSave）。 */
    if (typeof idSave === "function") idSave();
  } catch (e2) { /* 身份模块状态不可用时不阻断签发 */ }
}

/* ---------- 6. 页⑤ 签发凭据管理（pg-auissue） ---------- */

/* 签发凭据的状态由**有效期**推出，不写死 —— CA / mTLS 侧早有 credExpSt 兜底，
   本页此前全程没有，于是出现「已过期仍显示有效」「有效期未到却写死已过期」两种不自洽。
   ⚠ 时钟取认证模块统一运行时刻 AU_TS_STAMP，**不取**资产模块的全站基准日 nowD()
     （★ R61·轮8 起两者已同源：全站基准日 nowD() = AU_TS_STAMP 的日期部分；本页仍取 AU_TS_STAMP
     是为保持认证模块内「现在」的单一出处，与 30-websec / 40-identity 同理）。
   ⚠ 粒度分两档：短时凭据的 exp 带时分（本就以分钟计），只有「有效 / 已过期」两态；
     证书类按日粒度，沿用与 web 侧 credExpSt 相同的 30 天预警窗口。 */
/* ★ 2026-10-10（R33 · X-2 单源化）：台账中「客户端 License 证书」类条目的**业务值以身份模块为唯一真源**。
   此前认证段 `is_*` 与身份段 `cin[].lic[]` 各存一份同号同值副本 ⇒ 改一侧即漂移（X1 轮曾一次性对齐，
   运行期又被拉开）。本函数在装载后按编号把身份侧的 签发日 / 到期日 / 签发 CA / 授权范围 / 绑定主体标识
   覆盖到台账同号条目，并**实时重建持有主体**（身份侧改软件名 / 改终端即自动跟随，
   不再依赖 auHolderRef 的字符串全等匹配 —— 那条链路在身份侧改名后必然静默失配）。
   身份侧缺失的编号在此**不补登**：补登属签发流程职责（见 idRegisterAuthLic 回写）。 */
function auSyncIssueFromId() {
  try {
    if (typeof ID === "undefined" || !ID || !Array.isArray(ID.cin)) return;
    var idx = {}, aidx = {};
    /* ★ R55（上下文-2）：智能体短时凭据的 `holder` 亦须按身份侧现算 —— 身份侧「智能体软件名称」
       可改（agswEdit），此前该类条目的 holder 只在种子里固化 ⇒ 改名后身份侧示新名、认证侧示旧名。
       仅同步**当前份**（身份侧 `ain[].cred` 是单值）；历史份保持当时留痕。 */
    (ID.ain || []).forEach(function (g) {
      if (!g || !g.cred || !g.cred.no) return;
      aidx[g.cred.no] = "智能体实例 · " + idName(ID.asw, g.asw, "id", "name") + " @ " + idName(ID.terms, g.term, "id", "name") + "（进程 " + g.pid + "）";
    });
    (ID.cin || []).forEach(function (c) {
      var holder = "客户端实例 · " + idName(ID.csw, c.sw, "id", "name") + " @ " + idName(ID.terms, c.term, "id", "name");
      var fp = "";
      for (var i = 0; i < (ID.terms || []).length; i++) { if (ID.terms[i].id === c.term) { fp = ID.terms[i].sn || ""; break; } }
      (c.lic || []).forEach(function (l) {
        /* ★ R53（存-6 取舍）：**取消「待生效」跳过** —— 该份是「已签发、生效日在未来」的真实凭据
           （身份侧可对其吊销），排除它会使两侧台账对同一编号一有一无；改为一并入索引，
           状态由 `auIssueSt(exp, issued)` 派生为「待生效」。 */
        idx[l.no] = { holder: holder, fp: fp, cn: c.cidseq || "", lic: l };
      });
    });
    (AU.issue || []).forEach(function (x) {
      if (x.kind === "智能体短时凭据") { if (aidx[x.no]) x.holder = aidx[x.no]; return; }   /* ★ R55（上下文-2） */
      if (x.kind !== "客户端 License 证书") return;
      var hit = idx[x.no];
      if (!hit) return;
      x.holder = hit.holder; x.fp = hit.fp; x.cn = hit.cn;
      x.issued = hit.lic.issued; x.exp = hit.lic.exp; x.ca = hit.lic.ca;
      x.scope = hit.lic.scope;
      /* ★ R53（C-F1）：**先认身份侧终态** —— 「已吊销」是显式终态（身份侧 `idLicTagOf` 以
         `l.tag === "已吊销"` 优先于有效期派生）。此前此处无条件按 exp 重算，会把身份侧已吊销、
         认证侧已置「已吊销」的同号凭据（isRevoke 两侧同写）**翻转回「有效」**，且随后
         `auIssueNormalize` 的终态保护判据 `x.st === "已吊销"` 已被改写而失效 —— 冷启动即复现。 */
      x.st = (hit.lic.tag === "已吊销")
        ? "已吊销"
        : (typeof auIssueSt === "function" ? auIssueSt(x.exp, x.issued) : x.st);
    });
  } catch (e) { /* 身份段未就绪：保持种子值，不阻断认证模块独立演示 */ }
}
function auIssueNow() { return new Date(AU_TS_STAMP.replace(" ", "T") + ":00"); }
function auIssueSt(exp, issued) {
  /* ★ R53（存-6 取舍）：**有效性轴补第 4 档「待生效」** —— 原实现只按 exp 派生（有效 / 即将过期 /
     已过期），一份「生效日晚于基准日」的换发衔接件（身份侧标「待生效」、且可被吊销）在此被算成
     「有效」，同一编号两侧给出相反结论。判据与身份侧 `idLicTagOf` 同口径（issued > 今天）。
     issued 缺省时保持原行为 —— 老缓存 / 无该字段的记录不误判。 */
  var i0 = String(issued || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(i0) && i0 > String(AU_TS_STAMP).slice(0, 10)) return "待生效";
  var s = String(exp || "").trim();
  var d, isShort = false;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) { d = new Date(s.replace(" ", "T") + ":00"); isShort = true; }
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { d = new Date(s + "T00:00:00"); }
  else { return "有效"; }
  if (isNaN(d.getTime())) return "有效";
  var mins = Math.round((d - auIssueNow()) / 60000);
  if (mins <= 0) return "已过期";
  if (isShort) return "有效";
  if (mins <= 60 * 24 * 30) return "即将过期";
  return "有效";
}
/* 归一化：交 AuLoad 调用。⚠「已吊销」是终态，不被有效期覆盖。 */
function auIssueNormalize() {
  (AU.issue || []).forEach(function (x) {
    if (x.st === "已吊销") return;
    x.st = auIssueSt(x.exp, x.issued);   /* ★ R53（存-6）：须带 issued，否则「待生效」被重算回「有效」 */
  });
}

/* 归一化：RP ID 是平台统一作用域 ⇒ 已存记录一律收敛为平台常量（旧档里逐记录手填的域名叫各不同，
   会在「登记在哪台设备、属哪个级别」之外多出一个无从解释的差异维度）。交 auLoad 调用。 */
function auAuthrNormalize() {
  (AU.authr || []).forEach(function (x) { x.rpid = AU_RP_ID; });
}
function auIssueFiltered() {
  var f = AUI.f || {};
  return (AU.issue || []).filter(function (x) {
    if (f.k) {
      var hay = (x.holder + " " + x.no + " " + x.kind).toLowerCase();
      if (hay.indexOf(String(f.k).toLowerCase()) < 0) return false;
    }
    if (f.kind && x.kind !== f.kind) return false;
    if (f.st && x.st !== f.st) return false;
    return true;
  });
}
function auIssuePage() {
  var rows = auIssueFiltered();
  var sel = AUI.sel || (AUI.sel = []);
  /* 勾选 / 全选 / 批量一律限定「当前页可见行」（同 aspPg 口径）。 */
  var pageRows = auSlice(rows, AUI);
  var body = pageRows.map(function (x) {
    var on = sel.indexOf(x.id) >= 0;
    /* ★ 2026-10-10（R8·§M.4 裁决二）：原判据 st === "有效" 把**仍处生效态的「即将过期」**
       排除在所有吊销路径之外（既不可勾选、行内亦无「吊销」按钮）—— 生效态却不可操作。
       判据改为**非终态即可吊销**：终态＝已过期 / 已吊销（吊销一份已失效凭据无意义）。 */
    var canSel = x.st !== "已过期" && x.st !== "已吊销";
    return "<tr>" +
      '<td class="cell-sel">' + (canSel ? '<input type="checkbox" aria-label="勾选凭据 ' + esc(x.no) + '" data-auact="isPick" data-id="' + x.id + '"' + (on ? " checked" : "") + ">" : "") + "</td>" +
      /* ★ 2026-10-10（R9）：列内文案原为「License 证书 / 短时凭据」，与筛选、弹窗的
         「客户端 License 证书 / 智能体短时凭据」**同名不同写法**。主体维已由「持有主体」列完整
         表达 ⇒ 列内保持短标签（全名会超出列宽）、以 title 给全名，hover 可得正式名。 */
      "<td>" + (x.kind === "客户端 License 证书"
        ? '<span class="tag t-info" title="客户端 License 证书">License 证书</span>'
        : '<span class="tag t-gray" title="智能体短时凭据">短时凭据</span>') + "</td>" +
      /* ★ 2026-10-10（R12k/R12m/R12n）：副行原为**换行块**，与主名叠加把行高从 ~100px 顶到 140px
         （`_diag_r12_aui_h.py` 逐行盒取证）；行高由副行自身换行决定、与列宽无关。
         ⚠ R12k 用 `nowrap + overflow:hidden` 压单行 ⇒ 触发渲染门禁「单元格右溢出」：
           Range 片段 rect **不受祖先 overflow:hidden 裁切**（`_diag_r12_cellover.py` 实测
           片段宽 335px、range.right 超 td.right 153px）—— 靠裁切掩盖溢出不算数。
         ⚠ R12m 改自然折行后行高恰为 **120px**（A14 阈上限），**零余量**且随序列号长度浮动。
         ⇒ 现：副行**定长截断为单行**（序列号前 8 位 + `…`），行高与序列号长度解耦；
           可见副行只留 `终端序列号`（短时凭据行的追溯判据，`_probe_r8_fixes` F4 要求该词可见）；
           全量（含 `签发 CA`）在单元格 `title` 内 —— 与同表「类型」列「短标签 / 全名 hover」同范式。 */
      '<td class="cell-cov"' + ((x.ca || x.fp)
        ? ' title="' + esc((x.ca ? "签发 CA：" + x.ca : "") + (x.ca && x.fp ? " · " : "") +
            (x.fp ? "终端序列号：" + x.fp : "")) + '"'
        : "") + ">" + esc(x.holder) +
        ((x.ca || x.fp) ? '<div class="mini cov-sub">' +
          (x.fp ? "终端序列号：" + esc(auSubClip(x.fp)) : "签发 CA：" + esc(auSubClip(x.ca))) +
          "</div>" : "") + "</td>" +
      '<td><span class="kr">' + esc(x.no) + "</span></td>" +
      '<td><span class="mini" style="font-family:ui-monospace,Consolas,monospace">' + esc(x.cn || "—") + "</span></td>" +
      /* ★ 2026-10-09（R7）：授权范围取值是「A / B / C」形式的清单，而本列在 1280 下
         只有约 107px —— 整串中文会被浏览器**按任意字断行**（实测渲染成
         「信贷核心系统 / 客户管理 / 台」，把「客户管理平台」劈成两行）。
         ⇒ 按「/」拆成**惰性行**，每项独占一行、不再中断词。 */
      "<td>" + String(x.scope || "—").split(/\s*\/\s*/).map(function (s2) { return "<div>" + esc(s2) + "</div>"; }).join("") + "</td>" +
      /* ★ 2026-10-10（R8）：短时凭据的签发 / 到期**必须带时分**（TTL 以分钟计），证书类只到
         日 —— 同列两种精度会把日期列的自然宽从 103px 抬到 138px。改为**日期一行、时分一行
         （.mini）**，列宽按日期串配平（103px），长精度不再撑列。 */
      "<td>" + String(x.issued || "—").split(" ").map(function (t3, i3) { return i3 ? '<div class="mini" style="margin-top:2px">' + esc(t3) + "</div>" : esc(t3); }).join("") + "</td>" +
      "<td>" + String(x.exp || "—").split(" ").map(function (t4, i4) { return i4 ? '<div class="mini" style="margin-top:2px">' + esc(t4) + "</div>" : esc(t4); }).join("") + "</td>" +
      "<td>" + auStTag(x.st) + "</td>" +
      /* 同 canSel：非终态即可操作（吊销 / 轮换），不再要求 st === "有效"。 */
      '<td>' + (x.st !== "已过期" && x.st !== "已吊销" ? '<span class="opgrp"><button class="btn link danger" data-auact="isRevoke" data-id="' + x.id + '">吊销</button><button class="btn link" data-auact="isRotate" data-id="' + x.id + '">轮换</button></span>' : '<span class="muted">—</span>') + "</td></tr>";
  }).join("");
  var pickable = pageRows.filter(function (x) { return x.st !== "已过期" && x.st !== "已吊销"; });
  var allOn = pickable.length > 0 && pickable.every(function (x) { return sel.indexOf(x.id) >= 0; });
  return idTitle("签发凭据管理", "平台<b>签发</b>给访问主体的凭据 · 管其<b>全生命周期</b>（签发 → 有效 → 轮换 → 吊销）",
      '<div class="toolbar"><button class="btn" data-auact="isBatchRevoke"' + (sel.length ? "" : ' disabled title="勾选待吊销的凭据后启用"') + ">批量吊销" + (sel.length ? "（" + sel.length + "）" : "") + "</button>" +
      '<button class="btn primary" data-auact="isIssue">签发凭据</button></div>') +
    idRefNote("本页凭据由<b>平台签发</b>（非代为保管）。身份模块（客户端实例管理 / 智能体软件 / 实例管理）<b>引用</b>本模块的凭据记录；<b>本模块<b>只按需读取</b>身份台账（用户 / 终端名录）作<b>受控取值域</b>，<b>不建立指向身份实体的持久引用</b>（记录中只存展示名，不存身份主键，避免双向耦合）。") +
    '<div class="card"><div class="card-b">' +
    '<div class="toolbar" style="margin-bottom:12px">' +
      '<div class="input-w"><input type="search" id="auiK" placeholder="搜索持有主体 / 凭据编号" aria-label="搜索签发凭据" style="width:240px" value="' + esc(AUI.f.k) + '"><i>搜索</i></div>' +
      '<select id="auiKind" aria-label="筛选凭据类型"><option value="">全部类型</option>' +
        ["客户端 License 证书", "智能体短时凭据"].map(function (o) { return "<option" + (AUI.f.kind === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
      "</select>" +
      '<select id="auiSt" aria-label="筛选凭据状态"><option value="">全部状态</option>' +
        /* ★ 取值域必须与 auIssueSt 的返回值域闭合：有效期 ≤30 天时返回「即将过期」，
           原选项表缺该项 ⇒ 该状态筛不出来。★ R53（存-6）同上：`auIssueSt(exp, issued)` 新增
           「待生效」返回值 ⇒ 此处一并补项，否则该状态同样筛不出来。 */
        ["待生效", "有效", "即将过期", "已过期", "已吊销"].map(function (o) { return "<option" + (AUI.f.st === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
      "</select>" +
      '<span class="sel-cnt">' + (sel.length ? "已选 <b>" + sel.length + "</b> 项" : "未勾选") + "</span>" +
    "</div>" +
    /* ★ 2026-10-10（R15）：本页**无可吊销行**（全为已过期 / 已吊销）或空态时，表头全选此前仍可点，
       点击后 `sel` 恒空 ⇒ 静默 no-op（可点控件无任何反馈，读屏还把它当可操作项播报）。
       改为置 `disabled` + `title` 说明原因。 */
    idTbl(['<input type="checkbox" aria-label="全选本页可吊销凭据" data-auact="isPickAll"' + (allOn ? " checked" : "") +
        (pickable.length ? "" : " disabled") + ' title="' + (pickable.length ? "全选本页可吊销凭据" : "本页无可吊销凭据") + '">',
      "类型", "持有主体", "凭据编号", "绑定主体标识", "授权范围", "签发时间", "有效期至", "状态", "操作"],
      body || ((AUI.f.k || AUI.f.kind || AUI.f.st)
        ? '<tr><td colspan="10" class="mini">无匹配条目，请调整搜索 / 筛选条件。 <button class="btn link" type="button" data-auact="auiClearF">清空筛选条件</button></td></tr>'
        : idEmptyRow(10, "暂无签发凭据")),
      /* ★ 10 列**全部定宽**（colgroup 无 null 列）⇒ table-layout:fixed 下按容器宽等比铺开。
         定宽合计 1023px（R12 起）≤ 1280 视口下表外框可用宽 1039px（见 proto.css「14 · 窄视口外壳密度回收」），
         故 1280 起即不再出现页内横向滚动条；1440 及以上按容器 100% 放大、各列不缩水。
         各列按**实测需求宽**配平（元素盒 + 文本盒双判据，非仅文本盒）：类型 119（标签列，
         宽度由内容硬定）/ 凭据编号 90 / 绑定主体标识 102 / 签发时间与有效期至各 103（`YYYY-MM-DD`
         等宽 10 字符不可断行；时分已拆到次行，见 E1）/ 状态 86 / 操作 102（两个行内按钮 + td 内距）。
         ⚠ 2026-10-10（R8）实测结论：余下三列（凭据编号需 136 / 绑定主体标识需 124 / 授权范围需 119）
           在本表**无法同时单行** —— A14 门禁要求「持有主体」列 ≥150px，该列 9 列实测需求合计已
           恰好等于 1039px 可用宽，无任何腾挪余量；要单行化即需减列（另案评估，不在本轮）。 */
      /* ★ 2026-10-10（R12）：定宽合计原 1034 / 可用 1039 ⇒ 余量仅 5px，视口再窄 10px 即出横滚条。
         「持有主体」189 → 178，余量 → 16px。
         ⚠ 同轮（R12j）曾把 178 记为「本列行高的实测下界」，**该结论已由 R12k 证伪并作废**：
           所谓「174 / 176 ⇒ 140px、178+ ⇒ 120px」的差，真正来源是**本列副行**
           （签发 CA · 终端序列号）作为换行块多折的一行 —— `_diag_r12_aui_h.py` 逐行盒取证：
           主名 3 行 + 副行 3 行 = 140px，与列宽无关（调列宽只挪断点、不改行数）。
           R12k 先改**单行省略**、R12n 再改为**定长截断为单行**后，`_probe_r12k_colw.py`（1280 / 1440
           双视口）实测：本列设定宽 **≥178 ⇒ 全表最大行高恒 101px**；170 / 174 ⇒ 个别行 120px
           （仍 ≤ A14 阈，但属**压线**）⇒ 取 178 同时满足「非压线」与「横滚余量 16px」。
           178 保留（与 174 实测等价，余量 16px）；放宽到 196（定宽合计 1041 > 1039）即 2px 横溢。 */
      ["34px", "119px", "178px", "90px", "102px", "106px", "103px", "103px", "86px", "102px"]) +
    '<div class="lst-foot"><div id="auiPager" style="flex:1"></div></div>' +
    /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL2（凭据全生命周期全流程）」。 */
    "</div></div>";
}

/* 页⑤ 列表「持有主体」列副行用的定长截断：保证副行恒为**单行**，行高不随标识长度浮动
   （全量文本由单元格 title 承载，hover 可得）。8 位 + 省略号在 1280 视口下实测占 ~142px，
   小于该列副行可用宽 153px。） */
function auSubClip(v) {
  var t = String(v == null ? "" : v);
  return t.length > 8 ? t.slice(0, 8) + "…" : t;
}

/* ---------- 7. 页⑥ 强认证器绑定管理（pg-auauthr） ---------- */

/* 认证器**类型 = 认证方式**，取值必须来自字典的方式名（唯一取值域）：
   · 不得写承载协议 —— WebAuthn（FIDO2）是 L4 / L5 的实现承载，不是方式名；
   · 不得自造短语 —— 原「设备生物因素（指纹）」「活体人脸」既非字典名、彼此也不一致，且缺虹膜。
   本页记录的「安全级别」是**认证器能力档**（该类型可承载的最高档：指纹 / USB Key = L4；
   活体人脸 / 虹膜 = L5），与「**会话实际达到级别**」不是同一个量 —— 后者由「认证源 × 认证方式」
   在认证时联合判定（见本模块字典口径）。故「类型」与「能力档」不是两个独立自由度 ——
   选一个类型，能力档随之而定。 */
/* ★ 2026-10-09：原为另写一份硬编码清单 ⇒ 与字典构成**第二真源**（字典增删方式时不会同步，
   会留下「认证器类型不在字典中」的悬空值）。现改为**由字典派生**。
   ★ 2026-10-10（R30）：「可否用作强认证器、作哪一档」收为方式的**固有属性 `authrLv`**
     （与 srcBind / interactive / inSession 同级），**不再由 defLv ≥ 4 反查** ——
     由参考级别反推「L4 / L5 档由哪些方式构成」正是字典明文禁止的「档位 → 方式集合」视图，
     也等于把「参考默认级别」当成裁决依据（与本模块自述的字典口径自相矛盾）。
     取值：可作认证器的方式填 4（硬件令牌 / 设备端生物特征）或 5（需活体检测的生物特征）。 */
function auAuthrKinds() {
  var ms = (typeof AU !== "undefined" && AU && AU.dict && AU.dict.methods) ? AU.dict.methods : AU_METHODS;
  return ms.filter(function (m) { return Number(m.authrLv) >= 4; })
           .map(function (m) { return { name: m.name, lv: Number(m.authrLv) }; });
}
function auAuthrKindLv(name) {
  var ks = auAuthrKinds();
  for (var i = 0; i < ks.length; i++) if (ks[i].name === name) return ks[i].lv;
  return 0;
}
/* ★ R61 修正：**「可否随账号漫游」与「是否源绑定 / 抗钓鱼」是两个独立维度** ——
   passkey 既源绑定（钓鱼站点拿不到有效断言）又可跨设备同步。此前按 srcBind 派生绑定属性，
   等于把两者混为一谈：后果是「可同步凭据」只对**不具备源绑定**的方式可达，而这类方式恰恰
   不构成 L4/L5 强认证器（字典「抗钓鱼由源绑定派生」）⇒ 强认证器域内「可同步凭据」
   **结构性不可达**，与 FL3「passkey 属强认证器类型」自相矛盾，也与台账种子（指纹识别 +
   可同步凭据）打架。现按**能力域**建模：平台内置生物特征可按 passkey 形态登记（随账号漫游），
   外接硬件令牌与须活体检测的方式为设备绑定。 */
var AU_SYNC_METHODS = ["指纹识别", "人脸识别"];
function auAuthrCtypeDomain(name) {
  return AU_SYNC_METHODS.indexOf(String(name)) >= 0 ? ["绑定型", "可同步凭据"] : ["绑定型"];
}
function auAuthrKindSync(name) {
  var lv = auAuthrKindLv(name), sel = document.getElementById("aarLv");
  if (lv && sel) sel.value = String(lv);
  /* 凭据绑定属性：能力域为**单值**时（USB Key / 活体人脸 / 虹膜）不提供可操作控件，
     改只读承载 —— 单选项下拉是「假控件」，看起来能改、其实只有一条路；能力域为双值时
     给真正的下拉（指纹 / 人脸可按设备绑定或 passkey 同步两种形态登记，是**同一方式的两类
     实例**，不是可自由组合的第二个维度）。 */
  var dom = auAuthrCtypeDomain(name), host = document.getElementById("aarCtypeWrap");
  if (!host) return;
  if (dom.length < 2) {
    host.innerHTML = '<input type="hidden" id="aarCtype" value="' + esc(dom[0]) + '">' +
      '<span class="tag t-gray" id="aarCtypeShow" title="由认证方式唯一确定、不可修改">' + esc(dom[0]) + '</span>';
    return;
  }
  var cur = (document.getElementById("aarCtype") || {}).value;
  if (dom.indexOf(cur) < 0) cur = dom[0];
  host.innerHTML = '<select id="aarCtype" aria-label="凭据绑定属性">' +
    dom.map(function (o) { return "<option" + (o === cur ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>";
}
function auAuthrFiltered() {
  var f = AUR.f || {};
  return (AU.authr || []).filter(function (x) {
    if (f.k) {
      var hay = (x.user + " " + x.kind + " " + (x.credId || "") + " " + x.dev + " " + x.rpid).toLowerCase();
      if (hay.indexOf(String(f.k).toLowerCase()) < 0) return false;
    }
    if (f.lv && String(x.lv) !== String(f.lv)) return false;
    if (f.ctype && x.ctype !== f.ctype) return false;
    if (f.st && x.st !== f.st) return false;
    return true;
  });
}
function auAuthrPage() {
  var body = auSlice(auAuthrFiltered(), AUR).map(function (x) {
    return "<tr><td><b>" + esc(x.user) + "</b></td>" +
      "<td>" + esc(x.kind) + "</td>" +
      "<td>" + auLvTag(x.lv) + "</td>" +
      /* 可同步凭据（passkey）的**可漫游**属性必须落在台账上：此前只有一句说明文案、没有任何落点。 */
      /* ★ 2026-10-10（R8）：两枚标签原在同一行（自然宽 171px vs 列宽 112px）⇒ 折行。
         改为**各自成行**（每行一枚标签，最宽 104px），列宽维持 112px。 */
      "<td>" + (x.ctype === "绑定型" ? '<span class="tag t-gray">绑定型</span>' : '<span class="tag t-info">可同步凭据</span><div style="margin-top:4px"><span class="tag t-gray">可漫游</span></div>') + "</td>" +
      '<td><span class="kr">' + esc(x.credId || "—") + "</span></td>" +
      "<td>" + devWbr(x.dev) + "</td>" +
      '<td><span class="kr">' + esc(x.rpid) + "</span></td>" +
      "<td>" + esc(x.reg) + "</td>" +
      "<td>" + auStTag(x.st) + "</td>" +
      '<td>' + (x.st === "有效" ? '<span class="opgrp"><button class="btn link danger" data-auact="arRevoke" data-id="' + x.id + '">吊销</button></span>' : '<span class="muted">—</span>') + "</td></tr>";
  }).join("");
  return idTitle("强认证器绑定管理", "把<b>指纹识别 / USB Key 硬件令牌</b> 等 <b>L4/L5 强认证器</b>绑定到具体用户 · 回答「<b>这位用户的这枚认证器，登记在哪台设备、属哪个能力档、现在是否可用</b>」",
      '<div class="toolbar"><button class="btn" data-auact="arReset">管理员重置</button>' +
      '<button class="btn primary" data-auact="arNew">登记认证器</button></div>') +
    idRefNote("平台管的是 <b>「绑定关系」</b>，<b>不是「生物特征本身」</b> —— 生物特征始终留在设备 / 认证器内，<b>永不上传平台</b>；平台承担的是<b>源绑定与凭据生命周期管理</b>，<b>不承担生物特征的活体检测强度承诺</b>。") +
    '<div class="card"><div class="card-b">' +
    '<div class="toolbar" style="margin-bottom:12px">' +
      '<div class="input-w"><input type="search" id="aurK" placeholder="搜索用户 / 认证器 / 设备" aria-label="搜索认证器台账" style="width:240px" value="' + esc(AUR.f.k) + '"><i>搜索</i></div>' +
      /* 强认证器只涉及 L4 / L5（字典里「硬件与生物特征」「活体生物特征」两档）：
         列出 L1~L3 只会筛出空集。 */
      '<select id="aurLv" aria-label="筛选认证级别"><option value="">全部级别</option>' +
        [4, 5].map(function (n) { return "<option value=\"" + n + "\"" + (String(AUR.f.lv) === String(n) ? " selected" : "") + ">L" + n + "</option>"; }).join("") +
      "</select>" +
      '<select id="aurCtype" aria-label="筛选凭据绑定属性"><option value="">全部绑定属性</option>' +
        ["绑定型", "可同步凭据"].map(function (o) { return "<option" + (AUR.f.ctype === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
      "</select>" +
      '<select id="aurSt" aria-label="筛选认证器状态"><option value="">全部状态</option>' +
        ["有效", "已吊销"].map(function (o) { return "<option" + (AUR.f.st === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
      "</select>" +
    "</div>" +
    idTbl(["用户", "认证方式", "安全级别", "凭据绑定属性", "凭据 ID", "登记设备", "RP ID", "登记时间", "状态", "操作"],
      body || ((AUR.f.k || AUR.f.lv || AUR.f.ctype || AUR.f.st) ? emptyRowBtn(10, "没有符合条件的认证器登记", "data-auact", "aurClearF") : idEmptyRow(10, "暂无认证器登记")),
      /* ★ 本行＝页⑥ 认证器登记表各列宽度。唯一弹性列＝「登记设备」（`null`）——设备名是不可断行的
         自然长值，应由它吃剩余宽度。
         ★ 2026-10-10（R17）：按 1280 下逐行 need 重分配 —— 用户 68→56、安全级别 78→64、
           凭据绑定属性 112→98，共让出 40px 给唯一弹性列「登记设备」（111 → 151 ≥ 实测 need 147），
           **未删任何业务列**。 */
      ["56px", "140px", "64px", "98px", "118px", null, "158px", "102px", "86px", "66px"]) +
    '<div class="lst-foot"><div id="aurPager" style="flex:1"></div></div>' +
    /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL3（强认证器绑定与重置全流程）」。 */
    "</div></div>" +
    '<div class="card"><div class="card-h"><h3>多枚冗余与恢复</h3></div><div class="card-b">' +
      '<div class="kv" style="grid-template-columns:170px 1fr">' +
      '<span class="k">多枚冗余</span><span class="mini">同一用户可登记<b>多枚</b>认证器（同级别多枚、跨级别多枚），天然构成冗余 —— 单枚不可用不影响其余凭据继续认证</span>' +
      '<span class="k">全部不可用</span><span class="mini">走<b>身份核验后的管理员重置</b>流程：吊销该用户<b>全部认证器凭据</b>（L4 / L5 均以 WebAuthn（FIDO2）承载）并允许重新登记；<b>重置全程记审计</b></span>' +
      '<span class="k">可信证据</span><span class="mini">登记为 L5 的认证器须由<b>平台侧可核验的证据</b>支撑 —— WebAuthn 的用户验证可由 PIN 或生物识别完成、生物数据不提供给服务端，故<b>不能仅凭一次 WebAuthn 成功即认定完成活体核验</b>；<b>无法证明的能力不计入实际达到级别</b></span>' +
      "</div>" +
      /* ★ 2026-10-10（R19·A4）：页尾长解释已按门户「能删就删」收进「关键业务说明 · FL3（强认证器绑定与重置全流程）」。 */
      "</div></div>";
}

/* ---------- 8. 统一渲染入口 ---------- */
function renderAuDict()     { var el = document.getElementById("pg-audict"); if (!el) return; if (!AU) auLoad(); el.innerHTML = auDictPage();
  auMountPager("#audMPager", auDictFiltered().length, AUD.pg, "audPg", "个方式", "搜索 / 筛选 / 分页只作用于本表");
  auMountPager("#audLvPager", (AU.dict.levels || []).length, AUD.lv.pg, "audLvPg", "个档位", "档位固定 L1~L5 · 分页只作用于本表"); }
function renderAuSrc()      { var el = document.getElementById("pg-ausrc"); if (!el) return; if (!AU) auLoad(); el.innerHTML = auSrcPage();
  auMountPager("#ausrcPager", auSrcFiltered().length, AUS.pg, "ausrcPg", "个源", "搜索 / 筛选 / 分页只作用于本表");
  var _ws = AU.sources.filter(function (x) { return x.id === AUS.cur; })[0];
  auMountPager("#ausrcWayPager", _ws ? (_ws.ways || []).length : 0, AUW.pg, "ausrcWayPg", "个源×方式记录", "该源下的「源 × 方式」记录");
  auMountPager("#ausrcMapPager", AUW.map.total || 0, AUW.map.pg, "ausrcMapPg", "条字段映射", "该源的「平台字段 → 外部来源属性」映射"); }
function renderAuUserCred() { var el = document.getElementById("pg-auusercred"); if (!el) return; if (!AU) auLoad(); el.innerHTML = auUserCredPage();
  auMountPager("#auucPager", auUserCredFiltered().length, AUU.pg, "auucPg", "个账号", "搜索 / 筛选 / 分页只作用于本表");
  auMountPager("#auucFmtPager", auUserCredFiltered().length, AUF.pg, "auucFmtPg", "份契约", "契约按资产维度配置 · 本页只读引用"); }
function renderAuIssue()    { var el = document.getElementById("pg-auissue"); if (!el) return; if (!AU) auLoad(); el.innerHTML = auIssuePage();
  auMountPager("#auiPager", auIssueFiltered().length, AUI.pg, "auiPg", "项", "勾选 / 批量作用于当前页"); }
function renderAuAuthr()    { var el = document.getElementById("pg-auauthr"); if (!el) return; if (!AU) auLoad(); el.innerHTML = auAuthrPage();
  auMountPager("#aurPager", auAuthrFiltered().length, AUR.pg, "aurPg", "项", "分页只作用于本表"); }

/* ---------- 9. 交互 ---------- */
/* ★ 2026-10-10（R15）：ARIA tabs 惯例的**方向键导航**与 roving tabindex 此前未闭合 ——
   三组页签（页① `#audTabs` / 页③ `#credTabs` / 页④ `#auucTabs`）`role` / `aria-selected` 齐备，
   但方向键无效、非活动签也在 Tab 序内。用**捕获阶段委托**实现：不随重渲染失效，无需逐轮绑定。
   ⚠ 本段（含下面的 `auRerender`）属**认证主段**，改动必须落在 `_frag_auth.js` 再跑同步器；
     直改 `app.js` 会被整段替换悄然抹掉（R15-e 已因之返工一次）。 */
function auTabsRove(host) {
  var tabs = host.querySelectorAll('[role="tab"]'), any = false;
  tabs.forEach(function (o) { if (o.getAttribute("aria-selected") === "true") any = true; });
  tabs.forEach(function (o) {
    var sel2 = (o.getAttribute("aria-selected") === "true") || (!any && o === tabs[0]);
    o.setAttribute("tabindex", sel2 ? "0" : "-1");
  });
}
function auTabsRoveAll() {
  ["#audTabs", "#credTabs", "#auucTabs"].forEach(function (s8) {
    var h8 = document.querySelector(s8); if (h8) auTabsRove(h8);
  });
}
document.addEventListener("keydown", function (e6) {
  var tb = e6.target;
  if (!tb || !tb.getAttribute || tb.getAttribute("role") !== "tab") return;
  var host = tb.closest ? tb.closest('[role="tablist"]') : null; if (!host) return;
  var tabs = Array.prototype.slice.call(host.querySelectorAll('[role="tab"]'));
  var ix = tabs.indexOf(tb); if (ix < 0) return;
  var nx = -1;
  if (e6.key === "ArrowRight" || e6.key === "ArrowDown") nx = (ix + 1) % tabs.length;
  else if (e6.key === "ArrowLeft" || e6.key === "ArrowUp") nx = (ix - 1 + tabs.length) % tabs.length;
  else if (e6.key === "Home") nx = 0;
  else if (e6.key === "End") nx = tabs.length - 1;
  if (nx < 0) return;
  e6.preventDefault(); e6.stopPropagation();
  auTabsRove(host);
  tabs[nx].focus(); tabs[nx].click();
}, true);
document.addEventListener("focusin", function (e7) {
  var tb = e7.target;
  if (!tb || !tb.getAttribute || tb.getAttribute("role") !== "tab") return;
  var host = tb.closest ? tb.closest('[role="tablist"]') : null;
  if (host) auTabsRove(host);
}, true);
function auRerender() {
  /* ★ 2026-10-10（R12）：整段重渲染会把被点元素（分页器 / 页签 / 行内动作）的节点换掉，
     浏览器随即把焦点丢到 body ⇒ 翻页、批量动作后键盘焦点丢失。渲染前记「可复定位选择器」，
     渲染后**仅当焦点已落 body** 时按选择器找回（不抢其它控件的焦点）。
     基础设施 `domFocusKey/Save/Restore` 在 #dlgCfm 段（全站通用），见 app.js「确认弹窗」节。 */
  domFocusSave();
  if (document.getElementById("pg-audict")) renderAuDict();
  else if (document.getElementById("pg-ausrc")) renderAuSrc();
  else if (document.getElementById("pg-auusercred")) renderAuUserCred();
  else if (document.getElementById("pg-auissue")) renderAuIssue();
  else if (document.getElementById("pg-auauthr")) renderAuAuthr();
  /* ★ 2026-10-10（R15）：页①/④ 页签 roving —— 见 auTabsRove（委托式方向键导航已在文档级挂好）。 */
  try { auTabsRoveAll(); } catch (_et) { /* 忽略 */ }
  /* ★ 2026-10-10（R16）：表头全选复选框的 `indeterminate` 是 **property**、随 `innerHTML`
     整表重建即复位。原先只在 isPick / isPickAll 两个「勾选驱动」路径重设，走 isRotate /
     isIssue（auRerender）时勾选集仍在（「批量吊销（N）」照样计数），表头却读作「未选」
     ⇒ 表头与真实勾选态自相矛盾（视觉与读屏播报同时失真）。改为在**重渲染收尾**统一同步一次。 */
  try { auSyncPickAll(); } catch (_pk) { /* 忽略 */ }
  domFocusRestore();
}
/* ===== 认证模块 · 受控取值辅助 =====
   自由文本能造出「台账里根本不存在的取值」，随后所有按名比对的逻辑都会静默失配
   （吊销/追溯落空、引用数失真）。故凡有既有台账可依的字段，一律从台账派生取值域。 */
/* 用户清单（账号归属 / 认证器登记共用）；身份台账不可用时退回内置演示清单。 */
function auUserNames() {
  var us = [];
  try { if (typeof ID !== "undefined" && ID && ID.users) ID.users.forEach(function (u) { if (u && u.name) us.push(u.name); }); } catch (e) { /* 忽略 */ }
  return us.length ? us : ["张伟", "王芳", "李俊", "陈丽"];
}
/* ★ 2026-10-10（R13）：用户台账 → 受控取值**对象**（带可用性）。
   「产生生效材料」的取值域（登记认证器 / …）只收**已启用**用户；「恢复通道」（管理员重置 arReset）
   面向的正是不可用用户，仍走 auUserNames() 全量 —— 两处不可一并收窄。 */
function auUserObjs() {
  var r = [];
  try { if (typeof ID !== "undefined" && ID && ID.users) ID.users.forEach(function (u) { if (u && u.name) r.push({ name: u.name, st: u.st || "已启用", ok: (u.st || "已启用") === "已启用" }); }); } catch (e) { /* 忽略 */ }
  if (!r.length) r = ["张伟", "王芳", "李俊", "陈丽"].map(function (n) { return { name: n, st: "已启用", ok: true }; });
  return r;
}
/* 签发 CA / 容器取值域＝**平台签发 CA** 闭集 `GW_SIGN_CAS`。
   ★ 2026-10-09 订正：原注释称「取值域＝网关凭据页的 CA 台账」，与实现不符 ——
   实现读的是 `AU.gw.cas`（已撤除的重复页 `pg-augwcred` 的残留种子，页面上无处可查、
   不可维护），且与页③ 实际展示的 `CA_LIST`（出站信任锚）零交集；而 `CA_LIST` 与
   本函数的语义本就不同池（见 `GW_SIGN_CAS` 处注释），故作去影子化 + 文案订正，
   **不**并入 `CA_LIST`。 */
/* ★ 2026-10-10（R33）：登记认证器的**设备取值域按所选用户收敛** —— 认证器登记在该用户**绑定的终端**上
   （权威源 `ID.users[].bound`），而非全量终端台账：此前「用户」与「设备」两个下拉互不联动，
   可登记出「王芳 @ 科技管理部-张伟-PC」这类跨主体组合（绑定关系在身份侧本已明确记载）。
   该用户历史登记过的设备名一并保留（旧数据不丢，按终端台账状态置灰）。 */
function auAuthrDevOpts(userName) {
  var list = [];
  try {
    if (typeof ID !== "undefined" && ID && ID.users) {
      ID.users.forEach(function (u) {
        if (!u || u.name !== userName) return;
        (u.bound || []).forEach(function (tid) {
          for (var i = 0; i < (ID.terms || []).length; i++) {
            if (ID.terms[i].id === tid && ID.terms[i].name && list.indexOf(ID.terms[i].name) < 0) list.push(ID.terms[i].name);
          }
        });
      });
    }
  } catch (e) { /* 忽略 */ }
  try { (AU.authr || []).forEach(function (a2) { if (a2 && a2.user === userName && a2.dev && a2.dev !== "—" && list.indexOf(a2.dev) < 0) list.push(a2.dev); }); } catch (e2) { /* 忽略 */ }
  /* ★ R53（E-F3 · P0）：**不再回落他人设备** —— 原实现在该用户无绑定终端时返回硬编码
     「科技管理部-张伟-PC」，于是「用户 = 赵敏、设备 = 张伟的 PC」可被选中并落库，造出一条把
     非本人设备挂到他人名下的**强认证器**（安全边界），正是本模块 R33 注释自述要防的跨主体组合。
     取值域＝该用户绑定终端 ∪ 其历史登记设备；为空即返回空集（下拉置占位、提交侧拦断）。 */
  return list;
}
/* 随「用户」下拉变更重算「登记设备」选项（保留原选中项若仍可用）。 */
function auAuthrDevSync() {
  var el = document.getElementById("aarDev");
  if (!el) return;
  var u = document.getElementById("aarUser");
  var opts = auAuthrDevOpts(u ? u.value : "");
  var st = {};
  try { if (typeof ID !== "undefined" && ID && ID.terms) ID.terms.forEach(function (t2) { if (t2 && t2.name) st[t2.name] = t2.st || "已激活"; }); } catch (e) { /* 忽略 */ }
  var prev = el.value;
  var pick = (opts.indexOf(prev) >= 0 && (st[prev] || "已激活") === "已激活")
    ? prev
    : (opts.filter(function (d) { return (st[d] || "已激活") === "已激活"; })[0] || opts[0]);
  el.innerHTML = opts.length ? opts.map(function (d2) {
    var off = (st[d2] || "已激活") !== "已激活";
    return '<option' + (off ? " disabled" : "") + (d2 === pick ? " selected" : "") + ' value="' + esc(d2) + '">'
      + esc(d2 + (off ? "（" + (st[d2] || "未激活") + "）" : "")) + "</option>";
  }).join("") : '<option value="" disabled selected>（该用户无可登记终端）</option>';
}
function auGwCas() {
  return GW_SIGN_CAS.map(function (c) { return c.name; });
}
/* 托管账号「账号归属」随托管模式切换取值域：
   用户自管 ⇒ 具体用户（受控取值）；管理员托管 ⇒「组织资产」。
   ⚠ 展示值不带全角括号：「账号归属」列在 1280 下宽 84px，而「（组织资产）」实测需 106px、
     会被折成「（组织资」/「产）」；去括号后需 80px，单行容纳，语义不变
     （该行「托管模式」已写「管理员托管」，归属必为组织资产）。 */
/* ★ 2026-10-10（R9）：原「用户自管」铺**全部用户**供选 —— 与页面自述「用户自管＝用户本人录入」
   矛盾（可把「自管」凭据挂到别人名下）。归属由**托管模式唯一决定**、不是第二个自由度：
   自管 ⇒ 当前登录用户（本人、锁定）；管理员托管 ⇒ 组织资产。 */
function auOwnerSync() {
  var m = document.getElementById("aucMode"), o = document.getElementById("aucOwner");
  if (!m || !o) return;
  var self = (typeof opUser === "function") ? (String(opUser() || "").trim() || "张伟") : "张伟";
  o.innerHTML = (m.value === "用户自管") ? "<option>" + esc(self) + "</option>" : "<option>组织资产</option>";
  o.disabled = true;
}
/* ===== 签发凭据 · 弹窗联动 =====
   「绑定主体标识」由**持有主体**派生（cnOf），在此**只读回显**而非填写位 —— 网关校验
   与按主体追溯比对的正是该标识，操作者签发前应看得见「到底绑的是谁」。
   授权范围对两类凭据**都必填**：证书类通常是资产集合；短时凭据通常收敛到具体资产 /
   资源（例如经无端网关访问某个具体资产的浏览器所持的短时凭据，其授权范围就是那一个资产）。 */
function isCnSync() {
  var s = document.getElementById("isSubj"), el = document.getElementById("isCn");
  if (s && el) el.textContent = cnOf(s.value);
  /* ★ 2026-10-10（R10）：签发前应看得见「该主体当前到底持有什么」。
     原先只在提交后被 toast 拦下（同主体同类型已有生效凭据），操作者拿不到做判断所需的下文。 */
  var hd = document.getElementById("isHold");
  if (hd && s) {
    var hs = (AU.issue || []).filter(function (y) { return y.holder === s.value; });
    var live = hs.filter(function (y) { return y.st === "有效" || y.st === "即将过期"; });
    hd.innerHTML = hs.length
      ? "该主体当前持有 <b>" + hs.length + "</b> 条凭据" +
        (live.length
          ? "（其中 <b>" + live.length + "</b> 条处于生效态：" + live.map(function (y) {
              return esc(y.kind) + " · " + esc(y.no) + " · " + esc(y.st);
            }).join("；") + "）"
          : "（均已过期 / 已吊销）")
      : "该主体当前<b>无</b>持有凭据 —— 可直接签发。";
  }
}
/* 授权范围的受控候选：业务系统级取「授权范围受控清单」（资产段 LIC_SCOPE_SET，与台账挂钩），
   并并入资产台账的资产名（短时凭据常收敛到具体资产）。两处均为权威源，不在认证段自造名称。 */
function isScopeNames() {
  var ns = (typeof licScopeNames === "function" ? licScopeNames() : []).slice();
  try {
    if (typeof ASSETS !== "undefined" && ASSETS) {
      ASSETS.forEach(function (a) { if (a && a.name && ns.indexOf(a.name) < 0) ns.push(a.name); });
    }
  } catch (e) { /* 资产段未就绪：仅给业务系统级候选 */ }
  return ns;
}
/* ★ R53（C-F4）：候选**单源化** —— `isScopeOpts()` 供 <datalist> 渲染、`isScopeNames()` 供**提交侧
   校验**复用同一取值域；此前 datalist 只是建议、提交处只查非空 ⇒ 可把台账外的任意业务系统名签进凭据
   （与「两处均为权威源，不在认证段自造名称」自述矛盾）。 */
function isScopeOpts() {
  return isScopeNames().map(function (n) { return '<option value="' + esc(n) + '">'; }).join("");
}
function isKindSync() {
  var k = document.getElementById("isKind"), v = k ? k.value : "";
  var isCert = (v === "客户端 License 证书");
  var ew = document.getElementById("isExpWrap"), tw = document.getElementById("isTtlWrap");
  if (ew) ew.style.display = isCert ? "" : "none";
  if (tw) tw.style.display = isCert ? "none" : "";
  /* ★ 2026-10-10（R9）：「签发 CA / 容器」只属**证书类**凭据（X.509 需 CA 签发）；短时凭据由
     平台与 AI 安全 agent 直接颁发、不经 CA ⇒ 切到短时凭据时隐藏该字段，否则会变成
     「短时凭据也必须选一个 CA 才能签发」的伪必填。 */
  var cw = document.getElementById("isCaWrap");
  if (cw) cw.style.display = isCert ? "" : "none";
  /* ★ 2026-10-10（R20）：**可见必填星号**随类型一并切换 —— R18 只把 required / aria-required
     同步进无障碍树，页面上可见的 `*` 仍是模板里写死的两套：证书类下「有效期至 / 签发 CA」
     必填却无星号，短时类下「短时有效期」的星号又落在隐藏字段上 ⇒ 视觉必填与语义必填口径不一。
     与上方 required 同步同判据（isCert），三个星号一起切。 */
  [["isExpReq", isCert], ["isCaReq", isCert], ["isTtlReq", !isCert]].forEach(function (p) {
    var _e = document.getElementById(p[0]); if (_e) _e.style.display = p[1] ? "" : "none";
  });
  /* ★ 2026-10-10（R14）：① **条件必填**同步到无障碍树 —— 证书类的「有效期至 / 签发 CA」、短时类的
     「短时有效期」随类型切换显隐，此前只是视觉显隐，读屏不知道它们此刻是否必填；
     ② 主体取值域按**凭据类型**收敛 —— 证书绑客户端实例、短时凭据绑智能体实例（与提交处同一判据，
     只是提前到选择时）。为空的池**不回退成空下拉**（那会让整条路走死），保留全集由提交校验兜底。 */
  /* ★ 2026-10-10（R18）：`required` 与 `aria-required` 此前**只切了后者**，`required` 恒真 ⇒
     「短时凭据」下隐藏的「有效期至」仍被读屏当作必填、而真正必填的「短时有效期」却不算。
     两处随类型一并切换，避免同字段两套必填口径。 */
  var _ew2 = document.getElementById("isExp"); if (_ew2) { _ew2.setAttribute("aria-required", isCert ? "true" : "false"); if (isCert) _ew2.setAttribute("required", "required"); else _ew2.removeAttribute("required"); }
  var _cw2 = document.getElementById("isCa");  if (_cw2) { _cw2.setAttribute("aria-required", isCert ? "true" : "false"); if (isCert) _cw2.setAttribute("required", "required"); else _cw2.removeAttribute("required"); }
  var _tw2 = document.getElementById("isTtl"); if (_tw2) { _tw2.setAttribute("aria-required", isCert ? "false" : "true"); if (isCert) _tw2.removeAttribute("required"); else _tw2.setAttribute("required", "required"); }
  var _sb2 = document.getElementById("isSubj"), _all2 = window.__auIhSubj;
  if (_sb2 && _all2 && _all2.length) {
    var _pre2 = isCert ? "客户端实例" : "智能体实例";
    var _pool2 = _all2.filter(function (s) { return s.label.indexOf(_pre2) === 0; });
    if (_pool2.length) {
      var _pk2 = _pool2.filter(function (s) { return !s.off; })[0] || _pool2[0];
      _sb2.innerHTML = _pool2.map(function (s) {
        return '<option' + (s.off ? " disabled" : "") + (s === _pk2 ? " selected" : "") +
          ' value="' + esc(s.label) + '">' + esc(s.label + (s.off ? "（" + s.st + "）" : "")) + "</option>";
      }).join("");
      isCnSync();
    }
  }
  var sc = document.getElementById("isScope"), sh = document.getElementById("isScopeHint");
  if (sc) sc.placeholder = isCert ? "如 信贷核心系统 / 客户管理平台（资产集合）" : "如 报表中心（具体资产）";
  if (sh) sh.innerHTML = isCert
    ? "证书类凭据的授权范围是<b>资产集合</b>，取<b>平台受控的授权范围清单</b>（与资产台账挂钩，不在此自造业务系统名）："
      + (typeof licScopeNames === "function" ? esc(licScopeNames().join(" / ")) : "") + "。"
    : "短时凭据的授权范围<b>收敛到具体资产 / 资源</b>，取<b>资产台账</b>中的资产名（如 报表中心）；沙箱 / 代码等受限面用<b>受控清单</b>中的 代码库 / 需求库 / 沙箱环境。";
}

/* ===== 认证模块 · 生效面动作的统一确认入口 =====
   口径（同 DP 模块 2026-10-09 裁定）：**改变「生效面」的动作（启停 / 移除 / 删除 / 吊销）
   一律先经二次认证** —— 认证认的是「改变生效面」，不是动作名称；只改配置内容的保存走
   普通确认，复制类不认证。本函数把既有的 idAsk(title,msg,cb,okText) 四参签名适配到
   ask2FA(op, ok, cancel, note)：op 用动作名（「删除认证源」等）、msg 原样进 note；
   第 4 参（确认按钮文案）由 render2FA 统一为「验证并执行」，故忽略。 */
function auConfirmEff(title, msg, cb) { ask2FA(title, cb || null, null, msg); }
/* ★ 2026-10-10（R14）：表头「全选」的**第三态** —— 部分勾选时须置 indeterminate。
   `indeterminate` 是**属性（property）而非特性（attribute）**，无法在 HTML 字符串里声明，
   只能在渲染完成后对已挂载节点赋值 ⇒ 独立成函数，由勾选处理器的重渲染之后调用。 */
function auSyncPickAll() {
  try {
    var cb = document.querySelector('#pg-auissue [data-auact="isPickAll"]');
    if (!cb) return;
    var rows = auSlice(auIssueFiltered(), AUI).filter(function (x) { return x.st !== "已过期" && x.st !== "已吊销"; });
    var sel = AUI.sel || [];
    var n = rows.filter(function (x) { return sel.indexOf(x.id) >= 0; }).length;
    cb.indeterminate = n > 0 && n < rows.length;
  } catch (_e) { /* 忽略 */ }
}
function auOnClick(e) {
  /* 页签 */
  var tb = e.target && e.target.closest ? e.target.closest("[data-aut]") : null;
  if (tb) {
    var tv = tb.getAttribute("data-aut");
    /* ★ 2026-10-10（R15-f）：页签点击**直呼本页渲染器**（不经 `auRerender()`）⇒ 重渲染出的
       新页签 `tabindex` 会退回 `null`、非活动签重新落回 Tab 序。渲染后各补一次 roving。 */
    if (document.getElementById("pg-audict")) { AUD.tab = tv; renderAuDict(); auTabsRoveAll(); return; }
    if (document.getElementById("pg-auusercred")) { AUU.tab = tv; renderAuUserCred(); auTabsRoveAll(); return; }
  }
  var t = e.target && e.target.closest ? e.target.closest("[data-auact]") : null;
  if (!t) return;
  var act = t.getAttribute("data-auact");
  var id = t.getAttribute("data-id") || "";
  var idx = t.getAttribute("data-i");
  switch (act) {
    /* 字典 */
    /* dictAnti 已撤：抗钓鱼 = 源绑定的派生事实（页面不再提供独立开关），读档归一见 auLoad。 */
    /* ★ R61（轮7 · R 组）：签发凭据空态「清空筛选条件」出口 —— 原误置于 `auOnChange` 的 `t.id`
       分派分支（该分支只处理**筛选控件 id**），而空态按钮走 `data-auact`、由 `auOnClick` 分派
       ⇒ 该 case 永不命中（点「清空筛选条件」无反应）。死按钮门禁只校验「动作名有没有 case」、
       不校验「case 落在哪个分派函数」，故未拦住。 */
    case "auiClearF": AUI.f.k = ""; AUI.f.kind = ""; AUI.f.st = ""; AUI.sel = []; AUI.pg = 1; auRerender(); toast("已清空筛选条件"); break;
    /* ★ R61·轮9：认证方式 / 认证源 / 认证器登记三页补空态一键清空（原仅托管账号与签发凭据两页有）。 */
    case "audClearF": AUD.k = ""; AUD.pg = 1; if (AUD.lv) AUD.lv.pg = 1; auRerender(); toast("已清空筛选条件"); break;
    case "ausClearF": AUS.f = { k: "", st: "" }; AUS.pg = 1; auRerender(); toast("已清空筛选条件"); break;
    case "aurClearF": AUR.f = { k: "", lv: "", ctype: "", st: "" }; AUR.pg = 1; auRerender(); toast("已清空筛选条件"); break;
    case "dictDel": {
      var md = auMethod(id); if (!md) break;
      var rfd = auRefSplit(id), rfdT = rfd.on + rfd.off;
      /* ★ 2026-10-10（R30）：引用链由「认证源」一条扩为「认证源 + 访问策略」两条 ——
         策略条件里的「认证方式 ∈ …」按方式名取值，与源侧按 mid 是两条独立链。 */
      var pfd = auPolRefSplit(md.name), pfdT = pfd.on + pfd.off;
      /* ★ 2026-09-30：删除门禁改由**方式自身的身份**判定（内置不可删）；
         旧的「该档唯一方式不可删」依据「档位 → 方式集合」这一已废止的归属关系。 */
      if (AU_BUILTIN_IDS.indexOf(id) >= 0) {
        openDlg("不可删除", "「" + esc(md.name) + "」是<b>平台内置认证方式</b>（随版本预置）。删除会让方式名取值域残缺、已落库的「源 × 方式」记录悬空 —— 故不可删除。<b>如不需使用，请在「认证源」页移除对应记录，或停用引用它的源</b>。");
        break;
      }
      if (rfdT || pfdT) {
        var _seg2 = [];
        if (rfdT) _seg2.push("被 <b>" + rfdT + "</b> 个认证源引用" + (rfd.off ? "（其中 <b>" + rfd.off + " 个为已停用源</b>）" : ""));
        if (pfdT) _seg2.push("被 <b>" + pfdT + "</b> 条访问策略引用" + (pfd.off ? "（其中 <b>" + pfd.off + " 条为已停用 / 已下线对象</b>）" : ""));
        openDlg("不可删除", "该方式" + _seg2.join("、") + "。<b>被引用的方式名不可删除</b> —— 须先移除对应的引用记录：在「认证源」页移除引用它的源记录"
          + (pfdT ? "、并在「资产访问控制策略」/「资产细粒度访问策略」中移除对应的「认证方式」条件行" : "")
          + "。⚠ <b>仅停用引用对象不解除引用</b>（上表已把已停用对象的引用一并计入）；源记录删除时其引用一并移除。");
        break;
      }
      auConfirmEff("删除认证方式", "将删除字典中的方式 <b>" + esc(md.name) + "</b>。<b>此操作入审计</b>。", function () {
        AU.dict.methods = AU.dict.methods.filter(function (x) { return x.id !== id; }); auSave(); auRerender(); toast("已删除（演示）");
        AU_SRC_METHODS = (AU.dict.methods || AU_METHODS).slice();
      }, "删除");
      break;
    }
    case "dictNew": {
      openDlg("新增认证方式", "新增的方式名加入平台取值域。⚠ <b>不得与既有方式重名</b>。此处登记的<b>参考默认级别</b>只作新建「源 × 方式」记录时的初值，<b>不代表该方式在任何认证源下的实际级别</b>。",
        '<div class="fld"><label for="aunName">方式名称 <span class="req">*</span></label><input id="aunName" placeholder="如 硬件令牌（PIV）"></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aunLv">参考默认级别</label><select id="aunLv">' + [1, 2, 3, 4, 5].map(function (n) { return "<option value=\"" + n + "\"" + (n === 2 ? " selected" : "") + ">L" + n + "</option>"; }).join("") + "</select>" +
          '<div class="mini" style="margin-top:4px">新建「源 × 方式」记录时的<b>初值</b>；<b>实际级别挂在「认证源 × 认证方式」上</b>，落库时可改。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aunInh">凭据固有属性</label><input id="aunInh" placeholder="如 外接硬件令牌"></div>' +
        '<div class="fld" style="margin-top:10px"><label><input type="checkbox" id="aunBind"> 具备源绑定能力（登记后不可改）</label>' +
          '<div class="mini" style="margin-top:4px">判据＝<b>凭据在协议层是否绑定源</b>：认证器断言与发起认证的源（origin / RP ID）绑定，钓鱼站点拿不到有效断言。具备源绑定能力的方式<b>即抗钓鱼</b>；不具备的<b>无法靠任何配置变得抗钓鱼</b>。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label><input type="checkbox" id="aunInter" checked> 交互式（认证过程需用户手工参与）</label>' +
          '<div class="mini" style="margin-top:4px">非交互式方式<b>不适用于「二次认证」</b>等需人工确认的场景。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label><input type="checkbox" id="aunInSess" checked> 计入会话档位（可提升会话认证强度）</label>' +
          '<div class="mini" style="margin-top:4px">与「交互式」同属<b>方式的固有属性</b>，登记后随方式生效；字典「计入会话档位」列据此渲染。</div></div>' +
        /* ★ 2026-10-10（R30）：可否作「强认证器」登记，收为方式的**固有属性**（authrLv）——
           此前由「参考默认级别 ≥ L4」反推，等于拿参考值当裁决依据，且形成字典明文禁止的
           「档位 → 方式集合」视图。现改为**显式采集**，级别取本方式的参考默认级别。 */
        '<div class="fld" style="margin-top:10px"><label><input type="checkbox" id="aunAuthr"> 可作为「强认证器」登记（硬件令牌 / 生物特征类）</label>' +
          '<div class="mini" style="margin-top:4px">勾选后该方式进入「强认证器绑定管理」的认证方式取值域，<b>认证器级别即取本方式的参考默认级别</b>（须为 <b>L4 / L5</b>）。</div></div>');
      $("#dlg1Ok").onclick = function () {
        var nm = ($("#aunName").value || "").trim(); var lv = parseInt($("#aunLv").value, 10) || 1;
        if (!nm) { markBad($("#aunName"), true); toast("请填写方式名称"); return; }
        if (AU.dict.methods.some(function (x) { return x.name === nm; })) { markBad($("#aunName"), true); toast("方式名已存在"); return; }
        var bind = !!($("#aunBind") && $("#aunBind").checked);
        var authr = !!($("#aunAuthr") && $("#aunAuthr").checked);
        if (authr && lv < 4) { toast("可作为强认证器登记的方式，其参考默认级别须为 L4 或 L5"); return; }
        AU.dict.methods.push({ id: "m_" + Date.now(), name: nm, defLv: lv, authrLv: authr ? lv : 0, srcBind: bind,
          interactive: !!($("#aunInter") && $("#aunInter").checked),
          inherent: ($("#aunInh").value || "").trim() || "—",
          inSession: !!($("#aunInSess") && $("#aunInSess").checked) });
        AU_SRC_METHODS = (AU.dict.methods || AU_METHODS).slice();
        auPgNew(AUD, AU.dict.methods.length, true);
        auSave(); closeDlg(); auRerender(); toast("已新增（演示）· 已跳至第 " + AUD.pg + " 页");
      };
      break;
    }
    /* 认证源 */
    case "srcView": AUS.cur = id; auRerender(); break;
    case "srcList": AUS.cur = ""; auRerender(); break;
    case "srcTest": {
      var ts = AU.sources.filter(function (x) { return x.id === id; })[0]; if (!ts) break;
      if (!ts.conn || ts.conn.kind === "local") {
        openDlg("无需连通性测试",
          "认证源 <b>" + esc(ts.name) + "</b> 为<b>本地账号体系</b>，<b>不连接任何外部目录或 IdP</b>，无外部连接可测。口令与锁定规则请在「账号与口令策略」中维护。");
        break;
      }
      /* ★ R56（E-B）：原实现在此**拒绝**已停用源的连通性测试（「请先启用后再测试」），
         而启用准入又要求「须先完成连通性测试」⇒ **新建源双向死锁**（种子 `src_ca` 即此态：
         `st:"已停用"` 且 `lastTest` 空 ⇒ 既不可测、亦不可启用，开箱无法上线）。
         FL1 状态表明确「已停用（新建）」的下一步就是「配连接参数 → 连通性测试 → 启用」
         ⇒ 测试**必须**可在停用态发起。改为放行，并在弹窗内注明该源当前未启用（测试只读、不改运行面）。 */
      var _stopped = ts.st !== "已启用";
      var tcf = {}; (ts.conn.fields || []).forEach(function (f) { tcf[f.k] = f.v; });
      var tgt = ts.conn.kind === "ldap" ? (tcf.addr || "—") + (tcf.port ? ":" + tcf.port : "")
        : ts.conn.kind === "oidc" ? (tcf.issuer || "—")
        : (tcf.root || "—");
      var probe = ts.conn.kind === "ldap" ? "向 <code>" + esc(tgt) + "</code> 发起 TLS 握手并用 Bind DN 做一次<b>只读绑定</b>"
        : ts.conn.kind === "oidc" ? "拉取 <code>" + esc((tcf.issuer || "—") + "/.well-known/openid-configuration") + "</code> 与验签公钥（JWKS）并按 <b>" + esc(tcf.alg || "RS256") + "</b> 校验签名"
        : "校验信任根链完整性并试拉一次 CRL";
      /* ★ 2026-10-10（R20）：启用「故障转移」时把**主 → 备**两端一并列出 —— 否则备用节点
         只是填了没人读的装饰（历史上 `port2` 正是因此被删）。 */
      var _foLine = (ts.conn.kind === "ldap" && tcf.fo && tcf.foAddr)
        ? '<br><b>故障转移</b>：主 <code>' + esc(tgt) + "</code> → 备 <code>" + esc((tcf.foAddr || "") + (tcf.foPort ? ":" + tcf.foPort : "")) + "</code>（主节点不可用时自动切换，切换事件入审计）"
        : "";
      /* ★ 2026-10-10（R21）：把 OIDC / CA 的**能力开关**一并叙述出来 —— 此前 `disc` / `alg` /
         `jwks` / `crl` / `strict` / `ocsp` 收集后无任何消费点（只存不读）；现它们真被读。 */
      var _jkLine = (ts.conn.kind === "oidc")
        ? "<br><b>JWKS</b>：" + (tcf.disc
            ? "随发现文档自动获取（缓存 <b>" + esc(tcf.jwks || "12") + "h</b>）"
            : "已关闭发现文档 ⇒ 手工地址 <code>" + esc(tcf.jwksUri || "—") + "</code>（缓存 <b>" + esc(tcf.jwks || "12") + "h</b>）")
        : "";
      var _crlLine = (ts.conn.kind === "ca")
        ? "<br><b>吊销校验</b>：CRL 周期 <b>" + esc(tcf.crl || "12") + "h</b> · 拉取失败 <b>" +
          (tcf.strict ? "拒绝新会话并告警" : "仅告警") + "</b> · OCSP 兜底 <b>" + (tcf.ocsp ? "启用" : "未启用") + "</b>"
        : "";      var _stopLine = _stopped
        ? "<br><b>该源当前已停用</b>：本次为<b>只读连通性验证</b>，不改变运行面；通过后仍须手工<b>启用</b>才对用户可见。"
        : "";
      openDlg("连通性测试 · " + ts.name, "将" + probe + "。<b>测试使用只读凭据</b>，<b>不写入任何数据</b>；<b>测试结果入审计</b>。",
        '<div class="mini" style="line-height:2">连接地址：<code>' + esc(tgt) + "</code><br>超时设置：<b>" +
        esc(tcf.qto || "5") + "s</b> · 重试：<b>1</b> 次" + _foLine + _jkLine + _crlLine + _stopLine + "</div>");
      $("#dlg1Ok").onclick = function () {
        ts.conn.lastTest = AU_TS_STAMP + " · 连通 往返 42ms";
        auSave(); closeDlg(); auRerender(); toast("连通性测试通过（演示）");
      };
      break;
    }
    case "connSave": {
      /* 页内保存连接参数 / 账号与口令策略。
         ★ 与旧版弹窗式编辑的两处根本差别：
           1) 不再整体重写参数表 —— 只更新本表字段，本表之外的字段无从被抹掉；
           2) 口令类字段留空＝不修改；首次配置留空则拦截（旧版 OIDC Secret 标了必填却从不读取）。
         ★ 确认分档（口径：只改配置内容的保存走普通确认，不做二次认证）：
           已启用源的参数变更**即刻作用于在线认证链路** ⇒ 保存前普通确认；
           已停用源无生效面 ⇒ 直接保存。 */
      var cs = AU.sources.filter(function (x) { return x.id === id; })[0]; if (!cs || !cs.conn) break;
      var cIsLocal = cs.conn.kind === "local";
      var cfs = cs.conn.fields || [], cnv = {}, cbad = null, cbadName = "";
      cfs.forEach(function (f) {
        if (f.ro) return;   /* ★ 平台统一只读项无控件，不参与收集 */
        var el = document.getElementById("auc_" + f.k); if (!el) return;
        cnv[f.k] = f.type === "check" ? !!el.checked : (el.value || "").trim();
      });
      cfs.forEach(function (f) {
        if (f.type === "password" || !f.req) return;
        if (!cnv[f.k] && !cbad) { cbad = document.getElementById("auc_" + f.k); cbadName = f.label; }
      });
      if (cbad) { markBad(cbad, true); toast("必填参数未填写：" + cbadName); return; }
      /* ★ 2026-10-10（R13）：数值语义字段补范围校验 —— input[type=number] 的 min/max 只是浏览器侧提示，
         脚本 / 回填 / 直接改 DOM 都能绕过；落库前须再拦一道。空值放行（非必填项留空＝不改 / 不设）。 */
      var cnum = null, cnumMsg = "";
      cfs.forEach(function (f) {
        if (f.type !== "number" || cnum) return;
        var raw = String(cnv[f.k] == null ? "" : cnv[f.k]).trim();
        if (raw === "") return;
        if (!/^\d+$/.test(raw)) { cnum = document.getElementById("auc_" + f.k); cnumMsg = f.label + " 须为整数"; return; }
        var nv = parseInt(raw, 10);
        if ((f.min != null && nv < f.min) || (f.max != null && nv > f.max)) {
          cnum = document.getElementById("auc_" + f.k);
          cnumMsg = f.label + " 取值须在 " + (f.min != null ? f.min : 0) + " ~ " + (f.max != null ? f.max : "无上限") + " 之间";
        }
      });
      if (cnum) { markBad(cnum, true); toast(cnumMsg); return; }
      /* ★ 2026-10-10（R15）：**跨字段**非法组合 —— 逐字段区间校验挡不住「单看都合法、合起来矛盾」的取值。
         实例：连接池下限 0~1000 / 上限 1~2000 区间重叠，`下限 100 > 上限 5` 两个字段各自全部通过，
         原实现照样落库并渲染成「正常」。此处按**字段对**补一次比较（空值放行，与逐字段同口径）。 */
      var _pairs = [["poolMin", "poolMax"]], _crossBad = [], _crossMsg = "";
      _pairs.forEach(function (pr) {
        if (_crossBad.length) return;
        var _fa = cfs.filter(function (f) { return f.k === pr[0]; })[0];
        var _fb = cfs.filter(function (f) { return f.k === pr[1]; })[0];
        if (!_fa || !_fb) return;
        var _va = String(cnv[_fa.k] == null ? "" : cnv[_fa.k]).trim();
        var _vb = String(cnv[_fb.k] == null ? "" : cnv[_fb.k]).trim();
        if (_va === "" || _vb === "") return;
        if (parseInt(_va, 10) > parseInt(_vb, 10)) {
          /* ★ 2026-10-10（R15-g）：约束是**成对**的，故**两侧同标** —— 只标一侧（原先只记下限侧）
             会让用户以为另一侧无问题；想改上限值时更是毫无视觉指引。 */
          _crossBad = [document.getElementById("auc_" + _fa.k), document.getElementById("auc_" + _fb.k)];
          _crossMsg = _fa.label + "（" + _va + "）不得大于 " + _fb.label + "（" + _vb + "）";
        }
      });
      if (_crossBad.length) {
        _crossBad.forEach(function (el9) { if (el9) markBad(el9, true); });
        toast(_crossMsg); return;
      }
      /* ★ 2026-10-10（R20）：**故障转移 = 主备两节点**的成套口径。
         勾选 `fo` ⇒ 「备用目录地址 / 备用端口」必填（缺一则切换无目标、开关空转），且备用地址**不得与主地址相同**；
         未勾选 ⇒ 备用项**清空不落库**（不残留上次填过的备节点，避免「开关关了备节点还在」的错觉）。 */
      var _foF = cfs.filter(function (f) { return f.k === "fo"; })[0];
      var _foOn = !!(_foF ? cnv[_foF.k] : false);
      var _foAddrF = cfs.filter(function (f) { return f.k === "foAddr"; })[0];
      var _foPortF = cfs.filter(function (f) { return f.k === "foPort"; })[0];
      if (_foOn && _foAddrF) {
        if (!cnv.foAddr) { markBad(document.getElementById("auc_foAddr"), true); toast(_foAddrF.label + " 未填写：启用「故障转移」须指定备用节点，否则无从切换"); return; }
        if (_foPortF && !cnv.foPort) { markBad(document.getElementById("auc_foPort"), true); toast(_foPortF.label + " 未填写：启用「故障转移」须指定备用端口"); return; }
        if (cnv.foAddr === cnv.addr) { markBad(document.getElementById("auc_foAddr"), true); toast("备用目录地址不得与「目录地址」相同 —— 同一节点不构成主备"); return; }
      } else if (_foAddrF) {
        cnv.foAddr = ""; cnv.foPort = "";
      }
      /* ★ 2026-10-10（R21）：**反义条件字段** —— 「发现文档」关闭时 `verify`（强制开启的
         ID Token 验签）没有公钥来源 ⇒ JWKS 地址必填；开启时地址随发现文档取得，手填值清空
         （避免「开关开了、手填地址还在」的错觉）。与 R20 `fo` 同一口径：**能力声明的输入
         必须齐备、且开关与输入同生同灭**。 */
      var _discF = cfs.filter(function (f) { return f.k === "disc"; })[0];
      var _jwksUF = cfs.filter(function (f) { return f.k === "jwksUri"; })[0];
      if (_discF && _jwksUF) {
        if (!cnv.disc && !cnv.jwksUri) {
          markBad(document.getElementById("auc_jwksUri"), true);
          toast(_jwksUF.label + " 未填写：已关闭「发现文档」，验签公钥无从自动获取，须手工提供 JWKS 地址"); return;
        }
        if (cnv.disc) cnv.jwksUri = "";
      }
      /* ★ 2026-10-10（R15）：`date` 语义字段（根证书有效期至）此前是纯文本、**零校验** ——
         与 R14 已给 caUp / mtlsUp 的 `YYYY-MM-DD` 口径不一致。逐字段校格式 + 往返比对真值
         （`2029-02-31` 形似合法、实为非法，须被 `Date` 往返揭穿）。 */
      var _cdt = null, _cdtMsg = "";
      cfs.forEach(function (f) {
        if (!f.date || _cdt) return;
        var raw = String(cnv[f.k] == null ? "" : cnv[f.k]).trim();
        if (raw === "") return;
        if (!bzYmdOk(raw)) {
          _cdt = document.getElementById("auc_" + f.k);
          _cdtMsg = f.label + (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? " 不是有效日期（" + raw + "）" : " 须为 YYYY-MM-DD 格式");
        }
      });
      if (_cdt) { markBad(_cdt, true); toast(_cdtMsg); return; }
      /* ★ 2026-10-10（R17）：**地址类字段零格式校验** —— 目录地址 / Issuer / 回调地址三个 URL 语义字段
         此前只判非空，`随便写` 也能落库；而「测试连接」正是拿目录地址去握手、拿 Issuer 去拉
         /.well-known/openid-configuration（见 auTestDlg）⇒ 非法地址只是把失败推迟到运行时。
         此处按字段上的 `url` 标记逐字段校协议与形态：
           · `ldap`：须 `ldap://` 或 `ldaps://` + **仅主机、不得带路径、不得带端口** —— 测试连接把
             目标拼成 `addr + ":" + port`（见 auTestDlg），地址里带 `/` 或再带 `:port` 会拼出
             `ldaps://host/:636` / `ldaps://host:636:636` 这类坏地址（端口由「端口」字段单独填写）；
           · `https`：须 `https://`（OIDC 规范要求 Issuer 与回调地址走 TLS）。
         空值放行 —— 非必填留空＝不修改；必填已在上一步拦下（与数值 / 日期 / 跨字段同口径）。 */
      var _curl = null, _curlMsg = "";
      cfs.forEach(function (f) {
        if (!f.url || _curl) return;
        var rawU = String(cnv[f.k] == null ? "" : cnv[f.k]).trim();
        if (rawU === "") return;
        var mu = /^([a-zA-Z][a-zA-Z0-9+.\-]*):\/\/([^\s\/?#]+)(\/[^\s?#]*)?$/.exec(rawU);
        var okU = !!mu;
        if (okU && f.url === "ldap") okU = (mu[1] === "ldap" || mu[1] === "ldaps") && !mu[3] && mu[2].indexOf(":") < 0;
        if (okU && f.url === "https") okU = (mu[1] === "https");
        if (okU && f.url === "http") okU = (mu[1] === "http" || mu[1] === "https");
        if (!okU) {
          _curl = document.getElementById("auc_" + f.k);
          _curlMsg = (f.url === "ldap")
            ? f.label + " 须为 ldap:// 或 ldaps:// 开头的主机地址（如 ldaps://ad.corp.internal）；端口由「端口」字段单独填写"
            : (f.url === "http")
              ? f.label + " 须为 http:// 或 https:// 开头的地址（如 " + f.ph + "）"
              : f.label + " 须为 https:// 开头的地址（如 " + f.ph + "）";
        }
      });
      if (_curl) { markBad(_curl, true); toast(_curlMsg); return; }
      /* ★ 2026-10-10（R24）：原 R14 在此拦截「传输加密＝不加密 × 强制证书校验」这一组合，
         但该组合在**现行控件下不可构造** —— `enc` 的取值域只有「TLS 强制（关闭 start_tls）」
         与「start_tls 升级」两个 TLS 项，枚举里**没有「不加密」**（仅当旧快照遗留值经
         `auConnForm` 回填时才可能命中）⇒ 本分支属**不可达死代码**。约束已单点落在 `enc`
         的取值域上，运行期兜底随之撤除：守卫应描述「可能发生的状态」，描述一个取不到的状态
         只会让读者误以为「不加密」仍是可选项。 */
      var cpw = cfs.filter(function (f) { return f.type === "password"; })[0];
      var cpwNew = false;
      if (cpw) {
        cpwNew = !!cnv[cpw.k];
        if (!cpwNew && !cs.conn.pwdSet) {
          markBad(document.getElementById("auc_" + cpw.k), true);
          toast(cpw.label + " 首次配置须填写（加密存储）"); return;
        }
      }
      var doConnSave = function () {
        if (cpw && cpwNew) cs.conn.pwdSet = true;
        cfs.forEach(function (f) { if (f.type !== "password" && !f.ro) { f.v = cnv[f.k]; } });
        cs.conn.lastTest = "";
        auSave(); auRerender();
        toast((cIsLocal ? "账号与口令策略" : "连接参数") + "已保存（台账已更新）");
      };
      if (cs.st === "已启用") {
        confirmDlg("保存" + (cIsLocal ? "账号与口令策略" : "连接参数") + " · " + cs.name,
          "认证源 <b>" + esc(cs.name) + "</b> 当前为 <b>已启用</b>，本次参数变更将<b>即刻作用于在线认证链路</b>。<b>确认后入审计</b>。",
          doConnSave, "保存并下发");
      } else doConnSave();
      break;
    }
    case "srcSync": {
      var sy = AU.sources.filter(function (x) { return x.id === id; })[0]; if (!sy) break;
      var smd = sy.sync ? sy.sync.mode : "";
      if (!smd || smd === "—") { openDlg("无需同步", "认证源 <b>" + esc(sy.name) + "</b> 为<b>本地账号体系</b>，<b>不涉及外部同步</b>。"); break; }
      /* ★ 2026-10-10（R10）：`登录时按需映射`（OIDC 等）**不建全量副本、也没有可手动触发的同步**
         —— 账号在用户首次登录时按来源主体建立映射。渲染「立即同步」属入口与业务事实不符
         （点了只是空跑）。与「未配置」同判据：入口随数据出现，无同步可做就不渲染。 */
      if (smd === "登录时按需映射") {
        openDlg("无需手动同步",
          "认证源 <b>" + esc(sy.name) + "</b> 的同步方式为 <b>登录时按需映射</b>：平台侧<b>不建全量账号副本</b>，账号在用户<b>首次登录时</b>按来源主体建立映射并落库，此后仅更新时间戳。<b>无全量 / 增量同步可手动触发</b>；如需改为定时同步，请用「编辑源属性」调整同步方式。");
        break;
      }
      if (smd === "未配置") {
        openDlg("尚未配置同步",
          "认证源 <b>" + esc(sy.name) + "</b> 的<b>同步方式尚未配置</b> —— 须先明确<b>账号从哪来、按什么方式同步</b>，才谈得上执行同步。请先用<b>「编辑源属性」</b>选定<b>同步方式</b>，同步入口随后出现。");
        break;
      }
      if (sy.st !== "已启用") { openDlg("源未启用", "认证源 <b>" + esc(sy.name) + "</b> 当前为 <b>" + esc(sy.st) + "</b>，<b>停用源不执行同步</b>。请先启用后再同步。"); break; }
      idAsk("立即同步 · " + sy.name,
        "将立即执行一次同步（方式：<b>" + esc(smd) + "</b>）。<b>同步只管理来源标注为本源的账号，不覆盖内部手工账号</b>；属性冲突时<b>告警而非覆盖</b>。<b>本次同步入审计</b>。",
        function () {
          sy.sync.last = AU_TS_STAMP + " · 增量 3 条 / 冲突 1 条（告警，未覆盖）";
          auSave(); auRerender(); toast("已发起同步（演示）");
        }, "同步");
      break;
    }
    case "srcMap": {
      var mp = AU.sources.filter(function (x) { return x.id === id; })[0]; if (!mp) break;
      var cur = {};
      (mp.sync && mp.sync.map || []).forEach(function (m) { cur[m[0]] = m[1]; });
      var keys = ["账号名", "姓名", "邮箱", "部门", "岗位", "状态"];
      openDlg("编辑字段映射 · " + mp.name,
        "把平台字段映射到外部来源属性。<b>账号名必填</b>；<b>未映射的字段留空</b>，不猜测默认值。",
        keys.map(function (k, i) {
          return '<div class="fld"' + (i ? ' style="margin-top:10px"' : "") + '><label for="aum' + i + '">' + k + (k === "账号名" ? ' <span class="req">*</span>' : "") + "</label>" +
            '<input id="aum' + i + '" value="' + esc(cur[k] || "") + '" placeholder="' + (k === "账号名" ? "如 sAMAccountName" : "留空表示不映射") + '"></div>';
        }).join(""));
      $("#dlg1Ok").onclick = function () {
        var nm = ($("#aum0").value || "").trim();
        if (!nm) { markBad($("#aum0"), true); toast("账号名映射必填"); return; }
        var doMapSave = function () {
          mp.sync = mp.sync || { mode: "—", note: "—" };
          /* 未映射落**空串**，不落「—」——「—」在本页是**展示层缺省符**（见 syncMap 与「同步说明」兜底），
             落成数据后会与「真的映射到一个叫『—』的属性」不可区分。 */
          mp.sync.map = keys.map(function (k, i) { return [k, ($("#aum" + i).value || "").trim()]; });
          auSave(); closeDlg(); auRerender(); toast("已保存字段映射（演示）");
        };
        /* ★ 2026-10-10（R18）：统一「只改配置内容的保存」口径 —— 字段映射变更**即刻作用于在线认证链路**，
           与 connSave 同属「改变生效面」的判据（判据认的是生效面、不是动作名称）⇒ **已启用**源保存前
           走普通确认；未启用源无生效面，直接落库。 */
        if (mp.st === "已启用") {
          confirmDlg("保存字段映射 · " + mp.name,
            "认证源 <b>" + esc(mp.name) + "</b> 当前为 <b>已启用</b>，字段映射的变更将<b>即刻作用于在线认证链路</b>。<b>确认后入审计</b>。",
            doMapSave, "保存并下发");
        } else doMapSave();
      };
      break;
    }
    case "srcEditAttr": {
      var ea = AU.sources.filter(function (x) { return x.id === id; })[0]; if (!ea) break;
      openDlg("编辑源属性 · " + ea.name,
        "维护认证源的<b>展示属性</b>。⚠ <b>类型与连接参数不在此改</b> —— 变更类型等于换一个认证源，请新增后停用旧源。",
        '<div class="fld"><label for="aueName">展示名称 <span class="req">*</span></label><input id="aueName" value="' + esc(ea.name) + '"></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aueTag">来源标注</label><input id="aueTag" value="' + esc(ea.tag) + '"><div class="mini" style="margin-top:4px">账号<b>来源标识</b>，须唯一；同步仅管理来源为该标注的账号。<b>改标注会让旧标注下的账号不再被本源同步</b>。类型已定（' + esc(auTagBase(ea.type)) + ' 系），通常无需改动。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aueOrder">展示顺序 <span class="req">*</span></label><input id="aueOrder" type="number" min="1" value="' + esc(ea.order) + '"><div class="mini" style="margin-top:4px">与启用状态共同决定<b>登录页呈现次序</b>。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aueDesc">说明</label><input id="aueDesc" value="' + esc(ea.desc) + '"></div>' +
        /* ★ 2026-10-10（R11）：本地源**不渲染**同步方式控件 —— 原实现对本地源同样渲染全量下拉，
           而保存处强制 smE="—" ⇒ 用户的改动被静默丢弃、界面却提示「源属性已更新」（入口与事实不符）。 */
        (ea.type === "本地账号体系"
          ? '<div class="fld" style="margin-top:10px"><label>同步方式</label><div class="mini">本地账号体系由平台<b>自管</b>，<b>无外部同步</b>（固定「—」）。</div></div>'
          : '<div class="fld" style="margin-top:10px"><label for="aueSync">同步方式</label><select id="aueSync">' +
            (function () { var cu = (ea.sync && ea.sync.mode) || "未配置"; var ls = auSyncModes(ea.type);
              if (ls.indexOf(cu) < 0) ls.push(cu);
              return ls.map(function (o3) { return "<option" + (o3 === cu ? " selected" : "") + ">" + esc(o3) + "</option>"; }).join(""); })() + "</select>" +
            '<div class="mini" style="margin-top:4px">账号<b>从哪来、按什么方式同步</b>；<b>未配置的源不能启用</b>。</div></div>') +
        '<div class="fld" style="margin-top:10px"><label>类型</label><div class="mini">' + esc(ea.type) + '（<b>不可改</b>）</div></div>');
      $("#dlg1Ok").onclick = function () {
        var nm2 = ($("#aueName").value || "").trim();
        if (!nm2) { markBad($("#aueName"), true); toast("请填写展示名称"); return; }
        if (AU.sources.some(function (x) { return x.id !== ea.id && x.name === nm2; })) { markBad($("#aueName"), true); toast("展示名称已存在"); return; }
        /* ★ 2026-10-10（R13）：标注唯一性（同 srcNew）；改标注会让**旧标注下的账号静默孤儿化**，
           故保存后按新旧标注是否变化给出后果提示。 */
        var tgE = ($("#aueTag").value || "").trim() || nm2;
        if (AU.sources.some(function (x) { return x.id !== ea.id && (x.tag || x.name) === tgE; })) {
          markBad($("#aueTag"), true); toast("来源标注已被其他认证源使用：" + tgE + "（标注是账号同步的归属键，须唯一）"); return;
        }
        var _oldTag = ea.tag || ea.name;
        var od = parseInt($("#aueOrder").value, 10);
        if (!(od > 0)) { markBad($("#aueOrder"), true); toast("展示顺序须为不小于 1 的整数"); return; }
        /* ★ 2026-10-10（R15）：同 srcNew —— 次序须唯一（排除自身）。 */
        if (AU.sources.some(function (x) { return x.id !== ea.id && x.order === od; })) {
          markBad($("#aueOrder"), true); toast("展示顺序已被其他认证源占用：" + od + "（次序须唯一）"); return;
        }
        /* ★ 2026-10-10（R16）：名称 / 标注此前**在本行之前**就已写进内存对象，而紧随其后的
           「展示顺序」校验可能 `return` 提前退出 —— 被拦下的改名会留在内存里，用户点「取消」
           也不回滚，且会被**后续任一次 auSave()** 永久落库（来源标注是账号同步的归属键，
           误改会让旧标注下的账号静默孤儿化）。改为所有校验通过后统一提交。 */
        var doAttrSave = function () {
          ea.name = nm2;
          ea.tag = tgE;
          ea.order = od;
          ea.desc = ($("#aueDesc").value || "").trim() || "—";
          /* 同步方式就地可改；**方式变更时重写说明** —— 旧说明描述的是旧方式，保留会自相矛盾。 */
          /* ★ 2026-10-10（R11）：本地源已不渲染 #aueSync ⇒ 取值须先按类型短路（否则空引用） */
          var smE = (ea.type === "本地账号体系") ? "—" : ((($("#aueSync") || {}).value || "").trim() || "未配置");
          if (!ea.sync || ea.sync.mode !== smE) {
            ea.sync = ea.sync || { map: [] };
            ea.sync.mode = smE;
            ea.sync.note = auSyncNote(smE);
          }
          auSave(); closeDlg(); auRerender();
          toast(_oldTag !== tgE
            ? "源属性已更新；来源标注由「" + _oldTag + "」改为「" + tgE + "」—— 旧标注下的账号不再被本源同步（演示）"
            : "源属性已更新（演示）");
        };
        /* ★ 2026-10-10（R18）：统一「只改配置内容的保存」口径 —— 源属性的**展示顺序**与**同步方式**
           均**即刻作用于在线认证链路**（前者改登录页呈现次序、后者改账号同步行为），与 connSave
           同一判据 ⇒ 已启用源保存前走普通确认；未启用源无生效面，直接落库。 */
        if (ea.st === "已启用") {
          confirmDlg("保存源属性 · " + ea.name,
            "认证源 <b>" + esc(ea.name) + "</b> 当前为 <b>已启用</b>，展示属性（含<b>展示顺序</b>与<b>同步方式</b>）的变更将<b>即刻作用于在线认证链路</b>。<b>确认后入审计</b>。",
            doAttrSave, "保存并下发");
        } else doAttrSave();
      };
      break;
    }
    case "srcDel": {
      var dl = AU.sources.filter(function (x) { return x.id === id; })[0]; if (!dl) break;
      if (dl.st !== "已停用") {
        openDlg("不可删除", "认证源 <b>" + esc(dl.name) + "</b> 当前为 <b>" + esc(dl.st) + "</b>。<b>须先停用再删除</b> —— 直接删除会让正在使用该源登录的用户被静默剔除。");
        break;
      }
      var dw = (dl.ways || []).length;
      auConfirmEff("删除认证源",
        "将删除 <b>" + esc(dl.name) + "</b> 及其 <b>" + dw + " 条「源 × 方式」记录。<b>字典中的方式名不随之删除</b>；本源引用解除后，相关方式在字典页才可删除。<b>此操作入审计</b>。",
        function () {
          AU.sources = AU.sources.filter(function (x) { return x.id !== dl.id; });
          AUS.cur = ""; auSave(); auRerender(); toast("已删除认证源（演示）");
        }, "删除");
      break;
    }
    case "srcToggle": {
      var s = AU.sources.filter(function (x) { return x.id === id; })[0]; if (!s) break;
      var ns = s.st === "已启用" ? "已停用" : "已启用";
      /* 启用准入校验**前置**到确认之前：旧实现先弹确认、确认后才校验，校验不过时确认框
         已经关掉，用户看到的是「点完确认什么也没发生」，归因困难、也无从重试。 */
      if (ns === "已启用") {
        var ck = s.conn || {}, cfs2 = ck.fields || [], why = "";
        if (!cfs2.length) why = "请先配置连接参数";
        else {
          var cmiss = cfs2.filter(function (f) { return f.req && String(f.v == null ? "" : f.v).trim() === ""; });
          if (cmiss.length) why = "必填参数未填（" + cmiss[0].label + " 等 " + cmiss.length + " 项）";
        }
        if (!why && cfs2.some(function (f) { return f.type === "password"; }) && !ck.pwdSet) why = "请先设置口令 / 密钥";
        var smNow = s.sync ? String(s.sync.mode || "") : "";
        if (!why && ck.kind !== "local" && (!smNow || smNow === "未配置" || smNow === "—"))
          why = "该源尚未配置同步方式（账号从哪来未明确）";
        /* ★ R53（C-F3）：FL1「新建的源默认已停用 —— 必须先完成连接参数与连通性测试，才能启用」
           「连通性测试未通过 ⇒ 拒绝启用」。启用准入此前只查四项**配置面**（参数 / 口令 /
           同步方式 / 认证方式），**不含**连通性测试结果 ⇒ 一个「从未测试」（详情页示「未测试」）
           的非 local 源可被直接启用，登录时才暴露不可达。local 源无外部连接，按 FL1 免测。 */
        if (!why && ck.kind !== "local" && !ck.lastTest)
          why = "请先完成连通性测试（FL1：连接参数与连通性测试通过后方可启用）";
        if (!why && !(s.ways || []).length) why = "该源尚未配置任何认证方式";
        if (why) { toast("启用被拒：" + why); break; }
      }
      auConfirmEff(ns === "已停用" ? "停用认证源" : "启用认证源",
        "将把认证源 <b>" + esc(s.name) + "</b> 置为 <b>" + ns + "</b>。" + (ns === "已停用"
          ? "停用后该源<b>不在登录页展示</b>，已使用该源方式登录的用户将无法再选择该源。"
          : "启用后该源<b>即刻在登录页对用户可见</b>。") + "<b>本次变更入审计</b>。",
        function () { s.st = ns; auSave(); auRerender(); toast("已" + ns.slice(1) + "（演示）"); });
      break;
    }
    case "srcRevoke": {
      /* 「紧急撤销信任」≠「停用」（FL1 只定义了后者）：
         · 停用 = 停止新登录，**存量会话按会话有效期自然到期**，适用正常维护；
         · 紧急撤销 = 拒绝新登录 **并撤销 / 重新验证该源下的存量会话**，适用认证源泄露 / 失陷。 */
      var sr = AU.sources.filter(function (x) { return x.id === id; })[0];
      if (!sr || sr.st !== "已启用") break;
      ask2FA("紧急撤销信任 · " + esc(sr.name), function () {
        sr.st = "已停用"; auSave(); auRerender();
        toast("已拒绝新登录并撤销该源存量会话（演示）");
      }, null, "将把认证源 <b>" + esc(sr.name) + "</b> 置为<b>已停用</b>，并<b>拒绝新登录、撤销该源下的存量会话</b>（须重新认证方可继续）。与「停用」的区别：停用只停止新登录、存量会话按会话有效期自然到期（适用正常维护）；本动作用于<b>认证源泄露 / 失陷</b>。本次变更入审计。");
      break;
    }
    case "srcNew": {
      openDlg("新增认证源", "新增一个身份来源（本地 / AD / LDAP / OIDC 等）。新增后须在详情页为其配置<b>支持的认证方式</b>。",
        '<div class="fld"><label for="ausName">展示名称 <span class="req">*</span></label><input id="ausName" placeholder="如 分行 AD 域"></div>' +
        '<div class="fld" style="margin-top:10px"><label for="ausType">类型</label><select id="ausType" onchange="auSrcTypeSync(this.value)"><option>本地账号体系</option><option>AD / LDAP</option><option>OIDC 外部 IdP</option><option>CA / 证书体系</option></select></div>' +
        '<div class="fld" style="margin-top:10px"><label for="ausTag">来源标注</label><input id="ausTag" data-auto="1" oninput="auTagDirty(this)" placeholder="随类型自动带出"><div class="mini" style="margin-top:4px">默认按<b>类型自动带出</b>（本地→LOCAL / AD·LDAP→AD / OIDC→OIDC / CA→CA，同类型多源自动编号）；<b>如需自定义可覆盖</b>。标注是账号来源标识，须唯一。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="ausDesc">说明</label><input id="ausDesc" placeholder="如 面向分行柜面的目录服务"></div>' +
        '<div class="fld" id="ausSyncWrap" style="margin-top:10px"><label for="ausSync">同步方式</label><select id="ausSync">' +
          AU_SYNC_MODES.map(function (o2) { return "<option" + (o2 === "未配置" ? " selected" : "") + ">" + esc(o2) + "</option>"; }).join("") + "</select>" +
          '<div class="mini" style="margin-top:4px">账号<b>从哪来、按什么方式同步</b> —— <b>未配置的源不能启用</b>；本地账号体系选「—」（无外部同步）。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="ausOrder">展示顺序 <span class="req">*</span></label><input id="ausOrder" type="number" min="1" value="' + (AU.sources.reduce(function (mx, x) { return Math.max(mx, parseInt(x.order, 10) || 0); }, 0) + 1) + '"><div class="mini" style="margin-top:4px">与启用状态共同决定<b>登录页呈现次序</b>；默认排在末位，可在「编辑源属性」中调整。</div></div>');
      /* ★ 2026-10-10（R10）：类型默认即「本地账号体系」，但同步方式字段只在 onchange 时收起
         ⇒ 打开弹窗时该字段可见且可选，与「本地无外部同步」自相矛盾（首屏即错）。开窗即同步一次。 */
      auSrcTypeSync(($("#ausType") || {}).value || "本地账号体系");
      $("#dlg1Ok").onclick = function () {
        var nm = ($("#ausName").value || "").trim();
        if (!nm) { markBad($("#ausName"), true); toast("请填写展示名称"); return; }
        if (AU.sources.some(function (x) { return x.name === nm; })) { markBad($("#ausName"), true); toast("展示名称已存在"); return; }
        /* ★ 2026-10-10（R13）：来源标注是**账号同步的归属键**（同步只管理标注为本源的账号）
           ⇒ 必须唯一。原实现只查重名、不查标注 ⇒ 两源可共用同一标注，争抢同一批账号、归属歧义。 */
        var tgNew = ($("#ausTag").value || "").trim() || nm;
        if (AU.sources.some(function (x) { return (x.tag || x.name) === tgNew; })) {
          markBad($("#ausTag"), true); toast("来源标注已被其他认证源使用：" + tgNew + "（标注是账号同步的归属键，须唯一）"); return;
        }
        /* ★ R61·轮12：校验序按**视觉序** —— 表单为 展示名称 → 类型 → 来源标注 → 说明 → **同步方式** → **展示顺序**；
           原先先校验展示顺序、后校验同步方式，两处都不合规时会先提示更靠后的那一栏。 */
        var _tyNew = $("#ausType").value;
        var _smNew = (_tyNew === "本地账号体系") ? "—" : (($("#ausSync").value || "").trim() || "未配置");
        /* 🎯 2026-10-10（R12）：兜底 —— 提交值必须落在该类型可用集内（下拉已收敛，此处防脚本 / 回填绕过）。 */
        if (auSyncModes(_tyNew).indexOf(_smNew) < 0) { markBad($("#ausSync"), true); toast("该类型不支持此同步方式：" + _smNew); return; }
        var ord = parseInt($("#ausOrder").value, 10);
        if (!(ord >= 1)) { markBad($("#ausOrder"), true); toast("展示顺序须为 ≥1 的整数"); return; }
        /* ★ 2026-10-10（R15）：展示顺序是**登录页源的呈现次序**，必须唯一 —— 原实现只在新增时
           取 `length + 1` 作默认值、**不查重**，删掉中间一条再新增就与既有 order 撞车，次序不定。
           与来源标注同族（归属键须唯一），此处同判。 */
        if (AU.sources.some(function (x) { return x.order === ord; })) {
          markBad($("#ausOrder"), true); toast("展示顺序已被其他认证源占用：" + ord + "（次序须唯一）"); return;
        }
        AU.sources.push({ id: "src_" + Date.now(), name: nm, type: $("#ausType").value, st: "已停用", order: ord, tag: tgNew, desc: ($("#ausDesc").value || "").trim() || "—",
          conn: auConnSeed($("#ausType").value === "AD / LDAP" ? "ldap" : ($("#ausType").value === "OIDC 外部 IdP" ? "oidc" : ($("#ausType").value === "CA / 证书体系" ? "ca" : "local")), null, false, ""),
          sync: { mode: _smNew, note: auSyncNote(_smNew), map: [] },
          ways: [] });
        auPgNew(AUS, AU.sources.length, true);
        auSave(); closeDlg(); auRerender(); toast("已新增（演示）· 已跳至第 " + AUS.pg + " 页");
      };
      break;
    }
    case "srcAddWay": {
      var as = AU.sources.filter(function (x) { return x.id === id; })[0]; if (!as) break;
      var avail = AU_SRC_METHODS.filter(function (m) {
        return !(as.ways || []).some(function (w) { return w.mid === m.id; })
          && (AU.dict.methods || []).some(function (d) { return d.id === m.id; });
      });
      openDlg("添加认证方式", "为该源添加一种认证方式，并<b>联合判定</b>其级别与适用范围 —— <b>级别与适用范围是「本源 × 本方式」这条记录的属性，不是方式本身的属性</b>。⚠ 方式名取自<b>字典</b>（唯一取值域），本页<b>不能自造</b>。字典给的档位只是<b>参考初值</b>。",
        '<div class="fld"><label for="auwMid">认证方式</label><select id="auwMid" onchange="(function(s){var o=s.options[s.selectedIndex];if(o&&o.dataset.lv)document.getElementById(\'auwLv\').value=o.dataset.lv;})(this)">' +
          (avail.length ? avail.map(function (m) { return '<option value="' + m.id + '" data-lv="' + m.defLv + '">' + esc(m.name) + "（参考 L" + m.defLv + "，落库后可改）</option>"; }).join("") : '<option value="">（字典中的方式均已引用）</option>') + "</select>" +
          '<div class="mini" style="margin-top:4px">级别是<b>本源 × 本方式</b>这条记录的属性；下拉里的档位只是<b>参考初值</b>。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="auwLv">级别（本源下联合判定）</label><select id="auwLv">' + [1, 2, 3, 4, 5].map(function (n) { return "<option value=\"" + n + "\"" + (n === (avail.length ? (avail[0].defLv || 2) : 2) ? " selected" : "") + ">L" + n + "</option>"; }).join("") + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>适用范围（本源下联合判定） <span class="req">*</span></label>' + auScopeChips("auwScope", "") +
          '<div class="mini" style="margin-top:4px">取值域＝资产台账的<b>「资产分组」</b>（组名由台账派生；另含通配项「全部资产」）。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label><input type="checkbox" id="auwAnon"> 支持无端（浏览器）</label><div class="mini" style="margin-top:4px">「无端支持」是<b>本源 × 本方式</b>上的<b>适用性声明</b>；<b>无端接入的判定与执行由无端网关承载</b>，本源不承担其执行。</div></div>');
      $("#dlg1Ok").onclick = function () {
        var mid = $("#auwMid").value;
        /* 字典里的方式都被本源引用后，下拉只剩空占位 —— 原实现静默关窗，用户以为卡死。 */
        if (!mid) { toast("字典中的方式均已在本源登记，无可添加项"); return; }
        as.ways = as.ways || [];
        /* ★ 2026-10-10（R14）：适用范围是该记录**联合判定**的结果列之一（列表与判定结果同列展示），
           落「—」等于判定结果留空 ⇒ 与「来源标注」「授权范围」同类，须为实名。 */
        var _wsc = auScopeRead(document.querySelector('[data-scope-box="auwScope"]'));
        if (!_wsc) { toast("请至少选择一项适用范围（取值域＝资产台账「资产组」）"); return; }
        as.ways.push({ mid: mid, lv: parseInt($("#auwLv").value, 10) || 1, scope: _wsc, anon: !!($("#auwAnon") && $("#auwAnon").checked) });
        /* ★ 2026-10-10（R16）：新增记录落在**末页**，而页② 详情表的「源 × 方式」可能有
           多页 —— 原实现不跳页（对照 srcNew / ucNew / isIssue / arNew 均已补 `auPgNew`），
           已有 ≥10 条时再添加一条，屏幕无任何变化、toast 也不含页码 ⇒ 读成「点了没反应」。 */
        auPgNew(AUW, as.ways.length, true);
        auSave(); closeDlg(); auRerender(); toast("已添加（演示）· 已跳至第 " + AUW.pg + " 页");
      };
      break;
    }
    case "wayDel": {
      var ws = AU.sources.filter(function (x) { return x.id === AUS.cur; })[0]; if (!ws) break;
      var wi = parseInt(idx, 10); if (isNaN(wi) || !ws.ways[wi]) break;
      auConfirmEff("移除认证方式", "将从该源移除 <b>" + esc(auMethodName(ws.ways[wi].mid)) + "</b> 这条记录（含其级别与适用范围）。<b>此操作入审计</b>。",
        function () { ws.ways.splice(wi, 1); auSave(); auRerender(); toast("已移除（演示）"); }, "移除");
      break;
    }
    /* 网关凭据托管 */
    /* 用户代填账号托管 */
    case "ucNew": {
      var avOpts = [];
      /* ★ 2026-10-10（R16）：被访问应用须是**有登录页、可代填**的对象 —— 原实现直取资产全量，
         远程主机 / 文件服务 / 其他 TCP 类资产同样可选，等于声明一条不可能被执行的代填记录
         （这些资产也没有「身份适配」页签可配契约）。收敛为「网页应用」类。 */
      try {
        if (typeof ASSETS !== "undefined" && ASSETS) {
          ASSETS.forEach(function (a) {
            if (a.type !== "网页应用" || a.en === 0) return;
            /* ★ 2026-10-10（R25）：**档位自洽** —— 代填 ≡ 资产身份适配的 **D 档**。
               已配 A（token 注入）/ B（key + userinfo）/ C（协议级 SSO）的资产走各自的
               适配路径，**不由平台代填账号密码**；把它们列为托管对象会让同一资产被赋
               两个互斥档位（如「统一身份门户」为 C 档协议级 SSO）。未配置（N）的资产
               可现场配 D 档，故一并保留。 */
            var _md = (a._adapt && a._adapt.mode)
              || (typeof ADAPT_MODE_OF !== "undefined" && ADAPT_MODE_OF[a.name]) || "N";
            if (_md === "D" || _md === "N") avOpts.push(a.name);
          });
        }
      } catch (e0) { /* 忽略 */ }
      /* ★ 2026-10-10（R25）：台账中无可代填对象时**直接拦截** —— 原实现在此处回落一份硬编码列表
         （且含「客户数据仓库」这类**数据库**资产），等于为录入侧开了一条绕过「网页应用 + 启用」约束的第二来源。 */
      if (!avOpts.length) {
        toast("资产台账中暂无「启用中的网页应用」类资产：代填对象须有登录页，请先在「资产列表」登记或启用");
        break;
      }
      openDlg("新增托管账号", "录入一条被访问应用的登录账号（<b>凭据本体</b>）。<b>登录页地址与字段选择器属资产维度</b>，不在此配置 —— 保存后到该资产的「身份适配」页签配契约。⚠ 首次录入的确认动作<b>即构成用户授权</b>（告知-同意）。",
        '<div class="fld"><label for="aucAsset">被访问应用 <span class="req">*</span></label><select id="aucAsset">' +
          avOpts.map(function (o) { return "<option>" + esc(o) + "</option>"; }).join("") + "</select>" +
          '<div class="help">须为已在「资产列表」登记的资产 —— 只有登记过的资产才有身份适配页签可配契约。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aucMode">托管模式</label><select id="aucMode" onchange="auOwnerSync()"><option>用户自管</option><option>管理员托管</option></select></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aucOwner">账号归属</label><select id="aucOwner" disabled></select>' +
          '<div class="mini" style="margin-top:4px">由<b>托管模式</b>唯一决定、不另行选择：<b>用户自管</b>＝<b>当前登录用户</b>（本人）；<b>管理员托管</b>＝组织资产。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aucAcct">账号 <span class="req">*</span></label><input id="aucAcct" placeholder="登录账号"></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aucFill">填充方式</label><select id="aucFill"><option>自动（字段特征库）</option><option>自定义选择器</option></select>' +
          '<div class="mini" style="margin-top:4px"><b>自动</b>＝按平台内置<b>字段特征库</b>识别账号 / 密码框；<b>自定义选择器</b>＝按<b>该资产契约</b>配置的选择器填充（契约在资产「身份适配 → D 档」配置）。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aucPwd">密码 <span class="req">*</span></label><input id="aucPwd" type="password" placeholder="录入后 SM4 加密落库，明文不回显"></div>');
      auOwnerSync();
      $("#dlg1Ok").onclick = function () {
        var av = ($("#aucAsset").value || "").trim();
        if (!av) { markBad($("#aucAsset"), true); toast("请选择被访问应用"); return; }
        /* ★ R61·轮12：校验序按**视觉序**（… 账号 → 填充方式 → 密码 …）—— 原先后校验账号、先校验密码。 */
        var ac = ($("#aucAcct").value || "").trim();
        if (!ac) { markBad($("#aucAcct"), true); toast("请录入登录账号"); return; }
        var pw = ($("#aucPwd").value || "").trim();
        if (!pw) { markBad($("#aucPwd"), true); toast("请录入密码（用于代填，SM4 加密落库）"); return; }
        /* 以 assetId 为主键（资产改名后仍可反查）；资产名仅作历史数据回退。 */
        var avId = "";
        try { if (typeof ASSETS !== "undefined" && ASSETS) { var _av = ASSETS.filter(function (x) { return x.name === av; })[0]; if (_av) avId = _av.id; } } catch (e4) { avId = ""; }
        /* 若该资产已在资产侧配好 D 档契约，直接引用同一份；否则留空契约，标记待配置。 */
        var seed = null;
        try {
          if (typeof ASSETS !== "undefined" && ASSETS) {
            var aa = ASSETS.filter(function (x) { return x.name === av; })[0];
            if (aa && aa._adapt && aa._adapt.d && aa._adapt.d.url) {
              var dd = aa._adapt.d;
              seed = { url: dd.url, urlAlt: dd.urlAlt || "—", kind: dd.kind || "单步（账号+密码同页）",
                userSel: dd.userSel || "—", pwdSel: dd.pwdSel || "—", submitSel: dd.submitSel || "—",
                submit: dd.submit || "自动提交", captcha: dd.captcha || "无",
                verify: dd.verify || "—", tested: "未测试" };
              if (dd.step2 && dd.step2.url) seed.step2 = JSON.parse(JSON.stringify(dd.step2));
            }
          }
        } catch (e1) { seed = null; }
        /* ★ 2026-10-10（R8）：原实现把 fill **写死**成「自动（字段特征库）」⇒ 列表该列与
           契约实际形态脱钩（弹窗里也无处可选）。改为读控件，并校验取值与契约的**可满足性**：
           「自定义选择器」的唯一来源是该资产契约，尚无契约时选它等于声明一条不存在的填充路径。 */
        /* ★ 2026-10-10（R25）：**档位自洽**再拦一道（下拉已收敛，但回填 / 脚本仍可绕过）。 */
        var _mdSel = "";
        try {
          if (typeof ASSETS !== "undefined" && ASSETS) {
            var _as2 = ASSETS.filter(function (x) { return x.name === av; })[0];
            if (_as2) _mdSel = (_as2._adapt && _as2._adapt.mode)
              || (typeof ADAPT_MODE_OF !== "undefined" && ADAPT_MODE_OF[_as2.name]) || "N";
          }
        } catch (e6) { /* 忽略 */ }
        if (_mdSel && _mdSel !== "D" && _mdSel !== "N") {
          toast("该资产的身份适配档位为 " + _mdSel + " 档（非 D 档 · 账号密码代填），不走平台代填：请改选 D 档 / 未配置的资产");
          return;
        }
        var fillSel = ($("#aucFill").value || "").trim() || "自动（字段特征库）";
        if (fillSel === "自定义选择器" && !seed) { toast("该资产尚未配置契约：「自定义选择器」的取值来自资产契约，请先到「身份适配 → D 档」配置契约，或改用「自动（字段特征库）」"); return; }
        /* ★ 2026-10-10（R10）：同「被访问应用 + 账号」＝同一登录位，只应有一条托管记录。
           页①（同名方式）· 页②（同名源）· 页⑤（同主体同类型）· 页⑥（同凭据 ID）均有查重，
           唯本页此前没有 ⇒ 同一登录位可被录入两条，代填时按行取值将产生不确定命中。 */
        if ((AU.uc.items || []).some(function (x) { return x.asset === av && x.acct === ac; })) {
          markBad($("#aucAcct"), true);
          toast("该应用下已托管账号「" + ac + "」：同一登录位只应有一条托管记录，请先删除原记录后重新录入");
          return;
        }
        AU.uc.items.unshift({
          id: "uc_" + Date.now(), asset: av, assetId: avId, mode: $("#aucMode").value,
          owner: ($("#aucOwner").value || "").trim() || "—",
          acct: ac,
          st: seed ? "已托管" : "待配契约", upd: AU_TS_STAMP.slice(0, 10), fill: fillSel,
          /* ★ 2026-10-10（R27 · C-4）：契约不自持副本（唯一真源＝资产侧 _adapt.d）；
             此处只初始化**测试留痕**。上方 `seed` 仍用于「自定义选择器」可行性校验。 */
          login: { tested: "未测试" }
        });
        auPgNew(AUU, AU.uc.items.length, false);
        auSave(); closeDlg(); auRerender();
        toast(seed ? "已新增（演示）；已引用该资产既有契约" : "已新增（演示）；请到该资产「身份适配」页签署契约后方可代填");
      };
      break;
    }
    case "auucClearF":
      /* 与 A8 配套：清空页级筛选并回第 1 页（本页签与「托管账号」页签共用同一份过滤状态）。 */
      AUU.f = { k: "", mode: "", st: "" }; AUU.pg = 1; auRerender();
      break;
    case "ucGotoFmt": {
      /* 契约不再在本页编辑 —— 跳到该资产详情的「身份适配」页签（D 档）。 */
      var ug = (AU.uc.items || []).filter(function (x) { return x.id === id; })[0]; if (!ug) break;
      var hit = null;
      try { if (typeof ASSETS !== "undefined" && ASSETS) hit = ASSETS.filter(function (a) { return a.id === ug.assetId; })[0] || ASSETS.filter(function (a) { return a.name === ug.asset; })[0]; } catch (e2) { hit = null; }
      /* ★ 2026-10-10（R25）：跳转前先判**可配契约的三个前提**（已在台账 / 网页应用 / 启用中）：
         此前只判「在不在台账」，数据库类或已停用资产照样跳，落到资产详情却无「身份适配」页签，
         表现为**点了没反应**（实测 uc_02 / uc_04 均 `_adaptAid=null`）。不可用时按因提示并给两条处置路径。 */
      var _mdHit = "";
      if (hit) {
        try { _mdHit = (hit._adapt && hit._adapt.mode)
          || (typeof ADAPT_MODE_OF !== "undefined" && ADAPT_MODE_OF[hit.name]) || "N"; } catch (e5) { /* 忽略 */ }
      }
      var _why = !hit ? "未在资产管理登记"
        : (hit.en === 0 ? "已停用"
        : (hit.type !== "网页应用" ? "非网页应用（" + hit.type + "）"
        : (_mdHit && _mdHit !== "D" ? "身份适配为 " + _mdHit + " 档（非 D 档 · 账号密码代填）" : "")));
      if (!_why) { window._adaptAid = hit.id; goPage("pg-detail", { aid: hit.id, tab: "t6" }); }
      else {
        toast("该资产" + _why + "，无处配置代填契约（须为启用中的网页应用）：请到「资产列表」登记 / 启用该资产，或删除本条托管记录后重新选择");
      }
      break;
    }
    case "ucFmt": {
      /* 兼容旧按钮：一律改为跳转（契约已迁至资产维度）。 */
      var uo = (AU.uc.items || []).filter(function (x) { return x.id === id; })[0]; if (!uo) break;
      var ho = null;
      try { if (typeof ASSETS !== "undefined" && ASSETS) ho = ASSETS.filter(function (a) { return a.name === uo.asset; })[0]; } catch (e3) { ho = null; }
      if (ho) { window._adaptAid = ho.id; goPage("pg-detail", { aid: ho.id, tab: "t6" }); }
      else { toast("契约按资产维度配置：请在资产详情 →「身份适配」页签配置"); }
      break;
    }
    case "ucTest": {
      var ut = (AU.uc.items || []).filter(function (x) { return x.id === id; })[0]; if (!ut) break;
      var lt = ucLoginOf(ut);
      if (!lt.url || lt.url === "—") { toast("该资产尚未配置表单契约，无法测试"); break; }
      var miss = [];
      if (!lt.userSel || lt.userSel === "—") miss.push("账号字段选择器");
      if (!lt.pwdSel || lt.pwdSel === "—") miss.push("密码字段选择器");
      idAsk("测试代填 · " + esc(ut.asset),
        "将按该资产的表单契约执行一次<b>模拟填充</b>：<br>· 登录页：" + esc(lt.url) + "<br>· 账号字段：" + esc(lt.userSel || "—") + "<br>· 密码字段：" + esc(lt.pwdSel || "—") + "<br>· 提交方式：" + esc(lt.submit || "—") +
        (miss.length ? "<br><b style='color:#b91c1c'>⚠ 缺少：" + esc(miss.join("、")) + "，预计填充失败</b>" : ""),
        function () {
          if (miss.length) { ut.st = "代填失败"; ut.upd = AU_TS_STAMP.slice(0, 10); ut.login.tested = "未通过"; ut.login.fail = "缺少" + miss.join("、") + " → 回退手动登录"; toast("代填测试未通过，已标记失败"); }
          else { ut.st = "已托管"; ut.upd = AU_TS_STAMP.slice(0, 10); ut.login.tested = AU_TS_STAMP.slice(0, 10); delete ut.login.fail; toast("代填测试通过（演示）"); }
          auSave(); auRerender();
        }, "开始测试");
      break;
    }
    case "ucTestAll": {
      var tot = auUserCredFiltered().length;
      /* ★ 2026-10-10（R12）：入口已置灰，此处再挡一次 —— 键盘 / 脚本仍可触发，0 项不该进确认框。 */
      if (!tot) { toast("当前筛选结果为空，没有可测试的资产"); break; }
      idAsk("批量测试全部契约", "将对<b>当前筛选结果的全部 " + tot + " 个资产</b>（含未显示在当前页的）逐一执行模拟填充：<b>契约完整 → 已托管</b>、<b>选择器缺失 → 代填失败</b>、<b>未配置契约 → 保持「待配契约」</b>。", function () {
        var bad = 0, skip = 0, ok = 0;
        auUserCredFiltered().forEach(function (x) {
          /* ★ 2026-10-10（R27 · C-4）：契约现读资产侧（走 ucLoginOf 单一入口），不再读记录快照。 */
          var l2 = ucLoginOf(x);
          /* 与单项测试（ucTest）同判据：「尚未配置契约」不等于「代填失败」——
             前者是待办，后者是执行出了问题，二者混判会把未开工的资产标成故障。 */
          if (!l2.url || l2.url === "—") { x.st = "待配契约"; skip++; return; }
          var miss = [];
          if (!l2.userSel || l2.userSel === "—") miss.push("账号字段选择器");
          if (!l2.pwdSel || l2.pwdSel === "—") miss.push("密码字段选择器");
          /* ★ 2026-10-10（R33）：留痕须写回**记录本体**（x.login）—— ucLoginOf 返回的是**新对象**
             （asset 分支返字面量、snapshot 分支返浅拷贝），写副本等于丢弃：批量测试后「最近测试」列
             恒为 —，与单项测试（写 ut.login）两制。 */
          x.login = x.login || {};
          if (miss.length) { x.st = "代填失败"; x.upd = AU_TS_STAMP.slice(0, 10); x.login.tested = "未通过"; x.login.fail = "缺少" + miss.join("、") + " → 回退手动登录"; bad++; }
          else { x.st = "已托管"; x.upd = AU_TS_STAMP.slice(0, 10); x.login.tested = AU_TS_STAMP.slice(0, 10); delete x.login.fail; ok++; }
        });
        AU.uc.cfg = AU.uc.cfg || {}; AU.uc.cfg.tested = AU_TS_STAMP.slice(0, 10);
        auSave(); auRerender();
        toast("批量测试完成：" + ok + " 项通过，" + bad + " 项失败" + (skip ? "，" + skip + " 项未配置契约已跳过" : "") + "（演示）");
      }, "开始测试");
      break;
    }
    case "ucDel": {
      var uv = (AU.uc.items || []).filter(function (x) { return x.id === id; })[0]; if (!uv) break;
      auConfirmEff(uv.mode === "用户自管" ? "撤销托管" : "删除托管账号",
        "将删除 <b>" + esc(uv.asset) + "</b> 的托管账号。<b>删除后停止代填</b>，需重新录入才恢复；<b>本动作全量审计</b>。",
        function () { AU.uc.items = AU.uc.items.filter(function (x) { return x.id !== id; }); auSave(); auRerender(); toast("已删除（演示）"); }, uv.mode === "用户自管" ? "撤销" : "删除");
      break;
    }
    /* 签发凭据管理 */
    case "isIssue": {
      /* ★ 2026-10-10（R13）：受控取值域按**生命周期状态**收口 —— 原实现直取 ID.cin / ID.ain 全量，
         已卸载 / 已禁用 / 已终止的主体也能被选中并签发，等于**签出一份没有任何组件会消费的凭据**
         （与下方「类型 × 主体」校验同一理由）。做法：置灰 + 状态后缀（**不隐藏** —— 用户要看得出主体为何不可选），
         默认选中挪到**首个可用**主体。 */
      var ihSubj = [];
      try { if (typeof ID !== "undefined" && ID && ID.cin) ID.cin.forEach(function (c) {
        var _nmC = "客户端实例 · " + idName(ID.csw, c.sw, "id", "name") + " @ " + idName(ID.terms, c.term, "id", "name");
        var _offC = (c.st === "已卸载" || c.st === "已禁用");
        ihSubj.push({ label: _nmC, st: c.st, off: _offC });
      }); } catch (e) { /* 忽略 */ }
      try { if (typeof ID !== "undefined" && ID && ID.ain) ID.ain.forEach(function (a) {
        var _nmA = "智能体实例 · " + idName(ID.asw, a.asw, "id", "name") + " @ " + idName(ID.terms, a.term, "id", "name") + "（进程 " + a.pid + "）";
        var _offA = (a.st === "已终止" || a.st === "已禁用");
        ihSubj.push({ label: _nmA, st: a.st, off: _offA });
      }); } catch (e) { /* 忽略 */ }
      if (!ihSubj.length) ihSubj = [{ label: "客户端实例 · 白泽客户端（PC） @ 科技管理部-张伟-PC", st: "", off: false }];
      var _ihPick = ihSubj.filter(function (s) { return !s.off; })[0] || ihSubj[0];
      /* ★ 2026-10-10（R14）：主体全集留一份给 isKindSync —— 切换凭据类型时按「类型 × 主体维」
         收敛取值域（此前只有**提交时**校验，用户要走「提交被拒 → 手动改选」一趟）。 */
      window.__auIhSubj = ihSubj;
      openDlg("签发凭据", "为访问主体签发凭据。<b>先选主体，再定类型与授权范围</b>；<b>签约对象是主体，不是连接</b>。<b>本次签发入审计</b>。",
        '<div class="fld"><label for="isSubj">持有主体 <span class="req">*</span></label><select id="isSubj" onchange="isCnSync()">' +
          ihSubj.map(function (s) { return '<option' + (s.off ? " disabled" : "") + (s === _ihPick ? " selected" : "") + ' value="' + esc(s.label) + '">' + esc(s.label + (s.off ? "（" + s.st + "）" : "")) + "</option>"; }).join("") + "</select>" +
          '<div class="mini" style="margin-top:4px">' + (ihSubj.some(function (s) { return !s.off; })
            ? "仅<b>已卸载 / 已禁用 / 已终止</b>的主体置灰不可选 —— 其凭据无任何组件会消费。"
            : "<b>当前无可用主体</b>：全部主体均处于已卸载 / 已禁用 / 已终止状态，签出的凭据无任何组件会消费，<b>无法签发</b>。") + "</div></div>" +
        '<div class="fld" style="margin-top:6px"><div class="mini" id="isHold"></div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="isKind">凭据类型</label><select id="isKind" onchange="isKindSync()">' +
          '<option>客户端 License 证书</option><option>智能体短时凭据</option></select>' +
          '<div class="mini" style="margin-top:4px">类型同时决定<b>有效期位</b>与<b>适用主体维</b>（证书绑客户端实例、短时凭据绑智能体实例）。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label>绑定主体标识</label>' +
          '<div class="mini" id="isCn" style="font-family:ui-monospace,Consolas,monospace">' + esc(cnOf(_ihPick.label)) + '</div>' +
          '<div class="mini" style="margin-top:4px">由<b>持有主体</b>派生、不在此处填写 —— 网关校验与按主体追溯比对的正是该标识；短时凭据取<b>宿主客户端实例</b>序列号，<b>不取</b>每次续发都会变的凭据号。列表并列展示的<b>终端序列号</b>同样由主体派生（取该主体所在终端的设备序列号）。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="isScope">授权范围 <span class="req">*</span></label><input id="isScope" list="isScopeList" placeholder="如 信贷核心系统 / 客户管理平台">' +
          '<datalist id="isScopeList">' + isScopeOpts() + '</datalist>' +
          '<div class="mini" id="isScopeHint" style="margin-top:4px"></div></div>' +
        '<div class="fld" id="isExpWrap" style="margin-top:10px"><label for="isExp">有效期至<span class="req" id="isExpReq">*</span></label><input id="isExp" value="' + esc(auPlusYears(AU_TS_STAMP.slice(0, 10), 1)) + '" placeholder="例如 ' + esc(auPlusYears(AU_TS_STAMP.slice(0, 10), 1)) + '"></div>' +
        '<div class="fld" id="isTtlWrap" style="margin-top:10px;display:none"><label for="isTtl">短时有效期（分钟） <span class="req" id="isTtlReq">*</span></label><input id="isTtl" type="number" min="1" max="1440" value="30"></div>' +
        '<div class="fld" id="isCaWrap" style="margin-top:10px"><label for="isCa">签发 CA / 容器<span class="req" id="isCaReq">*</span></label><select id="isCa"' +
          (auGwCas().length ? "" : " disabled") + ">" +
          (auGwCas().length
            ? auGwCas().map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("")
            : '<option value="">（无可用签发 CA）</option>') + "</select>" +
          '<div class="mini" style="margin-top:4px">取值自<b>平台签发 CA 清单</b>（受控取值域，不在此处自造 CA 名 —— 自造会让签出的凭据归属无从追溯）。<br>此清单与页③「网关凭据托管」的 CA <b>不是同一份</b>：此处 CA 用于<b>签发</b>下游凭据，页③ 的 CA 是<b>出站信任锚</b>（校验上游服务端证书），两者用途不同、取值域不相通。</div></div>');
      isKindSync();
      isCnSync();
      $("#dlg1Ok").onclick = function () {
        var sv = ($("#isScope").value || "").trim();
        if (!sv) { markBad($("#isScope"), true); toast("请填写授权范围"); return; }
        /* ★ R53（C-F4）：**受控取值域校验** —— `#isScope` 的 `list=` 是建议性候选，须在提交侧兜底。
           判据：整体命中受控集，或按分隔符拆项后**逐项**命中（业务系统级名称与资产名两类可并列填写）。 */
        var _scOpts = isScopeNames();
        if (_scOpts.length && _scOpts.indexOf(sv) < 0) {
          var _scBad = sv.split(/[\/\u3001,\uff0c;\uff1b]/).map(function (x) { return x.trim(); })
            .filter(function (x) { return x && _scOpts.indexOf(x) < 0; });
          if (_scBad.length) {
            markBad($("#isScope"), true);
            toast("授权范围须取自「授权范围清单 / 资产台账」：" + _scBad.join("、") + " 不在允许集内");
            return;
          }
        }
        var kd = $("#isKind").value;
        var holder = $("#isSubj").value;
        /* ★ 2026-10-10（R24）：主体可用性须在提交侧兜住（同上：全部不可用时默认选中项是置灰项）。 */
        var _selS = (ihSubj || []).filter(function (s) { return s.label === holder; })[0];
        if (!_selS || _selS.off) {
          toast("持有主体当前不可用" + (_selS ? "（" + _selS.st + "）" : "") + "：其凭据无任何组件会消费，无法签发"); return;
        }
        /* 类型 × 主体：两类凭据各有唯一适用主体维（证书绑客户端实例、短时凭据绑智能体实例），
           选错主体等于签出一份没有任何组件会消费的凭据。 */
        if (kd === "智能体短时凭据" && holder.indexOf("智能体实例") !== 0) {
          toast("「智能体短时凭据」只面向智能体实例主体；当前选中的是：" + holder); return;
        }
        if (kd === "客户端 License 证书" && holder.indexOf("客户端实例") !== 0) {
          toast("「客户端 License 证书」只面向客户端实例主体；当前选中的是：" + holder); return;
        }
        /* ★ 2026-10-10（R8·§M.4 裁决二）：查重原只挡 st === "有效"，「即将过期」的凭据不挡 ⇒
           同一主体同类型可重复签发。判据改为**占用的就是生效态**（有效 / 即将过期）。 */
        var dup = AU.issue.filter(function (y) { return y.holder === holder && y.kind === kd && (y.st === "有效" || y.st === "即将过期"); })[0];
        if (dup) { toast("该主体已有同类型生效凭据（" + dup.no + "，" + dup.st + "）；如需更换请用「轮换」"); return; }
        /* 数值域：短时有效期 1~1440 分钟；证书有效期须为 YYYY-MM-DD 且晚于当前基准日。
           原实现把非法输入静默吞成默认值（0 / 负数 / 乱串 → 一律 30 分钟或原样落库）。 */
        var ttlRaw = ($("#isTtl").value || "").trim();
        var expRaw = ($("#isExp").value || "").trim();
        if (kd !== "客户端 License 证书") {
          if (!/^\d+$/.test(ttlRaw) || parseInt(ttlRaw, 10) < 1 || parseInt(ttlRaw, 10) > 1440) {
            markBad($("#isTtl"), true); toast("短时有效期须为 1~1440 分钟的整数"); return;
          }
        } else {
          if (!bzYmdOk(expRaw)) { markBad($("#isExp"), true); toast("有效期须为有效的 YYYY-MM-DD 日期，如 " + auPlusYears(AU_TS_STAMP.slice(0, 10), 1)); return; }
          if (expRaw <= AU_TS_STAMP.slice(0, 10)) { markBad($("#isExp"), true); toast("有效期须晚于当前基准日 " + AU_TS_STAMP.slice(0, 10)); return; }
        }
        /* 签发 CA / 容器只属**证书类**凭据（X.509 需 CA 签发）；短时凭据由平台直接颁发、不经 CA
           ⇒ 不参与校验、落库空串（与 isKindSync 的字段显隐同判据）。证书类仍取自受控清单：
           清单为空时**不下发** —— 否则会签出一份归属无从追溯的凭据。 */
        var caSel = (kd === "客户端 License 证书") ? ($("#isCa").value || "").trim() : "";
        if (kd === "客户端 License 证书" && !caSel) { markBad($("#isCa"), true); toast("当前无可用签发 CA，无法签发"); return; }
        var n = AU.issue.length + 1;
        var no = kd === "客户端 License 证书"
          ? "LC-" + AU_TS_STAMP.slice(0, 4) + "-" + String(700 + n).padStart(6, "0")
          : "AT-" + Math.random().toString(16).slice(2, 6).toUpperCase() + "-" + (4000 + n);
        var expNew = (kd !== "客户端 License 证书") ? (auPlusMinutes(AU_TS_STAMP, ttlRaw) || AU_TS_STAMP) : expRaw;
        /* ★ 2026-10-10（R33）：签发与吊销 / 轮换**同族**（凭据即访问授权载体，三者都在改变生效面）
           ⇒ 统一走**二次认证**。此前签发 0 确认、轮换二次认证、吊销二次认证，同族三制。
           校验所需控件值已全部读入局部变量 ⇒ 先关弹窗再起认证，避免两层弹窗叠加。 */
        closeDlg();
        auConfirmEff("签发凭据",
          "将为 <b>" + esc(holder) + "</b> 签发" + esc(kd) + "（授权范围 <b>" + esc(sv) + "</b>，编号 " + esc(no)
          + "）。签发后该主体即持有可访问上述范围的凭据。<b>本次签发入审计</b>。",
          function () {
            AU.issue.unshift({
              id: "is_" + Date.now(), kind: kd, holder: holder, no: no,
              /* ★ 2026-10-10（R9）：短时凭据 TTL 以分钟计 ⇒ 签发时间须与 exp 同精度（带时分）；证书类保持到日。 */
              issued: (kd === "客户端 License 证书" ? AU_TS_STAMP.slice(0, 10) : AU_TS_STAMP), exp: expNew,
              st: auIssueSt(expNew), ttl: (kd !== "客户端 License 证书") ? parseInt(ttlRaw, 10) : 0,
              cn: cnOf(holder),
              scope: sv, ca: caSel, fp: fpOf(holder)
            });
            /* ★ 2026-10-10（R17）：签发后回写身份侧 —— 否则「页⑤ 台账已记、身份侧实例页看不见」，
               与吊销的单向回写（R16-A12）拼成**半套**：改一半、漂移照旧。unshift 已把它放在 [0]。 */
            auBackfillIdentity(AU.issue[0]);
            auPgNew(AUI, AU.issue.length, false);
            auSave(); auRerender(); toast("已签发 " + no + "（演示）");
          });
      };
      break;
    }
    case "isPick": {
      var pk = t.getAttribute("data-id") || "";
      var psel = AUI.sel || (AUI.sel = []);
      var at = psel.indexOf(pk);
      if (at >= 0) psel.splice(at, 1); else psel.push(pk);
      auRerender(); auSyncPickAll();
      break;
    }
    case "isPickAll": {
      var psel2 = AUI.sel || (AUI.sel = []);
      var pkRows = auSlice(auIssueFiltered(), AUI).filter(function (x) { return x.st !== "已过期" && x.st !== "已吊销"; });
      var allOn2 = pkRows.length > 0 && pkRows.every(function (x) { return psel2.indexOf(x.id) >= 0; });
      if (allOn2) AUI.sel = psel2.filter(function (i) { return !pkRows.some(function (x) { return x.id === i; }); });
      else { AUI.sel = psel2.slice(); pkRows.forEach(function (x) { if (AUI.sel.indexOf(x.id) < 0) AUI.sel.push(x.id); }); }
      auRerender(); auSyncPickAll();
      break;
    }
    case "isBatchRevoke": {
      /* 双保险：只吊销「当前可见（符合筛选）且仍存在」的记录，防脏勾选穿透。 */
      var psel3 = (AUI.sel || []).filter(function (i2) {
        return auIssueFiltered().some(function (y2) { return y2.id === i2; });
      });
      if (!psel3.length) { toast("请先勾选要吊销的凭据"); break; }
      auConfirmEff("批量吊销凭据", "将吊销已勾选的 <b>" + psel3.length + "</b> 项凭据。<b>吊销后立即失效</b>，持有主体须重新签发方可使用。<b>本动作全量审计</b>。", function () {
        var nos = {};
        AU.issue.forEach(function (y) { if (psel3.indexOf(y.id) >= 0) { y.st = "已吊销"; nos[y.no] = 1; } });
        if (typeof ID !== "undefined" && ID && Array.isArray(ID.cin)) { ID.cin.forEach(function (c) { (c.lic || []).forEach(function (l) { if (nos[l.no]) l.tag = "已吊销"; }); }); }
        /* ★ 2026-10-10（R16）：**短时凭据**是回写的另一半 —— 原先只覆盖证书类
           （ID.cin[].lic[].tag），智能体短时凭据（ID.ain[].cred）零感知：页⑤ 示「已吊销」，
           而身份侧 idAgInSt() 只按 cred.exp 判定 ⇒ 仍示「运行中」，同一份凭据在两页矛盾。
           按 cred.no 对号回写（吊销后凭据即失效，状态须落到凭据本身）。 */
        if (typeof ID !== "undefined" && ID && Array.isArray(ID.ain)) { ID.ain.forEach(function (a) { if (a.cred && nos[a.cred.no]) a.cred.st = "已吊销"; }); }
        if (typeof ID !== "undefined" && ID && typeof idSave === "function") idSave();
        AUI.sel = []; auSave(); auRerender(); toast("已吊销 " + psel3.length + " 项（演示）");
      }, "批量吊销");
      break;
    }
    case "isRevoke":
      auConfirmEff("吊销凭据", "将吊销该凭据。<b>吊销后立即失效</b>，持有主体须重新签发方可使用。<b>此操作入审计</b>。", function () {
        var x = AU.issue.filter(function (y) { return y.id === id; })[0]; if (x) x.st = "已吊销";
        if (x && typeof ID !== "undefined" && ID && Array.isArray(ID.cin)) { ID.cin.forEach(function (c) { (c.lic || []).forEach(function (l) { if (l.no === x.no) l.tag = "已吊销"; }); }); }
        /* ★ 2026-10-10（R16）：同批量吊销 —— 短时凭据侧一并回写（详见该分支注释）。 */
        if (x && typeof ID !== "undefined" && ID && Array.isArray(ID.ain)) { ID.ain.forEach(function (a) { if (x.no && a.cred && a.cred.no === x.no) a.cred.st = "已吊销"; }); }
        if (typeof ID !== "undefined" && ID && typeof idSave === "function") idSave();
        /* 单条吊销同样要清勾选集：否则该已吊销项仍留在 AUI.sel 里，
           后续「批量吊销（N）」的计数与吊销对象会包含它（与批量吊销分支同口径）。 */
        AUI.sel = []; auSave(); auRerender(); toast("已吊销（演示）");
      }, "吊销");
      break;
    case "isRotate": {
      var ir = AU.issue.filter(function (y) { return y.id === id; })[0]; if (!ir) break;
      /* ★ 2026-10-10（R18）：轮换前必须挡「已有待生效继任者」—— 身份侧 licRotate 正因
         「单一当前证书」这一硬不变量才写 `if (pend) { toast(…); break; }`；认证侧此前**无任何守卫**
         ⇒ 对同一主体连续轮换会**堆叠多条待生效**，且它们的生效窗口完全相同（均由同一「当前份
         到期次日」派生）⇒ 届时并列出多个「当前」，不变量被破坏（触发路径由「tag 写错」变为
         「继任者堆叠」）。此处与身份侧同判据对齐。 */
      try {
        var _hrf = auHolderRef(ir.holder);
        if (_hrf && _hrf.kind === "cin" && typeof idLicTagOf === "function") {
          var _pend = (_hrf.obj.lic || []).filter(function (l) { return idLicTagOf(l) === "待生效"; })[0];
          if (_pend) { toast("该主体已存在待生效凭据 " + _pend.no + "，无需重复轮换"); break; }
        }
      } catch (_e) { /* 身份侧不可用时按原行为放行 */ }
      /* 轮换会**生成新的有效凭据**，改变生效面 ⇒ 与吊销 / 启停 / 移除同档，走**二次认证**
         （原走 idAsk 普通确认，是生效面动作里唯一的分档不一致处）。 */
      auConfirmEff("轮换凭据", "将为 <b>" + esc(ir.holder) + "</b> 签发一份新凭据（编号 <b>" + esc(ir.no) + "</b> 的继任者），旧的<b>保留至其到期</b>（过渡期<b>新旧共存</b>）。<b>此操作入审计</b>。", function () {
        /* ★ 2026-10-10（R17）：证书编号里的年份语义必须唯一＝**签发年**（与 isIssue、身份侧 idLicNo 同口径）。
           原用 `parseInt(ir.exp.slice(0,4))+1` 指的是「上一份证书到期年 + 1」，同一命名空间里语义随路径漂移。 */
        var nn = ir.kind === "客户端 License 证书"
          ? "LC-" + AU_TS_STAMP.slice(0, 4) + "-" + String(800 + AU.issue.length).padStart(6, "0")
          : "AT-" + Math.random().toString(16).slice(2, 6).toUpperCase() + "-" + (5000 + AU.issue.length);
        /* ★ 2026-10-10（R9）：轮换出的继任者此前**不带 `ttl`** ⇒ 该短时凭据再被轮换一次时
           `parseInt(ir.ttl, 10) || 30` 退化成 30 分钟，原 TTL 被静默丢弃；`st` 写死「有效」、
           `issued` 只到日 —— 而短时凭据的 TTL 以分钟计，签发时间必须与 exp 同精度
           （否则这一条 30 分钟的有效期从何时起算无从得知）。三处一并按类型分档派生。 */
        var irKdCert = (ir.kind === "客户端 License 证书");
        var irExpNew = irKdCert ? (auPlusYears(ir.exp, 1) || ir.exp)
                                : (auPlusMinutes(AU_TS_STAMP, parseInt(ir.ttl, 10) || 30) || ir.exp);
        AU.issue.unshift({
          id: "is_" + Date.now(), kind: ir.kind, holder: ir.holder, no: nn,
          issued: irKdCert ? AU_TS_STAMP.slice(0, 10) : AU_TS_STAMP, exp: irExpNew,
          st: auIssueSt(irExpNew), cn: ir.cn, fp: ir.fp, scope: ir.scope, ca: ir.ca,
          ttl: irKdCert ? 0 : (parseInt(ir.ttl, 10) || 30)
        });
        /* ★ 2026-10-10（R17）：轮换同样要回写身份侧 —— 轮换产出的是**新的当前份**，
           客户端实例侧追加一份 License、智能体实例侧替换 `cred`（与 A2 同一条 helper）。 */
        auBackfillIdentity(AU.issue[0]);
        auSave(); auRerender(); toast("已轮换：新凭据 " + nn + "（演示）");
      }, "轮换");
      break;
    }
    /* 强认证器绑定管理 */
    case "arNew": {
      /* ★ 2026-10-10（R9）：用户取值域与页④ 共用一处（auUserNames），不再各写一份兜底清单。
         ★ 2026-10-10（R13）：登记认证器＝**产生新的生效因子** ⇒ 用户域只收**已启用**用户
          （为已锁定 / 已禁用用户登记认证器无意义）；置灰不可用项 + 状态后缀，默认选中首个可用。
          ⚠ 管理员重置（arReset）面向的正是不可用用户，**仍走 auUserNames() 全量**，勿一并收窄。 */
      var usersO = auUserObjs();
      var _arPick = usersO.filter(function (o) { return o.ok; })[0] || usersO[0];
      /* 登记设备取自「终端管理」台账 ∩ 该用户**绑定终端**（并入该用户历史登记过的设备名，避免旧数据丢失）。 */
      /* ★ 2026-10-10（R13）：登记设备＝该认证器的宿主 ⇒ 只取**已激活**终端（已禁用 / 未激活终端上
         登记认证器无落点）；历史记录里的设备名保留（旧数据不丢，按台账状态标注可用性）。 */
      var _devSt = {};
      try { if (typeof ID !== "undefined" && ID && ID.terms) ID.terms.forEach(function (t2) { if (t2 && t2.name) _devSt[t2.name] = t2.st || "已激活"; }); } catch (e5) { /* 忽略 */ }
      /* ★ 2026-10-10（R33）：设备取值域随**所选用户**收敛到其**绑定终端**（权威源 ID.users[].bound），
         并并入该用户历史登记过的设备名（旧数据不丢，按台账状态置灰）。此项随「用户」下拉联动。 */
      var devOpts = auAuthrDevOpts(_arPick.name);
      var _devPick = devOpts.filter(function (d3) { return (_devSt[d3] || "已激活") === "已激活"; })[0] || devOpts[0];
      openDlg("登记认证器", "为某用户登记一枚认证器。⚠ <b>登记须由已认证会话发起</b>（禁止匿名登记）；<b>challenge 一次性</b>消费。<b>本次登记入审计</b>。",
        '<div class="fld"><label for="aarUser">用户 <span class="req">*</span></label><select id="aarUser" onchange="auAuthrDevSync()">' + usersO.map(function (o) { return '<option' + (o.ok ? "" : " disabled") + (o === _arPick ? " selected" : "") + ' value="' + esc(o.name) + '">' + esc(o.name + (o.ok ? "" : "（" + o.st + "）")) + "</option>"; }).join("") + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label for="aarKind">认证方式</label><select id="aarKind" onchange="auAuthrKindSync(this.value)">' +
          auAuthrKinds().map(function (k) { return "<option>" + esc(k.name) + "</option>"; }).join("") + "</select>" +
          '<div class="mini" style="margin-top:4px">类型取值自<b>认证方式字典</b>（唯一取值域，随字典增删自动同步）；<b>级别由类型唯一确定</b>，不是可自由组合的第二个维度。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aarLv">安全级别（由认证方式唯一确定）</label><select id="aarLv" disabled><option value="4">L4</option><option value="5">L5</option></select>' +
          '<div class="mini" style="margin-top:4px">随「认证方式」联动、<b>不可单独修改</b> —— 级别由类型唯一确定，不是可自由组合的第二个维度。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label>凭据绑定属性<span class="muted" style="margin-left:4px">（随认证方式联动）</span></label>' +
          '<span id="aarCtypeWrap"></span>' +
          '<div class="mini" style="margin-top:4px">是否<b>随账号漫游</b>由<b>认证方式</b>决定取值域：<b>平台内置生物特征</b>（指纹 / 人脸）可按 <b>passkey</b> 形态登记 —— 既可绑定本设备，也可随账号同步；<b>外接硬件令牌</b>（USB Key）与<b>须活体检测</b>的方式（活体人脸 / 虹膜）为设备绑定，只有「绑定型」一条路。<b>与「安全级别」同理，不是可自由组合的第二个维度</b>；「可同步凭据」吊销按<b>凭据 ID</b> 单独执行、不依赖设备状态。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aarDev">登记设备 <span class="req">*</span></label><select id="aarDev">' +
          (devOpts.length ? devOpts.map(function (d2) { var _o2 = (_devSt[d2] || "已激活") !== "已激活"; return '<option' + (_o2 ? " disabled" : "") + (d2 === _devPick ? " selected" : "") + ' value="' + esc(d2) + '">' + esc(d2 + (_o2 ? "（" + (_devSt[d2] || "未激活") + "）" : "")) + "</option>"; }).join("")
            : '<option value="" disabled selected>（该用户无可登记终端：请先在终端管理把终端归属给该用户）</option>') + "</select>" +
          '<div class="mini" style="margin-top:4px">取自<b>该用户已绑定的终端</b>（身份侧绑定关系，随上方「用户」联动）；历史登记过的设备名一并列出但按台账状态置灰 —— 手填设备名会让登记记录与终端台账对不上，吊销与追溯都会落空。</div></div>' +
        /* ★ 2026-10-10（R24）：RP ID 由**逐记录手填**改为**平台统一只读派生** —— 同一弹窗内
           「安全级别」已由认证方式唯一确定（disabled）、「登记设备」已改从终端管理台账取，
           两者都不是运营自定的第二个维度；RP ID 同理，此前却是唯一仍在手填的项（同型遗漏）。 */
        '<div class="fld" style="margin-top:10px"><label>RP ID（平台统一作用域）</label><span class="chip on">' + esc(AU_RP_ID) + "</span>" +
          '<div class="mini" style="margin-top:4px">RP ID 是 WebAuthn 的<b>平台统一作用域</b>：同一平台下所有认证器共用同一个 RP 域名（随平台部署域名确定），<b>不逐条登记</b> —— 逐记录手填会让登记记录与平台域名对不上，凭据校验与追溯都会落空。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label for="aarCredId">凭据 ID</label><input id="aarCredId" placeholder="留空则由平台在登记时生成"></div>');
      /* ★ 2026-10-10（R9）：级别初值此前**依赖「认证方式」下拉首项恰好是 L4** 这一隐式前提；
         显式按当前方式同步一次，避免字典顺序一变就出现「未操作却级别不符」。 */
      auAuthrKindSync($("#aarKind").value);
      $("#dlg1Ok").onclick = function () {
        /* ★ 2026-10-10（R24）：RP ID 已收为平台统一常量（弹窗只读展示）⇒ 此处不再校验手填值。
           取值域单点收敛后，「须为域名形态」由常量本身保证，运行期正则兜底随之撤除
           （原 R14 校验针对的正是「手填可任意串」这一已消除的入口）。 */
        /* ★ 2026-10-10（R24）：用户 / 设备可用性须在**提交侧**兜住 —— 渲染层只把不可用项置灰，
           而「全部不可用」时默认选中项恰是一个置灰项（disabled 的 option 其 selected 仍为真），
           不校验即可把认证器登记到已卸载 / 已禁用用户、未激活终端上，产出一枚没有任何组件
           会消费的认证器（与本模块「受控取值域按生命周期状态收口」的自述自相矛盾）。 */
        var _selU = (usersO || []).filter(function (o) { return o.name === $("#aarUser").value; })[0];
        if (!_selU) { markBad($("#aarUser"), true); toast("请选择用户"); return; }
        if (!_selU.ok) { markBad($("#aarUser"), true); toast("用户「" + _selU.name + "」当前为 " + _selU.st + "：认证器登记须落在可用用户上"); return; }
        var _selD = ($("#aarDev").value || "").trim();
        if (!_selD) { markBad($("#aarDev"), true); toast("请选择登记设备"); return; }
        if ((_devSt[_selD] || "已激活") !== "已激活") {
          markBad($("#aarDev"), true); toast("登记设备「" + _selD + "」当前为 " + (_devSt[_selD] || "未激活") + "：登记须落在已激活终端上"); return;
        }
        /* ★ R53（E-F3 · P0）：设备须落在**该用户的**可登记设备集内（绑定终端 ∪ 其历史登记设备）——
           与渲染层同一判据（`auAuthrDevOpts` 已不再回落他人设备）。提交侧兜底：渲染层只置灰，
           「全部不可用」时默认选中项仍可能是一个越界值（disabled 的 option 其 selected 仍为真）。 */
        if (typeof auAuthrDevOpts === "function") {
          var _allowD = auAuthrDevOpts(_selU.name);
          if (_allowD.length && _allowD.indexOf(_selD) < 0) {
            toast("登记设备「" + _selD + "」不属于用户「" + _selU.name + "」的可登记设备（终端归属未建立）：请先在终端管理把该终端归属给该用户"); return;
          }
        }
        /* ★ 2026-10-10（R24）：字典中若已无 L4 / L5 方式，上方「认证方式」下拉渲染为空，而
           `kdLv` 为 0 时又会跳过级别校验 ⇒ 会落一条 kind 为空串的登记记录。空取值域须在入口截住。 */
        var kd2 = $("#aarKind").value;
        if (!kd2) { toast("认证方式字典中暂无 L4 / L5 方式，无法登记认证器"); return; }
        /* 类型 × 级别一致性：级别由类型决定，不是第二个自由维度。 */
        var kdLv = auAuthrKindLv(kd2);
        if (kdLv && parseInt($("#aarLv").value, 10) !== kdLv) {
          toast("认证方式与安全级别不一致：" + kd2 + " 对应 L" + kdLv); return;
        }
        var cid = ($("#aarCredId").value || "").trim();
        if (cid && AU.authr.some(function (y) { return y.credId === cid && y.st === "有效"; })) {
          markBad($("#aarCredId"), true); toast("凭据 ID 已存在（" + cid + "）；同一凭据 ID 只能有一枚有效记录"); return;
        }
        AU.authr.unshift({ id: "ar_" + Date.now(), user: $("#aarUser").value, kind: kd2, lv: kdLv || parseInt($("#aarLv").value, 10), ctype: $("#aarCtype").value, dev: ($("#aarDev").value || "").trim() || "—", rpid: AU_RP_ID, credId: ($("#aarCredId").value || "").trim() || ("CID-" + Math.random().toString(16).slice(2, 10).toUpperCase()), reg: AU_TS_STAMP.slice(0, 10), st: "有效" });
        auPgNew(AUR, AU.authr.length, false);
        auSave(); closeDlg(); auRerender(); toast("已登记（演示）");
      };
      break;
    }
    case "arRevoke": {
      /* ★ 2026-10-10（R24）：不可逆动作须交代**影响面** —— 若这是该用户最后一枚有效认证器，
         吊销会直接把他锁出 L4 / L5；本页「多枚构成冗余」的结论只在剩余 ≥1 时成立。 */
      var _rvA = (AU.authr || []).filter(function (y) { return y.id === id; })[0];
      var _rvLeft = _rvA ? (AU.authr || []).filter(function (y) { return y.user === _rvA.user && y.st === "有效" && y.id !== _rvA.id; }).length : 0;
      var _rvTail = (_rvA && _rvLeft === 0)
        ? "⚠ <b>" + esc(_rvA.user) + "</b> 当前<b>唯一一枚有效认证器</b> —— 吊销后该用户将<b>失去 L4 / L5 强认证能力</b>，须走<b>管理员重置</b>重新登记。<b>此操作入审计</b>。"
        : "<b>此操作入审计</b>。";
      auConfirmEff("吊销认证器", "将吊销该枚认证器凭据。<b>吊销后立即失效</b>；若为可同步凭据，<b>按凭据 ID 单独执行、不依赖设备状态</b>。" + _rvTail, function () {
        var a = AU.authr.filter(function (y) { return y.id === id; })[0];
        if (a) AU.authr.forEach(function (y) { if (y.credId === a.credId && y.st === "有效") y.st = "已吊销"; });
        auSave(); auRerender(); toast("已吊销（演示）");
      }, "吊销");
      break;
    }
    case "arReset": {
      var rusers = auUserNames();
      openDlg("管理员重置", "当某用户<b>全部认证器均不可用</b>时走此流程：经<b>身份核验</b>后吊销该用户<b>全部认证器凭据</b>（L4 / L5 均以 WebAuthn（FIDO2）承载）并允许重新登记。⚠ <b>重置全程记审计</b>。",
        '<div class="fld"><label for="aarRst">目标用户</label><select id="aarRst">' + rusers.map(function (n) { return "<option>" + esc(n) + "</option>"; }).join("") + "</select></div>" +
        /* 身份核验是本流程的前置动作：此前文案要求了、界面却没有落点，点确定即直接吊销。 */
        '<div class="fld" style="margin-top:10px"><label><input type="checkbox" id="aarRstChk"> 已完成身份核验（窗口 / 证件 / 上级审批）</label>' +
        '<div class="mini" style="margin-top:4px">重置会吊销该用户<b>全部</b>认证器凭据，属高风险动作，<b>须先完成身份核验</b>方可执行。</div></div>' +
        /* 重置是「吊销全部 + 全程记审计」的高风险动作，此前只宣称记审计、却没有备注落点。 */
        '<div class="fld" style="margin-top:10px"><label for="aarRstNote">重置原因 / 核验依据 <span class="req">*</span></label><input id="aarRstNote" placeholder="如 窗口核验身份证 + 上级审批单号"></div>');
      $("#dlg1Ok").onclick = function () {
        var u = $("#aarRst").value;
        if (!($("#aarRstChk") && $("#aarRstChk").checked)) { toast("请先完成身份核验（勾选确认项）"); return; }
        /* 0 枚不是「重置成功」：原实现无论吊销几枚都回同一句成功口径，把「本来就没有」说成
           「已重置」；且先判空再走二次认证 —— 无事可做时不该索要凭据。 */
        if (!(AU.authr || []).some(function (a) { return a.user === u && a.st === "有效"; })) {
          toast(u + " 当前没有有效认证器凭据，无需重置"); return;
        }
        var rnote = ($("#aarRstNote").value || "").trim();
        if (!rnote) { markBad($("#aarRstNote"), true); toast("请填写重置原因 / 核验依据（入审计）"); return; }
        closeDlg();
        auConfirmEff("管理员重置认证器",
          "将吊销用户 <b>" + esc(u) + "</b> 的<b>全部</b>认证器凭据（L4 / L5 均以 WebAuthn（FIDO2）承载）；吊销后该用户可重新登记。<b>核验依据：</b>" + esc(rnote) + "。",
          function () {
            var cnt = 0;
            AU.authr.forEach(function (a) { if (a.user === u && a.st === "有效") { a.st = "已吊销"; cnt++; } });
            /* ★ 2026-10-10（R17）：重置依据（核验方式 / 审批单号）此前只拼进确认文案、**无任何落点**，
               事后无从追溯。现落入 AU.authrResetLog 随 auSave() 持久化（供审计看板消费，本页不做展示面）。 */
            AU.authrResetLog = AU.authrResetLog || [];
            AU.authrResetLog.push({ user: u, at: AU_TS_STAMP, note: rnote, cnt: cnt });
            auSave(); auRerender();
            toast("已吊销 " + u + " 的 " + cnt + " 枚认证器凭据（该用户可重新登记）");
          });
      };
      break;
    }
    /* ★ 2026-10-10（R31）：**修正 R25 的接入位置错位** —— 「适用范围」列在 R25 改为
       「只读 + 点击弹窗多选」后，分支被写进了 `auOnChange`（绑定 change / input /
       compositionend），却带着 `if (e.type !== "click") return;` 守卫 ⇒ 该分支**恒不执行**、
       `auScopeDlg` 不可达 ⇒ 页面提示「点击设置」但点了毫无反应（该字段彻底不可编辑）。
       点击类分支归 `auOnClick`。 */
    case "wayScope": {
      var s3 = AU.sources.filter(function (x) { return x.id === AUS.cur; })[0];
      var i3 = parseInt(idx, 10);
      if (s3 && s3.ways[i3]) {
        auScopeDlg(s3.ways[i3].scope, function (nv3) {
          if (nv3 !== s3.ways[i3].scope) { s3.ways[i3].scope = nv3; auSave(); toast("适用范围已更新（本源 × 本方式）"); }
          auRerender();
        });
      }
      break;
    }
  }
}
function auOnChange(e) {
  var t = e.target;
  if (!t || !t.getAttribute) return;

  /* 筛选控件（按 id 分派；命中即返回，避免落入 data-auact 分支） */
  if (t.id) {
    /* ★ 2026-10-10（R9）：IME 组合态守卫 —— 组合中的 input 若走整页重渲染，搜索框节点会被
       innerHTML 替换销毁，中文候选被逐字打断（拼音串丢失、需重输）。组合期间只跳过，
       组合结束由 compositionend 监听触发一次最终渲染（见下）。 */
    if (e.type === "input" && e.isComposing) return;
    var sv = t.value;
    switch (t.id) {
      /* 筛选改变可见集 ⇒ 页码回到第 1 页（否则会停在旧结果集的第 N 页上显示空表）。 */
      case "audK":     AUD.k = sv; AUD.pg = 1; auRerender(); break;
      case "ausrcK":   AUS.f.k = sv; AUS.pg = 1; auRerender(); break;
      case "ausrcSt":  AUS.f.st = sv; AUS.pg = 1; auRerender(); break;
      case "auucK":    AUU.f.k = sv; AUU.pg = 1; AUF.pg = 1; auRerender(); break;
      case "auucMode": AUU.f.mode = sv; AUU.pg = 1; AUF.pg = 1; auRerender(); break;
      case "auucSt":   AUU.f.st = sv; AUU.pg = 1; AUF.pg = 1; auRerender(); break;
      /* 筛选即改变可见集 ⇒ 勾选集必须同步清空：否则「批量吊销（N）」的计数与吊销对象
         都包含当前筛选下不可见的记录，用户以为只吊销了眼前这些。 */
      case "auiK":     AUI.f.k = sv; AUI.sel = []; AUI.pg = 1; auRerender(); break;
      case "auiKind":  AUI.f.kind = sv; AUI.sel = []; AUI.pg = 1; auRerender(); break;
      case "auiSt":    AUI.f.st = sv; AUI.sel = []; AUI.pg = 1; auRerender(); break;
      case "aurK":     AUR.f.k = sv; AUR.pg = 1; auRerender(); break;
      case "aurLv":    AUR.f.lv = sv; AUR.pg = 1; auRerender(); break;
      case "aurCtype": AUR.f.ctype = sv; AUR.f.st = AUR.f.st || ""; AUR.pg = 1; auRerender(); break;
      case "aurSt":    AUR.f.st = sv; AUR.pg = 1; auRerender(); break;
      default: break;
    }
    /* 搜索框**仅输入过程**保持焦点与光标位。
       原实现对 change（失焦 / 回车）也无条件 refocus ⇒ 一按 Tab 或点筛选下拉就被抢回
       搜索框，形成键盘陷阱；且 pos 从已被 innerHTML 替换的脱离节点上读，位置不可靠。 */
    if (/^(aud|ausrc|auuc|aui|aur)K$/.test(t.id)) {
      /* ★ 2026-10-10（R15）：caret 保持此前只守 `input` —— `compositionend`（中文上屏）走的是
         通用 `domFocusRestore`，焦点回来了但 caret 落 0 ⇒ 后续键入会插到串首。此处同守。 */
      if (e.type === "input" || e.type === "compositionend") {
        var el = document.getElementById(t.id);
        if (el) {
          var pos = Math.min(Number(t.selectionStart) || 0, el.value.length);
          el.focus();
          try { el.setSelectionRange(pos, pos); } catch (x) { /* 忽略 */ }
        }
      }
      return;
    }
    if (/^(ausrcSt|auucMode|auucSt|auiKind|auiSt|aurLv|aurCtype|aurSt)$/.test(t.id)) return;
  }

  var act = t.getAttribute("data-auact");
  if (act === "wayLv") {
    var s = AU.sources.filter(function (x) { return x.id === AUS.cur; })[0];
    var i = parseInt(t.getAttribute("data-i"), 10);
    if (!s || !s.ways[i]) return;
    var w0 = s.ways[i], lvOld = Number(w0.lv) || 1, lvNew = parseInt(t.value.replace("L", ""), 10) || 1;
    var applyLv = function () { w0.lv = lvNew; auSave(); auRerender(); toast("已更新级别（演示）"); };
    /* 级别是「源 × 方式」的**裁决属性**，两个方向都改变生效面：
       · **升档**会使原本不满足的访问要求变为满足 ⇒ 走**二次认证**（旧实现直接生效，与降档分档倒挂）；
       · **降档**会让该源下所有用户的认证强度即刻下降 ⇒ 源为已启用时普通确认。
       两者均无取消回调 ⇒ 先自行把控件回滚回原值，再弹窗。 */
    if (lvNew > lvOld) {
      t.value = "L" + lvOld;
      ask2FA("提升认证级别 · " + s.name + " × " + auMethodName(w0.mid), applyLv, null,
        "该方式在本源下的级别将由 <b>L" + lvOld + "</b> 升为 <b>L" + lvNew + "</b>。升档会使原本<b>不满足</b>的访问要求变为<b>满足</b>（改变生效面），"
        /* ★ R55（交互-2）：与 connSave / srcMap / srcEditAttr 同口径 —— 源未启用时不得断言
           「即刻作用于在线认证链路」（源停用即不作用于任何在线链路）。 */
        + (s.st === "已启用"
            ? "并<b>即刻作用于在线认证链路</b>。"
            : "该源当前为 <b>" + esc(s.st) + "</b>，本次变更<b>仅在源启用后生效</b>。")
        + "本次变更入审计。");
      return;
    }
    if (lvNew < lvOld && s.st === "已启用") {
      t.value = "L" + lvOld;
      confirmDlg("降低认证级别 · " + s.name + " × " + auMethodName(w0.mid),
        "该方式在本源下的级别将由 <b>L" + lvOld + "</b> 降为 <b>L" + lvNew + "</b>。认证源 <b>" + esc(s.name) + "</b> 当前为<b>已启用</b>，降档将<b>即刻作用于在线认证链路</b>。<b>确认后入审计</b>。",
        applyLv, "确认降级");
      return;
    }
    applyLv();
    return;
  }
  /* ★ 2026-10-10（R31）：`wayScope`（点击 → 弹窗多选）分支原**错放在本函数** ——
     本函数绑定 change / input / compositionend，而分支自带 `if (e.type !== "click") return;`
     守卫 ⇒ 恒不执行（适用范围不可编辑）。已迁至 `auOnClick`；本函数不再承载点击类动作。 */
  if (act === "wayAnon") {
    var s2 = AU.sources.filter(function (x) { return x.id === AUS.cur; })[0];
    var i2 = parseInt(t.getAttribute("data-i"), 10);
    if (s2 && s2.ways[i2]) { s2.ways[i2].anon = !!t.checked; auSave(); auRerender(); toast("已更新无端支持（演示）· 该声明由无端网关消费，接入执行在网关侧"); }
    return;
  }
}

/* ---------- 10. 事件挂载（追加到 idMountEvents 的页清单） ---------- */
function auMountEvents() {
  ["pg-audict", "pg-ausrc", "pg-auusercred", "pg-auissue", "pg-auauthr"].forEach(function (pid) {
    var el = document.getElementById(pid);
    if (!el) return;
    el.addEventListener("click", auOnClick);
    el.addEventListener("change", auOnChange);
    el.addEventListener("input", auOnChange);
    /* 组合结束（候选上屏）后补一次渲染：组合期间被 A1 守卫跳过的那次筛选在此落地。 */
    el.addEventListener("compositionend", auOnChange);
  });
}

