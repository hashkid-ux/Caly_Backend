/**
 * Database Migration for Teams Management System
 * 
 * Creates 3 new tables:
 * 1. teams - Main team records
 * 2. team_members - Team membership records
 * 3. team_agent_assignments - Agent assignments to team members
 * 4. team_performance - Performance metrics tracking
 */

const db = require('../db');

/**
 * Run all migrations
 */
async function runMigrations() {
  try {
    console.log('🔄 Starting database migrations...');

    // Migration 1: Create teams table
    await createTeamsTable();
    console.log('✅ Teams table created');

    // Migration 2: Create team_members table
    await createTeamMembersTable();
    console.log('✅ Team members table created');

    // Migration 3: Create team_agent_assignments table
    await createTeamAgentAssignmentsTable();
    console.log('✅ Team agent assignments table created');

    // Migration 4: Create team_performance table
    await createTeamPerformanceTable();
    console.log('✅ Team performance table created');

    // Migration 5: Add indexes
    await createIndexes();
    console.log('✅ Indexes created');

    console.log('✨ All migrations completed successfully!');
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Create teams table
 */
async function createTeamsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS teams (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      sector ENUM(
        'healthcare', 'ecommerce', 'logistics', 'fintech', 'support',
        'telecom', 'realestate', 'government', 'education', 'travel', 'saas'
      ) NOT NULL,
      lead_id INT NOT NULL,
      description TEXT,
      status ENUM('active', 'inactive') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      
      INDEX idx_sector (sector),
      INDEX idx_status (status),
      INDEX idx_lead_id (lead_id),
      CONSTRAINT fk_teams_lead FOREIGN KEY (lead_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  return db.query(sql);
}

/**
 * Create team_members table
 */
async function createTeamMembersTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS team_members (
      id INT PRIMARY KEY AUTO_INCREMENT,
      team_id INT NOT NULL,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      role ENUM('lead', 'senior', 'member', 'trainee') DEFAULT 'member',
      performance_score INT DEFAULT 0,
      avg_rating DECIMAL(3, 2) DEFAULT 0,
      calls_this_week INT DEFAULT 0,
      trend_percent INT DEFAULT 0,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      
      INDEX idx_team_id (team_id),
      INDEX idx_user_id (user_id),
      INDEX idx_role (role),
      CONSTRAINT fk_team_members_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      CONSTRAINT fk_team_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_team_user (team_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  return db.query(sql);
}

/**
 * Create team_agent_assignments table
 */
async function createTeamAgentAssignmentsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS team_agent_assignments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      team_member_id INT NOT NULL,
      agent_id VARCHAR(255) NOT NULL,
      proficiency_level INT DEFAULT 80,
      calls_handled INT DEFAULT 0,
      success_rate DECIMAL(5, 2) DEFAULT 0,
      last_used TIMESTAMP,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      
      INDEX idx_team_member_id (team_member_id),
      INDEX idx_agent_id (agent_id),
      INDEX idx_proficiency (proficiency_level),
      CONSTRAINT fk_assignments_member FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE,
      UNIQUE KEY uk_member_agent (team_member_id, agent_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  return db.query(sql);
}

/**
 * Create team_performance table
 */
async function createTeamPerformanceTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS team_performance (
      id INT PRIMARY KEY AUTO_INCREMENT,
      team_id INT NOT NULL,
      team_member_id INT,
      date DATE NOT NULL,
      calls_completed INT DEFAULT 0,
      avg_duration INT DEFAULT 0,
      success_rate DECIMAL(5, 2) DEFAULT 0,
      error_rate DECIMAL(5, 2) DEFAULT 0,
      avg_rating DECIMAL(3, 2) DEFAULT 0,
      utilization_percent INT DEFAULT 0,
      escalations INT DEFAULT 0,
      performance_score INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      INDEX idx_team_id (team_id),
      INDEX idx_team_member_id (team_member_id),
      INDEX idx_date (date),
      CONSTRAINT fk_perf_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      CONSTRAINT fk_perf_member FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE SET NULL,
      UNIQUE KEY uk_team_date (team_id, date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  return db.query(sql);
}

/**
 * Create additional indexes for query performance
 */
async function createIndexes() {
  const indexes = [
    // Team queries
    `CREATE INDEX IF NOT EXISTS idx_teams_sector_status ON teams(sector, status)`,
    
    // Team member queries
    `CREATE INDEX IF NOT EXISTS idx_team_members_performance ON team_members(performance_score, avg_rating)`,
    
    // Agent assignment queries
    `CREATE INDEX IF NOT EXISTS idx_agent_assignments_proficiency ON team_agent_assignments(proficiency_level, success_rate)`,
    
    // Performance queries
    `CREATE INDEX IF NOT EXISTS idx_team_perf_date_range ON team_performance(team_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_member_perf_date_range ON team_performance(team_member_id, date)`
  ];

  for (const indexSql of indexes) {
    try {
      await db.query(indexSql);
    } catch (error) {
      // Index might already exist, continue
      if (!error.message.includes('Duplicate key')) {
        console.warn('Index creation warning:', error.message);
      }
    }
  }
}

/**
 * Insert sample data for testing
 */
async function seedSampleData() {
  try {
    console.log('🌱 Seeding sample team data...');

    // Sample teams data
    const teamsData = [
      {
        name: 'Healthcare Team',
        sector: 'healthcare',
        lead_id: 1,
        description: 'Handles healthcare appointments, prescriptions, and patient support'
      },
      {
        name: 'E-Commerce Team',
        sector: 'ecommerce',
        lead_id: 2,
        description: 'Manages orders, refunds, tracking, and customer inquiries'
      },
      {
        name: 'Support Team',
        sector: 'support',
        lead_id: 3,
        description: 'General customer support and FAQ handling'
      }
    ];

    // Insert teams
    for (const team of teamsData) {
      await db.query(
        'INSERT INTO teams (name, sector, lead_id, description) VALUES (?, ?, ?, ?)',
        [team.name, team.sector, team.lead_id, team.description]
      );
    }

    console.log('✅ Sample data seeded successfully!');
  } catch (error) {
    console.error('Warning: Could not seed sample data:', error.message);
  }
}

/**
 * Rollback migrations (for development)
 */
async function rollbackMigrations() {
  try {
    console.log('⏮️  Rolling back migrations...');

    const tables = [
      'team_performance',
      'team_agent_assignments',
      'team_members',
      'teams'
    ];

    for (const table of tables) {
      await db.query(`DROP TABLE IF EXISTS ${table}`);
      console.log(`✅ Dropped ${table} table`);
    }

    console.log('✨ Rollback completed!');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

/**
 * Check if migrations have been run
 */
async function checkMigrationsStatus() {
  try {
    const result = await db.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME IN ('teams', 'team_members', 'team_agent_assignments', 'team_performance')
    `);

    const requiredTables = ['teams', 'team_members', 'team_agent_assignments', 'team_performance'];
    const existingTables = result.map(r => r.TABLE_NAME);
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    if (missingTables.length === 0) {
      console.log('✅ All migration tables exist');
      return true;
    } else {
      console.log('⚠️  Missing tables:', missingTables);
      return false;
    }
  } catch (error) {
    console.error('Error checking migrations:', error);
    return false;
  }
}

module.exports = {
  runMigrations,
  rollbackMigrations,
  checkMigrationsStatus,
  seedSampleData,
  createTeamsTable,
  createTeamMembersTable,
  createTeamAgentAssignmentsTable,
  createTeamPerformanceTable
};
