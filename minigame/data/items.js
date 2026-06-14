// 穿越日记 · 物品池
// 30件可以从现代带入古代的随身物品
// 每件物品在穿越后会有不同的用途和价值

const ITEMS = [
  // 图标用 emoji，通过字体回退链渲染（自定义字体无对应字形时自动 fallback 到系统 emoji 字体）
  { id: 'lighter', name: '打火机', desc: '一个防风打火机，还剩大半罐气', icon: '🔥' },
  { id: 'compass', name: '指南针', desc: '军用指南针，指针灵敏', icon: '🧭' },
  { id: 'flashlight', name: '手电筒', desc: '小型LED手电，三节七号电池', icon: '🔦' },
  { id: 'knife', name: '折叠刀', desc: '瑞士军刀，带锯子剪刀开瓶器', icon: '🔪' },
  { id: 'watch', name: '电子表', desc: '卡西欧电子表，带闹钟和秒表', icon: '⌚' },
  { id: 'mirror', name: '小圆镜', desc: '巴掌大的圆形镜子，铜框', icon: '🪞' },
  { id: 'rope', name: '尼龙绳', desc: '七米长的登山绳，承重200kg', icon: '🪢' },
  { id: 'sharpener', name: '磨刀石', desc: '天然油石，巴掌大小', icon: '🪵' },
  { id: 'thermos', name: '保温杯', desc: '不锈钢保温杯，500ml容量', icon: '🥤' },
  { id: 'whistle', name: '哨子', desc: '金属口哨，声音能传很远', icon: '📯' },
  { id: 'glasses', name: '近视镜', desc: '你的备用近视眼镜', icon: '👓' },
  { id: 'notebook', name: '笔记本', desc: '硬壳空白笔记本，60页', icon: '📔' },
  { id: 'pen', name: '签字笔', desc: '黑色签字笔，写得很顺滑', icon: '🖊️' },
  { id: 'magnifier', name: '放大镜', desc: '五倍放大镜，手掌大小', icon: '🔍' },
  { id: 'battery', name: '充电宝', desc: '10000毫安充电宝，满电', icon: '🔋' },
  { id: 'scissors', name: '剪刀', desc: '中号办公剪刀，锋利', icon: '✂️' },
  { id: 'tweezers', name: '镊子', desc: '尖头镊子，医用级别', icon: '🔧' },
  { id: 'fishhook', name: '鱼钩线', desc: '一盒鱼钩加五米鱼线', icon: '🎣' },
  { id: 'candy', name: '一包糖', desc: '薄荷糖，铁盒装，还剩大半', icon: '🍬' },
  { id: 'bandage', name: '绷带', desc: '一卷弹性绷带，医用无菌', icon: '🩹' },
  { id: 'needle', name: '针线包', desc: '一包缝衣针加五色线', icon: '🪡' },
  { id: 'salt', name: '一包盐', desc: '食用精盐，约200克', icon: '🧂' },
  { id: 'spices', name: '香料包', desc: '一小包花椒八角桂皮', icon: '🌿' },
  { id: 'teabag', name: '茶包', desc: '十袋红茶茶包，独立包装', icon: '🍵' },
  { id: 'cigarette', name: '半包烟', desc: '还剩八根香烟和一盒火柴', icon: '🚬' },
  { id: 'playingcards', name: '扑克牌', desc: '一副完整的扑克牌', icon: '🃏' },
  { id: 'headphones', name: '有线耳机', desc: '一副入耳式耳机，音质不错', icon: '🎧' },
  { id: 'coin', name: '一枚硬币', desc: '2024年的一元硬币，很亮', icon: '🪙' },
  { id: 'photo', name: '一张照片', desc: '你家人的合影，过塑了', icon: '📷' },
  { id: 'guitarpick', name: '拨片', desc: '一个吉他拨片，上面刻着字', icon: '🎸' },
]

// Shuffle array (Fisher-Yates)
function shuffle(arr) {
  var a = arr.slice()
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1))
    var tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

// Pick 10 random items from the pool
function drawItems(count) {
  count = count || 10
  return shuffle(ITEMS).slice(0, count)
}

module.exports = { ITEMS, drawItems }
