/* ==========================================================================
   身份模块 · 6 页（2026-09-29 新增）
   --------------------------------------------------------------------------
   页面与对象（一页一对象，不设总览 / 工作台）：
     identity-user.html      用户管理        pg-iduser
     identity-terminal.html  终端管理        pg-idterm
     identity-clientsw.html  客户端软件管理  pg-idcsw
     identity-clientinst.html 客户端实例管理 pg-idcin
     identity-agentsw.html   智能体软件管理  pg-idagsw
     identity-agentinst.html 智能体实例管理  pg-idagin

   ★★ 两条硬口径（写代码前先读，避免实现时走形）：
     ① 「软件 / 实例」两层 —— 软件级（登记 / 版本 / 支持的认证方式）与
        实例级（终端级注册 / License 证书）各自独立成页，不靠下钻区分。
     ② 「智能体」不是客户端软件的一种 —— 客户端软件的定义要件是**集成 SDK**；
        AI agent **不集成 SDK**，判定依据是**受 AI 安全 agent 监管**，两条平行线。
        ⚠ AI 安全 agent 本身**是**特殊客户端软件（它集成 SDK），标特殊。

   ★ 三处「证书」不混：客户端 License 证书（身份侧 · 本模块）/ mTLS 客户端证书
     （认证侧 · 网关凭据托管 c3）/ TLCP 证书对（协议层）。
     License 证书 = 自定义封装容器（授权信息 + CA 证书链），**只含公钥**。

   ★ 页面不出现任何租户信息；作用域用业务词（全局默认 / 按客户端覆写 / 按接入方式）。

   ★★ 2026-10-09（第一轮评审）落定的六条实现口径：
     ① **宿主链**：智能体实例的宿主**必须是 AI 安全 agent 的客户端实例**
        （方案 §1.1：AI 安全 agent 实例负责监管本终端的 AI agent）；
        终端字段由宿主实例派生，不由人工另填 —— 两者不一致即自相矛盾。
     ② **运行时刻唯一**：模块内所有「现在」取 ID_NOW（与认证模块 AU_TS_STAMP 同源）；
        「凭据是否过期」「License 处哪个阶段」一律**按有效期推导**，不写死状态字。
     ③ **状态维度不混**：客户端实例（与终端同口径）拆「生命周期状态」与「在线状态」两列 ——
        方案 §2.4 列的五值本属两个维度，混在一列会让筛选项与数据取值对不上。
     ④ **时间基准不写死**：自增对象（续发凭据 / 签发证书 / 新增终端）的时间一律由
        ID_NOW 派生，禁止在代码里散落字面量时刻。
     ⑤ **弹窗分档**（与认证模块 auConfirmEff 同档）：改变**生效面**的动作
        （启停 / 注销 / 吊销 / 轮换 / 签发 / 续发 / 绑定关系变更）一律**二次认证**；
        只改配置内容的保存走普通确认。
     ⑥ **跨页深链走查询参数**：goPage 是整页跳转，页内变量必然丢失 ⇒
        用 ?cur= / ?asw= 承载目标，由 idDeepLink() 在一次装载内施加一次。
   ========================================================================== */

/* ---------- 0. 演示数据（与其余页面同构：seed + localStorage 合并） ---------- */
var ID_KEY = "baize.assetmgmt.identity.v1";
var ID = null;

/* 模块运行时刻（单一出处）—— 与认证模块同源。
   两模块共用同一份身份数据（认证侧的「签发凭据管理」按 l.no 回写 License 状态），
   各自写一个「现在」会让同一张证书在两侧得出「有效 / 已过期」两种结论。 */
var ID_NOW = (typeof AU_TS_STAMP === "string" && AU_TS_STAMP) ? AU_TS_STAMP : "2026-09-30 09:14";
function idDay() { return String(ID_NOW).slice(0, 10); }
function idPad2(n) { return (n < 10 ? "0" : "") + n; }
/* 时间戳位移（分钟级）—— 短时凭据的有效期一律由 ID_NOW 推出，不写字面量。 */
function idShift(ts, mins) {
  var d = new Date(String(ts).replace(/-/g, "/"));
  d.setMinutes(d.getMinutes() + mins);
  return d.getFullYear() + "-" + idPad2(d.getMonth() + 1) + "-" + idPad2(d.getDate()) +
    " " + idPad2(d.getHours()) + ":" + idPad2(d.getMinutes());
}
/* 日期位移（年 / 日级）—— License 证书的生效日与有效期由前一份证书推出。 */
function idYmdShift(ymd, days, years) {
  var d = new Date(String(ymd).replace(/-/g, "/"));
  if (years) d.setFullYear(d.getFullYear() + years);
  if (days) d.setDate(d.getDate() + days);
  return d.getFullYear() + "-" + idPad2(d.getMonth() + 1) + "-" + idPad2(d.getDate());
}
/* License 阶段**派生**（不读种子里的状态字）：
   待生效 = 生效日在运行时刻之后；已过期 = 有效期至在运行时刻之前；否则当前。
   ⚠ 「已吊销」是**显式状态**（认证侧「吊销凭据」会按 l.no 回写此标记），优先于派生结果。 */
function idLicTagOf(l) {
  if (!l) return "—";
  if (l.tag === "已吊销") return "已吊销";
  var today = idDay();
  if (l.issued && String(l.issued).slice(0, 10) > today) return "待生效";
  /* ★ R61·轮9：边界由严格小于改为小于等于 —— 到期当天应判「已过期」。原实现当天仍判「当前」，
     而认证侧 auIssueSt（mins <= 0）、身份侧 idAgInSt（cred.exp <= ID_NOW）、Web 安全侧 credExpSt
     （days <= 0）三处均为「到期即过期」⇒ 同一编号两侧结论相反。R20 仅对齐了 idAgInSt，本函数漏改。 */
  if (l.exp && String(l.exp).slice(0, 10) <= today) return "已过期";
  return "当前";
}
/* 智能体实例状态**派生**：显式状态优先（已终止 > 已吊销），其次按短时凭据有效期判「已过期 / 运行中」。 */
function idAgInSt(a) {
  if (!a) return "—";
  if (a.st === "已终止") return "已终止";
  if (a.cred && a.cred.st === "已吊销") return "已吊销";
  /* 无短时凭据 ⇒ 不构成「运行中」：此前会伪判为运行中，而同行「凭据有效期至」显示「—」，
     同页两处结论相反。凭据缺失（旧快照 / 异常档）一律按「—（无凭据）」处置，不伪造运行态。 */
  if (!a.cred || !a.cred.exp) return "—";
  /* ★ R20：边界对齐认证侧 `auIssueSt`（`mins <= 0` ⇒ 已过期）—— 此前本侧用严格小于，
     恰好到期的那一刻两模块结论相反（本侧「运行中」/ 认证侧「已过期」）。 */
  return (a.cred.exp <= ID_NOW) ? "已过期" : "运行中";
}
function idLicNo() { return "LC-" + idDay().slice(0, 4) + "-" + String(Math.floor(Math.random() * 900000) + 100000); }
function idCredNo(pid) { return "AT-" + Math.random().toString(16).slice(2, 6).toUpperCase() + "-" + String(pid); }
function idMaskPhone(p) {
  var s = String(p || "").replace(/\D/g, "");
  if (!s) return "—";
  if (s.length < 7) return s;
  return s.slice(0, 3) + "****" + s.slice(s.length - 4);
}
/* 使用记录 IP：由终端 ID 确定性派生（同一终端恒得同一私网地址）。
   不用固定字面量 —— 否则每台终端的使用记录都显示同一个 IP，一眼即假。 */
function idTermIp(id) {
  var h = 5381, s = String(id || "");
  for (var i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 999983;
  return "10.20." + (1 + (h % 220)) + "." + (1 + ((h >> 5) % 250));
}
function idUserByName(n) { return (ID.users || []).filter(function (u) { return u.name === n; })[0] || null; }
function idUserOf(term) {
  return (ID.users || []).filter(function (u) { return u.id === term.ownerId; })[0] || idUserByName(term.owner);
}
function idSwOf(id) { return (ID.csw || []).filter(function (s) { return s.id === id; })[0] || {}; }
function idCinOf(id) { return (ID.cin || []).filter(function (c) { return c.id === id; })[0] || {}; }
function idIsSafeHost(cin) { return !!(cin && idSwOf(cin.sw).agent); }
/* 绑定关系**唯一权威面**是关系表：用户侧 bound / allow 为同一份数据的两处投影。
   任一处写入都经这里，避免「终端侧加了设备、用户侧看不见」。 */
function idBindWrite(u, termId, drop) {
  if (!u) return;
  u.bound = Array.isArray(u.bound) ? u.bound : []; u.allow = Array.isArray(u.allow) ? u.allow : [];
  if (drop) {
    u.bound = u.bound.filter(function (x) { return x !== termId; });
    u.allow = u.allow.filter(function (x) { return x !== termId; });
    return;
  }
  if (u.bound.indexOf(termId) < 0) u.bound.push(termId);
  if (u.allow.indexOf(termId) < 0) u.allow.push(termId);
}

function idSeed() {
  return {
    schema: "id-9",
    /* 用户：台账 + 归属组织 + 角色 + 状态 + 手机号（首次登录短信验证）+ 绑定终端
       （关系表视图，与终端侧同一份数据） */
    users: [
      { id: "u_wangfang",  name: "王芳",   acct: "wangfang",  org: "信贷管理部",   role: "安全管理员", st: "已启用", phone: "13857412306", fail: 0, bound: ["t_pc_0012", "t_nb_0042"],  allow: ["t_pc_0012", "t_nb_0042", "t_nb_0031"] },
      { id: "u_lijun",     name: "李俊",   acct: "lijun",     org: "电子银行部",   role: "操作员",     st: "已启用", phone: "13905748812", fail: 0, bound: ["t_nb_0031"],  allow: ["t_nb_0031"] },
      { id: "u_zhangwei",  name: "张伟",   acct: "zhangwei",  org: "科技管理部",   role: "系统管理员", st: "已启用", phone: "13738952140", fail: 0, bound: ["t_pc_0007"],  allow: ["t_pc_0007", "t_pc_0012", "t_nb_0031"] },
      { id: "u_chenli",    name: "陈丽",   acct: "chenli",    org: "数据管理部",   role: "审计管理员", st: "已启用", phone: "13606551299", fail: 0, bound: ["t_srv_0002"], allow: ["t_srv_0002"] },
      { id: "u_sunhao",    name: "孙浩",   acct: "sunhao",    org: "信贷管理部",   role: "操作员",     st: "已锁定", phone: "15857203355", fail: 5, bound: [],             allow: [] },
      { id: "u_zhouqin",   name: "周琴",   acct: "zhouqin",   org: "综合管理部",   role: "操作员",     st: "已禁用", phone: "13588120076", fail: 0, bound: ["t_pc_0021"],  allow: ["t_pc_0021"] },
      { id: "u_zhaomin",   name: "赵敏",   acct: "zhaomin",   org: "信贷管理部",   role: "操作员",     st: "已启用", phone: "13675842931", fail: 0, bound: [],             allow: [] }
    ],
    /* 终端：宿主侧入口，串联客户端实例与智能体实例两条线。
       ⚠ ownerId 是归属的**关联键**（owner 只是随动的展示名）：按姓名耦合会在改名后断开归属。 */
    terms: [
      { id: "t_pc_0007", name: "科技管理部-张伟-PC", sn: "PC7F3A2C91E004B7", mac: "00-1A-2B-3C-4D-5E", os: "Windows 11 专业版", type: "桌面终端", owner: "张伟", ownerId: "u_zhangwei", org: "科技管理部", st: "已激活", online: "在线", reg: "2026-03-14 09:22", regway: "在线注册 · 管理员审核" },
      { id: "t_pc_0012", name: "信贷管理部-王芳-PC", sn: "PC1D8E44A0F22C93", mac: "3C-7A-8B-11-9F-20", os: "Windows 10 企业版", type: "桌面终端", owner: "王芳", ownerId: "u_wangfang", org: "信贷管理部", st: "已激活", online: "在线", reg: "2026-04-02 14:05", regway: "在线注册 · 自动审核" },
      { id: "t_nb_0031", name: "电子银行部-李俊-NB", sn: "NB9A2C77B1155E08", mac: "A4-5E-60-C1-22-08", os: "macOS 14.5", type: "笔记本", owner: "李俊", ownerId: "u_lijun", org: "电子银行部", st: "已激活", online: "离线", reg: "2026-05-19 10:55", regway: "离线注册 · 管理员审核" },
      { id: "t_srv_0002", name: "数据管理部-审计终端", sn: "SV3E6B10C7A44D2F", mac: "8C-16-45-AB-70-D1", os: "Windows Server 2022", type: "服务器终端", owner: "陈丽", ownerId: "u_chenli", org: "数据管理部", st: "已激活", online: "在线", reg: "2026-02-08 16:30", regway: "在线注册 · 管理员审核" },
      { id: "t_pc_0021", name: "综合管理部-周琴-PC", sn: "PC5C0F93D2B661A4", mac: "2C-8A-F7-0B-44-63", os: "Windows 11 家庭版", type: "桌面终端", owner: "周琴", ownerId: "u_zhouqin", org: "综合管理部", st: "已禁用", online: "离线", reg: "2026-01-08 09:26", regway: "在线注册 · 管理员审核" },
      /* 一个用户可同时拥有多台终端（王芳：PC + NB）—— 此前种子恒为 1:1，未体现该基数。 */
      { id: "t_nb_0042", name: "信贷管理部-王芳-NB", sn: "NB7B31D9E4F0A6C2", mac: "7C-4F-2A-19-8B-30", os: "Windows 11 专业版", type: "笔记本", owner: "王芳", ownerId: "u_wangfang", org: "信贷管理部", st: "已激活", online: "离线", reg: "2026-06-15 13:40", regway: "在线注册 · 管理员审核" }
    ],
    /* 客户端软件（软件级 · 集成 SDK）—— AI 安全 agent 在列并标特殊。
       唯一序列号口径：16 位字母 + 8 位数字（与新建弹窗的校验一致）。
       版本与校验码按**操作系统**分列（osver）—— 同一款软件在不同 OS 上版本号与 SHA256 各自独立；
       软件级的版本列表由 idSwVers() 从 osver 派生，不另存一份（消除同字段两处口径）。 */
    csw: [
      { id: "sw_baize_pc",  name: "白泽客户端（PC）",     sn: "BAIZEPCCLIENTAAA20260001", kind: "白泽官方客户端", agent: false, regway: "在线注册 · 管理员审核", bind: true, cert: "自有证书", proto: "TLCP", vsig: "哈希值校验 + 客户端签名校验", osver: [
          { os: "Windows", ver: "3.2.1", size: "98.4 MB", sha256: "6f8a1c47d2e95b30a7c418fe6d2b9a53c07e14bd8a3f26519ec7d40b31fa8d62", sig: "已签名 · 白泽代码签名 CA（RSA-2048）", at: "2026-05-12", pub: true },
          { os: "Windows", ver: "3.1.8", size: "96.1 MB", sha256: "1c3d9b0a75ef2468c4108fd7ab62e95370cf8a41d2b6e08735f9a4c1de70b28f", sig: "已签名 · 白泽代码签名 CA（RSA-2048）", at: "2026-03-28", pub: true },
          { os: "macOS", ver: "3.2.1", size: "112.6 MB", sha256: "a9084fd21b6c73e05fa2d8c4917be3067da5f2019c8e4b37f06a1d95e2c3b708", sig: "已签名 · 白泽代码签名 CA（RSA-2048）", at: "2026-05-12", pub: true },
          { os: "Linux", ver: "3.2.0", size: "104.2 MB", sha256: "b4710e9a3c8d562f1a09b7e4d5c283f619a4e7b3d0f582c91e63b4a7d05f8c21", sig: "已签名 · 白泽代码签名 CA（SM2）", at: "2026-04-20", pub: true }
        ], assets: ["核心网银门户", "信贷审批系统", "手机银行后台", "对公客户影像库", "报表中心", "报表导出网关"], ameth: ["pwd", "otp", "fp", "usbkey", "face"] },
      { id: "sw_baize_mb",  name: "白泽客户端（移动）",   sn: "BAIZEMOBILEAPPXX20260002", kind: "白泽官方客户端", agent: false, regway: "在线注册 · 自动审核", bind: true, cert: "自有证书", proto: "TLCP", vsig: "哈希值校验", osver: [
          { os: "Android", ver: "3.2.1", size: "42.7 MB", sha256: "2d7c0b83e51a94f6204cd8b17e3fa5960c84d2a7b1e93f5608ac47d2e1b90f35", sig: "已签名 · 白泽代码签名 CA（RSA-2048）", at: "2026-05-12", pub: true },
          { os: "iOS", ver: "3.2.1", size: "51.3 MB", sha256: "9e40d17c3b825a6f041ed9c2785b3fa601c94e2d7b8a3506f1e2c4d90a7b6385", sig: "已签名 · 白泽代码签名 CA（RSA-2048）", at: "2026-05-12", pub: true },
          { os: "HarmonyOS", ver: "3.2.0", size: "45.9 MB", sha256: "507ba2e14c96d380f1a27ce5b4d0963817e5ac2f9b0d4761c3e8a52f70b4d9e6", sig: "未签名", at: "2026-06-30", pub: false }
        ], assets: ["核心网银门户", "信贷审批系统", "手机银行后台", "报表中心", "报表导出网关"], ameth: ["pwd", "otp", "fp", "face"] },
      { id: "sw_csii_oa",   name: "客户集成 OA 插件",     sn: "CSIISDKOAPLUGXYZ20260003", kind: "客户 SDK 集成", agent: false, regway: "在线注册 · 管理员审核", bind: false, cert: "CA 机构签发", proto: "TLS", vsig: "客户端签名校验", osver: [
          { os: "Windows", ver: "2.4.0", size: "18.2 MB", sha256: "4a1f8c02d7e3b569f04a27c1e85d3b9072fa641d0c3e8b57a291f4d6c05b3e78", sig: "已签名 · 外购 CA（CFCA）", at: "2026-02-11", pub: true },
          { os: "macOS", ver: "2.4.0", size: "20.5 MB", sha256: "7c2e4905b1a683d4f5029e7c3b4d81560da9e2f4c7b13085a6d92e4f018b7c39", sig: "已签名 · 外购 CA（CFCA）", at: "2026-02-11", pub: true }
        ], assets: ["统一身份门户", "报表中心", "报表导出网关"], ameth: ["pwd", "otp"] },
      { id: "sw_aiagent",   name: "AI 安全 agent",        sn: "BAIZEAISECAGENTX20260004", kind: "AI 安全 agent", agent: true, regway: "在线注册 · 管理员审核", bind: false, cert: "自有证书", proto: "TLCP", vsig: "哈希值校验 + 客户端签名校验", osver: [
          { os: "Windows", ver: "1.6.0", size: "64.8 MB", sha256: "d83f5a19c47b0e62a1d904f7b8c23e5610fa7d4b9e83c26051fab9d3e7046c82", sig: "已签名 · 白泽代码签名 CA（RSA-2048）", at: "2026-06-01", pub: true },
          { os: "Windows", ver: "1.5.2", size: "62.1 MB", sha256: "0b6e2d7f94a1c385e04d27b6f8a53c19607e4b2d9f8a3c15062dbe79a4c3f015", sig: "已签名 · 白泽代码签名 CA（RSA-2048）", at: "2026-03-05", pub: true },
          { os: "Windows", ver: "1.4.0", size: "60.4 MB", sha256: "3a7f0c91b2d46e5804c1a7e9f3d26b805a1c4e7d9b0f3286a5d1c7e40b9f6382", sig: "已签名 · 白泽代码签名 CA（RSA-2048）", at: "2025-12-18", pub: true },
          { os: "Linux", ver: "1.6.0", size: "68.3 MB", sha256: "e91c47b30a6d582f14c097e2d3b86a450f1c7d92b4e06a3587c1e9d40b26f7a3", sig: "已签名 · 白泽代码签名 CA（SM2）", at: "2026-06-01", pub: true }
        ], assets: ["核心网银门户", "信贷审批系统", "客户数据仓库", "监管报送接口", "反洗钱报送门户"], ameth: ["pwd", "fp"] }
    ],
    /* 客户端实例（终端级注册）—— License 证书在此页看与改。
       ⚠ st = 生命周期（已激活 / 禁用 / 已卸载）；online = 在线状态（在线 / 离线），两维分列。
       ⚠ ver = **客户端最近一次成功上报的版本**（平台不推断）；verlog = 版本变更与下发记录。
         **平台推送升级 / 用户自行升级 / 离线安装包安装**三条路径一律经 idCinVerUpd 登记 ——
         口径是「无论怎么升，升完必须回采并更新实例版本号」，不能只认平台下发那条路。
         ⚠ **下发 ≠ 回采**：平台把升级推给**离线**客户端，客户端既收不到也来不及上报 ⇒
           该条只记「待生效」且 **ver 不变**，等客户端上线回采后才更新；否则就是平台推断版本。 */
    cin: [
      { id: "ci_001", sw: "sw_baize_pc", term: "t_pc_0007", cidseq: "BZPC-0007-3A2C", ver: "3.2.1", st: "已激活", online: "在线", lic: [
          { id: "lic_001a", no: "LC-2026-000701", issued: "2026-03-14", exp: "2027-03-13", tag: "当前", ca: "白泽内网 CA", scope: "信贷核心系统 / 客户管理平台" },
          { id: "lic_001b", no: "LC-2027-000702", issued: "2027-03-14", exp: "2028-03-13", tag: "待生效", ca: "白泽内网 CA", scope: "信贷核心系统 / 客户管理平台" } ],
          /* 两条记录＝一次**失败后重试成功**：升级的「下发」与「回采」是两件事 ——
             5-11 下发后客户端签名校验未通过，版本**停在 3.1.8**（result 标失败、ver 不得前进）；
             5-12 重试成功，客户端上线回采后版本才变为 3.2.1。 */
          verlog: [
            { at: "2026-05-11 17:22", from: "3.1.8", to: "3.2.1", way: "平台推送升级", result: "失败·签名校验未通过" },
            { at: "2026-05-12 09:41", from: "3.1.8", to: "3.2.1", way: "平台推送升级", result: "成功" }] },
      { id: "ci_002", sw: "sw_baize_pc", term: "t_pc_0012", cidseq: "BZPC-0012-1D8E", ver: "3.2.1", st: "已激活", online: "在线", lic: [
          { id: "lic_002a", no: "LC-2026-001201", issued: "2026-04-02", exp: "2027-04-01", tag: "当前", ca: "白泽内网 CA", scope: "信贷核心系统 / 客户管理平台 / 报表分析平台" } ],
          verlog: [{ at: "2026-05-12 14:22", from: "3.1.8", to: "3.2.1", way: "用户手动升级", result: "成功" }] },
      /* 电子银行部-李俊-NB 是 **macOS 笔记本** ⇒ 应装 PC 客户端，不是「移动」客户端。
         原种子挂 sw_baize_mb（Android / iOS / HarmonyOS）属跨端矛盾，本次按终端操作系统归正。 */
      { id: "ci_003", sw: "sw_baize_pc", term: "t_nb_0031", cidseq: "BZPC-0031-9A2C", ver: "3.2.1", st: "已禁用", online: "离线", lic: [
          { id: "lic_003a", no: "LC-2026-003101", issued: "2026-05-19", exp: "2027-05-18", tag: "当前", ca: "白泽内网 CA", scope: "信贷核心系统 / 报表分析平台" } ] },
      { id: "ci_004", sw: "sw_aiagent", term: "t_pc_0007", cidseq: "BZAI-0007-3A2C", ver: "1.6.0", st: "已激活", online: "在线", lic: [
          { id: "lic_004a", no: "LC-2026-004001", issued: "2026-06-01", exp: "2027-05-31", tag: "当前", ca: "白泽内网 CA", scope: "信贷核心系统 / 数据中台" } ] },
      { id: "ci_005", sw: "sw_csii_oa", term: "t_pc_0021", cidseq: "CSOA-0021-5C0F", ver: "2.4.0", st: "已卸载", online: "离线", lic: [
          { id: "lic_005a", no: "LC-2026-005101", issued: "2026-01-11", exp: "2027-01-10", tag: "已吊销", ca: "外购 CA（CFCA）", scope: "办公自动化平台" } ] },
      { id: "ci_006", sw: "sw_aiagent", term: "t_pc_0012", cidseq: "BZAI-0012-1D8E", ver: "1.5.2", st: "已激活", online: "在线", lic: [
          { id: "lic_006a", no: "LC-2026-006001", issued: "2026-08-18", exp: "2027-08-17", tag: "当前", ca: "白泽内网 CA", scope: "信贷核心系统 / 客户管理平台 / 数据中台" } ],
          verlog: [{ at: "2026-08-19 09:12", from: "1.4.0", to: "1.5.2", way: "离线安装包升级", result: "成功" }] },
      { id: "ci_007", sw: "sw_baize_pc", term: "t_nb_0042", cidseq: "BZPC-0042-7B31", ver: "3.2.1", st: "已激活", online: "离线", lic: [
          { id: "lic_007a", no: "LC-2026-004201", issued: "2026-06-15", exp: "2027-06-14", tag: "当前", ca: "白泽内网 CA", scope: "信贷核心系统 / 客户管理平台" } ] }
    ],
    /* 智能体软件（受 AI 安全 agent 监管 · 不集成 SDK） */
    asw: [
      { id: "asw_code",  name: "代码助手 Agent",   vendor: "内部自研",  proc: "code-agent.exe",       ver: ["2.1.0", "2.0.4"], guardian: "sw_aiagent", policy: "仅可访问代码库与需求库；禁止访问信贷核心系统", st: "受管" },
      { id: "asw_rep",   name: "报表生成 Agent",   vendor: "星环科技",  proc: "report-agent.exe",     ver: ["1.4.2"],          guardian: "sw_aiagent", policy: "仅可访问报表分析平台（只读）", st: "受管" },
      { id: "asw_risk",  name: "风控建模 Agent",   vendor: "内部自研",  proc: "riskmodel-agent.exe",  ver: ["0.9.7"],          guardian: "sw_aiagent", policy: "沙箱环境内运行；禁止连接生产数据源", st: "受管" },
      { id: "asw_cust",  name: "客服对话 Agent",   vendor: "科大讯飞",  proc: "cs-agent.exe",         ver: ["3.0.1"],          guardian: "",           policy: "待指定监管 agent", st: "待纳管" }
    ],
    /* 智能体实例（终端上的落地 · 短时凭据）
       ⚠ host 必须是 **AI 安全 agent 的客户端实例**；term 由 host 派生（两者不一致即自相矛盾）。
       ⚠ st **只承载显式终止**（"已终止"）；运行中 / 已过期一律由短时凭据有效期派生
         （idAgInSt）—— 种子不再写 "运行中"，否则「快照说运行中、派生说已过期」两处自相矛盾。
       ⚠ 短时凭据被认证侧「吊销凭据」吊销后，cred.st 置 "已吊销"（认证侧按 cred.no 回写），
         idAgInSt 据此返回「已吊销」—— 与 License 证书侧 l.tag 同构（见 idLicTagOf）。 */
    ain: [
      { id: "ai_01", asw: "asw_code", term: "t_pc_0007", host: "ci_004", pid: "4821", cred: { no: "AT-3A2C-7F19", issued: "2026-09-30 09:05", exp: "2026-09-30 09:35" } },
      { id: "ai_02", asw: "asw_rep",  term: "t_pc_0007", host: "ci_004", pid: "5187", cred: { no: "AT-3A2C-5187", issued: "2026-09-30 08:20", exp: "2026-09-30 08:50" } },
      { id: "ai_03", asw: "asw_code", term: "t_pc_0012", host: "ci_006", pid: "2210", cred: { no: "AT-1D8E-2210", issued: "2026-09-30 09:02", exp: "2026-09-30 09:32" } },
      { id: "ai_04", asw: "asw_risk", term: "t_pc_0012", host: "ci_006", pid: "9034", cred: { no: "AT-1D8E-9034", issued: "2026-09-30 07:55", exp: "2026-09-30 08:25" }, st: "已终止" }
    ],
    /* 注册申请（审核对象是**安装在终端上的客户端实例**；通过后自动生成证书并下发） */
    apps: [
      { id: "ap_001", term: "", name: "信贷管理部-赵敏-PC", sn: "PC4A71B2E6D0C8F3", os: "Windows 11 专业版", type: "桌面终端", owner: "赵敏", org: "信贷管理部", sw: "sw_baize_pc", cidseq: "BZPC-0104-4A71", way: "在线注册 · 管理员审核", at: "2026-09-30 08:52", st: "待审核" },
      { id: "ap_002", term: "t_nb_0031", name: "电子银行部-李俊-NB", sn: "NB9A2C77B1155E08", os: "macOS 14.5", type: "笔记本", owner: "李俊", org: "电子银行部", sw: "sw_csii_oa", cidseq: "CSOA-0031-9A2C", way: "在线注册 · 管理员审核", at: "2026-09-30 09:06", st: "待审核" },
      { id: "ap_003", term: "t_nb_0031", name: "电子银行部-李俊-NB", sn: "NB9A2C77B1155E08", os: "macOS 14.5", type: "笔记本", owner: "李俊", org: "电子银行部", sw: "sw_baize_pc", cidseq: "BZPC-0031-9A2C", way: "离线注册 · 管理员审核", at: "2026-05-19 10:41", done: "2026-05-19 10:55", reviewer: "张伟", st: "已通过" },
      { id: "ap_005", term: "t_pc_0021", name: "综合管理部-周琴-PC", sn: "PC5C0F93D2B661A4", os: "Windows 11 家庭版", type: "桌面终端", owner: "周琴", org: "综合管理部", sw: "sw_csii_oa", cidseq: "CSOA-0021-5C0F", way: "在线注册 · 管理员审核", at: "2026-01-08 09:04", done: "2026-01-08 09:26", reviewer: "张伟", st: "已通过" },
      { id: "ap_004", term: "t_pc_0021", name: "综合管理部-周琴-PC", sn: "PC5C0F93D2B661A4", os: "Windows 11 家庭版", type: "桌面终端", owner: "周琴", org: "综合管理部", sw: "sw_baize_pc", cidseq: "BZPC-0021-5C0F", way: "在线注册 · 管理员审核", at: "2026-01-11 08:40", done: "2026-01-11 09:12", reviewer: "张伟", st: "已拒绝", reason: "设备未通过合规基线检查（缺少指定安全补丁）" },
      { id: "ap_006", term: "t_nb_0042", name: "信贷管理部-王芳-NB", sn: "NB7B31D9E4F0A6C2", os: "Windows 11 专业版", type: "笔记本", owner: "王芳", org: "信贷管理部", sw: "sw_baize_pc", cidseq: "BZPC-0042-7B31", way: "在线注册 · 管理员审核", at: "2026-06-15 13:22", done: "2026-06-15 13:40", reviewer: "张伟", st: "已通过" }
    ]
  };
}

function idLoad() {
  var d = idSeed();
  ID = null;
  try {
    var s = JSON.parse(localStorage.getItem(ID_KEY) || "null");
    /* 口径版号一致才沿用旧快照：数据模型变了却继续合并旧值，
       会把「新口径的字段」与「旧口径的状态字」拼成一份自相矛盾的台账。 */
    if (s && typeof s === "object" && s.schema === d.schema) ID = s;
  } catch (e) { /* 忽略 */ }
  if (!ID || typeof ID !== "object") ID = d;
  ["users", "terms", "csw", "cin", "asw", "ain", "apps"].forEach(function (k) {
    if (!Array.isArray(ID[k])) ID[k] = d[k];
  });
  /* 用 Array.isArray 而非真值兜底：非数组真值（字符串等）会绕过 `|| []`，使下游 .map 抛错崩页。 */
  (ID.users || []).forEach(function (u) { u.bound = Array.isArray(u.bound) ? u.bound : []; u.allow = Array.isArray(u.allow) ? u.allow : []; });
  (ID.terms || []).forEach(function (t) {
    /* 旧快照无 ownerId：按姓名回填一次，此后归属只认 id（改名不再断开归属）。 */
    if (!t.ownerId) { var o = idUserByName(t.owner); if (o) t.ownerId = o.id; }
  });
  /* 注册申请：st 缺失会使 idPendingApps 漏计、idStTag 落灰，静默作废待审计数 ⇒ 入口兜底
     （已决申请按 done 有无回填为已通过 / 待审核）。 */
  (ID.apps || []).forEach(function (p) { if (!p.st) p.st = p.done ? "已通过" : "待审核"; });
  /* 客户端软件的「支持认证方式」回归 PRD 口径：旧内码 webauthn / bio / facial 折算为
     指纹识别 / USB Key 硬件令牌 / 活体人脸识别，并丢弃已不在字典内的内码。 */
  (ID.csw || []).forEach(function (s) {
    /* 版本列表兜底：pre-id-7 快照只有软件级 ver、没有按操作系统分列的 osver。
       两类消费点已统一走派生出口 idSwVers(s)（osver 优先、无 osver 时退回 ver），
       此处仅保证退回路径有值 —— 非数组 / 空数组一律补一条。
       **不在此处伪造 osver 行**：伪造校验码等于把「未登记」写成「已登记」。 */
    if (!Array.isArray(s.ver) || !s.ver.length) s.ver = ["1.0.0"];
    if (!Array.isArray(s.ameth)) return;
    var out = [];
    s.ameth.forEach(function (k) {
      var nk = (typeof AU_MID_LEGACY !== "undefined" && AU_MID_LEGACY[k]) || k;
      if (ID_AMETH_DEF().some(function (m) { return m.k === nk; }) && out.indexOf(nk) < 0) out.push(nk);
    });
    s.ameth = out;
  });
  (ID.asw || []).forEach(function (s) {
    if (!Array.isArray(s.ver) || !s.ver.length) s.ver = ["1.0.0"];
  });
  /* 客户端实例（cin）此前零字段级归一化：lic 数组与 online 入口兜底（online 缺失按 fail-safe 离线）；
     st 与 cidseq 为业务语义值，缺失时由展示层兜底，不在此伪造。 */
  (ID.cin || []).forEach(function (c) {
    if (!Array.isArray(c.lic)) c.lic = [];
    if (!c.online) c.online = "离线";
    /* 版本变更记录（verlog）兜底：pre-id-7 快照无此字段 ⇒ 空数组表示「首次安装注册时上报、
       期间无版本变更」，页面据此渲染退化行。**不伪造历史**（伪造等于把「没采集到」写成「采集到了」）。 */
    if (!Array.isArray(c.verlog)) c.verlog = [];
  });
  /* 智能体实例的宿主若指向非 AI 安全 agent 实例（旧快照 / 手工改档），按终端就近归正到
     AI 安全 agent 实例；找不到宿主时保留原值，交由页面提示，不做静默丢弃。 */
  (ID.ain || []).forEach(function (a) {
    var h = idCinOf(a.host);
    if (idIsSafeHost(h)) { a.term = h.term; return; }
    var alt = (ID.cin || []).filter(function (c) { return idIsSafeHost(c) && c.term === a.term; })[0];
    if (alt) { a.host = alt.id; a.term = alt.term; }
  });
  ID.schema = d.schema;
}
function idSave() { if (!ID) return; try { localStorage.setItem(ID_KEY, JSON.stringify(ID)); } catch (e) { /* 忽略 */ } }
function idAsk(title, msg, cb, ok) { confirmDlg(title, msg, cb, ok); }
/* 生效面动作的统一入口（与认证模块 auConfirmEff 同档：ask2FA 二次认证）。
   判据是「认的是改变生效面，不是动作名称」：启停 / 注销 / 吊销 / 轮换 / 签发 / 续发 /
   绑定关系变更 一律二次认证；只改配置内容的保存走普通确认 idAsk。 */
function idAskEff(title, msg, cb) { ask2FA(title, cb || null, null, msg); }

/* ---------- 1. 通用小件 ---------- */
function idStTag(st) {
  var m = { "已启用": "t-ok", "已激活": "t-ok", "在线": "t-ok", "运行中": "t-ok", "受管": "t-ok", "当前": "t-ok",
            "已锁定": "t-warn", "待纳管": "t-warn", "待生效": "t-warn", "待审核": "t-warn", "已通过": "t-ok", "成功": "t-ok", "失败": "t-err",
            "离线": "t-gray", "未激活": "t-gray", "已注销": "t-gray",
            "已禁用": "t-err", "禁用": "t-err", "已过期": "t-err", "已终止": "t-err", "已卸载": "t-err", "已吊销": "t-err", "已拒绝": "t-err" };
  return '<span class="tag ' + (m[st] || "t-gray") + '">' + esc(st) + "</span>";
}
function idName(arr, id, key, nk) {
  key = key || "id"; nk = nk || "name";
  for (var i = 0; i < arr.length; i++) if (arr[i][key] === id) return arr[i][nk];
  return "—";
}
function idTbl(head, body, cols, attrs) {
  var cg = cols ? "<colgroup>" + cols.map(function (w) { return w ? '<col style="width:' + w + '">' : "<col>"; }).join("") + "</colgroup>" : "";
  return '<div class="tbl-wrap"><table class="mtx lst"' + (attrs || "") + ">" + cg +
    "<thead><tr>" + head.map(function (h) { return '<th scope="col">' + h + "</th>"; }).join("") + "</tr></thead>" +
    "<tbody>" + body + "</tbody></table></div>";
}
function idEmptyRow(n, txt) { return '<tr><td colspan="' + n + '" class="cell-dim" style="text-align:center;padding:22px">' + esc(txt) + "</td></tr>"; }
/* ★ R61（轮7）：列表空态统一范式 —— 区分「暂无数据」与「筛选无结果」，后者给出一键清空出口。
   范式来源：准入策略 `aspEmptyRow`（20-policy.js）、Web 安全 `wsClearF`（30-websec.js）、资产列表 `assetClearF`。
   原实现六张表恒用「没有符合条件的X」—— 列表本就为空时该文案把「无数据」误述成「被筛掉」，
   且筛选到空后无任何出口（下拉无法像搜索框那样一键清空），只能逐个控件手改。 */
function idEmptyRowF(n, noneTxt, fltTxt, hasFilter, clearAct) {
  if (hasFilter) {
    return '<tr><td colspan="' + n + '" style="text-align:center;padding:22px">' +
      '<div style="font-weight:640">' + esc(fltTxt) + '</div>' +
      '<div class="muted" style="margin-top:6px">当前筛选条件下没有记录，调整筛选条件后重试</div>' +
      '<div style="margin-top:10px"><button class="btn sm" data-idact="' + clearAct + '">清空筛选条件</button></div></td></tr>';
  }
  return '<tr><td colspan="' + n + '" style="text-align:center;padding:22px">' +
    '<div style="font-weight:640">' + esc(noneTxt) + '</div></td></tr>';
}
/* ★ R61·轮9：带「清空筛选条件」按钮的空态行（跨模块复用）。actAttr/actVal 走属性分派（data-auact 等）；
   onclickFn 提供时走内联 onclick —— Web 安全台账表（CA / mTLS）本就用内联 onclick 范式。 */
function emptyRowBtn(n, txt, actAttr, actVal, onclickFn) {
  var btn = onclickFn
    ? '<button class="btn sm" type="button" onclick="' + onclickFn + '()">清空筛选条件</button>'
    : '<button class="btn sm" ' + actAttr + '="' + actVal + '">清空筛选条件</button>';
  return '<tr><td colspan="' + n + '" style="text-align:center;padding:22px">' +
    '<div style="font-weight:640">' + esc(txt) + '</div>' +
    '<div class="muted" style="margin-top:6px">当前筛选条件下没有记录，调整筛选条件后重试</div>' +
    '<div style="margin-top:10px">' + btn + '</div></td></tr>';
}
function idTitle(h2, sub, right) {
  return '<div class="title-row"><div><h2>' + esc(h2) + "</h2>" +
    (sub ? '<div class="muted" style="margin-top:4px">' + sub + "</div>" : "") +
    "</div>" + (right || "") + "</div>";
}
/* 跨模块只读引用横幅（方案 §八 第 2 条：跨模块只读引用须显式标注） */
function idRefNote(txt) { return '<div class="hint-row"><i class="ic" aria-hidden="true">引用</i><div>' + txt + "</div></div>"; }
/* 业务说明块：区分边界，不写租户/作用域词 */
function idScopeNote(txt) { return '<div class="hint-row"><i class="ic" aria-hidden="true">边界</i><div>' + txt + "</div></div>"; }
/* 行内按钮：形态统一口径 —— 进入下一层用 .btn.sm，就地动作（状态 / 危险 / 串联）用 .btn.link */
function idBtn(act, id, label, cls, extra) {
  return '<button class="btn ' + (cls || "link") + '" data-idact="' + act + '" data-id="' + esc(id) + '"' +
    (extra || "") + ">" + esc(label) + "</button>";
}
function idKvLeft(t) { return '<span class="k">' + esc(t) + "</span>"; }
function idKvVal(html) { return '<span class="mini">' + html + "</span>"; }
/* ---------- 页内 TAB（长详情页分区）----------
   · 复用既有 .tabs / .tbp 两条样式，不自造外观；
   · 切 TAB **只切显隐、不重渲染** —— 保住各分区内的滚动位置与控件态；
   · `aria-selected` / `aria-hidden` / `tabindex` 必须与 `.on` **同步**：只切 class 会让读屏与
     断言都拿到**陈旧**值（动态防护模块 Q7d 实测过该缺陷），此处按同一条纪律实现；
   · roving tabindex（WAI-ARIA tabs 模式）：整条 TAB 条在 Tab 键序里只占 1 个停靠点，其内用 ← / → 移动。 */
function idTabBar(navId, items, cur) {
  return '<div class="tabs" id="' + navId + '" role="tablist" data-idtab="1" aria-label="详情分区">' +
    items.map(function (x) {
      var on = x[0] === cur;
      return '<button type="button" role="tab" id="' + navId + '-tab-' + x[0] + '"' +
        ' data-idact="idTab" data-nav="' + navId + '" data-t="' + x[0] + '"' +
        ' aria-controls="' + navId + '-p-' + x[0] + '" aria-selected="' + on + '"' +
        ' tabindex="' + (on ? "0" : "-1") + '"' + (on ? ' class="on"' : "") + ">" + x[1] + "</button>";
    }).join("") + "</div>";
}
function idTabPane(navId, k, on, inner) {
  return '<div class="tbp' + (on ? " on" : "") + '" id="' + navId + '-p-' + k + '"' +
    ' role="tabpanel" aria-labelledby="' + navId + '-tab-' + k + '"' +
    ' aria-hidden="' + (on ? "false" : "true") + '" style="padding-top:16px">' + inner + "</div>";
}
function idTabShow(navId, which) {
  var nav = document.getElementById(navId); if (!nav) return;
  var host = (nav.closest && nav.closest(".pg")) || nav.parentNode; if (!host) return;
  var panes = host.querySelectorAll(".tbp");
  for (var i = 0; i < panes.length; i++) {
    var p = panes[i], on = p.id === navId + "-p-" + which;
    p.classList.toggle("on", on);
    p.setAttribute("aria-hidden", on ? "false" : "true");
  }
  var bs = nav.querySelectorAll('button[role="tab"]');
  for (var j = 0; j < bs.length; j++) {
    var b = bs[j], on2 = b.getAttribute("data-t") === which;
    b.classList.toggle("on", on2);
    b.setAttribute("aria-selected", on2 ? "true" : "false");
    b.setAttribute("tabindex", on2 ? "0" : "-1");
  }
}
/* TAB 条键盘可达：← / → 循环切换，Home / End 跳首末；切换后焦点跟随新选中项。 */
function idOnKey(e) {
  var t = e.target; if (!t || !t.closest) return;
  var bar = t.closest('[role="tablist"][data-idtab]'); if (!bar) return;
  var k = e.key;
  if (k !== "ArrowLeft" && k !== "ArrowRight" && k !== "Home" && k !== "End") return;
  var bs = [].slice.call(bar.querySelectorAll('button[role="tab"]'));
  var i = bs.indexOf(t); if (i < 0) return;
  var j = k === "Home" ? 0 : (k === "End" ? bs.length - 1
    : (k === "ArrowRight" ? (i + 1) % bs.length : (i - 1 + bs.length) % bs.length));
  e.preventDefault();
  bs[j].focus(); bs[j].click();
}

/* ---------- 2. 页① 用户管理（pg-iduser） ---------- */
var IDU = { f: { k: "", org: "", role: "", st: "" }, pg: 1, cur: "" };

function idUserFiltered() {
  var f = IDU.f;
  return ID.users.filter(function (u) {
    if (f.k && (u.name + u.acct).toLowerCase().indexOf(f.k.toLowerCase()) < 0) return false;
    if (f.org && u.org !== f.org) return false;
    if (f.role && u.role !== f.role) return false;
    if (f.st && u.st !== f.st) return false;
    return true;
  });
}
/* 状态动作文案：锁定是「多次失败」的系统处置，出口是**解锁**，与启停不是同一动作。 */
function idUserToggleLabel(u) {
  if (u.st === "已锁定") return "解锁";
  return u.st === "已启用" ? "禁用" : "启用";
}
function idUserRow(u) {
  var tms = (u.bound || []).map(function (t) { return idName(ID.terms, t, "id", "name"); });
  return "<tr>" +
    "<td><b>" + esc(u.name) + '</b><div class="mini muted">' + esc(u.acct) + "</div></td>" +
    "<td>" + esc(u.org) + "</td>" +
    "<td>" + esc(u.role) + "</td>" +
    "<td>" + idStTag(u.st) + "</td>" +
    '<td class="cell-cov">' + (tms.length ? esc(tms.join("、")) : '<span class="muted">—</span>') + "</td>" +
    '<td class="cell-cov">' + ((u.allow || []).length ? "<b>" + (u.allow || []).length + "</b> 台" : '<span class="muted">—</span>') + "</td>" +
    "<td>" + idBtn("userView", u.id, "详情", "sm") + idBtn("userEdit", u.id, "编辑") +
      idBtn("userToggle", u.id, idUserToggleLabel(u)) + "</td></tr>";
}
function idUserPage() {
  if (IDU.cur) { var u = ID.users.filter(function (x) { return x.id === IDU.cur; })[0]; if (u) return idUserDetail(u); }
  var rows = idUserFiltered();
  var size = LIST_PAGE, pg = Math.max(1, Math.min(IDU.pg, Math.ceil(rows.length / size) || 1));
  IDU.pg = pg;
  var slice = rows.slice((pg - 1) * size, pg * size);
  var orgs = [], roles = [];
  ID.users.forEach(function (u) { if (orgs.indexOf(u.org) < 0) orgs.push(u.org); if (roles.indexOf(u.role) < 0) roles.push(u.role); });
  return idTitle("用户管理", "平台用户账号台账 · 含<b>用户 ↔ 终端绑定</b>关系（双向视图，与「终端管理」侧为同一份数据）",
      '<div class="toolbar"><button class="btn" data-idact="userImport">Excel 批量导入</button>' +
      '<button class="btn primary" data-idact="userNew">新建用户</button></div>') +
    idRefNote("本页为访问主体中的<b>「人」</b>。角色模型按等保 2.0 三权分立：<b>系统管理员 / 安全管理员 / 审计管理员两两互斥</b>；操作员为基础角色，不在三权分立范围内。") +
    '<div class="card"><div class="card-b">' +
    '<div class="toolbar" style="margin-bottom:12px">' +
      '<div class="input-w"><input type="search" id="iduK" aria-label="搜索用户" placeholder="搜索姓名 / 账号" style="width:210px" value="' + esc(IDU.f.k) + '"><i aria-hidden="true">搜索</i></div>' +
      '<select id="iduOrg" aria-label="按归属组织筛选"><option value="">全部组织</option>' + orgs.map(function (o) { return "<option" + (IDU.f.org === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" +
      '<select id="iduRole" aria-label="按角色筛选"><option value="">全部角色</option>' + roles.map(function (o) { return "<option" + (IDU.f.role === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" +
      '<select id="iduSt" aria-label="按账号状态筛选"><option value="">全部状态</option>' + ["已启用", "已锁定", "已禁用"].map(function (o) { return "<option" + (IDU.f.st === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" +
    "</div>" +
    idTbl(["用户", "归属组织", "角色", "状态", "归属终端", "有权使用的终端", "操作"],
      slice.length ? slice.map(idUserRow).join("") : idEmptyRowF(7, "暂无用户", "无匹配用户", !!(IDU.f.k || IDU.f.org || IDU.f.role || IDU.f.st), "idClearFUser"),
      /* R19（实测）：归属终端需 281px（原 221px ⇒ 姓名稍长即折行）；
         「有权使用的终端」只显示台数，按表头（需 116px）定宽，余量交给自动列「用户」。 */
      [null, "96px", "96px", "90px", "300px", "124px", "152px"]) +
    '<div class="lst-foot"><div id="iduPager" role="navigation" aria-label="用户列表分页" style="flex:1"></div></div>' +
    '<div class="mini" style="margin-top:8px">批量导入的用户<b>无初始密码</b>，首次登录须经<b>手机号短信验证</b>后<b>自助设置密码</b>；禁用用户时<b>正在使用的会话会被强制下线</b>；连续输错密码达设定次数后<b>账号自动锁定</b>，须管理员手动<b>解锁</b>（解锁与启停同属敏感变更，走<b>二次认证</b>）。</div>' +
    "</div></div>";
}
function idUserDetail(u) {
  var boundRows = (u.bound || []).map(function (t) {
    var tm = ID.terms.filter(function (x) { return x.id === t; })[0]; if (!tm) return "";
    return "<tr><td><b>" + esc(tm.name) + "</b></td><td>" + esc(tm.sn) + "</td><td>" + esc(tm.os) + "</td><td>" + idStTag(tm.st) + "</td><td>" + idStTag(tm.online) + "</td></tr>";
  }).join("");
  var allowRows = (u.allow || []).map(function (t) {
    var tm = ID.terms.filter(function (x) { return x.id === t; })[0]; if (!tm) return "";
    var own = (tm.ownerId ? tm.ownerId === u.id : (tm.owner || "") === u.name);
    return "<tr><td><b>" + esc(tm.name) + "</b></td><td>" + esc(tm.owner) + "</td>" +
      "<td>" + (own ? '<span class="tag t-info">本人归属</span>' : '<span class="tag t-gray">授权使用</span>') + "</td>" +
      "<td>" + idBtn(own ? "unbindOwn" : "unbind", u.id, own ? "解除归属" : "解除授权", "link", ' data-t="' + esc(tm.id) + '"') + "</td></tr>";
  }).join("");
  var toggle = idBtn("userToggle", u.id, idUserToggleLabel(u), "sm");
  return idTitle("用户详情 · " + u.name,
      "账号 <b>" + esc(u.acct) + "</b> · 归属 " + esc(u.org) + " · 角色 " + esc(u.role),
      '<div class="toolbar"><button class="btn" data-idact="userBack">← 返回列表</button>' +
      toggle +
      '<button class="btn" data-idact="userReset">重置密码</button>' +
      '<button class="btn primary" data-idact="userEdit" data-id="' + u.id + '">编辑</button></div>') +
    '<div class="card"><div class="card-h"><h3>基础信息</h3></div><div class="card-b">' +
      '<div class="kv" style="grid-template-columns:150px 1fr 150px 1fr">' +
      idKvLeft("姓名") + idKvVal(esc(u.name)) +
      idKvLeft("账号") + idKvVal(esc(u.acct)) +
      idKvLeft("归属组织") + idKvVal(esc(u.org)) +
      idKvLeft("角色") + idKvVal(esc(u.role)) +
      idKvLeft("账号状态") + idKvVal(idStTag(u.st)) +
      idKvLeft("手机号") + idKvVal(esc(idMaskPhone(u.phone))) +
      idKvLeft("连续登录失败") + idKvVal((u.fail || 0) + " 次" + (u.st === "已锁定" ? ' <span class="mini muted">（达阈值已自动锁定，须管理员解锁）</span>' : "")) +
      "</div>" +
      '<div class="mini" style="margin-top:8px">手机号用于<b>首次登录的短信验证</b>与<b>账号找回</b>；列表与详情等<b>只读展示面只显示掩码</b>，完整号码可在「编辑」中查看与修改。</div>' +
      "</div></div>" +
    '<div class="card"><div class="card-h"><h3>名下终端<span class="sub">该用户<b>归属</b>的终端（终端侧同一份数据）</span></h3>' +
      '<div class="toolbar"><button class="btn" data-idact="bindTerm" data-id="' + u.id + '">绑定终端</button></div></div>' +
      '<div class="card-b">' + idTbl(["终端名称", "硬件序列号", "操作系统", "终端状态", "在线状态"],
        boundRows || idEmptyRow(5, "该用户名下暂无终端"), [null, "180px", "170px", "100px", "100px"]) + "</div></div>" +
    '<div class="card"><div class="card-h"><h3>有权使用的终端<span class="sub">含本人归属与经授权的终端</span></h3></div>' +
      '<div class="card-b">' + idTbl(["终端名称", "归属用户", "权限来源", "操作"],
        allowRows || idEmptyRow(4, "暂无有权使用的终端"), [null, "110px", "130px", "120px"]) +
        '<div class="mini" style="margin-top:8px">归属与授权是<b>同一张关系表</b>的两个字段：<b>解除归属</b>会同时取消归属与使用权限；<b>解除授权</b>只取消使用权限，归属不变。两处在「终端详情 · 绑定信息」同样可改，改任一处另一处同步。</div>' +
      "</div></div>";
}

/* ---------- 3. 页② 终端管理（pg-idterm）三层下钻 ---------- */
/* ★ R20：`online` / `regFrom` / `regTo` 为手册 §4.4.2「按状态、**在线状态、注册时间范围**筛选」的载体。 */
var IDT = { f: { k: "", org: "", st: "", online: "", regFrom: "", regTo: "" }, pg: 1, cur: "", inst: "", tab: "t1" };

function idTermFiltered() {
  var f = IDT.f;
  return ID.terms.filter(function (t) {
    /* ★ R20：手册 §4.4.2「搜索筛选：支持按**终端 ID、硬件指纹**搜索，按状态、在线状态、
       注册时间范围筛选」。此前搜索域只有 名称 / 序列号 / 归属人 / 操作系统 —— **终端 ID 未入搜索域**
       （列表第一列就在展示它），MAC 同属设备标识却搜不到；「在线状态」「注册时间范围」两项筛选整项缺失。
       ⚠ 「硬件指纹」在本产品的承载即**硬件序列号 + MAC**（认证侧 `AU.issue[].fp` 记的也正是终端序列号），
       故两者一并纳入搜索域，不另造第三个设备标识字段。 */
    if (f.k && (t.name + t.id + t.sn + t.mac + t.owner + " " + (t.os || "")).toLowerCase().indexOf(f.k.toLowerCase()) < 0) return false;
    if (f.org && t.org !== f.org) return false;
    if (f.st && t.st !== f.st) return false;
    if (f.online && t.online !== f.online) return false;
    /* 注册时间按**日期**比较（`reg` 为「YYYY-MM-DD HH:mm」）—— 取前 10 位，避免时分参与区间判定。 */
    var rg = String(t.reg || "").slice(0, 10);
    if (f.regFrom && (!rg || rg < f.regFrom)) return false;
    if (f.regTo && (!rg || rg > f.regTo)) return false;
    return true;
  });
}
function idPendingApps() { return (ID.apps || []).filter(function (x) { return x.st === "待审核"; }); }
function idTermPage() {
  if (IDT.inst) {
    var ci = ID.cin.filter(function (x) { return x.id === IDT.inst; })[0];
    if (ci) return idTermInstDetail(ci);
  }
  if (IDT.cur) { var t = ID.terms.filter(function (x) { return x.id === IDT.cur; })[0]; if (t) return idTermDetail(t); }
  var rows = idTermFiltered();
  var size = LIST_PAGE, pg = Math.max(1, Math.min(IDT.pg, Math.ceil(rows.length / size) || 1));
  IDT.pg = pg;
  var slice = rows.slice((pg - 1) * size, pg * size);
  var orgs = []; ID.terms.forEach(function (t) { if (orgs.indexOf(t.org) < 0) orgs.push(t.org); });
  var body = slice.map(function (t) {
    /* ★ R53（存-1）：列口径＝**在用实例**（终态不计）—— 与 idSwVerUseCount / idTermCliVer /
       DP 行为基线的主体口径一致。终态实例（已卸载 / 已终止）由详情页「含已终止（供追溯）」承载，
       不再让「一个都没在用」的终端/软件在规模列上虚高。 */
    var nci = ID.cin.filter(function (c) { return c.term === t.id && c.st !== "已卸载"; }).length;
    var nai = ID.ain.filter(function (a) { return a.term === t.id && a.st !== "已终止"; }).length;
    return "<tr><td><b>" + esc(t.name) + '</b><div class="mini muted">' + esc(t.id) + "</div></td>" +
      '<td><span class="kr">' + esc(t.sn) + "</span>" +
        '<div class="mini muted" style="font-family:ui-monospace,Consolas,monospace">' + esc(t.mac || "—") + "</div></td>" +
      "<td>" + esc(t.os) + "</td>" +
      "<td>" + esc(t.owner) + "</td>" +
      "<td>" + idStTag(t.st) + "</td>" +
      "<td>" + idStTag(t.online) + "</td>" +
      '<td class="cell-cov">客户端实例 <b>' + nci + "</b> · 智能体实例 <b>" + nai + "</b></td>" +
      "<td>" + idBtn("termView", t.id, "详情", "sm") + idBtn("termEdit", t.id, "编辑") + "</td></tr>";
  }).join("");
  var pend = idPendingApps().length;
  return idTitle("终端管理", "终端设备登记 · 终端是<b>实例的宿主</b>，同时串联「客户端实例」与「智能体实例」两条线",
      '<div class="toolbar"><button class="btn" data-idact="termApply">注册申请审核' + (pend ? "（" + pend + "）" : "") + "</button>" +
      '<button class="btn primary" data-idact="termNew">新增终端</button></div>') +
    idScopeNote("注册审核对象是<b>安装在终端上的客户端实例</b>：一台终端可安装多个实例，<b>每个实例均需独立注册与审核</b>。该系统部署中注册的首个实例由系统管理员在 <b>WEB 通道</b>审核，后续实例在<b>客户端</b>审核。") +
    '<div class="card"><div class="card-b">' +
    '<div class="toolbar" style="margin-bottom:12px">' +
      '<div class="input-w"><input type="search" id="idtK" aria-label="搜索终端" placeholder="搜索终端名称 / ID / 序列号 / MAC / 归属人 / 操作系统" style="width:300px" value="' + esc(IDT.f.k) + '"><i aria-hidden="true">搜索</i></div>' +
      '<select id="idtOrg" aria-label="按归属组织筛选"><option value="">全部组织</option>' + orgs.map(function (o) { return "<option" + (IDT.f.org === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" +
      '<select id="idtSt" aria-label="按终端状态筛选"><option value="">全部状态</option>' + ["未激活", "已激活", "已禁用", "已注销"].map(function (o) { return "<option" + (IDT.f.st === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" +
      '<select id="idtOn" aria-label="按在线状态筛选"><option value="">全部在线状态</option>' + ["在线", "离线"].map(function (o) { return "<option" + (IDT.f.online === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" +
      '<label class="mini" style="display:flex;align-items:center;gap:6px;white-space:nowrap">注册时间<input type="date" id="idtFrom" aria-label="注册时间起" style="width:132px" value="' + esc(IDT.f.regFrom) + '">～<input type="date" id="idtTo" aria-label="注册时间止" style="width:132px" value="' + esc(IDT.f.regTo) + '"></label>' +
    "</div>" +
    idTbl(["终端名称 / ID", "硬件序列号 / MAC", "操作系统", "归属用户", "终端状态", "在线状态", "在用实例", "操作"],
      body || idEmptyRowF(8, "暂无终端", "无匹配终端", !!(IDT.f.k || IDT.f.org || IDT.f.st || IDT.f.online || IDT.f.regFrom || IDT.f.regTo), "idClearFTerm"),
      /* R19（实测）：终端名称/ID 需 235px（原 234px，差 1px 即折行）、操作系统需 164px（原 150px）。
         ⚠ 终端名称/ID 是**自动列**（两行结构：名称 + ID），须留 ≥5px 余量 —— 差 1px 就会被压成三行。 */
      [null, "164px", "170px", "84px", "90px", "90px", "194px", "114px"]) +
    '<div class="lst-foot"><div id="idtPager" role="navigation" aria-label="终端列表分页" style="flex:1"></div></div>' +
    '<div class="mini" style="margin-top:8px">终端被禁用后<b>无法登录、在线用户强制下线</b>（适用设备丢失或离职）；注销后需<b>重新注册</b>才能使用（适用设备更换或重装系统）。<b>设备指纹与 MAC 由客户端在注册时上报</b>，此处录入的是台账信息。</div>' +
    "</div></div>";
}
/* 使用记录：由终端与归属用户**派生**（时间基准取 ID_NOW，不写字面量时刻）。
   此前本表只有「注册」一条 —— 标题写「使用记录」却只有注册痕迹，业务上下文不完备。 */
function idTermLogRows(t, owner) {
  var acct = (owner && owner.acct) || t.owner || "—";
  var ip = idTermIp(t.id);
  /* 访问对象由该终端已装客户端实例的软件**授权资产**派生（去重；无实例 / 无资产时退化为
     通用兜底）——各终端软件构成不同 ⇒ 使用记录互不相同，不再是全终端同一份字面量。 */
  var assets = [];
  (ID.cin || []).forEach(function (c) {
    /* ★ R53（B-F3）：与「在用」口径对齐 —— 已卸载实例不参与授权资产派生（同 idSwVerUseCount /
       idTermCliVer / DP 行为基线的主体口径）；否则「一个在用实例都没有」的终端仍显示访问轨迹
       （含写死的「登录失败（证书过期）」），等于为无在用实例的终端伪造访问。 */
    if (c.term !== t.id || c.st === "已卸载") return;
    (idSwOf(c.sw).assets || []).forEach(function (a) { if (assets.indexOf(a) < 0) assets.push(a); });
  });
  /* ★ R20：**无在用实例即无授权资产 ⇒ 无访问可言**。此前兜底成 `["统一门户","办公自动化平台"]`，
     于是「一个客户端实例都没装」的终端（如数据管理部-审计终端）也显示访问轨迹，甚至带一条
     「登录失败（证书过期）」—— 把「没采集到」写成了「有访问」。空集就是空集，直接返回空态行的
     内容（与 verlog「不伪造历史」同一条纪律）。 */
  if (!assets.length) return '<tr><td colspan="4" class="cell-dim">该终端暂无在用客户端实例，未产生访问记录</td></tr>';
  var what = function (i) { return "访问" + assets[i % assets.length]; };
  /* 记录时间不得早于终端注册时间：新建 / 审核通过的新终端 reg=ID_NOW，而位移基准取 ID_NOW
     ⇒ 会出现「注册前已有使用记录」（09:10 早于 09:14）。按 reg 取下界夹取。 */
  var rg0 = t.reg || "";
  /* 注册前不可能有使用记录：位移早于 reg 的记录直接剔除（新终端刚注册 ⇒ 仅剩注册历史）。 */
  return [
    { ts: idShift(ID_NOW, -4), what: what(0) },
    { ts: idShift(ID_NOW, -950), what: what(1) },
    { ts: idShift(ID_NOW, -2920), ok: "失败", what: "登录失败（证书过期）" }
  ].filter(function (r) { return !rg0 || r.ts >= rg0; }).map(function (r) {
    return "<tr><td>" + esc(r.ts) + "</td><td>" + esc(acct) + '</td><td><span class="kr">' + ip + "</span></td>" +
      "<td>" + idStTag(r.ok || "成功") + '<div class="mini muted">' + esc(r.what) + "</div></td></tr>";
  }).join("");
}
/* 注册历史：由**注册申请台账**派生（按 term / sn 匹配，含审核结果与拒绝原因）；
   无申请记录的存量终端退化为字面行（早期接入、先于台账）。写死「审核 通过」会与
   台账中的「已拒绝」同页矛盾（实测 ap_004 ↔ t_pc_0021）。 */
function idTermRegRows(t) {
  /* 注册历史只记**已决**申请（已通过 / 已拒绝）—— 待审核申请尚未成立、不作为注册历史展示，
     否则「审核中」与「已在册」同页打架（实测 t_nb_0031 混入待审 ap_002）。 */
  var apps = (ID.apps || []).filter(function (a) { return (a.term === t.id || a.sn === t.sn) && a.st !== "待审核"; });
  if (!apps.length) {
    /* ★ R20：**不得伪造审核结论** —— 无申请记录的终端是「接入早于审核台账建立」，不是「审核已通过」。
       写死「已通过」等于把「未留档」写成「留档且通过」，与 §4.4.1「历次审核记录均可追溯」相悖；
       也与本函数上方注释自述的「写死审核结论会与台账同页矛盾」自相打架。 */
    return '<tr><td colspan="4" class="cell-dim">注册历史：申请人 ' + esc(t.owner) + " · 方式 " + esc(t.regway) + " · <b>审核记录未留档</b>（接入早于审核台账建立）</td></tr>";
  }
  return apps.map(function (a) {
    /* 结论直接取状态值（已通过 / 已拒绝）：此前把「已通过」改写成「通过」，
       与审核弹窗经 idStTag 显示的「已通过」同页两词。 */
    var verdict = a.st;
    if (a.st === "已拒绝" && a.reason) verdict += "（" + a.reason + "）";
    return '<tr><td colspan="4" class="cell-dim">注册历史：申请人 ' + esc(a.owner) +
      " · 原因 新设备接入 · 方式 " + esc(a.way) + " · 审核 " + esc(verdict) +
      (a.at ? " · 申请时间 " + esc(a.at) : "") + "</td></tr>";
  }).join("");
}
/* 终端侧「客户端版本号」（手册 §4.4.2 终端详情字段）—— 由该终端上的客户端实例**派生**，不另存一份：
   一台终端可装多个实例、各自版本不同，故按「软件 版本」枚举；版本仍是**客户端上报值**。 */
function idTermCliVer(t) {
  var cis = (ID.cin || []).filter(function (c) { return c.term === t.id && c.st !== "已卸载"; });
  if (!cis.length) return '<span class="mini muted">—（该终端暂无在用客户端实例）</span>';
  return cis.map(function (c) { return esc(idName(ID.csw, c.sw)) + " " + esc(c.ver || "—"); }).join("、") +
    ' <span class="mini muted">（客户端上报值）</span>';
}
/* 终端「激活时间」（手册 §4.4.2 终端详情字段）—— 按**可追溯来源**逐级派生，不伪造：
   ① 注册审核通过记录的时间（§4.4.1：审核通过 → 生成终端信息 + 签发 License 证书）；
   ② 无审核记录时取该终端上**最早一份 License 证书的签发日期**（同一条业务链的另一端）；
   ③ 仍无则按注册时间；三者皆无则「—」。 */
function idTermActiveAt(t) {
  var a = (ID.apps || []).filter(function (p) { return p.term === t.id && p.st === "已通过"; })[0];
  if (a && a.done) return esc(a.done) + ' <span class="mini muted">（注册审核通过）</span>';
  var lis = [];
  (ID.cin || []).forEach(function (c) {
    if (c.term !== t.id) return;
    (c.lic || []).forEach(function (l) { if (l.issued) lis.push(l.issued); });
  });
  if (lis.length) { lis.sort(); return esc(lis[0]) + ' <span class="mini muted">（按最早签发证书日期）</span>'; }
  if (t.reg) return esc(t.reg) + ' <span class="mini muted">（按注册时间）</span>';
  return '<span class="mini muted">—</span>';
}
function idTermDetail(t) {
  var idtTab = (IDT.tab === "t2" || IDT.tab === "t3") ? IDT.tab : "t1";
  var cis = ID.cin.filter(function (c) { return c.term === t.id; });
  var ais = ID.ain.filter(function (a) { return a.term === t.id; });
  var ciRows = cis.map(function (c) {
    var sw = idSwOf(c.sw);
    return "<tr><td><b>" + esc(sw.name || "—") + "</b>" + (sw.agent ? ' <span class="tag t-info">AI 安全 agent</span>' : "") + "</td>" +
      '<td><span class="kr">' + esc(c.cidseq) + "</span></td>" + "<td>" + idStTag(c.st) + "</td>" + "<td>" + idStTag(c.online) + "</td>" +
      "<td>" + (c.lic || []).length + " 份</td>" +
      "<td>" + idBtn("instLic", c.id, "证书列表") + idBtn("cinGoto", c.id, "去实例管理") + "</td></tr>";
  }).join("");
  var aiRows = ais.map(function (a) {
    return "<tr><td><b>" + esc(idName(ID.asw, a.asw)) + "</b></td>" +
      '<td><span class="kr">' + esc(a.cred ? a.cred.no : "—") + "</span></td>" +
      "<td>" + esc(a.pid) + "</td>" + "<td>" + idStTag(idAgInSt(a)) + "</td>" +
      "<td>" + idBtn("ainGoto", a.asw, "去实例管理", "", ' data-t="' + esc(a.term) + '"') + "</td></tr>";
  }).join("");
  var owner = idUserOf(t);
  var allowU = ID.users.filter(function (u) { return (u.allow || []).indexOf(t.id) >= 0; });
  var allowRows = allowU.map(function (u) {
    var own = (u.bound || []).indexOf(t.id) >= 0;
    return "<tr><td><b>" + esc(u.name) + "</b></td><td>" + esc(u.acct) + "</td><td>" + esc(u.org) + "</td>" +
      "<td>" + (own ? '<span class="tag t-info">本人归属</span>' : '<span class="tag t-gray">授权使用</span>') + "</td>" +
      "<td>" + idBtn(own ? "unbindOwn" : "unbind", u.id, own ? "解除归属" : "解除授权", "link", ' data-t="' + esc(t.id) + '"') + "</td></tr>";
  }).join("");
  var btns = "";
  if (t.st === "已激活") btns += '<button class="btn" data-idact="termDisable" data-id="' + t.id + '">禁用</button>';
  else if (t.st === "已禁用") btns += '<button class="btn" data-idact="termDisable" data-id="' + t.id + '">激活</button>';
  if (t.st !== "已注销") btns += '<button class="btn danger" data-idact="termLogout" data-id="' + t.id + '">注销</button>';
  var stNote = "";
  if (t.st === "未激活") stNote = idScopeNote("该终端<b>尚未完成注册审核</b>：通过「注册申请审核」放行其上的客户端实例后转为<b>已激活</b>。未激活终端<b>不允许提交注册申请</b>，也不参与隧道建立。");
  else if (t.st === "已注销") stNote = idScopeNote("该终端<b>已注销</b>，须<b>重新注册</b>后方可使用；历史使用记录与审核记录仍可追溯。");
  else if (t.st === "已禁用") stNote = idScopeNote("该终端<b>已被禁用</b>：可登录性已被收回，其上的客户端实例<b>不参与隧道建立</b>；激活后即刻恢复。");
  return idTitle("终端详情 · " + t.name,
      "终端 ID <b>" + esc(t.id) + "</b> · 硬件序列号 " + esc(t.sn),
      '<div class="toolbar"><button class="btn" data-idact="termList">← 返回列表</button>' +
      btns +
      '<button class="btn" data-idact="termEdit" data-id="' + t.id + '">编辑</button></div>') +
    stNote +
    idTabBar("idTermTabs", [["t1", "基础信息"], ["t2", "实例"], ["t3", "使用记录"]], idtTab) +
    idTabPane("idTermTabs", "t1", idtTab === "t1",
      '<div class="card"><div class="card-h"><h3>基础信息</h3></div><div class="card-b">' +
      '<div class="kv" style="grid-template-columns:150px 1fr 150px 1fr">' +
      idKvLeft("终端名称") + idKvVal(esc(t.name)) +
      idKvLeft("终端状态") + idKvVal(idStTag(t.st)) +
      idKvLeft("硬件序列号") + idKvVal(esc(t.sn)) +
      idKvLeft("MAC 地址") + idKvVal(esc(t.mac || "—") + ' <span class="mini muted">（客户端注册时上报）</span>') +
      idKvLeft("终端类型") + idKvVal(esc(t.type)) +
      idKvLeft("操作系统") + idKvVal(esc(t.os)) +
      idKvLeft("在线状态") + idKvVal(idStTag(t.online)) +
      idKvLeft("归属用户 / 组织") + idKvVal(esc(t.owner) + " · " + esc(t.org)) +
      idKvLeft("客户端版本号") + idKvVal(idTermCliVer(t)) +
      idKvLeft("激活时间") + idKvVal(idTermActiveAt(t)) +
      idKvLeft("注册方式 / 时间") + idKvVal(esc(t.regway) + " · " + esc(t.reg)) + idKvLeft("备注") + idKvVal(esc(t.note || "—")) +
      "</div></div></div>" +
    '<div class="card"><div class="card-h"><h3>绑定信息<span class="sub">终端是谁的、谁有权使用（与「用户管理」同一份数据）</span></h3>' +
      (t.st === "已注销" ? "" : '<div class="toolbar"><button class="btn" data-idact="termOwn" data-id="' + t.id + '">变更归属用户</button></div>') + "</div>" +
      '<div class="card-b">' +
      '<div class="kv" style="grid-template-columns:150px 1fr;margin-bottom:10px">' + idKvLeft("归属用户") + idKvVal(
        owner ? "<b>" + esc(owner.name) + "</b>（" + esc(owner.acct) + "）　" + idBtn("userGoto", owner.id, "查看用户") : esc(t.owner || "—")) + "</div>" +
      idTbl(["有权使用的用户", "账号", "归属组织", "权限来源", "操作"],
        allowRows || idEmptyRow(5, "暂无有权使用的用户"), [null, "130px", "130px", "130px", "120px"]) +
      '<div class="mini" style="margin-top:8px">绑定关系是<b>一份数据</b>，用户侧与终端侧是<b>两个入口</b>（关系表为唯一权威面，两页均为其视图）——两侧的<b>建立、解除、变更归属</b>结果完全一致。</div>' +
      "</div></div>") +
    idTabPane("idTermTabs", "t2", idtTab === "t2",
      '<div class="card"><div class="card-h"><h3>客户端实例列表<span class="sub">该终端上安装的客户端实例（含已卸载，供追溯）· 下钻可看证书列表</span></h3></div>' +
      '<div class="card-b">' + idTbl(["客户端软件", "客户端序列号", "状态", "在线状态", "License 证书", "操作"],
        ciRows || idEmptyRow(6, "该终端上暂无客户端实例"), [null, "160px", "88px", "92px", "110px", "170px"]) +
        '<div class="mini" style="margin-top:8px">License 证书的<b>实际管理面在「客户端实例管理」页</b>，本页只做<b>串联入口</b>；一个实例下可挂<b>多份</b>证书（轮换过渡期新旧共存）。</div>' +
      "</div></div>" +
    '<div class="card"><div class="card-h"><h3>智能体实例列表<span class="sub">该终端上的智能体实例（含已终止，供追溯）· 改动入口在「智能体实例管理」</span></h3></div>' +
      '<div class="card-b">' + idTbl(["智能体软件", "短时凭据", "进程号", "状态", "操作"],
        aiRows || idEmptyRow(5, "该终端上暂无智能体实例"), [null, "180px", "80px", "92px", "140px"]) + "</div></div>") +
    idTabPane("idTermTabs", "t3", idtTab === "t3",
      '<div class="card"><div class="card-h"><h3>使用记录 / 注册历史</h3></div><div class="card-b">' +
      idTbl(["时间", "用户账号", "IP", "结果"], idTermLogRows(t, owner) + idTermRegRows(t), [null, "150px", "150px", "170px"]) +
      '<div class="mini" style="margin-top:8px">使用记录为<b>最近若干次</b>访问痕迹（时间 / 账号 / 来源 IP / 结果），IP 由终端<b>确定性派生</b>，同一终端恒为同一私网地址；完整访问明细见<b>审计</b>。</div>' +
      "</div></div>");
}
function idTermInstDetail(ci) {
  var sw = idSwOf(ci.sw);
  var licRows = (ci.lic || []).map(function (l) {
    var tg = idLicTagOf(l);
    var dead = ci.st === "已卸载" && (tg === "当前" || tg === "待生效");
    return "<tr><td>" + idStTag(tg) + (dead ? ' <span class="mini muted">实例已卸载·不生效</span>' : "") + "</td><td><b>" + esc(l.no) + "</b></td>" +
      '<td><span class="kr">' + esc(l.ca) + "</span></td>" +
      "<td>" + esc(l.issued) + "</td><td>" + esc(l.exp) + "</td>" +
      '<td class="cell-cov">' + esc(l.scope) + "</td></tr>";
  }).join("");
  return idTitle("证书列表 · " + (sw.name || "") + " 实例",
      "客户端序列号 <b>" + esc(ci.cidseq) + "</b> · 所在终端 " + esc(idName(ID.terms, ci.term, "id", "name")),
      '<div class="toolbar"><button class="btn" data-idact="termBack" data-id="' + ci.term + '">← 返回终端详情</button>' +
      '<button class="btn primary" data-idact="licGoto" data-id="' + ci.id + '">去「客户端实例管理」维护</button></div>') +
    idRefNote("License 证书属<b>客户端实例</b>层级 ⇒ 看与改<b>都在「客户端实例管理」</b>，本页（终端侧）只做<b>串联展示</b>。") +
    '<div class="card"><div class="card-h"><h3>License 证书<span class="sub">一个实例下可挂多份（轮换过渡期新旧共存）</span></h3></div>' +
      '<div class="card-b">' + idTbl(["阶段", "证书编号", "签发 CA", "生效日期", "有效期至", "授权范围"],
        licRows || idEmptyRow(6, "该实例暂无证书"), ["92px", "170px", "140px", "110px", "110px", null]) +
      '<div class="mini" style="margin-top:8px">License 证书是<b>平台自定义封装的 License 容器</b>（非 X.509 证书），内封<b>授权信息</b>（客户端序列号 / 终端序列号 / 授权范围 / 有效期）与建立 TLCP 隧道所需的 <b>CA 证书链</b>；<b>只含公钥、不含私钥</b>。阶段按<b>有效期自动推导</b>（当前 / 待生效 / 已过期），吊销为显式状态。</div>' +
      "</div></div>";
}

/* ---------- 3.1 注册申请审核（终端管理的入口，通过后建终端 + 建实例 + 签发证书） ---------- */
function idApplyRow(p) {
  var acts = p.st === "待审核"
    ? '<button class="btn sm" data-ap="ok" data-id="' + p.id + '">通过</button><button class="btn link" data-ap="no" data-id="' + p.id + '">拒绝</button>'
    : '<span class="mini muted">已处理</span>';
  var result = idStTag(p.st) + (p.reason ? '<div class="mini muted">' + esc(p.reason) + "</div>" : "") +
    (p.done ? '<div class="mini muted">' + esc(p.done) + (p.reviewer ? " · " + esc(p.reviewer) : "") + "</div>" : "");
  return "<tr><td><b>" + esc(p.name) + '</b><div class="mini muted">' + esc(p.sn) + " · " + (p.term ? "已有终端" : "新建终端") + "</div>" +
      '<div class="mini muted">' + esc(p.way) + " · 提交 " + esc(p.at) + "</div></td>" +
    '<td><span class="kr">' + esc(p.cidseq) + "</span></td>" +
    "<td>" + esc(idName(ID.csw, p.sw)) + "</td>" +
    "<td>" + esc(p.owner || "—") + "</td>" +
    "<td>" + result + "</td>" +
    "<td>" + acts + "</td></tr>";
}
function idOpenApply() {
  var list = ID.apps || [];
  var pend = idPendingApps().length;
  openDlg("注册申请审核",
    "审核对象是<b>安装在终端上的客户端实例</b> —— 一台终端可安装多个实例，<b>每个实例均需独立注册与审核</b>。通过后系统<b>自动生成并下发 License 证书</b>；配置了<b>自动审核</b>的申请无人工介入（通过后消息通知管理员）。",
    idTbl(["终端名称 / 序列号", "客户端序列号", "客户端软件", "归属用户", "审核结果", "操作"],
      list.length ? list.map(idApplyRow).join("") : idEmptyRow(6, "暂无注册申请"),
      [null, "145px", "115px", "70px", "155px", "120px"],
      /* 页内列表的 .lst 带 min-width:1160px（横向可滚），弹窗内容宽仅 840px ——
         不解除该下限，表格会整块溢出弹窗、右侧列被裁掉。 */
      ' style="min-width:0"') +
    '<div class="mini" style="margin-top:8px">当前待审 <b>' + pend + "</b> 条。历次审核记录（审核人 / 时间 / 结果 / 备注）<b>均可追溯</b>；<b>拒绝须填写原因</b>，用户可调整后重新提交。<b>终端未激活 / 已禁用 / 已注销，或归属用户账号已禁用 / 已锁定时，不允许提交注册申请。</b></div>",
    "xl");
  var body = document.getElementById("dlg1Body");
  if (body) body.onclick = idApplyClick;
}
function idApplyClick(e) {
  var b = e.target && e.target.closest ? e.target.closest("[data-ap]") : null;
  if (!b) return;
  var p = (ID.apps || []).filter(function (x) { return x.id === b.getAttribute("data-id"); })[0];
  if (!p || p.st !== "待审核") return;
  if (b.getAttribute("data-ap") === "ok") idApplyPass(p); else idApplyReject(p);
}
function idApplyPass(p) {
  var sw = idSwOf(p.sw);
  var owner = idUserByName(p.owner);
  var tid = p.term;
  /* ★ R20：补**归属账号**侧校验 —— 手册 §2.2「账号校验规则」三行表：账号不存在 ⇒ 拒绝注册；
     账号存在但被禁用或锁定 ⇒ 拒绝注册（在线 / 离线均拒绝）；§4.4.1 同义（「用户账号被禁用 /
     封禁时不允许提交注册申请」）。本页页脚（`idOpenApply`）也自述了该规则，但**此前只实现了
     终端侧校验、账号侧一行未落** ⇒ 对已禁用 / 已锁定的账号点「通过」，仍会凭空建出终端 + 实例
     + 证书，并把归属绑到一个不能再登录的账号上（关系表出现「幽灵归属」）。 */
  if (p.owner) {
    if (!owner) { toast("申请人账号「" + p.owner + "」不存在，不可通过（手册 §2.2：账号不存在 ⇒ 拒绝注册）"); return; }
    if (owner.st !== "已启用") { toast("申请人账号「" + owner.name + "」当前为「" + owner.st + "」，不可通过（手册 §2.2：被禁用或锁定 ⇒ 拒绝注册）"); return; }
  }
  /* ★ R20：客户端序列号全局唯一（手册 §4.6.1「每个客户端有全局唯一的序列号」）——
     `cinNew` 已查重，审核通过路径未查 ⇒ 同一 cidseq 可出现两条实例，
     之后按序列号定位 / 吊销证书会命中错行。两入口判据对齐。 */
  if (p.cidseq && (ID.cin || []).some(function (x) { return x.cidseq === p.cidseq; })) {
    toast("客户端序列号 " + p.cidseq + " 已存在（序列号全局唯一），不可重复通过"); return;
  }
  /* 存量终端（p.term 非空）：通过审核须校验目标终端状态 —— 与「未激活终端不允许提交申请」口径对称。
     已注销须重新注册、已禁用须先激活；未激活则通过即转「已激活」（与终端详情状态说明一致）。 */
  if (tid) {
    var tgt0 = ID.terms.filter(function (x) { return x.id === tid; })[0];
    if (!tgt0) { toast("目标终端不存在，无法通过该申请"); return; }
    if (tgt0.st === "已注销") { toast("该终端已注销，须重新注册为新终端后方可通过"); return; }
    if (tgt0.st === "已禁用") { toast("该终端已禁用，请先在终端详情激活后再通过其注册申请"); return; }
    if (tgt0.st === "未激活") tgt0.st = "已激活";
  }
  if (!tid) {
    /* ★ R53（存-5）：与「新增终端」入口（termNew）对齐 —— 硬件序列号全局唯一，审核通过路径
       此前不查重（判据不对称）。演示种子不可触发，但对称性须补齐，否则可建出同 sn 的终端。 */
    if (p.sn && ID.terms.some(function (x) { return x.sn === p.sn; })) {
      toast("该硬件序列号已登记（" + p.sn + "），不可重复通过"); return;
    }
    tid = "t_" + Date.now();
    ID.terms.unshift({
      id: tid, name: p.name, sn: p.sn, os: p.os || "—", type: p.type || "桌面终端",
      owner: p.owner, ownerId: owner ? owner.id : "", org: p.org || "—",
      st: "已激活", online: "在线", reg: ID_NOW, regway: p.way, mac: "", fp: ""
    });
  }
  /* 绑定关系写关系表：审核通过即建立归属，避免「终端建好了、用户侧看不见」。
     目标终端若已有归属用户，一并收回后再建立 —— 否则用户侧会出现「一台终端两个归属用户」。 */
  var tgtTerm = ID.terms.filter(function (x) { return x.id === tid; })[0];
  if (owner) {
    var prevOwn = idUserOf(tgtTerm || {});
    if (prevOwn && prevOwn.id !== owner.id) idBindWrite(prevOwn, tid, true);
    idBindWrite(owner, tid);
    if (tgtTerm) { tgtTerm.ownerId = owner.id; tgtTerm.owner = owner.name; }
  }
  ID.cin.unshift({
    id: "ci_" + Date.now(), sw: p.sw, term: tid, cidseq: p.cidseq, st: "已激活", online: "在线",
    /* 实例版本不再取「软件级首个版本」，而取**该终端操作系统**下已发布的最新版本 ——
       否则同一软件在 macOS 终端上会装出 Windows 侧的版本号（跨端矛盾）。
       ★ R20：判据提为共享助手 `idCinNewVer`，与「管理员直接登记」入口同源（此前两处各写一遍）。 */
    ver: idCinNewVer(sw, tgtTerm),
    lic: [{ id: "lic_" + Date.now(), no: idLicNo(), issued: idDay(), exp: idYmdShift(idDay(), 0, 1), tag: "当前",
      ca: sw.cert === "CA 机构签发" ? "外购 CA（CFCA）" : "白泽内网 CA", scope: (sw.assets || []).join(" / ") || "—" }]
  });
  /* ★ R53（B-F1）：本路径是**第四条签发路径**（注册审核通过即自动签发首份 License 证书）——
     另三条（cinNew / cinNewLic / licRotate）均已回写认证侧「签发凭据管理」，唯此漏 ⇒
     「身份侧有证书、认证侧查无」，按编号吊销 / 追溯会落空。此处比照 cinNew 补齐。 */
  idRegisterAuthLic(ID.cin[0], (ID.cin[0].lic || [])[0]);
  p.term = tid; p.st = "已通过"; p.done = ID_NOW; p.reviewer = "张伟";
  idSave();
  /* ★ R53（B-F5）：**先复位分页再渲染**（与 termNew 同体例）—— 审核通过会在表首 unshift 新终端
     + 新实例，原实现在 idRerender() 之后才置 pg=1 ⇒ 当次渲染仍用旧页码，管理员停在第 N 页点通过时
     看不见新建条目。 */
  IDT.pg = 1; IDC.pg = 1;
  closeDlg(); idRerender();
  toast("已通过：终端与客户端实例已登记，License 证书已签发（演示）");
  /* ★ R21（I6）：与「拒绝」路径对称 —— 后者收尾 `idOpenApply()` 重开审核队列，
     前者此前只 `closeDlg()`。批量审核时「拒绝完能接着审、通过完要重新开窗」，一正一反两套节奏。 */
  idOpenApply();
}
function idApplyReject(p) {
  openDlg("拒绝注册申请",
    "拒绝 <b>" + esc(p.owner || "") + "</b> 的注册申请（" + esc(p.name) + "）。<b>须填写拒绝原因</b>；用户可调整后重新提交，历次审核记录可追溯。",
    '<div class="fld"><label>拒绝原因 <span class="req">*</span></label><input id="aprReason" placeholder="如 设备未通过合规基线检查"></div>');
  $("#dlg1Ok").onclick = function () {
    var rs = ($("#aprReason").value || "").trim();
    if (!rs) { markBad($("#aprReason"), true); toast("请填写拒绝原因"); return; }
    p.st = "已拒绝"; p.reason = rs; p.done = ID_NOW; p.reviewer = "张伟";
    idSave(); closeDlg(); idRerender(); idOpenApply();
    toast("已拒绝（演示）");
  };
}

/* ---------- 4. 页③ 客户端软件管理（pg-idcsw） ---------- */
var IDS = { cur: "", tab: "t1", pg: 1, f: { k: "", agent: "", os: "" } };
/* 客户端软件登记的「支持认证方式」—— 名字与档位一律**取自认证方式字典**（唯一取值域），
   本页只做子集勾选，不新增方式名；**字典 ∩ 客户端软件登记 = 该客户端实际可选的方式**。
   ⚠ 「无感代填」由**平台自身**完成（会话身份 + 托管凭据代填 / 出站 token 注入），
     **不依赖任何客户端软件的承载能力**，故不在本登记范围内。
   ⚠ 本清单**不带级别字段** —— 强度级别挂在「认证源 × 认证方式」上；
     本页（客户端软件）只回答「某方式能否在该客户端上用」，标级别会越权表述效力。
   ⚠ L4 / L5 的实现口径是 WebAuthn（FIDO2）—— WebAuthn 是**承载协议**，不是方式名，
     故不在本清单内；「这款软件能否承载 WebAuthn」由所选 L4 / L5 方式间接体现。 */
/* ★ R53（E-F7）：由装载期**一次性快照**改为**调用时现算** —— 快照版在 `bootstrap → loadDemoState`
   之前求值，字典（认证方式）此后新增即永不进候选；与 ID_ASSET_DEF 同一病因。 */
function ID_AMETH_DEF() {
  return (typeof AU_SRC_METHODS !== "undefined" ? AU_SRC_METHODS : []).filter(function (m) { return m.interactive; }).map(function (m) {
    return { k: m.id, name: m.name, note: m.inherent };
  });
}
function idSWName(k) { var L = ID_AMETH_DEF(); for (var i = 0; i < L.length; i++) if (L[i].k === k) return L[i].name; return k; }
/* 可访问资产的可选项来源 = 管理员维护的「资产列表」（只读引用，见手册 §4.6.6：资产数据来源＝资产列表）。
   客户端软件管理只做**子集勾选**，限定的是**客户端侧可见范围**；
   用户最终能否访问某个资产，还取决于该资产自身的**访问策略**（本页不承载策略裁决）。 */
/* 取值域＝资产台账（权威源）的资产名集合，**由台账派生**，不另立一套命名；
   台账未就绪（脚本段未加载）时回落到与其一致的静态清单。 */
/* ★ R53（E-F7）：由装载期**一次性快照**改为**调用时现算**（`ID_ASSET_DEF()`）—— 快照版在
   `bootstrap → loadDemoState` 之前求值，刷新后取的是**种子集**而非 localStorage 备份集；且此后
   新登记的资产永不进候选（交付说明 §4.2 要求「候选 = 资产列表全集的只读引用」；DP `dpCatalog()` /
   代填托管 `ASSETS.forEach` 均为调用时现算）。函数声明提升，装载期调用亦安全。 */
function ID_ASSET_DEF() {
  try { if (typeof ASSETS !== "undefined" && ASSETS && ASSETS.length) return ASSETS.map(function (a) { return a.name; }); }
  catch (e) { /* 资产段不可用：回落静态清单 */ }
  return ["核心网银门户", "信贷审批系统", "客户数据仓库", "报表中心", "统一身份门户",
    "监管报送接口", "运维审计堡垒机", "对公客户影像库", "手机银行后台", "报表导出网关",
    "生产区运维桌面", "行情推送 TCP 通道", "反洗钱报送门户", "对公网银体验门户",
    "对外行情资讯门户", "运维堡垒机 Web 控制台"];
}
/* 适用操作系统的取值域 —— 与「终端」的 os 字段**不同层级**：
   终端 os 是具体版本（Windows 11 专业版 / macOS 14.5），此处取**操作系统族**，
   用于把「同一款客户端的版本与校验码」按族分列（手册 §4.6.5：版本签名校验按客户端版本发布）。
   同一款软件在不同操作系统上的**版本号与校验码各自独立**（构建产物不同），不共用一行登记。 */
var ID_OS_DEF = ["Windows", "macOS", "Linux", "Android", "iOS", "HarmonyOS"];
/* 签名取值域 —— 与「版本签名校验」策略配套：策略含「客户端签名校验」时，签名不得为「未签名」。 */
var ID_SIG_DEF = ["已签名 · 白泽代码签名 CA（RSA-2048）", "已签名 · 白泽代码签名 CA（SM2）",
  "已签名 · 外购 CA（CFCA）", "未签名"];
function idOsFamily(os) {
  var s = String(os || "");
  if (/windows/i.test(s)) return "Windows";
  if (/mac\s*os|macos|osx|darwin/i.test(s)) return "macOS";
  if (/android/i.test(s)) return "Android";
  if (/harmony|鸿蒙/i.test(s)) return "HarmonyOS";
  if (/ios|iphone|ipad/i.test(s)) return "iOS";
  if (/linux|kylin|麒麟|统信|uos/i.test(s)) return "Linux";
  return "";
}
function idVerCmp(a, b) {
  var x = String(a || "").split("."), y = String(b || "").split(".");
  var n = Math.max(x.length, y.length);
  for (var i = 0; i < n; i++) {
    var u = parseInt(x[i] || "0", 10) || 0, v = parseInt(y[i] || "0", 10) || 0;
    if (u !== v) return u - v;
  }
  return 0;
}
/* 软件级版本列表 —— **由 osver 派生**（单一来源）。
   此前 csw 另存一份 `ver` 数组，与 osver 必然出现「改了 osver、ver 没改」的漂移；
   本次统一为派生：无 osver 的老快照（pre-id-7）退回软件级 ver，页面显示「—」。 */
function idSwVers(s) {
  if (s && Array.isArray(s.osver) && s.osver.length) {
    var seen = {}, out = [];
    s.osver.forEach(function (r) { if (!seen[r.ver]) { seen[r.ver] = 1; out.push(r.ver); } });
    out.sort(function (a, b) { return idVerCmp(b, a); });
    return out;
  }
  return (s && Array.isArray(s.ver)) ? s.ver : [];
}
/* 新实例的初始版本 = **该终端操作系统下已发布的最新版本**（R20）。
   此前 `case "cinNew"` 取 `idSwOf(sid).ver[0]` —— `ver` 是 pre-id-7 的**软件级死字段**
   （R15 已统一为「从 osver 派生」），新种子快照里根本没有 ⇒ 恒落占位 `"1.0.0"`，
   于是**管理员刚登记的实例一建即显示「可升级至 3.2.1」**；且与「注册审核通过」的派生
   口径不一致（同一字段两处判据）。⇒ 提为单一实现，两个入口共用。
   兜底也不再用 `"1.0.0"` 伪造：退而取该软件任一**已发布**最高版；一个都没有时记 `"—"`
   （尚未登记可用版本），由展示层兜底 —— 与「凭据编号缺失不落 `—`」相反，此处 `—` 表示
   「软件确实还没有任何已发布版本」，是**事实**而非缺省符。 */
function idCinNewVer(sw, term) {
  var fam = idOsFamily((term || {}).os);
  var pubs = ((sw || {}).osver || []).filter(function (r) { return r.pub; })
    .sort(function (a, b) { return idVerCmp(b.ver, a.ver); });
  var same = pubs.filter(function (r) { return r.os === fam; })[0];
  if (same) return same.ver;
  return pubs.length ? pubs[0].ver : "—";
}
/* 该实例是否已有「待生效」证书 —— 单一判据，供「轮换」与「签发证书」两个入口共用。
   此前只有轮换侧判重（`licRotate`），签发侧只挡「已有当前证书」⇒ 可连开多份待生效证书，
   与「轮换过渡期新旧证书并存（＝最多一份待生效）」的页内自述冲突。 */
function idLicPending(c) {
  return ((c || {}).lic || []).filter(function (l) { return idLicTagOf(l) === "待生效"; })[0] || null;
}
/* 适用操作系统列表（按 ID_OS_DEF 序去重）—— 列表页「适用操作系统」列与筛选共用。 */
function idSwOsList(s) {
  var hit = {};
  (s && Array.isArray(s.osver) ? s.osver : []).forEach(function (r) { hit[r.os] = 1; });
  return ID_OS_DEF.filter(function (o) { return hit[o]; });
}
/* 某操作系统 × 版本的**在用实例数**（st ≠ 已卸载）—— 取消发布的拦截依据（手册 §4.7.5）。
   实例的操作系统由**所在终端**派生，不另存一份 —— 否则同一事实两个出口。 */
/* ★ 2026-10-12（R57 · 表-8）：平台组织树 ORG_TREE 是**组织名的单一真源** —— 身份台账的
   「归属组织」与策略侧 `user.org` 的组织树、资产登记面的「所属部门」同源，不再各写一套名册。
   原为自由文本 ⇒ 手输的组织名立刻成为台账里的新组织，策略侧组织树却查无此组织。
   组织树不可用时回落自由文本输入（不阻断登记）。 */
function idOrgNames() {
  try {
    if (typeof ORG_TREE !== "undefined" && ORG_TREE[0] && ORG_TREE[0].kids) {
      return ORG_TREE[0].kids.map(function (n) { return n.name; });
    }
  } catch (e) { /* 组织树不可用 */ }
  return [];
}
/* emptyLabel 非空时给出可清空的空选项（用户台账允许「未分配组织」）。
   存量值不在组织树内 ⇒ 动态补一项并选中（保留原值，不静默回落）。 */
function idOrgSelect(id, cur, emptyLabel) {
  var names = idOrgNames(), v = String(cur || "");
  if (!names.length) { return '<input id="' + id + '" value="' + esc(v) + '" maxlength="64" placeholder="如 信贷管理部">'; }
  var html = emptyLabel ? '<option value="">' + esc(emptyLabel) + "</option>" : "";
  html += names.map(function (n) { return '<option value="' + esc(n) + '"' + (n === v ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("");
  if (v && names.indexOf(v) < 0) { html += '<option value="' + esc(v) + '" selected>' + esc(v) + "</option>"; }
  return '<select id="' + id + '">' + html + "</select>";
}
function idSwVerUseCount(s, os, ver) {
  return (ID.cin || []).filter(function (c) {
    if (c.sw !== s.id || c.st === "已卸载") return false;
    var tm = (ID.terms || []).filter(function (t) { return t.id === c.term; })[0] || {};
    return idOsFamily(tm.os) === os && c.ver === ver;
  }).length;
}
function idShaFmt(h) { return h ? (h.length > 16 ? h.slice(0, 8) + "…" + h.slice(-4) : h) : "—"; }
/* 版本行式编辑器（编辑 / 新建弹窗内）—— 一行 = 操作系统 × 版本。
   行内不改数据，只在保存时由 idSwVerCollect 一次性收口。 */
function idSwVerRows(rows, cls) {
  return (rows || []).map(function (r, i) {
    return '<div class="osver-row" data-at="' + esc(r.at || idDay()) + '" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px">' +
      '<select class="osver-os" aria-label="操作系统" style="width:116px">' +
        ID_OS_DEF.map(function (o) { return "<option" + (r.os === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" +
      '<input class="osver-ver" aria-label="版本号" placeholder="版本号" value="' + esc(r.ver || "") + '" style="width:86px">' +
      '<input class="osver-size" aria-label="安装包大小" placeholder="安装包" value="' + esc(r.size || "") + '" style="width:84px">' +
      '<input class="osver-sha" aria-label="SHA256 校验码" placeholder="SHA256 校验码（64 位十六进制）" value="' + esc(r.sha256 || "") + '" style="width:300px">' +
      '<select class="osver-sig" aria-label="签名" style="width:236px">' +
        ID_SIG_DEF.map(function (o) { return "<option" + (r.sig === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" +
      '<select class="osver-pub" aria-label="发布状态" style="width:96px">' +
        [["1", "已发布"], ["0", "未发布"]].map(function (o) { return '<option value="' + o[0] + '"' + ((r.pub === false ? "0" : "1") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
      '<button type="button" class="btn link" data-idact="swOsDel" data-cls="' + cls + '" data-i="' + i + '">移除</button>' +
      "</div>";
  }).join("");
}
function idSwVerCollect(cls) {
  var box = document.getElementById("swOsver");
  if (!box) return [];
  return Array.prototype.slice.call(box.querySelectorAll(".osver-row")).map(function (r) {
    var g = function (sel) { var el = r.querySelector(sel); return el ? String(el.value) : ""; };
    return { os: g(".osver-os"), ver: g(".osver-ver").trim(), size: g(".osver-size").trim(),
      sha256: g(".osver-sha").trim().toLowerCase(), sig: g(".osver-sig"),
      at: r.getAttribute("data-at") || idDay(), pub: g(".osver-pub") === "1" };
  });
}
/* 校验：判据只认正面标记（不写「不含 X」），逐条给出可执行的修正话术。 */
function idSwVerValid(rows, vsig) {
  if (!rows.length) return "请至少登记一个操作系统版本";
  var vs = String(vsig || ""), seen = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i], key = r.os + "|" + r.ver;
    if (seen.indexOf(key) >= 0) return "「" + r.os + " · " + r.ver + "」重复登记（同一操作系统下的同一版本只能有一行）";
    seen.push(key);
    if (!r.ver) return "请填写 " + r.os + " 的版本号";
    if (!/^\d+(\.\d+){1,3}$/.test(r.ver)) return r.os + " 的版本号格式应为「数字.数字」（如 3.2.1）";
    if (vs.indexOf("哈希值校验") >= 0 && !/^[0-9a-f]{64}$/.test(r.sha256)) return r.os + " · " + r.ver + " 的 SHA256 校验码须为 64 位十六进制";
    if (vs.indexOf("客户端签名校验") >= 0 && r.sig === "未签名") return r.os + " · " + r.ver + " 未登记签名（「版本签名校验」含签名校验时必填）";
  }
  return "";
}
function idSwVerWrite(sw, rows) {
  sw.osver = rows.map(function (r) {
    return { os: r.os, ver: r.ver, size: r.size || "—", sha256: String(r.sha256 || "").toLowerCase(),
      sig: r.sig, at: r.at || idDay(), pub: !!r.pub };
  });
}
/* 行标识＝「操作系统 | 版本号」（同软件下唯一，由 idSwVerValid 保证）—— 与 swVerPub 同口径。 */
function idSwVerRowFound(sw, os, ver) {
  return (sw.osver || []).filter(function (r) { return r.os === os && r.ver === ver; })[0] || null;
}
/* R19 单行版本登记弹窗 —— 台账行级 CRUD 共用：row 为空 = 新增，否则 = 编辑该行。
   与「新建软件」弹窗里的行式编辑器（idSwVerRows）分工不同：这里**只承担一行**，行数再多也只是多开几次。
   重复登记校验复用同一个 idSwVerValid（判据一处实现，不在两处各写一遍）。 */
function openSwVerRow(sw, row) {
  var isNew = !row;
  var cur = row || { os: ID_OS_DEF[0], ver: "", size: "", sha256: "", sig: ID_SIG_DEF[0], pub: false };
  var opts = function (list, sel) {
    return list.map(function (o) { return "<option" + (o === sel ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("");
  };
  openDlg(isNew ? "添加操作系统版本" : "编辑操作系统版本",
    "<b>" + esc(sw.name) + "</b> · 按操作系统分别登记；<b>同一操作系统下的同一版本只能有一行</b>。",
    '<div class="fld"><label>操作系统</label><select id="swvOs">' + opts(ID_OS_DEF, cur.os) + "</select></div>" +
    '<div class="fld" style="margin-top:10px"><label>版本号 <span class="req">*</span></label><input id="swvVer" value="' + esc(cur.ver || "") + '" placeholder="如 3.2.1">' +
      '<div class="help" style="margin-top:6px">格式为「数字.数字」。</div></div>' +
    '<div class="fld" style="margin-top:10px"><label>安装包</label><input id="swvSize" value="' + esc(cur.size || "") + '" placeholder="如 86.4 MB"></div>' +
    '<div class="fld" style="margin-top:10px"><label>SHA256 校验码</label><input id="swvSha" value="' + esc(cur.sha256 || "") + '" placeholder="安装包的 64 位十六进制校验码">' +
      '<div class="help" style="margin-top:6px">「版本签名校验」含<b>哈希值校验</b>时必填；取安装包的 SHA256。</div></div>' +
    '<div class="fld" style="margin-top:10px"><label>签名</label><select id="swvSig">' + opts(ID_SIG_DEF, cur.sig) + "</select>" +
      '<div class="help" style="margin-top:6px">「版本签名校验」含<b>客户端签名校验</b>时必填。</div></div>' +
    '<div class="fld" style="margin-top:10px"><label>发布状态</label><select id="swvPub">' +
      [["1", "已发布"], ["0", "未发布"]].map(function (o) { return '<option value="' + o[0] + '"' + ((cur.pub === false ? "0" : "1") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
      '<div class="help" style="margin-top:6px">已发布方可下载并参与升级提示；未发布不可下载、不可用（手册 §4.7.5）。</div></div>');
  $("#dlg1Ok").onclick = function () {
    var rd = { os: $("#swvOs").value, ver: ($("#swvVer").value || "").trim(), size: ($("#swvSize").value || "").trim(),
      sha256: ($("#swvSha").value || "").trim().toLowerCase(), sig: $("#swvSig").value, pub: $("#swvPub").value === "1" };
    var others = (sw.osver || []).filter(function (x) { return !(row && x.os === row.os && x.ver === row.ver); });
    var bad = idSwVerValid(others.concat([rd]), sw.vsig);
    if (bad) { toast(bad); return; }
    /* ★ R53（B-F2）：「行内编辑」与「取消发布 / 删除」后果相同（在用实例下次建连被判非受控版本
       而拒绝、或在表中查无此行），但后者已拦、行内编辑未拦。此处对**原行**判在用：命中则禁止改
       操作系统 / 版本号，且禁止把已发布改为未发布；内容字段（安装包 / SHA256 / 签名）变更仍放行，
       由下方 idAskEff 走变更确认（客户端须重新通过版本校验，手册 §4.6.5）。 */
    if (!isNew) {
      var _svUse = idSwVerUseCount(sw, row.os, row.ver);
      if (_svUse > 0 && (rd.pub !== true || rd.os !== row.os || rd.ver !== row.ver)) {
        toast("该版本（" + row.os + " · " + row.ver + "）有 " + _svUse + " 个在用实例，不可取消发布或变更操作系统 / 版本号（须先卸载或升级这些实例）");
        return;
      }
    }
    var changed = isNew || rd.os !== row.os || rd.ver !== row.ver || rd.size !== (row.size || "") ||
      rd.sha256 !== String(row.sha256 || "").toLowerCase() || rd.sig !== row.sig || !!row.pub !== rd.pub;
    var apply = function () {
      if (isNew) {
        sw.osver = (sw.osver || []).concat([{ os: rd.os, ver: rd.ver, size: rd.size || "—", sha256: rd.sha256, sig: rd.sig, at: idDay(), pub: rd.pub }]);
      } else {
        row.os = rd.os; row.ver = rd.ver; row.size = rd.size || "—"; row.sha256 = rd.sha256; row.sig = rd.sig; row.pub = rd.pub;
      }
      idSave(); closeDlg(); idRerender(); toast("已保存（演示）");
    };
    if (!changed) { apply(); return; }
    idAskEff(isNew ? "添加操作系统版本" : "变更版本与校验码",
      (isNew ? "将新增 " : "将变更 ") + "<b>" + esc(sw.name) + "</b> 的 <b>" + esc(rd.os) + " · " + esc(rd.ver) + "</b> 登记" +
      "（版本号 / 安装包 / SHA256 校验码 / 签名 / 发布状态）。本表是客户端<b>建连校验的唯一依据</b>：变更后客户端<b>须重新通过版本校验方可与网关建立通信</b>（校验不通过即拒绝，手册 §4.6.5）。<b>本次变更入审计</b>。",
      apply);
  };
}
/* 详情页「版本与校验码」卡片 —— 按操作系统分组、版本降序。 */
/* 在用实例的版本分布 —— 升级推进情况的**唯一可见口径**（版本值是客户端上报值，见实例详情）。
   未登记版本（客户端上报了某个本页未登记的版本）也要**显形**：否则分布看起来是满的、
   实际存在「校验码查无此版本」的缺口。 */
function idSwVerDist(s) {
  var parts = [];
  (s.osver || []).forEach(function (r) {
    var n = idSwVerUseCount(s, r.os, r.ver);
    if (n) parts.push(esc(r.os) + " " + esc(r.ver) + " ×" + n);
  });
  var un = [], nopub = [];
  (ID.cin || []).forEach(function (c) {
    if (c.sw !== s.id || c.st === "已卸载") return;
    var fam = idOsFamily((ID.terms.filter(function (t) { return t.id === c.term; })[0] || {}).os);
    var k = fam + " " + c.ver;
    var row = (s.osver || []).filter(function (r) { return r.os === fam && r.ver === c.ver; })[0];
    if (!row) { if (un.indexOf(k) < 0) un.push(k); }
    /* 已登记但**未发布**：手册 §4.7.5「未发布不可用」。与「未登记」是两种不同缺口 ——
       前者校验码查得到、看起来正常；后者连校验码都没有。分列才不会互相遮蔽。 */
    else if (row.pub !== true && nopub.indexOf(k) < 0) nopub.push(k);
  });
  un.forEach(function (k) { parts.push("<b>" + esc(k) + "（未登记版本 · 不通过签名校验）</b>"); });
  nopub.forEach(function (k) { parts.push("<b>" + esc(k) + "（未发布版本 · 按手册 §4.7.5 不可用）</b>"); });
  return parts.length ? parts.join(" · ") : "暂无在用实例";
}
function idSwVerCard(s) {
  var rows = (s.osver || []).slice().sort(function (a, b) {
    if (a.os !== b.os) return ID_OS_DEF.indexOf(a.os) - ID_OS_DEF.indexOf(b.os);
    return idVerCmp(b.ver, a.ver);
  });
  /* R19：版本与校验码是**集合型台账**（一行 = 操作系统 × 版本）⇒ 行级 CRUD：
     表外「＋ 添加操作系统版本」、行内「发布 / 取消发布 · 编辑 · 删除」；每行只编一行，行数再多也不挤在一个弹窗里。
     同时把原总弹窗里的**单值策略**「版本签名校验」提为卡头独立入口（一个弹窗只承担一类语义，R17 判据）。 */
  var body = rows.map(function (r) {
    var used = idSwVerUseCount(s, r.os, r.ver);
    var rk = ' data-os="' + esc(r.os) + '" data-ver="' + esc(r.ver) + '"';
    /* ★ 2026-10-12（R57 · 交-6）：不可行按钮**渲染即禁用** —— 判据与 handler 守卫逐条对齐：
       已发布且已有在用实例 ⇒ 不可取消发布；已有在用实例 或 仅剩一行 ⇒ 不可删除。
       原实现三个按钮一律可点、点了才 toast 拒绝，属「可点但必失败」。 */
    var pubOff = r.pub && used > 0;
    var delOff = used > 0 || rows.length <= 1;
    var pubTip = pubOff ? ' disabled title="' + esc(r.os + " · " + r.ver + " 已有 " + used + " 个客户端实例在用，不可取消发布") + '"' : "";
    var delTip = delOff ? ' disabled title="' + esc(used > 0 ? (r.os + " · " + r.ver + " 已有 " + used + " 个客户端实例在用，不可删除") : "至少保留一个操作系统版本") + '"' : "";
    return "<tr><td>" + esc(r.os) + "</td>" +
      '<td><span class="kr">' + esc(r.ver) + "</span></td>" +
      "<td>" + esc(r.size || "—") + "</td>" +
      '<td title="' + esc(r.sha256) + '"><span class="kr">' + esc(idShaFmt(r.sha256)) + "</span></td>" +
      "<td>" + esc(r.sig || "—") + "</td>" +
      "<td>" + esc(r.at || "—") + "</td>" +
      "<td>" + (r.pub ? '<span class="tag t-ok">已发布</span>' : '<span class="tag t-gray">未发布</span>') + "</td>" +
      "<td>" + used + " 个</td>" +
      "<td>" + idBtn("swVerPub", s.id, r.pub ? "取消发布" : "发布", "link", rk + pubTip) +
        idBtn("swVerRowEdit", s.id, "编辑", "link", rk) +
        idBtn("swVerDel", s.id, "删除", "link", rk + delTip) + "</td></tr>";
  }).join("");
  return '<div class="card"><div class="card-h"><h3>版本与校验码<span class="sub">按操作系统分别登记 · 校验不通过不得与网关建立通信</span></h3>' +
    '<div class="toolbar">' + idBtn("swVerVsig", s.id, "版本签名校验", "sm") + idBtn("swVerAdd", s.id, "＋ 添加操作系统版本", "sm") + "</div></div>" +
    '<div class="card-b">' +
    /* ★ R61·轮12（E3-D2）：列名原写「发布时间」，但 at 字段的写入时机全在**登记**环节 ——
       新增即写 idDay()、行内编辑不改、发布 / 取消发布只切 pub ⇒ 与「发布」动作无耦合；
       种子亦存在「未发布却有 at 值」的行（HarmonyOS 3.2.0）⇒ 列名与字段语义矛盾。
       改为「登记时间」即与实现自洽（已登记未发布的行同样有登记时间）。 */
    idTbl(["操作系统", "版本号", "安装包", "SHA256 校验码", "签名", "登记时间", "发布状态", "在用实例", "操作"],
      body || idEmptyRow(9, "尚未登记操作系统版本 · 点右上「＋ 添加操作系统版本」"),
      ["106px", "84px", "90px", "176px", "226px", "106px", "96px", "82px", "152px"]) +
    '<div class="mini" style="margin-top:8px"><b>同一款软件在不同操作系统上的版本号与校验码各自独立</b> —— Windows / macOS / Linux 的构建产物不同，不共用一行登记。校验码取安装包的 <b>SHA256</b>（64 位十六进制）；<b>签名</b>由「版本签名校验」策略决定是否强制：策略含<b>哈希值校验</b>则校验码必填，含<b>客户端签名校验</b>则签名必填。<b>任一校验不通过，客户端不得与网关建立通信</b>（手册 §4.6.5）。</div>' +
    '<div class="mini" style="margin-top:6px"><b>已发布</b>方可下载并参与升级提示；<b>未发布</b>不可下载、<b>不可用</b>（手册 §4.7.5「未发布不可用」）—— 若实例上报了未发布版本，按<b>非受控版本</b>显性标注。<b>已有客户端注册成功（即「在用实例」不为 0）的版本不可取消发布</b> —— 否则在用客户端在下次校验时会被拒（手册 §4.7.5）。签名失效后可重新发布版本，校验码与签名须同步更新。</div>' +
    '<div class="mini" style="margin-top:6px"><b>本页职责</b>：维护各操作系统的<b>版本与校验码登记</b>与<b>发布状态</b>（手册 §4.6.1「客户端软件版本列表」/ §4.6.5「版本签名校验」）。手册 §4.7.5 的「设置默认下载版本」属 <b>WEB 运维通道 → 版本管理</b>，该通道<b>不在本原型范围内</b> ⇒ 本页升级提示以「<b>该操作系统下已发布的最新版本</b>」为参照（本模块可自证的事实），<b>不代为设置默认版本</b>。</div>' +
    '<div class="mini" style="margin-top:6px"><b>在用实例版本分布</b>：' + idSwVerDist(s) + '</div>' +
    "</div></div>";
}
function idSwPage() {
  if (IDS.cur) { var s = ID.csw.filter(function (x) { return x.id === IDS.cur; })[0]; if (s) return idSwDetail(s); }
  var pool = idSwFiltered();
  var size = LIST_PAGE, pg = Math.max(1, Math.min(IDS.pg, Math.ceil(pool.length / size) || 1));
  IDS.pg = pg;
  var body = pool.slice((pg - 1) * size, pg * size).map(function (s) {
    /* ★ R53（存-1）：计数口径＝在用实例（已卸载不计）。 */
    var ninst = ID.cin.filter(function (c) { return c.sw === s.id && c.st !== "已卸载"; }).length;
    var osList = idSwOsList(s);
    /* R19（实测驱动 · 列表精简）：认证方式在本表只给**数量**，完整名单走 title 提示。
       实测「账号密码、动态口令、指纹识别、USB Key 硬件令牌、活体人脸识别」单行需 422px，
       而该列只有 176px —— 它是把行高顶到 98px 的唯一来源；芯片形态只留在详情页。
       同一轮把「通信协议」「证书签发机制」两列整体移出列表：二者属手册 §4.6.4 一个条目、
       均为**详情页配置面**（协议只读展示 / 签发机制可编），列表只留识别信息与规模信息。 */
    var amethNames = (s.ameth || []).map(idSWName);
    return "<tr><td><b>" + esc(s.name) + "</b></td>" +
      "<td>" + esc(s.kind) + "</td>" +
      '<td><span class="kr">' + esc(s.sn) + "</span></td>" +
      '<td class="cell-cov">' + esc(osList.join("、") || "—") + "</td>" +
      "<td>" + esc(idSwVers(s).join(" / ")) + "</td>" +
      '<td title="' + esc(amethNames.join("、") || "未勾选") + '">' +
        (amethNames.length ? amethNames.length + " 种" : '<span class="muted">—</span>') + "</td>" +
      "<td>" + ninst + " 个</td>" +
      "<td>" + idBtn("swView", s.id, "详情", "sm") + idBtn("swEdit", s.id, "编辑") + "</td></tr>";
  }).join("");
  return idTitle("客户端软件管理", "登记<b>集成 SDK 的</b>客户端软件（软件级）· 含 AI 安全 agent（标特殊）· 本页是「某方式能否在该客户端上用」的标记处",
      '<div class="toolbar"><button class="btn" data-idact="swNew">新建客户端软件</button></div>') +
    idRefNote("<b>种类判定依据＝是否集成 SDK</b>：白泽官方客户端、客户经 SDK 集成的客户端、以及 <b>AI 安全 agent</b>（它本身集成 SDK，故在这一类里，标特殊）均在此页登记；受 AI 安全 agent 监管的 <b>AI agent 不集成 SDK</b>，归「智能体软件管理」，<b>不在此页</b>。") +
    '<div class="card"><div class="card-b">' +
    '<div class="toolbar" style="margin-bottom:12px">' +
      '<div class="input-w"><input type="search" id="idswK" aria-label="搜索客户端软件" placeholder="搜索软件名称 / 序列号 / 操作系统 / 版本" style="width:270px" value="' + esc(IDS.f.k) + '"><i aria-hidden="true">搜索</i></div>' +
      '<select id="idswAgent" aria-label="按类别筛选"><option value="">全部类别</option>' +
        ['客户端软件', 'AI 安全 agent'].map(function (o) { return "<option" + (IDS.f.agent === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
      "</select>" +
      '<select id="idswOs" aria-label="按操作系统筛选"><option value="">全部操作系统</option>' +
        ID_OS_DEF.map(function (o) { return "<option" + (IDS.f.os === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
      "</select>" +
    "</div>" +
    /* R19（实测驱动）：8 列全部单行。自动列「软件名称」原只分到 68px（十列争宽），
       连表头（需 78px）都放不下；撤两列后得 176px（内容需 146px）。其余列一律按实测自然宽度给值。 */
    idTbl(["软件名称", "类别", "唯一序列号", "适用操作系统", "版本", "支持的认证方式", "在用实例数", "操作"],
      body || idEmptyRowF(8, "暂无客户端软件", "无匹配客户端软件", !!(IDS.f.k || IDS.f.agent || IDS.f.os), "idClearFSw"), [null, "120px", "208px", "206px", "144px", "120px", "90px", "116px"]) +
    '<div class="lst-foot"><div id="idswPager" role="navigation" aria-label="客户端软件列表分页" style="flex:1"></div></div>' +
    '<div class="mini" style="margin-top:8px">唯一序列号<b>全局唯一</b>（16 位字母 + 8 位数字），用于 SDK 打包时识别；<b>支持的认证方式</b>在本表只示<b>数量</b>（悬停可见名单）；<b>通信协议与证书签发机制</b>见详情页「登记信息」与「客户端策略与授权」。</div>' +
    '<div class="mini" style="margin-top:6px"><b>版本与校验码按操作系统分别登记</b> —— 同一款客户端在 Windows / macOS / Linux 上的<b>版本号与 SHA256 校验码各自独立</b>。完整清单（含签名与发布状态）见软件详情的「版本与校验码」。</div>' +
    "</div></div>";
}
function idSwFiltered() {
  var f = IDS.f;
  return (ID.csw || []).filter(function (s) {
    if (f.k) {
      /* 搜索面须覆盖**操作系统**（手册 §4.6.1：支持按客户端名称、操作系统等筛选）——
         此前只搜 名称 / 序列号 / 版本，输入「macOS」筛不出任何结果。 */
      var hay = (s.name + " " + s.sn + " " + idSwVers(s).join(" ") + " " + idSwOsList(s).join(" ")).toLowerCase();
      if (hay.indexOf(String(f.k).toLowerCase()) < 0) return false;
    }
    if (f.agent) {
      var isAgent = !!s.agent;
      if ((f.agent === "AI 安全 agent") !== isAgent) return false;
    }
    if (f.os && idSwOsList(s).indexOf(f.os) < 0) return false;
    return true;
  });
}
function idSwDetail(s) {
  var idsTab = (IDS.tab === "t2" || IDS.tab === "t3" || IDS.tab === "t4") ? IDS.tab : "t1";
  var insts = ID.cin.filter(function (c) { return c.sw === s.id; });
  /* ★ 2026-10-12（R57 · 交-6）：在用实例数放在渲染侧 —— 软件下仍有在用实例时「删除」不可行
     （handler 的 swDel 守卫同判据：实例外键会悬空），渲染即禁用，不让用户白点一次。 */
  var liveN = insts.filter(function (c) { return c.st !== "已卸载"; }).length;
  var aRows = insts.map(function (c) {
    return "<tr><td>" + esc(idName(ID.terms, c.term, "id", "name")) + '</td><td><span class="kr">' + esc(c.cidseq) + "</span></td><td>" + idStTag(c.st) + "</td><td>" + (c.lic || []).length + " 份</td>" +
      "<td>" + idBtn("cinGoto", c.id, "去实例管理") + "</td></tr>";
  }).join("");
  var amethRows = ID_AMETH_DEF().map(function (m) {
    var on = (s.ameth || []).indexOf(m.k) >= 0;
    return '<label class="chip' + (on ? " on" : "") + '" style="margin:4px 6px 4px 0"><input type="checkbox" data-idact="swAmeth" data-k="' + m.k + '"' + (on ? " checked" : "") + ">" +
      esc(m.name) + "</label>";
  }).join("");
  return idTitle("客户端软件详情 · " + s.name,
      "类别 " + esc(s.kind) + " · 唯一序列号 <b>" + esc(s.sn) + "</b>",
      '<div class="toolbar"><button class="btn" data-idact="swList">← 返回列表</button>' +
      '<button class="btn" data-idact="swEdit" data-id="' + s.id + '">编辑</button>' +
      '<button class="btn danger"' + (liveN ? ' disabled title="该软件下仍有 ' + liveN + ' 个在用实例，须先卸载后再删除"' : ' data-idact="swDel" data-id="' + s.id + '"') + '>删除</button></div>') +
    (s.agent ? '<div class="hint-row"><i class="ic">特殊</i><div>本软件是 <b>AI 安全 agent</b> —— 它是<b>集成 SDK 的特殊客户端软件</b>，负责<b>监管本终端上的 AI agent</b>（被监管的 AI agent 不集成 SDK，归「智能体软件 / 实例管理」）。</div></div>' : "") +
    idTabBar("idSwTabs", [["t1", "登记信息"], ["t2", "策略与授权"], ["t3", "版本与校验码"], ["t4", "客户端实例"]], idsTab) +
    idTabPane("idSwTabs", "t1", idsTab === "t1",
      '<div class="card"><div class="card-h"><h3>登记信息<span class="sub">软件级登记属性 · 重配置项已拆为下方独立入口</span></h3></div><div class="card-b">' +
      '<div class="kv" style="grid-template-columns:150px 1fr 150px 1fr">' +
      idKvLeft("软件名称") + idKvVal(esc(s.name)) +
      idKvLeft("类别") + idKvVal(esc(s.kind)) +
      idKvLeft("唯一序列号") + idKvVal(esc(s.sn)) +
      idKvLeft("适用操作系统") + idKvVal(esc(idSwOsList(s).join("、") || "—")) +
      idKvLeft("版本列表") + idKvVal(esc(idSwVers(s).join(" / ")) || "—") +
      idKvLeft("通信协议") + idKvVal(esc(s.proto) + (s.proto === "TLCP"
        ? "（国密标准 · 双证书：认证证书 + 加密证书）" : "（通用标准 · 单证书）") + " · 登记时选定后不可切换") +
      idKvLeft("注册 / 审核方式") + idKvVal(esc(s.regway) + "（用户注册时自动遵循，无需选择）") +
      "</div>" +
      '<div class="mini" style="margin-top:8px">本卡为<b>软件级登记属性</b>：<b>软件名称</b>与<b>注册 / 审核方式</b>可在右上角编辑，<b>类别 / 唯一序列号 / 通信协议</b>在登记时确定后不可修改。<b>客户端策略与授权</b>与<b>版本与校验码</b>已拆为各卡片右上角的独立入口 —— 每项配置只改自己那一块，变更面与二次认证范围一一对应。</div>' +
    "</div></div>") +
    idTabPane("idSwTabs", "t2", idsTab === "t2",
      '<div class="card"><div class="card-h"><h3>客户端策略与授权<span class="sub">软件级策略 · 三项均改变客户端生效面</span></h3><div class="toolbar">' + idBtn("swPolicyEdit", s.id, "修改", "sm") + '</div></div>' +
      '<div class="card-b">' +
      idTbl(["配置项", "当前值", "说明"], [
        "<tr><td>证书签发机制</td><td>" + esc(s.cert) + "</td><td>软件级<b>策略选择</b>，非为某个客户端签发证书；仅影响此后新签 / 轮换的证书，存量不追溯重签</td></tr>",
        "<tr><td>客户端绑定与静默登录</td><td>" + (s.bind ? "已开启" : "未开启") + "</td><td>开启后可静默登录（有效期取客户端证书有效期，默认 30 天）；绑定关系变化自动通知管理员</td></tr>",
        "<tr><td>可访问资产</td><td>" + esc((s.assets || []).join("、") || "—") + "</td><td>取自管理员维护的「资产列表」（只读引用）</td></tr>"
      ].join(""), ["190px", "230px", null]) +
      '<div class="mini" style="margin-top:8px"><b>可访问资产限定客户端侧可见范围</b> —— 用户最终能否访问某个资产，还取决于该资产自身的<b>访问策略</b>。</div>' +
      '<div class="mini" style="margin-top:6px">证书机制只影响此后新签 / 轮换的证书；绑定关系变化自动通知管理员；资产收窄后用户即使有权限也无法访问 —— 三项均属<b>客户端生效面</b> ⇒ 变更走<b>二次认证</b>。</div>' +
    "</div></div>" +
    '<div class="card"><div class="card-h"><h3>支持的认证方式<span class="sub">本页最要紧的一块 · 只做减法（从字典选子集）</span></h3></div>' +
      '<div class="card-b">' +
      '<div style="display:flex;flex-wrap:wrap;margin:-4px 0 6px">' + amethRows + "</div>" +
      '<div class="mini" style="margin-top:8px">取值范围取自<b>认证方式字典</b>（认证模块）—— 字典是<b>唯一取值域</b>，本页<b>只做子集勾选、不新增字典里没有的方式名</b>。新建时<b>不预勾</b>（避免误开放）；取消某方式<b>不清除用户已登记的凭据</b>。</div>' +
      '<div class="mini" style="margin-top:6px">本页只回答<b>「这个方式能不能在这款软件上用」</b>，<b>不标级别</b> —— 强度级别挂在<b>「认证源 × 认证方式」</b>（认证模块「认证源」页），同一方式在不同源下级别可以不同。</div>' +
      '<div class="mini" style="margin-top:6px">与其他三处的关系：<b>认证方式字典</b>（平台有哪些方式）∩ <b>认证源登记</b>（这个身份体系能提供哪些）∩ <b>本页</b>（这款软件能承载哪些）∩ <b>资产访问策略要求</b> ⇒ 登录 / 追加认证时<b>实际下发的选项集合</b>。该软件登录页按本清单<b>收窄呈现</b>。</div>' +
      '<div class="mini" style="margin-top:6px">禁用某方式<b>改变生效面</b>（登录与追加认证时不再下发该选项）⇒ 走<b>二次认证</b>；已为该方式登记过凭据的用户按 <b>fail-closed</b> 处置（策略要求而该软件不承载时<b>拒绝</b>，不静默回退到低级别方式）。</div>' +
    "</div></div>") +
    idTabPane("idSwTabs", "t3", idsTab === "t3",
      idSwVerCard(s)) +
    idTabPane("idSwTabs", "t4", idsTab === "t4",
      '<div class="card"><div class="card-h"><h3>该软件下的客户端实例<span class="sub">实例台账在「客户端实例管理」· 此处只读串联（含已卸载，供追溯）</span></h3><div class="toolbar"><button class="btn" data-idact="swToCin" data-id="' + s.id + '">查看全部实例</button></div></div>' +
      '<div class="card-b">' + idTbl(["所在终端", "客户端序列号", "状态", "License 证书", "操作"],
        aRows || idEmptyRow(5, "该软件暂无客户端实例"), [null, "170px", "92px", "110px", "150px"]) + "</div></div>");
}

/* ---------- 5. 页④ 客户端实例管理（pg-idcin） ---------- */
var IDC = { f: { k: "", sw: "", st: "" }, pg: 1, cur: "", tab: "t1" };
function idCinFiltered() {
  var f = IDC.f;
  return (ID.cin || []).filter(function (c) {
    var sw = idSwOf(c.sw);
    /* 搜索须覆盖**所在终端**：终端详情按该终端汇总实例数，用户会到实例页按终端名反查 ——
       此前只匹配软件名 + 序列号，无法互推（终端 t_pc_0007 有 2 条实例，搜终端名命中 0）。 */
    if (f.k && (sw.name + " " + c.cidseq + " " + idName(ID.terms, c.term, "id", "name")).toLowerCase().indexOf(f.k.toLowerCase()) < 0) return false;
    if (f.sw && c.sw !== f.sw) return false;
    if (f.st && c.st !== f.st) return false;
    return true;
  });
}
function idCinPage() {
  if (IDC.cur) { var c = ID.cin.filter(function (x) { return x.id === IDC.cur; })[0]; if (c) return idCinDetail(c); }
  var rows = idCinFiltered();
  var size = LIST_PAGE, pg = Math.max(1, Math.min(IDC.pg, Math.ceil(rows.length / size) || 1));
  IDC.pg = pg;
  var slice = rows.slice((pg - 1) * size, pg * size);
  var body = slice.map(function (c) {
    var sw = idSwOf(c.sw);
    var cur = (c.lic || []).filter(function (l) { return idLicTagOf(l) === "当前"; })[0] || {};
    return "<tr><td><b>" + esc(sw.name || "—") + "</b>" + (sw.agent ? ' <span class="tag t-info">AI 安全 agent</span>' : "") + "</td>" +
      "<td>" + esc(idName(ID.terms, c.term, "id", "name")) + "</td>" +
      '<td><span class="kr">' + esc(c.cidseq) + "</span></td>" +
      "<td>" + idStTag(c.st) + "</td>" +
      "<td>" + idStTag(c.online) + "</td>" +
      "<td>" + (c.lic || []).length + " 份</td>" +
      "<td>" + (cur.exp ? esc(cur.exp) : '<span class="muted">—</span>') + "</td>" +
      "<td>" + idBtn("cinView", c.id, "详情", "sm") + idBtn("cinLic", c.id, "证书") + "</td></tr>";
  }).join("");
  return idTitle("客户端实例管理", "客户端<b>实例</b>（软件装在具体终端上的实例）台账 · <b>License 证书的看与改均在此页</b>",
      '<div class="toolbar"><button class="btn primary" data-idact="cinNew">登记客户端实例</button></div>') +
    idRefNote("本页是 <b>License 证书的实际管理面</b>（终端管理只做串联入口）；一个实例下可挂<b>多份</b>证书（轮换过渡期新旧共存）。") +
    '<div class="card"><div class="card-b">' +
    '<div class="toolbar" style="margin-bottom:12px">' +
      '<div class="input-w"><input type="search" id="idcK" aria-label="搜索客户端实例" placeholder="搜索客户端软件 / 序列号 / 所在终端" style="width:240px" value="' + esc(IDC.f.k) + '"><i aria-hidden="true">搜索</i></div>' +
      '<select id="idcSw" aria-label="按客户端软件筛选"><option value="">全部客户端软件</option>' + ID.csw.map(function (s) { return "<option value=\"" + s.id + "\"" + (IDC.f.sw === s.id ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select>" +
      '<select id="idcSt" aria-label="按状态筛选"><option value="">全部状态</option>' + ["已激活", "已禁用", "已卸载"].map(function (o) { return "<option" + (IDC.f.st === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" +
    "</div>" +
    idTbl(["客户端软件", "所在终端", "客户端序列号", "状态", "在线状态", "证书", "当前证书有效期", "操作"],
      body || idEmptyRowF(8, "暂无客户端实例", "无匹配客户端实例", !!(IDC.f.k || IDC.f.sw || IDC.f.st), "idClearFCin"),
      /* R19（实测）：在线状态原 78px < 内容 85px（「离线」+ 内边距）⇒ 折行；按自然宽度重排。 */
      [null, "200px", "150px", "90px", "90px", "60px", "126px", "140px"]) +
    '<div class="lst-foot"><div id="idcPager" role="navigation" aria-label="客户端实例列表分页" style="flex:1"></div></div>' +
    '<div class="mini" style="margin-top:8px"><b>状态</b>（已激活 / 已禁用 / 已卸载）为实例生命周期，<b>在线</b>（在线 / 离线）为实例当前的连通性 —— 两者相互独立：所在终端在线而某实例已禁用时，仍显示<b>离线</b>。禁用与卸载<b>改变生效面</b>，走二次认证。</div>' +
    "</div></div>";
}
/* 实例的「版本与升级」派生（手册 §2.4.1「版本信息：查看当前客户端软件版本号，有新版时会提示更新」）。
   比对范围**限定在所在终端的操作系统内** —— 不同操作系统上版本号不通用，跨 OS 比对会给出错误结论。
   参照版本 = 该操作系统下**已发布**的最新版本（本模块可自证的事实）。
   ⚠ 手册 §4.7.5 的「默认下载版本」由 WEB 运维通道「版本管理」设置，**该通道不在本原型范围内**
     ⇒ 本模块不代为设置默认版本，只以「已发布最新版」为参照（见 idSwVerCard 说明）。 */
function idCinUpHint(c, sw) {
  sw = sw || idSwOf(c.sw);
  if (c.st === "已卸载") return '实例已卸载 <span class="mini muted">（不再参与升级）</span>';
  var fam = idOsFamily((ID.terms.filter(function (t) { return t.id === c.term; })[0] || {}).os);
  var mine = (sw.osver || []).filter(function (r) { return r.os === fam && r.ver === c.ver; })[0];
  var pub = (sw.osver || []).filter(function (r) { return r.os === fam && r.pub; })
    .sort(function (a, b) { return idVerCmp(b.ver, a.ver); });
  if (!mine) return '<span class="tag t-err">版本未登记</span> <span class="mini muted">该操作系统下无此版本的校验码登记，须重新安装</span>';
  /* 「登记过」≠「可用」：手册 §4.7.5「已发布版本可用，**未发布不可用**」。
     用户自行安装（绕过平台发布流程）完全可能落到一个**已登记但未发布 / 已取消发布**的版本上 ——
     此时校验码查得到，若只看「有没有登记」就会得出「已是最新」的**误判**。 */
  if (mine.pub !== true) return '<span class="tag t-err">非受控版本</span> <span class="mini muted">该版本未发布或已取消发布（手册 §4.7.5「未发布不可用」），须回退或重装已发布版本</span>';
  if (!pub.length) return '<span class="tag t-gray">无已发布版本</span> <span class="mini muted">暂不可升级</span>';
  if (idVerCmp(pub[0].ver, c.ver) > 0) return '<span class="tag t-warn">可升级至 ' + esc(pub[0].ver) + "</span>";
  return '<span class="tag t-ok">已是最新</span>';
}
/* 实例版本变更的**唯一写入口** —— 不论来源是「平台推送升级 / 用户自行升级 / 离线安装包安装」，
   一律经此登记。`result` 三档落地：**成功**（客户端已回采）/ **待生效**（已下发未回采）/ **失败**（已回滚）。
   为何必须收口：版本号是**客户端上报值**、不是平台推断值；若各升级路径各写各的，
   就会出现「客户端早已升级、平台仍显示旧版本」—— 这正是「升级后未采集」的典型表现。 */
function idCinVerUpd(c, to, way, at, result) {
  if (!Array.isArray(c.verlog)) c.verlog = [];
  result = result || "成功";
  c.verlog.push({ at: at || ID_NOW, from: c.ver || "—", to: to, way: way || "客户端上报", result: result });
  /* ⚠ **只有成功上报才更新 c.ver**。平台下发 ≠ 客户端已升级：
     离线客户端既收不到推送、也来不及上报；此刻把 ver 写成目标版本，
     就成了「平台推断版本」——正是本页口径明令禁止的。 */
  if (result === "成功") c.ver = to;
}
/* 是否存在「已下发但客户端尚未回采」的升级：自末条向前看 ——
   先遇「成功」⇒ 已回采、无待生效；先遇「待生效」⇒ 返回其目标版本。用于避免重复下发。 */
function idCinPend(c) {
  var v = c.verlog || [];
  for (var i = v.length - 1; i >= 0; i--) {
    if (String(v[i].result).indexOf("成功") === 0) return null;
    if (String(v[i].result).indexOf("待生效") === 0) return v[i].to;
  }
  return null;
}
/* 最近一条**成功上报**记录（无 ⇒ 空对象）—— 「最近上报来源 / 通道」等字段只应由**上报**产生，
   下发与失败记录都不是上报，不能拿来当来源。 */
function idCinLastOk(c) {
  var v = c.verlog || [];
  for (var i = v.length - 1; i >= 0; i--) { if (String(v[i].result).indexOf("成功") === 0) return v[i]; }
  return {};
}
/* 最近一次**成功上报**时间：有成功记录取末条成功记录时间；无 ⇒ **首次安装注册时上报**，
   时间由终端注册时间派生（不另存一份，避免「同一次上报两个时间」）。 */
function idCinVerRpt(c) {
  var ok = idCinLastOk(c);
  if (ok.at) return esc(ok.at);
  var t = (ID.terms || []).filter(function (x) { return x.id === c.term; })[0] || {};
  return esc(t.reg || "—") + ' <span class="mini muted">（首次安装注册时上报）</span>';
}
/* 该实例在**所在操作系统**下已发布的最新版本 —— 升级目标的口径（不跨操作系统比对）。 */
function idCinLatestPub(c, sw) {
  sw = sw || idSwOf(c.sw);
  var fam = idOsFamily((ID.terms.filter(function (t) { return t.id === c.term; })[0] || {}).os);
  return (sw.osver || []).filter(function (r) { return r.os === fam && r.pub; })
    .sort(function (a, b) { return idVerCmp(b.ver, a.ver); })[0] || null;
}
function idCinVerCard(c) {
  var sw = idSwOf(c.sw);
  var fam = idOsFamily((ID.terms.filter(function (t) { return t.id === c.term; })[0] || {}).os);
  var pub = idCinLatestPub(c, sw);
  var pend = idCinPend(c);
  /* 已下发待生效时**不再渲染推送按钮** —— 否则会对同一实例重复下发同一目标版本。 */
  var canUp = c.st !== "已卸载" && pub && idVerCmp(pub.ver, c.ver) > 0 && !pend;
  var rows = (c.verlog || []).slice().reverse().map(function (r) {
    /* 三档落地分色：成功（已回采）绿 · 失败（已回滚）红 · 待生效（未回采）黄。 */
    var tag = String(r.result).indexOf("成功") === 0 ? '<span class="tag t-ok">成功</span>'
      : String(r.result).indexOf("失败") === 0 ? '<span class="tag t-err">' + esc(r.result) + "</span>"
      : '<span class="tag t-warn">' + esc(r.result) + "</span>";
    return "<tr><td>" + esc(r.at) + '</td><td><span class="kr">' + esc(r.from) + '</span></td>' +
      '<td><span class="kr">' + esc(r.to) + "</span></td><td>" + esc(r.way) + "</td><td>" + tag + "</td></tr>";
  }).join("");
  return '<div class="card"><div class="card-h"><h3>版本上报与升级记录<span class="sub">版本以<b>客户端上报</b>为准 · 下发不等于已升级</span></h3>' +
    '<div class="toolbar">' + (pend
      /* ★ 2026-10-12（R57 · 交-10）：终端的在线状态是本原型的**静态种子**，没有「客户端上线」
         这一事件的出口 ⇒ 对离线实例推送升级后就永久停在「待回采」，正文承诺的
         「客户端上线完成安装并回采后版本号才更新」这后半程不可达（交互死端）。
         补一个**演示事件出口**（显式标注「模拟」）：它代表由客户端发起的一次真实上报，
         写入仍走唯一写入口 idCinVerUpd（result=成功），版本号由「回采」改写 —— 不新增平台能力。 */
      ? '<span class="tag t-warn">已下发 ' + esc(pend) + " · 待客户端上线回采</span> " +
        idBtn("cinVerRpt", c.id, "模拟客户端上线回采", "link", ' data-to="' + esc(pend) + '"')
      : (canUp ? idBtn("cinUpgrade", c.id, "推送升级至 " + pub.ver) : "")) + "</div></div>" +
    '<div class="card-b">' +
    '<div class="kv" style="grid-template-columns:150px 1fr 150px 1fr">' +
      idKvLeft("实例版本（上报值）") + idKvVal(esc(c.ver || "—") + "　" + idCinUpHint(c, sw)) +
      idKvLeft("所在操作系统") + idKvVal(esc(fam || "—")) +
      idKvLeft("已发布最新版") + idKvVal(esc(pub ? pub.ver : "—") + " <span class=\"mini muted\">（该操作系统下已发布的最新版本）</span>") +
      idKvLeft("最近上报时间") + idKvVal(idCinVerRpt(c)) +
      idKvLeft("最近上报来源") + idKvVal(esc(idCinLastOk(c).way || "首次安装注册时上报")) +
      idKvLeft("上报通道") + idKvVal(esc(idCinLastOk(c).at ? "客户端上线握手 / 心跳上报" : "注册时随客户端信息上报")) +
      "</div>" +
    idTbl(["上报时间", "变更前版本", "变更后版本", "来源方式", "结果"],
      rows || idEmptyRow(5, "暂无版本变更记录（首次安装注册时上报，当前版本即为上报值）"),
      ["152px", "108px", "108px", null, "156px"]) +
    '<div class="mini" style="margin-top:8px">实例版本是<b>客户端上报值</b>，平台不推断：注册时上报一次，此后每次握手 / 心跳携带。' +
      "<b>平台推送升级、用户自行升级、离线安装包安装三条路径，只要客户端重新上线即会重新上报</b>，本页版本号随之更新 —— <b>升级方式不改变「必须回采」这一点</b>。" +
      "<b>下发 ≠ 已升级</b>：推送只对<b>在线</b>实例即时生效；终端<b>离线</b>时只登记<b>待生效</b>、<b>版本号保持原值不动</b>，待客户端上线完成安装并回采后才更新。" +
      "上报的版本若不在该操作系统的<b>已发布版本</b>列表内，视为<b>未登记版本</b>；若已登记但<b>未发布</b>（含已取消发布），按手册 §4.7.5「未发布不可用」视为<b>非受控版本</b>。两者均不通过版本签名校验，<b>不得与网关建立通信</b>（手册 §4.6.5）。</div>" +
    "</div></div>";
}
function idCinDetail(c) {
  var idcTab = (IDC.tab === "t2" || IDC.tab === "t3") ? IDC.tab : "t1";
  var sw = idSwOf(c.sw);
  var licRows = (c.lic || []).map(function (l) {
    var tg = idLicTagOf(l);
    /* 实例已卸载 ⇒ 其「当前 / 待生效」证书实际不生效（证书阶段由有效期派生，不感知实例生命周期）——
       明细仍保留可追溯，但须显式标注，避免「实例已卸载、证书仍显示当前」的误读。 */
    var dead = c.st === "已卸载" && (tg === "当前" || tg === "待生效");
    var acts = tg === "已吊销" ? '<span class="mini muted">—</span>'
      : (tg === "当前" || tg === "待生效" ? idBtn("licRevoke", c.id, "吊销", "link", ' data-l="' + esc(l.id) + '"') : '<span class="mini muted">—</span>') +
        (tg === "当前" && c.st !== "已卸载" ? idBtn("licRotate", c.id, "轮换") : "");
    return "<tr><td>" + idStTag(tg) + (dead ? ' <span class="mini muted">实例已卸载·不生效</span>' : "") + "</td><td><b>" + esc(l.no) + "</b></td>" +
      '<td><span class="kr">' + esc(l.ca) + "</span></td>" +
      "<td>" + esc(l.issued) + "</td><td>" + esc(l.exp) + "</td>" +
      '<td class="cell-cov">' + esc(l.scope) + "</td>" +
      "<td>" + acts + "</td></tr>";
  }).join("");
  var ais = ID.ain.filter(function (a) { return a.host === c.id; });
  var aiRows = ais.map(function (a) {
    return "<tr><td><b>" + esc(idName(ID.asw, a.asw)) + "</b></td><td>" + esc(a.pid) + "</td>" +
      "<td>" + idStTag(idAgInSt(a)) + "</td>" +
      "<td>" + idBtn("ainGoto", a.asw, "去实例管理", "", ' data-t="' + esc(a.term) + '"') + "</td></tr>";
  }).join("");
  var btns = "";
  if (c.st === "已激活") btns += '<button class="btn" data-idact="cinToggle" data-id="' + c.id + '">禁用</button>';
  else if (c.st === "已禁用") btns += '<button class="btn" data-idact="cinToggle" data-id="' + c.id + '">激活</button>';
  if (c.st !== "已卸载") btns += '<button class="btn danger" data-idact="cinUninstall" data-id="' + c.id + '">卸载</button>';
  return idTitle("客户端实例详情 · " + (sw.name || ""),
      "客户端序列号 <b>" + esc(c.cidseq) + "</b> · 所在终端 " + esc(idName(ID.terms, c.term, "id", "name")),
      '<div class="toolbar"><button class="btn" data-idact="cinList">← 返回列表</button>' +
      btns + "</div>") +
    (sw.agent ? '<div class="hint-row"><i class="ic">特殊</i><div>该实例是 <b>AI 安全 agent</b> —— 它下挂的智能体实例是「<b>被它监管的 AI agent</b>」，但<b>下钻查看入口只在「智能体实例管理」页</b>，本页只显示该标记与只读串联。</div></div>' : "") +
    idTabBar("idCinTabs", [["t1", "实例信息"], ["t2", "License 证书"], ["t3", "智能体实例"]], idcTab) +
    idTabPane("idCinTabs", "t1", idcTab === "t1",
      '<div class="card"><div class="card-h"><h3>实例信息</h3></div><div class="card-b">' +
      '<div class="kv" style="grid-template-columns:150px 1fr 150px 1fr">' +
      idKvLeft("所属客户端软件") + idKvVal(esc(sw.name || "—") + "　" + idBtn("swGoto", c.sw, "查看软件登记")) +
      idKvLeft("所在终端") + idKvVal(esc(idName(ID.terms, c.term, "id", "name")) + "　" + idBtn("termGoto", c.term, "查看终端")) +
      idKvLeft("客户端序列号") + idKvVal(esc(c.cidseq)) +
      idKvLeft("状态") + idKvVal(idStTag(c.st) + " " + idStTag(c.online)) +
      "</div></div></div>" +
    idCinVerCard(c)) +
    idTabPane("idCinTabs", "t2", idcTab === "t2",
      '<div class="card"><div class="card-h"><h3>License 证书<span class="sub">一个实例下可挂多份 · 看与改均在本页</span></h3>' +
      (c.st === "已卸载" ? "" : '<div class="toolbar"><button class="btn" data-idact="cinNewLic" data-id="' + c.id + '">签发证书</button></div>') + "</div>" +
      '<div class="card-b">' + idTbl(["阶段", "证书编号", "签发 CA", "生效日期", "有效期至", "授权范围", "操作"],
        licRows || idEmptyRow(7, "该实例暂无证书"), ["92px", "160px", "130px", "105px", "105px", null, "110px"]) +
      '<div class="mini" style="margin-top:8px">License 证书是<b>平台自定义封装的 License 容器</b>（非 X.509 证书）；内封<b>授权信息</b>（客户端序列号 / 终端序列号 / 授权范围 / 有效期）与建立 TLCP 隧道所需的 <b>CA 证书链</b>，<b>只含公钥、不含私钥</b>。容器内<b>含该终端的设备序列号</b>，凭据与终端绑定；终端其余档案在注册环节采集。轮换过渡期新旧证书<b>并存</b>，阶段由<b>有效期推导</b>（当前 / 待生效 / 已过期），吊销为<b>显式状态</b>且记录保留可追溯。</div>' +
      "</div></div>") +
    idTabPane("idCinTabs", "t3", idcTab === "t3",
      '<div class="card"><div class="card-h"><h3>该实例上的智能体实例<span class="sub">含已终止（供追溯）· 只读串联 · 改动入口在「智能体实例管理」</span></h3></div>' +
      '<div class="card-b">' + idTbl(["智能体软件", "进程号", "状态", "操作"],
        aiRows || idEmptyRow(4, "该实例上暂无智能体实例"), [null, "80px", "92px", "140px"]) + "</div></div>");
}

/* ---------- 6. 页⑤ 智能体软件管理（pg-idagsw） ---------- */
var IDA = { cur: "", pg: 1, f: { k: "", st: "" } };
function idAgSwPage() {
  if (IDA.cur) { var a = ID.asw.filter(function (x) { return x.id === IDA.cur; })[0]; if (a) return idAgSwDetail(a); }
  var pool = idAgSwFiltered();
  var size = LIST_PAGE, pg = Math.max(1, Math.min(IDA.pg, Math.ceil(pool.length / size) || 1));
  IDA.pg = pg;
  var body = pool.slice((pg - 1) * size, pg * size).map(function (a) {
    /* ★ R53（存-1）：计数口径＝在用实例（已终止不计）—— 与 L2306 的 live 判据同源。 */
    var ninst = ID.ain.filter(function (x) { return x.asw === a.id && x.st !== "已终止"; }).length;
    return "<tr><td><b>" + esc(a.name) + "</b></td><td>" + esc(a.vendor) + "</td>" +
      "<td>" + esc(a.ver.join(" / ")) + "</td>" +
      "<td>" + (a.guardian ? esc(idName(ID.csw, a.guardian)) : '<span class="tag t-warn">待指定</span>') + "</td>" +
      "<td>" + idStTag(a.st) + "</td>" +
      '<td class="cell-cov">' + esc(a.policy) + "</td>" +
      "<td>" + ninst + " 个</td>" +
      "<td>" + idBtn("agswView", a.id, "详情", "sm") + idBtn("agswEdit", a.id, "编辑") + "</td></tr>";
  }).join("");
  return idTitle("智能体软件管理", "受 <b>AI 安全 agent 监管</b>的 AI agent 软件（软件级）· <b>不集成 SDK</b>，与客户端软件是两条平行线",
      '<div class="toolbar"><button class="btn primary" data-idact="agswNew">登记智能体软件</button></div>') +
    idRefNote("<b>智能体不是客户端软件的一种</b>：客户端软件的判定依据是<b>是否集成 SDK</b>，智能体的判定依据是<b>是否受 AI 安全 agent 监管</b>（且不集成 SDK）。AI agent <b>只在智能体两页查看</b>，客户端实例页不下钻。") +
    '<div class="card"><div class="card-b">' +
    '<div class="toolbar" style="margin-bottom:12px">' +
      '<div class="input-w"><input type="search" id="idagswK" aria-label="搜索智能体软件" placeholder="搜索智能体软件 / 厂商" style="width:230px" value="' + esc(IDA.f.k) + '"><i aria-hidden="true">搜索</i></div>' +
      '<select id="idagswSt" aria-label="按状态筛选"><option value="">全部状态</option>' +
        ["受管", "待纳管"].map(function (o) { return "<option" + (IDA.f.st === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
      "</select>" +
    "</div>" +
    idTbl(["智能体软件", "厂商 / 来源", "版本", "监管的 AI 安全 agent", "状态", "受管策略", "在用实例数", "操作"],
      body || idEmptyRowF(8, "暂无智能体软件", "无匹配智能体软件", !!(IDA.f.k || IDA.f.st), "idClearFAg"),
      /* R19（实测）：受管策略需 315px（原 219px ⇒ 折两行）；按自然宽度重排后 8 列全部单行。
         R53（存-1）：实例数列由「实例数」改「在用实例数」，列宽 70→90px（自动列仍有余量）。 */
      [null, "100px", "106px", "156px", "90px", "320px", "90px", "118px"]) +
    '<div class="lst-foot"><div id="idagswPager" role="navigation" aria-label="智能体软件列表分页" style="flex:1"></div></div>' +
    '<div class="mini" style="margin-top:8px"><b>状态</b>由「是否已指定监管的 AI 安全 agent」决定：已指定 ⇒ <b>受管</b>；未指定 ⇒ <b>待纳管</b>（尚未纳入监管，不能登记其运行实例）。</div>' +
    "</div></div>";
}
function idAgSwFiltered() {
  var f = IDA.f || {};
  return (ID.asw || []).filter(function (a) {
    if (f.k) {
      /* 搜索覆盖可见列：监管的 AI 安全 agent 为可见列（显示其名），纳入命中面。 */
      var hay = (a.name + " " + a.vendor + " " + (a.ver || []).join(" ") + " " + (a.guardian ? idName(ID.csw, a.guardian) : "")).toLowerCase();
      if (hay.indexOf(String(f.k).toLowerCase()) < 0) return false;
    }
    if (f.st && a.st !== f.st) return false;
    return true;
  });
}
function idAgSwDetail(a) {
  var insts = ID.ain.filter(function (x) { return x.asw === a.id; });
  var rows = insts.map(function (i) {
    return "<tr><td>" + esc(idName(ID.terms, i.term, "id", "name")) + "</td>" +
      '<td><span class="kr">' + esc(i.cred ? i.cred.no : "—") + "</span></td>" +
      "<td>" + esc(i.pid) + "</td><td>" + idStTag(idAgInSt(i)) + "</td>" +
      "<td>" + idBtn("ainGoto", a.id, "去实例管理") + "</td></tr>";
  }).join("");
  return idTitle("智能体软件详情 · " + a.name,
      "厂商 " + esc(a.vendor) + " · 版本 " + esc(a.ver.join(" / ")),
      '<div class="toolbar"><button class="btn" data-idact="agswList">← 返回列表</button>' +
      '<button class="btn" data-idact="agswEdit" data-id="' + a.id + '">编辑</button></div>') +
    '<div class="card"><div class="card-h"><h3>登记信息</h3></div><div class="card-b">' +
      '<div class="kv" style="grid-template-columns:150px 1fr 150px 1fr">' +
      idKvLeft("智能体软件") + idKvVal(esc(a.name)) +
      idKvLeft("厂商 / 来源") + idKvVal(esc(a.vendor)) +
      idKvLeft("版本列表") + idKvVal(esc(a.ver.join(" / "))) +
      idKvLeft("进程名 / 可执行文件") + idKvVal(esc(a.proc || "—")) +
      idKvLeft("监管的 AI 安全 agent") + idKvVal(a.guardian ? esc(idName(ID.csw, a.guardian)) + "（客户端软件管理中的特殊客户端）" : '<span class="tag t-warn">待指定</span>') +
      idKvLeft("状态") + idKvVal(idStTag(a.st)) +
      idKvLeft("SDK 集成") + idKvVal("<b>不集成</b>（由 AI 安全 agent 强制监管）") +
      "</div>" +
      '<div class="mini" style="margin-top:8px">智能体身份三要素：<b>持有短时凭据</b> + <b>宿主实例的客户端 License 证书</b> + <b>所在终端指纹</b>。⚠ 智能体<b>自己不持证书</b>，它依托<b>宿主实例</b>的证书；宿主必须是 <b>AI 安全 agent 的客户端实例</b>。</div>' +
    "</div></div>" +
    '<div class="card"><div class="card-h"><h3>受管策略</h3></div><div class="card-b">' +
      '<div class="kv" style="grid-template-columns:150px 1fr">' + idKvLeft("可访问范围") + idKvVal(esc(a.policy)) + "</div>" +
      '<div class="mini" style="margin-top:8px">受管策略由<b>监管它的 AI 安全 agent</b> 执行；资产访问的最终判定仍由资产访问策略（资产侧 ABAC）承担，本页只登记该智能体的受管范围。</div>' +
    "</div></div>" +
    '<div class="card"><div class="card-h"><h3>智能体实例<span class="sub">实例台账在「智能体实例管理」· 此处只读串联（含已终止，供追溯）</span></h3></div>' +
      '<div class="card-b">' + idTbl(["所在终端", "短时凭据", "进程号", "状态", "操作"],
        rows || idEmptyRow(5, "该智能体软件暂无实例"), [null, "180px", "80px", "92px", "150px"]) + "</div></div>";
}

/* ---------- 7. 页⑥ 智能体实例管理（pg-idagin） ---------- */
var IDAI = { f: { k: "", asw: "", st: "", term: "" }, pg: 1 };
function idAgInFiltered() {
  var f = IDAI.f;
  return (ID.ain || []).filter(function (a) {
    var nm = idName(ID.asw, a.asw);
    var hay = (nm + " " + a.pid + " " + idName(ID.terms, a.term, "id", "name") + " " + (a.cred ? a.cred.no : "")).toLowerCase();
    if (f.k && hay.indexOf(String(f.k).toLowerCase()) < 0) return false;
    if (f.asw && a.asw !== f.asw) return false;
    if (f.st && idAgInSt(a) !== f.st) return false;
    if (f.term && a.term !== f.term) return false;
    return true;
  });
}
function idAgInPage() {
  var rows = idAgInFiltered();
  var size = LIST_PAGE, pg = Math.max(1, Math.min(IDAI.pg, Math.ceil(rows.length / size) || 1));
  IDAI.pg = pg;
  var slice = rows.slice((pg - 1) * size, pg * size);
  var body = slice.map(function (a) {
    var host = idCinOf(a.host);
    var st = idAgInSt(a);
    var acts = st === "已终止"
      ? '<span class="mini muted">已终止</span>'
      : idBtn("ainEnd", a.id, "终止") + idBtn("ainRenew", a.id, "续发凭据");
    return "<tr><td><b>" + esc(idName(ID.asw, a.asw)) + "</b> " + idBtn("agswGoto", a.asw, "软件详情") + "</td>" +
      "<td>" + esc(idName(ID.terms, a.term, "id", "name")) + "</td>" +
      "<td>" + (idIsSafeHost(host) ? esc(idName(ID.csw, host.sw)) + "（<span class=\"kr\">" + esc(host.cidseq || "—") + "</span>）" : '<span class="tag t-warn">宿主缺失或非 AI 安全 agent 实例</span>') + "</td>" +
      '<td><span class="kr">' + esc(a.cred ? a.cred.no : "—") + "</span></td>" +
      "<td>" + esc(a.cred ? a.cred.exp : "—") + "</td>" +
      "<td>" + esc(a.pid) + "</td>" +
      "<td>" + idStTag(st) + "</td>" +
      "<td>" + acts + "</td></tr>";
  }).join("");
  return idTitle("智能体实例管理", "AI agent 在具体终端上的实例台账 · 持有<b>短时凭据</b>，身份依托<b>宿主实例证书 + 终端指纹</b>",
      '<div class="toolbar"><button class="btn primary" data-idact="ainNew">登记智能体实例</button></div>') +
    idRefNote("智能体身份 = 持有凭据 + <b>宿主实例的客户端 License 证书</b> + <b>所在终端指纹</b>。⚠ 智能体<b>自己不持证书</b>，依托宿主实例；<b>修改入口只在本页与「智能体软件管理」</b>（权威面唯一）。") +
    '<div class="card"><div class="card-b">' +
    '<div class="toolbar" style="margin-bottom:12px">' +
      '<div class="input-w"><input type="search" id="idaK" aria-label="搜索智能体实例" placeholder="搜索智能体软件 / 进程号 / 所在终端 / 凭据编号" style="width:300px" value="' + esc(IDAI.f.k) + '"><i aria-hidden="true">搜索</i></div>' +
      '<select id="idaSw" aria-label="按智能体软件筛选"><option value="">全部智能体软件</option>' + ID.asw.map(function (s) { return "<option value=\"" + s.id + "\"" + (IDAI.f.asw === s.id ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select>" +
      '<select id="idaTerm" aria-label="按所在终端筛选"><option value="">全部终端</option>' + ID.terms.map(function (t) { return "<option value=\"" + t.id + "\"" + (IDAI.f.term === t.id ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("") + "</select>" +
      /* ★ R20：筛选取值域须覆盖**派生输出全域** —— `idAgInSt` 还会产出「—」（无凭据 / 旧快照），
         此前不在下拉中 ⇒ 这类实例永远筛不出来，无法盘点。 */
      '<select id="idaSt" aria-label="按状态筛选"><option value="">全部状态</option>' + ["运行中", "已过期", "已吊销", "已终止", "—"].map(function (o) { return "<option value=\"" + esc(o) + "\"" + (IDAI.f.st === o ? " selected" : "") + ">" + (o === "—" ? "—（无凭据）" : esc(o)) + "</option>"; }).join("") + "</select>" +
    "</div>" +
    idTbl(["智能体软件", "所在终端", "宿主客户端实例", "短时凭据", "凭据有效期至", "进程号", "状态", "操作"],
      body || idEmptyRowF(8, "暂无智能体实例", "无匹配智能体实例", !!(IDAI.f.k || IDAI.f.asw || IDAI.f.st || IDAI.f.term), "idClearFAgIn"),
      /* R19（实测）：宿主客户端实例需 245px（原 191px ⇒ 折行）；按自然宽度重排。 */
      [null, "152px", "252px", "126px", "142px", "70px", "90px", "126px"]) +
    '<div class="lst-foot"><div id="idaPager" role="navigation" aria-label="智能体实例列表分页" style="flex:1"></div></div>' +
    '<div class="mini" style="margin-top:8px">短时凭据由 <b>AI 安全 agent 与服务端共同颁发</b>，<b>短时效</b>（演示中默认 30 分钟），到期须续发；凭据不落地、用毕即销毁。<b>状态按凭据有效期推导</b>：未到期 ⇒ 运行中，已到期 ⇒ 已过期（可续发）；已吊销为显式状态（短时凭据被吊销后立即失效，可续发）；已终止为显式状态，须重新登记。宿主必须是 <b>AI 安全 agent 的客户端实例</b>，终端随宿主派生。</div>' +
    "</div></div>";
}

/* ---------- 8. 统一渲染入口（bootstrap 调用） ---------- */
function idRerender() {
  if (document.getElementById("pg-iduser")) renderIdUser();
  else if (document.getElementById("pg-idterm")) renderIdTerm();
  else if (document.getElementById("pg-idcsw")) renderIdCSW();
  else if (document.getElementById("pg-idcin")) renderIdCIN();
  else if (document.getElementById("pg-idagsw")) renderIdAGSW();
  else if (document.getElementById("pg-idagin")) renderIdAGIN();
}
/* 跨页深链：goPage 是整页跳转（location.href），页内变量必然丢失 ⇒ 目标经查询参数承载。
   一次装载只施加一次（否则页内重渲染会把用户后续的筛选 / 返回操作覆盖掉），
   且只对**本页职责范围内且目标真实存在**的参数生效 —— 目标不存在则静默忽略，不伪造入口。 */
function idDeepLink(page) {
  if (window.__idDeepLink) return;
  window.__idDeepLink = true;
  var q = null;
  try { q = new URLSearchParams(location.search); } catch (e) { return; }
  var cur = q.get("cur") || "", inst = q.get("inst") || "", asw = q.get("asw") || "", term = q.get("term") || "";
  var has = function (arr, id) { return !!id && (arr || []).some(function (x) { return x.id === id; }); };
  if (page === "pg-iduser") {
    if (has(ID.users, cur)) IDU.cur = cur;
  } else if (page === "pg-idterm") {
    if (has(ID.cin, inst)) { var ci = idCinOf(inst); IDT.cur = ci.term; IDT.inst = inst; }
    else if (has(ID.terms, cur)) { IDT.cur = cur; IDT.inst = ""; }
  } else if (page === "pg-idcsw") {
    if (has(ID.csw, cur)) IDS.cur = cur;
  } else if (page === "pg-idcin") {
    if (has(ID.cin, cur)) IDC.cur = cur;
    else if (q.get("sw") && has(ID.csw, q.get("sw"))) IDC.f.sw = q.get("sw");
    /* ★ R21（I4）：深链可指定初始页签（如 licGoto 带 tab=t2 直达证书）。取值白名单，非法值忽略。 */
    var dt = q.get("tab") || "";
    if (dt === "t1" || dt === "t2" || dt === "t3") IDC.tab = dt;
  } else if (page === "pg-idagsw") {
    if (has(ID.asw, cur)) IDA.cur = cur;
  } else if (page === "pg-idagin") {
    if (has(ID.asw, asw)) IDAI.f.asw = asw;
    if (has(ID.terms, term)) IDAI.f.term = term;
  }
}
function renderIdUser()     { var el = document.getElementById("pg-iduser"); if (!el) return; if (!ID) idLoad(); idDeepLink("pg-iduser"); el.innerHTML = idUserPage(); idMountPagers(); }
function renderIdTerm()     { var el = document.getElementById("pg-idterm"); if (!el) return; if (!ID) idLoad(); idDeepLink("pg-idterm"); el.innerHTML = idTermPage(); idMountPagers(); }
function renderIdCSW()      { var el = document.getElementById("pg-idcsw"); if (!el) return; if (!ID) idLoad(); idDeepLink("pg-idcsw"); el.innerHTML = idSwPage(); idMountPagers(); }
function renderIdCIN()      { var el = document.getElementById("pg-idcin"); if (!el) return; if (!ID) idLoad(); idDeepLink("pg-idcin"); el.innerHTML = idCinPage(); idMountPagers(); }
function renderIdAGSW()     { var el = document.getElementById("pg-idagsw"); if (!el) return; if (!ID) idLoad(); idDeepLink("pg-idagsw"); el.innerHTML = idAgSwPage(); idMountPagers(); }
function renderIdAGIN()     { var el = document.getElementById("pg-idagin"); if (!el) return; if (!ID) idLoad(); idDeepLink("pg-idagin"); el.innerHTML = idAgInPage(); idMountPagers(); }

/* ---------- 9. 交互（委托挂在页容器上，与身份适配页签同约定） ---------- */
function idOnClick(e) {
  var t = e.target && e.target.closest ? e.target.closest("[data-idact]") : null;
  if (!t) return;
  var act = t.getAttribute("data-idact");
  var id = t.getAttribute("data-id") || "";
  var rerender = idRerender;
  switch (act) {
    /* 详情页 TAB：只切显隐、不重渲染；切换态存回模块状态 ⇒ 重渲染（如改完一项回来）仍停在原分区 */
    case "idTab": {
      var nav = t.getAttribute("data-nav") || "", tk = t.getAttribute("data-t") || "";
      idTabShow(nav, tk);
      if (nav === "idTermTabs") IDT.tab = tk;
      else if (nav === "idSwTabs") IDS.tab = tk;
      else if (nav === "idCinTabs") IDC.tab = tk;
      break;
    }
    /* 用户管理 */
    case "userView": IDU.cur = id; rerender(); break;
    case "userBack": IDU.cur = ""; rerender(); break;
    case "userToggle": {
      var u = ID.users.filter(function (x) { return x.id === id; })[0]; if (!u) break;
      if (u.st === "已锁定") {
        idAskEff("解锁用户",
          "将解锁用户 <b>" + esc(u.name) + "</b>（当前 <b>已锁定</b>，连续登录失败 <b>" + (u.fail || 0) + "</b> 次）。解锁后该用户<b>可重新登录</b>；锁定是连续输错密码达设定次数后的<b>自动处置</b>，解锁须管理员手工执行。<b>本次变更入审计</b>。",
          function () { u.st = "已启用"; u.fail = 0; idSave(); rerender(); toast("已解锁（演示）"); });
        break;
      }
      var to = u.st === "已启用" ? "已禁用" : "已启用";
      idAskEff(to === "已禁用" ? "禁用用户" : "启用用户",
        "将把用户 <b>" + esc(u.name) + "</b> 置为 <b>" + to + "</b>。" + (to === "已禁用" ? "该用户<b>无法登录</b>，正在使用系统的会话将被<b>强制下线</b>。" : "该用户<b>即刻可登录</b>，可使用的终端仍受绑定关系约束。") + "<b>本次变更入审计</b>。",
        function () { u.st = to; idSave(); rerender(); toast("已" + to.slice(1) + "（演示）"); });
      break;
    }
    case "userEdit": {
      var u2 = ID.users.filter(function (x) { return x.id === id; })[0]; if (!u2) break;
      var oldName = u2.name, oldRole = u2.role;
      openDlg("编辑用户", "修改用户基础信息与角色。⚠ 三个管理角色（系统 / 安全 / 审计管理员）<b>两两互斥</b>，不可同时赋予。手机号用于首次登录短信验证与账号找回。<b>账号</b>为登录标识，创建后不可修改。",
        '<div class="fld"><label>姓名 <span class="req">*</span></label><input id="idufName" value="' + esc(u2.name) + '"></div>' +
        '<div class="fld" style="margin-top:10px"><label>手机号 <span class="req">*</span></label><input id="idufPhone" value="' + esc(u2.phone || "") + '" placeholder="11 位手机号"></div>' +
        '<div class="fld" style="margin-top:10px"><label>归属组织</label>' + idOrgSelect("idufOrg", u2.org, "未分配组织") + "</div>" +
        '<div class="fld" style="margin-top:10px"><label>角色</label><select id="idufRole">' +
          ["操作员", "系统管理员", "安全管理员", "审计管理员"].map(function (r) { return "<option" + (u2.role === r ? " selected" : "") + ">" + r + "</option>"; }).join("") + "</select></div>");
      $("#dlg1Ok").onclick = function () {
        var nm = ($("#idufName").value || "").trim(), ph = ($("#idufPhone").value || "").trim();
        var og = ($("#idufOrg").value || "").trim(), nr = $("#idufRole").value;
        if (!nm) { markBad($("#idufName"), true); toast("请填写姓名"); return; }
        if (!/^1[3-9]\d{9}$/.test(ph)) { markBad($("#idufPhone"), true); toast("请填写 11 位有效手机号"); return; }
        if (ID.users.some(function (x) { return x.id !== u2.id && x.name === nm; })) { markBad($("#idufName"), true); toast("姓名已存在"); return; }
        var apply = function () {
          u2.name = nm; u2.phone = ph; u2.org = og || "未分配组织"; u2.role = nr;
          /* 改名级联：终端归属按 ownerId 关联，展示名随动 —— 否则用户改名后终端侧仍显示旧名、归属判定失配。 */
          if (nm !== oldName) {
            ID.terms.forEach(function (tm) {
              if (tm.ownerId === u2.id || (!tm.ownerId && tm.owner === oldName)) { tm.ownerId = u2.id; tm.owner = nm; }
            });
            /* 注册申请按姓名存归属人（apps.owner）⇒ 改名须一并回填：否则审核弹窗仍显示旧名，
               且通过时 idUserByName(p.owner) 落空、建成一个无归属终端。 */
            (ID.apps || []).forEach(function (p) { if (p.owner === oldName) p.owner = nm; });
            /* ★ R53（E-F9）：**跨模块按姓名存的下游一并回填** —— 本模块此前只级联模块内两处，
               资产侧负责人（含资源 / 路径级）、认证侧强认证器、DP「操作身份」、凭据托管「用户自管」
               持有人四处仍持旧名 ⇒ 同一个人在不同模块呈现两套姓名称谓，跨模块按姓名 join 全部失配。
               ⚠ 只回填**当前态引用**；审批 / 事件流的 by·approver 属**审计留痕**，不追溯改写历史。
               四段均为后续段、运行期可达（本函数在点击时执行）；缺段时静默跳过，不阻断本模块。 */
            try {
              (typeof ASSETS !== "undefined" && ASSETS ? ASSETS : []).forEach(function (a) {
                if (!a) return;
                if (a.owner === oldName) a.owner = nm;
                (a.res || []).forEach(function (r) {
                  ((r || {}).paths || []).forEach(function (p) { if (p && p.owner === oldName) p.owner = nm; });
                });
              });
            } catch (e) { /* 资产段不可用：不阻断本模块 */ }
            try {
              var _auBack = function () {
                (AU.authr || []).forEach(function (r) { if (r && r.user === oldName) r.user = nm; });
                ((AU.uc || {}).items || []).forEach(function (x) { if (x && x.owner === oldName) x.owner = nm; });
                if (typeof auSave === "function") auSave();
              };
              if (typeof AU === "undefined" || !AU) { if (typeof auLoad === "function") auLoad(); }
              if (typeof AU !== "undefined" && AU) _auBack();
            } catch (e) { /* 认证数据不可用：不阻断本模块 */ }
            try {
              if (typeof DP_ACTORS !== "undefined" && Array.isArray(DP_ACTORS)) {
                DP_ACTORS.forEach(function (v, i) { if (v === oldName) DP_ACTORS[i] = nm; });
              }
            } catch (e) { /* DP 段不可用：不阻断本模块 */ }
          }
          idSave(); closeDlg(); rerender(); toast("已保存（演示）");
        };
        /* 角色变更＝权限范围变更（生效面）⇒ 二次认证；仅改基础信息按普通保存处理。 */
        if (nr !== oldRole) {
          idAskEff("变更用户角色",
            "将把 <b>" + esc(nm) + "</b> 的角色由 <b>" + esc(oldRole) + "</b> 变更为 <b>" + esc(nr) + "</b>。" +
            (["系统管理员", "安全管理员", "审计管理员"].indexOf(nr) >= 0 || ["系统管理员", "安全管理员", "审计管理员"].indexOf(oldRole) >= 0
              ? "三个管理角色<b>两两互斥</b>；变更后该用户<b>立刻按新角色授权</b>（含管理面可见范围）。" : "") + "<b>本次变更入审计</b>。", apply);
        } else apply();
      };
      break;
    }
    /* ★ R61（轮7）：六张列表的空态「清空筛选条件」出口（逐键置空，不换对象，避免外部持有的引用失效） */
    case "idClearFUser": IDU.f.k = ""; IDU.f.org = ""; IDU.f.role = ""; IDU.f.st = ""; IDU.pg = 1; rerender(); toast("已清空筛选条件"); break;
    case "idClearFTerm": IDT.f.k = ""; IDT.f.org = ""; IDT.f.st = ""; IDT.f.online = ""; IDT.f.regFrom = ""; IDT.f.regTo = ""; IDT.pg = 1; rerender(); toast("已清空筛选条件"); break;
    case "idClearFSw":   IDS.f.k = ""; IDS.f.agent = ""; IDS.f.os = ""; IDS.pg = 1; rerender(); toast("已清空筛选条件"); break;
    case "idClearFCin":  IDC.f.k = ""; IDC.f.sw = ""; IDC.f.st = ""; IDC.pg = 1; rerender(); toast("已清空筛选条件"); break;
    case "idClearFAg":   IDA.f.k = ""; IDA.f.st = ""; IDA.pg = 1; rerender(); toast("已清空筛选条件"); break;
    case "idClearFAgIn": IDAI.f.k = ""; IDAI.f.asw = ""; IDAI.f.st = ""; IDAI.f.term = ""; IDAI.pg = 1; rerender(); toast("已清空筛选条件"); break;
    case "userNew": {
      openDlg("新建用户", "创建单个用户。批量导入的用户<b>无初始密码</b>，首次登录须经手机短信验证后自助设置密码。",
        '<div class="fld"><label>姓名 <span class="req">*</span></label><input id="idunName" maxlength="32" placeholder="如 赵敏"></div>' +
        '<div class="fld" style="margin-top:10px"><label>账号 <span class="req">*</span></label><input id="idunAcct" maxlength="32" placeholder="如 zhaomin"></div>' +
        '<div class="fld" style="margin-top:10px"><label>手机号 <span class="req">*</span></label><input id="idunPhone" maxlength="11" placeholder="11 位手机号（首次登录短信验证用）"></div>' +
        '<div class="fld" style="margin-top:10px"><label>归属组织</label>' + idOrgSelect("idunOrg", "", "未分配组织") + "</div>" +
        '<div class="fld" style="margin-top:10px"><label>角色</label><select id="idunRole"><option>操作员</option><option>系统管理员</option><option>安全管理员</option><option>审计管理员</option></select></div>');
      $("#dlg1Ok").onclick = function () {
        var nm = ($("#idunName").value || "").trim();
        var ph = ($("#idunPhone").value || "").trim();
        var ac = ($("#idunAcct").value || "").trim();
        if (!nm) { markBad($("#idunName"), true); toast("请填写姓名"); return; }
        if (!/^[A-Za-z][A-Za-z0-9_.-]{2,31}$/.test(ac)) { markBad($("#idunAcct"), true); toast("账号须为 3~32 位、以字母开头（字母 / 数字 / _ . -）"); return; } if (ID.users.some(function (x) { return x.acct === ac; })) { markBad($("#idunAcct"), true); toast("账号已存在"); return; }
        if (!/^1[3-9]\d{9}$/.test(ph)) { markBad($("#idunPhone"), true); toast("请填写 11 位有效手机号"); return; }
        ID.users.unshift({ id: "u_" + Date.now(), name: nm, acct: ac, org: ($("#idunOrg").value || "").trim() || "未分配组织", role: $("#idunRole").value, st: "已启用", phone: ph, fail: 0, bound: [], allow: [] });
        idSave(); closeDlg(); IDU.cur = ""; IDU.pg = 1; rerender(); toast("已创建（演示）");
      };
      break;
    }
    case "userImport":
      openDlg("Excel 批量导入", "导入的用户<b>无初始密码</b>，首次登录须<b>通过手机短信验证后自助设置密码</b>；导入结果与失败明细可下载。",
        '<div class="fld"><label>选择文件</label><input type="file" id="iduFile" accept=".xlsx,.xls"></div>' +
        '<div class="help" style="margin-top:8px">演示环境不实际解析文件；模板列：姓名 / 账号 / 手机号 / 归属组织 / 角色。</div>');
      $("#dlg1Ok").onclick = function () { closeDlg(); toast("已导入 0 条（演示环境不解析文件）"); };
      break;
    case "userReset":
      idAskEff("重置密码", "将重置该用户密码，用户下次登录须<b>重新设置</b>（重置后的临时凭据由用户自助设置阶段替换）。该动作即刻生效并<b>入审计</b>。", function () { toast("已重置密码（演示环境不落凭据状态）"); });
      break;
    case "bindTerm": {
      var bu = ID.users.filter(function (x) { return x.id === id; })[0]; if (!bu) break;
      var opts = ID.terms.filter(function (t) { return (bu.bound || []).indexOf(t.id) < 0 && t.st !== "已注销"; });
      openDlg("绑定终端", "为 <b>" + esc(bu.name) + "</b> 绑定终端（关系表为唯一权威面，终端侧同步可见）。绑定即同时获得<b>归属</b>与<b>使用权限</b>。",
        '<div class="fld"><label>选择终端</label><select id="iduBind">' +
          (opts.length ? opts.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + "（当前归属 " + esc(t.owner) + "）</option>"; }).join("") : '<option value="">（暂无可绑定终端）</option>') + "</select></div>" +
        (opts.length ? "" : '<div class="help" style="margin-top:8px">可绑定终端为空：本用户已归属全部在册终端。</div>'));
      $("#dlg1Ok").onclick = function () {
        var sel = $("#iduBind"); if (!sel || !sel.value) { closeDlg(); toast("暂无可绑定终端"); return; }
        var tt = ID.terms.filter(function (x) { return x.id === sel.value; })[0];
        idAskEff("绑定终端",
          "将把终端 <b>" + esc(tt.name) + "</b> 绑定到 <b>" + esc(bu.name) + "</b>：该用户同时成为其<b>归属用户</b>并取得<b>使用权限</b>；终端侧归属随之变更。<b>本次变更入审计</b>。",
          function () {
            var prev = idUserOf(tt);
            if (prev && prev.id !== bu.id) idBindWrite(prev, tt.id, true);
            idBindWrite(bu, tt.id);
            tt.ownerId = bu.id; tt.owner = bu.name;
            idSave(); closeDlg(); rerender(); toast("已绑定（演示）");
          });
      };
      break;
    }
    case "unbind": {
      var tu = ID.users.filter(function (x) { return x.id === id; })[0];
      var tid = t.getAttribute("data-t"); if (!tu || !tid) break;
      var tm2 = ID.terms.filter(function (x) { return x.id === tid; })[0] || {};
      idAskEff("解除授权", "将解除 <b>" + esc(tu.name) + "</b> 对终端 <b>" + esc(tm2.name || "") + "</b> 的<b>使用权限</b>（终端<b>归属不变</b>，仍属其归属用户）。<b>本次变更入审计</b>。",
        function () {
          tu.allow = (tu.allow || []).filter(function (x) { return x !== tid; });
          idSave(); rerender(); toast("已解除授权（演示）");
        });
      break;
    }
    case "unbindOwn": {
      var ou = ID.users.filter(function (x) { return x.id === id; })[0];
      var oid = t.getAttribute("data-t"); if (!ou || !oid) break;
      var ot = ID.terms.filter(function (x) { return x.id === oid; })[0] || {};
      idAskEff("解除归属", "将解除 <b>" + esc(ou.name) + "</b> 与终端 <b>" + esc(ot.name || "") + "</b> 的<b>归属关系</b>（同时收回其使用权限）。终端将变为<b>无归属</b>，须重新指定归属用户后方可由新用户使用。<b>本次变更入审计</b>。",
        function () {
          idBindWrite(ou, oid, true);
          ot.ownerId = ""; ot.owner = "（未指定）";
          idSave(); rerender(); toast("已解除归属（演示）");
        });
      break;
    }
    /* 终端管理 */
    case "termView": IDT.cur = id; IDT.inst = ""; IDT.tab = "t1"; rerender(); break;
    case "termList": IDT.cur = ""; IDT.inst = ""; rerender(); break;
    case "instLic": IDT.inst = id; rerender(); break;
    case "termBack": IDT.inst = ""; IDT.cur = id; rerender(); break;
    case "termApply": idOpenApply(); break;
    case "termDisable": {
      var tm = ID.terms.filter(function (x) { return x.id === id; })[0]; if (!tm) break;
      /* 只允许「已激活 ↔ 已禁用」互转：终态（已注销）与未激活不得被 toggle 复活
         （UI 上不渲染该按钮，此为程序化 / 异常触发的防御）。 */
      if (tm.st !== "已激活" && tm.st !== "已禁用") { toast("该终端当前为「" + tm.st + "」，不可启停"); break; }
      var nst = tm.st === "已禁用" ? "已激活" : "已禁用";
      idAskEff(nst === "已禁用" ? "禁用终端" : "激活终端",
        "将把终端 <b>" + esc(tm.name) + "</b> 置为 <b>" + nst + "</b>。" + (nst === "已禁用" ? "该终端<b>无法登录</b>，在线用户将被<b>强制下线</b>（适用设备丢失或离职），其上的客户端实例<b>不参与隧道建立</b>。" : "激活后该终端<b>即刻恢复登录能力</b>。") + "<b>本次变更入审计</b>。",
        function () { tm.st = nst; if (nst === "已禁用") { tm.online = "离线"; (ID.cin || []).forEach(function (c) { if (c.term === tm.id) c.online = "离线"; }); } idSave(); rerender(); toast("已" + nst.slice(1) + "（演示）"); });
      break;
    }
    case "termLogout":
      idAskEff("注销终端", "注销后该终端<b>需重新注册</b>才能使用（适用设备更换或重装系统）；其上的客户端实例<b>一并置为已卸载</b>、智能体实例<b>一并终止</b>，绑定关系<b>同时解除</b>。历史使用记录与审核记录<b>保留可追溯</b>。<b>此操作入审计</b>。", function () {
        var tm = ID.terms.filter(function (x) { return x.id === id; })[0]; if (tm) { tm.st = "已注销"; tm.online = "离线"; tm.ownerId = ""; tm.owner = "（未指定）"; } (ID.cin || []).forEach(function (c) { if (c.term === id) { c.st = "已卸载"; c.online = "离线"; } }); (ID.ain || []).forEach(function (a) { if (a.term === id) a.st = "已终止"; });
        ID.users.forEach(function (u) { idBindWrite(u, id, true); });
        idSave(); IDT.cur = ""; IDT.inst = ""; rerender(); toast("已注销（演示）");
      });
      break;
    case "termOwn": {
      var to2 = ID.terms.filter(function (x) { return x.id === id; })[0]; if (!to2) break;
      /* ★ R21（I3）：候选过滤只约束「可选性」，不约束「已在位的事实」——
         此前把「禁用 / 锁定」用户整列滤掉，若终端**现任归属**恰是这类用户，现任就不在候选里
         ⇒ `<select>` 的 selected 落空、默认停在「（不指定归属）」，不改任何字段点确定即**静默清空归属**。 */
      var toCand = ID.users.filter(function (u) { return (u.st !== "已禁用" && u.st !== "已锁定") || u.id === to2.ownerId; });
      openDlg("变更归属用户", "终端的<b>归属用户</b>是绑定关系的权威处之一（另一处是「用户管理」的用户详情）。变更归属会<b>同时变更使用权限</b>。",
        '<div class="fld"><label>归属用户</label><select id="tmoUser"><option value="">（不指定归属）</option>' +
          toCand.map(function (u) { var dis = (u.st === "已禁用" || u.st === "已锁定"); return '<option value="' + u.id + '"' + (to2.ownerId === u.id ? " selected" : "") + (dis ? " disabled" : "") + ">" + esc(u.name) + "（" + esc(u.acct) + " · " + esc(u.org) + (dis ? " · " + esc(u.st) + "（现任）" : "") + "）</option>"; }).join("") + "</select></div>" +
        '<div class="help" style="margin-top:8px">可选<b>非禁用</b>用户；现任归属若处于<b>禁用 / 锁定</b>态，仍保留在候选并标注，便于识别 —— 不改该项直接确定<b>不会清空归属</b>。</div>');
      $("#dlg1Ok").onclick = function () {
        var nid = $("#tmoUser").value;
        var nu = nid ? ID.users.filter(function (x) { return x.id === nid; })[0] : null;
        if (nid && !nu) { closeDlg(); return; }
        var prev = idUserOf(to2);
        idAskEff("变更终端归属",
          "终端 <b>" + esc(to2.name) + "</b> 的归属将由 <b>" + esc(prev ? prev.name : "（未指定）") + "</b> 变更为 <b>" + esc(nu ? nu.name : "（未指定）") + "</b>；原归属用户对该终端的<b>归属与使用权限一并收回</b>，新归属用户<b>即刻获得</b>。<b>本次变更入审计</b>。",
          function () {
            if (prev && (!nu || prev.id !== nu.id)) idBindWrite(prev, to2.id, true);
            if (nu) { idBindWrite(nu, to2.id); to2.ownerId = nu.id; to2.owner = nu.name; }
            else { to2.ownerId = ""; to2.owner = "（未指定）"; }
            idSave(); closeDlg(); rerender(); toast("已变更归属（演示）");
          });
      };
      break;
    }
    case "termEdit": {
      var te = ID.terms.filter(function (x) { return x.id === id; })[0]; if (!te) break;
      openDlg("编辑终端", "修改终端归属组织与备注。归属用户请走「变更归属用户」（涉及使用权限变更，需二次认证）。<b>终端类型 / 操作系统</b>由客户端注册时上报、<b>注册方式</b>为注册时的历史记录，均不可修改。",
        '<div class="fld"><label>归属组织</label>' + idOrgSelect("idtOrgE", te.org) + "</div>" +
        '<div class="fld" style="margin-top:10px"><label>备注</label><input id="idtNote" value="' + esc(te.note || "") + '" placeholder="如 设备来源 / 使用场景"></div>');
      $("#dlg1Ok").onclick = function () {
        te.org = ($("#idtOrgE").value || "").trim() || te.org;
        te.note = ($("#idtNote").value || "").trim();
        idSave(); closeDlg(); rerender(); toast("已保存（演示）");
      };
      break;
    }
    case "termNew": {
      openDlg("新增终端", "终端是<b>宿主侧入口</b>，串联客户端实例与智能体实例两条线。<b>设备指纹与 MAC 由客户端在注册时上报</b>，此处录入的是台账信息。新增后终端为<b>未激活</b>，须经注册审核转为已激活。",
        '<div class="fld"><label>终端名称 <span class="req">*</span></label><input id="ntmName" placeholder="如 信贷管理部-王芳-PC"></div>' +
        '<div class="fld" style="margin-top:10px"><label>终端类型</label><select id="ntmType">' +
          ["桌面终端", "笔记本", "服务器终端"].map(function (o) { return "<option>" + o + "</option>"; }).join("") + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>归属用户 <span class="req">*</span></label><select id="ntmOwner">' +
          (ID.users.some(function (u) { return u.st !== "已禁用" && u.st !== "已锁定"; })
            ? ID.users.filter(function (u) { return u.st !== "已禁用" && u.st !== "已锁定"; }).map(function (u) { return '<option value="' + u.id + '">' + esc(u.name) + "（" + esc(u.org) + "）</option>"; }).join("")
            : '<option value="">（暂无可用用户）</option>') + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>归属组织</label><input id="ntmOrg" placeholder="如 信贷管理部"></div>' +
        '<div class="fld" style="margin-top:10px"><label>终端序列号 <span class="req">*</span></label><input id="ntmSn" placeholder="如 PC1D8E44A0F22C93"></div>' +
        '<div class="fld" style="margin-top:10px"><label>操作系统</label><input id="ntmOs" placeholder="如 Windows 11 专业版"></div>' +
        '<div class="fld" style="margin-top:10px"><label>注册方式</label><select id="ntmReg">' +
          ["在线注册 · 管理员审核", "在线注册 · 自动审核", "离线注册 · 管理员审核"].map(function (o) { return "<option>" + o + "</option>"; }).join("") + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>备注</label><input id="ntmNote" placeholder="如 设备来源 / 使用场景"></div>');
      $("#dlg1Ok").onclick = function () {
        var nm = ($("#ntmName").value || "").trim();
        var sn = ($("#ntmSn").value || "").trim();
        if (!nm) { markBad($("#ntmName"), true); toast("请填写终端名称"); return; }
        /* ★ R61·轮12：先校验**归属用户**（视觉第 3 位）再校验**终端序列号**（视觉第 5 位）—— 与表单呈现次序一致。 */
        var ou = ID.users.filter(function (x) { return x.id === $("#ntmOwner").value; })[0];
        if (!ou) { markBad($("#ntmOwner"), true); toast("请先在「用户管理」创建可用用户，再新增终端"); return; }
        if (!sn) { markBad($("#ntmSn"), true); toast("请填写终端序列号"); return; }
        if (ID.terms.some(function (x) { return x.sn === sn; })) { markBad($("#ntmSn"), true); toast("该硬件序列号已登记"); return; }
        var tid2 = "t_" + Date.now();
        ID.terms.unshift({
          id: tid2, name: nm, sn: sn, mac: "", fp: "", os: ($("#ntmOs").value || "").trim() || "—",
          type: $("#ntmType").value, owner: ou ? ou.name : "（未指定）", ownerId: ou ? ou.id : "",
          org: ($("#ntmOrg").value || "").trim() || (ou ? ou.org : "—"),
          st: "未激活", online: "离线", reg: ID_NOW, regway: $("#ntmReg").value, note: ($("#ntmNote").value || "").trim()
        });
        /* 归属写入关系表：新增终端即刻反映到用户侧，避免两侧数据打架。 */
        if (ou) idBindWrite(ou, tid2);
        /* ★ R21（I2）：新建项 unshift 在表首 ⇒ 必须复位分页，否则停在第 N 页新建后「看不到新建的那条」。 */
        IDT.pg = 1; idSave(); closeDlg(); rerender(); toast("已新增（未激活，待注册审核）（演示）");
      };
      break;
    }
    /* 客户端软件管理 */
    case "swView": IDS.cur = id; IDS.tab = "t1"; rerender(); break;
    case "swList": IDS.cur = ""; rerender(); break;
    case "swGoto": goPage("pg-idcsw", { cur: id }); break;
    case "swToCin": goPage("pg-idcin", { sw: id }); break;
    case "termGoto": goPage("pg-idterm", { cur: id }); break;
    /* 跨页定位用户：身份模块 6 页中「用户」此前是唯一无任何发出端的对象，
       而终端详情正展示其归属用户 ⇒ 补此入口闭合 pg-iduser 的 `?cur=` 深链。 */
    case "userGoto": goPage("pg-iduser", { cur: id }); break;
    case "swAmeth": {
      /* 客户端软件可用的认证方式（有端侧登记面）。
         与认证源页的「无端支持」标签共同构成「该方式在当前接入形态下能否用」的完整答案。
         约束：至少保留一种 —— 全清空会使该软件无法建立会话，属误操作。 */
      var sw0 = ID.csw.filter(function (x) { return x.id === IDS.cur; })[0]; if (!sw0) break;
      var mk = t.getAttribute("data-k"); if (!mk) break;
      var box = (t.tagName === "INPUT") ? t : (t.querySelector ? t.querySelector("input") : null);
      var arr = sw0.ameth || (sw0.ameth = []);
      var at0 = arr.indexOf(mk);
      if (at0 >= 0) {
        if (arr.length <= 1) { if (box) box.checked = true; markBad(t, true); toast("至少保留一种认证方式"); break; }
        if (box) box.checked = true;   /* 先回滚控件：二次认证取消无回调，不能把控件留在已勾选态 */
        idAskEff("禁用认证方式",
          "禁用后 <b>" + esc(idSWName(mk)) + "</b> 不再作为该客户端可用的认证方式：<b>登录与追加认证时不再下发该选项</b>；已按该方式登记过凭据的用户按 <b>fail-closed</b> 处置（策略要求而该软件不承载时拒绝，不静默回退到低级别方式）。<b>本次变更入审计</b>。",
          function () {
            var a2 = sw0.ameth.indexOf(mk); if (a2 >= 0) sw0.ameth.splice(a2, 1);
            idSave(); rerender(); toast("已禁用 " + idSWName(mk) + "（演示）");
          });
      } else {
        if (box) box.checked = false;
        idAskEff("启用认证方式",
          "启用后 <b>" + esc(idSWName(mk)) + "</b> 成为该客户端可用的认证方式：<b>登录与追加认证时按策略下发该选项</b>（实际是否下发还受「认证源登记」与资产访问策略约束）。<b>本次变更入审计</b>。",
          function () {
            if (sw0.ameth.indexOf(mk) < 0) sw0.ameth.push(mk);
            idSave(); rerender(); toast("已启用 " + idSWName(mk) + "（演示）");
          });
      }
      break;
    }
    case "swOsAdd": {
      /* 行式版本编辑器的增行 —— 先收当前行（含未保存的输入），再追加一行空行重渲染。
         不整窗重开：编辑窗内重开会丢掉其余字段的未保存输入。 */
      var clsA = t.getAttribute("data-cls") || "e";
      var rowsA = idSwVerCollect(clsA);
      rowsA.push({ os: "Windows", ver: "", size: "", sha256: "", sig: ID_SIG_DEF[0], pub: true });
      $("#swOsver").innerHTML = idSwVerRows(rowsA, clsA);
      break;
    }
    case "swOsDel": {
      var clsD = t.getAttribute("data-cls") || "e";
      var iD = parseInt(t.getAttribute("data-i"), 10) || 0;
      var rowsD = idSwVerCollect(clsD);
      if (rowsD.length <= 1) { toast("至少保留一个操作系统版本"); break; }
      rowsD.splice(iD, 1);
      $("#swOsver").innerHTML = idSwVerRows(rowsD, clsD);
      break;
    }
    case "swVerPub": {
      /* 版本发布状态 —— 改的是「该版本能否下载 / 参与升级提示」，属客户端生效面。
         手册 §4.7.5：已有客户端注册成功的版本不可取消发布。 */
      var psw = ID.csw.filter(function (x) { return x.id === id; })[0]; if (!psw) break;
      var pOs = t.getAttribute("data-os") || "", pVer = t.getAttribute("data-ver") || "";
      var prow = (psw.osver || []).filter(function (r) { return r.os === pOs && r.ver === pVer; })[0];
      if (!prow) break;
      if (prow.pub) {
        var nuse = idSwVerUseCount(psw, pOs, pVer);
        if (nuse > 0) { toast(pOs + " · " + pVer + " 已有 " + nuse + " 个客户端实例在用，不可取消发布"); break; }
        idAskEff("取消发布版本",
          "将取消发布 <b>" + esc(pOs) + " · " + esc(pVer) + "</b>。取消发布后该版本<b>不可下载、不参与升级提示</b>；已在用的客户端<b>不受影响</b>（仅不再作为新安装来源）。<b>本次变更入审计</b>。",
          function () { prow.pub = false; idSave(); idRerender(); toast("已取消发布（演示）"); });
      } else {
        idAskEff("发布版本",
          "将发布 <b>" + esc(pOs) + " · " + esc(pVer) + "</b>。发布后该版本<b>可下载</b>并<b>参与升级提示</b>（客户端检测到当前版本低于默认版本时提示升级，手册 §4.7.5）；可下载前须通过<b>版本签名校验</b>。<b>本次变更入审计</b>。",
          function () { prow.pub = true; idSave(); idRerender(); toast("已发布（演示）"); });
      }
      break;
    }
    case "swEdit": {
      var sw = ID.csw.filter(function (x) { return x.id === id; })[0]; if (!sw) break;
      /* R17：编辑弹窗已瘦身 —— 只留**登记口径**基础信息（软件名称 / 注册方式）。
         重配置项拆为详情页独立入口：客户端策略与授权（swPolicyEdit）、版本与校验码（swVerVsig / swVerAdd）。
         新建弹窗（swNew）仍为完整表单 —— 创建时一次性登记是合理的，编辑时逐块改才需要拆。 */
      openDlg("编辑基础信息", "登记口径信息。<b>客户端策略与授权</b>（证书签发机制 / 客户端绑定与静默登录 / 可访问资产）与<b>版本与校验码</b>已拆为详情页的独立入口。",
        '<div class="fld"><label>软件名称</label><input id="idswName" value="' + esc(sw.name) + '"></div>' +
        '<div class="fld" style="margin-top:10px"><label>注册方式与审核方式</label><select id="idswReg">' +
          ["在线注册 · 管理员审核", "在线注册 · 自动审核", "离线注册 · 管理员审核"].map(function (o) { return "<option" + (sw.regway === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select>" +
          '<div class="help" style="margin-top:6px">注册方式属<b>登记口径</b>（不改变当前可用面）⇒ 随保存生效，用户注册时<b>自动遵循</b>；软件名称是<b>标识</b>，改名不改变客户端生效面。</div></div>');
      $("#dlg1Ok").onclick = function () {
        /* 基础信息 = 登记口径（名称 / 注册方式）⇒ 不改变客户端生效面 ⇒ 无需二次认证。 */
        sw.name = ($("#idswName").value || "").trim() || sw.name;
        sw.regway = $("#idswReg").value;
        idSave(); closeDlg(); idRerender(); toast("已保存（演示）");
      };
      break;
    }
    case "swPolicyEdit": {
      /* 客户端策略与授权（R17 从编辑弹窗拆出）—— 证书签发机制 / 客户端绑定与静默登录 / 可访问资产。
         三项均改变**客户端生效面** ⇒ 任一变更走二次认证（判据是「是否改变生效面」，不是动作名）。 */
      var psw = ID.csw.filter(function (x) { return x.id === id; })[0]; if (!psw) break;
      openDlg("客户端策略与授权", "<b>" + esc(psw.name) + "</b> 的软件级策略与授权。三项均改变<b>客户端生效面</b>，变更走<b>二次认证</b>。",
        '<div class="fld"><label>证书签发机制</label><select id="idswCert">' +
          ["自有证书", "CA 机构签发"].map(function (o) { return "<option" + (psw.cert === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select>" +
          '<div class="help" style="margin-top:6px">软件级<b>策略选择</b>，<b>不是为某个客户端签发证书</b> —— 与实例级 License 证书的签发 / 轮换是两回事。仅影响此后新签 / 轮换的证书，<b>存量不追溯重签</b>。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label>客户端绑定与静默登录</label><select id="idswBind">' +
          [["1", "已开启（静默登录有效期默认 30 天）"], ["0", "未开启"]].map(function (o) { return "<option value=\"" + o[0] + "\"" + ((psw.bind ? "1" : "0") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
          '<div class="help" style="margin-top:6px">开启后客户端与终端<b>绑定</b>并可静默登录（有效期取客户端证书有效期，默认 30 天）；绑定关系变化将<b>自动通知管理员</b>。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label>可访问资产</label><div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">' +
          ID_ASSET_DEF().map(function (a) { return '<label class="mini" style="display:flex;align-items:center;gap:4px"><input type="checkbox" class="sw-asset" value="' + esc(a) + '"' + ((psw.assets || []).indexOf(a) >= 0 ? " checked" : "") + ">" + esc(a) + "</label>"; }).join("") + "</div>" +
          '<div class="help" style="margin-top:6px">取自管理员维护的「资产列表」（只读引用）。此处限定<b>客户端侧可见范围</b>；用户最终能否访问还取决于该资产自身的<b>访问策略</b>。</div></div>');
      $("#dlg1Ok").onclick = function () {
        var pCert = $("#idswCert").value, pBind = $("#idswBind").value === "1";
        var pAssets = Array.prototype.slice.call(document.querySelectorAll(".sw-asset")).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
        var pChanged = (pCert !== psw.cert) || (pBind !== psw.bind) ||
          pAssets.slice().sort().join("|") !== (psw.assets || []).slice().sort().join("|");
        var pApply = function () {
          psw.cert = pCert; psw.bind = pBind; psw.assets = pAssets;
          idSave(); closeDlg(); idRerender(); toast("已保存（演示）");
        };
        if (!pChanged) { pApply(); return; }
        idAskEff("变更客户端策略与授权",
          "将变更 <b>" + esc(psw.name) + "</b> 的<b>证书签发机制 / 客户端绑定与静默登录 / 可访问资产</b> —— 均属<b>客户端生效面</b>：证书机制仅影响此后新签 / 轮换的证书（存量不追溯重签）；可访问资产收窄后<b>用户即使有该资产权限也无法访问</b>；绑定关系变化将<b>自动通知管理员</b>。<b>本次变更入审计</b>。",
          pApply);
      };
      break;
    }
    case "swVerVsig": {
      /* 版本签名校验（**单值 · 生效面策略**）—— R19 从「版本与校验码」总弹窗拆出：
         一个弹窗只承担一类语义（策略 vs 台账），「改的是哪一项、要不要认证」才说得清（R17 判据）。 */
      var wsw = ID.csw.filter(function (x) { return x.id === id; })[0]; if (!wsw) break;
      openDlg("版本签名校验", "<b>" + esc(wsw.name) + "</b> 的版本签名校验策略：策略含<b>哈希值校验</b>则 SHA256 校验码必填；含<b>客户端签名校验</b>则签名必填。",
        '<div class="fld"><label>版本签名校验</label><select id="idswVsig">' +
          ["哈希值校验", "客户端签名校验", "哈希值校验 + 客户端签名校验"].map(function (o) { return "<option" + (wsw.vsig === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" +
          '<div class="help" style="margin-top:6px">任一校验不通过，客户端<b>不得与网关建立通信</b>（手册 §4.6.5）。</div></div>');
      $("#dlg1Ok").onclick = function () {
        var wv = $("#idswVsig").value;
        var wApply = function () { wsw.vsig = wv; idSave(); closeDlg(); idRerender(); toast("已保存（演示）"); };
        if (wv === wsw.vsig) { wApply(); return; }
        idAskEff("变更版本签名校验",
          "将 <b>" + esc(wsw.name) + "</b> 的<b>版本签名校验</b>改为 <b>" + esc(wv) + "</b> —— 属<b>客户端生效面</b>：变更后客户端<b>须按新策略重新通过校验方可与网关建立通信</b>（校验不通过即拒绝，手册 §4.6.5）。<b>本次变更入审计</b>。",
          wApply);
      };
      break;
    }
    case "swVerAdd": {
      /* 表外添加 —— 一次只开一行，行数再多也不受弹窗承载能力限制。 */
      var asw = ID.csw.filter(function (x) { return x.id === id; })[0]; if (!asw) break;
      openSwVerRow(asw, null);
      break;
    }
    case "swVerRowEdit": {
      var esw = ID.csw.filter(function (x) { return x.id === id; })[0]; if (!esw) break;
      var eRow = idSwVerRowFound(esw, t.getAttribute("data-os") || "", t.getAttribute("data-ver") || "");
      if (!eRow) break;
      openSwVerRow(esw, eRow);
      break;
    }
    case "swVerDel": {
      /* 删除登记行 —— 与「不可取消发布」同判据：删掉在用版本的校验记录，在用客户端下次建连即被拒。 */
      var dsw = ID.csw.filter(function (x) { return x.id === id; })[0]; if (!dsw) break;
      var dOs = t.getAttribute("data-os") || "", dVer = t.getAttribute("data-ver") || "";
      if (!idSwVerRowFound(dsw, dOs, dVer)) break;
      if ((dsw.osver || []).length <= 1) { toast("至少保留一个操作系统版本"); break; }
      var dUse = idSwVerUseCount(dsw, dOs, dVer);
      if (dUse > 0) { toast(dOs + " · " + dVer + " 已有 " + dUse + " 个客户端实例在用，不可删除"); break; }
      idAskEff("删除操作系统版本",
        "将删除 <b>" + esc(dsw.name) + "</b> 的 <b>" + esc(dOs) + " · " + esc(dVer) + "</b> 登记行。删除后该版本的<b>校验码与签名记录一并消失</b>，客户端若上报该版本将按<b>非受控版本</b>处理（无法通过版本校验，手册 §4.6.5）。<b>本次变更入审计</b>。",
        function () {
          dsw.osver = (dsw.osver || []).filter(function (r) { return !(r.os === dOs && r.ver === dVer); });
          idSave(); idRerender(); toast("已删除（演示）");
        });
      break;
    }
    case "swDel": {
      var dsw = ID.csw.filter(function (x) { return x.id === id; })[0]; if (!dsw) break;
      /* 在用实例的软件不可删 —— 否则实例的外键悬空（与「删除资产须先处置访问」同构）。 */
      var live = (ID.cin || []).filter(function (c) { return c.sw === dsw.id && c.st !== "已卸载"; });
      if (live.length) { toast("该软件下仍有 " + live.length + " 个在用实例，须先卸载后再删除"); break; }
      idAskEff("删除客户端软件",
        "将删除客户端软件 <b>" + esc(dsw.name) + "</b>（序列号 " + esc(dsw.sn) + "）。删除后<b>不可恢复</b>，其登记信息与可访问资产配置一并移除。<b>本次变更入审计</b>。",
        function () {
          ID.csw = ID.csw.filter(function (x) { return x.id !== dsw.id; });
          ID.cin = (ID.cin || []).filter(function (c) { return c.sw !== dsw.id; });
          IDS.cur = ""; idSave(); rerender(); toast("已删除（演示）");
        });
      break;
    }
    case "swNew": {
      var amethAll = ID_AMETH_DEF().map(function (m) { return [m.k, m.name]; });
      openDlg("新建客户端软件", "登记一款<b>集成 SDK 的</b>客户端软件；唯一序列号<b>全局唯一</b>，用于 SDK 打包时识别。<b>支持的认证方式新建时不预勾</b>（避免误开放）。",
        '<div class="fld"><label>软件名称 <span class="req">*</span></label><input id="nswName" placeholder="如 白泽客户端（PC）"></div>' +
        '<div class="fld" style="margin-top:10px"><label>唯一序列号 <span class="req">*</span></label><input id="nswSn" placeholder="16 位大写字母 + 8 位数字，如 BAIZEPCCLIENTAAA20260001"></div>' +
        '<div class="fld" style="margin-top:10px"><label>类别</label><select id="nswKind">' +
          ["白泽官方客户端", "客户 SDK 集成", "AI 安全 agent"].map(function (o) { return "<option>" + o + "</option>"; }).join("") + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>注册方式</label><select id="nswReg">' +
          ["在线注册 · 管理员审核", "在线注册 · 自动审核", "离线注册 · 管理员审核"].map(function (o) { return "<option>" + o + "</option>"; }).join("") + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>证书签发机制</label><select id="nswCert">' +
          ["自有证书", "CA 机构签发"].map(function (o) { return "<option>" + o + "</option>"; }).join("") + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>通信协议</label><select id="nswProto">' +
          ["TLCP", "TLS"].map(function (o) { return "<option>" + o + "</option>"; }).join("") + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>客户端绑定与静默登录</label><select id="nswBind"><option value="1">已开启（静默登录有效期默认 30 天）</option><option value="0">未开启</option></select></div>' +
        '<div class="fld" style="margin-top:10px"><label>版本签名校验</label><select id="nswVsig">' +
          ["哈希值校验", "客户端签名校验", "哈希值校验 + 客户端签名校验"].map(function (o) { return "<option" + (o === "哈希值校验 + 客户端签名校验" ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>版本与校验码（按操作系统） <span class="req">*</span></label>' +
          '<div id="swOsver">' + idSwVerRows([{ os: "Windows", ver: "", size: "", sha256: "", sig: ID_SIG_DEF[0], pub: true }], "n") + "</div>" +
          '<div style="margin-top:6px"><button type="button" class="btn sm" data-idact="swOsAdd" data-cls="n">＋ 增加操作系统版本</button></div>' +
          '<div class="help" style="margin-top:6px">同一款软件在不同操作系统上的<b>版本号与校验码各自独立</b>，须<b>逐个操作系统登记</b>；未登记的操作系统上客户端<b>不会通过签名校验</b>。校验码为安装包的 <b>SHA256</b>（64 位十六进制）。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label>可访问资产</label><div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">' +
          ID_ASSET_DEF().map(function (a) { return '<label class="mini" style="display:flex;align-items:center;gap:4px"><input type="checkbox" class="nsw-asset" value="' + esc(a) + '">' + esc(a) + "</label>"; }).join("") + "</div></div>" +
        '<div class="fld" style="margin-top:10px"><label>支持的认证方式</label><div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">' +
          amethAll.map(function (a) { return '<label class="mini" style="display:flex;align-items:center;gap:4px"><input type="checkbox" class="nsw-ameth" value="' + a[0] + '">' + a[1] + "</label>"; }).join("") + "</div></div>");
      $("#dlg1Ok").onclick = function () {
        var nm = ($("#nswName").value || "").trim();
        var sn = ($("#nswSn").value || "").trim();
        if (!nm) { markBad($("#nswName"), true); toast("请填写软件名称"); return; }
        if (!/^[A-Z]{16}\d{8}$/.test(sn)) { markBad($("#nswSn"), true); toast("序列号须为 16 位大写字母 + 8 位数字"); return; }
        if (ID.csw.some(function (s) { return s.sn === sn; })) { markBad($("#nswSn"), true); toast("序列号已存在（全局唯一）"); return; }
        var ameth = Array.prototype.slice.call(document.querySelectorAll(".nsw-ameth")).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
        var vsigN = $("#nswVsig") ? $("#nswVsig").value : "哈希值校验 + 客户端签名校验";
        var vrowsN = idSwVerCollect("n");
        var vbadN = idSwVerValid(vrowsN, vsigN);
        if (vbadN) { toast(vbadN); return; }
        var swNew_ = {
          id: "sw_" + Date.now(), name: nm, sn: sn, kind: $("#nswKind").value, agent: $("#nswKind").value === "AI 安全 agent",
          regway: $("#nswReg").value, bind: $("#nswBind").value === "1", cert: $("#nswCert").value, proto: $("#nswProto").value,
          vsig: vsigN, osver: [],
          assets: Array.prototype.slice.call(document.querySelectorAll(".nsw-asset")).filter(function (c) { return c.checked; }).map(function (c) { return c.value; }), ameth: ameth
        };
        idSwVerWrite(swNew_, vrowsN);
        ID.csw.unshift(swNew_);
        IDS.pg = 1;
        idSave(); closeDlg(); rerender(); toast("已登记（演示）");
      };
      break;
    }
    case "cinGoto": goPage("pg-idcin", { cur: id }); break;
    /* ★ R21（I4）：从认证侧 License 台账跨页跳身份侧实例详情 —— 目标是**看证书**，故带 tab=t2；
       cinGoto（从实例列表进详情）走默认 t1 不带。 */
    case "licGoto": goPage("pg-idcin", { cur: id, tab: "t2" }); break;
    /* 客户端实例管理 */
    case "cinUpgrade": {
      /* 平台推送升级 —— 只是**三条升级路径中的一条**。用户自行升级与离线安装包安装不经本按钮，
         但客户端重新上线后同样会上报版本并经 idCinVerUpd 更新，口径一致。 */
      var cu2 = ID.cin.filter(function (x) { return x.id === id; })[0]; if (!cu2) break;
      if (cu2.st === "已卸载") { toast("该实例已卸载，不可推送升级"); break; }
      var pend2 = idCinPend(cu2);
      if (pend2) { toast("该实例已有待生效的升级下发（" + pend2 + "），待客户端上线回采"); break; }
      var swu = idSwOf(cu2.sw);
      var tgt = idCinLatestPub(cu2, swu);
      if (!tgt || idVerCmp(tgt.ver, cu2.ver) <= 0) { toast("该实例已是所在操作系统的最新已发布版本，无需升级"); break; }
      var famU = idOsFamily((ID.terms.filter(function (x) { return x.id === cu2.term; })[0] || {}).os);
      /* 终端离线 ⇒ 推送只登记为**待生效**、版本号不动：客户端收不到也来不及上报，
         此刻改 ver 就是「平台推断版本」。上线回采后才更新 —— 与「版本以客户端上报值为准」同一口径。 */
      var off2 = cu2.online !== "在线";
      idAskEff("推送客户端升级",
        "将向 <b>" + esc(idName(ID.terms, cu2.term, "id", "name")) + "</b> 上的实例推送升级：" +
        "<b>" + esc(cu2.ver) + " → " + esc(tgt.ver) + "</b>（" + esc(famU) + "）。升级后客户端<b>须重新通过版本签名校验</b>方可与网关建立通信，升级期间隧道<b>短暂中断</b>。" +
        (off2
          ? "⚠ 该实例所在终端当前<b>离线</b>：本次推送只登记为<b>待生效</b>，<b>不改变本页版本号</b>；客户端下次上线完成安装并<b>回采</b>后版本号才更新。"
          : "<b>无论平台推送、用户自行升级还是离线安装包安装，客户端上线后都会重新上报版本</b>，平台以<b>最近一次上报值</b>为本页版本号。") +
        "<b>本次变更入审计</b>。",
        function () {
          idCinVerUpd(cu2, tgt.ver, "平台推送升级", ID_NOW, off2 ? "待生效·客户端离线" : "成功");
          idSave(); rerender();
          toast(off2 ? "已登记待生效（客户端离线，上线后回采）" : "已推送升级（演示）");
        });
      break;
    }
    case "cinVerRpt": {
      /* ★ 2026-10-12（R57 · 交-10）：演示事件出口 —— 模拟「客户端上线并完成上报」。
         与 cinUpgrade 的「离线 ⇒ 只登记待生效」互为闭环：本动作是那一次上报的落地，
         且**只经唯一写入口** idCinVerUpd（result=成功 ⇒ 才会改写 c.ver）。 */
      var rc1 = ID.cin.filter(function (x) { return x.id === id; })[0]; if (!rc1) break;
      var rto1 = (t.getAttribute("data-to") || "") || idCinPend(rc1);
      if (!rto1) { toast("当前实例无待回采的升级下发"); break; }
      idCinVerUpd(rc1, rto1, "客户端上线回采", ID_NOW, "成功");
      idSave(); rerender();
      toast("模拟客户端上线回采完成：实例版本已更新为 " + rto1 + "（演示）");
      break;
    }
    case "cinView": IDC.cur = id; IDC.tab = "t1"; rerender(); break;
    case "cinList": IDC.cur = ""; rerender(); break;
    /* ★ R21（I4）：点「证书」入口此前只设 cur、不复位 tab ⇒ 落回默认 t1（基础信息），
       用户点的正是证书却看不到证书。页签必须**由入口驱动**，不能只由「上一次点过哪个签」决定。 */
    case "cinLic": IDC.cur = id; IDC.tab = "t2"; rerender(); break;
    case "cinToggle": {
      var ct = ID.cin.filter(function (x) { return x.id === id; })[0]; if (!ct) break;
      /* ★ R53（B-F4）：与终端侧 termDisable 同款**终态护栏** ——「已卸载」是终态（须重新注册），
         程序化 / 异常触发时不得把它「复活」为已禁用。UI 不渲染该按钮，属防御一致性。 */
      if (ct.st !== "已激活" && ct.st !== "已禁用") { toast("该客户端实例当前为「" + ct.st + "」，不可启停（已卸载为终态，须重新注册）"); break; }
      var ns2 = ct.st === "已禁用" ? "已激活" : "已禁用";
      idAskEff(ns2 === "已禁用" ? "禁用客户端实例" : "激活客户端实例",
        "将把该客户端实例置为 <b>" + ns2 + "</b>。" + (ns2 === "已禁用"
          ? "禁用后该实例<b>无法建立隧道</b>（所在终端与其他实例不受影响），已建立的会话将被<b>中断</b>；若该实例是 <b>AI 安全 agent</b>，其监管的智能体实例将<b>一并终止</b>（宿主已失活）。"
          : "激活后该实例<b>即刻可用</b>；登录与追加认证按其所属客户端软件登记的认证方式下发选项。") + "<b>本次变更入审计</b>。",
        /* toast 由目标状态派生，与终端开关（L1164）同构：状态写什么就报什么，
           不再硬编码动作词 —— 否则「写入 已激活 / 提示 已启用」两处打架。 */
        function () { ct.st = ns2; if (ns2 === "已禁用") { ct.online = "离线"; if (idIsSafeHost(ct)) (ID.ain || []).forEach(function (a) { if (a.host === ct.id && a.st !== "已终止") a.st = "已终止"; }); } idSave(); rerender(); toast("已" + ns2.slice(1) + "（演示）"); });
      break;
    }
    case "cinUninstall": {
      var cu = ID.cin.filter(function (x) { return x.id === id; })[0]; if (!cu) break;
      idAskEff("卸载客户端实例",
        "将把该实例置为 <b>已卸载</b>：<b>不再参与隧道建立</b>，其上的智能体实例<b>一并终止</b>（宿主已卸载，不再具备监管通道）。License 证书记录<b>保留在台账</b>（如确认不再使用，另在「签发凭据管理」吊销以使其失效，本页吊销仅改本模块标注）。<b>此操作入审计</b>。",
        function () { cu.st = "已卸载"; cu.online = "离线"; (ID.ain || []).forEach(function (a) { if (a.host === cu.id) a.st = "已终止"; }); idSave(); rerender(); toast("已卸载（演示）"); });
      break;
    }
    case "cinNew": {
      var swOpts = ID.csw.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join("");
      var termOpts = ID.terms.filter(function (s) { return s.st === "已激活"; }).map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join("");
      openDlg("登记客户端实例", "实例是软件装在具体终端上的落地。<b>客户端发起的注册由「注册申请审核」承接</b>；此处为<b>管理员直接登记</b>，登记即视为审核通过。须指定所属软件与所在终端；登记后即签发首份 License 证书。",
        '<div class="fld"><label>所属软件 <span class="req">*</span></label><select id="nciSw">' + swOpts + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>所在终端 <span class="req">*</span></label><select id="nciTerm">' + termOpts + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>客户端序列号 <span class="req">*</span></label><input id="nciSeq" placeholder="如 BZPC-0007-3A2C"></div>' +
        /* ★ R21（I1）：撤除「注册方式」下拉 —— 全库仅此一处渲染、**无任何读取**（死控件：能改但改了没用）；
           且注册方式是**软件级**配置（手册 §4.6.2），在实例级重复登记反而误导。登记即视为审核通过，
           注册方式以所属软件的配置为准。 */
        '<div class="fld" style="margin-top:10px"><label>License 授权范围 <span class="req">*</span></label><input id="nciScope" placeholder="如 信贷核心系统 / 客户管理平台"></div>' +
        '<div class="fld" style="margin-top:10px"><label>License 有效期至 <span class="req">*</span></label><input id="nciExp" value="' + idYmdShift(idDay(), 0, 1) + '"></div>');
      $("#dlg1Ok").onclick = function () {
        if (!$("#nciSw") || !$("#nciSw").value) { toast("当前没有可登记的客户端软件"); return; }
        if (!$("#nciTerm") || !$("#nciTerm").value) { toast("当前没有可登记实例的已激活终端"); return; } var seq = ($("#nciSeq").value || "").trim();
        var sc = ($("#nciScope").value || "").trim();
        var ex = ($("#nciExp").value || "").trim();
        if (!seq) { markBad($("#nciSeq"), true); toast("请填写客户端序列号"); return; }
        if (!/^[A-Z]{4}-\d{4}-[A-Z0-9]{4}$/.test(seq)) { markBad($("#nciSeq"), true); toast("客户端序列号格式须为 4 位大写字母-4 位数字-4 位字母数字，如 BZPC-0007-3A2C"); return; }
        if (ID.cin.some(function (x) { return x.cidseq === seq; })) { markBad($("#nciSeq"), true); toast("该客户端序列号已存在"); return; }
        if (!sc) { markBad($("#nciScope"), true); toast("请填写 License 授权范围"); return; }
        if (!ex) { markBad($("#nciExp"), true); toast("请填写 License 有效期"); return; }
        if (!bzYmdOk(ex)) { markBad($("#nciExp"), true); toast("有效期须为有效的 YYYY-MM-DD 日期"); return; }
        /* 判据须与提示语一致：此前为 `ex < idDay()` ⇒ 允许录入**等于今天**（有效期 0 天、
           签发即过期）；且签发 / 轮换侧为 `ex2 <= is2`（更严）⇒ 同字段两处严格度不一致。 */
        if (ex <= idDay()) { markBad($("#nciExp"), true); toast("有效期须晚于今天"); return; }
        var sid = $("#nciSw").value, tid3 = $("#nciTerm").value;
        var nciTerm = ID.terms.filter(function (x) { return x.id === tid3; })[0];
        /* 登记实例不改变归属关系。 */
        ID.cin.unshift({
          id: "ci_" + Date.now(), sw: sid, term: tid3, cidseq: seq, st: "已激活", online: "在线",
          /* ★ R20：此前取 `idSwOf(sid).ver[0]` —— `ver` 是 pre-id-7 死字段，新快照里不存在
             ⇒ 恒落占位 "1.0.0"，刚登记的实例一建即被标「可升级」。改为按所在终端操作系统派生
             （与注册审核通过同源同判据）。 */
          ver: idCinNewVer(idSwOf(sid), nciTerm),
          lic: [{ id: "lic_" + Date.now(), no: idLicNo(), issued: idDay(), exp: ex, tag: "当前",
            ca: idSwOf(sid).cert === "CA 机构签发" ? "外购 CA（CFCA）" : "白泽内网 CA", scope: sc }]
        });
        /* 客户端实例不另存归属键：归属只经关系表与终端侧维护，避免第三份投影漂移。 */
        /* 实例台账由 idCinPage / idCinDetail 从 ID.cin 直读。 */
        /* ★ 2026-10-10（R27 · B-2）：登记即签发首份 License ⇒ 同步回写认证侧签发台账。 */
        idRegisterAuthLic(ID.cin[0], (ID.cin[0].lic || [])[0]);
        IDC.pg = 1;
        idSave(); closeDlg(); rerender(); toast("已登记并签发 License 证书（演示）");
      };
      break;
    }
    case "cinNewLic": {
      var ce0 = ID.cin.filter(function (x) { return x.id === id; })[0]; if (!ce0) break;
      var dftScope = (ce0.lic && ce0.lic[0] && ce0.lic[0].scope) || "";
      openDlg("签发 License 证书", "将为该实例签发一份新的 License 证书。<b>生效日期晚于今天 ⇒ 自动标注「待生效」</b>。轮换过渡期新旧证书<b>并存</b>。<b>此操作入审计</b>。",
        '<div class="fld"><label>授权范围 <span class="req">*</span></label><input id="nlcScope" value="' + esc(dftScope) + '" placeholder="如 信贷核心系统 / 客户管理平台"></div>' +
        '<div class="fld" style="margin-top:10px"><label>生效日期 <span class="req">*</span></label><input id="nlcIssued" value="' + idDay() + '"><div class="mini" style="margin-top:4px">晚于今天即标注<b>待生效</b>（用于换发衔接）；等于今天即<b>当前</b>。</div></div>' +
        '<div class="fld" style="margin-top:10px"><label>有效期至 <span class="req">*</span></label><input id="nlcExp" value="' + idYmdShift(idDay(), 0, 1) + '"></div>' +
        '<div class="fld" style="margin-top:10px"><label>签发 CA</label><select id="nlcCa">' +
          ["白泽内网 CA", "外购 CA（CFCA）"].map(function (o) { return "<option>" + o + "</option>"; }).join("") + "</select></div>" +
        '<div class="help" style="margin-top:8px">证书内嵌<b>客户端序列号 / 终端序列号 / 授权范围 / 有效期 / 建立 TLCP 隧道所需的 CA 证书链（只含公钥）</b>，不可单独修改，随实例信息自动带入。</div>');
      $("#dlg1Ok").onclick = function () {
        var sc2 = ($("#nlcScope").value || "").trim();
        var is2 = ($("#nlcIssued").value || "").trim();
        var ex2 = ($("#nlcExp").value || "").trim();
        if (!sc2) { markBad($("#nlcScope"), true); toast("请填写授权范围"); return; }
        if (!is2) { markBad($("#nlcIssued"), true); toast("请填写生效日期"); return; }
        if (!bzYmdOk(is2)) { markBad($("#nlcIssued"), true); toast("生效日期须为有效的 YYYY-MM-DD 日期"); return; }
        if (!ex2) { markBad($("#nlcExp"), true); toast("请填写有效期"); return; }
        if (!bzYmdOk(ex2)) { markBad($("#nlcExp"), true); toast("有效期须为有效的 YYYY-MM-DD 日期"); return; }
        if (ex2 <= is2) { markBad($("#nlcExp"), true); toast("有效期须晚于生效日期"); return; } if (ce0.st === "已卸载") { toast("该实例已卸载，不可签发或轮换证书（如需处置请吊销既有证书）"); return; } if (is2 <= idDay() && (ce0.lic || []).some(function (l) { return idLicTagOf(l) === "当前"; })) { markBad($("#nlcIssued"), true); toast("该实例已有生效中的证书，请改用「轮换」以维持单一当前证书"); return; }
        /* ★ R20：**待生效侧此前不判重** —— 「轮换」会拦（已有待生效证书），「签发证书」不会
           ⇒ 同一实例可连开多份待生效证书，与页内自述「轮换过渡期新旧证书并存（＝一旧一新）」
           冲突，也让「谁是下一份当前」出现歧义。判据提为共享助手，与轮换侧同源。 */
        var pend0 = idLicPending(ce0);
        if (pend0 && is2 > idDay()) { markBad($("#nlcIssued"), true); toast("该实例已有待生效证书 " + pend0.no + "（" + pend0.issued + " 起生效），同一时刻只允许一份待生效证书"); return; }
        var ca2 = $("#nlcCa").value;
        idAskEff("签发 License 证书", "将为该客户端实例签发一份 License 证书（授权范围 <b>" + esc(sc2) + "</b>，有效期 <b>" + esc(is2) + " ~ " + esc(ex2) + "</b>，签发 CA <b>" + esc(ca2) + "</b>）。<b>此操作入审计</b>。", function () {
          ce0.lic = ce0.lic || [];
          ce0.lic.push({ id: "lic_" + Date.now(), no: idLicNo(), issued: is2, exp: ex2, tag: is2 > idDay() ? "待生效" : "当前", ca: ca2, scope: sc2 });
          /* ★ 2026-10-10（R27 · B-2）：新签发份同步回写认证侧（按 no 幂等）。 */
          idRegisterAuthLic(ce0, ce0.lic[ce0.lic.length - 1]);
          idSave(); closeDlg(); rerender(); toast("已签发新证书（演示）");
        });
      };
      break;
    }
    case "licRevoke": {
      var ci2 = ID.cin.filter(function (x) { return x.id === id; })[0]; if (!ci2) break;
      var lid = t.getAttribute("data-l");
      var l0 = (ci2.lic || []).filter(function (l) { return l.id === lid; })[0]; if (!l0) break;
      idAskEff("吊销 License 证书",
        "将吊销证书 <b>" + esc(l0.no) + "</b>。<b>吊销后该证书立即失效</b>，设备须持有效证书方可建立隧道；<b>记录保留在台账</b>（可追溯），如需同步失效「签发凭据管理」中的同一份凭据，系统按证书编号<b>一并置为已吊销</b>。<b>此操作入审计</b>。",
        function () {
          l0.tag = "已吊销"; l0.revokedAt = ID_NOW;
          idRevokeAuthIssue(l0.no);
          idSave(); rerender(); toast("已吊销（演示）");
        });
      break;
    }
    case "licRotate": {
      var rc = ID.cin.filter(function (x) { return x.id === id; })[0]; if (!rc) break;
      var cur = (rc.lic || []).filter(function (l) { return idLicTagOf(l) === "当前"; })[0] || (rc.lic || [])[0] || {};
      var pend = idLicPending(rc);
      if (pend) { toast("已存在待生效证书 " + pend.no + "，无需重复轮换"); break; }
      var ni = cur.exp ? idYmdShift(cur.exp, 1) : idDay();
      idAskEff("发起证书轮换",
        "将为该实例生成一份<b>新证书</b>并保留当前证书至其到期（过渡期<b>新旧共存</b>）；新证书生效日 <b>" + esc(ni) + "</b>（当前证书到期次日），届时标注为「当前」。<b>此操作入审计</b>。",
        function () {
          rc.lic = rc.lic || [];
          rc.lic.push({ id: "lic_" + Date.now(), no: idLicNo(), issued: ni, exp: idYmdShift(ni, 0, 1), tag: "待生效", ca: cur.ca || "白泽内网 CA", scope: cur.scope || "—" });
          /* ★ 2026-10-10（R27 · B-2）：轮换生成的新份同步回写认证侧（按 no 幂等）。 */
          idRegisterAuthLic(rc, rc.lic[rc.lic.length - 1]);
          idSave(); rerender(); toast("已轮换：生成待生效新证书（演示）");
        });
      break;
    }
    /* 智能体软件管理 */
    case "agswView": IDA.cur = id; rerender(); break;
    case "agswList": IDA.cur = ""; rerender(); break;
    case "agswEdit": {
      var ag = ID.asw.filter(function (x) { return x.id === id; })[0]; if (!ag) break;
      /* ★ R21（I8）：与 I3 同型 —— 候选只收「有已激活实例」的 agent 软件，
         现任监管若已无活跃实例就落选 ⇒ 弹窗默认「（待指定）」，直接确定即**静默清空现任监管**。
         保留现任（标注「现任 · 当前不可选」），使「在位事实」可见。 */
      var gopts = ID.csw.filter(function (s) { return (s.agent && (ID.cin || []).some(function (c) { return c.sw === s.id && c.st === "已激活"; })) || s.id === ag.guardian; });
      openDlg("编辑智能体软件", "受 <b>AI 安全 agent 监管</b>的 AI agent 软件（<b>不集成 SDK</b>）。指定监管 agent 后状态转为<b>受管</b>；清空则回到<b>待纳管</b>。",
        '<div class="fld"><label>智能体软件名称</label><input id="idagName" value="' + esc(ag.name) + '"></div>' +
        '<div class="fld" style="margin-top:10px"><label>厂商 / 来源</label><input id="idagVendor" value="' + esc(ag.vendor || "") + '"></div>' +
        '<div class="fld" style="margin-top:10px"><label>版本</label><input id="idagVer" value="' + esc((ag.ver || []).join(" / ")) + '" placeholder="多个版本以 / 分隔"></div>' +
        '<div class="fld" style="margin-top:10px"><label>进程名 / 可执行文件</label><input id="idagProc" value="' + esc(ag.proc || "") + '"></div>' +
        '<div class="fld" style="margin-top:10px"><label>监管的 AI 安全 agent</label><select id="idagGuard"><option value="">（待指定）</option>' +
          gopts.map(function (s) { var ok = s.agent && (ID.cin || []).some(function (c) { return c.sw === s.id && c.st === "已激活"; }); return '<option value="' + s.id + '"' + (ag.guardian === s.id ? " selected" : "") + (ok ? "" : " disabled") + ">" + esc(s.name) + (ok ? "" : "（现任 · 当前不可选）") + "</option>"; }).join("") + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>受管策略</label><input id="idagPolicy" value="' + esc(ag.policy) + '"></div>');
      $("#dlg1Ok").onclick = function () {
        var gNew = $("#idagGuard").value;
        /* ★ R61（轮7）：厂商 / 版本须在**弹窗仍开着**时读出 —— 下方 idAskEff 会走二次认证（替换确认框内容），
           若挪到回调里再读 $("#idagVendor") 已取不到节点。 */
        var agVendor = ($("#idagVendor").value || "").trim() || ag.vendor || "—";
        var agVerRaw = ($("#idagVer").value || "").trim();
        var agNm = ($("#idagName").value || "").trim() || ag.name;
        var agProc = ($("#idagProc").value || "").trim() || ag.proc;
        var agPol = ($("#idagPolicy").value || "").trim() || ag.policy;
        var applyAg = function () {
          ag.name = agNm; ag.proc = agProc; ag.guardian = gNew; ag.policy = agPol;
          ag.vendor = agVendor;
          if (agVerRaw) { var _agv = agVerRaw.split("/").map(function (z) { return z.trim(); }).filter(Boolean); if (_agv.length) ag.ver = _agv; }
          ag.st = ag.guardian ? "受管" : "待纳管";
          idSave(); closeDlg(); rerender(); toast("已保存（演示）");
        };
        if (gNew === (ag.guardian || "")) { applyAg(); return; }
        var live = (ID.ain || []).filter(function (x) { return x.asw === ag.id && x.st !== "已终止"; });
        idAskEff("变更智能体软件的监管 agent",
          "将把 <b>" + esc(ag.name) + "</b> 的监管 agent 变更为 <b>" + esc(gNew ? idName(ID.csw, gNew) : "（待指定）") + "</b>。" +
          (gNew ? "该软件转为<b>受管</b>，可持续登记其运行实例。" : "该软件转为<b>待纳管</b>，不能登记其运行实例。") +
          (live.length ? "其下 <b>" + live.length + "</b> 个未终止的智能体实例中，宿主不再匹配新监管 agent 的将<b>一并终止</b>。" : "") +
          "<b>本次变更入审计</b>。",
          function () {
            /* 监管 agent 变更（含 A→B 换绑）后，存量未终止实例的宿主若不再匹配新监管 agent 则一并终止
               —— 否则 host 仍指向旧 agent 的实例，宿主链与新监管关系不自洽。 */
            (ID.ain || []).forEach(function (x) {
              if (x.asw !== ag.id || x.st === "已终止") return;
              var hs = idCinOf(x.host);
              if (!gNew || !hs || idSwOf(hs.sw).id !== gNew) x.st = "已终止";
            });
            applyAg();
          });
      };
      break;
    }
    case "agswNew": {
      var gopts2 = ID.csw.filter(function (s) { return s.agent && (ID.cin || []).some(function (c) { return c.sw === s.id && c.st === "已激活"; }); });
      openDlg("登记智能体软件", "登记一个受 AI 安全 agent 监管的智能体软件。⚠ <b>它不集成 SDK</b>，与客户端软件是两条平行线；其身份依托<b>宿主实例的客户端 License 证书 + 所在终端指纹</b>。",
        '<div class="fld"><label>智能体软件名称 <span class="req">*</span></label><input id="nagName" placeholder="如 代码助手 Agent"></div>' +
        '<div class="fld" style="margin-top:10px"><label>厂商 / 来源</label><input id="nagVendor" placeholder="如 内部自研 / 科大讯飞"></div>' +
        '<div class="fld" style="margin-top:10px"><label>版本</label><input id="nagVer" value="1.0.0"></div>' +
        '<div class="fld" style="margin-top:10px"><label>进程名 / 可执行文件</label><input id="nagProc" placeholder="如 code-agent.exe"></div>' +
        '<div class="fld" style="margin-top:10px"><label>监管的 AI 安全 agent</label><select id="nagGuard"><option value="">（待指定）</option>' +
          gopts2.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join("") + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>受管策略</label><input id="nagPolicy" placeholder="如 仅可访问代码库与需求库；禁止访问信贷核心系统"></div>');
      $("#dlg1Ok").onclick = function () {
        var nm = ($("#nagName").value || "").trim();
        if (!nm) { markBad($("#nagName"), true); toast("请填写智能体软件名称"); return; }
        if (ID.asw.some(function (x) { return x.name === nm; })) { markBad($("#nagName"), true); toast("该智能体软件已登记"); return; }
        var gd = $("#nagGuard").value;
        ID.asw.unshift({
          id: "asw_" + Date.now(), name: nm, vendor: ($("#nagVendor").value || "").trim() || "—",
          ver: [($("#nagVer").value || "").trim() || "1.0.0"],
          proc: ($("#nagProc").value || "").trim() || "—",
          guardian: gd, policy: ($("#nagPolicy").value || "").trim() || "待配置", st: gd ? "受管" : "待纳管"
        });
        IDA.pg = 1;
        idSave(); closeDlg(); rerender(); toast("已登记（演示）");
      };
      break;
    }
    case "ainGoto": goPage("pg-idagin", { asw: id, term: t.getAttribute("data-t") || "" }); break;
    case "agswGoto": goPage("pg-idagsw", { cur: id }); break;
    /* 智能体实例管理 */
    case "ainNew": {
      var hosts = ID.cin.filter(function (c) { return idIsSafeHost(c) && c.st === "已激活"; });
      if (!hosts.length) {
        openDlg("无法登记智能体实例", "智能体实例的宿主<b>必须是 AI 安全 agent 的客户端实例</b>（方案 §1.1：由它监管本终端的 AI agent）。当前没有可用的宿主实例。<br><br>处置路径：① 在「客户端软件管理」登记 <b>AI 安全 agent</b> 软件；② 在「客户端实例管理」为它登记实例并通过注册审核；③ 回到本页登记智能体实例。<br><br>⚠ 普通客户端实例<b>不能</b>作为智能体宿主。");
        break;
      }
      var aswOpts = ID.asw.filter(function (s) { return s.guardian; }).map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join("");
      var cinOpts = hosts.map(function (c) {
        return '<option value="' + c.id + '">' + esc(idName(ID.csw, c.sw)) + " @ " + esc(idName(ID.terms, c.term, "id", "name")) + "</option>";
      }).join("");
      openDlg("登记智能体实例", "登记 AI agent 在具体终端上的实例。<b>宿主必须选 AI 安全 agent 的客户端实例</b>（所在终端随宿主派生）；短时凭据由宿主实例的 License 证书与终端指纹派生。",
        '<div class="fld"><label>智能体软件 <span class="req">*</span></label><select id="naiAsw">' + (aswOpts || '<option value="">（暂无已受管的智能体软件）</option>') + "</select></div>" +
        '<div class="fld" style="margin-top:10px"><label>宿主客户端实例 <span class="req">*</span></label><select id="naiHost">' + cinOpts + "</select><div class=\"mini\" style=\"margin-top:4px\">候选＝<b>AI 安全 agent 的已激活客户端实例</b>（普通客户端实例不可作宿主；且须与该智能体软件的<b>监管 agent</b>一致）。</div></div>" +
        '<div class="fld" style="margin-top:10px"><label>进程号（PID） <span class="req">*</span></label><input id="naiPid" placeholder="如 4821"></div>' +
        '<div class="fld" style="margin-top:10px"><label>凭据有效期（分钟） <span class="req">*</span></label><input id="naiTtl" type="number" min="1" max="1440" value="30"></div>');
      $("#dlg1Ok").onclick = function () {
        var pid = ($("#naiPid").value || "").trim();
        var sid2 = $("#naiAsw").value;
        var hid = $("#naiHost").value;
        var ttl = parseInt($("#naiTtl").value, 10);
        if (!sid2) { markBad($("#naiAsw"), true); toast("请先在「智能体软件管理」指定监管 agent（转为受管）"); return; }
        if (!pid) { markBad($("#naiPid"), true); toast("请填写进程号"); return; }
        if (!/^\d+$/.test(pid)) { markBad($("#naiPid"), true); toast("进程号须为数字"); return; }
        if (!(ttl >= 1 && ttl <= 1440)) { markBad($("#naiTtl"), true); toast("凭据有效期须为 1 ~ 1440 分钟"); return; }
        if (ID.ain.some(function (x) { return x.host === hid && x.pid === pid && x.st !== "已终止"; })) { markBad($("#naiPid"), true); toast("该宿主上已存在同进程号的运行实例"); return; }
        var hc = idCinOf(hid);
        if (!idIsSafeHost(hc)) { toast("宿主必须是 AI 安全 agent 的客户端实例"); return; }
        /* 宿主实例所属软件必须正是该智能体软件指定的监管 agent —— idIsSafeHost 只判「是不是 AI agent 实例」，
           不判「是哪一款」，否则可登记出监管 agent 与宿主错配的实例。 */
        var asw0 = ID.asw.filter(function (x) { return x.id === sid2; })[0] || {};
        if (asw0.guardian && idSwOf(hc.sw).id !== asw0.guardian) { toast("宿主实例所属软件（" + idName(ID.csw, hc.sw) + "）与该智能体软件的监管 agent（" + idName(ID.csw, asw0.guardian) + "）不一致"); return; }
        ID.ain.unshift({
          id: "ai_" + Date.now(), asw: sid2, term: hc.term, host: hid, pid: pid,
          cred: { no: idCredNo(pid), issued: ID_NOW, exp: idShift(ID_NOW, ttl) }
        });
        IDAI.pg = 1;
        idSave(); closeDlg(); rerender(); toast("已登记（有效期 " + ttl + " 分钟）（演示）");
      };
      break;
    }
    case "ainEnd": {
      var ae = ID.ain.filter(function (x) { return x.id === id; })[0]; if (!ae) break;
      if (idAgInSt(ae) === "已终止") { toast("该实例已终止"); break; }
      idAskEff("终止智能体实例",
        "将终止该智能体实例并<b>使其短时凭据立即失效</b>；<b>终止不可逆</b>，如需再次运行须<b>重新登记</b>实例。<b>此操作入审计</b>。",
        function () { ae.st = "已终止"; idSave(); rerender(); toast("已终止（演示）"); });
      break;
    }
    case "ainRenew": {
      var ar = ID.ain.filter(function (x) { return x.id === id; })[0]; if (!ar) break;
      if (idAgInSt(ar) === "已终止") { toast("该实例已终止，须重新登记后方可续发凭据"); break; }
      var ttl2 = 30;
      idAskEff("续发短时凭据",
        "将为该实例续发一份短时凭据（有效期 <b>" + ttl2 + "</b> 分钟），<b>原凭据立即失效</b>。凭据不落地、用毕即销毁。<b>此操作入审计</b>。",
        function () {
          var _rn = idCredNo(ar.pid), _rx = idShift(ID_NOW, ttl2);
          ar.cred = { no: _rn, issued: ID_NOW, exp: _rx };
          /* ★ 2026-10-10（R17）：续发同样要回写认证侧发放台账 —— 只改本模块的 cred，认证侧会停在
             上一份，两页对「该实例此刻拿的是哪份」各说一套。holder 按与认证侧**同一套 label 构造**
             拼装（见 `_frag_auth.js` 的 auHolderRef），否则两边对不上、回写静默落空。 */
          idRegisterAuthIssue({
            holder: "智能体实例 · " + idName(ID.asw, ar.asw, "id", "name") + " @ " + idName(ID.terms, ar.term, "id", "name") + "（进程 " + ar.pid + "）",
            no: _rn, issued: ID_NOW, exp: _rx, ttl: ttl2
          });
          delete ar.st; idSave(); rerender(); toast("已续发凭据（演示）");
        });
      break;
    }
  }
}
/* 认证侧「签发凭据管理」按证书编号回写同一份证书的状态；身份侧吊销须同样回写，
   否则同一张证书在本页显示「已吊销」、在认证侧仍显示「有效」（两页自相矛盾）。
   ⚠ 认证数据只在认证模块页装载（AU 为 null）；身份页须按需补装 —— 与 auLoad 里
     「ID 为 null 时补 idLoad()」互为对称，否则跨模块回写在本页静默失效。 */
function idRevokeAuthIssue(no) {
  try {
    if (!no) return;
    if ((typeof AU === "undefined" || !AU || !Array.isArray(AU.issue)) && typeof auLoad === "function") auLoad();
    if (typeof AU === "undefined" || !AU || !Array.isArray(AU.issue)) return;
    var hit = false;
    AU.issue.forEach(function (x) { if (x.no === no) { x.st = "已吊销"; hit = true; } });
    if (hit && typeof auSave === "function") auSave();
  } catch (e) { /* 认证数据不可用时不阻断本模块 */ }
}
/* 认证侧「签发凭据管理」的**反向**回写（R17）：身份侧续发短时凭据后，认证侧的发放台账也要记上
   这一份「当前份」。原实现只改本模块的 `cred`，认证侧台账停在上一份 ⇒ 两页对「该实例此刻拿的
   是哪份」各说一套（X1 轮补的正是这一类缺口，运行时又被拉开）。
   ⚠ 与 `idRevokeAuthIssue` 完全对称：`AU` 为 null 时按需补装；认证数据不可用时不阻断本模块。 */
/* 认证侧「签发凭据管理」的**反向**回写（R27 · 对称性补齐）：身份侧**新签发 / 轮换**客户端
   License 证书后，认证侧的发放台账也要记上这一份。原实现只在吊销（licRevoke）与智能体续发
   （ainRenew）两处回写，`cinNew` / `cinNewLic` / `licRotate` 三条**签发 / 轮换**路径全部不回写
   ⇒ 身份侧新签出的证书在页⑤ 查不到，两页对「该实例此刻持有什么」各说一套（回写只做了半套）。
   ⚠ 与 `idRevokeAuthIssue` / `idRegisterAuthIssue` 同体例：`AU` 为 null 时按需补装；认证数据
     不可用时不阻断本模块。holder 按与认证侧 `auHolderRef` **同一套 label 构造**拼装，否则两边
     对不上、回写静默落空。
   ★ R53（存-6 取舍）：认证侧台账**已补「待生效」态** —— `auIssueSt(exp, issued)` 在 issued 晚于
     基准日时派生「待生效」，与身份侧 `idLicTagOf` 同一口径。此前只按 exp 算 ⇒ 轮换生成的衔接份
     身份侧「待生效」、认证侧「有效」，同一编号两个相反结论（见 `_frag_auth.js` 种子 is_13）。 */
function idRegisterAuthLic(cin, lic) {
  try {
    if (!cin || !lic || !lic.no) return;
    if ((typeof AU === "undefined" || !AU || !Array.isArray(AU.issue)) && typeof auLoad === "function") auLoad();
    if (typeof AU === "undefined" || !AU || !Array.isArray(AU.issue)) return;
    /* 按证书编号幂等：同号已在表即跳过（轮换 / 签发各只应落一次）。 */
    if (AU.issue.some(function (x) { return x.no === lic.no; })) return;
    var holder = "客户端实例 · " + idName(ID.csw, cin.sw, "id", "name") + " @ " + idName(ID.terms, cin.term, "id", "name");
    /* 绑定主体标识 cn = 该实例的 cidseq；指纹 fp = 所在终端的 sn（与认证侧 cnOf / fpOf 同源）。 */
    var fp = "";
    for (var i = 0; i < (ID.terms || []).length; i++) { if (ID.terms[i].id === cin.term) { fp = ID.terms[i].sn || ""; break; } }
    AU.issue.unshift({
      id: "is_" + Date.now(), kind: "客户端 License 证书", holder: holder, no: lic.no,
      issued: lic.issued, exp: lic.exp,
      st: (typeof auIssueSt === "function" ? auIssueSt(lic.exp, lic.issued) : "有效"),
      cn: cin.cidseq || "", fp: fp, scope: lic.scope || "", ca: lic.ca || "", ttl: 0
    });
    if (typeof auSave === "function") auSave();
  } catch (e) { /* 认证数据不可用时不阻断本模块 */ }
}
function idRegisterAuthIssue(o) {
  try {
    if (!o || !o.no) return;
    if ((typeof AU === "undefined" || !AU || !Array.isArray(AU.issue)) && typeof auLoad === "function") auLoad();
    if (typeof AU === "undefined" || !AU || !Array.isArray(AU.issue)) return;
    if (AU.issue.some(function (x) { return x.no === o.no; })) return;
    /* 绑定主体标识 / 授权范围 / 签发 CA 不在身份侧维护 —— 从该主体**上一份同类型**凭据继承
       （续发不改变「这台实例被允许访问什么」，只换凭据本身）；无前份则留空、由展示层兜底，
       **不落**「—」（R14 裁决⑤：展示层缺省符不得当数据落库）。 */
    var prev = AU.issue.filter(function (x) { return x.holder === o.holder && x.kind === "智能体短时凭据"; })[0] || {};
    AU.issue.unshift({
      id: "is_" + Date.now(), kind: "智能体短时凭据", holder: o.holder, no: o.no,
      issued: o.issued, exp: o.exp,
      st: (typeof auIssueSt === "function" ? auIssueSt(o.exp) : "有效"),
      cn: prev.cn || "", fp: prev.fp || "", scope: prev.scope || "", ca: "", ttl: o.ttl || 30
    });
    if (typeof auSave === "function") auSave();
  } catch (e) { /* 认证数据不可用时不阻断本模块 */ }
}
function idOnChange(e) {
  var t = e.target;
  if (!t || !t.id) return;
  var rerender = idRerender;
  /* 焦点保持：筛选 select 的 change 若直接整页重渲染，控件被销毁 ⇒ 焦点掉回 body，
     键盘用户每选一次都要重新 Tab（搜索框输入已用 rerenderKeep 保焦点，此处与之对齐）。 */
  var rerenderKeep = function () { rerender(); var n = document.getElementById(t.id); if (n) n.focus(); };
  var v = t.value;
  switch (t.id) {
    case "idswAgent": IDS.f.agent = v; IDS.pg = 1; rerenderKeep(); break;
    case "idswOs": IDS.f.os = v; IDS.pg = 1; rerenderKeep(); break;
    case "idagswSt":  IDA.f.st = v; IDA.pg = 1; rerenderKeep(); break;
    case "iduOrg": IDU.f.org = v; IDU.pg = 1; rerenderKeep(); break;
    case "iduRole": IDU.f.role = v; IDU.pg = 1; rerenderKeep(); break;
    case "iduSt": IDU.f.st = v; IDU.pg = 1; rerenderKeep(); break;
    case "idtOrg": IDT.f.org = v; IDT.pg = 1; rerenderKeep(); break;
    case "idtSt": IDT.f.st = v; IDT.pg = 1; rerenderKeep(); break;
    /* ★ R20：新增筛选控件的分发分支（漏一条即「改了没反应」—— 本模块控件按 id 硬编码分发）。 */
    case "idtOn": IDT.f.online = v; IDT.pg = 1; rerenderKeep(); break;
    /* ★ 2026-10-12（R56 · C-8）：注册时间是一个**区间**，两端各自独立可写 ⇒ 必须在本处分发点做
       跨字段纠正：起 > 止 时筛选恒空，而界面既不报错、也指不出是哪个控件设错了（用户只看到
       「一行都筛不出来」）。纠正方向取「以刚改的那一端为准」—— 最后输入的一端即用户意图，
       另一端同步跟随，并 toast 说明已同步（不静默改用户填过的值）。日期为 YYYY-MM-DD，
       字典序即时间序，直接比大小。 */
    case "idtFrom":
      IDT.f.regFrom = v;
      if (v && IDT.f.regTo && v > IDT.f.regTo) { IDT.f.regTo = v; toast("注册时间「止」已同步为与「起」同日：起始时间不能晚于结束时间"); }
      IDT.pg = 1; rerenderKeep(); break;
    case "idtTo":
      IDT.f.regTo = v;
      if (v && IDT.f.regFrom && v < IDT.f.regFrom) { IDT.f.regFrom = v; toast("注册时间「起」已同步为与「止」同日：结束时间不能早于起始时间"); }
      IDT.pg = 1; rerenderKeep(); break;
    case "idcSw": IDC.f.sw = v; IDC.pg = 1; rerenderKeep(); break;
    case "idcSt": IDC.f.st = v; IDC.pg = 1; rerenderKeep(); break;
    case "idaSw": IDAI.f.asw = v; IDAI.pg = 1; rerenderKeep(); break;
    case "idaTerm": IDAI.f.term = v; IDAI.pg = 1; rerenderKeep(); break;
    case "idaSt": IDAI.f.st = v; IDAI.pg = 1; rerenderKeep(); break;
  }
}
function idOnInput(e) {
  /* ★ 2026-10-12（R58 · 交-4）：中文输入法**组合态守卫** —— 与凭据页（credK / credFType / credFSt
     的 `if(ev.isComposing) return;`）同口径。原实现每敲一键即整页 idRerender（宿主 innerHTML 重建、
     输入节点被换掉）⇒ 拼音组合被打断。组合结束后浏览器会再补一次 isComposing=false 的 input
     事件，终值仍会渲染，故守卫不丢值。 */
  if (e.isComposing) return;
  var t = e.target;
  if (!t || !t.id) return;
  var rerender = idRerender;
  var rerenderKeep = function (el) { var pos = el.selectionStart; rerender(); var n = document.getElementById(el.id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} } };
  switch (t.id) {
    case "idswK":   IDS.f.k = t.value; IDS.pg = 1; rerenderKeep(t); break;
    case "idagswK": IDA.f.k = t.value; IDA.pg = 1; rerenderKeep(t); break;
    case "iduK": IDU.f.k = t.value; IDU.pg = 1; rerenderKeep(t); break;
    case "idtK": IDT.f.k = t.value; IDT.pg = 1; rerenderKeep(t); break;
    case "idcK": IDC.f.k = t.value; IDC.pg = 1; rerenderKeep(t); break;
    case "idaK": IDAI.f.k = t.value; IDAI.pg = 1; rerenderKeep(t); break;
  }
}
/* 分页入口（pgmk 以「函数名(页码)」生成 onclick，故必须是全局函数） */
function iduPg(p) { IDU.pg = Math.max(1, p | 0); renderIdUser(); }
function idtPg(p) { IDT.pg = Math.max(1, p | 0); renderIdTerm(); }
function idswPg(p) { IDS.pg = Math.max(1, p | 0); renderIdCSW(); }
function idcPg(p) { IDC.pg = Math.max(1, p | 0); renderIdCIN(); }
function idagswPg(p) { IDA.pg = Math.max(1, p | 0); renderIdAGSW(); }
function idaPg(p) { IDAI.pg = Math.max(1, p | 0); renderIdAGIN(); }

/* ---------- 10. 挂载分页器（各页渲染后调用；面板不存在时静默跳过） ---------- */
function idMountPagers() {
  /* 末位提示不再写「勾选/批量」：本模块列表**未提供勾选框**，承诺批量操作是无处兑现的假入口。 */
  var HINT = "未开放批量操作";
  if (document.getElementById("iduPager")) pgmk("#iduPager", idUserFiltered().length, IDU.pg, "iduPg", "个用户", LIST_PAGE, HINT);
  if (document.getElementById("idtPager")) pgmk("#idtPager", idTermFiltered().length, IDT.pg, "idtPg", "台终端", LIST_PAGE, HINT);
  if (document.getElementById("idswPager")) pgmk("#idswPager", idSwFiltered().length, IDS.pg, "idswPg", "个软件", LIST_PAGE, HINT);
  if (document.getElementById("idcPager")) pgmk("#idcPager", idCinFiltered().length, IDC.pg, "idcPg", "个实例", LIST_PAGE, HINT);
  if (document.getElementById("idagswPager")) pgmk("#idagswPager", idAgSwFiltered().length, IDA.pg, "idagswPg", "个智能体软件", LIST_PAGE, HINT);
  if (document.getElementById("idaPager")) pgmk("#idaPager", idAgInFiltered().length, IDAI.pg, "idaPg", "个智能体实例", LIST_PAGE, HINT);
}

/* ---------- 11. 事件挂载（在 bootstrap 里按当前页调用一次） ---------- */
function idMountEvents() {
  ["pg-iduser", "pg-idterm", "pg-idcsw", "pg-idcin", "pg-idagsw", "pg-idagin"].forEach(function (pid) {
    var el = document.getElementById(pid);
    if (!el) return;
    el.addEventListener("click", idOnClick);
    el.addEventListener("change", idOnChange);
    el.addEventListener("input", idOnInput);
    el.addEventListener("keydown", idOnKey);
  });
  /* ★ 2026-10-10（R15-E）：弹窗是**页面容器的兄弟节点**（#dlg1 挂在 body 下，不在任一 pg-* 内），
     故弹窗内的 [data-idact] 控件此前**一律无委托可达** —— 点了没反应；而死按钮门禁只校验
     「动作名有没有 case」，不校验「元素在不在被委托的容器里」⇒ 整类缺陷不被拦住（门禁盲区）。
     实测：客户端软件编辑弹窗「＋ 增加操作系统版本」点击后行数不变（探针 F36-7b FAIL）。
     data-idact 是身份模块独占属性名（认证段 0 处使用），补挂 #dlg1 无串扰。 */
  var dlg = document.getElementById("dlg1");
  if (dlg) dlg.addEventListener("click", idOnClick);
}

