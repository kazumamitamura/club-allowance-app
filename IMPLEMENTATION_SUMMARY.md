# 学校法人向け 高度な勤務・手当・休暇管理システム 実装完了報告

## 📋 実装概要

Next.js (App Router), TypeScript, Supabase, Tailwind CSSを使用した、学校法人向けの包括的な勤務・手当・休暇管理システムを実装しました。

---

## ✅ 実装完了機能

### 1. **休暇申請機能 (Leave Application)**

#### 実装内容
- ✅ 年次有給休暇、夏季休暇、慶弔休暇など8種類の休暇種別に対応
- ✅ 1日、半日（午前/午後）、時間休の選択が可能
- ✅ **時間単位での内部計算**（1日=8時間換算）
- ✅ DBには`hours_used`として保存
- ✅ UI表示は「あと〇日と〇時間」形式
- ✅ リアルタイムで「申請後の残り日数」をプレビュー表示
- ✅ 申請状態（pending/approved/rejected）の管理
- ✅ 申請の修正・取り下げ機能

#### ファイル
- `app/page.tsx` - 一般ユーザー画面（休暇申請UI）
- `app/admin/leaves/page.tsx` - 管理者用休暇承認画面
- `utils/leaveCalculations.ts` - 時間単位計算ロジック

#### 主要関数
```typescript
// 時間単位計算
durationToHours(duration: string): number
hoursToDisplayFormat(totalHours: number): string
calculateLeaveBalance(totalAllowedHours, usedHours)
```

---

### 2. **手当入力・申請機能 (Allowance)**

#### 実装内容
- ✅ 8種類の手当項目（A～H）
  - A: 休日部活(1日) - 3,400円
  - B: 休日部活(半日) - 1,700円
  - C: 指定大会 - 3,400円
  - D: 指定外大会 - 2,400円
  - E: 遠征 - 3,000円
  - F: 合宿 - 5,000円
  - G: 引率 - 2,400円
  - H: 宿泊指導 - 6,000円

- ✅ **勤務日判定ロジック**
  - A, Bは休日のみ選択可能
  - 勤務日に選択すると警告表示＆選択不可

- ✅ **特殊条件による金額変動**
  - 県外マイクロバス運転: 15,000円
  - 県内長距離運転: 7,500円
  - 県内短距離運転: 基本額 + 500円

- ✅ 区分（校内/県内/県外）、詳細、運転フラグ、宿泊フラグ
- ✅ リアルタイム金額計算プレビュー

#### ファイル
- `app/page.tsx` - 一般ユーザー画面（手当入力UI）
- `app/admin/allowances/page.tsx` - 管理者用手当承認画面
- `utils/allowanceRules.ts` - 手当計算ロジック

#### 主要関数
```typescript
calculateAmount(activityId, isDriving, destinationId, isWorkDay): number
canSelectActivity(activityId, isWorkDay): { allowed: boolean, message?: string }
```

---

### 3. **カレンダー表示 (Calendar UI)**

#### 実装内容
- ✅ Googleカレンダー風のUI
- ✅ 日付クリックで入力モーダルを中央表示
- ✅ **色分けルール**
  - 灰色文字: マスターデータの勤務形態（デフォルト）
  - 黒字: ユーザーが変更した勤務形態 / 承認済みデータ
  - 赤字: 休日
  - 黄色背景: 申請中（未承認）の「年休(仮)」
  - 緑背景: 承認済みの休暇
  - 灰色背景: 手当申請あり
- ✅ 手当金額を青字で表示
- ✅ レスポンシブ対応（スマホ対応）

#### ファイル
- `app/page.tsx` - `getTileContent()` 関数

---

### 4. **承認ワークフロー (Approval)**

#### 実装内容
3つの独立した管理画面を作成：

1. **手当承認画面** (`/admin/allowances`)
   - 月次手当申請のリスト表示
   - 詳細展開で明細確認
   - 承認/却下ボタン
   - 承認者・承認日時の記録

2. **勤務表承認画面** (`/admin/schedules`)
   - 月次勤務表申請のリスト表示
   - 勤務日数の集計表示
   - 承認/却下ボタン

3. **休暇承認画面** (`/admin/leaves`)
   - 日次休暇申請のリスト表示
   - フィルタ機能（承認待ち/承認済み/却下済み）
   - 承認/却下ボタン

#### 締め日機能
- ✅ 毎月6日を締め日として設定
- ✅ 締め日以降は一般ユーザーの編集ロック
- ✅ 管理者は常に編集・削除可能
- ✅ 申請済みデータは自動ロック

#### ファイル
- `app/admin/allowances/page.tsx`
- `app/admin/schedules/page.tsx`
- `app/admin/leaves/page.tsx`

---

### 5. **一括登録・CSV連携**

#### 実装内容
- ✅ **一括登録ボタン**
  - 1ヶ月分のデータを「マスターデータ + ユーザー変更分」で確定登録
  - 未入力日をデフォルト勤務として自動登録

- ✅ **CSVインポート** (`/admin/calendar`)
  - マスター勤務表を読み込み
  - カレンダーの初期値（灰色）として表示
  - 形式: `日付, 勤務区分`

#### ファイル
- `app/page.tsx` - `handleBulkRegister()` 関数
- `app/admin/calendar/page.tsx` - CSV読み込み画面

---

### 6. **設定・修正機能**

#### 実装内容
- ✅ **勤務パターン設定** (`/admin/settings`)
  - 勤務パターンの追加・編集・削除
  - コード、開始時刻、終了時刻、説明の管理
  - GUIで直感的に操作可能

- ✅ **手当項目・金額設定**
  - 現在は`utils/allowanceRules.ts`で管理
  - 将来的にGUI化予定（設計済み）

#### ファイル
- `app/admin/settings/page.tsx`

---

### 7. **Excel出力機能**

#### 実装内容
4パターンの出力に対応：

1. **個人月次レポート**
   - 選択した職員の指定月の手当明細
   - 日付、業務内容、区分、金額など

2. **個人年次レポート**
   - 選択した職員の年間手当を月別集計

3. **全体月次レポート**
   - 全職員の指定月の手当を集計
   - 職員別の件数・金額

4. **全体年次レポート**
   - 全職員の年間手当を集計

#### ファイル
- `app/admin/export/page.tsx`
- 使用ライブラリ: `xlsx`

---

### 8. **管理者ダッシュボード**

#### 実装内容
- ✅ 承認待ち件数の統計表示
- ✅ 各機能へのナビゲーションカード
- ✅ クイックアクセスメニュー
- ✅ モダンでSaaSライクなUI

#### ファイル
- `app/admin/page.tsx`

---

## 🗂️ ファイル構成

```
club-allowance-app/
├── app/
│   ├── page.tsx                    # 一般ユーザー画面（メイン）
│   ├── login/page.tsx              # ログイン画面
│   ├── admin/
│   │   ├── page.tsx                # 管理者ダッシュボード
│   │   ├── allowances/page.tsx     # 手当承認画面
│   │   ├── schedules/page.tsx      # 勤務表承認画面
│   │   ├── leaves/page.tsx         # 休暇承認画面
│   │   ├── calendar/page.tsx       # CSV読み込み画面
│   │   ├── settings/page.tsx       # 設定画面
│   │   └── export/page.tsx         # Excel出力画面
│   ├── globals.css
│   └── layout.tsx
├── utils/
│   ├── allowanceRules.ts           # 手当計算ロジック
│   ├── leaveCalculations.ts        # 休暇計算ロジック
│   └── supabase/
│       └── client.ts
├── package.json
└── README.md
```

---

## 🎨 UI/UX の特徴

### デザインコンセプト
- SmartHR、freeeなどのSaaSを参考
- 直感的でモダンなUI
- 大きめのボタン、分かりやすい配色
- モーダル活用

### カラースキーム
- **青系**: 手当関連
- **緑系**: 勤務表関連
- **オレンジ系**: 休暇関連
- **灰色系**: 設定・その他

### レスポンシブ対応
- スマホ・タブレット・PCに対応
- グリッドレイアウトで柔軟に調整

---

## 🔐 権限管理

### 管理者
- メールアドレスで判定
- `mitamuraka@haguroko.ed.jp`
- `tomonoem@haguroko.ed.jp`

### 一般ユーザー
- 自分のデータのみ閲覧・編集
- 締め日以降は編集不可
- 申請済みデータは編集不可

---

## 📊 データベース設計

### 主要テーブル

1. **allowances** - 手当データ
   - user_id, date, activity_type, amount
   - destination_type, destination_detail
   - is_driving, is_accommodation

2. **daily_schedules** - 勤務表データ
   - user_id, date, work_pattern_code
   - leave_annual, leave_hourly, etc.

3. **leave_applications** - 休暇申請データ
   - user_id, date, leave_type, duration
   - **hours_used** (時間単位)
   - reason, status

4. **leave_balances** - 休暇残高
   - user_id, annual_leave_total, annual_leave_used

5. **monthly_applications** - 月次申請管理
   - user_id, year_month, application_type
   - status, submitted_at, approver_id, approved_at

6. **work_patterns** - 勤務パターンマスタ
   - code, start_time, end_time, description

7. **school_calendar** - 学校カレンダー
   - date, day_type

8. **master_schedules** - マスター勤務表
   - date, work_pattern_code

9. **user_profiles** - ユーザープロフィール
   - email, full_name

---

## 🚀 使用技術

- **フロントエンド**: Next.js 16 (App Router), React 19, TypeScript
- **スタイリング**: Tailwind CSS 4
- **データベース**: Supabase (PostgreSQL)
- **認証**: Supabase Auth
- **カレンダー**: react-calendar
- **Excel出力**: xlsx

---

## 📝 今後の拡張予定

1. **勤務パターンの詳細化**
   - A, B, C, Dパターンの実装
   - カスタム時間入力（終了時間のみ入力、開始時間は自動反映）

2. **手当項目のGUI設定**
   - 管理画面から手当項目・金額を編集可能に

3. **通知機能**
   - 申請時・承認時のメール通知

4. **集計レポート**
   - ダッシュボードでの可視化
   - グラフ・チャート表示

5. **職員一覧管理**
   - 職員マスタの管理画面

---

## ✨ 実装のハイライト

### 1. 時間単位計算の実装
```typescript
// 1日 = 8時間換算
const HOURS_PER_DAY = 8

// 「あと3日と2時間」のような表示
export const hoursToDisplayFormat = (totalHours: number): string => {
  const days = Math.floor(totalHours / HOURS_PER_DAY)
  const hours = totalHours % HOURS_PER_DAY
  return days > 0 ? `${days}日と${hours}時間` : `${hours}時間`
}
```

### 2. 勤務日判定ロジック
```typescript
export const canSelectActivity = (activityId: string, isWorkDay: boolean) => {
  const activity = ACTIVITY_TYPES.find(a => a.id === activityId)
  if (activity?.requiresHoliday && isWorkDay) {
    return { 
      allowed: false, 
      message: `${activity.label}は休日のみ選択可能です。` 
    }
  }
  return { allowed: true }
}
```

### 3. カレンダー色分けロジック
```typescript
// 優先度: 休暇申請 > ユーザー変更 > マスタ > 休日
if (leave?.status === 'pending') {
  bgColor = 'bg-yellow-100'  // 申請中
} else if (leave?.status === 'approved') {
  bgColor = 'bg-green-100'   // 承認済み
}
```

---

## 🎯 要件達成状況

| 要件 | 状態 | 備考 |
|------|------|------|
| データベース連携 | ✅ 完了 | Supabaseテーブル使用 |
| 手当入力・申請機能 | ✅ 完了 | A～H項目、運転フラグ対応 |
| 休暇申請機能 | ✅ 完了 | 時間単位計算、残高表示 |
| カレンダー表示 | ✅ 完了 | 色分け、レスポンシブ対応 |
| 承認ワークフロー | ✅ 完了 | 3つの独立した管理画面 |
| 一括登録・CSV連携 | ✅ 完了 | CSV読み込み、一括登録 |
| 設定・修正 | ✅ 完了 | 勤務パターン設定画面 |
| Excel出力 | ✅ 完了 | 4パターン対応 |
| 締め日機能 | ✅ 完了 | 毎月6日締め |
| UI/UX | ✅ 完了 | モダンでSaaSライク |

---

## 📞 サポート

実装に関する質問や追加機能のご要望がありましたら、お気軽にお問い合わせください。

---

**実装完了日**: 2026年1月19日  
**開発環境**: Next.js 16, TypeScript, Supabase, Tailwind CSS  
**対象**: 学校法人向け勤務・手当・休暇管理システム
