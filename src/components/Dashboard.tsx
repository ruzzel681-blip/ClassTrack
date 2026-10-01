import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Classroom, UserProfile } from '../types';
import { DailyAttendance } from './DailyAttendance';
import { StudentRoster } from './StudentRoster';
import { AnnouncementsFeed } from './AnnouncementsFeed';
import { AssignmentsList } from './AssignmentsList';
import { ReportsView } from './ReportsView';
import { AuditLogView } from './AuditLogView';
import { ClassesTab } from './ClassesTab';
import {
  Calendar,
  Users,
  Megaphone,
  FileText,
  BarChart3,
  ShieldCheck,
  BookOpen,
  ArrowRight,
} from 'lucide-react';

export type MainTabType =
  | 'attendance'
  | 'roster'
  | 'announcements'
  | 'assignments'
  | 'reports'
  | 'audit'
  | 'classes';

interface DashboardProps {
  selectedClassroom: Classroom | null;
  setSelectedClassroom: (classroom: Classroom | null) => void;
  classrooms: Classroom[];
  loadingClassrooms: boolean;
  refreshClassrooms: () => void;
  activeTab: MainTabType;
  setActiveTab: (tab: MainTabType) => void;
  onStartMessage?: (recipient: UserProfile) => void;
}

const NoClassSelectedPrompt: React.FC<{
  tabName: string;
  onGoToClasses: () => void;
}> = ({ tabName, onGoToClasses }) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center font-mono text-xs my-6">
    <BookOpen className="w-8 h-8 text-sky-400 mx-auto mb-3" />
    <h3 className="text-sm font-semibold text-zinc-200 uppercase mb-1">
      No Active Classroom Selected
    </h3>
    <p className="text-zinc-400 max-w-md mx-auto mb-6 leading-relaxed">
      Please select or create a classroom in the <span className="text-sky-400 font-bold">Classes</span> tab to view {tabName}.
    </p>
    <button
      onClick={onGoToClasses}
      className="px-4 py-2 rounded bg-sky-900 hover:bg-sky-800 border border-sky-700 text-sky-100 font-semibold inline-flex items-center gap-2 transition-colors"
    >
      Go to Classes Tab
      <ArrowRight className="w-4 h-4" />
    </button>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({
  selectedClassroom,
  setSelectedClassroom,
  classrooms,
  loadingClassrooms,
  refreshClassrooms,
  activeTab,
  setActiveTab,
  onStartMessage,
}) => {
  const { userProfile } = useAuth();

  if (!userProfile) return null;

  const isTeacher = userProfile.role === 'teacher';

  return (
    <div className="flex flex-col min-h-full">
      {/* Top Level Navigation Tab Bar - Responsive, Sleek Mobile Scroll Rail */}
      <div className="border-b border-zinc-800 bg-zinc-900/90 sticky top-[49px] z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2">
          <nav className="flex items-center gap-1.5 font-mono text-xs w-full overflow-x-auto no-scrollbar py-0.5">
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-3 py-2 rounded-lg border font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer min-h-[38px] ${
                activeTab === 'attendance'
                  ? 'bg-zinc-800 border-zinc-700 text-sky-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Attendance</span>
            </button>

            <button
              onClick={() => setActiveTab('roster')}
              className={`px-3 py-2 rounded-lg border font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer min-h-[38px] ${
                activeTab === 'roster'
                  ? 'bg-zinc-800 border-zinc-700 text-sky-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>{isTeacher ? 'Roster' : 'Classmates'}</span>
              {selectedClassroom?.studentUids && (
                <span className="bg-zinc-950 border border-zinc-800 text-zinc-300 px-1.5 py-0.2 rounded text-[10px]">
                  {selectedClassroom.studentUids.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('announcements')}
              className={`px-3 py-2 rounded-lg border font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer min-h-[38px] ${
                activeTab === 'announcements'
                  ? 'bg-zinc-800 border-zinc-700 text-sky-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5 shrink-0" />
              <span>Announcements</span>
            </button>

            <button
              onClick={() => setActiveTab('assignments')}
              className={`px-3 py-2 rounded-lg border font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer min-h-[38px] ${
                activeTab === 'assignments'
                  ? 'bg-zinc-800 border-zinc-700 text-sky-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Assignments</span>
            </button>

            {isTeacher && (
              <button
                onClick={() => setActiveTab('reports')}
                className={`px-3 py-2 rounded-lg border font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer min-h-[38px] ${
                  activeTab === 'reports'
                    ? 'bg-zinc-800 border-zinc-700 text-sky-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                <span>Reports & Risk</span>
              </button>
            )}

            {isTeacher && (
              <button
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-2 rounded-lg border font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer min-h-[38px] ${
                  activeTab === 'audit'
                    ? 'bg-zinc-800 border-zinc-700 text-sky-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Audit Log</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('classes')}
              className={`px-3.5 py-2 rounded-lg border font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer sm:ml-auto min-h-[38px] ${
                activeTab === 'classes'
                  ? 'bg-sky-950 border-sky-800 text-sky-300'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Classes</span>
              <span className="bg-sky-900/80 text-sky-200 border border-sky-700 px-1.5 py-0.2 rounded text-[10px]">
                {classrooms.length}
              </span>
            </button>
          </nav>
        </div>
      </div>

      {/* Main Tab Panel Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1">
        {/* Scoped Active Class Summary Banner (shown for scoped tabs) */}
        {selectedClassroom && activeTab !== 'classes' && activeTab !== 'audit' && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg px-4 py-2.5 mb-6 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 uppercase text-[10px] tracking-wider">Active Scope:</span>
              <span className="font-bold text-sky-400">{selectedClassroom.name}</span>
              {selectedClassroom.section && (
                <span className="text-zinc-400">({selectedClassroom.section})</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-zinc-400">
              <span>
                Instructor: <strong className="text-zinc-200">{selectedClassroom.teacherName}</strong>
              </span>
              <span>•</span>
              <span>
                Code: <strong className="text-zinc-200">{selectedClassroom.joinCode}</strong>
              </span>
            </div>
          </div>
        )}

        {loadingClassrooms ? (
          <div className="text-center py-16 font-mono text-xs text-zinc-400">
            Loading classrooms data...
          </div>
        ) : (
          <>
            {activeTab === 'classes' && (
              <ClassesTab
                classrooms={classrooms}
                selectedClassroom={selectedClassroom}
                onSelectClassroom={(c) => {
                  setSelectedClassroom(c);
                  setActiveTab('attendance');
                }}
                onRefreshClassrooms={refreshClassrooms}
              />
            )}

            {activeTab === 'attendance' && (
              selectedClassroom ? (
                <DailyAttendance classroom={selectedClassroom} />
              ) : (
                <NoClassSelectedPrompt
                  tabName="Daily Attendance"
                  onGoToClasses={() => setActiveTab('classes')}
                />
              )
            )}

            {activeTab === 'roster' && (
              selectedClassroom ? (
                <StudentRoster
                  classroom={selectedClassroom}
                  onRosterUpdated={refreshClassrooms}
                  onStartMessage={onStartMessage}
                />
              ) : (
                <NoClassSelectedPrompt
                  tabName="Class Roster"
                  onGoToClasses={() => setActiveTab('classes')}
                />
              )
            )}

            {activeTab === 'announcements' && (
              selectedClassroom ? (
                <AnnouncementsFeed
                  classroom={selectedClassroom}
                  onStartMessage={onStartMessage}
                  onClassroomUpdated={refreshClassrooms}
                />
              ) : (
                <NoClassSelectedPrompt
                  tabName="Announcements"
                  onGoToClasses={() => setActiveTab('classes')}
                />
              )
            )}

            {activeTab === 'assignments' && (
              selectedClassroom ? (
                <AssignmentsList classroom={selectedClassroom} />
              ) : (
                <NoClassSelectedPrompt
                  tabName="Assignments"
                  onGoToClasses={() => setActiveTab('classes')}
                />
              )
            )}

            {activeTab === 'reports' && isTeacher && (
              selectedClassroom ? (
                <ReportsView classroom={selectedClassroom} />
              ) : (
                <NoClassSelectedPrompt
                  tabName="Reports & Risk Analysis"
                  onGoToClasses={() => setActiveTab('classes')}
                />
              )
            )}

            {activeTab === 'audit' && isTeacher && <AuditLogView />}
          </>
        )}
      </div>
    </div>
  );
};
