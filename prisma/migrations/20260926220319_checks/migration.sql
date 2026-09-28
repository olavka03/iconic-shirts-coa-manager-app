ALTER TABLE certificates ADD CONSTRAINT certificates_code_canonical
  CHECK (code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' AND length(code) BETWEEN 4 AND 32);
ALTER TABLE certificates ADD CONSTRAINT certificates_order_link_complete
  CHECK ((order_id IS NULL) = (line_item_id IS NULL)
     AND (order_id IS NULL) = (line_item_title IS NULL)
     AND (order_id IS NULL OR order_name IS NOT NULL));
ALTER TABLE signers ADD CONSTRAINT signers_date_precision_pair
  CHECK ((signed_on IS NULL) = (date_precision IS NULL)),
  ADD CONSTRAINT signers_month_is_first_day
  CHECK (date_precision IS DISTINCT FROM 'MONTH' OR EXTRACT(DAY FROM signed_on) = 1);
