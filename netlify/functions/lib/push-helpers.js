
// netlify/functions/lib/push-helpers.js
//
// Shared Web Push helpers used by both send-notification.js (on-demand
// pushes triggered from the app) and scheduled-reminders.js (the cron
// job). Subscriptions are stored in the same Netlify Blobs store that
// data.js uses for everything else, under one key holding an array.
//
// Requires these environment variables (Netlify Site settings ->
// Environment variables), generated once with `npx web-push generate-vapid-keys`:
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT (optional — e.g. "mailto:you@example.com")
//
// Until VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are set, vapidConfigured()
// returns false and send-notification.js no-ops safely instead of
// crashing the app.

import { getStore } from "@netlify/blobs";
import webpush from "web-push";

const DATA_STORE = "ms-villa-data";
const SUBSCRIPTIONS_KEY = "ms-villa:push-subscriptions";

function store() {
  return getStore(DATA_STORE);
}

export function vapidConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configureWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function readSubscriptions() {
  const list = await store().get(SUBSCRIPTIONS_KEY, { type: "json" }).catch(() => null);
  return Array.isArray(list) ? list : [];
}

async function writeSubscriptions(list) {
  await store().setJSON(SUBSCRIPTIONS_KEY, list);
}

// Saves (or updates) a subscription for a given username. Keyed by
// endpoint so re-subscribing on the same device/browser doesn't create
// duplicates.
export async function saveSubscription(username, subscription) {
  if (!subscription || !subscription.endpoint) return;
  const list = await readSubscriptions();
  const filtered = list.filter((s) => s.subscription?.endpoint !== subscription.endpoint);
  filtered.push({ username: username || null, subscription, savedAt: new Date().toISOString() });
  await writeSubscriptions(filtered);
}

export async function removeSubscription(endpoint) {
  if (!endpoint) return;
  const list = await readSubscriptions();
  const filtered = list.filter((s) => s.subscription?.endpoint !== endpoint);
  await writeSubscriptions(filtered);
}

// Sends a push to every stored subscription (optionally skipping one
// username — typically the person who triggered the action). Prunes
// subscriptions that the push service reports as gone (410/404), which
// happens when someone uninstalls the PWA or clears site data.
export async function sendToAll({ title, body, data, excludeUsername }) {
  if (!vapidConfigured()) {
    return { sent: 0, failed: 0, reason: "VAPID keys not configured." };
  }
  configureWebPush();

  const list = await readSubscriptions();
  const targets = list.filter((s) => !excludeUsername || s.username !== excludeUsername);

  const payload = JSON.stringify({ title, body, data: data || {} });

  let sent = 0;
  let failed = 0;
  const stale = [];

  await Promise.all(
    targets.map(async (entry) => {
      try {
        await webpush.sendNotification(entry.subscription, payload);
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 404 || err.statusCode === 410) {
          stale.push(entry.subscription.endpoint);
        }
      }
    })
  );

  if (stale.length) {
    const remaining = list.filter((s) => !stale.includes(s.subscription?.endpoint));
    await writeSubscriptions(remaining);
  }

  return { sent, failed, total: targets.length };
}
