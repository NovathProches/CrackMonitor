-- ============================================================
-- 0001_init.sql  –  crack-monitor initial schema
-- ============================================================

-- Engineers (maps 1-to-1 with Supabase auth users)
CREATE TABLE engineers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Devices (hardware sensor nodes)
CREATE TABLE devices (
  id                 UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT             NOT NULL,
  device_token_hash  TEXT             NOT NULL UNIQUE,
  mm_per_px          DOUBLE PRECISION,
  camera_height_mm   DOUBLE PRECISION,
  last_seen          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Detections (crack capture events)
CREATE TABLE detections (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        UUID             REFERENCES devices(id) ON DELETE SET NULL,
  captured_at      TIMESTAMPTZ      NOT NULL,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  gps_accuracy_m   DOUBLE PRECISION,
  ir_triggered     BOOLEAN          NOT NULL DEFAULT false,
  ultrasonic_mm    DOUBLE PRECISION,
  image_path       TEXT,
  overlay_path     TEXT,
  crack_length_mm  DOUBLE PRECISION,
  crack_width_mm   DOUBLE PRECISION,
  crack_area_mm2   DOUBLE PRECISION,
  severity         TEXT             CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status           TEXT             NOT NULL DEFAULT 'unreviewed'
                                    CHECK (status IN ('unreviewed', 'reviewed', 'flagged', 'closed')),
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Tickets (maintenance work orders)
CREATE TABLE tickets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id  UUID        NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  assignee_id   UUID        REFERENCES engineers(id) ON DELETE SET NULL,
  status        TEXT        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'in_progress', 'resolved')),
  scheduled_for TIMESTAMPTZ,
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID        REFERENCES engineers(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- service_role bypasses RLS by default in Supabase.
-- authenticated users may SELECT; all mutations go through
-- the cv-service backend (service_role key).
-- ============================================================

ALTER TABLE engineers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_engineers"  ON engineers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_select_devices"    ON devices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_select_detections" ON detections
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_select_tickets"    ON tickets
  FOR SELECT TO authenticated USING (true);
