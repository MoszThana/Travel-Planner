'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import styles from './AttachmentsModal.module.css';
import { useTranslation } from '@/context/TranslationContext';
import { Icon, IconName } from './Icon';

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
  const { t, locale } = useTranslation();
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
      setErrorMsg(err.message || t('files.load_failed'));
    } finally {
      setLoading(false);
    }
    // t() is recreated each render; only reload when the trip changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        throw new Error(data.error || t('files.upload_failed'));
      }

      setSelectedFile(null);
      loadAttachments();
    } catch (err: any) {
      console.error('Upload error:', err);
      setErrorMsg(err.message || t('files.upload_failed'));
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

  const getFileIcon = (mimeType: string): IconName => {
    if (!mimeType) return 'file';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return 'fileText';
  };

  if (!isOpen) return null;

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="sheet-title">{t('files.title')}</h2>
          <button className="btn-icon" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {errorMsg && <div className="form-error">{errorMsg}</div>}

        {/* Upload */}
        <div className={styles.uploadSection}>
          <label className={styles.fileLabel}>
            <input type="file" className={styles.fileInput} onChange={handleFileChange} />
            <div className={styles.uploadBox}>
              <Icon name="upload" size={22} className={styles.uploadIcon} />
              <span className={styles.uploadText}>
                {selectedFile ? selectedFile.name : t('files.choose')}
              </span>
              {selectedFile && <span className={styles.fileSize}>{formatBytes(selectedFile.size)}</span>}
            </div>
          </label>

          {selectedFile && (
            <button className="btn btn-primary btn-block" onClick={handleUpload} disabled={uploading}>
              {uploading ? t('files.uploading') : t('files.upload')}
            </button>
          )}
        </div>

        {/* Files List */}
        <section className="section">
          <span className="eyebrow">{t('files.uploaded')}</span>
          {loading ? (
            <div className="empty">{t('files.loading')}</div>
          ) : attachments.length === 0 ? (
            <div className="empty">
              <Icon name="paperclip" size={24} />
              {t('files.empty')}
            </div>
          ) : (
            <div className="list">
              {attachments.map((file) => (
                <a
                  key={file.id}
                  href={file.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`list-row ${styles.fileRow}`}
                >
                  <span className={styles.fileIcon}>
                    <Icon name={getFileIcon(file.mimeType)} size={18} />
                  </span>
                  <span className={styles.fileDetails}>
                    <span className={styles.fileName}>{file.name}</span>
                    <span className={styles.fileMeta}>
                      {formatBytes(file.fileSize)} · {new Date(file.createdAt).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </span>
                  <Icon name="arrowUpRight" size={16} className={styles.viewIcon} />
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
