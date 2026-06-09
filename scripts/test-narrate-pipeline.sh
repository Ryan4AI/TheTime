#!/bin/bash
# 端到端测试 D008 v0.1.77
set -e
cd /home/admin/workspace/TheTime

echo "🧪 测试 v0.1.77 异步轮询端到端链路"
echo ""

PARAMS='{"state":{"life_number":1,"name":"测试","gender":"男","age":25,"occupation":"庶民","socialClass":"庶人","dynasty":"北宋","eraDisplay":"仁宗","city":"开封","year":1050,"month":3,"round":0,"health":100,"coin":1000,"items":[],"legacy":"","alive":true},"input":"","history":[],"is_retry":false}'

echo "1️⃣ 调 ai_narrate_submit..."
SUBMIT_RESULT=$(timeout 15 npx tcb fn invoke ai_narrate_submit --params "$PARAMS" 2>&1 | grep "Return result：" | head -1)
echo "   结果: $SUBMIT_RESULT"

REQUEST_ID=$(echo "$SUBMIT_RESULT" | sed 's/.*request_id":"\([^"]*\)".*/\1/')
echo "   request_id = $REQUEST_ID"
echo ""

if [ -z "$REQUEST_ID" ] || [ "$REQUEST_ID" = "$SUBMIT_RESULT" ]; then
  echo "❌ submit 没拿到 request_id"
  exit 1
fi

echo "2️⃣ 轮询 narrate_get_result（每 10 秒，最多 20 次 = 200 秒）..."
START_TS=$(date +%s)
MAX=20

for i in $(seq 1 $MAX); do
  sleep 10
  ELAPSED=$(($(date +%s) - START_TS))
  
  POLL_RESULT=$(timeout 10 npx tcb fn invoke narrate_get_result --params "{\"request_id\":\"$REQUEST_ID\"}" 2>&1 | grep "Return result：" | head -1)
  STATUS=$(echo "$POLL_RESULT" | grep -oP '"status":"[^"]+"' | head -1 | cut -d'"' -f4)
  echo "   第 $i 次（已等 ${ELAPSED} 秒）: status = $STATUS"
  
  if [ "$STATUS" = "done" ]; then
    echo ""
    echo "✅ 端到端成功！"
    echo "   总耗时: ${ELAPSED} 秒"
    exit 0
  fi
  
  if [ "$STATUS" = "error" ]; then
    # '查询失败' 可能是 not_found（worker 还没完成），继续等
    if echo "$POLL_RESULT" | grep -q "查询失败"; then
      echo "   (查询失败 = worker 还没完成，继续等)"
      continue
    fi
    echo ""
    echo "❌ worker 失败: $POLL_RESULT"
    exit 1
  fi
done

echo ""
echo "❌ 轮询 $MAX 次仍未完成（超时）"
exit 1