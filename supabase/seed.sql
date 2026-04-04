-- ============================================
-- INVOGUE COLLAB HQ — Seed Data
-- Run this AFTER schema.sql in Supabase SQL Editor
-- ============================================

-- ── USERS ──
INSERT INTO users (name, email, pin, role, status, avatar) VALUES
('Invogue Admin', 'admin@invogue.in', '1234', 'admin', 'active', 'IA'),
('Ankit Mehta', 'ankit@invogue.in', '1111', 'negotiator', 'active', 'AM'),
('Megha Joshi', 'megha@invogue.in', '1111', 'negotiator', 'active', 'MJ'),
('Sneha Pillai', 'sneha@invogue.in', '1111', 'negotiator', 'active', 'SP'),
('Ritu Kapoor', 'ritu@invogue.in', '1111', 'approver', 'active', 'RK'),
('Raj Kumar', 'raj@invogue.in', '1111', 'logistics', 'active', 'RJ'),
('Pooja Sharma', 'pooja@invogue.in', '1111', 'finance', 'active', 'PS');

-- ── CAMPAIGNS ──
INSERT INTO campaigns (name, budget, target_influencers, status, deadline) VALUES
('Summer Sculpt Launch', 500000, 25, 'active', '2026-05-30'),
('Monsoon Comfort Edit', 300000, 15, 'planning', '2026-06-30'),
('Wedding Season Push', 800000, 40, 'active', '2026-04-30');

-- ── INFLUENCERS ──
INSERT INTO influencers (name, platform, handle, profile, followers, category, city, phone, email, address, poc, avg_rate, rating, notes, tags) VALUES
('Priya Sharma', 'Instagram', '@priyasharma', 'instagram.com/priyasharma', '125K', 'Fashion & Lifestyle', 'Bangalore', '+91 98765 43210', 'priya.sharma@gmail.com', '42 MG Road, Indiranagar, Bangalore 560038', 'Ankit', 18000, 'A', 'Very responsive. Delivers on time. Prefers advance payment.', ARRAY['fashion','lifestyle','bangalore']),
('Neha Verma', 'YouTube', '@nehaverma', 'youtube.com/@nehaverma', '450K', 'Beauty & Fashion', 'Noida', '+91 87654 32109', 'neha.v@gmail.com', 'B-12 Sector 62, Noida, UP 201301', 'Megha', 45000, 'A+', 'Top-tier creator. Long-form only. Manager: Rohit (+91 99887 76655).', ARRAY['beauty','youtube','premium']),
('Aisha Khan', 'Instagram', '@aishakhan', 'instagram.com/aishakhan', '89K', 'Fashion', 'Mumbai', '+91 76543 21098', 'aisha.k@outlook.com', '15 Turner Road, Bandra West, Mumbai 400050', 'Ankit', 12000, 'B+', 'Good engagement rate. Sometimes delays on stories.', ARRAY['fashion','mumbai','micro']),
('Ritika Nair', 'Instagram', '@ritikanair', 'instagram.com/ritikanair', '210K', 'Fashion & Fitness', 'Chennai', '+91 65432 10987', 'ritika.nair@gmail.com', '23 Boat Club Road, RA Puram, Chennai 600028', 'Sneha', 25000, 'A', 'High-quality reels. Great for body-positive messaging.', ARRAY['fitness','fashion','chennai']),
('Divya Menon', 'YouTube', '@divyamenon', 'youtube.com/@divyamenon', '680K', 'Fashion & Lifestyle', 'Hyderabad', '+91 54321 09876', 'divya.m@gmail.com', '7A Jubilee Hills, Road No. 36, Hyderabad 500033', 'Megha', 55000, 'A+', 'Premium creator. 500K+ avg views. Requires 50% advance. Manager: Preethi.', ARRAY['premium','youtube','lifestyle']),
('Tanya Gupta', 'Instagram', '@tanyagupta', 'instagram.com/tanyagupta', '95K', 'Fitness', 'Delhi', '+91 43210 98765', 'tanya.g@gmail.com', '56 Hauz Khas Village, New Delhi 110016', 'Ankit', 15000, 'B', 'Had invoice dispute Mar 2026. Claimed higher verbal agreement. Be careful.', ARRAY['fitness','delhi','caution']),
('Kavya Reddy', 'Instagram', '@kavyareddy', 'instagram.com/kavyareddy', '310K', 'Fashion & Beauty', 'Bangalore', '+91 32109 87654', 'kavya.r@gmail.com', '18 Koramangala 4th Block, Bangalore 560034', 'Sneha', 30000, 'A', 'Reliable. Always on time. Open to long-term partnerships.', ARRAY['fashion','beauty','bangalore','reliable']);
