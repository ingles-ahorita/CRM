-- Add no_outcome_category column to outcome_log for mandatory category when outcome is 'no'
-- Values: 'price', 'authority', 'certainty', 'fit'

ALTER TABLE outcome_log ADD COLUMN IF NOT EXISTS no_outcome_category text;
