var GOOGLE_CLIENT_ID = '284743039293-0lo05gnap8immcls45hqsniv16djtdap.apps.googleusercontent.com';

var authUser = null;
var authToken = null;

function getAuthHeaders() {
  if (!authToken) return {};
  return { 'Authorization': 'Bearer ' + authToken };
}

async function authFetch(url, opts) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers || {}, getAuthHeaders());
  var res = await fetch(url, opts);
  if (res.status === 401 && authUser) {
    authToken = null;
    localStorage.removeItem('geo_auth_token');
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.prompt(function(notification) {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          signOut();
        }
      });
    } else {
      signOut();
    }
  }
  return res;
}

function onSignIn(response) {
  authToken = response.credential;
  var parts = authToken.split('.');
  var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  authUser = {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture
  };
  localStorage.setItem('geo_auth_token', authToken);
  localStorage.setItem('geo_auth_user', JSON.stringify(authUser));
  updateAuthUI();
  loadLists().then(function() {
    if (typeof processPendingShareToken === 'function') {
      processPendingShareToken();
    }
  });
  if (currentParcel) checkParcelSaved();
}

function signOut() {
  authUser = null;
  authToken = null;
  localStorage.removeItem('geo_auth_token');
  localStorage.removeItem('geo_auth_user');
  userLists = [];
  renderLists();
  closeUserMenu();
  updateAuthUI();
  if (window.google && google.accounts) {
    google.accounts.id.disableAutoSelect();
  }
}

function toggleUserMenu() {
  document.getElementById('userMenu').classList.toggle('hidden');
}

function closeUserMenu() {
  document.getElementById('userMenu').classList.add('hidden');
}

function handleAuthClick() {
  if (authUser) {
    toggleUserMenu();
    return;
  }
  var container = document.getElementById('googleSignInDiv');
  var gBtn = container && (container.querySelector('[role="button"]') || container.querySelector('div[style]'));
  if (gBtn) {
    gBtn.click();
  } else if (window.google && google.accounts) {
    google.accounts.id.prompt();
  }
}

function updateAuthUI() {
  var mobileIcon = document.getElementById('authBtnIcon');
  var mobileAvatar = document.getElementById('authBtnAvatar');
  var desktopIcon = document.getElementById('authBtnDesktopIcon');
  var desktopAvatar = document.getElementById('authBtnDesktopAvatar');
  var desktopText = document.getElementById('authBtnDesktopText');
  var listAuthPrompt = document.getElementById('listAuthPrompt');
  var parcelListWrap = document.getElementById('parcelListWrap');

  if (authUser) {
    mobileIcon.style.display = 'none';
    mobileAvatar.src = authUser.picture;
    mobileAvatar.style.display = 'block';
    desktopIcon.style.display = 'none';
    desktopAvatar.src = authUser.picture;
    desktopAvatar.style.display = 'block';
    desktopText.textContent = authUser.name.split(' ')[0];
    listAuthPrompt.style.display = 'none';
    parcelListWrap.style.display = 'block';
    document.getElementById('userMenuAvatar').src = authUser.picture;
    document.getElementById('userMenuName').textContent = authUser.name;
    document.getElementById('userMenuEmail').textContent = authUser.email;
  } else {
    mobileIcon.style.display = '';
    mobileAvatar.style.display = 'none';
    desktopIcon.style.display = '';
    desktopAvatar.style.display = 'none';
    desktopText.textContent = 'Sign in';
    listAuthPrompt.style.display = '';
    parcelListWrap.style.display = 'none';
  }
}

function restoreSession() {
  var token = localStorage.getItem('geo_auth_token');
  var user = localStorage.getItem('geo_auth_user');
  if (token && user) {
    try {
      authUser = JSON.parse(user);
      var payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp * 1000 > Date.now()) {
        authToken = token;
      }
      updateAuthUI();
      return true;
    } catch (e) {
      authUser = null;
      authToken = null;
      localStorage.removeItem('geo_auth_token');
      localStorage.removeItem('geo_auth_user');
    }
  }
  return false;
}

function initGoogleSignIn() {
  if (!window.google || !google.accounts) {
    setTimeout(initGoogleSignIn, 200);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: onSignIn,
    auto_select: true,
  });
  var container = document.getElementById('googleSignInDiv');
  if (container) {
    google.accounts.id.renderButton(container, {
      type: 'standard',
      size: 'large',
      theme: 'filled_black',
      text: 'signin_with',
      width: 250,
    });
  }
  var listContainer = document.getElementById('googleSignInList');
  if (listContainer) {
    google.accounts.id.renderButton(listContainer, {
      type: 'standard',
      size: 'large',
      theme: 'filled_black',
      text: 'signin_with',
      width: 250,
    });
  }
  if (!authToken) {
    google.accounts.id.prompt();
  }
}
