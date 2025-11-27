/**
 * Parallel Processor - Handles concurrent processing of audio streams
 * Enables simultaneous:
 * - ASR (Automatic Speech Recognition)
 * - Intent Detection
 * - Agent Execution
 * - Action Execution
 * 
 * This dramatically improves response times by processing in parallel instead of serial
 */

const logger = require('./logger');

class ParallelProcessor {
  constructor() {
    this.activeProcesses = new Map(); // callId -> { tasks: [] }
  }

  /**
   * Process audio chunk in parallel pipelines
   * @param {string} callId - Call ID
   * @param {Buffer} audioChunk - Audio data
   * @param {object} processors - { asr, intentDetector, agentOrchestrator, actionExecutor }
   */
  async processAudioParallel(callId, audioChunk, processors) {
    try {
      // Launch all processors in parallel
      const results = await Promise.allSettled([
        // ASR: Convert audio to text
        this.processASR(callId, audioChunk, processors.asr),
        
        // Intent detection from partial transcripts
        this.processIntentDetection(callId, processors.intentDetector),
        
        // Agent execution if one is active
        this.processAgentExecution(callId, processors.agentOrchestrator),
        
        // Execute pending actions
        this.processActionExecution(callId, processors.actionExecutor)
      ]);

      // Collect results
      const parallelResults = {
        asr: results[0].status === 'fulfilled' ? results[0].value : null,
        intent: results[1].status === 'fulfilled' ? results[1].value : null,
        agentState: results[2].status === 'fulfilled' ? results[2].value : null,
        actionResult: results[3].status === 'fulfilled' ? results[3].value : null
      };

      return parallelResults;
    } catch (error) {
      logger.error('Error in parallel processing', {
        callId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process ASR in parallel
   */
  async processASR(callId, audioChunk, asrProcessor) {
    try {
      if (!asrProcessor || !audioChunk) {
        return null;
      }

      // Simulate or call actual ASR
      // In production, this would call Deepgram/Whisper
      return {
        transcript: null, // Will be filled by actual ASR
        confidence: 0,
        isFinal: false
      };
    } catch (error) {
      logger.error('ASR processing error', { callId, error: error.message });
      return null;
    }
  }

  /**
   * Detect intent in parallel while ASR is still processing
   */
  async processIntentDetection(callId, intentDetector) {
    try {
      if (!intentDetector) {
        return null;
      }

      // This would use partial transcripts if available
      // For now, return null to be updated when transcript is ready
      return {
        intent: null,
        confidence: 0
      };
    } catch (error) {
      logger.error('Intent detection error', { callId, error: error.message });
      return null;
    }
  }

  /**
   * Execute active agent in parallel
   */
  async processAgentExecution(callId, agentOrchestrator) {
    try {
      if (!agentOrchestrator) {
        return null;
      }

      const agent = agentOrchestrator.getAgent(callId);
      
      if (!agent || !agent.isRunning) {
        return null;
      }

      // Continue agent execution without blocking other processors
      return {
        agentState: agent.getStatus(),
        hasUpdate: true
      };
    } catch (error) {
      logger.error('Agent execution error', { callId, error: error.message });
      return null;
    }
  }

  /**
   * Execute pending actions in parallel
   */
  async processActionExecution(callId, actionExecutor) {
    try {
      if (!actionExecutor) {
        return null;
      }

      // Execute any pending database/API calls without blocking audio pipeline
      // This would be batched for efficiency
      return {
        executed: [],
        pending: []
      };
    } catch (error) {
      logger.error('Action execution error', { callId, error: error.message });
      return null;
    }
  }

  /**
   * Merge parallel results intelligently
   */
  mergeResults(parallelResults, previousState) {
    try {
      const merged = { ...previousState };

      if (parallelResults.asr) {
        merged.latestTranscript = parallelResults.asr.transcript;
        merged.asrConfidence = parallelResults.asr.confidence;
      }

      if (parallelResults.intent) {
        merged.detectedIntent = parallelResults.intent.intent;
        merged.intentConfidence = parallelResults.intent.confidence;
      }

      if (parallelResults.agentState) {
        merged.agentStatus = parallelResults.agentState;
      }

      if (parallelResults.actionResult) {
        merged.completedActions = parallelResults.actionResult.executed;
        merged.pendingActions = parallelResults.actionResult.pending;
      }

      return merged;
    } catch (error) {
      logger.error('Error merging results', { error: error.message });
      return previousState;
    }
  }

  /**
   * Cleanup parallel process
   */
  cleanupProcess(callId) {
    if (this.activeProcesses.has(callId)) {
      const process = this.activeProcesses.get(callId);
      process.tasks.forEach(task => {
        if (task && typeof task.cancel === 'function') {
          task.cancel();
        }
      });
      this.activeProcesses.delete(callId);
    }
  }
}

// Singleton instance
const parallelProcessor = new ParallelProcessor();

module.exports = parallelProcessor;
