import { supabase } from './supabaseClient';

const ETSY_CLIENT_ID = import.meta.env.VITE_ETSY_CLIENT_ID;
const REDIRECT_URI = window.location.origin + '/auth/etsy/callback';

export const startEtsyOAuth = async () => {
  // PKCE Code Challenge Generation
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await deriveCodeChallenge(codeVerifier);
  
  // Store verifier in local storage for the callback
  localStorage.setItem('etsy_code_verifier', codeVerifier);

  const state = generateRandomString(32);
  localStorage.setItem('etsy_oauth_state', state);

  const scopes = 'address_r%20billing_r%20cart_r%20email_r%20favorites_r%20feedback_r%20listings_d%20listings_r%20listings_w%20profile_r%20profile_w%20recommendations_r%20shops_r%20shops_w%20transactions_r%20transactions_w';

  const authUrl = `https://www.etsy.com/oauth/connect?` +
    `response_type=code&` +
    `client_id=${ETSY_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `scope=${scopes}&` +
    `state=${state}&` +
    `code_challenge=${codeChallenge}&` +
    `code_challenge_method=S256`;

  window.location.href = authUrl;
};

// Helpers for PKCE
function generateRandomString(length: number) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function deriveCodeChallenge(codeVerifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return b64urlEncode(digest);
}

function b64urlEncode(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
