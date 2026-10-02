import { Logger } from '../logger.js';

/**
 * SupabaseService
 *
 * Handles lightweight REST API calls to your Supabase backend.
 * All network calls are wrapped to fail silently on browsers like Vivaldi
 * that block external requests via tracker/ad protection.
 */
export class SupabaseService {
    static URL = 'https://cedegzffqtargiahclbg.supabase.co';
    static ANON_KEY = 'sb_publishable_k483VtXa4bixwE9EzZnphg_n_7EpntM';
    static APP_SECRET = 'EvenTrade_Ext_Sec_v1_9x!LpQ';

    static isConfigured() {
        return this.URL !== '' && this.ANON_KEY !== '';
    }

    static async request(endpoint, options = {}) {
        if (!this.isConfigured()) {
            throw new Error('Supabase not configured. Please set the URL and ANON_KEY.');
        }

        const url = `${this.URL}/rest/v1${endpoint}`;
        const userId = await this.getUserId();

        const headers = {
            'apikey': this.ANON_KEY,
            'Authorization': `Bearer ${this.ANON_KEY}`,
            'x-app-secret': this.APP_SECRET,
            'x-user-id': userId,
            ...options.headers
        };

        const config = { ...options, headers };

        try {
            const response = await fetch(url, config);
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`API Error: ${response.status} - ${error}`);
            }
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        } catch (error) {
            // Silent fail for network errors (Vivaldi blocker, offline, etc.)
            Logger.warn(`[Supabase] Request failed (non-critical): ${error.message}`);
            return null;
        }
    }

    static async uploadImage(blob, fileName) {
        if (!this.isConfigured()) return null;

        const url = `${this.URL}/storage/v1/object/feedback_uploads/${fileName}`;

        try {
            const userId = await this.getUserId();
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'apikey': this.ANON_KEY,
                    'Authorization': `Bearer ${this.ANON_KEY}`,
                    'x-app-secret': this.APP_SECRET,
                    'x-user-id': userId,
                    'Content-Type': blob.type,
                },
                body: blob
            });

            if (!response.ok) throw new Error(await response.text());
            return `${this.URL}/storage/v1/object/public/feedback_uploads/${fileName}`;
        } catch (error) {
            Logger.warn(`[Supabase] Image upload failed (non-critical): ${error.message}`);
            return null;
        }
    }

    static async submitFeedback(payload) {
        return this.request('/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            body: JSON.stringify(payload)
        });
    }

    // Fire-and-forget analytics — never throws
    static logEvent(eventName, eventData = {}) {
        this.getUserId().then(userId => {
            this.request('/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ user_id: userId, event_name: eventName, event_data: eventData })
            }).catch(() => {});
        }).catch(() => {});
    }

    static async getUserTickets(userId) {
        return this.request(`/feedback?user_id=eq.${userId}&order=created_at.desc`);
    }

    static async getTicketMessages(ticketId) {
        return this.request(`/messages?feedback_id=eq.${ticketId}&order=created_at.asc`);
    }

    static async submitMessage(payload) {
        return this.request('/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            body: JSON.stringify(payload)
        });
    }

    static async checkUnreadTickets(userId) {
        return this.request(`/feedback?user_id=eq.${userId}&unread_by_user=eq.true&select=id`, {
            method: 'GET',
            headers: { 'Prefer': 'count=exact' }
        });
    }

    static async markTicketRead(ticketId) {
        return this.request(`/feedback?id=eq.${ticketId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ unread_by_user: false })
        });
    }

    static async getUserId() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['etAnonUserId'], (syncRes) => {
                if (syncRes.etAnonUserId) {
                    chrome.storage.local.set({ etAnonUserId: syncRes.etAnonUserId });
                    resolve(syncRes.etAnonUserId);
                } else {
                    chrome.storage.local.get(['etAnonUserId'], (localRes) => {
                        if (localRes.etAnonUserId) {
                            chrome.storage.sync.set({ etAnonUserId: localRes.etAnonUserId });
                            resolve(localRes.etAnonUserId);
                        } else {
                            const newId = crypto.randomUUID();
                            chrome.storage.sync.set({ etAnonUserId: newId });
                            chrome.storage.local.set({ etAnonUserId: newId }, () => resolve(newId));
                        }
                    });
                }
            });
        });
    }
}
