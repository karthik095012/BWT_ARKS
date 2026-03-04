import { useState, useRef } from 'react'
import { Upload, FileText, X, Bot, Filter, Search, Download } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { parseUPICSV, parseUPIPDF, generateMockTransactions } from '@/services/upiParser'
import { buildDashboardStats } from '@/utils/credScore'
import { formatCurrency, formatDate } from '@/utils/helpers'
import TransactionItem from '@/components/ui/TransactionItem'
import toast from 'react-hot-toast'
import type { TransactionCategory } from '@/types'

const CATEGORIES: { value: TransactionCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'gig_income', label: 'Gig Income' },
  { value: 'salary', label: 'Salary' },
  { value: 'food', label: 'Food' },
  { value: 'rent', label: 'Rent' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'investment', label: 'Investment' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'transport', label: 'Transport' },
  { value: 'other', label: 'Other' },
]

export default function TransactionsPage() {
  const { transactions, setTransactions, setDashboardStats } = useAppStore()
  const [isDragging, setIsDragging] = useState(false)
  const [filter, setFilter] = useState<'all' | 'CREDIT' | 'DEBIT'>('all')
  const [category, setCategory] = useState<TransactionCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const fileRef = useRef<HTMLInputElement>(null)
  const PER_PAGE = 20

  const handleFile = async (file: File) => {
    const isPDF = file.name.toLowerCase().endsWith('.pdf')
    const isCSV = file.name.toLowerCase().endsWith('.csv')
    if (!isPDF && !isCSV) {
      toast.error('Please upload a CSV or PDF file.')
      return
    }
    const toastId = toast.loading(`Parsing ${isPDF ? 'PDF' : 'CSV'} transactions…`)
    try {
      let parsed
      if (isPDF) {
        const buffer = await file.arrayBuffer()
        parsed = await parseUPIPDF(buffer)
      } else {
        const text = await file.text()
        parsed = parseUPICSV(text)
      }
      setTransactions(parsed)
      const stats = buildDashboardStats(parsed)
      setDashboardStats(stats)
      toast.success(`Loaded ${parsed.length} transactions from ${isPDF ? 'PDF' : 'CSV'}!`, { id: toastId })
      setPage(1)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Parse error'
      toast.error(msg, { id: toastId })
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleLoadDemo = () => {
    const txs = generateMockTransactions()
    setTransactions(txs)
    setDashboardStats(buildDashboardStats(txs))
    toast.success(`${txs.length} demo transactions loaded!`)
  }

  // Filter + search
  const filtered = transactions.filter((tx) => {
    if (filter !== 'all' && tx.type !== filter) return false
    if (category !== 'all' && tx.category !== category) return false
    if (search) {
      const q = search.toLowerCase()
      return tx.description.toLowerCase().includes(q) ||
        (tx.merchantName || '').toLowerCase().includes(q) ||
        String(tx.amount).includes(q)
    }
    return true
  })

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const totalIncome = transactions
    .filter((t) => t.type === 'CREDIT' && t.status === 'SUCCESS')
    .reduce((s, t) => s + t.amount, 0)
  const totalExpenses = transactions
    .filter((t) => t.type === 'DEBIT' && t.status === 'SUCCESS')
    .reduce((s, t) => s + t.amount, 0)

  return (
    <div className="space-y-6">
      {/* Upload zone */}
      {!transactions.length && (
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
            isDragging
              ? 'border-primary bg-primary-light'
              : 'border-neutral-border hover:border-primary hover:bg-neutral-light'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Upload className="w-12 h-12 text-primary mx-auto mb-4" />
          <h3 className="font-bold text-neutral-dark text-lg mb-2">Upload Bank Statement</h3>
          <p className="text-neutral-gray mb-4 max-w-md mx-auto text-sm">
            Export from your bank's net banking or UPI app and upload here.
            Supports <strong>CSV</strong> and <strong>PDF</strong> — all processing happens locally.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button className="btn-primary" onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}>
              <FileText className="w-4 h-4" /> Choose CSV or PDF
            </button>
            <button
              className="btn-secondary"
              onClick={(e) => { e.stopPropagation(); handleLoadDemo() }}
            >
              <Bot className="w-4 h-4" /> Load Demo Data
            </button>
          </div>
          <p className="text-xs text-neutral-gray mt-4">
            Supports: HDFC, SBI, ICICI, Axis, Kotak · CSV & PDF exports · Max 12 months
          </p>
        </div>
      )}

      {/* Transactions loaded view */}
      {transactions.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center">
              <p className="text-xs text-neutral-gray mb-1">Total Transactions</p>
              <p className="font-mono font-bold text-2xl text-neutral-dark">
                {transactions.length}
              </p>
              <p className="text-xs text-neutral-gray">
                {new Date(transactions[transactions.length - 1]?.date).toLocaleDateString('en-IN')} – {new Date(transactions[0]?.date).toLocaleDateString('en-IN')}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-neutral-gray mb-1">Total Credits</p>
              <p className="font-mono font-bold text-2xl text-success">
                {formatCurrency(totalIncome, true)}
              </p>
              <p className="text-xs text-neutral-gray">{transactions.filter((t) => t.type === 'CREDIT').length} transactions</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-neutral-gray mb-1">Total Debits</p>
              <p className="font-mono font-bold text-2xl text-danger">
                {formatCurrency(totalExpenses, true)}
              </p>
              <p className="text-xs text-neutral-gray">{transactions.filter((t) => t.type === 'DEBIT').length} transactions</p>
            </div>
          </div>

          {/* Toolbar */}
          <div className="card p-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              {/* Search */}
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-gray" />
                <input
                  type="search"
                  placeholder="Search description, merchant…"
                  className="input pl-9 h-9 text-sm"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                />
              </div>

              {/* Type filter */}
              <div className="flex gap-1 p-1 rounded-lg bg-neutral-light">
                {(['all', 'CREDIT', 'DEBIT'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setFilter(t); setPage(1) }}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      filter === t
                        ? 'bg-white shadow-sm text-neutral-dark'
                        : 'text-neutral-gray hover:text-neutral-dark'
                    }`}
                  >
                    {t === 'all' ? 'All' : t === 'CREDIT' ? 'Credits' : 'Debits'}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                {/* Category */}
                <select
                  value={category}
                  onChange={(e) => { setCategory(e.target.value as TransactionCategory | 'all'); setPage(1) }}
                  className="input h-9 text-sm w-auto pr-8"
                >
                  {CATEGORIES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>

                {/* Actions */}
                <button
                  onClick={() => { setTransactions([]); toast.success('Cleared') }}
                  title="Clear data"
                  className="btn-ghost p-2"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  title="Upload new CSV"
                  className="btn-ghost p-2"
                >
                  <Upload className="w-4 h-4" />
                </button>
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>
            </div>
          </div>

          {/* Transaction list */}
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-border">
              <p className="text-sm font-medium text-neutral-dark">
                {filtered.length} transactions
                {search || filter !== 'all' || category !== 'all' ? ' (filtered)' : ''}
              </p>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-neutral-gray" />
                <Download className="w-4 h-4 text-neutral-gray cursor-pointer hover:text-primary" />
              </div>
            </div>

            <div className="px-4 divide-y-0">
              {paginated.length === 0 ? (
                <div className="py-12 text-center text-neutral-gray">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>No transactions match your filters.</p>
                </div>
              ) : (
                paginated.map((tx) => <TransactionItem key={tx.id} transaction={tx} />)
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-border">
                <p className="text-sm text-neutral-gray">
                  Page {page} of {totalPages} · {filtered.length} total
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-ghost btn-sm px-3"
                  >
                    ←
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = page <= 3 ? i + 1 : page + i - 2
                    if (p < 1 || p > totalPages) return null
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`btn-ghost btn-sm px-3 ${p === page ? 'bg-primary-light text-primary font-bold' : ''}`}
                      >
                        {p}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="btn-ghost btn-sm px-3"
                  >
                    →
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
