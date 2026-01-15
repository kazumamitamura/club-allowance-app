// utils/allowanceRules.ts

// ■ 1. 業務内容ごとの基本金額（ベース）
export const ACTIVITY_TYPES = [
    { id: 'A', label: 'A: 休日部活（１日）', baseAmount: 2400 },
    { id: 'B', label: 'B: 休日部活（半日）', baseAmount: 1700 },
    { id: 'C', label: 'C: 指定大会', baseAmount: 3400 },
    { id: 'D', label: 'D: 指定外大会', baseAmount: 0 },
    { id: 'E', label: 'E: 遠征', baseAmount: 2400 },
    { id: 'F', label: 'F: 合宿', baseAmount: 2400 },
    { id: 'G', label: 'G: 研修旅行等引率', baseAmount: 3400 },
    { id: 'H', label: 'H: 宿泊を伴う指導', baseAmount: 3400 },
  ] as const;
  
  // 目的地のリスト
  export const DESTINATIONS = [
    { id: 'school', label: '目的地を選択' },
    { id: 'local', label: '通学圏内' },
    { id: 'prefecture', label: '県内（120km未満）' },
    { id: 'prefecture_far', label: '県内（120km以上）' },
    { id: 'outside', label: '県外' },
  ] as const;
  
  // ■ 2. 運転区分ごとの加算金額（上乗せ分）
  // ★重要：ここを実際の「運転手当のみ」の金額に書き換えてください
  // （例：県外の合計が15,000円で、Cの基本が3,400円なら、差額の 11,600円 を設定します）
  const DRIVING_ADDONS: Record<string, number> = {
    school: 0,            // 運転なし・選択なし
    local: 0,             // 通学圏内（基本額に含まれる場合は0）
    prefecture: 0,        // 県内（120km未満）（ここも加算があれば数字を入れてください）
    prefecture_far: 7500, // 県内（120km以上）の加算額 (例: 7500)
    outside: 15000,       // 県外の加算額 (例: 15000)
  };
  
  // ■ 3. 計算ロジック（単純な足し算に変更）
  export const calculateAmount = (
    activityId: string,
    isDriving: boolean,
    destinationId: string,
    isWorkDay: boolean
  ): number => {
    // ① まず業務内容の基本額を取得
    const activity = ACTIVITY_TYPES.find(a => a.id === activityId);
    if (!activity) return 0;
  
    let total = activity.baseAmount;
  
    // ② 運転スイッチがONなら、目的地に応じた額を「足す」
    if (isDriving) {
      const addon = DRIVING_ADDONS[destinationId] || 0;
      
      // 勤務日の場合の特別ルールがあればここで調整
      // （例：勤務日の県外運転は加算額が減る、など）
      // 現状はシンプルに足し算します
      total += addon;
    }
  
    return total;
  };