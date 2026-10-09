import React, { useState, useRef } from 'react';
import { X, Upload, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { SellerAvatar } from './SellerAvatar';
import { uploadSellerAvatar, updateSellerPhoto } from '../lib/api';
import type { Seller } from '../lib/database.types';
import './SellerPhotoModal.css';

export interface SellerPhotoModalProps {
  seller: Seller;
  onClose: () => void;
  onSaved: (updatedSeller: Seller) => void;
}

export function SellerPhotoModal({ seller, onClose, onSaved }: SellerPhotoModalProps) {
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(seller.photo_url);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(seller.photo_url);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validações
    if (!file.type.match(/^image\/(jpeg|png|webp|jpg)$/i)) {
      setErrorMsg('Formato inválido. Por favor, envie uma imagem nos formatos JPG, PNG ou WEBP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('A imagem deve ter no máximo 5MB.');
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const newUrl = await uploadSellerAvatar(seller.id, selectedFile);
      setCurrentPhoto(newUrl);
      setSelectedFile(null);
      setSuccessMsg('Foto atualizada com sucesso!');
      onSaved({ ...seller, photo_url: newUrl });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Erro ao salvar foto:', err);
      setErrorMsg(err.message || 'Erro ao processar o upload da imagem.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!confirm(`Deseja realmente remover a foto de ${seller.name}?`)) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await updateSellerPhoto(seller.id, null);
      setCurrentPhoto(null);
      setSelectedFile(null);
      setPreviewUrl(null);
      setSuccessMsg('Foto removida com sucesso!');
      onSaved({ ...seller, photo_url: null });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Erro ao remover foto:', err);
      setErrorMsg(err.message || 'Erro ao remover a foto.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="seller-photo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="seller-photo-modal-header">
          <div>
            <h3 className="seller-photo-modal-title">Foto de Perfil</h3>
            <p className="text-muted text-sm">{seller.name}</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="seller-photo-modal-body">
          {/* Avatar Preview */}
          <div className="seller-photo-preview-area">
            <SellerAvatar
              name={seller.name}
              photoUrl={previewUrl}
              size="xl"
              className="seller-photo-modal-avatar"
            />
            <span className="seller-photo-preview-hint">
              {previewUrl ? 'Pré-visualização do perfil' : 'Sem foto cadastrada'}
            </span>
          </div>

          {/* Feedback messages */}
          {errorMsg && (
            <div className="seller-photo-alert error">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="seller-photo-alert success">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/webp,image/jpg"
            style={{ display: 'none' }}
          />

          {/* Actions */}
          <div className="seller-photo-controls">
            <button
              type="button"
              className="btn-secondary seller-photo-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              <Upload size={16} />
              <span>{previewUrl ? 'Trocar Foto' : 'Enviar Foto'}</span>
            </button>

            {currentPhoto && (
              <button
                type="button"
                className="btn-danger-outline seller-photo-btn"
                onClick={handleRemovePhoto}
                disabled={loading}
              >
                <Trash2 size={16} />
                <span>Remover Foto</span>
              </button>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={loading || !selectedFile}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="seller-photo-spinner" />
                <span>Salvando...</span>
              </>
            ) : (
              <span>Salvar Foto</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
