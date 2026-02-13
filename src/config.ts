
// Detecta se estamos rodando em localhost
const isLocalhost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_URL = isLocalhost ? 'http://localhost:5001' : '';
