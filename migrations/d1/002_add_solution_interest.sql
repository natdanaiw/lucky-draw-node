-- Add solution_interest column to history table for the new form field
ALTER TABLE history ADD COLUMN solution_interest TEXT NOT NULL DEFAULT '';
