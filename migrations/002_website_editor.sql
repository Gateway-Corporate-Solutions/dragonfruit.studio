ALTER TABLE projects ALTER COLUMN repository_url DROP NOT NULL;
ALTER TABLE projects ADD COLUMN document jsonb;
ALTER TABLE projects ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0);

