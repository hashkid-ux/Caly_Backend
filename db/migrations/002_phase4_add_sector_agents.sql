-- Migration: Phase 4 - Add 24 New Sector Agents
-- Date: 2025-01-29
-- Purpose: Register all 24 agents for the 6 new sectors (Support, Telecom, Government, Education, Travel, SaaS)

-- STEP 1: Insert Support/SaaS Sector Agents
INSERT INTO sector_agents (sector, agent_type, agent_class, enabled, priority) VALUES
  ('support', 'L1SupportAgent', 'agents.support.L1SupportAgent', TRUE, 100),
  ('support', 'TicketCreationAgent', 'agents.support.TicketCreationAgent', TRUE, 101),
  ('support', 'FAQLookupAgent', 'agents.support.FAQLookupAgent', TRUE, 102),
  ('support', 'IssueEscalationAgent', 'agents.support.IssueEscalationAgent', TRUE, 103)
ON CONFLICT (sector, agent_type) DO NOTHING;

-- STEP 2: Insert Telecom/Utilities Sector Agents
INSERT INTO sector_agents (sector, agent_type, agent_class, enabled, priority) VALUES
  ('telecom', 'OutageNotificationAgent', 'agents.telecom.OutageNotificationAgent', TRUE, 100),
  ('telecom', 'BillingQueryAgent', 'agents.telecom.BillingQueryAgent', TRUE, 101),
  ('telecom', 'ServiceActivationAgent', 'agents.telecom.ServiceActivationAgent', TRUE, 102),
  ('telecom', 'AppointmentAgent', 'agents.telecom.AppointmentAgent', TRUE, 103)
ON CONFLICT (sector, agent_type) DO NOTHING;

-- STEP 3: Insert Government/Public Services Sector Agents
INSERT INTO sector_agents (sector, agent_type, agent_class, enabled, priority) VALUES
  ('government', 'CitizenRoutingAgent', 'agents.government.CitizenRoutingAgent', TRUE, 100),
  ('government', 'ComplaintIntakeAgent', 'agents.government.ComplaintIntakeAgent', TRUE, 101),
  ('government', 'StatusUpdateAgent', 'agents.government.StatusUpdateAgent', TRUE, 102),
  ('government', 'PermitTrackingAgent', 'agents.government.PermitTrackingAgent', TRUE, 103)
ON CONFLICT (sector, agent_type) DO NOTHING;

-- STEP 4: Insert Education/EdTech Sector Agents
INSERT INTO sector_agents (sector, agent_type, agent_class, enabled, priority) VALUES
  ('education', 'AdmissionsFAQAgent', 'agents.education.AdmissionsFAQAgent', TRUE, 100),
  ('education', 'BatchScheduleAgent', 'agents.education.BatchScheduleAgent', TRUE, 101),
  ('education', 'EnrollmentAgent', 'agents.education.EnrollmentAgent', TRUE, 102),
  ('education', 'ReminderAgent', 'agents.education.ReminderAgent', TRUE, 103)
ON CONFLICT (sector, agent_type) DO NOTHING;

-- STEP 5: Insert Travel/Hospitality Sector Agents
INSERT INTO sector_agents (sector, agent_type, agent_class, enabled, priority) VALUES
  ('travel', 'BookingConfirmationAgent', 'agents.travel.BookingConfirmationAgent', TRUE, 100),
  ('travel', 'ItineraryQAAgent', 'agents.travel.ItineraryQAAgent', TRUE, 101),
  ('travel', 'CheckinInfoAgent', 'agents.travel.CheckinInfoAgent', TRUE, 102),
  ('travel', 'DisruptionAlertAgent', 'agents.travel.DisruptionAlertAgent', TRUE, 103)
ON CONFLICT (sector, agent_type) DO NOTHING;

-- STEP 6: Insert SaaS/Software Sector Agents
INSERT INTO sector_agents (sector, agent_type, agent_class, enabled, priority) VALUES
  ('saas', 'OnboardingSupportAgent', 'agents.saas.OnboardingSupportAgent', TRUE, 100),
  ('saas', 'BillingQueryAgent', 'agents.saas.BillingQueryAgent', TRUE, 101),
  ('saas', 'DemoSchedulingAgent', 'agents.saas.DemoSchedulingAgent', TRUE, 102),
  ('saas', 'FeatureFAQAgent', 'agents.saas.FeatureFAQAgent', TRUE, 103)
ON CONFLICT (sector, agent_type) DO NOTHING;

-- STEP 7: Insert Support Sector Entities
INSERT INTO sector_entities (sector, entity_type, description, extraction_hints) VALUES
  ('support', 'ticket_id', 'Support ticket identifier', ARRAY['ticket', 'ticket id', 'ticket number', 'case']),
  ('support', 'issue_description', 'Description of issue', ARRAY['issue', 'problem', 'error', 'trouble']),
  ('support', 'customer_email', 'Customer email address', ARRAY['email', 'mail', 'e-mail']),
  ('support', 'priority', 'Ticket priority level', ARRAY['priority', 'urgent', 'critical', 'high', 'low'])
ON CONFLICT (sector, entity_type) DO NOTHING;

-- STEP 8: Insert Telecom Sector Entities
INSERT INTO sector_entities (sector, entity_type, description, extraction_hints) VALUES
  ('telecom', 'account_number', 'Account identifier', ARRAY['account', 'account number', 'customer number', 'service']),
  ('telecom', 'service_type', 'Type of service', ARRAY['service', 'internet', 'mobile', 'phone', 'electricity', 'gas', 'water']),
  ('telecom', 'location_zip', 'ZIP/Postal code', ARRAY['zip', 'zipcode', 'postal', 'area', 'location']),
  ('telecom', 'billing_date', 'Billing date', ARRAY['billing', 'bill', 'payment', 'due', 'invoice'])
ON CONFLICT (sector, entity_type) DO NOTHING;

-- STEP 9: Insert Government Sector Entities
INSERT INTO sector_entities (sector, entity_type, description, extraction_hints) VALUES
  ('government', 'reference_id', 'Application or complaint reference', ARRAY['reference', 'ref', 'id', 'number']),
  ('government', 'inquiry_type', 'Type of inquiry', ARRAY['inquiry', 'type', 'category', 'service']),
  ('government', 'location', 'City or county', ARRAY['location', 'city', 'county', 'area', 'district']),
  ('government', 'permit_number', 'Permit identifier', ARRAY['permit', 'permit number', 'license'])
ON CONFLICT (sector, entity_type) DO NOTHING;

-- STEP 10: Insert Education Sector Entities
INSERT INTO sector_entities (sector, entity_type, description, extraction_hints) VALUES
  ('education', 'student_id', 'Student identifier', ARRAY['student', 'student id', 'student number', 'id']),
  ('education', 'program', 'Academic program', ARRAY['program', 'degree', 'course', 'major', 'major field']),
  ('education', 'academic_year', 'Academic year', ARRAY['year', 'semester', 'term', 'session']),
  ('education', 'courses', 'Course identifiers', ARRAY['course', 'courses', 'class', 'classes', 'code'])
ON CONFLICT (sector, entity_type) DO NOTHING;

-- STEP 11: Insert Travel Sector Entities
INSERT INTO sector_entities (sector, entity_type, description, extraction_hints) VALUES
  ('travel', 'booking_reference', 'Booking identifier', ARRAY['booking', 'booking reference', 'confirmation', 'reference']),
  ('travel', 'email', 'Guest email', ARRAY['email', 'mail', 'e-mail', 'contact']),
  ('travel', 'check_in_date', 'Check-in date', ARRAY['check-in', 'arrival', 'date', 'when']),
  ('travel', 'disruption_type', 'Type of disruption', ARRAY['disruption', 'issue', 'problem', 'cancellation', 'weather'])
ON CONFLICT (sector, entity_type) DO NOTHING;

-- STEP 12: Insert SaaS Sector Entities
INSERT INTO sector_entities (sector, entity_type, description, extraction_hints) VALUES
  ('saas', 'user_id', 'User identifier', ARRAY['user', 'user id', 'email', 'account']),
  ('saas', 'account_id', 'Account identifier', ARRAY['account', 'account id', 'customer']),
  ('saas', 'onboarding_step', 'Onboarding step', ARRAY['step', 'setup', 'onboarding', 'stage']),
  ('saas', 'feature_question', 'Feature inquiry', ARRAY['feature', 'capability', 'function', 'integration'])
ON CONFLICT (sector, entity_type) DO NOTHING;

-- STEP 13: Create default configurations for new sectors
INSERT INTO sector_configurations (client_id, sector, config)
SELECT id, 'support', jsonb_build_object(
  'l1_resolution_target', 0.60,
  'escalation_threshold', 300,
  'ticket_ttl_hours', 48,
  'max_reopens', 2
)
FROM clients
WHERE active = TRUE
ON CONFLICT (client_id, sector) DO NOTHING;

INSERT INTO sector_configurations (client_id, sector, config)
SELECT id, 'telecom', jsonb_build_object(
  'outage_notification_enabled', TRUE,
  'service_activation_timeout_hours', 48,
  'billing_cycle_days', 30,
  'appointment_buffer_hours', 2
)
FROM clients
WHERE active = TRUE
ON CONFLICT (client_id, sector) DO NOTHING;

INSERT INTO sector_configurations (client_id, sector, config)
SELECT id, 'government', jsonb_build_object(
  'complaint_review_days', 7,
  'permit_processing_days', 14,
  'sla_compliance_enabled', TRUE,
  'documentation_required', TRUE
)
FROM clients
WHERE active = TRUE
ON CONFLICT (client_id, sector) DO NOTHING;

INSERT INTO sector_configurations (client_id, sector, config)
SELECT id, 'education', jsonb_build_object(
  'enrollment_deadline_days', 30,
  'semester_length_days', 120,
  'academic_year_format', 'August-July',
  'reminder_notification_hours', 24
)
FROM clients
WHERE active = TRUE
ON CONFLICT (client_id, sector) DO NOTHING;

INSERT INTO sector_configurations (client_id, sector, config)
SELECT id, 'travel', jsonb_build_object(
  'booking_confirmation_timeout_hours', 24,
  'check_in_reminder_hours', 24,
  'disruption_alert_enabled', TRUE,
  'refund_processing_days', 10
)
FROM clients
WHERE active = TRUE
ON CONFLICT (client_id, sector) DO NOTHING;

INSERT INTO sector_configurations (client_id, sector, config)
SELECT id, 'saas', jsonb_build_object(
  'onboarding_completion_target_days', 7,
  'demo_call_duration_minutes', 30,
  'api_rate_limit_calls_per_hour', 1000,
  'feature_adoption_tracking_enabled', TRUE
)
FROM clients
WHERE active = TRUE
ON CONFLICT (client_id, sector) DO NOTHING;

-- STEP 14: Add sector intent patterns (basic starters - can be enhanced)
-- Support sector patterns
INSERT INTO sector_intent_patterns (sector, intent, language, regex_pattern, examples, priority) VALUES
  ('support', 'FAQ_SEARCH', 'en', '/(help|how|what|faq|question|know)/i', ARRAY['How do I reset my password?', 'FAQ about billing'], 100),
  ('support', 'TICKET_CREATION', 'en', '/(ticket|issue|problem|report|need\s+help)/i', ARRAY['Create a support ticket', 'I have an issue'], 101),
  ('support', 'ESCALATION', 'en', '/(escalate|urgent|critical|speak\s+to|manager)/i', ARRAY['I need to escalate this', 'This is urgent'], 102);

-- Telecom sector patterns
INSERT INTO sector_intent_patterns (sector, intent, language, regex_pattern, examples, priority) VALUES
  ('telecom', 'OUTAGE_CHECK', 'en', '/(outage|down|offline|working|service)/i', ARRAY['Is there an outage?', 'Service is down'], 100),
  ('telecom', 'BILL_INQUIRY', 'en', '/(bill|billing|charge|amount|payment)/i', ARRAY['What is my bill?', 'Why was I charged?'], 101),
  ('telecom', 'SERVICE_REQUEST', 'en', '/(activate|upgrade|change|plan|new\s+service)/i', ARRAY['I want to upgrade', 'New service activation'], 102);

-- Government sector patterns
INSERT INTO sector_intent_patterns (sector, intent, language, regex_pattern, examples, priority) VALUES
  ('government', 'COMPLAINT', 'en', '/(complain|issue|problem|grievance)/i', ARRAY['I have a complaint', 'File a grievance'], 100),
  ('government', 'STATUS_CHECK', 'en', '/(status|progress|check|where|when)/i', ARRAY['Check my application status', 'When will it be approved?'], 101),
  ('government', 'PERMIT_INQUIRY', 'en', '/(permit|license|approval|document)/i', ARRAY['Track my permit', 'Permit status'], 102);

-- Education sector patterns
INSERT INTO sector_intent_patterns (sector, intent, language, regex_pattern, examples, priority) VALUES
  ('education', 'ADMISSIONS', 'en', '/(admission|apply|enroll|requirement|deadline)/i', ARRAY['Admissions requirements?', 'How do I apply?'], 100),
  ('education', 'COURSE_INFO', 'en', '/(course|class|schedule|batch|semester)/i', ARRAY['Course schedule?', 'Batch information'], 101),
  ('education', 'ENROLLMENT', 'en', '/(register|enroll|register\s+for|join)/i', ARRAY['Register for course', 'Enroll me'], 102);

-- Travel sector patterns
INSERT INTO sector_intent_patterns (sector, intent, language, regex_pattern, examples, priority) VALUES
  ('travel', 'BOOKING_CONFIRM', 'en', '/(booking|reservation|confirmation|confirm)/i', ARRAY['Confirm my booking', 'Booking details'], 100),
  ('travel', 'CHECKIN_INFO', 'en', '/(check[- ]?in|arrival|key|access|password)/i', ARRAY['Check-in time?', 'WiFi password?'], 101),
  ('travel', 'DISRUPTION', 'en', '/(cancel|change|reschedule|problem|issue|weather)/i', ARRAY['Flight cancelled', 'Need to reschedule'], 102);

-- SaaS sector patterns
INSERT INTO sector_intent_patterns (sector, intent, language, regex_pattern, examples, priority) VALUES
  ('saas', 'ONBOARDING', 'en', '/(setup|start|begin|new|onboard|help\s+me)/i', ARRAY['How do I start?', 'Get me set up'], 100),
  ('saas', 'BILLING', 'en', '/(billing|payment|plan|upgrade|subscription)/i', ARRAY['Upgrade plan', 'Billing question'], 101),
  ('saas', 'FEATURE', 'en', '/(feature|capability|integration|api|does\s+it)/i', ARRAY['Do you have this feature?', 'API documentation'], 102);

-- STEP 15: Verify migration and show statistics
SELECT 'Phase 4 Migration Complete!' as status,
       COUNT(DISTINCT sector) as total_sectors,
       COUNT(*) as total_agents,
       STRING_AGG(DISTINCT sector, ', ' ORDER BY sector) as sectors
FROM sector_agents
ORDER BY sector;

-- Show agent count per sector
SELECT sector, COUNT(*) as agent_count
FROM sector_agents
GROUP BY sector
ORDER BY agent_count DESC;

-- Show all sectors with their configuration status
SELECT 
  sa.sector,
  COUNT(sa.id) as agents,
  COUNT(DISTINCT se.entity_type) as entities,
  COUNT(DISTINCT sc.id) as configurations,
  CASE WHEN COUNT(sa.id) > 0 THEN 'ACTIVE' ELSE 'PENDING' END as status
FROM sector_agents sa
FULL OUTER JOIN sector_entities se ON sa.sector = se.sector
FULL OUTER JOIN sector_configurations sc ON sa.sector = sc.sector
GROUP BY sa.sector
ORDER BY sa.sector;
