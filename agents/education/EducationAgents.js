// Backend/agents/education/EducationAgents.js
// ✅ PHASE 4: Education/EdTech sector specialized agents

const BaseAgent = require('../BaseAgent');
const resolve = require('../../utils/moduleResolver');
const logger = require(resolve('utils/logger'));

/**
 * AdmissionsFAQAgent
 * Answers frequently asked questions about admissions process
 */
class AdmissionsFAQAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['question_topic'];
    this.sector = 'education';
    this.agentType = 'ADMISSIONS_FAQ';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('🎓 [Education] Answering admissions question', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Search FAQ database
      const answer = this.searchAdmissionsFAQ(this.data.question_topic);

      if (answer) {
        this.result = {
          status: 'answered',
          question_topic: this.data.question_topic,
          answer: answer,
          related_links: [
            'https://admissions.school.edu/requirements',
            'https://admissions.school.edu/application',
            'https://admissions.school.edu/deadlines'
          ],
          follow_up: 'Is there anything else you\'d like to know about admissions?'
        };

        this.state = 'COMPLETED';
        logger.info('✅ [Education] Question answered', { 
          callId: this.callId,
          result: this.result
        });

        this.emit('complete', this.result);
      } else {
        this.result = {
          status: 'escalated',
          question_topic: this.data.question_topic,
          message: 'Your question needs further assistance. Our admissions team will contact you within 24 hours.',
          contact_email: 'admissions@school.edu',
          phone: '(555) 123-4567'
        };

        this.state = 'COMPLETED';
        logger.info('⚠️ [Education] Question escalated', { 
          callId: this.callId
        });

        this.emit('complete', this.result);
      }
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Education] Admissions FAQ error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      question_topic: 'What would you like to know about admissions? (e.g., requirements, application process, deadlines, fees)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  searchAdmissionsFAQ(topic) {
    const faq = {
      'requirements': 'Our admissions requirements include a completed application, official transcripts, standardized test scores (SAT/ACT), and a personal essay.',
      'application': 'You can submit your application online at admissions.school.edu/apply. The process takes about 15-20 minutes.',
      'deadlines': 'Regular Decision deadline is February 1st. Early Decision is November 15th. Rolling admissions begin December 1st.',
      'fees': 'The application fee is $75. Fee waivers are available for qualified students. Submit a FAFSA or CSS Profile to apply.',
      'documents': 'Required documents include high school transcripts, standardized test scores, teacher recommendations, and a personal essay.',
      'essay': 'The essay should be 500-650 words answering our optional essay prompt. It should reflect your personal story and aspirations.',
      'timeline': 'Decisions are released by April 1st for Regular Decision applicants. Early Decision applicants are notified by December 15th.'
    };

    const lowerTopic = topic.toLowerCase();
    for (const [key, answer] of Object.entries(faq)) {
      if (lowerTopic.includes(key)) {
        return answer;
      }
    }

    return null;
  }
}

/**
 * BatchScheduleAgent
 * Provides information about course schedules and batch information
 */
class BatchScheduleAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['program', 'academic_year'];
    this.sector = 'education';
    this.agentType = 'BATCH_SCHEDULE';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('📅 [Education] Fetching batch schedule', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Get batch schedule information
      const batchInfo = this.getBatchSchedule(this.data.program, this.data.academic_year);

      if (!batchInfo) {
        this.emit('error', {
          message: 'Program or academic year not found.',
          field: 'program'
        });
        return;
      }

      this.result = {
        status: 'success',
        program: this.data.program,
        academic_year: this.data.academic_year,
        batch_schedule: batchInfo.schedule,
        total_credits: batchInfo.total_credits,
        core_courses: batchInfo.core_courses,
        electives_available: batchInfo.electives,
        semester_breakdown: batchInfo.semesters,
        message: `Your batch starts on ${batchInfo.schedule[0].start_date}. Total ${batchInfo.total_credits} credits across ${batchInfo.semesters.length} semesters.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Education] Batch schedule retrieved', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Education] Batch schedule error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      program: 'What program are you interested in? (e.g., Bachelor of Science in Computer Science)',
      academic_year: 'Which academic year? (e.g., 2024-2025)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getBatchSchedule(program, academicYear) {
    const schedules = {
      'BACHELOR_CS_2024': {
        schedule: [
          { semester: 1, start_date: '2024-08-20', end_date: '2024-12-15', courses: 4 },
          { semester: 2, start_date: '2025-01-15', end_date: '2025-05-10', courses: 4 },
          { semester: 3, start_date: '2025-08-20', end_date: '2025-12-15', courses: 5 },
          { semester: 4, start_date: '2026-01-15', end_date: '2026-05-10', courses: 5 }
        ],
        total_credits: 120,
        core_courses: ['Data Structures', 'Algorithms', 'Operating Systems', 'Database Systems'],
        electives: ['Machine Learning', 'Web Development', 'Cloud Computing', 'Mobile Apps'],
        semesters: 4
      },
      'BACHELOR_BUS_2024': {
        schedule: [
          { semester: 1, start_date: '2024-09-01', end_date: '2024-12-20', courses: 4 },
          { semester: 2, start_date: '2025-01-20', end_date: '2025-05-15', courses: 4 },
          { semester: 3, start_date: '2025-09-01', end_date: '2025-12-20', courses: 4 },
          { semester: 4, start_date: '2026-01-20', end_date: '2026-05-15', courses: 4 }
        ],
        total_credits: 120,
        core_courses: ['Accounting', 'Finance', 'Marketing', 'Management'],
        electives: ['Entrepreneurship', 'International Business', 'Supply Chain', 'Analytics'],
        semesters: 4
      }
    };

    const key = `${program.toUpperCase()}_${academicYear.split('-')[0]}`;
    return schedules[key] || null;
  }
}

/**
 * EnrollmentAgent
 * Handles student enrollment and course registration
 */
class EnrollmentAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['student_id', 'courses'];
    this.sector = 'education';
    this.agentType = 'ENROLLMENT';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('✍️ [Education] Processing enrollment', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Validate student ID
      if (!this.isValidStudentId(this.data.student_id)) {
        this.emit('error', {
          message: 'Invalid student ID. Please verify and try again.',
          field: 'student_id'
        });
        return;
      }

      // Check course availability
      const availableCourses = this.checkCourseAvailability(this.data.courses);
      
      if (availableCourses.unavailable.length > 0) {
        this.emit('need_escalation', {
          message: `Some courses are not available: ${availableCourses.unavailable.join(', ')}`,
          available_courses: availableCourses.available,
          unavailable_courses: availableCourses.unavailable
        });
        return;
      }

      const enrollmentId = `ENRL_${Date.now()}`;

      this.result = {
        status: 'enrolled',
        enrollment_id: enrollmentId,
        student_id: this.data.student_id,
        courses_enrolled: this.data.courses,
        total_credits: availableCourses.total_credits,
        semester: 'Spring 2024',
        enrollment_confirmation: 'Confirmation email sent to your student email.',
        payment_due: '2024-01-20',
        message: `Successfully enrolled in ${this.data.courses.length} courses totaling ${availableCourses.total_credits} credits.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Education] Enrollment completed', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Education] Enrollment error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      student_id: 'What is your student ID?',
      courses: 'Which courses would you like to enroll in? (comma-separated course codes, e.g., CS101, CS102, MATH201)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  isValidStudentId(studentId) {
    // Simple validation - format: 8 digits
    return /^\d{8}$/.test(studentId);
  }

  checkCourseAvailability(courses) {
    const courseDatabase = {
      'CS101': { credits: 3, available: true, enrolled: 28, capacity: 30 },
      'CS102': { credits: 4, available: true, enrolled: 25, capacity: 30 },
      'MATH201': { credits: 3, available: true, enrolled: 35, capacity: 35 },
      'ENG150': { credits: 3, available: false, enrolled: 40, capacity: 40 },
      'BUS101': { credits: 3, available: true, enrolled: 20, capacity: 25 }
    };

    const available = [];
    const unavailable = [];
    let totalCredits = 0;

    courses.forEach(course => {
      const courseInfo = courseDatabase[course];
      if (courseInfo && courseInfo.available) {
        available.push(course);
        totalCredits += courseInfo.credits;
      } else {
        unavailable.push(course);
      }
    });

    return {
      available,
      unavailable,
      total_credits: totalCredits
    };
  }
}

/**
 * ReminderAgent
 * Sends reminders about important academic deadlines and events
 */
class ReminderAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['reminder_type'];
    this.sector = 'education';
    this.agentType = 'REMINDER';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('⏰ [Education] Setting reminder', { 
        callId: this.callId,
        data: this.data
      });

      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      // Get reminder details
      const reminderDetails = this.getReminderDetails(this.data.reminder_type);

      if (!reminderDetails) {
        this.emit('error', {
          message: 'Invalid reminder type.',
          field: 'reminder_type'
        });
        return;
      }

      const reminderId = `REM_${Date.now()}`;

      this.result = {
        status: 'reminder_set',
        reminder_id: reminderId,
        reminder_type: this.data.reminder_type,
        reminder_date: reminderDetails.date,
        reminder_time: reminderDetails.time,
        description: reminderDetails.description,
        delivery_method: 'Email, SMS, and In-App notification',
        message: `Reminder set for ${reminderDetails.description} on ${reminderDetails.date} at ${reminderDetails.time}.`
      };

      this.state = 'COMPLETED';
      logger.info('✅ [Education] Reminder set', { 
        callId: this.callId,
        result: this.result
      });

      this.emit('complete', this.result);
    } catch (error) {
      this.state = 'ERROR';
      logger.error('❌ [Education] Reminder error', { 
        callId: this.callId,
        error: error.message 
      });
      this.emit('error', { message: error.message });
    }
  }

  getPromptForField(field) {
    const prompts = {
      reminder_type: 'What would you like a reminder for? (Registration Deadline, Exam Date, Assignment Due, Tuition Payment, Grade Review)'
    };
    return prompts[field] || super.getPromptForField(field);
  }

  getReminderDetails(reminderType) {
    const reminders = {
      'REGISTRATION': {
        date: 'March 1, 2024',
        time: '9:00 AM',
        description: 'Course registration deadline for Fall semester'
      },
      'EXAM': {
        date: 'April 15, 2024',
        time: '8:00 AM',
        description: 'Final exam period begins'
      },
      'ASSIGNMENT': {
        date: 'February 28, 2024',
        time: '11:59 PM',
        description: 'Major assignment submissions due'
      },
      'TUITION': {
        date: 'January 15, 2024',
        time: '12:00 PM',
        description: 'Spring semester tuition payment due'
      },
      'GRADES': {
        date: 'December 20, 2023',
        time: '3:00 PM',
        description: 'Final grades posted for review'
      }
    };

    const lowerType = reminderType.toUpperCase();
    return reminders[lowerType] || null;
  }
}

module.exports = {
  AdmissionsFAQAgent,
  BatchScheduleAgent,
  EnrollmentAgent,
  ReminderAgent
};
