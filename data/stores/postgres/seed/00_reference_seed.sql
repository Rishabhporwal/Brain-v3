-- §30.1–30.3 reference seed. Idempotent.
INSERT INTO reference.currencies(code,name,minor_unit) VALUES
  ('INR','Indian Rupee',2),
  ('AED','UAE Dirham',2),
  ('SAR','Saudi Riyal',2),
  ('BHD','Bahraini Dinar',3),
  ('OMR','Omani Rial',3),
  ('KWD','Kuwaiti Dinar',3),
  ('QAR','Qatari Riyal',2),
  ('USD','US Dollar',2)
ON CONFLICT (code) DO UPDATE SET name=excluded.name, minor_unit=excluded.minor_unit;

INSERT INTO reference.regions(code,name,currency,residency_zone) VALUES
  ('IN','India',               'INR','india'),
  ('AE','United Arab Emirates','AED','gcc'),
  ('SA','Saudi Arabia',        'SAR','gcc'),
  ('BH','Bahrain',             'BHD','gcc'),
  ('OM','Oman',                'OMR','gcc'),
  ('QA','Qatar',               'QAR','gcc'),
  ('KW','Kuwait',              'KWD','gcc')
ON CONFLICT (code) DO UPDATE SET name=excluded.name, currency=excluded.currency, residency_zone=excluded.residency_zone;

INSERT INTO reference.tax_slabs(region,slab,rate_pct,label) VALUES
  ('IN','gst_0',  0,  'GST 0% (exempt)'),
  ('IN','gst_5',  5,  'GST 5%'),
  ('IN','gst_18', 18, 'GST 18%'),
  ('IN','gst_40', 40, 'GST 40% (GST 2.0 top slab)'),
  ('AE','vat_5',  5,  'UAE VAT 5%'),
  ('SA','vat_15', 15, 'KSA VAT 15%'),
  ('BH','vat_10', 10, 'Bahrain VAT 10%'),
  ('OM','vat_5',  5,  'Oman VAT 5%'),
  ('QA','vat_0',  0,  'Qatar (none yet)'),
  ('KW','vat_0',  0,  'Kuwait (none yet)')
ON CONFLICT (region,slab) DO UPDATE SET rate_pct=excluded.rate_pct, label=excluded.label;
