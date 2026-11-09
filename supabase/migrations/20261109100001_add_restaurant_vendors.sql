-- Add operational vendors used in restaurant supply chain (ingredients, machinery, services)
INSERT INTO public.vendors (name, description) VALUES
  ('Bakery Supply', 'Flour, baking mixes, canned dough'),
  ('Fruit Orchard', 'Seasonal fruits and vegetables'),
  ('Kerala Kitchen Oil', 'Cooking oil and ghee supplier'),
  ('Cabbage Co', 'Leafy greens supply chain'),
  ('Vegetables Direct', 'Green vegetables and root veggies')
ON CONFLICT (name) DO NOTHING;
