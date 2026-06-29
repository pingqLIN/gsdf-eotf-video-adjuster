# 測試圖說明

目前的 `test-pattern` 衍生線是一個獨立 React route，會渲染可動態播放的 8-bit 階調流失檢查圖。

## 目前路由

- 本機 app route：`/tone-loss-test`
- Query route：`?mode=tone-loss-test`
- Component：`src/components/ToneLossTestPage.tsx`
- Regression test：`tests/tone-loss-test-page.test.mjs`

## 檢查內容

- 8-bit 低端暗部 code value 的分離能力。
- 8-bit 高端亮部 code value 的分離能力。
- 中性灰、RGB primary、CMY secondary 色塊列。
- 移動掃描線，方便動態觀察相鄰階調是否合併。
- 可選的 `canvas.captureStream(60)` 輸出到真正的 HTML `video` element，讓擴充功能的目標選取器與濾鏡路徑可以對實際 video node 驗證。

這個圖樣是視覺檢查輔助，不是顯示器量測、DICOM 合規測試，也不能取代儀器校正。
