import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';
import { UserAvatar } from './UserAvatar';
import {
  GraduationCap,
  Mail,
  Clock,
  MessageSquare,
  Globe,
  Github,
  Linkedin,
  Phone,
  Search,
  CheckCircle2,
  X,
} from 'lucide-react';

interface FacultyDirectoryProps {
  isOpen?: boolean;
  onClose?: () => void;
  onStartMessage?: (recipient: UserProfile) => void;
}

const DEFAULT_FACULTY: UserProfile[] = [
  {
    uid: 'teacher_jenkins',
    email: 'sarah.jenkins@classtrack.edu',
    displayName: 'Prof. Sarah Jenkins',
    role: 'teacher',
    approved: true,
    department: 'Department of Computer Science',
    bio: 'Lead Instructor for CS101, Data Structures, and Software Architecture. Office open for all students.',
    officeHours: 'Mon/Wed 2:00 PM - 4:30 PM (Lab 402)',
    phone: '+1 (555) 234-8901',
    socialLinks: {
      github: 'sarah-jenkins-cs',
      linkedin: 'sarah-jenkins-edu',
      website: 'https://classtrack.edu/faculty/jenkins',
    },
    createdAt: '2026-01-10T08:00:00.000Z',
  },
  {
    uid: 'teacher_turing',
    email: 'alan.turing@classtrack.edu',
    displayName: 'Dr. Alan Turing',
    role: 'teacher',
    approved: true,
    department: 'Computation & Discrete Mathematics',
    bio: 'Specialist in Automata Theory, Computational Complexity, Cryptography, and Advanced Algorithms.',
    officeHours: 'Tue/Thu 10:00 AM - 1:00 PM (Math Wing B-12)',
    phone: '+1 (555) 314-1592',
    socialLinks: {
      github: 'alan-turing-math',
      website: 'https://classtrack.edu/faculty/turing',
    },
    createdAt: '2026-01-10T08:00:00.000Z',
  },
  {
    uid: 'teacher_rostova',
    email: 'elena.rostova@classtrack.edu',
    displayName: 'Dr. Elena Rostova',
    role: 'teacher',
    approved: true,
    department: 'Artificial Intelligence & Robotics',
    bio: 'Research lead in Neural Networks, Deep Learning Models, Computer Vision, and Autonomous Embedded Systems.',
    officeHours: 'Friday 1:00 PM - 5:00 PM (AI Research Lab 3B)',
    phone: '+1 (555) 789-0123',
    socialLinks: {
      github: 'elena-rostova-ai',
      linkedin: 'elena-rostova-phd',
    },
    createdAt: '2026-01-15T09:00:00.000Z',
  },
  {
    uid: 'teacher_vance',
    email: 'marcus.vance@classtrack.edu',
    displayName: 'Prof. Marcus Vance',
    role: 'teacher',
    approved: true,
    department: 'Calculus & Applied Physics',
    bio: 'Differential Equations, Multivariable Calculus, Classical Mechanics, and Applied Engineering Modeling.',
    officeHours: 'Mon/Fri 9:00 AM - 11:30 AM (Science Hall 201)',
    phone: '+1 (555) 456-7890',
    socialLinks: {
      linkedin: 'marcus-vance-calculus',
    },
    createdAt: '2026-02-01T10:00:00.000Z',
  },
];

export const FacultyDirectory: React.FC<FacultyDirectoryProps> = ({
  isOpen,
  onClose,
  onStartMessage,
}) => {
  const [faculty, setFaculty] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const fetchFaculty = async () => {
    setLoading(true);
    const list: UserProfile[] = [...DEFAULT_FACULTY];

    try {
      const q = query(collection(db, 'users'), where('role', '==', 'teacher'));
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const u = d.data() as UserProfile;
        if (u.approved !== false) {
          if (!list.some((existing) => existing.uid === u.uid || existing.email === u.email)) {
            list.push(u);
          }
        }
      });
    } catch (err) {
      console.warn('Firestore faculty query notice:', err);
    }

    // Sort alphabetically by displayName
    list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    setFaculty(list);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen !== false) {
      fetchFaculty();
    }
  }, [isOpen]);

  if (isOpen === false) return null;

  const filteredFaculty = faculty.filter((f) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.displayName?.toLowerCase().includes(q) ||
      f.email?.toLowerCase().includes(q) ||
      f.department?.toLowerCase().includes(q) ||
      f.bio?.toLowerCase().includes(q) ||
      f.officeHours?.toLowerCase().includes(q)
    );
  });

  const content = (
    <div className="flex flex-col h-full max-h-[85vh] font-sans">
      {/* Modal Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 p-4 sm:p-5 shrink-0 bg-zinc-900/90 rounded-t-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold font-mono text-zinc-100 uppercase tracking-tight flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-sky-400 shrink-0" />
              <span>Faculty & Instructor Directory</span>
            </h2>
            <p className="text-[11px] sm:text-xs font-mono text-zinc-400 mt-0.5">
              Verified academic faculty, office hours, and contacts
            </p>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="sm:hidden p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg"
              title="Close Directory"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by name, dept, subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-sky-500 rounded-lg pl-9 pr-8 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="hidden sm:flex p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg border border-zinc-800 transition-colors"
              title="Close Directory"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
        {loading ? (
          <div className="py-16 text-center font-mono text-xs text-zinc-400">
            Loading faculty profiles...
          </div>
        ) : filteredFaculty.length === 0 ? (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-8 text-center font-mono text-xs text-zinc-400 space-y-3">
            <GraduationCap className="w-10 h-10 text-zinc-600 mx-auto" />
            <div className="text-zinc-300 font-semibold">No faculty members found</div>
            <p className="text-zinc-500 max-w-sm mx-auto">
              No instructors match your search query &quot;{searchQuery}&quot;. Try searching with another term.
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono cursor-pointer"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {filteredFaculty.map((member) => (
              <div
                key={member.uid}
                className="bg-zinc-950/90 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 sm:p-5 flex flex-col justify-between transition-all shadow-sm group"
              >
                <div className="space-y-3">
                  {/* Profile Header */}
                  <div className="flex items-start gap-3">
                    <UserAvatar
                      displayName={member.displayName}
                      avatar={member.avatar}
                      role="teacher"
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-bold text-sm sm:text-base text-zinc-100 break-words leading-tight">
                          {member.displayName}
                        </h3>
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-sky-950 text-sky-400 border border-sky-800">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                        </span>
                      </div>

                      <div className="text-xs font-mono text-sky-400 break-words mt-0.5 leading-snug">
                        {member.department || 'Academic Faculty'}
                      </div>

                      <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1 mt-1 break-all">
                        <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <a
                          href={`mailto:${member.email}`}
                          className="hover:text-zinc-200 hover:underline"
                        >
                          {member.email}
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Bio / Description */}
                  {member.bio && (
                    <p className="text-xs text-zinc-300 font-sans leading-relaxed bg-zinc-900/90 p-3 rounded-lg border border-zinc-800/80 break-words whitespace-normal">
                      {member.bio}
                    </p>
                  )}

                  {/* Meta details */}
                  <div className="space-y-2 font-mono text-xs text-zinc-300 bg-zinc-900/90 p-3 rounded-lg border border-zinc-800">
                    {member.officeHours && (
                      <div className="flex items-start gap-2">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <span className="text-zinc-500 uppercase text-[10px] block font-semibold tracking-wider">
                            OFFICE HOURS:
                          </span>
                          <span className="text-zinc-200 text-xs break-words whitespace-normal leading-relaxed block">
                            {member.officeHours}
                          </span>
                        </div>
                      </div>
                    )}

                    {member.phone && (
                      <div className="flex items-start gap-2 pt-1.5 border-t border-zinc-800/60">
                        <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <span className="text-zinc-500 uppercase text-[10px] font-semibold tracking-wider block">
                            PHONE:
                          </span>
                          <span className="text-zinc-200 text-xs break-words whitespace-normal block">
                            {member.phone}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Social / Web Links */}
                    {member.socialLinks && (
                      <div className="flex items-center gap-2 pt-1.5 border-t border-zinc-800/60 flex-wrap">
                        <span className="text-zinc-500 uppercase text-[10px] font-semibold tracking-wider">
                          LINKS:
                        </span>
                        {member.socialLinks.github && (
                          <a
                            href={
                              member.socialLinks.github.startsWith('http')
                                ? member.socialLinks.github
                                : `https://github.com/${member.socialLinks.github}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="text-zinc-400 hover:text-zinc-100 transition-colors p-1 rounded hover:bg-zinc-800"
                            title="GitHub Profile"
                          >
                            <Github className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {member.socialLinks.linkedin && (
                          <a
                            href={
                              member.socialLinks.linkedin.startsWith('http')
                                ? member.socialLinks.linkedin
                                : `https://linkedin.com/in/${member.socialLinks.linkedin}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="text-zinc-400 hover:text-sky-400 transition-colors p-1 rounded hover:bg-zinc-800"
                            title="LinkedIn Profile"
                          >
                            <Linkedin className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {member.socialLinks.website && (
                          <a
                            href={
                              member.socialLinks.website.startsWith('http')
                                ? member.socialLinks.website
                                : `https://${member.socialLinks.website}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="text-zinc-400 hover:text-emerald-400 transition-colors p-1 rounded hover:bg-zinc-800"
                            title="Faculty Website"
                          >
                            <Globe className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Direct Message Action */}
                {onStartMessage && (
                  <button
                    onClick={() => {
                      if (onClose) onClose();
                      onStartMessage(member);
                    }}
                    className="w-full mt-3 py-2 px-3 rounded-lg bg-zinc-800 hover:bg-sky-600 hover:border-sky-500 text-zinc-100 hover:text-white border border-zinc-700 font-mono text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm min-h-[38px]"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-sky-400 group-hover:text-white transition-colors" />
                    <span>Send Direct Message</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // If used as modal (when isOpen is passed as boolean)
  if (isOpen !== undefined) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden">
          {content}
        </div>
      </div>
    );
  }

  // Standalone mode
  return content;
};
