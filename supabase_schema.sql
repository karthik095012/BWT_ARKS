-- CredIQ Supabase Schema
-- Run ALL of this in your Supabase SQL Editor: https://supabase.com/dashboard
-- ============================================================================

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,        -- Supabase Auth UID
  phone         TEXT UNIQUE,
  name          TEXT,
  last_login    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own row"   ON users FOR SELECT USING (id = auth.uid()::text);
CREATE POLICY "Users can upsert own row" ON users FOR ALL    USING (id = auth.uid()::text);

-- ── CredScores ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cred_scores (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score          INT  CHECK (score BETWEEN 300 AND 850),
  risk_level     TEXT,
  factors        JSONB,
  calculated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cred_user   ON cred_scores (user_id);
CREATE INDEX IF NOT EXISTS idx_cred_time   ON cred_scores (calculated_at DESC);

ALTER TABLE cred_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own scores" ON cred_scores FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY "Users write scores"    ON cred_scores FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- ── Scam Reports ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scam_reports (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone           TEXT,
  upi_id          TEXT,
  vpa             TEXT,
  scam_type       TEXT NOT NULL,
  description     TEXT NOT NULL,
  reports_count   INT  DEFAULT 1,
  confidence_score INT DEFAULT 80 CHECK (confidence_score BETWEEN 0 AND 100),
  first_reported  TIMESTAMPTZ DEFAULT NOW(),
  last_reported   TIMESTAMPTZ DEFAULT NOW(),
  is_verified     BOOLEAN DEFAULT FALSE,
  reported_by     TEXT DEFAULT 'community'
);

CREATE INDEX IF NOT EXISTS idx_scam_phone   ON scam_reports (phone);
CREATE INDEX IF NOT EXISTS idx_scam_upi     ON scam_reports (upi_id);
CREATE INDEX IF NOT EXISTS idx_scam_vpa     ON scam_reports (vpa);

ALTER TABLE scam_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read"    ON scam_reports FOR SELECT USING (true);
CREATE POLICY "Logged-in write" ON scam_reports FOR INSERT WITH CHECK (true);

-- ── RPC: increment report count ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_report_count(record_id UUID)
RETURNS VOID AS $$
  UPDATE scam_reports
  SET reports_count = reports_count + 1,
      last_reported = NOW()
  WHERE id = record_id;
$$ LANGUAGE SQL;

-- ── Seed data ─────────────────────────────────────────────────────────────────
INSERT INTO scam_reports (phone, upi_id, vpa, scam_type, description, reports_count, confidence_score, is_verified, reported_by)
VALUES
  ('+919876543210', NULL, NULL, 'fake_bank_call',   'HDFC Bank KYC scam — asks for OTP+PIN.',            847, 98, true, 'community'),
  ('+918899001122', NULL, NULL, 'investment_fraud', 'WhatsApp BTC mining group — fake 100x returns.',     234, 95, true, 'community'),
  ('+917788990011', NULL, NULL, 'lottery_scam',     'Fake ₹25 lakh winner — demands ₹2000 fee.',         1203, 99, true, 'community'),
  (NULL, 'kyc.hdfc@ybl',       'kyc.hdfc@ybl',       'upi_phishing', 'Fake HDFC UPI ID for KYC ₹1 activation.',  312, 97, true, 'bank_reported'),
  (NULL, 'prize.winner@paytm', 'prize.winner@paytm', 'lottery_scam', '₹500 unlock fee for fake ₹5 lakh prize.',  89,  92, false,'community'),
  ('+919988776655', NULL, NULL, 'kyc_fraud',        'SBI freeze threat — asks for TeamViewer screen share.',556, 96, true, 'sbi_reported')
ON CONFLICT DO NOTHING;
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone           TEXT,
  upi_id          TEXT,
  vpa             TEXT,
  scam_type       TEXT NOT NULL,
  description     TEXT NOT NULL,
  reports_count   INT  DEFAULT 1,
  confidence_score INT DEFAULT 80 CHECK (confidence_score BETWEEN 0 AND 100),
  first_reported  TIMESTAMPTZ DEFAULT NOW(),
  last_reported   TIMESTAMPTZ DEFAULT NOW(),
  is_verified     BOOLEAN DEFAULT FALSE,
  reported_by     TEXT DEFAULT 'community'
);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_scam_phone   ON scam_reports (phone);
CREATE INDEX IF NOT EXISTS idx_scam_upi     ON scam_reports (upi_id);
CREATE INDEX IF NOT EXISTS idx_scam_vpa     ON scam_reports (vpa);

-- Enable Row Level Security
ALTER TABLE scam_reports ENABLE ROW LEVEL SECURITY;

-- Allow public read (anyone can look up)
CREATE POLICY "Public read" ON scam_reports
  FOR SELECT USING (true);

-- Allow authenticated insert/update (community reports)
CREATE POLICY "Anyone can insert" ON scam_reports
  FOR INSERT WITH CHECK (true);

-- Helper RPC to increment report count
CREATE OR REPLACE FUNCTION increment_report_count(record_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE scam_reports
  SET reports_count = reports_count + 1,
      last_reported = NOW()
  WHERE id = record_id;
END;
$$;

-- ─── Seed Data ────────────────────────────────────────────────────────────────

INSERT INTO scam_reports (phone, scam_type, description, reports_count, confidence_score, is_verified, reported_by) VALUES
('+919876543210', 'fake_bank_call',   'Calls pretending to be HDFC Bank KYC team, asks for OTP and UPI PIN.', 847, 98, TRUE, 'hdfc_bank'),
('+918899001122', 'investment_fraud', 'WhatsApp group scam promising 100x returns in BTC mining. Asks ₹5000 to join.', 234, 95, TRUE, 'community'),
('+917788990011', 'lottery_scam',     'Claims user won ₹25 lakh in lucky draw. Demands ₹2000 processing fee.', 1203, 99, TRUE, 'community'),
('+919988776655', 'kyc_fraud',        'SBI account freeze threat, asks to share screen for KYC via TeamViewer.', 556, 96, TRUE, 'sbi_bank');

INSERT INTO scam_reports (upi_id, vpa, scam_type, description, reports_count, confidence_score, is_verified, reported_by) VALUES
('kyc.hdfc@ybl',        'kyc.hdfc@ybl',    'upi_phishing', 'Fake HDFC UPI ID for KYC scam, requests ₹1 to activate account.', 312, 97, TRUE, 'npci'),
('prize.winner@paytm',  'prize.winner@paytm', 'lottery_scam', 'Fake prize UPI - asks ₹500 fee to release ₹5 lakh prize.', 89, 92, FALSE, 'community'),
('refund.support@ybl',  'refund.support@ybl', 'upi_phishing', 'Fake refund UPI ID, sends payment request instead of refund.', 203, 94, TRUE, 'community');
