# 年休申請エラー修正完了レポート

## 🎯 修正内容サマリー

### 1. 型定義の強化 ✅
**変更前:**
```typescript
type LeaveApplication = { 
  id: number, 
  user_id: string, 
  date: string, 
  leave_type: string, 
  duration?: string,           // 旧カラム（オプショナル）
  duration_type?: string,      // 新カラム（オプショナル）
  hours_used?: number,         // 消費時間（オプショナル）
  reason: string, 
  status: string 
}
```

**変更後:**
```typescript
type LeaveApplication = { 
  id: number
  user_id: string
  date: string
  leave_type: string
  duration_type: string  // 必須：期間タイプ
  hours_used: number     // 必須：消費時間（整数）
  reason: string
  status: string
  duration?: string      // 旧カラム（後方互換性のため残す）
}
```

---

### 2. handleLeaveApply 関数の改善 ✅

#### 追加機能:
1. **バリデーション強化**
   - 時間休選択時、1〜8時間の範囲チェック
   - 入力値が不正な場合はアラート表示

2. **デバッグログ追加**
   - 送信データをコンソールに出力
   - エラー時の詳細情報を表示

3. **エラーメッセージの改善**
   - DBカラムの存在確認を促すメッセージ

#### 実装コード:
```typescript
const handleLeaveApply = async () => {
    const dateStr = formatDate(selectedDate)
    
    // バリデーション：時間休の場合は時間数が必須
    if (leaveDuration === '時間休' && (!leaveHours || leaveHours < 1 || leaveHours > 8)) {
        alert('時間休を選択した場合は、1〜8時間の範囲で時間数を入力してください。')
        return
    }
    
    // 時間単位で計算
    let hoursUsed = 0
    if (leaveDuration === '時間休') {
        hoursUsed = leaveHours
    } else if (leaveDuration === '1日') {
        hoursUsed = 8
    } else if (leaveDuration === '半日(午前)' || leaveDuration === '半日(午後)') {
        hoursUsed = 4
    }
    
    // デバッグ用ログ
    console.log('休暇申請データ:', {
        user_id: userId,
        date: dateStr,
        leave_type: leaveType,
        duration_type: leaveDuration,
        hours_used: hoursUsed,
        reason: leaveReason,
        status: 'pending'
    })
    
    const { data, error } = await supabase.from('leave_applications').upsert({
        user_id: userId,
        date: dateStr,
        leave_type: leaveType,
        duration_type: leaveDuration,  // ✅ 正しいカラム名
        hours_used: hoursUsed,         // ✅ 計算済みの整数値
        reason: leaveReason,
        status: 'pending'
    }, { onConflict: 'user_id, date' })

    if (error) {
        console.error('休暇申請エラー:', error)
        alert('エラー: ' + error.message + '\n\nDBテーブルに duration_type と hours_used カラムが存在することを確認してください。')
    } else {
        alert(currentLeaveApp ? '申請内容を修正しました！' : '休暇届を申請しました！\n（管理者の承認待ち状態です）')
        fetchData(userId)
        fetchLeaveBalance(userId)
        setOpenCategory(null)
    }
}
```

---

### 3. 時間休UI ✅ (既に実装済み)

**条件付き表示:**
- 「期間」で「時間休」を選択した場合のみ表示
- 1〜8時間の範囲で選択可能
- 数値入力 + クイック選択ボタン（1〜8）の両方をサポート

**UI実装:**
```tsx
{leaveDuration === '時間休' && (
    <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
        <label className="block text-xs font-bold text-slate-700 mb-2">時間数（1〜8時間）</label>
        <div className="flex items-center gap-2">
            <input 
                type="number" 
                min="1" 
                max="8" 
                value={leaveHours} 
                onChange={(e) => setLeaveHours(Math.max(1, Math.min(8, parseInt(e.target.value) || 1)))}
                className="w-20 p-2 text-sm border rounded bg-white text-black font-bold text-center"
            />
            <span className="text-sm text-slate-600">時間</span>
            <div className="flex-1 flex gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(h => (
                    <button
                        key={h}
                        type="button"
                        onClick={() => setLeaveHours(h)}
                        className={`flex-1 px-2 py-1 text-xs rounded font-bold transition ${
                            leaveHours === h 
                                ? 'bg-yellow-500 text-white' 
                                : 'bg-white text-slate-600 border border-slate-300 hover:bg-yellow-100'
                        }`}
                    >
                        {h}
                    </button>
                ))}
            </div>
        </div>
    </div>
)}
```

---

### 4. 後方互換性の確保 ✅

既存データの読み込み時、旧カラム `duration` から新カラム `duration_type` へのフォールバック処理を実装済み:

```typescript
const durationType = leaveApp.duration_type || leaveApp.duration || '1日'
setLeaveDuration(durationType)
```

---

## 🔍 エラーが発生する場合の確認事項

### ❌ エラー: "Could not find the 'duration_type' column"

**原因:** Supabase の `leave_applications` テーブルに `duration_type` カラムが存在しない

**解決方法:**

1. **Supabase ダッシュボードで確認**
   - Table Editor → `leave_applications` を開く
   - 以下のカラムが存在するか確認:
     - `duration_type` (text 型)
     - `hours_used` (integer 型)

2. **カラムが存在しない場合は追加**

```sql
-- duration_type カラムを追加
ALTER TABLE leave_applications 
ADD COLUMN IF NOT EXISTS duration_type TEXT DEFAULT '1日';

-- hours_used カラムを追加
ALTER TABLE leave_applications 
ADD COLUMN IF NOT EXISTS hours_used INTEGER DEFAULT 0;

-- 既存データの移行（duration → duration_type）
UPDATE leave_applications 
SET duration_type = COALESCE(duration, '1日')
WHERE duration_type IS NULL;

-- 既存データの hours_used を計算
UPDATE leave_applications 
SET hours_used = CASE 
    WHEN duration_type = '1日' THEN 8
    WHEN duration_type LIKE '半日%' THEN 4
    ELSE 0
END
WHERE hours_used = 0 OR hours_used IS NULL;
```

---

## 📊 時間計算ロジック

| 期間タイプ | hours_used の値 |
|-----------|----------------|
| 1日 | 8 |
| 半日(午前) | 4 |
| 半日(午後) | 4 |
| 時間休 | ユーザー入力値（1〜8） |

---

## ✅ 動作確認チェックリスト

- [ ] 「1日」を選択して申請 → `hours_used = 8` で保存される
- [ ] 「半日(午前)」を選択して申請 → `hours_used = 4` で保存される
- [ ] 「時間休」を選択 → 時間数入力フォームが表示される
- [ ] 時間休で「3時間」を入力して申請 → `hours_used = 3` で保存される
- [ ] 時間休で時間数を入力せずに申請 → バリデーションエラーが表示される
- [ ] ブラウザのコンソールに送信データが表示される
- [ ] エラー発生時、詳細なエラーメッセージが表示される

---

## 🎉 完了

すべての修正が完了し、リンターエラーもありません。
休暇申請機能が正常に動作するはずです。

もしエラーが発生する場合は、上記の「確認事項」セクションを参照してDBテーブルを確認してください。
