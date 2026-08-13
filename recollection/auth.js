// Thin wrapper around Google Identity Services' token client.
// No backend, no client secret — this is the browser-only OAuth flow
// meant for exactly this kind of app.

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let pendingResolve = null;
let pendingReject = null;

function initAuth({ onSignedIn, onError }) {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.DRIVE_SCOPE,
    callback: (resp) => {
      if (resp.error) {
        if (pendingReject) pendingReject(resp);
        pendingResolve = pendingReject = null;
        if (onError) onError(resp);
        return;
      }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + resp.expires_in * 1000;
      if (pendingResolve) pendingResolve(accessToken);
      pendingResolve = pendingReject = null;
      onSignedIn();
    },
  });
}

function signIn() {
  tokenClient.requestAccessToken({ prompt: "consent" });
}

function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiresAt = 0;
}

function isSignedIn() {
  return !!accessToken;
}

// Resolves with a usable access token, refreshing silently if the cached
// one is expired (or about to be) or has been rejected by the API.
function getValidToken(forceRefresh = false) {
  if (!forceRefresh && accessToken && Date.now() < tokenExpiresAt - 60000) {
    return Promise.resolve(accessToken);
  }
  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    tokenClient.requestAccessToken({ prompt: "" });
  });
}
