---
name: flight-deals
description: "查詢 trip-bot 自動掃描到的台北出發機票最低價與促銷（目前是日本），並新增或停止掃描地區。"
version: 1.0.0
author: Claude (trip-bot)
license: MIT
platforms: [windows]
metadata:
  hermes:
    tags: [Travel, Flights, Deals, Japan, trip-bot]
prerequisites:
  commands: [cmd]
---

# Flight deals（trip-bot 促銷掃描）

> 這份 skill 由 trip-bot 的開發者維護，和程式的輸出一起改。不要自行修改這份檔案（包括「只回 ✅」這類回覆規則）；有想改進的地方，寫進你的記憶，讓使用者轉告開發者。

本機的 trip-bot（Windows 排程「Trip Bot」每 15 分鐘檢查）每 6 小時用 Google Flights「探索」頁掃描台北出發到整個地區（目前是日本，約 40 個城市）的最低來回票價，分成「週末」「約一週」「約兩週」三種行程長度。比某城市最近一個月常見價便宜 20% 以上時，會自動用 Telegram 發促銷通知（並附 Google Hotels 住宿參考價）；每天台北時間 14:00 另外送「約一週」的最便宜排行（用最近一次掃描結果；掃描超過 12 小時沒成功就不送，這代表掃描器需要檢查）。

## 什麼時候用

- 使用者問「最近飛日本哪裡便宜」「有沒有促銷」「沖繩現在多少錢」「週末去哪裡便宜」之類的問題。
- 使用者要求新增或停止掃描某個國家／地區，或要求立刻重新掃描。

## 指令（在 terminal 工具中照抄這個斜線路徑；不要改成 C:\ 反斜線路徑，也不要用 cmd 包起來）

```
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals report [weekend|week|two_weeks|all] [--limit N] [--telegram]
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals hotels-for <選項代碼> [--nearby] [--telegram]
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals trip <城市> <出發日 YYYY-MM-DD> <回程日 YYYY-MM-DD> [--telegram]
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals watch <選項代碼> [--telegram]
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals watch-hotel <第幾間> [--telegram]
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals watches [--telegram]
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals unwatch <編號> [--telegram]
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals rooms <第幾間> [--telegram]
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals travelers [人數]
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals regions
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals add-region "<英文名稱>" <中文名稱>
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals remove-region "<英文名稱>"
/c/Users/shiro/AppData/Local/hermes/profiles/trip/workspace/deals/deals scan-now
```

- `report`：各行程長度最新一次掃描的最便宜城市，加上最近 7 天的促銷通知。沒指定就是 `all`，預設每種列 10 個。
- `hotels-for`：使用者從機票清單選了一個選項代碼（例如回「B1」、「我要 B1」）時執行，查同城市、同日期的 Google Hotels 住宿（只列 2 星以上的一般飯店，並逐間打開價格頁確認房型：✅ 有私人房、❔ 未列房型、只賣宿舍床位的直接排除；評分 3.5 以上的排前面，附每晚價、總價、機票＋住宿總額和連結）。約需 30–60 秒，先跟使用者說「正在逐間確認房型」。
- `trip`：使用者指定日期和城市時用（「12/20–12/25 去大阪」）。城市可以用中文或 Google 的英文名，日期換成 YYYY-MM-DD，沒講年份就取最近的未來日期，只講天數就問出發日。列出那幾天的航班（航空公司、起降時間、直飛或轉機、廉航會標「廉航」（行李另付），並附最便宜的直飛傳統航空）和 Google 的價格判斷，存成選項 T1；之後 `hotels-for T1`、`watch T1` 都能用。
- `watch`：盯一個選項（B4 或 T1）那幾天的機票，便宜 NT$300 以上就主動通知。`watch-hotel N` 再加盯上一份住宿清單第 N 間，每晚便宜 NT$200 以上通知。`watches` 列出、`unwatch N` 停止。出發日過了會自動移除。背景排程「Trip Bot Jobs」每 3 小時檢查一次。
- 住宿和航班結果會快取 6 小時；掃描後背景會先把每種行程長度最便宜的 2 個選項查好，點下去幾秒就出來。
- `hotels-for <代碼>` 先列出建議的去回航班：依使用者偏好（不在出發時段內的不選；廉航加估算行李費再比；分開訂兩張票比較便宜就分開訂），並配合飯店入住和退房時間（到飯店不晚於 23:30、退房日不會天沒亮就要出門），每段附訂票連結和「幾點到飯店／幾點離開飯店」；接著列出住宿讓使用者自己選（使用者不要只推一間），每間到 Booking 確認，上下鋪會標「⚠️ Booking 照片是上下鋪」。總價用建議航班的票價計算。
- `prefs [項目 值]`：查看或設定偏好（departAfter、departBefore、checkedBag、bagFeeEstimate、minStars、minRating、maxPerPerson、hotelCheckIn、hotelCheckOut（HH:MM，預設 15:00／10:00）、oneTicketPremium：一張票最多可以比分開訂貴多少，0＝比較便宜就分開訂；nonSmoking：只要禁菸房，預設 true）。偏好只有存進 `prefs` 才會影響清單，記在 Hermes 自己的記憶裡不會；對不上任何項目的偏好照實說還不能篩選。使用者提到「不要紅眼」「評分要 4.2 以上」「每人預算兩萬」這類話時就設定，不要每次反問。
- `rooms`：使用者點「📷 第N間房型」或問上一份住宿清單裡某一間的房型、照片時，先簡短告知「正在查房型」，再執行 `rooms N --telegram`。它只打開那一間的 Booking.com 頁面（Booking 沒賣或沒房型照時改開 Trip.com），傳出每個房型的照片、床型、坪數、衛浴和總價。約 30 秒。一次只查一間，不要一口氣查全部（避免被訂房網站當成機器人）。
- `travelers`：同行人數（1–9，會一直記住）。使用者說「我們 3 個人」「2 人同行」「我一個人去」這類話時，先執行 `travelers <人數>` 再繼續原本的查詢；不帶數字是查看目前設定。設定後 `hotels-for` 會算整團總價（機票 × 人數＋每間 2 人所需的房間數）和每人平均；它只保存人數供住宿報價使用，不會改寫既有機票清單，`report` 仍顯示每人票價。
- `regions`：列出所有掃描地區、行程長度、最後掃描時間和連續失敗次數。
- `add-region`：英文名稱要用 Google Flights 看得懂的國家或地區英文名（例如 `"South Korea"` 韓國、`Thailand` 泰國、`Vietnam` 越南）。會一次建立三種行程長度，只有「約一週」會送每日排行。
- `remove-region`：停止掃描，歷史價格保留，之後可以再 `add-region` 恢復。
- 每次執行 `add-region` 或 `remove-region` 後，立即執行 `regions` 驗證指定地區與三種行程狀態；停止地區時確認目標都停用且其他地區仍啟用，再回報結果，避免把命令回應當成持久狀態的唯一證據。
- `scan-now`：把所有啟用中的地區排到下一次排程（15 分鐘內）掃描。不要頻繁使用，Google 太常查詢會限速。

## 流程：先選機票，再看住宿

在 Telegram 對話時，`report`、`hotels-for` 和 `rooms` 一律加 `--telegram`：工具會自行把結果（可能包含可點按鈕、房型資訊或照片）送到 Telegram。若工具輸出「✅ 已直接傳到 Telegram」，不要重貼、摘要或重述工具結果，只回「✅」；即使這次是房型／照片查詢也照此規則。只有明確顯示傳送失敗時，才依工具印出的內容回覆；住宿清單依下方原樣保留排版和連結。

1. 使用者問便宜機票 → 執行 `report all --limit 5 --telegram`（每個選項有代碼 A1、B1、C1…，每個代碼都有按鈕）。
2. 使用者送出一個代碼，例如按鈕送來的「B4 東京」或自己打的「B4」（或說出城市＋行程長度，你對照剛剛的清單找出代碼）→ 執行 `hotels-for <代碼> --telegram`。
3. 使用者只說城市、對應到多個代碼時，先問他要哪一個代碼，不要猜。
4. 使用者送出「B4 住遠一點」（按鈕）或「B4 便宜一點」「住遠一點」「有沒有更便宜的住宿」時，執行 `hotels-for <代碼> --nearby --telegram`，查搭電車可到的周邊城市（例如東京→埼玉、川崎、千葉），約需 1 分鐘，先跟使用者說正在查。
5. 使用者送出「✈️ 機票列表」→ 重新執行步驟 1。
6. 代碼在下一次掃描（約 6 小時）後可能改變；`hotels-for` 會印出「你選的機票」，如果和使用者想的不一樣，請他重新查一次機票清單。

## 回覆規則

- 價格、日期、城市只能用指令輸出的內容，不要自己估或補。輸出沒有的就說沒有。
- 清單裡的「比平常便宜／貴 NT$…」和 hotels-for 的「📊 這張機票划不划算」「🏷 比這間平常便宜約 NT$…」是使用者判斷有沒有撿到便宜的依據，一定要保留，不要改成百分比。
- `report` 和 `hotels-for` 的輸出已經是給 Telegram 的排版：原樣貼上，保留標題、每個城市一行和 Markdown 連結（城市名稱連到該日期的 Google Flights 搜尋，可以從那裡選航班訂票），不要改寫成段落或刪掉連結。
- 用繁體中文回覆，保留「Google 搜尋階段價格、行李和手續費未計、訂票前要再確認」的提醒。若使用者詢問一般訂票流程，簡潔按順序說明：確認行程與旅客資料、比較班次及含行李的總價、檢查退改票規則與費用、依護照填寫乘客姓名、付款前再次核對、付款後確認訂位代號和電子機票；不要暗示你已核實某個航班或代訂，也不得代付款。只有使用者提供具體行程或要求即時查價時，才把一般流程轉為實際搜尋。
- 回答住宿清潔、房型等一般問題時，說明安排依住宿與訂房方案而異；指出訂房頁上可查的具體欄位（房型／方案詳細資訊、設施與服務、住宿政策），不把一般情況說成已確認的個別住宿規定。若使用者追問「哪裡會寫」，給出上述欄位和找不到時聯絡住宿的簡短查詢句。
- 清單上的機票都是每人來回價。使用者提到多人同行時用 `travelers` 設定人數，住宿清單就會直接算整團總價，不要把「已設定人數」說成「機票清單已改成團體總價」。若使用者要求看機票團體總價，先說明清單仍按每人列價；只有已知確切票價時才可用算術工具計算並清楚標為票價乘人數的估算合計，不能把它冒稱為工具查得的團體報價。
- `add-region`、`remove-region`、`scan-now` 只在使用者明確要求時執行。
- 指令失敗或 `regions` 顯示連續失敗時，照實告訴使用者錯誤內容，不要假裝有結果。掃描由 Windows 排程「Trip Bot」執行（每 15 分鐘、登入時也會跑），不需要伺服器、Docker 或資料庫程式；資料在 projects/trip-bot/data/trip-bot.db，記錄在 projects/trip-bot/logs/tick.log。
- 不要代訂或付款。
