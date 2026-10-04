import React, { useRef, useState } from 'react';
import {
  Upload,
  File,
  FileText,
  Image as ImageIcon,
  FileCode,
  Archive,
  X,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { processSelectedFile, formatFileSize } from '../lib/fileUpload';

export interface UploadedFileMeta {
  url: string; // Base64 data URL or external URL
  name: string;
  size?: string;
  type?: string;
}

interface FileUploadZoneProps {
  label?: string;
  sublabel?: string;
  value?: UploadedFileMeta | null;
  onChange: (file: UploadedFileMeta | null) => void;
  allowExternalLink?: boolean;
  accept?: string;
  maxSizeMb?: number;
  id?: string;
}

export { formatFileSize };

export function getFileIcon(fileName: string = '', fileType: string = '') {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) || fileType.startsWith('image/')) {
    return <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />;
  }
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) {
    return <Archive className="w-4 h-4 text-amber-400 shrink-0" />;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'html', 'css', 'json', 'sql'].includes(ext)) {
    return <FileCode className="w-4 h-4 text-purple-400 shrink-0" />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'csv', 'xlsx', 'pptx'].includes(ext)) {
    return <FileText className="w-4 h-4 text-sky-400 shrink-0" />;
  }
  return <File className="w-4 h-4 text-zinc-400 shrink-0" />;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  label = 'Attach File / Work',
  sublabel = 'Direct file (<750KB with auto-compression) or Cloud link',
  value,
  onChange,
  allowExternalLink = true,
  accept = '*/*',
  maxSizeMb = 0.8,
  id = 'file-upload-input',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleFileProcess = async (file: File) => {
    setError(null);
    setProcessing(true);
    try {
      const processed = await processSelectedFile(file);
      onChange({
        url: processed.dataUrl,
        name: processed.name,
        size: formatFileSize(processed.size),
        type: processed.type,
      });
    } catch (err: any) {
      setError(
        err.message ||
          'File exceeds 750KB limit. For large documents or videos, please paste a Google Drive / OneDrive link.'
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleAddLink = () => {
    if (!linkUrl.trim()) return;
    let url = linkUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    onChange({
      url,
      name: linkName.trim() || linkUrl.trim(),
      size: 'Cloud / Web Link',
      type: 'link',
    });
    setLinkUrl('');
    setLinkName('');
    setShowLinkInput(false);
  };

  return (
    <div className="space-y-2 font-mono text-xs">
      <div className="flex items-center justify-between">
        <label className="text-zinc-400 uppercase tracking-wider text-[11px] font-semibold">
          {label}
        </label>
        {allowExternalLink && !value && (
          <button
            type="button"
            onClick={() => setShowLinkInput(!showLinkInput)}
            className="text-[11px] text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 transition-colors"
          >
            <LinkIcon className="w-3 h-3" />
            {showLinkInput ? 'Upload file instead' : 'Or paste link'}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-950/60 border border-red-900 rounded text-red-400 text-[11px]">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {value ? (
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {getFileIcon(value.name, value.type)}
            <div className="min-w-0">
              <div className="text-zinc-100 font-medium truncate max-w-[200px] xs:max-w-[280px] sm:max-w-[360px]">
                {value.name}
              </div>
              <div className="text-[10px] text-zinc-400 flex items-center gap-2">
                {value.size && <span>{value.size}</span>}
                <span className="text-emerald-400 inline-flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Ready
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-900 rounded transition-colors shrink-0"
            title="Remove attachment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : showLinkInput ? (
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase block mb-1">
              External Link / Drive URL
            </label>
            <input
              type="url"
              placeholder="https://drive.google.com/... or link to work"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 text-xs focus:outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase block mb-1">
              Title / Display Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Project Demo on Google Drive"
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 text-xs focus:outline-none focus:border-zinc-600"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowLinkInput(false)}
              className="px-2.5 py-1 rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 text-[11px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddLink}
              disabled={!linkUrl.trim()}
              className="px-3 py-1 rounded bg-sky-900 hover:bg-sky-800 border border-sky-700 text-sky-100 font-semibold text-[11px] disabled:opacity-50"
            >
              Attach Link
            </button>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-4 sm:p-5 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-sky-500 bg-sky-950/30'
              : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/60 hover:bg-zinc-950'
          }`}
        >
          <input
            ref={fileInputRef}
            id={id}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileProcess(e.target.files[0]);
              }
            }}
          />

          <Upload className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400 mx-auto mb-1.5" />
          <div className="text-zinc-200 font-semibold text-xs sm:text-[13px]">
            Click to upload or drag & drop
          </div>
          <div className="text-zinc-400 text-[10px] sm:text-[11px] mt-0.5 max-w-sm mx-auto">
            {sublabel}
          </div>
        </div>
      )}
    </div>
  );
};
