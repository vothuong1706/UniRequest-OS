// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/lib/format';
import { cn } from '@/lib/utils';

interface FileDropzoneProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
  maxSizeMB?: number;
  onError?: (message: string) => void;
}

export function FileDropzone({
  file,
  onFileSelect,
  disabled = false,
  maxSizeMB = 20,
  onError,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const isImage = Boolean(file?.type.startsWith('image/'));

  const previewUrl = useMemo(() => {
    if (!file || !file.type.startsWith('image/')) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleCandidate = (candidate: File | null) => {
    if (!candidate) return;
    if (candidate.size > maxSizeMB * 1024 * 1024) {
      onError?.(`Tệp vượt quá giới hạn tối đa ${maxSizeMB}MB.`);
      return;
    }
    onFileSelect(candidate);
  };

  const handleClear = () => {
    if (inputRef.current) inputRef.current.value = '';
    onFileSelect(null);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        disabled={disabled}
        className="hidden"
        onChange={(e) => handleCandidate(e.target.files?.[0] ?? null)}
      />

      {!file ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) handleCandidate(e.dataTransfer.files?.[0] ?? null);
          }}
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors',
            dragging ? 'border-primary bg-muted/60' : 'border-border bg-muted/20',
            disabled && 'pointer-events-none opacity-50'
          )}
        >
          <div className="bg-background mb-3 flex size-10 items-center justify-center rounded-lg border shadow-2xs">
            <Upload className="text-muted-foreground size-4" />
          </div>
          <p className="text-sm font-medium">Kéo thả tệp vào đây</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Ảnh, PDF hoặc tài liệu · Tối đa {maxSizeMB}MB
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Chọn tệp từ máy tính
          </Button>
        </div>
      ) : (
        <div className="bg-card flex items-center gap-3.5 rounded-lg border p-3">
          {isImage && previewUrl ? (
            <img
              src={previewUrl}
              alt={file.name}
              className="size-12 shrink-0 rounded-md border object-cover"
            />
          ) : (
            <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-md">
              <FileText className="text-muted-foreground size-5" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {formatFileSize(file.size)}
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={handleClear}
            aria-label="Xóa tệp đính kèm"
          >
            <Trash2 className="text-destructive size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
