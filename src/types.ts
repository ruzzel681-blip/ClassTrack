export type UserRole = 'teacher' | 'student';

export interface SocialLinks {
  github?: string;
  linkedin?: string;
  website?: string;
  twitter?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  approved: boolean; // Teachers require approval before accessing app features
  studentId?: string; // Student ID e.g. STU-1001
  avatar?: string; // Base64 or preset avatar identifier
  bio?: string;
  phone?: string;
  officeHours?: string;
  department?: string;
  socialLinks?: SocialLinks;
  createdAt: string;
  updatedAt?: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late';

export interface AttendanceOverrideLog {
  previousStatus: AttendanceStatus;
  newStatus: AttendanceStatus;
  modifiedByUid: string;
  modifiedByName: string;
  timestamp: string;
  reason: string;
}

export interface AttendanceRecord {
  id: string;
  classId: string;
  date: string; // YYYY-MM-DD
  studentUid: string;
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  markedByUid: string;
  markedByName: string;
  selfCheckIn?: boolean;
  createdAt: string;
  updatedAt: string;
  overrides?: AttendanceOverrideLog[];
}

export interface StudentInfo {
  uid: string;
  studentId: string;
  displayName: string;
  email: string;
  avatar?: string;
  joinedAt?: string;
}

export interface Classroom {
  id: string;
  name: string;
  section?: string;
  subject?: string;
  teacherId: string;
  teacherName: string;
  joinCode: string;
  studentUids: string[];
  blockedStudentUids?: string[]; // Students restricted from this classroom
  studentsMap?: Record<string, StudentInfo>; // Map of studentUid -> StudentInfo
  meetUrl?: string; // Saved recurring Google Meet link for this classroom
  createdAt: string;
  updatedAt?: string;
}

export type TargetAudience = 'all' | 'students_only' | 'teachers_only';

export interface Announcement {
  id: string;
  classId: string;
  title: string;
  content: string;
  authorUid: string;
  authorName: string;
  authorRole: UserRole;
  authorAvatar?: string;
  targetAudience?: TargetAudience;
  attachmentUrl?: string; // Base64 encoded file data URL or web link
  attachmentName?: string;
  attachmentSize?: string;
  attachmentType?: string;
  meetUrl?: string;
  createdAt: string;
}

export type CommentType = 'public' | 'private';

export interface AnnouncementComment {
  id: string;
  announcementId: string;
  classId: string;
  content: string;
  commentType?: CommentType;
  authorUid: string;
  authorName: string;
  authorRole: UserRole;
  authorAvatar?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: string;
  createdAt: string;
}

export interface Assignment {
  id: string;
  classId: string;
  title: string;
  instructions: string;
  dueDate: string; // ISO string or YYYY-MM-DDTHH:mm
  maxPoints: number;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: string;
  attachmentType?: string;
  teacherId?: string;
  teacherName?: string;
  createdAt: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  classId: string;
  studentUid: string;
  studentName: string;
  studentId: string;
  content: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: string;
  attachmentType?: string;
  submittedAt: string;
  isLate?: boolean;
  status: 'submitted' | 'graded';
  score?: number;
  feedback?: string;
  gradedAt?: string;
  gradedByName?: string;
  gradedByUid?: string;
}

export interface DirectMessage {
  id: string;
  senderUid: string;
  senderName: string;
  senderRole: UserRole;
  senderAvatar?: string;
  recipientUid: string;
  recipientName: string;
  recipientRole: UserRole;
  recipientAvatar?: string;
  message: string;
  attachmentUrl?: string;
  attachmentName?: string;
  read: boolean;
  timestamp: string;
  classId?: string;
}

export type AuditActionType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'ATTENDANCE_MARKED'
  | 'ATTENDANCE_OVERRIDE'
  | 'SELF_CHECK_IN'
  | 'TEACHER_APPROVED'
  | 'TEACHER_REJECTED'
  | 'STUDENT_ADDED'
  | 'STUDENT_REMOVED'
  | 'STUDENT_BLOCKED'
  | 'STUDENT_UNBLOCKED'
  | 'CLASS_CREATED'
  | 'ANNOUNCEMENT_POSTED'
  | 'MEET_LINK_SAVED'
  | 'ASSIGNMENT_CREATED'
  | 'WORK_SUBMITTED'
  | 'WORK_GRADED'
  | 'DIRECT_MESSAGE_SENT';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userUid: string;
  userName: string;
  userRole: UserRole;
  action: AuditActionType;
  details: string;
  classId?: string;
}

