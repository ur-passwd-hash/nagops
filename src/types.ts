export type KeywordCategory = 'infra' | 'culture' | 'despair'

export interface Keyword {
  text: string
  category: KeywordCategory
  width: number
  height: number
  x: number
  y: number
  vx: number
  vy: number
  restX: number
  restY: number
  opacity: number
  size: 'small' | 'normal' | 'large'
  depth: number // 0..1 starfield depth: 0 = far/dim, 1 = close/bright
}

export interface QuoteLine {
  text: string
  x: number
  y: number
  width: number
}

export interface BubbleLayout {
  bubbleX: number
  bubbleY: number
  lines: QuoteLine[]
  bubbleWidth: number
  bubbleHeight: number
}

export interface KeywordDef {
  text: string
  category: KeywordCategory
  size?: 'small' | 'normal' | 'large'
}

export interface ObstacleRect {
  x: number; y: number; w: number; h: number
}

