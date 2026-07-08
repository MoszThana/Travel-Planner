'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import styles from './AttachmentsModal.module.css';

interface Attachment {
  id: string;
  name: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: number;
}

interface AttachmentsModalProps {
  tripId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AttachmentsModal: React.FC<AttachmentsModalProps> = ({ tripId, isOpen, onClose }) => {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAttachments = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiRequest(`/upload?tripId=${tripId}`);
      setAttachments(data);
    } catch (err: any) {
      console.error('Error fetching attachments:', err);
      setErrorMsg(err.message || 'Failed to load files.');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    if (isOpen) {
      loadAttachments();
      setSelectedFile(null);
      setErrorMsg(null);
    }
  }, [isOpen, loadAttachments]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('tripId', tripId);
    if (user) {
      formData.append('uploadedBy', user.id);
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json() as any;
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload file.');
      }

      setSelectedFile(null);
      loadAttachments();
    } catch (err: any) {
      console.error('Upload error:', err);
      setErrorMsg(err.message || 'Failed to upload file.');
    } finally {
      setUploading(false);
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType === 'application/pdf') return '📕';
    if (mimeType.includes('word') || mimeType.includes('officedocument')) return '📘';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📗';
    return '📄';
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <span className={styles.icon}>📁</span>
            <h3 className={styles.title}>Trip Documents & Files</h3>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div className={styles.body}>
          {errorMsg && (
            <div className={styles.errorAlert}>
              <span>❌ {errorMsg}</span>
            </div>
          )}

          {/* Upload Form */}
          <div className={styles.uploadSection}>
            <label className={styles.fileLabel}>
              <input type="file" className={styles.fileInput} onChange={handleFileChange} />
              <div className={styles.uploadBox}>
                <span>📎 {selectedFile ? selectedFile.name : 'Select PDF, Receipt, Image...'}</span>
                {selectedFile && <span className={styles.fileSize}>{formatBytes(selectedFile.size)}</span>}
              </div>
            </label>
            
            {selectedFile && (
              <button 
                className={styles.uploadBtn} 
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? 'Uploading file...' : '📤 Upload File'}
              </button>
            )}
          </div>

          <div className={styles.divider} />

          {/* Files List */}
          <h4 className={styles.sectionTitle}>Uploaded Files</h4>
          {loading ? (
            <div className={styles.loadingState}>Loading files...</div>
          ) : attachments.length === 0 ? (
            <div className={styles.emptyState}>No receipts or vouchers uploaded yet.</div>
          ) : (
            <div className={styles.fileList}>
              {attachments.map((file) => (
                <div key={file.id} className={styles.fileCard}>
                  <div className={styles.fileIcon}>{getFileIcon(file.mimeType)}</div>
                  <div className={styles.fileDetails}>
                    <a 
                      href={file.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className={styles.fileName}
                    >
                      {file.name}
                    </a>
                    <span className={styles.fileMeta}>
                      {formatBytes(file.fileSize)} • {new Date(file.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <a 
                    href={file.fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className={styles.viewLink}
                    title="View Document"
                  >
                    ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
