#!/usr/bin/env node
/**
 * 数据验证器 (validate-data.js)
 * 
 * 用法: node scripts/validate-data.js <data-package.json>
 * 
 * 校验规则:
 * - 所有记录必须有 source 字段且非空
 * - 数值字段类型正确
 * - 权重合计 = 100 (±0.1)
 * - age_dist 覆盖 0-80 岁
 * - city 列表不重复
 * - 事件 type 在已知列表中
 */

const fs = require('fs');
const path = require('path');

const KNOWN_EVENT_TYPES = ['战争','政治','灾害','人物','文化','其他'];
const VALID_SCOPES = ['城市','全国'];

// 读取数据包
function loadPackage(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // 支持 json 或 js 模块
  if (filePath.endsWith('.json')) {
    return JSON.parse(content);
  }
  // 也支持 .js 导出的数据
  const mod = require(path.resolve(filePath));
  return mod.default || mod;
}

// 逐个校验数据包的每个表
function validate(pkg) {
  const errors = [];
  const warnings = [];

  if (!pkg || typeof pkg !== 'object') {
    errors.push('❌ 数据包为空或格式错误');
    return { errors, warnings, passed: false };
  }

  // 1. 校验 era_meta
  if (pkg.era_meta) {
    validateEraMeta(pkg.era_meta, errors, warnings);
  } else {
    warnings.push('⚠️ era_meta: 未提供');
  }

  // 2. 校验 era_cities
  if (pkg.era_cities) {
    validateEraCities(pkg.era_cities, errors, warnings);
  } else {
    warnings.push('⚠️ era_cities: 未提供');
  }

  // 3. 校验 era_age_dist
  if (pkg.era_age_dist) {
    validateEraAgeDist(pkg.era_age_dist, errors, warnings);
  } else {
    warnings.push('⚠️ era_age_dist: 未提供');
  }

  // 4. 校验 social_structure
  if (pkg.social_structure) {
    validateSocialStructure(pkg.social_structure, errors, warnings);
  } else {
    warnings.push('⚠️ social_structure: 未提供');
  }

  // 5. 校验 event
  if (pkg.event) {
    validateEvent(pkg.event, errors, warnings);
  } else {
    warnings.push('⚠️ event: 未提供');
  }

  const passed = errors.length === 0;
  return { errors, warnings, passed };
}

function requiredField(obj, field, label, errors) {
  const val = obj[field];
  if (val === undefined || val === null) {
    errors.push(`❌ ${label}.${field}: 必须字段缺失`);
    return false;
  }
  if (typeof val === 'string' && val.trim() === '') {
    errors.push(`❌ ${label}.${field}: 字符串不可为空`);
    return false;
  }
  if (Array.isArray(val) && val.length === 0) {
    errors.push(`❌ ${label}.${field}: 数组不可为空`);
    return false;
  }
  return true;
}

function validateSource(obj, label, errors) {
  if (!requiredField(obj, 'source', label, errors)) return false;
  const s = obj.source;
  if (typeof s === 'string' && !s.startsWith('据') && !s.startsWith('《') && !s.includes('据')) {
    errors.push(`⚠️ ${label}.source: 格式建议以"据"开头, 当前: "${s.substring(0,30)}..."`);
  }
  return true;
}

function validateEraMeta(items, errors, warnings) {
  if (!Array.isArray(items)) {
    // 允许单条对象
    items = [items];
  }
  if (!Array.isArray(items)) {
    errors.push('❌ era_meta: 格式错误，需为对象或数组');
    return;
  }

  for (const item of items) {
    const label = `era_meta[year=${item.year}]`;

    // 必须字段：year, dynasty, surnames, maleNames, source
    requiredField(item, 'year', label, errors);
    requiredField(item, 'dynasty', label, errors);
    requiredField(item, 'surnames', label, errors);
    requiredField(item, 'maleNames', label, errors);
    validateSource(item, label, errors);

    // year 必须是整数
    if (item.year !== undefined && !Number.isInteger(item.year)) {
      errors.push(`❌ ${label}.year: 必须为整数, 当前: ${item.year}`);
    }

    // maleRatio: 如果有值，必须在 0-1 之间
    if (item.maleRatio !== undefined && item.maleRatio !== null) {
      if (typeof item.maleRatio !== 'number' || item.maleRatio < 0 || item.maleRatio > 1) {
        errors.push(`❌ ${label}.maleRatio: 必须在 0~1 之间, 当前: ${item.maleRatio}`);
      }
    }

    // 识字率
    if (item.maleLiteracy !== undefined && item.maleLiteracy !== null) {
      if (typeof item.maleLiteracy !== 'number' || item.maleLiteracy < 0 || item.maleLiteracy > 1) {
        errors.push(`❌ ${label}.maleLiteracy: 必须在 0~1 之间`);
      }
    }
    if (item.femaleLiteracy !== undefined && item.femaleLiteracy !== null) {
      if (typeof item.femaleLiteracy !== 'number' || item.femaleLiteracy < 0 || item.femaleLiteracy > 1) {
        errors.push(`❌ ${label}.femaleLiteracy: 必须在 0~1 之间`);
      }
    }
  }
}

function validateEraCities(items, errors, warnings) {
  if (!Array.isArray(items)) {
    errors.push('❌ era_cities: 必须是数组');
    return;
  }

  const seenCities = new Set();
  for (const item of items) {
    const label = `era_cities[year=${item.year}]`;

    requiredField(item, 'year', label, errors);
    requiredField(item, 'city', label, errors);
    validateSource(item, label, errors);

    // 检查城市名重复
    if (item.city) {
      const key = `${item.year}:${item.city}`;
      if (seenCities.has(key)) {
        errors.push(`❌ ${label}: 城市"${item.city}"在同年份中重复`);
      }
      seenCities.add(key);
    }

    // popMillion: 如果有值，必须是正数
    if (item.popMillion !== undefined && item.popMillion !== null) {
      if (typeof item.popMillion !== 'number' || item.popMillion <= 0) {
        errors.push(`❌ ${label}.popMillion: 必须为正数, 当前: ${item.popMillion}`);
      }
    }

    // cityDesc: 可选，如果有值不能为空字符串
    if ('cityDesc' in item && item.cityDesc !== null) {
      if (typeof item.cityDesc === 'string' && item.cityDesc.trim() === '') {
        errors.push(`❌ ${label}.cityDesc: 字符串不可为空`);
      }
    }
  }
}

function validateEraAgeDist(items, errors, warnings) {
  if (!Array.isArray(items)) {
    errors.push('❌ era_age_dist: 必须是数组');
    return;
  }

  // 按年份分组
  const byYear = {};
  for (const item of items) {
    const y = item.year;
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(item);
  }

  for (const [yearStr, group] of Object.entries(byYear)) {
    const year = Number(yearStr);
    const label = `era_age_dist[year=${year}]`;

    // 检查 age 范围
    for (const item of group) {
      requiredField(item, 'age', label, errors);
      requiredField(item, 'weight', label, errors);
      validateSource(item, label, errors);

      if (item.age !== undefined && (item.age < 0 || item.age > 80)) {
        errors.push(`❌ ${label}: age=${item.age} 超出范围(0-80)`);
      }
      if (item.weight !== undefined && (typeof item.weight !== 'number' || item.weight < 0)) {
        errors.push(`❌ ${label}: weight=${item.weight} 必须是正数`);
      }
    }

    // 检查是否覆盖了 0-80 岁
    const ages = new Set(group.map(i => i.age));
    for (let a = 0; a <= 80; a++) {
      if (!ages.has(a)) {
        errors.push(`❌ ${label}: 缺少 age=${a}`);
      }
    }

    // 检查权重合计
    const totalWeight = group.reduce((sum, i) => sum + (i.weight || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.1) {
      errors.push(`❌ ${label}: 权重合计 ${totalWeight.toFixed(2)}，期望 ~100`);
    }
  }
}

function validateSocialStructure(items, errors, warnings) {
  if (!Array.isArray(items)) {
    errors.push('❌ social_structure: 必须是数组');
    return;
  }

  // 按年份分组
  const byYear = {};
  for (const item of items) {
    const y = item.year;
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(item);
  }

  for (const [yearStr, group] of Object.entries(byYear)) {
    const label = `social_structure[year=${yearStr}]`;

    const seenClasses = new Set();
    for (const item of group) {
      requiredField(item, 'year', label, errors);
      requiredField(item, 'class', label, errors);
      requiredField(item, 'jobs', label, errors);
      validateSource(item, label, errors);

      // 检查 class 重复
      if (item.class && seenClasses.has(item.class)) {
        errors.push(`❌ ${label}: 阶层"${item.class}"重复`);
      }
      if (item.class) seenClasses.add(item.class);

      // jobs 必须是字符串数组
      if (item.jobs && (!Array.isArray(item.jobs) || item.jobs.length === 0)) {
        errors.push(`❌ ${label}.jobs: 必须是非空数组`);
      }
    }

    // 检查权重合计
    const totalWeight = group.reduce((sum, i) => sum + (i.weight || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.1) {
      errors.push(`❌ ${label}: 权重合计 ${totalWeight.toFixed(2)}，期望 ~100`);
    }
  }
}

function validateEvent(items, errors, warnings) {
  if (!Array.isArray(items)) {
    errors.push('❌ event: 必须是数组');
    return;
  }

  for (const item of items) {
    const label = `event[year=${item.year}, title="${item.title || ''}"]`;

    requiredField(item, 'year', label, errors);
    requiredField(item, 'title', label, errors);
    requiredField(item, 'desc', label, errors);
    requiredField(item, 'type', label, errors);
    requiredField(item, 'scope', label, errors);
    validateSource(item, label, errors);

    // 检查 type 合法性
    if (item.type && !KNOWN_EVENT_TYPES.includes(item.type)) {
      warnings.push(`⚠️ ${label}: 未知事件类型 "${item.type}"，已知: ${KNOWN_EVENT_TYPES.join(',')}`);
    }

    // 检查 scope 合法性
    if (item.scope && !VALID_SCOPES.includes(item.scope)) {
      warnings.push(`⚠️ ${label}: 未知影响范围 "${item.scope}"，已知: ${VALID_SCOPES.join(',')}`);
    }
  }
}

// ======== main ========

function run(filePath) {
  console.log(`\n🔍 验证数据包: ${filePath}\n`);
  
  let pkg;
  try {
    pkg = loadPackage(filePath);
  } catch (e) {
    console.error(`❌ 无法读取数据包: ${e.message}`);
    process.exit(1);
  }

  const { errors, warnings, passed } = validate(pkg);

  console.log('─'.repeat(50));
  
  if (warnings.length > 0) {
    console.log('\n⚠️  警告:');
    warnings.forEach(w => console.log(`  ${w}`));
  }

  if (errors.length > 0) {
    console.log('\n❌ 错误:');
    errors.forEach(e => console.log(`  ${e}`));
    console.log(`\n📊 共计: ${errors.length} 错误, ${warnings.length} 警告`);
    console.log('\n🛑 校验未通过，不能入库！');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log(`\n📊 共计: 0 错误, ${warnings.length} 警告`);
  }
  
  console.log('\n✅ 校验通过！数据可以入库。');
  process.exit(0);
}

// CLI 入口
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('用法: node scripts/validate-data.js <data-package.json|js>');
  process.exit(1);
}
run(args[0]);
