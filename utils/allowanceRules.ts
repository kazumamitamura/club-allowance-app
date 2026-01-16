// utils/allowanceRules.ts

export const ACTIVITY_TYPES = [
    { id: 'practice_am', label: '半日(午前)' },
    { id: 'practice_pm', label: '半日(午後)' },
    { id: 'practice_all', label: '1日練習' },
    { id: 'practice_game', label: '練習試合等' }, // 0円→2400円に変更
    { id: 'official_game', label: '指定大会' },
  ]
  
  export const DESTINATIONS = [
    { id: 'school', label: '校内' },
    { id: 'inside_short', label: '県内 (〜120km)' },
    { id: 'inside_long', label: '県内 (120km〜)' },
    { id: 'outside', label: '県外' },
  ]
  
  export const calculateAmount = (
    activityId: string,
    isDriving: boolean,
    destinationId: string,
    isWorkDay: boolean // 勤務日かどうか(今回は単純化のため引数に残すがロジック内では休日手当ベースで考える)
  ): number => {
    // 1. 基本額の決定
    let baseAmount = 0
    
    // 指定大会は高額(例:3000円)、それ以外は2400円とする
    if (activityId === 'official_game') {
      baseAmount = 3400 // 仮設定(必要に応じて変更してください)
    } else if (activityId) {
      // 練習、練習試合などすべて
      baseAmount = 2400 
    }
  
    // 半日の場合は減額するルールがあればここに記述（今回は一律2400円の要望ベースで進めますが、必要なら調整可能）
    // 例: if (activityId.includes('practice_am')) baseAmount = 1200;
  
    // 2. 特殊手当（運転・遠征）の判定と上書き
    // ルール: 運転手当などが適用される場合、基本額に「上乗せ」ではなく「置き換え」を行う
    
    let finalAmount = baseAmount
  
    if (isDriving) {
      if (destinationId === 'outside') {
        // 県外運転: 15,000円 (基本額を含む)
        finalAmount = 15000
      } else if (destinationId === 'inside_long') {
        // 県内長距離: 7,500円 (基本額を含む)
        finalAmount = 7500
      }
      // 県内短距離(school, inside_short)の場合は基本額のまま(あるいは規定があれば追加)
    }
  
    // ※宿泊がある場合も高額になるケースが多いですが、今回は「運転」の指定を優先しました。
    // もし「宿泊なら無条件で15,000円」などのルールがあれば以下を追加します。
    // if (isAccommodation) finalAmount = 15000;
  
    return finalAmount
  }