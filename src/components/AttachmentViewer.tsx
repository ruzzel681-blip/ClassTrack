import React from 'react';
import {
  Download,
  ExternalLink,
  Video,
  File,
  FileText,
  Image as ImageIcon,
  FileCode,
  Archive,
} from 'lucide-react';

interface AttachmentViewerProps {
  url?: string;
  name?: string;
  size?: string;
  type?: string;
  className?: string;
}

function getFileIcon(fileName: string = '', fileType: string = '') {
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

export const AttachmentViewer: React.FC<AttachmentViewerProps> = ({
  url,
  name = 'Attachment',
  size,
  type,
  className = '',
}) => {
  if (!url) return null;

  const isDataUrl = url.startsWith('data:');
  const isImage =
    (type && type.startsWith('image/')) ||
    /\.(png|jpe?g|gif|webp|svg)($|\?)/i.test(name) ||
    url.startsWith('data:image/');

  return (
    <div className={`space-y-2 ${className}`}>
      {/* If it's an image data URL, display a preview thumbnail */}
      {isImage && (
        <div className="rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 max-w-sm">
          <img
            src={url}
            alt={name}
            referrerPolicy="no-referrer"
            className="w-full h-auto max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => window.open(url, '_blank')}
          />
        </div>
      )}

      {/* Attachment card bar */}
      <div className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-lg p-2.5 sm:p-3 flex items-center justify-between gap-3 font-mono text-xs transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          {getFileIcon(name, type)}
          <div className="min-w-0">
            <div className="text-zinc-200 font-semibold truncate max-w-[180px] xs:max-w-[260px] sm:max-w-[340px]">
              {name}
            </div>
            {size && <div className="text-[10px] text-zinc-400">{size}</div>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isDataUrl ? (
            <a
              href={url}
              download={name}
              className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-sky-400 hover:text-sky-300 inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors"
              title="Download File"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </a>
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-sky-400 hover:text-sky-300 inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Link</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
