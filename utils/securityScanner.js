/**
 * Dependency Vulnerability Scanner
 * Checks npm dependencies for known vulnerabilities
 * Integrated with CI/CD for automated security checks
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Vulnerability severity levels
 */
const VulnerabilitySeverity = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MODERATE: 'MODERATE',
  LOW: 'LOW',
};

/**
 * Run npm audit to check for vulnerabilities
 */
const runNpmAudit = (options = {}) => {
  const {
    auditLevel = 'moderate', // moderate, high, critical
    json = true,
    throwOnVulnerabilities = false,
  } = options;

  try {
    const command = `npm audit ${json ? '--json' : ''} --audit-level=${auditLevel}`;

    logger.info('Running npm audit...', { command });

    const output = execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

    if (json) {
      try {
        return JSON.parse(output);
      } catch (error) {
        logger.error('Failed to parse npm audit JSON output', { error: error.message });
        return null;
      }
    }

    return output;
  } catch (error) {
    // npm audit exits with non-zero code if vulnerabilities found
    if (error.stdout) {
      try {
        const output = JSON.parse(error.stdout);
        if (throwOnVulnerabilities && output.vulnerabilities) {
          throw new Error(`npm audit found vulnerabilities: ${JSON.stringify(output.vulnerabilities)}`);
        }
        return output;
      } catch (parseError) {
        logger.error('Failed to parse npm audit output', { error: parseError.message });
        return null;
      }
    }

    throw error;
  }
};

/**
 * Parse npm audit results
 */
const parseAuditResults = (auditOutput) => {
  if (!auditOutput || !auditOutput.vulnerabilities) {
    return {
      totalVulnerabilities: 0,
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      vulnerabilities: [],
    };
  }

  const summary = {
    critical: auditOutput.metadata?.vulnerabilities?.critical || 0,
    high: auditOutput.metadata?.vulnerabilities?.high || 0,
    moderate: auditOutput.metadata?.vulnerabilities?.moderate || 0,
    low: auditOutput.metadata?.vulnerabilities?.low || 0,
  };

  const totalVulnerabilities =
    summary.critical + summary.high + summary.moderate + summary.low;

  // Extract vulnerability details
  const vulnerabilities = [];
  for (const [packageName, vulnData] of Object.entries(auditOutput.vulnerabilities)) {
    if (vulnData.via) {
      for (const vulnerability of vulnData.via) {
        vulnerabilities.push({
          package: packageName,
          severity: vulnerability.severity || 'UNKNOWN',
          title: vulnerability.title || 'Unknown vulnerability',
          url: vulnerability.url || '',
          range: vulnData.range || '',
          fixAvailable: vulnData.fixAvailable ? 'Yes' : 'No',
        });
      }
    }
  }

  return {
    totalVulnerabilities,
    ...summary,
    vulnerabilities,
    auditMetadata: auditOutput.metadata,
  };
};

/**
 * Generate vulnerability report
 */
const generateVulnerabilityReport = (auditResults) => {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: auditResults.totalVulnerabilities,
      critical: auditResults.critical,
      high: auditResults.high,
      moderate: auditResults.moderate,
      low: auditResults.low,
    },
    status:
      auditResults.critical > 0
        ? 'FAILED'
        : auditResults.high > 0
        ? 'WARNING'
        : 'PASSED',
    vulnerabilities: auditResults.vulnerabilities,
    recommendations: generateRecommendations(auditResults),
  };

  return report;
};

/**
 * Generate remediation recommendations
 */
const generateRecommendations = (auditResults) => {
  const recommendations = [];

  if (auditResults.totalVulnerabilities === 0) {
    recommendations.push('No vulnerabilities detected. Dependencies are secure.');
    return recommendations;
  }

  if (auditResults.critical > 0) {
    recommendations.push(
      `❌ CRITICAL: ${auditResults.critical} critical vulnerability/ies found. Update immediately.`
    );
  }

  if (auditResults.high > 0) {
    recommendations.push(
      `⚠️ HIGH: ${auditResults.high} high severity vulnerability/ies found. Update soon.`
    );
  }

  if (auditResults.moderate > 0) {
    recommendations.push(
      `⚠️ MODERATE: ${auditResults.moderate} moderate vulnerability/ies found. Review and plan updates.`
    );
  }

  if (auditResults.vulnerabilities.some((v) => v.fixAvailable === 'Yes')) {
    recommendations.push('💡 Tip: Many vulnerabilities have fixes available. Run "npm audit fix".`');
  }

  recommendations.push('📖 Review each vulnerability at the provided URL for details.');

  return recommendations;
};

/**
 * Check for outdated dependencies
 */
const checkOutdatedDependencies = (options = {}) => {
  const { json = true } = options;

  try {
    const command = `npm outdated ${json ? '--json' : ''}`;

    logger.info('Checking for outdated dependencies...', { command });

    try {
      const output = execSync(command, { encoding: 'utf-8' });

      if (json) {
        return JSON.parse(output);
      }

      return output;
    } catch (error) {
      // npm outdated exits with code 1 if outdated packages found
      if (error.stdout) {
        if (json) {
          return JSON.parse(error.stdout);
        }
        return error.stdout;
      }

      return null;
    }
  } catch (error) {
    logger.error('Failed to check outdated dependencies', {
      error: error.message,
    });
    return null;
  }
};

/**
 * Parse outdated dependencies
 */
const parseOutdatedDependencies = (outdatedOutput) => {
  if (!outdatedOutput || typeof outdatedOutput !== 'object') {
    return [];
  }

  const outdated = [];

  for (const [packageName, versionInfo] of Object.entries(outdatedOutput)) {
    outdated.push({
      package: packageName,
      current: versionInfo.current,
      wanted: versionInfo.wanted,
      latest: versionInfo.latest,
      location: versionInfo.location,
      type: versionInfo.type,
    });
  }

  return outdated;
};

/**
 * Security scanning middleware
 * Runs periodic security checks
 */
const createSecurityScanSchedule = (intervalMs = 86400000) => {
  // Default: 24 hours
  const interval = setInterval(async () => {
    logger.info('Running scheduled security scan...');

    try {
      const auditOutput = runNpmAudit({ json: true, throwOnVulnerabilities: false });

      if (auditOutput) {
        const results = parseAuditResults(auditOutput);
        const report = generateVulnerabilityReport(results);

        // Log report
        if (results.critical > 0) {
          logger.error('Security scan found CRITICAL vulnerabilities', report);
        } else if (results.high > 0) {
          logger.warn('Security scan found HIGH severity vulnerabilities', report);
        } else {
          logger.info('Security scan completed', report);
        }

        // Save report to file
        const reportFile = path.join(
          process.cwd(),
          '.security-scan',
          `report-${Date.now()}.json`
        );
        fs.mkdirSync(path.dirname(reportFile), { recursive: true });
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      }
    } catch (error) {
      logger.error('Security scan failed', { error: error.message });
    }
  }, intervalMs);

  return {
    stop: () => clearInterval(interval),
    runNow: () => {
      clearInterval(interval);
      // Re-run immediately
      return runNpmAudit({ json: true, throwOnVulnerabilities: false });
    },
  };
};

/**
 * Generate dependency report
 */
const generateDependencyReport = () => {
  const packageJsonPath = path.join(process.cwd(), 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    logger.error('package.json not found');
    return null;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

  return {
    timestamp: new Date().toISOString(),
    app: {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
    },
    dependencies: {
      production: Object.keys(packageJson.dependencies || {}).length,
      development: Object.keys(packageJson.devDependencies || {}).length,
      total: (Object.keys(packageJson.dependencies || {})).length +
        (Object.keys(packageJson.devDependencies || {})).length,
    },
    packages: {
      production: packageJson.dependencies || {},
      development: packageJson.devDependencies || {},
    },
  };
};

/**
 * CI/CD integration endpoint
 */
const createSecurityReportRoute = (router = null) => {
  const handler = async (req, res) => {
    try {
      const auditOutput = runNpmAudit({ json: true, throwOnVulnerabilities: false });

      if (!auditOutput) {
        return res.status(500).json({
          error: 'Failed to run npm audit',
        });
      }

      const results = parseAuditResults(auditOutput);
      const report = generateVulnerabilityReport(results);

      res.json(report);
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  };

  if (router) {
    router.get('/admin/security-report', handler);
    return router;
  }

  return handler;
};

module.exports = {
  // Constants
  VulnerabilitySeverity,

  // Scanning functions
  runNpmAudit,
  parseAuditResults,
  checkOutdatedDependencies,
  parseOutdatedDependencies,
  generateVulnerabilityReport,
  generateRecommendations,
  generateDependencyReport,

  // Scheduling
  createSecurityScanSchedule,

  // Endpoint
  createSecurityReportRoute,
};
