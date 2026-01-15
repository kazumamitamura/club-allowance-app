// utils/allowanceRules.ts

// 業務内容のリスト
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
  
  // ★運転による「上乗せ」金額の設定
  // 業務内容の金額に、この金額がプラスされます。
  const DRIVING_ADDONS: Record<string, number> = {
    school: 0,           // 選択なし
    local: 0,            // 通学圏内（基本額に含まれる場合など。必要なら金額を入れてください）
    prefecture: 0,       // 県内近距離
    prefecture_far: 4100, // 県内遠距離 (例: 7500 - 3400 = 4100)
    outside: 11600,       // 県外 (例: 15000 - 3400 = 11600)
  };
  
  // 計算ロジック
  export const calculateAmount = (
    activityId: string,
    isDriving: boolean,
    destinationId: string,
    isWorkDay: boolean
  ): number => {
    // 1. 業務内容の基本額を取得
    const activity = ACTIVITY_TYPES.find(a => a.id === activityId);
    if (!activity) return 0;
  
    let total = activity.baseAmount;
  
    // 2. 運転がある場合、目的地に応じた金額を「上乗せ」する
    if (isDriving) {
      const addon = DRIVING_ADDONS[destinationId] || 0;
      
      // ※勤務日の場合の減額ルールなどがあればここで調整
      // 例: 勤務日の県外運転は上乗せ額が変わる場合など
      if (isWorkDay && destinationId === 'outside') {
         // total += 9200; // もし勤務日なら別の加算額を使う場合
         total += addon; // とりあえずそのまま加算
      } else {
         total += addon;
      }
    }
  
    // 3. その他、宿泊などの加算があればここに追加可能
    // if (isAccommodation) total += 0; 
  
    return total;
  };