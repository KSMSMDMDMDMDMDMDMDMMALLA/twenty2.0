function isAdmin(userId, adminIds) {
  return adminIds.includes(userId);
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0) parts.push(`${minutes}м`);
  if (secs > 0 && hours === 0) parts.push(`${secs}с`);

  return parts.length ? parts.join(" ") : `${seconds}с`;
}

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function htmlEscape(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = {
  isAdmin,
  formatDuration,
  nowTs,
  htmlEscape
};