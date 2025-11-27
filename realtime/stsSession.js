// realtime/stsSession.js - OpenAI Realtime API (Speech-to-Speech Mode)
const WebSocket = require('ws');
const resolve = require('../utils/moduleResolver');
const logger = require(resolve('utils/logger'));
const EventEmitter = require('events');

// Reconnection settings
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1000;

class STSSession extends EventEmitter {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.ws = null;
    this.isConnected = false;
    this.callId = null;
    this.sessionId = null;
    this.conversationContext = [];
    this.reconnectAttempts = 0;
    this.isStopping = false;
    
    // Prevent memory leak warnings
    this.setMaxListeners(15);
  }

  /**
   * Start Speech-to-Speech session
   * @param {string} callId - Call identifier
   * @param {object} config - Session configuration
   */
  async start(callId, config = {}) {
    try {
      this.callId = callId;

      const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-audio-mini-2025-10-06';

      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      this.setupEventHandlers();

      await new Promise((resolve, reject) => {
        this.ws.once('open', resolve);
        this.ws.once('error', reject);
      });

      await this.configureSession(config);

      logger.info('OpenAI STS session started', { callId });

    } catch (error) {
      logger.error('Error starting STS session', { 
        callId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Configure session with system prompt
   */
  async configureSession(config = {}) {
    const systemPrompt = `You are Caly, a highly empathetic, professional Hindi/Hinglish customer support agent for e-commerce.

CRITICAL RULES:
1. Speak ONLY in Hindi/Hinglish - natural, conversational tone with "ji", "sir/madam"
2. Be warm, helpful, and patient like a professional sales person
3. Keep responses SHORT (5-10 seconds of speech)
4. NEVER say you're performing actions - just acknowledge naturally
5. When collecting info (order_id, phone), ask politely and confirm

TONE EXAMPLES:
- Greeting: "Namaste ji, main Caly hoon. Aapki kaise madad kar sakti hoon?"
- Asking for info: "Ji sir, apna order number batayiye please"
- Confirming: "Ji, order number 12345, sahi hai na?"
- Processing: "Ek minute sir, check kar rahi hoon"
- Success: "Ji ho gaya sir, aapka return request create ho gaya hai"
- Error: "Maaf kijiye sir, thoda technical issue aa raha hai. Main manager se connect karti hoon"

IMPORTANT: 
- DO NOT mention APIs, databases, or technical terms
- DO NOT say "I'm executing" or "calling backend" - just be natural
- If user says "rehne do" or "cancel karo" - acknowledge and move on
- Always be humble and respectful`;

    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: systemPrompt,
        voice: config.voice || 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700
        },
        temperature: 0.8,
        max_response_output_tokens: 300
      }
    };

    this.send(sessionConfig);
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.ws.on('open', () => {
      this.isConnected = true;
      logger.info('STS WebSocket connected', { callId: this.callId });
    });

    this.ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        this.handleEvent(event);
      } catch (error) {
        logger.error('Error parsing STS message', { 
          callId: this.callId,
          error: error.message 
        });
      }
    });

    this.ws.on('error', (error) => {
      logger.error('STS WebSocket error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      logger.info('STS WebSocket closed', { callId: this.callId });
      this.emit('closed');
    });
  }

  /**
   * Handle events from OpenAI Realtime API
   */
  handleEvent(event) {
    const eventType = event.type;

    // Log all events at debug level
    if (!eventType.includes('audio.delta')) {
      logger.debug('STS event', { 
        callId: this.callId,
        type: eventType 
      });
    }

    switch (eventType) {
      // Session events
      case 'session.created':
        this.sessionId = event.session.id;
        this.emit('session_created', event.session);
        break;

      case 'session.updated':
        this.emit('session_updated', event.session);
        break;

      // Audio input events
      case 'input_audio_buffer.speech_started':
        logger.info('User started speaking', { callId: this.callId });
        this.emit('speech_started');
        break;

      case 'input_audio_buffer.speech_stopped':
        logger.info('User stopped speaking', { callId: this.callId });
        this.emit('speech_stopped');
        break;

      case 'input_audio_buffer.committed':
        this.emit('input_committed');
        break;

      // Transcript events - CRITICAL FOR INTENT DETECTION
      case 'conversation.item.input_audio_transcription.completed':
        const userTranscript = event.transcript;
        logger.info('USER TRANSCRIPT COMPLETED', { 
          callId: this.callId,
          transcript: userTranscript 
        });
        
        // Store in context
        this.conversationContext.push({
          role: 'user',
          content: userTranscript,
          timestamp: Date.now()
        });

        // Emit for intent detection
        this.emit('user_transcript_completed', {
          transcript: userTranscript,
          item_id: event.item_id
        });
        break;

      case 'response.transcript.delta':
        // AI is speaking (partial)
        this.emit('ai_transcript_delta', {
          delta: event.delta,
          response_id: event.response_id
        });
        break;

      case 'response.transcript.done':
        // AI finished speaking (text)
        logger.info('AI TRANSCRIPT COMPLETED', { 
          callId: this.callId,
          transcript: event.transcript 
        });

        this.conversationContext.push({
          role: 'assistant',
          content: event.transcript,
          timestamp: Date.now()
        });

        this.emit('ai_transcript_completed', {
          transcript: event.transcript,
          response_id: event.response_id
        });
        break;

      // Audio output events - STREAM TO USER
      case 'response.audio.delta':
        // Stream audio chunk to user
        const audioChunk = Buffer.from(event.delta, 'base64');
        this.emit('audio_output', audioChunk);
        break;

      case 'response.audio.done':
        this.emit('audio_output_done');
        break;

      // Turn events
      case 'response.done':
        logger.debug('Response completed', { 
          callId: this.callId,
          response_id: event.response.id 
        });
        this.emit('response_done', event.response);
        break;

      // Conversation events
      case 'conversation.item.created':
        this.emit('conversation_item_created', event.item);
        break;

      // Error handling
      case 'error':
        logger.error('STS error event', { 
          callId: this.callId,
          error: event.error 
        });
        this.emit('error', new Error(event.error.message));
        break;

      default:
        // Ignore other events
        break;
    }
  }

  /**
   * Send audio chunk to OpenAI (from Exotel)
   * @param {Buffer} audioChunk - PCM16 audio data
   */
  sendAudio(audioChunk) {
    if (!this.isConnected) {
      logger.warn('Cannot send audio, STS not connected', { 
        callId: this.callId 
      });
      return;
    }

    try {
      const event = {
        type: 'input_audio_buffer.append',
        audio: audioChunk.toString('base64')
      };
      this.send(event);
    } catch (error) {
      logger.error('Error sending audio to STS', { 
        callId: this.callId,
        error: error.message 
      });
    }
  }

  /**
   * Update conversation context (inject agent results)
   * @param {string} contextUpdate - New information to add
   */
  updateContext(contextUpdate) {
    if (!this.isConnected) {
      logger.warn('Cannot update context, STS not connected', { 
        callId: this.callId 
      });
      return;
    }

    logger.info('Updating conversation context', { 
      callId: this.callId,
      update: contextUpdate.substring(0, 100) 
    });

    // Add context as a system message
    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: contextUpdate
          }
        ]
      }
    };

    this.send(event);
  }

  /**
   * Interrupt current response (when user speaks)
   */
  interrupt() {
    if (!this.isConnected) {
      return;
    }

    logger.debug('Interrupting current response', { callId: this.callId });
    
    const event = {
      type: 'response.cancel'
    };

    this.send(event);
  }

  /**
   * Get conversation history
   */
  getConversationHistory() {
    return this.conversationContext;
  }

  /**
   * Send raw event to OpenAI
   */
  send(event) {
    if (!this.isConnected || !this.ws) {
      logger.warn('Cannot send event, STS not connected', { 
        callId: this.callId 
      });
      return;
    }

    try {
      this.ws.send(JSON.stringify(event));
    } catch (error) {
      logger.error('Error sending to STS', { 
        callId: this.callId,
        error: error.message 
      });
    }
  }

  /**
   * Stop STS session
   */
  async stop() {
    if (!this.ws) {
      return;
    }

    try {
      this.isStopping = true;
      this.removeAllListeners(); // Clean up event listeners
      this.ws.close(1000, 'Normal closure');
      this.isConnected = false;
      logger.info('STS session stopped', { callId: this.callId });
    } catch (error) {
      logger.error('Error stopping STS', { 
        callId: this.callId,
        error: error.message 
      });
    } finally {
      this.ws = null;
    }
  }

  /**
   * Check if session is active
   */
  isActive() {
    return this.isConnected && !this.isStopping;
  }
}

module.exports = STSSession;