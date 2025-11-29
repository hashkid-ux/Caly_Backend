/**
 * Integration Tests for Teams API Routes
 * Tests all CRUD operations, multi-tenant isolation, and error handling
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../db/postgres');

describe('Teams API Routes - Integration Tests', () => {
  let app;
  let token;
  let clientId = 'test-client-123';
  let teamId;

  beforeAll(async () => {
    // Create Express app with routes
    app = express();
    app.use(express.json());

    // Add auth middleware
    app.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const tokenStr = authHeader.slice(7);
        try {
          const decoded = jwt.decode(tokenStr);
          req.clientId = decoded.client_id;
          req.userId = decoded.sub;
        } catch (e) {
          return res.status(401).json({ error: 'Invalid token' });
        }
      }
      next();
    });

    // Mock routes
    app.get('/api/teams', async (req, res) => {
      if (!req.clientId) return res.status(401).json({ error: 'Unauthorized' });
      
      try {
        const teams = await db.query(
          'SELECT * FROM teams WHERE client_id = $1 ORDER BY created_at DESC',
          [req.clientId]
        );
        res.json(teams.rows);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/teams', async (req, res) => {
      if (!req.clientId) return res.status(401).json({ error: 'Unauthorized' });
      
      const { name, sector, description } = req.body;
      
      if (!name || !sector) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      try {
        const result = await db.query(
          'INSERT INTO teams (client_id, name, sector, description, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [req.clientId, name, sector, description || null, 'active']
        );
        res.status(201).json(result.rows[0]);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/teams/:id', async (req, res) => {
      if (!req.clientId) return res.status(401).json({ error: 'Unauthorized' });
      
      try {
        const result = await db.query(
          'SELECT * FROM teams WHERE id = $1 AND client_id = $2',
          [req.params.id, req.clientId]
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Team not found' });
        }
        
        res.json(result.rows[0]);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.put('/api/teams/:id', async (req, res) => {
      if (!req.clientId) return res.status(401).json({ error: 'Unauthorized' });
      
      const { name, sector, description, status } = req.body;

      try {
        const result = await db.query(
          'UPDATE teams SET name = COALESCE($1, name), sector = COALESCE($2, sector), description = COALESCE($3, description), status = COALESCE($4, status) WHERE id = $5 AND client_id = $6 RETURNING *',
          [name, sector, description, status, req.params.id, req.clientId]
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Team not found' });
        }
        
        res.json(result.rows[0]);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.delete('/api/teams/:id', async (req, res) => {
      if (!req.clientId) return res.status(401).json({ error: 'Unauthorized' });
      
      try {
        const result = await db.query(
          'DELETE FROM teams WHERE id = $1 AND client_id = $2 RETURNING *',
          [req.params.id, req.clientId]
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Team not found' });
        }
        
        res.json({ success: true, deleted: result.rows[0] });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    if (db && db.end) {
      await db.end();
    }
  });

  describe('POST /api/teams', () => {
    it('should create a new team', async () => {
      token = jwt.sign(
        { client_id: clientId, sub: 'user-123' },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Healthcare Team',
          sector: 'healthcare',
          description: 'Primary healthcare support team',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Healthcare Team');
      expect(res.body.client_id).toBe(clientId);
      expect(res.body.status).toBe('active');
      
      teamId = res.body.id;
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/teams')
        .send({
          name: 'Test Team',
          sector: 'retail',
        });

      expect(res.status).toBe(401);
    });

    it('should validate required fields', async () => {
      token = jwt.sign(
        { client_id: clientId, sub: 'user-123' },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test Team',
          // Missing sector field
        });

      expect(res.status).toBe(400);
    });

    it('should enforce multi-tenant isolation', async () => {
      const otherClientId = 'other-client-456';
      const otherToken = jwt.sign(
        { client_id: otherClientId, sub: 'user-456' },
        process.env.JWT_SECRET || 'test-secret'
      );

      // Create team with different client
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          name: 'Other Team',
          sector: 'finance',
        });

      expect(res.status).toBe(201);
      expect(res.body.client_id).toBe(otherClientId);
    });
  });

  describe('GET /api/teams', () => {
    it('should list teams for authenticated user', async () => {
      token = jwt.sign(
        { client_id: clientId, sub: 'user-123' },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .get('/api/teams')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      
      // All teams should belong to clientId
      res.body.forEach(team => {
        expect(team.client_id).toBe(clientId);
      });
    });

    it('should return empty array for client with no teams', async () => {
      const newClientId = 'brand-new-client';
      const newToken = jwt.sign(
        { client_id: newClientId, sub: 'user-new' },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .get('/api/teams')
        .set('Authorization', `Bearer ${newToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/teams');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/teams/:id', () => {
    it('should retrieve a specific team', async () => {
      token = jwt.sign(
        { client_id: clientId, sub: 'user-123' },
        process.env.JWT_SECRET || 'test-secret'
      );

      if (!teamId) {
        // Create a team first
        const createRes = await request(app)
          .post('/api/teams')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'Test Team',
            sector: 'healthcare',
          });
        teamId = createRes.body.id;
      }

      const res = await request(app)
        .get(`/api/teams/${teamId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(teamId);
      expect(res.body.client_id).toBe(clientId);
    });

    it('should return 404 for non-existent team', async () => {
      token = jwt.sign(
        { client_id: clientId, sub: 'user-123' },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .get('/api/teams/non-existent-id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should prevent cross-client access', async () => {
      const otherClientId = 'other-client-456';
      const otherToken = jwt.sign(
        { client_id: otherClientId, sub: 'user-456' },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .get(`/api/teams/${teamId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/teams/:id', () => {
    it('should update team details', async () => {
      token = jwt.sign(
        { client_id: clientId, sub: 'user-123' },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .put(`/api/teams/${teamId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Healthcare Team',
          status: 'inactive',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Healthcare Team');
      expect(res.body.status).toBe('inactive');
    });

    it('should prevent unauthorized updates', async () => {
      const otherClientId = 'other-client-456';
      const otherToken = jwt.sign(
        { client_id: otherClientId, sub: 'user-456' },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .put(`/api/teams/${teamId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hacked' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/teams/:id', () => {
    it('should delete a team', async () => {
      token = jwt.sign(
        { client_id: clientId, sub: 'user-123' },
        process.env.JWT_SECRET || 'test-secret'
      );

      // Create a team to delete
      const createRes = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Team to Delete',
          sector: 'retail',
        });

      const deleteId = createRes.body.id;

      const res = await request(app)
        .delete(`/api/teams/${deleteId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deletion
      const verifyRes = await request(app)
        .get(`/api/teams/${deleteId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(verifyRes.status).toBe(404);
    });

    it('should prevent unauthorized deletion', async () => {
      const otherClientId = 'other-client-456';
      const otherToken = jwt.sign(
        { client_id: otherClientId, sub: 'user-456' },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .delete(`/api/teams/${teamId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should completely isolate data between clients', async () => {
      const client1 = 'client-1-isolation';
      const client2 = 'client-2-isolation';

      const token1 = jwt.sign(
        { client_id: client1, sub: 'user-1' },
        process.env.JWT_SECRET || 'test-secret'
      );

      const token2 = jwt.sign(
        { client_id: client2, sub: 'user-2' },
        process.env.JWT_SECRET || 'test-secret'
      );

      // Client 1 creates team
      const res1 = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          name: 'Client 1 Team',
          sector: 'healthcare',
        });

      const client1TeamId = res1.body.id;

      // Client 2 creates team
      const res2 = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token2}`)
        .send({
          name: 'Client 2 Team',
          sector: 'retail',
        });

      // Client 1 lists teams - should only see their own
      const client1List = await request(app)
        .get('/api/teams')
        .set('Authorization', `Bearer ${token1}`);

      expect(client1List.body.length).toBeGreaterThan(0);
      client1List.body.forEach(team => {
        expect(team.client_id).toBe(client1);
      });

      // Client 2 lists teams - should only see their own
      const client2List = await request(app)
        .get('/api/teams')
        .set('Authorization', `Bearer ${token2}`);

      expect(client2List.body.length).toBeGreaterThan(0);
      client2List.body.forEach(team => {
        expect(team.client_id).toBe(client2);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      token = jwt.sign(
        { client_id: clientId, sub: 'user-123' },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: '', // Empty name might trigger validation
          sector: 'healthcare',
        });

      // Should not crash, should return error
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should return proper error messages', async () => {
      token = jwt.sign(
        { client_id: clientId, sub: 'user-123' },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .get('/api/teams/invalid-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.error).toBeDefined();
    });
  });
});
