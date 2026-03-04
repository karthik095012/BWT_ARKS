import Papa from 'papaparse'
import * as pdfjsLib from 'pdfjs-dist'
import type { UPITransaction, TransactionCategory } from '@/types'

// Use CDN worker so Vite doesn't need to bundle it
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

// ===== UPI CSV Parser =====
// Supports formats from HDFC, SBI, Paytm, PhonePe, GPay exports

interface RawCSVRow {
  [key: string]: string
}

const FIELD_ALIASES: Record<string, string[]> = {
  date: ['date', 'transaction date', 'txn date', 'value date', 'posting date'],
  type: ['type', 'transaction type', 'txn type', 'cr/dr', 'debit/credit'],
  amount: ['amount', 'transaction amount', 'txn amount', 'debit amount', 'credit amount', 'inr amount'],
  description: ['description', 'narration', 'particulars', 'remarks', 'transaction details', 'utr'],
  status: ['status', 'transaction status'],
}

function findField(headers: string[], aliases: string[]): string | null {
  const h = headers.map((x) => x.toLowerCase().trim())
  for (const alias of aliases) {
    const idx = h.findIndex((x) => x.includes(alias))
    if (idx !== -1) return headers[idx]
  }
  return null
}

function parseDate(raw: string): Date {
  // Handle multiple Indian date formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  const cleaned = raw.trim()
  const parts = cleaned.split(/[\/\-\.\s]/)
  if (parts.length >= 3) {
    let day: number, month: number, year: number
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      ;[year, month, day] = parts.map(Number)
    } else {
      // DD/MM/YYYY or DD-MM-YYYY (Indian standard)
      ;[day, month, year] = parts.map(Number)
      if (year < 100) year += 2000
    }
    const d = new Date(year, month - 1, day)
    if (!isNaN(d.getTime())) return d
  }
  return new Date(cleaned) // fallback
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/[₹,\s]/g, '').trim()) || 0
}

function detectType(row: RawCSVRow, typeField: string | null, amount: number): 'CREDIT' | 'DEBIT' {
  if (typeField) {
    const v = row[typeField]?.toLowerCase() || ''
    if (v.includes('cr') || v.includes('credit') || v.includes('in')) return 'CREDIT'
    if (v.includes('dr') || v.includes('debit') || v.includes('out')) return 'DEBIT'
  }
  // Fallback: check description for payout keywords
  return amount > 0 ? 'CREDIT' : 'DEBIT'
}

// Rule-based categorization (fast, no AI needed for bulk)
export function categorizeByRules(description: string): TransactionCategory {
  const d = description.toLowerCase()
  if (/swiggy|zomato|blinkit|zepto|dunzo|bigbasket|domino|kfc|mcdonald|pizza/.test(d)) return 'food'
  if (/payout|salary|wages|payment from|cab earning|delivery earning|earning|commission/.test(d)) return 'gig_income'
  if (/electricity|bescom|msedcl|tneb|cesc|bses|bill payment/.test(d)) return 'electricity'
  if (/rent|house rent|pg rent|accommodation/.test(d)) return 'rent'
  if (/recharge|jio|airtel|vi|bsnl|tatasky|d2h|dth|mobile/.test(d)) return 'mobile_recharge'
  if (/groww|zerodha|mf|mutual fund|sip|lic|insurance|policy/.test(d)) return 'investment'
  if (/uber|ola|rapido|metro|bus|ticket|train|irctc|redbus|travel/.test(d)) return 'transport'
  if (/hospital|pharmacy|clinic|health|medicine|apollo|lybrate|1mg/.test(d)) return 'healthcare'
  if (/amazon|flipkart|myntra|ajio|meesho|shopify|shopping|purchase/.test(d)) return 'shopping'
  if (/netflix|hotstar|spotify|youtube|prime|gaming|game|entertainment/.test(d)) return 'entertainment'
  if (/transfer|neft|imps|rtgs|upi transfer/.test(d)) return 'transfer'
  if (/salary|ctc|payroll|epfo|pf/.test(d)) return 'salary'
  return 'other'
}

export function parseUPICSV(csvContent: string): UPITransaction[] {
  const parsed = Papa.parse<RawCSVRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  if (parsed.errors.length && !parsed.data.length) {
    throw new Error('Invalid CSV format')
  }

  const headers = Object.keys(parsed.data[0] || {})
  const dateField = findField(headers, FIELD_ALIASES.date)
  const amountField = findField(headers, FIELD_ALIASES.amount)
  const descField = findField(headers, FIELD_ALIASES.description)
  const typeField = findField(headers, FIELD_ALIASES.type)
  const statusField = findField(headers, FIELD_ALIASES.status)

  if (!dateField || !amountField || !descField) {
    throw new Error(
      `CSV missing required columns. Found: ${headers.join(', ')}. Need: date, amount, description`,
    )
  }

  const transactions: UPITransaction[] = []

  parsed.data.forEach((row, idx) => {
    try {
      const amount = parseAmount(row[amountField])
      if (amount <= 0) return // skip zero-amount rows

      const description = row[descField]?.trim() || ''
      const type = detectType(row, typeField, amount)
      const date = parseDate(row[dateField])
      const statusRaw = statusField ? row[statusField]?.toUpperCase() : 'SUCCESS'
      const status =
        statusRaw?.includes('FAIL') || statusRaw?.includes('REJECT')
          ? 'FAILED'
          : statusRaw?.includes('PEND')
          ? 'PENDING'
          : 'SUCCESS'

      transactions.push({
        id: `tx_${idx}_${Date.now()}`,
        date,
        type,
        amount,
        description,
        status,
        category: categorizeByRules(description),
        isAIProcessed: false,
      })
    } catch {
      // Skip malformed rows
    }
  })

  // Sort by date descending
  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

// ===== PDF Bank Statement Parser =====
export async function parseUPIPDF(arrayBuffer: ArrayBuffer): Promise<UPITransaction[]> {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let fullText = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    fullText += pageText + '\n'
  }

  // Split into lines and try to parse transaction rows
  const lines = fullText.split(/\n|\r/).map((l) => l.trim()).filter(Boolean)
  const transactions: UPITransaction[] = []

  // Regex patterns for common Indian bank PDF formats
  const datePattern = /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/
  const amountPattern = /(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d{0,2})/gi
  const crPattern = /\b(cr|credit|credited|deposit)\b/i
  const drPattern = /\b(dr|debit|debited|withdrawal|withdraw)\b/i

  for (const line of lines) {
    const dateMatch = line.match(datePattern)
    if (!dateMatch) continue

    const amounts: number[] = []
    let match
    const amountPatternLocal = /(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d{0,2})/gi
    while ((match = amountPatternLocal.exec(line)) !== null) {
      const val = parseFloat(match[1].replace(/,/g, ''))
      if (val > 0 && val < 10_000_000) amounts.push(val)
    }

    if (!amounts.length) continue

    const isCr = crPattern.test(line)
    const isDr = drPattern.test(line)
    const type: 'CREDIT' | 'DEBIT' = isCr ? 'CREDIT' : isDr ? 'DEBIT' : amounts.length > 1 ? 'CREDIT' : 'DEBIT'
    const amount = amounts[0]

    // Best-effort description — take the text without date/amounts
    const desc = line
      .replace(datePattern, '')
      .replace(/(?:Rs\.?|INR|₹)?\s*[\d,]+\.?\d{0,2}/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'UPI Transaction'

    transactions.push({
      id: `pdf_${Date.now()}_${transactions.length}`,
      date: parseDate(dateMatch[1]),
      type,
      amount,
      description: desc,
      status: 'SUCCESS',
      category: categorizeByRules(desc),
      isAIProcessed: false,
    })
  }

  if (!transactions.length) {
    throw new Error('No transactions found in PDF. Try exporting as CSV instead.')
  }

  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

// ===== Generate mock data for demo =====
export function generateMockTransactions(): UPITransaction[] {
  const now = new Date()
  const txs: UPITransaction[] = []

  for (let month = 0; month < 6; month++) {
    const base = new Date(now.getFullYear(), now.getMonth() - month, 1)

    // Weekly Swiggy payouts
    for (let week = 0; week < 4; week++) {
      const d = new Date(base)
      d.setDate(1 + week * 7)
      txs.push({
        id: `mock_sw_${month}_${week}`,
        date: d,
        type: 'CREDIT',
        amount: 7500 + Math.random() * 2000,
        description: `UPI/CR/swiggy.upi@axis/Weekly payout W${week + 1}`,
        status: 'SUCCESS',
        category: 'gig_income',
        merchantVPA: 'swiggy.upi@axis',
        merchantName: 'Swiggy',
        isAIProcessed: true,
      })
    }

    // Electricity bill
    txs.push({
      id: `mock_elec_${month}`,
      date: new Date(base.getFullYear(), base.getMonth(), 5),
      type: 'DEBIT',
      amount: 1200 + Math.random() * 200,
      description: 'UPI/DR/BESCOM/Electricity Bill Payment',
      status: 'SUCCESS',
      category: 'electricity',
      isAIProcessed: true,
    })

    // Rent
    txs.push({
      id: `mock_rent_${month}`,
      date: new Date(base.getFullYear(), base.getMonth(), 3),
      type: 'DEBIT',
      amount: 8000,
      description: 'UPI/DR/landlord@upi/Monthly Rent',
      status: 'SUCCESS',
      category: 'rent',
      isAIProcessed: true,
    })

    // Mobile recharge
    txs.push({
      id: `mock_mob_${month}`,
      date: new Date(base.getFullYear(), base.getMonth(), 10),
      type: 'DEBIT',
      amount: 299,
      description: 'UPI/DR/jio.recharge@jio/Jio Prepaid Recharge',
      status: 'SUCCESS',
      category: 'mobile_recharge',
      isAIProcessed: true,
    })

    // Food delivery
    for (let i = 0; i < 8; i++) {
      const d = new Date(base)
      d.setDate(Math.floor(Math.random() * 28) + 1)
      txs.push({
        id: `mock_food_${month}_${i}`,
        date: d,
        type: 'DEBIT',
        amount: 150 + Math.random() * 350,
        description: `UPI/DR/zomato.merchant@kotak/Food Order`,
        status: 'SUCCESS',
        category: 'food',
        isAIProcessed: false,
      })
    }

    // Investment - SIP
    txs.push({
      id: `mock_sip_${month}`,
      date: new Date(base.getFullYear(), base.getMonth(), 7),
      type: 'DEBIT',
      amount: 1000,
      description: 'UPI/DR/groww@axisbank/SIP Investment',
      status: 'SUCCESS',
      category: 'investment',
      isAIProcessed: true,
    })
  }

  return txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
