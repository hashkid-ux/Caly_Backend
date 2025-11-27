// sessions/CallSessionManager.js - Main call session orchestrator
const resolve = require('../utils/moduleResolver');
const STSSession = require(resolve('realtime/stsSession'));
const IntentDetector = require(resolve('agents/intentDetector'));
const AgentOrchestrator = require(resolve('agents/orchestrator'));
const logger = require(resolve('utils/logger'));
const db = require(resolve('db/postgres'));
const wasabiStorage = require(resolve('services/wasabiStorage'));
const EventEmitter = require('events');

// Session timeout (15 minutes of inactivity)
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
// Max conversation history to prevent unbounded memory growth
const MAX_HISTORY_MESSAGES = 20;

class CallSessionManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.intentDetector = new IntentDetector();
    this.agentOrchestrator = AgentOrchestrator;
    this.sessionTimeouts = new Map(); // Track timeout handles
    this.setMaxListeners(50); // Prevent memory leak warnings
  }

  /**
   * Create new call session
   * @param {string} callId - Call identifier
   * @param {object} callData - Call metadata
   */
  async createSession(callId, callData) {
    try {
      logger.info('Creating call session', { callId });

      // Initialize STS session
      const stsSession = new STSSession(process.env.OPENAI_API_KEY);

      const session = {
        callId,
        callData,
        stsSession,
        conversationHistory: [],
        startTime: Date.now(),
        isActive: true,
        currentIntent: null,
        waitingForEntity: null
      };

      // Setup session timeout (cleanup after inactivity)
      this.resetSessionTimeout(callId);

      // Setup STS event handlers
      this.setupSTSHandlers(session);

      // Setup agent orchestrator handlers
      this.setupAgentHandlers(session);

      // Start STS session
      await stsSession.start(callId);

      // Store session
      this.sessions.set(callId, session);

      logger.info('Call session created successfully', { callId });

      return session;

    } catch (error) {
      logger.error('Error creating call session', { 
        callId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Setup STS event handlers
   */
  setupSTSHandlers(session) {
    const { callId, stsSession } = session;

    // User started speaking
    stsSession.on('speech_started', () => {
      logger.debug('User speech started', { callId });
      // User interrupted - could cancel any TTS if needed
    });

    // User stopped speaking
    stsSession.on('speech_stopped', () => {
      logger.debug('User speech stopped', { callId });
    });

    // User transcript completed - CRITICAL EVENT
    stsSession.on('user_transcript_completed', async (data) => {
      logger.info('USER SAID', { 
        callId,
        transcript: data.transcript 
      });

      // Store in conversation history (with limit to prevent unbounded growth)
      session.conversationHistory.push({
        role: 'user',
        content: data.transcript,
        timestamp: Date.now()
      });

      // Limit conversation history to prevent memory leaks
      if (session.conversationHistory.length > MAX_HISTORY_MESSAGES) {
        session.conversationHistory = session.conversationHistory.slice(-MAX_HISTORY_MESSAGES);
      }

      // Reset activity timeout
      this.resetSessionTimeout(callId);

      // Save to database
      try {
        await db.entities.create({
          call_id: callId,
          entity_type: 'transcript_user',
          value: data.transcript,
          confidence: 1.0
        });
      } catch (error) {
        logger.error('Error saving transcript', { 
          callId,
          error: error.message 
        });
      }

      // Detect intent
      const detection = this.intentDetector.detect(
        data.transcript,
        session.conversationHistory
      );

      logger.info('Intent detected', { 
        callId,
        intent: detection.intent,
        confidence: detection.confidence,
        requiresAgent: detection.requiresAgent,
        entities: detection.entities
      });

      // Handle based on intent
      await this.handleIntent(session, detection);
    });

    // AI transcript completed
    stsSession.on('ai_transcript_completed', async (data) => {
      logger.info('AI SAID', { 
        callId,
        transcript: data.transcript 
      });

      // Store in conversation history
      session.conversationHistory.push({
        role: 'assistant',
        content: data.transcript,
        timestamp: Date.now()
      });

      // Save to database
      try {
        await db.entities.create({
          call_id: callId,
          entity_type: 'transcript_assistant',
          value: data.transcript,
          confidence: 1.0
        });
      } catch (error) {
        logger.error('Error saving AI transcript', { 
          callId,
          error: error.message 
        });
      }
    });

    // Audio output - stream to Exotel
    stsSession.on('audio_output', (audioChunk) => {
      // Emit to be sent to Exotel
      this.emit('audio_output', {
        callId,
        audioData: audioChunk
      });
    });

    // Error handling
    stsSession.on('error', (error) => {
      logger.error('STS error', { callId, error: error.message });
      this.emit('session_error', { callId, component: 'sts', error });
    });
  }

  /**
   * Setup agent orchestrator handlers
   */
  setupAgentHandlers(session) {
    const { callId } = session;

    // Agent needs more info
    this.agentOrchestrator.on('agent_needs_info', (data) => {
      if (data.callId !== callId) return;

      logger.info('Agent needs info', { 
        callId,
        field: data.field,
        prompt: data.prompt 
      });

      // Update STS context so AI knows to ask for this info
      const contextUpdate = `SYSTEM: ${data.prompt}. Ask user naturally for this information in Hindi.`;
      session.stsSession.updateContext(contextUpdate);

      // Track what we're waiting for
      session.waitingForEntity = data.field;
    });

    // Agent completed
    this.agentOrchestrator.on('agent_completed', async (data) => {
      if (data.callId !== callId) return;

      logger.info('Agent completed', { 
        callId,
        agentType: data.agentType,
        success: data.result.success 
      });

      // Update STS context with agent result
      const contextUpdate = `SYSTEM: ${data.result.contextUpdate}`;
      session.stsSession.updateContext(contextUpdate);

      session.currentIntent = null;
      session.waitingForEntity = null;
    });

    // Agent error
    this.agentOrchestrator.on('agent_error', (data) => {
      if (data.callId !== callId) return;

      logger.error('Agent error', { 
        callId,
        agentType: data.agentType,
        error: data.error.message 
      });

      // Update STS to inform user of error
      const contextUpdate = `SYSTEM: Technical issue occurred. Apologize to user and offer to create a support ticket. Say in Hindi: "Maaf kijiye sir, thoda technical issue aa raha hai. Main aapka ticket create kar deti hoon, team 24 ghante mein contact karegi."`;
      session.stsSession.updateContext(contextUpdate);
    });

    // Agent cancelled
    this.agentOrchestrator.on('agent_cancelled', (data) => {
      if (data.callId !== callId) return;

      logger.info('Agent cancelled', { 
        callId,
        agentType: data.agentType 
      });

      session.currentIntent = null;
      session.waitingForEntity = null;
    });
  }

  /**
   * Handle detected intent
   */
  async handleIntent(session, detection) {
    const { callId } = session;

    // Handle cancellation
    if (detection.shouldCancelAgent) {
      logger.info('User requested cancellation', { callId });
      
      // Cancel active agent
      await this.agentOrchestrator.cancelAgent(callId);
      
      // Update context
      session.stsSession.updateContext(
        'SYSTEM: User cancelled the action. Acknowledge politely: "Ji sir, koi baat nahi. Kuch aur batayiye?"'
      );
      return;
    }

    // Normal chat - no agent needed
    if (!detection.requiresAgent) {
      logger.debug('Normal conversation, no agent needed', { 
        callId,
        intent: detection.intent 
      });
      return; // STS handles conversation naturally
    }

    // Agent-triggering intent detected
    logger.info('Launching agent', { 
      callId,
      intent: detection.intent,
      agentType: detection.agentType,
      entities: detection.entities 
    });

    session.currentIntent = detection.intent;

    // Check if we're waiting for specific entity
    if (session.waitingForEntity && detection.entities[session.waitingForEntity]) {
      // User provided the entity we were waiting for
      logger.info('Received expected entity', { 
        callId,
        entity: session.waitingForEntity,
        value: detection.entities[session.waitingForEntity] 
      });

      // Update active agent with new data
      this.agentOrchestrator.updateAgent(callId, detection.entities);
      session.waitingForEntity = null;
      return;
    }

    // Launch new agent
    try {
      await this.agentOrchestrator.launchAgent(
        callId,
        detection.agentType,
        detection.entities
      );
    } catch (error) {
      logger.error('Error launching agent', { 
        callId,
        error: error.message 
      });

      // Inform user of error
      session.stsSession.updateContext(
        'SYSTEM: Could not process request. Apologize: "Maaf kijiye, thodi problem aa rahi hai. Kuch aur madad kar sakti hoon?"'
      );
    }
  }

  /**
   * Process incoming audio from Exotel
   * @param {string} callId - Call identifier
   * @param {Buffer} audioData - Audio chunk
   */
  processIncomingAudio(callId, audioData) {
    const session = this.sessions.get(callId);

    if (!session || !session.isActive) {
      logger.warn('Cannot process audio, session not found or inactive', { 
        callId 
      });
      return;
    }

    // Send audio to STS
    session.stsSession.sendAudio(audioData);
  }

  /**
   * Get session
   */
  getSession(callId) {
    return this.sessions.get(callId);
  }

  /**
   * End call session
   */
  async endSession(callId, isTimeout = false) {
    const session = this.sessions.get(callId);

    if (!session) {
      logger.warn('Session not found for ending', { callId });
      return;
    }

    try {
      logger.info('Ending call session', { callId, isTimeout });

      session.isActive = false;

      // Cancel any active agents
      await this.agentOrchestrator.cancelAgent(callId);

      // Stop STS session
      if (session.stsSession && typeof session.stsSession.stop === 'function') {
        await session.stsSession.stop();
      }

      // Save final transcript
      const fullTranscript = session.conversationHistory
        .map(t => `${t.role}: ${t.content}`)
        .join('\n');

      // Calculate call duration
      const duration = Math.floor((Date.now() - session.startTime) / 1000);

      // Upload recording to Wasabi if available
      let recordingUrl = null;
      if (session.audioBuffer && session.audioBuffer.length > 0) {
        try {
          recordingUrl = await wasabiStorage.uploadCallRecording(
            callId,
            session.audioBuffer,
            'mp3'
          );
          logger.info('Call recording saved to Wasabi', { 
            callId, 
            url: recordingUrl,
            size: session.audioBuffer.length 
          });
        } catch (error) {
          logger.error('Failed to upload recording to Wasabi', {
            callId,
            error: error.message
          });
          // Continue even if upload fails - don't block call end
        }
      }

      // Calculate charges
      const durationMinutes = duration / 60;
      const chargeAmount = durationMinutes * 30; // ₹30/minute

      await db.calls.update(callId, {
        transcript_full: fullTranscript,
        end_ts: new Date(),
        duration_seconds: duration,
        recording_url: recordingUrl,
        charge_amount: chargeAmount
      });

      // Clean up session resources
      this.cleanupSession(session);

      // Remove session
      this.sessions.delete(callId);

      logger.info('Call session ended successfully', { 
        callId,
        duration: Date.now() - session.startTime 
      });

    } catch (error) {
      logger.error('Error ending call session', { 
        callId,
        error: error.message 
      });
      // Ensure cleanup happens even on error
      this.cleanupSession(session);
      this.sessions.delete(callId);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session count
   */
  getSessionCount() {
    return this.sessions.size;
  }

  /**
   * Reset session timeout (30 min inactivity cleanup)
   */
  resetSessionTimeout(callId) {
    // Clear existing timeout if any
    if (this.sessionTimeouts.has(callId)) {
      clearTimeout(this.sessionTimeouts.get(callId));
    }

    // Set new timeout
    const timeoutHandle = setTimeout(async () => {
      logger.warn('Session timeout - cleaning up', { callId });
      await this.endSession(callId, true);
    }, SESSION_TIMEOUT_MS);

    this.sessionTimeouts.set(callId, timeoutHandle);
  }

  /**
   * Clean up all listeners and event handlers
   */
  cleanupSession(session) {
    if (!session) return;

    try {
      // Stop STS session
      if (session.stsSession) {
        session.stsSession.removeAllListeners();
        if (session.stsSession.ws) {
          session.stsSession.ws.close();
        }
      }

      // Limit conversation history to prevent memory leaks
      if (session.conversationHistory.length > MAX_HISTORY_MESSAGES) {
        session.conversationHistory = session.conversationHistory.slice(-MAX_HISTORY_MESSAGES);
      }

      // Remove session timeout
      if (this.sessionTimeouts.has(session.callId)) {
        clearTimeout(this.sessionTimeouts.get(session.callId));
        this.sessionTimeouts.delete(session.callId);
      }
    } catch (error) {
      logger.error('Error cleaning up session', { 
        callId: session.callId,
        error: error.message 
      });
    }
  }
}

// Singleton instance
const sessionManager = new CallSessionManager();

module.exports = sessionManager;