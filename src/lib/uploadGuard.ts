// Tells the rest of the app that an upload batch is running, so menus do not navigate away and break it.
let active = false;

export function setUploadGuard(on: boolean) {
  active = on;
}

// Call before navigating. Returns true when navigation must be skipped (and tells the upload page to show a note).
export function blockedByUpload(): boolean {
  if (!active) return false;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('upload-guard-blocked'));
  return true;
}
