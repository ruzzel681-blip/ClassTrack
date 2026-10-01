import React, { useState } from 'react';
import { Classroom, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { DailyAttendance } from './DailyAttendance';
import { StudentRoster } from './StudentRoster';
import { AnnouncementsFeed } from './AnnouncementsFeed';
import { AssignmentsList } from './AssignmentsList';
import { ReportsView } from './ReportsView';
import { AuditLogView } from './AuditLogView';
import {
  ArrowLeft,
  Calendar,
  Users,
  Megaphone,
  FileText,
  BarChart3,
  ShieldCheck,
  Copy,
  Check,
  BookOpen,
} from 'lucide-react';

interface ClassDetailProps {
  classroom: Classroom;
  onBack: () => void;
  onStartMessage?: (recipient: UserProfile) => void;
}

type TabType = 'attendance' | 'roster' | 'announcements' | 'assignments' | 'reports' | 'audit';

export const ClassDetail: React.FC<ClassDetailProps> = ({
  classroom,
  onBack,
  onStartMessage,
}) => {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('attendance');
  const [copiedCode, setCopiedCode] = useState(false);

  if (!userProfile) return null;

  const isTeacher = userProfile.role === 'teacher';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(classroom.joinCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans">
      {/* Back link */}
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Classrooms
      </button>

      {/* Classroom Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mb-6 text-zinc-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs text-zinc-400 mb-1 uppercase tracking-wider">
              <span>{classroom.section || 'General Section'}</span>
              {classroom.subject && <span>• {classroom.subject}</span>}
            </div>
            <h1 className="text-2xl font-mono font-bold tracking-tight text-zinc-100">
              {classroom.name}
            </h1>
            <p className="text-xs font-mono text-zinc-400 mt-1">
              Instructor: <strong className="text-zinc-200">{classroom.teacherName}</strong> •{' '}
              {classroom.studentUids?.length || 0} enrolled students
            </p>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded flex items-center gap-2">
              <span className="text-zinc-400 text-[10px] uppercase">Join Code:</span>
              <span className="font-bold text-zinc-100 text-sm tracking-wider">
                {classroom.joinCode}
              </span>
              <button
                onClick={handleCopyCode}
                className="p-1 text-zinc-400 hover:text-zinc-100 rounded"
                title="Copy Join Code"
              >
                {copiedCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 font-mono text-xs mb-6 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-3.5 py-2 rounded-t border-t border-x font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'attendance'
              ? 'bg-zinc-900 border-zinc-800 text-sky-400 border-b-2 border-b-sky-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Daily Attendance
        </button>

        <button
          onClick={() => setActiveTab('roster')}
          className={`px-3.5 py-2 rounded-t border-t border-x font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'roster'
              ? 'bg-zinc-900 border-zinc-800 text-sky-400 border-b-2 border-b-sky-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
          }`}
        >
          <Users className="w-4 h-4" />
          Class Roster ({classroom.studentUids?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab('announcements')}
          className={`px-3.5 py-2 rounded-t border-t border-x font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'announcements'
              ? 'bg-zinc-900 border-zinc-800 text-sky-400 border-b-2 border-b-sky-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          Announcements
        </button>

        <button
          onClick={() => setActiveTab('assignments')}
          className={`px-3.5 py-2 rounded-t border-t border-x font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'assignments'
              ? 'bg-zinc-900 border-zinc-800 text-sky-400 border-b-2 border-b-sky-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
          }`}
        >
          <FileText className="w-4 h-4" />
          Assignments
        </button>

        {isTeacher && (
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3.5 py-2 rounded-t border-t border-x font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'reports'
                ? 'bg-zinc-900 border-zinc-800 text-sky-400 border-b-2 border-b-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Reports & Risk
          </button>
        )}

        {isTeacher && (
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-2 rounded-t border-t border-x font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'audit'
                ? 'bg-zinc-900 border-zinc-800 text-sky-400 border-b-2 border-b-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Audit Log
          </button>
        )}
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === 'attendance' && <DailyAttendance classroom={classroom} />}
        {activeTab === 'roster' && (
          <StudentRoster
            classroom={classroom}
            onRosterUpdated={() => {}}
            onStartMessage={onStartMessage}
          />
        )}
        {activeTab === 'announcements' && (
          <AnnouncementsFeed
            classroom={classroom}
            onStartMessage={onStartMessage}
          />
        )}
        {activeTab === 'assignments' && <AssignmentsList classroom={classroom} />}
        {activeTab === 'reports' && isTeacher && <ReportsView classroom={classroom} />}
        {activeTab === 'audit' && isTeacher && <AuditLogView />}
      </div>
    </div>
  );
};

