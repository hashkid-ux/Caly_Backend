/**
 * Agent Initialization & Registration - COMPLETE VERSION
 * Registers ALL 54+ agents across 11 sectors
 * Phase 6 Complete Implementation
 */

const { registry } = require('./AgentFactory');
const logger = require('../utils/logger');

// Import all agent modules
const HealthcareAgents = require('./HealthcareAgents');
const RetailAgents = require('./RetailAgents');
const FinanceAgents = require('./FinanceAgents');
const OtherSectorAgents = require('./OtherSectorAgents');
const RegulatoryAgents = require('./RegulatoryAgents');

// ============== INITIALIZATION FUNCTION ==============

async function initializeAgents() {
  try {
    logger.info('🚀 Starting comprehensive agent registration across 11 sectors...');

    // Healthcare agents (8)
    const healthcare = [
      { name: 'PharmacySupport', class: HealthcareAgents.PharmacySupport, sector: 'healthcare', capabilities: ['medication_check', 'refill_status', 'drug_interactions'], priority: 3 },
      { name: 'ClinicScheduler', class: HealthcareAgents.ClinicScheduler, sector: 'healthcare', capabilities: ['appointment_booking', 'doctor_listing', 'availability_check'], priority: 2 },
      { name: 'LabReporter', class: HealthcareAgents.LabReporter, sector: 'healthcare', capabilities: ['results_retrieval', 'interpretation', 'status_check'], priority: 3 },
      { name: 'NurseAdvisor', class: HealthcareAgents.NurseAdvisor, sector: 'healthcare', capabilities: ['health_advice', 'symptom_assessment', 'triage'], priority: 2 },
      { name: 'BillingSupport', class: HealthcareAgents.BillingSupport, sector: 'healthcare', capabilities: ['bill_inquiry', 'payment_processing', 'insurance_claims'], priority: 3 },
      { name: 'InsuranceHelper', class: HealthcareAgents.InsuranceHelper, sector: 'healthcare', capabilities: ['claims_filing', 'coverage_check', 'status_tracking'], priority: 3 },
      { name: 'MedicalRecords', class: HealthcareAgents.MedicalRecords, sector: 'healthcare', capabilities: ['record_access', 'transfer_request', 'amendment_filing'], priority: 2 },
      { name: 'EmergencyTriage', class: HealthcareAgents.EmergencyTriage, sector: 'healthcare', capabilities: ['emergency_assessment', 'routing', 'urgent_dispatch'], priority: 1 },
    ];

    // Retail agents (12)
    const retail = [
      { name: 'CustomerSupport', class: RetailAgents.CustomerSupport, sector: 'retail', capabilities: ['inquiry_handling', 'problem_resolution', 'escalation'], priority: 3 },
      { name: 'OrderTracker', class: RetailAgents.OrderTracker, sector: 'retail', capabilities: ['order_status', 'tracking_info', 'delivery_estimate'], priority: 2 },
      { name: 'ReturnsHandler', class: RetailAgents.ReturnsHandler, sector: 'retail', capabilities: ['return_initiation', 'exchange_processing', 'refund_status'], priority: 3 },
      { name: 'ProductAdvisor', class: RetailAgents.ProductAdvisor, sector: 'retail', capabilities: ['product_recommendation', 'comparison', 'reviews'], priority: 3 },
      { name: 'InventoryChecker', class: RetailAgents.InventoryChecker, sector: 'retail', capabilities: ['stock_check', 'availability_search', 'nearby_stores'], priority: 2 },
      { name: 'PaymentProcessor', class: RetailAgents.PaymentProcessor, sector: 'retail', capabilities: ['payment_issues', 'transaction_history', 'refund_processing'], priority: 3 },
      { name: 'ShippingHelper', class: RetailAgents.ShippingHelper, sector: 'retail', capabilities: ['shipping_inquiry', 'method_selection', 'cost_estimation'], priority: 2 },
      { name: 'PromotionHelper', class: RetailAgents.PromotionHelper, sector: 'retail', capabilities: ['deal_discovery', 'coupon_application', 'promotion_info'], priority: 3 },
      { name: 'LoyaltyManager', class: RetailAgents.LoyaltyManager, sector: 'retail', capabilities: ['points_check', 'rewards_redemption', 'tier_status'], priority: 3 },
      { name: 'ComplaintResolver', class: RetailAgents.ComplaintResolver, sector: 'retail', capabilities: ['complaint_filing', 'escalation', 'resolution_tracking'], priority: 2 },
      { name: 'BulkOrders', class: RetailAgents.BulkOrders, sector: 'retail', capabilities: ['wholesale_inquiry', 'bulk_pricing', 'account_setup'], priority: 2 },
      { name: 'VIPService', class: RetailAgents.VIPService, sector: 'retail', capabilities: ['priority_support', 'exclusive_access', 'concierge'], priority: 1 },
    ];

    // Finance agents (10)
    const finance = [
      { name: 'AccountAdvisor', class: FinanceAgents.AccountAdvisor, sector: 'finance', capabilities: ['account_inquiry', 'balance_check', 'transaction_history'], priority: 3 },
      { name: 'LoanOfficer', class: FinanceAgents.LoanOfficer, sector: 'finance', capabilities: ['loan_application', 'refinance_inquiry', 'approval_status'], priority: 2 },
      { name: 'InvestmentAdvisor', class: FinanceAgents.InvestmentAdvisor, sector: 'finance', capabilities: ['portfolio_analysis', 'recommendations', 'market_updates'], priority: 2 },
      { name: 'CardServices', class: FinanceAgents.CardServices, sector: 'finance', capabilities: ['card_inquiry', 'fraud_monitoring', 'limit_adjustment'], priority: 3 },
      { name: 'FraudProtection', class: FinanceAgents.FraudProtection, sector: 'finance', capabilities: ['fraud_detection', 'dispute_filing', 'account_security'], priority: 1 },
      { name: 'MortgageSpecialist', class: FinanceAgents.MortgageSpecialist, sector: 'finance', capabilities: ['mortgage_quote', 'refinance_options', 'rate_lock'], priority: 2 },
      { name: 'InsuranceAdvisor', class: FinanceAgents.InsuranceAdvisor, sector: 'finance', capabilities: ['policy_inquiry', 'coverage_options', 'claims_processing'], priority: 2 },
      { name: 'TaxPlanner', class: FinanceAgents.TaxPlanner, sector: 'finance', capabilities: ['tax_estimate', 'strategy_planning', 'filing_guidance'], priority: 2 },
      { name: 'RetirementPlanner', class: FinanceAgents.RetirementPlanner, sector: 'finance', capabilities: ['retirement_analysis', 'planning', 'contribution_guidance'], priority: 2 },
      { name: 'BillPaymentHelper', class: FinanceAgents.BillPaymentHelper, sector: 'finance', capabilities: ['payment_scheduling', 'autopay_setup', 'payment_history'], priority: 3 },
    ];

    // Education agents (8)
    const education = [
      { name: 'AdmissionsAdvisor', class: OtherSectorAgents.AdmissionsAdvisor, sector: 'education', capabilities: ['program_info', 'application_help', 'deadline_tracking'], priority: 2 },
      { name: 'TutorMatcher', class: OtherSectorAgents.TutorMatcher, sector: 'education', capabilities: ['tutor_matching', 'skill_assessment', 'availability_check'], priority: 3 },
      { name: 'RegistrationHelper', class: OtherSectorAgents.RegistrationHelper, sector: 'education', capabilities: ['course_registration', 'schedule_planning', 'waitlist_mgmt'], priority: 2 },
      { name: 'GradeAdvisor', class: OtherSectorAgents.GradeAdvisor, sector: 'education', capabilities: ['grade_inquiry', 'transcript_request', 'academic_standing'], priority: 2 },
      { name: 'FinancialAidAdvisor', class: OtherSectorAgents.FinancialAidAdvisor, sector: 'education', capabilities: ['aid_eligibility', 'fafsa_help', 'scholarship_search'], priority: 2 },
      { name: 'CareerCoach', class: OtherSectorAgents.CareerCoach, sector: 'education', capabilities: ['career_planning', 'skill_mapping', 'job_search_help'], priority: 2 },
      { name: 'TestPrepAdvisor', class: OtherSectorAgents.TestPrepAdvisor, sector: 'education', capabilities: ['test_info', 'study_resources', 'registration_help'], priority: 3 },
      { name: 'StudentServicesAdvisor', class: OtherSectorAgents.StudentServicesAdvisor, sector: 'education', capabilities: ['service_info', 'resource_location', 'support_referral'], priority: 3 },
    ];

    // Real Estate agents (7)
    const realEstate = [
      { name: 'PropertySearcher', class: OtherSectorAgents.PropertySearcher, sector: 'real-estate', capabilities: ['property_search', 'filtering', 'listing_info'], priority: 3 },
      { name: 'MortgageCalculator', class: OtherSectorAgents.MortgageCalculator, sector: 'real-estate', capabilities: ['mortgage_calculation', 'affordability_analysis', 'rate_info'], priority: 3 },
      { name: 'HomeInspectorScheduler', class: OtherSectorAgents.HomeInspectorScheduler, sector: 'real-estate', capabilities: ['inspection_scheduling', 'report_delivery', 'follow_up'], priority: 2 },
      { name: 'TitleAgent', class: OtherSectorAgents.TitleAgent, sector: 'real-estate', capabilities: ['title_search', 'title_insurance', 'lien_check'], priority: 2 },
      { name: 'ClosingCoordinator', class: OtherSectorAgents.ClosingCoordinator, sector: 'real-estate', capabilities: ['closing_coordination', 'document_preparation', 'schedule_mgmt'], priority: 2 },
      { name: 'RentalAdvisor', class: OtherSectorAgents.RentalAdvisor, sector: 'real-estate', capabilities: ['rental_search', 'tenant_screening', 'lease_review'], priority: 3 },
      { name: 'PropertyManagementAdvisor', class: OtherSectorAgents.PropertyManagementAdvisor, sector: 'real-estate', capabilities: ['mgmt_services', 'tenant_relations', 'maintenance_coord'], priority: 2 },
    ];

    // Telecommunications agents (7)
    const telecom = [
      { name: 'TelecomBillingSupport', class: OtherSectorAgents.BillingSupport, sector: 'telecom', capabilities: ['bill_inquiry', 'payment_processing', 'dispute_resolution'], priority: 3 },
      { name: 'TechnicalSupport', class: OtherSectorAgents.TechnicalSupport, sector: 'telecom', capabilities: ['troubleshooting', 'tech_support', 'technician_dispatch'], priority: 2 },
      { name: 'PlansAndServices', class: OtherSectorAgents.PlansAndServices, sector: 'telecom', capabilities: ['plan_info', 'upgrade_advice', 'service_changes'], priority: 3 },
      { name: 'DeviceSupport', class: OtherSectorAgents.DeviceSupport, sector: 'telecom', capabilities: ['device_support', 'setup_help', 'warranty_info'], priority: 2 },
      { name: 'AccountManagement', class: OtherSectorAgents.AccountManagement, sector: 'telecom', capabilities: ['account_info', 'service_mgmt', 'profile_update'], priority: 3 },
      { name: 'MovingServiceAdvisor', class: OtherSectorAgents.MovingServiceAdvisor, sector: 'telecom', capabilities: ['service_transfer', 'disconnect_mgmt', 'reconnection'], priority: 2 },
      { name: 'LoyaltyProgram', class: OtherSectorAgents.LoyaltyProgram, sector: 'telecom', capabilities: ['points_tracking', 'rewards_redemption', 'tier_benefits'], priority: 3 },
    ];

    // Government agents (6)
    const government = [
      { name: 'LicenseIssuanceAdvisor', class: RegulatoryAgents.LicenseIssuanceAdvisor, sector: 'government', capabilities: ['license_info', 'application_help', 'status_tracking'], priority: 2 },
      { name: 'PermitHelper', class: RegulatoryAgents.PermitHelper, sector: 'government', capabilities: ['permit_info', 'application_assist', 'requirement_check'], priority: 2 },
      { name: 'BenefitsNavigator', class: RegulatoryAgents.BenefitsNavigator, sector: 'government', capabilities: ['eligibility_check', 'application_help', 'status_tracking'], priority: 2 },
      { name: 'TaxAssistant', class: RegulatoryAgents.TaxAssistant, sector: 'government', capabilities: ['tax_info', 'filing_help', 'deduction_guidance'], priority: 2 },
      { name: 'CaseManagementAdvisor', class: RegulatoryAgents.CaseManagementAdvisor, sector: 'government', capabilities: ['case_tracking', 'document_mgmt', 'hearing_scheduling'], priority: 2 },
      { name: 'PublicRecordsHelper', class: RegulatoryAgents.PublicRecordsHelper, sector: 'government', capabilities: ['records_search', 'retrieval', 'certification'], priority: 3 },
    ];

    // Utilities agents (5)
    const utilities = [
      { name: 'UtilityBillPayment', class: RegulatoryAgents.BillPaymentAdvisor, sector: 'utilities', capabilities: ['bill_payment', 'autopay_setup', 'payment_history'], priority: 3 },
      { name: 'ServiceRequestAdvisor', class: RegulatoryAgents.ServiceRequestAdvisor, sector: 'utilities', capabilities: ['service_request', 'scheduling', 'status_tracking'], priority: 2 },
      { name: 'OutageReportingAgent', class: RegulatoryAgents.OutageReportingAgent, sector: 'utilities', capabilities: ['outage_report', 'status_update', 'compensation'], priority: 1 },
      { name: 'EnergyAuditAdvisor', class: RegulatoryAgents.EnergyAuditAdvisor, sector: 'utilities', capabilities: ['audit_scheduling', 'recommendations', 'rebate_info'], priority: 2 },
      { name: 'ConsumerAdvocate', class: RegulatoryAgents.ConsumerAdvocate, sector: 'utilities', capabilities: ['dispute_resolution', 'consumer_protection', 'complaint_filing'], priority: 2 },
    ];

    // Legal agents (4)
    const legal = [
      { name: 'DocumentReviewAdvisor', class: RegulatoryAgents.DocumentReviewAdvisor, sector: 'legal', capabilities: ['document_review', 'legal_analysis', 'advice'], priority: 2 },
      { name: 'LegalConsultationAdvisor', class: RegulatoryAgents.LegalConsultationAdvisor, sector: 'legal', capabilities: ['consultation', 'legal_advice', 'strategy'], priority: 2 },
      { name: 'CaseStatusTracker', class: RegulatoryAgents.CaseStatusTracker, sector: 'legal', capabilities: ['status_tracking', 'update_notification', 'milestone_alert'], priority: 2 },
      { name: 'ContractAssistant', class: RegulatoryAgents.ContractAssistant, sector: 'legal', capabilities: ['contract_review', 'drafting', 'negotiation_support'], priority: 2 },
    ];

    // Energy agents (7)
    const energy = [
      { name: 'UtilityBillingAgent', class: RegulatoryAgents.UtilityBillingAgent, sector: 'energy', capabilities: ['billing_inquiry', 'payment_processing', 'account_mgmt'], priority: 3 },
      { name: 'EnergyConsultant', class: RegulatoryAgents.EnergyConsultant, sector: 'energy', capabilities: ['efficiency_rec', 'analysis', 'savings_estimate'], priority: 2 },
      { name: 'GridMaintenanceAdvisor', class: RegulatoryAgents.GridMaintenanceAdvisor, sector: 'energy', capabilities: ['maintenance_info', 'outage_notice', 'compensation'], priority: 2 },
      { name: 'SolarAdvisor', class: RegulatoryAgents.SolarAdvisor, sector: 'energy', capabilities: ['solar_assessment', 'system_design', 'incentive_info'], priority: 2 },
      { name: 'RenewableEnergyAdvisor', class: RegulatoryAgents.RenewableEnergyAdvisor, sector: 'energy', capabilities: ['renewable_options', 'incentives', 'comparison'], priority: 2 },
      { name: 'PowerOutageAdvisor', class: RegulatoryAgents.PowerOutageAdvisor, sector: 'energy', capabilities: ['outage_report', 'status_update', 'compensation'], priority: 1 },
      { name: 'DemandResponseProgram', class: RegulatoryAgents.DemandResponseProgram, sector: 'energy', capabilities: ['program_enrollment', 'benefit_info', 'status_check'], priority: 2 },
    ];

    // Register all agents
    const allAgentArrays = [
      { agents: healthcare, sector: 'healthcare' },
      { agents: retail, sector: 'retail' },
      { agents: finance, sector: 'finance' },
      { agents: education, sector: 'education' },
      { agents: realEstate, sector: 'real-estate' },
      { agents: telecom, sector: 'telecom' },
      { agents: government, sector: 'government' },
      { agents: utilities, sector: 'utilities' },
      { agents: legal, sector: 'legal' },
      { agents: energy, sector: 'energy' },
    ];

    let totalRegistered = 0;
    const stats = {};

    for (const { agents, sector } of allAgentArrays) {
      stats[sector] = 0;
      for (const agent of agents) {
        try {
          registry.registerAgent(agent.name, agent.class, {
            name: agent.name.replace(/([A-Z])/g, ' $1').trim(),
            sector: agent.sector,
            capabilities: agent.capabilities,
            priority: agent.priority,
            maxConcurrentCalls: 10 + (agent.priority * 5),
          });
          totalRegistered++;
          stats[sector]++;
        } catch (error) {
          logger.error(`Failed to register ${agent.name}:`, error.message);
        }
      }
    }

    logger.info(`✅ Agent Registration Complete: ${totalRegistered} agents registered`);
    logger.info(`📊 Sector Breakdown:`, stats);
    logger.info(`🎯 Total Sectors: ${Object.keys(stats).length}`);

    return registry;
  } catch (error) {
    logger.error('❌ Agent initialization failed:', error);
    throw error;
  }
}

/**
 * Get initialized registry
 */
function getRegistry() {
  return registry;
}

module.exports = {
  initializeAgents,
  getRegistry,
  registry,
};
