/**
 * Report Generator Service
 * Phase 7: Advanced Analytics & Performance Optimization
 * 
 * Generates reports in multiple formats (JSON, CSV, PDF, XLSX)
 */

const logger = require('../utils/logger');

/**
 * ReportGenerator Service
 * Handles report generation and formatting for multiple export types
 */
class ReportGenerator {

  /**
   * Generate performance report
   */
  static generatePerformanceReport(data) {
    try {
      const report = {
        title: 'Performance Report',
        generatedAt: new Date(),
        summary: {
          totalAgents: data.totalAgents || 0,
          averageACW: data.averageACW || 0,
          averageHandleTime: data.averageHandleTime || 0,
          firstCallResolution: data.firstCallResolution || 0,
          abandonmentRate: data.abandonmentRate || 0
        },
        agents: data.agents || [],
        trends: data.trends || [],
        recommendations: this._generateRecommendations(data)
      };

      logger.debug('Performance report generated', {
        agentCount: report.summary.totalAgents
      });

      return report;
    } catch (error) {
      logger.error('Error generating performance report', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate quality report
   */
  static generateQualityReport(data) {
    try {
      const report = {
        title: 'Quality Report',
        generatedAt: new Date(),
        summary: {
          averageQualityScore: data.averageQualityScore || 0,
          auditedCalls: data.auditedCalls || 0,
          complianceRate: data.complianceRate || 0,
          criticalIssues: data.criticalIssues || 0,
          minorIssues: data.minorIssues || 0
        },
        scores: data.scores || [],
        issues: data.issues || [],
        actionItems: this._generateQualityActions(data)
      };

      logger.debug('Quality report generated', {
        auditedCalls: report.summary.auditedCalls
      });

      return report;
    } catch (error) {
      logger.error('Error generating quality report', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate satisfaction report
   */
  static generateSatisfactionReport(data) {
    try {
      const report = {
        title: 'Customer Satisfaction Report',
        generatedAt: new Date(),
        summary: {
          csat: data.csat || 0,
          nps: data.nps || 0,
          sentimentScore: data.sentimentScore || 0,
          totalSurveys: data.totalSurveys || 0,
          responseRate: data.responseRate || 0
        },
        scores: data.scores || [],
        feedback: data.feedback || [],
        trends: data.trends || []
      };

      logger.debug('Satisfaction report generated', {
        totalSurveys: report.summary.totalSurveys
      });

      return report;
    } catch (error) {
      logger.error('Error generating satisfaction report', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate financial report
   */
  static generateFinancialReport(data) {
    try {
      const report = {
        title: 'Financial Report',
        generatedAt: new Date(),
        summary: {
          totalRevenue: data.totalRevenue || 0,
          totalCosts: data.totalCosts || 0,
          profitMargin: data.profitMargin || 0,
          roiPercentage: data.roiPercentage || 0,
          revenuePerCall: data.revenuePerCall || 0
        },
        breakdown: {
          byAgent: data.byAgent || [],
          bySector: data.bySector || [],
          byCostType: data.byCostType || []
        },
        trends: data.trends || []
      };

      logger.debug('Financial report generated', {
        totalRevenue: report.summary.totalRevenue
      });

      return report;
    } catch (error) {
      logger.error('Error generating financial report', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate comprehensive report
   */
  static generateComprehensiveReport(data) {
    try {
      const report = {
        title: 'Comprehensive Analytics Report',
        generatedAt: new Date(),
        period: data.period || 'Monthly',
        summary: {
          totalAgents: data.totalAgents || 0,
          totalCalls: data.totalCalls || 0,
          totalRevenue: data.totalRevenue || 0,
          avgQualityScore: data.avgQualityScore || 0,
          customerSatisfaction: data.customerSatisfaction || 0
        },
        performance: data.performance || {},
        quality: data.quality || {},
        satisfaction: data.satisfaction || {},
        financial: data.financial || {},
        predictions: data.predictions || {},
        keyMetrics: this._extractKeyMetrics(data),
        recommendations: this._generateComprehensiveRecommendations(data)
      };

      logger.debug('Comprehensive report generated', {
        totalCalls: report.summary.totalCalls
      });

      return report;
    } catch (error) {
      logger.error('Error generating comprehensive report', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Format report as CSV
   */
  static formatAsCSV(report) {
    try {
      let csv = `${report.title}\n`;
      csv += `Generated: ${report.generatedAt}\n\n`;

      // Summary section
      csv += 'SUMMARY\n';
      if (report.summary) {
        Object.entries(report.summary).forEach(([key, value]) => {
          csv += `"${key}","${value}"\n`;
        });
      }

      csv += '\n';

      // Details section
      if (Array.isArray(report.agents)) {
        csv += 'AGENTS\n';
        csv += '"Agent ID","Performance","Quality","Satisfaction"\n';
        report.agents.forEach(agent => {
          csv += `"${agent.id}","${agent.performance}","${agent.quality}","${agent.satisfaction}"\n`;
        });
      }

      logger.debug('Report formatted as CSV', {
        lines: csv.split('\n').length
      });

      return csv;
    } catch (error) {
      logger.error('Error formatting report as CSV', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Format report as JSON
   */
  static formatAsJSON(report) {
    try {
      logger.debug('Report formatted as JSON', {
        size: JSON.stringify(report).length
      });
      return JSON.stringify(report, null, 2);
    } catch (error) {
      logger.error('Error formatting report as JSON', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Format report as plain text
   */
  static formatAsText(report) {
    try {
      let text = `${report.title}\n`;
      text += `Generated: ${report.generatedAt}\n`;
      text += '='.repeat(80) + '\n\n';

      // Summary
      text += 'SUMMARY\n';
      text += '-'.repeat(80) + '\n';
      if (report.summary) {
        Object.entries(report.summary).forEach(([key, value]) => {
          text += `${key.padEnd(30)}: ${value}\n`;
        });
      }

      text += '\n';

      // Details
      if (report.agents) {
        text += 'AGENTS PERFORMANCE\n';
        text += '-'.repeat(80) + '\n';
        report.agents.forEach(agent => {
          text += `\nAgent: ${agent.id}\n`;
          text += `  Performance: ${agent.performance}\n`;
          text += `  Quality: ${agent.quality}\n`;
          text += `  Satisfaction: ${agent.satisfaction}\n`;
        });
      }

      logger.debug('Report formatted as text', {
        lines: text.split('\n').length
      });

      return text;
    } catch (error) {
      logger.error('Error formatting report as text', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Format report as HTML
   */
  static formatAsHTML(report) {
    try {
      let html = `<!DOCTYPE html>
<html>
<head>
  <title>${report.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
  </style>
</head>
<body>
  <h1>${report.title}</h1>
  <p>Generated: ${report.generatedAt}</p>
`;

      // Summary table
      if (report.summary) {
        html += '<div class="summary"><h2>Summary</h2><table><tr><th>Metric</th><th>Value</th></tr>';
        Object.entries(report.summary).forEach(([key, value]) => {
          html += `<tr><td>${key}</td><td>${value}</td></tr>`;
        });
        html += '</table></div>';
      }

      // Agents table
      if (report.agents && report.agents.length > 0) {
        html += '<h2>Agents</h2><table><tr><th>ID</th><th>Performance</th><th>Quality</th><th>Satisfaction</th></tr>';
        report.agents.forEach(agent => {
          html += `<tr><td>${agent.id}</td><td>${agent.performance}</td><td>${agent.quality}</td><td>${agent.satisfaction}</td></tr>`;
        });
        html += '</table>';
      }

      html += '</body></html>';

      logger.debug('Report formatted as HTML', {
        size: html.length
      });

      return html;
    } catch (error) {
      logger.error('Error formatting report as HTML', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate recommendations based on data
   * @private
   */
  static _generateRecommendations(data) {
    const recommendations = [];

    if (data.averageHandleTime > 300) {
      recommendations.push({
        type: 'training',
        priority: 'high',
        description: 'Handle time exceeds 5 minutes. Consider quality review training.'
      });
    }

    if (data.abandonmentRate > 0.05) {
      recommendations.push({
        type: 'staffing',
        priority: 'high',
        description: 'Abandonment rate above 5%. Consider increasing staff.'
      });
    }

    if (data.firstCallResolution < 0.85) {
      recommendations.push({
        type: 'training',
        priority: 'medium',
        description: 'FCR below 85%. Implement process improvement training.'
      });
    }

    return recommendations;
  }

  /**
   * Generate quality action items
   * @private
   */
  static _generateQualityActions(data) {
    const actions = [];

    if (data.criticalIssues > 0) {
      actions.push({
        priority: 'critical',
        action: 'Address critical quality issues immediately',
        count: data.criticalIssues
      });
    }

    if (data.complianceRate < 0.95) {
      actions.push({
        priority: 'high',
        action: 'Implement compliance improvement program',
        target: '95% compliance'
      });
    }

    return actions;
  }

  /**
   * Extract key metrics from comprehensive data
   * @private
   */
  static _extractKeyMetrics(data) {
    return {
      topPerformer: data.topPerformer || { id: 'N/A', score: 0 },
      lowestPerformer: data.lowestPerformer || { id: 'N/A', score: 0 },
      highestRevenue: data.highestRevenue || 0,
      bestCustomerSatisfaction: data.bestCustomerSatisfaction || 0,
      mostCommonIssue: data.mostCommonIssue || 'N/A'
    };
  }

  /**
   * Generate comprehensive recommendations
   * @private
   */
  static _generateComprehensiveRecommendations(data) {
    const recommendations = [];

    // Performance recommendations
    if (data.avgQualityScore < 85) {
      recommendations.push({
        category: 'Quality',
        priority: 'high',
        recommendation: 'Launch quality improvement initiative'
      });
    }

    // Satisfaction recommendations
    if (data.customerSatisfaction < 75) {
      recommendations.push({
        category: 'Satisfaction',
        priority: 'high',
        recommendation: 'Analyze customer feedback and implement improvements'
      });
    }

    // Financial recommendations
    if (data.profitMargin < 0.3) {
      recommendations.push({
        category: 'Financial',
        priority: 'medium',
        recommendation: 'Review cost structure and optimize operations'
      });
    }

    return recommendations;
  }
}

module.exports = ReportGenerator;
