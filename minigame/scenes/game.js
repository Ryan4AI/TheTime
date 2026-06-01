// Game scene — 穿越后的主游戏场景
// 每页一个抉择点 + 自由输入 + 古风氛围场景
// 视觉：不同地点有专属氛围背景（城门口、茶摊、街道、客栈、河边...）
// 交互：点击选项 | 底部物品栏常驻

const ui = require('../engine/ui')
const { COLORS, getSystemInfo, drawBackground, drawText, hitTest, roundRect } = ui
const { FadeAnim, SlideFadeAnim } = require('../engine/anim')

var gameState = null
var layout = {}
var anims = {}
var currentItems = []

// 故事数据：每个场景 key -> { text, atmosphere, options }
var D = {}
var ERA = { year: '崇宁元年', location: '汴京', age: 25, money: '3贯' }

// 定义对话节点
// 使用函数包裹避免单引号冲突
function buildDialogue() {
  var d = {}

  // D0 - 初始场景
  d.start = {
    text: '你站在汴京城门前，仰头望去。城门上「朱雀门」三个大字映入眼帘——你认得出，宋代用的就是繁体字。',
    atmosphere: 'city_gate',
    options: [
      { label: '打量城门四周的人', key: 'look_around' },
      { label: '径直向城门走去', key: 'approach' },
    ],
  }

  d.look_around = {
    text: '进城的队伍排了二三十人，有挑着担子的农夫，有赶着驴车的商贩，还有几个书生模样的年轻人。守城的士兵正挨个盘问，态度倒还算客气。',
    atmosphere: 'city_gate',
    options: [
      { label: '排队进城', key: 'queue_up' },
      { label: '去路边茶摊歇歇脚', key: 'teahouse' },
    ],
  }

  d.approach = {
    text: '你走到城门前，守卫伸手拦住你：「什么人？打哪儿来的？」他上下打量你的衣着，眼神里满是狐疑。',
    atmosphere: 'city_gate',
    options: [
      { label: '说自己是远方来的商人', key: 'merchant' },
      { label: '说自己是游学的书生', key: 'scholar' },
      { label: '塞几个铜板过去', key: 'bribe' },
    ],
  }

  d.queue_up = {
    text: '你排在队伍末尾。前面一个老汉挑着两筐梨，扁担压得弯弯的。他回头冲你笑了笑：「头一回来汴京吧？看你面生。」',
    atmosphere: 'city_gate',
    options: [
      { label: '跟老汉打听汴京', key: 'chat_oldman' },
      { label: '微笑着点点头', key: 'nod_smile' },
    ],
  }

  d.teahouse = {
    text: '路边茶摊支着青布棚子，茶博士正在吆喝。你坐下来要了一碗茶。茶汤清亮，入口微苦回甘——跟后世的茶不太一样。',
    atmosphere: 'teahouse',
    options: [
      { label: '向茶博士打听消息', key: 'ask_teaman' },
      { label: '喝完茶再去排队', key: 'queue_up' },
    ],
  }

  d.merchant = {
    text: '「商人？」守卫又打量了你一遍，「从哪来的？卖什么货？」他伸手要你拿出凭证来。',
    atmosphere: 'city_gate',
    options: [
      { label: '说货在路上，先来探路', key: 'bluff_in' },
      { label: '掏点碎银子打点', key: 'bribe' },
    ],
  }

  d.scholar = {
    text: '「读书人？」守卫的语气缓和了些，「衣裳倒是穿得古怪。可有路引？」你愣了一下——宋代进城门还要路引的。',
    atmosphere: 'city_gate',
    options: [
      { label: '说路引被偷了', key: 'lost_pass' },
      { label: '报个有名头的书院', key: 'name_academy' },
    ],
  }

  d.bribe = {
    text: '守卫不动声色地收了铜板，不耐烦地挥挥手：「行了行了，进去吧，别挡着道。」你就这么进了城。',
    atmosphere: 'street',
    options: [
      { label: '看看汴京街景', key: 'street_walk' },
      { label: '找个客栈落脚', key: 'inn' },
    ],
  }

  d.chat_oldman = {
    text: '老汉乐呵呵地跟你聊了起来。他说自己每旬进城卖一次梨，家里种了十几棵梨树，日子还过得去。正说着，前面轮到他了。',
    atmosphere: 'city_gate',
    options: [
      { label: '跟着老汉一起进城', key: 'follow_old' },
      { label: '自己单独应对守卫', key: 'approach' },
    ],
  }

  d.nod_smile = {
    text: '你笑了笑没说话。老汉也不在意，转回身去。队伍缓缓向前移动，不一会就到了城门口。守卫正盯着你呢。',
    atmosphere: 'city_gate',
    options: [
      { label: '应对守卫盘问', key: 'approach' },
      { label: '装傻混过去', key: 'bluff_in' },
    ],
  }

  d.ask_teaman = {
    text: '茶博士是个话篓子，一边擦碗一边给你讲：「听说蔡京大人最近又要变法了……街东头王家米铺的米价又涨了两文……城南勾栏来了个新班子，唱得可真不赖。」',
    atmosphere: 'teahouse',
    options: [
      { label: '问蔡京变法的事', key: 'reform_talk' },
      { label: '问勾栏在哪', key: 'theater_ask' },
    ],
  }

  d.bluff_in = {
    text: '守卫将信将疑，又盘问了几句，最后还是让你进去了。你松了口气，走进了这座千年古都。眼前是一条宽阔的大街，两旁店铺林立，人来人往。',
    atmosphere: 'street',
    options: [
      { label: '沿街逛逛', key: 'street_walk' },
      { label: '找地方住下', key: 'inn' },
    ],
  }

  d.lost_pass = {
    text: '「路引被偷了？」守卫皱着眉头，「那得去县衙补办。你先进来吧，别在城门口堵着。」他侧身让开了一条路。',
    atmosphere: 'street',
    options: [
      { label: '先找客栈，再去县衙', key: 'inn' },
      { label: '逛逛再说', key: 'street_walk' },
    ],
  }

  d.name_academy = {
    text: '你随口报了个白鹿洞书院的名号。守卫肃然起敬：「原来是白鹿洞的学子，失敬失敬。」恭恭敬敬地请你进去了。',
    atmosphere: 'street',
    options: [
      { label: '逛逛汴京街市', key: 'street_walk' },
      { label: '找个书院交流交流', key: 'academy_visit' },
    ],
  }

  d.follow_old = {
    text: '老汉替你说了几句好话，守卫没多问就放你们进城了。汴京城里比城外热闹百倍——酒楼茶肆，绸缎庄，书铺，琳琅满目。',
    atmosphere: 'street',
    options: [
      { label: '沿街闲逛', key: 'street_walk' },
      { label: '找地方住下', key: 'inn' },
    ],
  }

  d.street_walk = {
    text: '汴京的街市热闹非凡。路边有卖糖人的、耍把式的、算命的。远处飘来酒肉的香气，勾得人肚子里咕咕叫。你身上还有几贯铜钱，够花几天的。',
    atmosphere: 'street',
    options: [
      { label: '去酒肆吃一顿', key: 'tavern_eat' },
      { label: '找个客栈住下', key: 'inn' },
      { label: '四处转转', key: 'wander' },
    ],
  }

  d.inn = {
    text: '你在城东找到一家客栈，门楣上写着「悦来客栈」。掌柜的是个和气的胖大叔，要了一间普通房，一晚五十文。房间不大，但干净。你放下东西，歇了口气。',
    atmosphere: 'room',
    options: [
      { label: '出去逛逛汴京的夜晚', key: 'night_stroll' },
      { label: '跟掌柜打听消息', key: 'ask_innkeep' },
      { label: '早点歇息', key: 'sleep' },
    ],
  }

  d.reform_talk = {
    text: '茶博士压低声音说：「蔡大人要整顿盐铁，听说还要增税……老百姓叫苦不迭啊。」你心里一惊——崇宁元年，蔡京变法正是北宋由盛转衰的开端。',
    atmosphere: 'teahouse',
    options: [
      { label: '继续打听朝堂的事', key: 'court_news' },
      { label: '喝完茶去城里转转', key: 'street_walk' },
    ],
  }

  d.theater_ask = {
    text: '「城南勾栏——瓦舍里头，老远就能看见彩旗的就是。」茶博士比划着，「晚上去最热闹，有杂剧、傀儡戏，还有说书先生讲三国呢。」',
    atmosphere: 'teahouse',
    options: [
      { label: '去勾栏看看', key: 'theater_go' },
      { label: '先办正事', key: 'street_walk' },
    ],
  }

  d.academy_visit = {
    text: '你问了路，找到汴京最有名的书院。几个年轻学子正在门前谈论诗经，见你衣着奇特，好奇地围了上来。',
    atmosphere: 'academy',
    options: [
      { label: '跟他们谈诗论文', key: 'poetry_talk' },
      { label: '打听朝廷的事', key: 'court_news' },
    ],
  }

  d.tavern_eat = {
    text: '你进了一家酒肆，要了一壶酒两碟小菜。酒是黄酒，温热了端上来，入口醇厚。隔壁桌几个商人在谈生意，说南方来的丝绸又涨了价。',
    atmosphere: 'tavern',
    options: [
      { label: '听听他们在聊什么', key: 'eavesdrop' },
      { label: '吃完去找住处', key: 'inn' },
    ],
  }

  d.wander = {
    text: '你穿过几条街巷，来到了汴河边。河上有座石拱桥，桥上行人来来往往。桥下有船夫撑着乌篷船经过，船头挂着红灯笼。好一幅清明上河图的景致。',
    atmosphere: 'river',
    options: [
      { label: '站在桥上看风景', key: 'bridge_view' },
      { label: '找船夫聊聊天', key: 'boatman_talk' },
    ],
  }

  d.night_stroll = {
    text: '入夜后的汴京别有一番风情。街上灯笼亮了起来，酒楼里传出丝竹声。远处夜市的吆喝声此起彼伏——卖馄饨的、卖糖炒栗子的、卖蜜饯的……',
    atmosphere: 'night_street',
    options: [
      { label: '去夜市逛逛', key: 'night_market' },
      { label: '回客栈休息', key: 'sleep' },
    ],
  }

  d.ask_innkeep = {
    text: '掌柜是个健谈的人，一边拨算盘一边跟你说：「客官是外地来的吧？最近汴京可不太平——蔡京大人新官上任，到处都在变。您晚上别往城西跑，那边正抓人呢。」',
    atmosphere: 'room',
    options: [
      { label: '问抓人的事', key: 'arrest_news' },
      { label: '上楼歇息', key: 'sleep' },
    ],
  }

  d.sleep = {
    text: '你躺在床上，回想这一天发生的事。窗外传来更夫敲梆子的声音——「天干物燥，小心火烛。」你翻了个身，沉沉睡去。',
    atmosphere: 'room',
    options: [
      { label: '第二天继续探索', key: 'dawn' },
    ],
  }

  d.dawn = {
    text: '清晨的阳光透过窗纸照进来。楼下传来店小二的吆喝声。你洗漱下楼，新的一天开始了。汴京城又热闹了起来。',
    atmosphere: 'street_day',
    options: [
      { label: '出门逛逛', key: 'street_walk' },
      { label: '去茶馆吃早点', key: 'teahouse' },
    ],
  }

  d.court_news = {
    text: '你越听越觉得有意思。崇宁元年正是北宋党争最烈的时候——旧党被打压，新党当权。你这个穿越者知道接下来会发生什么，但眼下什么都做不了。',
    atmosphere: 'teahouse',
    options: [
      { label: '继续逛汴京', key: 'street_walk' },
      { label: '回客栈写日记', key: 'diary' },
    ],
  }

  d.theater_go = {
    text: '勾栏里人声鼎沸。台上正在演一出杂剧，讲的是包拯办案的故事——当然，包大人这会儿还在山东当知县呢。台下的叫好声震耳欲聋。',
    atmosphere: 'night_street',
    options: [
      { label: '看完戏回去', key: 'inn' },
      { label: '跟旁边的人聊聊', key: 'stranger_chat' },
    ],
  }

  d.poetry_talk = {
    text: '几个年轻学子听说你「从远方来」，兴致勃勃地跟你聊起诗赋。你说出一句苏轼的词，他们惊喜不已——虽然苏轼这时候已经贬到海南了。',
    atmosphere: 'academy',
    options: [
      { label: '跟他们讨论苏轼', key: 'sushi_talk' },
      { label: '告辞去逛城', key: 'street_walk' },
    ],
  }

  d.eavesdrop = {
    text: '你竖起耳朵听了一会儿。原来他们是在商量合伙贩运茶叶的事，利润可观但风险也不小。其中一人叹气说：「要不是蔡京的新税法……」',
    atmosphere: 'tavern',
    options: [
      { label: '要不要插一嘴？', key: 'join_business' },
      { label: '吃完走人', key: 'street_walk' },
    ],
  }

  d.bridge_view = {
    text: '站在拱桥上，汴河两岸的景致尽收眼底。远处有粮船缓缓驶来，近处有妇人在河边浣衣。几个光屁股的小孩在浅水处摸鱼，笑声清脆。',
    atmosphere: 'river',
    options: [
      { label: '继续往前走', key: 'street_walk' },
      { label: '在河边坐一会儿', key: 'river_sit' },
    ],
  }

  d.boatman_talk = {
    text: '老船夫叼着烟袋，慢悠悠地说：「这汴河啊，养活了多少人。从江南运粮上来，从北方运皮货下去……河就是命根子。」他指了指远处：「瞧见那座宅子没？那是蔡京家的别院。」',
    atmosphere: 'river',
    options: [
      { label: '打听蔡京的事', key: 'court_news' },
      { label: '谢过船夫，上岸逛逛', key: 'street_walk' },
    ],
  }

  d.night_market = {
    text: '夜市灯火通明。你买了一串糖葫芦，酸酸甜甜的，跟后世的没什么两样。一个算命先生拉住你：「这位公子，我看你面相不凡——要不要算一卦？」',
    atmosphere: 'night_street',
    options: [
      { label: '算一卦', key: 'fortune' },
      { label: '婉拒，继续逛', key: 'sleep' },
    ],
  }

  d.arrest_news = {
    text: '掌柜压低声音：「听说抓的是元祐党人。上面发了文书，连苏轼的诗词都不让印了……」这就是历史上著名的「崇宁党禁」。',
    atmosphere: 'room',
    options: [
      { label: '上楼歇息', key: 'sleep' },
      { label: '写点东西记录下来', key: 'diary' },
    ],
  }

  d.diary = {
    text: '你拿出随身带的笔记本，把今天的见闻记了下来。用简体字写在这里，倒也不怕被人看见——反正这个时代没人看得懂。',
    atmosphere: 'room',
    options: [
      { label: '收好笔记本，睡了', key: 'sleep' },
      { label: '再出去转转', key: 'night_stroll' },
    ],
  }

  d.stranger_chat = {
    text: '旁边是个书生打扮的年轻人，看得兴起跟你搭话：「兄台觉得这出戏如何？」你们聊了几句，得知他叫周子安，是太学的学生。',
    atmosphere: 'night_street',
    options: [
      { label: '跟周子安结交', key: 'make_friend' },
      { label: '看完告辞', key: 'inn' },
    ],
  }

  d.sushi_talk = {
    text: '说到苏轼，几个学子既崇敬又惋惜。「苏学士这会儿在儋州——就是海南岛，听说日子过得清苦。」你心想：再过几年，苏轼就要北归了，可惜那时候他也没几年了。',
    atmosphere: 'academy',
    options: [
      { label: '继续聊', key: 'chat_more_academy' },
      { label: '告辞离去', key: 'street_walk' },
    ],
  }

  d.join_business = {
    text: '你凑过去搭话。几个商人见你面生，警惕地打量你。你随口说了几句后世对茶叶市场的见解，把他们听得一愣一愣的——「这位兄台高见！不知在哪发财？」',
    atmosphere: 'tavern',
    options: [
      { label: '编个身份糊弄过去', key: 'bluff_merchant' },
      { label: '坦言自己是穿越来的', key: 'truth_bomb' },
    ],
  }

  d.river_sit = {
    text: '你在河边找了个干净石头坐下。夕阳西下，汴河被染成金色。远处传来钟声——是相国寺的晚钟。这一刻，你真的感觉回到了九百年前。',
    atmosphere: 'river',
    options: [
      { label: '回城', key: 'street_walk' },
      { label: '找地方过夜', key: 'inn' },
    ],
  }

  d.fortune = {
    text: '算命先生煞有介事地看了看你的手相，又看了看你的脸，忽然脸色一变——「公子的命相……老朽从未见过。你的命线好像是从别处接过来的。」你心里咯噔一下。',
    atmosphere: 'night_street',
    options: [
      { label: '让他继续说', key: 'fortune_2' },
      { label: '给钱走人', key: 'sleep' },
    ],
  }

  d.fortune_2 = {
    text: '「公子面相带着不属于这个时空的气息。」算命先生压低声音，「我师父在世时说过，每隔百年会有这样的人出现——叫作「渡世之人」。」',
    atmosphere: 'night_street',
    options: [
      { label: '追问更多', key: 'mystery' },
      { label: '心中不安，离开', key: 'sleep' },
    ],
  }

  d.mystery = {
    text: '算命先生摇摇头：「天机不可尽泄。公子只需记住——你来到这里自有因果。该你知道的时候，自然会知道。」你心里五味杂陈。',
    atmosphere: 'night_street',
    options: [
      { label: '回客栈琢磨', key: 'diary' },
      { label: '暂且放下，到处走走', key: 'night_stroll' },
    ],
  }

  d.make_friend = {
    text: '你和周子安相谈甚欢，约好明日在太学见面。他拍了拍你的肩膀：「能在勾栏遇到兄台这样的妙人，实在是缘分。」',
    atmosphere: 'night_street',
    options: [
      { label: '去太学找他', key: 'academy_visit' },
      { label: '先顾好自己的事', key: 'inn' },
    ],
  }

  d.chat_more_academy = {
    text: '聊到尽兴处，一个学子忽然说：「听说朝廷要立「元祐党人碑」，把旧党的人名刻在石碑上，让他们遗臭万年。」众人唏嘘不已。',
    atmosphere: 'academy',
    options: [
      { label: '记住这件事', key: 'diary' },
      { label: '告辞', key: 'street_walk' },
    ],
  }

  d.bluff_merchant = {
    text: '你说自己是从海上丝绸之路来的商人，专做瓷器茶叶生意。几个商人听得眼睛发亮——这可是打通海外市场的机会。',
    atmosphere: 'tavern',
    options: [
      { label: '跟他们谈合作', key: 'deal' },
      { label: '含糊过去，走人', key: 'street_walk' },
    ],
  }

  d.truth_bomb = {
    text: '你说你是从九百年后的未来穿越来的，他们先是愣住，然后哈哈大笑——「兄台真是个妙人，这酒我请了！」他们显然当你在说醉话。没人会相信真相的。',
    atmosphere: 'tavern',
    options: [
      { label: '笑笑不再解释', key: 'street_walk' },
      { label: '继续喝', key: 'sleep' },
    ],
  }

  d.deal = {
    text: '你跟几个商人约好了明日再谈。这或许是你在这个时代的第一个机会——用现代人的商业头脑在宋代做生意。',
    atmosphere: 'tavern',
    options: [
      { label: '赴约谈生意', key: 'deal_done' },
      { label: '睡过头了，算了', key: 'street_walk' },
    ],
  }

  d.deal_done = {
    text: '第二天你如约来到酒楼。商人老李拿出一份契书，请你过目。你看了一眼——繁体竖排，从右往左读，花了半天才看懂。这生意要是做成了，够你在这里立足的。',
    atmosphere: 'tavern',
    options: [
      { label: '签了', key: 'street_walk' },
      { label: '再考虑考虑', key: 'street_walk' },
    ],
  }

  d.default = {
    text: '你在汴京城里漫无目的地走着，脚下的青石板路延伸到远方。这座千年古都处处都是故事——而你的故事才刚刚开始。',
    atmosphere: 'street',
    options: [
      { label: '继续探索', key: 'street_walk' },
      { label: '找个地方歇脚', key: 'inn' },
    ],
  }

  return d
}

D = buildDialogue()

function getScene(key) {
  if (!key || !D[key]) return D.start
  return D[key]
}

function calcLayout() {
  var sys = getSystemInfo()
  layout = {
    w: sys.width,
    h: sys.height,
    cx: Math.floor(sys.width / 2),
  }
}

function init(items, identity) {
  currentItems = items || []
  // 存储身份数据供叙事使用
  gameState = {
    currentKey: null,
    showAll: false,
    charIndex: 0,
    lastCharTime: 0,
    charSpeed: 25,
  }
  calcLayout()
  var now = Date.now()
  anims = {
    fadeIn: new FadeAnim(50, 400),
    pageFade: new SlideFadeAnim(3, 150, 450),
  }
  anims.fadeIn.start(now)
  anims.pageFade.start(now)
}

function onTouch(x, y, type) {
  if (type !== 'end') return null
  var gs = gameState
  var l = layout
  var scene = getScene(gs.currentKey)

  if (scene && gs.showAll && scene.options) {
    var optW = Math.floor(l.w * 0.82)
    var optX = Math.floor((l.w - optW) / 2)
    var optStartY = Math.floor(l.h * 0.64)
    var optH = 34
    var optSep = 8

    for (var i = 0; i < scene.options.length; i++) {
      var by = optStartY + i * (optH + optSep)
      if (hitTest(x, y, optX, by, optW, optH)) {
        var optKey = scene.options[i].key
        var next = D[optKey]
        if (next) {
          gs.currentKey = optKey
          gs.showAll = false
          gs.charIndex = 0
          gs.lastCharTime = 0
          anims.pageFade.start(Date.now())
        }
        return null
      }
    }
  }

  // 没点到选项：文字没显示完就显示完
  if (!gs.showAll) {
    gs.showAll = true
    gs.charIndex = 9999
  }

  return null
}

function wrapText(ctx, text, maxWidth) {
  if (!text || text.length === 0) return ['']
  var cw = ctx.measureText('字').width
  if (cw <= 0) cw = maxWidth / text.length
  var cpl = Math.floor(maxWidth / cw)
  if (cpl < 1) cpl = 1
  var lines = []
  for (var i = 0; i < text.length; i += cpl) {
    lines.push(text.slice(i, i + cpl))
  }
  return lines
}

// ─── 氛围背景绘制 ───
// 每个函数接收 (ctx, w, h, time) 绘制不同场景

var A = {}

A.city_gate = function(ctx, w, h, t) {
  var g = ctx.createLinearGradient(0, 0, 0, h * 0.5)
  g.addColorStop(0, '#0a0e1a')
  g.addColorStop(0.6, '#1a1424')
  g.addColorStop(1, '#2a1a14')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  g = ctx.createLinearGradient(0, h * 0.65, 0, h)
  g.addColorStop(0, '#1a1410'); g.addColorStop(1, '#0d0a08')
  ctx.fillStyle = g; ctx.fillRect(0, h * 0.65, w, h * 0.35)
  ctx.fillStyle = 'rgba(30,20,15,0.6)'
  ctx.fillRect(w * 0.08, h * 0.35, w * 0.84, h * 0.32)
  ctx.fillStyle = 'rgba(5,3,2,0.8)'
  var gw = w * 0.15, gh = h * 0.2
  ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.55, gw / 2, gh / 2 + 5, 0, 0, Math.PI * 2); ctx.fill()
  ;[0.3, 0.7].forEach(function(p) {
    var tg = ctx.createRadialGradient(w * p, h * 0.55, 0, w * p, h * 0.55, w * 0.15)
    tg.addColorStop(0, 'rgba(255,180,80,0.08)'); tg.addColorStop(1, 'rgba(255,180,80,0)')
    ctx.fillStyle = tg; ctx.fillRect(0, 0, w, h)
  })
}

A.teahouse = function(ctx, w, h, t) {
  var g = ctx.createLinearGradient(0, 0, 0, h * 0.5)
  g.addColorStop(0, '#0e1218'); g.addColorStop(0.5, '#1a1820'); g.addColorStop(1, '#202018')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  g = ctx.createLinearGradient(0, h * 0.6, 0, h)
  g.addColorStop(0, '#181410'); g.addColorStop(1, '#0d0a08')
  ctx.fillStyle = g; ctx.fillRect(0, h * 0.6, w, h * 0.4)
  ctx.fillStyle = 'rgba(60,50,40,0.5)'
  ctx.beginPath(); ctx.moveTo(w * 0.05, h * 0.08); ctx.lineTo(w * 0.5, h * 0.02)
  ctx.lineTo(w * 0.95, h * 0.08); ctx.lineTo(w * 0.85, h * 0.35)
  ctx.lineTo(w * 0.15, h * 0.35); ctx.closePath(); ctx.fill()
  var lg = ctx.createRadialGradient(w * 0.3, h * 0.4, 0, w * 0.3, h * 0.4, w * 0.2)
  lg.addColorStop(0, 'rgba(255,180,60,0.06)'); lg.addColorStop(1, 'rgba(255,180,60,0)')
  ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h)
}

A.street = function(ctx, w, h, t) {
  var g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#0a0d12'); g.addColorStop(0.3, '#141218')
  g.addColorStop(0.6, '#1a1614'); g.addColorStop(1, '#0d0a08')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  for (var i = 0; i < 12; i++) {
    var bx = w * (0.02 + i * 0.08 + Math.sin(i * 3) * 0.02)
    var bh = h * 0.22 + Math.sin(i * 5) * h * 0.06
    ctx.fillStyle = 'rgba(25,18,14,' + (0.3 + Math.sin(i * 2) * 0.1) + ')'
    ctx.fillRect(bx, h * 0.35 - bh, w * 0.06, bh)
  }
  ;[0.38, 0.65].forEach(function(p) {
    var lg = ctx.createRadialGradient(w * p, h * 0.55, 0, w * p, h * 0.55, w * 0.18)
    lg.addColorStop(0, 'rgba(255,160,50,0.04)'); lg.addColorStop(1, 'rgba(255,160,50,0)')
    ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h)
  })
}

A.room = function(ctx, w, h, t) {
  var g = ctx.createRadialGradient(w * 0.35, h * 0.15, 0, w * 0.35, h * 0.15, w * 0.8)
  g.addColorStop(0, '#2a1e18'); g.addColorStop(0.5, '#181210'); g.addColorStop(1, '#0a0808')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(40,30,25,0.3)'; ctx.fillRect(w * 0.05, 0, w * 0.18, h * 0.4)
  var cg = ctx.createRadialGradient(w * 0.25, h * 0.3, 0, w * 0.25, h * 0.3, w * 0.35)
  cg.addColorStop(0, 'rgba(255,180,80,0.05)'); cg.addColorStop(1, 'rgba(255,180,80,0)')
  ctx.fillStyle = cg; ctx.fillRect(0, 0, w, h)
}

A.academy = function(ctx, w, h, t) {
  var g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#0e1418'); g.addColorStop(0.5, '#14181a'); g.addColorStop(1, '#0e0e10')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(30,50,35,0.2)'; ctx.lineWidth = 1
  for (var i = 0; i < 5; i++) {
    var bx = w * (0.05 + i * 0.02)
    ctx.beginPath(); ctx.moveTo(bx, h)
    ctx.quadraticCurveTo(bx + 5, h * 0.6, bx + 3, h * 0.3); ctx.stroke()
  }
}

A.river = function(ctx, w, h, t) {
  var g = ctx.createLinearGradient(0, 0, 0, h * 0.5)
  g.addColorStop(0, '#0a0e18'); g.addColorStop(0.4, '#141828'); g.addColorStop(1, '#1a1c22')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  g = ctx.createLinearGradient(0, h * 0.5, 0, h)
  g.addColorStop(0, '#181a1e'); g.addColorStop(0.3, '#121618'); g.addColorStop(1, '#0a0c0e')
  ctx.fillStyle = g; ctx.fillRect(0, h * 0.5, w, h * 0.5)
  ctx.fillStyle = 'rgba(50,70,90,0.1)'
  var ry = h * 0.55
  for (var i = 0; i < 20; i++) {
    var rw = 4 + Math.sin(i * 1.5 + t * 0.001) * 2
    ctx.fillRect(w * (0.1 + i * 0.04), ry + Math.sin(i * 0.7 + t * 0.0005) * 3, rw, 1)
  }
  var mg = ctx.createRadialGradient(w * 0.5, ry + 10, 0, w * 0.5, ry + 10, 15)
  mg.addColorStop(0, 'rgba(200,200,180,0.04)'); mg.addColorStop(1, 'rgba(200,200,180,0)')
  ctx.fillStyle = mg; ctx.fillRect(0, 0, w, h)
}

A.night_street = function(ctx, w, h, t) {
  var g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#060810'); g.addColorStop(0.3, '#0e0c16')
  g.addColorStop(0.6, '#161210'); g.addColorStop(1, '#0a0808')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(200,200,220,0.3)'
  for (var i = 0; i < 20; i++) {
    var sx = w * (0.05 + i * 0.05), sy = h * (0.05 + Math.sin(i * 7) * 0.08)
    ctx.fillRect(sx, sy, 1, 1)
  }
  for (var i = 0; i < 6; i++) {
    var lx = w * (0.08 + i * 0.15)
    var lg = ctx.createRadialGradient(lx, h * 0.25, 0, lx, h * 0.25, w * 0.08)
    lg.addColorStop(0, 'rgba(255,160,60,0.05)'); lg.addColorStop(1, 'rgba(255,160,60,0)')
    ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h)
  }
}

A.tavern = function(ctx, w, h, t) {
  var g = ctx.createRadialGradient(w * 0.5, h * 0.15, 0, w * 0.5, h * 0.15, w * 0.7)
  g.addColorStop(0, '#2a1e12'); g.addColorStop(0.4, '#1a1410'); g.addColorStop(1, '#0a0806')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  var lg = ctx.createRadialGradient(w * 0.65, h * 0.25, 0, w * 0.65, h * 0.25, w * 0.2)
  lg.addColorStop(0, 'rgba(255,200,100,0.04)'); lg.addColorStop(1, 'rgba(255,200,100,0)')
  ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h)
}

A.street_day = function(ctx, w, h, t) {
  var g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#2a2e30'); g.addColorStop(0.3, '#1e2024'); g.addColorStop(1, '#121416')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  for (var i = 0; i < 10; i++) {
    ctx.fillStyle = 'rgba(50,45,40,' + (0.1 + Math.sin(i * 3) * 0.05) + ')'
    ctx.fillRect(w * (0.02 + i * 0.1), h * 0.35 - Math.sin(i * 5) * h * 0.04, w * 0.08, h * 0.08 + Math.sin(i * 4) * h * 0.03)
  }
}

A.default = function(ctx, w, h, t) {
  var g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#0a0e14'); g.addColorStop(0.5, '#141218'); g.addColorStop(1, '#0a0808')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
}

function render(ctx) {
  var l = layout
  var gs = gameState
  var now = Date.now()
  var scene = getScene(gs.currentKey)
  var w = l.w, h = l.h

  // 1. 氛围背景
  var atmo = A[scene.atmosphere] || A.default
  atmo(ctx, w, h, now)

  // 渐入
  var fade = anims.fadeIn.update(now)
  var pf = anims.pageFade.update(now)
  ctx.save()
  ctx.globalAlpha = fade

  // ─── 宣纸书页（主视觉区域）───
  var px = Math.floor(w * 0.06)
  var pw = Math.floor(w * 0.88)
  var py = Math.floor(h * 0.10)
  var ph = Math.floor(h * 0.62)

  ctx.save()
  ctx.globalAlpha = pf.opacity * 0.85
  ctx.fillStyle = 'rgba(60,50,40,0.88)'
  roundRect(ctx, px, py, pw, ph, 6); ctx.fill()
  ctx.strokeStyle = 'rgba(200,168,124,0.12)'
  ctx.lineWidth = 0.8
  roundRect(ctx, px, py, pw, ph, 6); ctx.stroke()
  var ig = ctx.createRadialGradient(w * 0.5, py + ph * 0.3, 0, w * 0.5, py + ph * 0.3, pw * 0.6)
  ig.addColorStop(0, 'rgba(80,68,55,0.15)'); ig.addColorStop(0.5, 'rgba(60,50,40,0)')
  ig.addColorStop(1, 'rgba(40,35,30,0.1)')
  ctx.fillStyle = ig; ctx.fillRect(px, py, pw, ph)
  ctx.restore()

  // ─── 左上纪年（朱砂印）───
  ctx.save()
  ctx.globalAlpha = pf.opacity * 0.6
  ctx.fillStyle = '#c04040'
  ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('✦ ' + ERA.year + ' · ' + ERA.location, px + 10, py + 8)
  ctx.restore()

  // ─── 右上属性 ───
  ctx.save()
  ctx.globalAlpha = pf.opacity * 0.4
  ctx.font = '9px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'
  ctx.fillStyle = '#888'
  ctx.fillText('⌛' + ERA.age + '岁  🪙' + ERA.money, px + pw - 10, py + 8)
  ctx.restore()

  // ─── 叙事文字（宣纸内，18px大字）───
  ctx.save()
  ctx.beginPath()
  var tx = px + 16
  var ty = py + 32
  var tw = pw - 32
  var th = ph - 50
  ctx.rect(tx, ty, tw, th); ctx.clip()

  if (scene) {
    if (!gs.showAll) {
      var elapsed = now - gs.lastCharTime
      if (elapsed >= gs.charSpeed) {
        gs.charIndex = Math.min(gs.charIndex + Math.floor(elapsed / gs.charSpeed), scene.text.length)
        gs.lastCharTime = now
      }
    }
    var dt = scene.text.slice(0, gs.showAll ? scene.text.length : gs.charIndex)
    ctx.font = '18px ' + ui.getFontStack()
    var lines = wrapText(ctx, dt, tw)
    var lh = 26

    for (var i = 0; i < lines.length; i++) {
      var ly = ty + i * lh
      if (ly + lh < ty || ly > ty + th) continue
      if (i === 0) {
        ctx.save()
        ctx.fillStyle = 'rgba(200,168,124,0.2)'
        ctx.fillRect(tx, ly + 4, 3, 16)
        ctx.restore()
      }
      drawText(ctx, lines[i], tx + 10, ly + 14, {
        fontSize: 18, color: 'rgba(235,218,190,' + (0.88 * pf.opacity) + ')',
        align: 'left', baseline: 'middle',
      })
    }
  }
  ctx.restore()

  // ─── 选项区域 ───
  if (scene && scene.options && scene.options.length > 0 && gs.showAll) {
    var oy = Math.floor(h * 0.645)
    var ow = pw - 24
    var ox = px + 12
    var oh = 34
    var os = 8

    // 分隔线
    ctx.save()
    ctx.globalAlpha = pf.opacity * 0.15
    ctx.strokeStyle = 'rgba(200,168,124,0.2)'; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(ox + 10, oy); ctx.lineTo(ox + ow - 10, oy); ctx.stroke()
    ctx.fillStyle = 'rgba(200,168,124,0.3)'
    ctx.fillRect(ox + ow / 2 - 2, oy - 2, 4, 4)
    ctx.restore()

    for (var i = 0; i < scene.options.length; i++) {
      var by = oy + 10 + i * (oh + os)
      ctx.save()
      ctx.globalAlpha = pf.opacity * 0.9
      ctx.fillStyle = 'rgba(200,168,124,0.05)'
      roundRect(ctx, ox, by, ow, oh, 3); ctx.fill()
      ctx.fillStyle = '#c05050'
      ctx.beginPath(); ctx.arc(ox + 14, by + oh / 2, 3, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(215,198,168,0.85)'
      ctx.font = '15px ' + ui.getFontStack()
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(scene.options[i].label, ox + 24, by + oh / 2)
      ctx.restore()
    }
  }

  // ─── 底部物品栏 ───
  if (currentItems.length > 0) {
    var iy = h - Math.floor(h * 0.045)
    ctx.save()
    ctx.globalAlpha = pf.opacity * 0.6
    for (var i = 0; i < currentItems.length; i++) {
      var it = currentItems[i]
      var ix = Math.floor(w * (0.15 + i * 0.35))
      if (i > 0) {
        ctx.fillStyle = 'rgba(200,168,124,0.08)'
        ctx.fillRect(ix - w * 0.17, iy - 10, 0.5, 20)
      }
      drawText(ctx, it.icon, ix - 14, iy, {
        fontSize: Math.min(14, w * 0.036),
        align: 'center', baseline: 'middle',
      })
      drawText(ctx, it.name, ix, iy, {
        fontSize: Math.min(11, w * 0.028), color: COLORS.goldDark,
        align: 'left', baseline: 'middle', opacity: 0.5,
      })
    }
    ctx.restore()
  }

  // ─── 轻触展开提示 ───
  if (!gs.showAll) {
    ctx.save()
    ctx.globalAlpha = (0.12 + Math.sin(now * 0.003) * 0.06) * pf.opacity
    ctx.fillStyle = '#b09070'; ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('⌄  轻触展开  ⌄', w * 0.5, py + ph - 8)
    ctx.restore()
  }

  ctx.restore()
}

module.exports = { init, render, onTouch }
