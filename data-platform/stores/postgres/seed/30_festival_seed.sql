-- Festival & sale calendar (reference.festival_calendar) — global by region; brands read their region's
-- festivals. Starter set for 2026 with expected revenue-lift multipliers. Idempotent.
SET client_min_messages = warning;

INSERT INTO reference.festival_calendar(region, date, name, multiplier) VALUES
  -- India
  ('IN','2026-01-26','Republic Day Sale',1.4),
  ('IN','2026-03-04','Holi',1.8),
  ('IN','2026-04-19','Akshaya Tritiya',2.5),
  ('IN','2026-08-15','Independence Day Sale',1.6),
  ('IN','2026-08-28','Raksha Bandhan',1.9),
  ('IN','2026-09-14','Ganesh Chaturthi',1.7),
  ('IN','2026-10-11','Navratri',1.8),
  ('IN','2026-10-20','Dussehra',2.2),
  ('IN','2026-11-07','Dhanteras',3.0),
  ('IN','2026-11-08','Diwali',4.0),
  ('IN','2026-11-27','Black Friday',2.6),
  ('IN','2026-12-25','Christmas & Year-End',1.9),
  -- UAE
  ('AE','2026-02-18','Ramadan Begins',1.5),
  ('AE','2026-03-20','Eid al-Fitr',2.4),
  ('AE','2026-05-27','Eid al-Adha',2.1),
  ('AE','2026-11-27','White Friday',2.8),
  ('AE','2026-12-02','UAE National Day',1.8),
  -- Saudi Arabia
  ('SA','2026-02-18','Ramadan Begins',1.5),
  ('SA','2026-03-20','Eid al-Fitr',2.4),
  ('SA','2026-05-27','Eid al-Adha',2.2),
  ('SA','2026-09-23','Saudi National Day',2.0),
  ('SA','2026-11-27','White Friday',2.7)
ON CONFLICT (region, date, name) DO UPDATE SET multiplier = EXCLUDED.multiplier;
