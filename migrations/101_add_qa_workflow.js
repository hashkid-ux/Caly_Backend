/**
 * Migration 101: QA Workflow & Call Review System
 * Adds tables for QA reviews, feedback, and coaching
 * Date: November 30, 2025
 */

const migration = {
  id: 101,
  name: 'Add QA workflow and coaching system',
  description: 'Creates tables for QA reviews, feedback items, coaching assignments, and progress tracking',

  async up(db) {
    const queries = [
      // QA Reviews table - supervisor reviews of calls
      `CREATE TABLE IF NOT EXISTS qa_reviews (
        id SERIAL PRIMARY KEY,
        call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
        supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        qa_score INTEGER NOT NULL CHECK (qa_score >= 0 AND qa_score <= 100),
        status VARCHAR(50) DEFAULT 'completed', -- 'completed', 'flagged'
        feedback TEXT,
        coaching_needed BOOLEAN DEFAULT false,
        coaching_topic VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(call_id, supervisor_id)
      );`,

      // QA Feedback items - detailed feedback by category
      `CREATE TABLE IF NOT EXISTS qa_feedback (
        id SERIAL PRIMARY KEY,
        call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
        category VARCHAR(100) NOT NULL,
        score INTEGER CHECK (score >= 0 AND score <= 100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      // Coaching Assignments - topics assigned for improvement
      `CREATE TABLE IF NOT EXISTS coaching_assignments (
        id SERIAL PRIMARY KEY,
        team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
        supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        topic VARCHAR(255) NOT NULL,
        description TEXT,
        target_date DATE,
        priority VARCHAR(50) DEFAULT 'medium', -- 'high', 'medium', 'low'
        status VARCHAR(50) DEFAULT 'active', -- 'active', 'completed', 'on-hold'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      // Coaching Progress - track coaching session outcomes
      `CREATE TABLE IF NOT EXISTS coaching_progress (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER NOT NULL REFERENCES coaching_assignments(id) ON DELETE CASCADE,
        supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_date DATE DEFAULT CURRENT_DATE,
        topic_covered VARCHAR(255),
        progress_score INTEGER CHECK (progress_score >= 0 AND progress_score <= 100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      // Add QA-related columns to team_members if not exist
      `ALTER TABLE team_members 
       ADD COLUMN IF NOT EXISTS qa_score NUMERIC(5,1) DEFAULT 0.0,
       ADD COLUMN IF NOT EXISTS reviews_completed INTEGER DEFAULT 0,
       ADD COLUMN IF NOT EXISTS flagged_count INTEGER DEFAULT 0;`,

      // Create indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_qa_reviews_call_id ON qa_reviews(call_id);`,
      `CREATE INDEX IF NOT EXISTS idx_qa_reviews_supervisor_id ON qa_reviews(supervisor_id);`,
      `CREATE INDEX IF NOT EXISTS idx_qa_reviews_status ON qa_reviews(status);`,
      `CREATE INDEX IF NOT EXISTS idx_qa_reviews_created_at ON qa_reviews(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_qa_feedback_call_id ON qa_feedback(call_id);`,
      `CREATE INDEX IF NOT EXISTS idx_qa_feedback_category ON qa_feedback(category);`,
      `CREATE INDEX IF NOT EXISTS idx_coaching_assignments_member_id ON coaching_assignments(team_member_id);`,
      `CREATE INDEX IF NOT EXISTS idx_coaching_assignments_status ON coaching_assignments(status);`,
      `CREATE INDEX IF NOT EXISTS idx_coaching_progress_assignment_id ON coaching_progress(assignment_id);`,
    ];

    for (const query of queries) {
      try {
        await db.query(query);
      } catch (error) {
        console.error(`Migration 101 error on query:`, error.message);
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }
    }

    return true;
  },

  async down(db) {
    const queries = [
      `DROP TABLE IF EXISTS coaching_progress;`,
      `DROP TABLE IF EXISTS coaching_assignments;`,
      `DROP TABLE IF EXISTS qa_feedback;`,
      `DROP TABLE IF EXISTS qa_reviews;`,
    ];

    for (const query of queries) {
      await db.query(query);
    }

    return true;
  }
};

module.exports = migration;
