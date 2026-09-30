import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { ShaderBackground } from '../components/ShaderBackground';
import logoImg from '../assets/logo.png';
import './Login.css';

export function Login() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    const from = (location.state as { from?: Location })?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setSubmitting(false);
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError('Email ou senha incorretos. Verifique se digitou corretamente.');
        } else if (error.message.includes('Email not confirmed')) {
          setError('Email não confirmado no Supabase. Habilite "Auto Confirm" no painel.');
        } else {
          setError(`Erro ao autenticar: ${error.message}`);
        }
      }
    } catch (err: any) {
      setSubmitting(false);
      setError(err?.message || 'Erro de conexão com o Supabase.');
    }
  };

  return (
    <div className="login-page">
      <ShaderBackground className="login-shader" />
      <div className="login-card">
        <img src={logoImg} alt="Você de iPhone" className="login-logo" />
        <form className="login-form" onSubmit={handleSubmit}>
          {!isSupabaseConfigured && (
            <div className="login-error">
              Sistema sem configuração do Supabase. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas
              variáveis de ambiente (na Vercel: Settings → Environment Variables) e faça um novo deploy.
            </div>
          )}
          {error && <div className="login-error">{error}</div>}
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
              required
            />
          </div>
          <div className="login-field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
              required
            />
          </div>
          <button type="submit" className="btn-primary login-submit" disabled={submitting || !isSupabaseConfigured}>
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}


