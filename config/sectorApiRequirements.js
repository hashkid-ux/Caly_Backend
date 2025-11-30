// Backend/config/sectorApiRequirements.js - API requirements mapping per sector
// ✅ PHASE 8: Defines which API credentials each sector needs

const SECTOR_API_REQUIREMENTS = {
  ecommerce: {
    name: 'E-Commerce & D2C',
    description: 'Online stores, D2C brands, marketplaces',
    required_apis: ['shopify', 'exotel'],
    optional_apis: ['stripe', 'shipment_tracking', 'inventory_management'],
    fields: {
      shopify_store_url: {
        type: 'text',
        label: 'Shopify Store URL',
        placeholder: 'your-store.myshopify.com',
        required: true,
        validation: /^[a-z0-9-]+\.myshopify\.com$/i,
      },
      shopify_api_key: {
        type: 'password',
        label: 'Shopify API Key',
        placeholder: 'Enter your API key',
        required: true,
      },
      shopify_access_token: {
        type: 'password',
        label: 'Shopify Access Token',
        placeholder: 'Enter your access token',
        required: true,
      },
      exotel_number: {
        type: 'text',
        label: 'Exotel Phone Number',
        placeholder: '+91XXXXXXXXXX',
        required: true,
      },
      exotel_sid: {
        type: 'text',
        label: 'Exotel SID',
        placeholder: 'Enter your SID',
        required: true,
      },
      exotel_token: {
        type: 'password',
        label: 'Exotel Token',
        placeholder: 'Enter your token',
        required: true,
      },
    }
  },

  healthcare: {
    name: 'Healthcare & Clinics',
    description: 'Hospitals, clinics, medical practices',
    required_apis: ['emr', 'hipaa_compliance', 'exotel'],
    optional_apis: ['prescription_db', 'telehealth_platform'],
    fields: {
      emr_provider: {
        type: 'select',
        label: 'EMR Provider',
        options: ['epic', 'cerner', 'meditech', 'allscripts', 'athenahealth'],
        required: true,
      },
      emr_api_url: {
        type: 'text',
        label: 'EMR API URL',
        placeholder: 'https://api.emr-provider.com/v1',
        required: true,
      },
      emr_username: {
        type: 'text',
        label: 'EMR Username',
        placeholder: 'Enter username',
        required: true,
      },
      emr_password: {
        type: 'password',
        label: 'EMR Password',
        placeholder: 'Enter password',
        required: true,
      },
      practice_id: {
        type: 'text',
        label: 'Practice ID',
        placeholder: 'Enter your practice ID',
        required: true,
      },
      hipaa_enabled: {
        type: 'checkbox',
        label: 'Enable HIPAA Compliance',
        required: true,
      },
      exotel_number: {
        type: 'text',
        label: 'Exotel Phone Number',
        placeholder: '+91XXXXXXXXXX',
        required: true,
      },
      exotel_sid: {
        type: 'text',
        label: 'Exotel SID',
        required: true,
      },
      exotel_token: {
        type: 'password',
        label: 'Exotel Token',
        required: true,
      },
    }
  },

  realestate: {
    name: 'Real Estate & Properties',
    description: 'Property agents, brokers, management companies',
    required_apis: ['mls', 'exotel'],
    optional_apis: ['zillow_api', 'video_tour_platform', 'property_management'],
    fields: {
      mls_api_key: {
        type: 'password',
        label: 'MLS API Key',
        placeholder: 'Enter your API key',
        required: true,
      },
      mls_username: {
        type: 'text',
        label: 'MLS Username',
        placeholder: 'Enter username',
        required: true,
      },
      mls_board_id: {
        type: 'text',
        label: 'MLS Board ID',
        placeholder: 'Enter your board ID',
        required: true,
      },
      exotel_number: {
        type: 'text',
        label: 'Exotel Phone Number',
        required: true,
      },
      exotel_sid: {
        type: 'text',
        label: 'Exotel SID',
        required: true,
      },
      exotel_token: {
        type: 'password',
        label: 'Exotel Token',
        required: true,
      },
    }
  },

  fintech: {
    name: 'FinTech & Banking',
    description: 'Banks, fintech companies, payment providers',
    required_apis: ['stripe', 'banking_api', 'kyc_provider', 'exotel'],
    optional_apis: ['compliance_monitoring', 'fraud_detection'],
    fields: {
      stripe_api_key: {
        type: 'password',
        label: 'Stripe API Key',
        placeholder: 'pk_live_...',
        required: true,
      },
      stripe_secret_key: {
        type: 'password',
        label: 'Stripe Secret Key',
        placeholder: 'sk_live_...',
        required: true,
      },
      bank_api_token: {
        type: 'password',
        label: 'Banking API Token',
        placeholder: 'Enter your token',
        required: true,
      },
      kyc_provider: {
        type: 'select',
        label: 'KYC Provider',
        options: ['aadhaar', 'pan', 'passport', 'driving_license'],
        required: true,
      },
      exotel_number: {
        type: 'text',
        label: 'Exotel Phone Number',
        required: true,
      },
      exotel_sid: {
        type: 'text',
        label: 'Exotel SID',
        required: true,
      },
      exotel_token: {
        type: 'password',
        label: 'Exotel Token',
        required: true,
      },
    }
  },

  hospitality: {
    name: 'Hotels & Restaurants',
    description: 'Hotels, resorts, restaurants, cafes',
    required_apis: ['booking_system', 'exotel'],
    optional_apis: ['property_management', 'review_management', 'loyalty_program'],
    fields: {
      booking_api_key: {
        type: 'password',
        label: 'Booking System API Key',
        placeholder: 'Enter your API key',
        required: true,
      },
      booking_provider: {
        type: 'select',
        label: 'Booking Provider',
        options: ['booking_com', 'airbnb', 'google_hotel', 'custom'],
        required: true,
      },
      property_id: {
        type: 'text',
        label: 'Property ID',
        placeholder: 'Enter your property ID',
        required: true,
      },
      exotel_number: {
        type: 'text',
        label: 'Exotel Phone Number',
        required: true,
      },
      exotel_sid: {
        type: 'text',
        label: 'Exotel SID',
        required: true,
      },
      exotel_token: {
        type: 'password',
        label: 'Exotel Token',
        required: true,
      },
    }
  },

  logistics: {
    name: 'Logistics & Delivery',
    description: 'Courier companies, last-mile delivery, fleet management',
    required_apis: ['shipment_tracking', 'gps_mapping', 'exotel'],
    optional_apis: ['fleet_management', 'route_optimization'],
    fields: {
      shipment_api_key: {
        type: 'password',
        label: 'Shipment Tracking API Key',
        required: true,
      },
      gps_api_key: {
        type: 'password',
        label: 'GPS Mapping API Key',
        required: true,
      },
      exotel_number: {
        type: 'text',
        label: 'Exotel Phone Number',
        required: true,
      },
      exotel_sid: {
        type: 'text',
        label: 'Exotel SID',
        required: true,
      },
      exotel_token: {
        type: 'password',
        label: 'Exotel Token',
        required: true,
      },
    }
  },

  education: {
    name: 'Education & EdTech',
    description: 'Schools, colleges, universities, online learning platforms',
    required_apis: ['lms_api', 'student_database', 'exotel'],
    optional_apis: ['exam_platform', 'assessment_tool'],
    fields: {
      lms_provider: {
        type: 'select',
        label: 'LMS Provider',
        options: ['moodle', 'canvas', 'blackboard', 'schoology', 'custom'],
        required: true,
      },
      lms_api_url: {
        type: 'text',
        label: 'LMS API URL',
        required: true,
      },
      lms_api_key: {
        type: 'password',
        label: 'LMS API Key',
        required: true,
      },
      student_db_url: {
        type: 'text',
        label: 'Student Database URL',
        required: true,
      },
      exotel_number: {
        type: 'text',
        label: 'Exotel Phone Number',
        required: true,
      },
      exotel_sid: {
        type: 'text',
        label: 'Exotel SID',
        required: true,
      },
      exotel_token: {
        type: 'password',
        label: 'Exotel Token',
        required: true,
      },
    }
  },

  government: {
    name: 'Government & Public',
    description: 'Government agencies, municipalities, public services',
    required_apis: ['citizen_portal', 'compliance_tracking', 'exotel'],
    optional_apis: ['aadhar_verification', 'digital_signature'],
    fields: {
      citizen_portal_url: {
        type: 'text',
        label: 'Citizen Portal URL',
        required: true,
      },
      citizen_portal_key: {
        type: 'password',
        label: 'Portal API Key',
        required: true,
      },
      compliance_module: {
        type: 'select',
        label: 'Compliance Module',
        options: ['rti', 'rti_plus', 'pg_sys', 'citizen_portal'],
        required: true,
      },
      exotel_number: {
        type: 'text',
        label: 'Exotel Phone Number',
        required: true,
      },
      exotel_sid: {
        type: 'text',
        label: 'Exotel SID',
        required: true,
      },
      exotel_token: {
        type: 'password',
        label: 'Exotel Token',
        required: true,
      },
    }
  },

  telecom: {
    name: 'Telecom & Utilities',
    description: 'Telecom providers, ISPs, utility companies',
    required_apis: ['telecom_provider_api', 'exotel'],
    optional_apis: ['billing_system', 'network_monitoring'],
    fields: {
      telecom_provider: {
        type: 'select',
        label: 'Telecom Provider',
        options: ['jio', 'airtel', 'vodafone', 'bsnl', 'custom'],
        required: true,
      },
      provider_api_key: {
        type: 'password',
        label: 'Provider API Key',
        required: true,
      },
      billing_api_url: {
        type: 'text',
        label: 'Billing System URL',
        required: true,
      },
      exotel_number: {
        type: 'text',
        label: 'Exotel Phone Number',
        required: true,
      },
      exotel_sid: {
        type: 'text',
        label: 'Exotel SID',
        required: true,
      },
      exotel_token: {
        type: 'password',
        label: 'Exotel Token',
        required: true,
      },
    }
  },

  saas: {
    name: 'SaaS & Software',
    description: 'B2B software, platforms, developer tools',
    required_apis: ['stripe', 'saas_platform_api', 'exotel'],
    optional_apis: ['slack_integration', 'github_api', 'jira_api'],
    fields: {
      stripe_api_key: {
        type: 'password',
        label: 'Stripe API Key',
        required: true,
      },
      stripe_secret_key: {
        type: 'password',
        label: 'Stripe Secret Key',
        required: true,
      },
      platform_api_url: {
        type: 'text',
        label: 'Platform API URL',
        required: true,
      },
      platform_api_key: {
        type: 'password',
        label: 'Platform API Key',
        required: true,
      },
      exotel_number: {
        type: 'text',
        label: 'Exotel Phone Number',
        required: true,
      },
      exotel_sid: {
        type: 'text',
        label: 'Exotel SID',
        required: true,
      },
      exotel_token: {
        type: 'password',
        label: 'Exotel Token',
        required: true,
      },
    }
  },
};

module.exports = SECTOR_API_REQUIREMENTS;
