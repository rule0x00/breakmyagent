CREATE TABLE players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname    TEXT NOT NULL UNIQUE,
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE level_secrets (
  player_id   UUID NOT NULL REFERENCES players(id),
  level       INT  NOT NULL,
  secret_hash TEXT NOT NULL,
  PRIMARY KEY (player_id, level)
);

CREATE TABLE attempts (
  id             BIGSERIAL PRIMARY KEY,
  player_id      UUID NOT NULL REFERENCES players(id),
  level          INT  NOT NULL,
  message        TEXT NOT NULL,
  inbox_email    TEXT,
  reply          TEXT,
  tool_calls     JSONB,
  blocked_by     TEXT,
  leaked         BOOLEAN NOT NULL,
  techniques     TEXT[],
  classify_conf  REAL,
  input_tokens   INT,
  output_tokens  INT,
  cost_usd       NUMERIC(10,6),
  latency_ms     INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON attempts (level, created_at DESC);
CREATE INDEX ON attempts USING GIN (techniques);

CREATE TABLE level_clears (
  player_id      UUID NOT NULL REFERENCES players(id),
  level          INT  NOT NULL,
  attempts_used  INT  NOT NULL,
  cleared_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, level)
);
