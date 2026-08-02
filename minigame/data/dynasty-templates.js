/**
 * dynasty-templates.js —— 朝代生图模板（唯一数据源）
 *
 * 2026-08-02 19:58 先生拍板根治：模板 key 与数据源 era_meta.dynasty 实际值完全一致，
 *   之前短名（五代/宋/汉/晋/周）+ 别名表/模糊匹配全是绕开。
 * 2026-08-02 20:01 先生拍板：抽独立模块 + 单测（test-dynasty-templates.js），
 *   防止 era_meta 加新朝代后静默走 default。
 *
 * ⚠️ 维护规则：
 *   1. era_meta / generate_identity ERA_TABLE 加新朝代 → 本表必须同步加 key（单测会拦）
 *   2. elements 禁止人物词（scholar/hermit/lady/apsara/warrior…）——18:28 美女图根因（单测会拦）
 */

const PROMPT_BY_DYNASTY = {
  '夏':   { style: 'Bronze age Chinese oracle bone art',         elements: 'ritual, sacrifice, ancient temple' },
  '商':   { style: 'Bronze age Chinese oracle bone art',         elements: 'ritual bronze vessels, temple' },
  '西周': { style: 'Spring Autumn period Chinese painting',       elements: 'ritual vessels, city gates, bronze bells' },
  '春秋': { style: 'Spring Autumn period Chinese painting',       elements: 'ritual vessels, city gates' },
  '战国': { style: 'Warring States Chinese silk painting',       elements: 'silk banners, city walls' },
  '秦':   { style: 'Qin dynasty Chinese painting',                elements: 'Great Wall, terracotta army formation' },
  '西汉': { style: 'Han dynasty Chinese stone relief painting',   elements: 'carriage, banquet hall, bronze vessels' },
  '东汉': { style: 'Han dynasty Chinese stone relief painting',   elements: 'carriage, banquet hall, bronze vessels' },
  '三国': { style: 'Three Kingdoms Chinese gongbi',               elements: 'battle flags, river gorges' },
  '西晋': { style: 'Wei-Jin Chinese landscape',                   elements: 'bamboo forest, misty mountains' },
  '东晋': { style: 'Wei-Jin Chinese landscape',                   elements: 'bamboo forest, misty mountains' },
  '南北朝':{ style: 'Dunhuang mural painting',                    elements: 'Buddhist grottoes, murals, desert dunes' },
  '隋':   { style: 'Early Tang gongbi',                           elements: 'palace architecture, gardens' },
  '唐':   { style: 'Tang dynasty Chinese gongbi heavy color',     elements: 'palace architecture, horses, lanterns' },
  '五代十国': { style: 'Five dynasties Chinese landscape',            elements: 'mountains, rivers, ancient city walls' },
  '北宋': { style: 'Song dynasty Chinese ink wash painting',      elements: 'markets, teahouses, riverside, misty streets' },
  '南宋': { style: 'Song dynasty Chinese ink wash painting',      elements: 'markets, teahouses, riverside, misty streets' },
  '元':   { style: 'Yuan dynasty Chinese ink landscape',          elements: 'grassland, vast sky, yurts' },
  '明':   { style: 'Ming dynasty Chinese literati ink painting',  elements: 'gardens, pavilions, calligraphy scrolls' },
  '清':   { style: 'Qing dynasty Chinese court painting',         elements: 'palace halls, gardens, courtyards' },
  '中华民国': { style: 'Republic of China early 20th century painting', elements: 'modern streets, tram lines, old buildings' },
  'default':{ style: 'Ancient Chinese ink wash painting',          elements: 'historical landscape scenery' },
}

/**
 * 纯函数：朝代 → 模板（精确匹配，未命中走 default）
 * @param {string} era state.dynasty 实际值
 * @returns {{style: string, elements: string}}
 */
function getDynastyTemplate(era) {
  return PROMPT_BY_DYNASTY[era] || PROMPT_BY_DYNASTY['default']
}

module.exports = { PROMPT_BY_DYNASTY, getDynastyTemplate }
