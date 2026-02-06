/**
 * Telegram Swiftgram 长连接打断脚本
 * REJECT 优先，不存在则通知并降级
 */

const POLICY_GROUP = $argument.POLICY_GROUP || "Telegram";
const INTERRUPT_INTERVAL = $argument.INTERRUPT_INTETVAL || 30;
const ENABLE_NOTIFY = $argument.ENABLE_NOTIFY;
const SELECTED_REJECT = $argument.SELECTED_REJECT;

const now = Math.floor(Date.now() / 1000);

// 上次打断时间
let last = $persistentStore.read("tg_policy_last_interrupt");
last = last ? parseInt(last) : 0;

if (now - last < INTERRUPT_INTERVAL) {
    console.log(`[TG] 跳过策略切换 (${now - last}s / ${INTERRUPT_INTERVAL}s)`);
    $done({});
    return;
}

$persistentStore.write(String(now), "tg_policy_last_interrupt");

const current = $config.getSelectedPolicy(POLICY_GROUP);

$config.getSubPolicies(POLICY_GROUP, function (subPolicies) {
    if (!subPolicies) {
        console.log("[TG] 子策略为空，放行请求");
        $done({});
        return;
    }

    let policiesArray = [];
    try {
        if (typeof subPolicies === "string") {
            policiesArray = JSON.parse(subPolicies);
        } else if (Array.isArray(subPolicies)) {
            policiesArray = subPolicies;
        } else {
            console.log("[TG] 子策略格式不支持", subPolicies);
            $done({});
            return;
        }
    } catch (e) {
        console.log("[TG] JSON.parse 子策略失败", e);
        $done({});
        return;
    }

    const policyNames = policiesArray.map(p => p.name).filter(Boolean);

    /**
     * ===== 优先尝试 REJECT =====
     */
    if (SELECTED_REJECT) {
        if (policyNames.includes("REJECT")) {
            console.log(`[TG] 使用 REJECT 打断: ${current} → REJECT → ${current}`);

            if (ENABLE_NOTIFY) {
                $notification.post(
                    "Telegram 长连接已打断",
                    "使用 REJECT 重置连接",
                    `${current} → REJECT → ${current}`
                );
            }

            $config.getConfig(POLICY_GROUP, "REJECT");

            setTimeout(() => {
                $config.getConfig(POLICY_GROUP, current);
                $done();
            }, 300);

            return; // 命中 REJECT，直接结束
        } else {
            // 🔔 新增：REJECT 不存在提醒
            console.log("[TG] 未检测到 REJECT 子策略，降级使用备用策略");

            if (ENABLE_NOTIFY) {
                $notification.post(
                    "⚠️提示",
                    "未检测到 REJECT 子策略",
                    "请在策略组中加入 REJECT，已尝试切换策略组内其他策略"
                );
            }
            // 不 return，继续走备用策略
        }
    }

    /**
     * ===== 备用策略切换逻辑 =====
     */
    let alternate = null;
    for (let i = 0; i < policyNames.length; i++) {
        if (policyNames[i] !== current) {
            alternate = policyNames[i];
            break;
        }
    }

    if (!alternate) {
        console.log("[TG] 无备用策略可切换，放行请求");
        $done({});
        return;
    }

    console.log(`[TG] 策略切换打断: ${current} → ${alternate} → ${current}`);

    if (ENABLE_NOTIFY) {
        $notification.post(
            "✅Telegram 长连接已打断",
            "通过备用策略重置连接",
            `${current} → ${alternate} → ${current}`
        );
    }

    $config.getConfig(POLICY_GROUP, alternate);

    setTimeout(() => {
        $config.getConfig(POLICY_GROUP, current);
        $done();
    }, 300);
});
