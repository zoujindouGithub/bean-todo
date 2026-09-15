/**
 * scripts/quality-gate.js
 * 豆芽待办小程序 —— 代码提交前质量门禁 (Per-Commit Quality Gate)
 *
 * 检查范围：
 * 1. JavaScript 语法校验 (node --check)
 * 2. 全量 JSON 配置文件有效性与防格式损坏
 * 3. WXML 模板标签闭合与配对完整性校验 (防 end tag missing)
 * 4. 小程序项目配置健全性 (pages 完整性、按需注入、打包忽略规则)
 * 5. 自动化核心数据层与模型单测 (tests/datastore.test.js)
 * 6. 代码包大文件资源限制校验 (单文件 <= 200KB 门禁)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// 终端色彩辅助
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

const rootDir = path.resolve(__dirname, '..');
let hasError = false;

console.log(`\n${c.bold}${c.cyan}=== 豆芽待办 · 代码质量预提交门禁 (Per-Commit Quality Gate) ===${c.reset}\n`);

function pass(name, detail = '') {
  console.log(`  ${c.green}✔ [通过]${c.reset} ${name} ${detail ? c.dim + detail + c.reset : ''}`);
}

function fail(name, error) {
  hasError = true;
  console.log(`  ${c.red}✖ [未通过]${c.reset} ${name}`);
  if (error) {
    const msg = typeof error === 'string' ? error : error.message || String(error);
    msg.split('\n').forEach((line) => {
      if (line.trim()) console.log(`      ${c.red}${line}${c.reset}`);
    });
  }
}

// 递归查找特定后缀文件
function findFiles(dir, ext, ignoreDirs = ['.git', 'node_modules', '.zvec-grep']) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoreDirs.includes(entry.name)) {
        result.push(...findFiles(path.join(dir, entry.name), ext, ignoreDirs));
      }
    } else if (entry.isFile()) {
      if (!ext || entry.name.endsWith(ext)) {
        result.push(path.join(dir, entry.name));
      }
    }
  }
  return result;
}

// 1. JavaScript 语法校验
console.log(`${c.bold}[1/6] 校验 JavaScript 语法正确性...${c.reset}`);
const jsFiles = findFiles(rootDir, '.js');
let jsOk = true;
for (const file of jsFiles) {
  const rel = path.relative(rootDir, file);
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) {
    jsOk = false;
    fail(`JS 语法错误: ${rel}`, res.stderr || res.stdout);
  }
}
if (jsOk) {
  pass(`已扫描全部 ${jsFiles.length} 个 JavaScript 脚本，语法无误`);
}

// 2. 全量 JSON 配置文件校验
console.log(`\n${c.bold}[2/6] 校验 JSON 配置文件有效性...${c.reset}`);
const jsonFiles = findFiles(rootDir, '.json');
let jsonOk = true;
for (const file of jsonFiles) {
  const rel = path.relative(rootDir, file);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    JSON.parse(raw);
  } catch (err) {
    jsonOk = false;
    fail(`JSON 解析失败: ${rel}`, err.message);
  }
}
if (jsonOk) {
  pass(`已解析全部 ${jsonFiles.length} 个 JSON 配置文件，格式合法`);
}

// 3. WXML 模板标签闭合完整性校验
console.log(`\n${c.bold}[3/6] 校验 WXML 模板标签配对与闭合...${c.reset}`);
const wxmlFiles = findFiles(rootDir, '.wxml');
let wxmlOk = true;
const tagRegex = /<\/?([a-zA-Z0-9-]+)(?:\s+[^>]*?)?(\/?)>/g;
const selfClosingTags = ['input', 'image'];

for (const file of wxmlFiles) {
  const rel = path.relative(rootDir, file);
  const content = fs.readFileSync(file, 'utf8');
  const stack = [];
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const full = match[0];
    const tag = match[1];
    const isSelfClosing = match[2] === '/' || full.endsWith('/>') || selfClosingTags.includes(tag);
    const isClose = full.startsWith('</');

    if (isSelfClosing && !isClose) {
      continue;
    } else if (isClose) {
      if (stack.length === 0) {
        wxmlOk = false;
        fail(`WXML 标签错误: ${rel}`, `多余闭合标签 </${tag}>`);
      } else {
        const top = stack.pop();
        if (top.tag !== tag) {
          wxmlOk = false;
          fail(`WXML 标签不匹配: ${rel}`, `期望闭合 <${top.tag}> (第 ${top.line} 行), 实际遇到 </${tag}>`);
        }
      }
    } else {
      const line = content.slice(0, match.index).split('\n').length;
      stack.push({ tag, line });
    }
  }
  if (stack.length > 0) {
    wxmlOk = false;
    fail(`WXML 缺少闭合标签: ${rel}`, `未闭合标签: <${stack[stack.length - 1].tag}> (第 ${stack[stack.length - 1].line} 行)`);
  }
}
if (wxmlOk) {
  pass(`已扫描全部 ${wxmlFiles.length} 个 WXML 模板，所有标签闭合与配对完整`);
}

// 4. 小程序配置健全性校验
console.log(`\n${c.bold}[4/6] 检查小程序项目配置完整性...${c.reset}`);
try {
  const appJsonPath = path.join(rootDir, 'app.json');
  const projectConfigPath = path.join(rootDir, 'project.config.json');

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'));

  // 检查 pages 真实存在
  let pagesOk = true;
  for (const p of appJson.pages || []) {
    const wxml = path.join(rootDir, `${p}.wxml`);
    const js = path.join(rootDir, `${p}.js`);
    if (!fs.existsSync(wxml) || !fs.existsSync(js)) {
      pagesOk = false;
      fail(`路由页面文件丢失: ${p}`, `缺少 ${p}.wxml 或 ${p}.js`);
    }
  }
  if (pagesOk) {
    pass(`已确认 ${appJson.pages.length} 个路由页面文件物理存在`);
  }

  // 检查按需注入
  if (appJson.lazyCodeLoading === 'requiredComponents') {
    pass('已开启组件按需注入 (lazyCodeLoading: requiredComponents)');
  } else {
    fail('app.json 缺少组件按需注入配置', '建议设置 "lazyCodeLoading": "requiredComponents" 以优化首屏性能');
  }

  // 检查打包忽略规则
  const ignoredFolders = (projectConfig.packOptions && projectConfig.packOptions.ignore || [])
    .filter((it) => it.type === 'folder')
    .map((it) => it.value);

  const mustIgnore = ['tests', 'assets', '.zvec-grep', 'scripts', '.githooks'];
  const missingIgnores = mustIgnore.filter((it) => !ignoredFolders.includes(it));
  if (missingIgnores.length === 0) {
    pass('project.config.json 打包忽略规则已覆盖非生产资源 (tests, assets, .zvec-grep, scripts, .githooks)');
  } else {
    fail('project.config.json 打包忽略项不全', `缺少忽略目录: ${missingIgnores.join(', ')}`);
  }
} catch (err) {
  fail('小程序配置读取失败', err);
}

// 5. 自动化测试套件
console.log(`\n${c.bold}[5/6] 运行核心数据层与业务模型单元测试...${c.reset}`);
const testFiles = findFiles(path.join(rootDir, 'tests'), '.test.js');
const testRes = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: rootDir,
  encoding: 'utf8'
});
if (testRes.status === 0) {
  pass(`全量 ${testFiles.length} 个测试套件（含数据层与智能排序算法）全部通过，零回归`);
} else {
  fail('单元测试套件未通过', testRes.stdout || testRes.stderr);
}

// 6. 单文件大小与未打包资产检查
console.log(`\n${c.bold}[6/6] 扫描代码包体积与大资源约束...${c.reset}`);
const MAX_FILE_SIZE = 200 * 1024; // 200KB
let largeFileFound = false;

['pages', 'utils'].forEach((dirName) => {
  const targetDir = path.join(rootDir, dirName);
  if (fs.existsSync(targetDir)) {
    const allFiles = findFiles(targetDir, '');
    for (const f of allFiles) {
      const stats = fs.statSync(f);
      if (stats.size > MAX_FILE_SIZE) {
        largeFileFound = true;
        fail(`代码包内单文件超标 (>200KB): ${path.relative(rootDir, f)}`, `当前大小: ${(stats.size / 1024).toFixed(1)} KB`);
      }
    }
  }
});
if (!largeFileFound) {
  pass('代码包内各模块资源体积均在 200KB 门禁范围内');
}

console.log('\n------------------------------------------------------------');
if (hasError) {
  console.log(`${c.bold}${c.red}❌ 提交受阻：未通过代码质量门禁，请根据上方提示修复后重试！${c.reset}\n`);
  process.exit(1);
} else {
  console.log(`${c.bold}${c.green}🎉 恭喜！全部质量检查与测试用例 100% 通过，允许提交！${c.reset}\n`);
  process.exit(0);
}
