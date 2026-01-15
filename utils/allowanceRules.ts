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
  
  // 計算ロジック
  export const calculateAmount = (
    activityId: string,
    isDriving: boolean,
    destinationId: string,
    isWorkDay: boolean
  ): number => {
    const activity = ACTIVITY_TYPES.find(a => a.id === activityId);
    if (!activity) return 0;
  
    // 基本額からスタート
    let amount = activity.baseAmount;
  
    // 運転がある場合の計算（PDFの規定に基づく）
    if (isDriving) {
      if (destinationId === 'outside') {
        // 県外運転: 基本15,000円 (勤務日は12,600円)
        return isWorkDay ? 12600 : 15000;
      } 
      else if (destinationId === 'prefecture_far') {
        // 県内遠距離: 7,500円 (勤務日は5,100円の規定があれば調整)
        return isWorkDay ? 5100 : 7500; 
      } 
      else {
        // 近距離運転
        if (activityId === 'B') return 1700; // 半日はそのまま
        return Math.max(amount, 3400); // 最低3,400円保証
      }
    }
  
    // 運転なし・勤務日の場合の減額規定などがあればここに追記
    // 例: 勤務日の遠征は支給なし、など
  
    return amount;
  };