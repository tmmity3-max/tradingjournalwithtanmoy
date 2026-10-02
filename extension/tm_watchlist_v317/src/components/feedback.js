import { Logger } from '../logger.js';
import { SupabaseService } from '../services/supabase.js';
import { Store } from '../store.js';

export const FeedbackComponent = {
    render(area, sidebarInstance) {
        const div = document.createElement('div');
        div.style.padding = '15px';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.height = '100%';
        div.style.boxSizing = 'border-box';

        div.innerHTML = `
        <style>
            .fb-tabs { display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid var(--et-border, #e0e0e0); }
            .fb-tab { padding: 8px 12px; cursor: pointer; border-bottom: 2px solid transparent; font-weight: 600; font-size: 13px; color: var(--et-fg); opacity: 0.6; }
            .fb-tab.active { opacity: 1; border-bottom-color: var(--et-accent, #2196f3); color: var(--et-accent, #2196f3); }
            .fb-pane { display: none; flex-direction: column; gap: 10px; }
            .fb-pane.active { display: flex; }
            
            /* Form elements */
            .fb-label { font-size: 12px; font-weight: 600; margin-bottom: 4px; display: block; color: var(--et-fg); }
            .fb-input, .fb-select { width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--et-border, #e0e0e0); background: var(--et-bg, #ffffff); color: var(--et-fg, #333333); font-family: inherit; }
            .fb-textarea { width: 100%; height: 100px; padding: 8px; border-radius: 4px; border: 1px solid var(--et-border, #e0e0e0); background: var(--et-bg, #ffffff); color: var(--et-fg, #333333); font-family: inherit; resize: vertical; }
            .fb-checkbox-wrapper { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-top: 5px; cursor: pointer; }
            
            /* Tickets List */
            .ticket-list { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 400px; }
            .ticket-card { border: 1px solid var(--et-border, #e0e0e0); border-radius: 6px; padding: 10px; background: var(--et-row-hover, #f5f5f5); cursor: pointer; }
            .ticket-card:hover { border-color: var(--et-accent, #2196f3); }
            .ticket-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
            .ticket-type { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #888; }
            .ticket-status { font-size: 10px; padding: 2px 6px; border-radius: 12px; font-weight: bold; }
            .status-open { background: #ffe0b2; color: #e65100; }
            .status-resolved { background: #c8e6c9; color: #1b5e20; }
            .ticket-desc { font-size: 12px; color: var(--et-fg); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
            
            /* Unread Badge */
            .unread-dot { display: inline-block; width: 8px; height: 8px; background: #f44336; border-radius: 50%; margin-left: 5px; }
            
            /* Chat Threading */
            .msg-thread { margin-top: 15px; border-top: 1px solid var(--et-border, #e0e0e0); padding-top: 10px; display: flex; flex-direction: column; gap: 10px; }
            .msg-bubble { padding: 10px; border-radius: 6px; font-size: 13px; line-height: 1.4; }
            .msg-dev { background: var(--et-highlight-bg, rgba(33,150,243,0.1)); border-left: 3px solid var(--et-accent, #2196f3); }
            .msg-user { background: var(--et-bg, #ffffff); border: 1px solid var(--et-border, #e0e0e0); }
            .msg-header { font-size: 11px; font-weight: bold; margin-bottom: 4px; display: flex; justify-content: space-between; }
        </style>

        <div class="fb-tabs">
            <div class="fb-tab active" data-target="submit-pane">Submit Ticket</div>
            <div class="fb-tab" data-target="tickets-pane">My Tickets</div>
            <div class="fb-tab" data-target="faq-pane">FAQ</div>
        </div>

        <div id="submit-pane" class="fb-pane active">
            <div>
                <label class="fb-label">Issue Type</label>
                <select id="fb-type" class="fb-select">
                    <option value="bug">Bug Report</option>
                    <option value="feature">Feature Request</option>
                    <option value="other">Other</option>
                </select>
            </div>
            
            <div>
                <label class="fb-label">Description</label>
                <textarea id="fb-desc" class="fb-textarea" placeholder="Describe the issue or feature you would like..."></textarea>
            </div>
            
            <div>
                <label class="fb-label">Email</label>
                <div style="font-size: 10px; color: #888; margin-bottom: 4px;">Provide your email so we can reach out directly with a solution.</div>
                <input id="fb-email" type="email" class="fb-input" placeholder="you@gmail.com">
            </div>

            <label class="fb-checkbox-wrapper">
                <input type="checkbox" id="fb-logs" checked>
                Attach diagnostic logs for debugging
            </label>

            <button id="btn-submit-feedback" class="btn-primary" style="margin-top: 10px;">Submit Feedback</button>
            <div id="fb-status-msg" class="status-msg" style="display:none; text-align: left; margin-top: 5px;"></div>
        </div>

        <div id="tickets-pane" class="fb-pane">
            <div id="tickets-loading" style="font-size: 12px; color: #888;">Loading tickets...</div>
            <div id="tickets-list" class="ticket-list" style="display:none;"></div>
        </div>

        <div id="faq-pane" class="fb-pane">
            <div style="font-size: 13px; font-weight: 600; color: var(--et-fg); margin-bottom: 5px;">Help & Support</div>
            <div style="font-size: 12px; margin-bottom: 12px; padding: 10px; background: rgba(33, 150, 243, 0.1); border-radius: 4px; border: 1px solid var(--et-accent);">
                <strong>Contact Support</strong><br>
                For immediate assistance or business inquiries, email us at: <a href="mailto:ranjan.easebit@gmail.com" style="color: var(--et-accent); font-weight: bold;">ranjan.easebit@gmail.com</a>
            </div>
            <div style="font-size: 13px; font-weight: 600; color: var(--et-fg); margin-bottom: 5px;">Frequently Asked Questions</div>
            <div style="font-size: 12px; margin-bottom: 12px;">
                <strong>Why are some stocks crossed out?</strong><br>
                Stocks outside NSE/BSE are not supported by Screener.in or Zerodha. They are disabled on those platforms but work on TradingView.
            </div>
            <div style="font-size: 12px; margin-bottom: 12px;">
                <strong>How do I sync watchlists across devices?</strong><br>
                Watchlists sync automatically if Chrome Sync is enabled and you are logged into the same Google account.
            </div>
            <div style="font-size: 12px;">
                <strong>Can I export my watchlists?</strong><br>
                Yes, open Settings > Data Management > Backup All. This downloads a CSV file.
            </div>
        </div>
    `;

        // Tab switching logic
        const tabs = div.querySelectorAll('.fb-tab');
        const panes = div.querySelectorAll('.fb-pane');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                panes.forEach(p => p.classList.remove('active'));

                tab.classList.add('active');
                div.querySelector(`#${tab.dataset.target}`).classList.add('active');

                if (tab.dataset.target === 'tickets-pane') {
                    FeedbackComponent.loadTickets(div);
                }
            });
        });

        // Submit Logic
        const btnSubmit = div.querySelector('#btn-submit-feedback');
        const statusMsg = div.querySelector('#fb-status-msg');

        btnSubmit.addEventListener('click', async () => {
            const type = div.querySelector('#fb-type').value;
            const desc = div.querySelector('#fb-desc').value.trim();
            const email = div.querySelector('#fb-email').value.trim();
            const attachLogs = div.querySelector('#fb-logs').checked;

            if (!desc) {
                statusMsg.textContent = "Please provide a description.";
                statusMsg.style.color = "var(--et-red, #f44336)";
                statusMsg.style.display = "block";
                return;
            }

            if (!SupabaseService.isConfigured()) {
                statusMsg.textContent = "Supabase not configured. Cannot submit.";
                statusMsg.style.color = "var(--et-red, #f44336)";
                statusMsg.style.display = "block";
                return;
            }

            btnSubmit.disabled = true;
            btnSubmit.textContent = "Submitting...";
            statusMsg.style.display = "none";

            try {
                let imageUrl = null;
                let logUrl = null;

                // 1. Capture and Upload Logs if requested
                if (attachLogs) {
                    const logs = Logger.getLogs();
                    if (logs) {
                        statusMsg.textContent = "Uploading logs...";
                        statusMsg.style.color = "var(--et-fg)";
                        statusMsg.style.display = "block";
                        try {
                            const blob = new Blob([logs], { type: 'text/plain' });
                            const fileName = `logs_${Date.now()}.txt`;
                            logUrl = await SupabaseService.uploadImage(blob, fileName);
                        } catch (e) {
                            Logger.error("Failed to upload logs: " + e.message);
                        }
                    }
                }

                statusMsg.textContent = "Submitting ticket...";

                // 2. Insert DB Row
                const userId = await SupabaseService.getUserId();
                const payload = {
                    user_id: userId,
                    type: type,
                    description: desc,
                    email: email || null,
                    url_context: window.location.href,
                    image_url: null,
                    log_url: logUrl,
                    extension_version: chrome.runtime.getManifest().version,
                    status: 'open',
                    unread_by_user: false
                };

                await SupabaseService.submitFeedback(payload);

                // 3. Success
                statusMsg.textContent = "Feedback submitted successfully!";
                statusMsg.style.color = "var(--et-green, #4caf50)";
                div.querySelector('#fb-desc').value = '';
                chrome.storage.local.set({ hasOpenTickets: true });

                setTimeout(() => {
                    statusMsg.style.display = 'none';
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = "Submit Feedback";
                    // Switch to tickets pane
                    div.querySelector('[data-target="tickets-pane"]').click();
                }, 2000);

            } catch (error) {
                btnSubmit.disabled = false;
                btnSubmit.textContent = "Submit Feedback";
                statusMsg.textContent = `Error: ${error.message}`;
                statusMsg.style.color = "var(--et-red, #f44336)";
            }
        });

        area.appendChild(div);
    },

    async loadTickets(div) {
        if (!SupabaseService.isConfigured()) {
            div.querySelector('#tickets-loading').textContent = "Supabase not configured.";
            return;
        }

        div.querySelector('#tickets-loading').style.display = 'block';
        div.querySelector('#tickets-list').style.display = 'none';

        try {
            const userId = await SupabaseService.getUserId();
            const tickets = await SupabaseService.getUserTickets(userId);

            const list = div.querySelector('#tickets-list');
            list.innerHTML = '';

            if (!tickets || tickets.length === 0) {
                div.querySelector('#tickets-loading').textContent = "No tickets found.";
                chrome.storage.local.set({ hasOpenTickets: false });
                return;
            }

            const hasOpen = tickets.some(t => t.status === 'open');
            chrome.storage.local.set({ hasOpenTickets: hasOpen });

            tickets.forEach(ticket => {
                const card = document.createElement('div');
                card.className = 'ticket-card';

                const statusClass = ticket.status === 'resolved' ? 'status-resolved' : 'status-open';
                const statusText = ticket.status === 'resolved' ? 'Resolved' : 'Open';

                let unreadBadge = ticket.unread_by_user ? '<span class="unread-dot" title="New Response"></span>' : '';

                card.innerHTML = `
                  <div class="ticket-header">
                      <span class="ticket-type">${ticket.type} ${unreadBadge}</span>
                      <span class="ticket-status ${statusClass}">${statusText}</span>
                  </div>
                  <div class="ticket-desc">${this.escapeHtml(ticket.description)}</div>
              `;

                card.onclick = () => {
                    this.showTicketDetails(div, ticket);
                };

                list.appendChild(card);
            });

            div.querySelector('#tickets-loading').style.display = 'none';
            list.style.display = 'flex';

        } catch (err) {
            Logger.error("Failed to load tickets: " + err.message);
            div.querySelector('#tickets-loading').textContent = "Failed to load tickets.";
        }
    },

    async showTicketDetails(div, ticket) {
        // Very simple view change (we reuse the tickets pane)
        const list = div.querySelector('#tickets-list');
        const detailView = document.createElement('div');

        const imageHtml = ticket.image_url
            ? `<div style="margin-top:10px;"><a href="${ticket.image_url}" target="_blank" style="color:var(--et-accent); font-size:12px;">View Attached Screenshot</a></div>`
            : '';

        const logHtml = ticket.log_url
            ? `<div style="margin-top:5px;"><a href="${ticket.log_url}" target="_blank" style="color:var(--et-accent); font-size:12px;">View Attached Logs</a></div>`
            : '';

        detailView.innerHTML = `
          <button class="btn-primary" id="btn-back-tickets" style="font-size:11px; padding:4px 8px; margin-bottom:15px; background:transparent; color:var(--et-fg); border:1px solid var(--et-border);">← Back</button>
          
          <div style="font-size:11px; color:#888; text-transform:uppercase; font-weight:bold;">${ticket.type}</div>
          <div style="font-size:14px; margin-top:5px; line-height:1.4;">${this.escapeHtml(ticket.description)}</div>
          
          ${imageHtml}
          ${logHtml}
          
          <div class="msg-thread" id="thread-container">
             <div style="font-size: 11px; color: #888;">Loading thread...</div>
          </div>

          <div style="margin-top: 15px;">
              <textarea id="reply-text" class="fb-textarea" placeholder="Type a reply..." style="height: 60px;"></textarea>
              <button id="btn-send-reply" class="btn-primary" style="margin-top: 5px; padding: 6px 12px; font-size: 12px;">Send Reply</button>
          </div>
      `;

        detailView.querySelector('#btn-back-tickets').onclick = () => {
            detailView.remove();
            list.style.display = 'flex'; // show list again
        };

        const threadContainer = detailView.querySelector('#thread-container');
        const replyBtn = detailView.querySelector('#btn-send-reply');
        const replyText = detailView.querySelector('#reply-text');

        // Render previous fallback developer_response if it exists (for old tickets)
        let threadHtml = '';
        if (ticket.developer_response) {
             threadHtml += `
                 <div class="msg-bubble msg-dev">
                    <div class="msg-header"><span>Developer</span></div>
                    <div>${this.escapeHtml(ticket.developer_response)}</div>
                 </div>
             `;
        }

        list.style.display = 'none'; // hide list
        div.querySelector('#tickets-pane').appendChild(detailView);

        // Fetch thread messages from Database
        try {
            const messages = await SupabaseService.getTicketMessages(ticket.id);
            if (messages && messages.length > 0) {
                messages.forEach(msg => {
                    const isDev = msg.sender_type === 'developer';
                    const cssClass = isDev ? 'msg-dev' : 'msg-user';
                    const sender = isDev ? 'Developer' : 'You';
                    const date = new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    
                    threadHtml += `
                         <div class="msg-bubble ${cssClass}">
                            <div class="msg-header"><span>${sender}</span><span style="font-weight:normal;opacity:0.7;">${date}</span></div>
                            <div style="white-space: pre-wrap;">${this.escapeHtml(msg.content)}</div>
                         </div>
                    `;
                });
            }
            threadContainer.innerHTML = threadHtml || '<div style="font-size: 11px; color: #888; text-align: center; margin-top: 10px;">No replies yet.</div>';
        } catch (err) {
            threadContainer.innerHTML = `<div style="font-size: 11px; color: var(--et-red);">Error loading thread.</div>`;
        }

        // Clear unread status if it was unread
        if (ticket.unread_by_user) {
            SupabaseService.markTicketRead(ticket.id).catch(e => Logger.warn("Failed marking read: " + e.message));
            ticket.unread_by_user = false;
            
            // Clear global local cache to immediately wipe the red dot badge globally
            chrome.storage.local.remove(['etUnreadCache']);
            const sidebarHost = document.getElementById('et-sidebar-host');
            if (sidebarHost) {
                sidebarHost.classList.remove('has-unread');
                const badge = sidebarHost.shadowRoot.getElementById('unread-badge');
                if (badge) badge.style.display = 'none';
            }
        }

        // Handle sending new reply
        replyBtn.onclick = async () => {
            const content = replyText.value.trim();
            if (!content) return;

            replyBtn.disabled = true;
            replyBtn.textContent = 'Sending...';

            try {
                await SupabaseService.submitMessage({
                    feedback_id: ticket.id,
                    sender_type: 'user',
                    content: content
                });

                replyText.value = '';
                replyBtn.textContent = 'Sent!';
                
                // Optimistically append message
                const threadContent = threadContainer.innerHTML.includes('No replies yet') ? '' : threadContainer.innerHTML;
                threadContainer.innerHTML = threadContent + `
                     <div class="msg-bubble msg-user" style="opacity: 0.8;">
                        <div class="msg-header"><span>You</span><span style="font-weight:normal;opacity:0.7;">Just now</span></div>
                        <div style="white-space: pre-wrap;">${this.escapeHtml(content)}</div>
                     </div>
                `;

                setTimeout(() => {
                    replyBtn.disabled = false;
                    replyBtn.textContent = 'Send Reply';
                }, 1500);

            } catch (err) {
                Logger.error("Failed to send message: " + err.message);
                replyBtn.textContent = 'Error!';
                setTimeout(() => {
                    replyBtn.disabled = false;
                    replyBtn.textContent = 'Send Reply';
                }, 2000);
            }
        };

        // Implementation requires adding an UPDATE endpoint to SupabaseService if marking unread=false
    },

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};
