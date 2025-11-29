-- PHASE 7: ADVANCED ANALYTICS & PERFORMANCE OPTIMIZATION
-- Database Migration: Create Analytics Tables
-- Created: November 29, 2025

-- ============================================================================
-- 1. AGENT METRICS TABLE
-- Tracks per-call metrics for each agent
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES sector_agents(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  
  -- Duration Metrics
  talk_time_seconds INT,
  hold_time_seconds INT,
  wrap_time_seconds INT,
  total_handle_time_seconds INT,
  
  -- Quality Metrics
  quality_score NUMERIC(3,2) CHECK (quality_score >= 0 AND quality_score <= 5),
  transfer_flag BOOLEAN DEFAULT FALSE,
  escalation_flag BOOLEAN DEFAULT FALSE,
  
  -- Call Outcome
  call_completed BOOLEAN DEFAULT TRUE,
  first_contact_resolved BOOLEAN,
  customer_callback_needed BOOLEAN DEFAULT FALSE,
  
  -- Performance Indicators
  agent_availability_percent NUMERIC(5,2),
  utilization_percent NUMERIC(5,2),
  productivity_score NUMERIC(3,2),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_metrics CHECK (
    talk_time_seconds >= 0 AND 
    hold_time_seconds >= 0 AND 
    wrap_time_seconds >= 0
  )
);

CREATE INDEX idx_agent_metrics_client ON agent_metrics(client_id);
CREATE INDEX idx_agent_metrics_agent ON agent_metrics(agent_id);
CREATE INDEX idx_agent_metrics_call ON agent_metrics(call_id);
CREATE INDEX idx_agent_metrics_created ON agent_metrics(created_at);
CREATE INDEX idx_agent_metrics_quality ON agent_metrics(quality_score);

-- ============================================================================
-- 2. CALL QUALITY SCORES TABLE
-- Detailed quality analysis for each call
-- ============================================================================

CREATE TABLE IF NOT EXISTS call_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  
  -- Quality Dimensions
  professionalism_score NUMERIC(3,2) CHECK (professionalism_score >= 0 AND professionalism_score <= 5),
  empathy_score NUMERIC(3,2) CHECK (empathy_score >= 0 AND empathy_score <= 5),
  resolution_score NUMERIC(3,2) CHECK (resolution_score >= 0 AND resolution_score <= 5),
  clarity_score NUMERIC(3,2) CHECK (clarity_score >= 0 AND clarity_score <= 5),
  responsiveness_score NUMERIC(3,2) CHECK (responsiveness_score >= 0 AND responsiveness_score <= 5),
  
  -- Audio Quality
  audio_clarity_percent NUMERIC(5,2),
  background_noise_level NUMERIC(5,2),
  speech_rate_wpm INT,
  silence_percent NUMERIC(5,2),
  
  -- Overall Rating
  overall_quality_score NUMERIC(3,2),
  quality_tier VARCHAR(20), -- 'Excellent', 'Good', 'Fair', 'Poor'
  
  -- Review Metadata
  reviewed_by_agent_id UUID REFERENCES sector_agents(id),
  review_date TIMESTAMP,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quality_scores_client ON call_quality_scores(client_id);
CREATE INDEX idx_quality_scores_call ON call_quality_scores(call_id);
CREATE INDEX idx_quality_scores_overall ON call_quality_scores(overall_quality_score);
CREATE INDEX idx_quality_scores_tier ON call_quality_scores(quality_tier);
CREATE INDEX idx_quality_scores_date ON call_quality_scores(review_date);

-- ============================================================================
-- 3. CUSTOMER SATISFACTION TABLE
-- Tracks CSAT, NPS, and sentiment for each call
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_satisfaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  customer_id UUID,
  
  -- CSAT Survey
  csat_score INT CHECK (csat_score >= 1 AND csat_score <= 5),
  csat_rating VARCHAR(20), -- 'Very Satisfied', 'Satisfied', 'Neutral', 'Dissatisfied', 'Very Dissatisfied'
  csat_comment TEXT,
  
  -- NPS Survey
  nps_score INT CHECK (nps_score >= 0 AND nps_score <= 10),
  nps_category VARCHAR(20), -- 'Promoter', 'Passive', 'Detractor'
  nps_comment TEXT,
  
  -- Sentiment Analysis
  sentiment_score NUMERIC(3,2) CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  sentiment_category VARCHAR(20), -- 'Very Positive', 'Positive', 'Neutral', 'Negative', 'Very Negative'
  
  -- Post-Call Survey
  would_recommend BOOLEAN,
  resolution_satisfaction INT CHECK (resolution_satisfaction >= 1 AND resolution_satisfaction <= 5),
  speed_satisfaction INT CHECK (speed_satisfaction >= 1 AND speed_satisfaction <= 5),
  professionalism_satisfaction INT CHECK (professionalism_satisfaction >= 1 AND professionalism_satisfaction <= 5),
  
  -- Feedback
  primary_feedback_category VARCHAR(50),
  feedback_text TEXT,
  
  -- Survey Metadata
  survey_sent_at TIMESTAMP,
  survey_responded_at TIMESTAMP,
  response_time_minutes INT,
  survey_channel VARCHAR(20), -- 'SMS', 'Email', 'IVR', 'App'
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_satisfaction_client ON customer_satisfaction(client_id);
CREATE INDEX idx_satisfaction_call ON customer_satisfaction(call_id);
CREATE INDEX idx_satisfaction_csat ON customer_satisfaction(csat_score);
CREATE INDEX idx_satisfaction_nps ON customer_satisfaction(nps_score);
CREATE INDEX idx_satisfaction_sentiment ON customer_satisfaction(sentiment_score);
CREATE INDEX idx_satisfaction_responded ON customer_satisfaction(survey_responded_at);

-- ============================================================================
-- 4. PERFORMANCE TRENDS TABLE
-- Pre-aggregated hourly, daily, and weekly trends
-- ============================================================================

CREATE TABLE IF NOT EXISTS performance_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES sector_agents(id),
  sector_key VARCHAR(50),
  
  -- Time Period
  trend_date DATE NOT NULL,
  hour_of_day INT,
  day_of_week INT,
  week_of_year INT,
  month INT,
  year INT,
  aggregation_level VARCHAR(20), -- 'hourly', 'daily', 'weekly', 'monthly'
  
  -- Aggregated Metrics
  total_calls INT DEFAULT 0,
  completed_calls INT DEFAULT 0,
  abandoned_calls INT DEFAULT 0,
  transferred_calls INT DEFAULT 0,
  escalated_calls INT DEFAULT 0,
  
  avg_handle_time_seconds INT,
  avg_talk_time_seconds INT,
  avg_hold_time_seconds INT,
  avg_wrap_time_seconds INT,
  
  avg_quality_score NUMERIC(3,2),
  avg_csat_score NUMERIC(3,2),
  avg_nps_score NUMERIC(3,2),
  
  first_contact_resolution_percent NUMERIC(5,2),
  customer_callback_percent NUMERIC(5,2),
  
  agent_availability_percent NUMERIC(5,2),
  utilization_percent NUMERIC(5,2),
  productivity_score NUMERIC(3,2),
  
  -- Business Metrics
  total_revenue NUMERIC(12,2),
  total_cost NUMERIC(12,2),
  margin NUMERIC(12,2),
  revenue_per_call NUMERIC(10,2),
  cost_per_call NUMERIC(10,2),
  
  -- System Metrics
  avg_api_response_time_ms INT,
  avg_db_query_time_ms INT,
  
  -- Quality Flags
  anomaly_detected BOOLEAN DEFAULT FALSE,
  quality_alert BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trends_client ON performance_trends(client_id);
CREATE INDEX idx_trends_agent ON performance_trends(agent_id);
CREATE INDEX idx_trends_sector ON performance_trends(sector_key);
CREATE INDEX idx_trends_date ON performance_trends(trend_date);
CREATE INDEX idx_trends_aggregation ON performance_trends(aggregation_level);
CREATE INDEX idx_trends_anomaly ON performance_trends(anomaly_detected);

-- ============================================================================
-- 5. COST ANALYSIS TABLE
-- Tracks cost metrics by various dimensions
-- ============================================================================

CREATE TABLE IF NOT EXISTS cost_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES sector_agents(id),
  sector_key VARCHAR(50),
  
  -- Cost Period
  analysis_date DATE NOT NULL,
  cost_period_start DATE,
  cost_period_end DATE,
  
  -- Cost Components
  agent_salary_cost NUMERIC(12,2),
  technology_cost NUMERIC(12,2),
  infrastructure_cost NUMERIC(12,2),
  training_cost NUMERIC(12,2),
  benefits_cost NUMERIC(12,2),
  other_cost NUMERIC(12,2),
  
  total_cost NUMERIC(12,2),
  
  -- Revenue
  total_revenue NUMERIC(12,2),
  
  -- Analysis
  cost_per_call NUMERIC(10,2),
  revenue_per_call NUMERIC(10,2),
  gross_margin NUMERIC(5,2),
  net_margin NUMERIC(5,2),
  roi_percent NUMERIC(5,2),
  
  -- Efficiency
  cost_efficiency_score NUMERIC(3,2),
  cost_trend_percent NUMERIC(5,2), -- vs previous period
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cost_analysis_client ON cost_analysis(client_id);
CREATE INDEX idx_cost_analysis_agent ON cost_analysis(agent_id);
CREATE INDEX idx_cost_analysis_sector ON cost_analysis(sector_key);
CREATE INDEX idx_cost_analysis_date ON cost_analysis(analysis_date);

-- ============================================================================
-- 6. PREDICTIVE ANALYTICS TABLE
-- Stores predictions and forecasts
-- ============================================================================

CREATE TABLE IF NOT EXISTS predictive_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sector_key VARCHAR(50),
  
  -- Prediction Period
  prediction_date DATE NOT NULL,
  prediction_for_date DATE NOT NULL,
  horizon_days INT, -- How many days ahead
  
  -- Call Volume Forecast
  predicted_call_volume INT,
  forecast_confidence NUMERIC(5,2),
  upper_bound INT,
  lower_bound INT,
  
  -- Agent Staffing Forecast
  recommended_agents INT,
  optimal_utilization_percent NUMERIC(5,2),
  
  -- Customer Churn Prediction
  churn_risk_percent NUMERIC(5,2),
  churn_score NUMERIC(3,2),
  
  -- Peak Time Prediction
  peak_hour INT,
  peak_hour_call_volume INT,
  
  -- Anomaly Prediction
  anomaly_probability NUMERIC(5,2),
  expected_issues TEXT,
  
  -- Model Metadata
  model_version VARCHAR(50),
  model_accuracy NUMERIC(5,2),
  last_model_training TIMESTAMP,
  
  -- Recommendations
  action_recommended VARCHAR(500),
  priority_level VARCHAR(20), -- 'Critical', 'High', 'Medium', 'Low'
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_predictions_client ON predictive_analytics(client_id);
CREATE INDEX idx_predictions_sector ON predictive_analytics(sector_key);
CREATE INDEX idx_predictions_for_date ON predictive_analytics(prediction_for_date);
CREATE INDEX idx_predictions_anomaly ON predictive_analytics(anomaly_probability);

-- ============================================================================
-- 7. ANOMALY DETECTION TABLE
-- Tracks detected anomalies and outliers
-- ============================================================================

CREATE TABLE IF NOT EXISTS anomaly_detection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES sector_agents(id),
  
  -- Anomaly Details
  anomaly_type VARCHAR(50), -- 'Quality', 'Performance', 'Revenue', 'Utilization', 'System'
  severity_level VARCHAR(20), -- 'Critical', 'High', 'Medium', 'Low'
  
  -- Detection Details
  metric_name VARCHAR(100),
  expected_value NUMERIC(12,2),
  actual_value NUMERIC(12,2),
  deviation_percent NUMERIC(5,2),
  standard_deviations NUMERIC(5,2),
  
  -- Time Context
  anomaly_detected_at TIMESTAMP,
  anomaly_occurred_at TIMESTAMP,
  data_point_count INT,
  
  -- Status
  anomaly_status VARCHAR(20) DEFAULT 'New', -- 'New', 'Investigating', 'Resolved', 'Ignored'
  investigation_notes TEXT,
  root_cause_identified VARCHAR(500),
  resolution_action TEXT,
  resolved_at TIMESTAMP,
  
  -- Alert
  alert_sent BOOLEAN DEFAULT FALSE,
  alert_sent_to UUID,
  alert_sent_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_anomalies_client ON anomaly_detection(client_id);
CREATE INDEX idx_anomalies_agent ON anomaly_detection(agent_id);
CREATE INDEX idx_anomalies_type ON anomaly_detection(anomaly_type);
CREATE INDEX idx_anomalies_severity ON anomaly_detection(severity_level);
CREATE INDEX idx_anomalies_detected ON anomaly_detection(anomaly_detected_at);
CREATE INDEX idx_anomalies_status ON anomaly_detection(anomaly_status);

-- ============================================================================
-- 8. MATERIALIZED VIEWS FOR PERFORMANCE
-- ============================================================================

-- Daily Performance Summary View
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_performance_summary AS
SELECT 
  DATE(m.created_at) as performance_date,
  m.client_id,
  m.agent_id,
  COUNT(*) as total_calls,
  AVG(m.quality_score) as avg_quality,
  AVG(m.total_handle_time_seconds) as avg_handle_time,
  SUM(CASE WHEN m.first_contact_resolved THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 as fcr_percent,
  AVG(m.utilization_percent) as avg_utilization
FROM agent_metrics m
GROUP BY DATE(m.created_at), m.client_id, m.agent_id;

CREATE INDEX idx_daily_perf_date ON daily_performance_summary(performance_date);
CREATE INDEX idx_daily_perf_client ON daily_performance_summary(client_id);
CREATE INDEX idx_daily_perf_agent ON daily_performance_summary(agent_id);

-- Sector Performance View
CREATE MATERIALIZED VIEW IF NOT EXISTS sector_performance_summary AS
SELECT 
  DATE(pt.trend_date) as summary_date,
  pt.client_id,
  pt.sector_key,
  pt.aggregation_level,
  SUM(pt.total_calls) as total_calls,
  AVG(pt.avg_quality_score) as avg_quality,
  AVG(pt.avg_handle_time_seconds) as avg_handle_time,
  AVG(pt.first_contact_resolution_percent) as avg_fcr,
  SUM(pt.total_revenue) as total_revenue,
  SUM(pt.total_cost) as total_cost
FROM performance_trends pt
GROUP BY DATE(pt.trend_date), pt.client_id, pt.sector_key, pt.aggregation_level;

CREATE INDEX idx_sector_perf_date ON sector_performance_summary(summary_date);
CREATE INDEX idx_sector_perf_client ON sector_performance_summary(client_id);
CREATE INDEX idx_sector_perf_sector ON sector_performance_summary(sector_key);

-- ============================================================================
-- 9. AUDIT LOG FOR ANALYTICS CHANGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID,
  
  -- Action Details
  action_type VARCHAR(50), -- 'Export', 'Generate', 'Analyze', 'Predict'
  report_type VARCHAR(100),
  resource_id UUID,
  
  -- Details
  query_used TEXT,
  filters_applied JSONB,
  results_count INT,
  
  -- Performance
  execution_time_ms INT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_client ON analytics_audit_log(client_id);
CREATE INDEX idx_audit_action ON analytics_audit_log(action_type);
CREATE INDEX idx_audit_created ON analytics_audit_log(created_at);

-- ============================================================================
-- 10. GRANT PERMISSIONS
-- ============================================================================

-- Note: Adjust user names based on your PostgreSQL setup
-- GRANT SELECT, INSERT, UPDATE ON agent_metrics TO analytics_user;
-- GRANT SELECT, INSERT, UPDATE ON call_quality_scores TO analytics_user;
-- GRANT SELECT, INSERT ON customer_satisfaction TO analytics_user;
-- etc...

-- ============================================================================
-- 11. REFRESH MATERIALIZED VIEWS
-- ============================================================================

-- These should be run on a schedule (e.g., every hour)
-- REFRESH MATERIALIZED VIEW daily_performance_summary;
-- REFRESH MATERIALIZED VIEW sector_performance_summary;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Tables Created: 8 analytics tables + 2 materialized views
-- Indexes Created: 30+ performance indexes
-- Status: Ready for Phase 7 backend development
