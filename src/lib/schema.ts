// Idempotent schema. Applied on first database use; safe to run repeatedly.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS shops (
  id text PRIMARY KEY,
  name text NOT NULL,
  intake_token text NOT NULL UNIQUE,
  contact_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  plan text NOT NULL DEFAULT 'starter',
  monthly_fee_cents integer NOT NULL DEFAULT 50000,
  job_cap integer NOT NULL DEFAULT 20,
  rates jsonb NOT NULL DEFAULT '{}'::jsonb,
  insurers jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','shop','estimator')),
  shop_id text REFERENCES shops(id),
  credentials text NOT NULL DEFAULT '',
  pay_per_job_cents integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  number serial,
  shop_id text NOT NULL REFERENCES shops(id),
  ro_number text NOT NULL DEFAULT '',
  insurer text NOT NULL DEFAULT '',
  claim_number text NOT NULL DEFAULT '',
  adjuster text NOT NULL DEFAULT '',
  vin text NOT NULL DEFAULT '',
  vehicle text NOT NULL DEFAULT '',
  vehicle_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'upload',
  status text NOT NULL DEFAULT 'processing',
  error text NOT NULL DEFAULT '',
  estimate_total_cents integer,
  letter text NOT NULL DEFAULT '',
  ai_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules_version integer NOT NULL DEFAULT 0,
  assigned_to text REFERENCES users(id),
  created_by text REFERENCES users(id),
  signed_off_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  drafted_at timestamptz,
  assigned_at timestamptz,
  signed_off_at timestamptz,
  submitted_at timestamptz,
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_shop_idx ON jobs(shop_id, created_at);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
CREATE TABLE IF NOT EXISTS rules (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rule_versions (
  id serial PRIMARY KEY,
  rule_id text NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  satisfied_by jsonb NOT NULL DEFAULT '[]'::jsonb,
  labor_hours real NOT NULL DEFAULT 0,
  labor_type text NOT NULL DEFAULT 'body',
  flat_amount_cents integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT '',
  change_note text NOT NULL DEFAULT '',
  created_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, version)
);
CREATE TABLE IF NOT EXISTS playbook (
  id text PRIMARY KEY,
  insurer text NOT NULL,
  topic text NOT NULL,
  denial_pattern text NOT NULL DEFAULT '',
  response text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS documents (
  id text PRIMARY KEY,
  job_id text REFERENCES jobs(id) ON DELETE CASCADE,
  rule_id text REFERENCES rules(id) ON DELETE CASCADE,
  kind text NOT NULL,
  filename text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  storage_key text NOT NULL,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_job_idx ON documents(job_id);
CREATE TABLE IF NOT EXISTS estimate_lines (
  id serial PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  line_no integer,
  section text NOT NULL DEFAULT '',
  operation text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  part_number text NOT NULL DEFAULT '',
  qty real,
  price_cents integer,
  labor_hours real,
  paint_hours real,
  raw text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS estimate_lines_job_idx ON estimate_lines(job_id);
CREATE TABLE IF NOT EXISTS flagged_items (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  rule_id text REFERENCES rules(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  reason text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  labor_hours real NOT NULL DEFAULT 0,
  labor_type text NOT NULL DEFAULT 'body',
  amount_cents integer NOT NULL DEFAULT 0,
  origin text NOT NULL DEFAULT 'ai',
  status text NOT NULL DEFAULT 'pending',
  ai_snapshot jsonb,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flagged_items_job_idx ON flagged_items(job_id);
CREATE TABLE IF NOT EXISTS reviews (
  id serial PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  flagged_item_id text,
  user_id text REFERENCES users(id),
  action text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_job_idx ON reviews(job_id);
CREATE TABLE IF NOT EXISTS outcomes (
  flagged_item_id text PRIMARY KEY REFERENCES flagged_items(id) ON DELETE CASCADE,
  job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('approved','partial','denied')),
  approved_cents integer NOT NULL DEFAULT 0,
  denial_reason text NOT NULL DEFAULT '',
  recorded_by text REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rebuttals (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  flagged_item_id text NOT NULL REFERENCES flagged_items(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  released_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);
CREATE TABLE IF NOT EXISTS emails (
  id serial PRIMARY KEY,
  direction text NOT NULL DEFAULT 'out',
  recipient text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  attachment text NOT NULL DEFAULT '',
  status text NOT NULL,
  error text NOT NULL DEFAULT '',
  job_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;
