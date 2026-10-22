// Navigasi berbasis hash, agar tombol Kembali di HP bekerja seperti biasa.

export function parseRoute(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || '', arg: parts[1] || null, parts };
}

export function routeHash(name, arg) {
  return '#/' + [name, arg].filter(x => x !== null && x !== undefined && x !== '').map(encodeURIComponent).join('/');
}

let inAppDepth = 0;
window.addEventListener('hashchange', () => { inAppDepth++; });

export function go(name, arg, { replace = false } = {}) {
  const hash = routeHash(name, arg);
  if (replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

// Kembali ke layar sebelumnya di aplikasi; bila tidak ada, ke beranda.
export function back(fallback = '') {
  if (inAppDepth > 0 && history.length > 1) history.back();
  else go(fallback, null, { replace: true });
}
