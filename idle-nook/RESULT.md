# 小窩（idle-nook）— 結果（2026-09-17）

不美化，照實寫。截圖都在 `/private/tmp/claude-501/-Users-cook-agents-forge/71da2cd2-1892-46cb-8880-a03a1467f54f/scratchpad/idle-nook/`（session 專屬 scratchpad，非專案目錄）。

## 方法

Playwright headless（`three-units/node_modules/playwright`），`python3 -m http.server 8803` 起在 `~/agents/forge/projects/proto`，指令外層包 `perl -e 'alarm 250; exec @ARGV'`。三種 viewport（844×390、1280×720、390×780）各截一張 t=0 密度圖；另開一個 844×390 分頁，用 `window.__nook.skip(seconds)` 快轉到 0/30分/3小時/12小時，3 小時與 12 小時的快轉過程中每 1800 秒呼叫一次 `window.__nook.buyCheapest()`，四個時間點各截「skip 完馬上」與「再等 5 秒」兩張。全程監聽 `pageerror`/`console.error`。每一張截圖我都自己用 Read 打開看過，不是只看檔案大小。

動手前就決定了題材：三層剖面公寓＋屋頂露台＋門前街道（不是露台農場，避開 Tiny Terraces 仿作；也跟本機既有的 idle-ant/idle-dig 單層礦坑、idle-cove 港灣都不同題材）。

## 過程中抓到的真實 bug（不是最後才發現，是邊做邊撞出來的）

1. **版面比例寫死太小**：第一版 `roofY=H*0.08`，建築幾乎吃滿整個垂直空間，天空只剩 5 個邏輯像素，屋頂露台的人物直接溢出畫面。改成 roofY=H*0.21、四層等比例分配後才正常。
2. **天空只填到「有鎖房間的高度」，兩側露出黑洞**：`skyBottom` 一開始設成 attic 鎖住時的極小高度，導致建築左右兩側（bx0 左邊、bx1 右邊到 W 之間）從屋頂到地面整條都沒有任何東西畫到，直接漏出畫布底色（近黑）——這正是製作人之前罵過的「一片黑」。改成天空漸層一律拉到 `groundY`，建築畫在上面覆蓋，兩側自然露出天空色，再加一棵行道樹把左側空隙填成有內容的角落。
3. **鎖住的房間長得像「壞掉」而不是「還沒開」**：一開始用純黑直條紋填滿，兩個直向相鄰的鎖房間（二樓右、一樓右）疊在一起看起來像一大塊黑洞。改成暖色木板交叉封條＋紅色邊框＋深色徽章＋清楚的價格數字。
4. **價格數字用非整數座標畫，糊成一片**：像素字型 `txt()` 沒有對座標取整數，在 S=2 的視窗下數字邊緣會被瀏覽器抗鋸齒，糊成一團看不出是數字。加上 `Math.round` 並在數字底下墊一塊深色底板才清楚。
5. **雨的繪圖順序錯了**：雨滴/屋簷滴水寫在 `drawStreet()` 裡，但 `drawStreet()` 在 `drawBuilding()`**之前**呼叫，導致雨滴全部被後畫的建築蓋掉，實際上從來沒有真的顯示過（用 `window.__nook.skip()` 跳到一個確定會下雨的時間點截圖驗證才發現）。把雨獨立成 `drawRain()`，移到整個 `draw()` 最後一步才修好。
6. **顧客的襯衫顏色跟桌子顏色一樣**：`drawCustomer` 的 shirt 是 `PAL.red`，站的桌子也是紅色，身體整個隱形在桌子裡，只剩頭跟腿看得到。改成藍色。
7. **行道樹第一版太高太寬，塞不進建築側邊的窄縫**：用建築高度的比例算樹高，結果在窄邊距（22px）裡放了一棵 61px 高、36px 寬的樹，一半被裁到畫面外。改成用邊距寬度本身（`L.bx0`）算樹的大小，邊距太窄（<16px，例如手機直式）直接不畫，不硬塞。

以上全部是實際跑截圖、自己打開看了才發現的，不是憑代碼推測。

## ① 密度：三種視窗 t=0

- `density_844x390.png`、`density_1280x720.png`：兩張都是建築三層＋屋頂＋街道完整可見，橫向填滿螢幕（建築本體 + 兩側行道樹/信箱/圍籬把空隙補滿），數得出的會動元素遠超過 5 個且分布在 5-6 個區域：屋頂（園丁澆花/伸懶腰、煙囪冒煙、曬衣繩擺動）、天空（太陽、雲飄、鳥飛）、二樓左（讀者翻書、貓呼吸）、一樓左（廚師攪拌、蒸氣）、地面（店員擦櫃檯、顧客）、街道（貓走動、路燈）。過。
- `density_390x780.png`（手機直式）：建築置中縮小，四層都看得到，沒有裁到只剩一層，也沒有黑洞或破圖，行道樹因邊距太窄被跳過（設計內判斷，不是漏畫）。滿足「至少不壞」，沒有到「填滿」的程度（兩側留白），符合判準對直式的較低要求。過。

## ② 四張時間點截圖：越來越熱鬧

`state_0.json` ~ `state_12h.json` 的實測數字：

| 時間點 | 已解鎖 | 銀行（毛線球） |
|---|---|---|
| 0 分 | 無 | 0.02 |
| 30 分 | 閣樓讀書角（音樂角） | 60.3 |
| 3 小時 | +前院花圃、+工作坊 | 84.6 |
| 12 小時 | +屋頂溫室（全部 4 個都解鎖） | 1701.2 |

不用讀數字，肉眼看四張圖（`growth_0_t0.png` → `growth_30min_t0.png` → `growth_3h_t0.png` → `growth_12h_t0.png`）：
- 0→30分：二樓右側從「木板封條」變成有烏克麗麗小孩在彈琴的房間。
- 30分→3小時：一樓右側開出工作坊，建築右側多長出一塊有兔子跟花圃的院子。
- 3小時→12小時：**屋頂正上方多長出一整塊青色的溫室結構**（真的長出新的一層，不是換色），門口籃子旁邊也多了好幾個灰色的貨箱堆疊（資源溢出的實體化）。

12 小時比 3 小時明顯更豐富，過。**老實說擴建在 12 小時內就全部封頂**（4 個擴建全部解鎖完），封頂之後靠兩件事撐住「還在變化」的觀感：籃子旁邊持續增加的貨箱堆疊（3 小時時 0 個、12 小時時 5 個），跟窗台植物的生長階段（1 小時內就長到最大，12 小時時所有花盆都是滿開狀態，之後不會再變化——這點是誠實的局限，不是我漏掉）。

四個時間點的 t0/t5 截圖兩兩比對，都能看到至少一項差異（鳥/雲的位置、人物動作幀、天氣），不是靜態截圖。過。

## ③ 冷讀

開了一個全新、無背景的 general-purpose 子代理人，只給它五張圖（0分、0分+5秒、30分、3小時、12小時的 t0 圖），問題照 CRITERIA.md 寫的三條問。原話（一字未改）：

> **1. 類型**："This reads as an idle/incremental simulation — specifically a cutaway 'dollhouse' building sim, in the vein of Tiny Tower or a farm/idle-tycoon hybrid." 判斷依據：浮動的 `+` 數字徽章、右上角「安靜模式」、數值隨時間爬升。**判對了，是我們要的類型。**

> **2. 想不想繼續盯著看**："Honestly, no — not as passive viewing... Between t0 and t5 seconds almost nothing changes... it's mostly numbers ticking and sprites idling in place. This is a 'check in every few hours' game, not a 'stare at the screen' game." **沒過**——雖然結論本身（掛機遊戲是「偶爾回來看」不是「一直盯著」）跟研究報告的結論其實一致，但冷讀者把這個判成負面（"static and low-event"），代表 5 秒內的動態幅度對第一眼觀感來說太小、不夠有記憶點。

> **3. 具體細節**（原話節錄）："a small dark round object with an antenna (like a tiny robot or record-player) sitting on the floor near an orange couch/bench"（其實是店裡的罐子/貓的剪影誤讀）、"a row of dark red segmented blocks along the ridge with a '+2200' counter"（正確認出鎖住房間的封條跟價格牌）、"several of those dots have become small green sprout-shaped characters... reads like a planting-and-growth mechanic"（正確認出花盆的生長階段變化）、"a new large teal/blue-gray rectangular room has appeared extending above the original roofline... this wasn't present in the 3h shot, suggesting something was 'built' or 'unlocked'"（正確認出屋頂溫室的新增）。**給出的細節數遠超過 3 個，且多數是真的對應到畫面上的東西，過，但其中一個把貓/罐子誤讀成機器人/唱片機**，代表小尺寸縮圖下部分道具的可辨識度不夠高。

## 老實列出的局限

- **擴建內容只有 4 格，12 小時內會全部封頂**，之後只剩貨箱堆疊跟（已經封頂的）植物生長撐場面，沒有再往上長的空間——如果要交給 Cook 判斷「值不值得往下做」，這是最該讓他知道的一點：目前這個規模撐不住長期掛機，是一個「幾小時內看完成長曲線」的節奏，不是能無限掛機的節奏（跟 `idle-cove` 當時的結論是同一個局限，這次沒有解決，因為題目沒有要求解決，只要求做出「越來越熱鬧」，這點做到了）。
- **冷讀者對「持續盯著看」給了否定答案**，跟"COZY_IDLE.md"研究裡「玩家真正誇的是環境動態細節」這條的落差在於：我做的環境動態（光影日夜、天氣、煙、鳥、蝴蝶、螢火蟲）在小尺寸縮圖下不夠搶眼，5 秒內的變化量對第一眼印象來說太小。這不是「沒做」，是「做了但畫面尺度/對比不夠讓人一眼抓到」。
- **像素小道具在縮圖尺度下有辨識度風險**（貓被讀成機器人），字級越小這個問題會越明顯，手機直式縮圖沒有另外做冷讀測試。
- 沒有做音效（`state_0` 等 debug 不含音效欄位）；「預設靜音」用「乾脆不做音效」達成，不是「做了音效但關掉」，如果之後要加音效這是留給下一輪的旋鈕。
- 沒有推上站，檔案在 `~/agents/forge/projects/proto/idle-nook/`。
