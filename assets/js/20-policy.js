/* ==========================================================================
   白泽零信任 · 安全策略模块（已并入《原型-资产管理-20260907.html》）
   资产访问控制策略（资产准入） / 资产细粒度访问策略（资源级判定）
   复用宿主 $/$$/toast/ASSETS/byId/showPage/curAsset；mock 数据与资产列表同源
   ========================================================================== */

/* ===== 本模块局部工具（宿主已有 $/$$/toast，不重复定义） ===== */
/* ★ 2026-10-12（R56 · C-3）：补单引号 —— 此前只转义 & < > "，落到**单引号包裹的属性**里即被截断。
   当前全站属性一律用双引号、且未出现 title='/aria-label='/onclick=' 写法，故尚不可利用；
   但转义函数是「属性安全的唯一出口」，漏一个引号形态等于把安全性押在书写习惯上。 */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* ★ R61·轮8：日期锚定**演示基准日**（AU_TS_STAMP 的日期部分）、时刻取真实时分 ——
   原实现取真实系统日 ⇒ 本模块声明的基准日是 2026-09-30，而运行期写入的「最近变更 / 访问要求设置时间」
   却是真实当天，同一列并列两个「今天」（70-dp.js `dpNowTs()` 的注释已就同一问题给出同款范式）。 */
const nowTs = () => { const d = new Date(); const p = n => String(n).padStart(2, "0"); return `${AU_TS_STAMP.slice(0, 10)} ${p(d.getHours())}:${p(d.getMinutes())}`; };

/* ★ R61·轮11：当前操作人（审计署名）—— 复用页面基座 opUser()（读 #topbarUser，随会话身份回填；范式同 30-websec.js 的 wsOp()）。
   原实现全模块硬编码「张伟」⇒ 换人评审时署名不随身份变化；且启停 / 复制只更 at 不更 by，「更新：时间 · 人」两个分量不同源。
   种子数据的 by（历史创建人，多元）不在本改动内。 */
function polOp(){ return (typeof opUser === "function") ? (String(opUser() || "").trim() || "张伟") : "张伟"; }


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

/* ===== 客户端软件（受控清单：软件名称 + 已登记版本序列） =====
   ★ R55（上下文-5）：取值域**由身份台账 `ID.csw` 派生** —— 该台账是「客户端软件」的权威源
   （含版本 / 证书 / 可访问资产 / 认证方式）；此前本段另立一份 `SOFT_LIB`（sw_bz…），与身份侧
   id / 名**零交集** ⇒ ABAC 条件 `client.software` 所指软件在台账中查无此物（策略恒不命中）。
   资产段在身份段之前执行，故此处**惰性派生**（首次取用时身份段已就绪；台账不可用则回落演示值）。 */
const SOFT_LIB_FALLBACK = [
  { id: "sw_bz", name: "白泽客户端", os: "Windows", versions: ["2.0.0", "2.1.0", "2.2.0", "2.3.0", "2.4.1"] },
  { id: "sw_bz_mac", name: "白泽客户端（macOS）", os: "macOS", versions: ["2.1.0", "2.3.0", "2.4.1"] },
  { id: "sw_ops", name: "运维巡检助手", os: "Windows", versions: ["1.2.0", "1.4.0", "1.5.2"] },
  { id: "sw_ebank", name: "网银安全控件", os: "Windows", versions: ["1.0.0", "1.1.0"] },
];
let _softLibCache = null;
function softLib() {
  if (_softLibCache) return _softLibCache;
  try {
    if (typeof ID !== "undefined" && ID && Array.isArray(ID.csw) && ID.csw.length) {
      _softLibCache = ID.csw.map(s => {
        const vs = []; (s.osver || []).forEach(o => { if (o && o.ver && vs.indexOf(o.ver) < 0) vs.push(o.ver); });
        return { id: s.id, name: s.name, os: "", versions: vs };
      });
      return _softLibCache;
    }
  } catch (e) { /* 身份段未就绪：回落演示值 */ }
  return (_softLibCache = SOFT_LIB_FALLBACK);
}
const softById = id => softLib().find(s => s.id === id);
const softByName = n => softLib().find(s => s.name === n);

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
  { id: "user.account", cat: "subject", dim: "user", label: "账号", type: "ref-search", ops: ["eq", "ne", "in"], q: "any", editor: "E11", scope: "both", src: "平台身份链", ex: "zhangwei（张伟）" },
  { id: "user.org", cat: "subject", dim: "user", label: "所属组织机构", type: "org", ops: ["in", "notin"], q: "any", editor: "E3", scope: "both", src: "平台身份链", ex: "电子银行部（含子组织）" },
  { id: "user.dept", cat: "subject", dim: "user", label: "部门", type: "enum-multi", ops: ["in", "notin"], q: "both", editor: "E2", scope: "both", src: "平台身份链", ex: "电子银行部 / 信贷管理部（一人可兼多部门）" },
  { id: "user.post", cat: "subject", dim: "user", label: "岗位", type: "enum-multi", ops: ["in", "notin"], q: "both", editor: "E2", scope: "both", src: "平台身份链", ex: "客户经理 / 审批岗（一人可兼多岗）" },
  { id: "user.rank", cat: "subject", dim: "user", label: "职级", type: "enum-order", ops: ["eq", "ne", "gte", "lte", "between"], q: "none", editor: "E4", scope: "both", src: "平台身份链", ex: "经理（及以上）" },
  { id: "user.role", cat: "subject", dim: "user", label: "角色", type: "enum-multi", ops: ["contains", "notcontains"], q: "both", editor: "E2", scope: "both", src: "平台身份链", ex: "系统管理员 / 审计管理员（一人可兼多角色，多取值时按「任一命中 / 全部具备」判定）" },
  { id: "user.group", cat: "subject", dim: "user", label: "用户组", type: "enum-multi", ops: ["in", "notin"], q: "both", editor: "E2", scope: "both", src: "平台身份链", ex: "核心业务值守组" },
  { id: "user.tag", cat: "subject", dim: "user", label: "标签", type: "enum-multi", ops: ["contains", "notcontains"], q: "both", editor: "E2", scope: "both", src: "平台身份链", ex: "审批人 / 外协人员（一人可带多标签）" },
  { id: "user.state", cat: "subject", dim: "user", label: "账号状态", type: "enum-multi", ops: ["in", "notin"], q: "any", editor: "E2", scope: "both", src: "平台身份链", ex: "已启用 / 已锁定 / 已禁用（取自身份台账的账号状态；多取值按白名单判定，等价于排除其余档）" },
  { id: "user.perm", cat: "subject", dim: "user", label: "业务权限", type: "ref-search", ops: ["allof", "anyof"], q: "none", editor: "E11", scope: "both", src: "权限字典", ex: "转账审批权（「全部具备 / 任一命中」由运算符承载）" },
  /* --- 主体属性 · 认证（会话认证强度，两形态均可得；页 A 用于判定是否需要追加认证） --- */
  { id: "auth.level", cat: "subject", dim: "auth", label: "安全级别", type: "enum-order", ops: ["eq", "ne", "gte", "lte", "between"], q: "none", editor: "E4", scope: "both", src: "会话认证记录", ex: "≥ 3 级（级别越高越强）" },
  { id: "auth.method", cat: "subject", dim: "auth", label: "认证方式", type: "enum-multi", ops: ["in", "notin"], q: "any", editor: "E2", scope: "both", src: "会话认证记录", ex: "短信验证码 / 企业微信扫码（同级等效，命中任一即达标）" },
  { id: "auth.composite", cat: "subject", dim: "auth", label: "复合方式数", type: "enum-order", ops: ["eq", "ne", "gte", "lte"], q: "none", editor: "E4", scope: "both", src: "会话认证记录", ex: "≥ 2（两种以上方式叠加）" },
  /* --- 主体属性 · 客户端软件（仅"有端接入"可得） --- */
  { id: "client.software", cat: "subject", dim: "client", label: "客户端软件", type: "composite-soft", ops: ["sw"], q: "none", editor: "E1+E10+E4", scope: "agent", src: "身份台账（客户端软件）/ SDK 上报", ex: "白泽客户端（PC）（版本 ≥ 3.1.8）" },
  { id: "client.os", cat: "subject", dim: "client", label: "运行操作系统", type: "enum-multi", ops: ["in", "notin"], q: "any", editor: "E2", scope: "agent", src: "有端 SDK 上报", ex: "Windows / macOS / Linux（一台终端只运行一个系统）" },
  { id: "client.sign", cat: "subject", dim: "client", label: "软件签名状态", type: "enum-multi", ops: ["in", "notin"], q: "any", editor: "E2", scope: "agent", src: "SDK 校验", ex: "已签名 / 未签名 / 校验失败（多取值按白名单判定，等价于排除其余档）" },
  { id: "client.managed", cat: "subject", dim: "client", label: "托管授权状态", type: "bool", ops: ["eq", "ne"], q: "none", editor: "E8", scope: "agent", src: "网关托管凭据", ex: "已托管 / 未托管" },
  /* --- 主体属性 · 终端设备（仅"有端接入"可得） --- */
  { id: "device.serial", cat: "subject", dim: "device", label: "设备序列号", type: "list", ops: ["in", "notin"], q: "any", editor: "E9", scope: "agent", src: "有端 SDK 采集", ex: "SN-2026-0001…（一机一号；支持批量粘贴，去重后生效）" },
  { id: "device.org", cat: "subject", dim: "device", label: "设备所属组织机构", type: "org", ops: ["in", "notin"], q: "any", editor: "E3", scope: "agent", src: "设备台账 / 注册绑定", ex: "科技管理部（含子组织）" },
  { id: "device.owner", cat: "subject", dim: "device", label: "设备所属人员", type: "ref-search", ops: ["eq", "ne", "in"], q: "any", editor: "E11", scope: "agent", src: "设备台账 / 注册绑定", ex: "zhangwei（张伟）" },
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
/* ★★★ 认证方式字典 —— 全平台**方式名 + 方式固有属性**的唯一真源（本块即字典）★★★
   取值口径取自《零信任无端接入网关-产品需求文档PRD-一期-202609018.md》F5.4
   「认证方式字典（安全级别 L1~L5 · 同级可含多种等效方式）」表，及 F5.4 规则 12：
     认证方式字典是**方式名**的唯一取值域来源 —— 策略条件、资源级访问要求、控制台提示与
     合规说明均引用本字典，**不各自另立方式名**。
   ★★★ 级别不归字典所有 —— 安全级别是「认证源 × 认证方式」的**联合判定结果** ★★★
     · 本字典**不定义**任何方式的级别，也**不承载**「哪一档由哪些方式构成」的归属关系；
     · 同一方式在不同认证源下级别可以不同：本地账号体系的「账号密码」（平台自己保管、可强制
       口令策略、可锁定、可审计）与某外部 IdP 的「账号密码」（平台只接收断言、无法校验对方
       策略）**强度与适用范围完全不同**；
     · 字典里保留的 defLv 只是**参考默认级别** —— 新建「源 × 方式」记录时给出的初值，
       **不构成裁决依据**；策略求值、控制台提示、合规说明一律读「源 × 方式」记录上的级别。
       （唯一例外是「认证器登记」：认证器级别由方式的固有属性 `authrLv` 唯一确定，
        同样**不经 defLv 反查** —— 详见 AU_METHODS 注释。）
   ⇒ 身份模块客户端软件（ID_AMETH_DEF）、新建客户端弹窗（amethAll）等**方式名清单**由本数组
     **派生**，不得各自另写一套；但**不得**由本数组反查派生任何「档位 → 方式集合」视图。
   **级别档位固定 L1~L5 且序不变**（不新增、不删除）；可自定义的是级别名称与判定含义。
   因此「认证」维度拆为两个可引用属性：auth.level 取级别做强度门槛（按级别序比较），
   auth.method 取具体方式做方式限定 —— 二者取值域不同源：auth.level 的档位是平台常量，
   auth.method 的方式名取自本字典。
   ⚠ 抗钓鱼是方式的**固有属性**（取决于该方式是否具备**源绑定**能力），随字典登记；
     **抗钓鱼由源绑定派生（anti ≡ srcBind），不提供独立开关** —— 不具备源绑定能力的方式
     无法通过任何配置变得抗钓鱼。
   ⚠ **人机校验不进本字典、不占任何档位、不计入会话档位**。
   ⚠ 一期会话认证强度上限为 L2；L3~L5 方式在二期承载（一期策略声明高于 L2 时保存侧强提示、
     不阻断保存）。 */
/* ⚠⚠ 口径（最容易错的一条）：本表的「档位 → 方式集合」是**参考归属 / 示例**，
   **不是**该方式在任何认证源下的实际安全级别，**不构成裁决依据**。
   —— 级别是（认证源 × 认证方式）的**联合判定**结果：本地账号体系的「账号密码」（平台自己
      保管、可强制口令策略、可加锁定、可审计）与某外部 IdP 的「账号密码」（平台只接收断言、
      无法校验对方策略）**强度与适用范围完全不同**。转述、引用、策略求值一律读「源 × 方式」
      记录上判定出的那一档，不要读本表。
   —— 这里的初值仅在**新建「源 × 方式」记录**时给出默认选中项，落库后可改。 */
/* 级别档位定义 —— **只描述档位本身**（序、名称、判定含义、承载期次）。
   ⚠ 本表**不含「该档由哪些方式构成」**：档位不是方式的归属容器，方式与档位之间没有固定映射；
     「该档可否抗钓鱼」同理不在此列 —— 抗钓鱼是**方式**的固有属性（见 AU_METHODS.srcBind）。 */
var AU_LEVELS = [
  { lv: 1, name: "无感代填",       desc: "用户本次未手工提交凭据，由平台以自管方式完成访问所需认证（会话身份 + 托管凭据代填 / 出站 token 注入）—— 本档只是当前会话的最低强度，与「匿名开放」不同：匿名开放免的是整条认证链", res: "一期" },
  { lv: 2, name: "单因素",         desc: "单因素凭证", res: "一期" },
  { lv: 3, name: "一次性验证码",   desc: "一次性验证码类", res: "二期承载" },
  { lv: 4, name: "硬件与生物特征", desc: "本地生物特征与硬件令牌", res: "二期承载" },
  { lv: 5, name: "活体生物特征",   desc: "生物特征（需活体检测，最强档）", res: "二期承载" }
];
/* 认证方式清单 —— 字典登记的是**方式名**与**方式的固有属性**：
     · inherent    凭据固有属性（客观形态，与源无关）
     · srcBind     是否具备**源绑定**能力（抗钓鱼的技术判据：srcBind ⇒ anti，页面只读派生）
     · interactive 是否需用户手工提交凭据（「无感代填」由平台自动完成，不在其列）
     · inSession   是否计入会话认证档位
     · defLv       **参考默认级别** —— 新建「源 × 方式」记录时的初值，非该方式的安全级别
     · authrLv     **可否作「强认证器」登记的固有属性** —— 填 4 / 5 表示该方式可作 L4 / L5
                   强认证器（硬件令牌、设备端 / 活体生物特征）；不填即不可作认证器。
                   ⚠ 它是**方式的属性**，不由 defLv 反查 —— 由参考级别反推「L4 / L5 档由哪些
                     方式构成」正是本块明文禁止的「档位 → 方式集合」视图。
   ★ 每条的 defLv 都是**参考值**：真正生效的级别由「源 × 方式」记录联合判定，本条不作裁决。
   ★ 方式名统一口径：「免认证登录」更名为「无感代填」—— 经平台的免登录认证同样完成了访问
     所需认证（会话身份 + 托管凭据代填 / 出站 token 注入），它是**平台自己提供的一种方式**。 */
var AU_METHODS = [
  { id: "none",   name: "无感代填",         defLv: 1, srcBind: false, interactive: false, inherent: "用户无手工提交；平台以自管方式完成（会话身份 + 托管凭据代填 / 出站 token 注入）", inSession: true },
  { id: "pwd",    name: "账号密码",         defLv: 2, srcBind: false, interactive: true,  inherent: "口令形态凭据（单因素）", inSession: true },
  { id: "email",  name: "邮箱验证码",       defLv: 2, srcBind: false, interactive: true,  inherent: "带外通道凭据（一次性）", inSession: true },
  { id: "sms",    name: "短信验证码",       defLv: 3, srcBind: false, interactive: true,  inherent: "带外通道凭据（一次性）", inSession: true },
  { id: "wecom",  name: "企业微信扫码",     defLv: 3, srcBind: false, interactive: true,  inherent: "带外通道凭据（第三方 IdP 扫码）", inSession: true },
  { id: "otp",    name: "动态口令",         defLv: 3, srcBind: false, interactive: true,  inherent: "时间同步软 / 硬令牌", inSession: true },
  { id: "fp",     name: "指纹识别",         defLv: 4, authrLv: 4, srcBind: true,  interactive: true,  inherent: "设备端生物特征认证器（源绑定）", inSession: true },
  { id: "usbkey", name: "USB Key 硬件令牌", defLv: 4, authrLv: 4, srcBind: true,  interactive: true,  inherent: "外接硬件令牌（源绑定）", inSession: true },
  { id: "fr",     name: "人脸识别",         defLv: 4, authrLv: 4, srcBind: true,  interactive: true,  inherent: "设备端生物特征认证器（源绑定）", inSession: true },
  { id: "face",   name: "活体人脸识别",     defLv: 5, authrLv: 5, srcBind: true,  interactive: true,  inherent: "生物特征 · 需活体检测（源绑定）", inSession: true },
  { id: "iris",   name: "虹膜识别",         defLv: 5, authrLv: 5, srcBind: true,  interactive: true,  inherent: "生物特征 · 需活体检测（源绑定）", inSession: true }
];
/* 内置方式内码集 —— 由种子一次性确定：**内置方式不可删除**（删掉会让方式名取值域残缺、
   已落库的「源 × 方式」记录悬空）；运行时自建方式内码不在集内，未引用即可删。 */
var AU_BUILTIN_IDS = AU_METHODS.map(function (m) { return m.id; });
/* 可被**认证源**登记的方式集合 —— **即全字典**（含「无感代填」）。
   曾以「不是某个身份体系能提供的凭据方式」为由把「无感代填」排除在外，该理由不成立：
   经平台的免登录认证**同样完成了访问所需认证**（会话身份 + 托管凭据代填 / 出站 token 注入），
   它是**平台自己提供的一种方式**；其强度级别同样由「源 × 方式」联合判定，
   没有任何理由不让它进「源 × 方式」取值域。 */
var AU_SRC_METHODS = AU_METHODS.slice();
/* 认证模块的**运行时刻**（单一出处）—— 「上次测试 / 上次同步 / 登记时间」等运行期字段一律取此值；
   避免同一模块内出现多个基准时刻（原先 srcTest 与 srcSync 各写各的）。
   种子里的 lastTest（2026-09-29）是「上一次测试发生在昨天」，与运行时刻属不同语义，保持不动。 */
var AU_TS_STAMP = "2026-09-30 09:14";
/* ★ 2026-09-30 摘除：由字典反查派生的「档位 → 方式名集合」视图（原 AUTH_METHODS /
   AUTH_LV_NAMES / AUTH_LV_LABEL）。该视图把方式**按级别分组**，等于把级别挂回字典 ——
   与「级别是（认证源 × 认证方式）联合判定结果」的口径冲突。
   资产访问策略的 auth.method 取值域改为**方式名平铺**（见 VALUE_POOL），
   auth.level 取值域为平台固定的 L1~L5 档位常量。
   另：由方式名反推级别无处可推（字典只带参考值）—— 引擎按「源 × 方式」记录求值，
   策略侧不再由方式名反推级别（authCarryNote 只读显式声明的 auth.level）。 */
/* ★ 2026-10-10（R30）：本取值域改为**渲染时由字典派生** —— 原为加载期一次性 map 出的常量
   （`AUTH_METHOD_NAMES`），运行期在「认证方式字典」新增 / 删除方式后它仍停在初始快照
   ⇒ 策略条件选不到新方式、已删方式仍可选。字典是**方式名的唯一取值域**，
   取值域必须随字典实时同步（见 VALUE_POOL 的 auth.method 取值）。 */
function authMethodNames() {
  var ms = (typeof AU !== "undefined" && AU && AU.dict && AU.dict.methods) ? AU.dict.methods : AU_METHODS;
  return ms.map(function (m) { return m.name; });
}
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
  /* ⚠ 只读**显式声明**的 auth.level —— 不再由 auth.method 的方式名反推级别：
     字典的方式只带**参考默认级别**，据其反推等于拿参考值当裁决依据（已废止）。 */
  const lv = v.lv || 0;
  return lv > 2 ? `认证安全级别 ≥ L${lv} 高于一期承载上限 L2：该档位待二期承载后生效，本期按 L2 承载` : "";
}

/* 属性可选值域（演示字典） */
/* 属性可选值域（演示字典）
   **渲染层不再为任何属性兜底取值**：凡由取值池驱动的编辑器（enum-one / bool / enum-multi /
   ref-search / enum-order）都必须在此登记，缺失即进入显式空态。
   历史缺陷：device.reg 未登记 → 落到兜底分支渲染成软件签名状态的取值；三条引用型属性
   （账号 / 业务权限 / 设备所属人员）未登记 → 多选弹层空白、无从取值。 */
/* ★ R50（跨模块一致性 · X4-3/X4-4）：ABAC 两个引用型属性的取值域改为**由身份管理台账派生**。
   原为**静态列表**（姓名与账号并列写死，且两者拼音互不匹配）—— 三处缺陷：
     ① 姓名与账号拼音错配（账号按另一套假名填，与姓名不是同一人）；
     ② 4 人不在身份台账 users（台账只有 7 人）；
     ③ 配对属性 user.account(6 项) 与 device.owner(5 项) 长度不一 —— 而二者的属性契约是
        `["user.account","device.owner"]` 的**同源比较**，域不同即比较恒假。
   两项分别声明来源 `平台身份链` / `设备台账 · 注册绑定` ⇒ 取值域必须自身份台账派生（单一真源）。
   身份台账未就绪时主动补装一次；仍不可用则回落空数组（编辑器进显式空态，不渲染无来源取值）。 */
function idUserPool() {
  try {
    if ((typeof ID === "undefined" || !ID) && typeof idLoad === "function") idLoad();
    if (typeof ID !== "undefined" && ID && ID.users && ID.users.length) {
      return ID.users.map(function (u) { return u.acct + "（" + u.name + "）"; });
    }
  } catch (e) { /* 身份台账未就绪 */ }
  return [];
}
/* ★ 2026-10-12（R53 · A2-F4）：`user.state` 声明 src=平台身份链 ⇒ 取值域必须由身份台账派生
   （与 user.account / device.owner 同判据）。原为静态「在职 / 离职 / 停职」—— 与台账的账号状态
   （已启用 / 已锁定 / 已禁用）完全不相交，使种子策略 asp-a4-1「用户账号状态 ∈ 在职」恒不命中；
   且属性 ex 写「停用」而取值池写「停职」，定义内部即不一致。 */
function idAccountStatePool() {
  try {
    if ((typeof ID === "undefined" || !ID) && typeof idLoad === "function") idLoad();
    if (typeof ID !== "undefined" && ID && ID.users && ID.users.length) {
      var seen = {}, out = [];
      ID.users.forEach(function (u) { if (u.st && !seen[u.st]) { seen[u.st] = 1; out.push(u.st); } });
      if (out.length) return out;
    }
  } catch (e) { /* 身份台账未就绪 */ }
  return [];
}
/* 资产负责人候选 = 身份台账用户姓名（去重）。资产责任人取值域与身份台账同源，
   避免「登记时手输任意姓名」在各模块间造出又一套人名册（R51）。 */
function idUserNamePool() {
  try {
    if ((typeof ID === "undefined" || !ID) && typeof idLoad === "function") idLoad();
    if (typeof ID !== "undefined" && ID && ID.users && ID.users.length) {
      var seen = {}, out = [];
      ID.users.forEach(function (u) { if (u.name && !seen[u.name]) { seen[u.name] = 1; out.push(u.name); } });
      return out;
    }
  } catch (e) { /* 身份台账未就绪 */ }
  return [];
}
/* 设备所属人员 = 终端台账的登记归属人（经 ownerId 映射到账号），去重后与 user.account 同格式。 */
function idDevOwnerPool() {
  try {
    if ((typeof ID === "undefined" || !ID) && typeof idLoad === "function") idLoad();
    if (typeof ID !== "undefined" && ID && ID.terms && ID.terms.length) {
      var seen = {}, out = [];
      ID.terms.forEach(function (t) {
        var u = (ID.users || []).filter(function (x) { return x.id === t.ownerId; })[0];
        if (u && !seen[u.acct]) { seen[u.acct] = 1; out.push(u.acct + "（" + u.name + "）"); }
      });
      return out;
    }
  } catch (e) { /* 身份台账未就绪 */ }
  return [];
}
/* ★ 2026-10-12（R57 · 表-8）：平台组织树 ORG_TREE 是**组织/部门名的单一真源** ——
   ABAC 属性 user.dept（部门）与 user.org（组织机构）同源派生；资产登记面的「所属部门」、
   身份台账的「归属组织」也一律以组织树为准，不再各写一套名册。
   组织树未就绪则回落空数组（编辑器进显式空态，不渲染无来源取值）。 */
function idOrgDeptPool() {
  try {
    if (typeof ORG_TREE !== "undefined" && ORG_TREE[0] && ORG_TREE[0].kids) {
      return ORG_TREE[0].kids.map(function (n) { return n.name; });
    }
  } catch (e) { /* 组织树未就绪 */ }
  return [];
}
const VALUE_POOL = {
  get "user.account"() { return idUserPool(); },
  /* ★ 2026-10-12（R57 · 表-8）：原为写死字面量 —— 与 ORG_TREE 的一级部门名重复维护且无闸守护。 */
  get "user.dept"() { return idOrgDeptPool(); },
  "user.post": ["客户经理", "审批岗", "运维岗", "数据开发", "风控专员"],
  "user.rank": ["专员", "经理", "总监", "总经理"],
  "user.role": ["系统管理员", "安全管理员", "审计管理员", "操作员"],
  "user.group": ["核心业务值守组", "变更评审组", "值守组"],
  "user.tag": ["审批人", "外协人员", "常态化出差", "驻场运维"],
  get "user.state"() { return idAccountStatePool(); },
  "user.perm": ["转账审批权", "付款审批权", "账户查询权", "批量代发权", "参数维护权", "报表导出权"],
  "auth.level": ["1 级", "2 级", "3 级", "4 级", "5 级"],
  /* 认证方式**平铺**（不再按级别分组）—— 级别是（认证源 × 认证方式）联合判定的结果，
     不是方式的分组依据；按级别分组会把级别重新挂回字典。 */
  get "auth.method"() { return authMethodNames(); },
  "auth.composite": ["1", "2", "3"],
  "client.os": ["Windows", "macOS", "Linux"],
  "client.sign": ["已签名", "未签名", "校验失败"],
  "client.managed": ["已托管", "未托管"],
  get "device.owner"() { return idDevOwnerPool(); },
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
  /* a15（L1 · 全部资源为 HTTP）：演示「声明整资产匿名开放」的唯一可达候选 —— 须为**无端接入**
     （有端形态会被 anonOn 的 hasMode(a,"agent") 前置校验拦下，导致该演示路径不可达）；a19 承担「已声明匿名」样例 */
  a15: { modes: ["agentless"], net: { rules: 5,  proto: "仅 CONNECT" } },
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
              { t: "c", attr: "user.role", op: "contains", v: ["系统管理员"], q: "any", mode: "const" } ] },
            { t: "c", attr: "client.software", v: { sw: "sw_baize_pc", verOp: "gte", ver: "3.1.8" }, mode: "const" },
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
        { id: "asp-a3-1", name: "数据管理部运维网段准入", action: "allow", on: true, by: "陈丽", at: "2026-09-10 10:26", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_data"], inc: true, mode: "const" },
            { t: "c", attr: "env.ip", op: "in", v: ["10.20.5.0/24"], mode: "const" } ] } },
        { id: "asp-a3-2", name: "非授信网段访问拒绝", action: "reject", on: false, by: "陈丽", at: "2026-09-10 10:31", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "env.ip", op: "notin", v: ["10.20.5.0/24"], mode: "const" } ] } },
      ],
    },
    a4: {
      agentless: [
        { id: "asp-a4-1", name: "综合管理部准入", action: "allow", on: true, by: "周琴", at: "2026-09-06 09:12", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_admin"], inc: true, mode: "const" },
            { t: "c", attr: "user.state", op: "in", v: ["已启用"], mode: "const" } ] } },
      ],
    },
    a6: {
      agentless: [
        { id: "asp-a6-1", name: "合规部与报送专线准入", action: "allow", on: true, by: "陈丽", at: "2026-09-05 16:40", cond:
          { t: "g", op: "or", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_comp"], inc: true, mode: "const" },
            { t: "c", attr: "env.nettype", op: "in", v: ["专线"], mode: "const" } ] } },
      ],
      agent: [
        { id: "asp-a6-2", name: "报送终端准入", action: "allow", on: true, by: "陈丽", at: "2026-09-05 16:52", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_comp"], inc: true, mode: "const" },
            { t: "c", attr: "device.org", op: "in", v: ["org_comp"], inc: true, mode: "const" } ] } },
      ],
    },
    a9: {
      agentless: [
        { id: "asp-a9-1", name: "手机银行后台运维准入", action: "allow", on: true, by: "李俊", at: "2026-09-06 11:30", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.role", op: "contains", v: ["系统管理员"], q: "any", mode: "const" },
            { t: "c", attr: "env.ip", op: "in", v: ["10.20.0.0/16"], mode: "const" } ] } },
      ],
    },
    a13: {
      /* 未开通 + 双形态：两个策略组各自独立配置与计数 */
      agentless: [
        { id: "asp-a13-1", name: "合规部与报送专线准入", action: "allow", on: true, by: "陈丽", at: "2026-09-10 09:48", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_comp"], inc: true, mode: "const" } ] } },
      ],
      agent: [
        { id: "asp-a13-2", name: "报送终端准入（设备归属校验）", action: "allow", on: true, by: "陈丽", at: "2026-09-10 09:55", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_comp"], inc: true, mode: "const" },
            { t: "c", attr: "device.org", op: "in", v: ["org_comp"], inc: true, mode: "const" } ] } },
      ],
    },
    a10: { agentless: [] },
    a20: {
      agent: [
        { id: "asp-a20-1", name: "堡垒机运维终端准入", action: "allow", on: true, by: "张伟", at: "2026-09-08 14:05", cond:
          { t: "g", op: "and", ch: [
            { t: "c", attr: "user.org", op: "in", v: ["org_tech"], inc: true, mode: "const" },
            { t: "c", attr: "user.role", op: "contains", v: ["系统管理员", "审计管理员"], q: "any", mode: "const" },
            { t: "c", attr: "client.software", v: { sw: "sw_baize_pc", verOp: "gte", ver: "3.2.1" }, mode: "const" },
            { t: "c", attr: "device.serial", op: "in", v: ["SN-2026-0001", "SN-2026-0002"], mode: "const" } ] } },
        { id: "asp-a20-2", name: "非运维网段访问拒绝", action: "reject", on: true, by: "张伟", at: "2026-09-08 14:12", cond:
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
  if (a.type === "composite-soft") { const sw = softLib().find(s => s.name === body); return Object.assign(base, { op: "sw", v: { sw: sw ? sw.id : "", verOp: "", ver: "" } }); }
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
    whyOff: !some ? "请先在列表中勾选要处理的资产" : (on > 0 ? "停用已勾选资产在全部形态组内的准入策略" : "已勾选资产的准入策略均为未启用状态，没有可停用的对象")
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
  const why = st === "撤销中" ? "撤销编排进行中" : (EN_ON(a) ? "无端访问编排未完成（请先在资产列表「状态」列点「重试」幂等续跑）" : "无端访问编排未完成（该资产未启用，「重试」入口不可用；请先启用资产）");
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
      <select id="saGrp"><option value="">全部资产分组</option>${[...new Set(ASSETS.map(a => a.grp))].map(g => `<option ${f.grp === g ? "selected" : ""}>${g}</option>`).join("")}</select>
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
   ① 从未登记过资产：本页按资产登记事实生效，引导至「资产列表」；
   ② 筛选条件没命中：给出一键清空，不让管理员逐个下拉去回忆改过什么。 */
function aspEmptyRow() {
  if (!ASSETS.length) {
    return `<tr><td colspan="7"><div class="empty"><div class="big">暂无已登记资产</div>`
      + `<span class="muted">本页的准入策略按资产登记事实生效——请先到「资产列表」登记并开通资产，再返回本页配置准入策略。</span></div></td></tr>`;
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
     **冻结集是「撤销中 / 异常」两项的不变量**（列表侧 rowFrozenTag / rowToggleBtn / aspRowSelectable 读同一判据），理由：
       · 未开通 / 开通中 / 已开通 —— 不冻结。开通中尚未载流（访问通道未建立），策略变更不与编排竞争，
         且自然在开通完成后生效；已开通下策略变更即热更新，本就要支持。
       · 未启用（资产停用）—— 不冻结：可先配置策略，启用后即生效（页脚口径）。
     判定只由 open（编排态）驱动、与 en（启用态）正交：未启用资产的异常态仍冻结（编排未收敛、变更不生效）。 */
  const openSt = a.open || "";
  const frozen = openSt === "撤销中" || openSt === "异常";
  const frozenWhy = frozen
    ? (openSt === "撤销中"
        ? "撤销编排进行中，策略变更与编排清理互斥；请待撤销完成后重新进入本页。"
        : (EN_ON(a) ? "无端访问编排未完成（异常），此间策略变更不会生效；请先在资产列表「状态」列点「重试」幂等续跑。" : "无端访问编排未完成（异常），此间策略变更不会生效；该资产当前未启用、「重试」入口不可用 —— 请先启用资产，再在资产列表「状态」列点「重试」幂等续跑。"))
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
  /* ★ R61：整资产匿名开放 ⇒ 细粒度覆盖率**不适用** —— 与同页列表 coverCell（返回「不适用（整资产匿名）」）
     同一事实两处一致；原实现只判 c.total，匿名资产仍渲染色条，与本页下方「不进入认证与授权链」横幅自相矛盾。 */
  const covCell = anon
    ? `<span class="muted">不适用（整资产匿名）</span>`
    : (c.total
    ? `<div class="cov-line inl" title="属性授权 ${c.attr} · 登录即可 ${c.login} · 显式公开 ${c.pub} · 默认拒绝 ${c.none} · 共 ${c.total} 条">
         ${stackBar([{ n: c.attr, c: "b1" }, { n: c.login, c: "b2" }, { n: c.pub, c: "b3" }, { n: c.none, c: "b0" }])}
         <span class="cov-sub"><span><s class="b1"></s>属性授权 ${c.attr}</span><span><s class="b2"></s>登录即可 ${c.login}</span><span><s class="b3"></s>显式公开 ${c.pub}</span><span><s class="b0"></s>默认拒绝 ${c.none}</span></span>
       </div>`
    : `<span class="muted">清单路径均已下线</span>`);
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
      <div class="ig"><div class="k">所属资产分组</div><div class="v">${esc(a.grp)}</div></div>
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
      <b>WAF、限流、请求约束与审计等安全防护照常生效</b>。如需按主体属性准入，请先在「资产细粒度访问策略」关闭整资产匿名开放声明。
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
      <button class="btn sm" data-act="polAll" data-v="off" ${frozen || !onPols ? `disabled title="${frozen ? frozenWhy : "本组策略均为未启用状态，没有可停用的对象"}"` : `title="停用本形态组的全部策略"`}>全部停用</button>
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
        ${softLib().map(s => `<option value="${s.id}" ${(c.v || {}).sw === s.id ? "selected" : ""}>${s.name}</option>`).join("")}</select>
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
    ? `<div class="tip">本页条件组支持<b>用户维度</b>、<b>认证维度</b>（认证要求即认证维度条件行）与<b>环境属性（网络与时间类）</b>；客户端软件 / 终端设备、地理位置与接入网络类型归「资产访问控制策略」。认证维度属性取自平台认证方式字典：<b>级别档位固定 L1~L5 且序不变</b>（不新增不删除），级别名称与判定含义由平台内置；档位不是方式的归属容器，不存在「各级别下的方式集合」。</div>`
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
      : (EN_ON(a) ? "无端访问编排未完成，请先在资产列表「状态」列点「重试」幂等续跑。" : "无端访问编排未完成；该资产当前未启用、「重试」入口不可用 —— 请先启用资产，再在资产列表「状态」列点「重试」幂等续跑。")));
    return;
  }
  let p = null;
  if (polId) p = ((POLICIES[asId] || {})[mode] || []).find(x => x.id === polId);
  /* 动作只有「允许 / 拒绝」两态；历史数据中的其他动作一律归一为「允许」 */
  const act = p && p.action === "reject" ? "reject" : "allow";
  S.designer = p
    ? { asId, mode, polId, name: p.name, rootOp: p.cond.op, action: act, on: p.on, on0: p.on, tree: ensureUid(clone(p.cond)), by: p.by, at: p.at }
    /* 新建策略默认未启用：启用即生效，保存动作不自动扩大生效面（与「复制」副本同口径） */
    : { asId, mode, polId: null, name: "", rootOp: "", action: "allow", on: false, tree: { t: "g", op: "", ch: [], uid: uid() }, by: polOp(), at: "" };
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
const FG = { view: "list", cur: "", filter: {}, filterMx: {}, rq: null, batch: null, sel: new Set() };   /* ★ R61·轮12：filter = 列表页筛选，filterMx = 矩阵页筛选 —— 两页字段集不同（列表 k/grp/type/lv/en/fam；矩阵 k/res/rq/risk），共用一个对象会互相整体替换、静默清空对方 */

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
/* 列表空态分流（与页 A aspEmptyRow 同口径）：① 未登记资产 → 引导「资产列表」；
   ② 筛选无命中 → 一键清空。两种「空」的成因与去处不同，不得共用一套话术。 */
function fgEmptyRow() {
  if (!ASSETS.length) {
    return `<tr><td colspan="7"><div class="empty"><div class="big">暂无已登记资产</div>`
      + `<span class="muted">本页的资源级访问要求按资产登记事实生效——请先到「资产列表」登记资产（未开通资产同样可提前配置），再返回本页配置访问要求。</span></div></td></tr>`;
  }
  return `<tr><td colspan="7"><div class="empty"><div class="big">无匹配资产</div>`
    + `<span class="muted">当前筛选条件下没有资产，调整筛选条件后重试</span>`
    + `<div style="margin-top:10px"><button class="btn sm" data-act="fgClearF">清空筛选条件</button></div></div></td></tr>`;
}
function renderFgList() {
  const f = FG.filter;   /* 列表页：只用列表字段集 */
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
    与「资产访问控制策略」同属<b>访问对象准入</b>，是同一个统一 ABAC 授权模型的两个粒度：<b>先做资产级准入（该资产能否访问），通过后再做本页的资源级准入（该资产下的该资源能否访问）</b>。两个粒度与主体属性、环境属性在<b>同一轮求值</b>中比较，产出允许 / 追加认证 / 拒绝<b>一个</b>裁决。
    资源授权<b>对无端与有端两种接入形态共用同一份</b>——有端 L7 流量经可信转发进入无端网关执行本判定，因此本页不出现形态切换器。
    <br><b>除允许匿名访问的范围外，所有资产越权即拒绝</b>：未配置即默认拒绝、不达上游。
    <button class="btn link" data-act="aspList">前往「资产访问控制策略」→</button>
  </div></div>
  <div class="card"><div class="card-b">
    <div class="toolbar" style="margin-bottom:12px">
      <div class="input-w"><input type="search" id="gK" placeholder="搜索资产名称 / 域名" style="width:220px" value="${esc(f.k || "")}"><i>搜索</i></div>
      <select id="gGrp"><option value="">全部资产分组</option>${[...new Set(ASSETS.map(a => a.grp))].map(g => `<option ${f.grp === g ? "selected" : ""}>${g}</option>`).join("")}</select>
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
  /* ★ R61·轮12：矩阵读**自己的**筛选对象 —— 此前与列表共用 `FG.filter`，于是列表页的搜索词会按「路径名」语义过滤矩阵，且矩阵筛选会把列表筛选整体清掉。 */
  const f = FG.filterMx;
  const modeTip = a.anon === "asset"
    ? `<div class="hint-row ro"><i class="ic">匿名开放</i><div><b>该资产整资产匿名开放，逐路径授权不适用。</b>全部资源直通、<b>仅免除用户认证</b>（WAF / 限流 / 请求约束 与审计照常生效）；关闭下方「资产级匿名开放声明」即可恢复。</div></div>`
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
    <tbody>${body || `<tr><td colspan="7"><div class="empty"><div class="big">无匹配路径</div><span class="muted">当前筛选条件下没有条目，调整筛选条件后重试</span><div style="margin-top:10px"><button class="btn sm" data-act="fgClearF">清空筛选条件</button></div></td></tr>`}</tbody></table></div>`}
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
    ? `<div class="hint-row ro"><i class="ic">匿名开放</i><div><b>该资产整资产匿名开放，资源级授权不适用。</b>全部资源<b>仅免除用户认证</b>（不做越权判定）；WAF、限流、请求约束与审计照常生效。</div></div>`
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
    { k: "public", t: "显式公开（public）", d: allowPub ? "命中即跳过主体认证、资产访问状态与准入判定；不跳过安全前置检查、限流、动态防护与审计。保存需二次确认。" : `不可选：匿名开放要求资产为 L1 级且资源协议为 HTTP${a && a.lv !== 1 ? "（当前资产 L" + a.lv + "）" : R.fam ? "（非 L7 族对象不适用）" : "（当前资源协议 " + objProto + "）"}。`, dis: !allowPub },
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
    认证维度属性（认证安全级别 / 认证方式 / 认证复合方式数）取自平台认证方式字典：<b>级别档位固定 L1~L5 且序不变</b>（不新增不删除），级别名称与判定含义由平台内置；新增同级方式<b>无需改写任何既有策略、也不使既有策略失效</b>，被认证源或访问策略引用（含已停用 / 已下线对象）的方式不可删除。一期会话认证强度上限为 <b>L2</b>，选到 L3~L5 时保存侧提示「待二期承载后生效」且不阻断保存。
  </div></div>
  <div class="hint-row" style="margin-top:8px"><i class="ic">影响面</i><div>
    <b>匿名开放范围之外的访问一律拒绝。</b>
    ${R.kind === "public" ? `选中「显式公开」：该${R.fam ? "对象" : "路径"}将<b>跳过主体认证、资产访问状态与准入策略判定</b>（不跳过安全前置检查、限流、动态防护与审计）——请确认其确实不含受保护数据。`
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
    const rec = R.kind === "attr" ? { kind: "attr", cond: cleanTree(R.cond), by: polOp(), at: nowTs() } : { kind: R.kind };
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
  } else if (R.kind === "none") {
    /* ★ R61：设为「默认拒绝」与「清除访问要求」是**同一结果**（对象回到未配置 → default deny）⇒ 同档二次认证
       （页内单条清除 fgClear / 批量清除 fgBatchClear 均已如此），原实现走 else 直接落库、零确认。 */
    ask2FA((R.batch && R.batch.length > 1 ? "批量设置" : "设置") + "访问要求为默认拒绝", doIt, null,
      `${R.fam ? `${esc(R.o.k)} <b>${esc(R.o.n)}</b>` : `路径 <b>${esc(R.pt.p)}</b>`} 将回到「未配置」 → <b>默认拒绝</b>（请求不达上游）。`);
  } else if (needReachWarn) {
    confirmDlg("网络层未登记目标白名单明细", `该资产的网络层准入（socks5 目标白名单）<b>仅登记条数、未登记目标明细</b>，本次保存<b>无法做可达面范围校验</b>：若登记目标不在实际白名单内，本策略将「配置存在、流量不可达」。
      <div class="note warn" style="margin-top:10px">建议先在「隧道与资产登记」补齐目标明细；本次仍可保存，变更入审计。</div>`, doIt, "仍然保存");
  } else doIt();
}
function cleanTree(n) { const o = {}; ["t", "op", "attr", "v", "inc", "q", "mode", "ref"].forEach(k => { if (n[k] !== undefined) o[k] = n[k]; }); if (n.t === "g") { o.ch = (n.ch || []).map(cleanTree); delete o.attr; } return o; }

/* ===== 确认弹窗 ===== */
/* ★ 2026-10-10（R11）：#dlgCfm 的焦点管理（与 #dlg1 的 openDlg / closeDlg 同源）。
   此前 confirmDlg / render2FA / cfmNo / cfmYes 都不做焦点处理 ⇒ 二次认证时焦点停在遮罩后的
   背景元素上，键盘用户必须手动 Tab 才到 #tfaPwd；确认 / 取消后焦点也不归还触发元素。
   #dlgCfm 被全站复用（不限认证模块）⇒ 修一处即全站受益。 */
function cfmFocusIn(sel) {
  try { if (!$("#dlgCfm").classList.contains("show")) window.__cfmPrevFocus = document.activeElement; } catch (_e) {}
  $("#dlgCfm").classList.add("show");
  try { var f = $(sel); if (f && f.focus) f.focus(); } catch (_e) {}
}
/* ★ 2026-10-10（R12）：重渲染后的**焦点复定位**基础设施（全站通用）。
   整段重渲染（认证模块 `auRerender` / 同类出口）会把被点元素的节点换掉，浏览器随即把焦点
   丢到 body —— 翻页、批量动作、二次认证确认后键盘用户失去落点。做法：渲染前记录「可复定位
   选择器」（id 优先，其次 data-* 动作锚点），渲染后**仅当焦点已落 body** 时按选择器找回，
   不抢其它控件的焦点。`cfmFocusBack` 与 `auRerender` 共用本组函数。 */
function domFocusKey(el) {
  if (!el || !el.getAttribute) return null;
  if (el.id) return "#" + el.id;
  var attrs = ["data-auact", "data-idact", "data-act", "data-ct", "data-aut", "data-pgr"];
  for (var i = 0; i < attrs.length; i++) {
    var v = el.getAttribute(attrs[i]);
    if (v == null) continue;
    var sel = "[" + attrs[i] + '="' + String(v).replace(/"/g, '\\"') + '"]';
    /* ★ 2026-10-10（R14）：角色键此前只拼 `data-i`（页② 的**行下标**），行内破坏性动作的
       `data-id`（**对象主键**）未参与 ⇒ `[data-auact="isRevoke"]` 匹配全表所有行，复定位
       取首个可见元素 = **另一行**的同名按钮，紧随其后一次 Enter 就会对另一个对象发起动作。 */
    /* ★ 2026-10-10（R15）：优先级此前是 **`data-i` 优先**、`data-id` 只在没有 `data-i` 时兜底 ——
       而 `data-i` 是**行下标**，行内删除 / 移除后下标塌缩，选择器会命中**移位后占据同下标的
       另一条记录**（页②「移除」实测：删掉第 0 行后焦点落到新第 0 行那条的破坏性按钮上）。
       R14 裁决②只给 `isRevoke` 一类补了 `data-id`，却没改优先级 ⇒ 那条规则在此分支根本走不到。
       改为**对象主键优先**：`data-id` 恒比行下标稳定；两者都无才退化为纯角色键。 */
    var did = el.getAttribute("data-id");
    var di = el.getAttribute("data-i");
    if (did != null) sel += '[data-id="' + String(did).replace(/"/g, '\\"') + '"]';
    else if (di != null) sel += '[data-i="' + di + '"]';
    return sel;
  }
  return null;
}
function domFocusSave() { window.__domFocusKey = domFocusKey(document.activeElement); }
function domFocusRestore() {
  var k = window.__domFocusKey; window.__domFocusKey = null;
  if (!k) return;
  if (document.activeElement && document.activeElement !== document.body) return;
  try {
    var ns = document.querySelectorAll(k), el = null;
    /* 同名多份时优先取**可见**的那一个（页签面板 / 隐藏卡片的同锚点控件）。 */
    for (var i = 0; i < ns.length; i++) { if (ns[i].offsetParent !== null) { el = ns[i]; break; } }
    if (!el && ns.length) el = ns[0];
    /* ★ 2026-10-10（R14）：元素**随动作消失**（行内吊销 / 删除使整行被移除，页② 删源连详情视图
       一并消失）时，此前 `ns[0]` 会落到**另一行**的同名破坏性按钮、或干脆找不到而把焦点丢回 body。
       改为退到**当前活动页工具栏的首个可用按钮** —— 页面级稳定锚点，永不指向某个具体对象。 */
    if (!el) {
      var _tb = document.querySelector(".pg.on .toolbar button:not([disabled])") ||
                document.querySelector(".pg.on .toolbar .btn:not([disabled])");
      if (_tb && _tb.focus) { try { _tb.focus(); } catch (_e8) { /* 忽略 */ } }
      return;
    }
    /* ★ 2026-10-10（R12）：翻到末页时「下页」按钮自己变禁用 ⇒ 目标虽找得到却不可聚焦，
       焦点仍会丢。仅在分页器容器内回退到**第一个可用按钮**（末页时「首页 / 上页」必然可用）；
       限定 `.pager` 内，避免影响弹窗确认路径的触发元素。 */
    if (el && el.disabled) {
      /* ★ 2026-10-10（R15）：禁用兜底此前**只认 `.pager` 容器** —— 分页器末页「下页」自禁用有解，
         但**工具栏按钮**（页⑤「批量吊销」确认后勾选集清空 ⇒ 按钮自禁用）不在 `.pager` 内
         ⇒ 落回 body，键盘用户要重新 Tab 穿越侧栏。改为逐级上溯（最多 4 层）取同容器首个可用
         按钮，再退到当前活动页工具栏的首个可用按钮。 */
      var _host = el.parentElement, _pick = null, _hop = 0;
      while (_host && !_pick && _hop < 4) {
        var _btns = _host.querySelectorAll("button:not([disabled])");
        for (var j = 0; j < _btns.length; j++) {
          if (_btns[j] !== el && _btns[j].offsetParent !== null) { _pick = _btns[j]; break; }
        }
        _host = _host.parentElement; _hop++;
      }
      if (!_pick) {
        var _tb2 = document.querySelector(".pg.on .toolbar button:not([disabled])");
        if (_tb2 && _tb2.offsetParent !== null) _pick = _tb2;
      }
      if (_pick) el = _pick;
    }
    if (el && el.focus && !el.disabled) el.focus();
  } catch (_e) {}
}
/* ★ 2026-10-10（R12）：**全局兜底** —— 任何「点击 → 重渲染」路径（分页器 / 页签 / 行内动作 /
   批量操作）都会把被点元素的节点换掉、焦点丢到 body。认证模块的翻页入口各自直呼本页渲染器
   （`audPg` / `auucPg` / `auiPg` / `credPg*` …），并不经 `auRerender()` ⇒ 单独挂钩子必然漏。
   捕获阶段先记键，事件处理（含同步重渲染）结束后按选择器找回；仅在焦点已落 body 时动作。 */
document.addEventListener("click", function (e) {
  var t = e.target;
  var el = (t && t.closest) ? (t.closest("button,a,[role=tab],select,input") || t) : t;
  var k = domFocusKey(el);
  if (!k) return;
  window.__domFocusKey = k;
  window.setTimeout(domFocusRestore, 0);
}, true);

function cfmFocusBack() {
  $("#dlgCfm").classList.remove("show");
  /* 归还前先留一份「可复定位选择器」—— 确认回调（cb）常在归还**之后**整段重渲染。 */
  var _k = domFocusKey(window.__cfmPrevFocus);
  try { if (window.__cfmPrevFocus && window.__cfmPrevFocus.focus) window.__cfmPrevFocus.focus(); } catch (_e) {}
  window.__cfmPrevFocus = null;
  if (_k) { window.__domFocusKey = _k; window.setTimeout(domFocusRestore, 0); }
}
function confirmDlg(title, html, cb, okText) {
  S.cfmCb = cb; S.tfa = null;
  const no = $("#dlgCfm [data-act='cfmNo']"); if (no) no.style.display = "";
  $("#cfmTitle").textContent = title;
  $("#cfmMsg").innerHTML = html;
  $("#cfmYes").textContent = okText || "确认";
  cfmFocusIn("#cfmYes");
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
  cfmFocusIn("#cfmYes");
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
  /* 方式清单读**可变的**字典（AU.dict.methods）而非静态常量 —— 静态常量在新增方式后即过期，
     会让「刚登记的方式」在二次认证里选不到。 */
  const _tfaMs = (typeof AU !== "undefined" && AU && AU.dict && AU.dict.methods) ? AU.dict.methods : AU_METHODS;
  $("#cfmTitle").textContent = "二次认证";
  $("#cfmMsg").innerHTML = `
    <div class="hint-row" style="margin-bottom:12px"><i class="ic">二次认证</i><div>「<b>${esc(t.op)}</b>」属于<b>敏感变更</b>，需先完成<b>二次认证</b>确认身份；认证通过后操作才执行，取消不产生任何变更。</div></div>
    ${t.note ? `<div class="note" style="margin:0 0 12px">${t.note}</div>` : ""}
    <div style="display:flex;gap:10px;align-items:baseline;margin-bottom:6px"><span class="mini" style="flex:0 0 62px">认证方式</span><span class="mini">取自「认证方式字典」<b>（方式名唯一取值域）</b>；此处<b>不标级别</b> —— 级别由「认证源 × 认证方式」联合判定。「无感代填」不适用（本次操作需用户手工确认）</span></div>
    <div class="seg wrap" style="margin:0 0 12px">${_tfaMs.filter(m => m.interactive).map(m => `<button class="${t.method === m.name ? "on" : ""}" data-act="tfaMethod" data-v="${esc(m.name)}">${esc(m.name)}</button>`).join("")}</div>
    <div style="display:flex;gap:10px;align-items:center"><span class="mini" style="flex:0 0 62px">凭据</span>
      <input type="password" class="mini-inp" id="tfaPwd" aria-label="二次认证凭据（${esc(t.method)}）" style="min-width:220px" placeholder="输入${esc(t.method)}凭据" value="${esc(t.pwd || "")}"></div>
  `;
  $("#cfmYes").textContent = "验证并执行";
  /* 开窗**与**切换认证方式（tfaMethod 会重渲染本函数、替换 #tfaPwd 节点）后，焦点都归到口令框 */
  cfmFocusIn("#tfaPwd");
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
      if (!rhit.length) { toast(ron ? "该资产的准入策略均已启用" : "该资产的准入策略均为未启用"); break; }
      ask2FA(`${ron ? "启用" : "停用"}「${ra.name}」全部形态组的 ${rhit.length} 条准入策略`, () => {
        rhit.forEach(p => { p.on = ron; p.at = nowTs(); p.by = polOp(); });
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
        S.selRows.clear();   /* ★ R61·轮9：批量落库后清空行勾选（勾选与结果集强相关）—— 同族批量动作
           fgBatchClear / isBatchRevoke / dpAlertRecBatch 均已清空，本处原漏；且 renderAspList 仅在筛选签名
           变化时才代为清空（20-policy.js:1182），签名未变则勾选徽标残留「已选 N 个资产」。 */
        toast(`已将 ${ids.length} 个资产的准入策略批量${on ? "启用" : "停用"}：${n} 条状态变更 / 共 ${total} 条（变更 2 秒内收敛并入审计）`);
        renderAsp();
      });
      break;
    }
    case "gotoB": S.cur = el.dataset.id || S.cur; FG.cur = el.dataset.id || S.cur; FG.view = el.dataset.id ? "matrix" : "list"; FG.filter = {}; FG.filterMx = {}; FG.sel.clear(); window.PFgMx = 1; setPage("pg-fg", true); renderFg(); setCrumbs("资产细粒度访问策略", FG.view === "matrix" ? (byId(FG.cur) ? byId(FG.cur).name : "") : "资产选择"); break;

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
      cp.at = nowTs(); cp.by = polOp();
      list.push(cp);
      toast("已复制为「" + cp.name + "」（仅在当前形态组内复制；副本未启用，确认内容无误后在卡片上启用）");
      renderAsp(); break;
    }
    case "polToggle": {
      const p = (POLICIES[S.cur][S.mode] || []).find(x => x.id === el.dataset.id);
      if (!p) break;
      /* 单条策略启停属敏感变更：先二次认证，通过后才落变更 */
      ask2FA(`${p.on ? "停用" : "启用"}准入策略「${p.name}」`, () => {
        p.on = !p.on; p.at = nowTs(); p.by = polOp();
        toast(p.on ? "已启用策略：即时参与判定（2 秒内收敛）" : "未启用策略：不参与判定（2 秒内收敛）");
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
      if (!hit.length) { toast(on ? "本形态组策略均已启用" : "本形态组策略均为未启用"); break; }
      ask2FA(`${on ? "全部启用" : "全部停用"}${MODE_LABEL[S.mode]}策略组的 ${hit.length} 条准入策略（本组共 ${list.length} 条）`, () => {
        hit.forEach(p => { p.on = on; p.at = nowTs(); p.by = polOp(); });
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
      xlist.push({ id: "asp-" + DD.asId + "-" + (++POL_SEQ), name: xnm, action: DD.action, on: false, cond: cleanTree(clone(DD.tree)), by: polOp(), at: nowTs() });
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
      /* ★ 2026-10-12（R57 · 交-7）：openDetail 在**跨页**情形已 goPage 并 return（本页无 detTabs），
         紧随的 showTab 被 `if(!nav) return` 吞掉 ⇒ 详情落到 t1 而非生命周期所在的 t3，
         属「入口未驱动页签」。改为由 bootstrap 的 ?tab= 分支统一落位（同 ?tab=t6 身份适配的做法）。 */
      if (PG_CUR !== "pg-detail") { goPage("pg-detail", { aid: a.id, tab: "t3" }); break; }
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
    case "fgClearF": FG.filter = {}; FG.filterMx = {}; FG.sel.clear(); renderFg(); toast("已清空筛选条件"); break;
    /* ★ R61·轮8：返回列表**不清筛选** —— 与页 A 的 `aspBack` 同口径（`fgClearF` 才是「清空筛选」）。
       原实现清筛选却保留页码，落到「无筛选 + 第 N 页」的自相矛盾态。 */
    case "fgBack": FG.view = "list"; FG.sel.clear(); renderFg(); setCrumbs("资产细粒度访问策略", "资产选择"); break;
    /* ★ R61·轮8：下钻不携带、也不清空筛选 —— 返回列表时保持用户此前筛出的候选集（同 `fgBack`）。 */
    case "fgCfg": { FG.cur = el.dataset.id; FG.view = "matrix"; FG.filterMx = {}; FG.sel.clear(); const a = byId(FG.cur); renderFg(); setCrumbs("资产细粒度访问策略", a ? a.name : ""); break; }
    case "fgSet": openFgReq(el.dataset.a, el.dataset.r, el.dataset.k); break;
    case "fgClear": {
      const hit = pathByKey(el.dataset.k); if (!hit) break;
      /* ★ 2026-10-12（R53 · A2-F2）：清除访问要求 = 使对象回到默认拒绝（**改变生效面**），
         与页 A「删除准入策略」同类 ⇒ 同档走二次认证（原为普通确认，同一判据在相邻两页两种结论）。 */
      ask2FA(`清除访问要求 · 路径 ${hit.pt.p}`, () => { hit.pt._rq = { kind: "none" }; toast("已清除：该路径回到默认拒绝"); renderFg(); }, null,
        `路径 <b>${esc(hit.pt.p)}</b> 将回到「未配置」 → <b>默认拒绝</b>（请求不达上游）。`);
      break;
    }
    case "famClear": {
      const a = byId(el.dataset.a); if (!a) break;
      const o = famObjs(a).find(x => x.id === el.dataset.o); if (!o) break;
      /* ★ R53（A2-F2）：同上 —— 对象级清除访问要求同属改变生效面。 */
      ask2FA(`清除访问要求 · ${o.k} ${o.n}`, () => { a._frq = a._frq || {}; a._frq[o.id] = { kind: "none" }; toast("已清除：该对象回到默认拒绝"); renderFg(); }, null,
        `${esc(o.k)} <b>${esc(o.n)}</b> 将回到「未配置」 → <b>默认拒绝</b>（请求不达上游）。`);
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
      /* ★ R53（A2-F2）：批量清除同属改变生效面，与单条清除同档。 */
      ask2FA(`批量清除访问要求（${keys.length} ${unit}）`, () => {
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
        toast(`已批量清除 ${keys.length} ${unit}访问要求（变更入审计）`);
        renderFg();
      }, null, `将清除本页勾选的 <b>${keys.length}</b> ${unit}的访问要求，各自回到「未配置」 → <b>默认拒绝</b>（请求不达上游）。未勾选条目不受影响。变更入审计。`);
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
      /* ★ 2026-10-12（R53 · 存-13）：整资产匿名开放使该资产**整体跳过认证与授权链**，影响面大于
         「删除准入策略」这类已判定走二次认证的动作 ⇒ 按 §3.3-1「改变生效面走二次认证」升档。
         反向的「关闭匿名开放」恢复默认拒绝、收紧防护面，保留普通确认 —— 放开从严、收回从简。 */
      ask2FA("声明整资产匿名开放",
        () => { a.anon = "asset"; toast("已声明整资产匿名开放（变更入审计）"); renderFg(); },
        null,
        `<b>${esc(a.name)}</b> 将整体匿名开放：请求不进入认证与授权链，跳过主体认证、资产访问状态与准入判定。
        <div class="note red" style="margin-top:10px">影响：① 该资产在「资产访问控制策略」中的准入策略<b>整体不适用</b>；② 本页路径授权矩阵转只读；③ 现有逐路径访问要求<b>保留但暂不生效</b>（关闭声明后恢复）；④ <b>不做越权判定</b>，但 <b>WAF、限流、请求约束与审计照常生效</b>。<br>约束：整资产匿名<b>仅适用于 L1 级、全部资源为 HTTP 协议、且未登记有端接入的资产</b>；请确认该资产不含需要登录保护的资源。</div>`);
      break;
    }
    case "anonOff": {
      const a = byId(el.dataset.id);
      /* ★ 2026-10-12（R57 · 交-8）：关闭匿名开放**也是改变生效面** —— 关闭瞬间原本直通的请求
         转为按逐路径授权裁决（未配置路径一律拒绝），线上放行结果立即改变，误点后果与「开启」同量级。
         原实现开启走 ask2FA、关闭只走普通确认；而同类「收回生效面」的「清除访问要求」已按 R53 A2-F2
         定为 ask2FA（同类动作不得两制）。此处升档，取消则不改任何状态。 */
      ask2FA("关闭整资产匿名开放「" + a.name + "」", () => {
        delete a.anon; toast("已关闭整资产匿名开放"); renderFg();
      }, null, `关闭后 <b>${esc(a.name)}</b> 恢复为逐路径授权：未配置路径回到<b>默认拒绝</b>，<b>匿名开放范围之外的访问一律拒绝</b>。`);
      break;
    }

    /* --- 确认弹窗 --- */
    case "cfmNo": {
      /* 二次认证：取消 = 不产生任何变更，回调调用方回滚 UI 状态 */
      const t = S.tfa; S.tfa = null; S.cfmCb = null;
      cfmFocusBack();
      if (t && t.cancel) t.cancel();
      break;
    }
    case "cfmYes": {
      /* 二次认证模式：先校验凭据，通过后才执行原操作；凭据为空则保持弹窗并提示 */
      if (S.tfa) {
        const t = S.tfa;
        const v = (($("#tfaPwd") || {}).value || "").trim();
        /* 空凭据：除 toast 外还须给**字段级红框** —— 全站统一用 markBad 定位到具体控件。 */
        if (!v) { markBad($("#tfaPwd"), true); toast("请输入" + t.method + "凭据后再提交（二次认证）"); break; }
        S.tfa = null; S.cfmCb = null; cfmFocusBack();
        t.ok(); break;
      }
      const cb = S.cfmCb; S.cfmCb = null; cfmFocusBack(); if (cb) cb(); break;
    }
    case "tfaMethod": {
      /* ★ 2026-10-12（R57 · 表-7）：原实现把上一方式已输入的凭据存入 S.tfa.pwd，再由 render2FA
         以 value= 回填 —— 换认证方式后旧凭据**残留并回显**在口令框里（不同方式的凭据形态互不通用，
         且口令值不应写进 DOM 的 value 属性）。render2FA 唯一的重渲染入口就是本分支，
         故切换方式时直接清空，不再需要「保留已输入内容」这一语义。 */
      if (S.tfa) { S.tfa.pwd = ""; S.tfa.method = el.dataset.v; render2FA(); }
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
    FG.filterMx = { k: $("#mK") ? $("#mK").value : "", res: $("#mRes") ? $("#mRes").value : "", rq: $("#mRq") ? $("#mRq").value : "",
      risk: $("#mRisk") ? $("#mRisk").value : "" };
    renderFg(); return;
  }
});
/* 搜索框即时过滤 */
/* ★ 2026-10-10（R10）：搜索框「合成 change」的统一出口。
   ① **组合态（中文候选）不派发** —— 下游 auOnChange 的组合态守卫只挡 `e.type === "input"`，
      合成 change 会从守卫旁边走过去，260ms 后整页重渲染 ⇒ IME 候选被清空、输入跳变
      （实测：全量 4 行被提前筛成 1 行）。组合结束由下面的 compositionend 补一次派发。
   ② **派发前后复位焦点**（含光标位置）—— 整页重渲染会替换搜索框节点，
      焦点落回 body，键盘用户须重新 Tab 一遍。 */
function _fireSearchChange(el, delay) {
  if (!el) return;
  clearTimeout(el._t);
  el._t = setTimeout(function () {
    var fid = el.id, pos = null;
    try { pos = el.selectionStart; } catch (_e) { pos = null; }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (!fid) return;
    var ne = document.getElementById(fid);
    if (!ne || ne === document.activeElement) return;
    try { ne.focus(); if (pos != null && ne.setSelectionRange) ne.setSelectionRange(pos, pos); } catch (_e2) { /* 忽略 */ }
  }, delay == null ? 260 : delay);
}
document.addEventListener("input", (e) => {
  const el = e.target.closest("input[type=search]");
  if (!el || e.isComposing) return;
  _fireSearchChange(el);
});
/* 组合结束（候选上屏）⇒ 立即按终值派发一次，筛选才落地。 */
document.addEventListener("compositionend", (e) => {
  const el = e.target && e.target.closest && e.target.closest("input[type=search]");
  if (!el) return;
  _fireSearchChange(el, 0);
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

/* ★ 2026-10-12（R53 · A2-F5）：与 polCheck 同源的「疑似重叠」判定，供保存前确认复用。
   策略体检面板自陈「保存策略时仍会按『疑似重叠』二次确认」，而 validateDs 的 warns 不含重叠判定
   ⇒ 原承诺落空。此处按同一算法（chkFlatten / chkExclusive）对「当前草稿 × 同形态组其余策略」求交。 */
function polOverlapsFor(D) {
  if (!D || !D.asId) return [];
  const list = (((POLICIES[D.asId] || {})[D.mode]) || []).filter(p => p.id !== D.polId);
  const cur = { p: { id: D.polId, name: D.name, action: D.action, on: D.on }, f: chkFlatten(cleanTree(D.tree)) };
  const out = [];
  list.forEach(function (o) {
    if (o.action === cur.p.action) return;
    const f = { p: o, f: chkFlatten(o.cond) };
    if (!f.f.flat || !cur.f.flat) { out.push({ a: cur.p, b: f.p, why: "两条策略的条件含嵌套或「非」组，无法自动判定是否互斥" }); return; }
    if (!chkExclusive(f.f, cur.f)) out.push({ a: cur.p, b: f.p, why: "两条策略的条件无公共属性，无法证明互斥" });
  });
  return out;
}

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
      if (p) { p.name = nm; p.action = D.action; p.on = D.on; p.cond = cond; p.at = nowTs(); p.by = polOp(); }
    } else {
      list.push({ id: "asp-" + D.asId + "-" + (++POL_SEQ), name: nm, action: D.action, on: D.on, cond, by: polOp(), at: nowTs() });
    }
    S.designer = null; S.view = "cfg"; S.pop = null;
    /* 承载期次提示（F5.3）：声明 L3~L5 时并入保存回执——只提示、不阻断，不改判定与落库结构 */
    const carry = authCarryNote(cond);
    toast((D.polId
      ? `已保存准入策略（${MODE_LABEL[D.mode]}组）的变更：${D.on ? "启用即生效" : "当前为未启用"}，变更入审计`
      : `已新增准入策略（${MODE_LABEL[D.mode]}组）：${D.on ? "已启用，即刻参与裁决" : "默认未启用，在卡片上启用后方参与裁决"}`) + (carry ? "　· " + carry : ""));
    renderAsp();
  };
  /* ★ 2026-10-12（R53 · A2-F1 / A2-F3 / A2-F5）：保存前按「变更面」分档 ——
     ① 启用位有变更（改变生效面）⇒ 二次认证，与卡片入口 polToggle 同档；
     ② 无启用位变更但有风险提示（含疑似重叠）⇒ 普通确认；
     ③ 均无 ⇒ 仍走一次普通确认「保存并生效」（与 Web 防护族 wsSave 同档，避免点保存即静默生效）。 */
  const overlaps = polOverlapsFor(D);
  const _warnHtml = (overlaps.length
      ? `<div class="note warn">本形态组内检出 <b>${overlaps.length}</b> 组<b>疑似条件重叠</b>的准入策略对（动作相异、无法证明互斥）。实际按 <b>拒绝 ＞ 允许</b> 裁决，请确认是否有意为之。</div>`
      : "")
    + (v.warns.length
      ? `<div class="note warn"${overlaps.length ? ' style="margin-top:8px"' : ""}>${v.warns.map(w => "· " + esc(w.text)).join("<br>")}</div>`
      : "");
  /* ★ R61：判据去掉 `!!D.polId` —— 新建策略时同样可勾选「启用」，原判据使「新建 + 启用」一路跳过
     二次认证（与卡片 polToggle、批量启停同属改变生效面，却只有本路径零确认）。 */
  const _onChanged = !!D.on !== !!D.on0;
  if (_onChanged) {
    ask2FA(`变更准入策略「${nm}」的启用状态`, commit,
      () => { D.on = D.on0; renderAsp(); },
      `该策略的启用位由「${D.on0 ? "已启用" : "未启用"}」改为「${D.on ? "已启用" : "未启用"}」：<b>启用即参与裁决</b>，属改变生效面的动作。` + _warnHtml);
  } else if (_warnHtml) {
    confirmDlg("保存前确认风险点", _warnHtml, commit, "确认保存");
  } else {
    confirmDlg("保存并生效", `将保存准入策略「${esc(nm)}」（${MODE_LABEL[D.mode]}组）的变更。${D.on ? "<b>启用即生效</b>，变更 2 秒内收敛并入审计。" : "当前为未启用，保存后在卡片上启用方参与裁决。"}`, commit, "保存并生效");
  }
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
const _goFg = () => { const a = curAsset(); if (!a) return; FG.cur = a.id; FG.view = "matrix"; FG.filter = {}; FG.filterMx = {}; FG.sel.clear(); window.PFgMx = 1; setPage("pg-fg"); };
$$("#btnGoAsp").forEach(b => b.addEventListener("click", _goAsp));
/* R26 两处「配置访问要求」入口（详情头部 / 细粒度资源清单工具栏）不再共用同一个 id——id 必须唯一，
   否则 $("#btnGoFg") 只能命中第一处、label 关联与无障碍定位也会歧义。工具栏入口改用 data-go 标记。 */
$$("#btnGoFg").forEach(b => b.addEventListener("click", _goFg));
$$("[data-go='fg']").forEach(b => b.addEventListener("click", _goFg));

