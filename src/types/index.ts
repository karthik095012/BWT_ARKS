// ===== Core User Types =====
export interface User {
  uid: string
  phone?: string       // optional — only set when using phone auth
  email?: string       // set when using email/password auth
  name?: string
  avatar?: string
  createdAt: Date
  lastLogin: Date
}

// ===== UPI Transaction Types =====
export interface UPITransaction {
  id: string
  date: Date
  type: 'CREDIT' | 'DEBIT'
  amount: number
  description: string
  merchantVPA?: string
  merchantName?: string
  bankCode?: string
  status: 'SUCCESS' | 'FAILED' | 'PENDING'
  remarks?: string
  category?: TransactionCategory
  isAIProcessed?: boolean
}

export type TransactionCategory =
  | 'salary'
  | 'gig_income'
  | 'rent'
  | 'food'
  | 'electricity'
  | 'mobile_recharge'
  | 'investment'
  | 'insurance'
  | 'shopping'
  | 'transport'
  | 'healthcare'
  | 'entertainment'
  | 'transfer'
  | 'other'

// ===== CredScore Types =====
export interface CredScore {
  score: number          // 0–850
  tier: ScoreTier
  calculatedAt: Date
  components: ScoreComponents
  insights: ScoreInsight[]
  loanEligibility: LoanEligibility
  aiAnalysis: AIAnalysisResult
}

export type ScoreTier = 'Poor' | 'Fair' | 'Good' | 'Very Good' | 'Excellent'

export interface ScoreComponents {
  incomeConsistency: ComponentScore   // 35%
  paymentBehavior: ComponentScore     // 25%
  spendingIntelligence: ComponentScore // 20%
  savingsBehavior: ComponentScore     // 15%
  digitalFootprint: ComponentScore    // 5%
}

export interface ComponentScore {
  score: number       // 0–100
  weight: number      // percentage weight
  label: string
  description: string
  improvements: string[]
}

export interface ScoreInsight {
  type: 'positive' | 'warning' | 'improvement'
  title: string
  description: string
  pointsImpact: number
}

export interface LoanEligibility {
  eligible: boolean
  maxAmount: number
  minAmount: number
  interestRate: number
  tenure: string
  reason: string
}

// ===== AI Analysis Types =====
export interface AIAnalysisResult {
  incomeAnalysis: {
    monthlyAvg: number
    consistencyScore: number
    variance: number
    growthTrend: string
    paymentCycle: string
    cycleDay: string
    weekendGapNormal: boolean
  }
  platformDetection: {
    primaryPlatform: string
    platformType: string
    secondaryIncome: string | null
    gigWorkerConfidence: number
  }
  paymentBehavior: {
    electricityBill: string
    mobileRecharge: string
    rentPayment: string
    billPaymentScore: number
  }
  spendingIntelligence: {
    foodDelivery: number
    essentialsRatio: number
    discretionaryRatio: number
    impulsePurchases: number
    spendingDiscipline: number
  }
  savingsBehavior: {
    monthlySavings: number
    savingsRate: number
    consistentSaving: boolean
    investmentApps: string[]
    savingsScore: number
  }
  riskFlags: string[]
  recommendedCredScore: number
  tier: ScoreTier
  loanEligibility: string
}

// ===== Scam/Fraud Types =====
export interface ScamReport {
  id: string
  phone?: string
  upiId?: string
  scamType: ScamType
  reportCount: number
  firstReported: Date
  lastReported: Date
  description: string
  activeScams: number
  aiRiskScore: number    // 0–100
  aiConfidence: number   // 0–100
  verified: boolean
}

export type ScamType =
  | 'fake_bank_call'
  | 'upi_phishing'
  | 'qr_scam'
  | 'investment_fraud'
  | 'kyc_fraud'
  | 'lottery_scam'
  | 'tech_support_scam'
  | 'other'

export interface ScamCheckResult {
  isScam: boolean
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  riskScore: number
  report?: ScamReport
  aiAnalysis: string
  recommendations: string[]
  detectionTime: number  // ms
}

// ===== Loan Types =====
export interface LoanOffer {
  id: string
  provider: string
  providerLogo: string
  type: 'microloan' | 'personal' | 'emergency' | 'business'
  amount: number
  interestRate: number
  tenure: number  // months
  emi: number
  processingFee: number
  status: 'available' | 'applied' | 'approved' | 'rejected'
  appliedAt?: Date
}

// ===== Dashboard / Stats Types =====
export interface DashboardStats {
  totalIncome: number
  totalExpenses: number
  totalSavings: number
  savingsRate: number
  incomeScore: number
  paymentScore: number
  spendingScore: number
  healthScore: number
  monthlyTrend: MonthlyData[]
  categoryBreakdown: CategoryData[]
}

export interface MonthlyData {
  month: string
  income: number
  expenses: number
  savings: number
}

export interface CategoryData {
  name: string
  value: number
  color: string
  percentage: number
}

// ===== Improvement Roadmap =====
export interface ImprovementAction {
  id: string
  title: string
  description: string
  pointsGain: number
  difficulty: 'easy' | 'medium' | 'hard'
  timeframe: string
  completed: boolean
  category: keyof ScoreComponents
}

// ===== Ollama API Types =====
export interface OllamaRequest {
  model: string
  prompt: string
  stream: boolean
  options?: {
    temperature?: number
    num_ctx?: number
    top_p?: number
    num_predict?: number
  }
}

export interface OllamaResponse {
  model: string
  created_at: string
  response: string
  done: boolean
  total_duration?: number
  eval_count?: number
}

// ===== Auth Types =====
export interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}
