// 題目都在這裡改。points 是「每個選項各得幾分」，順序和 options 一樣。
//   1   = 滿分
//   0.5 = 半分
//   0   = 沒分
// practice: true 代表暖身題（會出題、公布答案，但不計入排名）
// duration: 這題的作答秒數（沒寫就用 DEFAULT_DURATION）

export type Question = {
  text: string;
  options: string[];
  points: number[];
  duration?: number;
  practice?: boolean;
};

export const DEFAULT_DURATION = 15;

export const QUESTIONS: Question[] = [
  {
    text: '新娘是哪裡人？',
    options: ['台南人', '台中人', '台東人', '外星人'],
    points: [1, 0, 0, 0],
  },
  {
    text: '新郎做什麼工作？',
    options: ['公務員', '軍人', '8+9', '水電工'],
    points: [0.5, 1, 0, 0], // 軍人也算半個公務員，所以公務員給半分
  },
  {
    text: '新郎新娘第一次合照在哪裡？',
    options: ['動物園', '海洋公園', '燒肉店', '摩鐵'],
    points: [0, 0, 1, 0],
  },
  {
    text: '新郎的優點有什麼？',
    options: ['正直', '幽默', '變態', '以上皆是'],
    points: [1, 1, 1, 1], // 四個都給分
  },
  {
    text: '新娘的優點有什麼？',
    options: ['美', '身材好', '溫柔', '愛生氣'],
    points: [1, 1, 1, 0], // 愛生氣除外都給分
  },
  {
    text: '新郎在哪裡跟新娘求婚的？',
    options: ['夜景餐廳', '日本', '床上', '根本沒求婚'],
    points: [0, 0, 0, 1],
  },
  {
    text: '新郎新娘差幾歲？',
    options: ['5歲', '3歲', '10歲', '干我屁事'],
    points: [1, 0, 0, 0],
  },
];
