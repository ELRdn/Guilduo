-- Keep the legacy official evaluation budget and all held reservations intact.
ALTER TABLE jev_decisions ADD COLUMN budget_scope TEXT NOT NULL DEFAULT 'evaluation';
CREATE TABLE jev_commercial_budgets (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL CHECK(period_end > period_start),
  limit_nano_usd INTEGER NOT NULL CHECK(limit_nano_usd > 0),
  used_nano_usd INTEGER NOT NULL DEFAULT 0 CHECK(used_nano_usd >= 0)
);
CREATE TRIGGER jev_commercial_period_overlap BEFORE INSERT ON jev_commercial_budgets
WHEN EXISTS(SELECT 1 FROM jev_commercial_budgets WHERE mode=NEW.mode AND id<>NEW.id AND period_start<NEW.period_end AND period_end>NEW.period_start)
BEGIN SELECT RAISE(ABORT,'Overlapping commercial Jev budget periods'); END;
