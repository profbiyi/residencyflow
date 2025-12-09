-- Add region column to connectors table
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS region VARCHAR;
