import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserAvatar, PRESET_AVATARS } from './UserAvatar';
import { processSelectedFile } from '../lib/fileUpload';
import {
  X,
  User,
  Sun,
  Moon,
  Check,
  Upload,
  Sparkles,
  Github,
  Linkedin,
  Globe,
  Phone,
  Clock,
  BookOpen,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { userProfile, updateProfileData, theme, toggleTheme } = useAuth();
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [studentId, setStudentId] = useState(userProfile?.studentId || '');
  const [avatar, setAvatar] = useState(userProfile?.avatar || '');
  const [bio, setBio] = useState(userProfile?.bio || '');
  const [department, setDepartment] = useState(userProfile?.department || '');
  const [officeHours, setOfficeHours] = useState(userProfile?.officeHours || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [github, setGithub] = useState(userProfile?.socialLinks?.github || '');
  const [linkedin, setLinkedin] = useState(userProfile?.socialLinks?.linkedin || '');
  const [website, setWebsite] = useState(userProfile?.socialLinks?.website || '');
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !userProfile) return null;

  const isTeacher = userProfile.role === 'teacher';
  const isStudent = userProfile.role === 'student';

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setAvatarError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const processed = await processSelectedFile(file);
      setAvatar(processed.dataUrl);
    } catch (err: any) {
      setAvatarError(err.message || 'Failed to process avatar image.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      await updateProfileData({
        displayName: displayName.trim(),
        studentId: isStudent ? studentId.trim() : undefined,
        avatar: avatar || undefined,
        bio: bio.trim() || undefined,
        department: isTeacher ? department.trim() || undefined : undefined,
        officeHours: isTeacher ? officeHours.trim() || undefined : undefined,
        phone: phone.trim() || undefined,
        socialLinks: {
          github: github.trim() || undefined,
          linkedin: linkedin.trim() || undefined,
          website: website.trim() || undefined,
        },
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to update profile:', err);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 font-sans">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden text-zinc-200">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 bg-zinc-950">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-mono font-semibold text-zinc-100 uppercase tracking-wide">
              Profile & Account Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1 rounded hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs font-mono">
          {/* Avatar Section */}
          <div>
            <label className="block text-zinc-400 uppercase tracking-wider mb-2">
              Profile Picture / Avatar
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-zinc-950 p-3.5 rounded border border-zinc-800">
              <UserAvatar
                displayName={displayName || userProfile.displayName}
                avatar={avatar}
                role={userProfile.role}
                size="xl"
              />
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAvatarUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5 text-sky-400" />
                    Upload Image
                  </button>
                  {avatar && (
                    <button
                      type="button"
                      onClick={() => setAvatar('')}
                      className="px-2.5 py-1.5 rounded text-zinc-400 hover:text-red-400 border border-zinc-800 hover:border-zinc-700"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Preset Avatars */}
                <div className="pt-2 border-t border-zinc-800/80">
                  <span className="text-[10px] text-zinc-500 block mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" /> Quick Badges:
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PRESET_AVATARS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setAvatar(`preset:${p.id}`)}
                        className={`w-7 h-7 rounded-full border flex items-center justify-center text-sm transition-all ${
                          avatar === `preset:${p.id}`
                            ? 'border-sky-400 bg-sky-950 scale-110'
                            : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                        }`}
                        title={p.label}
                      >
                        {p.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {avatarError && (
              <div className="text-red-400 text-[11px] mt-1.5">{avatarError}</div>
            )}
          </div>

          {/* Basic Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div>
              <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input
                type="text"
                value={userProfile.email}
                disabled
                className="w-full bg-zinc-950/50 border border-zinc-800/60 rounded px-3 py-2 text-zinc-400 cursor-not-allowed"
              />
            </div>
          </div>

          {isStudent && (
            <div>
              <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                Student ID
              </label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
                placeholder="e.g. STU-1001"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600"
              />
            </div>
          )}

          {isTeacher && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                  Department / Subject
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Computer Science & AI"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                  Office Hours
                </label>
                <input
                  type="text"
                  value={officeHours}
                  onChange={(e) => setOfficeHours(e.target.value)}
                  placeholder="e.g. Mon/Wed 2:00 PM - 4:00 PM"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-zinc-400 uppercase tracking-wider mb-1">
              Bio & Academic Background
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A brief overview of your academic focus, office location, or interests..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 font-sans text-xs focus:outline-none focus:border-zinc-600"
            />
          </div>

          {/* Social & Contact Links */}
          <div>
            <label className="block text-zinc-400 uppercase tracking-wider mb-1">
              Contact & Social Links
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-zinc-950 p-3 rounded border border-zinc-800">
              <div className="flex items-center gap-2 bg-zinc-900 px-2.5 py-1.5 rounded border border-zinc-800">
                <Github className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <input
                  type="text"
                  placeholder="GitHub username"
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  className="w-full bg-transparent text-zinc-100 text-xs focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 bg-zinc-900 px-2.5 py-1.5 rounded border border-zinc-800">
                <Linkedin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <input
                  type="text"
                  placeholder="LinkedIn username"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                  className="w-full bg-transparent text-zinc-100 text-xs focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 bg-zinc-900 px-2.5 py-1.5 rounded border border-zinc-800">
                <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Website or Portfolio URL"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full bg-transparent text-zinc-100 text-xs focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 bg-zinc-900 px-2.5 py-1.5 rounded border border-zinc-800">
                <Phone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Phone / Office ext."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-transparent text-zinc-100 text-xs focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 uppercase tracking-wider mb-1">
              Role & Status
            </label>
            <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 flex items-center justify-between">
              <span className="uppercase text-zinc-300 font-bold">{userProfile.role}</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] ${
                  userProfile.approved
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-amber-950 text-amber-400 border border-amber-800'
                }`}
              >
                {userProfile.approved ? 'Active & Approved' : 'Pending Teacher Approval'}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800">
            <label className="block text-zinc-400 uppercase tracking-wider mb-2">
              Appearance & Theme
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (theme !== 'light') toggleTheme();
                }}
                className={`py-2 px-3 rounded border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'bg-sky-950 border-sky-600 text-sky-300 font-bold shadow-xs'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                }`}
              >
                <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Day Mode</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (theme !== 'dark') toggleTheme();
                }}
                className={`py-2 px-3 rounded border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-sky-950 border-sky-600 text-sky-300 font-bold shadow-xs'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                }`}
              >
                <Moon className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Night Mode</span>
              </button>
            </div>
          </div>

          {savedSuccess && (
            <div className="bg-emerald-950 border border-emerald-800 text-emerald-300 p-2.5 rounded flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              Profile settings updated successfully.
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded bg-sky-900/80 hover:bg-sky-800 text-sky-100 font-medium border border-sky-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

