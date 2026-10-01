import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import {
  AlertCircle,
  Lock,
  Mail,
  User,
  ShieldCheck,
  GraduationCap,
  ArrowRight,
  Loader2,
  Sun,
  Moon,
  CheckCircle2,
  Calendar,
  Video,
  FileText,
  Eye,
  EyeOff,
} from 'lucide-react';

export const AuthScreen: React.FC = () => {
  const {
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    theme,
    toggleTheme,
  } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [role, setRole] = useState<UserRole>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'signup') {
        if (!email || !password || !displayName) {
          throw new Error('Please fill in all required fields.');
        }
        if (role === 'student' && !studentId.trim()) {
          throw new Error('Please enter your Student ID.');
        }
        await signUpWithEmail(
          email.trim(),
          password,
          displayName.trim(),
          role,
          role === 'student' ? studentId.trim() : undefined
        );
      } else {
        if (!email || !password) {
          throw new Error('Please enter email and password.');
        }
        await signInWithEmail(email.trim(), password);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      let msg = err.message || 'Authentication failed.';
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'
      ) {
        msg = 'Invalid email or password. If you do not have an account yet, select "Create Account" above.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'An account already exists with this email address. Please select "Log In" above.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      }
      setError(msg);
    }
    setSubmitting(false);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle(role, role === 'student' ? studentId : undefined);
    } catch (err: any) {
      console.error('Google auth error:', err);
      setError(
        err.message ||
          'Google authentication failed. Please use Email & Password to sign in or register.'
      );
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between font-sans relative">
      {/* Top Header with Brand and Theme Switcher */}
      <header className="w-full border-b border-zinc-800/80 bg-zinc-950 px-4 sm:px-8 py-3 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold font-mono text-sm shadow-xs shrink-0">
            CT
          </div>
          <span className="font-mono text-base sm:text-lg font-bold tracking-tight text-zinc-100">
            ClassTrack
          </span>
          <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-800/80 text-zinc-300 font-medium">
            Academic Platform
          </span>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="px-3 py-1.5 rounded-xl border border-zinc-700 bg-zinc-900/90 text-zinc-200 hover:text-zinc-100 hover:bg-zinc-800 shadow-xs transition-all cursor-pointer flex items-center gap-2 text-xs font-mono shrink-0"
          title={`Switch to ${theme === 'dark' ? 'Day Mode' : 'Night Mode'}`}
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          )}
          <span className="font-semibold text-[11px] sm:text-xs">
            {theme === 'dark' ? 'Day Mode' : 'Night Mode'}
          </span>
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-x-hidden">
        {/* Left Visual Hero Pane */}
        <div className="dot-grid-bg flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-16 border-b lg:border-b-0 lg:border-r border-zinc-800/80 w-full">
          <div className="space-y-4 lg:space-y-6 my-auto max-w-lg w-full">
            <div className="space-y-2 lg:space-y-3">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                <span>Unified Academic Management</span>
              </div>
              <h1 className="font-syne text-2xl sm:text-4xl lg:text-3xl xl:text-4xl 2xl:text-5xl font-extrabold uppercase leading-[1.05] tracking-tight text-zinc-100">
                <span className="block whitespace-nowrap">Classroom</span>
                <span className="block text-blue-500 whitespace-nowrap">Connected.</span>
              </h1>
              <p className="text-xs sm:text-sm lg:text-base text-zinc-400 leading-relaxed font-normal max-w-md">
                Attendance intelligence, student assignments, persistent Google Meet classrooms, and secure messaging in one unified workspace.
              </p>
            </div>

            {/* Feature Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 pt-1 max-w-md">
              <div className="flex items-center gap-2.5 p-2 sm:p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-300">
                <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">Smart Attendance & QR</span>
              </div>
              <div className="flex items-center gap-2.5 p-2 sm:p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-300">
                <Video className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="truncate">1-Tap Google Meet Rooms</span>
              </div>
              <div className="flex items-center gap-2.5 p-2 sm:p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-300">
                <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">Assignment Submissions</span>
              </div>
              <div className="flex items-center gap-2.5 p-2 sm:p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-300">
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="truncate">Role-Based Security</span>
              </div>
            </div>
          </div>

          <div className="text-xs font-mono text-zinc-500 hidden lg:flex items-center gap-2 pt-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Real-time database sync active</span>
          </div>
        </div>

        {/* Right Form Pane */}
        <div className="p-4 sm:p-8 lg:p-10 xl:p-14 flex flex-col justify-center max-w-md sm:max-w-lg mx-auto w-full">
          {/* Segmented Log In / Sign Up Controls */}
          <div className="flex p-1 bg-zinc-900 border border-zinc-800 rounded-xl mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2 text-center text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`flex-1 py-2 text-center text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-5 bg-red-950/70 border border-red-800 text-red-300 p-3.5 rounded-xl text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          {/* Form Fields */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                {/* Role Selector */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Account Role
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole('student')}
                      className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        role === 'student'
                          ? 'bg-blue-500/10 border-blue-500 text-blue-500 font-bold'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span>Student</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('teacher')}
                      className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        role === 'teacher'
                          ? 'bg-blue-500/10 border-blue-500 text-blue-500 font-bold'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Teacher</span>
                    </button>
                  </div>
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative flex items-center">
                    <User className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={role === 'teacher' ? 'Prof. Alex Smith' : 'Jane Doe'}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition-all font-sans"
                    />
                  </div>
                </div>

                {/* Student ID */}
                {role === 'student' && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Student ID Number
                    </label>
                    <input
                      type="text"
                      required
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      placeholder="e.g. STU-2026-001"
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition-all font-mono"
                    />
                  </div>
                )}

                {/* Teacher Approval notice */}
                {role === 'teacher' && (
                  <div className="bg-amber-950/40 border border-amber-800/80 text-amber-300 p-3 rounded-xl text-xs flex items-start gap-2.5 leading-relaxed">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      New teacher accounts require approval from an existing teacher or admin before full teacher permissions are activated.
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@school.edu"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition-all font-sans"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {showPassword ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Show</span>
                    </>
                  )}
                </button>
              </div>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-9 pr-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition-all font-sans"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-sm hover:shadow-md disabled:opacity-50 cursor-pointer mt-1"
            >
              {submitting
                ? 'Please wait...'
                : mode === 'login'
                ? 'Log In to ClassTrack'
                : 'Create My Account'}
            </button>
          </form>

          {/* Divider */}
          <div className="text-center my-5 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800"></div>
            </div>
            <span className="relative bg-zinc-950 px-3 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
              Or continue with
            </span>
          </div>

          {/* Google Sign In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting}
            className="w-full bg-zinc-900 hover:bg-zinc-850 border border-zinc-700 hover:border-zinc-600 text-zinc-200 py-2.5 px-4 rounded-xl flex items-center justify-center gap-3 text-xs font-medium transition-all disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9c-.2-.8-.4-1.6-.4-2.3z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16C3.7 19.7 7.5 22.3 12 23z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-4 sm:px-6 py-3 border-t border-zinc-800/80 flex flex-col sm:flex-row justify-between items-center text-xs text-zinc-500 gap-2 bg-zinc-950 text-center sm:text-left shrink-0">
        <div>ClassTrack Academic Management System</div>
        <div>&copy; {new Date().getFullYear()} Team Carl. All rights reserved.</div>
      </footer>
    </div>
  );
};
