-- Migration: Add Multi-Sector Support to Caly
-- Date: 2025-01-29
-- Purpose: Add sector field and configuration tables to support 14+ industry verticals

-- STEP 1: Add sector column to existing clients (if not already present)
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS sector VARCHAR(50) DEFAULT 'ecommerce';

-- STEP 2: Create new configuration tables (idempotent - IF NOT EXISTS)
-- Already created in schema.sql, but safe to recreate here

-- STEP 3: Insert default sector configurations for all existing clients
-- This backfills any existing clients with ecommerce defaults
INSERT INTO sector_configurations (client_id, sector, config)
SELECT id, 'ecommerce', jsonb_build_object(
  'return_window_days', COALESCE(return_window_days, 14),
  'refund_auto_threshold', COALESCE(refund_auto_threshold, 2000),
  'cancel_window_hours', COALESCE(cancel_window_hours, 24),
  'retention_days', COALESCE(retention_days, 45)
)
FROM clients
WHERE sector = 'ecommerce'
ON CONFLICT (client_id, sector) DO NOTHING;

-- STEP 4: Seed sector_agents with E-commerce agents (already working)
INSERT INTO sector_agents (sector, agent_type, agent_class, enabled, priority) VALUES
  -- E-commerce agents
  ('ecommerce', 'OrderStatusAgent', 'agents.ecommerce.OrderStatusAgent', TRUE, 100),
  ('ecommerce', 'RefundAgent', 'agents.ecommerce.RefundAgent', TRUE, 101),
  ('ecommerce', 'ReturnAgent', 'agents.ecommerce.ReturnAgent', TRUE, 102),
  ('ecommerce', 'CancelAgent', 'agents.ecommerce.CancelAgent', TRUE, 103),
  ('ecommerce', 'TrackingAgent', 'agents.ecommerce.TrackingAgent', TRUE, 104),
  ('ecommerce', 'PaymentAgent', 'agents.ecommerce.PaymentAgent', TRUE, 105),
  ('ecommerce', 'AddressAgent', 'agents.ecommerce.AddressAgent', TRUE, 106),
  ('ecommerce', 'ComplaintAgent', 'agents.ecommerce.ComplaintAgent', TRUE, 107),
  ('ecommerce', 'FAQAgent', 'agents.ecommerce.FAQAgent', TRUE, 108),
  ('ecommerce', 'CartRecoveryAgent', 'agents.ecommerce.CartRecoveryAgent', TRUE, 109),
  ('ecommerce', 'ProductInfoAgent', 'agents.ecommerce.ProductInfoAgent', TRUE, 110),
  ('ecommerce', 'CODConfirmationAgent', 'agents.ecommerce.CODConfirmationAgent', TRUE, 111),
  ('ecommerce', 'DeliveryETAAgent', 'agents.ecommerce.DeliveryETAAgent', TRUE, 112),
  ('ecommerce', 'WrongItemAgent', 'agents.ecommerce.WrongItemAgent', TRUE, 113),
  
  -- Healthcare agents (placeholder - to be implemented)
  ('healthcare', 'AppointmentBookingAgent', 'agents.healthcare.AppointmentBookingAgent', TRUE, 100),
  ('healthcare', 'PrescriptionRefillAgent', 'agents.healthcare.PrescriptionRefillAgent', TRUE, 101),
  ('healthcare', 'TriageAgent', 'agents.healthcare.TriageAgent', TRUE, 102),
  ('healthcare', 'FollowUpAgent', 'agents.healthcare.FollowUpAgent', TRUE, 103),
  ('healthcare', 'PatientInfoAgent', 'agents.healthcare.PatientInfoAgent', TRUE, 104),
  
  -- Real Estate agents (placeholder - to be implemented)
  ('realestate', 'PropertyInquiryAgent', 'agents.realestate.PropertyInquiryAgent', TRUE, 100),
  ('realestate', 'ShowingScheduleAgent', 'agents.realestate.ShowingScheduleAgent', TRUE, 101),
  ('realestate', 'LeadCaptureAgent', 'agents.realestate.LeadCaptureAgent', TRUE, 102),
  ('realestate', 'OfferStatusAgent', 'agents.realestate.OfferStatusAgent', TRUE, 103),
  
  -- Logistics agents (placeholder - to be implemented)
  ('logistics', 'TrackingAgent', 'agents.logistics.TrackingAgent', TRUE, 100),
  ('logistics', 'PickupScheduleAgent', 'agents.logistics.PickupScheduleAgent', TRUE, 101),
  ('logistics', 'DeliveryFailureAgent', 'agents.logistics.DeliveryFailureAgent', TRUE, 102),
  ('logistics', 'AddressAgent', 'agents.logistics.AddressAgent', TRUE, 103)
ON CONFLICT (sector, agent_type) DO NOTHING;

-- STEP 5: Seed sector_entities with entity types per sector
INSERT INTO sector_entities (sector, entity_type, description, extraction_hints) VALUES
  -- E-commerce entities
  ('ecommerce', 'order_id', 'Order identifier', ARRAY['order', 'order number', 'order id', 'order num']),
  ('ecommerce', 'product_id', 'Product identifier', ARRAY['product', 'item', 'product id', 'sku']),
  ('ecommerce', 'customer_id', 'Customer identifier', ARRAY['customer', 'account', 'customer id']),
  ('ecommerce', 'tracking_number', 'Shipment tracking', ARRAY['tracking', 'tracking number', 'awb']),
  ('ecommerce', 'phone', 'Phone number', ARRAY['phone', 'number', 'contact']),
  ('ecommerce', 'email', 'Email address', ARRAY['email', 'mail', 'e-mail']),
  
  -- Healthcare entities
  ('healthcare', 'patient_id', 'Patient identifier', ARRAY['patient', 'patient id', 'mrn']),
  ('healthcare', 'appointment_id', 'Appointment identifier', ARRAY['appointment', 'appointment id', 'slot']),
  ('healthcare', 'prescription_id', 'Prescription identifier', ARRAY['prescription', 'rx', 'medicine']),
  ('healthcare', 'provider_id', 'Healthcare provider', ARRAY['doctor', 'provider', 'clinic']),
  ('healthcare', 'phone', 'Phone number', ARRAY['phone', 'contact', 'number']),
  
  -- Real Estate entities
  ('realestate', 'property_id', 'Property identifier', ARRAY['property', 'listing', 'property id']),
  ('realestate', 'buyer_id', 'Buyer identifier', ARRAY['buyer', 'client', 'customer']),
  ('realestate', 'showing_id', 'Showing/Viewing appointment', ARRAY['showing', 'viewing', 'tour']),
  ('realestate', 'offer_id', 'Offer identifier', ARRAY['offer', 'bid', 'proposal']),
  ('realestate', 'phone', 'Phone number', ARRAY['phone', 'contact', 'number']),
  
  -- Logistics entities
  ('logistics', 'parcel_id', 'Parcel/shipment identifier', ARRAY['parcel', 'shipment', 'package']),
  ('logistics', 'tracking_number', 'Tracking number', ARRAY['tracking', 'awb', 'docket']),
  ('logistics', 'pickup_id', 'Pickup appointment', ARRAY['pickup', 'collection', 'retrieval']),
  ('logistics', 'phone', 'Phone number', ARRAY['phone', 'contact', 'number'])
ON CONFLICT (sector, entity_type) DO NOTHING;

-- STEP 6: Seed sector_intent_patterns with E-commerce patterns (Hindi + English)
-- English patterns
INSERT INTO sector_intent_patterns (sector, intent, language, regex_pattern, examples, priority) VALUES
  ('ecommerce', 'ORDER_STATUS', 'en', '/(order|my\s+order|status|kaha|where).*(hai|is|kab)/i', ARRAY['Where is my order?', 'My order status', 'When will it arrive?'], 100),
  ('ecommerce', 'DELIVERY_ETA', 'en', '/(delivery|deliver|kab|when).*(aayega|arrive|reach|come)/i', ARRAY['When will it deliver?', 'When will it arrive?'], 101),
  ('ecommerce', 'RETURN_REQUEST', 'en', '/(return|wapas|send\s+back|money\s+back|refund)/i', ARRAY['I want to return this', 'Can I return the item?'], 102),
  ('ecommerce', 'REFUND_STATUS', 'en', '/(refund|money|paisa|amount).*(status|kab|when)/i', ARRAY['When will I get my money back?', 'Refund status?'], 103),
  ('ecommerce', 'CANCEL_ORDER', 'en', '/(cancel|cancel.*order|don.*want|na\s+chahiye)/i', ARRAY['Cancel my order', 'I dont want this'], 104),
  ('ecommerce', 'TRACKING', 'en', '/(tracking|track|trace|find|gps|location)/i', ARRAY['Track my package', 'Wheres my delivery?'], 105),
  ('ecommerce', 'PAYMENT_ISSUE', 'en', '/(payment|paid|pay|fail|error|problem|issue)/i', ARRAY['Payment failed', 'Why wasnt I charged?'], 106),
  ('ecommerce', 'ADDRESS_CHANGE', 'en', '/(address|deliver|change|update|wrong)/i', ARRAY['Change delivery address', 'Wrong address'], 107),
  ('ecommerce', 'COMPLAINT', 'en', '/(complain|issue|problem|damage|broken|wrong)/i', ARRAY['The item is broken', 'I have a complaint'], 108),
  ('ecommerce', 'PRODUCT_INFO', 'en', '/(product|item|size|color|price|available|stock)/i', ARRAY['What color is available?', 'Is it in stock?'], 109);

-- Hindi patterns
INSERT INTO sector_intent_patterns (sector, intent, language, regex_pattern, examples, priority) VALUES
  ('ecommerce', 'ORDER_STATUS', 'hi', '/(mera|mere|mere\s+order|order).*kaha.*hai/i', ARRAY['Mera order kaha hai?', 'Order kab aayega?'], 100),
  ('ecommerce', 'DELIVERY_ETA', 'hi', '/(delivery|pakda|pakad|ane\s+vale|aayega).*(kab|kitne|din|mein)/i', ARRAY['Delivery kab aayegi?', 'Kitne din mein aayega?'], 101),
  ('ecommerce', 'RETURN_REQUEST', 'hi', '/(wapas|return|refund|paisa\s+wapas|money\s+back)/i', ARRAY['Ye wapas bhej du?', 'Paisa wapas milega?'], 102),
  ('ecommerce', 'CANCEL_ORDER', 'hi', '/(cancel|order.*cancel|na\s+chahiye|karo\s+na)/i', ARRAY['Order cancel karo', 'Mujhe ye nahi chahiye'], 103),
  ('ecommerce', 'TRACKING', 'hi', '/(track|pakda.*kaha|delivery.*kaha|gps|location)/i', ARRAY['Mera pakda kaha hai?', 'Delivery kaha par hai?'], 104);

-- STEP 7: Insert default healthcare configurations (for future use)
INSERT INTO sector_configurations (client_id, sector, config)
SELECT id, 'healthcare', jsonb_build_object(
  'appointment_buffer_mins', 15,
  'escalation_wait_time', 300,
  'hipaa_enabled', TRUE,
  'patient_privacy_level', 'high'
)
FROM clients
WHERE sector = 'healthcare'
ON CONFLICT (client_id, sector) DO NOTHING;

-- STEP 8: Verify migration success
SELECT 'Migration completed successfully!' as status,
       COUNT(DISTINCT sector) as sectors_configured,
       COUNT(*) as total_configs
FROM sector_configurations;

-- Show sector distribution
SELECT sector, COUNT(*) as client_count
FROM clients
GROUP BY sector
ORDER BY client_count DESC;
