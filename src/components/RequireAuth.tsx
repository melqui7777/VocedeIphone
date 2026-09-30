import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function RequireAuth() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#041423',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          border: '3px solid rgba(255,255,255,0.2)',
          borderTopColor: '#007AFF',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '16px'
        }} />
        <p style={{ margin: 0, fontSize: '14px', opacity: 0.8 }}>Carregando Você de iPhone...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}

